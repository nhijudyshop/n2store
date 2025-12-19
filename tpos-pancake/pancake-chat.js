/* =====================================================
   PANCAKE CHAT MANAGER - Giao dien chat Pancake
   ===================================================== */

class PancakeChatManager {
    constructor() {
        this.conversations = [];
        this.activeConversation = null;
        this.messages = [];
        this.isLoading = false;
        this.searchQuery = '';
        this.filterType = 'all'; // 'all', 'unread', 'inbox', 'comment'

        // Page Selector
        this.pages = [];
        this.pagesWithUnread = [];
        this.selectedPageId = null; // null = all pages
        this.isPageDropdownOpen = false;

        // WebSocket Realtime (Phoenix Protocol)
        this.socket = null;
        this.socketReconnectAttempts = 0;
        this.socketMaxReconnectAttempts = 3; // Reduced from 10 - WebSocket often blocked on GitHub Pages
        this.socketReconnectDelay = 2000; // Start with 2s, exponential backoff
        this.socketReconnectTimer = null; // Timer for reconnection
        this.isSocketConnecting = false; // Flag to prevent duplicate connections
        this.heartbeatInterval = null;
        this.HEARTBEAT_INTERVAL = 30000; // 30 seconds heartbeat
        this.socketJoinRef = 0;
        this.socketMsgRef = 0;
        this.userId = null;
        this.isSocketConnected = false;

        // Fallback auto-refresh (when socket fails)
        this.autoRefreshInterval = null;
        this.AUTO_REFRESH_INTERVAL = 30000; // 30 seconds fallback

        // Quick reply templates
        this.quickReplies = [
            { label: 'NV My KH dat', color: 'blue', template: '' },
            { label: 'NV My CK + Gap', color: 'blue', template: '' },
            { label: 'NHAC KHACH', color: 'red', template: '' },
            { label: 'XIN DIA CHI', color: 'purple', template: '' },
            { label: 'NV .BO', color: 'teal', template: '' },
            { label: 'NJD OI', color: 'green', template: '' },
            { label: 'NV. Lai', color: 'orange', template: '' },
            { label: 'NV. Hanh', color: 'pink', template: '' },
            { label: 'Nv.Huyen', color: 'pink', template: '' },
            { label: 'Nv. Duyen', color: 'teal', template: '' },
            { label: 'XU LY BC', color: 'purple', template: '' },
            { label: 'BOOM', color: 'red', template: '' },
            { label: 'CHECK IB', color: 'green', template: '' },
            { label: 'Nv My', color: 'blue', template: '' }
        ];

        // DOM Elements
        this.container = null;
        this.conversationList = null;
        this.chatWindow = null;
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    async initialize(containerId = 'pancakeContent') {
        console.log('[PANCAKE-CHAT] Initializing...');

        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('[PANCAKE-CHAT] Container not found:', containerId);
            return false;
        }

        // Render initial UI
        this.render();

        // Initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Initialize token manager and data manager if not already
        if (window.pancakeTokenManager) {
            await window.pancakeTokenManager.initialize();
        }

        if (window.pancakeDataManager) {
            // Load pages first (for Page Selector)
            await this.loadPages();

            // Fetch initial conversations
            await this.loadConversations();
        } else {
            console.warn('[PANCAKE-CHAT] PancakeDataManager not available');
        }

        // Bind events
        this.bindEvents();

        // Initialize WebSocket realtime connection (preferred)
        const socketConnected = await this.initializeWebSocket();

        // Fall back to polling if WebSocket fails
        if (!socketConnected) {
            console.log('[PANCAKE-CHAT] WebSocket unavailable, using polling fallback');
            this.startAutoRefresh();
        }

        // Request notification permission
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        console.log('[PANCAKE-CHAT] Initialized successfully');
        return true;
    }

    // =====================================================
    // RENDER METHODS
    // =====================================================

    render() {
        this.container.innerHTML = `
            <div class="pancake-chat-container">
                <!-- Header Tabs -->
                <div class="pk-header-tabs">
                    <div class="pk-header-tabs-left">
                        <div class="pk-pancake-logo">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#00a884"/>
                                <path d="M2 17L12 22L22 17V12L12 17L2 12V17Z" fill="#00a884" opacity="0.7"/>
                            </svg>
                            <span>Pancake</span>
                        </div>
                        <button class="pk-header-tab active" data-tab="conversations">
                            <i data-lucide="message-circle"></i>
                            <span>Hội thoại</span>
                        </button>
                        <button class="pk-header-tab" data-tab="orders">
                            <i data-lucide="shopping-bag"></i>
                            <span>Đơn hàng</span>
                        </button>
                        <button class="pk-header-tab" data-tab="posts">
                            <i data-lucide="file-text"></i>
                            <span>Bài viết</span>
                        </button>
                        <button class="pk-header-tab" data-tab="stats">
                            <i data-lucide="bar-chart-2"></i>
                            <span>Thống kê</span>
                        </button>
                        <button class="pk-header-tab" data-tab="settings">
                            <i data-lucide="settings"></i>
                            <span>Cài đặt</span>
                        </button>
                    </div>
                    <div class="pk-header-tabs-right">
                        <span class="pk-socket-status" id="pkSocketStatus" title="Trạng thái kết nối realtime">
                            <i data-lucide="wifi-off" class="pk-socket-icon disconnected"></i>
                        </span>
                        <button class="pk-header-icon-btn" title="Thông báo">
                            <i data-lucide="bell"></i>
                        </button>
                        <button class="pk-header-icon-btn" title="Tài khoản">
                            <i data-lucide="user"></i>
                        </button>
                    </div>
                </div>

                <!-- Tab Content Container -->
                <div class="pk-tab-content-container">
                    <!-- Conversations Tab (active) -->
                    <div class="pk-tab-content active" id="pkTabConversations">
                        <div class="pk-conversations-layout">
                            <!-- Conversation List (Left Panel) -->
                            <div class="pk-conversation-list" id="pkConversationList">
                    <!-- Page Selector -->
                    <div class="pk-page-selector" style="position: relative;">
                        <button class="pk-page-selector-btn" id="pkPageSelectorBtn">
                            <div class="pk-page-avatar-placeholder" id="pkSelectedPageAvatar">
                                <i data-lucide="layout-grid"></i>
                            </div>
                            <div class="pk-page-info">
                                <div class="pk-page-name" id="pkSelectedPageName">Tất cả Pages</div>
                                <div class="pk-page-hint" id="pkSelectedPageHint">Chọn page để lọc hội thoại</div>
                            </div>
                            <span class="pk-page-unread-badge" id="pkTotalUnreadBadge" style="display: none;">0</span>
                            <i data-lucide="chevron-down" class="pk-page-selector-icon"></i>
                        </button>

                        <!-- Page Dropdown -->
                        <div class="pk-page-dropdown" id="pkPageDropdown">
                            <div class="pk-page-dropdown-header">Chọn Page</div>
                            <div id="pkPageList">
                                <div class="pk-loading">
                                    <div class="pk-loading-spinner"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Filter Tabs -->
                    <div class="pk-filter-tabs">
                        <button class="pk-filter-tab active" data-filter="all">Tất cả</button>
                        <button class="pk-filter-tab" data-filter="inbox">Inbox</button>
                        <button class="pk-filter-tab" data-filter="comment">Comment</button>
                        <button class="pk-filter-tab" data-filter="unread">Chưa đọc</button>
                    </div>

                    <!-- Search Header -->
                    <div class="pk-search-header">
                        <div class="pk-search-wrapper">
                            <div class="pk-search-box">
                                <i data-lucide="search"></i>
                                <input type="text" id="pkSearchInput" placeholder="Tìm kiếm">
                            </div>
                        </div>
                    </div>

                    <!-- Conversations -->
                    <div class="pk-conversations" id="pkConversations">
                        <div class="pk-loading">
                            <div class="pk-loading-spinner"></div>
                        </div>
                    </div>
                </div>

                            <!-- Chat Window (Right Panel) -->
                            <div class="pk-chat-window" id="pkChatWindow">
                                <div class="pk-empty-state">
                                    <i data-lucide="message-square"></i>
                                    <h3>Chọn hội thoại</h3>
                                    <p>Chọn một cuộc trò chuyện từ danh sách bên trái để bắt đầu nhắn tin</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Orders Tab -->
                    <div class="pk-tab-content" id="pkTabOrders">
                        <div class="pk-tab-placeholder">
                            <i data-lucide="shopping-bag"></i>
                            <h3>Đơn hàng</h3>
                            <p>Quản lý đơn hàng - Đang phát triển</p>
                        </div>
                    </div>

                    <!-- Posts Tab -->
                    <div class="pk-tab-content" id="pkTabPosts">
                        <div class="pk-tab-placeholder">
                            <i data-lucide="file-text"></i>
                            <h3>Bài viết</h3>
                            <p>Quản lý bài viết - Đang phát triển</p>
                        </div>
                    </div>

                    <!-- Stats Tab -->
                    <div class="pk-tab-content" id="pkTabStats">
                        <div class="pk-tab-placeholder">
                            <i data-lucide="bar-chart-2"></i>
                            <h3>Thống kê</h3>
                            <p>Báo cáo thống kê - Đang phát triển</p>
                        </div>
                    </div>

                    <!-- Settings Tab -->
                    <div class="pk-tab-content" id="pkTabSettings">
                        <div class="pk-tab-placeholder">
                            <i data-lucide="settings"></i>
                            <h3>Cài đặt</h3>
                            <p>Cấu hình hệ thống - Đang phát triển</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderConversationList() {
        const container = document.getElementById('pkConversations');
        if (!container) return;

        if (this.conversations.length === 0) {
            container.innerHTML = `
                <div class="pk-empty-state" style="padding: 40px 20px;">
                    <i data-lucide="inbox"></i>
                    <h3>Không có hội thoại</h3>
                    <p>Chưa có cuộc trò chuyện nào</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Filter conversations
        let filtered = this.conversations;

        // Filter by selected page
        if (this.selectedPageId) {
            // Find the selected page to get all possible IDs
            const selectedPage = this.pages.find(p => p.id === this.selectedPageId);
            const pageIdsToMatch = selectedPage
                ? [selectedPage.id, selectedPage.fb_page_id, selectedPage.page_id].filter(Boolean)
                : [this.selectedPageId];

            filtered = filtered.filter(conv =>
                pageIdsToMatch.includes(conv.page_id)
            );
        }

        // Filter by search query
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(conv => {
                const name = (conv.from?.name || conv.customers?.[0]?.name || '').toLowerCase();
                const snippet = (conv.snippet || '').toLowerCase();
                return name.includes(query) || snippet.includes(query);
            });
        }

