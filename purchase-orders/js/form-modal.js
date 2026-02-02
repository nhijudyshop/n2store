/**
 * PURCHASE ORDERS MODULE - FORM MODAL
 * File: form-modal.js
 * Purpose: Modal for creating and editing purchase orders
 */

// ========================================
// FORM MODAL CLASS
// ========================================
class PurchaseOrderFormModal {
    constructor() {
        this.modalElement = null;
        this.formElement = null;
        this.order = null;
        this.isEdit = false;
        this.onSubmit = null;
        this.onCancel = null;

        // Form state
        this.formData = {
            supplier: null,
            orderDate: new Date(),
            invoiceAmount: 0,
            invoiceImages: [],
            notes: '',
            discountAmount: 0,
            shippingFee: 0,
            items: []
        };

        // Item counter for unique IDs
        this.itemCounter = 0;
    }

    // ========================================
    // MODAL LIFECYCLE
    // ========================================

    /**
     * Open modal for creating new order
     * @param {Object} options - Modal options
     */
    openCreate(options = {}) {
        console.log('[FormModal] openCreate called');
        try {
            this.isEdit = false;
            this.order = null;
            this.resetFormData();

            // Add one empty item by default
            this.addItem();

            console.log('[FormModal] Calling render()');
            this.render();
            console.log('[FormModal] Calling show()');
            this.show();

            this.onSubmit = options.onSubmit;
            this.onCancel = options.onCancel;
            console.log('[FormModal] Modal should be visible now');
        } catch (error) {
            console.error('[FormModal] Error in openCreate:', error);
            window.purchaseOrderUI?.showToast('Không thể mở form: ' + error.message, 'error');
        }
    }

    /**
     * Open modal for editing existing order
     * @param {Object} order - Order to edit
     * @param {Object} options - Modal options
     */
    openEdit(order, options = {}) {
        this.isEdit = true;
        this.order = order;
        this.loadOrderData(order);

        this.render();
        this.show();

        this.onSubmit = options.onSubmit;
        this.onCancel = options.onCancel;
    }

    /**
     * Close modal
     */
    close() {
        if (this.modalElement) {
            this.modalElement.classList.add('modal-overlay--exit');
            setTimeout(() => {
                this.modalElement.remove();
                this.modalElement = null;
                this.formElement = null;
            }, 200);
        }
    }

    /**
     * Show modal
     */
    show() {
        if (this.modalElement) {
            this.modalElement.style.display = 'flex';
            // Focus first input
            setTimeout(() => {
                const firstInput = this.formElement?.querySelector('input:not([type="hidden"])');
                firstInput?.focus();
            }, 100);
        }
    }

    // ========================================
    // DATA MANAGEMENT
    // ========================================

    /**
     * Reset form data to defaults
     */
    resetFormData() {
        this.formData = {
            supplier: null,
            orderDate: new Date(),
            invoiceAmount: 0,
            invoiceImages: [],
            notes: '',
            discountAmount: 0,
            shippingFee: 0,
            items: []
        };
        this.itemCounter = 0;
    }

    /**
     * Load order data into form
     * @param {Object} order - Order data
     */
    loadOrderData(order) {
        this.formData = {
            supplier: order.supplier || null,
            orderDate: order.orderDate?.toDate ? order.orderDate.toDate() : new Date(order.orderDate),
            invoiceAmount: order.invoiceAmount || 0,
            invoiceImages: order.invoiceImages || [],
            notes: order.notes || '',
            discountAmount: order.discountAmount || 0,
            shippingFee: order.shippingFee || 0,
            items: (order.items || []).map((item, index) => ({
                ...item,
                id: item.id || `item_${index}`
            }))
        };
        this.itemCounter = this.formData.items.length;
    }

    /**
     * Get form data for submission
     * @returns {Object}
     */
    getFormData() {
        return {
            ...this.formData,
            orderDate: firebase.firestore.Timestamp.fromDate(this.formData.orderDate)
        };
    }

    // ========================================
    // ITEM MANAGEMENT
    // ========================================

    /**
     * Add new empty item
     */
    addItem() {
        const config = window.PurchaseOrderConfig;
        const newItem = {
            id: config.generateUUID(),
            position: this.formData.items.length + 1,
            productCode: '',
            productName: '',
            variant: '',
            productImages: [],
            priceImages: [],
            purchasePrice: 0,
            sellingPrice: 0,
            quantity: 1,
            subtotal: 0,
            notes: ''
        };

        this.formData.items.push(newItem);
        this.itemCounter++;

        return newItem;
    }

