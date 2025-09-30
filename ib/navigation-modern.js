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
        text: "Hàng Rơi - Xả",
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

        for (const item of MENU_CONFIG) {
            if (
                path.includes(`/${item.pageIdentifier}/`) ||
                path.includes(`${item.pageIdentifier}/index.html`)
            ) {
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

        // Initialize Lucide icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
            console.log("[Navigation] Lucide icons initialized");
        }
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

        // Desktop sidebar toggle (ẩn sidebar)
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

    // Tạo nút toggle cố định - GIỐNG FILE LIVE
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

        // Append vào main-content (không phải body)
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
        if (!sidebar) return;

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

                // Update icon in sidebar toggle
                const sidebarToggle = document.getElementById("sidebarToggle");
                const icon = sidebarToggle?.querySelector("i");
                if (icon) {
                    icon.setAttribute("data-lucide", "panel-left-open");
                    if (typeof lucide !== "undefined") {
                        lucide.createIcons();
                    }
                }

                console.log("[Navigation] Sidebar state restored: collapsed");
            } else {
                sidebar.classList.remove("collapsed");
                console.log("[Navigation] Sidebar state restored: expanded");
            }
        }
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
