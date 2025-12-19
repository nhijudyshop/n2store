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

        console.log('[PANCAKE-CHAT] Initialized successfully');
        return true;
    }

    // =====================================================
    // RENDER METHODS
    // =====================================================

    render() {
        this.container.innerHTML = `
            <div class="pancake-chat-container">
                <!-- Conversation List (Left Panel) -->
                <div class="pk-conversation-list" id="pkConversationList">
                    <!-- Page Selector -->
                    <div class="pk-page-selector" style="position: relative;">
                        <button class="pk-page-selector-btn" id="pkPageSelectorBtn">
                            <div class="pk-page-avatar-placeholder" id="pkSelectedPageAvatar">
                                <i data-lucide="layout-grid"></i>
                            </div>
                            <div class="pk-page-info">
                                <div class="pk-page-name" id="pkSelectedPageName">Tat ca Pages</div>
                                <div class="pk-page-hint" id="pkSelectedPageHint">Chon page de loc hoi thoai</div>
                            </div>
                            <span class="pk-page-unread-badge" id="pkTotalUnreadBadge" style="display: none;">0</span>
                            <i data-lucide="chevron-down" class="pk-page-selector-icon"></i>
                        </button>

                        <!-- Page Dropdown -->
                        <div class="pk-page-dropdown" id="pkPageDropdown">
                            <div class="pk-page-dropdown-header">Chon Page</div>
                            <div id="pkPageList">
                                <div class="pk-loading">
                                    <div class="pk-loading-spinner"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Filter Tabs -->
                    <div class="pk-filter-tabs">
                        <button class="pk-filter-tab active" data-filter="all">Tat ca</button>
                        <button class="pk-filter-tab" data-filter="inbox">Inbox</button>
                        <button class="pk-filter-tab" data-filter="comment">Comment</button>
                        <button class="pk-filter-tab" data-filter="unread">Chua doc</button>
                    </div>

                    <!-- Search Header -->
                    <div class="pk-search-header">
                        <div class="pk-search-wrapper">
                            <div class="pk-search-box">
                                <i data-lucide="search"></i>
                                <input type="text" id="pkSearchInput" placeholder="Tim kiem">
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
                        <h3>Chon hoi thoai</h3>
                        <p>Chon mot cuoc tro chuyen tu danh sach ben trai de bat dau nhan tin</p>
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
                    <h3>Khong co hoi thoai</h3>
                    <p>Chua co cuoc tro chuyen nao</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Filter conversations
        let filtered = this.conversations;

        // Filter by selected page
        if (this.selectedPageId) {
            filtered = filtered.filter(conv => conv.page_id === this.selectedPageId);
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
            const pageName = selectedPage?.name || 'page nay';
            container.innerHTML = `
                <div class="pk-empty-state" style="padding: 40px 20px;">
                    <i data-lucide="inbox"></i>
                    <h3>Khong co hoi thoai</h3>
                    <p>Khong tim thay hoi thoai nao ${this.selectedPageId ? `trong ${pageName}` : ''}</p>
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
        const staffTag = this.getStaffTag(conv);

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
                    ${staffTag ? `<span class="pk-staff-tag ${staffTag.color}">${staffTag.label}</span>` : ''}
                </div>
                <div class="pk-conversation-actions">
                    <div class="pk-action-buttons">
                        <button class="pk-action-btn phone" title="Goi dien">
                            <i data-lucide="phone"></i>
                        </button>
                        <button class="pk-action-btn email" title="Gui mail">
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
                    <button class="pk-header-btn" title="Lien ket">
                        <i data-lucide="link"></i>
                    </button>
                    <button class="pk-header-btn" title="Lich su">
                        <i data-lucide="history"></i>
                    </button>
                    <button class="pk-header-btn" title="Them thanh vien">
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
                <span>Tra loi tu <strong>NhiJudy Store</strong></span>
            </div>

            <!-- Chat Input -->
            <div class="pk-chat-input-container">
                <div class="pk-input-actions">
                    <button class="pk-input-btn" title="Dinh kem">
                        <i data-lucide="paperclip"></i>
                    </button>
                    <button class="pk-input-btn" title="Hinh anh">
                        <i data-lucide="image"></i>
                    </button>
                    <button class="pk-input-btn" title="Emoji">
                        <i data-lucide="smile"></i>
                    </button>
                </div>
                <div class="pk-chat-input-wrapper">
                    <textarea id="pkChatInput" class="pk-chat-input" placeholder="Nhap tin nhan..." rows="1"></textarea>
                </div>
                <button class="pk-send-btn" id="pkSendBtn" title="Gui">
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
                    <h3>Chua co tin nhan</h3>
                    <p>Bat dau cuoc tro chuyen bang cach gui tin nhan</p>
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
                    <div class="pk-page-name">Tat ca Pages</div>
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
            nameEl.textContent = 'Tat ca Pages';
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
            this.renderErrorState('Khong the tai danh sach hoi thoai');
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
                    <p style="margin-top: 10px; color: #666;">Dang tai tin nhan...</p>
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
                        <h3>Loi tai tin nhan</h3>
                        <p>${error.message || 'Khong the tai tin nhan'}</p>
                        <button class="pk-retry-btn" onclick="window.pancakeChatManager.loadMessages(window.pancakeChatManager.activeConversation, true)" style="margin-top: 10px; padding: 8px 16px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Thu lai
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

        // Add message to UI immediately (optimistic update)
        const tempMessage = {
            id: 'temp_' + Date.now(),
            message: text,
            from: { id: this.activeConversation.page_id, name: 'You' },
            inserted_at: new Date().toISOString()
        };
        this.messages.push(tempMessage);
        this.renderMessages();

        try {
            // TODO: Implement actual message sending via Pancake API
            console.log('[PANCAKE-CHAT] Sending message:', text);

            // For now, just log - actual implementation would use Pancake API
            // await window.pancakeDataManager.sendMessage(pageId, convId, text);

        } catch (error) {
            console.error('[PANCAKE-CHAT] Error sending message:', error);
            // Remove temp message on error
            this.messages = this.messages.filter(m => m.id !== tempMessage.id);
            this.renderMessages();
        }
    }

    // =====================================================
    // HELPER METHODS
    // =====================================================

    getAvatarHtml(conv, type = 'list') {
        const customer = conv.customers?.[0] || conv.from;
        const name = customer?.name || 'U';
        const initial = name.charAt(0).toUpperCase();
        const avatarUrl = customer?.avatar || null;

        if (type === 'chat') {
            if (avatarUrl) {
                return `<img src="${avatarUrl}" class="pk-chat-avatar" alt="${this.escapeHtml(name)}">`;
            }
            return `<div class="pk-chat-avatar-placeholder">${initial}</div>`;
        }

        if (avatarUrl) {
            return `<img src="${avatarUrl}" alt="${this.escapeHtml(name)}">`;
        }
        return `<div class="pk-avatar-placeholder">${initial}</div>`;
    }

    getStaffTag(conv) {
        // Determine staff tag based on conversation tags or assigned staff
        const tags = conv.tags || [];
        if (tags.length > 0) {
            // Return first tag as staff tag
            const tag = tags[0];
            const colors = ['green', 'blue', 'orange', 'purple'];
            return {
                label: tag.name || tag,
                color: colors[Math.floor(Math.random() * colors.length)]
            };
        }
        return null;
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
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        // If today, show time
        if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
            return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }

        // If this week, show day
        if (diff < 7 * 24 * 60 * 60 * 1000) {
            const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
            return days[date.getDay()];
        }

        // Otherwise show date
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    }

    formatMessageTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    groupMessagesByDate(messages) {
        const groups = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        messages.forEach(msg => {
            const date = new Date(msg.inserted_at || msg.created_time);
            date.setHours(0, 0, 0, 0);

            let dateKey;
            if (date.getTime() === today.getTime()) {
                dateKey = 'Hom nay';
            } else {
                dateKey = date.toLocaleDateString('vi-VN', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
            }

            if (!groups[dateKey]) {
                groups[dateKey] = [];
            }
            groups[dateKey].push(msg);
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
                    <h3>Loi</h3>
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
