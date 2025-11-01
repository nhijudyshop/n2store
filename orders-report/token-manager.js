// =====================================================
// BEARER TOKEN MANAGER - Auto Refresh & Storage
// =====================================================

class TokenManager {
    constructor() {
        this.token = null;
        this.tokenExpiry = null;
        this.isRefreshing = false;
        this.storageKey = 'bearer_token_data';
        this.API_URL = 'https://tomato.tpos.vn/token';
        this.credentials = {
            grant_type: 'password',
            username: 'nvkt',
            password: 'Aa@123456789',
            client_id: 'tmtWebApp'
        };
        this.init();
    }

    init() {
        console.log('[TOKEN] Initializing Token Manager...');
        this.loadFromStorage();
        
        // Check if token is valid on init
        if (!this.isTokenValid()) {
            console.log('[TOKEN] No valid token found, will fetch on first request');
        } else {
            console.log('[TOKEN] Valid token loaded from storage');
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

    saveToStorage(tokenData) {
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

            localStorage.setItem(this.storageKey, JSON.stringify(dataToSave));
            
            this.token = tokenData.access_token;
            this.tokenExpiry = expiresAt;

            console.log('[TOKEN] Token saved to storage, expires:', new Date(expiresAt).toLocaleString());
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

    clearToken() {
        this.token = null;
        this.tokenExpiry = null;
        localStorage.removeItem(this.storageKey);
        console.log('[TOKEN] Token cleared');
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

            // Save the new token
            this.saveToStorage(tokenData);

            // Close loading notification and show success
            if (window.notificationManager && notificationId) {
                window.notificationManager.remove(notificationId);
                window.notificationManager.success('Token đã được cập nhật thành công', 2000);
            }

            console.log('[TOKEN] New token obtained successfully');
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

            this.clearToken();
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
                this.clearToken();
                
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
        this.clearToken();
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
