/* =====================================================
   MODERN NAVIGATION MANAGER - Complete Version with Hide/Show Sidebar
   ===================================================== */

// Menu Configuration with Permissions
const MENU_CONFIG = [
    {
        href: "../live/index.html",
        icon: "image",
        text: "Hình Ảnh Live",
        pageIdentifier: "live",
        permissionRequired: "live",
    },
    {
        href: "../livestream/index.html",
        icon: "video",
        text: "Báo Cáo Livestream",
        pageIdentifier: "livestream",
        permissionRequired: "livestream",
    },
    {
        href: "../sanphamlive/index.html",
        icon: "shopping-bag",
        text: "Sản Phẩm Livestream",
        pageIdentifier: "sanphamlive",
        permissionRequired: "sanphamlive",
    },
    {
        href: "../nhanhang/index.html",
        icon: "scale",
        text: "Cân Nặng Hàng",
        pageIdentifier: "nhanhang",
        permissionRequired: "nhanhang",
    },
    {
        href: "../hangrotxa/index.html",
        icon: "clipboard-list",
        text: "Hàng Rớt - Xả",
        pageIdentifier: "hangrotxa",
        permissionRequired: "hangrotxa",
    },
    {
        href: "../ib/index.html",
        icon: "message-circle",
        text: "Check Inbox Khách",
        pageIdentifier: "ib",
        permissionRequired: "ib",
    },
    {
        href: "../ck/index.html",
        icon: "credit-card",
        text: "Thông Tin Chuyển Khoản",
        pageIdentifier: "ck",
        permissionRequired: "ck",
    },
    {
        href: "../hanghoan/index.html",
        icon: "corner-up-left",
        text: "Hàng Hoàn",
        pageIdentifier: "hanghoan",
        permissionRequired: "hanghoan",
    },
    {
        href: "../hangdat/index.html",
        icon: "bookmark",
        text: "Hàng Đặt",
        pageIdentifier: "hangdat",
        permissionRequired: "hangdat",
    },
    {
        href: "../bangkiemhang/index.html",
        icon: "check-square",
        text: "Bảng Kiểm Hàng",
        pageIdentifier: "bangkiemhang",
        permissionRequired: "bangkiemhang",
    },
    {
        href: "../user-management/index.html",
        icon: "users",
        text: "Quản Lý Tài Khoản",
        pageIdentifier: "user-management",
        adminOnly: true,
        permissionRequired: "user-management",
    },
    {
        href: "../history/index.html",
        icon: "bar-chart-2",
        text: "Lịch Sử Chỉnh Sửa",
        pageIdentifier: "history",
        adminOnly: true,
        permissionRequired: "history",
    },
];

class ModernNavigationManager {
    constructor() {
        this.currentPage = null;
        this.userPermissions = [];
        this.isAdmin = false;
        this.init();
    }

    async init() {
        console.log("[Navigation] Starting initialization...");

        // Check authentication
        if (!authManager || !authManager.isAuthenticated()) {
            console.log("[Navigation] User not authenticated, redirecting...");
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
            return;
        }

        try {
            // Get user info
            const checkLogin = localStorage.getItem("checkLogin");
            this.isAdmin = checkLogin === "0" || checkLogin === 0;
            console.log("[Navigation] Is Admin:", this.isAdmin);

            // Load permissions
            await this.loadUserPermissions();
            console.log(
                "[Navigation] Permissions loaded:",
                this.userPermissions,
            );

            // Get current page
            this.currentPage = this.getCurrentPageIdentifier();
            console.log("[Navigation] Current page:", this.currentPage);

            // Check page access
            const hasAccess = this.checkPageAccess();
            console.log("[Navigation] Has access to page:", hasAccess);

            if (!hasAccess) {
                this.showAccessDenied();
                return;
            }

            // Build UI
            this.renderNavigation();
            this.updateUserInfo();
            this.setupEventListeners();
            this.initializeSidebarToggle();
            this.loadSettings();

            console.log("[Navigation] Initialization complete!");
        } catch (error) {
            console.error("[Navigation] Initialization error:", error);
        }
    }

