// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Live Realtime Manager — TPOS transport NEUTERED (Web 2.0).
 *
 * Trước đây file này mở SSE tới `${proxyBaseUrl}/facebook/comments/stream` (proxy
 * thẳng tới tomato.tpos.vn / chatomni) + WebSocket tới wss://n2store-realtime.onrender.com.
 * Đó là đường realtime comment CŨ của TPOS. Web 2.0 KHÔNG dùng TPOS nữa: comment
 * realtime nay đến qua poller server (pancake.vn) → SSE topic `web2:live-comments`
 * → render incremental trong live-init.js (do agent khác wire).
 *
 * Mọi method TPOS dưới đây giữ lại dưới dạng NO-OP an toàn (idempotent) để bất kỳ
 * caller còn sót lại không throw — KHÔNG mở EventSource / WebSocket nào.
 *
 * Dependencies: (không còn) — chỉ giữ shape cho LiveInit gọi an toàn.
 */

const LiveRealtime = {
    ws: null,
    wsConnected: false,
    wsConnecting: false,

    _sseDisabledLogged: false,

    // =====================================================
    // SSE - Live Comment Stream (DISABLED — Web 2.0 dùng web2:live-comments)
    // =====================================================

    /**
     * NO-OP: TPOS SSE đã tắt. Realtime comment đi qua web2:live-comments (live-init.js).
     */
    startSSE() {
        if (!this._sseDisabledLogged) {
            this._sseDisabledLogged = true;
            console.log('[Live-RT] TPOS SSE disabled — realtime qua web2:live-comments');
        }
        // Không mở EventSource tới /facebook/comments/stream.
    },

    /**
     * NO-OP idempotent: dọn dẹp bất kỳ EventSource cũ nếu vì lý do nào đó còn mở.
     */
    stopSSE() {
        const state = window.LiveState;
        if (!state) return;

        // REWIRE legacy: dừng poller FB Graph (web2-fb-live) nếu còn.
        try {
            window.LiveSource?.stopRealtime();
        } catch {}

        if (state._sseConnections) {
            for (const [, es] of state._sseConnections) {
                try {
                    es.close();
                } catch {}
            }
            state._sseConnections.clear();
        }

        if (state.eventSource) {
            try {
                state.eventSource.close();
            } catch {}
            state.eventSource = null;
        }

        state.sseConnected = false;
    },

    // =====================================================
    // WEBSOCKET - Live Proxy Server Events (DISABLED)
    // =====================================================

    /**
     * NO-OP: WebSocket tới wss://n2store-realtime.onrender.com đã tắt.
     */
    async initializeWebSocket() {
        // Không kết nối WS.
    },

    /**
     * NO-OP: không mở WebSocket.
     */
    connectWebSocket() {
        // Không kết nối WS.
    },

    /**
     * NO-OP idempotent: đóng WS cũ nếu vì lý do nào đó còn mở.
     */
    disconnectWebSocket() {
        if (this.ws) {
            try {
                this.ws.close();
            } catch {}
            this.ws = null;
        }
        this.wsConnected = false;
        this.wsConnecting = false;
    },

    /**
     * NO-OP: handler cũ cho SSE message TPOS — không còn nguồn gọi.
     */
    handleSSEMessage() {
        // Không xử lý — transport TPOS đã tắt.
    },
};

// Export for script-tag usage
if (typeof window !== 'undefined') {
    window.LiveRealtime = LiveRealtime;
}
