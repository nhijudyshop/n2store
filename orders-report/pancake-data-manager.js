// =====================================================
// PANCAKE DATA MANAGER - Quản lý tin nhắn Pancake.vn
// =====================================================

class PancakeDataManager {
    constructor() {
        this.conversations = [];
        this.conversationMap = new Map(); // Map PSID -> conversation
        this.pages = [];
        this.pageIds = [];
        this.isLoading = false;
        this.isLoadingPages = false;
        this.lastFetchTime = null;
        this.lastPageFetchTime = null;
        this.API_BASE = 'https://pancake.vn/api/v1';
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
            console.log('[PANCAKE] Fetching pages from API...');

            const token = await this.getToken();
            const url = `${this.API_BASE}/pages?access_token=${token}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: this.getHeaders(token)
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
            console.log('[PANCAKE] Fetching conversations from API...');

            const token = await this.getToken();

            // Build query params - format: pages[pageId]=offset
            const pagesParams = this.pageIds.map(pageId => `pages[${pageId}]=0`).join('&');

            const url = `${this.API_BASE}/conversations?${pagesParams}&unread_first=true&mode=OR&tags="ALL"&except_tags=[]&access_token=${token}&cursor_mode=true&from_platform=web`;

            console.log('[PANCAKE] Conversations URL:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: this.getHeaders(token)
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
            console.log(`[PANCAKE] ✅ Conversation map: ${this.conversationMap.size} entries`);

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
     * Build Map từ PSID (from_psid) -> conversation để lookup nhanh
     */
    buildConversationMap() {
        this.conversationMap.clear();

        this.conversations.forEach(conv => {
            // Pancake conversation có field from_psid
            if (conv.from_psid) {
                this.conversationMap.set(conv.from_psid, conv);
            }
        });

        console.log(`[PANCAKE] Built conversation map: ${this.conversationMap.size} entries`);
    }

    /**
     * Lấy conversation theo Facebook PSID
     * @param {string} psid - Facebook PSID (Facebook_ASUserId)
     * @returns {Object|null}
     */
    getConversationByPSID(psid) {
        if (!psid) return null;
        return this.conversationMap.get(psid) || null;
    }

    /**
     * Lấy unread info cho một order
     * @param {Object} order - Order object (có Facebook_ASUserId)
     * @returns {Object} { hasUnread, unreadCount }
     */
    getUnreadInfoForOrder(order) {
        const psid = order.Facebook_ASUserId;

        if (!psid) {
            return {
                hasUnread: false,
                unreadCount: 0
            };
        }

        const conversation = this.getConversationByPSID(psid);

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
     * Mark conversation as read (tương tự TPOS)
     * Note: Pancake không có API public để mark as read từ ngoài,
     * chỉ để placeholder cho tương thích
     * @param {string} psid - Facebook PSID
     * @returns {Promise<boolean>}
     */
    async markAsSeen(psid) {
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
