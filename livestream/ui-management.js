// ui-management.js - UI, Filters & Forms
// Livestream Report Management System

// =====================================================
// FILTER SYSTEM
// =====================================================

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
    }, FILTER_DEBOUNCE_DELAY);
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
                if (index >= MAX_VISIBLE_ROWS) {
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

// =====================================================
// FORM HANDLING
// =====================================================

function initializeUpdatedForm() {
    if (ngayLive) {
        ngayLive.valueAsDate = new Date();
    }

    // Update HTML structure for time inputs
    const thoiGianContainer =
        document.querySelector('[for="thoiGian"]').parentNode;
    thoiGianContainer.innerHTML = `
        <label for="thoiGian">Thời gian:</label>
        <div id="thoiGianContainer" style="display: flex; gap: 5px; align-items: center;">
          <input type="number" id="hh1" min="0" max="23" placeholder="HH" style="width:50px;">
          :
          <input type="number" id="mm1" min="0" max="59" placeholder="MM" style="width:50px;">
          <span>đến</span>
          <input type="number" id="hh2" min="0" max="23" placeholder="HH" style="width:50px;">
          :
          <input type="number" id="mm2" min="0" max="59" placeholder="MM" style="width:50px;">
        </div>
    `;

    // Toggle form button
    if (toggleFormButton) {
        toggleFormButton.addEventListener("click", () => {
            if (hasPermission(3)) {
                if (
                    dataForm.style.display === "none" ||
                    dataForm.style.display === ""
                ) {
                    dataForm.style.display = "block";
                    toggleFormButton.textContent = "Ẩn biểu mẫu";
                } else {
                    dataForm.style.display = "none";
                    toggleFormButton.textContent = "Hiện biểu mẫu";
                }
            } else {
                showError("Không có quyền truy cập form");
            }
        });
    }

    // Form submit handler
    if (livestreamForm) {
        livestreamForm.addEventListener("submit", handleUpdatedFormSubmit);
    }

    // Amount input formatting (only numbers)
    const tienQCInput = document.getElementById("tienQC");
    if (tienQCInput) {
        tienQCInput.addEventListener("input", function () {
            this.value = this.value.replace(/[^\d,]/g, "");
        });

        tienQCInput.addEventListener("blur", function () {
            let value = this.value.replace(/[,\.]/g, "");
            value = parseFloat(value);

            if (!isNaN(value) && value > 0) {
                this.value = numberWithCommas(value);
            } else {
                this.value = "";
                showError("Tiền QC phải là số hợp lệ");
            }
        });
    }

    // Mau live input - only numbers
    const mauLiveInput = document.getElementById("mauLive");
    if (mauLiveInput) {
        mauLiveInput.addEventListener("input", function () {
            this.value = this.value.replace(/[^\d,]/g, "");
        });

        mauLiveInput.addEventListener("blur", function () {
            let value = this.value.replace(/[,\.]/g, "");
            value = parseFloat(value);

            if (!isNaN(value) && value > 0) {
                this.value = value;
            } else {
                this.value = "";
                showError("Mẫu live phải là số hợp lệ");
            }
        });
    }

    // Số món live - only numbers
    const soMonLiveInput = document.getElementById("soMonLive");
    if (soMonLiveInput) {
        soMonLiveInput.addEventListener("input", function () {
            this.value = this.value.replace(/[^\d,]/g, "");
        });

        soMonLiveInput.addEventListener("blur", function () {
            let value = this.value.replace(/[,\.]/g, "");
            value = parseFloat(value);

            if (!isNaN(value) && value >= 0) {
                this.value = value;
            } else {
                this.value = "";
                showError("Số món live phải là số không âm");
            }
        });
    }

    // Số món inbox - allow 0 value
    const soMonInboxInput = document.getElementById("soMonInbox");
    if (soMonInboxInput) {
        soMonInboxInput.addEventListener("input", function () {
            this.value = this.value.replace(/[^\d,]/g, "");
        });

        soMonInboxInput.addEventListener("blur", function () {
            let value = this.value.replace(/[,\.]/g, "");
            value = parseFloat(value);

            if (!isNaN(value) && value >= 0) {
                this.value = value;
            } else {
                this.value = "";
                showError("Số món inbox phải là số không âm (có thể là 0)");
            }
        });
    }

    // Clear form button
    const clearDataButton = document.getElementById("clearDataButton");
    if (clearDataButton) {
        clearDataButton.addEventListener("click", function () {
            const currentDate = new Date(ngayLive.value);
            ngayLive.valueAsDate = currentDate;
            livestreamForm.reset();
        });
    }
}

function handleUpdatedFormSubmit(e) {
    e.preventDefault();

    if (!hasPermission(3)) {
        showError("Không có quyền thêm báo cáo");
        return;
    }

    const currentDate = new Date(ngayLive.value);

    // Get and validate mau live (must be number)
    const mauLiveValue = document.getElementById("mauLive").value.trim();
    if (!mauLiveValue || isNaN(mauLiveValue) || parseInt(mauLiveValue) <= 0) {
        showError("Mẫu live phải là số nguyên dương.");
        return;
    }
    const mauLive = parseInt(mauLiveValue) + " mẫu";

    // Get and validate tien QC (must be number)
    let tienQC = document.getElementById("tienQC").value.replace(/[,\.]/g, "");
    tienQC = parseFloat(tienQC);
    if (isNaN(tienQC) || tienQC <= 0) {
        showError("Vui lòng nhập số tiền QC hợp lệ.");
        return;
    }

    // Get and validate time
    const hh1 = document.getElementById("hh1").value.padStart(2, "0");
    const mm1 = document.getElementById("mm1").value.padStart(2, "0");
    const hh2 = document.getElementById("hh2").value.padStart(2, "0");
    const mm2 = document.getElementById("mm2").value.padStart(2, "0");
    const startTime = `${hh1}:${mm1}`;
    const endTime = `${hh2}:${mm2}`;

    if (!startTime || !endTime) {
        showError("Vui lòng nhập đầy đủ thời gian bắt đầu và kết thúc.");
        return;
    }

    const thoiGian = formatTimeRange(startTime, endTime);
    if (!thoiGian) {
        showError("Thời gian kết thúc phải lớn hơn thời gian bắt đầu.");
        return;
    }

    // Get and validate số món live (must be number)
    const soMonLiveValue = document.getElementById("soMonLive").value.trim();
    if (
        !soMonLiveValue ||
        isNaN(soMonLiveValue) ||
        parseInt(soMonLiveValue) < 0
    ) {
        showError("Số món trên live phải là số không âm.");
        return;
    }
    const soMonLive = parseInt(soMonLiveValue) + " món";

    // Get and validate số món inbox - save empty string when 0
    const soMonInboxValue = document.getElementById("soMonInbox").value.trim();
    if (
        soMonInboxValue === "" ||
        isNaN(soMonInboxValue) ||
        parseInt(soMonInboxValue) < 0
    ) {
        showError("Số món inbox phải là số không âm (có thể là 0).");
        return;
    }

    // Store different values based on input
    let soMonInbox;
    const soMonInboxNumber = parseInt(soMonInboxValue);
    if (soMonInboxNumber === 0) {
        soMonInbox = ""; // Save empty string when 0
    } else {
        soMonInbox = soMonInboxNumber + " món"; // Save with " món" suffix when > 0
    }

    // Generate timestamp and unique ID
    const tempTimeStamp = new Date();
    const timestamp =
        currentDate.getTime() +
        (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;
    const uniqueId = generateUniqueId();

    const auth = getAuthState();
    const userName = auth
        ? auth.userType
            ? auth.userType.split("-")[0]
            : "Unknown"
        : "Unknown";

    const dataToUpload = {
        id: uniqueId,
        dateCell: timestamp.toString(),
        mauLive: mauLive,
        tienQC: numberWithCommas(tienQC),
        thoiGian: thoiGian,
        soMonLive: soMonLive,
        soMonInbox: soMonInbox,
        user: userName,
        createdBy: userName,
        createdAt: new Date().toISOString(),
        editHistory: [],
    };

    // Create formatted date with period for display
    const formattedDate = formatDateWithPeriod(currentDate, startTime);

    // Add row to table immediately
    const newRow = createTableRow(dataToUpload, formattedDate);
    tableBody.insertRow(0).replaceWith(newRow);

    // Reset form
    livestreamForm.reset();
    ngayLive.valueAsDate = currentDate;

    showLoading("Đang lưu báo cáo...");

    // Upload to Firebase
    collectionRef
        .doc("reports")
        .get()
        .then((doc) => {
            const updateData = doc.exists
                ? {
                      ["data"]:
                          firebase.firestore.FieldValue.arrayUnion(
                              dataToUpload,
                          ),
                  }
                : { ["data"]: [dataToUpload] };

            const operation = doc.exists
                ? collectionRef.doc("reports").update(updateData)
                : collectionRef.doc("reports").set(updateData);

            return operation;
        })
        .then(() => {
            logAction(
                "add",
                `Thêm báo cáo livestream: ${mauLive}`,
                null,
                dataToUpload,
            );
            invalidateCache();
            showSuccess("Đã thêm báo cáo thành công!");
            console.log("Document uploaded successfully");
            location.reload();
        })
        .catch((error) => {
            console.error("Error uploading document: ", error);
            newRow.remove();
            showError("Lỗi khi tải document lên.");
        });
}

// Function to format time range and calculate duration
function formatTimeRange(startTime, endTime) {
    if (!startTime || !endTime) return null;

    const start = new Date(`2000-01-01T${startTime}:00`);
    const end = new Date(`2000-01-01T${endTime}:00`);

    // Handle overnight time (end time is next day)
    if (end <= start) {
        showError("Thời gian kết thúc phải lớn hơn thời gian bắt đầu.");
        return null;
    }

    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins <= 0) {
        return null; // Invalid time range
    }

    const hours = Math.floor(diffMins / 60);
    const minutes = diffMins % 60;

    const startFormatted = `${start.getHours().toString().padStart(2, "0")}h${start.getMinutes().toString().padStart(2, "0")}m`;
    const endFormatted = `${end.getHours().toString().padStart(2, "0")}h${end.getMinutes().toString().padStart(2, "0")}m`;

    let duration = "";
    if (hours > 0) {
        duration += `${hours}h`;
    }
    if (minutes > 0) {
        duration += `${minutes}m`;
    }
    if (!duration) {
        duration = "0m";
    }

    return `Từ ${startFormatted} đến ${endFormatted} - ${duration}`;
}

// =====================================================
// MODAL FUNCTIONS
// =====================================================

function closeModal() {
    if (editModal) {
        editModal.style.display = "none";
    }
    editingRow = null;
}

function saveUpdatedChanges() {
    const editDate = document.getElementById("editDate");
    const editMauLive = document.getElementById("editMauLive");
    const editTienQC = document.getElementById("editTienQC");
    const editSoMonLive = document.getElementById("editSoMonLive");
    const editSoMonInbox = document.getElementById("editSoMonInbox");

    const hh1 = document.getElementById("editHh1");
    const mm1 = document.getElementById("editMm1");
    const hh2 = document.getElementById("editHh2");
    const mm2 = document.getElementById("editMm2");

    const auth = getAuthState();
    const userLevel = parseInt(auth.checkLogin);

    // Get current row data for comparison and fallback
    if (!editingRow) {
        showError("Không tìm thấy hàng cần chỉnh sửa.");
        return;
    }

    const currentRowData = {
        date: editingRow.cells[0].innerText,
        mauLive: editingRow.cells[1].innerText,
        tienQC: editingRow.cells[2].innerText,
        thoiGian: editingRow.cells[3].innerText,
        soMonLive: editingRow.cells[4].innerText,
        soMonInbox: editingRow.cells[5].innerText,
    };

    // Prepare values based on user permission level
    let finalValues = {};

    if (userLevel <= 1) {
        // Level 0 and 1 can edit everything - validate all fields
        const dateValue = editDate.value;
        const mauLiveValue = editMauLive.value.trim();
        const tienQCValue = editTienQC.value.trim();
        const soMonLiveValue = editSoMonLive.value.trim();
        const soMonInboxValue = editSoMonInbox.value.trim();

        // Validation for full edit permission
        if (!dateValue || !mauLiveValue || !tienQCValue) {
            showError("Vui lòng điền đầy đủ thông tin bắt buộc.");
            return;
        }

        // Validate mau live is number
        if (isNaN(mauLiveValue) || parseInt(mauLiveValue) <= 0) {
            showError("Mẫu live phải là số nguyên dương.");
            return;
        }

        const cleanAmount = tienQCValue.replace(/[,\.]/g, "");
        const numAmount = parseFloat(cleanAmount);
        if (isNaN(numAmount) || numAmount <= 0) {
            showError("Số tiền QC không hợp lệ.");
            return;
        }

        // Validate và format time
        let formattedTime = "";
        const startHour = hh1.value.trim();
        const startMin = mm1.value.trim();
        const endHour = hh2.value.trim();
        const endMin = mm2.value.trim();

        if (startHour && startMin && endHour && endMin) {
            const startTime = `${startHour.padStart(2, "0")}:${startMin.padStart(2, "0")}`;
            const endTime = `${endHour.padStart(2, "0")}:${endMin.padStart(2, "0")}`;
            formattedTime = formatTimeRange(startTime, endTime);

            if (!formattedTime) {
                showError("Thời gian không hợp lệ.");
                return;
            }
        }

        // Validate số món - allow 0 values
        if (isNaN(soMonLiveValue) || parseInt(soMonLiveValue) < 0) {
            showError("Số món trên live phải là số không âm.");
            return;
        }

        if (isNaN(soMonInboxValue) || parseInt(soMonInboxValue) < 0) {
            showError("Số món inbox phải là số không âm (có thể là 0).");
            return;
        }

        // Convert date back to timestamp
        const dateObj = new Date(dateValue);
        const editDateTimestamp =
            dateObj.getTime() +
            (new Date().getMinutes() * 60 + new Date().getSeconds()) * 1000;

        // Format data with suffixes
        const finalMauLive = parseInt(mauLiveValue) + " mẫu";
        const finalSoMonLive = parseInt(soMonLiveValue) + " món";

        // Handle soMonInbox - empty string when 0, otherwise add suffix
        let finalSoMonInbox;
        const soMonInboxNumber = parseInt(soMonInboxValue);
        if (soMonInboxNumber === 0) {
            finalSoMonInbox = ""; // Save empty string when 0
        } else {
            finalSoMonInbox = soMonInboxNumber + " món";
        }

        finalValues = {
            dateCell: editDateTimestamp.toString(),
            mauLive: finalMauLive,
            tienQC: numberWithCommas(numAmount),
            thoiGian: formattedTime || currentRowData.thoiGian,
            soMonLive: finalSoMonLive,
            soMonInbox: finalSoMonInbox,
        };
    } else if (userLevel === 2) {
        // Level 2 can only edit soMonInbox
        const soMonInboxValue = editSoMonInbox.value.trim();

        // Validate only soMonInbox
        if (isNaN(soMonInboxValue) || parseInt(soMonInboxValue) < 0) {
            showError("Số món inbox phải là số không âm (có thể là 0).");
            return;
        }

        // Keep all other values from current row, only change soMonInbox
        let currentDateTimestamp;
        try {
            // Parse current date back to timestamp for consistency
            let cleanDate = currentRowData.date;
            const periodPattern = /\s*\((Sáng|Chiều|Tối)\)$/;
            if (periodPattern.test(currentRowData.date)) {
                cleanDate = currentRowData.date
                    .replace(periodPattern, "")
                    .trim();
            }

            const parts = cleanDate.split("-");
            if (parts.length === 3) {
                const day = parseInt(parts[0]);
                const month = parseInt(parts[1]);
                let year = parseInt(parts[2]);
                if (year < 100) {
                    year = year < 50 ? 2000 + year : 1900 + year;
                }
                const dateObj = new Date(year, month - 1, day);
                currentDateTimestamp =
                    dateObj.getTime() +
                    (new Date().getMinutes() * 60 + new Date().getSeconds()) *
                        1000;
            }
        } catch (error) {
            console.error("Error parsing current date:", error);
            currentDateTimestamp = Date.now();
        }

        // Handle soMonInbox - empty string when 0, otherwise add suffix
        let finalSoMonInbox;
        const soMonInboxNumber = parseInt(soMonInboxValue);
        if (soMonInboxNumber === 0) {
            finalSoMonInbox = ""; // Save empty string when 0
        } else {
            finalSoMonInbox = soMonInboxNumber + " món";
        }

        finalValues = {
            dateCell: currentDateTimestamp.toString(),
            mauLive: currentRowData.mauLive
                .replace(" ✨", "")
                .replace(/\s*<span[^>]*>.*?<\/span>\s*/g, ""), // Remove edit indicators
            tienQC: currentRowData.tienQC,
            thoiGian: currentRowData.thoiGian,
            soMonLive: currentRowData.soMonLive,
            soMonInbox: finalSoMonInbox, // Only this field changes
        };
    } else {
        showError("Không có quyền chỉnh sửa.");
        return;
    }

    const firstCell = editingRow.querySelector("td");
    if (!firstCell) {
        showError("Không tìm thấy cell đầu tiên.");
        return;
    }

    const recordId = firstCell.getAttribute("data-id");
    if (!recordId) {
        showError("Không tìm thấy ID của báo cáo.");
        return;
    }

    showLoading("Đang lưu thay đổi...");

    try {
        collectionRef
            .doc("reports")
            .get()
            .then((doc) => {
                if (!doc.exists) {
                    throw new Error("Document does not exist");
                }

                const data = doc.data();
                const dataArray = data["data"] || [];

                const itemIndex = dataArray.findIndex(
                    (item) => item.id === recordId,
                );
                if (itemIndex === -1) {
                    throw new Error("Report not found");
                }

                const oldData = { ...dataArray[itemIndex] };
                const currentUser = auth
                    ? auth.userType
                        ? auth.userType.split("-")[0]
                        : "Unknown"
                    : "Unknown";

                // Prepare new data
                const newData = {
                    ...oldData,
                    ...finalValues, // Apply the final values based on permission level
                };

                // Create comprehensive edit history entry
                const editHistoryEntry = {
                    timestamp: new Date().toISOString(),
                    editedBy: currentUser,
                    oldData: {
                        dateCell: oldData.dateCell,
                        mauLive: oldData.mauLive,
                        tienQC: oldData.tienQC,
                        thoiGian: oldData.thoiGian,
                        soMonLive: oldData.soMonLive,
                        soMonInbox: oldData.soMonInbox,
                    },
                    newData: {
                        dateCell: newData.dateCell,
                        mauLive: newData.mauLive,
                        tienQC: newData.tienQC,
                        thoiGian: newData.thoiGian,
                        soMonLive: newData.soMonLive,
                        soMonInbox: newData.soMonInbox,
                    },
                };

                // Initialize or update edit history
                if (!newData.editHistory) {
                    newData.editHistory = [];
                }
                newData.editHistory.push(editHistoryEntry);

                // Update the item in array
                dataArray[itemIndex] = newData;

                return collectionRef.doc("reports").update({ data: dataArray });
            })
            .then(() => {
                // Update the row in the table with edit indicators
                // Create display date with time period
                let formattedDisplayDate = formatDate(
                    new Date(parseInt(finalValues.dateCell)),
                );

                // Add time period if we have time information
                if (finalValues.thoiGian) {
                    const timePattern = /Từ\s+(\d{1,2})h(\d{1,2})m/;
                    const match = finalValues.thoiGian.match(timePattern);
                    if (match) {
                        const startHour = parseInt(match[1]);
                        const startMin = parseInt(match[2]);
                        const startTime = `${startHour.toString().padStart(2, "0")}:${startMin.toString().padStart(2, "0")}`;
                        formattedDisplayDate = formatDateWithPeriod(
                            new Date(parseInt(finalValues.dateCell)),
                            startTime,
                        );
                    }
                }

                editingRow.cells[0].textContent = formattedDisplayDate;
                editingRow.cells[0].setAttribute("data-id", recordId);
                editingRow.cells[1].innerHTML =
                    finalValues.mauLive +
                    ' <span class="edit-indicator"></span>';
                editingRow.cells[2].textContent = finalValues.tienQC;
                editingRow.cells[3].textContent = finalValues.thoiGian;
                editingRow.cells[4].textContent = finalValues.soMonLive;
                editingRow.cells[5].textContent = finalValues.soMonInbox; // This will be empty when 0

                // Add visual indicators for edited row
                editingRow.classList.add("edited-row");
                editingRow.style.borderLeft = "4px solid #ffc107";
                editingRow.style.backgroundColor = "#fff3cd";
                editingRow.title =
                    "Hàng này đã được chỉnh sửa - Click để xem lịch sử (Admin only)";

                // Update stored data attributes
                editingRow.setAttribute(
                    "data-row-data",
                    JSON.stringify({
                        mauLive: finalValues.mauLive,
                        tienQC: finalValues.tienQC,
                        thoiGian: finalValues.thoiGian,
                        soMonLive: finalValues.soMonLive,
                        soMonInbox: finalValues.soMonInbox,
                    }),
                );

                const actionText =
                    userLevel === 2
                        ? "Sửa số món inbox"
                        : "Sửa báo cáo livestream";
                logAction(
                    "edit",
                    `${actionText}: ${finalValues.mauLive}`,
                    null,
                    null,
                );
                invalidateCache();
                showSuccess("Đã lưu thay đổi thành công!");
                closeModal();
            })
            .catch((error) => {
                console.error("Error updating document:", error);
                showError("Lỗi khi cập nhật dữ liệu: " + error.message);
            });
    } catch (error) {
        console.error("Error in saveUpdatedChanges:", error);
        showError("Lỗi: " + error.message);
    }
}

// =====================================================
// EDIT HISTORY MODAL FUNCTIONS
// =====================================================

function showEditHistoryModal(editHistory, rowData) {
    console.log("showEditHistoryModal called with:", editHistory, rowData);

    // Remove existing modal if any
    removeEditHistoryModal();

    // Create modal overlay
    const modalOverlay = document.createElement("div");
    modalOverlay.id = "editHistoryModalOverlay";
    modalOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
    `;

    // Create modal content
    const modal = document.createElement("div");
    modal.id = "editHistoryModal";
    modal.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 0;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        position: relative;
        margin: 20px;
        width: 90%;
    `;

    // Build modal content
    let modalContent = `
        <div style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 12px 12px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        ">
            <h3 style="margin: 0; font-size: 18px;">Lịch sử chỉnh sửa</h3>
            <button onclick="removeEditHistoryModal()" style="
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 18px;
                font-weight: bold;
            ">&times;</button>
        </div>
        <div style="padding: 20px;">
    `;

    // Show current data info
    modalContent += `
        <div style="
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 4px solid #667eea;
        ">
            <h4 style="margin: 0 0 10px 0; color: #2c3e50;">Thông tin hiện tại:</h4>
            <div style="font-size: 14px; color: #495057;">
                <strong>Mẫu live:</strong> ${rowData.mauLive || "N/A"}<br>
                <strong>Tiền QC:</strong> ${rowData.tienQC || "N/A"}<br>
                <strong>Thời gian:</strong> ${rowData.thoiGian || "N/A"}<br>
                <strong>Số món live:</strong> ${rowData.soMonLive || "N/A"}<br>
                <strong>Số món inbox:</strong> ${rowData.soMonInbox || "N/A"}
            </div>
        </div>
    `;

    // Check if there's edit history
    if (!editHistory || editHistory.length === 0) {
        modalContent += `
            <div style="
                text-align: center;
                padding: 30px;
                color: #6c757d;
                font-style: italic;
            ">
                Không có lịch sử chỉnh sửa
            </div>
        `;
    } else {
        // Sort edit history by timestamp (newest first)
        const sortedHistory = [...editHistory].sort(
            (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
        );

        modalContent +=
            '<h4 style="margin: 0 0 15px 0; color: #2c3e50;">Lịch sử chỉnh sửa:</h4>';

        sortedHistory.forEach((history, index) => {
            const editDate = new Date(history.timestamp).toLocaleString(
                "vi-VN",
                {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                },
            );

            modalContent += `
                <div style="
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                    margin-bottom: 15px;
                    overflow: hidden;
                ">
                    <div style="
                        background: #e9ecef;
                        padding: 10px 15px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        font-size: 13px;
                    ">
                        <span style="
                            background: #667eea;
                            color: white;
                            padding: 2px 8px;
                            border-radius: 12px;
                            font-weight: 600;
                            font-size: 11px;
                        ">#${sortedHistory.length - index}</span>
                        <span style="font-weight: 600; color: #2c3e50;">${history.editedBy || "Unknown"}</span>
                        <span style="color: #6c757d; font-size: 11px;">${editDate}</span>
                    </div>
                    <div style="padding: 15px;">
                        ${renderEditChangesForModal(history.oldData, history.newData)}
                    </div>
                </div>
            `;
        });
    }

    modalContent += "</div>";
    modal.innerHTML = modalContent;
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);

    // Close on overlay click
    modalOverlay.addEventListener("click", function (e) {
        if (e.target === modalOverlay) {
            removeEditHistoryModal();
        }
    });

    // Close on ESC key
    document.addEventListener("keydown", handleModalKeydown);
}

function renderEditChangesForModal(oldData, newData) {
    if (!oldData || !newData) {
        return '<em style="color: #6c757d;">Không có dữ liệu thay đổi</em>';
    }

    const changes = [];
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

    // Define field display names
    const fieldNames = {
        dateCell: "Ngày",
        mauLive: "Mẫu live",
        tienQC: "Tiền QC",
        thoiGian: "Thời gian",
        soMonLive: "Số món trên live",
        soMonInbox: "Số món inbox",
    };

    allKeys.forEach((key) => {
        // Skip metadata fields
        if (
            ["id", "user", "editHistory", "createdBy", "createdAt"].includes(
                key,
            )
        ) {
            return;
        }

        const oldValue = oldData[key];
        const newValue = newData[key];

        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            const fieldName = fieldNames[key] || key;
            const formattedOldValue = formatValueForModal(oldValue, key);
            const formattedNewValue = formatValueForModal(newValue, key);

            changes.push(`
                <div style="
                    margin-bottom: 10px;
                    padding: 10px;
                    background: #f8f9fa;
                    border-radius: 6px;
                    border-left: 3px solid #dee2e6;
                ">
                    <div style="font-weight: 600; color: #495057; margin-bottom: 5px; font-size: 13px;">
                        ${fieldName}:
                    </div>
                    <div style="margin-left: 10px;">
                        <div style="margin: 3px 0; font-size: 12px; display: flex; align-items: flex-start; gap: 8px;">
                            <span style="color: #dc3545; font-weight: 600; min-width: 30px;">Cũ:</span> 
                            <span style="word-break: break-word;">${formattedOldValue}</span>
                        </div>
                        <div style="margin: 3px 0; font-size: 12px; display: flex; align-items: flex-start; gap: 8px;">
                            <span style="color: #28a745; font-weight: 600; min-width: 30px;">Mới:</span> 
                            <span style="word-break: break-word;">${formattedNewValue}</span>
                        </div>
                    </div>
                </div>
            `);
        }
    });

    return changes.length > 0
        ? changes.join("")
        : '<em style="color: #28a745;">Không có thay đổi</em>';
}

