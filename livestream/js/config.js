// js/config.js - Configuration & Firebase Setup

// Application Configuration
const APP_CONFIG = {
    CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    BATCH_SIZE: 50,
    MAX_VISIBLE_ROWS: 500,
    FILTER_DEBOUNCE_DELAY: 500,
    AUTH_STORAGE_KEY: "loginindex_auth",
};

// Firebase references (initialized after core utilities load)
let app = null;
let db = null;
let storageRef = null;
let collectionRef = null;
let historyCollectionRef = null;

// DOM Elements
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

// Initialize Firebase when ready
function initializeFirebase() {
    if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
        console.warn('[Config] Waiting for Firebase and config...');
        return false;
    }

    try {
        app = !firebase.apps.length ? firebase.initializeApp(firebaseConfig) : firebase.app();
        db = firebase.firestore();
        storageRef = firebase.storage().ref();
        collectionRef = db.collection("livestream_reports");
        historyCollectionRef = db.collection("edit_history");

        // Export for global access
        window.db = db;
        window.collectionRef = collectionRef;
        window.historyCollectionRef = historyCollectionRef;
        window.arrayData = arrayData;

        console.log('[Config] Firebase initialized successfully');
        return true;
    } catch (error) {
        console.error('[Config] Firebase init error:', error);
        return false;
    }
}

// Try to initialize immediately or wait for core utilities
if (!initializeFirebase()) {
    document.addEventListener('coreUtilitiesLoaded', function() {
        initializeFirebase();
    });
}

// Export for global access
window.APP_CONFIG = APP_CONFIG;
window.arrayData = arrayData;
