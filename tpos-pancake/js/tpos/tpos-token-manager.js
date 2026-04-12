// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// BEARER TOKEN MANAGER - Auto Refresh & Storage
// MIGRATION: Changed from Realtime Database to Firestore
// =====================================================

class TokenManager {
    constructor() {
        this.token = null;
        this.tokenExpiry = null;
        this.isRefreshing = false;
        this.isInitialized = false;
        this.initPromise = null;
        // Multi-company: use bearer_token_data_{companyId} format
        this.companyId = TokenManager.getCompanyId();
        this.storageKey = 'bearer_token_data_' + this.companyId;
        this.PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
        this.API_URL = this.PROXY_URL + '/api/token';
        this.SWITCH_COMPANY_URL = this.PROXY_URL + '/api/odata/ApplicationUser/ODataService.SwitchCompany';
        this.credentials = TokenManager.getCredentials(this.companyId);
        this.firestoreRef = null;
        this.firestoreReady = false;

        // Listen for storage changes from other tabs
        window.addEventListener('storage', (e) => {
            if (e.key === this.storageKey) {
                this.loadFromStorage();
            }
        });

        // Initialize immediate check for local token
        this.loadFromStorage();

        // Start async init process for Firebase
        this.waitForFirebaseAndInit();
    }

    async waitForFirebaseAndInit() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            await this.waitForFirestore();
            this.initFirestore();
            await this.init();
            this.isInitialized = true;
            console.log(`[TOKEN] Token Manager initialized (company ${this.companyId})`);
        })();

        return this.initPromise;
    }

    async waitForFirestore() {
        const maxRetries = 50;
        let retries = 0;

        while (retries < maxRetries) {
            if (window.firebase && window.firebase.firestore && typeof window.firebase.firestore === 'function') {
                this.firestoreReady = true;
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        console.warn('[TOKEN] Firestore SDK not available after 5s, will use localStorage only');
    }

    static getCompanyId() {
        return window.ShopConfig?.getConfig?.()?.CompanyId || 1;
    }

    static getCredentials(companyId) {
        const CREDENTIALS_BY_COMPANY = {
            1: { grant_type: 'password', username: 'nvktlive1', password: 'Aa@28612345678', client_id: 'tmtWebApp' },
            2: { grant_type: 'password', username: 'nvktshop1', password: 'Aa@28612345678', client_id: 'tmtWebApp' }
        };
        return CREDENTIALS_BY_COMPANY[companyId] || CREDENTIALS_BY_COMPANY[1];
    }

    initFirestore() {
        try {
            if (window.firebase && window.firebase.firestore && this.firestoreReady) {
                const docId = this.companyId === 1 ? 'tpos_token' : 'tpos_token_' + this.companyId;
                this.firestoreRef = window.firebase.firestore().collection('tokens').doc(docId);
                return true;
            }
            return false;
        } catch (error) {
            console.error('[TOKEN] Error initializing Firestore:', error);
            return false;
        }
    }

    retryFirestoreInit() {
        if (this.firestoreRef) return true;
        return this.initFirestore();
    }

    async init() {
        // Migrate old 'bearer_token_data' -> 'bearer_token_data_1' if needed
        if (this.companyId === 1) {
            try {
                const oldData = localStorage.getItem('bearer_token_data');
                if (oldData && !localStorage.getItem(this.storageKey)) {
                    localStorage.setItem(this.storageKey, oldData);
                    localStorage.removeItem('bearer_token_data');
                }
            } catch (e) { /* ignore */ }
        }

        // Try localStorage FIRST (faster than Firestore)
        this.loadFromStorage();
        if (this.isTokenValid()) return;

        // Fallback to Firestore if localStorage token is invalid
        const firestoreToken = await this.getTokenFromFirestore();
        if (firestoreToken) {
            this.token = firestoreToken.access_token;
            this.tokenExpiry = firestoreToken.expires_at;
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(firestoreToken));
            } catch (error) {
                console.error('[TOKEN] Error syncing Firestore token to localStorage:', error);
            }
            return;
        }
    }

    async getTokenFromFirestore() {
        if (!this.firestoreRef) return null;

        try {
            const doc = await this.firestoreRef.get();
            const tokenData = doc.exists ? doc.data() : null;

            if (!tokenData || !tokenData.access_token) return null;

            const bufferTime = 5 * 60 * 1000;
            if (Date.now() < (tokenData.expires_at - bufferTime)) {
                return tokenData;
            }
            return null;
        } catch (error) {
            console.error('[TOKEN] Error reading from Firestore:', error);
            return null;
        }
    }

    async saveTokenToFirestore(tokenData) {
        if (!this.firestoreRef) return;

        try {
            await this.firestoreRef.set(tokenData, { merge: true });
        } catch (error) {
            console.error('[TOKEN] Error saving to Firestore:', error);
        }
    }

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

    async saveToStorage(tokenData) {
        try {
            let expiresAt;
            if (tokenData.expires_at) {
                expiresAt = tokenData.expires_at;
            } else if (tokenData.expires_in) {
                expiresAt = Date.now() + (tokenData.expires_in * 1000);
            } else {
                console.error('[TOKEN] Invalid token data: missing expires_at and expires_in');
                return;
            }

            const dataToSave = {
                access_token: tokenData.access_token,
                token_type: tokenData.token_type || 'Bearer',
                expires_in: tokenData.expires_in || Math.floor((expiresAt - Date.now()) / 1000),
                expires_at: expiresAt,
                issued_at: tokenData.issued_at || Date.now()
            };

            if (tokenData.userName !== undefined) dataToSave.userName = tokenData.userName;
            if (tokenData.userId !== undefined) dataToSave.userId = tokenData.userId;

            // Preserve refresh_token
            if (tokenData.refresh_token) {
                dataToSave.refresh_token = tokenData.refresh_token;
            } else {
                try {
                    const existing = localStorage.getItem(this.storageKey);
                    if (existing) {
                        const existingData = JSON.parse(existing);
                        if (existingData.refresh_token) dataToSave.refresh_token = existingData.refresh_token;
                    }
                } catch (e) { /* ignore */ }
            }

            localStorage.setItem(this.storageKey, JSON.stringify(dataToSave));
            this.token = tokenData.access_token;
            this.tokenExpiry = expiresAt;

            // Save to Firestore for NEW tokens only
            if (tokenData.expires_in && !tokenData.issued_at) {
                await this.saveTokenToFirestore(dataToSave);
            }
        } catch (error) {
            console.error('[TOKEN] Error saving token:', error);
        }
    }

    isTokenValid() {
        if (!this.token) {
            this.loadFromStorage();
            if (!this.token) return false;
        }
        if (!this.tokenExpiry) return false;

        const bufferTime = 5 * 60 * 1000;
        return Date.now() < (this.tokenExpiry - bufferTime);
    }

    async clearToken() {
        this.token = null;
        this.tokenExpiry = null;
        localStorage.removeItem(this.storageKey);

        if (this.firestoreRef) {
            try {
                await this.firestoreRef.delete();
            } catch (error) {
                console.error('[TOKEN] Error clearing from Firestore:', error);
            }
        }
    }

    invalidateAccessToken() {
        this.token = null;
        this.tokenExpiry = null;
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.refresh_token) {
                    localStorage.setItem(this.storageKey, JSON.stringify({
                        refresh_token: data.refresh_token, expires_at: 0
                    }));
                    return;
                }
            }
            localStorage.removeItem(this.storageKey);
        } catch (e) {
            localStorage.removeItem(this.storageKey);
        }
    }

    getStoredRefreshToken() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.refresh_token) return data.refresh_token;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    async refreshWithToken(refreshToken) {
        try {
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=tmtWebApp`
            });
            if (!response.ok) return false;
            const data = await response.json();
            if (!data.access_token) return false;
            await this.saveToStorage(data);
            return true;
        } catch (e) {
            console.warn('[TOKEN] Refresh token error:', e);
            return false;
        }
    }

    async passwordLogin() {
        const formData = new URLSearchParams();
        formData.append('grant_type', this.credentials.grant_type);
        formData.append('username', this.credentials.username);
        formData.append('password', this.credentials.password);
        formData.append('client_id', this.credentials.client_id);

        const response = await fetch(this.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });

        if (!response.ok) throw new Error(`Password login failed: ${response.status}`);
        const data = await response.json();
        if (!data.access_token) throw new Error('Invalid token response');

        const expiresAt = Date.now() + (data.expires_in * 1000);
        const tokenData = {
            access_token: data.access_token,
            refresh_token: data.refresh_token || null,
            token_type: 'Bearer',
            expires_in: data.expires_in,
            expires_at: expiresAt,
            issued_at: Date.now()
        };
        try { localStorage.setItem(this.storageKey, JSON.stringify(tokenData)); } catch (e) { /* ignore */ }

        this.token = data.access_token;
        this.tokenExpiry = expiresAt;

        return { data, tokenData };
    }

    async switchCompanyToken(loginResult) {
        const { data: loginData } = loginResult;
        const accessToken = loginData.access_token;
        const refreshToken = loginData.refresh_token;

        if (!refreshToken) throw new Error('No refresh_token for SwitchCompany');

        const tposHeaders = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json;charset=UTF-8',
            'Accept': 'application/json',
            'feature-version': '2',
            'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '6.2.6.1'
        };

        const switchResp = await fetch(this.SWITCH_COMPANY_URL, {
            method: 'POST',
            headers: tposHeaders,
            body: JSON.stringify({ companyId: this.companyId })
        });

        if (!switchResp.ok) throw new Error(`SwitchCompany failed: ${switchResp.status}`);

        const refreshResp = await fetch(this.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${accessToken}`
            },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=tmtWebApp`
        });

        if (!refreshResp.ok) throw new Error(`Token refresh after SwitchCompany failed: ${refreshResp.status}`);

        const newTokenData = await refreshResp.json();
        await this.saveToStorage(newTokenData);
    }

    async fetchNewToken() {
        if (this.isRefreshing) return this.waitForRefresh();

        this.isRefreshing = true;
        let notificationId = null;

        try {
            if (window.notificationManager) {
                notificationId = window.notificationManager.show(
                    'Đang lấy token xác thực...', 'info', 0,
                    { showOverlay: true, persistent: true, icon: 'key', title: 'Xác thực' }
                );
            }

            // Try refresh_token first
            const storedRefresh = this.getStoredRefreshToken();
            if (storedRefresh) {
                const ok = await this.refreshWithToken(storedRefresh);
                if (ok && this.isTokenValid()) {
                    if (window.notificationManager && notificationId) window.notificationManager.remove(notificationId);
                    return this.token;
                }
            }

            // Fallback: password login
            await this.passwordLogin();

            if (window.notificationManager && notificationId) {
                window.notificationManager.remove(notificationId);
                window.notificationManager.success('Token đã được cập nhật thành công', 2000);
            }

            return this.token;
        } catch (error) {
            console.error('[TOKEN] Error fetching token:', error);
            if (window.notificationManager) {
                if (notificationId) window.notificationManager.remove(notificationId);
                window.notificationManager.error(`Không thể lấy token: ${error.message}`, 4000, 'Lỗi xác thực');
            }
            await this.clearToken();
            throw error;
        } finally {
            this.isRefreshing = false;
        }
    }

    async waitForRefresh() {
        const maxWait = 10000;
        const startTime = Date.now();

        while (this.isRefreshing && (Date.now() - startTime) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (this.isTokenValid()) return this.token;
        throw new Error('Token refresh timeout');
    }

    async getToken() {
        if (!this.isInitialized && this.initPromise) {
            await this.initPromise;
        }

        if (this.isTokenValid()) return this.token;
        return await this.fetchNewToken();
    }

    async getAuthHeader() {
        const token = await this.getToken();
        return { 'Authorization': `Bearer ${token}` };
    }

    async authenticatedFetch(url, options = {}) {
        try {
            const headers = await this.getAuthHeader();
            const response = await fetch(url, {
                ...options,
                headers: { ...headers, ...options.headers }
            });

            if (response.status === 401) {
                this.invalidateAccessToken();
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

    getTokenInfo() {
        if (!this.token || !this.tokenExpiry) {
            return { hasToken: false, message: 'No token available' };
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
            token: this.token.substring(0, 20) + '...'
        };
    }

    async refresh() {
        await this.clearToken();
        return await this.fetchNewToken();
    }
}

// =====================================================
// INITIALIZE TOKEN MANAGER FOR TPOS
// =====================================================
const tposTokenManager = new TokenManager();
window.tposTokenManager = tposTokenManager;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TokenManager;
}
