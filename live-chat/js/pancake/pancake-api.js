// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PANCAKE API - All Pancake API calls (extracted from pancake-data-manager.js)
// =====================================================

const PancakeAPI = {
    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho route soft-gated (WEB2_AUTH_ENFORCE).
    // Không token (chưa login web2) → bỏ qua header, request vẫn đi (server enforce → 401).
    _w2AuthHeaders(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        const h = { ...(extra || {}) };
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {
            /* no token */
        }
        return h;
    },

    CACHE_DURATION: 5 * 60 * 1000,
    lastPageFetchTime: null,
    lastFetchTime: null,
    isLoadingPages: false,
    isLoadingConversations: false,

    // =====================================================
    // TOKEN HELPERS
    // =====================================================

    async getToken() {
        // NGUỒN CHUNG (2026-06-13): JWT lấy từ Web2Chat (web2-chat-client.js) — 1 nguồn
        // token cho cả Web 2.0. Fallback token-manager nếu Web2Chat chưa load.
        if (window.Web2Chat && typeof window.Web2Chat.getJwt === 'function') {
            const t = window.Web2Chat.getJwt();
            if (t) return t;
        }
        if (window.pancakeTokenManager) return window.pancakeTokenManager.getToken();
        return null;
    },

    async getPageAccessToken(pageId) {
        // NGUỒN CHUNG: PAT từ Web2Chat; thiếu → generate; fallback token-manager.
        if (window.Web2Chat && typeof window.Web2Chat.getPageAccessToken === 'function') {
            const pat = window.Web2Chat.getPageAccessToken(pageId);
            if (pat) return pat;
            if (typeof window.Web2Chat.generatePageAccessToken === 'function') {
                try {
                    const g = await window.Web2Chat.generatePageAccessToken(pageId);
                    if (g && g.ok && g.token) return g.token;
                } catch (_) {}
            }
        }
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
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (data.success && data.categorized?.activated) {
                const allPages = data.categorized.activated;
                const allPageIds = data.categorized.activated_page_ids || [];
                state.pages = allPages.filter((p) => !p.id.startsWith('igo_'));
                state.pageIds = allPageIds.filter((id) => !id.startsWith('igo_'));
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
                    token: pat,
                    pageId: page.id,
                    pageName: page.name || page.id,
                    savedAt: Date.now(),
                };
                count++;
            }
        }
        if (count > 0) {
            const existing = window.pancakeTokenManager.pageAccessTokens || {};
            window.pancakeTokenManager.pageAccessTokens = { ...existing, ...tokensToSave };
            window.pancakeTokenManager.savePageAccessTokensToLocalStorage();
            if (window.pancakeTokenManager.pageTokensRef) {
                window.pancakeTokenManager.pageTokensRef
                    .set(tokensToSave, { merge: true })
                    .catch((err) => console.warn('[PK-API] Sync page tokens error:', err));
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
            const url = window.API_CONFIG.buildUrl.pancake(
                'pages/unread_conv_pages_count',
                `access_token=${token}`
            );
            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.success && data.data) {
                const state = window.PancakeState;
                return data.data.map((item) => {
                    const cachedPage = state.pages.find(
                        (p) =>
                            p.page_id === item.page_id ||
                            p.fb_page_id === item.page_id ||
                            p.id === item.page_id
                    );
                    return {
                        page_id: item.page_id,
                        unread_conv_count: item.unread_conv_count || 0,
                        page_name: cachedPage?.page_name || cachedPage?.name || item.page_id,
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
                if (Date.now() - this.lastFetchTime < this.CACHE_DURATION)
                    return state.conversations;
            }
            if (this.isLoadingConversations) return state.conversations;
            if (state.pageIds.length === 0) await this.fetchPages();
            if (state.pageIds.length === 0) return [];

            this.isLoadingConversations = true;
            const token = await this.getToken();
            const activePageIds = state._searchablePageIds || state.pageIds;
            const pagesParams = activePageIds.map((id) => `pages[${id}]=0`).join('&');
            const qs = `${pagesParams}&unread_first=true&mode=OR&tags="ALL"&except_tags=[]&access_token=${token}&cursor_mode=true&from_platform=web`;
            const url = window.API_CONFIG.buildUrl.pancake('conversations', qs);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            // Handle error_code 122 (subscription expired for a page)
            if (data.error_code === 122 && activePageIds.length > 1 && !state._searchablePageIds) {
                console.warn('[PK-API] Error 122 - finding working pages...');
                const working = [];
                for (const pid of activePageIds) {
                    try {
                        const testUrl = window.API_CONFIG.buildUrl.pancake(
                            'conversations',
                            `pages[${pid}]=0&access_token=${token}&cursor_mode=true&from_platform=web`
                        );
                        const testResp = await API_CONFIG.smartFetch(testUrl);
                        const testData = await testResp.json();
                        if (
                            !testData.error_code ||
                            (testData.error_code !== 122 && testData.error_code !== 429)
                        ) {
                            working.push(pid);
                        } else {
                            console.warn(
                                `[PK-API] Page ${pid} has error ${testData.error_code}, excluding`
                            );
                        }
                    } catch {
                        working.push(pid);
                    }
                }
                if (working.length > 0 && working.length < activePageIds.length) {
                    state._searchablePageIds = working;
                    console.log('[PK-API] Retrying with working pages:', working);
                    this.isLoadingConversations = false;
                    return await this.fetchConversations(true);
                }
            }

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
            const pagesParams = activePageIds
                .map((id) => `pages[${id}]=${pageCounts[id] || 0}`)
                .join('&');
            const qs = `unread_first=true&tags="ALL"&except_tags=[]&access_token=${token}&current_count=${totalCount}&cursor_mode=true&${pagesParams}&mode=OR&from_platform=web`;
            const url = window.API_CONFIG.buildUrl.pancake('conversations', qs);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const more = data.conversations || [];
            if (data.pages_with_current_count)
                state.pagesWithCurrentCount = data.pages_with_current_count;
            if (more.length > 0) state.conversations = [...state.conversations, ...more];
            return more;
        } catch (error) {
            console.error('[PK-API] fetchMoreConversations error:', error);
            return [];
        }
    },

    // =====================================================
    // MESSAGES / SEND — ĐÃ DỜI sang NGUỒN CHUNG Web2Chat (2026-06-13).
    // fetchMessages/sendMessage/uploadMedia + biến thể *N2Store đã XÓA: chat-window
    // adapter + realtime giờ gọi thẳng Web2Chat (web2-chat-client.js). Xem
    // pancake-chat-window.js + pancake-realtime.js. KHÔNG thêm lại đường data trùng ở đây.
    // =====================================================

    async privateReplyN2Store(pageId, commentId, message) {
        const n2storeUrl = window.PancakeState.n2storeUrl;
        // TPOS token đã gỡ — không gửi Authorization header.
        const headers = { 'Content-Type': 'application/json' };
        const response = await fetch(
            `${n2storeUrl}/api/pages/${pageId}/comments/${commentId}/private-reply`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ message }),
            }
        );
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed');
        return { success: true, recipient_id: data.recipient_id, message_id: data.message_id };
    },

    // =====================================================
    // SEARCH
    // =====================================================

    // NGUỒN CHUNG (2026-06-13): tìm qua Web2Chat.searchConversations (per-page),
    // loop các page + gộp + dedupe theo id. Bỏ _doSearch (đường HTTP trùng).
    async searchConversations(query, pageIds = null) {
        try {
            if (!query) return { conversations: [], customerId: null };
            if (!window.Web2Chat || typeof window.Web2Chat.searchConversations !== 'function')
                return { conversations: [], customerId: null };
            const state = window.PancakeState;
            let searchPageIds = pageIds || state._searchablePageIds || state.pageIds || [];
            searchPageIds = searchPageIds.filter((id) => id && !String(id).startsWith('igo_'));
            if (searchPageIds.length === 0) {
                await this.fetchPages();
                searchPageIds = (state.pageIds || []).filter(
                    (id) => id && !String(id).startsWith('igo_')
                );
            }
            const results = await Promise.all(
                searchPageIds.map((pid) =>
                    window.Web2Chat.searchConversations(pid, query).catch(() => ({
                        ok: false,
                        conversations: [],
                    }))
                )
            );
            const seen = new Set();
            const conversations = [];
            for (const r of results) {
                if (!r || !r.ok || !Array.isArray(r.conversations)) continue;
                for (const c of r.conversations) {
                    if (c && c.id && !seen.has(c.id)) {
                        seen.add(c.id);
                        conversations.push(c);
                    }
                }
            }
            const customerId = conversations[0]?.customers?.[0]?.id || null;
            return { conversations, customerId };
        } catch (error) {
            console.error('[PK-API] searchConversations error:', error);
            return { conversations: [], customerId: null };
        }
    },

    // =====================================================
    // MARK READ/UNREAD
    // =====================================================

    async markAsRead(pageId, convId) {
        const pat = await this.getPageAccessToken(pageId);
        if (!pat) return false;
        const url = window.API_CONFIG.buildUrl.pancakeOfficial(
            `pages/${pageId}/conversations/${convId}/read`,
            pat
        );
        const resp = await window.API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        return resp.ok;
    },

    async markAsUnread(pageId, convId) {
        const pat = await this.getPageAccessToken(pageId);
        if (!pat) return false;
        const url = window.API_CONFIG.buildUrl.pancakeOfficial(
            `pages/${pageId}/conversations/${convId}/unread`,
            pat
        );
        const resp = await window.API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
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
            const resp = await window.API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!resp.ok) return [];
            const data = await resp.json();
            return data.tags || [];
        } catch {
            return [];
        }
    },

    async addRemoveTag(pageId, convId, tagId, action = 'add') {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return false;
            const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${convId}/tags`,
                pat
            );
            const resp = await window.API_CONFIG.smartFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, tag_id: tagId }),
            });
            return resp.ok;
        } catch {
            return false;
        }
    },

    // MEDIA UPLOAD — đã dời sang Web2Chat.uploadMedia (nguồn chung, 2026-06-13).

    // =====================================================
    // CUSTOMER INFO / NOTES / COMMENTS
    // =====================================================

    async fetchCustomerInfo(pageId, customerId) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return null;
            const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${pageId}/page_customers/${customerId}`,
                pat
            );
            const resp = await window.API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            return data.customer || data;
        } catch {
            return null;
        }
    },

    async addCustomerNote(pageId, customerId, message) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return false;
            const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${pageId}/page_customers/${customerId}/notes`,
                pat
            );
            const resp = await window.API_CONFIG.smartFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
            });
            return resp.ok;
        } catch {
            return false;
        }
    },

    async hideComment(pageId, commentId) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return false;
            const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${pageId}/comments/${commentId}/hide`,
                pat
            );
            const resp = await window.API_CONFIG.smartFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            return resp.ok;
        } catch {
            return false;
        }
    },

    async likeComment(pageId, commentId) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return false;
            const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${pageId}/comments/${commentId}/like`,
                pat
            );
            const resp = await window.API_CONFIG.smartFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            return resp.ok;
        } catch {
            return false;
        }
    },

    async deleteComment(pageId, commentId) {
        try {
            const pat = await this.getPageAccessToken(pageId);
            if (!pat) return false;
            const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${pageId}/comments/${commentId}`,
                pat
            );
            const resp = await window.API_CONFIG.smartFetch(url, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
            });
            return resp.ok;
        } catch {
            return false;
        }
    },

    async sendTypingIndicator(pageId, convId, isTyping = true) {
        try {
            const jwtToken = await window.pancakeTokenManager?.getToken();
            if (!jwtToken) return false;
            const url = window.API_CONFIG.buildUrl.pancakeDirect(
                `pages/${pageId}/conversations/${convId}/typing`,
                pageId,
                jwtToken,
                jwtToken
            );
            const resp = await window.API_CONFIG.smartFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ typing: isTyping }),
            });
            return resp.ok;
        } catch {
            return false;
        }
    },

    /**
     * Load debt data for conversations in bulk
     * 3W3 (2026-06-12): nguồn = ví Web 2.0 `web2_customer_wallets` (web2Db),
     * KHÔNG còn đọc ví Web 1.0 /api/v2/wallets. Shape response giữ nguyên.
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
            const response = await fetch(`${state.proxyBaseUrl}/api/web2/wallets/batch-summary`, {
                method: 'POST',
                headers: this._w2AuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ phones: unique }),
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
        const phone =
            customer.phone_numbers?.[0] || customer.phone || conv.recent_phone_numbers?.[0] || null;
        return phone ? SharedUtils.normalizePhone(phone) : null;
    },

    /**
     * Load Live saved customer IDs
     */
    async loadLiveSavedIds() {
        const state = window.PancakeState;
        try {
            // 2026-06-12: dời từ relay /api/live-saved (route không tồn tại — 404,
            // audit 3H8) sang web2-live-comments/saved (web2Db).
            const resp = await fetch(`${state.proxyBaseUrl}/api/web2-live-comments/saved/ids`);
            const data = await resp.json();
            state.liveSavedIds = data.success ? new Set(data.data) : new Set();
        } catch {
            state.liveSavedIds = new Set();
        }
    },

    async removeFromLiveSaved(customerId) {
        const state = window.PancakeState;
        try {
            const resp = await fetch(
                `${state.proxyBaseUrl}/api/web2-live-comments/saved/${encodeURIComponent(customerId)}`,
                // ENFORCE-PREP (2026-06-12)
                { method: 'DELETE', headers: PancakeAPI._w2AuthHeaders() }
            );
            const data = await resp.json();
            if (data.success) {
                state.liveSavedIds.delete(customerId);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    },
};

// Export
if (typeof window !== 'undefined') {
    window.PancakeAPI = PancakeAPI;
}
