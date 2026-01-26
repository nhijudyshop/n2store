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
        _sentBills: new Set(), // Track orders that have sent bills
        _firestoreRef: null,
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
                    if (Array.isArray(parsed.data)) {
                        this._data = new Map(parsed.data);
                    }
                    if (Array.isArray(parsed.sentBills)) {
                        this._sentBills = new Set(parsed.sentBills);
                    }
                }
                console.log(`[INVOICE-STATUS] Loaded ${this._data.size} entries from localStorage`);

                // 2. Initialize Firestore reference
                await this._initFirestore();

                // 3. Load from Firestore and merge
                await this._loadFromFirestore();

                // 4. Cleanup old entries
                await this.cleanup();

                this._initialized = true;
                console.log(`[INVOICE-STATUS] Store initialized with ${this._data.size} entries`);
            } catch (e) {
                console.error('[INVOICE-STATUS] Error initializing store:', e);
                this._initialized = true; // Continue with localStorage only
            }
        },

        /**
         * Initialize Firestore reference
         */
        async _initFirestore() {
            try {
                if (!window.firebase?.firestore) {
                    console.log('[INVOICE-STATUS] Firestore not available');
                    return;
                }
                const db = window.firebase.firestore();
                // Use user-specific document
                const userId = localStorage.getItem('userType') || 'default';
                this._firestoreRef = db.collection(FIRESTORE_COLLECTION).doc(userId);
                console.log('[INVOICE-STATUS] Firestore reference initialized');
            } catch (e) {
                console.error('[INVOICE-STATUS] Error initializing Firestore:', e);
            }
        },

        /**
         * Load from Firestore and merge with localStorage
         */
        async _loadFromFirestore() {
            if (!this._firestoreRef) return;

            try {
                const doc = await this._firestoreRef.get();
                if (doc.exists) {
                    const firestoreData = doc.data();

                    // Merge data (Firestore takes precedence for newer entries)
                    if (firestoreData.data && Array.isArray(firestoreData.data)) {
                        const firestoreMap = new Map(firestoreData.data);
                        firestoreMap.forEach((value, key) => {
                            const localValue = this._data.get(key);
                            // Use Firestore value if newer or local doesn't exist
                            if (!localValue || (value.timestamp > (localValue.timestamp || 0))) {
                                this._data.set(key, value);
                            }
                        });
                    }

                    // Merge sent bills
                    if (firestoreData.sentBills && Array.isArray(firestoreData.sentBills)) {
                        firestoreData.sentBills.forEach(id => this._sentBills.add(id));
                    }

                    console.log(`[INVOICE-STATUS] Merged data from Firestore, now ${this._data.size} entries`);
                    this._saveToLocalStorage(); // Update localStorage with merged data
                }
            } catch (e) {
                console.error('[INVOICE-STATUS] Error loading from Firestore:', e);
            }
        },

        /**
         * Save to localStorage only
         */
        _saveToLocalStorage() {
            try {
                const data = {
                    data: Array.from(this._data.entries()),
                    sentBills: Array.from(this._sentBills),
                    lastUpdated: Date.now()
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } catch (e) {
                console.error('[INVOICE-STATUS] Error saving to localStorage:', e);
            }
        },

        /**
         * Save to Firestore (debounced)
         */
        _saveToFirestore() {
            if (!this._firestoreRef) return;

            // Debounce Firestore saves
            if (this._syncTimeout) {
                clearTimeout(this._syncTimeout);
            }

            this._syncTimeout = setTimeout(async () => {
                try {
                    const data = {
                        data: Array.from(this._data.entries()),
                        sentBills: Array.from(this._sentBills),
                        lastUpdated: Date.now()
                    };
                    await this._firestoreRef.set(data, { merge: true });
                    console.log('[INVOICE-STATUS] ✅ Synced to Firestore');
                } catch (e) {
                    console.error('[INVOICE-STATUS] Error saving to Firestore:', e);
                }
            }, 2000); // Debounce 2 seconds
        },

        /**
         * Save store to localStorage + Firestore
         */
        save() {
            this._saveToLocalStorage();
            this._saveToFirestore();
        },

        /**
         * Store invoice data for a SaleOnlineOrder
         * @param {string} saleOnlineId - The SaleOnline order ID
         * @param {Object} invoiceData - FastSaleOrder data
         */
        set(saleOnlineId, invoiceData) {
            if (!saleOnlineId) return;

            // Simplify OrderLines to reduce storage size
            const orderLines = (invoiceData.OrderLines || []).map(line => ({
                ProductName: line.ProductName || line.ProductNameGet || '',
                ProductUOMQty: line.ProductUOMQty || 1,
                PriceUnit: line.PriceUnit || 0,
                PriceTotal: line.PriceTotal || (line.ProductUOMQty || 1) * (line.PriceUnit || 0)
            }));

            this._data.set(String(saleOnlineId), {
                Id: invoiceData.Id,
                Number: invoiceData.Number,
                Reference: invoiceData.Reference,
                State: invoiceData.State,           // "draft", "open", "cancel", etc.
                ShowState: invoiceData.ShowState,   // "Nháp", "Đã xác nhận", "Huỷ bỏ", "Đã thanh toán", etc.
                StateCode: invoiceData.StateCode,   // "None", "NotEnoughInventory", "CrossCheckComplete", etc.
                IsMergeCancel: invoiceData.IsMergeCancel,
                PartnerId: invoiceData.PartnerId,
                PartnerDisplayName: invoiceData.PartnerDisplayName,
                AmountTotal: invoiceData.AmountTotal,
                AmountUntaxed: invoiceData.AmountUntaxed, // Tổng tiền hàng (chưa ship)
                DeliveryPrice: invoiceData.DeliveryPrice,
                CashOnDelivery: invoiceData.CashOnDelivery,
                TrackingRef: invoiceData.TrackingRef,
                CarrierName: invoiceData.CarrierName,
                UserName: invoiceData.UserName,  // Tên account tạo bill
                SessionIndex: invoiceData.SessionIndex, // STT
                OrderLines: orderLines, // Danh sách sản phẩm (simplified)
                ReceiverName: invoiceData.ReceiverName,
                ReceiverPhone: invoiceData.ReceiverPhone,
                ReceiverAddress: invoiceData.ReceiverAddress,
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
                            this.set(soId, order);
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
                            this.set(soId, order);
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

            if (this._firestoreRef) {
                try {
                    await this._firestoreRef.delete();
                    console.log('[INVOICE-STATUS] Cleared all data from Firestore');
                } catch (e) {
                    console.error('[INVOICE-STATUS] Error clearing Firestore:', e);
                }
            }

            console.log('[INVOICE-STATUS] All data cleared');
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

        // Messenger button or sent badge
        if (billSent) {
            html += `<span class="bill-sent-badge" style="color: #27ae60; font-size: 11px;" title="Đã gửi bill">✓</span>`;
        } else {
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
     */
    async function showBillPreviewModal(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex) {
        const modal = document.getElementById('billPreviewSendModal');
        const container = document.getElementById('billPreviewSendContainer');
        const sendBtn = document.getElementById('billPreviewSendBtn');

        if (!modal || !container) {
            console.error('[INVOICE-STATUS] Preview modal elements not found');
            // Fallback to direct send
            return performActualSend(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex);
        }

        // Store pending data
        pendingSendData = {
            enrichedOrder,
            channelId,
            psid,
            orderId,
            orderCode,
            source,
            resultIndex
        };

        // Show loading in container
        container.innerHTML = '<p style="color: #9ca3af; padding: 40px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Đang tạo bill...</p>';

        // Show modal (use both style and class for compatibility)
        modal.style.display = 'flex';
        modal.classList.add('show');

        try {
            // Generate bill HTML
            if (typeof window.generateCustomBillHTML === 'function') {
                const billHTML = window.generateCustomBillHTML(enrichedOrder, {});

                // Extract styles from head
                let styles = '';
                const styleMatch = billHTML.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
                if (styleMatch) {
                    styles = styleMatch[1];
                }

                // Extract body content only (remove doctype, html, head, script tags)
                let bodyContent = billHTML;
                const bodyMatch = billHTML.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                if (bodyMatch) {
                    bodyContent = bodyMatch[1];
                    // Remove script tags from body content
                    bodyContent = bodyContent.replace(/<script[\s\S]*?<\/script>/gi, '');
                }

                // Include styles with scoped class to avoid conflicts
                container.innerHTML = `
                    <style>.bill-preview-wrapper { all: initial; font-family: Arial, sans-serif; } .bill-preview-wrapper * { box-sizing: border-box; } ${styles}</style>
                    <div class="bill-preview-wrapper" style="padding: 10px; background: white;">${bodyContent}</div>
                `;

                // Generate barcode after HTML is inserted
                setTimeout(() => {
                    const barcodeEl = container.querySelector('#barcode');
                    if (barcodeEl && typeof JsBarcode === 'function') {
                        const orderNumber = enrichedOrder.Number || '';
                        if (orderNumber) {
                            try {
                                JsBarcode(barcodeEl, orderNumber, {
                                    format: "CODE128",
                                    width: 1.5,
                                    height: 40,
                                    displayValue: false,
                                    margin: 5
                                });
                                console.log('[INVOICE-STATUS] Barcode generated for:', orderNumber);
                            } catch (barcodeError) {
                                console.error('[INVOICE-STATUS] Barcode generation failed:', barcodeError);
                            }
                        }
                    }
                }, 50);
            } else {
                container.innerHTML = '<p style="color: #ef4444; padding: 40px; text-align: center;">Không thể tạo bill preview</p>';
            }
        } catch (error) {
            console.error('[INVOICE-STATUS] Error generating bill preview:', error);
            container.innerHTML = '<p style="color: #ef4444; padding: 40px; text-align: center;">Lỗi khi tạo bill preview</p>';
        }

        // Enable send button
        if (sendBtn) {
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

        // Disable button and show loading
        const sendBtn = document.getElementById('billPreviewSendBtn');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
        }

        try {
            await performActualSend(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex);
            closeBillPreviewSendModal();
        } catch (error) {
            console.error('[INVOICE-STATUS] Error sending from preview:', error);
            window.notificationManager?.error(`Lỗi: ${error.message}`, 5000);

            // Restore button
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fab fa-facebook-messenger"></i> Gửi bill';
            }
        }
    }

    /**
     * Print bill from preview modal (only print, no send)
     */
    function printBillFromPreview() {
        if (!pendingSendData) {
            window.notificationManager?.error('Không có dữ liệu để in', 5000);
            return;
        }

        const { enrichedOrder } = pendingSendData;

        // Open print popup with current bill
        if (typeof window.openCombinedPrintPopup === 'function') {
            window.openCombinedPrintPopup([enrichedOrder]);
            console.log('[INVOICE-STATUS] Opened print popup for bill');
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

        // Disable buttons and show loading
        const printSendBtn = document.getElementById('billPreviewPrintSendBtn');
        const sendBtn = document.getElementById('billPreviewSendBtn');
        const printBtn = document.getElementById('billPreviewPrintBtn');

        if (printSendBtn) {
            printSendBtn.disabled = true;
            printSendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
        }
        if (sendBtn) sendBtn.disabled = true;
        if (printBtn) printBtn.disabled = true;

        try {
            // 1. Open print popup first
            if (typeof window.openCombinedPrintPopup === 'function') {
                window.openCombinedPrintPopup([enrichedOrder]);
                console.log('[INVOICE-STATUS] Opened print popup for bill');
            }

            // 2. Send bill
            await performActualSend(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex);
            closeBillPreviewSendModal();

            window.notificationManager?.success('Đã in và gửi bill thành công', 3000);
        } catch (error) {
            console.error('[INVOICE-STATUS] Error printing and sending:', error);
            window.notificationManager?.error(`Lỗi: ${error.message}`, 5000);

            // Restore buttons
            if (printSendBtn) {
                printSendBtn.disabled = false;
                printSendBtn.innerHTML = '<i class="fas fa-print"></i> In & Gửi';
            }
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fab fa-facebook-messenger"></i> Gửi bill';
            }
            if (printBtn) {
                printBtn.disabled = false;
                printBtn.innerHTML = '<i class="fas fa-print"></i> In bill';
            }
        }
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
                    cell.outerHTML = `<span class="bill-sent-badge" style="color: #27ae60; font-size: 11px;" title="Đã gửi bill">✓</span>`;
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

            window.notificationManager?.success(`Đã gửi bill cho ${orderCode}`, 'Thành công');
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
            window.notificationManager?.error('Không tìm thấy đơn hàng', 'Lỗi');
            return;
        }

        const invoiceData = InvoiceStatusStore.get(orderId);
        if (!invoiceData) {
            window.notificationManager?.error('Đơn hàng chưa có phiếu bán hàng', 'Lỗi');
            return;
        }

        // Get customer info for Messenger
        const psid = order.Facebook_ASUserId;
        const postId = order.Facebook_PostId;
        const channelId = postId ? postId.split('_')[0] : null;

        if (!psid || !channelId) {
            window.notificationManager?.error('Không có thông tin Messenger của khách hàng', 'Lỗi');
            return;
        }

        // Build enriched order for bill generation
        // Prefer OrderLines from invoiceData (stored from API response), fallback to order.Details
        let orderLines = invoiceData.OrderLines || [];
        if (orderLines.length === 0 && order.Details) {
            orderLines = order.Details.map(d => ({
                ProductName: d.ProductName || d.ProductNameGet || '',
                ProductNameGet: d.ProductNameGet || d.ProductName || '',
                ProductUOMQty: d.Quantity || d.ProductUOMQty || 1,
                PriceUnit: d.Price || d.PriceUnit || 0,
                Note: d.Note || ''
            }));
        }

        const enrichedOrder = {
            Id: invoiceData.Id,
            Number: invoiceData.Number,
            Reference: invoiceData.Reference || order.Code,
            PartnerDisplayName: invoiceData.PartnerDisplayName || invoiceData.ReceiverName || order.Name,
            DeliveryPrice: invoiceData.DeliveryPrice || 0,
            CashOnDelivery: invoiceData.CashOnDelivery || 0,
            AmountTotal: invoiceData.AmountTotal || order.TotalAmount,
            AmountUntaxed: invoiceData.AmountUntaxed || 0, // Tổng tiền hàng
            CarrierName: invoiceData.CarrierName || '',
            UserName: invoiceData.UserName || '',  // Account tạo bill
            SessionIndex: order.SessionIndex || invoiceData.SessionIndex || '', // STT
            OrderLines: orderLines,
            Partner: {
                Name: invoiceData.ReceiverName || order.Name,
                Phone: invoiceData.ReceiverPhone || order.Telephone,
                Street: invoiceData.ReceiverAddress || order.Address
            }
        };

        // Check if preview is enabled
        if (isPreviewBeforeSendEnabled()) {
            // Show preview modal
            await showBillPreviewModal(enrichedOrder, channelId, psid, orderId, order.Code || order.Name, 'main', null);
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
                window.notificationManager?.error(`Lỗi: ${error.message}`, 'Lỗi');

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

            return `
                        <tr data-order-id="${order.Id}" data-order-index="${index}">
                            <td>${index + 1}</td>
                            <td><input type="checkbox" class="success-order-checkbox" value="${index}" data-order-id="${order.Id}"></td>
                            <td>${order.Reference || 'N/A'}</td>
                            <td>${order.Number || ''}</td>
                            <td><span style="color: #10b981; font-weight: 600;">✓ ${order.ShowState || 'Nhập'}</span></td>
                            <td class="invoice-status-cell" data-order-id="${order.Id}">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span class="state-code-badge ${config.cssClass}" style="color: ${config.color}; font-weight: 500; ${style}">${config.label}</span>
                                    ${billSent
                    ? `<span class="bill-sent-badge" style="color: #27ae60; font-size: 14px;" title="Đã gửi bill">✓</span>`
                    : `<button type="button" class="btn-send-bill-messenger" data-index="${index}" data-order-id="${order.Id}" onclick="window.sendBillManually(${index})" title="Gửi bill qua Messenger" style="background: #0084ff; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z"/></svg>
                                        </button>`
                }
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
            window.notificationManager?.error('Không tìm thấy đơn hàng', 'Lỗi');
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
                    window.notificationManager?.error(`Lỗi: ${sendError.message}`, 'Lỗi');

                    if (button) {
                        button.disabled = false;
                        button.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z"/></svg>`;
                    }
                }
            }

        } catch (error) {
            console.error('[INVOICE-STATUS] Error preparing bill:', error);
            window.notificationManager?.error(`Lỗi: ${error.message}`, 'Lỗi');
        }
    }

    /**
     * Override printSuccessOrders to disable auto-send
     */
    async function printSuccessOrdersWithoutAutoSend(type) {
        const selectedIndexes = Array.from(document.querySelectorAll('.success-order-checkbox:checked'))
            .map(cb => parseInt(cb.value));

        if (selectedIndexes.length === 0) {
            window.notificationManager?.warning('Vui lòng chọn ít nhất 1 đơn hàng để in', 'Thông báo');
            return;
        }

        const resultsData = window.fastSaleResultsData;
        const selectedOrders = selectedIndexes.map(i => resultsData.success[i]);
        const orderIds = selectedOrders.map(o => o.Id).filter(id => id);

        if (orderIds.length === 0) {
            window.notificationManager?.error('Không tìm thấy ID đơn hàng', 'Lỗi');
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
