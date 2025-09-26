/**
 * Common UI Utilities - Các tiện ích giao diện chung
 * File: common-utils.js
 * Sử dụng: Include vào navigation.js hoặc sử dụng độc lập
 */

/**
 * ====================================================================================
 * STATUS & NOTIFICATION SYSTEM
 * ====================================================================================
 */

/**
 * Hiển thị thông báo status
 */
function showStatusMessage(message, type = "info") {
    const indicator = document.getElementById("statusIndicator");
    if (indicator) {
        indicator.textContent = message;
        indicator.className = `status-indicator ${type} show`;

        setTimeout(() => {
            indicator.classList.remove("show");
        }, 3000);
    }
}

/**
 * ====================================================================================
 * ENHANCED FLOATING ALERT SYSTEM VỚI LOADING BLOCK
 * ====================================================================================
 */

// Namespace để tránh conflicts
window.FloatingAlert = window.FloatingAlert || {};

// Global state tracking trong namespace
if (typeof window.FloatingAlert.isPageBlocked === "undefined") {
    window.FloatingAlert.isPageBlocked = false;
    window.FloatingAlert.blockingOverlay = null;
}

/**
 * Enhanced floating alert với khóa tương tác khi loading
 */
function showFloatingAlert(message, type = "info", duration = 3000) {
    const alert = document.getElementById("floatingAlert");
    if (alert) {
        // Tìm elements an toàn
        const alertText = alert.querySelector(".alert-text");
        const spinner = alert.querySelector(".loading-spinner");

        // Cập nhật nội dung
        if (alertText) {
            alertText.textContent = message;
        } else {
            // Fallback nếu không có .alert-text
            alert.textContent = message;
        }

        // Reset classes
        alert.className = "show";

        if (type === "loading") {
            alert.classList.add("loading");
            if (spinner) spinner.style.display = "block";

            // KHÓA TƯƠNG TÁC KHI LOADING
            blockPageInteractions();
        } else {
            alert.classList.add(type);
            if (spinner) spinner.style.display = "none";

            // MỞ KHÓA TƯƠNG TÁC CHO CÁC LOẠI KHÁC
            unblockPageInteractions();
        }

        // Auto hide cho non-loading alerts
        if (type !== "loading") {
            setTimeout(() => {
                alert.classList.remove("show");
            }, duration);
        }
    }
}

/**
 * Hide floating alert và mở khóa tương tác
 */
function hideFloatingAlert() {
    const alert = document.getElementById("floatingAlert");
    if (alert) {
        alert.classList.remove("show");

        // MỞ KHÓA TƯƠNG TÁC KHI ẨN ALERT
        unblockPageInteractions();
    }
}

/**
 * KHÓA TƯƠNG TÁC TOÀN TRANG
 */
function blockPageInteractions() {
    if (window.FloatingAlert.isPageBlocked) return; // Tránh duplicate

    window.FloatingAlert.isPageBlocked = true;

    // Tạo overlay chặn
    createBlockingOverlay();

    // Vô hiệu hóa body interactions
    document.body.style.pointerEvents = "none";
    document.body.style.userSelect = "none";
    document.body.classList.add("page-blocked");

    // Cho phép alert vẫn hoạt động
    const alert = document.getElementById("floatingAlert");
    if (alert) {
        alert.style.pointerEvents = "auto";
        alert.style.zIndex = "10000";
    }

    // Vô hiệu hóa keyboard navigation
    document.addEventListener("keydown", blockKeyboardInteraction, true);
    document.addEventListener("keyup", blockKeyboardInteraction, true);
    document.addEventListener("keypress", blockKeyboardInteraction, true);

    // Vô hiệu hóa context menu
    document.addEventListener("contextmenu", preventDefaultAction, true);

    // Vô hiệu hóa drag & drop
    document.addEventListener("dragstart", preventDefaultAction, true);

    console.log("Page interactions blocked for loading");
}

/**
 * MỞ KHÓA TƯƠNG TÁC TOÀN TRANG
 */
