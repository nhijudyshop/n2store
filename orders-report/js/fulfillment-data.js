/**
 * Fulfillment Data Module (Shared)
 * Loaded in main.html, accessible from all iframes via window.parent.FulfillmentData
 *
 * Loads invoice_status_v2 and invoice_status_delete_v2 from Firestore
 * to track order fulfillment history (ra đơn / hủy đơn).
 *
 * v3: Supports compound keys (SaleOnlineId_timestamp) for multi-entry history.
 *     invoiceStatusMap is now Map<SaleOnlineId, Array<entry>> (grouped by SaleOnlineId).
 */

(function () {
    'use strict';

    const INVOICE_COLLECTION = 'invoice_status_v2';
    const DELETE_COLLECTION = 'invoice_status_delete_v2';

    // Maps: SaleOnlineId -> Array of invoice entries / cancel entries
    let invoiceStatusMap = new Map(); // SaleOnlineId -> Array of create entries
    let invoiceDeleteMap = new Map(); // SaleOnlineId -> Array of cancel entries
    let _initialized = false;
    let _unsubscribeStatus = null;
    let _unsubscribeDelete = null;
    let _onChangeCallbacks = [];

    /**
     * Extract SaleOnlineId from a compound key or legacy flat key.
     * Compound key: "SaleOnlineId_1710000000000" (13-digit timestamp suffix)
     * Legacy flat key: "SaleOnlineId" (no timestamp suffix)
     */
    function _extractSaleOnlineId(key) {
        // Use shared function if available (from tab1-fast-sale-invoice-status.js)
        if (typeof window.extractSaleOnlineId === 'function') {
            return window.extractSaleOnlineId(key);
        }
        // Fallback inline implementation
        if (!key) return '';
        const str = String(key);
        const lastIdx = str.lastIndexOf('_');
        if (lastIdx > 0) {
            const suffix = str.substring(lastIdx + 1);
            if (/^\d{13}$/.test(suffix)) {
                return str.substring(0, lastIdx);
            }
        }
        return str;
    }

    // =====================================================
    // AUTH HELPERS
    // =====================================================

    function _getAuthInfo() {
        try {
            const authData =
                window.authManager?.getAuthData?.() || window.authManager?.getAuthState?.();
            const userType = authData?.userType || localStorage.getItem('userType') || '';
            const username = authData?.username || userType.split('-')[0] || 'default';
            const isAdmin = userType === 'admin-admin@@' || userType.split('-')[0] === 'admin';
            return { username, isAdmin };
        } catch (e) {
            console.error('[FULFILLMENT] Error getting auth info:', e);
            return { username: 'default', isAdmin: false };
        }
    }

    // =====================================================
    // LOAD FROM FIRESTORE
    // =====================================================

    async function _loadInvoiceStatus() {
        const db = firebase.firestore();

        invoiceStatusMap.clear();

        let totalEntries = 0;

        // Load ALL documents from all users
        const snapshot = await db.collection(INVOICE_COLLECTION).get();
        snapshot.forEach(doc => {
            const firestoreData = doc.data();
            if (firestoreData.data) {
                const entries = Array.isArray(firestoreData.data)
                    ? firestoreData.data
                    : Object.entries(firestoreData.data);
                entries.forEach(([key, value]) => {
                    // Group entries by SaleOnlineId (supports compound keys + legacy flat keys)
                    const soId = String(value.SaleOnlineId || _extractSaleOnlineId(key));
                    if (!soId) return;
                    if (!invoiceStatusMap.has(soId)) {
                        invoiceStatusMap.set(soId, []);
                    }
                    invoiceStatusMap.get(soId).push(value);
                    totalEntries++;
                });
            }
        });

        console.log(`[FULFILLMENT] Loaded ${totalEntries} invoice status entries for ${invoiceStatusMap.size} orders`);
    }
        });

        console.log(`[FULFILLMENT] Loaded ${invoiceStatusMap.size} invoice status entries`);
    }

    async function _loadInvoiceDeletes() {
        const db = firebase.firestore();

        invoiceDeleteMap.clear();

        const processEntries = (data) => {
            if (!data) return;
            const entries = Array.isArray(data) ? data : Object.entries(data);
            entries.forEach(([key, value]) => {
                const saleOnlineId = String(value.SaleOnlineId || '');
                if (!saleOnlineId) return;
                if (!invoiceDeleteMap.has(saleOnlineId)) {
                    invoiceDeleteMap.set(saleOnlineId, []);
                }
                invoiceDeleteMap.get(saleOnlineId).push(value);
            });
        };

        // Load ALL documents from all users
        const snapshot = await db.collection(DELETE_COLLECTION).get();
        snapshot.forEach((doc) => {
            const firestoreData = doc.data();
            processEntries(firestoreData.data);
        });

        console.log(`[FULFILLMENT] Loaded delete entries for ${invoiceDeleteMap.size} orders`);
    }

    // =====================================================
    // REAL-TIME LISTENERS
    // =====================================================

    function _setupListeners() {
        const db = firebase.firestore();

        // Listener for invoice_status_v2 - ALL users
        _unsubscribeStatus = db.collection(INVOICE_COLLECTION).onSnapshot(snapshot => {
            if (!_initialized) return;
            invoiceStatusMap.clear();
            snapshot.forEach(doc => {
                const firestoreData = doc.data();
                if (firestoreData.data) {
                    const entries = Array.isArray(firestoreData.data)
                        ? firestoreData.data
                        : Object.entries(firestoreData.data);
                    entries.forEach(([key, value]) => {
                        // Group entries by SaleOnlineId (supports compound keys + legacy flat keys)
                        const soId = String(value.SaleOnlineId || _extractSaleOnlineId(key));
                        if (!soId) return;
                        if (!invoiceStatusMap.has(soId)) {
                            invoiceStatusMap.set(soId, []);
                        }
                        invoiceStatusMap.get(soId).push(value);
                    });
                }
            });
            _notifyChange();
        });
                }
            });
            _notifyChange();
        });

        // Listener for invoice_status_delete_v2 - ALL users
        _unsubscribeDelete = db.collection(DELETE_COLLECTION).onSnapshot((snapshot) => {
            if (!_initialized) return;
            invoiceDeleteMap.clear();
            snapshot.forEach((doc) => {
                const firestoreData = doc.data();
                if (firestoreData.data) {
                    const entries = Object.entries(firestoreData.data);
                    entries.forEach(([key, value]) => {
                        const saleOnlineId = String(value.SaleOnlineId || '');
                        if (!saleOnlineId) return;
                        if (!invoiceDeleteMap.has(saleOnlineId)) {
                            invoiceDeleteMap.set(saleOnlineId, []);
                        }
                        invoiceDeleteMap.get(saleOnlineId).push(value);
                    });
                }
            });
            _notifyChange();
        });
    }

    function _notifyChange() {
        _onChangeCallbacks.forEach((cb) => {
            try {
                cb();
            } catch (e) {
                console.error('[FULFILLMENT] onChange callback error:', e);
            }
        });
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    const FulfillmentData = {
        /**
         * Initialize: load data from Firestore and setup real-time listeners
         */
        async init() {
            if (_initialized) return;
            try {
                if (typeof firebase === 'undefined' || !firebase.firestore) {
                    console.warn('[FULFILLMENT] Firebase not available, skipping init');
                    return;
                }
                await Promise.all([_loadInvoiceStatus(), _loadInvoiceDeletes()]);
                _initialized = true;
                _setupListeners();
                console.log('[FULFILLMENT] Initialized successfully');
                _notifyChange();
            } catch (e) {
                console.error('[FULFILLMENT] Error initializing:', e);
                _initialized = true;
            }
        },

        /** @returns {boolean} Whether module has been initialized */
        isReady() {
            return _initialized;
        },

        /**
         * Get fulfillment status for an order
         * v3: createCount = number of active entries + number of cancel entries
         *     (each cancel entry originally had a corresponding creation)
         * @param {string|number} orderId - SaleOnlineId
         * @returns {{ status: string, label: string, createCount: number, cancelCount: number, activeInvoice: object|null, activeEntries: Array, cancelHistory: Array }}
         */
        getStatus(orderId) {
            const id = String(orderId);
            const cancelEntries = invoiceDeleteMap.get(id) || [];
            const cancelCount = cancelEntries.length;
            const activeEntries = invoiceStatusMap.get(id) || []; // Array of create entries
            const activeCount = activeEntries.length;
            const createCount = activeCount + cancelCount;

            // Get latest active invoice (for backward compat - re-print, send bill, etc.)
            let activeInvoice = null;
            if (activeEntries.length > 0) {
                activeInvoice = activeEntries.reduce((latest, entry) => {
                    return (!latest || (entry.timestamp || 0) > (latest.timestamp || 0)) ? entry : latest;
                }, null);
            }

            let status, label;
            if (createCount === 0) {
                status = 'cho_ra_don';
                label = 'Chờ ra đơn';
            } else if (activeCount > 0) {
                status = 'da_ra_don';
                label = 'Đã ra đơn';
            } else {
                status = 'huy_cho_ra_don';
                label = 'Hủy chờ ra đơn';
            }

            return {
                status,
                label,
                createCount,
                cancelCount,
                activeInvoice,
                activeEntries,
                cancelHistory: cancelEntries
            };
        },

        /**
         * Get fulfillment stats for a list of orders
         * @param {Array} orders - Array of order objects with Id field
         * @returns {{ daRaDon: number, choRaDon: number, huyChoRaDon: number }}
         */
        getStats(orders) {
            const stats = { daRaDon: 0, choRaDon: 0, huyChoRaDon: 0 };
            if (!orders || !Array.isArray(orders)) return stats;

            orders.forEach((order) => {
                const orderId = order.Id || order.id;
                if (!orderId) return;
                const { status } = this.getStatus(orderId);
                if (status === 'da_ra_don') stats.daRaDon++;
                else if (status === 'cho_ra_don') stats.choRaDon++;
                else stats.huyChoRaDon++;
            });

            return stats;
        },

        /**
         * Register a callback for data changes
         * @param {Function} callback
         */
        onChange(callback) {
            if (typeof callback === 'function') {
                _onChangeCallbacks.push(callback);
            }
        },

        /**
         * Remove a change callback
         * @param {Function} callback
         */
        offChange(callback) {
            _onChangeCallbacks = _onChangeCallbacks.filter((cb) => cb !== callback);
        },

        /**
         * Inject invoice entries directly (bypass Firestore delay)
         * Called by InvoiceStatusStore after batch order creation
         * v3: Pushes into arrays grouped by SaleOnlineId (avoids overwriting previous entries)
         * @param {Array<{saleOnlineId: string, data: Object}>} entries
         */
        injectEntries(entries) {
            if (!entries || !Array.isArray(entries) || entries.length === 0) return;
            let changed = false;
            entries.forEach(({ saleOnlineId, data }) => {
                if (!saleOnlineId) return;
                const id = String(saleOnlineId);
                if (!invoiceStatusMap.has(id)) {
                    invoiceStatusMap.set(id, []);
                }
                const arr = invoiceStatusMap.get(id);
                // Check if this exact entry already exists (by TPOS Id + timestamp) to avoid duplicates
                const isDuplicate = arr.some(e =>
                    e.Id === data.Id && e.timestamp === data.timestamp
                );
                if (!isDuplicate) {
                    // Check if this is an update to an existing entry (same TPOS Id, newer timestamp)
                    const existingIdx = arr.findIndex(e => e.Id === data.Id);
                    if (existingIdx >= 0 && data.timestamp > (arr[existingIdx].timestamp || 0)) {
                        // Update in-place (e.g., form value enrichment after initial store)
                        arr[existingIdx] = data;
                    } else if (existingIdx < 0) {
                        // New entry (different TPOS Id = new order creation)
                        arr.push(data);
                    }
                    changed = true;
                }
            });
            if (changed) {
                console.log(`[FULFILLMENT] Injected ${entries.length} entries directly`);
                _notifyChange();
            }
        },

        /**
         * Build timeline events for an order (sorted by time descending)
         * v3: Shows ALL active entries (not just the latest), plus cancel entries
         * @param {string|number} orderId
         * @returns {Array} Array of event objects
         */
        getTimeline(orderId) {
            const { activeEntries, cancelHistory } = this.getStatus(orderId);
            const events = [];

            // Helper to build a "create" event from an invoice entry
            const buildCreateEvent = (entry) => ({
                type: 'create',
                label: 'Tạo phiếu bán hàng',
                timestamp: entry.timestamp || (entry.DateInvoice ? new Date(entry.DateInvoice).getTime() : 0),
                userName: entry.UserName || '',
                number: entry.Number || '',
                showState: entry.ShowState || '',
                paymentAmount: entry.PaymentAmount || 0,
                discount: entry.Discount || 0,
                deliveryPrice: entry.DeliveryPrice,
                comment: entry.Comment || entry.DeliveryNote || '',
                amountTotal: entry.AmountTotal || 0,
                cashOnDelivery: entry.CashOnDelivery || 0,
                carrierName: entry.CarrierName || '',
                liveCampaignId: entry.LiveCampaignId || '',
                orderLines: entry.OrderLines || [],
                raw: entry
            });

            // Add ALL active entries as "create" events (v3: supports multiple creations)
            if (activeEntries && activeEntries.length > 0) {
                activeEntries.forEach(entry => {
                    events.push(buildCreateEvent(entry));
                });
            }

            // Add cancel entries - each cancel also had a corresponding create event
            cancelHistory.forEach(entry => {
                // Add the original create event (from when the invoice was first created before being cancelled)
                const createTimestamp = entry.DateInvoice ? new Date(entry.DateInvoice).getTime()
                    : (entry.timestamp || 0);
                if (createTimestamp) {
                    events.push(buildCreateEvent(entry));
                }

                // Add the cancel event
                events.push({
                    type: 'cancel',
                    label: 'Hủy đơn',
                    timestamp: entry.deletedAt || 0,
                    userName: entry.deletedByDisplayName || entry.deletedBy || '',
                    number: entry.Number || '',
                    showState: entry.ShowState || '',
                    cancelReason: entry.cancelReason || '',
                    paymentAmount: entry.PaymentAmount || 0,
                    discount: entry.Discount || 0,
                    deliveryPrice: entry.DeliveryPrice,
                    comment: entry.Comment || entry.DeliveryNote || '',
                    amountTotal: entry.AmountTotal || 0,
                    cashOnDelivery: entry.CashOnDelivery || 0,
                    carrierName: entry.CarrierName || '',
                    liveCampaignId: entry.LiveCampaignId || '',
                    raw: entry
                });
            });

            // Sort by timestamp descending (newest first)
            events.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            return events;
        }

            // Add cancel entries - each cancel also had a corresponding create event
            cancelHistory.forEach((entry) => {
                // Add the original create event (from when the invoice was first created before being cancelled)
                const createTimestamp = entry.DateInvoice
                    ? new Date(entry.DateInvoice).getTime()
                    : entry.timestamp || 0;
                if (createTimestamp) {
                    events.push({
                        type: 'create',
                        label: 'Tạo phiếu bán hàng',
                        timestamp: createTimestamp,
                        userName: entry.UserName || '',
                        number: entry.Number || '',
                        showState: entry.ShowState || '',
                        paymentAmount: entry.PaymentAmount || 0,
                        discount: entry.Discount || 0,
                        deliveryPrice: entry.DeliveryPrice,
                        comment: entry.Comment || entry.DeliveryNote || '',
                        amountTotal: entry.AmountTotal || 0,
                        cashOnDelivery: entry.CashOnDelivery || 0,
                        carrierName: entry.CarrierName || '',
                        liveCampaignId: entry.LiveCampaignId || '',
                        orderLines: entry.OrderLines || [],
                        raw: entry,
                    });
                }

                // Add the cancel event
                events.push({
                    type: 'cancel',
                    label: 'Hủy đơn',
                    timestamp: entry.deletedAt || 0,
                    userName: entry.deletedByDisplayName || entry.deletedBy || '',
                    number: entry.Number || '',
                    showState: entry.ShowState || '',
                    cancelReason: entry.cancelReason || '',
                    paymentAmount: entry.PaymentAmount || 0,
                    discount: entry.Discount || 0,
                    deliveryPrice: entry.DeliveryPrice,
                    comment: entry.Comment || entry.DeliveryNote || '',
                    amountTotal: entry.AmountTotal || 0,
                    cashOnDelivery: entry.CashOnDelivery || 0,
                    carrierName: entry.CarrierName || '',
                    liveCampaignId: entry.LiveCampaignId || '',
                    raw: entry,
                });
            });

            // Sort by timestamp descending (newest first)
            events.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            return events;
        },
    };

    // Expose globally
    window.FulfillmentData = FulfillmentData;
})();
