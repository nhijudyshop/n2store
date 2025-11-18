// =====================================================
// PANCAKE TOKEN MANAGER - Quản lý JWT token với Firebase
// =====================================================

class PancakeTokenManager {
    constructor() {
        this.firebaseRef = null;
        this.currentToken = null;
        this.currentTokenExpiry = null;
    }

    /**
     * Initialize Firebase reference
     */
    initialize() {
        try {
            if (!window.firebase || !window.firebase.database) {
                console.warn('[PANCAKE-TOKEN] Firebase not available');
                return false;
            }

            this.firebaseRef = window.firebase.database().ref('pancake_jwt_token');
            console.log('[PANCAKE-TOKEN] Firebase reference initialized');
            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error initializing Firebase:', error);
            return false;
        }
    }

    /**
     * Decode JWT token để lấy expiry time
     * @param {string} token - JWT token
     * @returns {Object} { exp, uid, name, ... }
     */
    decodeToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid JWT format');
            }
            const payload = JSON.parse(atob(parts[1]));
            return payload;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error decoding token:', error);
            return null;
        }
    }

    /**
     * Check if token is expired
     * @param {number} exp - Expiry timestamp (seconds)
     * @returns {boolean}
     */
    isTokenExpired(exp) {
        if (!exp) return true;
        const now = Math.floor(Date.now() / 1000); // Convert to seconds
        const buffer = 60 * 60; // 1 hour buffer
        return now >= (exp - buffer);
    }

    /**
     * Lấy token từ Firebase
     * @returns {Promise<string|null>}
     */
    async getTokenFromFirebase() {
        try {
            if (!this.firebaseRef) {
                console.warn('[PANCAKE-TOKEN] Firebase not initialized');
                return null;
            }

            const snapshot = await this.firebaseRef.once('value');
            const data = snapshot.val();

            if (!data || !data.token) {
                console.log('[PANCAKE-TOKEN] No token in Firebase');
                return null;
            }

            // Check expiry
            const payload = this.decodeToken(data.token);
            if (!payload || this.isTokenExpired(payload.exp)) {
                console.log('[PANCAKE-TOKEN] Token in Firebase is expired');
                return null;
            }

            console.log('[PANCAKE-TOKEN] Valid token found in Firebase');
            this.currentToken = data.token;
            this.currentTokenExpiry = payload.exp;
            return data.token;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error getting token from Firebase:', error);
            return null;
        }
    }

    /**
     * Lưu token vào Firebase
     * @param {string} token - JWT token
     * @returns {Promise<boolean>}
     */
    async saveTokenToFirebase(token) {
        try {
            if (!this.firebaseRef) {
                console.warn('[PANCAKE-TOKEN] Firebase not initialized');
                return false;
            }

            const payload = this.decodeToken(token);
            if (!payload) {
                console.error('[PANCAKE-TOKEN] Invalid token, cannot save');
                return false;
            }

            const data = {
                token: token,
                exp: payload.exp,
                uid: payload.uid,
                name: payload.name,
                savedAt: Date.now()
            };

            await this.firebaseRef.set(data);
            console.log('[PANCAKE-TOKEN] ✅ Token saved to Firebase');
            console.log('[PANCAKE-TOKEN] Token expires at:', new Date(payload.exp * 1000).toLocaleString());

            this.currentToken = token;
            this.currentTokenExpiry = payload.exp;

            return true;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] ❌ Error saving token to Firebase:', error);
            return false;
        }
    }

    /**
     * Lấy token từ cookie Pancake.vn
     * @returns {string|null}
     */
    getTokenFromCookie() {
        try {
            const cookies = document.cookie.split(';');
            const jwtCookie = cookies.find(c => c.trim().startsWith('jwt='));
            if (jwtCookie) {
                const token = jwtCookie.split('=')[1].trim();
                console.log('[PANCAKE-TOKEN] Token found in cookie');
                return token;
            }
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error reading token from cookie:', error);
        }
        return null;
    }

    /**
     * Lấy token với priority:
     * 1. Firebase (nếu còn hạn)
     * 2. Cookie (nếu Firebase hết hạn)
     * 3. Null (cần nhập manual)
     *
     * Tự động lưu token mới từ cookie vào Firebase
     * @returns {Promise<string|null>}
     */
    async getToken() {
        // Priority 1: Check current token in memory
        if (this.currentToken && !this.isTokenExpired(this.currentTokenExpiry)) {
            console.log('[PANCAKE-TOKEN] Using cached token');
            return this.currentToken;
        }

        // Priority 2: Check Firebase
        const firebaseToken = await this.getTokenFromFirebase();
        if (firebaseToken) {
            console.log('[PANCAKE-TOKEN] Using token from Firebase');
            return firebaseToken;
        }

        // Priority 3: Check cookie
        const cookieToken = this.getTokenFromCookie();
        if (cookieToken) {
            const payload = this.decodeToken(cookieToken);
            if (payload && !this.isTokenExpired(payload.exp)) {
                console.log('[PANCAKE-TOKEN] Using token from cookie, saving to Firebase...');
                await this.saveTokenToFirebase(cookieToken);
                return cookieToken;
            } else {
                console.log('[PANCAKE-TOKEN] Cookie token is expired');
            }
        }

        // No valid token found
        console.warn('[PANCAKE-TOKEN] No valid token found. Please login to Pancake.vn or set token manually.');
        return null;
    }

    /**
     * Set token manual (từ UI)
     * @param {string} token - JWT token
     * @returns {Promise<boolean>}
     */
    async setTokenManual(token) {
        try {
            // Validate token
            const payload = this.decodeToken(token);
            if (!payload) {
                throw new Error('Invalid JWT token format');
            }

            if (this.isTokenExpired(payload.exp)) {
                throw new Error('Token is expired');
            }

            // Save to Firebase
            const saved = await this.saveTokenToFirebase(token);
            if (!saved) {
                throw new Error('Failed to save token to Firebase');
            }

            console.log('[PANCAKE-TOKEN] ✅ Manual token set successfully');
            return true;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] ❌ Error setting manual token:', error);
            throw error;
        }
    }

    /**
     * Get token info (for display)
     * @returns {Object|null}
     */
    getTokenInfo() {
        if (!this.currentToken) return null;

        const payload = this.decodeToken(this.currentToken);
        if (!payload) return null;

        return {
            name: payload.name,
            uid: payload.uid,
            exp: payload.exp,
            expiryDate: new Date(payload.exp * 1000).toLocaleString(),
            isExpired: this.isTokenExpired(payload.exp)
        };
    }

    /**
     * Clear token
     * @returns {Promise<boolean>}
     */
    async clearToken() {
        try {
            if (this.firebaseRef) {
                await this.firebaseRef.remove();
                console.log('[PANCAKE-TOKEN] Token cleared from Firebase');
            }
            this.currentToken = null;
            this.currentTokenExpiry = null;
            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error clearing token:', error);
            return false;
        }
    }
}

// Create global instance
window.pancakeTokenManager = new PancakeTokenManager();
console.log('[PANCAKE-TOKEN] PancakeTokenManager loaded');
