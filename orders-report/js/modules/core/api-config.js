/**
 * API Configuration - ES Module
 * Central configuration for all API endpoints
 * Primary: Cloudflare Worker | Backup: Nginx Server
 * Auto-fallback when primary fails
 */

import { createSmartFetch } from '../../../../shared/universal/index.js';

// =====================================================
// SERVER CONFIGURATION
// =====================================================
const PRIMARY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const BACKUP_URL = 'https://n2store-fallback.onrender.com';

// Create smart fetch manager for auto-fallback
const smartFetchManager = createSmartFetch(PRIMARY_URL, BACKUP_URL, {
    retryPrimaryAfter: 5 * 60 * 1000 // Retry primary after 5 minutes
});

/**
 * Get current active server URL
 * @returns {string}
 */
export function getCurrentServerURL() {
    return smartFetchManager.getCurrentUrl();
}

/**
 * Replace URL with current server
 * @param {string} url - URL with any server base
 * @returns {string} - URL with current active server
 */
function replaceServerInURL(url) {
    return smartFetchManager.replaceServerInUrl(url);
}

// API Configuration
export const API_CONFIG = {
    // Server URLs
    PRIMARY_URL,
    BACKUP_URL,

    // Backward compatibility - dynamic getter
    get WORKER_URL() {
        return getCurrentServerURL();
    },

    // TPOS OData API
    get TPOS_ODATA() {
        return `${getCurrentServerURL()}/api/odata`;
    },

    // Pancake API
    get PANCAKE() {
        return `${getCurrentServerURL()}/api/pancake`;
    },

    // Helper functions
    buildUrl: {
        tposOData: (endpoint, params = '') => {
            const baseUrl = `${getCurrentServerURL()}/api/odata/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        },

        pancake: (endpoint, params = '') => {
            const baseUrl = `${getCurrentServerURL()}/api/pancake/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        },

        pancakeDirect: (endpoint, pageId, jwtToken, accessToken) => {
            const params = new URLSearchParams();
            params.set('page_id', pageId);
            params.set('jwt', jwtToken);
            params.set('access_token', accessToken);
            return `${getCurrentServerURL()}/api/pancake-direct/${endpoint}?${params.toString()}`;
        },

        pancakeOfficial: (endpoint, pageAccessToken) => {
            const baseUrl = `${getCurrentServerURL()}/api/pancake-official/${endpoint}`;
            return pageAccessToken ? `${baseUrl}?page_access_token=${pageAccessToken}` : baseUrl;
        },

        facebookSend: () => {
            return `${getCurrentServerURL()}/api/facebook-send`;
        }
    },

    /**
     * Smart Fetch - Auto-fallback to backup server on failure
     */
    smartFetch: async function (url, options = {}) {
        const activeUrl = replaceServerInURL(url);
        return smartFetchManager.fetch(activeUrl, options);
    },

    getStatus: function () {
        return smartFetchManager.getStatus();
    },

    forceBackup: function () {
        smartFetchManager.forceBackup();
        console.log('[API-CONFIG] Force switched to backup server');
    },

    forcePrimary: function () {
        smartFetchManager.forcePrimary();
        console.log('[API-CONFIG] Force switched to primary server');
    },

    getCurrentServer: getCurrentServerURL,
    replaceServer: replaceServerInURL
};

console.log('[API-CONFIG] ES Module loaded:', {
    primary: PRIMARY_URL,
    backup: BACKUP_URL,
    current: getCurrentServerURL()
});

export default API_CONFIG;
