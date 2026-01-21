/**
 * SHARED AUTHENTICATION MANAGER
 * SOURCE OF TRUTH - All auth logic in one place
 *
 * @module shared/browser/auth-manager
 * @description Centralized authentication manager for browser environments
 */

// =====================================================
// CONFIGURATION
// =====================================================

export const AUTH_CONFIG = {
    STORAGE_KEY: 'loginindex_auth',
    REDIRECT_URL: '/index.html',
    SESSION_DURATION: 8 * 60 * 60 * 1000,     // 8 hours
    REMEMBER_DURATION: 30 * 24 * 60 * 60 * 1000, // 30 days
    PERMISSION_LEVELS: {
        ADMIN: 0,
        MANAGER: 1,
        STAFF: 2,
        BASIC: 3,
        GUEST: 777
    }
};

// =====================================================
// AUTH MANAGER CLASS
// =====================================================

export class AuthManager {
    constructor(options = {}) {
        this.storageKey = options.storageKey || AUTH_CONFIG.STORAGE_KEY;
        this.redirectUrl = options.redirectUrl || AUTH_CONFIG.REDIRECT_URL;
        this.sessionDuration = options.sessionDuration || AUTH_CONFIG.SESSION_DURATION;
        this.rememberDuration = options.rememberDuration || AUTH_CONFIG.REMEMBER_DURATION;
        this.requiredPermissions = options.requiredPermissions || [];

        // Logger fallback
        this.logger = options.logger || console;
    }

    // =====================================================
    // AUTHENTICATION STATUS
    // =====================================================

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        const authData = this.getAuthData();
        if (!authData) return false;

        if (this.isSessionExpired(authData)) {
            this.logout('Session expired');
            return false;
        }

