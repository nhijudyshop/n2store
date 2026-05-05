// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// BILL TOKEN MANAGER - Multi-account TPOS Auth for Bill Creation
//
// Quản lý DANH SÁCH TPOS accounts cho việc tạo bill (PBH).
// Mỗi user (web) có thể cấu hình nhiều TPOS accounts; 1 active.
// - Lưu lên Render: /api/tpos-credentials (per username + company_id + account_label)
// - Active account dùng mặc định khi tạo bill
// - Có thể override per-bill khi tạo (sale modal có dropdown chọn account)
// =====================================================

class BillTokenManager {
    constructor() {
        this.companyId = BillTokenManager.getCompanyId();
        this.RENDER_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/tpos-credentials';
        this.TOKEN_API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/token';

        // Multi-account: list of { label, authType, username, password, bearerToken, refreshToken, isActive, updatedAt }
        this.accounts = [];
        this.activeLabel = null;

        // Token cache: Map<label, { token, tokenExpiry, refreshToken, isRefreshing }>
        this._tokenCache = new Map();

        this._cleanupOldStorage();

        window.addEventListener('shopChanged', (e) => {
            const newCompanyId = e.detail?.config?.CompanyId || 1;
            if (newCompanyId !== this.companyId) {
                this.companyId = newCompanyId;
                this.accounts = [];
                this.activeLabel = null;
                this._tokenCache.clear();
                this.init();
            }
        });
    }

    static getCompanyId() {
        return window.ShopConfig?.getConfig?.()?.CompanyId || 1;
    }

    _cleanupOldStorage() {
        try {
            const keysToRemove = [
                'bill_tpos_credentials',
                'bill_tpos_token',
                'bill_tpos_credentials_1',
                'bill_tpos_token_1',
                'bill_tpos_credentials_2',
                'bill_tpos_token_2',
            ];
            keysToRemove.forEach((key) => localStorage.removeItem(key));
        } catch (e) {
            /* ignore */
        }
    }

    getWebUserId() {
        try {
            const authData =
                window.authManager?.getAuthData?.() || window.authManager?.getAuthState?.();
            return authData?.username || authData?.userId || authData?.user?.username || null;
        } catch (error) {
            console.error('[BILL-TOKEN] Error getting web user ID:', error);
            return null;
        }
    }

    // =====================================================
    // ACCOUNT MANAGEMENT (multi)
    // =====================================================

    /**
     * Load list of accounts from Render
     */
    async loadFromRender() {
        const username = this.getWebUserId();
        if (!username) return false;

        try {
            const url = `${this.RENDER_API}/list?username=${encodeURIComponent(username)}&company_id=${this.companyId}`;
            const response = await fetch(url);
            const result = await response.json();
            if (!result.success || !Array.isArray(result.data)) return false;

            this.accounts = result.data;
            const active = this.accounts.find((a) => a.isActive);
            this.activeLabel = active ? active.label : this.accounts[0]?.label || null;

            return this.accounts.length > 0;
        } catch (error) {
            console.error('[BILL-TOKEN] Error loading from Render:', error);
            return false;
        }
    }

