// table-management.js - Table & Data Management
// Livestream Report Management System

// =====================================================
// ENHANCED SORTING FUNCTION WITH TIME PERIOD PRIORITY
// =====================================================

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
            // Less than 24 hours difference
            const periodA = getTimePeriodFromData(a);
            const periodB = getTimePeriodFromData(b);

            // Priority order: Sáng (1), Chiều (2), Tối (3)
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

// =====================================================
// TABLE MANAGEMENT FUNCTIONS
// =====================================================

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

    tableBody.innerHTML = "";
    const uniqueDates = new Set();
    const fragment = document.createDocumentFragment();

    const maxRender = Math.min(sortedData.length, MAX_VISIBLE_ROWS);

    for (let i = 0; i < maxRender; i++) {
        const item = sortedData[i];
        const timestamp = parseFloat(item.dateCell);
        const dateCellConvert = new Date(timestamp);

        // Extract start time and create formatted date with period
        let formattedTime = formatDate(dateCellConvert); // Basic format as fallback
        if (item.thoiGian) {
            const timePattern = /Từ\s+(\d{1,2})h(\d{1,2})m/;
            const match = item.thoiGian.match(timePattern);
            if (match) {
                const startHour = parseInt(match[1]);
                const startMin = parseInt(match[2]);
                const startTime = `${startHour.toString().padStart(2, "0")}:${startMin.toString().padStart(2, "0")}`;
                formattedTime = formatDateWithPeriod(
                    dateCellConvert,
                    startTime,
                );
            }
        }

        if (formattedTime) {
            uniqueDates.add(formattedTime);
            const newRow = createTableRow(item, formattedTime);
            fragment.appendChild(newRow);
        }
    }

    tableBody.appendChild(fragment);
    arrayDate = Array.from(uniqueDates);

    createFilterSystem();

    console.log(
        `Rendered ${maxRender} / ${sortedData.length} reports with time periods and proper sorting`,
    );
}

