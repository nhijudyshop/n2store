// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Live Column Initializer & Orchestrator
 * Wires together LiveState, LiveApi, LiveCommentList, LiveCustomerPanel, LiveRealtime
 * Exposes LiveColumnManager on window for backward compatibility
 */

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

const LiveColumnManager = {
    // Generation counter chống race khi onMultiCampaignChange chạy chồng
    // (load cũ đang await mà user đổi campaign → load cũ phải bỏ kết quả).
    _loadGen: 0,

    /**
     * Initialize the Live column
     * @param {string} containerId - DOM container ID
     */
    async initialize(containerId) {
        const state = window.LiveState;
        state.containerId = containerId;
        console.log('[Live-INIT] Initializing Live column in:', containerId);

        // Start cache cleanup
        state.startCacheCleanup();

        // Render container and selectors
        window.LiveCommentList.renderContainer();

        // Wire up event bus listeners
        this.setupEventListeners();

        // Setup realtime event listeners (WebSocket status)
        this.setupRealtimeListeners();

        // Chờ Pancake account JWT sẵn sàng TRƯỚC khi load campaign. Account nạp
        // async từ nhiều nguồn (token-manager.initialize + web2-chat-client
        // syncFromRenderDB) → nếu chưa có, fetchVideosAsCampaigns rỗng (bug: phải
        // chọn lại page mới hiện). Poll tới khi có token/account hoặc timeout.
        await this._waitForPancakeAccounts(9000);

        // Load CRM Teams
        await window.LiveApi.loadCRMTeams();
        window.LiveCommentList.renderCrmTeamOptions();

        // Restore saved page selection (mặc định 'all' → load campaign + auto-chọn)
        this.restoreSelection();

        // SSE PUSH-only (KHÔNG polling — user 2026-06-11): relay Pancake WS 24/7
        // nhận comment → /ingest → fetch per-message đúng post → DB → SSE topic
        // 'web2:live-comments' → đây nhận event → INCREMENTAL delta fetch. Debounce ~400ms gom burst → GET DB chỉ comment mới hơn
        // (since=_lastCommentMaxMs) → prepend dòng mới vào ĐẦU list (không full
        // re-render → mượt, kiểu TPOS realtime). KHÔNG reload toàn bộ.
        if (window.Web2SSE?.subscribe) {
            window.Web2SSE.subscribe('web2:live-comments', () => {
                clearTimeout(this._liveCommentsReloadTimer);
                this._liveCommentsReloadTimer = setTimeout(() => {
                    this._fetchLiveCommentDelta();
                }, 400);
            });

            // ⚠ KHÔNG subscribe 'web2:messages' để reload cột Live nữa
            // (bug 2026-06-11: mỗi tin nhắn INBOX bên cột Pancake làm cột Live
            // full reload + showLoading → trắng toàn bộ panel trái). Tin nhắn
            // inbox là việc của cột Pancake (pancake-realtime tự xử lý);
            // comment livestream đã có topic 'web2:live-comments' riêng ở trên.
        }
    },

    /**
     * Delta fetch comment livestream mới (SSE-driven). GET DB với since=
     * _lastCommentMaxMs cho các post đang chọn → map → prepend incremental.
     * Best-effort; lỗi không phá list đang hiển thị.
     */
    async _fetchLiveCommentDelta() {
        const state = window.LiveState;
        // Tập post đang xem = post của các campaign đang chọn.
        const ids = state.selectedCampaignIds ? Array.from(state.selectedCampaignIds) : [];
        if (!ids.length) return;
        const campaigns = ids
            .map((id) => state.liveCampaigns.find((c) => c.Id === id))
            .filter(Boolean);
        const postIdSet = new Set();
        for (const campaign of campaigns) {
            const pageLiveVideos =
                _liveVideosCachePerPage.get(campaign.Facebook_UserId)?.videos || [];
            let livePosts = _resolveCampaignLivePosts(
                campaign,
                state.liveCampaigns,
                pageLiveVideos
            );
            if (livePosts.length === 0 && campaign.Facebook_LiveId) {
                livePosts = [{ objectId: campaign.Facebook_LiveId }];
            }
            for (const lp of livePosts) if (lp.objectId) postIdSet.add(lp.objectId);
        }
        if (!postIdSet.size) return;
        // Guard: initial load CHƯA xong (cả 2 cursor đều 0) → bỏ qua delta.
        // Không guard thì since=0 dump cả nghìn row qua prependComments → emit
        // live:newComment hàng loạt → auto-snap chụp frame HIỆN TẠI gán cho
        // comment CŨ (sai ảnh). Full load sẽ lấy đủ data ngay sau đó.
        if (!this._lastCommentMaxMs && !this._lastUpdatedMaxMs) return;
        // Cursor delta = updated_at (epoch ms SERVER gán mỗi upsert) thay vì
        // created_time. Lý do (bug "mất tin nhắn" 2026-06-12): với 2+ campaign,
        // comment post B về trễ mang created_time < max(post A) bị since lọc
        // VĨNH VIỄN; và comment bị UPDATE (poller fill phone/has_order — H11)
        // không đổi created_time nên không bao giờ re-render. updated_at là
        // đồng hồ server đơn điệu → không dính skew giữa pages/posts.
        // Overlap 3s + prependComments merge-by-id → fetch lặp vô hại.
        const sinceUpdated = Math.max(0, (this._lastUpdatedMaxMs || 0) - 3000);
        const cursorParam = this._lastUpdatedMaxMs
            ? `sinceUpdated=${sinceUpdated}`
            : `since=${this._lastCommentMaxMs || 0}`; // fallback server cũ chưa trả updated_at
        try {
            const resp = await fetch(
                `${state.workerUrl}/api/web2-live-comments?postIds=${encodeURIComponent(
                    [...postIdSet].join(',')
                )}&${cursorParam}&limit=2000`,
                { signal: AbortSignal.timeout(15000) }
            );
            const j = await resp.json();
            if (!j.success || !Array.isArray(j.data) || j.data.length === 0) return;
            const mapped = j.data.map((row) => this._dbRowToComment(row));
            // Cập nhật cả 2 cursor theo delta (tránh fetch lặp comment cũ).
            this._lastCommentMaxMs = mapped.reduce((mx, c) => {
                const t = SharedUtils.toEpochMs(c.created_time);
                return t > mx ? t : mx;
            }, this._lastCommentMaxMs || 0);
            this._lastUpdatedMaxMs = mapped.reduce(
                (mx, c) => (c._updatedAt > mx ? c._updatedAt : mx),
                this._lastUpdatedMaxMs || 0
            );
            window.LiveCommentList.prependComments(mapped);
        } catch (e) {
            console.warn('[Live-INIT] live comment delta fetch fail:', e.message);
        }
    },

    /**
     * Chờ Pancake account JWT sẵn sàng (token-manager + web2-chat-client sync đều async).
     */
    async _waitForPancakeAccounts(timeoutMs) {
        const isExpired = (exp) => {
            if (!exp) return false; // không rõ exp → coi như còn dùng được
            return Date.now() / 1000 >= exp - 60;
        };
        // Account hết hạn CŨNG có .token → chỉ coi sẵn sàng khi activeAccountId trỏ
        // tới account có token CÒN HẠN.
        const ready = () => {
            const tm = window.pancakeTokenManager;
            if (!tm) return false;
            const a = (tm.accounts || {})[tm.activeAccountId];
            return !!(tm.activeAccountId && a && a.token && !isExpired(a.exp));
        };

        // initialize() nạp localStorage (gồm cache 'pancake_all_accounts') → nhanh.
        try {
            if (window.pancakeTokenManager?.initialize) {
                await window.pancakeTokenManager.initialize();
            }
        } catch (e) {
            console.warn('[Live-INIT] token init warn:', e.message);
        }

        // FAST PATH: cache localStorage đã có account còn hạn → dùng NGAY, sync
        // refresh chạy nền (không chặn). Lần sau vào load campaign tức thì.
        if (ready()) {
            if (window.Web2Chat?.syncFromRenderDB) {
                window.Web2Chat.syncFromRenderDB({ force: false }).catch(() => {});
            }
            return true;
        }

        // SLOW PATH (lần đầu / cache hết hạn): await sync lấy account hợp lệ.
        try {
            if (window.Web2Chat?.syncFromRenderDB) {
                await window.Web2Chat.syncFromRenderDB({ force: false });
            }
        } catch (e) {
            console.warn('[Live-INIT] syncFromRenderDB warn:', e.message);
        }
        const start = Date.now();
        while (!ready() && Date.now() - start < timeoutMs) {
            await new Promise((r) => setTimeout(r, 300));
        }
        return ready();
    },

    // Map 1 row web2_live_comments (DB) → comment shape FB-native cho renderer.
    // NGUỒN DUY NHẤT map DB row → comment (dùng cả load đầu + SSE delta prepend).
    _dbRowToComment(row) {
        const state = window.LiveState;
        const pageObj =
            (state.allPages || []).find((p) => String(p.Facebook_PageId) === String(row.page_id)) ||
            null;
        return {
            id: row.id,
            from: {
                id: row.fb_id || null,
                name: row.customer_name || '',
                picture: row.avatar ? { data: { url: row.avatar } } : undefined,
            },
            message: row.message || '',
            created_time: row.created_time || null,
            parent: null,
            post_id: row.post_id || null,
            _conv: true,
            _hasOrder: !!row.has_order,
            phone: row.phone || '',
            address: row.address || '',
            _phones: row.phone ? [{ phone_number: row.phone }] : [],
            _pageName: row.page_name || pageObj?.Name || '',
            _campaignId: row.campaign_id || null,
            campaign_id: row.campaign_id || null,
            _pageId: row.page_id || null,
            _pageObj: pageObj,
            _postId: row.post_id || null,
            _fromDb: true,
            // Epoch ms server gán mỗi upsert — cursor delta SSE (xem _fetchLiveCommentDelta).
            _updatedAt: Number(row.updated_at) || 0,
        };
    },

    // Backward-compat alias: live-campaign-manager.js gọi _mapDbComment.
    // Cùng 1 mapper (_dbRowToComment là tên canonical).
    _mapDbComment(row) {
        return this._dbRowToComment(row);
    },

    // Auto-save comment live-fetch vào web2_live_comments (best-effort, fire-and-forget).
    async _saveCommentsToDb(comments) {
        try {
            const payload = comments
                .slice(0, 2000)
                .map((c) => ({
                    id: c.id,
                    postId: c._postId,
                    pageId: c._pageId,
                    pageName: c._pageName,
                    fbId: c.from?.id,
                    name: c.from?.name,
                    avatar: c.from?.picture?.data?.url || null,
                    message: c.message,
                    createdTime: c.created_time,
                    phone:
                        (c._phones &&
                            c._phones[0] &&
                            (c._phones[0].phone_number || c._phones[0].phone)) ||
                        null,
                    hasOrder: !!c._hasOrder,
                }))
                .filter((c) => c.id);
            if (!payload.length) return;
            await fetch(`${window.LiveState.workerUrl}/api/web2-live-comments/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comments: payload }),
                signal: AbortSignal.timeout(15000),
            });
        } catch (e) {
            console.warn('[Live-INIT] saveCommentsToDb fail:', e.message);
        }
    },

    /**
     * Wire up EventBus listeners to orchestrate modules
     */
    setupEventListeners() {
        const bus = window.eventBus;

        // CRM Team / Page changed
        bus.on('live:crmTeamChanged', async (value) => {
            await this.onCrmTeamChange(value);
        });

        // Live Campaign changed (single - backward compat)
        bus.on('live:liveCampaignChanged', async (campaignId) => {
            await this.onLiveCampaignChange(campaignId);
        });

        // Multiple campaigns changed (new multi-select)
        // Debounce: tick từng checkbox campaign fire event NGAY → mỗi tick reload
        // + full render lại TẤT CẢ comment (growing). Tick 4 box = 4 reload+render
        // (đo được: 4 full render 241→647ms = giật). Gom các tick trong 500ms →
        // 1 reload duy nhất với tập campaign cuối cùng.
        bus.on('live:campaignsChanged', (campaignIds) => {
            clearTimeout(this._campaignChangeTimer);
            this._campaignChangeTimer = setTimeout(() => {
                const ids = window.LiveState.selectedCampaignIds
                    ? Array.from(window.LiveState.selectedCampaignIds)
                    : campaignIds;
                this.onMultiCampaignChange(ids);
            }, 500);
        });

        // Refresh requested
        bus.on('live:refreshRequested', async () => {
            await this.refresh();
        });

        // Load more (infinite scroll)
        bus.on('live:loadMoreRequested', async () => {
            await this.loadMoreComments();
        });
    },

    /**
     * Setup realtime WebSocket status listeners
     */
    setupRealtimeListeners() {
        // Giữ reference handler để destroy() removeEventListener được (tránh leak).
        this._onRtConnected = () => {
            window.LiveCommentList.updateConnectionStatus(true, 'session');
        };
        this._onRtDisconnected = () => {
            window.LiveCommentList.updateConnectionStatus(false, 'session');
        };
        window.addEventListener('liveRealtimeConnected', this._onRtConnected);
        window.addEventListener('liveRealtimeDisconnected', this._onRtDisconnected);
    },

    /**
     * Restore saved page selection from localStorage
     */
    restoreSelection() {
        const state = window.LiveState;
        const crmSelect = document.getElementById('liveCrmTeamSelect');
        const hasOption = (v) =>
            crmSelect && Array.from(crmSelect.options).some((o) => o.value === v);
        const savedPage = state.getSavedPageSelection();
        // Ưu tiên page đã lưu; nếu chưa có (lần đầu vào) → MẶC ĐỊNH "Tất cả Pages"
        // để campaign load + auto-chọn ngay (trước đây không default → dropdown
        // campaign rỗng, phải chọn lại page thủ công).
        let target = null;
        if (savedPage && hasOption(savedPage)) target = savedPage;
        else if (hasOption('all')) target = 'all';
        else if (state.allPages && state.allPages[0]) {
            const p = state.allPages[0];
            target = `${p.teamId != null ? p.teamId : 0}:${p.Id}`;
            if (!hasOption(target)) target = null;
        }
        if (target && crmSelect) {
            crmSelect.value = target;
            this.onCrmTeamChange(target);
        }
    },

    /**
     * Handle CRM Team / Page selection change
     * @param {string} value
     */
    async onCrmTeamChange(value) {
        const state = window.LiveState;

        if (!value) {
            state.selectedTeamId = null;
            state.selectedPage = null;
            state.selectedPages = [];
            state.liveCampaigns = [];
            window.LiveCommentList.renderLiveCampaignOptions();
            return;
        }

        if (value === 'all') {
            state.selectedTeamId = null;
            state.selectedPage = state.allPages[0] || null;
            state.selectedPages = [...state.allPages];
            state.savePageSelection(value);

            await window.LiveApi.loadLiveCampaignsFromAllPages();
            window.LiveCommentList.renderLiveCampaignOptions();

            if (state.liveCampaigns.length > 0) {
                await this._restoreCampaignSelection();
                return;
            }
        } else {
            const [teamId, pageId] = value.split(':');
            state.selectedTeamId = parseInt(teamId);

            for (const team of state.crmTeams) {
                if (team.Id === state.selectedTeamId) {
                    state.selectedPage = team.Childs?.find((p) => p.Id === parseInt(pageId));
                    break;
                }
            }

            state.selectedPages = state.selectedPage ? [state.selectedPage] : [];

            if (state.selectedPage) {
                state.savePageSelection(value);

                await window.LiveApi.loadLiveCampaigns(state.selectedPage.Facebook_PageId);
                window.LiveCommentList.renderLiveCampaignOptions();

                if (state.liveCampaigns.length > 0) {
                    await this._restoreCampaignSelection();
                    return;
                }
            }
        }

        // Reset campaign selection
        state.selectedCampaign = null;
        window.LiveRealtime.stopSSE();
        state.comments = [];
        window.LiveCommentList.renderComments();
    },

    /**
     * Handle Live Campaign selection change
     * @param {string} campaignId
     */
    async onLiveCampaignChange(campaignId) {
        const state = window.LiveState;

        if (!campaignId) {
            state.selectedCampaign = null;
            window.LiveRealtime.stopSSE();
            state.comments = [];
            state.clearAllCaches();
            window.LiveCommentList.renderComments();
            return;
        }

        state.clearAllCaches();
        state.selectedCampaign = state.liveCampaigns.find((c) => c.Id === campaignId);

        if (state.selectedCampaign) {
            if (state.selectedPages.length > 1) {
                const campaignPageId = state.selectedCampaign.Facebook_UserId;
                state.selectedPage =
                    state.allPages.find((p) => p.Facebook_PageId === campaignPageId) ||
                    state.selectedPage;
            }
            await this.loadComments();
        }
    },

    /**
     * Restore saved campaign selection from localStorage, or auto-select today's
     */
    async _restoreCampaignSelection() {
        const state = window.LiveState;
        const saved = state.getSavedCampaignSelection();

        if (saved && saved.length > 0) {
            // Filter to only campaigns that still exist
            const validIds = saved.filter((id) => state.liveCampaigns.some((c) => c.Id === id));
            if (validIds.length > 0) {
                if (!state.selectedCampaignIds) state.selectedCampaignIds = new Set();
                validIds.forEach((id) => state.selectedCampaignIds.add(id));
                window.LiveCommentList.renderLiveCampaignOptions();
                await this.onMultiCampaignChange(validIds);
                return;
            }
        }

        // Fallback: mặc định chọn campaign MỚI NHẤT của MỖI page (House + Store).
        // liveCampaigns đã sort DateCreated desc → lần xuất hiện đầu của mỗi
        // Facebook_UserId = campaign mới nhất của page đó.
        const newestPerPage = [];
        const seenPages = new Set();
        for (const c of state.liveCampaigns) {
            const pg = String(c.Facebook_UserId || '');
            if (seenPages.has(pg)) continue;
            seenPages.add(pg);
            newestPerPage.push(c.Id);
        }
        if (newestPerPage.length) {
            if (!state.selectedCampaignIds) state.selectedCampaignIds = new Set();
            newestPerPage.forEach((id) => state.selectedCampaignIds.add(id));
            state.saveCampaignSelection();
            window.LiveCommentList.renderLiveCampaignOptions();
            await this.onMultiCampaignChange(newestPerPage);
        }
    },

    /**
     * Handle multiple campaigns selected
     * @param {string[]} campaignIds
     * @param {{silent?: boolean}} [opts] - silent: reload nền (SSE trigger) —
     *   GIỮ list đang hiển thị (không showLoading/không clear), giữ nguyên
     *   SSE subscriptions + caches, diff render patch tại chỗ. Fix bug
     *   2026-06-11: reload thường làm trắng toàn bộ panel trái.
     */
    async onMultiCampaignChange(campaignIds, opts = {}) {
        const state = window.LiveState;
        const silent = !!opts.silent;

        if (!silent) {
            // Đổi tập comment → reset cap render về N mới nhất (infinite scroll từ đầu).
            window.LiveCommentList.resetRenderLimit?.();

            // Stop all SSE
            window.LiveRealtime.stopSSE();
        }

        if (!campaignIds || campaignIds.length === 0) {
            this._loadGen++; // hủy load đang chạy (nếu có) — tránh ghi đè ngược
            state.selectedCampaign = null;
            state.comments = [];
            state.clearAllCaches();
            window.LiveCommentList.renderComments();
            return;
        }

        if (silent && state.isLoading) return; // tránh đè reload đang chạy

        // Mỗi lần load hợp lệ bump generation; sau MỖI await so lại — nếu có
        // load mới hơn đã start thì bỏ (không ghi state/render đè kết quả mới).
        const gen = ++this._loadGen;

        if (!silent) {
            state.clearAllCaches();
            state.comments = [];
            window.LiveCommentList.showLoading();
        }
        state.isLoading = true;

        try {
            const campaigns = campaignIds
                .map((id) => state.liveCampaigns.find((c) => c.Id === id))
                .filter(Boolean);

            // Prefetch live videos per page (dedupe). Mỗi campaign có thể link
            // tới NHIỀU Facebook_PostId — Live web "Bài live" show 1 row/post.
            // CHỈ dùng để DISCOVER post IDs thuộc campaign (KHÔNG fetch comment
            // qua Pancake nữa — comment giờ đọc từ DB web2_live_comments do server
            // poller ghi, 1 row/comment kiểu TPOS).
            const uniquePageIds = Array.from(new Set(campaigns.map((c) => c.Facebook_UserId)));
            const pageLiveVideosMap = new Map();
            await Promise.all(
                uniquePageIds.map(async (pid) => {
                    pageLiveVideosMap.set(pid, await _fetchLiveVideosForPage(pid));
                })
            );
            if (gen !== this._loadGen) return; // load mới hơn đã start → bỏ

            // Resolve danh sách {pageId, postId} cho mọi campaign × mọi post.
            const postPairs = []; // [{ pageId, postId }]
            const postIdSet = new Set();
            for (const campaign of campaigns) {
                const pageId = campaign.Facebook_UserId;
                const pageLiveVideos = pageLiveVideosMap.get(pageId) || [];
                let livePosts = _resolveCampaignLivePosts(
                    campaign,
                    state.liveCampaigns,
                    pageLiveVideos
                );
                // Fallback: campaign chưa resolve được post → dùng Facebook_LiveId.
                if (livePosts.length === 0 && campaign.Facebook_LiveId) {
                    livePosts = [{ objectId: campaign.Facebook_LiveId }];
                }
                for (const lp of livePosts) {
                    const postId = lp.objectId;
                    if (!postId || postIdSet.has(postId)) continue;
                    postIdSet.add(postId);
                    postPairs.push({ pageId, postId });
                }
            }

            // Warm-up one-shot: server fetch per-message NGAY cho các post đang
            // chọn → DB fresh TRƯỚC khi đọc (backfill phần WS relay có thể miss
            // lúc deploy/restart). Fetch theo sự kiện user mở campaign — KHÔNG
            // phải polling (vòng poll nền server đã tắt 2026-06-11).
            // Best-effort: lỗi/timeout không chặn việc đọc DB phía dưới.
            if (postPairs.length) {
                try {
                    await fetch(`${state.workerUrl}/api/web2-live-comments/poll-now`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ posts: postPairs }),
                        signal: AbortSignal.timeout(15000),
                    });
                } catch (e) {
                    console.warn('[Live-INIT] poll-now fail:', e.message);
                }
                if (gen !== this._loadGen) return; // load mới hơn đã start → bỏ
            }

            // Đọc comment per-message từ DB (web2_live_comments) — NGUỒN DUY NHẤT.
            // 1 row = 1 comment (cùng người comment nhiều lần = nhiều dòng).
            const postIds = [...postIdSet];
            let dbComments = [];
            if (postIds.length) {
                try {
                    const resp = await fetch(
                        `${state.workerUrl}/api/web2-live-comments?postIds=${encodeURIComponent(postIds.join(','))}&limit=5000`,
                        { signal: AbortSignal.timeout(15000) }
                    );
                    const j = await resp.json();
                    if (j.success && Array.isArray(j.data)) {
                        dbComments = j.data.map((row) => this._dbRowToComment(row));
                    }
                } catch (e) {
                    console.warn('[Live-INIT] DB comments fetch fail:', e.message);
                }
                if (gen !== this._loadGen) return; // load mới hơn đã start → bỏ
            }

            // Dedup theo id + sort newest-first (server đã DESC, nhưng đa post merge
            // nên sort lại cho chắc).
            const seen2 = new Set();
            const allComments = [];
            for (const c of dbComments) {
                if (!c.id || seen2.has(c.id)) continue;
                seen2.add(c.id);
                allComments.push(c);
            }
            allComments.sort(
                (a, b) =>
                    SharedUtils.toEpochMs(b.created_time) - SharedUtils.toEpochMs(a.created_time)
            );

            state.comments = allComments;
            state.selectedCampaign = campaigns[0];
            state.hasMore = false; // Disable pagination for multi-campaign

            // Track cursor cho SSE delta fetch: ưu tiên updated_at (server-assigned,
            // bắt cả UPDATE + comment về trễ — xem _fetchLiveCommentDelta), giữ
            // created_time làm fallback khi server cũ chưa trả updated_at.
            this._lastCommentMaxMs = allComments.reduce((mx, c) => {
                const t = SharedUtils.toEpochMs(c.created_time);
                return t > mx ? t : mx;
            }, 0);
            this._lastUpdatedMaxMs = allComments.reduce(
                (mx, c) => (c._updatedAt > mx ? c._updatedAt : mx),
                0
            );

            // Update selectedPage to first campaign's page
            if (campaigns[0]) {
                const firstPageId = campaigns[0].Facebook_UserId;
                state.selectedPage =
                    state.allPages.find((p) => p.Facebook_PageId === firstPageId) ||
                    state.selectedPage;
            }

            console.log(
                `[Live-INIT] Loaded ${allComments.length} comments (DB) from ${campaigns.length} campaigns`
            );
            window.LiveCommentList.renderComments();

            // Realtime giờ do server poller + SSE 'web2:live-comments' lái (xem
            // init()). KHÔNG còn startSSE Live (TPOS) hay client Pancake poll.

            // Load session index for all campaigns
            for (const campaign of campaigns) {
                this.loadSessionIndex(campaign.Facebook_LiveId);
            }

            // Load partner info
            this.loadPartnerInfoForComments();

            // OFFLINE: live đã end (không campaign nào StatusLive=1) → tự lấy
            // thumbnail comment THEO THỜI GIAN (offset từ broadcast_start), giống
            // Force extract, KHÔNG cần bấm tay. Khi LIVE thì Auto-snap real-frame
            // lo (path 1) nên bỏ qua. Chỉ chạy 1 lần / tập campaign (guard key),
            // skipExisting để không đụng comment đã có ảnh. "Chụp Live" vẫn riêng
            // (chụp iframe hiện tại → kho hình).
            const isOffline =
                campaigns.length > 0 && campaigns.every((c) => Number(c.StatusLive) !== 1);
            const batchKey = campaignIds.slice().sort().join(',');
            if (
                isOffline &&
                allComments.length > 0 &&
                this._offlineBatchKey !== batchKey &&
                window.LiveLivestreamSnap?.offlineBatchAll
            ) {
                this._offlineBatchKey = batchKey;
                clearTimeout(this._offlineBatchTimer);
                this._offlineBatchTimer = setTimeout(() => {
                    window.LiveLivestreamSnap.offlineBatchAll({
                        skipExisting: true,
                        silent: true,
                    }).catch(() => {});
                }, 1500);
            }
        } catch (error) {
            console.error('[Live-INIT] Error loading multi-campaign comments:', error);
            window.LiveCommentList.showError(error.message);
        } finally {
            // Chỉ load MỚI NHẤT reset isLoading — load cũ (gen stale) reset sẽ
            // nhả khóa trong khi load mới còn chạy. Load mới luôn có finally
            // riêng nên không kẹt true.
            if (gen === this._loadGen) state.isLoading = false;
        }
    },

    /**
     * Load comments (legacy single-campaign entry — backward compat).
     *
     * Comment KHÔNG còn fetch qua Pancake conversations nữa (dedup-by-person).
     * Route qua onMultiCampaignChange (DB per-message). Giữ tên + chữ ký để
     * caller cũ (refresh / liveChatManager.loadComments) không vỡ. `append`
     * (pagination Pancake cũ) bỏ — DB load 1 lần đủ, infinite-scroll là client.
     * @param {boolean} [_append=false] - bỏ (giữ chữ ký).
     */
    async loadComments(_append = false) {
        const state = window.LiveState;
        const ids = state.selectedCampaignIds
            ? Array.from(state.selectedCampaignIds)
            : state.selectedCampaign
              ? [state.selectedCampaign.Id]
              : [];
        if (!ids.length) return;
        await this.onMultiCampaignChange(ids);
    },

    /**
     * Load more comments — NO-OP. Phân trang server (Pancake cursor) đã bỏ; DB
     * load đủ comment 1 lần, "tải thêm" giờ là infinite-scroll CLIENT trong
     * LiveCommentList (cap render tăng dần). Giữ hàm cho caller cũ.
     */
    async loadMoreComments() {
        // no-op — infinite scroll do LiveCommentList._appendOlderBatch lo.
    },

    /**
     * Load SessionIndex for a campaign
     * @param {string} [postId] - Post ID, defaults to selected campaign
     */
    async loadSessionIndex(postId) {
        const state = window.LiveState;
        if (!postId && !state.selectedCampaign) return;
        postId = postId || state.selectedCampaign.Facebook_LiveId;

        try {
            const map = await window.LiveApi.loadSessionIndex(postId);
            // Merge into existing map (for multi-campaign)
            for (const [k, v] of map) {
                // Preserve native-web entries — don't let Live data overwrite them
                const existing = state.sessionIndexMap.get(k);
                if (existing?.source === 'NATIVE_WEB') continue;
                state.sessionIndexMap.set(k, v);
            }
            console.log('[Live-INIT] SessionIndex loaded, total:', state.sessionIndexMap.size);

            // Hydrate native-web orders for this post (non-blocking)
            this.loadNativeOrdersForPost(postId).catch(() => {});

            if (state.comments.length > 0) {
                window.LiveCommentList.renderComments();
            }
        } catch (error) {
            console.error('[Live-INIT] Error loading SessionIndex:', error);
        }
    },

    /**
     * Load native-web orders for a post and merge into sessionIndexMap
     * so previously created native orders show their badge on load.
     * @param {string} postId - Facebook post id
     */
    async loadNativeOrdersForPost(postId) {
        const state = window.LiveState;
        if (!postId || !window.NativeOrdersApi) return;
        try {
            const resp = await window.NativeOrdersApi.list({ fbPostId: postId, limit: 1000 });
            const orders = resp?.orders || [];
            for (const o of orders) {
                if (!o.fbUserId) continue;
                state.sessionIndexMap.set(o.fbUserId, {
                    index: o.sessionIndex || '?',
                    code: o.code,
                    source: 'NATIVE_WEB',
                    commentCount: Number(o.commentCount || 1),
                    commentIds: Array.isArray(o.commentIds) ? o.commentIds : [],
                });
            }
            if (orders.length > 0 && state.comments.length > 0) {
                window.LiveCommentList.renderComments();
            }
        } catch (e) {
            console.warn('[Live-INIT] loadNativeOrdersForPost failed:', e.message);
        }
    },

    /**
     * Load partner info for all visible comments (batch, then re-render)
     * Uses correct CRM Team ID per comment (important for multi-page mode)
     */
    async loadPartnerInfoForComments() {
        const state = window.LiveState;
        const defaultCrmTeamId = state.selectedPage?.Id;

        // Build userId -> crmTeamId mapping from comments
        const userPageMap = new Map(); // userId -> page child Id
        for (const c of state.comments) {
            const userId = c.from?.id;
            if (!userId || userPageMap.has(userId)) continue;
            // Use the comment's tagged page object if available (multi-campaign)
            const pageObj = c._pageObj;
            userPageMap.set(userId, pageObj?.Id || defaultCrmTeamId);
        }

        if (userPageMap.size === 0) return;

        // Batch fetch (5 concurrent)
        const entries = Array.from(userPageMap.entries());
        const batchSize = 5;
        for (let i = 0; i < entries.length; i += batchSize) {
            const batch = entries.slice(i, i + batchSize);
            await Promise.all(
                batch.map(async ([userId, crmTeamId]) => {
                    // Warehouse lookup chỉ cần fb_id (userId) — KHÔNG cần crmTeamId
                    // (guard !crmTeamId cũ thời WEB2 chặn nhầm enrich khi page pages.fm
                    // không có .Id → SĐT/địa chỉ rỗng).
                    if (state.partnerCache.has(userId)) return;
                    if (state.partnerFetchPromises.has(userId))
                        return state.partnerFetchPromises.get(userId);

                    const promise = (async () => {
                        try {
                            const data = await window.LiveApi.getPartnerInfo(crmTeamId, userId);
                            // Warehouse trả FLAT object {Id,Name,Phone,...}; shape cũ
                            // Live là {Partner:{...}} → support cả 2 (defensive).
                            if (data) {
                                state.partnerCache.set(userId, data.Partner || data);
                            }
                        } catch {
                            // silently skip 400 errors (user not in this CRM team)
                        } finally {
                            state.partnerFetchPromises.delete(userId);
                        }
                    })();

                    state.partnerFetchPromises.set(userId, promise);
                    return promise;
                })
            );
        }

        // Re-render with partner info
        window.LiveCommentList.renderComments();

        // KH đã có trong kho (partner.Phone) nhưng SĐT Pancake của comment KHÁC
        // → lưu làm SĐT PHỤ (alt_phones), KHÔNG ghi đè phone chính. Ưu tiên kho.
        this._captureAltPhones();

        // Load debt for partners with phone numbers
        this.loadDebtForPartners();
    },

    // Quét comment: KH có phone chính (kho) + SĐT Pancake khác → POST add-alt-phone.
    // Dedupe per-session (_altSeen) để không spam. Best-effort.
    _captureAltPhones() {
        const state = window.LiveState;
        if (!this._altSeen) this._altSeen = new Set();
        const norm = (s) =>
            String(s || '')
                .replace(/\D/g, '')
                .slice(-10);
        const pancakePhoneOf = (c) => {
            const a = c._phones;
            const ph = Array.isArray(a) && a.length ? a[0] : null;
            if (ph) return typeof ph === 'string' ? ph : ph.phone_number || ph.phone || '';
            const m = String(c.message || '')
                .replace(/[.\s()\-_]/g, '')
                .match(/(?:\+?84|0)(\d{9})(?!\d)/);
            return m ? '0' + m[1] : '';
        };
        for (const c of state.comments || []) {
            const fbId = c.from?.id;
            if (!fbId) continue;
            const partner = state.partnerCache?.get?.(fbId);
            const primary = partner?.Phone;
            if (!primary) continue; // chỉ khi KH ĐÃ có trong kho + có phone chính
            const pk = pancakePhoneOf(c);
            if (!pk || norm(pk).length !== 10) continue;
            if (norm(pk) === norm(primary)) continue; // giống phone chính → bỏ
            const key = fbId + '|' + norm(pk);
            if (this._altSeen.has(key)) continue;
            this._altSeen.add(key);
            fetch(`${state.workerUrl}/api/web2/customers/add-alt-phone`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fbId: String(fbId), phone: norm(pk) }),
                signal: AbortSignal.timeout(15000),
            }).catch(() => {});
        }
    },

    // Gom KH từ comment vào KHO KH (web2_customers) — 1 bulk call.
    // Trigger khi Force extract (live-livestream-snap). Backend KHÔNG ghi đè
    // SĐT/địa chỉ/tên sẵn có: trùng SĐT → thêm alt_phones (phone chính giữ
    // nguyên là CHÍNH), field rỗng mới fill, KH mới thì tạo. Best-effort.
    async _harvestCommentCustomers(comments) {
        const state = window.LiveState;
        const list = Array.isArray(comments) ? comments : state.comments || [];
        if (!list.length) return null;
        const norm = (s) =>
            String(s || '')
                .replace(/\D/g, '')
                .slice(-10);
        const phoneOf = (c) => {
            const a = c._phones;
            const ph = Array.isArray(a) && a.length ? a[0] : null;
            if (ph) {
                const v = typeof ph === 'string' ? ph : ph.phone_number || ph.phone || '';
                if (norm(v).length === 10) return norm(v);
            }
            const m = String(c.message || '')
                .replace(/[.\s()\-_]/g, '')
                .match(/(?:\+?84|0)(\d{9})(?!\d)/);
            return m ? '0' + m[1] : '';
        };
        const payload = [];
        const seen = new Set();
        for (const c of list) {
            const fbId = c.from?.id ? String(c.from.id) : '';
            if (!fbId) continue;
            const phone = phoneOf(c);
            const dk = fbId + '|' + phone;
            if (seen.has(dk)) continue;
            seen.add(dk);
            payload.push({
                fbId,
                name: c.from?.name || '',
                phone: phone || undefined,
                fbPageId: c._pageObj?.Facebook_PageId || c._pageObj?.Id || undefined,
            });
        }
        if (!payload.length) return null;
        try {
            const r = await fetch(`${state.workerUrl}/api/web2/customers/harvest-comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comments: payload }),
                signal: AbortSignal.timeout(15000),
            });
            return await r.json().catch(() => null);
        } catch (e) {
            console.warn('[Live-INIT] harvestCommentCustomers fail:', e.message);
            return null;
        }
    },

    /**
     * Load debt info for all partners with phone numbers
     */
    async loadDebtForPartners() {
        const state = window.LiveState;
        if (!window.sharedDebtManager) return;

        const phones = [];
        // Public entries() của SharedCache — TTL được tôn trọng, skip expired.
        for (const [, partner] of state.partnerCache.entries()) {
            if (partner && partner.Phone) {
                phones.push(partner.Phone);
            }
        }

        if (phones.length === 0) return;

        await window.sharedDebtManager.loadBatch(phones);
        window.LiveCommentList.renderComments();
    },

    /**
     * Refresh current view
     */
    async refresh() {
        const state = window.LiveState;
        window.LiveRealtime.stopSSE();

        if (state.selectedCampaign) {
            await this.loadComments();
        } else if (state.selectedPage) {
            await window.LiveApi.loadLiveCampaigns(state.selectedPage.Facebook_PageId);
            window.LiveCommentList.renderLiveCampaignOptions();
        } else {
            await window.LiveApi.loadCRMTeams();
            window.LiveCommentList.renderCrmTeamOptions();
        }
    },

    /**
     * Toggle hide/show a comment
     * @param {string} commentId
     * @param {boolean} hide
     */
    async toggleHideComment(commentId, hide) {
        const state = window.LiveState;
        const comment = state.comments.find((c) => c.id === commentId);
        if (!comment) return;

        // Optimistic UI update
        comment.is_hidden = hide;
        window.LiveCommentList.renderComments();

        // Call actual Live API
        const pageId = state.selectedPage?.Facebook_PageId;
        if (pageId) {
            const success = await window.LiveApi.hideComment(pageId, commentId, hide);
            if (success) {
                if (window.notificationManager) {
                    window.notificationManager.show(
                        hide ? 'Đã ẩn comment trên Facebook' : 'Đã hiện comment trên Facebook',
                        'success'
                    );
                }
            } else {
                // Revert on failure
                comment.is_hidden = !hide;
                window.LiveCommentList.renderComments();
                if (window.notificationManager) {
                    window.notificationManager.show(
                        'Lỗi: Không thể ' + (hide ? 'ẩn' : 'hiện') + ' comment',
                        'error'
                    );
                }
            }
        }
    },

    /**
     * Set debt display settings
     * @param {boolean} showDebt
     * @param {boolean} showZeroDebt
     */
    setDebtDisplaySettings(showDebt, showZeroDebt) {
        window.LiveCommentList.setDebtDisplaySettings(showDebt, showZeroDebt);
    },

    /**
     * Destroy / cleanup
     */
    destroy() {
        window.LiveRealtime.stopSSE();
        window.LiveRealtime.disconnectWebSocket();
        window.LiveState.stopCacheCleanup();
        // Gỡ window listeners + timers (tránh leak khi re-init).
        if (this._onRtConnected) {
            window.removeEventListener('liveRealtimeConnected', this._onRtConnected);
            this._onRtConnected = null;
        }
        if (this._onRtDisconnected) {
            window.removeEventListener('liveRealtimeDisconnected', this._onRtDisconnected);
            this._onRtDisconnected = null;
        }
        clearTimeout(this._campaignChangeTimer);
        clearTimeout(this._liveCommentsReloadTimer);
        clearTimeout(this._offlineBatchTimer);
    },
};

