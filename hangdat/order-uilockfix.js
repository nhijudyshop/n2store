// =====================================================
// UI LOCK FIX - Prevent Filter Delete Freeze
// =====================================================

// Enhanced UI locking system with timeout protection
let isUILocked = false;
let currentAlert = null;
let lockTimeout = null;
let lockStartTime = null;
const MAX_LOCK_DURATION = 30000; // 30 seconds maximum lock

// Enhanced alert functions with auto-unlock protection
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

// Enhanced UI locking with timeout protection
function lockUI(message = "Đang xử lý...") {
    // Prevent multiple locks
    if (isUILocked) {
        console.warn("UI already locked, updating message:", message);
        updateLockMessage(message);
        return;
    }

    isUILocked = true;
    lockStartTime = Date.now();

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
                <div class="lock-timeout" style="margin-top: 12px; font-size: 12px; color: #6c757d; display: none;">
                    Đang xử lý... <span class="timeout-counter"></span>
                </div>
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

    // Set automatic timeout to prevent permanent lock
    clearTimeout(lockTimeout);
    lockTimeout = setTimeout(() => {
        console.warn("UI lock timeout reached, auto-unlocking");
        forceUnlockUI("Timeout reached");
    }, MAX_LOCK_DURATION);

    // Show timeout counter after 10 seconds
    setTimeout(() => {
        if (isUILocked) {
            showTimeoutCounter();
        }
    }, 10000);

    console.log("UI Locked:", message);
}

function updateLockMessage(message) {
    const overlay = document.getElementById("uiLockOverlay");
    if (overlay) {
        const messageEl = overlay.querySelector(".lock-message");
        if (messageEl) {
            messageEl.textContent = message;
        }
    }
}

function showTimeoutCounter() {
    const overlay = document.getElementById("uiLockOverlay");
    if (overlay && isUILocked) {
        const timeoutEl = overlay.querySelector(".lock-timeout");
        const counterEl = overlay.querySelector(".timeout-counter");

        if (timeoutEl && counterEl) {
            timeoutEl.style.display = "block";

            // Update counter every second
            const updateCounter = () => {
                if (!isUILocked) return;

                const elapsed = Date.now() - lockStartTime;
                const remaining = Math.max(0, MAX_LOCK_DURATION - elapsed);
                const seconds = Math.ceil(remaining / 1000);

                counterEl.textContent = `${seconds}s`;

                if (remaining > 0) {
                    setTimeout(updateCounter, 1000);
                }
            };

            updateCounter();
        }
    }
}

function unlockUI() {
    if (!isUILocked) {
        console.warn("UI was not locked");
        return;
    }

    isUILocked = false;
    lockStartTime = null;

    // Clear timeout
    clearTimeout(lockTimeout);
    lockTimeout = null;

    const overlay = document.getElementById("uiLockOverlay");
    if (overlay) {
        overlay.style.display = "none";
    }

    document.body.style.overflow = "";

    // Re-enable all interactive elements
    enableInteractiveElements();

    console.log("UI Unlocked");
}

