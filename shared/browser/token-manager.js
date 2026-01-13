/**
 * TPOS Token Manager
 * Auto refresh & storage with localStorage + Firebase backup
 *
 * @module shared/browser/token-manager
 */

import { API_ENDPOINTS } from '../universal/api-endpoints.js';

/**
 * TPOS Bearer Token Manager
 * Handles token lifecycle: fetch, cache, refresh, sync across tabs
 */
export class TokenManager {
    /**
     * @param {object} options - Configuration options
     * @param {string} options.apiUrl - Token API URL (default: worker proxy)
     * @param {string} options.storageKey - localStorage key
     * @param {string} options.firebasePath - Firebase RTDB path
     * @param {object} options.credentials - TPOS credentials
     */
    constructor(options = {}) {
        this.token = null;
        this.tokenExpiry = null;
        this.isRefreshing = false;
        this.isInitialized = false;
        this.initPromise = null;

        // Configuration
        this.storageKey = options.storageKey || 'bearer_token_data';
        this.API_URL = options.apiUrl || API_ENDPOINTS.WORKER.TOKEN;
        this.firebasePath = options.firebasePath || 'tpos_token';

        this.credentials = options.credentials || {
            grant_type: 'password',
            username: 'nvkt',
            password: 'Aa@123456789',
            client_id: 'tmtWebApp'
        };

        this.firebaseRef = null;
        this.firebaseReady = false;

        // Listen for storage changes from other tabs
        if (typeof window !== 'undefined') {
            window.addEventListener('storage', (e) => {
                if (e.key === this.storageKey) {
                    console.log('[TOKEN] Token updated in another tab, reloading...');
                    this.loadFromStorage();
                }
            });
        }

        // Initialize
        this.loadFromStorage();
        this.waitForFirebaseAndInit();
    }

    /**
     * Wait for Firebase to be ready, then initialize
     */
    async waitForFirebaseAndInit() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = (async () => {
            await this.waitForFirebase();
            this.initFirebase();
            await this.init();
            this.isInitialized = true;
            console.log('[TOKEN] Token Manager fully initialized');
        })();

