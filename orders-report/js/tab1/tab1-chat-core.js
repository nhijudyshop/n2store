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
 * Send bill image from chat modal header
 * Uses existing BillService + InvoiceStatusStore infrastructure
 */
window.sendBillFromChat = async function() {
    const orderId = window.currentChatOrderId;
    const psid = window.currentChatPSID;
    const pageId = window.currentChatChannelId || window.currentSendPageId;

    if (!orderId || !psid) {
        window.notificationManager?.warning?.('Không có thông tin đơn hàng hoặc khách hàng');
        return;
    }

    if (!window.InvoiceStatusStore || !window.InvoiceStatusStore.has(orderId)) {
        window.notificationManager?.warning?.('Đơn hàng chưa có phiếu bán hàng');
        return;
    }

    const btn = document.getElementById('chatHeaderBillBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...'; }

    try {
        const invoiceData = window.InvoiceStatusStore.get(orderId);
        if (!invoiceData) {
            window.notificationManager?.error?.('Không tìm thấy dữ liệu phiếu bán hàng');
            return;
        }

        // Generate bill image once (reuse for preview + send)
        let billBlob = null;
        let billImageUrl = null;
        if (typeof window.BillService?.generateBillImage === 'function') {
            try {
                billBlob = await window.BillService.generateBillImage(invoiceData);
                if (billBlob) billImageUrl = URL.createObjectURL(billBlob);
            } catch (e) {
                console.warn('[CHAT] Bill image generation failed:', e.message);
            }
        }

        // Send bill via Pancake API — pass conversation ID + pre-generated blob
        const convId = window.currentConversationId;
        let sendResult = null;
        if (typeof window.BillService?.sendBillToCustomer === 'function') {
            sendResult = await window.BillService.sendBillToCustomer(invoiceData, pageId, psid, {
                conversationId: convId,
                preGeneratedBlob: billBlob
            });
        } else if (typeof window.sendBillFromMainTable === 'function') {
            await window.sendBillFromMainTable(orderId);
            sendResult = { success: true };
        } else {
            window.notificationManager?.error?.('BillService chưa sẵn sàng');
            return;
        }

        if (sendResult?.success) {
            window.notificationManager?.show?.('Đã gửi bill cho khách', 'success');
            window.InvoiceStatusStore.markBillSent?.(orderId);

            // Append bill message to chat modal (optimistic UI)
            if (window.allChatMessages && window.renderChatMessages) {
                const billMsg = {
                    id: 'bill_' + Date.now(),
                    text: `📄 Bill #${invoiceData.Number || invoiceData.Reference || orderId}`,
                    time: new Date(),
                    sender: 'shop',
                    senderName: '',
                    attachments: billImageUrl ? [{
                        type: 'image',
                        url: billImageUrl,
                        preview_url: billImageUrl
                    }] : []
                };
                window.allChatMessages.push(billMsg);
                window.renderChatMessages(window.allChatMessages);

                // Auto-scroll to bottom
                const messagesEl = document.getElementById('chatMessages');
                if (messagesEl) {
                    setTimeout(() => { messagesEl.scrollTop = messagesEl.scrollHeight; }, 100);
                }
            }

            // Update button to "sent" state
            if (btn) {
                btn.style.background = '#d1fae5';
                btn.style.color = '#059669';
                btn.style.border = '1px solid #6ee7b7';
                btn.innerHTML = '<i class="fas fa-check"></i> Đã gửi';
                btn.title = 'Bill đã được gửi';
            }
        } else {
            window.notificationManager?.error?.(sendResult?.error || 'Lỗi gửi bill');
        }
    } catch (err) {
        console.error('[CHAT] Send bill error:', err);
        window.notificationManager?.error?.('Lỗi gửi bill: ' + err.message);
    } finally {
        if (btn && !btn.style.background?.includes('d1fae5')) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-file-invoice"></i> Gửi Bill';
        }
    }
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
    // Fire and forget to BOTH servers — with timeout to avoid zombie fetches
    const _fetch = window.fetchWithTimeout || fetch;
    _fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/mark-replied', opts, 6000).catch(() => {});
    _fetch('https://n2store-realtime.onrender.com/api/realtime/mark-replied', opts, 6000).catch(() => {});
}

// =====================================================
// CHAT DEBT BADGE - reuses renderWalletDebtBadges() from customer column
// =====================================================

