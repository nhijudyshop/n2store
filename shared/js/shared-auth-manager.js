/**
 * SHARED AUTHENTICATION MANAGER
 * File: shared-auth-manager.js
 *
 * ⚠️ DEPRECATED: This wrapper file is for backward compatibility only.
 *
 * SOURCE OF TRUTH: /shared/browser/auth-manager.js
 *
 * MIGRATION GUIDE:
 * ================
 * For ES Modules (recommended):
 *   import { AuthManager } from '/shared/browser/auth-manager.js';
 *
 * For script-tag (deprecated):
 *   <script type="module" src="../shared/esm/compat.js"></script>
 *   This auto-initializes window.authManager from the ES module source.
 *
 * This file contains duplicated logic and will be removed in future.
 * Please migrate to ES modules when possible.
 */

// Log deprecation warning once
if (typeof window !== 'undefined' && !window._sharedAuthManagerWarned) {
    console.warn('[AuthManager] ⚠️ DEPRECATED: shared-auth-manager.js sẽ bị xóa. Dùng ES module từ /shared/browser/auth-manager.js');
    window._sharedAuthManagerWarned = true;
}

// Prevent redeclaration if already loaded
if (typeof window !== 'undefined' && window.AuthManager) {
    console.log('⚠️ AuthManager already loaded, skipping redeclaration');
} else {
    class AuthManager {
    constructor(options = {}) {
        this.storageKey = options.storageKey || 'loginindex_auth';
        this.redirectUrl = options.redirectUrl || '/index.html';
        this.sessionDuration = options.sessionDuration || 8 * 60 * 60 * 1000; // 8 hours
        this.rememberDuration = options.rememberDuration || 30 * 24 * 60 * 60 * 1000; // 30 days
        this.requiredPermissions = options.requiredPermissions || [];
    }

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        const authData = this.getAuthData();
        if (!authData) return false;

        // Check if session expired
        if (this.isSessionExpired(authData)) {
            this.logout('Session expired');
            return false;
        }

        return authData.isLoggedIn === 'true' || authData.isLoggedIn === true;
    }

    /**
     * Get auth data from storage
     * @returns {object|null}
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
            logger.error('Error reading auth data:', error);
            return null;
        }
    }

    /**
     * Alias for getAuthData (backward compatibility)
     * @returns {object|null}
     */
    getAuthState() {
        return this.getAuthData();
    }

    /**
     * Save auth data to storage
     * @param {object} authData
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

            logger.log('✅ Auth data saved to', rememberMe ? 'localStorage' : 'sessionStorage');
        } catch (error) {
            logger.error('Error saving auth data:', error);
        }
    }

    /**
     * Check if session is expired
     * @param {object} authData
     * @returns {boolean}
     */
    isSessionExpired(authData) {
        if (!authData.expiresAt) {
            // Legacy data without expiry - check timestamp
            const duration = authData.isRemembered ? this.rememberDuration : this.sessionDuration;
            return Date.now() - (authData.timestamp || 0) > duration;
        }
        return Date.now() > authData.expiresAt;
    }

    /**
     * Get user info
     * @returns {object|null}
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
            pagePermissions: authData.pagePermissions || []
        };
    }

    /**
     * Check if user has permission for current page
     * ALL users (including Admin) check detailedPermissions - NO bypass
     * @param {string} pageName
     * @returns {boolean}
     */
    hasPagePermission(pageName) {
        const authData = this.getAuthData();
        if (!authData) return false;

        // ALL users check detailedPermissions - NO bypass
        if (authData.detailedPermissions && authData.detailedPermissions[pageName]) {
            const pagePerms = authData.detailedPermissions[pageName];
            return Object.values(pagePerms).some(v => v === true);
        }

        return false;
    }

    /**
     * Get permission level
     * @returns {number}
     */
    getPermissionLevel() {
        const authData = this.getAuthData();
        if (!authData) return 777; // Guest level

        return parseInt(authData.checkLogin) || 777;
    }

    /**
     * Check permission level - LEGACY METHOD
     * @deprecated Use hasDetailedPermission() instead - will be removed in future
     * Kept for backward compatibility only
     * @param {number} requiredLevel
     * @returns {boolean}
     */
    hasPermissionLevel(requiredLevel) {
        // Deprecation warning - log once per session
        if (!this._permissionLevelWarned) {
            console.warn('[AuthManager] DEPRECATED: hasPermissionLevel() sẽ bị xóa. Dùng hasDetailedPermission(pageId, action) thay thế.');
            this._permissionLevelWarned = true;
        }
        const authData = this.getAuthData();
        if (!authData) return false;

        // Legacy: use checkLogin level if available
        const userLevel = this.getPermissionLevel();
        return userLevel <= requiredLevel;
    }

    /**
     * Check if user has specific detailed permission
     * ALL users (including Admin) check detailedPermissions - NO bypass
     * @param {string} pageId
     * @param {string} action
     * @returns {boolean}
     */
    hasDetailedPermission(pageId, action) {
        const authData = this.getAuthData();
        // ALL users check detailedPermissions - NO bypass
        if (!authData?.detailedPermissions?.[pageId]) return false;
        return authData.detailedPermissions[pageId][action] === true;
    }

    /**
     * Check if user has admin template (for UI display only)
     * QUAN TRỌNG: Không dùng để bypass permission - chỉ để hiển thị UI
     * @returns {boolean}
     */
    isAdminTemplate() {
        const authData = this.getAuthData();
        return authData?.roleTemplate === 'admin';
    }

    /**
     * @deprecated Use isAdminTemplate() instead
     * Kept for backward compatibility - returns template check only
     */
    isAdmin() {
        return this.isAdminTemplate();
    }

    /**
     * LEGACY: hasPermission for backward compatibility
     * @deprecated Use hasDetailedPermission() instead
     * @param {number} requiredLevel - 0 = admin, 1 = manager, etc.
     * @returns {boolean}
     */
    hasPermission(requiredLevel) {
        // Legacy: use checkLogin level
        return this.hasPermissionLevel(requiredLevel);
    }

    /**
     * Logout user
     * @param {string} reason
     */
    logout(reason = '') {
        if (reason) {
            logger.log('Logging out:', reason);
        }

        // Clear both storages
        sessionStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.storageKey);

        // Redirect to login
        if (typeof window !== 'undefined') {
            window.location.href = this.redirectUrl;
        }
    }

    /**
     * Verify authentication and redirect if not authenticated
     * @returns {boolean}
     */
    requireAuth() {
        if (!this.isAuthenticated()) {
            logger.log('Not authenticated, redirecting to login...');
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
            logger.warn('Access denied to page:', pageName);
            alert('Bạn không có quyền truy cập trang này');
            window.location.href = '/live/index.html';
            return false;
        }

        return true;
    }

    /**
     * Get role information based on checkLogin level
     * @returns {object}
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

    /**
     * Extend session (refresh expiry time)
     */
    extendSession() {
        const authData = this.getAuthData();
        if (!authData) return;

        const isRemembered = authData.isRemembered || authData._storage === 'local';
        this.saveAuthData(authData, isRemembered);
        logger.log('✅ Session extended');
    }

    /**
     * Get session info
     * @returns {object}
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

    // Export to window
    if (typeof window !== 'undefined') {
        window.AuthManager = AuthManager;
    }

    // Module export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { AuthManager };
    }
}
