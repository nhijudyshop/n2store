// js/table.js - Table Management System with Grouped View

// Global variables
let isFilterInitialized = false;

// Enhanced Sorting Function with Time Period Priority
function sortDataWithTimePeriod(dataArray) {
    return [...dataArray].sort((a, b) => {
        const timestampA = parseInt(a.dateCell) || 0;
        const timestampB = parseInt(b.dateCell) || 0;

        const dateA = new Date(timestampA);
        const dateB = new Date(timestampB);

        // First, sort by date (newest first)
        const dateComparison = timestampB - timestampA;

        // If dates are the same, sort by time period within that date
        if (Math.abs(dateComparison) < 86400000) {
            const periodA = getTimePeriodFromData(a);
            const periodB = getTimePeriodFromData(b);

            const periodPriority = { Sáng: 1, Chiều: 2, Tối: 3 };

            const priorityA = periodPriority[periodA] || 4;
            const priorityB = periodPriority[periodB] || 4;

            return priorityA - priorityB;
        }

        return dateComparison;
    });
}

function getTimePeriodFromData(item) {
    if (!item.thoiGian) return null;

    const timePattern = /Từ\s+(\d{1,2})h(\d{1,2})m/;
    const match = item.thoiGian.match(timePattern);

    if (match) {
        const startHour = parseInt(match[1]);

        if (startHour >= 6 && startHour < 12) {
            return "Sáng";
        } else if (startHour >= 12 && startHour < 18) {
            return "Chiều";
        } else {
            return "Tối";
        }
    }

    return null;
}

// Group data by date
function groupDataByDate(dataArray) {
    const grouped = {};

    dataArray.forEach((item) => {
        const timestamp = parseInt(item.dateCell);
        const date = new Date(timestamp);
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

        if (!grouped[dateKey]) {
            grouped[dateKey] = {
                date: date,
                dateKey: dateKey,
                reports: [],
            };
        }

        grouped[dateKey].reports.push(item);
    });

    return grouped;
}

// Check if inbox has been edited
function hasInboxBeenEdited(item) {
    if (!item.editHistory || item.editHistory.length === 0) {
        return false;
    }

    // Check if any edit history entry modified soMonInbox
    return item.editHistory.some((entry) => {
        if (entry.newData && entry.oldData) {
            return entry.newData.soMonInbox !== entry.oldData.soMonInbox;
        }
        return false;
    });
}

// Calculate default filter range (This Week)
function getDefaultFilterRange() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - daysToMonday);
    const startOfWeekISO = startOfWeek.toISOString().split("T")[0];

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const endOfWeekISO = endOfWeek.toISOString().split("T")[0];

    return {
        startDate: startOfWeekISO,
        endDate: endOfWeekISO,
    };
}

// Table Management Functions
function renderTableFromData(dataArray, applyInitialFilter = false) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
        console.log("No data to render");
        createFilterSystem();
        return;
    }

    arrayData = [...dataArray];

    // Chỉ apply "This week" filter lần đầu tiên
    if (applyInitialFilter) {
        const defaultRange = getDefaultFilterRange();
        currentFilters.startDate = defaultRange.startDate;
        currentFilters.endDate = defaultRange.endDate;
        console.log(
            "[TABLE] Applying default filter - This week:",
            defaultRange,
        );
    }

    // Sort data with enhanced time period sorting
    const sortedData = sortDataWithTimePeriod(dataArray);

    // Group by date
    const groupedData = groupDataByDate(sortedData);

    tableBody.innerHTML = "";
    const fragment = document.createDocumentFragment();

    // Render grouped data
    Object.keys(groupedData)
        .sort((a, b) => new Date(b) - new Date(a))
        .forEach((dateKey, groupIndex) => {
            const group = groupedData[dateKey];
            const reports = group.reports;

            // Format display date
            const displayDate = formatDate(group.date);

            // Calculate total inbox for this date (only if edited)
            let totalInbox = "";
            const eveningReport = reports.find(
                (r) => getTimePeriodFromData(r) === "Chiều",
            );
            if (eveningReport && hasInboxBeenEdited(eveningReport)) {
                if (
                    eveningReport.soMonInbox &&
                    eveningReport.soMonInbox !== "0" &&
                    eveningReport.soMonInbox !== "0 món"
                ) {
                    const inboxValue = eveningReport.soMonInbox
                        .toString()
                        .replace(" món", "");
                    totalInbox = inboxValue;
                }
            }

            // Create rows for each session
            reports.forEach((item, index) => {
                const newRow = createGroupedTableRow(
                    item,
                    displayDate,
                    totalInbox,
                    index === 0,
                    reports.length,
                    groupIndex,
                    reports,
                );
                fragment.appendChild(newRow);
            });
        });

    tableBody.appendChild(fragment);

    // Tạo filter system nếu chưa có
    createFilterSystem();

    console.log(
        `[TABLE] Rendered ${sortedData.length} reports in grouped format`,
    );
}

