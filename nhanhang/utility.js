// Enhanced Goods Receipt Management System - Utility Functions
// Helper functions with NEW CACHE SYSTEM integration

// =====================================================
// TIMEZONE HELPER - GMT+7 Vietnam
// =====================================================

function getVietnamDate(date = new Date()) {
    const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
    const vietnamTime = new Date(utcTime + 7 * 3600000);
    return vietnamTime;
}

function getVietnamDateAtMidnight(date = new Date()) {
    const vnDate = getVietnamDate(date);
    return new Date(
        vnDate.getFullYear(),
        vnDate.getMonth(),
        vnDate.getDate(),
        0,
        0,
        0,
        0,
    );
}

// =====================================================
// NEW CACHE FUNCTIONS - Using CacheManager
// =====================================================

function getCachedData() {
    try {
        const cached = dataCache.get("receipts", "data");
        if (cached) {
            console.log("✅ Using cached data - will sort before rendering");
            return sortDataByNewest([...cached]);
        }
    } catch (e) {
        console.warn("Error accessing cache:", e);
        dataCache.clear("data");
    }
    return null;
}

function setCachedData(data) {
    try {
        const sortedData = sortDataByNewest([...data]);
        dataCache.set("receipts", sortedData, "data");
        console.log("✅ Data sorted and cached successfully");
    } catch (e) {
        console.warn("Cannot cache data:", e);
    }
}

function invalidateCache() {
    dataCache.clear("data");
    console.log("🗑️ Cache invalidated");
}

// Get cache statistics
function getCacheStats() {
    return dataCache.getStats();
}

// Invalidate specific patterns (useful for targeted updates)
function invalidateCachePattern(pattern) {
    return dataCache.invalidatePattern(pattern);
}

// =====================================================
// DISPLAY RECEIPT DATA FUNCTION
// =====================================================

async function displayReceiptData() {
    // Try cache first
    const cachedData = getCachedData();
    if (cachedData) {
        const sortedCacheData = sortDataByNewest(cachedData);
        renderDataToTable(sortedCacheData);
        return;
    }

    let notifId = null;

    try {
        // notifId = notificationManager.loadingData(
        //     "Đang tải dữ liệu từ server...",
        // );
        showSuccess("Đang tải dữ liệu từ server...");

        const doc = await collectionRef.doc("nhanhang").get();
        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                const sortedData = sortDataByNewest(data.data);
                renderDataToTable(sortedData);
                setCachedData(sortedData);
            }
        }

        // notificationManager.remove(notifId);
        notificationManager.success("Tải dữ liệu hoàn tất!", 2000);
    } catch (error) {
        console.error(error);
        // if (notifId) notificationManager.remove(notifId);
        notificationManager.error("Lỗi khi tải dữ liệu!", 3000);
    }
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
    const vnDate = getVietnamDate();
    const day = vnDate.getDate().toString().padStart(2, "0");
    const month = (vnDate.getMonth() + 1).toString().padStart(2, "0");
    const year = vnDate.getFullYear();
    const hour = vnDate.getHours().toString().padStart(2, "0");
    const minute = vnDate.getMinutes().toString().padStart(2, "0");
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
        timestamp: getVietnamDate(),
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
// SORTING FUNCTIONS - UPDATED WITH GMT+7
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
        const cleanDateString = dateString
            .replace(/,/g, "")
            .replace(/\s+/g, " ")
            .trim();

        const patterns = [
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})/,
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
        ];

        for (let pattern of patterns) {
            const match = cleanDateString.match(pattern);
            if (match) {
                const [, day, month, year, hour = 0, minute = 0] = match;
                const parsedDate = new Date(
                    parseInt(year),
                    parseInt(month) - 1,
                    parseInt(day),
                    parseInt(hour),
                    parseInt(minute),
                );

                if (!isNaN(parsedDate.getTime())) {
                    return parsedDate;
                }
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
// UI ALERT FUNCTIONS - USE NOTIFICATION MANAGER
// =====================================================

function showLoading(message) {
    if (window.notificationManager) {
        return window.notificationManager.loading(message);
    }
}

function hideFloatingAlert() {
    if (window.notificationManager) {
        window.notificationManager.clearAll();
    }
}

function showFloatingAlert(message, isLoading = false, duration = 0) {
    if (window.notificationManager) {
        if (isLoading) {
            return window.notificationManager.loading(message);
        } else {
            if (duration > 0) {
                return window.notificationManager.success(message, duration);
            } else {
                return window.notificationManager.info(message);
            }
        }
    }
}

function showSuccess(message) {
    if (window.notificationManager) {
        return window.notificationManager.success(message);
    }
}

function showError(message) {
    if (window.notificationManager) {
        return window.notificationManager.error(message);
    }
}

// =====================================================
// EXPORT FUNCTIONS
// =====================================================

function exportToExcel() {
    const cachedData = getCachedData();
    if (!cachedData || cachedData.length === 0) {
        notificationManager.error("Không có dữ liệu để xuất", 3000);
        return;
    }

    let notifId = notificationManager.show(
        "Đang tạo file Excel...",
        "info",
        0,
        {
            showOverlay: true,
            persistent: true,
            icon: "file-spreadsheet",
            title: "Xuất Excel",
        },
    );

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

        const vnDate = getVietnamDate();
        const fileName = `NhanHang_${vnDate.getDate()}-${vnDate.getMonth() + 1}-${vnDate.getFullYear()}.xlsx`;
        XLSX.writeFile(wb, fileName);

        notificationManager.remove(notifId);
        notificationManager.success(
            `Xuất thành công ${filteredData.length} phiếu nhận!`,
            2500,
        );
    } catch (error) {
        console.error("Lỗi khi xuất Excel:", error);
        notificationManager.remove(notifId);
        notificationManager.error("Lỗi khi xuất Excel: " + error.message, 4000);
    }
}

// =====================================================
// CACHE DEBUG FUNCTIONS
// =====================================================

window.cacheDebug = {
    getStats: () => {
        console.table(dataCache.getStats());
        return dataCache.getStats();
    },
    clear: () => {
        dataCache.clear();
        console.log("Cache cleared");
    },
    viewCache: () => {
        const data = getCachedData();
        console.log("Cached data:", data);
        return data;
    },
    cleanExpired: () => {
        const cleaned = dataCache.cleanExpired();
        console.log(`Cleaned ${cleaned} expired entries`);
        return cleaned;
    },
    invalidatePattern: (pattern) => {
        const invalidated = dataCache.invalidatePattern(pattern);
        console.log(`Invalidated ${invalidated} entries matching: ${pattern}`);
        return invalidated;
    },
};

console.log("✅ Utility functions loaded with NEW CACHE SYSTEM");
console.log("💡 Use window.cacheDebug for cache management");
