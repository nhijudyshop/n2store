// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Native Orders — API client cho trang Đơn Web.
 * Gọi /api/native-orders/* qua Cloudflare Worker proxy.
 */

(function (global) {
    'use strict';

    const WORKER_URL =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = `${WORKER_URL}/api/native-orders`;
    const PRODUCTS_BASE = `${WORKER_URL}/api/web2-products`;
    const TAGS_BASE = `${WORKER_URL}/api/web2-order-tags`;

    // Cache cấu hình thẻ (15s) — dùng cho gate "bật/tắt in Phiếu Soạn Hàng".
    let _tagListCache = { at: 0, list: null };
    async function _orderTagList() {
        const now = Date.now();
        if (_tagListCache.list && now - _tagListCache.at < 15000) return _tagListCache.list;
        const d = await _fetchJson(`${TAGS_BASE}/list`);
        const list = Array.isArray(d) ? d : d?.tags || d?.data || d?.items || [];
        _tagListCache = { at: now, list };
        return list;
    }

    // Sprint 3 KPI: extract Web2Auth token để backend resolve visibility scope.
    // Header `x-web2-token` được kpi.js middleware đọc.
    function _authHeaders() {
        if (window.Web2Auth) return window.Web2Auth.authHeaders();
        try {
            const stored = global.Web2Auth?.getStored?.();
            if (stored?.token) return { 'x-web2-token': stored.token };
        } catch {}
        return {};
    }

    async function _fetchJson(url, options = {}) {
        const res = await fetch(url, {
            ...options,
            headers: {
                Accept: 'application/json',
                ..._authHeaders(),
                ...(options.headers || {}),
            },
        });
        let data = null;
        try {
            data = await res.json();
        } catch {
            /* non-json */
        }
        if (!res.ok) {
            const msg = data?.error || `HTTP ${res.status}`;
            throw new Error(msg);
        }
        return data;
    }

    const NativeOrdersApi = {
        async health() {
            return _fetchJson(`${BASE}/health`);
        },

        /**
         * GET /api/native-orders/load
         * @param {object} params
         * @param {string} [params.status]
         * @param {string} [params.search]
         * @param {string} [params.fbPostId]
         * @param {string[]} [params.campaignIds]  use '__no_campaign__' for orders without a campaign
         * @param {number} [params.customerId]  Phase 14 — filter to Customer 360 id
         * @param {number} [params.page=1]
         * @param {number} [params.limit=200]
         */
        async list({
            status,
            search,
            fbPostId,
            fbPostIds,
            campaignIds,
            customerId,
            channel,
            page = 1,
            limit = 200,
        } = {}) {
            const qs = new URLSearchParams();
            if (status && status !== 'all') qs.set('status', status);
            if (search) qs.set('search', search);
            if (fbPostId) qs.set('fbPostId', fbPostId);
            if (Array.isArray(fbPostIds) && fbPostIds.length) {
                qs.set('fbPostIds', fbPostIds.join(','));
            }
            if (Array.isArray(campaignIds) && campaignIds.length) {
                qs.set('campaignIds', campaignIds.join(','));
            }
            if (customerId) qs.set('customerId', String(customerId));
            if (channel && channel !== 'all') qs.set('channel', channel); // 2026-06-04 tab kênh
            qs.set('page', String(page));
            qs.set('limit', String(limit));
            return _fetchJson(`${BASE}/load?${qs}`);
        },

        /**
         * POST /api/native-orders/create-manual — tạo đơn inbox tay (channel='web2_inbox').
         * fbUserId + fbPageId (từ modal tìm hội thoại Pancake) → đơn nhắn tin được.
         * @param {{customerName,phone,address?,customerId?,products?,note?,fbUserId?,fbPageId?,fbUserName?,conversationId?}} fields
         */
        async createManual(fields) {
            return _fetchJson(`${BASE}/create-manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fields || {}),
            });
        },

        /**
         * GET /api/native-orders/campaigns — distinct list of campaigns + counts
         * @returns {Promise<{success, campaigns: Array<{id,name,count,lastOrderAt}>}>}
         */
        async campaigns() {
            return _fetchJson(`${BASE}/campaigns`);
        },

        async getByUser(fbUserId) {
            if (!fbUserId) return null;
            const data = await _fetchJson(`${BASE}/by-user/${encodeURIComponent(fbUserId)}`);
            return data?.order || null;
        },

        /**
         * PATCH /api/native-orders/:code
         * @param {string} code
         * @param {object} fields  partial: { customerName, phone, address, note, products, totalQuantity, totalAmount, status, tags }
         */
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

        /**
         * Tăng print_count (số lần in bill) cho các đơn → tránh in trùng.
         * @param {string[]} codes
         * @param {string} [kind] 'soan_hang' (in Phiếu Soạn Hàng) → bump thêm soan_hang_print_count.
         * @returns {Promise<{success, counts:{[code]:number}}>}
         */
        async markPrinted(codes, kind) {
            const arr = (Array.isArray(codes) ? codes : [codes]).filter(Boolean);
            if (!arr.length) return { success: false };
            return _fetchJson(`${BASE}/mark-printed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(kind ? { codes: arr, kind } : { codes: arr }),
            });
        },

        /**
         * Tag 'Soạn hàng' (trigger soan_hang) có đang BẬT không → gate nút In Phiếu Soạn Hàng.
         * Toggle là is_active của thẻ ở trang order-tags (admin chỉnh). Cache 15s.
         * Fail-open: lỗi mạng / thẻ chưa seed → true (KHÔNG chặn in).
         * @returns {Promise<boolean>}
         */
        async soanHangPrintEnabled() {
            try {
                const list = await _orderTagList();
                const t = list.find((x) => (x.trigger || x.code) === 'soan_hang');
                if (!t) return true; // chưa seed (chưa deploy) → cho in
                const active = t.isActive != null ? t.isActive : t.is_active;
                return active !== false;
            } catch {
                return true;
            }
        },

        /** Tăng print_count (số lần in tem) cho các SP → tránh in tem trùng. */
        async markProductsPrinted(codes) {
            const arr = (Array.isArray(codes) ? codes : [codes]).filter(Boolean);
            if (!arr.length) return { success: false };
            return _fetchJson(`${PRODUCTS_BASE}/mark-printed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codes: arr }),
            });
        },

        /**
         * Sprint 3 KPI: lấy visibility scope của user hiện tại.
         * @returns {Promise<{success, user, scope, access:'all'|'restricted'}>}
         */
        async getKpiScope() {
            return _fetchJson(`${WORKER_URL}/api/web2/kpi/scope`);
        },

        // ===== Product picker helper (hits web2-products API) =====
        async searchProducts({ search, limit = 20 } = {}) {
            const qs = new URLSearchParams();
            if (search) qs.set('search', search);
            qs.set('activeOnly', 'true');
            qs.set('limit', String(limit));
            return _fetchJson(`${PRODUCTS_BASE}/list?${qs}`);
        },
    };

    global.NativeOrdersApi = NativeOrdersApi;
})(typeof window !== 'undefined' ? window : globalThis);
