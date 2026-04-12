// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PANCAKE API - All Pancake API calls (extracted from pancake-data-manager.js)
// =====================================================

const PancakeAPI = {
    // Messages cache
    messagesCache: new Map(),
    MESSAGES_CACHE_DURATION: 2 * 60 * 1000,
    CACHE_DURATION: 5 * 60 * 1000,
    lastPageFetchTime: null,
    lastFetchTime: null,
    isLoadingPages: false,
    isLoadingConversations: false,

    // =====================================================
    // TOKEN HELPERS
    // =====================================================

    async getToken() {
        if (!window.pancakeTokenManager) {
            console.error('[PK-API] pancakeTokenManager not available');
            return null;
        }
        return window.pancakeTokenManager.getToken();
    },

    async getPageAccessToken(pageId) {
        return window.pancakeTokenManager?.getOrGeneratePageAccessToken(pageId) || null;
    },

    // =====================================================
    // PAGES
    // =====================================================

    /**
     * Fetch all pages
     * @param {boolean} forceRefresh
     * @returns {Promise<Array>}
     */
    async fetchPages(forceRefresh = false) {
        const state = window.PancakeState;
        try {
            if (!forceRefresh && state.pages.length > 0 && this.lastPageFetchTime) {
                if (Date.now() - this.lastPageFetchTime < this.CACHE_DURATION) {
                    return state.pages;
                }
            }
            if (this.isLoadingPages) return state.pages;
            this.isLoadingPages = true;

            const token = await this.getToken();
            const url = window.API_CONFIG.buildUrl.pancake('pages', `access_token=${token}`);
            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (data.success && data.categorized?.activated) {
                const allPages = data.categorized.activated;
                const allPageIds = data.categorized.activated_page_ids || [];
                state.pages = allPages.filter(p => !p.id.startsWith('igo_'));
                state.pageIds = allPageIds.filter(id => !id.startsWith('igo_'));
                this.lastPageFetchTime = Date.now();

                // Extract and cache page_access_tokens
                this._extractPageAccessTokens(state.pages);
                console.log(`[PK-API] Fetched ${state.pages.length} pages`);
                return state.pages;
            }
            return [];
        } catch (error) {
            console.error('[PK-API] fetchPages error:', error);
            return [];
        } finally {
            this.isLoadingPages = false;
        }
    },

    _extractPageAccessTokens(pages) {
        if (!window.pancakeTokenManager) return;
        const tokensToSave = {};
        let count = 0;
        for (const page of pages) {
            const pat = page.settings?.page_access_token;
            if (page.id && pat) {
                tokensToSave[page.id] = {
                    token: pat, pageId: page.id,
                    pageName: page.name || page.id, savedAt: Date.now()
                };
                count++;
            }
        }
        if (count > 0) {
            const existing = window.pancakeTokenManager.pageAccessTokens || {};
            window.pancakeTokenManager.pageAccessTokens = { ...existing, ...tokensToSave };
            window.pancakeTokenManager.savePageAccessTokensToLocalStorage();
            if (window.pancakeTokenManager.pageTokensRef) {
                window.pancakeTokenManager.pageTokensRef.set(tokensToSave, { merge: true })
                    .catch(err => console.warn('[PK-API] Sync page tokens error:', err));
            }
        }
    },

    /**
     * Fetch pages with unread conversation count
     * @returns {Promise<Array>}
     */
    async fetchPagesWithUnreadCount() {
        try {
            const token = await this.getToken();
            if (!token) return [];
            const url = window.API_CONFIG.buildUrl.pancake('pages/unread_conv_pages_count', `access_token=${token}`);
            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.success && data.data) {
                const state = window.PancakeState;
                return data.data.map(item => {
                    const cachedPage = state.pages.find(p =>
                        p.page_id === item.page_id || p.fb_page_id === item.page_id || p.id === item.page_id
                    );
                    return {
                        page_id: item.page_id,
                        unread_conv_count: item.unread_conv_count || 0,
                        page_name: cachedPage?.page_name || cachedPage?.name || item.page_id
                    };
                });
            }
            return [];
        } catch (error) {
            console.error('[PK-API] fetchPagesWithUnreadCount error:', error);
            return [];
        }
    },

    // =====================================================
    // CONVERSATIONS
    // =====================================================

    /**
     * Fetch conversations (paginated)
     * @param {boolean} forceRefresh
     * @returns {Promise<Array>}
     */
    async fetchConversations(forceRefresh = false) {
        const state = window.PancakeState;
        try {
            if (!forceRefresh && state.conversations.length > 0 && this.lastFetchTime) {
                if (Date.now() - this.lastFetchTime < this.CACHE_DURATION) return state.conversations;
            }
            if (this.isLoadingConversations) return state.conversations;
            if (state.pageIds.length === 0) await this.fetchPages();
            if (state.pageIds.length === 0) return [];

            this.isLoadingConversations = true;
            const token = await this.getToken();
            const activePageIds = state._searchablePageIds || state.pageIds;
            const pagesParams = activePageIds.map(id => `pages[${id}]=0`).join('&');
            const qs = `${pagesParams}&unread_first=true&mode=OR&tags="ALL"&except_tags=[]&access_token=${token}&cursor_mode=true&from_platform=web`;
            const url = window.API_CONFIG.buildUrl.pancake('conversations', qs);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET', headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            state.conversations = data.conversations || [];
            state.pagesWithCurrentCount = data.pages_with_current_count || {};
            this.lastFetchTime = Date.now();
            console.log(`[PK-API] Fetched ${state.conversations.length} conversations`);
            return state.conversations;
        } catch (error) {
            console.error('[PK-API] fetchConversations error:', error);
            return [];
        } finally {
            this.isLoadingConversations = false;
        }
    },

    /**
     * Fetch more conversations (pagination)
     * @returns {Promise<Array>}
     */
    async fetchMoreConversations() {
        const state = window.PancakeState;
        try {
            if (state.pageIds.length === 0) await this.fetchPages();
            if (state.pageIds.length === 0) return [];

            const pageCounts = state.pagesWithCurrentCount || {};
            const totalCount = Object.values(pageCounts).reduce((s, c) => s + c, 0);
            const token = await this.getToken();
            const activePageIds = state._searchablePageIds || state.pageIds;
            const pagesParams = activePageIds.map(id => `pages[${id}]=${pageCounts[id] || 0}`).join('&');
            const qs = `unread_first=true&tags="ALL"&except_tags=[]&access_token=${token}&current_count=${totalCount}&cursor_mode=true&${pagesParams}&mode=OR&from_platform=web`;
            const url = window.API_CONFIG.buildUrl.pancake('conversations', qs);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET', headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const more = data.conversations || [];
            if (data.pages_with_current_count) state.pagesWithCurrentCount = data.pages_with_current_count;
            if (more.length > 0) state.conversations = [...state.conversations, ...more];
            return more;
        } catch (error) {
            console.error('[PK-API] fetchMoreConversations error:', error);
            return [];
        }
    },

    // =====================================================
    // MESSAGES
    // =====================================================

    /**
     * Fetch messages for a conversation
     * @param {string} pageId
     * @param {string} convId
     * @param {Object} options - { currentCount, customerId, forceRefresh }
     * @returns {Promise<Object>}
     */
    async fetchMessages(pageId, convId, options = {}) {
        const { currentCount = null, customerId = null, forceRefresh = false } = options;
        const cacheKey = `${pageId}_${convId}`;
        try {
            if (pageId.startsWith('igo_')) return { messages: [], fromCache: false };
            if (!forceRefresh && currentCount === null) {
                const cached = this.messagesCache.get(cacheKey);
                if (cached && (Date.now() - cached.timestamp) < this.MESSAGES_CACHE_DURATION) {
                    return { ...cached, fromCache: true };
                }
            }
            const jwtToken = await window.pancakeTokenManager?.getToken();
            if (!jwtToken) throw new Error('No JWT token');

            const endpoint = `pages/${pageId}/conversations/${convId}/messages`;
            let url = window.API_CONFIG.buildUrl.pancakeDirect(endpoint, pageId, jwtToken, jwtToken);
            if (customerId) url += `&customer_id=${customerId}`;
            if (currentCount !== null) url += `&current_count=${currentCount}`;

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET', headers: { 'Content-Type': 'application/json' }
            }, 3, true);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const customers = data.customers || data.conv_customers || [];
            const result = {
                messages: data.messages || [],
                conversation: data.conversation || null,
                customers,
                customerId: customers[0]?.id || null,
                fromCache: false
            };

            if (currentCount === null && result.messages.length > 0) {
                this.messagesCache.set(cacheKey, { ...result, timestamp: Date.now() });
            }
            return result;
        } catch (error) {
            console.error('[PK-API] fetchMessages error:', error);
            const cached = this.messagesCache.get(cacheKey);
            if (cached) return { ...cached, fromCache: true, error: error.message };
            return { messages: [], fromCache: false, error: error.message };
        }
    },

    /**
     * Fetch messages via N2Store (Facebook Graph API)
     */
    async fetchMessagesN2Store(pageId, convId) {
        try {
            const n2storeUrl = window.PancakeState.n2storeUrl;
            const tposToken = window.tposTokenManager ? await window.tposTokenManager.getToken() : null;
            const headers = tposToken ? { 'Authorization': `Bearer ${tposToken}` } : {};
            const response = await fetch(
                `${n2storeUrl}/api/conversations/${convId}/messages?page_id=${pageId}`, { headers }
            );
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Failed');
            const messages = data.data?.messages || [];
            return { messages, pageMessages: messages, totalMessages: messages.length };
        } catch (error) {
            console.error('[PK-API] fetchMessagesN2Store error:', error);
            return { messages: [], pageMessages: [] };
        }
    },

    // =====================================================
    // SEND MESSAGE
    // =====================================================

    async sendMessage(pageId, convId, messageData) {
        const pageAccessToken = await this.getPageAccessToken(pageId);
        if (!pageAccessToken) throw new Error('No page_access_token');
        const { text, attachments = [], action = 'reply_inbox', customerId, content_ids = [], attachment_type } = messageData;
        const payload = { action, message: text || '', conversation_id: convId };
        if (content_ids.length > 0) payload.content_ids = content_ids;
        else if (attachments.length > 0) payload.content_ids = attachments.map(a => a.content_id || a.id).filter(Boolean);
        if (customerId) payload.customer_id = customerId;

        const url = window.API_CONFIG.buildUrl.pancakeOfficial(
            `pages/${pageId}/conversations/${convId}/messages`, pageAccessToken
        );
        const response = await API_CONFIG.smartFetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`Send failed: ${response.status}`);
        const data = await response.json();
        return data.message || data;
    },

    async sendMessageN2Store(pageId, convId, text, action = 'reply_inbox', attachmentId = null, attachmentType = null) {
        const n2storeUrl = window.PancakeState.n2storeUrl;
        const tposToken = window.tposTokenManager ? await window.tposTokenManager.getToken() : null;
        const body = { conversation_id: convId, message: text };
        if (attachmentId) { body.attachment_id = attachmentId; body.attachment_type = attachmentType?.toLowerCase() || 'image'; }
        const headers = { 'Content-Type': 'application/json' };
        if (tposToken) headers['Authorization'] = `Bearer ${tposToken}`;
        const response = await fetch(`${n2storeUrl}/api/pages/${pageId}/messages`, {
            method: 'POST', headers, body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed');
        return data.data;
    },

    async sendPrivateReply(pageId, convId, text, customerId = null) {
        return this.sendMessage(pageId, convId, { text, action: 'private_replies', customerId });
    },

    async privateReplyN2Store(pageId, commentId, message) {
        const n2storeUrl = window.PancakeState.n2storeUrl;
        const tposToken = window.tposTokenManager ? await window.tposTokenManager.getToken() : null;
        const headers = { 'Content-Type': 'application/json' };
        if (tposToken) headers['Authorization'] = `Bearer ${tposToken}`;
        const response = await fetch(`${n2storeUrl}/api/pages/${pageId}/comments/${commentId}/private-reply`, {
            method: 'POST', headers, body: JSON.stringify({ message })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed');
        return { success: true, recipient_id: data.recipient_id, message_id: data.message_id };
    },

    // =====================================================
    // SEARCH
    // =====================================================

    async searchConversations(query, pageIds = null) {
        try {
            if (!query) return { conversations: [], customerId: null };
            const token = await this.getToken();
            if (!token) throw new Error('No token');
            const state = window.PancakeState;
            let searchPageIds = pageIds || state.pageIds;
            searchPageIds = searchPageIds.filter(id => !id.startsWith('igo_'));
            if (searchPageIds.length === 0) { await this.fetchPages(); searchPageIds = state.pageIds.filter(id => !id.startsWith('igo_')); }
            if (state._searchablePageIds) searchPageIds = state._searchablePageIds;

            const encoded = encodeURIComponent(query);
            const result = await this._doSearch(token, encoded, searchPageIds);
            if (result.success) return result;

            // Handle error_code 122
            if (result.errorCode === 122 && searchPageIds.length > 1 && !state._searchablePageIds) {
                const working = [];
                for (const pid of searchPageIds) {
                    const test = await this._doSearch(token, encoded, [pid]);
                    if (test.success || (test.errorCode !== 122 && test.errorCode !== 429)) working.push(pid);
                    await new Promise(r => setTimeout(r, 500));
                }
                if (working.length > 0) {
                    state._searchablePageIds = working;
                    await new Promise(r => setTimeout(r, 1000));
                    const retry = await this._doSearch(token, encoded, working);
                    if (retry.success) return retry;
                }
            }
            return { conversations: [], customerId: null };
        } catch (error) {
            console.error('[PK-API] searchConversations error:', error);
            return { conversations: [], customerId: null };
        }
    },

    async _doSearch(token, encodedQuery, pageIds) {
        const qs = `q=${encodedQuery}&access_token=${token}&cursor_mode=true`;
        const url = window.API_CONFIG.buildUrl.pancake('conversations/search', qs);
        const formData = new FormData();
        formData.append('page_ids', pageIds.join(','));
        try {
            const response = await fetch(url, { method: 'POST', body: formData });
            if (!response.ok) return { success: false, errorCode: response.status };
            const data = await response.json();
            if (data.error_code || !data.success) return { success: false, errorCode: data.error_code, message: data.message };
            const conversations = data.conversations || [];
            const customerId = conversations[0]?.customers?.[0]?.id || null;
            return { success: true, conversations, customerId };
        } catch (err) {
            return { success: false, errorCode: 0, message: err.message };
        }
    },

    // =====================================================
    // MARK READ/UNREAD
    // =====================================================

    async markAsRead(pageId, convId) {
        const pat = await this.getPageAccessToken(pageId);
        if (!pat) return false;
        const url = window.API_CONFIG.buildUrl.pancakeOfficial(`pages/${pageId}/conversations/${convId}/read`, pat);
        const resp = await window.API_CONFIG.smartFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        return resp.ok;
    },

    async markAsUnread(pageId, convId) {
        const pat = await this.getPageAccessToken(pageId);
        if (!pat) return false;
        const url = window.API_CONFIG.buildUrl.pancakeOfficial(`pages/${pageId}/conversations/${convId}/unread`, pat);
        const resp = await window.API_CONFIG.smartFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        return resp.ok;
    },

    // =====================================================
    // TAGS
    // =====================================================

    async fetchTags(pageId) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return [];
            const url = window.API_CONFIG.buildUrl.pancakeOfficial(`pages/${pageId}/tags`, pat);
            const resp = await window.API_CONFIG.smartFetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
            if (!resp.ok) return [];
            const data = await resp.json();
            return data.tags || [];
        } catch { return []; }
    },

    async addRemoveTag(pageId, convId, tagId, action = 'add') {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return false;
            const url = window.API_CONFIG.buildUrl.pancakeOfficial(`pages/${pageId}/conversations/${convId}/tags`, pat);
            const resp = await window.API_CONFIG.smartFetch(url, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, tag_id: tagId })
            });
            return resp.ok;
        } catch { return false; }
    },

    // =====================================================
    // MEDIA UPLOAD
    // =====================================================

    async uploadMedia(pageId, file) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) throw new Error('No page_access_token');
            const url = window.API_CONFIG.buildUrl.pancakeOfficial(`pages/${pageId}/upload_contents`, pat);
            const formData = new FormData();
            formData.append('file', file);
            const resp = await fetch(url, { method: 'POST', body: formData });
            if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
            const data = await resp.json();
            return { id: data.id, attachment_type: data.attachment_type || 'PHOTO', success: data.success !== false };
        } catch (error) {
            return { id: null, success: false, error: error.message };
        }
    },

    async uploadMediaN2Store(pageId, file) {
        try {
            const n2storeUrl = window.PancakeState.n2storeUrl;
            const tposToken = window.tposTokenManager ? await window.tposTokenManager.getToken() : null;
            const formData = new FormData();
            formData.append('file', file);
            const headers = {};
            if (tposToken) headers['Authorization'] = `Bearer ${tposToken}`;
            const resp = await fetch(`${n2storeUrl}/api/pages/${pageId}/upload`, { method: 'POST', headers, body: formData });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error || 'Upload failed');
            return { attachment_id: data.attachment_id || data.id, attachment_type: data.attachment_type || 'IMAGE', success: true };
        } catch (error) {
            return { attachment_id: null, success: false, error: error.message };
        }
    },

    // =====================================================
    // CUSTOMER INFO / NOTES / COMMENTS
    // =====================================================

    async fetchCustomerInfo(pageId, customerId) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return null;
            const url = window.API_CONFIG.buildUrl.pancakeOfficial(`pages/${pageId}/page_customers/${customerId}`, pat);
            const resp = await window.API_CONFIG.smartFetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
            if (!resp.ok) return null;
            const data = await resp.json();
            return data.customer || data;
        } catch { return null; }
    },

    async addCustomerNote(pageId, customerId, message) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return false;
            const url = window.API_CONFIG.buildUrl.pancakeOfficial(`pages/${pageId}/page_customers/${customerId}/notes`, pat);
            const resp = await window.API_CONFIG.smartFetch(url, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            return resp.ok;
        } catch { return false; }
    },

    async hideComment(pageId, commentId) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return false;
            const url = window.API_CONFIG.buildUrl.pancakeOfficial(`pages/${pageId}/comments/${commentId}/hide`, pat);
            const resp = await window.API_CONFIG.smartFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            return resp.ok;
        } catch { return false; }
    },

    async likeComment(pageId, commentId) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return false;
            const url = window.API_CONFIG.buildUrl.pancakeOfficial(`pages/${pageId}/comments/${commentId}/like`, pat);
            const resp = await window.API_CONFIG.smartFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            return resp.ok;
        } catch { return false; }
    },

    async deleteComment(pageId, commentId) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return false;
            const url = window.API_CONFIG.buildUrl.pancakeOfficial(`pages/${pageId}/comments/${commentId}`, pat);
            const resp = await window.API_CONFIG.smartFetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
            return resp.ok;
        } catch { return false; }
    },

    async sendTypingIndicator(pageId, convId, isTyping = true) {
        try {
            const jwtToken = await window.pancakeTokenManager?.getToken();
            if (!jwtToken) return false;
            const url = window.API_CONFIG.buildUrl.pancakeDirect(
                `pages/${pageId}/conversations/${convId}/typing`, pageId, jwtToken, jwtToken
            );
            const resp = await window.API_CONFIG.smartFetch(url, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ typing: isTyping })
            });
            return resp.ok;
        } catch { return false; }
    },

    /**
     * Load debt data for conversations in bulk
     */
    async loadDebtForConversations(conversations) {
        const state = window.PancakeState;
        const phones = [];
        for (const conv of conversations) {
            const phone = this._getPhoneFromConv(conv);
            if (phone && !state.debtCache.has(phone)) phones.push(phone);
        }
        if (phones.length === 0) return;
        const unique = [...new Set(phones)];
        try {
            const response = await fetch(`${state.proxyBaseUrl}/api/v2/wallets/batch-summary`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phones: unique })
            });
            if (!response.ok) return;
            const result = await response.json();
            if (result.success && result.data) {
                for (const [phone, walletData] of Object.entries(result.data)) {
                    state.setDebtCache(SharedUtils.normalizePhone(phone), walletData.total || 0);
                }
            }
        } catch (error) {
            console.warn('[PK-API] loadDebt error:', error);
        }
    },

    _getPhoneFromConv(conv) {
        const customer = conv.customers?.[0] || conv.from || {};
        const phone = customer.phone_numbers?.[0] || customer.phone || conv.recent_phone_numbers?.[0] || null;
        return phone ? SharedUtils.normalizePhone(phone) : null;
    },

    /**
     * Load TPOS saved customer IDs
     */
    async loadTposSavedIds() {
        const state = window.PancakeState;
        try {
            const resp = await fetch(`${state.tposPancakeUrl}/api/tpos-saved/ids`);
            const data = await resp.json();
            state.tposSavedIds = data.success ? new Set(data.data) : new Set();
        } catch {
            state.tposSavedIds = new Set();
        }
    },

    async removeFromTposSaved(customerId) {
        const state = window.PancakeState;
        try {
            const resp = await fetch(`${state.tposPancakeUrl}/api/tpos-saved/${encodeURIComponent(customerId)}`, { method: 'DELETE' });
            const data = await resp.json();
            if (data.success) {
                state.tposSavedIds.delete(customerId);
                return true;
            }
            return false;
        } catch { return false; }
    },

    clearMessagesCache(pageId = null, convId = null) {
        if (pageId && convId) {
            this.messagesCache.delete(`${pageId}_${convId}`);
        } else {
            this.messagesCache.clear();
        }
    }
};

// Export
if (typeof window !== 'undefined') {
    window.PancakeAPI = PancakeAPI;
}