function createGroupedTableRow(
    item,
    dateStr,
    totalInbox,
    isFirstRow,
    rowCount,
    groupIndex,
    allReportsInGroup,
) {
    const newRow = document.createElement("tr");
    const period = getTimePeriodFromData(item);

    // Alternating background colors
    if (groupIndex % 2 === 0) {
        if (period === "Sáng") {
            newRow.classList.add("bg-muted/20");
        } else {
            newRow.classList.add("bg-muted/10");
        }
    }

    // Get auth state for styling decisions
    const auth = getAuthState();
    const isAdmin = auth && parseInt(auth.checkLogin) === 0;

    // Date cell (only on first row with rowspan)
    if (isFirstRow) {
        const dateCell = document.createElement("td");
        dateCell.textContent = dateStr;
        dateCell.className =
            "p-4 align-middle text-center font-medium border-r";
        dateCell.rowSpan = rowCount;
        dateCell.setAttribute("data-id", item.id);
        newRow.appendChild(dateCell);
    }

    // Tiền QC cell with badge
    const tienQCCell = document.createElement("td");
    tienQCCell.className = "p-4 align-middle text-center";
    const tienQCValue = item.tienQC
        ? numberWithCommas(
              sanitizeInput(item.tienQC.toString()).replace(/[,\.]/g, ""),
          )
        : "0";
    tienQCCell.innerHTML = `
        <div class="flex flex-col items-center gap-1">
            <div class="inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold transition-colors text-xs ${getPeriodBadgeClass(period)}">
                ${period || ""}
            </div>
            <span class="text-sm font-medium">${tienQCValue}&nbsp;₫</span>
        </div>
    `;
    newRow.appendChild(tienQCCell);

    // Thời gian cell with badge
    const timeCell = document.createElement("td");
    timeCell.className = "p-4 align-middle text-center";
    const timeDisplay = formatTimeDisplay(item.thoiGian);
    timeCell.innerHTML = `
        <div class="flex flex-col items-center gap-1">
            <div class="inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold transition-colors text-xs ${getPeriodBadgeClass(period)}">
                ${period || ""}
            </div>
            <div class="text-sm whitespace-pre-line leading-tight">${timeDisplay}</div>
        </div>
    `;
    newRow.appendChild(timeCell);

    // Số món live cell with badge
    const soMonLiveCell = document.createElement("td");
    soMonLiveCell.className = "p-4 align-middle text-center";
    const soMonLiveValue = item.soMonLive
        ? item.soMonLive.toString().replace(" món", "")
        : "0";
    soMonLiveCell.innerHTML = `
        <div class="flex flex-col items-center gap-1">
            <div class="inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold transition-colors text-xs ${getPeriodBadgeClass(period)}">
                ${period || ""}
            </div>
            <span class="text-sm font-medium">${soMonLiveValue}</span>
        </div>
    `;
    newRow.appendChild(soMonLiveCell);

    // Số món inbox cell (only on first row with rowspan) - only show if edited
    if (isFirstRow) {
        const inboxCell = document.createElement("td");
        inboxCell.className =
            "p-4 align-middle text-center font-medium border-l";
        inboxCell.rowSpan = rowCount;
        inboxCell.innerHTML = `<span class="text-lg font-bold text-primary">${totalInbox}</span>`;
        newRow.appendChild(inboxCell);
    }

    // Action buttons cell - SEPARATE for each row
    const actionCell = document.createElement("td");
    actionCell.className = "p-4 align-middle text-center border-l";

    actionCell.innerHTML = `
        <div class="flex justify-center gap-2">
            <button class="edit-button inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3" title="Chỉnh sửa">
                <i data-lucide="edit-3"></i>
            </button>
            <button class="delete-button inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3" data-user="${item.user || "Unknown"}" title="Xóa">
                <i data-lucide="trash-2"></i>
            </button>
        </div>
    `;

    // Initialize Lucide icons
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    newRow.appendChild(actionCell);

    // Apply role-based permissions
    if (auth) {
        const editBtn = actionCell.querySelector(".edit-button");
        const deleteBtn = actionCell.querySelector(".delete-button");
        applyButtonPermissions(editBtn, deleteBtn, parseInt(auth.checkLogin));
    }

    // Store data on row for edit/delete operations - INDIVIDUAL report ID only
    newRow.setAttribute("data-report-id", item.id);

    return newRow;
}