        return authData.isLoggedIn === 'true' || authData.isLoggedIn === true;
    }

    /**
     * Check if session is expired
     * @param {Object} authData
     * @returns {boolean}
     */
    isSessionExpired(authData) {
        if (!authData.expiresAt) {
            const duration = authData.isRemembered ? this.rememberDuration : this.sessionDuration;
            return Date.now() - (authData.timestamp || 0) > duration;
        }
        return Date.now() > authData.expiresAt;
    }

    // =====================================================
    // STORAGE OPERATIONS
    // =====================================================

    /**
     * Get auth data from storage
     * @returns {Object|null}
     */
    getAuthData() {
        try {
            // Try sessionStorage first (session-only login)
            let authDataStr = sessionStorage.getItem(this.storageKey);
            let storage = 'session';

            // If not in session, try localStorage (remember me)
            if (!authDataStr) {
                authDataStr = localStorage.getItem(this.storageKey);
                storage = 'local';
            }

            if (!authDataStr) return null;

            const authData = JSON.parse(authDataStr);
            authData._storage = storage;
            return authData;
        } catch (error) {
            this.logger.error('[AuthManager] Error reading auth data:', error);
            return null;
        }
    }

    /**
     * Alias for getAuthData (backward compatibility)
     * @returns {Object|null}
     */
    getAuthState() {
        return this.getAuthData();
    }

    /**
     * Save auth data to storage
     * @param {Object} authData
     * @param {boolean} rememberMe
     */
    saveAuthData(authData, rememberMe = false) {
        try {
            const dataToSave = {
                ...authData,
                timestamp: Date.now(),
                expiresAt: Date.now() + (rememberMe ? this.rememberDuration : this.sessionDuration),
                isRemembered: rememberMe
            };

            const authDataStr = JSON.stringify(dataToSave);

            if (rememberMe) {
                localStorage.setItem(this.storageKey, authDataStr);
            } else {
                sessionStorage.setItem(this.storageKey, authDataStr);
            }

            this.logger.log('[AuthManager] Auth data saved to', rememberMe ? 'localStorage' : 'sessionStorage');
        } catch (error) {
            this.logger.error('[AuthManager] Error saving auth data:', error);
        }
    }

    /**
     * Clear auth data and logout
     * @param {string} reason
     */
    logout(reason = '') {
        if (reason) {
            this.logger.log('[AuthManager] Logging out:', reason);
        }

        sessionStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.storageKey);

        if (typeof window !== 'undefined') {
            window.location.href = this.redirectUrl;
        }
    }

    // =====================================================
    // USER INFORMATION
    // =====================================================

    /**
     * Get user info
     * @returns {Object|null}
     */
    getUserInfo() {
        const authData = this.getAuthData();
        if (!authData) return null;

        return {
            username: authData.username,
            displayName: authData.displayName,
            checkLogin: authData.checkLogin,
            uid: authData.uid,
            userType: authData.userType,
            pagePermissions: authData.pagePermissions || [],
            roleTemplate: authData.roleTemplate
        };
    }

    /**
     * Get permission level
     * @returns {number}
     */
    getPermissionLevel() {
        const authData = this.getAuthData();
        if (!authData) return AUTH_CONFIG.PERMISSION_LEVELS.GUEST;
        return parseInt(authData.checkLogin) || AUTH_CONFIG.PERMISSION_LEVELS.GUEST;
    }

    /**
     * Get role information based on checkLogin level
     * @returns {Object}
     */
    getRoleInfo() {
        const level = this.getPermissionLevel();
        const roles = {
            0: { name: 'Admin', icon: '👑', color: '#ff6b6b' },
            1: { name: 'Quản lý', icon: '⭐', color: '#4ecdc4' },
            2: { name: 'Nhân viên', icon: '👤', color: '#45b7d1' },
            3: { name: 'Cơ bản', icon: '📝', color: '#96ceb4' },
            777: { name: 'Khách', icon: '👥', color: '#95a5a6' }
        };
        return roles[level] || roles[777];
    }

    // =====================================================
    // PERMISSION CHECKS
    // =====================================================

    /**
     * Check if user has permission for current page
     * ALL users check detailedPermissions - NO bypass
     * @param {string} pageName
     * @returns {boolean}
     */
    hasPagePermission(pageName) {
        const authData = this.getAuthData();
        if (!authData) return false;

        if (authData.detailedPermissions && authData.detailedPermissions[pageName]) {
            const pagePerms = authData.detailedPermissions[pageName];
            return Object.values(pagePerms).some(v => v === true);
        }

        return false;
    }

    /**
     * Check if user has specific detailed permission
     * @param {string} pageId
     * @param {string} action
     * @returns {boolean}
     */
    hasDetailedPermission(pageId, action) {
        const authData = this.getAuthData();
        if (!authData?.detailedPermissions?.[pageId]) return false;
        return authData.detailedPermissions[pageId][action] === true;
    }

    /**
     * Check permission level (LEGACY)
     * @deprecated Use hasDetailedPermission() instead - will be removed in future version
     * @param {number} requiredLevel
     * @returns {boolean}
     */
    hasPermissionLevel(requiredLevel) {
        // Deprecation warning - log once per session
        if (!this._permissionLevelWarned) {
            console.warn('[AuthManager] DEPRECATED: hasPermissionLevel() sẽ bị xóa. Dùng hasDetailedPermission(pageId, action) thay thế.');
            this._permissionLevelWarned = true;
        }
        const userLevel = this.getPermissionLevel();
        return userLevel <= requiredLevel;
    }

    /**
     * @deprecated Use hasPermissionLevel() instead
     */
    hasPermission(requiredLevel) {
        return this.hasPermissionLevel(requiredLevel);
    }

    /**
     * Check if user has admin template (for UI display only)
     * @returns {boolean}
     */
    isAdminTemplate() {
        const authData = this.getAuthData();
        return authData?.roleTemplate === 'admin';
    }

    /**
     * @deprecated Use isAdminTemplate() instead
     */
    isAdmin() {
        return this.isAdminTemplate();
    }

    // =====================================================
    // AUTH GUARDS
    // =====================================================

    /**
     * Verify authentication and redirect if not authenticated
     * @returns {boolean}
     */
    requireAuth() {
        if (!this.isAuthenticated()) {
            this.logger.log('[AuthManager] Not authenticated, redirecting...');
            this.logout('Authentication required');
            return false;
        }
        return true;
    }

    /**
     * Verify page permission and redirect if not authorized
     * @param {string} pageName
     * @returns {boolean}
     */
    requirePagePermission(pageName) {
        if (!this.requireAuth()) return false;

        if (!this.hasPagePermission(pageName)) {
            this.logger.warn('[AuthManager] Access denied to page:', pageName);
            alert('Bạn không có quyền truy cập trang này');
            window.location.href = '/live/index.html';
            return false;
        }

        return true;
    }

    // =====================================================
    // SESSION MANAGEMENT
    // =====================================================

    /**
     * Extend session (refresh expiry time)
     */
    extendSession() {
        const authData = this.getAuthData();
        if (!authData) return;

        const isRemembered = authData.isRemembered || authData._storage === 'local';
        this.saveAuthData(authData, isRemembered);
        this.logger.log('[AuthManager] Session extended');
    }

    /**
     * Get session info
     * @returns {Object}
     */
    getSessionInfo() {
        const authData = this.getAuthData();
        if (!authData) {
            return {
                authenticated: false,
                expiresIn: 0,
                storage: null
            };
        }

        const now = Date.now();
        const expiresIn = authData.expiresAt ? authData.expiresAt - now : 0;

        return {
            authenticated: true,
            expiresIn: Math.max(0, expiresIn),
            expiresInMinutes: Math.floor(expiresIn / 60000),
            storage: authData._storage,
            isRemembered: authData.isRemembered || false,
            user: this.getUserInfo()
        };
    }
}

// =====================================================
// FACTORY & SINGLETON
// =====================================================

/**
 * Create new AuthManager instance
 * @param {Object} options
 * @returns {AuthManager}
 */
export function createAuthManager(options = {}) {
    return new AuthManager(options);
}

// Default singleton instance
let defaultInstance = null;

/**
 * Get or create default AuthManager instance
 * @param {Object} options
 * @returns {AuthManager}
 */
export function getAuthManager(options = {}) {
    if (!defaultInstance) {
        defaultInstance = new AuthManager(options);
    }
    return defaultInstance;
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Quick check if user is authenticated
 * @returns {boolean}
 */
export function isAuthenticated() {
    return getAuthManager().isAuthenticated();
}

/**
 * Get role info by checkLogin level
 * @param {number} checkLogin
 * @returns {Object}
 */
export function getRoleInfo(checkLogin) {
    const roleMap = {
        0: { icon: '👑', text: 'Admin', name: 'Admin' },
        1: { icon: '👤', text: 'User', name: 'Quản lý' },
        2: { icon: '🔒', text: 'Limited', name: 'Nhân viên' },
        3: { icon: '💡', text: 'Basic', name: 'Cơ bản' },
        777: { icon: '👥', text: 'Guest', name: 'Khách' }
    };
    return roleMap[checkLogin] || { icon: '❓', text: 'Unknown', name: 'Unknown' };
}

console.log('[AUTH-MANAGER] Module loaded');

export default AuthManager;
