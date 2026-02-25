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
                        <h2 class="modal__title">Chi tiáº¿t Ä‘Æ¡n hÃ ng</h2>
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
                            <span class="detail-info-label">NhÃ  cung cáº¥p</span>
                            <span class="detail-info-value">${order.supplier?.name || 'ChÆ°a cáº­p nháº­t'}</span>
                        </div>
                        <div class="detail-info-item">
                            <span class="detail-info-label">NgÃ y Ä‘áº·t</span>
                            <span class="detail-info-value">${config.formatDate(order.orderDate)}</span>
                        </div>
                        <div class="detail-info-item">
                            <span class="detail-info-label">Tráº¡ng thÃ¡i</span>
                            <span class="detail-info-value">${config.getStatusBadgeHTML(order.status)}</span>
                        </div>
                        <div class="detail-info-item">
                            <span class="detail-info-label">Tá»•ng sá»‘ lÆ°á»£ng</span>
                            <span class="detail-info-value">${totalQuantity}</span>
                        </div>
                    </div>

                    <!-- Items Table -->
                    <div class="detail-items-section">
                        <h3 class="detail-section-title">Danh sÃ¡ch sáº£n pháº©m (${items.length})</h3>
                        <div class="detail-items-table-wrapper">
                            <table class="detail-items-table">
                                <thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>TÃªn sáº£n pháº©m</th>
                                        <th>MÃ£ SP</th>
                                        <th>Biáº¿n thá»ƒ</th>
                                        <th class="text-center">SL</th>
                                        <th class="text-right">GiÃ¡ mua</th>
                                        <th class="text-right">ThÃ nh tiá»n</th>
                                        <th>Tráº¡ng thÃ¡i sync</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${items.map((item, index) => `
                                        <tr class="${item.tposSyncStatus === 'failed' ? 'row-error' : ''}">
                                            <td>${index + 1}</td>
                                            <td>${item.productName || 'Sáº£n pháº©m Ä‘Ã£ xÃ³a'}</td>
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
                                Sáº£n pháº©m lá»—i Ä‘á»“ng bá»™ (${failedItems.length})
                            </h3>
                            <ul class="failed-items-list">
                                ${failedItems.map(item => `
                                    <li class="failed-item">
                                        <span class="failed-item-name">${item.productName}</span>
                                        <span class="failed-item-error">${item.tposSyncError || 'Lá»—i khÃ´ng xÃ¡c Ä‘á»‹nh'}</span>
                                    </li>
                                `).join('')}
                            </ul>
                            <button class="btn btn-warning" id="btnRetryFailed">
                                <i data-lucide="refresh-cw"></i>
                                <span>Thá»­ láº¡i Ä‘á»“ng bá»™</span>
                            </button>
                        </div>
                    ` : ''}

                    <!-- Financial Summary -->
                    <div class="detail-summary">
                        <div class="detail-summary-row">
                            <span>Tá»•ng tiá»n hÃ ng:</span>
                            <span>${config.formatVND(calculatedTotal)}</span>
                        </div>
                        <div class="detail-summary-row">
                            <span>Giáº£m giÃ¡:</span>
                            <span>- ${config.formatVND(order.discountAmount || 0)}</span>
                        </div>
                        <div class="detail-summary-row">
                            <span>PhÃ­ ship:</span>
                            <span>+ ${config.formatVND(order.shippingFee || 0)}</span>
                        </div>
                        <div class="detail-summary-row detail-summary-row--total">
                            <span>THÃ€NH TIá»€N:</span>
                            <span>${config.formatVND(order.finalAmount || 0)}</span>
                        </div>
                    </div>

                    <!-- Notes -->
                    ${order.notes ? `
                        <div class="detail-notes">
                            <h3 class="detail-section-title">Ghi chÃº</h3>
                            <p>${order.notes}</p>
                        </div>
                    ` : ''}

                    <!-- Timestamps -->
                    <div class="detail-timestamps">
                        <span>Táº¡o lÃºc: ${config.formatDateTime(order.createdAt)}</span>
                        <span>Cáº­p nháº­t: ${config.formatDateTime(order.updatedAt)}</span>
                    </div>
                </div>

                <div class="modal__footer">
                    <button class="btn btn-outline" id="btnCloseDetailFooter">ÄÃ³ng</button>
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
                return '<span class="sync-badge sync-badge--success"><i data-lucide="check"></i> ÄÃ£ Ä‘á»“ng bá»™</span>';
            case 'processing':
                return '<span class="sync-badge sync-badge--processing"><i data-lucide="loader-2" class="spin"></i> Äang xá»­ lÃ½</span>';
            case 'failed':
                return '<span class="sync-badge sync-badge--failed"><i data-lucide="alert-circle"></i> Lá»—i</span>';
            case 'pending':
                return '<span class="sync-badge sync-badge--pending">Chá» Ä‘á»“ng bá»™</span>';
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
                btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Äang xá»­ lÃ½...';
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

        // Will be loaded from CSV files
        this.attributes = []; // [{id, name, key, values: [{id, value, code, tpos_id}]}]
        this.attributeConfig = {};
        this.selected = {};
        this.searchFilters = {};
        this.csvLoaded = false;

        // Load CSV data on construction
        this.loadCSVData();
    }

    /**
     * Parse CSV text into array of objects
     */
    parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        const headers = lines[0].split(',');
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const values = [];
            let current = '';
            let inQuotes = false;
            for (const ch of lines[i]) {
                if (ch === '"') { inQuotes = !inQuotes; }
                else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
                else { current += ch; }
            }
            values.push(current.trim());
            const obj = {};
            headers.forEach((h, idx) => { obj[h.trim()] = values[idx] || ''; });
            rows.push(obj);
        }
        return rows;
    }

    /**
     * Load attributes and values from CSV files
     */
    async loadCSVData() {
        try {
            const basePath = window.location.pathname.includes('/purchase-orders/')
                ? '' : '../purchase-orders/';

            const [attrsText, valsText] = await Promise.all([
                fetch(`${basePath}product_attributes_rows.csv`).then(r => r.text()),
                fetch(`${basePath}product_attribute_values_rows.csv`).then(r => r.text())
            ]);

            const attrsRows = this.parseCSV(attrsText);
            const valsRows = this.parseCSV(valsText);

            // Sort attributes by display_order
            attrsRows.sort((a, b) => parseInt(a.display_order || 0) - parseInt(b.display_order || 0));

            // Key mapping: attribute name â†’ internal key
            const keyMap = { 'MÃ u': 'color', 'Size Sá»‘': 'sizeNumber', 'Size Chá»¯': 'sizeLetter' };

            this.attributes = attrsRows
                .filter(a => a.is_active === 'true')
                .map(attr => {
                    const key = keyMap[attr.name] || attr.name.replace(/\s+/g, '_').toLowerCase();
                    const attrValues = valsRows
                        .filter(v => v.attribute_id === attr.id && v.is_active === 'true')
                        .map(v => ({
                            id: v.id,
                            value: v.value,
                            code: v.code,
                            tpos_id: v.tpos_id,
                            sequence: parseInt(v.sequence || 0)
                        }));

                    // Sort values using VariantUtils if available
                    const sortedValues = window.VariantUtils
                        ? window.VariantUtils.sortAttributeValues(attrValues.map(v => ({ name: v.value, ...v })))
                              .map(v => ({ ...v, value: v.name || v.value }))
                        : attrValues;

                    return { id: attr.id, name: attr.name, key, values: sortedValues };
                });

            // Build attributeConfig, selected, searchFilters
            this.attributeConfig = {};
            this.selected = {};
            this.searchFilters = {};
            for (const attr of this.attributes) {
                this.attributeConfig[attr.key] = {
                    name: attr.name,
                    values: attr.values.map(v => v.value),
                    valueObjects: attr.values
                };
                this.selected[attr.key] = [];
                this.searchFilters[attr.key] = '';
            }

            this.csvLoaded = true;
            console.log('[VariantGenerator] Loaded CSV data:', this.attributes.map(a => `${a.name}(${a.values.length})`).join(', '));
        } catch (error) {
            console.error('[VariantGenerator] Failed to load CSV:', error);
            // Fallback to hardcoded values
            this.attributeConfig = {
                color: { name: 'MÃ u', values: ['Tráº¯ng', 'Äen', 'Äá»', 'Xanh', 'XÃ¡m', 'Nude', 'VÃ ng', 'Há»“ng', 'NÃ¢u', 'Cam', 'TÃ­m', 'Be', 'Kem'] },
                sizeNumber: { name: 'Size Sá»‘', values: ['1', '2', '3', '4', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40'] },
                sizeLetter: { name: 'Size Chá»¯', values: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Freesize'] }
            };
            this.selected = { color: [], sizeNumber: [], sizeLetter: [] };
            this.searchFilters = { color: '', sizeNumber: '', sizeLetter: '' };
            this.csvLoaded = true;
        }
    }

    /**
     * Open variant generator dialog
     * @param {Object} options - { baseProduct, onGenerate }
     */
    async open(options = {}) {
        this.baseProduct = options.baseProduct || {};
        this.onGenerate = options.onGenerate;

        // Wait for CSV data if not yet loaded
        if (!this.csvLoaded) {
            await this.loadCSVData();
        }

        // Reset selections
        for (const key of Object.keys(this.selected)) {
            this.selected[key] = [];
        }
        for (const key of Object.keys(this.searchFilters)) {
            this.searchFilters[key] = '';
        }

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
     * @returns {Array} Array of {variant: string, selectedAttributeValueIds: string[]}
     */
    generateCombinations() {
        const selectedArrays = [];

        for (const key of Object.keys(this.attributeConfig)) {
            if (this.selected[key] && this.selected[key].length > 0) {
                const config = this.attributeConfig[key];
                // Map selected values to objects with ID
                const valuesWithIds = this.selected[key].map(val => {
                    const obj = config.valueObjects?.find(v => v.value === val);
                    return { value: val, id: obj?.id || null };
                });
                selectedArrays.push(valuesWithIds);
            }
        }

        if (selectedArrays.length === 0) return [];

        // Cartesian product
        const combine = (arrays) => {
            if (arrays.length === 0) return [[]];
            const [first, ...rest] = arrays;
            const restCombinations = combine(rest);
            const result = [];
            for (const item of first) {
                for (const combo of restCombinations) {
                    result.push([item, ...combo]);
                }
            }
            return result;
        };

        const combinations = combine(selectedArrays);
        return combinations.map(combo => ({
            variant: combo.map(c => c.value).join(' / '),
            selectedAttributeValueIds: combo.map(c => c.id).filter(Boolean)
        }));
    }

    /**
     * Get selected values summary for header display
     */
    getSelectedSummary() {
        const parts = [];
        for (const key of Object.keys(this.attributeConfig)) {
            if (this.selected[key] && this.selected[key].length > 0) {
                parts.push(this.selected[key].join(', '));
            }
        }
        return parts.length > 0 ? parts.join(' | ') : 'ChÆ°a chá»n giÃ¡ trá»‹ nÃ o';
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
            z-index: 6000;
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
                    <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Táº¡o biáº¿n thá»ƒ tá»« thuá»™c tÃ­nh</h2>
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
                    <div style="display: grid; grid-template-columns: repeat(${Object.keys(this.attributeConfig).length + 1}, 1fr); gap: 16px; height: 100%;">
                        ${Object.entries(this.attributeConfig).map(([key, config]) => `
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; display: flex; flex-direction: column;">
                            <div style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${config.name}</div>
                            <div style="padding: 8px;">
                                <input type="text" placeholder="TÃ¬m kiáº¿m..." data-search="${key}" style="
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid #d1d5db;
                                    border-radius: 6px;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                ">
                            </div>
                            <div style="flex: 1; overflow-y: auto; padding: 8px; max-height: 300px;" id="${key}List">
                                ${this.renderCheckboxList(key)}
                            </div>
                        </div>
                        `).join('')}

                        <!-- Variant Preview Column -->
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; display: flex; flex-direction: column;">
                            <div style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Danh sÃ¡ch Biáº¿n Thá»ƒ</div>
                            <div style="flex: 1; overflow-y: auto; padding: 12px; max-height: 350px;" id="variantPreviewList">
                                ${combinations.length > 0
                                    ? combinations.map(v => `<div style="padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px;">${v.variant || v}</div>`).join('')
                                    : '<p style="color: #9ca3af; text-align: center; padding: 40px 20px;">Chá»n giÃ¡ trá»‹ thuá»™c tÃ­nh<br>Ä‘á»ƒ táº¡o biáº¿n thá»ƒ</p>'
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
                    ">Há»§y</button>
                    <button type="button" id="btnGenerateVariants" style="
                        padding: 10px 20px;
                        border: none;
                        border-radius: 8px;
                        background: ${combinations.length > 0 ? '#3b82f6' : '#9ca3af'};
                        color: white;
                        cursor: ${combinations.length > 0 ? 'pointer' : 'not-allowed'};
                        font-size: 14px;
                        font-weight: 500;
                    " ${combinations.length === 0 ? 'disabled' : ''}>Táº¡o ${combinations.length} biáº¿n thá»ƒ</button>
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
        Object.keys(this.attributeConfig).forEach(key => {
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
                ? combinations.map(v => `<div style="padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px;">${v.variant || v}</div>`).join('')
                : '<p style="color: #9ca3af; text-align: center; padding: 40px 20px;">Chá»n giÃ¡ trá»‹ thuá»™c tÃ­nh<br>Ä‘á»ƒ táº¡o biáº¿n thá»ƒ</p>';
        }

        // Update button
        const btnGenerate = this.modalElement?.querySelector('#btnGenerateVariants');
        if (btnGenerate) {
            btnGenerate.textContent = `Táº¡o ${combinations.length} biáº¿n thá»ƒ`;
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
// Validation settings with Firestore persistence
// Rebuilt with inline styles for reliability
// ========================================

class SettingsDialog {
    constructor() {
        this.modalElement = null;
        this.settings = { ...(window.PurchaseOrderValidation?.DEFAULT_VALIDATION_SETTINGS || {}) };
        this.onSave = null;
        this.SETTINGS_DOC_PATH = 'settings/validation';
    }

    /**
     * Load settings from Firestore, merged with defaults
     */
    async loadFromFirestore() {
        const defaults = window.PurchaseOrderValidation?.DEFAULT_VALIDATION_SETTINGS || {};
        try {
            if (typeof firebase === 'undefined') return { ...defaults };
            const db = firebase.firestore();
            const doc = await db.doc(this.SETTINGS_DOC_PATH).get();
            if (doc.exists) {
                const data = doc.data();
                delete data.updatedAt;
                return { ...defaults, ...data };
            }
        } catch (e) {
            console.warn('[SettingsDialog] Failed to load from Firestore:', e);
        }
        return { ...defaults };
    }

    /**
     * Save settings to Firestore
     */
    async saveToFirestore(settings) {
        try {
            if (typeof firebase === 'undefined') throw new Error('Firebase not loaded');
            const db = firebase.firestore();
            const saveData = { ...settings };
            saveData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.doc(this.SETTINGS_DOC_PATH).set(saveData);
            console.log('[SettingsDialog] Settings saved to Firestore');
        } catch (e) {
            console.error('[SettingsDialog] Failed to save to Firestore:', e);
            throw e;
        }
    }

    /**
     * Format price preview: value in 1000Ä‘ units â†’ formatted VND
     */
    _fmtVND(val) {
        const v = (parseInt(val, 10) || 0) * 1000;
        if (window.PurchaseOrderConfig?.formatVND) {
            return window.PurchaseOrderConfig.formatVND(v);
        }
        return new Intl.NumberFormat('vi-VN').format(v) + ' Ä‘';
    }

    /**
     * Open settings dialog
     */
    async open(options = {}) {
        this.onSave = options.onSave;
        const defaults = window.PurchaseOrderValidation?.DEFAULT_VALIDATION_SETTINGS || {};
        this.settings = { ...defaults, ...options.settings };

        // Render immediately with current settings
        this._createDialog();

        // Load from Firestore in background
        try {
            const fsSettings = await this.loadFromFirestore();
            const merged = { ...fsSettings, ...options.settings };
            if (JSON.stringify(merged) !== JSON.stringify(this.settings)) {
                this.settings = merged;
                this._updateFormValues();
            }
        } catch (e) {
            console.warn('[SettingsDialog] Firestore load failed, using defaults:', e);
        }
    }

    close() {
        if (this.modalElement) {
            this.modalElement.style.opacity = '0';
            setTimeout(() => {
                if (this.modalElement) {
                    this.modalElement.remove();
                    this.modalElement = null;
                }
            }, 150);
        }
    }

    /**
     * Create the dialog DOM from scratch
     */
    _createDialog() {
        if (this.modalElement) this.modalElement.remove();

        const s = this.settings;

        // Create overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:6000;opacity:0;transition:opacity 0.2s';

        // Build checkbox rows data
        const checkboxes = [
            { id: 'enableRequireProductName', label: 'Báº¯t buá»™c tÃªn sáº£n pháº©m', checked: s.enableRequireProductName },
            { id: 'enableRequireProductCode', label: 'Báº¯t buá»™c mÃ£ sáº£n pháº©m', checked: s.enableRequireProductCode },
            { id: 'enableRequireProductImages', label: 'Báº¯t buá»™c hÃ¬nh áº£nh sáº£n pháº©m', checked: s.enableRequireProductImages },
            { id: 'enableRequirePositivePurchasePrice', label: 'GiÃ¡ mua pháº£i > 0', checked: s.enableRequirePositivePurchasePrice },
            { id: 'enableRequirePositiveSellingPrice', label: 'GiÃ¡ bÃ¡n pháº£i > 0', checked: s.enableRequirePositiveSellingPrice },
            { id: 'enableRequireSellingGreaterThanPurchase', label: 'GiÃ¡ bÃ¡n pháº£i > GiÃ¡ mua', checked: s.enableRequireSellingGreaterThanPurchase },
            { id: 'enableRequireAtLeastOneItem', label: 'Pháº£i cÃ³ Ã­t nháº¥t 1 sáº£n pháº©m', checked: s.enableRequireAtLeastOneItem },
        ];

        const checkboxHTML = checkboxes.map(cb => `
            <label style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;cursor:pointer;border-bottom:1px solid #f3f4f6">
                <span style="font-size:14px;color:#374151">${cb.label}</span>
                <input type="checkbox" id="${cb.id}" ${cb.checked ? 'checked' : ''}
                    style="width:18px;height:18px;accent-color:#2563eb;cursor:pointer">
            </label>
        `).join('');

        overlay.innerHTML = `
            <div style="background:#fff;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);width:90vw;max-width:560px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">
                <!-- Header -->
                <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e5e7eb">
                    <h2 style="margin:0;font-size:17px;font-weight:600;color:#111827">CÃ i Ä‘áº·t validation giÃ¡ mua/bÃ¡n</h2>
                    <button id="btnCloseSettings" style="background:none;border:none;cursor:pointer;padding:4px;color:#9ca3af;border-radius:6px"
                        onmouseover="this.style.background='#f3f4f6';this.style.color='#374151'"
                        onmouseout="this.style.background='none';this.style.color='#9ca3af'">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>

                <!-- Body -->
                <div style="flex:1;overflow-y:auto;padding:20px">
                    <!-- Info box -->
                    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e40af;margin-bottom:16px;line-height:1.6">
                        <strong>CÃ¡ch hoáº¡t Ä‘á»™ng:</strong><br>
                        â€¢ Äáº·t giÃ¡ trá»‹ 0 Ä‘á»ƒ khÃ´ng giá»›i háº¡n<br>
                        â€¢ Há»‡ thá»‘ng sáº½ kiá»ƒm tra khi táº¡o Ä‘Æ¡n Ä‘áº·t hÃ ng<br>
                        â€¢ Náº¿u vi pháº¡m, sáº½ hiá»ƒn thá»‹ cáº£nh bÃ¡o chi tiáº¿t
                    </div>

                    <!-- GiÃ¡ mua -->
                    <div style="margin-bottom:20px">
                        <h4 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px">GiÃ¡ mua</h4>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                            <div>
                                <label style="font-size:13px;color:#374151;display:block;margin-bottom:4px">GiÃ¡ mua tá»‘i thiá»ƒu (1000Ä‘)</label>
                                <input type="number" id="minPurchasePrice" value="${s.minPurchasePrice}" min="0"
                                    style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box">
                                <div id="previewMinPurchase" style="font-size:12px;color:#9ca3af;margin-top:2px">= ${this._fmtVND(s.minPurchasePrice)}</div>
                            </div>
                            <div>
                                <label style="font-size:13px;color:#374151;display:block;margin-bottom:4px">GiÃ¡ mua tá»‘i Ä‘a (1000Ä‘)</label>
                                <input type="number" id="maxPurchasePrice" value="${s.maxPurchasePrice}" min="0"
                                    style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box">
                                <div id="previewMaxPurchase" style="font-size:12px;color:#9ca3af;margin-top:2px">= ${this._fmtVND(s.maxPurchasePrice)}</div>
                            </div>
                        </div>
                    </div>

                    <!-- GiÃ¡ bÃ¡n -->
                    <div style="margin-bottom:20px">
                        <h4 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px">GiÃ¡ bÃ¡n</h4>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                            <div>
                                <label style="font-size:13px;color:#374151;display:block;margin-bottom:4px">GiÃ¡ bÃ¡n tá»‘i thiá»ƒu (1000Ä‘)</label>
                                <input type="number" id="minSellingPrice" value="${s.minSellingPrice}" min="0"
                                    style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box">
                                <div id="previewMinSelling" style="font-size:12px;color:#9ca3af;margin-top:2px">= ${this._fmtVND(s.minSellingPrice)}</div>
                            </div>
                            <div>
                                <label style="font-size:13px;color:#374151;display:block;margin-bottom:4px">GiÃ¡ bÃ¡n tá»‘i Ä‘a (1000Ä‘)</label>
                                <input type="number" id="maxSellingPrice" value="${s.maxSellingPrice}" min="0"
                                    style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box">
                                <div id="previewMaxSelling" style="font-size:12px;color:#9ca3af;margin-top:2px">= ${this._fmtVND(s.maxSellingPrice)}</div>
                            </div>
                        </div>
                    </div>

                    <!-- ChÃªnh lá»‡ch -->
                    <div style="margin-bottom:20px">
                        <h4 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px">ChÃªnh lá»‡ch (Margin)</h4>
                        <div>
                            <label style="font-size:13px;color:#374151;display:block;margin-bottom:4px">ChÃªnh lá»‡ch tá»‘i thiá»ƒu giÃ¡ bÃ¡n - giÃ¡ mua (1000Ä‘)</label>
                            <input type="number" id="minMargin" value="${s.minMargin}" min="0"
                                style="width:100%;max-width:260px;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box">
                            <div id="previewMinMargin" style="font-size:12px;color:#9ca3af;margin-top:2px">= ${this._fmtVND(s.minMargin)}</div>
                        </div>
                        <div style="font-size:12px;color:#9ca3af;margin-top:6px">
                            VÃ­ dá»¥: Äáº·t 50 nghÄ©a lÃ  giÃ¡ bÃ¡n pháº£i cao hÆ¡n giÃ¡ mua Ã­t nháº¥t 50.000Ä‘
                        </div>
                    </div>

                    <!-- Quy táº¯c kiá»ƒm tra -->
                    <div style="margin-bottom:20px">
                        <h4 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px">Quy táº¯c kiá»ƒm tra</h4>
                        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:4px 12px">
                            ${checkboxHTML}
                        </div>
                    </div>

                    <!-- MÃ£ sáº£n pháº©m -->
                    <div style="margin-bottom:20px">
                        <h4 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px">MÃ£ sáº£n pháº©m</h4>
                        <label style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;cursor:pointer">
                            <span style="font-size:14px;color:#374151">Tá»± Ä‘á»™ng táº¡o mÃ£ sáº£n pháº©m</span>
                            <input type="checkbox" id="autoGenerateCode" ${s.autoGenerateCode ? 'checked' : ''}
                                style="width:18px;height:18px;accent-color:#2563eb;cursor:pointer">
                        </label>
                    </div>

                    <!-- VÃ­ dá»¥ validation -->
                    <div style="margin-bottom:8px">
                        <h4 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px">VÃ­ dá»¥ validation</h4>
                        <div id="validationExample" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;font-size:13px;color:#374151">
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-top:1px solid #e5e7eb;background:#f9fafb;gap:8px">
                    <button id="btnResetSettings" style="background:none;border:1px solid #d1d5db;border-radius:6px;padding:8px 14px;font-size:13px;color:#6b7280;cursor:pointer"
                        onmouseover="this.style.color='#dc2626';this.style.borderColor='#fca5a5'"
                        onmouseout="this.style.color='#6b7280';this.style.borderColor='#d1d5db'">Äáº·t láº¡i máº·c Ä‘á»‹nh</button>
                    <div style="display:flex;gap:8px">
                        <button id="btnCancelSettings" style="background:none;border:1px solid #d1d5db;border-radius:6px;padding:8px 16px;font-size:13px;color:#374151;cursor:pointer"
                            onmouseover="this.style.background='#f3f4f6'"
                            onmouseout="this.style.background='none'">Há»§y</button>
                        <button id="btnSaveSettings" style="background:#2563eb;border:none;border-radius:6px;padding:8px 16px;font-size:13px;color:#fff;cursor:pointer;font-weight:500"
                            onmouseover="this.style.background='#1d4ed8'"
                            onmouseout="this.style.background='#2563eb'">LÆ°u cÃ i Ä‘áº·t</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.modalElement = overlay;

        // Fade in
        requestAnimationFrame(() => { overlay.style.opacity = '1'; });

        this._bindEvents();
        this._updateValidationExample();
    }

    /**
     * Update form values without re-creating the DOM
     */
    _updateFormValues() {
        if (!this.modalElement) return;
        const s = this.settings;
        const fields = ['minPurchasePrice', 'maxPurchasePrice', 'minSellingPrice', 'maxSellingPrice', 'minMargin'];
        fields.forEach(f => {
            const input = this.modalElement.querySelector('#' + f);
            if (input) {
                input.value = s[f] || 0;
                input.dispatchEvent(new Event('input'));
            }
        });
        const boolFields = [
            'enableRequireProductName', 'enableRequireProductCode', 'enableRequireProductImages',
            'enableRequirePositivePurchasePrice', 'enableRequirePositiveSellingPrice',
            'enableRequireSellingGreaterThanPurchase', 'enableRequireAtLeastOneItem', 'autoGenerateCode'
        ];
        boolFields.forEach(f => {
            const input = this.modalElement.querySelector('#' + f);
            if (input) input.checked = s[f] !== false;
        });
        this._updateValidationExample();
    }

    /**
     * Update the live validation example section
     */
    _updateValidationExample() {
        const el = this.modalElement?.querySelector('#validationExample');
        if (!el) return;

        const s = this._collectSettings();
        const fmt = (v) => this._fmtVND(v);

        // Example product: purchase=50, selling=120
        const exPurchase = 50;
        const exSelling = 120;
        const exMargin = exSelling - exPurchase;

        const checks = [];

        // Price checks
        if (s.minPurchasePrice > 0) {
            const ok = exPurchase >= s.minPurchasePrice;
            checks.push({ ok, text: `GiÃ¡ mua ${fmt(exPurchase)} >= tá»‘i thiá»ƒu ${fmt(s.minPurchasePrice)}` });
        }
        if (s.maxPurchasePrice > 0) {
            const ok = exPurchase <= s.maxPurchasePrice;
            checks.push({ ok, text: `GiÃ¡ mua ${fmt(exPurchase)} <= tá»‘i Ä‘a ${fmt(s.maxPurchasePrice)}` });
        }
        if (s.minSellingPrice > 0) {
            const ok = exSelling >= s.minSellingPrice;
            checks.push({ ok, text: `GiÃ¡ bÃ¡n ${fmt(exSelling)} >= tá»‘i thiá»ƒu ${fmt(s.minSellingPrice)}` });
        }
        if (s.maxSellingPrice > 0) {
            const ok = exSelling <= s.maxSellingPrice;
            checks.push({ ok, text: `GiÃ¡ bÃ¡n ${fmt(exSelling)} <= tá»‘i Ä‘a ${fmt(s.maxSellingPrice)}` });
        }
        if (s.minMargin > 0) {
            const ok = exMargin >= s.minMargin;
            checks.push({ ok, text: `ChÃªnh lá»‡ch ${fmt(exMargin)} >= tá»‘i thiá»ƒu ${fmt(s.minMargin)}` });
        }

        // Boolean checks
        if (s.enableRequireProductName) checks.push({ ok: true, text: 'TÃªn sáº£n pháº©m: "Ão thun basic"' });
        if (s.enableRequireProductCode) checks.push({ ok: true, text: 'MÃ£ sáº£n pháº©m: "N001"' });
        if (s.enableRequireProductImages) checks.push({ ok: true, text: 'HÃ¬nh áº£nh: 1 áº£nh' });
        if (s.enableRequirePositivePurchasePrice) checks.push({ ok: exPurchase > 0, text: `GiÃ¡ mua ${fmt(exPurchase)} > 0` });
        if (s.enableRequirePositiveSellingPrice) checks.push({ ok: exSelling > 0, text: `GiÃ¡ bÃ¡n ${fmt(exSelling)} > 0` });
        if (s.enableRequireSellingGreaterThanPurchase) checks.push({ ok: exSelling > exPurchase, text: `GiÃ¡ bÃ¡n > GiÃ¡ mua (${fmt(exSelling)} > ${fmt(exPurchase)})` });

        if (checks.length === 0) {
            el.innerHTML = '<span style="color:#9ca3af">ChÆ°a cÃ³ quy táº¯c nÃ o Ä‘Æ°á»£c báº­t. Äáº·t giÃ¡ trá»‹ > 0 hoáº·c báº­t checkbox Ä‘á»ƒ xem vÃ­ dá»¥.</span>';
            return;
        }

        const header = `<div style="margin-bottom:8px;font-weight:500">SP vÃ­ dá»¥: GiÃ¡ mua = ${fmt(exPurchase)}, GiÃ¡ bÃ¡n = ${fmt(exSelling)}</div>`;
        const rows = checks.map(c => {
            const icon = c.ok ? '<span style="color:#16a34a">âœ“</span>' : '<span style="color:#dc2626">âœ—</span>';
            const color = c.ok ? '#374151' : '#dc2626';
            return `<div style="display:flex;gap:6px;align-items:center;padding:2px 0;color:${color}">${icon} ${c.text}</div>`;
        }).join('');

        el.innerHTML = header + rows;
    }

    /**
     * Bind all events
     */
    _bindEvents() {
        const el = this.modalElement;

        // Close
        el.querySelector('#btnCloseSettings')?.addEventListener('click', () => this.close());
        el.querySelector('#btnCancelSettings')?.addEventListener('click', () => this.close());

        // Live preview for price inputs
        const previewMap = {
            minPurchasePrice: 'previewMinPurchase',
            maxPurchasePrice: 'previewMaxPurchase',
            minSellingPrice: 'previewMinSelling',
            maxSellingPrice: 'previewMaxSelling',
            minMargin: 'previewMinMargin'
        };
        Object.entries(previewMap).forEach(([inputId, previewId]) => {
            el.querySelector('#' + inputId)?.addEventListener('input', (e) => {
                const preview = el.querySelector('#' + previewId);
                if (preview) preview.textContent = '= ' + this._fmtVND(e.target.value);
                this._updateValidationExample();
            });
        });

        // Checkboxes also update example
        el.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => this._updateValidationExample());
        });

        // Reset
        el.querySelector('#btnResetSettings')?.addEventListener('click', () => {
            const defaults = window.PurchaseOrderValidation?.DEFAULT_VALIDATION_SETTINGS || {};
            this.settings = { ...defaults };
            this._updateFormValues();
            if (window.notificationManager) {
                window.notificationManager.show('ÄÃ£ Ä‘áº·t láº¡i máº·c Ä‘á»‹nh', 'info');
            }
        });

        // Save
        el.querySelector('#btnSaveSettings')?.addEventListener('click', async () => {
            const btn = el.querySelector('#btnSaveSettings');
            const origText = btn.textContent;
            btn.textContent = 'Äang lÆ°u...';
            btn.disabled = true;

            try {
                this.settings = this._collectSettings();
                await this.saveToFirestore(this.settings);
                if (this.onSave) this.onSave(this.settings);
                this.close();
            } catch (e) {
                if (window.notificationManager) {
                    window.notificationManager.show('Lá»—i lÆ°u cÃ i Ä‘áº·t: ' + e.message, 'error');
                }
            } finally {
                if (btn) {
                    btn.textContent = origText;
                    btn.disabled = false;
                }
            }
        });

        // Close on overlay click (outside dialog)
        el.addEventListener('click', (e) => {
            if (e.target === el) this.close();
        });
    }

    /**
     * Collect all settings from form inputs
     */
    _collectSettings() {
        const el = this.modalElement;
        if (!el) return { ...this.settings };
        return {
            minPurchasePrice: parseInt(el.querySelector('#minPurchasePrice')?.value, 10) || 0,
            maxPurchasePrice: parseInt(el.querySelector('#maxPurchasePrice')?.value, 10) || 0,
            minSellingPrice: parseInt(el.querySelector('#minSellingPrice')?.value, 10) || 0,
            maxSellingPrice: parseInt(el.querySelector('#maxSellingPrice')?.value, 10) || 0,
            minMargin: parseInt(el.querySelector('#minMargin')?.value, 10) || 0,
            enableRequireProductName: el.querySelector('#enableRequireProductName')?.checked ?? true,
            enableRequireProductCode: el.querySelector('#enableRequireProductCode')?.checked ?? true,
            enableRequireProductImages: el.querySelector('#enableRequireProductImages')?.checked ?? true,
            enableRequirePositivePurchasePrice: el.querySelector('#enableRequirePositivePurchasePrice')?.checked ?? true,
            enableRequirePositiveSellingPrice: el.querySelector('#enableRequirePositiveSellingPrice')?.checked ?? true,
            enableRequireSellingGreaterThanPurchase: el.querySelector('#enableRequireSellingGreaterThanPurchase')?.checked ?? true,
            enableRequireAtLeastOneItem: el.querySelector('#enableRequireAtLeastOneItem')?.checked ?? true,
            autoGenerateCode: el.querySelector('#autoGenerateCode')?.checked ?? true
        };
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
        this.searchTerm = '';
        this.filteredProducts = [];

        // Load previously selected products from localStorage
        this.loadSelectedFromStorage();

        this.render();
        this.show();

        // Load products from TPOS API (for search index)
        await this.loadProductsFromTPOS();

        // Show selected products list if any
        this.updateProductsList();
    }

    /**
     * localStorage key for caching product list
     */
    static CACHE_KEY = 'inventory_products_cache';
    static CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
    static SELECTED_CACHE_KEY = 'inventory_selected_products';

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
                throw new Error('KhÃ´ng cÃ³ token xÃ¡c thá»±c');
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
            // Excel columns: Id (*), MÃ£ sáº£n pháº©m, TÃªn sáº£n pháº©m, GiÃ¡ mua, GiÃ¡ vá»‘n (*)
            this.products = jsonData.map(row => {
                // Find ID - try multiple possible column names
                const id = row['Id (*)'] || row['ID'] || row['Id'] || row['id'] || 0;
                // Find code
                const code = row['MÃ£ sáº£n pháº©m'] || row['DefaultCode'] || row['MÃ£ SP'] || '';
                // Find name
                const name = row['TÃªn sáº£n pháº©m'] || row['NameTemplate'] || row['TÃªn SP'] || '';
                // GiÃ¡ mua = Purchase price (what we pay to supplier)
                const purchasePrice = parseFloat(row['GiÃ¡ mua'] || row['GiÃ¡ vá»‘n (*)'] || row['GiÃ¡ vá»‘n'] || row['StandardPrice'] || 0) || 0;
                // GiÃ¡ bÃ¡n = Selling price (we don't have this in Excel, will fetch from product details)
                const sellingPrice = parseFloat(row['GiÃ¡ bÃ¡n'] || row['ListPrice'] || row['PriceVariant'] || 0) || 0;

                return { id, code, name, purchasePrice, sellingPrice };
            }).filter(p => p.id); // Filter out empty rows

            this.filteredProducts = [...this.products];

            // Save to localStorage cache
            this.saveToCache(this.products);

            console.log(`[InventoryPicker] Loaded ${this.products.length} products from TPOS Excel`);

            if (window.notificationManager && forceReload) {
                window.notificationManager.success(`ÄÃ£ táº£i ${this.products.length} sáº£n pháº©m tá»« TPOS`);
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
                    window.notificationManager.warning('KhÃ´ng thá»ƒ táº£i tá»« TPOS, Ä‘ang dÃ¹ng dá»¯ liá»‡u Ä‘Ã£ lÆ°u');
                }
            } else {
                this.products = [];
                this.filteredProducts = [];
                if (window.notificationManager) {
                    window.notificationManager.error('KhÃ´ng thá»ƒ táº£i danh sÃ¡ch sáº£n pháº©m: ' + error.message);
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
     * localStorage key for caching individual product details
     */
    static DETAILS_CACHE_KEY = 'inventory_product_details_cache';

    /**
     * Get product details from localStorage cache
     * @param {number|string} productId - Product ID
     * @returns {Object|null} Cached product details or null
     */
    getProductDetailsFromCache(productId) {
        try {
            const cached = localStorage.getItem(InventoryPickerDialog.DETAILS_CACHE_KEY);
            if (!cached) return null;

            const detailsMap = JSON.parse(cached);
            return detailsMap[String(productId)] || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Save product details to localStorage cache
     * @param {number|string} productId - Product ID
     * @param {Object} details - Product details to cache
     */
    saveProductDetailsToCache(productId, details) {
        try {
            const cached = localStorage.getItem(InventoryPickerDialog.DETAILS_CACHE_KEY);
            const detailsMap = cached ? JSON.parse(cached) : {};

            detailsMap[String(productId)] = {
                ...details,
                cachedAt: Date.now()
            };

            localStorage.setItem(InventoryPickerDialog.DETAILS_CACHE_KEY, JSON.stringify(detailsMap));
            console.log(`[InventoryPicker] Cached details for product ${productId}`);
        } catch (e) {
            console.warn('[InventoryPicker] Failed to cache product details:', e);
        }
    }

    /**
     * Load selected products from localStorage
     */
    loadSelectedFromStorage() {
        try {
            const cached = localStorage.getItem(InventoryPickerDialog.SELECTED_CACHE_KEY);
            if (cached) {
                const data = JSON.parse(cached);
                this.selectedProducts = new Map(Object.entries(data));
                console.log(`[InventoryPicker] Loaded ${this.selectedProducts.size} selected products from storage`);
            } else {
                this.selectedProducts = new Map();
            }
        } catch (e) {
            console.warn('[InventoryPicker] Failed to load selected products:', e);
            this.selectedProducts = new Map();
        }
    }

    /**
     * Save selected products to localStorage
     */
    saveSelectedToStorage() {
        try {
            const data = Object.fromEntries(this.selectedProducts);
            localStorage.setItem(InventoryPickerDialog.SELECTED_CACHE_KEY, JSON.stringify(data));
            console.log(`[InventoryPicker] Saved ${this.selectedProducts.size} selected products to storage`);
        } catch (e) {
            console.warn('[InventoryPicker] Failed to save selected products:', e);
        }
    }

    /**
     * Clear selected products from localStorage
     */
    clearSelectedFromStorage() {
        try {
            localStorage.removeItem(InventoryPickerDialog.SELECTED_CACHE_KEY);
            this.selectedProducts = new Map();
            console.log('[InventoryPicker] Cleared selected products from storage');
        } catch (e) {
            console.warn('[InventoryPicker] Failed to clear selected products:', e);
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
                throw new Error('KhÃ´ng cÃ³ token xÃ¡c thá»±c');
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

            let image = data.ImageUrl || (data.Thumbnails && data.Thumbnails[2]) || '';

            // If variant has no image, try to get parent product's image
            if (!image && data.ProductTmplId) {
                image = await this.fetchParentImage(data.ProductTmplId, token);
            }

            // Map to our format - use original productId to preserve variant identity
            return {
                id: productId,
                code: data.DefaultCode || data.Barcode || '',
                name: data.NameTemplate || data.Name || '',
                image: image,
                qtyAvailable: data.QtyAvailable || 0,
                purchasePrice: data.StandardPrice || 0,
                sellingPrice: data.PriceVariant || data.ListPrice || 0,
                variant: data.DisplayAttributeValues || '',
                tposProductId: data.Id || null,
                tposProductTmplId: data.ProductTmplId || null,
                // Keep original data for reference
                _raw: data
            };

        } catch (error) {
            console.error(`Error fetching product ${productId}:`, error);
            return null;
        }
    }

    /**
     * Fetch parent product image by ProductTmplId
     * Uses ProductTemplate API to get the template's canonical image
     * Logic: variant.ImageUrl â†’ templateData.ImageUrl â†’ ''
     */
    async fetchParentImage(templateId, token) {
        try {
            if (!this._templateImageCache) this._templateImageCache = {};
            if (this._templateImageCache[templateId] !== undefined) {
                return this._templateImageCache[templateId];
            }

            const response = await fetch(
                `${this.proxyUrl}/api/odata/ProductTemplate(${templateId})?$select=Id,ImageUrl`,
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
                this._templateImageCache[templateId] = '';
                return '';
            }

            const templateData = await response.json();
            const img = templateData.ImageUrl || '';
            this._templateImageCache[templateId] = img;
            return img;
        } catch (error) {
            console.warn('[InventoryPicker] Failed to fetch template image:', error);
            this._templateImageCache[templateId] = '';
            return '';
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
                        <p>Äang táº£i sáº£n pháº©m tá»« TPOS...</p>
                    </div>
                    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
                `;
            }
            if (countText) countText.textContent = 'Äang táº£i...';
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
            z-index: 6000;
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
                    <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Chá»n sáº£n pháº©m tá»« kho</h2>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button type="button" id="btnReloadInventory" title="Táº£i láº¡i danh sÃ¡ch sáº£n pháº©m tá»« TPOS" style="
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
                            Táº£i láº¡i
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
                    <input type="text" id="inventorySearchInput" placeholder="TÃ¬m kiáº¿m theo mÃ£ SP, tÃªn, variant (tá»‘i thiá»ƒu 2 kÃ½ tá»±)..." style="
                        width: 100%;
                        padding: 10px 14px;
                        border: 1px solid #d1d5db;
                        border-radius: 8px;
                        font-size: 14px;
                        box-sizing: border-box;
                    ">
                    <p id="productCountText" style="margin: 8px 0 0; font-size: 13px; color: #6b7280;">
                        Hiá»ƒn thá»‹ ${this.filteredProducts.length} sáº£n pháº©m má»›i nháº¥t
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
                        ÄÃ£ chá»n: <span id="selectedCount" style="font-weight: 600; color: #3b82f6;">${this.selectedProducts.size}</span> sáº£n pháº©m
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button type="button" id="btnCancelInventory" style="
                            padding: 8px 16px;
                            border: 1px solid #d1d5db;
                            border-radius: 8px;
                            background: white;
                            cursor: pointer;
                            font-size: 14px;
                        ">Há»§y</button>
                        <button type="button" id="btnAddSelectedProducts" style="
                            padding: 8px 16px;
                            border: none;
                            border-radius: 8px;
                            background: #3b82f6;
                            color: white;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                        ">ThÃªm sáº£n pháº©m Ä‘Ã£ chá»n</button>
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
                    <p>Äang táº£i sáº£n pháº©m...</p>
                </div>
            `;
        }

        // When no search term: show selected products list
        if (this.searchTerm.length < 2) {
            // If has selected products, show them
            if (this.selectedProducts.size > 0) {
                return this.renderSelectedProductsList();
            }
            // Otherwise show search instruction
            return `
                <div style="padding: 60px 20px; text-align: center; color: #9ca3af;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin: 0 auto 12px; display: block; opacity: 0.5;">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.3-4.3"></path>
                    </svg>
                    <p>Nháº­p tá»« khÃ³a tÃ¬m kiáº¿m (tá»‘i thiá»ƒu 2 kÃ½ tá»±)</p>
                    <p style="font-size: 12px; margin-top: 8px;">CÃ³ ${this.products.length} sáº£n pháº©m trong kho</p>
                </div>
            `;
        }

        if (this.filteredProducts.length === 0) {
            return `
                <div style="padding: 60px 20px; text-align: center; color: #9ca3af;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin: 0 auto 12px; display: block; opacity: 0.5;">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    </svg>
                    <p>KhÃ´ng tÃ¬m tháº¥y sáº£n pháº©m</p>
                </div>
            `;
        }

        return `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f9fafb;">
                        <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 60px;">HÃ¬nh áº£nh</th>
                        <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 80px;">MÃ£ SP</th>
                        <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb;">TÃªn sáº£n pháº©m</th>
                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 70px;">Tá»“n kho</th>
                        <th style="padding: 12px 8px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 100px;">GiÃ¡ mua</th>
                        <th style="padding: 12px 8px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 100px;">GiÃ¡ bÃ¡n</th>
                        <th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 50px;"></th>
                    </tr>
                </thead>
                <tbody>
                    ${this.filteredProducts.map(product => {
                        const isSelected = this.selectedProducts.has(String(product.id));
                        // Get cached details if available
                        const cachedDetails = this.getProductDetailsFromCache(product.id);
                        const imageUrl = cachedDetails?.image || product.image || '';
                        const productCode = product.code || '';
                        const productName = product.name || '';
                        const qtyAvailable = cachedDetails?.qtyAvailable ?? product.qtyAvailable ?? '-';
                        const purchasePrice = cachedDetails?.purchasePrice || product.purchasePrice || 0;
                        const sellingPrice = cachedDetails?.sellingPrice || product.sellingPrice || 0;

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
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: center; color: #6b7280;">${qtyAvailable}</td>
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
        return num.toLocaleString('vi-VN') + ' Ä‘';
    }

    /**
     * Render selected products list (shown when no search term)
     */
    renderSelectedProductsList() {
        const selectedArray = Array.from(this.selectedProducts.values());

        return `
            <div style="padding: 12px 16px; background: #f0f9ff; border-bottom: 1px solid #bfdbfe;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 13px; color: #1e40af; font-weight: 500;">
                        Danh sÃ¡ch Ä‘Ã£ chá»n (${selectedArray.length} sáº£n pháº©m)
                    </span>
                    <button type="button" id="btnClearSelected" style="
                        background: none;
                        border: none;
                        color: #dc2626;
                        font-size: 12px;
                        cursor: pointer;
                        padding: 4px 8px;
                        border-radius: 4px;
                    ">XÃ³a táº¥t cáº£</button>
                </div>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f9fafb;">
                        <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 60px;">HÃ¬nh áº£nh</th>
                        <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 80px;">MÃ£ SP</th>
                        <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb;">TÃªn sáº£n pháº©m</th>
                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 70px;">Tá»“n kho</th>
                        <th style="padding: 12px 8px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 100px;">GiÃ¡ mua</th>
                        <th style="padding: 12px 8px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 100px;">GiÃ¡ bÃ¡n</th>
                        <th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 50px;"></th>
                    </tr>
                </thead>
                <tbody>
                    ${selectedArray.map(product => {
                        const imageUrl = product.image || '';
                        const productCode = product.code || '';
                        const productName = product.name || '';
                        const qtyAvailable = product.qtyAvailable ?? '-';
                        const purchasePrice = product.purchasePrice || 0;
                        const sellingPrice = product.sellingPrice || 0;

                        return `
                            <tr data-product-id="${product.id}" data-selected="true" style="background: #eff6ff; cursor: pointer;">
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
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: center; color: #6b7280;">${qtyAvailable}</td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: right;">${this.formatPrice(purchasePrice)}</td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: right;">${this.formatPrice(sellingPrice)}</td>
                                <td style="padding: 10px 16px; border-bottom: 1px solid #f3f4f6; text-align: center;">
                                    <button type="button" class="btn-remove-product" data-id="${product.id}" style="
                                        background: none;
                                        border: none;
                                        color: #dc2626;
                                        cursor: pointer;
                                        padding: 4px;
                                    ">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * Update products list in UI
     */
    updateProductsList() {
        const listContainer = this.modalElement?.querySelector('#inventoryProductsList');
        const countText = this.modalElement?.querySelector('#productCountText');

        if (listContainer) {
            listContainer.innerHTML = this.renderProductsList();

            // Bind event for clear all button (in selected list view)
            listContainer.querySelector('#btnClearSelected')?.addEventListener('click', () => {
                this.clearSelectedFromStorage();
                this.updateProductsList();
                this.updateSelectedCount();
            });

            // Bind events for remove individual product buttons
            listContainer.querySelectorAll('.btn-remove-product').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const productId = btn.dataset.id;
                    this.selectedProducts.delete(String(productId));
                    this.saveSelectedToStorage();
                    this.updateProductsList();
                    this.updateSelectedCount();
                });
            });
        }
        if (countText) {
            if (this.searchTerm.length < 2) {
                if (this.selectedProducts.size > 0) {
                    countText.textContent = `ÄÃ£ chá»n ${this.selectedProducts.size} sáº£n pháº©m`;
                } else {
                    countText.textContent = `CÃ³ ${this.products.length} sáº£n pháº©m trong kho`;
                }
            } else {
                countText.textContent = `TÃ¬m tháº¥y ${this.filteredProducts.length} sáº£n pháº©m`;
            }
        }
    }

    /**
     * Filter products by search term (min 2 characters)
     * Search by: MÃ£ SP (code) and TÃªn sáº£n pháº©m (name)
     * Only show results when searching to avoid lag with large lists
     */
    filterProducts(term) {
        this.searchTerm = term.toLowerCase().trim();

        // Require at least 2 characters - don't show all products to avoid lag
        if (this.searchTerm.length < 2) {
            this.filteredProducts = []; // Empty - will show search instruction
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
     * Handle product selection - fetch full details from TPOS and cache
     */
    async handleProductSelect(productId, row) {
        const productIdStr = String(productId);

        // If already selected, deselect
        if (this.selectedProducts.has(productIdStr)) {
            this.selectedProducts.delete(productIdStr);
            this.saveSelectedToStorage();
            row.style.background = 'transparent';
            row.removeAttribute('data-selected');
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = false;
            this.updateSelectedCount();
            return;
        }

        // Check cache first
        let productDetails = this.getProductDetailsFromCache(productId);

        if (!productDetails) {
            // Show loading on this row
            row.style.opacity = '0.6';
            row.style.pointerEvents = 'none';

            try {
                // Fetch full product details from TPOS
                productDetails = await this.fetchProductDetails(productId);

                if (productDetails) {
                    // Save to localStorage cache for future use
                    this.saveProductDetailsToCache(productId, productDetails);
                }
            } catch (error) {
                console.error('Failed to fetch product details:', error);
            } finally {
                row.style.opacity = '1';
                row.style.pointerEvents = 'auto';
            }
        }

        if (productDetails) {
            this.selectedProducts.set(productIdStr, productDetails);
        } else {
            // Fallback: use basic product info from Excel
            const basicProduct = this.products.find(p => String(p.id) === productIdStr);
            if (basicProduct) {
                this.selectedProducts.set(productIdStr, basicProduct);
            }
        }

        // Save selected products to localStorage
        this.saveSelectedToStorage();

        // Clear search and show selected products list
        this.searchTerm = '';
        const searchInput = this.modalElement?.querySelector('#inventorySearchInput');
        if (searchInput) searchInput.value = '';

        this.updateProductsList();
        this.updateSelectedCount();
    }

    /**
     * Update table row with fetched product details
     */
    updateRowWithDetails(row, details) {
        // Update image
        if (details.image) {
            const imgCell = row.querySelector('td:first-child');
            if (imgCell) {
                imgCell.innerHTML = `<img src="${details.image}" alt="" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb;">`;
            }
        }

        // Update Tá»“n kho (4th column, index 3)
        const cells = row.querySelectorAll('td');
        if (cells[3] && details.qtyAvailable !== undefined) {
            cells[3].textContent = details.qtyAvailable;
        }

        // Update GiÃ¡ bÃ¡n (6th column, index 5)
        if (cells[5] && details.sellingPrice) {
            cells[5].textContent = this.formatPrice(details.sellingPrice);
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
            console.log('[InventoryPicker] btnAddSelectedProducts clicked');
            console.log('[InventoryPicker] selectedProducts size:', this.selectedProducts.size);
            console.log('[InventoryPicker] onSelect exists:', !!this.onSelect);

            if (this.selectedProducts.size > 0 && this.onSelect) {
                const productsArray = Array.from(this.selectedProducts.values());
                console.log('[InventoryPicker] Products to add:', productsArray.length, productsArray);

                try {
                    this.onSelect(productsArray);
                    console.log('[InventoryPicker] onSelect completed successfully');
                } catch (error) {
                    console.error('[InventoryPicker] onSelect ERROR:', error);
                }

                this.clearSelectedFromStorage(); // Reset for next time
                this.close();
            } else {
                console.log('[InventoryPicker] Skipping - no products or no callback');
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
        // Use higher z-index to appear above the form modal (which uses 5000)
        this.modalElement.style.zIndex = '6000';
        this.modalElement.innerHTML = `
            <div class="modal modal--xs">
                <div class="modal__header">
                    <h2 class="modal__title">PhÃ­ váº­n chuyá»ƒn</h2>
                    <button type="button" class="modal__close" id="btnCloseShipping">
                        <i data-lucide="x"></i>
                    </button>
                </div>

                <div class="modal__body">
                    <div class="form-group">
                        <label class="form-label">Nháº­p phÃ­ ship (VND)</label>
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
                    <button class="btn btn-outline" id="btnCancelShipping">Há»§y</button>
                    <button class="btn btn-primary" id="btnSaveShipping">
                        <i data-lucide="check"></i>
                        <span>XÃ¡c nháº­n</span>
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
                    <p class="text-muted">KhÃ´ng cÃ³ biáº¿n thá»ƒ</p>
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