// Export for script-tag usage & backward compatibility
if (typeof window !== 'undefined') {
    window.LiveColumnManager = LiveColumnManager;

    // Backward compatibility: expose as liveChatManager with delegate methods
    window.liveChatManager = {
        initialize: (id) => LiveColumnManager.initialize(id),
        refresh: () => LiveColumnManager.refresh(),
        loadComments: () => LiveColumnManager.loadComments(),
        selectComment: (id) => window.LiveCommentList.selectComment(id),
        showCustomerInfo: (id, name) => window.LiveCustomerPanel.showCustomerInfo(id, name),
        closeCustomerInfoModal: () => window.LiveCustomerPanel.closeModal(),
        handleSaveToLive: (id, name) => window.LiveCommentList.handleSaveToLive(id, name),
        toggleHideComment: (id, hide) => LiveColumnManager.toggleHideComment(id, hide),
        toggleStatusDropdown: () => window.LiveCustomerPanel.toggleStatusDropdown(),
        selectStatus: (v, t) => window.LiveCustomerPanel.selectStatus(v, t),
        toggleInlineStatusDropdown: (id) => window.LiveCommentList.toggleInlineStatusDropdown(id),
        selectInlineStatus: (id, v, t) => window.LiveCommentList.selectInlineStatus(id, v, t),
        saveInlinePhone: (id, inputId) => window.LiveCommentList.saveInlinePhone(id, inputId),
        saveInlineAddress: (id, inputId) => window.LiveCommentList.saveInlineAddress(id, inputId),
        setDebtDisplaySettings: (a, b) => LiveColumnManager.setDebtDisplaySettings(a, b),
        updateSaveButtonToCheckmark: (id) => window.LiveCommentList.updateSaveButtonToCheckmark(id),
        // Expose state for external access
        get comments() {
            return window.LiveState.comments;
        },
        get selectedPage() {
            return window.LiveState.selectedPage;
        },
        get selectedCampaign() {
            return window.LiveState.selectedCampaign;
        },
        get savedToLiveIds() {
            return window.LiveState.savedToLiveIds;
        },
        get sessionIndexMap() {
            return window.LiveState.sessionIndexMap;
        },
        getCacheStats: () => window.LiveState.getCacheStats(),
    };
}
