/**
 * Navigation Manager với Page Permissions - Hover Effect Version
 * File: navigation.js
 * Dependencies: common-utils.js
 */

// Load common utilities script dynamically
(function () {
    const script = document.createElement("script");
    script.src = "../js/common-utils.js";
    script.async = false;
    document.head.appendChild(script);
})();

// Cấu hình menu items với permissions
const MENU_CONFIG = [
    {
        href: "../live/index.html",
        icon: "📸",
        text: "HÌNH ẢNH LIVE ĐẦY ĐỦ",
        pageIdentifier: "live",
        permissionRequired: "live",
    },
    {
        href: "../livestream/index.html",
        icon: "📺",
        text: "BÁO CÁO LIVESTREAM",
        pageIdentifier: "livestream",
        permissionRequired: "livestream",
    },
    {
        href: "../sanphamlive/index.html",
        icon: "🛍️",
        text: " SẢN PHẨM LIVESTREAM",
        pageIdentifier: "sanphamlive",
        permissionRequired: "sanphamlive",
    },
    {
        href: "../nhanhang/index.html",
        icon: "📦",
        text: "NHẬN HÀNG",
        pageIdentifier: "nhanhang",
        permissionRequired: "nhanhang",
    },
    {
        href: "../hangrotxa/index.html",
        icon: "📋",
        text: "HÀNG RỚT - XẢ",
        pageIdentifier: "hangrotxa",
        permissionRequired: "hangrotxa",
    },
    {
        href: "../ib/index.html",
        icon: "💬",
        text: "CHECK INBOX KHÁCH HÀNG",
        pageIdentifier: "ib",
        permissionRequired: "ib",
    },
    {
        href: "../ck/index.html",
        icon: "💳",
        text: "THÔNG TIN CHUYỂN KHOẢN",
        pageIdentifier: "ck",
        permissionRequired: "ck",
    },
    {
        href: "../hanghoan/index.html",
        icon: "↩️",
        text: "HÀNG HOÀN",
        pageIdentifier: "hanghoan",
        permissionRequired: "hanghoan",
    },
    {
        href: "../hangdat/index.html",
        icon: "📝",
        text: "HÀNG ĐẶT",
        pageIdentifier: "hangdat",
        permissionRequired: "hangdat",
    },
    {
        href: "../bangkiemhang/index.html",
        icon: "✅",
        text: "BẢNG KIỂM HÀNG",
        pageIdentifier: "bangkiemhang",
        permissionRequired: "bangkiemhang",
    },
    {
        href: "../user-management/index.html",
        icon: "👥",
        text: "QUẢN LÝ TÀI KHOẢN",
        pageIdentifier: "user-management",
        adminOnly: true,
        permissionRequired: "user-management",
    },
    {
        href: "../history/index.html",
        icon: "📊",
        text: "LỊCH SỬ CHỈNH SỬA",
        pageIdentifier: "history",
        adminOnly: true,
        permissionRequired: "history",
    },
];

/**
 * Kiểm tra quyền truy cập trang với retry mechanism
 */
function checkPagePermission(pageIdentifier) {
    // Tìm thông tin trang
    const pageInfo = MENU_CONFIG.find(
        (item) => item.pageIdentifier === pageIdentifier,
    );

    // Nếu trang có publicAccess = true, cho phép truy cập luôn
    if (pageInfo && pageInfo.publicAccess) {
        console.log(`Page ${pageIdentifier} has public access - allowing`);
        return true;
    }

    const checkLogin = localStorage.getItem("checkLogin");
    const authData = localStorage.getItem("loginindex_auth");

    // Admin luôn có toàn quyền
    if (checkLogin === "0" || checkLogin === 0) {
        return true;
    }

    // Kiểm tra auth data có tồn tại không
    if (!authData) {
        console.log("No auth data - denying access");
        return false;
    }

    // Kiểm tra permissions từ user data
    try {
        const userAuth = JSON.parse(authData);
        const userPermissions = userAuth.pagePermissions || [];

        const hasPermission = userPermissions.includes(pageIdentifier);
        console.log(
            `Permission check for ${pageIdentifier}:`,
            hasPermission,
            userPermissions,
        );

        return hasPermission;
    } catch (error) {
        console.warn("Error checking page permission:", error);
        return false;
    }
}

/**
 * Kiểm tra và chặn truy cập không được phép với delay để đợi data load
 */
