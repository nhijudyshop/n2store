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
    const FIRESTORE_COLLECTION = 'invoice_status_v2';

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
     * Syncs to Firestore for persistence across devices
     *
     * Uses BaseStore internally for core data management (localStorage caching, cleanup).
     * Custom Firestore logic (admin vs normal user, sentBills, debounced save) is kept here.
     */
    const _invoiceBaseStore = new BaseStore({
        collectionPath: FIRESTORE_COLLECTION,
        localStorageKey: STORAGE_KEY,
        maxLocalAge: MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    });

    const InvoiceStatusStore = {
        /** @returns {Map} Internal data map (delegated to BaseStore) */
        get _data() {
            return _invoiceBaseStore._data;
        },
        set _data(val) {
            _invoiceBaseStore._data = val;
        },

        _sentBills: new Set(),
        _myKeys: new Set(), // Keys that belong to the current user (for saving)
        _pendingKeys: new Set(), // Keys added locally but not yet saved to Firestore
        /** @returns {boolean} Whether store is initialized (delegated to BaseStore) */
        get _initialized() {
            return _invoiceBaseStore._initialized;
        },
        set _initialized(val) {
            _invoiceBaseStore._initialized = val;
        },

        _syncTimeout: null,
        /** @returns {Function|null} Firestore listener unsubscribe (delegated to BaseStore) */
        get _unsubscribe() {
            return _invoiceBaseStore._unsubscribe;
        },
        set _unsubscribe(val) {
            _invoiceBaseStore._unsubscribe = val;
        },

        _isListening: false, // Flag to prevent save loops when receiving updates

        /**
         * Initialize store from Firestore (source of truth)
         * Firebase là source of truth - localStorage chỉ là cache
         */
        async init() {
            if (this._initialized) return;

            try {
                // 1. Load from Firestore (sole source of truth - no localStorage cache)
                const loadedFromFirestore = await this._loadFromFirestore();

                if (!loadedFromFirestore) {
                    console.warn(
                        '[INVOICE-STATUS] Offline - Firestore unavailable, store is empty'
                    );
                }

                // 2. Cleanup old entries (delegated to BaseStore)
                _invoiceBaseStore._cleanupOldEntries();

                this._initialized = true;
                console.log(`[INVOICE-STATUS] Store initialized with ${this._data.size} entries`);

                // 3. Setup real-time listener for add/delete from other devices
                this._setupRealtimeListener();

                // 4. Re-render all invoice status cells after init (fix: cells showed "−" during Firestore load)
                if (this._data.size > 0) {
                    const allKeys = [];
                    this._data.forEach((value, key) => {
                        const soId = value.SaleOnlineId || extractSaleOnlineId(key);
                        if (soId && !allKeys.includes(soId)) allKeys.push(soId);
                    });
                    this._refreshInvoiceStatusUI(allKeys);
                }

                // 5. Sync to FulfillmentData in parent frame (always, even if empty)
                this._syncToFulfillmentData();
                // Retry sync after short delay (in case FulfillmentData not ready yet)
                setTimeout(() => this._syncToFulfillmentData(), 2000);
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
            // Get username from authManager or fallback to localStorage
            const authState = window.authManager?.getAuthState();
            const userType = authState?.userType || localStorage.getItem('userType') || '';
            const username = authState?.username || userType.split('-')[0] || 'default';
            return db.collection(FIRESTORE_COLLECTION).doc(username);
        },

        /**
         * Check if current user is admin
         */
        _isAdmin() {
            const authState = window.authManager?.getAuthState();
            const userType = authState?.userType || localStorage.getItem('userType') || '';
            return userType === 'admin-admin@@' || userType.split('-')[0] === 'admin';
        },

        /**
         * Load from Firestore (source of truth) - THAY THẾ toàn bộ _data
         * Admin loads ALL users' data, normal users load only their own
         * @returns {boolean} true nếu load thành công từ Firestore
         */
        async _loadFromFirestore() {
            try {
                // Get current username to track own keys
                const authState = window.authManager?.getAuthState();
                const userType = authState?.userType || localStorage.getItem('userType') || '';
                const myUsername = authState?.username || userType.split('-')[0] || 'default';

                // Load ALL documents from invoice_status collection (all users)
                console.log('[INVOICE-STATUS] Loading ALL users data from Firestore...');
                const db = firebase.firestore();
                const snapshot = await db.collection(FIRESTORE_COLLECTION).get();

                // Build new data in temp collections first (don't clear until load succeeds)
                const newData = new Map();
                const newSentBills = new Set();
                const newMyKeys = new Set();

                let totalEntries = 0;
                snapshot.forEach((doc) => {
                    const firestoreData = doc.data();
                    const isMyDoc = doc.id === myUsername;

                    // Load data từ Firestore (REPLACE, not merge)
                    if (firestoreData.data) {
                        const entries = Array.isArray(firestoreData.data)
                            ? firestoreData.data
                            : Object.entries(firestoreData.data);
                        entries.forEach(([key, value]) => {
                            newData.set(key, value);
                            totalEntries++;
                            // Track keys that belong to the current user
                            if (isMyDoc) {
                                newMyKeys.add(key);
                            }
                        });
                    }

                    // Load sent bills
                    if (firestoreData.sentBills && Array.isArray(firestoreData.sentBills)) {
                        firestoreData.sentBills.forEach((id) => newSentBills.add(id));
                    }
                });

                // Only replace data AFTER successful load (prevents data loss on partial failure)
                this._data.clear();
                newData.forEach((value, key) => this._data.set(key, value));
                this._sentBills = newSentBills;
                this._myKeys = newMyKeys;

                console.log(
                    `[INVOICE-STATUS] Loaded ${totalEntries} entries from ${snapshot.size} users (my keys: ${this._myKeys.size})`
                );

                // Don't cache to localStorage - too much data from all users
                return true;
            } catch (e) {
                console.error('[INVOICE-STATUS] Firestore load error:', e);
                return false; // Signal để fallback về localStorage
            }
        },

        /**
         * localStorage cache removed - Firestore is sole source of truth.
         * Saves ~500KB-1MB of localStorage quota.
         * Kept as no-op to avoid breaking callers.
         */
        _saveToLocalStorage() {
            // No-op: Firestore is source of truth, localStorage no longer used
        },

        /**
         * Save to Firestore (debounced 2s)
         * Uses merge:true for add/update operations (safe for concurrent edits)
         * Delete uses FieldValue.delete() separately
         */
        _hasPendingSave: false, // Track if there's unsaved data

        _saveToFirestore() {
            this._hasPendingSave = true;
            clearTimeout(this._syncTimeout);
            this._syncTimeout = setTimeout(async () => {
                try {
                    // Use dot-notation field paths to update individual entries
                    // without overwriting other entries in the `data` object.
                    // This is critical for compound keys where multiple entries coexist.
                    const updateObj = {
                        sentBills: Array.from(this._sentBills),
                        lastUpdated: Date.now(),
                    };
                    let entryCount = 0;
                    this._myKeys.forEach((key) => {
                        const value = this._data.get(key);
                        if (value) {
                            updateObj[`data.${key}`] = value;
                            entryCount++;
                        }
                    });
                    await this._getDocRef().set(updateObj, { merge: true });
                    this._hasPendingSave = false;
                    // DON'T clear _pendingKeys here — let snapshot handler confirm server has the data
                    console.log(`[INVOICE-STATUS] Synced ${entryCount} entries to Firestore`);
                } catch (e) {
                    console.error('[INVOICE-STATUS] Firestore save error:', e);
                }
            }, 2000);
        },

        /**
         * Save to Firestore IMMEDIATELY (no debounce)
         * Used after batch operations like storeFromApiResult
         */
        async _saveToFirestoreImmediate() {
            clearTimeout(this._syncTimeout);
            try {
                // Use dot-notation field paths to update individual entries
                // without overwriting other entries in the `data` object.
                const updateObj = {
                    sentBills: Array.from(this._sentBills),
                    lastUpdated: Date.now(),
                };
                let entryCount = 0;
                this._myKeys.forEach((key) => {
                    const value = this._data.get(key);
                    if (value) {
                        updateObj[`data.${key}`] = value;
                        entryCount++;
                    }
                });
                await this._getDocRef().set(updateObj, { merge: true });
                this._hasPendingSave = false;
                // DON'T clear _pendingKeys here — let snapshot handler confirm server has the data
                console.log(`[INVOICE-STATUS] IMMEDIATE sync: ${entryCount} entries to Firestore`);
            } catch (e) {
                console.error('[INVOICE-STATUS] Immediate Firestore save error:', e);
                // Re-schedule debounced save as fallback (immediate save failed)
                this._hasPendingSave = true;
                this._saveToFirestore();
            }
        },

        /**
         * Save to Firestore (sole source of truth)
         */
        save() {
            // Skip Firestore save if currently receiving real-time updates (avoid infinite loops)
            if (!this._isListening) {
                this._saveToFirestore();
            }
        },

        /**
         * Setup real-time listener for add/delete operations from other devices
         * Listens to Firestore changes and updates local _data accordingly
         */
        _setupRealtimeListener() {
            // Don't setup if already listening
            if (this._unsubscribe) {
                console.log('[INVOICE-STATUS] Real-time listener already active');
                return;
            }

            const db = firebase.firestore();

            // Listen to ALL documents in the collection (all users)
            console.log('[INVOICE-STATUS] Setting up real-time listener for ALL users...');
            this._unsubscribe = db.collection(FIRESTORE_COLLECTION).onSnapshot(
                (snapshot) => {
                    this._handleCollectionSnapshot(snapshot);
                },
                (error) => {
                    console.error('[INVOICE-STATUS] Real-time listener error:', error);
                }
            );
        },

        /**
         * Handle collection snapshot (for admin - all docs)
         * @param {firebase.firestore.QuerySnapshot} snapshot
         */
        _handleCollectionSnapshot(snapshot) {
            // Set flag to prevent save loops
            this._isListening = true;

            // Get current username to track own keys
            const authState = window.authManager?.getAuthState();
            const userType = authState?.userType || localStorage.getItem('userType') || '';
            const myUsername = authState?.username || userType.split('-')[0] || 'default';

            let hasChanges = false;
            const changedKeys = [];
            const deletedKeys = [];

            // Build a set of all keys currently in Firestore (across all docs)
            const allServerKeys = new Set();
            const myServerKeys = new Set();
            snapshot.docs.forEach((doc) => {
                const firestoreData = doc.data();
                if (firestoreData.data) {
                    Object.keys(firestoreData.data).forEach((key) => {
                        allServerKeys.add(key);
                        if (doc.id === myUsername) myServerKeys.add(key);
                    });
                }
            });

            // Clear pending keys that server has confirmed (safe to remove protection)
            this._pendingKeys.forEach((key) => {
                if (allServerKeys.has(key)) {
                    this._pendingKeys.delete(key);
                }
            });

            // Update _myKeys from server, preserving pending keys not yet saved
            this._myKeys = new Set([...myServerKeys, ...this._pendingKeys]);

            // Check for deleted entries (in local but not in any server doc)
            // Skip pending keys - they haven't been saved to Firestore yet
            this._data.forEach((value, key) => {
                if (!allServerKeys.has(key) && !this._pendingKeys.has(key)) {
                    this._data.delete(key);
                    this._sentBills.delete(key);
                    hasChanges = true;
                    deletedKeys.push(key);
                }
            });

            snapshot.docChanges().forEach((change) => {
                const doc = change.doc;
                const firestoreData = doc.data();

                if (change.type === 'added' || change.type === 'modified') {
                    // Update entries from this document
                    if (firestoreData.data) {
                        const entries = Array.isArray(firestoreData.data)
                            ? firestoreData.data
                            : Object.entries(firestoreData.data);
                        entries.forEach(([key, value]) => {
                            const existingEntry = this._data.get(key);
                            // Only update if data actually changed (deep compare)
                            const valueTs = value.timestamp?.toMillis
                                ? value.timestamp.toMillis()
                                : value.timestamp || 0;
                            const existingTs = existingEntry?.timestamp?.toMillis
                                ? existingEntry.timestamp.toMillis()
                                : existingEntry?.timestamp || 0;
                            const isNew = !existingEntry;
                            const isNewer = valueTs > existingTs;
                            const isDataDifferent =
                                isNew ||
                                isNewer ||
                                (!isNewer &&
                                    JSON.stringify(value) !== JSON.stringify(existingEntry));
                            if (isNew || (value.timestamp && isDataDifferent)) {
                                this._data.set(key, value);
                                hasChanges = true;
                                changedKeys.push(key);
                            }
                        });
                    }

                    // Update sentBills
                    if (firestoreData.sentBills && Array.isArray(firestoreData.sentBills)) {
                        firestoreData.sentBills.forEach((id) => {
                            if (!this._sentBills.has(id)) {
                                this._sentBills.add(id);
                                hasChanges = true;
                            }
                        });
                    }
                }
            });

            // Update UI if there were changes
            if (hasChanges) {
                if (changedKeys.length > 0 || deletedKeys.length > 0) {
                    console.log(
                        `[INVOICE-STATUS] Real-time: ${changedKeys.length} updated, ${deletedKeys.length} deleted`
                    );
                }
                this._refreshInvoiceStatusUI(changedKeys);
                this._refreshDeletedInvoiceStatusUI(deletedKeys);
                this._syncToFulfillmentData();
            }

            // Reset flag
            this._isListening = false;
        },

        /**
         * Handle single document snapshot (for normal user)
         * @param {firebase.firestore.DocumentSnapshot} doc
         */
        _handleDocSnapshot(doc) {
            // Skip the initial snapshot (we already loaded data in init)
            if (!this._initialized) return;

            // Set flag to prevent save loops
            this._isListening = true;

            let hasChanges = false;
            const changedKeys = [];
            const deletedKeys = [];

            if (doc.exists) {
                const firestoreData = doc.data();
                const serverDataKeys = new Set(Object.keys(firestoreData.data || {}));

                // Clear pending keys that server has confirmed (safe to remove protection)
                this._pendingKeys.forEach((key) => {
                    if (serverDataKeys.has(key)) {
                        this._pendingKeys.delete(key);
                    }
                });

                // Check for deleted entries (in local but not in server)
                // Skip pending keys - they haven't been saved to Firestore yet
                this._data.forEach((value, key) => {
                    if (!serverDataKeys.has(key) && !this._pendingKeys.has(key)) {
                        this._data.delete(key);
                        this._sentBills.delete(key);
                        hasChanges = true;
                        deletedKeys.push(key);
                    }
                });

                // Update entries from Firestore
                if (firestoreData.data) {
                    const entries = Array.isArray(firestoreData.data)
                        ? firestoreData.data
                        : Object.entries(firestoreData.data);
                    entries.forEach(([key, value]) => {
                        const existingEntry = this._data.get(key);
                        // Only update if data actually changed (deep compare)
                        const valueTs = value.timestamp?.toMillis
                            ? value.timestamp.toMillis()
                            : value.timestamp || 0;
                        const existingTs = existingEntry?.timestamp?.toMillis
                            ? existingEntry.timestamp.toMillis()
                            : existingEntry?.timestamp || 0;
                        const isNew = !existingEntry;
                        const isNewer = valueTs > existingTs;
                        const isDataDifferent =
                            isNew ||
                            isNewer ||
                            (!isNewer && JSON.stringify(value) !== JSON.stringify(existingEntry));
                        if (isNew || (value.timestamp && isDataDifferent)) {
                            this._data.set(key, value);
                            hasChanges = true;
                            changedKeys.push(key);
                        }
                    });
                }

                // Update sentBills
                if (firestoreData.sentBills && Array.isArray(firestoreData.sentBills)) {
                    firestoreData.sentBills.forEach((id) => {
                        if (!this._sentBills.has(id)) {
                            this._sentBills.add(id);
                            hasChanges = true;
                        }
                    });
                }
            }

            // Update UI if there were changes
            if (hasChanges) {
                if (changedKeys.length > 0 || deletedKeys.length > 0) {
                    console.log(
                        `[INVOICE-STATUS] Real-time: ${changedKeys.length} updated, ${deletedKeys.length} deleted`
                    );
                }
                this._refreshInvoiceStatusUI(changedKeys);
                this._refreshDeletedInvoiceStatusUI(deletedKeys);
                this._syncToFulfillmentData();
            }

            // Reset flag
            this._isListening = false;
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
                console.log(`[INVOICE-STATUS] Real-time: Updated UI for ${updatedCount} orders`);
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
                console.log(
                    `[INVOICE-STATUS] Real-time: Cleared UI for ${clearedCount} deleted orders`
                );
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
            console.log(
                `[INVOICE-STATUS] Synced ${Object.keys(grouped).length} orders to FulfillmentData`
            );
        },

        /**
         * Destroy real-time listener and cleanup (delegates to BaseStore)
         * Call this when the page is unloaded or the store is no longer needed
         */
        destroy() {
            // Delegate core cleanup to BaseStore (unsubscribe, clear timers, clear subscribers)
            _invoiceBaseStore.destroy();
            // Clear any pending sync timeout (custom to InvoiceStatusStore)
            if (this._syncTimeout) {
                clearTimeout(this._syncTimeout);
                this._syncTimeout = null;
            }
            console.log('[INVOICE-STATUS] Store destroyed (via BaseStore)');
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
            this._pendingKeys.add(entryKey); // Protect from snapshot deletion until saved
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
                timestamp: Date.now(), // Thời điểm lưu vào localStorage
            });
            this.save();
        },

        /**
         * Delete the LATEST invoice entry for a SaleOnlineOrder from local store and Firestore.
         * Supports both compound keys and legacy flat keys.
         * Admin: deletes from ALL user docs (since admin loads data from all docs)
         * @param {string} saleOnlineId - The SaleOnline order ID to delete
         * @returns {boolean} True if deleted, false if not found
         */
        async delete(saleOnlineId) {
            if (!saleOnlineId) return false;

            const soId = String(saleOnlineId);

            // Find the LATEST entry's actual key (compound or flat)
            let targetKey = null;
            let latestTs = 0;

            // Check legacy flat key first
            if (this._data.has(soId) && !isCompoundKey(soId)) {
                targetKey = soId;
                latestTs = this._data.get(soId)?.timestamp || 0;
            }

            // Search compound keys for newest entry
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

            // Remove from local _data and _myKeys
            this._data.delete(targetKey);
            this._myKeys.delete(targetKey);
            this._sentBills.delete(soId); // sentBills still keyed by SaleOnlineId
            this._saveToLocalStorage();

            // Delete from Firestore - scan ALL user docs since entry could be in any user's doc
            try {
                const db = firebase.firestore();
                const snapshot = await db.collection(FIRESTORE_COLLECTION).get();
                const batch = db.batch();
                let batchCount = 0;
                snapshot.forEach((doc) => {
                    const docData = doc.data();
                    if (docData.data && targetKey in docData.data) {
                        batch.update(doc.ref, {
                            [`data.${targetKey}`]: firebase.firestore.FieldValue.delete(),
                            lastUpdated: Date.now(),
                        });
                        batchCount++;
                    }
                });
                if (batchCount > 0) {
                    await batch.commit();
                    console.log(
                        `[INVOICE-STATUS] Deleted invoice ${targetKey} from ${batchCount} user doc(s)`
                    );
                }
            } catch (e) {
                console.error('[INVOICE-STATUS] Firestore delete error:', e);
            }

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
                    console.log('[INVOICE-STATUS] Enriched payment data:', {
                        Reference: order.Reference,
                        PaymentAmount: order.PaymentAmount,
                        Discount: order.Discount,
                    });
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
                        console.log(
                            '[INVOICE-STATUS] Enriched address from request:',
                            requestAddress
                        );
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
                        console.log('[INVOICE-STATUS] Enriched carrier from request:', carrierName);
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
                                console.log(
                                    '[INVOICE-STATUS] Address from fastSaleOrdersData:',
                                    fastSaleData.ReceiverAddress
                                );
                            }

                            this.set(soId, order, originalOrder);
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
                                console.log(
                                    '[INVOICE-STATUS] Address from fastSaleOrdersData:',
                                    fastSaleData.ReceiverAddress
                                );
                            }

                            this.set(soId, order, originalOrder);
                        });
                    }
                });
            }

            console.log(`[INVOICE-STATUS] Stored ${this._data.size} invoice entries`);

            // Force immediate Firestore save (bypass 2s debounce)
            this._saveToFirestoreImmediate();
        },

        /**
         * Clear old entries (delegates to BaseStore's _cleanupOldEntries)
         * Also cleans up sentBills for removed entries
         */
        async cleanup() {
            const sizeBefore = this._data.size;
            // Delegate cleanup to BaseStore
            _invoiceBaseStore._cleanupOldEntries();
            const sizeAfter = this._data.size;
            const removed = sizeBefore - sizeAfter;

            // Also cleanup sentBills for entries that were removed
            if (removed > 0) {
                // Build set of all SaleOnlineIds that still have entries
                const activeSaleOnlineIds = new Set();
                this._data.forEach((value, key) => {
                    const soId = value.SaleOnlineId || extractSaleOnlineId(key);
                    if (soId) activeSaleOnlineIds.add(soId);
                });
                this._sentBills.forEach((id) => {
                    if (!activeSaleOnlineIds.has(id)) {
                        this._sentBills.delete(id);
                    }
                });
                this.save();
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
         * Delete a single invoice entry using FieldValue.delete()
         * This removes only the specific entry without affecting other data
         * Admin: deletes from ALL user docs (since admin loads data from all docs)
         * Normal user: deletes from own doc only
         * @param {string} saleOnlineId - The SaleOnline order ID to delete
         * @returns {boolean} True if deleted, false if not found
         */
        async delete(saleOnlineId) {
            if (!saleOnlineId) return false;

            const key = String(saleOnlineId);
            const existed = this._data.has(key);

            if (existed) {
                // Remove from local _data and _myKeys
                this._data.delete(key);
                this._myKeys.delete(key);
                this._sentBills.delete(key);
                this._saveToLocalStorage();

                // Delete from Firestore - scan ALL user docs since entry could be in any user's doc
                try {
                    const db = firebase.firestore();
                    const snapshot = await db.collection(FIRESTORE_COLLECTION).get();
                    const batch = db.batch();
                    let batchCount = 0;
                    snapshot.forEach((doc) => {
                        const docData = doc.data();
                        if (docData.data && key in docData.data) {
                            batch.update(doc.ref, {
                                [`data.${key}`]: firebase.firestore.FieldValue.delete(),
                                lastUpdated: Date.now(),
                            });
                            batchCount++;
                        }
                    });
                    if (batchCount > 0) {
                        await batch.commit();
                        console.log(
                            `[INVOICE-STATUS] Deleted invoice ${key} from ${batchCount} user doc(s)`
                        );
                    }
                } catch (e) {
                    console.error('[INVOICE-STATUS] Firestore delete error:', e);
                }
            }

            return existed;
        },

        /**
         * Clear all data (for testing/reset)
         */
        async clearAll() {
            this._data.clear();
            this._myKeys.clear();
            this._sentBills.clear();
            localStorage.removeItem(STORAGE_KEY);

            try {
                await this._getDocRef().delete();
            } catch (e) {
                console.error('[INVOICE-STATUS] Firestore clear error:', e);
            }
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

        // Messenger button or sent badge - show for confirmed/paid invoices
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
                console.log(
                    '[INVOICE-STATUS] Generating custom bill for preview, walletBalance:',
                    walletBalance
                );
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

                console.log('[INVOICE-STATUS] Custom bill loaded in iframe');

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
        console.log('[INVOICE-STATUS] 🎨 Pre-generating bill image for:', cacheKey);

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

            // Upload to Pancake
            const uploadResult = await window.pancakeDataManager.uploadImage(channelId, imageFile);
            const contentUrl =
                typeof uploadResult === 'string' ? uploadResult : uploadResult.content_url;
            const contentId =
                typeof uploadResult === 'object'
                    ? uploadResult.content_id || uploadResult.id
                    : null;

            if (contentUrl && contentId) {
                // Cache for later use
                window.preGeneratedBillData.set(cacheKey, {
                    contentUrl,
                    contentId,
                    timestamp: Date.now(),
                });
                console.log(
                    '[INVOICE-STATUS] ✅ Bill pre-generated and cached:',
                    cacheKey,
                    contentUrl
                );
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
            console.log('[INVOICE-STATUS] Printing TPOS bill for order:', tposOrderId);
            const headers = await getBillAuthHeader();
            const orderData = enrichedOrder.SessionIndex
                ? enrichedOrder
                : window.OrderStore?.get(enrichedOrder.SaleOnlineIds?.[0]) || enrichedOrder;
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

        const { enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex } =
            pendingSendData;
        const tposOrderId = enrichedOrder.Id || orderId;

        // 1. Open print popup first (TPOS bill if available)
        if (tposOrderId && typeof window.fetchAndPrintTPOSBill === 'function') {
            console.log('[INVOICE-STATUS] Printing TPOS bill for order:', tposOrderId);
            const headers = await getBillAuthHeader();
            const orderData = enrichedOrder.SessionIndex
                ? enrichedOrder
                : window.OrderStore?.get(enrichedOrder.SaleOnlineIds?.[0]) || enrichedOrder;
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
            .catch((error) => {
                console.error('[INVOICE-STATUS] Error printing and sending:', error);
                window.notificationManager?.error(
                    `❌ Gửi bill #${orderCode} thất bại: ${error.message}`,
                    5000
                );
            });
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
        console.log('[INVOICE-STATUS] Sending bill for:', orderCode);

        // Check for pre-generated bill data
        const cachedData =
            window.preGeneratedBillData?.get(enrichedOrder.Id) ||
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
                console.log('[INVOICE-STATUS] Auto-detected carrier from address:', carrierName);
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
    // DELETE INVOICE FROM STORE
    // =====================================================

    /**
     * Delete invoice from localStorage and Firebase
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
                `Dữ liệu sẽ bị xóa khỏi localStorage và Firebase.`
        );

        if (!confirmed) return;

        try {
            // Delete from store (localStorage + Firebase)
            const deleted = await InvoiceStatusStore.delete(saleOnlineId);

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

        console.log(
            `[INVOICE-STATUS] Printing ${type} for ${orderIds.length} orders (auto-send DISABLED)`
        );

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

        console.log(
            `[INVOICE-STATUS] Invoice confirmed for order ${saleOnlineId}, updating status and tags...`
        );

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
            if (order.Status === 'Draft' || order.StatusText === 'Nháp') {
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
                    console.log(
                        `[INVOICE-STATUS] ✅ Status updated to "Đơn hàng" for order ${saleOnlineId}`
                    );

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

        const allOrders = [...(apiResult.OrdersSucessed || []), ...(apiResult.OrdersError || [])];

        console.log(`[INVOICE-STATUS] Updating ${allOrders.length} cells in main table`);

        // Inject entries into FulfillmentData immediately (bypass Firestore delay)
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

            // Delayed retry: re-update cells after 2s to handle race conditions
            // (e.g., Firestore snapshot arriving late and clearing data)
            setTimeout(() => {
                updateMainTableInvoiceCells(result);
            }, 2000);
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
        window.updateMainTableInvoiceCells = updateMainTableInvoiceCells;
        window.InvoiceStatusStore = InvoiceStatusStore;
        // Assign 'get' method explicitly (cannot use shorthand in object literal due to getter keyword conflict)
        InvoiceStatusStore.get = function (saleOnlineId) {
            if (!saleOnlineId) return null;
            return InvoiceStatusStore.getLatest(saleOnlineId);
        };
        window.extractSaleOnlineId = extractSaleOnlineId; // For FulfillmentData backward compat
        window.getStateCodeConfig = getStateCodeConfig;
        window.getShowStateConfig = getShowStateConfig;
        // Preview modal functions
        window.showBillPreviewModal = showBillPreviewModal;
        window.closeBillPreviewSendModal = closeBillPreviewSendModal;
        window.confirmSendBillFromPreview = confirmSendBillFromPreview;
        window.printBillFromPreview = printBillFromPreview;
        window.printAndSendBillFromPreview = printAndSendBillFromPreview;
        // Delete invoice function
        window.deleteInvoiceFromStore = deleteInvoiceFromStore;
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

        // Flush pending saves when tab becomes hidden or before page unload
        const flushPendingSave = () => {
            if (!InvoiceStatusStore._hasPendingSave) return;
            console.log('[INVOICE-STATUS] Flushing pending save...');
            try {
                clearTimeout(InvoiceStatusStore._syncTimeout);
                const updateObj = {
                    sentBills: Array.from(InvoiceStatusStore._sentBills),
                    lastUpdated: Date.now(),
                };
                let entryCount = 0;
                InvoiceStatusStore._myKeys.forEach((key) => {
                    const value = InvoiceStatusStore._data.get(key);
                    if (value) {
                        updateObj[`data.${key}`] = value;
                        entryCount++;
                    }
                });
                if (entryCount > 0) {
                    const docRef = InvoiceStatusStore._getDocRef();
                    docRef.set(updateObj, { merge: true })
                        .then(() => {
                            InvoiceStatusStore._hasPendingSave = false;
                            console.log(`[INVOICE-STATUS] Flush save OK: ${entryCount} entries`);
                        })
                        .catch((e) => {
                            console.error('[INVOICE-STATUS] Flush save failed:', e);
                        });
                }
            } catch (e) {
                console.error('[INVOICE-STATUS] Error in flush:', e);
            }
        };

        // visibilitychange fires BEFORE beforeunload and is more reliable
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                flushPendingSave();
            }
        });
        window.addEventListener('beforeunload', flushPendingSave);

        console.log('[INVOICE-STATUS] Module initialized successfully');
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
