// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// PANCAKE TOKEN SOURCES (Web 2.0 live-chat) — token retrieval helpers
// =====================================================
// Tách từ pancake-token-manager.js (2026-06-18, MOVE-only): đọc token từ cookie
// Pancake.vn + lấy page access tokens từ Web2Chat. Các hàm nhận đối số tường
// minh, trả về giá trị, KHÔNG dùng `this`. PancakeTokenManager orchestrate (giữ
// instance state) và gọi sang module này.
// =====================================================

(function (window) {
    'use strict';

    const PancakeTokenSources = {
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
        },

        /**
         * Lấy page access tokens từ Web2Chat (nếu có) — KHÔNG đụng instance state.
         * @returns {Object|null} - { pageId: {...}, ... } hoặc null khi không có
         */
        getWeb2ChatPageAccessTokens() {
            return typeof window.Web2Chat?.getAllPageAccessTokens === 'function'
                ? window.Web2Chat.getAllPageAccessTokens()
                : null;
        },
    };

    window.PancakeTokenSources = PancakeTokenSources;
})(window);
