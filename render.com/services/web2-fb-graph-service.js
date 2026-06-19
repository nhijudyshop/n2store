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

// Least-privilege cơ bản: 3 quyền CẦN để đăng/quản lý bài + đọc tương tác. KHÔNG xin
// pages_manage_engagement (quản lý bình luận — feature này không dùng, lại kéo dep
// pages_read_user_content). Cả 3 đều Standard Access → app-role admin dùng KHÔNG cần review.
const SCOPES_POST = 'pages_show_list,pages_read_engagement,pages_manage_posts';

// Bộ quyền ĐẦY ĐỦ (dùng mặc định cho "Kết nối Facebook"): cộng thêm
//   • read_insights      → số liệu page/bài/video/live THẬT (reach, impressions, reactions, views)
//   • ads_read           → đọc tài khoản + insights quảng cáo (fb-ads-stats chế độ tự động)
//   • business_management → bắt được ad account qua Business Manager (không cần là người chạy QC)
// Tất cả đều dùng được với app-role admin (Standard Access) cho page/BM mình quản lý → KHÔNG cần
// App Review. Quyền nào FB chưa cấp thì các tính năng tương ứng tự fallback (empty), không vỡ.
const SCOPES_FULL =
    'pages_show_list,pages_read_engagement,pages_manage_posts,read_insights,ads_read,business_management';

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

/**
 * Cập nhật 1 bài: sửa caption (message) và/hoặc đổi giờ lên lịch (scheduled_publish_time,
 * chỉ cho bài CHƯA đăng). Truyền field nào thì cập nhật field đó.
 * @returns {Promise<{message:boolean, rescheduled:boolean}>}
 */
async function updatePost(postId, pageToken, { message, scheduledTime } = {}) {
    if (!postId || !pageToken) throw new Error('Thiếu postId / pageToken');
    const payload = { access_token: pageToken };
    let didMessage = false;
    let didReschedule = false;
    if (message !== undefined && message !== null) {
        payload.message = message;
        didMessage = true;
    }
    if (scheduledTime) {
        payload.scheduled_publish_time = normalizeScheduleSec(scheduledTime);
        didReschedule = true;
    }
    if (!didMessage && !didReschedule) throw new Error('Không có gì để cập nhật');
    await gfetch(`${GRAPH}/${postId}`, { method: 'POST', body: form(payload) });
    return { message: didMessage, rescheduled: didReschedule };
}

/** Liệt kê bài ĐÃ ĐĂNG của page (cho tab quản lý).
 * ⚠ KHÔNG xin likes/comments/shares.summary — các field đếm tương tác đòi feature
 * "Page Public Content Access" (cần App Review riêng) → gây lỗi (#10) dù đã có
 * pages_read_engagement. Chỉ lấy field nội dung bài (chạy với page token + pages_read_engagement).
 * Số like/cmt xem trực tiếp trên FB qua permalink. */
async function listPagePosts(pageId, pageToken, limit = 25, after = null) {
    const fields =
        'id,message,created_time,full_picture,permalink_url,status_type,' +
        'attachments{media_type,type,target{id}}';
    let url = `${GRAPH}/${pageId}/posts?fields=${encodeURIComponent(fields)}&limit=${limit}&access_token=${encodeURIComponent(pageToken)}`;
    if (after) url += `&after=${encodeURIComponent(after)}`;
    const data = await gfetch(url);
    const posts = (data.data || []).map((p) => {
        const att = (p.attachments && p.attachments.data && p.attachments.data[0]) || {};
        return {
            id: String(p.id),
            message: p.message || '',
            createdTime: p.created_time || null,
            picture: p.full_picture || '',
            permalink: p.permalink_url || '',
            statusType: p.status_type || '',
            mediaType: att.media_type || '',
            attType: att.type || '',
            targetId: att.target && att.target.id ? String(att.target.id) : '',
        };
    });
    // cursor trang kế (infinite scroll). null = hết bài.
    const next = (data.paging && data.paging.cursors && data.paging.cursors.after) || null;
    return { posts, after: next };
}

