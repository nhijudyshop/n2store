/* =====================================================
   INBOX DATA - Pancake API integration & group management
   Uses pancakeDataManager + pancakeTokenManager (reuse from orders-report)
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
     */
    async init() {
        this.loadGroups();
        this.loadLocalState();

        try {
            // Initialize Pancake token manager (global instance auto-created by script)
            await window.pancakeTokenManager.initialize();
            console.log('[InboxData] Pancake token manager initialized');

            // Initialize Pancake data manager (global instance auto-created by script)
            await window.pancakeDataManager.initialize();
            console.log('[InboxData] Pancake data manager initialized');

            // Filter out Instagram pages (igo_ prefix) to avoid subscription errors
            // Reference: tpos-pancake/js/pancake-data-manager.js
            this.filterInstagramPages();

            // Load conversations from Pancake API
            await this.loadConversations();
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

    /**
     * Filter out Instagram pages (igo_ prefix) from pancakeDataManager
     * Instagram pages require separate subscription and cause error_code 122
     */
    filterInstagramPages() {
        const pdm = window.pancakeDataManager;
        if (!pdm) return;

        const beforeCount = pdm.pageIds?.length || 0;
        if (pdm.pages) {
            pdm.pages = pdm.pages.filter(p => !p.id?.startsWith('igo_'));
        }
        if (pdm.pageIds) {
            pdm.pageIds = pdm.pageIds.filter(id => !id.startsWith('igo_'));
        }
        const afterCount = pdm.pageIds?.length || 0;

        if (beforeCount > afterCount) {
            console.log(`[InboxData] Filtered out ${beforeCount - afterCount} Instagram pages`);
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
     * Load conversations from Pancake API and map to inbox format
     * If active account's subscription expired, auto-try other accounts
     */
    async loadConversations(forceRefresh = false) {
        try {
            const pdm = window.pancakeDataManager;
            if (!pdm) {
                console.warn('[InboxData] pancakeDataManager not available');
                return;
            }

            // Fetch conversations from Pancake
            let rawConversations = await pdm.fetchConversations(forceRefresh);

            // If 0 results, check if the API returned an error (e.g. expired subscription)
            // The fetchConversations doesn't throw on error_code, it just returns []
            if (rawConversations.length === 0) {
                const switched = await this.tryOtherAccounts();
                if (switched) {
                    // Re-fetch with new account
                    rawConversations = await pdm.fetchConversations(true);
                }
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
     * Try switching to other Pancake accounts if current one fails
     * Returns true if successfully switched to a working account
     */
    async tryOtherAccounts() {
        const ptm = window.pancakeTokenManager;
        if (!ptm || !ptm.accounts) return false;

        const currentId = ptm.activeAccountId;
        const accountIds = Object.keys(ptm.accounts);

        console.log(`[InboxData] Active account returned 0 conversations, trying ${accountIds.length - 1} other accounts...`);

        for (const accountId of accountIds) {
            if (accountId === currentId) continue;

            const account = ptm.accounts[accountId];
            // Skip expired tokens
            if (ptm.isTokenExpired && ptm.isTokenExpired(account.exp)) continue;

            console.log(`[InboxData] Trying account: ${account.name || accountId}`);
            const switched = await ptm.setActiveAccount(accountId);
            if (!switched) continue;

            // Clear sessionStorage cache so fetchConversations re-fetches
            try { sessionStorage.removeItem(window.pancakeDataManager?.CONVERSATIONS_CACHE_KEY); } catch (e) {}

            // Test this account by fetching conversations
            try {
                const testConvs = await window.pancakeDataManager.fetchConversations(true);
                if (testConvs.length > 0) {
                    console.log(`[InboxData] Account "${account.name}" works! ${testConvs.length} conversations`);
                    showToast(`Đã chuyển sang tài khoản: ${account.name || accountId}`, 'success');
                    return true;
                }
            } catch (e) {
                console.warn(`[InboxData] Account "${account.name}" failed:`, e.message);
            }
        }

        // All accounts failed, restore original
        if (currentId) {
            await ptm.setActiveAccount(currentId);
        }
        console.warn('[InboxData] All accounts failed to load conversations');
        showToast('Tất cả tài khoản Pancake không tải được hội thoại. Gói cước có thể đã hết hạn.', 'error');
        return false;
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
