/* =====================================================
   TPOS CHAT MANAGER - Giao dien Live Comments TPOS
   WebSocket Real-time + Session Index Badge
   Uses TokenManager for authentication
   ===================================================== */

class TposChatManager {
    constructor() {
        // Comments data
        this.comments = [];
        this.filteredComments = [];
        this.filterType = 'all'; // 'all', 'hasOrder', 'noOrder'

        // Session Index Map (asuid -> { index, code, session })
        this.sessionIndexMap = new Map();

        // Post data
        this.currentPostId = null;
        this.posts = [];

        // WebSocket connections
        this.chatSocket = null;
        this.rtSocket = null;
        this.isSocketConnected = false;
        this.socketReconnectAttempts = 0;
        this.socketMaxReconnectAttempts = 5;
        this.heartbeatInterval = null;

        // TPOS API Config
        this.config = {
            chatWsUrl: 'wss://ws.chatomni.tpos.app/socket.io/?EIO=4&transport=websocket',
            rtWsUrl: 'wss://rt-2.tpos.app/socket.io/?EIO=4&transport=websocket',
            namespace: '/chatomni',
            room: 'tomato.tpos.vn',
            apiBaseUrl: 'https://chatomni-proxy.nhijudyshop.workers.dev/api'
        };

        // DOM Elements
        this.container = null;

        // Loading state
        this.isLoading = false;
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    async initialize(containerId = 'tposContent') {
        console.log('[TPOS-CHAT] Initializing...');

        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('[TPOS-CHAT] Container not found:', containerId);
            return false;
        }

        // Render initial UI
        this.render();

        // Initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Bind events
        this.bindEvents();

        // Wait for TokenManager to initialize
        await this.waitForTokenManager();

        console.log('[TPOS-CHAT] Initialized successfully');
        return true;
    }

    // =====================================================
    // TOKEN MANAGEMENT - Uses global TokenManager
    // =====================================================

    async waitForTokenManager() {
        // Wait for TokenManager to be ready
        if (window.tposTokenManager) {
            try {
                await window.tposTokenManager.waitForFirebaseAndInit();
                console.log('[TPOS-CHAT] TokenManager ready');

                // Check if we have a valid token
                if (window.tposTokenManager.isTokenValid()) {
                    console.log('[TPOS-CHAT] Valid token found, connecting WebSocket...');
                    await this.connectWebSocket();
                } else {
                    console.log('[TPOS-CHAT] No valid token, will fetch on demand');
                    this.showLoginPrompt();
                }
            } catch (error) {
                console.error('[TPOS-CHAT] Error initializing TokenManager:', error);
                this.showLoginPrompt();
            }
        } else {
            console.warn('[TPOS-CHAT] TokenManager not available');
            this.showLoginPrompt();
        }
    }

    async getAccessToken() {
        if (window.tposTokenManager) {
            return await window.tposTokenManager.getToken();
        }
        return null;
    }

    async getAuthHeader() {
        if (window.tposTokenManager) {
            return await window.tposTokenManager.getAuthHeader();
        }
        return {};
    }

    // =====================================================
    // RENDER METHODS
    // =====================================================

