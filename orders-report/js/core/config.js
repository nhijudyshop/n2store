// js/config.js - Configuration & Firebase Setup

// Application Configuration
const APP_CONFIG = {
    CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    BATCH_SIZE: 50,
    MAX_VISIBLE_ROWS: 500,
    FILTER_DEBOUNCE_DELAY: 500,
    AUTH_STORAGE_KEY: "loginindex_auth",
};

// Firebase config fallback (if not loaded from shared/js/firebase-config.js)
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

// Global Firebase references
let app = null;
let db = null;
let storageRef = null;
let collectionRef = null;
let historyCollectionRef = null;

// Initialize Firebase function
function initializeFirebase() {
    if (typeof firebase === 'undefined') {
        console.warn('[Config] Firebase SDK not loaded yet');
        return false;
    }

    // Get config from various sources
    const config = (typeof FIREBASE_CONFIG !== 'undefined') ? FIREBASE_CONFIG
        : (typeof firebaseConfig !== 'undefined') ? firebaseConfig
        : FIREBASE_CONFIG_FALLBACK;

    try {
        // Initialize Firebase app
        app = !firebase.apps.length ? firebase.initializeApp(config) : firebase.app();

        // Safely initialize Firestore
        if (firebase.firestore) {
            try {
                db = firebase.firestore();
                collectionRef = db.collection("livestream_reports");
                historyCollectionRef = db.collection("edit_history");
            } catch (e) {
                console.warn("[Config] Error initializing Firestore:", e);
            }
        }

        // Safely initialize Storage
        if (firebase.storage) {
            try {
                storageRef = firebase.storage().ref();
            } catch (e) {
                console.warn("[Config] Error initializing Storage:", e);
            }
        }

        // Export to window
        window.db = db;
        window.collectionRef = collectionRef;
        window.historyCollectionRef = historyCollectionRef;
        window.storageRef = storageRef;

        console.log('[Config] Firebase initialized successfully');
        return true;
    } catch (error) {
        console.error('[Config] Firebase init error:', error);
        return false;
    }
}

// Try to initialize immediately if Firebase is available
if (typeof firebase !== 'undefined') {
    initializeFirebase();
} else {
    // Wait for Firebase SDK to load
    console.log('[Config] Waiting for Firebase SDK...');
    window.addEventListener('DOMContentLoaded', () => {
        if (!initializeFirebase()) {
            // Retry after a short delay
            setTimeout(initializeFirebase, 500);
        }
    });
}

// DOM Elements - Safely get elements if they exist
const livestreamForm = document.getElementById("livestreamForm");
const tableBody = document.getElementById("tableBody");
const toggleFormButton = document.getElementById("toggleFormButton");
const dataForm = document.getElementById("dataForm");
const ngayLive = document.getElementById("ngayLive");
const editModal = document.getElementById("editModal");

// Global Variables
let editingRow = null;
let arrayData = [];
let arrayDate = [];
let currentFilters = {
    startDate: null,
    endDate: null,
    status: "all",
};
let filterTimeout = null;
let isFilteringInProgress = false;
let filteredDataForTotal = [];

// Export for global access
window.APP_CONFIG = APP_CONFIG;
window.db = db;
window.collectionRef = collectionRef;
window.historyCollectionRef = historyCollectionRef;
