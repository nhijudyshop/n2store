// =====================================================
// BILL TOKEN MANAGER - Separate TPOS Auth for Bill Creation
//
// Quản lý TPOS credentials riêng cho việc tạo bill (PBH)
// - Lưu lên Render backend: /api/tpos-credentials (per user per company)
// - KHÔNG lưu credentials vào localStorage (chỉ cache token tạm thời trong memory)
// =====================================================

class BillTokenManager {
    constructor() {
        // Multi-company: use per-company storage keys
        this.companyId = BillTokenManager.getCompanyId();
        this.RENDER_API = 'https://n2store-fallback.onrender.com/api/tpos-credentials';
        this.TOKEN_API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/token';

        this.credentials = null; // { username, password } or { bearerToken }
        this.token = null;
        this.tokenExpiry = null;
        this.refreshToken = null; // Keep refresh_token in memory
        this.isRefreshing = false;

        // Clean up old localStorage data (migration)
        this._cleanupOldStorage();

        // Listen for company changes
        window.addEventListener('shopChanged', (e) => {
            const newCompanyId = e.detail?.config?.CompanyId || 1;
            if (newCompanyId !== this.companyId) {
                console.log(`[BILL-TOKEN] Company changed: ${this.companyId} → ${newCompanyId}`);
                this.companyId = newCompanyId;
                // Reset state and reload from Render for new company
                this.token = null;
                this.tokenExpiry = null;
                this.refreshToken = null;
                this.credentials = null;
                this.init();
            }
        });
    }

    /**
     * Get current company ID from ShopConfig
     */
    static getCompanyId() {
        return window.ShopConfig?.getConfig?.()?.CompanyId || 1;
    }

    /**
     * Clean up old localStorage keys (one-time migration)
     */
    _cleanupOldStorage() {
        try {
            // Remove all old credential keys from localStorage
            const keysToRemove = [
                'bill_tpos_credentials', 'bill_tpos_token',
                'bill_tpos_credentials_1', 'bill_tpos_token_1',
                'bill_tpos_credentials_2', 'bill_tpos_token_2'
            ];
            keysToRemove.forEach(key => localStorage.removeItem(key));
        } catch (e) { /* ignore */ }
    }

    // =====================================================
    // RENDER API METHODS (Source of Truth)
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
     * Save credentials to Render backend
     */
    async saveToRender(refreshToken = null) {
        if (!this.credentials) {
            console.warn('[BILL-TOKEN] No credentials to save');
            return false;
        }

        const username = this.getWebUserId();
        if (!username) {
            console.warn('[BILL-TOKEN] Cannot save: no web user ID');
            // Retry after 3s if auth not ready
            if (!this._pendingSave) {
                this._pendingSave = true;
                setTimeout(() => {
                    this._pendingSave = false;
                    this.saveToRender(refreshToken);
                }, 3000);
            }
            return false;
        }

        try {
            const body = {
                username,
                companyId: this.companyId,
                authType: this.credentials.bearerToken ? 'bearer' : 'password',
                tposUsername: this.credentials.username || null,
                tposPassword: this.credentials.password || null,
                bearerToken: this.credentials.bearerToken || null,
                refreshToken: refreshToken || this.refreshToken || null
            };

            const response = await fetch(this.RENDER_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const result = await response.json();
            if (result.success) {
                console.log(`[BILL-TOKEN] Credentials saved to Render (company ${this.companyId}):`,
                    this.credentials.bearerToken ? 'bearerToken' : `username: ${this.credentials.username}`);
                return true;
            } else {
                console.error('[BILL-TOKEN] Render save failed:', result.message);
                return false;
            }
        } catch (error) {
            console.error('[BILL-TOKEN] Error saving to Render:', error);
            return false;
        }
    }

    /**
     * Save refresh_token to Render (called after successful token fetch)
     */
    async saveRefreshTokenToRender(refreshToken) {
        if (!refreshToken) return false;

        const username = this.getWebUserId();
        if (!username) return false;

        try {
            const response = await fetch(`${this.RENDER_API}/refresh-token`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    companyId: this.companyId,
                    refreshToken
                })
            });

