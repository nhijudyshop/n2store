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
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
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
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
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
        });

        console.log(`[PANCAKE] Built conversation maps:`);
        console.log(`  - INBOX by PSID: ${this.inboxMapByPSID.size} entries`);
        console.log(`  - INBOX by FBID: ${this.inboxMapByFBID.size} entries`);
        console.log(`  - COMMENT by PSID: ${this.commentMapByPSID.size} entries`);
        console.log(`  - COMMENT by FBID: ${this.commentMapByFBID.size} entries`);
    }

    /**
     * Lấy conversation theo Facebook User ID (bất kỳ type nào)
     * Tìm trong cả INBOX và COMMENT maps
     * Ưu tiên: INBOX by PSID → INBOX by FBID → COMMENT by FBID → COMMENT by PSID
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
        let conversation = this.inboxMapByPSID.get(userId);
        if (!conversation) {
            conversation = this.inboxMapByFBID.get(userId);
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
     * @returns {Promise<Object>} { messages: Array, conversation: Object }
     */
    async fetchMessagesForConversation(pageId, conversationId, currentCount = null) {
        try {
            console.log(`[PANCAKE] Fetching messages for pageId=${pageId}, conversationId=${conversationId}`);

            const token = await this.getToken();
            if (!token) {
                throw new Error('No Pancake token available');
            }

            // Build URL: GET /api/v1/pages/{pageId}/conversations/{conversationId}/messages
            let queryString = `access_token=${token}`;
            if (currentCount !== null) {
                queryString += `&current_count=${currentCount}`;
            }

            const url = window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/conversations/${conversationId}/messages`,
                queryString
            );

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
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
     * Lấy tin nhắn cuối cùng cho order từ Pancake conversation
     * CHỈ LẤY INBOX conversations (type === "INBOX")
     * @param {Object} order - Order object
     * @returns {Object} { message, messageType, hasUnread, unreadCount, attachments, type }
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
        let conversation = this.inboxMapByPSID.get(userId);
        if (!conversation) {
            conversation = this.inboxMapByFBID.get(userId);
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

        return {
            message: lastMessage,
            messageType,
            hasUnread,
            unreadCount,
            attachments,
            type: 'message',  // Return 'message' for consistency with UI
            conversationId: conversation.id,
            pageId: conversation.page_id
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
        let conversation = this.commentMapByFBID.get(userId);
        if (!conversation) {
            conversation = this.commentMapByPSID.get(userId);
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

        return {
            message: lastMessage,
            messageType,
            hasUnread,
            unreadCount,
            type: 'comment',
            conversationId: conversation.id,
            pageId: conversation.page_id
        };
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
}

// Create global instance
window.pancakeDataManager = new PancakeDataManager();
console.log('[PANCAKE] PancakeDataManager loaded');
