// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// LiveSnap module: snap-state (shared state, constants, resolvers, helpers)
// Tách MOVE-only từ live-livestream-snap.js (2026-06-19). Chia sẻ state qua
// internal namespace window.LiveSnap. Public API window.LiveLivestreamSnap do
// live-livestream-snap-init.js dựng. Load TRƯỚC snap-init theo thứ tự phụ thuộc.
// =====================================================
(function () {
    'use strict';
    const global = window;
    const NS = (global.LiveSnap = global.LiveSnap || {});

    NS.API = global.SHOP_CONFIG?.RENDER_API_URL || 'https://web2-api-kv04.onrender.com';

    NS.LS_KEY_SNAP_PAGE = 'web2_snap_live_page';

    NS.LS_KEY_SNAP_MODE = 'web2_snap_mode';

    NS.LS_KEY_AUTO_MODE = 'web2_snap_auto';

    NS.LS_KEY_INLINE_THUMB = 'web2_snap_inline_thumb';

    NS.AUTO_THROTTLE_MS = 30 * 1000;

    NS.MODE_LIVE = 'live';

    NS.MODE_LAZY = 'lazy';

    NS.PAGE_VANITY = {
        117267091364524: 'NhiJudyHouse.VietNam', // Nhi Judy House
        270136663390370: 'NhiJudyStore', // NhiJudy Store
    };

    NS._liveVideoInfoCache = new Map();

    NS.STATE = {
        counts: {}, // customerFbUserId → count
        cacheList: new Map(), // customerFbUserId → snapshots[]
        snapByComment: new Map(), // commentId → { thumbnailUrl, livestreamUrl, offsetSeconds, id }
        snapByCommentPending: new Set(), // commentIds chờ fetch (debounce gom batch)
        snapByCommentTimer: null,
        popoverOpen: null, // customerFbUserId
        // Phase 3 — persistent screen capture stream
        captureStream: null, // MediaStream
        captureVideo: null, // <video> element (hidden, dùng draw frame)
        captureCanvas: null, // <canvas> element (cached)
        // Auto-mode — throttle per customer
        autoLastSnap: new Map(), // customerFbUserId → lastTs (ms)
        autoStats: { total: 0, throttled: 0, errors: 0 }, // session counter
        // N2Store Extension capture (no popup) — set khi nhận EXTENSION_LOADED
        extReady: false,
        extCapturePending: new Map(), // requestId → { resolve, reject, timer }
    };

    // Bề rộng ô video live (px). Cũng là độ phân giải capture (snap-capture đọc
    // videoWidth động nên an toàn khi đổi). To hơn 2026-06-22: cột Video riêng →
    // ô video lớn dễ nhìn + frame chụp nét hơn (160 → 224).
    NS.SNAP_VIDEO_W = 224;

    NS.SNAP_VIDEO_HEADER = 30;

    NS.SNAP_VIDEO_H = Math.round((NS.SNAP_VIDEO_W * 16) / 9);

    NS.REQUIRED_EXT_VERSION = '1.0.13';

    NS._w2AuthHeaders = function (extra) {
        if (global.Web2Auth?.authHeaders) return global.Web2Auth.authHeaders(extra);
        const h = { ...(extra || {}) };
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {
            /* no token */
        }
        return h;
    };

    NS._isVanitySlug = function (v) {
        return typeof v === 'string' && /^[A-Za-z0-9._-]+$/.test(v) && v.length >= 3;
    };

    NS._resolvePageVanity = function (pageObj) {
        if (!pageObj) return null;
        // Ưu tiên PAGE_VANITY mapping (known good) → các field potential khác phải
        // pass _isVanitySlug check trước khi dùng.
        const mapping = NS.PAGE_VANITY[pageObj.Facebook_PageId];
        if (mapping) return mapping;
        for (const f of ['Username', 'Vanity', 'Facebook_UserName']) {
            const v = pageObj[f];
            if (NS._isVanitySlug(v)) return v;
        }
        return null;
    };

    NS._cmpVersions = function (a, b) {
        const aa = String(a || '0')
            .split('.')
            .map(Number);
        const bb = String(b || '0')
            .split('.')
            .map(Number);
        for (let i = 0; i < 3; i++) {
            const x = aa[i] || 0;
            const y = bb[i] || 0;
            if (x > y) return 1;
            if (x < y) return -1;
        }
        return 0;
    };

    NS._pageActiveForCapture = function () {
        return document.visibilityState === 'visible' && document.hasFocus();
    };

    NS._isFrameBlank = function (ctx, w, h) {
        let data;
        try {
            data = ctx.getImageData(0, 0, w, h).data;
        } catch {
            return false;
        }
        const total = w * h;
        if (total <= 0) return true;
        const step = Math.max(1, Math.floor(total / 1024)); // ~1024 mẫu, đủ tin cậy
        let sum = 0;
        let max = 0;
        let n = 0;
        for (let i = 0; i < total; i += step) {
            const o = i * 4;
            const lum = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
            sum += lum;
            if (lum > max) max = lum;
            n++;
        }
        const mean = n ? sum / n : 0;
        // mean<10 & max<24 (thang 0-255): gần như đen tuyền. Scene tối thật vẫn có
        // highlight (max cao hơn) nên không bị bỏ nhầm.
        return mean < 10 && max < 24;
    };

    NS._getSnapPagePref = function () {
        return localStorage.getItem(NS.LS_KEY_SNAP_PAGE) || 'store';
    };

    NS._setSnapPagePref = function (v) {
        localStorage.setItem(NS.LS_KEY_SNAP_PAGE, v);
        NS.renderHeaderChip();
    };

    NS._getSnapMode = function () {
        return localStorage.getItem(NS.LS_KEY_SNAP_MODE) || NS.MODE_LIVE;
    };

    NS._setSnapMode = function (v) {
        localStorage.setItem(NS.LS_KEY_SNAP_MODE, v);
        NS.renderRealSnapChip();
        NS.renderAutoModeChip();
    };

    NS._isAutoMode = function () {
        // Default ON: nếu chưa từng set, coi như 'on' để user vào livestream
        // là tự nhận diện + chụp ngay. User có thể tắt qua chip.
        const v = localStorage.getItem(NS.LS_KEY_AUTO_MODE);
        return v === null ? true : v === 'on';
    };

    NS._setAutoMode = function (on) {
        localStorage.setItem(NS.LS_KEY_AUTO_MODE, on ? 'on' : 'off');
        NS.renderAutoModeChip();
    };

    NS._isInlineThumbOn = function () {
        return true;
    };

    NS._setInlineThumb = function (_on) {
        // No-op — toggle removed.
        document.querySelectorAll('.live-conversation-item[data-comment-id]').forEach((row) => {
            const cid = row.dataset.commentId;
            if (!cid) return;
            if (NS.STATE.snapByComment.has(cid)) NS._renderThumbStripFor(cid);
            else NS._queueSnapByComment(cid);
        });
    };

    NS._resolvePageObj = function () {
        const st = global.LiveState;
        if (!st?.allPages) return null;
        const pref = NS._getSnapPagePref();
        return (
            st.allPages.find((p) => {
                const n = (p.Name || '').toLowerCase();
                if (pref === 'house') return n.includes('house');
                return n.includes('store');
            }) || st.selectedPage
        );
    };

    NS._resolveActiveCampaign = function (pageObj) {
        const st = global.LiveState;
        if (!st?.liveCampaigns?.length || !pageObj) return null;
        const sel = st.selectedCampaign;
        if (sel && sel._pageObj?.Facebook_PageId === pageObj.Facebook_PageId) return sel;
        // Tìm campaign matching page, sắp xếp DateCreated desc (mới nhất trước)
        const matching = st.liveCampaigns
            .filter((c) => c.Facebook_UserId === pageObj.Facebook_PageId)
            .sort(
                (a, b) =>
                    SharedUtils.toEpochMs(b.DateCreated) - SharedUtils.toEpochMs(a.DateCreated)
            );
        return matching[0] || st.liveCampaigns[0] || null;
    };

    NS._findActiveLiveCampaign = function () {
        const st = global.LiveState;
        if (!st?.liveCampaigns?.length) return null;
        // Sort by DateCreated desc → live mới nhất trước.
        const sorted = [...st.liveCampaigns].sort(
            (a, b) => SharedUtils.toEpochMs(b.DateCreated) - SharedUtils.toEpochMs(a.DateCreated)
        );
        // Ưu tiên live của page pref (Store/House).
        const pref = NS._getSnapPagePref();
        const prefMatch = sorted.find((c) => {
            const pageObj = st.allPages?.find((p) => p.Facebook_PageId === c.Facebook_UserId);
            if (!pageObj) return false;
            const n = (pageObj.Name || '').toLowerCase();
            return pref === 'house' ? n.includes('house') : n.includes('store');
        });
        return prefMatch || sorted[0] || null;
    };

    NS._buildFbLiveUrl = function (camp) {
        if (!camp?.Facebook_LiveId) return null;
        const st = global.LiveState;
        const pageObj = st?.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId);
        const slug = NS._resolvePageVanity(pageObj) || camp.Facebook_UserId;
        const videoIdShort = String(camp.Facebook_LiveId).replace(/^\d+_/, '');
        return `https://www.facebook.com/${slug}/videos/${videoIdShort}/`;
    };

    NS._resolveTopCampaigns = function (limit = 2) {
        const st = global.LiveState;
        if (!st?.liveCampaigns?.length) return [];
        return st.liveCampaigns
            .slice()
            .sort(
                (a, b) =>
                    SharedUtils.toEpochMs(b.DateCreated) - SharedUtils.toEpochMs(a.DateCreated)
            )
            .slice(0, limit);
    };

    NS._resolveCampaignForComment = function (comment) {
        const st = global.LiveState;
        if (!st?.liveCampaigns?.length) return null;
        // Path 1: comment đã có _campaignId
        // ⚠ DB rows: _campaignId = web2_live_parent_campaigns id (chiến dịch CHA),
        // KHÔNG cùng id-space với liveCampaigns (FB video) → thường không match,
        // giữ cho comment live-fetch cũ.
        if (comment._campaignId) {
            const found = st.liveCampaigns.find((c) => c.Id === comment._campaignId);
            if (found) return found;
        }
        // Path 1.5 (FIX 2026-06-11): match theo BÀI — DB comment có _postId,
        // Live campaign (FB video) Id/Facebook_LiveId cùng format `pageId_videoId`.
        // Thiếu path này: 2 live cùng 1 page → Path 2 (match page) chọn SAI video
        // → force extract seek nhầm VOD → thumbnail sai hàng loạt.
        const postId = String(comment._postId || comment.post_id || '');
        if (postId) {
            const short = postId.replace(/^\d+_/, '');
            const byPost = st.liveCampaigns.find((c) => {
                const lid = String(c.Facebook_LiveId || '');
                const cid = String(c.Id || '');
                return (
                    lid === postId ||
                    cid === postId ||
                    (short &&
                        (lid.replace(/^\d+_/, '') === short || cid.replace(/^\d+_/, '') === short))
                );
            });
            if (byPost) return byPost;
        }
        // Path 2: match qua pageId
        const top = NS._resolveTopCampaigns(2);
        const commentPageId = comment._pageId || comment.from?.id;
        if (commentPageId) {
            const match = top.find((c) => c.Facebook_UserId === commentPageId);
            if (match) return match;
        }
        // Path 3: campaign mới nhất
        return top[0] || null;
    };

    NS._user = function () {
        const u = global.AuthManager?.getCurrentUser?.() || {};
        return { id: u.uid || u.email || null, name: u.displayName || u.email || null };
    };

    NS._toast = function (msg, type = 'ok') {
        if (type === 'err' || type === 'error') {
            if (global.notificationManager?.show) {
                global.notificationManager.show(msg, 'error');
            } else {
                console.log('[snap-toast]', type, msg);
            }
            return;
        }
        // Success/ok/info: console-only, no UI notification.
        console.log('[snap-toast]', type, msg);
    };

    NS._fmtOffset = function (sec) {
        const n = Number(sec);
        if (!Number.isFinite(n) || n <= 0) return '';
        const h = Math.floor(n / 3600);
        const m = Math.floor((n % 3600) / 60);
        const s = n % 60;
        if (h) return `+${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
        if (m) return `+${m}m${String(s).padStart(2, '0')}s`;
        return `+${s}s`;
    };

    NS._esc = function (s) {
        return String(s || '').replace(
            /[&<>"']/g,
            (c) =>
                ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                })[c]
        );
    };

    NS._isStaffComment = function (c) {
        const st = global.LiveState;
        const fid = String(c?.from?.id || '');
        if (!fid) return false;
        // FIX 2026-06-11: multi-page mode selectedPage chỉ là 1 page → so riêng
        // selectedPage BỎ SÓT comment do page KHÁC đăng (đo thật: 830 comment
        // "NhiJudy Store" lọt khi selectedPage=House → force extract chụp vô ích
        // + harvest page vào kho KH). Check _pageId của chính comment + mọi page.
        if (c._pageId && fid === String(c._pageId)) return true;
        if (fid === String(st?.selectedPage?.Facebook_PageId || '')) return true;
        return (st?.allPages || []).some((p) => String(p.Facebook_PageId) === fid);
    };

    NS._fetchLiveVideoInfo = async function (pageId, liveVideoId) {
        if (!pageId || !liveVideoId) return null;
        const cacheKey = `${pageId}:${liveVideoId}`;
        const cached = NS._liveVideoInfoCache.get(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) return cached.info;
        try {
            // 2026-06-07: Live /facebook/livevideo đã gỡ → FB Graph (web2-fb-live).
            if (!global.LiveSource?.fetchVideosAsCampaigns) return null;
            const res = await global.LiveSource.fetchVideosAsCampaigns([pageId]);
            const camps = Array.isArray(res) ? res : res?.campaigns || [];
            const videoId = String(liveVideoId).replace(/^\d+_/, '');
            const match = (camps || []).find(
                (c) => c.Facebook_LiveId === liveVideoId || c.Id === videoId
            );
            if (!match) {
                // Video KHÔNG còn trong list FB-live của page → đã bị XÓA / unpublish /
                // hết hạn. Trả notFound (khác null=lỗi mạng) để force-extract báo rõ.
                console.warn('[snap] video not found in FB-live list (deleted?):', liveVideoId);
                return { notFound: true };
            }
            const startMs = match.DateCreated
                ? (SharedUtils.parseTimestamp(match.DateCreated)?.getTime() ?? null)
                : null;
            // FB Graph /{videoId}/thumbnails (is_preferred) — thay /picture 400.
            const thumbnailUrl = match._thumbnail || null;
            const info = {
                broadcastStartMs: Number.isFinite(startMs) ? startMs : null,
                title: match.Name || null,
                statusLive: match.StatusLive,
                thumbnailUrl,
            };
            NS._liveVideoInfoCache.set(cacheKey, { info, fetchedAt: Date.now() });
            // Log terse — không in title/thumbnailUrl (log noise + URL signed).
            console.log('[snap] live video info OK — statusLive:', info.statusLive);
            return info;
        } catch (e) {
            console.warn('[snap] fetch live video info fail:', e.message);
            return null;
        }
    };
})();
