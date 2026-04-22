// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Fast Sale Invoice Status Module
 * - Stores invoice status for orders (StateCode, Number, etc.)
 * - Renders "Phiếu bán hàng" column in main orders table
 * - Manual bill sending via Messenger button
 * - Disables auto-send bill feature
 *
 * @version 3.0.0 - Compound key support (SaleOnlineId_timestamp) for multi-entry history
 * @author Claude
 */

(function () {
    'use strict';

    // =====================================================
    // INVOICE STATUS STORE
    // Stores mapping: SaleOnlineId_timestamp -> FastSaleOrder data (compound key)
    // Supports legacy flat keys (SaleOnlineId) for backward compatibility
    // =====================================================

    const STORAGE_KEY = 'invoiceStatusStore_v2';
    const API_BASE = (window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/invoice-status';

    /**
     * Extract SaleOnlineId from a compound key or legacy flat key.
     * Compound key format: "SaleOnlineId_timestamp" (timestamp = 13 digits)
     * Legacy flat key: "SaleOnlineId" (UUID or other format without _timestamp suffix)
     * @param {string} key - The compound or flat key
     * @returns {string} The SaleOnlineId portion
     */
    function extractSaleOnlineId(key) {
        if (!key) return '';
        const str = String(key);
        const lastIdx = str.lastIndexOf('_');
        if (lastIdx > 0) {
            const suffix = str.substring(lastIdx + 1);
            // 13-digit timestamp (ms since epoch)
            if (/^\d{13}$/.test(suffix)) {
                return str.substring(0, lastIdx);
            }
        }
        return str; // Legacy flat key
    }

    /**
     * Check if a key is a compound key (has _timestamp suffix)
     * @param {string} key
     * @returns {boolean}
     */
    function isCompoundKey(key) {
        if (!key) return false;
        const str = String(key);
        const lastIdx = str.lastIndexOf('_');
        if (lastIdx > 0) {
            const suffix = str.substring(lastIdx + 1);
            return /^\d{13}$/.test(suffix);
        }
        return false;
    }
    const MAX_AGE_DAYS = 60; // Auto cleanup after 60 days

    // =====================================================
    // CARRIER MAPPING (for auto-detect when CarrierName is empty)
    // =====================================================
    const DISTRICT_TO_CARRIER = {
        // Nội thành - 20k (Q1,3,4,5,6,7,8,10,11 + named)
        inner: {
            numbers: ['1', '3', '4', '5', '6', '7', '8', '10', '11'],
            names: ['Phú Nhuận', 'Bình Thạnh', 'Tân Phú', 'Tân Bình', 'Gò Vấp'],
            carrier:
                'THÀNH PHỐ (1 3 4 5 6 7 8 10 11 Phú Nhuận, Bình Thạnh, Tân Phú, Tân Bình, Gò Vấp,) (20.000 đ)',
        },
        // Ngoại thành 2 - 30k (Q2, Q12, Bình Tân, Thủ Đức)
        outer2: {
            numbers: ['2', '12'],
            names: ['Bình Tân', 'Thủ Đức'],
            carrier: 'THÀNH PHỐ (Q2-12-Bình Tân-Thủ Đức) (30.000 đ)',
        },
        // Ngoại thành 1 - 35k (Q9, Bình Chánh, Nhà Bè, Hóc Môn, Củ Chi, Cần Giờ)
        outer1: {
            numbers: ['9'],
            names: ['Bình Chánh', 'Nhà Bè', 'Hóc Môn', 'Củ Chi', 'Cần Giờ'],
            carrier: 'THÀNH PHỐ (Bình Chánh- Q9, Nhà Bè, Hóc Môn) (35.000 đ)',
        },
    };

    /**
     * Get carrier name from district info (fallback for empty CarrierName)
     * @param {object} districtInfo - Result from extractDistrictFromAddress
     * @returns {string} Carrier name or empty string
     */
    function getCarrierNameFromDistrict(districtInfo) {
        if (!districtInfo) return '';

        // Province → SHIP TỈNH
        if (districtInfo.isProvince) {
            return 'SHIP TỈNH (35.000 đ)';
        }

        // Check by district number
        if (districtInfo.districtNumber) {
            const num = districtInfo.districtNumber;
            if (DISTRICT_TO_CARRIER.inner.numbers.includes(num))
                return DISTRICT_TO_CARRIER.inner.carrier;
            if (DISTRICT_TO_CARRIER.outer2.numbers.includes(num))
                return DISTRICT_TO_CARRIER.outer2.carrier;
            if (DISTRICT_TO_CARRIER.outer1.numbers.includes(num))
                return DISTRICT_TO_CARRIER.outer1.carrier;
        }

        // Check by district name
        if (districtInfo.districtName) {
            const name = districtInfo.districtName;
            if (DISTRICT_TO_CARRIER.inner.names.includes(name))
                return DISTRICT_TO_CARRIER.inner.carrier;
            if (DISTRICT_TO_CARRIER.outer2.names.includes(name))
                return DISTRICT_TO_CARRIER.outer2.carrier;
            if (DISTRICT_TO_CARRIER.outer1.names.includes(name))
                return DISTRICT_TO_CARRIER.outer1.carrier;
        }

        // Default → SHIP TỈNH
        return 'SHIP TỈNH (35.000 đ)';
    }

    /**
     * InvoiceStatusStore - Manages invoice status data
     * Persists to PostgreSQL via REST API
     *
     * Persists to PostgreSQL via REST API (no more Firestore dependency).
     */
    const InvoiceStatusStore = {
        _data: new Map(),
        _sentBills: new Set(),
        _myKeys: new Set(),
        _initialized: false,
        _batchMode: false, // When true, set() skips API save (for batch operations)

        /**
         * Initialize store from PostgreSQL API (source of truth)
         */
        async init() {
            if (this._initialized) return;

            try {
                await this._loadFromAPI();

                this._initialized = true;
                // Re-render all invoice status cells after init
                if (this._data.size > 0) {
                    const allKeys = [];
                    this._data.forEach((value, key) => {
                        const soId = value.SaleOnlineId || extractSaleOnlineId(key);
                        if (soId && !allKeys.includes(soId)) allKeys.push(soId);
                    });
                    this._refreshInvoiceStatusUI(allKeys);
                }

                // Sync to FulfillmentData in parent frame
                this._syncToFulfillmentData();
                setTimeout(() => this._syncToFulfillmentData(), 2000);

                // Refresh StateCode from TPOS (async, don't block init)
                setTimeout(() => this.refreshStateCode(), 3000);

                // Reconcile PTAG với PBH: flip CHO_DI_DON → HOAN_TAT cho đơn đã có PBH active.
                // ProcessingTagState có thể chưa _isLoaded tại thời điểm này (load song song)
                // → reconcileTagsWithInvoices tự guard và return sớm nếu chưa ready.
                // Bên loadProcessingTags() cũng sẽ gọi lại khi xong → đảm bảo chạy 1 trong 2 lần.
                if (typeof window.reconcileTagsWithInvoices === 'function') {
                    window.reconcileTagsWithInvoices().catch(() => {});
                }
            } catch (e) {
                console.error('[INVOICE-STATUS] Error initializing store:', e);
                this._initialized = true;
            }
        },

        /**
         * Get current username for API calls
         */
        _getUsername() {
            const authState = window.authManager?.getAuthState();
            const userType = authState?.userType || localStorage.getItem('userType') || '';
            return authState?.username || userType.split('-')[0] || 'default';
        },

        /**
         * Load from PostgreSQL API (source of truth)
         * Replaces _loadFromFirestore - loads all entries + sentBills
         */
        async _loadFromAPI() {
            try {
                const myUsername = this._getUsername();
                const response = await fetch(`${API_BASE}/load`);
                if (!response.ok) throw new Error(`API load failed: ${response.status}`);

                const result = await response.json();
                if (!result.success) throw new Error(result.error || 'Load failed');

                this._data.clear();
                this._sentBills = new Set();
                this._myKeys = new Set();

                // Populate Map from DB rows
                (result.entries || []).forEach(row => {
                    const key = row.compound_key;
                    const value = {
                        SaleOnlineId: row.sale_online_id,
                        Id: row.tpos_id,
                        Number: row.number,
                        Reference: row.reference,
                        State: row.state,
                        ShowState: row.show_state,
                        StateCode: row.state_code,
                        IsMergeCancel: row.is_merge_cancel,
                        PartnerId: row.partner_id,
                        PartnerDisplayName: row.partner_display_name,
                        AmountTotal: parseFloat(row.amount_total) || 0,
                        AmountUntaxed: parseFloat(row.amount_untaxed) || 0,
                        DeliveryPrice: parseFloat(row.delivery_price) || 0,
                        CashOnDelivery: parseFloat(row.cash_on_delivery) || 0,
                        PaymentAmount: parseFloat(row.payment_amount) || 0,
                        Discount: parseFloat(row.discount) || 0,
                        DebtUsed: parseFloat(row.debt_used) || 0,
                        TrackingRef: row.tracking_ref,
                        CarrierName: row.carrier_name,
                        UserName: row.user_name,
                        SessionIndex: row.session_index,
                        OrderLines: row.order_lines || [],
                        ReceiverName: row.receiver_name,
                        ReceiverPhone: row.receiver_phone,
                        ReceiverAddress: row.receiver_address,
                        Comment: row.comment,
                        DeliveryNote: row.delivery_note,
                        Error: row.error,
                        DateInvoice: row.date_invoice,
                        DateCreated: row.date_created,
                        LiveCampaignId: row.live_campaign_id,
                        timestamp: parseInt(row.entry_timestamp) || 0,
                    };
                    this._data.set(key, value);
                    if (row.username === myUsername) {
                        this._myKeys.add(key);
                    }
                });

                // Populate sentBills
                (result.sentBills || []).forEach(id => this._sentBills.add(id));

                return true;
            } catch (e) {
                console.error('[INVOICE-STATUS] API load error:', e);
                return false;
            }
        },

        /**
         * Save single entry to API (POST /entries)
         * Called after set() for individual saves
         */
        async _saveEntryToAPI(compoundKey) {
            const data = this._data.get(compoundKey);
            if (!data) return;

            try {
                const response = await fetch(`${API_BASE}/entries`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        compoundKey,
                        username: this._getUsername(),
                        saleOnlineId: data.SaleOnlineId || extractSaleOnlineId(compoundKey),
                        data,
                    }),
                });
                if (!response.ok) {
                    console.error('[INVOICE-STATUS] Save entry API error:', response.status);
                }
            } catch (e) {
                console.error('[INVOICE-STATUS] Save entry error:', e);
            }
        },

        /**
         * Save multiple entries to API (POST /entries/batch)
         * Called after storeFromApiResult() for batch saves
         */
        async _saveBatchToAPI(compoundKeys) {
            if (!compoundKeys || compoundKeys.length === 0) return;

            const entries = compoundKeys.map(key => {
                const data = this._data.get(key);
                return data ? {
                    compoundKey: key,
                    saleOnlineId: data.SaleOnlineId || extractSaleOnlineId(key),
                    data,
                } : null;
            }).filter(Boolean);

            if (entries.length === 0) return;

            try {
                const response = await fetch(`${API_BASE}/entries/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: this._getUsername(),
                        entries,
                    }),
                });
                if (!response.ok) {
                    console.error('[INVOICE-STATUS] Batch save API error:', response.status);
                } else {
                }
            } catch (e) {
                console.error('[INVOICE-STATUS] Batch save error:', e);
            }
        },

        /**
         * Refresh UI for invoice status cells when real-time updates are received
         * @param {string[]} changedKeys - Array of saleOnlineIds that changed
         */
        _refreshInvoiceStatusUI(changedKeys) {
            if (!changedKeys || changedKeys.length === 0) return;
            if (typeof window.renderInvoiceStatusCell !== 'function') return;

            let updatedCount = 0;
            changedKeys.forEach((saleOnlineId) => {
                const row = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
                if (row) {
                    const cell = row.querySelector('td[data-column="invoice-status"]');
                    if (cell) {
                        const orderData =
                            window.OrderStore?.get(saleOnlineId) ||
                            (window.displayedData || []).find(
                                (o) => String(o.Id) === String(saleOnlineId)
                            );

                        if (orderData) {
                            cell.innerHTML = window.renderInvoiceStatusCell(orderData);
                            updatedCount++;
                        }
                    }
                }
            });
            if (updatedCount > 0) {
            }
        },

        /**
         * Refresh UI for deleted invoice status entries (show "-")
         * @param {string[]} deletedKeys - Array of saleOnlineIds that were deleted
         */
        _refreshDeletedInvoiceStatusUI(deletedKeys) {
            if (!deletedKeys || deletedKeys.length === 0) return;

            let clearedCount = 0;
            deletedKeys.forEach((saleOnlineId) => {
                const row = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
                if (row) {
                    const cell = row.querySelector('td[data-column="invoice-status"]');
                    if (cell) {
                        cell.innerHTML = '<span style="color: #9ca3af;">−</span>';
                        clearedCount++;
                    }
                }
            });
            if (clearedCount > 0) {
            }
        },

        /**
         * Sync invoice status data to FulfillmentData in parent frame.
         * Replaces the duplicate Firestore load that FulfillmentData used to do.
         * Groups entries by SaleOnlineId into arrays (matching FulfillmentData's expected format).
         */
        _syncToFulfillmentData() {
            const fd = window.parent?.FulfillmentData || window.FulfillmentData;
            if (!fd || typeof fd.syncFromStore !== 'function') {
                console.warn('[INVOICE-STATUS] FulfillmentData not available for sync');
                return;
            }

            // Build plain object (NOT Map) for cross-frame compatibility
            // Map objects fail instanceof checks across iframe boundaries
            const grouped = {};
            this._data.forEach((value, key) => {
                const soId = value.SaleOnlineId || extractSaleOnlineId(key);
                if (!soId) return;
                if (!grouped[soId]) grouped[soId] = [];
                grouped[soId].push(value);
            });

            fd.syncFromStore(grouped);
        },

        /**
         * Cleanup store resources
         */
        destroy() {
            this._data.clear();
            this._sentBills.clear();
            this._myKeys.clear();
            this._initialized = false;
        },

        /**
         * Store invoice data for a SaleOnlineOrder
         * Uses compound key (SaleOnlineId_timestamp) to support multiple entries per order.
         * If an existing entry with the same FastSaleOrder Id exists, updates it in-place
         * instead of creating a new entry (for form value updates after initial store).
         * @param {string} saleOnlineId - The SaleOnline order ID
         * @param {Object} invoiceData - FastSaleOrder data
         * @param {Object} originalOrder - Optional: SaleOnlineOrder data for enrichment
         */
        set(saleOnlineId, invoiceData, originalOrder = null) {
            if (!saleOnlineId) return;

            // Get original order from store if not provided
            const displayedData = window.displayedData || [];
            const order =
                originalOrder ||
                window.OrderStore?.get(saleOnlineId) ||
                displayedData.find(
                    (o) => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)
                );

            // Simplify OrderLines to reduce storage size
            // Include Note for product discount display (e.g. "100" = giảm 100k)
            const orderLines = (invoiceData.OrderLines || []).map((line) => ({
                ProductName: line.ProductName || line.ProductNameGet || '',
                ProductUOMQty: line.ProductUOMQty || line.Quantity || 1,
                PriceUnit: line.PriceUnit || line.Price || 0,
                PriceTotal:
                    line.PriceTotal ||
                    (line.ProductUOMQty || line.Quantity || 1) *
                        (line.PriceUnit || line.Price || 0),
                Note: line.Note || '', // Ghi chú sản phẩm (giảm giá từng item)
            }));

            // Ensure complete data - use Reference as Number if Number is null (for draft orders)
            const billNumber = invoiceData.Number || invoiceData.Reference || order?.Code || '';

            // Determine ShowState based on payment: "Đã thanh toán" if fully prepaid (CashOnDelivery = 0)
            const cashOnDelivery = invoiceData.CashOnDelivery || 0;
            const paymentAmount = invoiceData.PaymentAmount || 0;
            const isFullyPaid = cashOnDelivery === 0 && paymentAmount > 0;
            const showState = isFullyPaid ? 'Đã thanh toán' : invoiceData.ShowState || 'Nháp';
            const state = isFullyPaid ? 'paid' : invoiceData.State || 'draft';

            const soId = String(saleOnlineId);
            const tposId = invoiceData.Id; // FastSaleOrder ID from TPOS

            // Check if an existing entry for the same SaleOnlineId + same TPOS Id exists
            // If so, update in-place (e.g., enriching with form values after initial storeFromApiResult)
            let entryKey = null;
            if (tposId) {
                for (const [key, value] of this._data.entries()) {
                    const keySoId = extractSaleOnlineId(key);
                    if (keySoId === soId && value.Id === tposId) {
                        entryKey = key; // Found existing entry with same TPOS Id → update in-place
                        break;
                    }
                }
            }

            // If no existing entry found, create a new compound key
            if (!entryKey) {
                entryKey = `${soId}_${Date.now()}`;
            }

            this._myKeys.add(entryKey);
            this._data.set(entryKey, {
                SaleOnlineId: soId, // Store original SaleOnlineId for grouping/lookup
                Id: invoiceData.Id,
                Number: billNumber, // Use complete bill number (never null)
                Reference: invoiceData.Reference || order?.Code || '',
                State: state, // "draft", "open", "cancel", "paid"
                ShowState: showState, // "Nháp", "Đã xác nhận", "Huỷ bỏ", "Đã thanh toán"
                StateCode: invoiceData.StateCode, // "None", "NotEnoughInventory", "CrossCheckComplete", etc.
                IsMergeCancel: invoiceData.IsMergeCancel,
                PartnerId: invoiceData.PartnerId,
                PartnerDisplayName: invoiceData.PartnerDisplayName || order?.Name || '',
                AmountTotal: invoiceData.AmountTotal || order?.TotalAmount || 0,
                AmountUntaxed: invoiceData.AmountUntaxed || 0, // Tổng tiền hàng (chưa ship)
                DeliveryPrice: invoiceData.DeliveryPrice || order?.DeliveryPrice || 0,
                CashOnDelivery: invoiceData.CashOnDelivery || 0,
                PaymentAmount: invoiceData.PaymentAmount || 0, // Số tiền trả trước (wallet balance)
                DebtUsed: invoiceData.DebtUsed || invoiceData.PaymentAmount || 0, // Công nợ đã sử dụng lúc ra đơn
                Discount:
                    invoiceData.Discount ||
                    invoiceData.DiscountAmount ||
                    invoiceData.DecreaseAmount ||
                    0, // Giảm giá
                TrackingRef: invoiceData.TrackingRef || '',
                CarrierName: invoiceData.CarrierName || invoiceData.Carrier?.Name || '',
                UserName:
                    invoiceData.UserName || window.authManager?.currentUser?.displayName || '', // Tên account tạo bill
                SessionIndex: invoiceData.SessionIndex || order?.SessionIndex || '', // STT
                OrderLines: orderLines, // Danh sách sản phẩm (simplified)
                ReceiverName: invoiceData.ReceiverName || order?.Name || '',
                ReceiverPhone: invoiceData.ReceiverPhone || order?.Telephone || '',
                ReceiverAddress: invoiceData.ReceiverAddress || order?.Address || '',
                Comment: invoiceData.Comment || order?.Comment || '',
                DeliveryNote: invoiceData.DeliveryNote || order?.DeliveryNote || '',
                Error: invoiceData.Error,
                DateInvoice: invoiceData.DateInvoice || new Date().toISOString(), // Ngày tạo bill từ API
                DateCreated:
                    invoiceData.DateCreated || order?.DateCreated || new Date().toISOString(), // Ngày tạo đơn
                LiveCampaignId: invoiceData.LiveCampaignId || order?.LiveCampaignId || '', // ID chiến dịch live
                timestamp: Date.now(),
            });
            // Save to API (skip if in batch mode - storeFromApiResult handles batch save)
            if (!this._batchMode) {
                this._saveEntryToAPI(entryKey);
            }
        },

        /**
         * Delete the LATEST invoice entry for a SaleOnlineOrder
         * @param {string} saleOnlineId - The SaleOnline order ID to delete
         * @returns {boolean} True if deleted, false if not found
         */
        async delete(saleOnlineId) {
            if (!saleOnlineId) return false;

            const soId = String(saleOnlineId);

            // Find the LATEST entry's actual key (compound or flat)
            let targetKey = null;
            let latestTs = 0;

            if (this._data.has(soId) && !isCompoundKey(soId)) {
                targetKey = soId;
                latestTs = this._data.get(soId)?.timestamp || 0;
            }

            for (const [key, value] of this._data.entries()) {
                const keySoId = value.SaleOnlineId || extractSaleOnlineId(key);
                if (keySoId === soId) {
                    const ts = value.timestamp || 0;
                    if (ts > latestTs || !targetKey) {
                        targetKey = key;
                        latestTs = ts;
                    }
                }
            }

            if (!targetKey) return false;

            // Delete from API FIRST, then remove locally (atomic: don't lose data if API fails)
            try {
                const response = await fetch(`${API_BASE}/entries/${encodeURIComponent(targetKey)}`, {
                    method: 'DELETE',
                });
                if (!response.ok) {
                    console.error('[INVOICE-STATUS] API delete failed:', response.status);
                    return false; // Don't remove locally if API delete failed
                }
            } catch (e) {
                console.error('[INVOICE-STATUS] API delete error:', e);
                return false; // Don't remove locally on network error
            }

            // API delete succeeded, now remove from local state
            this._data.delete(targetKey);
            this._myKeys.delete(targetKey);
            this._sentBills.delete(soId);

            return true;
        },

        /**
         * Get the LATEST invoice entry for a SaleOnlineOrder
         * @param {string} saleOnlineId
         * @returns {Object|null}
         */
        getLatest(saleOnlineId) {
            if (!saleOnlineId) return null;
            const soId = String(saleOnlineId);

            // Fast path: check legacy flat key first
            if (this._data.has(soId) && !isCompoundKey(soId)) {
                const entry = this._data.get(soId);
                // Make sure it's not a different SaleOnlineId's compound key
                return entry || null;
            }

            // Search all compound keys for this SaleOnlineId
            let latest = null;
            let latestTs = 0;
            for (const [key, value] of this._data.entries()) {
                const keySoId = value.SaleOnlineId || extractSaleOnlineId(key);
                if (keySoId === soId) {
                    const ts = value.timestamp || 0;
                    if (ts > latestTs || !latest) {
                        latest = value;
                        latestTs = ts;
                    }
                }
            }
            return latest;
        },

        /**
         * Get ALL invoice entries for a SaleOnlineOrder (for history/timeline)
         * Returns array sorted by timestamp descending (newest first)
         * @param {string} saleOnlineId
         * @returns {Array<Object>}
         */
        getAll(saleOnlineId) {
            if (!saleOnlineId) return [];
            const soId = String(saleOnlineId);
            const entries = [];

            for (const [key, value] of this._data.entries()) {
                const keySoId = value.SaleOnlineId || extractSaleOnlineId(key);
                if (keySoId === soId) {
                    entries.push(value);
                }
            }

            // Sort by timestamp descending (newest first)
            entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            return entries;
        },

        /**
         * Check if order has at least one invoice entry
         * @param {string} saleOnlineId
         * @returns {boolean}
         */
        has(saleOnlineId) {
            if (!saleOnlineId) return false;
            const soId = String(saleOnlineId);

            // Fast path: check legacy flat key
            if (this._data.has(soId) && !isCompoundKey(soId)) {
                return true;
            }

            // Search compound keys
            for (const [key, value] of this._data.entries()) {
                const keySoId = value.SaleOnlineId || extractSaleOnlineId(key);
                if (keySoId === soId) return true;
            }
            return false;
        },

        /**
         * Mark bill as sent for an order
         * @param {string} saleOnlineId
         */
        async markBillSent(saleOnlineId) {
            if (!saleOnlineId) return;
            const soId = String(saleOnlineId);
            this._sentBills.add(soId);

            try {
                await fetch(`${API_BASE}/sent-bills`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ saleOnlineId: soId, username: this._getUsername() }),
                });
            } catch (e) {
                console.error('[INVOICE-STATUS] markBillSent API error:', e);
            }
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

            // Batch mode: set() will skip individual API saves, we batch at the end
            this._batchMode = true;

            const displayedData = window.displayedData || [];
            const requestModels = window.lastFastSaleModels || [];

            // Helper: enrich order with SessionIndex from SaleOnlineOrder
            const enrichWithSessionIndex = (order) => {
                if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
                    const soId = order.SaleOnlineIds[0];
                    const saleOnlineOrder =
                        window.OrderStore?.get(soId) ||
                        displayedData.find((o) => o.Id === soId || String(o.Id) === String(soId));
                    if (saleOnlineOrder && saleOnlineOrder.SessionIndex) {
                        order.SessionIndex = saleOnlineOrder.SessionIndex;
                    }
                }
                return order;
            };

            // Helper: always get OrderLines from request model (source of truth)
            const enrichWithOrderLines = (order) => {
                const matchedModel = requestModels.find((m) => m.Reference === order.Reference);
                if (matchedModel?.OrderLines?.length > 0) {
                    order.OrderLines = matchedModel.OrderLines;
                }
                return order;
            };

            // Helper: get PaymentAmount and Discount from request model
            // ALWAYS use request model values (API response may have wrong values)
            const enrichWithPaymentData = (order) => {
                const matchedModel = requestModels.find((m) => m.Reference === order.Reference);
                if (matchedModel) {
                    // PaymentAmount = số tiền trả trước từ request (ALWAYS overwrite)
                    if (matchedModel.PaymentAmount !== undefined) {
                        order.PaymentAmount = matchedModel.PaymentAmount;
                    }
                    // Discount = giảm giá từ request (ALWAYS overwrite)
                    const discount = matchedModel.DecreaseAmount || matchedModel.Discount || 0;
                    if (discount > 0) {
                        order.Discount = discount;
                    }
                }
                return order;
            };

            // Helper: get Address from request model (user may have edited address in form)
            const enrichWithAddress = (order) => {
                // Match by Reference or SaleOnlineIds
                const matchedModel = requestModels.find((m) => {
                    if (m.Reference && order.Reference && m.Reference === order.Reference)
                        return true;
                    if (m.SaleOnlineIds?.length && order.SaleOnlineIds?.length) {
                        return (
                            JSON.stringify(m.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)
                        );
                    }
                    return false;
                });
                if (matchedModel) {
                    // Get address from request model (edited in form)
                    const requestAddress =
                        matchedModel.ReceiverAddress ||
                        matchedModel.Address ||
                        matchedModel.Partner?.Street;
                    if (requestAddress) {
                        order.ReceiverAddress = requestAddress;
                        order.Address = requestAddress;
                        if (order.Partner) {
                            order.Partner.Street = requestAddress;
                        }
                    }
                } else {
                    console.warn(
                        '[INVOICE-STATUS] No matching request model for address enrichment:',
                        order.Reference
                    );
                }
                return order;
            };

            // Helper: get CarrierName from request model (user selected in form dropdown)
            const enrichWithCarrier = (order) => {
                const matchedModel = requestModels.find((m) => {
                    if (m.Reference && order.Reference && m.Reference === order.Reference)
                        return true;
                    if (m.SaleOnlineIds?.length && order.SaleOnlineIds?.length) {
                        return (
                            JSON.stringify(m.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)
                        );
                    }
                    return false;
                });
                if (matchedModel) {
                    // Get CarrierName from request model
                    const carrierName =
                        matchedModel.CarrierName || matchedModel.Carrier?.Name || '';
                    if (carrierName) {
                        order.CarrierName = carrierName;
                        if (!order.Carrier) {
                            order.Carrier = {};
                        }
                        order.Carrier.Name = carrierName;
                    }
                }
                return order;
            };

            // Store successful orders
            if (apiResult.OrdersSucessed && Array.isArray(apiResult.OrdersSucessed)) {
                apiResult.OrdersSucessed.forEach((order) => {
                    enrichWithSessionIndex(order);
                    enrichWithOrderLines(order);
                    enrichWithPaymentData(order);
                    enrichWithAddress(order);
                    enrichWithCarrier(order);
                    if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
                        order.SaleOnlineIds.forEach((soId) => {
                            // Get original SaleOnlineOrder for enrichment
                            const originalOrder =
                                window.OrderStore?.get(soId) ||
                                displayedData.find(
                                    (o) => o.Id === soId || String(o.Id) === String(soId)
                                );

                            // ĐƠN GIẢN: Lấy address từ fastSaleOrdersData (đã được user sửa trong form)
                            const fastSaleData = window.fastSaleOrdersData?.find(
                                (f) =>
                                    f.SaleOnlineIds?.includes(soId) ||
                                    JSON.stringify(f.SaleOnlineIds) ===
                                        JSON.stringify(order.SaleOnlineIds)
                            );
                            if (fastSaleData?.ReceiverAddress) {
                                order.ReceiverAddress = fastSaleData.ReceiverAddress;
                                order.Address = fastSaleData.ReceiverAddress;
                            }

                            this.set(soId, order, originalOrder);
                            // Save NJD mapping to DB
                            _saveNjdToDb(soId, order.Reference, order);
                            // Auto-tag ĐÃ RA ĐƠN — nguồn DUY NHẤT, chỉ chạy khi user tạo PBH thành công
                            if (typeof window.onPtagBillCreated === 'function') {
                                window.onPtagBillCreated(soId);
                            }
                        });
                    }
                });
            }

            // Store failed orders (they still have invoice created, just not confirmed)
            if (apiResult.OrdersError && Array.isArray(apiResult.OrdersError)) {
                apiResult.OrdersError.forEach((order) => {
                    enrichWithSessionIndex(order);
                    enrichWithOrderLines(order);
                    enrichWithPaymentData(order);
                    enrichWithAddress(order);
                    enrichWithCarrier(order);
                    if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
                        order.SaleOnlineIds.forEach((soId) => {
                            // Get original SaleOnlineOrder for enrichment
                            const originalOrder =
                                window.OrderStore?.get(soId) ||
                                displayedData.find(
                                    (o) => o.Id === soId || String(o.Id) === String(soId)
                                );

                            // ĐƠN GIẢN: Lấy address từ fastSaleOrdersData (đã được user sửa trong form)
                            const fastSaleData = window.fastSaleOrdersData?.find(
                                (f) =>
                                    f.SaleOnlineIds?.includes(soId) ||
                                    JSON.stringify(f.SaleOnlineIds) ===
                                        JSON.stringify(order.SaleOnlineIds)
                            );
                            if (fastSaleData?.ReceiverAddress) {
                                order.ReceiverAddress = fastSaleData.ReceiverAddress;
                                order.Address = fastSaleData.ReceiverAddress;
                            }

                            this.set(soId, order, originalOrder);
                            // Save NJD mapping to DB (even for failed orders — invoice was created)
                            _saveNjdToDb(soId, order.Reference, order);
                            // Do NOT auto-transition processing tag for failed orders
                            // Failed orders get reset to "Nháp" and tagged "ÂM MÃ" instead
                        });
                    }
                });
            }

            // Batch save all entries to API
            this._batchMode = false;
            this._saveBatchToAPI(Array.from(this._myKeys));
        },

        /**
         * Refresh StateCode from TPOS API for invoices that are still "None" (Chưa đối soát)
         * Uses date range query (1-2 API calls) instead of per-ID queries
         */
        async refreshStateCode() {
            if (!window.tokenManager?.authenticatedFetch) {
                console.warn('[INVOICE-STATUS] tokenManager not available, skip refreshStateCode');
                return;
            }

            // Collect invoices that need refresh (StateCode is None and State is open/paid)
            const toRefreshMap = new Map(); // tposId → { compoundKey, saleOnlineId }
            let earliestDate = null;

            this._data.forEach((value, key) => {
                const stateCode = value.StateCode || 'None';
                const state = value.State || '';
                const tposId = value.Id;
                if (stateCode === 'None' && tposId && (state === 'open' || state === 'paid')) {
                    toRefreshMap.set(tposId, {
                        compoundKey: key,
                        saleOnlineId: value.SaleOnlineId || extractSaleOnlineId(key),
                    });
                    // Track earliest date for query range
                    const dateInvoice = value.DateInvoice ? new Date(value.DateInvoice) : null;
                    if (dateInvoice && (!earliestDate || dateInvoice < earliestDate)) {
                        earliestDate = dateInvoice;
                    }
                }
            });

            if (toRefreshMap.size === 0) {
                return;
            }

            // Default: last 14 days if no date found
            if (!earliestDate) {
                earliestDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
            }

            const tposOData = window.API_CONFIG?.TPOS_ODATA || 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata';
            const updatedKeys = [];
            const keysToSaveAPI = [];

            // Query TPOS by date range - fetches all invoices in one call
            const startDate = earliestDate.toISOString().replace('Z', '+00:00');
            const endDate = new Date().toISOString().replace('Z', '+00:00');
            const select = 'Id,StateCode,State,ShowState,IsMergeCancel';
            const filter = `(Type eq 'invoice' and DateInvoice ge ${startDate} and DateInvoice le ${endDate})`;

            // Paginate: TPOS max ~500 per page
            const PAGE_SIZE = 500;
            let skip = 0;
            let hasMore = true;

            while (hasMore) {
                const url = `${tposOData}/FastSaleOrder/ODataService.GetView?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=${PAGE_SIZE}&$skip=${skip}&$orderby=DateInvoice desc`;

                try {
                    const response = await window.tokenManager.authenticatedFetch(url, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    });

                    if (!response.ok) {
                        console.warn(`[INVOICE-STATUS] TPOS refresh query failed: ${response.status}`);
                        break;
                    }

                    const data = await response.json();
                    const tposOrders = data.value || [];

                    // Match with our stored entries and update StateCode
                    tposOrders.forEach(tposOrder => {
                        const match = toRefreshMap.get(tposOrder.Id);
                        if (match) {
                            const storeEntry = this._data.get(match.compoundKey);
                            if (storeEntry) {
                                const newStateCode = tposOrder.StateCode || 'None';
                                if (newStateCode !== 'None') {
                                    storeEntry.StateCode = newStateCode;
                                    storeEntry.State = tposOrder.State || storeEntry.State;
                                    storeEntry.ShowState = tposOrder.ShowState || storeEntry.ShowState;
                                    storeEntry.IsMergeCancel = tposOrder.IsMergeCancel || false;
                                    this._data.set(match.compoundKey, storeEntry);
                                    updatedKeys.push(match.saleOnlineId);
                                    keysToSaveAPI.push(match.compoundKey);
                                }
                            }
                        }
                    });

                    // Check if more pages
                    hasMore = tposOrders.length === PAGE_SIZE;
                    skip += PAGE_SIZE;
                } catch (e) {
                    console.warn('[INVOICE-STATUS] TPOS refresh error:', e.message);
                    break;
                }
            }

            // Save updated entries to API + re-render UI
            if (keysToSaveAPI.length > 0) {
                this._saveBatchToAPI(keysToSaveAPI);
                // Re-load delivery groups for updated invoices (may have new CrossCheckComplete)
                _loadDeliveryGroupsForCurrentInvoices();
                this._refreshInvoiceStatusUI(updatedKeys);
            }
        },

        /**
         * Cleanup old entries (> 60 days) via API
         */
        async cleanup() {
            try {
                const response = await fetch(`${API_BASE}/cleanup`, { method: 'DELETE' });
                if (response.ok) {
                    const result = await response.json();
                }
            } catch (e) {
                console.error('[INVOICE-STATUS] Cleanup error:', e);
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
        clearAll() {
            this._data.clear();
            this._myKeys.clear();
            this._sentBills.clear();
            localStorage.removeItem(STORAGE_KEY);
        },

        /**
         * Reload data from API (manual refresh)
         */
        async reload() {
            this._data.clear();
            this._sentBills.clear();
            this._myKeys.clear();
            await this._loadFromAPI();

            // Re-render UI
            const allKeys = [];
            this._data.forEach((value, key) => {
                const soId = value.SaleOnlineId || extractSaleOnlineId(key);
                if (soId && !allKeys.includes(soId)) allKeys.push(soId);
            });
            this._refreshInvoiceStatusUI(allKeys);
            this._syncToFulfillmentData();

            // Reconcile PTAG sau khi PBH store đã refresh — catch các đơn mới có PBH
            // nhưng tag XL vẫn CHO_DI_DON.
            if (typeof window.reconcileTagsWithInvoices === 'function') {
                window.reconcileTagsWithInvoices().catch(() => {});
            }
        },

        /**
         * Xóa cache và fetch FRESH data từ TPOS OData cho toàn bộ đơn trong bảng.
         * Khác với reload() (chỉ load cache PostgreSQL), hàm này:
         *   1. Clear InvoiceStatusStore (memory + localStorage)
         *   2. Batch fetch FastSaleOrder OData theo Reference (chunk 20 đơn/req)
         *   3. Store fresh data → batch POST lên PostgreSQL
         *   4. Re-render toàn bộ cột PBH
         *
         * @param {Object} [options]
         * @param {Array}  [options.orders] - Custom order list, default = displayedData
         * @returns {Promise<{ok, total, found, errors}>}
         */
        async refreshAllFromTPOS(options = {}) {
            const orders = options.orders
                || window.displayedData
                || window.allData
                || [];
            if (!orders.length) {
                window.notificationManager?.warning('Không có đơn nào để refresh PBH');
                return { ok: false, reason: 'no-orders' };
            }
            if (!window.tokenManager?.getAuthHeader) {
                window.notificationManager?.error('Token manager chưa sẵn sàng');
                return { ok: false, reason: 'no-token' };
            }

            const tposOData = window.API_CONFIG?.TPOS_ODATA
                || 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata';
            const headers = await window.tokenManager.getAuthHeader();

            // Clear cache trước khi fetch fresh
            this.clearAll();

            // Chunk orders thành batch 20 để tránh URL quá dài
            const CHUNK = 20;
            const chunks = [];
            for (let i = 0; i < orders.length; i += CHUNK) {
                chunks.push(orders.slice(i, i + CHUNK));
            }

            const total = orders.length;
            let done = 0;
            let found = 0;
            let errors = 0;
            const savedKeys = [];

            this._batchMode = true; // set() sẽ skip individual API save
            console.log(`[PBH-REFRESH] Bắt đầu refresh ${total} đơn trong ${chunks.length} batch...`);
            window.notificationManager?.info(`🔄 Đang refresh PBH: 0/${total}...`);

            for (const chunk of chunks) {
                const orFilter = chunk
                    .map((o) => `Reference eq '${String(o.Code || '').replace(/'/g, "''")}'`)
                    .join(' or ');
                const filter = `(Type eq 'invoice' and (${orFilter}))`;
                const url = `${tposOData}/FastSaleOrder/ODataService.GetView`
                    + `?$top=500&$orderby=DateInvoice desc`
                    + `&$filter=${encodeURIComponent(filter)}`;

                try {
                    const resp = await fetch(url, {
                        headers: { ...headers, accept: 'application/json' },
                    });
                    if (!resp.ok) {
                        errors++;
                        console.warn('[PBH-REFRESH] Batch failed:', resp.status);
                    } else {
                        const result = await resp.json();
                        const invoices = Array.isArray(result?.value) ? result.value : [];
                        for (const inv of invoices) {
                            const order = chunk.find((o) => o.Code === inv.Reference);
                            if (!order) continue;
                            const orderShim = {
                                Id: order.Id,
                                Code: order.Code,
                                Name: inv.PartnerDisplayName || order.Name || '',
                                Telephone: inv.Phone || order.Telephone || '',
                                Address: inv.Address || '',
                            };
                            this.set(order.Id, inv, orderShim);
                            // Tìm compound key vừa tạo để batch save
                            const soId = String(order.Id);
                            const tposId = inv.Id;
                            for (const [k, v] of this._data.entries()) {
                                if (v.SaleOnlineId === soId && v.Id === tposId) {
                                    if (!savedKeys.includes(k)) savedKeys.push(k);
                                    break;
                                }
                            }
                            found++;
                        }
                    }
                } catch (e) {
                    errors++;
                    console.error('[PBH-REFRESH] Fetch error:', e);
                }

                done += chunk.length;
                console.log(`[PBH-REFRESH] Progress ${done}/${total} (found ${found}, errors ${errors})`);
            }

            this._batchMode = false;

            // Batch save fresh data lên PostgreSQL (1 request cho tất cả)
            if (savedKeys.length > 0) {
                await this._saveBatchToAPI(savedKeys);
            }

            // Re-render toàn bộ cột PBH (cả đơn có và không có phiếu)
            const allSaleIds = [];
            this._data.forEach((value, key) => {
                const soId = value.SaleOnlineId || extractSaleOnlineId(key);
                if (soId && !allSaleIds.includes(soId)) allSaleIds.push(soId);
            });
            orders.forEach((o) => {
                if (o.Id && !allSaleIds.includes(o.Id)) allSaleIds.push(o.Id);
            });
            this._refreshInvoiceStatusUI(allSaleIds);
            this._syncToFulfillmentData?.();

            window.notificationManager?.success(
                `✅ Refresh PBH xong: ${found}/${total} đơn có phiếu, ${errors} batch lỗi`
            );
            return { ok: true, total, found, errors };
        },
    };

    // =====================================================
    // STATE CODE CONFIGURATION
    // =====================================================

    /**
     * ShowState config - order status (State)
     * Values: Nháp, Đã xác nhận, Huỷ bỏ, Đã thanh toán, etc.
     */
    const SHOW_STATE_CONFIG = {
        Nháp: { color: '#6c757d', bgColor: '#f3f4f6', borderColor: '#d1d5db' },
        'Đã xác nhận': { color: '#2563eb', bgColor: '#dbeafe', borderColor: '#93c5fd' },
        'Huỷ bỏ': {
            color: '#dc2626',
            bgColor: '#fee2e2',
            borderColor: '#fca5a5',
            style: 'text-decoration: line-through;',
        },
        'Đã thanh toán': { color: '#059669', bgColor: '#d1fae5', borderColor: '#6ee7b7' },
        'Hoàn thành': { color: '#059669', bgColor: '#d1fae5', borderColor: '#6ee7b7' },
    };

    /**
     * StateCode config - cross-checking status
     * Values: None, NotEnoughInventory, CrossCheckComplete, CrossCheckSuccess, etc.
     */
    const STATE_CODE_CONFIG = {
        draft: {
            label: 'Nháp',
            cssClass: 'text-info-lt badge badge-empty',
            color: '#17a2b8',
        },
        NotEnoughInventory: {
            label: 'Chờ nhập hàng',
            cssClass: 'text-warning-dk',
            color: '#e67e22',
        },
        cancel: {
            label: 'Hủy',
            cssClass: 'text-danger',
            color: '#6c757d',
            style: 'text-decoration: line-through;',
        },
        IsMergeCancel: {
            label: 'Hủy do gộp đơn',
            cssClass: 'text-danger',
            color: '#6c757d',
            style: 'text-decoration: line-through;',
        },
        CrossCheckingError: {
            label: 'Lỗi đối soát',
            cssClass: 'text-danger-dker',
            color: '#c0392b',
        },
        CrossCheckComplete: {
            label: 'Hoàn thành đối soát',
            cssClass: 'text-success-dk',
            color: '#27ae60',
        },
        CrossCheckSuccess: {
            label: 'Đối soát OK',
            cssClass: 'text-success-dk',
            color: '#27ae60',
        },
        CrossChecking: {
            label: 'Đang đối soát',
            cssClass: 'text-success-dk',
            color: '#27ae60',
        },
        None: {
            label: 'Chưa đối soát',
            cssClass: 'text-secondary',
            color: '#6c757d',
        },
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
            color: '#6c757d',
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
    // =====================================================
    // WS-DRIVEN: Fetch FastSaleOrder by Reference (=SaleOnline_Order Code)
    // và cập nhật InvoiceStatusStore + re-render PBH cell.
    // Lưu cả raw response vào _rawById để modal "Đã ra đơn" hiển thị.
    // =====================================================
    const _rawInvoicesById = new Map(); // saleOnlineId(String) -> Array<invoice> (all PBH cùng Reference)
    const _orderCodeById = new Map();   // saleOnlineId(String) -> orderCode (cache để refetch khi click)

    // ===== Delivery Report Mapping (PostgreSQL: delivery_assignments table) =====
    // Map invoice.Number → group_name ('tomato' | 'nap' | 'city' | 'shop' | 'return')
    // Source of truth: Render DB via /api/v2/delivery-assignments/lookup-batch
    const _deliveryGroups = { data: {}, loaded: false, _pendingNumbers: new Set(), _loadTimer: null };

    const DELIVERY_API_BASE = (window.API_CONFIG?.RENDER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/v2/delivery-assignments';

    /**
     * Queue invoice numbers for batch lookup from PostgreSQL.
     * Debounces 300ms to batch multiple calls together.
     */
    function _queueDeliveryGroupLookup(invoiceNumbers) {
        if (!invoiceNumbers || invoiceNumbers.length === 0) return;
        for (const num of invoiceNumbers) {
            if (num && !_deliveryGroups.data[num]) {
                _deliveryGroups._pendingNumbers.add(num);
            }
        }
        if (_deliveryGroups._loadTimer) clearTimeout(_deliveryGroups._loadTimer);
        _deliveryGroups._loadTimer = setTimeout(() => _flushDeliveryGroupLookup(), 300);
    }

    /**
     * Flush pending numbers: batch-query PostgreSQL for delivery group assignments.
     */
    async function _flushDeliveryGroupLookup() {
        const numbers = Array.from(_deliveryGroups._pendingNumbers);
        _deliveryGroups._pendingNumbers.clear();
        _deliveryGroups._loadTimer = null;
        if (numbers.length === 0) return;

        try {
            const resp = await fetch(`${DELIVERY_API_BASE}/lookup-batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderNumbers: numbers })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const result = await resp.json();
            if (result.success && result.data) {
                let newCount = 0;
                for (const [num, group] of Object.entries(result.data)) {
                    if (_deliveryGroups.data[num] !== group) {
                        _deliveryGroups.data[num] = group;
                        newCount++;
                    }
                }
                _deliveryGroups.loaded = true;
                if (newCount > 0) {
                    console.log('[DELIVERY-MAP] Loaded', newCount, 'new group entries from DB (total:', Object.keys(_deliveryGroups.data).length, ')');
                    // Re-render PBH cells with new delivery group data
                    document.querySelectorAll('tr[data-order-id]').forEach(row => {
                        const soId = row.getAttribute('data-order-id');
                        if (soId) refreshInvoiceStatusCellForOrder(soId);
                    });
                }
            }
        } catch (e) {
            console.warn('[DELIVERY-MAP] DB lookup-batch failed:', e.message);
        }
    }

    /**
     * Load delivery groups for all invoices currently in InvoiceStatusStore.
     * Called after init and after bulk invoice data loads.
     */
    function _loadDeliveryGroupsForCurrentInvoices() {
        const numbers = [];
        InvoiceStatusStore._data.forEach(value => {
            if (value.Number) numbers.push(value.Number);
        });
        if (numbers.length > 0) {
            _queueDeliveryGroupLookup(numbers);
        }
    }

    /**
     * Mapping nhóm vận chuyển cho 1 invoice:
     *   DB group_name 'city' hoặc CarrierName bắt đầu "THÀNH PHỐ" → "THÀNH PHỐ"
     *   DB group_name 'tomato' → "TOMATO"
     *   DB group_name 'nap' → "NAP"
     *   undefined → null (chưa phân nhóm)
     * @returns {{label, color, bg, border} | null}
     */
    function getDeliveryGroupBadge(invoice) {
        if (!invoice) return null;
        const number = invoice.Number;
        const grp = number ? _deliveryGroups.data[number] : null;

        // Check DB group first, then fallback to CarrierName detection
        if (grp === 'city') {
            return { label: 'THÀNH PHỐ', color: '#1e40af', bg: '#dbeafe', border: '#93c5fd' };
        }
        if (grp === 'tomato') {
            return { label: 'TOMATO', color: '#9a3412', bg: '#fed7aa', border: '#fb923c' };
        }
        if (grp === 'nap') {
            return { label: 'NAP', color: '#5b21b6', bg: '#ede9fe', border: '#c4b5fd' };
        }

        // Fallback: CarrierName detection (khi invoice chưa có trong DB)
        const carrier = String(invoice.CarrierName || '').trim();
        if (carrier.toUpperCase().startsWith('THÀNH PHỐ') || carrier.toUpperCase().startsWith('THANH PHO')) {
            return { label: 'THÀNH PHỐ', color: '#1e40af', bg: '#dbeafe', border: '#93c5fd' };
        }
        return null;
    }

    // NJD Mapping API base
    const NJD_API_BASE = (window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/invoice-mapping';

    /**
     * Lookup NJD numbers from Render DB for a SaleOnlineOrder
     */
    async function _lookupNjdFromDb(saleOnlineId) {
        try {
            const resp = await fetch(`${NJD_API_BASE}/lookup/${encodeURIComponent(saleOnlineId)}`);
            if (!resp.ok) return null;
            const data = await resp.json();
            return data.success && data.mappings?.length > 0 ? data.mappings : null;
        } catch (e) {
            console.warn('[INVOICE-NJD] DB lookup failed:', e.message);
            return null;
        }
    }

    /**
     * Save NJD mapping to Render DB (fire-and-forget)
     */
    function _saveNjdToDb(saleOnlineId, orderCode, inv) {
        if (!inv?.Number || !saleOnlineId) return;
        fetch(`${NJD_API_BASE}/upsert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                saleOnlineId: String(saleOnlineId),
                orderCode: orderCode || null,
                njdNumber: inv.Number,
                tposInvoiceId: inv.Id || null,
                partnerName: inv.PartnerDisplayName || null,
                phone: inv.Phone || null,
                amountTotal: inv.AmountTotal || null,
                showState: inv.ShowState || null,
                state: inv.State || null,
                stateCode: inv.StateCode || 'None',
                dateInvoice: inv.DateInvoice || null,
                userName: inv.UserName || null
            })
        }).catch(e => console.warn('[INVOICE-NJD] save failed:', e.message));
    }

    /**
     * Delete NJD mapping from Render DB (fire-and-forget)
     */
    function _deleteNjdFromDb(saleOnlineId) {
        if (!saleOnlineId) return;
        fetch(`${NJD_API_BASE}/${encodeURIComponent(saleOnlineId)}`, { method: 'DELETE' })
            .catch(e => console.warn('[INVOICE-NJD] delete failed:', e.message));
    }

    /**
     * Fetch invoices from TPOS by NJD numbers (reliable mapping)
     */
    async function _fetchByNjdNumbers(njdNumbers, headers) {
        const tposOData = window.API_CONFIG?.TPOS_ODATA || 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata';
        // Build OR filter: Number eq 'NJD/2026/60507' or Number eq 'NJD/2026/60508'
        const conditions = njdNumbers.map(n => `Number eq '${n}'`).join(' or ');
        const filter = `(Type eq 'invoice' and (${conditions}))`;
        const url = `${tposOData}/FastSaleOrder/ODataService.GetView` +
            `?$top=20&$orderby=DateInvoice desc&$filter=${encodeURIComponent(filter)}&$count=true`;
        const resp = await fetch(url, { headers: { ...headers, accept: 'application/json' } });
        if (!resp.ok) return [];
        const data = await resp.json();
        return Array.isArray(data?.value) ? data.value : [];
    }

    /**
     * Fetch invoices from TPOS by Reference (fallback) + validate SaleOnlineIds
     */
    async function _fetchByReferenceFallback(orderCode, saleOnlineId, headers) {
        const tposOData = window.API_CONFIG?.TPOS_ODATA || 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata';
        const filter = `(Type eq 'invoice' and Reference eq '${orderCode}')`;
        const url = `${tposOData}/FastSaleOrder/ODataService.GetView` +
            `?$top=20&$orderby=DateInvoice desc&$filter=${encodeURIComponent(filter)}&$count=true`;
        const resp = await fetch(url, { headers: { ...headers, accept: 'application/json' } });
        if (!resp.ok) return [];
        const data = await resp.json();
        const list = Array.isArray(data?.value) ? data.value : [];

        // Validate: only keep invoices whose SaleOnlineIds contains our saleOnlineId
        if (!saleOnlineId) return list;
        const sid = String(saleOnlineId);
        const validated = list.filter(inv => {
            const soIds = inv.SaleOnlineIds || [];
            return soIds.some(id => String(id) === sid);
        });

        if (validated.length < list.length) {
            console.warn(`[INVOICE-NJD] Reference fallback filtered ${list.length - validated.length} mismatched invoices for ${orderCode}`);
        }
        return validated;
    }

    async function fetchAndUpdateInvoiceForCode(orderCode, saleOnlineId) {
        if (!orderCode) return null;
        if (!window.tokenManager?.getAuthHeader) return null;
        try {
            const headers = await window.tokenManager.getAuthHeader();
            let list = [];

            // Strategy 1: Lookup NJD from DB → fetch by Number (reliable)
            if (saleOnlineId) {
                const dbMappings = await _lookupNjdFromDb(saleOnlineId);
                if (dbMappings && dbMappings.length > 0) {
                    const njdNumbers = dbMappings.map(m => m.njd_number);
                    list = await _fetchByNjdNumbers(njdNumbers, headers);
                    if (list.length > 0) {
                        console.log('[INVOICE-NJD] Found via NJD lookup:', njdNumbers.join(', '));
                    }
                }
            }

            // Strategy 2: Fallback to Reference + validate SaleOnlineIds
            if (list.length === 0) {
                list = await _fetchByReferenceFallback(orderCode, saleOnlineId, headers);
                // Save NJD mappings to DB for future lookups
                if (list.length > 0 && saleOnlineId) {
                    for (const inv of list) {
                        _saveNjdToDb(saleOnlineId, orderCode, inv);
                    }
                    console.log('[INVOICE-NJD] Fallback Reference → saved NJD mappings for', orderCode);
                }
            }

            if (list.length === 0) return null;
            // Latest invoice = first (đã orderby DateInvoice desc)
            const inv = list[0];

            if (saleOnlineId) {
                _rawInvoicesById.set(String(saleOnlineId), list);
                _orderCodeById.set(String(saleOnlineId), String(orderCode));
                // Cảnh báo: nếu có ≥2 phiếu "Đã xác nhận" cùng Reference → row đỏ
                markRowMultiConfirmed(saleOnlineId, list);
                // Ghi vào InvoiceStatusStore để renderInvoiceStatusCell đọc được
                const orderShim = {
                    Id: saleOnlineId,
                    Code: orderCode,
                    Name: inv.PartnerDisplayName || '',
                    Telephone: inv.Phone || '',
                    Address: inv.Address || ''
                };
                InvoiceStatusStore.set(saleOnlineId, inv, orderShim);
                // Queue delivery group lookup cho invoice number mới
                if (inv.Number) _queueDeliveryGroupLookup([inv.Number]);
                // Re-render PBH cell cho row này
                refreshInvoiceStatusCellForOrder(saleOnlineId);
            }
            console.log('[INVOICE-WS] Updated invoice for', orderCode, '→', inv.ShowState, inv.StateCode);
            return inv;
        } catch (e) {
            console.warn('[INVOICE-WS] fetchAndUpdateInvoiceForCode error:', e.message);
            return null;
        }
    }

    /**
     * Đánh dấu row đỏ trong main table nếu có ≥2 phiếu "Đã xác nhận"
     * cùng Reference (= dấu hiệu trùng PBH).
     */
    function markRowMultiConfirmed(saleOnlineId, invoices) {
        const row = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
        if (!row) return;
        const confirmedCount = (invoices || []).filter(i => i && i.ShowState === 'Đã xác nhận').length;
        if (confirmedCount >= 2) {
            row.classList.add('row-multi-confirmed');
            row.title = `⚠️ ${confirmedCount} phiếu "Đã xác nhận" cùng đơn — kiểm tra trùng`;
        } else {
            row.classList.remove('row-multi-confirmed');
            if (row.title && row.title.startsWith('⚠️')) row.removeAttribute('title');
        }
    }

    function refreshInvoiceStatusCellForOrder(saleOnlineId) {
        const row = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
        if (!row) return;
        const cell = row.querySelector('td[data-column="invoice-status"]');
        if (!cell) return;
        const order = (window.OrderStore?.get && window.OrderStore.get(saleOnlineId)) ||
            (window.allData || []).find(o => String(o.Id) === String(saleOnlineId)) ||
            { Id: saleOnlineId };
        cell.innerHTML = renderInvoiceStatusCell(order);
    }

    /**
     * Modal hiển thị TẤT CẢ phiếu bán hàng cho order.
     * Strategy: NJD DB lookup → fallback Reference+validate SaleOnlineIds.
     */
    async function showInvoiceRawModal(saleOnlineId) {
        const sid = String(saleOnlineId);
        // Resolve orderCode: từ cache, hoặc từ allData/OrderStore
        let orderCode = _orderCodeById.get(sid);
        if (!orderCode) {
            const order = (window.OrderStore?.get && window.OrderStore.get(saleOnlineId)) ||
                (window.allData || []).find(o => String(o.Id) === sid);
            orderCode = order?.Code;
        }
        if (!orderCode) {
            window.notificationManager?.warning?.('Không tìm thấy mã đơn hàng');
            return;
        }

        // Mở modal với loading state
        _openInvoiceListModal({ loading: true, orderCode });

        // Fetch fresh
        try {
            if (!window.tokenManager?.getAuthHeader) {
                _openInvoiceListModal({ error: 'tokenManager chưa sẵn sàng', orderCode });
                return;
            }
            const headers = await window.tokenManager.getAuthHeader();
            let list = [];

            // Strategy 1: NJD DB lookup
            const dbMappings = await _lookupNjdFromDb(sid);
            if (dbMappings && dbMappings.length > 0) {
                const njdNumbers = dbMappings.map(m => m.njd_number);
                list = await _fetchByNjdNumbers(njdNumbers, headers);
            }

            // Strategy 2: Fallback Reference + validate
            if (list.length === 0) {
                list = await _fetchByReferenceFallback(orderCode, sid, headers);
                // Save NJD mappings to DB
                for (const inv of list) {
                    _saveNjdToDb(sid, orderCode, inv);
                }
            }

            // Cache lại cho lần sau
            _rawInvoicesById.set(sid, list);
            _orderCodeById.set(sid, orderCode);
            _openInvoiceListModal({ invoices: list, orderCode });
        } catch (e) {
            _openInvoiceListModal({ error: e.message, orderCode });
        }
    }

    /**
     * Render modal với danh sách invoice (tabs theo invoice).
     * State: { loading } | { error, orderCode } | { invoices, orderCode }
     */
    function _openInvoiceListModal(state) {
        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        // Remove existing
        const existing = document.getElementById('invoiceRawModal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'invoiceRawModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        const box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:12px;max-width:980px;width:100%;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 70px rgba(0,0,0,0.35);';

        // ===== HEADER =====
        const header = document.createElement('div');
        header.style.cssText = 'padding:16px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;gap:16px;background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%);';
        const count = state.invoices ? state.invoices.length : '';
        header.innerHTML = `
            <div style="flex:1;min-width:0;">
                <div style="font-size:16px;font-weight:700;color:#0f172a;">Phiếu bán hàng — Đơn ${esc(state.orderCode || '—')}</div>
                <div style="font-size:12px;color:#64748b;margin-top:2px;">${count !== '' ? `${count} phiếu liên quan` : 'Đang tải...'}</div>
            </div>
            <button type="button" id="invoiceRawCloseBtn" style="background:#ef4444;color:#fff;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;font-weight:600;font-size:13px;flex-shrink:0;">✕ Đóng</button>
        `;

        // ===== BODY =====
        const body = document.createElement('div');
        body.style.cssText = 'padding:0;overflow:auto;flex:1;background:#fafbfc;';

        if (state.loading) {
            body.innerHTML = `<div style="padding:60px 20px;text-align:center;color:#64748b;font-size:14px;">⏳ Đang tải danh sách phiếu...</div>`;
        } else if (state.error) {
            body.innerHTML = `<div style="padding:60px 20px;text-align:center;color:#dc2626;font-size:14px;">❌ Lỗi: ${esc(state.error)}</div>`;
        } else if (!state.invoices || state.invoices.length === 0) {
            body.innerHTML = `<div style="padding:60px 20px;text-align:center;color:#64748b;font-size:14px;">📭 Chưa có phiếu bán hàng nào cho đơn này</div>`;
        } else {
            // Tabs (1 tab/invoice) + content area
            const tabsBar = document.createElement('div');
            tabsBar.style.cssText = 'display:flex;gap:0;border-bottom:1px solid #e5e7eb;background:#fff;overflow-x:auto;flex-shrink:0;position:sticky;top:0;z-index:1;';
            const content = document.createElement('div');
            content.style.cssText = 'padding:20px 24px;';

            state.invoices.forEach((inv, idx) => {
                const ssCfg = getShowStateConfig(inv.ShowState || '');
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.dataset.idx = String(idx);
                const dateShort = inv.DateInvoice ? new Date(inv.DateInvoice).toLocaleDateString('vi-VN') : '—';
                tab.style.cssText = `padding:10px 16px;border:none;background:transparent;border-bottom:2px solid transparent;cursor:pointer;font-size:12px;font-weight:600;color:#64748b;white-space:nowrap;display:flex;align-items:center;gap:6px;`;
                // "Đã xác nhận" → chấm xanh lá; các state khác giữ màu cấu hình
                const dotColor = (inv.ShowState === 'Đã xác nhận') ? '#10b981' : ssCfg.color;
                tab.innerHTML = `
                    <span>${esc(inv.Number || `#${idx + 1}`)}</span>
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};"></span>
                    <span style="font-weight:400;color:#94a3b8;">${dateShort}</span>
                `;
                tab.onclick = () => {
                    tabsBar.querySelectorAll('button').forEach(b => {
                        b.style.borderBottomColor = 'transparent';
                        b.style.color = '#64748b';
                        b.style.background = 'transparent';
                    });
                    tab.style.borderBottomColor = '#0ea5e9';
                    tab.style.color = '#0f172a';
                    tab.style.background = '#f0f9ff';
                    content.innerHTML = '';
                    content.appendChild(_renderInvoiceDetailBlock(inv));
                };
                tabsBar.appendChild(tab);
            });

            body.appendChild(tabsBar);
            body.appendChild(content);
            // Mở tab đầu tiên
            tabsBar.querySelector('button')?.click();
        }

        box.appendChild(header);
        box.appendChild(body);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('invoiceRawCloseBtn').onclick = () => overlay.remove();

        // ESC to close
        const onKey = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); } };
        document.addEventListener('keydown', onKey);
    }

    /**
     * Render block chi tiết 1 invoice (tái sử dụng layout cũ).
     */
    function _renderInvoiceDetailBlock(invoice) {
        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const fmtMoney = (n) => (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
        const fmtDate = (d) => {
            if (!d) return '—';
            try { return new Date(d).toLocaleString('vi-VN', { hour12: false }); }
            catch (e) { return String(d); }
        };
        const ssCfg = getShowStateConfig(invoice.ShowState || '');
        const scCfg = getStateCodeConfig(invoice.StateCode || 'None', invoice.IsMergeCancel);

        let lines = [];
        if (Array.isArray(invoice.Details)) lines = invoice.Details;
        else if (Array.isArray(invoice.OrderLines)) lines = invoice.OrderLines;

        const wrap = document.createElement('div');

        // Header info
        let html = `
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                <span style="font-size:18px;font-weight:700;color:#0f172a;">${esc(invoice.Number || '—')}</span>
                <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;background:${ssCfg.bgColor};color:${ssCfg.color};border:1px solid ${ssCfg.borderColor};${ssCfg.style || ''}">${esc(invoice.ShowState || '—')}</span>
                <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:#fff;color:${scCfg.color};border:1px solid ${scCfg.color}33;${scCfg.style || ''}">${esc(scCfg.label)}</span>
            </div>
            <div style="font-size:13px;color:#475569;margin-bottom:18px;">
                👤 <strong>${esc(invoice.PartnerDisplayName || '—')}</strong>
                <span style="margin:0 8px;color:#cbd5e1;">·</span>
                📞 ${esc(invoice.Phone || invoice.PartnerPhone || invoice.ReceiverPhone || '—')}
                <span style="margin:0 8px;color:#cbd5e1;">·</span>
                📅 ${fmtDate(invoice.DateInvoice)}
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:18px;">
                ${_invStatCard('Tổng tiền', fmtMoney(invoice.AmountTotal), '#0ea5e9')}
                ${_invStatCard('Đã thanh toán', fmtMoney(invoice.PaymentAmount), '#10b981')}
                ${_invStatCard('Còn nợ', fmtMoney(invoice.Residual), (invoice.Residual > 0 ? '#dc2626' : '#64748b'))}
                ${_invStatCard('Phí ship', fmtMoney(invoice.DeliveryPrice), '#f59e0b')}
            </div>
        `;

        const receiverName = invoice.ReceiverName || invoice.Ship_Receiver_Name || invoice.PartnerDisplayName || '';
        const receiverPhone = invoice.ReceiverPhone || invoice.Ship_Receiver_Phone || '';
        const receiverAddr = invoice.ReceiverAddress || invoice.Ship_Receiver_Street || invoice.Address || invoice.FullAddress || '';
        html += `
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:14px;">
                <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">📦 Người nhận hàng</div>
                <div style="font-size:14px;color:#0f172a;line-height:1.6;">
                    <strong>${esc(receiverName)}</strong> · ${esc(receiverPhone)}<br>
                    <span style="color:#475569;">${esc(receiverAddr)}</span>
                </div>
                ${invoice.CarrierName ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e5e7eb;font-size:12px;color:#475569;">🚚 <strong>${esc(invoice.CarrierName)}</strong>${invoice.CashOnDelivery ? ` · COD: <strong style="color:#dc2626;">${fmtMoney(invoice.CashOnDelivery)}</strong>` : ''}</div>` : ''}
            </div>
        `;

        if (lines.length > 0) {
            const linesHtml = lines.map((l, i) => {
                const name = l.ProductName || l.ProductNameGet || l.Name || '—';
                const qty = l.ProductUOMQty || l.Quantity || l.ProductUOMQtyAvailable || 0;
                const unit = l.PriceUnit || l.Price || 0;
                const total = l.PriceTotal || l.PriceSubTotal || (qty * unit);
                const note = l.Note || '';
                return `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:10px 8px;color:#64748b;font-size:12px;text-align:center;width:32px;">${i + 1}</td>
                        <td style="padding:10px 8px;">
                            <div style="font-size:13px;color:#0f172a;font-weight:500;">${esc(name)}</div>
                            ${note ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;font-style:italic;">📝 ${esc(note)}</div>` : ''}
                        </td>
                        <td style="padding:10px 8px;text-align:center;font-size:13px;color:#475569;width:60px;">${qty}</td>
                        <td style="padding:10px 8px;text-align:right;font-size:13px;color:#475569;width:120px;">${fmtMoney(unit)}</td>
                        <td style="padding:10px 8px;text-align:right;font-size:13px;color:#0f172a;font-weight:600;width:120px;">${fmtMoney(total)}</td>
                    </tr>`;
            }).join('');
            html += `
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:14px;">
                    <div style="padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">🛒 Sản phẩm (${lines.length})</div>
                    <table style="width:100%;border-collapse:collapse;">
                        <thead>
                            <tr style="background:#f8fafc;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;">
                                <th style="padding:8px;text-align:center;">#</th>
                                <th style="padding:8px;text-align:left;">Tên sản phẩm</th>
                                <th style="padding:8px;text-align:center;">SL</th>
                                <th style="padding:8px;text-align:right;">Đơn giá</th>
                                <th style="padding:8px;text-align:right;">Thành tiền</th>
                            </tr>
                        </thead>
                        <tbody>${linesHtml}</tbody>
                    </table>
                </div>
            `;
        }

        if (invoice.Comment || invoice.DeliveryNote) {
            html += `
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:14px;">
                    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">📝 Ghi chú</div>
                    ${invoice.Comment ? `<div style="font-size:13px;color:#0f172a;margin-bottom:6px;"><strong>Comment:</strong> ${esc(invoice.Comment)}</div>` : ''}
                    ${invoice.DeliveryNote ? `<div style="font-size:12px;color:#64748b;line-height:1.5;white-space:pre-wrap;"><strong>Delivery note:</strong>\n${esc(invoice.DeliveryNote)}</div>` : ''}
                </div>
            `;
        }

        html += `
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:12px;color:#475569;">
                <div><strong style="color:#0f172a;">ID:</strong> ${esc(invoice.Id || '—')}</div>
                <div><strong style="color:#0f172a;">User:</strong> ${esc(invoice.UserName || '—')}</div>
                <div><strong style="color:#0f172a;">Type:</strong> ${esc(invoice.Type || '—')}</div>
                <div><strong style="color:#0f172a;">Warehouse:</strong> ${esc(invoice.WarehouseName || invoice.WarehouseId || '—')}</div>
                <div><strong style="color:#0f172a;">DateCreated:</strong> ${fmtDate(invoice.DateCreated)}</div>
                <div><strong style="color:#0f172a;">DateInvoice:</strong> ${fmtDate(invoice.DateInvoice)}</div>
            </div>

            <details style="margin-top:14px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;">
                <summary style="cursor:pointer;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">⚙️ Raw JSON (debug)</summary>
                <pre style="margin:10px 0 0;font-family:Menlo,Consolas,monospace;font-size:11px;line-height:1.5;color:#475569;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow:auto;">${esc(JSON.stringify(invoice, null, 2))}</pre>
            </details>
        `;

        wrap.innerHTML = html;
        return wrap;
    }

    function _invStatCard(label, value, color) {
        return `
            <div style="background:#fff;border:1px solid #e5e7eb;border-left:3px solid ${color};border-radius:8px;padding:10px 14px;">
                <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${label}</div>
                <div style="font-size:16px;font-weight:700;color:${color};">${value}</div>
            </div>
        `;
    }

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

        // Invoice Number badge (e.g. NJD/2026/60576)
        if (invoiceData.Number) {
            const shortNum = invoiceData.Number.replace(/^NJD\//, '');
            html += `<span style="background: #f0f9ff; color: #0369a1; font-size: 9px; padding: 1px 4px; border-radius: 3px; font-weight: 500; border: 1px solid #bae6fd; cursor: pointer;" onclick="navigator.clipboard.writeText('${invoiceData.Number.replace(/'/g, "\\'")}'); window.notificationManager?.success('Đã copy ${invoiceData.Number.replace(/'/g, "\\'")}', 1500); event.stopPropagation();" title="Click để copy mã phiếu">${shortNum}</span>`;
        }

        // Messenger button or sent badge - show for confirmed/paid invoices
        const isMyCskh = (invoiceData.UserName || '').toUpperCase().includes('MY CSKH');
        const canSendBill = showState === 'Đã xác nhận' || showState === 'Đã thanh toán';
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
        } else if (canSendBill) {
            // Allow sending bill for confirmed or paid invoices
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

        // X button for confirmed/paid invoices - to request cancellation
        if (canSendBill) {
            html += `
                <button type="button"
                    class="btn-cancel-order-main"
                    data-order-id="${order.Id}"
                    onclick="window.showCancelOrderModalFromMain('${order.Id}'); event.stopPropagation();"
                    title="Nhờ hủy đơn"
                    style="background: #dc2626; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 10px; display: inline-flex; align-items: center; gap: 2px; margin-left: 2px;">
                    ✕
                </button>
            `;
        }
        html += `</div>`;

        // Row 2: StateCode text (cross-check status like Chưa đối soát, Hoàn thành đối soát)
        // Khi "Hoàn thành đối soát" → thêm badge nhóm vận chuyển từ delivery_report
        let deliveryBadgeHtml = '';
        if (stateCode === 'CrossCheckComplete') {
            const dg = getDeliveryGroupBadge(invoiceData);
            if (dg) {
                deliveryBadgeHtml = ` <span class="invoice-delivery-group-badge" style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;background:${dg.bg};color:${dg.color};border:1px solid ${dg.border};margin-left:4px;">${dg.label}</span>`;
            }
        }
        html += `<div style="font-size: 11px; color: ${stateCodeConfig.color}; ${stateCodeStyle}">${stateCodeConfig.label}${deliveryBadgeHtml}</div>`;

        // Row 3: Trạng thái đơn (derive từ StateCode) + nút "Đã ra đơn"
        const orderStatus = deriveOrderStatusFromStateCode(stateCode, isMergeCancel);
        html += `<div style="display:flex; align-items:center; gap:4px; margin-top:2px; flex-wrap:wrap;">`;
        // "Lịch sử" badge → click mở modal hiển thị toàn bộ response invoice
        html += `<span class="invoice-ra-don-badge" onclick="window.showInvoiceRawModal('${order.Id}'); event.stopPropagation();" title="Xem lịch sử phiếu bán hàng">Lịch sử</span>`;

        // "+ PBH" button with invoice count — always show when invoice exists
        const allEntries = InvoiceStatusStore.getAll(order.Id);
        const entryCount = allEntries.length;
        html += `<button type="button" onclick="window._forceCreatePBH('${order.Id}'); event.stopPropagation();" title="Tạo phiếu bán hàng mới (đã tạo ${entryCount} lần)" style="background:#f59e0b;color:#fff;border:none;border-radius:3px;padding:1px 6px;cursor:pointer;font-size:10px;font-weight:600;">+ PBH${entryCount > 1 ? ' (' + entryCount + ')' : ''}</button>`;
        html += `</div>`;

        html += `</div>`;
        return html;
    }

    /**
     * Derive trạng thái đơn (Đơn hàng / Hủy / Nháp) từ StateCode.
     * Mapping theo plan:
     *   Nháp:    draft, NotEnoughInventory
     *   Hủy:     cancel, IsMergeCancel, None
     *   Đơn hàng: CrossCheckingError, CrossCheckComplete, CrossCheckSuccess, CrossChecking
     */
    function deriveOrderStatusFromStateCode(stateCode, isMergeCancel) {
        if (isMergeCancel) return { text: 'Hủy', cls: 'cancel' };
        switch (stateCode) {
            case 'draft':
            case 'NotEnoughInventory':
                return { text: 'Nháp', cls: 'draft' };
            case 'cancel':
            case 'IsMergeCancel':
            case 'None':
                return { text: 'Hủy', cls: 'cancel' };
            case 'CrossCheckingError':
            case 'CrossCheckComplete':
            case 'CrossCheckSuccess':
            case 'CrossChecking':
            default:
                return { text: 'Đơn hàng', cls: 'order' };
        }
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
     * @param {number} walletBalance - Optional wallet balance for bill calculation
     */
    async function showBillPreviewModal(
        enrichedOrder,
        channelId,
        psid,
        orderId,
        orderCode,
        source,
        resultIndex,
        viewOnly = false,
        walletBalance = 0
    ) {
        const modal = document.getElementById('billPreviewSendModal');
        const container = document.getElementById('billPreviewSendContainer');
        const sendBtn = document.getElementById('billPreviewSendBtn');
        const printSendBtn = document.getElementById('billPreviewPrintSendBtn');

        if (!modal || !container) {
            console.error('[INVOICE-STATUS] Preview modal elements not found');
            // Fallback to direct send (only if not view-only)
            if (!viewOnly) {
                return performActualSend(
                    enrichedOrder,
                    channelId,
                    psid,
                    orderId,
                    orderCode,
                    source,
                    resultIndex
                );
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
            viewOnly,
            walletBalance,
        };

        // Show loading in container
        container.innerHTML =
            '<p style="color: #9ca3af; padding: 40px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Đang tạo bill...</p>';

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
                billHTML = window.generateCustomBillHTML(enrichedOrder, { walletBalance });
            }

            if (billHTML) {
                // Use iframe to display bill exactly as-is (no CSS conflicts)
                const iframe = document.createElement('iframe');
                iframe.style.cssText =
                    'width: 100%; height: 600px; border: none; background: white;';
                container.innerHTML = '';
                container.appendChild(iframe);

                // Write the full HTML to iframe
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                iframeDoc.open();
                iframeDoc.write(billHTML);
                iframeDoc.close();

                // Pre-generate bill image in background (don't await - fire and forget)
                // This makes sending instant when user clicks "Gửi"
                if (
                    !viewOnly &&
                    channelId &&
                    typeof window.generateBillImage === 'function' &&
                    window.pancakeDataManager
                ) {
                    preGenerateBillInBackground(enrichedOrder, channelId, billHTML, walletBalance);
                }
            } else {
                container.innerHTML =
                    '<p style="color: #ef4444; padding: 40px; text-align: center;">Không thể tạo bill preview</p>';
            }
        } catch (error) {
            console.error('[INVOICE-STATUS] Error generating bill preview:', error);
            container.innerHTML =
                '<p style="color: #ef4444; padding: 40px; text-align: center;">Lỗi khi tạo bill preview</p>';
        }

        // Enable send button (only if not view-only)
        if (sendBtn && !viewOnly) {
            sendBtn.disabled = false;
        }
    }

    /**
     * Pre-generate bill image and upload to Pancake in background
     * Runs while user is viewing the preview - makes sending instant
     */
    async function preGenerateBillInBackground(enrichedOrder, channelId, billHtml, walletBalance) {
        const cacheKey = enrichedOrder.Id || enrichedOrder.Number;
        try {
            // Initialize cache if not exists
            if (!window.preGeneratedBillData) {
                window.preGeneratedBillData = new Map();
            }

            // Generate image from the same HTML used in preview
            const imageBlob = await window.generateBillImage(enrichedOrder, {
                billHtml,
                walletBalance,
            });

            // Convert blob to File for upload
            const imageFile = new File([imageBlob], `bill_${cacheKey}.png`, { type: 'image/png' });

            // Upload to Pancake — API returns { id, type, success }
            const uploadResult = await window.pancakeDataManager.uploadImage(channelId, imageFile);
            const contentId =
                typeof uploadResult === 'object'
                    ? uploadResult.id || uploadResult.content_id
                    : (typeof uploadResult === 'string' ? uploadResult : null);

            if (contentId) {
                // Cache for later use
                window.preGeneratedBillData.set(cacheKey, {
                    contentId,
                    timestamp: Date.now(),
                });
            }
        } catch (error) {
            console.warn(
                '[INVOICE-STATUS] ⚠️ Pre-generation failed (will regenerate on send):',
                error.message
            );
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
                container.innerHTML =
                    '<p style="color: #9ca3af; padding: 40px; text-align: center;">Đang tạo bill...</p>';
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

        const { enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex } =
            pendingSendData;

        // Close modal immediately and show sending notification
        closeBillPreviewSendModal();
        window.notificationManager?.info(`📤 Đang gửi bill #${orderCode}...`, 10000);

        // Run send in background
        performActualSend(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex)
            .then(() => {
                // Success handled in performActualSend
            })
            .catch((error) => {
                console.error('[INVOICE-STATUS] Error sending from preview:', error);
                window.notificationManager?.error(
                    `❌ Gửi bill #${orderCode} thất bại: ${error.message}`,
                    5000
                );
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
            const headers = await getBillAuthHeader();
            const orderData = enrichedOrder.SessionIndex
                ? enrichedOrder
                : window.OrderStore?.get(enrichedOrder.SaleOnlineIds?.[0]) || enrichedOrder;
            window.fetchAndPrintTPOSBill(tposOrderId, headers, orderData);
        } else if (typeof window.openCombinedPrintPopup === 'function') {
            // Fallback to custom bill
            window.openCombinedPrintPopup([enrichedOrder]);
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

        const { enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex } =
            pendingSendData;
        const tposOrderId = enrichedOrder.Id || orderId;

        // 1. Open print popup first (TPOS bill if available)
        if (tposOrderId && typeof window.fetchAndPrintTPOSBill === 'function') {
            const headers = await getBillAuthHeader();
            const orderData = enrichedOrder.SessionIndex
                ? enrichedOrder
                : window.OrderStore?.get(enrichedOrder.SaleOnlineIds?.[0]) || enrichedOrder;
            window.fetchAndPrintTPOSBill(tposOrderId, headers, orderData);
        } else if (typeof window.openCombinedPrintPopup === 'function') {
            window.openCombinedPrintPopup([enrichedOrder]);
        }

        // 2. Close modal immediately and show sending notification
        closeBillPreviewSendModal();
        window.notificationManager?.info(`🖨️ Đang in và gửi bill #${orderCode}...`, 10000);

        // 3. Run send in background
        performActualSend(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex)
            .then(() => {
                // Success handled in performActualSend
            })
            .catch((error) => {
                console.error('[INVOICE-STATUS] Error printing and sending:', error);
                window.notificationManager?.error(
                    `❌ Gửi bill #${orderCode} thất bại: ${error.message}`,
                    5000
                );
            });
    }

    /**
     * Bulk print bills for all currently selected (checked) orders.
     * Reuses window.openCombinedTPOSPrintPopup (official TPOS template) and falls
     * back to window.openCombinedPrintPopup (custom HTML) for orders without a
     * TPOS FastSaleOrder Id.
     */
    async function bulkPrintSelectedBills() {
        const ids = Array.from(window.selectedOrderIds || []);
        if (ids.length === 0) {
            window.notificationManager?.warning('Chưa chọn đơn nào');
            return;
        }

        const tposOrders = [];
        const fallbackOrders = [];
        let skipped = 0;

        for (const saleOnlineId of ids) {
            const inv = InvoiceStatusStore.get(saleOnlineId);
            const order =
                window.OrderStore?.get(saleOnlineId) ||
                (window.displayedData || []).find(
                    (o) => String(o.Id) === String(saleOnlineId)
                );
            if (!inv || !order) { skipped++; continue; }
            if (inv.Id) {
                tposOrders.push({ orderId: inv.Id, orderData: order });
            } else {
                fallbackOrders.push(order);
            }
        }

        const total = tposOrders.length + fallbackOrders.length;
        if (total === 0) {
            window.notificationManager?.error('Không có đơn nào có phiếu bán hàng để in');
            return;
        }

        window.notificationManager?.info(`🖨 Đang chuẩn bị in ${total} phiếu...`, 4000);

        try {
            if (tposOrders.length > 0) {
                if (typeof window.openCombinedTPOSPrintPopup !== 'function') {
                    throw new Error('openCombinedTPOSPrintPopup không khả dụng');
                }
                const headers = await getBillAuthHeader();
                await window.openCombinedTPOSPrintPopup(tposOrders, headers);
            }
            if (fallbackOrders.length > 0) {
                if (typeof window.openCombinedPrintPopup !== 'function') {
                    throw new Error('openCombinedPrintPopup không khả dụng');
                }
                window.openCombinedPrintPopup(fallbackOrders);
            }
            if (skipped > 0) {
                window.notificationManager?.warning(
                    `Bỏ qua ${skipped} đơn chưa có PBH`,
                    4000
                );
            }

            // Mark "đã in phiếu soạn" cho mọi đơn vừa in (cả TPOS và fallback)
            if (typeof window.onPtagPackingSlipPrinted === 'function') {
                for (const { orderData } of tposOrders) {
                    const soId = String(orderData?.Id || '');
                    if (soId) window.onPtagPackingSlipPrinted(soId);
                }
                for (const order of fallbackOrders) {
                    const soId = String(order?.Id || '');
                    if (soId) window.onPtagPackingSlipPrinted(soId);
                }
            }
        } catch (e) {
            console.error('[BULK-PRINT-BILL]', e);
            window.notificationManager?.error(`Lỗi in hàng loạt: ${e.message}`, 5000);
        }
    }

    /**
     * Perform actual bill send
     */
    async function performActualSend(
        enrichedOrder,
        channelId,
        psid,
        orderId,
        orderCode,
        source,
        resultIndex
    ) {
        // Check for pre-generated bill data
        const cachedData =
            window.preGeneratedBillData?.get(enrichedOrder.Id) ||
            window.preGeneratedBillData?.get(enrichedOrder.Number);
        const sendOptions = {};
        if (cachedData && cachedData.contentId) {
            sendOptions.preGeneratedContentId = cachedData.contentId;
        }

        if (typeof window.sendBillToCustomer !== 'function') {
            throw new Error('sendBillToCustomer function not available');
        }

        const result = await window.sendBillToCustomer(enrichedOrder, channelId, psid, sendOptions);

        if (result.success) {
            // Mark as sent
            InvoiceStatusStore.markBillSent(orderId);

            // Update UI based on source
            if (source === 'main') {
                const cell = document.querySelector(
                    `td[data-column="invoice-status"] .btn-send-bill-main[data-order-id="${orderId}"]`
                );
                if (cell) {
                    // Change button style to green (sent), keep same onclick for viewing
                    cell.style.background = '#d1fae5';
                    cell.style.color = '#059669';
                    cell.style.border = '1px solid #6ee7b7';
                    cell.title = 'Xem bill (đã gửi) - chỉ in, không gửi lại';
                    cell.innerHTML = '✓';
                }
            } else if (source === 'results') {
                const cell = document.querySelector(
                    `.invoice-status-cell[data-order-id="${enrichedOrder.Id}"]`
                );
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
        const order =
            window.OrderStore?.get(orderId) ||
            displayedData.find((o) => o.Id === orderId || String(o.Id) === String(orderId));

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

        // Fallback: Auto-detect carrier from address if CarrierName is empty
        let carrierName = invoiceData.CarrierName;
        if (
            !carrierName &&
            invoiceData.ReceiverAddress &&
            typeof window.extractDistrictFromAddress === 'function'
        ) {
            const districtInfo = window.extractDistrictFromAddress(
                invoiceData.ReceiverAddress,
                null
            );
            if (districtInfo) {
                carrierName = getCarrierNameFromDistrict(districtInfo);
            }
        }

        const enrichedOrder = {
            Id: invoiceData.Id,
            Number: invoiceData.Number, // Already complete (never null)
            Reference: invoiceData.Reference,
            DateInvoice: invoiceData.DateInvoice, // Ngày tạo bill từ TPOS
            PartnerDisplayName: invoiceData.PartnerDisplayName || invoiceData.ReceiverName,
            DeliveryPrice: invoiceData.DeliveryPrice,
            CashOnDelivery: invoiceData.CashOnDelivery,
            PaymentAmount: invoiceData.PaymentAmount, // Số tiền trả trước
            Discount: invoiceData.Discount, // Giảm giá
            AmountTotal: invoiceData.AmountTotal,
            AmountUntaxed: invoiceData.AmountUntaxed,
            CarrierName: carrierName,
            UserName: invoiceData.UserName,
            SessionIndex: invoiceData.SessionIndex,
            Comment: invoiceData.Comment,
            DeliveryNote: invoiceData.DeliveryNote,
            SaleOnlineIds: [orderId],
            OrderLines: invoiceData.OrderLines || [],
            Partner: {
                Name: invoiceData.ReceiverName,
                Phone: invoiceData.ReceiverPhone,
                Street: invoiceData.ReceiverAddress,
            },
        };

        // Calculate walletBalance for bill generation
        const walletBalance = invoiceData.PaymentAmount || 0;

        // Check if preview is enabled
        if (isPreviewBeforeSendEnabled()) {
            // Show preview modal (viewOnly if bill already sent)
            await showBillPreviewModal(
                enrichedOrder,
                channelId,
                psid,
                orderId,
                order.Code || order.Name,
                'main',
                null,
                billAlreadySent,
                walletBalance
            );
        } else {
            // Direct send with confirm
            const confirmed = confirm(
                `Xác nhận gửi bill cho đơn hàng ${order.Code || order.Name}?`
            );
            if (!confirmed) return;

            // Find button and show loading
            const button = document.querySelector(
                `.btn-send-bill-main[data-order-id="${orderId}"]`
            );
            if (button) {
                button.disabled = true;
                button.innerHTML = '...';
            }

            try {
                await performActualSend(
                    enrichedOrder,
                    channelId,
                    psid,
                    orderId,
                    order.Code || order.Name,
                    'main',
                    null
                );
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
    // BULK SEND BILL FROM MAIN TABLE
    // Gửi hình bill qua Messenger cho các đơn đã tick checkbox
    // =====================================================

    /**
     * Build enrichedOrder payload from an invoice entry (same shape as sendBillFromMainTable)
     */
    function _buildEnrichedFromInvoice(invoiceData, orderId) {
        let carrierName = invoiceData.CarrierName;
        if (!carrierName && invoiceData.ReceiverAddress
            && typeof window.extractDistrictFromAddress === 'function') {
            const districtInfo = window.extractDistrictFromAddress(invoiceData.ReceiverAddress, null);
            if (districtInfo) carrierName = getCarrierNameFromDistrict(districtInfo);
        }
        return {
            Id: invoiceData.Id,
            Number: invoiceData.Number,
            Reference: invoiceData.Reference,
            DateInvoice: invoiceData.DateInvoice,
            PartnerDisplayName: invoiceData.PartnerDisplayName || invoiceData.ReceiverName,
            DeliveryPrice: invoiceData.DeliveryPrice,
            CashOnDelivery: invoiceData.CashOnDelivery,
            PaymentAmount: invoiceData.PaymentAmount,
            Discount: invoiceData.Discount,
            AmountTotal: invoiceData.AmountTotal,
            AmountUntaxed: invoiceData.AmountUntaxed,
            CarrierName: carrierName,
            UserName: invoiceData.UserName,
            SessionIndex: invoiceData.SessionIndex,
            Comment: invoiceData.Comment,
            DeliveryNote: invoiceData.DeliveryNote,
            SaleOnlineIds: [orderId],
            OrderLines: invoiceData.OrderLines || [],
            Partner: {
                Name: invoiceData.ReceiverName,
                Phone: invoiceData.ReceiverPhone,
                Street: invoiceData.ReceiverAddress,
            },
        };
    }

    /**
     * Bulk send bill images via Messenger for checkbox-selected orders on the main table.
     * Filters out orders without PBH / without Messenger info / already sent.
     *
     * Concurrency model: a small pool of N workers pulls from a shared queue.
     * - Per-page concurrency cap (PER_PAGE_CONCURRENCY) prevents hammering the same
     *   Pancake page (PAT rotation + rate limit).
     * - Global cap (GLOBAL_CONCURRENCY) bounds total parallelism across all pages.
     * - Thanks to refreshPageAccessToken in-flight dedupe, N concurrent workers on
     *   the same page that hit "access_token renewed" share one refresh promise.
     */
    async function bulkSendSelectedBills() {
        const ids = Array.from(window.selectedOrderIds || []);
        if (ids.length === 0) {
            window.notificationManager?.warning('Chưa chọn đơn nào');
            return;
        }

        const displayedData = window.displayedData || [];
        const orderStore = window.OrderStore;

        const eligible = [];     // { orderId, order, invoiceData, psid, channelId }
        const skipNoInvoice = [];
        const skipNoMessenger = [];
        const skipAlreadySent = [];

        for (const orderId of ids) {
            const invoiceData = InvoiceStatusStore.get(orderId);
            if (!invoiceData) { skipNoInvoice.push(orderId); continue; }

            const order = orderStore?.get(orderId)
                || displayedData.find(o => String(o.Id) === String(orderId));
            if (!order) { skipNoInvoice.push(orderId); continue; }

            const psid = order.Facebook_ASUserId;
            const postId = order.Facebook_PostId;
            const channelId = postId ? postId.split('_')[0] : null;
            if (!psid || !channelId) { skipNoMessenger.push(orderId); continue; }

            if (InvoiceStatusStore.isBillSent(orderId)) { skipAlreadySent.push(orderId); continue; }

            eligible.push({ orderId, order, invoiceData, psid, channelId });
        }

        if (eligible.length === 0) {
            const parts = [];
            if (skipNoInvoice.length) parts.push(`${skipNoInvoice.length} chưa có PBH`);
            if (skipNoMessenger.length) parts.push(`${skipNoMessenger.length} thiếu Messenger info`);
            if (skipAlreadySent.length) parts.push(`${skipAlreadySent.length} đã gửi`);
            window.notificationManager?.warning(
                `Không có đơn nào hợp lệ để gửi (${parts.join(', ') || 'tất cả bị bỏ qua'})`,
                5000
            );
            return;
        }

        // Tunable concurrency (override via window.BULK_BILL_CONCURRENCY / _PER_PAGE)
        const GLOBAL_CONCURRENCY = Math.max(1, Number(window.BULK_BILL_CONCURRENCY) || 4);
        const PER_PAGE_CONCURRENCY = Math.max(1, Number(window.BULK_BILL_PER_PAGE_CONCURRENCY) || 2);

        // Confirm with summary
        const skipLines = [];
        if (skipNoInvoice.length) skipLines.push(`• ${skipNoInvoice.length} đơn chưa có PBH`);
        if (skipNoMessenger.length) skipLines.push(`• ${skipNoMessenger.length} đơn thiếu thông tin Messenger`);
        if (skipAlreadySent.length) skipLines.push(`• ${skipAlreadySent.length} đơn đã gửi bill trước đó`);
        const skipSummary = skipLines.length ? `\n\nBỏ qua:\n${skipLines.join('\n')}` : '';
        const msg = `Gửi song song hình bill qua Messenger cho ${eligible.length} đơn?\n`
            + `(concurrency: ${GLOBAL_CONCURRENCY} global / ${PER_PAGE_CONCURRENCY} per page)${skipSummary}`;
        if (!confirm(msg)) return;

        const btn = document.getElementById('bulkSendBillBtn');
        const originalHtml = btn?.innerHTML;
        if (btn) { btn.disabled = true; }

        const total = eligible.length;
        let sent = 0;
        let failed = 0;
        let done = 0;
        const errors = [];
        const pageInFlight = new Map();  // pageId → count

        const updateBtn = () => {
            if (btn) {
                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${done}/${total}`;
            }
        };
        updateBtn();

        // Shared queue — workers pull from front. Skip items whose page is at cap,
        // push them back if so (fair-ish scheduling with small retry).
        const queue = eligible.slice();

        const worker = async () => {
            while (queue.length > 0) {
                // Find next item whose page is under the per-page cap
                let idx = -1;
                for (let i = 0; i < queue.length; i++) {
                    const pid = queue[i].channelId;
                    if ((pageInFlight.get(pid) || 0) < PER_PAGE_CONCURRENCY) {
                        idx = i;
                        break;
                    }
                }
                if (idx === -1) {
                    // All remaining items are on pages at cap — yield briefly
                    await new Promise(r => setTimeout(r, 100));
                    continue;
                }

                const item = queue.splice(idx, 1)[0];
                const { orderId, order, invoiceData, psid, channelId } = item;
                pageInFlight.set(channelId, (pageInFlight.get(channelId) || 0) + 1);

                try {
                    const enrichedOrder = _buildEnrichedFromInvoice(invoiceData, orderId);
                    await performActualSend(
                        enrichedOrder,
                        channelId,
                        psid,
                        orderId,
                        order.Code || order.Name || orderId,
                        'main',
                        null
                    );
                    sent++;
                } catch (err) {
                    console.error(`[BULK-SEND-BILL] Error for order ${orderId}:`, err);
                    failed++;
                    errors.push(`${order.Code || orderId}: ${err.message}`);
                } finally {
                    pageInFlight.set(channelId, (pageInFlight.get(channelId) || 1) - 1);
                    done++;
                    updateBtn();
                }
            }
        };

        const workers = Array.from(
            { length: Math.min(GLOBAL_CONCURRENCY, total) },
            () => worker()
        );
        await Promise.all(workers);

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml || '<i class="fab fa-facebook-messenger"></i> Gửi Bill hàng loạt';
        }

        const resultMsg = `Gửi bill: ${sent} thành công${failed > 0 ? `, ${failed} lỗi` : ''}`;
        if (failed > 0) {
            console.warn('[BULK-SEND-BILL] Errors:', errors);
            window.notificationManager?.warning(resultMsg + ' (xem console để biết chi tiết)', 6000);
        } else {
            window.notificationManager?.success(resultMsg, 4000);
        }

        // Refresh action buttons (bill-sent orders should drop from sendable list)
        if (typeof window.updateActionButtons === 'function') window.updateActionButtons();
    }

    // =====================================================
    // DELETE INVOICE FROM STORE
    // =====================================================

    /**
     * Delete invoice from store and API
     * Called when clicking trash button in "Phiếu bán hàng" column
     * @param {string} saleOnlineId - The SaleOnline order ID
     */
    async function deleteInvoiceFromStore(saleOnlineId) {
        if (!saleOnlineId) return;

        // Get invoice data for display
        const invoiceData = InvoiceStatusStore.get(saleOnlineId);
        if (!invoiceData) {
            window.notificationManager?.warning('Không tìm thấy phiếu bán hàng để xóa', 3000);
            return;
        }

        const billNumber = invoiceData.Number || invoiceData.Reference || 'N/A';
        const customerName = invoiceData.PartnerDisplayName || invoiceData.ReceiverName || 'N/A';

        // Confirmation dialog
        const confirmed = confirm(
            `Xóa phiếu bán hàng?\n\n` +
                `Số phiếu: ${billNumber}\n` +
                `Khách hàng: ${customerName}\n\n` +
                `Dữ liệu sẽ bị xóa khỏi hệ thống.`
        );

        if (!confirmed) return;

        try {
            // Delete from store (API) + NJD mapping
            const deleted = await InvoiceStatusStore.delete(saleOnlineId);
            _deleteNjdFromDb(saleOnlineId);

            if (deleted) {
                window.notificationManager?.success(`Đã xóa phiếu ${billNumber}`, 3000);

                // Update UI - refresh the cell in main table
                const row = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
                if (row) {
                    const cell = row.querySelector('td[data-column="invoice-status"]');
                    if (cell) {
                        cell.innerHTML = '<span style="color: #9ca3af;">−</span>';
                    }
                }

                // Also refresh if in results modal
                const resultCell = document.querySelector(
                    `.invoice-status-cell[data-order-id="${saleOnlineId}"]`
                );
                if (resultCell) {
                    resultCell.innerHTML = '<span style="color: #9ca3af;">−</span>';
                }
            } else {
                window.notificationManager?.warning('Không tìm thấy phiếu để xóa', 3000);
            }
        } catch (error) {
            console.error('[INVOICE-STATUS] Error deleting invoice:', error);
            window.notificationManager?.error(`Lỗi xóa phiếu: ${error.message}`, 5000);
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
            container.innerHTML =
                '<p style="color: #6b7280; text-align: center; padding: 40px;">Không có đơn hàng thành công</p>';
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
                    ${resultsData.success
                        .map((order, index) => {
                            const stateCode = order.StateCode || 'None';
                            const isMergeCancel = order.IsMergeCancel === true;
                            const config = getStateCodeConfig(stateCode, isMergeCancel);
                            const style = config.style || '';
                            const saleOnlineId = order.SaleOnlineIds?.[0];
                            const billSent = saleOnlineId
                                ? InvoiceStatusStore.isBillSent(saleOnlineId)
                                : false;
                            const showState = order.ShowState || '';
                            const canSendBill =
                                showState === 'Đã xác nhận' || showState === 'Đã thanh toán';

                            // Show send button for confirmed/paid orders
                            let sendButtonHtml = '';
                            if (billSent) {
                                sendButtonHtml = `<span class="bill-sent-badge" style="color: #27ae60; font-size: 14px;" title="Đã gửi bill">✓</span>`;
                            } else if (canSendBill) {
                                sendButtonHtml = `<button type="button" class="btn-send-bill-messenger" data-index="${index}" data-order-id="${order.Id}" onclick="window.sendBillManually(${index})" title="Gửi bill qua Messenger" style="background: #0084ff; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z"/></svg>
                </button>`;
                            }
                            // Note: Non-confirmed/non-paid orders (Nháp, Huỷ bỏ, etc.) don't get a send button

                            return `
                        <tr data-order-id="${order.Id}" data-order-index="${index}">
                            <td>${index + 1}</td>
                            <td><input type="checkbox" class="success-order-checkbox" value="${index}" data-order-id="${order.Id}"></td>
                            <td>${order.Reference || 'N/A'}</td>
                            <td>${order.Number || ''}</td>
                            <td><span style="color: ${canSendBill ? '#10b981' : '#f59e0b'}; font-weight: 600;">${canSendBill ? '✓' : '⚠'} ${showState || 'Nhập'}</span></td>
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
                        })
                        .join('')}
                </tbody>
            </table>
        `;

        container.innerHTML = html;
    }

    /**
     * Send bill manually from results modal
     * @param {number} index - Index in success results
     * @param {boolean} skipPreview - If true, skip preview modal and send directly (for auto-send)
     */
    async function sendBillManually(index, skipPreview = false) {
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
            const originalOrderIndex = fastSaleOrdersData.findIndex(
                (o) =>
                    (o.SaleOnlineIds &&
                        order.SaleOnlineIds &&
                        JSON.stringify(o.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)) ||
                    (o.Reference && o.Reference === order.Reference)
            );
            const originalOrder =
                originalOrderIndex >= 0 ? fastSaleOrdersData[originalOrderIndex] : null;

            const displayedData = window.displayedData || [];
            let saleOnlineOrder = saleOnlineId
                ? window.OrderStore?.get(saleOnlineId) ||
                  displayedData.find(
                      (o) => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)
                  )
                : null;

            if (!saleOnlineOrder) {
                const saleOnlineName = order.SaleOnlineNames?.[0];
                if (saleOnlineName) {
                    saleOnlineOrder = displayedData.find((o) => o.Code === saleOnlineName);
                }
            }
            if (!saleOnlineOrder && order.PartnerId) {
                saleOnlineOrder = displayedData.find((o) => o.PartnerId === order.PartnerId);
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

            const carrierSelect =
                originalOrderIndex >= 0
                    ? document.getElementById(`fastSaleCarrier_${originalOrderIndex}`)
                    : null;
            const carrierNameFromDropdown =
                carrierSelect?.options[carrierSelect.selectedIndex]?.text || '';
            const carrierName =
                carrierNameFromDropdown ||
                originalOrder?.Carrier?.Name ||
                originalOrder?.CarrierName ||
                order.CarrierName ||
                '';
            const shippingFee =
                originalOrderIndex >= 0
                    ? parseFloat(
                          document.getElementById(`fastSaleShippingFee_${originalOrderIndex}`)
                              ?.value
                      ) || 0
                    : order.DeliveryPrice || 0;

            let orderLines = originalOrder?.OrderLines || order.OrderLines || [];
            if ((!orderLines || orderLines.length === 0) && saleOnlineOrder?.Details) {
                orderLines = saleOnlineOrder.Details.map((d) => ({
                    ProductName: d.ProductName || d.ProductNameGet || '',
                    ProductNameGet: d.ProductNameGet || d.ProductName || '',
                    ProductUOMQty: d.Quantity || d.ProductUOMQty || 1,
                    PriceUnit: d.Price || d.PriceUnit || 0,
                    Note: d.Note || '',
                }));
            }

            // Get wallet balance (PaymentAmount) for bill calculation
            const walletBalance = order.PaymentAmount || originalOrder?.PaymentAmount || 0;

            const enrichedOrder = {
                ...order,
                OrderLines: orderLines,
                CarrierName: carrierName,
                DeliveryPrice: shippingFee,
                PartnerDisplayName:
                    order.PartnerDisplayName || originalOrder?.PartnerDisplayName || '',
                UserName: order.UserName || originalOrder?.UserName || '', // Account tạo bill
                SessionIndex: saleOnlineOrder?.SessionIndex || originalOrder?.SessionIndex || '', // STT
            };

            // Check if preview is enabled (skip preview for auto-send)
            if (!skipPreview && isPreviewBeforeSendEnabled()) {
                // Show preview modal
                await showBillPreviewModal(
                    enrichedOrder,
                    channelId,
                    psid,
                    saleOnlineId,
                    orderNumber,
                    'results',
                    index,
                    false,
                    walletBalance
                );
            } else {
                // Direct send (skip confirm for auto-send)
                if (!skipPreview) {
                    const confirmed = confirm(`Xác nhận gửi bill cho đơn hàng ${orderNumber}?`);
                    if (!confirmed) return;
                }

                const button = document.querySelector(
                    `button.btn-send-bill-messenger[data-index="${index}"]`
                );
                if (button) {
                    button.disabled = true;
                    button.innerHTML =
                        '<span class="spinner-border spinner-border-sm" role="status"></span>';
                }

                try {
                    await performActualSend(
                        enrichedOrder,
                        channelId,
                        psid,
                        saleOnlineId,
                        orderNumber,
                        'results',
                        index
                    );
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
     * Batch send bills to multiple customers via Messenger
     * Uses same data flow as sendBillManually but processes selected orders sequentially
     */
    async function sendBillBatch() {
        const resultsData = window.fastSaleResultsData;
        if (!resultsData || !resultsData.success || resultsData.success.length === 0) {
            window.notificationManager?.warning('Không có đơn hàng thành công');
            return;
        }

        // Get selected indexes (or all if none selected)
        let selectedIndexes = Array.from(
            document.querySelectorAll('.success-order-checkbox:checked')
        ).map((cb) => parseInt(cb.value));

        if (selectedIndexes.length === 0) {
            selectedIndexes = resultsData.success.map((_, i) => i);
        }

        if (selectedIndexes.length === 0) return;

        const confirmMsg = `Gửi bill qua Messenger cho ${selectedIndexes.length} đơn hàng?`;
        if (!confirm(confirmMsg)) return;

        const btn = document.getElementById('sendBillBatchBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...'; }

        let sent = 0;
        let failed = 0;
        let skipped = 0;

        for (const index of selectedIndexes) {
            const order = resultsData.success[index];
            if (!order) { skipped++; continue; }

            // Update button progress
            if (btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${sent + failed + skipped + 1}/${selectedIndexes.length}`;

            try {
                await sendBillManually(index, true); // skipPreview = true for batch
                sent++;
            } catch (err) {
                console.error(`[BILL-BATCH] Error sending bill for order ${order.Number}:`, err);
                failed++;
            }

            // Small delay between sends to avoid rate limiting
            if (index !== selectedIndexes[selectedIndexes.length - 1]) {
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fab fa-facebook-messenger"></i> Gửi Bill hàng loạt';
        }

        const msg = `Gửi bill: ${sent} thành công${failed > 0 ? `, ${failed} lỗi` : ''}${skipped > 0 ? `, ${skipped} bỏ qua` : ''}`;
        if (failed > 0) {
            window.notificationManager?.warning(msg);
        } else {
            window.notificationManager?.show(msg, 'success');
        }
    }

    /**
     * Override printSuccessOrders to disable auto-send
     */
    async function printSuccessOrdersWithoutAutoSend(type) {
        const selectedIndexes = Array.from(
            document.querySelectorAll('.success-order-checkbox:checked')
        ).map((cb) => parseInt(cb.value));

        if (selectedIndexes.length === 0) {
            window.notificationManager?.warning('Vui lòng chọn ít nhất 1 đơn hàng để in');
            return;
        }

        const resultsData = window.fastSaleResultsData;
        const selectedOrders = selectedIndexes.map((i) => resultsData.success[i]);
        const orderIds = selectedOrders.map((o) => o.Id).filter((id) => id);

        if (orderIds.length === 0) {
            window.notificationManager?.error('Không tìm thấy ID đơn hàng');
            return;
        }

        if (type === 'invoice') {
            const fastSaleOrdersData = window.fastSaleOrdersData || [];
            const displayedData = window.displayedData || [];
            const enrichedOrders = [];

            for (const order of selectedOrders) {
                const originalOrderIndex = fastSaleOrdersData.findIndex(
                    (o) =>
                        (o.SaleOnlineIds &&
                            order.SaleOnlineIds &&
                            JSON.stringify(o.SaleOnlineIds) ===
                                JSON.stringify(order.SaleOnlineIds)) ||
                        (o.Reference && o.Reference === order.Reference)
                );
                const originalOrder =
                    originalOrderIndex >= 0 ? fastSaleOrdersData[originalOrderIndex] : null;

                const saleOnlineId = order.SaleOnlineIds?.[0];
                const saleOnlineOrderForData = saleOnlineId
                    ? window.OrderStore?.get(saleOnlineId) ||
                      displayedData.find(
                          (o) => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)
                      )
                    : null;

                const carrierSelect =
                    originalOrderIndex >= 0
                        ? document.getElementById(`fastSaleCarrier_${originalOrderIndex}`)
                        : null;
                const carrierName =
                    carrierSelect?.options[carrierSelect.selectedIndex]?.text ||
                    originalOrder?.Carrier?.Name ||
                    originalOrder?.CarrierName ||
                    order.CarrierName ||
                    '';
                const shippingFee =
                    originalOrderIndex >= 0
                        ? parseFloat(
                              document.getElementById(`fastSaleShippingFee_${originalOrderIndex}`)
                                  ?.value
                          ) || 0
                        : order.DeliveryPrice || 0;

                let orderLines = originalOrder?.OrderLines || order.OrderLines || [];
                if ((!orderLines || orderLines.length === 0) && saleOnlineOrderForData?.Details) {
                    orderLines = saleOnlineOrderForData.Details.map((d) => ({
                        ProductName: d.ProductName || d.ProductNameGet || '',
                        ProductUOMQty: d.Quantity || d.ProductUOMQty || 1,
                        PriceUnit: d.Price || d.PriceUnit || 0,
                    }));
                }

                enrichedOrders.push({
                    ...order,
                    OrderLines: orderLines,
                    CarrierName: carrierName,
                    DeliveryPrice: shippingFee,
                    PartnerDisplayName:
                        order.PartnerDisplayName || originalOrder?.PartnerDisplayName || '',
                });
            }

            if (enrichedOrders.length > 0 && typeof window.openCombinedPrintPopup === 'function') {
                window.openCombinedPrintPopup(enrichedOrders);
            }

            window.selectedOrderIds?.clear();
            document
                .querySelectorAll('#ordersTable input[type="checkbox"]:checked')
                .forEach((cb) => (cb.checked = false));
            const headerCheckbox = document.querySelector(
                '#ordersTable thead input[type="checkbox"]'
            );
            if (headerCheckbox) headerCheckbox.checked = false;
            if (typeof window.updateActionButtons === 'function') window.updateActionButtons();

            window.notificationManager?.info(
                `Đã mở in ${enrichedOrders.length} bill. Bấm nút Messenger để gửi.`,
                4000
            );
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

        try {
            const headers = await window.tokenManager?.getAuthHeader();
            if (!headers) {
                console.warn('[INVOICE-STATUS] No auth headers available');
                return;
            }

            // Get order data
            const displayedData = window.displayedData || [];
            const allData = window.allData || [];
            const order =
                window.OrderStore?.get(saleOnlineId) ||
                displayedData.find(
                    (o) => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)
                ) ||
                allData.find((o) => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId));

            if (!order) {
                console.warn(`[INVOICE-STATUS] Order ${saleOnlineId} not found`);
                return;
            }

            // 1. Update status to "Đơn hàng" if currently "Nháp"
            if (order.Status === 'Nháp' || order.Status === 'Draft' || order.StatusText === 'Nháp') {
                const statusUrl = `${window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev'}/api/odata/SaleOnline_Order/OdataService.UpdateStatusSaleOnline?Id=${saleOnlineId}&Status=${encodeURIComponent('Đơn hàng')}`;

                const statusResponse = await fetch(statusUrl, {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'content-type': 'application/json;charset=utf-8',
                        accept: '*/*',
                    },
                    body: null,
                });

                if (statusResponse.ok) {
                    // Update local data using OrderStore.update()
                    if (window.OrderStore) {
                        window.OrderStore.update(saleOnlineId, {
                            Status: 'order',
                            StatusText: 'Đơn hàng',
                        });
                    }
                    // Also update the order reference
                    order.Status = 'order';
                    order.StatusText = 'Đơn hàng';

                    // Update UI
                    const statusBadge = document.querySelector(
                        `.status-badge[data-order-id="${saleOnlineId}"]`
                    );
                    if (statusBadge) {
                        statusBadge.className = 'status-badge status-order';
                        statusBadge.style.backgroundColor = '#5cb85c';
                        statusBadge.innerText = 'Đơn hàng';
                    }
                } else {
                    console.warn(
                        `[INVOICE-STATUS] Failed to update status: ${statusResponse.status}`
                    );
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

        const allOrders = [...(apiResult.OrdersSucessed || []), ...(apiResult.OrdersError || [])];

        // Inject entries into FulfillmentData immediately
        const fd = window.parent?.FulfillmentData || window.FulfillmentData;
        if (fd && typeof fd.injectEntries === 'function') {
            const entries = [];
            allOrders.forEach((order) => {
                if (!order.SaleOnlineIds) return;
                order.SaleOnlineIds.forEach((soId) => {
                    const data = InvoiceStatusStore.get(String(soId));
                    if (data) {
                        entries.push({ saleOnlineId: String(soId), data });
                    }
                });
            });
            if (entries.length > 0) {
                fd.injectEntries(entries);
            }
        }

        allOrders.forEach((order) => {
            if (!order.SaleOnlineIds || order.SaleOnlineIds.length === 0) return;

            order.SaleOnlineIds.forEach((saleOnlineId) => {
                // Find the row in main table
                const row = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
                if (!row) return;

                // Find the invoice-status cell
                const cell = row.querySelector('td[data-column="invoice-status"]');
                if (!cell) return;

                // Get order data from displayedData for full info
                const displayedData = window.displayedData || [];
                const orderData =
                    window.OrderStore?.get(saleOnlineId) ||
                    displayedData.find(
                        (o) => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)
                    );

                if (orderData) {
                    // Re-render the cell content
                    cell.innerHTML = renderInvoiceStatusCell(orderData);
                }

                // Also update the fulfillment cell ("Ra đơn" column)
                const fulfillmentCell = row.querySelector('td[data-column="fulfillment"]');
                if (fulfillmentCell && typeof renderFulfillmentCell === 'function') {
                    fulfillmentCell.innerHTML = renderFulfillmentCell(
                        orderData || { Id: saleOnlineId }
                    );
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
        const headerCheckbox = document.querySelector(
            '#ordersTable thead input[type="checkbox"], .employee-section thead input[type="checkbox"]'
        );
        if (headerCheckbox) {
            headerCheckbox.checked = false;
        }

        // Update action buttons visibility
        if (typeof window.updateActionButtons === 'function') {
            window.updateActionButtons();
        }

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

            // Delayed retry: re-update cells after 2s to handle race conditions
            // (e.g., late data clearing)
            setTimeout(() => {
                updateMainTableInvoiceCells(result);
            }, 2000);
        };

        return true;
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    let _initStarted = false;

    async function init() {
        if (_initStarted) return;
        _initStarted = true;

        // Initialize store (async - loads from API)
        await InvoiceStatusStore.init();

        // Load delivery group assignments from PostgreSQL
        // (mapping invoice.Number → tomato/nap/city để hiển thị badge khi đối soát)
        _loadDeliveryGroupsForCurrentInvoices();

        // Save original function
        if (
            typeof window.printSuccessOrders === 'function' &&
            !window._originalPrintSuccessOrders
        ) {
            window._originalPrintSuccessOrders = window.printSuccessOrders;
        }

        // Override functions
        window.renderSuccessOrdersTable = renderSuccessOrdersTableWithInvoiceStatus;
        window.printSuccessOrders = printSuccessOrdersWithoutAutoSend;

        // Expose functions globally
        window.renderInvoiceStatusCell = renderInvoiceStatusCell;
        window.sendBillFromMainTable = sendBillFromMainTable;
        window.sendBillManually = sendBillManually;
        window.sendBillBatch = sendBillBatch;
        window.bulkSendSelectedBills = bulkSendSelectedBills;

        /**
         * Force create PBH for an order — bypass all duplicate guards
         * Sets a global flag that tab1-sale.js and tab1-fast-sale.js check
         */
        window._forceCreatePBH = function(orderId) {
            // Set bypass flag — checked by confirmAndPrintSale() and showFastSaleModal()
            window._forceCreatePBHBypass = true;

            // Select this order in the table
            const checkbox = document.querySelector(`tr[data-order-id="${orderId}"] input[type="checkbox"]`);
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Open sale modal
            if (typeof window.openSaleButtonModal === 'function') {
                window.openSaleButtonModal();
            } else {
                window.notificationManager?.error('Chức năng tạo PBH chưa sẵn sàng');
            }
        };
        window.updateMainTableInvoiceCells = updateMainTableInvoiceCells;
        window.InvoiceStatusStore = InvoiceStatusStore;
        // Shortcut gọi từ console: refresh cột PBH bằng data mới nhất từ TPOS (browser-side batch)
        window.refreshAllPBHFromTPOS = (options) => InvoiceStatusStore.refreshAllFromTPOS(options);
        // Shortcut: trigger Render server refresh PBH từ TPOS (server-side — nhanh hơn, không cần browser token)
        // Server sẽ fetch TPOS OData → UPDATE invoice_status table → client reload() để sync
        window.refreshPBHFromServer = async (options = {}) => {
            const { saleOnlineIds, limit, sinceMs, chunkSize } = options;
            window.notificationManager?.info('🔄 Đang trigger Render refresh PBH từ TPOS...');
            try {
                const resp = await fetch(`${API_BASE}/refresh-from-tpos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ saleOnlineIds, limit, sinceMs, chunkSize }),
                });
                if (!resp.ok) {
                    const text = await resp.text();
                    throw new Error(`${resp.status}: ${text}`);
                }
                const result = await resp.json();
                console.log('[PBH-SERVER-REFRESH]', result);
                window.notificationManager?.success(
                    `✅ Server refresh xong: ${result.updated}/${result.total} entries updated`
                    + ` (fetched ${result.fetched}, missing ${result.missing}, errors ${result.errors})`
                    + ` — elapsed ${result.elapsedMs}ms`
                );
                // Reload InvoiceStatusStore từ PostgreSQL để sync với data vừa update
                await InvoiceStatusStore.reload();
                return result;
            } catch (e) {
                console.error('[PBH-SERVER-REFRESH] Error:', e);
                window.notificationManager?.error(`❌ Server refresh thất bại: ${e.message}`);
                throw e;
            }
        };
        // Assign 'get' method explicitly (cannot use shorthand in object literal due to getter keyword conflict)
        InvoiceStatusStore.get = function (saleOnlineId) {
            if (!saleOnlineId) return null;
            return InvoiceStatusStore.getLatest(saleOnlineId);
        };
        window.extractSaleOnlineId = extractSaleOnlineId; // For FulfillmentData backward compat
        window.getStateCodeConfig = getStateCodeConfig;
        window.getShowStateConfig = getShowStateConfig;
        // WS-driven invoice fetch + raw modal
        window.fetchAndUpdateInvoiceForCode = fetchAndUpdateInvoiceForCode;
        window.showInvoiceRawModal = showInvoiceRawModal;
        // Preview modal functions
        window.showBillPreviewModal = showBillPreviewModal;
        window.closeBillPreviewSendModal = closeBillPreviewSendModal;
        window.confirmSendBillFromPreview = confirmSendBillFromPreview;
        window.printBillFromPreview = printBillFromPreview;
        window.printAndSendBillFromPreview = printAndSendBillFromPreview;
        window.bulkPrintSelectedBills = bulkPrintSelectedBills;
        // Delete invoice function
        window.deleteInvoiceFromStore = deleteInvoiceFromStore;
        // NJD mapping helpers (for external modules like workflow)
        window._deleteNjdFromDb = _deleteNjdFromDb;
        window._saveNjdToDb = _saveNjdToDb;
        // Fulfillment (Ra đơn) functions
        window.renderFulfillmentCell = renderFulfillmentCell;
        window.openFulfillmentModal = openFulfillmentModal;
        window.closeFulfillmentModal = closeFulfillmentModal;

        // Hook showFastSaleResultsModal
        if (!hookShowFastSaleResultsModal()) {
            // Retry after delay
            setTimeout(hookShowFastSaleResultsModal, 500);
        }

        // Listen for FulfillmentData changes to update fulfillment cells
        const fd = window.parent?.FulfillmentData || window.FulfillmentData;
        if (fd) {
            fd.onChange(() => {
                // Update all fulfillment cells in the table
                document.querySelectorAll('td[data-column="fulfillment"]').forEach((cell) => {
                    const row = cell.closest('tr');
                    // data-order-id is on the <tr> itself, not a child element
                    const orderId = row?.getAttribute('data-order-id');
                    if (orderId) {
                        const order = { Id: orderId, Code: '' };
                        cell.innerHTML = renderFulfillmentCell(order);
                    }
                });
            });
        }

        // No flush needed - API calls are immediate (no debounce)

    }

    // =====================================================
    // FULFILLMENT CELL & MODAL (Ra đơn column)
    // Uses parent FulfillmentData module for shared data
    // =====================================================

    const FULFILLMENT_COLORS = {
        da_ra_don: { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
        cho_ra_don: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
        huy_cho_ra_don: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
    };

    /**
     * Render fulfillment status cell for orders table
     * @param {Object} order - SaleOnlineOrder object
     * @returns {string} HTML string
     */
    function renderFulfillmentCell(order) {
        const fd = window.parent?.FulfillmentData || window.FulfillmentData;
        if (!fd || !fd.isReady()) {
            return '<span style="color: #9ca3af; font-size: 11px;">...</span>';
        }

        const orderId = order.Id || order.id;
        if (!orderId) return '<span style="color: #9ca3af;">−</span>';

        const { status, label, createCount, cancelCount } = fd.getStatus(orderId);
        const colors = FULFILLMENT_COLORS[status] || FULFILLMENT_COLORS.cho_ra_don;

        const countInfo = createCount > 0 ? ` (${createCount}/${cancelCount})` : '';

        return `<span class="fulfillment-badge"
            style="background: ${colors.bg}; color: ${colors.color}; border: 1px solid ${colors.border};
                   font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer;
                   font-weight: 500; white-space: nowrap; display: inline-block;"
            onclick="window.openFulfillmentModal('${orderId}', '${(order.Code || '').replace(/'/g, "\\'")}'); event.stopPropagation();"
            title="Click xem lịch sử ra đơn">${label}${countInfo}</span>`;
    }

    /**
     * Open fulfillment history modal
     */
    function openFulfillmentModal(orderId, orderCode) {
        const fd = window.parent?.FulfillmentData || window.FulfillmentData;
        if (!fd) return;

        const { status, label, createCount, cancelCount } = fd.getStatus(orderId);
        const timeline = fd.getTimeline(orderId);
        const colors = FULFILLMENT_COLORS[status] || FULFILLMENT_COLORS.cho_ra_don;

        let html = `
            <div style="margin-bottom: 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <span style="background: ${colors.bg}; color: ${colors.color}; border: 1px solid ${colors.border};
                    padding: 4px 12px; border-radius: 6px; font-weight: 600; font-size: 14px;">${label}</span>
                <span style="color: #6b7280; font-size: 13px;">Tạo: ${createCount} lần | Hủy: ${cancelCount} lần</span>
            </div>
        `;

        if (timeline.length === 0) {
            html +=
                '<div style="text-align: center; color: #9ca3af; padding: 32px;">Chưa có lịch sử ra đơn</div>';
        } else {
            html += '<div class="fulfillment-timeline">';
            timeline.forEach((event, index) => {
                const isCreate = event.type === 'create';
                const eventColor = isCreate ? '#059669' : '#dc2626';
                const eventBg = isCreate ? '#ecfdf5' : '#fef2f2';
                const eventIcon = isCreate ? '✓' : '✕';
                const timeStr = event.timestamp
                    ? new Date(event.timestamp).toLocaleString('vi-VN')
                    : 'N/A';

                html += `
                    <div style="border-left: 3px solid ${eventColor}; background: ${eventBg};
                        padding: 12px 16px; margin-bottom: 8px; border-radius: 0 8px 8px 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="color: ${eventColor}; font-weight: 600; font-size: 13px;">
                                ${eventIcon} ${event.label}
                            </span>
                            <span style="color: #6b7280; font-size: 11px;">${timeStr}</span>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px; font-size: 12px;">
                            ${event.userName ? `<div><strong>Người thực hiện:</strong> ${event.userName}</div>` : ''}
                            ${event.number ? `<div><strong>Số phiếu:</strong> ${event.number}</div>` : ''}
                            ${event.showState ? `<div><strong>Trạng thái phiếu:</strong> ${event.showState}</div>` : ''}
                            ${event.carrierName ? `<div><strong>Đơn vị VC:</strong> ${event.carrierName}</div>` : ''}
                            ${event.amountTotal ? `<div><strong>Tổng tiền:</strong> ${Number(event.amountTotal).toLocaleString('vi-VN')}đ</div>` : ''}
                            ${event.paymentAmount > 0 ? `<div><strong>Công nợ (trả trước):</strong> <span style="color: #2563eb;">${Number(event.paymentAmount).toLocaleString('vi-VN')}đ</span></div>` : ''}
                            ${event.discount > 0 ? `<div><strong>Giảm giá:</strong> <span style="color: #dc2626;">-${Number(event.discount).toLocaleString('vi-VN')}đ</span></div>` : ''}
                            ${event.deliveryPrice === 0 || event.deliveryPrice === '0' ? `<div><strong>Vận chuyển:</strong> <span style="background: #dbeafe; color: #2563eb; padding: 1px 6px; border-radius: 3px; font-size: 10px;">FREESHIP</span></div>` : event.deliveryPrice ? `<div><strong>Phí ship:</strong> ${Number(event.deliveryPrice).toLocaleString('vi-VN')}đ</div>` : ''}
                            ${event.cashOnDelivery ? `<div><strong>COD:</strong> ${Number(event.cashOnDelivery).toLocaleString('vi-VN')}đ</div>` : ''}
                        </div>
                        ${event.comment ? `<div style="margin-top: 6px; font-size: 12px; color: #4b5563;"><strong>Ghi chú:</strong> ${event.comment}</div>` : ''}
                        ${event.cancelReason ? `<div style="margin-top: 6px; font-size: 12px; color: #dc2626;"><strong>Lý do hủy:</strong> ${event.cancelReason}</div>` : ''}
                    </div>
                `;
            });
            html += '</div>';
        }

        // Create modal if not exists
        let modal = document.getElementById('fulfillmentHistoryModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'fulfillmentHistoryModal';
            modal.innerHTML = `
                <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000;
                    display: flex; align-items: center; justify-content: center; padding: 16px;"
                    onclick="if(event.target===this) closeFulfillmentModal();">
                    <div style="background: white; border-radius: 12px; width: 95%; max-width: 650px;
                        max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                        <div style="display: flex; justify-content: space-between; align-items: center;
                            padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                            <h3 id="fulfillmentModalTitle" style="margin: 0; font-size: 16px; color: #111827;"></h3>
                            <button onclick="closeFulfillmentModal()" style="background: none; border: none;
                                font-size: 24px; cursor: pointer; color: #6b7280; padding: 0 4px;">&times;</button>
                        </div>
                        <div id="fulfillmentModalBody" style="padding: 20px; overflow-y: auto;"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        modal.style.display = 'block';
        document.getElementById('fulfillmentModalTitle').textContent =
            `Lịch sử ra đơn - ${orderCode || orderId}`;
        document.getElementById('fulfillmentModalBody').innerHTML = html;
    }

    function closeFulfillmentModal() {
        const modal = document.getElementById('fulfillmentHistoryModal');
        if (modal) modal.style.display = 'none';
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init());
    } else {
        init();
    }
})();