function formatValueForModal(value, field) {
    if (value === null || value === undefined) {
        return '<span style="color: #6c757d; font-style: italic;">Không có</span>';
    }

    // Special formatting for date fields
    if (field === "dateCell" && !isNaN(value)) {
        const date = new Date(parseInt(value));
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString("vi-VN");
        }
    }

    // Truncate very long strings
    const stringValue = value.toString();
    if (stringValue.length > 100) {
        return stringValue.substring(0, 100) + "...";
    }

    return stringValue;
}

function handleModalKeydown(event) {
    if (event.key === "Escape") {
        removeEditHistoryModal();
    }
}

function removeEditHistoryModal() {
    const modal = document.getElementById("editHistoryModalOverlay");
    if (modal) {
        modal.remove();
        document.removeEventListener("keydown", handleModalKeydown);
    }
}

// =====================================================
// TOTAL CALCULATION FUNCTIONS
// =====================================================

function initializeTotalCalculation() {
    showTotalDetailsAlways();
    updateAllTotals();
}

function showTotalDetailsAlways() {
    const totalGrid = document.querySelector(".total-grid");
    const totalSummary = document.querySelector(".total-summary");

    if (totalGrid) {
        const totalCards = totalGrid.querySelectorAll(".total-card");
        totalCards.forEach((card) => {
            card.style.display = "block";
            card.style.opacity = "1";
            card.style.transform = "translateY(0)";
        });

        totalGrid.style.gridTemplateColumns =
            "repeat(auto-fit, minmax(180px, 1fr))";
    }

    if (totalSummary) {
        totalSummary.style.cursor = "default";
        updateTotalSummaryTitle("Tổng kết Tiền QC");
    }
}

