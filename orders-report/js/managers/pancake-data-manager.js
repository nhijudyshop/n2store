/* =====================================================
   PANCAKE DATA MANAGER - Tab1 Orders
   Pancake API client adapted from inbox/js/inbox-pancake-api.js
   Uses shared pancakeTokenManager for JWT + page_access_token
   ===================================================== */

console.log('[PDM] Loading...');

// =====================================================
// CONFIG & URL BUILDERS
// =====================================================

// Use IIFE-scoped variable to avoid conflict with api-config.js const WORKER_URL
var _PDM_WORKER_URL = (window.API_CONFIG?.WORKER_URL) || 'https://chatomni-proxy.nhijudyshop.workers.dev';

var PancakeApiConfig = {
    WORKER_URL: _PDM_WORKER_URL,
    buildUrl: {
        // User API (pages.fm/api/v1) - needs access_token
        pancake(endpoint, params = '') {
            const base = `${_PDM_WORKER_URL}/api/pancake/${endpoint}`;
            return params ? `${base}?${params}` : base;
        },
        // Public API v1 (pages.fm/api/public_api/v1) - needs page_access_token
        pancakeOfficial(endpoint, pageAccessToken) {
            const base = `${_PDM_WORKER_URL}/api/pancake-official/${endpoint}`;
            return pageAccessToken ? `${base}?page_access_token=${pageAccessToken}` : base;
        },
        // Public API v2 (pages.fm/api/public_api/v2) - needs page_access_token
        pancakeOfficialV2(endpoint, pageAccessToken) {
            const base = `${_PDM_WORKER_URL}/api/pancake-official-v2/${endpoint}`;
            return pageAccessToken ? `${base}?page_access_token=${pageAccessToken}` : base;
        },
        // Data persistence API
        dataApi(path) {
            return `${_PDM_WORKER_URL}/api/realtime/${path}`;
        }
    }
};

// =====================================================
// REQUEST QUEUE (rate limiting for Pancake API)
// =====================================================

class PancakeRequestQueue {
    constructor({ maxConcurrent = 1, minInterval = 1500 } = {}) {
        this.maxConcurrent = maxConcurrent;
        this.minInterval = minInterval;
        this.queue = [];
        this.running = 0;
        this.lastRun = 0;
        this._bulkMode = false;
    }

    enqueue(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this._process();
        });
    }

    async _process() {
        if (this.running >= this.maxConcurrent || this.queue.length === 0) return;

        const now = Date.now();
        const elapsed = now - this.lastRun;
        if (elapsed < this.minInterval) {
            setTimeout(() => this._process(), this.minInterval - elapsed);
            return;
        }

        const { fn, resolve, reject } = this.queue.shift();
        this.running++;
        this.lastRun = Date.now();

        try {
            const result = await fn();
            resolve(result);
        } catch (err) {
            reject(err);
        } finally {
            this.running--;
            this._process();
        }
    }

    enableBulkMode(concurrent = 6, interval = 200) {
        this._savedMaxConcurrent = this.maxConcurrent;
        this._savedMinInterval = this.minInterval;
        this.maxConcurrent = concurrent;
        this.minInterval = interval;
        this._bulkMode = true;
        this._process();
    }

    disableBulkMode() {
        this.maxConcurrent = this._savedMaxConcurrent || 1;
        this.minInterval = this._savedMinInterval || 1500;
        this._bulkMode = false;
    }
}

// =====================================================
// PANCAKE DATA MANAGER
// =====================================================

class PancakeDataManager {
    constructor() {
        this.requestQueue = new PancakeRequestQueue({ maxConcurrent: 1, minInterval: 1500 });
        this.pages = [];
        this.pageIds = [];
        this._lastConvId = {};
        this.CACHE_DURATION = 5 * 60 * 1000;
        this.MSG_CACHE_DURATION = 2 * 60 * 1000;
        this._messagesCache = new Map();
        this._lastPageFetch = null;

        // Conversation maps (used by tab1-encoding.js, tab1-search.js)
        this.inboxMapByPSID = new Map();
        this.inboxMapByFBID = new Map();
        this.commentMapByPSID = new Map();
        this.commentMapByFBID = new Map();
        this.conversationsByOrderId = new Map();
    }

