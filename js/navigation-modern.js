/* =====================================================
   UNIFIED NAVIGATION MANAGER - PC + Mobile
   Auto-detect device and render appropriate UI
   ===================================================== */

// Menu Configuration with Permissions
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

class UnifiedNavigationManager {
    constructor() {
        this.currentPage = null;
        this.userPermissions = [];
        this.isAdmin = false;
        this.isMobile = window.innerWidth <= 768;
        this.init();
    }

    async init() {
        console.log("[Unified Nav] Starting initialization...");

        // Check authentication
        if (!authManager || !authManager.isAuthenticated()) {
            console.log("[Unified Nav] User not authenticated, redirecting...");
            window.location.href = "../index.html";
            return;
        }

        try {
            // Get user info
            const checkLogin = localStorage.getItem("checkLogin");
            this.isAdmin = checkLogin === "0" || checkLogin === 0;
            console.log("[Unified Nav] Is Admin:", this.isAdmin);

            // Load permissions
            await this.loadUserPermissions();
            console.log(
                "[Unified Nav] Permissions loaded:",
                this.userPermissions,
            );

            // Get current page
            this.currentPage = this.getCurrentPageIdentifier();
            console.log("[Unified Nav] Current page:", this.currentPage);

            // Check page access
            const hasAccess = this.checkPageAccess();
            console.log("[Unified Nav] Has access to page:", hasAccess);

            if (!hasAccess) {
                this.showAccessDenied();
                return;
            }

            // Detect device type
            this.detectDevice();

            // Build UI based on device
            this.renderNavigation();
            this.updateUserInfo();
            this.setupEventListeners();
            this.loadSettings();

            // Handle resize
            window.addEventListener("resize", () => this.handleResize());

            console.log("[Unified Nav] Initialization complete!");
        } catch (error) {
            console.error("[Unified Nav] Initialization error:", error);
        }
    }

    detectDevice() {
        this.isMobile = window.innerWidth <= 768;
        console.log(
            "[Unified Nav] Device type:",
            this.isMobile ? "Mobile" : "Desktop",
        );
    }

    handleResize() {
        const wasMobile = this.isMobile;
        this.detectDevice();

        // Rebuild UI if device type changed
        if (wasMobile !== this.isMobile) {
            console.log("[Unified Nav] Device type changed, rebuilding UI...");
            this.renderNavigation();
            this.setupEventListeners();
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        } else if (!this.isMobile) {
            // On desktop, handle sidebar state during resize
            this.restoreSidebarState();
        }
    }

    async loadUserPermissions() {
        // Admin gets all permissions
        if (this.isAdmin) {
            this.userPermissions = MENU_CONFIG.map(
                (item) => item.permissionRequired,
            ).filter(Boolean);
            console.log(
                "[Permission Load] Admin - all permissions granted:",
                this.userPermissions,
            );
            return;
        }

        // Try to load from localStorage cache
        try {
            const authData = localStorage.getItem("loginindex_auth");
            if (authData) {
                const userAuth = JSON.parse(authData);
                if (
                    userAuth.pagePermissions &&
                    Array.isArray(userAuth.pagePermissions) &&
                    userAuth.pagePermissions.length > 0
                ) {
                    this.userPermissions = userAuth.pagePermissions;
                    console.log(
                        "[Permission Load] Loaded cached permissions:",
                        this.userPermissions,
                    );
                    return;
                }
            }
        } catch (error) {
            console.error(
                "[Permission Load] Error loading cached permissions:",
                error,
            );
        }

        // Try to load from Firebase
        try {
            if (typeof firebase !== "undefined" && firebase.firestore) {
                const authData = JSON.parse(
                    localStorage.getItem("loginindex_auth"),
                );

                if (!authData || !authData.username) {
                    console.error("[Permission Load] No username in auth data");
                    this.userPermissions = [];
                    return;
                }

                const db = firebase.firestore();
                const userDoc = await db
                    .collection("users")
                    .doc(authData.username)
                    .get();

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    this.userPermissions = userData.pagePermissions || [];

                    // ✅ FIXED: Cache vào localStorage để lần sau dùng
                    authData.pagePermissions = this.userPermissions;
                    localStorage.setItem(
                        "loginindex_auth",
                        JSON.stringify(authData),
                    );

                    console.log(
                        "[Permission Load] Loaded from Firebase:",
                        this.userPermissions,
                    );
                    return;
                } else {
                    console.error(
                        "[Permission Load] User document not found in Firebase",
                    );
                }
            }
        } catch (error) {
            console.error(
                "[Permission Load] Error loading Firebase permissions:",
                error,
            );
        }