    async loadUserPermissions() {
        // Admin gets all permissions
        if (this.isAdmin) {
            this.userPermissions = MENU_CONFIG.map(
                (item) => item.permissionRequired,
            ).filter(Boolean);
            console.log("[Navigation] Admin - all permissions granted");
            return;
        }

        // Try to load from localStorage cache
        try {
            const authData = localStorage.getItem("loginindex_auth");
            if (authData) {
                const userAuth = JSON.parse(authData);
                if (
                    userAuth.pagePermissions &&
                    Array.isArray(userAuth.pagePermissions)
                ) {
                    this.userPermissions = userAuth.pagePermissions;
                    console.log("[Navigation] Loaded cached permissions");
                    return;
                }
            }
        } catch (error) {
            console.error(
                "[Navigation] Error loading cached permissions:",
                error,
            );
        }

        // Try to load from Firebase
        try {
            if (typeof firebase !== "undefined" && firebase.firestore) {
                const authData = JSON.parse(
                    localStorage.getItem("loginindex_auth"),
                );
                const db = firebase.firestore();
                const userDoc = await db
                    .collection("users")
                    .doc(authData.username)
                    .get();

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    this.userPermissions = userData.pagePermissions || [];

                    // Cache for next time
                    authData.pagePermissions = this.userPermissions;
                    localStorage.setItem(
                        "loginindex_auth",
                        JSON.stringify(authData),
                    );
                    console.log(
                        "[Navigation] Loaded permissions from Firebase",
                    );
                    return;
                }
            }
        } catch (error) {
            console.error(
                "[Navigation] Error loading Firebase permissions:",
                error,
            );
        }

