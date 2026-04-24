// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Native Orders — API client cho trang Đơn Web.
 * Gọi /api/native-orders/* qua Cloudflare Worker proxy.
 */

(function (global) {
    'use strict';

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = `${WORKER_URL}/api/native-orders`;

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
         * @param {number} [params.page=1]
         * @param {number} [params.limit=200]
         */
        async list({ status, search, fbPostId, page = 1, limit = 200 } = {}) {
            const qs = new URLSearchParams();
            if (status && status !== 'all') qs.set('status', status);
            if (search) qs.set('search', search);
            if (fbPostId) qs.set('fbPostId', fbPostId);
            qs.set('page', String(page));
            qs.set('limit', String(limit));
            return _fetchJson(`${BASE}/load?${qs}`);
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
    };

    global.NativeOrdersApi = NativeOrdersApi;
})(typeof window !== 'undefined' ? window : globalThis);
