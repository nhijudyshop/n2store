/* =====================================================
   MOBILE NAVIGATION MANAGER - Complete Version
   Optimized for mobile devices with bottom nav
   ===================================================== */

// Menu Configuration (same as desktop)
const MENU_CONFIG = [
    {
        href: "../live/index.html",
        icon: "image",
        text: "Hình Ảnh Live",
        shortText: "Live",
        pageIdentifier: "live",
        permissionRequired: "live",
    },
    {
        href: "../livestream/index.html",
        icon: "video",
        text: "Báo Cáo Livestream",
        shortText: "Báo Cáo",
        pageIdentifier: "livestream",
        permissionRequired: "livestream",
    },
    {
        href: "../sanphamlive/index.html",
        icon: "shopping-bag",
        text: "Sản Phẩm Livestream",
        shortText: "Sản Phẩm",
        pageIdentifier: "sanphamlive",
        permissionRequired: "sanphamlive",
    },
    {
        href: "../nhanhang/index.html",
        icon: "scale",
        text: "Cân Nặng Hàng",
        shortText: "Cân Hàng",
        pageIdentifier: "nhanhang",
        permissionRequired: "nhanhang",
    },
    {
        href: "../hangrotxa/index.html",
        icon: "clipboard-list",
        text: "Hàng Rơi - Xả",
        shortText: "Rơi/Xả",
        pageIdentifier: "hangrotxa",
        permissionRequired: "hangrotxa",
    },
    {
        href: "../ib/index.html",
        icon: "message-circle",
        text: "Check Inbox Khách",
        shortText: "Inbox",
        pageIdentifier: "ib",
        permissionRequired: "ib",
    },
    {
        href: "../ck/index.html",
        icon: "credit-card",
        text: "Thông Tin Chuyển Khoản",
        shortText: "CK",
        pageIdentifier: "ck",
        permissionRequired: "ck",
    },
    {
        href: "../hanghoan/index.html",
        icon: "corner-up-left",
        text: "Hàng Hoàn",
        shortText: "Hoàn",
        pageIdentifier: "hanghoan",
        permissionRequired: "hanghoan",
    },
    {
        href: "../hangdat/index.html",
        icon: "bookmark",
        text: "Hàng Đặt",
        shortText: "Đặt",
        pageIdentifier: "hangdat",
        permissionRequired: "hangdat",
    },
    {
        href: "../bangkiemhang/index.html",
        icon: "check-square",
        text: "Bảng Kiểm Hàng",
        shortText: "Kiểm",
        pageIdentifier: "bangkiemhang",
        permissionRequired: "bangkiemhang",
    },
    {
        href: "../user-management/index.html",
        icon: "users",
        text: "Quản Lý Tài Khoản",
        shortText: "Users",
        pageIdentifier: "user-management",
        adminOnly: true,
        permissionRequired: "user-management",
    },
    {
        href: "../history/index.html",
        icon: "bar-chart-2",
        text: "Lịch Sử Chỉnh Sửa",
        shortText: "Lịch Sử",
        pageIdentifier: "history",
        adminOnly: true,
        permissionRequired: "history",
    },
];

class MobileNavigationManager {
    constructor() {
        this.currentPage = null;
        this.userPermissions = [];
        this.isAdmin = false;
        this.isMobile = window.innerWidth <= 768;
        this.init();
    }

    async init() {
        console.log("[Mobile Nav] Starting initialization...");

        // Check authentication
        if (!authManager || !authManager.isAuthenticated()) {
            console.log("[Mobile Nav] User not authenticated, redirecting...");
            window.location.href = "../index.html";
            return;
        }

        try {
            // Get user info
            const checkLogin = localStorage.getItem("checkLogin");
            this.isAdmin = checkLogin === "0" || checkLogin === 0;

            // Load permissions
            await this.loadUserPermissions();

            // Get current page
            this.currentPage = this.getCurrentPageIdentifier();

            // Check page access
            const hasAccess = this.checkPageAccess();
            if (!hasAccess) {
                this.showAccessDenied();
                return;
            }

            // Detect device type
            this.detectDevice();

            // Build UI based on device
            if (this.isMobile) {
                this.renderMobileNavigation();
            } else {
                this.renderDesktopNavigation();
            }

            this.updateUserInfo();
            this.setupEventListeners();
            this.loadSettings();

            // Handle resize
            window.addEventListener("resize", () => this.handleResize());

            console.log("[Mobile Nav] Initialization complete!");
        } catch (error) {
            console.error("[Mobile Nav] Initialization error:", error);
        }
    }