function updateTotalSummaryTitle(newTitle) {
    const summaryTitle = document.querySelector(".total-summary h2");
    if (summaryTitle) {
        summaryTitle.textContent = newTitle;
    }
}

function calculateTotalAmounts() {
    if (!arrayData || arrayData.length === 0) {
        return {
            all: { amount: 0, count: 0 },
            today: { amount: 0, count: 0 },
            week: { amount: 0, count: 0 },
            month: { amount: 0, count: 0 },
            filtered: { amount: 0, count: 0 },
        };
    }

    const today = new Date();
    const startOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
    );
    const endOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        23,
        59,
        59,
    );

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0,
        23,
        59,
        59,
    );

    const totals = {
        all: { amount: 0, count: 0 },
        today: { amount: 0, count: 0 },
        week: { amount: 0, count: 0 },
        month: { amount: 0, count: 0 },
        filtered: { amount: 0, count: 0 },
    };

    arrayData.forEach((item) => {
        let amount = 0;
        if (item.tienQC) {
            const cleanAmount = item.tienQC.toString().replace(/[,\.]/g, "");
            amount = parseFloat(cleanAmount) || 0;
        }

        const itemDate = new Date(parseInt(item.dateCell));

        totals.all.amount += amount;
        totals.all.count++;

        if (itemDate >= startOfToday && itemDate <= endOfToday) {
            totals.today.amount += amount;
            totals.today.count++;
        }

        if (itemDate >= startOfWeek && itemDate <= endOfWeek) {
            totals.week.amount += amount;
            totals.week.count++;
        }

        if (itemDate >= startOfMonth && itemDate <= endOfMonth) {
            totals.month.amount += amount;
            totals.month.count++;
        }
    });

    filteredDataForTotal = getFilteredDataForTotal();
    filteredDataForTotal.forEach((item) => {
        let amount = 0;
        if (item.tienQC) {
            const cleanAmount = item.tienQC.toString().replace(/[,\.]/g, "");
            amount = parseFloat(cleanAmount) || 0;
        }

        totals.filtered.amount += amount;
        totals.filtered.count++;
    });

    return totals;
}

