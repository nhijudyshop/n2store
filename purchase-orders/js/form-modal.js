/**
 * PURCHASE ORDERS MODULE - FORM MODAL
 * File: form-modal.js
 * Purpose: Modal for creating and editing purchase orders
 * Matches React app: CreatePurchaseOrderDialog.tsx
 */

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
            supplier: '',
            orderDate: new Date().toISOString().split('T')[0],
            invoiceAmount: '',
            invoiceImages: [],  // Will store data URLs (local) or Firebase URLs (uploaded)
            notes: '',
            discountAmount: '',
            shippingFee: '',
            items: []
        };

        // Pending images - store File objects for upload on submit
        this.pendingImages = {
            invoice: [],  // Array of {file: File, dataUrl: string}
            products: {}, // itemId -> Array of {file: File, dataUrl: string}
            prices: {}    // itemId -> Array of {file: File, dataUrl: string}
        };

        this.itemCounter = 0;
        this.isUploading = false;
        this.activeImageUpload = null; // Track which area is focused for paste
        this.showDebugColumn = false;
    }

    // ========================================
    // IMAGE UPLOAD METHODS
    // ========================================

    /**
     * Handle file input change
     * @param {Event} e - Input change event
     * @param {string} type - 'invoice' | 'product' | 'price'
     * @param {string} itemId - Item ID (for product/price images)
     */
    async handleFileSelect(e, type, itemId = null) {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        await this.addLocalImages(Array.from(files), type, itemId);
        e.target.value = ''; // Reset input
    }

    /**
     * Handle paste event for images
     * @param {ClipboardEvent} e - Paste event
     * @param {string} type - 'invoice' | 'product' | 'price'
     * @param {string} itemId - Item ID (for product/price images)
     */
    async handlePaste(e, type, itemId = null) {
        const items = e.clipboardData?.items;
        if (!items) return;

        const files = [];
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) files.push(file);
            }
        }

        if (files.length > 0) {
            e.preventDefault();
            await this.addLocalImages(files, type, itemId);
        }
    }

    /**
     * Convert file to data URL
     * @param {File} file
     * @returns {Promise<string>}
     */
    fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Add images locally (not upload yet) - will upload on submit
     * @param {File[]} files - Files to add
     * @param {string} type - 'invoice' | 'product' | 'price'
     * @param {string} itemId - Item ID (for product/price images)
     */
    async addLocalImages(files, type, itemId = null) {
        try {
            // Show loading state briefly
            this.showUploadingState(type, itemId, true);

            // Compress images using ImageUtils
            let processedFiles = files;
            if (window.ImageUtils && window.ImageUtils.compressImage) {
                processedFiles = await Promise.all(
                    files.map(file => window.ImageUtils.compressImage(file, 1, 1920, 1920))
                );
            }

            // Convert to data URLs for preview
            const imageData = await Promise.all(
                processedFiles.map(async (file) => ({
                    file: file,
                    dataUrl: await this.fileToDataUrl(file)
                }))
            );

            // Store locally based on type
            if (type === 'invoice') {
                this.pendingImages.invoice.push(...imageData);
                // Add data URLs to formData for preview
                this.formData.invoiceImages = [
                    ...this.formData.invoiceImages,
                    ...imageData.map(d => d.dataUrl)
                ];
                this.refreshInvoiceImages();
            } else {
                const item = this.formData.items.find(i => i.id === itemId);
                if (item) {
                    if (type === 'product') {
                        if (!this.pendingImages.products[itemId]) {
                            this.pendingImages.products[itemId] = [];
                        }
                        this.pendingImages.products[itemId].push(...imageData);
                        item.productImages = [
                            ...(item.productImages || []),
                            ...imageData.map(d => d.dataUrl)
                        ];
                    } else if (type === 'price') {
                        if (!this.pendingImages.prices[itemId]) {
                            this.pendingImages.prices[itemId] = [];
                        }
                        this.pendingImages.prices[itemId].push(...imageData);
                        item.priceImages = [
                            ...(item.priceImages || []),
                            ...imageData.map(d => d.dataUrl)
                        ];
                    }
                    this.refreshItemImages(itemId);
                }
            }

            // Show success notification
            if (window.notificationManager) {
                window.notificationManager.show(`Đã thêm ${imageData.length} ảnh (sẽ tải lên khi tạo đơn)`, 'success');
            }
        } catch (error) {
            console.error('[FormModal] Add image failed:', error);
            if (window.notificationManager) {
                window.notificationManager.show('Lỗi thêm ảnh: ' + error.message, 'error');
            }
        } finally {
            this.showUploadingState(type, itemId, false);
        }
    }

    /**
     * Upload all pending images to Firebase
     * Called when submitting the order
     * @returns {Promise<void>}
     */
    async uploadPendingImages() {
        const uploadTasks = [];

        // Upload invoice images
        if (this.pendingImages.invoice.length > 0) {
            const files = this.pendingImages.invoice.map(d => d.file);
            uploadTasks.push(
                window.purchaseOrderService.uploadImages(files, 'purchase-orders/invoices')
                    .then(urls => {
                        // Replace data URLs with Firebase URLs
                        const dataUrls = this.pendingImages.invoice.map(d => d.dataUrl);
                        this.formData.invoiceImages = this.formData.invoiceImages.map(url => {
                            const idx = dataUrls.indexOf(url);
                            return idx >= 0 && urls[idx] ? urls[idx] : url;
                        });
                    })
            );
        }

        // Upload product images
        for (const [itemId, imageData] of Object.entries(this.pendingImages.products)) {
            if (imageData.length > 0) {
                const item = this.formData.items.find(i => i.id === itemId);
                if (item) {
                    const files = imageData.map(d => d.file);
                    uploadTasks.push(
                        window.purchaseOrderService.uploadImages(files, 'purchase-orders/products')
                            .then(urls => {
                                const dataUrls = imageData.map(d => d.dataUrl);
                                item.productImages = (item.productImages || []).map(url => {
                                    const idx = dataUrls.indexOf(url);
                                    return idx >= 0 && urls[idx] ? urls[idx] : url;
                                });
                            })
                    );
                }
            }
        }

        // Upload price images
        for (const [itemId, imageData] of Object.entries(this.pendingImages.prices)) {
            if (imageData.length > 0) {
                const item = this.formData.items.find(i => i.id === itemId);
                if (item) {
                    const files = imageData.map(d => d.file);
                    uploadTasks.push(
                        window.purchaseOrderService.uploadImages(files, 'purchase-orders/products')
                            .then(urls => {
                                const dataUrls = imageData.map(d => d.dataUrl);
                                item.priceImages = (item.priceImages || []).map(url => {
                                    const idx = dataUrls.indexOf(url);
                                    return idx >= 0 && urls[idx] ? urls[idx] : url;
                                });
                            })
                    );
                }
            }
        }

        // Wait for all uploads
        if (uploadTasks.length > 0) {
            await Promise.all(uploadTasks);
        }

        // Clear pending images
        this.pendingImages = {
            invoice: [],
            products: {},
            prices: {}
        };
    }

    /**
     * Remove image from form data
     * @param {string} type - 'invoice' | 'product' | 'price'
     * @param {number} imageIndex - Index of image to remove
     * @param {string} itemId - Item ID (for product/price images)
     */
    removeImage(type, imageIndex, itemId = null) {
        if (type === 'invoice') {
            this.formData.invoiceImages.splice(imageIndex, 1);
            this.refreshInvoiceImages();
        } else {
            const item = this.formData.items.find(i => i.id === itemId);
            if (item) {
                if (type === 'product') {
                    item.productImages.splice(imageIndex, 1);
                } else if (type === 'price') {
                    item.priceImages.splice(imageIndex, 1);
                }
                this.refreshItemImages(itemId);
            }
        }
    }

    /**
     * Show/hide uploading state
     */
    showUploadingState(type, itemId, isLoading) {
        let selector;
        if (type === 'invoice') {
            selector = '#invoiceImageArea';
        } else {
            selector = `tr[data-item-id="${itemId}"] [data-type="${type}"]`;
        }

        const area = this.modalElement?.querySelector(selector);
        if (area) {
            if (isLoading) {
                area.style.opacity = '0.5';
                area.style.pointerEvents = 'none';
            } else {
                area.style.opacity = '1';
                area.style.pointerEvents = 'auto';
            }
        }
    }

    /**
     * Refresh invoice images display
     */
    refreshInvoiceImages() {
        const container = this.modalElement?.querySelector('#invoiceImageContainer');
        if (!container) return;

        container.innerHTML = this.renderInvoiceImages();
        this.bindInvoiceImageEvents();
    }

    /**
     * Refresh item images display
     */
    refreshItemImages(itemId) {
        const row = this.modalElement?.querySelector(`tr[data-item-id="${itemId}"]`);
        if (!row) return;

        const item = this.formData.items.find(i => i.id === itemId);
        if (!item) return;

        // Update product images cell
        const productCell = row.querySelector('[data-image-type="product"]');
        if (productCell) {
            productCell.innerHTML = this.renderItemImageCell(item, 'product');
            this.bindItemImageCellEvents(productCell, item.id, 'product');
        }

        // Update price images cell
        const priceCell = row.querySelector('[data-image-type="price"]');
        if (priceCell) {
            priceCell.innerHTML = this.renderItemImageCell(item, 'price');
            this.bindItemImageCellEvents(priceCell, item.id, 'price');
        }
    }

    /**
     * Render invoice images HTML
     */
    renderInvoiceImages() {
        const images = this.formData.invoiceImages || [];

        if (images.length === 0) {
            return `
                <div id="invoiceImageArea" style="
                    width: 60px;
                    height: 60px;
                    border: 2px dashed #d1d5db;
                    border-radius: 8px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: #9ca3af;
                    font-size: 10px;
                    transition: all 0.2s;
                " tabindex="0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21,15 16,10 5,21"></polyline>
                    </svg>
                    <span>Ctrl+V</span>
                </div>
                <input type="file" id="invoiceFileInput" accept="image/*" multiple style="display: none;">
            `;
        }

        return `
            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                ${images.map((url, index) => `
                    <div style="position: relative; width: 60px; height: 60px;">
                        <img src="${url}" alt="Invoice ${index + 1}" style="
                            width: 100%;
                            height: 100%;
                            object-fit: cover;
                            border-radius: 8px;
                            cursor: pointer;
                        " onclick="window.purchaseOrderFormModal.viewImage('${url}')">
                        <button type="button" data-remove-invoice="${index}" style="
                            position: absolute;
                            top: -6px;
                            right: -6px;
                            width: 20px;
                            height: 20px;
                            border-radius: 50%;
                            background: #ef4444;
                            color: white;
                            border: none;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 14px;
                            line-height: 1;
                        ">&times;</button>
                    </div>
                `).join('')}
                <div id="invoiceImageArea" style="
                    width: 60px;
                    height: 60px;
                    border: 2px dashed #d1d5db;
                    border-radius: 8px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: #9ca3af;
                    font-size: 10px;
                " tabindex="0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </div>
            </div>
            <input type="file" id="invoiceFileInput" accept="image/*" multiple style="display: none;">
        `;
    }

    /**
     * Render item image cell HTML
     */
    renderItemImageCell(item, type) {
        const images = type === 'product' ? (item.productImages || []) : (item.priceImages || []);

        if (images.length === 0) {
            return `
                <div data-type="${type}" style="
                    width: 50px;
                    height: 50px;
                    border: 1px dashed #d1d5db;
                    border-radius: 6px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: #9ca3af;
                    font-size: 9px;
                    margin: 0 auto;
                    transition: all 0.2s;
                " tabindex="0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21,15 16,10 5,21"></polyline>
                    </svg>
                    <span>Ctrl+V</span>
                </div>
                <input type="file" data-file-type="${type}" accept="image/*" multiple style="display: none;">
            `;
        }

        return `
            <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
                <div style="position: relative;">
                    <img src="${images[0]}" alt="${type}" style="
                        width: 50px;
                        height: 50px;
                        object-fit: cover;
                        border-radius: 6px;
                        cursor: pointer;
                    " onclick="window.purchaseOrderFormModal.viewImage('${images[0]}')">
                    ${images.length > 1 ? `
                        <span style="
                            position: absolute;
                            bottom: 2px;
                            right: 2px;
                            background: rgba(0,0,0,0.7);
                            color: white;
                            font-size: 10px;
                            padding: 1px 4px;
                            border-radius: 3px;
                        ">+${images.length - 1}</span>
                    ` : ''}
                    <button type="button" data-remove-image="${type}" style="
                        position: absolute;
                        top: -4px;
                        right: -4px;
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                        background: #ef4444;
                        color: white;
                        border: none;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        line-height: 1;
                    ">&times;</button>
                </div>
                <div data-type="${type}" style="
                    width: 30px;
                    height: 50px;
                    border: 1px dashed #d1d5db;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: #9ca3af;
                " tabindex="0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </div>
            </div>
            <input type="file" data-file-type="${type}" accept="image/*" multiple style="display: none;">
        `;
    }

    /**
     * View image in full size
     */
    viewImage(url) {
        // Simple image viewer - can be enhanced later
        window.open(url, '_blank');
    }

    /**
     * Bind events for invoice image area
     */
    bindInvoiceImageEvents() {
        const container = this.modalElement?.querySelector('#invoiceImageContainer');
        if (!container) return;

        const area = container.querySelector('#invoiceImageArea');
        const fileInput = container.querySelector('#invoiceFileInput');

        if (area && fileInput) {
            // Click to upload
            area.addEventListener('click', () => fileInput.click());

            // Hover effect
            area.addEventListener('mouseenter', () => {
                area.style.borderColor = '#3b82f6';
                area.style.color = '#3b82f6';
            });
            area.addEventListener('mouseleave', () => {
                area.style.borderColor = '#d1d5db';
                area.style.color = '#9ca3af';
            });

            // Paste on focus
            area.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'v') {
                    // Will be handled by paste event
                }
            });
            area.addEventListener('paste', (e) => this.handlePaste(e, 'invoice'));

            // File input change
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e, 'invoice'));
        }

        // Remove buttons
        container.querySelectorAll('[data-remove-invoice]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.removeInvoice);
                this.removeImage('invoice', index);
            });
        });
    }

    /**
     * Bind events for item image cell
     */
    bindItemImageCellEvents(cell, itemId, type) {
        const area = cell.querySelector(`[data-type="${type}"]`);
        const fileInput = cell.querySelector(`[data-file-type="${type}"]`);

        if (area && fileInput) {
            // Click to upload
            area.addEventListener('click', () => fileInput.click());

            // Hover effect
            area.addEventListener('mouseenter', () => {
                area.style.borderColor = '#3b82f6';
                area.style.color = '#3b82f6';
            });
            area.addEventListener('mouseleave', () => {
                area.style.borderColor = '#d1d5db';
                area.style.color = '#9ca3af';
            });

            // Paste on focus
            area.addEventListener('paste', (e) => this.handlePaste(e, type, itemId));

            // File input change
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e, type, itemId));
        }

        // Remove button
        const removeBtn = cell.querySelector(`[data-remove-image="${type}"]`);
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeImage(type, 0, itemId); // Remove first image (shown)
            });
        }
    }

    /**
     * Open modal for creating new order
     */
    async openCreate(options = {}) {
        this.isEdit = false;
        this.order = null;
        this.resetFormData();
        this.addItem(); // Add one empty item by default

        this.onSubmit = options.onSubmit;
        this.onCancel = options.onCancel;

        // Load validation settings from Firestore
        await this._loadValidationSettings();

        this.render();
        this.captureInitialState();
        this.updateSettingsButtonHighlight();
    }

    /**
     * Open modal for editing existing order
     */
    async openEdit(order, options = {}) {
        this.isEdit = true;
        this.order = order;
        this.loadOrderData(order);

        this.onSubmit = options.onSubmit;
        this.onCancel = options.onCancel;

        // Load validation settings from Firestore
        await this._loadValidationSettings();

        this.render();
        this.captureInitialState();
        this.updateSettingsButtonHighlight();
    }

    /**
     * Load validation settings from Firestore via SettingsDialog
     */
    async _loadValidationSettings() {
        try {
            if (window.settingsDialog) {
                this.validationSettings = await window.settingsDialog.loadFromFirestore();
            } else {
                this.validationSettings = { ...(window.PurchaseOrderValidation?.DEFAULT_VALIDATION_SETTINGS || {}) };
            }
        } catch (e) {
            console.warn('[FormModal] Failed to load validation settings:', e);
            this.validationSettings = { ...(window.PurchaseOrderValidation?.DEFAULT_VALIDATION_SETTINGS || {}) };
        }
    }

    /**
     * Highlight settings button when any price setting is active
     */
    updateSettingsButtonHighlight() {
        const btn = this.modalElement?.querySelector('#btnSettings');
        if (!btn) return;
        const s = this.validationSettings || {};
        const isActive = (s.minPurchasePrice > 0 || s.maxPurchasePrice > 0 ||
                          s.minSellingPrice > 0 || s.maxSellingPrice > 0 ||
                          s.minMargin > 0);
        if (isActive) {
            btn.style.background = '#eff6ff';
            btn.style.color = '#2563eb';
            btn.style.borderColor = '#2563eb';
            btn.title = 'Cài đặt validation giá mua/bán — Đang hoạt động';
        } else {
            btn.style.background = '';
            btn.style.color = '';
            btn.style.borderColor = '';
            btn.title = 'Cài đặt validation giá mua/bán';
        }
    }

    /**
     * Capture initial form state for unsaved changes detection
     */
    captureInitialState() {
        this.initialFormSnapshot = JSON.stringify({
            supplier: this.formData.supplier,
            notes: this.formData.notes,
            items: this.formData.items.map(i => ({
                productName: i.productName || '',
                productCode: i.productCode || '',
                purchasePrice: i.purchasePrice || '',
                sellingPrice: i.sellingPrice || '',
                quantity: i.quantity || 1
            }))
        });
    }

    /**
     * Check if form has unsaved changes
     */
    hasUnsavedChanges() {
        this.collectFormData();
        const current = JSON.stringify({
            supplier: this.formData.supplier,
            notes: this.formData.notes,
            items: this.formData.items.map(i => ({
                productName: i.productName || '',
                productCode: i.productCode || '',
                purchasePrice: i.purchasePrice || '',
                sellingPrice: i.sellingPrice || '',
                quantity: i.quantity || 1
            }))
        });
        return current !== this.initialFormSnapshot;
    }

    /**
     * Update price input borders dynamically (red when invalid)
     */
    updatePriceInputBorders(row) {
        if (!row) return;
        const purchaseInput = row.querySelector('input[data-field="purchasePrice"]');
        const sellingInput = row.querySelector('input[data-field="sellingPrice"]');

        if (purchaseInput) {
            const val = parseFloat(String(purchaseInput.value).replace(/[,.]/g, '')) || 0;
            if (val > 0) {
                purchaseInput.style.border = '1px solid #d1d5db';
                purchaseInput.style.background = 'white';
            } else {
                purchaseInput.style.border = '2px solid #ef4444';
                purchaseInput.style.background = '#fef2f2';
            }
        }

        if (sellingInput) {
            const selVal = parseFloat(String(sellingInput.value).replace(/[,.]/g, '')) || 0;
            const purVal = purchaseInput ? (parseFloat(String(purchaseInput.value).replace(/[,.]/g, '')) || 0) : 0;
            if (selVal > 0 && selVal > purVal) {
                sellingInput.style.border = '1px solid #d1d5db';
                sellingInput.style.background = 'white';
            } else {
                sellingInput.style.border = '2px solid #ef4444';
                sellingInput.style.background = '#fef2f2';
            }
        }
    }

    /**
     * Close modal
     */
    close() {
        if (this.modalElement) {
            this.modalElement.remove();
            this.modalElement = null;
            this.formElement = null;
        }
    }

    /**
     * Reset form data
     */
    resetFormData() {
        this.formData = {
            supplier: '',
            orderDate: new Date().toISOString().split('T')[0],
            invoiceAmount: '',
            invoiceImages: [],
            notes: '',
            discountAmount: '',
            shippingFee: '',
            items: []
        };
        this.pendingImages = {
            invoice: [],
            products: {},
            prices: {}
        };
        this.itemCounter = 0;
    }

    /**
     * Load order data into form
     */
    loadOrderData(order) {
        const orderDate = order.orderDate?.toDate ? order.orderDate.toDate() : new Date(order.orderDate);
        this.formData = {
            supplier: order.supplier?.name || '',
            orderDate: orderDate.toISOString().split('T')[0],
            invoiceAmount: order.invoiceAmount || '',
            invoiceImages: order.invoiceImages || [],
            notes: order.notes || '',
            discountAmount: order.discountAmount || '',
            shippingFee: order.shippingFee || '',
            items: (order.items || []).map((item, index) => ({
                ...item,
                id: item.id || `item_${index}`,
                _isExistingItem: true
            }))
        };
        this.itemCounter = this.formData.items.length;
    }

    /**
     * Add new item
     */
    addItem() {
        const newItem = {
            id: `item_${Date.now()}_${this.itemCounter++}`,
            productName: '',
            variant: '',
            productCode: '',
            quantity: 1,
            purchasePrice: '',
            sellingPrice: '',
            productImages: [],
            priceImages: [],
            selectedAttributeValueIds: []
        };
        this.formData.items.push(newItem);
        return newItem;
    }

    /**
     * Remove item
     */
    removeItem(itemId) {
        this.formData.items = this.formData.items.filter(item => item.id !== itemId);
    }

    /**
     * Copy item
     */
    copyItem(itemId) {
        const sourceItem = this.formData.items.find(item => item.id === itemId);
        if (!sourceItem) return;

        const newItem = {
            ...sourceItem,
            id: `item_${Date.now()}_${this.itemCounter++}`,
            productCode: '', // Clear code so auto-generate can create new one
            _manualCodeEdit: false,
            _isExistingItem: false,
            variant: '',
            selectedAttributeValueIds: [],
            productImages: [...(sourceItem.productImages || [])],
            priceImages: [...(sourceItem.priceImages || [])]
        };
        this.formData.items.push(newItem);

        // Auto-generate new product code for copied item
        if (newItem.productName && newItem.productName.trim()) {
            this.autoGenerateProductCode(newItem);
        }
    }

    /**
     * Apply price & images from one variant to all variants with same productCode
     * @param {string} sourceItemId - Source item ID
     */
    applyAllFieldsToVariants(sourceItemId) {
        const sourceItem = this.formData.items.find(item => item.id === sourceItemId);
        if (!sourceItem || !sourceItem.productCode) return;

        const productCode = sourceItem.productCode.trim();
        if (!productCode) return;

        let updatedCount = 0;
        this.formData.items.forEach(item => {
            if (item.id === sourceItemId) return; // Skip source
            if ((item.productCode || '').trim() !== productCode) return; // Skip different product

            item.productImages = [...(sourceItem.productImages || [])];
            item.priceImages = [...(sourceItem.priceImages || [])];
            item.purchasePrice = sourceItem.purchasePrice;
            item.sellingPrice = sourceItem.sellingPrice;
            updatedCount++;
        });

        if (updatedCount > 0) {
            this.refreshItemsTable();
            if (window.notificationManager) {
                window.notificationManager.success(`Đã áp dụng giá & hình ảnh cho ${updatedCount} biến thể`);
            }
        } else {
            if (window.notificationManager) {
                window.notificationManager.show('Không tìm thấy biến thể cùng mã sản phẩm', 'warning');
            }
        }
    }

    /**
     * Calculate totals
     */
    calculateTotals() {
        const totalQuantity = this.formData.items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
        const totalAmount = this.formData.items.reduce((sum, item) => {
            const price = parseFloat(String(item.purchasePrice).replace(/[,.]/g, '')) || 0;
            const qty = parseInt(item.quantity) || 0;
            return sum + (price * qty);
        }, 0);
        const discount = parseFloat(String(this.formData.discountAmount).replace(/[,.]/g, '')) || 0;
        const shipping = parseFloat(String(this.formData.shippingFee).replace(/[,.]/g, '')) || 0;
        const finalAmount = totalAmount - discount + shipping;

        return { totalQuantity, totalAmount, discount, shipping, finalAmount };
    }

    /**
     * Format number for display
     */
    formatNumber(value) {
        if (!value && value !== 0) return '';
        const num = parseFloat(String(value).replace(/[,.]/g, ''));
        if (isNaN(num)) return '';
        return num.toLocaleString('vi-VN');
    }

    /**
     * Render the modal
     */
    render() {
        // Remove existing modal
        if (this.modalElement) {
            this.modalElement.remove();
        }

        const title = this.isEdit ? 'Chỉnh sửa đơn hàng' : 'Tạo đơn đặt hàng';
        const totals = this.calculateTotals();

        // Create modal with INLINE STYLES to ensure visibility
        this.modalElement = document.createElement('div');
        this.modalElement.id = 'purchaseOrderModal';
        this.modalElement.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            padding: 20px;
        `;

        this.modalElement.innerHTML = `
            <div style="
                background: white;
                border-radius: 12px;
                width: 100%;
                max-width: 1600px;
                max-height: 95vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            ">
                <!-- Header -->
                <div style="
                    padding: 20px 24px;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <h2 style="margin: 0; font-size: 20px; font-weight: 600;">${title}</h2>
                    <button type="button" id="btnCloseModal" style="
                        background: none;
                        border: none;
                        padding: 8px;
                        cursor: pointer;
                        border-radius: 6px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <!-- Form Body -->
                <div style="flex: 1; overflow-y: auto; padding: 24px;">
                    <!-- Row 1: Supplier, Date, Invoice Amount, Invoice Image -->
                    <div style="display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 200px;">
                            <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">
                                Nhà cung cấp <span style="color: #ef4444;">*</span>
                            </label>
                            <input type="text" id="inputSupplier" value="${this.formData.supplier}" placeholder="Nhập tên nhà cung cấp" style="
                                width: 100%;
                                height: 40px;
                                padding: 0 12px;
                                border: 1px solid #d1d5db;
                                border-radius: 8px;
                                font-size: 14px;
                                box-sizing: border-box;
                            ">
                        </div>
                        <div style="min-width: 160px;">
                            <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">
                                Ngày đặt hàng
                            </label>
                            <input type="date" id="inputOrderDate" value="${this.formData.orderDate}" style="
                                width: 100%;
                                height: 40px;
                                padding: 0 12px;
                                border: 1px solid #d1d5db;
                                border-radius: 8px;
                                font-size: 14px;
                                box-sizing: border-box;
                            ">
                        </div>
                        <div style="min-width: 180px;">
                            <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">
                                Số tiền hóa đơn (VND)
                            </label>
                            <input type="text" id="inputInvoiceAmount" value="${this.formatNumber(this.formData.invoiceAmount)}" placeholder="Nhập số tiền VND" style="
                                width: 100%;
                                height: 40px;
                                padding: 0 12px;
                                border: 1px solid #d1d5db;
                                border-radius: 8px;
                                font-size: 14px;
                                text-align: right;
                                box-sizing: border-box;
                            ">
                        </div>
                        <div style="min-width: 100px;">
                            <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">
                                Ảnh hóa đơn
                            </label>
                            <div id="invoiceImageContainer">
                                ${this.renderInvoiceImages()}
                            </div>
                        </div>
                    </div>

                    <!-- Row 2: Search, Notes, Settings, Add buttons -->
                    <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; align-items: flex-end;">
                        <div style="flex: 0 0 auto;">
                            <label style="display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px;">
                                Danh sách sản phẩm
                            </label>
                            <div style="position: relative; display: flex; align-items: center;">
                                <svg style="position: absolute; left: 12px; width: 16px; height: 16px; color: #9ca3af; pointer-events: none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                                <input type="text" id="inputProductSearch" placeholder="Tìm kiếm sản phẩm theo tên..." style="
                                    width: 280px;
                                    height: 40px;
                                    padding: 0 12px 0 36px;
                                    border: 1px solid #d1d5db;
                                    border-radius: 8px;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                ">
                            </div>
                        </div>
                        <div style="flex: 1; min-width: 200px;">
                            <input type="text" id="inputNotes" value="${this.formData.notes}" placeholder="Ghi chú thêm cho đơn hàng..." style="
                                width: 100%;
                                height: 40px;
                                padding: 0 12px;
                                border: 1px solid #d1d5db;
                                border-radius: 8px;
                                font-size: 14px;
                                box-sizing: border-box;
                            ">
                        </div>
                        <button type="button" id="btnSettings" style="
                            height: 40px;
                            width: 40px;
                            border: 1px solid #d1d5db;
                            border-radius: 8px;
                            background: white;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        ">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                            </svg>
                        </button>
                        <button type="button" id="btnAddProduct" style="
                            height: 40px;
                            padding: 0 16px;
                            border: 1px solid #d1d5db;
                            border-radius: 8px;
                            background: white;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            font-size: 14px;
                        ">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            Thêm sản phẩm
                        </button>
                        <button type="button" id="btnChooseInventory" style="
                            height: 40px;
                            padding: 0 16px;
                            border: none;
                            border-radius: 8px;
                            background: #3b82f6;
                            color: white;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            font-size: 14px;
                        ">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                            </svg>
                            Chọn từ Kho SP
                        </button>
                    </div>

                    <!-- Products Table -->
                    <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                        <div style="overflow-x: auto;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                <thead>
                                    <tr style="background: #f9fafb;">
                                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">STT</th>
                                        <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; min-width: 150px;">Tên sản phẩm</th>
                                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">Biến thể</th>
                                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">Mã sản phẩm</th>
                                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">SL</th>
                                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">Giá mua (VND)</th>
                                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">Giá bán (VND)</th>
                                        <th style="padding: 12px 8px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">Thành tiền (VND)</th>
                                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">Hình ảnh sản phẩm</th>
                                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">Hình ảnh Giá mua</th>
                                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">
                                            Thao tác
                                        </th>
                                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">
                                            <button type="button" id="btnToggleDebug" style="
                                                background: none; border: none; cursor: pointer; padding: 4px;
                                                color: #9ca3af; display: inline-flex; align-items: center; gap: 4px;
                                            " title="Toggle Debug: Attr IDs">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                    ${this.showDebugColumn
                                                        ? '<polyline points="15 18 9 12 15 6"></polyline>'
                                                        : '<polyline points="9 18 15 12 9 6"></polyline>'
                                                    }
                                                </svg>
                                            </button>
                                            ${this.showDebugColumn ? '<span style="font-size: 11px; color: #9ca3af;">Debug: Attr IDs</span>' : ''}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody id="itemsTableBody">
                                    ${this.renderItemRows()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="
                    padding: 16px 24px;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: space-between;
                    align-items: center;
                    gap: 16px;
                    background: #f9fafb;
                ">
                    <div style="display: flex; flex-wrap: wrap; gap: 24px; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 13px; color: #6b7280;">Tổng số lượng:</span>
                            <span style="font-weight: 600;" id="totalQuantity">${totals.totalQuantity}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 13px; color: #6b7280;">Tổng tiền:</span>
                            <span style="font-weight: 600;" id="totalAmount">${this.formatNumber(totals.totalAmount)} đ</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 13px; color: #6b7280;">Giảm giá:</span>
                            <input type="text" id="inputDiscount" value="${this.formatNumber(this.formData.discountAmount)}" placeholder="0" style="
                                width: 100px;
                                height: 32px;
                                padding: 0 8px;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                font-size: 13px;
                                text-align: right;
                            ">
                        </div>
                        <button type="button" id="btnAddShipping" style="
                            height: 32px;
                            padding: 0 12px;
                            border: 1px solid #d1d5db;
                            border-radius: 6px;
                            background: white;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            font-size: 13px;
                        ">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="1" y="3" width="15" height="13"></rect>
                                <polygon points="16,8 20,8 23,11 23,16 16,16 16,8"></polygon>
                                <circle cx="5.5" cy="18.5" r="2.5"></circle>
                                <circle cx="18.5" cy="18.5" r="2.5"></circle>
                            </svg>
                            Thêm tiền ship
                        </button>
                    </div>

                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 14px; font-weight: 600; color: #6b7280;">THÀNH TIỀN:</span>
                            <span style="font-size: 20px; font-weight: 700; color: #3b82f6;" id="finalAmount">${this.formatNumber(totals.finalAmount)} đ</span>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" id="btnCancel" style="
                                height: 40px;
                                padding: 0 20px;
                                border: 1px solid #d1d5db;
                                border-radius: 8px;
                                background: white;
                                cursor: pointer;
                                font-size: 14px;
                            ">Hủy</button>
                            <button type="button" id="btnSaveDraft" style="
                                height: 40px;
                                padding: 0 20px;
                                border: 1px solid #3b82f6;
                                border-radius: 8px;
                                background: white;
                                color: #3b82f6;
                                cursor: pointer;
                                font-size: 14px;
                            ">Lưu nháp</button>
                            <button type="button" id="btnSubmit" style="
                                height: 40px;
                                padding: 0 20px;
                                border: none;
                                border-radius: 8px;
                                background: #3b82f6;
                                color: white;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                            ">${this.isEdit ? 'Cập nhật' : 'Tạo đơn hàng'}</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);
        this.bindEvents();
    }

    /**
     * Render item rows
     */
    renderItemRows() {
        if (this.formData.items.length === 0) {
            return `
                <tr>
                    <td colspan="11" style="padding: 40px; text-align: center; color: #9ca3af;">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                            </svg>
                            <p style="margin: 0;">Chưa có sản phẩm nào. Nhấn "Thêm sản phẩm" để bắt đầu.</p>
                        </div>
                    </td>
                </tr>
            `;
        }

        return this.formData.items.map((item, index) => {
            const purchaseVal = parseFloat(String(item.purchasePrice).replace(/[,.]/g, '')) || 0;
            const sellingVal = parseFloat(String(item.sellingPrice).replace(/[,.]/g, '')) || 0;
            const subtotal = purchaseVal * (parseInt(item.quantity) || 0);

            return `
                <tr data-item-id="${item.id}">
                    <td style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #f3f4f6;">${index + 1}</td>
                    <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6;">
                        <input type="text" data-field="productName" value="${item.productName || ''}" placeholder="Nhập tên sản phẩm" style="
                            width: 100%;
                            height: 36px;
                            padding: 0 8px;
                            border: 1px solid #d1d5db;
                            border-radius: 6px;
                            font-size: 13px;
                            box-sizing: border-box;
                        ">
                    </td>
                    <td style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #f3f4f6;">
                        <button type="button" data-action="variant" style="
                            height: 32px;
                            padding: 0 12px;
                            border: 1px solid #d1d5db;
                            border-radius: 6px;
                            background: white;
                            cursor: pointer;
                            font-size: 12px;
                            white-space: nowrap;
                        ">${item.variant || 'Nhấn để tạo biến thể'}</button>
                    </td>
                    <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6;">
                        <div style="display: flex; gap: 4px;">
                            <input type="text" data-field="productCode" value="${item.productCode || ''}" placeholder="Mã SP" disabled style="
                                width: 80px;
                                height: 36px;
                                padding: 0 8px;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                font-size: 13px;
                                box-sizing: border-box;
                                background: ${(this.isEdit && item._isExistingItem) ? '#e5e7eb' : '#f9fafb'};
                                color: #374151;
                                ${(this.isEdit && item._isExistingItem) ? 'cursor: not-allowed; opacity: 0.7;' : ''}
                            ">
                            ${(this.isEdit && item._isExistingItem) ? '' : `<button type="button" data-action="editCode" style="
                                width: 32px;
                                height: 36px;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                background: ${item._manualCodeEdit ? '#dcfce7' : 'white'};
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            ">
                                ${item._manualCodeEdit
                                    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>'
                                    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>'
                                }
                            </button>`}
                        </div>
                    </td>
                    <td style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #f3f4f6;">
                        <input type="number" data-field="quantity" value="${item.quantity || 1}" min="1" style="
                            width: 60px;
                            height: 36px;
                            padding: 0 8px;
                            border: 1px solid #d1d5db;
                            border-radius: 6px;
                            font-size: 13px;
                            text-align: center;
                            box-sizing: border-box;
                        ">
                    </td>
                    <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6;">
                        <input type="text" data-field="purchasePrice" value="${this.formatNumber(item.purchasePrice)}" placeholder="0" style="
                            width: 100px;
                            height: 36px;
                            padding: 0 8px;
                            border: ${purchaseVal > 0 ? '1px solid #d1d5db' : '2px solid #ef4444'};
                            border-radius: 6px;
                            font-size: 13px;
                            text-align: right;
                            background: ${purchaseVal > 0 ? 'white' : '#fef2f2'};
                            box-sizing: border-box;
                        ">
                    </td>
                    <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6;">
                        <input type="text" data-field="sellingPrice" value="${this.formatNumber(item.sellingPrice)}" placeholder="0" style="
                            width: 100px;
                            height: 36px;
                            padding: 0 8px;
                            border: ${sellingVal > 0 && sellingVal > purchaseVal ? '1px solid #d1d5db' : '2px solid #ef4444'};
                            border-radius: 6px;
                            font-size: 13px;
                            text-align: right;
                            background: ${sellingVal > 0 && sellingVal > purchaseVal ? 'white' : '#fef2f2'};
                            box-sizing: border-box;
                        ">
                    </td>
                    <td style="padding: 12px 8px; text-align: right; border-bottom: 1px solid #f3f4f6; font-weight: 600;">
                        ${this.formatNumber(subtotal)} đ
                    </td>
                    <td style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #f3f4f6;" data-image-type="product">
                        ${this.renderItemImageCell(item, 'product')}
                    </td>
                    <td style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #f3f4f6;" data-image-type="price">
                        ${this.renderItemImageCell(item, 'price')}
                    </td>
                    <td style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #f3f4f6;">
                        <div style="display: flex; gap: 4px; justify-content: center;">
                            <button type="button" data-action="inventory" title="Chọn từ kho" style="
                                width: 32px;
                                height: 32px;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                background: white;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            ">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                                    <polyline points="3.27,6.96 12,12.01 20.73,6.96"></polyline>
                                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                                </svg>
                            </button>
                            <button type="button" data-action="copy" title="Sao chép" style="
                                width: 32px;
                                height: 32px;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                background: white;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            ">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                            </button>
                            <button type="button" data-action="applyVariants" title="Áp dụng giá & hình ảnh cho tất cả biến thể" style="
                                width: 32px;
                                height: 32px;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                background: white;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: #8b5cf6;
                            ">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                    <polyline points="17 14 12 9 7 14"></polyline>
                                </svg>
                            </button>
                            <button type="button" data-action="delete" title="Xóa" style="
                                width: 32px;
                                height: 32px;
                                border: none;
                                border-radius: 6px;
                                background: transparent;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: #ef4444;
                            ">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                    </td>
                    <td style="padding: 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; ${this.showDebugColumn ? '' : 'display: none;'}">
                        ${(item.selectedAttributeValueIds || []).length > 0
                            ? item.selectedAttributeValueIds.map(id => `
                                <div style="font-family: monospace; font-size: 10px; background: #fefce8; padding: 2px 6px; margin: 2px 0; border-radius: 4px; border: 1px solid #fde68a; word-break: break-all;">
                                    ${id}
                                </div>
                            `).join('')
                            : '<span style="color: #d1d5db; font-size: 11px;">-</span>'
                        }
                    </td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Refresh items table
     */
    refreshItemsTable() {
        const tbody = this.modalElement?.querySelector('#itemsTableBody');
        if (tbody) {
            tbody.innerHTML = this.renderItemRows();
            this.bindItemEvents();
        }
        this.updateTotals();
    }

    /**
     * Update totals display
     */
    updateTotals() {
        const totals = this.calculateTotals();

        const totalQtyEl = this.modalElement?.querySelector('#totalQuantity');
        const totalAmountEl = this.modalElement?.querySelector('#totalAmount');
        const finalAmountEl = this.modalElement?.querySelector('#finalAmount');

        if (totalQtyEl) totalQtyEl.textContent = totals.totalQuantity;
        if (totalAmountEl) totalAmountEl.textContent = this.formatNumber(totals.totalAmount) + ' đ';
        if (finalAmountEl) finalAmountEl.textContent = this.formatNumber(totals.finalAmount) + ' đ';
    }

    /**
     * Bind all events
     */
    bindEvents() {
        if (!this.modalElement) return;

        // Close button (with unsaved changes check)
        this.modalElement.querySelector('#btnCloseModal')?.addEventListener('click', () => {
            if (this.hasUnsavedChanges()) {
                if (!confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn đóng?')) return;
            }
            this.close();
        });
        this.modalElement.querySelector('#btnCancel')?.addEventListener('click', () => {
            if (this.hasUnsavedChanges()) {
                if (!confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn đóng?')) return;
            }
            this.onCancel?.();
            this.close();
        });

        // Close on overlay click
        // Do NOT close on outside click - prevent accidental data loss
        // User must use X button or Cancel to close

        // Add product button
        this.modalElement.querySelector('#btnAddProduct')?.addEventListener('click', () => {
            this.addItem();
            this.refreshItemsTable();
        });

        // Choose from inventory button
        this.modalElement.querySelector('#btnChooseInventory')?.addEventListener('click', () => {
            console.log('[FormModal] btnChooseInventory clicked');
            if (window.inventoryPickerDialog) {
                // Store reference to this FormModal instance
                const formModal = this;

                window.inventoryPickerDialog.open({
                    onSelect: function(products) {
                        console.log('[FormModal-MAIN] Received products:', products.length, products);

                        // Remove empty items before adding new products
                        formModal.formData.items = formModal.formData.items.filter(item =>
                            item.productName?.trim() || item.productCode?.trim()
                        );

                        console.log('[FormModal-MAIN] Items after filter:', formModal.formData.items.length);

                        for (let i = 0; i < products.length; i++) {
                            const product = products[i];
                            console.log(`[FormModal-MAIN] Adding product ${i + 1}:`, product.code, product.name);
                            const item = formModal.addItem();
                            item.productName = product.name || '';
                            item.productCode = product.code || '';
                            item.purchasePrice = product.purchasePrice || 0;
                            item.sellingPrice = product.sellingPrice || 0;
                            // Handle image - convert single image to array format
                            if (product.image) {
                                item.productImages = [product.image];
                            }
                        }

                        console.log('[FormModal-MAIN] Total items after adding:', formModal.formData.items.length);
                        formModal.refreshItemsTable();
                    }
                });
            }
        });

        // Settings button
        this.modalElement.querySelector('#btnSettings')?.addEventListener('click', () => {
            if (window.settingsDialog) {
                window.settingsDialog.open({
                    settings: this.validationSettings || {},
                    onSave: (settings) => {
                        this.validationSettings = settings;
                        this.updateSettingsButtonHighlight();
                        if (window.notificationManager) {
                            window.notificationManager.success('Đã lưu cài đặt');
                        }
                    }
                });
            }
        });

        // Debug column toggle
        this.modalElement.querySelector('#btnToggleDebug')?.addEventListener('click', () => {
            this.showDebugColumn = !this.showDebugColumn;
            // Update header
            const th = this.modalElement.querySelector('#btnToggleDebug').closest('th');
            const btn = this.modalElement.querySelector('#btnToggleDebug');
            if (btn) {
                btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${this.showDebugColumn ? '<polyline points="15 18 9 12 15 6"></polyline>' : '<polyline points="9 18 15 12 9 6"></polyline>'}
                </svg>`;
            }
            const label = th?.querySelector('span');
            if (this.showDebugColumn && !label) {
                btn.insertAdjacentHTML('afterend', '<span style="font-size: 11px; color: #9ca3af;">Debug: Attr IDs</span>');
            } else if (!this.showDebugColumn && label) {
                label.remove();
            }
            // Refresh body rows (debug cells visibility)
            this.refreshItemsTable();
        });

        // Add shipping fee button
        this.modalElement.querySelector('#btnAddShipping')?.addEventListener('click', () => {
            if (window.shippingFeeDialog) {
                const currentFee = parseFloat(String(this.formData.shippingFee).replace(/[,.]/g, '')) || 0;
                window.shippingFeeDialog.open({
                    currentFee: currentFee,
                    onSave: (fee) => {
                        this.formData.shippingFee = fee;
                        this.updateTotals();
                        // Update shipping button to show current fee
                        const btn = this.modalElement.querySelector('#btnAddShipping');
                        if (btn && fee > 0) {
                            btn.innerHTML = `
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="1" y="3" width="15" height="13"></rect>
                                    <polygon points="16,8 20,8 23,11 23,16 16,16 16,8"></polygon>
                                    <circle cx="5.5" cy="18.5" r="2.5"></circle>
                                    <circle cx="18.5" cy="18.5" r="2.5"></circle>
                                </svg>
                                Ship: ${this.formatNumber(fee)} đ
                            `;
                        }
                    }
                });
            }
        });

        // Discount input
        this.modalElement.querySelector('#inputDiscount')?.addEventListener('input', (e) => {
            this.formData.discountAmount = e.target.value;
            this.updateTotals();
        });

        // Save draft
        this.modalElement.querySelector('#btnSaveDraft')?.addEventListener('click', () => {
            this.handleSaveDraft();
        });

        // Submit
        this.modalElement.querySelector('#btnSubmit')?.addEventListener('click', () => {
            this.handleSubmit();
        });

        // Escape key (with unsaved changes check)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modalElement) {
                if (this.hasUnsavedChanges()) {
                    if (!confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn đóng?')) return;
                }
                this.close();
            }
        });

        // Global paste handler - paste to last focused image area
        document.addEventListener('paste', (e) => {
            // Only handle if modal is open and no input is focused
            if (!this.modalElement) return;
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

            // Default to invoice if no specific area focused
            this.handlePaste(e, 'invoice');
        });

        // Bind invoice image events
        this.bindInvoiceImageEvents();

        // Bind item events
        this.bindItemEvents();
    }

    /**
     * Auto-generate product code for item
     * @param {Object} item - The item to generate code for
     */
    async autoGenerateProductCode(item) {
        if (!item || !item.productName || item._manualCodeEdit) return;

        // Skip existing items in edit mode
        if (this.isEdit && item._isExistingItem) return;

        // Skip if code already exists
        if (item.productCode && item.productCode.trim()) return;

        // Use ProductCodeGenerator if available
        if (window.ProductCodeGenerator) {
            try {
                // Detect category first
                const category = window.ProductCodeGenerator.detectProductCategory(item.productName);
                if (!category) {
                    console.warn('Could not detect category for:', item.productName);
                    return;
                }

                const code = await window.ProductCodeGenerator.generateProductCodeFromMax(
                    item.productName,
                    this.formData.items
                );
                if (code) {
                    item.productCode = code;

                    // Update input field
                    const row = this.modalElement?.querySelector(`tr[data-item-id="${item.id}"]`);
                    const codeInput = row?.querySelector('input[data-field="productCode"]');
                    if (codeInput) {
                        codeInput.value = code;
                    }
                } else {
                    // Failed after max attempts
                    if (window.notificationManager) {
                        window.notificationManager.show(
                            '⚠️ Mã trùng trên TPOS hơn 30 mã. Vào TPOS tìm mã lớn nhất điền tay cho mã sản phẩm đầu tiên',
                            'warning'
                        );
                    }
                }
            } catch (error) {
                console.error('Auto-generate code failed:', error);
            }
        }
    }

    /**
     * Auto-detect supplier from product name
     * @param {string} productName - Product name to extract supplier from
     */
    autoDetectSupplier(productName) {
        // Only auto-detect if supplier field is empty
        if (this.formData.supplier && this.formData.supplier.trim()) return;

        if (window.SupplierDetector) {
            const result = window.SupplierDetector.detectSupplierWithConfidence(productName);

            if (result.supplierName && (result.confidence === 'high' || result.confidence === 'medium')) {
                this.formData.supplier = result.supplierName;

                // Update supplier input field
                const supplierInput = this.modalElement?.querySelector('#inputSupplier');
                if (supplierInput) {
                    supplierInput.value = result.supplierName;
                }
            }
        }
    }

    /**
     * Bind item-specific events
     */
    bindItemEvents() {
        const tbody = this.modalElement?.querySelector('#itemsTableBody');
        if (!tbody) return;

        // Debounce timer for auto code generation
        let codeGenTimer = null;

        // Input changes
        tbody.querySelectorAll('input[data-field]').forEach(input => {
            input.addEventListener('input', (e) => {
                const row = e.target.closest('tr');
                const itemId = row?.dataset.itemId;
                const field = e.target.dataset.field;
                const item = this.formData.items.find(i => i.id === itemId);

                if (item && field) {
                    item[field] = e.target.value;
                    this.updateTotals();

                    // Update price input red borders dynamically
                    if (field === 'purchasePrice' || field === 'sellingPrice') {
                        this.updatePriceInputBorders(row);
                    }

                    // Auto-generate product code when product name changes
                    if (field === 'productName') {
                        if (e.target.value.trim()) {
                            // Auto-detect supplier from first product
                            if (this.formData.items.indexOf(item) === 0) {
                                this.autoDetectSupplier(e.target.value);
                            }

                            // Debounce code generation
                            clearTimeout(codeGenTimer);
                            codeGenTimer = setTimeout(() => {
                                this.autoGenerateProductCode(item);
                            }, 800);
                        } else {
                            // Name cleared → clear product code too
                            clearTimeout(codeGenTimer);
                            if (!item._manualCodeEdit) {
                                item.productCode = '';
                                const codeInput = row?.querySelector('input[data-field="productCode"]');
                                if (codeInput) codeInput.value = '';
                            }
                        }
                    }

                    // Mark as manual edit if user changes product code
                    if (field === 'productCode') {
                        item._manualCodeEdit = true;
                    }
                }
            });
        });

        // Action buttons
        tbody.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const row = e.target.closest('tr');
                const itemId = row?.dataset.itemId;
                const action = e.target.closest('button').dataset.action;

                if (action === 'editCode' && itemId) {
                    const item = this.formData.items.find(i => i.id === itemId);
                    if (!item) return;

                    // Toggle manual edit mode
                    item._manualCodeEdit = !item._manualCodeEdit;

                    const codeInput = e.target.closest('td')?.querySelector('input[data-field="productCode"]');
                    const btn = e.target.closest('button[data-action="editCode"]');

                    if (item._manualCodeEdit) {
                        // Switch to edit mode (Check icon)
                        if (codeInput) {
                            codeInput.disabled = false;
                            codeInput.style.background = '';
                            codeInput.focus();
                        }
                        if (btn) {
                            btn.style.background = '#dcfce7';
                            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                        }
                    } else {
                        // Switch to read-only mode (Pencil icon)
                        if (codeInput) {
                            codeInput.disabled = true;
                            codeInput.style.background = '#f9fafb';
                        }
                        if (btn) {
                            btn.style.background = 'white';
                            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
                        }
                    }
                } else if (action === 'delete' && itemId) {
                    this.removeItem(itemId);
                    this.refreshItemsTable();
                } else if (action === 'copy' && itemId) {
                    this.copyItem(itemId);
                    this.refreshItemsTable();
                } else if (action === 'variant' && itemId) {
                    // Open variant generator dialog
                    const item = this.formData.items.find(i => i.id === itemId);
                    if (item && window.variantGeneratorDialog) {
                        window.variantGeneratorDialog.open({
                            baseProduct: item,
                            onGenerate: (combinations, baseProduct) => {
                                if (combinations.length > 0) {
                                    // First combo updates the current item
                                    const first = combinations[0];
                                    item.variant = first.variant || first;
                                    item.selectedAttributeValueIds = first.selectedAttributeValueIds || [];

                                    // Remaining combos create new items
                                    for (let i = 1; i < combinations.length; i++) {
                                        const combo = combinations[i];
                                        const newItem = this.addItem();
                                        newItem.productName = baseProduct.productName;
                                        newItem.productCode = baseProduct.productCode;
                                        newItem.variant = combo.variant || combo;
                                        newItem.selectedAttributeValueIds = combo.selectedAttributeValueIds || [];
                                        newItem.purchasePrice = baseProduct.purchasePrice;
                                        newItem.sellingPrice = baseProduct.sellingPrice;
                                        newItem.quantity = baseProduct.quantity || 1;
                                    }

                                    this.refreshItemsTable();

                                    if (window.notificationManager) {
                                        window.notificationManager.success(`Đã tạo ${combinations.length} biến thể`);
                                    }
                                }
                            }
                        });
                    }
                } else if (action === 'applyVariants' && itemId) {
                    this.applyAllFieldsToVariants(itemId);
                } else if (action === 'inventory' && itemId) {
                    // Open inventory picker for this item
                    console.log('[FormModal-ROW] inventory action clicked for item:', itemId);
                    const item = this.formData.items.find(i => i.id === itemId);
                    if (item && window.inventoryPickerDialog) {
                        const formModal = this;
                        window.inventoryPickerDialog.open({
                            onSelect: function(products) {
                                console.log('[FormModal-ROW] Received products:', products.length);
                                if (products.length > 0) {
                                    // First product fills the current row
                                    const first = products[0];
                                    item.productName = first.name || '';
                                    item.productCode = first.code || '';
                                    item.purchasePrice = first.purchasePrice || 0;
                                    item.sellingPrice = first.sellingPrice || 0;
                                    if (first.image) {
                                        item.productImages = [first.image];
                                    }

                                    // Remaining products add new rows
                                    for (let i = 1; i < products.length; i++) {
                                        const product = products[i];
                                        const newItem = formModal.addItem();
                                        newItem.productName = product.name || '';
                                        newItem.productCode = product.code || '';
                                        newItem.purchasePrice = product.purchasePrice || 0;
                                        newItem.sellingPrice = product.sellingPrice || 0;
                                        if (product.image) {
                                            newItem.productImages = [product.image];
                                        }
                                    }

                                    formModal.refreshItemsTable();
                                }
                            }
                        });
                    }
                }
            });
        });

        // Bind image events for each row
        tbody.querySelectorAll('tr[data-item-id]').forEach(row => {
            const itemId = row.dataset.itemId;

            // Product images cell
            const productCell = row.querySelector('[data-image-type="product"]');
            if (productCell) {
                this.bindItemImageCellEvents(productCell, itemId, 'product');
            }

            // Price images cell
            const priceCell = row.querySelector('[data-image-type="price"]');
            if (priceCell) {
                this.bindItemImageCellEvents(priceCell, itemId, 'price');
            }
        });
    }

    /**
     * Handle save draft
     */
    async handleSaveDraft() {
        this.collectFormData();

        if (!this.formData.supplier) {
            alert('Vui lòng nhập tên nhà cung cấp');
            return;
        }

        // Show loading
        const btn = this.modalElement?.querySelector('#btnSaveDraft');
        const originalText = btn?.innerHTML;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = 'Đang lưu...';
        }

        try {
            // Upload pending images before saving
            if (this.hasPendingImages()) {
                if (window.notificationManager) {
                    window.notificationManager.show('Đang tải ảnh lên...', 'info');
                }
                await this.uploadPendingImages();
            }

            const orderData = this.getFormData();
            orderData.status = 'DRAFT';

            await this.onSubmit?.(orderData);
            this.close();
        } catch (error) {
            console.error('Save draft failed:', error);
            alert('Không thể lưu nháp: ' + error.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    }

    /**
     * Check if there are pending images to upload
     */
    hasPendingImages() {
        if (this.pendingImages.invoice.length > 0) return true;
        if (Object.keys(this.pendingImages.products).some(k => this.pendingImages.products[k].length > 0)) return true;
        if (Object.keys(this.pendingImages.prices).some(k => this.pendingImages.prices[k].length > 0)) return true;
        return false;
    }

    /**
     * Show validation errors as toast notification
     * @param {string[]} errors - Array of error messages
     */
    showValidationToast(errors) {
        const message = 'Không thể tạo đơn hàng:\n' + errors.map(e => '• ' + e).join('\n');
        if (window.notificationManager) {
            window.notificationManager.show(message, 'error');
        } else {
            alert(message);
        }
    }

    /**
     * Handle submit with settings-aware validation
     */
    async handleSubmit() {
        this.collectFormData();
        const validation = window.PurchaseOrderValidation;
        const settings = this.validationSettings || validation?.DEFAULT_VALIDATION_SETTINGS || {};

        // Step 1: Basic validation - supplier required
        if (!this.formData.supplier) {
            this.showValidationToast(['Vui lòng nhập tên nhà cung cấp']);
            return;
        }

        // Step 2: Settings-aware item validation (7 configurable rules)
        const nonEmptyItems = this.formData.items.filter(i => i.productName && i.productName.trim());
        if (validation?.validateItemsWithSettings) {
            const { isValid, invalidFields } = validation.validateItemsWithSettings(nonEmptyItems, settings);
            if (!isValid) {
                this.showValidationToast(invalidFields);
                return;
            }
        } else {
            // Fallback: basic items check
            if (nonEmptyItems.length === 0) {
                this.showValidationToast(['Vui lòng thêm ít nhất một sản phẩm']);
                return;
            }
        }

        // Step 3: Price settings validation (min/max/margin)
        if (validation?.validatePriceSettings) {
            const priceErrors = [];
            nonEmptyItems.forEach((item, index) => {
                const purchasePrice = parseFloat(String(item.purchasePrice).replace(/[,.]/g, '')) || 0;
                const sellingPrice = parseFloat(String(item.sellingPrice).replace(/[,.]/g, '')) || 0;
                const errors = validation.validatePriceSettings(purchasePrice, sellingPrice, index + 1, settings);
                priceErrors.push(...errors);
            });
            if (priceErrors.length > 0) {
                this.showValidationToast(priceErrors);
                return;
            }
        }

        // Step 4: Proceed with submission
        const btn = this.modalElement?.querySelector('#btnSubmit');
        const originalText = btn?.innerHTML;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = 'Đang tạo đơn...';
        }

        try {
            // Upload pending images before submitting
            if (this.hasPendingImages()) {
                if (window.notificationManager) {
                    window.notificationManager.show('Đang tải ảnh lên Firebase...', 'info');
                }
                await this.uploadPendingImages();
                if (window.notificationManager) {
                    window.notificationManager.show('Đã tải ảnh lên thành công!', 'success');
                }
            }

            const orderData = this.getFormData();
            orderData.status = 'AWAITING_PURCHASE';

            await this.onSubmit?.(orderData);
            this.close();
        } catch (error) {
            console.error('Submit failed:', error);
            if (window.notificationManager) {
                window.notificationManager.show('Không thể tạo đơn hàng: ' + error.message, 'error');
            } else {
                alert('Không thể tạo đơn hàng: ' + error.message);
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    }

    /**
     * Collect form data from inputs (top-level + item-level)
     */
    collectFormData() {
        // Top-level fields
        this.formData.supplier = this.modalElement?.querySelector('#inputSupplier')?.value || '';
        this.formData.orderDate = this.modalElement?.querySelector('#inputOrderDate')?.value || '';
        this.formData.invoiceAmount = this.modalElement?.querySelector('#inputInvoiceAmount')?.value || '';
        this.formData.notes = this.modalElement?.querySelector('#inputNotes')?.value || '';
        this.formData.discountAmount = this.modalElement?.querySelector('#inputDiscount')?.value || '';

        // Item-level fields: sync DOM input values back to formData.items
        const tbody = this.modalElement?.querySelector('#itemsTableBody');
        if (tbody) {
            tbody.querySelectorAll('tr[data-item-id]').forEach(row => {
                const itemId = row.dataset.itemId;
                const item = this.formData.items.find(i => i.id === itemId);
                if (!item) return;

                row.querySelectorAll('input[data-field]').forEach(input => {
                    const field = input.dataset.field;
                    if (field) {
                        item[field] = input.value;
                    }
                });
            });
        }

        console.log('[FormModal] collectFormData - items:', this.formData.items.map(i => ({
            name: i.productName, variant: i.variant, attrIds: (i.selectedAttributeValueIds || []).length
        })));
    }

    /**
     * Get form data for submission
     */
    getFormData() {
        const totals = this.calculateTotals();

        const result = {
            supplier: {
                name: this.formData.supplier,
                code: this.formData.supplier.substring(0, 3).toUpperCase()
            },
            orderDate: new Date(this.formData.orderDate),
            invoiceAmount: parseFloat(String(this.formData.invoiceAmount).replace(/[,.]/g, '')) || 0,
            invoiceImages: this.formData.invoiceImages,
            notes: this.formData.notes,
            discountAmount: totals.discount,
            shippingFee: totals.shipping,
            totalAmount: totals.totalAmount,
            finalAmount: totals.finalAmount,
            items: this.formData.items.map(item => ({
                ...item,
                purchasePrice: parseFloat(String(item.purchasePrice).replace(/[,.]/g, '')) || 0,
                sellingPrice: parseFloat(String(item.sellingPrice).replace(/[,.]/g, '')) || 0,
                quantity: parseInt(item.quantity) || 1,
                subtotal: (parseFloat(String(item.purchasePrice).replace(/[,.]/g, '')) || 0) * (parseInt(item.quantity) || 1)
            }))
        };

        console.log('[FormModal] getFormData - items:', result.items.map(i => ({
            name: i.productName, variant: i.variant, attrIds: (i.selectedAttributeValueIds || []).length
        })));

        return result;
    }
}

// Export singleton
window.purchaseOrderFormModal = new PurchaseOrderFormModal();

console.log('[Purchase Orders] Form modal loaded successfully');