async function enforcePagePermission() {
    const currentPage = getCurrentPageIdentifier();

    if (!currentPage) {
        console.log("No current page identifier found");
        return true; // Không xác định được trang hiện tại, cho phép truy cập
    }

    // THÊM DELAY ĐỂ ĐỢI DATA LOAD
    let attempts = 0;
    const maxAttempts = 5;
    const delay = 200; // 200ms mỗi lần

    while (attempts < maxAttempts) {
        const authData = localStorage.getItem("loginindex_auth");
        const checkLogin = localStorage.getItem("checkLogin");

        // Nếu đã có đủ data, tiếp tục kiểm tra
        if (authData && checkLogin) {
            break;
        }

        console.log(
            `Waiting for auth data, attempt ${attempts + 1}/${maxAttempts}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempts++;
    }

    const hasPermission = checkPagePermission(currentPage);

    console.log("Page permission check:", {
        currentPage,
        hasPermission,
        attempts,
    });

    if (!hasPermission) {
        // THÊM DELAY NGẮN ĐỂ ĐỢI LOAD PERMISSIONS TỪ FIREBASE
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Kiểm tra lại sau khi load permissions
        const userPermissions = await loadUserPermissions();
        const hasPermissionAfterLoad = userPermissions.includes(currentPage);

        console.log("After loading permissions:", {
            userPermissions,
            hasPermissionAfterLoad,
        });

        if (!hasPermissionAfterLoad) {
            showAccessDeniedPage(currentPage);
            return false;
        }
    }

    return true;
}

/**
 * Lấy thông tin user permissions từ localStorage hoặc Firebase
 */
async function loadUserPermissions() {
    const authData = localStorage.getItem("loginindex_auth");
    const checkLogin = localStorage.getItem("checkLogin");

    // Admin luôn có toàn quyền
    if (checkLogin === "0" || checkLogin === 0) {
        return MENU_CONFIG.map((item) => item.permissionRequired).filter(
            Boolean,
        );
    }

    if (!authData) {
        console.log("No auth data found");
        return [];
    }

    try {
        const userAuth = JSON.parse(authData);

        // KIỂM TRA PERMISSIONS TRONG LOCALSTORAGE TRƯỚC
        if (
            userAuth.pagePermissions &&
            Array.isArray(userAuth.pagePermissions)
        ) {
            console.log("Using cached permissions:", userAuth.pagePermissions);
            return userAuth.pagePermissions;
        }

        // Nếu chưa có permissions trong localStorage, load từ Firebase
        if (typeof firebase !== "undefined" && firebase.firestore) {
            console.log(
                "Loading permissions from Firebase for:",
                userAuth.username,
            );

            const db = firebase.firestore();
            const userDoc = await db
                .collection("users")
                .doc(userAuth.username)
                .get();

            if (userDoc.exists) {
                const userData = userDoc.data();
                const permissions = userData.pagePermissions || [];

                // CẬP NHẬT VÀO LOCALSTORAGE ĐỂ CACHE
                userAuth.pagePermissions = permissions;
                localStorage.setItem(
                    "loginindex_auth",
                    JSON.stringify(userAuth),
                );

                console.log("Permissions loaded from Firebase:", permissions);
                return permissions;
            } else {
                console.warn("User document not found in Firebase");
            }
        }

        console.log("No permissions found, returning empty array");
        return [];
    } catch (error) {
        console.error("Error loading user permissions:", error);
        return [];
    }
}

/**
 * Hiển thị trang từ chối truy cập
 */
function showAccessDeniedPage(pageIdentifier) {
    const pageInfo = MENU_CONFIG.find(
        (item) => item.pageIdentifier === pageIdentifier,
    );
    const pageName = pageInfo ? pageInfo.text : pageIdentifier;

    document.body.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            padding: 20px;
        ">
            <div style="
                background: white;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                text-align: center;
                max-width: 500px;
            ">
                <div style="font-size: 4rem; margin-bottom: 20px;">🚫</div>
                <h1 style="color: #e74c3c; margin-bottom: 20px;">Truy Cập Bị Từ Chối</h1>
                <p style="color: #666; font-size: 1.1rem; margin-bottom: 10px;">
                    Bạn không có quyền truy cập trang:
                </p>
                <p style="color: #333; font-weight: bold; font-size: 1.2rem; margin-bottom: 30px;">
                    ${pageInfo ? pageInfo.icon + " " + pageName : pageName}
                </p>
                <p style="color: #666; margin-bottom: 30px;">
                    Vui lòng liên hệ Administrator để được cấp quyền truy cập.
                </p>
                <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="goToAllowedPage()" style="
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border: none;
                        padding: 12px 25px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: bold;
                    ">
                        🏠 Về Trang Chính
                    </button>
                    <button onclick="showMyPermissions()" style="
                        background: #6c757d;
                        color: white;
                        border: none;
                        padding: 12px 25px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: bold;
                    ">
                        🔑 Xem Quyền Của Tôi
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Chuyển đến trang được phép truy cập
 */
async function goToAllowedPage() {
    const userPermissions = await loadUserPermissions();

    // Tìm trang đầu tiên user có quyền truy cập
    for (const item of MENU_CONFIG) {
        if (userPermissions.includes(item.permissionRequired)) {
            window.location.href = item.href;
            return;
        }
    }

    // Nếu không có quyền nào, về trang login
    window.location.href = "../live/index.html";
}

/**
 * Hiển thị quyền của user hiện tại
 */
async function showMyPermissions() {
    const userPermissions = await loadUserPermissions();
    const authData = JSON.parse(
        localStorage.getItem("loginindex_auth") || "{}",
    );
    const checkLogin = localStorage.getItem("checkLogin");

    const allowedPages = MENU_CONFIG.filter((item) =>
        userPermissions.includes(item.permissionRequired),
    ).map((item) => `${item.icon} ${item.text}`);

    const roleText =
        {
            0: "👑 Admin",
            1: "👤 User",
            2: "🔒 Limited",
            3: "💡 Basic",
            777: "👥 Guest",
        }[checkLogin] || "⚠️ Unknown";

    alert(`🔑 QUYỀN TRUY CẬP CỦA BẠN

👤 Tài khoản: ${authData.displayName || authData.username || "Unknown"}
🎭 Vai trò: ${roleText}
📊 Tổng quyền: ${allowedPages.length}/${MENU_CONFIG.length} trang

📋 CÁC TRANG ĐƯỢC PHÉP TRUY CẬP:
${allowedPages.length > 0 ? allowedPages.join("\n") : "❌ Không có quyền truy cập trang nào"}

💡 Liên hệ Administrator nếu cần thêm quyền truy cập.`);
}

/**
 * Global Font Manager tích hợp với Navigation
 */
class IntegratedFontManager {
    constructor() {
        this.currentScale =
            parseFloat(localStorage.getItem("globalFontScale")) || 1;
        this.minScale = 0.7;
        this.maxScale = 2.0;
        this.step = 0.1;

        this.initializeOnLoad();
    }

    initializeOnLoad() {
        this.applyFontSize();

        window.addEventListener("storage", (e) => {
            if (e.key === "globalFontScale") {
                this.currentScale = parseFloat(e.newValue) || 1;
                this.applyFontSize();
                this.updateDisplay();
                this.updatePresetButtons();
            }
        });

        console.log(
            "Integrated Font Manager initialized with scale:",
            this.currentScale,
        );
    }

    setupEventListeners() {
        const decreaseBtn = document.getElementById("sidebarDecreaseFont");
        const increaseBtn = document.getElementById("sidebarIncreaseFont");
        const presetBtns = document.querySelectorAll(".sidebar-preset-btn");

        if (decreaseBtn) {
            decreaseBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.changeFontSize(-this.step);
            });
        }

        if (increaseBtn) {
            increaseBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.changeFontSize(this.step);
            });
        }

        presetBtns.forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const scale = parseFloat(btn.dataset.scale);
                this.setFontSize(scale);
                this.updatePresetButtons(scale);
            });
        });

        document.addEventListener("keydown", (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === "=" || e.key === "+") {
                    e.preventDefault();
                    this.changeFontSize(this.step);
                } else if (e.key === "-") {
                    e.preventDefault();
                    this.changeFontSize(-this.step);
                } else if (e.key === "0") {
                    e.preventDefault();
                    this.setFontSize(1);
                    this.updatePresetButtons(1);
                }
            }
        });
    }

    changeFontSize(delta) {
        const newScale = Math.round((this.currentScale + delta) * 10) / 10;
        this.setFontSize(
            Math.max(this.minScale, Math.min(this.maxScale, newScale)),
        );
        this.updatePresetButtons();
    }

    setFontSize(scale) {
        this.currentScale = scale;
        this.applyFontSize();
        this.updateDisplay();
        this.saveFontSize();
        this.broadcastFontChange();
    }

    applyFontSize() {
        document.documentElement.style.setProperty(
            "--font-scale",
            this.currentScale,
        );
        document.documentElement.style.setProperty(
            "--global-font-scale",
            this.currentScale,
        );

        let globalStyle = document.getElementById("globalFontStyle");
        if (!globalStyle) {
            globalStyle = document.createElement("style");
            globalStyle.id = "globalFontStyle";
            document.head.appendChild(globalStyle);
        }

        globalStyle.textContent = `
            :root {
                --global-font-scale: ${this.currentScale};
                --font-scale: ${this.currentScale};
            }
            
            body {
                font-size: calc(14px * var(--font-scale)) !important;
            }
            
            .main-content {
                font-size: calc(14px * var(--font-scale)) !important;
            }
            
            .ck table, table {
                font-size: calc(14px * var(--font-scale)) !important;
            }
            
            .ck th, .ck td, th, td {
                font-size: calc(12px * var(--font-scale)) !important;
                padding: calc(10px * var(--font-scale)) calc(6px * var(--font-scale)) !important;
            }
            
            input, select, textarea, button {
                font-size: calc(14px * var(--font-scale)) !important;
            }
            
            .page-title, h1, .header h1, .header h2 {
                font-size: calc(2.5rem * var(--font-scale)) !important;
            }
            
            .form-group label, label {
                font-size: calc(14px * var(--font-scale)) !important;
            }
            
            .nav-item a {
                font-size: calc(14px * var(--font-scale)) !important;
                padding: calc(18px * var(--font-scale)) calc(25px * var(--font-scale)) !important;
            }
            
            .modal-content {
                font-size: calc(14px * var(--font-scale)) !important;
            }
            
            .filter-system {
                font-size: calc(14px * var(--font-scale)) !important;
            }
            
            @media (max-width: 768px) {
                .page-title, .header h1, .header h2 {
                    font-size: calc(1.8rem * var(--font-scale)) !important;
                }
                
                .ck th, .ck td, th, td {
                    font-size: calc(10px * var(--font-scale)) !important;
                    padding: calc(6px * var(--font-scale)) calc(3px * var(--font-scale)) !important;
                }
            }
        `;
    }

    updateDisplay() {
        const display = document.getElementById("sidebarFontSizeDisplay");
        const decreaseBtn = document.getElementById("sidebarDecreaseFont");
        const increaseBtn = document.getElementById("sidebarIncreaseFont");

        const percentage = `${Math.round(this.currentScale * 100)}%`;

        if (display) {
            display.textContent = percentage;
        }

        if (decreaseBtn) {
            decreaseBtn.disabled = this.currentScale <= this.minScale;
        }

        if (increaseBtn) {
            increaseBtn.disabled = this.currentScale >= this.maxScale;
        }
    }

    updatePresetButtons(activeScale = null) {
        const currentScale = activeScale || this.currentScale;
        const presetBtns = document.querySelectorAll(".sidebar-preset-btn");

        presetBtns.forEach((btn) => {
            const btnScale = parseFloat(btn.dataset.scale);
            if (Math.abs(btnScale - currentScale) < 0.05) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
    }

    saveFontSize() {
        try {
            localStorage.setItem(
                "globalFontScale",
                this.currentScale.toString(),
            );
        } catch (error) {
            console.error("Error saving global font size:", error);
        }
    }

    broadcastFontChange() {
        const event = new CustomEvent("globalFontChanged", {
            detail: { scale: this.currentScale },
        });
        window.dispatchEvent(event);
    }
}

/**
 * Inject CSS styles cho sidebar với hover effect
 */
function injectSidebarStyles() {
    if (document.getElementById("integratedSidebarStyles")) return;

    const styles = document.createElement("style");
    styles.id = "integratedSidebarStyles";
    styles.textContent = `
        :root {
            --font-scale: 1;
            --global-font-scale: 1;
            --sidebar-hover-delay: 0.3s;
        }

        .menu-toggle {
            position: fixed;
            top: calc(20px * var(--font-scale));
            left: calc(20px * var(--font-scale));
            width: calc(50px * var(--font-scale));
            height: calc(50px * var(--font-scale));
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            border-radius: 12px;
            cursor: pointer;
            z-index: 1001;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
            transition: all 0.3s ease;
        }

        .menu-toggle:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
        }

        /* HAMBURGER ICON - Always visible for hover indicator */
        .hamburger {
            position: relative;
            width: calc(24px * var(--font-scale));
            height: calc(2px * var(--font-scale));
            background: white;
            margin: 0 auto;
            transition: all 0.3s ease;
        }

        .hamburger::before,
        .hamburger::after {
            content: "";
            position: absolute;
            width: calc(24px * var(--font-scale));
            height: calc(2px * var(--font-scale));
            background: white;
            transition: all 0.3s ease;
        }

        .hamburger::before {
            top: calc(-8px * var(--font-scale));
        }

        .hamburger::after {
            bottom: calc(-8px * var(--font-scale));
        }

        /* Hover zone để trigger sidebar */
        .sidebar-hover-zone {
            position: fixed;
            left: 0;
            top: 0;
            width: calc(60px * var(--font-scale));
            height: 100vh;
            z-index: 998;
            pointer-events: all;
        }

        .overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            z-index: 999;
            pointer-events: none;
        }

        .overlay.active {
            opacity: 1;
            visibility: visible;
            pointer-events: all;
        }

        /* SIDEBAR WITH HOVER EFFECT */
        .sidebar {
            position: fixed;
            left: calc(-350px * var(--font-scale));
            top: 0;
            width: calc(350px * var(--font-scale));
            height: 100vh;
            background: linear-gradient(180deg, #2c3e50 0%, #34495e 100%);
            box-shadow: 2px 0 15px rgba(0, 0, 0, 0.2);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 1000;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            pointer-events: all;
        }

        /* HOVER EFFECT - Show sidebar when hovering the left area */
        .sidebar-hover-zone:hover + .overlay + .sidebar,
        .sidebar:hover {
            left: 0;
        }

        .sidebar-hover-zone:hover + .overlay,
        .sidebar:hover ~ .overlay {
            opacity: 1;
            visibility: visible;
            pointer-events: all;
        }

        /* Alternative: Show on menu button hover */
        .menu-toggle:hover ~ .sidebar {
            left: 0;
        }

        .menu-toggle:hover ~ .overlay {
            opacity: 1;
            visibility: visible;
            pointer-events: all;
        }

        .sidebar-header {
            padding: calc(30px * var(--font-scale)) calc(20px * var(--font-scale));
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
            position: relative;
            flex-shrink: 0;
        }

        .sidebar-header h3 {
            margin: 0;
            font-size: calc(1.2rem * var(--font-scale));
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .nav-list {
            list-style: none;
            padding: 0;
            margin: 0;
            flex: 1;
        }

        .nav-item {
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .nav-item:last-child {
            border-bottom: none;
        }

        .nav-item a,
        .nav-item-settings {
            display: flex;
            align-items: center;
            padding: calc(18px * var(--font-scale)) calc(25px * var(--font-scale));
            text-decoration: none;
            color: #ecf0f1;
            font-weight: 500;
            font-size: calc(14px * var(--font-scale));
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            cursor: pointer;
        }

        .nav-item a .icon,
        .nav-item-settings .icon {
            margin-right: calc(15px * var(--font-scale));
            font-size: calc(18px * var(--font-scale));
            width: calc(24px * var(--font-scale));
            text-align: center;
            transition: transform 0.3s ease;
        }

        .nav-item a:hover .icon,
        .nav-item-settings:hover .icon {
            transform: scale(1.2);
        }

        .nav-item a::before,
        .nav-item-settings::before {
            content: "";
            position: absolute;
            left: 0;
            top: 0;
            width: calc(4px * var(--font-scale));
            height: 100%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            transform: scaleY(0);
            transition: transform 0.3s ease;
        }

        .nav-item a:hover::before,
        .nav-item-settings:hover::before {
            transform: scaleY(1);
        }

        .nav-item a:hover,
        .nav-item-settings:hover {
            background: rgba(255, 255, 255, 0.08);
            padding-left: calc(35px * var(--font-scale));
        }

        .nav-item.disabled a {
            opacity: 0.5;
            cursor: not-allowed;
            position: relative;
        }

        .nav-item.disabled a::after {
            content: "🚫";
            position: absolute;
            right: calc(20px * var(--font-scale));
            font-size: calc(12px * var(--font-scale));
        }

        .nav-item.disabled a:hover {
            background: rgba(220, 53, 69, 0.1);
            padding-left: calc(25px * var(--font-scale));
        }

        #current-page-link {
            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%) !important;
            font-weight: 600;
        }

        #current-page-link::before {
            transform: scaleY(1) !important;
            background: #fff !important;
        }

        /* Settings dropdown styles - với hover effect */
        .settings-item {
            position: relative;
        }

        .settings-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: #2c3e50;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
            z-index: 10;
        }

        /* HOVER EFFECT FOR SETTINGS */
        .settings-item:hover .settings-dropdown {
            max-height: 500px;
        }

        .settings-dropdown-item {
            padding: calc(15px * var(--font-scale)) calc(35px * var(--font-scale));
            color: #bdc3c7;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            font-size: calc(13px * var(--font-scale));
        }

        .settings-dropdown-item:last-child {
            border-bottom: none;
        }

        .settings-dropdown-item h4 {
            margin: 0 0 calc(10px * var(--font-scale)) 0;
            color: #ecf0f1;
            font-size: calc(14px * var(--font-scale));
            font-weight: 600;
        }

        .font-size-controls {
            display: flex;
            align-items: center;
            gap: calc(12px * var(--font-scale));
            justify-content: space-between;
            background: rgba(255, 255, 255, 0.1);
            padding: calc(12px * var(--font-scale));
            border-radius: calc(8px * var(--font-scale));
            margin: calc(10px * var(--font-scale)) 0;
        }

        .font-size-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            width: calc(32px * var(--font-scale));
            height: calc(32px * var(--font-scale));
            border-radius: calc(6px * var(--font-scale));
            cursor: pointer;
            font-weight: bold;
            font-size: calc(14px * var(--font-scale));
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .font-size-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }

        .font-size-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .font-size-display {
            background: rgba(255, 255, 255, 0.2);
            color: #ecf0f1;
            padding: calc(8px * var(--font-scale)) calc(12px * var(--font-scale));
            border-radius: calc(6px * var(--font-scale));
            font-weight: 700;
            font-size: calc(12px * var(--font-scale));
            min-width: calc(50px * var(--font-scale));
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .preset-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: calc(8px * var(--font-scale));
            margin-top: calc(10px * var(--font-scale));
        }

        .sidebar-preset-btn {
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid rgba(255, 255, 255, 0.2);
            color: #ecf0f1;
            padding: calc(8px * var(--font-scale)) calc(10px * var(--font-scale));
            border-radius: calc(6px * var(--font-scale));
            cursor: pointer;
            font-size: calc(11px * var(--font-scale));
            text-align: center;
            transition: all 0.2s ease;
            font-weight: 600;
        }

        .sidebar-preset-btn:hover {
            background: rgba(255, 255, 255, 0.2);
            border-color: rgba(102, 126, 234, 0.6);
            transform: translateY(-1px);
        }

        .sidebar-preset-btn.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-color: #667eea;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }

        .setting-section {
            margin: calc(10px * var(--font-scale)) 0;
        }

        .setting-label {
            display: block;
            margin-bottom: calc(5px * var(--font-scale));
            color: #95a5a6;
            font-size: calc(12px * var(--font-scale));
        }

        .setting-toggle {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: calc(8px * var(--font-scale)) calc(12px * var(--font-scale));
            background: rgba(255, 255, 255, 0.1);
            border-radius: calc(6px * var(--font-scale));
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .setting-toggle:hover {
            background: rgba(255, 255, 255, 0.15);
        }

        .toggle-switch {
            width: calc(40px * var(--font-scale));
            height: calc(20px * var(--font-scale));
            background: rgba(255, 255, 255, 0.2);
            border-radius: calc(10px * var(--font-scale));
            position: relative;
            transition: all 0.3s ease;
        }

        .toggle-switch.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .toggle-switch::before {
            content: "";
            position: absolute;
            width: calc(16px * var(--font-scale));
            height: calc(16px * var(--font-scale));
            background: white;
            border-radius: 50%;
            top: calc(2px * var(--font-scale));
            left: calc(2px * var(--font-scale));
            transition: all 0.3s ease;
        }

        .toggle-switch.active::before {
            left: calc(22px * var(--font-scale));
        }

        /* Hover indicator for menu button */
        .menu-toggle::after {
            content: "◀";
            position: absolute;
            right: calc(-15px * var(--font-scale));
            top: 50%;
            transform: translateY(-50%);
            color: white;
            font-size: calc(12px * var(--font-scale));
            opacity: 0;
            transition: all 0.3s ease;
            pointer-events: none;
        }

        .menu-toggle:hover::after {
            opacity: 0.7;
            right: calc(-20px * var(--font-scale));
        }

        @media (max-width: 768px) {
            .sidebar {
                width: calc(320px * var(--font-scale));
                left: calc(-320px * var(--font-scale));
            }

            .menu-toggle {
                top: calc(15px * var(--font-scale));
                left: calc(15px * var(--font-scale));
                width: calc(45px * var(--font-scale));
                height: calc(45px * var(--font-scale));
            }

            .sidebar-hover-zone {
                width: calc(50px * var(--font-scale));
            }

            /* Mobile: Touch instead of hover */
            .sidebar-hover-zone:hover + .overlay + .sidebar,
            .sidebar:hover,
            .menu-toggle:hover ~ .sidebar {
                left: 0;
            }

            /* Touch devices: tap to show sidebar */
            @media (hover: none) and (pointer: coarse) {
                .sidebar-hover-zone:active + .overlay + .sidebar,
                .menu-toggle:active ~ .sidebar {
                    left: 0;
                }

                .sidebar-hover-zone:active + .overlay,
                .menu-toggle:active ~ .overlay {
                    opacity: 1;
                    visibility: visible;
                    pointer-events: all;
                }
            }

            .font-size-controls {
                gap: calc(8px * var(--font-scale));
                padding: calc(8px * var(--font-scale));
            }

            .font-size-btn {
                width: calc(28px * var(--font-scale));
                height: calc(28px * var(--font-scale));
            }

            .settings-dropdown-item {
                padding: calc(12px * var(--font-scale)) calc(25px * var(--font-scale));
            }
        }

        /* Desktop: Better hover experience */
        @media (min-width: 769px) {
            .menu-toggle:hover {
                animation: menuPulse 1.5s infinite;
            }

            .sidebar {
                transition-delay: 0.1s;
            }

            .sidebar-hover-zone:hover + .overlay + .sidebar {
                transition-delay: 0s;
            }
        }

        @keyframes menuPulse {
            0%, 100% { 
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
            }
            50% { 
                box-shadow: 0 4px 20px rgba(102, 126, 234, 0.5);
            }
        }
    `;
    document.head.appendChild(styles);
    console.log("Sidebar styles injected with hover effects");
}

/**
 * Tạo sidebar với menu có permission checking và hover effect
 */
function createIntegratedSidebar() {
    const existingSidebar = document.getElementById("sidebar");
    if (existingSidebar) {
        existingSidebar.remove();
    }

    const existingOverlay = document.getElementById("overlay");
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const existingToggle = document.querySelector(".menu-toggle");
    if (existingToggle) {
        existingToggle.remove();
    }

    const existingHoverZone = document.querySelector(".sidebar-hover-zone");
    if (existingHoverZone) {
        existingHoverZone.remove();
    }

    injectSidebarStyles();

    const sidebarHTML = `
        <button class="menu-toggle" title="Hover để mở menu">
            <div class="hamburger"></div>
        </button>

        <div class="sidebar-hover-zone"></div>
        <div class="overlay" id="overlay"></div>

        <div class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <h3>
                    <img src="../logo.jpg" alt="Logo" style="height:40px; vertical-align:middle; margin-right:10px;">
                    N2 SHOP
                </h3>
            </div>
            
            <nav class="nav-list">
                <!-- Menu items sẽ được tạo tự động với permission checking -->
            </nav>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", sidebarHTML);
    console.log(
        "Sidebar HTML created with hover effects and permissions checking",
    );
}