function createTableRow(item, dateStr) {
    const newRow = document.createElement("tr");

    // Check if item has edit history
    const hasEditHistory = item.editHistory && item.editHistory.length > 0;

    // Get auth state for styling decisions
    const auth = getAuthState();
    const isAdmin = auth && parseInt(auth.checkLogin) === 0;

    // Apply styling based on edit history and admin status
    if (hasEditHistory) {
        if (isAdmin) {
            newRow.classList.add("edited-row");
            newRow.style.borderLeft = "4px solid #ffc107";
            newRow.style.backgroundColor = "#fff3cd";
            newRow.title = "Hàng này đã được chỉnh sửa - Click để xem lịch sử";
            newRow.style.cursor = "pointer";
        }
    } else if (isAdmin) {
        newRow.classList.add("admin-clickable-row");
        newRow.style.borderLeft = "4px solid #17a2b8";
        newRow.style.backgroundColor = "#d1ecf1";
        newRow.style.cursor = "pointer";
        newRow.title = "Click để xem thông tin tạo (Admin only)";
    }

    // Extract start time from thoiGian if available
    let displayDate = dateStr;
    if (item.thoiGian) {
        const timePattern = /Từ\s+(\d{1,2})h(\d{1,2})m/;
        const match = item.thoiGian.match(timePattern);
        if (match) {
            const startHour = parseInt(match[1]);
            const startMin = parseInt(match[2]);
            const startTime = `${startHour.toString().padStart(2, "0")}:${startMin.toString().padStart(2, "0")}`;

            const dateParts = dateStr.split("-");
            if (dateParts.length === 3) {
                const day = parseInt(dateParts[0]);
                const month = parseInt(dateParts[1]);
                let year = parseInt(dateParts[2]);
                if (year < 100) {
                    year = year < 50 ? 2000 + year : 1900 + year;
                }
                const fullDate = new Date(year, month - 1, day);
                displayDate = formatDateWithPeriod(fullDate, startTime);
            }
        }
    }

    // Helper function to format soMonInbox - show empty if 0
    function formatSoMonInbox(value) {
        if (!value || value === "0" || value === 0 || value === "0 món") {
            return ""; // Return empty string when value is 0
        }
        if (typeof value === "string" && value.includes(" món")) {
            return value;
        }
        return value + " món";
    }

    // Helper function to format other số món fields (soMonLive) - show "0 món" when 0
    function formatSoMonOther(value) {
        if (!value || value === "") {
            return "0 món";
        }
        if (typeof value === "string" && value.includes(" món")) {
            return value;
        }
        return value + " món";
    }

    const cells = [
        { content: sanitizeInput(displayDate), id: item.id },
        {
            content:
                sanitizeInput(item.mauLive || "") +
                (hasEditHistory ? ' <span class="edit-indicator"></span>' : ""),
        },
        {
            content: item.tienQC
                ? numberWithCommas(
                      sanitizeInput(item.tienQC.toString()).replace(
                          /[,\.]/g,
                          "",
                      ),
                  )
                : "0",
        },
        { content: sanitizeInput(item.thoiGian || "") },
        { content: formatSoMonOther(item.soMonLive) },
        { content: formatSoMonInbox(item.soMonInbox) },
        { content: null, type: "edit" },
        { content: null, type: "delete", userId: item.user || "Unknown" },
    ];

    cells.forEach((cellData, index) => {
        const cell = document.createElement("td");

        if (cellData.type === "edit") {
            const editButton = document.createElement("button");
            editButton.className = "edit-button";
            editButton.addEventListener("mouseenter", () => {
                editButton.style.backgroundColor = "#f8f9fa";
            });
            editButton.addEventListener("mouseleave", () => {
                editButton.style.backgroundColor = "transparent";
            });
            cell.appendChild(editButton);
        } else if (cellData.type === "delete") {
            const deleteButton = document.createElement("button");
            deleteButton.className = "delete-button";
            deleteButton.setAttribute("data-user", cellData.userId);
            deleteButton.addEventListener("mouseenter", () => {
                deleteButton.style.backgroundColor = "#ffe6e6";
            });
            deleteButton.addEventListener("mouseleave", () => {
                deleteButton.style.backgroundColor = "transparent";
            });
            cell.appendChild(deleteButton);
        } else {
            if (
                cellData.content &&
                cellData.content.includes('<span class="edit-indicator">')
            ) {
                cell.innerHTML = cellData.content;
            } else {
                cell.textContent = cellData.content;
            }
            if (cellData.id) cell.setAttribute("data-id", cellData.id);
        }

        newRow.appendChild(cell);
    });

    // Store edit history data on the row for tooltip access
    if (hasEditHistory) {
        newRow.setAttribute(
            "data-edit-history",
            JSON.stringify(item.editHistory),
        );
    }

    // Add click event for ADMIN to view history/info
    if (isAdmin) {
        newRow.addEventListener("click", function (e) {
            if (
                e.target.classList.contains("edit-button") ||
                e.target.classList.contains("delete-button") ||
                e.target.closest("button")
            ) {
                return;
            }

            if (hasEditHistory && typeof showEditHistoryModal === "function") {
                showEditHistoryModal(item.editHistory, {
                    mauLive: item.mauLive,
                    tienQC: item.tienQC,
                    thoiGian: item.thoiGian,
                    soMonLive: item.soMonLive,
                    soMonInbox: item.soMonInbox,
                });
            }
        });
    }

    // Apply role-based permissions
    if (auth) {
        applyRowPermissions(newRow, parseInt(auth.checkLogin));
    }

    return newRow;
}

