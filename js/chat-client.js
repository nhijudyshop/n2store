// =====================================================
// N2STORE CHAT CLIENT
// Frontend client for internal chat system
// =====================================================

class ChatClient {
    constructor(config = {}) {
        // Server URLs - Use Cloudflare Worker proxy for CORS bypass
        this.serverUrl = config.serverUrl || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        this.wsUrl = config.wsUrl || 'wss://n2store-api-fallback.onrender.com';

        // State
        this.ws = null;
        this.authData = null;
        this.userId = null;
        this.connected = false;
        this.authenticated = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;

        // Callbacks (can be overridden)
        this.onNewMessage = null;
        this.onUserTyping = null;
        this.onUserStoppedTyping = null;
        this.onUserStatus = null;
        this.onConnected = null;
        this.onDisconnected = null;
        this.onError = null;

        console.log('[CHAT-CLIENT] Initialized');
    }

    // =====================================================
    // INITIALIZATION & CONNECTION
    // =====================================================

    /**
     * Initialize chat client
     * Must be called after user is authenticated
     */
    async init() {
        try {
            // Get auth data from authManager
            if (!window.authManager || !authManager.isAuthenticated()) {
                throw new Error('User not authenticated. Please login first.');
            }

            this.authData = authManager.getUserInfo();
            this.userId = authManager.getUserId();

            if (!this.userId) {
                throw new Error('No userId found. Please re-login to generate userId.');
            }

            console.log('[CHAT-CLIENT] Auth data loaded:', {
                userId: this.userId,
                userName: this.authData.username
            });

            // Sync user to Firestore (non-blocking - continues even if fails)
            const syncResult = await this.syncUser();
            if (syncResult) {
                console.log('[CHAT-CLIENT] ✅ User sync successful');
            } else {
                console.warn('[CHAT-CLIENT] ⚠️ User sync skipped - continuing with limited functionality');
            }

            // Connect WebSocket
            this.connectWebSocket();

            return true;
        } catch (error) {
            console.error('[CHAT-CLIENT] Initialization failed:', error);
            if (this.onError) this.onError(error);
            throw error;
        }
    }

    /**
     * Sync user to Firestore (first time or on login)
     * Non-blocking: Returns null if sync fails to allow app to continue
     */
    async syncUser() {
        try {
            const response = await this._fetch('/api/chat/sync-user', {
                method: 'POST'
            });

            console.log('[CHAT-CLIENT] ✅ User synced:', response.user);
            return response.user;
        } catch (error) {
            console.warn('[CHAT-CLIENT] ⚠️ Failed to sync user (backend may not be available):', error.message);
            console.warn('[CHAT-CLIENT] ⚠️ Continuing without user sync - some features may be limited');
            // Don't throw - allow app to continue even if backend is not ready
            return null;
        }
    }

