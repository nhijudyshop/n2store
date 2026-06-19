// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — chat panel mount/adapter + native send + attachments + thread state/ws + loadAndRenderThread. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // -----------------------------------------------------
    // Chat thread state + rendering helpers (shared by initial
    // load, scroll-up load older, and WS auto-append paths).
    // -----------------------------------------------------

    NO._chatState = null;
    // { order, pageId, convId, customerId, msgIds:Set, msgs:[], cursor, loadingOlder, hasMore, wsSub, missedSince, replyTo }
    NO._w2cpPanel = null;
    // instance Web2ChatPanel đang mount trong #msgThread

    // Mount component chat hợp nhất Web2ChatPanel vào #msgThread (host). Header tắt
    // (native đã có header riêng). Adapter inject load/send/quickReplies bọc Web2Chat.
    NO._mountChatPanel = function _mountChatPanel(order, conv, customerId, msgs) {
        const host = document.getElementById('msgThread');
        if (!host || !window.Web2ChatPanel) {
            if (host)
                host.innerHTML =
                    '<div style="padding:24px;text-align:center;color:#b91c1c;">⚠ Web2ChatPanel chưa load.</div>';
            return;
        }
        // reset inline style của #msgThread để panel chiếm trọn (bỏ padding/background)
        host.style.padding = '0';
        try {
            NO._w2cpPanel?.destroy?.();
        } catch (_) {}
        NO._w2cpPanel = window.Web2ChatPanel.mount(host, { mode: 'full', hideHeader: true });
        NO._w2cpPanel.open(
            {
                id: conv.id,
                page_id: order.fbPageId,
                type: 'INBOX',
                customers: conv.customers || [{ id: customerId, name: order.customerName }],
                from: { id: order.fbUserId, name: order.customerName || order.fbUserName },
            },
            NO._buildNativeAdapter(order, conv, customerId, msgs)
        );
    };

    NO._buildNativeAdapter = function _buildNativeAdapter(order, conv, customerId, initialMsgs) {
        const pageId = order.fbPageId;
        const convId = conv.id;
        return {
            pageName: order.fbPageName || 'shop',
            hasExtension: !!NO._hasExtension(),
            quickReplies() {
                return (NO._loadQuickTags() || []).map((t) => ({
                    label: t.label,
                    template: t.tpl || t.label,
                    color: t.color || '#0068ff',
                }));
            },
            async loadMessages() {
                // Đã fetch sẵn ở _loadAndRenderThread → dùng luôn, tránh fetch 2 lần.
                return { messages: initialMsgs || [], hasMore: (initialMsgs || []).length > 0 };
            },
            async loadOlder(cursor) {
                const r = await window.Web2Chat.fetchMessages(pageId, convId, customerId, {
                    currentCount: cursor,
                });
                return { messages: (r && r.ok && r.messages) || [] };
            },
            async markRead() {
                if (window.Web2NewMsgBadge?.clearPendingForCustomer)
                    window.Web2NewMsgBadge.clearPendingForCustomer(order.fbUserId);
            },
            async send({ text, attachment, replyToId }) {
                return NO._performNativeSend(
                    order,
                    { conv, customerId },
                    {
                        text,
                        attachment,
                        replyToId,
                    }
                );
            },
            // Feature 2: gửi sticker FB (qua extension REPLY_INBOX_PHOTO STICKER).
            async sendSticker(stickerId) {
                return NO._performNativeSend(order, { conv, customerId }, { text: '', stickerId });
            },
            // Feature 3: "Thêm vào KH" — CẢ HAI: (1) fill SĐT/địa chỉ vào ĐƠN đang mở
            // (PATCH native_order, chỉ field còn rỗng để không đè), (2) upsert danh bạ
            // web2_customers (tạo nếu mới). Báo toast, cập nhật STATE nếu đổi.
            async onAddEntity({ phone, address, name }) {
                const patch = {};
                if (phone && !order.phone) patch.phone = phone;
                if (address && !order.address) patch.address = address;
                if (name && !order.customerName) patch.customerName = name;
                if (Object.keys(patch).length && window.NativeOrdersApi?.update) {
                    try {
                        const resp = await window.NativeOrdersApi.update(order.code, patch);
                        if (resp?.order) {
                            const idx = NO.STATE.orders.findIndex((x) => x.code === order.code);
                            if (idx !== -1) NO.STATE.orders[idx] = resp.order;
                            Object.assign(order, patch);
                        }
                    } catch (e) {
                        console.warn(
                            '[NativeOrders] fill order from chat entity failed:',
                            e.message
                        );
                    }
                }
                let created = null;
                try {
                    // ENFORCE-PREP (2026-06-12): /api/web2/customers/upsert sắp
                    // gate WEB2_AUTH_ENFORCE=1 — gắn x-web2-token.
                    const upsertHeaders = { 'Content-Type': 'application/json' };
                    if (window.Web2Auth?.authHeaders) {
                        Object.assign(upsertHeaders, window.Web2Auth.authHeaders());
                    } else {
                        try {
                            const t = JSON.parse(
                                localStorage.getItem('web2_auth') || 'null'
                            )?.token;
                            if (t) upsertHeaders['x-web2-token'] = t;
                        } catch {
                            /* ignore */
                        }
                    }
                    const r = await fetch(`${NO.WORKER_URL}/api/web2/customers/upsert`, {
                        method: 'POST',
                        headers: upsertHeaders,
                        body: JSON.stringify({
                            phone: phone || order.phone || '',
                            name: name || order.customerName || '',
                            address: address || order.address || '',
                        }),
                    });
                    const j = await r.json().catch(() => ({}));
                    if (j.success) created = j.created;
                    else if (!Object.keys(patch).length)
                        throw new Error(j.error || 'upsert KH thất bại');
                } catch (e) {
                    if (!Object.keys(patch).length) throw e;
                    console.warn('[NativeOrders] web2_customers upsert failed:', e.message);
                }
                const parts = [];
                if (patch.phone) parts.push('SĐT');
                if (patch.address) parts.push('địa chỉ');
                const fillMsg = parts.length ? `Đã điền ${parts.join(' + ')} vào đơn. ` : '';
                const khMsg =
                    created === true
                        ? 'Đã tạo KH mới.'
                        : created === false
                          ? 'Đã cập nhật KH.'
                          : '';
                NO.notify((fillMsg + khMsg).trim() || 'Đã thêm vào KH', 'success');
            },
        };
    };

    // Gửi tin (extension-first bypass-24h → Web2Chat fallback). Trả {via, sent} hoặc
    // throw Error (panel rollback + báo lỗi). Port từ _handleSendMessage cũ, bỏ phần
    // UI-first (panel tự lo bong bóng tạm + rollback).
    NO._performNativeSend = async function _performNativeSend(
        order,
        ctx,
        { text, attachment, replyToId, stickerId }
    ) {
        const att = attachment || null;
        const convId = ctx.conv?.id || null;
        const customerId = ctx.customerId || null;
        // Sticker CHỈ gửi được qua extension (REPLY_INBOX_PHOTO STICKER) — Pancake API
        // public không có nhánh sticker tương đương.
        if (stickerId && !NO._hasExtension()) throw new Error('Cần N2 Extension để gửi sticker');

        // ROUTE 1: N2 Extension (bypass 24h).
        if (NO._hasExtension()) {
            try {
                let globalUserId = order._fbGlobalUserId;
                if (!globalUserId && convId && window.Web2Chat) {
                    try {
                        const mr = await window.Web2Chat.fetchMessages(
                            order.fbPageId,
                            convId,
                            customerId
                        );
                        if (mr?.ok) {
                            const cust =
                                mr.customers?.find?.(
                                    (c) => c?.fb_id === order.fbUserId || c?.global_id
                                ) || mr.customers?.[0];
                            const gid =
                                cust?.global_id ||
                                mr.conversation?.page_customer?.global_id ||
                                null;
                            if (gid && String(gid) !== String(order.fbUserId)) {
                                globalUserId = String(gid);
                                order._fbGlobalUserId = globalUserId;
                            }
                        }
                    } catch (_) {}
                }
                const threadId = ctx.conv?.thread_id || ctx.conv?.threadId || '';
                if (!globalUserId && order.fbPageId && (threadId || order.customerName)) {
                    try {
                        const g = await NO._extensionRequest(
                            'GET_GLOBAL_ID_FOR_CONV',
                            {
                                pageId: order.fbPageId,
                                threadId: threadId || '',
                                customerName: order.customerName || order.fbUserName || '',
                                isBusiness: true,
                            },
                            30000
                        );
                        globalUserId =
                            g?.data?.globalId ||
                            g?.data?.globalUserId ||
                            g?.data?.payload?.globalUserId;
                        if (globalUserId) order._fbGlobalUserId = globalUserId;
                    } catch (_) {}
                }
                const swConvId = threadId ? 't_' + threadId : convId || '';
                let files = [];
                let attachmentType = 'SEND_TEXT_ONLY';
                if (stickerId) {
                    files = [stickerId];
                    attachmentType = 'STICKER';
                } else if (att && att.file) {
                    const dataUrl = await NO._fileToDataUrl(att.file);
                    const up = await NO._extensionRequest(
                        'UPLOAD_INBOX_PHOTO',
                        {
                            pageId: order.fbPageId,
                            photoUrl: dataUrl,
                            name: att.file.name || 'attachment',
                        },
                        60000
                    );
                    const fbId = up?.data?.fbId;
                    if (!up.ok || !fbId)
                        throw new Error(
                            'Gửi tệp thất bại (extension): ' + (up?.error || 'unknown')
                        );
                    files = [fbId];
                    attachmentType = att.kind || 'FILE';
                }
                const r = await NO._extensionRequest('REPLY_INBOX_PHOTO', {
                    pageId: order.fbPageId,
                    globalUserId: globalUserId || order.fbUserId,
                    threadId: threadId || '',
                    convId: swConvId,
                    customerName: order.customerName || order.fbUserName || '',
                    conversationUpdatedTime: order.updatedAt
                        ? new Date(order.updatedAt).getTime()
                        : Date.now(),
                    message: text || '',
                    attachmentType,
                    files,
                    platform: 'facebook',
                    isBusiness: true,
                    repliedMessageId: replyToId,
                });
                if (r.ok) {
                    if (window.Web2NewMsgBadge?.clearPendingForCustomer)
                        window.Web2NewMsgBadge.clearPendingForCustomer(order.fbUserId);
                    return {
                        via: 'extension',
                        sent: {
                            id: 'local_' + Date.now(),
                            from: { id: order.fbPageId, name: 'You' },
                            from_admin: true,
                            message: text || (att ? '[Tệp đính kèm]' : ''),
                            inserted_at: new Date().toISOString(),
                        },
                    };
                }
                console.warn('[NativeOrders] extension send failed, fallback Pancake:', r.error);
            } catch (e) {
                // Lỗi upload tệp → throw để panel rollback (không fallback vì Pancake
                // native không có nhành vi upload tương đương cho mọi loại).
                if (att && att.file) throw e;
                if (stickerId) throw e;
                console.warn('[NativeOrders] extension bridge error, fallback Pancake:', e.message);
            }
        }
        // Sticker không có fallback Pancake → extension fail thì báo lỗi.
        if (stickerId) throw new Error('Gửi sticker thất bại (extension)');

        // ROUTE 2: Web2Chat (Pancake Public API, 24h rule).
        if (!NO._hasChatClient() || !window.Web2Chat.hasTokensFor(order.fbPageId))
            throw new Error('Chưa có Extension và chưa cấu hình token Pancake cho page này.');
        let conversationId = convId;
        let custId = customerId;
        if (!conversationId) {
            let r = { conversations: [] };
            try {
                r = await window.Web2Chat.fetchConversations(order.fbPageId, order.fbUserId);
            } catch (_) {}
            const list = r.conversations || [];
            if (list[0]) {
                conversationId = list[0].id;
                custId = r.customerUuid || list[0]?.customers?.[0]?.id || custId;
            }
        }
        if (!conversationId) throw new Error('Chưa tìm thấy hội thoại với khách.');
        let pancakeAttachments;
        if (att && att.file) {
            const up =
                typeof window.Web2Chat.uploadMedia === 'function'
                    ? await window.Web2Chat.uploadMedia(order.fbPageId, att.file)
                    : { ok: false, reason: 'uploadMedia unavailable' };
            if (!up.ok || !up.id)
                throw new Error('Upload tệp lên Pancake thất bại: ' + (up.reason || 'unknown'));
            pancakeAttachments = [{ content_id: up.id }];
        }
        const sendRes = await window.Web2Chat.sendMessage(order.fbPageId, conversationId, {
            text,
            action: 'reply_inbox',
            customerId: custId,
            repliedMessageId: replyToId,
            attachments: pancakeAttachments,
        });
        if (!sendRes.ok) throw new Error('Gửi thất bại: ' + String(sendRes.reason || 'unknown'));
        if (window.Web2NewMsgBadge?.clearPendingForCustomer)
            window.Web2NewMsgBadge.clearPendingForCustomer(order.fbUserId);
        return {
            via: 'pancake',
            sent: {
                id: sendRes.message?.id || 'local_' + Date.now(),
                from: { id: order.fbPageId, name: 'You' },
                from_admin: true,
                message: text || (att ? '[Tệp đính kèm]' : ''),
                inserted_at: new Date().toISOString(),
            },
        };
    };

    // Attachment đang chọn để gửi (ảnh/âm thanh/video/tệp) — gửi qua extension
    // (UPLOAD_INBOX_PHOTO → REPLY_INBOX_PHOTO). Đồng bộ với web2-pancake.
    NO._pendingAttachment = null;
    // { file, kind } với kind ∈ PHOTO|AUDIO|VIDEO|FILE

    NO._attachmentKind = function _attachmentKind(file) {
        const t = (file && file.type) || '';
        if (t.startsWith('image/')) return 'PHOTO';
        if (t.startsWith('audio/')) return 'AUDIO';
        if (t.startsWith('video/')) return 'VIDEO';
        return 'FILE';
    };

    NO._fileToDataUrl = function _fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(new Error('Đọc tệp thất bại'));
            r.readAsDataURL(file);
        });
    };

    NO._attachLabel = function _attachLabel(kind) {
        return kind === 'AUDIO'
            ? '[Âm thanh]'
            : kind === 'VIDEO'
              ? '[Video]'
              : kind === 'FILE'
                ? '[Tệp]'
                : '[Hình ảnh]';
    };

    NO._setPendingAttachment = function _setPendingAttachment(file) {
        if (!file) return;
        NO._pendingAttachment = { file, kind: NO._attachmentKind(file) };
        const wrap = document.getElementById('msgAttachPreview');
        if (!wrap) return;
        if (NO._pendingAttachment.kind === 'PHOTO') {
            const reader = new FileReader();
            reader.onload = (e) => {
                wrap.innerHTML = `<img src="${e.target.result}" style="max-width:90px;max-height:70px;border-radius:6px;object-fit:cover;"><button type="button" id="msgAttachRemove" style="margin-left:8px;border:none;background:#ef4444;color:#fff;border-radius:50%;width:20px;height:20px;cursor:pointer;line-height:1;">×</button>`;
                wrap.style.display = 'flex';
                wrap.querySelector('#msgAttachRemove')?.addEventListener(
                    'click',
                    NO._clearPendingAttachment
                );
            };
            reader.readAsDataURL(file);
        } else {
            const icon =
                NO._pendingAttachment.kind === 'AUDIO'
                    ? '🎵'
                    : NO._pendingAttachment.kind === 'VIDEO'
                      ? '🎬'
                      : '📎';
            const kb = Math.max(1, Math.round((file.size || 0) / 1024));
            wrap.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;padding:6px 10px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;max-width:240px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${icon} ${NO.escapeHtml(file.name || 'tệp')} <small style="color:#94a3b8;">(${kb} KB)</small></span><button type="button" id="msgAttachRemove" style="margin-left:8px;border:none;background:#ef4444;color:#fff;border-radius:50%;width:20px;height:20px;cursor:pointer;line-height:1;">×</button>`;
            wrap.style.display = 'flex';
            wrap.querySelector('#msgAttachRemove')?.addEventListener(
                'click',
                NO._clearPendingAttachment
            );
        }
    };

    NO._clearPendingAttachment = function _clearPendingAttachment() {
        NO._pendingAttachment = null;
        const wrap = document.getElementById('msgAttachPreview');
        if (wrap) {
            wrap.style.display = 'none';
            wrap.innerHTML = '';
        }
        const fi = document.getElementById('msgFileInput');
        const ii = document.getElementById('msgImageInput');
        if (fi) fi.value = '';
        if (ii) ii.value = '';
    };

    /**
     * Set the "replying to" target. Pass null to clear.
     * Highlights the source bubble briefly and renders the reply bar
     * above the input.
     */
    NO._setReplyTarget = function _setReplyTarget(msgId) {
        if (!NO._chatState) return;
        if (!msgId) {
            NO._chatState.replyTo = null;
            NO._renderReplyBar();
            return;
        }
        const m = NO._chatState.msgs.find((x) => String(x.id) === String(msgId));
        if (!m) return;
        NO._chatState.replyTo = {
            id: m.id,
            from: m.from?.name || (m.from_admin ? 'Tôi' : 'Khách'),
            text: NO._msgPlain(m.message || m.text || '').slice(0, 80),
            hasMedia: Array.isArray(m.attachments) && m.attachments.length > 0,
        };
        NO._renderReplyBar();
        // Highlight source bubble briefly
        document
            .querySelectorAll('.w2-chat-row.is-replying-target')
            .forEach((el) => el.classList.remove('is-replying-target'));
        const row = document.querySelector(
            `.w2-chat-row[data-msg-id="${CSS.escape(String(m.id))}"]`
        );
        if (row) {
            row.classList.add('is-replying-target');
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            setTimeout(() => row.classList.remove('is-replying-target'), 1800);
        }
        document.getElementById('msgInput')?.focus();
    };

    NO._renderReplyBar = function _renderReplyBar() {
        const host = document.getElementById('msgReplyBar');
        if (!host) return;
        const r = NO._chatState?.replyTo;
        if (!r) {
            host.innerHTML = '';
            host.style.display = 'none';
            return;
        }
        host.style.display = '';
        const preview = r.text || (r.hasMedia ? '[Đính kèm]' : '[Tin nhắn]');
        host.innerHTML = `<div class="w2-chat-reply-bar">
            <i data-lucide="corner-up-left" style="width:14px;height:14px;color:#0068ff;"></i>
            <span class="preview">Trả lời <strong>${NO.escapeHtml(r.from)}</strong>${NO.escapeHtml(preview)}</span>
            <button type="button" data-action="cancel-reply" title="Huỷ trả lời">×</button>
        </div>`;
        if (window.lucide?.createIcons) window.lucide.createIcons();
        host.querySelector('[data-action="cancel-reply"]')?.addEventListener('click', () =>
            NO._setReplyTarget(null)
        );
    };

    /**
     * Optimistically append a just-sent outgoing message to the thread so
     * the user sees their bubble instantly without waiting for the next
     * fetchMessages round-trip. Marked with a temp id; if a real WS event
     * later carries the same content, the id-dedup map prevents double-render.
     */
    NO._appendOutgoing = function _appendOutgoing(text) {
        if (!NO._chatState) return null;
        const fake = {
            id: 'local_' + Date.now(),
            from: { id: NO._chatState.pageId, name: 'You' },
            from_admin: true,
            message: text,
            inserted_at: new Date().toISOString(),
            attachments: [],
        };
        NO._chatState.msgs.push(fake);
        NO._chatState.msgIds.add(fake.id);
        // Append only the new bubble (no full re-render)
        NO._appendBubbleDom(fake);
        const t = document.getElementById('msgThread');
        if (t) t.scrollTop = t.scrollHeight;
        return fake.id; // caller giữ id để rollback (gỡ bong bóng nếu gửi thất bại)
    };

    /**
     * Gỡ 1 bong bóng outgoing tạm (UI-first rollback) — xoá khỏi _chatState.msgs,
     * msgIds và DOM. Dùng khi gửi thất bại cả 2 route để khôi phục trạng thái.
     */
    NO._removeOutgoing = function _removeOutgoing(localId) {
        if (!localId || !NO._chatState) return;
        const idx = NO._chatState.msgs.findIndex((m) => m.id === localId);
        if (idx >= 0) NO._chatState.msgs.splice(idx, 1);
        NO._chatState.msgIds?.delete?.(localId);
        const row = document.querySelector(
            `.w2-chat-row[data-msg-id="${CSS.escape(String(localId))}"]`
        );
        if (row) row.remove();
    };

    NO._onIncomingWsMessage = function _onIncomingWsMessage(payload) {
        if (!NO._chatState) return;
        // Pancake broker forwards two distinct WS event shapes; normalise:
        //   pages:new_message        → payload.message = { id, conversation_id, message, from, … }
        //   pages:update_conversation → payload.conversation = { id, last_message: { id, message, from, … } }
        // Last_message often lacks conversation_id — inject it. The
        // sidebar handler does the same dance in _handleSidebarWsEvent.
        let m;
        let convId;
        if (payload?.message) {
            m = payload.message;
            convId = m.conversation_id || m.conversationId;
        } else if (payload?.conversation?.last_message) {
            convId = payload.conversation.id;
            m = { ...payload.conversation.last_message, conversation_id: convId };
        } else {
            return;
        }
        if (!m) return;
        if (convId && String(convId) !== String(NO._chatState.convId)) return;
        if (m.id && NO._chatState.msgIds.has(m.id)) return;
        if (m.id) NO._chatState.msgIds.add(m.id);
        NO._chatState.msgs.push(m);
        // Đẩy vào component chat hợp nhất (panel tự lo scroll + badge "tin mới").
        if (NO._w2cpPanel) NO._w2cpPanel.pushMessage(m);
    };

    NO._teardownChatState = function _teardownChatState() {
        if (NO._chatState?.wsSub?.unsubscribe) {
            try {
                NO._chatState.wsSub.unsubscribe();
            } catch {
                /* ignore */
            }
        }
        if (NO._sidebarWsSub?.unsubscribe) {
            try {
                NO._sidebarWsSub.unsubscribe();
            } catch {
                /* ignore */
            }
            NO._sidebarWsSub = null;
        }
        if (NO._sidebarPollTimer) {
            clearInterval(NO._sidebarPollTimer);
            NO._sidebarPollTimer = null;
        }
        try {
            NO._w2cpPanel?.destroy?.();
        } catch (_) {}
        NO._w2cpPanel = null;
        NO._chatState = null;
    };

    /**
     * After Messages tab renders, lazy-load Pancake API + fetch conversation history.
     * Stores conversationId/customerId on #msgInput for the Send button.
     */
    NO._loadAndRenderThread = async function _loadAndRenderThread(order) {
        const threadEl = document.getElementById('msgThread');
        if (!threadEl) return;
        if (!NO._hasChatClient()) {
            threadEl.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:14px;text-align:center;">Web2Chat client chưa load.</div>`;
            return;
        }
        // Đơn inbox tay chưa bind fb page/user. Thử resolve hội thoại theo SĐT
        // (logic riêng tab Inbox) → nếu thấy thì bind psid+page rồi load thread
        // bình thường. Không thấy → prompt mời chọn hội thoại từ sidebar (đã tự
        // search theo tên/SĐT). Đơn livestream luôn có fbPageId nên không vào đây.
        if (!order.fbPageId || !order.fbUserId) {
            if (order.phone) {
                let r = null;
                try {
                    r = await NO._resolveInboxConvByPhone(order.phone);
                } catch {
                    /* tolerate → prompt bên dưới */
                }
                if (r && r.fbId && r.pageId) {
                    const synthetic = {
                        ...order,
                        fbUserId: r.fbId,
                        fbPageId: r.pageId,
                        fbUserName: order.customerName || r.name || '',
                    };
                    const o = NO.STATE.orders.find((x) => x.code === order.code);
                    if (o) {
                        o.fbUserId = o.fbUserId || r.fbId;
                        o.fbPageId = o.fbPageId || r.pageId;
                    }
                    NO._applyChatHeaderForOrder(synthetic);
                    return NO._loadAndRenderThread(synthetic); // load thread thật
                }
            }
            threadEl.innerHTML = `<div style="color:#94a3b8;font-size:12px;padding:40px 18px;text-align:center;line-height:1.6;">
                <i data-lucide="mouse-pointer-click" style="width:30px;height:30px;display:block;margin:0 auto 10px;color:#cbd5e1;"></i>
                Không tìm thấy hội thoại Facebook theo SĐT.<br>
                Chọn đúng hội thoại của khách ở <strong>danh sách bên trái</strong> để bắt đầu chat.
            </div>`;
            if (window.lucide?.createIcons) window.lucide.createIcons();
            return;
        }
        // Skeleton: show shimmering placeholder bubbles immediately so the
        // modal doesn't feel empty during the ~150–350ms it takes for
        // fetchConversations + fetchMessages to round-trip the Pancake
        // proxy. Replaced as soon as the real thread is rendered.
        threadEl.innerHTML = NO._skeletonThreadHtml();

        // Auto-sync accounts + page tokens from Render DB once per session.
        // Web 1.0 maintains this store; pulling it lets web 2.0 reuse the
        // same JWT pool and page_access_tokens without re-prompting the
        // user. Cached after first call so the cost is paid only once.
        if (window.Web2Chat.syncFromRenderDB) {
            try {
                await window.Web2Chat.syncFromRenderDB();
            } catch {
                /* network failure — fall through to localStorage-only flow */
            }
        }
        // If we still have no PAT for this specific page, try minting one
        // from any account that admins the page. Multi-account fallback
        // mirrors web 1.0's behaviour.
        if (
            order.fbPageId &&
            !window.Web2Chat.getPageAccessToken(order.fbPageId) &&
            window.Web2Chat.generatePageAccessToken
        ) {
            try {
                await window.Web2Chat.generatePageAccessToken(order.fbPageId);
            } catch {
                /* will surface as "no tokens" below */
            }
        }

        if (!window.Web2Chat.hasTokensFor(order.fbPageId)) {
            threadEl.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:14px;text-align:center;line-height:1.5;">
                Chưa cấu hình token Pancake cho page <code>${NO.escapeHtml(order.fbPageId)}</code>.<br>
                <a href="../web2/pancake-settings/index.html" target="_blank" style="color:#0068ff;">Mở Cấu hình Pancake (Web 2.0) →</a>
            </div>`;
            return;
        }
        try {
            const convRes = await window.Web2Chat.fetchConversations(
                order.fbPageId,
                order.fbUserId
            );
            const conversations = convRes.conversations || [];
            if (!convRes.ok || conversations.length === 0) {
                // Match theo fbid của đơn fail (fbid kho KH thường ≠ PSID thật của hội
                // thoại Pancake) → thử resolve theo SĐT (proven, quét mọi page). Thấy psid
                // KHÁC → rebind + load lại → avatar + thread THẬT. Tránh "Chưa có hội thoại"
                // sai (hội thoại có tồn tại, chỉ lệch id). Bounded: lần 2 cùng id → prompt.
                if (order.phone) {
                    let r = null;
                    try {
                        r = await NO._resolveInboxConvByPhone(order.phone);
                    } catch {
                        /* tolerate → prompt tìm kiếm bên dưới */
                    }
                    if (r && r.fbId && r.pageId && String(r.fbId) !== String(order.fbUserId)) {
                        const synthetic = {
                            ...order,
                            fbUserId: r.fbId,
                            fbPageId: r.pageId,
                            fbUserName: order.customerName || r.name || '',
                        };
                        const o = NO.STATE.orders.find((x) => x.code === order.code);
                        if (o) {
                            o.fbUserId = r.fbId;
                            o.fbPageId = r.pageId;
                        }
                        NO._applyChatHeaderForOrder(synthetic);
                        return NO._loadAndRenderThread(synthetic);
                    }
                }
                const reason = convRes.reason ? ` (${convRes.reason})` : '';
                threadEl.innerHTML = `<div style="color:#94a3b8;font-size:12px;padding:36px 18px;text-align:center;line-height:1.6;">
                    <i data-lucide="search" style="width:28px;height:28px;display:block;margin:0 auto 10px;color:#cbd5e1;"></i>
                    Chưa khớp hội thoại tự động${reason}.<br>Dùng <strong>ô tìm kiếm bên trái</strong> để chọn đúng hội thoại của khách.
                </div>`;
                if (window.lucide?.createIcons) window.lucide.createIcons();
                return;
            }
            const inboxConvs = conversations.filter(
                (c) => (c.type || '').toUpperCase() === 'INBOX'
            );
            if (inboxConvs.length === 0) {
                const commentCount = conversations.length;
                threadEl.innerHTML = `<div style="color:#94a3b8;font-size:12px;padding:24px 12px;text-align:center;line-height:1.5;">
                    <i data-lucide="message-square-off" style="width:28px;height:28px;display:block;margin:0 auto 6px;color:#cbd5e1;"></i>
                    Khách chưa có tin nhắn inbox với page này.<br>
                    <span style="font-size:11px;">Có ${commentCount} comment trên các post — chuyển sang tab <strong>Bình luận</strong> để trả lời.</span>
                </div>`;
                if (window.lucide?.createIcons) window.lucide.createIcons();
                return;
            }
            const conv = inboxConvs[0];
            const customerId = convRes.customerUuid || conv?.customers?.[0]?.id || null;
            const input = document.getElementById('msgInput');
            if (input) {
                input.dataset.conversationId = conv.id;
                input.dataset.customerId = customerId || '';
                input.dataset.threadId = conv?.thread_id || conv?.threadId || '';
            }
            const msgRes = await window.Web2Chat.fetchMessages(order.fbPageId, conv.id, customerId);
            if (!msgRes.ok) {
                threadEl.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:14px;text-align:center;">Lỗi tải tin nhắn: ${NO.escapeHtml(msgRes.reason || 'unknown')}</div>`;
                return;
            }
            // Init shared state. Pancake returns oldest-first within a page.
            NO._teardownChatState();
            const msgs = msgRes.messages || [];
            const ids = new Set();
            for (const m of msgs) if (m.id) ids.add(m.id);
            NO._chatState = {
                order,
                pageId: order.fbPageId,
                convId: conv.id,
                customerId,
                msgs,
                msgIds: ids,
                cursor: msgs.length, // next page-load uses current_count = msgs.length
                hasMore: msgs.length > 0, // assume more until server returns nothing
                loadingOlder: false,
                missedSince: 0,
            };
            // Chat UI hợp nhất: mount Web2ChatPanel vào #msgThread (header tắt — native
            // đã có header riêng). _chatState giữ lại để WS dedup + context.
            NO._mountChatPanel(order, conv, customerId, msgs);
            // Live update: WS append for the open conversation. Subscribe
            // to BOTH event types — `pages:update_conversation` fires
            // reliably from Pancake's Phoenix channel (broker captures
            // it 24/7) and carries `conversation.last_message`, whereas
            // `pages:new_message` rarely fires without FB socket creds.
            // Both flow through `_onIncomingWsMessage` which de-dupes by
            // message id, so subscribing twice is harmless.
            if (window.Web2Realtime?.subscribe) {
                NO._chatState.wsSub = window.Web2Realtime.subscribe({
                    types: ['pages:new_message', 'pages:update_conversation'],
                    onEvent: (m) => NO._onIncomingWsMessage(m.payload),
                    debounceMs: 0,
                });
            }
            const jumpBtn = document.getElementById('msgJumpBottom');
            jumpBtn?.addEventListener('click', () => {
                const t = document.getElementById('msgThread');
                if (!t) return;
                t.scrollTop = t.scrollHeight;
                jumpBtn.style.display = 'none';
                if (NO._chatState) NO._chatState.missedSince = 0;
            });
        } catch (e) {
            threadEl.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:14px;">Lỗi tải hội thoại: ${NO.escapeHtml(e.message)}</div>`;
        }
    };
})();
