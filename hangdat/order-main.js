// Order Management System - Main Application
// Application initialization and main functionality

// =====================================================
// MAIN INITIALIZATION
// =====================================================

async function initializeWithMigration() {
    try {
        await migrateDataWithIDs();
        await displayOrderData();
    } catch (error) {
        console.error("Lỗi khởi tạo:", error);
        showFloatingAlert("Lỗi khởi tạo ứng dụng", false, 3000);
    }
}

function toggleForm() {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        showError("Không có quyền truy cập biểu mẫu");
        return;
    }

    const dataForm = document.getElementById("dataForm");
    const toggleFormButton = document.getElementById("toggleFormButton");

    if (!dataForm || !toggleFormButton) return;

    if (dataForm.style.display === "none" || dataForm.style.display === "") {
        dataForm.style.display = "block";
        toggleFormButton.textContent = "Ẩn biểu mẫu";

        // Initialize form if not already done
        if (typeof initializeEnhancedForm === "function") {
            initializeEnhancedForm();
        }

        // Ensure we have at least one product row
        const productsTableBody = document.getElementById("productsTableBody");
        if (productsTableBody && productsTableBody.children.length === 0) {
            if (typeof addInitialProductRow === "function") {
                addInitialProductRow();
            }
        }
    } else {
        dataForm.style.display = "none";
        toggleFormButton.textContent = "Hiện biểu mẫu";
    }
}

function initializeFormElements() {
    // Set today's date
    const ngayDatHangInput = document.getElementById("ngayDatHang");
    if (ngayDatHangInput) {
        const today = new Date();
        ngayDatHangInput.value = today.toISOString().split("T")[0];
    }

    // Initialize enhanced form functionality
    if (typeof initializeEnhancedForm === "function") {
        initializeEnhancedForm();
    }

    // Add event listeners for buttons
    const toggleFormButton = document.getElementById("toggleFormButton");
    if (toggleFormButton) {
        toggleFormButton.removeEventListener("click", toggleForm); // Remove existing
        toggleFormButton.addEventListener("click", toggleForm);
    }

    const submitOrderBtn = document.getElementById("submitOrderBtn");
    if (submitOrderBtn) {
        submitOrderBtn.removeEventListener("click", submitOrder); // Remove existing
        submitOrderBtn.addEventListener("click", submitOrder);
    }

    const clearFormBtn = document.getElementById("clearFormBtn");
    if (clearFormBtn) {
        clearFormBtn.removeEventListener("click", clearForm); // Remove existing
        clearFormBtn.addEventListener("click", clearForm);
    }
}

function initializeFilterEvents() {
    if (filterSupplierSelect) {
        filterSupplierSelect.addEventListener("change", applyFilters);
    }
    if (dateFilterSelect) {
        dateFilterSelect.addEventListener("change", applyFilters);
    }
    if (filterProductInput) {
        filterProductInput.addEventListener(
            "input",
            debounce(applyFilters, 300),
        );
    }
}

function initializeTooltipHandlers() {
    if (tbody) {
        tbody.addEventListener("click", function (e) {
            const auth = getAuthState();
            if (auth && auth.checkLogin == "0") {
                const tooltip = document.getElementById("tooltip");
                const row = e.target.closest("tr");
                if (!row) return;

                const deleteButton = row.querySelector(".delete-button");
                const value = deleteButton
                    ? deleteButton.getAttribute("data-order-info")
                    : "Không có nút xóa";

                if (tooltip) {
                    tooltip.textContent = value;
                    tooltip.style.display = "block";
                    tooltip.style.top = e.pageY + 10 + "px";
                    tooltip.style.left = e.pageX + 10 + "px";
                    setTimeout(() => {
                        tooltip.style.display = "none";
                    }, 1000);
                }
            }
        });
    }
}

async function initializeApplication() {
    const auth = getAuthState();
    if (!isAuthenticated()) {
        console.log("User not authenticated, redirecting to login");
        window.location.href = "../index.html";
        return;
    }

    if (auth.userType) {
        const titleElement = document.querySelector(".page-title");
        if (titleElement) {
            titleElement.textContent += " - " + auth.userType.split("-")[0];
        }
    }

    const parentContainer = document.getElementById("parentContainer");
    if (parentContainer) {
        parentContainer.style.display = "flex";
        parentContainer.style.justifyContent = "center";
        parentContainer.style.alignItems = "center";
    }

    // Initialize form elements with new structure
    initializeFormElements();
    initializeFilterEvents();
    initializeTooltipHandlers();

    // Initialize with migration and display data
    await initializeWithMigration();

    const toggleLogoutButton = document.getElementById("toggleLogoutButton");
    if (toggleLogoutButton) {
        toggleLogoutButton.addEventListener("click", handleLogout);
    }

    console.log("Enhanced Order Management System initialized successfully");
}

// =====================================================
// GLOBAL ERROR HANDLERS
// =====================================================

window.addEventListener("error", function (e) {
    console.error("Global error:", e.error);
    showError("Có lỗi xảy ra. Vui lòng tải lại trang.");
});

window.addEventListener("unhandledrejection", function (e) {
    console.error("Unhandled promise rejection:", e.reason);
    showError("Có lỗi xảy ra trong xử lý dữ liệu.");
});

// =====================================================
// DEBUG FUNCTIONS
// =====================================================

window.debugFunctions = {
    checkDataIntegrity: async function () {
        const doc = await collectionRef.doc("dathang").get();
        if (doc.exists) {
            const data = doc.data();
            console.log("Data integrity check:", {
                total: data.data.length,
                withId: data.data.filter((item) => item.id).length,
                withoutId: data.data.filter((item) => !item.id).length,
            });
        }
    },
    generateUniqueID,
    sortDataByNewest,
    parseDate,
    parseVietnameseDate,
    forceRefreshData: function () {
        invalidateCache();
        displayOrderData();
    },
    invalidateCache,
    getAuthState,
    hasPermission,
    exportToExcel,
    testUpload: async function () {
        console.log("Testing image upload to Firebase...");
        const testData = {
            id: generateUniqueID(),
            ngayDatHang: "2025-01-01",
            nhaCungCap: "Test Supplier",
            hoaDon: "TEST001",
            tenSanPham: "Test Product",
            soLuong: 1,
            giaMua: 100,
            giaBan: 150,
            thoiGianUpload: getFormattedDateTime(),
            user: getUserName(),
        };
        try {
            await uploadToFirestore(testData);
            console.log("Test upload successful");
        } catch (error) {
            console.error("Test upload failed:", error);
        }
    },
};

// =====================================================
// DOM INITIALIZATION
// =====================================================

document.addEventListener("DOMContentLoaded", function () {
    // Remove any ads if present
    const adsElement = document.querySelector(
        'div[style*="position: fixed"][style*="z-index:9999999"]',
    );
    if (adsElement) {
        adsElement.remove();
    }

    // Initialize application
    initializeApplication();
});

console.log("Enhanced Order Management System - Main Application loaded");
console.log("Debug functions available at window.debugFunctions");
console.log(
    "Available functions:",
    Object.keys(window.debugFunctions).join(", "),
);

// =====================================================
// GLOBAL FUNCTIONS FOR INLINE HANDLERS
// =====================================================

// Make functions available globally for inline event handlers
window.removeProductRow = function (productId) {
    const row = document.getElementById(`product-row-${productId}`);
    if (row) {
        row.remove();
        updateRemoveButtons();
    }
};

window.exportToExcel = exportToExcel;

console.log("Order Management System - Complete initialization finished");
