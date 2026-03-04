/* =====================================================
   INBOX DATA - Pancake API integration & group management
   Uses pancakeDataManager + pancakeTokenManager (from tpos-pancake)
   tpos-pancake version has built-in Instagram page filtering
   ===================================================== */

// Default group labels for categorizing conversations
const DEFAULT_GROUPS = [
    { id: 'new', name: 'Inbox Mới', color: '#3b82f6', count: 0, note: 'Các tin nhắn mới từ khách hàng chưa được xử lý, cần phản hồi sớm.' },
    { id: 'processing', name: 'Đang Xử Lý', color: '#f59e0b', count: 0, note: 'Các cuộc hội thoại đang được nhân viên xử lý, chưa hoàn tất.' },
    { id: 'waiting', name: 'Chờ Phản Hồi', color: '#f97316', count: 0, note: 'Đã trả lời khách, đang chờ khách phản hồi lại.' },
    { id: 'ordered', name: 'Đã Đặt Hàng', color: '#10b981', count: 0, note: 'Khách đã chốt đơn và đặt hàng thành công.' },
    { id: 'urgent', name: 'Cần Gấp', color: '#ef4444', count: 0, note: 'Các trường hợp cần xử lý gấp: khiếu nại, đổi trả, lỗi đơn hàng.' },
    { id: 'done', name: 'Hoàn Tất', color: '#6b7280', count: 0, note: 'Cuộc hội thoại đã xử lý xong, không cần theo dõi thêm.' },
];

/**
 * InboxDataManager - Manages conversations from Pancake API + local group labels
 */
class InboxDataManager {
    constructor() {
        this.conversations = [];  // Mapped conversations from Pancake
        this.groups = [];
        this.pages = [];          // Pancake pages
        this.livestreamConvIds = new Set(); // Track livestream conversation IDs
        this.labelMap = {};       // convId -> labelId (saved to localStorage)
        this.starredSet = new Set(); // convId set (saved to localStorage)
        this.isInitialized = false;
    }

    /**
     * Initialize Pancake managers and load data
     * Token manager: orders-report (no Firestore timeout, loads accounts from Firebase)
     * Data manager: tpos-pancake (has built-in IG page filtering)
     */
    async init() {
        this.loadGroups();
        this.loadLocalState();

        try {
            // Initialize Pancake token manager (orders-report version - no timeout)
            await window.pancakeTokenManager.initialize();
            console.log('[InboxData] Pancake token manager initialized, accounts:', Object.keys(window.pancakeTokenManager.accounts || {}).length);

            // Initialize Pancake data manager (tpos-pancake version - IG filter)
            await window.pancakeDataManager.initialize();
            console.log('[InboxData] Pancake data manager initialized, pages:', window.pancakeDataManager.pageIds?.length);

            // Check if initialize() already loaded conversations
            const pdm = window.pancakeDataManager;
            if (pdm.conversations && pdm.conversations.length > 0) {
                this.pages = pdm.pages || [];
                this.conversations = pdm.conversations.map(conv => this.mapConversation(conv));
                console.log(`[InboxData] Got ${this.conversations.length} conversations from initialize()`);
            } else {
                // Try other accounts if current one returned 0
                await this.loadConversations(true);
            }

            this.recalculateGroupCounts();
            this.isInitialized = true;
            console.log('[InboxData] Initialization complete');
        } catch (error) {
            console.error('[InboxData] Pancake initialization error:', error);
            showToast('Lỗi kết nối Pancake: ' + error.message, 'error');
        }
    }

    /**
     * Load local state: labels, stars, livestream IDs from localStorage
     */
    loadLocalState() {
        try {
            const labels = localStorage.getItem('inbox_conv_labels');
            if (labels) this.labelMap = JSON.parse(labels);

            const starred = localStorage.getItem('inbox_conv_starred');
            if (starred) this.starredSet = new Set(JSON.parse(starred));

            const liveIds = localStorage.getItem('inbox_livestream_convs');
            if (liveIds) this.livestreamConvIds = new Set(JSON.parse(liveIds));
        } catch (e) {
            console.warn('[InboxData] Error loading local state:', e);
        }
    }

    /**
     * Save local state to localStorage
     */
    saveLocalState() {
        try {
            localStorage.setItem('inbox_conv_labels', JSON.stringify(this.labelMap));
            localStorage.setItem('inbox_conv_starred', JSON.stringify([...this.starredSet]));
            localStorage.setItem('inbox_livestream_convs', JSON.stringify([...this.livestreamConvIds]));
        } catch (e) {
            console.warn('[InboxData] Error saving local state:', e);
        }
    }

