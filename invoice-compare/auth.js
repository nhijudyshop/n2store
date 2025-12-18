// =====================================================
// AUTHENTICATION HANDLER FOR INVOICE COMPARE
// Handles logout and permissions buttons
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize auth check
    checkAuth();

    // Setup event listeners
    setupAuthButtons();
});

// =====================================================
// CHECK AUTHENTICATION
// =====================================================
function checkAuth() {
    // Check if user is logged in via shared auth manager
    if (typeof window.SharedAuthManager !== 'undefined') {
        const isAuthenticated = window.SharedAuthManager.isAuthenticated();

        if (!isAuthenticated) {
            console.warn('[AUTH] User not authenticated, redirecting to login');
            window.location.href = '../index.html';
            return false;
        }

        // Get user info
        const userInfo = window.SharedAuthManager.getUserInfo();
        if (userInfo) {
            updateUserDisplay(userInfo);
        }

        return true;
    }

    // Fallback: Check localStorage
    const authData = localStorage.getItem('loginindex_auth') || sessionStorage.getItem('loginindex_auth');
    if (!authData) {
        console.warn('[AUTH] No auth data found, redirecting to login');
        window.location.href = '../index.html';
        return false;
    }

    try {
        const auth = JSON.parse(authData);
        if (!auth.isLoggedIn) {
            console.warn('[AUTH] User not logged in, redirecting');
            window.location.href = '../index.html';
            return false;
        }

        // Update user display
        updateUserDisplay(auth);
        return true;
    } catch (error) {
        console.error('[AUTH] Error parsing auth data:', error);
        window.location.href = '../index.html';
        return false;
    }
}

// =====================================================
// UPDATE USER DISPLAY
// =====================================================
function updateUserDisplay(userInfo) {
    const userNameEl = document.getElementById('userName');
    if (userNameEl && userInfo) {
        userNameEl.textContent = userInfo.displayName || userInfo.username || 'User';
    }
}

// =====================================================
// SETUP AUTH BUTTONS
// =====================================================
function setupAuthButtons() {
    // Logout button
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
    }

    // Permissions button
    const btnPermissions = document.getElementById('btnPermissions');
    if (btnPermissions) {
        btnPermissions.addEventListener('click', showPermissions);
    }
}

// =====================================================
// LOGOUT HANDLER
// =====================================================
function handleLogout() {
    if (confirm('Bạn có chắc muốn đăng xuất?')) {
        // Clear all auth data
        localStorage.removeItem('loginindex_auth');
        sessionStorage.removeItem('loginindex_auth');
        localStorage.removeItem('tpos_credentials');

        // Clear via SharedAuthManager if available
        if (typeof window.SharedAuthManager !== 'undefined') {
            window.SharedAuthManager.logout();
        }

        console.log('[AUTH] User logged out');

        // Redirect to login
        window.location.href = '../index.html';
    }
}

// =====================================================
// SHOW PERMISSIONS
// =====================================================
function showPermissions() {
    let permissionsHtml = '<h3>Quyền Của Tôi:</h3><ul>';

    if (typeof window.SharedAuthManager !== 'undefined') {
        const userInfo = window.SharedAuthManager.getUserInfo();

        if (userInfo && userInfo.permissions) {
            Object.keys(userInfo.permissions).forEach(key => {
                if (userInfo.permissions[key]) {
                    permissionsHtml += `<li>${key}</li>`;
                }
            });
        } else if (userInfo && userInfo.userType === 'admin') {
            permissionsHtml += '<li><strong>Admin - Tất cả quyền</strong></li>';
        } else {
            permissionsHtml += '<li>Không có thông tin quyền</li>';
        }
    } else {
        // Fallback
        const authData = localStorage.getItem('loginindex_auth') || sessionStorage.getItem('loginindex_auth');
        if (authData) {
            const auth = JSON.parse(authData);
            if (auth.userType === 'admin') {
                permissionsHtml += '<li><strong>Admin - Tất cả quyền</strong></li>';
            } else {
                permissionsHtml += '<li>User role: ' + (auth.userType || 'unknown') + '</li>';
            }
        }
    }

    permissionsHtml += '</ul>';

    alert(permissionsHtml.replace(/<[^>]*>/g, '\n'));
}

console.log('[INVOICE-COMPARE-AUTH] Auth handler initialized');
