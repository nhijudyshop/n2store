// =====================================================
// GLOBAL INITIALIZATION FOR HIDDEN PRODUCTS
// This file must load BEFORE filters.js and table-renderer.js
// =====================================================

// Global State
window.globalState = {
    hiddenProducts: [],
    filteredProducts: [],
    isLoading: false,
    currentFilters: {
        search: "",
        hiddenDate: "all",
        sortBy: "newest",
    },
};

// Global variables
window.savedProducts = [];

// Create a placeholder authManager to prevent navigation timeout
// This will be replaced by the real AuthManager instance in main.js
window.authManager = {
    isAuthenticated: function() {
        // Temporary check until real authManager is initialized
        try {
            const authData = sessionStorage.getItem("loginindex_auth") || localStorage.getItem("loginindex_auth");
            if (!authData) return false;
            const auth = JSON.parse(authData);
            return auth.isLoggedIn === "true" || auth.isLoggedIn === true;
        } catch (e) {
            return false;
        }
    },
    getAuthData: function() {
        try {
            const authData = sessionStorage.getItem("loginindex_auth") || localStorage.getItem("loginindex_auth");
            return authData ? JSON.parse(authData) : null;
        } catch (e) {
            return null;
        }
    },
    getUserInfo: function() {
        return this.getAuthData();
    },
    logout: function() {
        if (confirm("Bạn có chắc muốn đăng xuất không?")) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }
    }
};

console.log("✅ Global state and stub authManager initialized");