        return this.initPromise;
    }

    /**
     * Wait for Firebase SDK to be available
     */
    async waitForFirebase() {
        if (typeof window === 'undefined') return;

        const maxRetries = 50; // 5 seconds max
        let retries = 0;

        while (retries < maxRetries) {
            if (window.firebase?.database && typeof window.firebase.database === 'function') {
                console.log('[TOKEN] Firebase SDK is ready');
                this.firebaseReady = true;
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        console.warn('[TOKEN] Firebase SDK not available, using localStorage only');
    }

    /**
     * Initialize Firebase reference
     */
    initFirebase() {
        try {
            if (typeof window !== 'undefined' && window.firebase?.database && this.firebaseReady) {
                this.firebaseRef = window.firebase.database().ref(this.firebasePath);
                console.log('[TOKEN] Firebase reference initialized');
                return true;
            }
            return false;
        } catch (error) {
            console.error('[TOKEN] Error initializing Firebase:', error);
            return false;
        }
    }

    /**
     * Initialize token - try localStorage first, then Firebase
     */
    async init() {
        console.log('[TOKEN] Initializing Token Manager...');

        // Try localStorage first
        this.loadFromStorage();
        if (this.isTokenValid()) {
            console.log('[TOKEN] Valid token loaded from localStorage');
            return;
        }

        // Fallback to Firebase
        const firebaseToken = await this.getTokenFromFirebase();
        if (firebaseToken) {
            this.token = firebaseToken.access_token;
            this.tokenExpiry = firebaseToken.expires_at;
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(firebaseToken));
                console.log('[TOKEN] Valid token loaded from Firebase');
            } catch (error) {
                console.error('[TOKEN] Error syncing Firebase token:', error);
            }
            return;
        }

        console.log('[TOKEN] No valid token found, will fetch on first request');
    }

    /**
     * Get token from Firebase
     */
    async getTokenFromFirebase() {
        if (!this.firebaseRef) return null;

        try {
            const snapshot = await this.firebaseRef.once('value');
            const tokenData = snapshot.val();

            if (!tokenData?.access_token) return null;

            const bufferTime = 5 * 60 * 1000; // 5 minutes
            if (Date.now() < (tokenData.expires_at - bufferTime)) {
                return tokenData;
            }
            return null;
        } catch (error) {
            console.error('[TOKEN] Error reading from Firebase:', error);
            return null;
        }
    }

    /**
     * Save token to Firebase
     */
    async saveTokenToFirebase(tokenData) {
        if (!this.firebaseRef) return;

        try {
            await this.firebaseRef.set(tokenData);
            console.log('[TOKEN] Token saved to Firebase');
        } catch (error) {
            console.error('[TOKEN] Error saving to Firebase:', error);
        }
    }

    /**
     * Load token from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return;

            const data = JSON.parse(stored);
            this.token = data.access_token;
            this.tokenExpiry = data.expires_at ? Number(data.expires_at) : null;
        } catch (error) {
            console.error('[TOKEN] Error loading token:', error);
            this.clearToken();
        }
    }

    /**
     * Save token to storage
     */
    async saveToStorage(tokenData) {
        try {
            let expiresAt;
            if (tokenData.expires_at) {
                expiresAt = tokenData.expires_at;
            } else if (tokenData.expires_in) {
                expiresAt = Date.now() + (tokenData.expires_in * 1000);
            } else {
                console.error('[TOKEN] Invalid token data');
                return;
            }

            const dataToSave = {
                access_token: tokenData.access_token,
                token_type: tokenData.token_type || 'Bearer',
                expires_in: tokenData.expires_in || Math.floor((expiresAt - Date.now()) / 1000),
                expires_at: expiresAt,
                issued_at: tokenData.issued_at || Date.now()
            };

            localStorage.setItem(this.storageKey, JSON.stringify(dataToSave));
            this.token = tokenData.access_token;
            this.tokenExpiry = expiresAt;

            console.log('[TOKEN] Token saved, expires:', new Date(expiresAt).toLocaleString());

            // Save to Firebase for new tokens
            if (tokenData.expires_in && !tokenData.issued_at) {
                await this.saveTokenToFirebase(dataToSave);
            }
        } catch (error) {
            console.error('[TOKEN] Error saving token:', error);
        }
    }

    /**
     * Check if token is valid
     */
    isTokenValid() {
        if (!this.token) {
            this.loadFromStorage();
            if (!this.token) return false;
        }
        if (!this.tokenExpiry) return false;

        const bufferTime = 5 * 60 * 1000; // 5 minutes
        return Date.now() < (this.tokenExpiry - bufferTime);
    }

    /**
     * Clear token from all storage
     */
    async clearToken() {
        this.token = null;
        this.tokenExpiry = null;
        localStorage.removeItem(this.storageKey);

        if (this.firebaseRef) {
            try {
                await this.firebaseRef.remove();
            } catch (error) {
                console.error('[TOKEN] Error clearing Firebase:', error);
            }
        }
    }

    /**
     * Fetch new token from API
     */
    async fetchNewToken() {
        if (this.isRefreshing) {
            return this.waitForRefresh();
        }

        this.isRefreshing = true;

        try {
            console.log('[TOKEN] Fetching new token...');

            const formData = new URLSearchParams();
            Object.entries(this.credentials).forEach(([key, value]) => {
                formData.append(key, value);
            });

            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const tokenData = await response.json();

            if (!tokenData.access_token) {
                throw new Error('Invalid token response');
            }

            await this.saveToStorage(tokenData);
            console.log('[TOKEN] New token obtained successfully');
            return this.token;

        } catch (error) {
            console.error('[TOKEN] Error fetching token:', error);
            await this.clearToken();
            throw error;
        } finally {
            this.isRefreshing = false;
        }
    }

    /**
     * Wait for ongoing refresh
     */
    async waitForRefresh() {
        const maxWait = 10000;
        const startTime = Date.now();

        while (this.isRefreshing && (Date.now() - startTime) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (this.isTokenValid()) {
            return this.token;
        }

        throw new Error('Token refresh timeout');
    }

    /**
     * Get valid token (fetch if needed)
     */
    async getToken() {
        if (!this.isInitialized && this.initPromise) {
            await this.initPromise;
        }

        if (this.isTokenValid()) {
            return this.token;
        }

        return await this.fetchNewToken();
    }

    /**
     * Get Authorization header
     */
    async getAuthHeader() {
        const token = await this.getToken();
        return { 'Authorization': `Bearer ${token}` };
    }

    /**
     * Make authenticated fetch request
     */
    async authenticatedFetch(url, options = {}) {
        try {
            const headers = await this.getAuthHeader();

            const response = await fetch(url, {
                ...options,
                headers: { ...headers, ...options.headers }
            });

            // Retry on 401
            if (response.status === 401) {
                console.log('[TOKEN] Received 401, refreshing token...');
                await this.clearToken();
                const newHeaders = await this.getAuthHeader();
                return await fetch(url, {
                    ...options,
                    headers: { ...newHeaders, ...options.headers }
                });
            }

            return response;
        } catch (error) {
            console.error('[TOKEN] Error in authenticated fetch:', error);
            throw error;
        }
    }

    /**
     * Get token info for display
     */
    getTokenInfo() {
        if (!this.token || !this.tokenExpiry) {
            return { hasToken: false, message: 'No token available' };
        }

        const timeRemaining = this.tokenExpiry - Date.now();
        const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

        return {
            hasToken: true,
            isValid: this.isTokenValid(),
            expiresAt: new Date(this.tokenExpiry).toLocaleString('vi-VN'),
            timeRemaining: `${hours}h ${minutes}m`,
            token: this.token.substring(0, 20) + '...'
        };
    }

    /**
     * Manual refresh
     */
    async refresh() {
        console.log('[TOKEN] Manual refresh requested');
        await this.clearToken();
        return await this.fetchNewToken();
    }
}

// Default export
export default TokenManager;
