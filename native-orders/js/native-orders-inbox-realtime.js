// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — sidebar poll/WS merge + switch-to-customer. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    /**
     * Sidebar real-time: when a new message lands in any conversation on
     * this page, find the matching `.w2-inbox-conv` row, refresh its
     * preview/time, bump it to the top, and increment the unread badge
     * (unless that conversation is the one currently open in the chat
     * panel — that one is being read live so it stays read).
     */
    NO._sidebarWsSub = null;

    NO._sidebarPollTimer = null;

    NO._sidebarPollOrder = null;
    // kept so we can resume polling if WS drops
    NO._SIDEBAR_POLL_MS = 12_000;

    NO._SIDEBAR_POLL_CHECK_MS = 5_000;

    /**
     * Polling vs realtime philosophy:
     *   • Render broker keeps a WS to pancake.vn and forwards
     *     `pages:update_conversation` (reliable) + `pages:new_message`
     *     (when FB socket creds available).
     *   • When `Web2Realtime.isConnected()` is true the sidebar is fed
     *     LIVE from those events — `_handleSidebarWsEvent` already
     *     bumps rows, marks unread, prepends new conv rows. Running a
     *     12s poll on top of that is wasted bandwidth + Pancake quota.
     *   • Polling becomes useful ONLY when WS is down (broker
     *     restarting, network blip, etc.). We monitor connection
     *     state every 5s and flip polling on/off accordingly.
     *
     * Net result: in the steady-state happy path zero polls fire —
     * pure realtime. The poll loop self-activates only as fallback.
     */
    NO._startSidebarPoll = function _startSidebarPoll(order) {
        if (NO._sidebarPollTimer) clearInterval(NO._sidebarPollTimer);
        if (!order?.fbPageId || !window.Web2Chat?.fetchConversationsByPage) return;
        NO._sidebarPollOrder = order;
        // Watchdog: every 5s, decide whether to poll now. If WS is up
        // OR Web2Realtime hasn't loaded, skip (event-driven). If WS
        // dropped, fire a single poll to keep the sidebar fresh.
        // Tracks last-poll timestamp so even when WS bounces we don't
        // hammer the API faster than _SIDEBAR_POLL_MS.
        let lastPollAt = 0;
        NO._sidebarPollTimer = setInterval(() => {
            const list = document.getElementById('w2InboxConvList');
            if (!list) return; // modal closed (teardown clears interval anyway)
            const wsUp = !!window.Web2Realtime?.isConnected?.();
            if (wsUp) return; // realtime is feeding the sidebar — no poll needed
            const now = Date.now();
            if (now - lastPollAt < NO._SIDEBAR_POLL_MS) return; // throttle fallback polls
            lastPollAt = now;
            console.log('[NativeOrders] WS down → fallback poll');
            NO._pollSidebarOnce(NO._sidebarPollOrder);
        }, NO._SIDEBAR_POLL_CHECK_MS);
    };

    NO._pollSidebarOnce = async function _pollSidebarOnce(order) {
        const list = document.getElementById('w2InboxConvList');
        if (!list) return; // modal closed → next interval no-ops (cleared in _teardownChatState)
        try {
            // Same multi-page coverage as _loadInboxSidebar — without
            // this the fallback poll would shrink the sidebar back to
            // a single page whenever WS drops.
            const pageIds = NO._getSidebarPageIds(order);
            const res = await NO._fetchConvsMerged(pageIds, 50);
            if (!res.ok || !res.conversations?.length) return;
            NO._mergeSidebarConvs(res.conversations, order);
        } catch (e) {
            console.warn('[NativeOrders] sidebar poll failed:', e.message);
        }
    };

    /**
     * Merge a fresh conversation list into the existing sidebar DOM:
     *   - update preview + time on existing rows
     *   - mark `.is-unread` (+ spawn badge) when last_message changed
     *     AND the row isn't the conversation currently open
     *   - render brand-new conversation rows + bind their click handler
     *   - reorder to match server order via documentFragment append
     *     (existing DOM nodes are MOVED, not recreated — scroll +
     *     hover survive)
     */
    NO._mergeSidebarConvs = function _mergeSidebarConvs(serverConvs, order) {
        const list = document.getElementById('w2InboxConvList');
        if (!list) return;
        const existing = new Map();
        list.querySelectorAll('.w2-inbox-conv').forEach((el) => {
            const key = el.dataset.convId || el.dataset.fbId;
            if (key) existing.set(key, el);
        });

        const orderedRows = [];
        for (const c of serverConvs) {
            const convId = String(c.id || '');
            const cust = c.customers?.[0] || c.from || {};
            const fbId = String(cust.fb_id || cust.id || c.from_customer_id || '');
            const key = convId || fbId;
            if (!key) continue;
            let row = existing.get(key);
            const newPreview =
                (c.last_message?.message || c.last_message_text || c.snippet || '').slice(0, 120) ||
                '(không có nội dung)';
            const newTime = NO._fmtVnTime(c.updated_at || c.last_sent_at || c.inserted_at);
            const isOpenConv = NO._chatState?.convId && String(NO._chatState.convId) === convId;

            if (row) {
                const previewEl = row.querySelector('.w2-inbox-conv-preview');
                const timeEl = row.querySelector('.w2-inbox-conv-time');
                const oldPreview = previewEl?.textContent || '';
                if (oldPreview !== newPreview) {
                    if (previewEl) previewEl.textContent = newPreview;
                    if (!isOpenConv) {
                        row.classList.add('is-unread');
                        if (!row.querySelector('.w2-inbox-conv-badge')) {
                            const dot = document.createElement('span');
                            dot.className = 'w2-inbox-conv-badge';
                            dot.title = 'Tin nhắn mới';
                            row.appendChild(dot);
                        }
                    }
                }
                if (timeEl && timeEl.textContent !== newTime) timeEl.textContent = newTime;
            } else {
                const tmp = document.createElement('div');
                tmp.innerHTML = NO._convRowHtml(c, order);
                row = tmp.firstElementChild;
                row?.addEventListener('click', () => {
                    const customerId = row.dataset.fbId;
                    const cName = row.dataset.cName;
                    if (!customerId) return;
                    NO._switchChatToCustomer(order, customerId, cName);
                    row.classList.remove('is-unread');
                    row.querySelector('.w2-inbox-conv-badge')?.remove();
                });
            }
            if (row) orderedRows.push(row);
        }

        // DocumentFragment.appendChild moves existing nodes — no rebuild.
        const frag = document.createDocumentFragment();
        for (const r of orderedRows) frag.appendChild(r);
        list.appendChild(frag);
        // Re-apply filter so newly-arrived rows respect the user's choice.
        NO._applySidebarFilter();
    };

    NO._wireSidebarRealtime = function _wireSidebarRealtime(order) {
        if (NO._sidebarWsSub?.unsubscribe) {
            try {
                NO._sidebarWsSub.unsubscribe();
            } catch {
                /* ignore */
            }
        }
        // Polling backstop — self-deactivates while WS is connected
        // (see _startSidebarPoll's watchdog). When WS drops it kicks
        // in automatically; when WS recovers it goes quiet again.
        NO._startSidebarPoll(order);

        if (!window.Web2Realtime?.subscribe) {
            console.warn('[NativeOrders] Web2Realtime not loaded → polling-only');
            return;
        }
        NO._sidebarWsSub = window.Web2Realtime.subscribe({
            types: ['pages:new_message', 'pages:update_conversation'],
            onEvent: (evt) => NO._handleSidebarWsEvent(evt, order),
            debounceMs: 80,
        });
        // Multi-account pool: push every Pancake account the browser
        // knows about (from localStorage `pancake_all_accounts`) so the
        // Render broker can spawn one WS per account, covering ALL
        // pages instead of just the 1 page a single account can reach.
        // Broker deduplicates pages and persists creds in
        // `realtime_accounts` for auto-reconnect after restarts.
        if (window.Web2Realtime?.startMulti) {
            window.Web2Realtime.startMulti()
                .then((r) => {
                    if (!r.ok) {
                        console.warn('[NativeOrders] Web2Realtime.startMulti →', r.reason);
                        // Fallback to single-account start with all PATs
                        const known = Object.keys(
                            window.Web2Chat?.getAllPageAccessTokens?.() || {}
                        );
                        const all = Array.from(
                            new Set([order.fbPageId, ...known].filter(Boolean).map(String))
                        );
                        if (all.length) window.Web2Realtime.start({ pageIds: all });
                    } else {
                        console.log(
                            `[NativeOrders] ✓ pool: ${r.poolSize} account(s), ${r.totalPages} page(s)`,
                            r.plan
                        );
                    }
                })
                .catch((e) => console.warn('[NativeOrders] startMulti err:', e.message));
        }
    };

    NO._handleSidebarWsEvent = function _handleSidebarWsEvent(evt, order) {
        const list = document.getElementById('w2InboxConvList');
        if (!list) return;
        // The broker forwards two distinct payload shapes:
        //   pages:new_message        → payload.message = { conversation_id, from, message, ... }
        //   pages:update_conversation → payload.conversation = { id, from, last_message, customers, ... }
        //                              + payload.page_id
        // Normalise to a single "msg-like" object so the rest of this
        // handler doesn't have to care which event fired.
        const conv = evt.payload?.conversation;
        const m =
            evt.payload?.message ||
            (conv
                ? {
                      conversation_id: conv.id,
                      from: conv.from || conv.last_message?.from,
                      page_id: evt.payload?.page_id,
                      message: conv.last_message?.message || conv.snippet || conv.last_message_text,
                      inserted_at:
                          conv.last_sent_at || conv.last_message?.inserted_at || conv.updated_at,
                      customer: conv.customers?.[0],
                      to: conv.customers?.[0] ? { id: conv.customers[0].fb_id } : undefined,
                  }
                : evt.payload || {});
        const convId = String(m.conversation_id || m.conversationId || conv?.id || '');
        const pageId = String(m.page_id || evt.payload?.page_id || order.fbPageId || '');
        // Visible breadcrumb so the browser console makes it obvious that
        // the realtime path is alive when a customer event lands.
        console.log(
            `[NativeOrders][RT] ${evt.type} conv=${convId.slice(-12)} page=${pageId.slice(-6)}`
        );
        // For incoming, `from.id` is the customer's PSID. For outgoing
        // (admin staff replying), `from.id` equals the page id.
        const fromId = String(m.from?.id || '');
        const isOutgoing =
            !!(m.from_admin || m.is_admin || m.from?.admin_id) ||
            (fromId && pageId && fromId === pageId);
        // Customer PSID for the row key (sender for incoming, recipient
        // for outgoing → fall back to to-field if available).
        const fbId = isOutgoing
            ? String(m.to?.id || m.customer?.fb_id || m.customer?.id || '')
            : fromId;
        const lastText = (m.message || m.text || m.snippet || '').slice(0, 120) || '(media)';
        const time = NO._fmtVnTime(m.inserted_at || m.created_time || m.timestamp || Date.now());

        // Find row by convId first, else by fbId
        let row =
            (convId &&
                list.querySelector(`.w2-inbox-conv[data-conv-id="${CSS.escape(convId)}"]`)) ||
            (fbId && list.querySelector(`.w2-inbox-conv[data-fb-id="${CSS.escape(fbId)}"]`));

        const isCurrentlyOpen = NO._chatState?.convId && String(NO._chatState.convId) === convId;

        if (row) {
            // Update preview + time
            const preview = row.querySelector('.w2-inbox-conv-preview');
            const timeEl = row.querySelector('.w2-inbox-conv-time');
            if (preview) preview.textContent = lastText;
            if (timeEl) timeEl.textContent = time;
            // Mark unread for incoming messages on conversations NOT
            // currently being viewed
            if (!isOutgoing && !isCurrentlyOpen) {
                row.classList.add('is-unread');
                if (!row.querySelector('.w2-inbox-conv-badge')) {
                    const dot = document.createElement('span');
                    dot.className = 'w2-inbox-conv-badge';
                    dot.title = 'Tin nhắn mới';
                    row.appendChild(dot);
                }
            }
            // Bump to top of list
            if (list.firstChild !== row) list.prepend(row);
        } else if (fbId) {
            // First-time-seen conversation — prepend a minimal row.
            // Use the event's page_id (sidebar is now multi-page so a
            // new Store conv must NOT inherit the modal-opener's House
            // page_id, otherwise avatar URL + filter mismatch).
            const synthetic = {
                id: convId,
                customers: [{ fb_id: fbId, name: m.from?.name || 'Khách' }],
                from: m.from,
                last_message: { message: lastText },
                updated_at: m.inserted_at || Date.now(),
                page_id: pageId || order.fbPageId,
                unread_count: isOutgoing ? 0 : 1,
            };
            const tmp = document.createElement('div');
            tmp.innerHTML = NO._convRowHtml(synthetic, order);
            const newRow = tmp.firstElementChild;
            if (newRow) {
                newRow.addEventListener('click', () => {
                    const customerId = newRow.dataset.fbId;
                    const cName = newRow.dataset.cName;
                    const rowPage = newRow.dataset.pageId || '';
                    if (!customerId) return;
                    NO._switchChatToCustomer(order, customerId, cName, rowPage);
                    newRow.classList.remove('is-unread');
                    newRow.querySelector('.w2-inbox-conv-badge')?.remove();
                });
                list.prepend(newRow);
            }
        }
    };

    /**
     * When user clicks a sidebar row, swap the chat to that conversation.
     * Keeps the modal + sidebar mounted. We synthesise an order-shaped
     * object so the existing render path can reuse — when the clicked row
     * is a different customer, we clear order-specific fields (code,
     * phone, tags, totals) because we don't have an order for them, and
     * re-skin the header + right-panel in place. Same customer click is
     * treated as a "refresh thread" no-rebuild.
     */
    NO._switchChatToCustomer = async function _switchChatToCustomer(
        originalOrder,
        fbId,
        customerName,
        clickedPageId
    ) {
        const isSameCustomer = String(originalOrder.fbUserId || '') === String(fbId);
        // Cross-page click: sidebar is multi-page, so a customer row may
        // belong to a different page than the order's. Honour the row's
        // own page so the chat panel fetches messages from the right
        // place (Pancake `/api/v1/pages/{pageId}/...`).
        const effectivePageId = clickedPageId || originalOrder.fbPageId || '';
        const synthetic = isSameCustomer
            ? { ...originalOrder, fbPageId: effectivePageId || originalOrder.fbPageId }
            : {
                  ...originalOrder,
                  fbUserId: fbId,
                  fbPageId: effectivePageId,
                  customerName: customerName || '',
                  fbUserName: customerName || '',
                  // Different customer — clear order-bound context so the
                  // header/right-panel reflect "khách lẻ, chưa có đơn"
                  // instead of misleadingly showing the original order.
                  phone: '',
                  code: '',
                  amountTotal: 0,
                  total: 0,
                  status: '',
                  tags: [],
                  address: '',
                  note: '',
                  messageCount: 0,
                  commentCount: 0,
              };
        // Highlight clicked row
        document
            .querySelectorAll('.w2-inbox-conv')
            .forEach((r) => r.classList.toggle('is-active', r.dataset.fbId === fbId));
        // If user clicked a conv while on the Bình luận tab, jump back to
        // Tin nhắn — comments are tied to the original order's post, not
        // page-wide per customer, so loading the conv's messages is the
        // sensible action. _renderInteractionsModal re-renders the body
        // and re-calls _loadAndRenderThread for us; bail out early to
        // avoid double-loading.
        if (NO._interactionsState && NO._interactionsState.tab !== 'messages') {
            NO._interactionsState.tab = 'messages';
            NO._renderInteractionsModal(synthetic, 'messages');
            return;
        }
        // Update middle chat header to match the clicked customer.
        NO._applyChatHeaderForOrder(synthetic);
        // Update right panel info — only when actually switching customers.
        if (!isSameCustomer) {
            const rightBody = document.getElementById('w2InboxRightBody');
            if (rightBody) {
                rightBody.innerHTML = NO._renderInfoTab(synthetic);
                if (window.lucide?.createIcons) window.lucide.createIcons();
            }
            // Strip tab badges (Tin nhắn/Bình luận count) — they belong
            // to the original order and don't apply to a different customer.
            document
                .querySelectorAll('#orderInteractionsModal .interactions-tab .w2-inbox-tab-badge')
                .forEach((el) => el.remove());
        }
        // Re-render the message panel by re-calling load
        await NO._loadAndRenderThread(synthetic);
    };
})();
