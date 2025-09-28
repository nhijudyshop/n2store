// js/filters.js - Filter System

function createFilterSystem() {
    if (document.getElementById("improvedFilterSystem")) {
        return;
    }

    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    const localISODate = new Date(today - tzOffset).toISOString().split("T")[0];

    const filterContainer = document.createElement("div");
    filterContainer.id = "improvedFilterSystem";
    filterContainer.className = "filter-system";
    filterContainer.innerHTML = `
        <div class="filter-row">
            <div class="filter-group">
                <label>Từ ngày:</label>
                <input type="date" id="startDateFilter" class="filter-input" value="${localISODate}">
            </div>
            
            <div class="filter-group">
                <label>Đến ngày:</label>
                <input type="date" id="endDateFilter" class="filter-input" value="${localISODate}">
            </div>
            
            <div class="filter-group">
                <label>&nbsp;</label>
                <div>
                    <button id="todayFilterBtn" class="filter-btn today-btn">Hôm nay</button>
                    <button id="allFilterBtn" class="filter-btn all-btn">Tất cả</button>
                    <button id="clearFiltersBtn" class="filter-btn clear-btn">Xóa lọc</button>
                </div>
            </div>
        </div>
        
        <div id="filterInfo" class="filter-info hidden"></div>
    `;

    const tableContainer =
        document.querySelector(".table-container") ||
        (tableBody ? tableBody.parentNode : null);
    if (tableContainer && tableContainer.parentNode) {
        tableContainer.parentNode.insertBefore(filterContainer, tableContainer);
    }

    currentFilters.startDate = localISODate;
    currentFilters.endDate = localISODate;

    setTimeout(() => {
        attachFilterEventListeners();
    }, 100);
}

function attachFilterEventListeners() {
    const startDateFilter = document.getElementById("startDateFilter");
    const endDateFilter = document.getElementById("endDateFilter");
    const todayBtn = document.getElementById("todayFilterBtn");
    const allBtn = document.getElementById("allFilterBtn");
    const clearBtn = document.getElementById("clearFiltersBtn");

    if (startDateFilter)
        startDateFilter.addEventListener("change", handleDateRangeChange);
    if (endDateFilter)
        endDateFilter.addEventListener("change", handleDateRangeChange);
    if (todayBtn) todayBtn.addEventListener("click", setTodayFilter);
    if (allBtn) allBtn.addEventListener("click", setAllFilter);
    if (clearBtn) clearBtn.addEventListener("click", clearAllFilters);

    applyFilters();
}

function handleDateRangeChange() {
    if (isFilteringInProgress) return;

    const startDateFilter = document.getElementById("startDateFilter");
    const endDateFilter = document.getElementById("endDateFilter");

    if (!startDateFilter || !endDateFilter) return;

    let startDate = startDateFilter.value;
    let endDate = endDateFilter.value;

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        [startDate, endDate] = [endDate, startDate];
        startDateFilter.value = startDate;
        endDateFilter.value = endDate;
    }

    currentFilters.startDate = startDate;
    currentFilters.endDate = endDate;

    debouncedApplyFilters();
}

function setTodayFilter() {
    if (isFilteringInProgress) return;

    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    const localISODate = new Date(today - tzOffset).toISOString().split("T")[0];

    const startDateFilter = document.getElementById("startDateFilter");
    const endDateFilter = document.getElementById("endDateFilter");

    if (startDateFilter) startDateFilter.value = localISODate;
    if (endDateFilter) endDateFilter.value = localISODate;

    currentFilters.startDate = localISODate;
    currentFilters.endDate = localISODate;

    applyFilters();
}

function setAllFilter() {
    if (isFilteringInProgress) return;

    const startDateFilter = document.getElementById("startDateFilter");
    const endDateFilter = document.getElementById("endDateFilter");

    if (startDateFilter) startDateFilter.value = "";
    if (endDateFilter) endDateFilter.value = "";

    currentFilters.startDate = null;
    currentFilters.endDate = null;

    applyFilters();
}

