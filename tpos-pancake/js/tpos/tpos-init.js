// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * TPOS Column Initializer & Orchestrator
 * Wires together TposState, TposApi, TposCommentList, TposCustomerPanel, TposRealtime
 * Exposes TposColumnManager on window for backward compatibility
 */

const TposColumnManager = {
    /**
     * Initialize the TPOS column
     * @param {string} containerId - DOM container ID
     */
    async initialize(containerId) {
        const state = window.TposState;
        state.containerId = containerId;
        console.log('[TPOS-INIT] Initializing TPOS column in:', containerId);

        // Start cache cleanup
        state.startCacheCleanup();

        // Render container and selectors
        window.TposCommentList.renderContainer();

        // Wire up event bus listeners
        this.setupEventListeners();

        // Setup realtime event listeners (WebSocket status)
        this.setupRealtimeListeners();

        // Load CRM Teams
        await window.TposApi.loadCRMTeams();
        window.TposCommentList.renderCrmTeamOptions();

        // Restore saved page selection
        this.restoreSelection();
    },

    /**
     * Wire up EventBus listeners to orchestrate modules
     */
    setupEventListeners() {
        const bus = window.eventBus;

        // CRM Team / Page changed
        bus.on('tpos:crmTeamChanged', async (value) => {
            await this.onCrmTeamChange(value);
        });

        // Live Campaign changed (single - backward compat)
        bus.on('tpos:liveCampaignChanged', async (campaignId) => {
            await this.onLiveCampaignChange(campaignId);
        });

        // Multiple campaigns changed (new multi-select)
        bus.on('tpos:campaignsChanged', async (campaignIds) => {
            await this.onMultiCampaignChange(campaignIds);
        });

        // Refresh requested
        bus.on('tpos:refreshRequested', async () => {
            await this.refresh();
        });

        // Load more (infinite scroll)
        bus.on('tpos:loadMoreRequested', async () => {
            await this.loadMoreComments();
        });
    },

    /**
     * Setup realtime WebSocket status listeners
     */
    setupRealtimeListeners() {
        window.addEventListener('tposRealtimeConnected', () => {
            window.TposCommentList.updateConnectionStatus(true, 'session');
        });
        window.addEventListener('tposRealtimeDisconnected', () => {
            window.TposCommentList.updateConnectionStatus(false, 'session');
        });
    },

    /**
     * Restore saved page selection from localStorage
     */
    restoreSelection() {
        const state = window.TposState;
        const savedPage = state.getSavedPageSelection();
        if (savedPage) {
            const crmSelect = document.getElementById('tposCrmTeamSelect');
            if (crmSelect) {
                const optionExists = Array.from(crmSelect.options).some(
                    (opt) => opt.value === savedPage
                );
                if (optionExists) {
                    crmSelect.value = savedPage;
                    this.onCrmTeamChange(savedPage);
                }
            }
        }
    },

    /**
     * Handle CRM Team / Page selection change
     * @param {string} value
     */
    async onCrmTeamChange(value) {
        const state = window.TposState;

        if (!value) {
            state.selectedTeamId = null;
            state.selectedPage = null;
            state.selectedPages = [];
            state.liveCampaigns = [];
            window.TposCommentList.renderLiveCampaignOptions();
            return;
        }

        if (value === 'all') {
            state.selectedTeamId = null;
            state.selectedPage = state.allPages[0] || null;
            state.selectedPages = [...state.allPages];
            state.savePageSelection(value);

            await window.TposApi.loadLiveCampaignsFromAllPages();
            window.TposCommentList.renderLiveCampaignOptions();

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

                await window.TposApi.loadLiveCampaigns(state.selectedPage.Facebook_PageId);
                window.TposCommentList.renderLiveCampaignOptions();

                if (state.liveCampaigns.length > 0) {
                    await this._restoreCampaignSelection();
                    return;
                }
            }
        }

        // Reset campaign selection
        state.selectedCampaign = null;
        window.TposRealtime.stopSSE();
        state.comments = [];
        window.TposCommentList.renderComments();
    },

    /**
     * Handle Live Campaign selection change
     * @param {string} campaignId
     */
    async onLiveCampaignChange(campaignId) {
        const state = window.TposState;

        if (!campaignId) {
            state.selectedCampaign = null;
            window.TposRealtime.stopSSE();
            state.comments = [];
            state.clearAllCaches();
            window.TposCommentList.renderComments();
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
        const state = window.TposState;
        const saved = state.getSavedCampaignSelection();

        if (saved && saved.length > 0) {
            // Filter to only campaigns that still exist
            const validIds = saved.filter((id) => state.liveCampaigns.some((c) => c.Id === id));
            if (validIds.length > 0) {
                if (!state.selectedCampaignIds) state.selectedCampaignIds = new Set();
                validIds.forEach((id) => state.selectedCampaignIds.add(id));
                window.TposCommentList.renderLiveCampaignOptions();
                await this.onMultiCampaignChange(validIds);
                return;
            }
        }

        // Fallback: auto-select first campaign
        const first = state.liveCampaigns[0];
        if (first) {
            if (!state.selectedCampaignIds) state.selectedCampaignIds = new Set();
            state.selectedCampaignIds.add(first.Id);
            state.saveCampaignSelection();
            window.TposCommentList.renderLiveCampaignOptions();
            await this.onMultiCampaignChange([first.Id]);
        }
    },

    /**
     * Handle multiple campaigns selected
     * @param {string[]} campaignIds
     */
    async onMultiCampaignChange(campaignIds) {
        const state = window.TposState;

        // Stop all SSE
        window.TposRealtime.stopSSE();

        if (!campaignIds || campaignIds.length === 0) {
            state.selectedCampaign = null;
            state.comments = [];
            state.clearAllCaches();
            window.TposCommentList.renderComments();
            return;
        }

        state.clearAllCaches();
        state.comments = [];
        window.TposCommentList.showLoading();
        state.isLoading = true;

        try {
            const campaigns = campaignIds
                .map((id) => state.liveCampaigns.find((c) => c.Id === id))
                .filter(Boolean);

            // Load comments from all selected campaigns in parallel
            const results = await Promise.all(
                campaigns.map(async (campaign) => {
                    const pageId = campaign.Facebook_UserId;
                    const postId = campaign.Facebook_LiveId;
                    const pageName = campaign.Facebook_UserName || '';

                    // Find the matching page object
                    const page =
                        state.allPages.find((p) => p.Facebook_PageId === pageId) ||
                        state.selectedPage;

                    try {
                        const result = await window.TposApi.loadComments(pageId, postId);
                        // Tag each comment with page name and campaign info
                        (result.comments || []).forEach((c) => {
                            c._pageName = pageName;
                            c._campaignId = campaign.Id;
                            c._campaignName = campaign.Name;
                            c._pageId = pageId;
                            c._pageObj = page;
                        });
                        return result.comments || [];
                    } catch (error) {
                        console.warn(
                            `[TPOS-INIT] Error loading comments for ${campaign.Name}:`,
                            error
                        );
                        return [];
                    }
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
                `[TPOS-INIT] Loaded ${allComments.length} comments from ${campaigns.length} campaigns`
            );
            window.TposCommentList.renderComments();

            // Start SSE for each campaign
            campaigns.forEach((c) => {
                window.TposRealtime.startSSE(
                    c.Facebook_UserId,
                    c.Facebook_LiveId,
                    c.Facebook_UserName
                );
            });

            // Load session index for all campaigns
            for (const campaign of campaigns) {
                this.loadSessionIndex(campaign.Facebook_LiveId);
            }

            // Load partner info
            this.loadPartnerInfoForComments();
        } catch (error) {
            console.error('[TPOS-INIT] Error loading multi-campaign comments:', error);
            window.TposCommentList.showError(error.message);
        } finally {
            state.isLoading = false;
        }
    },

    /**
     * Load comments (initial or append for pagination)
     * @param {boolean} [append=false]
     */
    async loadComments(append = false) {
        const state = window.TposState;
        if (state.isLoading || !state.selectedPage || !state.selectedCampaign) return;

        state.isLoading = true;

        if (append) {
            window.TposCommentList.updateLoadMoreIndicator();
        } else {
            state.comments = [];
            state.nextPageUrl = null;
            window.TposCommentList.showLoading();
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

            const result = await window.TposApi.loadComments(pageId, postId, afterCursor);

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
                '[TPOS-INIT] Loaded comments:',
                result.comments.length,
                'Total:',
                state.comments.length
            );
            window.TposCommentList.renderComments();

            // After initial load: start SSE + load SessionIndex
            if (!append) {
                window.TposRealtime.startSSE();
                this.loadSessionIndex();
            }

            // Load partner info async
            this.loadPartnerInfoForComments();
        } catch (error) {
            console.error('[TPOS-INIT] Error loading comments:', error);
            if (!append) {
                window.TposCommentList.showError(error.message);
            }
        } finally {
            state.isLoading = false;
            window.TposCommentList.updateLoadMoreIndicator();
        }
    },

    /**
     * Load more comments (pagination)
     */
    async loadMoreComments() {
        const state = window.TposState;
        if (state.hasMore && !state.isLoading) {
            await this.loadComments(true);
        }
    },

    /**
     * Load SessionIndex for a campaign
     * @param {string} [postId] - Post ID, defaults to selected campaign
     */
    async loadSessionIndex(postId) {
        const state = window.TposState;
        if (!postId && !state.selectedCampaign) return;
        postId = postId || state.selectedCampaign.Facebook_LiveId;

        try {
            const map = await window.TposApi.loadSessionIndex(postId);
            // Merge into existing map (for multi-campaign)
            for (const [k, v] of map) {
                // Preserve native-web entries — don't let TPOS data overwrite them
                const existing = state.sessionIndexMap.get(k);
                if (existing?.source === 'NATIVE_WEB') continue;
                state.sessionIndexMap.set(k, v);
            }
            console.log('[TPOS-INIT] SessionIndex loaded, total:', state.sessionIndexMap.size);

            // Hydrate native-web orders for this post (non-blocking)
            this.loadNativeOrdersForPost(postId).catch(() => {});

            if (state.comments.length > 0) {
                window.TposCommentList.renderComments();
            }
        } catch (error) {
            console.error('[TPOS-INIT] Error loading SessionIndex:', error);
        }
    },

    /**
     * Load native-web orders for a post and merge into sessionIndexMap
     * so previously created native orders show their badge on load.
     * @param {string} postId - Facebook post id
     */
    async loadNativeOrdersForPost(postId) {
        const state = window.TposState;
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
                });
            }
            if (orders.length > 0 && state.comments.length > 0) {
                window.TposCommentList.renderComments();
            }
        } catch (e) {
            console.warn('[TPOS-INIT] loadNativeOrdersForPost failed:', e.message);
        }
    },

    /**
     * Load partner info for all visible comments (batch, then re-render)
     * Uses correct CRM Team ID per comment (important for multi-page mode)
     */
    async loadPartnerInfoForComments() {
        const state = window.TposState;
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
                            const data = await window.TposApi.getPartnerInfo(crmTeamId, userId);
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
        window.TposCommentList.renderComments();

        // Load debt for partners with phone numbers
        this.loadDebtForPartners();
    },

    /**
     * Load debt info for all partners with phone numbers
     */
    async loadDebtForPartners() {
        const state = window.TposState;
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
        window.TposCommentList.renderComments();
    },

    /**
     * Refresh current view
     */
    async refresh() {
        const state = window.TposState;
        window.TposRealtime.stopSSE();

        if (state.selectedCampaign) {
            await this.loadComments();
        } else if (state.selectedPage) {
            await window.TposApi.loadLiveCampaigns(state.selectedPage.Facebook_PageId);
            window.TposCommentList.renderLiveCampaignOptions();
        } else {
            await window.TposApi.loadCRMTeams();
            window.TposCommentList.renderCrmTeamOptions();
        }
    },

    /**
     * Toggle hide/show a comment
     * @param {string} commentId
     * @param {boolean} hide
     */
    async toggleHideComment(commentId, hide) {
        const state = window.TposState;
        const comment = state.comments.find((c) => c.id === commentId);
        if (!comment) return;

        // Optimistic UI update
        comment.is_hidden = hide;
        window.TposCommentList.renderComments();

        // Call actual TPOS API
        const pageId = state.selectedPage?.Facebook_PageId;
        if (pageId) {
            const success = await window.TposApi.hideComment(pageId, commentId, hide);
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
                window.TposCommentList.renderComments();
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
        window.TposCommentList.setDebtDisplaySettings(showDebt, showZeroDebt);
    },

    /**
     * Destroy / cleanup
     */
    destroy() {
        window.TposRealtime.stopSSE();
        window.TposRealtime.disconnectWebSocket();
        window.TposState.stopCacheCleanup();
    },
};

