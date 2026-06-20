// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — wrapper mỏng bọc Web2ChatPanel (component chat hợp nhất). Giữ public API cũ cho conversation-list + realtime.
// =====================================================================
// PancakeChatWindow — wrapper mỏng quanh Web2ChatPanel
// (web2/shared/chat-panel/web2-chat-panel.js). UI/render/emoji/reply/pagination
// nằm trong component chung; file này CHỈ build ADAPTER.
//
// TỪ 2026-06-13: ADAPTER dùng NGUỒN CHUNG `Web2Chat` (web2/shared/web2-chat-client.js)
// cho TOÀN BỘ data fetch/send/upload — KHÔNG còn gọi PancakeAPI.* (đường trùng) hay
// nhánh serverMode 'n2store' (Graph wrapper trả shape khác → bong bóng rỗng). Đúng
// rule Web 2.0: 1 nguồn Pancake chung để quản lý/bảo trì. Extension-first (bypass 24h)
// vẫn giữ. Public surface không đổi (conversation-list + realtime vẫn gọi như cũ):
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
                    color: q.color || '#0068ff',
                }));
            },

            async loadMessages() {
                // NGUỒN CHUNG: Web2Chat.fetchMessages (JWT direct → official PAT fallback).
                // Trả {ok, messages, customers, ...}; messages có field `message` đúng shape
                // Pancake → panel render được nội dung (hết bong bóng rỗng).
                const customerId = conv.customers?.[0]?.id || null;
                const r = await window.Web2Chat.fetchMessages(pageId, convId, customerId);
                // Bump thế hệ messages: loadOlder đang chạy dở sẽ bỏ merge để
                // không clobber mảng vừa replace (SSE refresh vs scroll-load-older).
                state._msgGen = (state._msgGen || 0) + 1;
                // Newest-first từ API → reverse thành oldest-first (panel tự sort lại theo ts).
                const msgs =
                    r && r.ok && Array.isArray(r.messages) ? r.messages.slice().reverse() : [];
                state.messages = msgs;
                state.messageCurrentCount = msgs.length;
                // Cập nhật customers (global_id cho extension send) nếu API trả về.
                if (r && Array.isArray(r.customers) && r.customers.length)
                    conv.customers = r.customers;
                return { messages: msgs.slice(), hasMore: msgs.length > 0 };
            },

            async loadOlder(cursor) {
                const gen = state._msgGen || 0; // capture trước fetch
                const r = await window.Web2Chat.fetchMessages(
                    pageId,
                    convId,
                    conv.customers?.[0]?.id || null,
                    { currentCount: cursor }
                );
                const older =
                    r && r.ok && Array.isArray(r.messages) ? r.messages.slice().reverse() : [];
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
                        // Incremental: chỉ bỏ pill chưa đọc tại chỗ, không rebuild cả cột.
                        (
                            window.PancakeConversationList?.reconcileConversationList ||
                            window.PancakeConversationList?.renderConversationList
                        )?.call(window.PancakeConversationList);
                    } catch (_) {}
                }
            },

            onConversationUpdate(c) {
                c.updated_at = new Date().toISOString();
                (
                    window.PancakeConversationList?.reconcileConversationList ||
                    window.PancakeConversationList?.renderConversationList
                )?.call(window.PancakeConversationList);
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
                // ENFORCE-PREP (2026-06-12): route gated soft — gắn x-web2-token.
                const _h = { 'Content-Type': 'application/json' };
                try {
                    const _t =
                        window.Web2Auth?.getStored?.()?.token ||
                        JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
                    if (_t) _h['x-web2-token'] = _t;
                } catch (_) {}
                const r = await fetch(`${workerUrl}/api/web2/customers/upsert`, {
                    method: 'POST',
                    headers: _h,
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

    // ===================== SEND =====================
    // Thử N2 Extension TRƯỚC (bypass 24h, gửi cả ảnh/âm thanh/video/tệp), lỗi/không
    // có extension → fallback NGUỒN CHUNG Web2Chat (upload + sendMessage). KHÔNG còn
    // dùng PancakeAPI hay nhánh serverMode 'n2store'.
    async _performSend(conv, convId, text, att) {
        const pageId = conv.page_id;
        const customerId = conv.customers?.[0]?.id || null;
        const action = conv.type === 'COMMENT' ? 'reply_comment' : 'reply_inbox';

        // 1) Extension-first
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

        // 2) Fallback Web2Chat (nguồn chung): upload media (nếu có) → content_id → send
        const attachments = [];
        if (att && att.file) {
            const up = await window.Web2Chat.uploadMedia(pageId, att.file);
            if (up && up.ok && up.id) attachments.push({ content_id: up.id });
            else throw new Error('Upload tệp thất bại (' + (up?.reason || 'Pancake') + ')');
        }

        let res = await window.Web2Chat.sendMessage(pageId, convId, {
            text,
            action,
            customerId,
            attachments,
        });
        // Thiếu page_access_token (hoặc FB #105) → mint PAT rồi thử lại 1 lần.
        if (
            res &&
            !res.ok &&
            (res.reason === 'no_page_access_token' || res.e_code === 105) &&
            window.Web2Chat.generatePageAccessToken
        ) {
            const g = await window.Web2Chat.generatePageAccessToken(pageId);
            if (g && g.ok)
                res = await window.Web2Chat.sendMessage(pageId, convId, {
                    text,
                    action,
                    customerId,
                    attachments,
                });
        }
        if (!res || !res.ok) throw new Error(res?.reason || 'Gửi tin thất bại');

        // Map message Pancake → shape `sent` panel/realtime dùng.
        const m = res.message && typeof res.message === 'object' ? res.message : {};
        const sent = {
            id: m.id || 'pk_' + Date.now(),
            message:
                m.message ||
                m.original_message ||
                text ||
                (attachments.length ? '[Tệp đính kèm]' : ''),
            from: m.from || { id: pageId, name: 'You' },
            inserted_at: m.inserted_at || new Date().toISOString(),
            attachments: m.attachments,
        };
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
                if (!up?.ok || !fbId) {
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
            return !!r?.ok;
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
