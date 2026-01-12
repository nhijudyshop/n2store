/**
 * TAB1-CHAT.JS - Chat Modal Module
 * Handles messaging, comments, conversation management
 * Depends on: tab1-core.js, pancake-data-manager.js
 */

// =====================================================
// CHAT MODAL STATE
// =====================================================
window.currentChatChannelId = null;
window.currentChatPSID = null;
window.currentRealFacebookPSID = null;
window.currentConversationId = null;
window.currentInboxConversationId = null;
window.currentCommentConversationId = null;
window.currentCustomerUUID = null;
window.allChatMessages = [];
window.allChatComments = [];
window.availableChatPages = [];
window.currentSendPageId = null;
window.allMatchingConversations = [];
window.purchaseCommentId = null;
window.purchaseFacebookPostId = null;

let currentChatType = null;
let currentChatCursor = null;
let skipWebhookUpdate = false;
let isSendingMessage = false;
let isLoadingMoreMessages = false;
let currentOrder = null;
let currentParentCommentId = null;
let currentPostId = null;
let messageReplyType = 'reply_inbox';
let currentConversationType = 'INBOX';
let markReadTimer = null;

// Read state management
window.currentConversationReadState = {
    isRead: false,
    conversationId: null,
    pageId: null,
    lastMarkedAt: null,
    chatType: null
};

// =====================================================
// CHAT MODAL FUNCTIONS
// =====================================================
async function openChatModal(orderId, channelId, psid) {
    console.log('[CHAT] Opening chat modal:', { orderId, channelId, psid });

    currentChatType = 'message';
    window.currentChatChannelId = channelId;
    window.currentChatPSID = psid;
    window.allChatMessages = [];
    currentChatCursor = null;

    // Find order data
    const state = window.tab1State;
    currentOrder = state.allData.find(o => o.Id === orderId);

    if (!currentOrder) {
        console.error('[CHAT] Order not found:', orderId);
        return;
    }

    // Show modal
    const modal = document.getElementById('chatModal');
    if (modal) {
        modal.classList.add('show');
    }

    // Update title
    const titleEl = document.getElementById('chatModalTitle');
    if (titleEl) {
        titleEl.textContent = `Tin nhắn với ${currentOrder.Name || currentOrder.PartnerName || 'Khách hàng'}`;
    }

    // Show loading
    const modalBody = document.getElementById('chatModalBody');
    if (modalBody) {
        modalBody.innerHTML = `
            <div class="chat-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Đang tải tin nhắn...</p>
            </div>`;
    }

    // Enable input
    enableChatInput();

    // Fetch messages
    try {
        await loadChatMessages(channelId, psid);
    } catch (error) {
        console.error('[CHAT] Error loading messages:', error);
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="chat-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Lỗi khi tải tin nhắn</p>
                    <p style="font-size: 12px; color: #6b7280;">${error.message}</p>
                </div>`;
        }
    }

    // Populate page selector
    if (typeof window.populateChatPageSelector === 'function') {
        window.populateChatPageSelector(channelId);
    }
    if (typeof window.populateSendPageSelector === 'function') {
        window.populateSendPageSelector(channelId);
    }

    // Update conversation type toggle
    window.updateConversationTypeToggle('INBOX');
}

async function openCommentModal(orderId, channelId, psid) {
    console.log('[CHAT] Opening comment modal:', { orderId, channelId, psid });

    currentChatType = 'comment';
    window.currentChatChannelId = channelId;
    window.currentChatPSID = psid;
    window.allChatComments = [];
    currentChatCursor = null;

    // Find order data
    const state = window.tab1State;
    currentOrder = state.allData.find(o => o.Id === orderId);

    if (!currentOrder) {
        console.error('[CHAT] Order not found:', orderId);
        return;
    }

    // Show modal
    const modal = document.getElementById('chatModal');
    if (modal) {
        modal.classList.add('show');
    }

    // Update title
    const titleEl = document.getElementById('chatModalTitle');
    if (titleEl) {
        titleEl.textContent = `Bình luận với ${currentOrder.Name || currentOrder.PartnerName || 'Khách hàng'}`;
    }

    // Show loading
    const modalBody = document.getElementById('chatModalBody');
    if (modalBody) {
        modalBody.innerHTML = `
            <div class="chat-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Đang tải bình luận...</p>
            </div>`;
    }

    // Disable input for comments (enable when replying to specific comment)
    disableChatInput('Chọn "Trả lời" một bình luận để reply...');

    // Fetch comments
    try {
        await loadChatComments(channelId, psid);
    } catch (error) {
        console.error('[CHAT] Error loading comments:', error);
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="chat-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Lỗi khi tải bình luận</p>
                    <p style="font-size: 12px; color: #6b7280;">${error.message}</p>
                </div>`;
        }
    }

    // Update conversation type toggle
    window.updateConversationTypeToggle('COMMENT');
}

