/* =====================================================
   INBOX DATA MANAGER - Data layer for Inbox
   Conversations, groups, labels, livestream
   ===================================================== */

const DEFAULT_GROUPS = [
    { id: 'new', name: 'Inbox Mới', color: '#3b82f6', note: 'Tin nhắn mới chưa xử lý', count: 0 },
    { id: 'processing', name: 'Đang Xử Lý', color: '#f59e0b', note: 'Đang được nhân viên xử lý', count: 0 },
    { id: 'waiting', name: 'Chờ Phản Hồi', color: '#f97316', note: 'Đã trả lời, chờ khách', count: 0 },
    { id: 'ordered', name: 'Đã Đặt Hàng', color: '#10b981', note: 'Khách đã chốt đơn', count: 0 },
    { id: 'urgent', name: 'Cần Gấp', color: '#ef4444', note: 'Khiếu nại, đổi trả, lỗi', count: 0 },
    { id: 'done', name: 'Hoàn Tất', color: '#6b7280', note: 'Xong, không cần theo dõi', count: 0 }
];

class InboxDataManager {
    constructor() {
        this.conversations = [];
        this.pages = [];
        this.pageIds = [];
        this.groups = [];
        this.labelMap = {};
        this.livestreamPostMap = {};

        // O(1) lookup maps
        this.conversationMap = {};
        this.conversationByPsidMap = {};
        this.conversationByCustomerIdMap = {};

        // API references
        this.api = window.inboxPancakeAPI;
        this.tm = window.inboxTokenManager;

        // State
        this.workingPageIds = [];
        this._hasMore = true;
        this._isLoading = false;
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    async init() {
        console.log('[INBOX-DATA] Initializing...');

        // 1. Initialize token manager
        await this.tm.initialize();
        console.log('[INBOX-DATA] Token manager ready');

        // 2. Fetch pages
        this.pages = await this.api.fetchPages();
        this.pageIds = this.pages.map(p => p.id);
        console.log(`[INBOX-DATA] ${this.pages.length} pages loaded`);

        // 3. Load conversations
        await this.loadConversations();

        // 4. Load groups/labels from server (async, non-blocking)
        this.loadGroups();
        await Promise.all([
            this.loadGroupsFromServer(),
            this.syncLabelsFromServer(),
            this.fetchLivestreamFromServer()
        ]);

        this.recalculateGroupCounts();
        this.buildMaps();

        console.log(`[INBOX-DATA] Initialized: ${this.conversations.length} conversations, ${this.groups.length} groups`);
    }

    // =====================================================
    // LOAD CONVERSATIONS - Fallback Chain
    // =====================================================

    async loadConversations(forceRefresh = false) {
        if (this._isLoading) return;
        this._isLoading = true;

        try {
            // Per-page fetch via Public API v2 (page_access_token)
            const result = await this.api.fetchConversations();

            if (result.conversations.length > 0) {
                this.conversations = result.conversations.map(c => this.mapConversation(c));
                this.buildMaps();

                if (result.error) {
                    console.warn('[INBOX-DATA] Partial errors:', result.error);
                }
                return;
            }

            // No results from current account → try other accounts
            if (result.error) {
                console.warn('[INBOX-DATA] All pages failed:', result.error);
            }

            const other = await this._tryOtherAccounts();
            if (other.length > 0) {
                this.conversations = other.map(c => this.mapConversation(c));
                this.buildMaps();
                return;
            }

            console.warn('[INBOX-DATA] No conversations loaded from any source');
        } catch (e) {
            console.error('[INBOX-DATA] loadConversations error:', e);
        } finally {
            this._isLoading = false;
        }
    }

    async _tryOtherAccounts() {
        const accounts = this.tm.getValidAccounts();
        const currentId = this.tm.getActiveAccountId();

        for (const acc of accounts) {
            if (acc.accountId === currentId) continue;
            console.log(`[INBOX-DATA] Trying account: ${acc.name}`);
            await this.tm.setActiveAccount(acc.accountId);

            // Re-fetch pages + generate page_access_tokens for new account
            await this.api.fetchPages(true);
            const result = await this.api.fetchConversations();
            if (result.conversations.length > 0) {
                return result.conversations;
            }
        }
        // Restore original account
        if (currentId) await this.tm.setActiveAccount(currentId);
        return [];
    }

    // --- Load More (pagination) ---
    async loadMoreConversations() {
        if (this._isLoading || !this._hasMore) return [];
        this._isLoading = true;
        try {
            const more = await this.api.fetchMoreConversations();
            if (more.length === 0) {
                this._hasMore = false;
                return [];
            }
            const mapped = more.map(c => this.mapConversation(c));
            // Dedup
            const existingIds = new Set(this.conversations.map(c => c.id));
            const newConvs = mapped.filter(c => !existingIds.has(c.id));
            this.conversations.push(...newConvs);
            this.buildMaps();
            return newConvs;
        } finally {
            this._isLoading = false;
        }
    }

    get hasMore() { return this._hasMore; }
    get isLoading() { return this._isLoading; }

    // =====================================================
    // MAP CONVERSATION (Pancake → Inbox format)
    // =====================================================

    mapConversation(conv) {
        const customers = conv.customers || [];
        const customer = customers[0] || {};
        const from = conv.from || {};

        return {
            id: conv.id,
            name: customer.name || from.name || 'Unknown',
            avatar: customer.avatar || from.avatar || null,
            type: conv.type || 'INBOX', // INBOX or COMMENT
            pageId: conv.page_id,
            pageName: this.getPageName(conv.page_id),
            psid: conv.from_psid || from.id || null,
            customerId: customer.id || null,
            customerFbId: customer.fb_id || from.id || null,
            snippet: conv.snippet || '',
            unread: conv.unread_count || 0,
            seen: conv.seen !== false,
            time: this.parseTimestamp(conv.updated_at),
            tags: conv.tags || [],
            labels: this.getLabelArray(conv.id),
            isLivestream: !!this.livestreamPostMap[conv.id],
            livestreamPostId: this.livestreamPostMap[conv.id]?.postId || null,
            threadId: conv.thread_id || null,
            threadKey: conv.thread_key || null,
            postId: conv.post_id || null,
            lastMessageFrom: conv.last_message_from || null,
            // Preserve raw for later use
            _raw: conv
        };
    }

    parseTimestamp(ts) {
        if (!ts) return new Date(0);
        if (typeof ts === 'number') {
            return ts > 1e12 ? new Date(ts) : new Date(ts * 1000);
        }
        if (typeof ts === 'string') {
            const d = new Date(ts);
            if (!isNaN(d)) return d;
            // Try adding Z if no timezone
            if (!ts.includes('Z') && !ts.includes('+')) {
                const dz = new Date(ts + 'Z');
                if (!isNaN(dz)) return dz;
            }
        }
        return new Date(0);
    }

    // =====================================================
    // LOOKUP MAPS
    // =====================================================

    buildMaps() {
        this.conversationMap = {};
        this.conversationByPsidMap = {};
        this.conversationByCustomerIdMap = {};

        for (const conv of this.conversations) {
            this.conversationMap[conv.id] = conv;
            if (conv.psid) this.conversationByPsidMap[conv.psid] = conv;
            if (conv.customerId) this.conversationByCustomerIdMap[conv.customerId] = conv;
            if (conv.customerFbId) this.conversationByPsidMap[conv.customerFbId] = conv;
        }
    }

    getConversation(id) { return this.conversationMap[id] || null; }
    getConversationByPsid(psid) { return this.conversationByPsidMap[psid] || null; }
    getPageName(pageId) {
        const page = this.pages.find(p => p.id === pageId);
        return page?.name || pageId || '';
    }

    // =====================================================
    // FILTER & SORT
    // =====================================================

    getConversations({ search = '', filter = 'all', groupFilters = [], selectedPageIds = null, typeFilter = null } = {}) {
        let list = [...this.conversations];

        // Page filter
        if (selectedPageIds && selectedPageIds.length > 0) {
            list = list.filter(c => selectedPageIds.includes(String(c.pageId)));
        }

        // Type filter (INBOX / COMMENT)
        if (typeFilter) {
            list = list.filter(c => c.type === typeFilter);
        }

        // Filter tab
        if (filter === 'unread') {
            list = list.filter(c => c.unread > 0);
        } else if (filter === 'livestream') {
            list = list.filter(c => c.isLivestream);
        } else if (filter === 'inbox_my') {
            // Show conversations with labels assigned (not 'new')
            list = list.filter(c => {
                const labels = this.getLabelArray(c.id);
                return labels.length > 0 && !(labels.length === 1 && labels[0] === 'new');
            });
        }

        // Group label filter
        if (groupFilters.length > 0) {
            list = list.filter(c => {
                const labels = this.getLabelArray(c.id);
                return groupFilters.some(g => labels.includes(g));
            });
        }

        // Search
        if (search) {
            const q = this._removeDiacritics(search);
            list = list.filter(c => {
                const haystack = this._removeDiacritics(
                    `${c.name} ${c.snippet} ${c.pageName} ${c.psid || ''}`
                );
                return haystack.includes(q);
            });
        }

        // Sort: unread first, then by time desc
        list.sort((a, b) => {
            if (a.unread > 0 && b.unread === 0) return -1;
            if (a.unread === 0 && b.unread > 0) return 1;
            return (b.time?.getTime() || 0) - (a.time?.getTime() || 0);
        });

        return list;
    }

    _removeDiacritics(str) {
        if (!str) return '';
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
    }

    // =====================================================
    // 24H WINDOW CHECK
    // =====================================================

    check24hWindow(convId) {
        const conv = this.getConversation(convId);
        if (!conv) return { within24h: false, message: 'Conversation not found' };
        if (conv.type !== 'INBOX') return { within24h: true, message: 'Comment type' };

        // Check last customer message time (from raw data if available)
        const raw = conv._raw;
        if (raw?.last_customer_message_at) {
            const lastMsg = this.parseTimestamp(raw.last_customer_message_at);
            const diff = Date.now() - lastMsg.getTime();
            if (diff > 24 * 60 * 60 * 1000) {
                return { within24h: false, message: 'Quá 24h kể từ tin nhắn cuối của khách' };
            }
        }
        return { within24h: true, message: 'OK' };
    }

    // =====================================================
    // MARK READ/UNREAD
    // =====================================================

    async markAsRead(convId) {
        const conv = this.getConversation(convId);
        if (!conv) return;
        conv.unread = 0;
        conv.seen = true;
        this.api.markAsRead(conv.pageId, convId);
        // Also mark on server
        this._markRepliedOnServer(conv.psid, conv.pageId);
    }

    async markAsUnread(convId) {
        const conv = this.getConversation(convId);
        if (!conv) return;
        conv.unread = 1;
        conv.seen = false;
        this.api.markAsUnread(conv.pageId, convId);
    }

    async _markRepliedOnServer(psid, pageId) {
        if (!psid || !pageId) return;
        try {
            await fetch(InboxApiConfig.buildUrl.dataApi('mark-replied'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ psid, page_id: pageId })
            });
        } catch (e) {}
    }

    // =====================================================
    // OPTIMISTIC MESSAGE ADD
    // =====================================================

    addMessage(convId, text, sender, extra = {}) {
        const conv = this.getConversation(convId);
        if (!conv) return null;

        const msg = {
            id: `temp_${Date.now()}`,
            text,
            sender,
            time: new Date(),
            isOptimistic: true,
            ...extra
        };

        conv.snippet = text || conv.snippet;
        conv.time = new Date();

        return msg;
    }

    // =====================================================
    // GROUPS
    // =====================================================

    loadGroups() {
        try {
            const stored = localStorage.getItem('inbox_groups');
            if (stored) {
                this.groups = JSON.parse(stored);
                return;
            }
        } catch (e) {}
        this.groups = JSON.parse(JSON.stringify(DEFAULT_GROUPS));
    }

    async loadGroupsFromServer() {
        try {
            const res = await fetch(InboxApiConfig.buildUrl.dataApi('inbox-groups'));
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                this.groups = data;
                localStorage.setItem('inbox_groups', JSON.stringify(data));
            } else if (data.groups && Array.isArray(data.groups) && data.groups.length > 0) {
                this.groups = data.groups;
                localStorage.setItem('inbox_groups', JSON.stringify(data.groups));
            }
        } catch (e) {
            console.warn('[INBOX-DATA] loadGroupsFromServer error:', e);
        }
    }

    async saveGroupsToServer() {
        localStorage.setItem('inbox_groups', JSON.stringify(this.groups));
        try {
            await fetch(InboxApiConfig.buildUrl.dataApi('inbox-groups'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groups: this.groups })
            });
        } catch (e) {}
    }

    addGroup(name, color, note = '') {
        const group = { id: `group_${Date.now()}`, name, color, note, count: 0 };
        this.groups.push(group);
        this.saveGroupsToServer();
        return group;
    }

    updateGroup(id, updates) {
        const group = this.groups.find(g => g.id === id);
        if (!group) return;
        Object.assign(group, updates);
        this.saveGroupsToServer();
    }

    deleteGroup(id) {
        this.groups = this.groups.filter(g => g.id !== id);
        // Reassign conversations with this label to 'new'
        for (const [convId, labels] of Object.entries(this.labelMap)) {
            if (labels.includes(id)) {
                this.labelMap[convId] = labels.filter(l => l !== id);
                if (this.labelMap[convId].length === 0) this.labelMap[convId] = ['new'];
            }
        }
        this.saveGroupsToServer();
        this._saveLabelsLocal();
    }

    // =====================================================
    // LABELS
    // =====================================================

    getLabelArray(convId) {
        return this.labelMap[convId] || ['new'];
    }

    toggleConversationLabel(convId, labelId) {
        let labels = [...(this.labelMap[convId] || ['new'])];

        if (labelId === 'done') {
            labels = ['done'];
        } else {
            // Remove 'done' if present
            labels = labels.filter(l => l !== 'done');

            if (labels.includes(labelId)) {
                labels = labels.filter(l => l !== labelId);
            } else {
                labels.push(labelId);
            }

            if (labels.length === 0) labels = ['new'];
            if (labels.length > 1) labels = labels.filter(l => l !== 'new');
        }

        this.labelMap[convId] = labels;

        // Update conversation object
        const conv = this.getConversation(convId);
        if (conv) conv.labels = labels;

        this._saveLabelsLocal();
        this._saveLabelToServer(convId, labels);
        this.recalculateGroupCounts();
    }

    _saveLabelsLocal() {
        try {
            localStorage.setItem('inbox_conv_labels', JSON.stringify(this.labelMap));
        } catch (e) {}
    }

    async _saveLabelToServer(convId, labels) {
        try {
            await fetch(InboxApiConfig.buildUrl.dataApi('conversation-label'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conv_id: convId, labels: JSON.stringify(labels) })
            });
        } catch (e) {}
    }

    async syncLabelsFromServer() {
        // Load local
        try {
            const stored = localStorage.getItem('inbox_conv_labels');
            if (stored) this.labelMap = JSON.parse(stored);
        } catch (e) {}

        // Fetch server
        try {
            const res = await fetch(InboxApiConfig.buildUrl.dataApi('conversation-labels'));
            if (!res.ok) return;
            const data = await res.json();

            // Merge: server wins on conflict
            if (Array.isArray(data)) {
                for (const item of data) {
                    if (item.conv_id && item.labels) {
                        try {
                            const labels = typeof item.labels === 'string' ? JSON.parse(item.labels) : item.labels;
                            this.labelMap[item.conv_id] = labels;
                        } catch (e) {}
                    }
                }
            } else if (typeof data === 'object') {
                for (const [convId, labels] of Object.entries(data)) {
                    if (Array.isArray(labels)) this.labelMap[convId] = labels;
                }
            }

            this._saveLabelsLocal();

            // Push local-only labels to server
            const localOnlyLabels = {};
            for (const [convId, labels] of Object.entries(this.labelMap)) {
                if (labels.length > 0 && !(labels.length === 1 && labels[0] === 'new')) {
                    localOnlyLabels[convId] = labels;
                }
            }

            if (Object.keys(localOnlyLabels).length > 0) {
                const items = Object.entries(localOnlyLabels).map(([conv_id, labels]) => ({
                    conv_id, labels: JSON.stringify(labels)
                }));
                fetch(InboxApiConfig.buildUrl.dataApi('conversation-labels/bulk'), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items })
                }).catch(() => {});
            }
        } catch (e) {
            console.warn('[INBOX-DATA] syncLabelsFromServer error:', e);
        }
    }

    recalculateGroupCounts(typeFilter = null) {
        const counts = {};
        for (const g of this.groups) counts[g.id] = 0;

        for (const conv of this.conversations) {
            if (typeFilter && conv.type !== typeFilter) continue;
            const labels = this.getLabelArray(conv.id);
            for (const label of labels) {
                if (counts[label] !== undefined) counts[label]++;
            }
        }

        for (const g of this.groups) g.count = counts[g.id] || 0;
    }

    // =====================================================
    // LIVESTREAM
    // =====================================================

    async fetchLivestreamFromServer() {
        try {
            const res = await fetch(InboxApiConfig.buildUrl.dataApi('livestream-conversations'));
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data)) {
                this.livestreamPostMap = {};
                for (const item of data) {
                    if (item.conv_id) {
                        this.livestreamPostMap[item.conv_id] = {
                            postId: item.post_id, postName: item.post_name,
                            name: item.name, type: item.type, pageId: item.page_id
                        };
                    }
                }
                // Update conversations
                for (const conv of this.conversations) {
                    conv.isLivestream = !!this.livestreamPostMap[conv.id];
                    conv.livestreamPostId = this.livestreamPostMap[conv.id]?.postId || null;
                }
            }
        } catch (e) {
            console.warn('[INBOX-DATA] fetchLivestreamFromServer error:', e);
        }
    }

    async markAsLivestream(convId, postId) {
        const conv = this.getConversation(convId);
        if (!conv) return;
        conv.isLivestream = true;
        conv.livestreamPostId = postId;
        this.livestreamPostMap[convId] = { postId, name: conv.name, type: conv.type, pageId: conv.pageId };

        // Save to server
        try {
            await fetch(InboxApiConfig.buildUrl.dataApi('livestream-conversation'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conv_id: convId, post_id: postId, post_name: '',
                    name: conv.name, type: conv.type, page_id: conv.pageId,
                    psid: conv.psid, customer_id: conv.customerId
                })
            });
        } catch (e) {}

        // Also mark other conversations of same customer
        if (conv.psid && conv.pageId) {
            this.markCustomerAsLivestream(conv.psid, conv.pageId, conv.name, postId);
        }
    }

    async markCustomerAsLivestream(psid, pageId, name, postId) {
        for (const conv of this.conversations) {
            if (conv.psid === psid && conv.pageId === pageId && !conv.isLivestream) {
                conv.isLivestream = true;
                conv.livestreamPostId = postId;
                this.livestreamPostMap[conv.id] = { postId, name: conv.name, type: conv.type, pageId: conv.pageId };
                try {
                    fetch(InboxApiConfig.buildUrl.dataApi('livestream-conversation'), {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            conv_id: conv.id, post_id: postId, name: conv.name,
                            type: conv.type, page_id: conv.pageId, psid: conv.psid
                        })
                    }).catch(() => {});
                } catch (e) {}
            }
        }
    }

    unmarkAsLivestream(convId) {
        const conv = this.getConversation(convId);
        if (!conv) return;
        conv.isLivestream = false;
        conv.livestreamPostId = null;
        delete this.livestreamPostMap[convId];
        // Delete from server
        fetch(InboxApiConfig.buildUrl.dataApi(`livestream-conversations?conv_id=${convId}`), {
            method: 'DELETE'
        }).catch(() => {});
    }

    // =====================================================
    // STATS
    // =====================================================

    getStats() {
        const stats = {
            total: this.conversations.length,
            unread: 0,
            inbox: 0,
            comment: 0,
            livestream: 0,
            byGroup: {}
        };

        for (const g of this.groups) stats.byGroup[g.id] = 0;

        for (const conv of this.conversations) {
            if (conv.unread > 0) stats.unread++;
            if (conv.type === 'INBOX') stats.inbox++;
            if (conv.type === 'COMMENT') stats.comment++;
            if (conv.isLivestream) stats.livestream++;
            const labels = this.getLabelArray(conv.id);
            for (const label of labels) {
                if (stats.byGroup[label] !== undefined) stats.byGroup[label]++;
            }
        }

        return stats;
    }

    // =====================================================
    // FILTER SYSTEM MESSAGES
    // =====================================================

    _filterSystemMessage(text) {
        if (!text || typeof text !== 'string') return text;
        const systemPrefixes = [
            'Đã thêm nhãn tự động:',
            'Đã đặt giai đoạn',
            'Đã gỡ nhãn:',
            'Đã thêm nhãn:',
            'Đã chuyển sang giai đoạn',
            'Đã cập nhật đơn hàng',
            'Đã tạo đơn hàng',
            'Auto-assigned label:',
            'Changed stage to',
        ];
        for (const prefix of systemPrefixes) {
            if (text.startsWith(prefix)) return '';
        }
        return text;
    }

    // =====================================================
    // PENDING CUSTOMERS
    // =====================================================

    async fetchPendingFromServer() {
        try {
            const res = await fetch(InboxApiConfig.buildUrl.dataApi('pending-customers?limit=500'));
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data)) {
                for (const pending of data) {
                    // Find matching conversation and merge unread data
                    const conv = this.getConversationByPsid(pending.psid);
                    if (conv && pending.message_count > 0) {
                        if (conv.unread < pending.message_count) {
                            conv.unread = pending.message_count;
                            conv.seen = false;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[INBOX-DATA] fetchPendingFromServer error:', e);
        }
    }
}

window.InboxDataManager = InboxDataManager;
console.log('[INBOX-DATA] Loaded');
