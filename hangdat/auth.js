// =====================================================
// AUTHENTICATION SYSTEM
// =====================================================

let authState = null;

function getAuthState() {
    try {
        const stored = localStorage.getItem(APP_CONFIG.AUTH_STORAGE_KEY);
        if (stored) {
            authState = JSON.parse(stored);
            return authState;
        }

        // Fallback to legacy system for compatibility
        const legacyLogin =
            localStorage.getItem("isLoggedIn") ||
            sessionStorage.getItem("isLoggedIn");
        const legacyUserType =
            localStorage.getItem("userType") ||
            sessionStorage.getItem("userType");
        const legacyCheckLogin =
            localStorage.getItem("checkLogin") ||
            sessionStorage.getItem("checkLogin");

        if (legacyLogin) {
            const migratedAuth = {
                isLoggedIn: legacyLogin,
                userType: legacyUserType,
                checkLogin: legacyCheckLogin,
                timestamp: Date.now(),
            };
            setAuthState(legacyLogin, legacyUserType, legacyCheckLogin);
            clearLegacyAuth();
            return migratedAuth;
        }
    } catch (error) {
        console.error("Error reading auth state:", error);
        clearAuthState();
    }
    return null;
}

function setAuthState(isLoggedIn, userType, checkLogin) {
    authState = {
        isLoggedIn: isLoggedIn,
        userType: userType,
        checkLogin: checkLogin,
        timestamp: Date.now(),
    };

    try {
        localStorage.setItem(
            APP_CONFIG.AUTH_STORAGE_KEY,
            JSON.stringify(authState),
        );
    } catch (error) {
        console.error("Error saving auth state:", error);
    }
}

function clearAuthState() {
    authState = null;
    try {
        localStorage.removeItem(APP_CONFIG.AUTH_STORAGE_KEY);
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
    const auth = getAuthState();
    return auth && auth.isLoggedIn === "true";
}

function hasPermission(requiredLevel) {
    const auth = getAuthState();
    if (!auth) return false;
    const userLevel = parseInt(auth.checkLogin);
    return userLevel <= requiredLevel;
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
