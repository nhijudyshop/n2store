// =====================================================
// BILL TOKEN MANAGER - Separate TPOS Auth for Bill Creation
//
// Quản lý TPOS credentials riêng cho việc tạo bill (PBH)
// - Lưu vào Firestore: users/{webUserId}.billCredentials
// - Cache trong localStorage: bill_tpos_credentials
// =====================================================

class BillTokenManager {
    constructor() {
        this.storageKey = 'bill_tpos_credentials';
        this.tokenStorageKey = 'bill_tpos_token';
        this.API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/token';

        this.credentials = null; // { username, password } or { bearerToken }
        this.token = null;
        this.tokenExpiry = null;
        this.isRefreshing = false;

        // Load from localStorage immediately
        this.loadFromStorage();
    }

    // =====================================================
    // STORAGE METHODS
    // =====================================================

    /**
     * Load credentials from localStorage
     */
    loadFromStorage() {
        try {
            // Load credentials
            const credStr = localStorage.getItem(this.storageKey);
            if (credStr) {
                this.credentials = JSON.parse(credStr);
                console.log('[BILL-TOKEN] Loaded credentials from localStorage');
            }

            // Load cached token
            const tokenStr = localStorage.getItem(this.tokenStorageKey);
            if (tokenStr) {
                const tokenData = JSON.parse(tokenStr);
                this.token = tokenData.access_token;
                this.tokenExpiry = tokenData.expires_at;

                if (this.isTokenValid()) {
                    console.log('[BILL-TOKEN] Valid token loaded from localStorage');
                }
            }
        } catch (error) {
            console.error('[BILL-TOKEN] Error loading from storage:', error);
        }
    }

    /**
     * Save credentials to localStorage
     */
    saveToStorage() {
        try {
            if (this.credentials) {
                localStorage.setItem(this.storageKey, JSON.stringify(this.credentials));
            }
        } catch (error) {
            console.error('[BILL-TOKEN] Error saving to storage:', error);
        }
    }

    /**
     * Save token to localStorage
     */
    saveTokenToStorage(tokenData) {
        try {
            localStorage.setItem(this.tokenStorageKey, JSON.stringify(tokenData));
        } catch (error) {
            console.error('[BILL-TOKEN] Error saving token to storage:', error);
        }
    }

