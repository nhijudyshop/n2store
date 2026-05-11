// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   TAB1 CHAT CORE - Modal lifecycle, state management
   Adapted from inbox/js/inbox-chat.js InboxChatController
   ===================================================== */

// =====================================================
// GLOBAL STATE
// =====================================================

window.currentConversationId = null;
window.currentConversationType = null; // 'INBOX' | 'COMMENT'
window.currentChatChannelId = null; // pageId
window.currentChatPSID = null;
window.currentCustomerName = null;
window.currentConversationData = null; // full Pancake conversation object
window.allChatMessages = [];
window.currentChatReadWatermarks = []; // ReadWatermark[] from Pancake — { psid, message_id, watermark (unix sec) }
window.currentChatCursor = null; // pagination cursor (current_count)
window._chatNoMoreMessages = false; // true khi loadMoreMessages trả 0 → stop infinite scroll
window.isLoadingMoreMessages = false;
window.currentReplyMessage = null; // reply-to context {id, text, sender}
window.currentSendPageId = null; // override send from page
window.currentReplyType = 'private_replies'; // for COMMENT: 'reply_comment' | 'private_replies'
window.isSendingMessage = false;

// Per-page conversation cache: Map<`${psid}:${pageId}:${type}`, convObject>
// Persists across page switches within the same modal session.
// Cleared on modal close.
window._pageConvCache = new Map();

