// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — sync 2-way TPOS.
// =====================================================================
// LiveCampaignApi — TPOS OData wrapper cho web2/live-campaign
// =====================================================================
// - Mọi method gọi trực tiếp TPOS qua CF Worker proxy
// - Không có local cache; trang load realtime từ TPOS mỗi lần
// - Auth: window.tokenManager.authenticatedFetch (auto-inject Bearer)
// =====================================================================

(function () {
    'use strict';

    const PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = PROXY + '/api/odata/SaleOnline_LiveCampaign';
    const CRM_TEAMS_URL = PROXY + '/api/odata/CRMTeam/ODataService.GetAllFacebook?$expand=Childs';
    const LIVE_VIDEO_URL = PROXY + '/api/facebook-graph/livevideo';
    const NATIVE_LOAD_URL = PROXY + '/api/native-orders/load';
    // SheetJS publishes only via cdn.sheetjs.com (official) — jsdelivr/npm dropped support.
    // unpkg/cdnjs still host the legacy 0.18.5 build as fallback.
    const XLSX_CDNS = [
        'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
        'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    ];

    function ensureTokenManager() {
        if (!window.tokenManager || typeof window.tokenManager.authenticatedFetch !== 'function') {
            throw new Error('TokenManager chưa load — refresh trang');
        }
    }

    async function jsonFetch(url, options) {
        ensureTokenManager();
        const opts = options || {};
        opts.headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
        const res = await window.tokenManager.authenticatedFetch(url, opts);
        const contentType = res.headers.get('content-type') || '';
        let body = null;
        if (contentType.includes('json')) {
            try {
                body = await res.json();
            } catch (_) {
                body = null;
            }
        } else if (res.status !== 204) {
            try {
                body = await res.text();
            } catch (_) {
                body = null;
            }
        }
        if (!res.ok) {
            const msg =
                (body && body.error && body.error.message) ||
                (typeof body === 'string' ? body.slice(0, 200) : null) ||
                `HTTP ${res.status}`;
            const err = new Error(msg);
            err.status = res.status;
            err.body = body;
            throw err;
        }
        return body;
    }

    /**
     * List campaigns with TPOS-style filter + pagination.
     * @param {Object} opts
     * @param {number} opts.top - page size (default 20)
     * @param {number} opts.skip - offset
     * @param {string} opts.orderby - eg "DateCreated desc"
     * @param {string} opts.search - substring matched against Name
     * @param {string} opts.status - 'all' | 'active' | 'inactive'
     * @param {string} opts.dateFrom - yyyy-mm-dd
     * @param {string} opts.dateTo - yyyy-mm-dd
     * @returns {Promise<{ value: Array, count: number }>}
     */
    async function list(opts) {
        const o = opts || {};
        const params = new URLSearchParams();
        params.set('$top', String(o.top || 20));
        params.set('$skip', String(o.skip || 0));
        params.set('$orderby', o.orderby || 'DateCreated desc');
        params.set('$count', 'true');

        const filters = [];
        if (o.search && o.search.trim()) {
            // Escape single quotes for OData literal
            const esc = o.search.trim().replace(/'/g, "''");
            filters.push(`contains(Name,'${esc}')`);
        }
        if (o.status === 'active') filters.push('IsActive eq true');
        else if (o.status === 'inactive') filters.push('IsActive eq false');
        if (o.dateFrom) {
            const from = new Date(o.dateFrom + 'T00:00:00+07:00').toISOString();
            filters.push(`DateCreated ge ${from}`);
        }
        if (o.dateTo) {
            const to = new Date(o.dateTo + 'T23:59:59+07:00').toISOString();
            filters.push(`DateCreated le ${to}`);
        }
        if (filters.length) params.set('$filter', filters.join(' and '));

        const url = `${BASE}?${params.toString()}`;
        const data = await jsonFetch(url, { method: 'GET' });
        return {
            value: Array.isArray(data && data.value) ? data.value : [],
            count: data && data['@odata.count'] != null ? data['@odata.count'] : 0,
        };
    }

    // List Facebook pages user có quyền (qua CRMTeam tree). Flatten ra
    // {pageId, pageName, teamId, teamName}. Cache 5 min in-memory.
    let _pagesCache = null;
    let _pagesCacheAt = 0;
    const PAGES_TTL = 5 * 60 * 1000;
    async function loadPages() {
        if (_pagesCache && Date.now() - _pagesCacheAt < PAGES_TTL) return _pagesCache;
        const data = await jsonFetch(CRM_TEAMS_URL, { method: 'GET' });
        const teams = Array.isArray(data && data.value) ? data.value : [];
        const out = [];
        for (const team of teams) {
            const childs = Array.isArray(team.Childs) ? team.Childs : [];
            for (const c of childs) {
                if (c.Facebook_PageId && c.Facebook_TypeId === 'Page') {
                    out.push({
                        pageId: c.Facebook_PageId,
                        pageName: c.Facebook_PageName || c.Name || c.Facebook_PageId,
                        teamId: team.Id,
                        teamName: team.Name || '',
                    });
                }
            }
        }
        _pagesCache = out;
        _pagesCacheAt = Date.now();
        return out;
    }

    // Live videos của 1 page (qua TPOS facebook-graph proxy). Trả mới nhất trước.
    // Cache 1 min per pageId.
    const _liveVideoCache = new Map(); // pageId → {videos, fetchedAt}
    const LIVE_VIDEO_TTL = 60 * 1000;
    async function loadLiveVideos(pageId, limit) {
        if (!pageId) return [];
        const cached = _liveVideoCache.get(pageId);
        if (cached && Date.now() - cached.fetchedAt < LIVE_VIDEO_TTL) return cached.videos;
        const url = `${LIVE_VIDEO_URL}?pageid=${encodeURIComponent(pageId)}&limit=${limit || 20}&facebook_Type=page`;
        const data = await jsonFetch(url, { method: 'GET' });
        // TPOS shape: { data: [...] } when direct, or { data: { data: [...] } } via Render wrapper
        const raw = (data && data.data && (data.data.data || data.data)) || [];
        const videos = (Array.isArray(raw) ? raw : []).map((v) => ({
            objectId: v.objectId,
            title: v.title || '',
            startMs: v.channelCreatedTime ? new Date(v.channelCreatedTime).getTime() : null,
            statusLive: v.statusLive,
            countComment: v.countComment || 0,
            thumbnail: v.thumbnail && v.thumbnail.url ? v.thumbnail.url : null,
        }));
        _liveVideoCache.set(pageId, { videos, fetchedAt: Date.now() });
        return videos;
    }

    async function getOne(id) {
        const url = `${BASE}(${encodeURIComponent(id)})`;
        return await jsonFetch(url, { method: 'GET' });
    }

    /**
     * Create — POST to base endpoint.
     * @param {{Name: string, Note?: string, IsActive?: boolean, Facebook_UserName?: string, Facebook_UserId?: string, Facebook_LiveId?: string}} payload
     */
    async function create(payload) {
        if (!payload || !payload.Name || !payload.Name.trim()) {
            throw new Error('Tên chiến dịch không được trống');
        }
        const body = {
            Name: payload.Name.trim(),
            Note: payload.Note ? String(payload.Note).trim() : null,
            IsActive: payload.IsActive !== false,
            Facebook_UserName: payload.Facebook_UserName || null,
            Facebook_UserId: payload.Facebook_UserId || null,
            Facebook_LiveId: payload.Facebook_LiveId || null,
            Config: payload.Config || 'Draft',
            MinAmountDeposit: payload.MinAmountDeposit || 0,
            MaxAmountDepositRequired: payload.MaxAmountDepositRequired || 0,
            Details: [],
        };
        return await jsonFetch(BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json;odata.metadata=minimal' },
            body: JSON.stringify(body),
        });
    }

    /**
     * Update via PUT — TPOS requires full body. We GET first, mutate, then PUT.
     * @param {string} id
     * @param {Partial<Object>} patch - fields to override on the existing record
     */
    async function update(id, patch) {
        const current = await getOne(id);
        const merged = Object.assign({}, current, patch || {});
        // Strip @odata.* metadata keys
        const body = {};
        for (const k of Object.keys(merged)) {
            if (!k.startsWith('@odata')) body[k] = merged[k];
        }
        // TPOS PUT requires Details array; default to [] if missing
        if (!Array.isArray(body.Details)) body.Details = [];
        const url = `${BASE}(${encodeURIComponent(id)})`;
        await jsonFetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json;odata.metadata=minimal' },
            body: JSON.stringify(body),
        });
        // PUT returns 204; fetch fresh state for callers
        return await getOne(id);
    }

    async function setActive(id, isActive) {
        return await update(id, { IsActive: !!isActive });
    }

    async function remove(id) {
        const url = `${BASE}(${encodeURIComponent(id)})`;
        await jsonFetch(url, { method: 'DELETE' });
        return { Id: id, deleted: true };
    }

    // ── Excel export (client-side, từ native-orders) ────────────────────
    // Thay vì gọi TPOS `/SaleOnline_Order/ExportFile`, build xlsx client-side
    // bằng SheetJS từ dữ liệu Đơn Web (`native_orders.live_campaign_id`).
    // Format cột bám sát file TPOS trả: STT, ###, Kênh, Mã, Facebook, Email,
    // Tên, Trạng thái khách hàng, Điện thoại, Nhà mạng, Địa chỉ, Tổng tiền,
    // Trạng thái, Ngày tạo, Sản phẩm, Tổng số lượng SP, Nhân viên, Ghi chú,
    // Nhãn (19 cột, A..S).

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('script load failed: ' + src));
            document.head.appendChild(s);
        });
    }

    async function loadSheetJS() {
        if (window.XLSX) return window.XLSX;
        let lastErr = null;
        for (const cdn of XLSX_CDNS) {
            try {
                await loadScript(cdn);
                if (window.XLSX) return window.XLSX;
            } catch (e) {
                lastErr = e;
            }
        }
        throw new Error(
            'Không tải được SheetJS từ CDN' +
                (lastErr ? ' (' + lastErr.message.slice(0, 80) + ')' : '')
        );
    }

    async function fetchNativeOrdersByCampaign(campaignId) {
        const url = `${NATIVE_LOAD_URL}?campaignIds=${encodeURIComponent(campaignId)}&limit=1000&status=all`;
        const res = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
            throw new Error(`Lỗi tải Đơn Web (HTTP ${res.status})`);
        }
        const data = await res.json();
        return Array.isArray(data && data.orders) ? data.orders : [];
    }

    // Vietnamese mobile prefix → carrier (3-digit). Best-effort, không tuyệt đối.
    const CARRIER_PREFIXES = {
        Viettel: [
            '032',
            '033',
            '034',
            '035',
            '036',
            '037',
            '038',
            '039',
            '086',
            '096',
            '097',
            '098',
        ],
        Mobifone: ['070', '076', '077', '078', '079', '089', '090', '093'],
        Vinaphone: ['081', '082', '083', '084', '085', '088', '091', '094'],
        Vietnamobile: ['052', '056', '058', '092'],
        Gmobile: ['059', '099'],
        iTel: ['087'],
    };
    const PREFIX_TO_CARRIER = (() => {
        const m = {};
        for (const carrier of Object.keys(CARRIER_PREFIXES)) {
            for (const p of CARRIER_PREFIXES[carrier]) m[p] = carrier;
        }
        return m;
    })();

    function detectCarrier(phone) {
        if (!phone) return '';
        const digits = String(phone).replace(/\D/g, '');
        if (digits.length < 3) return '';
        // Normalize +84 / 84 → 0
        const norm =
            digits.startsWith('84') && digits.length >= 11 ? '0' + digits.slice(2) : digits;
        return PREFIX_TO_CARRIER[norm.slice(0, 3)] || '';
    }

    const NATIVE_STATUS_LABEL = {
        draft: 'Nháp',
        confirmed: 'Đơn hàng',
        cancelled: 'Đã hủy',
        cancel: 'Đã hủy',
        done: 'Hoàn thành',
    };

    function formatProductsCell(products) {
        if (!Array.isArray(products) || !products.length) return '';
        return products
            .map((p) => {
                const code = p.code || p.productCode || p.sku || '';
                const name = p.name || p.productName || '';
                const qty = Number(p.quantity || 0);
                const price = Number(p.price || 0);
                const codePart = code ? `[${code}] ` : '';
                const priceStr = price ? price.toLocaleString('vi-VN') : '0';
                return `${codePart}${name} SL: ${qty} Giá: ${priceStr}`;
            })
            .join('\n');
    }

    // Excel serial date number = days since 1899-12-30 (Lotus 1-2-3 leap-year quirk).
    // TPOS uses VN local time interpreted as serial, so we offset to +07:00.
    function excelSerialDate(ms) {
        if (!ms) return '';
        const EPOCH = Date.UTC(1899, 11, 30); // 1899-12-30 UTC
        const local = ms + 7 * 3600 * 1000; // shift to VN local clock
        return (local - EPOCH) / 86400000;
    }

    /**
     * Build và trả Blob xlsx cho 1 campaign từ native_orders.
     * @param {string} campaignId
     * @param {string} [campaignName] - hiển thị ở sheet name
     * @returns {Promise<{ blob: Blob, count: number }>}
     */
    async function exportExcel(campaignId, campaignName) {
        const [XLSX, orders] = await Promise.all([
            loadSheetJS(),
            fetchNativeOrdersByCampaign(campaignId),
        ]);
        if (!orders.length) {
            const err = new Error('Chiến dịch chưa có Đơn Web nào — không có gì để xuất Excel');
            err.code = 'EMPTY';
            err.count = 0;
            throw err;
        }

        const headers = [
            'STT',
            '###',
            'Kênh',
            'Mã',
            'Facebook',
            'Email',
            'Tên',
            'Trạng thái khách hàng',
            'Điện thoại',
            'Nhà mạng',
            'Địa chỉ',
            'Tổng tiền',
            'Trạng thái',
            'Ngày tạo',
            'Sản phẩm',
            'Tổng số lượng SP',
            'Nhân viên',
            'Ghi chú',
            'Nhãn',
        ];

        const titleRow = new Array(headers.length).fill('DANH SÁCH SALE ONLINE');
        const aoa = [titleRow, titleRow.slice(), headers];

        orders.forEach((o, i) => {
            const phone = o.phone || '';
            const tags = Array.isArray(o.tags) ? o.tags.filter(Boolean) : [];
            const statusLabel =
                NATIVE_STATUS_LABEL[String(o.status || '').toLowerCase()] || o.status || '';
            aoa.push([
                i + 1, // A: STT
                o.tposIndex || o.displayStt || '', // B: ###
                // TPOS dùng tên page (Nhi Judy House…) ở cột Kênh, không phải tên campaign.
                o.fbUserName || o.liveCampaignName || '', // C: Kênh
                o.code || '', // D: Mã
                o.fbUserName || '', // E: Facebook
                o.email || '', // F: Email
                o.customerName || '', // G: Tên
                o.partnerStatus || '', // H: Trạng thái KH
                phone, // I: Điện thoại
                detectCarrier(phone), // J: Nhà mạng
                o.address || '', // K: Địa chỉ
                Number(o.totalAmount || 0), // L: Tổng tiền
                statusLabel, // M: Trạng thái
                excelSerialDate(Number(o.createdAt) || 0), // N: Ngày tạo (serial)
                formatProductsCell(o.products), // O: Sản phẩm
                Number(o.totalQuantity || 0), // P: Tổng SL SP
                o.assignedEmployeeName || o.createdByName || '', // Q: Nhân viên
                o.note || '', // R: Ghi chú
                tags.join(', '), // S: Nhãn
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        // Merge title rows (A1:S2)
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 1, c: headers.length - 1 } }];
        ws['!cols'] = [
            { wch: 5 },
            { wch: 6 },
            { wch: 18 },
            { wch: 14 },
            { wch: 18 },
            { wch: 22 },
            { wch: 22 },
            { wch: 18 },
            { wch: 14 },
            { wch: 11 },
            { wch: 38 },
            { wch: 12 },
            { wch: 12 },
            { wch: 18 },
            { wch: 42 },
            { wch: 10 },
            { wch: 14 },
            { wch: 22 },
            { wch: 20 },
        ];
        // Format columns L (Tổng tiền) and N (Ngày tạo)
        for (let r = 3; r < aoa.length; r++) {
            const moneyCell = ws[XLSX.utils.encode_cell({ r, c: 11 })];
            if (moneyCell) moneyCell.z = '#,##0';
            const dateCell = ws[XLSX.utils.encode_cell({ r, c: 13 })];
            if (dateCell && typeof dateCell.v === 'number') dateCell.z = 'dd/mm/yyyy hh:mm';
        }

        const wb = XLSX.utils.book_new();
        const sheetName = (campaignName || 'Sale Online')
            .replace(/[\\\/?*\[\]:]/g, '_')
            .slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sale Online');

        const arrBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob([arrBuf], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        return { blob, count: orders.length };
    }

    window.LiveCampaignApi = {
        list,
        getOne,
        create,
        update,
        setActive,
        remove,
        exportExcel,
        loadPages,
        loadLiveVideos,
    };
})();
