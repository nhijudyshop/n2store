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

    // Pancake API Servers (theo documentation chính thức)
    // User API: https://pages.fm/api/v1 - dùng access_token
    // Page API v1: https://pages.fm/api/public_api/v1 - dùng page_access_token
    // Page API v2: https://pages.fm/api/public_api/v2 - dùng page_access_token
    PANCAKE: `${WORKER_URL}/api/pancake`,
    PANCAKE_USER_API: `${WORKER_URL}/api/pancake-user`,      // → pages.fm/api/v1
    PANCAKE_PAGE_API: `${WORKER_URL}/api/pancake-page`,      // → pages.fm/api/public_api/v1
    PANCAKE_PAGE_API_V2: `${WORKER_URL}/api/pancake-page-v2`, // → pages.fm/api/public_api/v2

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
         * Build Pancake API URL (legacy - maps to User API v1)
         * @param {string} endpoint - e.g., "pages", "conversations"
         * @param {string} params - Query string (optional)
         * @returns {string} - Full URL via Cloudflare Worker proxy
         * @deprecated Use pancakeUserApi or pancakePageApi instead
         */
        pancake: (endpoint, params = '') => {
            const baseUrl = `${WORKER_URL}/api/pancake/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        },

        /**
         * Build Pancake User API URL (pages.fm/api/v1)
         * Dùng cho: List Pages, Generate Page Access Token
         * Authentication: access_token (User token)
         * @param {string} endpoint - e.g., "pages", "pages/{id}/generate_page_access_token"
         * @param {string} params - Query string (must include access_token)
         * @returns {string}
         */
        pancakeUserApi: (endpoint, params = '') => {
            const baseUrl = `${WORKER_URL}/api/pancake-user/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        },

        /**
         * Build Pancake Page API v1 URL (pages.fm/api/public_api/v1)
         * Dùng cho: Messages, Tags, Posts, Customers, Statistics, Export
         * Authentication: page_access_token (Page token - không hết hạn)
         * @param {string} pageId - Page ID
         * @param {string} endpoint - e.g., "conversations/{id}/messages", "tags"
         * @param {string} params - Query string (must include page_access_token)
         * @returns {string}
         */
        pancakePageApi: (pageId, endpoint, params = '') => {
            const baseUrl = `${WORKER_URL}/api/pancake-page/pages/${pageId}/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        },

        /**
         * Build Pancake Page API v2 URL (pages.fm/api/public_api/v2)
         * Dùng cho: Get Conversations (với filter options mới)
         * Authentication: page_access_token
         * @param {string} pageId - Page ID
         * @param {string} endpoint - e.g., "conversations"
         * @param {string} params - Query string (must include page_access_token)
         * @returns {string}
         */
        pancakePageApiV2: (pageId, endpoint, params = '') => {
            const baseUrl = `${WORKER_URL}/api/pancake-page-v2/pages/${pageId}/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        },

        /**
         * Build Pancake Direct API URL (with custom Referer and JWT cookie)
         * Used for 24h policy bypass - fill_admin_name, check_inbox, contents/touch
         * @param {string} endpoint - e.g., "pages/123/check_inbox"
         * @param {string} pageId - Page ID for Referer mapping
         * @param {string} jwtToken - JWT token for Cookie header
         * @param {string} accessToken - Pancake access token
         * @returns {string} - Full URL via Cloudflare Worker proxy
         */
        pancakeDirect: (endpoint, pageId, jwtToken, accessToken) => {
            const params = new URLSearchParams();
            params.set('page_id', pageId);
            params.set('jwt', jwtToken);
            params.set('access_token', accessToken);
            return `${WORKER_URL}/api/pancake-direct/${endpoint}?${params.toString()}`;
        }
    },

    /**
     * Smart Fetch with automatic fallback and retry mechanism
     * Tries Cloudflare first (with retries), falls back to Render on failures (with retries)
     * @param {string} url - Full URL (should start with WORKER_URL)
     * @param {object} options - Fetch options
     * @param {number} maxRetries - Maximum number of retries per endpoint (default: 3)
     * @param {boolean} skipFallback - Skip fallback server (default: false)
     * @returns {Promise<Response>}
     */
    smartFetch: async function (url, options = {}, maxRetries = 3, skipFallback = false) {
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
            // If skipFallback is true, don't try fallback - just throw the error
            if (skipFallback) {
                console.warn('[API] ⚠️ Cloudflare failed and skipFallback is enabled, not trying fallback');
                throw error;
            }

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
    resetToPrimary: function () {
        this._isFallbackActive = false;
        this._currentUrl = WORKER_URL;
        console.log('[API] 🔄 Reset to primary (Cloudflare)');
    },

    /**
     * Get current server status
     */
    getStatus: function () {
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
    pancake: API_CONFIG.PANCAKE,
    pancakeUserApi: API_CONFIG.PANCAKE_USER_API,
    pancakePageApi: API_CONFIG.PANCAKE_PAGE_API,
    pancakePageApiV2: API_CONFIG.PANCAKE_PAGE_API_V2
});
