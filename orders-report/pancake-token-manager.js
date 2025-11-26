// =====================================================
// PANCAKE TOKEN MANAGER - Quản lý JWT token với Firebase
// =====================================================

class PancakeTokenManager {
    constructor() {
        this.firebaseRef = null;
        this.accountsRef = null;
        this.currentToken = null;
        this.currentTokenExpiry = null;
        this.activeAccountId = null;
        this.accounts = {};
    }

    /**
     * Initialize Firebase reference
     */
    async initialize() {
        try {
            if (!window.firebase || !window.firebase.database) {
                console.warn('[PANCAKE-TOKEN] Firebase not available');
                return false;
            }

            // New multi-account structure
            this.firebaseRef = window.firebase.database().ref('pancake_jwt_tokens');
            this.accountsRef = this.firebaseRef.child('accounts');

            // Load accounts and active account
            await this.loadAccounts();

            console.log('[PANCAKE-TOKEN] Firebase reference initialized');
            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error initializing Firebase:', error);
            return false;
        }
    }

    /**
     * Load all accounts from Firebase
     */
    async loadAccounts() {
        try {
            const snapshot = await this.accountsRef.once('value');
            this.accounts = snapshot.val() || {};

            // Load active account ID
            const activeSnapshot = await this.firebaseRef.child('activeAccountId').once('value');
            this.activeAccountId = activeSnapshot.val();

            // If active account is set, load its token
            if (this.activeAccountId && this.accounts[this.activeAccountId]) {
                const account = this.accounts[this.activeAccountId];
                this.currentToken = account.token;
                this.currentTokenExpiry = account.exp;
            }

            console.log('[PANCAKE-TOKEN] Loaded accounts:', Object.keys(this.accounts).length);
            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error loading accounts:', error);
            return false;
        }
    }

    /**
     * Decode base64url (JWT uses base64url encoding)
     * @param {string} str - Base64url encoded string
     * @returns {string} - Decoded string
     */
    base64UrlDecode(str) {
        // Replace URL-safe characters
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

        // Add padding if needed
        const pad = base64.length % 4;
        if (pad) {
            if (pad === 1) {
                throw new Error('Invalid base64 string');
            }
            base64 += new Array(5 - pad).join('=');
        }

        return atob(base64);
    }

