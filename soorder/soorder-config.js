// =====================================================
// CONFIGURATION & INITIALIZATION
// File: soorder-config.js
// =====================================================

const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Cache configuration
const CACHE_EXPIRY = 24 * 60 * 60 * 1000;
const FILTER_DEBOUNCE_DELAY = 300;

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Collections
const ordersCollectionRef = db.collection("soorder");
const offDaysCollectionRef = db.collection("soorder_off_days");
const historyCollectionRef = db.collection("soorder_edit_history");

// Global variables
let allOrders = [];
let filteredOrders = [];
let searchFilter = "";
let filterTimeout = null;
let currentOffDays = new Map(); // Map of date -> offDay info

// Export for other modules
window.SoOrderConfig = {
    firebaseConfig,
    CACHE_EXPIRY,
    FILTER_DEBOUNCE_DELAY,
    app,
    db,
    ordersCollectionRef,
    offDaysCollectionRef,
    historyCollectionRef,
    allOrders,
    filteredOrders,
    searchFilter,
    filterTimeout,
    currentOffDays,
    // DOM elements - will be set after DOM ready
    tbody: null,
    searchInput: null,
    dateFilterDropdown: null,
    filterNCCSelect: null,
    filterPhanLoaiSelect: null,
    filterThanhToanSelect: null,
    btnAddOrder: null,
    btnManageOffDays: null,
};
