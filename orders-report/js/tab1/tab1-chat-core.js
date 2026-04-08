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

    // Invalidate any in-flight loads
    window._chatLoadSeq = (window._chatLoadSeq || 0) + 1;
    clearTimeout(window._chatUpdateDebounce);

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

async function _findAndLoadConversation(pageId, psid, type, loadToken) {
    const pdm = window.pancakeDataManager;
    if (!pdm) throw new Error('pancakeDataManager not available');

    // If caller didn't supply a token, allocate one so we still guard
    if (loadToken == null) loadToken = ++window._chatLoadSeq;
    const _isStale = () => loadToken !== window._chatLoadSeq;

    let conv = null;

    if (type === 'COMMENT') {
        // COMMENT: Always fetch fresh from API (cache may hold stale/deleted conversations)
        const result = await pdm.fetchConversationsByCustomerFbId(pageId, psid);
        const commentConvs = (result.conversations || []).filter(c => c.type === 'COMMENT');

        if (commentConvs.length > 0) {
            // Sort by updated_at desc → pick most recent
            commentConvs.sort((a, b) => {
                const ta = new Date(a.updated_at || 0).getTime();
                const tb = new Date(b.updated_at || 0).getTime();
                return tb - ta;
            });
            conv = commentConvs[0];
        }

        // Fallback: multi-page search
        if (!conv) {
            const mpResult = await pdm.fetchConversationsByCustomerIdMultiPage(psid);
            const mpConvs = (mpResult.conversations || []).filter(c => c.type === 'COMMENT');
            if (mpConvs.length > 0) {
                mpConvs.sort((a, b) => {
                    const ta = new Date(a.updated_at || 0).getTime();
                    const tb = new Date(b.updated_at || 0).getTime();
                    return tb - ta;
                });
                // Prefer same page, then most recent across all pages
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
            messagesEl.innerHTML = '<div class="chat-empty-state"><p>Không tìm thấy cuộc hội thoại với khách hàng này.</p></div>';
        }
        return;
    }

    window.currentConversationId = conv.id;
    window.currentConversationData = conv;

    // Use correct pageId from conversation (may differ from order's pageId)
    const convPageId = conv.page_id || pageId;
    if (String(convPageId) !== String(pageId)) {
        window.currentChatChannelId = convPageId;
        window.currentSendPageId = convPageId;
        // Sync dropdown so UI doesn't lie about which page we're chatting from
        const sel = document.getElementById('chatPageSelect');
        if (sel && sel.value !== String(convPageId)) {
            sel.value = String(convPageId);
        }
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
            if (!window._globalIdCache) window._globalIdCache = {};
            const cacheKey = conversationId || `${pageId}_${window.currentChatPSID}`;
            if (!window._globalIdCache[cacheKey]) {
                const gid = rc.page_customer?.global_id
                    || (result.customers || []).find(c => c.global_id)?.global_id;
                if (gid) {
                    window._globalIdCache[cacheKey] = gid;
                    console.log('[Chat-Core] Cached global_id:', gid, 'for', cacheKey);
                }
            }
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

        // Reconcile any optimistic private-reply placeholders (id "pr_*") that
        // got pushed by _sendComment but never received a real id. If a real
        // shop message with matching text exists in the new fetch, drop it.
        const optimistic = (window.allChatMessages || []).filter(m =>
            typeof m.id === 'string' && m.id.startsWith('pr_')
        );
        if (optimistic.length) {
            const realTextsRecent = new Set(
                messages.filter(m => m.sender === 'shop').map(m => (m.text || '').trim())
            );
            const survivors = optimistic.filter(o => !realTextsRecent.has((o.text || '').trim()));
            if (survivors.length) {
                // Append surviving optimistic at end so user still sees their pending sends
                messages.push(...survivors);
            }
            // Migrate PrivateReplyStore marks for matched ones
            optimistic
                .filter(o => realTextsRecent.has((o.text || '').trim()))
                .forEach(o => {
                    const real = messages.find(m => m.sender === 'shop' && (m.text || '').trim() === (o.text || '').trim());
                    if (real && window.PrivateReplyStore?.has?.(o.id)) {
                        try {
                            window.PrivateReplyStore.mark(real.id, o.text, o.senderName);
                            window.PrivateReplyStore.unmark?.(o.id);
                        } catch (_) {}
                    }
                });
        }

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
    const preview = document.getElementById('replyPreview');
    if (preview) preview.classList.remove('active');
    if (typeof window.clearImagePreviews === 'function') {
        try { window.clearImagePreviews(); } catch (_) {}
    }
}

// =====================================================
// CONVERSATION TYPE SWITCHING
// =====================================================

window.switchConversationType = async function(type) {
    if (type === window.currentConversationType) return;
    window.currentConversationType = type;

    _updateTypeToggle(type);
    _resetTransientChatState();

    const myToken = ++window._chatLoadSeq;

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
    const select = document.getElementById('chatPageSelect');
    if (!select) return;

    const pdm = window.pancakeDataManager;
    if (!pdm || !pdm.pages || pdm.pages.length <= 1) {
        select.style.display = 'none';
        return;
    }

    select.style.display = '';
    select.innerHTML = '';

    for (const page of pdm.pages) {
        const option = document.createElement('option');
        option.value = page.id;
        option.textContent = page.name || page.id;
        if (String(page.id) === String(window.currentChatChannelId)) {
            option.selected = true;
        }
        select.appendChild(option);
    }
}

window.switchChatPage = async function(newPageId) {
    if (!newPageId || String(newPageId) === String(window.currentChatChannelId)) return;

    window.currentChatChannelId = newPageId;
    window.currentSendPageId = newPageId;
    _resetTransientChatState();

    const myToken = ++window._chatLoadSeq;

    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) {
        messagesEl.innerHTML = '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tải...</p></div>';
    }

    try {
        await _findAndLoadConversation(newPageId, window.currentChatPSID, window.currentConversationType, myToken);
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

