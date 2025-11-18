// =====================================================
// BEARER TOKEN MANAGER - Auto Refresh & Storage
// =====================================================

class TokenManager {
    constructor() {
        this.token = null;
        this.tokenExpiry = null;
        this.isRefreshing = false;
        this.storageKey = 'bearer_token_data';
        this.API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/token';
        this.credentials = {
            grant_type: 'password',
            username: 'nvkt',
            password: 'Aa@123456789',
            client_id: 'tmtWebApp'
        };
        this.firebaseRef = null;
        this.initFirebase();
        this.init();
    }

    initFirebase() {
        try {
            if (window.firebase && window.firebase.database) {
                this.firebaseRef = window.firebase.database().ref('tpos_token');
                console.log('[TOKEN] Firebase reference initialized');
                return true;
            } else {
                console.warn('[TOKEN] Firebase not available yet, will use localStorage only');
                return false;
            }
        } catch (error) {
            console.error('[TOKEN] Error initializing Firebase:', error);
            return false;
        }
    }

    /**
     * Retry Firebase initialization (can be called after Firebase loads)
     */
    retryFirebaseInit() {
        if (this.firebaseRef) {
            console.log('[TOKEN] Firebase already initialized');
            return true;
        }
        console.log('[TOKEN] Retrying Firebase initialization...');
        return this.initFirebase();
    }

    async init() {
        console.log('[TOKEN] Initializing Token Manager...');

        // Try Firebase first
        const firebaseToken = await this.getTokenFromFirebase();
        if (firebaseToken) {
            this.token = firebaseToken.access_token;
            this.tokenExpiry = firebaseToken.expires_at;
            console.log('[TOKEN] Valid token loaded from Firebase');
            return;
        }

        // Fallback to localStorage
        this.loadFromStorage();

        // Check if token is valid on init
        if (!this.isTokenValid()) {
            console.log('[TOKEN] No valid token found, will fetch on first request');
        } else {
            console.log('[TOKEN] Valid token loaded from localStorage');
        }
    }

    async getTokenFromFirebase() {
        if (!this.firebaseRef) {
            return null;
        }

        try {
            const snapshot = await this.firebaseRef.once('value');
            const tokenData = snapshot.val();

            if (!tokenData || !tokenData.access_token) {
                console.log('[TOKEN] No token found in Firebase');
                return null;
            }

            // Check if token is still valid
            const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
            if (Date.now() < (tokenData.expires_at - bufferTime)) {
                console.log('[TOKEN] Valid token found in Firebase');
                return tokenData;
            } else {
                console.log('[TOKEN] Token in Firebase is expired');
                return null;
            }

        } catch (error) {
            console.error('[TOKEN] Error reading token from Firebase:', error);
            return null;
        }
    }

    async saveTokenToFirebase(tokenData) {
        if (!this.firebaseRef) {
            console.warn('[TOKEN] Cannot save to Firebase - reference not available');
            return;
        }

        try {
            await this.firebaseRef.set(tokenData);
            console.log('[TOKEN] Token saved to Firebase');
        } catch (error) {
            console.error('[TOKEN] Error saving token to Firebase:', error);
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return;

            const data = JSON.parse(stored);
            this.token = data.access_token;
            this.tokenExpiry = data.expires_at;

            console.log('[TOKEN] Loaded token from storage');
        } catch (error) {
            console.error('[TOKEN] Error loading token:', error);
            this.clearToken();
        }
    }

    async saveToStorage(tokenData) {
        try {
            const expiresAt = Date.now() + (tokenData.expires_in * 1000);

            const dataToSave = {
                access_token: tokenData.access_token,
                token_type: tokenData.token_type,
                expires_in: tokenData.expires_in,
                expires_at: expiresAt,
                issued_at: Date.now(),
                userName: tokenData.userName,
                userId: tokenData.userId
            };

            // Save to localStorage
            localStorage.setItem(this.storageKey, JSON.stringify(dataToSave));

            this.token = tokenData.access_token;
            this.tokenExpiry = expiresAt;

            console.log('[TOKEN] Token saved to localStorage, expires:', new Date(expiresAt).toLocaleString());

            // Also save to Firebase
            await this.saveTokenToFirebase(dataToSave);

        } catch (error) {
            console.error('[TOKEN] Error saving token:', error);
        }
    }

    isTokenValid() {
        if (!this.token || !this.tokenExpiry) {
            return false;
        }

        // Check if token expires in less than 5 minutes (buffer time)
        const bufferTime = 5 * 60 * 1000; // 5 minutes
        return Date.now() < (this.tokenExpiry - bufferTime);
    }

