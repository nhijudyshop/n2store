// js/modals.js - Modal Management System

function closeModal() {
    if (editModal) {
        editModal.style.display = "none";
    }
    editingRow = null;
}

function saveUpdatedChanges() {
    const editDate = document.getElementById("editDate");
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
        if (globalNotificationManager) {
            globalNotificationManager.error(
                "Không tìm thấy hàng cần chỉnh sửa",
                3000,
            );
        } else {
            showError("Không tìm thấy hàng cần chỉnh sửa.");
        }
        return;
    }

    const cells = editingRow.cells;

    // Find the date cell and related cells
    let dateCell = null;
    let cellIndex = 0;
    for (let i = 0; i < cells.length; i++) {
        if (cells[i].getAttribute("data-id")) {
            dateCell = cells[i];
            cellIndex = i;
            break;
        }
    }

    if (!dateCell) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                "Không tìm thấy thông tin ngày",
                3000,
            );
        } else {
            showError("Không tìm thấy thông tin ngày");
        }
        return;
    }

    const currentRowData = {
        date: dateCell.innerText,
        tienQC: cells[cellIndex + 1].innerText,
        thoiGian: cells[cellIndex + 2].innerText,
        soMonLive: cells[cellIndex + 3].innerText,
        soMonInbox: cells[cellIndex + 4].innerText,
    };

    // Prepare values based on user permission level
    let finalValues = {};

    if (userLevel <= 1) {
        // Level 0 and 1 can edit everything - validate all fields
        const dateValue = editDate.value;
        const tienQCValue = editTienQC.value.trim();
        const soMonLiveValue = editSoMonLive.value.trim();
        const soMonInboxValue = editSoMonInbox.value.trim();

        // Validation for full edit permission
        if (!dateValue || !tienQCValue) {
            if (globalNotificationManager) {
                globalNotificationManager.warning(
                    "Vui lòng điền đầy đủ thông tin bắt buộc",
                    3000,
                    "Thiếu thông tin",
                );
            } else {
                showError("Vui lòng điền đầy đủ thông tin bắt buộc.");
            }
            return;
        }

        const cleanAmount = tienQCValue.replace(/[,\.]/g, "");
        const numAmount = parseFloat(cleanAmount);
        if (isNaN(numAmount) || numAmount <= 0) {
            if (globalNotificationManager) {
                globalNotificationManager.error(
                    "Số tiền QC không hợp lệ",
                    3000,
                    "Dữ liệu không hợp lệ",
                );
            } else {
                showError("Số tiền QC không hợp lệ.");
            }
            return;
        }

        // Validate và format time (24h format)
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
                if (globalNotificationManager) {
                    globalNotificationManager.error(
                        "Thời gian không hợp lệ",
                        3000,
                        "Dữ liệu không hợp lệ",
                    );
                } else {
                    showError("Thời gian không hợp lệ.");
                }
                return;
            }
        }

        // Validate số món - allow 0 values
        if (isNaN(soMonLiveValue) || parseInt(soMonLiveValue) < 0) {
            if (globalNotificationManager) {
                globalNotificationManager.error(
                    "Số món trên live phải là số không âm",
                    3000,
                    "Dữ liệu không hợp lệ",
                );
            } else {
                showError("Số món trên live phải là số không âm.");
            }
            return;
        }

        if (isNaN(soMonInboxValue) || parseInt(soMonInboxValue) < 0) {
            if (globalNotificationManager) {
                globalNotificationManager.error(
                    "Số món inbox phải là số không âm (có thể là 0)",
                    3000,
                    "Dữ liệu không hợp lệ",
                );
            } else {
                showError("Số món inbox phải là số không âm (có thể là 0).");
            }
            return;
        }

        // Convert date back to timestamp
        const dateObj = new Date(dateValue);
        const editDateTimestamp =
            dateObj.getTime() +
            (new Date().getMinutes() * 60 + new Date().getSeconds()) * 1000;

        // Format data with suffixes
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
            if (globalNotificationManager) {
                globalNotificationManager.error(
                    "Số món inbox phải là số không âm (có thể là 0)",
                    3000,
                    "Dữ liệu không hợp lệ",
                );
            } else {
                showError("Số món inbox phải là số không âm (có thể là 0).");
            }
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
            tienQC: currentRowData.tienQC,
            thoiGian: currentRowData.thoiGian,
            soMonLive: currentRowData.soMonLive,
            soMonInbox: finalSoMonInbox, // Only this field changes
        };
    } else {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                "Không có quyền chỉnh sửa",
                3000,
                "Từ chối truy cập",
            );
        } else {
            showError("Không có quyền chỉnh sửa.");
        }
        return;
    }

    const recordId = dateCell.getAttribute("data-id");
    if (!recordId) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                "Không tìm thấy ID của báo cáo",
                3000,
            );
        } else {
            showError("Không tìm thấy ID của báo cáo.");
        }
        return;
    }

    let saveNotificationId = null;
    if (globalNotificationManager) {
        saveNotificationId = globalNotificationManager.saving(
            "Đang lưu thay đổi...",
        );
    } else {
        showLoading("Đang lưu thay đổi...");
    }

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
                    ...finalValues,
                };

                // Create comprehensive edit history entry
                const editHistoryEntry = {
                    timestamp: new Date().toISOString(),
                    editedBy: currentUser,
                    oldData: {
                        dateCell: oldData.dateCell,
                        tienQC: oldData.tienQC,
                        thoiGian: oldData.thoiGian,
                        soMonLive: oldData.soMonLive,
                        soMonInbox: oldData.soMonInbox,
                    },
                    newData: {
                        dateCell: newData.dateCell,
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
                // Log action (safe call)
                const actionText =
                    userLevel === 2
                        ? "Sửa số món inbox"
                        : "Sửa báo cáo livestream";

                if (typeof logAction === "function") {
                    logAction(
                        "edit",
                        `${actionText}: ${finalValues.tienQC}`,
                        null,
                        null,
                    );
                } else {
                    console.log(
                        `[ACTION] Edit: ${actionText}: ${finalValues.tienQC}`,
                    );
                }

                // Invalidate cache
                invalidateCache();

                // Close modal first
                closeModal();

                // Show success message
                if (globalNotificationManager) {
                    globalNotificationManager.clearAll();
                    globalNotificationManager.success(
                        "Đã lưu thay đổi thành công!",
                        2000,
                        "Thành công",
                    );
                } else {
                    showSuccess("Đã lưu thay đổi thành công!");
                }

                // Reload table data
                setTimeout(() => {
                    console.log(
                        "[MODALS] Reloading table after editing report...",
                    );
                    if (typeof updateTable === "function") {
                        updateTable(true); // Giữ nguyên filter hiện tại
                    }
                }, 500);
            })
            .catch((error) => {
                console.error("Error updating document:", error);

                if (globalNotificationManager) {
                    globalNotificationManager.clearAll();
                    globalNotificationManager.error(
                        "Lỗi khi cập nhật dữ liệu: " + error.message,
                        4000,
                        "Lỗi",
                    );
                } else {
                    showError("Lỗi khi cập nhật dữ liệu: " + error.message);
                }
            });
    } catch (error) {
        console.error("Error in saveUpdatedChanges:", error);

        if (globalNotificationManager) {
            globalNotificationManager.clearAll();
            globalNotificationManager.error(
                "Lỗi: " + error.message,
                4000,
                "Lỗi",
            );
        } else {
            showError("Lỗi: " + error.message);
        }
    }
}

