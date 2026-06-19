// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// BROWSER-FACING WS BROKER (folded từ n2store-realtime 2026-06-16)
// web2-realtime giờ phục vụ CẢ: (1) relay Pancake→SSE (forwardToFallback — GIỮ
// NGUYÊN) + (2) WS server cho browser (Web2Realtime proxy fallback). KHÔNG mở
// thêm kết nối Pancake — chỉ "tee" event đã nhận sang browser. Hợp đồng client
// (web2/shared/web2-realtime.js): connect wss://<host>/ (no path) → nhận JSON
// { type, payload }. Dedup 30s để 2 account cùng page không bắn trùng.
// Side-effect-free on require: createBrowserBroker(httpServer) is what attaches
// the WS server. The entry calls it AFTER httpServer.listen so requiring this
// module never opens a server.
// =====================================================
const WebSocket = require('ws');

const _B_DEDUP_MS = 30_000;

function createBrowserBroker(httpServer) {
    const browserWss = new WebSocket.Server({ server: httpServer });
    const _bSeen = new Map();

    function _bDedupKey(type, p) {
        if (!type || !p) return null;
        if (type === 'pages:new_message') {
            const m = p.message || {};
            if (m.id) return `nm:${m.id}`;
        }
        if (type === 'pages:update_conversation') {
            const c = p.conversation || {};
            const lm = c.last_message && c.last_message.id;
            if (c.id && lm) return `uc:${c.id}:${lm}`;
            if (c.id) return `uc:${c.id}:${c.updated_at || c.last_sent_at || ''}`;
        }
        return null;
    }

    function broadcastToBrowsers(type, payload) {
        if (!browserWss.clients.size) return;
        const key = _bDedupKey(type, payload);
        if (key) {
            const now = Date.now();
            const last = _bSeen.get(key);
            if (last && now - last < _B_DEDUP_MS) return; // echo multi-account cùng page → bỏ
            _bSeen.set(key, now);
            if (_bSeen.size > 500) {
                for (const [k, t] of _bSeen) if (now - t > _B_DEDUP_MS) _bSeen.delete(k);
            }
        }
        const msg = JSON.stringify({ type, payload });
        browserWss.clients.forEach((c) => {
            if (c.readyState === WebSocket.OPEN) c.send(msg);
        });
    }

    const _browserPing = setInterval(() => {
        browserWss.clients.forEach((ws) => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            try {
                ws.ping();
            } catch {
                /* ignore */
            }
        });
    }, 30_000);

    browserWss.on('connection', (ws) => {
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });
        console.log(`[BROKER-WS] browser connected (total ${browserWss.clients.size})`);
        ws.on('close', () =>
            console.log(`[BROKER-WS] browser disconnected (total ${browserWss.clients.size})`)
        );
    });
    browserWss.on('close', () => clearInterval(_browserPing));

    return { browserWss, broadcastToBrowsers };
}

module.exports = { createBrowserBroker };