    async clearToken() {
        this.token = null;
        this.tokenExpiry = null;
        localStorage.removeItem(this.storageKey);

        // Also clear from Firebase
        if (this.firebaseRef) {
            try {
                await this.firebaseRef.remove();
                console.log('[TOKEN] Token cleared from localStorage and Firebase');
            } catch (error) {
                console.error('[TOKEN] Error clearing token from Firebase:', error);
            }
        } else {
            console.log('[TOKEN] Token cleared from localStorage');
        }
    }

    async fetchNewToken() {
        if (this.isRefreshing) {
            console.log('[TOKEN] Token refresh already in progress, waiting...');
            // Wait for the ongoing refresh to complete
            return this.waitForRefresh();
        }

        this.isRefreshing = true;
        let notificationId = null;

        try {
            // Show loading notification
            if (window.notificationManager) {
                notificationId = window.notificationManager.show(
                    'Đang lấy token xác thực...',
                    'info',
                    0,
                    {
                        showOverlay: true,
                        persistent: true,
                        icon: 'key',
                        title: 'Xác thực'
                    }
                );
            }

            console.log('[TOKEN] Fetching new token from API...');

            // Create form data
            const formData = new URLSearchParams();
            formData.append('grant_type', this.credentials.grant_type);
            formData.append('username', this.credentials.username);
            formData.append('password', this.credentials.password);
            formData.append('client_id', this.credentials.client_id);

            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString()
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const tokenData = await response.json();

            if (!tokenData.access_token) {
                throw new Error('Invalid token response: missing access_token');
            }

            // Save the new token (to both localStorage and Firebase)
            await this.saveToStorage(tokenData);

            // Close loading notification and show success
            if (window.notificationManager && notificationId) {
                window.notificationManager.remove(notificationId);
                window.notificationManager.success('Token đã được cập nhật thành công', 2000);
            }

            console.log('[TOKEN] New token obtained and saved successfully');
            return this.token;

        } catch (error) {
            console.error('[TOKEN] Error fetching token:', error);

            // Show error notification
            if (window.notificationManager) {
                if (notificationId) {
                    window.notificationManager.remove(notificationId);
                }
                window.notificationManager.error(
                    `Không thể lấy token: ${error.message}`,
                    4000,
                    'Lỗi xác thực'
                );
            }

            await this.clearToken();
            throw error;

        } finally {
            this.isRefreshing = false;
        }
    }

    async waitForRefresh() {
        // Wait for ongoing refresh with timeout
        const maxWait = 10000; // 10 seconds
        const startTime = Date.now();

        while (this.isRefreshing && (Date.now() - startTime) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (this.isTokenValid()) {
            return this.token;
        }

        throw new Error('Token refresh timeout');
    }

    async getToken() {
        // If token is valid, return it
        if (this.isTokenValid()) {
            return this.token;
        }

        // If token is invalid, fetch new one
        console.log('[TOKEN] Token invalid or expired, fetching new token...');
        return await this.fetchNewToken();
    }

    async getAuthHeader() {
        const token = await this.getToken();
        return {
            'Authorization': `Bearer ${token}`
        };
    }

    // Helper method for making authenticated requests
    async authenticatedFetch(url, options = {}) {
        try {
            const headers = await this.getAuthHeader();
            
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...headers,
                    ...options.headers
                }
            });

            // If 401 Unauthorized, token might be invalid - try refreshing once
            if (response.status === 401) {
                console.log('[TOKEN] Received 401, refreshing token and retrying...');
                await this.clearToken();

                const newHeaders = await this.getAuthHeader();
                const retryResponse = await fetch(url, {
                    ...options,
                    headers: {
                        ...newHeaders,
                        ...options.headers
                    }
                });

                return retryResponse;
            }

            return response;

        } catch (error) {
            console.error('[TOKEN] Error in authenticated fetch:', error);
            throw error;
        }
    }

    // Get token info for display
    getTokenInfo() {
        if (!this.token || !this.tokenExpiry) {
            return {
                hasToken: false,
                message: 'No token available'
            };
        }

        const now = Date.now();
        const timeRemaining = this.tokenExpiry - now;
        const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

        return {
            hasToken: true,
            isValid: this.isTokenValid(),
            expiresAt: new Date(this.tokenExpiry).toLocaleString('vi-VN'),
            timeRemaining: `${hoursRemaining}h ${minutesRemaining}m`,
            token: this.token.substring(0, 20) + '...' // Show only first 20 chars
        };
    }

    // Manual refresh method
    async refresh() {
        console.log('[TOKEN] Manual token refresh requested');
        await this.clearToken();
        return await this.fetchNewToken();
    }
}

// =====================================================
// INITIALIZE TOKEN MANAGER
// =====================================================

// Initialize token manager globally
const tokenManager = new TokenManager();
window.tokenManager = tokenManager;

console.log('[TOKEN] Token Manager initialized');

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TokenManager;
}
