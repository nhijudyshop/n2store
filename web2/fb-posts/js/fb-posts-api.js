// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Đăng bài Facebook: API client (1 nguồn fetch).
(function () {
    'use strict';

    function workerBase() {
        return (
            (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
            (window.WEB2_CONFIG && window.WEB2_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    const BASE = () => `${workerBase()}/api/web2-fb-posts`;
    function headers(extra) {
        return window.Web2Auth && window.Web2Auth.authHeaders
            ? window.Web2Auth.authHeaders(extra || {})
            : { 'Content-Type': 'application/json', ...(extra || {}) };
    }
    async function jget(path) {
        const r = await fetch(`${BASE()}${path}`, { headers: headers() });
        return r.json();
    }
    async function jpost(path, body, method) {
        const r = await fetch(`${BASE()}${path}`, {
            method: method || 'POST',
            headers: headers({ 'Content-Type': 'application/json' }),
            body: body ? JSON.stringify(body) : undefined,
        });
        return r.json();
    }

    // Upload ảnh local → imgbb (worker) → trả URL công khai để FB pull.
    async function uploadImage(file) {
        const b64 = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result).split(',')[1] || '');
            fr.onerror = rej;
            fr.readAsDataURL(file);
        });
        const r = await fetch(`${workerBase()}/api/imgbb-upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: b64 }),
        });
        const j = await r.json();
        if (!j.success) throw new Error(j.error || 'Upload ảnh thất bại');
        return j.data.url;
    }

    window.FBPostsApi = {
        workerBase,
        status: () => jget('/status'),
        loginUrl: (ret) =>
            jget(`/auth/login-url?return=${encodeURIComponent(ret || location.href)}`),
        connect: (token) => jpost('/connect', { token }),
        disconnect: () => jpost('/disconnect', {}),
        refreshPages: () => jpost('/refresh-pages', {}),
        caption: (product, style, ai) => jpost('/caption', { product, style, ai }),
        publish: (payload) => jpost('/publish', payload),
        list: (pageId, limit) =>
            jget(`/list?pageId=${encodeURIComponent(pageId)}&limit=${limit || 25}`),
        del: (pageId, postId) => jpost('/delete', { pageId, postId }),
        drafts: (status) => jget(`/drafts?status=${status || 'all'}`),
        saveDraft: (payload) => jpost('/draft', payload),
        deleteDraft: (id) => jpost(`/draft/${id}`, null, 'DELETE'),
        uploadImage,
    };
})();
