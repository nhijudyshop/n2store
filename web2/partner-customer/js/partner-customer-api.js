// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — sync 2-way TPOS.
// =====================================================================
// PartnerCustomerApi — TPOS OData wrapper cho web2/partner-customer
// =====================================================================
// - Mọi method gọi trực tiếp TPOS qua CF Worker proxy (auto-inject Bearer
//   token bằng window.tokenManager).
// - Không có local cache; mỗi lần load = realtime từ TPOS.
// - Sync 2 chiều "tự nhiên": vì không có DB trung gian, sửa ở Web 2.0 đi
//   thẳng lên TPOS; sửa ở TPOS thì lần Reload sau Web 2.0 thấy ngay.
// =====================================================================

(function () {
    'use strict';

    const PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = PROXY + '/api/odata';
    const PARTNER = BASE + '/Partner';
    const PARTNER_VIEW = PARTNER + '/ODataService.GetViewV2';

    const STATUS_TEXT = {
        Normal: 'Bình thường',
        BomHang: 'Bom hàng',
        Warning: 'Cảnh báo',
        Danger: 'Nguy hiểm',
        VIP: 'VIP',
    };
    const STATUS_VALUES = Object.keys(STATUS_TEXT);

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

    function escapeOData(value) {
        return String(value).replace(/'/g, "''");
    }

    function buildFilter(opts) {
        const filters = ["Type eq 'Customer'"];
        const o = opts || {};
        if (o.status && STATUS_VALUES.includes(o.status)) {
            filters.push(`Status eq '${o.status}'`);
        }
        if (o.active === true || o.active === 'true') {
            filters.push('Active eq true');
        } else if (o.active === false || o.active === 'false') {
            filters.push('Active eq false');
        }
        if (o.email && String(o.email).trim()) {
            filters.push(`contains(Email,'${escapeOData(o.email.trim())}')`);
        }
        if (o.tag && String(o.tag).trim()) {
            filters.push(`Tags/any(t: contains(t/Name,'${escapeOData(o.tag.trim())}'))`);
        }
        if (o.partnerCategoryId) {
            filters.push(`PartnerCategoryId eq ${Number(o.partnerCategoryId)}`);
        }
        return filters.join(' and ');
    }

    /**
     * List partners (Customer only) with TPOS-style filter + pagination.
     * @param {Object} opts
     * @param {number} [opts.top] page size (default 50)
     * @param {number} [opts.skip] offset
     * @param {string} [opts.orderby] eg "DateCreated desc"
     * @param {string} [opts.search] substring matched (Name OR Phone)
     * @param {string} [opts.status] 'Normal' | 'BomHang' | 'Warning' | 'Danger' | 'VIP'
     * @param {boolean|string} [opts.active]
     * @param {string} [opts.email]
     * @param {string} [opts.tag]
     * @param {number} [opts.partnerCategoryId]
     * @returns {Promise<{ value: Array, count: number }>}
     */
    async function list(opts) {
        const o = opts || {};
        const params = new URLSearchParams();
        params.set('$top', String(o.top || 50));
        params.set('$skip', String(o.skip || 0));
        params.set('$orderby', o.orderby || 'DateCreated desc');
        params.set('$count', 'true');
        params.set('Type', 'Customer');
        params.set('Active', 'true');
        if (o.search && o.search.trim()) {
            // GetViewV2 accepts Name= as a server-side substring filter (Name OR Phone)
            params.set('Name', o.search.trim());
        }
        params.set('$filter', buildFilter(o));

        const url = `${PARTNER_VIEW}?${params.toString()}`;
        const data = await jsonFetch(url, { method: 'GET' });
        return {
            value: Array.isArray(data && data.value) ? data.value : [],
            count: data && data['@odata.count'] != null ? data['@odata.count'] : 0,
        };
    }

    /**
     * Fetch counts for each status. Uses 6 cheap $count requests with $top=1
     * (TPOS GetViewV2 ignores $top=0 — returns 0 for @odata.count).
     * @param {string} [search] - keep stats consistent with current search query
     */
    async function getStats(search) {
        const baseFilters = ["Type eq 'Customer'"];
        const buildUrl = (extraFilter) => {
            const params = new URLSearchParams();
            params.set('$top', '1');
            params.set('$count', 'true');
            params.set('Type', 'Customer');
            params.set('Active', 'true');
            if (search && search.trim()) params.set('Name', search.trim());
            const filters = baseFilters.slice();
            if (extraFilter) filters.push(extraFilter);
            params.set('$filter', filters.join(' and '));
            return `${PARTNER_VIEW}?${params.toString()}`;
        };
        const queries = [
            { key: 'all', url: buildUrl(null) },
            ...STATUS_VALUES.map((s) => ({ key: s, url: buildUrl(`Status eq '${s}'`) })),
        ];
        const results = await Promise.all(
            queries.map(async (q) => {
                try {
                    const data = await jsonFetch(q.url, { method: 'GET' });
                    return [q.key, data && data['@odata.count'] != null ? data['@odata.count'] : 0];
                } catch (e) {
                    return [q.key, 0];
                }
            })
        );
        const out = {};
        for (const [k, v] of results) out[k] = v;
        return out;
    }

    async function getOne(id) {
        if (!id && id !== 0) throw new Error('Thiếu Id partner');
        const url = `${PARTNER}(${encodeURIComponent(id)})`;
        return await jsonFetch(url, { method: 'GET' });
    }

    /**
     * Create partner (Customer).
     * Required: Name. Optional: Phone, Email, Street, Status, Active, Comment, …
     */
    async function create(payload) {
        const name = payload && payload.Name && String(payload.Name).trim();
        if (!name) throw new Error('Tên khách hàng không được trống');
        const body = {
            Type: 'Customer',
            Name: name,
            Phone: payload.Phone ? String(payload.Phone).trim() : null,
            Email: payload.Email ? String(payload.Email).trim() : null,
            Street: payload.Street ? String(payload.Street).trim() : null,
            Status: STATUS_VALUES.includes(payload.Status) ? payload.Status : 'Normal',
            StatusText: STATUS_TEXT[payload.Status] || STATUS_TEXT.Normal,
            TaxCode: payload.TaxCode ? String(payload.TaxCode).trim() : null,
            Comment: payload.Comment ? String(payload.Comment).trim() : null,
            Active: payload.Active !== false,
            Customer: true,
            Supplier: false,
            Categories: [],
            Tags: [],
        };
        return await jsonFetch(PARTNER, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json;odata.metadata=minimal' },
            body: JSON.stringify(body),
        });
    }

    /**
     * Update partner. TPOS expects a full PUT body — we GET the record first,
     * apply the patch, strip odata metadata, then PUT.
     */
    async function update(id, patch) {
        const current = await getOne(id);
        const merged = Object.assign({}, current, patch || {});
        // Refresh StatusText if Status changed
        if (patch && patch.Status && STATUS_TEXT[patch.Status]) {
            merged.StatusText = STATUS_TEXT[patch.Status];
        }
        const body = {};
        for (const k of Object.keys(merged)) {
            if (!k.startsWith('@odata')) body[k] = merged[k];
        }
        const url = `${PARTNER}(${encodeURIComponent(id)})`;
        await jsonFetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json;odata.metadata=minimal' },
            body: JSON.stringify(body),
        });
        return await getOne(id);
    }

    async function setActive(id, isActive) {
        return await update(id, { Active: !!isActive });
    }

    /**
     * Update status only via TPOS' dedicated endpoint (fast — no full PUT).
     * Fallback to full update() if the dedicated endpoint rejects.
     */
    async function updateStatus(id, status) {
        if (!STATUS_VALUES.includes(status)) {
            throw new Error('Trạng thái không hợp lệ');
        }
        const url = `${PARTNER}(${encodeURIComponent(id)})/ODataService.UpdateStatus`;
        try {
            await jsonFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json;odata.metadata=minimal' },
                body: JSON.stringify({ status }),
            });
        } catch (e) {
            // Fallback — slower but always works
            return await update(id, { Status: status });
        }
        return await getOne(id);
    }

    async function remove(id) {
        const url = `${PARTNER}(${encodeURIComponent(id)})`;
        await jsonFetch(url, { method: 'DELETE' });
        return { Id: id, deleted: true };
    }

    /**
     * Batch-fetch TPOS partners by phone (Customer type). Uses OData `or` chains
     * — TPOS GetViewV2 doesn't support `Phone in (...)`. Chunks of CHUNK_SIZE
     * phones per request to stay under URL-length limits.
     *
     * @param {string[]} phones — list of normalized phone numbers
     * @param {{chunkSize?: number}} [opts]
     * @returns {Promise<Map<string, Object>>} Map keyed by Phone → partner record
     */
    async function listByPhones(phones, opts) {
        const CHUNK_SIZE = (opts && opts.chunkSize) || 30;
        const map = new Map();
        const unique = Array.from(
            new Set((phones || []).map((p) => String(p || '').trim()).filter((p) => p.length >= 3))
        );
        if (!unique.length) return map;

        const chunks = [];
        for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
            chunks.push(unique.slice(i, i + CHUNK_SIZE));
        }

        const fetchChunk = async (chunk) => {
            const orClauses = chunk.map((p) => `Phone eq '${escapeOData(p)}'`).join(' or ');
            const filter = `Type eq 'Customer' and (${orClauses})`;
            const params = new URLSearchParams();
            params.set('$top', String(chunk.length * 3));
            params.set('$count', 'false');
            params.set('Type', 'Customer');
            params.set('Active', 'true');
            params.set('$filter', filter);
            const url = `${PARTNER_VIEW}?${params.toString()}`;
            try {
                const data = await jsonFetch(url, { method: 'GET' });
                const arr = Array.isArray(data && data.value) ? data.value : [];
                for (const p of arr) {
                    const phone = String(p.Phone || p.Mobile || '').trim();
                    if (!phone) continue;
                    // Keep newest only (DateCreated desc — TPOS default for this list)
                    if (!map.has(phone)) map.set(phone, p);
                }
            } catch (e) {
                console.warn('[PartnerCustomerApi.listByPhones] chunk failed:', e.message);
            }
        };

        // Concurrency 3 so we don't overload the worker proxy
        const queue = [...chunks];
        const workers = [];
        for (let i = 0; i < Math.min(3, queue.length); i++) {
            workers.push(
                (async () => {
                    while (queue.length) {
                        const c = queue.shift();
                        await fetchChunk(c);
                    }
                })()
            );
        }
        await Promise.all(workers);
        return map;
    }

    /** Load partner categories (Nhóm KH) for the filter dropdown. */
    async function listCategories() {
        const url = `${BASE}/PartnerCategory?$top=200&$orderby=Name+asc&$filter=Active+eq+true`;
        const data = await jsonFetch(url, { method: 'GET' });
        return Array.isArray(data && data.value) ? data.value : [];
    }

    // ── Helpers ─────────────────────────────────────────────
    function statusText(statusOrItem) {
        if (statusOrItem && typeof statusOrItem === 'object') {
            return statusOrItem.StatusText || STATUS_TEXT[statusOrItem.Status] || '';
        }
        return STATUS_TEXT[statusOrItem] || '';
    }
    function statusClass(status) {
        switch (status) {
            case 'Normal':
                return 'pc-status-normal';
            case 'BomHang':
                return 'pc-status-bomb';
            case 'Warning':
                return 'pc-status-warning';
            case 'Danger':
                return 'pc-status-danger';
            case 'VIP':
                return 'pc-status-vip';
            default:
                return '';
        }
    }

    // Carrier detection — bám theo helper trong live-campaign-api.js
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
        const norm =
            digits.startsWith('84') && digits.length >= 11 ? '0' + digits.slice(2) : digits;
        return PREFIX_TO_CARRIER[norm.slice(0, 3)] || '';
    }

    function formatCurrency(value) {
        const n = Number(value || 0);
        if (!n) return '0';
        return n.toLocaleString('vi-VN');
    }

    window.PartnerCustomerApi = {
        list,
        getStats,
        getOne,
        create,
        update,
        setActive,
        updateStatus,
        remove,
        listCategories,
        listByPhones,
        // helpers
        STATUS_TEXT,
        STATUS_VALUES,
        statusText,
        statusClass,
        detectCarrier,
        formatCurrency,
    };
})();
