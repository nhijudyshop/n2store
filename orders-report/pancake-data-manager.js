// =====================================================
// PANCAKE DATA MANAGER - Quản lý tin nhắn Pancake.vn
// =====================================================

class PancakeDataManager {
    constructor() {
        this.conversations = [];
        // Separate maps for INBOX and COMMENT based on type field
        this.inboxMapByPSID = new Map();   // INBOX conversations by PSID
        this.inboxMapByFBID = new Map();   // INBOX conversations by Facebook ID
        this.commentMapByPSID = new Map(); // COMMENT conversations by PSID
        this.commentMapByFBID = new Map(); // COMMENT conversations by Facebook ID
        this.conversationsByCustomerFbId = new Map(); // All conversations by customers[].fb_id
        this.pages = [];
        this.pageIds = [];
        this.isLoading = false;
        this.isLoadingPages = false;
        this.lastFetchTime = null;
        this.lastPageFetchTime = null;
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
    }

    /**
     * Lấy token từ PancakeTokenManager (Firebase → Cookie)
     * @returns {Promise<string|null>}
     */
    async getToken() {
        if (!window.pancakeTokenManager) {
            console.error('[PANCAKE] PancakeTokenManager not available');
            return null;
        }

        // PancakeTokenManager tự động lấy từ Firebase hoặc Cookie
        const token = await window.pancakeTokenManager.getToken();
        return token;
    }

    /**
     * Build headers với referer để giống browser thật
     * @param {string} token - JWT token
     * @returns {Object}
     */
    getHeaders(token) {
        if (!token) {
            throw new Error('JWT token not found. Please login to Pancake.vn or set token in settings.');
        }

        return {
            'accept': 'application/json',
            'accept-language': 'vi,en-US;q=0.9,en;q=0.8',
            'referer': 'https://pancake.vn/multi_pages',
            'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin'
        };
    }

