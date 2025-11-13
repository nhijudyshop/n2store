// =====================================================
// CONFIGURATION FOR HIDDEN PRODUCTS PAGE
// =====================================================

const CONFIG = {
    // Firebase Configuration
    firebase: {
        apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
        authDomain: "n2shop-69e37.firebaseapp.com",
        projectId: "n2shop-69e37",
        databaseURL: "https://n2shop-69e37-default-rtdb.firebaseio.com",
        storageBucket: "n2shop-69e37-ne0q1",
        messagingSenderId: "598906493303",
        appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
        measurementId: "G-TEJH3S2T1D",
    },

    // Filter Settings
    filter: {
        debounceDelay: 300,
    },

    // UI Settings
    ui: {
        animationDuration: 300,
        toastDuration: 3000,
    },
};

// Application Constants
const APP_CONFIG = {
    FILTER_DEBOUNCE_DELAY: CONFIG.filter.debounceDelay,
    AUTH_STORAGE_KEY: "loginindex_auth",
};

// Global State
let globalState = {
    hiddenProducts: [],
    filteredProducts: [],
    isLoading: false,
    currentFilters: {
        search: "",
        hiddenDate: "all",
        sortBy: "newest",
    },
};

// Initialize Firebase
let app, database;

try {
    app = firebase.initializeApp(CONFIG.firebase);
    database = firebase.database();
    console.log("✅ Firebase initialized successfully");
} catch (error) {
    console.error("❌ Firebase initialization error:", error);
}

// Export for use in other modules
window.CONFIG = CONFIG;
window.APP_CONFIG = APP_CONFIG;
window.globalState = globalState;
window.database = database;

console.log("✅ Hidden Products Configuration loaded");