function closeChatModal() {
    const modal = document.getElementById('chatModal');
    if (modal) {
        modal.classList.remove('show');
    }

    // Reset state
    currentOrder = null;
    window.allChatMessages = [];
    window.allChatComments = [];
    currentChatCursor = null;
    isLoadingMoreMessages = false;
    isSendingMessage = false;
    window.currentConversationId = null;
    currentParentCommentId = null;
    currentPostId = null;

    // Clear timer
    if (markReadTimer) {
        clearTimeout(markReadTimer);
    }
}

// =====================================================
// LOAD MESSAGES/COMMENTS
// =====================================================
async function loadChatMessages(channelId, psid) {
    if (!window.pancakeDataManager) {
        throw new Error('pancakeDataManager not available');
    }

    // Get customer UUID from PSID
    const conversation = window.pancakeDataManager.getConversationByUserId(psid);
    if (conversation && conversation.customers && conversation.customers.length > 0) {
        window.currentCustomerUUID = conversation.customers[0].id;
    }

    // Fetch inbox preview to get conversation IDs
    if (window.currentCustomerUUID) {
        try {
            const preview = await window.pancakeDataManager.fetchInboxPreview(channelId, window.currentCustomerUUID);
            if (preview.success) {
                window.currentInboxConversationId = preview.inboxConversationId;
                window.currentCommentConversationId = preview.commentConversationId;
                window.currentConversationId = preview.inboxConversationId || preview.conversationId;
            }
        } catch (e) {
            console.warn('[CHAT] Could not fetch inbox preview:', e);
        }
    }

    // Fetch messages
    const conversationId = window.currentConversationId || `${channelId}_${psid}`;
    const response = await window.pancakeDataManager.fetchMessagesForConversation(
        channelId,
        conversationId,
        null,
        window.currentCustomerUUID
    );

    window.allChatMessages = response.messages || [];
    currentChatCursor = response.after;

    if (response.conversationId) {
        window.currentConversationId = response.conversationId;
    }

    console.log('[CHAT] Loaded', window.allChatMessages.length, 'messages');

    // Render messages
    renderChatMessages(window.allChatMessages, true);

    // Setup infinite scroll
    setupChatInfiniteScroll();

    // Auto mark as read after 2 seconds
    autoMarkAsRead(2000);
}

async function loadChatComments(channelId, psid) {
    if (!window.pancakeDataManager && !window.chatDataManager) {
        throw new Error('Data manager not available');
    }

    // Use chatDataManager if available for comments
    if (window.chatDataManager) {
        const response = await window.chatDataManager.fetchComments(channelId, psid);
        window.allChatComments = response.comments || [];
        currentChatCursor = response.after;

        // Update parent comment ID
        if (window.allChatComments.length > 0) {
            const rootComment = window.allChatComments.find(c => !c.ParentId) || window.allChatComments[0];
            if (rootComment && rootComment.Id) {
                currentParentCommentId = getFacebookCommentId(rootComment);
            }
        }
    } else if (window.currentCommentConversationId) {
        // Fallback to pancakeDataManager
        const response = await window.pancakeDataManager.fetchMessagesForConversation(
            channelId,
            window.currentCommentConversationId,
            null,
            window.currentCustomerUUID
        );
        window.allChatComments = response.messages || [];
        currentChatCursor = response.after;
    }

    console.log('[CHAT] Loaded', window.allChatComments.length, 'comments');

    // Render comments
    renderComments(window.allChatComments, true);

    // Setup infinite scroll
    setupChatInfiniteScroll();
}