/**
 * Tạo menu navigation với permission checking (không cần toggle functions nữa)
 */
async function createNavigationMenu() {
    const checkLogin = localStorage.getItem("checkLogin");
    const navList = document.querySelector(".nav-list");

    if (!navList) {
        console.warn("Navigation list not found");
        return;
    }

    // Load user permissions
    const userPermissions = await loadUserPermissions();
    console.log("User permissions loaded:", userPermissions);

    // Filter menu items based on permissions
    const visibleMenuItems = MENU_CONFIG.filter((item) => {
        // Admin check for admin-only items
        if (item.adminOnly && checkLogin !== "0" && checkLogin !== 0) {
            return false;
        }

        // Permission check for all users (except admin)
        if (checkLogin !== "0" && checkLogin !== 0) {
            return userPermissions.includes(item.permissionRequired);
        }

        return true; // Admin sees all
    });

    const currentPage = getCurrentPageIdentifier();
    navList.innerHTML = "";

    // Tạo menu items với permission status
    MENU_CONFIG.forEach((item) => {
        const li = document.createElement("li");
        li.className = "nav-item";

        const isCurrentPage = currentPage === item.pageIdentifier;
        const hasPermission =
            checkLogin === "0" ||
            checkLogin === 0 ||
            userPermissions.includes(item.permissionRequired);
        const linkId = isCurrentPage ? 'id="current-page-link"' : "";

        // Add disabled class if no permission
        if (!hasPermission) {
            li.style.display = "none";
        }

        // Create link or disabled span
        if (hasPermission) {
            li.innerHTML = `
                <a href="${item.href}" ${linkId}>
                    <i class="icon">${item.icon}</i>
                    <span>${item.text}</span>
                </a>
            `;
        } else {
            li.innerHTML = `
                <a href="#" onclick="showPermissionDenied('${item.pageIdentifier}'); return false;" ${linkId}>
                    <i class="icon">${item.icon}</i>
                    <span>${item.text}</span>
                </a>
            `;
        }

        navList.appendChild(li);
    });

    // Thêm Settings menu item với hover dropdown
    const settingsLi = document.createElement("li");
    settingsLi.className = "nav-item settings-item";
    settingsLi.innerHTML = `
        <div class="nav-item-settings">
            <i class="icon">⚙️</i>
            <span>CÀI ĐẶT</span>
        </div>
        <div class="settings-dropdown">
            <div class="settings-dropdown-item">
                <h4>🎨 Cài đặt cỡ chữ</h4>
                
                <div class="font-size-controls">
                    <button class="font-size-btn" id="sidebarDecreaseFont" title="Giảm cỡ chữ" type="button">−</button>
                    <div class="font-size-display" id="sidebarFontSizeDisplay">100%</div>
                    <button class="font-size-btn" id="sidebarIncreaseFont" title="Tăng cỡ chữ" type="button">+</button>
                </div>
            </div>
            
            <div class="settings-dropdown-item">
                <h4>🔑 Quyền truy cập</h4>
                <div class="setting-section">
                    <div style="background: rgba(255, 255, 255, 0.1); padding: 8px 12px; border-radius: 6px; font-size: 12px;">
                        <div style="color: #ecf0f1; margin-bottom: 5px;">Quyền hiện tại: ${userPermissions.length}/${MENU_CONFIG.length} trang</div>
                        <button onclick="showMyPermissions()" style="background: transparent; border: 1px solid rgba(255,255,255,0.3); color: #ecf0f1; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">
                            Xem chi tiết
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="settings-dropdown-item">
                <h4>🌙 Chế độ hiển thị</h4>
                <div class="setting-section">
                    <div class="setting-toggle" onclick="toggleSetting('darkMode')">
                        <span>Chế độ tối</span>
                        <div class="toggle-switch" data-setting="darkMode"></div>
                    </div>
                </div>
            </div>
            
            <div class="settings-dropdown-item">
                <h4>🔧 Tùy chọn khác</h4>
                <div class="setting-section">
                    <div class="setting-toggle" onclick="toggleSetting('autoSave')">
                        <span>Tự động lưu</span>
                        <div class="toggle-switch active" data-setting="autoSave"></div>
                    </div>
                </div>
                <div class="setting-section">
                    <div class="setting-toggle" onclick="toggleSetting('notifications')">
                        <span>Thông báo</span>
                        <div class="toggle-switch active" data-setting="notifications"></div>
                    </div>
                </div>
                <div class="setting-section">
                    <div style="color: #95a5a6; font-size: calc(11px * var(--font-scale)); padding: calc(5px * var(--font-scale)) 0; text-align: center;">
                        N2 Shop Management v2.0
                    </div>
                </div>
            </div>
        </div>
    `;

    navList.appendChild(settingsLi);

    // Load saved settings
    loadSavedSettings();

    console.log(
        `Navigation menu created with ${visibleMenuItems.length}/${MENU_CONFIG.length} accessible items (HOVER MODE)`,
    );
}

