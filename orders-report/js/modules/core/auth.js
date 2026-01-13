/**
 * Authentication System - ES Module
 * Manages user authentication and session
 */

// =====================================================
// AUTH MANAGER CLASS
// =====================================================

export class AuthManager {
    constructor(options = {}) {
        this.currentUser = null;
        this.storageKey = options.storageKey || 'loginindex_auth';
        this.sessionTimeout = options.sessionTimeout || 8 * 60 * 60 * 1000; // 8 hours
        this.rememberTimeout = options.rememberTimeout || 30 * 24 * 60 * 60 * 1000; // 30 days
        this.redirectUrl = options.redirectUrl || '../index.html';
        this.autoRedirect = options.autoRedirect !== false;
    }

    /**
     * Initialize auth manager, check for existing session
     */
    init() {
        try {
            // Check sessionStorage first (for session-only login)
            let authData = sessionStorage.getItem(this.storageKey);
            let isFromSession = true;

            // If not in sessionStorage, check localStorage (for remembered login)
            if (!authData) {
                authData = localStorage.getItem(this.storageKey);
                isFromSession = false;
            }

            if (authData) {
                const auth = JSON.parse(authData);
                if (this.isValidSession(auth, isFromSession)) {
                    this.currentUser = auth;
                    console.log('[AUTH] Session restored from', isFromSession ? 'sessionStorage' : 'localStorage');
                    return true;
                } else {
                    console.log('[AUTH] Session expired, clearing data');
                    this.clearAuth();
                }
            }
        } catch (error) {
            console.error('[AUTH] Error reading auth:', error);
            this.clearAuth();
        }
        return false;
    }

    /**
     * Check if session is valid
     */
    isValidSession(auth, isFromSession = false) {
        if (!auth.isLoggedIn || !auth.userType || auth.checkLogin === undefined) {
            return false;
        }

        const timeout = isFromSession ? this.sessionTimeout : this.rememberTimeout;

        // Check if session has expired
        if (auth.timestamp && Date.now() - auth.timestamp > timeout) {
            return false;
        }

        // Check explicit expiry if exists
        if (auth.expiresAt && Date.now() > auth.expiresAt) {
            return false;
        }

        return true;
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        const auth = this.getAuthState();
        return auth && auth.isLoggedIn === 'true';
    }

    /**
     * Check if user has required permission level
     */
    hasPermission(requiredLevel) {
        const auth = this.getAuthState();
        if (!auth) return false;
        return parseInt(auth.checkLogin) <= requiredLevel;
    }

    /**
     * Get current auth state
     */
    getAuthState() {
        try {
            let stored = sessionStorage.getItem(this.storageKey);
            if (!stored) {
                stored = localStorage.getItem(this.storageKey);
            }
            if (stored) {
                this.currentUser = JSON.parse(stored);
                return this.currentUser;
            }
        } catch (error) {
            console.error('[AUTH] Error reading auth:', error);
        }
        return null;
    }

    /**
     * Get user info
     */
    getUserInfo() {
        return this.getAuthState();
    }

    /**
     * Get user ID for chat system
     */
    getUserId() {
        const auth = this.getAuthState();
        return auth ? auth.userId : null;
    }

    /**
     * Get user name
     */
    getUserName() {
        const auth = this.getAuthState();
        return auth?.userType ? auth.userType.split('-')[0] : 'Admin';
    }

    /**
     * Set auth state
     */
    setAuthState(isLoggedIn, userType, checkLogin, remember = false) {
        const authState = {
            isLoggedIn: String(isLoggedIn),
            userType,
            checkLogin,
            timestamp: Date.now(),
        };

        try {
            const storage = remember ? localStorage : sessionStorage;
            storage.setItem(this.storageKey, JSON.stringify(authState));
            this.currentUser = authState;
        } catch (error) {
            console.error('[AUTH] Error saving auth state:', error);
        }
    }

    /**
     * Clear auth data
     */
    clearAuth() {
        this.currentUser = null;
        sessionStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.storageKey);
        console.log('[AUTH] Cleared auth data');
    }

    /**
     * Logout user
     */
    logout(skipConfirm = false) {
        if (skipConfirm || confirm('Bạn có chắc muốn đăng xuất?')) {
            this.clearAuth();
            if (this.autoRedirect) {
                window.location.href = this.redirectUrl;
            }
            return true;
        }
        return false;
    }

    /**
     * Require authentication, redirect if not authenticated
     */
    requireAuth() {
        if (!this.isAuthenticated()) {
            console.warn('[AUTH] User not authenticated, redirecting...');
            this.clearAuth();
            if (this.autoRedirect) {
                setTimeout(() => {
                    if (!this.isAuthenticated()) {
                        window.location.href = this.redirectUrl;
                    }
                }, 500);
            }
            return false;
        }
        return true;
    }
}

// =====================================================
// SINGLETON INSTANCE
// =====================================================

export const authManager = new AuthManager();

// Initialize on load
authManager.init();

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
    return authManager.getAuthState();
}

export function getUserName() {
    return authManager.getUserName();
}

export function getUserId() {
    return authManager.getUserId();
}

export function logout(skipConfirm = false) {
    return authManager.logout(skipConfirm);
}

export function requireAuth() {
    return authManager.requireAuth();
}

console.log('[AUTH] ES Module loaded');

export default authManager;
