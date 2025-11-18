// =====================================================
// PANCAKE WEBSOCKET MANAGER - Kết nối realtime với Pancake.vn
// =====================================================

class PancakeWebSocketManager {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 2000; // Start with 2 seconds
        this.heartbeatInterval = null;
        this.ref = 0; // Message reference counter
        this.joinRef = 0; // Join reference counter
        this.channels = new Map(); // topic -> joinRef mapping
        this.messageCallbacks = new Map(); // topic -> callback function
        this.WS_URL = 'wss://pancake.vn/socket/websocket?vsn=2.0.0';
        this.userId = null;
    }

    /**
     * Get next message reference
     * @returns {number}
     */
    getNextRef() {
        return ++this.ref;
    }

    /**
     * Get next join reference
     * @returns {number}
     */
    getNextJoinRef() {
        return ++this.joinRef;
    }

    /**
     * Get user ID from JWT token
     * @returns {Promise<string|null>}
     */
    async getUserId() {
        if (this.userId) return this.userId;

        if (!window.pancakeTokenManager) {
            console.error('[PANCAKE-WS] PancakeTokenManager not available');
            return null;
        }

        const tokenInfo = window.pancakeTokenManager.getTokenInfo();
        if (!tokenInfo || !tokenInfo.uid) {
            console.error('[PANCAKE-WS] Cannot get user ID from token');
            return null;
        }

        this.userId = tokenInfo.uid;
        console.log('[PANCAKE-WS] User ID:', this.userId);
        return this.userId;
    }

    /**
     * Connect to WebSocket
     * @returns {Promise<boolean>}
     */
    async connect() {
        if (this.isConnected) {
            console.log('[PANCAKE-WS] Already connected');
            return true;
        }

        try {
            // Get JWT token
            if (!window.pancakeTokenManager) {
                console.error('[PANCAKE-WS] PancakeTokenManager not available');
                return false;
            }

            const token = await window.pancakeTokenManager.getToken();
            if (!token) {
                console.error('[PANCAKE-WS] No JWT token available');
                return false;
            }

            console.log('[PANCAKE-WS] Connecting to WebSocket...');

            // Create WebSocket connection
            // Note: Cannot set custom headers in browser WebSocket, token must be in URL or sent after connect
            this.ws = new WebSocket(this.WS_URL);

            // Setup event handlers
            this.ws.onopen = () => this.onOpen();
            this.ws.onclose = (event) => this.onClose(event);
            this.ws.onerror = (error) => this.onError(error);
            this.ws.onmessage = (event) => this.onMessage(event);

            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.error('[PANCAKE-WS] Connection timeout');
                    resolve(false);
                }, 10000);

                this.ws.addEventListener('open', () => {
                    clearTimeout(timeout);
                    resolve(true);
                }, { once: true });

                this.ws.addEventListener('error', () => {
                    clearTimeout(timeout);
                    resolve(false);
                }, { once: true });
            });

        } catch (error) {
            console.error('[PANCAKE-WS] Error connecting:', error);
            return false;
        }
    }

    /**
     * Handle WebSocket open
     */
    onOpen() {
        console.log('[PANCAKE-WS] ✅ WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 2000;

        // Start heartbeat
        this.startHeartbeat();

        // Join channels
        this.joinAllChannels();
    }

    /**
     * Handle WebSocket close
     */
    onClose(event) {
        console.log('[PANCAKE-WS] WebSocket closed:', event.code, event.reason);
        this.isConnected = false;

        // Stop heartbeat
        this.stopHeartbeat();

        // Reconnect if needed
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
            console.log(`[PANCAKE-WS] Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            setTimeout(() => {
                this.connect();
            }, delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[PANCAKE-WS] ❌ Max reconnection attempts reached');
        }
    }

    /**
     * Handle WebSocket error
     */
    onError(error) {
        console.error('[PANCAKE-WS] WebSocket error:', error);
    }

    /**
     * Handle WebSocket message
     */
    onMessage(event) {
        try {
            const message = JSON.parse(event.data);

            // Phoenix message format: [ref, joinRef, topic, event, payload]
            // Or: [null, null, topic, event, payload] for server-initiated messages
            if (!Array.isArray(message) || message.length !== 5) {
                console.warn('[PANCAKE-WS] Invalid message format:', message);
                return;
            }

            const [ref, joinRef, topic, eventName, payload] = message;

            console.log('[PANCAKE-WS] Message received:', { ref, joinRef, topic, eventName, payload });

            // Handle different events
            if (eventName === 'phx_reply') {
                this.handlePhxReply(topic, payload);
            } else if (eventName === 'pages:update_conversation') {
                this.handleUpdateConversation(topic, payload);
            } else if (eventName === 'phx_error') {
                console.error('[PANCAKE-WS] Channel error:', topic, payload);
            } else if (eventName === 'phx_close') {
                console.log('[PANCAKE-WS] Channel closed:', topic);
            } else {
                // Other events - pass to callbacks if registered
                const callback = this.messageCallbacks.get(topic);
                if (callback) {
                    callback(eventName, payload);
                }
            }

        } catch (error) {
            console.error('[PANCAKE-WS] Error parsing message:', error);
        }
    }

    /**
     * Handle phx_reply event (join confirmation)
     */
    handlePhxReply(topic, payload) {
        if (payload.status === 'ok') {
            console.log(`[PANCAKE-WS] ✅ Successfully joined channel: ${topic}`);
        } else {
            console.error(`[PANCAKE-WS] ❌ Failed to join channel: ${topic}`, payload);
        }
    }

    /**
     * Handle pages:update_conversation event (realtime unread update)
     */
    handleUpdateConversation(topic, payload) {
        console.log('[PANCAKE-WS] 🔔 Conversation updated:', payload);

        // Update PancakeDataManager's conversation map
        if (window.pancakeDataManager && payload) {
            // Payload contains updated conversation data
            // Update the conversation in the map
            const conversation = payload;
            if (conversation.from_psid) {
                window.pancakeDataManager.conversationMap.set(conversation.from_psid, conversation);
                console.log(`[PANCAKE-WS] Updated conversation for PSID: ${conversation.from_psid}`);

                // Trigger UI refresh
                this.notifyUIUpdate(conversation);
            }
        }
    }

    /**
     * Notify UI about conversation update
     */
    notifyUIUpdate(conversation) {
        // Dispatch custom event that tab1-orders.js can listen to
        const event = new CustomEvent('pancake-conversation-update', {
            detail: { conversation }
        });
        window.dispatchEvent(event);

        console.log('[PANCAKE-WS] 📢 Dispatched UI update event');
    }

    /**
     * Send message to WebSocket
     * @param {string} topic - Channel topic
     * @param {string} event - Event name
     * @param {Object} payload - Payload data
     */
    send(topic, event, payload = {}) {
        if (!this.isConnected || !this.ws) {
            console.error('[PANCAKE-WS] Cannot send - not connected');
            return;
        }

        const ref = this.getNextRef();
        const joinRef = this.channels.get(topic) || null;
        const message = [ref, joinRef, topic, event, payload];

        console.log('[PANCAKE-WS] Sending:', message);
        this.ws.send(JSON.stringify(message));
    }

    /**
     * Join a channel
     * @param {string} topic - Channel topic
     * @param {Object} payload - Join payload
     */
    join(topic, payload = {}) {
        if (!this.isConnected) {
            console.error('[PANCAKE-WS] Cannot join - not connected');
            return;
        }

        const joinRef = this.getNextJoinRef();
        this.channels.set(topic, joinRef);

        const ref = this.getNextRef();
        const message = [ref, joinRef, topic, 'phx_join', payload];

        console.log('[PANCAKE-WS] Joining channel:', topic);
        this.ws.send(JSON.stringify(message));
    }

    /**
     * Join all required channels
     */
    async joinAllChannels() {
        const userId = await this.getUserId();
        if (!userId) {
            console.error('[PANCAKE-WS] Cannot join channels - no user ID');
            return;
        }

        // Join users channel
        const userTopic = `users:${userId}`;
        this.join(userTopic, {});

        // Join multiple_pages channel
        const pagesTopic = `multiple_pages:${userId}`;
        this.join(pagesTopic, {});

        console.log('[PANCAKE-WS] Joining channels:', [userTopic, pagesTopic]);
    }

    /**
     * Start heartbeat to keep connection alive
     */
    startHeartbeat() {
        this.stopHeartbeat(); // Clear existing interval

        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected && this.ws) {
                // Phoenix expects heartbeat on "phoenix" topic
                this.send('phoenix', 'heartbeat', {});
            }
        }, 30000); // Every 30 seconds

        console.log('[PANCAKE-WS] Heartbeat started');
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            console.log('[PANCAKE-WS] Heartbeat stopped');
        }
    }

    /**
     * Disconnect from WebSocket
     */
    disconnect() {
        console.log('[PANCAKE-WS] Disconnecting...');
        this.shouldReconnect = false;
        this.stopHeartbeat();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.channels.clear();
    }

    /**
     * Register callback for channel messages
     * @param {string} topic - Channel topic
     * @param {Function} callback - Callback function (eventName, payload) => void
     */
    onMessage(topic, callback) {
        this.messageCallbacks.set(topic, callback);
    }

    /**
     * Initialize WebSocket connection
     * @returns {Promise<boolean>}
     */
    async initialize() {
        try {
            console.log('[PANCAKE-WS] Initializing WebSocket manager...');

            // Check if token manager is available
            if (!window.pancakeTokenManager) {
                console.error('[PANCAKE-WS] PancakeTokenManager not available');
                return false;
            }

            // Get token to verify authentication
            const token = await window.pancakeTokenManager.getToken();
            if (!token) {
                console.error('[PANCAKE-WS] No JWT token available - cannot connect');
                return false;
            }

            // Connect
            const connected = await this.connect();
            if (!connected) {
                console.error('[PANCAKE-WS] Failed to connect');
                return false;
            }

            console.log('[PANCAKE-WS] ✅ Initialized successfully');
            return true;

        } catch (error) {
            console.error('[PANCAKE-WS] ❌ Error initializing:', error);
            return false;
        }
    }
}

// Create global instance
window.pancakeWebSocketManager = new PancakeWebSocketManager();
console.log('[PANCAKE-WS] PancakeWebSocketManager loaded');
