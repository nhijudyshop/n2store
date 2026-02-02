/**
 * PURCHASE ORDERS MODULE - DIALOGS
 * File: dialogs.js
 * Purpose: Order detail, variant generator, settings, inventory picker, shipping fee dialogs
 * Matches React app components
 */

// ========================================
// ORDER DETAIL DIALOG
// Matches: PurchaseOrderDetailDialog.tsx
// ========================================

class OrderDetailDialog {
    constructor() {
        this.modalElement = null;
        this.order = null;
        this.onRetry = null;
    }

    /**
     * Open order detail dialog
     * @param {Object} order - Order data with items
     * @param {Object} options - { onRetry }
     */
    open(order, options = {}) {
        this.order = order;
        this.onRetry = options.onRetry;

        this.render();
        this.show();
    }

    /**
     * Close dialog
     */
    close() {
        if (this.modalElement) {
            this.modalElement.classList.add('modal-overlay--exit');
            setTimeout(() => {
                this.modalElement.remove();
                this.modalElement = null;
            }, 200);
        }
    }

    /**
     * Show dialog
     */
    show() {
        if (this.modalElement) {
            this.modalElement.style.display = 'flex';
        }
    }

    /**
     * Render dialog
     */
    render() {
        if (this.modalElement) {
            this.modalElement.remove();
        }

        const config = window.PurchaseOrderConfig;
        const order = this.order;
        const items = order.items || [];

        // Calculate totals
        const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
        const calculatedTotal = items.reduce((sum, item) =>
            sum + ((item.purchasePrice || 0) * (item.quantity || 0)), 0);

        // Find failed sync items
        const failedItems = items.filter(item => item.tposSyncStatus === 'failed');

        this.modalElement = document.createElement('div');
        this.modalElement.className = 'modal-overlay';
        this.modalElement.innerHTML = `
            <div class="modal modal--lg">
                <div class="modal__header">
                    <div>
                        <h2 class="modal__title">Chi tiết đơn hàng</h2>
                        <p class="modal__subtitle">${order.orderNumber || order.id}</p>
                    </div>
                    <button type="button" class="modal__close" id="btnCloseDetail">
                        <i data-lucide="x"></i>
                    </button>
                </div>

                <div class="modal__body">
                    <!-- Order Info -->
                    <div class="detail-info-grid">
                        <div class="detail-info-item">
                            <span class="detail-info-label">Nhà cung cấp</span>
                            <span class="detail-info-value">${order.supplier?.name || 'Chưa cập nhật'}</span>
                        </div>
                        <div class="detail-info-item">
                            <span class="detail-info-label">Ngày đặt</span>
                            <span class="detail-info-value">${config.formatDate(order.orderDate)}</span>
                        </div>
                        <div class="detail-info-item">
                            <span class="detail-info-label">Trạng thái</span>
                            <span class="detail-info-value">${config.getStatusBadgeHTML(order.status)}</span>
                        </div>
                        <div class="detail-info-item">
                            <span class="detail-info-label">Tổng số lượng</span>
                            <span class="detail-info-value">${totalQuantity}</span>
                        </div>
                    </div>

                    <!-- Items Table -->
                    <div class="detail-items-section">
                        <h3 class="detail-section-title">Danh sách sản phẩm (${items.length})</h3>
                        <div class="detail-items-table-wrapper">
                            <table class="detail-items-table">
                                <thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>Tên sản phẩm</th>
                                        <th>Mã SP</th>
                                        <th>Biến thể</th>
                                        <th class="text-center">SL</th>
                                        <th class="text-right">Giá mua</th>
                                        <th class="text-right">Thành tiền</th>
                                        <th>Trạng thái sync</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${items.map((item, index) => `
                                        <tr class="${item.tposSyncStatus === 'failed' ? 'row-error' : ''}">
                                            <td>${index + 1}</td>
                                            <td>${item.productName || 'Sản phẩm đã xóa'}</td>
                                            <td>${item.productCode || '-'}</td>
                                            <td>${item.variant || '-'}</td>
                                            <td class="text-center">${item.quantity || 0}</td>
                                            <td class="text-right">${config.formatVND(item.purchasePrice || 0)}</td>
                                            <td class="text-right">${config.formatVND((item.purchasePrice || 0) * (item.quantity || 0))}</td>
                                            <td>${this.renderSyncStatus(item)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Failed Items Section -->
                    ${failedItems.length > 0 ? `
                        <div class="detail-failed-section">
                            <h3 class="detail-section-title text-danger">
                                <i data-lucide="alert-circle"></i>
                                Sản phẩm lỗi đồng bộ (${failedItems.length})
                            </h3>
                            <ul class="failed-items-list">
                                ${failedItems.map(item => `
                                    <li class="failed-item">
                                        <span class="failed-item-name">${item.productName}</span>
                                        <span class="failed-item-error">${item.tposSyncError || 'Lỗi không xác định'}</span>
                                    </li>
                                `).join('')}
                            </ul>
                            <button class="btn btn-warning" id="btnRetryFailed">
                                <i data-lucide="refresh-cw"></i>
                                <span>Thử lại đồng bộ</span>
                            </button>
                        </div>
                    ` : ''}

                    <!-- Financial Summary -->
                    <div class="detail-summary">
                        <div class="detail-summary-row">
                            <span>Tổng tiền hàng:</span>
                            <span>${config.formatVND(calculatedTotal)}</span>
                        </div>
                        <div class="detail-summary-row">
                            <span>Giảm giá:</span>
                            <span>- ${config.formatVND(order.discountAmount || 0)}</span>
                        </div>
                        <div class="detail-summary-row">
                            <span>Phí ship:</span>
                            <span>+ ${config.formatVND(order.shippingFee || 0)}</span>
                        </div>
                        <div class="detail-summary-row detail-summary-row--total">
                            <span>THÀNH TIỀN:</span>
                            <span>${config.formatVND(order.finalAmount || 0)}</span>
                        </div>
                    </div>

                    <!-- Notes -->
                    ${order.notes ? `
                        <div class="detail-notes">
                            <h3 class="detail-section-title">Ghi chú</h3>
                            <p>${order.notes}</p>
                        </div>
                    ` : ''}

                    <!-- Timestamps -->
                    <div class="detail-timestamps">
                        <span>Tạo lúc: ${config.formatDateTime(order.createdAt)}</span>
                        <span>Cập nhật: ${config.formatDateTime(order.updatedAt)}</span>
                    </div>
                </div>

                <div class="modal__footer">
                    <button class="btn btn-outline" id="btnCloseDetailFooter">Đóng</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        this.bindEvents();
    }

    /**
     * Render sync status badge
     * @param {Object} item
     * @returns {string} HTML
     */
    renderSyncStatus(item) {
        const status = item.tposSyncStatus;

        switch (status) {
            case 'success':
                return '<span class="sync-badge sync-badge--success"><i data-lucide="check"></i> Đã đồng bộ</span>';
            case 'processing':
                return '<span class="sync-badge sync-badge--processing"><i data-lucide="loader-2" class="spin"></i> Đang xử lý</span>';
            case 'failed':
                return '<span class="sync-badge sync-badge--failed"><i data-lucide="alert-circle"></i> Lỗi</span>';
            case 'pending':
                return '<span class="sync-badge sync-badge--pending">Chờ đồng bộ</span>';
            default:
                return '<span class="text-muted">-</span>';
        }
    }

    /**
     * Bind event handlers
     */
    bindEvents() {
        // Close buttons
        this.modalElement.querySelector('#btnCloseDetail')?.addEventListener('click', () => this.close());
        this.modalElement.querySelector('#btnCloseDetailFooter')?.addEventListener('click', () => this.close());

        // Overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                this.close();
            }
        });

        // Retry failed
        this.modalElement.querySelector('#btnRetryFailed')?.addEventListener('click', async () => {
            if (this.onRetry) {
                const btn = this.modalElement.querySelector('#btnRetryFailed');
                btn.disabled = true;
                btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Đang xử lý...';
                if (typeof lucide !== 'undefined') lucide.createIcons();

                await this.onRetry(this.order.id);
                this.close();
            }
        });

        // Escape key
        document.addEventListener('keydown', this.handleEscape.bind(this));
    }

    handleEscape(e) {
        if (e.key === 'Escape' && this.modalElement) {
            this.close();
            document.removeEventListener('keydown', this.handleEscape.bind(this));
        }
    }
}

