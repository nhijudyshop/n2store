// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — send-message + reply-comment handlers (extension-first bypass 24h). MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    NO._handleSendMessage = async function _handleSendMessage(order) {
        const input = document.getElementById('msgInput');
        if (!input) return;
        const text = input.value.trim();
        const att = NO._pendingAttachment; // { file, kind } | null
        if (!text && !att) {
            NO.notify('Vui lòng nhập tin nhắn', 'warning');
            return;
        }
        // Capture trước khi _setReplyTarget(null) xoá — gửi nền vẫn cần reply target.
        const replyToId = NO._chatState?.replyTo?.id || undefined;

        // UI-FIRST: hiện bong bóng + clear ô nhập NGAY (trước mọi await) → gửi chạy
        // nền. Không disable input (gõ tiếp được). Lỗi cả 2 route → _restore() gỡ
        // bong bóng + bật lại text vào ô để gửi lại.
        const fakeId = NO._appendOutgoing(text || NO._attachLabel(att?.kind));
        input.value = '';
        NO._setReplyTarget(null);
        NO._clearPendingAttachment();
        const _restore = () => {
            NO._removeOutgoing(fakeId);
            if (input && !input.value.trim()) {
                input.value = text;
                input.focus();
            }
            if (att) NO._setPendingAttachment(att.file);
        };

        // Try extension bridge first (bypasses Pancake 24h rule via FB Business)
        if (NO._hasExtension()) {
            try {
                // FB messaging/send/ cần OTHER_USER_FBID là FB Global ID (account thật, vd
                // 100001957832900), KHÔNG phải PSID (page-scoped id như 25717004554573583).
                // Gửi PSID → FB silent-reject với 1545012 "Tạm thời không thực hiện được".
                // Pancake luôn resolve global_id qua extension trước khi send.
                //
                // Handler signature (web2-extension/background/facebook/global-id.js#L67):
                //   GET_GLOBAL_ID_FOR_CONV cần {pageId, threadId, customerName} —
                //   KHÔNG nhận convId/fbUserId. Không có threadId+customerName → reject.
                let globalUserId = order._fbGlobalUserId;
                // ROUTE 1: Pancake API (nhanh, reliable — Pancake biết global_id
                // từ webhook trước). Endpoint messages?customer_id trả `customers[]`
                // có field `global_id` (FB account thật). Cùng nguồn Pancake UI dùng.
                if (!globalUserId && input.dataset.conversationId && window.Web2Chat) {
                    try {
                        const msgRes = await window.Web2Chat.fetchMessages(
                            order.fbPageId,
                            input.dataset.conversationId,
                            input.dataset.customerId || null
                        );
                        if (msgRes?.ok) {
                            const cust =
                                msgRes.customers?.find?.(
                                    (c) => c?.fb_id === order.fbUserId || c?.global_id
                                ) || msgRes.customers?.[0];
                            const gid =
                                cust?.global_id ||
                                msgRes.conversation?.page_customer?.global_id ||
                                null;
                            if (gid && String(gid) !== String(order.fbUserId)) {
                                globalUserId = String(gid);
                                order._fbGlobalUserId = globalUserId;
                                console.log(
                                    '[NativeOrders] globalUserId via Pancake API:',
                                    globalUserId,
                                    '(psid was',
                                    order.fbUserId + ')'
                                );
                            }
                        }
                    } catch (papiErr) {
                        console.warn(
                            '[NativeOrders] Pancake API global_id fetch failed:',
                            papiErr?.message || papiErr
                        );
                    }
                }
                // ROUTE 2: Extension GraphQL fallback (chậm hơn, fail nếu FB doc_ids
                // chưa load). Chỉ chạy nếu Pancake API không trả global_id.
                if (
                    !globalUserId &&
                    order.fbPageId &&
                    (input.dataset.threadId || order.customerName)
                ) {
                    try {
                        const gidResp = await NO._extensionRequest(
                            'GET_GLOBAL_ID_FOR_CONV',
                            {
                                pageId: order.fbPageId,
                                threadId: input.dataset.threadId || '',
                                customerName: order.customerName || order.fbUserName || '',
                                isBusiness: true,
                            },
                            30000
                        );
                        globalUserId =
                            gidResp?.data?.globalId ||
                            gidResp?.data?.globalUserId ||
                            gidResp?.data?.payload?.globalUserId;
                        if (globalUserId) {
                            order._fbGlobalUserId = globalUserId;
                            console.log(
                                '[NativeOrders] globalUserId via extension:',
                                globalUserId,
                                '(psid was',
                                order.fbUserId + ')'
                            );
                        } else {
                            console.warn(
                                '[NativeOrders] GET_GLOBAL_ID_FOR_CONV returned no id:',
                                gidResp
                            );
                        }
                    } catch (gidErr) {
                        console.warn(
                            '[NativeOrders] GET_GLOBAL_ID_FOR_CONV threw:',
                            gidErr?.message || gidErr
                        );
                    }
                }
                // Pancake convId format: 't_' + threadId (vd 't_32546288751686299').
                // Ours là pageId_psid (vd '270136663390370_25717004554573583') — chỉ dùng
                // internally bởi Pancake API, nhưng SW REPLY_INBOX_PHOTO không đụng convId
                // khi build POST tới FB. Vẫn nên truyền đúng format cho debug clarity.
                const swConvId = input.dataset.threadId
                    ? 't_' + input.dataset.threadId
                    : input.dataset.conversationId || '';
                // Upload attachment lên FB (qua extension) → fbId, rồi gửi kèm. Extension
                // hỗ trợ PHOTO/AUDIO/VIDEO/FILE; data-URL để SW fetch được mọi context.
                let files = [];
                let attachmentType = 'SEND_TEXT_ONLY';
                if (att && att.file) {
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
                    if (!up.ok || !fbId) {
                        // Upload thất bại → KHÔNG fallback Pancake (native-orders không có
                        // Pancake upload) → restore + báo.
                        _restore();
                        NO.notify(
                            'Gửi tệp thất bại (extension upload): ' + (up?.error || 'unknown'),
                            'error'
                        );
                        return;
                    }
                    files = [fbId];
                    attachmentType = att.kind || 'FILE';
                }
                const r = await NO._extensionRequest('REPLY_INBOX_PHOTO', {
                    pageId: order.fbPageId,
                    globalUserId: globalUserId || order.fbUserId,
                    threadId: input.dataset.threadId || '',
                    convId: swConvId,
                    customerName: order.customerName || order.fbUserName || '',
                    conversationUpdatedTime: order.updatedAt
                        ? new Date(order.updatedAt).getTime()
                        : Date.now(),
                    message: text,
                    attachmentType,
                    files,
                    platform: 'facebook',
                    isBusiness: true,
                    repliedMessageId: replyToId,
                });
                if (r.ok) {
                    // Bong bóng đã hiện ở apply (UI-first) → chỉ cần báo.
                    NO.notify('Đã gửi qua N2 Extension (bypass 24h)', 'success');
                    if (window.Web2NewMsgBadge?.clearPendingForCustomer) {
                        window.Web2NewMsgBadge.clearPendingForCustomer(order.fbUserId);
                    }
                    return;
                }
                console.warn('[NativeOrders] Extension send failed, fallback Pancake:', r.error);
            } catch (e) {
                console.warn('[NativeOrders] Extension bridge error, fallback Pancake:', e.message);
            }
        }

        // Fallback: Web2Chat client (Pancake Public API, subject to 24h rule).
        // Attachment cũng gửi được qua đây: upload_contents → content_id → sendMessage.
        if (!NO._hasChatClient() || !window.Web2Chat.hasTokensFor(order.fbPageId)) {
            _restore();
            NO.notify('Chưa có Extension và chưa cấu hình token Pancake cho page này.', 'error');
            return;
        }
        let conversationId = input.dataset.conversationId;
        let customerId = input.dataset.customerId || null;
        if (!conversationId) {
            let r = { conversations: [] };
            try {
                r = await window.Web2Chat.fetchConversations(order.fbPageId, order.fbUserId);
            } catch (e) {
                console.warn('[NativeOrders] fetchConversations failed:', e?.message || e);
            }
            const list = r.conversations || [];
            if (list[0]) {
                conversationId = list[0].id;
                customerId = r.customerUuid || list[0]?.customers?.[0]?.id || customerId;
            }
        }
        if (!conversationId) {
            _restore();
            NO.notify('Chưa tìm thấy hội thoại với khách.', 'error');
            return;
        }
        // Upload attachment lên Pancake (nếu có) → content_id để gửi kèm.
        let pancakeAttachments;
        if (att && att.file) {
            const up =
                typeof window.Web2Chat.uploadMedia === 'function'
                    ? await window.Web2Chat.uploadMedia(order.fbPageId, att.file)
                    : { ok: false, reason: 'uploadMedia unavailable' };
            if (!up.ok || !up.id) {
                _restore();
                NO.notify('Upload tệp lên Pancake thất bại: ' + (up.reason || 'unknown'), 'error');
                return;
            }
            pancakeAttachments = [{ content_id: up.id }];
        }
        let sendRes;
        try {
            sendRes = await window.Web2Chat.sendMessage(order.fbPageId, conversationId, {
                text,
                action: 'reply_inbox',
                customerId,
                repliedMessageId: replyToId,
                attachments: pancakeAttachments,
            });
        } catch (e) {
            sendRes = { ok: false, reason: e?.message || 'send threw' };
        }
        if (sendRes.ok) {
            // Bong bóng đã hiện ở apply (UI-first) → chỉ cần báo.
            NO.notify('Đã gửi tin nhắn', 'success');
            if (window.Web2NewMsgBadge?.clearPendingForCustomer) {
                window.Web2NewMsgBadge.clearPendingForCustomer(order.fbUserId);
            }
            return;
        }
        // Lỗi cả 2 route → gỡ bong bóng tạm + bật lại text + báo / prompt FB Business.
        _restore();
        const reason = String(sendRes.reason || 'unknown');
        const is24h = /e_?code.*10|2018278|24h|ngoài khoảng thời gian/i.test(reason);
        const extMissing = /extension.*not|chưa kết nối|not.*connected/i.test(reason);
        if (is24h || extMissing) {
            NO._showFbBusinessLoginPrompt(
                is24h
                    ? 'Quá 24h và extension chưa lấy được session FB Business. Đăng nhập Facebook (business.facebook.com) liên kết với Pancake để extension scrape được session, rồi thử lại.'
                    : 'Extension chưa kết nối. Đăng nhập Facebook (business.facebook.com) liên kết với Pancake để extension hoạt động.'
            );
        } else {
            NO.notify('Lỗi gửi tin nhắn: ' + reason, 'error');
        }
    };

    NO._handleReplyComment = async function _handleReplyComment(order, commentId, inputId, mode) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const text = input.value.trim();
        if (!text) {
            NO.notify('Vui lòng nhập nội dung trả lời', 'warning');
            return;
        }
        input.disabled = true;

        // Try extension first (bypasses 24h via FB Business)
        if (NO._hasExtension()) {
            try {
                const extType = mode === 'private' ? 'SEND_PRIVATE_REPLY' : 'SEND_COMMENT';
                const r = await NO._extensionRequest(extType, {
                    pageId: order.fbPageId,
                    postId: order.fbPostId,
                    commentId,
                    message: text,
                    globalUserId: order.fbUserId,
                });
                if (r.ok) {
                    input.value = '';
                    NO.notify(
                        (mode === 'private' ? '📨 Đã gửi DM ' : '💬 Đã trả lời comment ') +
                            'qua N2 Extension',
                        'success'
                    );
                    input.disabled = false;
                    return;
                }
                console.warn('[NativeOrders] Extension reply failed, fallback Pancake:', r.error);
            } catch (e) {
                console.warn('[NativeOrders] Extension bridge error, fallback Pancake:', e.message);
            }
        }

        // Fallback: Web2Chat client → /pages/:id/comments/:id/replies (Public API)
        if (!NO._hasChatClient() || !window.Web2Chat.hasTokensFor(order.fbPageId)) {
            input.disabled = false;
            NO.notify('Chưa có Extension và chưa cấu hình token Pancake cho page này.', 'error');
            return;
        }
        const replyRes = await window.Web2Chat.replyComment(order.fbPageId, commentId, {
            text,
            mode: mode === 'private' ? 'private' : 'public',
        });
        if (replyRes.ok) {
            input.value = '';
            NO.notify(
                mode === 'private'
                    ? 'Đã gửi tin nhắn riêng (Web2Chat)'
                    : 'Đã trả lời bình luận (Web2Chat)',
                'success'
            );
        } else {
            NO.notify('Lỗi: ' + (replyRes.reason || 'unknown'), 'error');
        }
        input.disabled = false;
    };
})();