function getFacebookCommentId(comment) {
    return comment.facebook_id || comment.Id || comment.id;
}

// =====================================================
// RENDER MESSAGES/COMMENTS
// =====================================================
function renderChatMessages(messages, isInitial = false) {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    if (!messages || messages.length === 0) {
        modalBody.innerHTML = `
            <div class="chat-empty">
                <i class="fas fa-comments"></i>
                <p>Chưa có tin nhắn nào</p>
            </div>`;
        return;
    }

    // Sort messages by time (oldest first for display)
    const sortedMessages = [...messages].sort((a, b) => {
        const timeA = a.created_time || a.CreatedTime || 0;
        const timeB = b.created_time || b.CreatedTime || 0;
        return timeA - timeB;
    });

    const html = sortedMessages.map(msg => renderMessageBubble(msg)).join('');

    modalBody.innerHTML = `<div class="chat-messages-container">${html}</div>`;

    // Scroll to bottom
    if (isInitial) {
        modalBody.scrollTop = modalBody.scrollHeight;
    }
}

function renderMessageBubble(msg) {
    const isFromPage = msg.is_from_page || msg.FromPage || false;
    const bubbleClass = isFromPage ? 'chat-bubble-sent' : 'chat-bubble-received';

    const content = msg.content || msg.message || msg.Message || '';
    const timestamp = msg.created_time || msg.CreatedTime;
    const timeStr = timestamp ? formatChatTime(timestamp) : '';

    // Handle attachments
    let attachmentHTML = '';
    if (msg.attachments && msg.attachments.length > 0) {
        attachmentHTML = msg.attachments.map(att => {
            if (att.type === 'image' || att.Type === 'image' || att.type === 'photo') {
                return `<img src="${att.url || att.Url}" class="chat-attachment-image" onclick="window.open('${att.url || att.Url}')">`;
            }
            if (att.type === 'sticker' || att.sticker_id) {
                return `<span class="chat-sticker">🧸</span>`;
            }
            if (att.type === 'video') {
                return `<span class="chat-video"><i class="fas fa-video"></i> Video</span>`;
            }
            return `<span class="chat-file"><i class="fas fa-file"></i> Tệp đính kèm</span>`;
        }).join('');
    }

    return `
        <div class="chat-bubble ${bubbleClass}">
            <div class="chat-bubble-content">
                ${content ? `<div class="chat-bubble-text">${escapeHtml(content)}</div>` : ''}
                ${attachmentHTML}
            </div>
            <div class="chat-bubble-time">${timeStr}</div>
        </div>`;
}

function renderComments(comments, isInitial = false) {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    if (!comments || comments.length === 0) {
        modalBody.innerHTML = `
            <div class="chat-empty">
                <i class="fas fa-comments"></i>
                <p>Chưa có bình luận nào</p>
            </div>`;
        return;
    }

    // Sort comments by time
    const sortedComments = [...comments].sort((a, b) => {
        const timeA = a.created_time || a.CreatedTime || 0;
        const timeB = b.created_time || b.CreatedTime || 0;
        return timeA - timeB;
    });

    const html = sortedComments.map(cmt => renderCommentItem(cmt)).join('');

    modalBody.innerHTML = `<div class="chat-comments-container">${html}</div>`;

    // Scroll to bottom
    if (isInitial) {
        modalBody.scrollTop = modalBody.scrollHeight;
    }
}

