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
    activeFilter: 'all', // 'all' | 'inbox' | 'comment' | 'live-saved'
    liveSavedIds: new Set(),

    // UI state
    isLoading: false,
    isPageDropdownOpen: false,
    isScrolledToBottom: true,
    newMessageCount: 0,

    // Typing
    typingIndicators: new Map(),

    // Server mode
    serverMode: localStorage.getItem('web2_pancake_server_mode') || 'pancake',

    // URLs
    proxyBaseUrl: 'https://chatomni-proxy.nhijudyshop.workers.dev',
    // Relay WS server — service Render giữ tên CŨ 'n2store-tpos-pancake' (folder đã
    // rename live-chat). 'n2store-live-chat.onrender.com' KHÔNG tồn tại (no-server).
    livePancakeUrl: 'https://n2store-tpos-pancake.onrender.com',
    n2storeUrl: 'https://n2store-facebook.onrender.com',

    // Debt
    showDebt: true,
    showZeroDebt: false,
    debtCache: new Map(),
    debtCacheConfig: { maxSize: 200, ttl: 10 * 60 * 1000 },

    // Quick replies — colorful tag chips (đồng bộ với native-orders
    // W2_DEFAULT_QUICK_TAGS: nhãn có dấu, template thật, màu rgba(...,0.4)).
    quickReplies: [
        {
            label: 'NV My KH đặt',
            template: 'Dạ shop xác nhận đơn của mình ạ. Nv.My',
            color: 'rgba(33, 68, 247, 0.4)',
        },
        {
            label: 'NV My CK + Gấp',
            template: 'Dạ ck giúp shop để gửi gấp nha ạ. Nv.My',
            color: 'rgba(33, 68, 247, 0.4)',
        },
        {
            label: 'NHẮC KHÁCH',
            template: 'Dạ mình nhắc nhẹ khách iu ơi 💕',
            color: 'rgba(241, 71, 255, 0.4)',
        },
        {
            label: 'XIN ĐỊA CHỈ',
            template: 'Dạ chị iu xác nhận giúp e địa chỉ + sđt nha ạ 🌷',
            color: 'rgba(18, 101, 10, 0.4)',
        },
        { label: 'NV . BO', template: '', color: 'rgba(10, 241, 238, 0.4)' },
        { label: 'NJD ƠI', template: '', color: 'rgba(146, 84, 222, 0.4)' },
        { label: 'NV. Lài', template: '', color: 'rgba(244, 241, 24, 0.4)' },
        { label: 'NV. Hạnh 🌷', template: '', color: 'rgba(75, 147, 68, 0.4)' },
        { label: 'Nv.Huyền 🐣', template: '', color: 'rgba(247, 200, 33, 0.4)' },
        { label: 'Nv. Duyên', template: '', color: 'rgba(33, 200, 247, 0.4)' },
        { label: 'XỬ LÝ BC', template: '', color: 'rgba(244, 80, 24, 0.4)' },
        { label: 'BOOM', template: '', color: 'rgba(247, 33, 33, 0.4)' },
        { label: 'CHECK IB', template: '', color: 'rgba(140, 84, 33, 0.4)' },
        { label: 'Nv My', template: 'Nv.My', color: 'rgba(33, 68, 247, 0.4)' },
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
        localStorage.setItem('web2_pancake_server_mode', mode);
        console.log('[PANCAKE-STATE] Server mode:', mode);
    },

    /**
     * Save/load selected page from localStorage
     */
    saveSelectedPage() {
        try {
            if (this.selectedPageId) {
                localStorage.setItem('web2_pancake_selected_page', this.selectedPageId);
            } else {
                localStorage.removeItem('web2_pancake_selected_page');
            }
        } catch (e) {
            console.warn('[PANCAKE-STATE] Could not save selected page:', e);
        }
    },

    loadSelectedPage() {
        try {
            const saved = localStorage.getItem('web2_pancake_selected_page');
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
