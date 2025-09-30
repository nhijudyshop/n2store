// =====================================================
// FILTERING SYSTEM
// =====================================================

let isFilteringInProgress = false;

function applyFiltersToInventory(dataArray) {
    const filterSupplier =
        document.getElementById("filterSupplier")?.value || "all";
    const dateFrom = document.getElementById("dateFromFilter")?.value || "";
    const dateTo = document.getElementById("dateToFilter")?.value || "";
    const filterProductText =
        document.getElementById("filterProduct")?.value.toLowerCase().trim() ||
        "";

    return dataArray.filter((item) => {
        // Supplier filter
        const matchSupplier =
            filterSupplier === "all" || item.nhaCungCap === filterSupplier;

        // Date range filter
        let matchDate = true;
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

        // Product filter
        const matchProduct =
            !filterProductText ||
            (item.tenSanPham &&
                item.tenSanPham.toLowerCase().includes(filterProductText)) ||
            (item.maSanPham &&
                item.maSanPham.toLowerCase().includes(filterProductText));

        return matchSupplier && matchDate && matchProduct;
    });
}

function updateFilterOptions(fullDataArray) {
    const filterSupplierSelect = document.getElementById("filterSupplier");
    if (!filterSupplierSelect) return;

    const suppliers = [
        ...new Set(
            fullDataArray
                .map((item) => item.nhaCungCap)
                .filter((supplier) => supplier),
        ),
    ];

    const currentSelectedValue = filterSupplierSelect.value;

    // Clear existing options except "Tất cả"
    while (filterSupplierSelect.children.length > 1) {
        filterSupplierSelect.removeChild(filterSupplierSelect.lastChild);
    }

    // Add supplier options
    suppliers.forEach((supplier) => {
        const option = document.createElement("option");
        option.value = supplier;
        option.textContent = supplier;
        filterSupplierSelect.appendChild(option);
    });

    // Restore selected value if it still exists
    if (
        currentSelectedValue &&
        currentSelectedValue !== "all" &&
        suppliers.includes(currentSelectedValue)
    ) {
        filterSupplierSelect.value = currentSelectedValue;
    }
}

const debouncedApplyFilters = debounce(() => {
    if (isFilteringInProgress) return;
    isFilteringInProgress = true;
    showFloatingAlert("Đang lọc dữ liệu...", true);

    setTimeout(() => {
        try {
            const cachedData = getCachedData();
            if (cachedData) {
                renderInventoryTable(cachedData);
            } else {
                loadInventoryData();
            }
            hideFloatingAlert();
            showFloatingAlert("Lọc dữ liệu hoàn tất!", false, 1000);
        } catch (error) {
            console.error("Error during filtering:", error);
            hideFloatingAlert();
            showFloatingAlert("Có lỗi xảy ra khi lọc dữ liệu", false, 3000);
        } finally {
            isFilteringInProgress = false;
        }
    }, 100);
}, APP_CONFIG.FILTER_DEBOUNCE_DELAY);

function applyFilters() {
    debouncedApplyFilters();
}

function initializeFilterEvents() {
    const filterSupplierSelect = document.getElementById("filterSupplier");
    const dateFromFilter = document.getElementById("dateFromFilter");
    const dateToFilter = document.getElementById("dateToFilter");
    const filterProductInput = document.getElementById("filterProduct");

    if (filterSupplierSelect) {
        filterSupplierSelect.addEventListener("change", applyFilters);
    }
    if (dateFromFilter) {
        dateFromFilter.addEventListener("change", applyFilters);
    }
    if (dateToFilter) {
        dateToFilter.addEventListener("change", applyFilters);
    }
    if (filterProductInput) {
        filterProductInput.addEventListener(
            "input",
            debounce(applyFilters, 300),
        );
    }
}

console.log("Filters system loaded");
