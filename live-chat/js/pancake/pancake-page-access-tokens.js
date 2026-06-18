// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// PANCAKE PAGE ACCESS TOKENS (Web 2.0 live-chat) — Official API (pages.fm) helper
// =====================================================
// Tách từ pancake-token-manager.js (2026-06-18, MOVE-only): build entry (decode
// timestamp từ page_access_token) + generate page_access_token qua Pancake API.
// Các hàm nhận đối số tường minh (pageId, token, jwtToken), KHÔNG dùng instance
// state. PancakeTokenManager giữ orchestration (cache, Firestore persistence) và
// gọi sang module này. base64url decode delegate → window.PancakeTokenCodec.
// =====================================================

(function (window) {
    'use strict';

    const PancakePageAccessTokens = {
        /**
         * Build a page_access_token cache entry (decode timestamp from token).
         * @param {string} pageId - Page ID
         * @param {string} token - Page access token
         * @param {string} pageName - Optional page name
         * @returns {Object} - { token, pageId, pageName, timestamp, savedAt }
         */
        buildEntry(pageId, token, pageName = '') {
            // Decode to get timestamp
            let timestamp = null;
            try {
                const parts = token.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(window.PancakeTokenCodec.base64UrlDecode(parts[1]));
                    timestamp = payload.timestamp;
                }
            } catch (e) {
                console.warn('[PANCAKE-TOKEN] Could not decode page_access_token:', e);
            }

            return {
                token: token,
                pageId: pageId,
                pageName: pageName,
                timestamp: timestamp,
                savedAt: Date.now(),
            };
        },

        /**
         * Generate new page_access_token via Pancake API (worker proxy).
         * @param {string} pageId - Page ID
         * @param {string} jwtToken - Current Pancake JWT (currentToken)
         * @returns {Promise<string|null>} - New token or null
         */
        async generate(pageId, jwtToken) {
            console.log('[PANCAKE-TOKEN] ========================================');
            console.log('[PANCAKE-TOKEN] Generating page_access_token for page:', pageId);

            // Use worker proxy to avoid CORS
            // API: POST https://pages.fm/api/v1/pages/{page_id}/generate_page_access_token?access_token=xxx
            const url = window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/generate_page_access_token`,
                `access_token=${jwtToken}`
            );

            // KHÔNG log url thô — chứa full JWT trong query access_token
            console.log(
                '[PANCAKE-TOKEN] API URL:',
                url.replace(/access_token=[^&]+/, 'access_token=***')
            );

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
            });

            const result = await response.json();
            // KHÔNG log result thô — chứa full page_access_token
            console.log('[PANCAKE-TOKEN] API Response success:', result.success);

            if (result.success && result.page_access_token) {
                console.log('[PANCAKE-TOKEN] ✅ page_access_token generated for page:', pageId);
                console.log('[PANCAKE-TOKEN] ========================================');
                return result.page_access_token;
            } else {
                throw new Error(result.message || 'Failed to generate token');
            }
        },

        /**
         * Load page access tokens from Firestore (merge với cache localStorage).
         * Operates on the passed manager instance (state stays in singleton).
         * @param {Object} mgr - PancakeTokenManager instance
         * @returns {Promise<void>}
         */
        async load(mgr) {
            try {
                if (!mgr.pageTokensRef) {
                    console.warn('[PANCAKE-TOKEN] pageTokensRef not initialized');
                    return;
                }

                // Add timeout to prevent hanging
                const doc = await mgr.withTimeout(
                    mgr.pageTokensRef.get(),
                    5000,
                    'loadPageAccessTokens'
                );

                if (!doc) {
                    // Firestore slow/offline — localStorage already holds a usable copy
                    const hasLocal = Object.keys(mgr.pageAccessTokens).length > 0;
                    if (hasLocal) {
                        console.info(
                            '[PANCAKE-TOKEN] loadPageAccessTokens: using localStorage (Firestore slow)'
                        );
                    } else {
                        console.warn(
                            '[PANCAKE-TOKEN] loadPageAccessTokens timed out, no local data'
                        );
                    }
                    return;
                }

                const firestoreTokens = doc.exists ? doc.data()?.data || {} : {};

                // Merge Firestore tokens with existing localStorage tokens
                // Firestore takes priority (more up-to-date)
                mgr.pageAccessTokens = {
                    ...mgr.pageAccessTokens, // localStorage tokens (already loaded)
                    ...firestoreTokens, // Firestore tokens (override)
                };

                // Sync merged tokens back to localStorage
                mgr.savePageAccessTokensToLocalStorage();

                console.log(
                    '[PANCAKE-TOKEN] Loaded page_access_tokens:',
                    Object.keys(mgr.pageAccessTokens).length
                );
            } catch (error) {
                console.error('[PANCAKE-TOKEN] Error loading page access tokens:', error);
            }
        },
    };

    window.PancakePageAccessTokens = PancakePageAccessTokens;
})(window);
