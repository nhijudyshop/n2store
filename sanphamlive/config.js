// js/config.js - Configuration

const APP_CONFIG = {
    CACHE_EXPIRY: 10 * 60 * 1000, // 10 minutes
    FILTER_DEBOUNCE_DELAY: 500,
    MAX_VISIBLE_ROWS: 500,
    TIMEZONE: "Asia/Ho_Chi_Minh",
};

// Sample data for demo
const SAMPLE_DATA = [];

function generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Export for global access
window.APP_CONFIG = APP_CONFIG;
window.SAMPLE_DATA = SAMPLE_DATA;
window.generateId = generateId;