function renderCommentItem(comment) {
    const isFromPage = comment.is_from_page || comment.FromPage || false;
    const commentClass = isFromPage ? 'comment-from-page' : 'comment-from-user';

    const content = comment.content || comment.message || comment.Message || '';
    const authorName = comment.from?.name || comment.AuthorName || 'Người dùng';
    const timestamp = comment.created_time || comment.CreatedTime;
    const timeStr = timestamp ? formatChatTime(timestamp) : '';
    const commentId = getFacebookCommentId(comment);

    return `
        <div class="comment-item ${commentClass}">
            <div class="comment-header">
                <span class="comment-author">${escapeHtml(authorName)}</span>
                <span class="comment-time">${timeStr}</span>
            </div>
            <div class="comment-content">${escapeHtml(content)}</div>
            ${!isFromPage ? `
                <div class="comment-actions">
                    <button class="btn-reply-comment" onclick="replyToComment('${commentId}')">
                        <i class="fas fa-reply"></i> Trả lời
                    </button>
                </div>
            ` : ''}
        </div>`;
}

// =====================================================
// SEND MESSAGE/COMMENT
// =====================================================
async function sendChatMessage() {
    const input = document.getElementById('chatReplyInput');
    const message = input?.value?.trim();

    if (!message || isSendingMessage) return;

    isSendingMessage = true;
    const sendBtn = document.getElementById('chatSendBtn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        const pageId = window.currentSendPageId || window.currentChatChannelId;
        const psid = window.currentRealFacebookPSID || window.currentChatPSID;

        if (!pageId || !psid) {
            throw new Error('Missing page ID or PSID');
        }

        let success = false;

        if (currentChatType === 'comment' && currentParentCommentId) {
            // Reply to comment
            success = await window.pancakeDataManager.replyToComment(
                pageId,
                currentParentCommentId,
                message
            );
        } else if (messageReplyType === 'private_replies' && window.purchaseCommentId) {
            // Private reply from comment
            success = await window.pancakeDataManager.sendPrivateReply(
                pageId,
                window.purchaseCommentId,
                message
            );
        } else {
            // Regular inbox message
            success = await window.pancakeDataManager.sendMessage(
                pageId,
                psid,
                message
            );
        }

        if (success) {
            // Clear input
            input.value = '';

            // Add message to UI immediately (optimistic update)
            const newMessage = {
                content: message,
                message: message,
                is_from_page: true,
                FromPage: true,
                created_time: Math.floor(Date.now() / 1000),
                CreatedTime: Math.floor(Date.now() / 1000)
            };

            if (currentChatType === 'comment') {
                window.allChatComments.push(newMessage);
                renderComments(window.allChatComments, false);
            } else {
                window.allChatMessages.push(newMessage);
                renderChatMessages(window.allChatMessages, false);
            }

            // Scroll to bottom
            const modalBody = document.getElementById('chatModalBody');
            if (modalBody) {
                modalBody.scrollTop = modalBody.scrollHeight;
            }

            // Mark as read
            autoMarkAsRead(0);

            console.log('[CHAT] Message sent successfully');
        } else {
            throw new Error('Failed to send message');
        }

    } catch (error) {
        console.error('[CHAT] Error sending message:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Không thể gửi tin nhắn: ' + error.message);
        }
    } finally {
        isSendingMessage = false;
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }
}

function replyToComment(commentId) {
    currentParentCommentId = commentId;
    currentChatType = 'comment';

    // Enable input
    enableChatInput();

    const input = document.getElementById('chatReplyInput');
    if (input) {
        input.placeholder = 'Nhập trả lời bình luận...';
        input.focus();
    }

    // Show notification
    if (window.notificationManager) {
        window.notificationManager.show('Đang trả lời bình luận', 'info', 2000);
    }
}

// =====================================================
// CHAT INPUT HELPERS
// =====================================================
function enableChatInput() {
    const input = document.getElementById('chatReplyInput');
    const btn = document.getElementById('chatSendBtn');

    if (input) {
        input.disabled = false;
        input.placeholder = 'Nhập tin nhắn trả lời... (Shift+Enter để xuống dòng)';
        input.style.background = '#f9fafb';
        input.style.cursor = 'text';
    }

    if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
}

function disableChatInput(placeholder = '') {
    const input = document.getElementById('chatReplyInput');
    const btn = document.getElementById('chatSendBtn');

    if (input) {
        input.disabled = true;
        input.placeholder = placeholder;
        input.style.background = '#f3f4f6';
        input.style.cursor = 'not-allowed';
    }

    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    }
}

