/* =====================================================
   REALTIME MANAGER - Pancake Phoenix WebSocket + Polling Fallback
   Exact copy of PancakePhoenixSocket from inbox/js/inbox-chat.js
   Plus polling fallback from n2store-realtime server
   ===================================================== */

console.log('[Realtime] Loading...');

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
        console.log('[PHOENIX] Connecting to', this.url);

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
        console.log('[PHOENIX] Connected, joining channels...');
        this.reconnectAttempts = 0;

        // Join user channel
        this._joinChannel(`users:${this.userId}`, {
            accessToken: this.accessToken, userId: this.userId, platform: 'web'
        });

        // Join multi-page channel
        this._joinChannel(`multiple_pages:${this.userId}`, {
            accessToken: this.accessToken, userId: this.userId,
            clientSession: this.clientSession, pageIds: this.pageIds, platform: 'web'
        });

        this._startHeartbeat();
    }

    _onClose(e) {
        console.log('[PHOENIX] Disconnected, code:', e.code, 'reason:', e.reason);
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
                    console.log('[PHOENIX] Joined:', topic);
                    if (!this.isConnected && this.joinedChannels.size > 0) {
                        this.isConnected = true;
                        this.onStatusChange(true);
                    }
                } else if (payload?.status === 'error') {
                    console.warn('[PHOENIX] Join error:', topic, payload?.response?.reason || payload);
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
            // Start polling fallback when WS fails completely
            if (window.realtimeManager) window.realtimeManager._startPollingFallback();
            return;
        }
        const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000);
        this.reconnectAttempts++;
        console.log(`[PHOENIX] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnect})`);
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
        this.pollingTimer = null;
        this.pollingInterval = 10000; // 10s
        this.lastEventTimestamp = null;
        this.eventHandlers = new Map();
        this.REALTIME_SERVER_URL = 'https://n2store-realtime.onrender.com';
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
                console.log('[Realtime] WebSocket status:', connected ? 'CONNECTED' : 'DISCONNECTED');

                // Dispatch status event for UI
                window.dispatchEvent(new CustomEvent('realtimeStatusChanged', {
                    detail: { connected }
                }));

                // If connected, stop polling fallback
                if (connected && this.pollingTimer) {
                    this._stopPolling();
                }
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
        this._stopPolling();
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

        // Dispatch to registered handlers
        const handlers = this.eventHandlers.get(event) || [];
        for (const handler of handlers) {
            try {
                handler(payload);
            } catch (e) {
                console.error('[Realtime] Handler error for', event, ':', e);
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

    // --- Polling Fallback (when WS fails) ---
    _startPollingFallback() {
        if (this.pollingTimer) return;
        console.log('[Realtime] Starting polling fallback...');
        this.pollingTimer = setInterval(() => this._pollRealtimeServer(), this.pollingInterval);
        this._pollRealtimeServer(); // immediate first poll
    }

    _stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
            console.log('[Realtime] Polling stopped');
        }
    }

    async _pollRealtimeServer() {
        try {
            let url = `${this.REALTIME_SERVER_URL}/api/events?limit=50`;
            if (this.lastEventTimestamp) {
                url += `&since=${new Date(this.lastEventTimestamp).toISOString()}`;
            }

            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return;
            const data = await res.json();

            const events = data.events || [];
            for (const evt of events) {
                // Server stores types without 'pages:' prefix, normalize
                const type = evt.type?.startsWith('pages:') ? evt.type : `pages:${evt.type}`;
                this._handleEvent(type, evt.payload);
            }

            if (events.length > 0) {
                this.lastEventTimestamp = Date.now();
            }
        } catch (e) {
            // Silent fail for polling
        }
    }
}

// =====================================================
// GLOBAL INSTANCE
// =====================================================

window.realtimeManager = new RealtimeManager();
window.PancakePhoenixSocket = PancakePhoenixSocket;

console.log('[Realtime] Loaded.');
