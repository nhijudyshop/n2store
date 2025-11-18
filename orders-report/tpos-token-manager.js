// =====================================================
// TPOS TOKEN MANAGER - Quản lý bearer token với Firebase
// =====================================================

class TposTokenManager {
    constructor() {
        this.firebaseRef = null;
        this.currentToken = null;
        this.currentTokenExpiry = null;
        this.memoryCache = {
            token: null,
            expiry: null
        };
    }

    /**
     * Initialize Firebase reference
     */
    initialize() {
        try {
            if (!window.firebase || !window.firebase.database) {
                console.warn('[TPOS-TOKEN] Firebase not available');
                return false;
            }

            this.firebaseRef = window.firebase.database().ref('tpos_bearer_token');
            console.log('[TPOS-TOKEN] Firebase reference initialized');
            return true;
        } catch (error) {
            console.error('[TPOS-TOKEN] Error initializing Firebase:', error);
            return false;
        }
    }

    /**
     * Check if token is expired
     * @param {number} expiryTimestamp - Expiry timestamp in milliseconds
     * @returns {boolean}
     */
    isTokenExpired(expiryTimestamp) {
        if (!expiryTimestamp) return true;
        const now = Date.now();
        const buffer = 5 * 60 * 1000; // 5 minutes buffer
        return now >= (expiryTimestamp - buffer);
    }

    /**
     * Lấy token từ Firebase
     * @returns {Promise<string|null>}
     */
    async getTokenFromFirebase() {
        try {
            if (!this.firebaseRef) {
                console.warn('[TPOS-TOKEN] Firebase not initialized');
                return null;
            }

            const snapshot = await this.firebaseRef.once('value');
            const data = snapshot.val();

            if (!data || !data.access_token || !data.expiry) {
                console.log('[TPOS-TOKEN] No valid token in Firebase');
                return null;
            }

            // Check expiry
            if (this.isTokenExpired(data.expiry)) {
                console.log('[TPOS-TOKEN] Token in Firebase is expired');
                // Clean up expired token
                await this.firebaseRef.remove();
                return null;
            }

            console.log('[TPOS-TOKEN] Valid token found in Firebase');
            console.log('[TPOS-TOKEN] Token expires at:', new Date(data.expiry).toLocaleString('vi-VN'));

            this.currentToken = data.access_token;
            this.currentTokenExpiry = data.expiry;
            this.memoryCache = {
                token: data.access_token,
                expiry: data.expiry
            };

            return data.access_token;

        } catch (error) {
            console.error('[TPOS-TOKEN] Error getting token from Firebase:', error);
            return null;
        }
    }

    /**
     * Lưu token lên Firebase
     * @param {string} accessToken - Bearer token
     * @param {number} expiresIn - Token lifetime in seconds
     * @returns {Promise<boolean>}
     */
    async saveTokenToFirebase(accessToken, expiresIn) {
        try {
            if (!this.firebaseRef) {
                console.warn('[TPOS-TOKEN] Firebase not initialized, cannot save token');
                return false;
            }

            // Calculate expiry timestamp
            const expiryTimestamp = Date.now() + (expiresIn * 1000);

            const tokenData = {
                access_token: accessToken,
                expiry: expiryTimestamp,
                saved_at: Date.now(),
                expires_in: expiresIn
            };

            await this.firebaseRef.set(tokenData);

            this.currentToken = accessToken;
            this.currentTokenExpiry = expiryTimestamp;
            this.memoryCache = {
                token: accessToken,
                expiry: expiryTimestamp
            };

            console.log('[TPOS-TOKEN] ✅ Token saved to Firebase');
            console.log('[TPOS-TOKEN] Token expires at:', new Date(expiryTimestamp).toLocaleString('vi-VN'));
            console.log('[TPOS-TOKEN] Token lifetime:', Math.floor(expiresIn / 3600), 'hours');

            return true;

        } catch (error) {
            console.error('[TPOS-TOKEN] Error saving token to Firebase:', error);
            return false;
        }
    }

    /**
     * Lấy token hợp lệ (từ cache, Firebase, hoặc request mới)
     * @param {Function} fetchNewToken - Function to fetch new token if needed
     * @returns {Promise<string|null>}
     */
    async getValidToken(fetchNewToken) {
        // 1. Check memory cache first
        if (this.memoryCache.token && !this.isTokenExpired(this.memoryCache.expiry)) {
            console.log('[TPOS-TOKEN] Using cached token from memory');
            return this.memoryCache.token;
        }

        // 2. Try Firebase
        const firebaseToken = await this.getTokenFromFirebase();
        if (firebaseToken) {
            return firebaseToken;
        }

        // 3. Fetch new token
        if (typeof fetchNewToken === 'function') {
            console.log('[TPOS-TOKEN] No valid token found, fetching new one...');
            try {
                const tokenData = await fetchNewToken();
                if (tokenData && tokenData.access_token && tokenData.expires_in) {
                    await this.saveTokenToFirebase(tokenData.access_token, tokenData.expires_in);
                    return tokenData.access_token;
                }
            } catch (error) {
                console.error('[TPOS-TOKEN] Error fetching new token:', error);
                return null;
            }
        }

        return null;
    }

    /**
     * Clear token from Firebase and memory
     * @returns {Promise<boolean>}
     */
    async clearToken() {
        try {
            if (this.firebaseRef) {
                await this.firebaseRef.remove();
            }

            this.currentToken = null;
            this.currentTokenExpiry = null;
            this.memoryCache = {
                token: null,
                expiry: null
            };

            console.log('[TPOS-TOKEN] Token cleared');
            return true;

        } catch (error) {
            console.error('[TPOS-TOKEN] Error clearing token:', error);
            return false;
        }
    }

    /**
     * Get current token without fetching new one
     * @returns {string|null}
     */
    getCurrentToken() {
        if (this.memoryCache.token && !this.isTokenExpired(this.memoryCache.expiry)) {
            return this.memoryCache.token;
        }
        return null;
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.tposTokenManager = new TposTokenManager();
    console.log('[TPOS-TOKEN] TposTokenManager loaded');
}