// =====================================================
// INFINITE SCROLL
// =====================================================
function setupChatInfiniteScroll() {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    modalBody.removeEventListener('scroll', handleChatScroll);
    modalBody.addEventListener('scroll', handleChatScroll);
}

async function handleChatScroll(event) {
    const container = event.target;

    // Load more when scrolled to top (older messages)
    if (container.scrollTop < 100 && !isLoadingMoreMessages && currentChatCursor) {
        await loadMoreMessages();
    }
}

async function loadMoreMessages() {
    if (isLoadingMoreMessages || !currentChatCursor) return;

    isLoadingMoreMessages = true;
    console.log('[CHAT] Loading more messages...');

    try {
        const channelId = window.currentChatChannelId;
        const conversationId = window.currentConversationId;

        if (!conversationId) return;

        const response = await window.pancakeDataManager.fetchMessagesForConversation(
            channelId,
            conversationId,
            currentChatCursor,
            window.currentCustomerUUID
        );

        const newMessages = response.messages || [];
        currentChatCursor = response.after;

        if (newMessages.length > 0) {
            if (currentChatType === 'comment') {
                window.allChatComments = [...newMessages, ...window.allChatComments];
                renderComments(window.allChatComments, false);
            } else {
                window.allChatMessages = [...newMessages, ...window.allChatMessages];
                renderChatMessages(window.allChatMessages, false);
            }
        }

        console.log('[CHAT] Loaded', newMessages.length, 'more messages');

    } catch (error) {
        console.error('[CHAT] Error loading more messages:', error);
    } finally {
        isLoadingMoreMessages = false;
    }
}

// =====================================================
// MARK READ/UNREAD
// =====================================================
function autoMarkAsRead(delayMs = 0) {
    clearTimeout(markReadTimer);

    markReadTimer = setTimeout(async () => {
        const { pageId, conversationId, isRead, chatType } = window.currentConversationReadState;

        if (isRead || chatType === 'comment') return;

        if (!pageId || !conversationId) {
            // Use current values
            window.currentConversationReadState.pageId = window.currentChatChannelId;
            window.currentConversationReadState.conversationId = window.currentConversationId;
        }

        const pageIdToUse = window.currentConversationReadState.pageId || window.currentChatChannelId;
        const convIdToUse = window.currentConversationReadState.conversationId || window.currentConversationId;

        if (!pageIdToUse || !convIdToUse) return;

        console.log('[MARK-READ] Auto marking as read...', convIdToUse);

        if (window.pancakeDataManager) {
            const success = await window.pancakeDataManager.markConversationAsRead(pageIdToUse, convIdToUse);

            if (success) {
                window.currentConversationReadState.isRead = true;
                window.currentConversationReadState.lastMarkedAt = Date.now();
                updateReadBadge(true);
                updateMarkButton(true);

                // Update local data and refresh table
                if (window.pancakeDataManager.updateConversationReadStatus) {
                    window.pancakeDataManager.updateConversationReadStatus(convIdToUse, true);
                }

                if (typeof renderTable === 'function') {
                    renderTable();
                }
            }
        }
    }, delayMs);
}

function updateReadBadge(isRead) {
    const badge = document.getElementById('chatReadBadge');
    if (!badge) return;

    badge.style.display = 'inline-flex';

    if (isRead) {
        badge.innerHTML = '<i class="fas fa-check-circle"></i> Đã đọc';
        badge.style.color = '#10b981';
        badge.style.background = 'rgba(16, 185, 129, 0.2)';
    } else {
        badge.innerHTML = '<i class="fas fa-circle"></i> Chưa đọc';
        badge.style.color = '#f59e0b';
        badge.style.background = 'rgba(245, 158, 11, 0.2)';
    }
}

