// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PANCAKE REALTIME - Phoenix WebSocket protocol
// =====================================================

const PancakeRealtime = {
    ws: null,
    proxyWs: null,
    isConnected: false,
    isConnecting: false,
    refCounter: 1,
    heartbeatInterval: null,
    reconnectTimer: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 3,
    reconnectDelay: 2000,
    userId: null,
    token: null,
    pageIds: [],
    url: 'wss://pancake.vn/socket/websocket?vsn=2.0.0',
    HEARTBEAT_INTERVAL: 30000,

    // Auto-refresh fallback
    autoRefreshInterval: null,
    AUTO_REFRESH_INTERVAL: 30000,

    // =====================================================
    // CONNECTION
    // =====================================================

    async connect() {
        if (this.isConnected || this.isConnecting) return true;
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return true;

        try {
            this.isConnecting = true;
            if (!window.pancakeTokenManager) {
                setTimeout(() => this.connect(), 1000);
                return false;
            }

            this.token = await window.pancakeTokenManager.getToken();
            if (!this.token) { this.isConnecting = false; return false; }

            var tokenInfo = window.pancakeTokenManager.getTokenInfo();
            this.userId = tokenInfo ? tokenInfo.uid : null;
            if (!this.userId) { this.isConnecting = false; return false; }

            var state = window.PancakeState;
            if (state.pageIds.length === 0) await window.PancakeAPI.fetchPages();
            this.pageIds = state.pageIds;

            var wsUrl = 'wss://pancake.vn/socket/websocket?token=' + encodeURIComponent(this.token) + '&vsn=2.0.0';
            this._closeWs();
            this.ws = new WebSocket(wsUrl);

            var self = this;
            this.ws.onopen = function() { self._onOpen(); };
            this.ws.onclose = function(e) { self._onClose(e); };
            this.ws.onerror = function(e) { console.error('[PK-RT] WS error:', e); };
            this.ws.onmessage = function(e) { self._onMessage(e); };

            return true;
        } catch (error) {
            console.error('[PK-RT] Connect error:', error);
            this.isConnecting = false;
            return false;
        }
    },

    async connectServerMode() {
        if (this.isConnected || this.isConnecting) return;
        this.isConnecting = true;

        if (!window.pancakeTokenManager) {
            setTimeout(() => this.connectServerMode(), 1000);
            return;
        }

        var token = await window.pancakeTokenManager.getToken();
        var tokenInfo = window.pancakeTokenManager.getTokenInfo();
        var userId = tokenInfo ? tokenInfo.uid : null;
        var state = window.PancakeState;
        if (state.pageIds.length === 0) await window.PancakeAPI.fetchPages();
        var pageIds = state.pageIds;

        if (!token || !userId) {
            this.isConnecting = false;
            return;
        }

        var cookie = 'jwt=' + token;
        var serverBaseUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev';
        var mode = window.chatAPISettings ? window.chatAPISettings.getRealtimeMode() : 'server';
        if (mode === 'localhost') serverBaseUrl = 'http://localhost:3000';

        try {
            var response = await fetch(serverBaseUrl + '/api/realtime/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token, userId: userId, pageIds: pageIds, cookie: cookie })
            });
            var data = await response.json();
            if (data.success) {
                var wsUrl = mode === 'localhost' ? 'ws://localhost:3000' : 'wss://n2store-realtime.onrender.com';
                this._connectToProxy(wsUrl);
                if (window.notificationManager) window.notificationManager.show('Server đã bắt đầu nhận tin nhắn 24/7', 'success');
            } else {
                console.error('[PK-RT] Server start failed:', data.error);
            }
        } catch (error) {
            console.error('[PK-RT] Server mode error:', error);
        } finally {
            this.isConnecting = false;
        }
    },

    _connectToProxy(url) {
        if (this.proxyWs) this.proxyWs.close();
        this.proxyWs = new WebSocket(url);
        var self = this;

        this.proxyWs.onopen = function() { self.isConnected = true; };
        this.proxyWs.onclose = function() {
            self.isConnected = false;
            if (window.chatAPISettings && window.chatAPISettings.isRealtimeEnabled() &&
                window.chatAPISettings.getRealtimeMode() !== 'browser') {
                setTimeout(function() { self.connectServerMode(); }, 3000);
            }
        };
        this.proxyWs.onmessage = function(event) {
            try {
                var data = JSON.parse(event.data);
                if (data.type === 'pages:update_conversation') {
                    self._handleUpdateConversation(data.payload);
                } else if (data.type === 'order:tags_updated') {
                    self._handleOrderTagsUpdate(data.payload);
                }
            } catch (e) {
                console.error('[PK-RT] Proxy parse error:', e);
            }
        };
    },

    disconnect() {
        if (this.ws) { this.ws.close(); this.ws = null; }
        if (this.proxyWs) { this.proxyWs.close(); this.proxyWs = null; }
        this._stopHeartbeat();
        this.stopAutoRefresh();
        this.isConnected = false;
        this.isConnecting = false;
    },

    reconnect() {
        this.disconnect();
        this.reconnectAttempts = 0;
        this.connect();
    },

    // =====================================================
    // CHANNELS
    // =====================================================

    joinChannels() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        var ref1 = this._makeRef();
        this.ws.send(JSON.stringify([ref1, ref1, 'users:' + this.userId, 'phx_join', {
            accessToken: this.token, userId: this.userId, platform: 'web'
        }]));
        var ref2 = this._makeRef();
        this.ws.send(JSON.stringify([ref2, ref2, 'multiple_pages:' + this.userId, 'phx_join', {
            accessToken: this.token, userId: this.userId,
            clientSession: this._genSession(),
            pageIds: this.pageIds.map(String), platform: 'web'
        }]));
        var self = this;
        setTimeout(function() {
            if (!self.ws || self.ws.readyState !== WebSocket.OPEN) return;
            var ref3 = self._makeRef();
            self.ws.send(JSON.stringify([ref2, ref3, 'multiple_pages:' + self.userId, 'get_online_status', {}]));
        }, 1000);
    },

    // =====================================================
    // HEARTBEAT
    // =====================================================

    sendHeartbeat() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            var ref = this._makeRef();
            this.ws.send(JSON.stringify([null, ref, 'phoenix', 'heartbeat', {}]));
        }
    },

    _startHeartbeat() {
        this._stopHeartbeat();
        var self = this;
        this.heartbeatInterval = setInterval(function() { self.sendHeartbeat(); }, this.HEARTBEAT_INTERVAL);
    },

    _stopHeartbeat() {
        if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }
    },

    // =====================================================
    // AUTO-REFRESH FALLBACK
    // =====================================================

    startAutoRefresh() {
        this.stopAutoRefresh();
        var self = this;
        this.autoRefreshInterval = setInterval(async function() {
            try {
                var state = window.PancakeState;
                state.pagesWithUnread = await window.PancakeAPI.fetchPagesWithUnreadCount() || [];
                window.PancakePageSelector.updateSelectedDisplay();
                if (!state.isLoading) {
                    var convs = await window.PancakeAPI.fetchConversations(false);
                    if (convs && convs.length > 0) {
                        var hasNew = convs.some(function(c) { return c.unread_count > 0; });
                        if (convs.length !== state.conversations.length || hasNew) {
                            state.conversations = convs;
                            window.PancakeConversationList.renderConversationList();
                        }
                    }
                }
            } catch (error) {
                console.warn('[PK-RT] Auto-refresh error:', error.message);
            }
        }, this.AUTO_REFRESH_INTERVAL);
    },

    stopAutoRefresh() {
        if (this.autoRefreshInterval) { clearInterval(this.autoRefreshInterval); this.autoRefreshInterval = null; }
    },

    // =====================================================
    // INTERNAL HANDLERS
    // =====================================================

    _onOpen() {
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 2000;
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        this._updateStatusUI(true);
        this.joinChannels();
        this._startHeartbeat();
        this.stopAutoRefresh();
        if (window.eventBus) window.eventBus.emit('pancake:realtimeConnected');
    },

    _onClose(event) {
        this.isConnected = false;
        this.isConnecting = false;
        this._updateStatusUI(false);
        this._stopHeartbeat();
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            var delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
            var self = this;
            this.reconnectTimer = setTimeout(function() { self.connect(); }, delay);
        } else {
            this.startAutoRefresh();
        }
    },

    _onMessage(event) {
        try {
            var msg = JSON.parse(event.data);
            if (!Array.isArray(msg) || msg.length < 5) return;
            var eventName = msg[3];
            var payload = msg[4];

            if (eventName === 'pages:update_conversation' || eventName === 'update_conversation') {
                this._handleUpdateConversation(payload);
            } else if (eventName === 'pages:new_message' || eventName === 'new_message') {
                this._handleNewMessage(payload);
            } else if (eventName === 'order:tags_updated' || eventName === 'tags_updated') {
                this._handleOrderTagsUpdate(payload);
            }
        } catch (error) {
            console.error('[PK-RT] Parse error:', error);
        }
    },

    handleMessage(event, payload) {
        if (event === 'pages:update_conversation') this._handleUpdateConversation(payload);
        else if (event === 'pages:new_message') this._handleNewMessage(payload);
        else if (event === 'order:tags_updated') this._handleOrderTagsUpdate(payload);
    },

    _handleUpdateConversation(payload) {
        var conv = payload.conversation || payload;
        if (!conv || !conv.id) return;

        var state = window.PancakeState;
        var idx = state.conversations.findIndex(function(c) { return c.id === conv.id; });
        var isActive = state.activeConversation && state.activeConversation.id === conv.id;

        if (idx >= 0) {
            var existing = state.conversations[idx];
            Object.assign(existing, {
                snippet: conv.snippet || existing.snippet,
                updated_at: conv.updated_at || new Date().toISOString(),
                unread_count: isActive ? 0 : (existing.unread_count || 0) + 1,
                last_message: conv.last_message || existing.last_message
            });
            state.conversations.splice(idx, 1);
            state.conversations.unshift(existing);
            window.PancakeConversationList.updateConversationInDOM(existing);
        } else {
            state.conversations.unshift(Object.assign({ unread_count: 1, type: conv.type || 'INBOX' }, conv));
            window.PancakeConversationList.renderConversationList();
        }

        if (isActive) {
            this._fetchNewMessagesForActive();
        } else {
            if (document.hidden) {
                var origTitle = document.title;
                document.title = 'Tin nhắn mới!';
                setTimeout(function() { document.title = origTitle; }, 3000);
            }
        }

        if (window.eventBus) window.eventBus.emit('pancake:conversationUpdate', conv);
    },

    _handleNewMessage(payload) {
        var message = payload.message || payload;
        var convId = payload.conversation_id || message.conversation_id;
        var state = window.PancakeState;
        if (state.activeConversation && state.activeConversation.id === convId) {
            if (!state.messages.find(function(m) { return m.id === message.id; })) {
                state.messages.push(message);
                window.PancakeChatWindow.renderMessages();
            }
        }
    },

    _handleOrderTagsUpdate(payload) {
        if (window.eventBus) window.eventBus.emit('pancake:orderTagsUpdate', payload);
    },

    async _fetchNewMessagesForActive() {
        var state = window.PancakeState;
        if (!state.activeConversation) return;
        try {
            var pageId = state.activeConversation.page_id;
            var convId = state.activeConversation.id;
            var customerId = state.activeConversation.customers && state.activeConversation.customers[0] ? state.activeConversation.customers[0].id : null;
            var result = await window.PancakeAPI.fetchMessages(pageId, convId, { customerId: customerId });
            if (result && result.messages) {
                var existingIds = new Set(state.messages.map(function(m) { return m.id; }));
                var newMsgs = result.messages.filter(function(m) { return !existingIds.has(m.id) && !m._temp; });
                if (newMsgs.length > 0) {
                    state.messages.push.apply(state.messages, newMsgs);
                    window.PancakeChatWindow.renderMessages();
                    window.PancakeChatWindow.scrollToBottom();
                    window.PancakeAPI.markAsRead(pageId, convId);
                }
            }
        } catch (error) {
            console.error('[PK-RT] Fetch new messages error:', error);
        }
    },

    _updateStatusUI(connected) {
        var el = document.getElementById('pkSocketStatus');
        if (!el) return;
        el.innerHTML = connected
            ? '<i data-lucide="wifi" class="pk-socket-icon connected"></i>'
            : '<i data-lucide="wifi-off" class="pk-socket-icon disconnected"></i>';
        el.title = connected ? 'Realtime: Đã kết nối' : 'Realtime: Mất kết nối';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    _closeWs() {
        this._stopHeartbeat();
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
    },

    _makeRef() { return String(this.refCounter++); },

    _genSession() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
};

if (typeof window !== 'undefined') {
    window.PancakeRealtime = PancakeRealtime;
}