    detectDevice() {
        this.isMobile = window.innerWidth <= 768;
        console.log("[Mobile Nav] Device type:", this.isMobile ? "Mobile" : "Desktop");
    }

    handleResize() {
        const wasMobile = this.isMobile;
        this.detectDevice();

        // Rebuild UI if device type changed
        if (wasMobile !== this.isMobile) {
            console.log("[Mobile Nav] Device type changed, rebuilding UI...");
            if (this.isMobile) {
                this.renderMobileNavigation();
            } else {
                this.renderDesktopNavigation();
            }
            this.setupEventListeners();
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }
    }

    async loadUserPermissions() {
        if (this.isAdmin) {
            this.userPermissions = MENU_CONFIG.map(
                (item) => item.permissionRequired
            ).filter(Boolean);
            return;
        }

        try {
            const authData = localStorage.getItem("loginindex_auth");
            if (authData) {
                const userAuth = JSON.parse(authData);
                if (userAuth.pagePermissions && Array.isArray(userAuth.pagePermissions)) {
                    this.userPermissions = userAuth.pagePermissions;
                    return;
                }
            }
        } catch (error) {
            console.error("[Mobile Nav] Error loading permissions:", error);
        }

        this.userPermissions = [];
    }

    getCurrentPageIdentifier() {
        const path = window.location.pathname;
        const sortedMenu = [...MENU_CONFIG].sort(
            (a, b) => b.pageIdentifier.length - a.pageIdentifier.length
        );

        for (const item of sortedMenu) {
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
            (item) => item.pageIdentifier === this.currentPage
        );
        if (!pageInfo) return true;
        if (pageInfo.publicAccess) return true;
        if (this.isAdmin) return true;
        return this.userPermissions.includes(this.currentPage);
    }

    // =====================================================
    // MOBILE NAVIGATION RENDERING
    // =====================================================

