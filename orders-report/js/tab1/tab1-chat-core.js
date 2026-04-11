// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
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
window.currentReplyType = 'private_replies'; // for COMMENT: 'reply_comment' | 'private_replies'
window.isSendingMessage = false;

// Per-page conversation cache: Map<`${psid}:${pageId}:${type}`, convObject>
// Persists across page switches within the same modal session.
// Cleared on modal close.
window._pageConvCache = new Map();

// Send QR image directly to current chat (called from chat header "Gửi mã QR" button)
window.sendQRFromChatHeader = async function() {
    const phone = (window.currentChatPhone || '').trim();
    if (!phone) {
        window.notificationManager?.warning?.('Khách hàng chưa có SĐT') || alert('Khách hàng chưa có SĐT');
        return;
    }
    if (typeof window.getOrCreateQRForPhone !== 'function' || typeof window.generateVietQRUrl !== 'function') {
        alert('Chức năng QR chưa sẵn sàng');
        return;
    }
    if (typeof window.sendImageToChat !== 'function') {
        alert('Chức năng gửi ảnh chưa sẵn sàng');
        return;
    }
    const normalizedPhone = (typeof window.normalizePhoneForQR === 'function')
        ? window.normalizePhoneForQR(phone) : phone;
    const uniqueCode = window.getOrCreateQRForPhone(normalizedPhone);
    if (!uniqueCode) {
        window.notificationManager?.error?.('Không thể tạo mã QR') || alert('Không thể tạo mã QR');
        return;
    }
    const qrUrl = window.generateVietQRUrl(uniqueCode, 0);
    await window.sendImageToChat(qrUrl, 'QR Chuyển khoản', 'qr-' + uniqueCode);
};

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
    const body = JSON.stringify({ psid, pageId: pageId || null });
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
    // Fire and forget to BOTH servers
    fetch('https://n2store-fallback.onrender.com/api/realtime/mark-replied', opts).catch(() => {});
    fetch('https://n2store-realtime.onrender.com/api/realtime/mark-replied', opts).catch(() => {});
}