    /**
     * Remove item by ID
     * @param {string} itemId
     */
    removeItem(itemId) {
        this.formData.items = this.formData.items.filter(item => item.id !== itemId);
        // Re-calculate positions
        this.formData.items.forEach((item, index) => {
            item.position = index + 1;
        });
    }

    /**
     * Copy item
     * @param {string} itemId
     */
    copyItem(itemId) {
        const config = window.PurchaseOrderConfig;
        const sourceItem = this.formData.items.find(item => item.id === itemId);
        if (!sourceItem) return;

        const newItem = {
            ...sourceItem,
            id: config.generateUUID(),
            position: this.formData.items.length + 1
        };

        this.formData.items.push(newItem);
        this.itemCounter++;
    }

    /**
     * Update item field
     * @param {string} itemId
     * @param {string} field
     * @param {*} value
     */
    updateItem(itemId, field, value) {
        const item = this.formData.items.find(i => i.id === itemId);
        if (!item) return;

        item[field] = value;

        // Recalculate subtotal
        if (field === 'purchasePrice' || field === 'quantity') {
            item.subtotal = (item.purchasePrice || 0) * (item.quantity || 0);
        }
    }

    // ========================================
    // CALCULATIONS
    // ========================================

    /**
     * Calculate totals
     * @returns {Object}
     */
    calculateTotals() {
        const totalQuantity = this.formData.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
        const totalAmount = this.formData.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
        const finalAmount = totalAmount - (this.formData.discountAmount || 0) + (this.formData.shippingFee || 0);

        return {
            totalQuantity,
            totalAmount,
            finalAmount
        };
    }

    // ========================================
    // RENDER FUNCTIONS
    // ========================================

    /**
     * Render modal
     */
    render() {
        console.log('[FormModal] render() starting');

        // Remove existing modal
        if (this.modalElement) {
            this.modalElement.remove();
        }

        // Create modal element
        this.modalElement = document.createElement('div');
        this.modalElement.className = 'modal-overlay';
        this.modalElement.id = 'purchaseOrderModal';

        const title = this.isEdit ? 'Chỉnh sửa đơn hàng' : 'Tạo đơn đặt hàng';

        console.log('[FormModal] Building HTML...');
        const headerHTML = this.renderFormHeader();
        console.log('[FormModal] Header rendered');
        const tableHTML = this.renderItemsTable();
        console.log('[FormModal] Table rendered');
        const footerHTML = this.renderFormFooter();
        console.log('[FormModal] Footer rendered');

        this.modalElement.innerHTML = `
            <div class="modal modal--xl">
                <div class="modal__header">
                    <h2 class="modal__title">${title}</h2>
                    <button type="button" class="modal__close" id="btnModalClose">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <form id="purchaseOrderForm" class="modal__body">
                    ${headerHTML}
                    ${tableHTML}
                    ${footerHTML}
                </form>
            </div>
        `;

        document.body.appendChild(this.modalElement);
        console.log('[FormModal] Modal appended to body');

        this.formElement = this.modalElement.querySelector('#purchaseOrderForm');

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Bind events
        this.bindEvents();
        console.log('[FormModal] render() complete');
    }

