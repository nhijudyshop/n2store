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
     * Lấy danh sách pages từ Pancake API
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
            console.log('[PANCAKE] Fetching pages from API via Cloudflare...');

            const token = await this.getToken();

            // Use Cloudflare Worker proxy
            const url = window.API_CONFIG.buildUrl.pancake('pages', `access_token=${token}`);

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
     * Search conversations theo query (tên khách hàng, fb_id, etc.)
     * Tối ưu hơn fetchConversations() vì chỉ search những gì cần
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

            // Build search URL with query parameter
            // Format: /conversations/search?q={query}&page_ids={pageIds}&access_token={token}
            const pageIdsParam = (searchPageIds || this.pageIds).join(',');
            const encodedQuery = encodeURIComponent(query);
            const queryString = `q=${encodedQuery}&access_token=${token}&cursor_mode=true`;

            const url = window.API_CONFIG.buildUrl.pancake('conversations/search', queryString);

            console.log('[PANCAKE] Search URL:', url);

            // Need to send page_ids in request body as FormData
            const formData = new FormData();
            formData.append('page_ids', pageIdsParam);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'POST',
                body: formData
            });

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
            console.log('[PANCAKE] Fetching conversations from API via Cloudflare...');

            const token = await this.getToken();

            // Build query params - format: pages[pageId]=offset
            const pagesParams = this.pageIds.map(pageId => `pages[${pageId}]=0`).join('&');
            const queryString = `${pagesParams}&unread_first=true&mode=OR&tags="ALL"&except_tags=[]&access_token=${token}&cursor_mode=true&from_platform=web`;

            // Use Cloudflare Worker proxy
            const url = window.API_CONFIG.buildUrl.pancake('conversations', queryString);

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
     * @param {string} pageId - Facebook Page ID
     * @param {string} conversationId - Pancake Conversation ID
     * @param {number} currentCount - Vị trí message (optional, for pagination)
     * @param {number} customerId - Customer ID (PartnerId) - required by backend API
     * @returns {Promise<Object>} { messages: Array, conversation: Object }
     */
    async fetchMessagesForConversation(pageId, conversationId, currentCount = null, customerId = null) {
        try {
            console.log(`[PANCAKE] Fetching messages for pageId=${pageId}, conversationId=${conversationId}, customerId=${customerId}`);

            const token = await this.getToken();
            if (!token) {
                throw new Error('No Pancake token available');
            }

            // Build URL: GET /api/v1/pages/{pageId}/conversations/{conversationId}/messages
            let queryString = `access_token=${token}`;
            if (currentCount !== null) {
                queryString += `&current_count=${currentCount}`;
            }
            // FIX: Add customer_id to prevent "Thiếu mã khách hàng" error
            if (customerId !== null) {
                queryString += `&customer_id=${customerId}`;
            }

            const url = window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/conversations/${conversationId}/messages`,
                queryString
            );

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[PANCAKE] Fetched ${data.messages?.length || 0} messages`);

            return {
                messages: data.messages || [],
                conversation: data.conversation || null
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

            // Build URL: GET /api/v1/pages/{pageId}/customers/{customerId}/inbox_preview
            const queryString = `access_token=${token}`;
            const url = window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/customers/${customerId}/inbox_preview`,
                queryString
            );

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

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

            // Extract conversationId from inbox_conv_id
            const conversationId = data.inbox_conv_id;
            console.log(`[PANCAKE] ✅ Got conversationId from inbox_preview: ${conversationId}`);

            return {
                conversationId: conversationId,
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

            // Try to get token
            if (!this.getToken()) {
                console.error('[PANCAKE] Cannot initialize - no JWT token');
                return false;
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
     * Upload image to Pancake API (2-step process)
     * 1. Listing: Check if file exists/needs upload
     * 2. Uploading: Upload file content if needed
     * @param {string} pageId 
     * @param {File} file 
     * @returns {Promise<string>} content_url
     */
    async uploadImage(pageId, file) {
        try {
            console.log(`[PANCAKE] Uploading image: ${file.name}, size: ${file.size}`);
            const token = await this.getToken();
            if (!token) throw new Error('No Pancake token available');

            // Step 1: Calculate SHA-1
            const sha = await this.calculateSHA1(file);
            console.log(`[PANCAKE] File SHA-1: ${sha}`);

            // Step 2: Listing request
            const url = window.API_CONFIG.buildUrl.pancake(`pages/${pageId}/contents`, `access_token=${token}`);

            // Boundary for multipart/form-data is handled automatically by browser if we use FormData,
            // but for "listing" action with specific boundary in fetch.txt, it seems they use FormData manually or just standard FormData.
            // Let's use standard FormData for simplicity and browser compatibility.

            const listingFormData = new FormData();
            listingFormData.append('action', 'listing');
            listingFormData.append('contents', JSON.stringify([{
                sha: sha,
                needsCompress: true,
                name: file.name
            }]));

            console.log('[PANCAKE] Step 1: Listing...');
            const listingResponse = await API_CONFIG.smartFetch(url, {
                method: 'POST',
                body: listingFormData
            });

            if (!listingResponse.ok) {
                throw new Error(`Listing failed: ${listingResponse.statusText}`);
            }

            const listingData = await listingResponse.json();
            console.log('[PANCAKE] Listing response:', listingData);

            if (!listingData.success || !listingData.data || listingData.data.length === 0) {
                throw new Error('Invalid listing response');
            }

            const fileInfo = listingData.data[0];

            // If content_url is already available (file exists), return it
            if (fileInfo.content_url) {
                console.log('[PANCAKE] File already exists, returning content_url');
                return {
                    content_url: fileInfo.content_url,
                    id: fileInfo.id
                };
            }

            // Helper to extract ID and URL
            const extractResult = (data) => {
                // Try to find ID
                const id = data.id || (data.data && data.data.id) || (Array.isArray(data) && data[0] ? data[0].id : null);
                // Try to find URL
                const url = data.content_url || (data.data && data.data.content_url) || (Array.isArray(data) && data[0] ? data[0].content_url : null);

                return { content_url: url, id: id };
            };

            // Step 3: Uploading if needed
            if (fileInfo.need_create) {
                console.log('[PANCAKE] Step 2: Uploading file content...');
                const uploadFormData = new FormData();
                uploadFormData.append('file', file);

                const uploadResponse = await API_CONFIG.smartFetch(url, {
                    method: 'POST',
                    body: uploadFormData
                });

                if (!uploadResponse.ok) {
                    throw new Error(`Upload failed: ${uploadResponse.statusText}`);
                }

                const uploadData = await uploadResponse.json();
                console.log('[PANCAKE] Upload response:', uploadData);
                console.log('[PANCAKE] Upload response FULL:', JSON.stringify(uploadData, null, 2));

                return uploadData; // Return full response instead of extractResult
            } else {
                // Should have content_url if need_create is false
                // fileInfo usually has 'id' as well
                return {
                    content_url: fileInfo.content_url,
                    id: fileInfo.id
                };
            }

        } catch (error) {
            console.error('[PANCAKE] ❌ Error uploading image:', error);
            throw error;
        }
    }

    /**
     * Xóa ảnh trên Pancake server
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

            // URL: https://pancake.vn/api/v1/pages/{pageId}/contents?ids={contentId}&access_token={token}
            const url = window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/contents`,
                `ids=${contentId}&access_token=${token}`
            );

            const response = await API_CONFIG.smartFetch(url, {
                method: 'DELETE',
                headers: {
                    'accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

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
}

// Create global instance
window.pancakeDataManager = new PancakeDataManager();
console.log('[PANCAKE] PancakeDataManager loaded');