// ========================================
// VARIANT GENERATOR DIALOG
// Matches: VariantGeneratorDialog.tsx
// ========================================

class VariantGeneratorDialog {
    constructor() {
        this.modalElement = null;
        this.attributes = [];
        this.onGenerate = null;
    }

    /**
     * Open variant generator dialog
     * @param {Object} options - { baseProduct, onGenerate }
     */
    open(options = {}) {
        this.baseProduct = options.baseProduct || {};
        this.onGenerate = options.onGenerate;
        this.attributes = [
            { name: 'Size', values: [] },
            { name: 'Màu', values: [] }
        ];

        this.render();
        this.show();
    }

    close() {
        if (this.modalElement) {
            this.modalElement.classList.add('modal-overlay--exit');
            setTimeout(() => {
                this.modalElement.remove();
                this.modalElement = null;
            }, 200);
        }
    }

    show() {
        if (this.modalElement) {
            this.modalElement.style.display = 'flex';
        }
    }

    render() {
        if (this.modalElement) {
            this.modalElement.remove();
        }

        this.modalElement = document.createElement('div');
        this.modalElement.className = 'modal-overlay';
        this.modalElement.innerHTML = `
            <div class="modal modal--md">
                <div class="modal__header">
                    <h2 class="modal__title">Tạo biến thể sản phẩm</h2>
                    <button type="button" class="modal__close" id="btnCloseVariant">
                        <i data-lucide="x"></i>
                    </button>
                </div>

                <div class="modal__body">
                    <p class="variant-help-text">Nhập các thuộc tính để tạo biến thể. Mỗi giá trị cách nhau bằng dấu phẩy.</p>

                    <div class="variant-attributes" id="variantAttributes">
                        ${this.renderAttributeInputs()}
                    </div>

                    <button class="btn btn-outline btn-sm" id="btnAddAttribute">
                        <i data-lucide="plus"></i>
                        <span>Thêm thuộc tính</span>
                    </button>

                    <div class="variant-preview" id="variantPreview">
                        <h4>Xem trước biến thể:</h4>
                        <div class="variant-preview-list" id="variantPreviewList">
                            <p class="text-muted">Nhập thuộc tính để xem trước...</p>
                        </div>
                    </div>
                </div>

                <div class="modal__footer">
                    <button class="btn btn-outline" id="btnCancelVariant">Hủy</button>
                    <button class="btn btn-primary" id="btnGenerateVariants">
                        <i data-lucide="layers"></i>
                        <span>Tạo biến thể</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        this.bindEvents();
    }

    renderAttributeInputs() {
        return this.attributes.map((attr, index) => `
            <div class="variant-attribute-row" data-index="${index}">
                <input type="text" class="form-input" placeholder="Tên thuộc tính (VD: Size)"
                       value="${attr.name}" data-field="name">
                <input type="text" class="form-input form-input--lg" placeholder="Giá trị (VD: S, M, L, XL)"
                       value="${attr.values.join(', ')}" data-field="values">
                <button class="btn-icon btn-danger" data-action="remove-attribute" ${this.attributes.length <= 1 ? 'disabled' : ''}>
                    <i data-lucide="x"></i>
                </button>
            </div>
        `).join('');
    }

    /**
     * Generate all variant combinations
     * @returns {Array} Array of variant strings
     */
    generateCombinations() {
        const validAttrs = this.attributes.filter(attr =>
            attr.name.trim() && attr.values.length > 0);

        if (validAttrs.length === 0) return [];

        const valueSets = validAttrs.map(attr => attr.values);

        const combine = (arrays, prefix = '') => {
            if (arrays.length === 0) return [prefix];

            const [first, ...rest] = arrays;
            const results = [];

            for (const value of first) {
                const newPrefix = prefix ? `${prefix} / ${value}` : value;
                results.push(...combine(rest, newPrefix));
            }

            return results;
        };

        return combine(valueSets);
    }

    updatePreview() {
        const previewList = this.modalElement?.querySelector('#variantPreviewList');
        if (!previewList) return;

        const combinations = this.generateCombinations();

        if (combinations.length === 0) {
            previewList.innerHTML = '<p class="text-muted">Nhập thuộc tính để xem trước...</p>';
            return;
        }

        previewList.innerHTML = `
            <p class="text-muted">Sẽ tạo ${combinations.length} biến thể:</p>
            <ul class="variant-preview-items">
                ${combinations.slice(0, 10).map(v => `<li>${v}</li>`).join('')}
                ${combinations.length > 10 ? `<li class="text-muted">... và ${combinations.length - 10} biến thể khác</li>` : ''}
            </ul>
        `;
    }

    bindEvents() {
        // Close buttons
        this.modalElement.querySelector('#btnCloseVariant')?.addEventListener('click', () => this.close());
        this.modalElement.querySelector('#btnCancelVariant')?.addEventListener('click', () => this.close());

        // Overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) this.close();
        });

        // Add attribute
        this.modalElement.querySelector('#btnAddAttribute')?.addEventListener('click', () => {
            this.attributes.push({ name: '', values: [] });
            const container = this.modalElement.querySelector('#variantAttributes');
            container.innerHTML = this.renderAttributeInputs();
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });

        // Input changes and remove buttons
        this.modalElement.querySelector('#variantAttributes')?.addEventListener('input', (e) => {
            const row = e.target.closest('.variant-attribute-row');
            if (!row) return;

            const index = parseInt(row.dataset.index, 10);
            const field = e.target.dataset.field;

            if (field === 'name') {
                this.attributes[index].name = e.target.value;
            } else if (field === 'values') {
                this.attributes[index].values = e.target.value.split(',').map(v => v.trim()).filter(Boolean);
            }

            this.updatePreview();
        });

        this.modalElement.querySelector('#variantAttributes')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="remove-attribute"]');
            if (!btn) return;

            const row = btn.closest('.variant-attribute-row');
            const index = parseInt(row.dataset.index, 10);

            this.attributes.splice(index, 1);
            const container = this.modalElement.querySelector('#variantAttributes');
            container.innerHTML = this.renderAttributeInputs();
            if (typeof lucide !== 'undefined') lucide.createIcons();
            this.updatePreview();
        });

        // Generate variants
        this.modalElement.querySelector('#btnGenerateVariants')?.addEventListener('click', () => {
            const combinations = this.generateCombinations();
            if (combinations.length > 0 && this.onGenerate) {
                this.onGenerate(combinations, this.baseProduct);
                this.close();
            }
        });
    }
}

// ========================================
// SETTINGS DIALOG
// Matches: Validation settings from React app
// ========================================

class SettingsDialog {
    constructor() {
        this.modalElement = null;
        this.settings = {
            requireProductImages: true,
            requirePriceImages: false,
            minPurchasePrice: 0,
            maxPurchasePrice: 100000000,
            autoGenerateCode: true
        };
        this.onSave = null;
    }

    /**
     * Open settings dialog
     * @param {Object} options - { settings, onSave }
     */
    async open(options = {}) {
        this.settings = { ...this.settings, ...options.settings };
        this.onSave = options.onSave;

        this.render();
        this.show();
    }

    close() {
        if (this.modalElement) {
            this.modalElement.classList.add('modal-overlay--exit');
            setTimeout(() => {
                this.modalElement.remove();
                this.modalElement = null;
            }, 200);
        }
    }

    show() {
        if (this.modalElement) {
            this.modalElement.style.display = 'flex';
        }
    }

    render() {
        if (this.modalElement) {
            this.modalElement.remove();
        }

        this.modalElement = document.createElement('div');
        this.modalElement.className = 'modal-overlay';
        this.modalElement.innerHTML = `
            <div class="modal modal--sm">
                <div class="modal__header">
                    <h2 class="modal__title">Cài đặt xác thực</h2>
                    <button type="button" class="modal__close" id="btnCloseSettings">
                        <i data-lucide="x"></i>
                    </button>
                </div>

                <div class="modal__body">
                    <div class="settings-group">
                        <h4 class="settings-group-title">Hình ảnh</h4>

                        <label class="settings-checkbox">
                            <input type="checkbox" id="requireProductImages"
                                   ${this.settings.requireProductImages ? 'checked' : ''}>
                            <span>Yêu cầu hình ảnh sản phẩm</span>
                        </label>

                        <label class="settings-checkbox">
                            <input type="checkbox" id="requirePriceImages"
                                   ${this.settings.requirePriceImages ? 'checked' : ''}>
                            <span>Yêu cầu hình ảnh giá mua</span>
                        </label>
                    </div>

                    <div class="settings-group">
                        <h4 class="settings-group-title">Giá</h4>

                        <div class="form-group">
                            <label class="form-label">Giá mua tối thiểu (VND)</label>
                            <input type="number" class="form-input" id="minPurchasePrice"
                                   value="${this.settings.minPurchasePrice}" min="0">
                        </div>

                        <div class="form-group">
                            <label class="form-label">Giá mua tối đa (VND)</label>
                            <input type="number" class="form-input" id="maxPurchasePrice"
                                   value="${this.settings.maxPurchasePrice}" min="0">
                        </div>
                    </div>

                    <div class="settings-group">
                        <h4 class="settings-group-title">Mã sản phẩm</h4>

                        <label class="settings-checkbox">
                            <input type="checkbox" id="autoGenerateCode"
                                   ${this.settings.autoGenerateCode ? 'checked' : ''}>
                            <span>Tự động tạo mã sản phẩm</span>
                        </label>
                    </div>
                </div>

                <div class="modal__footer">
                    <button class="btn btn-outline" id="btnCancelSettings">Hủy</button>
                    <button class="btn btn-primary" id="btnSaveSettings">
                        <i data-lucide="save"></i>
                        <span>Lưu cài đặt</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        this.bindEvents();
    }