    /**
     * Render form header (supplier, date, invoice)
     * @returns {string} HTML string
     */
    renderFormHeader() {
        const config = window.PurchaseOrderConfig;

        return `
            <div class="form-header">
                <div class="form-row">
                    <div class="form-group form-group--supplier">
                        <label class="form-label form-label--required">Nhà cung cấp</label>
                        <input type="text" id="supplierInput" class="form-input"
                               placeholder="Nhập tên nhà cung cấp"
                               value="${this.formData.supplier?.name || ''}"
                               data-supplier-id="${this.formData.supplier?.id || ''}"
                               data-supplier-code="${this.formData.supplier?.code || ''}">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Ngày đặt hàng</label>
                        <div class="input-icon">
                            <i data-lucide="calendar"></i>
                            <input type="date" id="orderDateInput" class="form-input"
                                   value="${this.formatDateForInput(this.formData.orderDate)}">
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Số tiền hóa đơn (VND)</label>
                        <input type="text" id="invoiceAmountInput" class="form-input form-input--number"
                               placeholder="Nhập số tiền VND"
                               value="${this.formatNumberInput(this.formData.invoiceAmount)}">
                    </div>

                    <div class="form-group form-group--image">
                        <label class="form-label">Ảnh hóa đơn</label>
                        <div class="image-upload-area" id="invoiceImageUpload">
                            ${this.renderImageThumbnails(this.formData.invoiceImages, 'invoice')}
                            <button type="button" class="btn-upload" id="btnUploadInvoice">
                                <i data-lucide="image-plus"></i>
                                <span>Ctrl+V</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group form-group--search">
                        <label class="form-label">Danh sách sản phẩm</label>
                        <div class="input-icon">
                            <i data-lucide="search"></i>
                            <input type="text" id="productSearchInput" class="form-input"
                                   placeholder="Tìm kiếm sản phẩm theo tên...">
                        </div>
                    </div>

                    <div class="form-group form-group--notes">
                        <label class="form-label">Ghi chú thêm cho đơn hàng...</label>
                        <input type="text" id="orderNotesInput" class="form-input"
                               placeholder="Ghi chú thêm cho đơn hàng..."
                               value="${this.formData.notes || ''}">
                    </div>

                    <div class="form-group form-group--settings">
                        <button type="button" class="btn btn-icon" id="btnSettings" title="Cài đặt">
                            <i data-lucide="settings"></i>
                        </button>
                    </div>

                    <div class="form-group">
                        <button type="button" class="btn btn-outline" id="btnAddProduct">
                            <i data-lucide="plus"></i>
                            <span>Thêm sản phẩm</span>
                        </button>
                    </div>

                    <div class="form-group">
                        <button type="button" class="btn btn-primary" id="btnChooseFromInventory">
                            <i data-lucide="package"></i>
                            <span>Chọn từ Kho SP</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render items table
     * @returns {string} HTML string
     */
    renderItemsTable() {
        return `
            <div class="items-table-wrapper">
                <table class="items-table">
                    <thead>
                        <tr>
                            <th class="col-stt">STT</th>
                            <th class="col-product">Tên sản phẩm</th>
                            <th class="col-variant">Biến thể</th>
                            <th class="col-code">Mã sản phẩm</th>
                            <th class="col-qty">SL</th>
                            <th class="col-purchase">Giá mua (VND)</th>
                            <th class="col-selling">Giá bán (VND)</th>
                            <th class="col-subtotal">Thành tiền (VND)</th>
                            <th class="col-image">Hình ảnh sản phẩm</th>
                            <th class="col-price-image">Hình ảnh Giá mua</th>
                            <th class="col-actions">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody id="itemsTableBody">
                        ${this.renderItemRows()}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Render item rows
     * @returns {string} HTML string
     */
    renderItemRows() {
        if (this.formData.items.length === 0) {
            return `
                <tr class="items-table__empty">
                    <td colspan="11">
                        <div class="empty-items">
                            <i data-lucide="package-open"></i>
                            <p>Chưa có sản phẩm nào. Nhấn "Thêm sản phẩm" để bắt đầu.</p>
                        </div>
                    </td>
                </tr>
            `;
        }

        return this.formData.items.map((item, index) => this.renderItemRow(item, index)).join('');
    }

    /**
     * Render single item row
     * @param {Object} item - Item data
     * @param {number} index - Item index
     * @returns {string} HTML string
     */
    renderItemRow(item, index) {
        const config = window.PurchaseOrderConfig;

        return `
            <tr class="item-row" data-item-id="${item.id}">
                <td class="col-stt">${index + 1}</td>

                <td class="col-product">
                    <input type="text" class="form-input item-input"
                           data-field="productName"
                           placeholder="Nhập tên sản phẩm"
                           value="${item.productName || ''}">
                </td>

                <td class="col-variant">
                    <button type="button" class="btn btn-sm btn-outline btn-variant" data-action="edit-variant">
                        ${item.variant || 'Nhấn để tạo biến thể'}
                    </button>
                </td>

                <td class="col-code">
                    <div class="input-with-icon">
                        <input type="text" class="form-input form-input--sm item-input"
                               data-field="productCode"
                               placeholder="Mã SP"
                               value="${item.productCode || ''}">
                        <button type="button" class="btn-icon btn-sm" title="Chọn sản phẩm">
                            <i data-lucide="edit"></i>
                        </button>
                    </div>
                </td>

                <td class="col-qty">
                    <input type="number" class="form-input form-input--number form-input--sm item-input"
                           data-field="quantity"
                           min="1" max="9999"
                           value="${item.quantity || 1}">
                </td>

                <td class="col-purchase">
                    <input type="text" class="form-input form-input--number form-input--sm item-input price-input"
                           data-field="purchasePrice"
                           placeholder="0"
                           value="${this.formatNumberInput(item.purchasePrice)}">
                </td>

                <td class="col-selling">
                    <input type="text" class="form-input form-input--number form-input--sm item-input price-input"
                           data-field="sellingPrice"
                           placeholder="0"
                           value="${this.formatNumberInput(item.sellingPrice)}">
                </td>

                <td class="col-subtotal">
                    <span class="subtotal-value">${config.formatVND(item.subtotal || 0)}</span>
                </td>

                <td class="col-image">
                    <div class="image-upload-mini" data-type="product" data-item-id="${item.id}">
                        ${this.renderMiniImageUpload(item.productImages, 'product', item.id)}
                    </div>
                </td>

                <td class="col-price-image">
                    <div class="image-upload-mini" data-type="price" data-item-id="${item.id}">
                        ${this.renderMiniImageUpload(item.priceImages, 'price', item.id)}
                    </div>
                </td>

                <td class="col-actions">
                    <div class="item-actions">
                        <button type="button" class="btn-icon btn-sm" title="Lưu" data-action="save-item">
                            <i data-lucide="save"></i>
                        </button>
                        <button type="button" class="btn-icon btn-sm" title="Sao chép" data-action="copy-item">
                            <i data-lucide="copy"></i>
                        </button>
                        <button type="button" class="btn-icon btn-sm btn-danger" title="Xóa" data-action="delete-item">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    /**
     * Render mini image upload
     * @param {Array} images - Array of image URLs
     * @param {string} type - Image type (product/price)
     * @param {string} itemId - Item ID
     * @returns {string} HTML string
     */
    renderMiniImageUpload(images, type, itemId) {
        if (!images || images.length === 0) {
            return `
                <button type="button" class="btn-upload-mini" data-action="upload-${type}" data-item-id="${itemId}">
                    <i data-lucide="image-plus"></i>
                    <span>Ctrl+V</span>
                </button>
            `;
        }

        return `
            <div class="mini-thumbnails">
                <img src="${images[0]}" alt="${type}" class="mini-thumb">
                ${images.length > 1 ? `<span class="thumb-count">+${images.length - 1}</span>` : ''}
            </div>
        `;
    }

    /**
     * Render image thumbnails
     * @param {Array} images - Array of image URLs
     * @param {string} type - Image type
     * @returns {string} HTML string
     */
    renderImageThumbnails(images, type) {
        if (!images || images.length === 0) return '';

        return images.map((url, index) => `
            <div class="thumb-item" data-index="${index}">
                <img src="${url}" alt="${type}">
                <button type="button" class="thumb-remove" data-action="remove-image" data-type="${type}" data-index="${index}">
                    <i data-lucide="x"></i>
                </button>
            </div>
        `).join('');
    }

    /**
     * Render form footer (totals and buttons)
     * @returns {string} HTML string
     */
    renderFormFooter() {
        const config = window.PurchaseOrderConfig;
        const totals = this.calculateTotals();

        return `
            <div class="form-footer">
                <div class="form-totals">
                    <div class="total-item">
                        <span class="total-label">Tổng số lượng:</span>
                        <span class="total-value" id="totalQuantity">${totals.totalQuantity}</span>
                    </div>

                    <div class="total-item">
                        <span class="total-label">Tổng tiền:</span>
                        <span class="total-value" id="totalAmount">${config.formatVND(totals.totalAmount)}</span>
                    </div>

                    <div class="total-item total-item--input">
                        <span class="total-label">Giảm giá:</span>
                        <input type="text" id="discountInput" class="form-input form-input--sm form-input--number"
                               value="${this.formatNumberInput(this.formData.discountAmount)}"
                               placeholder="0">
                    </div>

                    <div class="total-item">
                        <button type="button" class="btn btn-sm btn-outline" id="btnAddShipping">
                            <i data-lucide="truck"></i>
                            <span>Thêm tiền ship</span>
                        </button>
                    </div>
                </div>

                <div class="form-final">
                    <span class="final-label">THÀNH TIỀN:</span>
                    <span class="final-value" id="finalAmount">${config.formatVND(totals.finalAmount)}</span>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-outline" id="btnCancel">Hủy</button>
                    <button type="button" class="btn btn-secondary" id="btnSaveDraft">Lưu nháp</button>
                    <button type="submit" class="btn btn-primary" id="btnSubmit">
                        ${this.isEdit ? 'Cập nhật' : 'Tạo đơn hàng'}
                    </button>
                </div>
            </div>
        `;
    }

    // ========================================
    // EVENT BINDING
    // ========================================

    /**
     * Bind all event handlers
     */
    bindEvents() {
        if (!this.modalElement || !this.formElement) return;

        // Close button
        this.modalElement.querySelector('#btnModalClose')?.addEventListener('click', () => this.close());

        // Close on overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                this.close();
            }
        });

        // Cancel button
        this.modalElement.querySelector('#btnCancel')?.addEventListener('click', () => {
            this.onCancel?.();
            this.close();
        });

        // Save draft button
        this.modalElement.querySelector('#btnSaveDraft')?.addEventListener('click', () => {
            this.handleSaveDraft();
        });

        // Submit form
        this.formElement.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        // Add product button
        this.modalElement.querySelector('#btnAddProduct')?.addEventListener('click', () => {
            this.addItem();
            this.refreshItemsTable();
        });

        // Settings button
        this.modalElement.querySelector('#btnSettings')?.addEventListener('click', () => {
            this.openSettings();
        });

        // Choose from inventory button
        this.modalElement.querySelector('#btnChooseFromInventory')?.addEventListener('click', () => {
            this.openInventoryPicker();
        });

        // Shipping fee button
        this.modalElement.querySelector('#btnAddShipping')?.addEventListener('click', () => {
            this.openShippingFeeDialog();
        });

        // Setup image paste handler
        this.setupImagePasteHandler();

        // Item table events (delegation)
        const itemsBody = this.modalElement.querySelector('#itemsTableBody');
        if (itemsBody) {
            // Input changes
            itemsBody.addEventListener('input', (e) => {
                const input = e.target.closest('.item-input');
                if (!input) return;

                const row = input.closest('.item-row');
                const itemId = row?.dataset.itemId;
                const field = input.dataset.field;

                if (itemId && field) {
                    let value = input.value;

                    // Parse numbers
                    if (input.classList.contains('price-input')) {
                        value = this.parseNumberInput(value);
                    } else if (field === 'quantity') {
                        value = parseInt(value, 10) || 1;
                    }

                    this.updateItem(itemId, field, value);
                    this.updateSubtotal(row);
                    this.updateTotals();
                }
            });

            // Action buttons
            itemsBody.addEventListener('click', (e) => {
                const button = e.target.closest('[data-action]');
                if (!button) return;

                const row = button.closest('.item-row');
                const itemId = row?.dataset.itemId;
                const action = button.dataset.action;

                switch (action) {
                    case 'delete-item':
                        if (itemId) {
                            this.removeItem(itemId);
                            this.refreshItemsTable();
                            this.updateTotals();
                        }
                        break;
                    case 'copy-item':
                        if (itemId) {
                            this.copyItem(itemId);
                            this.refreshItemsTable();
                        }
                        break;
                    case 'save-item':
                        // Save feedback
                        button.classList.add('btn-success');
                        setTimeout(() => button.classList.remove('btn-success'), 500);
                        break;
                    case 'edit-variant':
                        if (itemId) {
                            this.openVariantGenerator(itemId);
                        }
                        break;
                }
            });
        }

        // Discount input
        const discountInput = this.modalElement.querySelector('#discountInput');
        if (discountInput) {
            discountInput.addEventListener('input', (e) => {
                this.formData.discountAmount = this.parseNumberInput(e.target.value);
                this.updateTotals();
            });
        }

        // Order date input
        const orderDateInput = this.modalElement.querySelector('#orderDateInput');
        if (orderDateInput) {
            orderDateInput.addEventListener('change', (e) => {
                this.formData.orderDate = new Date(e.target.value);
            });
        }

        // Supplier input
        const supplierInput = this.modalElement.querySelector('#supplierInput');
        if (supplierInput) {
            supplierInput.addEventListener('change', (e) => {
                // Simple text-based supplier for now
                this.formData.supplier = {
                    id: e.target.dataset.supplierId || window.PurchaseOrderConfig.generateUUID(),
                    code: e.target.dataset.supplierCode || e.target.value.substring(0, 3).toUpperCase(),
                    name: e.target.value
                };
            });
        }

        // Notes input
        const notesInput = this.modalElement.querySelector('#orderNotesInput');
        if (notesInput) {
            notesInput.addEventListener('input', (e) => {
                this.formData.notes = e.target.value;
            });
        }

        // Invoice amount input
        const invoiceAmountInput = this.modalElement.querySelector('#invoiceAmountInput');
        if (invoiceAmountInput) {
            invoiceAmountInput.addEventListener('input', (e) => {
                this.formData.invoiceAmount = this.parseNumberInput(e.target.value);
            });
        }

        // Escape key to close
        document.addEventListener('keydown', this.handleKeydown.bind(this));
    }

    /**
     * Handle keydown events
     * @param {KeyboardEvent} e
     */
    handleKeydown(e) {
        if (e.key === 'Escape' && this.modalElement) {
            this.close();
        }
    }

    /**
     * Setup image paste handler (Ctrl+V)
     */
    setupImagePasteHandler() {
        document.addEventListener('paste', this.handlePaste.bind(this));
    }

    /**
     * Handle paste event for images
     * @param {ClipboardEvent} e
     */
    async handlePaste(e) {
        if (!this.modalElement) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        // Find image in clipboard
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();

                const blob = item.getAsFile();
                if (!blob) continue;

                // Determine which image field is focused
                const focusedElement = document.activeElement;
                const imageUploadArea = focusedElement?.closest('.image-upload-area, .image-upload-mini');

                try {
                    const imageUrl = await this.uploadImage(blob);

                    if (imageUploadArea) {
                        const type = imageUploadArea.dataset.type;
                        const itemId = imageUploadArea.dataset.itemId;

                        if (type === 'invoice' || imageUploadArea.id === 'invoiceImageUpload') {
                            this.formData.invoiceImages.push(imageUrl);
                            this.refreshInvoiceImages();
                        } else if (type === 'product' && itemId) {
                            const item = this.formData.items.find(i => i.id === itemId);
                            if (item) {
                                item.productImages = item.productImages || [];
                                item.productImages.push(imageUrl);
                                this.refreshItemImages(itemId, 'product');
                            }
                        } else if (type === 'price' && itemId) {
                            const item = this.formData.items.find(i => i.id === itemId);
                            if (item) {
                                item.priceImages = item.priceImages || [];
                                item.priceImages.push(imageUrl);
                                this.refreshItemImages(itemId, 'price');
                            }
                        }
                    } else {
                        // Default: add to invoice images
                        this.formData.invoiceImages.push(imageUrl);
                        this.refreshInvoiceImages();
                    }

                    window.purchaseOrderUI?.showToast('Đã thêm hình ảnh', 'success');
                } catch (error) {
                    console.error('Error uploading pasted image:', error);
                    window.purchaseOrderUI?.showToast('Không thể tải lên hình ảnh', 'error');
                }

                break;
            }
        }
    }

    /**
     * Upload image to Firebase Storage
     * @param {Blob} blob - Image blob
     * @returns {Promise<string>} Image URL
     */
    async uploadImage(blob) {
        const storage = firebase.storage();
        const fileName = `purchase-orders/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
        const ref = storage.ref(fileName);

        await ref.put(blob);
        return await ref.getDownloadURL();
    }

    /**
     * Refresh invoice images display
     */
    refreshInvoiceImages() {
        const container = this.modalElement?.querySelector('#invoiceImageUpload');
        if (!container) return;

        // Keep the upload button and add thumbnails
        const uploadBtn = container.querySelector('.btn-upload');
        container.innerHTML = this.renderImageThumbnails(this.formData.invoiceImages, 'invoice');
        if (uploadBtn) {
            container.appendChild(uploadBtn.cloneNode(true));
        } else {
            container.innerHTML += `
                <button type="button" class="btn-upload" id="btnUploadInvoice">
                    <i data-lucide="image-plus"></i>
                    <span>Ctrl+V</span>
                </button>
            `;
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Refresh item images display
     * @param {string} itemId
     * @param {string} type - 'product' or 'price'
     */
    refreshItemImages(itemId, type) {
        const item = this.formData.items.find(i => i.id === itemId);
        if (!item) return;

        const container = this.modalElement?.querySelector(
            `.image-upload-mini[data-type="${type}"][data-item-id="${itemId}"]`
        );
        if (!container) return;

        const images = type === 'product' ? item.productImages : item.priceImages;
        container.innerHTML = this.renderMiniImageUpload(images, type, itemId);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Open variant generator dialog
     * @param {string} itemId
     */
    openVariantGenerator(itemId) {
        const item = this.formData.items.find(i => i.id === itemId);
        if (!item) return;

        window.variantGeneratorDialog.open({
            baseProduct: {
                productName: item.productName,
                productCode: item.productCode,
                purchasePrice: item.purchasePrice,
                sellingPrice: item.sellingPrice,
                productImages: item.productImages,
                priceImages: item.priceImages
            },
            onGenerate: (variants, baseProduct) => {
                // Remove original item
                this.removeItem(itemId);

                // Add variant items
                variants.forEach(variant => {
                    const newItem = this.addItem();
                    newItem.productName = baseProduct.productName;
                    newItem.productCode = baseProduct.productCode;
                    newItem.variant = variant;
                    newItem.purchasePrice = baseProduct.purchasePrice;
                    newItem.sellingPrice = baseProduct.sellingPrice;
                    newItem.productImages = [...(baseProduct.productImages || [])];
                    newItem.priceImages = [...(baseProduct.priceImages || [])];
                    newItem.subtotal = (newItem.purchasePrice || 0) * (newItem.quantity || 1);
                });

                this.refreshItemsTable();
                this.updateTotals();

                window.purchaseOrderUI?.showToast(`Đã tạo ${variants.length} biến thể`, 'success');
            }
        });
    }

    /**
     * Open settings dialog
     */
    openSettings() {
        window.settingsDialog.open({
            settings: this.validationSettings || {},
            onSave: (settings) => {
                this.validationSettings = settings;
                window.purchaseOrderUI?.showToast('Đã lưu cài đặt', 'success');
            }
        });
    }

    /**
     * Open inventory picker dialog
     */
    openInventoryPicker() {
        window.inventoryPickerDialog.open({
            onSelect: (products) => {
                products.forEach(product => {
                    const newItem = this.addItem();
                    newItem.productName = product.name;
                    newItem.productCode = product.code || product.sku;
                    newItem.sellingPrice = product.price || 0;
                    newItem.productImages = product.images || [];
                });

                this.refreshItemsTable();

                window.purchaseOrderUI?.showToast(`Đã thêm ${products.length} sản phẩm`, 'success');
            }
        });
    }

    /**
     * Open shipping fee dialog
     */
    openShippingFeeDialog() {
        window.shippingFeeDialog.open({
            currentFee: this.formData.shippingFee || 0,
            onSave: (fee) => {
                this.formData.shippingFee = fee;
                this.updateTotals();
            }
        });
    }

    // ========================================
    // FORM HANDLERS
    // ========================================

    /**
     * Handle form submission
     */
    async handleSubmit() {
        const config = window.PurchaseOrderConfig;
        const validation = window.PurchaseOrderValidation;
        const ui = window.purchaseOrderUI;

        // Collect form data
        this.collectFormData();

        // Validate
        const orderData = this.getFormData();
        orderData.status = config.OrderStatus.AWAITING_PURCHASE;

        const result = validation.validateOrder(orderData);

        if (!result.isValid) {
            // Show validation errors
            ui.showToast(result.errors[0]?.message || 'Vui lòng kiểm tra lại thông tin', 'error');
            this.highlightErrors(result.errors);
            return;
        }

        try {
            await this.onSubmit?.(orderData);
            this.close();
        } catch (error) {
            ui.showToast(error.userMessage || 'Không thể lưu đơn hàng', 'error');
        }
    }

    /**
     * Handle save as draft
     */
    async handleSaveDraft() {
        const config = window.PurchaseOrderConfig;
        const ui = window.purchaseOrderUI;

        // Collect form data
        this.collectFormData();

        const orderData = this.getFormData();
        orderData.status = config.OrderStatus.DRAFT;

        // Skip validation for draft (minimal check)
        if (!this.formData.supplier?.name) {
            ui.showToast('Vui lòng nhập tên nhà cung cấp', 'warning');
            return;
        }

        try {
            await this.onSubmit?.(orderData);
            this.close();
        } catch (error) {
            ui.showToast(error.userMessage || 'Không thể lưu nháp', 'error');
        }
    }

    /**
     * Collect form data from inputs
     */
    collectFormData() {
        // Supplier
        const supplierInput = this.modalElement?.querySelector('#supplierInput');
        if (supplierInput && supplierInput.value) {
            this.formData.supplier = {
                id: supplierInput.dataset.supplierId || window.PurchaseOrderConfig.generateUUID(),
                code: supplierInput.dataset.supplierCode || supplierInput.value.substring(0, 3).toUpperCase(),
                name: supplierInput.value
            };
        }

        // Order date
        const orderDateInput = this.modalElement?.querySelector('#orderDateInput');
        if (orderDateInput?.value) {
            this.formData.orderDate = new Date(orderDateInput.value);
        }

        // Invoice amount
        const invoiceAmountInput = this.modalElement?.querySelector('#invoiceAmountInput');
        if (invoiceAmountInput) {
            this.formData.invoiceAmount = this.parseNumberInput(invoiceAmountInput.value);
        }

        // Notes
        const notesInput = this.modalElement?.querySelector('#orderNotesInput');
        if (notesInput) {
            this.formData.notes = notesInput.value;
        }

        // Discount
        const discountInput = this.modalElement?.querySelector('#discountInput');
        if (discountInput) {
            this.formData.discountAmount = this.parseNumberInput(discountInput.value);
        }

        // Items (already collected via input events)
    }

    /**
     * Highlight validation errors
     * @param {Array} errors
     */
    highlightErrors(errors) {
        // Clear previous errors
        this.modalElement?.querySelectorAll('.is-invalid').forEach(el => {
            el.classList.remove('is-invalid');
        });

        // Highlight fields with errors
        errors.forEach(error => {
            const field = error.field;

            // Handle item field errors
            if (field.startsWith('items[')) {
                const match = field.match(/items\[(\d+)\]\.(\w+)/);
                if (match) {
                    const itemIndex = parseInt(match[1], 10);
                    const itemField = match[2];
                    const item = this.formData.items[itemIndex];
                    if (item) {
                        const input = this.modalElement?.querySelector(
                            `.item-row[data-item-id="${item.id}"] .item-input[data-field="${itemField}"]`
                        );
                        input?.classList.add('is-invalid');
                    }
                }
            } else {
                // Handle header field errors
                const input = this.modalElement?.querySelector(`#${field}Input, [name="${field}"]`);
                input?.classList.add('is-invalid');
            }
        });
    }

    // ========================================
    // UI UPDATE FUNCTIONS
    // ========================================

    /**
     * Refresh items table
     */
    refreshItemsTable() {
        const tbody = this.modalElement?.querySelector('#itemsTableBody');
        if (!tbody) return;

        tbody.innerHTML = this.renderItemRows();

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Update subtotal display for a row
     * @param {HTMLElement} row
     */
    updateSubtotal(row) {
        const config = window.PurchaseOrderConfig;
        const itemId = row?.dataset.itemId;
        const item = this.formData.items.find(i => i.id === itemId);

        if (item) {
            const subtotalEl = row.querySelector('.subtotal-value');
            if (subtotalEl) {
                subtotalEl.textContent = config.formatVND(item.subtotal);
            }
        }
    }

    /**
     * Update totals display
     */
    updateTotals() {
        const config = window.PurchaseOrderConfig;
        const totals = this.calculateTotals();

        const totalQtyEl = this.modalElement?.querySelector('#totalQuantity');
        const totalAmountEl = this.modalElement?.querySelector('#totalAmount');
        const finalAmountEl = this.modalElement?.querySelector('#finalAmount');

        if (totalQtyEl) totalQtyEl.textContent = totals.totalQuantity;
        if (totalAmountEl) totalAmountEl.textContent = config.formatVND(totals.totalAmount);
        if (finalAmountEl) finalAmountEl.textContent = config.formatVND(totals.finalAmount);
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================

    /**
     * Format date for input field
     * @param {Date} date
     * @returns {string}
     */
    formatDateForInput(date) {
        if (!date) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Format number for input field
     * @param {number} value
     * @returns {string}
     */
    formatNumberInput(value) {
        if (!value || value === 0) return '';
        return value.toLocaleString('vi-VN');
    }

    /**
     * Parse number from input
     * @param {string} value
     * @returns {number}
     */
    parseNumberInput(value) {
        if (!value) return 0;
        // Remove all non-numeric characters except minus
        const cleaned = value.toString().replace(/[^\d-]/g, '');
        return parseInt(cleaned, 10) || 0;
    }
}

// ========================================
// EXPORT SINGLETON INSTANCE
// ========================================
window.purchaseOrderFormModal = new PurchaseOrderFormModal();

console.log('[Purchase Orders] Form modal loaded successfully');
