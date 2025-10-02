// =====================================================
// AUTHENTICATION SYSTEM WITH CACHE MANAGER
// Updated to use CacheManager from image-system.js
// =====================================================

// Initialize CacheManager for auth data
const authCacheManager = new window.ImageSystem.CacheManager({
    CACHE_EXPIRY: 30 * 24 * 60 * 60 * 1000, // 30 days for remembered login
    storageKey: "auth_system_cache",
});

// Session timeout constants
const SESSION_TIMEOUT = {
    SESSION_STORAGE: 8 * 60 * 60 * 1000, // 8 hours
    REMEMBERED: 30 * 24 * 60 * 60 * 1000, // 30 days
};

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.cacheManager = authCacheManager;
        this.init();
    }

    init() {
        try {
            // Try to get from cache first
            let authData = this.cacheManager.get("current_user", "auth");
            let isFromCache = !!authData;

            // Fallback to checking storage directly if cache miss
            if (!authData) {
                authData = this.checkStorageDirect();
            }

            if (authData) {
                if (this.isValidSession(authData, !isFromCache)) {
                    this.currentUser = authData;
                    // Store in cache for future quick access
                    this.cacheManager.set("current_user", authData, "auth");

                    console.log(
                        "[AUTH] Valid session restored",
                        isFromCache ? "from cache" : "from storage",
                    );
                    return true;
                } else {
                    console.log("[AUTH] Session expired, clearing data");
                    this.clearAuth();
                }
            }
        } catch (error) {
            console.error("Error reading auth:", error);
            this.clearAuth();
        }
        return false;
    }

    checkStorageDirect() {
        // Check sessionStorage first
        try {
            let data = sessionStorage.getItem("loginindex_auth");
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.warn("SessionStorage read error:", e);
        }

        // Then check localStorage
        try {
            let data = localStorage.getItem("loginindex_auth");
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.warn("LocalStorage read error:", e);
        }

        return null;
    }

    isValidSession(auth, isFromStorage = false) {
        if (
            !auth.isLoggedIn ||
            !auth.userType ||
            auth.checkLogin === undefined
        ) {
            return false;
        }

        // Determine timeout based on source
        const timeout =
            isFromStorage && auth.rememberMe !== false
                ? SESSION_TIMEOUT.REMEMBERED
                : SESSION_TIMEOUT.SESSION_STORAGE;

        // Check timestamp expiry
        if (auth.timestamp && Date.now() - auth.timestamp > timeout) {
            console.log("Session expired (timestamp)");
            return false;
        }

        // Check explicit expiry
        if (auth.expiresAt && Date.now() > auth.expiresAt) {
            console.log("Session expired (explicit)");
            return false;
        }

        return true;
    }

    isAuthenticated() {
        const auth = this.getAuthState();
        return auth && auth.isLoggedIn === "true";
    }

    hasPermission(requiredLevel) {
        const auth = this.getAuthState();
        if (!auth) return false;
        return parseInt(auth.checkLogin) <= requiredLevel;
    }

    getAuthState() {
        // Try cache first
        let cached = this.cacheManager.get("current_user", "auth");
        if (cached) {
            this.currentUser = cached;
            return cached;
        }

        // Fallback to storage
        try {
            let stored = sessionStorage.getItem("loginindex_auth");
            if (!stored) {
                stored = localStorage.getItem("loginindex_auth");
            }

            if (stored) {
                const authData = JSON.parse(stored);
                this.currentUser = authData;
                // Update cache
                this.cacheManager.set("current_user", authData, "auth");
                return authData;
            }
        } catch (error) {
            console.error("Error reading auth:", error);
        }

        return null;
    }

    getUserInfo() {
        return this.getAuthState();
    }

    setAuthState(authData, rememberMe = false) {
        try {
            const authObject = {
                ...authData,
                timestamp: Date.now(),
                rememberMe: rememberMe,
            };

            // Save to appropriate storage
            if (rememberMe) {
                localStorage.setItem(
                    "loginindex_auth",
                    JSON.stringify(authObject),
                );
            } else {
                sessionStorage.setItem(
                    "loginindex_auth",
                    JSON.stringify(authObject),
                );
            }

            // Update cache
            this.cacheManager.set("current_user", authObject, "auth");
            this.currentUser = authObject;

            console.log(
                "[AUTH] State saved",
                rememberMe ? "to localStorage" : "to sessionStorage",
            );
        } catch (error) {
            console.error("Error saving auth state:", error);
        }
    }

    clearAuth() {
        this.currentUser = null;

        // Clear cache
        this.cacheManager.clear("auth");

        // Clear storage
        try {
            sessionStorage.removeItem("loginindex_auth");
            localStorage.removeItem("loginindex_auth");
            localStorage.removeItem("remember_login_preference");

            // Clear legacy data
            this.clearLegacyAuth();
        } catch (error) {
            console.error("Error clearing auth:", error);
        }

        console.log("[AUTH] All auth data cleared");
    }

    clearLegacyAuth() {
        const legacyKeys = [
            "isLoggedIn",
            "userType",
            "checkLogin",
            "remember_login_preference",
        ];

        legacyKeys.forEach((key) => {
            try {
                localStorage.removeItem(key);
                sessionStorage.removeItem(key);
            } catch (e) {
                console.warn(`Could not clear ${key}:`, e);
            }
        });
    }

    logout() {
        if (confirm("Bạn có chắc muốn đăng xuất?")) {
            this.clearAuth();
            window.location.href = "../index.html";
        }
    }

    // Get cache statistics
    getCacheStats() {
        return this.cacheManager.getStats();
    }

    // Clean expired cache entries
    cleanExpiredCache() {
        const cleaned = this.cacheManager.cleanExpired();
        console.log(`[AUTH] Cleaned ${cleaned} expired cache entries`);
        return cleaned;
    }
}