    /**
     * Connect to WebSocket server
     */
    connectWebSocket() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('[CHAT-CLIENT] Already connected');
            return;
        }

        console.log('[CHAT-CLIENT] Connecting to WebSocket...', this.wsUrl);

        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
            console.log('[CHAT-CLIENT] ✅ WebSocket connected');
            this.connected = true;
            this.reconnectAttempts = 0;

            // Authenticate
            this.authenticateWebSocket();

            if (this.onConnected) this.onConnected();
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (error) {
                console.error('[CHAT-CLIENT] Error parsing WebSocket message:', error);
            }
        };

        this.ws.onerror = (error) => {
            console.error('[CHAT-CLIENT] WebSocket error:', error);
            if (this.onError) this.onError(error);
        };

        this.ws.onclose = () => {
            console.log('[CHAT-CLIENT] WebSocket closed');
            this.connected = false;
            this.authenticated = false;

            if (this.onDisconnected) this.onDisconnected();

            // Attempt reconnection
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                console.log(`[CHAT-CLIENT] Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                setTimeout(() => this.connectWebSocket(), this.reconnectDelay);
            } else {
                console.error('[CHAT-CLIENT] Max reconnection attempts reached');
            }
        };
    }

    /**
     * Authenticate WebSocket connection
     */
    authenticateWebSocket() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[CHAT-CLIENT] Cannot authenticate - WebSocket not open');
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'auth',
            payload: {
                userId: this.userId,
                authData: this.authData
            }
        }));

        console.log('[CHAT-CLIENT] Authentication request sent');
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleWebSocketMessage(data) {
        const { type } = data;

        switch (type) {
            case 'connected':
                console.log('[CHAT-CLIENT] Server connection acknowledged');
                break;

            case 'authenticated':
                console.log('[CHAT-CLIENT] ✅ Authenticated');
                this.authenticated = true;
                break;

            case 'auth_error':
                console.error('[CHAT-CLIENT] Authentication failed:', data.message);
                if (this.onError) this.onError(new Error(data.message));
                break;

            case 'new_message':
                console.log('[CHAT-CLIENT] New message:', data.chatId);
                if (this.onNewMessage) this.onNewMessage(data.chatId, data.message);
                break;

            case 'user_typing':
                if (this.onUserTyping) this.onUserTyping(data.chatId, data.userId);
                break;

            case 'user_stopped_typing':
                if (this.onUserStoppedTyping) this.onUserStoppedTyping(data.chatId, data.userId);
                break;

            case 'user_status':
                if (this.onUserStatus) this.onUserStatus(data.userId, data.online);
                break;

            case 'pong':
                // Keep-alive response
                break;

            case 'error':
                console.error('[CHAT-CLIENT] Server error:', data.message);
                if (this.onError) this.onError(new Error(data.message));
                break;

            default:
                console.warn('[CHAT-CLIENT] Unknown message type:', type);
        }
    }

    /**
     * Disconnect WebSocket
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.authenticated = false;
    }

    // =====================================================
    // REST API METHODS
    // =====================================================

    /**
     * Get list of users
     */
    async getUsers(options = {}) {
        const { online, search, limit = 50 } = options;
        const params = new URLSearchParams();

        if (online !== undefined) params.append('online', online);
        if (search) params.append('search', search);
        params.append('limit', limit);

        const response = await this._fetch(`/api/chat/users?${params}`);
        return response.users;
    }

    /**
     * Create new chat (direct or group)
     */
    async createChat(participants, type = 'direct', groupName = null) {
        const response = await this._fetch('/api/chat/create', {
            method: 'POST',
            body: JSON.stringify({ participants, type, groupName })
        });

        return {
            chatId: response.chatId,
            existing: response.existing,
            chat: response.chat
        };
    }

    /**
     * Get conversations list
     */
    async getConversations(limit = 50) {
        const response = await this._fetch(`/api/chat/conversations?limit=${limit}`);
        return response.chats;
    }

    /**
     * Get chat details
     */
    async getChat(chatId) {
        const response = await this._fetch(`/api/chat/${chatId}`);
        return response.chat;
    }

    /**
     * Get messages from a chat
     */
    async getMessages(chatId, options = {}) {
        const { limit = 50, before, after } = options;
        const params = new URLSearchParams({ limit });

        if (before) params.append('before', before);
        if (after) params.append('after', after);

        const response = await this._fetch(`/api/chat/${chatId}/messages?${params}`);
        return response.messages;
    }

    /**
     * Send a text message
     */
    async sendMessage(chatId, text) {
        const response = await this._fetch(`/api/chat/${chatId}/send`, {
            method: 'POST',
            body: JSON.stringify({ text, type: 'text' })
        });

        return response.message;
    }

    /**
     * Send an image message
     */
    async sendImage(chatId, fileUrl, fileName) {
        const response = await this._fetch(`/api/chat/${chatId}/send`, {
            method: 'POST',
            body: JSON.stringify({
                type: 'image',
                fileUrl,
                fileName,
                text: null
            })
        });

        return response.message;
    }

    /**
     * Send a file message
     */
    async sendFile(chatId, fileUrl, fileName) {
        const response = await this._fetch(`/api/chat/${chatId}/send`, {
            method: 'POST',
            body: JSON.stringify({
                type: 'file',
                fileUrl,
                fileName,
                text: null
            })
        });

        return response.message;
    }

    /**
     * Upload a file
     */
    async uploadFile(chatId, file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('chatId', chatId);

        const response = await fetch(`${this.serverUrl}/api/chat/upload`, {
            method: 'POST',
            headers: {
                'X-Auth-Data': JSON.stringify(this.authData)
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Upload failed');
        }

        return await response.json();
    }

    /**
     * Mark messages as read
     */
    async markAsRead(chatId, messageIds) {
        const response = await this._fetch(`/api/chat/${chatId}/mark-read`, {
            method: 'POST',
            body: JSON.stringify({ messageIds })
        });

        return response;
    }

    // =====================================================
    // WEBSOCKET METHODS
    // =====================================================

    /**
     * Send typing indicator
     */
    sendTyping(chatId) {
        if (!this.authenticated) {
            console.warn('[CHAT-CLIENT] Not authenticated');
            return;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'typing',
                payload: { chatId }
            }));
        }
    }

    /**
     * Stop typing indicator
     */
    stopTyping(chatId) {
        if (!this.authenticated) return;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'stop_typing',
                payload: { chatId }
            }));
        }
    }

    /**
     * Send ping (keep-alive)
     */
    ping() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
        }
    }

    // =====================================================
    // HELPER METHODS
    // =====================================================

    /**
     * Internal fetch wrapper with auth
     */
    async _fetch(endpoint, options = {}) {
        const url = `${this.serverUrl}${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            'X-Auth-Data': JSON.stringify(this.authData),
            ...options.headers
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || error.error || 'Request failed');
        }

        return await response.json();
    }

    /**
     * Check if connected
     */
    isConnected() {
        return this.connected && this.authenticated;
    }

    /**
     * Get current user ID
     */
    getUserId() {
        return this.userId;
    }
}

// =====================================================
// AUTO-INITIALIZATION
// =====================================================

// Create global instance
const chatClient = new ChatClient();
window.chatClient = chatClient;

// Auto-initialize after page load if user is authenticated
window.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for authManager to initialize
    setTimeout(() => {
        if (window.authManager && authManager.isAuthenticated()) {
            console.log('[CHAT-CLIENT] Auto-initializing...');
            chatClient.init().catch(error => {
                console.error('[CHAT-CLIENT] Auto-init failed:', error);
            });
        }
    }, 1000);
});

console.log('[CHAT-CLIENT] Module loaded');
