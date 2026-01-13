// =====================================================
// CONFIGURATION & CONSTANTS
// =====================================================

// Application Constants
const APP_CONFIG = {
    CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    MAX_VISIBLE_ROWS: 500,
    FILTER_DEBOUNCE_DELAY: 500,
    AUTH_STORAGE_KEY: "loginindex_auth",
};

// Global Variables
let globalState = {
    inventoryData: [],
    filteredData: [],
    isLoading: false,
    currentFilters: {
        supplier: "all",
        dateFrom: "",
        dateTo: "",
        product: "",
    },
};

// Firebase references (initialized later)
let app = null;
let db = null;
let collectionRef = null;
let historyCollectionRef = null;

// Firebase config fallback
const FIREBASE_CONFIG_FALLBACK = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    databaseURL: "https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Initialize Firebase
function initializeFirebase() {
    if (typeof firebase === 'undefined') {
        console.warn('[Config] Firebase SDK not loaded');
        return false;
    }

    const config = (typeof FIREBASE_CONFIG !== 'undefined') ? FIREBASE_CONFIG
        : (typeof firebaseConfig !== 'undefined') ? firebaseConfig
        : FIREBASE_CONFIG_FALLBACK;

    try {
        app = !firebase.apps.length ? firebase.initializeApp(config) : firebase.app();
        db = firebase.firestore();
        collectionRef = db.collection("dathang");
        historyCollectionRef = db.collection("edit_history");

        // Export to window
        window.db = db;
        window.collectionRef = collectionRef;
        window.historyCollectionRef = historyCollectionRef;

        console.log('[Config] Firebase initialized successfully');
        return true;
    } catch (error) {
        console.error('[Config] Firebase init error:', error);
        return false;
    }
}

// Try initialize immediately
if (!initializeFirebase()) {
    // Wait for shared modules to load
    window.addEventListener('sharedModulesLoaded', initializeFirebase);
}

// Export to window
window.APP_CONFIG = APP_CONFIG;
window.globalState = globalState;

console.log("[Config] Configuration loaded");