// =====================================================
// CHAT DEBT BADGE - reuses renderWalletDebtBadges() from customer column
// =====================================================

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
    // Extract name only, excluding wallet debt badge text
    const nameEl_ = orderRow?.querySelector('.customer-name');
    if (nameEl_) {
        const clone = nameEl_.cloneNode(true);
        clone.querySelectorAll('.wallet-debt-badge').forEach(b => b.remove());
        window.currentCustomerName = clone.textContent.trim();
    } else {
        window.currentCustomerName = '';
    }
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

    // Show/hide copy phone icon
    const copyPhoneBtn = document.getElementById('chatCopyPhone');
    if (copyPhoneBtn) {
        copyPhoneBtn.style.display = window.currentChatPhone ? 'inline' : 'none';
        copyPhoneBtn.onclick = function(e) {
            e.stopPropagation();
            navigator.clipboard.writeText(window.currentChatPhone).then(() => {
                copyPhoneBtn.className = 'fas fa-check chat-copy-phone';
                copyPhoneBtn.style.color = '#4ade80';
                setTimeout(() => {
                    copyPhoneBtn.className = 'fas fa-copy chat-copy-phone';
                    copyPhoneBtn.style.color = '';
                }, 1500);
            });
        };
    }

    // Render total debt badge (green)
    const debtContainer = document.getElementById('chatDebtBadgesContainer');
    if (debtContainer) {
        debtContainer.innerHTML = typeof renderWalletDebtBadges === 'function'
            ? renderWalletDebtBadges(window.currentChatPhone) : '';
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

    // Populate page selector for multi-page search
    _populatePageSelector();
    _updateRepickBtnVisibility();

    // Find conversation and load messages
    const myToken = ++window._chatLoadSeq;
    try {
        await _findAndLoadConversation(pageId, psid, conversationType, myToken);
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

    // Stop chat polling
    _stopChatPolling();
    _closePageDropdown();

    // Cleanup Firebase realtime listeners to prevent memory leaks
    if (window._chatRealtimeUnsubscribe) {
        try { window._chatRealtimeUnsubscribe(); } catch (e) { /* ignore */ }
        window._chatRealtimeUnsubscribe = null;
    }
    if (window._chatPrivateReplyUnsubscribe) {
        try { window._chatPrivateReplyUnsubscribe(); } catch (e) { /* ignore */ }
        window._chatPrivateReplyUnsubscribe = null;
    }

    // Invalidate any in-flight loads
    window._chatLoadSeq = (window._chatLoadSeq || 0) + 1;
    clearTimeout(window._chatUpdateDebounce);
    if (window._chatUpdateDebounceMap) {
        window._chatUpdateDebounceMap.forEach(id => clearTimeout(id));
        window._chatUpdateDebounceMap.clear();
    }
    if (window._chatFindInFlight) window._chatFindInFlight.clear();
    if (window._pageConvCache) window._pageConvCache.clear();

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

async function _findAndLoadConversation(pageId, psid, type, loadToken, opts) {
    // In-flight dedupe — coalesce identical concurrent requests
    const dedupeKey = `${pageId}:${psid}:${type}`;
    const inflight = window._chatFindInFlight.get(dedupeKey);
    if (inflight && (Date.now() - inflight.ts) < 3000) {
        return inflight.promise;
    }
    const promise = _doFindAndLoadConversation(pageId, psid, type, loadToken, opts);
    window._chatFindInFlight.set(dedupeKey, { promise, ts: Date.now() });
    promise.finally(() => {
        const cur = window._chatFindInFlight.get(dedupeKey);
        if (cur && cur.promise === promise) window._chatFindInFlight.delete(dedupeKey);
    });
    return promise;
}

async function _doFindAndLoadConversation(pageId, psid, type, loadToken, opts) {
    const allowDrift = opts?.allowDrift !== false; // default true
    const pdm = window.pancakeDataManager;
    if (!pdm) throw new Error('pancakeDataManager not available');

    // If caller didn't supply a token, allocate one so we still guard
    if (loadToken == null) loadToken = ++window._chatLoadSeq;
    const _isStale = () => loadToken !== window._chatLoadSeq;
    const _byUpdatedAtDesc = (a, b) =>
        new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();

    let conv = null;

    // Check per-page conv cache first (populated by previous switch)
    const cacheKey = `${psid}:${pageId}:${type}`;
    const cached = window._pageConvCache.get(cacheKey);
    if (cached) {
        conv = cached;
    } else if (!allowDrift) {
        // Explicit page switch: PSID is page-specific (different per page),
        // so we search by customer NAME across all pages, then filter by target.
        const customerName = window.currentCustomerName;
        let foundConvs = [];

        if (customerName && pdm.searchConversations) {
            const searchResult = await pdm.searchConversations(customerName);
            foundConvs = (searchResult.conversations || []).filter(c =>
                String(c.page_id) === String(pageId)
            );
        }
        // Fallback: try page-specific API with PSID (works if same psid)
        if (foundConvs.length === 0) {
            const result = await pdm.fetchConversationsByCustomerFbId(pageId, psid);
            foundConvs = (result.conversations || []).filter(c =>
                String(c.page_id) === String(pageId)
            );
        }

        if (_isStale()) return;

        if (foundConvs.length === 0) {
            // No conversations on this page
            conv = null;
        } else if (foundConvs.length === 1) {
            // Exactly 1 → auto-load
            conv = foundConvs[0];
        } else {
            // Multiple → show picker so user can choose
            foundConvs.sort(_byUpdatedAtDesc);
            _showConversationPicker(foundConvs, pageId, loadToken);
            return;
        }
    } else if (type === 'COMMENT') {
        // COMMENT: Always fetch fresh from API (cache may hold stale/deleted conversations)
        const result = await pdm.fetchConversationsByCustomerFbId(pageId, psid);
        const commentConvs = (result.conversations || []).filter(c => c.type === 'COMMENT');

        if (commentConvs.length > 0) {
            commentConvs.sort(_byUpdatedAtDesc);
            conv = commentConvs[0];
        }

        // Fallback: multi-page search
        if (!conv) {
            const mpResult = await pdm.fetchConversationsByCustomerIdMultiPage(psid);
            const mpConvs = (mpResult.conversations || []).filter(c => c.type === 'COMMENT');
            if (mpConvs.length > 0) {
                mpConvs.sort(_byUpdatedAtDesc);
                conv = mpConvs.find(c => String(c.page_id) === String(pageId)) || mpConvs[0];
            }
        }
    } else {
        // INBOX: Use cached maps first, then API fallback
        conv = pdm.inboxMapByPSID.get(String(psid)) || pdm.inboxMapByFBID.get(String(psid));

        if (!conv) {
            const result = await pdm.fetchConversationsByCustomerFbId(pageId, psid);
            const convs = result.conversations || [];
            conv = convs.find(c => c.type === 'INBOX') || convs[0] || null;
        }

        // Fallback: multi-page search
        if (!conv) {
            const result = await pdm.fetchConversationsByCustomerIdMultiPage(psid);
            const convs = result.conversations || [];
            conv = convs.find(c => c.type === type && String(c.page_id) === String(pageId))
                || convs.find(c => String(c.page_id) === String(pageId))
                || convs.find(c => c.type === type)
                || convs[0] || null;
        }
    }

    if (_isStale()) return;

    if (!conv) {
        const messagesEl = document.getElementById('chatMessages');
        if (messagesEl) {
            const pageName = (pdm.pages || []).find(p => String(p.id) === String(pageId))?.name || pageId;
            messagesEl.innerHTML = allowDrift
                ? '<div class="chat-empty-state"><p>Không tìm thấy cuộc hội thoại với khách hàng này.</p></div>'
                : `<div class="chat-empty-state"><p>Không tìm thấy cuộc hội thoại trên <b>${pageName}</b>.</p></div>`;
        }
        return;
    }

    window.currentConversationId = conv.id;
    window.currentConversationData = conv;

    // Save to per-page conv cache for quick re-switch
    // Only cache if conv actually belongs to the requested page
    const convPageId = conv.page_id || pageId;
    if (String(convPageId) === String(pageId)) {
        window._pageConvCache.set(cacheKey, conv);
    }

    // Use correct pageId from conversation (may differ from order's pageId)
    // Only drift when allowed (initial open = yes, explicit switch = no)
    if (allowDrift && String(convPageId) !== String(pageId)) {
        window.currentChatChannelId = convPageId;
        window.currentSendPageId = convPageId;
        // Sync popup so UI doesn't lie about which page we're chatting from
        _updatePageSelectorActive(convPageId);
    }

    // Enrich thread_id if missing (needed for extension bypass / GET_GLOBAL_ID_FOR_CONV)
    // inboxMapByPSID cache and messages API often don't have thread_id,
    // but conversation list API does. Fire background fetch to get it.
    if (!conv.thread_id && type !== 'COMMENT') {
        pdm.fetchConversationsByCustomerFbId(convPageId, psid).then(result => {
            const apiConv = (result.conversations || []).find(c => c.id === conv.id);
            if (apiConv?.thread_id && window.currentConversationData?.id === conv.id) {
                window.currentConversationData.thread_id = apiConv.thread_id;
                // Also set in _raw for buildConvData
                if (window.currentConversationData._raw) {
                    window.currentConversationData._raw.thread_id = apiConv.thread_id;
                }
                console.log('[Chat-Core] Enriched thread_id:', apiConv.thread_id);
            }
        }).catch(() => {});
    }

    // Load messages - customerId from customers array or from.id
    const customerId = conv.customers?.[0]?.id || conv.customerId || conv.customer?.id || conv.from?.id || null;
    await _loadMessages(convPageId, conv.id, customerId, loadToken);
}

/**
 * Load messages for a conversation
 */
async function _loadMessages(pageId, conversationId, customerId, loadToken) {
    const pdm = window.pancakeDataManager;
    if (!pdm) return;
    if (loadToken == null) loadToken = window._chatLoadSeq;
    const _isStale = () => loadToken !== window._chatLoadSeq;

    try {
        const result = await pdm.fetchMessages(pageId, conversationId, null, customerId);
        if (_isStale()) return;

        // Store conversation data (for extension bypass - thread_id, global_id)
        if (result.conversation) {
            const rc = result.conversation;
            if (!window.currentConversationData) window.currentConversationData = {};
            // Preserve thread_id from conversation list API (messages API often lacks it)
            const existingThreadId = window.currentConversationData.thread_id
                || window.currentConversationData._raw?.thread_id;
            window.currentConversationData._raw = rc;
            if (!rc.thread_id && existingThreadId) {
                rc.thread_id = existingThreadId;
            }
            window.currentConversationData.customers = result.customers || [];
            window.currentConversationData._messagesData = {
                customers: result.customers || [],
                post: result.post || null,
                activities: result.activities || [],
            };

            // Proactive global_id caching — cache immediately when available
            const cacheKey = conversationId || `${pageId}_${window.currentChatPSID}`;
            const gid = rc.page_customer?.global_id
                || (result.customers || []).find(c => c.global_id)?.global_id;
            if (gid) _setGlobalIdCache(cacheKey, gid);
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

        // Auto-mark private reply messages in store (for cross-device sync)
        if (window.currentConversationType === 'COMMENT' && window.PrivateReplyStore) {
            messages.forEach(m => {
                if (m.privateReplyConversation && !window.PrivateReplyStore.has(m.id)) {
                    window.PrivateReplyStore.mark(m.id, m.text, m.senderName);
                }
            });
        }

        // Reconcile any optimistic private-reply placeholders ("pr_*") with
        // real shop messages from server (text+60s match). Surviving optimistic
        // are appended so user still sees their pending sends.
        const survivors = window._reconcileOptimisticReplies(window.allChatMessages, messages)
            .filter(m => typeof m.id === 'string' && m.id.startsWith('pr_'));
        if (survivors.length) messages.push(...survivors);

        window.allChatMessages = messages;
        window.currentChatCursor = messages.length;

        // Render
        if (window.renderChatMessages) {
            window.renderChatMessages(messages);
        }
    } catch (e) {
        if (_isStale()) return;
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

    // Snapshot conv identity at start to detect switch during fetch
    const startToken = window._chatLoadSeq;
    const startConvId = window.currentConversationId;
    const startPageId = window.currentChatChannelId;

    try {
        const pdm = window.pancakeDataManager;
        if (!pdm) return;

        const result = await pdm.fetchMessages(
            startPageId,
            startConvId,
            window.currentChatCursor
        );

        // Bail if user switched conversation/page/type while we were fetching
        if (startToken !== window._chatLoadSeq ||
            startConvId !== window.currentConversationId ||
            startPageId !== window.currentChatChannelId) {
            return;
        }

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
// SHARED: reset per-conversation transient state
// (used when switching page, switching type, etc.)
// =====================================================

// Monotonic load token — guards against stale fetch resolving after a newer switch
window._chatLoadSeq = 0;

function _resetTransientChatState() {
    window.currentConversationId = null;
    window.currentConversationData = null;
    window.allChatMessages = [];
    window.currentChatCursor = null;
    window.currentReplyMessage = null;
    window.isLoadingMoreMessages = false;
    const preview = document.getElementById('replyPreview');
    if (preview) preview.classList.remove('active');
    if (typeof window.clearImagePreviews === 'function') {
        try { window.clearImagePreviews(); } catch (_) {}
    }
}

// Shared: reconcile optimistic private-reply placeholders ("pr_*") in `existing`
// against `incoming` real shop messages by text+60s window. Mutates store marks.
window._reconcileOptimisticReplies = function(existing, incoming) {
    if (!existing?.length || !incoming?.length) return existing || [];
    const realShopTexts = new Set(
        incoming.filter(m => m.sender === 'shop').map(m => (m.text || '').trim())
    );
    const survivors = [];
    for (const o of existing) {
        if (typeof o.id !== 'string' || !o.id.startsWith('pr_')) {
            survivors.push(o);
            continue;
        }
        const txt = (o.text || '').trim();
        if (!realShopTexts.has(txt)) {
            survivors.push(o);
            continue;
        }
        // Matched — migrate PrivateReplyStore mark to real id
        const real = incoming.find(m => m.sender === 'shop' && (m.text || '').trim() === txt);
        if (real && window.PrivateReplyStore?.has?.(o.id)) {
            try {
                window.PrivateReplyStore.mark(real.id, o.text, o.senderName);
                window.PrivateReplyStore.unmark?.(o.id);
            } catch (_) {}
        }
    }
    return survivors;
};

// In-flight dedupe map for _findAndLoadConversation
// key: `${pageId}:${psid}:${type}` → { promise, ts }
window._chatFindInFlight = new Map();

// Bounded LRU for global_id cache (avoid unbounded growth)
const _GLOBAL_ID_CACHE_MAX = 200;
function _setGlobalIdCache(key, value) {
    if (!window._globalIdCache) window._globalIdCache = {};
    const cache = window._globalIdCache;
    if (cache[key]) return; // already set
    cache[key] = value;
    const keys = Object.keys(cache);
    if (keys.length > _GLOBAL_ID_CACHE_MAX) {
        // Drop oldest 20% (insertion order in JS objects is preserved for string keys)
        const drop = Math.ceil(_GLOBAL_ID_CACHE_MAX * 0.2);
        for (let i = 0; i < drop; i++) delete cache[keys[i]];
    }
}

// =====================================================
// CONVERSATION TYPE SWITCHING
// =====================================================

window.switchConversationType = async function(type) {
    if (type === window.currentConversationType) return;
    window.currentConversationType = type;

    _updateTypeToggle(type);
    const myToken = ++window._chatLoadSeq;
    _resetTransientChatState();

    // Re-find conversation with new type
    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) {
        messagesEl.innerHTML = '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tải...</p></div>';
    }

    try {
        await _findAndLoadConversation(
            window.currentChatChannelId,
            window.currentChatPSID,
            type,
            myToken
        );
    } catch (e) {
        if (myToken !== window._chatLoadSeq) return;
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
        if (type === 'COMMENT') {
            replyTypeSelect.value = 'private_replies';
            window.currentReplyType = 'private_replies';
        }
    }

    // Update input placeholder
    const input = document.getElementById('chatInput');
    if (input) {
        input.placeholder = type === 'COMMENT' ? 'Nhắn riêng cho khách...' : 'Nhập tin nhắn...';
    }
}

// =====================================================
// PAGE SELECTOR (switch customer conversation to different page)
// =====================================================

function _populatePageSelector() {
    const container = document.getElementById('chatPageSelector');
    if (!container) return;

    const pdm = window.pancakeDataManager;
    if (!pdm || !pdm.pages || pdm.pages.length <= 1) {
        container.style.display = 'none';
        return;
    }

    container.style.display = '';

    // Render dropdown items
    _renderPageSelectorItems();

    // Update label to current page
    _updatePageSelectorLabel(window.currentChatChannelId);

    // Bind toggle (only once)
    const btn = document.getElementById('chatPageSelectorBtn');
    if (btn && !btn._pageSelectorBound) {
        btn._pageSelectorBound = true;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            _togglePageDropdown();
        });
        // Click-outside to close
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.chat-page-selector')) {
                _closePageDropdown();
            }
        });
    }
}

