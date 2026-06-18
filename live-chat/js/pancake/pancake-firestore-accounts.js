// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// PANCAKE FIRESTORE ACCOUNTS (Web 2.0 live-chat) — Firestore account persistence
// =====================================================
// Tách từ pancake-token-manager.js (2026-06-18, MOVE-only): load/get/save token
// accounts qua Firestore (accountsRef). Các hàm nhận instance manager (`mgr`)
// làm đối số TƯỜNG MINH và đọc/ghi state TRÊN instance đó — state vẫn nằm ở
// singleton (window.pancakeTokenManager), module này chỉ là logic. Class methods
// loadAccounts/getTokenFromFirestore/saveTokenToFirestore DELEGATE sang đây.
// codec/expiry delegate → window.PancakeTokenCodec.
// =====================================================

(function (window) {
    'use strict';

    const PancakeFirestoreAccounts = {
        /**
         * Load all accounts from Firestore (merge với cache localStorage).
         * @param {Object} mgr - PancakeTokenManager instance
         * @returns {Promise<boolean>}
         */
        async loadAccounts(mgr) {
            try {
                // Add timeout to prevent hanging
                const doc = await mgr.withTimeout(mgr.accountsRef.get(), 5000, 'loadAccounts');

                if (!doc) {
                    // Firestore slow/offline — localStorage already holds a usable copy
                    const hasLocal =
                        mgr.currentToken || Object.keys(mgr.pageAccessTokens).length > 0;
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
                const merged = { ...(mgr.accounts || {}) };
                for (const [id, fa] of Object.entries(fsAccounts)) {
                    const cur = merged[id];
                    if (!cur) {
                        merged[id] = fa;
                        continue;
                    }
                    const curExpired = mgr.isTokenExpired(cur.exp);
                    const faExpired = mgr.isTokenExpired(fa.exp);
                    if (curExpired && !faExpired) merged[id] = fa;
                    else if (!curExpired && faExpired) {
                        /* giữ cur (cache còn hạn) */
                    } else if ((Number(fa.savedAt) || 0) > (Number(cur.savedAt) || 0)) {
                        merged[id] = fa;
                    }
                }
                mgr.accounts = merged;

                // Load active account ID from localStorage (per-device)
                mgr.activeAccountId = localStorage.getItem('web2_pancake_active_account_id');

                // If active account is set, load its token
                if (mgr.activeAccountId && mgr.accounts[mgr.activeAccountId]) {
                    const account = mgr.accounts[mgr.activeAccountId];
                    mgr.currentToken = account.token;
                    mgr.currentTokenExpiry = account.exp;

                    // Sync to localStorage for fast access next time
                    mgr.saveTokenToLocalStorage(account.token, account.exp);
                } else if (Object.keys(mgr.accounts).length > 0) {
                    // Auto-select first account if no active account set
                    const firstAccountId = Object.keys(mgr.accounts)[0];
                    await mgr.setActiveAccount(firstAccountId);
                }

                console.log('[PANCAKE-TOKEN] Loaded accounts:', Object.keys(mgr.accounts).length);
                console.log('[PANCAKE-TOKEN] Active account (local):', mgr.activeAccountId);
                return true;
            } catch (error) {
                console.error('[PANCAKE-TOKEN] Error loading accounts:', error);
                return false;
            }
        },

        /**
         * Lấy token từ Firestore (active account).
         * @param {Object} mgr - PancakeTokenManager instance
         * @returns {Promise<string|null>}
         */
        async getTokenFromFirestore(mgr) {
            try {
                if (!mgr.accountsRef) {
                    console.warn('[PANCAKE-TOKEN] Firestore not initialized');
                    return null;
                }

                // Use local activeAccountId (from localStorage)
                if (!mgr.activeAccountId) {
                    console.log('[PANCAKE-TOKEN] No active account set (local)');
                    return null;
                }

                // Get from in-memory cache first (already loaded from Firestore)
                let data = mgr.accounts[mgr.activeAccountId];

                // If not in memory, fetch from Firestore
                if (!data) {
                    const doc = await mgr.accountsRef.get();
                    if (doc.exists) {
                        const allAccounts = doc.data()?.data || {};
                        data = allAccounts[mgr.activeAccountId];
                        // Update memory cache
                        mgr.accounts = allAccounts;
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
                const payload = mgr.decodeToken(token);
                if (!payload || mgr.isTokenExpired(payload.exp)) {
                    console.log('[PANCAKE-TOKEN] Token in active account is expired');
                    return null;
                }

                console.log('[PANCAKE-TOKEN] Valid token found in active account');
                mgr.currentToken = token;
                mgr.currentTokenExpiry = payload.exp;
                return token;
            } catch (error) {
                console.error('[PANCAKE-TOKEN] Error getting token from Firestore:', error);
                return null;
            }
        },

        /**
         * Lưu token vào Firestore (as new account or update existing).
         * @param {Object} mgr - PancakeTokenManager instance
         * @param {string} token - JWT token (cleaned)
         * @param {string} accountId - Optional account ID, auto-generated if not provided
         * @returns {Promise<string>} - Returns account ID
         */
        async saveTokenToFirestore(mgr, token, accountId = null) {
            try {
                // Clean token - remove jwt= prefix if exists
                let cleanedToken = token.trim();
                if (cleanedToken.startsWith('jwt=')) {
                    cleanedToken = cleanedToken.substring(4).trim();
                }

                const payload = mgr.decodeToken(cleanedToken);
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
                mgr.accounts[accountId] = data;
                mgr.activeAccountId = accountId;
                mgr.currentToken = cleanedToken;
                mgr.currentTokenExpiry = payload.exp;

                // Save to localStorage (fast, synchronous) - PRIMARY STORAGE
                localStorage.setItem('web2_pancake_active_account_id', accountId);
                mgr.saveTokenToLocalStorage(cleanedToken, payload.exp);

                // Save to Firestore (async, backup)
                if (mgr.accountsRef) {
                    await mgr.accountsRef.set(
                        {
                            data: { [accountId]: data },
                        },
                        { merge: true }
                    );
                    console.log(
                        '[PANCAKE-TOKEN] ✅ Token saved to Firestore as account:',
                        accountId
                    );
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
        },
    };

    window.PancakeFirestoreAccounts = PancakeFirestoreAccounts;
})(window);