    bindEvents() {
        // Close buttons
        this.modalElement.querySelector('#btnCloseSettings')?.addEventListener('click', () => this.close());
        this.modalElement.querySelector('#btnCancelSettings')?.addEventListener('click', () => this.close());

        // Overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) this.close();
        });

        // Save
        this.modalElement.querySelector('#btnSaveSettings')?.addEventListener('click', () => {
            this.settings = {
                requireProductImages: this.modalElement.querySelector('#requireProductImages').checked,
                requirePriceImages: this.modalElement.querySelector('#requirePriceImages').checked,
                minPurchasePrice: parseInt(this.modalElement.querySelector('#minPurchasePrice').value, 10) || 0,
                maxPurchasePrice: parseInt(this.modalElement.querySelector('#maxPurchasePrice').value, 10) || 100000000,
                autoGenerateCode: this.modalElement.querySelector('#autoGenerateCode').checked
            };

            if (this.onSave) {
                this.onSave(this.settings);
            }

            this.close();
        });
    }
}

// ========================================
// INVENTORY PICKER DIALOG
// Matches: Choose from inventory feature
// ========================================

class InventoryPickerDialog {
    constructor() {
        this.modalElement = null;
        this.products = [];
        this.filteredProducts = [];
        this.selectedProducts = [];
        this.onSelect = null;
        this.searchTerm = '';
    }

