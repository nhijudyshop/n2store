// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * LiveSale Column Initializer & Orchestrator.
 *
 * Mirrors the TPOS contract:
 *   - window.LiveSaleColumnManager.initialize(containerId)
 *   - window.LiveSaleColumnManager.refresh()
 *   - alias exposed as window.TposColumnManager / window.tposChatManager
 *
 * Event namespace is kept identical to TPOS (tpos:crmTeamChanged,
 * tpos:liveCampaignChanged, tpos:commentSelected, ...) so the Pancake
 * column and app-init cross-column wiring don't need any changes.
 */

const LiveSaleColumnManager = {
    async initialize(containerId) {
        const state = window.LiveSaleState;
        if (!state) {
            console.error('[LiveSale] LiveSaleState not loaded');
            return;
        }
        state.containerId = containerId;
        console.log('[LiveSale] Initializing in:', containerId);

        state.startCacheCleanup();

        window.LiveSaleCommentList?.renderContainer();
        this._setupEventListeners();
        this._setupRealtimeListeners();

        try {
            await window.LiveSaleApi?.loadCRMTeams();
            window.LiveSaleCommentList?.renderCrmTeamOptions();
            this._restoreSelection();
        } catch (err) {
            console.warn('[LiveSale] initial load failed:', err.message);
        }
    },

    _setupEventListeners() {
        const bus = window.eventBus;
        if (!bus) return;
        bus.on('tpos:crmTeamChanged', (v) => this._onCrmTeamChange(v));
        bus.on('tpos:liveCampaignChanged', (v) => this._onLiveCampaignChange(v));
        bus.on('tpos:campaignsChanged', (ids) => this._onMultiCampaignChange(ids));
        bus.on('tpos:refreshRequested', () => this.refresh());
        bus.on('tpos:loadMoreRequested', () => this.loadMoreComments());
    },

    _setupRealtimeListeners() {
        window.addEventListener('tposRealtimeConnected', () => {
            window.LiveSaleCommentList?.updateConnectionStatus(true, 'sse');
        });
        window.addEventListener('tposRealtimeDisconnected', () => {
            window.LiveSaleCommentList?.updateConnectionStatus(false, 'sse');
        });
    },

    _restoreSelection() {
        const state = window.LiveSaleState;
        const saved = state.getSavedPageSelection();
        if (!saved) return;
        const sel = document.getElementById('tposCrmTeamSelect');
        if (!sel) return;
        const has = Array.from(sel.options).some((o) => o.value === saved);
        if (has) {
            sel.value = saved;
            this._onCrmTeamChange(saved);
        }
    },

    async _onCrmTeamChange(value) {
        const state = window.LiveSaleState;
        if (!value) {
            state.selectedPage = null;
            state.selectedPages = [];
            state.liveCampaigns = [];
            window.LiveSaleCommentList?.renderLiveCampaignOptions();
            return;
        }

        if (value === 'all') {
            state.selectedPage = state.allPages[0] || null;
            state.selectedPages = [...state.allPages];
            state.savePageSelection(value);
            await window.LiveSaleApi?.loadLiveCampaignsFromAllPages();
            window.LiveSaleCommentList?.renderLiveCampaignOptions();
            return;
        }

        // "teamId:pageId" format (we keep the shape even though teamId is always 0 in LiveSale)
        const [, pageRaw] = value.split(':');
        const pageId = pageRaw;
        state.selectedPage = state.allPages.find(
            (p) => String(p.id) === String(pageId) || p.fb_page_id === pageId,
        );
        state.selectedPages = state.selectedPage ? [state.selectedPage] : [];
        state.savePageSelection(value);

        if (state.selectedPage) {
            await window.LiveSaleApi?.loadLiveCampaigns(state.selectedPage.fb_page_id || state.selectedPage.Facebook_PageId);
            window.LiveSaleCommentList?.renderLiveCampaignOptions();
        }
    },

    async _onLiveCampaignChange(campaignId) {
        const state = window.LiveSaleState;
        if (!campaignId) {
            state.selectedCampaign = null;
            window.LiveSaleRealtime?.stopSSE();
            state.comments = [];
            state.clearAllCaches();
            window.LiveSaleCommentList?.renderComments();
            return;
        }
        state.clearAllCaches();
        state.selectedCampaign = (state.liveCampaigns || []).find((c) => String(c.Id) === String(campaignId));
        if (state.selectedCampaign) await this.loadComments();
    },

    async _onMultiCampaignChange(ids) {
        if (!ids || ids.length === 0) {
            await this._onLiveCampaignChange('');
            return;
        }
        // Phase 1: pick the first one. Phase 4 will fan out like TPOS did.
        await this._onLiveCampaignChange(ids[0]);
    },

    async loadComments(append = false) {
        const state = window.LiveSaleState;
        if (!state || state.isLoading || !state.selectedPage || !state.selectedCampaign) return;
        state.isLoading = true;
        if (!append) {
            state.comments = [];
            state.nextPageCursor = null;
            window.LiveSaleCommentList?.showLoading();
        }

        try {
            const pageId = state.selectedPage.fb_page_id || state.selectedPage.Facebook_PageId;
            const postId = state.selectedCampaign.Facebook_LiveId || state.selectedCampaign.fb_post_id;

            const result = await window.LiveSaleApi.loadComments(pageId, postId, append ? state.nextPageCursor : null);
            const fetched = result.comments || [];

            state.comments = append ? [...state.comments, ...fetched] : fetched;
            state.nextPageCursor = result.nextPageUrl;
            state.hasMore = !!result.nextPageUrl;

            window.LiveSaleCommentList?.renderComments();

            if (!append) {
                window.LiveSaleRealtime?.startSSE(pageId, postId, state.selectedCampaign.Facebook_UserName || '');
            }
        } catch (err) {
            console.error('[LiveSale] loadComments error:', err);
            if (!append) window.LiveSaleCommentList?.showError(err.message);
        } finally {
            state.isLoading = false;
        }
    },

    async loadMoreComments() {
        const state = window.LiveSaleState;
        if (state?.hasMore && !state?.isLoading) await this.loadComments(true);
    },

    async refresh() {
        window.LiveSaleRealtime?.stopSSE();
        const state = window.LiveSaleState;
        if (state?.selectedCampaign) return this.loadComments();
        if (state?.selectedPage) {
            await window.LiveSaleApi?.loadLiveCampaigns(state.selectedPage.fb_page_id || state.selectedPage.Facebook_PageId);
            window.LiveSaleCommentList?.renderLiveCampaignOptions();
            return;
        }
        await window.LiveSaleApi?.loadCRMTeams();
        window.LiveSaleCommentList?.renderCrmTeamOptions();
    },

    async toggleHideComment(commentId, hide) {
        const state = window.LiveSaleState;
        const comment = (state?.comments || []).find((c) => c.id === commentId);
        if (!comment) return;
        comment.is_hidden = hide;
        window.LiveSaleCommentList?.renderComments();
        const pageId = state?.selectedPage?.fb_page_id || state?.selectedPage?.Facebook_PageId;
        if (!pageId) return;
        const ok = await window.LiveSaleApi.hideComment(pageId, commentId, hide);
        if (!ok) {
            comment.is_hidden = !hide;
            window.LiveSaleCommentList?.renderComments();
            window.notificationManager?.show(hide ? 'Không thể ẩn' : 'Không thể hiện', 'error');
        }
    },

    setDebtDisplaySettings(showDebt, showZeroDebt) {
        window.LiveSaleCommentList?.setDebtDisplaySettings(showDebt, showZeroDebt);
    },

    destroy() {
        window.LiveSaleRealtime?.stopSSE();
        window.LiveSaleState?.stopCacheCleanup();
    },
};

