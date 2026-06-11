// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — wrapper mỏng bọc Web2ChatPanel (component chat hợp nhất). Giữ public API cũ cho conversation-list + realtime.
// =====================================================================
// PancakeChatWindow — TỪ 2026-06-07 chỉ là wrapper mỏng quanh Web2ChatPanel
// (web2/shared/chat-panel/web2-chat-panel.js). UI/render/emoji/reply/pagination
// nằm trong component chung; file này CHỈ build ADAPTER bọc PancakeAPI/PancakeState
// (fetch/send/upload + extension-first bypass 24h) và giữ nguyên public surface mà
// pancake-conversation-list.js + pancake-realtime.js đang gọi:
//   renderChatWindow(conv)  — mở chat (mount panel + open)
//   renderMessages()        — realtime: đồng bộ panel từ PancakeState.messages
//   scrollToBottom()
// =====================================================================

const PancakeChatWindow = {
    _panel: null,

    renderChatWindow(conv) {
        const host = document.getElementById('pkChatWindow');
        if (!host) return;
        if (!window.Web2ChatPanel) {
            host.innerHTML =
                '<div style="padding:24px;text-align:center;color:#b91c1c;">⚠ Web2ChatPanel chưa load (kiểm tra web2-chat-panel.js).</div>';
            return;
        }
        window.PancakeState.activeConversation = conv;
        this._panel = window.Web2ChatPanel.mount(host, { mode: 'full' });
        this._panel.open(conv, this._buildAdapter(conv));
    },

    // Realtime (_handleNewMessage / _fetchNewMessagesForActive) đẩy tin mới vào
    // PancakeState.messages rồi gọi renderMessages() → đồng bộ sang panel.
    renderMessages() {
        if (this._panel) this._panel.setMessages(window.PancakeState.messages || []);
    },
    scrollToBottom() {
        if (this._panel) this._panel.scrollToBottom();
    },
    // Legacy no-op: send do panel xử lý qua adapter.send.
    sendMessage() {},

    // ============================== ADAPTER ==============================
    _buildAdapter(conv) {
        const self = this;
        const state = window.PancakeState;
        const pageId = conv.page_id;
        const convId = conv.id;
        const pageName =
            (state.pages || []).find((p) => p.id === pageId || p.page_id === pageId)?.name ||
            'shop';

        return {
            pageName,
            hasExtension: !!window.Web2Ext?.hasExtension?.(),

            quickReplies() {
                return (state.quickReplies || []).map((q) => ({
                    label: q.label,
                    template: q.template || '',
                    color: q.color || '#7c3aed',
                }));
            },

            async loadMessages() {
                let result;
                if (state.serverMode === 'n2store') {
                    result = await window.PancakeAPI.fetchMessagesN2Store(pageId, convId);
                } else {
                    result = await window.PancakeAPI.fetchMessages(pageId, convId, {
                        customerId: conv.customers?.[0]?.id || null,
                    });
                }
                // Bump thế hệ messages: loadOlder đang chạy dở sẽ bỏ merge để
                // không clobber mảng vừa replace (SSE refresh vs scroll-load-older).
                state._msgGen = (state._msgGen || 0) + 1;
                // Newest-first từ API → reverse thành oldest-first (panel tự sort lại theo ts).
                state.messages = (result.messages || []).slice().reverse();
                state.messageCurrentCount = state.messages.length;
                return { messages: state.messages.slice(), hasMore: state.messages.length > 0 };
            },

            async loadOlder(cursor) {
                const gen = state._msgGen || 0; // capture trước fetch
                const result = await window.PancakeAPI.fetchMessages(pageId, convId, {
                    currentCount: cursor,
                    customerId: conv.customers?.[0]?.id || null,
                });
                const older = (result.messages || []).slice().reverse();
                // loadMessages đã replace state.messages trong lúc fetch → bỏ merge
                if (older.length && (state._msgGen || 0) === gen) {
                    const known = new Set((state.messages || []).map((m) => m.id).filter(Boolean));
                    const fresh = older.filter((m) => m.id && !known.has(m.id));
                    state.messages = [...fresh, ...(state.messages || [])];
                    state.messageCurrentCount = state.messages.length;
                }
                return { messages: older };
            },

            async markRead() {
                if (conv.unread_count > 0) {
                    try {
                        await window.PancakeAPI.markAsRead(pageId, convId);
                        conv.unread_count = 0;
                        conv.seen = true;
                        window.PancakeConversationList?.renderConversationList?.();
                    } catch (_) {}
                }
            },

            onConversationUpdate(c) {
                c.updated_at = new Date().toISOString();
                window.PancakeConversationList?.renderConversationList?.();
            },

            // Feature 2: gửi sticker FB qua extension (REPLY_INBOX_PHOTO STICKER).
            async sendSticker(stickerId) {
                if (!window.Web2Ext?.hasExtension?.())
                    throw new Error('Cần N2 Extension để gửi sticker');
                const ok = await self._trySendViaExtension(conv, '', null, stickerId);
                if (!ok) throw new Error('Gửi sticker thất bại');
                const sent = {
                    id: 'ext_' + Date.now(),
                    from: { id: conv.page_id, name: 'You' },
                    message: '🧩',
                    inserted_at: new Date().toISOString(),
                };
                state.messages = state.messages || [];
                state.messages.push(sent);
                return { via: 'extension', sent };
            },

            // Feature 3: "Thêm vào KH" — upsert danh bạ web2_customers (tạo nếu mới).
            // live-chat không có "đơn đang mở" → chỉ upsert KH + báo.
            async onAddEntity({ phone, address, name }) {
                const workerUrl =
                    window.Web2Chat?._internal?.WORKER_URL ||
                    window.API_CONFIG?.WORKER_URL ||
                    'https://chatomni-proxy.nhijudyshop.workers.dev';
                const r = await fetch(`${workerUrl}/api/web2/customers/upsert`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: phone || '',
                        name: name || '',
                        address: address || '',
                    }),
                });
                const j = await r.json().catch(() => ({}));
                if (!j.success) throw new Error(j.error || 'upsert KH thất bại');
                if (window.notificationManager?.show)
                    window.notificationManager.show(
                        j.created ? 'Đã tạo KH mới' : 'Đã cập nhật KH',
                        'success'
                    );
            },

            async send({ text, attachment }) {
                const res = await self._performSend(conv, convId, text, attachment || null);
                // Giữ PancakeState.messages đồng bộ (realtime renderMessages dựa vào nó).
                if (res?.sent) {
                    state.messages = state.messages || [];
                    if (!state.messages.some((m) => m.id === res.sent.id))
                        state.messages.push(res.sent);
                }
                if (res?.via === 'extension' && window.notificationManager?.show) {
                    window.notificationManager.show(
                        'Đã gửi qua N2 Extension (bypass 24h)',
                        'success'
                    );
                }
                return res;
            },
        };
    },

    // ===================== SEND (port từ bản cũ) =====================
    // Thử N2 Extension TRƯỚC (bypass 24h, gửi cả ảnh/âm thanh/video/tệp), lỗi/không
    // có extension → fallback Pancake API.
    async _performSend(conv, convId, text, att) {
        const state = window.PancakeState;
        const pageId = conv.page_id;
        const customerId = conv.customers?.[0]?.id || null;
        const action = conv.type === 'COMMENT' ? 'reply_comment' : 'reply_inbox';

        if ((text || att) && (await this._trySendViaExtension(conv, text, att))) {
            return {
                via: 'extension',
                sent: {
                    id: 'ext_' + Date.now(),
                    message: text || (att ? '[Tệp đính kèm]' : ''),
                    from: { id: pageId, name: 'You' },
                    inserted_at: new Date().toISOString(),
                },
            };
        }

        let contentIds = [];
        let attachmentId = null;
        let attachmentType = null;
        if (att && att.file) {
            if (state.serverMode === 'n2store') {
                const up = await window.PancakeAPI.uploadMediaN2Store(pageId, att.file);
                if (up.success && up.attachment_id) {
                    attachmentId = up.attachment_id;
                    attachmentType = up.attachment_type;
                } else throw new Error('Upload tệp thất bại (Pancake)');
            } else {
                const up = await window.PancakeAPI.uploadMedia(pageId, att.file);
                if (up.success && up.id) {
                    contentIds = [up.id];
                    attachmentType = up.attachment_type;
                } else throw new Error('Upload tệp thất bại (Pancake)');
            }
        }

        let sent;
        if (state.serverMode === 'n2store') {
            sent = await window.PancakeAPI.sendMessageN2Store(
                pageId,
                convId,
                text,
                action,
                attachmentId,
                attachmentType
            );
        } else {
            sent = await window.PancakeAPI.sendMessage(pageId, convId, {
                text,
                action,
                customerId,
                content_ids: contentIds,
                attachment_type: attachmentType,
            });
        }
        return { via: 'pancake', sent };
    },

    // Gửi qua N2 Extension (FB Business Suite GraphQL) — cần FB Global ID (không phải
    // PSID). Resolve global_id qua Pancake API (Web2Chat.fetchMessages → customers[].
    // global_id), fallback extension GET_GLOBAL_ID_FOR_CONV. Trả true nếu gửi OK.
    async _trySendViaExtension(conv, text, att, stickerId) {
        if (!conv || (!text && !att && !stickerId)) return false;
        if (!window.Web2Ext?.hasExtension?.()) return false;
        try {
            const pageId = conv.page_id;
            const customerId = conv.customers?.[0]?.id || null;
            const psid = conv.from?.id || conv.from_psid || conv.customers?.[0]?.fb_id || '';
            const threadId =
                conv.thread_id ||
                (String(conv.id).includes('_') ? String(conv.id).split('_')[1] : conv.id);
            const custName = conv.from?.name || conv.customers?.[0]?.name || '';

            let globalUserId = conv._fbGlobalUserId || null;
            if (!globalUserId && window.Web2Chat?.fetchMessages) {
                try {
                    const mr = await window.Web2Chat.fetchMessages(pageId, conv.id, customerId);
                    if (mr?.ok) {
                        const cust = mr.customers?.find?.((c) => c?.global_id) || mr.customers?.[0];
                        const gid =
                            cust?.global_id || mr.conversation?.page_customer?.global_id || null;
                        if (gid && String(gid) !== String(psid)) {
                            globalUserId = String(gid);
                            conv._fbGlobalUserId = globalUserId;
                        }
                    }
                } catch (e) {
                    console.warn('[PK-CHAT] Pancake API global_id fetch failed:', e.message);
                }
            }
            if (!globalUserId && pageId && (threadId || custName)) {
                try {
                    const g = await window.Web2Ext.request(
                        'GET_GLOBAL_ID_FOR_CONV',
                        {
                            pageId,
                            threadId: threadId || '',
                            customerName: custName,
                            isBusiness: true,
                        },
                        30000
                    );
                    globalUserId =
                        g?.data?.globalId ||
                        g?.data?.globalUserId ||
                        g?.data?.payload?.globalUserId ||
                        null;
                    if (globalUserId) conv._fbGlobalUserId = globalUserId;
                } catch (e) {
                    console.warn('[PK-CHAT] GET_GLOBAL_ID_FOR_CONV threw:', e.message);
                }
            }

            let files = [];
            let attachmentType = 'SEND_TEXT_ONLY';
            if (stickerId) {
                files = [stickerId];
                attachmentType = 'STICKER';
            } else if (att && att.file) {
                const dataUrl = await this._fileToDataUrl(att.file);
                const up = await window.Web2Ext.request(
                    'UPLOAD_INBOX_PHOTO',
                    { pageId, photoUrl: dataUrl, name: att.file.name || 'attachment' },
                    60000
                );
                const fbId = up?.data?.fbId;
                if (!up.ok || !fbId) {
                    console.warn('[PK-CHAT] extension upload failed:', up?.error);
                    return false;
                }
                files = [fbId];
                attachmentType = att.kind || 'FILE';
            }

            const swConvId = threadId ? 't_' + threadId : String(conv.id);
            const r = await window.Web2Ext.request(
                'REPLY_INBOX_PHOTO',
                {
                    pageId,
                    globalUserId: globalUserId || psid,
                    threadId: threadId || '',
                    convId: swConvId,
                    customerName: custName,
                    conversationUpdatedTime: conv.updated_at
                        ? new Date(conv.updated_at).getTime()
                        : Date.now(),
                    message: text || '',
                    attachmentType,
                    files,
                    platform: 'facebook',
                    isBusiness: true,
                },
                60000
            );
            return !!r.ok;
        } catch (e) {
            console.warn('[PK-CHAT] extension send failed:', e.message);
            return false;
        }
    },

    _fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(new Error('Đọc tệp thất bại'));
            r.readAsDataURL(file);
        });
    },
};

if (typeof window !== 'undefined') {
    window.PancakeChatWindow = PancakeChatWindow;
}
