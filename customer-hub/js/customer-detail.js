/**
 * Customer Detail - Handles the customer 360° view page
 */

const CustomerDetail = {
    // State
    customer: null,
    phone: null,
    isLoading: false,

    /**
     * Initialize the detail page
     */
    async init() {
        this.phone = Utils.getUrlParam('phone');

        if (!this.phone) {
            Utils.showToast('Không tìm thấy số điện thoại khách hàng', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }

        this.bindEvents();
        await this.loadCustomer();
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadCustomer());
        }

        // Edit customer button
        const editCustomerBtn = document.getElementById('editCustomerBtn');
        if (editCustomerBtn) {
            editCustomerBtn.addEventListener('click', () => this.editCustomer());
        }

        // Notes
        const addNoteBtn = document.getElementById('addNoteBtn');
        const saveNoteBtn = document.getElementById('saveNoteBtn');
        const cancelNoteBtn = document.getElementById('cancelNoteBtn');

        if (addNoteBtn) {
            addNoteBtn.addEventListener('click', () => this.showNoteForm());
        }
        if (saveNoteBtn) {
            saveNoteBtn.addEventListener('click', () => this.saveNote());
        }
        if (cancelNoteBtn) {
            cancelNoteBtn.addEventListener('click', () => this.hideNoteForm());
        }
    },

    /**
     * Load customer data
     */
    async loadCustomer() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading(true);

        try {
            const result = await CustomerService.getCustomer(this.phone);
            this.customer = result.customer || result;

            this.renderProfile();

            // Load wallet data
            if (typeof WalletPanel !== 'undefined') {
                await WalletPanel.load(this.phone);
            }

            // Load tickets
            if (typeof TicketPanel !== 'undefined') {
                await TicketPanel.load(this.phone);
            }

            // Load activities
            if (typeof ActivityTimeline !== 'undefined') {
                await ActivityTimeline.load(this.phone);
            }

            // Load notes
            await this.loadNotes();

        } catch (error) {
            console.error('Error loading customer:', error);
            Utils.showToast('Lỗi tải thông tin khách hàng: ' + error.message, 'error');
        } finally {
            this.isLoading = false;
            this.showLoading(false);
        }
    },

    /**
     * Render customer profile
     */
    renderProfile() {
        const c = this.customer;
        if (!c) return;

        // Basic info
        document.getElementById('customerName').textContent = c.name || '-';
        document.getElementById('customerPhone').textContent = Utils.formatPhone(c.phone);
        document.getElementById('customerEmail').textContent = c.email || 'Chưa có email';
        document.getElementById('customerAddress').textContent = c.address || 'Chưa có địa chỉ';

        // Status badge
        const statusBadge = document.getElementById('customerStatusBadge');
        const statusConfig = CONFIG.STATUSES[c.status] || CONFIG.STATUSES['Bình thường'];
        statusBadge.textContent = statusConfig.label;
        statusBadge.style.background = statusConfig.color;

        // Tier
        const tierBadge = document.getElementById('customerTier');
        const tierConfig = CONFIG.TIERS[c.tier] || CONFIG.TIERS['bronze'];
        tierBadge.innerHTML = `
            <i data-lucide="award"></i>
            <span>${tierConfig.label}</span>
        `;
        tierBadge.style.color = tierConfig.color;

        // RFM Score
        const rfmScore = document.getElementById('customerRFM');
        const rfmSegment = c.rfm_segment || '-';
        rfmScore.textContent = rfmSegment;

        // Tags
        const tagsContainer = document.getElementById('customerTags');
        const tags = c.tags || [];
        if (tags.length) {
            tagsContainer.innerHTML = tags.map(tag =>
                `<span class="tag">${tag}</span>`
            ).join('');
        } else {
            tagsContainer.innerHTML = '<span class="no-tags">Chưa có tags</span>';
        }

        // Quick stats
        document.getElementById('statTotalOrders').textContent = c.total_orders || 0;
        document.getElementById('statTotalSpent').textContent = Utils.formatCurrency(c.total_spent || 0);
        document.getElementById('statWalletBalance').textContent = Utils.formatCurrency(c.wallet?.balance || 0);
        document.getElementById('statDebt').textContent = Utils.formatCurrency(c.debt || 0);
        document.getElementById('statReturnRate').textContent = (c.return_rate || 0) + '%';

        // Re-render icons
        lucide.createIcons();
    },

    /**
     * Switch tabs
     */
    switchTab(tabId) {
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
        });

        // Load data for the tab if needed
        switch (tabId) {
            case 'wallet':
                if (typeof WalletPanel !== 'undefined') WalletPanel.load(this.phone);
                break;
            case 'tickets':
                if (typeof TicketPanel !== 'undefined') TicketPanel.load(this.phone);
                break;
            case 'activities':
                if (typeof ActivityTimeline !== 'undefined') ActivityTimeline.load(this.phone);
                break;
        }
    },

    /**
     * Show loading indicator
     */
    showLoading(show) {
        const loader = document.getElementById('loadingIndicator');
        const profile = document.getElementById('customerProfile');

        if (loader) loader.style.display = show ? 'flex' : 'none';
        if (profile) profile.style.opacity = show ? '0.5' : '1';
    },

    /**
     * Edit customer
     */
    editCustomer() {
        // For now, redirect to list page with edit modal
        // In production, could show inline edit form
        Utils.showToast('Tính năng chỉnh sửa inline đang phát triển', 'info');
    },

    /**
     * Show note form
     */
    showNoteForm() {
        const form = document.getElementById('noteFormContainer');
        const textarea = document.getElementById('noteContent');
        if (form) {
            form.style.display = 'block';
            textarea.focus();
        }
    },

    /**
     * Hide note form
     */
    hideNoteForm() {
        const form = document.getElementById('noteFormContainer');
        const textarea = document.getElementById('noteContent');
        if (form) {
            form.style.display = 'none';
            textarea.value = '';
        }
    },

    /**
     * Save note
     */
    async saveNote() {
        const textarea = document.getElementById('noteContent');
        const content = textarea.value.trim();

        if (!content) {
            Utils.showToast('Vui lòng nhập nội dung ghi chú', 'warning');
            return;
        }

        try {
            await CustomerService.addCustomerNote(this.phone, content);
            Utils.showToast('Đã thêm ghi chú thành công!', 'success');
            this.hideNoteForm();
            await this.loadNotes();
        } catch (error) {
            Utils.showToast('Lỗi thêm ghi chú: ' + error.message, 'error');
        }
    },

    /**
     * Load notes
     */
    async loadNotes() {
        try {
            // Notes are usually included in customer activities or separate endpoint
            const result = await CustomerService.getCustomerActivities(this.phone);
            const activities = result.activities || result.data || [];

            // Filter notes
            const notes = activities.filter(a => a.activity_type === 'note');
            this.renderNotes(notes);
        } catch (error) {
            console.error('Error loading notes:', error);
        }
    },

    /**
     * Render notes
     */
    renderNotes(notes) {
        const container = document.getElementById('notesList');
        if (!container) return;

        if (!notes.length) {
            container.innerHTML = `
                <div class="empty-state-small">
                    <i data-lucide="sticky-note"></i>
                    <p>Chưa có ghi chú nào</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        container.innerHTML = notes.map(note => `
            <div class="note-item ${note.is_important ? 'important' : ''}">
                <div class="note-header">
                    <span class="note-author">
                        <i data-lucide="user"></i> ${note.created_by || 'Hệ thống'}
                    </span>
                    <span class="note-time">${Utils.formatRelativeTime(note.created_at)}</span>
                </div>
                <div class="note-content">${note.description || note.content}</div>
            </div>
        `).join('');

        lucide.createIcons();
    }
};

// Export
window.CustomerDetail = CustomerDetail;
