/**
 * Fast Sale Invoice Status Module
 * - Stores invoice status for orders (StateCode, Number, etc.)
 * - Renders "Phiếu bán hàng" column in main orders table
 * - Manual bill sending via Messenger button
 * - Disables auto-send bill feature
 *
 * @version 2.0.0
 * @author Claude
 */

(function () {
    'use strict';

    // =====================================================
    // INVOICE STATUS STORE
    // Stores mapping: SaleOnlineId -> FastSaleOrder data
    // =====================================================

    const STORAGE_KEY = 'invoiceStatusStore';
    const FIRESTORE_COLLECTION = 'invoice_status';
    const MAX_AGE_DAYS = 7;

    /**
     * InvoiceStatusStore - Manages invoice status data
     * Syncs to Firestore for persistence across devices
     */
    const InvoiceStatusStore = {
        _data: new Map(),
        _sentBills: new Set(),
        _initialized: false,
        _syncTimeout: null,

        /**
         * Initialize store from localStorage + Firestore
         */
        async init() {
            if (this._initialized) return;

            try {
                // 1. Load from localStorage first (fast)
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    // Support both old array format and new object format
                    if (parsed.data) {
                        if (Array.isArray(parsed.data)) {
                            this._data = new Map(parsed.data);
                        } else {
                            this._data = new Map(Object.entries(parsed.data));
                        }
                    }
                    if (Array.isArray(parsed.sentBills)) {
                        this._sentBills = new Set(parsed.sentBills);
                    }
                }
                console.log(`[INVOICE-STATUS] Loaded ${this._data.size} entries from localStorage`);

                // 2. Load from Firestore and merge
                await this._loadFromFirestore();

                // 3. Cleanup old entries
                await this.cleanup();

                this._initialized = true;
                console.log(`[INVOICE-STATUS] Store initialized with ${this._data.size} entries`);
            } catch (e) {
                console.error('[INVOICE-STATUS] Error initializing store:', e);
                this._initialized = true;
            }
        },

        /**
         * Get Firestore doc reference - uses username for cross-device sync
         */
        _getDocRef() {
            const db = firebase.firestore();
            // Use actual username (not random user_xxx) for cross-device sync
            const authState = window.authManager?.getAuthState();
            const username = authState?.username || authState?.userType?.split('-')[0] || 'default';
            return db.collection(FIRESTORE_COLLECTION).doc(username);
        },

        /**
         * Check if current user is admin
         */
        _isAdmin() {
            const authState = window.authManager?.getAuthState();
            return authState?.userType === 'admin-admin@@' || authState?.username === 'admin';
        },

        /**
         * Load from Firestore and merge with localStorage
         * Admin loads ALL users' data, normal users load only their own
         */
        async _loadFromFirestore() {
            try {
                const isAdmin = this._isAdmin();

                if (isAdmin) {
                    // Admin: load ALL documents from invoice_status collection
                    console.log('[INVOICE-STATUS] Admin detected, loading ALL users data...');
                    const db = firebase.firestore();
                    const snapshot = await db.collection(FIRESTORE_COLLECTION).get();

                    let totalEntries = 0;
                    snapshot.forEach(doc => {
                        const firestoreData = doc.data();
                        const username = doc.id;

                        // Merge data (newer timestamp wins)
                        if (firestoreData.data) {
                            const entries = Array.isArray(firestoreData.data)
                                ? firestoreData.data
                                : Object.entries(firestoreData.data);
                            entries.forEach(([key, value]) => {
                                const localValue = this._data.get(key);
                                if (!localValue || (value.timestamp > (localValue.timestamp || 0))) {
                                    this._data.set(key, value);
                                    totalEntries++;
                                }
                            });
                        }

                        // Merge sent bills
                        if (firestoreData.sentBills && Array.isArray(firestoreData.sentBills)) {
                            firestoreData.sentBills.forEach(id => this._sentBills.add(id));
                        }
                    });

                    console.log(`[INVOICE-STATUS] Admin loaded ${totalEntries} entries from ${snapshot.size} users`);
                } else {
                    // Normal user: load only their own document
                    const doc = await this._getDocRef().get();
                    if (!doc.exists) return;

                    const firestoreData = doc.data();

                    // Merge data (newer timestamp wins)
                    if (firestoreData.data) {
                        const entries = Array.isArray(firestoreData.data)
                            ? firestoreData.data
                            : Object.entries(firestoreData.data);
                        entries.forEach(([key, value]) => {
                            const localValue = this._data.get(key);
                            if (!localValue || (value.timestamp > (localValue.timestamp || 0))) {
                                this._data.set(key, value);
                            }
                        });
                    }

                    // Merge sent bills
                    if (firestoreData.sentBills && Array.isArray(firestoreData.sentBills)) {
                        firestoreData.sentBills.forEach(id => this._sentBills.add(id));
                    }
                }

                console.log(`[INVOICE-STATUS] Merged from Firestore, total ${this._data.size} entries`);
                this._saveToLocalStorage();
            } catch (e) {
                console.error('[INVOICE-STATUS] Firestore load error:', e);
            }
        },

        /**
         * Save to localStorage
         */
        _saveToLocalStorage() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    data: Object.fromEntries(this._data),
                    sentBills: Array.from(this._sentBills),
                    lastUpdated: Date.now()
                }));
            } catch (e) {
                console.error('[INVOICE-STATUS] localStorage save error:', e);
            }
        },

        /**
         * Save to Firestore (debounced 2s)
         */
        _saveToFirestore() {
            clearTimeout(this._syncTimeout);
            this._syncTimeout = setTimeout(async () => {
                try {
                    await this._getDocRef().set({
                        data: Object.fromEntries(this._data),
                        sentBills: Array.from(this._sentBills),
                        lastUpdated: Date.now()
                    }, { merge: true });
                    console.log('[INVOICE-STATUS] Synced to Firestore');
                } catch (e) {
                    console.error('[INVOICE-STATUS] Firestore save error:', e);
                }
            }, 2000);
        },

        /**
         * Save to localStorage + Firestore
         */
        save() {
            this._saveToLocalStorage();
            this._saveToFirestore();
        },

        /**
         * Store invoice data for a SaleOnlineOrder
         * @param {string} saleOnlineId - The SaleOnline order ID
         * @param {Object} invoiceData - FastSaleOrder data
         * @param {Object} originalOrder - Optional: SaleOnlineOrder data for enrichment
         */
        set(saleOnlineId, invoiceData, originalOrder = null) {
            if (!saleOnlineId) return;

            // Get original order from store if not provided
            const displayedData = window.displayedData || [];
            const order = originalOrder ||
                window.OrderStore?.get(saleOnlineId) ||
                displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId));

            // Simplify OrderLines to reduce storage size
            const orderLines = (invoiceData.OrderLines || []).map(line => ({
                ProductName: line.ProductName || line.ProductNameGet || '',
                ProductUOMQty: line.ProductUOMQty || 1,
                PriceUnit: line.PriceUnit || 0,
                PriceTotal: line.PriceTotal || (line.ProductUOMQty || 1) * (line.PriceUnit || 0)
            }));

            // Ensure complete data - use Reference as Number if Number is null (for draft orders)
            const billNumber = invoiceData.Number || invoiceData.Reference || order?.Code || '';

            // Determine ShowState based on payment: "Đã thanh toán" if fully prepaid (CashOnDelivery = 0)
            const cashOnDelivery = invoiceData.CashOnDelivery || 0;
            const paymentAmount = invoiceData.PaymentAmount || 0;
            const isFullyPaid = cashOnDelivery === 0 && paymentAmount > 0;
            const showState = isFullyPaid ? 'Đã thanh toán' : (invoiceData.ShowState || 'Nháp');
            const state = isFullyPaid ? 'paid' : (invoiceData.State || 'draft');

            this._data.set(String(saleOnlineId), {
                Id: invoiceData.Id,
                Number: billNumber,  // Use complete bill number (never null)
                Reference: invoiceData.Reference || order?.Code || '',
                State: state,           // "draft", "open", "cancel", "paid"
                ShowState: showState,   // "Nháp", "Đã xác nhận", "Huỷ bỏ", "Đã thanh toán"
                StateCode: invoiceData.StateCode,   // "None", "NotEnoughInventory", "CrossCheckComplete", etc.
                IsMergeCancel: invoiceData.IsMergeCancel,
                PartnerId: invoiceData.PartnerId,
                PartnerDisplayName: invoiceData.PartnerDisplayName || order?.Name || '',
                AmountTotal: invoiceData.AmountTotal || order?.TotalAmount || 0,
                AmountUntaxed: invoiceData.AmountUntaxed || 0, // Tổng tiền hàng (chưa ship)
                DeliveryPrice: invoiceData.DeliveryPrice || order?.DeliveryPrice || 0,
                CashOnDelivery: invoiceData.CashOnDelivery || 0,
                TrackingRef: invoiceData.TrackingRef || '',
                CarrierName: invoiceData.CarrierName || invoiceData.Carrier?.Name || '',
                UserName: invoiceData.UserName || window.authManager?.currentUser?.displayName || '',  // Tên account tạo bill
                SessionIndex: invoiceData.SessionIndex || order?.SessionIndex || '', // STT
                OrderLines: orderLines, // Danh sách sản phẩm (simplified)
                ReceiverName: invoiceData.ReceiverName || order?.Name || '',
                ReceiverPhone: invoiceData.ReceiverPhone || order?.Telephone || '',
                ReceiverAddress: invoiceData.ReceiverAddress || order?.Address || '',
                Comment: invoiceData.Comment || order?.Comment || '',
                DeliveryNote: invoiceData.DeliveryNote || order?.DeliveryNote || '',
                Error: invoiceData.Error,
                timestamp: Date.now()
            });
            this.save();
        },

        /**
         * Get invoice data for a SaleOnlineOrder
         * @param {string} saleOnlineId
         * @returns {Object|null}
         */
        get(saleOnlineId) {
            if (!saleOnlineId) return null;
            return this._data.get(String(saleOnlineId)) || null;
        },

        /**
         * Check if order has invoice
         * @param {string} saleOnlineId
         * @returns {boolean}
         */
        has(saleOnlineId) {
            if (!saleOnlineId) return false;
            return this._data.has(String(saleOnlineId));
        },

        /**
         * Mark bill as sent for an order
         * @param {string} saleOnlineId
         */
        markBillSent(saleOnlineId) {
            if (!saleOnlineId) return;
            this._sentBills.add(String(saleOnlineId));
            this.save();
        },

        /**
         * Check if bill was sent
         * @param {string} saleOnlineId
         * @returns {boolean}
         */
        isBillSent(saleOnlineId) {
            if (!saleOnlineId) return false;
            return this._sentBills.has(String(saleOnlineId));
        },

        /**
         * Store multiple invoice results from API response
         * @param {Object} apiResult - Response from InsertListOrderModel API
         */
        storeFromApiResult(apiResult) {
            if (!apiResult) return;

            const displayedData = window.displayedData || [];
            const requestModels = window.lastFastSaleModels || [];

            // Helper: enrich order with SessionIndex from SaleOnlineOrder
            const enrichWithSessionIndex = (order) => {
                if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
                    const soId = order.SaleOnlineIds[0];
                    const saleOnlineOrder = window.OrderStore?.get(soId) ||
                        displayedData.find(o => o.Id === soId || String(o.Id) === String(soId));
                    if (saleOnlineOrder && saleOnlineOrder.SessionIndex) {
                        order.SessionIndex = saleOnlineOrder.SessionIndex;
                    }
                }
                return order;
            };

            // Helper: always get OrderLines from request model (source of truth)
            const enrichWithOrderLines = (order) => {
                const matchedModel = requestModels.find(m => m.Reference === order.Reference);
                if (matchedModel?.OrderLines?.length > 0) {
                    order.OrderLines = matchedModel.OrderLines;
                }
                return order;
            };

            // Store successful orders
            if (apiResult.OrdersSucessed && Array.isArray(apiResult.OrdersSucessed)) {
                apiResult.OrdersSucessed.forEach(order => {
                    enrichWithSessionIndex(order);
                    enrichWithOrderLines(order);
                    if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
                        order.SaleOnlineIds.forEach(soId => {
                            // Get original SaleOnlineOrder for enrichment
                            const originalOrder = window.OrderStore?.get(soId) ||
                                displayedData.find(o => o.Id === soId || String(o.Id) === String(soId));
                            this.set(soId, order, originalOrder);
                        });
                    }
                });
            }

            // Store failed orders (they still have invoice created, just not confirmed)
            if (apiResult.OrdersError && Array.isArray(apiResult.OrdersError)) {
                apiResult.OrdersError.forEach(order => {
                    enrichWithSessionIndex(order);
                    enrichWithOrderLines(order);
                    if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
                        order.SaleOnlineIds.forEach(soId => {
                            // Get original SaleOnlineOrder for enrichment
                            const originalOrder = window.OrderStore?.get(soId) ||
                                displayedData.find(o => o.Id === soId || String(o.Id) === String(soId));
                            this.set(soId, order, originalOrder);
                        });
                    }
                });
            }

            console.log(`[INVOICE-STATUS] Stored ${this._data.size} invoice entries`);
        },

        /**
         * Clear old entries (older than 7 days)
         * Also cleans sentBills for deleted entries
         */
        async cleanup() {
            const now = Date.now();
            const maxAge = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

            let removed = 0;
            const keysToRemove = [];

            this._data.forEach((value, key) => {
                if (value.timestamp && (now - value.timestamp) > maxAge) {
                    keysToRemove.push(key);
                    removed++;
                }
            });

            // Remove old entries
            keysToRemove.forEach(key => {
                this._data.delete(key);
                this._sentBills.delete(key); // Also remove from sentBills
            });

            if (removed > 0) {
                console.log(`[INVOICE-STATUS] Cleaned up ${removed} old entries (>${MAX_AGE_DAYS} days)`);
                this.save(); // Save to both localStorage and Firestore
            }
        },

        /**
         * Get data filtered by date range
         * @param {Date} startDate - Start date
         * @param {Date} endDate - End date
         * @returns {Map} Filtered data
         */
        getByDateRange(startDate, endDate) {
            const filtered = new Map();
            const startTs = startDate?.getTime() || 0;
            const endTs = endDate?.getTime() || Date.now();

            this._data.forEach((value, key) => {
                const ts = value.timestamp || 0;
                if (ts >= startTs && ts <= endTs) {
                    filtered.set(key, value);
                }
            });

            return filtered;
        },

        /**
         * Clear all data (for testing/reset)
         */
        async clearAll() {
            this._data.clear();
            this._sentBills.clear();
            localStorage.removeItem(STORAGE_KEY);

            try {
                await this._getDocRef().delete();
            } catch (e) {
                console.error('[INVOICE-STATUS] Firestore clear error:', e);
            }
        }
    };

    // =====================================================
    // STATE CODE CONFIGURATION
    // =====================================================

    /**
     * ShowState config - order status (State)
     * Values: Nháp, Đã xác nhận, Huỷ bỏ, Đã thanh toán, etc.
     */
    const SHOW_STATE_CONFIG = {
        'Nháp': { color: '#6c757d', bgColor: '#f3f4f6', borderColor: '#d1d5db' },
        'Đã xác nhận': { color: '#2563eb', bgColor: '#dbeafe', borderColor: '#93c5fd' },
        'Huỷ bỏ': { color: '#dc2626', bgColor: '#fee2e2', borderColor: '#fca5a5', style: 'text-decoration: line-through;' },
        'Đã thanh toán': { color: '#059669', bgColor: '#d1fae5', borderColor: '#6ee7b7' },
        'Hoàn thành': { color: '#059669', bgColor: '#d1fae5', borderColor: '#6ee7b7' }
    };

    /**
     * StateCode config - cross-checking status
     * Values: None, NotEnoughInventory, CrossCheckComplete, CrossCheckSuccess, etc.
     */
    const STATE_CODE_CONFIG = {
        'draft': {
            label: 'Nháp',
            cssClass: 'text-info-lt badge badge-empty',
            color: '#17a2b8'
        },
        'NotEnoughInventory': {
            label: 'Chờ nhập hàng',
            cssClass: 'text-warning-dk',
            color: '#e67e22'
        },
        'cancel': {
            label: 'Hủy',
            cssClass: 'text-danger',
            color: '#6c757d',
            style: 'text-decoration: line-through;'
        },
        'IsMergeCancel': {
            label: 'Hủy do gộp đơn',
            cssClass: 'text-danger',
            color: '#6c757d',
            style: 'text-decoration: line-through;'
        },
        'CrossCheckingError': {
            label: 'Lỗi đối soát',
            cssClass: 'text-danger-dker',
            color: '#c0392b'
        },
        'CrossCheckComplete': {
            label: 'Hoàn thành đối soát',
            cssClass: 'text-success-dk',
            color: '#27ae60'
        },
        'CrossCheckSuccess': {
            label: 'Đối soát OK',
            cssClass: 'text-success-dk',
            color: '#27ae60'
        },
        'CrossChecking': {
            label: 'Đang đối soát',
            cssClass: 'text-success-dk',
            color: '#27ae60'
        },
        'None': {
            label: 'Chưa đối soát',
            cssClass: 'text-secondary',
            color: '#6c757d'
        }
    };

    /**
     * Get StateCode display configuration
     */
    function getStateCodeConfig(stateCode, isMergeCancel) {
        if (isMergeCancel) {
            return STATE_CODE_CONFIG['IsMergeCancel'];
        }
        if (stateCode === 'cancel') {
            return STATE_CODE_CONFIG['cancel'];
        }
        const config = STATE_CODE_CONFIG[stateCode];
        if (config) {
            return config;
        }
        return {
            label: stateCode || 'Chưa đối soát',
            cssClass: 'text-secondary',
            color: '#6c757d'
        };
    }

    // =====================================================
    // RENDER FUNCTIONS FOR MAIN TABLE
    // =====================================================

    /**
     * Get ShowState display configuration
     */
    function getShowStateConfig(showState) {
        const config = SHOW_STATE_CONFIG[showState];
        if (config) {
            return config;
        }
        // Default config
        return { color: '#6c757d', bgColor: '#f3f4f6', borderColor: '#d1d5db' };
    }

    /**
     * Render invoice status cell for main orders table
     * @param {Object} order - SaleOnlineOrder object
     * @returns {string} HTML string
     */
    function renderInvoiceStatusCell(order) {
        if (!order || !order.Id) {
            return '<span style="color: #9ca3af;">−</span>';
        }

        // Check if this order has an invoice
        const invoiceData = InvoiceStatusStore.get(order.Id);

        if (!invoiceData) {
            return '<span style="color: #9ca3af;">−</span>';
        }

        const showState = invoiceData.ShowState || '';
        const stateCode = invoiceData.StateCode || 'None';
        const isMergeCancel = invoiceData.IsMergeCancel === true;
        const showStateConfig = getShowStateConfig(showState);
        const stateCodeConfig = getStateCodeConfig(stateCode, isMergeCancel);
        const stateCodeStyle = stateCodeConfig.style || '';

        // Check if bill was sent
        const billSent = InvoiceStatusStore.isBillSent(order.Id);

        // Build HTML - vertical layout like the image
        let html = `<div class="invoice-status-cell" style="display: flex; flex-direction: column; gap: 2px;">`;

        // Row 1: ShowState badge + UserName + Messenger button
        html += `<div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">`;

        // ShowState badge (main status like Huỷ bỏ, Đã thanh toán)
        if (showState) {
            const showStateStyle = showStateConfig.style || '';
            html += `<span style="background: ${showStateConfig.bgColor}; color: ${showStateConfig.color}; border: 1px solid ${showStateConfig.borderColor}; font-size: 11px; padding: 1px 6px; border-radius: 4px; font-weight: 500; ${showStateStyle}" title="Số phiếu: ${invoiceData.Number || ''}">${showState}</span>`;
        }

        // UserName badge (if exists)
        if (invoiceData.UserName) {
            html += `<span style="background: #e0e7ff; color: #4338ca; font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 500;" title="Người tạo bill">${invoiceData.UserName}</span>`;
        }

        // Messenger button or sent badge - only show for "Đã xác nhận" status
        if (billSent) {
            // Bill đã gửi: click để xem preview và in (không gửi lại)
            html += `
                <button type="button"
                    class="btn-send-bill-main"
                    data-order-id="${order.Id}"
                    onclick="window.sendBillFromMainTable('${order.Id}'); event.stopPropagation();"
                    title="Xem bill (đã gửi) - chỉ in, không gửi lại"
                    style="background: #d1fae5; color: #059669; border: 1px solid #6ee7b7; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 10px; display: inline-flex; align-items: center; gap: 2px;">
                    ✓
                </button>
            `;
        } else if (showState === 'Đã xác nhận') {
            // Only allow sending bill for confirmed invoices
            html += `
                <button type="button"
                    class="btn-send-bill-main"
                    data-order-id="${order.Id}"
                    onclick="window.sendBillFromMainTable('${order.Id}'); event.stopPropagation();"
                    title="Gửi bill qua Messenger"
                    style="background: #0084ff; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 10px; display: inline-flex; align-items: center; gap: 2px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z"/>
                    </svg>
                </button>
            `;
        }
        // Note: For non-confirmed statuses (Nháp, Huỷ bỏ, etc.), no button is shown
        html += `</div>`;

        // Row 2: StateCode text (cross-check status like Chưa đối soát, Hoàn thành đối soát)
        html += `<div style="font-size: 11px; color: ${stateCodeConfig.color}; ${stateCodeStyle}">${stateCodeConfig.label}</div>`;

        html += `</div>`;
        return html;
    }

    // =====================================================
    // BILL PREVIEW MODAL FUNCTIONS
    // =====================================================

    /**
     * Pending send data for preview modal
     */
    let pendingSendData = null;

    /**
     * Check if preview before send is enabled
     */
    function isPreviewBeforeSendEnabled() {
        try {
            const settings = window.getBillTemplateSettings ? window.getBillTemplateSettings() : {};
            return settings.previewBeforeSend !== false; // Default true
        } catch (e) {
            return true; // Default true on error
        }
    }

    /**
     * Show bill preview modal before sending
     * @param {Object} enrichedOrder - Order data for bill
     * @param {string} channelId - Pancake channel ID
     * @param {string} psid - Customer PSID
     * @param {string} orderId - SaleOnlineOrder ID
     * @param {string} orderCode - Order code for display
     * @param {string} source - 'main' or 'results' (where the send was triggered)
     * @param {number} resultIndex - Index in results modal (for results source)
     * @param {boolean} viewOnly - If true, hide send buttons (only allow print)
     */
    async function showBillPreviewModal(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex, viewOnly = false) {
        const modal = document.getElementById('billPreviewSendModal');
        const container = document.getElementById('billPreviewSendContainer');
        const sendBtn = document.getElementById('billPreviewSendBtn');
        const printSendBtn = document.getElementById('billPreviewPrintSendBtn');

        if (!modal || !container) {
            console.error('[INVOICE-STATUS] Preview modal elements not found');
            // Fallback to direct send (only if not view-only)
            if (!viewOnly) {
                return performActualSend(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex);
            }
            return;
        }

        // Store pending data
        pendingSendData = {
            enrichedOrder,
            channelId,
            psid,
            orderId,
            orderCode,
            source,
            resultIndex,
            viewOnly
        };

        // Show loading in container
        container.innerHTML = '<p style="color: #9ca3af; padding: 40px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Đang tạo bill...</p>';

        // Show modal (use both style and class for compatibility)
        modal.style.display = 'flex';
        modal.classList.add('show');

        // Handle view-only mode: hide send buttons
        if (viewOnly) {
            if (sendBtn) sendBtn.style.display = 'none';
            if (printSendBtn) printSendBtn.style.display = 'none';
        } else {
            if (sendBtn) sendBtn.style.display = '';
            if (printSendBtn) printSendBtn.style.display = '';
        }

        try {
            // Use custom bill template (no TPOS API request)
            let billHTML = null;

            if (typeof window.generateCustomBillHTML === 'function') {
                console.log('[INVOICE-STATUS] Generating custom bill for preview');
                billHTML = window.generateCustomBillHTML(enrichedOrder, {});
            }

            if (billHTML) {
                // Use iframe to display bill exactly as-is (no CSS conflicts)
                const iframe = document.createElement('iframe');
                iframe.style.cssText = 'width: 100%; height: 600px; border: none; background: white;';
                container.innerHTML = '';
                container.appendChild(iframe);

                // Write the full HTML to iframe
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                iframeDoc.open();
                iframeDoc.write(billHTML);
                iframeDoc.close();

                console.log('[INVOICE-STATUS] Custom bill loaded in iframe');
            } else {
                container.innerHTML = '<p style="color: #ef4444; padding: 40px; text-align: center;">Không thể tạo bill preview</p>';
            }
        } catch (error) {
            console.error('[INVOICE-STATUS] Error generating bill preview:', error);
            container.innerHTML = '<p style="color: #ef4444; padding: 40px; text-align: center;">Lỗi khi tạo bill preview</p>';
        }

        // Enable send button (only if not view-only)
        if (sendBtn && !viewOnly) {
            sendBtn.disabled = false;
        }
    }

    /**
     * Close bill preview modal
     */
    function closeBillPreviewSendModal() {
        const modal = document.getElementById('billPreviewSendModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
            // Reset the container
            const container = document.getElementById('billPreviewSendContainer');
            if (container) {
                container.innerHTML = '<p style="color: #9ca3af; padding: 40px; text-align: center;">Đang tạo bill...</p>';
            }
        }
        // Reset send button
        const sendBtn = document.getElementById('billPreviewSendBtn');
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fab fa-facebook-messenger"></i> Gửi bill';
        }
        // Remove any body scroll lock (in case it was added)
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        pendingSendData = null;
    }

    /**
     * Confirm and send bill from preview modal
     */
    async function confirmSendBillFromPreview() {
        if (!pendingSendData) {
            window.notificationManager?.error('Không có dữ liệu để gửi', 5000);
            closeBillPreviewSendModal();
            return;
        }

        const { enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex } = pendingSendData;

        // Close modal immediately and show sending notification
        closeBillPreviewSendModal();
        window.notificationManager?.info(`📤 Đang gửi bill #${orderCode}...`, 10000);

        // Run send in background
        performActualSend(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex)
            .then(() => {
                // Success handled in performActualSend
            })
            .catch(error => {
                console.error('[INVOICE-STATUS] Error sending from preview:', error);
                window.notificationManager?.error(`❌ Gửi bill #${orderCode} thất bại: ${error.message}`, 5000);
            });
    }

    /**
     * Print bill from preview modal (only print, no send)
     */
    async function printBillFromPreview() {
        if (!pendingSendData) {
            window.notificationManager?.error('Không có dữ liệu để in', 5000);
            return;
        }

        const { enrichedOrder, orderId } = pendingSendData;
        const tposOrderId = enrichedOrder.Id || orderId;

        // Use TPOS bill if order has TPOS ID
        if (tposOrderId && typeof window.fetchAndPrintTPOSBill === 'function') {
            console.log('[INVOICE-STATUS] Printing TPOS bill for order:', tposOrderId);
            const headers = await getBillAuthHeader();
            const orderData = enrichedOrder.SessionIndex ? enrichedOrder :
                (window.OrderStore?.get(enrichedOrder.SaleOnlineIds?.[0]) || enrichedOrder);
            window.fetchAndPrintTPOSBill(tposOrderId, headers, orderData);
        } else if (typeof window.openCombinedPrintPopup === 'function') {
            // Fallback to custom bill
            window.openCombinedPrintPopup([enrichedOrder]);
            console.log('[INVOICE-STATUS] Opened custom print popup for bill');
        } else {
            window.notificationManager?.error('Không thể mở cửa sổ in', 5000);
        }
    }

    /**
     * Print and send bill from preview modal
     */
    async function printAndSendBillFromPreview() {
        if (!pendingSendData) {
            window.notificationManager?.error('Không có dữ liệu để in và gửi', 5000);
            closeBillPreviewSendModal();
            return;
        }

        const { enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex } = pendingSendData;
        const tposOrderId = enrichedOrder.Id || orderId;

        // 1. Open print popup first (TPOS bill if available)
        if (tposOrderId && typeof window.fetchAndPrintTPOSBill === 'function') {
            console.log('[INVOICE-STATUS] Printing TPOS bill for order:', tposOrderId);
            const headers = await getBillAuthHeader();
            const orderData = enrichedOrder.SessionIndex ? enrichedOrder :
                (window.OrderStore?.get(enrichedOrder.SaleOnlineIds?.[0]) || enrichedOrder);
            window.fetchAndPrintTPOSBill(tposOrderId, headers, orderData);
        } else if (typeof window.openCombinedPrintPopup === 'function') {
            window.openCombinedPrintPopup([enrichedOrder]);
            console.log('[INVOICE-STATUS] Opened custom print popup for bill');
        }

        // 2. Close modal immediately and show sending notification
        closeBillPreviewSendModal();
        window.notificationManager?.info(`🖨️ Đang in và gửi bill #${orderCode}...`, 10000);

        // 3. Run send in background
        performActualSend(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex)
            .then(() => {
                // Success handled in performActualSend
            })
            .catch(error => {
                console.error('[INVOICE-STATUS] Error printing and sending:', error);
                window.notificationManager?.error(`❌ Gửi bill #${orderCode} thất bại: ${error.message}`, 5000);
            });
    }

    /**
     * Perform actual bill send
     */
    async function performActualSend(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex) {
        console.log('[INVOICE-STATUS] Sending bill for:', orderCode);

        // Check for pre-generated bill data
        const cachedData = window.preGeneratedBillData?.get(enrichedOrder.Id) ||
            window.preGeneratedBillData?.get(enrichedOrder.Number);
        const sendOptions = {};
        if (cachedData && cachedData.contentUrl && cachedData.contentId) {
            sendOptions.preGeneratedContentUrl = cachedData.contentUrl;
            sendOptions.preGeneratedContentId = cachedData.contentId;
        }

        if (typeof window.sendBillToCustomer !== 'function') {
            throw new Error('sendBillToCustomer function not available');
        }

        const result = await window.sendBillToCustomer(enrichedOrder, channelId, psid, sendOptions);

        if (result.success) {
            console.log(`[INVOICE-STATUS] ✅ Bill sent for ${orderCode}`);

            // Mark as sent
            InvoiceStatusStore.markBillSent(orderId);

            // Update UI based on source
            if (source === 'main') {
                const cell = document.querySelector(`td[data-column="invoice-status"] .btn-send-bill-main[data-order-id="${orderId}"]`);
                if (cell) {
                    // Change button style to green (sent), keep same onclick for viewing
                    cell.style.background = '#d1fae5';
                    cell.style.color = '#059669';
                    cell.style.border = '1px solid #6ee7b7';
                    cell.title = 'Xem bill (đã gửi) - chỉ in, không gửi lại';
                    cell.innerHTML = '✓';
                }
            } else if (source === 'results') {
                const cell = document.querySelector(`.invoice-status-cell[data-order-id="${enrichedOrder.Id}"]`);
                if (cell) {
                    const btn = cell.querySelector('.btn-send-bill-messenger');
                    if (btn) {
                        btn.outerHTML = `<span class="bill-sent-badge" style="color: #27ae60; font-size: 14px;" title="Đã gửi bill">✓ Đã gửi</span>`;
                    }
                }
            }

            window.notificationManager?.success(`Đã gửi bill cho ${orderCode}`);
        } else {
            throw new Error(result.error || 'Gửi bill thất bại');
        }
    }

    /**
     * Send bill from main table
     * @param {string} orderId - SaleOnlineOrder ID
     */
    async function sendBillFromMainTable(orderId) {
        const displayedData = window.displayedData || [];
        const order = window.OrderStore?.get(orderId) ||
            displayedData.find(o => o.Id === orderId || String(o.Id) === String(orderId));

        if (!order) {
            window.notificationManager?.error('Không tìm thấy đơn hàng');
            return;
        }

        const invoiceData = InvoiceStatusStore.get(orderId);
        if (!invoiceData) {
            window.notificationManager?.error('Đơn hàng chưa có phiếu bán hàng');
            return;
        }

        // Check if bill was already sent
        const billAlreadySent = InvoiceStatusStore.isBillSent(orderId);

        // Get customer info for Messenger (only needed if not already sent)
        const psid = order.Facebook_ASUserId;
        const postId = order.Facebook_PostId;
        const channelId = postId ? postId.split('_')[0] : null;

        // Only require Messenger info if bill not sent yet
        if (!billAlreadySent && (!psid || !channelId)) {
            window.notificationManager?.error('Không có thông tin Messenger của khách hàng');
            return;
        }

        // Build enriched order for bill generation
        // invoiceData already has complete data (set() ensures all fields are populated)
        const enrichedOrder = {
            Id: invoiceData.Id,
            Number: invoiceData.Number,  // Already complete (never null)
            Reference: invoiceData.Reference,
            PartnerDisplayName: invoiceData.PartnerDisplayName || invoiceData.ReceiverName,
            DeliveryPrice: invoiceData.DeliveryPrice,
            CashOnDelivery: invoiceData.CashOnDelivery,
            AmountTotal: invoiceData.AmountTotal,
            AmountUntaxed: invoiceData.AmountUntaxed,
            CarrierName: invoiceData.CarrierName,
            UserName: invoiceData.UserName,
            SessionIndex: invoiceData.SessionIndex,
            Comment: invoiceData.Comment,
            DeliveryNote: invoiceData.DeliveryNote,
            SaleOnlineIds: [orderId],
            OrderLines: invoiceData.OrderLines || [],
            Partner: {
                Name: invoiceData.ReceiverName,
                Phone: invoiceData.ReceiverPhone,
                Street: invoiceData.ReceiverAddress
            }
        };

        // Check if preview is enabled
        if (isPreviewBeforeSendEnabled()) {
            // Show preview modal (viewOnly if bill already sent)
            await showBillPreviewModal(enrichedOrder, channelId, psid, orderId, order.Code || order.Name, 'main', null, billAlreadySent);
        } else {
            // Direct send with confirm
            const confirmed = confirm(`Xác nhận gửi bill cho đơn hàng ${order.Code || order.Name}?`);
            if (!confirmed) return;

            // Find button and show loading
            const button = document.querySelector(`.btn-send-bill-main[data-order-id="${orderId}"]`);
            if (button) {
                button.disabled = true;
                button.innerHTML = '...';
            }

            try {
                await performActualSend(enrichedOrder, channelId, psid, orderId, order.Code || order.Name, 'main', null);
            } catch (error) {
                console.error('[INVOICE-STATUS] Error sending bill:', error);
                window.notificationManager?.error(`Lỗi: ${error.message}`);

                // Restore button
                if (button) {
                    button.disabled = false;
                    button.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z"/></svg>`;
                }
            }
        }
    }

    // =====================================================
    // RESULTS MODAL OVERRIDE (Keep existing functionality)
    // =====================================================

    /**
     * Override renderSuccessOrdersTable to add "Phiếu bán hàng" column
     */
    function renderSuccessOrdersTableWithInvoiceStatus() {
        const container = document.getElementById('successOrdersTable');
        if (!container) return;

        const resultsData = window.fastSaleResultsData;
        if (!resultsData || resultsData.success.length === 0) {
            container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 40px;">Không có đơn hàng thành công</p>';
            return;
        }

        const html = `
            <table class="fast-sale-results-table">
                <thead>
                    <tr>
                        <th style="width: 40px;">#</th>
                        <th style="width: 40px;"><input type="checkbox" id="selectAllSuccess" onchange="toggleAllSuccessOrders(this.checked)"></th>
                        <th>Mã</th>
                        <th>Số phiếu</th>
                        <th>Trạng thái</th>
                        <th>Phiếu bán hàng</th>
                        <th>Khách hàng</th>
                        <th>Mã vận đơn</th>
                    </tr>
                </thead>
                <tbody>
                    ${resultsData.success.map((order, index) => {
            const stateCode = order.StateCode || 'None';
            const isMergeCancel = order.IsMergeCancel === true;
            const config = getStateCodeConfig(stateCode, isMergeCancel);
            const style = config.style || '';
            const saleOnlineId = order.SaleOnlineIds?.[0];
            const billSent = saleOnlineId ? InvoiceStatusStore.isBillSent(saleOnlineId) : false;
            const showState = order.ShowState || '';
            const isConfirmed = showState === 'Đã xác nhận';

            // Only show send button for confirmed orders
            let sendButtonHtml = '';
            if (billSent) {
                sendButtonHtml = `<span class="bill-sent-badge" style="color: #27ae60; font-size: 14px;" title="Đã gửi bill">✓</span>`;
            } else if (isConfirmed) {
                sendButtonHtml = `<button type="button" class="btn-send-bill-messenger" data-index="${index}" data-order-id="${order.Id}" onclick="window.sendBillManually(${index})" title="Gửi bill qua Messenger" style="background: #0084ff; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z"/></svg>
                </button>`;
            }
            // Note: Non-confirmed orders (Nháp, Huỷ bỏ, etc.) don't get a send button

            return `
                        <tr data-order-id="${order.Id}" data-order-index="${index}">
                            <td>${index + 1}</td>
                            <td><input type="checkbox" class="success-order-checkbox" value="${index}" data-order-id="${order.Id}"></td>
                            <td>${order.Reference || 'N/A'}</td>
                            <td>${order.Number || ''}</td>
                            <td><span style="color: ${isConfirmed ? '#10b981' : '#f59e0b'}; font-weight: 600;">${isConfirmed ? '✓' : '⚠'} ${showState || 'Nhập'}</span></td>
                            <td class="invoice-status-cell" data-order-id="${order.Id}">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span class="state-code-badge ${config.cssClass}" style="color: ${config.color}; font-weight: 500; ${style}">${config.label}</span>
                                    ${sendButtonHtml}
                                </div>
                            </td>
                            <td>${order.Partner?.PartnerDisplayName || order.PartnerDisplayName || 'N/A'}</td>
                            <td>${order.TrackingRef || ''}</td>
                        </tr>
                    `;
        }).join('')}
                </tbody>
            </table>
        `;

        container.innerHTML = html;
    }

    /**
     * Send bill manually from results modal
     */
    async function sendBillManually(index) {
        const resultsData = window.fastSaleResultsData;
        if (!resultsData || !resultsData.success[index]) {
            window.notificationManager?.error('Không tìm thấy đơn hàng');
            return;
        }

        const order = resultsData.success[index];
        const orderNumber = order.Number || order.Reference;
        const saleOnlineId = order.SaleOnlineIds?.[0];

        try {
            const fastSaleOrdersData = window.fastSaleOrdersData || [];
            const originalOrderIndex = fastSaleOrdersData.findIndex(o =>
                (o.SaleOnlineIds && order.SaleOnlineIds &&
                    JSON.stringify(o.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)) ||
                (o.Reference && o.Reference === order.Reference)
            );
            const originalOrder = originalOrderIndex >= 0 ? fastSaleOrdersData[originalOrderIndex] : null;

            const displayedData = window.displayedData || [];
            let saleOnlineOrder = saleOnlineId
                ? (window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)))
                : null;

            if (!saleOnlineOrder) {
                const saleOnlineName = order.SaleOnlineNames?.[0];
                if (saleOnlineName) {
                    saleOnlineOrder = displayedData.find(o => o.Code === saleOnlineName);
                }
            }
            if (!saleOnlineOrder && order.PartnerId) {
                saleOnlineOrder = displayedData.find(o => o.PartnerId === order.PartnerId);
            }

            if (!saleOnlineOrder) {
                throw new Error('Không tìm thấy thông tin khách hàng');
            }

            const psid = saleOnlineOrder.Facebook_ASUserId;
            const postId = saleOnlineOrder.Facebook_PostId;
            const channelId = postId ? postId.split('_')[0] : null;

            if (!psid || !channelId) {
                throw new Error('Không có thông tin Messenger');
            }

            const carrierSelect = originalOrderIndex >= 0 ? document.getElementById(`fastSaleCarrier_${originalOrderIndex}`) : null;
            const carrierNameFromDropdown = carrierSelect?.options[carrierSelect.selectedIndex]?.text || '';
            const carrierName = carrierNameFromDropdown || originalOrder?.Carrier?.Name || originalOrder?.CarrierName || order.CarrierName || '';
            const shippingFee = originalOrderIndex >= 0
                ? parseFloat(document.getElementById(`fastSaleShippingFee_${originalOrderIndex}`)?.value) || 0
                : order.DeliveryPrice || 0;

            let orderLines = originalOrder?.OrderLines || order.OrderLines || [];
            if ((!orderLines || orderLines.length === 0) && saleOnlineOrder?.Details) {
                orderLines = saleOnlineOrder.Details.map(d => ({
                    ProductName: d.ProductName || d.ProductNameGet || '',
                    ProductNameGet: d.ProductNameGet || d.ProductName || '',
                    ProductUOMQty: d.Quantity || d.ProductUOMQty || 1,
                    PriceUnit: d.Price || d.PriceUnit || 0,
                    Note: d.Note || ''
                }));
            }

            const enrichedOrder = {
                ...order,
                OrderLines: orderLines,
                CarrierName: carrierName,
                DeliveryPrice: shippingFee,
                PartnerDisplayName: order.PartnerDisplayName || originalOrder?.PartnerDisplayName || '',
                UserName: order.UserName || originalOrder?.UserName || '',  // Account tạo bill
                SessionIndex: saleOnlineOrder?.SessionIndex || originalOrder?.SessionIndex || '', // STT
            };

            // Check if preview is enabled
            if (isPreviewBeforeSendEnabled()) {
                // Show preview modal
                await showBillPreviewModal(enrichedOrder, channelId, psid, saleOnlineId, orderNumber, 'results', index);
            } else {
                // Direct send with confirm
                const confirmed = confirm(`Xác nhận gửi bill cho đơn hàng ${orderNumber}?`);
                if (!confirmed) return;

                const button = document.querySelector(`button.btn-send-bill-messenger[data-index="${index}"]`);
                if (button) {
                    button.disabled = true;
                    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
                }

                try {
                    await performActualSend(enrichedOrder, channelId, psid, saleOnlineId, orderNumber, 'results', index);
                } catch (sendError) {
                    console.error('[INVOICE-STATUS] Error:', sendError);
                    window.notificationManager?.error(`Lỗi: ${sendError.message}`);

                    if (button) {
                        button.disabled = false;
                        button.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z"/></svg>`;
                    }
                }
            }

        } catch (error) {
            console.error('[INVOICE-STATUS] Error preparing bill:', error);
            window.notificationManager?.error(`Lỗi: ${error.message}`);
        }
    }

    /**
     * Override printSuccessOrders to disable auto-send
     */
    async function printSuccessOrdersWithoutAutoSend(type) {
        const selectedIndexes = Array.from(document.querySelectorAll('.success-order-checkbox:checked'))
            .map(cb => parseInt(cb.value));

        if (selectedIndexes.length === 0) {
            window.notificationManager?.warning('Vui lòng chọn ít nhất 1 đơn hàng để in');
            return;
        }

        const resultsData = window.fastSaleResultsData;
        const selectedOrders = selectedIndexes.map(i => resultsData.success[i]);
        const orderIds = selectedOrders.map(o => o.Id).filter(id => id);

        if (orderIds.length === 0) {
            window.notificationManager?.error('Không tìm thấy ID đơn hàng');
            return;
        }

        console.log(`[INVOICE-STATUS] Printing ${type} for ${orderIds.length} orders (auto-send DISABLED)`);

        if (type === 'invoice') {
            const fastSaleOrdersData = window.fastSaleOrdersData || [];
            const displayedData = window.displayedData || [];
            const enrichedOrders = [];

            for (const order of selectedOrders) {
                const originalOrderIndex = fastSaleOrdersData.findIndex(o =>
                    (o.SaleOnlineIds && order.SaleOnlineIds && JSON.stringify(o.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)) ||
                    (o.Reference && o.Reference === order.Reference)
                );
                const originalOrder = originalOrderIndex >= 0 ? fastSaleOrdersData[originalOrderIndex] : null;

                const saleOnlineId = order.SaleOnlineIds?.[0];
                const saleOnlineOrderForData = saleOnlineId
                    ? (window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)))
                    : null;

                const carrierSelect = originalOrderIndex >= 0 ? document.getElementById(`fastSaleCarrier_${originalOrderIndex}`) : null;
                const carrierName = carrierSelect?.options[carrierSelect.selectedIndex]?.text ||
                    originalOrder?.Carrier?.Name || originalOrder?.CarrierName || order.CarrierName || '';
                const shippingFee = originalOrderIndex >= 0
                    ? parseFloat(document.getElementById(`fastSaleShippingFee_${originalOrderIndex}`)?.value) || 0
                    : order.DeliveryPrice || 0;

                let orderLines = originalOrder?.OrderLines || order.OrderLines || [];
                if ((!orderLines || orderLines.length === 0) && saleOnlineOrderForData?.Details) {
                    orderLines = saleOnlineOrderForData.Details.map(d => ({
                        ProductName: d.ProductName || d.ProductNameGet || '',
                        ProductUOMQty: d.Quantity || d.ProductUOMQty || 1,
                        PriceUnit: d.Price || d.PriceUnit || 0
                    }));
                }

                enrichedOrders.push({
                    ...order,
                    OrderLines: orderLines,
                    CarrierName: carrierName,
                    DeliveryPrice: shippingFee,
                    PartnerDisplayName: order.PartnerDisplayName || originalOrder?.PartnerDisplayName || '',
                });
            }

            if (enrichedOrders.length > 0 && typeof window.openCombinedPrintPopup === 'function') {
                window.openCombinedPrintPopup(enrichedOrders);
            }

            window.selectedOrderIds?.clear();
            document.querySelectorAll('#ordersTable input[type="checkbox"]:checked').forEach(cb => cb.checked = false);
            const headerCheckbox = document.querySelector('#ordersTable thead input[type="checkbox"]');
            if (headerCheckbox) headerCheckbox.checked = false;
            if (typeof window.updateActionButtons === 'function') window.updateActionButtons();

            window.notificationManager?.info(`Đã mở in ${enrichedOrders.length} bill. Bấm nút Messenger để gửi.`, 4000);
            return;
        }

        // For other types, use original function
        if (window._originalPrintSuccessOrders) {
            return window._originalPrintSuccessOrders(type);
        }
    }

    // =====================================================
    // UPDATE ORDER ON INVOICE CONFIRM
    // =====================================================

    /**
     * When invoice is confirmed ("Đã xác nhận"):
     * 1. Update order status from "Nháp" to "Đơn hàng"
     * 2. Remove any "OK ..." tags
     * @param {string|number} saleOnlineId - The SaleOnline order ID
     * @param {string} invoiceShowState - The invoice ShowState (e.g., "Đã xác nhận")
     */
    async function updateOrderOnInvoiceConfirm(saleOnlineId, invoiceShowState) {
        // Only process for confirmed invoices
        if (invoiceShowState !== 'Đã xác nhận') {
            return;
        }

        console.log(`[INVOICE-STATUS] Invoice confirmed for order ${saleOnlineId}, updating status and tags...`);

        try {
            const headers = await window.tokenManager?.getAuthHeader();
            if (!headers) {
                console.warn('[INVOICE-STATUS] No auth headers available');
                return;
            }

            // Get order data
            const displayedData = window.displayedData || [];
            const allData = window.allData || [];
            const order = window.OrderStore?.get(saleOnlineId) ||
                displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)) ||
                allData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId));

            if (!order) {
                console.warn(`[INVOICE-STATUS] Order ${saleOnlineId} not found`);
                return;
            }

            // 1. Update status to "Đơn hàng" if currently "Nháp"
            if (order.Status === 'Draft' || order.StatusText === 'Nháp') {
                const statusUrl = `${window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev'}/api/odata/SaleOnline_Order/OdataService.UpdateStatusSaleOnline?Id=${saleOnlineId}&Status=${encodeURIComponent('Đơn hàng')}`;

                const statusResponse = await fetch(statusUrl, {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'content-type': 'application/json;charset=utf-8',
                        'accept': '*/*'
                    },
                    body: null
                });

                if (statusResponse.ok) {
                    console.log(`[INVOICE-STATUS] ✅ Status updated to "Đơn hàng" for order ${saleOnlineId}`);

                    // Update local data using OrderStore.update()
                    if (window.OrderStore) {
                        window.OrderStore.update(saleOnlineId, { Status: 'order', StatusText: 'Đơn hàng' });
                    }
                    // Also update the order reference
                    order.Status = 'order';
                    order.StatusText = 'Đơn hàng';

                    // Update UI
                    const statusBadge = document.querySelector(`.status-badge[data-order-id="${saleOnlineId}"]`);
                    if (statusBadge) {
                        statusBadge.className = 'status-badge status-order';
                        statusBadge.style.backgroundColor = '#5cb85c';
                        statusBadge.innerText = 'Đơn hàng';
                    }
                } else {
                    console.warn(`[INVOICE-STATUS] Failed to update status: ${statusResponse.status}`);
                }
            }

            // =====================================================
            // [DISABLED] 2. Remove "OK ..." tags - Tạm tắt, bỏ comment để mở lại
            // =====================================================
            /*
            let orderTags = [];
            try {
                if (order.Tags) {
                    orderTags = JSON.parse(order.Tags);
                    if (!Array.isArray(orderTags)) orderTags = [];
                }
            } catch (e) {
                orderTags = [];
            }

            // Find tags that start with "OK " (case insensitive)
            const okTags = orderTags.filter(t => t.Name && t.Name.toUpperCase().startsWith('OK '));

            if (okTags.length > 0) {
                console.log(`[INVOICE-STATUS] Found ${okTags.length} OK tags to remove:`, okTags.map(t => t.Name));

                // Filter out OK tags
                const newOrderTags = orderTags.filter(t => !t.Name || !t.Name.toUpperCase().startsWith('OK '));

                // Call AssignTag API with remaining tags
                const tagResponse = await fetch(
                    'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag',
                    {
                        method: 'POST',
                        headers: {
                            ...headers,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                        },
                        body: JSON.stringify({
                            Tags: newOrderTags.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
                            OrderId: saleOnlineId
                        })
                    }
                );

                if (tagResponse.ok) {
                    console.log(`[INVOICE-STATUS] ✅ Removed OK tags from order ${saleOnlineId}`);

                    // Update local data
                    const newTagsJson = JSON.stringify(newOrderTags);
                    order.Tags = newTagsJson;
                    if (window.OrderStore) {
                        window.OrderStore.update(saleOnlineId, { Tags: newTagsJson });
                    }

                    // Update UI - find the TAG cell and update it
                    if (typeof window.updateOrderInTable === 'function') {
                        window.updateOrderInTable(saleOnlineId, { Tags: newTagsJson });
                    }

                    // Emit to Firebase for real-time sync
                    if (typeof window.emitTagUpdateToFirebase === 'function') {
                        window.emitTagUpdateToFirebase(saleOnlineId, newOrderTags);
                    }
                } else {
                    console.warn(`[INVOICE-STATUS] Failed to remove tags: ${tagResponse.status}`);
                }
            }
            */

        } catch (error) {
            console.error(`[INVOICE-STATUS] Error updating order on invoice confirm:`, error);
        }
    }

    // =====================================================
    // UPDATE MAIN TABLE CELLS
    // =====================================================

    /**
     * Update invoice status cells in main table for specific orders
     * @param {Object} apiResult - API response with OrdersSucessed/OrdersError
     */
    function updateMainTableInvoiceCells(apiResult) {
        if (!apiResult) return;

        const allOrders = [
            ...(apiResult.OrdersSucessed || []),
            ...(apiResult.OrdersError || [])
        ];

        console.log(`[INVOICE-STATUS] Updating ${allOrders.length} cells in main table`);

        allOrders.forEach(order => {
            if (!order.SaleOnlineIds || order.SaleOnlineIds.length === 0) return;

            order.SaleOnlineIds.forEach(saleOnlineId => {
                // Find the row in main table
                const row = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
                if (!row) return;

                // Find the invoice-status cell
                const cell = row.querySelector('td[data-column="invoice-status"]');
                if (!cell) return;

                // Get order data from displayedData for full info
                const displayedData = window.displayedData || [];
                const orderData = window.OrderStore?.get(saleOnlineId) ||
                    displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId));

                if (orderData) {
                    // Re-render the cell content
                    cell.innerHTML = renderInvoiceStatusCell(orderData);
                    console.log(`[INVOICE-STATUS] Updated cell for order ${saleOnlineId}`);
                }

                // When invoice is confirmed, update status to "Đơn hàng" and remove "OK" tags
                if (order.ShowState === 'Đã xác nhận') {
                    updateOrderOnInvoiceConfirm(saleOnlineId, order.ShowState);
                }

                // Uncheck the checkbox in this row
                const checkbox = row.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = false;
                    // Also remove from selectedOrderIds if exists
                    if (window.selectedOrderIds) {
                        window.selectedOrderIds.delete(saleOnlineId);
                        window.selectedOrderIds.delete(String(saleOnlineId));
                    }
                }
            });
        });

        // Update header checkbox and action buttons
        const headerCheckbox = document.querySelector('#ordersTable thead input[type="checkbox"], .employee-section thead input[type="checkbox"]');
        if (headerCheckbox) {
            headerCheckbox.checked = false;
        }

        // Update action buttons visibility
        if (typeof window.updateActionButtons === 'function') {
            window.updateActionButtons();
        }

        console.log('[INVOICE-STATUS] Cleared checkboxes for processed orders');
    }

    // =====================================================
    // HOOK INTO SAVE FUNCTION
    // =====================================================

    /**
     * Hook into showFastSaleResultsModal to store invoice data
     */
    function hookShowFastSaleResultsModal() {
        const original = window.showFastSaleResultsModal;
        if (!original) {
            console.warn('[INVOICE-STATUS] showFastSaleResultsModal not found, will retry...');
            return false;
        }

        window.showFastSaleResultsModal = function (result) {
            // Store invoice data
            InvoiceStatusStore.storeFromApiResult(result);

            // Call original function
            original.call(this, result);

            // Re-render the success table with our version
            setTimeout(() => {
                renderSuccessOrdersTableWithInvoiceStatus();
            }, 50);

            // Update main table cells (realtime update)
            setTimeout(() => {
                updateMainTableInvoiceCells(result);
            }, 100);
        };

        console.log('[INVOICE-STATUS] Hooked showFastSaleResultsModal');
        return true;
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    let _initStarted = false;

    async function init() {
        if (_initStarted) return;
        _initStarted = true;

        console.log('[INVOICE-STATUS] Initializing module v2.1 (with Firestore sync)...');

        // Initialize store (async - loads from localStorage + Firestore)
        await InvoiceStatusStore.init();

        // Save original function
        if (typeof window.printSuccessOrders === 'function' && !window._originalPrintSuccessOrders) {
            window._originalPrintSuccessOrders = window.printSuccessOrders;
        }

        // Override functions
        window.renderSuccessOrdersTable = renderSuccessOrdersTableWithInvoiceStatus;
        window.printSuccessOrders = printSuccessOrdersWithoutAutoSend;

        // Expose functions globally
        window.renderInvoiceStatusCell = renderInvoiceStatusCell;
        window.sendBillFromMainTable = sendBillFromMainTable;
        window.sendBillManually = sendBillManually;
        window.updateMainTableInvoiceCells = updateMainTableInvoiceCells;
        window.InvoiceStatusStore = InvoiceStatusStore;
        window.getStateCodeConfig = getStateCodeConfig;
        window.getShowStateConfig = getShowStateConfig;
        // Preview modal functions
        window.showBillPreviewModal = showBillPreviewModal;
        window.closeBillPreviewSendModal = closeBillPreviewSendModal;
        window.confirmSendBillFromPreview = confirmSendBillFromPreview;
        window.printBillFromPreview = printBillFromPreview;
        window.printAndSendBillFromPreview = printAndSendBillFromPreview;

        // Hook showFastSaleResultsModal
        if (!hookShowFastSaleResultsModal()) {
            // Retry after delay
            setTimeout(hookShowFastSaleResultsModal, 500);
        }

        console.log('[INVOICE-STATUS] Module initialized successfully');
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init());
    } else {
        init();
    }

})();