    /**
     * Save / upsert account on Render
     * @param {object} creds - { label, username, password, bearerToken, setActive }
     */
    async saveAccount(creds) {
        const username = this.getWebUserId();
        if (!username) {
            console.warn('[BILL-TOKEN] Cannot save: no web user ID');
            return { success: false, message: 'No web user ID' };
        }
        const label = (creds.label || 'Mặc định').trim() || 'Mặc định';
        const authType = creds.bearerToken ? 'bearer' : 'password';

        const body = {
            username,
            companyId: this.companyId,
            label,
            authType,
            tposUsername: creds.username || null,
            tposPassword: creds.password || null,
            bearerToken: creds.bearerToken || null,
            refreshToken: creds.refreshToken || null,
            setActive: !!creds.setActive,
        };

        try {
            const response = await fetch(this.RENDER_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const result = await response.json();
            if (!result.success) return { success: false, message: result.message };

            // Reload list
            await this.loadFromRender();
            // Reset token cache cho label đó (force re-auth)
            this._tokenCache.delete(label);
            return { success: true, label, isActive: result.isActive };
        } catch (error) {
            console.error('[BILL-TOKEN] saveAccount error:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Switch active account
     */
    async setActiveAccount(label) {
        const username = this.getWebUserId();
        if (!username) return { success: false, message: 'No web user ID' };

        try {
            const response = await fetch(`${this.RENDER_API}/active`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, companyId: this.companyId, label }),
            });
            const result = await response.json();
            if (result.success) {
                this.activeLabel = label;
                this.accounts.forEach((a) => {
                    a.isActive = a.label === label;
                });
            }
            return result;
        } catch (error) {
            console.error('[BILL-TOKEN] setActiveAccount error:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Delete an account by label
     */
    async deleteAccount(label) {
        const username = this.getWebUserId();
        if (!username) return { success: false, message: 'No web user ID' };

        try {
            const url = `${this.RENDER_API}?username=${encodeURIComponent(username)}&company_id=${this.companyId}&label=${encodeURIComponent(label)}`;
            const response = await fetch(url, { method: 'DELETE' });
            const result = await response.json();
            if (result.success) {
                this._tokenCache.delete(label);
                await this.loadFromRender();
            }
            return result;
        } catch (error) {
            console.error('[BILL-TOKEN] deleteAccount error:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Save refresh_token after fetching new token
     */
    async saveRefreshTokenToRender(refreshToken, label) {
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
                    refreshToken,
                    label,
                }),
            });
            const result = await response.json();
            return result.success;
        } catch (error) {
            console.error('[BILL-TOKEN] saveRefreshTokenToRender error:', error);
            return false;
        }
    }

    // =====================================================
    // ACTIVE ACCOUNT GETTERS (backwards-compat surface)
    // =====================================================

    _getAccount(label) {
        const target = label || this.activeLabel;
        if (!target) return this.accounts[0] || null;
        return this.accounts.find((a) => a.label === target) || null;
    }

    /**
     * Returns active account creds.
     * Compatibility: existing code reads `this.credentials` — provide as getter.
     */
    get credentials() {
        const acc = this._getAccount();
        if (!acc) return null;
        if (acc.authType === 'bearer' && acc.bearerToken) {
            return { bearerToken: acc.bearerToken };
        }
        if (acc.username && acc.password) {
            return { username: acc.username, password: acc.password };
        }
        return null;
    }

    hasCredentials(label) {
        const acc = this._getAccount(label);
        if (!acc) return false;
        if (acc.authType === 'bearer') return !!acc.bearerToken;
        return !!(acc.username && acc.password);
    }

    getCredentialsInfo(label) {
        const acc = this._getAccount(label);
        if (!acc) return { configured: false };
        if (acc.authType === 'bearer') {
            return {
                configured: true,
                type: 'bearer',
                preview: (acc.bearerToken || '').substring(0, 20) + '...',
                label: acc.label,
            };
        }
        if (acc.username) {
            return {
                configured: true,
                type: 'password',
                username: acc.username,
                label: acc.label,
            };
        }
        return { configured: false };
    }

    /**
     * Username (TPOS) của active hoặc account chỉ định
     */
    getUsername(label) {
        const acc = this._getAccount(label);
        if (!acc) return null;
        return acc.username || acc.label || null;
    }

    /**
     * Trả về list accounts cho dropdown UI
     */
    listAccounts() {
        return this.accounts.map((a) => ({
            label: a.label,
            authType: a.authType,
            username: a.username,
            isActive: a.isActive,
            updatedAt: a.updatedAt,
        }));
    }

    getActiveLabel() {
        return this.activeLabel;
    }

    // =====================================================
    // AUTHENTICATION (per account)
    // =====================================================

    _getCacheEntry(label) {
        if (!this._tokenCache.has(label)) {
            this._tokenCache.set(label, {
                token: null,
                tokenExpiry: null,
                refreshToken: null,
                isRefreshing: false,
            });
        }
        return this._tokenCache.get(label);
    }

    _isTokenValid(entry) {
        if (!entry || !entry.token || !entry.tokenExpiry) return false;
        const bufferTime = 5 * 60 * 1000;
        return Date.now() < entry.tokenExpiry - bufferTime;
    }

    async _fetchToken(label) {
        const acc = this._getAccount(label);
        if (!acc) throw new Error('No account: ' + (label || 'active'));

        const entry = this._getCacheEntry(acc.label);

        if (acc.authType === 'bearer' && acc.bearerToken) {
            entry.token = acc.bearerToken;
            entry.tokenExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
            return entry.token;
        }

        // Try refresh token first
        const refresh = entry.refreshToken || acc.refreshToken;
        if (refresh) {
            try {
                const ok = await this._refreshWithToken(acc.label, refresh);
                if (ok) return entry.token;
            } catch (err) {
                console.warn('[BILL-TOKEN] Refresh failed for', acc.label, '-', err.message);
            }
        }

        // Fall back to username/password
        if (!acc.username || !acc.password) {
            throw new Error('No password creds for account: ' + acc.label);
        }
        const formData = new URLSearchParams();
        formData.append('grant_type', 'password');
        formData.append('username', acc.username);
        formData.append('password', acc.password);
        formData.append('client_id', 'tmtWebApp');

        const response = await fetch(this.TOKEN_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Token fetch failed: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        if (!data.access_token) throw new Error('Invalid token response');

        const expiresIn = data.expires_in || 3600;
        entry.token = data.access_token;
        entry.tokenExpiry = Date.now() + expiresIn * 1000;
        if (data.refresh_token) {
            entry.refreshToken = data.refresh_token;
            this.saveRefreshTokenToRender(data.refresh_token, acc.label);
        }
        return entry.token;
    }

    async _refreshWithToken(label, refreshToken) {
        const formData = new URLSearchParams();
        formData.append('grant_type', 'refresh_token');
        formData.append('refresh_token', refreshToken);
        formData.append('client_id', 'tmtWebApp');

        const response = await fetch(this.TOKEN_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
        });
        if (!response.ok) throw new Error(`Refresh failed: ${response.status}`);
        const data = await response.json();
        if (!data.access_token) throw new Error('Invalid refresh response');

        const entry = this._getCacheEntry(label);
        const expiresIn = data.expires_in || 3600;
        entry.token = data.access_token;
        entry.tokenExpiry = Date.now() + expiresIn * 1000;
        const newRefresh = data.refresh_token || refreshToken;
        entry.refreshToken = newRefresh;
        if (data.refresh_token) {
            this.saveRefreshTokenToRender(data.refresh_token, label);
        }
        return true;
    }

    /**
     * Get valid token for active account (or specified label).
     */
    async getToken(label) {
        const acc = this._getAccount(label);
        if (!acc) throw new Error('No active TPOS account');
        const entry = this._getCacheEntry(acc.label);

        if (this._isTokenValid(entry)) return entry.token;

        if (entry.isRefreshing) {
            await new Promise((r) => setTimeout(r, 1000));
            return entry.token;
        }
        entry.isRefreshing = true;
        try {
            await this._fetchToken(acc.label);
            return entry.token;
        } finally {
            entry.isRefreshing = false;
        }
    }

    /**
     * Get auth header — main entry point for callers.
     */
    async getAuthHeader(label) {
        const token = await this.getToken(label);
        return { Authorization: `Bearer ${token}` };
    }

    /**
     * Test credentials by fetching token
     */
    async testCredentials(label) {
        try {
            const acc = this._getAccount(label);
            if (!acc) throw new Error('Không có account để test');
            this._tokenCache.delete(acc.label);
            await this._fetchToken(acc.label);
            return { success: true, message: 'Xác thực thành công!' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // =====================================================
    // BACKWARDS-COMPAT SURFACE (legacy callers)
    // =====================================================

    /**
     * Legacy: setCredentials(creds) → save as 'Mặc định' label, set active.
     */
    async setCredentials(creds) {
        const out = await this.saveAccount({
            label: creds.label || 'Mặc định',
            username: creds.username,
            password: creds.password,
            bearerToken: creds.bearerToken,
            refreshToken: creds.refreshToken,
            setActive: true,
        });
        return out.success;
    }

    /**
     * Legacy: clearCredentials() → delete tất cả accounts.
     */
    async clearCredentials() {
        const username = this.getWebUserId();
        if (!username) return false;
        try {
            const url = `${this.RENDER_API}?username=${encodeURIComponent(username)}&company_id=${this.companyId}`;
            await fetch(url, { method: 'DELETE' });
            this.accounts = [];
            this.activeLabel = null;
            this._tokenCache.clear();
            return true;
        } catch (error) {
            console.error('[BILL-TOKEN] clearCredentials error:', error);
            return false;
        }
    }

    // Legacy compat: token getter for code that reads `manager.token` directly
    get token() {
        const acc = this._getAccount();
        if (!acc) return null;
        return this._tokenCache.get(acc.label)?.token || null;
    }
    set token(v) {
        const acc = this._getAccount();
        if (!acc) return;
        const entry = this._getCacheEntry(acc.label);
        entry.token = v;
        if (!v) entry.tokenExpiry = null;
    }

    get tokenExpiry() {
        const acc = this._getAccount();
        if (!acc) return null;
        return this._tokenCache.get(acc.label)?.tokenExpiry || null;
    }
    set tokenExpiry(v) {
        const acc = this._getAccount();
        if (!acc) return;
        this._getCacheEntry(acc.label).tokenExpiry = v;
    }

    isTokenValid() {
        const acc = this._getAccount();
        if (!acc) return false;
        return this._isTokenValid(this._tokenCache.get(acc.label));
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    async init() {
        if (this.getWebUserId()) {
            await this.loadFromRender();
        } else {
            setTimeout(() => this._retryLoadFromRender(), 2000);
        }

        // Default credentials nếu chưa có account nào (giữ behaviour cũ)
        if (this.accounts.length === 0) {
            await this.saveAccount({
                label: 'Mặc định',
                username: 'nvqldonhang',
                password: 'Aa@123456987',
                setActive: true,
            });
        }
    }

    async _retryLoadFromRender() {
        if (this.accounts.length > 0) return;
        if (this.getWebUserId()) {
            await this.loadFromRender();
        }
        if (this.accounts.length === 0) {
            await this.saveAccount({
                label: 'Mặc định',
                username: 'nvqldonhang',
                password: 'Aa@123456987',
                setActive: true,
            });
        }
    }

    async ensureCredentialsLoaded() {
        if (this.hasCredentials()) return true;
        if (this.getWebUserId()) {
            return await this.loadFromRender();
        }
        return false;
    }
}

if (!window.billTokenManager) {
    window.billTokenManager = new BillTokenManager();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.billTokenManager.init();
    });
} else {
    window.billTokenManager.init();
}
