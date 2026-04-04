// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   REALTIME MANAGER - Pancake Phoenix WebSocket + Polling Fallback
   Exact copy of PancakePhoenixSocket from inbox/js/inbox-chat.js
   Plus polling fallback from n2store-realtime server
   ===================================================== */

// =====================================================
// PANCAKE PHOENIX WEBSOCKET
// =====================================================

class PancakePhoenixSocket {
    constructor({ accessToken, userId, pageIds, onEvent, onStatusChange }) {
        this.url = 'wss://chatomni-proxy.nhijudyshop.workers.dev/ws/pancake?vsn=2.0.0';
        this.accessToken = accessToken;
        this.userId = userId;
        this.pageIds = pageIds;
        this.onEvent = onEvent;
        this.onStatusChange = onStatusChange;

        this.ws = null;
        this.ref = 0;
        this.heartbeatTimer = null;
        this.heartbeatTimeout = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnect = 10;
        this.isConnected = false;
        this.joinedChannels = new Set();

        this.clientSession = crypto.getRandomValues(new Uint8Array(32))
            .reduce((s, b) => s + b.toString(36).padStart(2, '0'), '').slice(0, 64);
    }

    connect() {
        if (this.ws) this.disconnect();

        try {
            this.ws = new WebSocket(this.url);
            this.ws.onopen = () => this._onOpen();
            this.ws.onclose = (e) => this._onClose(e);
            this.ws.onmessage = (e) => this._onMessage(e);
            this.ws.onerror = (e) => console.error('[PHOENIX] WS error:', e);
        } catch (e) {
            console.error('[PHOENIX] Connect error:', e);
            this._scheduleReconnect();
        }
    }

    disconnect() {
        this._stopHeartbeat();
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onclose = null;
            this.ws.onmessage = null;
            this.ws.onerror = null;
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.joinedChannels.clear();
        this.onStatusChange(false);
    }

    _onOpen() {
        console.log('[PHOENIX] ✅ WebSocket connected to Pancake');
        this.reconnectAttempts = 0;

        // Join user channel
        this._joinChannel(`users:${this.userId}`, {
            accessToken: this.accessToken, userId: this.userId, platform: 'web'
        });

        // Join multi-page channel
        console.log(`[PHOENIX] Joining channels for userId=${this.userId}, ${this.pageIds.length} pages: [${this.pageIds.join(', ')}]`);
        this._allPageIds = [...this.pageIds]; // Save for retry logic
        this._retryIndex = 0;
        this._retryExhausted = false;
        this._joinChannel(`multiple_pages:${this.userId}`, {
            accessToken: this.accessToken, userId: this.userId,
            clientSession: this.clientSession, pageIds: this.pageIds, platform: 'web'
        });

        this._startHeartbeat();
    }

    _onClose(e) {
        console.warn(`[PHOENIX] ❌ WebSocket closed: code=${e.code}, reason=${e.reason || 'none'}`);
        this.isConnected = false;
        this.joinedChannels.clear();
        this._stopHeartbeat();
        this.onStatusChange(false);
        this._scheduleReconnect();
    }

    _onMessage(e) {
        try {
            const data = JSON.parse(e.data);
            if (!Array.isArray(data) || data.length < 5) return;
            const [joinRef, ref, topic, event, payload] = data;

            // Heartbeat reply
            if (event === 'phx_reply') {
                if (topic === 'phoenix') {
                    if (this.heartbeatTimeout) { clearTimeout(this.heartbeatTimeout); this.heartbeatTimeout = null; }
                    return;
                }
                // Channel join reply
                if (payload?.status === 'ok') {
                    this.joinedChannels.add(topic);
                    console.log(`[PHOENIX] ✅ Joined channel: ${topic}`);
                    if (!this.isConnected && this.joinedChannels.size > 0) {
                        this.isConnected = true;
                        this.onStatusChange(true);
                        console.log('[PHOENIX] 🟢 Realtime READY — listening for messages');
                    }
                } else if (payload?.status === 'error') {
                    const reason = payload?.response?.message || payload?.response?.reason || JSON.stringify(payload?.response);
                    console.error(`[PHOENIX] ❌ Join FAILED: ${topic} — ${reason}`);

                    // If multiple_pages join failed, retry removing one page at a time
                    if (topic.startsWith('multiple_pages:') && this._allPageIds && !this._retryExhausted) {
                        this._retryIndex = (this._retryIndex || 0) + 1;
                        if (this._retryIndex <= this._allPageIds.length) {
                            // Try without page at current retry index (0-based: skip index retryIndex-1)
                            const skipIdx = this._retryIndex - 1;
                            const retryPages = this._allPageIds.filter((_, i) => i !== skipIdx);
                            console.warn(`[PHOENIX] 🔄 Retry ${this._retryIndex}/${this._allPageIds.length}: without page ${this._allPageIds[skipIdx]} → [${retryPages.join(', ')}]`);
                            this.pageIds = retryPages;
                            this._joinChannel(`multiple_pages:${this.userId}`, {
                                accessToken: this.accessToken, userId: this.userId,
                                clientSession: this.clientSession, pageIds: retryPages, platform: 'web'
                            });
                        } else {
                            this._retryExhausted = true;
                            console.error('[PHOENIX] ❌ All page combinations failed. Check Pancake subscription.');
                        }
                    }
                }
                return;
            }

            if (event === 'phx_error') { this.joinedChannels.delete(topic); return; }
            if (event === 'phx_close') { this.joinedChannels.delete(topic); return; }

            // Dispatch real event
            if (this.onEvent) this.onEvent(event, payload);
        } catch (e) {
            console.error('[PHOENIX] Message parse error:', e);
        }
    }

