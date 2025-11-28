// =====================================================
// N2STORE CHAT CLIENT - REBUILT FROM SCRATCH
// Clean, simple API client with SSE for realtime updates
// =====================================================

class ChatClient {
    constructor() {
        // API Configuration
        this.apiUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev'; // Cloudflare Worker proxy

        // Auth state
        this.userId = null;
        this.username = null;
        this.authenticated = false;

        // SSE connection
        this.eventSource = null;
        this.connected = false;

        // Callbacks for realtime events
        this.onMessage = null;          // (message) => {}
        this.onUserStatus = null;       // (userId, status) => {}
        this.onConnected = null;        // () => {}
        this.onDisconnected = null;     // () => {}
        this.onError = null;            // (error) => {}

        console.log('[CHAT-CLIENT] ✅ Initialized');
    }

    // =====================================================
    // INITIALIZATION & AUTHENTICATION
    // =====================================================

    /**
     * Initialize chat client with authenticated user
     */
    async init() {
        console.log('[CHAT-CLIENT] 🚀 Initializing...');

        // Get auth from global authManager
        if (!window.authManager || !authManager.isAuthenticated()) {
            throw new Error('User not authenticated');
        }

        const userInfo = authManager.getUserInfo();
        this.userId = authManager.getUserId();
        this.username = userInfo.username;

        if (!this.userId || !this.username) {
            throw new Error('Invalid user info');
        }

        console.log('[CHAT-CLIENT] 👤 User:', this.username, `(${this.userId})`);

        // Sync user to backend
        await this.syncUser();

        // Connect to SSE stream
        this.connectSSE();

        this.authenticated = true;
        console.log('[CHAT-CLIENT] ✅ Initialization complete');
    }

    /**
     * Sync user to backend database
     */
    async syncUser() {
        try {
            const response = await this._fetch('/api/chat/sync-user', {
                method: 'POST',
                body: JSON.stringify({
                    userId: this.userId,
                    username: this.username,
                    displayName: this.username
                })
            });

            console.log('[CHAT-CLIENT] ✅ User synced');
            return response;
        } catch (error) {
            console.error('[CHAT-CLIENT] ⚠️ Failed to sync user:', error.message);
            // Non-fatal - continue anyway
            return null;
        }
    }

    /**
     * Connect to Server-Sent Events stream for realtime updates
     */
    connectSSE() {
        if (this.eventSource) {
            console.warn('[CHAT-CLIENT] SSE already connected');
            return;
        }

        // EventSource doesn't support custom headers, so pass userId via query parameter
        const sseUrl = `${this.apiUrl}/api/chat/stream?userId=${encodeURIComponent(this.userId)}`;
        console.log('[CHAT-CLIENT] 📡 Connecting to SSE:', sseUrl);

        this.eventSource = new EventSource(sseUrl, {
            withCredentials: false
        });

        this.eventSource.addEventListener('connected', (e) => {
            const data = JSON.parse(e.data);
            console.log('[CHAT-CLIENT] ✅ SSE Connected:', data);
            this.connected = true;

            if (this.onConnected) this.onConnected();
        });

        this.eventSource.addEventListener('new-message', (e) => {
            const message = JSON.parse(e.data);
            console.log('[CHAT-CLIENT] 📨 New message:', message);

            if (this.onMessage) this.onMessage(message);
        });

        this.eventSource.addEventListener('user-status', (e) => {
            const data = JSON.parse(e.data);
            console.log('[CHAT-CLIENT] 👤 User status:', data);

            if (this.onUserStatus) this.onUserStatus(data.userId, data.status);
        });

        this.eventSource.onerror = (error) => {
            console.error('[CHAT-CLIENT] ❌ SSE error:', error);
            this.connected = false;

            if (this.onDisconnected) this.onDisconnected();
            if (this.onError) this.onError(error);

            // Auto-reconnect after 3 seconds
            setTimeout(() => {
                if (!this.connected && this.authenticated) {
                    console.log('[CHAT-CLIENT] 🔄 Reconnecting SSE...');
                    this.eventSource.close();
                    this.eventSource = null;
                    this.connectSSE();
                }
            }, 3000);
        };
    }

    /**
     * Disconnect from SSE
     */
    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
            this.connected = false;
            console.log('[CHAT-CLIENT] 🔌 Disconnected');
        }
    }

    // =====================================================
    // API METHODS - CONVERSATIONS
    // =====================================================

    /**
     * Get list of conversations for current user
     */
    async getConversations(limit = 50) {
        const response = await this._fetch(`/api/chat/conversations?limit=${limit}`, {
            method: 'GET'
        });
        return response.conversations || [];
    }

    /**
     * Create new conversation
     */
    async createConversation(participants, type = 'direct', groupName = null) {
        const response = await this._fetch('/api/chat/conversations', {
            method: 'POST',
            body: JSON.stringify({ participants, type, groupName })
        });
        return response;
    }

    // =====================================================
    // API METHODS - MESSAGES
    // =====================================================

    /**
     * Get messages for a conversation
     */
    async getMessages(conversationId, limit = 50, before = null) {
        let url = `/api/chat/messages/${conversationId}?limit=${limit}`;
        if (before) url += `&before=${before}`;

        const response = await this._fetch(url, {
            method: 'GET'
        });
        return response.messages || [];
    }

    /**
     * Send a message
     */
    async sendMessage(conversationId, text, type = 'text', fileUrl = null, fileName = null, fileSize = null) {
        const response = await this._fetch('/api/chat/messages', {
            method: 'POST',
            body: JSON.stringify({
                conversationId,
                text,
                type,
                fileUrl,
                fileName,
                fileSize
            })
        });
        return response.message;
    }

    /**
     * Mark conversation as read
     */
    async markAsRead(conversationId) {
        await this._fetch('/api/chat/messages/read', {
            method: 'POST',
            body: JSON.stringify({ conversationId })
        });
    }

    // =====================================================
    // API METHODS - USERS
    // =====================================================

    /**
     * Get users list
     */
    async getUsers(online = false, limit = 50) {
        let url = `/api/chat/users?limit=${limit}`;
        if (online) url += '&online=true';

        const response = await this._fetch(url, {
            method: 'GET'
        });
        return response.users || [];
    }

    /**
     * Get specific user
     */
    async getUser(userId) {
        const response = await this._fetch(`/api/chat/users/${userId}`, {
            method: 'GET'
        });
        return response.user;
    }

    // =====================================================
    // HELPERS
    // =====================================================

    /**
     * Internal fetch wrapper with auth headers
     */
    async _fetch(endpoint, options = {}) {
        const url = `${this.apiUrl}${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            'X-User-Id': this.userId,
            ...options.headers
        };

        const config = {
            ...options,
            headers
        };

        console.log(`[CHAT-CLIENT] 📤 ${options.method || 'GET'} ${endpoint}`);

        const response = await fetch(url, config);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[CHAT-CLIENT] ❌ ${response.status}:`, errorText);
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[CHAT-CLIENT] ✅ Response:`, data);
        return data;
    }

    /**
     * Check if client is connected
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Get current user ID
     */
    getUserId() {
        return this.userId;
    }

    /**
     * Get current username
     */
    getUsername() {
        return this.username;
    }
}

// =====================================================
// GLOBAL INSTANCE
// =====================================================

// Create global instance (but don't auto-init)
const chatClient = new ChatClient();
window.chatClient = chatClient;

console.log('[CHAT-CLIENT] 📦 Module loaded - call chatClient.init() to start');
