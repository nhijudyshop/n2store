// =====================================================
// AUTHENTICATION SYSTEM FOR CUSTOMER-HUB
// =====================================================

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        try {
            // Check sessionStorage first (for session-only login)
            let authData = sessionStorage.getItem("loginindex_auth");
            let isFromSession = true;

            // If not in sessionStorage, check localStorage (for remembered login)
            if (!authData) {
                authData = localStorage.getItem("loginindex_auth");
                isFromSession = false;
            }

            if (authData) {
                const auth = JSON.parse(authData);
                if (this.isValidSession(auth, isFromSession)) {
                    this.currentUser = auth;
                    console.log(
                        "[AUTH] Valid session restored from",
                        isFromSession ? "sessionStorage" : "localStorage",
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

    isValidSession(auth, isFromSession = false) {
        if (!auth.isLoggedIn || !auth.userType || auth.checkLogin === undefined)
            return false;

        // Define session timeout based on source and remember preference
        const SESSION_TIMEOUT = isFromSession
            ? 8 * 60 * 60 * 1000 // 8 hours for session storage
            : 30 * 24 * 60 * 60 * 1000; // 30 days for remembered login

        // Check if session has expired
        if (auth.timestamp && Date.now() - auth.timestamp > SESSION_TIMEOUT) {
            console.log("Session expired");
            return false;
        }

        // Check explicit expiry if exists
        if (auth.expiresAt && Date.now() > auth.expiresAt) {
            console.log("Session expired (explicit expiry)");
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
            // Check sessionStorage first
            let stored = sessionStorage.getItem("loginindex_auth");

            // If not in sessionStorage, check localStorage
            if (!stored) {
                stored = localStorage.getItem("loginindex_auth");
            }

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
        // Clear from both storage locations
        sessionStorage.removeItem("loginindex_auth");
        localStorage.removeItem("loginindex_auth");
        localStorage.removeItem("remember_login_preference");
        // Clear legacy data
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userType");
        localStorage.removeItem("checkLogin");
    }

    logout() {
        if (confirm("Bạn có chắc muốn đăng xuất?")) {
            this.clearAuth();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }
    }
}

// =====================================================
// INITIALIZE AUTHMANAGER IMMEDIATELY
// =====================================================

// Initialize authManager IMMEDIATELY
const authManager = new AuthManager();
window.authManager = authManager;

console.log("[AUTH] AuthManager initialized:", authManager.isAuthenticated());

// Redirect to login if not authenticated (production mode)
if (!authManager.isAuthenticated()) {
    console.warn("[AUTH] User not authenticated, redirecting to login...");
    // Allow a brief moment for any pending operations
    setTimeout(() => {
        if (!authManager.isAuthenticated()) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }
    }, 500);
}

// =====================================================
// LEGACY FUNCTIONS (for backward compatibility)
// =====================================================

let authState = null;

function getAuthState() {
    return authManager ? authManager.getAuthState() : null;
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
        window.location.href = "../index.html";
    }
}

console.log("[AUTH] Authentication system loaded for customer-hub");
