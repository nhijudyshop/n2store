/**
 * API Configuration
 * Central configuration for all API endpoints
 * Primary: Cloudflare Worker
 * Fallback: Render.com (when Cloudflare returns 500)
 */

// Primary: Cloudflare Worker URL
const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

// Fallback: Render.com URL (deploy this first!)
const FALLBACK_URL = 'https://n2store-api-fallback.onrender.com';

// API Configuration
const API_CONFIG = {
    // Primary Worker URL
    WORKER_URL: WORKER_URL,

    // Fallback URL
    FALLBACK_URL: FALLBACK_URL,

    // Current active URL (will switch on 500 errors)
    _currentUrl: WORKER_URL,
    _isFallbackActive: false,

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
    },

    /**
     * Smart Fetch with automatic fallback
     * Tries Cloudflare first, falls back to Render on 500 errors
     * @param {string} url - Full URL (should start with WORKER_URL)
     * @param {object} options - Fetch options
     * @returns {Promise<Response>}
     */
    smartFetch: async function(url, options = {}) {
        const originalUrl = url;

        // Try primary (Cloudflare)
        try {
            console.log(`[API] 🌐 Trying Cloudflare: ${url}`);
            const response = await fetch(url, options);

            // If 500 error, try fallback
            if (response.status === 500) {
                console.warn('[API] ⚠️ Cloudflare returned 500, trying fallback...');
                throw new Error('Cloudflare returned 500');
            }

            // Success
            if (!this._isFallbackActive && response.ok) {
                console.log('[API] ✅ Cloudflare success');
            }

            return response;

        } catch (error) {
            console.error('[API] ❌ Cloudflare failed:', error.message);

            // Try fallback (Render.com)
            const fallbackUrl = url.replace(WORKER_URL, FALLBACK_URL);
            console.log(`[API] 🔄 Trying fallback: ${fallbackUrl}`);

            try {
                const fallbackResponse = await fetch(fallbackUrl, options);

                if (fallbackResponse.ok) {
                    console.log('[API] ✅ Fallback success');

                    // Mark fallback as active
                    if (!this._isFallbackActive) {
                        this._isFallbackActive = true;
                        console.warn('[API] 🚨 Switched to FALLBACK mode (Render.com)');
                    }
                }

                return fallbackResponse;

            } catch (fallbackError) {
                console.error('[API] ❌ Fallback also failed:', fallbackError.message);
                throw new Error(`Both Cloudflare and Fallback failed. Original error: ${error.message}`);
            }
        }
    },

    /**
     * Reset to primary server (Cloudflare)
     */
    resetToPrimary: function() {
        this._isFallbackActive = false;
        this._currentUrl = WORKER_URL;
        console.log('[API] 🔄 Reset to primary (Cloudflare)');
    },

    /**
     * Get current server status
     */
    getStatus: function() {
        return {
            primary: WORKER_URL,
            fallback: FALLBACK_URL,
            current: this._currentUrl,
            isFallbackActive: this._isFallbackActive
        };
    }
};

// Export for use in other files
if (typeof window !== 'undefined') {
    window.API_CONFIG = API_CONFIG;
}

console.log('[API-CONFIG] API configuration loaded:', {
    worker: WORKER_URL,
    fallback: FALLBACK_URL,
    tposOData: API_CONFIG.TPOS_ODATA,
    chatOmni: API_CONFIG.CHATOMNI,
    pancake: API_CONFIG.PANCAKE
});
