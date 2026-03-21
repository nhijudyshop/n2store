/**
 * Fulfillment Data Module (Shared)
 * Loaded in main.html, accessible from all iframes via window.parent.FulfillmentData
 *
 * v5: All data comes from PostgreSQL API (no more Firestore dependency).
 *     invoice_status data is synced FROM InvoiceStatusStore (iframe) via syncFromStore().
 *     invoice_status_delete data is loaded from API.
 *
 * invoiceStatusMap: Map<SaleOnlineId, Array<entry>> (grouped by SaleOnlineId)
 * invoiceDeleteMap: Map<SaleOnlineId, Array<entry>> (cancel entries)
 */

(function () {
    'use strict';

    const DELETE_API_BASE = (window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/invoice-status/delete';

    // Maps: SaleOnlineId -> Array of invoice entries / cancel entries
    let invoiceStatusMap = new Map(); // SaleOnlineId -> Array of create entries (synced from InvoiceStatusStore)
    let invoiceDeleteMap = new Map(); // SaleOnlineId -> Array of cancel entries (from API)
    let _initialized = false;
    let _onChangeCallbacks = [];

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
    // LOAD FROM API (delete entries)
    // Invoice status data comes from InvoiceStatusStore via syncFromStore()
    // =====================================================

    async function _loadInvoiceDeletes() {
        try {
            const response = await fetch(`${DELETE_API_BASE}/load`);
            if (!response.ok) throw new Error(`API load failed: ${response.status}`);

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Load failed');

            invoiceDeleteMap.clear();
            (result.entries || []).forEach(row => {
                const saleOnlineId = String(row.sale_online_id || '');
                if (!saleOnlineId) return;
                if (!invoiceDeleteMap.has(saleOnlineId)) {
                    invoiceDeleteMap.set(saleOnlineId, []);
                }
                const value = {
                    SaleOnlineId: saleOnlineId,
                    cancelReason: row.cancel_reason,
                    deletedAt: parseInt(row.deleted_at) || 0,
                    deletedBy: row.deleted_by,
                    deletedByDisplayName: row.deleted_by_display_name,
                    isOldVersion: row.is_old_version || false,
                    hidden: row.hidden || false,
                    ...(row.invoice_data || {}),
                };
                invoiceDeleteMap.get(saleOnlineId).push(value);
            });

            console.log(`[FULFILLMENT] Loaded delete entries for ${invoiceDeleteMap.size} orders`);
        } catch (e) {
            console.error('[FULFILLMENT] Error loading delete entries:', e);
        }
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
         * Initialize: load delete data from API.
         * Invoice status data comes from InvoiceStatusStore via syncFromStore().
         */
        async init() {
            if (_initialized) return;
            try {
                await _loadInvoiceDeletes();
                _initialized = true;
                console.log(
                    '[FULFILLMENT] Initialized (delete data loaded, awaiting invoice status sync)'
                );
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
                    return !latest || (entry.timestamp || 0) > (latest.timestamp || 0)
                        ? entry
                        : latest;
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
                cancelHistory: cancelEntries,
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
         * Sync invoice status data from InvoiceStatusStore (iframe).
         * Called by InvoiceStatusStore._syncToFulfillmentData() after init and reload.
         * @param {Object} groupedData - Plain object { SaleOnlineId: Array<entry> } (cross-frame safe)
         */
        syncFromStore(groupedData) {
            if (!groupedData) return;

            // Convert plain object to Map (cross-frame safe - no instanceof Map issues)
            const newMap = new Map();
            const entries =
                typeof groupedData.entries === 'function'
                    ? Array.from(groupedData.entries())
                    : Object.entries(groupedData);
            entries.forEach(([key, value]) => {
                if (Array.isArray(value)) {
                    newMap.set(key, value);
                } else if (value) {
                    newMap.set(key, [value]);
                }
            });

            invoiceStatusMap = newMap;
            console.log(
                `[FULFILLMENT] Synced ${invoiceStatusMap.size} orders from InvoiceStatusStore`
            );
            _notifyChange();
        },

        /**
         * Inject invoice entries directly (bypass API delay)
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
                const isDuplicate = arr.some(
                    (e) => e.Id === data.Id && e.timestamp === data.timestamp
                );
                if (!isDuplicate) {
                    // Check if this is an update to an existing entry (same TPOS Id, newer timestamp)
                    const existingIdx = arr.findIndex((e) => e.Id === data.Id);
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
                timestamp:
                    entry.timestamp ||
                    (entry.DateInvoice ? new Date(entry.DateInvoice).getTime() : 0),
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

            // Add ALL active entries as "create" events (v3: supports multiple creations)
            if (activeEntries && activeEntries.length > 0) {
                activeEntries.forEach((entry) => {
                    events.push(buildCreateEvent(entry));
                });
            }

            // Add cancel entries - each cancel also had a corresponding create event
            cancelHistory.forEach((entry) => {
                // Add the original create event (from when the invoice was first created before being cancelled)
                const createTimestamp = entry.DateInvoice
                    ? new Date(entry.DateInvoice).getTime()
                    : entry.timestamp || 0;
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