/**
 * Hiển thị thông báo không có quyền
 */
function showPermissionDenied(pageIdentifier) {
    const pageInfo = MENU_CONFIG.find(
        (item) => item.pageIdentifier === pageIdentifier,
    );
    const pageName = pageInfo
        ? `${pageInfo.icon} ${pageInfo.text}`
        : pageIdentifier;

    alert(
        `🚫 KHÔNG CÓ QUYỀN TRUY CẬP\n\nTrang: ${pageName}\n\n💡 Liên hệ Administrator để được cấp quyền truy cập trang này.`,
    );
}

/**
 * Load saved settings from localStorage
 */
function loadSavedSettings() {
    const settings = ["darkMode", "autoSave", "notifications"];

    settings.forEach((settingName) => {
        const savedValue = localStorage.getItem(settingName);
        const toggleSwitch = document.querySelector(
            `[data-setting="${settingName}"]`,
        );

        if (toggleSwitch) {
            if (savedValue === "true") {
                toggleSwitch.classList.add("active");
            } else if (savedValue === "false") {
                toggleSwitch.classList.remove("active");
            }
        }
    });
}

/**
 * Xác định trang hiện tại
 */
function getCurrentPageIdentifier() {
    const path = window.location.pathname;

    for (const item of MENU_CONFIG) {
        const pageFolder = item.pageIdentifier;
        if (
            path.includes(`/${pageFolder}/`) ||
            path.includes(`${pageFolder}/index.html`)
        ) {
            return pageFolder;
        }
    }

    return null;
}