function unblockPageInteractions() {
    if (!window.FloatingAlert.isPageBlocked) return; // Không cần unblock nếu chưa block

    window.FloatingAlert.isPageBlocked = false;

    // Xóa overlay chặn
    removeBlockingOverlay();

    // Kích hoạt lại body interactions
    document.body.style.pointerEvents = "";
    document.body.style.userSelect = "";
    document.body.classList.remove("page-blocked");

    // Reset alert styles
    const alert = document.getElementById("floatingAlert");
    if (alert) {
        alert.style.pointerEvents = "";
        alert.style.zIndex = "";
    }

    // Kích hoạt lại keyboard navigation
    document.removeEventListener("keydown", blockKeyboardInteraction, true);
    document.removeEventListener("keyup", blockKeyboardInteraction, true);
    document.removeEventListener("keypress", blockKeyboardInteraction, true);

    // Kích hoạt lại context menu
    document.removeEventListener("contextmenu", preventDefaultAction, true);

    // Kích hoạt lại drag & drop
    document.removeEventListener("dragstart", preventDefaultAction, true);

    console.log("Page interactions unblocked");
}

/**
 * Tạo overlay chặn tương tác
 */
function createBlockingOverlay() {
    if (window.FloatingAlert.blockingOverlay) return; // Tránh tạo duplicate

    window.FloatingAlert.blockingOverlay = document.createElement("div");
    window.FloatingAlert.blockingOverlay.id = "loadingBlockOverlay";
    window.FloatingAlert.blockingOverlay.innerHTML = `
        <div class="blocking-content">
            <div class="blocking-spinner"></div>
            <div class="blocking-message">Vui lòng đợi...</div>
        </div>
    `;

    // Styles cho overlay
    Object.assign(window.FloatingAlert.blockingOverlay.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        zIndex: "9999",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(2px)",
        cursor: "wait",
    });

    document.body.appendChild(window.FloatingAlert.blockingOverlay);

    // Animate in
    setTimeout(() => {
        if (window.FloatingAlert.blockingOverlay) {
            window.FloatingAlert.blockingOverlay.style.opacity = "1";
        }
    }, 10);
}

/**
 * Xóa overlay chặn tương tác
 */
function removeBlockingOverlay() {
    if (window.FloatingAlert.blockingOverlay) {
        window.FloatingAlert.blockingOverlay.style.opacity = "0";
        setTimeout(() => {
            if (
                window.FloatingAlert.blockingOverlay &&
                window.FloatingAlert.blockingOverlay.parentNode
            ) {
                window.FloatingAlert.blockingOverlay.parentNode.removeChild(
                    window.FloatingAlert.blockingOverlay,
                );
            }
            window.FloatingAlert.blockingOverlay = null;
        }, 300);
    }
}

/**
 * Chặn keyboard interactions
 */
function blockKeyboardInteraction(event) {
    // Chỉ cho phép ESC để cancel loading nếu cần
    if (event.key === "Escape") {
        return; // Có thể thêm logic cancel loading ở đây
    }

    // Chặn tất cả các phím khác
    event.preventDefault();
    event.stopPropagation();
    return false;
}

/**
 * Ngăn default actions
 */
function preventDefaultAction(event) {
    event.preventDefault();
    event.stopPropagation();
    return false;
}

/**
 * Inject CSS cho blocking system
 */
function injectBlockingStyles() {
    if (document.getElementById("loadingBlockStyles")) return;

    const styles = document.createElement("style");
    styles.id = "loadingBlockStyles";
    styles.textContent = `
        /* Page blocked state */
        body.page-blocked {
            overflow: hidden;
            cursor: wait;
        }
        
        body.page-blocked * {
            cursor: wait !important;
        }
        
        /* Blocking overlay content */
        .blocking-content {
            text-align: center;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        
        .blocking-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: blockingSpin 1s linear infinite;
            margin: 0 auto 15px;
        }
        
        .blocking-message {
            font-size: 16px;
            font-weight: 500;
            opacity: 0.9;
            letter-spacing: 0.5px;
        }
        
        @keyframes blockingSpin {
            to {
                transform: rotate(360deg);
            }
        }
        
        /* Enhanced floating alert z-index */
        #floatingAlert {
            z-index: 10000 !important;
        }
        
        #floatingAlert.loading {
            pointer-events: auto !important;
        }
    `;

    document.head.appendChild(styles);
}

/**
 * Show loading với blocking
 */
function showLoading(message = "Đang xử lý...") {
    showFloatingAlert(message, "loading");
}

/**
 * Show success và unblock
 */
function showSuccess(message = "Thành công!", duration = 2000) {
    hideFloatingAlert();
    setTimeout(() => {
        showFloatingAlert(message, "success", duration);
    }, 100);
}

/**
 * Show error và unblock
 */
