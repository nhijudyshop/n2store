// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   INBOX PANCAKE API - Dedicated Pancake API client for Inbox
   Token management + API calls (separate from shared)
   ===================================================== */

// =====================================================
// CONFIG & URL BUILDERS
// =====================================================

const INBOX_WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

const InboxApiConfig = {
    WORKER_URL: INBOX_WORKER_URL,

    buildUrl: {
        // User API (pages.fm/api/v1) - needs access_token
        pancake(endpoint, params = '') {
            const base = `${INBOX_WORKER_URL}/api/pancake/${endpoint}`;
            return params ? `${base}?${params}` : base;
        },
        // Public API v1 (pages.fm/api/public_api/v1) - needs page_access_token
        pancakeOfficial(endpoint, pageAccessToken) {
            const base = `${INBOX_WORKER_URL}/api/pancake-official/${endpoint}`;
            return pageAccessToken ? `${base}?page_access_token=${pageAccessToken}` : base;
        },
        // Public API v2 (pages.fm/api/public_api/v2) - needs page_access_token
        pancakeOfficialV2(endpoint, pageAccessToken) {
            const base = `${INBOX_WORKER_URL}/api/pancake-official-v2/${endpoint}`;
            return pageAccessToken ? `${base}?page_access_token=${pageAccessToken}` : base;
        },
        // Data persistence API (groups, labels, livestream, pending)
        dataApi(path) {
            return `${INBOX_WORKER_URL}/api/realtime/${path}`;
        }
    }
};

// =====================================================
// INBOX TOKEN MANAGER
// =====================================================

class InboxTokenManager {
    constructor() {
        this.currentToken = null;
        this.currentTokenExpiry = null;
        this.activeAccountId = null;
        this.accounts = {};
        this.pageAccessTokens = {};
        this.accountPageAccessMap = {};

        this.LS_KEYS = {
            JWT_TOKEN: 'pancake_jwt_token',
            JWT_EXPIRY: 'pancake_jwt_token_expiry',
            ACCOUNT_ID: 'tpos_pancake_active_account_id',
            PAGE_TOKENS: 'pancake_page_access_tokens',
            ALL_ACCOUNTS: 'pancake_all_accounts'
        };
    }

    // --- Initialize ---
    async initialize() {
        try {
            console.log('[INBOX-TOKEN] Initializing...');
            this._loadFromLocalStorage();

            if (!window.firebase?.firestore) {
                console.warn('[INBOX-TOKEN] Firestore not available, using localStorage only');
                return true;
            }

            const db = window.firebase.firestore();
            this._accountsRef = db.collection('pancake_tokens').doc('accounts');
            this._pageTokensRef = db.collection('pancake_tokens').doc('page_access_tokens');
            this._prefsRef = db.collection('pancake_tokens').doc('preferences');

            await this._loadAccounts();
            await this._loadPageAccessTokens();

            console.log('[INBOX-TOKEN] Initialized, accounts:', Object.keys(this.accounts).length);
            return true;
        } catch (error) {
            console.error('[INBOX-TOKEN] Init error:', error);
            return this.currentToken !== null;
        }
    }

    // --- Token Retrieval (priority: memory → localStorage → Firestore → cookie) ---
    async getToken() {
        if (this.currentToken && !this._isExpired(this.currentTokenExpiry)) {
            return this.currentToken;
        }
        const local = this._getLocalToken();
        if (local) {
            this.currentToken = local.token;
            this.currentTokenExpiry = local.expiry;
            return local.token;
        }
        const fsToken = await this._getFirestoreToken();
        if (fsToken) return fsToken;

        const cookie = this._getCookieToken();
        if (cookie) {
            const payload = this.decodeToken(cookie);
            if (payload && !this._isExpired(payload.exp)) {
                await this.saveTokenToFirestore(cookie);
                return cookie;
            }
        }
        console.warn('[INBOX-TOKEN] No valid token found');
        return null;
    }

    getTokenSync() {
        if (this.currentToken && !this._isExpired(this.currentTokenExpiry)) {
            return this.currentToken;
        }
        const local = this._getLocalToken();
        if (local) {
            this.currentToken = local.token;
            this.currentTokenExpiry = local.expiry;
            return local.token;
        }
        return null;
    }