function _renderPageSelectorItems() {
    const dropdown = document.getElementById('chatPageSelectorDropdown');
    if (!dropdown) return;

    const pdm = window.pancakeDataManager;
    const pages = pdm?.pages || [];
    const currentId = String(window.currentChatChannelId || '');

    let html = '';
    for (const page of pages) {
        const pageId = String(page.id);
        const name = page.name || page.id;
        const isActive = pageId === currentId;
        const initial = (name || 'P').charAt(0).toUpperCase();
        const avatarHtml = page.avatar
            ? `<img src="${page.avatar}" class="chat-page-item-avatar" alt="" onerror="this.outerHTML='<div class=\\'chat-page-item-avatar-ph\\'>${initial}</div>'">`
            : `<div class="chat-page-item-avatar-ph">${initial}</div>`;

        html += `<div class="chat-page-item${isActive ? ' active' : ''}" data-page-id="${pageId}">
            ${avatarHtml}
            <span class="chat-page-item-name">${_escapeHtml(name)}</span>
            <span class="material-symbols-outlined chat-page-item-check">check</span>
        </div>`;
    }

    dropdown.innerHTML = html;

    // Bind clicks
    dropdown.querySelectorAll('.chat-page-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const pageId = item.dataset.pageId;
            _closePageDropdown();
            if (pageId && String(pageId) !== String(window.currentChatChannelId)) {
                _updatePageSelectorLabel(pageId);
                _renderPageSelectorItems();
                window.switchChatPage(pageId);
            }
        });
    });
}

