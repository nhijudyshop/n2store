// =====================================================
// CHAT DATA MANAGER - Quản lý tin nhắn ChatOmni
// =====================================================

class ChatDataManager {
    constructor() {
        this.conversations = [];
        this.messageMap = new Map(); // Map PSID -> message conversations
        this.commentMap = new Map(); // Map PSID -> comment conversations
        this.orderCommentMap = new Map(); // Map OrderId -> comments array
        this.conversationMap = new Map(); // Map PSID -> conversation (deprecated, kept for compatibility)
        this.isLoading = false;
        this.lastFetchTime = null;
        this.lastFetchTimeComments = null;
        // Use Cloudflare Worker proxy to bypass CORS (faster, no cold start)
        this.API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/api-ms/chatomni/v1';
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
    }

    /**
     * Lấy danh sách conversations theo type từ API
     * @param {string} type - "message" hoặc "comment"
     * @param {boolean} forceRefresh - Bắt buộc refresh (bỏ qua cache)
     * @returns {Promise<Array>}
     */
    async fetchConversationsByType(type = 'message', forceRefresh = false) {
        try {
            const headers = await window.tokenManager.getAuthHeader();
            const url = `${this.API_BASE}/conversations/search`;

            console.log(`[CHAT] Fetching ${type} conversations from API...`);

            const requestBody = {
                Keyword: null,
                Limit: 2000,
                Sort: null,
                Before: null,
                After: null,
                Channels: [
                    {
                        Id: "270136663390370",
                        Type: 4
                    }
                ],
                Type: type,
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

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[CHAT] Error fetching ${type}:`, errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const conversations = data.Data || [];

            console.log(`[CHAT] ✅ Fetched ${conversations.length} ${type} conversations`);
            return conversations;

        } catch (error) {
            console.error(`[CHAT] ❌ Error fetching ${type} conversations:`, error);
            return [];
        }
    }

    /**
     * Lấy danh sách conversations (cả message và comment)
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
            console.log('[CHAT] Fetching all conversations (messages + comments)...');

            // Fetch both messages and comments in parallel
            const [messages, comments] = await Promise.all([
                this.fetchConversationsByType('message', forceRefresh),
                this.fetchConversationsByType('comment', forceRefresh)
            ]);

            // Merge conversations
            this.conversations = [...messages, ...comments];
            this.lastFetchTime = Date.now();

            // Build maps for quick lookup
            this.buildConversationMap();

            console.log(`[CHAT] ✅ Total fetched: ${this.conversations.length} conversations (${messages.length} messages + ${comments.length} comments)`);
            return this.conversations;

        } catch (error) {
            console.error('[CHAT] ❌ Error fetching conversations:', error);
            console.error('[CHAT] Error stack:', error.stack);
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
        this.messageMap.clear();
        this.commentMap.clear();
        this.orderCommentMap.clear();

        this.conversations.forEach(conv => {
            const psid = conv.User?.Id;
            if (!psid) return;

            // Legacy map - keep last conversation found
            this.conversationMap.set(psid, conv);

            // Separate maps by type
            if (conv.Type === 'message') {
                this.messageMap.set(psid, conv);
            }
            else if (conv.Type === 'comment') {
                // Map by PSID
                if (!this.commentMap.has(psid)) {
                    this.commentMap.set(psid, []);
                }
                this.commentMap.get(psid).push(conv);

                // Map by OrderId if available
                if (conv.Order && conv.Order.Data && Array.isArray(conv.Order.Data)) {
                    conv.Order.Data.forEach(order => {
                        if (order.Id) {
                            if (!this.orderCommentMap.has(order.Id)) {
                                this.orderCommentMap.set(order.Id, []);
                            }
                            this.orderCommentMap.get(order.Id).push(conv);
                        }
                    });
                }
            }
        });

        console.log(`[CHAT] Built maps: ${this.messageMap.size} messages, ${this.commentMap.size} unique comment users, ${this.orderCommentMap.size} orders with comments`);
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
     * @returns {Object} { message, messageType, hasUnread, unreadCount, attachments, type, conversation }
     */
    getLastMessageForOrder(order) {
        const psid = order.Facebook_ASUserId;

        // Try message first (priority)
        const messageConv = this.messageMap.get(psid);
        if (messageConv) {
            const messageObj = messageConv.LastActivities?.Message || {};
            return {
                message: messageObj.Message || null,
                messageType: messageObj.Type || 'text',
                hasUnread: messageConv.LastActivities?.HasUnread || false,
                unreadCount: messageConv.LastActivities?.UnreadCount || 0,
                attachments: messageObj.Attachments || null,
                type: 'message',
                conversation: messageConv
            };
        }

        // Fallback to comment by PSID
        const commentConvs = this.commentMap.get(psid);
        if (commentConvs && commentConvs.length > 0) {
            // Get latest comment (first in array, assuming sorted by date)
            const latestComment = commentConvs[0];
            return {
                message: latestComment.Message || null,
                messageType: 'text',
                hasUnread: false, // Comments don't have unread status in the same way
                unreadCount: 0,
                attachments: null,
                type: 'comment',
                conversation: latestComment,
                postDescription: latestComment.Object?.Description || null,
                liveCampaignName: latestComment.Object?.LiveCampaign?.Name || null
            };
        }

        // Fallback to comment by OrderId
        const orderComments = this.orderCommentMap.get(order.Id);
        if (orderComments && orderComments.length > 0) {
            const latestComment = orderComments[0];
            return {
                message: latestComment.Message || null,
                messageType: 'text',
                hasUnread: false,
                unreadCount: 0,
                attachments: null,
                type: 'comment',
                conversation: latestComment,
                postDescription: latestComment.Object?.Description || null,
                liveCampaignName: latestComment.Object?.LiveCampaign?.Name || null
            };
        }

        // No message or comment found
        return {
            message: null,
            messageType: null,
            hasUnread: false,
            unreadCount: 0,
            attachments: null,
            type: null,
            conversation: null
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.conversations = [];
        this.conversationMap.clear();
        this.messageMap.clear();
        this.commentMap.clear();
        this.orderCommentMap.clear();
        this.lastFetchTime = null;
        this.lastFetchTimeComments = null;
        console.log('[CHAT] Cache cleared');
    }
}

// Khởi tạo global instance
window.chatDataManager = window.chatDataManager || new ChatDataManager();