/**
 * Toggle setting switch (vẫn giữ để tương thích)
 */
function toggleSetting(settingName) {
    const toggleSwitch = document.querySelector(
        `[data-setting="${settingName}"]`,
    );
    if (toggleSwitch) {
        const isActive = toggleSwitch.classList.contains("active");

        if (isActive) {
            toggleSwitch.classList.remove("active");
            localStorage.setItem(settingName, "false");
        } else {
            toggleSwitch.classList.add("active");
            localStorage.setItem(settingName, "true");
        }

        const event = new CustomEvent("settingChanged", {
            detail: { settingName, value: !isActive },
        });
        window.dispatchEvent(event);
    }
}

/**
 * Khởi tạo navigation system với permissions và hover effects
 */
async function initializeNavigation() {
    console.log(
        "Initializing navigation with permissions and hover effects...",
    );

    try {
        // KIỂM TRA XEM CÓ ĐANG TRONG QUASTRÌNH ĐĂNG NHẬP KHÔNG
        const isJustLoggedIn = sessionStorage.getItem("justLoggedIn");
        if (isJustLoggedIn) {
            console.log("Just logged in, waiting for data to settle...");
            sessionStorage.removeItem("justLoggedIn");
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Enforce page permission
        const hasAccess = await enforcePagePermission();

        if (!hasAccess) {
            return; // Trang đã được thay thế bởi access denied
        }

        // Tạo sidebar với hover effect
        createIntegratedSidebar();

        // Tạo menu navigation với permission checking
        await createNavigationMenu();

        // Khởi tạo font manager
        const fontManager = new IntegratedFontManager();

        // Thiết lập event listeners
        setupNavigationEventListeners();

        // Setup font event listeners
        setTimeout(() => {
            fontManager.setupEventListeners();
            fontManager.updateDisplay();
            fontManager.updatePresetButtons();
        }, 200);

        // Apply custom settings
        applyCustomSettings();

        console.log(
            "Navigation with permissions and hover effects initialized successfully",
        );
    } catch (error) {
        console.error("Error initializing navigation:", error);

        // Fallback: redirect về trang login nếu có lỗi nghiêm trọng
        const authData = localStorage.getItem("loginindex_auth");
        if (!authData) {
            console.log("No auth data found, redirecting to login");
            window.location.href = "../index.html";
        }
    }
}

/**
 * Apply custom settings after initialization
 */
function applyCustomSettings() {
    const darkMode = localStorage.getItem("darkMode");
    if (darkMode === "true") {
        document.body.classList.add("dark-mode");
    }

    const autoSave = localStorage.getItem("autoSave");
    if (autoSave === "true") {
        console.log("Auto-save enabled");
    }

    const notifications = localStorage.getItem("notifications");
    if (notifications === "false") {
        console.log("Notifications disabled");
    }
}

/**
 * Thiết lập event listeners cho hover navigation
 */
function setupNavigationEventListeners() {
    // ESC key để ẩn sidebar
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            // Force hide sidebar by removing hover
            const sidebar = document.getElementById("sidebar");
            const overlay = document.getElementById("overlay");
            if (sidebar && overlay) {
                sidebar.style.left = "calc(-350px * var(--font-scale))";
                overlay.classList.remove("active");
                setTimeout(() => {
                    sidebar.style.left = "";
                }, 300);
            }
        }
    });

    // Click vào overlay để đóng sidebar
    const overlay = document.getElementById("overlay");
    if (overlay) {
        overlay.addEventListener("click", function () {
            const sidebar = document.getElementById("sidebar");
            if (sidebar) {
                sidebar.style.left = "calc(-350px * var(--font-scale))";
                overlay.classList.remove("active");
                setTimeout(() => {
                    sidebar.style.left = "";
                }, 300);
            }
        });
    }

    // Listen for setting changes
    window.addEventListener("settingChanged", function (e) {
        const { settingName, value } = e.detail;

        switch (settingName) {
            case "darkMode":
                if (value) {
                    document.body.classList.add("dark-mode");
                } else {
                    document.body.classList.remove("dark-mode");
                }
                break;
            case "autoSave":
                // Handle auto-save setting
                break;
            case "notifications":
                // Handle notifications setting
                break;
        }
    });
}

