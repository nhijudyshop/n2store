// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — Facebook Graph publish/schedule/list/delete helpers.
// =====================================================================
// Web 2.0 — Facebook Graph API service (đăng bài + lên lịch + liệt kê + xoá).
//
// Pancake KHÔNG có API tạo/lên lịch bài viết → publish/schedule PHẢI qua Graph API.
// Service này là các hàm THUẦN (nhận pageToken) — không đụng DB, không express.
// Route web2-fb-posts.js gọi service này.
//
// Auth: dùng chung FB App (FB_APP_ID/FB_APP_SECRET env) với fb-ads (Web 1.0) —
//   App credentials = config dùng chung, KHÔNG phải data Web 1.0. Token store của
//   Web 2.0 nằm ở bảng web2_fb_post_tokens (web2Db) RIÊNG, không đọc fb_ads_tokens.
//
// Graph version v21.0 (đồng bộ shared/universal/facebook-constants.js).
// Lịch đăng: published=false + scheduled_publish_time (unix giây, 10 phút–30 ngày).
// =====================================================================

'use strict';

const GRAPH_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const GRAPH_VIDEO = `https://graph-video.facebook.com/${GRAPH_VERSION}`;

const FB_APP_ID = process.env.FB_APP_ID || '';
const FB_APP_SECRET = process.env.FB_APP_SECRET || '';

// Cửa sổ lên lịch FB cho phép: 10 phút → 30 ngày (theo docs Graph API).
const SCHEDULE_MIN_SEC = 10 * 60;
const SCHEDULE_MAX_SEC = 30 * 24 * 60 * 60;

const FETCH_TIMEOUT_MS = 30000;

/** fetch + timeout + parse JSON, ném lỗi rõ ràng từ Graph. */
async function gfetch(url, opts = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { ...opts, signal: ctrl.signal });
        const text = await res.text();
        let json;
        try {
            json = text ? JSON.parse(text) : {};
        } catch (_) {
            json = { raw: text };
        }
        if (!res.ok || json.error) {
            const e = json.error || {};
            const err = new Error(e.message || `Graph HTTP ${res.status}`);
            err.fbCode = e.code;
            err.fbSubcode = e.error_subcode;
            err.fbType = e.type;
            err.status = res.status;
            throw err;
        }
        return json;
    } finally {
        clearTimeout(t);
    }
}

/** form-urlencoded body từ object (bỏ undefined/null). */
function form(obj) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined || v === null) continue;
        p.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    return p;
}

// ── Auth helpers ─────────────────────────────────────────────────────────

/** FB App đã cấu hình env chưa (cần cho OAuth login). */
function hasApp() {
    return !!(FB_APP_ID && FB_APP_SECRET);
}

const SCOPES_POST =
    'pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement';

/**
 * URL dialog OAuth "Đăng nhập bằng Facebook" (như Pancake/TPOS) — user bấm,
 * duyệt quyền page, KHÔNG cần dán token. APP_ID không bí mật (public).
 */
function buildOAuthDialogUrl({ redirectUri, state, scopes }) {
    const p = new URLSearchParams({
        client_id: FB_APP_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes || SCOPES_POST,
        state: state || '',
    });
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${p.toString()}`;
}

/** Đổi `code` (từ callback OAuth) → user access token. redirectUri PHẢI khớp dialog. */
async function exchangeCodeForToken(code, redirectUri) {
    if (!hasApp()) throw new Error('FB App chưa cấu hình (FB_APP_ID/FB_APP_SECRET)');
    const url =
        `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(FB_APP_ID)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&client_secret=${encodeURIComponent(FB_APP_SECRET)}` +
        `&code=${encodeURIComponent(code)}`;
    const data = await gfetch(url);
    if (!data.access_token) throw new Error('Không lấy được access_token từ code');
    return data.access_token;
}

/** Đổi short-lived user token → long-lived (~60 ngày). Trả {token, expiresAt}. */
async function exchangeLongLivedToken(userToken) {
    if (!FB_APP_ID || !FB_APP_SECRET) {
        // Không có App secret → giữ nguyên token (vd token session FB dán tay).
        return { token: userToken, expiresAt: Date.now() + 50 * 24 * 3600 * 1000 };
    }
    const url =
        `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token` +
        `&client_id=${encodeURIComponent(FB_APP_ID)}` +
        `&client_secret=${encodeURIComponent(FB_APP_SECRET)}` +
        `&fb_exchange_token=${encodeURIComponent(userToken)}`;
    const data = await gfetch(url);
    const ttl = (data.expires_in || 50 * 24 * 3600) * 1000;
    return { token: data.access_token || userToken, expiresAt: Date.now() + ttl };
}

/** Thông tin user của token (id, name). */
async function getMe(userToken) {
    return gfetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(userToken)}`);
}