    render() {
        this.container.innerHTML = `
            <div class="tpos-chat-container">
                <!-- Header -->
                <div class="tpos-header">
                    <div class="tpos-header-left">
                        <div class="tpos-logo">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                                <line x1="9" y1="9" x2="9.01" y2="9"/>
                                <line x1="15" y1="9" x2="15.01" y2="9"/>
                            </svg>
                            <span>TPOS Live</span>
                        </div>
                        <button class="tpos-post-selector" id="tposPostSelector">
                            <span id="tposSelectedPost">Chọn bài Live...</span>
                            <i data-lucide="chevron-down"></i>
                        </button>
                    </div>
                    <div class="tpos-header-right">
                        <div class="tpos-socket-status disconnected" id="tposSocketStatus">
                            <span class="tpos-socket-dot"></span>
                            <span>Offline</span>
                        </div>
                        <button class="tpos-header-btn" id="tposRefreshBtn" title="Làm mới">
                            <i data-lucide="refresh-cw"></i>
                        </button>
                        <button class="tpos-header-btn" id="tposSettingsBtn" title="Cài đặt">
                            <i data-lucide="settings"></i>
                        </button>
                    </div>
                </div>

                <!-- Stats Bar -->
                <div class="tpos-stats-bar">
                    <div class="tpos-stats-left">
                        <div class="tpos-stat-item comments">
                            <i data-lucide="message-square"></i>
                            <span id="tposCommentCount">0</span> comments
                        </div>
                        <div class="tpos-stat-item orders">
                            <i data-lucide="shopping-bag"></i>
                            <span id="tposOrderCount">0</span> orders
                        </div>
                    </div>
                    <div class="tpos-stats-right">
                        <button class="tpos-header-btn" id="tposScrollTop" title="Lên đầu">
                            <i data-lucide="chevron-up"></i>
                        </button>
                    </div>
                </div>

                <!-- Filter Tabs -->
                <div class="tpos-filter-tabs">
                    <button class="tpos-filter-tab active" data-filter="all">Tất cả</button>
                    <button class="tpos-filter-tab" data-filter="hasOrder">Đã đặt hàng</button>
                    <button class="tpos-filter-tab" data-filter="noOrder">Chưa đặt</button>
                </div>

                <!-- Comments Container -->
                <div class="tpos-comments-container">
                    <div class="tpos-comments-list" id="tposCommentsList">
                        <!-- Comments will be rendered here -->
                        <div class="tpos-empty-state" id="tposEmptyState">
                            <i data-lucide="message-circle"></i>
                            <h3>Chọn bài Live</h3>
                            <p>Chọn bài viết Live để xem comments real-time</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // =====================================================
    // EVENT BINDINGS
    // =====================================================

    bindEvents() {
        // Post selector
        const postSelector = this.container.querySelector('#tposPostSelector');
        if (postSelector) {
            postSelector.addEventListener('click', () => this.showPostSelector());
        }

        // Refresh button
        const refreshBtn = this.container.querySelector('#tposRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refresh());
        }

        // Settings button
        const settingsBtn = this.container.querySelector('#tposSettingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.showSettings());
        }

        // Filter tabs
        const filterTabs = this.container.querySelectorAll('.tpos-filter-tab');
        filterTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                filterTabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.filterType = e.target.dataset.filter;
                this.applyFilter();
            });
        });

        // Scroll to top
        const scrollTopBtn = this.container.querySelector('#tposScrollTop');
        if (scrollTopBtn) {
            scrollTopBtn.addEventListener('click', () => {
                const list = this.container.querySelector('#tposCommentsList');
                if (list) list.scrollTop = 0;
            });
        }
    }

    // =====================================================
    // WEBSOCKET CONNECTION
    // =====================================================

    async connectWebSocket() {
        const token = await this.getAccessToken();
        if (!token) {
            console.warn('[TPOS-CHAT] No access token for WebSocket');
            return false;
        }

        console.log('[TPOS-CHAT] Connecting to WebSocket...');

        try {
            // Connect to Chat WebSocket
            await this.connectChatSocket();
            return true;
        } catch (error) {
            console.error('[TPOS-CHAT] WebSocket connection failed:', error);
            this.updateSocketStatus(false);
            return false;
        }
    }

    async connectChatSocket() {
        return new Promise((resolve, reject) => {
            const wsUrl = this.config.chatWsUrl;
            console.log('[TPOS-CHAT] Connecting to:', wsUrl);

            this.chatSocket = new WebSocket(wsUrl);

            this.chatSocket.onopen = async () => {
                console.log('[TPOS-CHAT] WebSocket connected');

                // Send Socket.IO handshake
                this.chatSocket.send('40/chatomni,');

                // Join room after small delay
                setTimeout(async () => {
                    await this.joinRoom();
                }, 500);

                this.updateSocketStatus(true);
                this.socketReconnectAttempts = 0;
                resolve(true);
            };

            this.chatSocket.onmessage = (event) => {
                this.handleSocketMessage(event.data);
            };

            this.chatSocket.onclose = () => {
                console.log('[TPOS-CHAT] WebSocket disconnected');
                this.updateSocketStatus(false);
                this.scheduleReconnect();
            };

            this.chatSocket.onerror = (error) => {
                console.error('[TPOS-CHAT] WebSocket error:', error);
                reject(error);
            };

            // Timeout
            setTimeout(() => {
                if (this.chatSocket.readyState !== WebSocket.OPEN) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }

    async joinRoom() {
        if (!this.chatSocket || this.chatSocket.readyState !== WebSocket.OPEN) {
            return;
        }

        const token = await this.getAccessToken();
        const joinMessage = `42/chatomni,["join",{"room":"${this.config.room}","token":"${token}"}]`;
        this.chatSocket.send(joinMessage);
        console.log('[TPOS-CHAT] Joined room:', this.config.room);

        // Start heartbeat
        this.startHeartbeat();
    }

    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.heartbeatInterval = setInterval(() => {
            if (this.chatSocket && this.chatSocket.readyState === WebSocket.OPEN) {
                this.chatSocket.send('2');
            }
        }, 25000);
    }

    handleSocketMessage(data) {
        // Handle Socket.IO messages
        if (data === '2') {
            // Pong - respond with ping
            this.chatSocket.send('3');
            return;
        }

        if (data.startsWith('42/chatomni,')) {
            const jsonStr = data.substring('42/chatomni,'.length);
            try {
                const parsed = JSON.parse(jsonStr);
                const [eventName, eventData] = parsed;

                if (eventName === 'on-events') {
                    this.handleOnEvents(typeof eventData === 'string' ? JSON.parse(eventData) : eventData);
                }
            } catch (e) {
                console.warn('[TPOS-CHAT] Failed to parse message:', e);
            }
        }
    }

    handleOnEvents(data) {
        console.log('[TPOS-CHAT] on-events:', data.Type, data.EventName);

        // Handle new order - update sessionIndex
        if (data.Type === 'SaleOnline_Order' && data.EventName === 'created') {
            this.handleNewOrder(data.Data);
        }

        // Handle new comment
        if (data.Type === 'SaleOnline_Comment' && data.EventName === 'created') {
            this.handleNewComment(data.Data);
        }
    }

    handleNewOrder(orderData) {
        console.log('[TPOS-CHAT] New order:', orderData);

        // Update sessionIndexMap
        if (orderData.Facebook_ASUserId && orderData.SessionIndex) {
            this.sessionIndexMap.set(orderData.Facebook_ASUserId, {
                index: orderData.SessionIndex,
                code: orderData.Code,
                session: orderData.Session,
                postId: orderData.Facebook_PostId
            });

            // Update UI - refresh badges
            this.updateCommentBadges();

            // Update order count
            this.updateOrderCount();
        }
    }

    handleNewComment(commentData) {
        console.log('[TPOS-CHAT] New comment:', commentData);

        // Add to beginning of comments
        const comment = {
            id: commentData.Id,
            from: {
                id: commentData.Facebook_ASUserId,
                name: commentData.Facebook_UserName
            },
            message: commentData.Message,
            created_time: new Date().toISOString(),
            isNew: true
        };

        this.comments.unshift(comment);
        this.applyFilter();
        this.renderComments();

        // Update comment count
        this.updateCommentCount();
    }

    scheduleReconnect() {
        if (this.socketReconnectAttempts >= this.socketMaxReconnectAttempts) {
            console.log('[TPOS-CHAT] Max reconnect attempts reached');
            return;
        }

        const delay = Math.min(2000 * Math.pow(2, this.socketReconnectAttempts), 30000);
        this.socketReconnectAttempts++;

        console.log(`[TPOS-CHAT] Reconnecting in ${delay}ms (attempt ${this.socketReconnectAttempts})`);

        setTimeout(() => {
            this.connectWebSocket();
        }, delay);
    }

    updateSocketStatus(connected) {
        this.isSocketConnected = connected;
        const statusEl = this.container.querySelector('#tposSocketStatus');
        if (statusEl) {
            statusEl.className = `tpos-socket-status ${connected ? 'connected' : 'disconnected'}`;
            statusEl.querySelector('span:last-child').textContent = connected ? 'Online' : 'Offline';
        }
    }

    // =====================================================
    // API METHODS
    // =====================================================

    async fetchSessionIndexes(postId) {
        if (!postId) return;

        console.log('[TPOS-CHAT] Fetching session indexes for post:', postId);

        try {
            const url = `${this.config.apiBaseUrl}/odata/SaleOnline_Facebook_Post/ODataService.GetCommentOrders?$expand=orders&PostId=${postId}`;

            // Use TokenManager's authenticatedFetch for auto token management
            let response;
            if (window.tposTokenManager) {
                response = await window.tposTokenManager.authenticatedFetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': '*/*',
                        'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
                        'tposappversion': '5.11.16.1'
                    }
                });
            } else {
                const authHeader = await this.getAuthHeader();
                response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': '*/*',
                        ...authHeader,
                        'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
                        'tposappversion': '5.11.16.1'
                    }
                });
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // Build sessionIndexMap
            this.sessionIndexMap.clear();
            if (data.value) {
                data.value.forEach(item => {
                    if (item.orders && item.orders.length > 0) {
                        const latestOrder = item.orders[item.orders.length - 1];
                        this.sessionIndexMap.set(item.asuid, {
                            index: latestOrder.index,
                            code: latestOrder.code,
                            session: latestOrder.session,
                            tags: latestOrder.tags ? JSON.parse(latestOrder.tags) : null
                        });
                    }
                });
            }

            console.log('[TPOS-CHAT] Session indexes loaded:', this.sessionIndexMap.size);
            this.updateOrderCount();

        } catch (error) {
            console.error('[TPOS-CHAT] Failed to fetch session indexes:', error);
        }
    }

    async fetchComments(postId) {
        if (!this.accessToken || !postId) return;

        this.isLoading = true;
        this.showLoading();

        try {
            // Fetch session indexes first (one time)
            await this.fetchSessionIndexes(postId);

            // TODO: Implement actual comments fetch from TPOS API
            // For now, use sample data or wait for WebSocket

            this.isLoading = false;
            this.renderComments();

        } catch (error) {
            console.error('[TPOS-CHAT] Failed to fetch comments:', error);
            this.isLoading = false;
            this.showError('Không thể tải comments');
        }
    }

    // =====================================================
    // UI METHODS
    // =====================================================

    renderComments() {
        const listEl = this.container.querySelector('#tposCommentsList');
        if (!listEl) return;

        if (this.filteredComments.length === 0) {
            listEl.innerHTML = `
                <div class="tpos-empty-state">
                    <i data-lucide="message-circle"></i>
                    <h3>Chưa có comments</h3>
                    <p>Comments mới sẽ xuất hiện tại đây</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        let html = '';
        this.filteredComments.forEach(comment => {
            const sessionData = this.sessionIndexMap.get(comment.from?.id);
            const hasOrder = !!sessionData;

            html += `
                <div class="tpos-comment-item ${comment.isNew ? 'tpos-new-comment' : ''}" data-id="${comment.id}">
                    <div class="tpos-avatar-wrapper">
                        <img class="tpos-avatar"
                             src="https://graph.facebook.com/${comment.from?.id}/picture?type=normal"
                             alt="${comment.from?.name || ''}"
                             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                        <div class="tpos-avatar-placeholder" style="display:none">
                            ${(comment.from?.name || '?').charAt(0).toUpperCase()}
                        </div>
                        ${hasOrder ? `<span class="tpos-session-badge">${sessionData.index}</span>` : ''}
                    </div>
                    <div class="tpos-comment-content">
                        <div class="tpos-comment-header">
                            <span class="tpos-comment-name">${comment.from?.name || 'Unknown'}</span>
                            <span class="tpos-comment-time">${this.formatTime(comment.created_time)}</span>
                        </div>
                        <div class="tpos-comment-text">${this.escapeHtml(comment.message || '')}</div>
                        <div class="tpos-comment-actions">
                            <button class="tpos-action-btn primary">
                                <i data-lucide="shopping-cart"></i>
                                <span>Tạo đơn hàng</span>
                            </button>
                            <button class="tpos-action-btn">
                                <i data-lucide="info"></i>
                                <span>Thông tin</span>
                            </button>
                            <button class="tpos-action-btn">
                                <i data-lucide="message-square"></i>
                                <span>Tin nhắn</span>
                            </button>
                            ${hasOrder ? `
                                <span class="tpos-status-badge normal">Bình thường</span>
                            ` : ''}
                        </div>
                    </div>
                    ${hasOrder ? `
                        <div class="tpos-comment-meta">
                            <span class="tpos-order-code">${sessionData.code || ''}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        listEl.innerHTML = html;

        // Clear new flag after animation
        setTimeout(() => {
            this.filteredComments.forEach(c => c.isNew = false);
        }, 1000);

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    updateCommentBadges() {
        // Re-render to update badges
        this.renderComments();
    }

    applyFilter() {
        switch (this.filterType) {
            case 'hasOrder':
                this.filteredComments = this.comments.filter(c =>
                    this.sessionIndexMap.has(c.from?.id)
                );
                break;
            case 'noOrder':
                this.filteredComments = this.comments.filter(c =>
                    !this.sessionIndexMap.has(c.from?.id)
                );
                break;
            default:
                this.filteredComments = [...this.comments];
        }
    }

    updateCommentCount() {
        const countEl = this.container.querySelector('#tposCommentCount');
        if (countEl) {
            countEl.textContent = this.comments.length;
        }
    }

    updateOrderCount() {
        const countEl = this.container.querySelector('#tposOrderCount');
        if (countEl) {
            countEl.textContent = this.sessionIndexMap.size;
        }
    }

    showLoading() {
        const listEl = this.container.querySelector('#tposCommentsList');
        if (listEl) {
            listEl.innerHTML = `
                <div class="tpos-loading">
                    <div class="tpos-loading-spinner"></div>
                </div>
            `;
        }
    }

    showError(message) {
        const listEl = this.container.querySelector('#tposCommentsList');
        if (listEl) {
            listEl.innerHTML = `
                <div class="tpos-empty-state">
                    <i data-lucide="alert-circle"></i>
                    <h3>Lỗi</h3>
                    <p>${message}</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    showLoginPrompt() {
        const listEl = this.container.querySelector('#tposCommentsList');
        if (listEl) {
            listEl.innerHTML = `
                <div class="tpos-empty-state">
                    <i data-lucide="key"></i>
                    <h3>Đang lấy token TPOS...</h3>
                    <p>Hệ thống sẽ tự động xác thực</p>
                    <div class="tpos-loading-spinner" style="margin-top: 16px;"></div>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();

            // Auto fetch token
            this.autoFetchToken();
        }
    }

    async autoFetchToken() {
        try {
            if (window.tposTokenManager) {
                console.log('[TPOS-CHAT] Auto-fetching token...');
                await window.tposTokenManager.getToken();

                // Token fetched, now connect WebSocket
                await this.connectWebSocket();

                // Show empty state with instructions
                this.showEmptyState();
            }
        } catch (error) {
            console.error('[TPOS-CHAT] Auto-fetch token failed:', error);
            this.showTokenError(error.message);
        }
    }

    showTokenError(errorMessage) {
        const listEl = this.container.querySelector('#tposCommentsList');
        if (listEl) {
            listEl.innerHTML = `
                <div class="tpos-empty-state">
                    <i data-lucide="alert-circle"></i>
                    <h3>Lỗi xác thực</h3>
                    <p>${errorMessage}</p>
                    <button class="tpos-action-btn primary" onclick="window.tposChatManager.showSettings()" style="margin-top: 16px;">
                        <i data-lucide="refresh-cw"></i>
                        <span>Thử lại</span>
                    </button>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    showEmptyState() {
        const listEl = this.container.querySelector('#tposCommentsList');
        if (listEl) {
            listEl.innerHTML = `
                <div class="tpos-empty-state">
                    <i data-lucide="message-circle"></i>
                    <h3>Sẵn sàng</h3>
                    <p>Chọn bài Live để xem comments real-time</p>
                    <button class="tpos-action-btn primary" onclick="window.tposChatManager.showPostSelector()" style="margin-top: 16px;">
                        <i data-lucide="play-circle"></i>
                        <span>Chọn bài Live</span>
                    </button>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    showPostSelector() {
        // TODO: Implement post selector modal
        alert('Chức năng chọn bài Live đang được phát triển');
    }

    showSettings() {
        if (window.tposTokenManager) {
            const tokenInfo = window.tposTokenManager.getTokenInfo();
            let message = '=== TPOS Token Info ===\n\n';

            if (tokenInfo.hasToken) {
                message += `✅ Token: ${tokenInfo.token}\n`;
                message += `📅 Hết hạn: ${tokenInfo.expiresAt}\n`;
                message += `⏱️ Còn lại: ${tokenInfo.timeRemaining}\n`;
                message += `${tokenInfo.isValid ? '✅ Trạng thái: Còn hạn' : '❌ Trạng thái: Hết hạn'}\n\n`;
                message += 'Bấm OK để làm mới token, Cancel để đóng.';

                if (confirm(message)) {
                    window.tposTokenManager.refresh().then(() => {
                        alert('✅ Token đã được làm mới!');
                        this.connectWebSocket();
                    }).catch(err => {
                        alert('❌ Lỗi: ' + err.message);
                    });
                }
            } else {
                message += '❌ Chưa có token\n\n';
                message += 'Bấm OK để lấy token mới.';

                if (confirm(message)) {
                    window.tposTokenManager.getToken().then(() => {
                        alert('✅ Token đã được lấy!');
                        this.connectWebSocket();
                    }).catch(err => {
                        alert('❌ Lỗi: ' + err.message);
                    });
                }
            }
        } else {
            alert('TokenManager chưa sẵn sàng. Vui lòng reload trang.');
        }
    }

    async refresh() {
        if (this.currentPostId) {
            await this.fetchComments(this.currentPostId);
        }
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    formatTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Vừa xong';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} phút`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ`;

        return date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // =====================================================
    // CLEANUP
    // =====================================================

    destroy() {
        if (this.chatSocket) {
            this.chatSocket.close();
        }
        if (this.rtSocket) {
            this.rtSocket.close();
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
    }
}

// Create global instance
window.tposChatManager = new TposChatManager();

// Auto-initialize when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Will be initialized by index.html after a delay
    console.log('[TPOS-CHAT] TposChatManager ready');
});
