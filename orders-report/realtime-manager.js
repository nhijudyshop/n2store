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

            if (isRealtime && source === 'pancake') {
                if (mode === 'browser') {
                    this.connect();
                } else {
                    this.disconnect(); // Disconnect browser WS if switching to server mode
                    this.connectServerMode(); // Placeholder for server mode logic
                }
            } else {
                this.disconnect();
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
     * Connect via Server Mode
     */
    async connectServerMode() {
        console.log('[REALTIME] Server Mode Active. Requesting backend to start WebSocket...');

        // Get dependencies
        if (!window.pancakeTokenManager || !window.pancakeDataManager) {
            console.warn('[REALTIME] Dependencies not ready, retrying in 1s...');
            setTimeout(() => this.connectServerMode(), 1000);
            return;
        }

        const token = await window.pancakeTokenManager.getToken();
        const tokenInfo = window.pancakeTokenManager.getTokenInfo();
        const userId = tokenInfo ? tokenInfo.uid : null;

        if (window.pancakeDataManager.pageIds.length === 0) {
            await window.pancakeDataManager.fetchPages();
        }
        const pageIds = window.pancakeDataManager.pageIds;

        if (!token || !userId) {
            console.error('[REALTIME] Missing token or userId for Server Mode');
            return;
        }

        // Construct cookie string from token
        // Note: Pancake might require other cookies like _fbp, but jwt is the most critical.
        // If the user provided a full cookie string in settings, we should use that, but currently we only store the token.
        const cookie = `jwt=${token}`;

        // Call Render Server API
        // Assuming the server is running at the configured endpoint or fallback
        const serverBaseUrl = 'https://n2store-fallback.onrender.com';
        const serverUrl = `${serverBaseUrl}/api/realtime/start`;

        try {
            console.log('[REALTIME] Sending start request to server:', serverUrl);
            const response = await fetch(serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token,
                    userId,
                    pageIds,
                    cookie // Pass cookie to server
                })
            });

            const data = await response.json();
            if (data.success) {
                console.log('[REALTIME] Server successfully started WebSocket client');
                if (window.notificationManager) {
                    window.notificationManager.show('✅ Server đã bắt đầu nhận tin nhắn 24/7', 'success');
                }

                // Connect to Proxy WebSocket to receive updates
                const wsUrl = serverBaseUrl.replace('https', 'wss').replace('http', 'ws');
                this.connectToProxyServer(wsUrl);

            } else {
                console.error('[REALTIME] Server failed to start:', data.error);
                if (window.notificationManager) {
                    window.notificationManager.show('❌ Server khởi động thất bại: ' + data.error, 'error');
                }
            }
        } catch (error) {
            console.error('[REALTIME] Error calling server:', error);
            if (window.notificationManager) {
                window.notificationManager.show('❌ Không thể kết nối tới Server', 'error');
            }
        }
    }

    /**
     * Connect to Proxy Server WebSocket
     */
    connectToProxyServer(url) {
        if (this.proxyWs) {
            this.proxyWs.close();
        }

        console.log('[REALTIME] Connecting to Proxy Server:', url);
        this.proxyWs = new WebSocket(url);

        this.proxyWs.onopen = () => {
            console.log('[REALTIME] Connected to Proxy Server');
            this.isConnected = true; // Mark as connected for UI
        };

        this.proxyWs.onclose = () => {
            console.log('[REALTIME] Disconnected from Proxy Server');
            this.isConnected = false;
            // Auto reconnect logic could go here
        };

        this.proxyWs.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'pages:update_conversation') {
                    console.log('[REALTIME] Received update from Proxy:', data.payload);
                    this.handleUpdateConversation(data.payload);
                }
            } catch (e) {
                console.error('[REALTIME] Error parsing proxy message:', e);
            }
        };
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
                this.startHeartbeat();
                this.joinChannels();
            };

            this.ws.onclose = (e) => {
                console.log('[REALTIME] WebSocket Closed', e.code, e.reason);
                this.isConnected = false;
                this.stopHeartbeat();

                // Reconnect if still in realtime mode
                if (window.chatAPISettings &&
                    window.chatAPISettings.isRealtimeEnabled() &&
                    window.chatAPISettings.isPancake()) {
                    console.log('[REALTIME] Reconnecting in 5s...');
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = setTimeout(() => this.connect(), 5000);
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

        this.isConnected = false;
    }

    /**
     * Send Heartbeat to keep connection alive
     */
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const ref = this.makeRef();
                // Phoenix heartbeat: ["ref", "ref", "phoenix", "heartbeat", {}]
                this.ws.send(JSON.stringify([ref, ref, "phoenix", "heartbeat", {}]));
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
                pageIds: this.pageIds,
                platform: "web"
            }
        ];
        this.ws.send(JSON.stringify(pagesJoinMsg));
        console.log('[REALTIME] Joining multiple_pages channel...');
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
}

// Create global instance
window.realtimeManager = new RealtimeManager();
console.log('[REALTIME] RealtimeManager loaded');