function updateMarkButton(isRead) {
    const btn = document.getElementById('btnMarkReadToggle');
    if (!btn) return;

    btn.style.display = 'flex';

    if (isRead) {
        btn.innerHTML = '<i class="fas fa-envelope-open"></i>';
        btn.style.background = 'rgba(245, 158, 11, 0.8)';
        btn.title = 'Đánh dấu chưa đọc';
    } else {
        btn.innerHTML = '<i class="fas fa-envelope"></i>';
        btn.style.background = 'rgba(16, 185, 129, 0.8)';
        btn.title = 'Đánh dấu đã đọc';
    }
}

window.toggleConversationReadState = async function() {
    const { pageId, conversationId, isRead } = window.currentConversationReadState;

    if (!pageId || !conversationId) {
        alert('Không tìm thấy thông tin cuộc hội thoại');
        return;
    }

    const btn = document.getElementById('btnMarkReadToggle');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        let success;
        if (isRead) {
            success = await window.pancakeDataManager.markConversationAsUnread(pageId, conversationId);
        } else {
            success = await window.pancakeDataManager.markConversationAsRead(pageId, conversationId);
        }

        if (success) {
            window.currentConversationReadState.isRead = !isRead;
            window.currentConversationReadState.lastMarkedAt = Date.now();
            updateReadBadge(!isRead);
            updateMarkButton(!isRead);

            if (window.pancakeDataManager.updateConversationReadStatus) {
                window.pancakeDataManager.updateConversationReadStatus(conversationId, !isRead);
            }

            if (typeof renderTable === 'function') {
                renderTable();
            }
        } else {
            alert('Không thể thay đổi trạng thái đọc');
        }
    } catch (error) {
        console.error('[MARK-READ] Toggle failed:', error);
        alert('Lỗi khi thay đổi trạng thái đọc');
    } finally {
        if (btn) {
            btn.disabled = false;
            updateMarkButton(window.currentConversationReadState.isRead);
        }
    }
};

// =====================================================
// CONVERSATION TYPE TOGGLE
// =====================================================
window.updateConversationTypeToggle = function(type) {
    const btnInbox = document.getElementById('btnViewInbox');
    const btnComment = document.getElementById('btnViewComment');

    if (!btnInbox || !btnComment) return;

    if (type === 'INBOX') {
        btnInbox.style.borderColor = 'rgba(255, 255, 255, 0.8)';
        btnInbox.style.background = 'rgba(255, 255, 255, 0.2)';
        btnInbox.style.color = 'white';
        btnComment.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        btnComment.style.background = 'transparent';
        btnComment.style.color = 'rgba(255, 255, 255, 0.7)';
    } else {
        btnInbox.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        btnInbox.style.background = 'transparent';
        btnInbox.style.color = 'rgba(255, 255, 255, 0.7)';
        btnComment.style.borderColor = 'rgba(255, 255, 255, 0.8)';
        btnComment.style.background = 'rgba(255, 255, 255, 0.2)';
        btnComment.style.color = 'white';
    }

    currentConversationType = type;
};

window.switchConversationType = async function(type) {
    if (currentConversationType === type) return;

    window.updateConversationTypeToggle(type);

    const channelId = window.currentChatChannelId;
    const psid = window.currentChatPSID;

    if (type === 'COMMENT') {
        currentChatType = 'comment';
        disableChatInput('Chọn "Trả lời" một bình luận để reply...');
        await loadChatComments(channelId, psid);
    } else {
        currentChatType = 'message';
        enableChatInput();
        await loadChatMessages(channelId, psid);
    }
};

