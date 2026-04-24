// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * LiveSale Token — thin wrapper around the N2Store auth token.
 * Replaces TPOS bearer-token management. All /api/v2/live-sale/* calls use
 * the N2Store JWT from AuthManager; there is no TPOS OAuth in this path.
 */

const LiveSaleTokenManager = {
    /**
     * Return current N2Store JWT (string) or empty string.
     */
    getToken() {
        if (window.authManager && typeof window.authManager.getToken === 'function') {
            return window.authManager.getToken() || '';
        }
        // Fallbacks that may exist in this codebase
        try {
            return (
                localStorage.getItem('n2_auth_token') || localStorage.getItem('auth_token') || ''
            );
        } catch {
            return '';
        }
    },

    /**
     * Build an Authorization header value.
     */
    getAuthHeader() {
        const t = this.getToken();
        return t ? `Bearer ${t}` : '';
    },

    /**
     * Best-effort username from auth manager.
     */
    getUsername() {
        try {
            if (window.authManager?.currentUser?.username) {
                return window.authManager.currentUser.username;
            }
            if (window.authManager?.getUsername) {
                return window.authManager.getUsername() || '';
            }
        } catch {
            /* noop */
        }
        return 'web';
    },
};

if (typeof window !== 'undefined') {
    window.LiveSaleTokenManager = LiveSaleTokenManager;
}
