/**
 * Navigation Manager - Quản lý menu và sidebar dựa trên quyền user
 * File: navigation.js
 * Dependencies: common-utils.js
 * Sử dụng: Include vào tất cả các trang cần menu
 */

// Load common utilities script dynamically
(function() {
    const script = document.createElement('script');
    script.src = '../common-utils.js';
    script.async = false; // Đảm bảo load theo thứ tự
    document.head.appendChild(script);
})();

// Cấu hình menu items
const MENU_CONFIG = [
    {
        href: '../live/index.html',
        icon: '📸',
        text: 'HÌNH ẢNH LIVE ĐẦY ĐỦ',
        pageIdentifier: 'live'
    },
    {
        href: '../livestream/index.html',
        icon: '📺',
        text: 'BÁO CÁO LIVESTREAM',
        pageIdentifier: 'livestream'
    },
    {
        href: '../hangrotxa/index.html',
        icon: '📦',
        text: 'HÀNG RỚT - XẢ',
        pageIdentifier: 'hangrotxa'
    },
    {
        href: '../ib/index.html',
        icon: '💬',
        text: 'CHECK INBOX KHÁCH HÀNG',
        pageIdentifier: 'ib'
    },
    {
        href: '../ck/index.html',
        icon: '💳',
        text: 'THÔNG TIN CHUYỂN KHOẢN',
        pageIdentifier: 'ck'
    },
    {
        href: '../hanghoan/index.html',
        icon: '↩️',
        text: 'HÀNG HOÀN',
        pageIdentifier: 'hanghoan'
    },
    {
        href: '../nhaphang/index.html',
        icon: '📋',
        text: 'NHẬP HÀNG',
        pageIdentifier: 'nhaphang'
    },
    {
        href: '../history/index.html',
        icon: '📊',
        text: 'LỊCH SỬ CHỈNH SỬA',
        pageIdentifier: 'history',
        adminOnly: true // Chỉ admin mới thấy
    }
];

/**
 * Toggle Sidebar function - Mở/đóng sidebar
 */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const menuToggle = document.querySelector('.menu-toggle');
    
    // Kiểm tra các elements có tồn tại không
    if (!sidebar || !overlay || !menuToggle) {
        console.warn('Sidebar elements not found');
        return;
    }
    
    const isOpen = sidebar.classList.contains('open');
    
    if (isOpen) {
        // Đóng sidebar
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        menuToggle.classList.remove('active');
        menuToggle.classList.remove('hidden');
    } else {
        // Mở sidebar
        sidebar.classList.add('open');
        overlay.classList.add('active');
        menuToggle.classList.add('active');
        menuToggle.classList.add('hidden');
    }
}

/**
 * Đóng sidebar khi click vào overlay hoặc ESC
 */
function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const menuToggle = document.querySelector('.menu-toggle');
    
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        menuToggle.classList.remove('active');
        menuToggle.classList.remove('hidden');
    }
}

/**
 * Tạo menu navigation dựa trên quyền user
 */
function createNavigationMenu() {
    const checkLogin = localStorage.getItem('checkLogin');
    const navList = document.querySelector('.nav-list');
    
    if (!navList) {
        console.warn('Navigation list not found');
        return;
    }
    
    // Debug log
    console.log('Creating navigation menu, checkLogin:', checkLogin);
    
    // Lọc menu items dựa trên quyền
    const visibleMenuItems = MENU_CONFIG.filter(item => {
        if (item.adminOnly) {
            // Menu chỉ dành cho admin (checkLogin == 0)
            return checkLogin == 0 || checkLogin === '0';
        }
        return true; // Menu công khai
    });
    
    // Xác định trang hiện tại
    const currentPage = getCurrentPageIdentifier();
    
    // Xóa menu cũ và tạo mới
    navList.innerHTML = '';
    
    visibleMenuItems.forEach(item => {
        const li = document.createElement('li');
        li.className = 'nav-item';
        
        const isCurrentPage = currentPage === item.pageIdentifier;
        const linkId = isCurrentPage ? 'id="current-page-link"' : '';
        
        li.innerHTML = `
            <a href="${item.href}" ${linkId}>
                <i class="icon">${item.icon}</i>
                <span>${item.text}</span>
            </a>
        `;
        
        navList.appendChild(li);
    });
    
    console.log(`Navigation menu created with ${visibleMenuItems.length} items`);
}

