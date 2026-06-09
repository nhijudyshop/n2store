// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PANCAKE TOKEN MANAGER - Quản lý JWT token với localStorage + Firestore
// =====================================================
// Priority order for token retrieval:
// 1. In-memory cache (fastest)
// 2. localStorage (fast, no network)
// 3. Firestore (network required, backup)
// 4. Cookie (fallback)
//
// MIGRATION: Changed from Realtime Database to Firestore
// =====================================================

class PancakeTokenManager {
    constructor() {
        this.firestoreRef = null;
        this.accountsRef = null;
        this.pageTokensRef = null; // For page_access_tokens
        this.currentToken = null;
        this.currentTokenExpiry = null;
        this.activeAccountId = null;
        this.accounts = {};
        this.pageAccessTokens = {}; // Cache for page_access_tokens

        // localStorage keys
        this.LOCAL_STORAGE_KEYS = {
            JWT_TOKEN: 'pancake_jwt_token',
            JWT_TOKEN_EXPIRY: 'pancake_jwt_token_expiry',
            JWT_ACCOUNT_ID: 'web2_pancake_active_account_id',
            PAGE_ACCESS_TOKENS: 'pancake_page_access_tokens',
        };
    }

    // =====================================================
    // LOCAL STORAGE METHODS - Fast access without network
    // =====================================================