if (typeof window !== 'undefined') {
    window.LiveSaleColumnManager = LiveSaleColumnManager;

    // --- Back-compat aliases so app-init.js and inline HTML keep working ---
    window.TposColumnManager = window.TposColumnManager || LiveSaleColumnManager;

    if (!window.TposInit) {
        window.TposInit = {
            initialize: (id) => LiveSaleColumnManager.initialize(id),
            refresh: () => LiveSaleColumnManager.refresh(),
        };
    }

    if (!window.tposChatManager) {
        const cm = LiveSaleColumnManager;
        window.tposChatManager = {
            initialize: (id) => cm.initialize(id),
            refresh: () => cm.refresh(),
            loadComments: () => cm.loadComments(),
            selectComment: (id) => window.LiveSaleCommentList.selectComment(id),
            showCustomerInfo: (id, n) => window.LiveSaleCustomerPanel.showCustomerInfo(id, n),
            closeCustomerInfoModal: () => window.LiveSaleCustomerPanel.closeModal(),
            handleSaveToTpos: (id, n) => window.LiveSaleCommentList.handleSaveToTpos?.(id, n),
            toggleHideComment: (id, hide) => cm.toggleHideComment(id, hide),
            toggleStatusDropdown: () => window.LiveSaleCustomerPanel.toggleStatusDropdown(),
            selectStatus: (v, t) => window.LiveSaleCustomerPanel.selectStatus(v, t),
            toggleInlineStatusDropdown: (id) => window.LiveSaleCommentList.toggleInlineStatusDropdown(id),
            selectInlineStatus: (id, v, t) => window.LiveSaleCommentList.selectInlineStatus(id, v, t),
            saveInlinePhone: (id, inp) => window.LiveSaleCommentList.saveInlinePhone(id, inp),
            saveInlineAddress: (id, inp) => window.LiveSaleCommentList.saveInlineAddress(id, inp),
            setDebtDisplaySettings: (a, b) => cm.setDebtDisplaySettings(a, b),
            updateSaveButtonToCheckmark: (id) => window.LiveSaleCommentList.updateSaveButtonToCheckmark?.(id),
            get comments() { return window.LiveSaleState.comments; },
            get selectedPage() { return window.LiveSaleState.selectedPage; },
            get selectedCampaign() { return window.LiveSaleState.selectedCampaign; },
            get savedToTposIds() { return window.LiveSaleState.savedToTposIds; },
            get sessionIndexMap() { return window.LiveSaleState.sessionIndexMap; },
            getCacheStats: () => window.LiveSaleState.getCacheStats(),
        };
    }
}
