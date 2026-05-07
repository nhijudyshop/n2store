// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// AI KOL Studio API client wrapper. Calls /api/aikol/* on Render.com server.

(function (global) {
    'use strict';

    // n2store fallback pattern: Render server domain. Production picks via shared config.
    const RENDER_BASE = (global.RENDER_API_BASE || 'https://n2store-fallback.onrender.com').replace(
        /\/+$/,
        ''
    );
    const PREFIX = `${RENDER_BASE}/api/aikol`;

    // Resolve current user identity from AuthManager (n2store shared auth).
    function getUserId() {
        try {
            if (global.AuthManager && typeof global.AuthManager.getCurrentUser === 'function') {
                const user = global.AuthManager.getCurrentUser();
                if (user) return user.userId || user.uid || user.email;
            }
            // Fallback: legacy localStorage
            const auth = JSON.parse(localStorage.getItem('authData') || 'null');
            if (auth) return auth.userId || auth.uid || auth.email;
        } catch (_) {}
        return null;
    }

    function buildHeaders(extra) {
        const h = {
            Accept: 'application/json',
            ...(extra || {}),
        };
        const uid = getUserId();
        if (uid) h['X-User-Id'] = uid;
        return h;
    }

    async function jsonRequest(method, path, body) {
        const opts = {
            method,
            headers: buildHeaders(body ? { 'Content-Type': 'application/json' } : {}),
        };
        if (body !== undefined) opts.body = JSON.stringify(body);
        const res = await fetch(`${PREFIX}${path}`, opts);
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (_) {
            data = { detail: text };
        }
        if (!res.ok) {
            const err = new Error((data && data.detail) || `HTTP ${res.status}`);
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    async function uploadModel({ name, file }) {
        const fd = new FormData();
        fd.append('name', name);
        fd.append('file', file);
        const res = await fetch(`${PREFIX}/models`, {
            method: 'POST',
            headers: buildHeaders(),
            body: fd,
        });
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (_) {
            data = { detail: text };
        }
        if (!res.ok) {
            const err = new Error((data && data.detail) || `HTTP ${res.status}`);
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    async function uploadClip({ file, title }) {
        const fd = new FormData();
        if (title) fd.append('title', title);
        fd.append('file', file);
        const res = await fetch(`${PREFIX}/import/upload`, {
            method: 'POST',
            headers: buildHeaders(),
            body: fd,
        });
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (_) {
            data = { detail: text };
        }
        if (!res.ok) {
            const err = new Error((data && data.detail) || `HTTP ${res.status}`);
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    const AikolAPI = {
        getCurrentUserId: getUserId,
        endpoint: PREFIX,

        getCredits: () => jsonRequest('GET', '/credits'),
        getCreditHistory: (limit = 30) => jsonRequest('GET', `/credits/history?limit=${limit}`),
        getCosts: () => jsonRequest('GET', '/costs'),
        getBillingPacks: () => jsonRequest('GET', '/billing/packs'),

        listModels: () => jsonRequest('GET', '/models'),
        uploadModel,
        deleteModel: (id) => jsonRequest('DELETE', `/models/${id}`),

        importSingle: (url) => jsonRequest('POST', '/import/single', { url }),
        uploadClip,
        listClips: (limit = 50, offset = 0) =>
            jsonRequest('GET', `/clips?limit=${limit}&offset=${offset}`),
        deleteClip: (id) => jsonRequest('DELETE', `/clips/${id}`),
        toggleClipFavorite: (id, favorite) => jsonRequest('PATCH', `/clips/${id}`, { favorite }),

        health: () => jsonRequest('GET', '/health'),
    };

    global.AikolAPI = AikolAPI;
})(typeof window !== 'undefined' ? window : globalThis);
