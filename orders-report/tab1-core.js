/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                           TAB1-CORE.JS                                        ║
 * ║                   Global State & Shared Variables                             ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Module chứa các biến global và state dùng chung cho tất cả modules          ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// =====================================================
// GLOBAL STATE VARIABLES
// =====================================================

// Main data arrays
let allData = [];
let filteredData = [];
let displayedData = [];
let currentPage = 1;
const itemsPerPage = 50;
let selectedOrderIds = new Set();
let isLoading = false;
let loadingAborted = false;
let isRendering = false; // Flag to prevent duplicate renders during scroll
let employeeRanges = []; // Employee STT ranges

// Table Sorting State
let currentSortColumn = null; // 'phone', 'address', 'debt', 'total', 'quantity'
let currentSortDirection = null; // 'asc', 'desc', null

// Search State
let searchQuery = "";
let searchTimeout = null;

// Tag Management State
let availableTags = [];
let currentEditingOrderId = null;

// Edit Modal State
let currentEditOrderData = null;
let currentChatOrderDetails = [];
let currentChatOrderId = null;
let currentChatProductsRef = null;
let currentOrderTags = [];
let pendingDeleteTagIndex = -1; // Track which tag is pending deletion on backspace
let currentUserIdentifier = null; // User identifier for quick tag feature
let currentPastedImage = null; // Track pasted image for chat reply (deprecated - use array below)
let uploadedImagesData = []; // Track uploaded images data (array for multiple images)

// KPI BASE Status Cache - stores order IDs that have BASE saved
let ordersWithKPIBase = new Set();

// Order Details Cache - stores fetched order details for chat modal (TTL: 5 minutes)
const ORDER_DETAILS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in ms
const orderDetailsCache = new Map(); // Map<orderId, { data, timestamp }>

// Purchase Comment Highlight State
window.purchaseCommentId = null; // Store the Facebook_CommentId from the order to highlight in comment modal
window.purchaseFacebookPostId = null; // Store Facebook_PostId
window.purchaseFacebookASUserId = null; // Store Facebook_ASUserId

// Firebase Database Reference
let database = null;
try {
    database = firebase.database();
    console.log('[TAB1-CORE] Firebase database reference obtained');
} catch (error) {
    console.error('[TAB1-CORE] Firebase database reference error:', error);
}

// Campaign Manager State
window.campaignManager = window.campaignManager || {
    allCampaigns: {},
    activeCampaignId: null,
    activeCampaign: null,
    currentUserId: null,
    initialized: false
};

