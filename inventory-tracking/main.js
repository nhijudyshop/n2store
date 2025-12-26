// =====================================================
// MAIN.JS - INVENTORY TRACKING INITIALIZATION
// =====================================================

/**
 * Main Application Class
 */
class InventoryTrackingApp {
    constructor() {
        this.isInitialized = false;
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('[APP] Initializing Inventory Tracking...');

        try {
            // 1. Check authentication
            if (!this.checkAuth()) {
                return;
            }

            // 2. Load user permissions
            await this.loadPermissions();

            // 3. Setup UI
            this.setupUI();

            // 4. Setup event listeners
            this.setupEventListeners();

            // 5. Load initial data
            await this.loadData();

            // 6. Initialize Lucide icons
            if (window.lucide) {
                lucide.createIcons();
            }

            this.isInitialized = true;
            console.log('[APP] Initialization complete');

        } catch (error) {
            console.error('[APP] Initialization error:', error);
            toast.error('Khong the khoi tao ung dung');
        }
    }

    /**
     * Check authentication
     */
    checkAuth() {
        if (!authManager?.isAuthenticated()) {
            console.warn('[APP] User not authenticated');
            return false;
        }

        // Update user info in sidebar
        const userName = authManager.getUserName();
        const userNameEl = document.getElementById('userName');
        const userRoleEl = document.getElementById('userRole');

        if (userNameEl) userNameEl.textContent = userName;
        if (userRoleEl) {
            userRoleEl.textContent = authManager.isAdmin() ? 'Quan tri vien' : 'Nhan vien';
        }

        return true;
    }

    /**
     * Load user permissions
     */
    async loadPermissions() {
        if (permissionHelper) {
            await permissionHelper.loadPermissions();
            permissionHelper.applyToUI();
        }
    }

    /**
     * Setup UI components
     */
    setupUI() {
        // Setup filter toggle
        this.setupFilterToggle();

        // Setup tabs
        this.setupTabs();

        // Set default date filters (last 30 days)
        this.setDefaultDateFilters();
    }

    /**
     * Setup filter section toggle
     */
    setupFilterToggle() {
        const filterHeader = document.getElementById('filterHeader');
        const filterBody = document.getElementById('filterBody');
        const filterToggleIcon = document.getElementById('filterToggleIcon');

        if (filterHeader && filterBody) {
            filterHeader.addEventListener('click', () => {
                filterHeader.classList.toggle('collapsed');
                filterBody.classList.toggle('collapsed');
            });
        }
    }

    /**
     * Setup tab navigation
     */
    setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;

                // Check permission for finance tab
                if (tabId === 'finance' && !permissionHelper?.can('tab_congNo')) {
                    toast.warning('Ban khong co quyen truy cap tab nay');
                    return;
                }