function getFilteredDataForTotal() {
    if (!arrayData || arrayData.length === 0) return [];

    if (
        currentFilters &&
        (currentFilters.startDate || currentFilters.endDate)
    ) {
        const startDate = currentFilters.startDate;
        const endDate = currentFilters.endDate;

        if (!startDate || !endDate) {
            return arrayData;
        }

        const startTime = new Date(startDate + "T00:00:00").getTime();
        const endTime = new Date(endDate + "T23:59:59").getTime();

        return arrayData.filter((item) => {
            const itemTime = parseInt(item.dateCell);
            return itemTime >= startTime && itemTime <= endTime;
        });
    }

    return arrayData;
}

function formatCurrency(amount) {
    if (!amount && amount !== 0) return "0 ₫";
    return new Intl.NumberFormat("vi-VN").format(amount) + " ₫";
}

function updateAllTotals() {
    const totals = calculateTotalAmounts();

    const totalAllAmount = document.getElementById("totalAllAmount");
    const totalAllCount = document.getElementById("totalAllCount");
    const totalTodayAmount = document.getElementById("totalTodayAmount");
    const totalTodayCount = document.getElementById("totalTodayCount");
    const totalWeekAmount = document.getElementById("totalWeekAmount");
    const totalWeekCount = document.getElementById("totalWeekCount");
    const totalMonthAmount = document.getElementById("totalMonthAmount");
    const totalMonthCount = document.getElementById("totalMonthCount");
    const totalFilteredAmount = document.getElementById("totalFilteredAmount");
    const totalFilteredCount = document.getElementById("totalFilteredCount");

    if (totalAllAmount)
        totalAllAmount.textContent = formatCurrency(totals.all.amount);
    if (totalAllCount)
        totalAllCount.textContent = totals.all.count + " báo cáo";

    if (totalTodayAmount)
        totalTodayAmount.textContent = formatCurrency(totals.today.amount);
    if (totalTodayCount)
        totalTodayCount.textContent = totals.today.count + " báo cáo";

    if (totalWeekAmount)
        totalWeekAmount.textContent = formatCurrency(totals.week.amount);
    if (totalWeekCount)
        totalWeekCount.textContent = totals.week.count + " báo cáo";

    if (totalMonthAmount)
        totalMonthAmount.textContent = formatCurrency(totals.month.amount);
    if (totalMonthCount)
        totalMonthCount.textContent = totals.month.count + " báo cáo";

    if (totalFilteredAmount)
        totalFilteredAmount.textContent = formatCurrency(
            totals.filtered.amount,
        );
    if (totalFilteredCount)
        totalFilteredCount.textContent = totals.filtered.count + " báo cáo";

    console.log("Updated totals:", totals);
}

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener("DOMContentLoaded", function () {
    // Check authentication
    const auth = getAuthState();
    if (!isAuthenticated()) {
        window.location.href = "../index.html";
        return;
    }

    // Update UI based on user
    if (auth.userType) {
        const titleElement = document.querySelector(".page-title");
        if (titleElement) {
            titleElement.textContent += " - " + auth.displayName;
        }
    }

    // Show main container
    const parentContainer = document.getElementById("parentContainer");
    if (parentContainer) {
        parentContainer.style.display = "flex";
        parentContainer.style.justifyContent = "center";
        parentContainer.style.alignItems = "center";
    }

    // Initialize CSS styles for edit history
    injectEditHistoryCSS();

    // Initialize components
    initializeUpdatedForm();

    // Initialize table events - check if function exists
    if (typeof initializeTableEvents === "function") {
        initializeTableEvents();
    }

    // Update table - check if function exists
    if (typeof updateTable === "function") {
        updateTable();
    }

    // Add logout button event listener
    const toggleLogoutButton = document.getElementById("toggleLogoutButton");
    if (toggleLogoutButton) {
        toggleLogoutButton.addEventListener("click", handleLogout);
    }

    // Remove ads
    const adsElement = document.querySelector(
        'div[style*="position: fixed"][style*="z-index:9999999"]',
    );
    if (adsElement) {
        adsElement.remove();
    }

    // Initialize total calculation if data already exists
    if (arrayData && arrayData.length > 0) {
        setTimeout(() => {
            initializeTotalCalculation();
        }, 1000);
    }

    console.log(
        "Livestream Report Management System with Enhanced Sorting initialized successfully",
    );
});