    // --- Token Manager shortcut ---
    get tm() {
        return window.pancakeTokenManager;
    }

    // --- Initialize (called from tab1-init.js) ---
    async initialize() {
        try {
            console.log('[PDM] Initializing...');
            if (!this.tm) {
                console.warn('[PDM] pancakeTokenManager not available');
                return false;
            }
            await this.fetchPages();
            console.log('[PDM] Initialized, pages:', this.pages.length);
            return true;
        } catch (e) {
            console.error('[PDM] Init error:', e);
            return false;
        }
    }

    // --- Fetch Pages ---
    async fetchPages(forceRefresh = false) {
        if (!forceRefresh && this.pages.length > 0 && this._lastPageFetch &&
            (Date.now() - this._lastPageFetch < this.CACHE_DURATION)) {
            return this.pages;
        }
        try {
            const token = await this.tm?.getToken();
            if (!token) throw new Error('No token');

            const url = PancakeApiConfig.buildUrl.pancake('pages', `access_token=${token}`);
            const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            if (data.success && data.categorized?.activated) {
                this.pages = data.categorized.activated.filter(p => !p.id.startsWith('igo_'));
                this.pageIds = this.pages.map(p => p.id);
                this._lastPageFetch = Date.now();
                // Extract page_access_tokens from pages response
                if (this.tm?.extractPageTokensFromPages) {
                    this.tm.extractPageTokensFromPages(this.pages);
                }
                console.log(`[PDM] Fetched ${this.pages.length} pages`);
                return this.pages;
            }
            return [];
        } catch (e) {
            console.error('[PDM] fetchPages error:', e);
            return [];
        }
    }

    // --- Get/Generate Page Access Token ---
    async getPageAccessToken(pageId) {
        if (!this.tm) return null;
        const cached = this.tm.getPageAccessToken?.(pageId);
        if (cached) return cached;
        return await this.tm.generatePageAccessToken?.(pageId) || null;
    }

    // --- Fetch Conversations (per-page via Public API v2) ---
    async fetchConversations(forceRefresh = false) {
        try {
            if (this.pageIds.length === 0) await this.fetchPages();
            if (this.pageIds.length === 0) return { conversations: [], error: null };

            const allConvs = [];
            const errors = [];

            for (const pageId of this.pageIds) {
                let pat = await this.getPageAccessToken(pageId);
                if (!pat) { errors.push({ pageId, code: 'NO_TOKEN' }); continue; }

                let retried = false;
                const fetchPage = async (token) => {
                    const url = PancakeApiConfig.buildUrl.pancakeOfficialV2(
                        `pages/${pageId}/conversations`, token
                    );
                    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                    if (!res.ok) throw { code: res.status };
                    const data = await res.json();
                    if (data.error_code) throw { code: data.error_code, message: data.message };
                    return data;
                };

                try {
                    let data;
                    try {
                        data = await fetchPage(pat);
                    } catch (err) {
                        if (!retried && (err.code === 105 || err.code === 100)) {
                            retried = true;
                            pat = await this.tm.generatePageAccessToken(pageId);
                            if (!pat) throw { code: 'REGEN_FAILED' };
                            data = await fetchPage(pat);
                        } else {
                            throw err;
                        }
                    }
                    if (data.conversations) {
                        allConvs.push(...data.conversations);
                        const convs = data.conversations;
                        if (convs.length > 0) {
                            this._lastConvId[pageId] = convs[convs.length - 1].id;
                        }
                        // Update maps
                        for (const conv of convs) {
                            const psid = conv.from?.id;
                            if (conv.type === 'INBOX') {
                                if (psid) this.inboxMapByPSID.set(String(psid), conv);
                                if (conv.from?.id) this.inboxMapByFBID.set(String(conv.from.id), conv);
                            } else {
                                if (psid) this.commentMapByPSID.set(String(psid), conv);
                                if (conv.from?.id) this.commentMapByFBID.set(String(conv.from.id), conv);
                            }
                        }
                    }
                } catch (e) {
                    errors.push({ pageId, code: e.code, message: e.message });
                }
            }

            return { conversations: allConvs, error: errors.length > 0 ? errors : null };
        } catch (e) {
            console.error('[PDM] fetchConversations error:', e);
            return { conversations: [], error: { code: 0, message: e.message } };
        }
    }

