/**
 * Chat Page Authentication Initialization
 * Khởi tạo authManager instance từ shared AuthManager class
 */

(function() {
    'use strict';

    // Wait for AuthManager class to be loaded (from shared-auth-manager.js)
    function initializeAuth() {
        if (typeof window.AuthManager === 'undefined') {
            console.log('[Chat Auth] Waiting for AuthManager class...');
            setTimeout(initializeAuth, 100);
            return;
        }

        // Initialize authManager instance if not already exists
        if (!window.authManager) {
            const authManager = new window.AuthManager({
                storageKey: 'loginindex_auth',
                redirectUrl: '../index.html',
                sessionDuration: 8 * 60 * 60 * 1000, // 8 hours
                rememberDuration: 30 * 24 * 60 * 60 * 1000, // 30 days
                requiredPermissions: ['chat']
            });

            // Export to window for navigation-modern.js and other scripts
            window.authManager = authManager;

            console.log('[Chat Auth] authManager initialized');

            // Check if user is authenticated
            if (!authManager.isAuthenticated()) {
                console.warn('[Chat Auth] User not authenticated, redirecting to login...');
                setTimeout(() => {
                    if (!authManager.isAuthenticated()) {
                        window.location.href = '../index.html';
                    }
                }, 500);
            } else {
                console.log('[Chat Auth] User authenticated:', authManager.getAuthData()?.username);
            }
        }
    }

    // Start initialization
    initializeAuth();
})();