function showError(message = "Có lỗi xảy ra!", duration = 3000) {
    hideFloatingAlert();
    setTimeout(() => {
        showFloatingAlert(message, "error", duration);
    }, 100);
}

/**
 * Utility: Check nếu page đang bị block
 */
function isPageCurrentlyBlocked() {
    return window.FloatingAlert.isPageBlocked;
}

/**
 * Utility: Force unblock (emergency)
 */
function forceUnblockPage() {
    console.warn("Force unblocking page interactions");
    unblockPageInteractions();
    hideFloatingAlert();
}

/**
 * Auto-inject styles khi script load
 */
(function () {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", injectBlockingStyles);
    } else {
        injectBlockingStyles();
    }
})();

/**
 * Auto-cleanup khi page unload
 */
window.addEventListener("beforeunload", function () {
    if (window.FloatingAlert.isPageBlocked) {
        forceUnblockPage();
    }
});

/**
 * ====================================================================================
 * CLIPBOARD FUNCTIONALITY
 * ====================================================================================
 */

/**
 * Copy text to clipboard với fallback
 */
function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        // Use modern clipboard API
        navigator.clipboard
            .writeText(text)
            .then(() => {
                showCopyNotification();
            })
            .catch((err) => {
                console.error("Failed to copy: ", err);
                // Fallback to older method
                fallbackCopyToClipboard(text);
            });
    } else {
        // Fallback for older browsers or non-secure contexts
        fallbackCopyToClipboard(text);
    }
}

/**
 * Fallback copy method
 */
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        document.execCommand("copy");
        showCopyNotification();
    } catch (err) {
        console.error("Fallback: Oops, unable to copy", err);
    }

    document.body.removeChild(textArea);
}

/**
 * Hiển thị thông báo copy thành công
 */
function showCopyNotification() {
    const notification = document.getElementById("copyNotification");
    if (notification) {
        notification.classList.add("show");

        setTimeout(() => {
            notification.classList.remove("show");
        }, 2000);
    }
}

/**
 * ====================================================================================
 * EVENT HANDLERS SETUP
 * ====================================================================================
 */

/**
 * Setup image click handlers cho copy functionality
 */
function setupImageClickHandlers() {
    // Event delegation for images in table
    const tbody = document.querySelector("tbody");

    if (tbody) {
        tbody.addEventListener("click", function (e) {
            if (e.target.tagName === "IMG") {
                e.preventDefault();
                e.stopPropagation();

                const imgSrc = e.target.dataset.src || e.target.src;

                // Copy image source to clipboard
                copyToClipboard(imgSrc);
            }
        });
    }
}

/**
 * Setup clipboard container drag & drop feedback
 */
function setupClipboardContainers() {
    const containers = ["container", "containerKH"];
    containers.forEach((containerId) => {
        const container = document.getElementById(containerId);
        if (container) {
            container.addEventListener("dragover", function (e) {
                e.preventDefault();
                this.style.borderColor = "#667eea";
                this.style.background = "#f0f4ff";
            });

            container.addEventListener("dragleave", function (e) {
                e.preventDefault();
                this.style.borderColor = "#ddd";
                this.style.background = "#f9f9f9";
            });

            container.addEventListener("drop", function (e) {
                e.preventDefault();
                this.style.borderColor = "#28a745";
                this.style.background = "#f8fff9";
                this.classList.add("has-content");
            });
        }
    });
}

/**
 * Setup form monitoring cho better UX
 */
function setupFormMonitoring() {
    const form = document.querySelector("#dataForm form");
    if (form) {
        form.addEventListener("input", function () {
            const addButton = document.getElementById("addButton");
            const requiredFields = form.querySelectorAll("[required]");
            let allFilled = true;

            requiredFields.forEach((field) => {
                if (!field.value.trim()) {
                    allFilled = false;
                }
            });

            if (addButton) {
                addButton.style.opacity = allFilled ? "1" : "0.6";
            }
        });
    }
}

/**
 * Setup security and performance indicators
 */
function setupSecurityIndicators() {
    // Update security indicator based on HTTPS
    const securityIndicator = document.getElementById("securityIndicator");
    if (securityIndicator) {
        if (location.protocol !== "https:") {
            securityIndicator.textContent = "Insecure";
            securityIndicator.classList.add("insecure");
        }
    }

    // Show performance indicator
    const performanceIndicator = document.getElementById(
        "performanceIndicator",
    );
    if (performanceIndicator) {
        performanceIndicator.style.display = "block";
        setTimeout(() => {
            performanceIndicator.style.display = "none";
        }, 3000);
    }
}

