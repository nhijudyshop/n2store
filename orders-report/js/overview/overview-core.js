// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// OVERVIEW - CORE: Global State & Permission Helpers
// MIGRATION: Changed from Realtime Database to Firestore
// =====================================================

// =====================================================
// GLOBAL STATE
// =====================================================
let allOrders = [];
let cachedOrderDetails = {}; // { tableName: { orders: [], fetchedAt: timestamp } }
let currentCampaignName = null;
let currentTableName = null; // Table name from tab1-orders
let database = null;
let isFetching = false;
let isLoadingTables = false; // Flag to prevent multiple simultaneous table loads
let userManuallySelectedTable = false; // Flag to track if user manually selected a table from dropdown
let justReceivedFromTab1 = false; // Flag to prevent auto-load from Firebase when just received data from tab1
let dataReceivedFromTab1 = false; // Flag to track if data was received from Tab1 (for retry logic)
let currentProductFilter = ''; // Product search filter for detail list

// Dedup tracking for loadTableDataFromFirebase()
let _firebaseLoadPromise = null;   // In-flight load promise
let _firebaseLoadedTable = null;   // Table already loaded successfully

const STORAGE_KEY = 'report_order_details_by_table';
const FIREBASE_PATH = 'report_order_details';
const TABLE_NAME_SETTINGS_PATH = 'settings/table_name'; // Path to default table name (same as tab1)
const BATCH_SIZE = 20;
const BATCH_DELAY = 300; // 300ms between batches

// =====================================================
// PERMISSION HELPER
// =====================================================
function getAuthData() {
    try {
        let authData = sessionStorage.getItem("loginindex_auth");
        if (!authData) {
            authData = localStorage.getItem("loginindex_auth");
        }
        return authData ? JSON.parse(authData) : null;
    } catch (e) {
        console.error('[PERMISSION] Error reading auth data:', e);
        return null;
    }
}

function hasDetailedPermission(pageId, action) {
    const authData = getAuthData();
    if (!authData?.detailedPermissions?.[pageId]) return false;
    return authData.detailedPermissions[pageId][action] === true;
}

function canViewAnalysis() {
    return hasDetailedPermission('baocaosaleonline', 'viewAnalysis');
}

function canEditAnalysis() {
    return hasDetailedPermission('baocaosaleonline', 'editAnalysis');
}

function initAnalysisTabVisibility() {
    const analysisTabBtn = document.getElementById('analysisTabBtn');
    if (analysisTabBtn) {
        if (canViewAnalysis()) {
            analysisTabBtn.style.display = '';
            console.log('[PERMISSION] Analysis tab enabled');
        } else {
            analysisTabBtn.style.display = 'none';
            console.log('[PERMISSION] Analysis tab hidden - no permission');
        }
    }
}

// Firebase cached data info
let firebaseTableName = null;
let firebaseDataFetchedAt = null;

// Anti-spam: Track which tables have already requested conversation fetch
const conversationFetchRequestedFor = new Set();

// =====================================================
// STATISTICS STATE
// =====================================================
let employeeRanges = []; // Employee assignment ranges from Tab1
let processingTagsMap = {}; // Tag XL data from Tab1's ProcessingTagState
let availableTags = []; // LEGACY: Tags from TPOS (kept for "Chi tiết đã tải" tab)
let trackedTags = []; // LEGACY: Tags currently being tracked

// LEGACY: Default tracked tag patterns
const DEFAULT_TRACKED_TAGS = [
    { pattern: 'giỏ trống', type: 'exact', displayName: 'Giỏ Trống', color: '#f59e0b' },
    { pattern: 'xả khách lạ', type: 'exact', displayName: 'Xả Khách Lạ', color: '#ef4444' },
    { pattern: 'đã gộp không chốt', type: 'exact', displayName: 'Gộp Đơn', color: '#8b5cf6' },
    { pattern: 'đã đi đơn gấp', type: 'exact', displayName: 'Đã Đi Đơn Gấp', color: '#10b981' },
    { pattern: 'ok', type: 'startsWith', displayName: 'OK + NV', color: '#22c55e' },
    { pattern: 'qua lấy', type: 'exact', displayName: 'Qua Lấy', color: '#3b82f6' },
    { pattern: 'xử lý', type: 'startsWith', displayName: 'Xử Lý + NV', color: '#f97316' },
    { pattern: 'chờ live', type: 'exact', displayName: 'Chờ Live', color: '#ec4899' },
    { pattern: 'chờ hàng', type: 'exact', displayName: 'Chờ Hàng', color: '#6366f1' },
    { pattern: 'xả đơn', type: 'startsWith', displayName: 'Xả Đơn', color: '#14b8a6' }
];