// =====================================================
// EXPORT STATE TO WINDOW (for cross-module access)
// =====================================================
window.tab1State = {
    // Getters
    get allData() { return allData; },
    get filteredData() { return filteredData; },
    get displayedData() { return displayedData; },
    get currentPage() { return currentPage; },
    get itemsPerPage() { return itemsPerPage; },
    get selectedOrderIds() { return selectedOrderIds; },
    get isLoading() { return isLoading; },
    get loadingAborted() { return loadingAborted; },
    get isRendering() { return isRendering; },
    get employeeRanges() { return employeeRanges; },
    get currentSortColumn() { return currentSortColumn; },
    get currentSortDirection() { return currentSortDirection; },
    get searchQuery() { return searchQuery; },
    get searchTimeout() { return searchTimeout; },
    get availableTags() { return availableTags; },
    get currentEditingOrderId() { return currentEditingOrderId; },
    get currentEditOrderData() { return currentEditOrderData; },
    get currentChatOrderDetails() { return currentChatOrderDetails; },
    get currentChatOrderId() { return currentChatOrderId; },
    get currentChatProductsRef() { return currentChatProductsRef; },
    get currentOrderTags() { return currentOrderTags; },
    get pendingDeleteTagIndex() { return pendingDeleteTagIndex; },
    get currentUserIdentifier() { return currentUserIdentifier; },
    get uploadedImagesData() { return uploadedImagesData; },
    get ordersWithKPIBase() { return ordersWithKPIBase; },
    get orderDetailsCache() { return orderDetailsCache; },
    get database() { return database; },

    // Setters
    set allData(v) { allData = v; },
    set filteredData(v) { filteredData = v; },
    set displayedData(v) { displayedData = v; },
    set currentPage(v) { currentPage = v; },
    set selectedOrderIds(v) { selectedOrderIds = v; },
    set isLoading(v) { isLoading = v; },
    set loadingAborted(v) { loadingAborted = v; },
    set isRendering(v) { isRendering = v; },
    set employeeRanges(v) { employeeRanges = v; },
    set currentSortColumn(v) { currentSortColumn = v; },
    set currentSortDirection(v) { currentSortDirection = v; },
    set searchQuery(v) { searchQuery = v; },
    set searchTimeout(v) { searchTimeout = v; },
    set availableTags(v) { availableTags = v; window.availableTags = v; },
    set currentEditingOrderId(v) { currentEditingOrderId = v; },
    set currentEditOrderData(v) { currentEditOrderData = v; },
    set currentChatOrderDetails(v) { currentChatOrderDetails = v; },
    set currentChatOrderId(v) { currentChatOrderId = v; },
    set currentChatProductsRef(v) { currentChatProductsRef = v; },
    set currentOrderTags(v) { currentOrderTags = v; },
    set pendingDeleteTagIndex(v) { pendingDeleteTagIndex = v; },
    set currentUserIdentifier(v) { currentUserIdentifier = v; },
    set uploadedImagesData(v) { uploadedImagesData = v; },
    set database(v) { database = v; }
};

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Format time to Vietnam timezone (GMT+7) with relative display
 * @param {string|Date} dateInput - Date string or Date object (UTC or any timezone)
 * @param {boolean} showFullDate - If true, always show full date instead of relative time
 * @returns {string} Formatted time string in Vietnamese
 */
window.formatTimeVN = function (dateInput, showFullDate = false) {
    if (!dateInput) return '';

    // Parse input date
    let date;
    if (typeof dateInput === 'string') {
        // Handle ISO string without timezone (assume UTC)
        if (!dateInput.includes('Z') && !dateInput.includes('+') && !dateInput.includes('-', 10)) {
            date = new Date(dateInput + 'Z');
        } else {
            date = new Date(dateInput);
        }
    } else {
        date = new Date(dateInput);
    }

    if (isNaN(date.getTime())) return '';

    // Vietnam timezone offset: UTC+7
    const vnOffset = 7 * 60 * 60 * 1000; // 7 hours in milliseconds
    const vnDate = new Date(date.getTime() + vnOffset);

    // Current time in Vietnam
    const nowVN = new Date(Date.now() + vnOffset);

    // Calculate difference
    const diffMs = nowVN - vnDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // Show relative time if not showFullDate and within 7 days
    if (!showFullDate) {
        if (diffMins < 0) return 'Vừa xong'; // Future time (clock sync issue)
        if (diffMins < 1) return 'Vừa xong';
        if (diffMins < 60) return `${diffMins} phút trước`;
        if (diffHours < 24) return `${diffHours} giờ trước`;
        if (diffDays < 7) return `${diffDays} ngày trước`;
    }

    // Format full date in Vietnam timezone
    // Format: dd/MM/yyyy HH:mm
    const day = String(vnDate.getUTCDate()).padStart(2, '0');
    const month = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
    const year = vnDate.getUTCFullYear();
    const hours = String(vnDate.getUTCHours()).padStart(2, '0');
    const minutes = String(vnDate.getUTCMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
};

// Expose data for other modules
window.getAllOrders = () => allData;

// Getter/Setter for currentChatOrderDetails - used by external modules
window.getChatOrderDetails = function () {
    return currentChatOrderDetails;
};
window.setChatOrderDetails = function (details) {
    currentChatOrderDetails = details;
};

/**
 * Get order details from cache if valid
 * @param {string} orderId - Order ID
 * @returns {Object|null} - Cached order data or null if expired/not found
 */
function getOrderDetailsFromCache(orderId) {
    const cached = orderDetailsCache.get(orderId);
    if (cached && (Date.now() - cached.timestamp) < ORDER_DETAILS_CACHE_TTL) {
        console.log(`[CACHE] ✅ Order details cache HIT for ${orderId}`);
        return cached.data;
    }
    if (cached) {
        console.log(`[CACHE] ⏰ Order details cache EXPIRED for ${orderId}`);
        orderDetailsCache.delete(orderId);
    }
    return null;
}

/**
 * Save order details to cache
 * @param {string} orderId - Order ID
 * @param {Object} data - Order data to cache
 */
function saveOrderDetailsToCache(orderId, data) {
    orderDetailsCache.set(orderId, { data, timestamp: Date.now() });
    console.log(`[CACHE] 💾 Order details cached for ${orderId} (TTL: ${ORDER_DETAILS_CACHE_TTL / 1000}s)`);

    // Clean up old entries (keep max 50 entries)
    if (orderDetailsCache.size > 50) {
        const oldestKey = orderDetailsCache.keys().next().value;
        orderDetailsCache.delete(oldestKey);
        console.log(`[CACHE] 🧹 Evicted oldest cache entry`);
    }
}

// Export cache functions
window.getOrderDetailsFromCache = getOrderDetailsFromCache;
window.saveOrderDetailsToCache = saveOrderDetailsToCache;

/**
 * Get current user ID (helper)
 */
function getCurrentUserId() {
    // Try to get from Firebase auth
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
        return firebase.auth().currentUser.uid;
    }
    // Fallback to localStorage or generate one
    let userId = localStorage.getItem('campaign_user_id');
    if (!userId) {
        userId = 'user_' + Date.now();
        localStorage.setItem('campaign_user_id', userId);
    }
    return userId;
}

