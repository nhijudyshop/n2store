// =====================================================
// AUTHENTICATION SYSTEM FOR CUSTOMER MANAGEMENT
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
            : auth.isRemembered
              ? 30 * 24 * 60 * 60 * 1000 // 30 days for "remember me"
              : 8 * 60 * 60 * 1000; // 8 hours for localStorage without remember

        const now = Date.now();
        const loginTime = auth.timestamp || 0;

        if (now - loginTime > SESSION_TIMEOUT) {
            return false;
        }

        return true;
    }

    clearAuth() {
        localStorage.removeItem("loginindex_auth");
        sessionStorage.removeItem("loginindex_auth");
        this.currentUser = null;
    }

    isAuthenticated() {
        return (
            this.currentUser !== null &&
            this.currentUser.isLoggedIn &&
            this.isValidSession(this.currentUser, false)
        );
    }

    requireAuth() {
        if (!this.isAuthenticated()) {
            console.log("[AUTH] Not authenticated, redirecting...");
            this.clearAuth();
            window.location.href = "../index.html";
            return false;
        }
        return true;
    }

    hasPermission(requiredLevel = 0) {
        if (!this.isAuthenticated()) return false;

        const userLevel = parseInt(this.currentUser.checkLogin);
        return userLevel <= requiredLevel;
    }

    isAdmin() {
        return this.hasPermission(0);
    }

    getUserName() {
        if (!this.currentUser || !this.currentUser.userType) {
            return "Admin";
        }
        return this.currentUser.userType.split("-")[0] || "Admin";
    }

    getUserType() {
        return this.currentUser?.userType || "admin-0";
    }

    getCheckLogin() {
        return this.currentUser?.checkLogin ?? 0;
    }

    logout() {
        const confirmLogout = confirm("Bạn có chắc muốn đăng xuất?");
        if (confirmLogout) {
            this.clearAuth();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }
    }
}

// Create global instance
const authManager = new AuthManager();
window.authManager = authManager;

// Helper functions
function getAuthState() {
    return authManager.currentUser;
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
    authManager.logout();
}

console.log("[AUTH] Authentication system loaded");
