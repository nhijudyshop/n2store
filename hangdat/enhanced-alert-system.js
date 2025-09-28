// =====================================================
// ENHANCED ALERT SYSTEM WITH UI LOCKING
// =====================================================

// Global state for UI locking
let isUILocked = false;
let currentAlert = null;

// Enhanced alert functions with UI locking
function showFloatingAlert(message, showSpinner = false, duration = 0) {
    let alert = document.getElementById("floatingAlert");

    // Create alert if it doesn't exist
    if (!alert) {
        alert = document.createElement("div");
        alert.id = "floatingAlert";
        alert.innerHTML = `
            <div class="alert-content">
                <div class="loading-spinner" style="display: none">
                    <div class="spinner"></div>
                </div>
                <div class="alert-text">Thông báo hiển thị!</div>
            </div>
        `;
        document.body.appendChild(alert);
    }

    const spinner = alert.querySelector(".loading-spinner");
    const text = alert.querySelector(".alert-text");

    if (text) text.textContent = message;
    if (spinner) spinner.style.display = showSpinner ? "block" : "none";

    // Show alert with animation
    alert.style.display = "block";
    alert.classList.add("alert-show");

    currentAlert = alert;
    console.log(`Alert: ${message}`);

    if (duration > 0) {
        setTimeout(() => {
            hideFloatingAlert();
        }, duration);
    }
}

function hideFloatingAlert() {
    const alert = document.getElementById("floatingAlert");
    if (alert) {
        alert.classList.remove("alert-show");
        alert.style.display = "none";
        currentAlert = null;
    }
}

// UI Locking functions
function lockUI(message = "Đang xử lý...") {
    isUILocked = true;

    // Create or update overlay
    let overlay = document.getElementById("uiLockOverlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "uiLockOverlay";
        overlay.innerHTML = `
            <div class="lock-content">
                <div class="lock-spinner">
                    <div class="spinner"></div>
                </div>
                <div class="lock-message">${message}</div>
            </div>
        `;
        document.body.appendChild(overlay);
    } else {
        overlay.querySelector(".lock-message").textContent = message;
    }

    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";

    // Disable all interactive elements
    disableInteractiveElements();

    console.log("UI Locked:", message);
}

function unlockUI() {
    isUILocked = false;

    const overlay = document.getElementById("uiLockOverlay");
    if (overlay) {
        overlay.style.display = "none";
    }

    document.body.style.overflow = "";

    // Re-enable all interactive elements
    enableInteractiveElements();

    console.log("UI Unlocked");
}

function disableInteractiveElements() {
    const elements = document.querySelectorAll(
        "button, input, select, textarea, a[href]",
    );
    elements.forEach((el) => {
        if (!el.hasAttribute("data-was-disabled")) {
            el.setAttribute("data-was-disabled", el.disabled || "false");
            el.disabled = true;
            el.style.pointerEvents = "none";
            el.style.opacity = "0.6";
        }
    });
}

function enableInteractiveElements() {
    const elements = document.querySelectorAll(
        "button, input, select, textarea, a[href]",
    );
    elements.forEach((el) => {
        if (el.hasAttribute("data-was-disabled")) {
            const wasDisabled = el.getAttribute("data-was-disabled") === "true";
            if (!wasDisabled) {
                el.disabled = false;
                el.style.pointerEvents = "";
                el.style.opacity = "";
            }
            el.removeAttribute("data-was-disabled");
        }
    });
}

// Enhanced helper functions with UI locking
function showLoading(message) {
    lockUI(message);
    showFloatingAlert(message, true);
    setAlertClass("info");
}

function showSuccess(message, duration = 2000) {
    unlockUI();
    hideFloatingAlert();
    setTimeout(() => {
        showFloatingAlert(message, false, duration);
        setAlertClass("success");
    }, 100);
}

function showError(message, duration = 4000) {
    unlockUI();
    hideFloatingAlert();
    setTimeout(() => {
        showFloatingAlert(message, false, duration);
        setAlertClass("error");
    }, 100);
}

function showWarning(message, duration = 3000) {
    unlockUI();
    hideFloatingAlert();
    setTimeout(() => {
        showFloatingAlert(message, false, duration);
        setAlertClass("warning");
    }, 100);
}

function setAlertClass(type) {
    const alert = document.getElementById("floatingAlert");
    if (alert) {
        // Remove all alert classes
        alert.classList.remove(
            "alert-success",
            "alert-error",
            "alert-warning",
            "alert-info",
        );
        // Add the new class
        if (type) {
            alert.classList.add(`alert-${type}`);
        }
    }
}

// Prevent actions when UI is locked
function checkUILock() {
    if (isUILocked) {
        console.warn("Action blocked - UI is locked");
        return false;
    }
    return true;
}

// Enhanced wrapper for async operations
async function withUILock(operation, loadingMessage = "Đang xử lý...") {
    if (isUILocked) {
        console.warn("Operation blocked - UI already locked");
        return;
    }

    try {
        showLoading(loadingMessage);
        const result = await operation();
        unlockUI();
        return result;
    } catch (error) {
        console.error("Operation failed:", error);
        showError("Có lỗi xảy ra: " + (error.message || error));
        throw error;
    }
}

// Override existing functions to include UI locking
const originalSubmitOrder = window.submitOrder;
if (originalSubmitOrder) {
    window.submitOrder = async function () {
        if (!checkUILock()) return;

        return withUILock(async () => {
            return originalSubmitOrder();
        }, "Đang thêm đơn hàng...");
    };
}

const originalDeleteOrderByID = window.deleteOrderByID;
if (originalDeleteOrderByID) {
    window.deleteOrderByID = async function (event) {
        if (!checkUILock()) return;

        return withUILock(async () => {
            return originalDeleteOrderByID(event);
        }, "Đang xóa đơn hàng...");
    };
}

const originalUpdateOrderByID = window.updateOrderByID;
if (originalUpdateOrderByID) {
    window.updateOrderByID = async function (event) {
        if (!checkUILock()) return;

        return withUILock(async () => {
            return originalUpdateOrderByID(event);
        }, "Đang cập nhật...");
    };
}

// Export functions for global use
window.lockUI = lockUI;
window.unlockUI = unlockUI;
window.withUILock = withUILock;
window.checkUILock = checkUILock;
window.showLoading = showLoading;
window.showSuccess = showSuccess;
window.showError = showError;
window.showWarning = showWarning;

console.log("Enhanced Alert System with UI Lock loaded");

// Test function
window.testEnhancedAlerts = function () {
    console.log("Testing enhanced alerts...");

    showLoading("Đang test loading...");
    setTimeout(() => {
        showSuccess("Test thành công!");
        setTimeout(() => {
            showError("Test lỗi!");
            setTimeout(() => {
                showWarning("Test cảnh báo!");
            }, 2500);
        }, 2500);
    }, 3000);
};
