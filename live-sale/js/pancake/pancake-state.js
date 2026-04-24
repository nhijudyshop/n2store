// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PANCAKE STATE - Centralized state for Pancake column
// =====================================================

const PancakeState = {
    // Conversation data
    conversations: [],
    activeConversation: null,
    messages: [],

    // Pages
    pages: [],
    pagesWithUnread: [],
    selectedPageId: null,
    pageIds: [],

    // Pagination
    pagesWithCurrentCount: {},
    hasMoreConversations: true,
    isLoadingMoreConversations: false,
    lastConversationId: null,

    // Message pagination
    hasMoreMessages: true,
    isLoadingMoreMessages: false,
    messageCurrentCount: 0,

    // Search
    searchQuery: '',
    searchResults: null,
    isSearching: false,

    // Filters
    activeFilter: 'all', // 'all' | 'inbox' | 'comment' | 'tpos-saved'
    tposSavedIds: new Set(),

    // UI state
    isLoading: false,
    isPageDropdownOpen: false,
    isScrolledToBottom: true,
    newMessageCount: 0,

    // Typing
    typingIndicators: new Map(),

    // Server mode
    serverMode: localStorage.getItem('tpos_pancake_server_mode') || 'pancake',

    // URLs
    proxyBaseUrl: 'https://chatomni-proxy.nhijudyshop.workers.dev',
    tposPancakeUrl: 'https://n2store-tpos-pancake.onrender.com',
    n2storeUrl: 'https://n2store-facebook.onrender.com',

    // Debt
    showDebt: true,
    showZeroDebt: false,
    debtCache: new Map(),
    debtCacheConfig: { maxSize: 200, ttl: 10 * 60 * 1000 },

    // Quick replies
    quickReplies: [
        { label: 'NV My KH dat', color: 'blue', template: '' },
        { label: 'NV My CK + Gap', color: 'blue', template: '' },
        { label: 'NHAC KHACH', color: 'red', template: '' },
        { label: 'XIN DIA CHI', color: 'purple', template: '' },
        { label: 'NV .BO', color: 'teal', template: '' },
        { label: 'NJD OI', color: 'green', template: '' },
        { label: 'NV. Lai', color: 'orange', template: '' },
        { label: 'NV. Hanh', color: 'pink', template: '' },
        { label: 'Nv.Huyen', color: 'pink', template: '' },
        { label: 'Nv. Duyen', color: 'teal', template: '' },
        { label: 'XU LY BC', color: 'purple', template: '' },
        { label: 'BOOM', color: 'red', template: '' },
        { label: 'CHECK IB', color: 'green', template: '' },
        { label: 'Nv My', color: 'blue', template: '' },
    ],

    // Emoji data
    emojiData: null,

    // WebSocket state
    isSocketConnected: false,
    isSocketConnecting: false,
    socketReconnectAttempts: 0,

    // Searchable pages cache (pages without subscription errors)
    _searchablePageIds: null,

    // =====================================================
    // METHODS
    // =====================================================

    /**
     * Set server mode and persist
     * @param {string} mode - 'pancake' or 'n2store'
     */
    setServerMode(mode) {
        if (mode !== 'pancake' && mode !== 'n2store') return;
        this.serverMode = mode;
        localStorage.setItem('tpos_pancake_server_mode', mode);
        console.log('[PANCAKE-STATE] Server mode:', mode);
    },

    /**
     * Save/load selected page from localStorage
     */
    saveSelectedPage() {
        try {
            if (this.selectedPageId) {
                localStorage.setItem('tpos_pancake_selected_page', this.selectedPageId);
            } else {
                localStorage.removeItem('tpos_pancake_selected_page');
            }
        } catch (e) {
            console.warn('[PANCAKE-STATE] Could not save selected page:', e);
        }
    },

    loadSelectedPage() {
        try {
            const saved = localStorage.getItem('tpos_pancake_selected_page');
            if (saved && this.pages.some((p) => p.id === saved)) {
                this.selectedPageId = saved;
            }
        } catch (e) {
            console.warn('[PANCAKE-STATE] Could not load selected page:', e);
        }
    },

    /**
     * Debt cache management
     */
    setDebtCache(phone, amount) {
        if (this.debtCache.size >= this.debtCacheConfig.maxSize) {
            const entries = Array.from(this.debtCache.entries()).sort(
                (a, b) => a[1].timestamp - b[1].timestamp
            );
            entries
                .slice(0, Math.floor(this.debtCacheConfig.maxSize * 0.2))
                .forEach(([key]) => this.debtCache.delete(key));
        }
        this.debtCache.set(phone, { amount, timestamp: Date.now() });
    },

    getDebtCache(phone) {
        const entry = this.debtCache.get(phone);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > this.debtCacheConfig.ttl) {
            this.debtCache.delete(phone);
            return null;
        }
        return entry.amount;
    },

    /**
     * Reset state for new conversation
     */
    resetMessageState() {
        this.messages = [];
        this.hasMoreMessages = true;
        this.isLoadingMoreMessages = false;
        this.messageCurrentCount = 0;
        this.isScrolledToBottom = true;
        this.newMessageCount = 0;
    },

    /**
     * Reset search state
     */
    clearSearch() {
        this.searchQuery = '';
        this.searchResults = null;
        this.isSearching = false;
    },
};

// Export
if (typeof window !== 'undefined') {
    window.PancakeState = PancakeState;
}