// Map video.id → {status, liveViews} của các buổi live (để nhận diện bài livestream +
// số người xem). Cache 60s/page. liveViews = người xem ĐỒNG THỜI (chỉ có ý nghĩa khi LIVE).
const _liveCache = new Map();
async function getLiveVideoMap(pageId, pageToken) {
    const c = _liveCache.get(pageId);
    if (c && Date.now() - c.at < 60000) return c.map;
    const map = {};
    try {
        const url = `${GRAPH}/${pageId}/live_videos?fields=status,live_views,video{id}&limit=100&access_token=${encodeURIComponent(pageToken)}`;
        const data = await gfetch(url);
        (data.data || []).forEach((v) => {
            const vid = v.video && v.video.id;
            if (vid)
                map[String(vid)] = {
                    status: v.status || 'VOD',
                    liveViews: typeof v.live_views === 'number' ? v.live_views : null,
                };
        });
    } catch (_) {
        /* page không cho liệt kê live → bỏ, video sẽ xếp loại 'video' */
    }
    _liveCache.set(pageId, { at: Date.now(), map });
    return map;
}

// Lấy entry trong liveMap, chấp nhận cả format cũ (string status) lẫn mới ({status,liveViews}).
function _liveEntry(liveMap, targetId) {
    const e = liveMap && targetId ? liveMap[targetId] : null;
    if (!e) return null;
    return typeof e === 'string' ? { status: e, liveViews: null } : e;
}

/** Phân loại 1 bài: live | video | photo | text (+ living nếu đang phát, liveViews nếu có). */
function classifyPost(p, liveMap = {}) {
    const isVideo =
        p.mediaType === 'video' || p.statusType === 'added_video' || /video/.test(p.attType || '');
    const le = _liveEntry(liveMap, p.targetId);
    if (isVideo && le) {
        return { type: 'live', living: le.status === 'LIVE', liveViews: le.liveViews };
    }
    if (isVideo) return { type: 'video', living: false };
    const isPhoto =
        p.mediaType === 'album' ||
        p.mediaType === 'photo' ||
        p.statusType === 'added_photos' ||
        /photo|album/.test(p.attType || '');
    if (isPhoto) return { type: 'photo', living: false };
    return { type: 'text', living: false };
}

/** Chuẩn hoá 1 post detail (ảnh từ attachments+subattachments, comment, engagement). */
function shapePostDetail(p) {
    const images = [];
    const videos = [];
    const collect = (m) => {
        if (!m || !m.media) return;
        if (m.media.source) videos.push(m.media.source);
        const src = m.media.image && m.media.image.src;
        if (src) images.push(src);
    };
    const att = p.attachments && p.attachments.data && p.attachments.data[0];
    if (att) {
        const subs = att.subattachments && att.subattachments.data;
        if (subs && subs.length) subs.forEach(collect);
        else collect(att);
    }
    if (!images.length && p.full_picture) images.push(p.full_picture);
    return {
        id: String(p.id),
        message: p.message || '',
        createdTime: p.created_time || null,
        permalink: p.permalink_url || '',
        statusType: p.status_type || '',
        images: [...new Set(images)],
        videos,
        likes: p.likes && p.likes.summary ? p.likes.summary.total_count : null,
        comments: p.comments && p.comments.summary ? p.comments.summary.total_count : null,
        shares: p.shares ? p.shares.count : null,
        commentList: ((p.comments && p.comments.data) || []).map((c) => ({
            name: (c.from && c.from.name) || '',
            picture:
                (c.from && c.from.picture && c.from.picture.data && c.from.picture.data.url) || '',
            message: c.message || '',
            createdTime: c.created_time || null,
        })),
    };
}

/** Chi tiết 1 bài (đủ ảnh + comment + engagement) để xem như trên Facebook.
 * Thử field giàu (cần pages_read_user_content cho comment); lỗi → fallback chỉ ảnh+text. */