    /**
     * Lấy URL avatar cho user/customer
     * Ưu tiên sử dụng avatar URL trực tiếp từ Pancake nếu có
     * @param {string} fbId - Facebook User ID
     * @param {string} pageId - Page ID (optional, for Pancake avatar lookup)
     * @param {string} token - Pancake JWT token (optional)
     * @param {string} directAvatarUrl - Avatar URL trực tiếp từ Pancake API (optional)
     * @returns {string} Avatar URL
     */
    getAvatarUrl(fbId, pageId = null, token = null, directAvatarUrl = null) {
        // Ưu tiên sử dụng avatar URL trực tiếp từ Pancake nếu có
        if (directAvatarUrl && typeof directAvatarUrl === 'string') {
            // Nếu là URL content.pancake.vn, sử dụng trực tiếp
            if (directAvatarUrl.includes('content.pancake.vn')) {
                return directAvatarUrl;
            }
            // Nếu là hash, build URL
            if (/^[a-f0-9]{32,}$/i.test(directAvatarUrl)) {
                return `https://content.pancake.vn/2.1-25/avatars/${directAvatarUrl}`;
            }
            // Nếu là URL khác hợp lệ
            if (directAvatarUrl.startsWith('http')) {
                return directAvatarUrl;
            }
        }

        if (!fbId) {
            // Default avatar nếu không có fbId
            return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23e5e7eb"/><circle cx="20" cy="15" r="7" fill="%239ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="%239ca3af"/></svg>';
        }

        // Fallback: Dùng /api/fb-avatar endpoint
        let url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/fb-avatar?id=${fbId}`;
        if (pageId) {
            url += `&page=${pageId}`;
        }
        if (token) {
            url += `&token=${encodeURIComponent(token)}`;
        }
        return url;
    }

    /**
     * Lấy danh sách pages từ Pancake API
     * Official API: GET https://pages.fm/api/v1/pages
     * Authentication: access_token (User token)
     * @param {boolean} forceRefresh - Bắt buộc refresh
     * @returns {Promise<Array>}
     */
    async fetchPages(forceRefresh = false) {
        try {
            // Check cache
            if (!forceRefresh && this.pages.length > 0 && this.lastPageFetchTime) {
                const cacheAge = Date.now() - this.lastPageFetchTime;
                if (cacheAge < this.CACHE_DURATION) {
                    console.log('[PANCAKE] Using cached pages, count:', this.pages.length);
                    return this.pages;
                }
            }

            if (this.isLoadingPages) {
                console.log('[PANCAKE] Already loading pages...');
                return this.pages;
            }

            this.isLoadingPages = true;
            console.log('[PANCAKE] Fetching pages from User API (pages.fm/api/v1/pages)...');

            const token = await this.getToken();

            // Check if token is available
            if (!token) {
                console.warn('[PANCAKE] ⚠️ No valid token available. Please login to Pancake.vn or set token in settings.');
                return [];
            }

            // Official API: GET /api/v1/pages với access_token
            const url = window.API_CONFIG.buildUrl.pancakeUserApi('pages', `access_token=${token}`);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log('[PANCAKE] Pages response status:', response.status, response.statusText);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[PANCAKE] Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] Pages response data:', data);

            if (data.success && data.categorized && data.categorized.activated) {
                this.pages = data.categorized.activated;
                this.pageIds = data.categorized.activated_page_ids || [];
                this.lastPageFetchTime = Date.now();
                console.log(`[PANCAKE] ✅ Fetched ${this.pages.length} pages`);
                console.log('[PANCAKE] Page IDs:', this.pageIds);
                return this.pages;
            } else {
                console.warn('[PANCAKE] Unexpected response format:', data);
                return [];
            }

        } catch (error) {
            console.error('[PANCAKE] ❌ Error fetching pages:', error);
            return [];
        } finally {
            this.isLoadingPages = false;
        }
    }

    /**
     * Lấy danh sách pages với số lượng unread conversations
     * Endpoint: /api/v1/pages/unread_conv_pages_count (Internal API - không có trong docs chính thức)
     * Authentication: access_token (User token)
     * @returns {Promise<Array>} Array of { page_id, unread_conv_count }
     */
    async fetchPagesWithUnreadCount() {
        try {
            console.log('[PANCAKE] Fetching pages with unread count...');

            const token = await this.getToken();
            if (!token) {
                throw new Error('No Pancake token available');
            }

            // Internal API (không có trong docs chính thức) - dùng User API
            const url = window.API_CONFIG.buildUrl.pancakeUserApi('pages/unread_conv_pages_count', `access_token=${token}`);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            console.log('[PANCAKE] Unread pages response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[PANCAKE] Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] Unread pages response:', data);

            if (data.success && data.data) {
                // Merge with existing pages data to get page names
                const pagesWithUnread = data.data.map(item => {
                    // Find matching page from cached pages to get the name
                    const cachedPage = this.pages.find(p =>
                        p.page_id === item.page_id ||
                        p.fb_page_id === item.page_id ||
                        p.id === item.page_id
                    );
                    return {
                        page_id: item.page_id,
                        unread_conv_count: item.unread_conv_count || 0,
                        page_name: cachedPage?.page_name || cachedPage?.name || item.page_id
                    };
                });

                console.log(`[PANCAKE] ✅ Got ${pagesWithUnread.length} pages with unread count`);
                return pagesWithUnread;
            } else {
                console.warn('[PANCAKE] Unexpected response format:', data);
                return [];
            }

        } catch (error) {
            console.error('[PANCAKE] ❌ Error fetching pages with unread count:', error);
            return [];
        }
    }

    /**
     * Search conversations theo query (tên khách hàng, fb_id, etc.)
     * Internal API (không có trong docs chính thức): POST /api/v1/conversations/search
     * Authentication: access_token (User token)
     * @param {string} query - Search query (tên hoặc fb_id)
     * @param {Array<string>} pageIds - Danh sách page IDs để search (optional)
     * @returns {Promise<Object>} { conversations: Array, customerId: string|null }
     */
    async searchConversations(query, pageIds = null) {
        try {
            if (!query) {
                console.warn('[PANCAKE] searchConversations: No query provided');
                return { conversations: [], customerId: null };
            }

            console.log(`[PANCAKE] Searching conversations for query: "${query}"`);

            const token = await this.getToken();
            if (!token) {
                throw new Error('No Pancake token available');
            }

            // Use pageIds from parameter or default to all pageIds
            const searchPageIds = pageIds || this.pageIds;

            if (searchPageIds.length === 0) {
                await this.fetchPages();
                if (this.pageIds.length === 0) {
                    console.warn('[PANCAKE] No pages found for search');
                    return { conversations: [], customerId: null };
                }
            }

            // Internal API: POST /api/v1/conversations/search
            const pageIdsParam = (searchPageIds || this.pageIds).join(',');
            const encodedQuery = encodeURIComponent(query);
            const queryString = `q=${encodedQuery}&access_token=${token}&cursor_mode=true`;

            const url = window.API_CONFIG.buildUrl.pancakeUserApi('conversations/search', queryString);

            console.log('[PANCAKE] Search URL:', url);

            // Need to send page_ids in request body as FormData
            const formData = new FormData();
            formData.append('page_ids', pageIdsParam);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'POST',
                body: formData
            }, 3, true); // skipFallback = true for conversation search

            console.log('[PANCAKE] Search response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[PANCAKE] Search error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] Search results:', data);

            const conversations = data.conversations || [];

            // Extract customer ID from first conversation's customers array
            let customerId = null;
            if (conversations.length > 0 && conversations[0].customers && conversations[0].customers.length > 0) {
                customerId = conversations[0].customers[0].id;
                console.log(`[PANCAKE] ✅ Found customer ID from search: ${customerId}`);
            }

            return {
                conversations,
                customerId
            };

        } catch (error) {
            console.error('[PANCAKE] ❌ Error searching conversations:', error);
            return { conversations: [], customerId: null };
        }
    }

    /**
     * Search conversations by comment IDs and fb_id to get customer UUID
     * @param {string} facebookUserName - Facebook user name for search
     * @param {string} commentIds - Comma-separated comment IDs
     * @param {string} fbId - Facebook AS User ID to match
     * @param {Array<string>} pageIds - Page IDs to search (optional)
     * @returns {Promise<Object>} { customerUuid: string|null, threadId: string|null, threadKey: string|null }
     */
    async searchConversationsByCommentIds(facebookUserName, commentIds, fbId, pageIds = null) {
        try {
            console.log(`[PANCAKE] Searching by comment IDs for user: ${facebookUserName}, fb_id: ${fbId}`);

            // Step 1: Search conversations by name
            const searchResult = await this.searchConversations(facebookUserName, pageIds);

            if (!searchResult.conversations || searchResult.conversations.length === 0) {
                console.warn('[PANCAKE] No conversations found in search');
                return { customerUuid: null, threadId: null, threadKey: null };
            }

            // Step 2: Split comment IDs
            const commentIdArray = commentIds.split(',').map(id => id.trim());
            console.log('[PANCAKE] Looking for comment IDs:', commentIdArray);

            // Step 3: Find conversation matching comment ID
            let matchedConversation = null;
            for (const conv of searchResult.conversations) {
                // Match by conversation.id with any comment ID
                if (commentIdArray.includes(conv.id)) {
                    // Verify fb_id matches
                    const hasMatchingCustomer = conv.customers?.some(c => c.fb_id === fbId);
                    if (hasMatchingCustomer) {
                        matchedConversation = conv;
                        console.log('[PANCAKE] ✅ Found COMMENT conversation matching comment ID:', conv.id);
                        break;
                    }
                }
            }

            if (!matchedConversation) {
                console.warn('[PANCAKE] No COMMENT conversation found matching comment IDs and fb_id');
                return { customerUuid: null, threadId: null, threadKey: null };
            }

            // Step 4: Extract customer UUID
            const customerUuid = matchedConversation.customers?.[0]?.id || null;

            if (!customerUuid) {
                console.warn('[PANCAKE] Customer UUID not found in matched conversation');
                return { customerUuid: null, threadId: null, threadKey: null };
            }

            console.log('[PANCAKE] ✅ Found customer UUID:', customerUuid);

            // Step 5: Find INBOX conversation with same customer UUID to get thread_id and thread_key
            const inboxConversation = searchResult.conversations.find(conv =>
                conv.type === 'INBOX' &&
                conv.customers?.some(c => c.id === customerUuid)
            );

            const threadId = inboxConversation?.thread_id || null;
            const threadKey = inboxConversation?.thread_key || null;

            if (threadId && threadKey) {
                console.log('[PANCAKE] ✅ Found thread_id and thread_key from INBOX conversation');
            } else {
                console.log('[PANCAKE] ℹ️ No thread_id/thread_key found in search, will use inbox_preview');
            }

            return {
                customerUuid,
                threadId,
                threadKey
            };

        } catch (error) {
            console.error('[PANCAKE] ❌ Error in searchConversationsByCommentIds:', error);
            return { customerUuid: null, threadId: null, threadKey: null };
        }
    }

    /**
     * Lấy danh sách conversations từ Pancake API
     *
     * INTERNAL API (không có trong docs chính thức):
     * - GET /api/v1/conversations với pages[pageId]=offset cho multi-page fetch
     *
     * OFFICIAL API (từ docs - chỉ hỗ trợ từng page):
     * - GET https://pages.fm/api/public_api/v2/pages/{page_id}/conversations
     * - Dùng page_access_token
     * - Returns max 60 conversations per request
     *
     * @param {boolean} forceRefresh - Bắt buộc refresh
     * @returns {Promise<Array>}
     */
    async fetchConversations(forceRefresh = false) {
        try {
            // Check cache
            if (!forceRefresh && this.conversations.length > 0 && this.lastFetchTime) {
                const cacheAge = Date.now() - this.lastFetchTime;
                if (cacheAge < this.CACHE_DURATION) {
                    console.log('[PANCAKE] Using cached conversations, count:', this.conversations.length);
                    return this.conversations;
                }
            }

            if (this.isLoading) {
                console.log('[PANCAKE] Already loading conversations...');
                return this.conversations;
            }

            // Fetch pages first if needed
            if (this.pageIds.length === 0) {
                await this.fetchPages();
            }

            if (this.pageIds.length === 0) {
                console.warn('[PANCAKE] No pages found, cannot fetch conversations');
                return [];
            }

            this.isLoading = true;
            console.log('[PANCAKE] Fetching conversations from User API (internal multi-page endpoint)...');

            const token = await this.getToken();

            // Check if token is available
            if (!token) {
                console.warn('[PANCAKE] ⚠️ No valid token available for fetching conversations');
                return [];
            }

            // Internal API: GET /api/v1/conversations với format pages[pageId]=offset
            // Cho phép fetch từ nhiều pages cùng lúc (không có trong official docs)
            const pagesParams = this.pageIds.map(pageId => `pages[${pageId}]=0`).join('&');
            const queryString = `${pagesParams}&unread_first=true&mode=OR&tags="ALL"&except_tags=[]&access_token=${token}&cursor_mode=true&from_platform=web`;

            // Use User API proxy (internal endpoint)
            const url = window.API_CONFIG.buildUrl.pancakeUserApi('conversations', queryString);

            console.log('[PANCAKE] Conversations URL:', url);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log('[PANCAKE] Conversations response status:', response.status, response.statusText);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[PANCAKE] Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] Conversations response data:', data);

            this.conversations = data.conversations || [];
            this.lastFetchTime = Date.now();

            // Build conversation map
            this.buildConversationMap();

            console.log(`[PANCAKE] ✅ Fetched ${this.conversations.length} conversations`);

            return this.conversations;

        } catch (error) {
            console.error('[PANCAKE] ❌ Error fetching conversations:', error);
            console.error('[PANCAKE] Error stack:', error.stack);
            return [];
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Build Maps từ PSID và Facebook ID -> conversation để lookup nhanh
     * Phân loại dựa trên field "type": "INBOX" hoặc "COMMENT"
     * - INBOX messages: thường có from_psid
     * - COMMENT messages: thường from_psid = null, chỉ có from.id
     */
    buildConversationMap() {
        this.inboxMapByPSID.clear();
        this.inboxMapByFBID.clear();
        this.commentMapByPSID.clear();
        this.commentMapByFBID.clear();
        this.conversationsByCustomerFbId.clear();

        this.conversations.forEach(conv => {
            const convType = conv.type; // "INBOX" or "COMMENT"

            if (convType === 'INBOX') {
                // INBOX conversations
                if (conv.from_psid) {
                    this.inboxMapByPSID.set(conv.from_psid, conv);
                }
                if (conv.from && conv.from.id) {
                    this.inboxMapByFBID.set(conv.from.id, conv);
                }
            } else if (convType === 'COMMENT') {
                // COMMENT conversations
                if (conv.from_psid) {
                    this.commentMapByPSID.set(conv.from_psid, conv);
                }
                if (conv.from && conv.from.id) {
                    this.commentMapByFBID.set(conv.from.id, conv);
                }
            }

            // Map by customers[].fb_id for both INBOX and COMMENT
            // This is critical for COMMENT conversations where from_psid is null
            if (conv.customers && conv.customers.length > 0) {
                conv.customers.forEach(customer => {
                    if (customer.fb_id) {
                        this.conversationsByCustomerFbId.set(customer.fb_id, conv);
                    }
                });
            }
        });

        console.log(`[PANCAKE] Built conversation maps:`);
        console.log(`  - INBOX by PSID: ${this.inboxMapByPSID.size} entries`);
        console.log(`  - INBOX by FBID: ${this.inboxMapByFBID.size} entries`);
        console.log(`  - COMMENT by PSID: ${this.commentMapByPSID.size} entries`);
        console.log(`  - COMMENT by FBID: ${this.commentMapByFBID.size} entries`);
        console.log(`  - By Customer FB ID: ${this.conversationsByCustomerFbId.size} entries`);
    }

    /**
     * Lấy conversation theo Facebook User ID (bất kỳ type nào)
     * Tìm trong cả INBOX và COMMENT maps
     * Ưu tiên: INBOX by PSID → INBOX by FBID → COMMENT by FBID → COMMENT by PSID → customers[].fb_id
     * @param {string} userId - Facebook User ID (Facebook_ASUserId)
     * @returns {Object|null}
     */
    getConversationByUserId(userId) {
        if (!userId) return null;

        // Try INBOX maps first (most common)
        let conversation = this.inboxMapByPSID.get(userId);
        if (!conversation) {
            conversation = this.inboxMapByFBID.get(userId);
        }

        // Fallback to COMMENT maps
        if (!conversation) {
            conversation = this.commentMapByFBID.get(userId);
        }
        if (!conversation) {
            conversation = this.commentMapByPSID.get(userId);
        }

        // Last resort: Search by customers[].fb_id
        // This is critical for COMMENT conversations where:
        // - from_psid is null
        // - order.Facebook_ASUserId doesn't match conversation.from.id
        // - The correct match is in customers[].fb_id
        if (!conversation) {
            conversation = this.conversationsByCustomerFbId.get(userId);
            if (conversation) {
                console.log('[PANCAKE] ✅ Found conversation via customers[].fb_id:', {
                    userId,
                    convId: conversation.id,
                    convType: conversation.type,
                    customerName: conversation.customers?.[0]?.name
                });
            }
        }

        return conversation || null;
    }

    /**
     * Lấy unread info cho một order
     * @param {Object} order - Order object (có Facebook_ASUserId)
     * @returns {Object} { hasUnread, unreadCount }
     */
    getUnreadInfoForOrder(order) {
        const userId = order.Facebook_ASUserId;

        if (!userId) {
            return {
                hasUnread: false,
                unreadCount: 0
            };
        }

        const conversation = this.getConversationByUserId(userId);

        if (!conversation) {
            return {
                hasUnread: false,
                unreadCount: 0
            };
        }

        // Pancake conversation có field:
        // - seen: false = chưa đọc
        // - unread_count: số tin nhắn chưa đọc
        const hasUnread = conversation.seen === false && conversation.unread_count > 0;
        const unreadCount = conversation.unread_count || 0;

        return {
            hasUnread,
            unreadCount
        };
    }

    /**
     * Lấy unread info cho TIN NHẮN (INBOX only)
     * @param {Object} order - Order object (có Facebook_ASUserId)
     * @returns {Object} { hasUnread, unreadCount }
     */
    getMessageUnreadInfoForOrder(order) {
        const userId = order.Facebook_ASUserId;

        if (!userId) {
            return {
                hasUnread: false,
                unreadCount: 0
            };
        }

        // Chỉ tìm trong INBOX maps
        // Ensure string conversion for lookup
        const userIdStr = String(userId);
        let conversation = this.inboxMapByPSID.get(userIdStr);

        if (!conversation) {
            // Try iterating if direct lookup fails (handle number/string mismatch in map keys)
            for (const [key, value] of this.inboxMapByPSID) {
                if (String(key) === userIdStr) {
                    conversation = value;
                    break;
                }
            }
        }

        if (!conversation) {
            conversation = this.inboxMapByFBID.get(userIdStr);
            if (!conversation) {
                // Try iterating for FBID map too
                for (const [key, value] of this.inboxMapByFBID) {
                    if (String(key) === userIdStr) {
                        conversation = value;
                        break;
                    }
                }
            }
        }

        if (!conversation) {
            return {
                hasUnread: false,
                unreadCount: 0
            };
        }

        const hasUnread = conversation.seen === false && conversation.unread_count > 0;
        const unreadCount = conversation.unread_count || 0;

        return {
            hasUnread,
            unreadCount
        };
    }

    /**
     * Lấy unread info cho BÌNH LUẬN (COMMENT only)
     * @param {Object} order - Order object (có Facebook_ASUserId)
     * @returns {Object} { hasUnread, unreadCount }
     */
    getCommentUnreadInfoForOrder(order) {
        const userId = order.Facebook_ASUserId;

        if (!userId) {
            return {
                hasUnread: false,
                unreadCount: 0
            };
        }

        // Chỉ tìm trong COMMENT maps
        let conversation = this.commentMapByFBID.get(userId);
        if (!conversation) {
            conversation = this.commentMapByPSID.get(userId);
        }

        if (!conversation) {
            return {
                hasUnread: false,
                unreadCount: 0
            };
        }

        const hasUnread = conversation.seen === false && conversation.unread_count > 0;
        const unreadCount = conversation.unread_count || 0;

        return {
            hasUnread,
            unreadCount
        };
    }

    /**
     * Lấy messages chi tiết của một conversation từ Pancake API
     *
     * Official API: GET https://pages.fm/api/public_api/v1/pages/{page_id}/conversations/{conversation_id}/messages
     * Authentication: page_access_token
     *
     * @param {string} pageId - Facebook Page ID
     * @param {string} conversationId - Pancake Conversation ID
     * @param {number} currentCount - Vị trí message (optional, for pagination)
     * @param {number} customerId - Customer ID (PartnerId) - required by backend API
     * @returns {Promise<Object>} { messages: Array, conversation: Object }
     */
    async fetchMessagesForConversation(pageId, conversationId, currentCount = null, customerId = null) {
        try {
            console.log(`[PANCAKE] Fetching messages for pageId=${pageId}, conversationId=${conversationId}, customerId=${customerId}`);

            // Try to get page_access_token first (official API), fallback to access_token
            let pageToken = window.pancakeTokenManager?.getPageAccessToken(pageId);
            const userToken = await this.getToken();

            if (!pageToken && !userToken) {
                throw new Error('No Pancake token available');
            }

            // Build query string - prefer page_access_token for official API
            let queryString;
            let url;

            if (pageToken) {
                // Official API: GET /api/public_api/v1/pages/{pageId}/conversations/{conversationId}/messages
                queryString = `page_access_token=${pageToken}`;
                if (currentCount !== null) {
                    queryString += `&current_count=${currentCount}`;
                }
                url = window.API_CONFIG.buildUrl.pancakePageApi(
                    pageId,
                    `conversations/${conversationId}/messages`,
                    queryString
                );
                console.log('[PANCAKE] Using Official Page API with page_access_token');
            } else {
                // Fallback: Internal API with access_token
                queryString = `access_token=${userToken}&user_view=true&is_new_api=true&separate_pos=true`;
                if (currentCount !== null) {
                    queryString += `&current_count=${currentCount}`;
                }
                if (customerId !== null) {
                    queryString += `&customer_id=${customerId}`;
                }
                url = window.API_CONFIG.buildUrl.pancakeUserApi(
                    `pages/${pageId}/conversations/${conversationId}/messages`,
                    queryString
                );
                console.log('[PANCAKE] Using Internal API with access_token (no page_access_token)');
            }

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, 3, true); // skipFallback = true for messages

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[PANCAKE] Fetched ${data.messages?.length || 0} messages`);

