// Order Management System - CRUD Operations
// Create, Read, Update, Delete operations for orders

// =====================================================
// CRUD OPERATIONS
// =====================================================

// UPLOAD TO FIRESTORE WITH ID
async function uploadToFirestore(orderData) {
    try {
        const doc = await collectionRef.doc("dathang").get();

        if (doc.exists) {
            await collectionRef.doc("dathang").update({
                data: firebase.firestore.FieldValue.arrayUnion(orderData),
            });
        } else {
            await collectionRef.doc("dathang").set({
                data: firebase.firestore.FieldValue.arrayUnion(orderData),
            });
        }

        // Log action with ID
        logAction(
            "add",
            `Thêm đơn hàng mới "${orderData.tenSanPham}" - Hóa đơn: ${orderData.hoaDon} - ID: ${orderData.id}`,
            null,
            orderData,
        );

        // Invalidate cache
        invalidateCache();

        console.log("Document với ID tải lên thành công:", orderData.id);
        return true;
    } catch (error) {
        console.error("Lỗi khi tải document lên: ", error);
        throw error;
    }
}

// DELETE ORDER BY ID
async function deleteOrderByID(event) {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        showFloatingAlert(
            "Không đủ quyền thực hiện chức năng này.",
            false,
            3000,
        );
        return;
    }

    const button = event.currentTarget;
    const orderId = button.getAttribute("data-order-id");
    const orderInfo = button.getAttribute("data-order-info");

    if (!orderId) {
        showFloatingAlert("Không tìm thấy ID đơn hàng!", false, 3000);
        return;
    }

    const confirmDelete = confirm(
        `Bạn có chắc chắn muốn xóa đơn hàng "${orderInfo}"?\nID: ${orderId}`,
    );
    if (!confirmDelete) return;

    const row = button.closest("tr");

    // Get old data for logging
    const oldOrderData = {
        id: orderId,
        info: orderInfo,
        ngayDatHang: row.cells[0].textContent,
        nhaCungCap: row.cells[1].textContent,
        hoaDon: row.cells[2].textContent,
        tenSanPham: row.cells[3].textContent,
    };

    showFloatingAlert("Đang xóa...", true);

    try {
        const doc = await collectionRef.doc("dathang").get();

        if (!doc.exists) {
            throw new Error("Không tìm thấy tài liệu 'dathang'");
        }

        const data = doc.data();
        if (!Array.isArray(data.data)) {
            throw new Error("Dữ liệu không hợp lệ trong Firestore");
        }

        // Find and delete by ID
        const index = data.data.findIndex((item) => item.id === orderId);

        if (index === -1) {
            throw new Error(`Không tìm thấy đơn hàng với ID: ${orderId}`);
        }

        // Remove item by index
        data.data.splice(index, 1);

        await collectionRef.doc("dathang").update({ data: data.data });

        // Log action
        logAction(
            "delete",
            `Xóa đơn hàng "${orderInfo}" - ID: ${orderId}`,
            oldOrderData,
            null,
        );

        // Invalidate cache
        invalidateCache();

        hideFloatingAlert();
        showFloatingAlert("Đã xóa thành công!", false, 2000);

        // Remove row
        if (row) row.remove();
    } catch (error) {
        hideFloatingAlert();
        console.error("Lỗi khi xoá:", error);
        showFloatingAlert("Lỗi khi xoá: " + error.message, false, 3000);
    }
}

