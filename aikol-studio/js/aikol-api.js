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

    // Resolve current user identity. n2store shared auth stores in
    // `loginindex_auth` (localStorage if "remember me", else sessionStorage).
    // The shared AuthManager auto-instantiates as `window.authManager` only when
    // `shared-core-bundle.js` is loaded; on lighter pages we read the raw key.
    function readAuthFromStorage() {
        try {
            const raw =
                sessionStorage.getItem('loginindex_auth') ||
                localStorage.getItem('loginindex_auth') ||
                localStorage.getItem('authData') || // legacy fallback used by some test shims
                null;
            if (!raw) return null;
            const a = JSON.parse(raw);
            // Honour expiry if present (matches AuthManager.isSessionExpired).
            if (a && a.expiresAt && Date.now() > a.expiresAt) return null;
            return a;
        } catch (_) {
            return null;
        }
    }

    function getUserId() {
        try {
            // Prefer the live AuthManager instance if it has been bootstrapped.
            if (global.authManager && typeof global.authManager.getAuthData === 'function') {
                const a = global.authManager.getAuthData();
                if (a) return a.userId || a.uid || a.email || a.username || null;
            }
            const a = readAuthFromStorage();
            if (a) return a.userId || a.uid || a.email || a.username || null;
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

        // Sprint 3 — generations
        submitGeneration: (payload) => jsonRequest('POST', '/generations', payload),
        listGenerations: (limit = 50, offset = 0) =>
            jsonRequest('GET', `/generations?limit=${limit}&offset=${offset}`),
        getGeneration: (id) => jsonRequest('GET', `/generations/${id}`),
        getQueue: () => jsonRequest('GET', '/queue'),
        listOutputs: (limit = 50, offset = 0, kind) => {
            const q = `limit=${limit}&offset=${offset}` + (kind ? `&kind=${kind}` : '');
            return jsonRequest('GET', `/outputs?${q}`);
        },
        deleteOutput: (id) => jsonRequest('DELETE', `/outputs/${id}`),

        // Sprint 4 — billing / settings / campaigns / bulk
        createTopup: (pack_id) => jsonRequest('POST', '/billing/topup', { pack_id }),
        listTopups: () => jsonRequest('GET', '/billing/topups'),
        getTopup: (id) => jsonRequest('GET', `/billing/topups/${id}`),
        cancelTopup: (id) => jsonRequest('POST', `/billing/topups/${id}/cancel`),

        getSettings: () => jsonRequest('GET', '/settings'),
        updateSettings: (payload) => jsonRequest('PATCH', '/settings', payload),
        linkTelegram: (chat_id) => jsonRequest('POST', '/telegram/link', { chat_id }),

        listCampaigns: () => jsonRequest('GET', '/campaigns'),
        createCampaign: (payload) => jsonRequest('POST', '/campaigns', payload),
        updateCampaign: (id, payload) => jsonRequest('PATCH', `/campaigns/${id}`, payload),
        deleteCampaign: (id) => jsonRequest('DELETE', `/campaigns/${id}`),
        runCampaign: (id, body = {}) => jsonRequest('POST', `/campaigns/${id}/run`, body),
        runBulk: (payload) => jsonRequest('POST', '/bulk', payload),

        // Admin-only — grant credits without going through SePay.
        adminMe: () => jsonRequest('GET', '/admin/me'),
        adminListUsers: () => jsonRequest('GET', '/admin/users'),
        adminGrantCredits: (target_user_id, delta, note) =>
            jsonRequest('POST', '/admin/credits/grant', { target_user_id, delta, note }),

        health: () => jsonRequest('GET', '/health'),
    };

    global.AikolAPI = AikolAPI;
})(typeof window !== 'undefined' ? window : globalThis);
