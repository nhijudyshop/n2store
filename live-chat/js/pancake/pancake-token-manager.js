// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// PANCAKE TOKEN MANAGER (Web 2.0 live-chat) — 1 NGUỒN: bảng `pancake_accounts`
// (server auto-login pure-Node, quản lý ở web2/pancake-settings). initialize() sync
// qua Web2Chat.syncFromRenderDB → /api/pancake-accounts (chọn account CÒN HẠN) → ghi
// localStorage canonical; add/deleteAccount qua Web2PancakeAccounts. KHÔNG đọc/ghi
// Firestore `pancake_tokens` (stale, gây "Cannot activate expired account") — method
// *Firestore* còn lại no-op. getToken: memory → localStorage → Web2Chat sync.
// 2026-06-18 (MOVE-only split): class giữ state+orchestration, DELEGATE sang namespace
// modules PancakeToken{Codec,Storage,Sources,PageAccessTokens}/PancakeFirestoreAccounts.
// Load order: codec → storage → sources → page-access → firestore → manager.

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
    // CODEC DELEGATES → window.PancakeTokenCodec (pure)
    // =====================================================

    /**
     * Decode base64url (JWT uses base64url encoding)
     * @param {string} str - Base64url encoded string
     * @returns {string} - Decoded string with proper UTF-8 handling
     */
    base64UrlDecode(str) {
        return window.PancakeTokenCodec.base64UrlDecode(str);
    }

    /**
     * Decode JWT token để lấy expiry time
     * @param {string} token - JWT token
     * @returns {Object} { exp, uid, name, ... }
     */
    decodeToken(token) {
        return window.PancakeTokenCodec.decodeToken(token);
    }

    /**
     * Check if token is expired
     * @param {number} exp - Expiry timestamp (seconds)
     * @returns {boolean}
     */
    isTokenExpired(exp) {
        return window.PancakeTokenCodec.isTokenExpired(exp);
    }

    // =====================================================
    // LOCAL STORAGE METHODS - Fast access without network
    // Delegate → window.PancakeTokenStorage
    // =====================================================

    /**
     * Save JWT token to localStorage for fast access
     * @param {string} token - JWT token
     * @param {number} expiry - Token expiry timestamp (seconds)
     */
    saveTokenToLocalStorage(token, expiry) {
        window.PancakeTokenStorage.saveToken(this.LOCAL_STORAGE_KEYS, token, expiry);
    }

    /**
     * Get JWT token from localStorage
     * @returns {Object|null} { token, expiry } or null
     */
    getTokenFromLocalStorage() {
        return window.PancakeTokenStorage.getToken(this.LOCAL_STORAGE_KEYS);
    }

    /**
     * Clear JWT token from localStorage
     */
    clearTokenFromLocalStorage() {
        window.PancakeTokenStorage.clearToken(this.LOCAL_STORAGE_KEYS);
    }

    /**
     * Save page_access_tokens to localStorage
     * @param {Object} tokens - { pageId: { token, pageId, pageName, timestamp, savedAt }, ... }
     */
    savePageAccessTokensToLocalStorage(tokens = null) {
        window.PancakeTokenStorage.savePageAccessTokens(
            this.LOCAL_STORAGE_KEYS,
            tokens || this.pageAccessTokens
        );
    }

    /**
     * Get page_access_tokens from localStorage
     * @returns {Object} - { pageId: { token, ... }, ... }
     */
    getPageAccessTokensFromLocalStorage() {
        return window.PancakeTokenStorage.getPageAccessTokens(this.LOCAL_STORAGE_KEYS);
    }

    /**
     * Clear page_access_tokens from localStorage
     */
    clearPageAccessTokensFromLocalStorage() {
        window.PancakeTokenStorage.clearPageAccessTokens(this.LOCAL_STORAGE_KEYS);
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
     * Load all accounts from Firestore (delegate → PancakeFirestoreAccounts)
     */
    async loadAccounts() {
        return window.PancakeFirestoreAccounts.loadAccounts(this);
    }

    /**
     * Lấy token từ Firestore (active account) (delegate → PancakeFirestoreAccounts)
     * @returns {Promise<string|null>}
     */
    async getTokenFromFirestore() {
        return window.PancakeFirestoreAccounts.getTokenFromFirestore(this);
    }

    /**
     * Lưu token vào Firestore (delegate → PancakeFirestoreAccounts)
     * @param {string} token - JWT token (cleaned)
     * @param {string} accountId - Optional account ID, auto-generated if not provided
     * @returns {Promise<string>} - Returns account ID
     */
    async saveTokenToFirestore(token, accountId = null) {
        return window.PancakeFirestoreAccounts.saveTokenToFirestore(this, token, accountId);
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
     * Lấy token từ cookie Pancake.vn (delegate → PancakeTokenSources)
     * @returns {string|null}
     */
    getTokenFromCookie() {
        return window.PancakeTokenSources.getTokenFromCookie();
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
            const web2PageTokens = window.PancakeTokenSources.getWeb2ChatPageAccessTokens();
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

            // Clean token (strip jwt= prefix, quotes, whitespace, trailing punctuation)
            const cleanedToken = window.PancakeTokenCodec.cleanToken(token);

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
     * Debug function to analyze token format (delegate → PancakeTokenCodec)
     * @param {string} token - JWT token to analyze
     * @returns {Object} - Analysis results
     */
    debugToken(token) {
        return window.PancakeTokenCodec.analyzeToken(token);
    }

    // =====================================================
    // PAGE ACCESS TOKEN METHODS (for Official API - pages.fm)
    // Orchestration giữ ở class (cần this.* state); thao tác thuần
    // (decode timestamp, fetch generate, persistence) DELEGATE →
    // window.PancakePageAccessTokens.
    // =====================================================

    /**
     * Load page access tokens from Firestore
     */
    async loadPageAccessTokens() {
        return window.PancakePageAccessTokens.load(this);
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

            const data = window.PancakePageAccessTokens.buildEntry(pageId, token, pageName);

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

            const newToken = await window.PancakePageAccessTokens.generate(
                pageId,
                this.currentToken
            );
            if (newToken) {
                // Save to Firebase
                await this.savePageAccessToken(pageId, newToken);
            }
            return newToken;
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
            console.log('[PANCAKE-TOKEN] ✅ Using CACHED page_access_token for page:', pageId);
            return cached;
        }

        // In-flight dedup: nhiều caller cùng lúc → chỉ generate 1 lần / page
        this._pendingPageTokenGen = this._pendingPageTokenGen || {};
        if (this._pendingPageTokenGen[pageId]) return this._pendingPageTokenGen[pageId];

        // Generate new token
        console.log('[PANCAKE-TOKEN] ⚠️ No cached token, generating new one...');
        const genPromise = (async () => {
            const newToken = await this.generatePageAccessToken(pageId);
            if (newToken) {
                console.log('[PANCAKE-TOKEN] ✅ NEW page_access_token for page:', pageId);
            } else {
                console.error('[PANCAKE-TOKEN] ❌ Failed to generate page_access_token');
            }
            return newToken;
        })().finally(() => {
            delete this._pendingPageTokenGen[pageId];
        });
        this._pendingPageTokenGen[pageId] = genPromise;
        return genPromise;
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
window.PancakeTokenManager = PancakeTokenManager;
window.pancakeTokenManager = new PancakeTokenManager();
console.log('[PANCAKE-TOKEN] PancakeTokenManager loaded');