/**
 * ====================================================================================
 * MONITORING & ERROR HANDLING
 * ====================================================================================
 */

/**
 * Performance monitoring
 */
function setupPerformanceMonitoring() {
    window.addEventListener("load", function () {
        if (performance && performance.timing) {
            const loadTime =
                performance.timing.loadEventEnd -
                performance.timing.navigationStart;
            console.log("Page load time:", loadTime + "ms");

            if (loadTime < 2000) {
                showStatusMessage("Tải trang nhanh!", "success");
            } else if (loadTime > 5000) {
                showStatusMessage("Tải trang chậm", "error");
            }
        }
    });
}

/**
 * Global error handler with user feedback
 */
function setupErrorHandling() {
    window.addEventListener("error", function (e) {
        console.error("Global error:", e.error);
        showStatusMessage("Có lỗi xảy ra!", "error");
    });

    // Handle unhandled promise rejections
    window.addEventListener("unhandledrejection", function (e) {
        console.error("Unhandled promise rejection:", e.reason);
        showStatusMessage("Có lỗi xảy ra!", "error");
    });
}

/**
 * ====================================================================================
 * INITIALIZATION
 * ====================================================================================
 */

/**
 * Setup all common UI event handlers
 */
function setupCommonEventHandlers() {
    // Enhanced image click handling for copy functionality
    setupImageClickHandlers();

    // Enhanced clipboard container feedback
    setupClipboardContainers();

    // Monitor form state
    setupFormMonitoring();

    // Setup security and performance indicators
    setupSecurityIndicators();
}

/**
 * Initialize all common utilities
 */
function initializeCommonUtils() {
    // Setup common UI handlers
    setupCommonEventHandlers();

    // Setup performance monitoring
    setupPerformanceMonitoring();

    // Setup error handling
    setupErrorHandling();

    console.log("Common UI Utilities initialized");
}

/**
 * ====================================================================================
 * EXPORTS
 * ====================================================================================
 */

// Export cho window object để sử dụng globally
if (typeof window !== "undefined") {
    // Export individual functions
    window.showStatusMessage = showStatusMessage;
    window.showFloatingAlert = showFloatingAlert;
    window.hideFloatingAlert = hideFloatingAlert;
    window.copyToClipboard = copyToClipboard;
    window.showCopyNotification = showCopyNotification;

    // Export setup functions
    window.setupImageClickHandlers = setupImageClickHandlers;
    window.setupClipboardContainers = setupClipboardContainers;
    window.setupFormMonitoring = setupFormMonitoring;
    window.setupSecurityIndicators = setupSecurityIndicators;
    window.setupPerformanceMonitoring = setupPerformanceMonitoring;
    window.setupErrorHandling = setupErrorHandling;
    window.setupCommonEventHandlers = setupCommonEventHandlers;
    window.initializeCommonUtils = initializeCommonUtils;

    // Export Role
    window.getRoleInfo = getRoleInfo;
    window.updateTitleWithRole = updateTitleWithRole;
    window.initializePageTitle = initializePageTitle;
    window.displayUserInfo = displayUserInfo;

    // Export as CommonUtils namespace
    window.CommonUtils = {
        // Notification functions
        showStatusMessage: showStatusMessage,
        showFloatingAlert: showFloatingAlert,
        hideFloatingAlert: hideFloatingAlert,

        // Clipboard functions
        copyToClipboard: copyToClipboard,
        showCopyNotification: showCopyNotification,

        // Setup functions
        setupImageClickHandlers: setupImageClickHandlers,
        setupClipboardContainers: setupClipboardContainers,
        setupFormMonitoring: setupFormMonitoring,
        setupSecurityIndicators: setupSecurityIndicators,
        setupPerformanceMonitoring: setupPerformanceMonitoring,
        setupErrorHandling: setupErrorHandling,
        setupCommonEventHandlers: setupCommonEventHandlers,

        // Main init
        init: initializeCommonUtils,
    };
}

// Export cho module systems (Node.js, ES6 modules)
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        showStatusMessage,
        showFloatingAlert,
        hideFloatingAlert,
        copyToClipboard,
        showCopyNotification,
        setupImageClickHandlers,
        setupClipboardContainers,
        setupFormMonitoring,
        setupSecurityIndicators,
        setupPerformanceMonitoring,
        setupErrorHandling,
        setupCommonEventHandlers,
        initializeCommonUtils,
    };
}