async function getPostDetail(postId, pageToken) {
    const rich =
        'id,message,created_time,permalink_url,status_type,full_picture,' +
        'attachments{type,media,subattachments{media}},' +
        'likes.summary(true).limit(0),' +
        'comments.summary(true).limit(30){from{name,picture},message,created_time},shares';
    const basic =
        'id,message,created_time,permalink_url,status_type,full_picture,' +
        'attachments{type,media,subattachments{media}}';
    const fetchWith = (fields) =>
        gfetch(
            `${GRAPH}/${postId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(pageToken)}`
        );
    let data;
    try {
        data = await fetchWith(rich);
    } catch (_) {
        data = await fetchWith(basic); // page thiếu quyền đọc comment → vẫn xem được ảnh+text
    }
    return shapePostDetail(data);
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

// ── Thống kê tương tác (engagement) ────────────────────────────────────────

/** Thông tin cơ bản page: follower, talking_about. */
async function getPageBasic(pageId, pageToken) {
    const url = `${GRAPH}/${pageId}?fields=name,fan_count,followers_count,talking_about_count,link&access_token=${encodeURIComponent(pageToken)}`;
    return gfetch(url);
}

/** Lấy N bài kèm số like/comment/share (để tính tổng tương tác, top bài, khung giờ).
 * Cần pages_read_user_content cho summary; lỗi → fallback list không có số. */
async function getEngagementPosts(pageId, pageToken, limit = 50, liveMap = {}) {
    const rich =
        'id,message,created_time,full_picture,permalink_url,status_type,' +
        'attachments{media_type,type,target{id}},' +
        'likes.summary(true).limit(0),comments.summary(true).limit(0),shares';
    const basic =
        'id,message,created_time,full_picture,permalink_url,status_type,attachments{media_type,type,target{id}}';
    const fetchF = (fields) =>
        gfetch(
            `${GRAPH}/${pageId}/posts?fields=${encodeURIComponent(fields)}&limit=${Math.min(100, limit)}&access_token=${encodeURIComponent(pageToken)}`
        );
    let data;
    let hasEngagement = true;
    try {
        data = await fetchF(rich);
    } catch (_) {
        hasEngagement = false;
        data = await fetchF(basic);
    }
    const posts = (data.data || []).map((p) => {
        const att = (p.attachments && p.attachments.data && p.attachments.data[0]) || {};
        const likes = p.likes && p.likes.summary ? p.likes.summary.total_count : 0;
        const comments = p.comments && p.comments.summary ? p.comments.summary.total_count : 0;
        const shares = p.shares ? p.shares.count : 0;
        const base = {
            id: String(p.id),
            message: p.message || '',
            createdTime: p.created_time || null,
            picture: p.full_picture || '',
            permalink: p.permalink_url || '',
            statusType: p.status_type || '',
            mediaType: att.media_type || '',
            attType: att.type || '',
            targetId: att.target && att.target.id ? String(att.target.id) : '',
            likes,
            comments,
            shares,
            total: likes + comments + shares,
        };
        return { ...base, ...classifyPost(base, liveMap) };
    });
    return { posts, hasEngagement };
}

// ── Insights THẬT (cần read_insights) ──────────────────────────────────────
// read_insights cho page/bài mình quản lý KHÔNG cần Page Public Content Access → đây là
// nguồn reach/impressions/reactions/video-views CHUẨN, thay cho likes/comments.summary
// (vốn đòi feature review). Mọi hàm dưới đây resilient: thiếu quyền/metric → trả rỗng.

/** Chạy fn cho từng item, giới hạn số request song song (tránh đập rate-limit FB). */
async function mapPool(items, fn, concurrency = 8) {
    const out = new Array(items.length);
    let idx = 0;
    const workers = new Array(Math.min(concurrency, items.length || 1)).fill(0).map(async () => {
        while (idx < items.length) {
            const i = idx++;
            try {
                out[i] = await fn(items[i], i);
            } catch (_) {
                out[i] = null;
            }
        }
    });
    await Promise.all(workers);
    return out;
}

// Lấy value cuối của 1 metric insight (value có thể là số hoặc object reactions-by-type).
function _insightVal(metricObj) {
    const vals = metricObj && metricObj.values;
    if (!Array.isArray(vals) || !vals.length) return null;
    return vals[vals.length - 1].value;
}
function _sumObj(o) {
    if (o && typeof o === 'object')
        return Object.values(o).reduce((s, v) => s + (Number(v) || 0), 0);
    return Number(o) || 0;
}

const POST_INSIGHT_METRICS =
    'post_impressions,post_impressions_unique,post_clicks,post_reactions_by_type_total,post_video_views';

/** Insights 1 bài → {impressions, reach, clicks, reactions, videoViews} (null nếu không có). */
async function getPostInsights(postId, pageToken) {
    const url = `${GRAPH}/${postId}/insights?metric=${POST_INSIGHT_METRICS}&access_token=${encodeURIComponent(pageToken)}`;
    let data;
    try {
        data = await gfetch(url);
    } catch (_) {
        return null; // bài cũ / không có insights / thiếu quyền
    }
    const m = {};
    (data.data || []).forEach((d) => (m[d.name] = _insightVal(d)));
    const has = (k) => m[k] !== undefined && m[k] !== null;
    return {
        impressions: has('post_impressions') ? Number(m.post_impressions) || 0 : null,
        reach: has('post_impressions_unique') ? Number(m.post_impressions_unique) || 0 : null,
        clicks: has('post_clicks') ? Number(m.post_clicks) || 0 : null,
        reactions: has('post_reactions_by_type_total')
            ? _sumObj(m.post_reactions_by_type_total)
            : null,
        videoViews: has('post_video_views') ? Number(m.post_video_views) || 0 : null,
    };
}

// Bao nhiêu bài đầu được enrich insights (giới hạn để không bắn quá nhiều request).
const INSIGHT_ENRICH_CAP = 80;

/** Gắn insights thật vào danh sách bài (reach/impressions/reactions/videoViews).
 * Trả {posts, hasInsights}. hasInsights=true nếu ÍT NHẤT 1 bài lấy được insights. */
async function enrichPostsWithInsights(pageToken, posts) {
    if (!posts || !posts.length) return { posts: posts || [], hasInsights: false };
    const head = posts.slice(0, INSIGHT_ENRICH_CAP);
    const ins = await mapPool(head, (p) => getPostInsights(p.id, pageToken), 8);
    let hasInsights = false;
    const enriched = posts.map((p, i) => {
        const x = i < ins.length ? ins[i] : null;
        if (!x) return p;
        if (x.reach != null || x.reactions != null) hasInsights = true;
        const reactions = x.reactions != null ? x.reactions : p.likes || 0;
        return {
            ...p,
            reach: x.reach,
            impressions: x.impressions,
            clicks: x.clicks,
            videoViews: x.videoViews,
            reactions,
            // total tương tác ưu tiên reactions thật từ insights + comment/share đã có
            total: reactions + (p.comments || 0) + (p.shares || 0),
        };
    });
    return { posts: enriched, hasInsights };
}

// Metric page-level thử lấy (period 28 ngày). FB đã deprecate nhiều metric → PROBE từng cái,
// cái nào lỗi thì bỏ, không làm hỏng cả response.
const PAGE_INSIGHT_METRICS = [
    'page_impressions_unique', // reach 28 ngày
    'page_impressions', // hiển thị
    'page_post_engagements', // lượt tương tác bài
    'page_views_total', // lượt xem trang
    'page_fan_adds_unique', // follow mới
    'page_fan_removes_unique', // bỏ follow
];

/** Page insights 28 ngày (resilient probe). Trả map metric→số + danh sách available. */
async function getPageInsights(pageId, pageToken) {
    const results = await mapPool(
        PAGE_INSIGHT_METRICS,
        async (metric) => {
            const url = `${GRAPH}/${pageId}/insights/${metric}?period=days_28&access_token=${encodeURIComponent(pageToken)}`;
            const data = await gfetch(url);
            const v = _insightVal((data.data || [])[0]);
            return { metric, value: v == null ? null : Number(_sumObj(v)) };
        },
        4
    );
    const out = {};
    const available = [];
    results.forEach((r) => {
        if (r && r.value != null) {
            out[r.metric] = r.value;
            available.push(r.metric);
        }
    });
    return { metrics: out, available };
}

// ── Thống kê quảng cáo (ads) ─────────────────────────────────────────────────

function _shapeAcct(a, source) {
    return {
        id: a.id || `act_${a.account_id}`,
        accountId: a.account_id,
        name: a.name || a.account_id,
        status: a.account_status,
        currency: a.currency || '',
        amountSpent: a.amount_spent || '0',
        source: source || '',
    };
}

/** Tài khoản quảng cáo user truy cập được: /me/adaccounts (cá nhân + chia sẻ trực tiếp)
 * + qua Business Manager (owned_ad_accounts + client_ad_accounts). Gom + dedupe.
 * → KHÔNG cần đăng nhập đúng người chạy QC, chỉ cần là thành viên BM (cần ads_read +
 * business_management). */
async function getAdAccounts(userToken) {
    const enc = encodeURIComponent;
    const F = 'id,account_id,name,account_status,currency,amount_spent';
    const map = new Map();
    const add = (a, src) => {
        if (a && a.account_id && !map.has(a.account_id)) map.set(a.account_id, _shapeAcct(a, src));
    };
    // 1) Trực tiếp
    try {
        const d = await gfetch(
            `${GRAPH}/me/adaccounts?fields=${F}&limit=200&access_token=${enc(userToken)}`
        );
        (d.data || []).forEach((a) => add(a, 'Cá nhân / chia sẻ'));
    } catch (_) {
        /* tiếp tục với BM */
    }
    // 2) Qua Business Manager (bắt được ad account của shop dù không chia sẻ trực tiếp)
    try {
        const biz = await gfetch(
            `${GRAPH}/me/businesses?fields=id,name&limit=50&access_token=${enc(userToken)}`
        );
        for (const b of biz.data || []) {
            for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
                try {
                    const r = await gfetch(
                        `${GRAPH}/${b.id}/${edge}?fields=${F}&limit=200&access_token=${enc(userToken)}`
                    );
                    (r.data || []).forEach((a) => add(a, b.name || 'Business'));
                } catch (_) {
                    /* edge này không truy cập được → bỏ qua */
                }
            }
        }
    } catch (_) {
        /* user không có/không xem được BM */
    }
    return [...map.values()];
}

