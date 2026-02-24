/**
 * PURCHASE ORDERS MODULE - MAIN CONTROLLER
 * File: main.js
 * Purpose: Initialize and coordinate all components
 */

// ========================================
// MAIN CONTROLLER CLASS
// ========================================
class PurchaseOrderController {
    constructor() {
        this.initialized = false;
        this.currentTab = null;

        // Component references
        this.config = null;
        this.service = null;
        this.dataManager = null;
        this.ui = null;
        this.tableRenderer = null;
        this.formModal = null;

        // DOM elements
        this.elements = {};

        // Unsubscribe functions
        this.unsubscribers = [];
    }

    // ========================================
    // INITIALIZATION
    // ========================================

    /**
     * Initialize the module
     */
    async init() {
        if (this.initialized) return;

        console.log('[PurchaseOrderController] Initializing...');

        try {
            // Get component references
            this.config = window.PurchaseOrderConfig;
            this.service = window.purchaseOrderService;
            this.dataManager = window.purchaseOrderDataManager;
            this.ui = window.purchaseOrderUI;
            this.tableRenderer = window.purchaseOrderTableRenderer;
            this.formModal = window.purchaseOrderFormModal;

            // Cache DOM elements
            this.cacheElements();

            // Initialize service
            await this.service.initialize();

            // Initialize table renderer with all handlers (matches React app)
            this.tableRenderer.init(this.elements.tableContainer, {
                onEdit: (orderId) => this.handleEditOrder(orderId),
                onExport: (orderId) => this.handleExportOrder(orderId),
                onCopy: (orderId) => this.handleCopyOrder(orderId),
                onDelete: (orderId) => this.handleDeleteOrder(orderId),
                onSelect: (orderId, selected) => this.handleSelectOrder(orderId, selected),
                onSelectAll: (selected) => this.handleSelectAll(selected),
                onRowClick: (orderId) => this.handleRowClick(orderId),
                onViewInvoice: (images) => this.handleViewInvoice(images),
                onViewImages: (itemId) => this.handleViewImages(itemId),
                onViewDetail: (orderId) => this.handleViewDetail(orderId),
                onBulkExport: () => this.handleBulkExport(),
                onBulkDelete: () => this.handleBulkDelete(),
                onClearSelection: () => this.handleClearSelection()
            });

            // Subscribe to data manager events
            this.subscribeToEvents();

            // Bind UI events
            this.bindEvents();

            // Load initial data
            await this.loadInitialData();

            this.initialized = true;
            console.log('[PurchaseOrderController] Initialized successfully');

        } catch (error) {
            console.error('[PurchaseOrderController] Initialization failed:', error);
            this.ui.showToast('Không thể khởi tạo module. Vui lòng tải lại trang.', 'error');
        }
    }

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            // Header
            createBtn: document.getElementById('btnCreateOrder'),

            // Summary cards
            summaryContainer: document.getElementById('summaryCards'),

            // Tabs
            tabsContainer: document.getElementById('tabsContainer'),

            // Filters
            filterContainer: document.getElementById('filterBar'),

            // Table
            tableContainer: document.getElementById('tableContainer'),

            // Pagination
            paginationContainer: document.getElementById('pagination'),

