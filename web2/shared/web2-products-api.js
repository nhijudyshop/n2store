// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — Web2ProductsApi client (1 NGUỒN cho mọi trang dùng Kho SP).
/**
 * Web2 Products API client — /api/web2-products/* qua Cloudflare Worker.
 * NGUỒN DUY NHẤT (shared): mọi trang cần CRUD/đọc Kho SP load file này, KHÔNG
 * cross-import bản page-local. `web2-products-cache.js` tự nạp file này nếu thiếu.
 */

(function (global) {
    'use strict';

    const WORKER_URL =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = `${WORKER_URL}/api/web2-products`;

    function _w2Auth(extra) {
        if (window.Web2Auth && window.Web2Auth.authHeaders)
            return window.Web2Auth.authHeaders(extra || {});
        var h = Object.assign({}, extra || {});
        try {
            var t = JSON.parse(localStorage.getItem('web2_auth') || 'null');
            if (t && t.token) h['x-web2-token'] = t.token;
        } catch (e) {}
        return h;
    }

    async function _fetchJson(url, options = {}) {
        // 1 NGUỒN: Web2ApiFetch.json (autoload sidebar). Fallback inline khi chưa load (load-order safe).
        if (window.Web2ApiFetch && window.Web2ApiFetch.json)
            return window.Web2ApiFetch.json(url, options);
        const res = await fetch(url, {
            ...options,
            headers: { Accept: 'application/json', ..._w2Auth(), ...(options.headers || {}) },
        });
        let data = null;
        try {
            data = await res.json();
        } catch {
            /* non-json */
        }
        if (!res.ok) {
            const err = new Error(data?.error || data?.message || `HTTP ${res.status}`);
            err.status = res.status;
            err.body = data;
            throw err;
        }
        return data;
    }

    const Web2ProductsApi = {
        async health() {
            return _fetchJson(`${BASE}/health`);
        },
        async list({ search, activeOnly, status, page = 1, limit = 200, topLevel } = {}) {
            const qs = new URLSearchParams();
            if (search) qs.set('search', search);
            if (activeOnly === true || activeOnly === 'true') qs.set('activeOnly', 'true');
            // Filter trạng thái (vd status=HET_HANG cho filter "Hết hàng" ở Kho SP).
            // Backend /list whitelist CHO_MUA|DANG_BAN|MUA_1_PHAN|HET_HANG (web2-products.js).
            if (status) qs.set('status', String(status));
            // Migration 070: topLevel=1 → chỉ CHA + standalone (ẩn con) cho bảng Kho SP.
            if (topLevel === true || topLevel === '1') qs.set('topLevel', '1');
            qs.set('page', String(page));
            qs.set('limit', String(limit));
            return _fetchJson(`${BASE}/list?${qs}`);
        },
        // Migration 070: các CON của 1 cha (lazy expand ở Kho SP).
        async listChildren(parentCode) {
            const qs = new URLSearchParams();
            qs.set('parentCode', String(parentCode || ''));
            qs.set('limit', '500');
            return _fetchJson(`${BASE}/list?${qs}`);
        },
        async get(code) {
            return _fetchJson(`${BASE}/${encodeURIComponent(code)}`);
        },
        /**
         * GET /api/web2-products/batch?codes=A,B,C — lấy nhiều SP 1 lượt.
         * Dùng cho SSE in-place patch nhiều row (bulk op) → không full reload.
         * Returns {success, products: [...]}
         */
        async getBatch(codes) {
            if (!Array.isArray(codes) || !codes.length) return { success: true, products: [] };
            const qs = new URLSearchParams({ codes: codes.join(',') });
            return _fetchJson(`${BASE}/batch?${qs}`);
        },
        /**
         * GET /api/web2-products/usage?codes=A,B,C
         * Returns {success, usage: { code: [{orderCode, displayStt, customerName, ...}] }}
         */
        async usage(codes) {
            if (!Array.isArray(codes) || !codes.length) return { success: true, usage: {} };
            const qs = new URLSearchParams({ codes: codes.join(',') });
            return _fetchJson(`${BASE}/usage?${qs}`);
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
        // Xóa SP. force=true để bỏ qua check pending_qty > 0.
        // Nếu pending_qty > 0 và !force → throw Error với .status=409 + .body có info.
        async remove(code, { force } = {}) {
            const qs = force ? '?force=1' : '';
            return _fetchJson(`${BASE}/${encodeURIComponent(code)}${qs}`, { method: 'DELETE' });
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
        async upsertPending(items, opts) {
            // MEDIUM-cleanup (2026-06-13): opts.resolveOnly = chỉ lấy mã, KHÔNG
            // cộng pending (in tem). Mặc định cũ (cộng pending) giữ nguyên.
            return _fetchJson(`${BASE}/upsert-pending`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items, resolveOnly: opts?.resolveOnly === true }),
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
        // SP CẦN ĐẶT THÊM NCC: cầu giỏ nháp > tồn → {…, demand, needed}. (#2 follow-up)
        async restockNeeded(supplier) {
            const qs = supplier ? `?supplier=${encodeURIComponent(supplier)}` : '';
            return _fetchJson(`${BASE}/restock-needed${qs}`);
        },
        // Adjust pending_qty của SP theo delta (+/-).
        // adjustments: [{ code?, name?, variant?, supplier?, delta }]
        // Server: clamp 0, auto delete ghost (pending=0+stock=0+createdBy=so-order),
        // auto chuyển status DANG_BAN nếu pending về 0 nhưng còn stock.
        async adjustPending(adjustments) {
            return _fetchJson(`${BASE}/adjust-pending`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adjustments }),
            });
        },
    };

    global.Web2ProductsApi = Web2ProductsApi;
})(typeof window !== 'undefined' ? window : globalThis);
