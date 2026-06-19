// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — Facebook Graph API client (1 NGUỒN cho mọi trang FB).
// =====================================================================
// Web 2.0 — Web2FbClient: NGUỒN DUY NHẤT gọi backend /api/web2-fb-posts (Graph API).
//   Mọi trang cần dữ liệu/thao tác Facebook (đăng bài, thống kê tương tác, quảng cáo,
//   sửa caption, …) đều LOAD module này rồi gọi `window.Web2FbClient.*` — KHÔNG tự fetch,
//   KHÔNG copy lại logic. Đang dùng: fb-posts, fb-insights, fb-ads-stats.
//   Trang mới cần FB → thêm <script src="../shared/web2-fb-client.js"> rồi gọi.
//
// Alias `window.FBPostsApi` = Web2FbClient (giữ tương thích các trang đã viết trước khi gom shared).
//
// ⚠ FB ĐÃ KHAI TỬ reach/impressions per-post (post_impressions_unique…) + nhiều page metric
//   (đợt deprecate insights 2024-2025). Backend chỉ trả metric còn sống (clicks, reactions,
//   video_views, activity, page_post_engagements, page_views_total) — đừng kỳ vọng reach per-post.
// =====================================================================
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

    // Upload ảnh local → imgbb (worker) → URL công khai. ⚠ imgbb hiện lỗi key — luồng đăng FB
    // KHÔNG dùng hàm này nữa (gửi bytes thẳng lên FB qua media {dataUrl}). Giữ cho tương thích.
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

    const Web2FbClient = {
        workerBase,
        status: () => jget('/status'),
        // scope: 'full' (mặc định, gồm read_insights + ads) | 'min' (chỉ đăng bài)
        loginUrl: (ret, scope) =>
            jget(
                `/auth/login-url?return=${encodeURIComponent(ret || location.href)}` +
                    (scope ? `&scope=${encodeURIComponent(scope)}` : '')
            ),
        connect: (token) => jpost('/connect', { token }),
        disconnect: () => jpost('/disconnect', {}),
        refreshPages: () => jpost('/refresh-pages', {}),
        // opts = { product?, products?[], style, ai }. products (nhiều SP) → caption tổng hợp.
        caption: (opts) => jpost('/caption', opts || {}),
        publish: (payload) => jpost('/publish', payload),
        list: (pageId, limit, after) =>
            jget(
                `/list?pageId=${encodeURIComponent(pageId)}&limit=${limit || 25}` +
                    (after ? `&after=${encodeURIComponent(after)}` : '')
            ),
        postDetail: (pageId, postId) =>
            jget(
                `/post-detail?pageId=${encodeURIComponent(pageId)}&postId=${encodeURIComponent(postId)}`
            ),
        del: (pageId, postId) => jpost('/delete', { pageId, postId }),
        // Sửa caption và/hoặc đổi giờ lên lịch (không xoá bài → giữ link).
        postEdit: (pageId, postId, patch) =>
            jpost('/post-edit', { pageId, postId, ...(patch || {}) }),
        // Thống kê tương tác: page insights 28 ngày + per-post (clicks/reactions/video views).
        engagement: (pageId, limit) =>
            jget(`/engagement?pageId=${encodeURIComponent(pageId)}&limit=${limit || 50}`),
        // Chẩn đoán metric post nào FB còn cho (read-only).
        insightsProbe: (pageId, postId) =>
            jget(
                `/insights-probe?pageId=${encodeURIComponent(pageId)}` +
                    (postId ? `&postId=${encodeURIComponent(postId)}` : '')
            ),
        adAccounts: () => jget('/ad-accounts'),
        adInsights: (actId, preset) =>
            jget(
                `/ad-insights?actId=${encodeURIComponent(actId)}&preset=${encodeURIComponent(preset || 'last_30d')}`
            ),
        adEntries: (pageId, from, to) =>
            jget(
                `/ad-entries?${[pageId ? `pageId=${encodeURIComponent(pageId)}` : '', from ? `from=${from}` : '', to ? `to=${to}` : ''].filter(Boolean).join('&')}`
            ),
        saveAdEntry: (payload) => jpost('/ad-entry', payload),
        deleteAdEntry: (id) => jpost(`/ad-entry/${id}`, null, 'DELETE'),
        drafts: (status) => jget(`/drafts?status=${status || 'all'}`),
        saveDraft: (payload) => jpost('/draft', payload),
        deleteDraft: (id) => jpost(`/draft/${id}`, null, 'DELETE'),
        uploadImage,
    };

    window.Web2FbClient = Web2FbClient;
    window.FBPostsApi = Web2FbClient; // alias tương thích các trang cũ
})();