function _updatePageSelectorLabel(pageId) {
    const label = document.getElementById('chatPageSelectorLabel');
    if (!label) return;
    const pdm = window.pancakeDataManager;
    const page = (pdm?.pages || []).find(p => String(p.id) === String(pageId));
    label.textContent = page?.name || 'Page';
}

function _updatePageSelectorActive(pageId) {
    _updatePageSelectorLabel(pageId);
    _renderPageSelectorItems();
}

function _togglePageDropdown() {
    const container = document.getElementById('chatPageSelector');
    const dropdown = document.getElementById('chatPageSelectorDropdown');
    if (!container || !dropdown) return;
    const isOpen = dropdown.style.display !== 'none';
    if (isOpen) {
        dropdown.style.display = 'none';
    } else {
        // Position fixed dropdown below the button, right-aligned but capped
        const btn = document.getElementById('chatPageSelectorBtn');
        if (btn) {
            const rect = btn.getBoundingClientRect();
            const dropW = 190;
            let left = rect.right - dropW;
            if (left < 8) left = rect.left;
            if (left < 8) left = 8;
            dropdown.style.top = (rect.bottom + 4) + 'px';
            dropdown.style.left = left + 'px';
            dropdown.style.right = '';
        }
        dropdown.style.display = '';
    }
    container.classList.toggle('open', !isOpen);
}