/**
 * Lấy danh sách Page user quản lý + page access token mỗi page.
 * Trả [{id, name, access_token, picture, category, fan_count}].
 */
async function getPages(userToken) {
    const url =
        `${GRAPH}/me/accounts?limit=100` +
        `&fields=id,name,access_token,category,fan_count,picture{url},tasks` +
        `&access_token=${encodeURIComponent(userToken)}`;
    const data = await gfetch(url);
    return (data.data || []).map((p) => ({
        id: String(p.id),
        name: p.name || String(p.id),
        access_token: p.access_token,
        category: p.category || '',
        fan_count: p.fan_count || 0,
        picture: p.picture?.data?.url || '',
        canPost: Array.isArray(p.tasks) ? p.tasks.includes('CREATE_CONTENT') : true,
    }));
}

// ── Publish helpers ────────────────────────────────────────────────────────

/** Chuẩn hoá + validate scheduled_publish_time (giây). Ném lỗi nếu ngoài cửa sổ. */
function normalizeScheduleSec(scheduledTime) {
    if (!scheduledTime) return null;
    // chấp nhận ms hoặc giây hoặc ISO string
    let sec;
    if (typeof scheduledTime === 'string' && /\D/.test(scheduledTime)) {
        sec = Math.floor(new Date(scheduledTime).getTime() / 1000);
    } else {
        const n = Number(scheduledTime);
        sec = n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
    }
    if (!sec || isNaN(sec)) throw new Error('Thời gian lên lịch không hợp lệ');
    const nowSec = Math.floor(Date.now() / 1000);
    const delta = sec - nowSec;
    if (delta < SCHEDULE_MIN_SEC) throw new Error('Lên lịch phải cách hiện tại tối thiểu 10 phút');
    if (delta > SCHEDULE_MAX_SEC) throw new Error('Lên lịch tối đa 30 ngày');
    return sec;
}

/** Upload 1 ảnh ở chế độ unpublished → trả media_fbid (cho carousel nhiều ảnh). */
async function uploadUnpublishedPhoto(pageId, pageToken, photoUrl) {
    const body = form({ url: photoUrl, published: 'false', access_token: pageToken });
    const data = await gfetch(`${GRAPH}/${pageId}/photos`, { method: 'POST', body });
    return data.id; // media_fbid
}

/**
 * Đăng/ lên lịch 1 bài lên 1 page.
 *
 * @param {object} p
 * @param {string} p.pageId
 * @param {string} p.pageToken
 * @param {string} p.message      caption
 * @param {Array}  p.media        [{type:'photo'|'video', url}]
 * @param {string} [p.link]
 * @param {number} [p.scheduledTime] ms|sec|ISO → nếu có thì lên lịch (published=false)
 * @returns {Promise<{postId, scheduled:boolean}>}
 */
