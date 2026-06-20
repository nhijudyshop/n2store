// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Live Column Initializer — WIRING module (event-bus + module wiring).
 *
 * Tách MOVE-only từ live-init.js (2026-06-19). Object.assign vào CÙNG object
 * window.LiveColumnManager (dựng shell ở live-init-state.js). CHỨA:
 *   - EventBus listeners (setupEventListeners) — orchestrate modules qua bus
 *   - Realtime WebSocket status listeners (setupRealtimeListeners)
 *   - Restore page/campaign selection
 *   - CRM team / campaign change handlers (single + multi)
 *
 * Load SAU live-init-state.js (cần window._LiveInit + window.LiveColumnManager) +
 * TRƯỚC lifecycle/init-entry.
 *
 * Dependencies: LiveState, LiveApi, LiveCommentList, LiveRealtime, LiveKhoEnricher,
 *   LiveLivestreamSnap, eventBus, SharedUtils
 */
(function () {
    'use strict';
    const NS = window._LiveInit;
    const _fetchLiveVideosForPage = NS._fetchLiveVideosForPage;
    const _resolveCampaignLivePosts = NS._resolveCampaignLivePosts;
    const _liveVideosCachePerPage = NS._liveVideosCachePerPage;

    Object.assign(window.LiveColumnManager, {
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

                // MEDIUM-cleanup (2026-06-13): clear enricher Set khi đổi campaign —
                // tránh Set phình + để KH của campaign mới được re-enrich từ kho.
                window.LiveKhoEnricher?.reset?.();

                // MEDIUM-cleanup (2026-06-20, audit WEB2-FULL-REVIEW): reset dedup Set
                // của LiveCustomerSync (_seen/_queue) + _altSeen khi đổi campaign. Trên
                // livestream dài (hàng nghìn comment) các Set này phình vô hạn vì desktop
                // không bao giờ gọi reset() — clear ở đây giống LiveKhoEnricher để KH của
                // campaign mới được harvest lại + tránh leak bộ nhớ theo phiên.
                window.LiveCustomerSync?.reset?.();
                this._altSeen = null;

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
                // poller ghi, 1 row/comment).
                const uniquePageIds = Array.from(new Set(campaigns.map((c) => c.Facebook_UserId)));
                const pageLiveVideosMap = new Map();
                await Promise.all(
                    uniquePageIds.map(async (pid) => {
                        pageLiveVideosMap.set(pid, await _fetchLiveVideosForPage(pid));
                    })
                );
                if (gen !== this._loadGen) return; // load mới hơn đã start → bỏ

                // Resolve postId cho mọi campaign × mọi post (để đọc DB phía dưới).
                const postIdSet = new Set();
                for (const campaign of campaigns) {
                    const pageLiveVideos = pageLiveVideosMap.get(campaign.Facebook_UserId) || [];
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
                        if (lp.objectId) postIdSet.add(lp.objectId);
                    }
                }

                // SERVER-DIRECT, KHÔNG POLL (2026-06-15 — user yêu cầu):
                // Comment livestream về 100% qua relay web2-realtime → Pancake WS join
                // per-page `pages:{pageId}` (né lỗi "Gói cước hết hạn" của multiple_pages)
                // → /ingest → DB → SSE `web2:live-comments` → trang nhận delta + append.
                // ĐÃ GỠ warm-up `POST /poll-now` lúc mở campaign — không còn poll dưới mọi
                // hình thức. ĐIỀU KIỆN: trang của campaign phải được BẬT ở pancake-settings
                // → "Server realtime (WS) — chọn trang nhận comment" (mặc định bật hết).
                // Trang chưa bật ở relay sẽ không có comment realtime (bật thêm = tick + Lưu).

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
                        SharedUtils.toEpochMs(b.created_time) -
                        SharedUtils.toEpochMs(a.created_time)
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
                // Prime cursor cho engine SHARED (LiveCommentsStream) sau initial load
                // → delta SSE tiếp theo chỉ lấy comment mới hơn mốc này.
                if (this._liveStream) {
                    this._liveStream.primeCursor({
                        updatedMs: this._lastUpdatedMaxMs,
                        createdMs: this._lastCommentMaxMs,
                    });
                }
                // KH từ load đầu → kho web2_customers (shared, dedupe/non-overwrite).
                this._harvestCommentCustomers(allComments);

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
                // init()). KHÔNG còn startSSE Live cũ hay client Pancake poll.

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
    });

    // Reference giữ namespace alive (tránh tree-shaking lo ngại; no-op runtime).
    void _liveVideosCachePerPage;
})();
