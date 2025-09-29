// js/table.js - Table Management with Firebase Integration

function renderTable(data) {
    const tableBody = document.getElementById("tableBody");
    if (!tableBody) return;

    // Clear existing rows
    tableBody.innerHTML = "";

    if (!data || data.length === 0) {
        const emptyRow = document.createElement("tr");
        emptyRow.innerHTML =
            '<td colspan="8" class="text-center">Không có dữ liệu</td>';
        tableBody.appendChild(emptyRow);
        return;
    }

    // Sort by date (newest first)
    const sortedData = [...data].sort((a, b) => b.dateCell - a.dateCell);

    // Render rows
    sortedData.forEach((item) => {
        const row = createTableRow(item);
        tableBody.appendChild(row);
    });

    // Reinitialize icons
    initIcons();
}

function createTableRow(item) {
    const row = document.createElement("tr");

    // Add visual indicator for unsynced items
    const isLocalId = item.id && item.id.includes("_");
    if (isLocalId && window.isFirebaseInitialized()) {
        row.style.background = "#fff3cd"; // Light yellow background
        row.title = "Sản phẩm đang đồng bộ...";
    }

    // Date
    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(item.dateCell);
    row.appendChild(dateCell);

    // Supplier
    const supplierCell = document.createElement("td");
    supplierCell.textContent = item.supplier || "-";
    row.appendChild(supplierCell);

    // Product Name
    const nameCell = document.createElement("td");
    nameCell.textContent = item.productName || "-";
    row.appendChild(nameCell);

    // Product Code (with copy button)
    const codeCell = document.createElement("td");
    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.innerHTML = `
        <i data-lucide="copy"></i>
        <span>${item.productCode || "-"}</span>
    `;
    copyBtn.addEventListener("click", () =>
        handleCopyCode(item.productCode, copyBtn),
    );
    codeCell.appendChild(copyBtn);
    row.appendChild(codeCell);

    // Supplier Quantity
    const supplierQtyCell = document.createElement("td");
    supplierQtyCell.className = "text-center";
    supplierQtyCell.innerHTML = `<span class="qty-badge">${item.supplierQty || 0}</span>`;
    row.appendChild(supplierQtyCell);

    // Customer Orders
    const customerQtyCell = document.createElement("td");
    customerQtyCell.className = "text-center";
    customerQtyCell.innerHTML = `<span class="qty-badge customer-qty">${item.customerOrders || 0}</span>`;
    row.appendChild(customerQtyCell);

    // Order Codes
    const orderCodesCell = document.createElement("td");
    orderCodesCell.appendChild(createOrderCodesElement(item));
    row.appendChild(orderCodesCell);

    // Actions
    const actionsCell = document.createElement("td");
    actionsCell.className = "text-center";
    actionsCell.appendChild(createActionButtons(item));
    row.appendChild(actionsCell);

    return row;
}

function createOrderCodesElement(item) {
    const container = document.createElement("div");

    if (!item.orderCodes || item.orderCodes.length === 0) {
        const noOrders = document.createElement("div");
        noOrders.className = "no-orders";
        noOrders.textContent = "Chưa có đơn hàng";
        container.appendChild(noOrders);
    } else {
        const orderList = document.createElement("div");
        orderList.className = "order-code-list";

        item.orderCodes.forEach((code) => {
            const orderItem = document.createElement("div");
            orderItem.className = "order-code-item";

            const codeText = document.createElement("span");
            codeText.className = "order-code-text";
            codeText.textContent = code;

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "delete-order-btn";
            deleteBtn.innerHTML = '<i data-lucide="x"></i>';
            deleteBtn.addEventListener("click", () =>
                handleDeleteOrderCode(item.id, code),
            );

            orderItem.appendChild(codeText);
            orderItem.appendChild(deleteBtn);
            orderList.appendChild(orderItem);
        });

        container.appendChild(orderList);
    }

    // Add order button
    const addBtn = document.createElement("button");
    addBtn.className = "add-order-btn";
    addBtn.innerHTML = '<i data-lucide="plus"></i><span>Thêm ĐH</span>';
    addBtn.addEventListener("click", () => openOrderModal(item.id));
    container.appendChild(addBtn);

    return container;
}

