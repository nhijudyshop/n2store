/**
 * Chat Page Authentication Initialization
 * Khởi tạo authManager instance từ shared AuthManager class
 */

// Declare authManager as global variable (for navigation-modern.js)
var authManager;

// Wait for AuthManager class to be loaded (from shared-auth-manager.js)
(function() {
    function initializeAuth() {
        if (typeof window.AuthManager === 'undefined') {
            console.log('[Chat Auth] Waiting for AuthManager class...');
            setTimeout(initializeAuth, 50);
            return;
        }

        // Initialize authManager instance if not already exists
        if (!authManager) {
            authManager = new window.AuthManager({
                storageKey: 'loginindex_auth',
                redirectUrl: '../index.html',
                sessionDuration: 8 * 60 * 60 * 1000, // 8 hours
                rememberDuration: 30 * 24 * 60 * 60 * 1000, // 30 days
                requiredPermissions: ['chat']
            });

            // Also export to window for other scripts
            window.authManager = authManager;

            console.log('[Chat Auth] authManager initialized:', authManager.isAuthenticated());

            // Check if user is authenticated
            if (!authManager.isAuthenticated()) {
                console.warn('[Chat Auth] User not authenticated, redirecting to login...');
                // Clear ALL storage before redirecting
                sessionStorage.clear();
                localStorage.clear();
                setTimeout(() => {
                    if (!authManager.isAuthenticated()) {
                        window.location.href = '../index.html';
                    }
                }, 500);
            } else {
                const authData = authManager.getAuthData();
                console.log('[Chat Auth] User authenticated:', authData?.username || authData?.userType);
            }
        }
    }

    // Start initialization immediately
    initializeAuth();
})();