                // Update active tab button
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update active tab content
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });

                const targetContent = document.getElementById(
                    tabId === 'tracking' ? 'tabContentTracking' : 'tabContentFinance'
                );
                if (targetContent) {
                    targetContent.classList.add('active');
                }

                // Update global state
                globalState.currentTab = tabId;

                // Load tab-specific data if needed
                if (tabId === 'finance' && typeof loadFinanceData === 'function') {
                    loadFinanceData();
                }
            });
        });
    }

    /**
     * Set default date filters
     */
    setDefaultDateFilters() {
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dateFromInput = document.getElementById('filterDateFrom');
        const dateToInput = document.getElementById('filterDateTo');

        if (dateFromInput) {
            dateFromInput.value = this.formatDate(thirtyDaysAgo);
        }
        if (dateToInput) {
            dateToInput.value = this.formatDate(today);
        }

        // Update global state
        globalState.filters.dateFrom = this.formatDate(thirtyDaysAgo);
        globalState.filters.dateTo = this.formatDate(today);
    }

    /**
     * Format date to YYYY-MM-DD
     */
    formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Logout button
        const btnLogout = document.getElementById('btnLogout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => authManager?.logout());
        }

        // Refresh button
        const refreshButton = document.getElementById('refreshButton');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => this.refreshData());
        }

        // Export button
        const exportButton = document.getElementById('exportButton');
        if (exportButton) {
            exportButton.addEventListener('click', () => {
                if (typeof exportToExcel === 'function') {
                    exportToExcel();
                }
            });
        }

        // Add shipment button
        const btnAddShipment = document.getElementById('btnAddShipment');
        if (btnAddShipment) {
            btnAddShipment.addEventListener('click', () => {
                if (typeof openShipmentModal === 'function') {
                    openShipmentModal();
                }
            });
        }

        // Add prepayment button
        const btnAddPrepayment = document.getElementById('btnAddPrepayment');
        if (btnAddPrepayment) {
            btnAddPrepayment.addEventListener('click', () => {
                if (typeof openPrepaymentModal === 'function') {
                    openPrepaymentModal();
                }
            });
        }

        // Add expense button
        const btnAddExpense = document.getElementById('btnAddExpense');
        if (btnAddExpense) {
            btnAddExpense.addEventListener('click', () => {
                if (typeof openExpenseModal === 'function') {
                    openExpenseModal();
                }
            });
        }

        // Filter inputs
        this.setupFilterListeners();

        // Modal close buttons
        this.setupModalCloseListeners();

        // Permissions button
        const btnPermissions = document.getElementById('btnPermissions');
        if (btnPermissions) {
            btnPermissions.addEventListener('click', () => this.showPermissions());
        }
    }

    /**
     * Setup filter input listeners
     */
    setupFilterListeners() {
        const filterDateFrom = document.getElementById('filterDateFrom');
        const filterDateTo = document.getElementById('filterDateTo');
        const filterNCC = document.getElementById('filterNCC');
        const filterProduct = document.getElementById('filterProduct');
        const btnClearFilters = document.getElementById('btnClearFilters');

        let debounceTimer;

        const applyFilters = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                globalState.filters.dateFrom = filterDateFrom?.value || '';
                globalState.filters.dateTo = filterDateTo?.value || '';
                globalState.filters.ncc = filterNCC?.value || 'all';
                globalState.filters.product = filterProduct?.value || '';

                if (typeof applyFiltersAndRender === 'function') {
                    applyFiltersAndRender();
                }
            }, APP_CONFIG.FILTER_DEBOUNCE_DELAY);
        };

        if (filterDateFrom) filterDateFrom.addEventListener('change', applyFilters);
        if (filterDateTo) filterDateTo.addEventListener('change', applyFilters);
        if (filterNCC) filterNCC.addEventListener('change', applyFilters);
        if (filterProduct) filterProduct.addEventListener('input', applyFilters);

        if (btnClearFilters) {
            btnClearFilters.addEventListener('click', () => {
                this.setDefaultDateFilters();
                if (filterNCC) filterNCC.value = 'all';
                if (filterProduct) filterProduct.value = '';
                globalState.filters.ncc = 'all';
                globalState.filters.product = '';
                applyFilters();
            });
        }
    }

    /**
     * Setup modal close listeners
     */
    setupModalCloseListeners() {
        // Close modals when clicking overlay or close button
        document.querySelectorAll('.modal').forEach(modal => {
            const overlay = modal.querySelector('.modal-overlay');
            const closeBtn = modal.querySelector('.modal-close');

            if (overlay) {
                overlay.addEventListener('click', () => this.closeModal(modal.id));
            }
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeModal(modal.id));
            }
        });

        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const activeModal = document.querySelector('.modal.active');
                if (activeModal) {
                    this.closeModal(activeModal.id);
                }
            }
        });

        // Cancel buttons
        const cancelButtons = [
            'btnCancelShipment',
            'btnCancelPrepayment',
            'btnCancelExpense',
            'btnCancelShortage',
            'btnCloseInvoiceDetail',
            'btnCloseShippingDetail'
        ];

        cancelButtons.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.addEventListener('click', () => {
                    const modal = btn.closest('.modal');
                    if (modal) this.closeModal(modal.id);
                });
            }
        });
    }

    /**
     * Open modal
     */
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    /**
     * Close modal
     */
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    /**
     * Load initial data
     */
    async loadData() {
        const loadingState = document.getElementById('loadingState');
        const emptyState = document.getElementById('emptyState');

        try {
            if (loadingState) loadingState.classList.remove('hidden');
            if (emptyState) emptyState.classList.add('hidden');

            // Load shipments data
            if (typeof loadShipmentsData === 'function') {
                await loadShipmentsData();
            }

            // Load finance data if on finance tab
            if (globalState.currentTab === 'finance' && typeof loadFinanceData === 'function') {
                await loadFinanceData();
            }

        } catch (error) {
            console.error('[APP] Error loading data:', error);
            toast.error('Khong the tai du lieu');
        } finally {
            if (loadingState) loadingState.classList.add('hidden');
        }
    }

    /**
     * Refresh data
     */
    async refreshData() {
        const refreshButton = document.getElementById('refreshButton');
        if (refreshButton) {
            refreshButton.disabled = true;
            refreshButton.querySelector('i')?.classList.add('spin');
        }

        try {
            await this.loadData();
            toast.success('Da cap nhat du lieu');
        } catch (error) {
            toast.error('Khong the cap nhat du lieu');
        } finally {
            if (refreshButton) {
                refreshButton.disabled = false;
                refreshButton.querySelector('i')?.classList.remove('spin');
            }
        }
    }

    /**
     * Show user permissions
     */
    showPermissions() {
        const permissions = permissionHelper?.getAll();
        if (!permissions) {
            toast.info('Khong co thong tin quyen');
            return;
        }

        const permissionList = Object.entries(permissions)
            .filter(([key, value]) => value === true)
            .map(([key]) => `- ${key}`)
            .join('\n');

        alert('Quyen cua ban:\n\n' + (permissionList || 'Khong co quyen dac biet'));
    }
}

// =====================================================
// GLOBAL HELPER FUNCTIONS
// =====================================================

/**
 * Open modal helper - direct DOM manipulation for reliability
 */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    } else {
        console.error('[MODAL] Modal not found:', modalId);
    }
}

/**
 * Close modal helper - direct DOM manipulation for reliability
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * Format number with thousands separator
 */
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return num.toLocaleString('vi-VN');
}

/**
 * Format date for display (DD/MM/YYYY)
 */
function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN');
}

/**
 * Generate unique ID
 */
function generateId(prefix = '') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

// =====================================================
// INITIALIZE APPLICATION
// =====================================================

// Note: 'app' variable is already declared in config.js

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[APP] DOM Content Loaded');

    // Initialize app
    app = new InventoryTrackingApp();
    window.app = app;

    await app.init();
});

console.log('[MAIN] Main.js loaded');