// =====================================================
// TAG XL CONSTANTS (mirrored from tab1-processing-tags.js)
// =====================================================
const PTAG_CATEGORY_META = {
    0: { name: 'ĐÃ RA ĐƠN', short: 'ĐÃ RA ĐƠN', icon: 'fa-check-circle', emoji: '🟢', color: '#10b981' },
    1: { name: 'CHỜ ĐI ĐƠN (OKE)', short: 'CHỜ ĐI ĐƠN', icon: 'fa-clock', emoji: '🔵', color: '#3b82f6' },
    2: { name: 'MỤC XỬ LÝ', short: 'XỬ LÝ', icon: 'fa-exclamation-triangle', emoji: '🟠', color: '#f59e0b' },
    3: { name: 'KHÔNG CẦN CHỐT', short: 'KO CẦN CHỐT', icon: 'fa-minus-circle', emoji: '⚪', color: '#6b7280' },
    4: { name: 'KHÁCH XÃ SAU CHỐT', short: 'KHÁCH XÃ', icon: 'fa-times-circle', emoji: '🔴', color: '#ef4444' }
};

const PTAG_SUBSTATES_META = {
    OKIE_CHO_DI_DON: { label: 'OKIE CHỜ ĐI ĐƠN', color: '#3b82f6' },
    CHO_HANG: { label: 'CHỜ HÀNG', color: '#f59e0b' }
};

const PTAG_SUBTAGS_META = {
    // Category 2
    CHUA_PHAN_HOI: { label: 'ĐƠN CHƯA PHẢN HỒI', category: 2, icon: '💬' },
    BAN_HANG: { label: 'BÁN HÀNG', category: 2, icon: '🛒' },
    // Category 3
    DA_GOP_KHONG_CHOT: { label: 'ĐÃ GỘP KHÔNG CHỐT', category: 3, icon: '🔗' },
    KHONG_DE_HANG: { label: 'KHÔNG ĐỂ HÀNG', category: 3, icon: '🚫' },
    // Category 4
    NCC_HET_HANG: { label: 'NCC HẾT HÀNG', category: 4, icon: '🚫' },
    KHACH_HUY_DON: { label: 'KHÁCH HỦY NGUYÊN ĐƠN', category: 4, icon: '❌' },
    KHACH_KO_LIEN_LAC: { label: 'KHÁCH KHÔNG LIÊN LẠC ĐƯỢC', category: 4, icon: '📵' }
};

const PTAG_FLAGS_META = {
    CHO_LIVE: { label: 'CHỜ LIVE', icon: '📺', color: '#ec4899' },
    QUA_LAY: { label: 'QUA LẤY', icon: '🏠', color: '#3b82f6' },
    GIU_DON: { label: 'GIỮ ĐƠN', icon: '⌛', color: '#8b5cf6' },
    GIAM_GIA: { label: 'GIẢM GIÁ', icon: '🏷️', color: '#f59e0b' }
};

// Firebase paths for statistics
const TRACKED_TAGS_PATH = 'settings/tracked_tags';
const EMPLOYEE_RANGES_PATH = 'settings/employee_ranges';

// Firebase config - use shared config (loaded via shared/js/firebase-config.js)
const _fbConfig = (typeof firebaseConfig !== 'undefined') ? firebaseConfig : FIREBASE_CONFIG;

// Initialize Firebase
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(_fbConfig);
}
if (typeof firebase !== 'undefined' && typeof firebase.firestore === 'function') {
    database = firebase.firestore();
}
