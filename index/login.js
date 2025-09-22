document.addEventListener('DOMContentLoaded', function () {
    // User role definitions (lower number = higher permission)
    const USER_ROLES = {
        ADMIN: 0,      // Full access
        COI: 1,        // All except delete
        LIMITED: 2,    // CK, inbox access
        BASIC: 666,    // Limited access
        GUEST: 777     // Read-only
    };

    // Authentication storage key (matches the main app)
    const AUTH_STORAGE_KEY = 'moneyTransfer_auth';

    // User credentials (in production, use proper authentication system)
    // Passwords should be hashed and validated server-side
    const userCredentials = {
        'admin': { 
            password: 'admin123', 
            checkLogin: USER_ROLES.ADMIN,
            displayName: 'Administrator' 
        },
        'coi': { 
            password: 'coi2806', 
            checkLogin: USER_ROLES.COI,
            displayName: 'Còi Manager'
        },
        'my': { 
            password: 'my2804', 
            checkLogin: USER_ROLES.LIMITED,
            displayName: 'My User'
        },
        'lai': { 
            password: 'lai2506', 
            checkLogin: USER_ROLES.LIMITED,
            displayName: 'Lai User'
        },
        'huyen': { 
            password: 'huyen2307', 
            checkLogin: USER_ROLES.BASIC,
            displayName: 'Huyền User'
        },
        'hanh': { 
            password: 'hanh1206', 
            checkLogin: USER_ROLES.BASIC,
            displayName: 'Hạnh User'
        },
        'duyen': { 
            password: 'duyen3009', 
            checkLogin: USER_ROLES.BASIC,
            displayName: 'Duyên User'
        },
        'khach': { 
            password: '777', 
            checkLogin: USER_ROLES.GUEST,
            displayName: 'Guest User'
        }
    };

    // Cache DOM elements
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('loginButton');
    const loginForm = document.getElementById('loginForm');

    // Security: Rate limiting for login attempts
    let loginAttempts = 0;
    const MAX_LOGIN_ATTEMPTS = 5;
    let lastAttemptTime = 0;
    const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes

    // Initialize login system
    function initializeLogin() {
        // Check if already logged in
        if (isAlreadyLoggedIn()) {
            console.log('User already logged in, redirecting...');
            redirectToMainApp();
            return;
        }

        // Set up event listeners
        setupEventListeners();
        
        // Focus on username input
        if (usernameInput) {
            usernameInput.focus();
        }

        console.log('Login system initialized');
    }

    // Check if user is already authenticated
    function isAlreadyLoggedIn() {
        try {
            const authData = localStorage.getItem(AUTH_STORAGE_KEY);
            if (authData) {
                const auth = JSON.parse(authData);
                return auth.isLoggedIn === 'true' && isValidSession(auth);
            }
        } catch (error) {
            console.error('Error checking login status:', error);
            clearAuthData();
        }
        return false;
    }

    // Validate session data
    function isValidSession(auth) {
        // Check if session has required fields
        if (!auth.userType || !auth.checkLogin || !auth.timestamp) {
            return false;
        }

        // Check session timeout (24 hours)
        const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;
        const currentTime = Date.now();
        
        if (currentTime - auth.timestamp > SESSION_TIMEOUT) {
            console.log('Session expired');
            return false;
        }

        return true;
    }

    // Setup event listeners
    function setupEventListeners() {
        if (loginButton) {
            loginButton.addEventListener('click', handleLogin);
        }

        if (loginForm) {
            loginForm.addEventListener('submit', function(e) {
                e.preventDefault();
                handleLogin();
            });
        }

        // Enhanced keyboard event handlers
        if (usernameInput) {
            usernameInput.addEventListener('keypress', handleKeyPress);
            usernameInput.addEventListener('input', clearError);
        }

        if (passwordInput) {
            passwordInput.addEventListener('keypress', handleKeyPress);
            passwordInput.addEventListener('input', clearError);
        }

        // Prevent paste in password field (optional security measure)
        if (passwordInput) {
            passwordInput.addEventListener('paste', function(e) {
                e.preventDefault();
                showError('Không được phép dán mật khẩu');
            });
        }
    }

    // Handle keyboard input
    function handleKeyPress(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleLogin();
        }
    }

    // Clear error messages on input
    function clearError() {
        const errorElement = document.getElementById('errorMessage');
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }

    // Main login handler with security checks
    function handleLogin() {
        console.log('Login attempt initiated');

        // Check rate limiting
        if (isRateLimited()) {
            showError(`Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau ${Math.ceil((LOCKOUT_DURATION - (Date.now() - lastAttemptTime)) / 60000)} phút.`);
            return;
        }

        // Validate inputs
        if (!validateInputs()) {
            return;
        }

        const username = usernameInput.value.trim().toLowerCase();
        const password = passwordInput.value.trim();

        console.log(`Login attempt for user: ${username}`);

        // Authenticate user
        const userInfo = userCredentials[username];
        
        if (userInfo && securePasswordCheck(password, userInfo.password)) {
            console.log('Authentication successful');
            handleSuccessfulLogin(username, userInfo);
        } else {
            console.log('Authentication failed');
            handleFailedLogin();
        }
    }

    // Rate limiting check
    function isRateLimited() {
        if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
            const timeSinceLastAttempt = Date.now() - lastAttemptTime;
            if (timeSinceLastAttempt < LOCKOUT_DURATION) {
                return true;
            } else {
                // Reset after lockout period
                loginAttempts = 0;
            }
        }
        return false;
    }

    // Validate input fields
    function validateInputs() {
        if (!usernameInput || !passwordInput) {
            showError('Lỗi hệ thống: Không tìm thấy trường nhập liệu');
            return false;
        }

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username) {
            showError('Vui lòng nhập tên đăng nhập');
            usernameInput.focus();
            return false;
        }

        if (!password) {
            showError('Vui lòng nhập mật khẩu');
            passwordInput.focus();
            return false;
        }

        // Basic input sanitization
        if (username.length > 50 || password.length > 100) {
            showError('Thông tin đăng nhập quá dài');
            return false;
        }

        // Check for potential XSS
        if (containsSuspiciousChars(username) || containsSuspiciousChars(password)) {
            showError('Ký tự không hợp lệ trong thông tin đăng nhập');
            return false;
        }

        return true;
    }

    // Check for suspicious characters
    function containsSuspiciousChars(input) {
        const suspiciousChars = /<script|javascript:|on\w+=|<\/|<\?/i;
        return suspiciousChars.test(input);
    }

    // Secure password comparison (constant time to prevent timing attacks)
    function securePasswordCheck(inputPassword, storedPassword) {
        // Simple constant-time comparison (in production, use proper crypto functions)
        if (inputPassword.length !== storedPassword.length) {
            return false;
        }

        let result = 0;
        for (let i = 0; i < inputPassword.length; i++) {
            result |= inputPassword.charCodeAt(i) ^ storedPassword.charCodeAt(i);
        }
        
        return result === 0;
    }

    // Handle successful login
    function handleSuccessfulLogin(username, userInfo) {
        try {
            // Reset login attempts
            loginAttempts = 0;
            
            // Create session data (compatible with main app)
            const authData = {
                isLoggedIn: 'true',
                userType: `${username}-${userInfo.password}`,
                checkLogin: userInfo.checkLogin.toString(),
                timestamp: Date.now(),
                displayName: userInfo.displayName,
                loginTime: new Date().toISOString()
            };

            // Save to localStorage (matches main app expectation)
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
            
            // Also set individual keys for backward compatibility
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('userType', `${username}-${userInfo.password}`);
            localStorage.setItem('checkLogin', userInfo.checkLogin.toString());

            console.log('Session data saved successfully');

            // Show success message
            showSuccess(`Đăng nhập thành công! Chào mừng ${userInfo.displayName}`);

            // Log the login (optional)
            logLoginAttempt(username, true);

            // Redirect after short delay
            setTimeout(() => {
                redirectToMainApp();
            }, 1000);

        } catch (error) {
            console.error('Error saving session data:', error);
            showError('Có lỗi xảy ra khi đăng nhập. Vui lòng thử lại.');
        }
    }

    // Handle failed login
    function handleFailedLogin() {
        loginAttempts++;
        lastAttemptTime = Date.now();

        // Clear password for security
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
        }

        // Show appropriate error message
        const remainingAttempts = MAX_LOGIN_ATTEMPTS - loginAttempts;
        if (remainingAttempts > 0) {
            showError(`Thông tin đăng nhập không chính xác. Còn lại ${remainingAttempts} lần thử.`);
        } else {
            showError(`Quá nhiều lần đăng nhập sai. Tài khoản bị khóa ${LOCKOUT_DURATION / 60000} phút.`);
        }

        // Log the failed attempt
        logLoginAttempt(usernameInput ? usernameInput.value : 'unknown', false);
    }

    // Redirect to main application
    function redirectToMainApp() {
        const targetUrl = './live/index.html';
        
        // Check if target exists (optional)
        fetch(targetUrl, { method: 'HEAD' })
            .then(response => {
                if (response.ok) {
                    console.log('Redirecting to main application...');
                    window.location.href = targetUrl;
                } else {
                    console.error('Target page not found');
                    showError('Không tìm thấy trang chính. Kiểm tra đường dẫn.');
                }
            })
            .catch(error => {
                console.error('Error checking target page:', error);
                // Try direct redirect anyway
                console.log('Attempting direct redirect...');
                window.location.href = targetUrl;
            });
    }

    // Enhanced notification system
    function showError(message) {
        showNotification(message, 'error');
        console.error('Login error:', message);
    }

    function showSuccess(message) {
        showNotification(message, 'success');
        console.log('Login success:', message);
    }

    function showNotification(message, type) {
        // Try to use existing error element first
        let errorElement = document.getElementById('errorMessage');
        
        if (!errorElement) {
            // Create notification element if it doesn't exist
            errorElement = document.createElement('div');
            errorElement.id = 'errorMessage';
            errorElement.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 15px 20px;
                border-radius: 5px;
                font-weight: bold;
                text-align: center;
                z-index: 10000;
                max-width: 400px;
                word-wrap: break-word;
                transition: all 0.3s ease;
            `;
            document.body.appendChild(errorElement);
        }

        // Set styles based on type
        if (type === 'error') {
            errorElement.style.backgroundColor = '#f8d7da';
            errorElement.style.color = '#721c24';
            errorElement.style.border = '1px solid #f5c6cb';
        } else if (type === 'success') {
            errorElement.style.backgroundColor = '#d4edda';
            errorElement.style.color = '#155724';
            errorElement.style.border = '1px solid #c3e6cb';
        }

        errorElement.textContent = message;
        errorElement.style.display = 'block';

        // Auto-hide after delay
        setTimeout(() => {
            if (errorElement && errorElement.parentNode) {
                errorElement.style.display = 'none';
            }
        }, type === 'success' ? 2000 : 5000);
    }

    // Log login attempts (for security monitoring)
    function logLoginAttempt(username, success) {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                username: username,
                success: success,
                ip: 'unknown', // In production, get real IP
                userAgent: navigator.userAgent.substring(0, 100)
            };

            // In production, send to server for monitoring
            console.log('Login attempt logged:', logEntry);
            
            // Store in sessionStorage for debugging (remove in production)
            const existingLogs = JSON.parse(sessionStorage.getItem('loginLogs') || '[]');
            existingLogs.push(logEntry);
            
            // Keep only last 10 logs
            if (existingLogs.length > 10) {
                existingLogs.shift();
            }
            
            sessionStorage.setItem('loginLogs', JSON.stringify(existingLogs));
        } catch (error) {
            console.error('Error logging login attempt:', error);
        }
    }

    // Clear authentication data
    function clearAuthData() {
        try {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('userType');
            localStorage.removeItem('checkLogin');
            sessionStorage.clear();
        } catch (error) {
            console.error('Error clearing auth data:', error);
        }
    }

    // Security: Clear form data on page unload
    window.addEventListener('beforeunload', function() {
        if (passwordInput) {
            passwordInput.value = '';
        }
    });

    // Security: Disable right-click on password field
    if (passwordInput) {
        passwordInput.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            return false;
        });
    }

    // Initialize the login system
    initializeLogin();

    // Expose necessary functions globally (if needed)
    window.clearAuthData = clearAuthData;
});