function applyRowPermissions(row, userRole) {
    const deleteCell = row.cells[7];
    const editCell = row.cells[6];

    if (userRole === 0) {
        deleteCell.style.visibility = "visible";
        editCell.style.visibility = "visible";
    } else if (userRole === 1) {
        deleteCell.style.visibility = "hidden";
        editCell.style.visibility = "visible";
    } else if (userRole === 2) {
        deleteCell.style.visibility = "hidden";
        editCell.style.visibility = "visible";
    } else {
        deleteCell.style.visibility = "hidden";
        editCell.style.visibility = "hidden";
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

// =====================================================
// TABLE EVENT HANDLERS
// =====================================================

function initializeTableEvents() {
    if (!tableBody) return;

    tableBody.addEventListener("click", function (e) {
        const auth = getAuthState();
        if (!auth || auth.checkLogin == "777") {
            return;
        }

        if (e.target.classList.contains("edit-button")) {
            handleEditButton(e);
        } else if (e.target.classList.contains("delete-button")) {
            handleDeleteButton(e);
        }
    });
}

function handleEditButton(e) {
    if (!editModal) return;

    editModal.style.display = "block";

    const editDate = document.getElementById("editDate");
    const editMauLive = document.getElementById("editMauLive");
    const editTienQC = document.getElementById("editTienQC");
    const editSoMonLive = document.getElementById("editSoMonLive");
    const editSoMonInbox = document.getElementById("editSoMonInbox");

    const hh1 = document.getElementById("editHh1");
    const mm1 = document.getElementById("editMm1");
    const hh2 = document.getElementById("editHh2");
    const mm2 = document.getElementById("editMm2");

    const row = e.target.parentNode.parentNode;
    const date = row.cells[0].innerText;
    const mauLive = row.cells[1].innerText;
    const tienQC = row.cells[2].innerText;
    const thoiGian = row.cells[3].innerText;
    const soMonLive = row.cells[4].innerText;
    const soMonInbox = row.cells[5].innerText;

    const auth = getAuthState();
    const userLevel = parseInt(auth.checkLogin);

    // Set values for all fields first
    if (editDate) {
        let cleanDate = date;
        const periodPattern = /\s*\((Sáng|Chiều|Tối)\)$/;
        if (periodPattern.test(date)) {
            cleanDate = date.replace(periodPattern, "").trim();
        }

        const parts = cleanDate.split("-");
        if (parts.length === 3) {
            const day = parts[0];
            const month = parts[1];
            let year = parseInt(parts[2]);
            if (year < 100) {
                year = year < 50 ? 2000 + year : 1900 + year;
            }
            editDate.value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }
    }

    if (editMauLive) {
        let cleanMauLive = mauLive
            .replace(" mẫu", "")
            .replace(" ✨", "")
            .replace(/\s*<span[^>]*>.*?<\/span>\s*/g, "");
        editMauLive.value = cleanMauLive;
    }

    if (editTienQC) {
        editTienQC.value = tienQC;
    }

    // Parse time from format "Từ 20h00m đến 22h00m - 2h0m"
    if (thoiGian && thoiGian.trim()) {
        const timePattern =
            /Từ\s+(\d{1,2})h(\d{1,2})m\s+đến\s+(\d{1,2})h(\d{1,2})m/;
        const match = thoiGian.match(timePattern);

        if (match) {
            const [, startHour, startMin, endHour, endMin] = match;
            if (hh1) hh1.value = startHour;
            if (mm1) mm1.value = startMin;
            if (hh2) hh2.value = endHour;
            if (mm2) mm2.value = endMin;
            if (hh1.value < 12 && !hasPermission(0)) {
                editModal.style.display = "none";
                return;
            }
        } else {
            if (hh1) hh1.value = "";
            if (mm1) mm1.value = "";
            if (hh2) hh2.value = "";
            if (mm2) mm2.value = "";
        }
    } else {
        if (hh1) hh1.value = "";
        if (mm1) mm1.value = "";
        if (hh2) hh2.value = "";
        if (mm2) mm2.value = "";
    }

    if (editSoMonLive) {
        let cleanSoMonLive = soMonLive.replace(" món", "");
        editSoMonLive.value = cleanSoMonLive;
    }

    // Handle soMonInbox - if empty, set to 0 for editing
    if (editSoMonInbox) {
        if (soMonInbox.trim() === "") {
            editSoMonInbox.value = "0";
        } else {
            let cleanSoMonInbox = soMonInbox.replace(" món", "");
            editSoMonInbox.value = cleanSoMonInbox;
        }
    }

    // Apply permissions based on user level
    if (userLevel <= 1) {
        if (editDate) editDate.disabled = false;
        if (editMauLive) editMauLive.disabled = false;
        if (editTienQC) editTienQC.disabled = false;
        if (hh1) hh1.disabled = false;
        if (mm1) mm1.disabled = false;
        if (hh2) hh2.disabled = false;
        if (mm2) mm2.disabled = false;
        if (editSoMonLive) editSoMonLive.disabled = false;
        if (editSoMonInbox) editSoMonInbox.disabled = false;
    } else if (userLevel === 2) {
        if (editDate) {
            editDate.disabled = true;
            editDate.style.backgroundColor = "#f8f9fa";
        }
        if (editMauLive) {
            editMauLive.readOnly = true;
            editMauLive.style.backgroundColor = "#f8f9fa";
        }
        if (editTienQC) {
            editTienQC.readOnly = true;
            editTienQC.style.backgroundColor = "#f8f9fa";
        }
        if (hh1) {
            hh1.readOnly = true;
            hh1.style.backgroundColor = "#f8f9fa";
        }
        if (mm1) {
            mm1.readOnly = true;
            mm1.style.backgroundColor = "#f8f9fa";
        }
        if (hh2) {
            hh2.readOnly = true;
            hh2.style.backgroundColor = "#f8f9fa";
        }
        if (mm2) {
            mm2.readOnly = true;
            mm2.style.backgroundColor = "#f8f9fa";
        }
        if (editSoMonLive) {
            editSoMonLive.readOnly = true;
            editSoMonLive.style.backgroundColor = "#f8f9fa";
        }
        if (editSoMonInbox) {
            editSoMonInbox.disabled = false;
            editSoMonInbox.readOnly = false;
            editSoMonInbox.style.backgroundColor = "white";
        }
    } else {
        if (editDate) editDate.disabled = true;
        if (editMauLive) editMauLive.disabled = true;
        if (editTienQC) editTienQC.disabled = true;
        if (hh1) hh1.disabled = true;
        if (mm1) mm1.disabled = true;
        if (hh2) hh2.disabled = true;
        if (mm2) mm2.disabled = true;
        if (editSoMonLive) editSoMonLive.disabled = true;
        if (editSoMonInbox) editSoMonInbox.disabled = true;
    }

    editingRow = row;
}

function handleDeleteButton(e) {
    if (!hasPermission(0)) {
        showError("Không đủ quyền thực hiện chức năng này.");
        return;
    }

    const confirmDelete = confirm("Bạn có chắc chắn muốn xóa?");
    if (!confirmDelete) return;

    const row = e.target.closest("tr");
    const firstCell = row.querySelector("td");

    if (!row || !firstCell) return;

    const recordId = firstCell.getAttribute("data-id");
    if (!recordId) {
        showError("Không tìm thấy ID báo cáo");
        return;
    }

    showLoading("Đang xóa báo cáo...");

    const oldData = {
        id: recordId,
        mauLive: row.cells[1].innerText,
        tienQC: row.cells[2].innerText,
        thoiGian: row.cells[3].innerText,
        soMonLive: row.cells[4].innerText,
        soMonInbox: row.cells[5].innerText,
    };

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
                (item) => item.id !== recordId,
            );

            return collectionRef.doc("reports").update({ data: updatedArray });
        })
        .then(() => {
            logAction(
                "delete",
                `Xóa báo cáo livestream: ${oldData.mauLive}`,
                oldData,
                null,
            );
            invalidateCache();
            row.remove();
            showSuccess("Đã xóa báo cáo thành công!");
        })
        .catch((error) => {
            console.error("Error deleting report:", error);
            showError("Lỗi khi xóa báo cáo");
        });
}

