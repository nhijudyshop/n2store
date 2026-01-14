/**
 * Token Cache for Cloudflare Worker
 * In-memory token caching with expiry management
 *
 * @module cloudflare-worker/modules/utils/token-cache
 */

/**
 * TPOS Token Cache (Singleton)
 */
export const tokenCache = {
    access_token: null,
    expiry: null,
    expires_in: null,
    token_type: null
};

/**
 * Check if cached token is still valid
 * @returns {boolean}
 */
export function isCachedTokenValid() {
    if (!tokenCache.access_token || !tokenCache.expiry) {
        return false;
    }

    // Add 5-minute buffer before expiry
    const buffer = 5 * 60 * 1000;
    const now = Date.now();

    return now < (tokenCache.expiry - buffer);
}

/**
 * Cache token data
 * @param {object} tokenData - Token response from TPOS
 */
export function cacheToken(tokenData) {
    const expiryTimestamp = Date.now() + (tokenData.expires_in * 1000);

    tokenCache.access_token = tokenData.access_token;
    tokenCache.expiry = expiryTimestamp;
    tokenCache.expires_in = tokenData.expires_in;
    tokenCache.token_type = tokenData.token_type || 'Bearer';

    console.log('[TOKEN-CACHE] Token cached, expires at:', new Date(expiryTimestamp).toISOString());
}

/**
 * Get cached token if valid
 * @returns {object|null}
 */
export function getCachedToken() {
    if (isCachedTokenValid()) {
        console.log('[TOKEN-CACHE] Using cached token');
        return {
            access_token: tokenCache.access_token,
            expires_in: Math.floor((tokenCache.expiry - Date.now()) / 1000),
            token_type: tokenCache.token_type
        };
    }
    return null;
}

/**
 * Clear cached token
 */
export function clearCachedToken() {
    tokenCache.access_token = null;
    tokenCache.expiry = null;
    tokenCache.expires_in = null;
    tokenCache.token_type = null;
    console.log('[TOKEN-CACHE] Token cache cleared');
}

/**
 * Get token cache status
 * @returns {object}
 */
export function getTokenCacheStatus() {
    return {
        hasToken: !!tokenCache.access_token,
        isValid: isCachedTokenValid(),
        expiresAt: tokenCache.expiry ? new Date(tokenCache.expiry).toISOString() : null,
        remainingSec: tokenCache.expiry ? Math.floor((tokenCache.expiry - Date.now()) / 1000) : 0
    };
}
