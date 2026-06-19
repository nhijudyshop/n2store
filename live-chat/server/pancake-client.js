// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// PANCAKE WEBSOCKET CLIENT (Phoenix Protocol v2)
// Side-effect-free on require: requiring this module does NOT open any socket.
// new WebSocket(...) only runs inside connect(), which the manager triggers.
// Dependencies (storeEvent, forwardToFallback, broadcastToBrowsers) are injected
// via the constructor so the class has no module-level coupling.
// =====================================================
const WebSocket = require('ws');

class PancakeWebSocketClient {
    constructor(name = 'default', deps = {}) {
        this.name = name;
        // Injected collaborators — owned by the entry/orchestrator.
        this._storeEvent = deps.storeEvent;
        this._forwardToFallback = deps.forwardToFallback;
        this._broadcastToBrowsers = deps.broadcastToBrowsers;

        this.ws = null;
        this.url = 'wss://pancake.vn/socket/websocket?vsn=2.0.0';
        this.isConnected = false;
        this.refCounter = 1;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;

        this.token = null;
        this.userId = null;
        this.pageIds = [];
        this.cookie = null;

        this.connectedAt = null;
        this.eventsReceived = 0;
        this.joinErrors = [];
    }

    tag() {
        return `[WS:${this.name}]`;
    }

    makeRef() {
        return String(this.refCounter++);
    }

    generateClientSession() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 64; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    start(token, userId, pageIds, cookie = null) {
        this.token = token;
        this.userId = userId;
        this.pageIds = pageIds.map((id) => String(id));
        this.cookie = cookie;
        this.reconnectAttempts = 0;
        // Never give up — if we stop reconnecting, the service silently dies
        // (accounts=N, connected=0) and noone notices. Infinity + 60s cap keeps
        // retrying indefinitely but doesn't hammer the upstream.
        this.maxReconnectAttempts = Infinity;
        this.joinErrors = [];
        this.connect();
    }

    stop() {
        clearTimeout(this.reconnectTimer);
        this.stopHeartbeat();
        this.maxReconnectAttempts = 0;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.connectedAt = null;
        console.log(`${this.tag()} Stopped`);
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log(
            `${this.tag()} Connecting... (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`
        );

        const headers = {
            Origin: 'https://pancake.vn',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
        };

        if (this.cookie) {
            headers['Cookie'] = this.cookie;
        }

        this.ws = new WebSocket(this.url, { headers });

        this.ws.on('open', () => {
            console.log(`${this.tag()} Connected!`);
            this.isConnected = true;
            this.connectedAt = new Date().toISOString();
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.joinChannels();
        });

        this.ws.on('close', (code) => {
            console.log(`${this.tag()} Closed (code: ${code})`);
            this.isConnected = false;
            this.connectedAt = null;
            this.stopHeartbeat();

            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                // Exponential backoff capped at 60s — prevents hammering while
                // still retrying indefinitely (maxReconnectAttempts = Infinity).
                const cappedAttempts = Math.min(this.reconnectAttempts, 5);
                const delay = Math.min(2000 * Math.pow(2, cappedAttempts), 60000);
                this.reconnectAttempts++;
                console.log(
                    `${this.tag()} Reconnecting in ${delay / 1000}s... (attempt ${this.reconnectAttempts})`
                );
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else {
                console.error(`${this.tag()} Max reconnect attempts reached.`);
            }
        });

        this.ws.on('error', (err) => {
            console.error(`${this.tag()} Error: ${err.message}`);
        });

        this.ws.on('message', (data) => {
            try {
                this.handleMessage(JSON.parse(data));
            } catch (e) {
                console.error(`${this.tag()} Parse error: ${e.message}`);
            }
        });
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify([null, this.makeRef(), 'phoenix', 'heartbeat', {}]));
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    joinChannels() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const userRef = this.makeRef();
        this.ws.send(
            JSON.stringify([
                userRef,
                userRef,
                `users:${this.userId}`,
                'phx_join',
                { accessToken: this.token, userId: this.userId, platform: 'web' },
            ])
        );
        console.log(`${this.tag()} Joining users:${this.userId}`);