            const result = await response.json();
            if (result.success) {
                console.log(`[BILL-TOKEN] Refresh token saved to Render (company ${this.companyId})`);
            }
            return result.success;
        } catch (error) {
            console.error('[BILL-TOKEN] Error saving refresh token to Render:', error);
            return false;
        }
    }

    /**
     * Load credentials from Render backend
     */
    async loadFromRender() {
        const username = this.getWebUserId();
        if (!username) {
            console.warn('[BILL-TOKEN] Cannot load from Render: no web user ID');
            return false;
        }

        try {
            const url = `${this.RENDER_API}?username=${encodeURIComponent(username)}&company_id=${this.companyId}`;
            const response = await fetch(url);
            const result = await response.json();

            if (!result.success || !result.data) {
                console.log('[BILL-TOKEN] No credentials found on Render');
                return false;
            }

            const data = result.data;

            if (data.authType === 'bearer' && data.bearerToken) {
                this.credentials = { bearerToken: data.bearerToken };
            } else if (data.authType === 'password' && data.username && data.password) {
                this.credentials = { username: data.username, password: data.password };
            } else {
                console.log('[BILL-TOKEN] Invalid credentials data from Render');
                return false;
            }

            // Store refresh_token in memory
            if (data.refreshToken) {
                this.refreshToken = data.refreshToken;
            }

            console.log(`[BILL-TOKEN] Credentials loaded from Render (company ${this.companyId}):`,
                this.credentials.bearerToken ? 'bearerToken' : `username: ${this.credentials.username}`,
                data.refreshToken ? '(with refresh_token)' : '');
            return true;
        } catch (error) {
            console.error('[BILL-TOKEN] Error loading from Render:', error);
            return false;
        }
    }

    /**
     * Delete credentials from Render backend
     */
    async deleteFromRender() {
        const username = this.getWebUserId();
        if (!username) return false;

        try {
            const url = `${this.RENDER_API}?username=${encodeURIComponent(username)}&company_id=${this.companyId}`;
            const response = await fetch(url, { method: 'DELETE' });
            const result = await response.json();

            if (result.success) {
                console.log(`[BILL-TOKEN] Credentials deleted from Render (company ${this.companyId})`);
            }
            return result.success;
        } catch (error) {
            console.error('[BILL-TOKEN] Error deleting from Render:', error);
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

        // Preserve existing refresh token
        const existingRefresh = this.refreshToken;

        // Clear old token
        this.token = null;
        this.tokenExpiry = null;

        // Save to Render backend (source of truth)
        await this.saveToRender(existingRefresh);

        console.log('[BILL-TOKEN] Credentials updated');
    }

    /**
     * Fetch new token from TPOS API
     */
    async fetchToken() {
        if (!this.hasCredentials()) {
            throw new Error('No credentials configured');
        }

        // If using direct bearer token (no refresh capability)
        if (this.credentials.bearerToken) {
            this.token = this.credentials.bearerToken;
            // Set expiry to 30 days from now (bearer tokens usually have long validity)
            this.tokenExpiry = Date.now() + (30 * 24 * 60 * 60 * 1000);
            return this.token;
        }

        // Try refresh token first if available
        if (this.refreshToken) {
            try {
                const refreshed = await this.refreshWithToken(this.refreshToken);
                if (refreshed) {
                    console.log('[BILL-TOKEN] Token refreshed successfully');
                    return this.token;
                }
            } catch (error) {
                console.warn('[BILL-TOKEN] Refresh token failed, will use password:', error.message);
            }
        }

        // Fetch using username/password
        const { username, password } = this.credentials;

        const formData = new URLSearchParams();
        formData.append('grant_type', 'password');
        formData.append('username', username);
        formData.append('password', password);
        formData.append('client_id', 'tmtWebApp');

        console.log(`[BILL-TOKEN] Fetching token for user: ${username} (company ${this.companyId})`);

        const response = await fetch(this.TOKEN_API_URL, {
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

        // Save refresh_token in memory and to Render
        if (data.refresh_token) {
            this.refreshToken = data.refresh_token;
            this.saveRefreshTokenToRender(data.refresh_token);
        }

        console.log('[BILL-TOKEN] Token fetched and cached in memory');
        return this.token;
    }

    /**
     * Refresh token using refresh_token grant
     * @param {string} refreshToken - The refresh token
     * @returns {boolean} - Whether refresh was successful
     */
    async refreshWithToken(refreshToken) {
        const formData = new URLSearchParams();
        formData.append('grant_type', 'refresh_token');
        formData.append('refresh_token', refreshToken);
        formData.append('client_id', 'tmtWebApp');

        console.log('[BILL-TOKEN] Attempting to refresh token...');

        const response = await fetch(this.TOKEN_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        if (!response.ok) {
            throw new Error(`Refresh failed: ${response.status}`);
        }

        const data = await response.json();

        if (!data.access_token) {
            throw new Error('Invalid refresh response');
        }

        // Calculate expiry
        const expiresIn = data.expires_in || 3600;
        this.token = data.access_token;
        this.tokenExpiry = Date.now() + (expiresIn * 1000);

        // Save new refresh_token if provided
        const newRefreshToken = data.refresh_token || refreshToken;
        this.refreshToken = newRefreshToken;

        // Save new refresh_token to Render if it changed
        if (data.refresh_token) {
            this.saveRefreshTokenToRender(data.refresh_token);
        }

        return true;
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
            this.refreshToken = null;

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

    /**
     * Clear all credentials (memory + Render)
     */
    async clearCredentials() {
        this.credentials = null;
        this.token = null;
        this.tokenExpiry = null;
        this.refreshToken = null;

        // Delete from Render backend
        await this.deleteFromRender();
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    /**
     * Initialize - load credentials from Render backend
     */
    async init() {
        // Load from Render backend (source of truth)
        if (this.getWebUserId()) {
            console.log('[BILL-TOKEN] Loading from Render...');
            await this.loadFromRender();
        } else {
            // Auth not ready yet, retry after 2 seconds
            console.log('[BILL-TOKEN] Auth not ready, will retry in 2s...');
            setTimeout(() => this._retryLoadFromRender(), 2000);
        }

        // Default credentials if none found
        if (!this.hasCredentials()) {
            console.log('[BILL-TOKEN] No credentials found, using default account');
            this.credentials = { username: 'nvqldonhang', password: 'Aa@123456987' };
        }
    }

    /**
     * Retry loading from Render (called after delay)
     */
    async _retryLoadFromRender() {
        if (this.hasCredentials()) return;

        if (this.getWebUserId()) {
            console.log('[BILL-TOKEN] Retrying load from Render...');
            await this.loadFromRender();
        }

        // Default credentials if still none
        if (!this.hasCredentials()) {
            console.log('[BILL-TOKEN] No credentials found after retry, using default account');
            this.credentials = { username: 'nvqldonhang', password: 'Aa@123456987' };
        }
    }

    /**
     * Ensure credentials are loaded (fallback if init() didn't load)
     */
    async ensureCredentialsLoaded() {
        if (this.hasCredentials()) {
            return true;
        }

        if (this.getWebUserId()) {
            return await this.loadFromRender();
        }

        return false;
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