// Inject CSS for edit indicators
function injectEditHistoryCSS() {
    if (document.getElementById("editHistoryCSS")) return;

    const style = document.createElement("style");
    style.id = "editHistoryCSS";
    style.textContent = `
        .edit-indicator {
            color: #ffc107;
            font-size: 12px;
            margin-left: 5px;
        }

        .edited-row {
            border-left: 4px solid #ffc107 !important;
            background-color: #fff3cd !important;
        }

        .edited-row:hover {
            background-color: #ffeaa7 !important;
        }

        .admin-clickable-row {
            border-left: 4px solid #17a2b8 !important;
            background-color: #d1ecf1 !important;
        }

        .admin-clickable-row:hover {
            background-color: #bee5eb !important;
        }
    `;

    document.head.appendChild(style);
}

// Override existing functions to include total calculation updates
const originalApplyFilters = applyFilters;
applyFilters = function () {
    originalApplyFilters.call(this);
    setTimeout(() => {
        updateAllTotals();
    }, 200);
};

// Override renderTableFromData - this function is defined in table-management.js
// We'll wrap it when it becomes available
window.addEventListener("load", function () {
    if (typeof renderTableFromData !== "undefined") {
        const originalRenderTableFromData = renderTableFromData;
        renderTableFromData = function (dataArray, applyInitialFilter = false) {
            originalRenderTableFromData.call(
                this,
                dataArray,
                applyInitialFilter,
            );
            setTimeout(() => {
                updateAllTotals();
            }, 100);
        };
    }

    if (typeof updateTable !== "undefined") {
        const originalUpdateTable = updateTable;
        updateTable = function () {
            originalUpdateTable.call(this);
            setTimeout(() => {
                initializeTotalCalculation();
            }, 500);
        };
    }
});

// Export functions for global use
window.initializeTotalCalculation = initializeTotalCalculation;
window.updateAllTotals = updateAllTotals;
window.removeEditHistoryModal = removeEditHistoryModal;
window.closeModal = closeModal;
window.saveUpdatedChanges = saveUpdatedChanges;
