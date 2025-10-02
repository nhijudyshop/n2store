// =====================================================
// CONFIGURATION & CONSTANTS
// =====================================================

const CONFIG = {
    // Firebase Configuration
    firebase: {
        apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
        authDomain: "n2shop-69e37.firebaseapp.com",
        projectId: "n2shop-69e37",
        storageBucket: "n2shop-69e37-ne0q1",
        messagingSenderId: "598906493303",
        appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
        measurementId: "G-TEJH3S2T1D",
    },

    // Cache Settings
    cache: {
        expiry: 24 * 60 * 60 * 1000,
        batchSize: 50,
        maxVisibleRows: 500,
        filterDebounceDelay: 300,
    },

    // Performance Settings - IMAGE COMPRESSION
    performance: {
        imageCompression: {
            thumbnail: {
                maxWidth: 300,
                maxHeight: 300,
                quality: 0.6,
            },
            preview: {
                maxWidth: 600,
                maxHeight: 600,
                quality: 0.7,
            },
            storage: {
                maxWidth: 1200,
                maxHeight: 1200,
                quality: 0.75,
            },
        },
        lazyLoadOffset: 100,
        virtualScrollThreshold: 100,
        useWebP: true,
    },

    // UI Settings
    ui: {
        animationDuration: 300,
        toastDuration: 3000,
        hoverDelay: 150,
    },
};

// Application Constants
const APP_CONFIG = {
    CACHE_EXPIRY: CONFIG.cache.expiry,
    MAX_VISIBLE_ROWS: CONFIG.cache.maxVisibleRows,
    FILTER_DEBOUNCE_DELAY: CONFIG.cache.filterDebounceDelay,
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

// Initialize Firebase
const app = firebase.initializeApp(CONFIG.firebase);
const db = firebase.firestore();
const collectionRef = db.collection("dathang");
const historyCollectionRef = db.collection("edit_history");

// Export for use in other modules
window.CONFIG = CONFIG;

console.log("Configuration loaded successfully");
