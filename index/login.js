// =====================================================
// LOGIN SYSTEM - Render API Version
// =====================================================

const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api/users'
    : 'https://n2store-fallback.onrender.com/api/users';
const LOGIN_API_URL = `${API_BASE_URL}/login`;

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

            // Check if 2FA is required
            if (data.requires2FA) {
                loginAttempts = 0;
                show2FAForm(data.tempToken, rememberMe);
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

    // =====================================================
    // 2FA TOTP VERIFICATION
    // =====================================================

    function show2FAForm(tempToken, rememberMe) {
        const loginForm = document.getElementById("loginForm");
        if (!loginForm) return;

        // Store original form content for back button
        const originalHTML = loginForm.innerHTML;

        loginForm.innerHTML = `
            <div class="totp-form">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <h3 style="font-size: 20px; font-weight: 600; margin-bottom: 8px;">Xác thực 2 bước</h3>
                    <p style="color: #6b7280; font-size: 14px;">Nhập mã 6 chữ số từ Google Authenticator</p>
                </div>
                <div class="totp-inputs" style="display: flex; gap: 8px; justify-content: center; margin-bottom: 20px;">
                    <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="one-time-code" style="width: 48px; height: 56px; text-align: center; font-size: 24px; font-weight: 600; border: 2px solid #e5e7eb; border-radius: 12px; outline: none; transition: border-color 0.2s;" />
                    <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" style="width: 48px; height: 56px; text-align: center; font-size: 24px; font-weight: 600; border: 2px solid #e5e7eb; border-radius: 12px; outline: none; transition: border-color 0.2s;" />
                    <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" style="width: 48px; height: 56px; text-align: center; font-size: 24px; font-weight: 600; border: 2px solid #e5e7eb; border-radius: 12px; outline: none; transition: border-color 0.2s;" />
                    <div style="width: 12px; display: flex; align-items: center; justify-content: center; color: #9ca3af;">-</div>
                    <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" style="width: 48px; height: 56px; text-align: center; font-size: 24px; font-weight: 600; border: 2px solid #e5e7eb; border-radius: 12px; outline: none; transition: border-color 0.2s;" />
                    <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" style="width: 48px; height: 56px; text-align: center; font-size: 24px; font-weight: 600; border: 2px solid #e5e7eb; border-radius: 12px; outline: none; transition: border-color 0.2s;" />
                    <input type="text" class="totp-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" style="width: 48px; height: 56px; text-align: center; font-size: 24px; font-weight: 600; border: 2px solid #e5e7eb; border-radius: 12px; outline: none; transition: border-color 0.2s;" />
                </div>
                <button type="button" id="verify2FABtn" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; margin-bottom: 12px;">
                    Xác nhận
                </button>
                <div style="text-align: center;">
                    <button type="button" id="back2FABtn" style="background: none; border: none; color: #6366f1; cursor: pointer; font-size: 14px; text-decoration: underline;">
                        Quay lại đăng nhập
                    </button>
                </div>
                <div style="text-align: center; margin-top: 12px;">
                    <button type="button" id="useBackupBtn" style="background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 13px;">
                        Sử dụng mã dự phòng
                    </button>
                </div>
            </div>
        `;

        // Setup 2FA digit inputs
        const digits = loginForm.querySelectorAll('.totp-digit');
        digits.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                e.target.value = val;
                if (val && index < digits.length - 1) {
                    digits[index + 1].focus();
                }
                // Auto-submit when all 6 digits entered
                const code = Array.from(digits).map(d => d.value).join('');
                if (code.length === 6) {
                    verify2FA(tempToken, code, rememberMe);
                }
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    digits[index - 1].focus();
                }
            });
            input.addEventListener('focus', function() {
                this.style.borderColor = '#6366f1';
            });
            input.addEventListener('blur', function() {
                this.style.borderColor = '#e5e7eb';
            });
            // Handle paste
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pasted = (e.clipboardData.getData('text') || '').replace(/[^0-9]/g, '');
                if (pasted.length >= 6) {
                    digits.forEach((d, i) => { d.value = pasted[i] || ''; });
                    verify2FA(tempToken, pasted.substring(0, 6), rememberMe);
                }
            });
        });
        digits[0].focus();

        // Verify button
        document.getElementById('verify2FABtn').addEventListener('click', () => {
            const code = Array.from(digits).map(d => d.value).join('');
            if (code.length !== 6) {
                showError('Vui lòng nhập đủ 6 chữ số');
                return;
            }
            verify2FA(tempToken, code, rememberMe);
        });

        // Back button
        document.getElementById('back2FABtn').addEventListener('click', () => {
            loginForm.innerHTML = originalHTML;
            setupEventListeners();
        });

        // Backup code button
        document.getElementById('useBackupBtn').addEventListener('click', () => {
            const code = prompt('Nhập mã dự phòng (backup code):');
            if (code && code.trim()) {
                verify2FA(tempToken, code.trim(), rememberMe);
            }
        });
    }

    async function verify2FA(tempToken, totpCode, rememberMe) {
        const verifyBtn = document.getElementById('verify2FABtn');
        if (verifyBtn) {
            verifyBtn.disabled = true;
            verifyBtn.textContent = 'Đang xác thực...';
        }

        try {
            const response = await fetch(`${API_BASE_URL}/login/verify-totp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempToken, totpCode })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                showError(data.error || 'Mã xác thực không hợp lệ');
                // Clear inputs
                document.querySelectorAll('.totp-digit').forEach(d => { d.value = ''; });
                document.querySelector('.totp-digit')?.focus();
                return;
            }

            // 2FA verified, complete login
            const user = data.user;
            const now = Date.now();
            const AUTH_CONFIG_DURATION = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;

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
                expiresAt: now + AUTH_CONFIG_DURATION,
                lastActivity: now,
                loginTime: new Date().toISOString(),
                isRemembered: rememberMe,
            };

            const authDataString = JSON.stringify(authData);

            if (rememberMe) {
                localStorage.setItem("loginindex_auth", authDataString);
                localStorage.setItem("remember_login_preference", "true");
                localStorage.setItem("isLoggedIn", "true");
                localStorage.setItem("userType", authData.userType);
                localStorage.setItem("checkLogin", authData.checkLogin);
                sessionStorage.removeItem("loginindex_auth");
            } else {
                sessionStorage.setItem("loginindex_auth", authDataString);
                localStorage.removeItem("loginindex_auth");
                localStorage.removeItem("remember_login_preference");
            }

            showSuccess(`Xác thực thành công! Chào mừng ${user.displayName}`);
            setTimeout(() => { redirectToMainApp(); }, 1500);

        } catch (error) {
            console.error('2FA verify error:', error);
            showError('Không thể kết nối server');
        } finally {
            if (verifyBtn) {
                verifyBtn.disabled = false;
                verifyBtn.textContent = 'Xác nhận';
            }
        }
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
