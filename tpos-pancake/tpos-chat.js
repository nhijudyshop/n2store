// =====================================================
// TPOS CHAT MANAGER - Live Campaign Comment System
// Workflow: Select CRM Team → Select Live Campaign → Load Comments → SSE Realtime
// =====================================================

class TposChatManager {
    constructor() {
        this.containerId = null;
        this.comments = [];
        this.isLoading = false;

        // Selected data
        this.selectedTeamId = null;
        this.selectedPage = null;
        this.selectedPages = []; // Support multiple pages
        this.selectedCampaign = null;

        // Data lists
        this.crmTeams = [];
        this.allPages = []; // All available pages
        this.liveCampaigns = [];

        // Pagination
        this.nextPageUrl = null;
        this.hasMore = false;

        // SSE connection
        this.eventSource = null;
        this.sseConnected = false;

        // SessionIndex map: ASUID -> { index, session, code }
        this.sessionIndexMap = new Map();

        // API config
        this.proxyBaseUrl = 'https://n2store-fallback.onrender.com';
        this.tposPancakeUrl = 'https://n2store-tpos-pancake.onrender.com';
        this.tposBaseUrl = 'https://tomato.tpos.vn';
    }

    /**
     * Initialize chat manager
     */
    async initialize(containerId) {
        this.containerId = containerId;
        console.log('[TPOS-CHAT] Initializing with container:', containerId);

        // Render initial UI
        this.renderContainer();

        // Setup realtime event listeners (for rt-2.tpos.app SessionIndex)
        this.setupRealtimeListeners();

        // Load CRM Teams
        await this.loadCRMTeams();

        // Restore saved page selection from localStorage
        this.restoreSelection();
    }

    /**
     * Restore saved selection from localStorage
     */
    restoreSelection() {
        const savedPage = localStorage.getItem('tpos_selected_page');
        if (savedPage) {
            const crmSelect = document.getElementById('tposCrmTeamSelect');
            if (crmSelect) {
                // Check if the saved value exists in options
                const optionExists = Array.from(crmSelect.options).some(opt => opt.value === savedPage);
                if (optionExists) {
                    crmSelect.value = savedPage;
                    this.onCrmTeamChange(savedPage);
                }
            }
        }
    }

