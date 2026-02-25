/**
 * PURCHASE ORDERS MODULE - MAIN CONTROLLER
 * File: main.js
 * Purpose: Initialize and coordinate all components
 */

// ========================================
// UTILITY: Variant Matching (Section 15.6)
// ========================================

/**
 * Compare two variant strings order-insensitively and format-insensitively.
 * Supports comma, pipe, slash, and parenthesis formats.
 * e.g. "ĐEN, 4, XL" matches "(Đen) (4) (XL)" or "Đen | 4 | XL" or "Đen / 4 / XL"
 */
function variantsMatch(variant1, variant2) {
    if (!variant1 || !variant2) return false;

    const removeDiacritics = window.ProductCodeGenerator?.removeVietnameseDiacritics
        || ((s) => s);

    const normalize = (str) =>
        removeDiacritics(str.trim())
            .toUpperCase()
            .replace(/[()]/g, '')
            .replace(/\s+/g, ' ');

    const parts1 = variant1.split(/[,|\/]/).map(normalize).filter(p => p.length > 0).sort();
    const parts2 = variant2.split(/[,|\/]/).map(normalize).filter(p => p.length > 0).sort();

    return parts1.length === parts2.length && parts1.every((part, idx) => part === parts2[idx]);
}

// ========================================
// UTILITY: Products CSV Loader (for variant lookup)
// ========================================

let _productsCSVCache = null;

/**
 * Load and parse products_rows.csv
 * @returns {Promise<Array<{product_code: string, variant: string, base_product_code: string}>>}
 */