function createActionButtons(item) {
    const container = document.createElement("div");
    container.className = "action-buttons";

    // Edit button (Level 1+)
    if (hasPermission(1)) {
        const editBtn = document.createElement("button");
        editBtn.className = "action-btn edit-btn";
        editBtn.innerHTML = '<i data-lucide="edit-2"></i>';
        editBtn.title = "Chỉnh sửa";
        editBtn.addEventListener("click", () => openEditModal(item));
        container.appendChild(editBtn);
    }

    // Delete button (Admin only)
    if (hasPermission(0)) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "action-btn delete-btn";
        deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        deleteBtn.title = "Xóa";
        deleteBtn.addEventListener("click", () => handleDeleteItem(item.id));
        container.appendChild(deleteBtn);
    }

    return container;
}

function handleCopyCode(code, button) {
    copyToClipboard(code);

    // Visual feedback
    button.classList.add("copied");
    const icon = button.querySelector("i");
    if (icon) {
        icon.setAttribute("data-lucide", "check");
        initIcons();
    }

    setTimeout(() => {
        button.classList.remove("copied");
        if (icon) {
            icon.setAttribute("data-lucide", "copy");
            initIcons();
        }
    }, 2000);
}

async function handleDeleteItem(itemId) {
    if (!hasPermission(0)) {
        showNotification("Không có quyền xóa", "error");
        return;
    }

    if (!confirm("Bạn có chắc muốn xóa sản phẩm này?")) {
        return;
    }

    try {
        showNotification("Đang xóa...", "info");

        // Delete from Firebase
        if (window.isFirebaseInitialized()) {
            await window.firebaseService.deleteItem(itemId);
        } else {
            // Fallback to local delete
            const inventory = window.inventoryData || [];
            const updatedInventory = inventory.filter(
                (item) => item.id !== itemId,
            );
            window.inventoryData = updatedInventory;
            setCachedData(updatedInventory);
        }

        logAction("delete", "Xóa sản phẩm");

        if (!window.isFirebaseInitialized()) {
            applyFilters();
            renderOrderStatistics();
        }

        showNotification("Đã xóa sản phẩm!", "success");
    } catch (error) {
        console.error("Error deleting item:", error);
        showNotification("Lỗi xóa sản phẩm: " + error.message, "error");
    }
}

async function handleDeleteOrderCode(itemId, orderCode) {
    if (!confirm(`Bạn có chắc muốn xóa mã đơn hàng "${orderCode}"?`)) {
        return;
    }

    try {
        showNotification("Đang xóa...", "info");

        // Delete from Firebase
        if (window.isFirebaseInitialized()) {
            await window.firebaseService.removeOrderCode(itemId, orderCode);
        } else {
            // Fallback to local delete
            const inventory = window.inventoryData || [];
            const updatedInventory = inventory.map((item) => {
                if (item.id === itemId) {
                    const newOrderCodes = item.orderCodes.filter(
                        (code) => code !== orderCode,
                    );
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
        }

        logAction("delete_order_code", `Xóa mã đơn hàng: ${orderCode}`);

        if (!window.isFirebaseInitialized()) {
            applyFilters();
            renderOrderStatistics();
        }

        showNotification("Đã xóa mã đơn hàng!", "success");
    } catch (error) {
        console.error("Error deleting order code:", error);
        showNotification("Lỗi xóa mã đơn hàng: " + error.message, "error");
    }
}

// Export functions
window.renderTable = renderTable;
window.createTableRow = createTableRow;
window.handleCopyCode = handleCopyCode;
window.handleDeleteItem = handleDeleteItem;
window.handleDeleteOrderCode = handleDeleteOrderCode;