    // --- Fetch Conversations for single page ---
    async fetchConversationsForPage(pageId) {
        try {
            let pat = await this.getPageAccessToken(pageId);
            if (!pat) return { conversations: [], error: { code: 'NO_TOKEN' } };

            const url = PancakeApiConfig.buildUrl.pancakeOfficialV2(
                `pages/${pageId}/conversations`, pat
            ) + '&unread_first=true';

            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return { conversations: [], error: { code: res.status } };

            const data = await res.json();
            if (data.error_code) return { conversations: [], error: { code: data.error_code } };

            const convs = data.conversations || [];
            if (convs.length > 0) {
                this._lastConvId[pageId] = convs[convs.length - 1].id;
            }
            // Update maps
            for (const conv of convs) {
                const psid = conv.from?.id;
                if (conv.type === 'INBOX') {
                    if (psid) this.inboxMapByPSID.set(String(psid), conv);
                    if (conv.from?.id) this.inboxMapByFBID.set(String(conv.from.id), conv);
                } else {
                    if (psid) this.commentMapByPSID.set(String(psid), conv);
                    if (conv.from?.id) this.commentMapByFBID.set(String(conv.from.id), conv);
                }
            }
            return { conversations: convs, error: null };
        } catch (e) {
            return { conversations: [], error: { code: 0, message: e.message } };
        }
    }

    // --- Fetch Conversations by customer Facebook ID (for bill-service) ---
    async fetchConversationsByCustomerFbId(pageId, fbId) {
        try {
            // Search via conversation list, then filter by from.id
            const result = await this.fetchConversationsForPage(pageId);
            const convs = (result.conversations || []).filter(c =>
                String(c.from?.id) === String(fbId)
            );
            return { conversations: convs };
        } catch (e) {
            return { conversations: [] };
        }
    }

    // --- Fetch More Conversations (cursor pagination) ---
    async fetchMoreConversations(pageId) {
        try {
            const cursor = this._lastConvId[pageId];
            if (!cursor) return [];

            let pat = await this.getPageAccessToken(pageId);
            if (!pat) return [];

            const url = PancakeApiConfig.buildUrl.pancakeOfficialV2(
                `pages/${pageId}/conversations`, pat
            ) + `&last_conversation_id=${cursor}&unread_first=true`;

            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return [];
            const data = await res.json();
            if (data.conversations?.length > 0) {
                this._lastConvId[pageId] = data.conversations[data.conversations.length - 1].id;
                return data.conversations;
            }
            return [];
        } catch (e) {
            console.error(`[PDM] fetchMore page ${pageId}:`, e.message);
            return [];
        }
    }

