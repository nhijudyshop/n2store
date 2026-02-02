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
            invoiceImages: [],
            notes: '',
            discountAmount: '',
            shippingFee: '',
            items: []
        };

        this.itemCounter = 0;
    }

    /**
     * Open modal for creating new order
     */
    openCreate(options = {}) {
        this.isEdit = false;
        this.order = null;
        this.resetFormData();
        this.addItem(); // Add one empty item by default

        this.onSubmit = options.onSubmit;
        this.onCancel = options.onCancel;

        this.render();
    }

    /**
     * Open modal for editing existing order
     */
    openEdit(order, options = {}) {
        this.isEdit = true;
        this.order = order;
        this.loadOrderData(order);

        this.onSubmit = options.onSubmit;
        this.onCancel = options.onCancel;

        this.render();
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
                id: item.id || `item_${index}`
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
            priceImages: []
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
            productImages: [...(sourceItem.productImages || [])],
            priceImages: [...(sourceItem.priceImages || [])]
        };
        this.formData.items.push(newItem);
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
                max-width: 1400px;
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
                            ">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                    <polyline points="21,15 16,10 5,21"></polyline>
                                </svg>
                                <span>Ctrl+V</span>
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
                                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">Thao tác</th>
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
            const subtotal = (parseFloat(String(item.purchasePrice).replace(/[,.]/g, '')) || 0) * (parseInt(item.quantity) || 0);

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
                            <input type="text" data-field="productCode" value="${item.productCode || ''}" placeholder="Mã SP" style="
                                width: 80px;
                                height: 36px;
                                padding: 0 8px;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                font-size: 13px;
                                box-sizing: border-box;
                            ">
                            <button type="button" style="
                                width: 32px;
                                height: 36px;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                background: white;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            ">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
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
                            border: 2px solid #ef4444;
                            border-radius: 6px;
                            font-size: 13px;
                            text-align: right;
                            background: #fef2f2;
                            box-sizing: border-box;
                        ">
                    </td>
                    <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6;">
                        <input type="text" data-field="sellingPrice" value="${this.formatNumber(item.sellingPrice)}" placeholder="0" style="
                            width: 100px;
                            height: 36px;
                            padding: 0 8px;
                            border: 2px solid #ef4444;
                            border-radius: 6px;
                            font-size: 13px;
                            text-align: right;
                            background: #fef2f2;
                            box-sizing: border-box;
                        ">
                    </td>
                    <td style="padding: 12px 8px; text-align: right; border-bottom: 1px solid #f3f4f6; font-weight: 600;">
                        ${this.formatNumber(subtotal)} đ
                    </td>
                    <td style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #f3f4f6;">
                        <div data-type="product" style="
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
                        ">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                <polyline points="21,15 16,10 5,21"></polyline>
                            </svg>
                            <span>Ctrl+V</span>
                        </div>
                    </td>
                    <td style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #f3f4f6;">
                        <div data-type="price" style="
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
                        ">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                <polyline points="21,15 16,10 5,21"></polyline>
                            </svg>
                            <span>Ctrl+V</span>
                        </div>
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

        // Close button
        this.modalElement.querySelector('#btnCloseModal')?.addEventListener('click', () => this.close());
        this.modalElement.querySelector('#btnCancel')?.addEventListener('click', () => {
            this.onCancel?.();
            this.close();
        });

        // Close on overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                this.close();
            }
        });

        // Add product button
        this.modalElement.querySelector('#btnAddProduct')?.addEventListener('click', () => {
            this.addItem();
            this.refreshItemsTable();
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

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modalElement) {
                this.close();
            }
        });

        // Bind item events
        this.bindItemEvents();
    }

    /**
     * Bind item-specific events
     */
    bindItemEvents() {
        const tbody = this.modalElement?.querySelector('#itemsTableBody');
        if (!tbody) return;

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
                }
            });
        });

        // Action buttons
        tbody.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const row = e.target.closest('tr');
                const itemId = row?.dataset.itemId;
                const action = e.target.closest('button').dataset.action;

                if (action === 'delete' && itemId) {
                    this.removeItem(itemId);
                    this.refreshItemsTable();
                } else if (action === 'copy' && itemId) {
                    this.copyItem(itemId);
                    this.refreshItemsTable();
                }
            });
        });
    }

    /**
     * Handle save draft
     */
    async handleSaveDraft() {
        this.collectFormData();

        const orderData = this.getFormData();
        orderData.status = 'DRAFT';

        if (!this.formData.supplier) {
            alert('Vui lòng nhập tên nhà cung cấp');
            return;
        }

        try {
            await this.onSubmit?.(orderData);
            this.close();
        } catch (error) {
            console.error('Save draft failed:', error);
            alert('Không thể lưu nháp: ' + error.message);
        }
    }

    /**
     * Handle submit
     */
    async handleSubmit() {
        this.collectFormData();

        const orderData = this.getFormData();
        orderData.status = 'AWAITING_PURCHASE';

        if (!this.formData.supplier) {
            alert('Vui lòng nhập tên nhà cung cấp');
            return;
        }

        if (this.formData.items.length === 0) {
            alert('Vui lòng thêm ít nhất một sản phẩm');
            return;
        }

        try {
            await this.onSubmit?.(orderData);
            this.close();
        } catch (error) {
            console.error('Submit failed:', error);
            alert('Không thể tạo đơn hàng: ' + error.message);
        }
    }

    /**
     * Collect form data from inputs
     */
    collectFormData() {
        this.formData.supplier = this.modalElement?.querySelector('#inputSupplier')?.value || '';
        this.formData.orderDate = this.modalElement?.querySelector('#inputOrderDate')?.value || '';
        this.formData.invoiceAmount = this.modalElement?.querySelector('#inputInvoiceAmount')?.value || '';
        this.formData.notes = this.modalElement?.querySelector('#inputNotes')?.value || '';
        this.formData.discountAmount = this.modalElement?.querySelector('#inputDiscount')?.value || '';
    }

    /**
     * Get form data for submission
     */
    getFormData() {
        const totals = this.calculateTotals();

        return {
            supplier: {
                name: this.formData.supplier,
                id: this.formData.supplier.substring(0, 3).toUpperCase()
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
    }
}

// Export singleton
window.purchaseOrderFormModal = new PurchaseOrderFormModal();

console.log('[Purchase Orders] Form modal loaded successfully');
