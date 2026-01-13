// js/utils.js - Utility Functions
// Common utils (sanitizeInput, numberWithCommas, etc.) are now in
// shared/js/date-utils.js and shared/js/form-utils.js

// =====================================================
// PAGE-SPECIFIC DATE FUNCTIONS
// =====================================================

function formatDateWithPeriod(date, startTime = null) {
    if (!date || !(date instanceof Date)) return "";

    const year = date.getFullYear() % 100;
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const baseDate = `${day}-${month}-${year}`;

    if (!startTime) return baseDate;

    const timeParts = startTime.split(":");
    if (timeParts.length !== 2) return baseDate;

    const startHour = parseInt(timeParts[0]);
    if (isNaN(startHour)) return baseDate;

    let period = "";
    if (startHour >= 6 && startHour < 12) {
        period = " (Sáng)";
    } else if (startHour >= 12 && startHour < 18) {
        period = " (Chiều)";
    } else {
        period = " (Tối)";
    }

    return baseDate + period;
}

function parseDisplayDate(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return null;

    let cleanDateStr = dateStr;
    const periodPattern = /\s*\((Sáng|Chiều|Tối)\)$/;
    const match = dateStr.match(periodPattern);
    if (match) {
        cleanDateStr = dateStr.replace(periodPattern, "").trim();
    }

    const parts = cleanDateStr.split("-");
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    let year = parseInt(parts[2]);

    if (year < 100) {
        year = year < 50 ? 2000 + year : 1900 + year;
    }

    const result = new Date(year, month, day);
    return isNaN(result.getTime()) ? null : result;
}

function formatTimeRange(startTime, endTime) {
    if (!startTime || !endTime) return null;

    const start = new Date(`2000-01-01T${startTime}:00`);
    const end = new Date(`2000-01-01T${endTime}:00`);

    if (end <= start) {
        return null;
    }

    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins <= 0) {
        return null;
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
// PAGE-SPECIFIC UI FUNCTIONS (uses floatingAlert element)
// =====================================================

function showLoading(message = "Đang tải...") {
    const alert = document.getElementById("floatingAlert");
    if (!alert) return;
    const spinner = alert.querySelector(".loading-spinner");
    const text = alert.querySelector(".alert-text");

    if (spinner && text) {
        alert.className = "loading";
        text.textContent = message;
        spinner.style.display = "block";
        alert.style.display = "block";
    }
}

function showSuccess(message) {
    const alert = document.getElementById("floatingAlert");
    if (!alert) return;
    const spinner = alert.querySelector(".loading-spinner");
    const text = alert.querySelector(".alert-text");

    if (spinner && text) {
        alert.className = "success";
        text.textContent = message;
        spinner.style.display = "none";
        alert.style.display = "block";

        setTimeout(() => {
            hideFloatingAlert();
        }, 3000);
    }
}

function showError(message) {
    const alert = document.getElementById("floatingAlert");
    if (!alert) return;
    const spinner = alert.querySelector(".loading-spinner");
    const text = alert.querySelector(".alert-text");

    if (spinner && text) {
        alert.className = "error";
        text.textContent = message;
        spinner.style.display = "none";
        alert.style.display = "block";

        setTimeout(() => {
            hideFloatingAlert();
        }, 5000);
    }
}

function hideFloatingAlert() {
    const alert = document.getElementById("floatingAlert");
    if (alert) {
        alert.style.display = "none";
    }
}

// =====================================================
// ACTION LOGGING (page-specific)
// =====================================================

function logAction(action, description, oldValue = null, newValue = null) {
    try {
        const auth = getAuthState();
        const userName = auth
            ? auth.userType
                ? auth.userType.split("-")[0]
                : "Unknown"
            : "Unknown";

        const logEntry = {
            timestamp: new Date().toISOString(),
            user: userName,
            action: action,
            description: description,
            oldValue: oldValue,
            newValue: newValue,
        };

        console.log(`[ACTION LOG] ${action.toUpperCase()}:`, logEntry);

        if (typeof historyCollectionRef !== "undefined" && historyCollectionRef) {
            historyCollectionRef
                .add(logEntry)
                .then(() => console.log("[ACTION LOG] Saved to Firebase"))
                .catch((error) => console.warn("[ACTION LOG] Could not save:", error));
        }
    } catch (error) {
        console.error("[ACTION LOG] Error:", error);
    }
}

// =====================================================
// EXPORTS
// =====================================================

window.formatDateWithPeriod = formatDateWithPeriod;
window.parseDisplayDate = parseDisplayDate;
window.formatTimeRange = formatTimeRange;
window.showLoading = showLoading;
window.showSuccess = showSuccess;
window.showError = showError;
window.hideFloatingAlert = hideFloatingAlert;
window.logAction = logAction;

console.log("✅ Utils loaded (using shared utils for common functions)");