    /**
     * Clear all stored data
     */
    clearStorage() {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.tokenStorageKey);
        this.credentials = null;
        this.token = null;
        this.tokenExpiry = null;
    }

    // =====================================================
    // FIREBASE METHODS
    // =====================================================

    /**
     * Get current web user ID from authManager
     */
    getWebUserId() {
        try {
            const authData = window.authManager?.getAuthData?.() ||
                             window.authManager?.getAuthState?.();
            return authData?.username || authData?.userId || authData?.user?.username || null;
        } catch (error) {
            console.error('[BILL-TOKEN] Error getting web user ID:', error);
            return null;
        }
    }

    /**
     * Get Firestore reference for current user's billCredentials
     */
    getFirestoreRef() {
        const userId = this.getWebUserId();
        if (!userId) {
            console.warn('[BILL-TOKEN] No web user ID, cannot get Firestore ref');
            return null;
        }

        if (!window.firebase?.firestore) {
            console.warn('[BILL-TOKEN] Firestore not available');
            return null;
        }

        return window.firebase.firestore().collection('users').doc(userId);
    }

    /**
     * Save credentials to Firestore
     */
    async saveToFirestore() {
        const ref = this.getFirestoreRef();
        if (!ref || !this.credentials) return false;

        try {
            await ref.set({
                billCredentials: {
                    ...this.credentials,
                    updatedAt: Date.now()
                }
            }, { merge: true });

            console.log('[BILL-TOKEN] Credentials saved to Firestore');
            return true;
        } catch (error) {
            console.error('[BILL-TOKEN] Error saving to Firestore:', error);
            return false;
        }
    }

    /**
     * Load credentials from Firestore
     */
    async loadFromFirestore() {
        const ref = this.getFirestoreRef();
        if (!ref) return false;

        try {
            const doc = await ref.get();
            if (!doc.exists) {
                console.log('[BILL-TOKEN] No credentials in Firestore');
                return false;
            }

            const data = doc.data();
            if (data.billCredentials) {
                this.credentials = data.billCredentials;
                this.saveToStorage(); // Cache locally
                console.log('[BILL-TOKEN] Credentials loaded from Firestore');
                return true;
            }

            return false;
        } catch (error) {
            console.error('[BILL-TOKEN] Error loading from Firestore:', error);
            return false;
        }
    }

    // =====================================================
    // AUTHENTICATION METHODS
    // =====================================================

    /**
     * Check if token is valid
     */
    isTokenValid() {
        if (!this.token || !this.tokenExpiry) return false;
        const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
        return Date.now() < (this.tokenExpiry - bufferTime);
    }

    /**
     * Check if credentials are configured
     */
    hasCredentials() {
        if (!this.credentials) return false;
        return !!(this.credentials.bearerToken ||
                  (this.credentials.username && this.credentials.password));
    }

    /**
     * Set credentials (username/password or bearer token)
     * @param {Object} creds - { username, password } or { bearerToken }
     */
    async setCredentials(creds) {
        this.credentials = {
            ...creds,
            updatedAt: Date.now()
        };

        // Clear old token
        this.token = null;
        this.tokenExpiry = null;
        localStorage.removeItem(this.tokenStorageKey);

        // Save to localStorage
        this.saveToStorage();

        // Save to Firestore
        await this.saveToFirestore();

        console.log('[BILL-TOKEN] Credentials updated');
    }

    /**
     * Fetch new token from TPOS API
     */
    async fetchToken() {
        if (!this.hasCredentials()) {
            throw new Error('No credentials configured');
        }

        // If using direct bearer token
        if (this.credentials.bearerToken) {
            this.token = this.credentials.bearerToken;
            // Set expiry to 30 days from now (bearer tokens usually have long validity)
            this.tokenExpiry = Date.now() + (30 * 24 * 60 * 60 * 1000);

            const tokenData = {
                access_token: this.token,
                expires_at: this.tokenExpiry
            };
            this.saveTokenToStorage(tokenData);

            return this.token;
        }

        // Fetch using username/password
        const { username, password } = this.credentials;

        const formData = new URLSearchParams();
        formData.append('grant_type', 'password');
        formData.append('username', username);
        formData.append('password', password);
        formData.append('client_id', 'tmtWebApp');

        console.log(`[BILL-TOKEN] Fetching token for user: ${username}`);

        const response = await fetch(this.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Token fetch failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        if (!data.access_token) {
            throw new Error('Invalid token response');
        }

        // Calculate expiry (expires_in is in seconds)
        const expiresIn = data.expires_in || 3600;
        this.token = data.access_token;
        this.tokenExpiry = Date.now() + (expiresIn * 1000);

        // Save token data
        const tokenData = {
            access_token: this.token,
            refresh_token: data.refresh_token,
            expires_at: this.tokenExpiry,
            expires_in: expiresIn
        };
        this.saveTokenToStorage(tokenData);

        console.log('[BILL-TOKEN] Token fetched and cached');
        return this.token;
    }

    /**
     * Get valid token (refresh if needed)
     */
    async getToken() {
        // Return cached token if valid
        if (this.isTokenValid()) {
            return this.token;
        }

        // Prevent multiple simultaneous refreshes
        if (this.isRefreshing) {
            // Wait for refresh to complete
            await new Promise(resolve => setTimeout(resolve, 1000));
            return this.token;
        }

        this.isRefreshing = true;

        try {
            await this.fetchToken();
            return this.token;
        } finally {
            this.isRefreshing = false;
        }
    }

    /**
     * Get auth header for API requests
     */
    async getAuthHeader() {
        const token = await this.getToken();
        return {
            'Authorization': `Bearer ${token}`
        };
    }

    /**
     * Test credentials by fetching token
     */
    async testCredentials() {
        try {
            // Clear existing token to force fetch
            this.token = null;
            this.tokenExpiry = null;

            await this.fetchToken();
            return { success: true, message: 'Xác thực thành công!' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Get current credentials info (masked)
     */
    getCredentialsInfo() {
        if (!this.credentials) {
            return { configured: false };
        }

        if (this.credentials.bearerToken) {
            return {
                configured: true,
                type: 'bearer',
                preview: this.credentials.bearerToken.substring(0, 20) + '...'
            };
        }

        if (this.credentials.username) {
            return {
                configured: true,
                type: 'password',
                username: this.credentials.username
            };
        }

        return { configured: false };
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    /**
     * Initialize - load from Firestore if localStorage is empty
     */
    async init() {
        if (!this.hasCredentials()) {
            console.log('[BILL-TOKEN] No local credentials, trying Firestore...');
            await this.loadFromFirestore();
        }

        console.log('[BILL-TOKEN] Initialized. Has credentials:', this.hasCredentials());
    }
}

// Create global instance
window.billTokenManager = new BillTokenManager();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.billTokenManager.init();
    });
} else {
    window.billTokenManager.init();
}

console.log('[BILL-TOKEN] BillTokenManager loaded');
