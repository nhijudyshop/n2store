// =====================================================
// MAIN APPLICATION INITIALIZATION WITH FORM INTEGRATION
// =====================================================

async function initializeInventorySystem() {
    // Check authentication
    const auth = getAuthState();
    if (!isAuthenticated()) {
        console.log("User not authenticated, redirecting to login");
        // Uncomment for production:
        // window.location.href = '../index.html';
        // return;
    }

    // Update page title with user info
    if (auth && auth.userType && auth.userType !== "Admin") {
        const titleElement = document.querySelector(".page-title");
        if (titleElement) {
            titleElement.textContent += " - " + auth.displayName;
        }
    }

    // Initialize form system
    initializeFormSystem();

    // Initialize filter events
    initializeFilterEvents();

    // Load initial data
    await loadInventoryData();

    // Set up event listeners for buttons
    setupEventListeners();

    console.log(
        "Inventory Management System with Form initialized successfully",
    );
    console.log('Data source: Firebase collection "dathang"');
}

function setupEventListeners() {
    // Refresh button
    const refreshButton = document.getElementById("refreshButton");
    if (refreshButton) {
        refreshButton.addEventListener("click", refreshInventoryData);
    }

    // Export button
    const exportButton = document.getElementById("exportButton");
    if (exportButton) {
        exportButton.addEventListener("click", exportToExcel);
    }

    // Logout button
    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", handleLogout);
    }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", function () {
    // Force unblock any blocking overlays
    document.body.style.pointerEvents = "auto";
    document.body.style.userSelect = "auto";
    document.body.style.overflow = "auto";
    document.body.style.cursor = "default";

    // Set default date to today for form
    const orderDate = document.getElementById("orderDate");
    if (orderDate) {
        orderDate.value = new Date().toISOString().split("T")[0];
    }

    // Initialize the inventory system
    initializeInventorySystem();

    console.log(
        "Enhanced Inventory System with Product Form loaded successfully",
    );
});

// Debug functions for development
window.debugInventoryFunctions = {
    loadInventoryData,
    refreshInventoryData,
    invalidateCache,
    getAuthState,
    exportToExcel,
    updateOrderInventoryData,
    removeItemFromFirebase, // Fixed: Use the actual function name
    applyFilters,
    toggleView,
    resetForm: () => {
        const form = document.getElementById("orderForm");
        if (form) {
            form.reset();
            document.getElementById("orderDate").value = new Date()
                .toISOString()
                .split("T")[0];
        }
    },
    globalState: () => globalState,
    formState: () => formState,
};

console.log("Enhanced main application initialized");
