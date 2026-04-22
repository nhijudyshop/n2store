// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   PANCAKE DATA MANAGER - Tab1 Orders
   Pancake API client adapted from inbox/js/inbox-pancake-api.js
   Uses shared pancakeTokenManager for JWT + page_access_token
   ===================================================== */

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
        // Pages with expired subscription (error 122) — skip in multi-page queries
        this._expiredPageIds = new Set();

        // Conversation maps (used by tab1-encoding.js, tab1-search.js)
        this.inboxMapByPSID = new Map();
        this.inboxMapByFBID = new Map();
        this.commentMapByPSID = new Map();
        this.commentMapByFBID = new Map();
        this.conversationsByOrderId = new Map();
    }

    // v1 API Referer header (required by some endpoints)
    get _v1Headers() {
        return { 'Accept': 'application/json', 'Referer': 'https://pancake.vn/multi_pages' };
    }

    // Searchable page IDs (excludes expired subscriptions + Instagram)
    get _searchablePageIds() {
        return this.pageIds.filter(id => !this._expiredPageIds.has(id) && !id.startsWith('igo_'));
    }

    // --- Token Manager shortcut ---
    get tm() {
        return window.pancakeTokenManager;
    }

    // --- Initialize (called from tab1-init.js) ---
    async initialize() {
        try {
            if (!this.tm) {
                console.warn('[PDM] pancakeTokenManager not available');
                return false;
            }
            await this.fetchPages();
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
            const _fetch = window.fetchWithTimeout || fetch;
            const res = await _fetch(url, { headers: this._v1Headers }, 10000);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            let data = await res.json();

            // Token error → retry with fresh token
            if (data.error_code === 105 || data.error_code === 100) {
                const newToken = await this.tm?.getToken?.(true);
                if (newToken) {
                    const url2 = PancakeApiConfig.buildUrl.pancake('pages', `access_token=${newToken}`);
                    const res2 = await _fetch(url2, { headers: this._v1Headers }, 10000);
                    if (res2.ok) data = await res2.json();
                }
            }

            if (data.success && data.categorized?.activated) {
                this.pages = data.categorized.activated.filter(p => !p.id.startsWith('igo_'));
                this.pageIds = this.pages.map(p => p.id);
                this._lastPageFetch = Date.now();
                // Extract page_access_tokens from pages response
                if (this.tm?.extractPageTokensFromPages) {
                    this.tm.extractPageTokensFromPages(this.pages);
                }
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
                const _fetch = window.fetchWithTimeout || fetch;
                const fetchPage = async (token) => {
                    const url = PancakeApiConfig.buildUrl.pancakeOfficialV2(
                        `pages/${pageId}/conversations`, token
                    );
                    const res = await _fetch(url, { headers: { 'Accept': 'application/json' } }, 10000);
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
    async fetchConversationsForPage(pageId, opts = {}) {
        try {
            let pat = await this.getPageAccessToken(pageId);
            if (!pat) return { conversations: [], error: { code: 'NO_TOKEN' } };

            const url = PancakeApiConfig.buildUrl.pancakeOfficialV2(
                `pages/${pageId}/conversations`, pat
            ) + '&unread_first=true';

            const _fetch = window.fetchWithTimeout || fetch;
            const res = await _fetch(url, { headers: { 'Accept': 'application/json' }, signal: opts.signal }, 10000);
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

    // --- Search Conversations on a specific page by customer name ---
    // Uses Public API v2: GET /pages/{pageId}/conversations?search={name}
    // Returns matching conversations on this page (up to 60)
    async searchConversationsOnPage(pageId, query, opts = {}) {
        try {
            if (!query || !pageId) return { conversations: [] };
            let pat = await this.getPageAccessToken(pageId);
            if (!pat) return { conversations: [] };

            const url = PancakeApiConfig.buildUrl.pancakeOfficialV2(
                `pages/${pageId}/conversations`, pat
            ) + `&search=${encodeURIComponent(query)}`;

            const _fetch = window.fetchWithTimeout || fetch;
            const res = await _fetch(url, { headers: { 'Accept': 'application/json' }, signal: opts.signal }, 10000);
            if (!res.ok) return { conversations: [] };
            const data = await res.json();
            return { conversations: data.conversations || [] };
        } catch (e) {
            console.error('[PDM] searchConversationsOnPage error:', e);
            return { conversations: [] };
        }
    }

    // --- Fetch Conversations by customer fb_id (page-scoped) ---
    // Uses Pancake API v1: GET /api/v1/pages/{pageId}/customers/{fbId}/conversations
    // NOTE: fbId here is page-scoped (= PSID for INBOX). Different on each page.
    async fetchConversationsByCustomerFbId(pageId, fbId, opts = {}) {
        try {
            if (!fbId) return { conversations: [] };
            const token = await this.tm?.getToken();
            if (!token) return { conversations: [] };

            const url = PancakeApiConfig.buildUrl.pancake(
                `pages/${pageId}/customers/${fbId}/conversations`,
                `access_token=${token}`
            );
            const _fetch = window.fetchWithTimeout || fetch;
            const res = await _fetch(url, { headers: this._v1Headers, signal: opts.signal }, 8000);
            if (!res.ok) return { conversations: [] };
            const data = await res.json();
            const convs = data.conversations || [];

            // Update maps with results
            for (const conv of convs) {
                const psid = conv.from_psid || conv.from?.id || conv.from_id;
                if (conv.type === 'INBOX') {
                    if (psid) this.inboxMapByPSID.set(String(psid), conv);
                    if (conv.from?.id) this.inboxMapByFBID.set(String(conv.from.id), conv);
                } else {
                    if (psid) this.commentMapByPSID.set(String(psid), conv);
                    if (conv.from?.id) this.commentMapByFBID.set(String(conv.from.id), conv);
                }
            }

            return { conversations: convs, pagesWithCount: data.pages_with_current_count || {} };
        } catch (e) {
            if (e?.name === 'AbortError') throw e; // propagate cancellation upstream
            console.error('[PDM] fetchConversationsByCustomerFbId error:', e);
            return { conversations: [] };
        }
    }

    // --- Fetch Conversations by customer ID across ALL pages ---
    // Uses Pancake API: GET /api/v1/conversations/customer/{fbId}?pages[id1]=0&pages[id2]=0
    async fetchConversationsByCustomerIdMultiPage(fbId, opts = {}) {
        try {
            if (!fbId) return { conversations: [] };
            const token = await this.tm?.getToken();
            if (!token) return { conversations: [] };

            if (this.pageIds.length === 0) await this.fetchPages();

            // Build pages params excluding expired subscriptions
            const ids = this._searchablePageIds;
            if (ids.length === 0) return { conversations: [] };
            const pagesParams = ids.map(id => `pages[${id}]=0`).join('&');
            const url = PancakeApiConfig.buildUrl.pancake(
                `conversations/customer/${fbId}`,
                `${pagesParams}&access_token=${token}`
            );
            const _fetch = window.fetchWithTimeout || fetch;
            const res = await _fetch(url, { headers: this._v1Headers, signal: opts.signal }, 10000);
            if (!res.ok) return { conversations: [] };
            const data = await res.json();

            // Error 122 = subscription expired for a page
            if (data.error_code === 122) {
                console.warn('[PDM] Subscription expired in multi-page search, page excluded');
                return { conversations: [] };
            }
            const convs = data.conversations || [];

            // Update maps
            for (const conv of convs) {
                const psid = conv.from_psid || conv.from?.id || conv.from_id;
                if (conv.type === 'INBOX') {
                    if (psid) this.inboxMapByPSID.set(String(psid), conv);
                    if (conv.from?.id) this.inboxMapByFBID.set(String(conv.from.id), conv);
                } else {
                    if (psid) this.commentMapByPSID.set(String(psid), conv);
                    if (conv.from?.id) this.commentMapByFBID.set(String(conv.from.id), conv);
                }
            }

            return { conversations: convs, pagesWithCount: data.pages_with_current_count || {} };
        } catch (e) {
            if (e?.name === 'AbortError') throw e;
            console.error('[PDM] fetchConversationsByCustomerIdMultiPage error:', e);
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

            const _fetch = window.fetchWithTimeout || fetch;
            const res = await _fetch(url, { headers: { 'Accept': 'application/json' } }, 10000);
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
    // opts: { signal, throwOnError } — throwOnError defaults to false (legacy) but chat-core passes true
    async fetchMessages(pageId, conversationId, currentCount = null, customerId = null, forceRefresh = false, opts = {}) {
        const cacheKey = `${pageId}_${conversationId}`;
        if (!forceRefresh && currentCount === null) {
            const cached = this._messagesCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.MSG_CACHE_DURATION) {
                return { ...cached, fromCache: true };
            }
        }
        try {
            let pat = await this.getPageAccessToken(pageId);
            if (!pat) {
                const err = new Error('No page_access_token');
                err.code = 'PAT_FAILED';
                throw err;
            }

            const _fetch = window.fetchWithTimeout || fetch;
            const doFetch = async (token) => {
                const endpoint = `pages/${pageId}/conversations/${conversationId}/messages`;
                let url = PancakeApiConfig.buildUrl.pancakeOfficial(endpoint, token);
                // Note: Public API v1 does NOT need customer_id (only v1 internal does)
                if (currentCount !== null) url += `&current_count=${currentCount}`;
                const res = await _fetch(url, { headers: { 'Accept': 'application/json' }, signal: opts.signal }, 10000);
                if (!res.ok) {
                    const httpErr = new Error(`HTTP ${res.status}`);
                    httpErr.code = 'HTTP_' + res.status;
                    httpErr.status = res.status;
                    throw httpErr;
                }
                return await res.json();
            };

            let data;
            try {
                data = await doFetch(pat);
            } catch (e) {
                if (e?.name === 'AbortError') throw e; // propagate cancellation
                // Retry with fresh PAT
                pat = await this.tm.generatePageAccessToken(pageId);
                if (!pat) {
                    const err = new Error('No PAT after regen');
                    err.code = 'PAT_REGEN_FAILED';
                    throw err;
                }
                data = await doFetch(pat);
            }

            // Token error → regenerate and retry
            if (data.error_code === 105 || data.error_code === 100) {
                pat = await this.tm.generatePageAccessToken(pageId);
                if (pat) data = await doFetch(pat);
            }

            const customers = data.customers || data.conv_customers || [];
            const result = {
                messages: data.messages || [],
                conversation: data.conversation || null,
                customers,
                customerId: customers[0]?.id || null,
                global_id: data.global_id || customers.find(c => c.global_id)?.global_id || null,
                can_inbox: data.can_inbox ?? true,
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
            try { window.GlobalIdHarvester?.fromCustomers(pageId, result.customers, { conversationId, threadId: result.conversation?.thread_id }); } catch (_) {}
            return { ...result, fromCache: false };
        } catch (e) {
            // Propagate AbortError — caller needs to know request was cancelled, not failed
            if (e?.name === 'AbortError') throw e;
            console.error('[PDM] fetchMessages error:', e?.code || e?.message || e);
            // NEW: throwOnError mode (chat-core uses this to show error state instead of silent empty)
            if (opts.throwOnError) {
                const wrapped = new Error(e?.message || 'fetchMessages failed');
                wrapped.code = e?.code || 'MESSAGES_FETCH_FAILED';
                wrapped.cause = e;
                throw wrapped;
            }
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
    async searchConversations(query, opts = {}) {
        try {
            if (!query) return { conversations: [] };
            const token = await this.tm?.getToken();
            if (!token) return { conversations: [] };

            const ids = this._searchablePageIds;
            if (ids.length === 0) return { conversations: [] };

            const encoded = encodeURIComponent(query);
            const qs = `q=${encoded}&access_token=${token}&cursor_mode=true`;
            const url = PancakeApiConfig.buildUrl.pancake('conversations/search', qs);
            const formData = new FormData();
            formData.append('page_ids', ids.join(','));

            const _fetch = window.fetchWithTimeout || fetch;
            const res = await _fetch(url, { method: 'POST', body: formData, signal: opts.signal }, 10000);
            if (!res.ok) return { conversations: [] };
            let data = await res.json();

            // Error 122 = subscription expired → find bad pages and retry without them
            if (data.error_code === 122 && data.errors && ids.length > 1) {
                const badIds = new Set((data.errors || []).filter(e => e.error_code === 122).map(e => String(e.page_id)));
                const goodIds = ids.filter(id => !badIds.has(String(id)));
                console.warn(`[PDM] Search error 122: removing expired pages [${[...badIds]}], retrying with ${goodIds.length} pages`);
                if (goodIds.length > 0) {
                    for (const bid of badIds) this._expiredPageIds.add(bid);
                    const retryForm = new FormData();
                    retryForm.append('page_ids', goodIds.join(','));
                    const retryRes = await _fetch(url, { method: 'POST', body: retryForm, signal: opts.signal }, 10000);
                    if (retryRes.ok) {
                        data = await retryRes.json();
                    }
                }
            }
            if (data.error_code && !data.conversations?.length) return { conversations: [] };
            return { conversations: data.conversations || [] };
        } catch (e) {
            if (e?.name === 'AbortError') throw e;
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
        let url = `${_PDM_WORKER_URL}/api/fb-avatar?id=${fbId}`;
        if (pageId) url += `&page=${pageId}`;
        return url;
    }

    // --- Parse channelId from Facebook_PostId (format: "pageId_postId") ---
    parseChannelId(facebookPostId) {
        if (!facebookPostId) return null;
        const parts = String(facebookPostId).split('_');
        return parts[0] || null;
    }

    // --- Get chat info for an order (used by tab1-table.js) ---
    getChatInfoForOrder(order) {
        if (!order) return { psid: null, channelId: null };
        const psid = order.Facebook_ASUserId || order.psid || '';
        const channelId = this.parseChannelId(order.Facebook_PostId) || '';
        return { psid, channelId };
    }

    // --- Get last message for an order (used by tab1-table.js) ---
    getLastMessageForOrder(order) {
        const defaultResult = { text: '', message: '', hasUnread: false, unreadCount: 0, attachments: [], time: null };
        if (!order) return defaultResult;

        const psid = order.Facebook_ASUserId || order.psid || '';
        if (!psid) return defaultResult;

        const conv = this.inboxMapByPSID.get(String(psid));
        if (!conv) return defaultResult;

        const lastMsg = conv.last_message || {};
        const msgText = lastMsg.text || lastMsg.message || '';
        return {
            text: msgText,
            message: msgText, // alias for tab1-table.js formatMessagePreview/renderChatColumnWithData
            hasUnread: !conv.seen,
            unreadCount: conv.unread_count || 0,
            attachments: lastMsg.attachments || [],
            time: conv.updated_at || null,
            sender: lastMsg.sender || '',
        };
    }

    // --- Get last comment for an order (used by tab1-table.js) ---
    getLastCommentForOrder(channelId, psid, order) {
        const defaultResult = { text: '', message: '', hasUnread: false, unreadCount: 0, attachments: [], time: null };
        if (!psid) return defaultResult;

        const conv = this.commentMapByPSID.get(String(psid));
        if (!conv) return defaultResult;

        const lastMsg = conv.last_message || {};
        const msgText = lastMsg.text || lastMsg.message || '';
        return {
            text: msgText,
            message: msgText,
            hasUnread: !conv.seen,
            unreadCount: conv.unread_count || 0,
            attachments: lastMsg.attachments || [],
            time: conv.updated_at || null,
            sender: lastMsg.sender || '',
        };
    }

    // --- Queued fetch (for rate-limited operations) ---
    queuedFetch(url, options) {
        return this.requestQueue.enqueue(() => fetch(url, options));
    }
}

// =====================================================
// GLOBAL INSTANCE
// =====================================================

// Singleton guard
if (!window.pancakeDataManager) {
    window.pancakeDataManager = new PancakeDataManager();
}
if (!window.PancakeApiConfig) window.PancakeApiConfig = PancakeApiConfig;
if (!window.PancakeRequestQueue) window.PancakeRequestQueue = PancakeRequestQueue;

// Backwards compatibility
if (!window.chatDataManager) window.chatDataManager = window.pancakeDataManager;