    /**
     * Setup realtime event listeners (for SessionIndex updates from rt-2.tpos.app)
     */
    setupRealtimeListeners() {
        // Listen for connection status changes
        window.addEventListener('tposRealtimeConnected', () => {
            this.updateConnectionStatus(true, 'session');
        });

        window.addEventListener('tposRealtimeDisconnected', () => {
            this.updateConnectionStatus(false, 'session');
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
                <!-- Merged Header: TPOS title + selectors + actions in one row -->
                <div class="tpos-chat-header tpos-merged-header">
                    <!-- TPOS Logo/Title -->
                    <div class="tpos-title-section">
                        <i data-lucide="shopping-cart" class="tpos-icon"></i>
                        <span class="tpos-title">TPOS</span>
                    </div>

                    <!-- Selectors -->
                    <div class="tpos-selectors">
                        <!-- CRM Team/Page Selector -->
                        <select id="tposCrmTeamSelect" class="tpos-filter-select" disabled>
                            <option value="">Chọn Page...</option>
                        </select>

                        <!-- Live Campaign Selector -->
                        <select id="tposLiveCampaignSelect" class="tpos-filter-select" disabled>
                            <option value="">Chọn Live Campaign...</option>
                        </select>
                    </div>

                    <!-- Actions -->
                    <div class="tpos-header-actions">
                        <div class="tpos-status-indicator" id="tposStatusIndicator">
                            <span class="status-dot disconnected"></span>
                            <span class="status-text">Live</span>
                        </div>
                        <button class="tpos-btn-refresh" id="btnTposRefresh" title="Refresh">
                            <i data-lucide="refresh-cw"></i>
                        </button>
                        <button class="tpos-btn-expand" id="btnTposExpand" title="Mở rộng" onclick="toggleFullscreen('tpos')">
                            <i data-lucide="maximize-2"></i>
                        </button>
                    </div>
                </div>

                <!-- Comment list -->
                <div class="tpos-conversation-list" id="tposCommentList">
                    <div class="tpos-empty">
                        <i data-lucide="message-square"></i>
                        <span>Chọn Page và Live Campaign để xem comment</span>
                    </div>
                </div>

                <!-- Loading indicator for infinite scroll -->
                <div class="tpos-load-more" id="tposLoadMore" style="display: none;">
                    <div class="tpos-loading-more">
                        <i data-lucide="loader-2" class="spin"></i>
                        <span>Đang tải thêm...</span>
                    </div>
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
        // CRM Team selector
        const crmSelect = document.getElementById('tposCrmTeamSelect');
        if (crmSelect) {
            crmSelect.addEventListener('change', (e) => this.onCrmTeamChange(e.target.value));
        }

        // Live Campaign selector
        const campaignSelect = document.getElementById('tposLiveCampaignSelect');
        if (campaignSelect) {
            campaignSelect.addEventListener('change', (e) => this.onLiveCampaignChange(e.target.value));
        }

        // Refresh button
        const btnRefresh = document.getElementById('btnTposRefresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => this.refresh());
        }

        // Infinite scroll - auto load more when near bottom
        const commentList = document.getElementById('tposCommentList');
        if (commentList) {
            commentList.addEventListener('scroll', () => this.handleScroll(commentList));
        }
    }

    /**
     * Handle scroll for infinite loading
     */
    handleScroll(container) {
        // Check if near bottom (within 100px)
        const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

        if (scrollBottom < 100 && this.hasMore && !this.isLoading) {
            console.log('[TPOS-CHAT] Auto-loading more comments...');
            this.loadMoreComments();
        }
    }

    /**
     * Update load more indicator visibility
     */
    updateLoadMoreIndicator() {
        const loadMoreContainer = document.getElementById('tposLoadMore');
        if (loadMoreContainer) {
            // Show spinner when loading more or when there's more to load
            loadMoreContainer.style.display = (this.isLoading && this.comments.length > 0) || this.hasMore ? 'flex' : 'none';

            // Refresh icon if showing
            if (loadMoreContainer.style.display !== 'none' && typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    // =====================================================
    // API METHODS
    // =====================================================

    /**
     * Get TPOS token
     */
    async getToken() {
        if (window.tposTokenManager) {
            return await window.tposTokenManager.getToken();
        }
        return null;
    }

    /**
     * Authenticated fetch with auto-retry on 401
     */
    async authenticatedFetch(url, options = {}) {
        const token = await this.getToken();
        if (!token) {
            throw new Error('No token available');
        }

        let response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                ...options.headers
            }
        });

        // Auto-retry on 401: refresh token and retry once
        if (response.status === 401) {
            console.log('[TPOS-CHAT] Got 401, refreshing token and retrying...');
            if (window.tposTokenManager?.refresh) {
                await window.tposTokenManager.refresh();
                const newToken = await this.getToken();
                if (newToken) {
                    response = await fetch(url, {
                        ...options,
                        headers: {
                            'Authorization': `Bearer ${newToken}`,
                            'Accept': 'application/json',
                            ...options.headers
                        }
                    });
                }
            }
        }

        return response;
    }

    /**
     * Load CRM Teams with Pages (via proxy)
     */
    async loadCRMTeams() {
        try {
            const response = await this.authenticatedFetch(`${this.proxyBaseUrl}/facebook/crm-teams`);

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            this.crmTeams = data.value || [];

            console.log('[TPOS-CHAT] Loaded CRM Teams:', this.crmTeams.length);
            this.renderCrmTeamOptions();

        } catch (error) {
            console.error('[TPOS-CHAT] Error loading CRM Teams:', error);
        }
    }

    /**
     * Load Live Campaigns for selected page (via proxy)
     */
    async loadLiveCampaigns(pageId) {
        try {
            const response = await this.authenticatedFetch(`${this.proxyBaseUrl}/facebook/live-campaigns?top=20`);

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            // Filter campaigns by pageId
            this.liveCampaigns = (data.value || []).filter(c =>
                c.Facebook_UserId === pageId && c.Facebook_LiveId
            );

            console.log('[TPOS-CHAT] Loaded Live Campaigns:', this.liveCampaigns.length);
            this.renderLiveCampaignOptions();

        } catch (error) {
            console.error('[TPOS-CHAT] Error loading Live Campaigns:', error);
        }
    }

    /**
     * Load Live Campaigns from ALL pages
     */
    async loadLiveCampaignsFromAllPages() {
        try {
            const response = await this.authenticatedFetch(`${this.proxyBaseUrl}/facebook/live-campaigns?top=50`);

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            const allPageIds = this.allPages.map(p => p.Facebook_PageId);

            // Filter campaigns that belong to any of the selected pages
            this.liveCampaigns = (data.value || []).filter(c =>
                allPageIds.includes(c.Facebook_UserId) && c.Facebook_LiveId
            );

            console.log('[TPOS-CHAT] Loaded Live Campaigns from all pages:', this.liveCampaigns.length);
            this.renderLiveCampaignOptions();

        } catch (error) {
            console.error('[TPOS-CHAT] Error loading Live Campaigns:', error);
        }
    }

    /**
     * Load comments for selected campaign
     */
    async loadComments(append = false) {
        if (this.isLoading || !this.selectedPage || !this.selectedCampaign) return;

        this.isLoading = true;
        const listContainer = document.getElementById('tposCommentList');

        // Show loading indicator for infinite scroll
        if (append) {
            this.updateLoadMoreIndicator();
        }

        if (!append) {
            this.comments = [];
            this.nextPageUrl = null;
            if (listContainer) {
                listContainer.innerHTML = `
                    <div class="tpos-loading">
                        <i data-lucide="loader-2" class="spin"></i>
                        <span>Đang tải comment...</span>
                    </div>
                `;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }

        try {
            const token = await this.getToken();
            if (!token) throw new Error('No token');

            const pageId = this.selectedPage.Facebook_PageId;
            const postId = this.selectedCampaign.Facebook_LiveId;

            let url;
            if (append && this.nextPageUrl) {
                // For pagination, extract cursor and use proxy
                const nextUrl = new URL(this.nextPageUrl);
                const after = nextUrl.searchParams.get('after');
                url = `${this.proxyBaseUrl}/facebook/comments?pageid=${pageId}&postId=${postId}&limit=50${after ? '&after=' + encodeURIComponent(after) : ''}`;
            } else {
                url = `${this.proxyBaseUrl}/facebook/comments?pageid=${pageId}&postId=${postId}&limit=50`;
            }

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            const newComments = data.data || [];

            if (append) {
                this.comments = [...this.comments, ...newComments];
            } else {
                this.comments = newComments;
            }

            // Update pagination
            this.nextPageUrl = data.paging?.next || null;
            this.hasMore = !!this.nextPageUrl;

            console.log('[TPOS-CHAT] Loaded comments:', newComments.length, 'Total:', this.comments.length);
            this.renderComments();

            // Start SSE and load SessionIndex after loading initial comments
            if (!append) {
                this.startSSE();
                this.loadSessionIndex();
            }

        } catch (error) {
            console.error('[TPOS-CHAT] Error loading comments:', error);
            if (listContainer) {
                listContainer.innerHTML = `
                    <div class="tpos-error">
                        <i data-lucide="alert-circle"></i>
                        <span>Lỗi: ${error.message}</span>
                        <button class="tpos-btn-retry" onclick="window.tposChatManager.loadComments()">Thử lại</button>
                    </div>
                `;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        } finally {
            this.isLoading = false;
            this.updateLoadMoreIndicator();
        }
    }

    /**
     * Load more comments (pagination)
     */
    async loadMoreComments() {
        if (this.hasMore && !this.isLoading) {
            await this.loadComments(true);
        }
    }

    /**
     * Load SessionIndex (comment orders) for the current post
     * Maps ASUID -> order index for displaying badges
     */
    async loadSessionIndex() {
        if (!this.selectedCampaign) return;

        try {
            const token = await this.getToken();
            if (!token) return;

            // Facebook_LiveId format: "pageId_postId"
            const fullPostId = this.selectedCampaign.Facebook_LiveId;

            const url = `${this.proxyBaseUrl}/facebook/comment-orders?postId=${fullPostId}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            const orders = data.value || [];

            // Clear and rebuild map
            this.sessionIndexMap.clear();

            orders.forEach(item => {
                const asuid = item.asuid || item.id;
                if (asuid && item.orders && item.orders.length > 0) {
                    // Use the first order's index (usually the earliest)
                    const firstOrder = item.orders[0];
                    this.sessionIndexMap.set(asuid, {
                        index: firstOrder.index,
                        session: firstOrder.session,
                        code: firstOrder.code
                    });
                }
            });

            console.log('[TPOS-CHAT] Loaded SessionIndex for', this.sessionIndexMap.size, 'users');

            // Re-render to show badges
            if (this.comments.length > 0) {
                this.renderComments();
            }

        } catch (error) {
            console.error('[TPOS-CHAT] Error loading SessionIndex:', error);
        }
    }

    // =====================================================
    // SSE REALTIME
    // =====================================================

    /**
     * Start SSE connection for realtime comments (via proxy)
     */
    startSSE() {
        if (!this.selectedPage || !this.selectedCampaign) return;

        // Close existing connection
        this.stopSSE();

        const pageId = this.selectedPage.Facebook_PageId;
        const postId = this.selectedCampaign.Facebook_LiveId;

        // Get token synchronously (it should be cached)
        this.getToken().then(token => {
            if (!token) {
                console.error('[TPOS-CHAT] No token for SSE');
                return;
            }

            // Use proxy for SSE to avoid CORS
            // Note: EventSource doesn't support custom headers, so we pass token in URL
            const sseUrl = `${this.proxyBaseUrl}/facebook/comments/stream?pageid=${pageId}&postId=${postId}&token=${encodeURIComponent(token)}`;

            console.log('[TPOS-CHAT] Starting SSE connection via proxy...');

            this.eventSource = new EventSource(sseUrl);

            this.eventSource.onopen = () => {
                console.log('[TPOS-CHAT] SSE connected');
                this.sseConnected = true;
                this.updateConnectionStatus(true, 'sse');
            };

            this.eventSource.onmessage = (event) => {
                this.handleSSEMessage(event.data);
            };

            this.eventSource.onerror = (error) => {
                console.error('[TPOS-CHAT] SSE error:', error);
                this.sseConnected = false;
                this.updateConnectionStatus(false, 'sse');

                // Auto-reconnect after 5 seconds
                setTimeout(() => {
                    if (this.selectedCampaign) {
                        console.log('[TPOS-CHAT] SSE reconnecting...');
                        this.startSSE();
                    }
                }, 5000);
            };
        });
    }

    /**
     * Stop SSE connection
     */
    stopSSE() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
            this.sseConnected = false;
            console.log('[TPOS-CHAT] SSE disconnected');
        }
    }

    /**
     * Check if a comment is from Page or Pancake accounts (not a customer)
     */
    isPageOrStaffComment(comment) {
        const fromId = comment.from?.id;
        if (!fromId) return false;

        // Check if from current page
        const pageId = this.selectedPage?.Facebook_PageId;
        if (pageId && fromId === pageId) {
            return true;
        }

        // Check if from any selected pages (multi-page mode)
        if (this.selectedPages.length > 0) {
            const selectedPageIds = this.selectedPages.map(p => p.Facebook_PageId);
            if (selectedPageIds.includes(fromId)) {
                return true;
            }
        }

        // Check if from any Pancake-managed pages
        if (window.pancakeDataManager?.pageIds) {
            if (window.pancakeDataManager.pageIds.includes(fromId)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Handle SSE message
     */
    handleSSEMessage(data) {
        try {
            // SSE data format: array of comments
            const comments = JSON.parse(data);

            if (!Array.isArray(comments)) return;

            comments.forEach(comment => {
                // Check if comment already exists
                const exists = this.comments.some(c => c.id === comment.id);

                if (!exists) {
                    const isStaff = this.isPageOrStaffComment(comment);
                    console.log('[TPOS-CHAT] 💬 New comment:', comment.from?.name, '-', comment.message?.substring(0, 30), isStaff ? '(staff)' : '(customer)');

                    if (isStaff) {
                        // Staff/Page comment - add to end, don't highlight or scroll
                        this.comments.push(comment);
                        this.renderComments();
                    } else {
                        // Customer comment - add to beginning and highlight
                        this.comments.unshift(comment);
                        this.renderComments();

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
                }
            });
        } catch (error) {
            console.error('[TPOS-CHAT] Error parsing SSE message:', error);
        }
    }

    // =====================================================
    // UI RENDER METHODS
    // =====================================================

    /**
     * Render CRM Team/Page options
     */
    renderCrmTeamOptions() {
        const select = document.getElementById('tposCrmTeamSelect');
        if (!select) return;

        // Collect all pages first
        this.allPages = [];
        this.crmTeams.forEach(team => {
            if (team.Childs && team.Childs.length > 0) {
                team.Childs.forEach(page => {
                    if (page.Facebook_PageId && page.Facebook_TypeId === 'Page') {
                        this.allPages.push({
                            ...page,
                            teamId: team.Id,
                            teamName: team.Name
                        });
                    }
                });
            }
        });

        let options = '<option value="">Chọn Page...</option>';

        // Add "All Pages" option if more than 1 page
        if (this.allPages.length > 1) {
            options += `<option value="all">📋 Tất cả Pages (${this.allPages.length})</option>`;
        }

        this.crmTeams.forEach(team => {
            // Add parent team as optgroup
            if (team.Childs && team.Childs.length > 0) {
                options += `<optgroup label="${this.escapeHtml(team.Name)}">`;
                team.Childs.forEach(page => {
                    if (page.Facebook_PageId && page.Facebook_TypeId === 'Page') {
                        options += `<option value="${team.Id}:${page.Id}" data-page-id="${page.Facebook_PageId}">
                            ${this.escapeHtml(page.Facebook_PageName || page.Name)}
                        </option>`;
                    }
                });
                options += '</optgroup>';
            }
        });

        select.innerHTML = options;
        select.disabled = false;
    }

    /**
     * Render Live Campaign options
     */
    renderLiveCampaignOptions() {
        const select = document.getElementById('tposLiveCampaignSelect');
        if (!select) return;

        let options = '<option value="">Chọn Live Campaign...</option>';

        this.liveCampaigns.forEach(campaign => {
            options += `<option value="${campaign.Id}">
                ${this.escapeHtml(campaign.Name)} (${campaign.Facebook_UserName || ''})
            </option>`;
        });

        select.innerHTML = options;
        select.disabled = this.liveCampaigns.length === 0;
    }

    /**
     * Render comments list
     */
    renderComments() {
        const listContainer = document.getElementById('tposCommentList');
        if (!listContainer) return;

        if (this.comments.length === 0) {
            listContainer.innerHTML = `
                <div class="tpos-empty">
                    <i data-lucide="message-square"></i>
                    <span>Chưa có comment nào</span>
                    <p style="font-size: 12px; color: #94a3b8; margin-top: 8px;">
                        Comment mới sẽ tự động hiển thị khi có người bình luận
                    </p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        listContainer.innerHTML = this.comments.map(comment => this.renderCommentItem(comment)).join('');

        // Update load more indicator (show when loading more)
        this.updateLoadMoreIndicator();

        // Refresh Lucide icons
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /**
     * Render single comment item
     */
    renderCommentItem(comment) {
        const id = comment.id;
        const message = comment.message || '';
        const fromName = comment.from?.name || 'Unknown';
        const fromId = comment.from?.id || '';
        const createdTime = comment.created_time;
        const isHidden = comment.is_hidden;

        // Get avatar URL - prioritize SSE direct URL, fallback to building from PSID
        const directPictureUrl = comment.from?.picture?.data?.url || '';
        const pictureUrl = this.getAvatarUrl(fromId, directPictureUrl);

        // Format time
        const timeStr = this.formatTime(createdTime);

        // Get SessionIndex badge for this user
        const sessionInfo = this.sessionIndexMap.get(fromId);
        const sessionIndexBadge = sessionInfo
            ? `<span class="session-index-badge" title="${sessionInfo.code || '#' + sessionInfo.index}">${sessionInfo.index}</span>`
            : '';

        // Generate placeholder color based on name
        const colors = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
        ];
        const colorIndex = fromName.charCodeAt(0) % colors.length;
        const gradientColor = colors[colorIndex];
        const initial = fromName.charAt(0).toUpperCase();

        return `
            <div class="tpos-conversation-item ${isHidden ? 'is-hidden' : ''}"
                 data-comment-id="${id}"
                 onclick="window.tposChatManager.selectComment('${id}')">
                <div class="tpos-conv-avatar">
                    ${pictureUrl
                ? `<img src="${pictureUrl}" class="avatar-img" alt="${this.escapeHtml(fromName)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                           <div class="avatar-placeholder" style="display: none; background: ${gradientColor};">${initial}</div>`
                : `<div class="avatar-placeholder" style="background: ${gradientColor};">${initial}</div>`
            }
                    ${sessionIndexBadge}
                    <span class="channel-badge">
                        <i data-lucide="facebook" class="channel-icon fb"></i>
                    </span>
                </div>
                <div class="tpos-conv-content">
                    <div class="tpos-conv-header">
                        <span class="customer-name">${this.escapeHtml(fromName)}</span>
                        ${isHidden ? '<span class="tpos-tag" style="background:#fee2e2;color:#dc2626;">Ẩn</span>' : ''}
                    </div>
                    <div class="tpos-conv-message">${this.escapeHtml(message)}</div>
                </div>
                <div class="tpos-conv-actions">
                    <button class="tpos-action-btn tpos-phone-btn" title="Xem thông tin khách hàng" onclick="event.stopPropagation(); window.tposChatManager.showCustomerInfo('${fromId}', '${this.escapeHtml(fromName)}')">
                        <i data-lucide="phone"></i>
                    </button>
                    <button class="tpos-action-btn tpos-save-btn" title="Tạo đơn hàng" onclick="event.stopPropagation(); window.tposChatManager.handleCreateOrder('${fromId}', '${this.escapeHtml(fromName)}')">
                        <i data-lucide="plus"></i>
                    </button>
                </div>
                <div class="tpos-conv-meta">
                    <span class="tpos-conv-time">${timeStr}</span>
                </div>
            </div>
        `;
    }

    // =====================================================
    // EVENT HANDLERS
    // =====================================================

    /**
     * Handle CRM Team selection change
     */
    async onCrmTeamChange(value) {
        if (!value) {
            this.selectedTeamId = null;
            this.selectedPage = null;
            this.selectedPages = [];
            this.liveCampaigns = [];
            this.renderLiveCampaignOptions();
            return;
        }

        // Handle "all pages" selection
        if (value === 'all') {
            this.selectedTeamId = null;
            this.selectedPage = this.allPages[0] || null; // Use first page as primary
            this.selectedPages = [...this.allPages]; // All pages selected

            console.log('[TPOS-CHAT] Selected ALL pages:', this.allPages.length);

            // Save to localStorage
            localStorage.setItem('tpos_selected_page', value);

            // Load campaigns from all pages
            await this.loadLiveCampaignsFromAllPages();

            // Auto-select first campaign if available
            if (this.liveCampaigns.length > 0) {
                const firstCampaign = this.liveCampaigns[0];
                const campaignSelect = document.getElementById('tposLiveCampaignSelect');
                if (campaignSelect) {
                    campaignSelect.value = firstCampaign.Id;
                }
                await this.onLiveCampaignChange(firstCampaign.Id);
                return;
            }
        } else {
            // Single page selection
            const [teamId, pageId] = value.split(':');
            this.selectedTeamId = parseInt(teamId);

            // Find the selected page
            for (const team of this.crmTeams) {
                if (team.Id === this.selectedTeamId) {
                    this.selectedPage = team.Childs?.find(p => p.Id === parseInt(pageId));
                    break;
                }
            }

            this.selectedPages = this.selectedPage ? [this.selectedPage] : [];

            if (this.selectedPage) {
                console.log('[TPOS-CHAT] Selected page:', this.selectedPage.Facebook_PageName);

                // Save to localStorage
                localStorage.setItem('tpos_selected_page', value);

                await this.loadLiveCampaigns(this.selectedPage.Facebook_PageId);

                // Auto-select first campaign if available
                if (this.liveCampaigns.length > 0) {
                    const firstCampaign = this.liveCampaigns[0];
                    const campaignSelect = document.getElementById('tposLiveCampaignSelect');
                    if (campaignSelect) {
                        campaignSelect.value = firstCampaign.Id;
                    }
                    await this.onLiveCampaignChange(firstCampaign.Id);
                    return;
                }
            }
        }

        // Reset campaign selection
        this.selectedCampaign = null;
        this.stopSSE();
        this.comments = [];
        this.renderComments();
    }

    /**
     * Handle Live Campaign selection change
     */
    async onLiveCampaignChange(campaignId) {
        if (!campaignId) {
            this.selectedCampaign = null;
            this.stopSSE();
            this.comments = [];
            this.renderComments();
            return;
        }

        this.selectedCampaign = this.liveCampaigns.find(c => c.Id === campaignId);

        if (this.selectedCampaign) {
            // When multiple pages selected, update selectedPage to match campaign's page
            if (this.selectedPages.length > 1) {
                const campaignPageId = this.selectedCampaign.Facebook_UserId;
                this.selectedPage = this.allPages.find(p => p.Facebook_PageId === campaignPageId) || this.selectedPage;
            }

            console.log('[TPOS-CHAT] Selected campaign:', this.selectedCampaign.Name, '- Page:', this.selectedPage?.Facebook_PageName);
            await this.loadComments();
        }
    }

    /**
     * Select a comment
     */
    selectComment(commentId) {
        // Update selection UI
        document.querySelectorAll('.tpos-conversation-item').forEach(item => {
            item.classList.remove('selected');
        });
        const selectedItem = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        // Dispatch event for other components
        const comment = this.comments.find(c => c.id === commentId);
        if (comment) {
            window.dispatchEvent(new CustomEvent('tposCommentSelected', {
                detail: { comment }
            }));
        }
    }

    /**
     * Refresh - reload everything
     */
    async refresh() {
        this.stopSSE();

        if (this.selectedCampaign) {
            await this.loadComments();
        } else if (this.selectedPage) {
            await this.loadLiveCampaigns(this.selectedPage.Facebook_PageId);
        } else {
            await this.loadCRMTeams();
        }
    }

    // =====================================================
    // ACTIONS
    // =====================================================

    /**
     * Handle phone action - placeholder for future functionality
     */
    handlePhoneAction(customerId, customerName) {
        console.log('[TPOS-CHAT] Phone action:', { customerId, customerName });
        // TODO: Add phone functionality here
        if (window.notificationManager) {
            window.notificationManager.show(`Gọi điện: ${customerName}`, 'info');
        }
    }

    /**
     * Create order from comment
     */
    createOrder(commentId, customerName, message) {
        console.log('[TPOS-CHAT] Create order:', { commentId, customerName, message });

        // Dispatch event for order creation
        window.dispatchEvent(new CustomEvent('tposCreateOrder', {
            detail: {
                commentId,
                customerName,
                message,
                page: this.selectedPage,
                campaign: this.selectedCampaign
            }
        }));

        // Show notification
        if (window.notificationManager) {
            window.notificationManager.show(`Tạo đơn cho: ${customerName}`, 'info');
        }
    }

    /**
     * Show customer info modal
     * Fetches data from TPOS API and displays in modal
     */
    async showCustomerInfo(customerId, customerName) {
        console.log('[TPOS-CHAT] Show customer info:', { customerId, customerName });

        if (!customerId) {
            console.error('[TPOS-CHAT] No customerId provided');
            if (window.notificationManager) {
                window.notificationManager.show('Không có ID khách hàng', 'error');
            }
            return;
        }

        // Show modal with loading state
        const modal = document.getElementById('customerInfoModal');
        const titleEl = document.getElementById('customerInfoTitle');
        const bodyEl = document.getElementById('customerInfoBody');

        if (!modal || !bodyEl) {
            console.error('[TPOS-CHAT] Customer info modal not found');
            return;
        }

        titleEl.textContent = `Thông tin: ${customerName}`;
        bodyEl.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <i data-lucide="loader-2" class="spin" style="width: 32px; height: 32px; color: #3b82f6;"></i>
                <p style="margin-top: 12px; color: #6b7280;">Đang tải thông tin...</p>
            </div>
        `;
        modal.style.display = 'flex';
        if (window.lucide) lucide.createIcons();

        try {
            // Get CRM Team ID - use selectedTeamId or extract from selectedPage
            const crmTeamId = this.selectedTeamId || this.selectedPage?.CRMTeamId || this.selectedPage?.Id;

            if (!crmTeamId) {
                throw new Error('Không xác định được CRM Team ID');
            }

            // Fetch customer info from TPOS API
            const apiUrl = `${this.tposBaseUrl}/rest/v2.0/chatomni/info/${crmTeamId}_${customerId}`;
            console.log('[TPOS-CHAT] Fetching customer info:', apiUrl);

            const response = await this.authenticatedFetch(apiUrl);

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            console.log('[TPOS-CHAT] Customer info loaded:', data);

            // Render the customer info
            this.renderCustomerInfoModal(data, customerName);

        } catch (error) {
            console.error('[TPOS-CHAT] Error loading customer info:', error);
            bodyEl.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #ef4444;"></i>
                    <p style="margin-top: 12px; color: #ef4444; font-weight: 500;">Lỗi tải thông tin</p>
                    <p style="color: #6b7280; font-size: 13px;">${error.message}</p>
                    <button onclick="window.tposChatManager.closeCustomerInfoModal()"
                            style="margin-top: 16px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        Đóng
                    </button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    }

    /**
     * Render customer info data into modal
     */
    renderCustomerInfoModal(data, customerName) {
        const bodyEl = document.getElementById('customerInfoBody');
        if (!bodyEl) return;

        const partner = data.Partner || {};
        const order = data.Order || {};
        const conversation = data.Conversation || {};
        const revenue = data.Revenue || {};

        // Status badge class
        const getStatusClass = (status) => {
            if (status === 0 || status === 'Bình thường') return 'status-normal';
            if (status === 1 || status === 'Cảnh báo') return 'status-warning';
            return 'status-danger';
        };

        // Format date
        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            const date = new Date(dateStr);
            return date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        };

        bodyEl.innerHTML = `
            <!-- Customer Basic Info -->
            <div class="customer-section">
                <h4><i data-lucide="user" style="width: 16px; height: 16px;"></i> Thông tin khách hàng</h4>
                <div class="customer-field">
                    <label>Tên:</label>
                    <span><strong>${this.escapeHtml(partner.Name || customerName)}</strong> (Id: ${partner.Id || '-'})</span>
                </div>
                <div class="customer-field">
                    <label>Trạng thái:</label>
                    <span class="status-badge ${getStatusClass(partner.Status)}">${partner.StatusText || 'Bình thường'}</span>
                </div>
                <div class="customer-field">
                    <label>Điện thoại:</label>
                    <span>${partner.Phone || conversation.Phone || '-'}</span>
                </div>
                <div class="customer-field">
                    <label>Email:</label>
                    <span>${partner.Email || '-'}</span>
                </div>
                <div class="customer-field">
                    <label>Địa chỉ:</label>
                    <span>${partner.FullAddress || partner.Street || '-'}</span>
                </div>
                ${partner.Comment ? `
                <div class="customer-field">
                    <label>Ghi chú:</label>
                    <span>${this.escapeHtml(partner.Comment)}</span>
                </div>
                ` : ''}
            </div>

            <!-- Revenue Info -->
            <div class="customer-section">
                <h4><i data-lucide="trending-up" style="width: 16px; height: 16px;"></i> Doanh thu</h4>
                <div class="customer-field">
                    <label>Tổng doanh thu:</label>
                    <span><strong>${(revenue.RevenueTotal || 0).toLocaleString('vi-VN')}đ</strong></span>
                </div>
            </div>

            <!-- Order Info -->
            ${order.Id ? `
            <div class="customer-section">
                <h4><i data-lucide="shopping-bag" style="width: 16px; height: 16px;"></i> Đơn hàng gần nhất</h4>
                <table class="order-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Trạng thái</th>
                            <th>Ngày tạo</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><span class="order-code">${order.Code || order.Id}</span></td>
                            <td><span class="status-badge ${getStatusClass(order.Status)}">${order.StatusText || 'Nháp'}</span></td>
                            <td>${formatDate(order.DateCreated)}</td>
                        </tr>
                    </tbody>
                </table>
                ${order.Note ? `
                <div style="margin-top: 12px; padding: 8px 12px; background: #fef3c7; border-radius: 6px;">
                    <strong style="font-size: 12px; color: #92400e;">Ghi chú đơn:</strong>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #92400e;">${this.escapeHtml(order.Note)}</p>
                </div>
                ` : ''}
            </div>
            ` : `
            <div class="customer-section">
                <h4><i data-lucide="shopping-bag" style="width: 16px; height: 16px;"></i> Đơn hàng</h4>
                <p style="color: #6b7280; font-size: 13px; text-align: center; padding: 20px 0;">Chưa có đơn hàng</p>
            </div>
            `}

            <!-- Actions -->
            <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button onclick="window.tposChatManager.closeCustomerInfoModal()"
                        style="flex: 1; padding: 10px 16px; background: #f3f4f6; color: #374151; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                    Đóng
                </button>
                ${order.Code ? `
                <button onclick="window.open('https://tomato.tpos.vn/sale-online/order/${order.Id}', '_blank')"
                        style="flex: 1; padding: 10px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                    <i data-lucide="external-link" style="width: 14px; height: 14px; display: inline; vertical-align: middle;"></i>
                    Mở đơn trên TPOS
                </button>
                ` : ''}
            </div>
        `;

        if (window.lucide) lucide.createIcons();
    }

    /**
     * Close customer info modal
     */
    closeCustomerInfoModal() {
        const modal = document.getElementById('customerInfoModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Toggle hide/show comment
     */
    async toggleHideComment(commentId, hide) {
        console.log('[TPOS-CHAT] Toggle hide comment:', commentId, hide);

        // TODO: Implement API call to hide/show comment
        // For now, just update local state
        const comment = this.comments.find(c => c.id === commentId);
        if (comment) {
            comment.is_hidden = hide;
            this.renderComments();
        }

        if (window.notificationManager) {
            window.notificationManager.show(hide ? 'Đã ẩn comment' : 'Đã hiện comment', 'success');
        }
    }

    /**
     * Update connection status indicator
     */
    updateConnectionStatus(connected, type = 'sse') {
        const indicator = document.getElementById('tposStatusIndicator');
        if (!indicator) return;

        const dot = indicator.querySelector('.status-dot');
        const text = indicator.querySelector('.status-text');

        if (connected) {
            dot?.classList.remove('disconnected');
            dot?.classList.add('connected');
            if (text) text.textContent = type === 'sse' ? 'Live' : 'Connected';
        } else {
            dot?.classList.remove('connected');
            dot?.classList.add('disconnected');
            if (text) text.textContent = 'Offline';
        }
    }

    // =====================================================
    // UTILITY FUNCTIONS
    // =====================================================

    /**
     * Get avatar URL for a Facebook user
     * Uses Cloudflare Worker proxy that tries:
     * 1. Pancake Avatar API: https://pancake.vn/api/v1/pages/{pageId}/avatar/{fbId}
     * 2. Facebook Graph API: https://graph.facebook.com/{fbId}/picture
     * 3. Default SVG placeholder
     */
    getAvatarUrl(userId, directUrl = null) {
        // Priority 1: Use direct URL from SSE stream (has signed params)
        if (directUrl && directUrl.startsWith('http')) {
            return directUrl;
        }

        // Priority 2: Use Cloudflare Worker proxy for avatar
        // This proxy tries Pancake first, then Facebook Graph API
        if (userId) {
            const pageId = this.selectedPage?.Facebook_PageId || '270136663390370';
            return `https://chatomni-proxy.nhijudyshop.workers.dev/api/fb-avatar?id=${userId}&page=${pageId}`;
        }

        // Fallback: Return null - will use gradient placeholder
        return null;
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