    // --- Fetch Messages (Public API v1) ---
    async fetchMessages(pageId, conversationId, currentCount = null, customerId = null, forceRefresh = false) {
        const cacheKey = `${pageId}_${conversationId}`;
        if (!forceRefresh && currentCount === null) {
            const cached = this._messagesCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.MSG_CACHE_DURATION) {
                return { ...cached, fromCache: true };
            }
        }
        try {
            let pat = await this.getPageAccessToken(pageId);
            if (!pat) throw new Error('No page_access_token');

            const doFetch = async (token) => {
                const endpoint = `pages/${pageId}/conversations/${conversationId}/messages`;
                let url = PancakeApiConfig.buildUrl.pancakeOfficial(endpoint, token);
                if (customerId) url += `&customer_id=${customerId}`;
                if (currentCount !== null) url += `&current_count=${currentCount}`;
                const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            };

            let data;
            try {
                data = await doFetch(pat);
            } catch (e) {
                // Retry with fresh PAT
                pat = await this.tm.generatePageAccessToken(pageId);
                if (!pat) throw new Error('No PAT after regen');
                data = await doFetch(pat);
            }

            // Token error → regenerate and retry
            if (data.error_code === 105 || data.error_code === 100) {
                pat = await this.tm.generatePageAccessToken(pageId);
                if (pat) data = await doFetch(pat);
            }

            const result = {
                messages: data.messages || [],
                conversation: data.conversation || null,
                customers: data.customers || data.conv_customers || [],
                customerId: (data.customers || data.conv_customers || [])[0]?.id || null,
                post: data.post || null,
                activities: data.activities || [],
                reports_by_phone: data.reports_by_phone || {},
                comment_count: data.comment_count || 0,
                recent_phone_numbers: data.recent_phone_numbers || [],
                conv_phone_numbers: data.conv_phone_numbers || [],
                notes: data.notes || [],
                timestamp: Date.now()
            };

            if (currentCount === null) {
                this._messagesCache.set(cacheKey, result);
            }
            return { ...result, fromCache: false };
        } catch (e) {
            console.error('[PDM] fetchMessages error:', e);
            return {
                messages: [], conversation: null, customers: [], customerId: null,
                post: null, activities: [], reports_by_phone: {}, comment_count: 0,
                recent_phone_numbers: [], conv_phone_numbers: [], notes: [], fromCache: false
            };
        }
    }

    // Alias for compatibility
    fetchMessagesForConversation(pageId, convId, currentCount, customerId) {
        return this.fetchMessages(pageId, convId, currentCount, customerId);
    }

    clearMessagesCache(pageId, conversationId) {
        this._messagesCache.delete(`${pageId}_${conversationId}`);
    }

    // --- Send Message (Public API v1) ---
    async sendMessage(pageId, conversationId, payload, pageAccessToken = null) {
        try {
            if (!pageAccessToken) pageAccessToken = await this.getPageAccessToken(pageId);
            if (!pageAccessToken) throw new Error('No page_access_token');

            const url = PancakeApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/messages`,
                pageAccessToken
            );
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload)
            });
            const text = await res.text();
            let data;
            try { data = JSON.parse(text); } catch (e) { data = { success: false, raw: text }; }
            return data;
        } catch (e) {
            console.error('[PDM] sendMessage error:', e);
            return { success: false, error: e.message };
        }
    }

    // --- Upload Media (Public API v1 - upload_contents) ---
    async uploadMedia(pageId, file, pageAccessToken = null) {
        try {
            if (!pageAccessToken) pageAccessToken = await this.getPageAccessToken(pageId);
            if (!pageAccessToken) throw new Error('No page_access_token');

            const formData = new FormData();
            formData.append('file', file);

            const url = PancakeApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/upload_contents`, pageAccessToken
            );
            const res = await fetch(url, { method: 'POST', body: formData });
            return await res.json();
        } catch (e) {
            console.error('[PDM] uploadMedia error:', e);
            return { success: false, error: e.message };
        }
    }

    // Alias for compatibility (tab1-fast-sale, bill-service, quick-reply)
    async uploadImage(pageId, file) {
        return this.uploadMedia(pageId, file);
    }

    // --- Mark Read/Unread ---
    async markAsRead(pageId, conversationId) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return false;
            const url = PancakeApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/read`, pat
            );
            await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            return true;
        } catch (e) { return false; }
    }

    markConversationAsRead(pageId, convId) {
        return this.markAsRead(pageId, convId);
    }

    async markAsUnread(pageId, conversationId) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return false;
            const url = PancakeApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/unread`, pat
            );
            await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            return true;
        } catch (e) { return false; }
    }

    // --- Comment Actions ---
    async likeComment(pageId, commentId) {
        return this._commentAction(`pages/${pageId}/comments/${commentId}/likes`, 'POST', pageId);
    }

    async unlikeComment(pageId, commentId) {
        return this._commentAction(`pages/${pageId}/comments/${commentId}/likes`, 'DELETE', pageId);
    }

    async hideComment(pageId, commentId) {
        return this._commentAction(`pages/${pageId}/comments/${commentId}/hide`, 'POST', pageId);
    }

    async unhideComment(pageId, commentId) {
        return this._commentAction(`pages/${pageId}/comments/${commentId}/hide`, 'DELETE', pageId);
    }

    async deleteComment(pageId, commentId) {
        return this._commentAction(`pages/${pageId}/comments/${commentId}`, 'DELETE', pageId);
    }

    async sendReaction(pageId, commentId, reactionType) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return { success: false };
            const url = PancakeApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/comments/${commentId}/reactions`, pat
            );
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: reactionType })
            });
            return await res.json();
        } catch (e) { return { success: false }; }
    }

    async _commentAction(endpoint, method, pageId) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return { success: false };
            const url = PancakeApiConfig.buildUrl.pancakeOfficial(endpoint, pat);
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' } });
            return await res.json();
        } catch (e) { return { success: false }; }
    }

    // --- Fetch Tags ---
    async fetchTags(pageId) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return [];
            const url = PancakeApiConfig.buildUrl.pancakeOfficial(`pages/${pageId}/tags`, pat);
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return [];
            const data = await res.json();
            return data.tags || data.data || [];
        } catch (e) { return []; }
    }

    // --- Update Conversation Tags ---
    async updateConversationTags(pageId, conversationId, action, tagId) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return { success: false };
            const url = PancakeApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/tags`, pat
            );
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, tag_id: tagId })
            });
            return await res.json();
        } catch (e) { return { success: false }; }
    }

    // --- Search Conversations ---
    async searchConversations(query) {
        try {
            if (!query) return { conversations: [] };
            const token = await this.tm?.getToken();
            if (!token) return { conversations: [] };

            const ids = this.pageIds.filter(id => !id.startsWith('igo_'));
            if (ids.length === 0) return { conversations: [] };

            const encoded = encodeURIComponent(query);
            const qs = `q=${encoded}&access_token=${token}&cursor_mode=true`;
            const url = PancakeApiConfig.buildUrl.pancake('conversations/search', qs);
            const formData = new FormData();
            formData.append('page_ids', ids.join(','));

            const res = await fetch(url, { method: 'POST', body: formData });
            if (!res.ok) return { conversations: [] };
            const data = await res.json();
            if (data.error_code || !data.success) return { conversations: [] };
            return { conversations: data.conversations || [] };
        } catch (e) {
            console.error('[PDM] search error:', e);
            return { conversations: [] };
        }
    }

    // --- Fetch Unread Count ---
    async fetchPagesUnreadCount() {
        try {
            const token = await this.tm?.getToken();
            if (!token) return [];
            const url = PancakeApiConfig.buildUrl.pancake('pages/unread_conv_pages_count', `access_token=${token}`);
            const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
            if (!res.ok) return [];
            const data = await res.json();
            return (data.success && data.data) ? data.data : [];
        } catch (e) { return []; }
    }

    // --- Unread info for orders (used by tab1-search.js) ---
    getMessageUnreadInfoForOrder(order) {
        if (!order) return null;
        const psid = order.PSID || order.psid;
        if (!psid) return null;
        const conv = this.inboxMapByPSID.get(String(psid));
        if (!conv) return null;
        return { unread: !conv.seen, convId: conv.id };
    }

    getCommentUnreadInfoForOrder(order) {
        if (!order) return null;
        const psid = order.PSID || order.psid;
        if (!psid) return null;
        const conv = this.commentMapByPSID.get(String(psid));
        if (!conv) return null;
        return { unread: !conv.seen, convId: conv.id };
    }

    // --- Avatar URL ---
    getAvatarUrl(fbId, pageId = null) {
        if (!fbId) return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23e5e7eb"/><circle cx="20" cy="15" r="7" fill="%239ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="%239ca3af"/></svg>';
        let url = `${WORKER_URL}/api/fb-avatar?id=${fbId}`;
        if (pageId) url += `&page=${pageId}`;
        return url;
    }

    // --- Queued fetch (for rate-limited operations) ---
    queuedFetch(url, options) {
        return this.requestQueue.enqueue(() => fetch(url, options));
    }
}

// =====================================================
// GLOBAL INSTANCE
// =====================================================

window.pancakeDataManager = new PancakeDataManager();
window.PancakeApiConfig = PancakeApiConfig;
window.PancakeRequestQueue = PancakeRequestQueue;

// Backwards compatibility
window.chatDataManager = window.pancakeDataManager;

console.log('[PDM] Loaded.');
