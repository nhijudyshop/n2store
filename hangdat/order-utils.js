// Order Management System - Utility Functions
// Helper functions for data manipulation and formatting

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>"'&]/g, "").trim(); // Enhanced XSS protection
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
    if (!amount && amount !== 0) return "0 ₫";
    return numberWithCommas(amount) + " ₫";
}

// Debounced function factory
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
    return `id_${timestamp}_${random}`;
}

function generateUniqueFileName() {
    return Date.now() + "_" + Math.random().toString(36).substr(2, 9) + ".png";
}

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
// DATE AND TIME FUNCTIONS
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

function setTodayDate() {
    if (ngayDatHangInput) {
        const today = new Date();
        const year = today.getFullYear();
        const month = (today.getMonth() + 1).toString().padStart(2, "0");
        const day = today.getDate().toString().padStart(2, "0");
        ngayDatHangInput.value = `${year}-${month}-${day}`;
    }
}

// Helper function to parse date strings
function parseDate(dateString) {
    if (!dateString) return null;

    try {
        // Handle both YYYY-MM-DD and DD/MM/YYYY formats
        if (dateString.includes("-")) {
            return new Date(dateString);
        } else if (dateString.includes("/")) {
            const [day, month, year] = dateString.split("/");
            return new Date(year, month - 1, day);
        }
        return new Date(dateString);
    } catch (error) {
        console.warn("Error parsing date:", dateString, error);
        return null;
    }
}

// Helper function to parse Vietnamese date format
function parseVietnameseDate(dateString) {
    if (!dateString) return null;

    try {
        const cleanDateString = dateString.replace(/,?\s*/g, " ").trim();

        const patterns = [
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})/, // dd/mm/yyyy hh:mm
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // dd/mm/yyyy
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

// Helper function to extract timestamp from ID
function extractTimestampFromId(id) {
    if (!id || !id.startsWith("id_")) return 0;

    try {
        const parts = id.split("_");
        if (parts.length >= 2) {
            // Convert from base36 back to timestamp
            return parseInt(parts[1], 36);
        }
    } catch (error) {
        console.warn("Error extracting timestamp from ID:", id, error);
    }

    return 0;
}

// =====================================================
// SORTING FUNCTIONS
// =====================================================

function sortDataByNewest(dataArray) {
    if (!Array.isArray(dataArray)) return dataArray;

    return dataArray.sort((a, b) => {
        // Sort by order date first (newest first)
        const dateA = parseDate(a.ngayDatHang);
        const dateB = parseDate(b.ngayDatHang);

        if (dateA && dateB) {
            const timeDiff = dateB - dateA;
            if (timeDiff !== 0) return timeDiff;
        }

        // If same date, sort by upload time (newest first)
        const timeA = parseVietnameseDate(a.thoiGianUpload);
        const timeB = parseVietnameseDate(b.thoiGianUpload);

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

// =====================================================
// ALERT FUNCTIONS
// =====================================================

function showFloatingAlert(message, showSpinner = false, duration = 0) {
    const alert = document.getElementById("floatingAlert");
    const spinner = alert.querySelector(".loading-spinner");
    const text = alert.querySelector(".alert-text");

    text.textContent = message;
    spinner.style.display = showSpinner ? "block" : "none";
    alert.style.display = "block";

    if (duration > 0) {
        setTimeout(() => {
            hideFloatingAlert();
        }, duration);
    }
}

function hideFloatingAlert() {
    const alert = document.getElementById("floatingAlert");
    alert.style.display = "none";
}

// Helper function to show loading state
function showLoading(message) {
    showFloatingAlert(message, true);
}

// Helper function to show success message
function showSuccess(message) {
    hideFloatingAlert();
    showFloatingAlert(message, false);
    setTimeout(hideFloatingAlert, 2000);
}

// Helper function to show error message
function showError(message) {
    hideFloatingAlert();
    showFloatingAlert(message, false);
    setTimeout(hideFloatingAlert, 3000);
}

// =====================================================
// LOGGING FUNCTIONS
// =====================================================

function logAction(
    action,
    description,
    oldData = null,
    newData = null,
    pageName = "Đặt Hàng",
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

    // Save to Firebase
    historyCollectionRef
        .add(logEntry)
        .then(() => {
            console.log("Log entry saved successfully");
        })
        .catch((error) => {
            console.error("Error saving log entry: ", error);
        });
}

console.log("Order Management System - Utilities loaded");
