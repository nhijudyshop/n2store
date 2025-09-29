// js/main.js - Main Application Logic

// Global inventory data
window.inventoryData = [];

// Initialize application
document.addEventListener("DOMContentLoaded", function () {
    console.log("Initializing Inventory Management System...");

    // Load data
    loadInventoryData();

    // Initialize modules
    initFilters();
    initModals();
    initFormHandlers();
    initHeaderButtons();

    // Initialize icons
    initIcons();

    console.log("✓ Application initialized successfully");
});

// Load inventory data
function loadInventoryData() {
    const cachedData = getCachedData();

    if (cachedData && cachedData.length > 0) {
        console.log("Loading from cache...");
        window.inventoryData = cachedData;
        applyFilters();
    } else {
        console.log("Loading sample data...");
        window.inventoryData = SAMPLE_DATA;
        setCachedData(SAMPLE_DATA);
        applyFilters();
    }
}

// Initialize form handlers
function initFormHandlers() {
    const toggleFormBtn = document.getElementById("toggleFormBtn");
    const submitBtn = document.getElementById("submitBtn");
    const cancelFormBtn = document.getElementById("cancelFormBtn");
    const formSection = document.getElementById("formSection");

    if (toggleFormBtn) {
        toggleFormBtn.addEventListener("click", toggleForm);
    }

    if (submitBtn) {
        submitBtn.addEventListener("click", handleSubmitProduct);
    }

    if (cancelFormBtn) {
        cancelFormBtn.addEventListener("click", () => {
            if (formSection) {
                formSection.classList.add("hidden");
                clearForm();
            }
        });
    }
}

// Toggle form visibility
function toggleForm() {
    const formSection = document.getElementById("formSection");
    const toggleBtn = document.getElementById("toggleFormBtn");

    if (!formSection || !toggleBtn) return;

    if (formSection.classList.contains("hidden")) {
        formSection.classList.remove("hidden");
        const btnText = toggleBtn.querySelector("span");
        if (btnText) btnText.textContent = "Ẩn Form";

        // Focus first input
        const firstInput = document.getElementById("supplier");
        if (firstInput) firstInput.focus();
    } else {
        formSection.classList.add("hidden");
        const btnText = toggleBtn.querySelector("span");
        if (btnText) btnText.textContent = "Thêm SP";
        clearForm();
    }

    initIcons();
}

// Handle product submission
function handleSubmitProduct() {
    const supplierInput = document.getElementById("supplier");
    const productNameInput = document.getElementById("productName");
    const productCodeInput = document.getElementById("productCode");
    const supplierQtyInput = document.getElementById("supplierQty");

    if (
        !supplierInput ||
        !productNameInput ||
        !productCodeInput ||
        !supplierQtyInput
    ) {
        showNotification("Không tìm thấy form", "error");
        return;
    }

    const supplier = sanitizeInput(supplierInput.value);
    const productName = sanitizeInput(productNameInput.value);
    const productCode = sanitizeInput(productCodeInput.value);
    const supplierQty = parseInt(supplierQtyInput.value) || 0;

    // Validation
    if (!supplier || !productName || !productCode) {
        showNotification("Vui lòng điền đầy đủ thông tin", "error");
        return;
    }

    if (supplierQty < 0) {
        showNotification("Số lượng không hợp lệ", "error");
        return;
    }

    // Create new item
    const newItem = {
        id: generateId(),
        dateCell: Date.now(),
        supplier: supplier,
        productName: productName,
        productCode: productCode,
        supplierQty: supplierQty,
        customerOrders: 0,
        orderCodes: [],
        createdBy: getAuthState().userType,
        createdAt: Date.now(),
        editHistory: [],
    };

    // Add to inventory
    window.inventoryData = [newItem, ...window.inventoryData];
    setCachedData(window.inventoryData);

    // Log action
    logAction("add", `Thêm sản phẩm: ${productName}`);

    // Clear form and hide
    clearForm();
    const formSection = document.getElementById("formSection");
    if (formSection) formSection.classList.add("hidden");

    const toggleBtn = document.getElementById("toggleFormBtn");
    if (toggleBtn) {
        const btnText = toggleBtn.querySelector("span");
        if (btnText) btnText.textContent = "Thêm SP";
    }

    // Re-render table
    applyFilters();

    showNotification("Đã thêm sản phẩm thành công!", "success");
}

// Clear form
function clearForm() {
    const supplierInput = document.getElementById("supplier");
    const productNameInput = document.getElementById("productName");
    const productCodeInput = document.getElementById("productCode");
    const supplierQtyInput = document.getElementById("supplierQty");

    if (supplierInput) supplierInput.value = "";
    if (productNameInput) productNameInput.value = "";
    if (productCodeInput) productCodeInput.value = "";
    if (supplierQtyInput) supplierQtyInput.value = "";
}

// Initialize header buttons
function initHeaderButtons() {
    const exportBtn = document.getElementById("exportBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (exportBtn) {
        exportBtn.addEventListener("click", handleExport);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
    }
}

// Handle export
function handleExport() {
    const filteredData = getFilteredData();

    if (!filteredData || filteredData.length === 0) {
        showNotification("Không có dữ liệu để xuất", "error");
        return;
    }

    const filename = `inventory_${getTodayVN()}.csv`;
    exportToCSV(filteredData, filename);
}

// Auto-save functionality (optional)
let autoSaveInterval = null;

function startAutoSave() {
    // Auto-save every 5 minutes
    autoSaveInterval = setInterval(
        () => {
            if (window.inventoryData && window.inventoryData.length > 0) {
                setCachedData(window.inventoryData);
                console.log("Auto-saved data to cache");
            }
        },
        5 * 60 * 1000,
    );
}

function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
}

// Start auto-save
startAutoSave();

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
    stopAutoSave();

    // Save current data before leaving
    if (window.inventoryData && window.inventoryData.length > 0) {
        setCachedData(window.inventoryData);
    }
});

// Handle online/offline status
window.addEventListener("online", () => {
    showNotification("Đã kết nối mạng", "success");
});

window.addEventListener("offline", () => {
    showNotification("Mất kết nối mạng - Dữ liệu được lưu cục bộ", "info");
});

// Performance monitoring
const startTime = performance.now();

window.addEventListener("load", () => {
    const loadTime = performance.now() - startTime;
    console.log(`Page loaded in ${loadTime.toFixed(2)}ms`);

    if (loadTime < 1000) {
        console.log("✓ Performance: Excellent");
    } else if (loadTime < 3000) {
        console.log("⚠ Performance: Good");
    } else {
        console.log("⚠ Performance: Slow");
    }
});

// Export main functions
window.loadInventoryData = loadInventoryData;
window.handleSubmitProduct = handleSubmitProduct;
window.toggleForm = toggleForm;
window.clearForm = clearForm;
window.handleExport = handleExport;

console.log("✓ Main module loaded");
