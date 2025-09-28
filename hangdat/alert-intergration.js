// =====================================================
// INTEGRATION SCRIPT - Cập nhật các hàm hiện có
// =====================================================

// Override các hàm trong order-crud.js để sử dụng hệ thống mới
(function () {
    "use strict";

    console.log("Integrating enhanced alert system...");

    // Wait for DOM to be ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeEnhancedSystem);
    } else {
        initializeEnhancedSystem();
    }

    function initializeEnhancedSystem() {
        // Override submitOrder function
        if (typeof submitOrder !== "undefined") {
            const originalSubmitOrder = submitOrder;
            window.submitOrder = async function () {
                if (!checkUILock()) return;

                try {
                    const auth = getAuthState();
                    if (!auth || auth.checkLogin == "777") {
                        showError("Không có quyền thêm đơn hàng");
                        return;
                    }

                    showLoading("Đang xử lý đơn hàng...");

                    // Disable submit button
                    const submitBtn = document.getElementById("submitOrderBtn");
                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.textContent = "Đang xử lý...";
                    }

                    // Call original function logic
                    const formData = collectFormData();

                    showLoading("Đang tạo đơn hàng...");

                    // Create orders for each product with shared data
                    const orders = formData.products.map((product) => ({
                        id: generateUniqueID(),
                        ngayDatHang: formData.sharedData.ngayDatHang,
                        nhaCungCap: formData.sharedData.nhaCungCap,
                        hoaDon: formData.sharedData.hoaDon,
                        ...product,
                        thoiGianUpload: getFormattedDateTime(),
                        user: getUserName(),
                        thucNhan: 0,
                        tongNhan: 0,
                    }));

                    showLoading("Đang tải ảnh lên Firebase...");
                    await processImagesOptimized(orders, formData.sharedData);

                    showLoading("Đang lưu vào cơ sở dữ liệu...");
                    await uploadOrdersBatch(orders);

                    showSuccess("Thêm đơn hàng thành công!");

                    // Clear form and reload data
                    clearForm();

                    // RELOAD TABLE: Force refresh display
                    invalidateCache();
                    await displayOrderData();
                } catch (error) {
                    console.error("Error submitting order:", error);
                    showError("Lỗi: " + error.message);
                } finally {
                    // Re-enable submit button
                    const submitBtn = document.getElementById("submitOrderBtn");
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = "Thêm đơn hàng";
                    }
                }
            };
        }

        // Override deleteOrderByID function
        if (typeof deleteOrderByID !== "undefined") {
            const originalDeleteOrderByID = deleteOrderByID;
            window.deleteOrderByID = async function (event) {
                if (!checkUILock()) return;

                try {
                    const auth = getAuthState();
                    if (!auth || auth.checkLogin == "777") {
                        showError("Không đủ quyền thực hiện chức năng này.");
                        return;
                    }

                    const button = event.currentTarget;
                    const orderId = button.getAttribute("data-order-id");
                    const orderInfo = button.getAttribute("data-order-info");

                    if (!orderId) {
                        showError("Không tìm thấy ID đơn hàng!");
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

                    showLoading("Đang xóa đơn hàng...");

                    const doc = await collectionRef.doc("dathang").get();

                    if (!doc.exists) {
                        throw new Error("Không tìm thấy tài liệu 'dathang'");
                    }

                    const data = doc.data();
                    if (!Array.isArray(data.data)) {
                        throw new Error("Dữ liệu không hợp lệ trong Firestore");
                    }

                    // Find and delete by ID
                    const index = data.data.findIndex(
                        (item) => item.id === orderId,
                    );

                    if (index === -1) {
                        throw new Error(
                            `Không tìm thấy đơn hàng với ID: ${orderId}`,
                        );
                    }

                    // Remove item by index
                    data.data.splice(index, 1);

                    await collectionRef
                        .doc("dathang")
                        .update({ data: data.data });

                    // Log action
                    logAction(
                        "delete",
                        `Xóa đơn hàng "${orderInfo}" - ID: ${orderId}`,
                        oldOrderData,
                        null,
                    );

                    // Invalidate cache
                    invalidateCache();

                    showSuccess("Đã xóa thành công!");

                    // Remove row
                    if (row) row.remove();
                } catch (error) {
                    console.error("Lỗi khi xóa:", error);
                    showError("Lỗi khi xóa: " + error.message);
                }
            };
        }

        // Override updateOrderByID function
        if (typeof updateOrderByID !== "undefined") {
            const originalUpdateOrderByID = updateOrderByID;
            window.updateOrderByID = async function (event) {
                if (!checkUILock()) return;

                try {
                    const auth = getAuthState();
                    if (!auth || auth.checkLogin == "777") {
                        showError("Không đủ quyền thực hiện chức năng này.");
                        event.target.value = event.target.defaultValue;
                        return;
                    }

                    const input = event.target;
                    const orderId = input.getAttribute("data-order-id");
                    const newValue =
                        input.type === "number"
                            ? parseFloat(input.value)
                            : input.value;
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
                        showError("Không tìm thấy ID đơn hàng!");
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
                        showError("Số lượng phải lớn hơn 0");
                        input.value = oldValue;
                        return;
                    }

                    if (
                        (fieldName === "giaMua" || fieldName === "giaBan") &&
                        newValue < 0
                    ) {
                        showError(
                            `${fieldName === "giaMua" ? "Giá mua" : "Giá bán"} phải lớn hơn hoặc bằng 0`,
                        );
                        input.value = oldValue;
                        return;
                    }

                    showLoading("Đang cập nhật...");

                    const oldData = { id: orderId, [fieldName]: oldValue };
                    const newData = { id: orderId, [fieldName]: newValue };

                    const doc = await collectionRef.doc("dathang").get();

                    if (!doc.exists) {
                        throw new Error("Không tìm thấy tài liệu");
                    }

                    const data = doc.data();
                    if (!Array.isArray(data.data)) {
                        throw new Error("Dữ liệu không hợp lệ");
                    }

                    // Find and update by ID
                    const index = data.data.findIndex(
                        (item) => item.id === orderId,
                    );

                    if (index === -1) {
                        throw new Error(
                            `Không tìm thấy đơn hàng với ID: ${orderId}`,
                        );
                    }

                    data.data[index][fieldName] = newValue;

                    await collectionRef
                        .doc("dathang")
                        .update({ data: data.data });

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

                    showSuccess("Cập nhật thành công!");
                } catch (error) {
                    console.error("Lỗi khi cập nhật:", error);
                    showError("Lỗi khi cập nhật: " + error.message);
                    input.value = oldValue; // Restore old value
                }
            };
        }

        // Override displayOrderData function
        if (typeof displayOrderData !== "undefined") {
            const originalDisplayOrderData = displayOrderData;
            window.displayOrderData = async function (forceReload = false) {
                try {
                    const cachedData = getCachedData();
                    if (cachedData && !forceReload) {
                        showLoading("Sử dụng dữ liệu cache...");
                        const sortedCacheData = sortDataByNewest(cachedData);
                        renderDataToTable(sortedCacheData);
                        updateSuggestions(sortedCacheData);
                        showSuccess("Tải dữ liệu từ cache hoàn tất!");
                        return;
                    }

                    showLoading("Đang tải dữ liệu từ server...");

                    const doc = await collectionRef.doc("dathang").get();
                    if (doc.exists) {
                        const data = doc.data();
                        if (data && Array.isArray(data.data)) {
                            // Migrate old price data
                            const migratedData = migrateOldPriceData(data.data);
                            const sortedData = sortDataByNewest(migratedData);

                            renderDataToTable(sortedData);
                            updateSuggestions(sortedData);
                            preloadImagesAndCache(sortedData);

                            // Update UI indicators
                            updateDataCountIndicator(sortedData.length);
                        }
                    }

                    showSuccess("Tải dữ liệu hoàn tất!");
                } catch (error) {
                    console.error("Error loading data:", error);
                    showError("Lỗi khi tải dữ liệu!");
                }
            };
        }

        // Override deleteByFilter function
        if (typeof deleteByFilter !== "undefined") {
            const originalDeleteByFilter = deleteByFilter;
            window.deleteByFilter = async function () {
                if (!checkUILock()) return;

                try {
                    const auth = getAuthState();
                    if (!auth || auth.checkLogin == "777") {
                        showError("Không có quyền xóa đơn hàng");
                        return;
                    }

                    const cachedData = getCachedData();
                    if (!cachedData) {
                        showError("Không có dữ liệu để xóa");
                        return;
                    }

                    const filteredData = applyFiltersToData(cachedData);
                    const unfilteredData = cachedData.filter(
                        (item) => !filteredData.includes(item),
                    );

                    if (filteredData.length === 0) {
                        showError("Không có đơn hàng nào phù hợp với bộ lọc");
                        return;
                    }

                    if (filteredData.length === cachedData.length) {
                        showError(
                            "Không thể xóa tất cả dữ liệu. Vui lòng áp dụng bộ lọc trước",
                        );
                        return;
                    }

                    // Get filter description for confirmation
                    const filterDescription = getFilterDescription();
                    const confirmMessage = `Bạn có chắc chắn muốn xóa ${filteredData.length} đơn hàng theo bộ lọc?\n\nBộ lọc: ${filterDescription}\n\nHành động này không thể hoàn tác!`;

                    const confirmDelete = confirm(confirmMessage);
                    if (!confirmDelete) return;

                    showLoading(`Đang xóa ${filteredData.length} đơn hàng...`);

                    // Update database with remaining data
                    await collectionRef.doc("dathang").update({
                        data: unfilteredData,
                    });

                    // Log the mass deletion
                    logAction(
                        "bulk_delete",
                        `Xóa hàng loạt ${filteredData.length} đơn hàng theo bộ lọc: ${filterDescription}`,
                        {
                            deletedCount: filteredData.length,
                            filter: filterDescription,
                        },
                        { remainingCount: unfilteredData.length },
                    );

                    // Clear cache and reload data
                    invalidateCache();
                    await displayOrderData(true);

                    // Clear filters after deletion
                    clearFilters();

                    showSuccess(
                        `Đã xóa thành công ${filteredData.length} đơn hàng!`,
                    );
                } catch (error) {
                    console.error("Error deleting filtered data:", error);
                    showError("Lỗi khi xóa dữ liệu: " + error.message);
                }
            };
        }

        // Override exportToExcel function
        if (typeof exportToExcel !== "undefined") {
            const originalExportToExcel = exportToExcel;
            window.exportToExcel = function () {
                if (!checkUILock()) return;

                try {
                    const cachedData = getCachedData();
                    if (!cachedData || cachedData.length === 0) {
                        showError("Không có dữ liệu để xuất");
                        return;
                    }

                    showLoading("Đang tạo file Excel...");

                    const filteredData = applyFiltersToData(cachedData);

                    const excelData = filteredData.map((order) => ({
                        "Loại sản phẩm": "Có thể lưu trữ",
                        "Mã sản phẩm": order.maSanPham?.toString() || "",
                        "Mã chốt đơn": "",
                        "Tên sản phẩm": order.tenSanPham?.toString() || "",
                        "Giá bán": (order.giaBan || 0) * 1000,
                        "Giá mua": (order.giaMua || order.giaNhap || 0) * 1000,
                        "Đơn vị": "CÁI",
                        "Nhóm sản phẩm": "QUẦN ÁO",
                        "Mã vạch": order.maSanPham?.toString() || "",
                        "Khối lượng": "",
                        "Chiết khấu bán": "",
                        "Chiết khấu mua": "",
                        "Tồn kho": "",
                        "Giá vốn": "",
                        "Ghi chú": order.ghiChu || "",
                        "Cho phép bán ở công ty khác": "FALSE",
                        "Thuộc tính": "",
                    }));

                    const ws = XLSX.utils.json_to_sheet(excelData);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Đặt Hàng");

                    const fileName = `DatHang_${new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")}.xlsx`;
                    XLSX.writeFile(wb, fileName);

                    showSuccess("Xuất Excel thành công!");
                } catch (error) {
                    console.error("Error exporting Excel:", error);
                    showError("Lỗi khi xuất Excel!");
                }
            };
        }

        // Override applyFilters function
        if (typeof applyFilters !== "undefined") {
            const originalApplyFilters = applyFilters;
            window.applyFilters = function () {
                if (isFilteringInProgress) return;

                try {
                    isFilteringInProgress = true;
                    showLoading("Đang lọc dữ liệu...");

                    setTimeout(() => {
                        try {
                            const cachedData = getCachedData();
                            if (cachedData) {
                                const filteredData =
                                    applyFiltersToData(cachedData);
                                renderDataToTable(cachedData);
                                updateSuggestions(cachedData);
                                updateFilterResultsCount(
                                    filteredData,
                                    cachedData,
                                );
                            } else {
                                displayOrderData();
                            }
                            showSuccess("Lọc dữ liệu hoàn tất!");
                        } catch (error) {
                            console.error("Error during filtering:", error);
                            showError("Có lỗi xảy ra khi lọc dữ liệu");
                        } finally {
                            isFilteringInProgress = false;
                        }
                    }, 100);
                } catch (error) {
                    console.error("Error in applyFilters:", error);
                    showError("Lỗi khi áp dụng bộ lọc");
                    isFilteringInProgress = false;
                }
            };
        }

        console.log("Enhanced alert system integration completed");
    }

    // Add enhanced event listeners for form interactions
    function addEnhancedEventListeners() {
        // Form submission enhancement
        const forms = document.querySelectorAll("form");
        forms.forEach((form) => {
            form.addEventListener("submit", function (e) {
                if (isUILocked) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.warn("Form submission blocked - UI is locked");
                }
            });
        });

        // Button click enhancement
        document.addEventListener("click", function (e) {
            if (isUILocked && e.target.tagName === "BUTTON") {
                if (!e.target.classList.contains("allow-when-locked")) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.warn("Button click blocked - UI is locked");
                }
            }
        });

        // Input change enhancement
        document.addEventListener("change", function (e) {
            if (
                isUILocked &&
                (e.target.tagName === "INPUT" ||
                    e.target.tagName === "SELECT" ||
                    e.target.tagName === "TEXTAREA")
            ) {
                e.preventDefault();
                e.stopPropagation();
                console.warn("Input change blocked - UI is locked");
            }
        });
    }

    // Initialize enhanced event listeners
    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            addEnhancedEventListeners,
        );
    } else {
        addEnhancedEventListeners();
    }

    // Add window beforeunload protection when UI is locked
    window.addEventListener("beforeunload", function (e) {
        if (isUILocked) {
            e.preventDefault();
            e.returnValue =
                "Đang xử lý dữ liệu. Bạn có chắc muốn rời khỏi trang?";
            return e.returnValue;
        }
    });
})();

console.log("Integration script loaded successfully");
