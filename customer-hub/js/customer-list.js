/**
 * Customer List - Handles the customer list page functionality
 */

const CustomerList = {
    // State
    customers: [],
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    currentFilter: 'all',
    searchQuery: '',
    isLoading: false,

    /**
     * Initialize the customer list
     */
    async init() {
        this.bindEvents();
        await this.loadStats();
        await this.loadCustomers();
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce(() => {
                this.searchQuery = searchInput.value.trim();
                this.currentPage = 1;
                this.loadCustomers();
            }, 300));

            searchInput.addEventListener('keyup', (e) => {
                const clearBtn = document.getElementById('clearSearchBtn');
                if (clearBtn) {
                    clearBtn.style.display = searchInput.value ? 'flex' : 'none';
                }
            });
        }

        // Clear search button
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearSearchBtn.style.display = 'none';
                this.searchQuery = '';
                this.currentPage = 1;
                this.loadCustomers();
            });
        }

        // Filter buttons
        document.querySelectorAll('.btn-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.currentPage = 1;
                this.loadCustomers();
            });
        });

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadStats();
                this.loadCustomers();
            });
        }

        // Pagination
        const prevPageBtn = document.getElementById('prevPageBtn');
        const nextPageBtn = document.getElementById('nextPageBtn');

        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.loadCustomers();
                }
            });
        }

        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => {
                if (this.currentPage < this.totalPages) {
                    this.currentPage++;
                    this.loadCustomers();
                }
            });
        }

        // Add customer button
        const addCustomerBtn = document.getElementById('addCustomerBtn');
        if (addCustomerBtn) {
            addCustomerBtn.addEventListener('click', () => this.showCustomerModal());
        }

        // Customer form
        const customerForm = document.getElementById('customerForm');
        if (customerForm) {
            customerForm.addEventListener('submit', (e) => this.handleCustomerSubmit(e));
        }

        // Modal close buttons
        const closeCustomerModalBtn = document.getElementById('closeCustomerModalBtn');
        const cancelCustomerBtn = document.getElementById('cancelCustomerBtn');

        if (closeCustomerModalBtn) {
            closeCustomerModalBtn.addEventListener('click', () => this.hideCustomerModal());
        }
        if (cancelCustomerBtn) {
            cancelCustomerBtn.addEventListener('click', () => this.hideCustomerModal());
        }

        // Close modal on backdrop click
        const customerModal = document.getElementById('customerModal');
        if (customerModal) {
            customerModal.addEventListener('click', (e) => {
                if (e.target === customerModal) {
                    this.hideCustomerModal();
                }
            });
        }
    },

    /**
     * Load statistics
     */
    async loadStats() {
        try {
            // For now, calculate from loaded customers
            // In production, use CustomerService.getCustomerStats()
            const stats = {
                total: 0,
                vip: 0,
                warning: 0,
                danger: 0,
                totalWallet: 0
            };

            document.getElementById('statTotalCustomers').textContent = stats.total;
            document.getElementById('statVIPCount').textContent = stats.vip;
            document.getElementById('statWarningCount').textContent = stats.warning;
            document.getElementById('statDangerCount').textContent = stats.danger;
            document.getElementById('statTotalWallet').textContent = Utils.formatCurrency(stats.totalWallet);
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    },

    /**
     * Load customers from API
     */
    async loadCustomers() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading(true);

        try {
            const options = {
                limit: CONFIG.PAGE_SIZE,
                offset: (this.currentPage - 1) * CONFIG.PAGE_SIZE,
                status: this.currentFilter === 'all' ? '' : this.currentFilter
            };

            const result = await CustomerService.searchCustomers(this.searchQuery, options);

            this.customers = result.customers || result.data || [];
            this.totalCount = result.total || this.customers.length;
            this.totalPages = Math.ceil(this.totalCount / CONFIG.PAGE_SIZE) || 1;

            this.renderCustomers();
            this.updatePagination();
            this.updateStats();

        } catch (error) {
            console.error('Error loading customers:', error);
            Utils.showToast('Lỗi tải danh sách khách hàng: ' + error.message, 'error');
            this.showEmptyState();
        } finally {
            this.isLoading = false;
            this.showLoading(false);
        }
    },

    /**
     * Render customers table
     */
    renderCustomers() {
        const tbody = document.getElementById('customerTableBody');
        const emptyState = document.getElementById('emptyState');

        if (!this.customers.length) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'flex';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        tbody.innerHTML = this.customers.map(customer => this.renderCustomerRow(customer)).join('');

        // Re-render icons
        lucide.createIcons();
    },

    /**
     * Render single customer row
     */
    renderCustomerRow(customer) {
        const statusConfig = CONFIG.STATUSES[customer.status] || CONFIG.STATUSES['Bình thường'];
        const tierConfig = CONFIG.TIERS[customer.tier] || CONFIG.TIERS['bronze'];

        const walletBalance = customer.wallet_balance || 0;
        const debt = customer.debt || 0;
        const totalOrders = customer.total_orders || 0;
        const totalSpent = customer.total_spent || 0;

        return `
            <tr onclick="CustomerList.viewCustomer('${customer.phone}')" style="cursor: pointer;">
                <td>
                    <a href="customer-detail.html?phone=${encodeURIComponent(customer.phone)}"
                       class="phone-link" onclick="event.stopPropagation();">
                        ${Utils.formatPhone(customer.phone)}
                    </a>
                </td>
                <td>
                    <div class="customer-name-cell">
                        <strong>${customer.name || '-'}</strong>
                    </div>
                </td>
                <td>${customer.email || '-'}</td>
                <td>
                    <span class="status-badge" style="background: ${statusConfig.color}20; color: ${statusConfig.color};">
                        <i data-lucide="${statusConfig.icon}" style="width: 14px; height: 14px;"></i>
                        ${statusConfig.label}
                    </span>
                </td>
                <td>
                    <span class="tier-badge" style="color: ${tierConfig.color};">
                        <i data-lucide="award" style="width: 14px; height: 14px;"></i>
                        ${tierConfig.label}
                    </span>
                </td>
                <td class="${walletBalance > 0 ? 'text-success' : ''}">${Utils.formatCurrency(walletBalance)}</td>
                <td class="${debt > 0 ? 'text-danger' : ''}">${Utils.formatCurrency(debt)}</td>
                <td>${totalOrders}</td>
                <td>${Utils.formatCurrency(totalSpent)}</td>
                <td>
                    <div class="action-buttons">
                        <a href="customer-detail.html?phone=${encodeURIComponent(customer.phone)}"
                           class="btn btn-primary btn-sm" title="Xem chi tiết" onclick="event.stopPropagation();">
                            <i data-lucide="eye"></i>
                        </a>
                        <button class="btn btn-secondary btn-sm" title="Chỉnh sửa"
                                onclick="event.stopPropagation(); CustomerList.editCustomer('${customer.phone}');">
                            <i data-lucide="edit"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    },

    /**
     * Update pagination UI
     */
    updatePagination() {
        const pageInfo = document.getElementById('pageInfo');
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');

        if (pageInfo) {
            pageInfo.textContent = `Trang ${this.currentPage} / ${this.totalPages} (${this.totalCount} khách hàng)`;
        }

        if (prevBtn) {
            prevBtn.disabled = this.currentPage <= 1;
        }

        if (nextBtn) {
            nextBtn.disabled = this.currentPage >= this.totalPages;
        }
    },

    /**
     * Update stats from loaded customers
     */
    updateStats() {
        // Calculate stats from current data
        let stats = {
            total: this.totalCount,
            vip: 0,
            warning: 0,
            danger: 0,
            totalWallet: 0
        };

        this.customers.forEach(c => {
            if (c.status === 'VIP') stats.vip++;
            if (c.status === 'Cảnh báo') stats.warning++;
            if (c.status === 'Bom hàng' || c.status === 'Nguy hiểm') stats.danger++;
            stats.totalWallet += (c.wallet_balance || 0);
        });

        document.getElementById('statTotalCustomers').textContent = stats.total;
        document.getElementById('statVIPCount').textContent = stats.vip;
        document.getElementById('statWarningCount').textContent = stats.warning;
        document.getElementById('statDangerCount').textContent = stats.danger;
        document.getElementById('statTotalWallet').textContent = Utils.formatCurrency(stats.totalWallet);
    },

    /**
     * Show/hide loading indicator
     */
    showLoading(show) {
        const loader = document.getElementById('loadingIndicator');
        if (loader) {
            loader.style.display = show ? 'flex' : 'none';
        }
    },

    /**
     * Show empty state
     */
    showEmptyState() {
        const tbody = document.getElementById('customerTableBody');
        const emptyState = document.getElementById('emptyState');

        if (tbody) tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'flex';
    },

    /**
     * View customer detail
     */
    viewCustomer(phone) {
        window.location.href = `customer-detail.html?phone=${encodeURIComponent(phone)}`;
    },

    /**
     * Show add/edit customer modal
     */
    showCustomerModal(customer = null) {
        const modal = document.getElementById('customerModal');
        const title = document.getElementById('customerModalTitle');
        const form = document.getElementById('customerForm');

        if (customer) {
            title.textContent = 'Chỉnh sửa khách hàng';
            document.getElementById('customerPhone').value = customer.phone;
            document.getElementById('customerPhone').disabled = true;
            document.getElementById('customerName').value = customer.name || '';
            document.getElementById('customerEmail').value = customer.email || '';
            document.getElementById('customerStatus').value = customer.status || 'Bình thường';
            document.getElementById('customerAddress').value = customer.address || '';
            document.getElementById('customerTags').value = (customer.tags || []).join(', ');
            form.dataset.editing = customer.phone;
        } else {
            title.textContent = 'Thêm khách hàng mới';
            form.reset();
            document.getElementById('customerPhone').disabled = false;
            delete form.dataset.editing;
        }

        modal.classList.add('show');
        lucide.createIcons();
    },

    /**
     * Hide customer modal
     */
    hideCustomerModal() {
        const modal = document.getElementById('customerModal');
        modal.classList.remove('show');
    },

    /**
     * Edit customer
     */
    async editCustomer(phone) {
        try {
            const customer = this.customers.find(c => c.phone === phone);
            if (customer) {
                this.showCustomerModal(customer);
            } else {
                // Fetch from API
                const result = await CustomerService.getCustomer(phone);
                this.showCustomerModal(result.customer || result);
            }
        } catch (error) {
            Utils.showToast('Lỗi tải thông tin khách hàng: ' + error.message, 'error');
        }
    },

    /**
     * Handle customer form submit
     */
    async handleCustomerSubmit(e) {
        e.preventDefault();

        const form = e.target;
        const isEditing = form.dataset.editing;

        const data = {
            phone: document.getElementById('customerPhone').value.trim(),
            name: document.getElementById('customerName').value.trim(),
            email: document.getElementById('customerEmail').value.trim() || null,
            status: document.getElementById('customerStatus').value,
            address: document.getElementById('customerAddress').value.trim() || null,
            tags: document.getElementById('customerTags').value
                .split(',')
                .map(t => t.trim())
                .filter(t => t)
        };

        try {
            if (isEditing) {
                await CustomerService.updateCustomer(isEditing, data);
                Utils.showToast('Đã cập nhật khách hàng thành công!', 'success');
            } else {
                await CustomerService.createCustomer(data);
                Utils.showToast('Đã thêm khách hàng mới thành công!', 'success');
            }

            this.hideCustomerModal();
            this.loadCustomers();

        } catch (error) {
            Utils.showToast('Lỗi: ' + error.message, 'error');
        }
    }
};

// Export
window.CustomerList = CustomerList;
