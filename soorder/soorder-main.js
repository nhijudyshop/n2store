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

    // Initialize auth
    if (typeof authManager !== "undefined") {
        await authManager.checkAuth();
    }

    // Load data
    await crud.loadOffDays();
    await crud.loadAllOrders();

    // Setup event listeners
    setupEventListeners();

    console.log("Sổ Order: Ready!");
});

function setupEventListeners() {
    const config = window.SoOrderConfig;
    const utils = window.SoOrderUtils;
    const ui = window.SoOrderUI;

    // Add order button
    if (config.btnAddOrder) {
        config.btnAddOrder.addEventListener("click", () => {
            ui.showAddOrderModal();
        });
    }

    // Manage off days button
    if (config.btnManageOffDays) {
        config.btnManageOffDays.addEventListener("click", () => {
            ui.showOffDaysModal();
        });
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
