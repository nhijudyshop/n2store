// js/utils.js - Utility Functions (Fixed for Vietnam Timezone GMT+7)
// Common utils are now in shared/js/date-utils.js and shared/js/form-utils.js

// =====================================================
// PAGE-SPECIFIC DATE FUNCTIONS (Vietnam Timezone)
// =====================================================

function formatDateVN(timestamp) {
    // Convert timestamp to Vietnam timezone (GMT+7)
    const date = new Date(timestamp);
    const vnOffset = 7 * 60;
    const localOffset = date.getTimezoneOffset();
    const vnTime = new Date(date.getTime() + (vnOffset + localOffset) * 60000);

    const day = String(vnTime.getDate()).padStart(2, "0");
    const month = String(vnTime.getMonth() + 1).padStart(2, "0");
    const year = vnTime.getFullYear();

    return `${day}-${month}-${year}`;
}

// Override formatDate for this page (uses dd-mm-yyyy format)
function formatDate(timestamp) {
    return formatDateVN(timestamp);
}

// =====================================================
// PAGE-SPECIFIC UI FUNCTIONS
// =====================================================

function showNotification(message, type = "success") {
    const notification = document.getElementById("notification");
    const notificationText = document.getElementById("notificationText");

    if (!notification || !notificationText) return;

    notification.classList.remove("success", "error", "info", "hidden");
    notification.classList.add(type);
    notificationText.textContent = message;

    setTimeout(() => {
        notification.classList.add("hidden");
    }, 3000);
}

// Initialize Lucide Icons
function initIcons() {
    if (window.lucide) {
        lucide.createIcons();
    }
}

// =====================================================
// PAGE-SPECIFIC EXPORT (custom CSV format)
// =====================================================

function exportToCSV(data, filename) {
    if (!data || data.length === 0) {
        showNotification("Không có dữ liệu để xuất", "error");
        return;
    }

    let csvContent = "Ngày,NCC,Tên SP,Mã SP,SL NCC,SL Khách,Mã ĐH\n";

    data.forEach((item) => {
        const row = [
            formatDate(item.dateCell),
            item.supplier || "",
            item.productName || "",
            item.productCode || "",
            item.supplierQty || 0,
            item.customerOrders || 0,
            item.orderCodes ? item.orderCodes.join("; ") : "",
        ]
            .map((field) => {
                const str = String(field);
                if (str.includes(",") || str.includes('"') || str.includes("\n")) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            })
            .join(",");

        csvContent += row + "\n";
    });

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", filename || `inventory_${getTodayVN()}.csv`);
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification("Đã xuất file CSV!", "success");
}

// =====================================================
// ACTION LOGGING (page-specific)
// =====================================================

function logAction(action, description, oldValue = null, newValue = null) {
    try {
        const auth = getAuthState();
        const userName = auth ? (auth.userType ? auth.userType.split("-")[0] : "Unknown") : "Unknown";

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
            historyCollectionRef.add(logEntry)
                .then(() => console.log("[ACTION LOG] Saved to Firebase"))
                .catch((error) => console.warn("[ACTION LOG] Could not save:", error));
        }
    } catch (error) {
        console.error("[ACTION LOG] Error:", error);
    }
}

// =====================================================
// EXPORTS (page-specific functions only)
// =====================================================

window.formatDate = formatDate;
window.formatDateVN = formatDateVN;
window.showNotification = showNotification;
window.exportToCSV = exportToCSV;
window.initIcons = initIcons;
window.logAction = logAction;

console.log("✅ Utils loaded (using shared utils for common functions)");
