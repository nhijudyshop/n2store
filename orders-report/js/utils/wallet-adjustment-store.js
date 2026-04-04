// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Wallet Adjustment Store
 * Tracks orders that need wallet/công nợ adjustment when phone number changes.
 *
 * When staff edits an order's phone number and the old/new phone has wallet balance,
 * a pending adjustment record is created. The order is blocked from creating PBH
 * until the accountant completes the adjustment in balance-history Kế Toán tab.
 *
 * Uses BaseStore (Firebase Firestore + localStorage cache + realtime listener)
 * so both orders-report and balance-history modules stay in sync.
 *
 * @version 1.0.0
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'walletAdjustmentStore';
    const FIRESTORE_COLLECTION = 'wallet_adjustment_requests';
    const MAX_AGE_DAYS = 90; // Auto cleanup after 90 days
    const LOG_PREFIX = '[WALLET-ADJ]';

    // =====================================================
    // BASE STORE INSTANCE
    // =====================================================

    const _baseStore = new BaseStore({
        collectionPath: FIRESTORE_COLLECTION,
        localStorageKey: STORAGE_KEY,
        maxLocalAge: MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    });

    // =====================================================
    // WALLET ADJUSTMENT STORE
    // =====================================================

    const WalletAdjustmentStore = {
        get _data() { return _baseStore._data; },
        set _data(val) { _baseStore._data = val; },

        get _initialized() { return _baseStore._initialized; },
        set _initialized(val) { _baseStore._initialized = val; },

        _isListening: false,

        /**
         * Initialize store from Firestore
         */
        async init() {
            if (this._initialized) return;

            try {
                const loadedFromFirestore = await _baseStore.load();

                if (!loadedFromFirestore) {
                    console.warn(`${LOG_PREFIX} Offline - Firestore unavailable`);
                }

                this._initialized = true;
                console.log(`${LOG_PREFIX} Store initialized with ${this._data.size} entries`);

                // Setup real-time listener
                _baseStore.setupRealtimeListener();

            } catch (error) {
                console.error(`${LOG_PREFIX} Init error:`, error);
                this._initialized = true;
            }
        },

        /**
         * Get adjustment record for an order
         * @param {string} orderId - SaleOnlineId
         * @returns {Object|undefined}
         */
        get(orderId) {
            if (!orderId) return undefined;
            return this._data.get(String(orderId));
        },

        /**
         * Check if an order has a pending adjustment
         * @param {string} orderId - SaleOnlineId
         * @returns {boolean}
         */
        isPending(orderId) {
            const record = this.get(orderId);
            return record && record.status === 'pending';
        },

        /**
         * Get all records
         * @returns {Map}
         */
        getAll() {
            return this._data;
        },

        /**
         * Get all pending adjustment records
         * @returns {Array<Object>}
         */
        getPending() {
            const pending = [];
            this._data.forEach((value, key) => {
                if (value && value.status === 'pending') {
                    pending.push({ ...value, _id: key });
                }
            });
            // Sort by createdAt descending (newest first)
            pending.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            return pending;
        },

        /**
         * Get count of pending adjustments
         * @returns {number}
         */
        getPendingCount() {
            let count = 0;
            this._data.forEach((value) => {
                if (value && value.status === 'pending') count++;
            });
            return count;
        },

        /**
         * Create or update an adjustment record
         * @param {string} orderId - SaleOnlineId
         * @param {Object} data - Adjustment data
         */
        async set(orderId, data) {
            if (!orderId) return;
            const key = String(orderId);
            const now = Date.now();

            const record = {
                orderId: key,
                orderCode: data.orderCode || '',
                oldPhone: data.oldPhone || '',
                newPhone: data.newPhone || '',
                oldPhoneBalance: data.oldPhoneBalance || 0,
                newPhoneBalance: data.newPhoneBalance || 0,
                customerName: data.customerName || '',
                status: data.status || 'pending',
                createdAt: data.createdAt || now,
                createdBy: data.createdBy || '',
                completedAt: data.completedAt || null,
                completedBy: data.completedBy || null,
                completedNote: data.completedNote || '',
                lastUpdated: now,
            };

            this._data.set(key, record);
            this._saveToLocalStorage();
            await this._saveToFirestore(key, record);

            console.log(`${LOG_PREFIX} Set adjustment for order ${key}:`, record);
        },

        /**
         * Mark adjustment as completed by accountant
         * @param {string} orderId - SaleOnlineId
         * @param {string} note - Completion note
         * @param {string} completedBy - Username
         */
        async markCompleted(orderId, note, completedBy) {
            if (!orderId) return;
            const key = String(orderId);
            const record = this._data.get(key);
            if (!record) return;

            record.status = 'completed';
            record.completedAt = Date.now();
            record.completedBy = completedBy || '';
            record.completedNote = note || '';
            record.lastUpdated = Date.now();

            this._data.set(key, record);
            this._saveToLocalStorage();
            await this._saveToFirestore(key, record);

            console.log(`${LOG_PREFIX} Marked completed: ${key}`);
        },

        /**
         * Delete an adjustment record
         * @param {string} orderId
         */
        async delete(orderId) {
            if (!orderId) return;
            const key = String(orderId);
            this._data.delete(key);
            this._saveToLocalStorage();
            await this._deleteFromFirestore(key);

            console.log(`${LOG_PREFIX} Deleted: ${key}`);
        },

        /**
         * Subscribe to data changes
         * @param {Function} callback
         * @returns {Function} unsubscribe
         */
        subscribe(callback) {
            return _baseStore.subscribe(callback);
        },

        // =====================================================
        // INTERNAL: PERSISTENCE
        // =====================================================

        _saveToLocalStorage() {
            _baseStore._saveToLocal();
        },

        async _saveToFirestore(key, record) {
            try {
                const db = _baseStore._getFirestore();
                if (!db) return;

                await db.collection(FIRESTORE_COLLECTION).doc(key).set(record, { merge: true });
            } catch (error) {
                console.error(`${LOG_PREFIX} Firestore save error:`, error);
            }
        },

        async _deleteFromFirestore(key) {
            try {
                const db = _baseStore._getFirestore();
                if (!db) return;

                await db.collection(FIRESTORE_COLLECTION).doc(key).delete();
            } catch (error) {
                console.error(`${LOG_PREFIX} Firestore delete error:`, error);
            }
        },
    };

    // =====================================================
    // EXPORT
    // =====================================================

    window.WalletAdjustmentStore = WalletAdjustmentStore;

    // Auto-initialize when DOM is ready
    function autoInit() {
        // Wait for Firebase to be available
        const checkFirebase = () => {
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                WalletAdjustmentStore.init().catch(err => {
                    console.error(`${LOG_PREFIX} Auto-init failed:`, err);
                });
            } else {
                setTimeout(checkFirebase, 500);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(checkFirebase, 200));
        } else {
            setTimeout(checkFirebase, 200);
        }
    }

    autoInit();

})();
