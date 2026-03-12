/**
 * N2Store - IndexedDB-backed storage with synchronous read API
 *
 * Replaces localStorage for large data to prevent QuotaExceededError.
 * Uses in-memory cache for synchronous reads, writes to IndexedDB asynchronously.
 * Falls back to localStorage if IndexedDB is unavailable.
 *
 * API matches localStorage:
 *   n2store.getItem(key)           → string | null  (sync from cache)
 *   n2store.setItem(key, value)    → void           (sync cache + async IDB)
 *   n2store.removeItem(key)        → void           (sync cache + async IDB)
 *
 * Usage:
 *   <script src="../shared/js/indexed-db-store.js"></script>
 *   // Then use window.n2store instead of localStorage for designated keys
 *
 * Migration: On first load, automatically moves designated keys from
 * localStorage to IndexedDB, freeing ~4MB+ of localStorage space.
 * Also cleans up Firestore SDK persistence keys.
 */
(function() {
    'use strict';

    var DB_NAME = 'n2store';
    var DB_VERSION = 1;
    var STORE_NAME = 'kv';
    var MIGRATION_FLAG = 'n2store_idb_v1';

    // Critical keys: kept in BOTH localStorage AND IndexedDB (dual-write)
    // These are read synchronously on page load BEFORE IndexedDB is ready.
    // Without localStorage fallback, auth checks fail → user gets kicked to login.
    var CRITICAL_KEYS = [
        'loginindex_auth',
        'bearer_token_data_1', 'bearer_token_data_2'
    ];

    function isCriticalKey(key) {
        return CRITICAL_KEYS.indexOf(key) !== -1;
    }

    // Keys to migrate from localStorage → IndexedDB
    var MIGRATE_KEYS = [
        // Auth & tokens
        'loginindex_auth',
        'bearer_token_data_1', 'bearer_token_data_2',
        'bearerToken', 'tokenExpiry',
        'bill_tpos_credentials_1', 'bill_tpos_token_1',
        'pancake_jwt_token', 'pancake_jwt_token_expiry',
        'pancake_all_accounts', 'pancake_page_access_tokens',
        'tpos_pancake_active_account_id',
        'firebaseConfig',
        'n2shop_auth_cache',

        // Large cache data
        'socialOrders', 'socialOrderTags',
        'invoiceStatusDelete_v2', 'invoiceStatusStore_v2',
        'tpos_pancake_pages_cache',
        'inbox_orders', 'inbox_conv_labels', 'inbox_groups',
        'quickReplies',
        'orders_productAssignments', 'orders_productRemovals',
        'social_debt_cache',
        'sent_message_orders', 'failed_message_orders',
        'supplierDebt_webNotes',
        'orders_held_cleanup_pending',

        // Filter & display settings
        'tab1_filter_data', 'orders_tab1_filter_data',
        'soquy_filters', 'soquy_report_filters', 'soquy_column_visibility',
        'orderDisplaySettings', 'soluongDisplaySettings',
        'orders_billTemplateSettings',
        'orders_discount_stats_thresholds',
        'orders_discount_opportunity_cost_settings',
        'orders_discount_livestream_costs',
        'pageCompanyIdMapping',

        // Menu & navigation
        'n2shop_custom_menu_names', 'n2shop_menu_layout',
        'n2shop_menu_layout_timestamp', 'n2shop_custom_menu_names_timestamp',
        'n2shop_menu_group_collapsed', 'n2shop_mobile_group_collapsed',

        // Chat
        'tpos_pk_recent_emojis', 'inbox_recent_emojis',
        'tpos_pancake_selected_page', 'tpos_selected_page',
        'tpos_pancake_server_mode', 'inbox_current_filter',

        // Other
        'tposSettings'
    ];

    function N2Store() {
        this._cache = {};
        this._db = null;
        this._dbReady = false;
        this._readyPromise = this._init();
    }

    N2Store.prototype._init = function() {
        var self = this;
        return new Promise(function(resolve) {
            if (!window.indexedDB) {
                console.warn('[N2Store] IndexedDB not supported, using localStorage');
                resolve();
                return;
            }
            var request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = function(e) {
                self._db = e.target.result;
                self._loadAll().then(function() {
                    self._dbReady = true;
                    self._migrate();
                    console.log('[N2Store] Ready (' + Object.keys(self._cache).length + ' keys in IndexedDB)');
                    resolve();
                });
            };
            request.onerror = function(e) {
                console.warn('[N2Store] IndexedDB error:', e.target.error);
                resolve();
            };
        });
    };

    N2Store.prototype._loadAll = function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            if (!self._db) { resolve(); return; }
            try {
                var tx = self._db.transaction(STORE_NAME, 'readonly');
                var store = tx.objectStore(STORE_NAME);
                var req = store.openCursor();
                req.onsuccess = function(e) {
                    var cursor = e.target.result;
                    if (cursor) {
                        self._cache[cursor.key] = cursor.value;
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                req.onerror = function(e) { reject(e.target.error); };
            } catch (err) {
                console.warn('[N2Store] Load error:', err);
                resolve();
            }
        });
    };

    N2Store.prototype._migrate = function() {
        if (localStorage.getItem(MIGRATION_FLAG)) return;

        var batch = [];
        var i, key, value;

        for (i = 0; i < MIGRATE_KEYS.length; i++) {
            key = MIGRATE_KEYS[i];
            value = localStorage.getItem(key);
            if (value !== null && !(key in this._cache)) {
                this._cache[key] = value;
                batch.push({ key: key, value: value });
            }
        }

        // Batch write to IDB then remove from localStorage (except critical keys)
        if (batch.length > 0 && this._db) {
            try {
                var tx = this._db.transaction(STORE_NAME, 'readwrite');
                var store = tx.objectStore(STORE_NAME);
                for (i = 0; i < batch.length; i++) {
                    store.put(batch[i].value, batch[i].key);
                }
                tx.oncomplete = function() {
                    for (var j = 0; j < batch.length; j++) {
                        // Critical keys stay in localStorage for sync access before IDB loads
                        if (!isCriticalKey(batch[j].key)) {
                            localStorage.removeItem(batch[j].key);
                        }
                    }
                    console.log('[N2Store] Migrated ' + batch.length + ' keys to IndexedDB');
                };
            } catch (err) {
                console.warn('[N2Store] Migration write error:', err);
            }
        }

        // Clean Firestore persistence keys (major space hog)
        var toClean = [];
        for (i = 0; i < localStorage.length; i++) {
            key = localStorage.key(i);
            if (key && (key.indexOf('firestore_') === 0 || key.indexOf('firebase:') === 0)) {
                toClean.push(key);
            }
        }
        for (i = 0; i < toClean.length; i++) {
            localStorage.removeItem(toClean[i]);
        }
        if (toClean.length > 0) {
            console.log('[N2Store] Cleaned ' + toClean.length + ' Firestore persistence keys');
        }

        localStorage.setItem(MIGRATION_FLAG, '1');
    };

    /**
     * Get item - sync read from memory cache, falls back to localStorage
     * @param {string} key
     * @returns {string|null}
     */
    N2Store.prototype.getItem = function(key) {
        if (key in this._cache) {
            return this._cache[key];
        }
        // Fallback to localStorage (before migration completes, or non-migrated keys)
        return localStorage.getItem(key);
    };

    /**
     * Set item - sync to cache + async to IndexedDB
     * @param {string} key
     * @param {string} value
     */
    N2Store.prototype.setItem = function(key, value) {
        this._cache[key] = value;
        if (this._dbReady && this._db) {
            try {
                var tx = this._db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put(value, key);
            } catch (e) {
                try { localStorage.setItem(key, value); } catch (e2) { /* quota full */ }
            }
            // Critical keys: also write to localStorage for sync access before IDB loads
            if (isCriticalKey(key)) {
                try { localStorage.setItem(key, value); } catch (e) { /* quota full */ }
            }
        } else {
            // IDB not ready yet, backup to localStorage
            try { localStorage.setItem(key, value); } catch (e) { /* quota full */ }
        }
    };

    /**
     * Remove item from cache, IndexedDB and localStorage
     * @param {string} key
     */
    N2Store.prototype.removeItem = function(key) {
        delete this._cache[key];
        try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
        if (this._dbReady && this._db) {
            try {
                var tx = this._db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).delete(key);
            } catch (e) { /* ignore */ }
        }
    };

    /**
     * Check if key exists
     * @param {string} key
     * @returns {boolean}
     */
    N2Store.prototype.has = function(key) {
        return (key in this._cache) || localStorage.getItem(key) !== null;
    };

    /**
     * Get all keys stored in IndexedDB cache
     * @returns {string[]}
     */
    N2Store.prototype.keys = function() {
        return Object.keys(this._cache);
    };

    /**
     * Clear all IndexedDB data
     */
    N2Store.prototype.clear = function() {
        this._cache = {};
        if (this._db) {
            try {
                var tx = this._db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).clear();
            } catch (e) { /* ignore */ }
        }
    };

    /**
     * Wait for IndexedDB to be ready
     * @returns {Promise}
     */
    N2Store.prototype.whenReady = function() {
        return this._readyPromise;
    };

    /**
     * Re-run migration (useful if localStorage was re-populated)
     */
    N2Store.prototype.reMigrate = function() {
        localStorage.removeItem(MIGRATION_FLAG);
        this._migrate();
    };

    /**
     * Get storage stats for debugging
     * @returns {object}
     */
    N2Store.prototype.getStats = function() {
        var idbSize = 0;
        var lsSize = 0;
        var key;

        for (key in this._cache) {
            if (this._cache.hasOwnProperty(key)) {
                idbSize += (this._cache[key] || '').length + key.length;
            }
        }

        for (var i = 0; i < localStorage.length; i++) {
            key = localStorage.key(i);
            if (key) {
                lsSize += (localStorage.getItem(key) || '').length + key.length;
            }
        }

        return {
            indexedDB: {
                keys: Object.keys(this._cache).length,
                sizeKB: (idbSize / 1024).toFixed(1),
                ready: this._dbReady
            },
            localStorage: {
                keys: localStorage.length,
                sizeKB: (lsSize / 1024).toFixed(1)
            }
        };
    };

    // List of managed keys (exposed for other modules)
    N2Store.MIGRATE_KEYS = MIGRATE_KEYS;
    N2Store.CRITICAL_KEYS = CRITICAL_KEYS;

    // Initialize singleton
    var store = new N2Store();
    window.n2store = store;
    window.n2storeReady = store._readyPromise;

})();