// UPDATE ORDER BY ID
async function updateOrderByID(event) {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        showFloatingAlert(
            "Không đủ quyền thực hiện chức năng này.",
            false,
            3000,
        );
        event.target.value = event.target.defaultValue;
        return;
    }

    const input = event.target;
    const orderId = input.getAttribute("data-order-id");
    const newValue =
        input.type === "number" ? parseFloat(input.value) : input.value;
    const oldValue =
        input.type === "number"
            ? parseFloat(input.defaultValue)
            : input.defaultValue;

    // Determine field name
    let fieldName;
    if (input.className.includes("quantity")) {
        fieldName = "soLuong";
    } else if (input.className.includes("price-buy")) {
        fieldName = "giaMua";
    } else if (input.className.includes("price-sell")) {
        fieldName = "giaBan";
    }

    if (!orderId) {
        showFloatingAlert("Không tìm thấy ID đơn hàng!", false, 3000);
        input.value = oldValue;
        return;
    }

    const row = input.closest("tr");
    const orderInfo = `${row.cells[3].textContent} - ${row.cells[2].textContent}`;

    // Confirm change
    if (newValue !== oldValue) {
        let fieldDisplayName;
        if (fieldName === "soLuong") {
            fieldDisplayName = "số lượng";
        } else if (fieldName === "giaMua") {
            fieldDisplayName = "giá mua";
        } else if (fieldName === "giaBan") {
            fieldDisplayName = "giá bán";
        }

        const valueDisplay =
            fieldName === "giaMua" || fieldName === "giaBan"
                ? formatCurrency(newValue)
                : newValue;
        const oldValueDisplay =
            fieldName === "giaMua" || fieldName === "giaBan"
                ? formatCurrency(oldValue)
                : oldValue;

        const confirmMessage = `Bạn có chắc chắn muốn thay đổi ${fieldDisplayName} đơn hàng "${orderInfo}" từ ${oldValueDisplay} thành ${valueDisplay}?\nID: ${orderId}`;

        const confirmUpdate = confirm(confirmMessage);
        if (!confirmUpdate) {
            input.value = oldValue;
            return;
        }
    }

    if (fieldName === "soLuong" && newValue < 1) {
        showFloatingAlert("Số lượng phải lớn hơn 0", false, 3000);
        input.value = oldValue;
        return;
    }

    if ((fieldName === "giaMua" || fieldName === "giaBan") && newValue < 0) {
        showFloatingAlert(
            `${fieldName === "giaMua" ? "Giá mua" : "Giá bán"} phải lớn hơn hoặc bằng 0`,
            false,
            3000,
        );
        input.value = oldValue;
        return;
    }

    showFloatingAlert("Đang cập nhật...", true);

    const oldData = { id: orderId, [fieldName]: oldValue };
    const newData = { id: orderId, [fieldName]: newValue };

    try {
        const doc = await collectionRef.doc("dathang").get();

        if (!doc.exists) {
            throw new Error("Không tìm thấy tài liệu");
        }

        const data = doc.data();
        if (!Array.isArray(data.data)) {
            throw new Error("Dữ liệu không hợp lệ");
        }

        // Find and update by ID
        const index = data.data.findIndex((item) => item.id === orderId);

        if (index === -1) {
            throw new Error(`Không tìm thấy đơn hàng với ID: ${orderId}`);
        }

        data.data[index][fieldName] = newValue;

        await collectionRef.doc("dathang").update({ data: data.data });

        let fieldDisplayName;
        if (fieldName === "soLuong") {
            fieldDisplayName = "số lượng";
        } else if (fieldName === "giaMua") {
            fieldDisplayName = "giá mua";
        } else if (fieldName === "giaBan") {
            fieldDisplayName = "giá bán";
        }

        const valueDisplay =
            fieldName === "giaMua" || fieldName === "giaBan"
                ? formatCurrency(newValue)
                : newValue;
        const oldValueDisplay =
            fieldName === "giaMua" || fieldName === "giaBan"
                ? formatCurrency(oldValue)
                : oldValue;

        // Log action
        logAction(
            "update",
            `Cập nhật ${fieldDisplayName} đơn hàng "${orderInfo}" từ ${oldValueDisplay} thành ${valueDisplay} - ID: ${orderId}`,
            oldData,
            newData,
        );

        // Invalidate cache
        invalidateCache();

        // Update defaultValue for future comparisons
        input.defaultValue = newValue;

        showFloatingAlert("Cập nhật thành công!", false, 2000);
        hideFloatingAlert();
    } catch (error) {
        console.error("Lỗi khi cập nhật:", error);
        showFloatingAlert("Lỗi khi cập nhật: " + error.message, false, 3000);
        input.value = oldValue; // Restore old value
        hideFloatingAlert();
    }
}

