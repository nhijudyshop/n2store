// =====================================================
// CONFIGURATION & CONSTANTS
// =====================================================

// firebaseConfig is provided by ../shared/js/firebase-config.js (loaded via core-loader.js)

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

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const collectionRef = db.collection("dathang");
const historyCollectionRef = db.collection("edit_history");

console.log("Configuration loaded successfully");