// =====================================================
// INITIALIZE AUTHMANAGER
// =====================================================

// Wait for ImageSystem to be available
function initializeAuth() {
    if (typeof window.ImageSystem === "undefined") {
        console.warn("[AUTH] ImageSystem not loaded yet, waiting...");
        setTimeout(initializeAuth, 100);
        return;
    }

    // Initialize authManager
    const authManager = new AuthManager();
    window.authManager = authManager;

    console.log(
        "[AUTH] AuthManager initialized:",
        authManager.isAuthenticated(),
    );
    console.log("[AUTH] Cache stats:", authManager.getCacheStats());

    // Clean expired cache on init
    authManager.cleanExpiredCache();

    // Redirect to login if not authenticated
    if (!authManager.isAuthenticated()) {
        console.warn("[AUTH] User not authenticated, redirecting to login...");
        setTimeout(() => {
            if (!authManager.isAuthenticated()) {
                window.location.href = "../index.html";
            }
        }, 500);
    }

    // Periodic cache cleanup (every 5 minutes)
    setInterval(
        () => {
            authManager.cleanExpiredCache();
        },
        5 * 60 * 1000,
    );
}

// Start initialization
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAuth);
} else {
    initializeAuth();
}

// =====================================================
// LEGACY FUNCTIONS (for backward compatibility)
// =====================================================

function getAuthState() {
    return window.authManager ? window.authManager.getAuthState() : null;
}

function setAuthState(isLoggedIn, userType, checkLogin, rememberMe = false) {
    if (window.authManager) {
        window.authManager.setAuthState(
            {
                isLoggedIn,
                userType,
                checkLogin,
            },
            rememberMe,
        );
    }
}

function clearAuthState() {
    if (window.authManager) {
        window.authManager.clearAuth();
    }
}

function isAuthenticated() {
    return window.authManager ? window.authManager.isAuthenticated() : false;
}

function hasPermission(requiredLevel) {
    return window.authManager
        ? window.authManager.hasPermission(requiredLevel)
        : false;
}

function getUserName() {
    const auth = getAuthState();
    return auth && auth.userType ? auth.userType.split("-")[0] : "Admin";
}

function handleLogout() {
    if (window.authManager) {
        window.authManager.logout();
    }
}

// Invalidate cache helper
function invalidateCache() {
    if (window.authManager) {
        window.authManager.clearAuth();
    }
}

// Get cache statistics
function getAuthCacheStats() {
    return window.authManager ? window.authManager.getCacheStats() : null;
}

console.log("Authentication system with CacheManager loaded");