/**
 * Xác định trang hiện tại dựa trên URL
 */
function getCurrentPageIdentifier() {
    const path = window.location.pathname;
    
    // Tìm page identifier từ URL
    for (const item of MENU_CONFIG) {
        const pageFolder = item.pageIdentifier;
        if (path.includes(`/${pageFolder}/`) || path.includes(`${pageFolder}/index.html`)) {
            return pageFolder;
        }
    }
    
    // Fallback: tìm từ URL patterns
    if (path.includes('/live/')) return 'live';
    if (path.includes('/livestream/')) return 'livestream';
    if (path.includes('/hangrotxa/')) return 'hangrotxa';
    if (path.includes('/ib/')) return 'ib';
    if (path.includes('/ck/')) return 'ck';
    if (path.includes('/hanghoan/')) return 'hanghoan';
    if (path.includes('/nhaphang/')) return 'nhaphang';
    if (path.includes('/history/')) return 'history';
    
    return null;
}

/**
 * Kiểm tra quyền truy cập trang hiện tại
 */
function checkPagePermissions() {
    const checkLogin = localStorage.getItem('checkLogin');
    const currentPage = getCurrentPageIdentifier();
    
    // Tìm config của trang hiện tại
    const pageConfig = MENU_CONFIG.find(item => item.pageIdentifier === currentPage);
    
    if (pageConfig && pageConfig.adminOnly) {
        // Trang chỉ dành cho admin
        if (checkLogin != 0 && checkLogin !== '0') {
            alert('Bạn không có quyền truy cập trang này!');
            window.location.href = '../index.html';
            return false;
        }
    }
    
    return true;
}

/**
 * Khởi tạo navigation system
 */
function initializeNavigation() {
    // Kiểm tra quyền truy cập trang
    if (!checkPagePermissions()) {
        return;
    }
    
    // Tạo menu navigation
    createNavigationMenu();
    
    // Thiết lập event listeners
    setupNavigationEventListeners();
}

/**
 * Thiết lập event listeners cho navigation
 */
function setupNavigationEventListeners() {
    // ESC key để đóng sidebar
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeSidebar();
        }
    });
    
    // Click vào overlay để đóng sidebar
    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }
    
    // Click vào close button
    const closeBtn = document.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', toggleSidebar);
    }
    
    // Click vào menu toggle button
    const menuToggle = document.querySelector('.menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', toggleSidebar);
    }
    
    console.log('Navigation event listeners initialized');
}

/**
 * Cập nhật menu khi quyền user thay đổi
 */
function updateNavigationOnPermissionChange() {
    createNavigationMenu();
}

/**
 * Utility function - Ẩn/hiện menu item cụ thể
 */
function toggleMenuItem(pageIdentifier, show) {
    const menuItem = document.querySelector(`a[href*="${pageIdentifier}"]`);
    if (menuItem && menuItem.closest('li')) {
        menuItem.closest('li').style.display = show ? 'block' : 'none';
    }
}

/**
 * Utility function - Thêm menu item mới
 */
function addMenuItem(menuConfig) {
    MENU_CONFIG.push(menuConfig);
    createNavigationMenu();
}

/**
 * Utility function - Xóa menu item
 */
function removeMenuItem(pageIdentifier) {
    const index = MENU_CONFIG.findIndex(item => item.pageIdentifier === pageIdentifier);
    if (index > -1) {
        MENU_CONFIG.splice(index, 1);
        createNavigationMenu();
    }
}

