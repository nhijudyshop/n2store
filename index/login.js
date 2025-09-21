document.addEventListener('DOMContentLoaded', function () {
	// checkLogin == 0 là quyền Admin
	// checkLogin == 1 là quyền acc Còi (tất cả trừ xóa)
	// checkLogin == 2 là quyền acc ck, inbox
	// checkLogin == 666 là acc còn lại
	// checkLogin === 777 là khách
    
    // Constants for better maintainability
    const USER_ROLES = {
        ADMIN: '0',
        COI: '1', 
        LIMITED: '2',
        BASIC: '666',
        GUEST: '777'
    };

    // Hash passwords (in production, use proper hashing like bcrypt)
    const userTypes = {
        'admin': { password: 'admin@@', checkLogin: USER_ROLES.ADMIN },
        'coi': { password: 'coi2806', checkLogin: USER_ROLES.COI },
        'my': { password: 'my2804', checkLogin: USER_ROLES.LIMITED },
        'lai': { password: 'lai2506', checkLogin: USER_ROLES.LIMITED },
        'huyen': { password: 'huyen2307', checkLogin: USER_ROLES.BASIC },
        'hanh': { password: 'hanh1206', checkLogin: USER_ROLES.BASIC },
        'duyen': { password: 'duyen3009', checkLogin: USER_ROLES.BASIC },
        'khach': { password: '777', checkLogin: USER_ROLES.GUEST }
    };

    // Cache DOM elements
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('loginButton');

    // Improved login function with better error handling
    function login() {
        console.log('Login function called'); // Debug log
        
        // Validate inputs exist
        if (!usernameInput || !passwordInput) {
            console.error('Required input elements not found');
            return;
        }

        const username = usernameInput.value.trim().toLowerCase(); // Case insensitive
        const password = passwordInput.value.trim();

        console.log('Username:', username); // Debug log
        console.log('Password length:', password.length); // Debug log (don't log actual password)

        // Input validation
        if (!username || !password) {
            showError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
            return;
        }

        const userInfo = userTypes[username];
        console.log('User info found:', !!userInfo); // Debug log
        
        if (userInfo && password === userInfo.password) {
            console.log('Login successful, redirecting...'); // Debug log
            
            try {
                // Store session data (sử dụng localStorage như code gốc)
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('userType', `${username}-${userInfo.password}`);
                localStorage.setItem('checkLogin', userInfo.checkLogin);
                localStorage.setItem('loginTime', Date.now().toString());
                
                console.log('Session data saved'); // Debug log
                
                // Check if target page exists before redirect
                fetch('./live/index.html', { method: 'HEAD' })
                    .then(response => {
                        if (response.ok) {
                            console.log('Target page exists, redirecting...');
                            window.location.href = './live/index.html';
                        } else {
                            console.error('Target page not found');
                            showError('Không tìm thấy trang đích. Kiểm tra đường dẫn ./live/index.html');
                        }
                    })
                    .catch(error => {
                        console.error('Error checking target page:', error);
                        // Try direct redirect anyway
                        window.location.href = './live/index.html';
                    });
                
            } catch (error) {
                console.error('Error saving session data:', error);
                showError('Có lỗi xảy ra khi đăng nhập.');
            }
        } else {
            console.log('Login failed - wrong credentials');
            showError('Sai thông tin đăng nhập.');
            // Clear password field for security
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
        }
    }

    // Show error message (you can customize this)
    function showError(message) {
        alert(message); // Replace with better UI notification
    }

    // Clear form inputs
    function clearForm() {
        usernameInput.value = '';
        passwordInput.value = '';
    }

    // Enhanced keyboard event handler
    function handleKeyPress(e) {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission
            login();
        }
    }

    // Event listeners with error checking
    if (loginButton) {
        loginButton.addEventListener('click', login);
    } else {
        console.error('Login button not found');
    }

    // More specific event listener for form inputs
    if (usernameInput && passwordInput) {
        usernameInput.addEventListener('keypress', handleKeyPress);
        passwordInput.addEventListener('keypress', handleKeyPress);
    }

    // Optional: Add session timeout check
    function checkSessionTimeout() {
        const loginTime = sessionStorage.getItem('loginTime');
        if (loginTime) {
            const currentTime = Date.now();
            const sessionDuration = 24 * 60 * 60 * 1000; // 24 hours
            
            if (currentTime - parseInt(loginTime) > sessionDuration) {
                sessionStorage.clear();
                alert('Phiên đăng nhập đã hết hạn.');
                window.location.reload();
            }
        }
    }

    // Check session on page load
    checkSessionTimeout();
});