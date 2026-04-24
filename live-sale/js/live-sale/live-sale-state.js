// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * LiveSale State — web-native replacement for TPOS state.
 * Keeps the same shape as tpos/tpos-state.js so the rest of the app stays
 * compatible (eventBus events, container IDs, cache structures).
 */

const LS_LOCAL = {
    PAGE_KEY: 'live_sale_selected_page',
    SESSION_KEY: 'live_sale_selected_sessions',
    SETTINGS_KEY: 'liveSaleSettings',
};

const LiveSaleState = {
    // Init flag
    _initialized: false,

    // DOM anchor
    containerId: null,

    // Pages & sessions (replacement for CRM Teams / live campaigns)
    allPages: [],            // [{ id, name, fb_page_id, access_token? }]
    selectedPage: null,
    selectedPages: [],
    liveSessions: [],        // [{ id, fb_post_id, fb_live_id, title, started_at }]
    selectedSession: null,
    selectedSessionIds: new Set(),

    // Comments
    comments: [],
    nextPageCursor: null,
    hasMore: false,
    isLoading: false,

    // Session index (comment → order badge)
    sessionIndexMap: new Map(),

    // Partner / customer cache — keyed by fb_user_id
    partnerCache: null,      // SharedCache (init in initialize)
    partnerFetchPromises: new Map(),

    // Saved-to-livesale list (replacement for tposSavedIds on Pancake side)
    savedToTposIds: new Set(),

    // Settings
    showDebt: true,
    showZeroDebt: false,

    /**
     * Initialize caches and settings.
     */
    initialize() {
        if (this._initialized) return;
        this._initialized = true;

        if (window.SharedCache) {
            this.partnerCache = new window.SharedCache({
                maxSize: 200,
                ttl: 10 * 60 * 1000,
                name: 'LiveSalePartner',
            });
        }

        this._loadSettings();
    },

    _loadSettings() {
        try {
            const raw = localStorage.getItem(LS_LOCAL.SETTINGS_KEY) || localStorage.getItem('tposSettings');
            if (raw) {
                const s = JSON.parse(raw);
                if (typeof s.showDebt === 'boolean') this.showDebt = s.showDebt;
                if (typeof s.showZeroDebt === 'boolean') this.showZeroDebt = s.showZeroDebt;
            }
        } catch (_e) {
            // ignore malformed settings
        }
    },

    // ---- Persistence helpers ----------------------------------------------

    getSavedPageSelection() {
        return localStorage.getItem(LS_LOCAL.PAGE_KEY) || localStorage.getItem('tpos_selected_page');
    },

    savePageSelection(value) {
        if (value) localStorage.setItem(LS_LOCAL.PAGE_KEY, value);
        else localStorage.removeItem(LS_LOCAL.PAGE_KEY);
    },

    getSavedSessionSelection() {
        const raw = localStorage.getItem(LS_LOCAL.SESSION_KEY) || localStorage.getItem('tpos_selected_campaigns');
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
    },

    saveSessionSelection() {
        const ids = Array.from(this.selectedSessionIds || []);
        if (ids.length === 0) localStorage.removeItem(LS_LOCAL.SESSION_KEY);
        else localStorage.setItem(LS_LOCAL.SESSION_KEY, JSON.stringify(ids));
    },

    // ---- Cache helpers ----------------------------------------------------

    clearAllCaches() {
        if (this.partnerCache && typeof this.partnerCache.clear === 'function') {
            this.partnerCache.clear();
        }
        this.partnerFetchPromises.clear();
        this.sessionIndexMap.clear();
    },

    startCacheCleanup() {
        if (this._cleanupTimer) return;
        this._cleanupTimer = setInterval(() => {
            if (this.partnerCache?.cleanup) this.partnerCache.cleanup();
        }, 5 * 60 * 1000);
    },

    stopCacheCleanup() {
        if (this._cleanupTimer) {
            clearInterval(this._cleanupTimer);
            this._cleanupTimer = null;
        }
    },

    getCacheStats() {
        return {
            partnerCacheSize: this.partnerCache?.size?.() || 0,
            pendingFetches: this.partnerFetchPromises.size,
            sessionIndexSize: this.sessionIndexMap.size,
            commentCount: this.comments.length,
        };
    },
};

if (typeof window !== 'undefined') {
    LiveSaleState.initialize();
    window.LiveSaleState = LiveSaleState;
    // Compat alias so any legacy code/tpos inline scripts keep working.
    window.TposState = window.TposState || LiveSaleState;
}
