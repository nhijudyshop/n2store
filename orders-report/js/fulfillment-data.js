/**
 * Fulfillment Data Module (Shared)
 * Loaded in main.html, accessible from all iframes via window.parent.FulfillmentData
 *
 * Loads invoice_status_v2 and invoice_status_delete_v2 from Firestore
 * to track order fulfillment history (ra đơn / hủy đơn).
 */

(function () {
    'use strict';

    const INVOICE_COLLECTION = 'invoice_status_v2';
    const DELETE_COLLECTION = 'invoice_status_delete_v2';

    // Maps: SaleOnlineId -> invoice data / cancel entries
    let invoiceStatusMap = new Map();
    let invoiceDeleteMap = new Map(); // SaleOnlineId -> Array of cancel entries
    let _initialized = false;
    let _unsubscribeStatus = null;
    let _unsubscribeDelete = null;
    let _onChangeCallbacks = [];

    // =====================================================
    // AUTH HELPERS
    // =====================================================

    function _getAuthInfo() {
        try {
            const authData = window.authManager?.getAuthData?.() || window.authManager?.getAuthState?.();
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
        const { username, isAdmin } = _getAuthInfo();

        invoiceStatusMap.clear();

        if (isAdmin) {
            const snapshot = await db.collection(INVOICE_COLLECTION).get();
            snapshot.forEach(doc => {
                const firestoreData = doc.data();
                if (firestoreData.data) {
                    const entries = Array.isArray(firestoreData.data)
                        ? firestoreData.data
                        : Object.entries(firestoreData.data);
                    entries.forEach(([key, value]) => {
                        invoiceStatusMap.set(String(key), value);
                    });
                }
            });
        } else {
            const doc = await db.collection(INVOICE_COLLECTION).doc(username).get();
            if (doc.exists) {
                const firestoreData = doc.data();
                if (firestoreData.data) {
                    const entries = Array.isArray(firestoreData.data)
                        ? firestoreData.data
                        : Object.entries(firestoreData.data);
                    entries.forEach(([key, value]) => {
                        invoiceStatusMap.set(String(key), value);
                    });
                }
            }
        }

        console.log(`[FULFILLMENT] Loaded ${invoiceStatusMap.size} invoice status entries`);
    }

    async function _loadInvoiceDeletes() {
        const db = firebase.firestore();
        const { username, isAdmin } = _getAuthInfo();

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

        if (isAdmin) {
            const snapshot = await db.collection(DELETE_COLLECTION).get();
            snapshot.forEach(doc => {
                const firestoreData = doc.data();
                processEntries(firestoreData.data);
            });
        } else {
            const doc = await db.collection(DELETE_COLLECTION).doc(username).get();
            if (doc.exists) {
                processEntries(doc.data().data);
            }
        }

        console.log(`[FULFILLMENT] Loaded delete entries for ${invoiceDeleteMap.size} orders`);
    }

    // =====================================================
    // REAL-TIME LISTENERS
    // =====================================================

    function _setupListeners() {
        const db = firebase.firestore();
        const { username, isAdmin } = _getAuthInfo();

        // Listener for invoice_status_v2
        if (isAdmin) {
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
                            invoiceStatusMap.set(String(key), value);
                        });
                    }
                });
                _notifyChange();
            });
        } else {
            _unsubscribeStatus = db.collection(INVOICE_COLLECTION).doc(username).onSnapshot(doc => {
                if (!_initialized) return;
                invoiceStatusMap.clear();
                if (doc.exists) {
                    const firestoreData = doc.data();
                    if (firestoreData.data) {
                        const entries = Array.isArray(firestoreData.data)
                            ? firestoreData.data
                            : Object.entries(firestoreData.data);
                        entries.forEach(([key, value]) => {
                            invoiceStatusMap.set(String(key), value);
                        });
                    }
                }
                _notifyChange();
            });
        }

        // Listener for invoice_status_delete_v2
        if (isAdmin) {
            _unsubscribeDelete = db.collection(DELETE_COLLECTION).onSnapshot(snapshot => {
                if (!_initialized) return;
                invoiceDeleteMap.clear();
                snapshot.forEach(doc => {
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
        } else {
            _unsubscribeDelete = db.collection(DELETE_COLLECTION).doc(username).onSnapshot(doc => {
                if (!_initialized) return;
                invoiceDeleteMap.clear();
                if (doc.exists) {
                    const data = doc.data().data;
                    if (data) {
                        const entries = Object.entries(data);
                        entries.forEach(([key, value]) => {
                            const saleOnlineId = String(value.SaleOnlineId || '');
                            if (!saleOnlineId) return;
                            if (!invoiceDeleteMap.has(saleOnlineId)) {
                                invoiceDeleteMap.set(saleOnlineId, []);
                            }
                            invoiceDeleteMap.get(saleOnlineId).push(value);
                        });
                    }
                }
                _notifyChange();
            });
        }
    }

    function _notifyChange() {
        _onChangeCallbacks.forEach(cb => {
            try { cb(); } catch (e) { console.error('[FULFILLMENT] onChange callback error:', e); }
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
         * @param {string|number} orderId - SaleOnlineId
         * @returns {{ status: string, label: string, createCount: number, cancelCount: number, activeInvoice: object|null, cancelHistory: Array }}
         */
        getStatus(orderId) {
            const id = String(orderId);
            const cancelEntries = invoiceDeleteMap.get(id) || [];
            const cancelCount = cancelEntries.length;
            const activeInvoice = invoiceStatusMap.get(id) || null;
            const hasActive = activeInvoice !== null;
            const createCount = cancelCount + (hasActive ? 1 : 0);

            let status, label;
            if (createCount === 0) {
                status = 'cho_ra_don';
                label = 'Chờ ra đơn';
            } else if (createCount - cancelCount > 0) {
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

            orders.forEach(order => {
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
            _onChangeCallbacks = _onChangeCallbacks.filter(cb => cb !== callback);
        },

        /**
         * Build timeline events for an order (sorted by time descending)
         * @param {string|number} orderId
         * @returns {Array} Array of event objects
         */
        getTimeline(orderId) {
            const { activeInvoice, cancelHistory } = this.getStatus(orderId);
            const events = [];

            // Add active invoice as a "create" event
            if (activeInvoice) {
                events.push({
                    type: 'create',
                    label: 'Tạo phiếu bán hàng',
                    timestamp: activeInvoice.timestamp || activeInvoice.DateInvoice ? new Date(activeInvoice.DateInvoice || activeInvoice.timestamp).getTime() : 0,
                    userName: activeInvoice.UserName || '',
                    number: activeInvoice.Number || '',
                    showState: activeInvoice.ShowState || '',
                    paymentAmount: activeInvoice.PaymentAmount || 0,
                    discount: activeInvoice.Discount || 0,
                    deliveryPrice: activeInvoice.DeliveryPrice,
                    comment: activeInvoice.Comment || activeInvoice.DeliveryNote || '',
                    amountTotal: activeInvoice.AmountTotal || 0,
                    cashOnDelivery: activeInvoice.CashOnDelivery || 0,
                    carrierName: activeInvoice.CarrierName || '',
                    liveCampaignId: activeInvoice.LiveCampaignId || '',
                    orderLines: activeInvoice.OrderLines || [],
                    raw: activeInvoice
                });
            }

            // Add cancel entries
            cancelHistory.forEach(entry => {
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
    };

    // Expose globally
    window.FulfillmentData = FulfillmentData;
})();
