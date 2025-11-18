/**
 * API Configuration
 * Central configuration for all API endpoints
 * All requests go through Cloudflare Worker for CORS bypass
 */

// Cloudflare Worker URL
const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

// API Configuration
const API_CONFIG = {
    // Cloudflare Worker base URL
    WORKER_URL: WORKER_URL,

    // TPOS OData API (SaleOnline_Order, AuditLog, etc.)
    TPOS_ODATA: `${WORKER_URL}/api/odata`,

    // ChatOmni API (Messages, Conversations)
    CHATOMNI: `${WORKER_URL}/api/api-ms/chatomni/v1`,

    // Pancake API (Pages, Conversations)
    PANCAKE: `${WORKER_URL}/api/pancake`,

    // Helper functions
    buildUrl: {
        /**
         * Build TPOS OData URL
         * @param {string} endpoint - e.g., "SaleOnline_Order/ODataService.GetView"
         * @param {string} params - Query string (optional)
         * @returns {string} - Full URL through worker
         */
        tposOData: (endpoint, params = '') => {
            const baseUrl = `${WORKER_URL}/api/odata/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        },

        /**
         * Build ChatOmni API URL
         * @param {string} endpoint - e.g., "conversations/search"
         * @returns {string} - Full URL through worker
         */
        chatOmni: (endpoint) => {
            return `${WORKER_URL}/api/api-ms/chatomni/v1/${endpoint}`;
        },

        /**
         * Build Pancake API URL
         * @param {string} endpoint - e.g., "pages", "conversations"
         * @param {string} params - Query string (optional)
         * @returns {string} - Full URL through worker
         */
        pancake: (endpoint, params = '') => {
            const baseUrl = `${WORKER_URL}/api/pancake/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        }
    }
};

// Export for use in other files
if (typeof window !== 'undefined') {
    window.API_CONFIG = API_CONFIG;
}

console.log('[API-CONFIG] API configuration loaded:', {
    worker: WORKER_URL,
    tposOData: API_CONFIG.TPOS_ODATA,
    chatOmni: API_CONFIG.CHATOMNI,
    pancake: API_CONFIG.PANCAKE
});