async function publishToPage({ pageId, pageToken, message, media = [], link, scheduledTime }) {
    if (!pageId || !pageToken) throw new Error('Thiếu pageId / pageToken');
    const sched = normalizeScheduleSec(scheduledTime);
    const schedFields = sched ? { published: 'false', scheduled_publish_time: sched } : {};

    const photos = media.filter((m) => m && m.type === 'photo' && m.url);
    const videos = media.filter((m) => m && m.type === 'video' && m.url);

    // 1) Có video → đăng qua /videos (1 video / bài; lấy video đầu).
    if (videos.length) {
        const body = form({
            file_url: videos[0].url,
            description: message || '',
            access_token: pageToken,
            ...schedFields,
        });
        const data = await gfetch(`${GRAPH_VIDEO}/${pageId}/videos`, { method: 'POST', body });
        return { postId: data.post_id || data.id, scheduled: !!sched };
    }

    // 2) Nhiều ảnh → upload unpublished từng ảnh → /feed với attached_media.
    if (photos.length > 1) {
        const fbids = [];
        for (const ph of photos)
            fbids.push(await uploadUnpublishedPhoto(pageId, pageToken, ph.url));
        const attached = {};
        fbids.forEach(
            (id, i) => (attached[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }))
        );
        const body = form({
            message: message || '',
            link,
            access_token: pageToken,
            ...attached,
            ...schedFields,
        });
        const data = await gfetch(`${GRAPH}/${pageId}/feed`, { method: 'POST', body });
        return { postId: data.id, scheduled: !!sched };
    }

    // 3) Đúng 1 ảnh → /photos.
    if (photos.length === 1) {
        const body = form({
            url: photos[0].url,
            message: message || '',
            access_token: pageToken,
            ...schedFields,
        });
        const data = await gfetch(`${GRAPH}/${pageId}/photos`, { method: 'POST', body });
        return { postId: data.post_id || data.id, scheduled: !!sched };
    }

    // 4) Chỉ text (± link) → /feed.
    const body = form({
        message: message || '',
        link,
        access_token: pageToken,
        ...schedFields,
    });
    const data = await gfetch(`${GRAPH}/${pageId}/feed`, { method: 'POST', body });
    return { postId: data.id, scheduled: !!sched };
}

/** Xoá 1 bài (post-id) bằng page token. */
async function deletePost(postId, pageToken) {
    const body = form({ access_token: pageToken });
    return gfetch(`${GRAPH}/${postId}`, { method: 'DELETE', body });
}

/** Cập nhật caption 1 bài đã đăng (chỉ message). */
async function updatePostMessage(postId, pageToken, message) {
    const body = form({ message: message || '', access_token: pageToken });
    return gfetch(`${GRAPH}/${postId}`, { method: 'POST', body });
}

/** Liệt kê bài ĐÃ ĐĂNG của page (cho tab quản lý). */
async function listPagePosts(pageId, pageToken, limit = 25) {
    const fields =
        'id,message,created_time,full_picture,permalink_url,status_type,' +
        'shares,likes.summary(true),comments.summary(true)';
    const url = `${GRAPH}/${pageId}/posts?fields=${encodeURIComponent(fields)}&limit=${limit}&access_token=${encodeURIComponent(pageToken)}`;
    const data = await gfetch(url);
    return (data.data || []).map((p) => ({
        id: String(p.id),
        message: p.message || '',
        createdTime: p.created_time || null,
        picture: p.full_picture || '',
        permalink: p.permalink_url || '',
        statusType: p.status_type || '',
        likes: p.likes?.summary?.total_count || 0,
        comments: p.comments?.summary?.total_count || 0,
        shares: p.shares?.count || 0,
    }));
}

/** Liệt kê bài ĐÃ LÊN LỊCH (chưa đăng) của page. */
async function listScheduledPosts(pageId, pageToken, limit = 25) {
    const fields = 'id,message,scheduled_publish_time,created_time';
    const url = `${GRAPH}/${pageId}/scheduled_posts?fields=${encodeURIComponent(fields)}&limit=${limit}&access_token=${encodeURIComponent(pageToken)}`;
    try {
        const data = await gfetch(url);
        return (data.data || []).map((p) => ({
            id: String(p.id),
            message: p.message || '',
            scheduledTime: p.scheduled_publish_time ? p.scheduled_publish_time * 1000 : null,
        }));
    } catch (_) {
        return []; // 1 số page không cho liệt kê scheduled qua API
    }
}

module.exports = {
    GRAPH_VERSION,
    SCHEDULE_MIN_SEC,
    SCHEDULE_MAX_SEC,
    hasApp,
    SCOPES_POST,
    buildOAuthDialogUrl,
    exchangeCodeForToken,
    exchangeLongLivedToken,
    getMe,
    getPages,
    publishToPage,
    deletePost,
    updatePostMessage,
    listPagePosts,
    listScheduledPosts,
    normalizeScheduleSec,
};
