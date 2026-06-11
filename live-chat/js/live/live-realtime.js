// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Live Realtime Manager
 * SSE for live comments + WebSocket proxy for Live events
 * Dependencies: LiveState, LiveApi, eventBus
 */

const LiveRealtime = {
    // WebSocket connection to proxy server (for Live parsed events)
    ws: null,
    wsConnected: false,
    wsConnecting: false,
    reconnectTimer: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,

    // Server URLs for WebSocket proxy
    serverBaseUrl: 'https://n2store-realtime.onrender.com',
    wsUrl: 'wss://n2store-realtime.onrender.com',

    // SSE retry config per connection key
    SSE_MAX_RETRIES: 5,
    SSE_BASE_DELAY_MS: 3000,
    SSE_MAX_DELAY_MS: 60000,
    _sseRetryState: new Map(), // key -> { attempts, timer, lastOpenAt }

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
        const state = window.LiveState;

        // Use params or defaults from state
        pageId = pageId || state.selectedPage?.Facebook_PageId;
        postId = postId || state.selectedCampaign?.Facebook_LiveId;
        pageName = pageName || state.selectedCampaign?.Facebook_UserName || '';

        if (!pageId || !postId) return;

        // REWIRE (flag-gated): realtime comment qua FB Graph poll→SSE (web2-fb-live),
        // độc lập Live. Bật flag `web2_live_source=fbgraph`. Tắt flag → EventSource Live.
        if (window.LiveSource?.enabled()) {
            window.LiveSource.startRealtime(pageId, postId, pageName);
            return;
        }

        // For single-campaign mode, stop existing SSE first
        if (!pageName && state._sseConnections?.size > 0) {
            this.stopSSE();
        }

        window.LiveApi.getToken()
            .then((token) => {
                if (!token) {
                    console.error('[Live-RT] No token for SSE');
                    return;
                }

                const sseUrl = `${state.proxyBaseUrl}/facebook/comments/stream?pageid=${pageId}&postId=${postId}&token=${encodeURIComponent(token)}`;
                const sseKey = `${pageId}_${postId}`;

                // Track multiple SSE connections
                if (!state._sseConnections) state._sseConnections = new Map();

                // Don't open duplicate
                if (state._sseConnections.has(sseKey)) return;

                // Get or init retry state for this key
                let retry = this._sseRetryState.get(sseKey);
                if (!retry) {
                    retry = { attempts: 0, timer: null, lastOpenAt: 0 };
                    this._sseRetryState.set(sseKey, retry);
                }
                if (retry.timer) {
                    clearTimeout(retry.timer);
                    retry.timer = null;
                }

                console.log(`[Live-RT] Starting SSE for ${pageName || pageId}...`);
                const es = new EventSource(sseUrl);

                es.onopen = () => {
                    // Guard stale: connection đã bị stopSSE/replace → bỏ qua event cũ.
                    if (state._sseConnections?.get(sseKey) !== es) return;
                    console.log(`[Live-RT] SSE connected: ${pageName || sseKey}`);
                    state.sseConnected = true;
                    retry.lastOpenAt = Date.now();
                    // Reset attempts only if connection stayed open for >3s (real success)
                    // otherwise leave attempts so backoff continues
                    window.LiveCommentList.updateConnectionStatus(true, 'sse');
                };

                es.onmessage = (event) => {
                    // Guard stale: connection đã bị stopSSE/replace → bỏ qua event cũ.
                    if (state._sseConnections?.get(sseKey) !== es) return;
                    // First real message = confirmed healthy connection, reset attempts
                    if (retry.attempts > 0) retry.attempts = 0;
                    this.handleSSEMessage(event.data, pageName);
                };

                es.onerror = () => {
                    // Only react once per error burst — so sánh IDENTITY (es) chứ không
                    // chỉ has(key): tránh es cũ xóa nhầm connection mới cùng key.
                    if (state._sseConnections.get(sseKey) !== es) return;
                    state._sseConnections.delete(sseKey);
                    es.close();

                    const openedFor = retry.lastOpenAt ? Date.now() - retry.lastOpenAt : 0;
                    // If connection never opened or dropped immediately (<2s), count as retry
                    if (openedFor < 2000) {
                        retry.attempts++;
                    } else {
                        // Stable connection dropped — restart attempt counter
                        retry.attempts = 1;
                    }

                    if (state._sseConnections.size === 0) {
                        state.sseConnected = false;
                        window.LiveCommentList.updateConnectionStatus(false, 'sse');
                    }

                    // Stop retrying after max attempts
                    if (retry.attempts > this.SSE_MAX_RETRIES) {
                        console.warn(
                            `[Live-RT] SSE giving up for ${pageName || sseKey} after ${retry.attempts - 1} retries`
                        );
                        return;
                    }

                    // Exponential backoff with jitter
                    const base = Math.min(
                        this.SSE_BASE_DELAY_MS * Math.pow(2, retry.attempts - 1),
                        this.SSE_MAX_DELAY_MS
                    );
                    const delay = Math.floor(base + Math.random() * 1000);
                    console.warn(
                        `[Live-RT] SSE error for ${pageName || sseKey}, retry ${retry.attempts}/${this.SSE_MAX_RETRIES} in ${Math.round(delay / 1000)}s`
                    );

                    retry.timer = setTimeout(() => {
                        retry.timer = null;
                        const stillSelected =
                            state.selectedCampaignIds?.size > 0 || state.selectedCampaign;
                        if (stillSelected) {
                            this.startSSE(pageId, postId, pageName);
                        }
                    }, delay);
                };

                state._sseConnections.set(sseKey, es);

                // Also keep backward compat
                state.eventSource = es;
            })
            .catch((err) => console.error('[Live-RT] getToken failed:', err));
    },

    /**
     * Stop all SSE connections
     */
    stopSSE() {
        const state = window.LiveState;

        // REWIRE: dừng cả poller FB Graph (web2-fb-live) nếu đang chạy.
        try {
            window.LiveSource?.stopRealtime();
        } catch {}

        // Close all tracked connections
        if (state._sseConnections) {
            for (const [key, es] of state._sseConnections) {
                es.close();
            }
            state._sseConnections.clear();
        }

        // Cancel any pending SSE reconnect timers
        for (const [key, retry] of this._sseRetryState) {
            if (retry.timer) {
                clearTimeout(retry.timer);
                retry.timer = null;
            }
        }
        this._sseRetryState.clear();

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
        const state = window.LiveState;
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
        const state = window.LiveState;
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
                    window.LiveCommentList.renderComments();
                } else {
                    state.comments.unshift(comment);
                    window.LiveCommentList.renderComments();

                    // Highlight new customer comment (KHÔNG auto-scroll — user request:
                    // bỏ chức năng kéo lên đầu để giữ scroll position khi đang xem comment cũ).
                    setTimeout(() => {
                        const item = document.querySelector(`[data-comment-id="${comment.id}"]`);
                        if (item) {
                            item.classList.add('highlight');
                            setTimeout(() => item.classList.remove('highlight'), 3000);
                        }
                    }, 100);
                }

                // Emit event
                window.eventBus.emit('live:newComment', { comment, isStaff });
            });
        } catch (error) {
            console.error('[Live-RT] Error parsing SSE message:', error);
        }
    },

    // =====================================================
    // WEBSOCKET - Live Proxy Server Events
    // =====================================================

    /**
     * Initialize WebSocket connection to proxy server
     */
    async initializeWebSocket() {
        const isEnabled = localStorage.getItem('web2_realtime_enabled') !== 'false';
        if (!isEnabled) {
            console.log('[Live-RT] WebSocket disabled by user setting');
            return;
        }

        await this.startServerConnection();
        this.connectWebSocket();
    },

    /**
     * Start server-side WebSocket connection to Live
     * @returns {Promise<boolean>}
     */
    async startServerConnection() {
        try {
            if (!window.liveTokenManager) {
                console.error('[Live-RT] liveTokenManager not available');
                return false;
            }

            const token = await window.liveTokenManager.getToken();
            if (!token) {
                console.error('[Live-RT] No Live token available');
                return false;
            }

            const room = localStorage.getItem('web2_realtime_room') || 'tomato.live.vn';

            const response = await fetch(`${this.serverBaseUrl}/api/realtime/live/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, room }),
            });

            const data = await response.json();
            if (data.success) {
                console.log('[Live-RT] Server connection started');
                return true;
            }
            console.error('[Live-RT] Server failed to start:', data.error);
            return false;
        } catch (error) {
            console.error('[Live-RT] Error starting server connection:', error);
            return false;
        }
    },

    /**
     * Connect to proxy server WebSocket to receive events
     */
    connectWebSocket() {
        if (this.wsConnected || this.wsConnecting) return;

        this.wsConnecting = true;
        // Reset cờ đóng chủ động — connection mới được phép auto-reconnect.
        this._intentionalClose = false;

        try {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.onopen = () => {
                this.wsConnected = true;
                this.wsConnecting = false;
                this.reconnectAttempts = 0;
                window.eventBus.emit('live:wsConnected');
                window.dispatchEvent(new CustomEvent('liveRealtimeConnected'));
            };

            this.ws.onclose = () => {
                this.wsConnected = false;
                this.wsConnecting = false;
                window.eventBus.emit('live:wsDisconnected');
                window.dispatchEvent(new CustomEvent('liveRealtimeDisconnected'));

                // Đóng chủ động (disconnectWebSocket) → KHÔNG schedule reconnect.
                if (this._intentionalClose) return;
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
            console.error('[Live-RT] WebSocket connection error:', error);
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
                case 'live:parsed-event':
                    this.handleParsedEvent(message);
                    break;
                case 'live:new-order':
                    this.handleNewOrder(message.data);
                    break;
                case 'live:order-update':
                    window.eventBus.emit('live:orderUpdated', message.data);
                    window.dispatchEvent(
                        new CustomEvent('liveOrderUpdate', { detail: message.data })
                    );
                    break;
                default:
                    break;
            }
        } catch (error) {
            console.error('[Live-RT] Error parsing WebSocket message:', error);
        }
    },

    /**
     * Handle parsed Live event
     * @param {object} message - { context, eventType, data }
     */
    handleParsedEvent(message) {
        const { context, eventType, data } = message;
        if (!data) return;

        window.dispatchEvent(
            new CustomEvent('liveParsedEvent', {
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
                new CustomEvent('liveConversationUpdate', {
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

        window.eventBus.emit('live:orderCreated', orderInfo);
        window.dispatchEvent(new CustomEvent('liveNewOrder', { detail: orderInfo }));
    },

    /**
     * Disconnect WebSocket
     */
    disconnectWebSocket() {
        clearTimeout(this.reconnectTimer);
        // Set cờ TRƯỚC khi close — ws.onclose sẽ không schedule reconnect.
        this._intentionalClose = true;
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
            const response = await fetch(`${this.serverBaseUrl}/api/realtime/live/stop`, {
                method: 'POST',
            });
            const data = await response.json();
            return data.success;
        } catch (error) {
            console.error('[Live-RT] Error stopping server connection:', error);
            return false;
        }
    },

    /**
     * Get WebSocket connection status
     * @returns {Promise<object>}
     */
    async getStatus() {
        try {
            const response = await fetch(`${this.serverBaseUrl}/api/realtime/live/status`);
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
    window.LiveRealtime = LiveRealtime;
}
