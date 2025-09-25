// Enhanced Inventory Management System - Part 1
// Utility functions and configuration for inventory tracking

// =====================================================
// CONFIGURATION & INITIALIZATION
// =====================================================

// Cache configuration - using in-memory storage instead of localStorage
const CACHE_KEY = 'inventory_data_cache';
const CACHE_EXPIRY = 10 * 60 * 1000; // 10 minutes
const BATCH_SIZE = 50; // Smaller batch size for better performance
const MAX_VISIBLE_ROWS = 500; // Reduced limit
const FILTER_DEBOUNCE_DELAY = 500; // Increased delay

// Add CSS to hide number input spinners globally
const hideSpinnerStyles = `
<style>
/* Hide number input spinners for all browsers */
input[type=number]::-webkit-outer-spin-button,
input[type=number]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

input[type=number] {
    -moz-appearance: textfield;
    appearance: none;
}

/* Style for quantity inputs */
input[type=number].quantity-input, input[type=number].received-input, input[type=number].total-input {
    width: 80px;
    padding: 4px;
    border: 1px solid #ddd;
    border-radius: 3px;
    text-align: center;
}

/* Style for edit and delete buttons */
.edit-button, .delete-button {
    padding: 4px 8px;
    margin: 2px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
}

.edit-button {
    background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
    color: white;
}

.edit-button:hover {
    background: linear-gradient(135deg, #0056b3 0%, #004085 100%);
}

.delete-button {
    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
    color: white;
}

.delete-button:hover {
    background: linear-gradient(135deg, #c82333 0%, #a71e2a 100%);
}

.button-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
}

.inventory-row.editing {
    background-color: #fff3cd !important;
}

.inventory-row.editing input {
    background-color: #ffffff;
    border-color: #ffc107;
}
</style>
`;

// Add styles to head if not already present
if (!document.getElementById('hideSpinnerStyles')) {
    const styleElement = document.createElement('div');
    styleElement.id = 'hideSpinnerStyles';
    styleElement.innerHTML = hideSpinnerStyles;
    document.head.appendChild(styleElement);
}

// In-memory cache object (replaces localStorage)
let memoryCache = {
    data: null,
    timestamp: null
};

// Create file metadata to update
var newMetadata = {
    cacheControl: 'public,max-age=31536000',
}

const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com", 
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storageRef = firebase.storage().ref();
const collectionRef = db.collection("dathang");
const inventoryCollectionRef = db.collection("inventory");
const historyCollectionRef = db.collection("edit_history");

// DOM Elements
const tbody = document.getElementById('orderTableBody');
const filterSupplierSelect = document.getElementById('filterSupplier');
const dateFilterSelect = document.getElementById('dateFilter');
const filterProductInput = document.getElementById('filterProduct');

// Global variables
let editingRow = null;
let currentFilters = {
    supplier: 'all',
    date: 'all',
    product: ''
};
let filterTimeout = null;
let isFilteringInProgress = false;

// =====================================================
// AUTHENTICATION SYSTEM (Same as order system)
// =====================================================

// User authentication state - using consistent storage
const AUTH_STORAGE_KEY = 'bangkiemhangindex_auth';
let authState = null;

function getAuthState() {
    try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
            authState = JSON.parse(stored);
            return authState;
        }
        
        // Fallback to legacy system for compatibility
        const legacyLogin = localStorage.getItem('isLoggedIn') || sessionStorage.getItem('isLoggedIn');
        const legacyUserType = localStorage.getItem('userType') || sessionStorage.getItem('userType');
        const legacyCheckLogin = localStorage.getItem('checkLogin') || sessionStorage.getItem('checkLogin');
        
        if (legacyLogin) {
            const migratedAuth = {
                isLoggedIn: legacyLogin,
                userType: legacyUserType,
                checkLogin: legacyCheckLogin,
                timestamp: Date.now()
            };
            setAuthState(legacyLogin, legacyUserType, legacyCheckLogin);
            clearLegacyAuth();
            return migratedAuth;
        }
    } catch (error) {
        console.error('Error reading auth state:', error);
        clearAuthState();
    }
    return null;
}

function setAuthState(isLoggedIn, userType, checkLogin) {
    authState = {
        isLoggedIn: isLoggedIn,
        userType: userType,
        checkLogin: checkLogin,
        timestamp: Date.now()
    };
    
    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
    } catch (error) {
        console.error('Error saving auth state:', error);
    }
}

