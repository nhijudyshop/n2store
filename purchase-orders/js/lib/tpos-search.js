/**
 * TPOS Search Client for Purchase Orders
 * Provides window.TPOSClient for product code operations
 *
 * Token flow:
 *   CompanyId 1: password login → token (CompanyId 1) + refresh_token
 *   CompanyId 2: SwitchCompany(2) → refresh_token → token (CompanyId 2)
 *
 * Tokens cached per company in localStorage
 * All requests go through Cloudflare proxy to bypass CORS
 */

window.TPOSClient = (function() {
    'use strict';

    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const TOKEN_URL = `${PROXY_URL}/api/token`;
    const SWITCH_COMPANY_URL = `${PROXY_URL}/api/odata/ApplicationUser/ODataService.SwitchCompany`;
    const TOKEN_BUFFER = 5 * 60 * 1000; // 5 minutes before expiry

    const CREDENTIALS = {
        grant_type: 'password',
        username: 'nvkt',
        password: 'Aa@123456789',
        client_id: 'tmtWebApp'
    };

    // Token storage per company: { access_token, refresh_token, expires_at }
    const tokenStore = {};
    let refreshPromise = null;

    function storageKey(companyId) {
        return `bearer_token_data_${companyId}`;
    }

    function getCompanyId() {
        return window.ShopConfig?.getConfig()?.CompanyId || 1;
    }

    // =====================================================
    // HEADERS - match working pattern from dialogs.js
    // =====================================================

    function getHeaders(authToken) {
        return {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'feature-version': '2',
            'tposappversion': '6.2.6.1'
        };
    }

    // =====================================================
    // TOKEN MANAGEMENT - per company
    // =====================================================

    function isTokenValid(companyId) {
        const t = tokenStore[companyId];
        return t && t.access_token && t.expires_at && Date.now() < (t.expires_at - TOKEN_BUFFER);
    }

    function loadFromStorage(companyId) {
        try {
            const stored = localStorage.getItem(storageKey(companyId));
            if (stored) {
                const data = JSON.parse(stored);
                if (data.access_token && data.expires_at && Date.now() < (data.expires_at - TOKEN_BUFFER)) {
                    tokenStore[companyId] = data;
                    return true;
                }
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    /**
     * Try to get a refresh_token from localStorage (even if access_token expired)
     */
    function getStoredRefreshToken(companyId) {
        try {
            const stored = localStorage.getItem(storageKey(companyId));
            if (stored) {
                const data = JSON.parse(stored);
                if (data.refresh_token) return data.refresh_token;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    /**
     * Refresh token directly using a stored refresh_token.
     * Returns true if successful, false otherwise.
     */
    async function refreshWithToken(companyId, refreshToken) {
        try {
            console.log(`[TPOS-Search] Refreshing token for company ${companyId} using refresh_token...`);
            const response = await fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=tmtWebApp`
            });

            if (!response.ok) {
                console.warn(`[TPOS-Search] Refresh token failed: ${response.status}`);
                return false;
            }

            const data = await response.json();
            saveToken(companyId, data);
            console.log(`[TPOS-Search] Token refreshed OK for company ${companyId}`);
            return true;
        } catch (e) {
            console.warn('[TPOS-Search] Refresh token error:', e);
            return false;
        }
    }

    async function loadFromFirestore(companyId) {
        try {
            if (!window.firebase || !window.firebase.firestore) return false;
            const docId = companyId === 1 ? 'tpos_token' : `tpos_token_${companyId}`;
            const doc = await firebase.firestore().collection('tokens').doc(docId).get();
            if (!doc.exists) return false;
            const data = doc.data();
            if (data.access_token && data.expires_at && Date.now() < (data.expires_at - TOKEN_BUFFER)) {
                tokenStore[companyId] = data;
                try {
                    localStorage.setItem(storageKey(companyId), JSON.stringify(data));
                } catch (e) { /* ignore */ }
                console.log(`[TPOS-Search] Token loaded from Firestore for company ${companyId}`);
                return true;
            }
        } catch (e) {
            console.warn('[TPOS-Search] Firestore token load failed:', e);
        }
        return false;
    }

    function saveToken(companyId, tokenData) {
        const expiresAt = Date.now() + (tokenData.expires_in * 1000);
        const dataToSave = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || null,
            token_type: 'Bearer',
            expires_in: tokenData.expires_in,
            expires_at: expiresAt,
            issued_at: Date.now()
        };
        tokenStore[companyId] = dataToSave;

        try {
            localStorage.setItem(storageKey(companyId), JSON.stringify(dataToSave));
        } catch (e) { /* ignore */ }

        // Also save to Firestore
        try {
            if (window.firebase && window.firebase.firestore) {
                const docId = companyId === 1 ? 'tpos_token' : `tpos_token_${companyId}`;
                firebase.firestore().collection('tokens').doc(docId).set(dataToSave, { merge: true });
            }
        } catch (e) { /* ignore */ }
    }

    /**
     * Password login → always gets CompanyId 1 token + refresh_token
     */
    async function loginWithPassword() {
        console.log('[TPOS-Search] Password login...');
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(CREDENTIALS).toString()
        });

        if (!response.ok) {
            throw new Error(`Token fetch failed: ${response.status}`);
        }

        const data = await response.json();
        saveToken(1, data);
        console.log('[TPOS-Search] Password login OK, CompanyId 1 token saved');
        return data;
    }

    /**
     * SwitchCompany + refresh_token → get token for target company
     * Flow: SwitchCompany(targetCompanyId) → refresh_token → new token
     */
    async function switchCompanyToken(targetCompanyId) {
        console.log(`[TPOS-Search] Switching to company ${targetCompanyId}...`);

        // Always ensure a fresh, valid company 1 token first
        if (!isTokenValid(1) || !tokenStore[1]?.refresh_token) {
            await loginWithPassword();
        }
        let currentToken = tokenStore[1];

        // Step 1: Call SwitchCompany
        let switchResponse = await fetch(SWITCH_COMPANY_URL, {
            method: 'POST',
            headers: {
                ...getHeaders(currentToken.access_token),
                'Content-Type': 'application/json;charset=UTF-8'
            },
            body: JSON.stringify({ companyId: targetCompanyId })
        });

        // If 401, force fresh login and retry SwitchCompany once
        if (switchResponse.status === 401) {
            console.log('[TPOS-Search] SwitchCompany 401, forcing fresh login...');
            delete tokenStore[1];
            try { localStorage.removeItem(storageKey(1)); } catch (e) { /* ignore */ }
            await loginWithPassword();
            currentToken = tokenStore[1];

            switchResponse = await fetch(SWITCH_COMPANY_URL, {
                method: 'POST',
                headers: {
                    ...getHeaders(currentToken.access_token),
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                body: JSON.stringify({ companyId: targetCompanyId })
            });
        }

        if (!switchResponse.ok) {
            console.error(`[TPOS-Search] SwitchCompany failed: ${switchResponse.status}`);
            throw new Error(`SwitchCompany failed: ${switchResponse.status}`);
        }
        console.log(`[TPOS-Search] SwitchCompany(${targetCompanyId}) OK`);

        // Step 2: Refresh token to get new token with target CompanyId
        const refreshToken = currentToken.refresh_token;
        if (!refreshToken) {
            throw new Error('No refresh_token available for token refresh');
        }

        const refreshResponse = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${currentToken.access_token}`
            },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=tmtWebApp`
        });

        if (!refreshResponse.ok) {
            console.error(`[TPOS-Search] Token refresh failed: ${refreshResponse.status}`);
            throw new Error(`Token refresh failed: ${refreshResponse.status}`);
        }

        const newTokenData = await refreshResponse.json();
        saveToken(targetCompanyId, newTokenData);
        console.log(`[TPOS-Search] Company ${targetCompanyId} token saved`);
        return newTokenData;
    }

    /**
     * Get valid token for current company
     */
    async function getToken() {
        const companyId = getCompanyId();

        // Check in-memory
        if (isTokenValid(companyId)) {
            return tokenStore[companyId].access_token;
        }

        // Check localStorage
        if (loadFromStorage(companyId) && isTokenValid(companyId)) {
            return tokenStore[companyId].access_token;
        }

        // Check Firestore
        if (await loadFromFirestore(companyId) && isTokenValid(companyId)) {
            return tokenStore[companyId].access_token;
        }

        // Prevent concurrent refresh
        if (refreshPromise) {
            await refreshPromise;
            if (isTokenValid(companyId)) return tokenStore[companyId].access_token;
        }

        // Try refresh_token from localStorage first (avoids SwitchCompany)
        const storedRefresh = getStoredRefreshToken(companyId);
        if (storedRefresh) {
            refreshPromise = (async () => {
                try {
                    return await refreshWithToken(companyId, storedRefresh);
                } finally {
                    refreshPromise = null;
                }
            })();

            const refreshOk = await refreshPromise;
            if (refreshOk && isTokenValid(companyId)) {
                return tokenStore[companyId].access_token;
            }
        }

        // Last resort: full login → SwitchCompany flow
        refreshPromise = (async () => {
            try {
                await switchCompanyToken(companyId);
            } finally {
                refreshPromise = null;
            }
        })();

        await refreshPromise;
        return tokenStore[companyId]?.access_token;
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

        // Handle 401 - clear access_token, keep refresh_token for retry, then refresh
        if (response.status === 401) {
            const companyId = getCompanyId();
            console.log(`[TPOS-Search] 401, clearing access_token for company ${companyId} and refreshing...`);

            // Preserve refresh_token, invalidate access_token in all caches
            const savedRefresh = tokenStore[companyId]?.refresh_token || getStoredRefreshToken(companyId);
            delete tokenStore[companyId];
            // Invalidate localStorage access_token but keep refresh_token
            try {
                if (savedRefresh) {
                    localStorage.setItem(storageKey(companyId), JSON.stringify({
                        refresh_token: savedRefresh, expires_at: 0
                    }));
                } else {
                    localStorage.removeItem(storageKey(companyId));
                }
            } catch (e) { /* ignore */ }
            try {
                if (window.firebase && window.firebase.firestore) {
                    const docId = companyId === 1 ? 'tpos_token' : `tpos_token_${companyId}`;
                    firebase.firestore().collection('tokens').doc(docId).delete();
                }
            } catch (e) { /* ignore */ }

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

    // =====================================================
    // INITIALIZE - migrate old storage key
    // =====================================================

    // Migrate old single-key storage to company-1 key
    try {
        const oldData = localStorage.getItem('bearer_token_data');
        if (oldData) {
            const parsed = JSON.parse(oldData);
            if (parsed.access_token && !localStorage.getItem(storageKey(1))) {
                localStorage.setItem(storageKey(1), oldData);
            }
            localStorage.removeItem('bearer_token_data');
        }
    } catch (e) { /* ignore */ }

    loadFromStorage(getCompanyId());
    console.log(`[TPOS-Search] Loaded, company: ${getCompanyId()}, token valid: ${isTokenValid(getCompanyId())}`);

    return {
        searchProduct,
        getMaxProductCode,
        getToken,
        authenticatedFetch,
        isTokenValid: () => isTokenValid(getCompanyId())
    };
})();
