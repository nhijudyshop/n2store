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
        const camps = await window.LiveSource.fetchVideosAsCampaigns([pageId]);
        const videos = (camps || []).map((c) => ({
            objectId: c.Facebook_LiveId, // pageId_videoId
            title: c.Name || '',
            startMs: c.DateCreated ? new Date(c.DateCreated).getTime() : null,
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
        .map((c) => ({ ...c, _ts: new Date(c.DateCreated || 0).getTime() }))
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
        window.addEventListener('liveRealtimeConnected', () => {
            window.LiveCommentList.updateConnectionStatus(true, 'session');
        });
        window.addEventListener('liveRealtimeDisconnected', () => {
            window.LiveCommentList.updateConnectionStatus(false, 'session');
        });
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
     */
    async onMultiCampaignChange(campaignIds) {
        const state = window.LiveState;

        // Đổi tập comment → reset cap render về N mới nhất (infinite scroll từ đầu).
        window.LiveCommentList.resetRenderLimit?.();

        // Stop all SSE
        window.LiveRealtime.stopSSE();

        if (!campaignIds || campaignIds.length === 0) {
            state.selectedCampaign = null;
            state.comments = [];
            state.clearAllCaches();
            window.LiveCommentList.renderComments();
            return;
        }

        state.clearAllCaches();
        state.comments = [];
        window.LiveCommentList.showLoading();
        state.isLoading = true;

        try {
            const campaigns = campaignIds
                .map((id) => state.liveCampaigns.find((c) => c.Id === id))
                .filter(Boolean);

            // Prefetch live videos per page (dedupe). Mỗi campaign có thể link
            // tới NHIỀU Facebook_PostId — Live web "Bài live" show 1 row/post.
            // User feedback 2026-05-26: "chọn theo campaign nó bị thiếu không
            // đủ" → resolve all post IDs in campaign date range.
            const uniquePageIds = Array.from(new Set(campaigns.map((c) => c.Facebook_UserId)));
            const pageLiveVideosMap = new Map();
            await Promise.all(
                uniquePageIds.map(async (pid) => {
                    pageLiveVideosMap.set(pid, await _fetchLiveVideosForPage(pid));
                })
            );

            // Load comments from all selected campaigns × all their posts (parallel)
            const results = await Promise.all(
                campaigns.map(async (campaign) => {
                    const pageId = campaign.Facebook_UserId;
                    const pageName = campaign.Facebook_UserName || '';
                    const page =
                        state.allPages.find((p) => p.Facebook_PageId === pageId) ||
                        state.selectedPage;
                    const pageLiveVideos = pageLiveVideosMap.get(pageId) || [];
                    let livePosts = _resolveCampaignLivePosts(
                        campaign,
                        state.liveCampaigns,
                        pageLiveVideos
                    );
                    // Fallback: campaign chưa có post (Live livevideo empty) hoặc
                    // resolve fail → dùng campaign.Facebook_LiveId làm post duy nhất.
                    if (livePosts.length === 0 && campaign.Facebook_LiveId) {
                        livePosts = [
                            {
                                objectId: campaign.Facebook_LiveId,
                                title: campaign.Name,
                                startMs: new Date(campaign.DateCreated || 0).getTime(),
                            },
                        ];
                    }
                    console.log(
                        `[Live-INIT] Campaign "${campaign.Name}" → ${livePosts.length} live posts`
                    );
                    // Load comments từ TỪNG post in parallel + merge
                    const postResults = await Promise.all(
                        livePosts.map(async (lp) => {
                            try {
                                const result = await window.LiveApi.loadComments(
                                    pageId,
                                    lp.objectId
                                );
                                (result.comments || []).forEach((c) => {
                                    c._pageName = pageName;
                                    c._campaignId = campaign.Id;
                                    c._campaignName = campaign.Name;
                                    c._pageId = pageId;
                                    c._pageObj = page;
                                    c._postId = lp.objectId;
                                    c._postTitle = lp.title;
                                });
                                return result.comments || [];
                            } catch (error) {
                                console.warn(
                                    `[Live-INIT] Error loading comments for post ${lp.objectId}:`,
                                    error
                                );
                                return [];
                            }
                        })
                    );
                    return postResults.flat();
                })
            );

            // Merge all comments, sort by time (newest first)
            const allComments = results.flat();
            allComments.sort((a, b) => {
                const ta = new Date(a.created_time || 0).getTime();
                const tb = new Date(b.created_time || 0).getTime();
                return tb - ta;
            });

            state.comments = allComments;
            state.selectedCampaign = campaigns[0]; // Set first as "active" for SSE
            state.hasMore = false; // Disable pagination for multi-campaign

            // Update selectedPage to first campaign's page
            if (campaigns[0]) {
                const firstPageId = campaigns[0].Facebook_UserId;
                state.selectedPage =
                    state.allPages.find((p) => p.Facebook_PageId === firstPageId) ||
                    state.selectedPage;
            }

            console.log(
                `[Live-INIT] Loaded ${allComments.length} comments from ${campaigns.length} campaigns`
            );
            window.LiveCommentList.renderComments();

            // Start SSE for EVERY live post in every campaign. Live SSE
            // stream gắn vào postId — 1 campaign nhiều post → cần SSE đa kênh
            // để không miss realtime comments của các post phụ.
            campaigns.forEach((c) => {
                const pageLiveVideos = pageLiveVideosMap.get(c.Facebook_UserId) || [];
                const livePosts = _resolveCampaignLivePosts(c, state.liveCampaigns, pageLiveVideos);
                // Active (statusLive=1) hoặc just-ended — cần SSE chính. Old
                // VOD posts (statusLive=0, đã end lâu) thường không nhận
                // comment mới → vẫn subscribe vì FB cho phép comment vào VOD.
                const postIdsToWatch =
                    livePosts.length > 0
                        ? livePosts.map((lp) => lp.objectId)
                        : c.Facebook_LiveId
                          ? [c.Facebook_LiveId]
                          : [];
                postIdsToWatch.forEach((postId) => {
                    window.LiveRealtime.startSSE(c.Facebook_UserId, postId, c.Facebook_UserName);
                });
            });

            // Load session index for all campaigns
            for (const campaign of campaigns) {
                this.loadSessionIndex(campaign.Facebook_LiveId);
            }

            // Load partner info
            this.loadPartnerInfoForComments();
        } catch (error) {
            console.error('[Live-INIT] Error loading multi-campaign comments:', error);
            window.LiveCommentList.showError(error.message);
        } finally {
            state.isLoading = false;
        }
    },

    /**
     * Load comments (initial or append for pagination)
     * @param {boolean} [append=false]
     */
    async loadComments(append = false) {
        const state = window.LiveState;
        if (state.isLoading || !state.selectedPage || !state.selectedCampaign) return;

        state.isLoading = true;

        if (append) {
            window.LiveCommentList.updateLoadMoreIndicator();
        } else {
            state.comments = [];
            state.nextPageUrl = null;
            window.LiveCommentList.showLoading();
        }

        try {
            const pageId = state.selectedPage.Facebook_PageId;
            const postId = state.selectedCampaign.Facebook_LiveId;

            // Extract cursor from nextPageUrl for pagination
            let afterCursor = null;
            if (append && state.nextPageUrl) {
                const nextUrl = new URL(state.nextPageUrl);
                afterCursor = nextUrl.searchParams.get('after');
            }

            const result = await window.LiveApi.loadComments(pageId, postId, afterCursor);

            // Tag each comment with page name (for multi-page display)
            const campaignPageName =
                state.selectedCampaign?.Facebook_UserName || state.selectedPage?.Name || '';
            result.comments.forEach((c) => {
                c._pageName = campaignPageName;
            });

            if (append) {
                state.comments = [...state.comments, ...result.comments];
            } else {
                state.comments = result.comments;
            }

            state.nextPageUrl = result.nextPageUrl;
            state.hasMore = !!state.nextPageUrl;

            console.log(
                '[Live-INIT] Loaded comments:',
                result.comments.length,
                'Total:',
                state.comments.length
            );
            window.LiveCommentList.renderComments();

            // After initial load: start SSE + load SessionIndex
            if (!append) {
                window.LiveRealtime.startSSE();
                this.loadSessionIndex();
            }

            // Load partner info async
            this.loadPartnerInfoForComments();
        } catch (error) {
            console.error('[Live-INIT] Error loading comments:', error);
            if (!append) {
                window.LiveCommentList.showError(error.message);
            }
        } finally {
            state.isLoading = false;
            window.LiveCommentList.updateLoadMoreIndicator();
        }
    },

    /**
     * Load more comments (pagination)
     */
    async loadMoreComments() {
        const state = window.LiveState;
        if (state.hasMore && !state.isLoading) {
            await this.loadComments(true);
        }
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
                    if (!crmTeamId || state.partnerCache.has(userId)) return;
                    if (state.partnerFetchPromises.has(userId))
                        return state.partnerFetchPromises.get(userId);

                    const promise = (async () => {
                        try {
                            const data = await window.LiveApi.getPartnerInfo(crmTeamId, userId);
                            if (data?.Partner) {
                                state.partnerCache.set(userId, data.Partner);
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

        // Load debt for partners with phone numbers
        this.loadDebtForPartners();
    },

    /**
     * Load debt info for all partners with phone numbers
     */
    async loadDebtForPartners() {
        const state = window.LiveState;
        if (!window.sharedDebtManager) return;

        const phones = [];
        // SharedCache stores {value, timestamp} internally, iterate via _data
        for (const [, entry] of state.partnerCache._data) {
            const partner = entry.value || {};
            if (partner.Phone) {
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
