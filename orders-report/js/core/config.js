// js/config.js - Configuration & Firebase Setup

// firebaseConfig is provided by ../shared/js/firebase-config.js (loaded via core-loader.js)

// Application Configuration
const APP_CONFIG = {
    CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    BATCH_SIZE: 50,
    MAX_VISIBLE_ROWS: 500,
    FILTER_DEBOUNCE_DELAY: 500,
    AUTH_STORAGE_KEY: "loginindex_auth",
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const app = firebase.app(); // Get the default app

// Safely initialize services
const db = (function () {
    try {
        if (firebase.firestore) {
            return firebase.firestore();
        }
        console.warn("Firestore SDK not loaded");
        return null;
    } catch (e) {
        console.warn("Error initializing Firestore:", e);
        return null;
    }
})();

const storageRef = (function () {
    try {
        if (firebase.storage) {
            return firebase.storage().ref();
        }
        return null;
    } catch (e) {
        return null;
    }
})();

const collectionRef = db ? db.collection("livestream_reports") : null;
const historyCollectionRef = db ? db.collection("edit_history") : null;

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