// Edit History Modal Functions
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
            <button id="closeHistoryModalBtn" style="
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
                    hour12: false, // Use 24h format
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

    // Add event listener for close button
    const closeBtn = document.getElementById("closeHistoryModalBtn");
    if (closeBtn) {
        closeBtn.addEventListener("click", removeEditHistoryModal);
    }

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

    // Special formatting for date fields (24h format)
    if (field === "dateCell" && !isNaN(value)) {
        const date = new Date(parseInt(value));
        if (!isNaN(date.getTime())) {
            return date.toLocaleString("vi-VN", { hour12: false });
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

// Export functions
window.closeModal = closeModal;
window.saveUpdatedChanges = saveUpdatedChanges;
window.showEditHistoryModal = showEditHistoryModal;
window.removeEditHistoryModal = removeEditHistoryModal;

// Setup close modal event listener when DOM is ready
document.addEventListener("DOMContentLoaded", function () {
    // Setup close button for edit modal with delay to ensure DOM is ready
    setTimeout(() => {
        const closeEditModalBtn = document.getElementById("closeEditModalBtn");
        if (closeEditModalBtn) {
            closeEditModalBtn.addEventListener("click", closeModal);
            console.log("[MODALS] Close modal button event listener attached");
        }
    }, 100);
});

// Additional safety setup for modal close functionality
window.addEventListener("load", function () {
    setTimeout(() => {
        const closeEditModalBtn = document.getElementById("closeEditModalBtn");
        if (closeEditModalBtn && typeof closeModal === "function") {
            // Remove existing listeners to prevent duplicates
            closeEditModalBtn.removeEventListener("click", closeModal);
            closeEditModalBtn.addEventListener("click", closeModal);
            console.log(
                "[MODALS] Modal close button re-attached on window load",
            );
        }
    }, 100);
});
