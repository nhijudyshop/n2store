// =====================================================
// FACEBOOK PAGE & LIVESTREAM SELECTOR
// =====================================================

class FacebookPageSelector {
    constructor() {
        this.accounts = [];
        this.selectedAccount = null;
        this.selectedPage = null;
        this.livestreams = [];
        this.cachedAccounts = null;
        this.cachedLivestreams = new Map();
        
        this.API_ACCOUNTS = 'https://tomato.tpos.vn/odata/CRMTeam/ODataService.GetAllFacebook?$expand=Childs';
        this.API_LIVESTREAM_BASE = 'https://tomato.tpos.vn/api/facebook-graph/livevideo';
    }

    // Initialize the selector
    async init() {
        console.log('[FB SELECTOR] Initializing Facebook Page Selector...');
        await this.loadAccounts();
        this.setupEventListeners();
    }

    // Load accounts and pages from API
    async loadAccounts() {
        const notificationId = window.notificationManager?.show(
            'Đang tải danh sách tài khoản Facebook...',
            'info',
            0,
            { showOverlay: true, persistent: true, icon: 'loader' }
        );

        try {
            // Check cache first
            const cached = window.cacheManager?.get('facebook_accounts', 'page_selector');
            if (cached) {
                console.log('[FB SELECTOR] Using cached accounts data');
                this.accounts = cached;
                this.populateAccountDropdown();
                window.notificationManager?.remove(notificationId);
                window.notificationManager?.success('Đã tải danh sách tài khoản (từ cache)', 2000);
                return;
            }

            // Fetch from API using tokenManager's authenticatedFetch
            const response = await window.tokenManager?.authenticatedFetch(this.API_ACCOUNTS, {
                method: 'GET'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.accounts = data.value || [];

            // Cache the data for 1 hour
            window.cacheManager?.set('facebook_accounts', this.accounts, 'page_selector');

            // Save full response to localStorage for debugging
            try {
                localStorage.setItem('fb_accounts_response', JSON.stringify(data));
            } catch (e) {
                console.warn('[FB SELECTOR] Could not save response to localStorage:', e);
            }

            this.populateAccountDropdown();

            window.notificationManager?.remove(notificationId);
            window.notificationManager?.success(
                `Đã tải ${this.accounts.length} tài khoản Facebook`,
                2000
            );

        } catch (error) {
            console.error('[FB SELECTOR] Error loading accounts:', error);
            window.notificationManager?.remove(notificationId);
            window.notificationManager?.error(
                `Lỗi khi tải danh sách tài khoản: ${error.message}`,
                4000
            );
        }
    }

    // Populate account dropdown
    populateAccountDropdown() {
        const accountSelect = document.getElementById('fbAccountSelect');
        if (!accountSelect) return;

        // Clear existing options
        accountSelect.innerHTML = '<option value="">-- Chọn tài khoản --</option>';

        // Add accounts
        this.accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.Facebook_ASUserId;
            option.textContent = `${account.Facebook_UserName} (${account.CountPage} pages)`;
            option.dataset.accountId = account.Id;
            accountSelect.appendChild(option);
        });

        console.log(`[FB SELECTOR] Populated ${this.accounts.length} accounts`);
    }

    // Handle account selection
    async onAccountSelect(accountUserId) {
        if (!accountUserId) {
            this.clearPageDropdown();
            this.clearLivestreamList();
            return;
        }

        this.selectedAccount = this.accounts.find(
            acc => acc.Facebook_ASUserId === accountUserId
        );

        if (!this.selectedAccount) {
            console.error('[FB SELECTOR] Account not found');
            return;
        }

        console.log('[FB SELECTOR] Selected account:', this.selectedAccount.Facebook_UserName);
        this.populatePageDropdown();
    }

    // Populate page dropdown from selected account
    populatePageDropdown() {
        const pageSelect = document.getElementById('fbPageSelect');
        if (!pageSelect) return;

        // Clear existing options
        pageSelect.innerHTML = '<option value="">-- Chọn page --</option>';

        if (!this.selectedAccount || !this.selectedAccount.Childs) {
            return;
        }

        // Filter only active pages
        const pages = this.selectedAccount.Childs.filter(child => 
            child.Active && child.Facebook_TypeId === 'Page'
        );

        pages.forEach(page => {
            const option = document.createElement('option');
            option.value = page.Facebook_PageId;
            option.textContent = page.Facebook_PageName;
            option.dataset.pageId = page.Id;
            pageSelect.appendChild(option);
        });

        // Enable page dropdown
        pageSelect.disabled = false;

        console.log(`[FB SELECTOR] Populated ${pages.length} pages`);
    }

