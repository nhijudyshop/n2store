/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                           TAB1-ORDERS.JS                                      ║
 * ║                   Order Management Module - Main Logic                        ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  📖 ĐỌC FILE ARCHITECTURE.md TRƯỚC ĐỂ HIỂU CẤU TRÚC TỔNG QUAN               ║
 * ║                                                                              ║
 * ║  📝 KHI THÊM HÀM MỚI:                                                        ║
 * ║     1. Thêm vào đúng SECTION/REGION bên dưới                                 ║
 * ║     2. Cập nhật TABLE OF CONTENTS nếu là hàm quan trọng                      ║
 * ║     3. Cập nhật ARCHITECTURE.md nếu thêm section mới                         ║
 * ║                                                                              ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                         TABLE OF CONTENTS                                     ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  [SECTION 1]  GLOBAL VARIABLES .......................... search: #GLOBAL    ║
 * ║               - State: allData, filteredData, displayedData                  ║
 * ║               - formatTimeVN() - Format thời gian Việt Nam                   ║
 * ║                                                                              ║
 * ║  [SECTION 2]  FIREBASE & REALTIME TAG SYNC .............. search: #FIREBASE  ║
 * ║               - emitTagUpdateToFirebase() - Gửi tag lên Firebase             ║
 * ║               - setupTagRealtimeListeners() - Lắng nghe tag realtime         ║
 * ║               - handleRealtimeTagUpdate() - Xử lý cập nhật tag               ║
 * ║                                                                              ║
 * ║  [SECTION 3]  INITIALIZATION ............................ search: #INIT      ║
 * ║               - DOMContentLoaded event                                        ║
 * ║               - Auto-load campaigns                                           ║
 * ║                                                                              ║
 * ║  [SECTION 4]  EMPLOYEE RANGE MANAGEMENT ................. search: #EMPLOYEE  ║
 * ║               - loadAndRenderEmployeeTable()                                  ║
 * ║               - applyEmployeeRanges()                                         ║
 * ║               - getEmployeeName()                                             ║
 * ║                                                                              ║
 * ║  [SECTION 5]  TAG MANAGEMENT ............................ search: #TAG       ║
 * ║               - loadAvailableTags() - Tải danh sách tag                      ║
 * ║               - openTagModal() - Mở modal gán tag                            ║
 * ║               - saveOrderTags() - Lưu tag đơn hàng                           ║
 * ║               - quickAssignTag() - Gán tag nhanh                             ║
 * ║                                                                              ║
 * ║  [SECTION 6]  BULK TAG MODAL ............................ search: #BULK-TAG  ║
 * ║               - parseBulkSTTInput() - Parse STT input                        ║
 * ║               - showBulkTagModal() - Hiển thị modal gán tag hàng loạt       ║
 * ║                                                                              ║
 * ║  [SECTION 7]  TABLE SEARCH & FILTERING .................. search: #SEARCH    ║
 * ║               - handleTableSearch() - Tìm kiếm bảng                          ║
 * ║               - performTableSearch() - Thực hiện tìm kiếm                    ║
 * ║                                                                              ║
 * ║  [SECTION 8]  TABLE RENDERING ........................... search: #RENDER    ║
 * ║               - renderTable() - Render bảng chính                            ║
 * ║               - createRowHTML() - Tạo HTML hàng                              ║
 * ║               - renderMessagesColumn() - Render cột tin nhắn                 ║
 * ║               - renderCommentsColumn() - Render cột bình luận                ║
 * ║                                                                              ║
 * ║  [SECTION 9]  MERGED ORDER COLUMNS ...................... search: #MERGED    ║
 * ║               - renderMergedMessagesColumn()                                  ║
 * ║               - renderMergedQuantityColumn()                                  ║
 * ║               - renderMergedTotalColumn()                                     ║
 * ║                                                                              ║
 * ║  [SECTION 10] EDIT MODAL ................................ search: #EDIT      ║
 * ║               - openEditModal() - Mở modal sửa đơn                           ║
 * ║               - saveOrderChanges() - Lưu thay đổi                            ║
 * ║               - prepareOrderPayload() - Chuẩn bị payload API                 ║
 * ║                                                                              ║
 * ║  [SECTION 11] INLINE PRODUCT SEARCH ..................... search: #PRODUCT   ║
 * ║               - initInlineProductSearch()                                     ║
 * ║               - performInlineSearch()                                         ║
 * ║               - addProductToOrderFromInline()                                 ║
 * ║                                                                              ║
 * ║  [SECTION 12] CHAT MODAL & MESSAGING .................... search: #CHAT      ║
 * ║               - openChatModal() - Mở modal chat                              ║
 * ║               - sendMessage() - Gửi tin nhắn                                 ║
 * ║               - sendComment() - Gửi bình luận                                ║
 * ║               - Image upload & paste handling                                 ║
 * ║               - setupRealtimeMessages() - Realtime via Facebook API         ║
 * ║               - fetchMessagesFromFacebookAPI() - Lấy tin nhắn từ FB         ║
 * ║               - cleanupRealtimeMessages() - Cleanup listeners                ║
 * ║                                                                              ║
 * ║  [SECTION 13] INFINITE SCROLL ........................... search: #SCROLL    ║
 * ║               - setupChatInfiniteScroll()                                     ║
 * ║               - loadMoreMessages()                                            ║
 * ║               - loadMoreComments()                                            ║
 * ║                                                                              ║
 * ║  [SECTION 14] NOTE ENCODING/DECODING .................... search: #ENCODE    ║
 * ║               - base64UrlDecode()                                             ║
 * ║               - xorDecrypt()                                                  ║
 * ║               - decodeProductLine()                                           ║
 * ║               - hasValidEncodedProducts()                                     ║
 * ║                                                                              ║
 * ║  [SECTION 15] ORDER MERGE FUNCTIONS ..................... search: #MERGE     ║
 * ║               - getOrderDetails()                                             ║
 * ║               - executeMergeOrderProducts()                                   ║
 * ║               - executeBulkMergeOrderProducts()                               ║
 * ║                                                                              ║
 * ║  [SECTION 16] ADDRESS LOOKUP ............................ search: #ADDRESS   ║
 * ║               - handleAddressLookup()                                         ║
 * ║               - handleFullAddressLookup()                                     ║
 * ║                                                                              ║
 * ║  [SECTION 17] QR CODE & DEBT FUNCTIONS .................. search: #QR-DEBT   ║
 * ║               - renderQRColumn() - Render cột QR                             ║
 * ║               - renderDebtColumn() - Render cột công nợ                      ║
 * ║               - fetchDebtForPhone() - Lấy công nợ theo SĐT                   ║
 * ║               - connectDebtRealtime() - Kết nối SSE cập nhật công nợ         ║
 * ║                                                                              ║
 * ║  [SECTION 18] SALE MODAL - PRODUCT SEARCH ............... search: #SALE-PROD ║
 * ║               - initSaleProductSearch() - Khởi tạo search (~7300)            ║
 * ║               - performSaleProductSearch() - Tìm kiếm SP                     ║
 * ║               - displaySaleProductResults() - Hiển thị kết quả               ║
 * ║               - addProductToSaleFromSearch() - Thêm SP + API update (~2214)  ║
 * ║               - updateSaleOrderWithAPI() - PUT API update order (~15687)     ║
 * ║               - updateSaleItemQuantityFromAPI() - Update SL + API            ║
 * ║               - removeSaleItemFromAPI() - Xóa SP + API                       ║
 * ║               - recalculateSaleTotals() - Tính lại tổng (~7273)              ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// #region ═══════════════════════════════════════════════════════════════════════
// ║                        SECTION 1: GLOBAL VARIABLES                          ║
// ║                            search: #GLOBAL                                  ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// GLOBAL VARIABLES #GLOBAL
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

// Global variables
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
let selectedCampaign = null; // Currently selected campaign (null = not selected, { isCustom: true } = custom mode)

// Table Sorting State
let currentSortColumn = null; // 'phone', 'address', 'debt', 'total', 'quantity'
let currentSortDirection = null; // 'asc', 'desc', null

// Expose data for other modules
window.getAllOrders = () => allData;

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

// Getter/Setter for currentChatOrderDetails - used by external modules
window.getChatOrderDetails = function () {
    return currentChatOrderDetails;
};
window.setChatOrderDetails = function (details) {
    currentChatOrderDetails = details;
};
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

// Purchase Comment Highlight State
window.purchaseCommentId = null; // Store the Facebook_CommentId from the order to highlight in comment modal
window.purchaseFacebookPostId = null; // Store Facebook_PostId
window.purchaseFacebookASUserId = null; // Store Facebook_ASUserId

