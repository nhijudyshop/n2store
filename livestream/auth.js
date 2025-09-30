// =====================================================
// AUTHENTICATION SYSTEM WITH AUTHMANAGER CLASS
// =====================================================

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        try {
            const authData = localStorage.getItem("loginindex_auth");
            if (authData) {
                const auth = JSON.parse(authData);
                if (this.isValidSession(auth)) {
                    this.currentUser = auth;
                    return true;
                }
            }
        } catch (error) {
            console.error("Error reading auth:", error);
            this.clearAuth();
        }
        return false;
    }

    isValidSession(auth) {
        if (!auth.isLoggedIn || !auth.userType || auth.checkLogin === undefined)
            return false;

        const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;
        if (auth.timestamp && Date.now() - auth.timestamp > SESSION_TIMEOUT) {
            console.log("Session expired");
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
        try {
            const stored = localStorage.getItem("loginindex_auth");
            if (stored) {
                this.currentUser = JSON.parse(stored);
                return this.currentUser;
            }
        } catch (error) {
            console.error("Error reading auth:", error);
        }
        return null;
    }

    getUserInfo() {
        return this.getAuthState();
    }

    clearAuth() {
        this.currentUser = null;
        localStorage.removeItem("loginindex_auth");
    }

    logout() {
        if (confirm("Bạn có chắc muốn đăng xuất?")) {
            this.clearAuth();
            window.location.href = "../index.html";
        }
    }
}

// =====================================================
// INITIALIZE AUTHMANAGER IMMEDIATELY
// =====================================================

// Create fake auth for development if not exists
if (!localStorage.getItem("loginindex_auth")) {
    console.warn("[AUTH] No auth found, creating development auth...");
    const devAuth = {
        isLoggedIn: "true",
        userType: "Admin-Developer",
        checkLogin: "0",
        timestamp: Date.now(),
        username: "developer",
        displayName: "Developer Mode",
    };
    localStorage.setItem("loginindex_auth", JSON.stringify(devAuth));
    localStorage.setItem("checkLogin", "0");
}

// Initialize authManager IMMEDIATELY
const authManager = new AuthManager();
window.authManager = authManager;

console.log("[AUTH] AuthManager initialized:", authManager.isAuthenticated());

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
    } catch (error) {
        console.error("Error saving auth state:", error);
    }
}

function clearAuthState() {
    authState = null;
    try {
        localStorage.removeItem("loginindex_auth");
        clearLegacyAuth();
    } catch (error) {
        console.error("Error clearing auth state:", error);
    }
}

function clearLegacyAuth() {
    try {
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userType");
        localStorage.removeItem("checkLogin");
        sessionStorage.clear();
    } catch (error) {
        console.error("Error clearing legacy auth:", error);
    }
}

function isAuthenticated() {
    return authManager ? authManager.isAuthenticated() : false;
}

function hasPermission(requiredLevel) {
    return authManager ? authManager.hasPermission(requiredLevel) : false;
}

function getUserName() {
    const auth = getAuthState();
    return auth && auth.userType ? auth.userType.split("-")[0] : "Admin";
}

function handleLogout() {
    const confirmLogout = confirm("Bạn có chắc muốn đăng xuất?");
    if (confirmLogout) {
        localStorage.clear();
        sessionStorage.clear();
        invalidateCache();
        window.location.href = "../index.html";
    }
}

console.log("Authentication system loaded");
