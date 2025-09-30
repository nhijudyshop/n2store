// =====================================================
// AUTHENTICATION SYSTEM WITH AUTHMANAGER CLASS
// Fixed version to prevent unwanted redirects
// =====================================================

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isInitialized = false;
        this.initializeAuth();
    }

    initializeAuth() {
        // Set flag to prevent navigation from redirecting during setup
        window.authInitializing = true;

        try {
            // First check if we have auth data
            let authData = localStorage.getItem("loginindex_auth");

            // If no auth exists, create development auth
            if (!authData) {
                console.warn(
                    "[AUTH] No authentication found, creating development session...",
                );
                this.createDevelopmentAuth();
                authData = localStorage.getItem("loginindex_auth");
            }

            // Parse and validate auth
            if (authData) {
                const auth = JSON.parse(authData);
                if (this.isValidSession(auth)) {
                    this.currentUser = auth;
                    this.isInitialized = true;
                    console.log("[AUTH] Session validated:", auth.userType);
                } else {
                    console.warn(
                        "[AUTH] Invalid session, creating new development auth",
                    );
                    this.createDevelopmentAuth();
                }
            }
        } catch (error) {
            console.error("[AUTH] Initialization error:", error);
            this.createDevelopmentAuth();
        } finally {
            // Clear initialization flag after a delay
            setTimeout(() => {
                window.authInitializing = false;
                console.log("[AUTH] Initialization complete");
            }, 100);
        }
    }

    createDevelopmentAuth() {
        const devAuth = {
            isLoggedIn: "true",
            userType: "Admin-Developer",
            checkLogin: "0",
            timestamp: Date.now(),
            username: "developer",
            displayName: "Developer Mode",
            pagePermissions: [
                "live",
                "livestream",
                "sanphamlive",
                "nhanhang",
                "hangrotxa",
                "ib",
                "ck",
                "hanghoan",
                "hangdat",
                "bangkiemhang",
                "user-management",
                "history",
            ],
        };

        try {
            localStorage.setItem("loginindex_auth", JSON.stringify(devAuth));
            localStorage.setItem("checkLogin", "0");
            localStorage.setItem("isLoggedIn", "true");
            localStorage.setItem("userType", devAuth.userType);
            this.currentUser = devAuth;
            this.isInitialized = true;
            console.log("[AUTH] Development authentication created");
        } catch (error) {
            console.error("[AUTH] Failed to create development auth:", error);
        }
    }

    isValidSession(auth) {
        if (
            !auth ||
            !auth.isLoggedIn ||
            !auth.userType ||
            auth.checkLogin === undefined
        ) {
            return false;
        }

        // Check session timeout (24 hours)
        const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;
        if (auth.timestamp && Date.now() - auth.timestamp > SESSION_TIMEOUT) {
            console.log("[AUTH] Session expired");
            return false;
        }

        return true;
    }

    isAuthenticated() {
        // During initialization, always return true to prevent redirects
        if (window.authInitializing) {
            return true;
        }

        const auth = this.getAuthState();
        return auth && auth.isLoggedIn === "true";
    }

    hasPermission(requiredLevel) {
        const auth = this.getAuthState();
        if (!auth) return false;
        const userLevel = parseInt(auth.checkLogin);
        return !isNaN(userLevel) && userLevel <= requiredLevel;
    }

    getAuthState() {
        if (this.currentUser) {
            return this.currentUser;
        }

        try {
            const stored = localStorage.getItem("loginindex_auth");
            if (stored) {
                this.currentUser = JSON.parse(stored);
                return this.currentUser;
            }
        } catch (error) {
            console.error("[AUTH] Error reading auth state:", error);
        }

        return null;
    }

    getUserInfo() {
        return this.getAuthState();
    }

    updateAuthState(updates) {
        try {
            const currentAuth = this.getAuthState();
            const updatedAuth = {
                ...currentAuth,
                ...updates,
                timestamp: Date.now(),
            };

            localStorage.setItem(
                "loginindex_auth",
                JSON.stringify(updatedAuth),
            );
            this.currentUser = updatedAuth;
            console.log("[AUTH] State updated");
            return true;
        } catch (error) {
            console.error("[AUTH] Failed to update state:", error);
            return false;
        }
    }

    clearAuth() {
        this.currentUser = null;
        this.isInitialized = false;
        try {
            localStorage.removeItem("loginindex_auth");
            localStorage.removeItem("checkLogin");
            localStorage.removeItem("isLoggedIn");
            localStorage.removeItem("userType");
            sessionStorage.clear();
            console.log("[AUTH] Authentication cleared");
        } catch (error) {
            console.error("[AUTH] Error clearing auth:", error);
        }
    }

    logout() {
        if (confirm("Bạn có chắc muốn đăng xuất?")) {
            this.clearAuth();
            window.location.href = "../index.html";
        }
    }

    refreshSession() {
        const auth = this.getAuthState();
        if (auth) {
            auth.timestamp = Date.now();
            localStorage.setItem("loginindex_auth", JSON.stringify(auth));
            console.log("[AUTH] Session refreshed");
        }
    }

    // Get user display name
    getDisplayName() {
        const auth = this.getAuthState();
        if (auth) {
            return (
                auth.displayName ||
                auth.username ||
                auth.userType?.split("-")[0] ||
                "User"
            );
        }
        return "Guest";
    }

    // Get user role name
    getRoleName() {
        const auth = this.getAuthState();
        if (!auth) return "Guest";

        const roleMap = {
            0: "Admin",
            1: "Manager",
            3: "Staff",
            777: "Guest",
        };

        return roleMap[auth.checkLogin] || "User";
    }

    // Check if user is admin
    isAdmin() {
        const auth = this.getAuthState();
        return auth && (auth.checkLogin === "0" || auth.checkLogin === 0);
    }

    // Get all permissions
    getPermissions() {
        const auth = this.getAuthState();
        if (!auth) return [];

        if (this.isAdmin()) {
            return [
                "live",
                "livestream",
                "sanphamlive",
                "nhanhang",
                "hangrotxa",
                "ib",
                "ck",
                "hanghoan",
                "hangdat",
                "bangkiemhang",
                "user-management",
                "history",
            ];
        }

        return auth.pagePermissions || [];
    }

    // Check if user has specific page permission
    hasPagePermission(page) {
        if (this.isAdmin()) return true;
        const permissions = this.getPermissions();
        return permissions.includes(page);
    }

    // Get auth stats for debugging
    getStats() {
        return {
            isInitialized: this.isInitialized,
            isAuthenticated: this.isAuthenticated(),
            isAdmin: this.isAdmin(),
            displayName: this.getDisplayName(),
            roleName: this.getRoleName(),
            permissions: this.getPermissions(),
            authInitializing: window.authInitializing || false,
        };
    }
}