// EDIT ORDER BY ID (placeholder for future implementation)
async function editOrderByID(event) {
    const button = event.currentTarget;
    const orderId = button.getAttribute("data-order-id");
    const orderInfo = button.getAttribute("data-order-info");

    showFloatingAlert(
        `Chỉnh sửa đơn hàng: ${orderInfo} (ID: ${orderId})`,
        false,
        2000,
    );
    // TODO: Implement edit functionality
}

// =====================================================
// MIGRATION FUNCTION
// =====================================================

// MIGRATION FUNCTION (Run once only)
async function migrateDataWithIDs() {
    try {
        showFloatingAlert("Đang kiểm tra và migration dữ liệu...", true);

        const doc = await collectionRef.doc("dathang").get();

        if (!doc.exists) {
            console.log("Không có dữ liệu để migrate");
            hideFloatingAlert();
            return;
        }

        const data = doc.data();
        if (!Array.isArray(data.data)) {
            console.log("Dữ liệu không hợp lệ");
            hideFloatingAlert();
            return;
        }

        let hasChanges = false;
        const migratedData = data.data.map((item) => {
            // Only add ID if not present
            if (!item.id) {
                hasChanges = true;
                return {
                    ...item,
                    id: generateUniqueID(),
                };
            }
            return item;
        });

        if (hasChanges) {
            // Sort data after migration (newest first)
            const sortedMigratedData = sortDataByNewest(migratedData);

            // Update data with new IDs and sorted
            await collectionRef.doc("dathang").update({
                data: sortedMigratedData,
            });

            // Log migration
            logAction(
                "migration",
                `Migration hoàn tất: Thêm ID cho ${migratedData.filter((item) => item.id).length} đơn hàng và sắp xếp theo thời gian`,
                null,
                null,
            );

            console.log(
                `Migration hoàn tất: Đã thêm ID cho ${migratedData.length} đơn hàng và sắp xếp theo thời gian`,
            );
            showFloatingAlert("Migration hoàn tất!", false, 3000);
        } else {
            // If no ID changes, just sort again
            const sortedData = sortDataByNewest(data.data);

            // Check if order changed
            const orderChanged =
                JSON.stringify(data.data) !== JSON.stringify(sortedData);

            if (orderChanged) {
                await collectionRef.doc("dathang").update({
                    data: sortedData,
                });

                logAction(
                    "sort",
                    "Sắp xếp lại dữ liệu theo thời gian mới nhất",
                    null,
                    null,
                );
                console.log("Đã sắp xếp lại dữ liệu theo thời gian");
                showFloatingAlert(
                    "Đã sắp xếp dữ liệu theo thời gian mới nhất!",
                    false,
                    2000,
                );
            } else {
                console.log("Tất cả dữ liệu đã có ID và đã được sắp xếp đúng");
                showFloatingAlert("Dữ liệu đã có ID đầy đủ", false, 2000);
            }
        }
    } catch (error) {
        console.error("Lỗi trong quá trình migration:", error);
        showFloatingAlert("Lỗi migration: " + error.message, false, 5000);
    }
}

function migrateOldPriceData(dataArray) {
    return dataArray.map((order) => {
        // Nếu có giaNhap nhưng không có giaMua, copy giaNhap sang giaMua
        if (order.giaNhap && !order.giaMua) {
            order.giaMua = order.giaNhap;
        }

        // Nếu có anhGiaNhap nhưng không có anhGiaMua, copy sang anhGiaMua
        if (order.anhGiaNhap && !order.anhGiaMua) {
            order.anhGiaMua = order.anhGiaNhap;
        }

        // Nếu không có giaBan, set default = 0
        if (order.giaBan === undefined) {
            order.giaBan = 0;
        }

        return order;
    });
}

console.log("Order Management System - CRUD Operations loaded");
