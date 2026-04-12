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

        // Live Campaign changed
        bus.on('tpos:liveCampaignChanged', async (campaignId) => {
            await this.onLiveCampaignChange(campaignId);
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
                const optionExists = Array.from(crmSelect.options).some(opt => opt.value === savedPage);
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
                const first = state.liveCampaigns[0];
                const campaignSelect = document.getElementById('tposLiveCampaignSelect');
                if (campaignSelect) campaignSelect.value = first.Id;
                await this.onLiveCampaignChange(first.Id);
                return;
            }
        } else {
            const [teamId, pageId] = value.split(':');
            state.selectedTeamId = parseInt(teamId);

            for (const team of state.crmTeams) {
                if (team.Id === state.selectedTeamId) {
                    state.selectedPage = team.Childs?.find(p => p.Id === parseInt(pageId));
                    break;
                }
            }

            state.selectedPages = state.selectedPage ? [state.selectedPage] : [];

            if (state.selectedPage) {
                state.savePageSelection(value);

                await window.TposApi.loadLiveCampaigns(state.selectedPage.Facebook_PageId);
                window.TposCommentList.renderLiveCampaignOptions();

                if (state.liveCampaigns.length > 0) {
                    const first = state.liveCampaigns[0];
                    const campaignSelect = document.getElementById('tposLiveCampaignSelect');
                    if (campaignSelect) campaignSelect.value = first.Id;
                    await this.onLiveCampaignChange(first.Id);
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
        state.selectedCampaign = state.liveCampaigns.find(c => c.Id === campaignId);

        if (state.selectedCampaign) {
            // Multi-page: update selectedPage to match campaign's page
            if (state.selectedPages.length > 1) {
                const campaignPageId = state.selectedCampaign.Facebook_UserId;
                state.selectedPage = state.allPages.find(p => p.Facebook_PageId === campaignPageId) || state.selectedPage;
            }
            await this.loadComments();
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
            const campaignPageName = state.selectedCampaign?.Facebook_UserName || state.selectedPage?.Name || '';
            result.comments.forEach(c => { c._pageName = campaignPageName; });

            if (append) {
                state.comments = [...state.comments, ...result.comments];
            } else {
                state.comments = result.comments;
            }

            state.nextPageUrl = result.nextPageUrl;
            state.hasMore = !!state.nextPageUrl;

            console.log('[TPOS-INIT] Loaded comments:', result.comments.length, 'Total:', state.comments.length);
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
     * Load SessionIndex for current campaign
     */
    async loadSessionIndex() {
        const state = window.TposState;
        if (!state.selectedCampaign) return;

        try {
            const postId = state.selectedCampaign.Facebook_LiveId;
            const map = await window.TposApi.loadSessionIndex(postId);
            state.sessionIndexMap = map;
            console.log('[TPOS-INIT] Loaded SessionIndex for', map.size, 'users');

            if (state.comments.length > 0) {
                window.TposCommentList.renderComments();
            }
        } catch (error) {
            console.error('[TPOS-INIT] Error loading SessionIndex:', error);
        }
    },

    /**
     * Load partner info for all visible comments (batch, then re-render)
     */
    async loadPartnerInfoForComments() {
        const state = window.TposState;
        const userIds = [...new Set(state.comments.map(c => c.from?.id).filter(Boolean))];
        const crmTeamId = state.selectedTeamId || state.selectedPage?.CRMTeamId || state.selectedPage?.Id;
        if (!crmTeamId) return;

        // Batch fetch (5 concurrent)
        const batchSize = 5;
        for (let i = 0; i < userIds.length; i += batchSize) {
            const batch = userIds.slice(i, i + batchSize);
            await Promise.all(batch.map(async (userId) => {
                if (state.partnerCache.has(userId)) return;
                if (state.partnerFetchPromises.has(userId)) return state.partnerFetchPromises.get(userId);

                const promise = (async () => {
                    try {
                        const data = await window.TposApi.getPartnerInfo(crmTeamId, userId);
                        if (data?.Partner) {
                            state.partnerCache.set(userId, data.Partner);
                        }
                    } catch (e) {
                        // silently skip
                    } finally {
                        state.partnerFetchPromises.delete(userId);
                    }
                })();

                state.partnerFetchPromises.set(userId, promise);
                return promise;
            }));
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
        const comment = state.comments.find(c => c.id === commentId);
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
                    window.notificationManager.show(hide ? 'Đã ẩn comment trên Facebook' : 'Đã hiện comment trên Facebook', 'success');
                }
            } else {
                // Revert on failure
                comment.is_hidden = !hide;
                window.TposCommentList.renderComments();
                if (window.notificationManager) {
                    window.notificationManager.show('Lỗi: Không thể ' + (hide ? 'ẩn' : 'hiện') + ' comment', 'error');
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
    }
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
        get comments() { return window.TposState.comments; },
        get selectedPage() { return window.TposState.selectedPage; },
        get selectedCampaign() { return window.TposState.selectedCampaign; },
        get savedToTposIds() { return window.TposState.savedToTposIds; },
        get sessionIndexMap() { return window.TposState.sessionIndexMap; },
        getCacheStats: () => window.TposState.getCacheStats()
    };
}
