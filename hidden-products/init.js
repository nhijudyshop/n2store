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

console.log("✅ Global state initialized");
