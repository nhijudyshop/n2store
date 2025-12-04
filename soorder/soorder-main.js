// =====================================================
// MAIN INITIALIZATION
// File: soorder-main.js
// =====================================================

document.addEventListener("DOMContentLoaded", async () => {
    const config = window.SoOrderConfig;
    const utils = window.SoOrderUtils;
    const crud = window.SoOrderCRUD;
    const ui = window.SoOrderUI;

    console.log("Sổ Order: Initializing...");

    // Set DOM elements after DOM is ready
    config.tbody = document.getElementById("orderTableBody");
    config.searchInput = document.getElementById("searchInput");
    config.dateFilterDropdown = document.getElementById("dateFilter");
    config.filterNCCSelect = document.getElementById("filterNCC");
    config.filterPhanLoaiSelect = document.getElementById("filterPhanLoai");
    config.filterThanhToanSelect = document.getElementById("filterThanhToan");
    config.btnAddOrder = document.getElementById("btnAddOrder");
    config.btnManageOffDays = document.getElementById("btnManageOffDays");

    console.log("DOM elements:", {
        btnAddOrder: config.btnAddOrder,
        btnManageOffDays: config.btnManageOffDays
    });

    // Setup event listeners FIRST (before async operations)
    setupEventListeners();

    // Initialize auth
    if (typeof authManager !== "undefined") {
        await authManager.checkAuth();
    }

    // Load data
    await crud.loadOffDays();
    await crud.loadAllOrders();

    console.log("Sổ Order: Ready!");
});

function setupEventListeners() {
    const config = window.SoOrderConfig;
    const utils = window.SoOrderUtils;
    const ui = window.SoOrderUI;

    console.log("Setting up event listeners...");

    // Add order button
    if (config.btnAddOrder) {
        console.log("Attaching click listener to btnAddOrder");
        config.btnAddOrder.addEventListener("click", () => {
            console.log("Add Order button clicked!");
            ui.showAddOrderModal();
        });
    } else {
        console.error("btnAddOrder not found!");
    }

    // Manage off days button
    if (config.btnManageOffDays) {
        console.log("Attaching click listener to btnManageOffDays");
        config.btnManageOffDays.addEventListener("click", () => {
            console.log("Manage Off Days button clicked!");
            ui.showOffDaysModal();
        });
    } else {
        console.error("btnManageOffDays not found!");
    }

    // Search input
    if (config.searchInput) {
        config.searchInput.addEventListener("input", (e) => {
            clearTimeout(config.filterTimeout);
            config.filterTimeout = setTimeout(() => {
                utils.applyFilters();
            }, config.FILTER_DEBOUNCE_DELAY);
        });
    }

    // Date filter
    if (config.dateFilterDropdown) {
        config.dateFilterDropdown.addEventListener("change", () => {
            utils.applyFilters();
        });
    }

    // NCC filter
    if (config.filterNCCSelect) {
        config.filterNCCSelect.addEventListener("change", () => {
            utils.applyFilters();
        });
    }

    // Phân loại filter
    if (config.filterPhanLoaiSelect) {
        config.filterPhanLoaiSelect.addEventListener("change", () => {
            utils.applyFilters();
        });
    }

    // Thanh toán filter
    if (config.filterThanhToanSelect) {
        config.filterThanhToanSelect.addEventListener("change", () => {
            utils.applyFilters();
        });
    }
}