    _joinChannel(topic, payload) {
        const joinRef = String(++this.ref);
        this._send([joinRef, joinRef, topic, 'phx_join', payload]);
    }

    _send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    _startHeartbeat() {
        this._stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            const ref = String(++this.ref);
            this._send([null, ref, 'phoenix', 'heartbeat', {}]);
            this.heartbeatTimeout = setTimeout(() => {
                console.warn('[PHOENIX] Heartbeat timeout, closing...');
                if (this.ws) this.ws.close();
            }, 10000);
        }, 30000);
    }

    _stopHeartbeat() {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
        if (this.heartbeatTimeout) { clearTimeout(this.heartbeatTimeout); this.heartbeatTimeout = null; }
    }

    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnect) {
            console.warn('[PHOENIX] Max reconnect attempts reached');
            this.onStatusChange(false);
            // WS failed completely - no polling fallback (server endpoint removed)
            return;
        }
        const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000);
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }
}

// =====================================================
// REALTIME MANAGER - Orchestrates WS + Polling
// =====================================================

class RealtimeManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.lastEventTimestamp = null;
        this.eventHandlers = new Map();
    }

    /**
     * Initialize WebSocket connection to Pancake
     * @param {Object} options - { accessToken, userId, pageIds }
     */
    async initWebSocket({ accessToken, userId, pageIds }) {
        if (this.socket) this.socket.disconnect();

        this.socket = new PancakePhoenixSocket({
            accessToken,
            userId,
            pageIds,
            onEvent: (event, payload) => this._handleEvent(event, payload),
            onStatusChange: (connected) => {
                this.isConnected = connected;

                // Dispatch status event for UI
                window.dispatchEvent(new CustomEvent('realtimeStatusChanged', {
                    detail: { connected }
                }));

                // WebSocket status changed
            }
        });

        this.socket.connect();
        return true;
    }

    /**
     * Disconnect everything
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
    }

    /**
     * Register event handler
     * @param {string} eventType - e.g. 'pages:new_message', 'pages:update_conversation'
     * @param {Function} handler - callback(payload)
     */
    on(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    /**
     * Remove event handler
     */
    off(eventType, handler) {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
            const idx = handlers.indexOf(handler);
            if (idx >= 0) handlers.splice(idx, 1);
        }
    }

    // --- Internal: Handle WebSocket event ---
    _handleEvent(event, payload) {
        this.lastEventTimestamp = Date.now();
        // Log important events (skip noisy ones)
        if (event.includes('message') || event.includes('conversation')) {
            const snippet = payload?.conversation?.snippet || payload?.message?.message || '';
            console.log(`[PHOENIX] 📨 Event: ${event}`, snippet ? `"${snippet.substring(0, 50)}"` : '');
        }

        // Dispatch to registered handlers for exact event name
        const handlers = this.eventHandlers.get(event) || [];
        for (const handler of handlers) {
            try {
                handler(payload);
            } catch (e) {
                console.error('[Realtime] Handler error for', event, ':', e);
            }
        }

        // Also dispatch with 'pages:' prefix for compatibility
        // Pancake Phoenix sends 'new_message' but handlers register for 'pages:new_message'
        if (!event.startsWith('pages:')) {
            const prefixed = `pages:${event}`;
            const prefixedHandlers = this.eventHandlers.get(prefixed) || [];
            for (const handler of prefixedHandlers) {
                try {
                    handler(payload);
                } catch (e) {
                    console.error('[Realtime] Handler error for', prefixed, ':', e);
                }
            }
        }

        // Also dispatch wildcard handlers
        const wildcard = this.eventHandlers.get('*') || [];
        for (const handler of wildcard) {
            try {
                handler(event, payload);
            } catch (e) {
                console.error('[Realtime] Wildcard handler error:', e);
            }
        }
    }

    /**
     * Initialize - called by tab1-init.js after page load
     * Sets up event listeners for chat realtime updates
     */
    initialize() {
    }

    /**
     * Connect via server mode (legacy - polling endpoint removed)
     * Kept as no-op for backward compatibility with callers
     */
    connectServerMode() {
        // Polling to n2store-realtime server removed (endpoint no longer exists)
        // Realtime now uses WebSocket only (initWebSocket)
    }
}

// =====================================================
// GLOBAL INSTANCE
// =====================================================

window.realtimeManager = new RealtimeManager();
window.PancakePhoenixSocket = PancakePhoenixSocket;

