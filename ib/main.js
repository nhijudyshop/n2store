// =====================================================
// MAIN APPLICATION INITIALIZATION
// =====================================================

class InboxApp {
    constructor() {
        this.isInitialized = false;
        this.startTime = performance.now();
    }

    // Initialize the application
    async init() {
        if (this.isInitialized) return;

        try {
            console.log("Initializing Enhanced Inbox Management System...");

            // Check authentication first
            if (!this.checkAuthentication()) {
                return;
            }

            // Update UI based on user
            this.updateUserInterface();

            // Initialize performance monitoring
            this.initializePerformanceMonitoring();

            // Initialize all managers
            await this.initializeManagers();

            // Setup global event listeners
            this.setupGlobalEventListeners();

            // Initialize data with migration
            await this.initializeData();

            // Mark as initialized
            this.isInitialized = true;

            // Log successful initialization
            const initTime = performance.now() - this.startTime;
            console.log(
                `Enhanced Inbox Management System initialized successfully in ${initTime.toFixed(2)}ms`,
            );

            // Update performance indicator
            uiManager.updatePerformanceIndicator(initTime);
        } catch (error) {
            console.error("Failed to initialize application:", error);
            uiManager.showError(
                "Lỗi khởi tạo ứng dụng. Vui lòng tải lại trang.",
            );
        }
    }

    // Check user authentication
    checkAuthentication() {
        const auth = authManager.getAuthState();
        if (!authManager.isAuthenticated()) {
            console.log("User not authenticated, redirecting...");
            window.location.href = "../index.html";
            return false;
        }

        console.log("User authenticated:", auth);
        return true;
    }

    // Update UI based on user
    updateUserInterface() {
        const auth = authManager.getAuthState();
        if (auth && auth.userType) {
            const titleElement = document.querySelector(".page-title");
            if (titleElement) {
                titleElement.textContent += " - " + auth.userType;
            }
        }

        // Show main container
        const parentContainer = document.getElementById("parentContainer");
        if (parentContainer) {
            parentContainer.style.display = "flex";
            parentContainer.style.justifyContent = "center";
            parentContainer.style.alignItems = "center";
        }

        // Update form permissions
        if (window.formHandler) {
            window.formHandler.updateFormPermissions();
        }
    }

