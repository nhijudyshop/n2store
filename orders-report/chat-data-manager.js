// =====================================================
// CHAT DATA MANAGER - Quản lý tin nhắn ChatOmni
// =====================================================

class ChatDataManager {
    constructor() {
        this.conversations = [];
        this.conversationMap = new Map(); // Map PSID -> conversation
        this.commentConversations = [];
        this.commentConversationMap = new Map(); // Map PSID -> comment conversation
        this.comments = new Map(); // Map "channelId_userId" -> comments array (legacy)
        this.isLoading = false;
        this.isLoadingComments = false;
        this.lastFetchTime = null;
        this.lastCommentFetchTime = null;
        // Use Cloudflare Worker proxy to bypass CORS (faster, no cold start)
        this.API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/api-ms/chatomni/v1';
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
    }

    /**
     * Lấy danh sách conversations từ API
     * @param {boolean} forceRefresh - Bắt buộc refresh (bỏ qua cache)
     * @param {Array<string>} channelIds - Danh sách channel IDs (lấy từ Facebook_PostId)
     * @returns {Promise<Array>}
     */
    async fetchConversations(forceRefresh = false, channelIds = null) {
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

            // Build Channels array from channelIds dynamically (parsed from Facebook_PostId)
            // Don't hard-code channel IDs - always get from actual orders
            const channels = channelIds && channelIds.length > 0
                ? channelIds.map(id => ({ Id: id, Type: 4 }))
                : null;  // No hard-coded defaults - only fetch for actual orders

            const requestBody = {
                Keyword: null,
                Limit: 2000,  // Increased from 200 to 2000 to fetch more conversations
                Sort: null,
                Before: null,
                After: null,
                Channels: channels,  // Will be null if no channelIds provided
                Type: "all",  // FIX: Fetch both message AND comment conversations in 1 request
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
            this.lastCommentFetchTime = Date.now(); // Also update comment fetch time

            // Build both message and comment maps from single response
            this.buildConversationMaps();

            console.log(`[CHAT] ✅ Fetched ${this.conversations.length} conversations (Type: all)`);
            console.log(`[CHAT] ✅ Message map: ${this.conversationMap.size} entries`);
            console.log(`[CHAT] ✅ Comment map: ${this.commentConversationMap.size} entries`);
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
     * Xây dựng cả 2 Maps từ PSID -> conversation để lookup nhanh
     * Vì fetch Type="all", 1 conversation có thể có cả message và comment
     * Nên build cả 2 maps từ cùng 1 dataset
     */
    buildConversationMaps() {
        this.conversationMap.clear();
        this.commentConversationMap.clear();

        this.conversations.forEach(conv => {
            if (conv.User && conv.User.Id) {
                const psid = conv.User.Id;

                // Add to message map if has message activity
                if (conv.LastActivities?.Message) {
                    this.conversationMap.set(psid, conv);
                }

                // Add to comment map if has comment activity
                if (conv.LastActivities?.Comment) {
                    this.commentConversationMap.set(psid, conv);
                }
            }
        });

        console.log(`[CHAT] Built message map: ${this.conversationMap.size} entries`);
        console.log(`[CHAT] Built comment map: ${this.commentConversationMap.size} entries`);
    }

    /**
     * @deprecated Use buildConversationMaps() instead
     * Kept for backward compatibility
     */
    buildConversationMap() {
        this.buildConversationMaps();
    }

    /**
     * @deprecated Since fetchConversations now uses Type="all", this method is no longer needed
     * Kept for backward compatibility - simply calls fetchConversations()
     *
     * Lấy danh sách comment conversations từ API
     * @param {boolean} forceRefresh - Bắt buộc refresh (bỏ qua cache)
     * @param {Array<string>} channelIds - Danh sách channel IDs (lấy từ Facebook_PostId)
     * @returns {Promise<Array>}
     */
    async fetchCommentConversations(forceRefresh = false, channelIds = null) {
        console.log('[CHAT] ⚠️ fetchCommentConversations is deprecated. Using fetchConversations(Type="all") instead.');

        // Simply delegate to fetchConversations which now fetches Type="all"
        await this.fetchConversations(forceRefresh, channelIds);

        // Return conversations that have comment activity
        const commentConversations = Array.from(this.commentConversationMap.values());
        console.log(`[CHAT] Returning ${commentConversations.length} comment conversations from map`);

        return commentConversations;
    }

    /**
     * @deprecated Use buildConversationMaps() instead
     * Kept for backward compatibility
     */
    buildCommentConversationMap() {
        this.buildConversationMaps();
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
     * Lấy danh sách comments của user từ API
     * @param {string} channelId - Facebook Page ID
     * @param {string} userId - Facebook PSID
     * @returns {Promise<Array>}
     */
    async fetchComments(channelId, userId) {
        try {
            console.log(`[CHAT] Fetching comments for channelId=${channelId}, userId=${userId}`);

            // Check cache first
            const cacheKey = `${channelId}_${userId}`;
            if (this.comments.has(cacheKey)) {
                console.log(`[CHAT] Using cached comments for ${cacheKey}`);
                return this.comments.get(cacheKey);
            }

            const headers = await window.tokenManager.getAuthHeader();

            const response = await fetch(
                `${this.API_BASE}/messages/comments?type=4&channelId=${channelId}&userId=${userId}`,
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
            const comments = data.Data || [];

            // Cache the comments
            this.comments.set(cacheKey, comments);

            console.log(`[CHAT] Fetched ${comments.length} comments`);
            return comments;

        } catch (error) {
            console.error('[CHAT] Error fetching comments:', error);
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
     * @returns {Object} { message, messageType, hasUnread, unreadCount, attachments, type, commentsCount }
     */
    getLastMessageForOrder(order) {
        const chatInfo = this.getChatInfoForOrder(order);

        if (!chatInfo.hasChat || !chatInfo.conversation) {
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                attachments: null,
                type: null,
                commentsCount: 0
            };
        }

        const conv = chatInfo.conversation;
        const messageObj = conv.LastActivities?.Message || {};
        const lastMessage = messageObj.Message || null;
        const messageType = messageObj.Type || 'text';
        const attachments = messageObj.Attachments || null;

        // FIX: Chỉ hiển thị unread nếu tin nhắn cuối KHÔNG phải của owner (shop)
        // Nếu tin nhắn cuối là của shop thì shop đã biết rồi, không cần đánh dấu unread
        const isOwnerMessage = messageObj.IsOwner === true;
        const hasUnread = !isOwnerMessage && (conv.LastActivities?.HasUnread || false);
        const unreadCount = !isOwnerMessage ? (conv.LastActivities?.UnreadCount || 0) : 0;

        return {
            message: lastMessage,
            messageType,
            hasUnread,
            unreadCount,
            attachments,
            type: 'message',
            commentsCount: 0
        };
    }

    /**
     * Lấy comment cuối cùng cho order từ comment conversation map
     * @param {string} channelId - Facebook Page ID (not used, kept for compatibility)
     * @param {string} userId - Facebook PSID
     * @returns {Object} { message, messageType, hasUnread, unreadCount, type, commentsCount }
     */
    getLastCommentForOrder(channelId, userId) {
        if (!userId) {
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                type: 'comment',
                commentsCount: 0
            };
        }

        // Get comment conversation from map
        const commentConv = this.commentConversationMap.get(userId);

        if (!commentConv) {
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                type: 'comment',
                commentsCount: 0
            };
        }

        // Extract comment info from LastActivities.Comment
        const lastComment = commentConv.LastActivities?.Comment;
        if (!lastComment) {
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                type: 'comment',
                commentsCount: 0
            };
        }

        const message = lastComment.Message || null;
        const messageType = lastComment.Type === 1 ? 'text' : 'other';

        // FIX: Chỉ hiển thị unread nếu comment cuối KHÔNG phải của owner (shop)
        // Nếu comment cuối là của shop thì shop đã biết rồi, không cần đánh dấu unread
        const isOwnerComment = lastComment.IsOwner === true;
        const hasUnread = !isOwnerComment && (commentConv.LastActivities?.HasUnread || false);
        const unreadCount = !isOwnerComment ? (commentConv.LastActivities?.UnreadCount || 0) : 0;

        return {
            message,
            messageType,
            hasUnread,
            unreadCount,
            type: 'comment',
            commentsCount: 1, // We only have the last comment info
            commentConversation: commentConv
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.conversations = [];
        this.conversationMap.clear();
        this.commentConversations = [];
        this.commentConversationMap.clear();
        this.comments.clear();
        this.lastFetchTime = null;
        this.lastCommentFetchTime = null;
        console.log('[CHAT] Cache cleared');
    }
}

// Khởi tạo global instance
window.chatDataManager = window.chatDataManager || new ChatDataManager();