async function loadProductsCSV() {
    if (_productsCSVCache) return _productsCSVCache;

    try {
        const response = await fetch('products_rows.csv');
        if (!response.ok) {
            console.warn('[ExportMH] products_rows.csv fetch failed:', response.status);
            return [];
        }
        const text = await response.text();
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) return [];

        const headers = lines[0].split(',');
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((h, idx) => {
                row[h.trim()] = (values[idx] || '').trim();
            });
            rows.push(row);
        }

        _productsCSVCache = rows;
        console.log(`[ExportMH] Loaded ${rows.length} products from CSV`);
        return rows;
    } catch (error) {
        console.error('[ExportMH] Failed to load products CSV:', error);
        return [];
    }
}

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

            // Pre-load NCC names for supplier autocomplete
            if (window.NCCManager) {
                window.NCCManager.loadNCCNames().catch(err =>
                    console.warn('[Init] NCC names load failed:', err)
                );
            }

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

        this.showPurchaseOrderPreview(order);
    }

    /**
     * Show purchase order preview UI (replaces old export format dialog)
     * Displays order items in TPOS-style table with editable Giảm giá, Cước phí, Ghi chú
     */
    showPurchaseOrderPreview(order) {
        const orders = Array.isArray(order) ? order : [order];
        const singleOrder = orders[0];
        const items = singleOrder.items || [];
        const ncc = window.NCCManager?.findByName(singleOrder.supplier?.name);
        const supplierDisplay = ncc
            ? `[${ncc.code}] ${ncc.name}`
            : (singleOrder.supplier?.name || 'Không rõ');

        // Calculate totals
        let totalQty = 0;
        let totalAmount = 0;
        for (const item of items) {
            const qty = item.quantity || 0;
            const price = item.purchasePrice || 0;
            totalQty += qty;
            totalAmount += qty * price;
        }

        const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

        // Build item rows
        const rowsHTML = items.map((item, idx) => {
            const qty = item.quantity || 0;
            const price = item.purchasePrice || 0;
            const lineTotal = qty * price;
            const code = item.productCode || '';
            const name = item.productName || '';
            const variant = item.variant || '';
            return `
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 10px 8px; text-align: center; color: #6b7280; font-size: 13px; vertical-align: top;">${idx + 1}</td>
                    <td style="padding: 10px 8px; font-size: 13px;">
                        <div style="font-weight: 500;">[${code}] ${name}</div>
                        ${variant ? `<div style="color: #6b7280; font-size: 12px; margin-top: 2px;">${variant}</div>` : ''}
                    </td>
                    <td style="padding: 10px 8px; text-align: center; font-size: 13px;">${qty}</td>
                    <td style="padding: 10px 8px; text-align: right; font-size: 13px;">${fmt(price)}</td>
                    <td style="padding: 10px 8px; text-align: right; font-size: 13px; font-weight: 500;">${fmt(lineTotal)}</td>
                </tr>`;
        }).join('');

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.5);
            display: flex; align-items: center; justify-content: center; z-index: 5000;
        `;

        overlay.innerHTML = `
            <div style="
                background: white; border-radius: 12px; padding: 0;
                max-width: 700px; width: 95%; max-height: 90vh; display: flex; flex-direction: column;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
            ">
                <!-- Header -->
                <div style="padding: 20px 24px 12px; border-bottom: 1px solid #e5e7eb;">
                    <h3 style="margin: 0 0 4px; font-size: 17px; font-weight: 600;">
                        Đơn mua hàng - ${singleOrder.orderNumber || ''}
                    </h3>
                    <div style="font-size: 13px; color: #6b7280;">NCC: <strong>${supplierDisplay}</strong></div>
                </div>

                <!-- Scrollable table -->
                <div style="overflow-y: auto; flex: 1; min-height: 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                                <th style="padding: 10px 8px; text-align: center; font-size: 12px; font-weight: 600; color: #64748b; width: 40px;">STT</th>
                                <th style="padding: 10px 8px; text-align: left; font-size: 12px; font-weight: 600; color: #64748b;">Sản phẩm</th>
                                <th style="padding: 10px 8px; text-align: center; font-size: 12px; font-weight: 600; color: #64748b; width: 60px;">SL</th>
                                <th style="padding: 10px 8px; text-align: right; font-size: 12px; font-weight: 600; color: #64748b; width: 100px;">Đơn giá</th>
                                <th style="padding: 10px 8px; text-align: right; font-size: 12px; font-weight: 600; color: #64748b; width: 100px;">Tổng</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>
                </div>

                <!-- Summary -->
                <div style="padding: 16px 24px; border-top: 2px solid #e2e8f0; background: #f8fafc;">
                    <div style="display: flex; justify-content: flex-end; gap: 32px; margin-bottom: 12px; font-size: 13px;">
                        <span style="color: #6b7280;">Tổng số lượng: <strong>${totalQty}</strong></span>
                        <span>Tổng: <strong>${fmt(totalAmount)}</strong></span>
                    </div>

                    <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; align-items: center; max-width: 360px; margin-left: auto;">
                        <label style="font-size: 13px; color: #374151; text-align: right;">Giảm giá:</label>
                        <input type="number" id="poDecreaseAmount" value="${singleOrder.discountAmount || 0}" min="0" style="
                            height: 32px; padding: 0 10px; border: 1px solid #d1d5db; border-radius: 6px;
                            font-size: 13px; text-align: right; width: 100%; box-sizing: border-box;
                        ">

                        <label style="font-size: 13px; color: #374151; text-align: right;">Cước phí:</label>
                        <input type="number" id="poCostsIncurred" value="${singleOrder.shippingFee || 0}" min="0" style="
                            height: 32px; padding: 0 10px; border: 1px solid #d1d5db; border-radius: 6px;
                            font-size: 13px; text-align: right; width: 100%; box-sizing: border-box;
                        ">

                        <label style="font-size: 13px; color: #374151; text-align: right;">Ghi chú:</label>
                        <input type="text" id="poNote" value="${singleOrder.notes || ''}" placeholder="Nhập ghi chú..." style="
                            height: 32px; padding: 0 10px; border: 1px solid #d1d5db; border-radius: 6px;
                            font-size: 13px; width: 100%; box-sizing: border-box;
                        ">
                    </div>

                    <div style="display: flex; justify-content: flex-end; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                        <span style="font-size: 15px; font-weight: 600;">
                            Tổng tiền: <span id="poFinalAmount">${fmt(totalAmount - (singleOrder.discountAmount || 0) + (singleOrder.shippingFee || 0))}</span>
                        </span>
                    </div>
                </div>

                <!-- Buttons -->
                <div style="padding: 16px 24px; border-top: 1px solid #e5e7eb; display: flex; gap: 8px; justify-content: flex-end;">
                    <button type="button" id="btnCancelPO" style="
                        padding: 10px 20px; border: 1px solid #d1d5db; border-radius: 8px;
                        background: white; cursor: pointer; font-size: 14px;
                    ">Hủy</button>
                    <button type="button" id="btnSubmitTPOS" style="
                        padding: 10px 20px; border: none; border-radius: 8px;
                        background: #16a34a; color: white; cursor: pointer;
                        font-size: 14px; font-weight: 500;
                    " ${!ncc?.tposId ? 'disabled title="NCC chưa có TPOS ID"' : ''}>Tạo đơn TPOS</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Live recalculate final amount
        const decreaseInput = overlay.querySelector('#poDecreaseAmount');
        const costsInput = overlay.querySelector('#poCostsIncurred');
        const finalSpan = overlay.querySelector('#poFinalAmount');
        const recalc = () => {
            const decrease = parseFloat(decreaseInput.value) || 0;
            const costs = parseFloat(costsInput.value) || 0;
            finalSpan.textContent = fmt(totalAmount - decrease + costs);
        };
        decreaseInput.addEventListener('input', recalc);
        costsInput.addEventListener('input', recalc);

        // Cancel / close
        overlay.querySelector('#btnCancelPO').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        // Submit to TPOS
        overlay.querySelector('#btnSubmitTPOS').addEventListener('click', async () => {
            const btn = overlay.querySelector('#btnSubmitTPOS');
            btn.disabled = true;
            btn.textContent = 'Đang tạo...';
            btn.style.opacity = '0.6';

            try {
                // Attach extra fields to order for TPOS
                singleOrder.decreaseAmount = parseFloat(decreaseInput.value) || 0;
                singleOrder.costsIncurred = parseFloat(costsInput.value) || 0;
                singleOrder.tposNote = overlay.querySelector('#poNote').value || '';

                // Step 1: Export MH (resolve codes + build workbook)
                const result = await this.exportMuaHang(orders);

                if (result.exported === 0) {
                    this.ui.showToast('Không thể tạo đơn TPOS - Không có SP nào phù hợp', 'error');
                    btn.disabled = false;
                    btn.textContent = 'Tạo đơn TPOS';
                    btn.style.opacity = '';
                    return;
                }

                if (!ncc?.tposId) {
                    this.ui.showToast('NCC chưa có TPOS ID. Hãy đồng bộ NCC từ TPOS trước.', 'error');
                    btn.disabled = false;
                    btn.textContent = 'Tạo đơn TPOS';
                    btn.style.opacity = '';
                    return;
                }

                // Step 2: Create on TPOS
                const tposResult = await window.TPOSPurchase.createFromExcel(result.workbook, singleOrder);

                overlay.remove();

                if (tposResult.success) {
                    this.ui.showToast(
                        `Đã tạo đơn TPOS: ${tposResult.poNumber || 'ID ' + tposResult.poId} (${tposResult.linesCount} SP)`,
                        'success'
                    );

                    // Update Firebase items with TPOS variant codes
                    if (tposResult.orderLines && result.itemCodeMap && singleOrder.id) {
                        try {
                            await this.updateItemsWithTPOSCodes(singleOrder, tposResult.orderLines, result.itemCodeMap);
                        } catch (err) {
                            console.warn('[TPOSPurchase] Failed to update variant codes:', err);
                        }
                    }

                    // Auto-update status
                    const config = window.PurchaseOrderConfig;
                    if (singleOrder.status === config?.OrderStatus?.AWAITING_PURCHASE) {
                        try {
                            await this.dataManager.updateOrderStatus(singleOrder.id, config.OrderStatus.AWAITING_DELIVERY);
                            this.ui.showToast('Đơn hàng chuyển sang trạng thái Chờ Hàng', 'info');
                            if (this.dataManager?.loadOrders) {
                                this.dataManager.loadOrders(this.currentTab, true);
                            }
                        } catch (statusErr) {
                            console.warn('[PO Preview] Auto-update status failed:', statusErr);
                        }
                    }
                }
            } catch (error) {
                console.error('[PO Preview] Submit failed:', error);
                this.ui.showToast('Lỗi tạo đơn TPOS: ' + error.message, 'error');
                overlay.remove();
            }
        });
    }

    /**
     * Show confirm dialog to push Excel to TPOS as purchase order
     */
    showTPOSPurchaseConfirm(workbook, order, exportedCount, itemCodeMap) {
        // Check if NCC has tposId
        const ncc = window.NCCManager?.findByName(order.supplier?.name);
        if (!ncc?.tposId) {
            console.log('[TPOSPurchase] NCC not found or no tposId, skipping TPOS confirm');
            return;
        }

        const confirmOverlay = document.createElement('div');
        confirmOverlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.5);
            display: flex; align-items: center; justify-content: center; z-index: 5001;
        `;
        confirmOverlay.innerHTML = `
            <div style="
                background: white; border-radius: 12px; padding: 24px;
                max-width: 420px; width: 90%;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
            ">
                <h3 style="margin: 0 0 12px; font-size: 16px; font-weight: 600;">
                    Tạo đơn mua hàng trên TPOS?
                </h3>
                <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px;">
                    Đã xuất <strong>${exportedCount}</strong> sản phẩm. Bạn có muốn tạo đơn mua hàng trực tiếp trên TPOS?
                </p>
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 13px;">
                    <div><strong>NCC:</strong> ${ncc.name}</div>
                    <div><strong>TPOS ID:</strong> ${ncc.tposId}</div>
                    <div><strong>Số SP:</strong> ${exportedCount}</div>
                </div>
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button id="btnSkipTPOS" style="
                        padding: 10px 20px; border: 1px solid #d1d5db; border-radius: 8px;
                        background: white; cursor: pointer; font-size: 14px;
                    ">Bỏ qua</button>
                    <button id="btnConfirmTPOS" style="
                        padding: 10px 20px; border: none; border-radius: 8px;
                        background: #16a34a; color: white; cursor: pointer;
                        font-size: 14px; font-weight: 500;
                    ">Tạo đơn TPOS</button>
                </div>
            </div>
        `;

        document.body.appendChild(confirmOverlay);

        confirmOverlay.querySelector('#btnSkipTPOS').addEventListener('click', () => {
            confirmOverlay.remove();
        });
        confirmOverlay.addEventListener('click', (e) => {
            if (e.target === confirmOverlay) confirmOverlay.remove();
        });

        confirmOverlay.querySelector('#btnConfirmTPOS').addEventListener('click', async () => {
            const btn = confirmOverlay.querySelector('#btnConfirmTPOS');
            btn.disabled = true;
            btn.textContent = 'Đang tạo...';
            btn.style.opacity = '0.6';

            const result = await window.TPOSPurchase.createFromExcel(workbook, order);

            confirmOverlay.remove();

            if (result.success) {
                this.ui.showToast(
                    `Đã tạo đơn TPOS: ${result.poNumber || 'ID ' + result.poId} (${result.linesCount} SP)`,
                    'success'
                );

                // Update Firebase items with TPOS variant codes
                if (result.orderLines && itemCodeMap && order.id) {
                    try {
                        await this.updateItemsWithTPOSCodes(order, result.orderLines, itemCodeMap);
                    } catch (err) {
                        console.warn('[TPOSPurchase] Failed to update variant codes:', err);
                    }
                }
            }
        });
    }

    /**
     * Update Firebase order items with resolved product codes from TPOS PurchaseByExcel response
     * Maps OrderLine.Product.Barcode + Product.Id back to original items
     */
    async updateItemsWithTPOSCodes(order, orderLines, itemCodeMap) {
        if (!order.id || !order.items) return;

        const updatedItems = [...order.items];
        let updatedCount = 0;

        for (let i = 0; i < orderLines.length && i < itemCodeMap.length; i++) {
            const line = orderLines[i];
            const mapping = itemCodeMap[i];
            const barcode = line.Product?.Barcode || line.Product?.DefaultCode;
            const tposProductId = line.Product?.Id || line.ProductId;

            if (barcode && mapping.itemIndex < updatedItems.length) {
                const item = updatedItems[mapping.itemIndex];
                if (item.productCode !== barcode || !item.tposProductId) {
                    updatedItems[mapping.itemIndex] = {
                        ...item,
                        productCode: barcode,
                        tposProductId: tposProductId
                    };
                    updatedCount++;
                }
            }
        }

        if (updatedCount > 0) {
            const db = firebase.firestore();
            await db.collection('purchase_orders').doc(order.id).update({
                items: updatedItems
            });
            console.log(`[TPOSPurchase] Updated ${updatedCount} items with TPOS variant codes`);

            this.ui.showToast(`Đã cập nhật ${updatedCount} mã biến thể từ TPOS`, 'info');

            // Refresh table to show updated codes
            if (this.dataManager?.loadOrders) {
                this.dataManager.loadOrders(this.currentTab, true);
            }
        }
    }

    /**
     * Export "Mua Hàng" format - TPOS-importable 4 columns (Section 15)
     * Columns: Mã sản phẩm (*), Số lượng (*), Đơn giá, Chiết khấu (%)
     * Uses 3-case product code resolution with variant matching
     * @param {Array} orders - Orders to export (single order in array)
     * @returns {Promise<{exported: number, skipped: number, errors: string[]}>}
     */
    async exportMuaHang(orders) {
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not loaded');
        }

        const order = orders[0];
        const allItems = order.items || [];
        if (allItems.length === 0) {
            return { exported: 0, skipped: 0, errors: ['Đơn hàng không có sản phẩm nào'] };
        }

        // Load products CSV for variant lookup (CASE 3)
        const productsCSV = await loadProductsCSV();

        const excelRows = [];
        const skippedErrors = [];
        const itemCodeMap = []; // Track resolved code → item index for TPOS update

        for (let i = 0; i < allItems.length; i++) {
            const item = allItems[i];
            let productCode = null;

            // CASE 1: Already has tposProductId → use productCode directly
            if (item.tposProductId) {
                productCode = item.productCode;
            }
            // CASE 2: No variant → use productCode directly
            else if (!item.variant || item.variant.trim() === '') {
                productCode = item.productCode;
            }
            // CASE 3: Has variant + no tposProductId → 3-step fallback
            else {
                // Step 1: Find variant match in products CSV by base_product_code
                const candidates = productsCSV.filter(
                    row => row.base_product_code === item.productCode
                        && row.variant && row.variant.trim() !== ''
                );

                const matched = candidates.find(
                    row => variantsMatch(row.variant, item.variant)
                );

                if (matched) {
                    productCode = matched.product_code;
                } else {
                    // Step 2: Check if productCode exists as exact product_code in CSV
                    const exactMatch = productsCSV.find(
                        row => row.product_code === item.productCode
                    );

                    if (exactMatch) {
                        productCode = item.productCode;
                    } else {
                        // Step 3: Search TPOS API
                        try {
                            const tposResults = await window.TPOSClient?.searchProduct(item.productCode);
                            if (tposResults && tposResults.length > 0) {
                                productCode = item.productCode;
                            }
                        } catch (err) {
                            console.warn('[ExportMH] TPOS search failed for', item.productCode, err);
                        }
                    }
                }

                // All steps failed → skip
                if (!productCode) {
                    const candidateCodes = candidates.map(c => c.product_code).slice(0, 3).join(', ');
                    skippedErrors.push(
                        `❌ ${item.productCode} - ${item.productName || ''} (Variant: ${item.variant}${candidateCodes ? ', Có trong kho: [' + candidateCodes + ']' : ''})`
                    );
                    continue;
                }
            }

            itemCodeMap.push({ itemIndex: i, resolvedCode: productCode });

            excelRows.push({
                'Mã sản phẩm (*)': productCode,
                'Số lượng (*)': item.quantity || 0,
                'Đơn giá': item.purchasePrice || 0,
                'Chiết khấu (%)': 0
            });
        }

        if (excelRows.length === 0) {
            return { exported: 0, skipped: skippedErrors.length, errors: skippedErrors };
        }

        // Create workbook with json_to_sheet (preserves column headers as keys)
        const ws = XLSX.utils.json_to_sheet(excelRows);

        // Set column widths
        ws['!cols'] = [
            { wch: 25 },  // Mã sản phẩm
            { wch: 12 },  // Số lượng
            { wch: 12 },  // Đơn giá
            { wch: 14 }   // Chiết khấu
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Mua Hàng');

        // Filename: MuaHang_{AxCode}_{DD-MM}.xlsx (e.g. MuaHang_A12_24-02.xlsx)
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const ncc = window.NCCManager?.findByName(order.supplier?.name);
        const supplierLabel = ncc?.code || order.orderNumber || 'Export';
        const filename = `MuaHang_${supplierLabel}_${dd}-${mm}.xlsx`;

        XLSX.writeFile(wb, filename);

        return {
            exported: excelRows.length,
            skipped: skippedErrors.length,
            errors: skippedErrors,
            workbook: wb,
            order: order,
            itemCodeMap: itemCodeMap
        };
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

            this.showPurchaseOrderPreview(orders);
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
