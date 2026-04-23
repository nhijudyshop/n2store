// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PANCAKE TOKEN MANAGER - Quản lý JWT token với localStorage + Render DB
//
// SOURCE OF TRUTH: This file (script-tag compatible)
//
// MIGRATION: Firebase removed — Render DB is sole backend
// =====================================================
// Priority order for token retrieval:
// 1. In-memory cache (fastest)
// 2. localStorage (fast, no network)
// 3. Render DB accounts (network, shared across machines)
// =====================================================

const _RENDER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const _CLIENT_API_KEY = window.N2STORE_CLIENT_API_KEY || '';

class PancakeTokenManager {
    constructor() {
        this.currentToken = null;
        this.currentTokenExpiry = null;
        this.activeAccountId = null;
        this.accounts = {};
        this.pageAccessTokens = {}; // Cache for page_access_tokens
        this.accountPageAccessMap = {}; // { accountId: Set<pageId> } - which pages each account can access

        // localStorage keys
        this.LOCAL_STORAGE_KEYS = {
            JWT_TOKEN: 'pancake_jwt_token',
            JWT_TOKEN_EXPIRY: 'pancake_jwt_token_expiry',
            JWT_ACCOUNT_ID: 'tpos_pancake_active_account_id',
            PAGE_ACCESS_TOKENS: 'pancake_page_access_tokens',
            ALL_ACCOUNTS: 'pancake_all_accounts', // NEW: Store all accounts for multi-account sending
            PAT_NEGATIVE_CACHE: 'pancake_pat_negative_cache', // NEW: { pageId: { at, count, reason } } — pages where ALL accounts failed
        };

        // Negative-cache TTL: skip retry for pages where all accounts failed recently.
        // Reason for skip: expired subscription / missing admin rights won't fix within minutes;
        // 5 failed PAT calls per page × every render wastes time + spams Pancake API.
        this.PAT_NEGATIVE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
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

    // =====================================================
    // ALL ACCOUNTS LOCAL STORAGE - For multi-account sending
    // =====================================================

    /**
     * Save all accounts to localStorage for fast access in multi-account sending
     */
    saveAllAccountsToLocalStorage() {
        try {
            localStorage.setItem(
                this.LOCAL_STORAGE_KEYS.ALL_ACCOUNTS,
                JSON.stringify(this.accounts)
            );
            console.log(
                '[PANCAKE-TOKEN] ✅ All accounts saved to localStorage:',
                Object.keys(this.accounts).length
            );
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error saving all accounts to localStorage:', error);
        }
    }

    /**
     * Load all accounts from localStorage
     * @returns {Object} - { accountId: { name, uid, exp, savedAt, token }, ... }
     */
    getAllAccountsFromLocalStorage() {
        try {
            const data = localStorage.getItem(this.LOCAL_STORAGE_KEYS.ALL_ACCOUNTS);
            if (data) {
                const accounts = JSON.parse(data);
                console.log(
                    '[PANCAKE-TOKEN] ✅ All accounts loaded from localStorage:',
                    Object.keys(accounts).length
                );
                return accounts;
            }
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error loading all accounts from localStorage:', error);
        }
        return {};
    }

    /**
     * Get all VALID (non-expired) accounts for multi-account sending
     * @returns {Array} - Array of { accountId, name, uid, token, exp }
     */
    getValidAccountsForSending() {
        const validAccounts = [];
        const now = Math.floor(Date.now() / 1000);

        for (const [accountId, account] of Object.entries(this.accounts)) {
            // Check if not expired (with 1 hour buffer)
            if (account.exp && now < account.exp - 3600) {
                validAccounts.push({
                    accountId,
                    name: account.name,
                    uid: account.uid,
                    token: account.token,
                    exp: account.exp,
                });
            }
        }

        console.log(
            '[PANCAKE-TOKEN] Valid accounts for sending:',
            validAccounts.length,
            '/',
            Object.keys(this.accounts).length
        );
        return validAccounts;
    }

    // =====================================================
    // PAGE ACCESS PER ACCOUNT - Track which pages each account can access
    // =====================================================

    /**
     * Fetch accessible pages for a specific account and cache them
     * @param {string} accountId
     * @param {string} accountToken - JWT token
     * @returns {Promise<Set<string>>} Set of page IDs this account can access
     */
    async fetchAndCacheAccountPages(accountId, accountToken) {
        try {
            const url = window.API_CONFIG.buildUrl.pancake('pages', `access_token=${accountToken}`);
            const response = await fetch(url);
            const data = await response.json();

            if (data.success && data.categorized?.activated) {
                const pages = data.categorized.activated.filter((p) => !p.id.startsWith('igo_'));
                this.accountPageAccessMap[accountId] = new Set(pages.map((p) => p.id));
                console.log(
                    `[PANCAKE-TOKEN] Account ${accountId.substring(0, 8)}: ${pages.length} pages (${pages.map((p) => p.name).join(', ')})`
                );
                return this.accountPageAccessMap[accountId];
            }

            this.accountPageAccessMap[accountId] = new Set();
            return this.accountPageAccessMap[accountId];
        } catch (error) {
            console.error(`[PANCAKE-TOKEN] Error fetching pages for account ${accountId}:`, error);
            this.accountPageAccessMap[accountId] = new Set();
            return this.accountPageAccessMap[accountId];
        }
    }

    /**
     * Pre-fetch page access for ALL valid accounts (parallel)
     * Call once before bulk sending
     */
    async prefetchAllAccountPages() {
        const validAccounts = this.getValidAccountsForSending();
        if (validAccounts.length === 0) return;

        console.log(
            '[PANCAKE-TOKEN] Pre-fetching page access for',
            validAccounts.length,
            'accounts...'
        );
        await Promise.all(
            validAccounts.map((acc) => this.fetchAndCacheAccountPages(acc.accountId, acc.token))
        );
        console.log('[PANCAKE-TOKEN] ✅ Page access pre-fetch complete');
    }

    /**
     * Check if a specific account has access to a specific page
     */
    accountHasPageAccess(accountId, pageId) {
        const pages = this.accountPageAccessMap[accountId];
        return pages ? pages.has(pageId) : false;
    }

    /**
     * Get all valid accounts that have access to a specific page
     */
    getAccountsWithPageAccess(pageId) {
        const validAccounts = this.getValidAccountsForSending();
        return validAccounts.filter((acc) => this.accountHasPageAccess(acc.accountId, pageId));
    }

    /**
     * Find any valid account with access to a page (for fallback)
     * @param {string} pageId
     * @param {string} [excludeAccountId] - Skip this account (already failed)
     * @returns {Object|null} Account object or null
     */
    findAccountWithPageAccess(pageId, excludeAccountId = null) {
        const validAccounts = this.getValidAccountsForSending();
        return (
            validAccounts.find(
                (acc) =>
                    acc.accountId !== excludeAccountId &&
                    this.accountHasPageAccess(acc.accountId, pageId)
            ) || null
        );
    }

    /**
     * Save page_access_tokens to IndexedDB (async)
     * @param {Object} tokens - { pageId: { token, pageId, pageName, timestamp, savedAt }, ... }
     */
    async savePageAccessTokensToStorage(tokens = null) {
        try {
            const data = tokens || this.pageAccessTokens;

            if (window.indexedDBStorage) {
                await window.indexedDBStorage.setItem(
                    this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS,
                    data
                );
                console.log(
                    '[PANCAKE-TOKEN] ✅ Page access tokens saved to IndexedDB:',
                    Object.keys(data).length
                );
            } else {
                // Fallback to localStorage
                localStorage.setItem(
                    this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS,
                    JSON.stringify(data)
                );
                console.log(
                    '[PANCAKE-TOKEN] ✅ Page access tokens saved to localStorage (fallback):',
                    Object.keys(data).length
                );
            }
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error saving page access tokens:', error);
        }
    }

    // Alias for backwards compatibility
    savePageAccessTokensToLocalStorage(tokens = null) {
        this.savePageAccessTokensToStorage(tokens);
    }

    /**
     * Get page_access_tokens from IndexedDB/localStorage
     * @returns {Promise<Object>} - { pageId: { token, ... }, ... }
     */
    async getPageAccessTokensFromStorage() {
        try {
            let data = null;

            // Try IndexedDB first
            if (window.indexedDBStorage) {
                await window.indexedDBStorage.readyPromise;
                data = await window.indexedDBStorage.getItem(
                    this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS
                );

                if (data) {
                    console.log(
                        '[PANCAKE-TOKEN] ✅ Page access tokens loaded from IndexedDB:',
                        Object.keys(data).length
                    );
                    return data;
                }
            }

            // Fallback to localStorage and migrate
            const localData = localStorage.getItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
            if (localData) {
                const parsed = JSON.parse(localData);
                console.log(
                    '[PANCAKE-TOKEN] ✅ Page access tokens loaded from localStorage:',
                    Object.keys(parsed).length
                );

                // Migrate to IndexedDB
                if (window.indexedDBStorage) {
                    await window.indexedDBStorage.setItem(
                        this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS,
                        parsed
                    );
                    localStorage.removeItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
                    console.log('[PANCAKE-TOKEN] 🔄 Migrated page access tokens to IndexedDB');
                }

                return parsed;
            }

            return {};
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error getting page access tokens:', error);
            return {};
        }
    }

    // Sync version for backwards compatibility (returns cached data, also checks localStorage)
    getPageAccessTokensFromLocalStorage() {
        // If in-memory cache is empty, try to load from localStorage synchronously
        if (!this.pageAccessTokens || Object.keys(this.pageAccessTokens).length === 0) {
            try {
                const localData = localStorage.getItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
                if (localData) {
                    this.pageAccessTokens = JSON.parse(localData);
                    console.log(
                        '[PANCAKE-TOKEN] ✅ Loaded page tokens from localStorage (sync):',
                        Object.keys(this.pageAccessTokens).length
                    );
                }
            } catch (error) {
                console.warn('[PANCAKE-TOKEN] Error reading from localStorage:', error);
            }
        }
        return this.pageAccessTokens || {};
    }

    /**
     * Clear page_access_tokens from storage
     */
    async clearPageAccessTokensFromStorage() {
        try {
            if (window.indexedDBStorage) {
                await window.indexedDBStorage.removeItem(
                    this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS
                );
            }
            localStorage.removeItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
            console.log('[PANCAKE-TOKEN] Page access tokens cleared from storage');
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error clearing page access tokens:', error);
        }
    }

    // Alias for backwards compatibility
    clearPageAccessTokensFromLocalStorage() {
        this.clearPageAccessTokensFromStorage();
    }

    /**
     * Initialize: localStorage first, then Render DB in background
     */
    async initialize() {
        try {
            // STEP 1: Load from localStorage (instant, no network)
            console.log('[PANCAKE-TOKEN] Loading from localStorage...');
            await this.loadFromLocalStorage();

            // STEP 2: Load accounts + page tokens from Render DB (non-blocking)
            // Run in background so UI is not blocked
            this._renderLoadPromise = this._loadFromRenderDB();

            // Wait for Render DB but with timeout — if slow, localStorage data is enough
            try {
                await Promise.race([
                    this._renderLoadPromise,
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('timeout')), 8000)
                    ),
                ]);
            } catch (e) {
                console.warn(
                    '[PANCAKE-TOKEN] Render DB load timeout/error, using localStorage:',
                    e.message
                );
            }

