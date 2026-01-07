// =====================================================
// TPOS CHAT MANAGER - Render Chat UI & Handle Realtime
// =====================================================

class TposChatManager {
    constructor() {
        this.containerId = null;
        this.conversations = [];
        this.isLoading = false;
        this.selectedConversationId = null;

        // Pagination
        this.page = 1;
        this.pageSize = 20;
        this.hasMore = true;

        // API config
        this.apiBaseUrl = 'https://n2store-fallback.onrender.com';
    }

    /**
     * Initialize chat manager
     */
    async initialize(containerId) {
        this.containerId = containerId;
        console.log('[TPOS-CHAT] Initializing with container:', containerId);

        // Render initial UI
        this.renderContainer();

        // Setup realtime event listeners
        this.setupRealtimeListeners();

        // Load initial conversations
        await this.loadConversations();
    }

    /**
     * Setup realtime event listeners
     */
    setupRealtimeListeners() {
        // Listen for conversation updates
        window.addEventListener('tposConversationUpdate', (event) => {
            const { conversation, eventType, rawData } = event.detail;
            this.handleConversationUpdate(conversation, eventType, rawData);
        });

        // Listen for new orders (SaleOnline_Order)
        window.addEventListener('tposNewOrder', (event) => {
            const orderInfo = event.detail;
            this.handleNewOrder(orderInfo);
        });

        // Listen for order updates (SaleOnline_Update)
        window.addEventListener('tposOrderUpdate', (event) => {
            const data = event.detail;
            this.handleOrderUpdate(data);
        });

        // Listen for connection status changes
        window.addEventListener('tposRealtimeConnected', () => {
            this.updateConnectionStatus(true);
        });

        window.addEventListener('tposRealtimeDisconnected', () => {
            this.updateConnectionStatus(false);
        });
    }

