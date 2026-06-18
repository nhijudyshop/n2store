// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// PANCAKE TOKEN STORAGE (Web 2.0 live-chat) — localStorage persistence helpers
// =====================================================
// Tách từ pancake-token-manager.js (2026-06-18, MOVE-only): JWT token +
// page_access_tokens persistence trong localStorage. Các hàm nhận đối số tường
// minh (keys object), trả về giá trị, KHÔNG dùng `this`. Expiry check delegate
// sang window.PancakeTokenCodec.isTokenExpired (load TRƯỚC module này).
// =====================================================

(function (window) {
    'use strict';

    const PancakeTokenStorage = {
        /**
         * Save JWT token to localStorage for fast access
         * @param {Object} keys - LOCAL_STORAGE_KEYS map
         * @param {string} token - JWT token
         * @param {number} expiry - Token expiry timestamp (seconds)
         */
        saveToken(keys, token, expiry) {
            try {
                localStorage.setItem(keys.JWT_TOKEN, token);
                localStorage.setItem(keys.JWT_TOKEN_EXPIRY, expiry.toString());
                console.log('[PANCAKE-TOKEN] ✅ JWT token saved to localStorage');
            } catch (error) {
                console.error('[PANCAKE-TOKEN] Error saving token to localStorage:', error);
            }
        },

        /**
         * Get JWT token from localStorage
         * @param {Object} keys - LOCAL_STORAGE_KEYS map
         * @returns {Object|null} { token, expiry } or null
         */
        getToken(keys) {
            try {
                const token = localStorage.getItem(keys.JWT_TOKEN);
                const expiry = localStorage.getItem(keys.JWT_TOKEN_EXPIRY);

                if (!token || !expiry) {
                    return null;
                }

                const exp = parseInt(expiry, 10);
                if (window.PancakeTokenCodec.isTokenExpired(exp)) {
                    console.log('[PANCAKE-TOKEN] localStorage token is expired, clearing...');
                    this.clearToken(keys);
                    return null;
                }

                console.log('[PANCAKE-TOKEN] ✅ Valid JWT token found in localStorage');
                return { token, expiry: exp };
            } catch (error) {
                console.error('[PANCAKE-TOKEN] Error getting token from localStorage:', error);
                return null;
            }
        },

        /**
         * Clear JWT token from localStorage
         * @param {Object} keys - LOCAL_STORAGE_KEYS map
         */
        clearToken(keys) {
            try {
                localStorage.removeItem(keys.JWT_TOKEN);
                localStorage.removeItem(keys.JWT_TOKEN_EXPIRY);
                console.log('[PANCAKE-TOKEN] JWT token cleared from localStorage');
            } catch (error) {
                console.error('[PANCAKE-TOKEN] Error clearing token from localStorage:', error);
            }
        },

        /**
         * Save page_access_tokens to localStorage
         * @param {Object} keys - LOCAL_STORAGE_KEYS map
         * @param {Object} tokens - { pageId: { token, pageId, pageName, timestamp, savedAt }, ... }
         */
        savePageAccessTokens(keys, tokens) {
            try {
                const data = tokens || {};
                localStorage.setItem(keys.PAGE_ACCESS_TOKENS, JSON.stringify(data));
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
        },

        /**
         * Get page_access_tokens from localStorage
         * @param {Object} keys - LOCAL_STORAGE_KEYS map
         * @returns {Object} - { pageId: { token, ... }, ... }
         */
        getPageAccessTokens(keys) {
            try {
                const data = localStorage.getItem(keys.PAGE_ACCESS_TOKENS);
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
        },

        /**
         * Clear page_access_tokens from localStorage
         * @param {Object} keys - LOCAL_STORAGE_KEYS map
         */
        clearPageAccessTokens(keys) {
            try {
                localStorage.removeItem(keys.PAGE_ACCESS_TOKENS);
                console.log('[PANCAKE-TOKEN] Page access tokens cleared from localStorage');
            } catch (error) {
                console.error(
                    '[PANCAKE-TOKEN] Error clearing page access tokens from localStorage:',
                    error
                );
            }
        },
    };

    window.PancakeTokenStorage = PancakeTokenStorage;
})(window);