    renderMobileNavigation() {
        console.log("[Mobile Nav] Rendering mobile navigation...");

        // Inject mobile styles
        this.injectMobileStyles();

        // Hide desktop sidebar if exists
        const sidebar = document.getElementById("sidebar");
        if (sidebar) {
            sidebar.style.display = "none";
        }

        // Create mobile top bar
        this.createMobileTopBar();

        // Create mobile bottom navigation
        this.createMobileBottomNav();

        // Adjust main content padding
        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
            mainContent.style.paddingTop = "60px";
            mainContent.style.paddingBottom = "70px";
        }
    }

    createMobileTopBar() {
        // Remove existing top bar if any
        const existingBar = document.querySelector(".mobile-top-bar");
        if (existingBar) existingBar.remove();

        const topBar = document.createElement("div");
        topBar.className = "mobile-top-bar";

        const userInfo = authManager.getAuthState();
        const roleMap = { 0: "Admin", 1: "Manager", 3: "Staff", 777: "Guest" };
        const checkLogin = localStorage.getItem("checkLogin");
        const roleName = roleMap[checkLogin] || "User";

        topBar.innerHTML = `
            <div class="mobile-top-content">
                <div class="mobile-user-info">
                    <div class="mobile-user-avatar">
                        <i data-lucide="user"></i>
                    </div>
                    <div class="mobile-user-details">
                        <div class="mobile-user-name">${userInfo?.displayName || userInfo?.username || "User"}</div>
                        <div class="mobile-user-role">${roleName}</div>
                    </div>
                </div>
                <button class="mobile-menu-btn" id="mobileMenuBtn">
                    <i data-lucide="menu"></i>
                </button>
            </div>
        `;

        document.body.insertBefore(topBar, document.body.firstChild);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    createMobileBottomNav() {
        // Remove existing bottom nav if any
        const existingNav = document.querySelector(".mobile-bottom-nav");
        if (existingNav) existingNav.remove();

        const bottomNav = document.createElement("div");
        bottomNav.className = "mobile-bottom-nav";

        // Get accessible pages (max 5 for bottom nav)
        const accessiblePages = this.getAccessiblePages().slice(0, 5);

        accessiblePages.forEach((item) => {
            const navItem = document.createElement("a");
            navItem.href = item.href;
            navItem.className = "mobile-nav-item";

            if (item.pageIdentifier === this.currentPage) {
                navItem.classList.add("active");
            }

            navItem.innerHTML = `
                <i data-lucide="${item.icon}"></i>
                <span>${item.shortText || item.text}</span>
            `;

            bottomNav.appendChild(navItem);
        });

        // Add "More" button if there are more pages
        const totalPages = this.getAccessiblePages().length;
        if (totalPages > 5) {
            const moreBtn = document.createElement("button");
            moreBtn.className = "mobile-nav-item mobile-more-btn";
            moreBtn.innerHTML = `
                <i data-lucide="more-horizontal"></i>
                <span>Thêm</span>
            `;
            moreBtn.addEventListener("click", () => this.showMobileMenu());
            bottomNav.appendChild(moreBtn);
        }

        document.body.appendChild(bottomNav);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    showMobileMenu() {
        const overlay = document.createElement("div");
        overlay.className = "mobile-menu-overlay";

        const menu = document.createElement("div");
        menu.className = "mobile-menu-panel";

        const accessiblePages = this.getAccessiblePages();

        menu.innerHTML = `
            <div class="mobile-menu-header">
                <h3>Tất Cả Trang</h3>
                <button class="mobile-menu-close" id="closeMobileMenu">
                    <i data-lucide="x"></i>
                </button>
            </div>
            <div class="mobile-menu-content">
                ${accessiblePages.map((item) => `
                    <a href="${item.href}" class="mobile-menu-item ${item.pageIdentifier === this.currentPage ? "active" : ""}">
                        <i data-lucide="${item.icon}"></i>
                        <span>${item.text}</span>
                        ${item.pageIdentifier === this.currentPage ? '<i data-lucide="check" class="check-icon"></i>' : ""}
                    </a>
                `).join("")}
            </div>
            <div class="mobile-menu-footer">
                <button class="mobile-menu-action" id="mobileSettingsBtn">
                    <i data-lucide="settings"></i>
                    <span>Cài Đặt</span>
                </button>
                <button class="mobile-menu-action" id="mobileLogoutBtn">
                    <i data-lucide="log-out"></i>
                    <span>Đăng Xuất</span>
                </button>
            </div>
        `;

        overlay.appendChild(menu);
        document.body.appendChild(overlay);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        // Event listeners
        const closeBtn = menu.querySelector("#closeMobileMenu");
        closeBtn.addEventListener("click", () => overlay.remove());
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.remove();
        });

        const settingsBtn = menu.querySelector("#mobileSettingsBtn");
        settingsBtn.addEventListener("click", () => {
            overlay.remove();
            this.showSettings();
        });

        const logoutBtn = menu.querySelector("#mobileLogoutBtn");
        logoutBtn.addEventListener("click", () => {
            authManager.logout();
        });
    }

    // =====================================================
    // DESKTOP NAVIGATION (fallback)
    // =====================================================

    renderDesktopNavigation() {
        console.log("[Mobile Nav] Rendering desktop navigation...");
        
        const sidebar = document.getElementById("sidebar");
        if (sidebar) {
            sidebar.style.display = "";
        }

        // Remove mobile elements
        const topBar = document.querySelector(".mobile-top-bar");
        const bottomNav = document.querySelector(".mobile-bottom-nav");
        if (topBar) topBar.remove();
        if (bottomNav) bottomNav.remove();

        // Reset main content padding
        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
            mainContent.style.paddingTop = "";
            mainContent.style.paddingBottom = "";
        }
    }

    getAccessiblePages() {
        return MENU_CONFIG.filter((item) => {
            if (this.isAdmin) return true;
            if (item.adminOnly) return false;
            return this.userPermissions.includes(item.permissionRequired);
        });
    }

    // =====================================================
    // STYLES
    // =====================================================

    injectMobileStyles() {
        if (document.getElementById("mobileNavStyles")) return;

        const style = document.createElement("style");
        style.id = "mobileNavStyles";
        style.textContent = `
            /* Mobile Top Bar */
            .mobile-top-bar {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 60px;
                background: linear-gradient(135deg, #6366f1, #4f46e5);
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                z-index: 1000;
            }

            .mobile-top-content {
                display: flex;
                align-items: center;
                justify-content: space-between;
                height: 100%;
                padding: 0 16px;
            }

            .mobile-user-info {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .mobile-user-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.2);
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .mobile-user-avatar i {
                width: 20px;
                height: 20px;
                color: white;
            }

            .mobile-user-details {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .mobile-user-name {
                color: white;
                font-weight: 600;
                font-size: 14px;
            }

            .mobile-user-role {
                color: rgba(255, 255, 255, 0.8);
                font-size: 12px;
            }

            .mobile-menu-btn {
                width: 40px;
                height: 40px;
                border: none;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s;
            }

            .mobile-menu-btn:active {
                transform: scale(0.95);
                background: rgba(255, 255, 255, 0.3);
            }

            .mobile-menu-btn i {
                width: 24px;
                height: 24px;
                color: white;
            }

            /* Mobile Bottom Navigation */
            .mobile-bottom-nav {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                height: 65px;
                background: white;
                box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
                display: flex;
                align-items: center;
                justify-content: space-around;
                padding: 8px 4px;
                z-index: 1000;
            }

            .mobile-nav-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 4px;
                padding: 8px 12px;
                border-radius: 12px;
                text-decoration: none;
                color: #6b7280;
                transition: all 0.2s;
                flex: 1;
                max-width: 80px;
                background: none;
                border: none;
                cursor: pointer;
            }

            .mobile-nav-item i {
                width: 24px;
                height: 24px;
                transition: all 0.2s;
            }

            .mobile-nav-item span {
                font-size: 11px;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 100%;
            }

            .mobile-nav-item.active {
                color: #6366f1;
                background: rgba(99, 102, 241, 0.1);
            }

            .mobile-nav-item.active i {
                transform: scale(1.1);
            }

            .mobile-nav-item:active {
                transform: scale(0.95);
            }

            /* Mobile Menu Overlay */
            .mobile-menu-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 2000;
                display: flex;
                align-items: flex-end;
                animation: fadeIn 0.3s;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .mobile-menu-panel {
                width: 100%;
                max-height: 80vh;
                background: white;
                border-radius: 20px 20px 0 0;
                display: flex;
                flex-direction: column;
                animation: slideUp 0.3s;
            }

            @keyframes slideUp {
                from { transform: translateY(100%); }
                to { transform: translateY(0); }
            }

            .mobile-menu-header {
                padding: 20px;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .mobile-menu-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
                color: #111827;
            }

            .mobile-menu-close {
                width: 36px;
                height: 36px;
                border: none;
                background: #f3f4f6;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
            }

            .mobile-menu-close i {
                width: 20px;
                height: 20px;
                color: #6b7280;
            }

            .mobile-menu-content {
                flex: 1;
                overflow-y: auto;
                padding: 12px;
            }

            .mobile-menu-item {
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 16px;
                border-radius: 12px;
                text-decoration: none;
                color: #374151;
                margin-bottom: 4px;
                transition: all 0.2s;
                position: relative;
            }

            .mobile-menu-item:active {
                background: #f3f4f6;
                transform: scale(0.98);
            }

            .mobile-menu-item.active {
                background: rgba(99, 102, 241, 0.1);
                color: #6366f1;
                font-weight: 600;
            }

            .mobile-menu-item i {
                width: 24px;
                height: 24px;
                flex-shrink: 0;
            }

            .mobile-menu-item .check-icon {
                margin-left: auto;
                color: #10b981;
            }

            .mobile-menu-footer {
                padding: 16px;
                border-top: 1px solid #e5e7eb;
                display: flex;
                gap: 12px;
            }

            .mobile-menu-action {
                flex: 1;
                padding: 14px;
                border: none;
                border-radius: 12px;
                background: #f3f4f6;
                color: #374151;
                font-weight: 600;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .mobile-menu-action:active {
                transform: scale(0.95);
                background: #e5e7eb;
            }

            .mobile-menu-action i {
                width: 20px;
                height: 20px;
            }

            /* Adjust body for mobile */
            @media (max-width: 768px) {
                body {
                    padding-top: 60px;
                    padding-bottom: 65px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // =====================================================
    // SHARED FUNCTIONALITY
    // =====================================================

    updateUserInfo() {
        const userInfo = authManager.getAuthState();
        if (!userInfo) return;

        const userName = document.getElementById("userName");
        if (userName) {
            userName.textContent = userInfo.displayName || userInfo.username || "User";
        }

        const userRole = document.querySelector(".user-role");
        if (userRole) {
            const roleMap = { 0: "Admin", 1: "Manager", 3: "Staff", 777: "Guest" };
            const checkLogin = localStorage.getItem("checkLogin");
            userRole.textContent = roleMap[checkLogin] || "User";
        }
    }

    setupEventListeners() {
        const mobileMenuBtn = document.getElementById("mobileMenuBtn");
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener("click", () => this.showMobileMenu());
        }
    }

    loadSettings() {
        const savedFontSize = localStorage.getItem("appFontSize") || "14";
        this.applyFontSize(parseInt(savedFontSize));

        const savedTheme = localStorage.getItem("appTheme") || "light";
        this.applyTheme(savedTheme);
    }

    applyFontSize(size) {
        const limitedSize = Math.max(12, Math.min(20, size));
        document.documentElement.style.setProperty("--base-font-size", `${limitedSize}px`);
        document.body.style.fontSize = `${limitedSize}px`;
    }

    applyTheme(theme) {
        if (theme === "dark") {
            document.documentElement.classList.add("dark-mode");
        } else {
            document.documentElement.classList.remove("dark-mode");
        }
    }

    showSettings() {
        // Reuse settings from original code
        console.log("[Mobile Nav] Opening settings...");
        alert("Settings panel - integrate from original NavigationManager");
    }

    showAccessDenied() {
        const pageInfo = MENU_CONFIG.find(
            (item) => item.pageIdentifier === this.currentPage
        );
        const pageName = pageInfo ? pageInfo.text : this.currentPage;

        document.body.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; 
                        background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 20px;">
                <div style="background: white; padding: 32px 20px; border-radius: 16px; max-width: 400px; 
                            text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); width: 100%;">
                    <i data-lucide="alert-circle" style="width: 56px; height: 56px; color: #ef4444; 
                                                         margin: 0 auto 16px; display: block;"></i>
                    <h1 style="color: #ef4444; margin-bottom: 12px; font-size: 20px; font-weight: 600;">
                        Truy Cập Bị Từ Chối
                    </h1>
                    <p style="color: #6b7280; margin-bottom: 20px; line-height: 1.5; font-size: 14px;">
                        Bạn không có quyền truy cập: <strong>${pageName}</strong>
                    </p>
                    <button onclick="window.location.href='../live/index.html'" 
                            style="width: 100%; padding: 12px; background: #6366f1; color: white; border: none; 
                                   border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px;">
                        Về Trang Chủ
                    </button>
                </div>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

// =====================================================
// INITIALIZATION
// =====================================================

function waitForDependencies(callback, maxRetries = 15, delay = 300) {
    let retries = 0;

    const check = () => {
        if (typeof authManager !== "undefined" && authManager) {
            console.log("[Mobile Nav] Dependencies ready!");
            callback();
        } else if (retries < maxRetries) {
            retries++;
            console.log(`[Mobile Nav] Waiting... (${retries}/${maxRetries})`);
            setTimeout(check, delay);
        } else {
            console.error("[Mobile Nav] Dependencies failed, redirecting...");
            window.location.href = "../index.html";
        }
    };

    check();
}

let mobileNavigationManager;

document.addEventListener("DOMContentLoaded", () => {
    console.log("[Mobile Nav] DOM loaded...");
    waitForDependencies(() => {
        mobileNavigationManager = new MobileNavigationManager();
        window.mobileNavigationManager = mobileNavigationManager();
    });
});

window.MobileNavigationManager = MobileNavigationManager;
console.log("[Mobile Nav] Script loaded successfully");