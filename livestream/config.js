// config.js - Configuration & Initialization
// Livestream Report Management System

// =====================================================
// CONFIGURATION & INITIALIZATION
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

// Cache configuration - using in-memory storage
const CACHE_EXPIRY = 10 * 60 * 1000; // 10 minutes
const BATCH_SIZE = 50; // Smaller batch size for better performance
const MAX_VISIBLE_ROWS = 500; // Reduced limit
const FILTER_DEBOUNCE_DELAY = 500; // Increased delay

// In-memory cache object
let memoryCache = {
    data: null,
    timestamp: null,
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
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

// Global variables
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

// User authentication state - using consistent storage
const AUTH_STORAGE_KEY = "loginindex_auth";
let authState = null;

// =====================================================
// AUTHENTICATION FUNCTIONS
// =====================================================

function getAuthState() {
    try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
            authState = JSON.parse(stored);
            return authState;
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
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userType");
        localStorage.removeItem("checkLogin");
        sessionStorage.clear();
    } catch (error) {
        console.error("Error clearing auth state:", error);
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

// =====================================================
// CACHE FUNCTIONS
// =====================================================

function getCachedData() {
    try {
        if (memoryCache.data && memoryCache.timestamp) {
            if (Date.now() - memoryCache.timestamp < CACHE_EXPIRY) {
                console.log("Using cached data");
                return memoryCache.data;
            } else {
                console.log("Cache expired, clearing");
                invalidateCache();
            }
        }
    } catch (e) {
        console.warn("Error accessing cache:", e);
        invalidateCache();
    }
    return null;
}

function setCachedData(data) {
    try {
        memoryCache.data = Array.isArray(data) ? [...data] : data;
        memoryCache.timestamp = Date.now();
        console.log("Data cached successfully");
    } catch (e) {
        console.warn("Cannot cache data:", e);
    }
}

function invalidateCache() {
    memoryCache.data = null;
    memoryCache.timestamp = null;
    console.log("Cache invalidated");
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>\"']/g, "").trim();
}

function numberWithCommas(x) {
    if (x === 0 || x === "0") return "0";
    if (!x && x !== 0) return "0";
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDate(date) {
    if (!date || !(date instanceof Date)) return "";

    const year = date.getFullYear() % 100;
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${day}-${month}-${year}`;
}

// Enhanced formatDate function to include time period
function formatDateWithPeriod(date, startTime = null) {
    if (!date || !(date instanceof Date)) return "";

    const year = date.getFullYear() % 100;
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const baseDate = `${day}-${month}-${year}`;

    // If no start time provided, return basic date
    if (!startTime) return baseDate;

    // Parse start time to get hour
    const timeParts = startTime.split(":");
    if (timeParts.length !== 2) return baseDate;

    const startHour = parseInt(timeParts[0]);
    if (isNaN(startHour)) return baseDate;

    // Determine time period
    let period = "";
    if (startHour >= 6 && startHour < 12) {
        period = " (Sáng)";
    } else if (startHour >= 12 && startHour < 18) {
        period = " (Chiều)";
    } else {
        period = " (Tối)";
    }

    return baseDate + period;
}

function parseDisplayDate(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return null;

    // Remove time period suffix if present
    let cleanDateStr = dateStr;
    const periodPattern = /\s*\((Sáng|Chiều|Tối)\)$/;
    const match = dateStr.match(periodPattern);
    if (match) {
        cleanDateStr = dateStr.replace(periodPattern, "").trim();
    }

    const parts = cleanDateStr.split("-");
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    let year = parseInt(parts[2]);

    if (year < 100) {
        year = year < 50 ? 2000 + year : 1900 + year;
    }

    const result = new Date(year, month, day);
    return isNaN(result.getTime()) ? null : result;
}

function convertToTimestamp(dateString) {
    const tempTimeStamp = new Date();
    const parts = dateString.split("-");

    if (parts.length !== 3) {
        throw new Error("Invalid date format. Expected DD-MM-YY");
    }

    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    let year = parseInt(parts[2]);

    if (year < 100) {
        year = 2000 + year;
    }

    const dateObj = new Date(year, month - 1, day);
    const timestamp =
        dateObj.getTime() +
        (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;

    return timestamp.toString();
}

function generateUniqueId() {
    return Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

// =====================================================
// LOGGING FUNCTIONS
// =====================================================

function logAction(
    action,
    description,
    oldData = null,
    newData = null,
    pageName = "Báo cáo Livestream",
) {
    const auth = getAuthState();
    const logEntry = {
        timestamp: new Date(),
        user: auth
            ? auth.userType
                ? auth.userType.split("-")[0]
                : "Unknown"
            : "Unknown",
        page: pageName,
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: generateUniqueId(),
    };

    historyCollectionRef
        .add(logEntry)
        .then(() => {
            console.log("Log entry saved successfully");
        })
        .catch((error) => {
            console.error("Error saving log entry: ", error);
        });
}

// =====================================================
// LOGOUT FUNCTION
// =====================================================

function handleLogout() {
    const confirmLogout = confirm("Bạn có chắc muốn đăng xuất?");
    if (confirmLogout) {
        clearAuthState();
        invalidateCache();
        window.location.href = "../index.html";
    }
}

// Global error handler
window.addEventListener("error", function (e) {
    console.error("Global error:", e.error);
    showError("Có lỗi xảy ra. Vui lòng tải lại trang.");
});

// These functions will be defined in other files
// Just declare them as placeholders to avoid reference errors
window.closeModal = function () {
    console.log("closeModal not yet loaded");
};
window.saveUpdatedChanges = function () {
    console.log("saveUpdatedChanges not yet loaded");
};
window.exportToExcel = function () {
    console.log("exportToExcel not yet loaded");
};
