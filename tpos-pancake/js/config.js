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

// Initialize Firebase (using global firebaseConfig)
if (!firebase.apps.length) {
    firebase.initializeApp((typeof FIREBASE_CONFIG !== 'undefined') ? FIREBASE_CONFIG : (typeof firebaseConfig !== 'undefined') ? firebaseConfig : {apiKey:"AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",authDomain:"n2shop-69e37.firebaseapp.com",projectId:"n2shop-69e37",storageBucket:"n2shop-69e37-ne0q1",messagingSenderId:"598906493303",appId:"1:598906493303:web:46d6236a1fdc2eff33e972"});
}
const app = firebase.app();
const db = firebase.firestore();
const database = firebase.database(); // Realtime Database for Pancake accounts
const storageRef = firebase.storage().ref();
const collectionRef = db.collection("livestream_reports");
const historyCollectionRef = db.collection("edit_history");

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

// Export for global access
window.APP_CONFIG = APP_CONFIG;
window.db = db;
window.collectionRef = collectionRef;
window.historyCollectionRef = historyCollectionRef;
