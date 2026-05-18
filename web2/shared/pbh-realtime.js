// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// PBH REALTIME — shared WS client cho PBH/delivery/refund/native-order pages
// =====================================================
// Usage:
//   <script src="../../web2/shared/pbh-realtime.js"></script>
//   <script>
//     PbhRealtime.subscribe({
//       types: ['pbh:created', 'pbh:cancelled', 'pbh:confirmed', 'pbh:printed'],
//       onEvent: (msg) => { console.log('reload trigger', msg); loadList(); }
//     });
//   </script>
//
// Events emitted by backend:
//   native_order:created | native_order:updated | native_order:deleted
//   pbh:created | pbh:cancelled | pbh:confirmed | pbh:printed
//   delivery:created | delivery:pending | delivery:shipping | delivery:delivered | delivery:returned | delivery:cancel
//   refund:created | refund:approved | refund:completed | refund:cancel

(function (global) {
    'use strict';

    const WS_URL = 'wss://n2store-fallback.onrender.com';
    const subscribers = []; // { types, onEvent, debounceMs, _timer }

    let ws = null;
    let reconnectAttempts = 0;
    let reconnectTimer = null;

    function connect() {
        if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
        try {
            ws = new WebSocket(WS_URL);
        } catch (e) {
            console.warn('[PbhRealtime] WS create failed:', e.message);
            return scheduleReconnect();
        }
        ws.onopen = () => {
            reconnectAttempts = 0;
            console.log('[PbhRealtime] ✓ WS connected');
        };
        ws.onclose = () => {
            console.log('[PbhRealtime] WS closed → schedule reconnect');
            scheduleReconnect();
        };
        ws.onerror = (e) => console.warn('[PbhRealtime] WS error', e);
        ws.onmessage = (evt) => {
            let msg;
            try {
                msg = JSON.parse(evt.data);
            } catch {
                return;
            }
            if (!msg || !msg.type) return;
            for (const sub of subscribers) {
                if (!sub.types.includes(msg.type)) continue;
                if (sub.debounceMs > 0) {
                    if (sub._timer) clearTimeout(sub._timer);
                    sub._timer = setTimeout(() => {
                        try {
                            sub.onEvent(msg);
                        } catch (e) {
                            console.error('[PbhRealtime] handler error', e);
                        }
                    }, sub.debounceMs);
                } else {
                    try {
                        sub.onEvent(msg);
                    } catch (e) {
                        console.error('[PbhRealtime] handler error', e);
                    }
                }
            }
        };
    }

    function scheduleReconnect() {
        if (reconnectTimer) return;
        const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts++));
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, delay);
    }

    /**
     * Subscribe to realtime events.
     * @param {{ types: string[], onEvent: (msg: object) => void, debounceMs?: number }} opts
     * @returns {{ unsubscribe: () => void }}
     */
    function subscribe(opts) {
        if (!opts || !Array.isArray(opts.types) || typeof opts.onEvent !== 'function') {
            throw new Error('PbhRealtime.subscribe requires { types: string[], onEvent: fn }');
        }
        const sub = {
            types: opts.types,
            onEvent: opts.onEvent,
            debounceMs: opts.debounceMs ?? 500,
            _timer: null,
        };
        subscribers.push(sub);
        connect();
        return {
            unsubscribe() {
                const i = subscribers.indexOf(sub);
                if (i >= 0) subscribers.splice(i, 1);
                if (sub._timer) clearTimeout(sub._timer);
            },
        };
    }

    global.PbhRealtime = { subscribe };
})(window);
