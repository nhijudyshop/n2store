// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   TAB1 CHAT REALTIME - Handle realtime events in chat context
   ===================================================== */

/**
 * Handle new message from realtime (WebSocket or polling)
 * Called from tab1-chat-core.js _startRealtimeForChat()
 */
window.handleNewMessage = function(payload) {
    if (!payload || !window.currentConversationId) return;

    const msg = payload.message || payload;
    if (!msg || !msg.id) return;

    // Check if this message belongs to current conversation
    const convId = msg.conversation_id || payload.conversation_id || payload.convId;
    if (convId && String(convId) !== String(window.currentConversationId)) return;

    // Check pageId match
    const pageId = msg.page_id || payload.page_id || payload.pageId;
    if (pageId && String(pageId) !== String(window.currentChatChannelId)) return;

    // Skip if already in messages list
    if (window.allChatMessages.some(m => String(m.id) === String(msg.id))) return;

    // Reconcile optimistic private-reply placeholders via shared helper.
    // Build a single-incoming wrapper so the helper can match by text.
    const incomingFromPage = String(msg.from?.id) === String(window.currentChatChannelId);
    if (incomingFromPage && window._reconcileOptimisticReplies) {
        const incomingText = (msg.original_message || msg.message || '').trim();
        const incomingWrap = [{
            id: msg.id,
            sender: 'shop',
            text: incomingText,
        }];
        window.allChatMessages = window._reconcileOptimisticReplies(window.allChatMessages, incomingWrap);
    }

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

};

/**
 * Handle conversation update from realtime
 * Pancake sends update_conversation (NOT new_message) for incoming customer messages.
 * When the current chat matches, fetch and display new messages immediately.
 */
window.handleConversationUpdate = function(payload) {
    if (!payload) return;

    const conv = payload.conversation || payload;
    const convId = payload.conversation_id || conv?.id || payload.id;
    const fromPsid = String(conv?.from?.id || conv?.from_psid || '');

    // Match current open chat by convId, or by PSID + pageId (PSID alone is
    // insufficient because the same PSID could appear in events from different
    // conversations on the same page, e.g. INBOX vs COMMENT).
    const eventPageId = String(conv?.page_id || payload.page_id || '');
    const isCurrentConv = (
        (window.currentConversationId && convId && String(convId) === String(window.currentConversationId)) ||
        (window.currentChatPSID && fromPsid && String(fromPsid) === String(window.currentChatPSID)
            && eventPageId && eventPageId === String(window.currentChatChannelId))
    );

    if (!isCurrentConv) return;

    if (conv?.updated_at && window.currentConversationData) {
        window.currentConversationData.updated_at = conv.updated_at;
    }

    // Per-conversation debounce — global timer would clobber updates
    // for different convs that fire within 300ms of each other.
    if (!window._chatUpdateDebounceMap) window._chatUpdateDebounceMap = new Map();
    const debounceKey = String(window.currentConversationId);
    clearTimeout(window._chatUpdateDebounceMap.get(debounceKey));
    const timerId = setTimeout(async () => {
        window._chatUpdateDebounceMap.delete(debounceKey);
        const pageId = window.currentChatChannelId;
        const currentConvId = window.currentConversationId;
        if (!pageId || !currentConvId || !window.pancakeDataManager) return;

        try {
            window.pancakeDataManager.clearMessagesCache(pageId, currentConvId);
            const result = await window.pancakeDataManager.fetchMessages(pageId, currentConvId);
            if (!result.messages?.length || window.currentConversationId !== currentConvId) return;

            // Only append NEW messages (not already displayed)
            const existingIds = new Set(window.allChatMessages.map(m => String(m.id)));
            const newMsgs = result.messages.filter(m => !existingIds.has(String(m.id)));

            for (const msg of newMsgs) {
                window.handleNewMessage?.({ message: msg, page_id: pageId });
            }
        } catch (e) { /* silent */ }
    }, 300);
    window._chatUpdateDebounceMap.set(debounceKey, timerId);
};

