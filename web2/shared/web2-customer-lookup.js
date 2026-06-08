// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — tra cứu KH từ kho warehouse (thay partner-customer-api TPOS).
// =====================================================================
// Web2CustomerLookup — thay partner-customer-api.js (TPOS Partner OData).
// Đọc kho KH warehouse Web 2.0 (/api/web2/customers/*), KHÔNG TPOS.
//
// Giữ global `window.PartnerCustomerApi` (interface cũ) để balance-history /
// customer-wallet không phải đổi code: listByPhones, list, STATUS_TEXT,
// statusClass, detectCarrier, statusText, formatCurrency.
// =====================================================================

(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/customers';

    // Status warehouse: Normal|Bom|Warning|Danger|VIP (+ legacy BomHang).
    const STATUS_TEXT = {
        Normal: 'Bình thường',
        Bom: 'Bom hàng',
        BomHang: 'Bom hàng',
        Warning: 'Cảnh báo',
        Danger: 'Nguy hiểm',
        VIP: 'VIP',
    };
    const STATUS_VALUES = Object.keys(STATUS_TEXT);

    function statusText(s) {
        if (s && typeof s === 'object') return s.StatusText || STATUS_TEXT[s.Status] || '';
        return STATUS_TEXT[s] || '';
    }
    function statusClass(status) {
        switch (status) {
            case 'Normal':
                return 'pc-status-normal';
            case 'Bom':
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
        for (const c of Object.keys(CARRIER_PREFIXES))
            for (const p of CARRIER_PREFIXES[c]) m[p] = c;
        return m;
    })();
    function detectCarrier(phone) {
        if (!phone) return '';
        const d = String(phone).replace(/\D/g, '');
        if (d.length < 3) return '';
        const n = d.startsWith('84') && d.length >= 11 ? '0' + d.slice(2) : d;
        return PREFIX_TO_CARRIER[n.slice(0, 3)] || '';
    }
    function formatCurrency(v) {
        const n = Number(v || 0);
        return n ? n.toLocaleString('vi-VN') : '0';
    }

    // listByPhones(phones, opts) → Map(phone → {Id,Name,Phone,Status,Address})
    async function listByPhones(phones, _opts) {
        const map = new Map();
        const unique = Array.from(
            new Set((phones || []).map((p) => String(p || '').trim()).filter((p) => p.length >= 3))
        );
        if (!unique.length) return map;
        try {
            const r = await fetch(`${WORKER}/batch-by-phone`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phones: unique }),
            });
            const d = await r.json().catch(() => ({}));
            const data = (d && d.data) || {};
            for (const ph of Object.keys(data)) {
                map.set(ph, data[ph]);
                // also key by last-9 for endsWith callers
            }
            // map back original inputs to normalized matches
            for (const ph of unique) {
                if (map.has(ph)) continue;
                const norm = ph.replace(/\D/g, '').slice(-10);
                if (data[norm]) map.set(ph, data[norm]);
            }
        } catch (e) {
            console.warn('[Web2CustomerLookup] listByPhones fail:', e.message);
        }
        return map;
    }

    // list(opts) → {value, count} (TPOS-compat) từ warehouse /list.
    // opts: { search, status, top, skip, $top, $skip }
    async function list(opts) {
        const o = opts || {};
        const params = new URLSearchParams();
        if (o.search) params.set('search', o.search);
        if (o.status && o.status !== 'all') params.set('status', o.status);
        params.set('limit', String(o.top || o.$top || 50));
        params.set(
            'page',
            String(Math.floor((o.skip || o.$skip || 0) / (o.top || o.$top || 50)) + 1)
        );
        try {
            const r = await fetch(`${WORKER}/list?${params.toString()}`, {
                headers: { Accept: 'application/json' },
            });
            const d = await r.json().catch(() => ({}));
            const rows = Array.isArray(d.data) ? d.data : [];
            // map warehouse row → partner-compat shape
            const value = rows.map((c) => ({
                Id: c.id,
                Name: c.name || '',
                Phone: c.phone || '',
                Status: c.status || 'Normal',
                Address: c.address || '',
                Email: c.email || '',
            }));
            return {
                value,
                count: d.total || value.length,
                '@odata.count': d.total || value.length,
            };
        } catch (e) {
            console.warn('[Web2CustomerLookup] list fail:', e.message);
            return { value: [], count: 0 };
        }
    }

    window.PartnerCustomerApi = {
        list,
        listByPhones,
        STATUS_TEXT,
        STATUS_VALUES,
        statusText,
        statusClass,
        detectCarrier,
        formatCurrency,
    };
    window.Web2CustomerLookup = window.PartnerCustomerApi;
})();
