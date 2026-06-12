// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Live State Management
 * Centralized state for the Live (left) column
 * Dependencies: SharedCache (window.SharedCache)
 */

const LiveState = {
    // Selected entities
    selectedTeamId: null,
    selectedPage: null,
    selectedPages: [], // Multi-page support
    selectedCampaign: null,

    // Data lists
    crmTeams: [],
    allPages: [],
    liveCampaigns: [],
    // Phân trang bài livestream (cuộn dropdown campaign → tải thêm bài cũ hơn).
    // pageId -> { oldest: epochSeconds|null, done: bool }. oldest = mốc inserted_at
    // cũ nhất ĐÃ fetch (cursor `end_time` cho lần sau). done=true → page hết bài.
    liveCampaignCursors: {},
    isLoadingMoreCampaigns: false,

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
    // maxSize=2000: live campaign 1 bài có thể có 500-1500+ unique customers, cap 200 cũ
    // gây LRU evict → row trống SĐT/địa chỉ dù partner đã load (xác nhận 2026-06-01:
    // bài thật 461 unique users → 200 cap → 261 row mãi mãi trống).
    partnerCache: new SharedCache({ maxSize: 2000, ttl: 10 * 60 * 1000, name: 'LivePartner' }),
    partnerFetchPromises: new Map(),

    // Kho khách hàng (Web 1.0 Render DB) enrich cache: FB user id -> { phone, address, name, status }.
    // CHỈ dùng LẤP CHỖ TRỐNG khi partnerCache (Live) không có Phone/Street — không ghi đè Live.
    // Tách riêng partnerCache để không phá luồng save (savePartnerData cần partner.Id của Live).
    customerKhoCache: new Map(),

    // Debt display settings
    showDebt: true,
    showZeroDebt: false,

    // Saved-to-Live tracking (hides "+" button after saving)
    savedToLiveIds: new Set(),

    // Current partner ID (for customer info modal)
    currentPartnerId: null,

    // Container ID
    containerId: null,

    // API base URLs
    // /facebook/* routes (crm-teams, live-campaigns, comments, SSE) → Render server
    // /api/odata/*, /api/rest/*, /api/v2/* → CF Worker or Render server
    proxyBaseUrl: 'https://chatomni-proxy.nhijudyshop.workers.dev',
    workerUrl: window.API_CONFIG
        ? window.API_CONFIG.WORKER_URL
        : 'https://chatomni-proxy.nhijudyshop.workers.dev',
    // Relay WS server — service Render giữ tên CŨ 'n2store-tpos-pancake' (folder đã
    // rename live-chat). 'n2store-live-chat.onrender.com' KHÔNG tồn tại (no-server).
    livePancakeUrl: 'https://n2store-tpos-pancake.onrender.com',
    // CF Worker proxy — strips /api/ prefix then forwards to tomato.live.vn
    // (so `${liveBaseUrl}/rest/...` becomes tomato.live.vn/rest/... upstream while
    // the browser sees CORS headers from Cloudflare).
    liveBaseUrl: 'https://chatomni-proxy.nhijudyshop.workers.dev/api',

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
        console.log('[Live-STATE] All caches cleared');
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
            savedToLiveIds: this.savedToLiveIds.size,
        };
    },

    /**
     * Restore saved page selection from localStorage
     */
    getSavedPageSelection() {
        return localStorage.getItem('web2_selected_page') || null;
    },

    /**
     * Save page selection to localStorage
     */
    savePageSelection(value) {
        localStorage.setItem('web2_selected_page', value);
    },

    /**
     * Save selected campaign IDs to localStorage
     */
    saveCampaignSelection() {
        if (this.selectedCampaignIds) {
            localStorage.setItem(
                'web2_selected_campaigns',
                JSON.stringify(Array.from(this.selectedCampaignIds))
            );
        }
    },

    /**
     * Restore saved campaign IDs from localStorage
     * @returns {string[]|null}
     */
    getSavedCampaignSelection() {
        try {
            const saved = localStorage.getItem('web2_selected_campaigns');
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    },
};

// Export for script-tag usage
if (typeof window !== 'undefined') {
    window.LiveState = LiveState;
}