    /**
     * Render the main container structure
     */
    renderContainer() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('[TPOS-CHAT] Container not found:', this.containerId);
            return;
        }

        container.innerHTML = `
            <div class="tpos-chat-wrapper">
                <!-- Header with filters -->
                <div class="tpos-chat-header">
                    <div class="tpos-status-indicator" id="tposStatusIndicator">
                        <span class="status-dot disconnected"></span>
                        <span class="status-text">Disconnected</span>
                    </div>
                    <div class="tpos-filters">
                        <select id="tposChannelFilter" class="tpos-filter-select">
                            <option value="">All Channels</option>
                            <option value="4">Zalo</option>
                            <option value="1">Facebook</option>
                            <option value="2">Website</option>
                        </select>
                    </div>
                    <button class="tpos-btn-refresh" id="btnTposRefresh" title="Refresh">
                        <i data-lucide="refresh-cw"></i>
                    </button>
                </div>

                <!-- Conversation list -->
                <div class="tpos-conversation-list" id="tposConversationList">
                    <div class="tpos-loading">
                        <i data-lucide="loader-2" class="spin"></i>
                        <span>Loading conversations...</span>
                    </div>
                </div>

                <!-- Load more button -->
                <div class="tpos-load-more" id="tposLoadMore" style="display: none;">
                    <button class="tpos-btn-load-more" id="btnTposLoadMore">
                        Load more
                    </button>
                </div>
            </div>
        `;

        // Refresh Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Setup event handlers
        this.setupEventHandlers();
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Refresh button
        const btnRefresh = document.getElementById('btnTposRefresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => this.refresh());
        }

        // Load more button
        const btnLoadMore = document.getElementById('btnTposLoadMore');
        if (btnLoadMore) {
            btnLoadMore.addEventListener('click', () => this.loadMore());
        }

        // Channel filter
        const channelFilter = document.getElementById('tposChannelFilter');
        if (channelFilter) {
            channelFilter.addEventListener('change', () => this.onFilterChange());
        }
    }

    /**
     * Load conversations from API
     */
    async loadConversations(append = false) {
        if (this.isLoading) return;

        this.isLoading = true;
        const listContainer = document.getElementById('tposConversationList');

        if (!append && listContainer) {
            listContainer.innerHTML = `
                <div class="tpos-loading">
                    <i data-lucide="loader-2" class="spin"></i>
                    <span>Loading conversations...</span>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        try {
            // Get token
            if (!window.tposTokenManager) {
                throw new Error('Token manager not available');
            }

            const token = await window.tposTokenManager.getToken();
            if (!token) {
                throw new Error('No token available');
            }

            // Build API URL - using TPOS OData API
            const filter = document.getElementById('tposChannelFilter')?.value;
            let apiUrl = `${this.apiBaseUrl}/api/odata/ChatOmni.GetConversations?$top=${this.pageSize}&$skip=${(this.page - 1) * this.pageSize}&$orderby=LastActivityOn desc`;

            if (filter) {
                apiUrl += `&$filter=ChannelType eq ${filter}`;
            }

            const response = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            const newConversations = data.value || [];

            if (append) {
                this.conversations = [...this.conversations, ...newConversations];
            } else {
                this.conversations = newConversations;
            }

            this.hasMore = newConversations.length === this.pageSize;
            this.renderConversations();

        } catch (error) {
            console.error('[TPOS-CHAT] Error loading conversations:', error);
            if (listContainer) {
                listContainer.innerHTML = `
                    <div class="tpos-error">
                        <i data-lucide="alert-circle"></i>
                        <span>Error: ${error.message}</span>
                        <button class="tpos-btn-retry" onclick="window.tposChatManager.refresh()">Retry</button>
                    </div>
                `;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Render conversation list
     */
    renderConversations() {
        const listContainer = document.getElementById('tposConversationList');
        if (!listContainer) return;

        if (this.conversations.length === 0) {
            listContainer.innerHTML = `
                <div class="tpos-empty">
                    <i data-lucide="inbox"></i>
                    <span>No conversations</span>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        listContainer.innerHTML = this.conversations.map(conv => this.renderConversationItem(conv)).join('');

        // Show/hide load more button
        const loadMoreContainer = document.getElementById('tposLoadMore');
        if (loadMoreContainer) {
            loadMoreContainer.style.display = this.hasMore ? 'flex' : 'none';
        }

        // Refresh Lucide icons
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /**
     * Render single conversation item
     */
    renderConversationItem(conv) {
        const id = conv.Id || conv.id;
        const customerName = conv.CustomerName || conv.FromName || 'Unknown';
        const lastMessage = conv.LastMessage || conv.Snippet || '';
        const lastActivityOn = conv.LastActivityOn || conv.UpdatedAt;
        const channelType = conv.ChannelType || 4;
        const unreadCount = conv.UnreadCount || 0;
        const tags = conv.Tags || [];
        const orderCode = conv.OrderCode || '';
        const status = conv.Status || 'normal';

        // Format time
        const timeStr = this.formatTime(lastActivityOn);

        // Channel icon
        const channelIcon = this.getChannelIcon(channelType);

        // Status class
        const statusClass = status === 'warning' ? 'warning' : 'normal';
        const statusText = status === 'warning' ? 'Cảnh báo' : 'Bình thường';

        // Tags HTML
        const tagsHtml = tags.slice(0, 3).map(tag =>
            `<span class="tpos-tag">${this.escapeHtml(tag)}</span>`
        ).join('');

        return `
            <div class="tpos-conversation-item ${unreadCount > 0 ? 'unread' : ''}"
                 data-id="${id}"
                 onclick="window.tposChatManager.selectConversation('${id}')">
                <div class="tpos-conv-avatar">
                    <div class="avatar-circle">
                        <i data-lucide="user"></i>
                    </div>
                    <span class="channel-badge">${channelIcon}</span>
                </div>
                <div class="tpos-conv-content">
                    <div class="tpos-conv-header">
                        <span class="customer-name">${this.escapeHtml(customerName)}</span>
                        ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
                    </div>
                    <div class="tpos-conv-tags">
                        ${tagsHtml}
                        ${orderCode ? `<span class="tpos-tag order-tag">#${this.escapeHtml(orderCode)}</span>` : ''}
                    </div>
                    <div class="tpos-conv-message">${this.escapeHtml(lastMessage)}</div>
                </div>
                <div class="tpos-conv-actions">
                    <button class="tpos-action-btn" title="Tạo đơn hàng" onclick="event.stopPropagation(); window.tposChatManager.createOrder('${id}')">
                        <i data-lucide="shopping-cart"></i>
                    </button>
                    <button class="tpos-action-btn" title="Thông tin" onclick="event.stopPropagation(); window.tposChatManager.showInfo('${id}')">
                        <i data-lucide="info"></i>
                    </button>
                    <button class="tpos-action-btn" title="Tin nhắn" onclick="event.stopPropagation(); window.tposChatManager.openChat('${id}')">
                        <i data-lucide="message-circle"></i>
                    </button>
                </div>
                <div class="tpos-conv-meta">
                    <span class="tpos-conv-time">${timeStr}</span>
                    <span class="tpos-conv-status ${statusClass}">${statusText}</span>
                </div>
            </div>
        `;
    }

    /**
     * Handle realtime conversation update
     */
    handleConversationUpdate(conversation, eventType, rawData) {
        console.log('[TPOS-CHAT] Handling conversation update:', conversation.Id, 'Type:', eventType);

        // Find existing conversation
        const index = this.conversations.findIndex(c =>
            (c.Id || c.id) === conversation.Id
        );

        // Merge new data
        const updatedConv = {
            ...conversation,
            LastMessage: conversation.Message,
            LastActivityOn: new Date().toISOString(),
            EventType: eventType
        };

        if (index >= 0) {
            // Update existing - move to top
            this.conversations.splice(index, 1);
            this.conversations.unshift(updatedConv);
        } else {
            // Add new at top
            this.conversations.unshift(updatedConv);
        }

        // Re-render
        this.renderConversations();

        // Highlight the updated conversation
        setTimeout(() => {
            const item = document.querySelector(`[data-id="${conversation.Id}"]`);
            if (item) {
                item.classList.add('highlight');
                setTimeout(() => item.classList.remove('highlight'), 2000);
            }
        }, 100);
    }

    /**
     * Handle new order event (SaleOnline_Order)
     */
    handleNewOrder(orderInfo) {
        console.log('[TPOS-CHAT] 🔥 New order received:', orderInfo.customerName);

        // Create a conversation-like object for display
        const newConv = {
            Id: orderInfo.id || orderInfo.conversationId,
            CustomerName: orderInfo.customerName,
            LastMessage: orderInfo.content,
            LastActivityOn: new Date().toISOString(),
            UnreadCount: 1,
            Tags: ['Đơn mới'],
            Status: 'normal',
            EventType: 'SaleOnline_Order',
            Customer: orderInfo.customer,
            Product: orderInfo.product
        };

        // Add to top of list
        this.conversations.unshift(newConv);

        // Re-render
        this.renderConversations();

        // Highlight
        setTimeout(() => {
            const item = document.querySelector(`[data-id="${newConv.Id}"]`);
            if (item) {
                item.classList.add('highlight');
                setTimeout(() => item.classList.remove('highlight'), 3000);
            }
        }, 100);
    }

    /**
     * Handle order update event (SaleOnline_Update)
     */
    handleOrderUpdate(data) {
        console.log('[TPOS-CHAT] 📝 Order update:', data.Id);

        // Find and update the conversation
        const index = this.conversations.findIndex(c =>
            (c.Id || c.id) === data.Id
        );

        if (index >= 0) {
            // Update the conversation data
            this.conversations[index] = {
                ...this.conversations[index],
                ...data,
                LastActivityOn: new Date().toISOString()
            };

            // Re-render
            this.renderConversations();
        }
    }

    /**
     * Update connection status indicator
     */
    updateConnectionStatus(connected) {
        const indicator = document.getElementById('tposStatusIndicator');
        if (!indicator) return;

        const dot = indicator.querySelector('.status-dot');
        const text = indicator.querySelector('.status-text');

        if (connected) {
            dot?.classList.remove('disconnected');
            dot?.classList.add('connected');
            if (text) text.textContent = 'Connected';
        } else {
            dot?.classList.remove('connected');
            dot?.classList.add('disconnected');
            if (text) text.textContent = 'Disconnected';
        }
    }

    /**
     * Select a conversation
     */
    selectConversation(id) {
        this.selectedConversationId = id;

        // Update selection UI
        document.querySelectorAll('.tpos-conversation-item').forEach(item => {
            item.classList.remove('selected');
        });
        const selectedItem = document.querySelector(`[data-id="${id}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('tposConversationSelected', {
            detail: { conversationId: id }
        }));
    }

    /**
     * Refresh conversations
     */
    async refresh() {
        this.page = 1;
        this.conversations = [];
        await this.loadConversations();

        // Also reconnect realtime if available
        if (window.tposRealtimeManager) {
            window.tposRealtimeManager.reconnect();
        }
    }

    /**
     * Load more conversations
     */
    async loadMore() {
        if (!this.hasMore || this.isLoading) return;
        this.page++;
        await this.loadConversations(true);
    }

    /**
     * Handle filter change
     */
    async onFilterChange() {
        this.page = 1;
        this.conversations = [];
        await this.loadConversations();
    }

    /**
     * Action: Create order
     */
    createOrder(conversationId) {
        console.log('[TPOS-CHAT] Create order for:', conversationId);
        // TODO: Implement create order logic
        if (window.notificationManager) {
            window.notificationManager.show('Tạo đơn hàng - Coming soon', 'info');
        }
    }

    /**
     * Action: Show info
     */
    showInfo(conversationId) {
        console.log('[TPOS-CHAT] Show info for:', conversationId);
        const conv = this.conversations.find(c => (c.Id || c.id) === conversationId);
        if (conv) {
            alert(`Customer: ${conv.CustomerName || 'Unknown'}\nChannel: ${this.getChannelName(conv.ChannelType)}\nLast activity: ${conv.LastActivityOn}`);
        }
    }

    /**
     * Action: Open chat
     */
    openChat(conversationId) {
        console.log('[TPOS-CHAT] Open chat for:', conversationId);
        // TODO: Implement chat view
        if (window.notificationManager) {
            window.notificationManager.show('Chat view - Coming soon', 'info');
        }
    }

    // =====================================================
    // UTILITY FUNCTIONS
    // =====================================================

    getChannelIcon(channelType) {
        switch (channelType) {
            case 1: return '<i data-lucide="facebook" class="channel-icon fb"></i>';
            case 4: return '<i data-lucide="message-square" class="channel-icon zalo"></i>';
            case 2: return '<i data-lucide="globe" class="channel-icon web"></i>';
            default: return '<i data-lucide="message-circle" class="channel-icon"></i>';
        }
    }

    getChannelName(channelType) {
        switch (channelType) {
            case 1: return 'Facebook';
            case 4: return 'Zalo';
            case 2: return 'Website';
            default: return 'Other';
        }
    }

    formatTime(dateStr) {
        if (!dateStr) return '';

        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;

        // Today
        if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
            return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }

        // This week
        if (diff < 7 * 24 * 60 * 60 * 1000) {
            return date.toLocaleDateString('vi-VN', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
        }

        // Older
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Create global instance
window.tposChatManager = new TposChatManager();
console.log('[TPOS-CHAT] TposChatManager loaded');
