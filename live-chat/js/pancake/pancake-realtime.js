// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — realtime qua SSE (single source), KHÔNG còn WebSocket riêng.
// =====================================================================
// PancakeRealtime — TỪ 2026-06-13 dùng SSE `web2:messages` (NGUỒN CHUNG),
// KHÔNG còn mở WebSocket Phoenix tới pancake.vn hay proxy WS riêng.
//
// Pipeline realtime (đã có sẵn, server-side):
//   Pancake WS  →  live-chat/server (PancakeWebSocketClient, relay 24/7)
//               →  POST /api/realtime/web2/sse/relay-notify {key:'web2:messages'}
//               →  render.com realtime-sse-web2.js notifyClients('web2:messages')
//               →  browser EventSource (Web2SSE bridge)
//               →  Web2SSE.subscribe('web2:messages', cb)  ← FILE NÀY
//
// SSE payload = TICKLE (không kèm nội dung): { action, pageId?, convId?, ts }.
//   action 'new_message'        → có tin mới (bare, không convId) → refetch hội thoại
//                                  đang mở + refresh danh sách.
//   action 'update_conversation'→ { pageId, convId } → nếu là conv đang mở thì refetch
//                                  tin; luôn refresh danh sách (debounce).
//   action 'tags_updated'       → emit eventBus 'pancake:orderTagsUpdate'.
// Data fetch luôn qua Web2Chat (web2-chat-client.js) = 1 nguồn Pancake chung.
//
// Public surface giữ nguyên cho pancake-init.js + các caller cũ:
//   connect() / connectServerMode()  → wire SSE (idempotent)
//   disconnect()                     → unsubscribe SSE
//   _handleUpdateConversation(payload) / _handleNewMessage(payload)  → route refresh
//   _fetchNewMessagesForActive()     → refetch tin hội thoại đang mở
// =====================================================================