/**
 * Utility functions for external use
 */
function getSetting(settingName) {
    return localStorage.getItem(settingName);
}

function setSetting(settingName, value) {
    localStorage.setItem(settingName, value.toString());

    const toggleSwitch = document.querySelector(
        `[data-setting="${settingName}"]`,
    );
    if (toggleSwitch) {
        if (value) {
            toggleSwitch.classList.add("active");
        } else {
            toggleSwitch.classList.remove("active");
        }
    }

    const event = new CustomEvent("settingChanged", {
        detail: { settingName, value },
    });
    window.dispatchEvent(event);
}

/**
 * Add dark mode styles
 */
function injectDarkModeStyles() {
    if (document.getElementById("darkModeStyles")) return;

    const darkStyles = document.createElement("style");
    darkStyles.id = "darkModeStyles";
    darkStyles.textContent = `
        body.dark-mode {
            background-color: #1a1a1a !important;
            color: #e0e0e0 !important;
        }
        
        body.dark-mode .main-content {
            background-color: #2d2d2d !important;
            color: #e0e0e0 !important;
        }
        
        body.dark-mode table {
            background-color: #2d2d2d !important;
            color: #e0e0e0 !important;
        }
        
        body.dark-mode th {
            background-color: #3d3d3d !important;
            color: #ffffff !important;
        }
        
        body.dark-mode td {
            background-color: #2d2d2d !important;
            border-color: #4d4d4d !important;
        }
        
        body.dark-mode input,
        body.dark-mode select,
        body.dark-mode textarea {
            background-color: #3d3d3d !important;
            color: #e0e0e0 !important;
            border-color: #5d5d5d !important;
        }
        
        body.dark-mode .modal-content {
            background-color: #2d2d2d !important;
            color: #e0e0e0 !important;
        }
        
        body.dark-mode .filter-system {
            background-color: #2d2d2d !important;
            border-color: #4d4d4d !important;
        }
    `;
    document.head.appendChild(darkStyles);
}

// Auto-initialize khi DOM ready
document.addEventListener("DOMContentLoaded", function () {
    async function initWhenReady() {
        try {
            // Inject dark mode styles first
            injectDarkModeStyles();

            // Initialize navigation với permissions và hover
            await initializeNavigation();
        } catch (error) {
            console.error("Error initializing navigation:", error);
            setTimeout(initWhenReady, 500);
        }
    }

    initWhenReady();
});

// Export functions (loại bỏ toggle functions không cần thiết cho hover mode)
window.NavigationManager = {
    init: initializeNavigation,
    toggleSetting: toggleSetting,
    getSetting: getSetting,
    setSetting: setSetting,
    checkPagePermission: checkPagePermission,
    loadUserPermissions: loadUserPermissions,
    enforcePagePermission: enforcePagePermission,
};

// Global functions
window.toggleSetting = toggleSetting;
window.checkPagePermission = checkPagePermission;
window.goToAllowedPage = goToAllowedPage;
window.showMyPermissions = showMyPermissions;
