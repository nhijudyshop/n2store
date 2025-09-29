// js/auth.js - Authentication System (In-Memory)

let authState = {
    isLoggedIn: true,
    userType: "admin",
    checkLogin: 0, // 0 = Admin, 1 = Editor, 2 = Viewer
    timestamp: Date.now(),
};

function getAuthState() {
    return authState;
}

function setAuthState(newState) {
    authState = {
        ...authState,
        ...newState,
        timestamp: Date.now(),
    };
}

function hasPermission(requiredLevel) {
    return authState.checkLogin <= requiredLevel;
}

function handleLogout() {
    if (confirm("Bạn có chắc muốn đăng xuất?")) {
        authState = {
            isLoggedIn: false,
            userType: "",
            checkLogin: 999,
            timestamp: Date.now(),
        };

        showNotification("Đã đăng xuất!", "info");

        // Reload page after 1 second
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
}

function logAction(action, description, oldData = null, newData = null) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        user: authState.userType || "Unknown",
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: generateId(),
    };

    console.log("Action logged:", logEntry);

    // In a real application, this would save to Firebase or backend
    // For now, we just log to console
}

// Export functions
window.getAuthState = getAuthState;
window.setAuthState = setAuthState;
window.hasPermission = hasPermission;
window.handleLogout = handleLogout;
window.logAction = logAction;