function _closePageDropdown() {
    const container = document.getElementById('chatPageSelector');
    const dropdown = document.getElementById('chatPageSelectorDropdown');
    if (dropdown) dropdown.style.display = 'none';
    if (container) container.classList.remove('open');
}

function _escapeHtml(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
}

// =====================================================
// CONVERSATION PICKER (multiple convs on a page)
// =====================================================

function _showConversationPicker(convs, pageId, loadToken) {
    const messagesEl = document.getElementById('chatMessages');
    if (!messagesEl) return;

    const pdm = window.pancakeDataManager;
    const pageName = (pdm?.pages || []).find(p => String(p.id) === String(pageId))?.name || pageId;

    let html = `<div class="chat-conv-picker">
        <div class="chat-conv-picker-title">Chọn cuộc hội thoại trên ${_escapeHtml(pageName)}</div>`;

    for (const conv of convs) {
        const isInbox = conv.type === 'INBOX';
        const icon = isInbox ? 'mail' : 'chat_bubble';
        const typeClass = isInbox ? 'inbox' : 'comment';
        const typeLabel = isInbox ? 'Tin nhắn' : 'Bình luận';
        const snippet = _escapeHtml(conv.snippet || conv.last_message?.text || '');
        const name = _escapeHtml(conv.from?.name || 'Khách hàng');
        const time = conv.updated_at ? _formatPickerTime(conv.updated_at) : '';

        html += `<div class="chat-conv-picker-item" data-conv-id="${conv.id}" data-page-id="${pageId}">
            <div class="chat-conv-picker-item-icon ${typeClass}">
                <span class="material-symbols-outlined">${icon}</span>
            </div>
            <div class="chat-conv-picker-item-info">
                <div class="chat-conv-picker-item-name">${name} · ${typeLabel}</div>
                <div class="chat-conv-picker-item-snippet">${snippet}</div>
            </div>
            <div class="chat-conv-picker-item-time">${time}</div>
        </div>`;
    }

    html += '</div>';
    messagesEl.innerHTML = html;

    // Bind clicks
    messagesEl.querySelectorAll('.chat-conv-picker-item').forEach(item => {
        item.addEventListener('click', () => {
            const convId = item.dataset.convId;
            const conv = convs.find(c => c.id === convId);
            if (conv) _pickConversation(conv, pageId, loadToken);
        });
    });
}

