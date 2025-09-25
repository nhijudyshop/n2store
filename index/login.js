document.addEventListener('DOMContentLoaded', function () {
    const firebaseConfig = {
        apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
        authDomain: "n2shop-69e37.firebaseapp.com", 
        projectId: "n2shop-69e37",
        storageBucket: "n2shop-69e37-ne0q1",
        messagingSenderId: "598906493303",
        appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
        measurementId: "G-TEJH3S2T1D"
    };

    const app = firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth(); // Thêm Firebase Auth

    // Cache DOM elements
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('loginButton');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');

    // Security: Rate limiting
    let loginAttempts = 0;
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCKOUT_DURATION = 5 * 60 * 1000;

    // Main login handler với Firebase Auth
    async function handleLogin() {
        console.log('Login attempt initiated');

        if (isRateLimited()) {
            const remainingTime = Math.ceil((LOCKOUT_DURATION - (Date.now() - lastAttemptTime)) / 60000);
            showError(`Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau ${remainingTime} phút.`);
            return;
        }

        if (!validateInputs()) return;

        const username = usernameInput.value.trim().toLowerCase();
        const password = passwordInput.value.trim();

        if (loginButton) {
            loginButton.classList.add('loading');
            loginButton.disabled = true;
        }

        try {
            // Bước 1: Kiểm tra user có tồn tại trong Firestore không
            const userDocRef = db.collection("users").doc(username);
            const userDoc = await userDocRef.get();

            if (!userDoc.exists) {
                console.log('User not found in Firebase');
                handleFailedLogin();
                return;
            }

            const userData = userDoc.data();
            
            // Bước 2: Verify password (giữ nguyên logic cũ)
            let passwordMatch = await verifyUserPassword(password, userData);
            
            if (!passwordMatch) {
                console.log('Sai mật khẩu!');
                handleFailedLogin();
                return;
            }

            // Bước 3: Đăng nhập với Firebase Auth bằng Custom Token
            // (Cần tạo custom token từ server hoặc dùng Anonymous Auth)
            
            // Kiểm tra xem user đã có Firebase Auth session chưa
            let authResult;
            if (auth.currentUser) {
                // User đã có session Firebase Auth
                authResult = { user: auth.currentUser };
                console.log('Reusing existing Firebase Auth session');
            } else {
                // Tạo Firebase Auth session mới
                authResult = await auth.signInAnonymously();
                console.log('Created new Firebase Auth session');
            }
            
            // Tạo/cập nhật record trong auth_users (chỉ khi cần)
            try {
                const authUserRef = db.collection("auth_users").doc(authResult.user.uid);
                const authUserDoc = await authUserRef.get();
                
                if (!authUserDoc.exists) {
                    // Chỉ tạo mới khi chưa có
                    await authUserRef.set({
                        username: username,
                        loginTime: firebase.firestore.FieldValue.serverTimestamp(),
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    console.log('New auth mapping created');
                } else {
                    // Chỉ cập nhật thời gian đăng nhập cuối
                    await authUserRef.update({
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    console.log('Auth mapping updated');
                }
            } catch (error) {
                console.log('Auth mapping error:', error);
            }

            console.log('Firebase Auth successful:', authResult.user.uid);

            // Bước 4: Lưu thông tin session
            handleSuccessfulLogin(username, {
                displayName: userData.displayName,
                checkLogin: userData.checkLogin,
                password: password,
                uid: authResult.user.uid
            });

        } catch (error) {
            console.error('Authentication error:', error);
            handleAuthError(error);
        } finally {
            if (loginButton) {
                loginButton.classList.remove('loading');
                loginButton.disabled = false;
            }
        }
    }

    // Hàm verify password (giữ nguyên logic cũ)
    async function verifyUserPassword(password, userData) {
        if (userData.passwordHash) {
            // Logic hash password như cũ
            if (typeof bcrypt !== 'undefined') {
                try {
                    return await bcrypt.compare(password, userData.passwordHash);
                } catch (error) {
                    if (userData.salt) {
                        return verifyPassword(password, userData.passwordHash, userData.salt);
                    }
                }
            } else if (typeof CryptoJS !== 'undefined' && userData.salt) {
                return verifyPassword(password, userData.passwordHash, userData.salt);
            } else {
                return userData.passwordHash === password;
            }
        } else if (userData.password) {
            return password === userData.password;
        }
        return false;
    }

    function verifyPassword(password, hash, salt) {
        if (typeof CryptoJS !== 'undefined') {
            const computedHash = CryptoJS.PBKDF2(password, salt, { 
                keySize: 256/32,
                iterations: 1000 
            }).toString();
            return computedHash === hash;
        }
        return false;
    }

    function handleSuccessfulLogin(username, userInfo) {
        try {
            loginAttempts = 0;
            
            const authData = {
                isLoggedIn: 'true',
                userType: `${username}-${userInfo.password}`,
                checkLogin: userInfo.checkLogin.toString(),
                timestamp: Date.now(),
                displayName: userInfo.displayName,
                loginTime: new Date().toISOString(),
                username: username,
                uid: userInfo.uid // Thêm Firebase UID
            };

            localStorage.setItem('loginindex_auth', JSON.stringify(authData));
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('userType', `${username}-${userInfo.password}`);
            localStorage.setItem('checkLogin', userInfo.checkLogin.toString());

            console.log('Session data saved successfully');
            showSuccess(`Đăng nhập thành công! Chào mừng ${userInfo.displayName}`);

            setTimeout(() => {
                redirectToMainApp();
            }, 1500);

        } catch (error) {
            console.error('Error saving session data:', error);
            showError('Có lỗi xảy ra khi đăng nhập. Vui lòng thử lại.');
        }
    }

    // Kiểm tra trạng thái đăng nhập khi trang load
    auth.onAuthStateChanged((user) => {
        if (user) {
            console.log('User is signed in:', user.uid);
            // User đã đăng nhập Firebase Auth
        } else {
            console.log('User is signed out');
            // User chưa đăng nhập
        }
    });

    // Hàm đăng xuất (để sử dụng ở trang khác)
    window.logoutUser = function() {
        auth.signOut().then(() => {
            localStorage.clear();
            console.log('User signed out successfully');
            window.location.href = './login.html';
        }).catch((error) => {
            console.error('Sign out error:', error);
        });
    };

    // Các hàm khác giữ nguyên
    function isRateLimited() {
        if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
            const timeSinceLastAttempt = Date.now() - lastAttemptTime;
            if (timeSinceLastAttempt < LOCKOUT_DURATION) {
                return true;
            } else {
                loginAttempts = 0;
            }
        }
        return false;
    }

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

        return true;
    }

    function handleFailedLogin() {
        loginAttempts++;
        lastAttemptTime = Date.now();

        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
        }

        const remainingAttempts = MAX_LOGIN_ATTEMPTS - loginAttempts;
        if (remainingAttempts > 0) {
            showError(`Thông tin đăng nhập không chính xác. Còn lại ${remainingAttempts} lần thử.`);
        } else {
            showError(`Quá nhiều lần đăng nhập sai. Tài khoản bị khóa ${LOCKOUT_DURATION / 60000} phút.`);
        }
    }

    function handleAuthError(error) {
        if (error.code === 'unavailable') {
            showError('Không thể kết nối Firebase. Kiểm tra kết nối mạng.');
        } else if (error.code === 'permission-denied') {
            showError('Không có quyền truy cập dữ liệu.');
        } else {
            showError('Lỗi hệ thống. Vui lòng thử lại sau.');
        }
        handleFailedLogin();
    }

    function showError(message) {
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.classList.add('show');
            setTimeout(() => {
                if (errorMessage.classList.contains('show')) {
                    errorMessage.classList.remove('show');
                }
            }, 5000);
        }
        console.error('Login error:', message);
    }

    function showSuccess(message) {
        if (successMessage) {
            successMessage.textContent = message;
            successMessage.classList.add('show');
            setTimeout(() => {
                if (successMessage.classList.contains('show')) {
                    successMessage.classList.remove('show');
                }
            }, 3000);
        }
        console.log('Login success:', message);
    }

    function redirectToMainApp() {
        window.location.href = './live/index.html';
    }

    // Setup event listeners
    function setupEventListeners() {
        if (loginButton) {
            loginButton.addEventListener('click', function(e) {
                e.preventDefault();
                handleLogin();
            });
        }

        if (document.getElementById('loginForm')) {
            document.getElementById('loginForm').addEventListener('submit', function(e) {
                e.preventDefault();
                handleLogin();
            });
        }

        if (usernameInput) {
            usernameInput.addEventListener('keypress', handleKeyPress);
        }

        if (passwordInput) {
            passwordInput.addEventListener('keypress', handleKeyPress);
        }
    }

    function handleKeyPress(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleLogin();
        }
    }

    // Initialize
    console.log('Initializing login system...');
    setupEventListeners();
    if (usernameInput) usernameInput.focus();
});