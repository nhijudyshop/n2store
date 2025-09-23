/**
 * Navigation Manager - Quản lý menu dựa trên quyền user
 * File: navigation.js
 * Sử dụng: Include vào tất cả các trang cần menu
 */

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
    console.log('==============================');
}

// Auto-initialize khi DOM ready
document.addEventListener('DOMContentLoaded', function() {
    // Uncomment dòng dưới để debug
    // debugNavigation();
    
    initializeNavigation();
});

// Export functions để có thể sử dụng từ bên ngoài
window.NavigationManager = {
    init: initializeNavigation,
    update: updateNavigationOnPermissionChange,
    debug: debugNavigation,
    toggleMenuItem: toggleMenuItem,
    checkPermissions: checkPagePermissions
};