function clearAuthState() {
    authState = null;
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        clearLegacyAuth();
    } catch (error) {
        console.error('Error clearing auth state:', error);
    }
}

function clearLegacyAuth() {
    try {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userType'); 
        localStorage.removeItem('checkLogin');
        sessionStorage.clear();
    } catch (error) {
        console.error('Error clearing legacy auth:', error);
    }
}

function isAuthenticated() {
    const auth = getAuthState();
    return auth && auth.isLoggedIn === 'true';
}

function hasPermission(requiredLevel) {
    const auth = getAuthState();
    if (!auth) return false;
    
    const userLevel = parseInt(auth.checkLogin);
    return userLevel <= requiredLevel; // Lower number = higher permission
}

function getUserName() {
    const auth = getAuthState();
    return auth && auth.userType ? auth.userType.split('-')[0] : 'Unknown';
}

// =====================================================
// ENHANCED CACHE FUNCTIONS
// =====================================================

function getCachedData() {
    try {
        if (memoryCache.data && memoryCache.timestamp) {
            if (Date.now() - memoryCache.timestamp < CACHE_EXPIRY) {
                console.log("Using cached inventory data");
                return [...memoryCache.data];
            } else {
                console.log("Cache expired, clearing");
                invalidateCache();
            }
        }
    } catch (e) {
        console.warn('Error accessing cache:', e);
        invalidateCache();
    }
    return null;
}