            // Loading
            loadingOverlay: document.getElementById('loadingOverlay')
        };
    }

    /**
     * Subscribe to data manager events
     */
    subscribeToEvents() {
        // Orders changed
        this.unsubscribers.push(
            this.dataManager.on('ordersChange', (orders) => {
                this.renderTable(orders);
            })
        );

        // Stats changed
        this.unsubscribers.push(
            this.dataManager.on('statsChange', (stats) => {
                this.ui.renderSummaryCards(stats, this.elements.summaryContainer);
            })
        );

        // Status counts changed
        this.unsubscribers.push(
            this.dataManager.on('statusCountsChange', (counts) => {
                this.ui.renderTabs(this.currentTab, counts, this.elements.tabsContainer, (status) => {
                    this.handleTabChange(status);
                });
            })
        );

        // Loading changed
        this.unsubscribers.push(
            this.dataManager.on('loadingChange', (loading) => {
                this.toggleLoading(loading);
            })
        );

        // Error changed
        this.unsubscribers.push(
            this.dataManager.on('errorChange', (error) => {
                if (error) {
                    this.ui.renderErrorState(error, this.elements.tableContainer, () => {
                        this.dataManager.refresh();
                    });
                }
            })
        );

        // Selection changed
        this.unsubscribers.push(
            this.dataManager.on('selectionChange', (selectedIds) => {
                this.updateSelectionUI(selectedIds);
            })
        );

        // Page changed
        this.unsubscribers.push(
            this.dataManager.on('pageChange', (paginationInfo) => {
                this.renderPagination(paginationInfo);
                this.renderTableForCurrentPage();
            })
        );
    }

    /**
     * Bind UI event handlers
     */
    bindEvents() {
        // Create button
        this.elements.createBtn?.addEventListener('click', () => {
            this.handleCreateOrder();
        });

        // Refresh shortcut (F5 or Ctrl+R)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
                e.preventDefault();
                this.dataManager.refresh();
            }
        });
    }

    /**
     * Load initial data
     */
    async loadInitialData() {
        // Show loading
        this.ui.renderSummaryCardsSkeleton(this.elements.summaryContainer);
        this.tableRenderer.renderSkeleton();

        // Set default tab
        this.currentTab = this.config.OrderStatus.DRAFT;

        // Load data in parallel
        await Promise.all([
            this.dataManager.loadStats(),
            this.dataManager.loadStatusCounts(),
            this.dataManager.loadOrders(this.currentTab, true)
        ]);

        // Render filter bar
        this.ui.renderFilterBar(this.dataManager.filters, this.elements.filterContainer, {
            onDateChange: (start, end) => this.dataManager.setDateRange(start, end),
            onQuickFilter: (filter) => this.dataManager.setQuickFilter(filter),
            onSearch: (term) => this.dataManager.setSearchTerm(term),
            onStatusFilter: (status) => this.dataManager.setStatusFilter(status),
            onClear: () => this.dataManager.clearFilters()
        });
    }

    // ========================================
    // RENDER FUNCTIONS
    // ========================================

    /**
     * Render orders table
     * @param {Array} orders
     */
    renderTable(orders) {
        if (this.dataManager.error) return;

        if (!orders || orders.length === 0) {
            this.ui.renderEmptyState(this.elements.tableContainer, () => {
                this.handleCreateOrder();
            });
            // Clear pagination
            if (this.elements.paginationContainer) {
                this.elements.paginationContainer.innerHTML = '';
            }
            return;
        }

        // Render current page of orders
        this.renderTableForCurrentPage();

        // Render pagination
        this.renderPagination({
            currentPage: this.dataManager.currentPage,
            totalItems: orders.length,
            pageSize: this.config.PAGINATION_CONFIG.pageSize
        });
    }

    /**
     * Render table for current page
     */
    renderTableForCurrentPage() {
        const pageOrders = this.dataManager.getCurrentPageOrders();
        this.tableRenderer.render(pageOrders, this.dataManager.selectedIds);
    }

    /**
     * Render pagination controls
     * @param {Object} paginationInfo - Pagination info
     */
    renderPagination(paginationInfo) {
        const info = paginationInfo || {
            currentPage: this.dataManager.currentPage,
            totalItems: this.dataManager.orders.length,
            pageSize: this.config.PAGINATION_CONFIG.pageSize
        };

        this.ui.renderPagination({
            currentPage: info.currentPage,
            totalItems: info.totalItems,
            pageSize: info.pageSize,
            hasMore: this.dataManager.hasMore
        }, this.elements.paginationContainer, {
            onPageChange: (page) => this.handlePageChange(page),
            onLoadMore: () => this.dataManager.loadMore()
        });
    }

    /**
     * Handle page change
     * @param {number} page - Target page number
     */
    handlePageChange(page) {
        this.dataManager.setCurrentPage(page);
    }

    /**
     * Toggle loading state
     * @param {boolean} loading
     */
    toggleLoading(loading) {
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.style.display = loading ? 'flex' : 'none';
        }
    }

    /**
     * Update selection UI
     * @param {Array} selectedIds
     */
    updateSelectionUI(selectedIds) {
        // Update checkboxes
        selectedIds.forEach(id => {
            this.tableRenderer.updateSelection(id, true);
        });

        // Could add bulk action toolbar here
    }

    // ========================================
    // EVENT HANDLERS
    // ========================================

    /**
     * Handle tab change
     * @param {string} status
     */
    handleTabChange(status) {
        if (status === this.currentTab) return;

        this.currentTab = status;
        this.ui.updateActiveTab(status, this.elements.tabsContainer);
        this.dataManager.clearSelection();
        this.dataManager.loadOrders(status, true);
    }

    /**
     * Handle create order
     */
    handleCreateOrder() {
        if (!this.formModal) {
            this.ui.showToast('Form modal chưa sẵn sàng. Vui lòng tải lại trang.', 'error');
            return;
        }

        this.formModal.openCreate({
            onSubmit: async (orderData) => {
                const orderId = await this.dataManager.createOrder(orderData);
                this.ui.showToast('Tạo đơn hàng thành công!', 'success');

                // Fire-and-forget: sync products to TPOS (only for confirmed orders)
                if (orderData.status === 'AWAITING_PURCHASE' && window.TPOSProductCreator) {
                    window.TPOSProductCreator.syncOrderToTPOS(orderId, orderData.items, orderData.supplier);
                }
            },
            onCancel: () => {
                // Nothing to do
            }
        });
    }

    /**
     * Handle edit order
     * @param {string} orderId
     */
    async handleEditOrder(orderId) {
        const order = await this.dataManager.getOrder(orderId);

        if (!order) {
            this.ui.showToast('Không tìm thấy đơn hàng', 'error');
            return;
        }

        const editCheck = window.PurchaseOrderValidation.validateCanEdit(order);
        if (!editCheck.canEdit) {
            this.ui.showToast(editCheck.error, 'warning');
            return;
        }

        this.formModal.openEdit(order, {
            onSubmit: async (orderData) => {
                await this.dataManager.updateOrder(orderId, orderData);
                this.ui.showToast('Cập nhật đơn hàng thành công!', 'success');
            },
            onCancel: () => {
                // Nothing to do
            }
        });
    }

    /**
     * Handle export order to Excel
     * @param {string} orderId
     */
    async handleExportOrder(orderId) {
        const order = await this.dataManager.getOrder(orderId);

        if (!order) {
            this.ui.showToast('Không tìm thấy đơn hàng', 'error');
            return;
        }

        // Show export format dialog
        this.showExportFormatDialog(order);
    }

    /**
     * Show export format selection dialog
     * @param {Object} order - Order to export (or array of orders for bulk)
     */
    showExportFormatDialog(order) {
        const isMultiple = Array.isArray(order);
        const orders = isMultiple ? order : [order];
        const title = isMultiple ? `Xuất ${orders.length} đơn hàng` : `Xuất đơn hàng ${order.orderNumber}`;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 5000;
        `;

        overlay.innerHTML = `
            <div style="
                background: white;
                border-radius: 12px;
                padding: 24px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            ">
                <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">${title}</h3>
                <p style="color: #6b7280; margin-bottom: 20px; font-size: 14px;">Chọn định dạng xuất Excel:</p>

                <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
                    <label style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 16px;
                        border: 2px solid #e5e7eb;
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.2s;
                    " id="optionMH">
                        <input type="radio" name="exportFormat" value="MH" checked style="width: 18px; height: 18px;">
                        <div>
                            <div style="font-weight: 600; margin-bottom: 4px;">📋 Mua Hàng (MH)</div>
                            <div style="font-size: 12px; color: #6b7280;">4 cột: STT, Tên SP, Biến thể, SL</div>
                        </div>
                    </label>

                    <label style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 16px;
                        border: 2px solid #e5e7eb;
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.2s;
                    " id="optionTSP">
                        <input type="radio" name="exportFormat" value="TSP" style="width: 18px; height: 18px;">
                        <div>
                            <div style="font-weight: 600; margin-bottom: 4px;">📦 Thêm SP (TSP)</div>
                            <div style="font-size: 12px; color: #6b7280;">17 cột: Mã SP, Tên, Mô tả, Giá, Tồn kho...</div>
                        </div>
                    </label>

                    <label style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 16px;
                        border: 2px solid #e5e7eb;
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.2s;
                    " id="optionFull">
                        <input type="radio" name="exportFormat" value="FULL" style="width: 18px; height: 18px;">
                        <div>
                            <div style="font-weight: 600; margin-bottom: 4px;">📊 Đầy đủ</div>
                            <div style="font-size: 12px; color: #6b7280;">Tất cả thông tin đơn hàng và sản phẩm</div>
                        </div>
                    </label>
                </div>

                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button type="button" id="btnCancelExport" style="
                        padding: 10px 20px;
                        border: 1px solid #d1d5db;
                        border-radius: 8px;
                        background: white;
                        cursor: pointer;
                        font-size: 14px;
                    ">Hủy</button>
                    <button type="button" id="btnConfirmExport" style="
                        padding: 10px 20px;
                        border: none;
                        border-radius: 8px;
                        background: #3b82f6;
                        color: white;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                    ">Xuất Excel</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Hover effects
        ['optionMH', 'optionTSP', 'optionFull'].forEach(id => {
            const el = overlay.querySelector(`#${id}`);
            el.addEventListener('mouseenter', () => el.style.borderColor = '#3b82f6');
            el.addEventListener('mouseleave', () => {
                const input = el.querySelector('input');
                el.style.borderColor = input.checked ? '#3b82f6' : '#e5e7eb';
            });
            el.querySelector('input').addEventListener('change', () => {
                ['optionMH', 'optionTSP', 'optionFull'].forEach(i => {
                    overlay.querySelector(`#${i}`).style.borderColor = '#e5e7eb';
                });
                el.style.borderColor = '#3b82f6';
            });
        });

        // Cancel button
        overlay.querySelector('#btnCancelExport').addEventListener('click', () => {
            overlay.remove();
        });

        // Overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        // Confirm button
        overlay.querySelector('#btnConfirmExport').addEventListener('click', () => {
            const format = overlay.querySelector('input[name="exportFormat"]:checked').value;
            overlay.remove();

            try {
                if (format === 'MH') {
                    this.exportMuaHang(orders);
                } else if (format === 'TSP') {
                    this.exportThemSP(orders);
                } else {
                    this.exportOrderToExcelFull(orders);
                }
                this.ui.showToast(`Xuất Excel (${format}) thành công!`, 'success');
            } catch (error) {
                console.error('Export failed:', error);
                this.ui.showToast('Không thể xuất Excel: ' + error.message, 'error');
            }
        });
    }

    /**
     * Export "Mua Hàng" format - 4 columns for purchasing
     * Columns: STT, Tên sản phẩm, Biến thể, SL
     * @param {Array} orders - Orders to export
     */
    exportMuaHang(orders) {
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not loaded');
        }

        const data = [];

        // Header row
        data.push(['STT', 'Tên sản phẩm', 'Biến thể', 'SL']);

        let stt = 1;
        orders.forEach(order => {
            // Add supplier header for each order if multiple
            if (orders.length > 1) {
                data.push([`--- ${order.supplier?.name || 'Không rõ NCC'} (${order.orderNumber}) ---`, '', '', '']);
            }

            // Add items
            (order.items || []).forEach((item) => {
                data.push([
                    stt++,
                    item.productName || '',
                    item.variant || '',
                    item.quantity || 0
                ]);
            });
        });

        // Total row
        const totalQty = orders.reduce((sum, order) =>
            sum + (order.items || []).reduce((s, item) => s + (item.quantity || 0), 0), 0);
        data.push(['']);
        data.push(['TỔNG CỘNG', '', '', totalQty]);

        // Create workbook
        const ws = XLSX.utils.aoa_to_sheet(data);

        // Set column widths
        ws['!cols'] = [
            { wch: 5 },   // STT
            { wch: 40 },  // Tên sản phẩm
            { wch: 20 },  // Biến thể
            { wch: 8 }    // SL
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Mua Hàng');

        // Filename
        const filename = orders.length === 1
            ? `MH_${orders[0].orderNumber}.xlsx`
            : `MH_${new Date().toISOString().slice(0, 10)}_${orders.length}don.xlsx`;

        XLSX.writeFile(wb, filename);
    }

    /**
     * Export "Thêm SP" format - 17 columns for adding products to TPOS
     * @param {Array} orders - Orders to export
     */
    exportThemSP(orders) {
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not loaded');
        }

        const data = [];

        // Header row - 17 columns matching TPOS import template
        data.push([
            'Mã sản phẩm',      // 1
            'Tên sản phẩm',     // 2
            'Mô tả',            // 3
            'Danh mục',         // 4
            'Giá bán',          // 5
            'Giá vốn',          // 6
            'Tồn kho',          // 7
            'Đơn vị tính',      // 8
            'Barcode',          // 9
            'Trọng lượng (g)',  // 10
            'Dài (cm)',         // 11
            'Rộng (cm)',        // 12
            'Cao (cm)',         // 13
            'Thương hiệu',      // 14
            'Xuất xứ',          // 15
            'Ghi chú',          // 16
            'Hình ảnh URL'      // 17
        ]);

        orders.forEach(order => {
            (order.items || []).forEach((item) => {
                const productName = item.variant
                    ? `${item.productName} - ${item.variant}`
                    : item.productName;

                data.push([
                    item.productCode || '',           // Mã sản phẩm
                    productName || '',                // Tên sản phẩm
                    '',                               // Mô tả
                    '',                               // Danh mục
                    item.sellingPrice || 0,           // Giá bán
                    item.purchasePrice || 0,          // Giá vốn
                    item.quantity || 0,               // Tồn kho
                    'Cái',                            // Đơn vị tính
                    '',                               // Barcode
                    '',                               // Trọng lượng
                    '',                               // Dài
                    '',                               // Rộng
                    '',                               // Cao
                    order.supplier?.name || '',       // Thương hiệu (using supplier)
                    '',                               // Xuất xứ
                    `Đơn hàng: ${order.orderNumber}`, // Ghi chú
                    (item.productImages || [])[0] || '' // Hình ảnh URL
                ]);
            });
        });

        // Create workbook
        const ws = XLSX.utils.aoa_to_sheet(data);

        // Set column widths
        ws['!cols'] = [
            { wch: 15 },  // Mã SP
            { wch: 40 },  // Tên SP
            { wch: 30 },  // Mô tả
            { wch: 15 },  // Danh mục
            { wch: 12 },  // Giá bán
            { wch: 12 },  // Giá vốn
            { wch: 10 },  // Tồn kho
            { wch: 10 },  // Đơn vị
            { wch: 15 },  // Barcode
            { wch: 12 },  // Trọng lượng
            { wch: 8 },   // Dài
            { wch: 8 },   // Rộng
            { wch: 8 },   // Cao
            { wch: 20 },  // Thương hiệu
            { wch: 15 },  // Xuất xứ
            { wch: 25 },  // Ghi chú
            { wch: 50 }   // Hình ảnh URL
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Thêm SP');

        // Filename
        const filename = orders.length === 1
            ? `TSP_${orders[0].orderNumber}.xlsx`
            : `TSP_${new Date().toISOString().slice(0, 10)}_${orders.length}don.xlsx`;

        XLSX.writeFile(wb, filename);
    }

    /**
     * Export full order details to Excel
     * @param {Array} orders - Orders to export
     */
    exportOrderToExcelFull(orders) {
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not loaded');
        }

        const data = [];

        orders.forEach((order, orderIndex) => {
            if (orderIndex > 0) {
                data.push(['']); // Separator between orders
            }

            // Order header
            data.push(['ĐƠN ĐẶT HÀNG', '', '', '', '', '', '', '']);
            data.push(['Mã đơn:', order.orderNumber, '', 'Ngày đặt:', this.config.formatDate(order.orderDate), '', '', '']);
            data.push(['Nhà cung cấp:', order.supplier?.name || '', '', 'Trạng thái:', this.config.STATUS_LABELS[order.status] || order.status, '', '', '']);
            data.push(['Ghi chú:', order.notes || '', '', '', '', '', '', '']);
            data.push(['']);

            // Items header
            data.push(['STT', 'Tên sản phẩm', 'Mã SP', 'Biến thể', 'SL', 'Giá mua', 'Giá bán', 'Thành tiền']);

            // Add items
            (order.items || []).forEach((item, index) => {
                data.push([
                    index + 1,
                    item.productName || '',
                    item.productCode || '',
                    item.variant || '',
                    item.quantity || 0,
                    item.purchasePrice || 0,
                    item.sellingPrice || 0,
                    item.subtotal || ((item.purchasePrice || 0) * (item.quantity || 0))
                ]);
            });

            // Add totals
            data.push(['']);
            data.push(['', '', '', '', '', '', 'Tổng tiền:', order.totalAmount || 0]);
            data.push(['', '', '', '', '', '', 'Giảm giá:', order.discountAmount || 0]);
            data.push(['', '', '', '', '', '', 'Phí ship:', order.shippingFee || 0]);
            data.push(['', '', '', '', '', '', 'THÀNH TIỀN:', order.finalAmount || 0]);
        });

        // Create workbook
        const ws = XLSX.utils.aoa_to_sheet(data);

        // Set column widths
        ws['!cols'] = [
            { wch: 5 },   // STT
            { wch: 35 },  // Tên SP
            { wch: 12 },  // Mã SP
            { wch: 15 },  // Biến thể
            { wch: 6 },   // SL
            { wch: 12 },  // Giá mua
            { wch: 12 },  // Giá bán
            { wch: 15 }   // Thành tiền
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Đơn hàng');

        // Filename
        const filename = orders.length === 1
            ? `${orders[0].orderNumber}.xlsx`
            : `DonHang_${new Date().toISOString().slice(0, 10)}_${orders.length}don.xlsx`;

        XLSX.writeFile(wb, filename);
    }

    /**
     * Handle copy order
     * @param {string} orderId
     */
    async handleCopyOrder(orderId) {
        const confirmed = await this.ui.showConfirmDialog({
            title: 'Sao chép đơn hàng',
            message: 'Bạn có chắc muốn sao chép đơn hàng này? Đơn mới sẽ được tạo ở trạng thái Nháp.',
            confirmText: 'Sao chép',
            type: 'info'
        });

        if (!confirmed) return;

        try {
            const newOrderId = await this.dataManager.copyOrder(orderId);
            this.ui.showToast('Sao chép đơn hàng thành công!', 'success');

            // Switch to draft tab to see the new order
            this.handleTabChange(this.config.OrderStatus.DRAFT);
        } catch (error) {
            this.ui.showToast(error.userMessage || 'Không thể sao chép đơn hàng', 'error');
        }
    }

    /**
     * Handle delete order
     * @param {string} orderId
     */
    async handleDeleteOrder(orderId) {
        const order = await this.dataManager.getOrder(orderId);

        if (!order) {
            this.ui.showToast('Không tìm thấy đơn hàng', 'error');
            return;
        }

        const deleteCheck = window.PurchaseOrderValidation.validateCanDelete(order);
        if (!deleteCheck.canDelete) {
            this.ui.showToast(deleteCheck.error, 'warning');
            return;
        }

        const confirmed = await this.ui.showConfirmDialog({
            title: 'Xóa đơn hàng',
            message: `Bạn có chắc muốn xóa đơn hàng ${order.orderNumber}? Hành động này không thể hoàn tác.`,
            confirmText: 'Xóa',
            type: 'danger'
        });

        if (!confirmed) return;

        try {
            await this.dataManager.deleteOrder(orderId);
            this.ui.showToast('Xóa đơn hàng thành công!', 'success');
        } catch (error) {
            this.ui.showToast(error.userMessage || 'Không thể xóa đơn hàng', 'error');
        }
    }

    /**
     * Handle select order
     * @param {string} orderId
     * @param {boolean} selected
     */
    handleSelectOrder(orderId, selected) {
        this.dataManager.toggleSelection(orderId);
    }

    /**
     * Handle select all
     * @param {boolean} selected
     */
    handleSelectAll(selected) {
        if (selected) {
            // Select all current orders
            const orders = this.dataManager.getCurrentPageOrders();
            orders.forEach(order => {
                if (!this.dataManager.selectedIds.has(order.id)) {
                    this.dataManager.toggleSelection(order.id);
                }
            });
        } else {
            // Deselect all
            this.dataManager.clearSelection();
        }
        this.renderTableForCurrentPage();
    }

    /**
     * Handle clear selection
     */
    handleClearSelection() {
        this.dataManager.clearSelection();
        this.renderTableForCurrentPage();
    }

    /**
     * Handle bulk export
     */
    async handleBulkExport() {
        const selectedIds = Array.from(this.dataManager.selectedIds);
        if (selectedIds.length === 0) return;

        try {
            // Gather all selected orders
            const orders = [];
            for (const orderId of selectedIds) {
                const order = await this.dataManager.getOrder(orderId);
                if (order) {
                    orders.push(order);
                }
            }

            if (orders.length === 0) {
                this.ui.showToast('Không tìm thấy đơn hàng nào', 'error');
                return;
            }

            // Show export format dialog
            this.showExportFormatDialog(orders);
        } catch (error) {
            console.error('Bulk export failed:', error);
            this.ui.showToast('Không thể xuất đơn hàng', 'error');
        }
    }

    /**
     * Handle bulk delete
     */
    async handleBulkDelete() {
        const selectedIds = Array.from(this.dataManager.selectedIds);
        if (selectedIds.length === 0) return;

        const confirmed = await this.ui.showConfirmDialog({
            title: 'Xóa nhiều đơn hàng',
            message: `Bạn có chắc muốn xóa ${selectedIds.length} đơn hàng? Hành động này không thể hoàn tác.`,
            confirmText: `Xóa ${selectedIds.length} đơn`,
            type: 'danger'
        });

        if (!confirmed) return;

        try {
            let deletedCount = 0;
            let skippedCount = 0;

            for (const orderId of selectedIds) {
                const order = await this.dataManager.getOrder(orderId);
                if (order && this.config.canDeleteOrder(order.status)) {
                    await this.dataManager.deleteOrder(orderId);
                    deletedCount++;
                } else {
                    skippedCount++;
                }
            }

            this.dataManager.clearSelection();

            if (skippedCount > 0) {
                this.ui.showToast(`Đã xóa ${deletedCount} đơn, bỏ qua ${skippedCount} đơn không thể xóa`, 'warning');
            } else {
                this.ui.showToast(`Đã xóa ${deletedCount} đơn hàng`, 'success');
            }
        } catch (error) {
            console.error('Bulk delete failed:', error);
            this.ui.showToast('Không thể xóa đơn hàng', 'error');
        }
    }

    /**
     * Handle row click
     * @param {string} orderId
     */
    handleRowClick(orderId) {
        // Could open detail view or quick edit
        console.log('Row clicked:', orderId);
    }

    /**
     * Handle view order detail (double click)
     * @param {string} orderId
     */
    async handleViewDetail(orderId) {
        const order = await this.dataManager.getOrder(orderId);

        if (!order) {
            this.ui.showToast('Không tìm thấy đơn hàng', 'error');
            return;
        }

        // Open detail dialog
        window.orderDetailDialog.open(order, {
            onRetry: async (id) => {
                try {
                    // Reset sync status for failed items and trigger re-sync
                    await this.dataManager.retrySyncFailedItems(id);
                    this.ui.showToast('Đang thử lại đồng bộ...', 'info');
                } catch (error) {
                    this.ui.showToast('Không thể thử lại đồng bộ', 'error');
                }
            }
        });
    }

    /**
     * Handle view invoice images
     * @param {Array} images
     */
    handleViewInvoice(images) {
        if (!images || images.length === 0) return;
        // Open image viewer modal
        this.openImageViewer(images, 'Hóa đơn');
    }

    /**
     * Handle view product images
     * @param {string} itemId
     */
    handleViewImages(itemId) {
        // Find item and open its images
        console.log('View images for item:', itemId);
    }

    /**
     * Open image viewer
     * @param {Array} images
     * @param {string} title
     */
    openImageViewer(images, title) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="image-viewer">
                <div class="image-viewer__header">
                    <h3>${title}</h3>
                    <button class="btn-icon" id="btnCloseViewer">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="image-viewer__content">
                    <img src="${images[0]}" alt="${title}">
                </div>
                ${images.length > 1 ? `
                    <div class="image-viewer__thumbnails">
                        ${images.map((img, idx) => `
                            <img src="${img}" alt="${title} ${idx + 1}" class="${idx === 0 ? 'active' : ''}" data-index="${idx}">
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(overlay);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Close button
        overlay.querySelector('#btnCloseViewer')?.addEventListener('click', () => {
            overlay.remove();
        });

        // Overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        // Thumbnail click
        overlay.querySelectorAll('.image-viewer__thumbnails img').forEach(thumb => {
            thumb.addEventListener('click', () => {
                const index = parseInt(thumb.dataset.index, 10);
                overlay.querySelector('.image-viewer__content img').src = images[index];
                overlay.querySelectorAll('.image-viewer__thumbnails img').forEach(t => t.classList.remove('active'));
                thumb.classList.add('active');
            });
        });
    }

    // ========================================
    // CLEANUP
    // ========================================

    /**
     * Cleanup and destroy controller
     */
    destroy() {
        // Unsubscribe from all events
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];

        // Reset data manager
        this.dataManager.reset();

        this.initialized = false;
    }
}

// ========================================
// INITIALIZE ON DOM READY
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for all dependencies to load
    const checkDependencies = () => {
        return (
            window.PurchaseOrderConfig &&
            window.purchaseOrderService &&
            window.purchaseOrderDataManager &&
            window.purchaseOrderUI &&
            window.purchaseOrderTableRenderer &&
            window.purchaseOrderFormModal
        );
    };

    // Retry until dependencies are loaded
    let attempts = 0;
    const maxAttempts = 10;

    const tryInit = async () => {
        if (checkDependencies()) {
            const controller = new PurchaseOrderController();
            window.purchaseOrderController = controller;
            await controller.init();
        } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(tryInit, 100);
        } else {
            console.error('[PurchaseOrderController] Dependencies not loaded after max attempts');
        }
    };

    await tryInit();
});

console.log('[Purchase Orders] Main controller loaded');