        // PER-PAGE join `pages:{pageId}` thay `multiple_pages:` (2026-06-15).
        // Vì sao: `multiple_pages:` GỘP mọi page vào 1 join — chỉ cần 1 page hết gói
        // cước, Pancake reject CẢ BÓ ("Gói cước hết hạn" / err 122) → 0 comment cho
        // mọi page (bug realtime live-chat: relay eventsReceived=2/giờ). Per-page:
        // page hết hạn chỉ page ĐÓ lỗi 122 (drop), các page còn hạn vẫn nhận
        // `pages:update_conversation` livestream comment. Mirror web2/shared/web2-realtime.js.
        this.joinedPages = new Set();
        for (const pageId of this.pageIds) {
            const ref = this.makeRef();
            this.ws.send(
                JSON.stringify([
                    ref,
                    ref,
                    `pages:${pageId}`,
                    'phx_join',
                    { accessToken: this.token, userId: this.userId, platform: 'web' },
                ])
            );
            this.joinedPages.add(String(pageId));
        }
        console.log(
            `${this.tag()} Joining ${this.pageIds.length} per-page channels: [${this.pageIds.join(', ')}]`
        );
    }

    handleMessage(msg) {
        const [joinRef, ref, topic, event, payload] = msg;

        if (event === 'phx_reply') {
            if (payload.status === 'ok') {
                if (topic.startsWith('users:')) {
                    console.log(`${this.tag()} Joined users channel`);
                } else if (topic.startsWith('pages:')) {
                    // per-page join ok — nhận pages:update_conversation cho page này
                } else if (topic.startsWith('multiple_pages:')) {
                    console.log(`${this.tag()} Joined multiple_pages channel`);
                }
            } else if (payload.status === 'error') {
                const errMsg = JSON.stringify(payload.response || {}).substring(0, 200);
                console.error(`${this.tag()} Join ERROR: topic=${topic} ${errMsg}`);
                this.joinErrors.push({
                    topic,
                    error: payload.response,
                    time: new Date().toISOString(),
                });
                // Per-page hết gói cước (err 122) → page đó rớt, các page khác vẫn chạy.
                if (topic.startsWith('pages:') && this.joinedPages) {
                    this.joinedPages.delete(topic.slice('pages:'.length));
                }
            }
            return;
        }

        if (topic === 'phoenix') return;

        if (event === 'pages:update_conversation') {
            this.eventsReceived++;
            const conv = payload.conversation;
            const stored = this._storeEvent('update_conversation', payload, this.name);

            console.log(`${this.tag()} ========================================`);
            console.log(`${this.tag()} #${stored.id} UPDATE_CONVERSATION`);
            console.log(`  Page:    ${conv.page_id}`);
            console.log(`  Type:    ${conv.type}`);
            console.log(`  From:    ${conv.from?.name || 'unknown'} (${conv.from?.id || ''})`);
            console.log(`  Snippet: ${(conv.snippet || '').substring(0, 100)}`);
            console.log(`  Unread:  ${conv.unread_count || 0}`);
            console.log(`  ConvID:  ${conv.id}`);
            console.log(`  Time:    ${conv.updated_at || stored.timestamp}`);
            if (conv.customers?.length) {
                console.log(`  Customer: ${conv.customers[0].name} (${conv.customers[0].fb_id})`);
            }
            console.log(`${this.tag()} ========================================`);

            // Forward → fallback (realtime push tới browser).
            if (conv.type === 'COMMENT' && conv.post?.type === 'livestream') {
                this._forwardToFallback('/api/web2-live-comments/ingest', {
                    conversations: [conv],
                });
                console.log(`[REALTIME] livestream comment → ingest post=${conv.post_id}`);
            } else {
                this._forwardToFallback('/api/realtime/web2/sse/relay-notify', {
                    key: 'web2:messages',
                    data: {
                        action: 'update_conversation',
                        pageId: conv.page_id,
                        convId: conv.id,
                        ts: Date.now(),
                    },
                });
                // Tee sang browser WS broker (Web2Realtime) — chỉ inbox, không livestream.
                this._broadcastToBrowsers('pages:update_conversation', payload);
            }
            return;
        }

        if (event === 'pages:new_message') {
            this.eventsReceived++;
            this._broadcastToBrowsers('pages:new_message', payload); // tee → browser WS broker
            const message = payload.message || payload;
            const stored = this._storeEvent('new_message', payload, this.name);
            console.log(
                `${this.tag()} #${stored.id} NEW_MESSAGE | from=${message.from?.name || 'unknown'} | "${(message.message || '').substring(0, 80)}"`
            );
            this._forwardToFallback('/api/realtime/web2/sse/relay-notify', {
                key: 'web2:messages',
                data: { action: 'new_message', ts: Date.now() },
            });
            return;
        }

        if (event === 'order:tags_updated' || event === 'tags_updated') {
            this.eventsReceived++;
            this._storeEvent('tags_updated', payload, this.name);
            console.log(`${this.tag()} TAGS_UPDATED: conv=${payload.conversation_id}`);
            return;
        }

        if (event === 'online_status' || event === 'presence_state' || event === 'presence_diff')
            return;

        this.eventsReceived++;
        this._storeEvent(event, payload, this.name);
        console.log(
            `${this.tag()} EVENT: ${event} | keys: ${Object.keys(payload || {}).join(', ')}`
        );
    }

    getStatus() {
        return {
            name: this.name,
            connected: this.isConnected,
            connectedAt: this.connectedAt,
            uptime: this.connectedAt
                ? Math.round((Date.now() - new Date(this.connectedAt).getTime()) / 1000)
                : 0,
            userId: this.userId,
            pageIds: this.pageIds,
            pageCount: this.pageIds.length,
            eventsReceived: this.eventsReceived,
            reconnectAttempts: this.reconnectAttempts,
            wsState: this.ws ? this.ws.readyState : null,
            joinErrors: this.joinErrors,
        };
    }
}

module.exports = { PancakeWebSocketClient };
