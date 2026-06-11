// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// js/config.js - Configuration & Firebase Setup

// Firebase is initialized by ../shared/js/firebase-config.js (loaded in index.html)

// Application Configuration
const APP_CONFIG = {
    CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    BATCH_SIZE: 50,
    MAX_VISIBLE_ROWS: 500,
    FILTER_DEBOUNCE_DELAY: 500,
    AUTH_STORAGE_KEY: 'loginindex_auth',
};

// Get Firebase instances from shared config (already initialized by shared/js/firebase-config.js)
const app = firebase.app();
const db = getFirestore();
const database = getRealtimeDB(); // Realtime Database for Pancake accounts
// (storageRef + livestream_reports/edit_history collections + DOM refs của
// trang livestream-report cũ đã GỠ 2026-06-11 — không còn dùng trên
// index.html lẫn chat.html.)

// Global Variables
let editingRow = null;
let arrayData = [];
let arrayDate = [];
let currentFilters = {
    startDate: null,
    endDate: null,
    status: 'all',
};
let filterTimeout = null;
let isFilteringInProgress = false;
let filteredDataForTotal = [];

// Export for global access
window.APP_CONFIG = APP_CONFIG;
window.db = db;