// Export for script-tag usage & backward compatibility
if (typeof window !== 'undefined') {
    window.TposColumnManager = TposColumnManager;

    // Backward compatibility: expose as tposChatManager with delegate methods
    window.tposChatManager = {
        initialize: (id) => TposColumnManager.initialize(id),
        refresh: () => TposColumnManager.refresh(),
        loadComments: () => TposColumnManager.loadComments(),
        selectComment: (id) => window.TposCommentList.selectComment(id),
        showCustomerInfo: (id, name) => window.TposCustomerPanel.showCustomerInfo(id, name),
        closeCustomerInfoModal: () => window.TposCustomerPanel.closeModal(),
        handleSaveToTpos: (id, name) => window.TposCommentList.handleSaveToTpos(id, name),
        toggleHideComment: (id, hide) => TposColumnManager.toggleHideComment(id, hide),
        toggleStatusDropdown: () => window.TposCustomerPanel.toggleStatusDropdown(),
        selectStatus: (v, t) => window.TposCustomerPanel.selectStatus(v, t),
        toggleInlineStatusDropdown: (id) => window.TposCommentList.toggleInlineStatusDropdown(id),
        selectInlineStatus: (id, v, t) => window.TposCommentList.selectInlineStatus(id, v, t),
        saveInlinePhone: (id, inputId) => window.TposCommentList.saveInlinePhone(id, inputId),
        saveInlineAddress: (id, inputId) => window.TposCommentList.saveInlineAddress(id, inputId),
        setDebtDisplaySettings: (a, b) => TposColumnManager.setDebtDisplaySettings(a, b),
        updateSaveButtonToCheckmark: (id) => window.TposCommentList.updateSaveButtonToCheckmark(id),
        // Expose state for external access
        get comments() {
            return window.TposState.comments;
        },
        get selectedPage() {
            return window.TposState.selectedPage;
        },
        get selectedCampaign() {
            return window.TposState.selectedCampaign;
        },
        get savedToTposIds() {
            return window.TposState.savedToTposIds;
        },
        get sessionIndexMap() {
            return window.TposState.sessionIndexMap;
        },
        getCacheStats: () => window.TposState.getCacheStats(),
    };
}