// =====================================================
// MESSAGE REPLY TYPE TOGGLE
// =====================================================
window.setMessageReplyType = function(type) {
    messageReplyType = type;

    const btnInbox = document.getElementById('btnMsgReplyInbox');
    const btnPrivate = document.getElementById('btnMsgPrivateReply');
    const hintText = document.getElementById('msgReplyTypeHint');

    if (type === 'reply_inbox') {
        if (btnInbox) {
            btnInbox.style.borderColor = '#3b82f6';
            btnInbox.style.background = '#eff6ff';
            btnInbox.style.color = '#1d4ed8';
        }
        if (btnPrivate) {
            btnPrivate.style.borderColor = '#e5e7eb';
            btnPrivate.style.background = 'white';
            btnPrivate.style.color = '#6b7280';
        }
        if (hintText) {
            hintText.textContent = 'Gửi tin nhắn qua Messenger';
        }
    } else {
        if (btnInbox) {
            btnInbox.style.borderColor = '#e5e7eb';
            btnInbox.style.background = 'white';
            btnInbox.style.color = '#6b7280';
        }
        if (btnPrivate) {
            btnPrivate.style.borderColor = '#3b82f6';
            btnPrivate.style.background = '#eff6ff';
            btnPrivate.style.color = '#1d4ed8';
        }
        if (hintText) {
            hintText.textContent = 'Gửi tin nhắn riêng từ comment đặt hàng';
        }
    }
};

