/**
 * Firebase Configuration - Script-Tag Compatible Wrapper
 *
 * SOURCE OF TRUTH: /shared/browser/firebase-config.js (ES Module)
 *
 * This file provides window.* exports for legacy script-tag usage.
 * For ES Module usage, import from '/shared/browser/firebase-config.js'.
 *
 * Usage:
 * <script src="../shared/js/firebase-config.js"></script>
 * <script>
 *   const db = initializeFirestore();
 *   // or
 *   const rtdb = initializeRealtimeDB();
 * </script>
 */

// Firebase Configuration - Use var to allow redeclaration
var FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    databaseURL: "https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Alias for backward compatibility - Use var to allow redeclaration
var firebaseConfig = window.firebaseConfig || FIREBASE_CONFIG;

// State tracking - Use var to allow redeclaration if loaded multiple times
var _firestoreDB = _firestoreDB || null;
var _realtimeDB = _realtimeDB || null;
var _isFirebaseInitialized = _isFirebaseInitialized || false;
var _isRecoveringCache = _isRecoveringCache || false;

/**
 * Clear corrupted Firestore IndexedDB cache
 */
async function clearFirestoreCache() {
    if (_isRecoveringCache) return;
    _isRecoveringCache = true;
    try {
        var databases = await indexedDB.databases();
        var firestoreDBs = databases.filter(function(db) {
            return db.name && db.name.includes('firestore');
        });
        await Promise.all(firestoreDBs.map(function(db) {
            return new Promise(function(resolve) {
                var req = indexedDB.deleteDatabase(db.name);
                req.onsuccess = resolve;
                req.onerror = resolve;
                req.onblocked = resolve;
            });
        }));
        console.log('[Firestore] Cleared corrupted IndexedDB cache');
    } catch (e) {
        console.warn('[Firestore] Could not clear cache:', e);
    }
}

// Auto-recover from Firestore internal errors (IndexedDB corruption)
if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', function(event) {
        var msg = (event.reason && event.reason.message) || '';
        var stack = (event.reason && event.reason.stack) || '';
        if ((msg.includes('INTERNAL ASSERTION FAILED') ||
             (msg.includes('Cannot read properties of null') && stack.includes('firestore'))) &&
            !_isRecoveringCache) {
            console.error('[Firestore] Detected corrupted persistence, clearing cache...');
            event.preventDefault();
            clearFirestoreCache().then(function() { window.location.reload(); });
        }
    });
}

/**
 * Initialize Firebase app (core)
 */
function initializeFirebaseApp() {
    try {
        if (typeof firebase === 'undefined') {
            console.error('[Firebase] SDK not loaded');
            return false;
        }

        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
            // Firebase initialized
        }

        _isFirebaseInitialized = true;
        return true;
    } catch (error) {
        console.error('[Firebase] Initialization error:', error);
        return false;
    }
}

/**
 * Initialize Firestore with offline persistence
 */
function initializeFirestore(options = {}) {
    const { enablePersistence = true, synchronizeTabs = true } = options;

    if (_firestoreDB) return _firestoreDB;
    if (!initializeFirebaseApp()) return null;

    try {
        _firestoreDB = firebase.firestore();

        if (enablePersistence) {
            try {
                _firestoreDB.enablePersistence({ synchronizeTabs })
                    .then(() => {})
                    .catch((err) => {
                        if (err.code === 'failed-precondition') {
                            console.warn('[Firestore] Multiple tabs open, persistence in first tab only');
                        } else if (err.code === 'unimplemented') {
                            console.warn('[Firestore] Browser does not support persistence');
                        } else {
                            console.error('[Firestore] Persistence error, clearing corrupted cache:', err);
                            clearFirestoreCache().then(function() { window.location.reload(); });
                        }
                    });
            } catch (e) {
                console.warn('[Firestore] Persistence already enabled or unavailable');
            }
        }

        window.db = _firestoreDB;
        // Firestore initialized
        return _firestoreDB;
    } catch (error) {
        console.error('[Firestore] Initialization error:', error);
        return null;
    }
}

/**
 * Initialize Firebase Realtime Database
 */
function initializeRealtimeDB() {
    if (_realtimeDB) return _realtimeDB;
    if (!initializeFirebaseApp()) return null;

    try {
        _realtimeDB = firebase.database();
        console.log('[RealtimeDB] Initialized successfully');
        return _realtimeDB;
    } catch (error) {
        console.error('[RealtimeDB] Initialization error:', error);
        return null;
    }
}

/**
 * Get Firestore instance (initializes if needed)
 */
function getFirestore() {
    return _firestoreDB || initializeFirestore();
}

/**
 * Get Realtime Database instance (initializes if needed)
 */
function getRealtimeDB() {
    return _realtimeDB || initializeRealtimeDB();
}

/**
 * Check if Firebase is initialized
 */
function isFirebaseInitialized() {
    return _isFirebaseInitialized;
}

/**
 * Get a reference to a path in Realtime Database
 */
function getRef(path) {
    const db = getRealtimeDB();
    if (!db) return null;
    return db.ref(path);
}

/**
 * Common collection/path names - Use var to allow redeclaration
 */
var FIRESTORE_COLLECTIONS = FIRESTORE_COLLECTIONS || {
    INVENTORY: 'inventory',
    LOGS: 'logs',
    SETTINGS: 'settings',
};

var RTDB_PATHS = RTDB_PATHS || {
    SOLUONG_PRODUCTS: 'soluongProducts',
    SOLUONG_META: 'soluongProductsMeta',
    ORDER_PRODUCTS: 'orderProducts',
    ORDER_META: 'orderProductsMeta',
    ISSUE_TRACKING: 'issue_tracking',
};

// Global exports
if (typeof window !== 'undefined') {
    window.FIREBASE_CONFIG = FIREBASE_CONFIG;
    window.firebaseConfig = firebaseConfig;
    window.initializeFirebaseApp = initializeFirebaseApp;
    window.initializeFirestore = initializeFirestore;
    window.initializeRealtimeDB = initializeRealtimeDB;
    window.getFirestore = getFirestore;
    window.getRealtimeDB = getRealtimeDB;
    window.isFirebaseInitialized = isFirebaseInitialized;
    window.getRef = getRef;
    window.FIRESTORE_COLLECTIONS = FIRESTORE_COLLECTIONS;
    window.RTDB_PATHS = RTDB_PATHS;
}

// Module exports (for future bundling)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FIREBASE_CONFIG,
        firebaseConfig,
        initializeFirebaseApp,
        initializeFirestore,
        initializeRealtimeDB,
        getFirestore,
        getRealtimeDB,
        isFirebaseInitialized,
        getRef,
        FIRESTORE_COLLECTIONS,
        RTDB_PATHS,
    };
}


// Auto-initialize Firebase when script loads
if (typeof firebase !== 'undefined') {
    initializeFirebaseApp();
    initializeFirestore();
}
