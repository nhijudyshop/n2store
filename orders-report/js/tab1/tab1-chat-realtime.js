/* =====================================================
   TAB1 CHAT REALTIME - Handle realtime events in chat context
   ===================================================== */

console.log('[Chat-RT] Loading...');

/**
 * Handle new message from realtime (WebSocket or polling)
 * Called from tab1-chat-core.js _startRealtimeForChat()
 */
window.handleNewMessage = function(payload) {
    if (!payload || !window.currentConversationId) return;

    // Check if this message belongs to current conversation
    const convId = payload.conversation_id || payload.convId;
    if (convId && String(convId) !== String(window.currentConversationId)) return;

    // Check pageId match
    const pageId = payload.page_id || payload.pageId;
    if (pageId && String(pageId) !== String(window.currentChatChannelId)) return;

    const msg = payload.message || payload;
    if (!msg || !msg.id) return;

    // Skip if already in messages list
    if (window.allChatMessages.some(m => String(m.id) === String(msg.id))) return;

    const isFromPage = String(msg.from?.id) === String(window.currentChatChannelId);
    const parsed = {
        id: msg.id,
        text: msg.original_message || window._stripHtml?.(msg.message || '') || msg.message || '',
        time: window._parseTimestamp?.(msg.inserted_at || msg.created_time) || new Date(),
        sender: isFromPage ? 'shop' : 'customer',
        senderName: msg.from?.name || '',
        fromId: msg.from?.id || '',
        attachments: msg.attachments || [],
        isHidden: msg.is_hidden || false,
        isRemoved: msg.is_removed || false,
        canHide: msg.can_hide !== false,
        canRemove: msg.can_remove !== false,
        canLike: msg.can_like !== false,
        userLikes: msg.user_likes || false,
        parentId: msg.parent_id || null,
        canReplyPrivately: msg.can_reply_privately || false,
        privateReplyConversation: msg.private_reply_conversation || null,
    };

    // Append to messages
    window.allChatMessages.push(parsed);

    // Re-render & scroll to bottom
    if (window.renderChatMessages) {
        window.renderChatMessages(window.allChatMessages);
    }
    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    console.log('[Chat-RT] New message appended:', parsed.id, parsed.text?.substring(0, 50));
};

/**
 * Handle conversation update from realtime
 */
window.handleConversationUpdate = function(payload) {
    if (!payload) return;

    const convId = payload.conversation_id || payload.id;
    if (!convId) return;

    // If this is the current conversation, update data
    if (String(convId) === String(window.currentConversationId)) {
        if (payload.updated_at && window.currentConversationData) {
            window.currentConversationData.updated_at = payload.updated_at;
        }
        // Mark as read if chat is open
        if (window.pancakeDataManager && window.currentChatChannelId) {
            window.pancakeDataManager.markAsRead(window.currentChatChannelId, convId).catch(() => {});
        }
    }
};

console.log('[Chat-RT] Loaded.');