const PancakeRealtime = {
    _sseUnsub: null,
    _msgRefreshTimer: null,
    _listRefreshTimer: null,
    _wireRetryTimer: null,
    isConnected: false,

    // ===== Public connect API (init.js gọi) — đều = wire SSE =====
    async connect() {
        return this._wireSse();
    },
    async connectServerMode() {
        return this._wireSse();
    },

    _wireSse() {
        if (this._sseUnsub) return true; // đã subscribe
        if (!window.Web2SSE || typeof window.Web2SSE.subscribe !== 'function') {
            // Bridge có thể load chậm hơn → thử lại 1 nhịp.
            if (!this._wireRetryTimer) {
                var self = this;
                this._wireRetryTimer = setTimeout(function () {
                    self._wireRetryTimer = null;
                    self._wireSse();
                }, 1000);
            }
            return false;
        }
        var self2 = this;
        this._sseUnsub = window.Web2SSE.subscribe('web2:messages', function (evt) {
            self2._onSseEvent(evt);
        });
        this.isConnected = true;
        this._updateStatusUI(true);
        console.log('[PK-RT] SSE web2:messages subscribed (realtime nguồn chung)');
        return true;
    },

    disconnect() {
        if (this._sseUnsub) {
            try {
                this._sseUnsub();
            } catch (_) {}
            this._sseUnsub = null;
        }
        if (this._wireRetryTimer) {
            clearTimeout(this._wireRetryTimer);
            this._wireRetryTimer = null;
        }
        this.isConnected = false;
        this._updateStatusUI(false);
    },

    // ===== SSE bridge callback =====
    // evt = { topic, eventType, data } (Web2SSE) | data trực tiếp. data là tickle:
    // { action, pageId?, convId?, ts } hoặc { resync:true } khi bridge reconnect.
    _onSseEvent(evt) {
        var data = (evt && evt.data) || evt || {};
        // Bridge reconnect → có thể đã miss event lúc mất kết nối → refresh cả 2.
        if (data.resync || (evt && evt.resync)) {
            this._scheduleListRefresh();
            this._scheduleActiveRefresh();
            return;
        }
        var action = data.action;
        if (action === 'new_message') {
            // Tickle bare (không kèm convId) → refresh hội thoại đang mở + danh sách.
            this._scheduleActiveRefresh();
            this._scheduleListRefresh();
        } else if (action === 'update_conversation') {
            var state = window.PancakeState;
            var active = state && state.activeConversation;
            if (active && data.convId && String(active.id) === String(data.convId)) {
                this._scheduleActiveRefresh();
            }
            this._scheduleListRefresh();
        } else if (action === 'tags_updated') {
            if (window.eventBus) window.eventBus.emit('pancake:orderTagsUpdate', data);
        } else {
            // Action lạ/không rõ → an toàn: refresh nhẹ danh sách.
            this._scheduleListRefresh();
        }
    },

    _scheduleActiveRefresh() {
        var self = this;
        clearTimeout(this._msgRefreshTimer);
        this._msgRefreshTimer = setTimeout(function () {
            self._fetchNewMessagesForActive();
        }, 600);
    },

    _scheduleListRefresh() {
        var self = this;
        clearTimeout(this._listRefreshTimer);
        this._listRefreshTimer = setTimeout(async function () {
            var state = window.PancakeState;
            // Đang search → giữ kết quả search, không reload danh sách gốc.
            if (state && state.searchResults) return;
            try {
                await window.PancakeAPI.fetchConversations(true);
                // INCREMENTAL: realtime KH chat tới → reconcile (chèn/dời/patch từng dòng)
                // thay vì rebuild cả cột → hết nhấp nháy + animation "trượt vào" chạy mượt.
                const CL = window.PancakeConversationList;
                if (CL && CL.reconcileConversationList) CL.reconcileConversationList();
                else if (CL && CL.renderConversationList) CL.renderConversationList();
            } catch (_) {}
        }, 1000);
    },

    // ===== Legacy entry points (window 'realtimeConversationUpdate' + caller cũ) =====
    // Trước nhận full conversation object từ WS; nay route sang refresh path.
    _handleUpdateConversation(payload) {
        var conv = (payload && (payload.conversation || payload)) || {};
        var state = window.PancakeState;
        var active = state && state.activeConversation;
        if (active && conv.id && String(active.id) === String(conv.id)) {
            this._scheduleActiveRefresh();
        }
        this._scheduleListRefresh();
    },

    _handleNewMessage() {
        this._scheduleActiveRefresh();
    },

    _handleOrderTagsUpdate(payload) {
        if (window.eventBus) window.eventBus.emit('pancake:orderTagsUpdate', payload);
    },

    // Refetch tin nhắn của hội thoại đang mở qua NGUỒN CHUNG Web2Chat.
    async _fetchNewMessagesForActive() {
        var state = window.PancakeState;
        if (!state || !state.activeConversation) return;
        try {
            var pageId = state.activeConversation.page_id;
            var convId = state.activeConversation.id;
            var customerId =
                state.activeConversation.customers && state.activeConversation.customers[0]
                    ? state.activeConversation.customers[0].id
                    : null;
            var r = await window.Web2Chat.fetchMessages(pageId, convId, customerId);
            if (!r || !r.ok || !Array.isArray(r.messages)) return;
            // Newest-first từ API → oldest-first.
            var fresh = r.messages.slice().reverse();
            // Xoá ext_/temp placeholders trước merge (ext_xxx ≠ real FB id → duplicate).
            var kept = (state.messages || []).filter(function (m) {
                return !String(m.id || '').startsWith('ext_') && !m._temp;
            });
            var known = new Set(
                kept.map(function (m) {
                    return m.id;
                })
            );
            var toAdd = fresh.filter(function (m) {
                return m.id && !known.has(m.id);
            });
            state.messages = kept.concat(toAdd);
            state.messageCurrentCount = state.messages.length;
            window.PancakeChatWindow &&
                window.PancakeChatWindow.renderMessages &&
                window.PancakeChatWindow.renderMessages();
            window.PancakeChatWindow &&
                window.PancakeChatWindow.scrollToBottom &&
                window.PancakeChatWindow.scrollToBottom();
            if (window.PancakeAPI && window.PancakeAPI.markAsRead)
                window.PancakeAPI.markAsRead(pageId, convId);
        } catch (error) {
            console.error('[PK-RT] Fetch new messages error:', error);
        }
    },

    _updateStatusUI(connected) {
        var el = document.getElementById('pkSocketStatus');
        if (!el) return;
        el.innerHTML = connected
            ? '<i data-lucide="wifi" class="pk-socket-icon connected"></i>'
            : '<i data-lucide="wifi-off" class="pk-socket-icon disconnected"></i>';
        el.title = connected ? 'Realtime: Đã kết nối (SSE)' : 'Realtime: Mất kết nối';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },
};

if (typeof window !== 'undefined') {
    window.PancakeRealtime = PancakeRealtime;
}