    /**
     * Save JWT token to localStorage for fast access
     * @param {string} token - JWT token
     * @param {number} expiry - Token expiry timestamp (seconds)
     */
    saveTokenToLocalStorage(token, expiry) {
        try {
            localStorage.setItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN, token);
            localStorage.setItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN_EXPIRY, expiry.toString());
            console.log('[PANCAKE-TOKEN] ✅ JWT token saved to localStorage');
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error saving token to localStorage:', error);
        }
    }

    /**
     * Get JWT token from localStorage
     * @returns {Object|null} { token, expiry } or null
     */
    getTokenFromLocalStorage() {
        try {
            const token = localStorage.getItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN);
            const expiry = localStorage.getItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN_EXPIRY);

            if (!token || !expiry) {
                return null;
            }

            const exp = parseInt(expiry, 10);
            if (this.isTokenExpired(exp)) {
                console.log('[PANCAKE-TOKEN] localStorage token is expired, clearing...');
                this.clearTokenFromLocalStorage();
                return null;
            }

            console.log('[PANCAKE-TOKEN] ✅ Valid JWT token found in localStorage');
            return { token, expiry: exp };
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error getting token from localStorage:', error);
            return null;
        }
    }

    /**
     * Clear JWT token from localStorage
     */
    clearTokenFromLocalStorage() {
        try {
            localStorage.removeItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN);
            localStorage.removeItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN_EXPIRY);
            console.log('[PANCAKE-TOKEN] JWT token cleared from localStorage');
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error clearing token from localStorage:', error);
        }
    }

    /**
     * Save page_access_tokens to localStorage
     * @param {Object} tokens - { pageId: { token, pageId, pageName, timestamp, savedAt }, ... }
     */
    savePageAccessTokensToLocalStorage(tokens = null) {
        try {
            const data = tokens || this.pageAccessTokens;
            localStorage.setItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS, JSON.stringify(data));
            console.log(
                '[PANCAKE-TOKEN] ✅ Page access tokens saved to localStorage:',
                Object.keys(data).length
            );
        } catch (error) {
            console.error(
                '[PANCAKE-TOKEN] Error saving page access tokens to localStorage:',
                error
            );
        }
    }

    /**
     * Get page_access_tokens from localStorage
     * @returns {Object} - { pageId: { token, ... }, ... }
     */
    getPageAccessTokensFromLocalStorage() {
        try {
            const data = localStorage.getItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
            if (!data) {
                return {};
            }
            const parsed = JSON.parse(data);
            console.log(
                '[PANCAKE-TOKEN] ✅ Page access tokens loaded from localStorage:',
                Object.keys(parsed).length
            );
            return parsed;
        } catch (error) {
            console.error(
                '[PANCAKE-TOKEN] Error getting page access tokens from localStorage:',
                error
            );
            return {};
        }
    }

    /**
     * Clear page_access_tokens from localStorage
     */
    clearPageAccessTokensFromLocalStorage() {
        try {
            localStorage.removeItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
            console.log('[PANCAKE-TOKEN] Page access tokens cleared from localStorage');
        } catch (error) {
            console.error(
                '[PANCAKE-TOKEN] Error clearing page access tokens from localStorage:',
                error
            );
        }
    }

    /**
     * Initialize — NGUỒN DUY NHẤT là bảng pancake_accounts (server auto-login,
     * quản lý ở web2/pancake-settings) qua Web2Chat.syncFromRenderDB.
     *
     * 2026-06-09: KHÔNG đọc Firestore `pancake_tokens` nữa (nguồn cũ stale → lỗi
     * "Cannot activate expired account" vì activate account đã hết hạn trong khi
     * token CÒN HẠN nằm ở pancake_accounts không được dùng). syncFromRenderDB tự
     * chọn account còn hạn và ghi token vào localStorage canonical
     * (pancake_jwt_token, pancake_all_accounts, web2_pancake_active_account_id) —
     * đúng các key file này đọc. Firestore pancake_tokens GIỮ NGUYÊN cho Web 1.0
     * (shared/orders-report manager riêng, không đụng).
     */
    async initialize() {
        try {
            if (window.Web2Chat && typeof window.Web2Chat.syncFromRenderDB === 'function') {
                try {
                    const r = await window.Web2Chat.syncFromRenderDB({ force: true });
                    console.log('[PANCAKE-TOKEN] ✅ Synced từ pancake_accounts (canonical):', r);
                } catch (e) {
                    console.warn('[PANCAKE-TOKEN] syncFromRenderDB lỗi:', e.message);
                }
            } else {
                console.warn(
                    '[PANCAKE-TOKEN] Web2Chat chưa load — chỉ dùng localStorage (cần web2-chat-client.js)'
                );
            }

            // Nạp token + accounts + page tokens (syncFromRenderDB đã ghi vào
            // localStorage). loadFromLocalStorage tự chọn account CÒN HẠN.
            this.loadFromLocalStorage();
            return this.currentToken !== null || Object.keys(this.accounts || {}).length > 0;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] initialize error:', error);
            this.loadFromLocalStorage();
            return this.currentToken !== null;
        }
    }

    /**
     * Load tokens from localStorage (fast, synchronous)
     */
    loadFromLocalStorage() {
        // Load JWT token
        const localToken = this.getTokenFromLocalStorage();
        if (localToken) {
            this.currentToken = localToken.token;
            this.currentTokenExpiry = localToken.expiry;
            console.log('[PANCAKE-TOKEN] ✅ JWT token loaded from localStorage');
        }

        // Load page access tokens
        const localPageTokens = this.getPageAccessTokensFromLocalStorage();
        if (Object.keys(localPageTokens).length > 0) {
            this.pageAccessTokens = localPageTokens;
            console.log('[PANCAKE-TOKEN] ✅ Page access tokens loaded from localStorage');
        }

        // Load active account ID
        this.activeAccountId = localStorage.getItem(this.LOCAL_STORAGE_KEYS.JWT_ACCOUNT_ID);

        // Load accounts map từ localStorage cache (web2-chat-client syncFromRenderDB
        // ghi vào 'pancake_all_accounts'). Giúp _accountJwtForPage có account NGAY
        // lúc boot mà không phải đợi Firestore/sync → live-chat load campaign nhanh.
        try {
            const rawAccs = localStorage.getItem('pancake_all_accounts');
            if (rawAccs) {
                const cached = JSON.parse(rawAccs);
                if (cached && typeof cached === 'object' && Object.keys(cached).length) {
                    this.accounts = cached;
                    // Nếu chưa có active account hợp lệ → chọn account còn hạn đầu tiên.
                    const valid = (id) =>
                        cached[id] && cached[id].token && !this.isTokenExpired(cached[id].exp);
                    if (!this.activeAccountId || !valid(this.activeAccountId)) {
                        const pick = Object.keys(cached).find(valid);
                        if (pick) {
                            this.activeAccountId = pick;
                            localStorage.setItem(this.LOCAL_STORAGE_KEYS.JWT_ACCOUNT_ID, pick);
                            if (!this.currentToken) {
                                this.currentToken = cached[pick].token;
                                this.currentTokenExpiry = cached[pick].exp;
                            }
                        }
                    }
                    console.log(
                        '[PANCAKE-TOKEN] ✅ Accounts loaded from localStorage cache:',
                        Object.keys(cached).length
                    );
                }
            }
        } catch (e) {
            console.warn('[PANCAKE-TOKEN] parse cached accounts fail:', e.message);
        }
    }

    /**
     * Helper: Firebase operation with timeout
     * @param {Promise} promise - Firebase promise
     * @param {number} timeoutMs - Timeout in milliseconds
     * @param {string} operationName - Name for logging
     * @returns {Promise} - Resolves with result or null on timeout
     */
    async withTimeout(promise, timeoutMs = 5000, operationName = 'Firebase operation') {
        // Caller is responsible for logging context (whether localStorage fallback exists)
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve(null), timeoutMs);
        });
        return Promise.race([promise, timeoutPromise]);
    }

    /**
     * Load all accounts from Firestore
     */
    async loadAccounts() {
        try {
            // Add timeout to prevent hanging
            const doc = await this.withTimeout(this.accountsRef.get(), 5000, 'loadAccounts');

            if (!doc) {
                // Firestore slow/offline — localStorage already holds a usable copy
                const hasLocal = this.currentToken || Object.keys(this.pageAccessTokens).length > 0;
                if (hasLocal) {
                    console.info(
                        '[PANCAKE-TOKEN] loadAccounts: using localStorage (Firestore slow)'
                    );
                } else {
                    console.warn('[PANCAKE-TOKEN] loadAccounts timed out, no local data');
                }
                return false;
            }

            const fsAccounts = doc.exists ? doc.data()?.data || {} : {};
            // MERGE với cache localStorage (Render sync, đã nạp ở loadFromLocalStorage)
            // — Firestore có thể STALE (token hết hạn) so với Render. Ưu tiên entry
            // token CÒN HẠN / savedAt mới hơn, KHÔNG để Firestore clobber cache hợp lệ.
            const merged = { ...(this.accounts || {}) };
            for (const [id, fa] of Object.entries(fsAccounts)) {
                const cur = merged[id];
                if (!cur) {
                    merged[id] = fa;
                    continue;
                }
                const curExpired = this.isTokenExpired(cur.exp);
                const faExpired = this.isTokenExpired(fa.exp);
                if (curExpired && !faExpired) merged[id] = fa;
                else if (!curExpired && faExpired) {
                    /* giữ cur (cache còn hạn) */
                } else if ((Number(fa.savedAt) || 0) > (Number(cur.savedAt) || 0)) {
                    merged[id] = fa;
                }
            }
            this.accounts = merged;

            // Load active account ID from localStorage (per-device)
            this.activeAccountId = localStorage.getItem('web2_pancake_active_account_id');

            // If active account is set, load its token
            if (this.activeAccountId && this.accounts[this.activeAccountId]) {
                const account = this.accounts[this.activeAccountId];
                this.currentToken = account.token;
                this.currentTokenExpiry = account.exp;

                // Sync to localStorage for fast access next time
                this.saveTokenToLocalStorage(account.token, account.exp);
            } else if (Object.keys(this.accounts).length > 0) {
                // Auto-select first account if no active account set
                const firstAccountId = Object.keys(this.accounts)[0];
                await this.setActiveAccount(firstAccountId);
            }

            console.log('[PANCAKE-TOKEN] Loaded accounts:', Object.keys(this.accounts).length);
            console.log('[PANCAKE-TOKEN] Active account (local):', this.activeAccountId);
            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error loading accounts:', error);
            return false;
        }
    }

    /**
     * Decode base64url (JWT uses base64url encoding)
     * @param {string} str - Base64url encoded string
     * @returns {string} - Decoded string with proper UTF-8 handling
     */
    base64UrlDecode(str) {
        try {
            if (!str || typeof str !== 'string') {
                throw new Error('Input must be a non-empty string');
            }

            // Replace URL-safe characters with standard base64 characters
            let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

            // Add padding if needed
            const pad = base64.length % 4;
            if (pad) {
                if (pad === 1) {
                    throw new Error('Invalid base64url string length');
                }
                base64 += '='.repeat(4 - pad);
            }

            // Validate base64 characters (should only contain A-Z, a-z, 0-9, +, /, =)
            const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
            if (!base64Regex.test(base64)) {
                throw new Error('Invalid characters in base64 string');
            }

            // Decode base64 to binary string
            const binaryString = atob(base64);

            // Convert binary string to UTF-8 string
            // atob() returns a string where each character represents a byte
            // We need to decode it as UTF-8
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Decode UTF-8 bytes to proper string
            const decoded = new TextDecoder('utf-8').decode(bytes);
            return decoded;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Base64 decode error:', error.message);
            console.error('[PANCAKE-TOKEN] Input string:', str?.substring(0, 50) + '...');
            throw error;
        }
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
                console.error('[PANCAKE-TOKEN] Parts:', parts);
                return null;
            }

            // Log each part for debugging
            console.log('[PANCAKE-TOKEN] Header length:', parts[0]?.length);
            console.log('[PANCAKE-TOKEN] Payload length:', parts[1]?.length);
            console.log('[PANCAKE-TOKEN] Signature length:', parts[2]?.length);

            // Decode payload (second part)
            const payloadBase64 = parts[1];

            if (!payloadBase64 || payloadBase64.length === 0) {
                console.error('[PANCAKE-TOKEN] Payload part is empty');
                return null;
            }

            console.log('[PANCAKE-TOKEN] Attempting to decode payload...');
            const payloadJson = this.base64UrlDecode(payloadBase64);

            console.log('[PANCAKE-TOKEN] Payload decoded, parsing JSON...');
            const payload = JSON.parse(payloadJson);

            console.log('[PANCAKE-TOKEN] Token decoded successfully');
            console.log('[PANCAKE-TOKEN] Payload contains:', Object.keys(payload).join(', '));
            return payload;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error decoding token:', error.message);
            console.error('[PANCAKE-TOKEN] Error type:', error.name);
            console.error('[PANCAKE-TOKEN] Token length:', token?.length);
            console.error('[PANCAKE-TOKEN] Token starts with:', token?.substring(0, 20));
            console.error('[PANCAKE-TOKEN] Token ends with:', token?.substring(token.length - 20));

            // Check for common issues
            if (token.includes(' ')) {
                console.error(
                    '[PANCAKE-TOKEN] ⚠️ Token contains spaces - this should not happen after cleaning'
                );
            }
            if (token.includes('\n') || token.includes('\r')) {
                console.error(
                    '[PANCAKE-TOKEN] ⚠️ Token contains newlines - this should not happen after cleaning'
                );
            }

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
        return now >= exp - buffer;
    }

    /**
     * Lấy token từ Firestore (active account)
     * @returns {Promise<string|null>}
     */
    async getTokenFromFirestore() {
        try {
            if (!this.accountsRef) {
                console.warn('[PANCAKE-TOKEN] Firestore not initialized');
                return null;
            }

            // Use local activeAccountId (from localStorage)
            if (!this.activeAccountId) {
                console.log('[PANCAKE-TOKEN] No active account set (local)');
                return null;
            }

            // Get from in-memory cache first (already loaded from Firestore)
            let data = this.accounts[this.activeAccountId];

            // If not in memory, fetch from Firestore
            if (!data) {
                const doc = await this.accountsRef.get();
                if (doc.exists) {
                    const allAccounts = doc.data()?.data || {};
                    data = allAccounts[this.activeAccountId];
                    // Update memory cache
                    this.accounts = allAccounts;
                }
            }

            if (!data || !data.token) {
                console.log('[PANCAKE-TOKEN] No token in active account');
                return null;
            }

            // Sanitize token - remove 'jwt=' prefix if exists
            let token = data.token;
            if (token.startsWith('jwt=')) {
                token = token.substring(4);
                console.log('[PANCAKE-TOKEN] Stripped jwt= prefix from Firestore token');
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
            console.error('[PANCAKE-TOKEN] Error getting token from Firestore:', error);
            return null;
        }
    }

    /**
     * Lưu token vào Firestore (as new account or update existing)
     * @param {string} token - JWT token (cleaned)
     * @param {string} accountId - Optional account ID, auto-generated if not provided
     * @returns {Promise<string>} - Returns account ID
     */
    async saveTokenToFirestore(token, accountId = null) {
        try {
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
                savedAt: Date.now(),
            };

            // Update local state first
            this.accounts[accountId] = data;
            this.activeAccountId = accountId;
            this.currentToken = cleanedToken;
            this.currentTokenExpiry = payload.exp;

            // Save to localStorage (fast, synchronous) - PRIMARY STORAGE
            localStorage.setItem('web2_pancake_active_account_id', accountId);
            this.saveTokenToLocalStorage(cleanedToken, payload.exp);

            // Save to Firestore (async, backup)
            if (this.accountsRef) {
                await this.accountsRef.set(
                    {
                        data: { [accountId]: data },
                    },
                    { merge: true }
                );
                console.log('[PANCAKE-TOKEN] ✅ Token saved to Firestore as account:', accountId);
            }

            console.log('[PANCAKE-TOKEN] ✅ Token saved to localStorage');
            console.log(
                '[PANCAKE-TOKEN] ✅ Active account set locally (this device only):',
                accountId
            );
            console.log(
                '[PANCAKE-TOKEN] Token expires at:',
                new Date(payload.exp * 1000).toLocaleString()
            );

            return accountId;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] ❌ Error saving token:', error);
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

            // Update in-memory state
            this.activeAccountId = accountId;
            this.currentToken = account.token;
            this.currentTokenExpiry = account.exp;

            // Save to localStorage (per device) - fast access
            localStorage.setItem('web2_pancake_active_account_id', accountId);
            this.saveTokenToLocalStorage(account.token, account.exp);

            console.log(
                '[PANCAKE-TOKEN] ✅ Active account set locally (this device only):',
                accountId
            );
            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error setting active account:', error);
            return false;
        }
    }

    /**
     * Thêm account từ JWT token — GHI VÀO NGUỒN DUY NHẤT pancake_accounts (qua
     * Web2PancakeAccounts → /api/pancake-accounts/sync), KHÔNG ghi Firestore.
     * Sau đó re-sync để cache localStorage cập nhật. Quản lý chính ở
     * web2/pancake-settings; UI này chỉ là tiện ích.
     * @param {string} token
     * @returns {Promise<boolean>}
     */
    async addAccount(token) {
        if (!window.Web2PancakeAccounts?.addFromToken) {
            throw new Error('Web2PancakeAccounts chưa load (cần web2-pancake-accounts.js)');
        }
        const r = await window.Web2PancakeAccounts.addFromToken(token);
        if (!r || !r.ok) {
            const reasonMap = {
                empty: 'token rỗng',
                decode: 'token sai định dạng',
                expired: 'token đã hết hạn',
            };
            throw new Error(reasonMap[r?.reason] || r?.reason || 'thêm account thất bại');
        }
        // Cập nhật cache từ nguồn canonical.
        if (window.Web2Chat?.syncFromRenderDB) {
            await window.Web2Chat.syncFromRenderDB({ force: true }).catch(() => {});
        }
        this.loadFromLocalStorage();
        console.log('[PANCAKE-TOKEN] ✅ Account thêm vào pancake_accounts:', r.accountId);
        return true;
    }

    /**
     * Xoá account — XOÁ Ở NGUỒN DUY NHẤT pancake_accounts (qua Web2PancakeAccounts
     * → DELETE /api/pancake-accounts/:id), KHÔNG đụng Firestore. Bảng dùng chung
     * web1/web2 nên xoá ở đây = xoá ở mọi nơi (giống web2/pancake-settings).
     * @param {string} accountId
     * @returns {Promise<boolean>}
     */
    async deleteAccount(accountId) {
        try {
            if (!window.Web2PancakeAccounts?.remove) {
                throw new Error('Web2PancakeAccounts chưa load (cần web2-pancake-accounts.js)');
            }
            const r = await window.Web2PancakeAccounts.remove(accountId);
            if (!r || !r.ok) {
                console.error('[PANCAKE-TOKEN] Xoá account lỗi:', r?.reason);
                return false;
            }
            delete this.accounts[accountId];
            if (this.activeAccountId === accountId) {
                this.activeAccountId = null;
                this.currentToken = null;
                this.currentTokenExpiry = null;
            }
            // Re-sync để cache + active account cập nhật từ canonical.
            if (window.Web2Chat?.syncFromRenderDB) {
                await window.Web2Chat.syncFromRenderDB({ force: true }).catch(() => {});
            }
            this.loadFromLocalStorage();
            console.log('[PANCAKE-TOKEN] ✅ Account đã xoá ở pancake_accounts:', accountId);
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
            const jwtCookie = cookies.find((c) => c.trim().startsWith('jwt='));
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
     * 1. In-memory cache (fastest)
     * 2. localStorage (fast, no network)
     * 3. Firebase (network required)
     * 4. Cookie (fallback)
     *
     * Tự động lưu token mới vào localStorage và Firebase
     * @returns {Promise<string|null>}
     */
    async getToken() {
        // Priority 1: Check current token in memory
        if (this.currentToken && !this.isTokenExpired(this.currentTokenExpiry)) {
            console.log('[PANCAKE-TOKEN] Using cached token (memory)');
            return this.currentToken;
        }

        // Priority 2: Check localStorage (fast, no network)
        const localToken = this.getTokenFromLocalStorage();
        if (localToken) {
            console.log('[PANCAKE-TOKEN] Using token from localStorage');
            this.currentToken = localToken.token;
            this.currentTokenExpiry = localToken.expiry;
            return localToken.token;
        }

        // Priority 2.5: Sync from Render DB via Web2Chat (same source native-orders
        // uses). Web2Chat writes a fresh JWT into the SAME localStorage key
        // (pancake_jwt_token), so after sync we just re-read localStorage. This lets
        // live-chat show conversations without a manual Pancake.vn login.
        const web2Token = await this.getTokenFromWeb2Chat();
        if (web2Token) {
            console.log('[PANCAKE-TOKEN] Using token from Web2Chat (Render DB sync)');
            return web2Token;
        }

        // Priority 3: Check Firebase (network required)
        const firebaseToken = await this.getTokenFromFirestore();
        if (firebaseToken) {
            console.log('[PANCAKE-TOKEN] Using token from Firebase');
            return firebaseToken;
        }

        // Priority 4: Check cookie
        const cookieToken = this.getTokenFromCookie();
        if (cookieToken) {
            const payload = this.decodeToken(cookieToken);
            if (payload && !this.isTokenExpired(payload.exp)) {
                console.log('[PANCAKE-TOKEN] Using token from cookie, saving...');
                await this.saveTokenToFirestore(cookieToken);
                return cookieToken;
            } else {
                console.log('[PANCAKE-TOKEN] Cookie token is expired');
            }
        }

        // No valid token found
        console.warn(
            '[PANCAKE-TOKEN] No valid token found. Please login to Pancake.vn or set token manually.'
        );
        return null;
    }

    /**
     * Sync the pancake JWT + page access tokens from the Render DB via the shared
     * Web2Chat client (the exact mechanism native-orders uses). Web2Chat writes the
     * JWT into localStorage under the SAME key this manager reads
     * (`pancake_jwt_token`), so on success we just re-read localStorage.
     * @returns {Promise<string|null>}
     */
    async getTokenFromWeb2Chat() {
        try {
            if (!window.Web2Chat || typeof window.Web2Chat.syncFromRenderDB !== 'function') {
                return null;
            }
            const res = await window.Web2Chat.syncFromRenderDB({ force: true });
            if (!res || !res.ok) return null;

            const localToken = this.getTokenFromLocalStorage();
            if (localToken) {
                this.currentToken = localToken.token;
                this.currentTokenExpiry = localToken.expiry;
            }

            // Web2Chat also refreshes page access tokens — merge them in so message
            // fetch/send can use page_access_token without another round-trip.
            const web2PageTokens =
                typeof window.Web2Chat.getAllPageAccessTokens === 'function'
                    ? window.Web2Chat.getAllPageAccessTokens()
                    : null;
            if (web2PageTokens && Object.keys(web2PageTokens).length > 0) {
                this.pageAccessTokens = { ...(this.pageAccessTokens || {}), ...web2PageTokens };
                this.savePageAccessTokensToLocalStorage();
            }

            return localToken ? localToken.token : null;
        } catch (error) {
            console.warn('[PANCAKE-TOKEN] Web2Chat sync failed:', error.message);
            return null;
        }
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
                throw new Error(
                    `Token không đúng định dạng JWT (có ${parts.length} phần, cần 3 phần cách nhau bởi dấu chấm)`
                );
            }

            // Check each part is not empty
            if (!parts[0] || !parts[1] || !parts[2]) {
                throw new Error('Token có phần trống, vui lòng kiểm tra lại');
            }

            console.log('[PANCAKE-TOKEN] Token format valid, decoding...');

            // Decode and validate
            const payload = this.decodeToken(cleanedToken);
            if (!payload) {
                // Check console for detailed error messages
                console.error('[PANCAKE-TOKEN] 🔍 Kiểm tra console để xem chi tiết lỗi');
                console.error(
                    '[PANCAKE-TOKEN] 📋 Token đã làm sạch:',
                    cleanedToken.substring(0, 100) + '...'
                );
                throw new Error(
                    'Không thể giải mã token. Vui lòng:\n1. Kiểm tra lại token đã copy đúng chưa\n2. Đăng nhập lại Pancake và lấy token mới\n3. Xem console (F12) để biết lỗi chi tiết'
                );
            }

            console.log('[PANCAKE-TOKEN] Token decoded, checking expiry...');

            if (this.isTokenExpired(payload.exp)) {
                const expiryDate = new Date(payload.exp * 1000).toLocaleString('vi-VN');
                throw new Error(
                    `Token đã hết hạn vào ${expiryDate}. Vui lòng đăng nhập lại Pancake để lấy token mới.`
                );
            }

            console.log('[PANCAKE-TOKEN] Token valid, saving to Firebase...');

            // Save to Firebase
            const accountId = await this.saveTokenToFirestore(cleanedToken);
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
            savedAt: new Date(account.savedAt).toLocaleString(),
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
            isActive: this.activeAccountId === accountId,
        };
    }

    /**
     * Clear all tokens and accounts
     * @returns {Promise<boolean>}
     */
    async clearToken() {
        try {
            // Clear Firestore documents
            if (this.accountsRef) {
                await this.accountsRef.delete();
                console.log('[PANCAKE-TOKEN] Accounts cleared from Firestore');
            }
            if (this.pageTokensRef) {
                await this.pageTokensRef.delete();
                console.log('[PANCAKE-TOKEN] Page tokens cleared from Firestore');
            }

            // Clear localStorage
            localStorage.removeItem('web2_pancake_active_account_id');
            this.clearTokenFromLocalStorage();
            this.clearPageAccessTokensFromLocalStorage();
            console.log('[PANCAKE-TOKEN] All tokens cleared from localStorage');

            // Clear in-memory cache
            this.accounts = {};
            this.activeAccountId = null;
            this.currentToken = null;
            this.currentTokenExpiry = null;
            this.pageAccessTokens = {};

            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error clearing token:', error);
            return false;
        }
    }

    /**
     * Debug function to analyze token format
     * @param {string} token - JWT token to analyze
     * @returns {Object} - Analysis results
     */
    debugToken(token) {
        const result = {
            valid: false,
            issues: [],
            info: {},
        };

        try {
            result.info.originalLength = token.length;
            result.info.hasSpaces = token.includes(' ');
            result.info.hasNewlines = token.includes('\n') || token.includes('\r');
            result.info.hasPrefix = token.toLowerCase().startsWith('jwt=');

            // Clean token
            let cleaned = token.trim();
            if (cleaned.toLowerCase().startsWith('jwt=')) {
                cleaned = cleaned.substring(4).trim();
            }
            cleaned = cleaned.replace(/^["']|["']$/g, '');
            cleaned = cleaned.replace(/\s+/g, '');
            cleaned = cleaned.replace(/[;,]+$/g, '');

            result.info.cleanedLength = cleaned.length;

            // Check parts
            const parts = cleaned.split('.');
            result.info.parts = parts.length;
            result.info.partLengths = parts.map((p) => p.length);

            if (parts.length !== 3) {
                result.issues.push(`Token có ${parts.length} phần, cần 3 phần`);
                return result;
            }

            if (!parts[0] || !parts[1] || !parts[2]) {
                result.issues.push('Token có phần trống');
                return result;
            }

            // Try to decode
            try {
                const payload = this.decodeToken(cleaned);
                if (payload) {
                    result.valid = true;
                    result.info.name = payload.name;
                    result.info.uid = payload.uid;
                    result.info.exp = payload.exp;
                    result.info.expiryDate = new Date(payload.exp * 1000).toLocaleString('vi-VN');
                    result.info.isExpired = this.isTokenExpired(payload.exp);
                } else {
                    result.issues.push('Không thể giải mã payload');
                }
            } catch (decodeError) {
                result.issues.push('Lỗi giải mã: ' + decodeError.message);
            }

            return result;
        } catch (error) {
            result.issues.push('Lỗi phân tích: ' + error.message);
            return result;
        }
    }

    // =====================================================
    // PAGE ACCESS TOKEN METHODS (for Official API - pages.fm)
    // =====================================================

    /**
     * Load page access tokens from Firestore
     */
    async loadPageAccessTokens() {
        try {
            if (!this.pageTokensRef) {
                console.warn('[PANCAKE-TOKEN] pageTokensRef not initialized');
                return;
            }

            // Add timeout to prevent hanging
            const doc = await this.withTimeout(
                this.pageTokensRef.get(),
                5000,
                'loadPageAccessTokens'
            );

            if (!doc) {
                // Firestore slow/offline — localStorage already holds a usable copy
                const hasLocal = Object.keys(this.pageAccessTokens).length > 0;
                if (hasLocal) {
                    console.info(
                        '[PANCAKE-TOKEN] loadPageAccessTokens: using localStorage (Firestore slow)'
                    );
                } else {
                    console.warn('[PANCAKE-TOKEN] loadPageAccessTokens timed out, no local data');
                }
                return;
            }

            const firestoreTokens = doc.exists ? doc.data()?.data || {} : {};

            // Merge Firestore tokens with existing localStorage tokens
            // Firestore takes priority (more up-to-date)
            this.pageAccessTokens = {
                ...this.pageAccessTokens, // localStorage tokens (already loaded)
                ...firestoreTokens, // Firestore tokens (override)
            };

            // Sync merged tokens back to localStorage
            this.savePageAccessTokensToLocalStorage();

            console.log(
                '[PANCAKE-TOKEN] Loaded page_access_tokens:',
                Object.keys(this.pageAccessTokens).length
            );
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error loading page access tokens:', error);
        }
    }

    /**
     * Save page_access_token for a page
     * @param {string} pageId - Page ID (e.g., "117267091364524")
     * @param {string} token - Page access token
     * @param {string} pageName - Optional page name
     * @returns {Promise<boolean>}
     */
    async savePageAccessToken(pageId, token, pageName = '') {
        try {
            if (!pageId || !token) {
                throw new Error('pageId và token không được để trống');
            }

            // Decode to get timestamp
            let timestamp = null;
            try {
                const parts = token.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(this.base64UrlDecode(parts[1]));
                    timestamp = payload.timestamp;
                }
            } catch (e) {
                console.warn('[PANCAKE-TOKEN] Could not decode page_access_token:', e);
            }

            const data = {
                token: token,
                pageId: pageId,
                pageName: pageName,
                timestamp: timestamp,
                savedAt: Date.now(),
            };

            // Update in-memory cache first
            this.pageAccessTokens[pageId] = data;

            // Save to localStorage (fast, synchronous)
            this.savePageAccessTokensToLocalStorage();

            // Save to Firestore (async, backup)
            if (this.pageTokensRef) {
                await this.pageTokensRef.set(
                    {
                        data: { [pageId]: data },
                    },
                    { merge: true }
                );
            }

            console.log('[PANCAKE-TOKEN] ✅ page_access_token saved for page:', pageId);
            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error saving page_access_token:', error);
            return false;
        }
    }

    /**
     * Get page_access_token for a page
     * @param {string} pageId - Page ID
     * @returns {string|null} - Token or null
     */
    getPageAccessToken(pageId) {
        // Check in-memory cache first
        let data = this.pageAccessTokens[pageId];

        // If not in memory, try localStorage
        if (!data) {
            const localTokens = this.getPageAccessTokensFromLocalStorage();
            if (localTokens[pageId]) {
                data = localTokens[pageId];
                // Update in-memory cache
                this.pageAccessTokens[pageId] = data;
                console.log(
                    '[PANCAKE-TOKEN] page_access_token found in localStorage for page:',
                    pageId
                );
            }
        }

        return data ? data.token : null;
    }

    /**
     * Generate new page_access_token via Pancake API
     * @param {string} pageId - Page ID
     * @returns {Promise<string|null>} - New token or null
     */
    async generatePageAccessToken(pageId) {
        try {
            if (!this.currentToken) {
                throw new Error('Cần đăng nhập Pancake trước');
            }

            console.log('[PANCAKE-TOKEN] ========================================');
            console.log('[PANCAKE-TOKEN] Generating page_access_token for page:', pageId);
            console.log(
                '[PANCAKE-TOKEN] Using access_token (JWT):',
                this.currentToken.substring(0, 50) + '...'
            );

            // Use worker proxy to avoid CORS
            // API: POST https://pages.fm/api/v1/pages/{page_id}/generate_page_access_token?access_token=xxx
            const url = window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/generate_page_access_token`,
                `access_token=${this.currentToken}`
            );

            console.log('[PANCAKE-TOKEN] API URL:', url);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
            });

            const result = await response.json();
            console.log('[PANCAKE-TOKEN] API Response:', result);

            if (result.success && result.page_access_token) {
                console.log(
                    '[PANCAKE-TOKEN] ✅ page_access_token generated:',
                    result.page_access_token.substring(0, 50) + '...'
                );
                console.log('[PANCAKE-TOKEN] ========================================');

                // Save to Firebase
                await this.savePageAccessToken(pageId, result.page_access_token);
                return result.page_access_token;
            } else {
                throw new Error(result.message || 'Failed to generate token');
            }
        } catch (error) {
            console.error('[PANCAKE-TOKEN] ❌ Error generating page_access_token:', error);
            console.log('[PANCAKE-TOKEN] ========================================');
            return null;
        }
    }

    /**
     * Get or generate page_access_token
     * Returns cached token or generates a new one
     * @param {string} pageId - Page ID
     * @returns {Promise<string|null>}
     */
    async getOrGeneratePageAccessToken(pageId) {
        console.log('[PANCAKE-TOKEN] getOrGeneratePageAccessToken called for page:', pageId);

        // Check cache first
        const cached = this.getPageAccessToken(pageId);
        if (cached) {
            console.log(
                '[PANCAKE-TOKEN] ✅ Using CACHED page_access_token:',
                cached.substring(0, 50) + '...'
            );
            return cached;
        }

        // Generate new token
        console.log('[PANCAKE-TOKEN] ⚠️ No cached token, generating new one...');
        const newToken = await this.generatePageAccessToken(pageId);

        if (newToken) {
            console.log(
                '[PANCAKE-TOKEN] ✅ NEW page_access_token:',
                newToken.substring(0, 50) + '...'
            );
        } else {
            console.error('[PANCAKE-TOKEN] ❌ Failed to generate page_access_token');
        }

        return newToken;
    }

    /**
     * Get all page access tokens info (for display)
     * @returns {Array}
     */
    getAllPageAccessTokens() {
        return Object.entries(this.pageAccessTokens).map(([pageId, data]) => ({
            pageId,
            pageName: data.pageName || pageId,
            savedAt: data.savedAt ? new Date(data.savedAt).toLocaleString() : 'N/A',
            hasToken: !!data.token,
        }));
    }
}

// Create global instance
window.pancakeTokenManager = new PancakeTokenManager();
console.log('[PANCAKE-TOKEN] PancakeTokenManager loaded');