            // SAFETY NET: if still no token after all attempts, try cookie as last resort
            if (!this.currentToken) {
                const cookieToken = this.getTokenFromCookie();
                if (cookieToken) {
                    const payload = this.decodeToken(cookieToken);
                    if (payload && !this.isTokenExpired(payload.exp)) {
                        this.currentToken = cookieToken;
                        this.currentTokenExpiry = payload.exp;
                        this.saveTokenToLocalStorage(cookieToken, payload.exp);
                        console.log('[PANCAKE-TOKEN] ✅ Recovered token from cookie (last resort)');
                    }
                }
            }

            console.log(
                '[PANCAKE-TOKEN] ✅ Initialized (accounts:',
                Object.keys(this.accounts).length,
                ', token:',
                this.currentToken ? 'YES' : 'NO',
                ')'
            );
            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error initializing:', error);
            return this.currentToken !== null;
        }
    }

    /**
     * Load accounts + page tokens from Render DB
     */
    async _loadFromRenderDB() {
        try {
            // Parallel: load accounts and page tokens
            const [accountsOk, pageTokensOk] = await Promise.all([
                this._loadAccountsFromRenderDB(),
                this._loadPageTokensFromRenderDB(),
            ]);
            console.log(
                '[PANCAKE-TOKEN] Render DB loaded — accounts:',
                accountsOk,
                ', pageTokens:',
                pageTokensOk
            );
        } catch (e) {
            console.warn('[PANCAKE-TOKEN] Render DB load error:', e.message);
        }
    }

    /**
     * Load accounts from Render DB: GET /api/pancake-accounts
     */
    async _loadAccountsFromRenderDB() {
        try {
            const resp = await fetch(`${_RENDER_URL}/api/pancake-accounts?active=true`, {
                signal: AbortSignal.timeout(7000),
            });
            if (!resp.ok) return false;
            const data = await resp.json();
            if (!data.success || !data.accounts?.length) return false;

            // Convert array → { accountId: { token, exp, uid, name, savedAt, pages } }
            const accounts = {};
            for (const row of data.accounts) {
                accounts[row.account_id] = {
                    token: row.token,
                    exp: Number(row.token_exp) || 0,
                    uid: row.uid,
                    name: row.name,
                    savedAt: Number(row.saved_at) || 0,
                    fbId: row.fb_id,
                    fbName: row.fb_name,
                    pages: row.pages || [],
                };
            }

            this.accounts = accounts;
            console.log(
                '[PANCAKE-TOKEN] ✅ Loaded',
                Object.keys(accounts).length,
                'accounts from Render DB'
            );

            // Pick active account: localStorage preference > first account
            const preferredId = localStorage.getItem('tpos_pancake_active_account_id');
            const activeId =
                preferredId && accounts[preferredId] ? preferredId : Object.keys(accounts)[0];

            // Try preferred account first, then fallback to any valid account
            let activated = false;
            if (activeId && accounts[activeId] && !this.isTokenExpired(accounts[activeId].exp)) {
                this.activeAccountId = activeId;
                this.currentToken = accounts[activeId].token;
                this.currentTokenExpiry = accounts[activeId].exp;
                localStorage.setItem('tpos_pancake_active_account_id', activeId);
                this.saveTokenToLocalStorage(accounts[activeId].token, accounts[activeId].exp);
                console.log(
                    '[PANCAKE-TOKEN] ✅ Active account:',
                    accounts[activeId].name,
                    '(',
                    activeId.substring(0, 8),
                    ')'
                );
                activated = true;
            }

            // Preferred expired → try any valid account
            if (!activated) {
                for (const [id, acc] of Object.entries(accounts)) {
                    if (acc.token && !this.isTokenExpired(acc.exp)) {
                        this.activeAccountId = id;
                        this.currentToken = acc.token;
                        this.currentTokenExpiry = acc.exp;
                        localStorage.setItem('tpos_pancake_active_account_id', id);
                        this.saveTokenToLocalStorage(acc.token, acc.exp);
                        console.log(
                            '[PANCAKE-TOKEN] ✅ Fallback account:',
                            acc.name,
                            '(',
                            id.substring(0, 8),
                            ')'
                        );
                        activated = true;
                        break;
                    }
                }
                if (!activated) {
                    console.warn('[PANCAKE-TOKEN] All accounts expired!');
                }
            }

            // Save all accounts to localStorage for multi-account sending
            this.saveAllAccountsToLocalStorage();
            return true;
        } catch (e) {
            console.warn('[PANCAKE-TOKEN] _loadAccountsFromRenderDB error:', e.message);
            return false;
        }
    }

    /**
     * Load page access tokens from Render DB: GET /api/pancake-page-tokens
     */
    async _loadPageTokensFromRenderDB() {
        try {
            const resp = await fetch(`${_RENDER_URL}/api/pancake-page-tokens`, {
                signal: AbortSignal.timeout(7000),
            });
            if (!resp.ok) return false;
            const data = await resp.json();
            if (!data.success || !data.tokens) return false;

            const renderTokens = data.tokens;
            // Smart merge: keep newer version
            for (const [pageId, renderData] of Object.entries(renderTokens)) {
                const local = this.pageAccessTokens[pageId];
                if (!local || (renderData.savedAt || 0) > (local.savedAt || 0)) {
                    this.pageAccessTokens[pageId] = renderData;
                }
            }

            // Sync back to localStorage
            this.savePageAccessTokensToStorage();
            console.log(
                '[PANCAKE-TOKEN] ✅ Loaded',
                Object.keys(renderTokens).length,
                'page tokens from Render DB'
            );
            return true;
        } catch (e) {
            console.warn('[PANCAKE-TOKEN] _loadPageTokensFromRenderDB error:', e.message);
            return false;
        }
    }

    /**
     * Load tokens from storage (IndexedDB/localStorage)
     */
    async loadFromLocalStorage() {
        // Load JWT token (from localStorage - small data)
        const localToken = this.getTokenFromLocalStorage();
        if (localToken) {
            this.currentToken = localToken.token;
            this.currentTokenExpiry = localToken.expiry;
            console.log('[PANCAKE-TOKEN] ✅ JWT token loaded from localStorage');
        }

        // Load accounts from localStorage (fallback when Render DB is slow/down)
        const lsAccounts = this.getAllAccountsFromLocalStorage();
        if (Object.keys(lsAccounts).length > 0) {
            this.accounts = lsAccounts;
            console.log(
                '[PANCAKE-TOKEN] ✅ Accounts loaded from localStorage:',
                Object.keys(lsAccounts).length
            );
        }

        // Load page access tokens from IndexedDB (can be large)
        try {
            const storageTokens = await this.getPageAccessTokensFromStorage();
            if (Object.keys(storageTokens).length > 0) {
                this.pageAccessTokens = storageTokens;
                console.log('[PANCAKE-TOKEN] ✅ Page access tokens loaded from storage');
            }
        } catch (error) {
            console.warn('[PANCAKE-TOKEN] Error loading page tokens from storage:', error);
        }

        // Load active account ID
        this.activeAccountId = localStorage.getItem(this.LOCAL_STORAGE_KEYS.JWT_ACCOUNT_ID);

        // If no JWT in localStorage but have accounts, pick one
        if (!this.currentToken && Object.keys(this.accounts).length > 0) {
            const activeId = this.activeAccountId || Object.keys(this.accounts)[0];
            const acc = this.accounts[activeId];
            if (acc?.token && !this.isTokenExpired(acc.exp)) {
                this.currentToken = acc.token;
                this.currentTokenExpiry = acc.exp;
                this.activeAccountId = activeId;
                this.saveTokenToLocalStorage(acc.token, acc.exp);
                console.log(
                    '[PANCAKE-TOKEN] ✅ Recovered token from localStorage accounts:',
                    acc.name
                );
            } else {
                // Try any valid account
                for (const [id, a] of Object.entries(this.accounts)) {
                    if (a.token && !this.isTokenExpired(a.exp)) {
                        this.currentToken = a.token;
                        this.currentTokenExpiry = a.exp;
                        this.activeAccountId = id;
                        this.saveTokenToLocalStorage(a.token, a.exp);
                        console.log(
                            '[PANCAKE-TOKEN] ✅ Recovered token from localStorage account:',
                            a.name
                        );
                        break;
                    }
                }
            }
        }
    }

    /**
     * Load accounts — delegates to Render DB loader (called by initialize)
     */
    async loadAccounts() {
        return this._loadAccountsFromRenderDB();
    }

    // migrateFromRealtimeDB() — removed, Firebase no longer used

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
     * Get token from in-memory accounts (loaded from Render DB)
     * Tries active account first, then any valid account
     * @returns {Promise<string|null>}
     */
    async getTokenFromAccounts() {
        try {
            // If no accounts in memory, try Render DB then localStorage
            if (Object.keys(this.accounts).length === 0) {
                const loaded = await this._loadAccountsFromRenderDB();
                if (!loaded) {
                    // Render DB failed — fallback to localStorage accounts
                    const lsAccounts = this.getAllAccountsFromLocalStorage();
                    if (Object.keys(lsAccounts).length > 0) {
                        this.accounts = lsAccounts;
                        console.log('[PANCAKE-TOKEN] Fallback: loaded accounts from localStorage');
                    }
                }
            }

            // Try active account first
            if (this.activeAccountId && this.accounts[this.activeAccountId]) {
                const data = this.accounts[this.activeAccountId];
                if (data.token && !this.isTokenExpired(data.exp)) {
                    this.currentToken = data.token;
                    this.currentTokenExpiry = data.exp;
                    this.saveTokenToLocalStorage(data.token, data.exp);
                    console.log('[PANCAKE-TOKEN] ✅ Token from active account:', data.name);
                    return data.token;
                }
            }

            // Fallback: any valid account
            for (const [id, acc] of Object.entries(this.accounts)) {
                if (acc.token && !this.isTokenExpired(acc.exp)) {
                    this.activeAccountId = id;
                    this.currentToken = acc.token;
                    this.currentTokenExpiry = acc.exp;
                    localStorage.setItem('tpos_pancake_active_account_id', id);
                    this.saveTokenToLocalStorage(acc.token, acc.exp);
                    console.log('[PANCAKE-TOKEN] ✅ Token from fallback account:', acc.name);
                    return acc.token;
                }
            }

            console.log('[PANCAKE-TOKEN] No valid token in any account');
            return null;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error getting token from accounts:', error);
            return null;
        }
    }

    /**
     * Save token to Render DB + localStorage
     * @param {string} token - JWT token (cleaned)
     * @param {string} accountId - Optional, auto-detected from JWT uid
     * @returns {Promise<string>} - Returns account ID
     */
    async saveTokenToRenderDB(token, accountId = null) {
        try {
            let cleanedToken = token.trim();
            if (cleanedToken.startsWith('jwt=')) {
                cleanedToken = cleanedToken.substring(4).trim();
            }

            const payload = this.decodeToken(cleanedToken);
            if (!payload) {
                console.error('[PANCAKE-TOKEN] Invalid token, cannot save');
                return null;
            }

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

            // Update local state
            this.accounts[accountId] = data;
            this.activeAccountId = accountId;
            this.currentToken = cleanedToken;
            this.currentTokenExpiry = payload.exp;

            // Save to localStorage
            localStorage.setItem('tpos_pancake_active_account_id', accountId);
            this.saveTokenToLocalStorage(cleanedToken, payload.exp);
            this.saveAllAccountsToLocalStorage();

            // Save to Render DB (async)
            try {
                await fetch(`${_RENDER_URL}/api/pancake-accounts/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accounts: { [accountId]: data } }),
                });
                console.log('[PANCAKE-TOKEN] ✅ Account saved to Render DB:', accountId);
            } catch (e) {
                console.warn('[PANCAKE-TOKEN] Render DB save failed (localStorage ok):', e.message);
            }

            console.log(
                '[PANCAKE-TOKEN] ✅ Active account:',
                payload.name,
                '| expires:',
                new Date(payload.exp * 1000).toLocaleString()
            );
            return accountId;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] ❌ Error saving token:', error);
            return null;
        }
    }

    // Backwards compat alias
    async saveTokenToFirestore(token, accountId = null) {
        return this.saveTokenToRenderDB(token, accountId);
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

            // Save to localStorage
            localStorage.setItem('tpos_pancake_active_account_id', accountId);
            this.saveTokenToLocalStorage(account.token, account.exp);

            console.log('[PANCAKE-TOKEN] ✅ Active account set:', accountId);
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

            delete this.accounts[accountId];

            // Delete from Render DB
            try {
                await fetch(`${_RENDER_URL}/api/pancake-accounts/${accountId}`, {
                    method: 'DELETE',
                });
            } catch (e) {
                console.warn('[PANCAKE-TOKEN] Render DB delete failed:', e.message);
            }

            // If deleted account was active, clear local active account
            if (this.activeAccountId === accountId) {
                localStorage.removeItem('tpos_pancake_active_account_id');
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
     * Get current userType from localStorage for per-user preferences
     */
    _getUserType() {
        return localStorage.getItem('userType') || null;
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
     * Get token with priority:
     * 1. In-memory cache (fastest)
     * 2. localStorage (fast, no network)
     * 3. Render DB accounts (network)
     * @returns {Promise<string|null>}
     */
    async getToken() {
        // Priority 1: memory
        if (this.currentToken && !this.isTokenExpired(this.currentTokenExpiry)) {
            return this.currentToken;
        }

        // Priority 2: localStorage
        const localToken = this.getTokenFromLocalStorage();
        if (localToken) {
            this.currentToken = localToken.token;
            this.currentTokenExpiry = localToken.expiry;
            console.log('[PANCAKE-TOKEN] Using token from localStorage');
            return localToken.token;
        }

        // Priority 3: Render DB accounts
        const accountToken = await this.getTokenFromAccounts();
        if (accountToken) return accountToken;

        console.warn(
            '[PANCAKE-TOKEN] No valid token found. Please login to Pancake.vn or set token manually.'
        );
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

            console.log('[PANCAKE-TOKEN] Token valid, saving to Render DB...');

            // Save to Render DB
            const accountId = await this.saveTokenToRenderDB(cleanedToken);
            if (!accountId) {
                throw new Error('Không thể lưu token. Vui lòng thử lại.');
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
            // Clear localStorage
            localStorage.removeItem('tpos_pancake_active_account_id');
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
     * Load page access tokens — delegates to Render DB loader
     */
    async loadPageAccessTokens() {
        return this._loadPageTokensFromRenderDB();
    }

    /**
     * Save page_access_token for a page
     * @param {string} pageId - Page ID (e.g., "117267091364524")
     * @param {string} token - Page access token
     * @param {string} pageName - Optional page name
     * @returns {Promise<boolean>}
     */
    async savePageAccessToken(pageId, token, pageName = '', generatedBy = null) {
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

            // Preserve prior generatedBy if caller didn't supply one
            const prevGeneratedBy = this.pageAccessTokens[pageId]?.generatedBy || null;
            const effectiveGeneratedBy = generatedBy || prevGeneratedBy || null;

            const data = {
                token: token,
                pageId: pageId,
                pageName: pageName,
                timestamp: timestamp,
                savedAt: Date.now(),
                generatedBy: effectiveGeneratedBy,
            };

            // Update in-memory cache first
            this.pageAccessTokens[pageId] = data;

            // Save to localStorage (fast)
            this.savePageAccessTokensToLocalStorage();

            // Save to Render DB (async)
            try {
                await fetch(`${_RENDER_URL}/api/pancake-page-tokens/${pageId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token,
                        pageName,
                        timestamp,
                        generatedBy: effectiveGeneratedBy,
                    }),
                });
            } catch (e) {
                console.warn('[PANCAKE-TOKEN] Render DB page token save failed:', e.message);
            }

            console.log(
                '[PANCAKE-TOKEN] ✅ page_access_token saved for page:',
                pageId,
                effectiveGeneratedBy ? `(via ${effectiveGeneratedBy.substring(0, 8)})` : ''
            );
            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error saving page_access_token:', error);
            return false;
        }
    }

    // =====================================================
    // NEGATIVE CACHE — skip PAT retry when all accounts recently failed.
    // Why: a page where every account lacks access (expired sub / no admin)
    // cannot start working mid-session; retrying wastes 5× API calls per fetch.
    // =====================================================
    _getNegativeCache() {
        try {
            const raw = localStorage.getItem(this.LOCAL_STORAGE_KEYS.PAT_NEGATIVE_CACHE);
            return raw ? JSON.parse(raw) : {};
        } catch (_) {
            return {};
        }
    }

    _saveNegativeCache(cache) {
        try {
            localStorage.setItem(this.LOCAL_STORAGE_KEYS.PAT_NEGATIVE_CACHE, JSON.stringify(cache));
        } catch (_) {}
    }

    isPageNegativeCached(pageId) {
        const cache = this._getNegativeCache();
        const entry = cache[pageId];
        if (!entry) return false;
        if (Date.now() - (entry.at || 0) > this.PAT_NEGATIVE_CACHE_TTL_MS) {
            delete cache[pageId];
            this._saveNegativeCache(cache);
            return false;
        }
        return true;
    }

    markPageNegativeCached(pageId, reason) {
        const cache = this._getNegativeCache();
        const prior = cache[pageId] || {};
        cache[pageId] = {
            at: Date.now(),
            count: (prior.count || 0) + 1,
            reason: reason || prior.reason || 'unknown',
        };
        this._saveNegativeCache(cache);
    }

    clearPageNegativeCache(pageId) {
        const cache = this._getNegativeCache();
        if (pageId) {
            delete cache[pageId];
        } else {
            for (const k of Object.keys(cache)) delete cache[k];
        }
        this._saveNegativeCache(cache);
        console.log(
            '[PANCAKE-TOKEN] 🗑️ Cleared PAT negative cache',
            pageId ? `for ${pageId}` : '(all)'
        );
    }

    /**
     * Pick the account most likely to succeed for this page.
     * Priority:
     *   1. Last known successful account (generatedBy from prior PAT)
     *   2. Accounts whose cached pages[] lists this pageId
     *   3. Any other valid account
     */
    _orderAccountsForPage(pageId) {
        const ordered = [];
        const seen = new Set();

        const add = (id) => {
            if (!id || seen.has(id)) return;
            const acc = this.accounts[id];
            if (!acc || !acc.token || this.isTokenExpired(acc.exp)) return;
            ordered.push({ token: acc.token, name: acc.name, id });
            seen.add(id);
        };

        // 1. Preferred account from previous successful PAT
        const preferredId = this.pageAccessTokens[pageId]?.generatedBy;
        if (preferredId) add(preferredId);

        // 2. Accounts whose pages[] includes this pageId
        for (const [id, acc] of Object.entries(this.accounts)) {
            if (!Array.isArray(acc.pages) || acc.pages.length === 0) continue;
            const hasPage = acc.pages.some((p) => String(p.id || p.pageId || p) === String(pageId));
            if (hasPage) add(id);
        }

        // 3. Active account then everyone else
        add(this.activeAccountId);
        for (const id of Object.keys(this.accounts)) add(id);

        return ordered;
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
        // Auto-load token if not in memory
        if (!this.currentToken) {
            await this.getToken();
        }

        // Short-circuit if this page recently had every account fail — retrying just burns API calls.
        if (this.isPageNegativeCached(pageId)) {
            const entry = this._getNegativeCache()[pageId];
            console.warn(
                '[PANCAKE-TOKEN] ⏭️ Skip PAT generation (negative-cached):',
                pageId,
                entry?.reason || ''
            );
            return null;
        }

        // Order accounts by likelihood of success: preferred generator → page-listed → active → others.
        const tokensToTry = this._orderAccountsForPage(pageId);

        if (tokensToTry.length === 0) {
            console.error('[PANCAKE-TOKEN] No accounts available to generate page_access_token');
            return null;
        }

        let lastFailureReason = null;
        for (const account of tokensToTry) {
            try {
                console.log(
                    '[PANCAKE-TOKEN] Generating PAT for page:',
                    pageId,
                    '| account:',
                    account.name
                );

                const url = window.API_CONFIG.buildUrl.pancake(
                    `pages/${pageId}/generate_page_access_token`,
                    `access_token=${account.token}`
                );

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                });

                const result = await response.json();

                if (result.success && result.page_access_token) {
                    console.log('[PANCAKE-TOKEN] ✅ PAT generated via account:', account.name);
                    await this.savePageAccessToken(
                        pageId,
                        result.page_access_token,
                        '',
                        account.id
                    );
                    return result.page_access_token;
                }

                // Permission error → try next account
                lastFailureReason = result.message || 'no token';
                console.warn('[PANCAKE-TOKEN] Account', account.name, 'failed:', lastFailureReason);
            } catch (error) {
                lastFailureReason = error.message || 'network error';
                console.warn('[PANCAKE-TOKEN] Account', account.name, 'error:', lastFailureReason);
            }
        }

        console.error('[PANCAKE-TOKEN] ❌ All accounts failed to generate PAT for page:', pageId);
        this.markPageNegativeCached(pageId, lastFailureReason);
        return null;
    }

    /**
     * Generate page_access_token using a specific account token
     * Safe for parallel/multi-account usage (no global state mutation)
     * @param {string} pageId - Page ID
     * @param {string} accountToken - Account JWT access token
     * @returns {Promise<string|null>} - New token or null
     */
    async generatePageAccessTokenWithToken(pageId, accountToken) {
        try {
            if (!accountToken) {
                throw new Error('Account token is required');
            }

            console.log(
                '[PANCAKE-TOKEN] Generating page_access_token for page:',
                pageId,
                '(with explicit token)'
            );

            const url = window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/generate_page_access_token`,
                `access_token=${accountToken}`
            );

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
            });

            const result = await response.json();

            if (result.success && result.page_access_token) {
                console.log('[PANCAKE-TOKEN] ✅ page_access_token generated for page:', pageId);
                // Save to cache and Render DB
                await this.savePageAccessToken(pageId, result.page_access_token);
                return result.page_access_token;
            } else {
                throw new Error(result.message || 'Failed to generate token');
            }
        } catch (error) {
            console.error(
                '[PANCAKE-TOKEN] ❌ Error generating page_access_token with token:',
                error
            );
            return null;
        }
    }

    /**
     * Get page_access_token from cache only (NO auto-generation)
     * Admin must manually add tokens via UI
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

        // NO auto-generation - return null if no cached token
        // Admin must manually add tokens via "Quản lý Pancake Accounts" modal
        console.log('[PANCAKE-TOKEN] ⚠️ No cached token for page:', pageId);
        console.log(
            '[PANCAKE-TOKEN] 💡 Admin cần thêm Page Access Token thủ công qua modal "Quản lý Pancake Accounts"'
        );
        return null;
    }

    /**
     * Invalidate cached page_access_token (memory + localStorage).
     * Use when Pancake returns "access_token renewed please use new access_token".
     * Does NOT touch Render DB (next save will overwrite).
     * @param {string} pageId
     */
    invalidatePageAccessToken(pageId) {
        if (!pageId) return;
        delete this.pageAccessTokens[pageId];
        try {
            const key = this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS;
            const localData = localStorage.getItem(key);
            if (localData) {
                const parsed = JSON.parse(localData);
                if (parsed[pageId]) {
                    delete parsed[pageId];
                    localStorage.setItem(key, JSON.stringify(parsed));
                }
            }
            if (window.indexedDBStorage) {
                window.indexedDBStorage
                    .getItem(key)
                    .then((idbData) => {
                        if (idbData && idbData[pageId]) {
                            delete idbData[pageId];
                            window.indexedDBStorage.setItem(key, idbData);
                        }
                    })
                    .catch(() => {});
            }
        } catch (e) {
            console.warn('[PANCAKE-TOKEN] invalidate localStorage failed:', e.message);
        }
        console.log('[PANCAKE-TOKEN] 🗑️ Invalidated PAT cache for page:', pageId);
    }

    /**
     * Force refresh PAT for a page: invalidate cache → regenerate from JWT → return new token.
     * Call this when API returns "access_token renewed please use new access_token".
     * In-flight dedupe: concurrent callers for the same pageId share one refresh promise,
     * avoiding N parallel hits to generate_page_access_token when bulk-sending.
     * @param {string} pageId
     * @returns {Promise<string|null>}
     */
    async refreshPageAccessToken(pageId) {
        if (!this._patRefreshInFlight) this._patRefreshInFlight = new Map();

        const existing = this._patRefreshInFlight.get(pageId);
        if (existing) {
            console.log('[PANCAKE-TOKEN] ⏳ Joining in-flight PAT refresh for page:', pageId);
            return existing;
        }

        const promise = (async () => {
            this.invalidatePageAccessToken(pageId);
            console.log('[PANCAKE-TOKEN] 🔄 Refreshing PAT for page:', pageId);
            const fresh = await this.generatePageAccessToken(pageId);
            if (fresh) {
                console.log('[PANCAKE-TOKEN] ✅ PAT refreshed:', fresh.substring(0, 50) + '...');
            } else {
                console.error('[PANCAKE-TOKEN] ❌ PAT refresh failed for page:', pageId);
            }
            return fresh;
        })();

        this._patRefreshInFlight.set(pageId, promise);
        promise.finally(() => {
            if (this._patRefreshInFlight.get(pageId) === promise) {
                this._patRefreshInFlight.delete(pageId);
            }
        });
        return promise;
    }

    /**
     * Get all page access tokens info (for display)
     * @returns {Array}
     */
    getAllPageAccessTokens() {
        return Object.entries(this.pageAccessTokens).map(([pageId, data]) => ({
            pageId,
            pageName: data.pageName || pageId,
            token: data.token || null,
            savedAt: data.savedAt || null,
            hasToken: !!data.token,
        }));
    }
}

// Create global instance
window.pancakeTokenManager = new PancakeTokenManager();
console.log('[PANCAKE-TOKEN] PancakeTokenManager loaded');
