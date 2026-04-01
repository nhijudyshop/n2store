/* =====================================================
   TAB1 CHAT CORE - Modal lifecycle, state management
   Adapted from inbox/js/inbox-chat.js InboxChatController
   ===================================================== */

// =====================================================
// GLOBAL STATE
// =====================================================

window.currentConversationId = null;
window.currentConversationType = null;  // 'INBOX' | 'COMMENT'
window.currentChatChannelId = null;     // pageId
window.currentChatPSID = null;
window.currentCustomerName = null;
window.currentConversationData = null;  // full Pancake conversation object
window.allChatMessages = [];
window.currentChatCursor = null;        // pagination cursor (current_count)
window.isLoadingMoreMessages = false;
window.currentReplyMessage = null;      // reply-to context {id, text, sender}
window.currentSendPageId = null;        // override send from page
window.currentReplyType = 'reply_comment'; // for COMMENT: 'reply_comment' | 'private_replies'
window.isSendingMessage = false;

/**
 * Get avatar URL for a customer — same 4-tier fallback as inbox-chat.js
 * Extracts direct avatar from currentConversationData, then falls back to proxy.
 */
window._getChatAvatarUrl = function(psid, pageId) {
    const conv = window.currentConversationData || {};
    const raw = conv._raw || {};
    // Same priority as inbox: conv.avatar → from.picture → from.profile_pic → customers[].avatar
    const directAvatar = conv.avatar
        || raw.from?.picture?.data?.url
        || raw.from?.profile_pic
        || raw.customers?.[0]?.avatar
        || conv.customers?.[0]?.avatar
        || null;
    if (window.pancakeDataManager?.getAvatarUrl) {
        return window.pancakeDataManager.getAvatarUrl(psid, pageId, null, directAvatar);
    }
    return directAvatar || `https://graph.facebook.com/${psid}/picture?type=small`;
};

// =====================================================
// MARK REPLIED ON SERVER (clear pending_customers)
// =====================================================

function _markRepliedOnServer(psid, pageId) {
    if (!psid) return;
    const API_BASE = 'https://n2store-fallback.onrender.com';
    fetch(`${API_BASE}/api/realtime/mark-replied`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psid, pageId: pageId || null })
    }).catch(() => {}); // Fire and forget
}

// =====================================================
// MODAL LIFECYCLE
// =====================================================

/**
 * Open chat modal for an order
 * Called from tab1-table.js onclick handlers (openCommentModal / openChatModal)
 * @param {string} orderId - Order ID
 * @param {string} pageId - Facebook Page ID (channelId)
 * @param {string} psid - Customer PSID
 * @param {string} [conversationType] - 'INBOX' or 'COMMENT', defaults to 'INBOX'
 */
