// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Web2 Variants API client — /api/web2/variants/* qua Cloudflare Worker.
 */

(function (global) {
    'use strict';

    const WORKER_URL =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = `${WORKER_URL}/api/web2-variants`;

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
        async suggestShortCode(searchParams) {
            const qs =
                searchParams instanceof URLSearchParams
                    ? searchParams.toString()
                    : new URLSearchParams(searchParams || {}).toString();
            return _fetchJson(`${BASE}/suggest-short-code?${qs}`);
        },
        async backfillShortCodes() {
            return _fetchJson(`${BASE}/backfill-short-codes`, { method: 'POST' });
        },
    };

    global.Web2VariantsApi = Web2VariantsApi;
})(typeof window !== 'undefined' ? window : globalThis);