        this.userPermissions = [];
    }

    getCurrentPageIdentifier() {
        const path = window.location.pathname;

        // Sort by length descending để check path dài trước (sanphamlive trước live)
        const sortedMenu = [...MENU_CONFIG].sort(
            (a, b) => b.pageIdentifier.length - a.pageIdentifier.length,
        );

        for (const item of sortedMenu) {
            // Check chính xác với boundary (/ hoặc index.html)
            const pattern1 = `/${item.pageIdentifier}/`;
            const pattern2 = `/${item.pageIdentifier}/index.html`;

            if (path.includes(pattern1) || path.endsWith(pattern2)) {
                return item.pageIdentifier;
            }
        }

        return null;
    }

    checkPageAccess() {
        if (!this.currentPage) return true;

        const pageInfo = MENU_CONFIG.find(
            (item) => item.pageIdentifier === this.currentPage,
        );

        if (!pageInfo) return true;
        if (pageInfo.publicAccess) return true;
        if (this.isAdmin) return true;

        return this.userPermissions.includes(this.currentPage);
    }

    renderNavigation() {
        console.log("[Navigation] Rendering navigation menu...");

        const sidebarNav = document.querySelector(".sidebar-nav");
        if (!sidebarNav) {
            console.error("[Navigation] Sidebar nav element not found!");
            return;
        }

        // Clear existing content
        sidebarNav.innerHTML = "";

        let renderedCount = 0;

        MENU_CONFIG.forEach((menuItem) => {
            const hasPermission =
                this.isAdmin ||
                this.userPermissions.includes(menuItem.permissionRequired);

            if (!hasPermission) {
                console.log(
                    `[Navigation] Skipping: ${menuItem.text} (no permission)`,
                );
                return;
            }

            // Create nav item
            const navItem = document.createElement("a");
            navItem.href = menuItem.href;
            navItem.className = "nav-item";

            // Mark active page
            if (menuItem.pageIdentifier === this.currentPage) {
                navItem.classList.add("active");
            }

            // Add content
            navItem.innerHTML = `
                <i data-lucide="${menuItem.icon}"></i>
                <span>${menuItem.text}</span>
            `;

            sidebarNav.appendChild(navItem);
            renderedCount++;
        });

        console.log(`[Navigation] Rendered ${renderedCount} menu items`);

        // Add Settings button at the end of navigation
        this.addSettingsToNavigation(sidebarNav);

        // Initialize Lucide icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
            console.log("[Navigation] Lucide icons initialized");
        }
    }

    addSettingsToNavigation(sidebarNav) {
        // Create a divider
        const divider = document.createElement("div");
        divider.className = "nav-divider";
        divider.innerHTML =
            '<hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 16px 0;">';
        sidebarNav.appendChild(divider);

        // Create Settings button
        const settingsBtn = document.createElement("button");
        settingsBtn.id = "btnSettings";
        settingsBtn.className = "nav-item nav-settings-btn";
        settingsBtn.innerHTML = `
            <i data-lucide="settings"></i>
            <span>Cài Đặt</span>
        `;
        sidebarNav.appendChild(settingsBtn);

        // Add styles for settings button
        if (!document.getElementById("settingsNavStyles")) {
            const style = document.createElement("style");
            style.id = "settingsNavStyles";
            style.textContent = `
                .nav-settings-btn {
                    background: none !important;
                    border: none;
                    width: 100%;
                    text-align: left;
                    cursor: pointer;
                    margin-top: 8px;
                }

                .nav-settings-btn:hover {
                    background: rgba(255, 255, 255, 0.1) !important;
                }

                .nav-settings-btn i {
                    color: #fbbf24;
                }
            `;
            document.head.appendChild(style);
        }

        console.log("[Navigation] Settings button added to navigation");
    }

    updateUserInfo() {
        const userInfo = authManager.getAuthState();
        if (!userInfo) return;

        // Update user name
        const userName = document.getElementById("userName");
        if (userName) {
            userName.textContent =
                userInfo.displayName || userInfo.username || "User";
        }

        // Update user role
        const userRole = document.querySelector(".user-role");
        if (userRole) {
            const roleMap = {
                0: "Admin",
                1: "Manager",
                3: "Staff",
                777: "Guest",
            };
            const checkLogin = localStorage.getItem("checkLogin");
            userRole.textContent = roleMap[checkLogin] || "User";
        }

        console.log("[Navigation] User info updated");
    }

    setupEventListeners() {
        // Mobile menu toggle
        const menuToggle = document.getElementById("menuToggle");
        const sidebar = document.getElementById("sidebar");

        if (menuToggle && sidebar) {
            menuToggle.addEventListener("click", () => {
                sidebar.classList.toggle("active");
            });
        }

        // Close sidebar when clicking outside (mobile)
        document.addEventListener("click", (e) => {
            if (window.innerWidth <= 1024 && sidebar) {
                if (
                    !sidebar.contains(e.target) &&
                    menuToggle &&
                    !menuToggle.contains(e.target) &&
                    sidebar.classList.contains("active")
                ) {
                    sidebar.classList.remove("active");
                }
            }
        });

        // Logout button
        const btnLogout = document.getElementById("btnLogout");
        if (btnLogout) {
            btnLogout.addEventListener("click", () => {
                authManager.logout();
            });
        }

        // Permissions button
        const btnPermissions = document.getElementById("btnPermissions");
        if (btnPermissions) {
            btnPermissions.addEventListener("click", () => {
                this.showPermissionsSummary();
            });
        }

        // Settings button
        const btnSettings = document.getElementById("btnSettings");
        if (btnSettings) {
            btnSettings.addEventListener("click", () => {
                this.showSettings();
            });
        }

        console.log("[Navigation] Event listeners setup complete");
    }

    // =====================================================
    // SIDEBAR HIDE/SHOW FUNCTIONALITY
    // =====================================================

    initializeSidebarToggle() {
        const sidebar = document.getElementById("sidebar");
        const sidebarToggle = document.getElementById("sidebarToggle");

        if (!sidebar || !sidebarToggle) {
            console.warn("[Navigation] Sidebar toggle elements not found");
            return;
        }

        // Desktop sidebar toggle (ẩn/hiện)
        sidebarToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            this.hideSidebar();
        });

        // Tạo nút toggle cố định
        this.createFixedToggleButton();

        // Khôi phục trạng thái sidebar
        this.restoreSidebarState();

        // Xử lý window resize
        let resizeTimeout;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (window.innerWidth <= 1024) {
                    // Mobile mode: reset collapsed state
                    sidebar.classList.remove("collapsed");
                } else {
                    // Desktop mode: khôi phục từ localStorage
                    this.restoreSidebarState();
                }
            }, 250);
        });

        console.log("[Navigation] Sidebar toggle initialized");
    }

    // Ẩn sidebar
    hideSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;

        sidebar.classList.add("collapsed");
        localStorage.setItem("sidebarCollapsed", "true");

        console.log("[Navigation] Sidebar hidden");
    }

    // Hiện sidebar
    showSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;

        sidebar.classList.remove("collapsed");
        localStorage.setItem("sidebarCollapsed", "false");

        console.log("[Navigation] Sidebar shown");
    }

    // Toggle sidebar (ẩn/hiện)
    toggleSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;

        if (sidebar.classList.contains("collapsed")) {
            this.showSidebar();
        } else {
            this.hideSidebar();
        }
    }

    // Tạo nút toggle cố định
    createFixedToggleButton() {
        const mainContent = document.querySelector(".main-content");
        if (!mainContent) return;

        // Kiểm tra nếu button đã tồn tại
        if (document.querySelector(".sidebar-toggle-fixed")) return;

        const fixedBtn = document.createElement("button");
        fixedBtn.className = "sidebar-toggle-fixed";
        fixedBtn.innerHTML = '<i data-lucide="panel-left-open"></i>';
        fixedBtn.title = "Mở sidebar";

        // Bấm vào nút để hiện sidebar
        fixedBtn.addEventListener("click", () => {
            this.showSidebar();
        });

        mainContent.appendChild(fixedBtn);

        // Initialize Lucide icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        console.log("[Navigation] Fixed toggle button created");
    }

    // Khôi phục trạng thái sidebar từ localStorage
    restoreSidebarState() {
        const sidebar = document.getElementById("sidebar");
        const mainContent = document.querySelector(".main-content");

        if (!sidebar || !mainContent) return;

        // Only restore on desktop
        if (window.innerWidth > 1024) {
            // Get stored state, default to collapsed if not set
            const storedState = localStorage.getItem("sidebarCollapsed");
            const isCollapsed =
                storedState === null ? true : storedState === "true";

            // Set default state in localStorage if not exists
            if (storedState === null) {
                localStorage.setItem("sidebarCollapsed", "true");
            }

            if (isCollapsed) {
                sidebar.classList.add("collapsed");
                mainContent.classList.add("expanded");

                // Update icon
                const sidebarToggle = document.getElementById("sidebarToggle");
                const icon = sidebarToggle?.querySelector("i");
                if (icon) {
                    icon.setAttribute("data-lucide", "panel-left-open");
                    if (typeof lucide !== "undefined") {
                        lucide.createIcons();
                    }
                }

                console.log("[Navigation] Sidebar state restored: collapsed");
            }
        }
    }

    // =====================================================
    // SETTINGS FUNCTIONALITY
    // =====================================================

    loadSettings() {
        // Load font size from localStorage (12px - 20px)
        const savedFontSize = localStorage.getItem("appFontSize") || "14";
        this.applyFontSize(parseInt(savedFontSize));

        // Load theme from localStorage
        const savedTheme = localStorage.getItem("appTheme") || "light";
        this.applyTheme(savedTheme);

        console.log("[Navigation] Settings loaded");
    }

    applyFontSize(size) {
        // Ensure size is within limits (12-20px)
        const limitedSize = Math.max(12, Math.min(20, size));

        // Apply to root element
        document.documentElement.style.setProperty(
            "--base-font-size",
            `${limitedSize}px`,
        );

        // Apply to body
        document.body.style.fontSize = `${limitedSize}px`;

        console.log(`[Navigation] Font size applied: ${limitedSize}px`);
    }

    saveFontSize(size) {
        localStorage.setItem("appFontSize", size.toString());
        this.applyFontSize(size);
    }

    applyTheme(theme) {
        if (theme === "dark") {
            document.documentElement.classList.add("dark-mode");
        } else {
            document.documentElement.classList.remove("dark-mode");
        }

        console.log(`[Navigation] Theme applied: ${theme}`);
    }

    saveTheme(theme) {
        localStorage.setItem("appTheme", theme);
        this.applyTheme(theme);
    }

    showSettings() {
        const currentFontSize =
            parseInt(localStorage.getItem("appFontSize")) || 14;
        const currentTheme = localStorage.getItem("appTheme") || "light";

        // Create modal overlay
        const modal = document.createElement("div");
        modal.className = "settings-modal-overlay";
        modal.innerHTML = `
            <div class="settings-modal">
                <div class="settings-header">
                    <h2>
                        <i data-lucide="settings"></i>
                        Cài Đặt Hiển Thị
                    </h2>
                    <button class="settings-close" id="closeSettings">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                
                <div class="settings-content">
                    <!-- Theme Toggle -->
                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="sun"></i>
                            Chế Độ Hiển Thị
                        </label>
                        <div class="theme-toggle-container">
                            <button class="theme-option ${currentTheme === "light" ? "active" : ""}" data-theme="light">
                                <i data-lucide="sun"></i>
                                <span>Sáng</span>
                            </button>
                            <button class="theme-option ${currentTheme === "dark" ? "active" : ""}" data-theme="dark">
                                <i data-lucide="moon"></i>
                                <span>Tối</span>
                            </button>
                        </div>
                    </div>

                    <!-- Font Size Slider -->
                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="type"></i>
                            Kích Thước Chữ
                        </label>
                        <div class="font-size-slider-container">
                            <div class="slider-labels">
                                <span class="slider-label-min">12px</span>
                                <span class="slider-label-current" id="currentFontSize">${currentFontSize}px</span>
                                <span class="slider-label-max">20px</span>
                            </div>
                            <input 
                                type="range" 
                                id="fontSizeSlider" 
                                class="font-size-slider"
                                min="12" 
                                max="20" 
                                value="${currentFontSize}"
                                step="1"
                            >
                            <div class="slider-ticks">
                                <span>12</span>
                                <span>14</span>
                                <span>16</span>
                                <span>18</span>
                                <span>20</span>
                            </div>
                        </div>
                    </div>

                    <!-- Preview -->
                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="eye"></i>
                            Xem Trước
                        </label>
                        <div class="settings-preview">
                            <p>Đây là văn bản mẫu để xem trước kích thước chữ.</p>
                            <p>This is sample text to preview font size.</p>
                            <p style="font-weight: 600;">Chữ đậm / Bold text</p>
                            <div style="margin-top: 12px; padding: 12px; background: rgba(99, 102, 241, 0.1); border-radius: 8px;">
                                <span style="font-size: 12px;">Chữ nhỏ 12px</span> • 
                                <span style="font-size: 14px;">Bình thường 14px</span> • 
                                <span style="font-size: 16px;">Lớn 16px</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="settings-footer">
                    <button class="btn-reset" id="resetSettings">
                        <i data-lucide="rotate-ccw"></i>
                        Đặt Lại Mặc Định
                    </button>
                    <button class="btn-save" id="saveSettings">
                        <i data-lucide="check"></i>
                        Áp Dụng
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Initialize Lucide icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        // Add styles
        this.addSettingsStyles();

        // Event listeners
        const closeBtn = modal.querySelector("#closeSettings");
        const saveBtn = modal.querySelector("#saveSettings");
        const resetBtn = modal.querySelector("#resetSettings");
        const fontSlider = modal.querySelector("#fontSizeSlider");
        const currentSizeLabel = modal.querySelector("#currentFontSize");
        const themeButtons = modal.querySelectorAll(".theme-option");

        let selectedFontSize = currentFontSize;
        let selectedTheme = currentTheme;

        // Close modal
        const closeModal = () => {
            modal.remove();
        };

        closeBtn.addEventListener("click", closeModal);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });

        // Font size slider
        fontSlider.addEventListener("input", (e) => {
            selectedFontSize = parseInt(e.target.value);
            currentSizeLabel.textContent = `${selectedFontSize}px`;
            // Preview the change
            this.applyFontSize(selectedFontSize);
        });

        // Theme selection
        themeButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                themeButtons.forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                selectedTheme = btn.dataset.theme;
                // Preview the change
                this.applyTheme(selectedTheme);
            });
        });

        // Reset settings
        resetBtn.addEventListener("click", () => {
            selectedFontSize = 14;
            selectedTheme = "light";

            fontSlider.value = 14;
            currentSizeLabel.textContent = "14px";

            themeButtons.forEach((b) => b.classList.remove("active"));
            const lightBtn = modal.querySelector('[data-theme="light"]');
            if (lightBtn) lightBtn.classList.add("active");

            this.applyFontSize(14);
            this.applyTheme("light");
        });

        // Save settings
        saveBtn.addEventListener("click", () => {
            this.saveFontSize(selectedFontSize);
            this.saveTheme(selectedTheme);
            closeModal();

            // Show success message
            this.showToast("Đã lưu cài đặt thành công!", "success");
        });
    }

    addSettingsStyles() {
        if (document.getElementById("settingsStyles")) return;

        const style = document.createElement("style");
        style.id = "settingsStyles";
        style.textContent = `
            /* Dark Mode Variables */
            :root {
                --bg-primary: #ffffff;
                --bg-secondary: #f9fafb;
                --bg-tertiary: #f3f4f6;
                --text-primary: #111827;
                --text-secondary: #374151;
                --text-tertiary: #6b7280;
                --border-color: #e5e7eb;
                --accent-color: #6366f1;
            }

            .dark-mode {
                --bg-primary: #1f2937;
                --bg-secondary: #111827;
                --bg-tertiary: #374151;
                --text-primary: #f9fafb;
                --text-secondary: #e5e7eb;
                --text-tertiary: #9ca3af;
                --border-color: #374151;
                --accent-color: #818cf8;
            }

            /* Apply dark mode to body */
            .dark-mode body {
                background: var(--bg-secondary);
                color: var(--text-primary);
            }

            .settings-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                padding: 20px;
                backdrop-filter: blur(4px);
            }

            .settings-modal {
                background: var(--bg-primary);
                border-radius: 16px;
                max-width: 600px;
                width: 100%;
                max-height: 90vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
                animation: modalSlideIn 0.3s ease-out;
            }

            @keyframes modalSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .settings-header {
                padding: 24px;
                border-bottom: 1px solid var(--border-color);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .settings-header h2 {
                margin: 0;
                font-size: 20px;
                font-weight: 600;
                color: var(--text-primary);
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .settings-header h2 i {
                width: 24px;
                height: 24px;
                color: var(--accent-color);
            }

            .settings-close {
                width: 36px;
                height: 36px;
                border: none;
                background: var(--bg-tertiary);
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                color: var(--text-primary);
            }

            .settings-close:hover {
                background: var(--border-color);
                transform: rotate(90deg);
            }

            .settings-close i {
                width: 20px;
                height: 20px;
            }

            .settings-content {
                padding: 24px;
                overflow-y: auto;
                flex: 1;
            }

            .setting-group {
                margin-bottom: 28px;
            }

            .setting-group:last-child {
                margin-bottom: 0;
            }

            .setting-label {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                color: var(--text-secondary);
                margin-bottom: 12px;
                font-size: 14px;
            }

            .setting-label i {
                width: 18px;
                height: 18px;
                color: var(--accent-color);
            }

            /* Theme Toggle */
            .theme-toggle-container {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
            }

            .theme-option {
                padding: 16px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                font-weight: 500;
                color: var(--text-secondary);
            }

            .theme-option:hover {
                border-color: var(--accent-color);
                background: var(--bg-secondary);
            }

            .theme-option.active {
                border-color: var(--accent-color);
                background: var(--bg-secondary);
                color: var(--accent-color);
            }

            .theme-option i {
                width: 24px;
                height: 24px;
            }

            .theme-option span {
                font-size: 14px;
            }

            /* Font Size Slider */
            .font-size-slider-container {
                background: var(--bg-secondary);
                padding: 20px;
                border-radius: 12px;
                border: 1px solid var(--border-color);
            }

            .slider-labels {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
            }

            .slider-label-min,
            .slider-label-max {
                font-size: 12px;
                color: var(--text-tertiary);
                font-weight: 500;
            }

            .slider-label-current {
                font-size: 18px;
                font-weight: 700;
                color: var(--accent-color);
            }

            .font-size-slider {
                width: 100%;
                height: 6px;
                border-radius: 3px;
                background: var(--border-color);
                outline: none;
                -webkit-appearance: none;
                appearance: none;
                cursor: pointer;
            }

            .font-size-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: var(--accent-color);
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                transition: all 0.2s;
            }

            .font-size-slider::-webkit-slider-thumb:hover {
                transform: scale(1.2);
                box-shadow: 0 4px 8px rgba(99, 102, 241, 0.4);
            }

            .font-size-slider::-moz-range-thumb {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: var(--accent-color);
                cursor: pointer;
                border: none;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                transition: all 0.2s;
            }

            .font-size-slider::-moz-range-thumb:hover {
                transform: scale(1.2);
                box-shadow: 0 4px 8px rgba(99, 102, 241, 0.4);
            }

            .slider-ticks {
                display: flex;
                justify-content: space-between;
                margin-top: 8px;
                padding: 0 2px;
            }

            .slider-ticks span {
                font-size: 11px;
                color: var(--text-tertiary);
                font-weight: 500;
            }

            .settings-preview {
                padding: 20px;
                background: var(--bg-secondary);
                border-radius: 12px;
                border: 1px solid var(--border-color);
            }

            .settings-preview p {
                margin: 0 0 8px 0;
                color: var(--text-secondary);
                line-height: 1.6;
            }

            .settings-preview p:last-child {
                margin-bottom: 0;
            }

            .settings-footer {
                padding: 20px 24px;
                border-top: 1px solid var(--border-color);
                display: flex;
                gap: 12px;
                justify-content: flex-end;
                background: var(--bg-primary);
            }

            .settings-footer button {
                padding: 10px 20px;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                font-size: 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: all 0.2s;
            }

            .settings-footer button i {
                width: 18px;
                height: 18px;
            }

            .btn-reset {
                background: var(--bg-tertiary);
                color: var(--text-secondary);
            }

            .btn-reset:hover {
                background: var(--border-color);
            }

            .btn-save {
                background: var(--accent-color);
                color: white;
            }

            .btn-save:hover {
                background: #4f46e5;
                transform: translateY(-1px);
                box-shadow: 0 4px 6px rgba(99, 102, 241, 0.3);
            }

            /* Toast notification */
            .toast-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--bg-primary);
                padding: 16px 20px;
                border-radius: 12px;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                display: flex;
                align-items: center;
                gap: 12px;
                z-index: 10001;
                animation: toastSlideIn 0.3s ease-out;
                border: 1px solid var(--border-color);
            }

            @keyframes toastSlideIn {
                from {
                    opacity: 0;
                    transform: translateX(100px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }

            .toast-notification.success {
                border-left: 4px solid #10b981;
            }

            .toast-notification i {
                width: 20px;
                height: 20px;
                color: #10b981;
            }

            .toast-notification span {
                color: var(--text-secondary);
                font-weight: 500;
                font-size: 14px;
            }

            /* Apply font size to body */
            body {
                font-size: var(--base-font-size, 14px);
            }

            @media (max-width: 640px) {
                .theme-toggle-container {
                    grid-template-columns: 1fr;
                }

                .settings-footer {
                    flex-direction: column-reverse;
                }

                .settings-footer button {
                    width: 100%;
                    justify-content: center;
                }
            }
        `;
        document.head.appendChild(style);
    }

    showToast(message, type = "success") {
        const toast = document.createElement("div");
        toast.className = `toast-notification ${type}`;
        toast.innerHTML = `
            <i data-lucide="check-circle"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(toast);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        setTimeout(() => {
            toast.style.animation = "toastSlideIn 0.3s ease-out reverse";
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // =====================================================
    // ACCESS DENIED & PERMISSIONS
    // =====================================================

    showAccessDenied() {
        const pageInfo = MENU_CONFIG.find(
            (item) => item.pageIdentifier === this.currentPage,
        );
        const pageName = pageInfo ? pageInfo.text : this.currentPage;

        document.body.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; 
                        background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 20px;">
                <div style="background: white; padding: 40px; border-radius: 16px; max-width: 500px; 
                            text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
                    <i data-lucide="alert-circle" style="width: 64px; height: 64px; color: #ef4444; 
                                                         margin: 0 auto 20px; display: block;"></i>
                    <h1 style="color: #ef4444; margin-bottom: 16px; font-size: 24px; font-weight: 600;">
                        Truy Cập Bị Từ Chối
                    </h1>
                    <p style="color: #6b7280; margin-bottom: 24px; line-height: 1.6;">
                        Bạn không có quyền truy cập trang: <strong style="color: #111827;">${pageName}</strong>
                    </p>
                    <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                        <button onclick="window.location.href='../live/index.html'" 
                                style="padding: 12px 24px; background: #6366f1; color: white; border: none; 
                                       border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px;">
                            Về Trang Chủ
                        </button>
                        <button onclick="alert('Liên hệ Admin để được cấp quyền truy cập')" 
                                style="padding: 12px 24px; background: #e5e7eb; color: #111827; border: none; 
                                       border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px;">
                            Liên Hệ Admin
                        </button>
                    </div>
                </div>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    getAccessiblePages() {
        return MENU_CONFIG.filter((item) => {
            if (this.isAdmin) return true;
            if (item.adminOnly) return false;
            return this.userPermissions.includes(item.permissionRequired);
        });
    }

    showPermissionsSummary() {
        const accessiblePages = this.getAccessiblePages();
        const userInfo = authManager.getAuthState();

        const roleMap = {
            0: "Admin",
            1: "Manager",
            3: "Staff",
            777: "Guest",
        };
        const checkLogin = localStorage.getItem("checkLogin");
        const roleName = roleMap[checkLogin] || "Unknown";

        const summary = `
QUYỀN TRUY CẬP CỦA BẠN

Tài khoản: ${userInfo?.displayName || userInfo?.username || "Unknown"}
Vai trò: ${roleName}
Tổng quyền: ${accessiblePages.length}/${MENU_CONFIG.length} trang

CÁC TRANG ĐƯỢC PHÉP TRUY CẬP:
${accessiblePages.map((item) => `• ${item.text}`).join("\n")}

Liên hệ Administrator nếu cần thêm quyền truy cập.
        `.trim();

        alert(summary);
    }
}

// =====================================================
// INITIALIZATION
// =====================================================

// Wait for dependencies to load
function waitForDependencies(callback, maxRetries = 15, delay = 300) {
    let retries = 0;

    const check = () => {
        // Check if AuthManager is available
        if (typeof authManager !== "undefined" && authManager) {
            console.log("[Navigation] Dependencies ready!");
            callback();
        } else if (retries < maxRetries) {
            retries++;
            console.log(
                `[Navigation] Waiting for dependencies... (${retries}/${maxRetries})`,
            );
            setTimeout(check, delay);
        } else {
            console.error(
                "[Navigation] Dependencies failed to load, redirecting to login...",
            );
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }
    };

    check();
}

// Initialize when DOM is ready
let navigationManager;

document.addEventListener("DOMContentLoaded", () => {
    console.log("[Navigation] DOM loaded, waiting for dependencies...");

    waitForDependencies(() => {
        navigationManager = new ModernNavigationManager();
        window.navigationManager = navigationManager;
    });
});

// Export
window.ModernNavigationManager = ModernNavigationManager;

console.log("[Navigation] Script loaded successfully");
