// Order Management System - Configuration and Initialization
// Firebase and global configuration

// =====================================================
// CONFIGURATION & INITIALIZATION
// =====================================================

// Cache configuration
const CACHE_KEY = "dathang_data_cache";
const CACHE_EXPIRY = 10 * 60 * 1000; // 10 minutes
const BATCH_SIZE = 50;
const MAX_VISIBLE_ROWS = 500;
const FILTER_DEBOUNCE_DELAY = 500;

// In-memory cache object
let memoryCache = {
    data: null,
    timestamp: null,
};

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storageRef = firebase.storage().ref();
const collectionRef = db.collection("dathang");
const historyCollectionRef = db.collection("edit_history");

// Create file metadata
var newMetadata = {
    cacheControl: "public,max-age=31536000",
};

// DOM Elements
const tbody = document.getElementById("orderTableBody");
const ngayDatHangInput = document.getElementById("ngayDatHang");
const nhaCungCapInput = document.getElementById("nhaCungCap");
const hoaDonInput = document.getElementById("hoaDon");

// Image containers
const invoiceClipboardContainer = document.getElementById(
    "invoiceClipboardContainer",
);

// Filter elements
const filterSupplierSelect = document.getElementById("filterSupplier");
const dateFilterSelect = document.getElementById("dateFilter");
const filterProductInput = document.getElementById("filterProduct");

// Global variables
var invoiceImgArray = [];
var productImgArray = [];
var priceImgArray = [];
let productCounter = 0;
let editingRow = null;
let currentFilters = {
    supplier: "all",
    date: "all",
    product: "",
};
let filterTimeout = null;
let isFilteringInProgress = false;

console.log("Order Management System - Configuration loaded");