window.openChatModal = async function(orderId, pageId, psid, conversationType) {
    const modal = document.getElementById('chatModal');
    if (!modal) return;

    conversationType = conversationType || 'INBOX';

    // Set state
    window.currentChatOrderId = orderId;
    window.currentChatChannelId = pageId;
    window.currentChatPSID = psid;
    window.currentConversationType = conversationType;
    window.currentConversationId = null;
    window.currentConversationData = null;
    window.allChatMessages = [];
    window.currentChatCursor = null;
    window.currentReplyMessage = null;
    window.currentSendPageId = pageId;
    window.isSendingMessage = false;

    // Get customer name and phone from order row
    const orderRow = document.querySelector(`tr[data-order-id="${orderId}"]`);
    window.currentCustomerName = orderRow?.querySelector('.customer-name')?.textContent?.trim() || '';
    window.currentChatPhone = orderRow?.querySelector('td[data-column="phone"] span')?.textContent?.trim() || '';

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Click outside modal content to close
    modal.onclick = function(e) {
        if (e.target === modal) window.closeChatModal();
    };

    // Update header
    const nameEl = document.getElementById('chatCustomerName');
    if (nameEl) nameEl.textContent = window.currentCustomerName || 'Khách hàng';

    // Update phone number display
    const phoneEl = document.getElementById('chatPhoneNumber');
    if (phoneEl) phoneEl.textContent = window.currentChatPhone || '';

    // Load debt badge
    const debtBadge = document.getElementById('chatDebtBadge');
    if (debtBadge && window.currentChatPhone) {
        debtBadge.style.display = 'inline-flex';
        debtBadge.onclick = function(e) {
            e.stopPropagation();
            if (typeof window.openWalletDebtModal === 'function') {
                window.openWalletDebtModal(window.currentChatPhone);
            }
        };
        if (typeof window.loadChatDebt === 'function') {
            window.loadChatDebt(window.currentChatPhone);
        }
    } else if (debtBadge) {
        debtBadge.style.display = 'none';
    }

    // Update header avatar (same approach as inbox: extract direct avatar from conv data)
    const avatarEl = document.getElementById('chatCustomerAvatar');
    if (avatarEl && psid) {
        const initial = (window.currentCustomerName || 'K').charAt(0).toUpperCase();
        const imgUrl = window._getChatAvatarUrl(psid, pageId);
        avatarEl.innerHTML = `<img src="${imgUrl}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.parentElement.textContent='${initial}'">`;
    }

    // Update type toggle
    _updateTypeToggle(conversationType);

    // Update extension badge
    _updateExtensionBadge();

    // Show loading
    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) {
        messagesEl.innerHTML = '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tải tin nhắn...</p></div>';
    }

    // Clear input
    const inputEl = document.getElementById('chatInput');
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }

    // Init extension pages
    if (window.initExtensionPages && window.pancakeDataManager?.pageIds) {
        window.initExtensionPages(window.pancakeDataManager.pageIds);
    }

    // Find conversation and load messages
    try {
        await _findAndLoadConversation(pageId, psid, conversationType);
        // Clear pending badge for this customer (read messages)
        window.newMessagesNotifier?.clearPendingForCustomer(psid);
        _markRepliedOnServer(psid, pageId);
        // Auto-focus chat input so user can type immediately
        setTimeout(() => {
            const chatInputEl = document.getElementById('chatInput');
            if (chatInputEl) chatInputEl.focus();
        }, 100);
    } catch (e) {
        console.error('[Chat-Core] Error loading conversation:', e);
        if (messagesEl) {
            messagesEl.innerHTML = '<div class="chat-empty-state"><p>Không tải được tin nhắn. Vui lòng thử lại.</p></div>';
        }
    }

    // Start realtime
    _startRealtimeForChat();

    // Load order products in right panel
    if (typeof window.loadChatOrderProducts === 'function' && orderId) {
        window.loadChatOrderProducts(orderId);
    }

    // Set panel toggle button active state
    const toggleBtn = document.querySelector('.chat-panel-toggle-btn');
    const panel = document.getElementById('chatRightPanel');
    if (toggleBtn && panel) {
        toggleBtn.classList.toggle('active', !panel.classList.contains('collapsed'));
    }
};

/**
 * Open comment modal (alias for openChatModal with COMMENT type)
 * Called from tab1-table.js / tab1-encoding.js
 */
window.openCommentModal = function(orderId, pageId, psid) {
    window.openChatModal(orderId, pageId, psid, 'COMMENT');
};

/**
 * Show conversation picker (legacy compatibility)
 * Old code showed a dropdown to pick INBOX/COMMENT first.
 * New chat modal has built-in toggle, so just open INBOX directly.
 * Called from tab1-table.js and tab1-encoding.js onclick handlers.
 */
window.showConversationPicker = function(orderId, pageId, psid, event) {
    if (event) event.stopPropagation();
    window.openChatModal(orderId, pageId, psid, 'INBOX');
};

/**
 * Close chat modal
 */