        // Filter by type
        if (this.filterType === 'unread') {
            filtered = filtered.filter(conv => conv.unread_count > 0);
        } else if (this.filterType === 'inbox') {
            filtered = filtered.filter(conv => conv.type === 'INBOX');
        } else if (this.filterType === 'comment') {
            filtered = filtered.filter(conv => conv.type === 'COMMENT');
        }

        if (filtered.length === 0) {
            const selectedPage = this.pages.find(p => p.id === this.selectedPageId);
            const pageName = selectedPage?.name || 'page này';
            container.innerHTML = `
                <div class="pk-empty-state" style="padding: 40px 20px;">
                    <i data-lucide="inbox"></i>
                    <h3>Không có hội thoại</h3>
                    <p>Không tìm thấy hội thoại nào ${this.selectedPageId ? `trong ${pageName}` : ''}</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        container.innerHTML = filtered.map(conv => this.renderConversationItem(conv)).join('');

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    renderConversationItem(conv) {
        const name = conv.from?.name || conv.customers?.[0]?.name || 'Unknown';
        const avatar = this.getAvatarHtml(conv);
        const preview = conv.snippet || conv.last_message?.text || '';
        const time = this.formatTime(conv.updated_at);
        const unreadCount = conv.unread_count || 0;
        const isUnread = unreadCount > 0;
        const isActive = this.activeConversation?.id === conv.id;
        const tags = this.getTagsHtml(conv);

        return `
            <div class="pk-conversation-item ${isActive ? 'active' : ''}" data-conv-id="${conv.id}" data-page-id="${conv.page_id}">
                <div class="pk-avatar">
                    ${avatar}
                    ${unreadCount > 0 ? `<span class="pk-unread-badge">${unreadCount > 9 ? '9+' : unreadCount}</span>` : ''}
                </div>
                <div class="pk-conversation-content">
                    <div class="pk-conversation-header">
                        <span class="pk-conversation-name">${this.escapeHtml(name)}</span>
                        <span class="pk-conversation-time">${time}</span>
                    </div>
                    <div class="pk-conversation-preview ${isUnread ? 'unread' : ''}">${this.escapeHtml(preview)}</div>
                    ${tags ? `<div class="pk-tags-container">${tags}</div>` : ''}
                </div>
                <div class="pk-conversation-actions">
                    <div class="pk-action-buttons">
                        <button class="pk-action-btn phone" title="Gọi điện">
                            <i data-lucide="phone"></i>
                        </button>
                        <button class="pk-action-btn email" title="Gửi mail">
                            <i data-lucide="mail"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    renderChatWindow(conv) {
        const chatWindow = document.getElementById('pkChatWindow');
        if (!chatWindow) return;

        const name = conv.from?.name || conv.customers?.[0]?.name || 'Unknown';
        const avatar = this.getAvatarHtml(conv, 'chat');
        const location = conv.customers?.[0]?.address?.province || '';
        const status = this.getChatStatus(conv);

        chatWindow.innerHTML = `
            <!-- Chat Header -->
            <div class="pk-chat-header">
                <div class="pk-chat-header-left">
                    ${avatar}
                    <div class="pk-chat-info">
                        <div class="pk-chat-name">
                            <span>${this.escapeHtml(name)}</span>
                            ${location ? `<span class="pk-location-badge"><i data-lucide="map-pin"></i> ${this.escapeHtml(location)}</span>` : ''}
                        </div>
                        <div class="pk-chat-status">${this.escapeHtml(status)}</div>
                    </div>
                </div>
                <div class="pk-chat-header-right">
                    <button class="pk-header-btn" title="Liên kết">
                        <i data-lucide="link"></i>
                    </button>
                    <button class="pk-header-btn" title="Lịch sử">
                        <i data-lucide="history"></i>
                    </button>
                    <button class="pk-header-btn" title="Thêm thành viên">
                        <i data-lucide="user-plus"></i>
                    </button>
                    <button class="pk-header-btn" title="In">
                        <i data-lucide="printer"></i>
                    </button>
                </div>
            </div>

            <!-- Chat Messages -->
            <div class="pk-chat-messages" id="pkChatMessages">
                <div class="pk-loading">
                    <div class="pk-loading-spinner"></div>
                </div>
            </div>

            <!-- Quick Reply Bar -->
            <div class="pk-quick-reply-bar" id="pkQuickReplyBar">
                ${this.renderQuickReplies()}
            </div>

            <!-- Reply From Label -->
            <div class="pk-reply-from">
                <i data-lucide="reply"></i>
                <span>Trả lời từ <strong>NhiJudy Store</strong></span>
            </div>

            <!-- Chat Input -->
            <div class="pk-chat-input-container">
                <div class="pk-input-actions">
                    <button class="pk-input-btn" title="Đính kèm">
                        <i data-lucide="paperclip"></i>
                    </button>
                    <button class="pk-input-btn" title="Hình ảnh">
                        <i data-lucide="image"></i>
                    </button>
                    <button class="pk-input-btn" title="Emoji">
                        <i data-lucide="smile"></i>
                    </button>
                </div>
                <div class="pk-chat-input-wrapper">
                    <textarea id="pkChatInput" class="pk-chat-input" placeholder="Nhập tin nhắn..." rows="1"></textarea>
                </div>
                <button class="pk-send-btn" id="pkSendBtn" title="Gửi">
                    <i data-lucide="send"></i>
                </button>
            </div>
        `;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Load messages
        this.loadMessages(conv);

        // Bind chat input events
        this.bindChatInputEvents();
    }

    renderQuickReplies() {
        // Row 1
        const row1 = this.quickReplies.slice(0, 7);
        // Row 2
        const row2 = this.quickReplies.slice(7);

        return `
            <div class="pk-quick-reply-row">
                ${row1.map(qr => `
                    <button class="pk-quick-reply-btn ${qr.color}" data-template="${this.escapeHtml(qr.template)}">${this.escapeHtml(qr.label)}</button>
                `).join('')}
            </div>
            <div class="pk-quick-reply-row">
                ${row2.map(qr => `
                    <button class="pk-quick-reply-btn ${qr.color}" data-template="${this.escapeHtml(qr.template)}">${this.escapeHtml(qr.label)}</button>
                `).join('')}
            </div>
        `;
    }

    renderMessages() {
        const container = document.getElementById('pkChatMessages');
        if (!container) return;

        if (this.messages.length === 0) {
            container.innerHTML = `
                <div class="pk-empty-state">
                    <i data-lucide="message-circle"></i>
                    <h3>Chưa có tin nhắn</h3>
                    <p>Bắt đầu cuộc trò chuyện bằng cách gửi tin nhắn</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Group messages by date
        const groupedMessages = this.groupMessagesByDate(this.messages);

        let html = '';
        for (const [date, msgs] of Object.entries(groupedMessages)) {
            html += `
                <div class="pk-date-separator">
                    <span>${date}</span>
                </div>
            `;
            html += msgs.map(msg => this.renderMessage(msg)).join('');
        }

        container.innerHTML = html;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    renderMessage(msg) {
        const isOutgoing = msg.from?.id === this.activeConversation?.page_id;
        const text = msg.message || msg.text || '';
        const time = this.formatMessageTime(msg.inserted_at || msg.created_time);
        const sender = isOutgoing ? this.getSenderName(msg) : '';
        const attachments = msg.attachments || [];

        let attachmentHtml = '';
        if (attachments.length > 0) {
            attachmentHtml = attachments.map(att => {
                if (att.type === 'photo' || att.mime_type?.startsWith('image/')) {
                    const imgUrl = att.url || att.preview_url || att.image_data?.url;
                    return `
                        <div class="pk-message-image">
                            <img src="${imgUrl}" alt="Image" onclick="window.open('${imgUrl}', '_blank')">
                        </div>
                    `;
                }
                return '';
            }).join('');
        }

        return `
            <div class="pk-message ${isOutgoing ? 'outgoing' : 'incoming'}">
                ${attachmentHtml}
                ${text ? `
                    <div class="pk-message-bubble">
                        <div class="pk-message-text">${this.escapeHtml(text)}</div>
                    </div>
                ` : ''}
                <div class="pk-message-meta">
                    <span class="pk-message-time">${time}</span>
                    ${sender ? `<span class="pk-message-sender">${this.escapeHtml(sender)}</span>` : ''}
                    ${isOutgoing ? `
                        <span class="pk-message-status">
                            <i data-lucide="check-check"></i>
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // =====================================================
    // PAGE SELECTOR METHODS
    // =====================================================

    async loadPages() {
        if (!window.pancakeDataManager) {
            console.warn('[PANCAKE-CHAT] PancakeDataManager not available for loading pages');
            return;
        }

        try {
            console.log('[PANCAKE-CHAT] Loading pages...');

            // Fetch pages list
            this.pages = await window.pancakeDataManager.fetchPages(false) || [];
            console.log('[PANCAKE-CHAT] Loaded pages:', this.pages.length);

            // Fetch unread counts
            this.pagesWithUnread = await window.pancakeDataManager.fetchPagesWithUnreadCount() || [];
            console.log('[PANCAKE-CHAT] Loaded pages with unread:', this.pagesWithUnread.length);

            // Load saved page selection from localStorage
            this.loadSelectedPage();

            // Render page list dropdown
            this.renderPageDropdown();

            // Update selected page display
            this.updateSelectedPageDisplay();

        } catch (error) {
            console.error('[PANCAKE-CHAT] Error loading pages:', error);
        }
    }

    renderPageDropdown() {
        const container = document.getElementById('pkPageList');
        if (!container) return;

        // Calculate total unread
        const totalUnread = this.pagesWithUnread.reduce((sum, p) => sum + (p.unread_conv_count || 0), 0);

        let html = `
            <!-- All Pages Option -->
            <div class="pk-page-item all-pages ${!this.selectedPageId ? 'active' : ''}" data-page-id="">
                <div class="pk-all-pages-icon">
                    <i data-lucide="layout-grid"></i>
                </div>
                <div class="pk-page-info">
                    <div class="pk-page-name">Tất cả Pages</div>
                    <div class="pk-page-hint">${this.pages.length} pages</div>
                </div>
                ${totalUnread > 0 ? `<span class="pk-page-unread-badge">${totalUnread}</span>` : ''}
            </div>
        `;

        // Render each page
        for (const page of this.pages) {
            const pageId = page.id;
            const pageName = page.name || page.page_name || 'Page';
            const isActive = this.selectedPageId === pageId;

            // Find unread count for this page
            const pageUnread = this.pagesWithUnread.find(p =>
                p.page_id === pageId ||
                p.page_id === page.fb_page_id ||
                p.page_id === page.page_id
            );
            const unreadCount = pageUnread?.unread_conv_count || 0;

            // Get avatar
            const avatarUrl = page.avatar || page.picture?.data?.url || null;
            const avatarHtml = avatarUrl
                ? `<img src="${avatarUrl}" class="pk-page-avatar" alt="${this.escapeHtml(pageName)}">`
                : `<div class="pk-page-avatar-placeholder">${pageName.charAt(0).toUpperCase()}</div>`;

            html += `
                <div class="pk-page-item ${isActive ? 'active' : ''}" data-page-id="${pageId}">
                    ${avatarHtml}
                    <div class="pk-page-info">
                        <div class="pk-page-name">${this.escapeHtml(pageName)}</div>
                        <div class="pk-page-hint">ID: ${page.fb_page_id || pageId}</div>
                    </div>
                    ${unreadCount > 0 ? `<span class="pk-page-unread-badge">${unreadCount}</span>` : ''}
                </div>
            `;
        }

        container.innerHTML = html;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    updateSelectedPageDisplay() {
        const nameEl = document.getElementById('pkSelectedPageName');
        const hintEl = document.getElementById('pkSelectedPageHint');
        const avatarEl = document.getElementById('pkSelectedPageAvatar');
        const badgeEl = document.getElementById('pkTotalUnreadBadge');

        if (!nameEl) return;

        if (this.selectedPageId) {
            // Find selected page
            const page = this.pages.find(p => p.id === this.selectedPageId);
            if (page) {
                nameEl.textContent = page.name || page.page_name || 'Page';
                hintEl.textContent = `ID: ${page.fb_page_id || page.id}`;

                // Update avatar
                const avatarUrl = page.avatar || page.picture?.data?.url || null;
                if (avatarUrl) {
                    avatarEl.innerHTML = `<img src="${avatarUrl}" class="pk-page-avatar" style="width: 32px; height: 32px;" alt="">`;
                } else {
                    avatarEl.innerHTML = (page.name || 'P').charAt(0).toUpperCase();
                    avatarEl.className = 'pk-page-avatar-placeholder';
                }

                // Update unread badge
                const pageUnread = this.pagesWithUnread.find(p =>
                    p.page_id === this.selectedPageId ||
                    p.page_id === page.fb_page_id
                );
                const unreadCount = pageUnread?.unread_conv_count || 0;
                if (unreadCount > 0) {
                    badgeEl.textContent = unreadCount;
                    badgeEl.style.display = 'flex';
                } else {
                    badgeEl.style.display = 'none';
                }
            }
        } else {
            // All pages selected
            nameEl.textContent = 'Tất cả Pages';
            hintEl.textContent = `${this.pages.length} pages`;
            avatarEl.innerHTML = '<i data-lucide="layout-grid"></i>';
            avatarEl.className = 'pk-page-avatar-placeholder';

            // Show total unread
            const totalUnread = this.pagesWithUnread.reduce((sum, p) => sum + (p.unread_conv_count || 0), 0);
            if (totalUnread > 0) {
                badgeEl.textContent = totalUnread;
                badgeEl.style.display = 'flex';
            } else {
                badgeEl.style.display = 'none';
            }

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    selectPage(pageId) {
        console.log('[PANCAKE-CHAT] Selecting page:', pageId || 'ALL');

        this.selectedPageId = pageId || null;
        this.isPageDropdownOpen = false;

        // Save to localStorage
        this.saveSelectedPage();

        // Update UI
        this.updateSelectedPageDisplay();
        this.renderPageDropdown();

        // Hide dropdown
        const dropdown = document.getElementById('pkPageDropdown');
        if (dropdown) {
            dropdown.classList.remove('show');
        }
        const btn = document.getElementById('pkPageSelectorBtn');
        if (btn) {
            btn.classList.remove('active');
        }

        // Re-render conversation list with filter
        this.renderConversationList();
    }

    togglePageDropdown() {
        this.isPageDropdownOpen = !this.isPageDropdownOpen;

        const dropdown = document.getElementById('pkPageDropdown');
        const btn = document.getElementById('pkPageSelectorBtn');

        if (dropdown) {
            dropdown.classList.toggle('show', this.isPageDropdownOpen);
        }
        if (btn) {
            btn.classList.toggle('active', this.isPageDropdownOpen);
        }
    }

    saveSelectedPage() {
        try {
            if (this.selectedPageId) {
                localStorage.setItem('pancake_selected_page', this.selectedPageId);
            } else {
                localStorage.removeItem('pancake_selected_page');
            }
        } catch (e) {
            console.warn('[PANCAKE-CHAT] Could not save selected page:', e);
        }
    }

    loadSelectedPage() {
        try {
            const savedPageId = localStorage.getItem('pancake_selected_page');
            if (savedPageId) {
                // Verify page still exists
                const pageExists = this.pages.some(p => p.id === savedPageId);
                if (pageExists) {
                    this.selectedPageId = savedPageId;
                    console.log('[PANCAKE-CHAT] Loaded saved page:', savedPageId);
                }
            }
        } catch (e) {
            console.warn('[PANCAKE-CHAT] Could not load selected page:', e);
        }
    }

    // =====================================================
    // DATA LOADING
    // =====================================================

    async loadConversations() {
        if (!window.pancakeDataManager) {
            console.error('[PANCAKE-CHAT] PancakeDataManager not available');
            return;
        }

        this.isLoading = true;
        this.renderLoadingState();

        try {
            // Fetch conversations
            const conversations = await window.pancakeDataManager.fetchConversations(true);
            this.conversations = conversations || [];
            console.log('[PANCAKE-CHAT] Loaded conversations:', this.conversations.length);

            // Render conversation list
            this.renderConversationList();

            // Pre-load page access tokens in background for faster message loading
            this.preloadPageAccessTokens();
        } catch (error) {
            console.error('[PANCAKE-CHAT] Error loading conversations:', error);
            this.renderErrorState('Không thể tải danh sách hội thoại');
        } finally {
            this.isLoading = false;
        }
    }

    // Pre-load page access tokens for all pages in conversations
    async preloadPageAccessTokens() {
        if (!window.pancakeTokenManager) return;

        try {
            // Get unique page IDs from conversations
            const pageIds = [...new Set(this.conversations.map(conv => conv.page_id).filter(Boolean))];
            console.log('[PANCAKE-CHAT] Pre-loading page access tokens for', pageIds.length, 'pages...');

            // Load tokens in parallel (don't await each one)
            const promises = pageIds.map(pageId =>
                window.pancakeTokenManager.getOrGeneratePageAccessToken(pageId)
                    .catch(err => console.warn(`[PANCAKE-CHAT] Failed to pre-load token for page ${pageId}:`, err))
            );

            // Wait for all with timeout
            await Promise.race([
                Promise.all(promises),
                new Promise(resolve => setTimeout(resolve, 5000)) // 5s timeout
            ]);

            console.log('[PANCAKE-CHAT] Page access tokens pre-loaded');
        } catch (error) {
            console.warn('[PANCAKE-CHAT] Pre-load page tokens failed:', error);
        }
    }

    async loadMessages(conv, forceRefresh = false) {
        if (!window.pancakeDataManager || !conv) return;

        const messagesContainer = document.getElementById('pkChatMessages');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="pk-loading">
                    <div class="pk-loading-spinner"></div>
                    <p style="margin-top: 10px; color: #666;">Đang tải tin nhắn...</p>
                </div>
            `;
        }

        try {
            const pageId = conv.page_id;
            const convId = conv.id;
            const customerId = conv.customers?.[0]?.id || null;

            console.log('[PANCAKE-CHAT] Loading messages for:', { pageId, convId, customerId });

            // Create a timeout promise (10 seconds)
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout: Qua lau khong phan hoi')), 10000);
            });

            // Race between fetch and timeout
            const result = await Promise.race([
                window.pancakeDataManager.fetchMessagesForConversation(
                    pageId,
                    convId,
                    null,
                    customerId,
                    forceRefresh
                ),
                timeoutPromise
            ]);

            this.messages = (result.messages || []).reverse(); // Reverse to show oldest first
            console.log('[PANCAKE-CHAT] Loaded messages:', this.messages.length, result.fromCache ? '(from cache)' : '(from API)');

            this.renderMessages();

            // Show indicator if from cache
            if (result.fromCache && messagesContainer) {
                // Refresh in background if from cache
                this.refreshMessagesInBackground(pageId, convId, customerId);
            }

            // Mark as read (don't await to not block UI)
            if (conv.unread_count > 0) {
                window.pancakeDataManager.markConversationAsRead(pageId, convId).then(() => {
                    conv.unread_count = 0;
                    conv.seen = true;
                    this.renderConversationList();
                }).catch(err => console.warn('[PANCAKE-CHAT] Could not mark as read:', err));
            }
        } catch (error) {
            console.error('[PANCAKE-CHAT] Error loading messages:', error);
            if (messagesContainer) {
                messagesContainer.innerHTML = `
                    <div class="pk-empty-state">
                        <i data-lucide="alert-circle"></i>
                        <h3>Lỗi tải tin nhắn</h3>
                        <p>${error.message || 'Không thể tải tin nhắn'}</p>
                        <button class="pk-retry-btn" onclick="window.pancakeChatManager.loadMessages(window.pancakeChatManager.activeConversation, true)" style="margin-top: 10px; padding: 8px 16px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Thử lại
                        </button>
                    </div>
                `;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
    }

    // Refresh messages in background after showing cached data
    async refreshMessagesInBackground(pageId, convId, customerId) {
        try {
            console.log('[PANCAKE-CHAT] Refreshing messages in background...');
            const result = await window.pancakeDataManager.fetchMessagesForConversation(
                pageId,
                convId,
                null,
                customerId,
                true // forceRefresh
            );

            // Only update if this is still the active conversation
            if (this.activeConversation?.id === convId) {
                const newMessages = (result.messages || []).reverse();
                // Only re-render if messages changed
                if (newMessages.length !== this.messages.length) {
                    console.log('[PANCAKE-CHAT] Background refresh: messages updated');
                    this.messages = newMessages;
                    this.renderMessages();
                }
            }
        } catch (error) {
            console.warn('[PANCAKE-CHAT] Background refresh failed:', error.message);
        }
    }

    // =====================================================
    // EVENT HANDLERS
    // =====================================================

    bindEvents() {
        // Header Tabs
        const headerTabs = document.querySelectorAll('.pk-header-tab');
        headerTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Page Selector Button
        const pageSelectorBtn = document.getElementById('pkPageSelectorBtn');
        if (pageSelectorBtn) {
            pageSelectorBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.togglePageDropdown();
            });
        }

        // Page Dropdown - Page Selection
        const pageList = document.getElementById('pkPageList');
        if (pageList) {
            pageList.addEventListener('click', (e) => {
                const pageItem = e.target.closest('.pk-page-item');
                if (pageItem) {
                    const pageId = pageItem.dataset.pageId;
                    this.selectPage(pageId);
                }
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('pkPageDropdown');
            const btn = document.getElementById('pkPageSelectorBtn');
            if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
                dropdown.classList.remove('show');
                btn.classList.remove('active');
                this.isPageDropdownOpen = false;
            }
        });

        // Filter Tabs
        const filterTabs = document.querySelectorAll('.pk-filter-tab');
        filterTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const filterType = e.target.dataset.filter;
                this.setFilterType(filterType);

                // Update active state
                filterTabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
            });
        });

        // Search input
        const searchInput = document.getElementById('pkSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value;
                this.renderConversationList();
            });
        }

        // Conversation click
        const conversationsContainer = document.getElementById('pkConversations');
        if (conversationsContainer) {
            conversationsContainer.addEventListener('click', (e) => {
                const convItem = e.target.closest('.pk-conversation-item');
                if (convItem) {
                    const convId = convItem.dataset.convId;
                    this.selectConversation(convId);
                }
            });
        }
    }

    setFilterType(type) {
        this.filterType = type;
        console.log('[PANCAKE-CHAT] Filter changed to:', this.filterType);
        this.renderConversationList();
    }

    switchTab(tabName) {
        console.log('[PANCAKE-CHAT] Switching to tab:', tabName);

        // Update tab buttons
        const headerTabs = document.querySelectorAll('.pk-header-tab');
        headerTabs.forEach(tab => {
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Update tab content
        const tabContents = document.querySelectorAll('.pk-tab-content');
        const tabContentMap = {
            'conversations': 'pkTabConversations',
            'orders': 'pkTabOrders',
            'posts': 'pkTabPosts',
            'stats': 'pkTabStats',
            'settings': 'pkTabSettings'
        };

        tabContents.forEach(content => {
            content.classList.remove('active');
        });

        const targetTabId = tabContentMap[tabName];
        const targetTab = document.getElementById(targetTabId);
        if (targetTab) {
            targetTab.classList.add('active');
        }
    }

    bindChatInputEvents() {
        // Chat input auto-resize
        const chatInput = document.getElementById('pkChatInput');
        if (chatInput) {
            chatInput.addEventListener('input', () => {
                chatInput.style.height = 'auto';
                chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
            });

            // Send on Enter (without Shift)
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        // Send button
        const sendBtn = document.getElementById('pkSendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                this.sendMessage();
            });
        }

        // Quick reply buttons
        const quickReplyBar = document.getElementById('pkQuickReplyBar');
        if (quickReplyBar) {
            quickReplyBar.addEventListener('click', (e) => {
                const btn = e.target.closest('.pk-quick-reply-btn');
                if (btn) {
                    const template = btn.dataset.template;
                    if (template) {
                        const chatInput = document.getElementById('pkChatInput');
                        if (chatInput) {
                            chatInput.value = template;
                            chatInput.focus();
                        }
                    }
                }
            });
        }
    }

    selectConversation(convId) {
        const conv = this.conversations.find(c => c.id === convId);
        if (!conv) return;

        this.activeConversation = conv;
        this.renderConversationList(); // Update active state
        this.renderChatWindow(conv);
    }

    async sendMessage() {
        const chatInput = document.getElementById('pkChatInput');
        if (!chatInput || !this.activeConversation) return;

        const text = chatInput.value.trim();
        if (!text) return;

        // Clear input
        chatInput.value = '';
        chatInput.style.height = 'auto';

        // Disable send button during sending
        const sendBtn = document.getElementById('pkSendBtn');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i data-lucide="loader" class="pk-spin"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        // Add message to UI immediately (optimistic update)
        const tempMessage = {
            id: 'temp_' + Date.now(),
            message: text,
            from: { id: this.activeConversation.page_id, name: 'You' },
            inserted_at: new Date().toISOString(),
            _temp: true
        };
        this.messages.push(tempMessage);
        this.renderMessages();

        try {
            // Send message via Pancake API
            const pageId = this.activeConversation.page_id;
            const convId = this.activeConversation.id;
            const customerId = this.activeConversation.customers?.[0]?.id || null;
            const action = this.activeConversation.type === 'COMMENT' ? 'reply_comment' : 'reply_inbox';

            console.log('[PANCAKE-CHAT] Sending message:', { pageId, convId, text, action });

            const sentMessage = await window.pancakeDataManager.sendMessage(pageId, convId, {
                text: text,
                action: action,
                customerId: customerId
            });

            console.log('[PANCAKE-CHAT] ✅ Message sent successfully:', sentMessage);

            // Replace temp message with real message
            this.messages = this.messages.filter(m => m.id !== tempMessage.id);
            if (sentMessage) {
                this.messages.push(sentMessage);
            }
            this.renderMessages();

            // Update conversation preview
            if (this.activeConversation) {
                this.activeConversation.snippet = text;
                this.activeConversation.updated_at = new Date().toISOString();
                this.renderConversationList();
            }

        } catch (error) {
            console.error('[PANCAKE-CHAT] ❌ Error sending message:', error);

            // Remove temp message on error
            this.messages = this.messages.filter(m => m.id !== tempMessage.id);
            this.renderMessages();

            // Show error notification
            alert(`Lỗi gửi tin nhắn: ${error.message || 'Vui lòng thử lại'}`);

        } finally {
            // Re-enable send button
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i data-lucide="send"></i>';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
    }

    // =====================================================
    // AUTO-REFRESH
    // =====================================================

    startAutoRefresh() {
        // Stop any existing interval
        this.stopAutoRefresh();

        console.log(`[PANCAKE-CHAT] Starting auto-refresh (every ${this.AUTO_REFRESH_INTERVAL / 1000}s)`);

        // Set up periodic refresh
        this.autoRefreshInterval = setInterval(async () => {
            try {
                console.log('[PANCAKE-CHAT] Auto-refreshing conversations...');

                // Refresh pages with unread counts
                if (window.pancakeDataManager) {
                    this.pagesWithUnread = await window.pancakeDataManager.fetchPagesWithUnreadCount() || [];
                    this.updateSelectedPageDisplay();
                }

                // Refresh conversations (in background, don't show loading)
                if (window.pancakeDataManager && !this.isLoading) {
                    const conversations = await window.pancakeDataManager.fetchConversations(false); // Don't force, use cache if fresh

                    if (conversations && conversations.length > 0) {
                        // Update conversations list
                        const oldCount = this.conversations.length;
                        this.conversations = conversations;

                        // Re-render if count changed or has unread
                        const hasNewUnread = conversations.some(c => c.unread_count > 0);
                        if (conversations.length !== oldCount || hasNewUnread) {
                            console.log('[PANCAKE-CHAT] ✅ Conversations updated:', conversations.length);
                            this.renderConversationList();
                        }
                    }
                }
            } catch (error) {
                console.warn('[PANCAKE-CHAT] Auto-refresh failed:', error.message);
            }
        }, this.AUTO_REFRESH_INTERVAL);
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            console.log('[PANCAKE-CHAT] Stopping auto-refresh');
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    // =====================================================
    // WEBSOCKET REALTIME (Phoenix Protocol)
    // =====================================================

    /**
     * Initialize WebSocket connection for realtime updates
     * Uses Phoenix Protocol v2.0.0 (Pancake's socket server)
     */
    async initializeWebSocket() {
        try {
            // Prevent duplicate connection attempts
            if (this.isSocketConnected || this.isSocketConnecting) {
                console.log('[PANCAKE-SOCKET] Already connected or connecting, skipping');
                return this.isSocketConnected;
            }

            // Check if socket is still in CONNECTING state
            if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
                console.log('[PANCAKE-SOCKET] Socket still connecting, skipping');
                return true;
            }

            this.isSocketConnecting = true;

            // Get user ID from token
            if (!window.pancakeTokenManager) {
                console.warn('[PANCAKE-SOCKET] Token manager not available');
                this.isSocketConnecting = false;
                return false;
            }

            const token = await window.pancakeTokenManager.getToken();
            if (!token) {
                console.warn('[PANCAKE-SOCKET] No token available for WebSocket');
                this.isSocketConnecting = false;
                return false;
            }

            // Decode token to get user ID
            const payload = window.pancakeTokenManager.decodeToken(token);
            if (!payload || !payload.uid) {
                console.warn('[PANCAKE-SOCKET] Cannot get user ID from token');
                this.isSocketConnecting = false;
                return false;
            }

            this.userId = payload.uid;
            console.log('[PANCAKE-SOCKET] User ID:', this.userId);

            // Build WebSocket URL with token
            const wsUrl = `wss://pancake.vn/socket/websocket?token=${encodeURIComponent(token)}&vsn=2.0.0`;

            // Close existing socket if any
            this.closeWebSocket();

            console.log('[PANCAKE-SOCKET] Connecting to WebSocket...');
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => this.onSocketOpen();
            this.socket.onclose = (event) => this.onSocketClose(event);
            this.socket.onerror = (error) => this.onSocketError(error);
            this.socket.onmessage = (event) => this.onSocketMessage(event);

            return true;
        } catch (error) {
            console.error('[PANCAKE-SOCKET] Error initializing WebSocket:', error);
            this.isSocketConnecting = false;
            return false;
        }
    }

    /**
     * Handle WebSocket open event
     */
    onSocketOpen() {
        console.log('[PANCAKE-SOCKET] ✅ WebSocket connected');
        this.isSocketConnected = true;
        this.isSocketConnecting = false;
        this.socketReconnectAttempts = 0;
        this.socketReconnectDelay = 2000;

        // Clear any pending reconnect timer
        if (this.socketReconnectTimer) {
            clearTimeout(this.socketReconnectTimer);
            this.socketReconnectTimer = null;
        }

        // Update UI status indicator
        this.updateSocketStatusUI(true);

        // Join Phoenix channels
        this.joinChannels();

        // Start heartbeat
        this.startHeartbeat();

        // Stop polling fallback since socket is connected
        this.stopAutoRefresh();
    }

    /**
     * Handle WebSocket close event
     */
    onSocketClose(event) {
        console.log('[PANCAKE-SOCKET] WebSocket closed:', event.code, event.reason);
        this.isSocketConnected = false;
        this.isSocketConnecting = false;

        // Update UI status indicator
        this.updateSocketStatusUI(false);

        // Stop heartbeat
        this.stopHeartbeat();

        // Clear any existing reconnect timer
        if (this.socketReconnectTimer) {
            clearTimeout(this.socketReconnectTimer);
            this.socketReconnectTimer = null;
        }

        // Attempt reconnection with exponential backoff
        if (this.socketReconnectAttempts < this.socketMaxReconnectAttempts) {
            this.socketReconnectAttempts++;
            const delay = Math.min(this.socketReconnectDelay * Math.pow(1.5, this.socketReconnectAttempts - 1), 30000);
            console.log(`[PANCAKE-SOCKET] Reconnecting in ${delay}ms (attempt ${this.socketReconnectAttempts}/${this.socketMaxReconnectAttempts})`);

            this.socketReconnectTimer = setTimeout(() => {
                this.initializeWebSocket();
            }, delay);
        } else {
            console.warn('[PANCAKE-SOCKET] Max reconnection attempts reached, falling back to polling');
            // Fallback to polling
            this.startAutoRefresh();
        }
    }

    /**
     * Handle WebSocket error event
     */
    onSocketError(error) {
        console.error('[PANCAKE-SOCKET] WebSocket error:', error);
    }

    /**
     * Handle incoming WebSocket messages (Phoenix Protocol)
     */
    onSocketMessage(event) {
        try {
            // Phoenix Protocol v2: [join_ref, ref, topic, event, payload]
            const data = JSON.parse(event.data);

            if (!Array.isArray(data) || data.length < 5) {
                console.log('[PANCAKE-SOCKET] Non-Phoenix message:', data);
                return;
            }

            const [joinRef, ref, topic, eventName, payload] = data;
            console.log('[PANCAKE-SOCKET] Message:', { topic, event: eventName, payload });

            // Handle different events
            switch (eventName) {
                case 'phx_reply':
                    this.handlePhxReply(topic, payload);
                    break;

                case 'pages:update_conversation':
                case 'update_conversation':
                    this.handleConversationUpdate(payload);
                    break;

                case 'pages:new_message':
                case 'new_message':
                    this.handleNewMessage(payload);
                    break;

                case 'order:tags_updated':
                case 'tags_updated':
                    this.handleTagsUpdated(payload);
                    break;

                case 'presence_state':
                case 'presence_diff':
                    // Presence updates - can be used for online status
                    console.log('[PANCAKE-SOCKET] Presence update:', eventName, payload);
                    break;

                default:
                    console.log('[PANCAKE-SOCKET] Unhandled event:', eventName);
            }
        } catch (error) {
            console.error('[PANCAKE-SOCKET] Error parsing message:', error);
        }
    }

    /**
     * Join Phoenix channels
     */
    joinChannels() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.warn('[PANCAKE-SOCKET] Socket not ready for joining channels');
            return;
        }

        // Join user channel: users:{userId}
        this.sendPhxMessage('users:' + this.userId, 'phx_join', {});

        // Join multiple_pages channel for conversation updates
        this.sendPhxMessage('multiple_pages:' + this.userId, 'phx_join', {});

        console.log('[PANCAKE-SOCKET] Joined channels for user:', this.userId);
    }

    /**
     * Send Phoenix protocol message
     */
    sendPhxMessage(topic, event, payload) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.warn('[PANCAKE-SOCKET] Cannot send message - socket not open');
            return;
        }

        this.socketJoinRef++;
        this.socketMsgRef++;

        // Phoenix Protocol v2: [join_ref, ref, topic, event, payload]
        const message = [
            this.socketJoinRef.toString(),
            this.socketMsgRef.toString(),
            topic,
            event,
            payload
        ];

        this.socket.send(JSON.stringify(message));
    }

    /**
     * Handle Phoenix reply
     */
    handlePhxReply(topic, payload) {
        if (payload.status === 'ok') {
            console.log('[PANCAKE-SOCKET] ✅ Successfully joined:', topic);
        } else {
            console.warn('[PANCAKE-SOCKET] Join failed:', topic, payload);
        }
    }

    /**
     * Handle conversation update from WebSocket
     */
    handleConversationUpdate(payload) {
        console.log('[PANCAKE-SOCKET] 🔔 Conversation update:', payload);

        const conversation = payload.conversation || payload;
        if (!conversation || !conversation.id) return;

        // Find and update conversation in list
        const index = this.conversations.findIndex(c => c.id === conversation.id);

        if (index >= 0) {
            // Update existing conversation
            this.conversations[index] = { ...this.conversations[index], ...conversation };
        } else {
            // Add new conversation at top
            this.conversations.unshift(conversation);
        }

        // Re-sort by updated_at (newest first)
        this.conversations.sort((a, b) => {
            const dateA = new Date(a.updated_at || 0);
            const dateB = new Date(b.updated_at || 0);
            return dateB - dateA;
        });

        // Re-render conversation list
        this.renderConversationList();

        // Update unread counts
        this.updateUnreadCounts();

        // If this is the active conversation, reload messages
        if (this.activeConversation?.id === conversation.id) {
            this.loadMessages(this.activeConversation, true);
        }

        // Show notification for unread
        if (conversation.unread_count > 0) {
            this.showNewMessageNotification(conversation);
        }
    }

    /**
     * Handle new message from WebSocket
     */
    handleNewMessage(payload) {
        console.log('[PANCAKE-SOCKET] 🔔 New message:', payload);

        const message = payload.message || payload;
        const conversationId = payload.conversation_id || message.conversation_id;

        // If this is the active conversation, add message to list
        if (this.activeConversation?.id === conversationId) {
            // Add message if not already exists
            if (!this.messages.find(m => m.id === message.id)) {
                this.messages.push(message);
                this.renderMessages();
            }
        }

        // Update conversation in list
        this.handleConversationUpdate({
            id: conversationId,
            snippet: message.message || message.text,
            updated_at: message.inserted_at || new Date().toISOString(),
            unread_count: (this.activeConversation?.id === conversationId) ? 0 : 1
        });
    }

    /**
     * Handle tags update from WebSocket
     */
    handleTagsUpdated(payload) {
        console.log('[PANCAKE-SOCKET] Tags updated:', payload);

        const conversationId = payload.conversation_id;
        const tags = payload.tags;

        // Find and update conversation tags
        const conv = this.conversations.find(c => c.id === conversationId);
        if (conv) {
            conv.tags = tags;
            this.renderConversationList();
        }
    }

    /**
     * Start heartbeat to keep WebSocket connection alive
     */
    startHeartbeat() {
        this.stopHeartbeat();

        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                // Phoenix heartbeat format
                this.sendPhxMessage('phoenix', 'heartbeat', {});
                console.log('[PANCAKE-SOCKET] 💓 Heartbeat sent');
            }
        }, this.HEARTBEAT_INTERVAL);
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Close WebSocket connection
     */
    closeWebSocket() {
        this.stopHeartbeat();

        // Clear reconnect timer
        if (this.socketReconnectTimer) {
            clearTimeout(this.socketReconnectTimer);
            this.socketReconnectTimer = null;
        }

        if (this.socket) {
            this.socket.onclose = null; // Prevent reconnection
            this.socket.close();
            this.socket = null;
        }

        this.isSocketConnected = false;
        this.isSocketConnecting = false;
        this.updateSocketStatusUI(false);
    }

    /**
     * Update WebSocket status indicator in UI
     */
    updateSocketStatusUI(connected) {
        const statusEl = document.getElementById('pkSocketStatus');
        if (!statusEl) return;

        if (connected) {
            statusEl.innerHTML = '<i data-lucide="wifi" class="pk-socket-icon connected"></i>';
            statusEl.title = 'Realtime: Đã kết nối';
        } else {
            statusEl.innerHTML = '<i data-lucide="wifi-off" class="pk-socket-icon disconnected"></i>';
            statusEl.title = 'Realtime: Mất kết nối';
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Update unread counts for pages
     */
    async updateUnreadCounts() {
        if (window.pancakeDataManager) {
            this.pagesWithUnread = await window.pancakeDataManager.fetchPagesWithUnreadCount() || [];
            this.updateSelectedPageDisplay();
        }
    }

    /**
     * Show notification for new message
     */
    showNewMessageNotification(conversation) {
        const name = conversation.from?.name || conversation.customers?.[0]?.name || 'Tin nhắn mới';
        const snippet = conversation.snippet || '';

        // Browser notification if permission granted
        if (Notification.permission === 'granted') {
            new Notification(name, {
                body: snippet.substring(0, 100),
                icon: '/favicon.ico',
                tag: conversation.id
            });
        }

        // Play notification sound (optional)
        // this.playNotificationSound();
    }

    // =====================================================
    // HELPER METHODS
    // =====================================================

    getAvatarHtml(conv, type = 'list') {
        const customer = conv.customers?.[0] || conv.from;
        const name = customer?.name || 'U';
        const initial = name.charAt(0).toUpperCase();
        const pageId = conv.page_id;
        const fbId = customer?.fb_id || customer?.id || conv.from?.id;

        // Try multiple avatar fields (different API responses use different field names)
        let directAvatarUrl = customer?.avatar ||
                         customer?.picture?.data?.url ||
                         customer?.profile_pic ||
                         customer?.image_url ||
                         conv.from?.picture?.data?.url ||
                         conv.from?.profile_pic ||
                         null;

        // Use getAvatarUrl from data manager for better avatar resolution
        let avatarUrl = directAvatarUrl;
        if (window.pancakeDataManager && fbId) {
            avatarUrl = window.pancakeDataManager.getAvatarUrl(fbId, pageId, null, directAvatarUrl);
        }

        // Random gradient colors for placeholder based on name
        const colors = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
            'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
            'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
        ];
        const colorIndex = name.charCodeAt(0) % colors.length;
        const gradientColor = colors[colorIndex];

        if (type === 'chat') {
            if (avatarUrl && !avatarUrl.startsWith('data:image/svg')) {
                return `<img src="${avatarUrl}" class="pk-chat-avatar" alt="${this.escapeHtml(name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div class="pk-chat-avatar-placeholder" style="display: none; background: ${gradientColor};">${initial}</div>`;
            }
            return `<div class="pk-chat-avatar-placeholder" style="background: ${gradientColor};">${initial}</div>`;
        }

        if (avatarUrl && !avatarUrl.startsWith('data:image/svg')) {
            return `<img src="${avatarUrl}" alt="${this.escapeHtml(name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="pk-avatar-placeholder" style="display: none; background: ${gradientColor};">${initial}</div>`;
        }
        return `<div class="pk-avatar-placeholder" style="background: ${gradientColor};">${initial}</div>`;
    }

    getTagsHtml(conv) {
        // Render all tags as colored badges (like "BOOM" in Pancake.vn)
        const tags = conv.tags || [];
        if (tags.length === 0) return '';

        // Map tag colors (use tag.color if available, otherwise assign from palette)
        const colorPalette = ['red', 'green', 'blue', 'orange', 'purple', 'pink', 'teal'];

        return tags.map((tag, index) => {
            const tagName = tag.name || tag.tag_name || tag;
            const tagColor = tag.color || tag.tag_color || colorPalette[index % colorPalette.length];
            return `<span class="pk-tag-badge ${tagColor}">${this.escapeHtml(tagName)}</span>`;
        }).join('');
    }

    getChatStatus(conv) {
        const lastSeen = conv.updated_at;
        if (!lastSeen) return '';
        return `Da xem boi Ky Thuat NJD - ${this.formatMessageTime(lastSeen)}`;
    }

    getSenderName(msg) {
        // Determine sender name for outgoing messages
        if (msg.sender_action_name) {
            return msg.sender_action_name;
        }
        return 'Nv.My';
    }

    formatTime(timestamp) {
        if (!timestamp) return '';

        try {
            // Parse timestamp
            const date = new Date(timestamp);
            const now = new Date();

            // Use Intl.DateTimeFormat to get date parts in Vietnam timezone
            const vnFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Ho_Chi_Minh',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            // Get date parts for comparison
            const dateParts = vnFormatter.formatToParts(date);
            const nowParts = vnFormatter.formatToParts(now);

            const getPartValue = (parts, type) => parseInt(parts.find(p => p.type === type)?.value || '0');

            const dateYear = getPartValue(dateParts, 'year');
            const dateMonth = getPartValue(dateParts, 'month');
            const dateDay = getPartValue(dateParts, 'day');

            const nowYear = getPartValue(nowParts, 'year');
            const nowMonth = getPartValue(nowParts, 'month');
            const nowDay = getPartValue(nowParts, 'day');

            // Check if same day in Vietnam timezone
            const isSameDay = dateYear === nowYear && dateMonth === nowMonth && dateDay === nowDay;

            // If today, show time (HH:mm format in Vietnam timezone)
            if (isSameDay) {
                return new Intl.DateTimeFormat('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Ho_Chi_Minh',
                    hour12: false
                }).format(date);
            }

            // Calculate days difference
            const vnDateObj = new Date(dateYear, dateMonth - 1, dateDay);
            const vnNowObj = new Date(nowYear, nowMonth - 1, nowDay);
            const diffDays = Math.floor((vnNowObj - vnDateObj) / (24 * 60 * 60 * 1000));

            // If within last 7 days, show day of week
            if (diffDays > 0 && diffDays < 7) {
                const dayOfWeek = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                    weekday: 'short'
                }).format(date);
                const days = { 'Sun': 'CN', 'Mon': 'T2', 'Tue': 'T3', 'Wed': 'T4', 'Thu': 'T5', 'Fri': 'T6', 'Sat': 'T7' };
                return days[dayOfWeek] || dayOfWeek;
            }

            // Otherwise show date
            return new Intl.DateTimeFormat('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                timeZone: 'Asia/Ho_Chi_Minh'
            }).format(date);
        } catch (error) {
            console.warn('[PANCAKE-CHAT] Error formatting time:', error);
            return '';
        }
    }

    formatMessageTime(timestamp) {
        if (!timestamp) return '';

        try {
            const date = new Date(timestamp);
            return new Intl.DateTimeFormat('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Ho_Chi_Minh',
                hour12: false
            }).format(date);
        } catch (error) {
            console.warn('[PANCAKE-CHAT] Error formatting message time:', error);
            return '';
        }
    }

    groupMessagesByDate(messages) {
        const groups = {};
        const now = new Date();

        // Get today's date in Vietnam timezone
        const vnFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Ho_Chi_Minh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        const nowParts = vnFormatter.formatToParts(now);
        const getPartValue = (parts, type) => parseInt(parts.find(p => p.type === type)?.value || '0');

        const todayYear = getPartValue(nowParts, 'year');
        const todayMonth = getPartValue(nowParts, 'month');
        const todayDay = getPartValue(nowParts, 'day');
        const todayKey = `${todayYear}-${todayMonth}-${todayDay}`;

        messages.forEach(msg => {
            const date = new Date(msg.inserted_at || msg.created_time);
            const dateParts = vnFormatter.formatToParts(date);

            const dateYear = getPartValue(dateParts, 'year');
            const dateMonth = getPartValue(dateParts, 'month');
            const dateDay = getPartValue(dateParts, 'day');
            const dateKey = `${dateYear}-${dateMonth}-${dateDay}`;

            let displayKey;
            if (dateKey === todayKey) {
                displayKey = 'Hôm nay';
            } else {
                displayKey = new Intl.DateTimeFormat('vi-VN', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    timeZone: 'Asia/Ho_Chi_Minh'
                }).format(date);
            }

            if (!groups[displayKey]) {
                groups[displayKey] = [];
            }
            groups[displayKey].push(msg);
        });

        return groups;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderLoadingState() {
        const container = document.getElementById('pkConversations');
        if (container) {
            container.innerHTML = `
                <div class="pk-loading">
                    <div class="pk-loading-spinner"></div>
                </div>
            `;
        }
    }

    renderErrorState(message) {
        const container = document.getElementById('pkConversations');
        if (container) {
            container.innerHTML = `
                <div class="pk-empty-state" style="padding: 40px 20px;">
                    <i data-lucide="alert-circle"></i>
                    <h3>Lỗi</h3>
                    <p>${this.escapeHtml(message)}</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    async refresh() {
        // Refresh pages and conversations
        await this.loadPages();
        await this.loadConversations();
    }

    getActiveConversation() {
        return this.activeConversation;
    }

    setQuickReplies(replies) {
        this.quickReplies = replies;
        const quickReplyBar = document.getElementById('pkQuickReplyBar');
        if (quickReplyBar) {
            quickReplyBar.innerHTML = this.renderQuickReplies();
        }
    }
}

// Create global instance
window.pancakeChatManager = new PancakeChatManager();
console.log('[PANCAKE-CHAT] PancakeChatManager loaded');

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on the tpos-pancake page
    const pancakeContent = document.getElementById('pancakeContent');
    if (pancakeContent) {
        // Initialize after a short delay to ensure other managers are loaded
        setTimeout(() => {
            window.pancakeChatManager.initialize('pancakeContent');
        }, 500);
    }
});
