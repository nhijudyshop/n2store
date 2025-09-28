// js/auth.js - Authentication System

let authState = null;

// Authentication Functions
function getAuthState() {
    try {
        const stored = localStorage.getItem(APP_CONFIG.AUTH_STORAGE_KEY);
        if (stored) {
            authState = JSON.parse(stored);
            return authState;
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
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userType");
        localStorage.removeItem("checkLogin");
        sessionStorage.clear();
    } catch (error) {
        console.error("Error clearing auth state:", error);
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

function handleLogout() {
    const confirmLogout = confirm("Bạn có chắc muốn đăng xuất?");
    if (confirmLogout) {
        clearAuthState();
        if (typeof invalidateCache === "function") {
            invalidateCache();
        }
        window.location.href = "../index.html";
    }
}

// Logging Functions
function logAction(
    action,
    description,
    oldData = null,
    newData = null,
    pageName = "Báo cáo Livestream",
) {
    const auth = getAuthState();
    const logEntry = {
        timestamp: new Date(),
        user: auth
            ? auth.userType
                ? auth.userType.split("-")[0]
                : "Unknown"
            : "Unknown",
        page: pageName,
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: generateUniqueId(),
    };

    historyCollectionRef
        .add(logEntry)
        .then(() => {
            console.log("Log entry saved successfully");
        })
        .catch((error) => {
            console.error("Error saving log entry: ", error);
        });
}

// Export functions
window.getAuthState = getAuthState;
window.setAuthState = setAuthState;
window.clearAuthState = clearAuthState;
window.isAuthenticated = isAuthenticated;
window.hasPermission = hasPermission;
window.handleLogout = handleLogout;
window.logAction = logAction;