    // --- Decode JWT ---
    decodeToken(token) {
        try {
            if (!token || typeof token !== 'string') return null;
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            const payload = parts[1];
            let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
            const pad = base64.length % 4;
            if (pad) base64 += '='.repeat(4 - pad);
            const bin = atob(base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return JSON.parse(new TextDecoder('utf-8').decode(bytes));
        } catch (e) {
            console.error('[INBOX-TOKEN] Decode error:', e.message);
            return null;
        }
    }

    _isExpired(exp) {
        if (!exp) return true;
        return Math.floor(Date.now() / 1000) >= (exp - 3600);
    }

    isTokenExpired(exp) {
        return this._isExpired(exp);
    }

    // --- Multi-Account ---
    getAllAccounts() {
        return Object.entries(this.accounts).map(([id, acc]) => ({
            ...acc,
            accountId: id,
            isActive: id === this.activeAccountId
        }));
    }

    getActiveAccountId() { return this.activeAccountId; }

    async setActiveAccount(accountId) {
        const acc = this.accounts[accountId];
        if (!acc) return false;
        if (this._isExpired(acc.exp)) return false;

        this.activeAccountId = accountId;
        this.currentToken = acc.token;
        this.currentTokenExpiry = acc.exp;
        localStorage.setItem(this.LS_KEYS.ACCOUNT_ID, accountId);
        this._saveLocalToken(acc.token, acc.exp);

        const userType = localStorage.getItem('userType');
        if (userType && this._prefsRef) {
            this._prefsRef.set({
                [userType]: { activeAccountId: accountId, updatedAt: Date.now() }
            }, { merge: true }).catch(() => {});
        }
        return true;
    }

    getValidAccounts() {
        const now = Math.floor(Date.now() / 1000);
        const valid = [];
        for (const [id, acc] of Object.entries(this.accounts)) {
            if (acc.exp && now < acc.exp - 3600) {
                valid.push({ accountId: id, name: acc.name, uid: acc.uid, token: acc.token, exp: acc.exp });
            }
        }
        return valid;
    }

    async deleteAccount(accountId) {
        if (!this.accounts[accountId]) return false;
        if (this._accountsRef) {
            await this._accountsRef.update({
                [`data.${accountId}`]: window.firebase.firestore.FieldValue.delete()
            });
        }
        delete this.accounts[accountId];
        if (this.activeAccountId === accountId) {
            this.activeAccountId = null;
            this.currentToken = null;
            localStorage.removeItem(this.LS_KEYS.ACCOUNT_ID);
            const ids = Object.keys(this.accounts);
            if (ids.length > 0) await this.setActiveAccount(ids[0]);
        }
        return true;
    }

    async saveTokenToFirestore(token, accountId = null) {
        let clean = token.trim();
        if (clean.startsWith('jwt=')) clean = clean.substring(4).trim();
        clean = clean.replace(/^["']|["']$/g, '').replace(/\s+/g, '').replace(/[;,]+$/g, '');

        const payload = this.decodeToken(clean);
        if (!payload) return null;
        if (!accountId) accountId = payload.uid || `account_${Date.now()}`;

        const data = { token: clean, exp: payload.exp, uid: payload.uid, name: payload.name || 'Unknown', savedAt: Date.now() };
        this.accounts[accountId] = data;
        this.activeAccountId = accountId;
        this.currentToken = clean;
        this.currentTokenExpiry = payload.exp;
        localStorage.setItem(this.LS_KEYS.ACCOUNT_ID, accountId);
        this._saveLocalToken(clean, payload.exp);

        if (this._accountsRef) {
            await this._accountsRef.set({ data: { [accountId]: data } }, { merge: true });
        }
        return accountId;
    }

    async setTokenManual(token) {
        let clean = token.trim();
        if (clean.toLowerCase().startsWith('jwt=')) clean = clean.substring(4).trim();
        clean = clean.replace(/^["']|["']$/g, '').replace(/\s+/g, '').replace(/[;,]+$/g, '');

        if (!clean) throw new Error('Token trống sau khi làm sạch');
        const parts = clean.split('.');
        if (parts.length !== 3) throw new Error(`Token không đúng định dạng JWT (có ${parts.length} phần, cần 3)`);

        const payload = this.decodeToken(clean);
        if (!payload) throw new Error('Không thể giải mã token');
        if (this._isExpired(payload.exp)) {
            throw new Error(`Token đã hết hạn vào ${new Date(payload.exp * 1000).toLocaleString('vi-VN')}`);
        }

        const accountId = await this.saveTokenToFirestore(clean);
        if (!accountId) throw new Error('Không thể lưu token');
        return accountId;
    }

    // --- Page Access Tokens ---
    getPageAccessToken(pageId) {
        let data = this.pageAccessTokens[pageId];
        if (!data) {
            try {
                const stored = localStorage.getItem(this.LS_KEYS.PAGE_TOKENS);
                if (stored) {
                    const all = JSON.parse(stored);
                    if (all[pageId]) {
                        data = all[pageId];
                        this.pageAccessTokens[pageId] = data;
                    }
                }
            } catch (e) {}
        }
        return data ? data.token : null;
    }

    async savePageAccessToken(pageId, token, pageName = '') {
        const data = { token, pageId, pageName, savedAt: Date.now() };
        this.pageAccessTokens[pageId] = data;
        this._savePageTokensLocal();
        if (this._pageTokensRef) {
            await this._pageTokensRef.set({ [pageId]: data }, { merge: true }).catch(() => {});
        }
        return true;
    }

    async generatePageAccessToken(pageId, accountToken = null) {
        // Try specific token first
        const tryGenerate = async (jwt) => {
            const url = InboxApiConfig.buildUrl.pancake(`pages/${pageId}/generate_page_access_token`, `access_token=${jwt}`);
            const res = await fetch(url, { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } });
            const data = await res.json();
            if (data.success && data.page_access_token) {
                await this.savePageAccessToken(pageId, data.page_access_token);
                return data.page_access_token;
            }
            return null;
        };

        try {
            // Try provided token or current token
            const jwt = accountToken || this.currentToken;
            if (jwt) {
                const pat = await tryGenerate(jwt);
                if (pat) return pat;
            }

            // Current token failed — try all other valid accounts
            const validAccounts = this.getValidAccounts();
            for (const acc of validAccounts) {
                if (acc.token === jwt) continue; // skip already-tried
                try {
                    const pat = await tryGenerate(acc.token);
                    if (pat) {
                        console.log(`[INBOX-TOKEN] Generated PAT for page ${pageId} using account ${acc.name || acc.accountId}`);
                        return pat;
                    }
                } catch (e) { /* try next account */ }
            }
        } catch (e) {
            console.error('[INBOX-TOKEN] Generate page token error:', e);
        }
        return null;
    }

    async getOrGeneratePageAccessToken(pageId) {
        const cached = this.getPageAccessToken(pageId);
        if (cached) return cached;
        return await this.generatePageAccessToken(pageId);
    }

    getAllPageAccessTokens() {
        return Object.entries(this.pageAccessTokens).map(([pageId, data]) => ({
            pageId, pageName: data.pageName || pageId, token: data.token || null, savedAt: data.savedAt
        }));
    }

    // --- Account Page Access ---
    async fetchAccountPages(accountId, token) {
        try {
            const url = InboxApiConfig.buildUrl.pancake('pages', `access_token=${token}`);
            const res = await fetch(url);
            const data = await res.json();
            if (data.success && data.categorized?.activated) {
                const pages = data.categorized.activated.filter(p => !p.id.startsWith('igo_'));
                this.accountPageAccessMap[accountId] = new Set(pages.map(p => p.id));
                return this.accountPageAccessMap[accountId];
            }
        } catch (e) {}
        this.accountPageAccessMap[accountId] = new Set();
        return this.accountPageAccessMap[accountId];
    }

    async prefetchAllAccountPages() {
        const valid = this.getValidAccounts();
        await Promise.all(valid.map(a => this.fetchAccountPages(a.accountId, a.token)));
    }

    findAccountWithPageAccess(pageId, excludeId = null) {
        const valid = this.getValidAccounts();
        return valid.find(a => a.accountId !== excludeId && this.accountPageAccessMap[a.accountId]?.has(pageId)) || null;
    }

    getAccountsWithPageAccess(pageId) {
        return this.getValidAccounts().filter(a => this.accountPageAccessMap[a.accountId]?.has(pageId));
    }

    // --- Extract page_access_tokens from /pages response ---
    extractPageTokensFromPages(pages) {
        let count = 0;
        for (const page of pages) {
            const pat = page.settings?.page_access_token;
            if (page.id && pat) {
                this.pageAccessTokens[page.id] = { token: pat, pageId: page.id, pageName: page.name || page.id, savedAt: Date.now() };
                count++;
            }
        }
        if (count > 0) {
            this._savePageTokensLocal();
            if (this._pageTokensRef) {
                const toSave = {};
                for (const [k, v] of Object.entries(this.pageAccessTokens)) toSave[k] = v;
                this._pageTokensRef.set(toSave, { merge: true }).catch(() => {});
            }
            console.log(`[INBOX-TOKEN] Extracted ${count} page_access_tokens from /pages`);
        }
    }

    // --- Internal helpers ---
    _loadFromLocalStorage() {
        const token = localStorage.getItem(this.LS_KEYS.JWT_TOKEN);
        const expiry = localStorage.getItem(this.LS_KEYS.JWT_EXPIRY);
        if (token && expiry) {
            const exp = parseInt(expiry, 10);
            if (!this._isExpired(exp)) {
                this.currentToken = token;
                this.currentTokenExpiry = exp;
            }
        }
        this.activeAccountId = localStorage.getItem(this.LS_KEYS.ACCOUNT_ID);
        try {
            const pt = localStorage.getItem(this.LS_KEYS.PAGE_TOKENS);
            if (pt) this.pageAccessTokens = JSON.parse(pt);
        } catch (e) {}
        try {
            const aa = localStorage.getItem(this.LS_KEYS.ALL_ACCOUNTS);
            if (aa) this.accounts = JSON.parse(aa);
        } catch (e) {}
    }

    _getLocalToken() {
        const token = localStorage.getItem(this.LS_KEYS.JWT_TOKEN);
        const expiry = localStorage.getItem(this.LS_KEYS.JWT_EXPIRY);
        if (!token || !expiry) return null;
        const exp = parseInt(expiry, 10);
        if (this._isExpired(exp)) return null;
        return { token, expiry: exp };
    }

    _saveLocalToken(token, exp) {
        localStorage.setItem(this.LS_KEYS.JWT_TOKEN, token);
        localStorage.setItem(this.LS_KEYS.JWT_EXPIRY, exp.toString());
    }

    _savePageTokensLocal() {
        try {
            localStorage.setItem(this.LS_KEYS.PAGE_TOKENS, JSON.stringify(this.pageAccessTokens));
        } catch (e) {}
    }

    async _loadAccounts() {
        try {
            const doc = await this._accountsRef.get();
            this.accounts = doc.exists ? (doc.data()?.data || {}) : {};

            let preferredId = null;
            const userType = localStorage.getItem('userType');
            if (userType && this._prefsRef) {
                try {
                    const pDoc = await this._prefsRef.get();
                    if (pDoc.exists) preferredId = pDoc.data()?.[userType]?.activeAccountId || null;
                } catch (e) {}
            }

            this.activeAccountId = preferredId || localStorage.getItem(this.LS_KEYS.ACCOUNT_ID);

            if (this.activeAccountId && this.accounts[this.activeAccountId]) {
                const acc = this.accounts[this.activeAccountId];
                this.currentToken = acc.token;
                this.currentTokenExpiry = acc.exp;
                localStorage.setItem(this.LS_KEYS.ACCOUNT_ID, this.activeAccountId);
                this._saveLocalToken(acc.token, acc.exp);
            } else if (Object.keys(this.accounts).length > 0) {
                await this.setActiveAccount(Object.keys(this.accounts)[0]);
            }

            try {
                localStorage.setItem(this.LS_KEYS.ALL_ACCOUNTS, JSON.stringify(this.accounts));
            } catch (e) {}
        } catch (e) {
            console.error('[INBOX-TOKEN] Load accounts error:', e);
        }
    }

    async _getFirestoreToken() {
        if (!this._accountsRef || !this.activeAccountId) return null;
        let data = this.accounts[this.activeAccountId];
        if (!data) {
            const doc = await this._accountsRef.get();
            if (doc.exists) {
                this.accounts = doc.data()?.data || {};
                data = this.accounts[this.activeAccountId];
            }
        }
        if (!data?.token) return null;
        let token = data.token;
        if (token.startsWith('jwt=')) token = token.substring(4);
        const payload = this.decodeToken(token);
        if (!payload || this._isExpired(payload.exp)) return null;
        this.currentToken = token;
        this.currentTokenExpiry = payload.exp;
        this._saveLocalToken(token, payload.exp);
        return token;
    }

    _getCookieToken() {
        try {
            const cookies = document.cookie.split(';');
            const jwt = cookies.find(c => c.trim().startsWith('jwt='));
            if (jwt) return jwt.split('=').slice(1).join('=').trim();
        } catch (e) {}
        return null;
    }

    async _loadPageAccessTokens() {
        try {
            if (!this._pageTokensRef) return;
            const doc = await this._pageTokensRef.get();
            if (!doc.exists) return;
            const docData = doc.data() || {};
            const fsTokens = {};
            if (docData.data && typeof docData.data === 'object') Object.assign(fsTokens, docData.data);
            for (const [k, v] of Object.entries(docData)) {
                if (k !== 'data' && v?.token) {
                    if (!fsTokens[k] || (v.savedAt || 0) > (fsTokens[k].savedAt || 0)) fsTokens[k] = v;
                }
            }
            const merged = { ...this.pageAccessTokens };
            for (const [pid, fsData] of Object.entries(fsTokens)) {
                const local = this.pageAccessTokens[pid];
                if (!local || (fsData.savedAt || 0) > (local.savedAt || 0)) merged[pid] = fsData;
            }
            this.pageAccessTokens = merged;
            this._savePageTokensLocal();
        } catch (e) {
            console.error('[INBOX-TOKEN] Load page tokens error:', e);
        }
    }

    getTokenInfo() {
        if (!this.activeAccountId || !this.accounts[this.activeAccountId]) return null;
        const acc = this.accounts[this.activeAccountId];
        return {
            accountId: this.activeAccountId, name: acc.name, uid: acc.uid, exp: acc.exp,
            expiryDate: new Date(acc.exp * 1000).toLocaleString(), isExpired: this._isExpired(acc.exp)
        };
    }
}

// =====================================================
// INBOX PANCAKE API CLIENT
// =====================================================

class InboxPancakeAPI {
    constructor(tokenManager) {
        this.tm = tokenManager;
        this.pages = [];
        this.pageIds = [];
        this._lastConvId = {};          // cursor per page for pagination
        this._searchablePageIds = null;
        this.CACHE_DURATION = 5 * 60 * 1000;
        this.MSG_CACHE_DURATION = 2 * 60 * 1000;
        this._messagesCache = new Map();
        this._lastPageFetch = null;
    }

    // --- Fetch Pages ---
    async fetchPages(forceRefresh = false) {
        if (!forceRefresh && this.pages.length > 0 && this._lastPageFetch && (Date.now() - this._lastPageFetch < this.CACHE_DURATION)) {
            return this.pages;
        }
        try {
            const token = await this.tm.getToken();
            if (!token) throw new Error('No token');

            const url = InboxApiConfig.buildUrl.pancake('pages', `access_token=${token}`);
            const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            if (data.success && data.categorized?.activated) {
                this.pages = data.categorized.activated.filter(p => !p.id.startsWith('igo_'));
                this.pageIds = this.pages.map(p => p.id);
                this._lastPageFetch = Date.now();
                this.tm.extractPageTokensFromPages(this.pages);
                console.log(`[INBOX-API] Fetched ${this.pages.length} pages`);
                return this.pages;
            }
            return [];
        } catch (e) {
            console.error('[INBOX-API] fetchPages error:', e);
            return [];
        }
    }

    // --- Fetch Pages Unread Count ---
    async fetchPagesUnreadCount() {
        try {
            const token = await this.tm.getToken();
            if (!token) return [];
            const url = InboxApiConfig.buildUrl.pancake('pages/unread_conv_pages_count', `access_token=${token}`);
            const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
            if (!res.ok) return [];
            const data = await res.json();
            if (data.success && data.data) {
                return data.data.map(item => ({
                    page_id: item.page_id,
                    unread_conv_count: item.unread_conv_count || 0,
                    page_name: this.pages.find(p => p.id === item.page_id)?.name || item.page_id
                }));
            }
            return [];
        } catch (e) {
            console.error('[INBOX-API] fetchPagesUnreadCount error:', e);
            return [];
        }
    }

    // --- Fetch Conversations (per-page via Public API v2) ---
    async fetchConversations(pageIds = null) {
        try {
            if (this.pageIds.length === 0) await this.fetchPages();
            const ids = pageIds || this._searchablePageIds || this.pageIds;
            if (ids.length === 0) return { conversations: [], error: null };

            const allConvs = [];
            const errors = [];

            // PARALLEL fetch: all pages run simultaneously instead of sequentially.
            // Each page handles its own token regen + retry independently.
            const fetchOnePage = async (pageId) => {
                let pat = this.tm.getPageAccessToken(pageId);
                if (!pat) pat = await this.tm.generatePageAccessToken(pageId);
                if (!pat) { console.warn(`[INBOX-API] Page ${pageId}: NO PAT`); return { pageId, error: { code: 'NO_TOKEN' } }; }

                const fetchPage = async (token) => {
                    const url = InboxApiConfig.buildUrl.pancakeOfficialV2(
                        `pages/${pageId}/conversations`, token
                    );
                    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                    if (!res.ok) throw { code: res.status };
                    const data = await res.json();
                    if (data.error_code) throw { code: data.error_code, message: data.message };
                    return data;
                };

                try {
                    let data;
                    try {
                        data = await fetchPage(pat);
                    } catch (err) {
                        if (err.code === 105 || err.code === 100) {
                            console.warn(`[INBOX-API] Page ${pageId}: token error ${err.code}, regenerating...`);
                            pat = await this.tm.generatePageAccessToken(pageId);
                            if (!pat) throw { code: 'REGEN_FAILED' };
                            data = await fetchPage(pat);
                        } else {
                            throw err;
                        }
                    }
                    return { pageId, data };
                } catch (e) {
                    const msg = e.message || e.code || String(e);
                    console.warn(`[INBOX-API] Page ${pageId}: ${msg}`);
                    return { pageId, error: { code: e.code, message: e.message } };
                }
            };

            const results = await Promise.all(ids.map(fetchOnePage));
            for (const r of results) {
                if (r.error) {
                    errors.push({ pageId: r.pageId, ...r.error });
                    continue;
                }
                const data = r.data;
                if (data && data.conversations) {
                    console.log(`[INBOX-API] Page ${r.pageId}: ${data.conversations.length} conversations`);
                    allConvs.push(...data.conversations);
                    const convs = data.conversations;
                    if (convs.length > 0) {
                        this._lastConvId[r.pageId] = convs[convs.length - 1].id;
                    }
                    try { window.GlobalIdHarvester?.fromConversations(r.pageId, convs); } catch (_) {}
                }
            }

            return { conversations: allConvs, error: errors.length > 0 ? errors : null };
        } catch (e) {
            console.error('[INBOX-API] fetchConversations error:', e);
            return { conversations: [], error: { code: 0, message: e.message } };
        }
    }

    // --- Fetch Conversations For Single Page (Public API v2) ---
    async fetchConversationsForPage(pageId) {
        try {
            let pat = this.tm.getPageAccessToken(pageId);
            if (!pat) pat = await this.tm.generatePageAccessToken(pageId);
            if (!pat) return { conversations: [], error: { code: 'NO_TOKEN' } };

            const url = InboxApiConfig.buildUrl.pancakeOfficialV2(
                `pages/${pageId}/conversations`, pat
            ) + '&unread_first=true';

            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return { conversations: [], error: { code: res.status } };

            const data = await res.json();
            if (data.error_code) return { conversations: [], error: { code: data.error_code, message: data.message } };

            const convs = data.conversations || [];
            if (convs.length > 0) {
                this._lastConvId[pageId] = convs[convs.length - 1].id;
            }
            try { window.GlobalIdHarvester?.fromConversations(pageId, convs); } catch (_) {}
            return { conversations: convs, error: null };
        } catch (e) {
            return { conversations: [], error: { code: 0, message: e.message } };
        }
    }

    // --- Fetch More Conversations (cursor pagination via last_conversation_id) ---
    async fetchMoreConversations(pageIds = null) {
        try {
            const ids = pageIds || this._searchablePageIds || this.pageIds;
            if (ids.length === 0) return [];

            // Parallel fetch more for all pages with cursors
            const fetchOnePage = async (pageId) => {
                const cursor = this._lastConvId[pageId];
                if (!cursor) return [];

                let pat = this.tm.getPageAccessToken(pageId);
                if (!pat) pat = await this.tm.generatePageAccessToken(pageId);
                if (!pat) return [];

                const url = InboxApiConfig.buildUrl.pancakeOfficialV2(
                    `pages/${pageId}/conversations`, pat
                ) + `&last_conversation_id=${cursor}&unread_first=true`;

                try {
                    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                    if (!res.ok) return [];
                    const data = await res.json();
                    if (data.conversations?.length > 0) {
                        this._lastConvId[pageId] = data.conversations[data.conversations.length - 1].id;
                        return data.conversations;
                    }
                } catch (e) { console.error(`[INBOX-API] fetchMore page ${pageId}:`, e.message); }
                return [];
            };

            const results = await Promise.all(ids.map(fetchOnePage));
            return results.flat();
        } catch (e) {
            console.error('[INBOX-API] fetchMore error:', e);
            return [];
        }
    }

    // --- Fetch Messages (Public API v1 with page_access_token) ---
    async fetchMessages(pageId, conversationId, currentCount = null, customerId = null, forceRefresh = false) {
        const cacheKey = `${pageId}_${conversationId}`;
        if (!forceRefresh && currentCount === null) {
            const cached = this._messagesCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.MSG_CACHE_DURATION) {
                return { ...cached, fromCache: true };
            }
        }
        try {
            let pat = this.tm.getPageAccessToken(pageId);
            if (!pat) pat = await this.tm.generatePageAccessToken(pageId);
            if (!pat) throw new Error('No page_access_token');

            const doFetch = async (token) => {
                const endpoint = `pages/${pageId}/conversations/${conversationId}/messages`;
                let url = InboxApiConfig.buildUrl.pancakeOfficial(endpoint, token);
                if (customerId) url += `&customer_id=${customerId}`;
                if (currentCount !== null) url += `&current_count=${currentCount}`;
                const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            };

            let data;
            try {
                data = await doFetch(pat);
            } catch (e) {
                // Retry with fresh PAT
                console.warn(`[INBOX-API] fetchMessages retry for page ${pageId}: ${e.message}`);
                pat = await this.tm.generatePageAccessToken(pageId);
                if (!pat) throw new Error('No page_access_token after regen');
                data = await doFetch(pat);
            }

            if (data.error_code) {
                // Token renewed — regenerate and retry
                if (data.error_code === 105 || data.error_code === 100) {
                    console.warn(`[INBOX-API] fetchMessages token error ${data.error_code}, regenerating...`);
                    pat = await this.tm.generatePageAccessToken(pageId);
                    if (pat) data = await doFetch(pat);
                }
            }

            console.log('[INBOX-API] fetchMessages:', { pageId, messageCount: data.messages?.length });
            const result = {
                messages: data.messages || [],
                conversation: data.conversation || null,
                customers: data.customers || data.conv_customers || [],
                customerId: (data.customers || data.conv_customers || [])[0]?.id || null,
                post: data.post || null,
                activities: data.activities || [],
                reports_by_phone: data.reports_by_phone || {},
                comment_count: data.comment_count || 0,
                recent_phone_numbers: data.recent_phone_numbers || [],
                conv_phone_numbers: data.conv_phone_numbers || [],
                notes: data.notes || [],
                timestamp: Date.now()
            };

            if (currentCount === null) {
                this._messagesCache.set(cacheKey, result);
            }
            try { window.GlobalIdHarvester?.fromCustomers(pageId, result.customers, { conversationId, threadId: result.conversation?.thread_id }); } catch (_) {}
            return { ...result, fromCache: false };
        } catch (e) {
            console.error('[INBOX-API] fetchMessages error:', e);
            return { messages: [], conversation: null, customers: [], customerId: null, post: null, activities: [], reports_by_phone: {}, comment_count: 0, recent_phone_numbers: [], conv_phone_numbers: [], notes: [], fromCache: false };
        }
    }

    clearMessagesCache(pageId, conversationId) {
        this._messagesCache.delete(`${pageId}_${conversationId}`);
    }

    // --- Send Message ---
    async sendMessage(pageId, conversationId, payload, pageAccessToken) {
        try {
            const url = InboxApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/messages`,
                pageAccessToken
            );
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload)
            });
            const text = await res.text();
            let data;
            try { data = JSON.parse(text); } catch (e) { data = { success: false, raw: text }; }
            return data;
        } catch (e) {
            console.error('[INBOX-API] sendMessage error:', e);
            return { success: false, error: e.message };
        }
    }

    // --- Upload Media (Public API v1 - upload_contents) ---
    async uploadMedia(pageId, file, pageAccessToken) {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const url = InboxApiConfig.buildUrl.pancakeOfficial(`pages/${pageId}/upload_contents`, pageAccessToken);
            const res = await fetch(url, { method: 'POST', body: formData });
            const data = await res.json();
            return data;
        } catch (e) {
            console.error('[INBOX-API] uploadMedia error:', e);
            return { success: false, error: e.message };
        }
    }

    // --- Search Conversations ---
    async searchConversations(query, pageIds = null) {
        try {
            if (!query) return { conversations: [], customerId: null };
            const token = await this.tm.getToken();
            if (!token) return { conversations: [], customerId: null };

            let ids = pageIds || this._searchablePageIds || this.pageIds;
            ids = ids.filter(id => !id.startsWith('igo_'));
            if (ids.length === 0) return { conversations: [], customerId: null };

            const encoded = encodeURIComponent(query);
            const result = await this._doSearch(token, encoded, ids);
            if (result.success) return result;

            // Error 122: try page-by-page detection
            if (result.errorCode === 122 && ids.length > 1 && !this._searchablePageIds) {
                const working = [];
                for (const pid of ids) {
                    const test = await this._doSearch(token, encoded, [pid]);
                    if (test.success || (test.errorCode !== 122 && test.errorCode !== 429)) working.push(pid);
                    await new Promise(r => setTimeout(r, 500));
                }
                if (working.length > 0) {
                    this._searchablePageIds = working;
                    await new Promise(r => setTimeout(r, 1000));
                    const retry = await this._doSearch(token, encoded, working);
                    if (retry.success) return retry;
                }
            }
            return { conversations: [], customerId: null };
        } catch (e) {
            console.error('[INBOX-API] search error:', e);
            return { conversations: [], customerId: null };
        }
    }

    async _doSearch(token, encodedQuery, pageIds) {
        const qs = `q=${encodedQuery}&access_token=${token}&cursor_mode=true`;
        const url = InboxApiConfig.buildUrl.pancake('conversations/search', qs);
        const formData = new FormData();
        formData.append('page_ids', pageIds.join(','));
        try {
            const res = await fetch(url, { method: 'POST', body: formData });
            if (!res.ok) return { success: false, errorCode: res.status };
            const data = await res.json();
            if (data.error_code || !data.success) return { success: false, errorCode: data.error_code, message: data.message };
            const convs = data.conversations || [];
            const cid = convs[0]?.customers?.[0]?.id || null;
            return { success: true, conversations: convs, customerId: cid };
        } catch (e) {
            return { success: false, errorCode: 0, message: e.message };
        }
    }

    // --- Search by Customer ID (Pancake Direct API) ---
    // GET /conversations/customer/{fbId}?pages[id1]=0&pages[id2]=0&access_token=...
    // Returns ALL conversations (inbox + comment) for a customer across all pages.
    async searchByCustomerId(fbId) {
        try {
            const token = await this.tm.getToken();
            if (!token) return { conversations: [] };
            const ids = this._searchablePageIds || this.pageIds;
            if (ids.length === 0) return { conversations: [] };
            const pagesParams = ids.map(id => `pages[${id}]=0`).join('&');
            const url = InboxApiConfig.buildUrl.pancake(
                `conversations/customer/${fbId}`,
                `${pagesParams}&access_token=${token}`
            );
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return { conversations: [] };
            const data = await res.json();
            if (!data.success) return { conversations: [] };
            console.log(`[INBOX-API] searchByCustomerId(${fbId}): ${(data.conversations || []).length} conversations`);
            return { conversations: data.conversations || [] };
        } catch (e) {
            console.error('[INBOX-API] searchByCustomerId error:', e);
            return { conversations: [] };
        }
    }

    // --- Mark Read/Unread (Public API v1 with page_access_token) ---
    async markAsRead(pageId, conversationId) {
        try {
            let pat = this.tm.getPageAccessToken(pageId);
            if (!pat) pat = await this.tm.generatePageAccessToken(pageId);
            if (!pat) return false;
            const url = InboxApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/read`, pat
            );
            await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            return true;
        } catch (e) { return false; }
    }

    async markAsUnread(pageId, conversationId) {
        try {
            let pat = this.tm.getPageAccessToken(pageId);
            if (!pat) pat = await this.tm.generatePageAccessToken(pageId);
            if (!pat) return false;
            const url = InboxApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/unread`, pat
            );
            await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            return true;
        } catch (e) { return false; }
    }

    // --- Comment Actions ---
    async likeComment(pageId, commentId, pageAccessToken) {
        return this._commentAction(`pages/${pageId}/comments/${commentId}/likes`, 'POST', pageAccessToken);
    }

    async unlikeComment(pageId, commentId, pageAccessToken) {
        return this._commentAction(`pages/${pageId}/comments/${commentId}/likes`, 'DELETE', pageAccessToken);
    }

    async hideComment(pageId, commentId, pageAccessToken) {
        return this._commentAction(`pages/${pageId}/comments/${commentId}/hide`, 'POST', pageAccessToken);
    }

    async unhideComment(pageId, commentId, pageAccessToken) {
        return this._commentAction(`pages/${pageId}/comments/${commentId}/hide`, 'DELETE', pageAccessToken);
    }

    async deleteComment(pageId, commentId, pageAccessToken) {
        return this._commentAction(`pages/${pageId}/comments/${commentId}`, 'DELETE', pageAccessToken);
    }

    async sendReaction(pageId, commentId, reactionType, pageAccessToken) {
        try {
            const url = InboxApiConfig.buildUrl.pancakeOfficial(`pages/${pageId}/comments/${commentId}/reactions`, pageAccessToken);
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: reactionType })
            });
            return await res.json();
        } catch (e) { return { success: false }; }
    }

    async _commentAction(endpoint, method, pageAccessToken) {
        try {
            const url = InboxApiConfig.buildUrl.pancakeOfficial(endpoint, pageAccessToken);
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' } });
            return await res.json();
        } catch (e) { return { success: false }; }
    }

    // --- Fetch Tags (Public API v1 with page_access_token) ---
    async fetchTags(pageId) {
        try {
            let pat = this.tm.getPageAccessToken(pageId);
            if (!pat) pat = await this.tm.generatePageAccessToken(pageId);
            if (!pat) return [];
            const url = InboxApiConfig.buildUrl.pancakeOfficial(`pages/${pageId}/tags`, pat);
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return [];
            const data = await res.json();
            return data.tags || data.data || [];
        } catch (e) { return []; }
    }

    // --- Avatar URL ---
    getAvatarUrl(fbId, pageId = null, token = null, directAvatarUrl = null) {
        if (directAvatarUrl) {
            if (directAvatarUrl.includes('content.pancake.vn')) return `${INBOX_WORKER_URL}/api/image-proxy?url=${encodeURIComponent(directAvatarUrl)}`;
            if (/^[a-f0-9]{32,}$/i.test(directAvatarUrl)) return `${INBOX_WORKER_URL}/api/pancake-avatar?hash=${directAvatarUrl}`;
            if (directAvatarUrl.startsWith('http')) return directAvatarUrl;
        }
        if (!fbId) return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23e5e7eb"/><circle cx="20" cy="15" r="7" fill="%239ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="%239ca3af"/></svg>';
        let url = `${INBOX_WORKER_URL}/api/fb-avatar?id=${fbId}`;
        if (pageId) url += `&page=${pageId}`;
        if (token) url += `&token=${encodeURIComponent(token)}`;
        return url;
    }
}

// =====================================================
// GLOBAL INSTANCES
// =====================================================

const inboxTokenManager = new InboxTokenManager();
const inboxPancakeAPI = new InboxPancakeAPI(inboxTokenManager);

window.inboxTokenManager = inboxTokenManager;
window.inboxPancakeAPI = inboxPancakeAPI;
window.InboxApiConfig = InboxApiConfig;

// =====================================================
// BACKWARDS COMPATIBILITY SHIMS
// (For code ported from old commit using old method names)
// =====================================================

// --- InboxApiConfig shims ---
InboxApiConfig.smartFetch = async function(url, options) {
    return fetch(url, options);
};

InboxApiConfig.buildUrl.pancakeDirect = function(endpoint, pageId, jwtToken) {
    const base = `${INBOX_WORKER_URL}/api/pancake-direct/${endpoint}`;
    const params = [];
    if (pageId) params.push(`page_id=${pageId}`);
    if (jwtToken) {
        params.push(`jwt=${jwtToken}`);
        params.push(`access_token=${jwtToken}`);
    }
    return params.length ? `${base}?${params.join('&')}` : base;
};

// window.API_CONFIG alias for old code
window.API_CONFIG = InboxApiConfig;

// --- InboxTokenManager shims ---
InboxTokenManager.prototype.getTokenFromCookie = function() {
    return this._getCookieToken();
};

InboxTokenManager.prototype.saveTokenToFirebase = function(token) {
    return this.saveTokenToFirestore(token);
};

InboxTokenManager.prototype.clearToken = async function() {
    const accounts = this.getAllAccounts();
    for (const id of Object.keys(accounts)) {
        await this.deleteAccount(id);
    }
    this.currentToken = null;
    this.currentTokenExpiry = null;
    this.activeAccountId = null;
};

InboxTokenManager.prototype.debugToken = function(input) {
    try {
        const clean = (input || '').replace(/^jwt=/, '').trim();
        const decoded = this.decodeToken(clean);
        return { valid: !!decoded, decoded, clean };
    } catch (e) {
        return { valid: false, error: e.message };
    }
};

InboxTokenManager.prototype.savePageAccessTokensToStorage = function() {
    return this._savePageTokensLocal();
};

Object.defineProperty(InboxTokenManager.prototype, 'pageTokensRef', {
    get() { return this._pageTokensRef; }
});

InboxTokenManager.prototype.generatePageAccessTokenWithToken = function(pageId, accountToken) {
    return this.generatePageAccessToken(pageId, accountToken);
};

// --- InboxPancakeAPI shims ---
InboxPancakeAPI.prototype.initialize = async function() {
    await this.fetchPages();
};

InboxPancakeAPI.prototype.fetchMessagesForConversation = function(pageId, convId, currentCount, customerId) {
    return this.fetchMessages(pageId, convId, currentCount, customerId);
};

InboxPancakeAPI.prototype.markConversationAsRead = function(pageId, convId) {
    return this.markAsRead(pageId, convId);
};

InboxPancakeAPI.prototype.uploadImage = async function(channelId, blob) {
    const pat = await window.inboxTokenManager?.getOrGeneratePageAccessToken(channelId);
    return this.uploadMedia(channelId, blob, pat);
};

InboxPancakeAPI.prototype.addCustomerNote = async function(pageId, customerId, text) {
    try {
        const pat = await window.inboxTokenManager?.getOrGeneratePageAccessToken(pageId);
        if (!pat) return false;
        const url = InboxApiConfig.buildUrl.pancakeOfficial(
            `pages/${pageId}/customers/${customerId}/notes`, pat
        );
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text })
        });
        return res.ok;
    } catch (e) {
        console.error('[INBOX-API] addCustomerNote error:', e);
        return false;
    }
};

InboxPancakeAPI.prototype.fetchPagesWithUnreadCount = function() {
    return this.fetchPagesUnreadCount();
};

// Override comment actions to auto-fetch token if not provided
const _origLikeComment = InboxPancakeAPI.prototype.likeComment;
InboxPancakeAPI.prototype.likeComment = async function(pageId, commentId, pat) {
    if (!pat) pat = await this.tm.getOrGeneratePageAccessToken(pageId);
    return _origLikeComment.call(this, pageId, commentId, pat);
};
const _origUnlikeComment = InboxPancakeAPI.prototype.unlikeComment;
InboxPancakeAPI.prototype.unlikeComment = async function(pageId, commentId, pat) {
    if (!pat) pat = await this.tm.getOrGeneratePageAccessToken(pageId);
    return _origUnlikeComment.call(this, pageId, commentId, pat);
};
const _origHideComment = InboxPancakeAPI.prototype.hideComment;
InboxPancakeAPI.prototype.hideComment = async function(pageId, commentId, pat) {
    if (!pat) pat = await this.tm.getOrGeneratePageAccessToken(pageId);
    return _origHideComment.call(this, pageId, commentId, pat);
};
const _origUnhideComment = InboxPancakeAPI.prototype.unhideComment;
InboxPancakeAPI.prototype.unhideComment = async function(pageId, commentId, pat) {
    if (!pat) pat = await this.tm.getOrGeneratePageAccessToken(pageId);
    return _origUnhideComment.call(this, pageId, commentId, pat);
};
const _origDeleteComment = InboxPancakeAPI.prototype.deleteComment;
InboxPancakeAPI.prototype.deleteComment = async function(pageId, commentId, pat) {
    if (!pat) pat = await this.tm.getOrGeneratePageAccessToken(pageId);
    return _origDeleteComment.call(this, pageId, commentId, pat);
};

console.log('[INBOX-PANCAKE-API] Loaded (with compat shims)');