function getPeriodBadgeClass(period) {
    if (period === "Sáng") {
        return "text-foreground";
    } else if (period === "Chiều") {
        return "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80";
    } else {
        return "border-transparent bg-primary text-primary-foreground";
    }
}

function formatTimeDisplay(thoiGian) {
    if (!thoiGian) return "";

    const timePattern =
        /Từ\s+(\d{1,2})h(\d{1,2})m\s+đến\s+(\d{1,2})h(\d{1,2})m\s+-\s+(.+)/;
    const match = thoiGian.match(timePattern);

    if (match) {
        const [, startH, startM, endH, endM, duration] = match;
        return `${startH.padStart(2, "0")}:${startM.padStart(2, "0")} - ${endH.padStart(2, "0")}:${endM.padStart(2, "0")}\n${duration}`;
    }

    return thoiGian;
}

function applyButtonPermissions(editBtn, deleteBtn, userRole) {
    if (userRole === 0) {
        // Admin: can edit and delete
        editBtn.style.display = "inline-flex";
        deleteBtn.style.display = "inline-flex";
    } else if (userRole === 1) {
        // Level 1: can edit but not delete
        editBtn.style.display = "inline-flex";
        deleteBtn.style.display = "none";
    } else if (userRole === 2) {
        // Level 2: can edit (limited) but not delete
        editBtn.style.display = "inline-flex";
        deleteBtn.style.display = "none";
    } else {
        // Level 3 and above: No permissions
        editBtn.style.display = "none";
        deleteBtn.style.display = "none";
    }
}