    // Initialize performance monitoring
    initializePerformanceMonitoring() {
        // Monitor page load performance
        if (performance && performance.timing) {
            window.addEventListener("load", () => {
                const loadTime =
                    performance.timing.loadEventEnd -
                    performance.timing.navigationStart;
                console.log("Page load time:", loadTime + "ms");
                uiManager.updatePerformanceIndicator(loadTime);
            });
        }

        // Monitor memory usage
        if (performance.memory) {
            setInterval(() => {
                const memInfo = performance.memory;
                if (memInfo.usedJSHeapSize > memInfo.jsHeapSizeLimit * 0.9) {
                    console.warn("High memory usage detected, cleaning up...");
                    this.cleanupMemory();
                }
            }, 30000); // Check every 30 seconds
        }

        // Monitor long tasks
        if ("PerformanceObserver" in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    list.getEntries().forEach((entry) => {
                        if (entry.duration > 50) {
                            console.warn(
                                `Long task detected: ${entry.duration}ms`,
                            );
                        }
                    });
                });
                observer.observe({ entryTypes: ["longtask"] });
            } catch (e) {
                console.log("PerformanceObserver not fully supported");
            }
        }
    }

    // Initialize all managers
    async initializeManagers() {
        // Managers are already initialized by their respective files
        // Just ensure they're properly set up

        // Update form based on user permissions
        if (window.formHandler) {
            window.formHandler.updateFormPermissions();
        }

        // Initialize table manager
        if (window.tableManager) {
            console.log("Table manager initialized");
        }

        console.log("All managers initialized successfully");
    }

    // Setup global event listeners
    setupGlobalEventListeners() {
        // Logout button handler
        const toggleLogoutButton =
            document.getElementById("toggleLogoutButton");
        if (toggleLogoutButton) {
            toggleLogoutButton.addEventListener(
                "click",
                this.handleLogout.bind(this),
            );
        }

        // Add refresh button
        this.addRefreshButton();

        // Global error handler
        window.addEventListener("error", this.handleGlobalError.bind(this));

        // Cleanup on page unload
        window.addEventListener("beforeunload", this.cleanup.bind(this));

        // Handle visibility change for performance
        document.addEventListener(
            "visibilitychange",
            this.handleVisibilityChange.bind(this),
        );

        // Handle online/offline status
        window.addEventListener("online", () => {
            uiManager.showSuccess("Kết nối mạng đã được khôi phục");
        });

        window.addEventListener("offline", () => {
            uiManager.showError("Mất kết nối mạng");
        });

        // Keyboard shortcuts
        document.addEventListener(
            "keydown",
            this.handleKeyboardShortcuts.bind(this),
        );
    }

    // Add refresh button
    addRefreshButton() {
        const parentContainer = document.getElementById("parentContainer");
        if (!parentContainer) return;

        const refreshButton = Utils.createElement("button", {
            className: "refresh-button",
            title: "Làm mới dữ liệu (Ctrl+R)",
        });

        refreshButton.textContent = "Làm mới dữ liệu";

        refreshButton.style.cssText = `
            margin-left: 10px;
            padding: 8px 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.3s ease;
        `;

        refreshButton.addEventListener("mouseover", function () {
            this.style.transform = "translateY(-2px)";
            this.style.boxShadow = "0 4px 15px rgba(102, 126, 234, 0.4)";
        });

        refreshButton.addEventListener("mouseout", function () {
            this.style.transform = "translateY(0)";
            this.style.boxShadow = "none";
        });

        refreshButton.addEventListener("click", () => {
            if (window.tableManager) {
                window.tableManager.forceRefreshData();
            }
        });

        parentContainer.appendChild(refreshButton);
    }

    // Handle keyboard shortcuts
    handleKeyboardShortcuts(e) {
        // Ctrl+R for refresh (prevent default browser refresh)
        if (e.ctrlKey && e.key === "r") {
            e.preventDefault();
            if (window.tableManager) {
                window.tableManager.forceRefreshData();
            }
        }

        // Ctrl+N for new form
        if (e.ctrlKey && e.key === "n" && authManager.hasPermission(3)) {
            e.preventDefault();
            if (window.formHandler) {
                window.formHandler.toggleForm();
            }
        }

        // Esc to close modals
        if (e.key === "Escape") {
            uiManager.hideAlert();
            uiManager.hideImageOverlay();
        }
    }

    // Initialize data with migration
    async initializeData() {
        if (window.tableManager) {
            await window.tableManager.initializeWithMigration();
        }
    }

    // Handle global errors
    handleGlobalError(e) {
        console.error("Global error:", e.error);

        // Don't show error for script loading issues
        if (e.filename && e.filename.includes(".js")) {
            console.warn("Script loading error, but continuing...");
            return;
        }

        uiManager.showError("Có lỗi xảy ra. Vui lòng tải lại trang.");

        // Log error for debugging
        if (window.tableManager) {
            window.tableManager.logAction(
                "error",
                `Global error: ${e.error?.message || "Unknown error"}`,
                {
                    filename: e.filename,
                    lineno: e.lineno,
                    colno: e.colno,
                },
            );
        }
    }

    // Handle visibility change for performance
    handleVisibilityChange() {
        if (document.hidden) {
            // Page is hidden, reduce activity
            console.log("Page hidden, reducing activity");
        } else {
            // Page is visible, resume normal activity
            console.log("Page visible, resuming normal activity");

            // Refresh cache if it's been a while
            const cacheStatus = cacheManager.getCacheStatus();
            if (cacheStatus.status === "expired") {
                console.log(
                    "Cache expired while page was hidden, refreshing...",
                );
                if (window.tableManager) {
                    window.tableManager.forceRefreshData();
                }
            }
        }
    }

    // Handle logout
    handleLogout() {
        const confirmLogout = confirm("Bạn có chắc muốn đăng xuất?");
        if (confirmLogout) {
            authManager.clearAuthState();
            cacheManager.invalidateCache();
            this.cleanup();
            window.location.href = "../index.html";
        }
    }

    // Cleanup memory and resources
    cleanupMemory() {
        // Clear cache if needed
        const cacheStatus = cacheManager.getCacheStatus();
        if (cacheStatus.size > 1000) {
            // If cache is too large
            console.log("Cleaning up large cache...");
            cacheManager.invalidateCache();
        }

        // Clean up blob URLs
        const images = document.querySelectorAll('img[src^="blob:"]');
        images.forEach((img) => {
            URL.revokeObjectURL(img.src);
        });

        // Force garbage collection if available
        if (window.gc) {
            window.gc();
        }
    }

    // General cleanup
    cleanup() {
        this.cleanupMemory();

        // Clear image handler data
        if (window.imageHandler) {
            window.imageHandler.clearData();
        }

        console.log("Application cleanup completed");
    }

    // Get application status
    getStatus() {
        return {
            initialized: this.isInitialized,
            authenticated: authManager.isAuthenticated(),
            cacheStatus: cacheManager.getCacheStatus(),
            loadTime: performance.now() - this.startTime,
            userInfo: authManager.getCurrentUser(),
        };
    }
}

// Initialize application when DOM is ready
document.addEventListener("DOMContentLoaded", async function () {
    // Create global app instance
    window.inboxApp = new InboxApp();

    // Initialize the application
    await window.inboxApp.init();

    // Remove ads if present
    setTimeout(() => {
        const adsElement = document.querySelector(
            'div[style*="position: fixed"][style*="z-index:9999999"]',
        );
        if (adsElement) {
            adsElement.remove();
        }
    }, 1000);

    // Expose debugging interface
    window.inboxDebug = {
        app: window.inboxApp,
        auth: authManager,
        cache: cacheManager,
        ui: uiManager,
        table: window.tableManager,
        form: window.formHandler,
        image: window.imageHandler,
        utils: Utils,
        config: CONFIG,

        // Debug functions
        getStatus: () => window.inboxApp.getStatus(),
        clearCache: () => cacheManager.invalidateCache(),
        refreshData: () => window.tableManager.forceRefreshData(),
        cleanup: () => window.inboxApp.cleanup(),
    };

    console.log(
        "Application ready. Debug interface available at window.inboxDebug",
    );
});

// Handle unhandled promise rejections
window.addEventListener("unhandledrejection", function (e) {
    console.error("Unhandled promise rejection:", e.reason);

    // Don't show UI error for every promise rejection
    if (e.reason && e.reason.message && !e.reason.message.includes("Network")) {
        uiManager.showError("Có lỗi xảy ra trong quá trình xử lý dữ liệu");
    }

    // Prevent default handling
    e.preventDefault();
});
