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

    // =====================================================
    // SEPAY HOME — 2 tài khoản ngân hàng (nguồn webhook)
    // Cả 2 cùng đổ vào bảng balance_history_home, phân biệt bằng account_number.
    // Sửa danh sách/nhãn nhà tại ĐÂY (single source of truth) — KHÔNG hardcode chỗ khác.
    //   number = số tài khoản trên SePay (Ngân hàng → Tài khoản)
    //   label  = nhãn hiển thị (biệt danh nhà/TK trên SePay)
    // =====================================================
    ACCOUNTS: [
        { number: '09777743051810', label: '44 TL' },
        { number: '09777743051708', label: '481 NVK' },
    ],

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
    CURRENCY_LOCALE: 'vi-VN',
};

window.CONFIG = CONFIG;

// Helper: số tài khoản → nhãn nhà ("44 TL"). Không khớp → trả số TK (đỡ trống).
window.getAccountLabel = function (accountNumber) {
    if (!accountNumber) return '';
    const acc = (CONFIG.ACCOUNTS || []).find((a) => a.number === String(accountNumber));
    return acc ? acc.label : String(accountNumber);
};