    // Clear page dropdown
    clearPageDropdown() {
        const pageSelect = document.getElementById('fbPageSelect');
        if (pageSelect) {
            pageSelect.innerHTML = '<option value="">-- Chọn page --</option>';
            pageSelect.disabled = true;
        }
        this.selectedPage = null;
    }

    // Handle page selection and load livestreams
    async onPageSelect(pageId) {
        if (!pageId) {
            this.clearLivestreamList();
            return;
        }

        this.selectedPage = this.selectedAccount?.Childs?.find(
            page => page.Facebook_PageId === pageId
        );

        if (!this.selectedPage) {
            console.error('[FB SELECTOR] Page not found');
            return;
        }

        console.log('[FB SELECTOR] Selected page:', this.selectedPage.Facebook_PageName);
        await this.loadLivestreams(pageId);
    }

    // Load livestreams for selected page
    async loadLivestreams(pageId) {
        const notificationId = window.notificationManager?.show(
            'Đang tải danh sách livestream...',
            'info',
            0,
            { showOverlay: true, persistent: true, icon: 'loader' }
        );

        try {
            // Check cache first
            const cached = this.cachedLivestreams.get(pageId);
            if (cached) {
                console.log('[FB SELECTOR] Using cached livestream data');
                this.livestreams = cached;
                this.renderLivestreamList();
                window.notificationManager?.remove(notificationId);
                window.notificationManager?.success('Đã tải danh sách livestream (từ cache)', 2000);
                return;
            }

            // Fetch from API using tokenManager's authenticatedFetch
            const url = `${this.API_LIVESTREAM_BASE}?pageid=${pageId}&limit=20&facebook_Type=page`;
            
            const response = await window.tokenManager?.authenticatedFetch(url, {
                method: 'GET'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.livestreams = data.data || [];

            // Cache the data for 30 minutes
            this.cachedLivestreams.set(pageId, this.livestreams);

            // Save full response to localStorage for debugging
            try {
                localStorage.setItem('fb_livestream_response', JSON.stringify(data));
            } catch (e) {
                console.warn('[FB SELECTOR] Could not save response to localStorage:', e);
            }

            this.renderLivestreamList();

            window.notificationManager?.remove(notificationId);
            window.notificationManager?.success(
                `Đã tải ${this.livestreams.length} livestream`,
                2000
            );

        } catch (error) {
            console.error('[FB SELECTOR] Error loading livestreams:', error);
            window.notificationManager?.remove(notificationId);
            window.notificationManager?.error(
                `Lỗi khi tải livestream: ${error.message}`,
                4000
            );
            this.clearLivestreamList();
        }
    }

    // Render livestream list
    renderLivestreamList() {
        const container = document.getElementById('livestreamListContainer');
        if (!container) return;

        if (this.livestreams.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="video-off" class="empty-icon"></i>
                    <p>Không có livestream nào</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Build livestream cards
        const html = this.livestreams.map((stream, index) => {
            const date = new Date(stream.channelCreatedTime);
            const formattedDate = date.toLocaleString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div class="livestream-card" data-object-id="${stream.objectId}">
                    <div class="livestream-thumbnail">
                        ${stream.thumbnail?.url ? 
                            `<img src="${stream.thumbnail.url}" alt="Thumbnail" />` :
                            `<div class="no-thumbnail"><i data-lucide="video"></i></div>`
                        }
                        <div class="livestream-stats">
                            <span title="Comments"><i data-lucide="message-circle"></i> ${stream.countComment || 0}</span>
                        </div>
                    </div>
                    <div class="livestream-content">
                        <div class="livestream-title">${stream.title || 'Không có tiêu đề'}</div>
                        <div class="livestream-meta">
                            <span class="livestream-date">
                                <i data-lucide="calendar"></i> ${formattedDate}
                            </span>
                        </div>
                        <div class="livestream-id">
                            <code>${stream.objectId}</code>
                        </div>
                    </div>
                    <div class="livestream-actions">
                        <button class="btn btn-sm btn-primary select-livestream-btn" 
                                data-object-id="${stream.objectId}"
                                data-title="${(stream.title || '').replace(/"/g, '&quot;')}">
                            <i data-lucide="check"></i> Chọn
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `<div class="livestream-grid">${html}</div>`;

        // Initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Add click handlers
        this.attachLivestreamClickHandlers();
    }

    // Clear livestream list
    clearLivestreamList() {
        const container = document.getElementById('livestreamListContainer');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="video-off" class="empty-icon"></i>
                    <p>Chọn page để xem livestream</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        this.livestreams = [];
    }

    // Attach click handlers to livestream cards
    attachLivestreamClickHandlers() {
        const selectButtons = document.querySelectorAll('.select-livestream-btn');
        selectButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const objectId = button.dataset.objectId;
                const title = button.dataset.title;
                this.selectLivestream(objectId, title);
            });
        });