    /**
     * Open inventory picker dialog
     * @param {Object} options - { onSelect }
     */
    async open(options = {}) {
        this.onSelect = options.onSelect;
        this.selectedProducts = [];
        this.searchTerm = '';

        // Load products from Firestore
        await this.loadProducts();

        this.render();
        this.show();
    }

    /**
     * Load products from Firestore
     */
    async loadProducts() {
        try {
            const db = firebase.firestore();
            const snapshot = await db.collection('products')
                .orderBy('name')
                .limit(100)
                .get();

            this.products = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            this.filteredProducts = [...this.products];
        } catch (error) {
            console.error('Error loading products:', error);
            this.products = [];
            this.filteredProducts = [];
        }
    }

    close() {
        if (this.modalElement) {
            this.modalElement.classList.add('modal-overlay--exit');
            setTimeout(() => {
                this.modalElement.remove();
                this.modalElement = null;
            }, 200);
        }
    }

    show() {
        if (this.modalElement) {
            this.modalElement.style.display = 'flex';
        }
    }

    render() {
        if (this.modalElement) {
            this.modalElement.remove();
        }

        this.modalElement = document.createElement('div');
        this.modalElement.className = 'modal-overlay';
        this.modalElement.innerHTML = `
            <div class="modal modal--lg">
                <div class="modal__header">
                    <h2 class="modal__title">Chọn sản phẩm từ kho</h2>
                    <button type="button" class="modal__close" id="btnCloseInventory">
                        <i data-lucide="x"></i>
                    </button>
                </div>

                <div class="modal__body">
                    <div class="inventory-search">
                        <div class="input-icon">
                            <i data-lucide="search"></i>
                            <input type="text" class="form-input" id="inventorySearchInput"
                                   placeholder="Tìm theo tên, mã sản phẩm...">
                        </div>
                    </div>

                    <div class="inventory-products-list" id="inventoryProductsList">
                        ${this.renderProductsList()}
                    </div>

                    <div class="inventory-selected" id="inventorySelected">
                        ${this.renderSelectedProducts()}
                    </div>
                </div>

                <div class="modal__footer">
                    <button class="btn btn-outline" id="btnCancelInventory">Hủy</button>
                    <button class="btn btn-primary" id="btnAddSelectedProducts">
                        <i data-lucide="plus"></i>
                        <span>Thêm ${this.selectedProducts.length} sản phẩm</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        this.bindEvents();
    }

    renderProductsList() {
        if (this.filteredProducts.length === 0) {
            return `
                <div class="inventory-empty">
                    <p>Không tìm thấy sản phẩm</p>
                </div>
            `;
        }

        return `
            <table class="inventory-table">
                <thead>
                    <tr>
                        <th class="col-checkbox"></th>
                        <th>Tên sản phẩm</th>
                        <th>Mã SP</th>
                        <th>Tồn kho</th>
                        <th>Giá bán</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.filteredProducts.map(product => {
                        const isSelected = this.selectedProducts.some(p => p.id === product.id);
                        return `
                            <tr class="${isSelected ? 'selected' : ''}" data-product-id="${product.id}">
                                <td>
                                    <input type="checkbox" ${isSelected ? 'checked' : ''}>
                                </td>
                                <td>${product.name || '-'}</td>
                                <td>${product.code || product.sku || '-'}</td>
                                <td>${product.stock || 0}</td>
                                <td>${window.PurchaseOrderConfig.formatVND(product.price || 0)}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    renderSelectedProducts() {
        if (this.selectedProducts.length === 0) {
            return '<p class="text-muted">Chưa chọn sản phẩm nào</p>';
        }

        return `
            <p>Đã chọn ${this.selectedProducts.length} sản phẩm:</p>
            <div class="selected-products-tags">
                ${this.selectedProducts.map(p => `
                    <span class="selected-tag" data-product-id="${p.id}">
                        ${p.name}
                        <button class="btn-remove-tag" data-product-id="${p.id}">
                            <i data-lucide="x"></i>
                        </button>
                    </span>
                `).join('')}
            </div>
        `;
    }

    filterProducts(term) {
        this.searchTerm = term.toLowerCase();

        if (!this.searchTerm) {
            this.filteredProducts = [...this.products];
        } else {
            this.filteredProducts = this.products.filter(p =>
                (p.name && p.name.toLowerCase().includes(this.searchTerm)) ||
                (p.code && p.code.toLowerCase().includes(this.searchTerm)) ||
                (p.sku && p.sku.toLowerCase().includes(this.searchTerm))
            );
        }

        const listContainer = this.modalElement?.querySelector('#inventoryProductsList');
        if (listContainer) {
            listContainer.innerHTML = this.renderProductsList();
        }
    }

    updateSelectedUI() {
        const selectedContainer = this.modalElement?.querySelector('#inventorySelected');
        if (selectedContainer) {
            selectedContainer.innerHTML = this.renderSelectedProducts();
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        const addBtn = this.modalElement?.querySelector('#btnAddSelectedProducts span');
        if (addBtn) {
            addBtn.textContent = `Thêm ${this.selectedProducts.length} sản phẩm`;
        }

        // Update list checkboxes
        const listContainer = this.modalElement?.querySelector('#inventoryProductsList');
        if (listContainer) {
            listContainer.innerHTML = this.renderProductsList();
        }
    }

    bindEvents() {
        // Close buttons
        this.modalElement.querySelector('#btnCloseInventory')?.addEventListener('click', () => this.close());
        this.modalElement.querySelector('#btnCancelInventory')?.addEventListener('click', () => this.close());

        // Overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) this.close();
        });

        // Search
        this.modalElement.querySelector('#inventorySearchInput')?.addEventListener('input', (e) => {
            this.filterProducts(e.target.value);
        });

        // Select products
        this.modalElement.querySelector('#inventoryProductsList')?.addEventListener('click', (e) => {
            const row = e.target.closest('tr[data-product-id]');
            if (!row) return;

            const productId = row.dataset.productId;
            const product = this.products.find(p => p.id === productId);
            if (!product) return;

            const index = this.selectedProducts.findIndex(p => p.id === productId);
            if (index >= 0) {
                this.selectedProducts.splice(index, 1);
            } else {
                this.selectedProducts.push(product);
            }

            this.updateSelectedUI();
        });

        // Remove selected
        this.modalElement.querySelector('#inventorySelected')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-remove-tag');
            if (!btn) return;

            const productId = btn.dataset.productId;
            const index = this.selectedProducts.findIndex(p => p.id === productId);
            if (index >= 0) {
                this.selectedProducts.splice(index, 1);
                this.updateSelectedUI();
            }
        });

        // Add selected
        this.modalElement.querySelector('#btnAddSelectedProducts')?.addEventListener('click', () => {
            if (this.selectedProducts.length > 0 && this.onSelect) {
                this.onSelect(this.selectedProducts);
                this.close();
            }
        });
    }
}

// ========================================
// SHIPPING FEE DIALOG
// ========================================

class ShippingFeeDialog {
    constructor() {
        this.modalElement = null;
        this.currentFee = 0;
        this.onSave = null;
    }

    /**
     * Open shipping fee dialog
     * @param {Object} options - { currentFee, onSave }
     */
    open(options = {}) {
        this.currentFee = options.currentFee || 0;
        this.onSave = options.onSave;

        this.render();
        this.show();
    }

    close() {
        if (this.modalElement) {
            this.modalElement.classList.add('modal-overlay--exit');
            setTimeout(() => {
                this.modalElement.remove();
                this.modalElement = null;
            }, 200);
        }
    }

    show() {
        if (this.modalElement) {
            this.modalElement.style.display = 'flex';
            // Focus input
            setTimeout(() => {
                this.modalElement.querySelector('#shippingFeeInput')?.focus();
            }, 100);
        }
    }

    render() {
        if (this.modalElement) {
            this.modalElement.remove();
        }

        this.modalElement = document.createElement('div');
        this.modalElement.className = 'modal-overlay';
        this.modalElement.innerHTML = `
            <div class="modal modal--xs">
                <div class="modal__header">
                    <h2 class="modal__title">Phí vận chuyển</h2>
                    <button type="button" class="modal__close" id="btnCloseShipping">
                        <i data-lucide="x"></i>
                    </button>
                </div>

                <div class="modal__body">
                    <div class="form-group">
                        <label class="form-label">Nhập phí ship (VND)</label>
                        <input type="text" class="form-input form-input--lg form-input--number"
                               id="shippingFeeInput"
                               placeholder="0"
                               value="${this.formatNumber(this.currentFee)}">
                    </div>

                    <div class="shipping-presets">
                        <button class="btn btn-sm btn-outline" data-amount="0">0</button>
                        <button class="btn btn-sm btn-outline" data-amount="20000">20.000</button>
                        <button class="btn btn-sm btn-outline" data-amount="30000">30.000</button>
                        <button class="btn btn-sm btn-outline" data-amount="50000">50.000</button>
                    </div>
                </div>

                <div class="modal__footer">
                    <button class="btn btn-outline" id="btnCancelShipping">Hủy</button>
                    <button class="btn btn-primary" id="btnSaveShipping">
                        <i data-lucide="check"></i>
                        <span>Xác nhận</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        this.bindEvents();
    }

    formatNumber(value) {
        if (!value || value === 0) return '';
        return value.toLocaleString('vi-VN');
    }

    parseNumber(value) {
        if (!value) return 0;
        return parseInt(value.replace(/[^\d]/g, ''), 10) || 0;
    }

    bindEvents() {
        const input = this.modalElement.querySelector('#shippingFeeInput');

        // Close buttons
        this.modalElement.querySelector('#btnCloseShipping')?.addEventListener('click', () => this.close());
        this.modalElement.querySelector('#btnCancelShipping')?.addEventListener('click', () => this.close());

        // Overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) this.close();
        });

        // Format input
        input?.addEventListener('input', (e) => {
            const value = this.parseNumber(e.target.value);
            e.target.value = value ? value.toLocaleString('vi-VN') : '';
        });

        // Preset buttons
        this.modalElement.querySelectorAll('[data-amount]').forEach(btn => {
            btn.addEventListener('click', () => {
                const amount = parseInt(btn.dataset.amount, 10);
                input.value = amount ? amount.toLocaleString('vi-VN') : '0';
            });
        });

        // Save
        this.modalElement.querySelector('#btnSaveShipping')?.addEventListener('click', () => {
            const fee = this.parseNumber(input.value);
            if (this.onSave) {
                this.onSave(fee);
            }
            this.close();
        });

        // Enter key
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.modalElement.querySelector('#btnSaveShipping')?.click();
            }
        });
    }
}

// ========================================
// EXPORT DIALOG INSTANCES
// ========================================

window.orderDetailDialog = new OrderDetailDialog();
window.variantGeneratorDialog = new VariantGeneratorDialog();
window.settingsDialog = new SettingsDialog();
window.inventoryPickerDialog = new InventoryPickerDialog();
window.shippingFeeDialog = new ShippingFeeDialog();

console.log('[Purchase Orders] Dialogs loaded successfully');
