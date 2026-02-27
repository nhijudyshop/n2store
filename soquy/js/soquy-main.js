// =====================================================
// SỔ QUỸ - MAIN ENTRY POINT
// File: soquy-main.js
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    const config = window.SoquyConfig;
    const state = window.SoquyState;
    const ui = window.SoquyUI;
    const db = window.SoquyDatabase;
    const els = window.SoquyElements;

    // =====================================================
    // INITIALIZE DOM REFERENCES
    // =====================================================

    function initElements() {
        // Fund type radios
        els.fundTypeRadios = document.querySelectorAll('input[name="quytien"]');

        // Time filter
        els.timeFilterSelect = document.getElementById('timeFilterSelect');
        els.timeFilterCustom = document.getElementById('timeFilterCustom');
        els.customStartDate = document.getElementById('customStartDate');
        els.customEndDate = document.getElementById('customEndDate');

        // Voucher type checkboxes
        els.receiptCheckbox = document.getElementById('filterReceipt');
        els.paymentCheckbox = document.getElementById('filterPayment');

        // Category filter
        els.categoryFilter = document.getElementById('filterCategory');

        // Status checkboxes
        els.statusPaidCheckbox = document.getElementById('filterStatusPaid');
        els.statusCancelledCheckbox = document.getElementById('filterStatusCancelled');

        // Business accounting toggles
        els.businessAccountingBtns = document.querySelectorAll('.btn-toggle');

        // Creator/Employee
        els.creatorFilter = document.getElementById('filterCreator');
        els.employeeFilter = document.getElementById('filterEmployee');

        // Search
        els.searchInput = document.getElementById('searchInput');

        // Summary stats
        els.statOpeningBalance = document.getElementById('statOpeningBalance');
        els.statTotalReceipts = document.getElementById('statTotalReceipts');
        els.statTotalPayments = document.getElementById('statTotalPayments');
        els.statClosingBalance = document.getElementById('statClosingBalance');

        // Table
        els.tableBody = document.getElementById('voucherTableBody');
        els.selectAllCheckbox = document.getElementById('selectAllCheckbox');

        // Pagination
        els.pageSizeSelect = document.getElementById('pageSizeSelect');
        els.btnFirstPage = document.getElementById('btnFirstPage');
        els.btnPrevPage = document.getElementById('btnPrevPage');
        els.btnNextPage = document.getElementById('btnNextPage');
        els.btnLastPage = document.getElementById('btnLastPage');
        els.currentPageSpan = document.getElementById('currentPage');
        els.pageInfoSpan = document.getElementById('pageInfo');

        // Action buttons
        els.btnCreateReceipt = document.getElementById('btnShowCreateReceipt');
        els.btnCreatePayment = document.getElementById('btnShowCreatePayment');
        els.btnExportFile = document.getElementById('btnExportFile');

        // Receipt modal
        els.receiptModal = document.getElementById('soquyCreateReceiptModal');
        els.receiptVoucherCode = document.getElementById('receiptVoucherCode');
        els.receiptDateTime = document.getElementById('receiptDateTime');
        els.receiptCategory = document.getElementById('receiptCategory');
        els.receiptCollector = document.getElementById('receiptCollector');
        els.receiptObjectType = document.getElementById('receiptObjectType');
        els.receiptPayerName = document.getElementById('receiptPayerName');
        els.receiptAmount = document.getElementById('receiptAmount');
        els.receiptNote = document.getElementById('receiptNote');
        els.receiptBusinessAccounting = document.getElementById('receiptBusinessAccounting');
        els.btnSaveReceipt = document.getElementById('btnSaveReceipt');
        els.btnSavePrintReceipt = document.getElementById('btnSavePrintReceipt');
        els.btnCancelReceipt = document.getElementById('btnSoquyCancelReceipt');
        els.btnCloseReceipt = document.getElementById('btnSoquyCloseReceipt');
        els.receiptOverlay = document.getElementById('soquyCreateReceiptOverlay');

        // Payment modal
        els.paymentModal = document.getElementById('soquyCreatePaymentModal');
        els.paymentVoucherCode = document.getElementById('paymentVoucherCode');
        els.paymentDateTime = document.getElementById('paymentDateTime');
        els.paymentCategory = document.getElementById('paymentCategory');
        els.paymentCollector = document.getElementById('paymentCollector');
        els.paymentObjectType = document.getElementById('paymentObjectType');
        els.paymentReceiverName = document.getElementById('paymentReceiverName');
        els.paymentAmount = document.getElementById('paymentAmount');
        els.paymentNote = document.getElementById('paymentNote');
        els.paymentBusinessAccounting = document.getElementById('paymentBusinessAccounting');
        els.btnSavePayment = document.getElementById('btnSavePayment');
        els.btnSavePrintPayment = document.getElementById('btnSavePrintPayment');
        els.btnCancelPayment = document.getElementById('btnSoquyCancelPayment');
        els.btnClosePayment = document.getElementById('btnSoquyClosePayment');
        els.paymentOverlay = document.getElementById('soquyCreatePaymentOverlay');

        // Detail modal
        els.detailModal = document.getElementById('soquyDetailModal');
        els.detailOverlay = document.getElementById('soquyDetailOverlay');
        els.btnCloseDetail = document.getElementById('btnSoquyCloseDetail');

        // Cancel modal
        els.cancelModal = document.getElementById('soquyCancelModal');
        els.cancelOverlay = document.getElementById('soquyCancelOverlay');
        els.cancelReason = document.getElementById('cancelReason');
        els.btnConfirmCancel = document.getElementById('btnConfirmCancel');
        els.btnDismissCancel = document.getElementById('btnDismissCancel');
        els.btnCloseCancel = document.getElementById('btnSoquyCloseCancel');

        // Sidebar title
        els.sidebarTitle = document.getElementById('cashbookSidebarTitle');

        // Column toggle
        els.btnColumnToggle = document.getElementById('btnColumnToggle');

        // Import modal
        els.btnImportFile = document.getElementById('btnImportFile');
        els.importModal = document.getElementById('soquyImportModal');
        els.importOverlay = document.getElementById('soquyImportOverlay');
        els.importFileInput = document.getElementById('importFileInput');
        els.btnConfirmImport = document.getElementById('btnConfirmImport');
        els.btnCloseImport = document.getElementById('btnSoquyCloseImport');
        els.btnCancelImport = document.getElementById('btnCancelImport');
        els.btnDeleteAllVouchers = document.getElementById('btnDeleteAllVouchers');

        // Category management modal
        els.btnManageReceiptCategory = document.getElementById('btnManageReceiptCategory');
        els.btnManagePaymentCategory = document.getElementById('btnManagePaymentCategory');
        els.categoryModal = document.getElementById('soquyCategoryModal');
        els.categoryOverlay = document.getElementById('soquyCategoryOverlay');
        els.btnCloseCategory = document.getElementById('btnSoquyCloseCategory');
        els.btnSaveNewCategory = document.getElementById('btnSaveNewCategory');
        els.btnDeleteSelectedCategories = document.getElementById('btnDeleteSelectedCategories');
        els.selectAllCategories = document.getElementById('selectAllCategories');
    }

    // =====================================================
    // BIND EVENT LISTENERS
    // =====================================================

    function bindEvents() {
        // Fund type radios
        els.fundTypeRadios.forEach((radio, index) => {
            const fundTypes = [
                config.FUND_TYPES.CASH,
                config.FUND_TYPES.BANK,
                config.FUND_TYPES.EWALLET,
                config.FUND_TYPES.ALL
            ];
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    ui.handleFundTypeChange(fundTypes[index]);
                }
            });
        });

        // Time filter select
        if (els.timeFilterSelect) {
            els.timeFilterSelect.addEventListener('change', (e) => {
                ui.handleTimeFilterChange(e.target.value);
            });
        }

        // Custom date range
        if (els.timeFilterCustom) {
            els.timeFilterCustom.addEventListener('change', () => {
                if (els.timeFilterCustom.checked) {
                    state.timeFilter = config.TIME_FILTERS.CUSTOM;
                }
            });
        }
        if (els.customStartDate) {
            els.customStartDate.addEventListener('change', (e) => {
                state.customStartDate = e.target.value;
                if (state.timeFilter === config.TIME_FILTERS.CUSTOM) {
                    ui.refreshData();
                }
            });
        }
        if (els.customEndDate) {
            els.customEndDate.addEventListener('change', (e) => {
                state.customEndDate = e.target.value;
                if (state.timeFilter === config.TIME_FILTERS.CUSTOM) {
                    ui.refreshData();
                }
            });
        }

        // Voucher type checkboxes
        if (els.receiptCheckbox) {
            els.receiptCheckbox.addEventListener('change', () => ui.handleVoucherTypeFilterChange());
        }
        if (els.paymentCheckbox) {
            els.paymentCheckbox.addEventListener('change', () => ui.handleVoucherTypeFilterChange());
        }

        // Category filter
        if (els.categoryFilter) {
            let categoryDebounce;
            els.categoryFilter.addEventListener('input', (e) => {
                clearTimeout(categoryDebounce);
                categoryDebounce = setTimeout(() => {
                    ui.handleCategoryFilterChange(e.target.value);
                }, 300);
            });
        }

        // Status checkboxes
        if (els.statusPaidCheckbox) {
            els.statusPaidCheckbox.addEventListener('change', () => ui.handleStatusFilterChange());
        }
        if (els.statusCancelledCheckbox) {
            els.statusCancelledCheckbox.addEventListener('change', () => ui.handleStatusFilterChange());
        }

        // Business accounting toggles
        els.businessAccountingBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                els.businessAccountingBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const value = btn.dataset.value || config.BUSINESS_ACCOUNTING.ALL;
                ui.handleBusinessAccountingChange(value);
            });
        });

        // Creator filter
        if (els.creatorFilter) {
            let creatorDebounce;
            els.creatorFilter.addEventListener('input', (e) => {
                clearTimeout(creatorDebounce);
                creatorDebounce = setTimeout(() => {
                    ui.handleCreatorFilterChange(e.target.value);
                }, 300);
            });
        }

        // Employee filter
        if (els.employeeFilter) {
            let employeeDebounce;
            els.employeeFilter.addEventListener('input', (e) => {
                clearTimeout(employeeDebounce);
                employeeDebounce = setTimeout(() => {
                    ui.handleEmployeeFilterChange(e.target.value);
                }, 300);
            });
        }

        // Search input
        if (els.searchInput) {
            let searchDebounce;
            els.searchInput.addEventListener('input', (e) => {
                clearTimeout(searchDebounce);
                searchDebounce = setTimeout(() => {
                    ui.handleSearchChange(e.target.value);
                }, 300);
            });
        }

        // Action buttons
        if (els.btnCreateReceipt) {
            els.btnCreateReceipt.addEventListener('click', () => {
                state.editingVoucherId = null;
                ui.openReceiptModal();
            });
        }
        if (els.btnCreatePayment) {
            els.btnCreatePayment.addEventListener('click', () => {
                state.editingVoucherId = null;
                ui.openPaymentModal();
            });
        }
        if (els.btnExportFile) {
            els.btnExportFile.addEventListener('click', () => ui.handleExport());
        }

        // Receipt modal events
        if (els.btnCloseReceipt) {
            els.btnCloseReceipt.addEventListener('click', ui.closeReceiptModal);
        }
        if (els.btnCancelReceipt) {
            els.btnCancelReceipt.addEventListener('click', ui.closeReceiptModal);
        }
        if (els.receiptOverlay) {
            els.receiptOverlay.addEventListener('click', ui.closeReceiptModal);
        }
        if (els.btnSaveReceipt) {
            els.btnSaveReceipt.addEventListener('click', () => {
                if (state.editingVoucherId) {
                    ui.saveEditedVoucher(config.VOUCHER_TYPES.RECEIPT);
                } else {
                    ui.saveReceipt();
                }
            });
        }
        if (els.btnSavePrintReceipt) {
            els.btnSavePrintReceipt.addEventListener('click', async () => {
                if (state.editingVoucherId) {
                    await ui.saveEditedVoucher(config.VOUCHER_TYPES.RECEIPT);
                } else {
                    await ui.saveReceipt();
                }
                // TODO: Print functionality
            });
        }

        // Payment modal events
        if (els.btnClosePayment) {
            els.btnClosePayment.addEventListener('click', ui.closePaymentModal);
        }
        if (els.btnCancelPayment) {
            els.btnCancelPayment.addEventListener('click', ui.closePaymentModal);
        }
        if (els.paymentOverlay) {
            els.paymentOverlay.addEventListener('click', ui.closePaymentModal);
        }
        if (els.btnSavePayment) {
            els.btnSavePayment.addEventListener('click', () => {
                if (state.editingVoucherId) {
                    ui.saveEditedVoucher(config.VOUCHER_TYPES.PAYMENT);
                } else {
                    ui.savePayment();
                }
            });
        }
        if (els.btnSavePrintPayment) {
            els.btnSavePrintPayment.addEventListener('click', async () => {
                if (state.editingVoucherId) {
                    await ui.saveEditedVoucher(config.VOUCHER_TYPES.PAYMENT);
                } else {
                    await ui.savePayment();
                }
            });
        }

        // Detail modal events
        if (els.btnCloseDetail) {
            els.btnCloseDetail.addEventListener('click', ui.closeDetailModal);
        }
        if (els.detailOverlay) {
            els.detailOverlay.addEventListener('click', ui.closeDetailModal);
        }

        // Cancel modal events
        if (els.btnCloseCancel) {
            els.btnCloseCancel.addEventListener('click', ui.closeCancelModal);
        }
        if (els.cancelOverlay) {
            els.cancelOverlay.addEventListener('click', ui.closeCancelModal);
        }
        if (els.btnDismissCancel) {
            els.btnDismissCancel.addEventListener('click', ui.closeCancelModal);
        }
        if (els.btnConfirmCancel) {
            els.btnConfirmCancel.addEventListener('click', ui.confirmCancelVoucher);
        }

        // Pagination events
        if (els.btnFirstPage) {
            els.btnFirstPage.addEventListener('click', () => ui.goToPage(1));
        }
        if (els.btnPrevPage) {
            els.btnPrevPage.addEventListener('click', () => ui.goToPage(state.currentPage - 1));
        }
        if (els.btnNextPage) {
            els.btnNextPage.addEventListener('click', () => ui.goToPage(state.currentPage + 1));
        }
        if (els.btnLastPage) {
            els.btnLastPage.addEventListener('click', () => ui.goToPage(state.totalPages));
        }
        if (els.pageSizeSelect) {
            els.pageSizeSelect.addEventListener('change', (e) => ui.handlePageSizeChange(e.target.value));
        }

        // Select all checkbox
        if (els.selectAllCheckbox) {
            els.selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('.voucher-checkbox');
                checkboxes.forEach(cb => cb.checked = e.target.checked);
            });
        }

        // Amount input formatting
        [els.receiptAmount, els.paymentAmount].forEach(input => {
            if (input) {
                input.addEventListener('focus', () => {
                    const val = ui.parseAmountInput(input.value);
                    input.value = val > 0 ? val : '';
                });
                input.addEventListener('blur', () => {
                    const val = ui.parseAmountInput(input.value);
                    input.value = db.formatCurrency(val);
                });
                input.addEventListener('input', () => {
                    // Allow only numbers
                    input.value = input.value.replace(/[^0-9]/g, '');
                });
            }
        });

        // Column toggle button
        if (els.btnColumnToggle) {
            els.btnColumnToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                ui.toggleColumnDropdown();
            });
        }

        // Import button & modal events
        if (els.btnImportFile) {
            els.btnImportFile.addEventListener('click', () => ui.openImportModal());
        }
        if (els.btnCloseImport) {
            els.btnCloseImport.addEventListener('click', () => ui.closeImportModal());
        }
        if (els.btnCancelImport) {
            els.btnCancelImport.addEventListener('click', () => ui.closeImportModal());
        }
        if (els.importOverlay) {
            els.importOverlay.addEventListener('click', () => ui.closeImportModal());
        }
        if (els.importFileInput) {
            els.importFileInput.addEventListener('change', (e) => ui.handleImportFileChange(e));
        }
        if (els.btnConfirmImport) {
            els.btnConfirmImport.addEventListener('click', () => ui.confirmImport());
        }
        if (els.btnDeleteAllVouchers) {
            els.btnDeleteAllVouchers.addEventListener('click', () => ui.deleteAllVouchers());
        }

        // Category management modal events
        if (els.btnManageReceiptCategory) {
            els.btnManageReceiptCategory.addEventListener('click', () => ui.openCategoryModal('receipt'));
        }
        if (els.btnManagePaymentCategory) {
            els.btnManagePaymentCategory.addEventListener('click', () => ui.openCategoryModal('payment'));
        }
        if (els.btnCloseCategory) {
            els.btnCloseCategory.addEventListener('click', () => ui.closeCategoryModal());
        }
        if (els.categoryOverlay) {
            els.categoryOverlay.addEventListener('click', () => ui.closeCategoryModal());
        }
        if (els.btnSaveNewCategory) {
            els.btnSaveNewCategory.addEventListener('click', () => ui.saveNewCategory());
        }
        if (els.btnDeleteSelectedCategories) {
            els.btnDeleteSelectedCategories.addEventListener('click', () => ui.deleteSelectedCategories());
        }
        if (els.selectAllCategories) {
            els.selectAllCategories.addEventListener('change', (e) => ui.handleSelectAllCategories(e.target.checked));
        }
        // Category tab toggle buttons
        document.querySelectorAll('.category-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                ui.handleCategoryTabSwitch(btn.dataset.catTab);
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                ui.closeReceiptModal();
                ui.closePaymentModal();
                ui.closeDetailModal();
                ui.closeCancelModal();
                ui.closeImportModal();
                ui.closeCategoryModal();
            }
        });

        // =====================================================
        // TAB NAVIGATION
        // =====================================================
        document.querySelectorAll('.tab-header-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;

                // Update button active states
                document.querySelectorAll('.tab-header-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.tab === tabName);
                });

                // Update content visibility
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.toggle('active', content.id === `${tabName}TabContent`);
                });

                // Re-initialize Lucide icons for new tab content
                if (typeof lucide !== 'undefined') lucide.createIcons();
            });
        });

        // =====================================================
        // FILTER SECTION COLLAPSE/EXPAND
        // =====================================================
        document.querySelectorAll('.filter-section-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't toggle if clicking inside an input/select within the header
                if (e.target.closest('input, select')) return;

                const section = header.closest('.filter-section');
                if (section) {
                    section.classList.toggle('collapsed');
                }
            });
        });
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    async function init() {
        console.log('[SoquyMain] Initializing...');

        // Initialize DOM references
        initElements();

        // Load column visibility from localStorage
        ui.loadColumnVisibility();

        // Load dynamic categories/creators from Firestore
        await db.loadDynamicMeta();

        // Populate dropdowns (including dynamic categories)
        ui.populateCategoryDropdowns();

        // Render dynamic table header based on column visibility
        ui.renderTableHeader();

        // Bind events
        bindEvents();

        // Update sidebar title
        ui.updateSidebarTitle();

        // Load initial data
        await ui.refreshData();

        console.log('[SoquyMain] Initialization complete');
    }

    // Wait for Lucide icons to load, then initialize
    if (typeof lucide !== 'undefined') {
        init();
    } else {
        // Wait for lucide to be available
        const checkLucide = setInterval(() => {
            if (typeof lucide !== 'undefined') {
                clearInterval(checkLucide);
                init();
            }
        }, 100);
        // Fallback: init after 2 seconds regardless
        setTimeout(() => {
            clearInterval(checkLucide);
            if (!state.isLoading) init();
        }, 2000);
    }
});