        // Also make cards clickable
        const cards = document.querySelectorAll('.livestream-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const button = card.querySelector('.select-livestream-btn');
                if (button) {
                    const objectId = button.dataset.objectId;
                    const title = button.dataset.title;
                    this.selectLivestream(objectId, title);
                }
            });
        });
    }

    // Select a livestream and fill the Post ID field
    selectLivestream(objectId, title) {
        const postIdInput = document.getElementById('facebookPostId');
        if (postIdInput) {
            postIdInput.value = objectId;
            
            // Highlight the input briefly
            postIdInput.classList.add('field-highlight');
            setTimeout(() => {
                postIdInput.classList.remove('field-highlight');
            }, 1000);

            window.notificationManager?.success(
                `Đã chọn livestream: ${title ? title.substring(0, 50) + '...' : objectId}`,
                3000
            );

            // Close modal if it exists
            const modal = document.getElementById('pageSelectionModal');
            if (modal) {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        }
    }

    // Setup event listeners
    setupEventListeners() {
        // Account selection
        const accountSelect = document.getElementById('fbAccountSelect');
        if (accountSelect) {
            accountSelect.addEventListener('change', (e) => {
                this.onAccountSelect(e.target.value);
            });
        }

        // Page selection
        const pageSelect = document.getElementById('fbPageSelect');
        if (pageSelect) {
            pageSelect.addEventListener('change', (e) => {
                this.onPageSelect(e.target.value);
            });
        }

        // Open modal button
        const openModalBtn = document.getElementById('openPageSelectorBtn');
        if (openModalBtn) {
            openModalBtn.addEventListener('click', () => {
                this.openModal();
            });
        }

        // Close modal button
        const closeModalBtn = document.getElementById('closePageSelectorModal');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                this.closeModal();
            });
        }

        // Refresh accounts button
        const refreshBtn = document.getElementById('refreshAccountsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshAccounts();
            });
        }

        // Modal backdrop click
        const modal = document.getElementById('pageSelectionModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal();
                }
            });
        }
    }

    // Open modal
    openModal() {
        const modal = document.getElementById('pageSelectionModal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    // Close modal
    closeModal() {
        const modal = document.getElementById('pageSelectionModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }

    // Refresh accounts (force reload from API)
    async refreshAccounts() {
        // Clear cache
        window.cacheManager?.clear('page_selector');
        this.cachedLivestreams.clear();
        
        // Reload
        await this.loadAccounts();
        
        // Reset selections
        this.clearPageDropdown();
        this.clearLivestreamList();
    }
}

// =====================================================
// INITIALIZE
// =====================================================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFacebookPageSelector);
} else {
    initFacebookPageSelector();
}

function initFacebookPageSelector() {
    // Wait for token manager to be ready
    const checkTokenManager = setInterval(() => {
        if (window.tokenManager) {
            clearInterval(checkTokenManager);
            
            // Initialize Facebook Page Selector
            window.fbPageSelector = new FacebookPageSelector();
            window.fbPageSelector.init();
            
            console.log('[FB SELECTOR] Facebook Page Selector initialized');
        }
    }, 100);
}
