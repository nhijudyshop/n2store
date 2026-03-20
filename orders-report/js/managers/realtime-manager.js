// =====================================================
// REALTIME MANAGER - Quản lý WebSocket Realtime
// =====================================================

class RealtimeManager {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.refCounter = 1;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.url = "wss://pancake.vn/socket/websocket?vsn=2.0.0";
        this.userId = null;
        this.token = null;
        this.pageIds = [];
        this.isConnecting = false;

        // Exponential backoff for WebSocket reconnection
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.baseReconnectDelay = 2000; // 2s
        this.maxReconnectDelay = 60000; // 60s

        // Server mode REST polling
        this.pollingInterval = null;
        this.lastEventTimestamp = null;
        this.consecutiveErrors = 0;
        this.currentPollInterval = 5000; // Adaptive: starts at 5s
    }

    /**
     * Initialize and connect if mode is realtime
     */
    async initialize() {
        // Listen for mode changes
        window.addEventListener('chatApiSourceChanged', (e) => {
            const isRealtime = e.detail.realtime;
            const source = e.detail.source;
            const mode = e.detail.realtimeMode || 'browser';

            // Always disconnect existing connections first to prevent duplicates
            this.disconnect();

            if (isRealtime && source === 'pancake') {
                if (mode === 'browser') {
                    this.connect();
                } else {
                    this.connectServerMode();
                }
            }
        });

        // Check current mode
        if (window.chatAPISettings &&
            window.chatAPISettings.isRealtimeEnabled() &&
            window.chatAPISettings.isPancake()) {

            const mode = window.chatAPISettings.getRealtimeMode();
            if (mode === 'browser') {
                await this.connect();
            } else {
                this.connectServerMode();
            }
        }
    }

    /**
     * Manual Connect Trigger
     */
    async manualConnect() {
        const mode = window.chatAPISettings ? window.chatAPISettings.getRealtimeMode() : 'browser';
        console.log(`[REALTIME] Manual connect triggered for mode: ${mode}`);

        if (window.notificationManager) {
            window.notificationManager.show('🔄 Đang kết nối lại...', 'info');
        }

        if (mode === 'browser') {
            this.disconnect();
            await this.connect();
        } else {
            // Server modes
            this.disconnect();
            await this.connectServerMode();
        }
    }

    /**
     * Connect via Server Mode (REST Polling)
     * tpos-pancake server auto-connects to Pancake WS on startup via Firebase tokens.
     * Frontend polls GET /api/events for new events.
     */
    async connectServerMode() {
        if (this.isConnected || this.isConnecting) {
            console.log('[REALTIME] Already connected or connecting to Server Mode.');
            return;
        }

        console.log('[REALTIME] Server Mode Active. Starting REST polling...');
        this.isConnecting = true;

        // Determine server base URL
        // Default to Cloudflare Worker proxy to avoid CORS
        let serverBaseUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const mode = window.chatAPISettings ? window.chatAPISettings.getRealtimeMode() : 'server';
        if (mode === 'localhost') {
            serverBaseUrl = 'http://localhost:3000';
        }

        try {
            // Check server status first
            const statusUrl = mode === 'localhost'
                ? `${serverBaseUrl}/api/status`
                : `${serverBaseUrl}/api/realtime/status`;

            console.log('[REALTIME] Checking server status:', statusUrl);
            const response = await fetch(statusUrl);
            const data = await response.json();

            const connected = data.connectedClients || 0;
            const total = data.totalClients || 0;

            if (connected > 0) {
                console.log(`[REALTIME] Server alive: ${connected}/${total} accounts connected`);
                if (window.notificationManager) {
                    window.notificationManager.show(
                        `✅ Server đang chạy (${connected}/${total} accounts kết nối)`, 'success'
                    );
                }
            } else {
                console.warn('[REALTIME] Server alive but no accounts connected');
                if (window.notificationManager) {
                    window.notificationManager.show(
                        '⚠️ Server đang chạy nhưng chưa có account kết nối', 'warning'
                    );
                }
            }

            // Start REST polling for events
            this.startServerPolling(serverBaseUrl, mode);
            this.isConnected = true;
            this.consecutiveErrors = 0;
            this._dispatchStatusEvent(true);

        } catch (error) {
            console.error('[REALTIME] Error connecting to server:', error);
            if (window.notificationManager) {
                window.notificationManager.show('❌ Không thể kết nối tới Server', 'error');
            }
        } finally {
            this.isConnecting = false;
        }
    }

    /**
     * Start REST polling for server events (adaptive interval)
     */
    startServerPolling(serverBaseUrl, mode) {
        // Clear any existing polling
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        // Track last event timestamp for incremental fetching
        this.lastEventTimestamp = new Date().toISOString();
        this.currentPollInterval = 5000; // Reset to base interval

        this._serverEventsUrl = mode === 'localhost'
            ? `${serverBaseUrl}/api/events`
            : `${serverBaseUrl}/api/realtime/events`;

        console.log('[REALTIME] Starting adaptive REST polling (5-30s):', this._serverEventsUrl);

        // Poll immediately once, then schedule adaptive polling
        this.pollServerEvents(this._serverEventsUrl);
        this._scheduleNextPoll();
    }

    /**
     * Schedule next poll with adaptive interval
     */
    _scheduleNextPoll() {
        if (this.pollingInterval) clearTimeout(this.pollingInterval);
        this.pollingInterval = setTimeout(() => {
            this.pollServerEvents(this._serverEventsUrl);
            this._scheduleNextPoll();
        }, this.currentPollInterval);
    }

    /**
     * Poll server for new events since last timestamp
     */
    async pollServerEvents(eventsUrl) {
        try {
            const url = `${eventsUrl}?since=${encodeURIComponent(this.lastEventTimestamp)}&limit=50`;
            const response = await fetch(url);

            if (!response.ok) {
                this.consecutiveErrors++;
                console.warn(`[REALTIME] Poll failed (${this.consecutiveErrors}):`, response.status);

                // After 5 consecutive errors, show notification and stop polling
                if (this.consecutiveErrors >= 5) {
                    console.error('[REALTIME] Too many poll errors, stopping...');
                    this.disconnect();
                    if (window.notificationManager) {
                        window.notificationManager.show('❌ Mất kết nối Server, đã dừng polling', 'error');
                    }
                }
                return;
            }

            this.consecutiveErrors = 0;
            const data = await response.json();
            const events = data.events || data || [];

            // Adaptive polling: speed up when events found, slow down when quiet
            if (events.length > 0) {
                this.currentPollInterval = 5000; // Reset to 5s when events arrive
            } else {
                this.currentPollInterval = Math.min(this.currentPollInterval * 2, 30000); // Double up to 30s max
            }

            if (events.length > 0) {
                console.log(`[REALTIME] Received ${events.length} events from server`);

                for (const event of events) {
                    // Update last timestamp for incremental fetching
                    if (event.timestamp && event.timestamp > this.lastEventTimestamp) {
                        this.lastEventTimestamp = event.timestamp;
                    }

                    // Process based on event type
                    if (event.type === 'update_conversation' || event.type === 'pages:update_conversation') {
                        this.handleUpdateConversation(event.payload);
                    } else if (event.type === 'tags_updated' || event.type === 'order:tags_updated') {
                        this.handleOrderTagsUpdate(event.payload);
                    }
                }
            }
        } catch (error) {
            this.consecutiveErrors++;
            console.warn(`[REALTIME] Poll error (${this.consecutiveErrors}):`, error.message);

            if (this.consecutiveErrors >= 5) {
                console.error('[REALTIME] Too many poll errors, stopping...');
                this.disconnect();
                if (window.notificationManager) {
                    window.notificationManager.show('❌ Mất kết nối Server, đã dừng polling', 'error');
                }
            }
        }
    }

    /**
     * Generate a unique reference ID
     */
    makeRef() {
        return String(this.refCounter++);
    }

    /**
     * Generate a random client session ID
     */
    generateClientSession() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Connect to WebSocket
     */
    async connect() {
        if (this.isConnected || (this.ws && this.ws.readyState === WebSocket.CONNECTING)) {
            console.log('[REALTIME] Already connected or connecting');
            return;
        }

        try {
            console.log('[REALTIME] Connecting...');

            // Get dependencies
            if (!window.pancakeTokenManager || !window.pancakeDataManager) {
                console.warn('[REALTIME] Dependencies not ready, retrying in 1s...');
                setTimeout(() => this.connect(), 1000);
                return;
            }

            // Get Token
            this.token = await window.pancakeTokenManager.getToken();
            if (!this.token) {
                console.error('[REALTIME] No token found. Cannot connect.');
                return;
            }

            // Get User ID
            const tokenInfo = window.pancakeTokenManager.getTokenInfo();
            this.userId = tokenInfo ? tokenInfo.uid : null;
            if (!this.userId) {
                console.error('[REALTIME] No User ID found in token.');
                return;
            }

            // Get Page IDs
            // Ensure pages are fetched
            if (window.pancakeDataManager.pageIds.length === 0) {
                await window.pancakeDataManager.fetchPages();
            }
            this.pageIds = window.pancakeDataManager.pageIds;

            // Open WebSocket
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('[REALTIME] WebSocket Connected');
                this.isConnected = true;
                this.reconnectAttempts = 0; // Reset on successful connect
                this.startHeartbeat();
                this.joinChannels();
                this._dispatchStatusEvent(true);
            };

            this.ws.onclose = (e) => {
                console.log('[REALTIME] WebSocket Closed', e.code, e.reason);
                this.isConnected = false;
                this.stopHeartbeat();
                this._dispatchStatusEvent(false);

                // Reconnect with exponential backoff if still in realtime mode
                if (window.chatAPISettings &&
                    window.chatAPISettings.isRealtimeEnabled() &&
                    window.chatAPISettings.isPancake()) {

                    this.reconnectAttempts++;
                    if (this.reconnectAttempts > this.maxReconnectAttempts) {
                        console.error(`[REALTIME] Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
                        window.dispatchEvent(new CustomEvent('realtimeConnectionLost'));
                        return;
                    }

                    const delay = Math.min(
                        this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
                        this.maxReconnectDelay
                    );
                    console.log(`[REALTIME] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = setTimeout(() => this.connect(), delay);
                }
            };

            this.ws.onerror = (error) => {
                console.error('[REALTIME] WebSocket Error:', error);
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };

        } catch (error) {
            console.error('[REALTIME] Connection error:', error);
        }
    }

    /**
     * Dispatch realtime status change event for UI indicators
     */
    _dispatchStatusEvent(connected) {
        window.dispatchEvent(new CustomEvent('realtimeStatusChanged', {
            detail: { connected }
        }));
    }

    /**
     * Disconnect WebSocket
     */
    disconnect() {
        if (this.ws) {
            console.log('[REALTIME] Disconnecting Browser WS...');
            this.ws.close();
            this.ws = null;
            this.stopHeartbeat();
        }

        if (this.proxyWs) {
            console.log('[REALTIME] Disconnecting Proxy WS...');
            this.proxyWs.close();
            this.proxyWs = null;
        }

        if (this.pollingInterval) {
            console.log('[REALTIME] Stopping REST polling...');
            clearTimeout(this.pollingInterval);
            this.pollingInterval = null;
        }

        this.isConnected = false;
        this.consecutiveErrors = 0;
        this._dispatchStatusEvent(false);
    }

    /**
     * Send Heartbeat to keep connection alive
     */
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const ref = this.makeRef();
                // Phoenix heartbeat: [null, ref, "phoenix", "heartbeat", {}]
                this.ws.send(JSON.stringify([null, ref, "phoenix", "heartbeat", {}]));
            }
        }, 30000); // 30s
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Join required channels
     */
    joinChannels() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // 1. Join User Channel
        // ["ref", "ref", "users:UID", "phx_join", {accessToken, userId, platform: "web"}]
        const userRef = this.makeRef();
        const userJoinMsg = [
            userRef,
            userRef,
            `users:${this.userId}`,
            "phx_join",
            {
                accessToken: this.token,
                userId: this.userId,
                platform: "web"
            }
        ];
        this.ws.send(JSON.stringify(userJoinMsg));
        console.log('[REALTIME] Joining users channel...');

        // 2. Join Multiple Pages Channel
        // ["ref", "ref", "multiple_pages:UID", "phx_join", {accessToken, userId, clientSession, pageIds, platform: "web"}]
        const pagesRef = this.makeRef();
        const pagesJoinMsg = [
            pagesRef,
            pagesRef,
            `multiple_pages:${this.userId}`,
            "phx_join",
            {
                accessToken: this.token,
                userId: this.userId,
                clientSession: this.generateClientSession(),
                pageIds: this.pageIds.map(id => String(id)), // Ensure strings
                platform: "web"
            }
        ];
        this.ws.send(JSON.stringify(pagesJoinMsg));
        console.log('[REALTIME] Joining multiple_pages channel...');

        // 3. Get Online Status (Mimic browser)
        setTimeout(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            const statusRef = this.makeRef();
            const statusMsg = [
                pagesRef, statusRef, `multiple_pages:${this.userId}`, "get_online_status", {}
            ];
            this.ws.send(JSON.stringify(statusMsg));
        }, 1000);
    }

    /**
     * Handle incoming messages
     */
    handleMessage(data) {
        try {
            const msg = JSON.parse(data);
            // Msg format: [joinRef, ref, topic, event, payload]
            const [joinRef, ref, topic, event, payload] = msg;

            // console.log('[REALTIME] Msg:', event, topic);

            if (event === 'phx_reply') {
                if (payload.status === 'ok') {
                    // console.log('[REALTIME] Join/Push success:', topic);
                } else {
                    console.warn('[REALTIME] Join/Push error:', payload);
                }
            } else if (event === 'pages:update_conversation') {
                this.handleUpdateConversation(payload);
            } else if (event === 'order:tags_updated') {
                this.handleOrderTagsUpdate(payload);
            } else if (event === 'online_status') {
                // Handle online status if needed
            }

        } catch (error) {
            console.error('[REALTIME] Error parsing message:', error);
        }
    }

    /**
     * Handle conversation update
     */
    handleUpdateConversation(payload) {
        console.log('[REALTIME] Update Conversation:', payload);

        const conversation = payload.conversation;
        if (!conversation) return;

        // Dispatch event for UI to update
        const event = new CustomEvent('realtimeConversationUpdate', {
            detail: conversation
        });
        window.dispatchEvent(event);

        // Show notification if it's a new message
        if (conversation.snippet && !conversation.seen) {
            // Optional: Toast notification
            // console.log('New message:', conversation.snippet);
        }
    }

    /**
     * Handle order tags update from WebSocket
     * Payload format: { orderId, orderCode, STT, tags, updatedBy, timestamp }
     */
    handleOrderTagsUpdate(payload) {
        console.log('[REALTIME] Order Tags Updated:', payload);

        const { orderId, tags, updatedBy, orderCode, STT } = payload;
        if (!orderId || !tags) return;

        // Dispatch event for UI to update
        const event = new CustomEvent('realtimeOrderTagsUpdate', {
            detail: {
                orderId,
                orderCode,
                STT,
                tags,
                updatedBy,
                timestamp: payload.timestamp || Date.now()
            }
        });
        window.dispatchEvent(event);

        console.log(`[REALTIME] Tag update dispatched for order ${orderCode} (STT: ${STT})`);
    }
}

// Export class and create global instance
window.RealtimeManager = RealtimeManager;
window.realtimeManager = new RealtimeManager();
console.log('[REALTIME] RealtimeManager loaded');
