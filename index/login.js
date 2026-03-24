// =====================================================
// LOGIN SYSTEM - Render API Version
// =====================================================

const LOGIN_API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api/users/login'
    : 'https://n2store-fallback.onrender.com/api/users/login';

document.addEventListener("DOMContentLoaded", function () {
    const AUTH_CONFIG = {
        SESSION_DURATION: 8 * 60 * 60 * 1000,
        REMEMBER_DURATION: 30 * 24 * 60 * 60 * 1000,
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_DURATION: 5 * 60 * 1000,
    };

    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const rememberMeCheckbox = document.getElementById("rememberMe");
    const loginButton = document.getElementById("loginButton");
    const errorMessage = document.getElementById("errorMessage");
    const successMessage = document.getElementById("successMessage");

    let loginAttempts = 0;
    let lastAttemptTime = 0;

    async function handleLogin() {
        if (isRateLimited()) {
            const remainingTime = Math.ceil(
                (AUTH_CONFIG.LOCKOUT_DURATION - (Date.now() - lastAttemptTime)) / 60000
            );
            showError(`Qua nhieu lan dang nhap sai. Vui long thu lai sau ${remainingTime} phut.`);
            return;
        }

        if (!validateInputs()) return;

        const username = usernameInput.value.trim().toLowerCase();
        const password = passwordInput.value.trim();
        const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;

        if (loginButton) {
            loginButton.classList.add("loading");
            loginButton.disabled = true;
        }

        try {
            const response = await fetch(LOGIN_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, rememberMe })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                handleFailedLogin();
                return;
            }

            // Login successful
            loginAttempts = 0;
            const user = data.user;
            const now = Date.now();
            const duration = rememberMe ? AUTH_CONFIG.REMEMBER_DURATION : AUTH_CONFIG.SESSION_DURATION;

            const authData = {
                isLoggedIn: "true",
                username: user.username,
                displayName: user.displayName,
                token: data.token,
                userId: user.userId,
                detailedPermissions: user.detailedPermissions || {},
                roleTemplate: user.roleTemplate || 'custom',
                isAdmin: user.isAdmin || false,
                checkLogin: (user.roleTemplate || 'user').toString(),
                userType: `${user.username}-authenticated`,
                timestamp: now,
                expiresAt: now + duration,
                lastActivity: now,
                loginTime: new Date().toISOString(),
                isRemembered: rememberMe,
            };

            const authDataString = JSON.stringify(authData);

            if (rememberMe) {
                try {
                    localStorage.setItem("loginindex_auth", authDataString);
                } catch (quotaErr) {
                    // Emergency cleanup if localStorage is full
                    console.warn('[Login] localStorage quota exceeded, cleaning up...');
                    ['socialOrders', 'socialOrderTags', 'standard_price_cache', 'product_excel_cache']
                        .forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
                    Object.keys(localStorage).filter(k => k.startsWith('firebase:')).forEach(k => {
                        try { localStorage.removeItem(k); } catch (_) {}
                    });
                    localStorage.setItem("loginindex_auth", authDataString);
                }
                localStorage.setItem("remember_login_preference", "true");
                localStorage.setItem("isLoggedIn", "true");
                localStorage.setItem("userType", authData.userType);
                localStorage.setItem("checkLogin", authData.checkLogin);
                sessionStorage.removeItem("loginindex_auth");
            } else {
                sessionStorage.setItem("loginindex_auth", authDataString);
                localStorage.removeItem("loginindex_auth");
                localStorage.removeItem("remember_login_preference");
                localStorage.removeItem("isLoggedIn");
                localStorage.removeItem("userType");
                localStorage.removeItem("checkLogin");
            }

            const durationText = rememberMe ? "30 ngay" : "phien lam viec hien tai";
            showSuccess(`Dang nhap thanh cong! Chao mung ${user.displayName}. Se giu dang nhap trong ${durationText}.`);

            setTimeout(() => {
                redirectToMainApp();
            }, 1500);

        } catch (error) {
            console.error("Authentication error:", error);
            showError("Khong the ket noi server. Kiem tra ket noi mang.");
        } finally {
            if (loginButton) {
                loginButton.classList.remove("loading");
                loginButton.disabled = false;
            }
        }
    }

    function isValidSession(authData, isFromLocalStorage) {
        if (!authData || !authData.timestamp) return false;

        const now = Date.now();
        const sessionAge = now - authData.timestamp;
        const maxDuration = isFromLocalStorage
            ? AUTH_CONFIG.REMEMBER_DURATION
            : AUTH_CONFIG.SESSION_DURATION;

        if (sessionAge > maxDuration) return false;
        if (authData.expiresAt && now > authData.expiresAt) return false;
        return true;
    }

    function checkExistingLogin() {
        let authData = localStorage.getItem("loginindex_auth");
        let isFromLocalStorage = true;
        let isRemembered = localStorage.getItem("remember_login_preference") === "true";

        if (!authData) {
            authData = sessionStorage.getItem("loginindex_auth");
            isFromLocalStorage = false;
            isRemembered = false;
        }

        if (authData) {
            try {
                const auth = JSON.parse(authData);

                if (isValidSession(auth, isFromLocalStorage)) {
                    const sessionTypeText = isRemembered ? "dang nhap dai han" : "phien lam viec";
                    showSuccess(`Chao mung tro lai, ${auth.displayName} (${sessionTypeText})`);
                    setTimeout(() => { redirectToMainApp(); }, 1000);
                    return true;
                } else {
                    clearAllAuthData();
                }
            } catch (error) {
                clearAllAuthData();
            }
        }

        const legacyLogin = localStorage.getItem("isLoggedIn");
        if (legacyLogin === "true") {
            clearAllAuthData();
        }

        return false;
    }

    function clearAllAuthData() {
        localStorage.removeItem("loginindex_auth");
        localStorage.removeItem("remember_login_preference");
        sessionStorage.removeItem("loginindex_auth");
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userType");
        localStorage.removeItem("checkLogin");
        sessionStorage.removeItem("justLoggedIn");
    }

    function isRateLimited() {
        if (loginAttempts >= AUTH_CONFIG.MAX_LOGIN_ATTEMPTS) {
            const timeSinceLastAttempt = Date.now() - lastAttemptTime;
            if (timeSinceLastAttempt < AUTH_CONFIG.LOCKOUT_DURATION) return true;
            loginAttempts = 0;
        }
        return false;
    }

    function validateInputs() {
        if (!usernameInput || !passwordInput) {
            showError("Loi he thong: Khong tim thay truong nhap lieu");
            return false;
        }

        if (!usernameInput.value.trim()) {
            showError("Vui long nhap ten dang nhap");
            usernameInput.focus();
            return false;
        }

        if (!passwordInput.value.trim()) {
            showError("Vui long nhap mat khau");
            passwordInput.focus();
            return false;
        }

        return true;
    }

    function handleFailedLogin() {
        loginAttempts++;
        lastAttemptTime = Date.now();

        if (passwordInput) {
            passwordInput.value = "";
            passwordInput.focus();
        }

        const remainingAttempts = AUTH_CONFIG.MAX_LOGIN_ATTEMPTS - loginAttempts;
        if (remainingAttempts > 0) {
            showError(`Thong tin dang nhap khong chinh xac. Con lai ${remainingAttempts} lan thu.`);
        } else {
            showError(`Qua nhieu lan dang nhap sai. Tai khoan bi khoa ${AUTH_CONFIG.LOCKOUT_DURATION / 60000} phut.`);
        }
    }

    function showError(message) {
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.classList.add("show");
            setTimeout(() => {
                if (errorMessage.classList.contains("show")) {
                    errorMessage.classList.remove("show");
                }
            }, 5000);
        }
    }

    function showSuccess(message) {
        if (successMessage) {
            successMessage.textContent = message;
            successMessage.classList.add("show");
            setTimeout(() => {
                if (successMessage.classList.contains("show")) {
                    successMessage.classList.remove("show");
                }
            }, 3000);
        }
    }

    function redirectToMainApp() {
        sessionStorage.setItem("justLoggedIn", "true");
        const timestamp = Date.now();
        window.location.href = `./quy-trinh/index.html?t=${timestamp}`;
    }

    function handleKeyPress(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            handleLogin();
        }
    }

    function setupEventListeners() {
        if (loginButton) {
            loginButton.addEventListener("click", function (e) {
                e.preventDefault();
                handleLogin();
            });
        }

        if (document.getElementById("loginForm")) {
            document.getElementById("loginForm").addEventListener("submit", function (e) {
                e.preventDefault();
                handleLogin();
            });
        }

        if (usernameInput) usernameInput.addEventListener("keypress", handleKeyPress);
        if (passwordInput) passwordInput.addEventListener("keypress", handleKeyPress);
    }

    function initialize() {
        console.log("Initializing login system (Render API)...");
        setupEventListeners();

        setTimeout(() => {
            if (!checkExistingLogin()) {
                if (usernameInput) usernameInput.focus();
            }
        }, 500);
    }

    initialize();
});
