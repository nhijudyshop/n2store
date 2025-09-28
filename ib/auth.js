// =====================================================
// AUTHENTICATION MANAGEMENT
// =====================================================

class AuthManager {
    constructor() {
        this.authState = null;
        this.storageKey = CONFIG.storage.authKey;
    }

    // Get current authentication state
    getAuthState() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                this.authState = JSON.parse(stored);
                return this.authState;
            }

            // Fallback to legacy keys for backward compatibility
            const legacyLogin =
                localStorage.getItem("isLoggedIn") ||
                sessionStorage.getItem("isLoggedIn");
            const legacyType =
                localStorage.getItem("userType") ||
                sessionStorage.getItem("userType");
            const legacyCheck =
                localStorage.getItem("checkLogin") ||
                sessionStorage.getItem("checkLogin");

            if (legacyLogin) {
                this.authState = {
                    isLoggedIn: legacyLogin,
                    userType: legacyType,
                    checkLogin: legacyCheck,
                    timestamp: Date.now(),
                };
                this.setAuthState(legacyLogin, legacyType, legacyCheck);
                return this.authState;
            }
        } catch (error) {
            console.error("Error reading auth state:", error);
            this.clearAuthState();
        }
        return null;
    }

    // Set authentication state
    setAuthState(isLoggedIn, userType, checkLogin) {
        this.authState = {
            isLoggedIn: isLoggedIn,
            userType: userType,
            checkLogin: checkLogin,
            timestamp: Date.now(),
        };

        try {
            localStorage.setItem(
                this.storageKey,
                JSON.stringify(this.authState),
            );
        } catch (error) {
            console.error("Error saving auth state:", error);
        }
    }

    // Clear authentication state
    clearAuthState() {
        this.authState = null;
        try {
            localStorage.removeItem(this.storageKey);
            // Clear legacy keys
            localStorage.removeItem("isLoggedIn");
            localStorage.removeItem("userType");
            localStorage.removeItem("checkLogin");
            sessionStorage.clear();
        } catch (error) {
            console.error("Error clearing auth state:", error);
        }
    }

    // Check if user is authenticated
    isAuthenticated() {
        const auth = this.getAuthState();
        return auth && auth.isLoggedIn === "true";
    }

    // Check if user has permission for action
    hasPermission(requiredLevel) {
        const auth = this.getAuthState();
        if (!auth) return false;

        const userLevel = parseInt(auth.checkLogin);
        return userLevel <= requiredLevel; // Lower number = higher permission
    }

    // Get current user info
    getCurrentUser() {
        const auth = this.getAuthState();
        if (!auth) return null;

        return {
            userType: auth.userType ? auth.userType.split("-")[0] : "Unknown",
            displayName: auth.userType || "Unknown User",
            checkLogin: auth.checkLogin,
            isLoggedIn: auth.isLoggedIn === "true",
        };
    }

    // Sanitize user input
    sanitizeInput(input) {
        if (typeof input !== "string") return "";
        return input.replace(/[<>"']/g, "").trim();
    }
}

// Create global auth manager instance
window.authManager = new AuthManager();
