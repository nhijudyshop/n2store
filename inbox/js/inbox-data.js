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
        this.livestreamPostMap = {};    // { post_id: [{ conv_id, name, ... }] } from server
        this.livestreamPostNames = {};  // { post_id: "post name text" } from server
        this.livestreamConvIdSet = new Set(); // derived from livestreamPostMap for O(1) lookup
        this.labelMap = {};       // convId -> labelId (saved to localStorage)
        this.isInitialized = false;

        // Conversation maps for O(1) lookup (like tpos-pancake)
        this.conversationMap = new Map();           // id -> conversation
        this.conversationByPsidMap = new Map();     // psid -> conversation
        this.conversationByCustomerIdMap = new Map(); // customerId -> conversation
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

            // Sync labels from server (cross-device)
            this.syncLabelsFromServer();

            this.recalculateGroupCounts();
            this.buildMaps();
            this.isInitialized = true;
            console.log('[InboxData] Initialization complete');

            // Fetch livestream conversations from server (single source of truth)
            this.fetchLivestreamFromServer();
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
            console.log(`[InboxData] Loaded local state: labels`);
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

        const token = await ptm.getToken();
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
                // Use pancakeDirect route: sends JWT as cookie + page-specific Referer
                // (generic /api/pancake/ route has no JWT cookie → error 102)
                const baseUrl = API_CONFIG.buildUrl.pancakeDirect(`pages/${pageId}/conversations`, pageId, token, token);
                const extraParams = `&unread_first=true&mode=OR&tags="ALL"&except_tags=[]&cursor_mode=true&from_platform=web`;
                const url = baseUrl + extraParams;

                console.log(`[InboxData] Fetching page ${pageId} via pancake-direct...`);
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
                // Ensure page_id is set on every conversation (per-page API may omit it)
                for (const c of convs) {
                    if (!c.page_id) c.page_id = pageId;
                }
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

            // If multi-page fails with permission error, try per-page with current account first
            // (account may have access to SOME pages, just not all)
            if (error === 105) {
                console.log(`[InboxData] Error 105 (no permission on some pages), trying per-page with current account...`);
                rawConversations = await this.fetchConversationsPerPage();

                // If current account per-page also fails, try other accounts
                if (rawConversations.length === 0) {
                    console.log('[InboxData] Current account per-page failed, trying other accounts...');
                    rawConversations = await this.tryOtherAccounts();
                    if (rawConversations.length === 0) {
                        rawConversations = await this.tryOtherAccountsPerPage();
                    }
                }
            } else if (error === 122) {
                // Subscription expired - try other accounts (multi-page first, then per-page)
                console.log(`[InboxData] Error 122 (subscription expired), trying other accounts...`);
                rawConversations = await this.tryOtherAccounts();

                if (rawConversations.length === 0) {
                    console.log('[InboxData] All accounts failed multi-page, trying per-page...');
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
            this.buildMaps();
            return this.conversations;
        } catch (error) {
            console.error('[InboxData] Error loading conversations:', error);
            return [];
        }
    }

    /**
     * Load more conversations (pagination) using last conversation ID
     */
    async loadMoreConversations() {
        try {
            const pdm = window.pancakeDataManager;
            if (!pdm || !pdm.fetchMoreConversations) return [];

            console.log('[InboxData] Loading more conversations...');

            // fetchMoreConversations uses pages_with_current_count internally for cursor
            const moreRaw = await pdm.fetchMoreConversations();
            if (!moreRaw || moreRaw.length === 0) return [];

            const moreMapped = moreRaw.map(conv => this.mapConversation(conv));

            // Deduplicate
            const existingIds = new Set(this.conversations.map(c => c.id));
            const newConvs = moreMapped.filter(c => !existingIds.has(c.id));

            this.conversations.push(...newConvs);
            this.recalculateGroupCounts();
            this.buildMaps();

            console.log(`[InboxData] Loaded ${newConvs.length} more conversations (total: ${this.conversations.length})`);
            return newConvs;
        } catch (error) {
            console.error('[InboxData] Error loading more conversations:', error);
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
            time: this.parseTimestamp(conv.updated_at || conv.last_message?.inserted_at) || new Date(),
            unread: conv.unread_count || 0,
            online: false,
            phone: '',
            labels: this.getLabelArray(conv.id),
            isLivestream: this.livestreamConvIdSet.has(conv.id),
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
     * Parse timestamp from Pancake API - handles UTC timestamps without timezone suffix
     */
    parseTimestamp(timestamp) {
        if (!timestamp) return null;
        try {
            let date;
            if (typeof timestamp === 'string') {
                if (!timestamp.includes('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
                    date = new Date(timestamp + 'Z');
                } else {
                    date = new Date(timestamp);
                }
            } else if (typeof timestamp === 'number') {
                date = timestamp > 9999999999 ? new Date(timestamp) : new Date(timestamp * 1000);
            } else {
                date = new Date(timestamp);
            }
            return isNaN(date.getTime()) ? null : date;
        } catch (e) {
            return null;
        }
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
            const labels = conv.labels || ['new'];
            for (const labelId of labels) {
                const group = this.groups.find(g => g.id === labelId);
                if (group) group.count++;
            }
        });
    }

    getConversations({ search = '', filter = 'all', groupFilters = null } = {}) {
        let result = [...this.conversations];

        if (filter === 'unread') {
            result = result.filter(c => c.unread > 0);
        } else if (filter === 'livestream') {
            result = result.filter(c => c.isLivestream);
        } else if (filter === 'inbox_my') {
            result = result.filter(c => !c.isLivestream);
        }

        if (groupFilters && groupFilters.size > 0) {
            result = result.filter(c => {
                const labels = c.labels || ['new'];
                return labels.some(l => groupFilters.has(l));
            });
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

    /**
     * Build O(1) lookup maps (like tpos-pancake buildConversationMap)
     */
    buildMaps() {
        this.conversationMap.clear();
        this.conversationByPsidMap.clear();
        this.conversationByCustomerIdMap.clear();
        for (const conv of this.conversations) {
            this.conversationMap.set(conv.id, conv);
            if (conv.psid) this.conversationByPsidMap.set(conv.psid, conv);
            if (conv.customerId) this.conversationByCustomerIdMap.set(conv.customerId, conv);
        }
    }

    getConversation(id) {
        return this.conversationMap.get(id) || this.conversations.find(c => c.id === id);
    }

    getConversationByPsid(psid) {
        return this.conversationByPsidMap.get(psid) || null;
    }

    /**
     * Check Facebook 24h messaging window (like tpos-pancake check24HourWindow)
     */
    check24hWindow(convId) {
        const conv = this.getConversation(convId);
        if (!conv) return { isOpen: true, hoursRemaining: null };

        // Find last customer message time from stored messages or raw data
        let lastCustomerTime = null;

        // Check stored messages first
        if (conv.messages && conv.messages.length > 0) {
            for (let i = conv.messages.length - 1; i >= 0; i--) {
                if (conv.messages[i].sender === 'customer') {
                    lastCustomerTime = conv.messages[i].time;
                    break;
                }
            }
        }

        // Fallback to conversation updated_at
        if (!lastCustomerTime) {
            lastCustomerTime = conv.time || conv._raw?.updated_at;
        }

        if (!lastCustomerTime) return { isOpen: true, hoursRemaining: null };

        const lastTime = new Date(lastCustomerTime).getTime();
        const elapsed = Date.now() - lastTime;
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        const remaining = TWENTY_FOUR_HOURS - elapsed;

        return {
            isOpen: remaining > 0,
            hoursRemaining: remaining > 0 ? Math.ceil(remaining / (60 * 60 * 1000)) : 0,
        };
    }

    /**
     * Get labels array for a conversation (backward-compatible with old string format)
     */
    getLabelArray(convId) {
        const val = this.labelMap[convId];
        if (!val) return ['new'];
        if (Array.isArray(val)) return val;
        return [val]; // old string format → convert to array
    }

    /**
     * Toggle a label on a conversation (multi-select)
     * "done" is exclusive — clears all others when selected
     */
    toggleConversationLabel(convId, labelId) {
        const conv = this.getConversation(convId);
        if (!conv) return;

        let labels = [...(conv.labels || ['new'])];

        if (labelId === 'done') {
            // "Hoàn Tất" is exclusive — set only this
            labels = ['done'];
        } else {
            // Remove 'done' if selecting another label
            labels = labels.filter(l => l !== 'done');

            if (labels.includes(labelId)) {
                labels = labels.filter(l => l !== labelId);
            } else {
                labels.push(labelId);
            }

            // If empty, default to 'new'
            if (labels.length === 0) labels = ['new'];
            // Remove 'new' if selecting specific labels
            if (labels.length > 1) labels = labels.filter(l => l !== 'new');
        }

        conv.labels = labels;
        this.labelMap[convId] = labels;
        this.recalculateGroupCounts();
        this.save();

        // Save to server for cross-device sync
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        fetch(`${workerUrl}/api/realtime/conversation-label`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ convId, label: JSON.stringify(labels) })
        }).catch(err => console.warn('[InboxData] Failed to save label to server:', err.message));
    }

    async syncLabelsFromServer() {
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        try {
            const response = await fetch(`${workerUrl}/api/realtime/conversation-labels`);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.labelMap) {
                    let updated = 0;
                    for (const [convId, label] of Object.entries(data.labelMap)) {
                        // Parse label (could be JSON array or old string)
                        let parsed;
                        try { parsed = JSON.parse(label); } catch { parsed = [label]; }
                        if (!Array.isArray(parsed)) parsed = [parsed];

                        const current = JSON.stringify(this.labelMap[convId]);
                        if (current !== JSON.stringify(parsed)) {
                            this.labelMap[convId] = parsed;
                            const conv = this.getConversation(convId);
                            if (conv) conv.labels = parsed;
                            updated++;
                        }
                    }
                    if (updated > 0) {
                        this.saveLocalState();
                        this.recalculateGroupCounts();
                        if (window.inboxChat) {
                            window.inboxChat.renderConversationList();
                            window.inboxChat.renderGroupStats();
                        }
                        console.log(`[InboxData] Synced ${updated} labels from server`);
                    }
                }
            }
        } catch (err) {
            console.warn('[InboxData] Failed to sync labels from server:', err.message);
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
            // Also mark as replied on Render DB (removes from pending_customers)
            if (conv.psid && conv.pageId) {
                this.markRepliedOnServer(conv.psid, conv.pageId);
            }
        }
    }

    markAsUnread(convId) {
        const conv = this.getConversation(convId);
        if (conv) {
            conv.unread = Math.max(conv.unread || 0, 1);
            // Mark as unread on Pancake API
            if (conv.pageId && window.pancakeDataManager) {
                const pdm = window.pancakeDataManager;
                pdm.getOrGeneratePageAccessToken
                    ? window.pancakeTokenManager.getOrGeneratePageAccessToken(conv.pageId).then(token => {
                        if (!token) return;
                        const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                            `pages/${conv.pageId}/conversations/${convId}/unread`, token
                        );
                        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
                            .then(r => { if (r.ok) console.log('[InboxData] Marked as unread:', convId); })
                            .catch(err => console.warn('[InboxData] Error marking as unread:', err));
                    })
                    : null;
            }
        }
    }

    /**
     * Mark customer as replied on Render DB (remove from pending_customers)
     */
    markRepliedOnServer(psid, pageId) {
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        fetch(`${workerUrl}/api/realtime/mark-replied`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ psid, pageId })
        }).catch(err => console.warn('[InboxData] Error marking replied:', err.message));
    }

    /**
     * Fetch pending customers from Render DB and merge unread data
     */
    async fetchPendingFromServer() {
        try {
            const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
            const response = await fetch(`${workerUrl}/api/realtime/pending-customers?limit=500`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data.success || !data.customers) return;

            console.log(`[InboxData] Render DB has ${data.customers.length} pending customers`);

            let changed = false;
            for (const pending of data.customers) {
                // Try to find matching conversation by psid
                const conv = this.conversationByPsidMap.get(pending.psid);
                if (conv && conv.pageId === pending.page_id) {
                    // Update unread count if server has newer data
                    if (pending.message_count > 0 && conv.unread === 0) {
                        conv.unread = pending.message_count;
                        changed = true;
                    }
                }
            }

            if (changed) {
                this.recalculateGroupCounts();
                if (window.inboxChat) window.inboxChat.renderConversationList();
                console.log('[InboxData] Updated unread counts from Render pending_customers');
            }
        } catch (error) {
            console.warn('[InboxData] Error fetching pending customers:', error.message);
        }
    }


    /**
     * Fetch livestream conversations from server (single source of truth)
     * Returns { post_id: [{ conv_id, name, ... }] }
     */
    async fetchLivestreamFromServer() {
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';

        try {
            const response = await fetch(`${workerUrl}/api/realtime/livestream-conversations`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            this.livestreamPostMap = data.posts || {};
            this.livestreamPostNames = data.postNames || {};

            // Build conv_id Set for fast lookup
            this.livestreamConvIdSet = new Set();
            for (const convs of Object.values(this.livestreamPostMap)) {
                for (const c of convs) this.livestreamConvIdSet.add(c.conv_id);
            }

            // Mark existing conversations + add virtual entries for server-only ones
            const existingIds = new Set(this.conversations.map(c => c.id));
            for (const conv of this.conversations) {
                conv.isLivestream = this.livestreamConvIdSet.has(conv.id);
            }

            // Create virtual conversation entries for conv_ids in server but not in Pancake response
            let virtualCount = 0;
            for (const [postId, convs] of Object.entries(this.livestreamPostMap)) {
                for (const sc of convs) {
                    if (!existingIds.has(sc.conv_id)) {
                        const virtual = {
                            id: sc.conv_id,
                            name: sc.name || 'Khách hàng',
                            avatar: sc.avatar || null,
                            lastMessage: sc.last_message || '',
                            time: sc.conv_time ? new Date(sc.conv_time) : new Date(sc.updated_at || 0),
                            unread: 0,
                            online: false,
                            phone: '',
                            labels: sc.label ? (sc.label.startsWith('[') ? JSON.parse(sc.label) : [sc.label]) : ['new'],
                            isLivestream: true,
                            type: sc.type || 'COMMENT',
                            pageId: sc.page_id || '',
                            pageName: sc.page_name || '',
                            psid: sc.psid || '',
                            customerId: sc.customer_id || null,
                            conversationId: sc.conv_id,
                            messages: [],
                            _raw: { post_id: postId },
                            _virtual: true, // flag for server-only entries
                        };
                        this.conversations.push(virtual);
                        existingIds.add(sc.conv_id);
                        virtualCount++;
                    }
                }
            }

            if (virtualCount > 0) this.buildMaps();
            this.recalculateGroupCounts();
            if (window.inboxChat) window.inboxChat.renderConversationList();
            console.log(`[InboxData] Livestream from server: ${this.livestreamConvIdSet.size} convs (${virtualCount} virtual) across ${Object.keys(this.livestreamPostMap).length} posts`);
        } catch (error) {
            console.warn('[InboxData] Failed to fetch livestream from server:', error.message);
        }
    }

    /**
     * Mark a conversation as livestream — save to server + update local
     */
    markAsLivestream(convId, postId) {
        const conv = this.getConversation(convId);
        if (!conv) return;

        conv.isLivestream = true;
        this.livestreamConvIdSet.add(convId);

        // Add to local postMap
        const pid = postId || conv._raw?.post_id || 'unknown';
        if (!this.livestreamPostMap[pid]) this.livestreamPostMap[pid] = [];
        if (!this.livestreamPostMap[pid].find(c => c.conv_id === convId)) {
            this.livestreamPostMap[pid].push({ conv_id: convId, name: conv.name, type: conv.type, psid: conv.psid });
        }

        // Also mark this customer's INBOX conversations
        if (conv.psid) {
            for (const inboxConv of this.conversations) {
                if (inboxConv.psid === conv.psid && inboxConv.type === 'INBOX' && !inboxConv.isLivestream) {
                    inboxConv.isLivestream = true;
                    this.livestreamConvIdSet.add(inboxConv.id);
                    this._saveLivestreamConvToServer(inboxConv.id, pid, inboxConv);
                }
            }
        }

        // Save to server
        this._saveLivestreamConvToServer(convId, pid, conv);
    }

    /**
     * Save a single livestream conversation to server
     */
    _saveLivestreamConvToServer(convId, postId, conv) {
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        fetch(`${workerUrl}/api/realtime/livestream-conversation`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                convId,
                postId,
                postName: conv._messagesData?.post?.message || conv._raw?.post?.message || this.livestreamPostNames[postId] || null,
                name: conv.name,
                avatar: conv.avatar,
                lastMessage: conv.lastMessage,
                convTime: conv.time?.toISOString?.() || null,
                type: conv.type,
                pageId: conv.pageId,
                pageName: conv.pageName,
                psid: conv.psid,
                customerId: conv.customerId
            })
        }).catch(err => console.warn('[InboxData] Failed to save livestream conv to server:', err.message));
    }

    /**
     * Mark customer as livestream participant → mark ALL their conversations as livestream
     */
    markCustomerAsLivestream(customerPsid, _pageId, _customerName, postId) {
        if (!customerPsid) return;
        const pid = postId || 'unknown';

        // Find all conversations for this customer and mark as livestream
        for (const conv of this.conversations) {
            if (conv.psid === customerPsid && !conv.isLivestream) {
                conv.isLivestream = true;
                this.livestreamConvIdSet.add(conv.id);
                this._saveLivestreamConvToServer(conv.id, pid, conv);
            }
        }
    }

    /**
     * Unmark a conversation as livestream (local only — server uses DELETE by post)
     */
    unmarkAsLivestream(convId) {
        this.livestreamConvIdSet.delete(convId);
        const conv = this.getConversation(convId);
        if (conv) conv.isLivestream = false;
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