function updateTable(preserveCurrentFilter = false) {
    const cachedData = getCachedData();
    if (cachedData) {
        console.log("[TABLE] Loading from cache...");
        if (globalNotificationManager) {
            globalNotificationManager.loadingData(
                "Đang tải dữ liệu từ cache...",
            );
        } else {
            showLoading("Đang tải dữ liệu từ cache...");
        }

        setTimeout(() => {
            // Chỉ apply initial filter lần đầu tiên load trang
            const shouldApplyInitialFilter =
                !isFilterInitialized && !preserveCurrentFilter;
            renderTableFromData(cachedData, shouldApplyInitialFilter);

            if (shouldApplyInitialFilter) {
                isFilterInitialized = true;
            }

            // Áp dụng lại filter hiện tại nếu cần
            if (
                preserveCurrentFilter &&
                (currentFilters.startDate || currentFilters.endDate)
            ) {
                console.log("[TABLE] Re-applying current filter after reload");
                setTimeout(() => {
                    if (typeof applyFilters === "function") {
                        // Tắt cờ để không hiển thị thông báo
                        const tempFlag = isFilteringInProgress;
                        isFilteringInProgress = false;
                        applyFilters();
                        isFilteringInProgress = tempFlag;
                    }
                }, 200);
            }

            if (globalNotificationManager) {
                globalNotificationManager.clearAll();
            } else {
                hideFloatingAlert();
            }
        }, 100);
        return;
    }

    console.log("[TABLE] Loading from Firebase...");
    if (globalNotificationManager) {
        globalNotificationManager.loadingData(
            "Đang tải dữ liệu từ Firebase...",
        );
    } else {
        showLoading("Đang tải dữ liệu từ Firebase...");
    }

    collectionRef
        .doc("reports")
        .get()
        .then((doc) => {
            if (doc.exists) {
                const data = doc.data();
                if (Array.isArray(data["data"]) && data["data"].length > 0) {
                    // Chỉ apply initial filter lần đầu tiên load trang
                    const shouldApplyInitialFilter =
                        !isFilterInitialized && !preserveCurrentFilter;
                    renderTableFromData(data["data"], shouldApplyInitialFilter);

                    if (shouldApplyInitialFilter) {
                        isFilterInitialized = true;
                    }

                    setCachedData(data["data"]);

                    // Áp dụng lại filter hiện tại nếu cần
                    if (
                        preserveCurrentFilter &&
                        (currentFilters.startDate || currentFilters.endDate)
                    ) {
                        console.log(
                            "[TABLE] Re-applying current filter after reload",
                        );
                        setTimeout(() => {
                            if (typeof applyFilters === "function") {
                                // Tắt cờ để không hiển thị thông báo
                                const tempFlag = isFilteringInProgress;
                                isFilteringInProgress = false;
                                applyFilters();
                                isFilteringInProgress = tempFlag;
                            }
                        }, 200);
                    }

                    if (globalNotificationManager) {
                        globalNotificationManager.clearAll();
                        globalNotificationManager.success(
                            "Đã tải xong dữ liệu!",
                            1500,
                        );
                    } else {
                        showSuccess("Đã tải xong dữ liệu!");
                    }
                } else {
                    console.log("[TABLE] No data found or data array is empty");
                    createFilterSystem();

                    if (globalNotificationManager) {
                        globalNotificationManager.clearAll();
                        globalNotificationManager.warning(
                            "Không có dữ liệu",
                            2000,
                        );
                    } else {
                        showError("Không có dữ liệu");
                    }
                }
            } else {
                console.log("[TABLE] Document does not exist");
                createFilterSystem();

                if (globalNotificationManager) {
                    globalNotificationManager.clearAll();
                    globalNotificationManager.error(
                        "Tài liệu không tồn tại",
                        2000,
                    );
                } else {
                    showError("Tài liệu không tồn tại");
                }
            }
        })
        .catch((error) => {
            console.error("[TABLE] Error getting document:", error);
            createFilterSystem();

            if (globalNotificationManager) {
                globalNotificationManager.clearAll();
                globalNotificationManager.error(
                    "Lỗi khi tải dữ liệu từ Firebase",
                    3000,
                );
            } else {
                showError("Lỗi khi tải dữ liệu từ Firebase");
            }
        });
}

// Table Event Handlers
function initializeTableEvents() {
    if (!tableBody) return;

    tableBody.addEventListener("click", function (e) {
        const auth = getAuthState();
        if (!auth || auth.checkLogin == "777") {
            return;
        }

        if (e.target.closest(".edit-button")) {
            handleEditButton(e);
        } else if (e.target.closest(".delete-button")) {
            handleDeleteButton(e);
        }
    });
}

