/**
 * Common UI Utilities - Các tiện ích giao diện chung
 * File: common-utils.js
 *
 * WRAPPER FILE - Backward compatibility layer
 * SOURCE OF TRUTH: /shared/browser/common-utils.js
 *
 * This file is kept for backward compatibility with existing code using:
 *   <script src="../shared/js/common-utils.js"></script>
 *
 * For new ES Module code, import directly from:
 *   import { CommonUtils } from '/shared/browser/common-utils.js';
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
 * EVENT HANDLERS SETUP
 * ====================================================================================
 */

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

    // Export setup functions
    window.setupClipboardContainers = setupClipboardContainers;
    window.setupFormMonitoring = setupFormMonitoring;
    window.setupSecurityIndicators = setupSecurityIndicators;
    window.setupPerformanceMonitoring = setupPerformanceMonitoring;
    window.setupErrorHandling = setupErrorHandling;
    window.setupCommonEventHandlers = setupCommonEventHandlers;
    window.initializeCommonUtils = initializeCommonUtils;

    // Export Role
    window.getRoleInfo = getRoleInfo;
    window.initializePageTitle = initializePageTitle;
    window.displayUserInfo = displayUserInfo;

    // Export as CommonUtils namespace
    window.CommonUtils = {
        // Notification functions
        showStatusMessage: showStatusMessage,
        showFloatingAlert: showFloatingAlert,
        hideFloatingAlert: hideFloatingAlert,

        // Setup functions
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
function updateTitleWithRoleEnhanced(titleElement, auth) {
    if (!titleElement || !auth) return;

    const roleInfo = getRoleInfo(parseInt(auth.checkLogin));
    const baseTitle = titleElement.textContent.split(" - ")[0];

    // Clear và rebuild với proper structure
    titleElement.innerHTML = "";

    // Title text
    const titleText = document.createTextNode(`${baseTitle} - `);
    titleElement.appendChild(titleText);

    // Icon với class theo role
    const iconSpan = document.createElement("span");
    iconSpan.className = "role-icon";

    // Thêm class specific theo role
    const roleClass =
        {
            0: "admin",
            1: "user",
            2: "limited",
            3: "basic",
            777: "guest",
        }[parseInt(auth.checkLogin)] || "default";

    iconSpan.classList.add(roleClass);
    iconSpan.textContent = roleInfo.icon;
    titleElement.appendChild(iconSpan);

    // User name text
    const userText = document.createTextNode(
        ` ${auth.displayName || auth.username}`,
    );
    titleElement.appendChild(userText);
}

// Export enhanced version
window.updateTitleWithRoleEnhanced = updateTitleWithRoleEnhanced;

/**
 * Ví dụ sử dụng trong các trang
 */
function initializePageTitle() {
    try {
        const authData = n2store.getItem("loginindex_auth");
        if (!authData) return;

        const auth = JSON.parse(authData);
        const titleElement = document.querySelector(
            "h1, .page-title, .header h1",
        );

        if (titleElement && auth.checkLogin !== undefined) {
            updateTitleWithRoleEnhanced(titleElement, auth);
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
        const authData = n2store.getItem("loginindex_auth");
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
    styles.textContent = `
        /* ================== BEAUTIFUL .page-title STYLES - FIXED VERSION ================== */
        
        /* Beautiful gradient .page-title styles */
        .page-title {
            font-size: 2.5rem;
            font-weight: 700;
            text-align: center;
            margin: 20px 0;
            padding: 20px 15px;
            position: relative;
            letter-spacing: -0.02em;
            line-height: 1.2;
            transition: all 0.3s ease;
            
            /* Gradient chỉ áp dụng cho text */
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            
            /* Subtle text shadow for depth */
            filter: drop-shadow(0 2px 4px rgba(102, 126, 234, 0.2));
        }

        /* FIX QUAN TRỌNG: Role icon styles - SPECIFIC CLASS */
        .page-title .role-icon {
            -webkit-text-fill-color: initial !important;
            background: none !important;
            color: #f39c12 !important;
            text-shadow: 
                0 0 10px rgba(243, 156, 18, 0.6),
                0 0 20px rgba(243, 156, 18, 0.3) !important;
            font-style: normal !important;
            font-size: 0.9em !important;
            margin: 0 8px !important;
            display: inline-block !important;
            animation: roleIconGlow 2s ease-in-out infinite !important;
            filter: drop-shadow(0 3px 6px rgba(243, 156, 18, 0.4)) !important;
            position: relative;
            z-index: 10;
        }

        /* Fallback cho browsers không support background-clip */
        @supports not (-webkit-background-clip: text) {
            .page-title {
                background: none;
                -webkit-text-fill-color: initial;
                color: #667eea;
                text-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);
            }
            
            .page-title .role-icon {
                color: #f39c12 !important;
            }
        }

        /* Hover glow effect cho title */
        .page-title::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15));
            border-radius: 15px;
            transform: translate(-50%, -50%);
            z-index: -1;
            filter: blur(20px);
            opacity: 0;
            transition: opacity 0.4s ease;
        }

        .page-title:hover::before {
            opacity: 1;
        }

        .page-title:hover {
            transform: translateY(-2px);
        }

        .page-title:hover .role-icon {
            animation: roleIconBounce 0.6s ease !important;
            text-shadow: 
                0 0 15px rgba(243, 156, 18, 0.8),
                0 0 25px rgba(243, 156, 18, 0.4) !important;
            transform: scale(1.1) !important;
        }

        /* Enhanced role icon animations */
        @keyframes roleIconGlow {
            0%, 100% {
                text-shadow: 
                    0 0 10px rgba(243, 156, 18, 0.6),
                    0 0 20px rgba(243, 156, 18, 0.3);
                transform: scale(1);
            }
            50% {
                text-shadow: 
                    0 0 15px rgba(243, 156, 18, 0.8),
                    0 0 25px rgba(243, 156, 18, 0.5);
                transform: scale(1.05);
            }
        }

        @keyframes roleIconBounce {
            0%, 100% {
                transform: scale(1.1);
            }
            25% {
                transform: scale(1.2) rotate(5deg);
            }
            50% {
                transform: scale(1.15) rotate(0deg);
            }
            75% {
                transform: scale(1.2) rotate(-5deg);
            }
        }

        /* Alternative icon colors cho từng role */
        .page-title .role-icon.admin {
            color: #e74c3c !important;
            text-shadow: 
                0 0 10px rgba(231, 76, 60, 0.6),
                0 0 20px rgba(231, 76, 60, 0.3) !important;
        }

        .page-title .role-icon.user {
            color: #3498db !important;
            text-shadow: 
                0 0 10px rgba(52, 152, 219, 0.6),
                0 0 20px rgba(52, 152, 219, 0.3) !important;
        }

        .page-title .role-icon.limited {
            color: #95a5a6 !important;
            text-shadow: 
                0 0 10px rgba(149, 165, 166, 0.6),
                0 0 20px rgba(149, 165, 166, 0.3) !important;
        }

        .page-title .role-icon.basic {
            color: #f1c40f !important;
            text-shadow: 
                0 0 10px rgba(241, 196, 15, 0.6),
                0 0 20px rgba(241, 196, 15, 0.3) !important;
        }

        .page-title .role-icon.guest {
            color: #9b59b6 !important;
            text-shadow: 
                0 0 10px rgba(155, 89, 182, 0.6),
                0 0 20px rgba(155, 89, 182, 0.3) !important;
        }

        /* User role badge với beautiful gradient */
        .user-role-badge {
            display: inline-flex;
            align-items: center;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 10px 18px;
            border-radius: 25px;
            font-weight: 500;
            box-shadow: 
                0 4px 15px rgba(102, 126, 234, 0.3),
                0 2px 8px rgba(118, 75, 162, 0.2);
            font-size: 0.9rem;
            transition: all 0.3s ease;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .user-role-badge:hover {
            transform: translateY(-2px);
            box-shadow: 
                0 6px 20px rgba(102, 126, 234, 0.4),
                0 4px 12px rgba(118, 75, 162, 0.3);
        }

        .user-role-badge small {
            margin-left: 8px;
            opacity: 0.85;
            font-size: 0.8em;
            font-weight: 400;
        }

        /* Responsive design */
        @media (max-width: 768px) {
            .page-title {
                font-size: 1.8rem;
                padding: 15px 10px;
                margin: 15px 0;
            }
            
            .page-title .role-icon {
                font-size: 0.85em !important;
                margin: 0 6px !important;
            }
            
            .user-role-badge {
                padding: 8px 14px;
                font-size: 0.85rem;
            }
        }

        @media (max-width: 480px) {
            .page-title {
                font-size: 1.4rem;
                padding: 10px 5px;
            }
            
            .page-title .role-icon {
                font-size: 0.8em !important;
                margin: 0 4px !important;
            }
            
            .user-role-badge {
                padding: 6px 12px;
                font-size: 0.8rem;
            }
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
            .page-title .role-icon {
                filter: brightness(1.2) drop-shadow(0 3px 6px rgba(243, 156, 18, 0.4)) !important;
            }
            
            .user-role-badge {
                background: linear-gradient(135deg, #4c51bf, #553c9a);
                border-color: rgba(255, 255, 255, 0.2);
            }
        }

        /* Print styles */
        @media print {
            .page-title {
                background: none !important;
                -webkit-text-fill-color: initial !important;
                color: #000 !important;
                text-shadow: none !important;
                filter: none !important;
            }
            
            .page-title .role-icon {
                color: #000 !important;
                text-shadow: none !important;
                animation: none !important;
                filter: none !important;
            }
            
            .page-title::before {
                display: none;
            }
            
            .user-role-badge {
                background: #667eea !important;
                box-shadow: none !important;
            }
        }

        /* High contrast mode support */
        @media (prefers-contrast: high) {
            .page-title {
                background: none !important;
                -webkit-text-fill-color: initial !important;
                color: #000 !important;
                border: 2px solid #000;
            }
            
            .page-title .role-icon {
                color: #000 !important;
                text-shadow: none !important;
            }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
            .page-title,
            .page-title::before,
            .page-title .role-icon,
            .user-role-badge {
                animation: none !important;
                transition: none !important;
            }
        }

        /* Focus accessibility */
        .page-title:focus-visible {
            outline: 3px solid rgba(102, 126, 234, 0.6);
            outline-offset: 4px;
        }

        .user-role-badge:focus-visible {
            outline: 2px solid rgba(255, 255, 255, 0.8);
            outline-offset: 2px;
        }
    `;

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
            n2store.getItem("loginindex_auth") || "{}",
        );
        const titleElement = document.querySelector(
            "h1, .page-title, .header h1",
        );

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
    updateTitleWithRoleEnhanced: updateTitleWithRoleEnhanced,
    displayUserInfo: displayUserInfo,
    initializePageTitle: initializePageTitle,
};

window.addEventListener("load", function () {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.classList.remove("show");
    }
});
