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
        this.selectedCampaign = null;

        // Data lists
        this.crmTeams = [];
        this.liveCampaigns = [];

        // Pagination
        this.nextPageUrl = null;
        this.hasMore = false;

        // SSE connection
        this.eventSource = null;
        this.sseConnected = false;

        // API config - use render.com proxy to avoid CORS
        this.proxyBaseUrl = 'https://n2store-fallback.onrender.com';
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
                <!-- Header with selectors -->
                <div class="tpos-chat-header">
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

                    <div class="tpos-header-actions">
                        <div class="tpos-status-indicator" id="tposStatusIndicator">
                            <span class="status-dot disconnected"></span>
                            <span class="status-text">Offline</span>
                        </div>
                        <button class="tpos-btn-refresh" id="btnTposRefresh" title="Refresh">
                            <i data-lucide="refresh-cw"></i>
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

                <!-- Load more button -->
                <div class="tpos-load-more" id="tposLoadMore" style="display: none;">
                    <button class="tpos-btn-load-more" id="btnTposLoadMore">
                        Tải thêm comment cũ
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

        // Load more button
        const btnLoadMore = document.getElementById('btnTposLoadMore');
        if (btnLoadMore) {
            btnLoadMore.addEventListener('click', () => this.loadMoreComments());
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
     * Load CRM Teams with Pages (via proxy)
     */
    async loadCRMTeams() {
        try {
            const token = await this.getToken();
            if (!token) {
                console.error('[TPOS-CHAT] No token available');
                return;
            }

            const response = await fetch(`${this.proxyBaseUrl}/facebook/crm-teams`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

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
            const token = await this.getToken();
            if (!token) return;

            const response = await fetch(`${this.proxyBaseUrl}/facebook/live-campaigns?top=20`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

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
     * Load comments for selected campaign
     */
    async loadComments(append = false) {
        if (this.isLoading || !this.selectedPage || !this.selectedCampaign) return;

        this.isLoading = true;
        const listContainer = document.getElementById('tposCommentList');

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

            // Start SSE after loading initial comments
            if (!append) {
                this.startSSE();
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
                    console.log('[TPOS-CHAT] 💬 New comment:', comment.from?.name, '-', comment.message?.substring(0, 30));

                    // Add to beginning of list
                    this.comments.unshift(comment);

                    // Re-render
                    this.renderComments();

                    // Highlight new comment
                    setTimeout(() => {
                        const item = document.querySelector(`[data-comment-id="${comment.id}"]`);
                        if (item) {
                            item.classList.add('highlight');
                            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            setTimeout(() => item.classList.remove('highlight'), 3000);
                        }
                    }, 100);
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

        let options = '<option value="">Chọn Page...</option>';

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

        // Show/hide load more button
        const loadMoreContainer = document.getElementById('tposLoadMore');
        if (loadMoreContainer) {
            loadMoreContainer.style.display = this.hasMore ? 'flex' : 'none';
        }

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
                    <button class="tpos-action-btn" title="Tạo đơn" onclick="event.stopPropagation(); window.tposChatManager.createOrder('${id}', '${this.escapeHtml(fromName)}', '${this.escapeHtml(message)}')">
                        <i data-lucide="shopping-cart"></i>
                    </button>
                    <button class="tpos-action-btn" title="${isHidden ? 'Hiện comment' : 'Ẩn comment'}" onclick="event.stopPropagation(); window.tposChatManager.toggleHideComment('${id}', ${!isHidden})">
                        <i data-lucide="${isHidden ? 'eye' : 'eye-off'}"></i>
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
            this.liveCampaigns = [];
            this.renderLiveCampaignOptions();
            return;
        }

        const [teamId, pageId] = value.split(':');
        this.selectedTeamId = parseInt(teamId);

        // Find the selected page
        for (const team of this.crmTeams) {
            if (team.Id === this.selectedTeamId) {
                this.selectedPage = team.Childs?.find(p => p.Id === parseInt(pageId));
                break;
            }
        }

        if (this.selectedPage) {
            console.log('[TPOS-CHAT] Selected page:', this.selectedPage.Facebook_PageName);
            await this.loadLiveCampaigns(this.selectedPage.Facebook_PageId);
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
            console.log('[TPOS-CHAT] Selected campaign:', this.selectedCampaign.Name);
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
     * Only uses direct URL from SSE - can't build URL for old comments
     * Facebook profile picture URLs require signed parameters (eai, ext, hash)
     */
    getAvatarUrl(userId, directUrl = null) {
        // Only use direct URL from SSE stream (has signed params)
        // Can't build avatar URL for old comments - Facebook requires signed URLs
        if (directUrl && directUrl.startsWith('http')) {
            return directUrl;
        }

        // Return null - will use gradient placeholder
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
