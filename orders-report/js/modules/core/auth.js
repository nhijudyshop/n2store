/**
 * Authentication System - ES Module
 * Re-exports from shared library with local convenience functions
 *
 * SOURCE OF TRUTH: /shared/browser/auth-manager.js
 */

// Import from shared library
import { AuthManager } from '../../../../shared/browser/auth-manager.js';

// =====================================================
// SINGLETON INSTANCE
// =====================================================

export const authManager = new AuthManager({
    storageKey: 'loginindex_auth',
    redirectUrl: '../index.html',
    sessionDuration: 8 * 60 * 60 * 1000,  // 8 hours
    rememberDuration: 30 * 24 * 60 * 60 * 1000  // 30 days
});

// =====================================================
// CONVENIENCE FUNCTIONS
// =====================================================

export function isAuthenticated() {
    return authManager.isAuthenticated();
}

export function hasPermission(requiredLevel) {
    return authManager.hasPermission(requiredLevel);
}

export function getAuthState() {
    return authManager.getAuthData();
}

export function getUserName() {
    const auth = authManager.getAuthData();
    return auth?.userType ? auth.userType.split('-')[0] : 'Admin';
}

export function getUserId() {
    const auth = authManager.getAuthData();
    return auth?.userId || null;
}

export function logout(skipConfirm = false) {
    if (skipConfirm || confirm('Bạn có chắc muốn đăng xuất?')) {
        authManager.logout('User logged out');
        return true;
    }
    return false;
}

export function requireAuth() {
    return authManager.requireAuth();
}

// Re-export AuthManager class
export { AuthManager };

console.log('[AUTH] ES Module loaded (using shared AuthManager)');

export default authManager;
