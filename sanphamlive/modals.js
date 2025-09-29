// js/modals.js - Modal Management

let currentEditingItem = null;
let currentOrderItemId = null;

function initModals() {
    // Edit Modal
    const editModal = document.getElementById("editModal");
    const closeModalBtn = document.getElementById("closeModalBtn");
    const saveEditBtn = document.getElementById("saveEditBtn");
    const cancelEditBtn = document.getElementById("cancelEditBtn");

    if (closeModalBtn) {
        closeModalBtn.addEventListener("click", closeEditModal);
    }

    if (saveEditBtn) {
        saveEditBtn.addEventListener("click", handleSaveEdit);
    }

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener("click", closeEditModal);
    }

    // Order Modal
    const orderModal = document.getElementById("orderModal");
    const closeOrderModalBtn = document.getElementById("closeOrderModalBtn");
    const addOrderCodeBtn = document.getElementById("addOrderCodeBtn");
    const newOrderCodeInput = document.getElementById("newOrderCode");

    if (closeOrderModalBtn) {
        closeOrderModalBtn.addEventListener("click", closeOrderModal);
    }

    if (addOrderCodeBtn) {
        addOrderCodeBtn.addEventListener("click", handleAddOrderCode);
    }

    if (newOrderCodeInput) {
        newOrderCodeInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                handleAddOrderCode();
            }
        });
    }

    // Close modals on background click
    if (editModal) {
        editModal.addEventListener("click", (e) => {
            if (e.target === editModal) {
                closeEditModal();
            }
        });
    }

    if (orderModal) {
        orderModal.addEventListener("click", (e) => {
            if (e.target === orderModal) {
                closeOrderModal();
            }
        });
    }

    // Close modals on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeEditModal();
            closeOrderModal();
        }
    });
}

// Edit Modal Functions
function openEditModal(item) {
    currentEditingItem = { ...item };

    const editSupplier = document.getElementById("editSupplier");
    const editProductName = document.getElementById("editProductName");
    const editProductCode = document.getElementById("editProductCode");
    const editSupplierQty = document.getElementById("editSupplierQty");

    if (editSupplier) editSupplier.value = item.supplier || "";
    if (editProductName) editProductName.value = item.productName || "";
    if (editProductCode) editProductCode.value = item.productCode || "";
    if (editSupplierQty) editSupplierQty.value = item.supplierQty || 0;

    const editModal = document.getElementById("editModal");
    if (editModal) {
        editModal.classList.remove("hidden");
        initIcons();
    }
}

function closeEditModal() {
    const editModal = document.getElementById("editModal");
    if (editModal) {
        editModal.classList.add("hidden");
    }
    currentEditingItem = null;
}

function handleSaveEdit() {
    const editSupplier = document.getElementById("editSupplier");
    const editProductName = document.getElementById("editProductName");
    const editProductCode = document.getElementById("editProductCode");
    const editSupplierQty = document.getElementById("editSupplierQty");

    if (
        !editSupplier ||
        !editProductName ||
        !editProductCode ||
        !editSupplierQty
    ) {
        showNotification("Không tìm thấy form chỉnh sửa", "error");
        return;
    }

    const supplier = sanitizeInput(editSupplier.value);
    const productName = sanitizeInput(editProductName.value);
    const productCode = sanitizeInput(editProductCode.value);
    const supplierQty = parseInt(editSupplierQty.value) || 0;

    if (!supplier || !productName || !productCode) {
        showNotification("Vui lòng điền đầy đủ thông tin", "error");
        return;
    }

    if (supplierQty < 0) {
        showNotification("Số lượng không hợp lệ", "error");
        return;
    }

    const inventory = window.inventoryData || [];
    const updatedInventory = inventory.map((item) => {
        if (item.id === currentEditingItem.id) {
            return {
                ...item,
                supplier: supplier,
                productName: productName,
                productCode: productCode,
                supplierQty: supplierQty,
                editHistory: [
                    ...(item.editHistory || []),
                    {
                        timestamp: new Date().toISOString(),
                        editedBy: getAuthState().userType,
                        changes: "Chỉnh sửa thông tin sản phẩm",
                    },
                ],
            };
        }
        return item;
    });

    window.inventoryData = updatedInventory;
    setCachedData(updatedInventory);

    logAction("edit", `Chỉnh sửa sản phẩm: ${productName}`);

    closeEditModal();
    applyFilters();
    showNotification("Đã cập nhật sản phẩm!", "success");
}

// Order Modal Functions
function openOrderModal(itemId) {
    currentOrderItemId = itemId;

    const newOrderCodeInput = document.getElementById("newOrderCode");
    if (newOrderCodeInput) {
        newOrderCodeInput.value = "";
        newOrderCodeInput.focus();
    }

    const orderModal = document.getElementById("orderModal");
    if (orderModal) {
        orderModal.classList.remove("hidden");
        initIcons();
    }
}

function closeOrderModal() {
    const orderModal = document.getElementById("orderModal");
    if (orderModal) {
        orderModal.classList.add("hidden");
    }
    currentOrderItemId = null;
}

function handleAddOrderCode() {
    const newOrderCodeInput = document.getElementById("newOrderCode");
    if (!newOrderCodeInput) return;

    const orderCode = sanitizeInput(newOrderCodeInput.value);

    if (!orderCode) {
        showNotification("Vui lòng nhập mã đơn hàng", "error");
        return;
    }

    const inventory = window.inventoryData || [];
    const updatedInventory = inventory.map((item) => {
        if (item.id === currentOrderItemId) {
            const newOrderCodes = [...(item.orderCodes || []), orderCode];
            return {
                ...item,
                orderCodes: newOrderCodes,
                customerOrders: newOrderCodes.length,
            };
        }
        return item;
    });

    window.inventoryData = updatedInventory;
    setCachedData(updatedInventory);

    logAction("add_order_code", `Thêm mã đơn hàng: ${orderCode}`);

    closeOrderModal();
    applyFilters();
    showNotification("Đã thêm mã đơn hàng!", "success");
}

// Export functions
window.initModals = initModals;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.openOrderModal = openOrderModal;
window.closeOrderModal = closeOrderModal;
