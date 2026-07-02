// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Web 2.0 generic API client — talks to /api/web2/:entity/*
 * Usage:
 *   const api = Web2Api.forEntity('productuom');
 *   await api.list({ search:'X', page:1, limit:200 });
 *   await api.create({ code:'A', name:'Áo', data:{ note:'...' } });
 *   await api.update('A', { name:'Áo mới' });
 *   await api.remove('A');
 */
(function (global) {
    'use strict';

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';

    // 3H21 (2026-06-12): tự gắn x-web2-token (Web2Auth, localStorage 'web2_auth')
    // cho MỌI call generic — điều kiện tiên quyết bật WEB2_AUTH_ENFORCE=1 mà
    // không gãy 80+ trang page-builder. Không có token → header bỏ qua (soft).
    function _authHeaders() {
        try {
            const t = global.Web2Auth?.getStored?.()?.token;
            return t ? { 'x-web2-token': t } : {};
        } catch {
            return {};
        }
    }

    async function _fetchJson(url, options = {}) {
        // 1 NGUỒN: Web2ApiFetch.json (autoload sidebar). Fallback inline khi chưa load (load-order safe).
        if (window.Web2ApiFetch && window.Web2ApiFetch.json)
            return window.Web2ApiFetch.json(url, options);
        const res = await fetch(url, {
            ...options,
            headers: { Accept: 'application/json', ..._authHeaders(), ...(options.headers || {}) },
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
            create: (payload) => {
                // P1 2026-05-30: auto-attach user info cho audit log.
                // Web2UserInfo.attachToPayload mutates payload thêm userId/
                // userName/sourcePage + seed data.history nếu chưa có.
                const body = payload ? { ...payload } : {};
                if (global.Web2UserInfo?.attachToPayload) {
                    global.Web2UserInfo.attachToPayload(body, slug);
                }
                return _fetchJson(`${base}/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            },
            update: (code, fields) => {
                // P1 2026-05-30: auto-attach user info cho audit append history.
                const body = fields ? { ...fields } : {};
                if (global.Web2UserInfo?.attachToBody) {
                    global.Web2UserInfo.attachToBody(body, slug);
                }
                return _fetchJson(`${base}/update/${encodeURIComponent(code)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            },
            remove: (code) =>
                _fetchJson(`${base}/delete/${encodeURIComponent(code)}`, {
                    method: 'DELETE',
                }),
        };
    }

    global.Web2Api = { forEntity, _fetchJson, WORKER };
})(typeof window !== 'undefined' ? window : globalThis);