// =====================================================
// ERROR MESSAGE MAPPING (P5)
// =====================================================
function _friendlyChatError(code, err) {
    const map = {
        PAT_FAILED:        { title: 'Hết phiên Pancake', body: 'Token truy cập đã hết hạn. Vui lòng thử lại hoặc reload trang.' },
        PAT_REGEN_FAILED:  { title: 'Không làm mới được token', body: 'Tất cả account Pancake đều fail. Kiểm tra lại đăng nhập Pancake.' },
        MESSAGES_FETCH_FAILED: { title: 'Không tải được tin nhắn', body: 'Pancake API trả lỗi. Mạng có thể chậm hoặc page không quyền.' },
        TIMEOUT:           { title: 'Quá thời gian chờ', body: 'Server chậm hoặc mạng không ổn định. Thử lại sau vài giây.' },
        HTTP_401:          { title: 'Không đủ quyền', body: 'Token không hợp lệ. Thử đăng nhập lại Pancake.' },
        HTTP_403:          { title: 'Bị chặn truy cập', body: 'Pancake từ chối request này. Liên hệ admin.' },
        HTTP_500:          { title: 'Lỗi server Pancake', body: 'Thử lại sau vài phút.' },
        HTTP_502:          { title: 'Pancake gateway lỗi', body: 'Thử lại sau vài phút.' },
        HTTP_503:          { title: 'Pancake bảo trì', body: 'Thử lại sau.' },
        UNKNOWN:           { title: 'Không tải được tin nhắn', body: err?.message || 'Lỗi không xác định. Thử lại.' },
    };
    return map[code] || map.UNKNOWN;
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

    // Check if user previously switched to a different page for this customer
    const preferredPage = _getPreferredPage(psid);
    if (preferredPage && preferredPage !== pageId) {
        pageId = preferredPage;
    }

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
    if (!(window._pageConvCache instanceof Map)) window._pageConvCache = new Map();

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

    // Update order note banner — shows first note, click to expand all
    const noteEl = document.getElementById('chatOrderNote');
    if (noteEl) {
        const noteCell = orderRow?.querySelector('td[data-column="notes"]');
        const tposNote = (noteCell?.textContent?.trim() || '').replace(/^−$/, '');

        // Store all notes for popup
        noteEl._allNotes = [];
        if (tposNote) noteEl._allNotes.push({ text: tposNote, source: 'tpos' });

        // Show TPOS note in banner immediately
        _updateNoteBanner(noteEl);

        // Fetch Pancake notes (async)
        const phone = window.currentChatPhone;
        if (phone && window.PancakeValidator) {
            window.PancakeValidator.quickLookup(phone).then(data => {
                if (!data?.customer) return;
                const pNotes = data.customer.pancake_notes || [];
                for (const n of pNotes) {
                    const text = n.message || n.content || '';
                    if (text) {
                        const by = n.created_by?.fb_name || '';
                        noteEl._allNotes.push({ text, source: 'pancake', by });
                    }
                }
                // Also fetch DB notes
                if (data.notes?.length) {
                    // notes from quickLookup won't have these, but full lookup does
                }
                _updateNoteBanner(noteEl);
            });
        }

        // Fetch DB notes (customer_notes table) from Render DB
        if (phone) {
            const renderUrl = window.API_CONFIG?.RENDER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
            const _fetch = window.fetchWithTimeout || fetch;
            _fetch(`${renderUrl}/api/v2/customers/${phone}/notes`, {}, 6000).then(r => r.json()).then(data => {
                if (data.success && data.data?.length) {
                    for (const n of data.data) {
                        // Avoid duplicates
                        if (!noteEl._allNotes.some(x => x.text === n.content && x.source === 'db')) {
                            noteEl._allNotes.push({ text: n.content, source: 'db', by: n.created_by, pinned: n.is_pinned });
                        }
                    }
                    _updateNoteBanner(noteEl);
                }
            }).catch(() => {});
        }
    }

    // Show/hide "Gửi Bill" button based on invoice status
    const billBtn = document.getElementById('chatHeaderBillBtn');
    if (billBtn) {
        const hasInvoice = window.InvoiceStatusStore && window.InvoiceStatusStore.has(orderId);
        billBtn.style.display = hasInvoice ? 'inline-flex' : 'none';
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
    // P1: AbortController — cancel in-flight requests when user opens another chat
    const myToken = ++window._chatLoadSeq;
    if (window._chatLoadCtrl) { try { window._chatLoadCtrl.abort(); } catch (_) {} }
    window._chatLoadCtrl = new AbortController();
    const mySignal = window._chatLoadCtrl.signal;
    try {
        await _findAndLoadConversation(pageId, psid, conversationType, myToken, { signal: mySignal });
        // Auto-focus chat input so user can type immediately
        setTimeout(() => {
            const chatInputEl = document.getElementById('chatInput');
            if (chatInputEl) chatInputEl.focus();
        }, 100);
    } catch (e) {
        if (e?.name === 'AbortError' && myToken !== window._chatLoadSeq) {
            // Stale cancellation — user clicked another chat. Silent.
            return;
        }
        console.error('[Chat-Core] Error loading conversation:', e);
        if (messagesEl) {
            const code = e?.code || (e?.name === 'AbortError' ? 'TIMEOUT' : 'UNKNOWN');
            const msg = _friendlyChatError(code, e);
            // Safe retry — stash args on window to avoid inline-onclick string escaping issues
            window._chatRetryArgs = [orderId, pageId, psid, conversationType];
            messagesEl.innerHTML = `
                <div class="chat-empty-state" style="text-align:center;padding:32px 16px">
                    <div style="font-size:40px;margin-bottom:8px">⚠️</div>
                    <p style="margin:0 0 6px;font-weight:600;color:#dc2626">${msg.title}</p>
                    <p style="margin:0 0 16px;color:#6b7280;font-size:13px">${msg.body}</p>
                    <button onclick="window.openChatModal(...window._chatRetryArgs)" style="padding:8px 20px;background:#3b82f6;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:600">🔄 Thử lại</button>
                    <div style="margin-top:10px;font-size:11px;color:#9ca3af">Mã lỗi: ${code}</div>
                </div>
            `;
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
    if (window._pageConvPickerCache) window._pageConvPickerCache.clear();

    // Cleanup state — don't reset isSendingMessage (send continues in background)
    window.currentConversationId = null;
    window.currentConversationType = null;
    window.currentConversationData = null;
    window.allChatMessages = [];
    window.currentChatCursor = null;
    window.currentReplyMessage = null;

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
        // Explicit page switch: PSID is page-specific (different per page).
        // Use DB lookup chain to find exact customer fb_id on target page.
        const customerName = window.currentCustomerName;
        const customerPhone = window.currentChatPhone;
        let foundConvs = [];
        let targetFbId = null;

        // Strategy 0: DB lookup — phone → global_id → fb_id on target page
        // Chain: customers table (phone→global_id) + fb_global_id_cache (global_id→psid per page)
        //
        // P3 optimization: Step A (psid→globalId) + Step B (phone→globalId) run in PARALLEL,
        // since they're independent. Step C depends on globalId → still sequential.
        // Warm: 500ms → best-of(A,B) ≈ 500ms, saves one round-trip.
        if (customerPhone || psid) {
            try {
                const renderUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev';
                const _fetch = window.fetchOrNull || (async (u, o) => { try { const r = await fetch(u, o); return r.ok ? r : null; } catch { return null; } });
                const srcPageId = window.currentChatChannelId || pageId;

                // Parallel Step A + Step B
                const [cacheRes, custRes] = await Promise.all([
                    psid ? _fetch(`${renderUrl}/api/fb-global-id?pageId=${srcPageId}&psid=${psid}`, { signal: opts?.signal }, 6000) : null,
                    customerPhone ? _fetch(`${renderUrl}/api/v2/customers/by-phone/${encodeURIComponent(customerPhone)}`, { signal: opts?.signal }, 6000) : null,
                ]);

                let globalId = null;
                if (cacheRes) {
                    const cacheData = await cacheRes.json().catch(() => null);
                    if (cacheData?.found) globalId = cacheData.globalUserId;
                }
                if (custRes) {
                    const custData = await custRes.json().catch(() => null);
                    if (!globalId) globalId = custData?.global_id || null;
                    const pageFbIds = custData?.pancake_data?.page_fb_ids;
                    if (pageFbIds?.[pageId]) targetFbId = pageFbIds[pageId];
                }

                if (_isStale()) return;

                // Step C: use global_id to find fb_id on target page
                if (!targetFbId && globalId) {
                    const targetRes = await _fetch(`${renderUrl}/api/fb-global-id/by-global?globalUserId=${globalId}&pageId=${pageId}`, { signal: opts?.signal }, 6000);
                    if (targetRes) {
                        const targetData = await targetRes.json().catch(() => null);
                        if (targetData?.found) targetFbId = targetData.psid;
                    }
                }
            } catch (e) {
                if (e?.name === 'AbortError') throw e;
                console.warn('[Chat-Core] DB lookup failed:', e.message);
            }
        }

        // If DB found exact fb_id → fetch conversations directly (precise, no name ambiguity)
        if (targetFbId) {
            const result = await pdm.fetchConversationsByCustomerFbId(pageId, targetFbId, { signal: opts?.signal });
            foundConvs = (result.conversations || []).filter(c =>
                String(c.page_id) === String(pageId)
            );
        }

        // Fallback: name search (v1 POST — cross-page, confirmed working)
        if (foundConvs.length === 0 && customerName) {
            const _strip = s => s?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() || '';
            const _nameMatch = (a, b) => a && b && (a === b || _strip(a) === _strip(b));

            if (pdm.searchConversations) {
                const searchResult = await pdm.searchConversations(customerName, { signal: opts?.signal });
                foundConvs = (searchResult.conversations || []).filter(c =>
                    String(c.page_id) === String(pageId) && _nameMatch(c.from?.name, customerName)
                );
            }
        }

        // Last fallback: page-specific API with original PSID
        if (foundConvs.length === 0) {
            const result = await pdm.fetchConversationsByCustomerFbId(pageId, psid, { signal: opts?.signal });
            foundConvs = (result.conversations || []).filter(c =>
                String(c.page_id) === String(pageId)
            );
        }

        if (_isStale()) return;

        if (foundConvs.length === 0) {
            conv = null;
        } else {
            // Sort: INBOX first, then COMMENT. Within each group, newest message first.
            const _byTypeAndTime = (a, b) => {
                // INBOX before COMMENT
                if (a.type === 'INBOX' && b.type !== 'INBOX') return -1;
                if (a.type !== 'INBOX' && b.type === 'INBOX') return 1;
                // Within same type: newest first
                const ta = new Date(a.last_customer_interactive_at || a.updated_at || 0).getTime();
                const tb = new Date(b.last_customer_interactive_at || b.updated_at || 0).getTime();
                return tb - ta;
            };
            foundConvs.sort(_byTypeAndTime);

            // Auto-pick first INBOX (or first conv if no INBOX)
            conv = foundConvs.find(c => c.type === 'INBOX') || foundConvs[0];

            // Cache for repick button (sync icon)
            if (!window._pageConvPickerCache) window._pageConvPickerCache = new Map();
            window._pageConvPickerCache.set(pageId, { convs: foundConvs, loadToken });
        }
    } else if (type === 'COMMENT') {
        // COMMENT: Always fetch fresh from API (cache may hold stale/deleted conversations)
        const result = await pdm.fetchConversationsByCustomerFbId(pageId, psid, { signal: opts?.signal });
        const commentConvs = (result.conversations || []).filter(c => c.type === 'COMMENT');

        if (commentConvs.length > 0) {
            commentConvs.sort(_byUpdatedAtDesc);
            conv = commentConvs[0];
        }

        // Fallback: multi-page search
        if (!conv) {
            const mpResult = await pdm.fetchConversationsByCustomerIdMultiPage(psid, { signal: opts?.signal });
            const mpConvs = (mpResult.conversations || []).filter(c => c.type === 'COMMENT');
            if (mpConvs.length > 0) {
                mpConvs.sort(_byUpdatedAtDesc);
                conv = mpConvs.find(c => String(c.page_id) === String(pageId)) || mpConvs[0];
            }
        }
    } else {
        // INBOX: Use cached maps first, then API fallback
        // Guard: cache may hold cross-page conv (PSID = fb_id is page-scoped)
        const cachedConv = pdm.inboxMapByPSID.get(String(psid)) || pdm.inboxMapByFBID.get(String(psid));
        if (cachedConv && String(cachedConv.page_id) === String(pageId)) {
            conv = cachedConv;
        }

        if (!conv) {
            const result = await pdm.fetchConversationsByCustomerFbId(pageId, psid, { signal: opts?.signal });
            const convs = result.conversations || [];
            conv = convs.find(c => c.type === 'INBOX') || convs[0] || null;
        }

        // Fallback: multi-page search
        if (!conv) {
            const result = await pdm.fetchConversationsByCustomerIdMultiPage(psid, { signal: opts?.signal });
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
    // Pass opts.signal so modal close/switch aborts this zombie fetch.
    if (!conv.thread_id && type !== 'COMMENT') {
        pdm.fetchConversationsByCustomerFbId(convPageId, psid, { signal: opts?.signal }).then(result => {
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
    await _loadMessages(convPageId, conv.id, customerId, loadToken, opts);
}

/**
 * Load messages for a conversation
 * @param {object} [opts] - { signal } for AbortController propagation
 */
async function _loadMessages(pageId, conversationId, customerId, loadToken, opts = {}) {
    const pdm = window.pancakeDataManager;
    if (!pdm) return;
    if (loadToken == null) loadToken = window._chatLoadSeq;
    const _isStale = () => loadToken !== window._chatLoadSeq;

    try {
        // P5: throwOnError — let error bubble to openChatModal catch which shows retry button
        const result = await pdm.fetchMessages(pageId, conversationId, null, customerId, false, {
            signal: opts.signal,
            throwOnError: true
        });
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

            // Proactive global_id caching — use rich data from messages response
            const gid = result.global_id
                || rc.page_customer?.global_id
                || (result.customers || []).find(c => c.global_id)?.global_id;
            if (gid) {
                const cacheKey = conversationId || `${pageId}_${window.currentChatPSID}`;
                _setGlobalIdCache(cacheKey, gid);
                // Store on conv data for extension bypass reuse (avoids re-fetch)
                window.currentConversationData._globalId = gid;
            }

            // Store can_inbox flag
            window.currentConversationData._canInbox = result.can_inbox ?? true;
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
        // Use API pagination value if available, fallback to array length
        window.currentChatCursor = result.current_count || messages.length;

        // Render
        if (window.renderChatMessages) {
            window.renderChatMessages(messages);
        }

        // Fire-and-forget: sync customer data to Render DB
        _syncPancakeCustomerToDB(result, pageId);
    } catch (e) {
        if (_isStale()) return;
        if (e?.name === 'AbortError') return; // stale cancellation, silent
        // P5: re-throw to openChatModal which shows retry button with error code
        throw e;
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
    let dropdown = document.getElementById('chatPageSelectorDropdown');
    if (!container || !dropdown) return;

    // Move dropdown to document.body to escape backdrop-filter stacking context
    if (dropdown.parentElement !== document.body) {
        document.body.appendChild(dropdown);
    }

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
// SYNC CUSTOMER DATA TO RENDER DB (fire-and-forget)
// Same as inbox-chat.js _syncPancakeCustomerToDB
// =====================================================

function _syncPancakeCustomerToDB(messagesResult, pageId) {
    try {
        const cust = messagesResult.customers?.[0];
        if (!cust?.fb_id) return;

        const phone = messagesResult.recent_phone_numbers?.[0]
            || messagesResult.conv_phone_numbers?.[0]
            || cust.recent_phone_numbers?.[0]?.phone_number
            || null;

        const body = {
            page_id: pageId,
            fb_id: cust.fb_id,
            global_id: messagesResult.global_id || cust.global_id || null,
            name: cust.name,
            phone: typeof phone === 'string' ? phone : phone?.phone_number || null,
            gender: cust.personal_info?.gender || null,
            birthday: cust.personal_info?.birthday || null,
            lives_in: cust.personal_info?.lives_in || null,
            can_inbox: messagesResult.can_inbox,
            pancake_id: cust.id || cust.customer_id || null,
            notes: messagesResult.notes || null,
            reports_by_phone: messagesResult.reports_by_phone || null,
        };

        const renderUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const _fetch = window.fetchWithTimeout || fetch;
        _fetch(`${renderUrl}/api/v2/customers/sync-pancake`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }, 8000).then(r => r.json()).then(data => {
            if (data.success) {
                console.log(`[Chat-Core] Synced customer "${cust.name}" to DB (${data.action})`);
            }
        }).catch(() => {});
    } catch (_) {}
}

// =====================================================
// CONVERSATION PICKER (multiple convs on a page)
// =====================================================

/**
 * Append a compact conv picker BELOW existing messages (for page switch).
 * Shows other conversations the customer has on this page.
 */
function _appendConvPickerBelow(convs, pageId, loadToken) {
    if (!convs?.length) return;
    const messagesEl = document.getElementById('chatMessages');
    if (!messagesEl) return;

    const pdm = window.pancakeDataManager;
    const pageName = (pdm?.pages || []).find(p => String(p.id) === String(pageId))?.name || pageId;

    let html = `<div class="chat-conv-picker" style="border-top:1px solid var(--ap-outline-variant);margin-top:12px;padding-top:12px;">
        <div class="chat-conv-picker-title">Đoạn hội thoại khác trên ${_escapeHtml(pageName)}</div>`;

    for (const conv of convs) {
        const isInbox = conv.type === 'INBOX';
        const icon = isInbox ? 'mail' : 'chat_bubble';
        const typeClass = isInbox ? 'inbox' : 'comment';
        const typeLabel = isInbox ? 'Tin nhắn' : 'Bình luận';
        const snippet = _escapeHtml(conv.snippet || '');
        const name = _escapeHtml(conv.from?.name || 'Khách hàng');
        const time = _formatPickerTime(conv.last_customer_interactive_at || conv.updated_at || '');

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

    const pickerDiv = document.createElement('div');
    pickerDiv.innerHTML = html;
    messagesEl.appendChild(pickerDiv);

    // Bind clicks
    pickerDiv.querySelectorAll('.chat-conv-picker-item').forEach(item => {
        item.addEventListener('click', () => {
            const convId = item.dataset.convId;
            const allConvs = window._pageConvPickerCache?.get(pageId)?.convs || convs;
            const conv = allConvs.find(c => c.id === convId) || convs.find(c => c.id === convId);
            if (conv) _pickConversation(conv, pageId, loadToken);
        });
    });
}

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
        // Prefer last_customer_interactive_at (actual message time) over updated_at
        const time = _formatPickerTime(conv.last_customer_interactive_at || conv.updated_at || '');

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

    // Clear reply/image state from previous conversation
    window.currentReplyMessage = null;
    const preview = document.getElementById('replyPreview');
    if (preview) preview.classList.remove('active');
    if (typeof window.clearImagePreviews === 'function') {
        try { window.clearImagePreviews(); } catch (_) {}
    }

    window.currentConversationId = conv.id;
    window.currentConversationData = conv;
    window.currentConversationType = conv.type === 'COMMENT' ? 'COMMENT' : 'INBOX';
    window.currentChatChannelId = pageId;
    window.currentSendPageId = pageId;

    // Update type toggle + page selector label
    _updateTypeToggle(window.currentConversationType);
    _updatePageSelectorActive(pageId);

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
    if (!pageId || !psid) return;

    // Try cached conv list first (from last page switch)
    const cached = window._pageConvPickerCache?.get(pageId);
    if (cached?.convs?.length > 1) {
        const myToken = ++window._chatLoadSeq;
        _resetTransientChatState();
        _showConversationPicker(cached.convs, pageId, myToken);
        return;
    }

    // No cache → re-fetch
    const cacheKey = `${psid}:${pageId}:${window.currentConversationType}`;
    if (window._pageConvCache instanceof Map) window._pageConvCache.delete(cacheKey);

    const myToken = ++window._chatLoadSeq;
    _resetTransientChatState();

    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) {
        messagesEl.innerHTML = '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tìm đoạn hội thoại...</p></div>';
    }

    try {
        // Force picker mode: search all convs and show picker
        const pdm = window.pancakeDataManager;
        const customerName = window.currentCustomerName;
        let foundConvs = [];
        if (customerName && pdm?.searchConversationsOnPage) {
            const r = await pdm.searchConversationsOnPage(pageId, customerName);
            foundConvs = (r.conversations || []).filter(c => c.from?.name === customerName);
        }
        if (foundConvs.length === 0) {
            const r = await pdm.fetchConversationsByCustomerFbId(pageId, psid);
            foundConvs = (r.conversations || []).filter(c => String(c.page_id) === String(pageId));
        }
        if (myToken !== window._chatLoadSeq) return;

        if (foundConvs.length <= 1) {
            // 0 or 1 → just load it
            await _findAndLoadConversation(pageId, psid, window.currentConversationType, myToken, { allowDrift: false });
        } else {
            foundConvs.sort((a, b) => {
                const ta = new Date(a.last_customer_interactive_at || a.updated_at || 0).getTime();
                const tb = new Date(b.last_customer_interactive_at || b.updated_at || 0).getTime();
                return tb - ta;
            });
            window._pageConvPickerCache?.set(pageId, { convs: foundConvs, loadToken: myToken });
            _showConversationPicker(foundConvs, pageId, myToken);
        }
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

    // Remember page choice per customer (psid) for next time
    _savePreferredPage(window.currentChatPSID, newPageId);
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

// =====================================================
// PREFERRED PAGE PER CUSTOMER (localStorage)
// =====================================================

const PREF_PAGE_KEY = 'chat_preferred_pages';
const PREF_PAGE_MAX = 200; // max entries to keep

function _getPreferredPage(psid) {
    if (!psid) return null;
    try {
        const map = JSON.parse(localStorage.getItem(PREF_PAGE_KEY) || '{}');
        return map[psid] || null;
    } catch { return null; }
}

function _savePreferredPage(psid, pageId) {
    if (!psid || !pageId) return;
    try {
        const map = JSON.parse(localStorage.getItem(PREF_PAGE_KEY) || '{}');
        map[psid] = pageId;

        // Trim old entries if too many
        const keys = Object.keys(map);
        if (keys.length > PREF_PAGE_MAX) {
            keys.slice(0, keys.length - PREF_PAGE_MAX).forEach(k => delete map[k]);
        }

        localStorage.setItem(PREF_PAGE_KEY, JSON.stringify(map));
    } catch { /* quota exceeded — ignore */ }
}

// =====================================================
// CHAT NOTES BANNER + POPUP
// =====================================================

function _updateNoteBanner(noteEl) {
    if (!noteEl) return;
    const notes = noteEl._allNotes || [];
    if (notes.length === 0) {
        noteEl.style.display = 'none';
        return;
    }

    // Show first note in banner with count
    const first = notes[0];
    const icon = first.source === 'pancake' ? '🟠' : first.source === 'db' ? '📌' : '📝';
    const countBadge = notes.length > 1 ? ` (+${notes.length - 1})` : '';
    noteEl.textContent = `${icon} ${first.text}${countBadge}`;
    noteEl.setAttribute('data-source', first.source);
    noteEl.title = `${notes.length} ghi chú — Click để xem tất cả`;
    noteEl.style.display = 'block';
}

window._toggleChatNoteSource = function() {
    const noteEl = document.getElementById('chatOrderNote');
    if (!noteEl) return;
    const notes = noteEl._allNotes || [];
    if (notes.length === 0) return;

    // Close existing popup
    const existing = document.getElementById('chatNotesPopup');
    if (existing) { existing.remove(); return; }

    // Build popup
    const popup = document.createElement('div');
    popup.id = 'chatNotesPopup';
    popup.className = 'chat-notes-popup';

    const sourceLabels = { tpos: '📝 TPOS', pancake: '🟠 Pancake', db: '📌 N2Store' };
    const sourceColors = { tpos: '#fef3c7', pancake: '#fff7ed', db: '#ede9fe' };
    const sourceBorders = { tpos: '#fde68a', pancake: '#fed7aa', db: '#c4b5fd' };

    let html = '<div class="cnp-header"><span class="cnp-title">Ghi chú khách hàng</span><button class="cnp-close" onclick="document.getElementById(\'chatNotesPopup\')?.remove()">&times;</button></div>';
    html += '<div class="cnp-body">';

    for (const n of notes) {
        const label = sourceLabels[n.source] || n.source;
        const bg = sourceColors[n.source] || '#f1f5f9';
        const border = sourceBorders[n.source] || '#e2e8f0';
        const byText = n.by ? `<span class="cnp-note-by">${_escapeHtml(n.by)}</span>` : '';
        const pinIcon = n.pinned ? '<span title="Ghim">📌</span> ' : '';
        html += `<div class="cnp-note" style="background:${bg};border-color:${border}">
            <div class="cnp-note-source">${label} ${byText}</div>
            <div class="cnp-note-text">${pinIcon}${_escapeHtml(n.text)}</div>
        </div>`;
    }

    if (notes.length === 0) {
        html += '<div class="cnp-empty">Không có ghi chú</div>';
    }

    html += '</div>';
    popup.innerHTML = html;

    // Position below noteEl
    const rect = noteEl.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = (rect.bottom + 4) + 'px';
    popup.style.left = Math.max(8, rect.left) + 'px';

    document.body.appendChild(popup);

    // Close on click outside
    setTimeout(() => {
        const closeHandler = (e) => {
            if (!popup.contains(e.target) && e.target !== noteEl) {
                popup.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 0);
};

// Expose helpers for other modules
window._parseTimestamp = _parseTimestamp;
window._stripHtml = _stripHtml;

