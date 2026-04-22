// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PANCAKE TOKEN MANAGER - Quản lý JWT token với localStorage + Firestore
//
// SOURCE OF TRUTH: /shared/browser/pancake-token-manager.js
// This file is a script-tag compatible version.
// For ES module usage, import from '/shared/browser/pancake-token-manager.js'
//
// MIGRATION: Changed from Realtime Database to Firestore
// =====================================================
// Priority order for token retrieval:
// 0. Render server cache (shared across machines, survives cold start)
// 1. In-memory cache (fastest)
// 2. localStorage (fast, no network)
// 3. Firestore (network required, backup)
// 4. Cookie (fallback)
// =====================================================

const _RENDER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const _CLIENT_API_KEY = window.N2STORE_CLIENT_API_KEY || '';

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
        this.accountPageAccessMap = {}; // { accountId: Set<pageId> } - maps which accounts can access which pages

        // localStorage keys
        this.LOCAL_STORAGE_KEYS = {
            JWT_TOKEN: 'pancake_jwt_token',
            JWT_TOKEN_EXPIRY: 'pancake_jwt_token_expiry',
            JWT_ACCOUNT_ID: 'tpos_pancake_active_account_id',
            PAGE_ACCESS_TOKENS: 'pancake_page_access_tokens',
            ALL_ACCOUNTS: 'pancake_all_accounts' // NEW: Store all accounts for multi-account sending
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
                this.clearTokenFromLocalStorage();
                return null;
            }

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
            localStorage.setItem(this.LOCAL_STORAGE_KEYS.ALL_ACCOUNTS, JSON.stringify(this.accounts));
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
            if (account.exp && (now < account.exp - 3600)) {
                validAccounts.push({
                    accountId,
                    name: account.name,
                    uid: account.uid,
                    token: account.token,
                    exp: account.exp
                });
            }
        }

        return validAccounts;
    }

    /**
     * Save page_access_tokens to IndexedDB (async)
     * @param {Object} tokens - { pageId: { token, pageId, pageName, timestamp, savedAt }, ... }
     */
    async savePageAccessTokensToStorage(tokens = null) {
        try {
            const data = tokens || this.pageAccessTokens;

            if (window.indexedDBStorage) {
                await window.indexedDBStorage.setItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS, data);
            } else {
                // Fallback to localStorage
                localStorage.setItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS, JSON.stringify(data));
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
                data = await window.indexedDBStorage.getItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);

                if (data) {
                    return data;
                }
            }

            // Fallback to localStorage and migrate
            const localData = localStorage.getItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
            if (localData) {
                const parsed = JSON.parse(localData);

                // Migrate to IndexedDB
                if (window.indexedDBStorage) {
                    await window.indexedDBStorage.setItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS, parsed);
                    localStorage.removeItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
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
                await window.indexedDBStorage.removeItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
            }
            localStorage.removeItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error clearing page access tokens:', error);
        }
    }

    // Alias for backwards compatibility
    clearPageAccessTokensFromLocalStorage() {
        this.clearPageAccessTokensFromStorage();
    }

    /**
     * Initialize Firebase reference
     */
    async initialize() {
        try {
            // PRIORITY 1: Load from storage first (instant, no network)
            await this.loadFromLocalStorage();

            // PRIORITY 2: Load from Render DB in background (non-blocking)
            // localStorage already has data for immediate use
            this._loadFromRenderDB();

            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error initializing:', error);
            return this.currentToken !== null;
        }
    }

    /**
     * Background load from Render DB — merges with localStorage data
     * Non-blocking: does not delay initialize()
     */
    async _loadFromRenderDB() {
        try {
            await Promise.allSettled([
                this.loadAccounts(),
                this.loadPageAccessTokens()
            ]);
        } catch (e) {
            console.warn('[PANCAKE-TOKEN] Render DB background load failed:', e.message);
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
        }

        // Load page access tokens from IndexedDB (can be large)
        try {
            const storageTokens = await this.getPageAccessTokensFromStorage();
            if (Object.keys(storageTokens).length > 0) {
                this.pageAccessTokens = storageTokens;
            }
        } catch (error) {
            console.warn('[PANCAKE-TOKEN] Error loading page tokens from storage:', error);
        }

        // Load active account ID
        this.activeAccountId = localStorage.getItem(this.LOCAL_STORAGE_KEYS.JWT_ACCOUNT_ID);
    }

    /**
     * Load all accounts from Firestore
     */
    async loadAccounts() {
        try {
            // Load from Render DB (merge into existing accounts)
            const _fetch = window.fetchWithTimeout || fetch;
            const r = await _fetch(`${_RENDER_URL}/api/pancake-accounts?active=true`, {}, 8000);
            if (r.ok) {
                const data = await r.json();
                const dbAccounts = data.accounts || [];
                for (const acc of dbAccounts) {
                    if (!acc.token) continue;
                    this.accounts[acc.account_id] = {
                        token: acc.token,
                        exp: acc.token_exp ? Number(acc.token_exp) : null,
                        uid: acc.uid,
                        name: acc.name || acc.fb_name || 'Unknown',
                        savedAt: acc.saved_at ? Number(acc.saved_at) : Date.now()
                    };
                }
                console.log(`[PANCAKE-TOKEN] Loaded ${dbAccounts.length} accounts from Render DB`);
            }

            // Only update active account if not already set from localStorage
            if (!this.currentToken) {
                this.activeAccountId = localStorage.getItem('tpos_pancake_active_account_id');
                if (this.activeAccountId && this.accounts[this.activeAccountId]) {
                    const account = this.accounts[this.activeAccountId];
                    this.currentToken = account.token;
                    this.currentTokenExpiry = account.exp;
                    this.saveTokenToLocalStorage(account.token, account.exp);
                } else if (Object.keys(this.accounts).length > 0) {
                    const firstAccountId = Object.keys(this.accounts)[0];
                    await this.setActiveAccount(firstAccountId);
                }
            }

            // Save all accounts to localStorage for multi-account sending
            this.saveAllAccountsToLocalStorage();
            return true;
        } catch (error) {
            console.warn('[PANCAKE-TOKEN] Render DB accounts load failed:', error.message);
            return false;
        }
    }

    /**
     * Migrate data from Realtime Database to Firestore (one-time migration)
     * Old path: pancake_jwt_tokens/accounts/{accountId}
     * New path: Firestore pancake_tokens/accounts
     */
    async migrateFromRealtimeDB() {
        try {
            if (!window.firebase?.database) {
                return false;
            }

            // Check old path: pancake_jwt_tokens/accounts
            const rtdb = window.firebase.database();
            const oldAccountsRef = rtdb.ref('pancake_jwt_tokens/accounts');
            const snapshot = await oldAccountsRef.once('value');
            const oldAccounts = snapshot.val();

            if (!oldAccounts || Object.keys(oldAccounts).length === 0) {
                return false;
            }

            // Migrate to Firestore
            this.accounts = oldAccounts;
            if (this.accountsRef) {
                await this.accountsRef.set({ data: oldAccounts }, { merge: true });
            }

            // Auto-select first account if no active account
            if (!this.activeAccountId && Object.keys(oldAccounts).length > 0) {
                const firstAccountId = Object.keys(oldAccounts)[0];
                await this.setActiveAccount(firstAccountId);
            }

            // Migrate page_access_tokens if exists
            const oldPageTokensRef = rtdb.ref('pancake_jwt_tokens/page_access_tokens');
            const pageTokensSnapshot = await oldPageTokensRef.once('value');
            const oldPageTokens = pageTokensSnapshot.val();

            if (oldPageTokens && Object.keys(oldPageTokens).length > 0) {
                this.pageAccessTokens = { ...this.pageAccessTokens, ...oldPageTokens };
                if (this.pageTokensRef) {
                    await this.pageTokensRef.set({ data: oldPageTokens }, { merge: true });
                }
                this.savePageAccessTokensToLocalStorage();
            }

            return true;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] ❌ Error migrating from Realtime Database:', error);
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

            // Decode payload (second part)
            const payloadBase64 = parts[1];

            if (!payloadBase64 || payloadBase64.length === 0) {
                console.error('[PANCAKE-TOKEN] Payload part is empty');
                return null;
            }

            const payloadJson = this.base64UrlDecode(payloadBase64);
            const payload = JSON.parse(payloadJson);
            return payload;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error decoding token:', error.message);
            console.error('[PANCAKE-TOKEN] Error type:', error.name);
            console.error('[PANCAKE-TOKEN] Token length:', token?.length);
            console.error('[PANCAKE-TOKEN] Token starts with:', token?.substring(0, 20));
            console.error('[PANCAKE-TOKEN] Token ends with:', token?.substring(token.length - 20));

            // Check for common issues
            if (token.includes(' ')) {
                console.error('[PANCAKE-TOKEN] ⚠️ Token contains spaces - this should not happen after cleaning');
            }
            if (token.includes('\n') || token.includes('\r')) {
                console.error('[PANCAKE-TOKEN] ⚠️ Token contains newlines - this should not happen after cleaning');
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
        return now >= (exp - buffer);
    }

    /**
     * Lấy token từ Render DB (active account)
     * @returns {Promise<string|null>}
     */
    async getTokenFromFirestore() {
        try {
            if (!this.activeAccountId) return null;

            // Get from in-memory cache first (already loaded from Render DB)
            let data = this.accounts[this.activeAccountId];

            // If not in memory, fetch from Render DB
            if (!data) {
                try {
                    const _fetch = window.fetchWithTimeout || fetch;
                    const r = await _fetch(`${_RENDER_URL}/api/pancake-accounts/${this.activeAccountId}`, {}, 6000);
                    if (r.ok) {
                        const resp = await r.json();
                        if (resp.account?.token) {
                            data = {
                                token: resp.account.token,
                                exp: resp.account.token_exp ? Number(resp.account.token_exp) : null,
                                uid: resp.account.uid,
                                name: resp.account.name
                            };
                            this.accounts[this.activeAccountId] = data;
                        }
                    }
                } catch (e) { /* Render unavailable */ }
            }

            if (!data || !data.token) return null;

            let token = data.token;
            if (token.startsWith('jwt=')) token = token.substring(4);

            const payload = this.decodeToken(token);
            if (!payload || this.isTokenExpired(payload.exp)) return null;

            this.currentToken = token;
            this.currentTokenExpiry = payload.exp;
            this.saveTokenToLocalStorage(token, payload.exp);

            return token;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error getting token from Render DB:', error);
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
                savedAt: Date.now()
            };

            // Update local state first
            this.accounts[accountId] = data;
            this.activeAccountId = accountId;
            this.currentToken = cleanedToken;
            this.currentTokenExpiry = payload.exp;

            // Save to localStorage (fast, synchronous) - PRIMARY STORAGE
            localStorage.setItem('tpos_pancake_active_account_id', accountId);
            this.saveTokenToLocalStorage(cleanedToken, payload.exp);

            // Sync to Render DB (async, shared across machines)
            try {
                fetch(`${_RENDER_URL}/api/pancake-accounts/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accounts: { [accountId]: data }
                    })
                }).catch(() => {});
            } catch (e) { /* fire-and-forget */ }

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
     * Prefetch pages for ALL accounts to build accountPageAccessMap
     * Used for fallback: if active account can't access a page, find another account that can
     */
    async prefetchAllAccountPages() {
        this.accountPageAccessMap = {};

        const accountEntries = Object.entries(this.accounts);
        if (accountEntries.length === 0) {
            console.warn('[PANCAKE-TOKEN] No accounts to prefetch');
            return;
        }

        await Promise.allSettled(
            accountEntries.map(async ([accountId, account]) => {
                if (this.isTokenExpired(account.exp)) {
                    return;
                }

                try {
                    const url = window.API_CONFIG.buildUrl.pancake('pages', `access_token=${account.token}`);
                    const _fetch = window.fetchWithTimeout || fetch;
                    const response = await _fetch(url, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' }
                    }, 8000);

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const data = await response.json();
                    if (data.success && data.categorized?.activated_page_ids) {
                        this.accountPageAccessMap[accountId] = new Set(
                            data.categorized.activated_page_ids.map(String)
                        );
                    }
                } catch (error) {
                    console.warn(`[PANCAKE-TOKEN] Failed to fetch pages for ${account.name}:`, error.message);
                }
            })
        );

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
        return validAccounts.filter(acc => this.accountHasPageAccess(acc.accountId, pageId));
    }

    /**
     * Find a fallback account that has access to the given page
     * @param {string} pageId - Page ID to find access for
     * @param {string} excludeAccountId - Account ID to exclude (usually the active account that failed)
     * @returns {Object|null} - { accountId, name, token } or null
     */
    findAccountWithPageAccess(pageId, excludeAccountId = null) {
        const pageIdStr = String(pageId);

        for (const [accountId, pageIds] of Object.entries(this.accountPageAccessMap)) {
            if (accountId === excludeAccountId) continue;
            if (pageIds.has(pageIdStr)) {
                const account = this.accounts[accountId];
                if (account && !this.isTokenExpired(account.exp)) {
                    return {
                        accountId,
                        name: account.name,
                        token: account.token
                    };
                }
            }
        }

        console.warn(`[PANCAKE-TOKEN] No fallback account found for page ${pageId}`);
        return null;
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
            localStorage.setItem('tpos_pancake_active_account_id', accountId);
            this.saveTokenToLocalStorage(account.token, account.exp);

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

            // Delete from Firestore using FieldValue.delete()
            if (this.accountsRef) {
                await this.accountsRef.update({
                    [`data.${accountId}`]: window.firebase.firestore.FieldValue.delete()
                });
            }
            delete this.accounts[accountId];

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
            const jwtCookie = cookies.find(c => c.trim().startsWith('jwt='));
            if (jwtCookie) {
                // Split by '=' and take everything after the first '='
                const parts = jwtCookie.split('=');
                // Join back in case JWT contains '=' characters
                let token = parts.slice(1).join('=').trim();

                // Strip 'jwt=' prefix if exists (safety check)
                if (token.startsWith('jwt=')) {
                    token = token.substring(4);
                }

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
    /**
     * Step 0: Try fetching Pancake token from Render server cache.
     * The server stores whatever the browser last pushed via /api/realtime/start.
     * Returns token string if found and not expired, null otherwise.
     */
    async tryRenderCache() {
        try {
            const resp = await fetch(`${_RENDER_URL}/api/auth/token/pancake`, {
                headers: { 'X-API-Key': _CLIENT_API_KEY },
                signal: AbortSignal.timeout(5000),
            });
            if (!resp.ok) return null; // 404 = not pushed yet, 401 = wrong key
            const data = await resp.json();
            if (!data.token) return null;
            // Validate expiry client-side
            const payload = this.decodeToken(data.token);
            if (!payload || this.isTokenExpired(payload.exp)) {
                console.log('[PANCAKE-TOKEN] Render cache token expired, skipping');
                return null;
            }
            console.log('[PANCAKE-TOKEN] ✅ Token from Render cache (exp:', new Date(payload.exp * 1000).toISOString(), ')');
            // Hydrate memory + localStorage so next calls are instant
            this.currentToken = data.token;
            this.currentTokenExpiry = payload.exp;
            this.saveTokenToLocalStorage(data.token, payload.exp);
            return data.token;
        } catch (e) {
            console.log('[PANCAKE-TOKEN] Render cache unavailable:', e.message);
            return null;
        }
    }

    async getToken() {
        // Priority 0: Render server cache (shared across machines)
        // Only check if memory + localStorage are empty (avoid extra network on every call)
        if (!this.currentToken || this.isTokenExpired(this.currentTokenExpiry)) {
            const localToken = this.getTokenFromLocalStorage();
            if (!localToken) {
                const renderToken = await this.tryRenderCache();
                if (renderToken) return renderToken;
            }
        }

        // Priority 1: Check current token in memory
        if (this.currentToken && !this.isTokenExpired(this.currentTokenExpiry)) {
            return this.currentToken;
        }

        // Priority 2: Check localStorage (fast, no network)
        const localToken = this.getTokenFromLocalStorage();
        if (localToken) {
            this.currentToken = localToken.token;
            this.currentTokenExpiry = localToken.expiry;
            return localToken.token;
        }

        // Priority 3: Check Firestore (network required)
        const firestoreToken = await this.getTokenFromFirestore();
        if (firestoreToken) {
            return firestoreToken;
        }

        // Priority 4: Check cookie
        const cookieToken = this.getTokenFromCookie();
        if (cookieToken) {
            const payload = this.decodeToken(cookieToken);
            if (payload && !this.isTokenExpired(payload.exp)) {
                await this.saveTokenToFirestore(cookieToken);
                return cookieToken;
            }
        }

        // No valid token found
        console.warn('[PANCAKE-TOKEN] No valid token found. Please login to Pancake.vn or set token manually.');
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

            // Validate not empty after cleaning
            if (!cleanedToken) {
                throw new Error('Token trống sau khi làm sạch. Vui lòng kiểm tra lại token.');
            }

            // Validate token format (should have 3 parts separated by dots)
            const parts = cleanedToken.split('.');
            if (parts.length !== 3) {
                throw new Error(`Token không đúng định dạng JWT (có ${parts.length} phần, cần 3 phần cách nhau bởi dấu chấm)`);
            }

            // Check each part is not empty
            if (!parts[0] || !parts[1] || !parts[2]) {
                throw new Error('Token có phần trống, vui lòng kiểm tra lại');
            }

            // Decode and validate
            const payload = this.decodeToken(cleanedToken);
            if (!payload) {
                // Check console for detailed error messages
                console.error('[PANCAKE-TOKEN] 🔍 Kiểm tra console để xem chi tiết lỗi');
                console.error('[PANCAKE-TOKEN] 📋 Token đã làm sạch:', cleanedToken.substring(0, 100) + '...');
                throw new Error('Không thể giải mã token. Vui lòng:\n1. Kiểm tra lại token đã copy đúng chưa\n2. Đăng nhập lại Pancake và lấy token mới\n3. Xem console (F12) để biết lỗi chi tiết');
            }

            if (this.isTokenExpired(payload.exp)) {
                const expiryDate = new Date(payload.exp * 1000).toLocaleString('vi-VN');
                throw new Error(`Token đã hết hạn vào ${expiryDate}. Vui lòng đăng nhập lại Pancake để lấy token mới.`);
            }

            // Save to Firebase
            const accountId = await this.saveTokenToFirestore(cleanedToken);
            if (!accountId) {
                throw new Error('Không thể lưu token vào Firebase. Vui lòng thử lại.');
            }

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
            savedAt: new Date(account.savedAt).toLocaleString()
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
            isActive: this.activeAccountId === accountId
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
            info: {}
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
            result.info.partLengths = parts.map(p => p.length);

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
     * Smart merge: keeps the newer version based on savedAt timestamp
     */
    async loadPageAccessTokens() {
        try {
            // Load from Render DB (source of truth)
            const _fetch = window.fetchWithTimeout || fetch;
            const r = await _fetch(`${_RENDER_URL}/api/pancake-page-tokens`, {}, 8000);
            if (!r.ok) return;

            const data = await r.json();
            const dbTokens = data.tokens || {};

            // Smart merge: keep the newer version for each pageId.
            // Skip DB rows with empty token or savedAt=0 (these are lock placeholders, not real PATs).
            const mergedTokens = { ...this.pageAccessTokens };

            for (const [pageId, dbData] of Object.entries(dbTokens)) {
                if (!dbData?.token || !(dbData.savedAt > 0)) continue; // skip placeholder
                const localData = this.pageAccessTokens[pageId];
                if (!localData || (dbData.savedAt || 0) > (localData.savedAt || 0)) {
                    mergedTokens[pageId] = dbData;
                }
            }

            this.pageAccessTokens = mergedTokens;
            this.savePageAccessTokensToLocalStorage();

            console.log(`[PANCAKE-TOKEN] Loaded ${Object.keys(dbTokens).length} page tokens from Render DB`);
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
                savedAt: Date.now()
            };

            // Update in-memory cache first
            this.pageAccessTokens[pageId] = data;

            // Save to localStorage (fast, synchronous)
            this.savePageAccessTokensToLocalStorage();

            // Save to Render DB (async, shared across machines)
            try {
                const _fetch = window.fetchWithTimeout || fetch;
                _fetch(`${_RENDER_URL}/api/pancake-page-tokens/${pageId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token, pageName, timestamp,
                        generatedBy: this.accounts[this.activeAccountId]?.name || 'unknown'
                    })
                }, 6000).catch(() => {});
            } catch (e) { /* fire-and-forget */ }

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
            }
        }

        // Guard: empty token (lock placeholder row) → treat as no token → triggers regen
        if (!data?.token) return null;
        return data.token;
    }

    /**
     * Generate new page_access_token via Pancake API
     * @param {string} pageId - Page ID
     * @returns {Promise<string|null>} - New token or null
     */
    async generatePageAccessToken(pageId) {
        // P2-revised: Acquire distributed lock. If another machine is already regenerating,
        // poll Render for the new PAT instead of duplicating the work.
        const _fetch = window.fetchWithTimeout || fetch;
        let lockAcquired = false;
        // Lock TTL 15s covers worst-case polling window (10 × 1.5s = 15s)
        const LOCK_TTL_MS = 15000;
        const POLL_FETCH_TIMEOUT_MS = 1500;
        const POLL_INTERVAL_MS = 500;
        const POLL_MAX_ITER = 10;
        try {
            const lockRes = await _fetch(`${_RENDER_URL}/api/pancake-page-tokens/${pageId}/lock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ttlMs: LOCK_TTL_MS })
            }, 4000);
            if (lockRes.ok) {
                const data = await lockRes.json();
                lockAcquired = data.acquired === true;
                if (!lockAcquired) {
                    // Another machine holds lock → poll for fresh PAT
                    console.log('[PANCAKE-TOKEN] Regen lock held by another machine, polling...');
                    const existing = this.pageAccessTokens[pageId];
                    const baselineSavedAt = existing?.savedAt || 0;
                    for (let i = 0; i < POLL_MAX_ITER; i++) {
                        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                        try {
                            const r = await _fetch(`${_RENDER_URL}/api/pancake-page-tokens`, {}, POLL_FETCH_TIMEOUT_MS);
                            if (r.ok) {
                                const d = await r.json();
                                const fresh = d.tokens?.[pageId];
                                // Guard: reject empty tokens (happens if lock row was just created but regen not yet saved)
                                // Also require savedAt > 0 (real tokens have timestamp, placeholder lock row has 0)
                                const freshToken = fresh?.token;
                                const freshSavedAt = fresh?.savedAt || 0;
                                if (freshToken && freshSavedAt > baselineSavedAt) {
                                    this.pageAccessTokens[pageId] = fresh;
                                    this.savePageAccessTokensToLocalStorage();
                                    console.log('[PANCAKE-TOKEN] ✅ Got PAT from Render (another machine regenerated)');
                                    return freshToken;
                                }
                            }
                        } catch (_) { /* keep polling */ }
                    }
                    // Polling timed out — fall through to regen ourselves
                    console.warn('[PANCAKE-TOKEN] Polling timeout, regenerating anyway');
                }
            }
        } catch (e) {
            // Lock endpoint unavailable (e.g. old Render version) → proceed without lock
            console.warn('[PANCAKE-TOKEN] Lock acquire failed, no coordination:', e.message);
        }

        // Try current account token first
        const token = await this._tryGenerateWithToken(pageId, this.currentToken);
        if (token) {
            if (lockAcquired) this._releaseLock(pageId).catch(() => {});
            return token;
        }

        // Current account failed — try other accounts from Render DB
        console.warn('[PANCAKE-TOKEN] Current account failed for page', pageId, '— trying other accounts...');
        try {
            const r = await _fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/pancake-accounts?active=true', {}, 8000);
            if (r.ok) {
                const data = await r.json();
                const accounts = data.accounts || [];
                for (const acc of accounts) {
                    if (!acc.token || acc.token === this.currentToken) continue;
                    // Check if account has this page
                    const pages = acc.pages || [];
                    const hasPage = pages.some(p => String(p.id || p.pageId) === String(pageId));
                    if (!hasPage) continue;

                    const result = await this._tryGenerateWithToken(pageId, acc.token);
                    if (result) {
                        console.log(`[PANCAKE-TOKEN] ✅ Account "${acc.name}" succeeded for page ${pageId} — cached`);
                        if (lockAcquired) this._releaseLock(pageId).catch(() => {});
                        return result;
                    }
                }
            }
        } catch (e) {
            console.warn('[PANCAKE-TOKEN] Fallback accounts fetch failed:', e.message);
        }

        if (lockAcquired) this._releaseLock(pageId).catch(() => {});
        console.error('[PANCAKE-TOKEN] ❌ All accounts failed for page', pageId);
        return null;
    }

    async _releaseLock(pageId) {
        try {
            const _fetch = window.fetchWithTimeout || fetch;
            await _fetch(`${_RENDER_URL}/api/pancake-page-tokens/${pageId}/lock`, { method: 'DELETE' }, 3000);
        } catch (_) { /* best-effort */ }
    }

    /**
     * Try generating page_access_token with a specific JWT token
     * @returns {string|null} page_access_token or null
     */
    async _tryGenerateWithToken(pageId, accountToken) {
        try {
            if (!accountToken) return null;

            const url = window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/generate_page_access_token`,
                `access_token=${accountToken}`
            );

            const _fetch = window.fetchWithTimeout || fetch;
            const response = await _fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }, 10000);

            const result = await response.json();

            if (result.success && result.page_access_token) {
                await this.savePageAccessToken(pageId, result.page_access_token);
                return result.page_access_token;
            }
            return null;
        } catch (error) {
            return null;
        }
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

            const url = window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/generate_page_access_token`,
                `access_token=${accountToken}`
            );

            const _fetch = window.fetchWithTimeout || fetch;
            const response = await _fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }, 10000);

            const result = await response.json();

            if (result.success && result.page_access_token) {
                // Save to cache and Render DB
                await this.savePageAccessToken(pageId, result.page_access_token);
                return result.page_access_token;
            } else {
                throw new Error(result.message || 'Failed to generate token');
            }
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error generating page_access_token with token:', error);
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
        // Check cache first
        const cached = this.getPageAccessToken(pageId);
        if (cached) {
            return cached;
        }

        // Auto-generate if no cached token
        try {
            const generated = await this.generatePageAccessToken(pageId);
            if (generated) {
                return generated;
            }
        } catch (err) {
            console.warn('[PANCAKE-TOKEN] Auto-generate failed:', err.message);
        }

        return null;
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
            hasToken: !!data.token
        }));
    }
}

// Create global instance — singleton guard
if (!window.pancakeTokenManager) {
    window.pancakeTokenManager = new PancakeTokenManager();
}
