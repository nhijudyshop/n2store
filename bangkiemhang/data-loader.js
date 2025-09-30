// =====================================================
// DATA LOADING AND PROCESSING
// =====================================================

async function loadInventoryData() {
    const cachedData = getCachedData();
    if (cachedData) {
        showFloatingAlert("Sử dụng dữ liệu cache...", true);
        globalState.inventoryData = cachedData;
        renderInventoryTable(cachedData);
        updateFilterOptions(cachedData);
        hideFloatingAlert();
        showFloatingAlert("Tải dữ liệu từ cache hoàn tất!", false, 2000);
        return;
    }

    showFloatingAlert("Đang tải dữ liệu đặt hàng từ Firebase...", true);

    try {
        const doc = await collectionRef.doc("dathang").get();
        let orderData = [];

        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                orderData = data.data;
                console.log(`Loaded ${orderData.length} orders from Firebase`);
            } else {
                console.warn("No data array found in dathang document");
                showFloatingAlert(
                    "Không tìm thấy dữ liệu đặt hàng!",
                    false,
                    3000,
                );
                return;
            }
        } else {
            console.warn("dathang document does not exist");
            showFloatingAlert(
                "Không tìm thấy collection dathang!",
                false,
                3000,
            );
            return;
        }

        if (orderData.length === 0) {
            showFloatingAlert("Chưa có dữ liệu đặt hàng nào!", false, 3000);
            const tbody = document.getElementById("orderTableBody");
            tbody.innerHTML =
                '<tr><td colspan="9" style="text-align: center; padding: 40px; color: #6c757d;">Chưa có dữ liệu để hiển thị</td></tr>';
            return;
        }

        const inventoryData = transformOrderDataToInventory(orderData);
        const sortedData = inventoryData.sort((a, b) => {
            const dateA = parseVietnameseDate(a.ngayNhan);
            const dateB = parseVietnameseDate(b.ngayNhan);
            if (dateA && dateB) {
                return dateB - dateA;
            }
            return 0;
        });

        globalState.inventoryData = sortedData;
        renderInventoryTable(sortedData);
        updateFilterOptions(sortedData);
        setCachedData(sortedData);

        hideFloatingAlert();
        showFloatingAlert("Tải dữ liệu hoàn tất!", false, 2000);
    } catch (error) {
        console.error("Error loading inventory data:", error);
        hideFloatingAlert();
        showFloatingAlert("Lỗi khi tải dữ liệu: " + error.message, false, 3000);
    }
}

function transformOrderDataToInventory(orderData) {
    if (!Array.isArray(orderData)) return [];

    return orderData
        .filter((order) => order.maSanPham || order.tenSanPham)
        .map((order) => ({
            id: order.id || generateUniqueID(),
            ngayDatHang: order.ngayDatHang,
            ngayNhan: order.thoiGianUpload,
            nhaCungCap: order.nhaCungCap,
            maSanPham: order.maSanPham || "",
            tenSanPham: order.tenSanPham || "",
            soLuong: order.soLuong || 0,
            thucNhan: order.thucNhan || 0,
            tongNhan: order.tongNhan || 0,
            originalOrderId: order.id,
            lastUpdated: order.lastUpdated || getFormattedDateTime(),
            updatedBy: order.updatedBy || getUserName(),
            inventoryUpdated: order.inventoryUpdated || false,
        }));
}

async function refreshInventoryData() {
    try {
        showFloatingAlert("Đang làm mới dữ liệu...", true);
        invalidateCache();
        await loadInventoryData();
        hideFloatingAlert();
        showFloatingAlert("Làm mới dữ liệu thành công!", false, 2000);
    } catch (error) {
        console.error("Error refreshing inventory data:", error);
        hideFloatingAlert();
        showFloatingAlert("Lỗi khi làm mới dữ liệu!", false, 3000);
    }
}

console.log("Data loader system loaded");