function handleDeleteButton(e) {
    if (!hasPermission(0)) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                "Không đủ quyền thực hiện chức năng này",
                3000,
                "Từ chối truy cập",
            );
        } else {
            showError("Không đủ quyền thực hiện chức năng này.");
        }
        return;
    }

    const confirmDelete = confirm("Bạn có chắc chắn muốn xóa báo cáo này?");
    if (!confirmDelete) return;

    const row = e.target.closest("tr");
    const reportId = row.getAttribute("data-report-id");

    if (!reportId) {
        if (globalNotificationManager) {
            globalNotificationManager.error("Không tìm thấy ID báo cáo", 3000);
        } else {
            showError("Không tìm thấy ID báo cáo");
        }
        return;
    }

    let deleteNotificationId = null;
    if (globalNotificationManager) {
        deleteNotificationId = globalNotificationManager.deleting(
            "Đang xóa báo cáo...",
        );
    } else {
        showLoading("Đang xóa báo cáo...");
    }

    collectionRef
        .doc("reports")
        .get()
        .then((doc) => {
            if (!doc.exists) {
                throw new Error("Document does not exist");
            }

            const data = doc.data();
            const dataArray = data["data"] || [];

            const updatedArray = dataArray.filter(
                (item) => item.id !== reportId,
            );

            return collectionRef.doc("reports").update({ data: updatedArray });
        })
        .then(() => {
            // Log action (safe call)
            if (typeof logAction === "function") {
                logAction("delete", `Xóa báo cáo livestream`, null, null);
            } else {
                console.log("[ACTION] Delete report");
            }

            // Invalidate cache
            invalidateCache();

            // Show success message
            if (globalNotificationManager) {
                globalNotificationManager.clearAll();
                globalNotificationManager.success(
                    "Đã xóa báo cáo thành công!",
                    2000,
                    "Thành công",
                );
            } else {
                showSuccess("Đã xóa báo cáo thành công!");
            }

            // Reload table data và giữ nguyên filter
            setTimeout(() => {
                console.log("[TABLE] Reloading table after deleting report...");
                if (typeof updateTable === "function") {
                    updateTable(true); // true = giữ nguyên filter hiện tại
                }
            }, 500);
        })
        .catch((error) => {
            console.error("[TABLE] Error deleting report:", error);

            if (globalNotificationManager) {
                globalNotificationManager.clearAll();
                globalNotificationManager.error(
                    "Lỗi khi xóa báo cáo: " + error.message,
                    4000,
                    "Lỗi",
                );
            } else {
                showError("Lỗi khi xóa báo cáo");
            }
        });
}

// NEW: Render table with filtered data
function renderFilteredTable(filteredData) {
    if (!Array.isArray(filteredData)) {
        console.error("Invalid filtered data");
        return;
    }

    // Sort data with enhanced time period sorting
    const sortedData = sortDataWithTimePeriod(filteredData);

    // Group by date
    const groupedData = groupDataByDate(sortedData);

    tableBody.innerHTML = "";
    const fragment = document.createDocumentFragment();

    // Render grouped data
    Object.keys(groupedData)
        .sort((a, b) => new Date(b) - new Date(a))
        .forEach((dateKey, groupIndex) => {
            const group = groupedData[dateKey];
            const reports = group.reports;

            // Format display date
            const displayDate = formatDate(group.date);

            // Calculate total inbox for this date (only if edited)
            let totalInbox = "";
            const eveningReport = reports.find(
                (r) => getTimePeriodFromData(r) === "Chiều",
            );
            if (eveningReport && hasInboxBeenEdited(eveningReport)) {
                if (
                    eveningReport.soMonInbox &&
                    eveningReport.soMonInbox !== "0" &&
                    eveningReport.soMonInbox !== "0 món"
                ) {
                    const inboxValue = eveningReport.soMonInbox
                        .toString()
                        .replace(" món", "");
                    totalInbox = inboxValue;
                }
            }

            // Create rows for each session
            reports.forEach((item, index) => {
                const newRow = createGroupedTableRow(
                    item,
                    displayDate,
                    totalInbox,
                    index === 0,
                    reports.length,
                    groupIndex,
                    reports,
                );
                fragment.appendChild(newRow);
            });
        });

    tableBody.appendChild(fragment);

    // Initialize Lucide icons for new content
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    console.log(`[TABLE] Rendered ${sortedData.length} filtered reports`);
}

// Export the new function
window.renderFilteredTable = renderFilteredTable;

