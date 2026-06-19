// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — interactions modal shell/header/tabs + right panel + quick reply + extension bridge. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // ---------- Interactions modal: Tin nhắn + Bình luận ----------
    // Phase 18b: chat + reply directly in modal via lazy-loaded Pancake API.
    // Realtime-aware: subscribes to native_order:updated and refreshes the
    // open modal when the same order changes.
    NO._interactionsState = null;
    // { code, tab, scrollY }

    /**
     * Web2Chat client is loaded via index.html (`web2/shared/web2-chat-client.js`).
     * No shared code with Web 1.0 — token config is read directly from
     * localStorage keys that the user already configured in web2-pancake.
     */
    NO._hasChatClient = function _hasChatClient() {
        return !!window.Web2Chat;
    };

    NO.openInteractions = async function openInteractions(code, initialTab = 'messages') {
        const order = NO.STATE.orders.find((o) => o.code === code);
        if (!order) {
            NO.notify('Không tìm thấy đơn ' + code, 'error');
            return;
        }
        // HỢP NHẤT 1 NGUỒN (2026-06-19): dùng Web2CustomerChat shared (3-cột Pancake
        // sidebar tìm kiếm + thread) — tin nhắn KH. Comments của đơn + info → cột INFO
        // bên phải (panels.info), reply bind lại trong onReady. Web2CustomerChat tự lo
        // resolve hội thoại (phone → fbId) + realtime (Web2ChatPanel) → KHÔNG cần modal
        // chat riêng của native-orders nữa.
        if (window.Web2CustomerChat?.open) {
            NO._interactionsState = { code, viaCustomerChat: true };
            window.Web2CustomerChat.open({
                layout: 'modal',
                phone: order.phone,
                fbId: order.fbUserId,
                pageId: order.fbPageId,
                name: order.customerName || order.fbUserName || '',
                query: order.phone || order.customerName || '',
                panels: { info: NO._renderInteractionsInfoHtml(order) },
                onReady: (handle) => {
                    const infoEl = handle && handle.getInfoEl && handle.getInfoEl();
                    if (infoEl) NO._wireCommentReplies(infoEl, order);
                    window.lucide?.createIcons?.();
                },
            });
            return;
        }
        // Fallback (Web2CustomerChat chưa load): modal chat cũ của native-orders.
        NO._interactionsState = { code, tab: initialTab };
        NO._renderInteractionsModal(order, initialTab);
    };

    // Cột INFO (panels.info) cho Web2CustomerChat: tiêu đề đơn + panel bình luận.
    NO._renderInteractionsInfoHtml = function _renderInteractionsInfoHtml(order) {
        const esc = NO.escapeHtml;
        const head = `
            <div style="font-weight:700;font-size:13px;color:var(--web2-text,#111827);display:flex;align-items:center;gap:6px;">
                <i data-lucide="message-square-text" style="width:15px;height:15px;"></i> Bình luận của đơn
            </div>
            <div style="font-size:12px;color:var(--web2-text-mute,#6b7280);">
                ${esc(order.code || '')}${order.customerName ? ' · ' + esc(order.customerName) : ''}${order.phone ? ' · ' + esc(order.phone) : ''}
            </div>`;
        return `<div style="display:flex;flex-direction:column;gap:10px;">${head}${NO._renderCommentsPanel(order)}</div>`;
    };

    // Bind nút trả lời bình luận trong cột info (Web2CustomerChat onReady) — tái dùng
    // NO._handleReplyComment (giống nhánh tab 'comments' của modal cũ).
    NO._wireCommentReplies = function _wireCommentReplies(root, order) {
        if (!root) return;
        root.querySelectorAll('[data-action="reply-comment"]').forEach((btn) => {
            btn.addEventListener('click', () =>
                NO._handleReplyComment(order, btn.dataset.cid, btn.dataset.input, 'public')
            );
        });
        root.querySelectorAll('[data-action="private-reply"]').forEach((btn) => {
            btn.addEventListener('click', () =>
                NO._handleReplyComment(order, btn.dataset.cid, btn.dataset.input, 'private')
            );
        });
        root.querySelectorAll('textarea[id^="replyCmt-"]').forEach((ta) => {
            ta.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    const cid = ta.parentElement?.querySelector('[data-action="reply-comment"]')
                        ?.dataset?.cid;
                    if (cid) NO._handleReplyComment(order, cid, ta.id, 'public');
                }
            });
        });
    };

    /**
     * Build the avatar + info HTML used inside `.w2-inbox-header`. Extracted
     * so we can re-render only the header when the user clicks a different
     * conversation in the sidebar (see `_applyChatHeaderForOrder`).
     */
    NO._renderChatHeaderInner = function _renderChatHeaderInner(order) {
        const initials = (order.customerName || order.fbUserName || '?')
            .trim()
            .split(/\s+/)
            .slice(-2)
            .map((s) => s.charAt(0).toUpperCase())
            .join('');
        const phoneHtml = order.phone
            ? `<span class="w2-chat-phone" data-phone="${NO.escapeHtml(order.phone)}" title="Click để copy SĐT">📞 ${NO.escapeHtml(order.phone)} <i data-lucide="copy" style="width:11px;height:11px;display:inline;margin-left:2px;vertical-align:middle;opacity:0.55;"></i></span>`
            : `<span style="color:#cbd5e1;">không SĐT</span>`;
        const tagsHtml =
            Array.isArray(order.tags) && order.tags.length
                ? order.tags
                      .slice(0, 4)
                      .map(
                          (t) =>
                              `<span style="background:#f0fdf4;color:#166534;font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid #bbf7d0;">${NO.escapeHtml(t)}</span>`
                      )
                      .join('')
                : '';
        const avatarHtml =
            order.fbUserId && order.fbPageId
                ? `<img src="${NO.escapeHtml(NO._avatarUrl(order.fbUserId, order.fbPageId))}" alt="${NO.escapeHtml(order.customerName || order.fbUserName || '?')}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;background:linear-gradient(135deg,#0068ff 0%,#2a96ff 100%);" loading="eager" onerror="this.outerHTML='<div style=&quot;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#0068ff 0%,#2a96ff 100%);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:14px;&quot;>${NO.escapeHtml(initials).replace(/'/g, '&#39;')}</div>'" />`
                : `<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#0068ff 0%,#2a96ff 100%);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:14px;">${NO.escapeHtml(initials)}</div>`;
        const codeBadge = order.code
            ? `<span style="background:#e0e7ff;color:#0058da;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;">${NO.escapeHtml(order.code)}</span>`
            : '';
        const pageBadge = order.fbPageId
            ? `<span style="background:#dbeafe;color:#1e40af;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;">Page …${NO.escapeHtml(String(order.fbPageId).slice(-6))}</span>`
            : '';
        const infoHtml = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
                <strong style="font-size:15px;color:#0f172a;">${NO.escapeHtml(order.customerName || order.fbUserName || '—')}</strong>
                ${codeBadge}
                ${tagsHtml}
            </div>
            <div style="font-size:11px;color:#64748b;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                ${phoneHtml}
                ${pageBadge}
            </div>`;
        return { avatarHtml, infoHtml };
    };

    /**
     * Swap the avatar + info section of the open chat modal in-place to
     * reflect a different customer/order. Sidebar, message thread and
     * action buttons stay mounted — only the header content changes, so
     * scroll position, search input, and WebSocket subscriptions survive.
     */
    NO._applyChatHeaderForOrder = function _applyChatHeaderForOrder(order) {
        const { avatarHtml, infoHtml } = NO._renderChatHeaderInner(order);
        const av = document.getElementById('w2ChatHeaderAvatar');
        const info = document.getElementById('w2ChatHeaderInfo');
        if (av) av.innerHTML = avatarHtml;
        if (info) info.innerHTML = infoHtml;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };

    NO._renderInteractionsModal = function _renderInteractionsModal(order, tab) {
        let modal = document.getElementById('orderInteractionsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'orderInteractionsModal';
            modal.className = 'w2p-overlay';
            document.body.appendChild(modal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) NO._closeInteractions();
            });
        }
        modal.style.display = 'flex';
        // Apply pop entrance to overlay + card (only on first open of this modal session)
        modal.classList.add('w2fx-backdrop');
        const { avatarHtml, infoHtml } = NO._renderChatHeaderInner(order);
        const totalEarn = order.amountTotal || order.total;
        const totalHtml = totalEarn
            ? `<div style="align-self:center;font-size:12px;color:#64748b;margin-right:6px;">Tổng đơn: <strong style="color:#15803d;font-size:13px;">${(Number(totalEarn) || 0).toLocaleString('vi-VN')}đ</strong></div>`
            : '';

        modal.innerHTML = `
            <div class="w2p-card w2fx-pop w2-inbox-card" style="width:96vw;height:92vh;max-width:1600px;display:flex;flex-direction:column;overflow:hidden;">
                <div class="w2-inbox-grid">
                    <aside class="w2-inbox-sidebar" id="w2InboxSidebar">
                        ${NO._renderInboxSidebarShell()}
                    </aside>
                    <main class="w2-inbox-center">
                        <div class="w2-inbox-header">
                            <div id="w2ChatHeaderAvatar" style="flex-shrink:0;display:flex;align-items:center;">${avatarHtml}</div>
                            <div id="w2ChatHeaderInfo" style="flex:1;min-width:0;">${infoHtml}</div>
                            <div style="display:flex;gap:4px;flex-shrink:0;align-items:center;">
                                <button type="button" class="w2-inbox-icon-btn" title="Lịch sử mua" data-action="open-history"><i data-lucide="history" style="width:14px;height:14px;"></i></button>
                                <button type="button" class="w2-inbox-icon-btn" title="Thông tin khách" data-action="toggle-info"><i data-lucide="user" style="width:14px;height:14px;"></i></button>
                                <button type="button" class="w2-inbox-icon-btn" title="Đơn liên quan" data-action="open-orders"><i data-lucide="package" style="width:14px;height:14px;"></i></button>
                                <button type="button" class="w2-inbox-icon-btn" data-action="open-pancake" title="Mở đầy đủ trong WEB2 × Pancake"><i data-lucide="external-link" style="width:14px;height:14px;"></i></button>
                                <button onclick="NativeOrdersApp._closeInteractions()" title="Đóng" style="width:30px;height:30px;background:transparent;border:1px solid transparent;font-size:18px;cursor:pointer;color:#94a3b8;line-height:1;border-radius:6px;margin-left:4px;">×</button>
                            </div>
                        </div>
                        <div class="w2-inbox-tabs">
                            <button class="interactions-tab ${tab === 'messages' ? 'is-active' : ''}" data-tab="messages">
                                <i data-lucide="message-circle" style="width:14px;height:14px;"></i> Tin nhắn
                                ${Number(order.messageCount) > 0 ? `<span class="w2-inbox-tab-badge ${tab === 'messages' ? 'is-active' : ''}">${order.messageCount}</span>` : ''}
                            </button>
                            <button class="interactions-tab ${tab === 'comments' ? 'is-active' : ''}" data-tab="comments">
                                <i data-lucide="message-square" style="width:14px;height:14px;"></i> Bình luận
                                ${Number(order.commentCount) > 0 ? `<span class="w2-inbox-tab-badge ${tab === 'comments' ? 'is-active' : ''}">${order.commentCount}</span>` : ''}
                            </button>
                            <div style="flex:1;"></div>
                            ${totalHtml}
                        </div>
                        <div id="interactionsBody" class="w2p-scroll-area" style="flex:1;min-height:0;padding:0;background:#ebebeb;">${
                            tab === 'messages'
                                ? NO._renderMessagesPanel(order)
                                : NO._renderCommentsPanel(order)
                        }</div>
                    </main>
                    <aside class="w2-inbox-right" id="w2InboxRight">
                        ${NO._renderInboxRightPanel(order, 'create')}
                    </aside>
                </div>
            </div>`;

        // Wire tab clicks
        modal.querySelectorAll('.interactions-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                const newTab = btn.dataset.tab;
                if (newTab === NO._interactionsState.tab) return;
                NO._interactionsState.tab = newTab;
                NO._renderInteractionsModal(order, newTab);
            });
        });

        NO._ensureChatModalCss();
        if (window.lucide) lucide.createIcons();

        // Wire header buttons (always present). Phone click uses delegation
        // because the header info DOM is re-built when user switches to a
        // different conversation via _switchChatToCustomer.
        const headerInfo = modal.querySelector('#w2ChatHeaderInfo');
        headerInfo?.addEventListener('click', (e) => {
            const phoneEl = e.target.closest('.w2-chat-phone');
            if (!phoneEl) return;
            const phone = phoneEl.dataset.phone || '';
            if (!phone) return;
            navigator.clipboard?.writeText(phone).then(
                () => NO.notify('Đã copy SĐT: ' + phone, 'success'),
                () => NO.notify('Không copy được', 'error')
            );
        });
        const pancakeBtn = modal.querySelector('[data-action="open-pancake"]');
        pancakeBtn?.addEventListener('click', () => {
            if (!order.fbUserId || !order.fbPageId) {
                NO.notify('Đơn không có Facebook user/page ID', 'warning');
                return;
            }
            const url = `../live-chat/index.html?focusFbUserId=${encodeURIComponent(order.fbUserId)}&focusPageId=${encodeURIComponent(order.fbPageId)}${order.liveCampaignId ? '&focusCampaign=' + encodeURIComponent(order.liveCampaignId) : ''}`;
            window.open(url, '_blank', 'noopener');
        });

        // Wire send + reply button handlers per current tab
        if (tab === 'messages') {
            // Lazy-load conversation thread (async, non-blocking)
            NO._loadAndRenderThread(order);
            // Lazy-load the left sidebar conversation list for this page.
            NO._loadInboxSidebar(order);
            NO._wireQuickReplyTags();
            NO._wireRightPanelTabs(order);
            const sendBtn = modal.querySelector('[data-action="send-message"]');
            sendBtn?.addEventListener('click', () => NO._handleSendMessage(order));
            // Enter to send (Shift+Enter for newline)
            const input = modal.querySelector('#msgInput');
            input?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    NO._handleSendMessage(order);
                }
            });
            // Quick reply: button opens picker, `/shortcut` triggers autocomplete
            const qrBtn = modal.querySelector('[data-action="open-quick-reply"]');
            qrBtn?.addEventListener('click', () => {
                window.Web2QuickReply?.openModal({
                    onSelect: (reply) => {
                        const ta = document.getElementById('msgInput');
                        if (!ta) return;
                        ta.value =
                            (reply.message || '') + (window.Web2QuickReply?.signature() || '');
                        ta.focus();
                    },
                });
            });
            if (input && window.Web2QuickReply?.attachAutocomplete) {
                window.Web2QuickReply.attachAutocomplete(input, {
                    onAutoSend: () => NO._handleSendMessage(order),
                });
            }
            // Toolbar actions
            modal
                .querySelector('[data-action="refresh-thread"]')
                ?.addEventListener('click', () => NO._loadAndRenderThread(order));
            modal.querySelector('[data-action="scroll-bottom"]')?.addEventListener('click', () => {
                const t = document.getElementById('msgThread');
                if (!t) return;
                t.scrollTop = t.scrollHeight;
                const jb = document.getElementById('msgJumpBottom');
                if (jb) jb.style.display = 'none';
                if (NO._chatState) NO._chatState.missedSince = 0;
            });
            modal
                .querySelector('[data-action="insert-signature"]')
                ?.addEventListener('click', () => {
                    const ta = document.getElementById('msgInput');
                    if (!ta) return;
                    const sig = window.Web2QuickReply?.signature?.() || '\nNv. ';
                    const before = ta.value;
                    ta.value = (before + sig).trimStart();
                    ta.focus();
                    ta.setSelectionRange(ta.value.length, ta.value.length);
                });
            // Đính kèm tệp / hình ảnh (gửi qua extension UPLOAD_INBOX_PHOTO → REPLY)
            const fileInput = modal.querySelector('#msgFileInput');
            const imageInput = modal.querySelector('#msgImageInput');
            modal
                .querySelector('[data-action="attach-file"]')
                ?.addEventListener('click', () => fileInput?.click());
            modal
                .querySelector('[data-action="attach-image"]')
                ?.addEventListener('click', () => imageInput?.click());
            fileInput?.addEventListener('change', (e) => {
                if (e.target.files[0]) NO._setPendingAttachment(e.target.files[0]);
            });
            imageInput?.addEventListener('change', (e) => {
                if (e.target.files[0]) NO._setPendingAttachment(e.target.files[0]);
            });
            // Delegate "↩ trả lời" button on bubbles (rendered dynamically)
            modal.addEventListener('click', (e) => {
                const replyBtn = e.target.closest('[data-action="reply-to"]');
                if (replyBtn) {
                    e.stopPropagation();
                    NO._setReplyTarget(replyBtn.dataset.msgId);
                }
            });
            // Escape clears reply target
            input?.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && NO._chatState?.replyTo) {
                    e.preventDefault();
                    NO._setReplyTarget(null);
                }
            });
        } else if (tab === 'comments') {
            // Sidebar shows page-wide conv list regardless of which tab is
            // active — load it here too. Without this the sidebar stayed
            // as the loading skeleton when the user opened comments first.
            NO._loadInboxSidebar(order);
            modal.querySelectorAll('[data-action="reply-comment"]').forEach((btn) => {
                btn.addEventListener('click', () =>
                    NO._handleReplyComment(order, btn.dataset.cid, btn.dataset.input, 'public')
                );
            });
            modal.querySelectorAll('[data-action="private-reply"]').forEach((btn) => {
                btn.addEventListener('click', () =>
                    NO._handleReplyComment(order, btn.dataset.cid, btn.dataset.input, 'private')
                );
            });
            // Ctrl/Cmd+Enter in reply textareas → send (default to public)
            modal.querySelectorAll('textarea[id^="replyCmt-"]').forEach((ta) => {
                ta.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        const cid = ta.parentElement?.querySelector('[data-action="reply-comment"]')
                            ?.dataset?.cid;
                        if (cid) NO._handleReplyComment(order, cid, ta.id, 'public');
                    }
                });
            });
        }
    };

    // ---- n2store-extension bridge: bypass 24h rule via FB Business Suite ----
    // Extension content script (manifest: nhijudyshop.github.io + *.workers.dev)
    // listens on window.postMessage with type matching INBOUND_TYPES, forwards
    // to its service worker which calls Facebook Business GraphQL (REPLY_INBOX_PHOTO,
    // SEND_COMMENT, SEND_PRIVATE_REPLY). FB Business rules differ from Pancake's
    // 24h policy — extension can send outside the standard window.
    NO._extensionReady = false;

    NO._extensionVersion = null;

    window.addEventListener('message', (e) => {
        const m = e.data;
        if (!m || typeof m !== 'object') return;
        if (m.type === 'EXTENSION_LOADED' || m.type === 'EXTENSION_VERSION') {
            NO._extensionReady = true;
            NO._extensionVersion = m.version || m.payload?.version || 'unknown';
            console.log('[NativeOrders] n2store-extension ready v' + NO._extensionVersion);
        }
    });

    NO._hasExtension = function _hasExtension() {
        return NO._extensionReady;
    };

    /**
     * Send a request to the extension via window.postMessage bridge.
     * @param {string} type  — e.g. 'REPLY_INBOX_PHOTO', 'SEND_COMMENT', 'SEND_PRIVATE_REPLY'
     * @param {object} data  — payload (pageId, globalUserId, message, ...)
     * @param {number} timeoutMs
     * @returns {Promise<{ok:boolean, data?, error?}>}
     */
    NO._extensionRequest = function _extensionRequest(type, data, timeoutMs = 30000) {
        return new Promise((resolve) => {
            const taskId = `nw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const SUCCESS = type + '_SUCCESS';
            const FAILURE = type + '_FAILURE';
            let done = false;
            const onMsg = (e) => {
                const m = e.data;
                if (!m || typeof m !== 'object') return;
                if (m.taskId && m.taskId !== taskId) return;
                if (m.type === SUCCESS) {
                    done = true;
                    window.removeEventListener('message', onMsg);
                    resolve({ ok: true, data: m });
                } else if (m.type === FAILURE) {
                    done = true;
                    window.removeEventListener('message', onMsg);
                    resolve({ ok: false, error: m.error || 'Extension reported failure' });
                }
            };
            window.addEventListener('message', onMsg);
            window.postMessage({ ...data, type, taskId }, '*');
            setTimeout(() => {
                if (!done) {
                    window.removeEventListener('message', onMsg);
                    resolve({ ok: false, error: 'Extension timeout' });
                }
            }, timeoutMs);
        });
    };

    // ─── INBOX SIDEBAR + RIGHT PANEL (Pancake-style 3-col layout) ───
    //
    // The chat modal is now a full inbox shell: left column lists every
    // conversation for the order's page (real-time via WS), centre column
    // hosts the existing chat thread, right column holds customer info +
    // a Pancake-style create-order form. See
    // `docs/plans/native-orders-pancake-inbox.md` for the phased spec
    // mapped from the live Pancake admin inbox DOM.

    NO._renderInboxSidebarShell = function _renderInboxSidebarShell() {
        return `
            <div class="w2-inbox-sb-head">
                <div class="w2-inbox-sb-search">
                    <i data-lucide="search" style="width:13px;height:13px;color:#94a3b8;"></i>
                    <input type="text" id="w2InboxSearch" placeholder="Tìm kiếm" autocomplete="off" />
                </div>
                <div class="w2-inbox-sb-filter-wrap">
                    <button class="w2-inbox-sb-filter" type="button" id="w2InboxFilterBtn" title="Bộ lọc">
                        <i data-lucide="sliders-horizontal" style="width:12px;height:12px;"></i>
                        <span id="w2InboxFilterLabel">Lọc theo</span>
                        <span class="w2-inbox-sb-filter-count" id="w2InboxFilterCount" hidden></span>
                    </button>
                    <div class="w2-inbox-sb-filter-menu w2-fm-pancake" id="w2InboxFilterMenu" hidden>
                        <div class="w2-fm-col w2-fm-col-cats">
                            <div class="w2-fm-section">Thẻ hội thoại</div>
                            <button type="button" class="w2-fm-cat" data-cat="include-tags">
                                <i data-lucide="tag" style="width:13px;height:13px;color:#0068ff;"></i>
                                <span class="w2-fm-cat-label">Có chứa thẻ</span>
                                <span class="w2-fm-cat-count" data-for="include-tags"></span>
                                <i data-lucide="chevron-right" style="width:13px;height:13px;color:#94a3b8;"></i>
                            </button>
                            <button type="button" class="w2-fm-cat" data-cat="exclude-tags">
                                <i data-lucide="tag" style="width:13px;height:13px;color:#94a3b8;"></i>
                                <span class="w2-fm-cat-label">Loại trừ thẻ</span>
                                <span class="w2-fm-cat-count" data-for="exclude-tags"></span>
                                <i data-lucide="chevron-right" style="width:13px;height:13px;color:#94a3b8;"></i>
                            </button>
                            <div class="w2-fm-divider"></div>
                            <div class="w2-fm-section">Điều kiện</div>
                            <button type="button" class="w2-fm-cat" data-cat="conditions">
                                <i data-lucide="puzzle" style="width:13px;height:13px;color:#0068ff;"></i>
                                <span class="w2-fm-cat-label">Điều kiện</span>
                                <span class="w2-fm-cat-count" data-for="conditions"></span>
                                <i data-lucide="chevron-right" style="width:13px;height:13px;color:#94a3b8;"></i>
                            </button>
                            <div class="w2-fm-divider"></div>
                            <button type="button" class="w2-fm-reset" id="w2InboxFilterReset">
                                <i data-lucide="rotate-ccw" style="width:12px;height:12px;"></i> Xoá bộ lọc
                            </button>
                        </div>
                        <div class="w2-fm-col w2-fm-col-sub" id="w2InboxFilterSub"></div>
                    </div>
                </div>
            </div>
            <div class="w2-inbox-sb-list" id="w2InboxConvList">
                <div class="w2-inbox-sb-empty">
                    <div class="w2-chat-skeleton-bubble" style="height:60px;border-radius:8px;margin:4px 8px;"></div>
                    <div class="w2-chat-skeleton-bubble" style="height:60px;border-radius:8px;margin:4px 8px;"></div>
                    <div class="w2-chat-skeleton-bubble" style="height:60px;border-radius:8px;margin:4px 8px;"></div>
                    <div class="w2-chat-skeleton-bubble" style="height:60px;border-radius:8px;margin:4px 8px;"></div>
                </div>
            </div>`;
    };

    NO._renderInboxRightPanel = function _renderInboxRightPanel(order, _defaultTab = 'info') {
        // Right panel shows customer + current-order context only.
        // Order creation lives in web 2.0's web2-pancake page — not
        // re-implemented here per user direction.
        return `
            <div class="w2-inbox-right-tabs">
                <button class="w2-inbox-right-tab is-active" data-rtab="info">Thông tin</button>
            </div>
            <div class="w2-inbox-right-body" id="w2InboxRightBody">
                ${NO._renderInfoTab(order)}
            </div>`;
    };

    NO._renderInfoTab = function _renderInfoTab(order) {
        const phone = order.phone || '';
        const initial = (order.customerName || order.fbUserName || '?')
            .trim()
            .charAt(0)
            .toUpperCase();
        // Use the Pancake avatar proxy when we have both fb_user_id + fb_page_id;
        // the <img onerror> swap falls back to the gradient+initial placeholder.
        // The onerror string lives inside double-quoted attribute, so the inner
        // class attribute uses &quot; (matches header avatar's escape pattern).
        const safeInitial = NO.escapeHtml(initial).replace(/'/g, '&#39;');
        const avatarFallback = `<div class="w2-customer-card-avatar">${safeInitial}</div>`;
        const avatarHtml =
            order.fbUserId && order.fbPageId
                ? `<img class="w2-customer-card-avatar" src="${NO.escapeHtml(NO._avatarUrl(order.fbUserId, order.fbPageId))}" alt="${NO.escapeHtml(order.customerName || order.fbUserName || '?')}" style="object-fit:cover;" loading="lazy" onerror="this.outerHTML='<div class=&quot;w2-customer-card-avatar&quot;>${safeInitial}</div>'" />`
                : avatarFallback;
        return `
            <div class="w2-section">
                <div class="w2-section-title-row">
                    <span class="w2-section-title"><i data-lucide="user" style="width:13px;height:13px;"></i> Khách hàng</span>
                    <div style="display:flex;gap:4px;">
                        <button class="w2-inbox-icon-btn" title="Sửa khách"><i data-lucide="pen" style="width:12px;height:12px;"></i></button>
                    </div>
                </div>
                <div class="w2-form-row w2-form-row-2col">
                    <input class="w2-input" type="text" placeholder="Tên khách" value="${NO.escapeHtml(order.customerName || order.fbUserName || '')}" readonly />
                    <input class="w2-input" type="text" placeholder="SĐT" value="${NO.escapeHtml(phone)}" readonly />
                </div>
                <input class="w2-input" type="text" placeholder="Địa chỉ" value="${NO.escapeHtml(order.address || '')}" readonly />
                <div class="w2-customer-card">
                    ${avatarHtml}
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:12px;color:#0f172a;">${NO.escapeHtml(order.customerName || order.fbUserName || '—')}</div>
                        <div style="font-size:11px;color:#64748b;">${NO.escapeHtml(phone || '—')} ${phone ? '<span style="background:#fef3c7;color:#92400e;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;margin-left:3px;">Mobifone</span>' : ''}</div>
                    </div>
                </div>
            </div>

            <div class="w2-section">
                <div class="w2-section-title"><i data-lucide="receipt" style="width:13px;height:13px;"></i> Đơn hiện tại</div>
                <div class="w2-info-row"><span class="w2-info-label">Mã đơn</span><span class="w2-info-val"><strong>${NO.escapeHtml(order.code)}</strong></span></div>
                <div class="w2-info-row"><span class="w2-info-label">Trạng thái</span><span class="w2-info-val">${NO.escapeHtml(order.status || '—')}</span></div>
                <div class="w2-info-row"><span class="w2-info-label">Tổng tiền</span><span class="w2-info-val"><strong style="color:#15803d;">${(Number(order.amountTotal || order.total) || 0).toLocaleString('vi-VN')}đ</strong></span></div>
                <div class="w2-info-row"><span class="w2-info-label">Tags</span><span class="w2-info-val">${(order.tags || []).map((t) => `<span style="background:#f0fdf4;color:#166534;font-size:10px;font-weight:600;padding:1px 7px;border-radius:999px;border:1px solid #bbf7d0;margin-right:3px;">${NO.escapeHtml(t)}</span>`).join('') || '—'}</span></div>
            </div>

            <div class="w2-section">
                <div class="w2-section-title"><i data-lucide="sticky-note" style="width:13px;height:13px;"></i> Ghi chú nội bộ</div>
                <textarea class="w2-info-note" placeholder="Thêm ghi chú..." rows="3">${NO.escapeHtml(order.note || '')}</textarea>
            </div>

            <div class="w2-section">
                <div class="w2-section-title"><i data-lucide="history" style="width:13px;height:13px;"></i> Lịch sử đơn</div>
                <div id="w2PastOrdersList" style="font-size:12px;color:#94a3b8;text-align:center;padding:14px 0;">
                    (chưa kết nối — sẽ load đơn cũ của SĐT này)
                </div>
            </div>`;
    };

    /**
     * Quick-reply colour-coded tag chips rendered just above the input.
     * Tags come from the user's saved set (Pancake stores them in localStorage
     * keyed by page_id; for now we read whatever Web 1.0 wrote there. The
     * Phase 4 work is to manage these via the settings page).
     */
    NO.W2_DEFAULT_QUICK_TAGS = [
        {
            label: 'NV My KH đặt',
            tpl: 'Dạ shop xác nhận đơn của mình ạ. Nv.My',
            color: 'rgba(33, 68, 247, 0.4)',
        },
        {
            label: 'NV My CK + Gấp',
            tpl: 'Dạ ck giúp shop để gửi gấp nha ạ. Nv.My',
            color: 'rgba(33, 68, 247, 0.4)',
        },
        {
            label: 'NHẮC KHÁCH',
            tpl: 'Dạ mình nhắc nhẹ khách iu ơi 💕',
            color: 'rgba(241, 71, 255, 0.4)',
        },
        {
            label: 'XIN ĐỊA CHỈ',
            tpl: 'Dạ chị iu xác nhận giúp e địa chỉ + sđt nha ạ 🌷',
            color: 'rgba(18, 101, 10, 0.4)',
        },
        { label: 'NV . BO', tpl: '', color: 'rgba(10, 241, 238, 0.4)' },
        { label: 'NJD ƠI', tpl: '', color: 'rgba(146, 84, 222, 0.4)' },
        { label: 'NV. Lài', tpl: '', color: 'rgba(244, 241, 24, 0.4)' },
        { label: 'NV. Hạnh 🌷', tpl: '', color: 'rgba(75, 147, 68, 0.4)' },
        { label: 'Nv.Huyền 🐣', tpl: '', color: 'rgba(247, 200, 33, 0.4)' },
        { label: 'Nv. Duyên', tpl: '', color: 'rgba(33, 200, 247, 0.4)' },
        { label: 'XỬ LÝ BC', tpl: '', color: 'rgba(244, 80, 24, 0.4)' },
        { label: 'BOOM', tpl: '', color: 'rgba(247, 33, 33, 0.4)' },
        { label: 'CHECK IB', tpl: '', color: 'rgba(140, 84, 33, 0.4)' },
        { label: 'Nv My', tpl: 'Nv.My', color: 'rgba(33, 68, 247, 0.4)' },
    ];

    NO._loadQuickTags = function _loadQuickTags() {
        try {
            const raw = localStorage.getItem('w2_quick_reply_tags');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length) return parsed;
            }
        } catch {
            /* ignore */
        }
        return NO.W2_DEFAULT_QUICK_TAGS;
    };

    NO._renderQuickReplyTags = function _renderQuickReplyTags() {
        const tags = NO._loadQuickTags();
        return `<div class="w2-quick-reply-row">
            ${tags
                .map(
                    (t) =>
                        `<button class="w2-quick-tag" data-tpl="${NO.escapeHtml(t.tpl || t.label)}" style="background:${t.color};">${NO.escapeHtml(t.label)}</button>`
                )
                .join('')}
        </div>`;
    };

    /**
     * Bind clicks on the quick-reply tag chips so a single click pastes the
     * template + employee signature into #msgInput and focuses it.
     */
    NO._wireQuickReplyTags = function _wireQuickReplyTags() {
        document.querySelectorAll('.w2-quick-tag').forEach((btn) => {
            btn.addEventListener('click', () => {
                const ta = document.getElementById('msgInput');
                if (!ta) return;
                const tpl = btn.getAttribute('data-tpl') || '';
                const sig = window.Web2QuickReply?.signature?.() || '';
                ta.value = (tpl + (tpl.endsWith(sig) || !sig ? '' : '\n' + sig)).trim();
                ta.focus();
                // Cursor at end so the user can edit
                ta.selectionStart = ta.selectionEnd = ta.value.length;
            });
        });
    };

    /**
     * Right column currently only has a single rendered tab (Thông tin);
     * the Tạo đơn slot is an external link to web 2.0's order-creation
     * page since web 2.0 already owns that flow. Kept the helper so a
     * future "Lịch sử" or "Ghi chú dài" tab can drop in easily.
     */
    NO._wireRightPanelTabs = function _wireRightPanelTabs(_order) {
        // No-op for now. The Thông tin tab is rendered by default and the
        // Tạo đơn link is a plain <a target=_blank>.
    };

    NO._renderMessagesPanel = function _renderMessagesPanel(order) {
        // 2026-06-07: chat UI hợp nhất qua Web2ChatPanel. `#msgThread` giờ là HOST
        // mount của component (header tắt — native-orders đã có header riêng). Loading/
        // error/prompt-chọn-hội-thoại vẫn ghi vào #msgThread.innerHTML TRƯỚC khi mount;
        // _loadAndRenderThread mount panel (messages + input + quick + emoji + reply +
        // attach) khi resolve được hội thoại. Đơn inbox tay chưa bind fb → prompt chọn
        // hội thoại từ sidebar trái (_switchChatToCustomer bind page+psid khi click).
        return `<div id="msgThread" style="height:100%;min-height:0;display:flex;flex-direction:column;background:#ebebeb;">
                <div style="color:#94a3b8;font-style:italic;text-align:center;padding:60px 0;">
                    <i data-lucide="loader" style="width:24px;height:24px;display:block;margin:0 auto 10px;animation:spin 1s linear infinite;"></i>
                    Đang tải hội thoại…
                </div>
            </div>`;
    };

    NO._renderCommentsPanel = function _renderCommentsPanel(order) {
        const ids = Array.isArray(order.commentIds) ? order.commentIds : [];
        if (ids.length === 0) {
            return `<div style="color:#94a3b8;font-style:italic;padding:24px 0;text-align:center;">
                <i data-lucide="message-square-off" style="width:32px;height:32px;display:block;margin:0 auto 8px;color:#cbd5e1;"></i>
                Chưa có bình luận nào trong đơn.
            </div>`;
        }
        // Parse comment lines from `note` (each merge appends "[timestamp] message")
        const noteLines = order.note
            ? order.note
                  .split('---')
                  .map((s) => s.trim())
                  .filter(Boolean)
            : [];
        const pancakeUrl = (commentId) =>
            `../live-chat/index.html?focusCommentId=${encodeURIComponent(commentId)}${order.fbPageId ? '&focusPageId=' + encodeURIComponent(order.fbPageId) : ''}`;
        const fbPermalink = (commentId) => {
            const postId = order.fbPostId || '';
            const postShort = postId.includes('_') ? postId.split('_').pop() : postId;
            const cmtShort = String(commentId).includes('_')
                ? String(commentId).split('_').pop()
                : commentId;
            if (postShort && cmtShort) {
                return `https://www.facebook.com/${order.fbPageId || ''}/posts/${postShort}?comment_id=${cmtShort}`;
            }
            return `https://www.facebook.com/${commentId}`;
        };
        const canReply = !!order.fbPageId;
        return `
            <div style="display:flex;flex-direction:column;gap:10px;">
                ${ids
                    .map((cid, i) => {
                        const noteLine = noteLines[i] || '';
                        const replyInputId = `replyCmt-${i}`;
                        return `
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;">
                        <code style="font-size:11px;color:#6b7280;font-family:'JetBrains Mono',Menlo,monospace;">#${NO.escapeHtml(String(cid).slice(-16))}</code>
                        <div style="display:inline-flex;gap:6px;">
                            <a href="${fbPermalink(cid)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#3b82f6;text-decoration:none;padding:4px 8px;border:1px solid #dbeafe;border-radius:4px;">
                                <i data-lucide="facebook" style="width:11px;height:11px;"></i> Facebook
                            </a>
                            <a href="${pancakeUrl(cid)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#0068ff;text-decoration:none;padding:4px 8px;border:1px solid #e8f2ff;border-radius:4px;">
                                <i data-lucide="external-link" style="width:11px;height:11px;"></i> WEB2 Pancake
                            </a>
                        </div>
                    </div>
                    ${
                        noteLine
                            ? `<div style="font-size:13px;color:#334155;line-height:1.5;white-space:pre-wrap;margin-bottom:8px;">${NO.escapeHtml(noteLine)}</div>`
                            : '<div style="font-size:11px;color:#94a3b8;font-style:italic;margin-bottom:8px;">(chưa có nội dung trong note)</div>'
                    }
                    ${
                        canReply
                            ? `<div class="reply-row" style="display:flex;gap:6px;align-items:flex-end;border-top:1px dashed #e5e7eb;padding-top:8px;">
                        <textarea id="${replyInputId}" rows="1" placeholder="Trả lời bình luận này…" style="flex:1;padding:6px 10px;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;font-family:inherit;resize:vertical;min-height:28px;max-height:120px;"></textarea>
                        <button class="web2-btn web2-btn-success web2-btn-xs" data-action="reply-comment" data-cid="${NO.escapeHtml(cid)}" data-input="${replyInputId}" title="Trả lời công khai (action=reply_comment)">
                            <i data-lucide="reply" style="width:11px;height:11px;"></i>
                        </button>
                        <button class="web2-btn web2-btn-primary web2-btn-xs" data-action="private-reply" data-cid="${NO.escapeHtml(cid)}" data-input="${replyInputId}" title="Trả lời riêng (DM khách qua Messenger)">
                            <i data-lucide="send" style="width:11px;height:11px;"></i>
                        </button>
                    </div>`
                            : ''
                    }
                </div>`;
                    })
                    .join('')}
                ${canReply ? '' : '<div style="background:#fef3c7;color:#92400e;font-size:11px;padding:8px 12px;border-radius:4px;">⚠ Đơn không có fb_page_id → không thể trả lời. Mở trong WEB2 × Pancake.</div>'}
            </div>`;
    };

    NO._closeInteractions = function _closeInteractions() {
        const modal = document.getElementById('orderInteractionsModal');
        if (modal) modal.style.display = 'none';
        NO._interactionsState = null;
        NO._teardownChatState();
    };

    // Hook for realtime refresh — called from WS event handler
    NO._refreshInteractionsIfOpen = function _refreshInteractionsIfOpen(updatedOrder) {
        if (!NO._interactionsState || NO._interactionsState.code !== updatedOrder.code) return;
        // Web2CustomerChat (viaCustomerChat) tự lo realtime qua Web2ChatPanel → KHÔNG
        // re-render modal cũ (sẽ tạo modal ẩn xung đột). Chỉ refresh khi đang dùng modal cũ.
        if (NO._interactionsState.viaCustomerChat) return;
        // Merge updated fields into the live STATE entry (broadcast may carry newer data)
        const idx = NO.STATE.orders.findIndex((o) => o.code === updatedOrder.code);
        if (idx !== -1) NO.STATE.orders[idx] = { ...NO.STATE.orders[idx], ...updatedOrder };
        NO._renderInteractionsModal(
            NO.STATE.orders[idx] || updatedOrder,
            NO._interactionsState.tab
        );
    };
})();
