// Enhanced Goods Receipt Management System - Utility Functions
// Helper functions for data processing, formatting, and validation

// =====================================================
// CACHE FUNCTIONS
// =====================================================

function getCachedData() {
    try {
        if (memoryCache.data && memoryCache.timestamp) {
            if (Date.now() - memoryCache.timestamp < CACHE_EXPIRY) {
                console.log("Using cached data - will sort before rendering");
                return sortDataByNewest([...memoryCache.data]);
            } else {
                console.log("Cache expired, clearing");
                invalidateCache();
            }
        }
    } catch (e) {
        console.warn("Error accessing cache:", e);
        invalidateCache();
    }
    return null;
}

function setCachedData(data) {
    try {
        const sortedData = sortDataByNewest([...data]);
        memoryCache.data = sortedData;
        memoryCache.timestamp = Date.now();
        console.log("Data sorted and cached successfully");
    } catch (e) {
        console.warn("Cannot cache data:", e);
    }
}

function invalidateCache() {
    memoryCache.data = null;
    memoryCache.timestamp = null;
    console.log("Cache invalidated");
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>"'&]/g, "").trim();
}

function numberWithCommas(x) {
    if (!x && x !== 0) return "0";
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDate(date) {
    if (!date || !(date instanceof Date)) return "";
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${day}/${month}/${year}`;
}

function formatCurrency(amount) {
    if (!amount && amount !== 0) return "0 kg";
    return numberWithCommas(amount) + " kg";
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// =====================================================
// ID GENERATION SYSTEM
// =====================================================

function generateUniqueID() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `receipt_${timestamp}_${random}`;
}

function generateUniqueFileName() {
    return Date.now() + "_" + Math.random().toString(36).substr(2, 9) + ".jpg";
}

// =====================================================
// FORM HANDLING FUNCTIONS
// =====================================================

function getFormattedDateTime() {
    const currentDate = new Date();
    const day = currentDate.getDate().toString().padStart(2, "0");
    const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
    const year = currentDate.getFullYear();
    const hour = currentDate.getHours().toString().padStart(2, "0");
    const minute = currentDate.getMinutes().toString().padStart(2, "0");
    return `${day}/${month}/${year}, ${hour}:${minute}`;
}

function setCurrentUserName() {
    if (tenNguoiNhanInput) {
        const userName = getUserName();
        tenNguoiNhanInput.value = userName;
        tenNguoiNhanInput.setAttribute("readonly", true);
    }
}

function initializeInputValidation() {
    if (soKgInput) {
        soKgInput.addEventListener("input", function () {
            const enteredValue = parseFloat(soKgInput.value);
            if (enteredValue < 0) {
                soKgInput.value = "0";
            }
        });
    }
}

function getSelectedPackaging() {
    const selectedRadio = document.querySelector('input[name="baoBi"]:checked');
    return selectedRadio ? selectedRadio.value : null;
}

function getSelectedEditPackaging() {
    const selectedRadio = document.querySelector(
        'input[name="editBaoBi"]:checked',
    );
    return selectedRadio ? selectedRadio.value : null;
}

function setPackagingValue(value) {
    const radio = document.querySelector(
        `input[name="baoBi"][value="${value}"]`,
    );
    if (radio) {
        radio.checked = true;
    }
}

function setEditPackagingValue(value) {
    const radio = document.querySelector(
        `input[name="editBaoBi"][value="${value}"]`,
    );
    if (radio) {
        radio.checked = true;
    }
}

function getPackagingText(value) {
    return value === "co" ? "Có bao bì" : "Không có bao bì";
}

// =====================================================
// LOGGING FUNCTIONS
// =====================================================

function logAction(
    action,
    description,
    oldData = null,
    newData = null,
    pageName = "Nhận Hàng",
) {
    const logEntry = {
        timestamp: new Date(),
        user: getUserName(),
        page: pageName,
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    };

    historyCollectionRef
        .add(logEntry)
        .then(() => {
            console.log("Log entry saved successfully");
        })
        .catch((error) => {
            console.error("Error saving log entry: ", error);
        });
}

// =====================================================
// SORTING FUNCTIONS
// =====================================================

function sortDataByNewest(dataArray) {
    if (!Array.isArray(dataArray)) return dataArray;

    return dataArray.sort((a, b) => {
        const timeA = parseVietnameseDate(a.thoiGianNhan);
        const timeB = parseVietnameseDate(b.thoiGianNhan);

        if (!timeA && !timeB) {
            const timestampA = extractTimestampFromId(a.id);
            const timestampB = extractTimestampFromId(b.id);
            return timestampB - timestampA;
        }

        if (!timeA) return 1;
        if (!timeB) return -1;

        return timeB - timeA;
    });
}

function parseVietnameseDate(dateString) {
    if (!dateString) return null;

    try {
        const cleanDateString = dateString.replace(/,?\s*/g, " ").trim();

        const patterns = [
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})/,
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
        ];

        for (let pattern of patterns) {
            const match = cleanDateString.match(pattern);
            if (match) {
                const [, day, month, year, hour = 0, minute = 0] = match;
                return new Date(
                    parseInt(year),
                    parseInt(month) - 1,
                    parseInt(day),
                    parseInt(hour),
                    parseInt(minute),
                );
            }
        }

        const date = new Date(dateString);
        return isNaN(date.getTime()) ? null : date;
    } catch (error) {
        console.warn("Error parsing date:", dateString, error);
        return null;
    }
}

function extractTimestampFromId(id) {
    if (!id || !id.startsWith("receipt_")) return 0;

    try {
        const parts = id.split("_");
        if (parts.length >= 2) {
            return parseInt(parts[1], 36);
        }
    } catch (error) {
        console.warn("Error extracting timestamp from ID:", id, error);
    }

    return 0;
}

// =====================================================
// UI ALERT FUNCTIONS - USE UIMANAGER
// =====================================================

// These functions now use the UIManager from ui.js
function showLoading(message) {
    if (window.uiManager) {
        window.uiManager.showLoading(message);
    }
}

function hideFloatingAlert() {
    if (window.uiManager) {
        window.uiManager.hideAlert();
    }
}

function showFloatingAlert(message, isLoading = false, duration = 0) {
    if (window.uiManager) {
        if (isLoading) {
            window.uiManager.showLoading(message);
        } else {
            if (duration > 0) {
                window.uiManager.showSuccess(message);
            } else {
                window.uiManager.showLoading(message);
            }
        }
    }
}

function showSuccess(message) {
    if (window.uiManager) {
        window.uiManager.showSuccess(message);
    }
}

function showError(message) {
    if (window.uiManager) {
        window.uiManager.showError(message);
    }
}

// =====================================================
// EXPORT FUNCTIONS
// =====================================================

function exportToExcel() {
    const cachedData = getCachedData();
    if (!cachedData || cachedData.length === 0) {
        showError("Không có dữ liệu để xuất");
        return;
    }

    showLoading("Đang tạo file Excel...");
    try {
        const filteredData = applyFiltersToData(cachedData);
        const excelData = filteredData.map((receipt, index) => ({
            STT: index + 1,
            "Tên người nhận": receipt.tenNguoiNhan || "",
            "Số kg": receipt.soKg || 0,
            "Số kiện": receipt.soKien || 0,
            "Bao bì": receipt.baoBi
                ? getPackagingText(receipt.baoBi)
                : "Chưa xác định",
            "Thời gian nhận": receipt.thoiGianNhan || "",
            "Người tạo": receipt.user || "",
            ID: receipt.id || "",
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Nhận Hàng");
        const fileName = `NhanHang_${new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")}.xlsx`;
        XLSX.writeFile(wb, fileName);

        hideFloatingAlert();
        showSuccess("Xuất Excel thành công!");
    } catch (error) {
        console.error("Lỗi khi xuất Excel:", error);
        showError("Lỗi khi xuất Excel!");
    }
}