/**
 * Utility function - Highlight menu item hiện tại
 */
function highlightCurrentPage() {
    const currentPage = getCurrentPageIdentifier();
    const allLinks = document.querySelectorAll('.nav-item a');
    
    allLinks.forEach(link => {
        link.removeAttribute('id');
    });
    
    const currentLink = document.querySelector(`a[href*="${currentPage}"]`);
    if (currentLink) {
        currentLink.id = 'current-page-link';
    }
}

/**
 * Debug function - Kiểm tra trạng thái navigation
 */
function debugNavigation() {
    const checkLogin = localStorage.getItem('checkLogin');
    const currentPage = getCurrentPageIdentifier();
    
    console.log('=== Navigation Debug Info ===');
    console.log('checkLogin:', checkLogin);
    console.log('checkLogin type:', typeof checkLogin);
    console.log('Current page:', currentPage);
    console.log('Is admin (checkLogin == 0):', checkLogin == 0);
    console.log('Is admin (checkLogin === "0"):', checkLogin === '0');
    console.log('Available menu items:', MENU_CONFIG.length);
    
    const visibleItems = MENU_CONFIG.filter(item => {
        if (item.adminOnly) {
            return checkLogin == 0 || checkLogin === '0';
        }
        return true;
    });
    console.log('Visible menu items:', visibleItems.length);
    console.log('Sidebar elements check:');
    console.log('- Sidebar:', document.getElementById('sidebar') ? 'Found' : 'Not found');
    console.log('- Overlay:', document.getElementById('overlay') ? 'Found' : 'Not found');
    console.log('- Menu toggle:', document.querySelector('.menu-toggle') ? 'Found' : 'Not found');
    console.log('- Common Utils:', typeof window.CommonUtils !== 'undefined' ? 'Loaded' : 'Not loaded');
    console.log('==============================');
}

// Auto-initialize khi DOM ready
document.addEventListener('DOMContentLoaded', function() {
    // Đợi common-utils.js load xong rồi mới initialize
    function initWhenReady() {
        if (typeof window.CommonUtils !== 'undefined') {
            // Initialize navigation
            initializeNavigation();
            
            // Initialize common utilities
            window.CommonUtils.init();
            
            console.log('Navigation Manager và Common UI Utilities initialized');
            
            // Uncomment để debug
            // debugNavigation();
        } else {
            // Retry sau 100ms nếu common-utils chưa load xong
            setTimeout(initWhenReady, 100);
        }
    }
    
    initWhenReady();
});

// Export functions để có thể sử dụng từ bên ngoài
window.NavigationManager = {
    // Navigation functions
    init: initializeNavigation,
    update: updateNavigationOnPermissionChange,
    debug: debugNavigation,
    toggleMenuItem: toggleMenuItem,
    addMenuItem: addMenuItem,
    removeMenuItem: removeMenuItem,
    highlightCurrentPage: highlightCurrentPage,
    checkPermissions: checkPagePermissions,
    toggleSidebar: toggleSidebar,
    closeSidebar: closeSidebar,
    
    // Common UI functions sẽ được thêm sau khi CommonUtils load
    get showStatusMessage() {
        return window.showStatusMessage || function() { console.warn('CommonUtils not loaded'); };
    },
    get showFloatingAlert() {
        return window.showFloatingAlert || function() { console.warn('CommonUtils not loaded'); };
    },
    get hideFloatingAlert() {
        return window.hideFloatingAlert || function() { console.warn('CommonUtils not loaded'); };
    },
    get copyToClipboard() {
        return window.copyToClipboard || function() { console.warn('CommonUtils not loaded'); };
    },
    get showCopyNotification() {
        return window.showCopyNotification || function() { console.warn('CommonUtils not loaded'); };
    }
};

// Export toggleSidebar function globally
window.toggleSidebar = toggleSidebar;