/** Insights 1 tài khoản quảng cáo + breakdown theo campaign (cần ads_read). */
async function getAdInsights(actId, userToken, preset = 'last_30d') {
    const act = String(actId).startsWith('act_') ? actId : `act_${actId}`;
    const sumFields = 'spend,impressions,reach,clicks,cpc,cpm,ctr,frequency,actions,action_values';
    const campFields = 'campaign_name,campaign_id,spend,impressions,reach,clicks,ctr,actions';
    const u = (lvl, fields) =>
        `${GRAPH}/${act}/insights?${lvl ? `level=${lvl}&` : ''}fields=${encodeURIComponent(fields)}&date_preset=${encodeURIComponent(preset)}&limit=100&access_token=${encodeURIComponent(userToken)}`;
    const [sumD, campD] = await Promise.all([
        gfetch(u('', sumFields)).catch((e) => ({ _err: e.message })),
        gfetch(u('campaign', campFields)).catch(() => ({})),
    ]);
    return {
        summary: (sumD.data && sumD.data[0]) || {},
        error: sumD._err || null,
        campaigns: campD.data || [],
    };
}

module.exports = {
    GRAPH_VERSION,
    SCHEDULE_MIN_SEC,
    SCHEDULE_MAX_SEC,
    hasApp,
    getPageBasic,
    getEngagementPosts,
    enrichPostsWithInsights,
    getPostInsights,
    getPageInsights,
    getAdAccounts,
    getAdInsights,
    SCOPES_POST,
    SCOPES_FULL,
    buildOAuthDialogUrl,
    exchangeCodeForToken,
    exchangeLongLivedToken,
    getMe,
    getPages,
    publishToPage,
    deletePost,
    updatePostMessage,
    updatePost,
    listPagePosts,
    listScheduledPosts,
    getPostDetail,
    getLiveVideoMap,
    classifyPost,
    normalizeScheduleSec,
};
