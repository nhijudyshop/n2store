// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * TPOS Realtime Manager
 * SSE for live comments + WebSocket proxy for TPOS events
 * Dependencies: TposState, TposApi, eventBus
 */

const TposRealtime = {
    // WebSocket connection to proxy server (for TPOS parsed events)
    ws: null,
    wsConnected: false,
    wsConnecting: false,
    reconnectTimer: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,

    // Server URLs for WebSocket proxy
    serverBaseUrl: 'https://n2store-realtime.onrender.com',
    wsUrl: 'wss://n2store-realtime.onrender.com',

    // =====================================================
    // SSE - Live Comment Stream
    // =====================================================

    /**
     * Start SSE connection for realtime comments (via proxy)
     * Supports multiple concurrent SSE connections for multi-campaign mode
     * @param {string} [pageId] - Override page ID
     * @param {string} [postId] - Override post ID
     * @param {string} [pageName] - Page name for tagging new comments
     */
    startSSE(pageId, postId, pageName) {
        const state = window.TposState;

        // Use params or defaults from state
        pageId = pageId || state.selectedPage?.Facebook_PageId;
        postId = postId || state.selectedCampaign?.Facebook_LiveId;
        pageName = pageName || state.selectedCampaign?.Facebook_UserName || '';

        if (!pageId || !postId) return;

        // For single-campaign mode, stop existing SSE first
        if (!pageName && state._sseConnections?.size > 0) {
            this.stopSSE();
        }

        window.TposApi.getToken().then((token) => {
            if (!token) {
                console.error('[TPOS-RT] No token for SSE');
                return;
            }

            const sseUrl = `${state.proxyBaseUrl}/facebook/comments/stream?pageid=${pageId}&postId=${postId}&token=${encodeURIComponent(token)}`;
            const sseKey = `${pageId}_${postId}`;

            // Track multiple SSE connections
            if (!state._sseConnections) state._sseConnections = new Map();

            // Don't open duplicate
            if (state._sseConnections.has(sseKey)) return;

            console.log(`[TPOS-RT] Starting SSE for ${pageName || pageId}...`);
            const es = new EventSource(sseUrl);

            es.onopen = () => {
                console.log(`[TPOS-RT] SSE connected: ${pageName || sseKey}`);
                state.sseConnected = true;
                window.TposCommentList.updateConnectionStatus(true, 'sse');
            };

            es.onmessage = (event) => {
                this.handleSSEMessage(event.data, pageName);
            };

            es.onerror = () => {
                console.error(`[TPOS-RT] SSE error: ${pageName || sseKey}`);
                state._sseConnections.delete(sseKey);
                es.close();

                if (state._sseConnections.size === 0) {
                    state.sseConnected = false;
                    window.TposCommentList.updateConnectionStatus(false, 'sse');
                }

                // Reconnect after 5s
                setTimeout(() => {
                    if (state.selectedCampaignIds?.size > 0 || state.selectedCampaign) {
                        this.startSSE(pageId, postId, pageName);
                    }
                }, 5000);
            };

            state._sseConnections.set(sseKey, es);

            // Also keep backward compat
            state.eventSource = es;
        });
    },

    /**
     * Stop all SSE connections
     */
    stopSSE() {
        const state = window.TposState;

        // Close all tracked connections
        if (state._sseConnections) {
            for (const [key, es] of state._sseConnections) {
                es.close();
            }
            state._sseConnections.clear();
        }

        // Backward compat
        if (state.eventSource) {
            state.eventSource.close();
            state.eventSource = null;
        }

        state.sseConnected = false;
    },

    /**
     * Check if a comment is from Page or Pancake staff
     * @param {object} comment
     * @returns {boolean}
     */
    isPageOrStaffComment(comment) {
        const state = window.TposState;
        const fromId = comment.from?.id;
        if (!fromId) return false;

        const pageId = state.selectedPage?.Facebook_PageId;
        if (pageId && fromId === pageId) return true;

        if (state.selectedPages.length > 0) {
            const selectedPageIds = state.selectedPages.map((p) => p.Facebook_PageId);
            if (selectedPageIds.includes(fromId)) return true;
        }

        if (window.pancakeDataManager?.pageIds) {
            if (window.pancakeDataManager.pageIds.includes(fromId)) return true;
        }

        return false;
    },

    /**
     * Handle SSE message (new comments from live stream)
     * @param {string} data - JSON string
     * @param {string} [pageName] - Page name to tag on comments
     */
    handleSSEMessage(data, pageName) {
        const state = window.TposState;
        try {
            const comments = JSON.parse(data);
            if (!Array.isArray(comments)) return;

            comments.forEach((comment) => {
                const exists = state.comments.some((c) => c.id === comment.id);
                if (exists) return;

                // Tag with page name for multi-campaign display
                if (pageName) comment._pageName = pageName;

                const isStaff = this.isPageOrStaffComment(comment);

                if (isStaff) {
                    state.comments.push(comment);
                    window.TposCommentList.renderComments();
                } else {
                    state.comments.unshift(comment);
                    window.TposCommentList.renderComments();

                    // Highlight and scroll to new customer comment
                    setTimeout(() => {
                        const item = document.querySelector(`[data-comment-id="${comment.id}"]`);
                        if (item) {
                            item.classList.add('highlight');
                            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            setTimeout(() => item.classList.remove('highlight'), 3000);
                        }
                    }, 100);
                }

                // Emit event
                window.eventBus.emit('tpos:newComment', { comment, isStaff });
            });
        } catch (error) {
            console.error('[TPOS-RT] Error parsing SSE message:', error);
        }
    },

    // =====================================================
    // WEBSOCKET - TPOS Proxy Server Events
    // =====================================================

    /**
     * Initialize WebSocket connection to proxy server
     */
    async initializeWebSocket() {
        const isEnabled = localStorage.getItem('tpos_realtime_enabled') !== 'false';
        if (!isEnabled) {
            console.log('[TPOS-RT] WebSocket disabled by user setting');
            return;
        }

        await this.startServerConnection();
        this.connectWebSocket();
    },

    /**
     * Start server-side WebSocket connection to TPOS
     * @returns {Promise<boolean>}
     */
    async startServerConnection() {
        try {
            if (!window.tposTokenManager) {
                console.error('[TPOS-RT] tposTokenManager not available');
                return false;
            }

            const token = await window.tposTokenManager.getToken();
            if (!token) {
                console.error('[TPOS-RT] No TPOS token available');
                return false;
            }

            const room = localStorage.getItem('tpos_realtime_room') || 'tomato.tpos.vn';

            const response = await fetch(`${this.serverBaseUrl}/api/realtime/tpos/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, room }),
            });

            const data = await response.json();
            if (data.success) {
                console.log('[TPOS-RT] Server connection started');
                return true;
            }
            console.error('[TPOS-RT] Server failed to start:', data.error);
            return false;
        } catch (error) {
            console.error('[TPOS-RT] Error starting server connection:', error);
            return false;
        }
    },

    /**
     * Connect to proxy server WebSocket to receive events
     */
    connectWebSocket() {
        if (this.wsConnected || this.wsConnecting) return;

        this.wsConnecting = true;

        try {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.onopen = () => {
                this.wsConnected = true;
                this.wsConnecting = false;
                this.reconnectAttempts = 0;
                window.eventBus.emit('tpos:wsConnected');
                window.dispatchEvent(new CustomEvent('tposRealtimeConnected'));
            };

            this.ws.onclose = () => {
                this.wsConnected = false;
                this.wsConnecting = false;
                window.eventBus.emit('tpos:wsDisconnected');
                window.dispatchEvent(new CustomEvent('tposRealtimeDisconnected'));

                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000);
                    this.reconnectAttempts++;
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = setTimeout(() => this.connectWebSocket(), delay);
                }
            };

            this.ws.onerror = () => {
                this.wsConnecting = false;
            };

            this.ws.onmessage = (event) => {
                this.handleWebSocketMessage(event.data);
            };
        } catch (error) {
            console.error('[TPOS-RT] WebSocket connection error:', error);
            this.wsConnecting = false;
        }
    },

    /**
     * Handle incoming WebSocket messages from proxy server
     * @param {string} data
     */
    handleWebSocketMessage(data) {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case 'tpos:parsed-event':
                    this.handleParsedEvent(message);
                    break;
                case 'tpos:new-order':
                    this.handleNewOrder(message.data);
                    break;
                case 'tpos:order-update':
                    window.eventBus.emit('tpos:orderUpdated', message.data);
                    window.dispatchEvent(
                        new CustomEvent('tposOrderUpdate', { detail: message.data })
                    );
                    break;
                default:
                    break;
            }
        } catch (error) {
            console.error('[TPOS-RT] Error parsing WebSocket message:', error);
        }
    },

    /**
     * Handle parsed TPOS event
     * @param {object} message - { context, eventType, data }
     */
    handleParsedEvent(message) {
        const { context, eventType, data } = message;
        if (!data) return;

        window.dispatchEvent(
            new CustomEvent('tposParsedEvent', {
                detail: { context, eventType, data },
            })
        );

        if (context === 'Conversation') {
            const conversation = {
                Id: data.Id || data.ConversationId,
                Message: data.Message,
                IsRead: data.IsRead,
                Customer: data.Customer,
                Product: data.Product,
                Type: eventType,
            };

            window.dispatchEvent(
                new CustomEvent('tposConversationUpdate', {
                    detail: { conversation, eventType, rawData: data },
                })
            );
        }
    },

    /**
     * Handle new order event
     * @param {object} data
     */
    handleNewOrder(data) {
        if (!data) return;

        const messageParts = (data.Message || '').split(':');
        const customerName = messageParts[0]?.trim() || 'Unknown';
        const orderContent = messageParts.slice(1).join(':').trim() || '';

        const orderInfo = {
            id: data.Id,
            conversationId: data.ConversationId,
            customerName,
            content: orderContent,
            fullMessage: data.Message,
            customer: data.Customer,
            product: data.Product,
            isRead: data.IsRead,
            timestamp: Date.now(),
        };

        window.eventBus.emit('tpos:orderCreated', orderInfo);
        window.dispatchEvent(new CustomEvent('tposNewOrder', { detail: orderInfo }));
    },

    /**
     * Disconnect WebSocket
     */
    disconnectWebSocket() {
        clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.wsConnected = false;
        this.wsConnecting = false;
    },

    /**
     * Stop server-side connection
     * @returns {Promise<boolean>}
     */
    async stopServerConnection() {
        try {
            const response = await fetch(`${this.serverBaseUrl}/api/realtime/tpos/stop`, {
                method: 'POST',
            });
            const data = await response.json();
            return data.success;
        } catch (error) {
            console.error('[TPOS-RT] Error stopping server connection:', error);
            return false;
        }
    },

    /**
     * Get WebSocket connection status
     * @returns {Promise<object>}
     */
    async getStatus() {
        try {
            const response = await fetch(`${this.serverBaseUrl}/api/realtime/tpos/status`);
            return await response.json();
        } catch (error) {
            return { connected: false, error: error.message };
        }
    },

    /**
     * Manual reconnect
     */
    async reconnect() {
        this.disconnectWebSocket();
        this.reconnectAttempts = 0;
        await this.startServerConnection();
        this.connectWebSocket();
    },
};

// Export for script-tag usage
if (typeof window !== 'undefined') {
    window.TposRealtime = TposRealtime;
}