// Send QR image directly to current chat (called from chat header "Gửi mã QR" button)
window.sendQRFromChatHeader = async function () {
    const phone = (window.currentChatPhone || '').trim();
    if (!phone) {
        window.notificationManager?.warning?.('Khách hàng chưa có SĐT') ||
            alert('Khách hàng chưa có SĐT');
        return;
    }
    if (
        typeof window.getOrCreateQRForPhone !== 'function' ||
        typeof window.generateVietQRUrl !== 'function'
    ) {
        alert('Chức năng QR chưa sẵn sàng');
        return;
    }
    if (typeof window.sendImageToChat !== 'function') {
        alert('Chức năng gửi ảnh chưa sẵn sàng');
        return;
    }
    const normalizedPhone =
        typeof window.normalizePhoneForQR === 'function'
            ? window.normalizePhoneForQR(phone)
            : phone;
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
window.sendBillFromChat = async function () {
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
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
    }

    try {
        let invoiceData = window.InvoiceStatusStore.get(orderId);
        if (!invoiceData) {
            window.notificationManager?.error?.('Không tìm thấy dữ liệu phiếu bán hàng');
            return;
        }

        // Owner-reported (2026-05-10): "nút gửi bill trong modal chat inbox nó
        // không lấy sản phẩm vào bill" — bill image was generated with empty
        // OrderLines because the InvoiceStatusStore entry for older invoices
        // doesn't include product lines. Reuse the same resolution helper
        // sendBillFromMainTable uses: cache → OrderStore.Details → TPOS
        // GetDetails refetch (last resort) → persist back into the store so
        // future sends are instant.
        if (
            (!invoiceData.OrderLines || invoiceData.OrderLines.length === 0) &&
            typeof window.ensureOrderLinesForBill === 'function'
        ) {
            const order =
                window.OrderStore?.get?.(orderId) ||
                (window.displayedData || []).find(
                    (o) => o.Id === orderId || String(o.Id) === String(orderId)
                ) ||
                null;
            const lines = await window.ensureOrderLinesForBill({
                orderId,
                invoiceData,
                order,
                opts: { showNotif: false, label: 'CHAT-BILL' },
            });
            if (lines && lines.length > 0) {
                // Pull fresh entry — ensureOrderLinesForBill persists into the
                // store on TPOS-refetch path, so this picks up the merged data.
                invoiceData = window.InvoiceStatusStore.get(orderId) || {
                    ...invoiceData,
                    OrderLines: lines,
                };
            } else {
                window.notificationManager?.error?.(
                    'Đơn hàng không có sản phẩm — không thể gửi bill rỗng.'
                );
                return;
            }
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
                preGeneratedBlob: billBlob,
            });
        } else if (typeof window.sendBillFromMainTable === 'function') {
            await window.sendBillFromMainTable(orderId);
            sendResult = { success: true };
        } else {
            window.notificationManager?.error?.('BillService chưa sẵn sàng');
            return;
        }

        if (sendResult?.success) {
            // Surface when extension bypass was used (24h policy / #551 user
            // unavailable / no conversation found) so user knows it didn't go
            // through the normal Pancake API path.
            const sentMsg = sendResult.viafallback
                ? 'Đã gửi bill qua Extension (24h/Pancake fallback)'
                : 'Đã gửi bill cho khách';
            window.notificationManager?.show?.(sentMsg, 'success');
            window.InvoiceStatusStore.markBillSent?.(orderId);

            // Append bill message to chat modal (optimistic UI)
            if (window.allChatMessages && window.renderChatMessages) {
                const billMsg = {
                    id: 'bill_' + Date.now(),
                    text: `📄 Bill #${invoiceData.Number || invoiceData.Reference || orderId}`,
                    time: new Date(),
                    sender: 'shop',
                    senderName: '',
                    attachments: billImageUrl
                        ? [
                              {
                                  type: 'image',
                                  url: billImageUrl,
                                  preview_url: billImageUrl,
                              },
                          ]
                        : [],
                };
                window.allChatMessages.push(billMsg);
                window.renderChatMessages(window.allChatMessages);

                // Auto-scroll to bottom
                const messagesEl = document.getElementById('chatMessages');
                if (messagesEl) {
                    setTimeout(() => {
                        messagesEl.scrollTop = messagesEl.scrollHeight;
                    }, 100);
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
/**
 * Render empty-state HTML with a "Set phone" input on the conv panel when
 * cross-page lookup fails. User can type the customer's phone → POST to
 * /api/v2/customers/set-phone → re-trigger lookup with the new phone.
 *
 * Owner request 2026-05-11: "nếu không tìm được thì hiện khách chưa có sđt
 * → cho set sđt".
 */
function _renderSetPhoneEmptyState(pageName, opts = {}) {
    const currentPhone = window.currentChatPhone || '';
    const safeCurrent = String(currentPhone).replace(/"/g, '&quot;');
    // Two-mode message: default = "khách chưa có sđt"; after a save attempt
    // that still didn't resolve a conv on Pancake, switch to "đã lưu, nhưng
    // chưa có hội thoại trên page này" so the user knows the save worked
    // even though the lookup remained empty (customer never messaged this
    // page yet — Pancake won't have a conv to find).
    const persisted = opts.persisted === true;
    const heading = persisted
        ? `Đã lưu SĐT nhưng chưa có hội thoại trên ${pageName}`
        : `Khách chưa có SĐT trên ${pageName}`;
    const help = persisted
        ? 'SĐT đã được lưu vào hệ thống. Pancake chỉ có hội thoại khi khách đã nhắn tin với page này. Có thể thử nhập SĐT khác nếu đúng khách có nhiều số.'
        : 'Pancake chưa map số điện thoại với khách trên page này. Nhập SĐT để liên kết — nếu khách đã từng nhắn page này, mình sẽ tìm ra hội thoại.';
    return `
        <div class="chat-empty-state" style="text-align:center; padding:24px 18px; color:#475569;">
            <div style="font-size:14px; margin-bottom:6px;">
                <i class="fas fa-user-slash" style="font-size:32px; color:#cbd5e1; display:block; margin-bottom:10px;"></i>
                <b>${heading}</b>
            </div>
            <div style="font-size:12px; color:#94a3b8; margin-bottom:14px;">
                ${help}
            </div>
            <form id="chatSetPhoneForm" style="display:flex; gap:6px; max-width:320px; margin:0 auto;" onsubmit="return false">
                <input type="tel" id="chatSetPhoneInput" placeholder="VD: 0901234567" value="${safeCurrent}"
                    inputmode="numeric" autocomplete="off"
                    style="flex:1; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; outline:none;">
                <button type="button" id="chatSetPhoneBtn"
                    style="padding:8px 14px; background:#3b82f6; color:#fff; border:0; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap;">
                    <i class="fas fa-link"></i> ${persisted ? 'Thử SĐT khác' : 'Gán SĐT'}
                </button>
            </form>
            <div id="chatSetPhoneStatus" style="font-size:11px; color:#ef4444; margin-top:8px; min-height:14px;"></div>
        </div>`;
}

async function _setPhoneForCurrentCustomer(targetPageId, phone) {
    const fbId = window.currentChatPSID || null;
    const globalId = window.currentConversationData?.customers?.[0]?.global_id || null;
    const name = window.currentCustomerName || null;
    const body = JSON.stringify({
        fbId,
        globalId,
        pageId: targetPageId,
        phone,
        name,
    });
    const res = await fetch(
        'https://chatomni-proxy.nhijudyshop.workers.dev/api/v2/customers/set-phone',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        }
    );
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

function _wireSetPhoneEmptyState(targetPageId) {
    const btn = document.getElementById('chatSetPhoneBtn');
    const inp = document.getElementById('chatSetPhoneInput');
    const status = document.getElementById('chatSetPhoneStatus');
    if (!btn || !inp) return;
    const submit = async () => {
        const phone = (inp.value || '').replace(/\D/g, '');
        if (!phone || phone.length < 9 || phone.length > 12) {
            status.textContent = 'Số điện thoại không hợp lệ';
            inp.focus();
            return;
        }
        btn.disabled = true;
        const origLabel = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
        status.textContent = '';
        try {
            await _setPhoneForCurrentCustomer(targetPageId, phone);
            // Flag this page as having had a phone-save attempt, so the
            // empty-state re-render (if conv still not found) shows the
            // "đã lưu nhưng chưa có hội thoại" message instead of the
            // initial "khách chưa có SĐT" prompt.
            window._chatPhonePersistedForPage = targetPageId;
            // Update local state so the re-lookup uses the new phone.
            window.currentChatPhone = phone;
            const phoneEl = document.getElementById('chatPhoneNumber');
            if (phoneEl) phoneEl.textContent = phone;
            const copyBtn = document.getElementById('chatCopyPhone');
            if (copyBtn) copyBtn.style.display = 'inline';

            status.style.color = '#10b981';
            status.textContent = '✓ Đã gán SĐT, đang tìm lại hội thoại…';

            // Re-trigger cross-page lookup — strict mode (allowDrift=false) so we
            // land on the target page's conv with the new phone available.
            const myToken = ++window._chatLoadSeq;
            _resetTransientChatState();
            const messagesEl = document.getElementById('chatMessages');
            if (messagesEl) {
                messagesEl.innerHTML =
                    '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tìm lại…</p></div>';
            }
            try {
                await _findAndLoadConversation(
                    targetPageId,
                    window.currentChatPSID,
                    window.currentConversationType,
                    myToken,
                    { allowDrift: false }
                );
            } catch (_e) {
                /* lookup function handles its own empty-state */
            }
        } catch (err) {
            console.error('[CHAT] set-phone failed:', err);
            status.style.color = '#ef4444';
            status.textContent = 'Lỗi: ' + (err?.message || 'không lưu được');
            btn.disabled = false;
            btn.innerHTML = origLabel;
        }
    };
    btn.addEventListener('click', submit);
    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        }
    });
    setTimeout(() => inp.focus(), 80);
}

/**
 * Build a Pancake page-avatar URL via our Cloudflare worker proxy.
 *
 * Pancake exposes page avatars at:
 *   GET /api/v1/pages/{pageId}/avatar?access_token={JWT}
 * which returns the page's profile picture as JPEG (~5-6 KB) for both
 * Facebook and Instagram pages. The /api/v1/pages list endpoint only
 * returns `avatar_url` for Instagram pages (cdninstagram CDN) — Facebook
 * pages get `avatar_url: null`, which is why our selector previously
 * fell back to an initial letter. The token-bound /avatar endpoint
 * works for both.
 *
 * Routed via chatomni-proxy.workers.dev so we don't expose the JWT in
 * referer headers across origins and so Cloudflare can edge-cache.
 *
 * @param {string} pageId  e.g. "270136663390370" or "igo_..."
 * @returns {string|null}  Proxied URL ready for an <img src>; null if no token.
 */
function _getPageAvatarProxyUrl(pageId) {
    if (!pageId) return null;
    const tm = window.pancakeTokenManager;
    const token = tm?.currentToken;
    if (!token) return null;
    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    return `${WORKER}/api/pancake/pages/${encodeURIComponent(pageId)}/avatar?access_token=${token}`;
}

/**
 * Render a picker empty-state for ambiguous name-search results.
 *
 * Triggered when name search returns multiple DISTINCT fb_id groups on the
 * target page (homonyms) and NONE of them has a confirmed phone match. The
 * existing flow would "best-effort accept" and silently load whichever conv
 * sorts first — which can be the wrong person. Showing a picker lets the
 * user pick the right candidate manually.
 *
 * Each card surfaces: avatar, FB name, recent_phone_numbers (if any), and
 * the conv snippet so the user can recognize the right human.
 *
 * @param {Array} candidates - Conv objects (one per fb_id group).
 * @param {string} pageName  - Pre-escaped page name for heading.
 * @returns {string} HTML markup
 */
function _renderConvPickerEmptyState(candidates, pageName) {
    const customerName = window.currentCustomerName || 'khách hàng';
    const safeCustomerName = String(customerName).replace(
        /[<>&"]/g,
        (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]
    );

    const _esc = (s) =>
        String(s || '').replace(
            /[<>&"]/g,
            (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]
        );

    // Group candidates by fb_id so each picker row = one human (not one conv).
    // Same fb_id with multiple convs (INBOX+COMMENT) is the same person.
    const byFbId = new Map();
    for (const c of candidates) {
        const fid = String(c.from_psid || c.from?.id || c.id);
        if (!byFbId.has(fid)) byFbId.set(fid, []);
        byFbId.get(fid).push(c);
    }

    const cards = [];
    for (const [fid, convs] of byFbId) {
        const c = convs[0]; // representative conv for display
        const name = c.from?.name || c.customer?.name || '(không tên)';
        const phones = Array.isArray(c.recent_phone_numbers)
            ? c.recent_phone_numbers.map((p) => p.phone_number).filter(Boolean)
            : [];
        const phoneText = phones.length ? phones.join(', ') : '(chưa có SĐT trên Pancake)';
        const snippet = (c.snippet || '').toString().slice(0, 90);
        // Prefer Pancake's page-customer avatar via _getChatAvatarUrl (which
        // routes through our worker proxy with proper headers + edge cache).
        // Falls back to the raw conv shape, then to FB graph CDN.
        const pageIdForAvatar = c.page_id || window.currentChatChannelId;
        const avatarUrl =
            (window._getChatAvatarUrl ? window._getChatAvatarUrl(fid, pageIdForAvatar) : null) ||
            c.avatar ||
            c.from?.picture?.data?.url ||
            c.from?.profile_pic ||
            `https://graph.facebook.com/${fid}/picture?type=small`;
        const initial = name
            .charAt(0)
            .toUpperCase()
            .replace(/[<>&"']/g, '');
        const types = convs
            .map((cc) => cc.type)
            .filter((t, i, a) => a.indexOf(t) === i)
            .join(' + ');

        cards.push(`
            <button type="button" class="chat-picker-card" data-fbid="${_esc(fid)}"
                style="display:flex; gap:12px; align-items:flex-start; width:100%; text-align:left;
                       padding:10px 12px; background:#fff; border:1px solid #e2e8f0; border-radius:8px;
                       cursor:pointer; transition:border-color .15s, transform .1s;
                       font-family:inherit;"
                onmouseover="this.style.borderColor='#3b82f6';this.style.transform='translateY(-1px)';"
                onmouseout="this.style.borderColor='#e2e8f0';this.style.transform='translateY(0)';">
                <img src="${_esc(avatarUrl)}" alt=""
                    style="width:40px; height:40px; border-radius:50%; object-fit:cover; flex:0 0 40px; background:#e2e8f0;"
                    onerror="this.style.display='none';this.parentElement.querySelector('.chat-picker-initial').style.display='flex';">
                <span class="chat-picker-initial" style="display:none; width:40px; height:40px; border-radius:50%; background:#cbd5e1; color:#fff; align-items:center; justify-content:center; flex:0 0 40px; font-weight:600;">${_esc(initial)}</span>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; color:#0f172a; font-size:13px; margin-bottom:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_esc(name)}</div>
                    <div style="font-size:11px; color:#64748b; margin-bottom:3px;">
                        <i class="fas fa-phone" style="font-size:10px;"></i> ${_esc(phoneText)}
                        <span style="margin-left:8px; padding:1px 6px; background:#eff6ff; color:#2563eb; border-radius:4px; font-weight:600;">${_esc(types)}</span>
                    </div>
                    ${snippet ? `<div style="font-size:11px; color:#94a3b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_esc(snippet)}</div>` : ''}
                </div>
            </button>
        `);
    }

    const candidateCount = byFbId.size;
    const heading =
        candidateCount > 1
            ? `Có ${candidateCount} người tên "${safeCustomerName}" trên ${pageName}`
            : `Tìm thấy 1 hội thoại trên ${pageName} — kiểm tra có đúng khách không`;
    const help =
        candidateCount > 1
            ? 'Không xác định được khách qua SĐT. Chọn đúng đoạn hội thoại bên dưới:'
            : 'SĐT trên Pancake khác với SĐT đơn hàng. Bấm để mở nếu đúng khách, hoặc bỏ qua nếu không phải.';
    return `
        <div class="chat-empty-state" style="text-align:left; padding:18px; color:#475569;">
            <div style="text-align:center; margin-bottom:14px;">
                <i class="fas fa-users" style="font-size:28px; color:#cbd5e1; display:block; margin-bottom:8px;"></i>
                <b style="font-size:13px; color:#0f172a;">${heading}</b>
                <div style="font-size:11px; color:#94a3b8; margin-top:4px;">
                    ${help}
                </div>
            </div>
            <div id="chatPickerList" style="display:flex; flex-direction:column; gap:8px; max-width:480px; margin:0 auto;">
                ${cards.join('')}
            </div>
        </div>`;
}

/**
 * Wire click handlers on conv-picker cards. When user picks a candidate,
 * resolve it as the active conv and load its messages directly.
 *
 * @param {string} pageId  - Target page ID (for _loadMessages).
 * @param {Map<string, Array>} byFbIdMap - fb_id → conv[] (same grouping used in render).
 * @param {number} loadToken - Stale-guard token from the parent _doFindAndLoadConversation.
 * @param {string} type - 'INBOX' | 'COMMENT' — pick the matching type from the chosen fb_id group.
 */
function _wireConvPickerEmptyState(pageId, byFbIdMap, loadToken, type) {
    const list = document.getElementById('chatPickerList');
    if (!list) return;
    list.querySelectorAll('.chat-picker-card').forEach((card) => {
        card.addEventListener('click', async () => {
            const fbId = card.getAttribute('data-fbid');
            const convs = byFbIdMap.get(fbId);
            if (!convs || convs.length === 0) return;
            // Prefer the conv matching the requested type, fall back to first.
            const conv = convs.find((c) => c.type === type) || convs[0];
            if (!conv) return;

            // Stale-guard: if user already moved on, skip the load.
            if (loadToken !== window._chatLoadSeq) return;

            window.currentConversationId = conv.id;
            window.currentConversationData = conv;

            // Sync page-scoped PSID to the picked fb_id (page-scoped fb_id IS the PSID).
            const convPSID = conv.from_psid || conv.from?.id || fbId;
            if (convPSID) window.currentChatPSID = String(convPSID);

            // Drift the current page if needed — picker results are already on the
            // target page so this is usually a no-op, but keep consistent with the
            // post-conv-resolve block in _doFindAndLoadConversation.
            const convPageId = conv.page_id || pageId;
            window.currentChatChannelId = convPageId;
            window.currentSendPageId = convPageId;

            if (window._refreshChatHeaderAvatar) window._refreshChatHeaderAvatar();

            // Cache for repick button
            if (!window._pageConvPickerCache) window._pageConvPickerCache = new Map();
            window._pageConvPickerCache.set(convPageId, { convs, loadToken });

            const messagesEl = document.getElementById('chatMessages');
            if (messagesEl) {
                messagesEl.innerHTML =
                    '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tải tin nhắn…</p></div>';
            }

            const customerId =
                conv.customers?.[0]?.id ||
                conv.customerId ||
                conv.customer?.id ||
                conv.from?.id ||
                null;
            try {
                await _loadMessages(convPageId, conv.id, customerId, loadToken, {});
            } catch (e) {
                console.warn('[Chat-Core] picker: _loadMessages failed:', e?.message);
            }
        });
    });
}

/**
 * Refresh customer avatar in chat header. Called on:
 *   • initial chat modal open (after currentConversationData first set)
 *   • after _doFindAndLoadConversation resolves a conv (cross-page or type switch)
 * Uses _getChatAvatarUrl which prefers the resolved conv's direct avatar over
 * the FB graph proxy fallback — gives the right page-customer profile pic.
 */
function _refreshChatHeaderAvatar() {
    const avatarEl = document.getElementById('chatCustomerAvatar');
    if (!avatarEl) return;
    const psid = window.currentChatPSID;
    const pageId = window.currentChatChannelId;
    if (!psid) {
        avatarEl.textContent = (window.currentCustomerName || 'K').charAt(0).toUpperCase();
        return;
    }
    const initial = (window.currentCustomerName || 'K').charAt(0).toUpperCase();
    const safeInitial = initial.replace(/['"\\<>&]/g, '');
    const imgUrl = window._getChatAvatarUrl(psid, pageId);
    avatarEl.innerHTML = `<img src="${imgUrl}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.parentElement.textContent='${safeInitial}'">`;
}
window._refreshChatHeaderAvatar = _refreshChatHeaderAvatar;

window._getChatAvatarUrl = function (psid, pageId) {
    const conv = window.currentConversationData || {};
    const raw = conv._raw || {};
    // Same priority as inbox: conv.avatar → from.picture → from.profile_pic → customers[].avatar
    const directAvatar =
        conv.avatar ||
        raw.from?.picture?.data?.url ||
        raw.from?.profile_pic ||
        raw.customers?.[0]?.avatar ||
        conv.customers?.[0]?.avatar ||
        null;
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
    _fetch(
        'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/mark-replied',
        opts,
        6000
    ).catch(() => {});
    _fetch('https://n2store-realtime.onrender.com/api/realtime/mark-replied', opts, 6000).catch(
        () => {}
    );
}

// =====================================================
// CHAT DEBT BADGE - reuses renderWalletDebtBadges() from customer column
// =====================================================

// =====================================================
// ERROR MESSAGE MAPPING (P5)
// =====================================================
function _friendlyChatError(code, err) {
    const map = {
        PAT_FAILED: {
            title: 'Hết phiên Pancake',
            body: 'Token truy cập đã hết hạn. Vui lòng thử lại hoặc reload trang.',
        },
        PAT_REGEN_FAILED: {
            title: 'Không làm mới được token',
            body: 'Tất cả account Pancake đều fail. Kiểm tra lại đăng nhập Pancake.',
        },
        MESSAGES_FETCH_FAILED: {
            title: 'Không tải được tin nhắn',
            body: 'Pancake API trả lỗi. Mạng có thể chậm hoặc page không quyền.',
        },
        TIMEOUT: {
            title: 'Quá thời gian chờ',
            body: 'Server chậm hoặc mạng không ổn định. Thử lại sau vài giây.',
        },
        HTTP_401: {
            title: 'Không đủ quyền',
            body: 'Token không hợp lệ. Thử đăng nhập lại Pancake.',
        },
        HTTP_403: {
            title: 'Bị chặn truy cập',
            body: 'Pancake từ chối request này. Liên hệ admin.',
        },
        HTTP_500: { title: 'Lỗi server Pancake', body: 'Thử lại sau vài phút.' },
        HTTP_502: { title: 'Pancake gateway lỗi', body: 'Thử lại sau vài phút.' },
        HTTP_503: { title: 'Pancake bảo trì', body: 'Thử lại sau.' },
        UNKNOWN: {
            title: 'Không tải được tin nhắn',
            body: err?.message || 'Lỗi không xác định. Thử lại.',
        },
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
window.openChatModal = async function (orderId, pageId, psid, conversationType) {
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
    // Reset per-modal phone-persist flag so reopening a different order's chat
    // doesn't carry the previous order's "persisted" state into the empty-state UI.
    window._chatPhonePersistedForPage = null;
    window.allChatMessages = [];
    window.currentChatReadWatermarks = [];
    window.currentChatCursor = null;
    window._chatNoMoreMessages = false;
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
        clone.querySelectorAll('.wallet-debt-badge').forEach((b) => b.remove());
        window.currentCustomerName = clone.textContent.trim();
    } else {
        window.currentCustomerName = '';
    }
    window.currentChatPhone =
        orderRow?.querySelector('td[data-column="phone"] span')?.textContent?.trim() || '';

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // Lock outer table scroll: snapshot scrollTop of every scrollable container
    // BEHIND the modal so we can restore it on close. Race seen: chat modal's
    // _scrollChatToBottom() uses focus()/scrollTop on chat messages — when an
    // image inside a message loads, the resulting reflow occasionally bubbles
    // a scroll up to the order table-wrapper (which has its own
    // overflow:auto + max-height:600px), shifting the page behind the modal.
    // Owner-reported flake: "lâu lâu nó sẽ scroll bảng ở ngoài luôn".
    //
    // Strategy: add `body.chat-modal-open` class → CSS pins outer scroll
    // containers to overflow:hidden+pointer-events:none. Save scrollTop before
    // lock so closeChatModal can restore the user's exact prior position.
    document.body.classList.add('chat-modal-open');
    const _scrollLockTargets = document.querySelectorAll('.table-wrapper, .table-container');
    window._chatModalScrollSnapshot = Array.from(_scrollLockTargets).map((el) => ({
        el,
        top: el.scrollTop,
        left: el.scrollLeft,
    }));

    // Click outside modal content to close
    modal.onclick = function (e) {
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
        copyPhoneBtn.onclick = function (e) {
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
        debtContainer.innerHTML =
            typeof renderWalletDebtBadges === 'function'
                ? renderWalletDebtBadges(window.currentChatPhone)
                : '';
    }

    // Update header avatar (same approach as inbox: extract direct avatar from conv data)
    _refreshChatHeaderAvatar();

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
            window.PancakeValidator.quickLookup(phone).then((data) => {
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
            const renderUrl =
                window.API_CONFIG?.RENDER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
            const _fetch = window.fetchWithTimeout || fetch;
            _fetch(`${renderUrl}/api/v2/customers/${phone}/notes`, {}, 6000)
                .then((r) => r.json())
                .then((data) => {
                    if (data.success && data.data?.length) {
                        for (const n of data.data) {
                            // Avoid duplicates
                            if (
                                !noteEl._allNotes.some(
                                    (x) => x.text === n.content && x.source === 'db'
                                )
                            ) {
                                noteEl._allNotes.push({
                                    text: n.content,
                                    source: 'db',
                                    by: n.created_by,
                                    pinned: n.is_pinned,
                                });
                            }
                        }
                        _updateNoteBanner(noteEl);
                    }
                })
                .catch(() => {});
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
        messagesEl.innerHTML =
            '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tải tin nhắn...</p></div>';
    }

    // Clear input
    const inputEl = document.getElementById('chatInput');
    if (inputEl) {
        inputEl.value = '';
        inputEl.style.height = 'auto';
    }

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
    if (window._chatLoadCtrl) {
        try {
            window._chatLoadCtrl.abort();
        } catch (_) {}
    }
    window._chatLoadCtrl = new AbortController();
    const mySignal = window._chatLoadCtrl.signal;
    try {
        await _findAndLoadConversation(pageId, psid, conversationType, myToken, {
            signal: mySignal,
        });
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
window.openCommentModal = function (orderId, pageId, psid) {
    window.openChatModal(orderId, pageId, psid, 'COMMENT');
};

/**
 * Show conversation picker (legacy compatibility)
 * Old code showed a dropdown to pick INBOX/COMMENT first.
 * New chat modal has built-in toggle, so just open INBOX directly.
 * Called from tab1-table.js and tab1-encoding.js onclick handlers.
 */
window.showConversationPicker = function (orderId, pageId, psid, event) {
    if (event) event.stopPropagation();
    window.openChatModal(orderId, pageId, psid, 'INBOX');
};

/**
 * Close chat modal
 */
window.closeChatModal = function () {
    const modal = document.getElementById('chatModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';

    // Release outer-scroll lock + restore user's prior scrollTop on the order
    // table-wrapper (and any other snapshotted scrollable container). Restore
    // BEFORE removing the class so the browser doesn't paint an intermediate
    // shifted state.
    if (Array.isArray(window._chatModalScrollSnapshot)) {
        for (const snap of window._chatModalScrollSnapshot) {
            try {
                if (snap.el && snap.el.isConnected) {
                    snap.el.scrollTop = snap.top;
                    snap.el.scrollLeft = snap.left;
                }
            } catch (_e) {
                /* ignore */
            }
        }
        window._chatModalScrollSnapshot = null;
    }
    document.body.classList.remove('chat-modal-open');

    // Stop chat polling
    _stopChatPolling();
    _closePageDropdown();

    // Cleanup Firebase realtime listeners to prevent memory leaks
    if (window._chatRealtimeUnsubscribe) {
        try {
            window._chatRealtimeUnsubscribe();
        } catch (e) {
            /* ignore */
        }
        window._chatRealtimeUnsubscribe = null;
    }
    if (window._chatPrivateReplyUnsubscribe) {
        try {
            window._chatPrivateReplyUnsubscribe();
        } catch (e) {
            /* ignore */
        }
        window._chatPrivateReplyUnsubscribe = null;
    }

    // Invalidate any in-flight loads
    window._chatLoadSeq = (window._chatLoadSeq || 0) + 1;
    clearTimeout(window._chatUpdateDebounce);
    if (window._chatUpdateDebounceMap) {
        window._chatUpdateDebounceMap.forEach((id) => clearTimeout(id));
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
    window.currentChatReadWatermarks = [];
    window.currentChatCursor = null;
    window._chatNoMoreMessages = false;
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
    if (inflight && Date.now() - inflight.ts < 3000) {
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

    // Reset picker carry-over from a previous lookup. The name-search block
    // below sets this only when it detects homonym ambiguity; clearing here
    // ensures we don't render a stale picker if this lookup resolves cleanly.
    window._chatPickerCandidates = null;

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
    }

    // PRIORITY 1: direct FB-ID lookup on Pancake.
    // After live recon (2026-05-11) we confirmed Pancake supports
    //   GET /api/v1/pages/{pageId}/conversations/{pageId}_{fbId}
    // → returns full conv object if exists, `{existed:false}` otherwise.
    // This is the most reliable lookup: no fuzzy name match, no phone-mismatch
    // ambiguity. Use the customer's target-page fb_id from our DB
    // (`pancake_data.page_fb_ids[pageId]`) when available — that's exactly
    // what set-phone flow persists for cross-page resolution.
    if (!conv && !allowDrift && pdm.fetchConversationDirect) {
        const phone = (window.currentChatPhone || '').toString().replace(/\D/g, '');
        if (phone) {
            try {
                const renderUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev';
                const r = await fetch(
                    `${renderUrl}/api/v2/customers/by-phone/${encodeURIComponent(phone)}`,
                    { signal: opts?.signal }
                );
                if (r.ok) {
                    const data = await r.json().catch(() => null);
                    const targetFbId = data?.pancake_data?.page_fb_ids?.[pageId];
                    if (targetFbId) {
                        try {
                            const direct = await pdm.fetchConversationDirect(pageId, targetFbId);
                            if (
                                direct &&
                                direct.id &&
                                direct.existed !== false &&
                                direct.success !== false
                            ) {
                                conv = direct;
                                console.log(
                                    `[Chat-Core] ✓ Direct FB-ID lookup hit: ${pageId}_${targetFbId}`
                                );
                            }
                        } catch (_e) {
                            /* fall through */
                        }
                    }
                }
            } catch (_e) {
                /* fall through to phone search */
            }
        }
        if (_isStale()) return;
    }

    // ─── PRIMARY (2026-04-26 v4): Phone-as-query Pancake search on target page ───
    // SĐT là khoá unique nhất xuyên page. Dùng `searchConversationsOnPage(pageId, phone)`
    // → Pancake tự match `recent_phone_numbers` → trả đúng conversation của customer.
    // Áp dụng cả initial open (allowDrift=true) và explicit switch (allowDrift=false).
    const _phoneNorm = (p) => (p == null ? '' : String(p).replace(/\D/g, '').replace(/^0/, ''));
    const _convHasPhoneVerify = (c, phoneN) => {
        if (!phoneN) return null;
        const pool = [].concat(c.recent_phone_numbers || []).concat(c.phone_numbers || []);
        for (const item of pool) {
            const raw = typeof item === 'string' ? item : item?.phone_number || item?.captured;
            if (_phoneNorm(raw) === phoneN) return true;
        }
        return false;
    };

    if (!conv) {
        const phone = _phoneNorm(window.currentChatPhone);
        if (phone && pdm.searchConversationsOnPage) {
            try {
                const phoneSearchRes = await pdm.searchConversationsOnPage(pageId, phone, {
                    signal: opts?.signal,
                });
                if (_isStale()) return;
                const matched = (phoneSearchRes.conversations || []).filter(
                    (c) =>
                        String(c.page_id) === String(pageId) &&
                        _convHasPhoneVerify(c, phone) === true
                );
                matched.sort((a, b) => {
                    if (a.type === 'INBOX' && b.type !== 'INBOX') return -1;
                    if (a.type !== 'INBOX' && b.type === 'INBOX') return 1;
                    return (
                        new Date(b.last_customer_interactive_at || b.updated_at || 0).getTime() -
                        new Date(a.last_customer_interactive_at || a.updated_at || 0).getTime()
                    );
                });
                if (matched.length > 0) {
                    conv = matched.find((c) => c.type === type) || matched[0];
                    if (!window._pageConvPickerCache) window._pageConvPickerCache = new Map();
                    window._pageConvPickerCache.set(pageId, { convs: matched, loadToken });
                }
            } catch (e) {
                if (e?.name === 'AbortError') throw e;
                console.warn('[Chat-Core] phone-search failed:', e?.message);
            }
        }
    }

    if (!conv && !allowDrift) {
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
        // dbLookupDone flips to true when at least one DB call succeeded — used to gate name
        // fallback (which can match a homonym on target page when the real customer is absent).
        let dbLookupDone = false;
        if (customerPhone || psid) {
            try {
                const renderUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev';
                const _fetch =
                    window.fetchOrNull ||
                    (async (u, o) => {
                        try {
                            const r = await fetch(u, o);
                            return r.ok ? r : null;
                        } catch {
                            return null;
                        }
                    });

                // Strategy: 1 customer = 1 globalId. Khi có SĐT → by-phone trả global authoritative.
                // Psid→globalId cache (`fb_global_id_cache`) có thể bị nhân viên merge nhầm khi xử
                // lý homonym (resolvedBy=<nv>) → KHÔNG trust khi đã có phone. Chỉ fallback sang
                // psid lookup khi customer không có phone.
                let globalId = null;
                if (customerPhone) {
                    const custRes = await _fetch(
                        `${renderUrl}/api/v2/customers/by-phone/${encodeURIComponent(customerPhone)}`,
                        { signal: opts?.signal },
                        6000
                    );
                    if (custRes) {
                        const custData = await custRes.json().catch(() => null);
                        globalId = custData?.global_id || null;
                        const pageFbIds = custData?.pancake_data?.page_fb_ids;
                        if (pageFbIds?.[pageId]) targetFbId = pageFbIds[pageId];
                        dbLookupDone = true;
                    }
                } else if (psid) {
                    // No phone — fallback to psid cache (best-effort, may be poisoned)
                    const srcPageId = window.currentChatChannelId || pageId;
                    const cacheRes = await _fetch(
                        `${renderUrl}/api/fb-global-id?pageId=${srcPageId}&psid=${psid}`,
                        { signal: opts?.signal },
                        6000
                    );
                    if (cacheRes) {
                        const cacheData = await cacheRes.json().catch(() => null);
                        if (cacheData?.found) globalId = cacheData.globalUserId;
                        dbLookupDone = true;
                    }
                }

                if (_isStale()) return;

                // Step C: use global_id to find fb_id on target page
                if (!targetFbId && globalId) {
                    const targetRes = await _fetch(
                        `${renderUrl}/api/fb-global-id/by-global?globalUserId=${globalId}&pageId=${pageId}`,
                        { signal: opts?.signal },
                        6000
                    );
                    if (targetRes) {
                        const targetData = await targetRes.json().catch(() => null);
                        if (targetData?.found) targetFbId = targetData.psid;
                        dbLookupDone = true;
                    }
                }
            } catch (e) {
                if (e?.name === 'AbortError') throw e;
                console.warn('[Chat-Core] DB lookup failed:', e.message);
            }
        }

        // If DB found exact fb_id → fetch conversations directly (precise, no name ambiguity)
        if (targetFbId) {
            const result = await pdm.fetchConversationsByCustomerFbId(pageId, targetFbId, {
                signal: opts?.signal,
            });
            foundConvs = (result.conversations || []).filter(
                (c) => String(c.page_id) === String(pageId)
            );
        }

        // BUG FIX (2026-04-26 v3): DB `customers/by-phone.pancake_data.page_fb_ids` đôi khi
        // INCOMPLETE — chỉ có 1 page binding mặc dù khách thật sự có conv trên nhiều page với
        // psid khác nhau. Empty state che mất conversation hợp lệ. Thay vì gate fallback, ta
        // VERIFY identity bằng cách match `recent_phone_numbers` của conv với SĐT đã biết:
        //   - cùng tên + cùng SĐT → cùng người, nhận
        //   - cùng tên + khác SĐT → homonym, từ chối
        const _normPhone = (p) => (p == null ? '' : String(p).replace(/\D/g, '').replace(/^0/, ''));
        const customerPhoneNorm = _normPhone(customerPhone);
        // Returns:
        //   true   — conv has phone meta and one matches customerPhone
        //   false  — conv has phone meta but NONE matches (likely homonym → reject)
        //   null   — uncertain (no customerPhone, OR conv has empty phone pool)
        // Bug fix (2026-05-10): old version returned `false` for empty pool, conflating
        // "no phone info" with "different phone" → rejected legitimate convs whose
        // phone simply hadn't been captured on the target page yet.
        const _convHasPhone = (c) => {
            if (!customerPhoneNorm) return null;
            const pool = [].concat(c.recent_phone_numbers || []).concat(c.phone_numbers || []);
            if (pool.length === 0) return null; // empty pool = uncertain, not "different"
            for (const item of pool) {
                const raw = typeof item === 'string' ? item : item?.phone_number || item?.captured;
                if (_normPhone(raw) === customerPhoneNorm) return true;
            }
            return false;
        };

        // Fallback: name search + phone verification
        if (foundConvs.length === 0 && customerName) {
            const _strip = (s) =>
                s
                    ?.normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/[\s\-_]+/g, ' ')
                    .trim() || '';
            // Bug fix (2026-05-10): order-row .customer-name may include suffixes
            // (e.g. "Hu\u1ef3nh Th\u00e0nh \u0110\u1ea1t - BOOM" \u2014 order tag), but Pancake conv name
            // is the bare customer name ("Hu\u1ef3nh Th\u00e0nh \u0110\u1ea1t"). Strict equality
            // rejected the match. Accept substring containment in either direction
            // \u2014 the search query is already the Pancake-side customerName so
            // homonym risk is bounded by phone verification below.
            const _nameMatch = (a, b) => {
                if (!a || !b) return false;
                const sa = _strip(a);
                const sb = _strip(b);
                if (!sa || !sb) return false;
                return sa === sb || sa.includes(sb) || sb.includes(sa);
            };

            if (pdm.searchConversations) {
                // Strip order-tag suffix " - <X>" from the search query — order rows often
                // display "Huỳnh Thành Đạt - BOOM" but Pancake stores the bare FB name
                // ("Huỳnh Thành Đạt"). Searching with the suffix yields 0 hits.
                // Owner repro 2026-05-10: 0123456788 → switch to Store → empty state.
                const _bareSearchName = (n) => {
                    if (!n) return '';
                    // Cut at first " - " (with surrounding spaces) — preserves names that
                    // legitimately have a dash in them (e.g. "Anne-Marie") since those
                    // typically don't have spaces around the dash.
                    const idx = n.indexOf(' - ');
                    return (idx > 0 ? n.substring(0, idx) : n).trim();
                };
                const searchQuery = _bareSearchName(customerName) || customerName;
                let searchResult = await pdm.searchConversations(searchQuery, {
                    signal: opts?.signal,
                });
                let onTargetPage = (searchResult.conversations || []).filter(
                    (c) =>
                        String(c.page_id) === String(pageId) &&
                        _nameMatch(c.from?.name, customerName)
                );
                // If bare-name search returned nothing on target page, retry with raw
                // customerName (some customers may have legit suffixes in their name).
                if (onTargetPage.length === 0 && searchQuery !== customerName) {
                    searchResult = await pdm.searchConversations(customerName, {
                        signal: opts?.signal,
                    });
                    onTargetPage = (searchResult.conversations || []).filter(
                        (c) =>
                            String(c.page_id) === String(pageId) &&
                            _nameMatch(c.from?.name, customerName)
                    );
                }
                if (customerPhoneNorm) {
                    // Verify identity by phone, GROUPED by fb_id (page-scoped customer).
                    // Reasoning: INBOX + COMMENT for the same customer share fb_id and
                    // belong to the same person. If ANY conv for a given fb_id has a
                    // confirmed phone mismatch (returns false), the entire fb_id is a
                    // homonym → reject ALL convs for that fb_id (even those with
                    // empty/uncertain phone meta).
                    //
                    // Owner repro 2026-05-10 trace: Store has 2 convs for fb_id
                    // 25717004554573583, both name "Huỳnh Thành Đạt":
                    //   • INBOX: recent_phones=[0908123456] → mismatch → reject
                    //   • COMMENT: recent_phones=[] → uncertain
                    // If we accepted COMMENT alone, we'd be loading the homonym's
                    // comments. Instead, the INBOX mismatch should disqualify the
                    // whole fb_id.
                    //
                    // Fetch detail for any uncertain conv to give it a fair chance
                    // before grouping — empty meta on the search shape often gets
                    // filled in by the per-fbId fetch.
                    const enriched = [];
                    for (const c of onTargetPage) {
                        const initialCheck = _convHasPhone(c);
                        if (initialCheck !== null) {
                            enriched.push({ conv: c, check: initialCheck });
                            continue;
                        }
                        const fbId = c.from_psid || c.from?.id;
                        if (!fbId) {
                            enriched.push({ conv: c, check: null });
                            continue;
                        }
                        try {
                            const detailRes = await pdm.fetchConversationsByCustomerFbId(
                                pageId,
                                fbId,
                                { signal: opts?.signal }
                            );
                            const detail = (detailRes.conversations || []).find(
                                (d) => String(d.id) === String(c.id)
                            );
                            const detailCheck = detail ? _convHasPhone(detail) : null;
                            enriched.push({ conv: detail || c, check: detailCheck });
                        } catch (_) {
                            enriched.push({ conv: c, check: null });
                        }
                    }

                    // Group by fb_id to spot homonyms via cross-conv evidence.
                    const byFbId = new Map();
                    for (const e of enriched) {
                        const fid = String(e.conv.from_psid || e.conv.from?.id || '');
                        if (!fid) {
                            byFbId.set(`__nofid_${e.conv.id}`, [e]);
                            continue;
                        }
                        if (!byFbId.has(fid)) byFbId.set(fid, []);
                        byFbId.get(fid).push(e);
                    }

                    // Bucket each fb_id group by phone-evidence verdict.
                    const matchedGroups = []; // ≥1 conv confirmed same phone
                    const uncertainGroups = []; // no phone evidence either way
                    const mismatchedGroups = []; // ≥1 conv confirmed different phone
                    for (const [fid, group] of byFbId) {
                        const hasMatch = group.some((g) => g.check === true);
                        const hasMismatch = group.some((g) => g.check === false);
                        const convs = group.map((g) => g.conv);
                        if (hasMatch) matchedGroups.push({ fid, convs });
                        else if (hasMismatch) mismatchedGroups.push({ fid, convs });
                        else uncertainGroups.push({ fid, convs });
                    }

                    // Decision tree:
                    //   • exactly 1 phone-match group → auto-accept (highest confidence).
                    //   • multiple match groups (phone collision, rare) → picker.
                    //   • no match + exactly 1 uncertain + no mismatch → auto-accept
                    //     (preserves prior "best-effort accept" for unambiguous case).
                    //   • everything else with ≥1 candidate → picker (lets the user
                    //     decide instead of silently rejecting Pancake hits — owner
                    //     repro 2026-05-11: "tìm sđt 0123456788 ở 2 page house và
                    //     store → đều tìm được mà". Phone-mismatch candidates are
                    //     surfaced so the user can recognize "wrong person".
                    //   • no candidates → empty state.
                    const allCandidates = [
                        ...matchedGroups,
                        ...uncertainGroups,
                        ...mismatchedGroups,
                    ].flatMap((g) => g.convs);
                    if (matchedGroups.length === 1) {
                        foundConvs = matchedGroups[0].convs;
                        window._chatPickerCandidates = null;
                    } else if (
                        matchedGroups.length === 0 &&
                        uncertainGroups.length === 1 &&
                        mismatchedGroups.length === 0
                    ) {
                        foundConvs = uncertainGroups[0].convs;
                        window._chatPickerCandidates = null;
                    } else if (allCandidates.length > 0) {
                        foundConvs = []; // force empty → picker renders below
                        window._chatPickerCandidates = allCandidates;
                    } else {
                        foundConvs = [];
                        window._chatPickerCandidates = null;
                    }
                } else {
                    // No phone — best-effort name match only
                    foundConvs = onTargetPage;
                }
            }
        }

        // Last fallback: page-specific API with source PSID — only when we have no phone to
        // verify (otherwise phone-verified path above is the only safe lookup).
        if (foundConvs.length === 0 && !customerPhoneNorm) {
            const result = await pdm.fetchConversationsByCustomerFbId(pageId, psid, {
                signal: opts?.signal,
            });
            foundConvs = (result.conversations || []).filter(
                (c) => String(c.page_id) === String(pageId)
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

            // Auto-pick the conv matching the requested type (INBOX/COMMENT) first.
            // Bug fix (2026-05-10): previously hardcoded 'INBOX' regardless of `type`
            // arg → switching to COMMENT tab silently loaded an INBOX conv.
            conv = foundConvs.find((c) => c.type === type) || foundConvs[0];

            // Cache for repick button (sync icon)
            if (!window._pageConvPickerCache) window._pageConvPickerCache = new Map();
            window._pageConvPickerCache.set(pageId, { convs: foundConvs, loadToken });
        }
    } else if (type === 'COMMENT') {
        // COMMENT: Always fetch fresh from API (cache may hold stale/deleted conversations)
        const result = await pdm.fetchConversationsByCustomerFbId(pageId, psid, {
            signal: opts?.signal,
        });
        const commentConvs = (result.conversations || []).filter((c) => c.type === 'COMMENT');

        if (commentConvs.length > 0) {
            commentConvs.sort(_byUpdatedAtDesc);
            conv = commentConvs[0];
        }

        // Fallback: multi-page search
        if (!conv) {
            const mpResult = await pdm.fetchConversationsByCustomerIdMultiPage(psid, {
                signal: opts?.signal,
            });
            const mpConvs = (mpResult.conversations || []).filter((c) => c.type === 'COMMENT');
            if (mpConvs.length > 0) {
                mpConvs.sort(_byUpdatedAtDesc);
                conv = mpConvs.find((c) => String(c.page_id) === String(pageId)) || mpConvs[0];
            }
        }
    } else {
        // INBOX: Use cached maps first, then API fallback
        // Guard: cache may hold cross-page conv (PSID = fb_id is page-scoped)
        const cachedConv =
            pdm.inboxMapByPSID.get(String(psid)) || pdm.inboxMapByFBID.get(String(psid));
        if (cachedConv && String(cachedConv.page_id) === String(pageId)) {
            conv = cachedConv;
        }

        if (!conv) {
            const result = await pdm.fetchConversationsByCustomerFbId(pageId, psid, {
                signal: opts?.signal,
            });
            const convs = result.conversations || [];
            conv = convs.find((c) => c.type === 'INBOX') || convs[0] || null;
        }

        // Fallback: multi-page search
        if (!conv) {
            const result = await pdm.fetchConversationsByCustomerIdMultiPage(psid, {
                signal: opts?.signal,
            });
            const convs = result.conversations || [];
            conv =
                convs.find((c) => c.type === type && String(c.page_id) === String(pageId)) ||
                convs.find((c) => String(c.page_id) === String(pageId)) ||
                convs.find((c) => c.type === type) ||
                convs[0] ||
                null;
        }
    }

    if (_isStale()) return;

    if (!conv) {
        const messagesEl = document.getElementById('chatMessages');
        if (messagesEl) {
            const pageName =
                (pdm.pages || []).find((p) => String(p.id) === String(pageId))?.name || pageId;
            // Owner-requested 2026-05-11: when no conv resolves (typically because
            // the customer's phone hasn't been captured on the target page yet so
            // our phone-based lookup chain can't find them), surface a "Khách
            // chưa có SĐT trên page này" empty state with an input to set the
            // phone manually. Saves to our customers table → next lookup on
            // either page finds them. Pancake's own phone capture is automatic
            // from chat content; this is the manual override for the same goal.
            const showPhoneSetter = !allowDrift; // only on explicit page-switch empty state
            const safePageName = _escapeHtml ? _escapeHtml(pageName) : String(pageName);
            const persisted = window._chatPhonePersistedForPage === pageId;

            // Priority: picker > phone-setter > generic empty.
            // Picker wins when name search returned ambiguous fb_id groups
            // (homonyms) OR a phone-mismatch candidate the user should still
            // see and verify. Trigger on ≥1 candidate so even a single
            // "wrong-phone" hit surfaces instead of silently empty-stating —
            // owner repro 2026-05-11: Store search 0123456788 returned a
            // homonym which was previously rejected & hidden.
            const pickerCandidates = window._chatPickerCandidates;
            const showPicker = Array.isArray(pickerCandidates) && pickerCandidates.length >= 1;

            if (showPicker) {
                messagesEl.innerHTML = _renderConvPickerEmptyState(pickerCandidates, safePageName);
                // Re-group the candidates the same way the renderer does so click
                // wiring resolves the right conv from the chosen fb_id.
                const byFbIdMap = new Map();
                for (const c of pickerCandidates) {
                    const fid = String(c.from_psid || c.from?.id || c.id);
                    if (!byFbIdMap.has(fid)) byFbIdMap.set(fid, []);
                    byFbIdMap.get(fid).push(c);
                }
                _wireConvPickerEmptyState(pageId, byFbIdMap, loadToken, type);
                // One-shot: clear so a subsequent unrelated lookup doesn't reuse it.
                window._chatPickerCandidates = null;
            } else {
                messagesEl.innerHTML = showPhoneSetter
                    ? _renderSetPhoneEmptyState(safePageName, { persisted })
                    : '<div class="chat-empty-state"><p>Không tìm thấy cuộc hội thoại với khách hàng này.</p></div>';
                if (showPhoneSetter) _wireSetPhoneEmptyState(pageId);
            }
        }
        return;
    }

    window.currentConversationId = conv.id;
    window.currentConversationData = conv;

    // Sync currentChatPSID to the page-scoped PSID of the resolved conv. PSIDs are
    // FB-page-specific — same human = different PSID per page. After cross-page
    // switch (Nhi Judy House → NhiJudy Store), the PSID we used to open the
    // chat ("from old page") is wrong for the new page. Save the correct one
    // so subsequent type-switch (INBOX↔COMMENT), bill send, extension bypass,
    // etc. all use the page-correct PSID.
    const convPSID = conv.from_psid || conv.from?.id || null;
    if (convPSID && convPSID !== window.currentChatPSID) {
        window.currentChatPSID = String(convPSID);
    }

    // Refresh chat header avatar after conv resolves — _getChatAvatarUrl
    // reads from currentConversationData which we just updated, so the
    // avatar shown will reflect this page's customer profile (different
    // pages can have different cached avatars for the same human).
    _refreshChatHeaderAvatar();

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

    // READ semantics (owner clarification 2026-05-11):
    //   "mở modal tin nhắn không tính là read mà tương tác với khách
    //    → tin nhắn cuối cùng là của page, có chữ ký nv, là Nhijudy
    //      House / Nhijudy Store → thì là read"
    //
    // Diễn giải: chỉ marked-as-read khi SHOP đã tương tác (gửi tin nhắn
    // cuối), KHÔNG phải khi user chỉ mở modal xem. Indicator:
    //   • Pancake's `last_sent_by.id === pageId`  (authoritative), HOẶC
    //   • snippet có chữ ký nhân viên "NV.{name}" (reply-tool tự append)
    //
    // Khi điều kiện thỏa → DELETE pending_customers row (multi-staff
    // sync) + clearPendingForCustomer local (badge biến ngay).
    //
    // Send/react paths đã có _markRepliedOnServer riêng (chat-products-ui,
    // quick-reply-manager) → tương tác trực tiếp luôn được tính read.
    try {
        const psidForClear = String(conv.from_psid || conv.from?.id || psid || '');
        const convPageIdStr = String(convPageId || conv.page_id || '');
        const lastSenderId = String(conv.last_sent_by?.id || conv.last_message?.from?.id || '');
        const shopSentLast = !!lastSenderId && lastSenderId === convPageIdStr;
        const snippet = conv.snippet || '';
        // NV.{name} signature appended by our reply tool (e.g. "...\nNV.Bo",
        // "Nv.My"). Strong evidence shop replied — covers cases where
        // last_sent_by is missing/stale from Pancake's side.
        const hasNvSignature = /[\r\n]\s*N\.?V\.?\s*[A-Za-zÀ-ỹ]/i.test(snippet);
        const shopInteracted = shopSentLast || hasNvSignature;
        if (shopInteracted && psidForClear) {
            _markRepliedOnServer(psidForClear, convPageIdStr);
            if (window.newMessagesNotifier) {
                const pending = window.newMessagesNotifier
                    .getPendingCustomers()
                    .find((pc) => String(pc.psid || pc.from_psid || '') === psidForClear);
                if (pending) {
                    window.newMessagesNotifier.clearPendingForCustomer(psidForClear);
                    console.log(
                        `[Chat-Core] Cleared ${pending.inboxCount || 0} MỚI for ${psidForClear} (shop interacted: shopSentLast=${shopSentLast} NV=${hasNvSignature})`
                    );
                }
            }
        }
    } catch (_e) {
        /* mark-read is best-effort */
    }

    // Enrich thread_id if missing (needed for extension bypass / GET_GLOBAL_ID_FOR_CONV)
    // inboxMapByPSID cache and messages API often don't have thread_id,
    // but conversation list API does. Fire background fetch to get it.
    // Pass opts.signal so modal close/switch aborts this zombie fetch.
    if (!conv.thread_id && type !== 'COMMENT') {
        pdm.fetchConversationsByCustomerFbId(convPageId, psid, { signal: opts?.signal })
            .then((result) => {
                const apiConv = (result.conversations || []).find((c) => c.id === conv.id);
                if (apiConv?.thread_id && window.currentConversationData?.id === conv.id) {
                    window.currentConversationData.thread_id = apiConv.thread_id;
                    // Also set in _raw for buildConvData
                    if (window.currentConversationData._raw) {
                        window.currentConversationData._raw.thread_id = apiConv.thread_id;
                    }
                    console.log('[Chat-Core] Enriched thread_id:', apiConv.thread_id);
                }
            })
            .catch(() => {});
    }

    // Load messages - customerId from customers array or from.id
    const customerId =
        conv.customers?.[0]?.id || conv.customerId || conv.customer?.id || conv.from?.id || null;
    await _loadMessages(convPageId, conv.id, customerId, loadToken, opts);
}

/**
 * Load messages for a conversation
 * @param {object} [opts] - { signal } for AbortController propagation
 */
/**
 * Apply messages result vào state + render. Tách thành function riêng để
 * SWR pattern: gọi 1 lần với cached, gọi lại khi revalidate có fresh data.
 */
function _applyMessagesResult(result, pageId, conversationId) {
    if (!result) return;

    // Store conversation data (for extension bypass - thread_id, global_id)
    if (result.conversation) {
        const rc = result.conversation;
        if (!window.currentConversationData) window.currentConversationData = {};
        const existingThreadId =
            window.currentConversationData.thread_id ||
            window.currentConversationData._raw?.thread_id;
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

        const gid =
            result.global_id ||
            rc.page_customer?.global_id ||
            (result.customers || []).find((c) => c.global_id)?.global_id;
        if (gid) {
            const cacheKey = conversationId || `${pageId}_${window.currentChatPSID}`;
            _setGlobalIdCache(cacheKey, gid);
            window.currentConversationData._globalId = gid;
        }

        window.currentConversationData._canInbox = result.can_inbox ?? true;
    }

    // Map messages
    const messages = (result.messages || []).map((msg) => {
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
            reactions: (msg.attachments || []).filter((a) => a.type === 'reaction'),
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

    if (window.currentConversationType === 'COMMENT' && window.PrivateReplyStore) {
        messages.forEach((m) => {
            if (m.privateReplyConversation && !window.PrivateReplyStore.has(m.id)) {
                window.PrivateReplyStore.mark(m.id, m.text, m.senderName);
            }
        });
    }

    // Reconcile optimistic placeholders với fresh data
    const survivors = window
        ._reconcileOptimisticReplies(window.allChatMessages, messages)
        .filter((m) => typeof m.id === 'string' && m.id.startsWith('pr_'));
    if (survivors.length) messages.push(...survivors);

    window.allChatMessages = messages;
    window.currentChatCursor = result.current_count || messages.length;

    // Read watermarks (per-PSID timestamp showing how far the customer has read).
    // Used by renderChatMessages to display a "đã xem" avatar under the latest
    // shop message the customer has read up to.
    if (Array.isArray(result.read_watermarks)) {
        window.currentChatReadWatermarks = result.read_watermarks;
    }

    if (window.renderChatMessages) {
        window.renderChatMessages(messages);
    }

    // Fire-and-forget DB sync (chỉ khi fresh data, không fire-on-cache để tránh dup)
    if (!result.fromCache) {
        _syncPancakeCustomerToDB(result, pageId);
    }
}

async function _loadMessages(pageId, conversationId, customerId, loadToken, opts = {}) {
    const pdm = window.pancakeDataManager;
    if (!pdm) return;
    if (loadToken == null) loadToken = window._chatLoadSeq;
    const _isStale = () => loadToken !== window._chatLoadSeq;

    // SWR: callback re-render khi background revalidate trả fresh data.
    // Tận dụng cùng processing chain qua _applyMessagesResult().
    const onRevalidate = (fresh) => {
        if (_isStale()) return;
        try {
            _applyMessagesResult(fresh, pageId, conversationId);
        } catch (e) {
            console.warn('[CHAT] revalidate apply failed:', e?.message || e);
        }
    };

    try {
        // P5: throwOnError — let error bubble to openChatModal catch which shows retry button
        const result = await pdm.fetchMessages(pageId, conversationId, null, customerId, false, {
            signal: opts.signal,
            throwOnError: true,
            onRevalidate,
        });
        if (_isStale()) return;
        _applyMessagesResult(result, pageId, conversationId);
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
window.loadMoreMessages = async function () {
    if (
        window.isLoadingMoreMessages ||
        window._chatNoMoreMessages ||
        !window.currentConversationId ||
        !window.currentChatCursor
    )
        return;
    window.isLoadingMoreMessages = true;

    // Snapshot conv identity at start to detect switch during fetch
    const startToken = window._chatLoadSeq;
    const startConvId = window.currentConversationId;
    const startPageId = window.currentChatChannelId;

    try {
        const pdm = window.pancakeDataManager;
        if (!pdm) return;

        const result = await pdm.fetchMessages(startPageId, startConvId, window.currentChatCursor);

        // Bail if user switched conversation/page/type while we were fetching
        if (
            startToken !== window._chatLoadSeq ||
            startConvId !== window.currentConversationId ||
            startPageId !== window.currentChatChannelId
        ) {
            return;
        }

        const newMessages = (result.messages || []).map((msg) => {
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
        } else {
            // API trả 0 message → đã hết tin cũ. Stop infinite scroll trigger.
            window._chatNoMoreMessages = true;
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
    window.currentChatReadWatermarks = [];
    window.currentChatCursor = null;
    window._chatNoMoreMessages = false;
    window.currentReplyMessage = null;
    window.isLoadingMoreMessages = false;
    const preview = document.getElementById('replyPreview');
    if (preview) preview.classList.remove('active');
    if (typeof window.clearImagePreviews === 'function') {
        try {
            window.clearImagePreviews();
        } catch (_) {}
    }
}

// Shared: reconcile optimistic placeholders ("pr_*" private-reply, "opt_*" inbox send)
// trong `existing` against `incoming` real shop messages — match theo text. Khi server đã
// có bản tin thật → drop optimistic để tránh hiện 2 tin trùng (flicker khi realtime/refetch
// trả về tin thật trong lúc opt_* vẫn còn). Mutates PrivateReplyStore marks cho pr_*.
window._reconcileOptimisticReplies = function (existing, incoming) {
    if (!existing?.length || !incoming?.length) return existing || [];
    const isTempId = (id) => {
        const s = String(id || '');
        return s.startsWith('pr_') || s.startsWith('opt_');
    };
    const realShopTexts = new Set(
        incoming
            .filter((m) => m.sender === 'shop')
            .map((m) => (m.text || '').trim())
            .filter((t) => t !== '')
    );
    const survivors = [];
    for (const o of existing) {
        if (!isTempId(o.id)) {
            survivors.push(o);
            continue;
        }
        const txt = (o.text || '').trim();
        if (!txt || !realShopTexts.has(txt)) {
            survivors.push(o);
            continue;
        }
        // Matched — migrate PrivateReplyStore mark cho pr_* sang real id
        if (String(o.id).startsWith('pr_')) {
            const real = incoming.find((m) => m.sender === 'shop' && (m.text || '').trim() === txt);
            if (real && window.PrivateReplyStore?.has?.(o.id)) {
                try {
                    window.PrivateReplyStore.mark(real.id, o.text, o.senderName);
                    window.PrivateReplyStore.unmark?.(o.id);
                } catch (_) {}
            }
        }
        // Drop optimistic — server đã có bản thật
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

window.switchConversationType = async function (type) {
    if (type === window.currentConversationType) return;
    window.currentConversationType = type;

    _updateTypeToggle(type);
    const myToken = ++window._chatLoadSeq;
    _resetTransientChatState();

    // Re-find conversation with new type
    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) {
        messagesEl.innerHTML =
            '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tải...</p></div>';
    }

    try {
        // allowDrift=false → use strict same-page lookup with phone-search +
        // name-search fallback. Without this, type-switch on a non-default page
        // would only hit the cache/PSID-by-fbid path which uses the original
        // page's PSID (page-scoped) and silently misses the right conv.
        await _findAndLoadConversation(
            window.currentChatChannelId,
            window.currentChatPSID,
            type,
            myToken,
            { allowDrift: false }
        );
    } catch (e) {
        if (myToken !== window._chatLoadSeq) return;
        if (messagesEl) {
            messagesEl.innerHTML =
                '<div class="chat-empty-state"><p>Không tìm thấy cuộc hội thoại.</p></div>';
        }
    }
};

// =====================================================
// REPLY MANAGEMENT
// =====================================================

window.setReplyMessage = function (msgId) {
    const msg = window.allChatMessages.find((m) => m.id === msgId);
    if (!msg) return;

    window.currentReplyMessage = {
        id: msgId,
        text: msg.text,
        sender: msg.sender,
        senderName: msg.senderName,
    };

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

window.cancelReply = function () {
    window.currentReplyMessage = null;
    const preview = document.getElementById('replyPreview');
    if (preview) preview.classList.remove('active');
};

// =====================================================
// REPLY TYPE MANAGEMENT (COMMENT mode)
// =====================================================

window.setReplyType = function (type) {
    window.currentReplyType = type;
    const select = document.getElementById('replyTypeSelect');
    if (select) select.value = type;

    // Update input placeholder
    const input = document.getElementById('chatInput');
    if (input) {
        input.placeholder =
            type === 'private_replies' ? 'Nhắn riêng cho khách...' : 'Trả lời bình luận...';
    }
};

// =====================================================
// INTERNAL HELPERS
// =====================================================

function _updateTypeToggle(type) {
    document.querySelectorAll('.conv-type-toggle button').forEach((btn) => {
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
        // Pancake's /api/v1/pages returns avatar_url only for Instagram pages
        // (Facebook pages get null). Use the token-bound /avatar endpoint via
        // our CF worker proxy — works for both platforms.
        const avatarUrl = page.avatar_url || _getPageAvatarProxyUrl(pageId);
        const safeInitial = String(initial).replace(/['"\\<>&]/g, '');
        const avatarHtml = avatarUrl
            ? `<img src="${avatarUrl}" class="chat-page-item-avatar" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'chat-page-item-avatar-ph\\'>${safeInitial}</div>'">`
            : `<div class="chat-page-item-avatar-ph">${safeInitial}</div>`;

        html += `<div class="chat-page-item${isActive ? ' active' : ''}" data-page-id="${pageId}">
            ${avatarHtml}
            <span class="chat-page-item-name">${_escapeHtml(name)}</span>
            <span class="material-symbols-outlined chat-page-item-check">check</span>
        </div>`;
    }

    dropdown.innerHTML = html;

    // Bind clicks
    dropdown.querySelectorAll('.chat-page-item').forEach((item) => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const pageId = item.dataset.pageId;
            _closePageDropdown();
            if (pageId && String(pageId) !== String(window.currentChatChannelId)) {
                // Gọi switchChatPage TRƯỚC — phần đầu (sync) của async function set
                // window.currentChatChannelId = pageId ngay lập tức. Nhờ đó
                // `_renderPageSelectorItems` đọc giá trị mới và đặt checkmark đúng item.
                // Trước đây gọi sau → render đọc giá trị OLD → label và checkmark lệch nhau.
                window.switchChatPage(pageId);
                _updatePageSelectorLabel(pageId);
                _renderPageSelectorItems();
            }
        });
    });
}

function _updatePageSelectorLabel(pageId) {
    const label = document.getElementById('chatPageSelectorLabel');
    if (!label) return;
    const pdm = window.pancakeDataManager;
    const page = (pdm?.pages || []).find((p) => String(p.id) === String(pageId));
    label.textContent = page?.name || 'Page';

    // Render the active page's avatar in the selector button (replaces the
    // generic `storefront` Material icon when an avatar is available). Same
    // shape as dropdown-item avatars below: 18px circle, fallback to initial
    // on img error. Owner repro 2026-05-10: "coi lại luôn phần load avatar
    // khách và avatar page" — page side was always a static storefront icon.
    const btn = document.getElementById('chatPageSelectorBtn');
    if (!btn) return;
    let icon = btn.querySelector('.chat-page-selector-icon');
    if (!icon) {
        // Replace the leading `storefront` material icon with a span we own.
        const old = btn.querySelector('.material-symbols-outlined');
        if (old && old.textContent.trim() === 'storefront') {
            const newSpan = document.createElement('span');
            newSpan.className = 'chat-page-selector-icon';
            newSpan.style.cssText =
                'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;overflow:hidden;font-size:10px;font-weight:700;color:#475569;background:#e2e8f0;flex:0 0 auto;';
            old.replaceWith(newSpan);
            icon = newSpan;
        }
    }
    if (icon) {
        const initial = (page?.name || 'P').charAt(0).toUpperCase();
        const safeInitial = initial.replace(/['"\\<>&]/g, '');
        // Prefer Instagram-style CDN avatar_url; fall back to the
        // token-bound /avatar proxy for Facebook pages.
        const avatarUrl = page?.avatar_url || _getPageAvatarProxyUrl(pageId);
        if (avatarUrl) {
            icon.innerHTML = `<img src="${avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.textContent='${safeInitial}'">`;
        } else {
            icon.textContent = safeInitial;
        }
    }
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
            dropdown.style.top = rect.bottom + 4 + 'px';
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

        const phone =
            messagesResult.recent_phone_numbers?.[0] ||
            messagesResult.conv_phone_numbers?.[0] ||
            cust.recent_phone_numbers?.[0]?.phone_number ||
            null;

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
        _fetch(
            `${renderUrl}/api/v2/customers/sync-pancake`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            },
            8000
        )
            .then((r) => r.json())
            .then((data) => {
                if (data.success) {
                    console.log(
                        `[Chat-Core] Synced customer "${cust.name}" to DB (${data.action})`
                    );
                }
            })
            .catch(() => {});
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
    const pageName =
        (pdm?.pages || []).find((p) => String(p.id) === String(pageId))?.name || pageId;

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
    pickerDiv.querySelectorAll('.chat-conv-picker-item').forEach((item) => {
        item.addEventListener('click', () => {
            const convId = item.dataset.convId;
            const allConvs = window._pageConvPickerCache?.get(pageId)?.convs || convs;
            const conv =
                allConvs.find((c) => c.id === convId) || convs.find((c) => c.id === convId);
            if (conv) _pickConversation(conv, pageId, loadToken);
        });
    });
}

function _showConversationPicker(convs, pageId, loadToken) {
    const messagesEl = document.getElementById('chatMessages');
    if (!messagesEl) return;

    const pdm = window.pancakeDataManager;
    const pageName =
        (pdm?.pages || []).find((p) => String(p.id) === String(pageId))?.name || pageId;

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
    messagesEl.querySelectorAll('.chat-conv-picker-item').forEach((item) => {
        item.addEventListener('click', () => {
            const convId = item.dataset.convId;
            const conv = convs.find((c) => c.id === convId);
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
        try {
            window.clearImagePreviews();
        } catch (_) {}
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
        messagesEl.innerHTML =
            '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tải...</p></div>';
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
    } catch (_) {
        return '';
    }
}

// Show/hide re-pick button (visible when >1 page available)
function _updateRepickBtnVisibility() {
    const btn = document.getElementById('chatRepickConvBtn');
    if (!btn) return;
    const pdm = window.pancakeDataManager;
    btn.style.display = pdm?.pages?.length > 1 ? '' : 'none';
}

/**
 * Re-pick conversation: clear cache for current page+psid+type,
 * then re-fetch fresh from API.
 */
window.repickConversation = async function () {
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
        messagesEl.innerHTML =
            '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tìm đoạn hội thoại...</p></div>';
    }

    try {
        // Force picker mode: search all convs and show picker
        const pdm = window.pancakeDataManager;
        const customerName = window.currentCustomerName;
        let foundConvs = [];
        if (customerName && pdm?.searchConversationsOnPage) {
            const r = await pdm.searchConversationsOnPage(pageId, customerName);
            foundConvs = (r.conversations || []).filter((c) => c.from?.name === customerName);
        }
        if (foundConvs.length === 0) {
            const r = await pdm.fetchConversationsByCustomerFbId(pageId, psid);
            foundConvs = (r.conversations || []).filter(
                (c) => String(c.page_id) === String(pageId)
            );
        }
        if (myToken !== window._chatLoadSeq) return;

        if (foundConvs.length <= 1) {
            // 0 or 1 → just load it
            await _findAndLoadConversation(pageId, psid, window.currentConversationType, myToken, {
                allowDrift: false,
            });
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
            messagesEl.innerHTML =
                '<div class="chat-empty-state"><p>Không tìm thấy cuộc hội thoại.</p></div>';
        }
    }
};

window.switchChatPage = async function (newPageId) {
    if (!newPageId || String(newPageId) === String(window.currentChatChannelId)) return;

    window.currentChatChannelId = newPageId;
    window.currentSendPageId = newPageId;

    // Remember page choice per customer (psid) for next time
    _savePreferredPage(window.currentChatPSID, newPageId);
    const myToken = ++window._chatLoadSeq;
    _resetTransientChatState();

    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) {
        messagesEl.innerHTML =
            '<div class="chat-loading"><div class="loading-spinner"></div><p>Đang tải...</p></div>';
    }

    try {
        await _findAndLoadConversation(
            newPageId,
            window.currentChatPSID,
            window.currentConversationType,
            myToken,
            { allowDrift: false }
        );
    } catch (e) {
        if (myToken !== window._chatLoadSeq) return;
        console.error('[Chat-Core] switchChatPage error:', e);
        if (messagesEl) {
            messagesEl.innerHTML =
                '<div class="chat-empty-state"><p>Không tìm thấy cuộc hội thoại trên trang này.</p></div>';
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
                const existingIds = new Set(window.allChatMessages.map((m) => String(m.id)));
                const newMsgs = result.messages.filter((m) => !existingIds.has(String(m.id)));
                for (const msg of newMsgs) {
                    window.handleNewMessage?.({ message: msg, page_id: pageId });
                }
            } catch (e) {
                /* silent */
            }
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
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
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
    } catch {
        return null;
    }
}

function _savePreferredPage(psid, pageId) {
    if (!psid || !pageId) return;
    try {
        const map = JSON.parse(localStorage.getItem(PREF_PAGE_KEY) || '{}');
        map[psid] = pageId;

        // Trim old entries if too many
        const keys = Object.keys(map);
        if (keys.length > PREF_PAGE_MAX) {
            keys.slice(0, keys.length - PREF_PAGE_MAX).forEach((k) => delete map[k]);
        }

        localStorage.setItem(PREF_PAGE_KEY, JSON.stringify(map));
    } catch {
        /* quota exceeded — ignore */
    }
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

window._toggleChatNoteSource = function () {
    const noteEl = document.getElementById('chatOrderNote');
    if (!noteEl) return;
    const notes = noteEl._allNotes || [];
    if (notes.length === 0) return;

    // Close existing popup
    const existing = document.getElementById('chatNotesPopup');
    if (existing) {
        existing.remove();
        return;
    }

    // Build popup
    const popup = document.createElement('div');
    popup.id = 'chatNotesPopup';
    popup.className = 'chat-notes-popup';

    const sourceLabels = { tpos: '📝 TPOS', pancake: '🟠 Pancake', db: '📌 N2Store' };
    const sourceColors = { tpos: '#fef3c7', pancake: '#fff7ed', db: '#ede9fe' };
    const sourceBorders = { tpos: '#fde68a', pancake: '#fed7aa', db: '#c4b5fd' };

    let html =
        '<div class="cnp-header"><span class="cnp-title">Ghi chú khách hàng</span><button class="cnp-close" onclick="document.getElementById(\'chatNotesPopup\')?.remove()">&times;</button></div>';
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
    popup.style.top = rect.bottom + 4 + 'px';
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
