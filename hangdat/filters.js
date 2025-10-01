// =====================================================
// ENHANCED FILTERING SYSTEM WITH QUICK DATE FILTERS
// =====================================================

let isFilteringInProgress = false;

function applyFiltersToInventory(dataArray) {
    const quickFilter =
        document.getElementById("quickDateFilter")?.value || "all";
    const dateFrom = document.getElementById("dateFromFilter")?.value || "";
    const dateTo = document.getElementById("dateToFilter")?.value || "";
    const filterProductText =
        document.getElementById("filterProduct")?.value.toLowerCase().trim() ||
        "";

    return dataArray.filter((item) => {
        // Quick date filter
        let matchDate = true;

        if (quickFilter !== "all") {
            const itemDate =
                parseVietnameseDate(item.ngayNhan) ||
                parseVietnameseDate(item.ngayDatHang);

            if (itemDate) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                let startDate = new Date(today);
                let endDate = new Date(today);
                endDate.setHours(23, 59, 59, 999);

                switch (quickFilter) {
                    case "today":
                        // Already set to today
                        break;

                    case "yesterday":
                        startDate.setDate(today.getDate() - 1);
                        endDate = new Date(startDate);
                        endDate.setHours(23, 59, 59, 999);
                        break;

                    case "last7days":
                        startDate.setDate(today.getDate() - 6);
                        break;

                    case "last30days":
                        startDate.setDate(today.getDate() - 29);
                        break;

                    case "thisMonth":
                        startDate = new Date(
                            today.getFullYear(),
                            today.getMonth(),
                            1,
                        );
                        endDate = new Date(
                            today.getFullYear(),
                            today.getMonth() + 1,
                            0,
                        );
                        endDate.setHours(23, 59, 59, 999);
                        break;

                    case "lastMonth":
                        startDate = new Date(
                            today.getFullYear(),
                            today.getMonth() - 1,
                            1,
                        );
                        endDate = new Date(
                            today.getFullYear(),
                            today.getMonth(),
                            0,
                        );
                        endDate.setHours(23, 59, 59, 999);
                        break;
                }

                const itemDateOnly = new Date(itemDate);
                itemDateOnly.setHours(0, 0, 0, 0);

                matchDate =
                    itemDateOnly >= startDate && itemDateOnly <= endDate;
            } else {
                matchDate = false;
            }
        }

        // Custom date range filter (overrides quick filter if set)
        if (dateFrom || dateTo) {
            const itemDate =
                parseVietnameseDate(item.ngayNhan) ||
                parseVietnameseDate(item.ngayDatHang);
            if (itemDate) {
                if (dateFrom) {
                    const fromDate = new Date(dateFrom);
                    const itemDateOnly = new Date(
                        itemDate.getFullYear(),
                        itemDate.getMonth(),
                        itemDate.getDate(),
                    );
                    const fromDateOnly = new Date(
                        fromDate.getFullYear(),
                        fromDate.getMonth(),
                        fromDate.getDate(),
                    );
                    if (itemDateOnly < fromDateOnly) {
                        matchDate = false;
                    }
                }
                if (dateTo && matchDate) {
                    const toDate = new Date(dateTo);
                    const itemDateOnly = new Date(
                        itemDate.getFullYear(),
                        itemDate.getMonth(),
                        itemDate.getDate(),
                    );
                    const toDateOnly = new Date(
                        toDate.getFullYear(),
                        toDate.getMonth(),
                        toDate.getDate(),
                    );
                    if (itemDateOnly > toDateOnly) {
                        matchDate = false;
                    }
                }
            }
        }

        // Enhanced product filter - search across ALL text fields
        let matchProduct = true;
        if (filterProductText) {
            const searchableFields = [
                item.tenSanPham,
                item.maSanPham,
                item.bienThe,
                item.nhaCungCap,
                item.hoaDon,
                item.ghiChu,
                item.ngayDatHang,
                item.soLuong?.toString(),
                item.giaMua?.toString(),
                item.giaBan?.toString(),
            ];

            // Check if ANY field contains the search text
            matchProduct = searchableFields.some((field) => {
                if (!field) return false;
                return field
                    .toString()
                    .toLowerCase()
                    .includes(filterProductText);
            });
        }

        return matchDate && matchProduct;
    });
}

function updateFilterOptions(fullDataArray) {
    // No longer needed for supplier dropdown
    // Can be kept empty or removed
}

// FIXED: Use Utils.debounce instead of debounce
const debouncedApplyFilters = Utils.debounce(() => {
    if (isFilteringInProgress) return;
    isFilteringInProgress = true;

    const notifId = notifyManager.processing("Đang lọc dữ liệu...");

    setTimeout(() => {
        try {
            const cachedData = getCachedData();
            if (cachedData) {
                renderInventoryTable(cachedData);
            } else {
                loadInventoryData();
            }
            notifyManager.remove(notifId);
            notifyManager.success("Lọc dữ liệu hoàn tất!", 1500);
        } catch (error) {
            console.error("Error during filtering:", error);
            notifyManager.remove(notifId);
            notifyManager.error("Có lỗi xảy ra khi lọc dữ liệu");
        } finally {
            isFilteringInProgress = false;
        }
    }, 100);
}, APP_CONFIG.FILTER_DEBOUNCE_DELAY);

function applyFilters() {
    debouncedApplyFilters();
}

function initializeFilterEvents() {
    const quickDateFilter = document.getElementById("quickDateFilter");
    const dateFromFilter = document.getElementById("dateFromFilter");
    const dateToFilter = document.getElementById("dateToFilter");
    const filterProductInput = document.getElementById("filterProduct");

    if (quickDateFilter) {
        quickDateFilter.addEventListener("change", () => {
            // Clear custom date range when using quick filter
            if (
                quickDateFilter.value !== "all" &&
                quickDateFilter.value !== "custom"
            ) {
                if (dateFromFilter) dateFromFilter.value = "";
                if (dateToFilter) dateToFilter.value = "";
            }
            applyFilters();
        });
    }

    if (dateFromFilter) {
        dateFromFilter.addEventListener("change", () => {
            // Set quick filter to "custom" when using date range
            if (quickDateFilter && dateFromFilter.value) {
                quickDateFilter.value = "custom";
            }
            applyFilters();
        });
    }

    if (dateToFilter) {
        dateToFilter.addEventListener("change", () => {
            // Set quick filter to "custom" when using date range
            if (quickDateFilter && dateToFilter.value) {
                quickDateFilter.value = "custom";
            }
            applyFilters();
        });
    }

    if (filterProductInput) {
        // FIXED: Use Utils.debounce
        filterProductInput.addEventListener(
            "input",
            Utils.debounce(applyFilters, 300),
        );
    }
}

console.log("Enhanced filters system with quick date filters loaded");
