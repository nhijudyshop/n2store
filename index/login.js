document.addEventListener("DOMContentLoaded", function () {
    const firebaseConfig = {
        apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
        authDomain: "n2shop-69e37.firebaseapp.com",
        projectId: "n2shop-69e37",
        storageBucket: "n2shop-69e37-ne0q1",
        messagingSenderId: "598906493303",
        appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
        measurementId: "G-TEJH3S2T1D",
    };

    const app = firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();

    // Enhanced authentication configuration
    const AUTH_CONFIG = {
        SESSION_DURATION: 8 * 60 * 60 * 1000, // 8 hours for regular session
        REMEMBER_DURATION: 30 * 24 * 60 * 60 * 1000, // 30 days for "remember me"
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_DURATION: 5 * 60 * 1000, // 5 minutes lockout
    };

    // Cache DOM elements
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const rememberMeCheckbox = document.getElementById("rememberMe"); // New element
    const loginButton = document.getElementById("loginButton");
    const errorMessage = document.getElementById("errorMessage");
    const successMessage = document.getElementById("successMessage");

    // Security: Rate limiting
    let loginAttempts = 0;
    let lastAttemptTime = 0;

    // Enhanced login handler
    async function handleLogin() {
        console.log("Login attempt initiated");

        if (isRateLimited()) {
            const remainingTime = Math.ceil(
                (AUTH_CONFIG.LOCKOUT_DURATION -
                    (Date.now() - lastAttemptTime)) /
                    60000,
            );
            showError(
                `Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau ${remainingTime} phút.`,
            );
            return;
        }

        if (!validateInputs()) return;

        const username = usernameInput.value.trim().toLowerCase();
        const password = passwordInput.value.trim();
        const rememberMe = rememberMeCheckbox
            ? rememberMeCheckbox.checked
            : false;

        if (loginButton) {
            loginButton.classList.add("loading");
            loginButton.disabled = true;
        }

        try {
            // Step 1: Check user exists in Firestore
            const userDocRef = db.collection("users").doc(username);
            const userDoc = await userDocRef.get();

            if (!userDoc.exists) {
                console.log("User not found in Firebase");
                handleFailedLogin();
                return;
            }

            const userData = userDoc.data();

            // Step 2: Verify password
            let passwordMatch = await verifyUserPassword(password, userData);

            if (!passwordMatch) {
                console.log("Incorrect password!");
                handleFailedLogin();
                return;
            }

            // Step 3: Firebase Auth login
            let authResult;
            if (auth.currentUser) {
                authResult = { user: auth.currentUser };
                console.log("Reusing existing Firebase Auth session");
            } else {
                authResult = await auth.signInAnonymously();
                console.log("Created new Firebase Auth session");
            }

            // Step 4: Update auth_users collection
            try {
                const authUserRef = db
                    .collection("auth_users")
                    .doc(authResult.user.uid);
                const authUserDoc = await authUserRef.get();

                if (!authUserDoc.exists) {
                    await authUserRef.set({
                        username: username,
                        loginTime:
                            firebase.firestore.FieldValue.serverTimestamp(),
                        lastLogin:
                            firebase.firestore.FieldValue.serverTimestamp(),
                        rememberMe: rememberMe,
                    });
                    console.log("New auth mapping created");
                } else {
                    await authUserRef.update({
                        lastLogin:
                            firebase.firestore.FieldValue.serverTimestamp(),
                        rememberMe: rememberMe,
                    });
                    console.log("Auth mapping updated");
                }
            } catch (error) {
                console.log("Auth mapping error:", error);
            }

            console.log("Firebase Auth successful:", authResult.user.uid);

            // Step 5: Save session with remember me option
            await handleSuccessfulLogin(
                username,
                {
                    displayName: userData.displayName,
                    checkLogin: userData.checkLogin,
                    password: password,
                    uid: authResult.user.uid,
                },
                rememberMe,
            );
        } catch (error) {
            console.error("Authentication error:", error);
            handleAuthError(error);
        } finally {
            if (loginButton) {
                loginButton.classList.remove("loading");
                loginButton.disabled = false;
            }
        }
    }

    // Enhanced password verification
    async function verifyUserPassword(password, userData) {
        if (userData.passwordHash) {
            if (typeof bcrypt !== "undefined") {
                try {
                    return await bcrypt.compare(
                        password,
                        userData.passwordHash,
                    );
                } catch (error) {
                    if (userData.salt) {
                        return verifyPassword(
                            password,
                            userData.passwordHash,
                            userData.salt,
                        );
                    }
                }
            } else if (typeof CryptoJS !== "undefined" && userData.salt) {
                return verifyPassword(
                    password,
                    userData.passwordHash,
                    userData.salt,
                );
            } else {
                return userData.passwordHash === password;
            }
        } else if (userData.password) {
            return password === userData.password;
        }
        return false;
    }

    function verifyPassword(password, hash, salt) {
        if (typeof CryptoJS !== "undefined") {
            const computedHash = CryptoJS.PBKDF2(password, salt, {
                keySize: 256 / 32,
                iterations: 1000,
            }).toString();
            return computedHash === hash;
        }
        return false;
    }

    // Enhanced successful login handler with remember me
    async function handleSuccessfulLogin(
        username,
        userInfo,
        rememberMe = false,
    ) {
        try {
            loginAttempts = 0;

            // Load user permissions
            let userPermissions = [];
            try {
                const userDocRef = db.collection("users").doc(username);
                const userDoc = await userDocRef.get();

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    userPermissions = userData.pagePermissions || [];
                    console.log("User permissions loaded:", userPermissions);
                }
            } catch (error) {
                console.error("Error loading user permissions:", error);
                if (userInfo.checkLogin === "0" || userInfo.checkLogin === 0) {
                    userPermissions = [
                        "live",
                        "livestream",
                        "nhanhang",
                        "hangrotxa",
                        "ib",
                        "ck",
                        "hanghoan",
                        "hangdat",
                        "bangkiemhang",
                        "user-management",
                        "history",
                    ];
                }
            }

            const now = Date.now();
            const duration = rememberMe
                ? AUTH_CONFIG.REMEMBER_DURATION
                : AUTH_CONFIG.SESSION_DURATION;

            const authData = {
                isLoggedIn: "true",
                userType: `${username}-${userInfo.password}`,
                checkLogin: userInfo.checkLogin.toString(),
                timestamp: now,
                expiresAt: now + duration,
                lastActivity: now,
                displayName: userInfo.displayName,
                loginTime: new Date().toISOString(),
                username: username,
                uid: userInfo.uid,
                pagePermissions: userPermissions,
                isRemembered: rememberMe,
            };

            // Save to appropriate storage based on remember me option
            const authDataString = JSON.stringify(authData);

            if (rememberMe) {
                // Save to localStorage for persistent login (30 days)
                localStorage.setItem("loginindex_auth", authDataString);
                localStorage.setItem("remember_login_preference", "true");

                // Also save legacy format for compatibility
                localStorage.setItem("isLoggedIn", "true");
                localStorage.setItem(
                    "userType",
                    `${username}-${userInfo.password}`,
                );
                localStorage.setItem(
                    "checkLogin",
                    userInfo.checkLogin.toString(),
                );

                // Clear from sessionStorage if exists
                sessionStorage.removeItem("loginindex_auth");

                console.log(
                    "Session saved to localStorage (persistent for 30 days)",
                );
            } else {
                // Save to sessionStorage for session-only login
                sessionStorage.setItem("loginindex_auth", authDataString);

                // Clear from localStorage
                localStorage.removeItem("loginindex_auth");
                localStorage.removeItem("remember_login_preference");
                localStorage.removeItem("isLoggedIn");
                localStorage.removeItem("userType");
                localStorage.removeItem("checkLogin");

                console.log("Session saved to sessionStorage (session only)");
            }

            const durationText = rememberMe
                ? "30 ngày"
                : "phiên làm việc hiện tại";
            showSuccess(
                `Đăng nhập thành công! Chào mừng ${userInfo.displayName}. Sẽ giữ đăng nhập trong ${durationText}.`,
            );

            // Delay redirect to ensure data is saved
            setTimeout(() => {
                redirectToMainApp();
            }, 1500);
        } catch (error) {
            console.error("Error saving session data:", error);
            showError("Có lỗi xảy ra khi đăng nhập. Vui lòng thử lại.");
        }
    }

    // Enhanced session validation
    function isValidSession(authData, isFromLocalStorage) {
        if (!authData || !authData.timestamp) return false;

        const now = Date.now();
        const sessionAge = now - authData.timestamp;
        const maxDuration = isFromLocalStorage
            ? AUTH_CONFIG.REMEMBER_DURATION
            : AUTH_CONFIG.SESSION_DURATION;

        // Check if session has expired
        if (sessionAge > maxDuration) {
            console.log("Session expired due to age");
            return false;
        }

        // Check explicit expiry if exists
        if (authData.expiresAt && now > authData.expiresAt) {
            console.log("Session expired due to explicit expiry");
            return false;
        }

        return true;
    }

    // Enhanced existing login check
    function checkExistingLogin() {
        // Check localStorage first (for remembered logins)
        let authData = localStorage.getItem("loginindex_auth");
        let isFromLocalStorage = true;
        let isRemembered =
            localStorage.getItem("remember_login_preference") === "true";

        // If not in localStorage, check sessionStorage
        if (!authData) {
            authData = sessionStorage.getItem("loginindex_auth");
            isFromLocalStorage = false;
            isRemembered = false;
        }

        if (authData) {
            try {
                const auth = JSON.parse(authData);

                if (isValidSession(auth, isFromLocalStorage)) {
                    console.log(
                        `Valid ${isRemembered ? "persistent" : "session"} found, redirecting...`,
                    );

                    const sessionTypeText = isRemembered
                        ? "đăng nhập dài hạn"
                        : "phiên làm việc";
                    showSuccess(
                        `Chào mừng trở lại, ${auth.displayName} (${sessionTypeText})`,
                    );

                    setTimeout(() => {
                        redirectToMainApp();
                    }, 1000);
                    return true;
                } else {
                    console.log("Session expired, clearing data");
                    clearAllAuthData();
                }
            } catch (error) {
                console.error("Invalid session data:", error);
                clearAllAuthData();
            }
        }

        // Check legacy format for backward compatibility
        const legacyLogin = localStorage.getItem("isLoggedIn");
        if (legacyLogin === "true") {
            console.log("Found legacy session, migrating...");
            // Could migrate here or just clear legacy data
            clearAllAuthData();
        }

        return false;
    }

    // Clear all authentication data
    function clearAllAuthData() {
        // Clear enhanced auth data
        localStorage.removeItem("loginindex_auth");
        localStorage.removeItem("remember_login_preference");
        sessionStorage.removeItem("loginindex_auth");

        // Clear legacy auth data
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userType");
        localStorage.removeItem("checkLogin");

        // Clear session markers
        sessionStorage.removeItem("justLoggedIn");
    }

    // Rate limiting check
    function isRateLimited() {
        if (loginAttempts >= AUTH_CONFIG.MAX_LOGIN_ATTEMPTS) {
            const timeSinceLastAttempt = Date.now() - lastAttemptTime;
            if (timeSinceLastAttempt < AUTH_CONFIG.LOCKOUT_DURATION) {
                return true;
            } else {
                loginAttempts = 0;
            }
        }
        return false;
    }

    // Input validation
    function validateInputs() {
        if (!usernameInput || !passwordInput) {
            showError("Lỗi hệ thống: Không tìm thấy trường nhập liệu");
            return false;
        }

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username) {
            showError("Vui lòng nhập tên đăng nhập");
            usernameInput.focus();
            return false;
        }

        if (!password) {
            showError("Vui lòng nhập mật khẩu");
            passwordInput.focus();
            return false;
        }

        return true;
    }

    // Handle failed login
    function handleFailedLogin() {
        loginAttempts++;
        lastAttemptTime = Date.now();

        if (passwordInput) {
            passwordInput.value = "";
            passwordInput.focus();
        }

        const remainingAttempts =
            AUTH_CONFIG.MAX_LOGIN_ATTEMPTS - loginAttempts;
        if (remainingAttempts > 0) {
            showError(
                `Thông tin đăng nhập không chính xác. Còn lại ${remainingAttempts} lần thử.`,
            );
        } else {
            showError(
                `Quá nhiều lần đăng nhập sai. Tài khoản bị khóa ${AUTH_CONFIG.LOCKOUT_DURATION / 60000} phút.`,
            );
        }
    }

    // Handle authentication errors
    function handleAuthError(error) {
        if (error.code === "unavailable") {
            showError("Không thể kết nối Firebase. Kiểm tra kết nối mạng.");
        } else if (error.code === "permission-denied") {
            showError("Không có quyền truy cập dữ liệu.");
        } else {
            showError("Lỗi hệ thống. Vui lòng thử lại sau.");
        }
        handleFailedLogin();
    }

    // Show error message
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
        console.error("Login error:", message);
    }

    // Show success message
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
        console.log("Login success:", message);
    }

    // Redirect to main application
    function redirectToMainApp() {
        sessionStorage.setItem("justLoggedIn", "true");
        const timestamp = Date.now();
        window.location.href = `./live/index.html?t=${timestamp}`;
    }

    // Setup event listeners
    function setupEventListeners() {
        if (loginButton) {
            loginButton.addEventListener("click", function (e) {
                e.preventDefault();
                handleLogin();
            });
        }

        if (document.getElementById("loginForm")) {
            document
                .getElementById("loginForm")
                .addEventListener("submit", function (e) {
                    e.preventDefault();
                    handleLogin();
                });
        }

        if (usernameInput) {
            usernameInput.addEventListener("keypress", handleKeyPress);
        }

        if (passwordInput) {
            passwordInput.addEventListener("keypress", handleKeyPress);
        }

        // Handle remember me checkbox
        if (rememberMeCheckbox) {
            rememberMeCheckbox.addEventListener("change", function () {
                const isChecked = this.checked;
                const durationText = isChecked
                    ? "30 ngày"
                    : "phiên làm việc hiện tại";
                console.log(
                    `Remember me ${isChecked ? "enabled" : "disabled"}: ${durationText}`,
                );
            });
        }
    }

    // Handle key press events
    function handleKeyPress(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            handleLogin();
        }
    }

    // Initialize the login system
    function initialize() {
        console.log("Initializing enhanced login system...");
        setupEventListeners();

        // Check for existing valid session
        setTimeout(() => {
            if (!checkExistingLogin()) {
                console.log("No valid session, showing login form");
                if (usernameInput) usernameInput.focus();
            }
        }, 1000);
    }

    // Start initialization
    initialize();
});

/*
HTML Template for the checkbox (add this to your login form):

<div class="form-group">
    <label class="remember-me-container">
        <input type="checkbox" id="rememberMe" name="rememberMe">
        <span class="checkmark"></span>
        Ghi nhớ đăng nhập (30 ngày)
    </label>
</div>

CSS for styling (optional):
.remember-me-container {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #666;
    cursor: pointer;
}

.remember-me-container input[type="checkbox"] {
    margin: 0;
}

.remember-me-container:hover {
    color: #333;
}
*/