function exportToExcel() {
    if (!hasPermission(1)) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                "Không có quyền xuất dữ liệu",
                3000,
                "Từ chối truy cập",
            );
        } else {
            showError("Không có quyền xuất dữ liệu");
        }
        return;
    }

    try {
        let exportNotificationId = null;
        if (globalNotificationManager) {
            exportNotificationId = globalNotificationManager.processing(
                "Đang chuẩn bị file Excel...",
            );
        } else {
            showLoading("Đang chuẩn bị file Excel...");
        }

        const wsData = [
            [
                "Ngày",
                "Phiên",
                "Tiền QC",
                "Thời gian",
                "Số món trên live",
                "Số món inbox",
            ],
        ];

        const tableRows = document.querySelectorAll("#tableBody tr");
        let exportedRowCount = 0;

        tableRows.forEach(function (row) {
            if (row.style.display !== "none") {
                const rowData = [];

                // Check if this row has the date cell
                const dateCell = row.cells[0];
                if (dateCell && dateCell.classList.contains("border-r")) {
                    rowData.push(dateCell.textContent.trim());
                } else {
                    rowData.push(""); // Empty for continuation rows
                }

                // Extract period from badge
                const periodBadge = row.querySelector(".inline-flex");
                const period = periodBadge
                    ? periodBadge.textContent.trim()
                    : "";
                rowData.push(period);

                // Extract values from cells
                for (let i = 1; i < Math.min(row.cells.length, 5); i++) {
                    const text = row.cells[i].textContent.trim();
                    rowData.push(text);
                }

                wsData.push(rowData);
                exportedRowCount++;
            }
        });

        if (exportedRowCount === 0) {
            if (globalNotificationManager) {
                globalNotificationManager.clearAll();
                globalNotificationManager.warning(
                    "Không có dữ liệu để xuất ra Excel",
                    3000,
                );
            } else {
                showError("Không có dữ liệu để xuất ra Excel");
            }
            return;
        }

        if (typeof XLSX === "undefined") {
            if (globalNotificationManager) {
                globalNotificationManager.clearAll();
                globalNotificationManager.error(
                    "Thư viện Excel không khả dụng. Vui lòng tải lại trang",
                    4000,
                    "Lỗi",
                );
            } else {
                showError(
                    "Thư viện Excel không khả dụng. Vui lòng tải lại trang",
                );
            }
            return;
        }

        setTimeout(() => {
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Báo cáo Livestream");

            const fileName = `baocao_livestream_${new Date().toISOString().split("T")[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);

            if (globalNotificationManager) {
                globalNotificationManager.clearAll();
                globalNotificationManager.success(
                    `Đã xuất ${exportedRowCount} báo cáo ra Excel!`,
                    2000,
                    "Thành công",
                );
            } else {
                showSuccess(`Đã xuất ${exportedRowCount} báo cáo ra Excel!`);
            }
        }, 500);
    } catch (error) {
        console.error("[TABLE] Error exporting to Excel:", error);

        if (globalNotificationManager) {
            globalNotificationManager.clearAll();
            globalNotificationManager.error(
                "Có lỗi xảy ra khi xuất dữ liệu ra Excel: " + error.message,
                4000,
                "Lỗi",
            );
        } else {
            showError("Có lỗi xảy ra khi xuất dữ liệu ra Excel");
        }
    }
}

// Export functions
window.renderTableFromData = renderTableFromData;
window.updateTable = updateTable;
window.initializeTableEvents = initializeTableEvents;
window.exportToExcel = exportToExcel;
window.sortDataWithTimePeriod = sortDataWithTimePeriod;
window.getTimePeriodFromData = getTimePeriodFromData;
window.groupDataByDate = groupDataByDate;
window.createGroupedTableRow = createGroupedTableRow;
window.handleDeleteButton = handleDeleteButton;
window.hasInboxBeenEdited = hasInboxBeenEdited;
window.getDefaultFilterRange = getDefaultFilterRange;
window.isFilterInitialized = isFilterInitialized;
