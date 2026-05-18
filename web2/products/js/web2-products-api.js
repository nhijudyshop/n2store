// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Web2 Products API client — /api/web2/products/* qua Cloudflare Worker.
 */

(function (global) {
    'use strict';

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = `${WORKER_URL}/api/web2-products`;

    async function _fetchJson(url, options = {}) {
        const res = await fetch(url, {
            ...options,
            headers: { Accept: 'application/json', ...(options.headers || {}) },
        });
        let data = null;
        try {
            data = await res.json();
        } catch {
            /* non-json */
        }
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data;
    }

    const Web2ProductsApi = {
        async health() {
            return _fetchJson(`${BASE}/health`);
        },
        async list({ search, activeOnly, page = 1, limit = 200 } = {}) {
            const qs = new URLSearchParams();
            if (search) qs.set('search', search);
            if (activeOnly === true || activeOnly === 'true') qs.set('activeOnly', 'true');
            qs.set('page', String(page));
            qs.set('limit', String(limit));
            return _fetchJson(`${BASE}/list?${qs}`);
        },
        async get(code) {
            return _fetchJson(`${BASE}/${encodeURIComponent(code)}`);
        },
        async create(payload) {
            return _fetchJson(BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload || {}),
            });
        },
        async update(code, fields) {
            return _fetchJson(`${BASE}/${encodeURIComponent(code)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fields || {}),
            });
        },
        async remove(code) {
            return _fetchJson(`${BASE}/${encodeURIComponent(code)}`, { method: 'DELETE' });
        },
        // Atomic bulk stock adjustment. adjustments = [{ code, delta, reason }].
        // delta > 0: nhập kho; delta < 0: xuất kho. Stock clamp tại 0.
        async adjustStock(adjustments) {
            return _fetchJson(`${BASE}/adjust-stock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adjustments }),
            });
        },
        // so-order Lưu Nháp: upsert items với status='CHO_MUA' + pending_qty.
        // items: [{name, variant, qty, costPrice, sellPrice, supplier, imageUrl, note}]
        async upsertPending(items) {
            return _fetchJson(`${BASE}/upsert-pending`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items }),
            });
        },
        // Mua hàng confirm: status='DANG_BAN' + stock += pending_qty.
        // body: { codes: [...] } hoặc { supplier: "X" }
        async confirmPurchase(body) {
            return _fetchJson(`${BASE}/confirm-purchase`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        },
        // List SP CHỜ MUA, optional filter by supplier.
        async listPending(supplier) {
            const qs = supplier ? `?supplier=${encodeURIComponent(supplier)}` : '';
            return _fetchJson(`${BASE}/pending${qs}`);
        },
    };

    global.Web2ProductsApi = Web2ProductsApi;
})(typeof window !== 'undefined' ? window : globalThis);