            // Extract customer_id from customers array if available
            const customers = data.customers || data.conv_customers || [];
            const extractedCustomerId = customers.length > 0 ? customers[0].id : null;
            if (extractedCustomerId) {
                console.log(`[PANCAKE] ✅ Extracted customer_id from response: ${extractedCustomerId}`);
            }

            return {
                messages: data.messages || [],
                conversation: data.conversation || null,
                customers: customers,
                customerId: extractedCustomerId // Return customer_id for caller to use
            };

        } catch (error) {
            console.error('[PANCAKE] Error fetching messages:', error);
            return {
                messages: [],
                conversation: null
            };
        }
    }

    /**
     * Lấy inbox preview và conversationId cho một customer
     * Internal API (không có trong docs chính thức): GET /api/v1/pages/{pageId}/customers/{customerId}/inbox_preview
     * Authentication: access_token (User token)
     * @param {string} pageId - Facebook Page ID
     * @param {string} customerId - Customer ID (PartnerId UUID)
     * @returns {Promise<Object>} { conversationId, messages, success }
     */
    async fetchInboxPreview(pageId, customerId) {
        try {
            console.log(`[PANCAKE] Fetching inbox preview for pageId=${pageId}, customerId=${customerId}`);

            const token = await this.getToken();
            if (!token) {
                throw new Error('No Pancake token available');
            }

            // Internal API: GET /api/v1/pages/{pageId}/customers/{customerId}/inbox_preview
            const queryString = `access_token=${token}`;
            const url = window.API_CONFIG.buildUrl.pancakeUserApi(
                `pages/${pageId}/customers/${customerId}/inbox_preview`,
                queryString
            );

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, 3, true); // skipFallback = true for inbox_preview

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[PANCAKE] Inbox preview response:`, data);

            if (!data.success) {
                console.warn('[PANCAKE] ⚠️ Inbox preview API returned success=false:', data.message || 'No message');
                return {
                    conversationId: null,
                    messages: [],
                    success: false,
                    error: data.message || 'Inbox preview API returned success=false'
                };
            }

            // Extract from_id from data array (first message from customer)
            let fromId = null;
            if (data.data && data.data.length > 0) {
                const customerMessage = data.data.find(msg =>
                    msg.from && msg.from.id && msg.from.id !== pageId
                );
                if (customerMessage) {
                    fromId = customerMessage.from.id;
                }
            }
            // Fallback to from_id field if available
            if (!fromId && data.from_id) {
                fromId = data.from_id;
            }

            // Extract BOTH conversationIds from response
            // - inbox_conv_id: for INBOX messages
            // - comment_conv_id: for COMMENT replies
            const inboxConversationId = data.inbox_conv_id;
            const commentConversationId = data.comment_conv_id;

            // Default conversationId = inbox (for backwards compatibility)
            const conversationId = inboxConversationId;

            console.log(`[PANCAKE] ✅ Got conversationIds from inbox_preview:`);
            console.log(`  - inbox_conv_id: ${inboxConversationId}`);
            console.log(`  - comment_conv_id: ${commentConversationId}`);

            return {
                conversationId: conversationId,          // Default (inbox) - backwards compatible
                inboxConversationId: inboxConversationId,   // Explicit inbox conversation ID
                commentConversationId: commentConversationId, // Explicit comment conversation ID
                messages: data.data || [],
                threadId: data.thread_id_preview || data.thread_id,
                threadKey: data.thread_key_preview || data.thread_key,
                fromId: fromId,
                canInbox: data.can_inbox,
                updatedAt: data.updated_at,
                success: true
            };

        } catch (error) {
            console.error('[PANCAKE] ❌ Error fetching inbox preview:', error);
            return {
                conversationId: null,
                messages: [],
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Tìm tin nhắn cuối cùng TỪ KHÁCH (không phải từ page)
     * Dùng để kiểm tra Facebook 24-hour messaging policy
     * @param {Array} messages - Array of messages from fetchMessagesForConversation
     * @param {string} pageId - Facebook Page ID
     * @returns {Object|null} Last message from customer, or null
     */
    findLastCustomerMessage(messages, pageId) {
        if (!messages || messages.length === 0) {
            return null;
        }

        // Messages are usually sorted newest first, so iterate from start
        // Find the first message that is NOT from the page (is from customer)
        for (const msg of messages) {
            // Check if message is from customer (not from page)
            const isFromPage = msg.from?.id === pageId;
            if (!isFromPage) {
                console.log(`[DEBUG-24H] Found last customer message:`, {
                    id: msg.id,
                    from: msg.from,
                    created_time: msg.created_time,
                    inserted_at: msg.inserted_at,
                    message: msg.message?.substring(0, 50)
                });
                return msg;
            }
        }

        console.warn(`[DEBUG-24H] No customer messages found in conversation - all messages are from page!`);
        return null;
    }

    /**
     * Lấy tin nhắn cuối cùng cho order từ Pancake conversation
     * CHỈ LẤY INBOX conversations (type === "INBOX")
     * @param {Object} order - Order object
     * @returns {Object} { message, messageType, hasUnread, unreadCount, attachments, type, pageId, customerId }
     */
    getLastMessageForOrder(order) {
        const userId = order.Facebook_ASUserId;

        if (!userId) {
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                attachments: null,
                type: null
            };
        }

        // Get INBOX conversation only (check type === "INBOX")
        const userIdStr = String(userId);
        let conversation = this.inboxMapByPSID.get(userIdStr);

        if (!conversation) {
            // Try iterating if direct lookup fails
            for (const [key, value] of this.inboxMapByPSID) {
                if (String(key) === userIdStr) {
                    conversation = value;
                    break;
                }
            }
        }

        if (!conversation) {
            conversation = this.inboxMapByFBID.get(userIdStr);
            if (!conversation) {
                // Try iterating for FBID map too
                for (const [key, value] of this.inboxMapByFBID) {
                    if (String(key) === userIdStr) {
                        conversation = value;
                        break;
                    }
                }
            }
        }

        if (!conversation) {
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                attachments: null,
                type: null
            };
        }

        // Verify it's actually INBOX type (should always be true due to separate maps)
        if (conversation.type !== 'INBOX') {
            console.warn(`[PANCAKE] Found conversation but type is ${conversation.type}, expected INBOX`);
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                attachments: null,
                type: null
            };
        }

        // Extract last message from Pancake conversation
        const lastMessage = conversation.snippet || null;

        console.log(`[DEBUG-DATA] getLastMessageForOrder: Found conversation ${conversation.id} for user ${userIdStr}`);
        console.log(`[DEBUG-DATA] Snippet: "${lastMessage}", Unread: ${conversation.unread_count}`);

        // DEBUG: Log full conversation structure to understand available fields
        console.log(`[DEBUG-CONVERSATION] Full conversation object:`, conversation);

        // DEBUG: Log timestamp information for 24-hour policy diagnosis
        console.log(`[DEBUG-TIMESTAMP] Conversation updated_at: ${conversation.updated_at}`);
        console.log(`[DEBUG-TIMESTAMP] Conversation inserted_at: ${conversation.inserted_at}`);
        console.log(`[DEBUG-TIMESTAMP] Last message exists: ${!!conversation.last_message}`);

        if (conversation.last_message) {
            console.log(`[DEBUG-TIMESTAMP] Last message object:`, conversation.last_message);
            console.log(`[DEBUG-TIMESTAMP] Last message created_time: ${conversation.last_message.created_time}`);
            console.log(`[DEBUG-TIMESTAMP] Last message inserted_at: ${conversation.last_message.inserted_at}`);
            console.log(`[DEBUG-TIMESTAMP] Last message from.id: ${conversation.last_message.from?.id}`);
            console.log(`[DEBUG-TIMESTAMP] Last message from.name: ${conversation.last_message.from?.name}`);
        } else {
            console.warn(`[DEBUG-TIMESTAMP] ⚠️ conversation.last_message is NULL/UNDEFINED - Cannot determine who sent last message!`);
            console.warn(`[DEBUG-TIMESTAMP] ⚠️ This is why 24-hour check might be failing!`);
        }

        // Calculate time since last message for 24-hour policy check
        const lastMessageTime = conversation.last_message?.created_time ||
            conversation.last_message?.inserted_at ||
            conversation.updated_at;

        if (lastMessageTime) {
            const lastMsgDate = new Date(lastMessageTime);
            const now = new Date();
            const hoursSinceLastMessage = (now - lastMsgDate) / (1000 * 60 * 60);
            console.log(`[DEBUG-TIMESTAMP] Hours since last message: ${hoursSinceLastMessage.toFixed(2)}`);
            console.log(`[DEBUG-TIMESTAMP] Can send (within 24h): ${hoursSinceLastMessage < 24}`);
            console.log(`[DEBUG-TIMESTAMP] Current time: ${now.toISOString()}`);
            console.log(`[DEBUG-TIMESTAMP] Last message time: ${lastMsgDate.toISOString()}`);
        }

        // Determine message type based on attachments
        let messageType = 'text';
        let attachments = null;

        if (conversation.last_message) {
            if (conversation.last_message.attachments && conversation.last_message.attachments.length > 0) {
                attachments = conversation.last_message.attachments;
                messageType = 'attachment';
            }
        }

        // Get unread info
        const hasUnread = conversation.seen === false && conversation.unread_count > 0;
        const unreadCount = conversation.unread_count || 0;

        // Return pageId and customerId for caller to fetch conversationId from inbox_preview if needed
        const pageId = conversation.page_id;
        const customerId = conversation.customers && conversation.customers.length > 0
            ? conversation.customers[0].id
            : null;

        return {
            message: lastMessage,
            messageType,
            hasUnread,
            unreadCount,
            attachments,
            type: 'message',  // Return 'message' for consistency with UI
            pageId: pageId,
            customerId: customerId,  // Return customerId to fetch conversationId from inbox_preview
            lastMessageTime: lastMessageTime,  // Add timestamp for 24-hour policy check
            updatedAt: conversation.updated_at,
            canSendMessage: lastMessageTime ? ((new Date() - new Date(lastMessageTime)) / (1000 * 60 * 60) < 24) : false
        };
    }

    /**
     * Lấy comment cuối cùng cho order từ Pancake conversation
     * CHỈ LẤY COMMENT conversations (type === "COMMENT")
     * @param {Object} order - Order object
     * @returns {Object} { message, messageType, hasUnread, unreadCount, type }
     */
    getLastCommentForOrder(order) {
        const userId = order.Facebook_ASUserId;

        if (!userId) {
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                type: 'comment'
            };
        }

        // Get COMMENT conversation only (check type === "COMMENT")
        // Try FBID first as COMMENT usually doesn't have from_psid
        const userIdStr = String(userId);
        let conversation = this.commentMapByFBID.get(userIdStr);

        if (!conversation) {
            // Try iterating if direct lookup fails
            for (const [key, value] of this.commentMapByFBID) {
                if (String(key) === userIdStr) {
                    conversation = value;
                    break;
                }
            }
        }

        if (!conversation) {
            conversation = this.commentMapByPSID.get(userIdStr);
            if (!conversation) {
                // Try iterating for PSID map too
                for (const [key, value] of this.commentMapByPSID) {
                    if (String(key) === userIdStr) {
                        conversation = value;
                        break;
                    }
                }
            }
        }

        if (!conversation) {
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                type: 'comment'
            };
        }

        // Verify it's actually COMMENT type (should always be true due to separate maps)
        if (conversation.type !== 'COMMENT') {
            console.warn(`[PANCAKE] Found conversation but type is ${conversation.type}, expected COMMENT`);
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                type: 'comment'
            };
        }

        // Extract last comment
        const lastMessage = conversation.snippet || null;
        const messageType = 'text';

        // Get unread info
        const hasUnread = conversation.seen === false && conversation.unread_count > 0;
        const unreadCount = conversation.unread_count || 0;

        // Use conversation.id directly from Pancake API
        // Do NOT construct conversationId manually as Pancake uses complex format
        const conversationId = conversation.id;

        return {
            message: lastMessage,
            messageType,
            hasUnread,
            unreadCount,
            type: 'comment',
            conversationId: conversationId,
            pageId: conversation.page_id
        };
    }

    /**
     * Kiểm tra 24-hour messaging window cho một conversation
     * Fetch messages và tìm tin nhắn cuối từ KHÁCH (không phải từ page)
     * @param {string} pageId - Facebook Page ID
     * @param {string} conversationId - Conversation ID
     * @param {number} customerId - Customer ID (PartnerId) - required by backend API
     * @returns {Promise<Object>} { canSend: boolean, hoursSinceLastMessage: number, lastCustomerMessage: Object|null }
     */
    async check24HourWindow(pageId, conversationId, customerId = null) {
        try {
            console.log(`[DEBUG-24H] Checking 24-hour window for pageId=${pageId}, conversationId=${conversationId}, customerId=${customerId}`);

            // Fetch messages for this conversation
            const { messages } = await this.fetchMessagesForConversation(pageId, conversationId, null, customerId);

            if (!messages || messages.length === 0) {
                console.warn(`[DEBUG-24H] Cannot fetch messages - skipping 24h check (allow send)`);
                // FIX: Don't block user if API fails - let Facebook API handle 24h validation
                // Return canSend: true to avoid blocking user experience
                return {
                    canSend: true,  // Changed from false to true
                    hoursSinceLastMessage: null,
                    lastCustomerMessage: null,
                    reason: 'Cannot verify 24-hour window - API unavailable (proceeding anyway)'
                };
            }

            // Find last message FROM customer (not from page)
            const lastCustomerMsg = this.findLastCustomerMessage(messages, pageId);

            if (!lastCustomerMsg) {
                console.warn(`[DEBUG-24H] No customer messages found - all messages are from page (allow send)`);
                // FIX: Don't block user - let Facebook API handle validation
                return {
                    canSend: true,  // Changed from false to true
                    hoursSinceLastMessage: null,
                    lastCustomerMessage: null,
                    reason: 'No customer messages found - cannot verify 24-hour window (proceeding anyway)'
                };
            }

            // Calculate time since last customer message
            const lastMsgTime = lastCustomerMsg.created_time || lastCustomerMsg.inserted_at;
            if (!lastMsgTime) {
                console.warn(`[DEBUG-24H] Last customer message has no timestamp (allow send)`);
                // FIX: Don't block user - let Facebook API handle validation
                return {
                    canSend: true,  // Changed from false to true
                    hoursSinceLastMessage: null,
                    lastCustomerMessage: lastCustomerMsg,
                    reason: 'Cannot determine message timestamp (proceeding anyway)'
                };
            }

            const lastMsgDate = new Date(lastMsgTime);
            const now = new Date();
            const hoursSinceLastMessage = (now - lastMsgDate) / (1000 * 60 * 60);
            const canSend = hoursSinceLastMessage < 24;

            console.log(`[DEBUG-24H] ✅ Analysis complete:`, {
                lastMessageTime: lastMsgDate.toISOString(),
                currentTime: now.toISOString(),
                hoursSinceLastMessage: hoursSinceLastMessage.toFixed(2),
                canSend,
                customerName: lastCustomerMsg.from?.name
            });

            return {
                canSend,
                hoursSinceLastMessage: parseFloat(hoursSinceLastMessage.toFixed(2)),
                lastCustomerMessage: lastCustomerMsg,
                lastMessageTime: lastMsgDate.toISOString(),
                reason: canSend ? 'Within 24-hour window' : `24-hour window expired (${hoursSinceLastMessage.toFixed(1)} hours ago)`
            };

        } catch (error) {
            console.error(`[DEBUG-24H] Error checking 24-hour window:`, error);
            // FIX: Don't block user on error - let Facebook API handle validation
            return {
                canSend: true,  // Changed from false to true
                hoursSinceLastMessage: null,
                lastCustomerMessage: null,
                reason: `Error checking 24h window (proceeding anyway): ${error.message}`
            };
        }
    }

    /**
     * Parse channelId từ Facebook_PostId
     * Format: pageId_postId_... -> lấy pageId (đầu tiên)
     * @param {string} facebookPostId - Facebook Post ID
     * @returns {string|null}
     */
    parseChannelId(facebookPostId) {
        if (!facebookPostId) return null;
        // Format: pageId_postId hoặc pageId_postId_xxx
        const parts = facebookPostId.split('_');
        return parts[0] || null;
    }

    /**
     * Lấy thông tin chat cho một order (channelId, psid, hasChat)
     * @param {Object} order - Order object
     * @returns {Object} { channelId, psid, hasChat }
     */
    getChatInfoForOrder(order) {
        if (!order) {
            return { channelId: null, psid: null, hasChat: false };
        }

        const psid = order.Facebook_ASUserId || null;
        const channelId = this.parseChannelId(order.Facebook_PostId);
        const hasChat = !!(psid && channelId);

        return {
            channelId,
            psid,
            hasChat
        };
    }

    /**
     * Lấy tin nhắn cuối cùng cho một order (INBOX only)
     * @param {Object} order - Order object
     * @returns {Object} { message, hasUnread, unreadCount, attachments }
     */
    getLastMessageForOrder(order) {
        if (!order || !order.Facebook_ASUserId) {
            return {
                message: '',
                hasUnread: false,
                unreadCount: 0,
                attachments: []
            };
        }

        // Find conversation in INBOX map
        const userId = order.Facebook_ASUserId;
        let conversation = this.inboxMapByPSID.get(userId);
        if (!conversation) {
            conversation = this.inboxMapByFBID.get(userId);
        }

        if (!conversation) {
            return {
                message: '',
                hasUnread: false,
                unreadCount: 0,
                attachments: []
            };
        }

        // Extract last message info from conversation
        const lastMessage = conversation.last_message || conversation.snippet || '';
        const hasUnread = conversation.seen === false && conversation.unread_count > 0;
        const unreadCount = conversation.unread_count || 0;

        // Check for attachments in last message
        let attachments = [];
        if (conversation.last_message_attachments) {
            attachments = conversation.last_message_attachments;
        }

        return {
            message: lastMessage,
            hasUnread,
            unreadCount,
            attachments
        };
    }

    /**
     * Lấy bình luận cuối cùng cho một order (COMMENT only)
     * @param {string} channelId - Page ID
     * @param {string} psid - Customer PSID
     * @param {Object} order - Order object
     * @returns {Object} { message, hasUnread, unreadCount, attachments }
     */
    getLastCommentForOrder(channelId, psid, order) {
        if (!order || !order.Facebook_ASUserId) {
            return {
                message: '',
                hasUnread: false,
                unreadCount: 0,
                attachments: []
            };
        }

        // Find conversation in COMMENT map
        const userId = order.Facebook_ASUserId;
        let conversation = this.commentMapByFBID.get(userId);
        if (!conversation) {
            conversation = this.commentMapByPSID.get(userId);
        }
        // Also try customers fb_id map for COMMENT type
        if (!conversation) {
            conversation = this.conversationsByCustomerFbId.get(userId);
            // Make sure it's a COMMENT type
            if (conversation && conversation.type !== 'COMMENT') {
                conversation = null;
            }
        }

        if (!conversation) {
            return {
                message: '',
                hasUnread: false,
                unreadCount: 0,
                attachments: []
            };
        }

        // Extract last comment info
        const lastMessage = conversation.last_message || conversation.snippet || '';
        const hasUnread = conversation.seen === false && conversation.unread_count > 0;
        const unreadCount = conversation.unread_count || 0;

        return {
            message: lastMessage,
            hasUnread,
            unreadCount,
            attachments: []
        };
    }

    /**
     * Wrapper function for fetchMessages - tương thích với tab1-orders.js
     * @param {string} pageId - Page ID (channelId)
     * @param {string} psid - Customer PSID  
     * @param {string} conversationId - Optional conversation ID (passed from caller)
     * @param {string} customerId - Optional customer UUID (passed from caller)
     * @returns {Promise<Object>} { messages, conversation }
     */
    async fetchMessages(pageId, psid, conversationId = null, customerId = null) {
        try {
            console.log(`[PANCAKE] fetchMessages called: pageId=${pageId}, psid=${psid}, convId=${conversationId}, customerId=${customerId}`);

            // Use passed conversationId or try to find from conversation map
            let convId = conversationId;
            let custId = customerId;

            // Try to find conversation in cache
            const cachedConv = this.inboxMapByPSID.get(psid) || this.inboxMapByFBID.get(psid);

            if (cachedConv) {
                if (!convId) convId = cachedConv.id;
                if (!custId) custId = cachedConv.customers?.[0]?.id || null;
                console.log('[PANCAKE] Found conversation in cache:', convId, 'customerId:', custId);
            }

            // CRITICAL: Nếu không có customer_id, cần tìm conversation để lấy
            // Vì Pancake API yêu cầu customer_id cho endpoint messages
            if (!custId) {
                console.log('[PANCAKE] No customer_id in cache, searching for conversation...');

                // Tìm trong tất cả conversations đã load
                const matchingConv = this.conversations.find(conv =>
                    conv.type === 'INBOX' &&
                    conv.page_id === pageId &&
                    (conv.from_psid === psid || conv.from?.id === psid)
                );

                if (matchingConv) {
                    if (!convId) convId = matchingConv.id;
                    custId = matchingConv.customers?.[0]?.id || null;
                    console.log('[PANCAKE] ✅ Found in conversations array:', convId, 'customerId:', custId);
                }
            }

            // Nếu vẫn không có convId, dùng format mặc định
            if (!convId) {
                convId = `${pageId}_${psid}`;
                console.log('[PANCAKE] Using default conversationId format:', convId);
            }

            // Fallback: Nếu vẫn không có customer_id, fetch conversation info từ API
            if (!custId) {
                console.log('[PANCAKE] Still no customer_id, fetching conversation info from API...');
                try {
                    const token = await this.getToken();
                    // Only fetch if token is available
                    if (token) {
                        const convInfoUrl = window.API_CONFIG.buildUrl.pancake(
                            `pages/${pageId}/conversations/${convId}`,
                            `access_token=${token}`
                        );
                        const convResponse = await API_CONFIG.smartFetch(convInfoUrl, { method: 'GET' }, 2, true);
                        if (convResponse.ok) {
                            const convData = await convResponse.json();
                            custId = convData.customers?.[0]?.id || convData.conversation?.customers?.[0]?.id || null;
                            if (custId) {
                                console.log('[PANCAKE] ✅ Got customer_id from API:', custId);
                            }
                        }
                    } else {
                        console.warn('[PANCAKE] ⚠️ No token available for customer_id fallback lookup');
                    }
                } catch (convError) {
                    console.warn('[PANCAKE] Could not fetch conversation info:', convError.message);
                }
            }

            const result = await this.fetchMessagesForConversation(pageId, convId, null, custId);
            // Trả về thêm conversationId và customerId để caller có thể update state
            return {
                ...result,
                conversationId: convId,
                customerId: result.customerId || custId
            };
        } catch (error) {
            console.error('[PANCAKE] Error in fetchMessages:', error);
            return { messages: [], conversation: null, conversationId: null, customerId: null };
        }
    }

    /**
     * Wrapper function for fetchComments - tương thích với tab1-orders.js
     * @param {string} pageId - Page ID (channelId)
     * @param {string} psid - Customer PSID
     * @param {string} conversationId - Optional conversation ID
     * @param {string} postId - Optional Facebook Post ID for matching
     * @param {string} customerName - Optional customer name for searching
     * @returns {Promise<Object>} { messages, conversation }
     */
    async fetchComments(pageId, psid, conversationId = null, postId = null, customerName = null) {
        try {
            console.log(`[PANCAKE] fetchComments called: pageId=${pageId}, psid=${psid}, convId=${conversationId}, postId=${postId}`);

            // For comments, find conversation in COMMENT map
            let convId = conversationId;
            let customerId = null;

            // CRITICAL: Khi có postId, PHẢI tìm conversation match cả fb_id VÀ post_id
            // Vì cùng 1 khách hàng có thể comment trên NHIỀU post khác nhau
            if (!convId && postId) {
                console.log('[PANCAKE] Looking for conversation matching BOTH psid AND postId');

                // Bước 1: Tìm trong conversations đã load (memory)
                const matchingConvInMemory = this.conversations.find(conv =>
                    conv.type === 'COMMENT' &&
                    conv.post_id === postId &&
                    (conv.from?.id === psid ||
                     conv.from_psid === psid ||
                     conv.customers?.some(c => c.fb_id === psid))
                );

                if (matchingConvInMemory) {
                    convId = matchingConvInMemory.id;
                    customerId = matchingConvInMemory.customers?.[0]?.id || null;
                    console.log('[PANCAKE] ✅ Found in memory - conversation matching psid AND postId:', convId);
                }

                // Bước 2: Nếu không tìm thấy trong memory, search API
                if (!convId && customerName) {
                    console.log('[PANCAKE] Not found in memory, searching API by customerName:', customerName);
                    try {
                        const searchResult = await this.searchConversations(customerName);
                        if (searchResult.conversations && searchResult.conversations.length > 0) {
                            console.log('[PANCAKE] Search returned', searchResult.conversations.length, 'conversations');

                            // Debug: log all COMMENT conversations with their post_ids
                            const commentConvs = searchResult.conversations.filter(c => c.type === 'COMMENT');
                            console.log('[PANCAKE] COMMENT conversations from search:', commentConvs.map(c => ({
                                id: c.id,
                                post_id: c.post_id,
                                from_id: c.from?.id,
                                customer_fb_id: c.customers?.[0]?.fb_id
                            })));

                            // Find conversation matching BOTH post_id AND fb_id/psid
                            const matchingConv = searchResult.conversations.find(c =>
                                c.type === 'COMMENT' &&
                                c.post_id === postId &&
                                (c.from?.id === psid ||
                                 c.from_psid === psid ||
                                 c.customers?.some(cust => cust.fb_id === psid))
                            );

                            if (matchingConv) {
                                convId = matchingConv.id;
                                customerId = matchingConv.customers?.[0]?.id || null;
                                console.log('[PANCAKE] ✅ Found via search - conversation matching psid AND postId:', convId, 'customerId:', customerId);
                            } else {
                                // Fallback: chỉ match post_id nếu không tìm thấy exact match
                                const postOnlyMatch = searchResult.conversations.find(c =>
                                    c.type === 'COMMENT' && c.post_id === postId
                                );
                                if (postOnlyMatch) {
                                    convId = postOnlyMatch.id;
                                    customerId = postOnlyMatch.customers?.[0]?.id || null;
                                    console.log('[PANCAKE] ⚠️ Fallback: Found conversation by postId only:', convId);
                                } else {
                                    console.log('[PANCAKE] ⚠️ No conversation matched postId:', postId);
                                }
                            }
                        }
                    } catch (searchError) {
                        console.error('[PANCAKE] Error searching by postId:', searchError);
                    }
                }
            }

            // Fallback khi KHÔNG có postId: dùng cache như cũ
            if (!convId && !postId) {
                // Try cache first
                const conv = this.commentMapByFBID.get(psid) || this.commentMapByPSID.get(psid);
                if (conv) {
                    convId = conv.id;
                    customerId = conv.customers?.[0]?.id || null;
                    console.log('[PANCAKE] Found conversation in cache (no postId):', convId);
                } else {
                    // Fallback: use customers fb_id map
                    const customerConv = this.conversationsByCustomerFbId.get(psid);
                    if (customerConv && customerConv.type === 'COMMENT') {
                        convId = customerConv.id;
                        customerId = customerConv.customers?.[0]?.id || null;
                    }
                }
            }

            if (!convId) {
                console.log('[PANCAKE] No comment conversation found for PSID:', psid, 'postId:', postId);
                return { comments: [], messages: [], conversation: null };
            }

            const result = await this.fetchMessagesForConversation(pageId, convId, null, customerId);

            // Map messages to comments format for comment-modal.js compatibility
            const comments = (result.messages || []).map(msg => ({
                Id: msg.id,
                Message: msg.original_message || msg.message?.replace(/<[^>]*>/g, '') || '', // Strip HTML tags
                CreatedTime: msg.inserted_at,
                IsOwner: msg.from?.id === pageId, // Check if from page
                PostId: msg.page_id ? `${msg.page_id}_${msg.parent_id?.split('_')[0] || ''}` : null,
                ParentId: msg.parent_id !== msg.id ? msg.parent_id : null,
                FacebookId: msg.id,
                Attachments: msg.attachments || [],
                Status: msg.seen ? 10 : 30, // 30 = New, 10 = Seen
                from: msg.from
            }));

            console.log('[PANCAKE] Mapped', comments.length, 'comments from messages');

            return {
                comments: comments,
                messages: result.messages,
                conversation: result.conversation,
                customers: result.customers,
                customerId: result.customerId, // Return customer_id for caller to use
                after: null // Pagination cursor if needed
            };
        } catch (error) {
            console.error('[PANCAKE] Error in fetchComments:', error);
            return { comments: [], messages: [], conversation: null };
        }
    }

    /**
     * Lấy Facebook page access token từ cache
     * @param {string} pageId - Facebook Page ID
     * @returns {Promise<string|null>} Facebook Page access token
     */
    async getPageToken(pageId) {
        try {
            // Ensure pages are loaded
            if (this.pages.length === 0) {
                await this.fetchPages();
            }

            // Debug: log all pages to see structure
            console.log('[PANCAKE] Looking for pageId:', pageId);
            console.log('[PANCAKE] Available pages:', this.pages.map(p => ({
                id: p.id,
                fb_page_id: p.fb_page_id,
                page_id: p.page_id,
                name: p.name,
                hasToken: !!p.access_token
            })));

            // Find page in cache - try multiple field names
            const page = this.pages.find(p =>
                p.fb_page_id === pageId ||
                p.id === pageId ||
                p.page_id === pageId ||
                String(p.fb_page_id) === String(pageId) ||
                String(p.id) === String(pageId)
            );

            if (page) {
                console.log('[PANCAKE] Found page:', page);
                if (page.access_token) {
                    console.log('[PANCAKE] ✅ Found page token for pageId:', pageId);
                    return page.access_token;
                }
            }

            console.warn('[PANCAKE] ⚠️ No page token found for pageId:', pageId);
            return null;
        } catch (error) {
            console.error('[PANCAKE] Error getting page token:', error);
            return null;
        }
    }

    /**
     * Mark conversation as read (tương tự TPOS)
     * Note: Pancake không có API public để mark as read từ ngoài,
     * chỉ để placeholder cho tương thích
     * @param {string} userId - Facebook User ID
     * @returns {Promise<boolean>}
     */
    async markAsSeen(userId) {
        console.warn('[PANCAKE] markAsSeen is not implemented - Pancake does not have public API for this');
        return false;
    }

    /**
     * Initialize - load token và fetch data
     * @returns {Promise<boolean>}
     */
    async initialize() {
        try {
            console.log('[PANCAKE] Initializing...');

            // Try to get token (must await since getToken is async)
            const token = await this.getToken();
            if (!token) {
                console.warn('[PANCAKE] ⚠️ Cannot initialize - no JWT token. Please login to Pancake.vn or set token in settings.');
                // Continue anyway to allow page loading without Pancake
            }

            // Fetch pages and conversations
            await this.fetchPages();
            await this.fetchConversations();

            console.log('[PANCAKE] ✅ Initialized successfully');
            return true;

        } catch (error) {
            console.error('[PANCAKE] ❌ Error initializing:', error);
            return false;
        }
    }
    /**
     * Calculate SHA-1 hash of a file
     * @param {File} file 
     * @returns {Promise<string>}
     */
    async calculateSHA1(file) {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    /**
     * Upload image to Pancake API
     * Official API: POST https://pages.fm/api/public_api/v1/pages/{page_id}/upload_contents
     * Authentication: page_access_token
     * Content-Type: multipart/form-data
     * @param {string} pageId
     * @param {File} file
     * @returns {Promise<{content_url: string, id: string, attachment_type: string}>}
     */
    async uploadImage(pageId, file) {
        try {
            console.log(`[PANCAKE] Uploading image: ${file.name}, size: ${file.size}`);

            // Try page_access_token first (official), fallback to access_token
            let pageToken = window.pancakeTokenManager?.getPageAccessToken(pageId);
            const userToken = await this.getToken();

            if (!pageToken && !userToken) {
                throw new Error('No Pancake token available');
            }

            let url;
            if (pageToken) {
                // Official API: POST /api/public_api/v1/pages/{pageId}/upload_contents
                url = window.API_CONFIG.buildUrl.pancakePageApi(
                    pageId,
                    'upload_contents',
                    `page_access_token=${pageToken}`
                );
                console.log('[PANCAKE] Using Official Page API for upload');
            } else {
                // Fallback: Internal API with access_token
                url = window.API_CONFIG.buildUrl.pancakeUserApi(
                    `pages/${pageId}/upload_contents`,
                    `access_token=${userToken}`
                );
                console.log('[PANCAKE] Using Internal API for upload (no page_access_token)');
            }

            const formData = new FormData();
            formData.append('file', file);

            console.log('[PANCAKE] Uploading to:', url);
            const response = await API_CONFIG.smartFetch(url, {
                method: 'POST',
                body: formData
            }, 3, true); // skipFallback = true for image upload

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] Upload response:', data);

            // Extract content_id và content_url từ response
            const result = {
                content_url: data.content_url || data.url || null,
                content_id: data.id || data.content_id || null,
                id: data.id || data.content_id || null  // Alias for compatibility
            };

            if (!result.content_id && !result.content_url) {
                console.warn('[PANCAKE] Upload response missing id/url, returning full data');
                return data;
            }

            console.log('[PANCAKE] ✅ Upload success:', result);
            return result;

        } catch (error) {
            console.error('[PANCAKE] ❌ Error uploading image:', error);
            throw error;
        }
    }

    /**
     * Xóa ảnh trên Pancake server
     * Internal API (không có trong docs chính thức): DELETE /api/v1/pages/{pageId}/contents
     * @param {string} pageId - Facebook Page ID
     * @param {string} contentId - ID của ảnh (content ID)
     * @returns {Promise<boolean>}
     */
    async deleteImage(pageId, contentId) {
        try {
            console.log(`[PANCAKE] Deleting image ID: ${contentId} on page ${pageId}`);

            if (!contentId) {
                console.warn('[PANCAKE] No contentId provided for deletion');
                return false;
            }

            const token = await this.getToken();
            if (!token) throw new Error('No Pancake token available');

            // Internal API: DELETE /api/v1/pages/{pageId}/contents
            const url = window.API_CONFIG.buildUrl.pancakeUserApi(
                `pages/${pageId}/contents`,
                `ids=${contentId}&access_token=${token}`
            );

            const response = await API_CONFIG.smartFetch(url, {
                method: 'DELETE',
                headers: {
                    'accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }, 3, true); // skipFallback = true for image delete

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[PANCAKE] Delete failed: ${response.status} ${response.statusText}`, errorText);
                return false;
            }

            const data = await response.json();
            console.log('[PANCAKE] Delete response:', data);

            return data.success || false;

        } catch (error) {
            console.error('[PANCAKE] ❌ Error deleting image:', error);
            return false;
        }
    }

    // =====================================================
    // OFFICIAL PANCAKE API METHODS (theo documentation)
    // Dùng page_access_token cho Page API
    // =====================================================

    /**
     * Lấy conversations cho một page (Official API v2)
     * GET https://pages.fm/api/public_api/v2/pages/{page_id}/conversations
     * Authentication: page_access_token
     * @param {string} pageId - Facebook Page ID
     * @param {Object} options - Filter options
     * @param {string} options.lastConversationId - ID conversation cuối để phân trang
     * @param {string} options.tags - Filter theo tag IDs (comma-separated)
     * @param {Array} options.type - Filter theo loại: 'INBOX', 'COMMENT'
     * @param {number} options.since - Filter từ timestamp (seconds)
     * @param {number} options.until - Filter đến timestamp (seconds)
     * @param {boolean} options.unreadFirst - Ưu tiên conversations chưa đọc
     * @param {string} options.orderBy - 'inserted_at' hoặc 'updated_at'
     * @returns {Promise<Array>} conversations (max 60 per request)
     */
    async fetchConversationsForPage(pageId, options = {}) {
        try {
            const pageToken = window.pancakeTokenManager?.getPageAccessToken(pageId);
            if (!pageToken) {
                console.warn(`[PANCAKE] No page_access_token for page ${pageId}, falling back to internal API`);
                // Fallback to internal multi-page API
                return this.conversations.filter(c => c.page_id === pageId);
            }

            console.log(`[PANCAKE] Fetching conversations for page ${pageId} via Official API v2...`);

            // Build query params
            const params = new URLSearchParams();
            params.set('page_access_token', pageToken);

            if (options.lastConversationId) params.set('last_conversation_id', options.lastConversationId);
            if (options.tags) params.set('tags', options.tags);
            if (options.type) params.set('type', options.type.join(','));
            if (options.since) params.set('since', options.since);
            if (options.until) params.set('until', options.until);
            if (options.unreadFirst) params.set('unread_first', 'true');
            if (options.orderBy) params.set('order_by', options.orderBy);

            const url = window.API_CONFIG.buildUrl.pancakePageApiV2(pageId, 'conversations', params.toString());

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            }, 3, true);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[PANCAKE] ✅ Fetched ${data.conversations?.length || 0} conversations for page ${pageId}`);
            return data.conversations || [];

        } catch (error) {
            console.error(`[PANCAKE] ❌ Error fetching conversations for page ${pageId}:`, error);
            return [];
        }
    }

    /**
     * Lấy danh sách Tags của một page (Official API)
     * GET https://pages.fm/api/public_api/v1/pages/{page_id}/tags
     * Authentication: page_access_token
     * @param {string} pageId - Facebook Page ID
     * @returns {Promise<Array>} tags
     */
    async fetchTags(pageId) {
        try {
            const pageToken = window.pancakeTokenManager?.getPageAccessToken(pageId);
            const userToken = await this.getToken();

            if (!pageToken && !userToken) {
                throw new Error('No Pancake token available');
            }

            let url;
            if (pageToken) {
                url = window.API_CONFIG.buildUrl.pancakePageApi(pageId, 'tags', `page_access_token=${pageToken}`);
                console.log('[PANCAKE] Fetching tags via Official Page API...');
            } else {
                url = window.API_CONFIG.buildUrl.pancakeUserApi(`pages/${pageId}/tags`, `access_token=${userToken}`);
                console.log('[PANCAKE] Fetching tags via Internal API...');
            }

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            }, 3, true);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[PANCAKE] ✅ Fetched ${data.tags?.length || 0} tags`);
            return data.tags || [];

        } catch (error) {
            console.error('[PANCAKE] ❌ Error fetching tags:', error);
            return [];
        }
    }

    /**
     * Lấy danh sách Posts của một page (Official API)
     * GET https://pages.fm/api/public_api/v1/pages/{page_id}/posts
     * Authentication: page_access_token
     * @param {string} pageId - Facebook Page ID
     * @param {Object} options - Filter options
     * @param {number} options.since - Start time (Unix timestamp UTC+0)
     * @param {number} options.until - End time (Unix timestamp UTC+0)
     * @param {number} options.pageNumber - Số trang (minimum: 1)
     * @param {number} options.pageSize - Số records/trang (maximum: 30)
     * @param {string} options.type - 'video', 'photo', 'text', 'livestream'
     * @returns {Promise<Object>} { total, posts }
     */
    async fetchPosts(pageId, options = {}) {
        try {
            const pageToken = window.pancakeTokenManager?.getPageAccessToken(pageId);
            const userToken = await this.getToken();

            if (!pageToken && !userToken) {
                throw new Error('No Pancake token available');
            }

            // Build query params
            const params = new URLSearchParams();
            if (pageToken) {
                params.set('page_access_token', pageToken);
            } else {
                params.set('access_token', userToken);
            }

            // Required params
            params.set('since', options.since || Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)); // Default: 30 days ago
            params.set('until', options.until || Math.floor(Date.now() / 1000)); // Default: now
            params.set('page_number', options.pageNumber || 1);
            params.set('page_size', options.pageSize || 30);

            if (options.type) params.set('type', options.type);

            let url;
            if (pageToken) {
                url = window.API_CONFIG.buildUrl.pancakePageApi(pageId, 'posts', params.toString());
                console.log('[PANCAKE] Fetching posts via Official Page API...');
            } else {
                url = window.API_CONFIG.buildUrl.pancakeUserApi(`pages/${pageId}/posts`, params.toString());
                console.log('[PANCAKE] Fetching posts via Internal API...');
            }

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            }, 3, true);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[PANCAKE] ✅ Fetched ${data.posts?.length || 0} posts (total: ${data.total || 0})`);
            return { total: data.total || 0, posts: data.posts || [] };

        } catch (error) {
            console.error('[PANCAKE] ❌ Error fetching posts:', error);
            return { total: 0, posts: [] };
        }
    }

    /**
     * Lấy danh sách Customers của một page (Official API)
     * GET https://pages.fm/api/public_api/v1/pages/{page_id}/page_customers
     * Authentication: page_access_token
     * @param {string} pageId - Facebook Page ID
     * @param {Object} options - Filter options
     * @param {number} options.since - Start time (Unix timestamp UTC+0)
     * @param {number} options.until - End time (Unix timestamp UTC+0)
     * @param {number} options.pageNumber - Số trang (minimum: 1)
     * @param {number} options.pageSize - Số records/trang (maximum: 100)
     * @param {string} options.orderBy - 'inserted_at' hoặc 'updated_at'
     * @returns {Promise<Object>} { total, customers }
     */
    async fetchCustomers(pageId, options = {}) {
        try {
            const pageToken = window.pancakeTokenManager?.getPageAccessToken(pageId);
            const userToken = await this.getToken();

            if (!pageToken && !userToken) {
                throw new Error('No Pancake token available');
            }

            // Build query params
            const params = new URLSearchParams();
            if (pageToken) {
                params.set('page_access_token', pageToken);
            } else {
                params.set('access_token', userToken);
            }

            // Required params
            params.set('since', options.since || Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000));
            params.set('until', options.until || Math.floor(Date.now() / 1000));
            params.set('page_number', options.pageNumber || 1);
            params.set('page_size', Math.min(options.pageSize || 100, 100)); // Max 100

            if (options.orderBy) params.set('order_by', options.orderBy);

            let url;
            if (pageToken) {
                url = window.API_CONFIG.buildUrl.pancakePageApi(pageId, 'page_customers', params.toString());
                console.log('[PANCAKE] Fetching customers via Official Page API...');
            } else {
                url = window.API_CONFIG.buildUrl.pancakeUserApi(`pages/${pageId}/page_customers`, params.toString());
                console.log('[PANCAKE] Fetching customers via Internal API...');
            }

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            }, 3, true);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[PANCAKE] ✅ Fetched ${data.customers?.length || 0} customers (total: ${data.total || 0})`);
            return { total: data.total || 0, customers: data.customers || [] };

        } catch (error) {
            console.error('[PANCAKE] ❌ Error fetching customers:', error);
            return { total: 0, customers: [] };
        }
    }

    /**
     * Lấy danh sách Users (nhân viên) của một page (Official API)
     * GET https://pages.fm/api/public_api/v1/pages/{page_id}/users
     * Authentication: page_access_token
     * @param {string} pageId - Facebook Page ID
     * @returns {Promise<Object>} { users, disabled_users, round_robin_users }
     */
    async fetchUsers(pageId) {
        try {
            const pageToken = window.pancakeTokenManager?.getPageAccessToken(pageId);
            const userToken = await this.getToken();

            if (!pageToken && !userToken) {
                throw new Error('No Pancake token available');
            }

            let url;
            if (pageToken) {
                url = window.API_CONFIG.buildUrl.pancakePageApi(pageId, 'users', `page_access_token=${pageToken}`);
                console.log('[PANCAKE] Fetching users via Official Page API...');
            } else {
                url = window.API_CONFIG.buildUrl.pancakeUserApi(`pages/${pageId}/users`, `access_token=${userToken}`);
                console.log('[PANCAKE] Fetching users via Internal API...');
            }

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            }, 3, true);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[PANCAKE] ✅ Fetched ${data.users?.length || 0} users`);
            return {
                users: data.users || [],
                disabledUsers: data.disabled_users || [],
                roundRobinUsers: data.round_robin_users || {}
            };

        } catch (error) {
            console.error('[PANCAKE] ❌ Error fetching users:', error);
            return { users: [], disabledUsers: [], roundRobinUsers: {} };
        }
    }

    /**
     * Gửi tin nhắn (Official API)
     * POST https://pages.fm/api/public_api/v1/pages/{page_id}/conversations/{conversation_id}/messages
     * Authentication: page_access_token
     * @param {string} pageId - Facebook Page ID
     * @param {string} conversationId - Conversation ID
     * @param {Object} messageData - Message data
     * @param {string} messageData.action - 'reply_inbox', 'reply_comment', 'private_replies'
     * @param {string} messageData.message - Nội dung tin nhắn
     * @param {Array} messageData.contentIds - Content IDs từ upload API (optional)
     * @param {string} messageData.attachmentType - 'PHOTO', 'VIDEO', 'DOCUMENT' (optional)
     * @param {string} messageData.messageId - ID comment cần reply (cho reply_comment)
     * @param {string} messageData.postId - Post ID (cho private_replies)
     * @param {string} messageData.fromId - Sender ID (cho private_replies)
     * @returns {Promise<Object>} { success, id, message }
     */
    async sendMessage(pageId, conversationId, messageData) {
        try {
            const pageToken = window.pancakeTokenManager?.getPageAccessToken(pageId);
            const userToken = await this.getToken();

            if (!pageToken && !userToken) {
                throw new Error('No Pancake token available');
            }

            let url;
            if (pageToken) {
                url = window.API_CONFIG.buildUrl.pancakePageApi(
                    pageId,
                    `conversations/${conversationId}/messages`,
                    `page_access_token=${pageToken}`
                );
                console.log('[PANCAKE] Sending message via Official Page API...');
            } else {
                url = window.API_CONFIG.buildUrl.pancakeUserApi(
                    `pages/${pageId}/conversations/${conversationId}/messages`,
                    `access_token=${userToken}`
                );
                console.log('[PANCAKE] Sending message via Internal API...');
            }

            // Build request body based on action type
            const body = {
                action: messageData.action || 'reply_inbox',
                message: messageData.message
            };

            // Add optional fields based on action type
            if (messageData.contentIds && messageData.contentIds.length > 0) {
                body.content_ids = messageData.contentIds;
                body.attachment_type = messageData.attachmentType || 'PHOTO';
            }

            if (messageData.action === 'reply_comment' && messageData.messageId) {
                body.message_id = messageData.messageId;
                if (messageData.contentUrl) body.content_url = messageData.contentUrl;
            }

            if (messageData.action === 'private_replies') {
                body.post_id = messageData.postId;
                body.message_id = messageData.messageId;
                body.from_id = messageData.fromId;
            }

            const response = await API_CONFIG.smartFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }, 3, true);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] ✅ Message sent:', data);
            return data;

        } catch (error) {
            console.error('[PANCAKE] ❌ Error sending message:', error);
            throw error;
        }
    }

    /**
     * Thêm/Xóa tag cho conversation (Official API)
     * POST https://pages.fm/api/public_api/v1/pages/{page_id}/conversations/{conversation_id}/tags
     * Authentication: page_access_token
     * @param {string} pageId - Facebook Page ID
     * @param {string} conversationId - Conversation ID
     * @param {string} tagId - Tag ID
     * @param {string} action - 'add' hoặc 'remove'
     * @returns {Promise<Object>}
     */
    async updateConversationTag(pageId, conversationId, tagId, action = 'add') {
        try {
            const pageToken = window.pancakeTokenManager?.getPageAccessToken(pageId);
            const userToken = await this.getToken();

            if (!pageToken && !userToken) {
                throw new Error('No Pancake token available');
            }

            let url;
            if (pageToken) {
                url = window.API_CONFIG.buildUrl.pancakePageApi(
                    pageId,
                    `conversations/${conversationId}/tags`,
                    `page_access_token=${pageToken}`
                );
            } else {
                url = window.API_CONFIG.buildUrl.pancakeUserApi(
                    `pages/${pageId}/conversations/${conversationId}/tags`,
                    `access_token=${userToken}`
                );
            }

            const response = await API_CONFIG.smartFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, tag_id: tagId })
            }, 3, true);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[PANCAKE] ✅ Tag ${action}ed:`, data);
            return data;

        } catch (error) {
            console.error(`[PANCAKE] ❌ Error ${action}ing tag:`, error);
            throw error;
        }
    }

    /**
     * Mark conversation as read (Official API)
     * POST https://pages.fm/api/public_api/v1/pages/{page_id}/conversations/{conversation_id}/read
     * Authentication: page_access_token
     * @param {string} pageId - Facebook Page ID
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<boolean>}
     */
    async markConversationAsRead(pageId, conversationId) {
        try {
            const pageToken = window.pancakeTokenManager?.getPageAccessToken(pageId);
            const userToken = await this.getToken();

            if (!pageToken && !userToken) {
                throw new Error('No Pancake token available');
            }

            let url;
            if (pageToken) {
                url = window.API_CONFIG.buildUrl.pancakePageApi(
                    pageId,
                    `conversations/${conversationId}/read`,
                    `page_access_token=${pageToken}`
                );
            } else {
                url = window.API_CONFIG.buildUrl.pancakeUserApi(
                    `pages/${pageId}/conversations/${conversationId}/read`,
                    `access_token=${userToken}`
                );
            }

            const response = await API_CONFIG.smartFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, 3, true);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] ✅ Marked conversation as read');
            return data.success || true;

        } catch (error) {
            console.error('[PANCAKE] ❌ Error marking conversation as read:', error);
            return false;
        }
    }
}

// Create global instance
window.pancakeDataManager = new PancakeDataManager();
console.log('[PANCAKE] PancakeDataManager loaded');