window.getCurrentUserId = getCurrentUserId;

/**
 * Format datetime for local input
 */
function formatDateTimeLocal(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

window.formatDateTimeLocal = formatDateTimeLocal;

/**
 * Show loading overlay
 */
function showLoading(show) {
    const loading = document.getElementById('loadingOverlay');
    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
    }
}

window.showLoading = showLoading;

/**
 * Show info banner
 */
function showInfoBanner(text) {
    const banner = document.getElementById('infoBanner');
    if (banner) {
        banner.textContent = text;
        banner.style.display = 'block';
        setTimeout(() => { banner.style.display = 'none'; }, 3000);
    }
}

window.showInfoBanner = showInfoBanner;

/**
 * Show save indicator
 */
function showSaveIndicator(type, message) {
    // Try to use notificationManager first
    if (window.notificationManager) {
        switch (type) {
            case 'success':
                window.notificationManager.success(message);
                break;
            case 'error':
                window.notificationManager.error(message);
                break;
            case 'warning':
                window.notificationManager.warning(message);
                break;
            default:
                window.notificationManager.info(message);
        }
        return;
    }

    // Fallback to banner
    const indicator = document.getElementById('saveIndicator');
    if (indicator) {
        indicator.className = `save-indicator ${type}`;
        indicator.innerHTML = `<span>${message}</span>`;
        indicator.style.display = 'block';
        setTimeout(() => { indicator.style.display = 'none'; }, 3000);
    }
}

window.showSaveIndicator = showSaveIndicator;

/**
 * Remove Vietnamese tones for search
 */
function removeVietnameseTones(str) {
    if (!str) return '';
    str = str.toLowerCase();
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
    str = str.replace(/đ/g, 'd');
    return str;
}

window.removeVietnameseTones = removeVietnameseTones;

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.escapeHtml = escapeHtml;

/**
 * Escape regex special characters
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

window.escapeRegex = escapeRegex;

/**
 * Format currency VND
 */
function formatCurrencyVND(amount) {
    if (amount === null || amount === undefined) return '0';
    return new Intl.NumberFormat('vi-VN').format(amount);
}

window.formatCurrencyVND = formatCurrencyVND;

/**
 * Format number with thousand separators
 */
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return new Intl.NumberFormat('vi-VN').format(num);
}

window.formatNumber = formatNumber;

console.log('[TAB1-CORE] Module loaded successfully');