/**
 * Hàm lấy icon và tên role dựa trên checkLogin
 * @param {number} checkLogin - Mã quyền hạn (0, 1, 2, 3, 777)
 * @returns {object} - Object chứa icon và text
 */
function getRoleInfo(checkLogin) {
    const roleMap = {
        0: { icon: "👑", text: "Admin" },
        1: { icon: "👤", text: "User" },
        2: { icon: "🔒", text: "Limited" },
        3: { icon: "💡", text: "Basic" },
        777: { icon: "👥", text: "Guest" },
    };

    return roleMap[checkLogin] || { icon: "❓", text: "Unknown" };
}

/**
 * Hàm cập nhật title với role icon
 * @param {HTMLElement} titleElement - Element chứa title
 * @param {object} auth - Object chứa thông tin auth user
 */
function updateTitleWithRole(titleElement, auth) {
    if (!titleElement || !auth) return;

    const roleInfo = getRoleInfo(parseInt(auth.checkLogin));
    const baseTitle = titleElement.textContent.split(" - ")[0]; // Lấy title gốc

    titleElement.textContent = `${baseTitle} - ${roleInfo.icon} ${auth.displayName || auth.username}`;
}

/**
 * Ví dụ sử dụng trong các trang
 */
function initializePageTitle() {
    try {
        const authData = localStorage.getItem("loginindex_auth");
        if (!authData) return;

        const auth = JSON.parse(authData);
        const titleElement = document.querySelector("h1, .tieude, .header h1");

        if (titleElement && auth.checkLogin !== undefined) {
            updateTitleWithRole(titleElement, auth);
        }

        console.log("Page title updated with role icon");
    } catch (error) {
        console.error("Error updating page title:", error);
    }
}

/**
 * Hàm hiển thị user info với icon ở sidebar hoặc header
 * @param {string} containerSelector - Selector của container
 */
function displayUserInfo(containerSelector = ".user-info") {
    try {
        const authData = localStorage.getItem("loginindex_auth");
        if (!authData) return;

        const auth = JSON.parse(authData);
        const container = document.querySelector(containerSelector);

        if (container) {
            const roleInfo = getRoleInfo(parseInt(auth.checkLogin));
            container.innerHTML = `
                <span class="user-role-badge">
                    ${roleInfo.icon} ${auth.displayName || auth.username}
                    <small>(${roleInfo.text})</small>
                </span>
            `;
        }
    } catch (error) {
        console.error("Error displaying user info:", error);
    }
}

/**
 * CSS cho user role badge
 */
function injectRoleStyles() {
    if (document.getElementById("roleStyles")) return;

    const styles = document.createElement("style");
    styles.id = "roleStyles";
    document.head.appendChild(styles);
}

/**
 * Cách sử dụng trong code hiện tại của bạn:
 */

// 1. Thay thế đoạn code hiện tại:
// if (auth.checkLogin === 0) {
//     titleElement.textContent += ' - 👑 ' + auth.displayName;
// }

// Bằng:
// updateTitleWithRole(titleElement, auth);

// 2. Hoặc sử dụng cách ngắn gọn:
function updatePageTitleSimple() {
    try {
        const authData = JSON.parse(
            localStorage.getItem("loginindex_auth") || "{}",
        );
        const titleElement = document.querySelector("h1, .tieude, .header h1");

        if (titleElement && authData.checkLogin !== undefined) {
            const roleInfo = getRoleInfo(parseInt(authData.checkLogin));
            const baseTitle = titleElement.textContent.split(" - ")[0];
            titleElement.textContent = `${baseTitle} - ${roleInfo.icon} ${authData.displayName || authData.username}`;
        }
    } catch (error) {
        console.error("Error updating title:", error);
    }
}

// 3. Auto-initialize khi DOM ready
document.addEventListener("DOMContentLoaded", function () {
    injectRoleStyles();

    // Delay một chút để đảm bảo auth data đã load
    setTimeout(() => {
        initializePageTitle();
    }, 100);
});

// Export để sử dụng global
window.RoleManager = {
    getRoleInfo: getRoleInfo,
    updateTitleWithRole: updateTitleWithRole,
    displayUserInfo: displayUserInfo,
    initializePageTitle: initializePageTitle,
};

window.addEventListener("load", function () {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.classList.remove("show");
    }
});
