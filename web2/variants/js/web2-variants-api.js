// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Web2 Variants API client — /api/web2/variants/* qua Cloudflare Worker.
 */

(function (global) {
    'use strict';

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = `${WORKER_URL}/api/web2-variants`;

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

    const Web2VariantsApi = {
        async health() {
            return _fetchJson(`${BASE}/health`);
        },
        async list({ search, group, activeOnly, page = 1, limit = 500 } = {}) {
            const qs = new URLSearchParams();
            if (search) qs.set('search', search);
            if (group) qs.set('group', group);
            if (activeOnly === true || activeOnly === 'true') qs.set('activeOnly', 'true');
            qs.set('page', String(page));
            qs.set('limit', String(limit));
            return _fetchJson(`${BASE}/list?${qs}`);
        },
        async get(id) {
            return _fetchJson(`${BASE}/${encodeURIComponent(id)}`);
        },
        async create(payload) {
            return _fetchJson(BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload || {}),
            });
        },
        async update(id, fields) {
            return _fetchJson(`${BASE}/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fields || {}),
            });
        },
        async remove(id) {
            return _fetchJson(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
        },
    };

    global.Web2VariantsApi = Web2VariantsApi;
})(typeof window !== 'undefined' ? window : globalThis);