async function _pickConversation(conv, pageId, loadToken) {
    if (loadToken != null && loadToken !== window._chatLoadSeq) return;

    window.currentConversationId = conv.id;
    window.currentConversationData = conv;
    window.currentConversationType = conv.type === 'COMMENT' ? 'COMMENT' : 'INBOX';

    // Update type toggle
    _updateTypeToggle(window.currentConversationType);

    // Cache for re-switch
    const cacheKey = `${window.currentChatPSID}:${pageId}:${conv.type}`;
    window._pageConvCache.set(cacheKey, conv);

    // Show loading
    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) {
        messagesEl.innerHTML = '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tải...</p></div>';
    }

    // Load messages
    const customerId = conv.customers?.[0]?.id || conv.from?.id || null;
    await _loadMessages(pageId, conv.id, customerId, loadToken);
}

function _formatPickerTime(dateStr) {
    try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.floor((now - d) / 86400000);
        if (diffDays === 0) {
            return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays < 7) {
            return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
        }
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    } catch (_) { return ''; }
}

// Show/hide re-pick button (visible when >1 page available)
function _updateRepickBtnVisibility() {
    const btn = document.getElementById('chatRepickConvBtn');
    if (!btn) return;
    const pdm = window.pancakeDataManager;
    btn.style.display = (pdm?.pages?.length > 1) ? '' : 'none';
}

