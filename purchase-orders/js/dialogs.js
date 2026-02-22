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
// Matches: VariantGeneratorDialog.tsx - Checkbox-based attribute selection
// ========================================

class VariantGeneratorDialog {
    constructor() {
        this.modalElement = null;
        this.onGenerate = null;
        this.baseProduct = null;

        // Predefined attribute options
        this.attributeConfig = {
            color: {
                name: 'Màu',
                values: ['Trắng', 'Đen', 'Đỏ', 'Xanh', 'Xám', 'Nude', 'Vàng', 'Hồng', 'Nâu', 'Cam', 'Tím', 'Be', 'Kem']
            },
            sizeNumber: {
                name: 'Size Số',
                values: ['1', '2', '3', '4', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40']
            },
            sizeLetter: {
                name: 'Size Chữ',
                values: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Freesize']
            }
        };

        // Selected values for each attribute
        this.selected = {
            color: [],
            sizeNumber: [],
            sizeLetter: []
        };

        // Search filters
        this.searchFilters = {
            color: '',
            sizeNumber: '',
            sizeLetter: ''
        };
    }

    /**
     * Open variant generator dialog
     * @param {Object} options - { baseProduct, onGenerate }
     */
    open(options = {}) {
        this.baseProduct = options.baseProduct || {};
        this.onGenerate = options.onGenerate;

        // Reset selections
        this.selected = {
            color: [],
            sizeNumber: [],
            sizeLetter: []
        };
        this.searchFilters = {
            color: '',
            sizeNumber: '',
            sizeLetter: ''
        };

        this.render();
    }

    close() {
        if (this.modalElement) {
            this.modalElement.remove();
            this.modalElement = null;
        }
    }

    /**
     * Generate all variant combinations from selected values
     * @returns {Array} Array of variant strings
     */
    generateCombinations() {
        const selectedArrays = [];

        if (this.selected.color.length > 0) {
            selectedArrays.push(this.selected.color);
        }
        if (this.selected.sizeNumber.length > 0) {
            selectedArrays.push(this.selected.sizeNumber);
        }
        if (this.selected.sizeLetter.length > 0) {
            selectedArrays.push(this.selected.sizeLetter);
        }

        if (selectedArrays.length === 0) return [];

        // Cartesian product
        const combine = (arrays) => {
            if (arrays.length === 0) return [[]];
            const [first, ...rest] = arrays;
            const restCombinations = combine(rest);
            const result = [];
            for (const value of first) {
                for (const combo of restCombinations) {
                    result.push([value, ...combo]);
                }
            }
            return result;
        };

        const combinations = combine(selectedArrays);
        return combinations.map(combo => combo.join(' / '));
    }

    /**
     * Get selected values summary for header display
     */
    getSelectedSummary() {
        const parts = [];
        if (this.selected.color.length > 0) {
            parts.push(this.selected.color.join(', '));
        }
        if (this.selected.sizeNumber.length > 0) {
            parts.push(this.selected.sizeNumber.join(', '));
        }
        if (this.selected.sizeLetter.length > 0) {
            parts.push(this.selected.sizeLetter.join(', '));
        }
        return parts.length > 0 ? parts.join(' | ') : 'Chưa chọn giá trị nào';
    }

    render() {
        if (this.modalElement) {
            this.modalElement.remove();
        }

        const combinations = this.generateCombinations();

        this.modalElement = document.createElement('div');
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
            z-index: 1000000;
            padding: 20px;
        `;

        this.modalElement.innerHTML = `
            <div style="
                background: white;
                border-radius: 12px;
                width: 100%;
                max-width: 1100px;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            ">
                <!-- Header -->
                <div style="
                    padding: 16px 20px;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Tạo biến thể từ thuộc tính</h2>
                    <button type="button" id="btnCloseVariant" style="
                        background: none;
                        border: none;
                        padding: 8px;
                        cursor: pointer;
                        border-radius: 6px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #6b7280;
                    ">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <!-- Selected Summary -->
                <div style="
                    padding: 12px 20px;
                    background: #f9fafb;
                    border-bottom: 1px solid #e5e7eb;
                    font-size: 14px;
                    color: #6b7280;
                " id="selectedSummary">
                    ${this.getSelectedSummary()}
                </div>

                <!-- Body -->
                <div style="flex: 1; overflow-y: auto; padding: 20px;">
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; height: 100%;">
                        <!-- Màu Column -->
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; display: flex; flex-direction: column;">
                            <div style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Màu</div>
                            <div style="padding: 8px;">
                                <input type="text" placeholder="Tìm kiếm..." data-search="color" style="
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid #d1d5db;
                                    border-radius: 6px;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                ">
                            </div>
                            <div style="flex: 1; overflow-y: auto; padding: 8px; max-height: 300px;" id="colorList">
                                ${this.renderCheckboxList('color')}
                            </div>
                        </div>

                        <!-- Size Số Column -->
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; display: flex; flex-direction: column;">
                            <div style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Size Số</div>
                            <div style="padding: 8px;">
                                <input type="text" placeholder="Tìm kiếm..." data-search="sizeNumber" style="
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid #d1d5db;
                                    border-radius: 6px;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                ">
                            </div>
                            <div style="flex: 1; overflow-y: auto; padding: 8px; max-height: 300px;" id="sizeNumberList">
                                ${this.renderCheckboxList('sizeNumber')}
                            </div>
                        </div>

                        <!-- Size Chữ Column -->
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; display: flex; flex-direction: column;">
                            <div style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Size Chữ</div>
                            <div style="padding: 8px;">
                                <input type="text" placeholder="Tìm kiếm..." data-search="sizeLetter" style="
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid #d1d5db;
                                    border-radius: 6px;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                ">
                            </div>
                            <div style="flex: 1; overflow-y: auto; padding: 8px; max-height: 300px;" id="sizeLetterList">
                                ${this.renderCheckboxList('sizeLetter')}
                            </div>
                        </div>

                        <!-- Variant Preview Column -->
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; display: flex; flex-direction: column;">
                            <div style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Danh sách Biến Thể</div>
                            <div style="flex: 1; overflow-y: auto; padding: 12px; max-height: 350px;" id="variantPreviewList">
                                ${combinations.length > 0
                                    ? combinations.map(v => `<div style="padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px;">${v}</div>`).join('')
                                    : '<p style="color: #9ca3af; text-align: center; padding: 40px 20px;">Chọn giá trị thuộc tính<br>để tạo biến thể</p>'
                                }
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="
                    padding: 16px 20px;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    background: #f9fafb;
                ">
                    <button type="button" id="btnCancelVariant" style="
                        padding: 10px 20px;
                        border: 1px solid #d1d5db;
                        border-radius: 8px;
                        background: white;
                        cursor: pointer;
                        font-size: 14px;
                    ">Hủy</button>
                    <button type="button" id="btnGenerateVariants" style="
                        padding: 10px 20px;
                        border: none;
                        border-radius: 8px;
                        background: ${combinations.length > 0 ? '#3b82f6' : '#9ca3af'};
                        color: white;
                        cursor: ${combinations.length > 0 ? 'pointer' : 'not-allowed'};
                        font-size: 14px;
                        font-weight: 500;
                    " ${combinations.length === 0 ? 'disabled' : ''}>Tạo ${combinations.length} biến thể</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);
        this.bindEvents();
    }

    renderCheckboxList(attributeKey) {
        const config = this.attributeConfig[attributeKey];
        const selected = this.selected[attributeKey];
        const filter = this.searchFilters[attributeKey].toLowerCase();

        const filteredValues = config.values.filter(v =>
            !filter || v.toLowerCase().includes(filter)
        );

        return filteredValues.map(value => `
            <label style="
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px;
                cursor: pointer;
                border-radius: 4px;
                transition: background 0.15s;
            " onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
                <input type="checkbox"
                       data-attribute="${attributeKey}"
                       value="${value}"
                       ${selected.includes(value) ? 'checked' : ''}
                       style="width: 16px; height: 16px; accent-color: #3b82f6;">
                <span style="font-size: 14px;">${value}</span>
            </label>
        `).join('');
    }

    updateUI() {
        // Update summary
        const summaryEl = this.modalElement?.querySelector('#selectedSummary');
        if (summaryEl) {
            summaryEl.textContent = this.getSelectedSummary();
        }

        // Update checkbox lists
        ['color', 'sizeNumber', 'sizeLetter'].forEach(key => {
            const listEl = this.modalElement?.querySelector(`#${key}List`);
            if (listEl) {
                listEl.innerHTML = this.renderCheckboxList(key);
            }
        });

        // Update preview
        const combinations = this.generateCombinations();
        const previewEl = this.modalElement?.querySelector('#variantPreviewList');
        if (previewEl) {
            previewEl.innerHTML = combinations.length > 0
                ? combinations.map(v => `<div style="padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px;">${v}</div>`).join('')
                : '<p style="color: #9ca3af; text-align: center; padding: 40px 20px;">Chọn giá trị thuộc tính<br>để tạo biến thể</p>';
        }

        // Update button
        const btnGenerate = this.modalElement?.querySelector('#btnGenerateVariants');
        if (btnGenerate) {
            btnGenerate.textContent = `Tạo ${combinations.length} biến thể`;
            btnGenerate.disabled = combinations.length === 0;
            btnGenerate.style.background = combinations.length > 0 ? '#3b82f6' : '#9ca3af';
            btnGenerate.style.cursor = combinations.length > 0 ? 'pointer' : 'not-allowed';
        }
    }

    bindEvents() {
        if (!this.modalElement) return;

        // Close buttons
        this.modalElement.querySelector('#btnCloseVariant')?.addEventListener('click', () => this.close());
        this.modalElement.querySelector('#btnCancelVariant')?.addEventListener('click', () => this.close());

        // Overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) this.close();
        });

        // Escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // Checkbox changes
        this.modalElement.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox' && e.target.dataset.attribute) {
                const attr = e.target.dataset.attribute;
                const value = e.target.value;

                if (e.target.checked) {
                    if (!this.selected[attr].includes(value)) {
                        this.selected[attr].push(value);
                    }
                } else {
                    this.selected[attr] = this.selected[attr].filter(v => v !== value);
                }

                this.updateUI();
            }
        });

        // Search inputs
        this.modalElement.addEventListener('input', (e) => {
            if (e.target.dataset.search) {
                const attr = e.target.dataset.search;
                this.searchFilters[attr] = e.target.value;

                // Update only this column's list
                const listEl = this.modalElement?.querySelector(`#${attr}List`);
                if (listEl) {
                    listEl.innerHTML = this.renderCheckboxList(attr);
                }
            }
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
        // Use higher z-index to appear above the form modal (which uses 99999)
        this.modalElement.style.zIndex = '999999';
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
// Uses TPOS API: ExportFileWithStandardPriceV2 for list, /odata/Product({id}) for details
// ========================================

class InventoryPickerDialog {
    constructor() {
        this.modalElement = null;
        this.products = [];           // Raw products from TPOS (Id, code, name, purchasePrice, costPrice)
        this.filteredProducts = [];   // Filtered by search
        this.selectedProducts = new Map(); // Products with full details (after fetching)
        this.onSelect = null;
        this.searchTerm = '';
        this.isLoading = false;
        this.proxyUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    }

    /**
     * Get auth token from localStorage or tokenManager
     */
    async getAuthToken() {
        // Try tokenManager first
        if (window.tokenManager?.getToken) {
            try {
                return await window.tokenManager.getToken();
            } catch (e) {
                console.warn('tokenManager.getToken failed:', e);
            }
        }

        // Fallback to localStorage
        const tokenData = localStorage.getItem('bearer_token_data');
        if (tokenData) {
            try {
                const parsed = JSON.parse(tokenData);
                return parsed.access_token || parsed.token;
            } catch (e) {
                console.warn('Failed to parse token from localStorage');
            }
        }

        return null;
    }

    /**
     * Open inventory picker dialog
     * @param {Object} options - { onSelect }
     */
    async open(options = {}) {
        this.onSelect = options.onSelect;
        this.selectedProducts = new Map();
        this.searchTerm = '';

        this.render();
        this.show();

        // Load products from TPOS API
        await this.loadProductsFromTPOS();
        this.updateProductsList();
    }

    /**
     * localStorage key for caching product list
     */
    static CACHE_KEY = 'inventory_products_cache';
    static CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

    /**
     * Load products from TPOS ExportFileWithStandardPriceV2 API (Excel file)
     * Parse Excel using XLSX library and cache in localStorage
     * @param {boolean} forceReload - Force fetch from API instead of cache
     */
    async loadProductsFromTPOS(forceReload = false) {
        this.isLoading = true;
        this.updateLoadingState(true);

        try {
            // Check localStorage cache first
            if (!forceReload) {
                const cached = this.loadFromCache();
                if (cached) {
                    this.products = cached;
                    this.filteredProducts = [...this.products];
                    console.log(`[InventoryPicker] Loaded ${this.products.length} products from cache`);
                    return;
                }
            }

            const token = await this.getAuthToken();
            if (!token) {
                throw new Error('Không có token xác thực');
            }

            // Fetch Excel file from TPOS
            const response = await fetch(`${this.proxyUrl}/api/Product/ExportFileWithStandardPriceV2`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'feature-version': '2'
                },
                body: JSON.stringify({
                    model: { Active: 'true' },
                    ids: ''
                })
            });

            if (!response.ok) {
                throw new Error(`TPOS API error: ${response.status}`);
            }

            // Response is Excel binary - parse with XLSX library
            const arrayBuffer = await response.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);

            if (typeof XLSX === 'undefined') {
                throw new Error('XLSX library not loaded');
            }

            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Convert to JSON array (first row is header)
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

            console.log('[InventoryPicker] Excel parsed, first row:', jsonData[0]);

            // Map Excel data to our format
            // Excel columns: ID, Mã sản phẩm, Tên sản phẩm, Giá vốn, ...
            this.products = jsonData.map(row => ({
                id: row['ID'] || row['Id'] || row['id'] || 0,
                code: row['Mã sản phẩm'] || row['DefaultCode'] || row['Mã SP'] || '',
                name: row['Tên sản phẩm'] || row['NameTemplate'] || row['Tên SP'] || '',
                purchasePrice: parseFloat(row['Giá vốn'] || row['StandardPrice'] || 0),
                sellingPrice: parseFloat(row['Giá bán'] || row['ListPrice'] || row['PriceVariant'] || 0)
            })).filter(p => p.id); // Filter out empty rows

            this.filteredProducts = [...this.products];

            // Save to localStorage cache
            this.saveToCache(this.products);

            console.log(`[InventoryPicker] Loaded ${this.products.length} products from TPOS Excel`);

            if (window.notificationManager && forceReload) {
                window.notificationManager.success(`Đã tải ${this.products.length} sản phẩm từ TPOS`);
            }

        } catch (error) {
            console.error('Error loading products from TPOS:', error);

            // Try fallback to cache even on error
            const cached = this.loadFromCache();
            if (cached) {
                this.products = cached;
                this.filteredProducts = [...this.products];
                console.log(`[InventoryPicker] Error occurred, fallback to cache: ${this.products.length} products`);
                if (window.notificationManager) {
                    window.notificationManager.warning('Không thể tải từ TPOS, đang dùng dữ liệu đã lưu');
                }
            } else {
                this.products = [];
                this.filteredProducts = [];
                if (window.notificationManager) {
                    window.notificationManager.error('Không thể tải danh sách sản phẩm: ' + error.message);
                }
            }
        } finally {
            this.isLoading = false;
            this.updateLoadingState(false);
        }
    }

    /**
     * Load products from localStorage cache
     * @returns {Array|null} Cached products or null if expired/not found
     */
    loadFromCache() {
        try {
            const cached = localStorage.getItem(InventoryPickerDialog.CACHE_KEY);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);

            // Check expiry
            if (Date.now() - timestamp > InventoryPickerDialog.CACHE_EXPIRY) {
                console.log('[InventoryPicker] Cache expired');
                localStorage.removeItem(InventoryPickerDialog.CACHE_KEY);
                return null;
            }

            return data;
        } catch (e) {
            console.warn('[InventoryPicker] Failed to load from cache:', e);
            return null;
        }
    }

    /**
     * Save products to localStorage cache
     * @param {Array} products - Products to cache
     */
    saveToCache(products) {
        try {
            const cacheData = {
                data: products,
                timestamp: Date.now()
            };
            localStorage.setItem(InventoryPickerDialog.CACHE_KEY, JSON.stringify(cacheData));
            console.log(`[InventoryPicker] Saved ${products.length} products to cache`);
        } catch (e) {
            console.warn('[InventoryPicker] Failed to save to cache:', e);
        }
    }

    /**
     * Reload products from TPOS API (clear cache)
     */
    async reloadProducts() {
        await this.loadProductsFromTPOS(true);
        this.updateProductsList();
    }

    /**
     * Fetch product details from TPOS by ID
     * @param {number} productId - Product ID
     * @returns {Object} Product details with ImageUrl, DefaultCode, NameTemplate, QtyAvailable, StandardPrice, PriceVariant
     */
    async fetchProductDetails(productId) {
        try {
            const token = await this.getAuthToken();
            if (!token) {
                throw new Error('Không có token xác thực');
            }

            const response = await fetch(
                `${this.proxyUrl}/api/odata/Product(${productId})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json',
                        'feature-version': '2',
                        'tposappversion': '6.2.6.1'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`TPOS API error: ${response.status}`);
            }

            const data = await response.json();

            // Map to our format
            return {
                id: data.Id,
                code: data.DefaultCode || data.Barcode || '',
                name: data.NameTemplate || data.Name || '',
                image: data.ImageUrl || (data.Thumbnails && data.Thumbnails[2]) || '',
                qtyAvailable: data.QtyAvailable || 0,
                purchasePrice: data.StandardPrice || 0,
                sellingPrice: data.PriceVariant || data.ListPrice || 0,
                variant: data.DisplayAttributeValues || '',
                // Keep original data for reference
                _raw: data
            };

        } catch (error) {
            console.error(`Error fetching product ${productId}:`, error);
            return null;
        }
    }

    /**
     * Update loading state in UI
     */
    updateLoadingState(loading) {
        const listContainer = this.modalElement?.querySelector('#inventoryProductsList');
        const countText = this.modalElement?.querySelector('#productCountText');

        if (loading) {
            if (listContainer) {
                listContainer.innerHTML = `
                    <div style="padding: 60px 20px; text-align: center; color: #9ca3af;">
                        <div style="width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 12px;"></div>
                        <p>Đang tải sản phẩm từ TPOS...</p>
                    </div>
                    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
                `;
            }
            if (countText) countText.textContent = 'Đang tải...';
        }
    }

    close() {
        if (this.modalElement) {
            this.modalElement.remove();
            this.modalElement = null;
        }
    }

    show() {
        if (this.modalElement) {
            this.modalElement.style.display = 'flex';
            // Focus search input
            setTimeout(() => {
                this.modalElement.querySelector('#inventorySearchInput')?.focus();
            }, 100);
        }
    }

    render() {
        if (this.modalElement) {
            this.modalElement.remove();
        }

        this.modalElement = document.createElement('div');
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
            z-index: 1000000;
            padding: 20px;
        `;

        this.modalElement.innerHTML = `
            <div style="
                background: white;
                border-radius: 12px;
                width: 100%;
                max-width: 1000px;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            ">
                <!-- Header -->
                <div style="
                    padding: 16px 20px;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Chọn sản phẩm từ kho</h2>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button type="button" id="btnReloadInventory" title="Tải lại danh sách sản phẩm từ TPOS" style="
                            background: none;
                            border: 1px solid #d1d5db;
                            padding: 6px 12px;
                            cursor: pointer;
                            border-radius: 6px;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            color: #374151;
                            font-size: 13px;
                            transition: all 0.15s;
                        ">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="reloadIcon">
                                <polyline points="23 4 23 10 17 10"></polyline>
                                <polyline points="1 20 1 14 7 14"></polyline>
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                            </svg>
                            Tải lại
                        </button>
                        <button type="button" id="btnCloseInventory" style="
                            background: none;
                            border: none;
                            padding: 8px;
                            cursor: pointer;
                            border-radius: 6px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: #6b7280;
                        ">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Search -->
                <div style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                    <input type="text" id="inventorySearchInput" placeholder="Tìm kiếm theo mã SP, tên, variant (tối thiểu 2 ký tự)..." style="
                        width: 100%;
                        padding: 10px 14px;
                        border: 1px solid #d1d5db;
                        border-radius: 8px;
                        font-size: 14px;
                        box-sizing: border-box;
                    ">
                    <p id="productCountText" style="margin: 8px 0 0; font-size: 13px; color: #6b7280;">
                        Hiển thị ${this.filteredProducts.length} sản phẩm mới nhất
                    </p>
                </div>

                <!-- Products List -->
                <div style="flex: 1; overflow-y: auto; padding: 0;" id="inventoryProductsList">
                    ${this.renderProductsList()}
                </div>

                <!-- Footer -->
                <div style="
                    padding: 12px 20px;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #f9fafb;
                ">
                    <div style="font-size: 13px; color: #6b7280;">
                        Đã chọn: <span id="selectedCount" style="font-weight: 600; color: #3b82f6;">${this.selectedProducts.size}</span> sản phẩm
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button type="button" id="btnCancelInventory" style="
                            padding: 8px 16px;
                            border: 1px solid #d1d5db;
                            border-radius: 8px;
                            background: white;
                            cursor: pointer;
                            font-size: 14px;
                        ">Hủy</button>
                        <button type="button" id="btnAddSelectedProducts" style="
                            padding: 8px 16px;
                            border: none;
                            border-radius: 8px;
                            background: #3b82f6;
                            color: white;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                        ">Thêm sản phẩm đã chọn</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);
        this.bindEvents();
    }

    renderProductsList() {
        if (this.isLoading) {
            return `
                <div style="padding: 60px 20px; text-align: center; color: #9ca3af;">
                    <p>Đang tải sản phẩm...</p>
                </div>
            `;
        }

        if (this.filteredProducts.length === 0) {
            return `
                <div style="padding: 60px 20px; text-align: center; color: #9ca3af;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin: 0 auto 12px; display: block; opacity: 0.5;">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    </svg>
                    <p>Không tìm thấy sản phẩm</p>
                </div>
            `;
        }

        return `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f9fafb;">
                        <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 60px;">Hình ảnh</th>
                        <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 80px;">Mã SP</th>
                        <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb;">Tên sản phẩm</th>
                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 80px;">Variant</th>
                        <th style="padding: 12px 8px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 100px;">Giá mua</th>
                        <th style="padding: 12px 8px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 100px;">Giá bán</th>
                        <th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 50px;"></th>
                    </tr>
                </thead>
                <tbody>
                    ${this.filteredProducts.map(product => {
                        const isSelected = this.selectedProducts.has(String(product.id));
                        const imageUrl = product.image || '';
                        const productCode = product.code || '';
                        const productName = product.name || '';
                        const variant = product.variant || '-';
                        const purchasePrice = product.purchasePrice || 0;
                        const sellingPrice = product.sellingPrice || 0;

                        return `
                            <tr data-product-id="${product.id}" style="
                                cursor: pointer;
                                transition: background 0.15s;
                                ${isSelected ? 'background: #eff6ff;' : ''}
                            " onmouseover="if(!this.dataset.selected)this.style.background='#f9fafb'" onmouseout="if(!this.dataset.selected)this.style.background='${isSelected ? '#eff6ff' : 'transparent'}'" ${isSelected ? 'data-selected="true"' : ''}>
                                <td style="padding: 10px 16px; border-bottom: 1px solid #f3f4f6;">
                                    ${imageUrl
                                        ? `<img src="${imageUrl}" alt="" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb;">`
                                        : `<div style="width: 40px; height: 40px; background: #f3f4f6; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                                <polyline points="21,15 16,10 5,21"></polyline>
                                            </svg>
                                        </div>`
                                    }
                                </td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; font-weight: 500; color: #3b82f6;">${productCode || '-'}</td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6;">${productName}</td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: center; color: #6b7280;">${variant}</td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: right;">${this.formatPrice(purchasePrice)}</td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: right;">${this.formatPrice(sellingPrice)}</td>
                                <td style="padding: 10px 16px; border-bottom: 1px solid #f3f4f6; text-align: center;">
                                    <input type="checkbox" ${isSelected ? 'checked' : ''} style="
                                        width: 18px;
                                        height: 18px;
                                        accent-color: #3b82f6;
                                        cursor: pointer;
                                    ">
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * Format price in VND
     */
    formatPrice(value) {
        if (!value || value === 0) return '-';
        const num = parseFloat(value);
        if (isNaN(num)) return '-';
        return num.toLocaleString('vi-VN') + ' đ';
    }

    /**
     * Update products list in UI
     */
    updateProductsList() {
        const listContainer = this.modalElement?.querySelector('#inventoryProductsList');
        const countText = this.modalElement?.querySelector('#productCountText');

        if (listContainer) {
            listContainer.innerHTML = this.renderProductsList();
        }
        if (countText) {
            countText.textContent = `Hiển thị ${this.filteredProducts.length} sản phẩm mới nhất`;
        }
    }

    /**
     * Filter products by search term (min 2 characters)
     * Search by: Mã SP (code) and Tên sản phẩm (name)
     */
    filterProducts(term) {
        this.searchTerm = term.toLowerCase().trim();

        // Require at least 2 characters
        if (this.searchTerm.length < 2) {
            this.filteredProducts = [...this.products];
        } else {
            this.filteredProducts = this.products.filter(p => {
                const name = (p.name || '').toLowerCase();
                const code = (p.code || '').toLowerCase();

                return name.includes(this.searchTerm) || code.includes(this.searchTerm);
            });
        }

        this.updateProductsList();
    }

    /**
     * Update selected count in footer
     */
    updateSelectedCount() {
        const countEl = this.modalElement?.querySelector('#selectedCount');
        if (countEl) {
            countEl.textContent = this.selectedProducts.size;
        }
    }

    /**
     * Handle product selection - fetch full details from TPOS
     */
    async handleProductSelect(productId, row) {
        const productIdStr = String(productId);

        // If already selected, deselect
        if (this.selectedProducts.has(productIdStr)) {
            this.selectedProducts.delete(productIdStr);
            row.style.background = 'transparent';
            row.removeAttribute('data-selected');
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = false;
            this.updateSelectedCount();
            return;
        }

        // Show loading on this row
        row.style.opacity = '0.6';
        row.style.pointerEvents = 'none';

        try {
            // Fetch full product details from TPOS
            const productDetails = await this.fetchProductDetails(productId);

            if (productDetails) {
                this.selectedProducts.set(productIdStr, productDetails);
                row.style.background = '#eff6ff';
                row.setAttribute('data-selected', 'true');

                // Update row with fetched image if available
                if (productDetails.image) {
                    const imgCell = row.querySelector('td:first-child');
                    if (imgCell) {
                        imgCell.innerHTML = `<img src="${productDetails.image}" alt="" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb;">`;
                    }
                }
            } else {
                // Fallback: use basic product info
                const basicProduct = this.products.find(p => String(p.id) === productIdStr);
                if (basicProduct) {
                    this.selectedProducts.set(productIdStr, basicProduct);
                    row.style.background = '#eff6ff';
                    row.setAttribute('data-selected', 'true');
                }
            }

            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = true;

        } catch (error) {
            console.error('Failed to select product:', error);
        } finally {
            row.style.opacity = '1';
            row.style.pointerEvents = 'auto';
            this.updateSelectedCount();
        }
    }

    bindEvents() {
        // Close buttons
        this.modalElement.querySelector('#btnCloseInventory')?.addEventListener('click', () => this.close());
        this.modalElement.querySelector('#btnCancelInventory')?.addEventListener('click', () => this.close());

        // Reload button
        this.modalElement.querySelector('#btnReloadInventory')?.addEventListener('click', async () => {
            const btn = this.modalElement.querySelector('#btnReloadInventory');
            const icon = btn?.querySelector('#reloadIcon');

            // Add spinning animation
            if (icon) {
                icon.style.animation = 'spin 1s linear infinite';
            }
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.6';
            }

            try {
                await this.reloadProducts();
            } finally {
                // Remove spinning animation
                if (icon) {
                    icon.style.animation = '';
                }
                if (btn) {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                }
            }
        });

        // Overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) this.close();
        });

        // Escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // Search with debounce
        let searchTimeout;
        this.modalElement.querySelector('#inventorySearchInput')?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.filterProducts(e.target.value);
            }, 200);
        });

        // Select products (using event delegation)
        this.modalElement.querySelector('#inventoryProductsList')?.addEventListener('click', (e) => {
            const row = e.target.closest('tr[data-product-id]');
            if (!row) return;

            const productId = row.dataset.productId;
            this.handleProductSelect(productId, row);
        });

        // Add selected products
        this.modalElement.querySelector('#btnAddSelectedProducts')?.addEventListener('click', () => {
            if (this.selectedProducts.size > 0 && this.onSelect) {
                this.onSelect(Array.from(this.selectedProducts.values()));
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
        // Use higher z-index to appear above the form modal (which uses 99999)
        this.modalElement.style.zIndex = '999999';
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
// VARIANT DROPDOWN SELECTOR
// Matches: VariantDropdownSelector.tsx
// ========================================

class VariantDropdownSelector {
    constructor() {
        this.element = null;
        this.isOpen = false;
        this.variants = [];
        this.baseProductCode = null;
        this.currentValue = '';
        this.onSelect = null;
        this.onChange = null;
        this.disabled = false;
        this.targetInput = null;
    }

    /**
     * Attach to input element
     * @param {HTMLInputElement} inputElement - The variant input field
     * @param {Object} options - { baseProductCode, onSelect, onChange, disabled }
     */
    attach(inputElement, options = {}) {
        this.targetInput = inputElement;
        this.baseProductCode = options.baseProductCode;
        this.onSelect = options.onSelect;
        this.onChange = options.onChange;
        this.disabled = options.disabled || false;
        this.currentValue = inputElement.value || '';

        // Create dropdown wrapper
        this.createDropdown();

        // Bind events
        this.bindEvents();

        // Load variants if we have a base code
        if (this.baseProductCode) {
            this.loadVariants();
        }
    }

    /**
     * Update base product code and reload variants
     * @param {string} baseCode
     */
    updateBaseCode(baseCode) {
        this.baseProductCode = baseCode;
        if (baseCode) {
            this.loadVariants();
        } else {
            this.variants = [];
            this.updateDropdownContent();
        }
    }

    /**
     * Load variants from Firestore
     */
    async loadVariants() {
        if (!this.baseProductCode) {
            this.variants = [];
            this.updateDropdownContent();
            return;
        }

        try {
            const db = firebase.firestore();

            // Query products where base_product_code matches and has variant
            const snapshot = await db.collection('products')
                .where('base_product_code', '==', this.baseProductCode)
                .get();

            this.variants = snapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
                .filter(p =>
                    p.variant &&
                    p.product_code !== this.baseProductCode
                );

            // Sort variants
            if (window.VariantUtils) {
                this.variants = window.VariantUtils.sortAttributeValues(this.variants);
            }

            this.updateDropdownContent();
        } catch (error) {
            console.error('Error loading variants:', error);
            this.variants = [];
            this.updateDropdownContent();
        }
    }

    /**
     * Create dropdown element
     */
    createDropdown() {
        // Create wrapper if input is not already wrapped
        const wrapper = document.createElement('div');
        wrapper.className = 'variant-dropdown-wrapper';

        // Insert wrapper and move input inside
        if (this.targetInput.parentNode) {
            this.targetInput.parentNode.insertBefore(wrapper, this.targetInput);
            wrapper.appendChild(this.targetInput);
        }

        // Create dropdown button
        const triggerBtn = document.createElement('button');
        triggerBtn.type = 'button';
        triggerBtn.className = 'variant-dropdown-trigger';
        triggerBtn.innerHTML = '<i data-lucide="chevron-down"></i>';
        triggerBtn.disabled = this.disabled;
        wrapper.appendChild(triggerBtn);

        // Create dropdown content
        const dropdown = document.createElement('div');
        dropdown.className = 'variant-dropdown-content';
        dropdown.style.display = 'none';
        wrapper.appendChild(dropdown);

        this.element = wrapper;
        this.triggerBtn = triggerBtn;
        this.dropdown = dropdown;

        // Initialize icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Update dropdown content
     */
    updateDropdownContent() {
        if (!this.dropdown) return;

        if (this.variants.length === 0) {
            this.dropdown.innerHTML = `
                <div class="variant-dropdown-empty">
                    <p class="text-muted">Không có biến thể</p>
                </div>
            `;
            return;
        }

        this.dropdown.innerHTML = `
            <div class="variant-dropdown-list">
                ${this.variants.map(v => `
                    <button type="button" class="variant-dropdown-item"
                            data-variant="${this.escapeHtml(v.variant || '')}"
                            data-code="${this.escapeHtml(v.product_code || '')}"
                            data-id="${v.id}">
                        <span class="variant-name">${v.variant || '-'}</span>
                        <span class="variant-code text-muted">${v.product_code || ''}</span>
                    </button>
                `).join('')}
            </div>
        `;
    }

    /**
     * Escape HTML
     */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Toggle dropdown
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Open dropdown
     */
    open() {
        if (this.disabled || !this.dropdown) return;

        this.isOpen = true;
        this.dropdown.style.display = 'block';
        this.triggerBtn?.classList.add('active');

        // Position dropdown
        this.positionDropdown();
    }

    /**
     * Close dropdown
     */
    close() {
        if (!this.dropdown) return;

        this.isOpen = false;
        this.dropdown.style.display = 'none';
        this.triggerBtn?.classList.remove('active');
    }

    /**
     * Position dropdown below input
     */
    positionDropdown() {
        if (!this.element || !this.dropdown) return;

        const rect = this.element.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        // Check if there's space below
        const spaceBelow = viewportHeight - rect.bottom;
        const dropdownHeight = Math.min(this.dropdown.scrollHeight, 200);

        if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
            // Show above
            this.dropdown.style.bottom = '100%';
            this.dropdown.style.top = 'auto';
        } else {
            // Show below
            this.dropdown.style.top = '100%';
            this.dropdown.style.bottom = 'auto';
        }
    }

    /**
     * Select a variant
     * @param {Object} variant
     */
    selectVariant(variant) {
        if (this.targetInput) {
            this.targetInput.value = variant.variant || '';
            this.currentValue = variant.variant || '';

            // Trigger input event
            this.targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (this.onChange) {
            this.onChange(variant.variant || '');
        }

        if (this.onSelect) {
            this.onSelect(variant);
        }

        this.close();
    }

    /**
     * Bind events
     */
    bindEvents() {
        // Toggle on button click
        this.triggerBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
        });

        // Select variant on item click
        this.dropdown?.addEventListener('click', (e) => {
            const item = e.target.closest('.variant-dropdown-item');
            if (!item) return;

            const variantData = {
                variant: item.dataset.variant,
                product_code: item.dataset.code,
                id: item.dataset.id
            };

            this.selectVariant(variantData);
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (this.isOpen && this.element && !this.element.contains(e.target)) {
                this.close();
            }
        });

        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    /**
     * Destroy and cleanup
     */
    destroy() {
        if (this.element && this.targetInput) {
            // Move input back out of wrapper
            if (this.element.parentNode) {
                this.element.parentNode.insertBefore(this.targetInput, this.element);
                this.element.remove();
            }
        }

        this.element = null;
        this.dropdown = null;
        this.triggerBtn = null;
        this.targetInput = null;
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
window.VariantDropdownSelector = VariantDropdownSelector;

console.log('[Purchase Orders] Dialogs loaded successfully');