    loadGroups() {
        try {
            const saved = localStorage.getItem('inbox_groups');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.groups = parsed.map(g => ({ note: '', ...g }));
            } else {
                this.groups = DEFAULT_GROUPS.map(g => ({ ...g }));
            }
        } catch {
            this.groups = DEFAULT_GROUPS.map(g => ({ ...g }));
        }
    }

    /**
     * Fetch conversations with proper error checking
     * The data manager's fetchConversations doesn't check data.success,
     * so we intercept the raw response to detect API errors
     */
    async fetchConversationsWithErrorCheck(forceRefresh = false) {
        const pdm = window.pancakeDataManager;

        // Patch: intercept the response to check for API errors
        const origFetch = pdm._origSmartFetch || API_CONFIG.smartFetch;
        if (!pdm._origSmartFetch) {
            pdm._origSmartFetch = API_CONFIG.smartFetch;
        }

        let lastResponseData = null;
        API_CONFIG.smartFetch = async function(url, options) {
            const response = await origFetch.call(this, url, options);
            const cloned = response.clone();
            try {
                lastResponseData = await cloned.json();
            } catch (e) { /* ignore */ }
            return response;
        };

        const result = await pdm.fetchConversations(forceRefresh);

        // Restore original
        API_CONFIG.smartFetch = origFetch;

        // Check if API returned an error
        if (lastResponseData && lastResponseData.success === false) {
            const errorCode = lastResponseData.error_code;
            const errorMsg = lastResponseData.message || 'Unknown error';
            console.error(`[InboxData] ❌ Pancake API error: code=${errorCode}, message="${errorMsg}"`);
            return { conversations: [], error: errorCode, message: errorMsg };
        }

        return { conversations: result, error: null };
    }

    /**
     * Fetch conversations per-page using /pages/{pageId}/conversations endpoint
     * This endpoint works even when the multi-page /conversations endpoint
     * returns error 122 (subscription expired)
     */
    async fetchConversationsPerPage() {
        const ptm = window.pancakeTokenManager;
        const pdm = window.pancakeDataManager;
        if (!ptm || !pdm) return [];

        const token = ptm.getToken();
        if (!token) {
            console.warn('[InboxData] No token available for per-page fetch');
            return [];
        }

        const pageIds = pdm.pageIds || [];
        if (pageIds.length === 0) {
            console.warn('[InboxData] No pages available');
            return [];
        }

        console.log(`[InboxData] 🔄 Fetching conversations per-page for ${pageIds.length} pages...`);
        let allConversations = [];

        for (const pageId of pageIds) {
            try {
                const params = `unread_first=true&mode=OR&tags="ALL"&except_tags=[]&access_token=${token}&cursor_mode=true&from_platform=web`;
                const url = API_CONFIG.buildUrl.pancake(`pages/${pageId}/conversations`, params);

                console.log(`[InboxData] Fetching page ${pageId}...`);
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });

                if (!response.ok) {
                    console.warn(`[InboxData] Page ${pageId}: HTTP ${response.status}`);
                    continue;
                }

                const data = await response.json();

                if (data.success === false) {
                    console.warn(`[InboxData] Page ${pageId}: error ${data.error_code} - ${data.message}`);
                    continue;
                }

                const convs = data.conversations || [];
                console.log(`[InboxData] ✅ Page ${pageId}: ${convs.length} conversations`);
                allConversations = allConversations.concat(convs);
            } catch (e) {
                console.warn(`[InboxData] Page ${pageId} failed:`, e.message);
            }
        }

        // Sort by updated_at descending
        allConversations.sort((a, b) => {
            const ta = new Date(a.updated_at || 0).getTime();
            const tb = new Date(b.updated_at || 0).getTime();
            return tb - ta;
        });

        // Update pdm cache so other parts of the app can use it
        pdm.conversations = allConversations;

        console.log(`[InboxData] ✅ Per-page total: ${allConversations.length} conversations`);
        return allConversations;
    }

    /**
     * Load conversations from Pancake API and map to inbox format
     * Strategy: try multi-page endpoint first, fallback to per-page endpoint
     */
    async loadConversations(forceRefresh = false) {
        try {
            const pdm = window.pancakeDataManager;
            if (!pdm) {
                console.warn('[InboxData] pancakeDataManager not available');
                return;
            }

            // Try multi-page endpoint first
            let { conversations: rawConversations, error, message } = await this.fetchConversationsWithErrorCheck(forceRefresh);

            // If multi-page fails with subscription error, try per-page endpoint
            if (error === 122 || error === 105) {
                console.log(`[InboxData] Multi-page endpoint failed (${error}), trying per-page...`);
                rawConversations = await this.fetchConversationsPerPage();

                // If per-page also fails for current account, try other accounts
                if (rawConversations.length === 0) {
                    rawConversations = await this.tryOtherAccountsPerPage();
                }
            } else if (rawConversations.length === 0) {
                // No error but 0 results, try other accounts
                rawConversations = await this.tryOtherAccounts();
            }

            console.log(`[InboxData] Got ${rawConversations.length} conversations from Pancake`);

            if (rawConversations.length === 0) {
                showToast('Không có cuộc hội thoại. Kiểm tra tài khoản Pancake.', 'warning');
            }

            // Get pages for page name lookup
            this.pages = pdm.pages || [];

            // Map Pancake conversations to inbox format
            this.conversations = rawConversations.map(conv => this.mapConversation(conv));

            this.recalculateGroupCounts();
            return this.conversations;
        } catch (error) {
            console.error('[InboxData] Error loading conversations:', error);
            return [];
        }
    }

    /**
     * Try other accounts using per-page endpoint
     */
    async tryOtherAccountsPerPage() {
        const ptm = window.pancakeTokenManager;
        if (!ptm || !ptm.accounts) return [];

        const currentId = ptm.activeAccountId;
        const accountIds = Object.keys(ptm.accounts);

        console.log(`[InboxData] Per-page failed for active account, trying ${accountIds.length - 1} others...`);

        for (const accountId of accountIds) {
            if (accountId === currentId) continue;

            const account = ptm.accounts[accountId];
            if (ptm.isTokenExpired && ptm.isTokenExpired(account.exp)) continue;

            console.log(`[InboxData] Trying account: ${account.name || accountId}`);
            const switched = await ptm.setActiveAccount(accountId);
            if (!switched) continue;

            try {
                const convs = await this.fetchConversationsPerPage();
                if (convs.length > 0) {
                    console.log(`[InboxData] ✅ Account "${account.name}" works! ${convs.length} conversations`);
                    showToast(`Đã chuyển sang tài khoản: ${account.name || accountId}`, 'success');
                    return convs;
                }
            } catch (e) {
                console.warn(`[InboxData] Account "${account.name}" failed:`, e.message);
            }
        }

        // All failed, restore original
        if (currentId) await ptm.setActiveAccount(currentId);
        console.warn('[InboxData] All accounts failed (per-page)');
        return [];
    }

    /**
     * Try switching to other Pancake accounts (multi-page endpoint)
     * Returns conversations array from the first working account, or []
     */
    async tryOtherAccounts() {
        const ptm = window.pancakeTokenManager;
        const pdm = window.pancakeDataManager;
        if (!ptm || !ptm.accounts || !pdm) return [];

        const currentId = ptm.activeAccountId;
        const accountIds = Object.keys(ptm.accounts);

        console.log(`[InboxData] Active account returned 0 conversations, trying ${accountIds.length - 1} other accounts...`);

        for (const accountId of accountIds) {
            if (accountId === currentId) continue;

            const account = ptm.accounts[accountId];
            if (ptm.isTokenExpired && ptm.isTokenExpired(account.exp)) continue;

            console.log(`[InboxData] Trying account: ${account.name || accountId}`);
            const switched = await ptm.setActiveAccount(accountId);
            if (!switched) continue;

            try {
                const { conversations: convs, error, message } = await this.fetchConversationsWithErrorCheck(true);
                if (error) {
                    console.warn(`[InboxData] Account "${account.name}" API error (${error}): ${message}`);
                    continue;
                }
                if (convs.length > 0) {
                    console.log(`[InboxData] Account "${account.name}" works! ${convs.length} conversations`);
                    showToast(`Đã chuyển sang tài khoản: ${account.name || accountId}`, 'success');
                    return convs;
                }
            } catch (e) {
                console.warn(`[InboxData] Account "${account.name}" failed:`, e.message);
            }
        }

        // All failed, restore original
        if (currentId) await ptm.setActiveAccount(currentId);
        console.warn('[InboxData] All accounts failed to load conversations');
        return [];
    }

    /**
     * Map a Pancake conversation to inbox format
     */
    mapConversation(conv) {
        const customerName = conv.from?.name
            || (conv.customers && conv.customers.length > 0 ? conv.customers[0].name : '')
            || 'Khách hàng';

        const pageName = this.getPageName(conv.page_id);

        return {
            id: conv.id,
            name: customerName,
            avatar: conv.from?.avatar || null,
            lastMessage: conv.snippet || conv.last_message?.text || conv.last_message?.message || '',
            time: new Date(conv.updated_at || conv.last_message?.inserted_at || Date.now()),
            unread: conv.unread_count || 0,
            online: false,
            phone: '',
            label: this.labelMap[conv.id] || 'new',
            starred: this.starredSet.has(conv.id),
            isLivestream: this.livestreamConvIds.has(conv.id),
            type: conv.type, // 'INBOX' or 'COMMENT'
            pageId: conv.page_id,
            pageName: pageName,
            psid: conv.from_psid || conv.from?.id || '',
            customerId: (conv.customers && conv.customers.length > 0) ? conv.customers[0].id : null,
            conversationId: conv.id,
            messages: [], // Messages loaded on demand
            _raw: conv,   // Keep raw data for reference
        };
    }

    /**
     * Get page name by pageId
     */
    getPageName(pageId) {
        const page = this.pages.find(p => p.id === pageId || p.page_id === pageId);
        return page?.name || '';
    }

    save() {
        try {
            localStorage.setItem('inbox_groups', JSON.stringify(this.groups));
            this.saveLocalState();
        } catch (e) {
            console.error('[InboxData] Save error:', e);
        }
    }

    recalculateGroupCounts() {
        this.groups.forEach(g => { g.count = 0; });
        this.conversations.forEach(conv => {
            const group = this.groups.find(g => g.id === conv.label);
            if (group) group.count++;
        });
    }

    getConversations({ search = '', filter = 'all', groupFilter = null } = {}) {
        let result = [...this.conversations];

        if (filter === 'unread') {
            result = result.filter(c => c.unread > 0);
        } else if (filter === 'starred') {
            result = result.filter(c => c.starred);
        } else if (filter === 'livestream') {
            result = result.filter(c => c.isLivestream);
        }

        if (groupFilter) {
            result = result.filter(c => c.label === groupFilter);
        }

        if (search) {
            const q = search.toLowerCase();
            result = result.filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.lastMessage.toLowerCase().includes(q) ||
                (c.phone && c.phone.includes(q)) ||
                (c.pageName && c.pageName.toLowerCase().includes(q))
            );
        }

        result.sort((a, b) => b.time - a.time);
        return result;
    }

    getConversation(id) {
        return this.conversations.find(c => c.id === id);
    }

    setConversationLabel(convId, labelId) {
        const conv = this.getConversation(convId);
        if (conv) {
            conv.label = labelId;
            this.labelMap[convId] = labelId;
            this.recalculateGroupCounts();
            this.save();
        }
    }

    markAsRead(convId) {
        const conv = this.getConversation(convId);
        if (conv) {
            conv.unread = 0;
            // Also mark as read on Pancake API
            if (conv.pageId && window.pancakeDataManager) {
                window.pancakeDataManager.markConversationAsRead(conv.pageId, convId).catch(err => {
                    console.warn('[InboxData] Error marking as read on Pancake:', err);
                });
            }
        }
    }

    toggleStar(convId) {
        const conv = this.getConversation(convId);
        if (conv) {
            conv.starred = !conv.starred;
            if (conv.starred) {
                this.starredSet.add(convId);
            } else {
                this.starredSet.delete(convId);
            }
            this.save();
            return conv.starred;
        }
        return false;
    }

    /**
     * Mark a conversation as livestream (detected from messages response)
     */
    markAsLivestream(convId) {
        this.livestreamConvIds.add(convId);
        const conv = this.getConversation(convId);
        if (conv) {
            conv.isLivestream = true;
        }
        this.saveLocalState();
    }

    addMessage(convId, text, sender = 'shop') {
        const conv = this.getConversation(convId);
        if (!conv) return null;

        const message = {
            id: 'm' + Date.now(),
            text,
            time: new Date(),
            sender,
        };

        conv.messages.push(message);
        conv.lastMessage = text;
        conv.time = message.time;
        return message;
    }

    // ===== Group Management (unchanged) =====

    addGroup(name, color, note) {
        const id = 'group_' + Date.now();
        const group = { id, name, color, count: 0, note: note || '' };
        this.groups.push(group);
        this.save();
        return group;
    }

    updateGroup(id, updates) {
        const group = this.groups.find(g => g.id === id);
        if (group) {
            if (updates.name !== undefined) group.name = updates.name;
            if (updates.color !== undefined) group.color = updates.color;
            if (updates.note !== undefined) group.note = updates.note;
            this.save();
        }
    }

    deleteGroup(id) {
        const idx = this.groups.findIndex(g => g.id === id);
        if (idx !== -1) {
            this.conversations.forEach(c => {
                if (c.label === id) {
                    c.label = 'new';
                    this.labelMap[c.id] = 'new';
                }
            });
            this.groups.splice(idx, 1);
            this.recalculateGroupCounts();
            this.save();
        }
    }

    getStats() {
        const total = this.conversations.length;
        const processing = this.conversations.filter(c => c.label === 'processing').length;
        const waiting = this.conversations.filter(c => c.label === 'waiting').length;
        const urgent = this.conversations.filter(c => c.label === 'urgent').length;
        return { total, processing, waiting, urgent };
    }
}

// Export globally
window.InboxDataManager = InboxDataManager;
window.DEFAULT_GROUPS = DEFAULT_GROUPS;