/**
 * Re-pick conversation: clear cache for current page+psid+type,
 * then re-fetch fresh from API.
 */
window.repickConversation = async function() {
    const pageId = window.currentChatChannelId;
    const psid = window.currentChatPSID;
    const type = window.currentConversationType;
    if (!pageId || !psid) return;

    // Clear cache for this key so _doFindAndLoadConversation fetches fresh
    const cacheKey = `${psid}:${pageId}:${type}`;
    window._pageConvCache.delete(cacheKey);

    const myToken = ++window._chatLoadSeq;
    _resetTransientChatState();

    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) {
        messagesEl.innerHTML = '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tìm đoạn hội thoại...</p></div>';
    }

    try {
        await _findAndLoadConversation(pageId, psid, type, myToken, { allowDrift: false });
    } catch (e) {
        if (myToken !== window._chatLoadSeq) return;
        if (messagesEl) {
            messagesEl.innerHTML = '<div class="chat-empty-state"><p>Không tìm thấy cuộc hội thoại.</p></div>';
        }
    }
};

window.switchChatPage = async function(newPageId) {
    if (!newPageId || String(newPageId) === String(window.currentChatChannelId)) return;

    window.currentChatChannelId = newPageId;
    window.currentSendPageId = newPageId;
    const myToken = ++window._chatLoadSeq;
    _resetTransientChatState();

    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) {
        messagesEl.innerHTML = '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tải...</p></div>';
    }

    try {
        await _findAndLoadConversation(newPageId, window.currentChatPSID, window.currentConversationType, myToken, { allowDrift: false });
    } catch (e) {
        if (myToken !== window._chatLoadSeq) return;
        console.error('[Chat-Core] switchChatPage error:', e);
        if (messagesEl) {
            messagesEl.innerHTML = '<div class="chat-empty-state"><p>Không tìm thấy cuộc hội thoại trên trang này.</p></div>';
        }
    }
};

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
    // Register WS handlers if not already done
    if (window.realtimeManager && !window._chatRealtimeRegistered) {
        window._chatRealtimeRegistered = true;

        window.realtimeManager.on('pages:new_message', (payload) => {
            if (window.handleNewMessage) window.handleNewMessage(payload);
        });

        window.realtimeManager.on('pages:update_conversation', (payload) => {
            if (window.handleConversationUpdate) window.handleConversationUpdate(payload);
        });
    }

    // Listen for bulk send completion → immediate refresh
    if (!window._bulkSendListenerRegistered) {
        window._bulkSendListenerRegistered = true;
        window.addEventListener('bulkSendCompleted', async () => {
            const convId = window.currentConversationId;
            const pageId = window.currentChatChannelId;
            if (!convId || !pageId || !window.pancakeDataManager) return;
            try {
                window.pancakeDataManager.clearMessagesCache(pageId, convId);
                const result = await window.pancakeDataManager.fetchMessages(pageId, convId);
                if (!result.messages?.length || window.currentConversationId !== convId) return;
                const existingIds = new Set(window.allChatMessages.map(m => String(m.id)));
                const newMsgs = result.messages.filter(m => !existingIds.has(String(m.id)));
                for (const msg of newMsgs) {
                    window.handleNewMessage?.({ message: msg, page_id: pageId });
                }
            } catch (e) { /* silent */ }
        });
    }

    // Polling removed — rely entirely on WS real-time (handleNewMessage)
}

function _stopChatPolling() {
    if (window._chatPollTimer) {
        clearInterval(window._chatPollTimer);
        window._chatPollTimer = null;
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

