// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Web 2.0 generic API client — talks to /api/web2/:entity/*
 * Usage:
 *   const api = Web2Api.forEntity('productcategory');
 *   await api.list({ search:'X', page:1, limit:200 });
 *   await api.create({ code:'A', name:'Áo', data:{ note:'...' } });
 *   await api.update('A', { name:'Áo mới' });
 *   await api.remove('A');
 */
(function (global) {
    'use strict';

    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';

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

    function forEntity(slug) {
        const base = `${WORKER}/api/web2/${encodeURIComponent(slug)}`;
        return {
            slug,
            health: () => _fetchJson(`${base}/health`),
            list: ({ search, activeOnly, page = 1, limit = 200 } = {}) => {
                const qs = new URLSearchParams();
                if (search) qs.set('search', search);
                if (activeOnly) qs.set('activeOnly', 'true');
                qs.set('page', String(page));
                qs.set('limit', String(limit));
                return _fetchJson(`${base}/list?${qs}`);
            },
            get: (code) => _fetchJson(`${base}/get/${encodeURIComponent(code)}`),
            create: (payload) =>
                _fetchJson(`${base}/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload || {}),
                }),
            update: (code, fields) =>
                _fetchJson(`${base}/update/${encodeURIComponent(code)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(fields || {}),
                }),
            remove: (code) =>
                _fetchJson(`${base}/delete/${encodeURIComponent(code)}`, {
                    method: 'DELETE',
                }),
        };
    }

    global.Web2Api = { forEntity, _fetchJson, WORKER };
})(typeof window !== 'undefined' ? window : globalThis);
