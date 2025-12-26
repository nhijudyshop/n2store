// =====================================================
// AUTHENTICATION SYSTEM - INVENTORY TRACKING
// =====================================================

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        try {
            // Check sessionStorage first (for session-only login)
            let authData = sessionStorage.getItem('loginindex_auth');
            let isFromSession = true;

            // If not in sessionStorage, check localStorage (for remembered login)
            if (!authData) {
                authData = localStorage.getItem('loginindex_auth');
                isFromSession = false;
            }

            if (authData) {
                const auth = JSON.parse(authData);
                if (this.isValidSession(auth, isFromSession)) {
                    this.currentUser = auth;
                    console.log('[AUTH] Valid session restored from', isFromSession ? 'sessionStorage' : 'localStorage');
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

    isValidSession(auth, isFromSession = false) {
        if (!auth.isLoggedIn || !auth.userType || auth.checkLogin === undefined) {
            return false;
        }

        // Define session timeout based on source
        const SESSION_TIMEOUT = isFromSession
            ? 8 * 60 * 60 * 1000  // 8 hours for session storage
            : 30 * 24 * 60 * 60 * 1000; // 30 days for remembered login

        // Check if session has expired
        if (auth.timestamp && Date.now() - auth.timestamp > SESSION_TIMEOUT) {
            console.log('[AUTH] Session expired');
            return false;
        }

        // Check explicit expiry if exists
        if (auth.expiresAt && Date.now() > auth.expiresAt) {
            console.log('[AUTH] Session expired (explicit expiry)');
            return false;
        }

        return true;
    }

    isAuthenticated() {
        const auth = this.getAuthState();
        return auth && auth.isLoggedIn === 'true';
    }

    isAdmin() {
        const auth = this.getAuthState();
        if (!auth) return false;
        return parseInt(auth.checkLogin) === 0;
    }

    hasPermission(requiredLevel) {
        const auth = this.getAuthState();
        if (!auth) return false;
        return parseInt(auth.checkLogin) <= requiredLevel;
    }

    getAuthState() {
        try {
            let stored = sessionStorage.getItem('loginindex_auth');
            if (!stored) {
                stored = localStorage.getItem('loginindex_auth');
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

    getUserInfo() {
        return this.getAuthState();
    }

    getUserName() {
        const auth = this.getAuthState();
        if (auth && auth.userType) {
            return auth.userType.split('-')[0];
        }
        return 'User';
    }

    clearAuth() {
        this.currentUser = null;
        sessionStorage.removeItem('loginindex_auth');
        localStorage.removeItem('loginindex_auth');
        localStorage.removeItem('remember_login_preference');
    }

    logout() {
        if (confirm('Ban co chac muon dang xuat?')) {
            this.clearAuth();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '../index.html';
        }
    }
}

// =====================================================
// INITIALIZE AUTHMANAGER
// =====================================================

const authManager = new AuthManager();
window.authManager = authManager;

console.log('[AUTH] AuthManager initialized:', authManager.isAuthenticated());

// Redirect to login if not authenticated
if (!authManager.isAuthenticated()) {
    console.warn('[AUTH] User not authenticated, redirecting to login...');
    setTimeout(() => {
        if (!authManager.isAuthenticated()) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '../index.html';
        }
    }, 500);
}

// =====================================================
// LEGACY FUNCTIONS (for backward compatibility)
// =====================================================

function getAuthState() {
    return authManager ? authManager.getAuthState() : null;
}

function isAuthenticated() {
    return authManager ? authManager.isAuthenticated() : false;
}

function isAdmin() {
    return authManager ? authManager.isAdmin() : false;
}

function hasPermission(requiredLevel) {
    return authManager ? authManager.hasPermission(requiredLevel) : false;
}

function getUserName() {
    return authManager ? authManager.getUserName() : 'User';
}

function handleLogout() {
    if (authManager) {
        authManager.logout();
    }
}

console.log('[AUTH] Authentication system loaded');
