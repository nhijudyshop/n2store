// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// BALANCE HISTORY HOME - CONFIGURATION
// Cấu hình API endpoint cho trang lịch sử biến động số dư HOME
// (SePay account riêng — backend prefix /api/sepay-home/*)
// =====================================================

// Import centralized API endpoints if available, fallback to hardcoded
const API_BASE_URL_DEFAULT = 'https://chatomni-proxy.nhijudyshop.workers.dev';

const CONFIG = {
    // API Base URL - Use centralized config if available
    get API_BASE_URL() {
        if (typeof window.API_ENDPOINTS !== 'undefined' && window.API_ENDPOINTS.WORKER) {
            return window.API_ENDPOINTS.WORKER.URL;
        }
        return API_BASE_URL_DEFAULT;
    },

    // SePay endpoint prefix - DIFFERENT from balance-history original
    SEPAY_PREFIX: '/api/sepay-home',

    // Pagination
    ITEMS_PER_PAGE: 50,

    // Auto-refresh interval (milliseconds) - Set to 0 to disable
    AUTO_REFRESH_INTERVAL: 0,

    // Cache expiry (milliseconds) - 5 minutes
    CACHE_EXPIRY: 5 * 60 * 1000,

    // Date format
    DATE_FORMAT: 'vi-VN',

    // Currency
    CURRENCY: 'VND',
    CURRENCY_LOCALE: 'vi-VN'
};

window.CONFIG = CONFIG;
