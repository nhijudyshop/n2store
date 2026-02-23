/**
 * TPOS Search Client for Purchase Orders
 * Provides window.TPOSClient.searchProduct() for product code duplicate checking
 *
 * Uses Cloudflare proxy to avoid CORS issues:
 *   GET https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Product/OdataService.GetViewV2
 *       ?Active=true&DefaultCode={code}&$top=1&$count=true
 */

window.TPOSClient = (function() {
    'use strict';

    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const TOKEN_URL = `${PROXY_URL}/api/token`;
    const STORAGE_KEY = 'bearer_token_data';
    const TOKEN_BUFFER = 5 * 60 * 1000; // 5 minutes before expiry

    const CREDENTIALS = {
        grant_type: 'password',
        username: 'nvkt',
        password: 'Aa@123456789',
        client_id: 'tmtWebApp'
    };

    let token = null;
    let tokenExpiry = null;
    let refreshPromise = null;

    // =====================================================
    // TOKEN MANAGEMENT
    // =====================================================

    function isTokenValid() {
        return token && tokenExpiry && Date.now() < (tokenExpiry - TOKEN_BUFFER);
    }

    function loadFromStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.access_token && data.expires_at && Date.now() < (data.expires_at - TOKEN_BUFFER)) {
                    token = data.access_token;
                    tokenExpiry = data.expires_at;
                    return true;
                }
            }
        } catch (e) {
            // Ignore storage errors
        }
        return false;
    }

    function saveToStorage(tokenData) {
        try {
            const expiresAt = Date.now() + (tokenData.expires_in * 1000);
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                access_token: tokenData.access_token,
                token_type: 'Bearer',
                expires_in: tokenData.expires_in,
                expires_at: expiresAt,
                issued_at: Date.now()
            }));
        } catch (e) {
            // Ignore storage errors
        }
    }

    async function fetchNewToken() {
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(CREDENTIALS).toString()
        });

        if (!response.ok) {
            throw new Error(`Token fetch failed: ${response.status}`);
        }

        const data = await response.json();
        token = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in * 1000);
        saveToStorage(data);
        console.log('[TPOS-Search] Token refreshed');
        return token;
    }

    async function getToken() {
        if (isTokenValid()) return token;
        if (loadFromStorage() && isTokenValid()) return token;

        // Prevent concurrent refresh
        if (refreshPromise) {
            await refreshPromise;
            return token;
        }

        refreshPromise = fetchNewToken();
        try {
            await refreshPromise;
        } finally {
            refreshPromise = null;
        }
        return token;
    }

    // =====================================================
    // SEARCH PRODUCT
    // =====================================================

    /**
     * Search TPOS for a product by code (DefaultCode)
     * @param {string} productCode - Product code to search (e.g. "N133")
     * @returns {Promise<Array>} - Array of matching products (empty if not found)
     */
    async function searchProduct(productCode) {
        if (!productCode || typeof productCode !== 'string') return [];

        try {
            const authToken = await getToken();
            const url = `${PROXY_URL}/api/odata/Product/OdataService.GetViewV2`
                + `?Active=true`
                + `&DefaultCode=${encodeURIComponent(productCode.trim().toUpperCase())}`
                + `&$top=1`
                + `&$orderby=DateCreated desc`
                + `&$count=true`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                }
            });

            // Handle 401 - retry once with new token
            if (response.status === 401) {
                console.log('[TPOS-Search] 401, refreshing token...');
                token = null;
                tokenExpiry = null;
                const newToken = await getToken();

                const retryResponse = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${newToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!retryResponse.ok) return [];
                const retryData = await retryResponse.json();
                return retryData.value || [];
            }

            if (!response.ok) return [];

            const data = await response.json();
            return data.value || [];
        } catch (error) {
            console.error('[TPOS-Search] searchProduct error:', error);
            return [];
        }
    }

    // Initialize - load token from storage on load
    loadFromStorage();
    console.log('[TPOS-Search] Loaded, token valid:', isTokenValid());

    return {
        searchProduct,
        getToken,
        isTokenValid: () => isTokenValid()
    };
})();
