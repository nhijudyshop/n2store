// Enhanced Goods Receipt Management System - Configuration
// Firebase config and global constants

// =====================================================
// CONFIGURATION & INITIALIZATION
// =====================================================

// Cache configuration - using in-memory storage instead of localStorage
const CACHE_KEY = "loginindex_auth";
const CACHE_EXPIRY = 10 * 60 * 1000; // 10 minutes
const BATCH_SIZE = 50;
const MAX_VISIBLE_ROWS = 500;
const FILTER_DEBOUNCE_DELAY = 500;

// UI Configuration - ADD THIS
const CONFIG = {
    ui: {
        toastDuration: 3000, // Duration for toast messages
        animationDuration: 300, // Animation duration in ms
        hoverDelay: 500, // Delay before showing image hover
    },
};

// In-memory cache object
let memoryCache = {
    data: null,
    timestamp: null,
};

// Create file metadata to update
var newMetadata = {
    cacheControl: "public,max-age=31536000",
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
const collectionRef = db.collection("nhanhang");
const historyCollectionRef = db.collection("edit_history");

// =====================================================
// DOM ELEMENTS
// =====================================================

// Main elements
const tbody = document.getElementById("receiptTableBody");
const receiptForm = document.getElementById("receiptForm");
const tenNguoiNhanInput = document.getElementById("tenNguoiNhan");
const soKgInput = document.getElementById("soKg");
const soKienInput = document.getElementById("soKien");

// Camera elements
const cameraPreview = document.getElementById("cameraPreview");
const cameraVideo = document.getElementById("cameraVideo");
const cameraCanvas = document.getElementById("cameraCanvas");
const startCameraButton = document.getElementById("startCamera");
const takePictureButton = document.getElementById("takePicture");
const retakePictureButton = document.getElementById("retakePicture");
const imageDisplayArea = document.getElementById("imageDisplayArea");

// Edit modal elements
const editModal = document.getElementById("editModal");
const editForm = document.getElementById("editForm");
const editReceiptId = document.getElementById("editReceiptId");
const editTenNguoiNhanInput = document.getElementById("editTenNguoiNhan");
const editSoKgInput = document.getElementById("editSoKg");
const editSoKienInput = document.getElementById("editSoKien");
const closeEditModal = document.getElementById("closeEditModal");
const cancelEditButton = document.getElementById("cancelEditButton");
const updateButton = document.getElementById("updateButton");

// Edit camera elements
const editCameraPreview = document.getElementById("editCameraPreview");
const editCameraVideo = document.getElementById("editCameraVideo");
const editCameraCanvas = document.getElementById("editCameraCanvas");
const editStartCameraButton = document.getElementById("editStartCamera");
const editTakePictureButton = document.getElementById("editTakePicture");
const editRetakePictureButton = document.getElementById("editRetakePicture");
const editKeepCurrentImageButton = document.getElementById(
    "editKeepCurrentImage",
);
const editImageDisplayArea = document.getElementById("editImageDisplayArea");
const currentImageContainer = document.getElementById("currentImageContainer");

// Filter elements
const filterUserSelect = document.getElementById("filterUser");
const dateFilterSelect = document.getElementById("dateFilter");

// =====================================================
// GLOBAL VARIABLES
// =====================================================

// Image handling
var capturedImageUrl = null;
var capturedImageBlob = null;
var editCapturedImageUrl = null;
var editCapturedImageBlob = null;
var editKeepCurrentImage = false;
var editCurrentImageUrl = null;

// Camera streams
var cameraStream = null;
var editCameraStream = null;

// Form state
let editingRow = null;
let currentFilters = {
    user: "all",
    date: "all",
    weight: "",
};
let filterTimeout = null;
let isFilteringInProgress = false;

// =====================================================
// AUTHENTICATION SYSTEM
// =====================================================

const AUTH_STORAGE_KEY = "loginindex_auth";
let authState = null;

function getAuthState() {
    try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
            authState = JSON.parse(stored);
            return authState;
        }

        const legacyLogin =
            localStorage.getItem("isLoggedIn") ||
            sessionStorage.getItem("isLoggedIn");
        const legacyUserType =
            localStorage.getItem("userType") ||
            sessionStorage.getItem("userType");
        const legacyCheckLogin =
            localStorage.getItem("checkLogin") ||
            sessionStorage.getItem("checkLogin");

        if (legacyLogin) {
            const migratedAuth = {
                isLoggedIn: legacyLogin,
                userType: legacyUserType,
                checkLogin: legacyCheckLogin,
                timestamp: Date.now(),
            };
            setAuthState(legacyLogin, legacyUserType, legacyCheckLogin);
            clearLegacyAuth();
            return migratedAuth;
        }
    } catch (error) {
        console.error("Error reading auth state:", error);
        clearAuthState();
    }
    return null;
}

function setAuthState(isLoggedIn, userType, checkLogin) {
    authState = {
        isLoggedIn: isLoggedIn,
        userType: userType,
        checkLogin: checkLogin,
        timestamp: Date.now(),
    };

    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
    } catch (error) {
        console.error("Error saving auth state:", error);
    }
}

function clearAuthState() {
    authState = null;
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        clearLegacyAuth();
    } catch (error) {
        console.error("Error clearing auth state:", error);
    }
}

function clearLegacyAuth() {
    try {
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userType");
        localStorage.removeItem("checkLogin");
        sessionStorage.clear();
    } catch (error) {
        console.error("Error clearing legacy auth:", error);
    }
}

function isAuthenticated() {
    const auth = getAuthState();
    return auth && auth.isLoggedIn === "true";
}

function hasPermission(requiredLevel) {
    const auth = getAuthState();
    if (!auth) return false;

    const userLevel = parseInt(auth.checkLogin);
    return userLevel <= requiredLevel;
}

function getUserName() {
    const auth = getAuthState();
    return auth && auth.userType ? auth.userType.split("-")[0] : "Unknown";
}

// =====================================================
// AUTH MANAGER OBJECT FOR NAVIGATION
// =====================================================

const authManager = {
    isAuthenticated: function () {
        return isAuthenticated();
    },

    getAuthState: function () {
        return getAuthState();
    },

    hasPermission: function (requiredLevel) {
        return hasPermission(requiredLevel);
    },

    logout: function () {
        if (confirm("Bạn có chắc muốn đăng xuất?")) {
            clearAuthState();
            window.location.href = "../index.html";
        }
    },

    getUserInfo: function () {
        return getAuthState();
    },
};

// Make it globally available
window.authManager = authManager;