        // ✅ FIXED: Nếu không load được gì, set empty array
        this.userPermissions = [];
        console.log(
            "[Permission Load] No permissions loaded, defaulting to empty",
        );
    }

    getCurrentPageIdentifier() {
        const path = window.location.pathname;
        console.log("[Unified Nav] Current path:", path);

        // Normalize path - remove trailing slash and convert to lowercase
        const normalizedPath = path.toLowerCase().replace(/\/$/, "");

        // Sort menu by identifier length (longest first) to match most specific first
        // This prevents "live" from matching before "livestream" or "sanphamlive"
        const sortedMenu = [...MENU_CONFIG].sort(
            (a, b) => b.pageIdentifier.length - a.pageIdentifier.length,
        );

        for (const item of sortedMenu) {
            const identifier = item.pageIdentifier.toLowerCase();

            // Check for exact folder match with boundaries
            // Pattern 1: /identifier/ (with trailing content)
            // Pattern 2: /identifier/index.html
            // Pattern 3: /identifier (end of path)

            const patterns = [
                new RegExp(`/${identifier}/`, "i"), // /livestream/
                new RegExp(`/${identifier}/index\\.html$`, "i"), // /livestream/index.html
                new RegExp(`/${identifier}$`, "i"), // /livestream (exact end)
            ];

            // Test all patterns
            for (const pattern of patterns) {
                if (pattern.test(path)) {
                    console.log(
                        `[Unified Nav] Matched page: ${item.pageIdentifier} using pattern: ${pattern}`,
                    );
                    return item.pageIdentifier;
                }
            }
        }

        console.log("[Unified Nav] No page identifier matched");
        return null;
    }

    checkPageAccess() {
        // Nếu không xác định được trang hiện tại, cho phép truy cập
        if (!this.currentPage) {
            console.log("[Permission Check] No current page, allowing access");
            return true;
        }

        // Tìm thông tin trang trong MENU_CONFIG
        const pageInfo = MENU_CONFIG.find(
            (item) => item.pageIdentifier === this.currentPage,
        );

        // Nếu không tìm thấy config, cho phép truy cập (trang không yêu cầu quyền)
        if (!pageInfo) {
            console.log(
                "[Permission Check] Page not in MENU_CONFIG, allowing access",
            );
            return true;
        }

        // Nếu trang được đánh dấu là public, cho phép truy cập
        if (pageInfo.publicAccess) {
            console.log("[Permission Check] Public page, allowing access");
            return true;
        }

        // Admin có quyền truy cập mọi trang
        if (this.isAdmin) {
            console.log("[Permission Check] Admin user, allowing access");
            return true;
        }

        // ✅ FIXED: So sánh đúng với permissionRequired thay vì currentPage
        const hasPermission = this.userPermissions.includes(
            pageInfo.permissionRequired,
        );

        console.log("[Permission Check] Details:", {
            currentPage: this.currentPage,
            requiredPermission: pageInfo.permissionRequired,
            userPermissions: this.userPermissions,
            hasAccess: hasPermission,
        });

        return hasPermission;
    }

    // =====================================================
    // UNIFIED NAVIGATION RENDERING
    // =====================================================

    renderNavigation() {
        console.log("[Unified Nav] Rendering navigation...");

        if (this.isMobile) {
            this.renderMobileNavigation();
        } else {
            this.renderDesktopNavigation();
        }
    }

    // =====================================================
    // MOBILE NAVIGATION
    // =====================================================

    renderMobileNavigation() {
        console.log("[Unified Nav] Rendering mobile UI...");

        // Inject mobile styles FIRST
        this.injectMobileStyles();

        // Hide desktop sidebar if exists
        const sidebar = document.getElementById("sidebar");
        if (sidebar) {
            sidebar.style.display = "none";
            console.log("[Unified Nav] Desktop sidebar hidden");
        }

        // Remove any existing mobile elements first
        const existingTopBar = document.querySelector(".mobile-top-bar");
        const existingBottomNav = document.querySelector(".mobile-bottom-nav");
        if (existingTopBar) existingTopBar.remove();
        if (existingBottomNav) existingBottomNav.remove();

        // Create mobile top bar
        this.createMobileTopBar();

        // Create mobile bottom navigation
        this.createMobileBottomNav();

        // Adjust main content padding - IMPORTANT!
        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
            mainContent.style.paddingTop = "60px";
            mainContent.style.paddingBottom = "70px";
            mainContent.style.position = "relative";
            console.log("[Unified Nav] Main content padding adjusted");
        }

        // Force body to have mobile padding
        document.body.style.paddingTop = "60px";
        document.body.style.paddingBottom = "65px";

        // Verify mobile nav exists
        const bottomNavCheck = document.querySelector(".mobile-bottom-nav");
        if (bottomNavCheck) {
            console.log("[Unified Nav] ✅ Mobile bottom nav exists in DOM");
            console.log(
                "[Unified Nav] Bottom nav z-index:",
                window.getComputedStyle(bottomNavCheck).zIndex,
            );
            console.log(
                "[Unified Nav] Bottom nav display:",
                window.getComputedStyle(bottomNavCheck).display,
            );
        } else {
            console.error(
                "[Unified Nav] ❌ Mobile bottom nav NOT found in DOM!",
            );
        }
    }

    createMobileTopBar() {
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

        // Get accessible pages
        const accessiblePages = this.getAccessiblePages();

        // Log for debugging
        console.log(
            "[Mobile Nav] Total accessible pages:",
            accessiblePages.length,
        );
        console.log("[Mobile Nav] Current page identifier:", this.currentPage);

        // Take first 5 pages for bottom nav
        const bottomNavPages = accessiblePages.slice(0, 5);

        console.log(
            "[Mobile Nav] Bottom nav pages:",
            bottomNavPages.map((p) => p.pageIdentifier),
        );

        bottomNavPages.forEach((item) => {
            const navItem = document.createElement("a");
            navItem.href = item.href;
            navItem.className = "mobile-nav-item";

            // Check if this is the current page
            if (item.pageIdentifier === this.currentPage) {
                navItem.classList.add("active");
                console.log("[Mobile Nav] Active page:", item.pageIdentifier);
            }

            navItem.innerHTML = `
                <i data-lucide="${item.icon}"></i>
                <span>${item.shortText || item.text}</span>
            `;

            bottomNav.appendChild(navItem);
        });

        // Add "More" button if there are more than 5 pages
        if (accessiblePages.length > 5) {
            const moreBtn = document.createElement("button");
            moreBtn.className = "mobile-nav-item mobile-more-btn";
            moreBtn.innerHTML = `
                <i data-lucide="more-horizontal"></i>
                <span>Thêm</span>
            `;
            moreBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.showMobileMenu();
            });
            bottomNav.appendChild(moreBtn);
        }

        // Append to body
        document.body.appendChild(bottomNav);

        console.log(
            "[Mobile Nav] Bottom nav created with",
            bottomNav.children.length,
            "items",
        );

        // Initialize Lucide icons
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
                ${accessiblePages
                    .map(
                        (item) => `
                    <a href="${item.href}" class="mobile-menu-item ${item.pageIdentifier === this.currentPage ? "active" : ""}">
                        <i data-lucide="${item.icon}"></i>
                        <span>${item.text}</span>
                        ${item.pageIdentifier === this.currentPage ? '<i data-lucide="check" class="check-icon"></i>' : ""}
                    </a>
                `,
                    )
                    .join("")}
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
    // DESKTOP NAVIGATION
    // =====================================================

    renderDesktopNavigation() {
        console.log("[Unified Nav] Rendering desktop UI...");

        // Show desktop sidebar
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

        // Render sidebar navigation
        this.renderDesktopSidebar();

        // Initialize sidebar toggle
        this.initializeSidebarToggle();
    }

    renderDesktopSidebar() {
        console.log("[Unified Nav] Rendering desktop sidebar...");

        const sidebarNav = document.querySelector(".sidebar-nav");
        if (!sidebarNav) {
            console.error("[Unified Nav] Sidebar nav element not found!");
            return;
        }

        sidebarNav.innerHTML = "";

        let renderedCount = 0;

        MENU_CONFIG.forEach((menuItem) => {
            const hasPermission =
                this.isAdmin ||
                this.userPermissions.includes(menuItem.permissionRequired);

            if (!hasPermission) {
                console.log(
                    `[Unified Nav] Skipping: ${menuItem.text} (no permission)`,
                );
                return;
            }

            const navItem = document.createElement("a");
            navItem.href = menuItem.href;
            navItem.className = "nav-item";

            if (menuItem.pageIdentifier === this.currentPage) {
                navItem.classList.add("active");
            }

            navItem.innerHTML = `
                <i data-lucide="${menuItem.icon}"></i>
                <span>${menuItem.text}</span>
            `;

            sidebarNav.appendChild(navItem);
            renderedCount++;
        });

        console.log(
            `[Unified Nav] Rendered ${renderedCount} desktop menu items`,
        );

        this.addSettingsToNavigation(sidebarNav);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
            console.log("[Unified Nav] Lucide icons initialized");
        }
    }

    addSettingsToNavigation(sidebarNav) {
        const divider = document.createElement("div");
        divider.className = "nav-divider";
        divider.innerHTML =
            '<hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 16px 0;">';
        sidebarNav.appendChild(divider);

        const settingsBtn = document.createElement("button");
        settingsBtn.id = "btnSettings";
        settingsBtn.className = "nav-item nav-settings-btn";
        settingsBtn.innerHTML = `
            <i data-lucide="settings"></i>
            <span>Cài Đặt</span>
        `;
        sidebarNav.appendChild(settingsBtn);

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

        console.log("[Unified Nav] Settings button added");
    }

    // =====================================================
    // SIDEBAR TOGGLE (Desktop Only)
    // =====================================================

    initializeSidebarToggle() {
        const sidebar = document.getElementById("sidebar");
        const sidebarToggle = document.getElementById("sidebarToggle");

        if (!sidebar || !sidebarToggle) {
            console.warn("[Unified Nav] Sidebar toggle elements not found");
            return;
        }

        sidebarToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleSidebar();
        });

        this.createFixedToggleButton();
        this.restoreSidebarState();

        console.log("[Unified Nav] Sidebar toggle initialized");
    }

    toggleSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;

        if (sidebar.classList.contains("collapsed")) {
            this.showSidebar();
        } else {
            this.hideSidebar();
        }
    }

    hideSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;

        sidebar.classList.add("collapsed");
        localStorage.setItem("sidebarCollapsed", "true");

        const sidebarToggle = document.getElementById("sidebarToggle");
        const icon = sidebarToggle?.querySelector("i");
        if (icon) {
            icon.setAttribute("data-lucide", "panel-left-open");
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }

        console.log("[Unified Nav] Sidebar hidden");
    }

    showSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;

        sidebar.classList.remove("collapsed");
        localStorage.setItem("sidebarCollapsed", "false");

        const sidebarToggle = document.getElementById("sidebarToggle");
        const icon = sidebarToggle?.querySelector("i");
        if (icon) {
            icon.setAttribute("data-lucide", "panel-left-close");
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }

        console.log("[Unified Nav] Sidebar shown");
    }

    createFixedToggleButton() {
        const mainContent = document.querySelector(".main-content");
        if (!mainContent) return;

        if (document.querySelector(".sidebar-toggle-fixed")) return;

        const fixedBtn = document.createElement("button");
        fixedBtn.className = "sidebar-toggle-fixed";
        fixedBtn.innerHTML = '<i data-lucide="panel-left-open"></i>';
        fixedBtn.title = "Mở sidebar";

        fixedBtn.addEventListener("click", () => {
            this.showSidebar();
        });

        mainContent.appendChild(fixedBtn);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        console.log("[Unified Nav] Fixed toggle button created");
    }

    restoreSidebarState() {
        const sidebar = document.getElementById("sidebar");
        const mainContent = document.querySelector(".main-content");

        if (!sidebar || !mainContent) return;

        if (window.innerWidth > 768) {
            const storedState = localStorage.getItem("sidebarCollapsed");
            const isCollapsed =
                storedState === null ? true : storedState === "true";

            if (storedState === null) {
                localStorage.setItem("sidebarCollapsed", "true");
            }

            if (isCollapsed) {
                sidebar.classList.add("collapsed");
                mainContent.classList.add("expanded");

                const sidebarToggle = document.getElementById("sidebarToggle");
                const icon = sidebarToggle?.querySelector("i");
                if (icon) {
                    icon.setAttribute("data-lucide", "panel-left-open");
                    if (typeof lucide !== "undefined") {
                        lucide.createIcons();
                    }
                }

                console.log("[Unified Nav] Sidebar state restored: collapsed");
            }
        }
    }

    // =====================================================
    // SHARED FUNCTIONALITY
    // =====================================================

    updateUserInfo() {
        const userInfo = authManager.getAuthState();
        if (!userInfo) return;

        const userName = document.getElementById("userName");
        if (userName) {
            userName.textContent =
                userInfo.displayName || userInfo.username || "User";
        }

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

        console.log("[Unified Nav] User info updated");
    }

    setupEventListeners() {
        // Mobile menu button
        const mobileMenuBtn = document.getElementById("mobileMenuBtn");
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener("click", () =>
                this.showMobileMenu(),
            );
        }

        // Desktop menu toggle
        const menuToggle = document.getElementById("menuToggle");
        const sidebar = document.getElementById("sidebar");

        if (menuToggle && sidebar && !this.isMobile) {
            menuToggle.addEventListener("click", () => {
                sidebar.classList.toggle("active");
            });
        }

        // Close sidebar when clicking outside (mobile)
        document.addEventListener("click", (e) => {
            if (window.innerWidth <= 768 && sidebar) {
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

        // Settings button (desktop)
        const btnSettings = document.getElementById("btnSettings");
        if (btnSettings) {
            btnSettings.addEventListener("click", () => {
                this.showSettings();
            });
        }

        console.log("[Unified Nav] Event listeners setup complete");
    }

    getAccessiblePages() {
        const accessible = MENU_CONFIG.filter((item) => {
            // Admin có quyền truy cập tất cả
            if (this.isAdmin) return true;

            // Nếu là trang chỉ dành cho admin, user thường không được phép
            if (item.adminOnly) return false;

            // ✅ CORRECT: Kiểm tra permissionRequired
            return this.userPermissions.includes(item.permissionRequired);
        });

        console.log(
            "[Get Accessible] Found",
            accessible.length,
            "accessible pages",
        );
        return accessible;
    }

    // =====================================================
    // SETTINGS FUNCTIONALITY
    // =====================================================

    loadSettings() {
        const savedFontSize = localStorage.getItem("appFontSize") || "14";
        this.applyFontSize(parseInt(savedFontSize));

        const savedTheme = localStorage.getItem("appTheme") || "light";
        this.applyTheme(savedTheme);

        console.log("[Unified Nav] Settings loaded");
    }

    applyFontSize(size) {
        const limitedSize = Math.max(12, Math.min(20, size));
        document.documentElement.style.setProperty(
            "--base-font-size",
            `${limitedSize}px`,
        );
        document.body.style.fontSize = `${limitedSize}px`;
        console.log(`[Unified Nav] Font size applied: ${limitedSize}px`);
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
        console.log(`[Unified Nav] Theme applied: ${theme}`);
    }

    saveTheme(theme) {
        localStorage.setItem("appTheme", theme);
        this.applyTheme(theme);
    }

    showSettings() {
        const currentFontSize =
            parseInt(localStorage.getItem("appFontSize")) || 14;
        const currentTheme = localStorage.getItem("appTheme") || "light";

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

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        this.addSettingsStyles();

        const closeBtn = modal.querySelector("#closeSettings");
        const saveBtn = modal.querySelector("#saveSettings");
        const resetBtn = modal.querySelector("#resetSettings");
        const fontSlider = modal.querySelector("#fontSizeSlider");
        const currentSizeLabel = modal.querySelector("#currentFontSize");
        const themeButtons = modal.querySelectorAll(".theme-option");

        let selectedFontSize = currentFontSize;
        let selectedTheme = currentTheme;

        const closeModal = () => modal.remove();

        closeBtn.addEventListener("click", closeModal);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });

        fontSlider.addEventListener("input", (e) => {
            selectedFontSize = parseInt(e.target.value);
            currentSizeLabel.textContent = `${selectedFontSize}px`;
            this.applyFontSize(selectedFontSize);
        });

        themeButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                themeButtons.forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                selectedTheme = btn.dataset.theme;
                this.applyTheme(selectedTheme);
            });
        });

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

        saveBtn.addEventListener("click", () => {
            this.saveFontSize(selectedFontSize);
            this.saveTheme(selectedTheme);
            closeModal();
            this.showToast("Đã lưu cài đặt thành công!", "success");
        });
    }

    addSettingsStyles() {
        if (document.getElementById("settingsStyles")) return;

        const style = document.createElement("style");
        style.id = "settingsStyles";
        style.textContent = `
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
    // MOBILE STYLES
    // =====================================================

    injectMobileStyles() {
        if (document.getElementById("mobileNavStyles")) return;

        const style = document.createElement("style");
        style.id = "mobileNavStyles";
        style.textContent = `
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

            .mobile-bottom-nav {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                height: 65px;
                background: white;
                box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
                display: flex !important;
                align-items: center;
                justify-content: space-around;
                padding: 8px 4px;
                z-index: 1000;
                visibility: visible !important;
                opacity: 1 !important;
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
    // ACCESS DENIED & PERMISSIONS
    // =====================================================

    showAccessDenied() {
        const pageInfo = MENU_CONFIG.find(
            (item) => item.pageIdentifier === this.currentPage,
        );
        const pageName = pageInfo ? pageInfo.text : this.currentPage;
        const requiredPermission = pageInfo
            ? pageInfo.permissionRequired
            : "unknown";

        // ✅ Lấy trang đầu tiên user có quyền truy cập
        const accessiblePages = this.getAccessiblePages();
        const firstAccessiblePage =
            accessiblePages.length > 0 ? accessiblePages[0] : null;

        console.error("[Access Denied]", {
            page: this.currentPage,
            pageName: pageName,
            requiredPermission: requiredPermission,
            userPermissions: this.userPermissions,
            isAdmin: this.isAdmin,
            firstAccessiblePage: firstAccessiblePage
                ? firstAccessiblePage.pageIdentifier
                : "none",
        });

        // ✅ Nếu không có trang nào accessible, redirect về login
        if (!firstAccessiblePage) {
            console.error(
                "[Access Denied] No accessible pages found, redirecting to login",
            );
            window.location.href = "../index.html";
            return;
        }

        const redirectUrl = firstAccessiblePage.href;
        const redirectPageName = firstAccessiblePage.text;

        document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; 
                    background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 20px;">
            <div style="background: white; padding: ${this.isMobile ? "32px 20px" : "40px"}; border-radius: 16px; 
                        max-width: ${this.isMobile ? "400px" : "500px"}; text-align: center; 
                        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); width: 100%;">
                <i data-lucide="alert-circle" style="width: ${this.isMobile ? "56px" : "64px"}; 
                                                     height: ${this.isMobile ? "56px" : "64px"}; color: #ef4444; 
                                                     margin: 0 auto ${this.isMobile ? "16px" : "20px"}; display: block;"></i>
                <h1 style="color: #ef4444; margin-bottom: ${this.isMobile ? "12px" : "16px"}; 
                           font-size: ${this.isMobile ? "20px" : "24px"}; font-weight: 600;">
                    Truy Cập Bị Từ Chối
                </h1>
                <p style="color: #6b7280; margin-bottom: ${this.isMobile ? "12px" : "16px"}; 
                          line-height: ${this.isMobile ? "1.5" : "1.6"}; font-size: ${this.isMobile ? "14px" : "16px"};">
                    Bạn không có quyền truy cập: <strong style="color: #111827;">${pageName}</strong>
                </p>
                <p style="color: #9ca3af; margin-bottom: ${this.isMobile ? "20px" : "24px"}; font-size: 13px;">
                    Quyền yêu cầu: <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${requiredPermission}</code>
                </p>
                <button onclick="window.location.href='${redirectUrl}'" 
                        style="${this.isMobile ? "width: 100%" : ""}; padding: 12px 24px; background: #6366f1; 
                               color: white; border: none; border-radius: 8px; cursor: pointer; 
                               font-weight: 600; font-size: 14px; transition: all 0.2s;"
                        onmouseover="this.style.background='#4f46e5'"
                        onmouseout="this.style.background='#6366f1'">
                    Về ${redirectPageName}
                </button>
            </div>
        </div>
    `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    showPermissionsSummary() {
        const accessiblePages = this.getAccessiblePages();
        const userInfo = authManager.getAuthState();

        const roleMap = { 0: "Admin", 1: "Manager", 3: "Staff", 777: "Guest" };
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

function waitForDependencies(callback, maxRetries = 15, delay = 300) {
    let retries = 0;

    const check = () => {
        if (typeof authManager !== "undefined" && authManager) {
            console.log("[Unified Nav] Dependencies ready!");
            callback();
        } else if (retries < maxRetries) {
            retries++;
            console.log(`[Unified Nav] Waiting... (${retries}/${maxRetries})`);
            setTimeout(check, delay);
        } else {
            console.error("[Unified Nav] Dependencies failed, redirecting...");
            window.location.href = "../index.html";
        }
    };

    check();
}

let unifiedNavigationManager;

document.addEventListener("DOMContentLoaded", () => {
    console.log("[Unified Nav] DOM loaded...");
    waitForDependencies(() => {
        unifiedNavigationManager = new UnifiedNavigationManager();
        window.navigationManager = unifiedNavigationManager;
    });
});

window.UnifiedNavigationManager = UnifiedNavigationManager;
console.log("[Unified Nav] Script loaded successfully");
