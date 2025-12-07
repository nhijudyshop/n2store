/**
 * API Configuration
 * Central configuration for all API endpoints
 * Primary: Cloudflare Worker
 * Fallback: Render.com (when Cloudflare returns 500)
 */

// Primary: Cloudflare Worker URL
const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

// Fallback: Render.com URL (deploy this first!)
const FALLBACK_URL = 'https://n2store-fallback.onrender.com';

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

    // Pancake API (Pages, Conversations) - Via Cloudflare Worker proxy
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
         * Build Pancake API URL
         * @param {string} endpoint - e.g., "pages", "conversations"
         * @param {string} params - Query string (optional)
         * @returns {string} - Full URL via Cloudflare Worker proxy
         */
        pancake: (endpoint, params = '') => {
            const baseUrl = `${WORKER_URL}/api/pancake/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        }
    },

    /**
     * Smart Fetch with automatic fallback and retry mechanism
     * Tries Cloudflare first (with retries), falls back to Render on failures (with retries)
     * @param {string} url - Full URL (should start with WORKER_URL)
     * @param {object} options - Fetch options
     * @param {number} maxRetries - Maximum number of retries per endpoint (default: 3)
     * @returns {Promise<Response>}
     */
    smartFetch: async function(url, options = {}, maxRetries = 3) {
        const originalUrl = url;

        /**
         * Helper function to retry fetch with exponential backoff
         * @param {string} targetUrl - URL to fetch
         * @param {object} fetchOptions - Fetch options
         * @param {number} retries - Number of retries remaining
         * @param {string} label - Label for logging (e.g., "Cloudflare", "Fallback")
         * @returns {Promise<Response>}
         */
        const fetchWithRetry = async (targetUrl, fetchOptions, retries, label) => {
            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    if (attempt === 1) {
                        console.log(`[API] 🌐 Trying ${label}: ${targetUrl}`);
                    } else {
                        console.log(`[API] 🔄 Retry ${attempt}/${retries} for ${label}: ${targetUrl}`);
                    }

                    const response = await fetch(targetUrl, fetchOptions);

                    // If 500 error on Cloudflare, don't retry - go straight to fallback
                    if (response.status === 500 && label === 'Cloudflare') {
                        console.warn(`[API] ⚠️ ${label} returned 500, switching to fallback immediately...`);
                        const skipRetryError = new Error(`${label} returned 500`);
                        skipRetryError.skipRetry = true; // Flag to skip retries
                        throw skipRetryError;
                    }

                    // If response is ok, return it
                    if (response.ok) {
                        if (attempt > 1) {
                            console.log(`[API] ✅ ${label} success after ${attempt} attempts`);
                        } else {
                            console.log(`[API] ✅ ${label} success`);
                        }
                        return response;
                    }

                    // If not ok but not 500, throw to retry
                    throw new Error(`HTTP ${response.status}`);

                } catch (error) {
                    // If error has skipRetry flag, don't retry - throw immediately
                    if (error.skipRetry) {
                        console.error(`[API] ❌ ${label} returned 500, skipping retries`);
                        throw error;
                    }

                    const isLastAttempt = attempt === retries;

                    if (isLastAttempt) {
                        console.error(`[API] ❌ ${label} failed after ${retries} attempts:`, error.message);
                        throw error;
                    }

                    // Exponential backoff: 1s, 2s, 4s
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    console.warn(`[API] ⏳ ${label} attempt ${attempt} failed, retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        };

        // Try primary (Cloudflare) with retries
        try {
            const response = await fetchWithRetry(url, options, maxRetries, 'Cloudflare');

            // Success
            if (!this._isFallbackActive && response.ok) {
                // Already logged in fetchWithRetry
            }

            return response;

        } catch (error) {
            // Try fallback (Render.com) with retries
            const fallbackUrl = url.replace(WORKER_URL, FALLBACK_URL);
            console.log(`[API] 🔄 Switching to fallback endpoint...`);

            try {
                const fallbackResponse = await fetchWithRetry(fallbackUrl, options, maxRetries, 'Fallback');

                if (fallbackResponse.ok) {
                    // Mark fallback as active
                    if (!this._isFallbackActive) {
                        this._isFallbackActive = true;
                        console.warn('[API] 🚨 Switched to FALLBACK mode (Render.com)');
                    }
                }

                return fallbackResponse;

            } catch (fallbackError) {
                console.error('[API] ❌ Both Cloudflare and Fallback failed after retries');
                throw new Error(`Both endpoints failed. Cloudflare: ${error.message}, Fallback: ${fallbackError.message}`);
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
    pancake: API_CONFIG.PANCAKE
});
