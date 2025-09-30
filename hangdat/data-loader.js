// =====================================================
// DATA LOADING AND PROCESSING - UPDATED FOR FIREBASE STRUCTURE
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
                '<tr><td colspan="11" style="text-align: center; padding: 40px; color: #6c757d;">Chưa có dữ liệu để hiển thị</td></tr>';
            return;
        }

        // Transform data to inventory format with proper image field mapping
        const inventoryData = transformOrderDataToInventory(orderData);

        // Sort by upload time (newest first)
        const sortedData = inventoryData.sort((a, b) => {
            const dateA = parseVietnameseDate(a.thoiGianUpload);
            const dateB = parseVietnameseDate(b.thoiGianUpload);
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

        // Debug log to verify data structure
        console.log("Sample loaded data:", sortedData[0]);
        console.log("Image fields check:", {
            anhHoaDon: sortedData[0]?.anhHoaDon,
            anhSanPham: sortedData[0]?.anhSanPham,
            anhGiaMua: sortedData[0]?.anhGiaMua,
        });
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
            // Basic product info
            id: order.id || generateUniqueID(),
            ngayDatHang: order.ngayDatHang,
            ngayNhan: order.thoiGianUpload,
            nhaCungCap: order.nhaCungCap,
            hoaDon: order.hoaDon,
            maSanPham: order.maSanPham || "",
            tenSanPham: order.tenSanPham || "",
            bienThe: order.bienThe || "",
            soLuong: order.soLuong || 0,
            giaMua: order.giaMua || 0,
            giaBan: order.giaBan || 0,
            ghiChu: order.ghiChu || "",

            // Image fields - directly map from Firebase structure
            anhHoaDon: order.anhHoaDon || null,
            anhSanPham: order.anhSanPham || null,
            anhGiaMua: order.anhGiaMua || null,

            // Receiving quantities (for future use)
            thucNhan: order.thucNhan || 0,
            tongNhan: order.tongNhan || 0,

            // Metadata
            thoiGianUpload: order.thoiGianUpload,
            user: order.user || getUserName(),
            lastUpdated:
                order.lastUpdated ||
                order.thoiGianUpload ||
                getFormattedDateTime(),
            updatedBy: order.updatedBy || order.user || getUserName(),
            originalOrderId: order.id,
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

console.log(
    "Updated data loader system loaded with proper Firebase structure mapping",
);