function setCachedData(data) {
    try {
        memoryCache.data = [...data];
        memoryCache.timestamp = Date.now();
        console.log("Inventory data cached successfully");
    } catch (e) {
        console.warn('Cannot cache data:', e);
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
    if (typeof input !== 'string') return '';
    return input.replace(/[<>"'&]/g, '').trim(); // Enhanced XSS protection
}

function numberWithCommas(x) {
    if (!x && x !== 0) return '0';
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDate(date) {
    if (!date || !(date instanceof Date)) return '';
    
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${day}/${month}/${year}`;
}

function formatCurrency(amount) {
    if (!amount && amount !== 0) return '0 ₫';
    return numberWithCommas(amount) + ' ₫';
}

// Debounced function factory
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// =====================================================
// ID GENERATION SYSTEM
// =====================================================

function generateUniqueID() {
    // Create unique ID based on timestamp and random
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `inv_${timestamp}_${random}`;
}

// =====================================================
// DATE PARSING FUNCTIONS
// =====================================================

// Helper function to parse date strings
function parseDate(dateString) {
    if (!dateString) return null;
    
    try {
        // Handle both YYYY-MM-DD and DD/MM/YYYY formats
        if (dateString.includes('-')) {
            return new Date(dateString);
        } else if (dateString.includes('/')) {
            const [day, month, year] = dateString.split('/');
            return new Date(year, month - 1, day);
        }
        return new Date(dateString);
    } catch (error) {
        console.warn('Error parsing date:', dateString, error);
        return null;
    }
}

// Helper function to parse Vietnamese date format
function parseVietnameseDate(dateString) {
    if (!dateString) return null;
    
    try {
        const cleanDateString = dateString.replace(/,?\s*/g, ' ').trim();
        
        const patterns = [
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})/, // dd/mm/yyyy hh:mm
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // dd/mm/yyyy
        ];
        
        for (let pattern of patterns) {
            const match = cleanDateString.match(pattern);
            if (match) {
                const [, day, month, year, hour = 0, minute = 0] = match;
                return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 
                               parseInt(hour), parseInt(minute));
            }
        }
        
        const date = new Date(dateString);
        return isNaN(date.getTime()) ? null : date;
        
    } catch (error) {
        console.warn('Error parsing date:', dateString, error);
        return null;
    }
}

// Get formatted current date and time
function getFormattedDateTime() {
    const currentDate = new Date();
    const day = currentDate.getDate().toString().padStart(2, '0');
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const year = currentDate.getFullYear();
    const hour = currentDate.getHours().toString().padStart(2, '0');
    const minute = currentDate.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}/${year}, ${hour}:${minute}`;
}

// =====================================================
// LOGGING FUNCTIONS
// =====================================================

function logAction(action, description, oldData = null, newData = null, pageName = 'Kiểm Hàng') {
    const logEntry = {
        timestamp: new Date(),
        user: getUserName(),
        page: pageName,
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    };

    // Save to Firebase
    historyCollectionRef.add(logEntry)
        .then(() => {
            console.log("Log entry saved successfully");
        })
        .catch((error) => {
            console.error("Error saving log entry: ", error);
        });
}

// =====================================================
// UI FUNCTIONS
// =====================================================

function showLoading(message = "Đang xử lý...") {
    showFloatingAlert(message, true);
}

function showSuccess(message = "Thành công!", duration = 2000) {
    hideFloatingAlert();
    setTimeout(() => {
        showFloatingAlert(message, false, duration);
    }, 100);
}

function showError(message = "Có lỗi xảy ra!", duration = 3000) {
    hideFloatingAlert();
    setTimeout(() => {
        showFloatingAlert(message, false, duration);
    }, 100);
}

function showFloatingAlert(message, isLoading = false, duration = 3000) {
    let alertBox = document.getElementById('floatingAlert');
    
    if (!alertBox) {
        alertBox = document.createElement('div');
        alertBox.id = 'floatingAlert';
        alertBox.innerHTML = `
            <div class="alert-content">
                <div class="loading-spinner" style="display: none;">
                    <div class="spinner"></div>
                </div>
                <div class="alert-text"></div>
            </div>
        `;
        
        alertBox.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, rgba(0, 0, 0, 0.9) 0%, rgba(44, 62, 80, 0.9) 100%);
            color: white;
            padding: 20px 30px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 500;
            width: auto;
            min-width: 200px;
            max-width: 350px;
            text-align: center;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            pointer-events: none;
            z-index: 9999;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
            letter-spacing: 0.3px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            #floatingAlert.loading {
                background: rgba(0,0,0,0.9);
                color: white;
                border-color: #007bff;
            }
            
            #floatingAlert.show {
                opacity: 1 !important;
                visibility: visible !important;
                pointer-events: all !important;
            }
            
            .loading-spinner {
                margin-bottom: 10px;
            }
            
            .spinner {
                width: 20px;
                height: 20px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top-color: #fff;
                animation: spin 1s ease-in-out infinite;
                margin: 0 auto;
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            
            #loadingOverlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.3);
                z-index: 9998;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
                pointer-events: none !important;
            }
            
            #loadingOverlay.show {
                opacity: 1;
                visibility: visible;
                pointer-events: all !important;
            }
        `;
        document.head.appendChild(style);
        
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loadingOverlay';
        document.body.appendChild(loadingOverlay);
        document.body.appendChild(alertBox);
    }
    
    const alertText = alertBox.querySelector('.alert-text');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const spinner = alertBox.querySelector('.loading-spinner');
    
    if (alertText) {
        alertText.textContent = message;
    }
    
    if (isLoading) {
        alertBox.classList.add('loading');
        if (loadingOverlay) loadingOverlay.classList.add('show');
        if (spinner) spinner.style.display = 'block';
        
        document.body.style.pointerEvents = 'none';
        document.body.style.userSelect = 'none';
        alertBox.style.pointerEvents = 'all';
        document.body.style.overflow = 'hidden';
        document.body.style.cursor = 'wait';
    } else {
        alertBox.classList.remove('loading');
        if (loadingOverlay) loadingOverlay.classList.remove('show');
        if (spinner) spinner.style.display = 'none';
        
        document.body.style.pointerEvents = 'auto';
        document.body.style.userSelect = 'auto';
        document.body.style.overflow = 'auto';
        document.body.style.cursor = 'default';
    }
    
    alertBox.classList.add('show');
    
    if (!isLoading && duration > 0) {
        setTimeout(() => {
            hideFloatingAlert();
        }, duration);
    }
}

function hideFloatingAlert() {
    const alertBox = document.getElementById('floatingAlert');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const spinner = alertBox?.querySelector('.loading-spinner');
    
    if (alertBox) {
        alertBox.classList.remove('show', 'loading');
    }
    if (loadingOverlay) {
        loadingOverlay.classList.remove('show');
    }
    if (spinner) {
        spinner.style.display = 'none';
    }
    
    document.body.style.pointerEvents = 'auto';
    document.body.style.userSelect = 'auto';
    document.body.style.overflow = 'auto';
    document.body.style.cursor = 'default';
}

console.log("Inventory Management System - Utility functions loaded");