// =====================================================
// INITIALIZE AUTHMANAGER IMMEDIATELY
// =====================================================

// Create and initialize AuthManager synchronously
const authManager = new AuthManager();
window.authManager = authManager;

// Ensure auth is available globally
Object.defineProperty(window, "authManager", {
    value: authManager,
    writable: false,
    configurable: false,
});

console.log("[AUTH] AuthManager initialized and locked");
console.log("[AUTH] Current state:", authManager.getStats());

// =====================================================
// LEGACY FUNCTIONS (for backward compatibility)
// =====================================================

let authState = null;

function getAuthState() {
    return authManager ? authManager.getAuthState() : null;
}

function setAuthState(isLoggedIn, userType, checkLogin) {
    authState = {
        isLoggedIn: isLoggedIn,
        userType: userType,
        checkLogin: checkLogin,
        timestamp: Date.now(),
    };

    try {
        localStorage.setItem("loginindex_auth", JSON.stringify(authState));
        if (authManager) {
            authManager.currentUser = authState;
        }
        console.log("[AUTH] State set via legacy function");
    } catch (error) {
        console.error("[AUTH] Error saving auth state:", error);
    }
}

function clearAuthState() {
    authState = null;
    if (authManager) {
        authManager.clearAuth();
    }
}

function clearLegacyAuth() {
    try {
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userType");
        localStorage.removeItem("checkLogin");
        sessionStorage.clear();
    } catch (error) {
        console.error("[AUTH] Error clearing legacy auth:", error);
    }
}

function isAuthenticated() {
    return authManager ? authManager.isAuthenticated() : false;
}

function hasPermission(requiredLevel) {
    return authManager ? authManager.hasPermission(requiredLevel) : false;
}

function getUserName() {
    return authManager ? authManager.getDisplayName() : "Guest";
}

function handleLogout() {
    if (authManager) {
        authManager.logout();
    } else {
        const confirmLogout = confirm("Bạn có chắc muốn đăng xuất?");
        if (confirmLogout) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }
    }
}

// =====================================================
// CACHE INVALIDATION (for backward compatibility)
// =====================================================

function invalidateCache() {
    try {
        if (window.cacheManager) {
            window.cacheManager.invalidate();
        }
        console.log("[AUTH] Cache invalidated");
    } catch (error) {
        console.error("[AUTH] Error invalidating cache:", error);
    }
}

// =====================================================
// AUTO SESSION REFRESH
// =====================================================

// Refresh session every 30 minutes to keep it alive
setInterval(
    () => {
        if (authManager && authManager.isAuthenticated()) {
            authManager.refreshSession();
        }
    },
    30 * 60 * 1000,
);

// Refresh session on user activity
let lastActivityTime = Date.now();
const activityEvents = ["mousedown", "keydown", "scroll", "touchstart"];

activityEvents.forEach((eventName) => {
    document.addEventListener(
        eventName,
        () => {
            const now = Date.now();
            // Only refresh if more than 5 minutes since last activity
            if (now - lastActivityTime > 5 * 60 * 1000) {
                lastActivityTime = now;
                if (authManager && authManager.isAuthenticated()) {
                    authManager.refreshSession();
                }
            }
        },
        { passive: true },
    );
});

// =====================================================
// EXPORT FOR DEBUGGING
// =====================================================

window.debugAuth = function () {
    console.group("Authentication Debug Info");
    console.log("AuthManager Stats:", authManager.getStats());
    console.log("LocalStorage Auth:", localStorage.getItem("loginindex_auth"));
    console.log("CheckLogin:", localStorage.getItem("checkLogin"));
    console.log("Is Authenticated:", authManager.isAuthenticated());
    console.log("Is Admin:", authManager.isAdmin());
    console.log("Permissions:", authManager.getPermissions());
    console.groupEnd();
    return authManager.getStats();
};

console.log("[AUTH] Authentication system loaded and ready");
console.log("[AUTH] Type 'debugAuth()' in console for debug info");