// =====================================================
// EXPORT FUNCTIONS
// =====================================================

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
                "Mẫu live",
                "Tiền QC",
                "Thời gian",
                "Số món trên live",
                "Số món inbox",
            ],
        ];

        const tableRows = document.querySelectorAll("#tableBody tr");
        let exportedRowCount = 0;

        tableRows.forEach(function (row) {
            if (
                row.style.display !== "none" &&
                row.cells &&
                row.cells.length >= 6
            ) {
                const rowData = [];

                rowData.push(row.cells[0].textContent || "");
                rowData.push(row.cells[1].textContent || "");
                rowData.push(row.cells[2].textContent || "");
                rowData.push(row.cells[3].textContent || "");
                rowData.push(row.cells[4].textContent || "");
                rowData.push(row.cells[5].textContent || "");

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

// =====================================================
// EXPORT FUNCTIONS FOR GLOBAL USE
// =====================================================

// Export functions to window object for global access
window.renderTableFromData = renderTableFromData;
window.updateTable = updateTable;
window.initializeTableEvents = initializeTableEvents;
window.exportToExcel = exportToExcel;
window.sortDataWithTimePeriod = sortDataWithTimePeriod;
window.getTimePeriodFromData = getTimePeriodFromData;
window.createTableRow = createTableRow;
window.applyRowPermissions = applyRowPermissions;
window.handleEditButton = handleEditButton;
window.handleDeleteButton = handleDeleteButton;