window.closeChatModal = function() {
    const modal = document.getElementById('chatModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';

    // Cleanup state
    window.currentConversationId = null;
    window.currentConversationType = null;
    window.currentConversationData = null;
    window.allChatMessages = [];
    window.currentChatCursor = null;
    window.currentReplyMessage = null;
    window.isSendingMessage = false;

    // Clear image previews
    if (window.clearImagePreviews) window.clearImagePreviews();

    // Cleanup products panel
    if (typeof window.cleanupChatProducts === 'function') {
        window.cleanupChatProducts();
    }
};

// Also provide closeCommentModal alias
window.closeCommentModal = window.closeChatModal;

// =====================================================
// CONVERSATION FINDING & LOADING
// =====================================================

async function _findAndLoadConversation(pageId, psid, type) {
    const pdm = window.pancakeDataManager;
    if (!pdm) throw new Error('pancakeDataManager not available');

    // Step 1: Try cached maps first
    let conv = null;
    if (type === 'INBOX') {
        conv = pdm.inboxMapByPSID.get(String(psid)) || pdm.inboxMapByFBID.get(String(psid));
    } else {
        conv = pdm.commentMapByPSID.get(String(psid)) || pdm.commentMapByFBID.get(String(psid));
    }

    // Step 2: If not in cache, use direct customer lookup API
    // GET /api/v1/pages/{pageId}/customers/{fbId}/conversations
    if (!conv) {
        const result = await pdm.fetchConversationsByCustomerFbId(pageId, psid);
        const convs = result.conversations || [];

        // Find matching type first
        conv = convs.find(c => c.type === type);

        // If no exact type match, use any conversation
        if (!conv && convs.length > 0) {
            conv = convs[0];
        }
    }

    // Step 3: Fallback - try multi-page search if single page returned nothing
    if (!conv) {
        const result = await pdm.fetchConversationsByCustomerIdMultiPage(psid);
        const convs = result.conversations || [];

        // Find matching type on same page first, then any type on same page, then any
        conv = convs.find(c => c.type === type && String(c.page_id) === String(pageId))
            || convs.find(c => String(c.page_id) === String(pageId))
            || convs.find(c => c.type === type)
            || convs[0] || null;
    }

    if (!conv) {
        const messagesEl = document.getElementById('chatMessages');
        if (messagesEl) {
            messagesEl.innerHTML = '<div class="chat-empty-state"><p>Không tìm thấy cuộc hội thoại với khách hàng này.</p></div>';
        }
        return;
    }

    window.currentConversationId = conv.id;
    window.currentConversationData = conv;

    // Use correct pageId from conversation (may differ from order's pageId)
    const convPageId = conv.page_id || pageId;
    if (convPageId !== pageId) {
        window.currentChatChannelId = convPageId;
        window.currentSendPageId = convPageId;
    }

    // Load messages - customerId from customers array or from.id
    const customerId = conv.customers?.[0]?.id || conv.customerId || conv.customer?.id || conv.from?.id || null;
    await _loadMessages(convPageId, conv.id, customerId);
}

/**
 * Load messages for a conversation
 */
async function _loadMessages(pageId, conversationId, customerId) {
    const pdm = window.pancakeDataManager;
    if (!pdm) return;

    try {
        const result = await pdm.fetchMessages(pageId, conversationId, null, customerId);

        // Store conversation data (for extension bypass - thread_id, global_id)
        if (result.conversation) {
            const rc = result.conversation;
            if (!window.currentConversationData) window.currentConversationData = {};
            window.currentConversationData._raw = rc;
            window.currentConversationData.customers = result.customers || [];
            window.currentConversationData._messagesData = {
                customers: result.customers || [],
                post: result.post || null,
                activities: result.activities || [],
            };
        }

        // Map messages
        const messages = (result.messages || []).map(msg => {
            const isFromPage = msg.from?.id === pageId;
            const text = msg.original_message || _stripHtml(msg.message || '');
            return {
                id: msg.id,
                text,
                time: _parseTimestamp(msg.inserted_at || msg.created_time) || new Date(),
                sender: isFromPage ? 'shop' : 'customer',
                senderName: msg.from?.name || '',
                fromId: msg.from?.id || '',
                attachments: msg.attachments || [],
                reactions: (msg.attachments || []).filter(a => a.type === 'reaction'),
                reactionSummary: msg.reaction_summary || msg.reactions || null,
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
        });

        window.allChatMessages = messages;
        window.currentChatCursor = messages.length;

        // Render
        if (window.renderChatMessages) {
            window.renderChatMessages(messages);
        }
    } catch (e) {
        console.error('[Chat-Core] loadMessages error:', e);
        const messagesEl = document.getElementById('chatMessages');
        if (messagesEl) {
            messagesEl.innerHTML = '<div class="chat-empty-state"><p>Lỗi tải tin nhắn: ' + (e.message || 'Unknown') + '</p></div>';
        }
    }
}

/**
 * Load more messages (scroll up pagination)
 */
window.loadMoreMessages = async function() {
    if (window.isLoadingMoreMessages || !window.currentConversationId || !window.currentChatCursor) return;
    window.isLoadingMoreMessages = true;

    try {
        const pdm = window.pancakeDataManager;
        if (!pdm) return;

        const result = await pdm.fetchMessages(
            window.currentChatChannelId,
            window.currentConversationId,
            window.currentChatCursor
        );

        const newMessages = (result.messages || []).map(msg => {
            const isFromPage = msg.from?.id === window.currentChatChannelId;
            return {
                id: msg.id,
                text: msg.original_message || _stripHtml(msg.message || ''),
                time: _parseTimestamp(msg.inserted_at || msg.created_time) || new Date(),
                sender: isFromPage ? 'shop' : 'customer',
                senderName: msg.from?.name || '',
                fromId: msg.from?.id || '',
                attachments: msg.attachments || [],
                isHidden: msg.is_hidden || false,
                isRemoved: msg.is_removed || false,
            };
        });

        if (newMessages.length > 0) {
            // Prepend older messages
            window.allChatMessages = [...newMessages, ...window.allChatMessages];
            window.currentChatCursor += newMessages.length;

            // Re-render preserving scroll position
            const messagesEl = document.getElementById('chatMessages');
            const prevScrollHeight = messagesEl?.scrollHeight || 0;

            if (window.renderChatMessages) {
                window.renderChatMessages(window.allChatMessages);
            }

            // Restore scroll position
            if (messagesEl) {
                messagesEl.scrollTop = messagesEl.scrollHeight - prevScrollHeight;
            }
        }
    } catch (e) {
        console.error('[Chat-Core] loadMoreMessages error:', e);
    } finally {
        window.isLoadingMoreMessages = false;
    }
};

// =====================================================
// CONVERSATION TYPE SWITCHING
// =====================================================

window.switchConversationType = async function(type) {
    if (type === window.currentConversationType) return;
    window.currentConversationType = type;

    _updateTypeToggle(type);

    // Re-find conversation with new type
    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) {
        messagesEl.innerHTML = '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tải...</p></div>';
    }

    try {
        await _findAndLoadConversation(
            window.currentChatChannelId,
            window.currentChatPSID,
            type
        );
    } catch (e) {
        if (messagesEl) {
            messagesEl.innerHTML = '<div class="chat-empty-state"><p>Không tìm thấy cuộc hội thoại.</p></div>';
        }
    }
};

// =====================================================
// REPLY MANAGEMENT
// =====================================================

window.setReplyMessage = function(msgId) {
    const msg = window.allChatMessages.find(m => m.id === msgId);
    if (!msg) return;

    window.currentReplyMessage = { id: msgId, text: msg.text, sender: msg.sender, senderName: msg.senderName };

    const preview = document.getElementById('replyPreview');
    if (preview) {
        preview.classList.add('active');
        const textEl = preview.querySelector('.reply-text');
        if (textEl) textEl.textContent = msg.text?.substring(0, 100) || '[Tin nhắn]';
    }

    // Focus input
    const input = document.getElementById('chatInput');
    if (input) input.focus();
};

window.cancelReply = function() {
    window.currentReplyMessage = null;
    const preview = document.getElementById('replyPreview');
    if (preview) preview.classList.remove('active');
};

// =====================================================
// REPLY TYPE MANAGEMENT (COMMENT mode)
// =====================================================

window.setReplyType = function(type) {
    window.currentReplyType = type;
    const select = document.getElementById('replyTypeSelect');
    if (select) select.value = type;

    // Update input placeholder
    const input = document.getElementById('chatInput');
    if (input) {
        input.placeholder = type === 'private_replies'
            ? 'Nhắn riêng cho khách...'
            : 'Trả lời bình luận...';
    }
};

// =====================================================
// INTERNAL HELPERS
// =====================================================

function _updateTypeToggle(type) {
    document.querySelectorAll('.conv-type-toggle button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });

    // Show/hide reply type selector
    const replyTypeSelect = document.getElementById('replyTypeSelect');
    if (replyTypeSelect) {
        replyTypeSelect.classList.toggle('hidden', type !== 'COMMENT');
    }

    // Update input placeholder
    const input = document.getElementById('chatInput');
    if (input) {
        input.placeholder = type === 'COMMENT' ? 'Trả lời bình luận...' : 'Nhập tin nhắn...';
    }
}

function _updateExtensionBadge() {
    const badge = document.getElementById('extensionBadge');
    if (badge) {
        if (window.pancakeExtension?.connected) {
            badge.classList.remove('hidden');
            badge.classList.add('connected');
            badge.textContent = 'EXT';
        } else {
            badge.classList.add('hidden');
        }
    }
}

function _startRealtimeForChat() {
    if (!window.realtimeManager) return;

    // Register handlers if not already done
    if (!window._chatRealtimeRegistered) {
        window._chatRealtimeRegistered = true;

        window.realtimeManager.on('pages:new_message', (payload) => {
            if (window.handleNewMessage) window.handleNewMessage(payload);
        });

        window.realtimeManager.on('pages:update_conversation', (payload) => {
            if (window.handleConversationUpdate) window.handleConversationUpdate(payload);
        });
    }
}

function _stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function _parseTimestamp(ts) {
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    if (typeof ts === 'number') {
        return ts > 1e12 ? new Date(ts) : new Date(ts * 1000);
    }
    if (typeof ts === 'string') {
        // Pancake API returns UTC timestamps without timezone suffix
        // Append 'Z' to ensure correct UTC parsing (same as inbox-chat.js)
        let s = ts;
        if (!s.includes('Z') && !s.includes('+') && !s.includes('-', 10)) {
            s += 'Z';
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

// Expose helpers for other modules
window._parseTimestamp = _parseTimestamp;
window._stripHtml = _stripHtml;

