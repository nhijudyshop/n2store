// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Live Column Initializer — STATE / SHARED helpers module.
 *
 * Tách MOVE-only từ live-init.js (2026-06-19) thành 4 module nhỏ (<800 dòng).
 * Module này CHỨA:
 *   - Internal namespace window._LiveInit (shared helpers/state giữa các module split)
 *   - Cache live videos per pageId + 2 helper resolve campaign live posts
 *   - Tạo SHELL public object window.LiveColumnManager (object base: _loadGen +
 *     _w2AuthHeaders) — các module sau Object.assign methods vào CÙNG object → mọi
 *     `this.method()` + external window.LiveColumnManager.method() giữ nguyên.
 *
 * Load theo thứ tự phụ thuộc: state → wiring → lifecycle → init-entry.
 * state PHẢI load TRƯỚC mọi module khác (dựng namespace + shell).
 *
 * Dependencies: LiveState, LiveSource, SharedUtils, Web2Auth (optional)
 */
(function () {
    'use strict';

    // Internal namespace chia sẻ helpers/state giữa các module split.
    const NS = (window._LiveInit = window._LiveInit || {});

    // Cache live videos per pageId (5 phút TTL). Live livevideo endpoint trả
    // list FB Live broadcasts gần đây cho page. Mỗi broadcast = 1 Facebook_PostId.
    // Cần cho việc resolve all post IDs thuộc 1 campaign (Live web "Bài live"
    // shows MULTIPLE post IDs per campaign — selecting campaign chỉ lấy 1 post
    // → missing comments của các post khác cùng campaign).
    const _liveVideosCachePerPage = new Map(); // pageId → { videos, fetchedAt }
    const LIVE_VIDEOS_CACHE_TTL_MS = 5 * 60 * 1000;

    async function _fetchLiveVideosForPage(pageId) {
        const cached = _liveVideosCachePerPage.get(pageId);
        if (cached && Date.now() - cached.fetchedAt < LIVE_VIDEOS_CACHE_TTL_MS) {
            return cached.videos;
        }
        // 2026-06-07: Live /facebook/livevideo đã gỡ → dùng FB Graph (web2-fb-live).
        if (!window.LiveSource?.fetchVideosAsCampaigns) return [];
        try {
            const res = await window.LiveSource.fetchVideosAsCampaigns([pageId]);
            const camps = Array.isArray(res) ? res : res?.campaigns || [];
            const videos = (camps || []).map((c) => ({
                objectId: c.Facebook_LiveId, // pageId_videoId
                title: c.Name || '',
                startMs: c.DateCreated ? SharedUtils.toEpochMs(c.DateCreated) || null : null,
                statusLive: c.StatusLive,
                countComment: 0,
            }));
            _liveVideosCachePerPage.set(pageId, { videos, fetchedAt: Date.now() });
            return videos;
        } catch (e) {
            console.warn('[Live-INIT] fetchLiveVideosForPage fail:', pageId, e.message);
            return [];
        }
    }

    // Resolve all Facebook_PostIds thuộc 1 campaign. Logic: campaign reuses cho
    // các live tạo sau DateCreated, until next campaign created on same page.
    // Lives match: startMs ∈ [campaign.DateCreated, nextCampaignOfPage.DateCreated).
    function _resolveCampaignLivePosts(campaign, allCampaigns, liveVideos) {
        if (!campaign?.Facebook_UserId) return [];
        const pageCamps = allCampaigns
            .filter((c) => c.Facebook_UserId === campaign.Facebook_UserId)
            .map((c) => ({ ...c, _ts: SharedUtils.toEpochMs(c.DateCreated) }))
            .filter((c) => Number.isFinite(c._ts))
            .sort((a, b) => a._ts - b._ts);
        const campIdx = pageCamps.findIndex((c) => c.Id === campaign.Id);
        if (campIdx === -1) return [];
        const startMs = pageCamps[campIdx]._ts;
        const endMs = campIdx < pageCamps.length - 1 ? pageCamps[campIdx + 1]._ts : Infinity;
        return liveVideos.filter(
            (lv) => Number.isFinite(lv.startMs) && lv.startMs >= startMs && lv.startMs < endMs
        );
    }

    // Expose helpers/state vào internal namespace cho các module method tham chiếu.
    NS._liveVideosCachePerPage = _liveVideosCachePerPage;
    NS.LIVE_VIDEOS_CACHE_TTL_MS = LIVE_VIDEOS_CACHE_TTL_MS;
    NS._fetchLiveVideosForPage = _fetchLiveVideosForPage;
    NS._resolveCampaignLivePosts = _resolveCampaignLivePosts;

    // Public object SHELL — methods được Object.assign vào từ các module sau. Tạo
    // shell ở đây (TRƯỚC mọi module) để external code (app-init, live-campaign-manager,
    // live-livestream-snap…) luôn thấy window.LiveColumnManager tồn tại theo load order.
    const LiveColumnManager = window.LiveColumnManager || {};

    // Generation counter chống race khi onMultiCampaignChange chạy chồng
    // (load cũ đang await mà user đổi campaign → load cũ phải bỏ kết quả).
    if (typeof LiveColumnManager._loadGen !== 'number') LiveColumnManager._loadGen = 0;

    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho route soft-gated (WEB2_AUTH_ENFORCE).
    // Không token (chưa login web2) → bỏ qua header, request vẫn đi (server enforce → 401).
    LiveColumnManager._w2AuthHeaders = function (extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        const h = { ...(extra || {}) };
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {
            /* no token */
        }
        return h;
    };

    if (typeof window !== 'undefined') {
        window.LiveColumnManager = LiveColumnManager;
    }
})();
