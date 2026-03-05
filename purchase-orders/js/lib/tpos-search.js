/**
 * TPOS Search Client for Purchase Orders
 * Provides window.TPOSClient for product code operations
 *
 * Token flow: localStorage → Firestore → fetch new from /api/token
 * All requests go through Cloudflare proxy to bypass CORS
 * Ref: /docs/architecture/SHARED_TPOS.md
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
    // HEADERS - match working pattern from dialogs.js
    // =====================================================

    function getHeaders(authToken) {
        const headers = {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'feature-version': '2',
            'tposappversion': '6.2.6.1'
        };
        // Add company ID from ShopConfig
        const companyId = window.ShopConfig?.getConfig()?.CompanyId;
        if (companyId) {
            headers['X-Company-Id'] = String(companyId);
        }
        return headers;
    }

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
                    tokenExpiry = Number(data.expires_at);
                    return true;
                }
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    async function loadFromFirestore() {
        try {
            if (!window.firebase || !window.firebase.firestore) return false;
            const doc = await firebase.firestore().collection('tokens').doc('tpos_token').get();
            if (!doc.exists) return false;
            const data = doc.data();
            if (data.access_token && data.expires_at && Date.now() < (data.expires_at - TOKEN_BUFFER)) {
                token = data.access_token;
                tokenExpiry = Number(data.expires_at);
                // Sync to localStorage
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                } catch (e) { /* ignore */ }
                console.log('[TPOS-Search] Token loaded from Firestore');
                return true;
            }
        } catch (e) {
            console.warn('[TPOS-Search] Firestore token load failed:', e);
        }
        return false;
    }

    function saveToStorage(tokenData) {
        const expiresAt = Date.now() + (tokenData.expires_in * 1000);
        const dataToSave = {
            access_token: tokenData.access_token,
            token_type: 'Bearer',
            expires_in: tokenData.expires_in,
            expires_at: expiresAt,
            issued_at: Date.now()
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
        } catch (e) { /* ignore */ }
        // Also save to Firestore
        try {
            if (window.firebase && window.firebase.firestore) {
                firebase.firestore().collection('tokens').doc('tpos_token').set(dataToSave, { merge: true });
            }
        } catch (e) { /* ignore */ }
    }

    async function fetchNewToken() {
        console.log('[TPOS-Search] Fetching new token...');
        const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        const companyId = window.ShopConfig?.getConfig()?.CompanyId;
        if (companyId) {
            headers['X-Company-Id'] = String(companyId);
        }
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers,
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
        if (await loadFromFirestore() && isTokenValid()) return token;

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
    // AUTHENTICATED FETCH - with 401 retry
    // =====================================================

    async function authenticatedFetch(url, options = {}) {
        const authToken = await getToken();
        const response = await fetch(url, {
            ...options,
            headers: {
                ...getHeaders(authToken),
                ...options.headers
            }
        });

        // Handle 401 - refresh token and retry once
        if (response.status === 401) {
            console.log('[TPOS-Search] 401, refreshing token...');
            token = null;
            tokenExpiry = null;
            const newToken = await getToken();
            return fetch(url, {
                ...options,
                headers: {
                    ...getHeaders(newToken),
                    ...options.headers
                }
            });
        }

        return response;
    }

    // =====================================================
    // PRODUCT SEARCH
    // =====================================================

    /**
     * Search TPOS for a product by exact code (DefaultCode)
     * Used for duplicate checking: exists on TPOS?
     * @param {string} productCode - e.g. "N133"
     * @returns {Promise<Array>} - matching products (empty = not found)
     */
    async function searchProduct(productCode) {
        if (!productCode || typeof productCode !== 'string') return [];

        try {
            const code = productCode.trim().toUpperCase();
            const url = `${PROXY_URL}/api/odata/Product/OdataService.GetViewV2`
                + `?Active=true`
                + `&DefaultCode=${encodeURIComponent(code)}`
                + `&$top=1`
                + `&$orderby=DateCreated desc`
                + `&$count=true`;

            const response = await authenticatedFetch(url);
            if (!response.ok) return [];
            const data = await response.json();
            return data.value || [];
        } catch (error) {
            console.error('[TPOS-Search] searchProduct error:', error);
            return [];
        }
    }

    /**
     * Get max product code number from TPOS for a category prefix
     * Uses Product entity with OData $filter for prefix search
     * @param {string} category - 'N', 'P', or 'Q'
     * @returns {Promise<number>} - max number found (0 if none)
     */
    async function getMaxProductCode(category) {
        if (!category) return 0;
        const prefix = category.toUpperCase();

        try {
            // Use OData $filter on Product entity (supports startswith)
            // /api/odata/Product → tomato.tpos.vn/odata/Product
            const url = `${PROXY_URL}/api/odata/Product`
                + `?$filter=Active eq true and startswith(DefaultCode,'${prefix}')`
                + `&$orderby=Id desc`
                + `&$top=100`
                + `&$select=Id,DefaultCode`
                + `&$count=true`;

            console.log(`[TPOS-Search] getMaxProductCode query: ${url}`);
            const response = await authenticatedFetch(url);

            if (!response.ok) {
                console.warn(`[TPOS-Search] getMaxProductCode failed: ${response.status}`);
                // Fallback: try GetViewV2 with high range probe
                return await getMaxProductCodeFallback(prefix);
            }

            const data = await response.json();
            const regex = new RegExp(`^${prefix}(\\d+)`, 'i');
            let maxNum = 0;

            console.log(`[TPOS-Search] getMaxProductCode: ${data['@odata.count'] || data.value?.length || 0} products`);

            if (data.value && data.value.length > 0) {
                for (const product of data.value) {
                    const code = product.DefaultCode || '';
                    const match = code.match(regex);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > maxNum) maxNum = num;
                    }
                }
            }

            console.log(`[TPOS-Search] TPOS max for ${prefix}: ${maxNum}`);
            return maxNum;
        } catch (error) {
            console.error('[TPOS-Search] getMaxProductCode error:', error);
            return 0;
        }
    }

    /**
     * Fallback: probe high numbers to find max code
     * Binary search-like approach using searchProduct
     */
    async function getMaxProductCodeFallback(prefix) {
        console.log(`[TPOS-Search] Using fallback probe for ${prefix}`);
        const regex = new RegExp(`^${prefix}(\\d+)`, 'i');

        // Probe recent products from GetViewV2 (sorted by DateCreated desc = newest first)
        try {
            const url = `${PROXY_URL}/api/odata/Product/OdataService.GetViewV2`
                + `?Active=true`
                + `&$top=500`
                + `&$orderby=DateCreated desc`
                + `&$count=true`;

            const response = await authenticatedFetch(url);
            if (!response.ok) return 0;

            const data = await response.json();
            let maxNum = 0;

            if (data.value) {
                for (const product of data.value) {
                    const code = product.DefaultCode || '';
                    const match = code.match(regex);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > maxNum) maxNum = num;
                    }
                }
            }

            console.log(`[TPOS-Search] Fallback max for ${prefix}: ${maxNum} (from ${data.value?.length || 0} recent products)`);
            return maxNum;
        } catch (error) {
            console.error('[TPOS-Search] fallback error:', error);
            return 0;
        }
    }

    // Initialize
    loadFromStorage();
    console.log('[TPOS-Search] Loaded, token valid:', isTokenValid());

    // Clear cached token when shop changes (need new token for different company)
    window.addEventListener('shopChanged', () => {
        token = null;
        tokenExpiry = null;
        console.log('[TPOS-Search] Token cleared due to shop change');
    });

    return {
        searchProduct,
        getMaxProductCode,
        getToken,
        authenticatedFetch,
        isTokenValid: () => isTokenValid()
    };
})();