    /**
     * Decode JWT token để lấy expiry time
     * @param {string} token - JWT token
     * @returns {Object} { exp, uid, name, ... }
     */
    decodeToken(token) {
        try {
            if (!token || typeof token !== 'string') {
                console.error('[PANCAKE-TOKEN] Token must be a string');
                return null;
            }

            const parts = token.split('.');
            if (parts.length !== 3) {
                console.error('[PANCAKE-TOKEN] Token must have 3 parts, got:', parts.length);
                return null;
            }

            // Decode payload (second part)
            const payloadBase64 = parts[1];
            const payloadJson = this.base64UrlDecode(payloadBase64);
            const payload = JSON.parse(payloadJson);

            console.log('[PANCAKE-TOKEN] Token decoded successfully');
            return payload;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error decoding token:', error.message);
            console.error('[PANCAKE-TOKEN] Token length:', token?.length);
            console.error('[PANCAKE-TOKEN] Token preview:', token?.substring(0, 50) + '...');
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
     * Lấy token từ Firebase (active account)
     * @returns {Promise<string|null>}
     */
    async getTokenFromFirebase() {
        try {
            if (!this.accountsRef) {
                console.warn('[PANCAKE-TOKEN] Firebase not initialized');
                return null;
            }

            // Reload active account
            const activeSnapshot = await this.firebaseRef.child('activeAccountId').once('value');
            this.activeAccountId = activeSnapshot.val();

            if (!this.activeAccountId) {
                console.log('[PANCAKE-TOKEN] No active account set');
                return null;
            }

            const accountSnapshot = await this.accountsRef.child(this.activeAccountId).once('value');
            const data = accountSnapshot.val();

            if (!data || !data.token) {
                console.log('[PANCAKE-TOKEN] No token in active account');
                return null;
            }

            // Sanitize token - remove 'jwt=' prefix if exists
            let token = data.token;
            if (token.startsWith('jwt=')) {
                token = token.substring(4);
                console.log('[PANCAKE-TOKEN] Stripped jwt= prefix from Firebase token');
            }

            // Check expiry
            const payload = this.decodeToken(token);
            if (!payload || this.isTokenExpired(payload.exp)) {
                console.log('[PANCAKE-TOKEN] Token in active account is expired');
                return null;
            }

            console.log('[PANCAKE-TOKEN] Valid token found in active account');
            this.currentToken = token;
            this.currentTokenExpiry = payload.exp;
            return token;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error getting token from Firebase:', error);
            return null;
        }
    }

    /**
     * Lưu token vào Firebase (as new account or update existing)
     * @param {string} token - JWT token (cleaned)
     * @param {string} accountId - Optional account ID, auto-generated if not provided
     * @returns {Promise<string>} - Returns account ID
     */
    async saveTokenToFirebase(token, accountId = null) {
        try {
            if (!this.accountsRef) {
                console.warn('[PANCAKE-TOKEN] Firebase not initialized');
                return null;
            }

            // Clean token - remove jwt= prefix if exists
            let cleanedToken = token.trim();
            if (cleanedToken.startsWith('jwt=')) {
                cleanedToken = cleanedToken.substring(4).trim();
            }

            const payload = this.decodeToken(cleanedToken);
            if (!payload) {
                console.error('[PANCAKE-TOKEN] Invalid token, cannot save');
                return null;
            }

            // Generate account ID if not provided (use uid from token)
            if (!accountId) {
                accountId = payload.uid || `account_${Date.now()}`;
            }

            const data = {
                token: cleanedToken,
                exp: payload.exp,
                uid: payload.uid,
                name: payload.name || 'Unknown User',
                savedAt: Date.now()
            };

            // Save account
            await this.accountsRef.child(accountId).set(data);

            // Set as active account
            await this.firebaseRef.child('activeAccountId').set(accountId);

            // Update local state
            this.accounts[accountId] = data;
            this.activeAccountId = accountId;
            this.currentToken = cleanedToken;
            this.currentTokenExpiry = payload.exp;

            console.log('[PANCAKE-TOKEN] ✅ Token saved to Firebase as account:', accountId);
            console.log('[PANCAKE-TOKEN] Token expires at:', new Date(payload.exp * 1000).toLocaleString());

            return accountId;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] ❌ Error saving token to Firebase:', error);
            return null;
        }
    }

    /**
     * Get all accounts
     * @returns {Object} - { accountId: { name, uid, exp, savedAt, token }, ... }
     */
    getAllAccounts() {
        return this.accounts;
    }

    /**
     * Set active account
     * @param {string} accountId - Account ID to activate
     * @returns {Promise<boolean>}
     */
    async setActiveAccount(accountId) {
        try {
            if (!this.accounts[accountId]) {
                console.error('[PANCAKE-TOKEN] Account not found:', accountId);
                return false;
            }

            // Check if token is expired
            const account = this.accounts[accountId];
            if (this.isTokenExpired(account.exp)) {
                console.error('[PANCAKE-TOKEN] Cannot activate expired account');
                return false;
            }

            await this.firebaseRef.child('activeAccountId').set(accountId);
            this.activeAccountId = accountId;
            this.currentToken = account.token;
            this.currentTokenExpiry = account.exp;

            console.log('[PANCAKE-TOKEN] ✅ Active account set to:', accountId);
            return true;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error setting active account:', error);
            return false;
        }
    }

    /**
     * Delete account
     * @param {string} accountId - Account ID to delete
     * @returns {Promise<boolean>}
     */
    async deleteAccount(accountId) {
        try {
            if (!this.accounts[accountId]) {
                console.error('[PANCAKE-TOKEN] Account not found:', accountId);
                return false;
            }

            await this.accountsRef.child(accountId).remove();
            delete this.accounts[accountId];

            // If deleted account was active, clear active account
            if (this.activeAccountId === accountId) {
                await this.firebaseRef.child('activeAccountId').remove();
                this.activeAccountId = null;
                this.currentToken = null;
                this.currentTokenExpiry = null;

                // Auto-select first available account
                const accountIds = Object.keys(this.accounts);
                if (accountIds.length > 0) {
                    await this.setActiveAccount(accountIds[0]);
                }
            }

            console.log('[PANCAKE-TOKEN] ✅ Account deleted:', accountId);
            return true;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error deleting account:', error);
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
                // Split by '=' and take everything after the first '='
                const parts = jwtCookie.split('=');
                // Join back in case JWT contains '=' characters
                let token = parts.slice(1).join('=').trim();

                // Strip 'jwt=' prefix if exists (safety check)
                if (token.startsWith('jwt=')) {
                    token = token.substring(4);
                }

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
     * @returns {Promise<string>} - Returns account ID
     */
    async setTokenManual(token) {
        try {
            if (!token) {
                throw new Error('Token không được để trống');
            }

            console.log('[PANCAKE-TOKEN] Cleaning token input...');

            // Clean token - trim whitespace and newlines
            let cleanedToken = token.trim();

            // Remove jwt= prefix if exists (case insensitive)
            if (cleanedToken.toLowerCase().startsWith('jwt=')) {
                cleanedToken = cleanedToken.substring(4).trim();
            }

            // Remove quotes if present
            cleanedToken = cleanedToken.replace(/^["']|["']$/g, '');

            // Remove any whitespace, tabs, newlines within the token
            cleanedToken = cleanedToken.replace(/\s+/g, '');

            // Remove trailing semicolons or commas
            cleanedToken = cleanedToken.replace(/[;,]+$/g, '');

            console.log('[PANCAKE-TOKEN] Cleaned token length:', cleanedToken.length);

            // Validate not empty after cleaning
            if (!cleanedToken) {
                throw new Error('Token trống sau khi làm sạch. Vui lòng kiểm tra lại token.');
            }

            // Validate token format (should have 3 parts separated by dots)
            const parts = cleanedToken.split('.');
            if (parts.length !== 3) {
                throw new Error(`Token không đúng định dạng JWT (có ${parts.length} phần, cần 3 phần cách nhau bởi dấu chấm)`);
            }

            // Check each part is not empty
            if (!parts[0] || !parts[1] || !parts[2]) {
                throw new Error('Token có phần trống, vui lòng kiểm tra lại');
            }

            console.log('[PANCAKE-TOKEN] Token format valid, decoding...');

            // Decode and validate
            const payload = this.decodeToken(cleanedToken);
            if (!payload) {
                throw new Error('Không thể giải mã token. Token có thể bị hỏng hoặc không hợp lệ. Vui lòng lấy token mới từ Pancake.');
            }

            console.log('[PANCAKE-TOKEN] Token decoded, checking expiry...');

            if (this.isTokenExpired(payload.exp)) {
                const expiryDate = new Date(payload.exp * 1000).toLocaleString('vi-VN');
                throw new Error(`Token đã hết hạn vào ${expiryDate}. Vui lòng đăng nhập lại Pancake để lấy token mới.`);
            }

            console.log('[PANCAKE-TOKEN] Token valid, saving to Firebase...');

            // Save to Firebase
            const accountId = await this.saveTokenToFirebase(cleanedToken);
            if (!accountId) {
                throw new Error('Không thể lưu token vào Firebase. Vui lòng thử lại.');
            }

            console.log('[PANCAKE-TOKEN] ✅ Manual token set successfully');
            return accountId;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] ❌ Error setting manual token:', error);
            throw error;
        }
    }

    /**
     * Get token info (for display) - active account
     * @returns {Object|null}
     */
    getTokenInfo() {
        if (!this.activeAccountId || !this.accounts[this.activeAccountId]) {
            return null;
        }

        const account = this.accounts[this.activeAccountId];
        return {
            accountId: this.activeAccountId,
            name: account.name,
            uid: account.uid,
            exp: account.exp,
            expiryDate: new Date(account.exp * 1000).toLocaleString(),
            isExpired: this.isTokenExpired(account.exp),
            savedAt: new Date(account.savedAt).toLocaleString()
        };
    }

    /**
     * Get token info for specific account
     * @param {string} accountId - Account ID
     * @returns {Object|null}
     */
    getAccountInfo(accountId) {
        if (!this.accounts[accountId]) {
            return null;
        }

        const account = this.accounts[accountId];
        return {
            accountId: accountId,
            name: account.name,
            uid: account.uid,
            exp: account.exp,
            expiryDate: new Date(account.exp * 1000).toLocaleString(),
            isExpired: this.isTokenExpired(account.exp),
            savedAt: new Date(account.savedAt).toLocaleString(),
            isActive: this.activeAccountId === accountId
        };
    }

    /**
     * Clear all tokens and accounts
     * @returns {Promise<boolean>}
     */
    async clearToken() {
        try {
            if (this.firebaseRef) {
                await this.firebaseRef.remove();
                console.log('[PANCAKE-TOKEN] All tokens cleared from Firebase');
            }
            this.accounts = {};
            this.activeAccountId = null;
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
