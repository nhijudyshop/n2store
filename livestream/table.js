// js/table.js - Table Management System with Grouped View

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

// Table Management Functions
function renderTableFromData(dataArray, applyInitialFilter = false) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
        console.log("No data to render");
        createFilterSystem();
        return;
    }

    arrayData = [...dataArray];

    if (applyInitialFilter) {
        const today = new Date().toISOString().split("T")[0];
        currentFilters.startDate = today;
        currentFilters.endDate = today;
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

    createFilterSystem();

    console.log(`Rendered ${sortedData.length} reports in grouped format`);
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

    // Combined action buttons cell (only on first row with rowspan)
    if (isFirstRow) {
        const actionCell = document.createElement("td");
        actionCell.className = "p-4 align-middle text-center border-l";
        actionCell.rowSpan = rowCount;

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
            applyButtonPermissions(
                editBtn,
                deleteBtn,
                parseInt(auth.checkLogin),
            );
        }
    }

    // Store data on row for edit/delete operations
    newRow.setAttribute("data-report-id", item.id);
    newRow.setAttribute(
        "data-all-reports",
        JSON.stringify(allReportsInGroup.map((r) => r.id)),
    );

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

function updateTable() {
    const cachedData = getCachedData();
    if (cachedData) {
        console.log("Loading from cache...");
        showLoading("Đang tải dữ liệu từ cache...");
        setTimeout(() => {
            renderTableFromData(cachedData, true);
            hideFloatingAlert();
        }, 100);
        return;
    }

    console.log("Loading from Firebase...");
    showLoading("Đang tải dữ liệu từ Firebase...");

    collectionRef
        .doc("reports")
        .get()
        .then((doc) => {
            if (doc.exists) {
                const data = doc.data();
                if (Array.isArray(data["data"]) && data["data"].length > 0) {
                    renderTableFromData(data["data"], true);
                    setCachedData(data["data"]);
                    showSuccess("Đã tải xong dữ liệu!");
                } else {
                    console.log("No data found or data array is empty");
                    createFilterSystem();
                    showError("Không có dữ liệu");
                }
            } else {
                console.log("Document does not exist");
                createFilterSystem();
                showError("Tài liệu không tồn tại");
            }
        })
        .catch((error) => {
            console.error("Error getting document:", error);
            createFilterSystem();
            showError("Lỗi khi tải dữ liệu từ Firebase");
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
        showError("Không đủ quyền thực hiện chức năng này.");
        return;
    }

    const confirmDelete = confirm(
        "Bạn có chắc chắn muốn xóa toàn bộ báo cáo ngày này?",
    );
    if (!confirmDelete) return;

    const row = e.target.closest("tr");
    const allReportIds = JSON.parse(
        row.getAttribute("data-all-reports") || "[]",
    );

    if (allReportIds.length === 0) {
        showError("Không tìm thấy ID báo cáo");
        return;
    }

    showLoading("Đang xóa báo cáo...");

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
                (item) => !allReportIds.includes(item.id),
            );

            return collectionRef.doc("reports").update({ data: updatedArray });
        })
        .then(() => {
            logAction(
                "delete",
                `Xóa ${allReportIds.length} báo cáo livestream`,
                null,
                null,
            );
            invalidateCache();
            updateTable();
            showSuccess("Đã xóa báo cáo thành công!");
        })
        .catch((error) => {
            console.error("Error deleting report:", error);
            showError("Lỗi khi xóa báo cáo");
        });
}

function exportToExcel() {
    if (!hasPermission(1)) {
        showError("Không có quyền xuất dữ liệu");
        return;
    }

    try {
        showLoading("Đang chuẩn bị file Excel...");

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
            showError("Không có dữ liệu để xuất ra Excel");
            return;
        }

        if (typeof XLSX === "undefined") {
            showError("Thư viện Excel không khả dụng. Vui lòng tải lại trang");
            return;
        }

        setTimeout(() => {
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Báo cáo Livestream");

            const fileName = `baocao_livestream_${new Date().toISOString().split("T")[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);

            showSuccess(`Đã xuất ${exportedRowCount} báo cáo ra Excel!`);
        }, 500);
    } catch (error) {
        console.error("Error exporting to Excel:", error);
        showError("Có lỗi xảy ra khi xuất dữ liệu ra Excel");
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
