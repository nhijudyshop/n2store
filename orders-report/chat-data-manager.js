// =====================================================
// CHAT DATA MANAGER - Quản lý tin nhắn ChatOmni
// =====================================================

class ChatDataManager {
    constructor() {
        this.conversations = [];
        this.conversationMap = new Map(); // Map PSID -> conversation
        this.isLoading = false;
        this.lastFetchTime = null;
        // Use proxy server to bypass CORS
        // TODO: Switch to Cloudflare Worker when it's ready (currently returns 403)
        this.API_BASE = 'https://chat-viewer-ubjn.onrender.com/api/api-ms/chatomni/v1';
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
    }

    /**
     * Lấy danh sách conversations từ API
     * @param {boolean} forceRefresh - Bắt buộc refresh (bỏ qua cache)
     * @returns {Promise<Array>}
     */
    async fetchConversations(forceRefresh = false) {
        try {
            // Check cache
            if (!forceRefresh && this.conversations.length > 0 && this.lastFetchTime) {
                const cacheAge = Date.now() - this.lastFetchTime;
                if (cacheAge < this.CACHE_DURATION) {
                    console.log('[CHAT] Using cached conversations, count:', this.conversations.length);
                    return this.conversations;
                }
            }

            if (this.isLoading) {
                console.log('[CHAT] Already loading conversations...');
                return this.conversations;
            }

            this.isLoading = true;
            console.log('[CHAT] Fetching conversations from API...');

            const headers = await window.tokenManager.getAuthHeader();
            const url = `${this.API_BASE}/conversations/search`;

            console.log('[CHAT] Request URL:', url);
            console.log('[CHAT] Request headers:', headers);

            const requestBody = {
                Keyword: null,
                Limit: 200,
                Sort: null,
                Before: null,
                After: null,
                Channels: [
                    {
                        Id: "270136663390370",
                        Type: 4
                    }
                ],
                Type: "message",
                HasPhone: null,
                HasAddress: null,
                HasOrder: null,
                IsUnread: null,
                IsUnreplied: null,
                TagIds: [],
                UserIds: [],
                Start: null,
                End: null,
                FromNewToOld: null
            };

            console.log('[CHAT] Request body:', JSON.stringify(requestBody, null, 2));

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            console.log('[CHAT] Response status:', response.status, response.statusText);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[CHAT] Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[CHAT] Response data:', data);

            this.conversations = data.Data || [];
            this.lastFetchTime = Date.now();

            // Build map for quick lookup
            this.buildConversationMap();

            console.log(`[CHAT] ✅ Fetched ${this.conversations.length} conversations`);
            return this.conversations;

        } catch (error) {
            console.error('[CHAT] ❌ Error fetching conversations:', error);
            console.error('[CHAT] Error stack:', error.stack);
            // Return empty array on error, don't block the UI
            return [];
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Xây dựng Map từ PSID -> conversation để lookup nhanh
     */
    buildConversationMap() {
        this.conversationMap.clear();
        this.conversations.forEach(conv => {
            if (conv.User && conv.User.Id) {
                this.conversationMap.set(conv.User.Id, conv);
            }
        });
        console.log(`[CHAT] Built conversation map with ${this.conversationMap.size} entries`);
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
     * Lấy tin nhắn chi tiết của một conversation
     * @param {string} channelId - Facebook Page ID
     * @param {string} userId - Facebook PSID
     * @returns {Promise<Array>}
     */
    async fetchMessages(channelId, userId) {
        try {
            console.log(`[CHAT] Fetching messages for channelId=${channelId}, userId=${userId}`);

            const headers = await window.tokenManager.getAuthHeader();

            const response = await fetch(
                `${this.API_BASE}/messages?type=4&channelId=${channelId}&userId=${userId}`,
                {
                    method: 'GET',
                    headers: {
                        ...headers,
                        'accept': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const messages = data.Data || [];
            console.log(`[CHAT] Fetched ${messages.length} messages`);
            return messages;

        } catch (error) {
            console.error('[CHAT] Error fetching messages:', error);
            return [];
        }
    }

    /**
     * Đánh dấu conversation là đã đọc
     * @param {string} channelId - Facebook Page ID
     * @param {string} userId - Facebook PSID
     * @returns {Promise<boolean>}
     */
    async markAsSeen(channelId, userId) {
        try {
            console.log(`[CHAT] Marking as seen: channelId=${channelId}, userId=${userId}`);

            const headers = await window.tokenManager.getAuthHeader();

            const response = await fetch(
                `${this.API_BASE}/conversations/4/${channelId}/${userId}/seen?isSeen=true&type=message`,
                {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'accept': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            console.log('[CHAT] Marked as seen successfully');

            // Update local cache
            const conv = this.getConversationByPSID(userId);
            if (conv && conv.LastActivities) {
                conv.LastActivities.HasUnread = false;
                conv.LastActivities.UnreadCount = 0;
            }

            return true;

        } catch (error) {
            console.error('[CHAT] Error marking as seen:', error);
            return false;
        }
    }

    /**
     * Parse Channel ID từ Facebook_PostId
     * @param {string} postId - Facebook_PostId (format: "channelId_postId")
     * @returns {string|null}
     */
    parseChannelId(postId) {
        if (!postId || typeof postId !== 'string') return null;
        const parts = postId.split('_');
        return parts.length > 0 ? parts[0] : null;
    }

    /**
     * Lấy thông tin chat cho một order
     * @param {Object} order - Order object
     * @returns {Object} { hasChat, conversation, channelId, psid }
     */
    getChatInfoForOrder(order) {
        const psid = order.Facebook_ASUserId;
        const channelId = this.parseChannelId(order.Facebook_PostId);

        if (!psid || !channelId) {
            return {
                hasChat: false,
                conversation: null,
                channelId: null,
                psid: null
            };
        }

        const conversation = this.getConversationByPSID(psid);

        return {
            hasChat: !!conversation,
            conversation,
            channelId,
            psid
        };
    }

    /**
     * Lấy tin nhắn cuối cùng cho order
     * @param {Object} order - Order object
     * @returns {Object} { message, hasUnread, unreadCount }
     */
    getLastMessageForOrder(order) {
        const chatInfo = this.getChatInfoForOrder(order);

        if (!chatInfo.hasChat || !chatInfo.conversation) {
            return {
                message: null,
                hasUnread: false,
                unreadCount: 0
            };
        }

        const conv = chatInfo.conversation;
        const lastMessage = conv.LastActivities?.Message?.Message || null;
        const hasUnread = conv.LastActivities?.HasUnread || false;
        const unreadCount = conv.LastActivities?.UnreadCount || 0;

        return {
            message: lastMessage,
            hasUnread,
            unreadCount
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.conversations = [];
        this.conversationMap.clear();
        this.lastFetchTime = null;
        console.log('[CHAT] Cache cleared');
    }
}

// Khởi tạo global instance
window.chatDataManager = window.chatDataManager || new ChatDataManager();
