// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * TPOS State Management
 * Centralized state for the TPOS (left) column
 * Dependencies: SharedCache (window.SharedCache)
 */

const TposState = {
    // Selected entities
    selectedTeamId: null,
    selectedPage: null,
    selectedPages: [],        // Multi-page support
    selectedCampaign: null,

    // Data lists
    crmTeams: [],
    allPages: [],
    liveCampaigns: [],

    // Comments
    comments: [],
    nextPageUrl: null,
    hasMore: false,
    isLoading: false,

    // SSE connection
    eventSource: null,
    sseConnected: false,

    // SessionIndex map: ASUID -> { index, session, code }
    sessionIndexMap: new Map(),

    // Partner cache (TTL + LRU via SharedCache)
    partnerCache: new SharedCache({ maxSize: 200, ttl: 10 * 60 * 1000, name: 'TposPartner' }),
    partnerFetchPromises: new Map(),

    // Debt display settings
    showDebt: true,
    showZeroDebt: false,

    // Saved-to-Tpos tracking (hides "+" button after saving)
    savedToTposIds: new Set(),

    // Current partner ID (for customer info modal)
    currentPartnerId: null,

    // Container ID
    containerId: null,

    // API base URLs
    // /facebook/* routes (crm-teams, live-campaigns, comments, SSE) → Render server
    // /api/odata/*, /api/rest/*, /api/v2/* → CF Worker or Render server
    proxyBaseUrl: 'https://n2store-fallback.onrender.com',
    workerUrl: (window.API_CONFIG ? window.API_CONFIG.WORKER_URL : 'https://chatomni-proxy.nhijudyshop.workers.dev'),
    tposPancakeUrl: 'https://n2store-tpos-pancake.onrender.com',
    tposBaseUrl: 'https://tomato.tpos.vn',

    /**
     * Reset state when switching campaigns
     */
    clearAllCaches() {
        this.partnerCache.clear();
        this.partnerFetchPromises.clear();
        this.sessionIndexMap.clear();
        if (window.sharedDebtManager) {
            window.sharedDebtManager.clear();
        }
        console.log('[TPOS-STATE] All caches cleared');
    },

    /**
     * Start periodic cache cleanup
     */
    startCacheCleanup() {
        this.partnerCache.startCleanup();
    },

    /**
     * Stop cache cleanup timers
     */
    stopCacheCleanup() {
        this.partnerCache.stopCleanup();
    },

    /**
     * Get cache statistics for debugging
     */
    getCacheStats() {
        return {
            partnerCache: this.partnerCache.size,
            sessionIndexMap: this.sessionIndexMap.size,
            savedToTposIds: this.savedToTposIds.size
        };
    },

    /**
     * Restore saved page selection from localStorage
     */
    getSavedPageSelection() {
        return localStorage.getItem('tpos_selected_page') || null;
    },

    /**
     * Save page selection to localStorage
     */
    savePageSelection(value) {
        localStorage.setItem('tpos_selected_page', value);
    }
};

// Export for script-tag usage
if (typeof window !== 'undefined') {
    window.TposState = TposState;
}
