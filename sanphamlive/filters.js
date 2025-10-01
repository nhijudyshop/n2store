// js/filters.js - Filter System with Firebase Integration

let currentFilters = {
    startDate: "",
    endDate: "",
};

function initFilters() {
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");
    const todayBtn = document.getElementById("todayBtn");
    const allBtn = document.getElementById("allBtn");
    const clearBtn = document.getElementById("clearBtn");
    const deleteFilteredBtn = document.getElementById("deleteFilteredBtn");

    // Set today as default (Vietnam timezone GMT+7)
    setTodayFilter();

    // Event listeners
    if (startDateInput) {
        startDateInput.addEventListener("change", handleDateChange);
    }

    if (endDateInput) {
        endDateInput.addEventListener("change", handleDateChange);
    }

    if (todayBtn) {
        todayBtn.addEventListener("click", setTodayFilter);
    }

    if (allBtn) {
        allBtn.addEventListener("click", setAllFilter);
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", clearFilters);
    }

    if (deleteFilteredBtn) {
        deleteFilteredBtn.addEventListener("click", handleDeleteFiltered);
    }
}

function handleDateChange() {
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");

    const startValue = startDateInput.value;
    const endValue = endDateInput.value;

    currentFilters.startDate = startValue
        ? formatDateFromInput(startValue)
        : "";
    currentFilters.endDate = endValue ? formatDateFromInput(endValue) : "";

    applyFilters();
}

function setTodayFilter() {
    const today = getTodayVN();
    const todayInput = formatDateForInput(today);

    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");

    if (startDateInput) startDateInput.value = todayInput;
    if (endDateInput) endDateInput.value = todayInput;

    currentFilters.startDate = today;
    currentFilters.endDate = today;

    applyFilters();

    notificationManager.info("Đã lọc dữ liệu hôm nay");
}

function setAllFilter() {
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");

    if (startDateInput) startDateInput.value = "";
    if (endDateInput) endDateInput.value = "";

    currentFilters.startDate = "";
    currentFilters.endDate = "";

    applyFilters();

    notificationManager.info("Hiển thị tất cả dữ liệu");
}

function clearFilters() {
    setAllFilter();
}

function applyFilters() {
    const inventory = window.inventoryData || [];
    const filtered = filterInventoryData(inventory);

    console.log(
        "Filter applied - Total:",
        inventory.length,
        "Filtered:",
        filtered.length,
    );

    // Update table
    renderTable(filtered);

    // Update filter info
    updateFilterInfo(filtered.length, inventory.length);

    // Update delete filtered button
    updateDeleteFilteredButton(filtered.length);

    // Update order statistics
    renderOrderStatistics();

    // Update stats cards
    if (typeof window.renderStatistics === "function") {
        renderStatistics();
    }
}

function filterInventoryData(data) {
    // CRITICAL FIX: If no filter is set, return ALL data
    if (!currentFilters.startDate && !currentFilters.endDate) {
        console.log("No filter set - returning all data");
        return data;
    }

    console.log("Filtering with:", currentFilters);

    return data.filter((item) => {
        const itemDate = formatDate(item.dateCell);

        if (currentFilters.startDate && currentFilters.endDate) {
            const isAfterStart =
                compareDates(itemDate, currentFilters.startDate) >= 0;
            const isBeforeEnd =
                compareDates(itemDate, currentFilters.endDate) <= 0;
            return isAfterStart && isBeforeEnd;
        }

        if (currentFilters.startDate) {
            return compareDates(itemDate, currentFilters.startDate) >= 0;
        }

        if (currentFilters.endDate) {
            return compareDates(itemDate, currentFilters.endDate) <= 0;
        }

        return true;
    });
}

function updateFilterInfo(filteredCount, totalCount) {
    const filterInfo = document.getElementById("filterInfo");
    if (!filterInfo) return;

    if (filteredCount !== totalCount) {
        let infoText = `Hiển thị ${filteredCount} / ${totalCount} sản phẩm`;

        if (currentFilters.startDate || currentFilters.endDate) {
            if (currentFilters.startDate && currentFilters.endDate) {
                if (currentFilters.startDate === currentFilters.endDate) {
                    infoText += ` (ngày ${currentFilters.startDate})`;
                } else {
                    infoText += ` (từ ${currentFilters.startDate} đến ${currentFilters.endDate})`;
                }
            } else if (currentFilters.startDate) {
                infoText += ` (từ ${currentFilters.startDate})`;
            } else if (currentFilters.endDate) {
                infoText += ` (đến ${currentFilters.endDate})`;
            }
        }

        filterInfo.textContent = infoText;
        filterInfo.classList.remove("hidden");
    } else {
        filterInfo.classList.add("hidden");
    }
}

function updateDeleteFilteredButton(filteredCount) {
    const deleteBtn = document.getElementById("deleteFilteredBtn");
    if (!deleteBtn) return;

    if (filteredCount > 0 && hasPermission(0)) {
        deleteBtn.textContent = `Xóa đã lọc (${filteredCount})`;
        deleteBtn.classList.remove("hidden");
    } else {
        deleteBtn.classList.add("hidden");
    }
}

async function handleDeleteFiltered() {
    if (!hasPermission(0)) {
        notificationManager.error("Không có quyền xóa");
        return;
    }

    const inventory = window.inventoryData || [];
    const filtered = filterInventoryData(inventory);

    if (filtered.length === 0) {
        notificationManager.warning("Không có sản phẩm để xóa");
        return;
    }

    if (!confirm(`Bạn có chắc muốn xóa ${filtered.length} sản phẩm đã lọc?`)) {
        return;
    }

    const deletingId = notificationManager.deleting(
        `Đang xóa ${filtered.length} sản phẩm...`,
    );

    try {
        // Get IDs of filtered items
        const filteredIds = filtered.map((item) => item.id);

        // Delete from Firebase
        if (window.isFirebaseInitialized()) {
            await window.firebaseService.deleteMultipleItems(filteredIds);
        } else {
            // Fallback to local delete
            const filteredIdSet = new Set(filteredIds);
            const updatedInventory = inventory.filter(
                (item) => !filteredIdSet.has(item.id),
            );
            window.inventoryData = updatedInventory;
            setCachedData(updatedInventory);
        }

        // Log action
        logAction("delete_batch", `Xóa ${filtered.length} sản phẩm đã lọc`);

        // Re-render table and statistics
        if (!window.isFirebaseInitialized()) {
            renderTable(window.inventoryData);
            renderOrderStatistics();
        }

        // Reset filters
        setAllFilter();

        notificationManager.remove(deletingId);
        notificationManager.success(`Đã xóa ${filtered.length} sản phẩm!`);
    } catch (error) {
        console.error("Error deleting filtered items:", error);
        notificationManager.remove(deletingId);
        notificationManager.error("Lỗi xóa sản phẩm: " + error.message);
    }
}

function getFilteredData() {
    const inventory = window.inventoryData || [];
    return filterInventoryData(inventory);
}

// Export functions
window.initFilters = initFilters;
window.setTodayFilter = setTodayFilter;
window.setAllFilter = setAllFilter;
window.clearFilters = clearFilters;
window.applyFilters = applyFilters;
window.filterInventoryData = filterInventoryData;
window.getFilteredData = getFilteredData;
window.currentFilters = currentFilters;

console.log("✓ Filters module loaded");