function forceUnlockUI(reason = "Force unlock") {
    console.warn("Force unlocking UI:", reason);

    isUILocked = false;
    lockStartTime = null;

    clearTimeout(lockTimeout);
    lockTimeout = null;

    const overlay = document.getElementById("uiLockOverlay");
    if (overlay) {
        overlay.style.display = "none";
    }

    document.body.style.overflow = "";
    enableInteractiveElements();
    hideFloatingAlert();

    // Show warning to user
    setTimeout(() => {
        showError(`Đã mở khóa giao diện do: ${reason}`);
    }, 100);
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

// Enhanced helper functions with timeout protection
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

// Enhanced check with auto-unlock protection
function checkUILock() {
    // Check for stuck lock
    if (isUILocked && lockStartTime) {
        const elapsed = Date.now() - lockStartTime;
        if (elapsed > MAX_LOCK_DURATION) {
            console.warn("Detected stuck UI lock, force unlocking");
            forceUnlockUI("Stuck lock detected");
            return true; // Allow operation to proceed
        }
    }

    if (isUILocked) {
        console.warn("Action blocked - UI is locked");
        showWarning("Vui lòng đợi thao tác hiện tại hoàn thành");
        return false;
    }
    return true;
}

// Enhanced wrapper for async operations with better error handling
async function withUILock(operation, loadingMessage = "Đang xử lý...") {
    if (isUILocked) {
        console.warn("Operation blocked - UI already locked");
        showWarning("Đang thực hiện thao tác khác, vui lòng đợi");
        return;
    }

    try {
        showLoading(loadingMessage);
        const result = await operation();
        return result;
    } catch (error) {
        console.error("Operation failed:", error);
        showError("Có lỗi xảy ra: " + (error.message || error));
        throw error;
    } finally {
        // Always unlock UI regardless of success/failure
        unlockUI();
    }
}

// Fixed deleteByFilter function with proper UI lock handling
async function deleteByFilterFixed() {
    // CRITICAL: Check UI lock before any operations
    if (!checkUILock()) {
        console.warn("Delete by filter blocked - UI is locked");
        return;
    }

    return withUILock(async () => {
        const auth = getAuthState();
        if (!auth || auth.checkLogin == "777") {
            throw new Error("Không có quyền xóa đơn hàng");
        }

        const cachedData = getCachedData();
        if (!cachedData) {
            throw new Error("Không có dữ liệu để xóa");
        }

        const filteredData = applyFiltersToData(cachedData);
        const unfilteredData = cachedData.filter(
            (item) => !filteredData.includes(item),
        );

        if (filteredData.length === 0) {
            throw new Error("Không có đơn hàng nào phù hợp với bộ lọc");
        }

        if (filteredData.length === cachedData.length) {
            throw new Error(
                "Không thể xóa tất cả dữ liệu. Vui lòng áp dụng bộ lọc trước",
            );
        }

        // Get filter description for confirmation
        const filterDescription = getFilterDescription();

        // IMPORTANT: Temporarily unlock UI for user confirmation
        const wasLocked = isUILocked;
        if (wasLocked) {
            unlockUI();
        }

        const confirmMessage = `Bạn có chắc chắn muốn xóa ${filteredData.length} đơn hàng theo bộ lọc?\n\nBộ lọc: ${filterDescription}\n\nHành động này không thể hoàn tác!`;
        const confirmDelete = confirm(confirmMessage);

        // Re-lock UI if it was locked before
        if (wasLocked && confirmDelete) {
            showLoading(`Đang xóa ${filteredData.length} đơn hàng...`);
        } else if (!confirmDelete) {
            throw new Error("Đã hủy thao tác xóa");
        }

        // Update database with remaining data
        await collectionRef.doc("dathang").update({
            data: unfilteredData,
        });

        // Log the mass deletion
        logAction(
            "bulk_delete",
            `Xóa hàng loạt ${filteredData.length} đơn hàng theo bộ lọc: ${filterDescription}`,
            {
                deletedCount: filteredData.length,
                filter: filterDescription,
            },
            { remainingCount: unfilteredData.length },
        );

        // Clear cache and reload data
        invalidateCache();

        // Show progress update
        updateLockMessage("Đang tải lại dữ liệu...");

        await displayOrderData(true);

        // Clear filters after deletion
        clearFilters();

        return `Đã xóa thành công ${filteredData.length} đơn hàng!`;
    }, `Đang xóa dữ liệu theo bộ lọc...`)
        .then((message) => {
            showSuccess(message);
        })
        .catch((error) => {
            if (error.message !== "Đã hủy thao tác xóa") {
                console.error("Error in deleteByFilterFixed:", error);
                showError("Lỗi khi xóa dữ liệu: " + error.message);
            }
        });
}

// Add emergency unlock keyboard shortcut
document.addEventListener("keydown", function (e) {
    // Ctrl+Alt+U = Emergency unlock
    if (e.ctrlKey && e.altKey && e.key === "u") {
        e.preventDefault();
        if (isUILocked) {
            forceUnlockUI("Emergency keyboard unlock");
        }
    }
});

// Add emergency unlock for stuck operations
window.addEventListener("beforeunload", function () {
    if (isUILocked) {
        unlockUI();
    }
});

// Periodic check for stuck locks
setInterval(() => {
    if (isUILocked && lockStartTime) {
        const elapsed = Date.now() - lockStartTime;
        if (elapsed > MAX_LOCK_DURATION) {
            forceUnlockUI("Periodic check - stuck lock");
        }
    }
}, 5000); // Check every 5 seconds

// Export functions for global use
window.lockUI = lockUI;
window.unlockUI = unlockUI;
window.forceUnlockUI = forceUnlockUI;
window.withUILock = withUILock;
window.checkUILock = checkUILock;
window.showLoading = showLoading;
window.showSuccess = showSuccess;
window.showError = showError;
window.showWarning = showWarning;
window.deleteByFilterFixed = deleteByFilterFixed;

console.log("UI Lock Fix loaded - Enhanced with timeout protection");

// Test function for debugging
window.testUILock = function () {
    console.log("Testing UI lock system...");

    showLoading("Testing 3 second lock...");
    setTimeout(() => {
        showSuccess("Lock test completed!");
    }, 3000);
};

window.testForceUnlock = function () {
    console.log("Testing force unlock...");
    forceUnlockUI("Manual test");
};
