/**
 * Token Cache for Cloudflare Worker
 * In-memory token caching with expiry management
 * Caches tokens PER USERNAME:COMPANYID to support multiple accounts & companies
 *
 * @module cloudflare-worker/modules/utils/token-cache
 */

/**
 * TPOS Token Cache - Map of cacheKey -> token data
 * cacheKey format: "username:companyId" (e.g. "nvkt:1", "nvkt:2")
 */
const tokenCacheMap = new Map();

/**
 * Build cache key from username and companyId
 * @param {string} username
 * @param {string|number} companyId
 * @returns {string}
 */
function buildCacheKey(username = '_default', companyId = null) {
    if (companyId) {
        return `${username}:company${companyId}`;
    }
    return username;
}

/**
 * Check if cached token for a user+company is still valid
 * @param {string} username - The username to check
 * @param {string|number} companyId - The company ID (optional)
 * @returns {boolean}
 */
export function isCachedTokenValid(username = '_default', companyId = null) {
    const key = buildCacheKey(username, companyId);
    const cache = tokenCacheMap.get(key);
    if (!cache || !cache.access_token || !cache.expiry) {
        return false;
    }

    // Add 5-minute buffer before expiry
    const buffer = 5 * 60 * 1000;
    const now = Date.now();

    return now < (cache.expiry - buffer);
}

/**
 * Cache token data for a user+company
 * @param {object} tokenData - Token response from TPOS
 * @param {string} username - The username (key for cache)
 * @param {string|number} companyId - The company ID (optional)
 */
export function cacheToken(tokenData, username = '_default', companyId = null) {
    const key = buildCacheKey(username, companyId);
    const expiryTimestamp = Date.now() + (tokenData.expires_in * 1000);

    tokenCacheMap.set(key, {
        access_token: tokenData.access_token,
        expiry: expiryTimestamp,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type || 'Bearer'
    });

    console.log(`[TOKEN-CACHE] Token cached for "${key}", expires at:`, new Date(expiryTimestamp).toISOString());
}

/**
 * Get cached token if valid for a user+company
 * @param {string} username - The username to get token for
 * @param {string|number} companyId - The company ID (optional)
 * @returns {object|null}
 */
export function getCachedToken(username = '_default', companyId = null) {
    const key = buildCacheKey(username, companyId);
    if (isCachedTokenValid(username, companyId)) {
        const cache = tokenCacheMap.get(key);
        console.log(`[TOKEN-CACHE] Using cached token for "${key}"`);
        return {
            access_token: cache.access_token,
            expires_in: Math.floor((cache.expiry - Date.now()) / 1000),
            token_type: cache.token_type
        };
    }
    return null;
}

/**
 * Clear cached token for a user+company
 * @param {string} username - The username to clear (or all if not specified)
 * @param {string|number} companyId - The company ID (optional)
 */
export function clearCachedToken(username = null, companyId = null) {
    if (username) {
        const key = buildCacheKey(username, companyId);
        tokenCacheMap.delete(key);
        console.log(`[TOKEN-CACHE] Token cache cleared for "${key}"`);
    } else {
        tokenCacheMap.clear();
        console.log('[TOKEN-CACHE] All token caches cleared');
    }
}

/**
 * Get token cache status
 * @param {string} username - The username to check
 * @param {string|number} companyId - The company ID (optional)
 * @returns {object}
 */
export function getTokenCacheStatus(username = '_default', companyId = null) {
    const key = buildCacheKey(username, companyId);
    const cache = tokenCacheMap.get(key);
    return {
        hasToken: !!cache?.access_token,
        isValid: isCachedTokenValid(username, companyId),
        expiresAt: cache?.expiry ? new Date(cache.expiry).toISOString() : null,
        remainingSec: cache?.expiry ? Math.floor((cache.expiry - Date.now()) / 1000) : 0,
        cachedUsers: Array.from(tokenCacheMap.keys())
    };
}