// =====================================================
// PAGE SELECTOR
// =====================================================
window.populateChatPageSelector = async function(currentPageId) {
    const select = document.getElementById('chatPageSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Đang tải...</option>';
    select.disabled = true;

    try {
        if (!window.availableChatPages || window.availableChatPages.length === 0) {
            if (window.pancakeDataManager) {
                await window.pancakeDataManager.fetchPages();
                window.availableChatPages = await window.pancakeDataManager.fetchPagesWithUnreadCount();
            }
        }

        const pages = window.availableChatPages;

        if (!pages || pages.length === 0) {
            select.innerHTML = '<option value="">Không có page</option>';
            return;
        }

        let optionsHtml = '';
        pages.forEach(page => {
            const isSelected = page.page_id === currentPageId ? 'selected' : '';
            const unreadBadge = page.unread_conv_count > 0 ? ` (${page.unread_conv_count})` : '';
            optionsHtml += `<option value="${page.page_id}" ${isSelected}>${page.page_name}${unreadBadge}</option>`;
        });

        select.innerHTML = optionsHtml;
        select.disabled = false;

    } catch (error) {
        console.error('[PAGE-SELECTOR] Error:', error);
        select.innerHTML = '<option value="">Lỗi tải</option>';
    }
};

window.populateSendPageSelector = async function(currentPageId) {
    const select = document.getElementById('chatSendPageSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Đang tải...</option>';
    select.disabled = true;

    try {
        if (!window.availableChatPages || window.availableChatPages.length === 0) {
            if (window.pancakeDataManager) {
                await window.pancakeDataManager.fetchPages();
                window.availableChatPages = await window.pancakeDataManager.fetchPagesWithUnreadCount();
            }
        }

        const pages = window.availableChatPages;

        if (!pages || pages.length === 0) {
            select.innerHTML = '<option value="">Không có page</option>';
            return;
        }

        let optionsHtml = '';
        pages.forEach(page => {
            const isSelected = page.page_id === currentPageId ? 'selected' : '';
            optionsHtml += `<option value="${page.page_id}" ${isSelected}>${page.page_name}</option>`;
        });

        select.innerHTML = optionsHtml;
        select.disabled = false;
        window.currentSendPageId = currentPageId;

    } catch (error) {
        console.error('[SEND-PAGE] Error:', error);
        select.innerHTML = '<option value="">Lỗi tải</option>';
    }
};

window.onChatPageChanged = async function(pageId) {
    if (!pageId) return;

    window.currentChatChannelId = pageId;

    const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
    if (window.notificationManager && selectedPage) {
        window.notificationManager.show(`Đang tải tin nhắn từ page: ${selectedPage.page_name}...`, 'info', 2000);
    }

    await window.reloadChatForSelectedPage(pageId);
};

window.onSendPageChanged = function(pageId) {
    if (!pageId) return;
    window.currentSendPageId = pageId;

    const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
    if (window.notificationManager && selectedPage) {
        window.notificationManager.show(`Sẽ gửi tin nhắn từ page: ${selectedPage.page_name}`, 'info', 2000);
    }
};

window.reloadChatForSelectedPage = async function(pageId) {
    const psid = window.currentChatPSID;
    if (!psid) return;

    const modalBody = document.getElementById('chatModalBody');
    if (modalBody) {
        modalBody.innerHTML = `
            <div class="chat-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Đang tải...</p>
            </div>`;
    }

    try {
        if (currentChatType === 'comment') {
            await loadChatComments(pageId, psid);
        } else {
            await loadChatMessages(pageId, psid);
        }
    } catch (error) {
        console.error('[PAGE-RELOAD] Error:', error);
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="chat-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Lỗi khi tải tin nhắn</p>
                </div>`;
        }
    }
};

// =====================================================
// CONVERSATION SELECTOR
// =====================================================
window.populateConversationSelector = function(conversations, selectedConvId = null) {
    const selectorContainer = document.getElementById('chatConversationSelector');
    const select = document.getElementById('chatConversationSelect');

    if (!selectorContainer || !select) return;

    if (!conversations || conversations.length <= 1) {
        selectorContainer.style.display = 'none';
        window.allMatchingConversations = conversations || [];
        return;
    }

    window.allMatchingConversations = conversations;

    // Sort by updated_time descending
    const sorted = [...conversations].sort((a, b) => {
        const timeA = a.updated_time || a.last_message_at || 0;
        const timeB = b.updated_time || b.last_message_at || 0;
        return timeB - timeA;
    });

    let optionsHtml = '';
    sorted.forEach((conv, index) => {
        const convId = conv.id || conv.conversation_id || `conv_${index}`;
        const convType = conv.type || 'INBOX';
        const typeIcon = convType === 'COMMENT' ? '💬' : '📨';
        const timeAgo = formatConversationTimeAgo(conv.updated_time || conv.last_message_at);
        const isSelected = selectedConvId === convId || index === 0 ? 'selected' : '';

        optionsHtml += `<option value="${convId}" ${isSelected}>${typeIcon} ${convType} - ${timeAgo}</option>`;
    });

    select.innerHTML = optionsHtml;
    selectorContainer.style.display = 'block';
};

window.hideConversationSelector = function() {
    const selector = document.getElementById('chatConversationSelector');
    if (selector) {
        selector.style.display = 'none';
    }
};

function formatConversationTimeAgo(timestamp) {
    if (!timestamp) return '';
    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 60) return 'vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
    return `${Math.floor(diff / 604800)} tuần trước`;
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================
function formatChatTime(timestamp) {
    if (!timestamp) return '';

    const date = typeof timestamp === 'number'
        ? new Date(timestamp * 1000)
        : new Date(timestamp);

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
        return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupNewMessageIndicatorListener() {
    // Placeholder for realtime message indicator
}

function setupRealtimeMessages() {
    // Placeholder for realtime message updates
}

// =====================================================
// KEYBOARD SHORTCUTS
// =====================================================
document.addEventListener('keydown', function(e) {
    // ESC to close chat modal
    if (e.key === 'Escape') {
        const modal = document.getElementById('chatModal');
        if (modal && modal.classList.contains('show')) {
            closeChatModal();
        }
    }

    // Enter to send message (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
        const input = document.getElementById('chatReplyInput');
        if (document.activeElement === input) {
            e.preventDefault();
            sendChatMessage();
        }
    }
});

// =====================================================
// EXPORTS
// =====================================================
window.openChatModal = openChatModal;
window.openCommentModal = openCommentModal;
window.closeChatModal = closeChatModal;
window.sendChatMessage = sendChatMessage;
window.replyToComment = replyToComment;
window.loadChatMessages = loadChatMessages;
window.loadChatComments = loadChatComments;
window.renderChatMessages = renderChatMessages;
window.renderComments = renderComments;
window.autoMarkAsRead = autoMarkAsRead;
window.updateReadBadge = updateReadBadge;
window.updateMarkButton = updateMarkButton;
window.formatChatTime = formatChatTime;
window.setupChatInfiniteScroll = setupChatInfiniteScroll;
window.setupNewMessageIndicatorListener = setupNewMessageIndicatorListener;
window.setupRealtimeMessages = setupRealtimeMessages;

console.log('[TAB1-CHAT] Module loaded');