function clearAllFilters() {
    if (isFilteringInProgress) return;

    const startDateFilter = document.getElementById("startDateFilter");
    const endDateFilter = document.getElementById("endDateFilter");

    if (startDateFilter) startDateFilter.value = "";
    if (endDateFilter) endDateFilter.value = "";

    currentFilters = {
        startDate: null,
        endDate: null,
        status: "all",
    };

    applyFilters();
}

function debouncedApplyFilters() {
    if (isFilteringInProgress) return;

    if (filterTimeout) {
        clearTimeout(filterTimeout);
    }

    filterTimeout = setTimeout(() => {
        applyFilters();
    }, APP_CONFIG.FILTER_DEBOUNCE_DELAY);
}

function applyFilters() {
    if (isFilteringInProgress) return;

    isFilteringInProgress = true;
    showLoading("Đang lọc dữ liệu...");

    setTimeout(() => {
        try {
            const rows = Array.from(tableBody.rows);
            let visibleCount = 0;

            rows.forEach((row, index) => {
                if (index >= APP_CONFIG.MAX_VISIBLE_ROWS) {
                    row.style.display = "none";
                    return;
                }

                const cells = row.cells;
                if (cells.length > 0) {
                    const dateText = cells[0].innerText;
                    const rowDate = parseDisplayDate(dateText);
                    const matchDate = checkDateInRange(
                        rowDate,
                        currentFilters.startDate,
                        currentFilters.endDate,
                    );

                    if (matchDate) {
                        visibleCount++;
                        row.style.display = "table-row";
                    } else {
                        row.style.display = "none";
                    }
                }
            });

            updateFilterInfo(visibleCount, rows.length);

            hideFloatingAlert();
            showSuccess(`Hiển thị ${visibleCount} báo cáo`);
        } catch (error) {
            console.error("Error during filtering:", error);
            showError("Có lỗi xảy ra khi lọc dữ liệu");
        } finally {
            isFilteringInProgress = false;
        }
    }, 100);
}

function checkDateInRange(rowDate, startDateStr, endDateStr) {
    if (!startDateStr && !endDateStr) return true;
    if (!rowDate) return false;

    const rowTime = rowDate.getTime();

    if (startDateStr) {
        const startTime = new Date(startDateStr + "T00:00:00").getTime();
        if (rowTime < startTime) return false;
    }

    if (endDateStr) {
        const endTime = new Date(endDateStr + "T23:59:59").getTime();
        if (rowTime > endTime) return false;
    }

    return true;
}

function updateFilterInfo(visibleCount, totalCount) {
    const filterInfo = document.getElementById("filterInfo");
    if (!filterInfo) return;

    if (visibleCount !== totalCount) {
        let filterText = `Hiển thị ${visibleCount.toLocaleString()} / ${totalCount.toLocaleString()} báo cáo`;

        if (currentFilters.startDate || currentFilters.endDate) {
            const startStr = currentFilters.startDate
                ? formatDateForDisplay(currentFilters.startDate)
                : "";
            const endStr = currentFilters.endDate
                ? formatDateForDisplay(currentFilters.endDate)
                : "";

            if (startStr && endStr) {
                if (startStr === endStr) {
                    filterText += ` (ngày ${startStr})`;
                } else {
                    filterText += ` (từ ${startStr} đến ${endStr})`;
                }
            } else if (startStr) {
                filterText += ` (từ ${startStr})`;
            } else if (endStr) {
                filterText += ` (đến ${endStr})`;
            }
        }

        filterInfo.innerHTML = filterText;
        filterInfo.classList.remove("hidden");
    } else {
        filterInfo.classList.add("hidden");
    }
}

function formatDateForDisplay(dateStr) {
    if (!dateStr) return "";

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
}

// Export functions
window.createFilterSystem = createFilterSystem;
window.attachFilterEventListeners = attachFilterEventListeners;
window.applyFilters = applyFilters;
window.setTodayFilter = setTodayFilter;
window.setAllFilter = setAllFilter;
window.clearAllFilters = clearAllFilters;
