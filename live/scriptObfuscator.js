// =====================================================
// UI NOTIFICATION SYSTEM - FIXED VERSION
// =====================================================

class NotificationManager {
    constructor() {
        this.container = null;
        this.notifications = new Map(); // Track multiple notifications
        this.notificationCounter = 0; // Unique ID for each notification
        this.init();
    }

    init() {
        this.container = document.createElement("div");
        this.container.id = "notification-container";
        this.container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10001;
            max-width: 400px;
            pointer-events: none;
        `;
        document.body.appendChild(this.container);

        this.injectStyles();

        // Clean up any existing overlay on init (in case of page refresh issues)
        setTimeout(() => {
            this.forceHideOverlay();
        }, 100);
    }

    injectStyles() {
        if (document.getElementById("notification-styles")) return;

        const style = document.createElement("style");
        style.id = "notification-styles";
        style.textContent = `
            .notification {
                padding: 15px 20px;
                margin-bottom: 10px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                font-size: 14px;
                font-weight: 500;
                position: relative;
                overflow: hidden;
                max-width: 400px;
                word-wrap: break-word;
                pointer-events: auto;
            }
            
            .notification.show {
                opacity: 1;
                transform: translateX(0);
            }
            
            .notification.success {
                background: linear-gradient(135deg, #4CAF50, #45a049);
                color: white;
                border-left: 4px solid #2E7D32;
            }
            
            .notification.error {
                background: linear-gradient(135deg, #f44336, #d32f2f);
                color: white;
                border-left: 4px solid #c62828;
            }
            
            .notification.info {
                background: linear-gradient(135deg, #2196F3, #1976D2);
                color: white;
                border-left: 4px solid #1565C0;
            }
            
            .notification.warning {
                background: linear-gradient(135deg, #FF9800, #F57C00);
                color: white;
                border-left: 4px solid #E65100;
            }
            
            .notification::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                height: 100%;
                width: 0%;
                background: rgba(255,255,255,0.2);
                transition: width linear;
            }
            
            .notification.with-progress::before {
                animation: progress-bar linear;
                animation-duration: var(--duration, 3000ms);
            }
            
            @keyframes progress-bar {
                from { width: 0%; }
                to { width: 100%; }
            }
            
            .notification .close-btn {
                position: absolute;
                top: 5px;
                right: 10px;
                background: none;
                border: none;
                color: inherit;
                font-size: 18px;
                cursor: pointer;
                opacity: 0.7;
                transition: opacity 0.2s;
            }
            
            .notification .close-btn:hover {
                opacity: 1;
            }
            
            .loading-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.3);
                z-index: 10000;
                display: none;
                backdrop-filter: blur(2px);
            }
            
            .loading-overlay.show {
                display: block;
            }
        `;
        document.head.appendChild(style);
    }

    show(message, type = "info", duration = 3000, showOverlay = false) {
        // If this is a loading notification, clear previous ones first
        if (showOverlay || duration === 0) {
            this.clearAll();
        }

        const notificationId = ++this.notificationCounter;
        const notification = document.createElement("div");
        notification.className = `notification ${type}`;
        notification.dataset.id = notificationId;

        const closeBtn = document.createElement("button");
        closeBtn.className = "close-btn";
        closeBtn.innerHTML = "×";
        closeBtn.onclick = () => this.remove(notificationId);

        notification.textContent = message;
        notification.appendChild(closeBtn);

        // Add progress bar for timed notifications
        if (duration > 0) {
            notification.style.setProperty("--duration", duration + "ms");
            notification.classList.add("with-progress");
        }

        this.container.appendChild(notification);
        this.notifications.set(notificationId, {
            element: notification,
            type: type,
            timeout: null,
            showOverlay: showOverlay,
        });

        // Handle loading overlay
        if (showOverlay) {
            this.showOverlay();
            document.body.style.overflow = "hidden";
        }

        // Animate in
        requestAnimationFrame(() => {
            notification.classList.add("show");
        });

        // Auto-hide with proper cleanup
        if (duration > 0 && !showOverlay) {
            const timeoutId = setTimeout(() => {
                this.remove(notificationId);
            }, duration);

            this.notifications.get(notificationId).timeout = timeoutId;
        }

        return notificationId;
    }

    remove(notificationId) {
        const notification = this.notifications.get(notificationId);
        if (!notification) return;

        // Clear timeout if exists
        if (notification.timeout) {
            clearTimeout(notification.timeout);
        }

        // Animate out
        notification.element.classList.remove("show");

        setTimeout(() => {
            if (notification.element && notification.element.parentNode) {
                notification.element.parentNode.removeChild(
                    notification.element,
                );
            }
            this.notifications.delete(notificationId);

            // Hide overlay only if no more loading notifications exist
            if (notification.showOverlay) {
                this.checkAndHideOverlay();
            }
        }, 300);
    }

    clearAll() {
        // Clear all notifications
        for (const [id] of this.notifications) {
            this.remove(id);
        }
        // Force hide overlay regardless
        this.forceHideOverlay();
    }

    // Legacy method for backwards compatibility
    clear() {
        this.clearAll();
    }

    // Check if any loading notifications still exist before hiding overlay
    checkAndHideOverlay() {
        const hasLoadingNotifications = Array.from(
            this.notifications.values(),
        ).some((notification) => notification.showOverlay);

        if (!hasLoadingNotifications) {
            this.hideOverlay();
        }
    }

    forceHideOverlay() {
        const overlay = document.getElementById("loading-overlay");
        if (overlay) {
            overlay.classList.remove("show");
        }
        document.body.style.overflow = "auto";
    }

    showOverlay() {
        let overlay = document.getElementById("loading-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "loading-overlay";
            overlay.className = "loading-overlay";
            document.body.appendChild(overlay);
        }
        overlay.classList.add("show");
    }

    hideOverlay() {
        const overlay = document.getElementById("loading-overlay");
        if (overlay) {
            overlay.classList.remove("show");
        }
        document.body.style.overflow = "auto";
    }

    loading(message = "Đang xử lý...") {
        return this.show(message, "info", 0, true);
    }

    success(message, duration = 2000) {
        return this.show(message, "success", duration);
    }

    error(message, duration = 4000) {
        return this.show(message, "error", duration);
    }

    warning(message, duration = 3000) {
        return this.show(message, "warning", duration);
    }

    // Method to update an existing notification (useful for progress updates)
    update(notificationId, newMessage) {
        const notification = this.notifications.get(notificationId);
        if (notification) {
            const closeBtn = notification.element.querySelector(".close-btn");
            notification.element.textContent = newMessage;
            notification.element.appendChild(closeBtn);
        }
    }

    // Method to manually fix stuck overlay (can be called from console if needed)
    fixStuckOverlay() {
        console.log("Fixing stuck overlay...");
        this.clearAll();
        this.forceHideOverlay();

        // Also clean up any orphaned overlay elements
        const allOverlays = document.querySelectorAll(
            ".loading-overlay, #loading-overlay",
        );
        allOverlays.forEach((overlay) => {
            overlay.classList.remove("show");
            overlay.style.display = "none";
        });

        document.body.style.overflow = "auto";
        console.log("Overlay cleanup completed");
    }
}

// =====================================================
// GLOBAL INSTANCES AND INITIALIZATION
// =====================================================

// Global instances
let notificationManager;
let app;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", function () {
    try {
        // Ensure global instances are initialized
        if (!authManager) {
            throw new Error("AuthManager not initialized");
        }
        if (!cacheManager) {
            throw new Error("CacheManager not initialized");
        }

        // Initialize notification system
        notificationManager = new NotificationManager();

        // Make notification functions globally available
        window.showNotification = (message, type, duration) =>
            notificationManager.show(message, type, duration);
        window.hideNotification = () => notificationManager.clear();
        window.showFloatingAlert = (message, isLoading, duration) => {
            if (isLoading) {
                notificationManager.loading(message);
            } else {
                notificationManager.show(message, "info", duration);
            }
        };
        window.hideFloatingAlert = () => notificationManager.clear();

        // Initialize main application
        app = new ImageManagementApp();

        // Setup periodic session check (mỗi 10 phút)
        setInterval(
            () => {
                if (authManager && !authManager.checkAndRefreshSession()) {
                    console.log("Session expired during periodic check");
                    if (notificationManager) {
                        notificationManager.error(
                            "Phiên đăng nhập đã hết hạn. Đang chuyển về trang đăng nhập...",
                        );
                    }
                    setTimeout(() => {
                        window.location.href = "../index.html";
                    }, 2000);
                }
            },
            10 * 60 * 1000,
        );
    } catch (error) {
        console.error("Application initialization error:", error);
        if (notificationManager) {
            notificationManager.error("Lỗi khởi tạo ứng dụng");
        }
        // Fallback error display
        alert("Lỗi khởi tạo ứng dụng: " + error.message);
    }
});

// Updated cleanup on page unload
window.addEventListener("beforeunload", () => {
    if (app && app.lazyLoader) {
        app.lazyLoader.destroy();
    }
    if (cacheManager) {
        cacheManager.cleanup();
    }

    // Refresh session timestamp before unload
    if (authManager) {
        authManager.refreshSession();
    }
});

// Global error handler
window.addEventListener("error", function (e) {
    console.error("Global error:", e.error);
    if (notificationManager) {
        notificationManager.error("Có lỗi xảy ra. Vui lòng tải lại trang.");
    }
});

// Export for debugging (remove in production)
if (typeof window !== "undefined") {
    window.debug = {
        authManager: () => authManager,
        cacheManager: () => cacheManager,
        app: () => app,
        // Utility methods for debugging
        clearAuth: () => authManager && authManager.clearAuth(),
        getAuthState: () => authManager && authManager.getAuthState(),
        getCacheStats: () => cacheManager && cacheManager.getStats(),
        invalidateCache: () => cacheManager && cacheManager.invalidate(),
        refreshSession: () => authManager && authManager.refreshSession(),
        checkSession: () => authManager && authManager.checkAndRefreshSession(),
        // Emergency fixes
        fixStuckOverlay: () =>
            notificationManager && notificationManager.fixStuckOverlay(),
        forceLogout: () => {
            if (authManager) {
                authManager.clearAuth();
            }
            window.location.href = "../index.html";
        },
    };

    console.log("Debug utilities available via window.debug");
    console.log("Available methods:", Object.keys(window.debug));
} // Image Management System - Enhanced Version with Updated Authentication
// Security, performance and maintainability improvements

// =====================================================
// CONFIGURATION & CONSTANTS
// =====================================================

const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Performance and cache configuration
const CONFIG = {
    CACHE_EXPIRY: 10 * 60 * 1000, // 10 minutes
    MAX_CONCURRENT_LOADS: 4, // Reduced for better performance
    BATCH_SIZE: 3, // Smaller batches
    MAX_IMAGE_SIZE: 800, // Max width for compression
    IMAGE_QUALITY: 0.8, // Compression quality
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
    LAZY_LOAD_MARGIN: "50px 0px 100px 0px",
    ui: {
        toastDuration: 3000, // Duration for toast messages
        animationDuration: 300, // Animation duration in ms
        hoverDelay: 500, // Delay before showing image hover
    },
};

// Authentication storage key - thống nhất với file 2
const AUTH_STORAGE_KEY = "loginindex_auth";

// =====================================================
// AUTHENTICATION SYSTEM - UPDATED VERSION
// =====================================================

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        try {
            // Đọc từ key chính
            const authData = localStorage.getItem(AUTH_STORAGE_KEY);
            if (authData) {
                const auth = JSON.parse(authData);
                if (this.isValidSession(auth)) {
                    this.currentUser = auth;
                    return true;
                }
            }
        } catch (error) {
            console.error("Error reading auth data:", error);
            this.clearAuth();
        }

        // Kiểm tra legacy storage để tương thích ngược
        const legacyAuth = this.checkLegacyAuth();
        if (legacyAuth) {
            // Migrate legacy auth to new format
            this.setAuthState(
                legacyAuth.isLoggedIn,
                legacyAuth.userType,
                legacyAuth.checkLogin,
            );
            this.currentUser = this.getAuthState();
            return true;
        }

        return false;
    }

    checkLegacyAuth() {
        try {
            const isLoggedIn = localStorage.getItem("isLoggedIn");
            const userType = localStorage.getItem("userType");
            const checkLogin = localStorage.getItem("checkLogin");

            if (isLoggedIn === "true" && userType && checkLogin) {
                return {
                    isLoggedIn: "true",
                    userType: userType,
                    checkLogin: parseInt(checkLogin),
                    timestamp: Date.now(),
                    displayName: userType.split("-")[0],
                };
            }
        } catch (error) {
            console.error("Error checking legacy auth:", error);
        }
        return null;
    }

    getAuthState() {
        try {
            const stored = localStorage.getItem(AUTH_STORAGE_KEY);
            if (stored) {
                this.currentUser = JSON.parse(stored);
                return this.currentUser;
            }
        } catch (error) {
            console.error("Error reading auth state:", error);
            this.clearAuth();
        }
        return null;
    }

    setAuthState(isLoggedIn, userType, checkLogin) {
        this.currentUser = {
            isLoggedIn: isLoggedIn,
            userType: userType,
            checkLogin: checkLogin,
            timestamp: Date.now(),
            displayName: userType ? userType.split("-")[0] : "Unknown",
        };

        try {
            localStorage.setItem(
                AUTH_STORAGE_KEY,
                JSON.stringify(this.currentUser),
            );
            console.log("Auth state saved successfully");
        } catch (error) {
            console.error("Error saving auth state:", error);
        }
    }

    isValidSession(auth) {
        if (
            !auth.isLoggedIn ||
            !auth.userType ||
            auth.checkLogin === undefined
        ) {
            return false;
        }

        // Kiểm tra session timeout (24 giờ)
        if (
            auth.timestamp &&
            Date.now() - auth.timestamp > CONFIG.SESSION_TIMEOUT
        ) {
            console.log("Session expired");
            return false;
        }

        return true;
    }

    isAuthenticated() {
        const auth = this.getAuthState();
        return auth && auth.isLoggedIn === "true";
    }

    hasPermission(requiredLevel) {
        const auth = this.getAuthState();
        if (!auth) return false;

        const userLevel = parseInt(auth.checkLogin);
        return userLevel <= requiredLevel; // Số nhỏ hơn = quyền cao hơn
    }

    getUserInfo() {
        return this.getAuthState();
    }

    clearAuth() {
        this.currentUser = null;
        try {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            // Xóa cả legacy keys để đảm bảo clean up hoàn toàn
            localStorage.removeItem("isLoggedIn");
            localStorage.removeItem("userType");
            localStorage.removeItem("checkLogin");
            sessionStorage.clear();
            console.log("Auth cleared successfully");
        } catch (error) {
            console.error("Error clearing auth:", error);
        }
    }

    logout() {
        const confirmLogout = confirm("Bạn có chắc muốn đăng xuất?");
        if (confirmLogout) {
            this.clearAuth();
            // Safely call cacheManager if it exists
            if (typeof cacheManager !== "undefined" && cacheManager) {
                cacheManager.invalidate();
            }
            window.location.href = "../index.html";
        }
    }

    // Method để kiểm tra và migrate legacy auth nếu cần
    migrateFromLegacy() {
        const legacyAuth = this.checkLegacyAuth();
        if (legacyAuth && !this.getAuthState()) {
            this.setAuthState(
                legacyAuth.isLoggedIn,
                legacyAuth.userType,
                legacyAuth.checkLogin,
            );

            // Xóa legacy keys sau khi migrate
            try {
                localStorage.removeItem("isLoggedIn");
                localStorage.removeItem("userType");
                localStorage.removeItem("checkLogin");
                console.log("Legacy auth migrated successfully");
            } catch (error) {
                console.error("Error removing legacy auth:", error);
            }

            return true;
        }
        return false;
    }

    // Method để refresh session timestamp
    refreshSession() {
        const auth = this.getAuthState();
        if (auth) {
            auth.timestamp = Date.now();
            try {
                localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
                this.currentUser = auth;
            } catch (error) {
                console.error("Error refreshing session:", error);
            }
        }
    }

    // Method để kiểm tra session và auto-refresh
    checkAndRefreshSession() {
        const auth = this.getAuthState();
        if (!auth) return false;

        // Nếu session gần hết hạn (còn 1 giờ), tự động refresh
        const timeUntilExpiry =
            CONFIG.SESSION_TIMEOUT - (Date.now() - auth.timestamp);
        if (timeUntilExpiry < 60 * 60 * 1000 && timeUntilExpiry > 0) {
            this.refreshSession();
            console.log("Session auto-refreshed");
        }

        return this.isValidSession(auth);
    }
}

// =====================================================
// UNIFIED CACHE SYSTEM
// =====================================================

class CacheManager {
    constructor() {
        this.cache = new Map();
        this.maxAge = CONFIG.CACHE_EXPIRY;
        this.stats = {
            hits: 0,
            misses: 0,
            totalRequests: 0,
        };
    }

    set(key, value, type = "general") {
        const cacheKey = `${type}_${key}`;
        const now = Date.now();

        this.cache.set(cacheKey, {
            value: value,
            timestamp: now,
            expires: now + this.maxAge,
            type: type,
        });

        console.log(`Cache set: ${cacheKey}`);
    }

    get(key, type = "general") {
        const cacheKey = `${type}_${key}`;
        const cached = this.cache.get(cacheKey);

        this.stats.totalRequests++;

        if (cached && cached.expires > Date.now()) {
            this.stats.hits++;
            console.log(`Cache hit: ${cacheKey}`);
            return cached.value;
        }

        if (cached) {
            this.cache.delete(cacheKey);
        }

        this.stats.misses++;
        console.log(`Cache miss: ${cacheKey}`);
        return null;
    }

    clear(type = null) {
        if (type) {
            for (const [key, value] of this.cache.entries()) {
                if (value.type === type) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
        }
        console.log(`Cache cleared: ${type || "all"}`);
    }

    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, value] of this.cache.entries()) {
            if (value.expires <= now) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`Cache cleanup: removed ${cleaned} expired entries`);
        }
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            hitRate:
                total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) : 0,
            totalRequests: this.stats.totalRequests,
            cacheSize: this.cache.size,
            ...this.stats,
        };
    }

    invalidate() {
        this.clear();
        this.stats = { hits: 0, misses: 0, totalRequests: 0 };
        console.log("Cache invalidated completely");
    }
}

// Global instances - Initialize in correct order
let authManager;
let cacheManager;

// Initialize auth manager first
authManager = new AuthManager();

// Then initialize cache manager
cacheManager = new CacheManager();

// =====================================================
// FIREBASE CONFIGURATION
// =====================================================

// File metadata for uploads
const uploadMetadata = {
    cacheControl: "public,max-age=31536000",
};

// =====================================================
// LAZY LOADING SYSTEM
// =====================================================

class LazyLoadManager {
    constructor() {
        this.imageQueue = [];
        this.loadingQueue = new Set();
        this.maxConcurrentLoads = CONFIG.MAX_CONCURRENT_LOADS;
        this.isProcessing = false;
        this.loadingProgress = { loaded: 0, total: 0, failed: 0 };

        this.observer = new IntersectionObserver(
            this.handleIntersection.bind(this),
            {
                root: null,
                rootMargin: CONFIG.LAZY_LOAD_MARGIN,
                threshold: [0, 0.1],
            },
        );
    }

    handleIntersection(entries) {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const priority = img.dataset.priority === "high" ? 0 : 1;

                this.queueImageLoad(img, priority);
                this.observer.unobserve(img);
            }
        });

        this.processQueue();
    }

    queueImageLoad(img, priority = 1) {
        const imageData = {
            element: img,
            url: img.dataset.src,
            priority: priority,
            timestamp: Date.now(),
            id: Math.random().toString(36).substr(2, 9),
        };

        // Insert based on priority
        if (priority === 0) {
            this.imageQueue.unshift(imageData);
        } else {
            this.imageQueue.push(imageData);
        }

        this.loadingProgress.total++;
        this.processQueue();
    }

    async processQueue() {
        if (this.isProcessing || this.imageQueue.length === 0) return;
        if (this.loadingQueue.size >= this.maxConcurrentLoads) return;

        this.isProcessing = true;

        while (
            this.imageQueue.length > 0 &&
            this.loadingQueue.size < this.maxConcurrentLoads
        ) {
            const imageData = this.imageQueue.shift();
            this.loadingQueue.add(imageData.id);
            this.loadImage(imageData);
        }

        this.isProcessing = false;
    }

    async loadImage(imageData) {
        const { element, url, id } = imageData;

        try {
            element.classList.add("lazy-loading");

            // Create new image for preloading
            const img = new Image();

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("Image load timeout"));
                }, 15000); // 15 second timeout

                img.onload = () => {
                    clearTimeout(timeout);
                    this.applyImageWithTransition(element, url);
                    this.onImageLoaded(imageData);
                    resolve();
                };

                img.onerror = () => {
                    clearTimeout(timeout);
                    this.onImageError(element, imageData);
                    reject(new Error(`Failed to load image: ${url}`));
                };

                img.src = url;
            });
        } catch (error) {
            console.error("Error loading image:", error);
            this.onImageError(element, imageData);
        }
    }

    applyImageWithTransition(element, url) {
        element.style.opacity = "0";
        element.src = url;

        requestAnimationFrame(() => {
            element.style.transition =
                "opacity 0.3s ease-in-out, transform 0.3s ease";
            element.style.opacity = "1";
            element.style.transform = "scale(1)";
            element.classList.remove("lazy-loading");
            element.classList.add("lazy-loaded");
        });
    }

    onImageLoaded(imageData) {
        this.loadingProgress.loaded++;
        this.loadingQueue.delete(imageData.id);
        this.updateProgressIndicator();
        this.processQueue();
    }

    onImageError(element, imageData) {
        this.loadingProgress.failed++;
        element.classList.remove("lazy-loading");
        element.classList.add("lazy-error");
        element.style.opacity = "0.3";
        element.alt = "Lỗi tải ảnh";

        this.loadingQueue.delete(imageData.id);
        this.processQueue();
    }

    updateProgressIndicator() {
        const { loaded, total, failed } = this.loadingProgress;
        const progress = total > 0 ? ((loaded + failed) / total) * 100 : 0;

        if (total > 0 && loaded + failed < total) {
            const progressText = `Đang tải ảnh... ${loaded}/${total} (${Math.round(progress)}%)`;
            if (window.showNotification) {
                window.showNotification(progressText, "info", 0);
            }
        } else if (loaded + failed === total && total > 0) {
            if (window.hideNotification) {
                window.hideNotification();
            }
            const successText =
                failed > 0
                    ? `Tải ảnh hoàn tất! ${loaded} thành công, ${failed} lỗi`
                    : `Tải ảnh hoàn tất! ${loaded} ảnh`;
            if (window.showNotification) {
                window.showNotification(successText, "success", 2000);
            }
        }
    }

    observe(element, priority = "normal") {
        element.dataset.priority = priority;
        this.observer.observe(element);
    }

    resetProgress() {
        this.loadingProgress = { loaded: 0, total: 0, failed: 0 };
    }

    destroy() {
        this.observer.disconnect();
        this.imageQueue = [];
        this.loadingQueue.clear();
    }
}

// =====================================================
// IMAGE UTILITIES
// =====================================================

class ImageUtils {
    static async compressImage(
        file,
        maxWidth = CONFIG.MAX_IMAGE_SIZE,
        quality = CONFIG.IMAGE_QUALITY,
    ) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = function (event) {
                const img = new Image();
                img.src = event.target.result;
                img.onload = function () {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    let { width, height } = img;

                    // Calculate new dimensions
                    if (width > maxWidth) {
                        const ratio = maxWidth / width;
                        width = maxWidth;
                        height = height * ratio;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    // Enable high-quality scaling
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob(
                        function (blob) {
                            const compressedFile = new File([blob], file.name, {
                                type: file.type,
                                lastModified: Date.now(),
                            });

                            const compressionRatio = (
                                ((file.size - compressedFile.size) /
                                    file.size) *
                                100
                            ).toFixed(1);
                            console.log(
                                `Image compressed: ${file.name}, ${compressionRatio}% reduction`,
                            );

                            resolve(compressedFile);
                        },
                        file.type,
                        quality,
                    );
                };
            };
        });
    }

    static createLazyImageElement(url, priority = "normal") {
        const imgElement = document.createElement("img");
        imgElement.className = "product-image lazy-image";
        imgElement.dataset.src = url;
        imgElement.dataset.priority = priority;

        // Cải thiện style cho hình ảnh trong bảng - THÊM PHẦN NÀY
        Object.assign(imgElement.style, {
            width: "80px",
            height: "80px",
            objectFit: "cover",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.3s ease",
            border: "2px solid transparent",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            display: "block",
            margin: "2px auto",
            verticalAlign: "top", // Giúp hình ảnh dồn lên trên
        });

        // Hover effects - SỬA PHẦN NÀY
        imgElement.addEventListener("mouseenter", function () {
            if (this.classList.contains("lazy-loaded")) {
                this.style.transform = "scale(1.15)"; // Thay đổi từ 1.1 thành 1.15
                this.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15)";
                this.style.zIndex = "10";
                this.style.borderColor = "#2196F3";
            }
        });

        imgElement.addEventListener("mouseleave", function () {
            this.style.transform = "scale(1)";
            this.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
            this.style.zIndex = "1";
            this.style.borderColor = "transparent"; // Thay đổi từ "#e0e0e0" thành "transparent"
        });

        imgElement.alt = "Đang tải...";

        return imgElement;
    }
}

// =====================================================
// FIREBASE OPERATIONS
// =====================================================

class FirebaseManager {
    constructor() {
        this.app = null;
        this.storage = null;
        this.db = null;
        this.init();
    }

    init() {
        try {
            this.app = firebase.initializeApp(firebaseConfig);
            this.storage = firebase.storage();
            this.db = firebase.firestore();
            console.log("Firebase initialized successfully");
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            notificationManager.error("Lỗi kết nối hệ thống");
        }
    }

    getStorageRef() {
        return this.storage.ref();
    }

    async listFolder(path) {
        const cacheKey = `folder_${path}`;
        const cached = cacheManager.get(cacheKey, "folders");

        if (cached) {
            return cached;
        }

        try {
            const result = await this.getStorageRef().child(path).listAll();
            const folderData = {
                items: result.items,
                prefixes: result.prefixes,
                path: path,
            };

            cacheManager.set(cacheKey, folderData, "folders");
            return folderData;
        } catch (error) {
            console.error(`Error listing folder ${path}:`, error);
            return { items: [], prefixes: [], path: path };
        }
    }

    async getImageUrl(imageRef) {
        const cacheKey = `url_${imageRef.fullPath}`;
        const cached = cacheManager.get(cacheKey, "urls");

        if (cached) {
            return cached;
        }

        try {
            const url = await imageRef.getDownloadURL();
            cacheManager.set(cacheKey, url, "urls");
            return url;
        } catch (error) {
            console.error(`Error getting URL for ${imageRef.name}:`, error);
            return null;
        }
    }

    async uploadImage(file, path) {
        try {
            const imageRef = this.getStorageRef().child(path);
            const uploadTask = imageRef.put(file, uploadMetadata);

            return new Promise((resolve, reject) => {
                uploadTask.on(
                    "state_changed",
                    (snapshot) => {
                        const progress =
                            (snapshot.bytesTransferred / snapshot.totalBytes) *
                            100;
                        console.log(`Upload progress: ${progress.toFixed(1)}%`);
                    },
                    (error) => {
                        console.error("Upload error:", error);
                        reject(error);
                    },
                    () => {
                        console.log(`Upload completed: ${path}`);
                        resolve(uploadTask.snapshot);
                    },
                );
            });
        } catch (error) {
            console.error("Upload initiation error:", error);
            throw error;
        }
    }

    async deleteFolder(path) {
        try {
            const folderRef = this.getStorageRef().child(path);
            const result = await folderRef.listAll();

            // Delete all files in batches
            const batchSize = CONFIG.BATCH_SIZE;
            let deletedCount = 0;

            for (let i = 0; i < result.items.length; i += batchSize) {
                const batch = result.items.slice(i, i + batchSize);
                const deletePromises = batch.map(async (fileRef) => {
                    try {
                        await fileRef.delete();
                        deletedCount++;
                        return true;
                    } catch (error) {
                        console.error(`Error deleting ${fileRef.name}:`, error);
                        return false;
                    }
                });

                await Promise.allSettled(deletePromises);

                if (i + batchSize < result.items.length) {
                    notificationManager.show(
                        `Đã xóa ${deletedCount}/${result.items.length} file...`,
                        "info",
                        0,
                        true,
                    );
                    await new Promise((resolve) => setTimeout(resolve, 200)); // Brief pause between batches
                }
            }

            // Delete subfolders recursively
            const subfolderPromises = result.prefixes.map((subFolderRef) =>
                this.deleteFolder(subFolderRef.fullPath),
            );
            await Promise.allSettled(subfolderPromises);

            return { success: true, deletedCount };
        } catch (error) {
            console.error(`Error deleting folder ${path}:`, error);
            return { success: false, error };
        }
    }
}

// =====================================================
// MAIN APPLICATION CLASS
// =====================================================

class ImageManagementApp {
    constructor() {
        this.firebase = null;
        this.lazyLoader = null;
        this.categories = ["shirt", "pants", "dress-set", "accessories"];
        this.pathMapping = {
            Áo: "ao",
            Quần: "quan",
            "Set và Đầm": "setvadam",
            PKGD: "pkgd",
        };

        this.domElements = {};
        this.init();
    }

    async init() {
        // Kiểm tra authentication với system mới
        if (!authManager.isAuthenticated()) {
            console.log("User not authenticated, redirecting to login...");
            this.redirectToLogin();
            return;
        }

        // Auto-refresh session nếu cần
        authManager.checkAndRefreshSession();

        // Migrate legacy auth nếu cần
        authManager.migrateFromLegacy();

        this.initializeFirebase();
        this.initializeLazyLoader();
        this.cacheDOMElements();
        this.setupEventListeners();
        this.updateUserInterface();
        this.injectStyles();
        this.setupControlButtons();

        await this.updateLiveBatchFilterDropdown();
        await this.loadImages();

        // Setup periodic cache cleanup và session check
        setInterval(
            () => {
                cacheManager.cleanup();

                // Kiểm tra session mỗi 5 phút
                if (!authManager.checkAndRefreshSession()) {
                    console.log("Session expired, redirecting to login...");
                    this.redirectToLogin();
                }
            },
            5 * 60 * 1000,
        ); // Every 5 minutes

        console.log("Image Management App initialized successfully");
    }

    initializeFirebase() {
        this.firebase = new FirebaseManager();
    }

    initializeLazyLoader() {
        this.lazyLoader = new LazyLoadManager();
    }

    cacheDOMElements() {
        this.domElements = {
            toggleFormBtn: document.getElementById("toggleFormBtn"),
            dataForm: document.getElementById("dataForm"),
            productForm: document.getElementById("productForm"),
            liveTable: document.querySelector(".inventory-table"),
            liveBatchFilter: document.getElementById("liveBatchFilter"),
            liveBatchInput: document.getElementById("liveBatchInput"),
            categorySelect: document.getElementById("categorySelect"),
            imageFileInput: document.getElementById("imageFileInput"),
            addBtn: document.getElementById("addBtn"),
            clearDataBtn: document.getElementById("clearDataBtn"),
            toggleLogoutBtn: document.getElementById("toggleLogoutBtn"),
            toggleDeleteBtn: document.getElementById("toggleDeleteBtn"),
            liveBatchDisplay: document.getElementById("liveBatchDisplay"),
            parentContainer: document.getElementById("parentContainer"),
        };
    }

    setupEventListeners() {
        // Form toggle
        if (this.domElements.toggleFormBtn) {
            this.domElements.toggleFormBtn.addEventListener("click", () => {
                this.toggleForm();
            });
        }

        // Form submission
        if (this.domElements.productForm) {
            this.domElements.productForm.addEventListener("submit", (e) => {
                this.handleFormSubmit(e);
            });
        }

        // Date filter
        if (this.domElements.liveBatchFilter) {
            this.domElements.liveBatchFilter.addEventListener("change", () => {
                this.handleLiveBatchFilterChange();
            });
        }

        // Clear form
        if (this.domElements.clearDataBtn) {
            this.domElements.clearDataBtn.addEventListener("click", () => {
                this.clearForm();
            });
        }

        // Logout
        if (this.domElements.toggleLogoutBtn) {
            this.domElements.toggleLogoutBtn.addEventListener("click", () => {
                this.handleLogout();
            });
        }

        // Delete
        if (this.domElements.toggleDeleteBtn) {
            this.domElements.toggleDeleteBtn.addEventListener("click", () => {
                this.handleDelete();
            });
        }
    }

    updateUserInterface() {
        const userInfo = authManager.getUserInfo();
        if (userInfo && userInfo.displayName) {
            const titleElement = document.querySelector(".page-title");
            if (titleElement) {
                titleElement.textContent += " - " + userInfo.displayName;
            }
        }

        if (this.domElements.parentContainer) {
            this.domElements.parentContainer.style.display = "flex";
            this.domElements.parentContainer.style.justifyContent = "center";
            this.domElements.parentContainer.style.alignItems = "center";
        }
    }

    redirectToLogin() {
        console.log("User not authenticated, redirecting to login...");
        window.location.href = "../index.html";
    }

    toggleForm() {
        if (authManager.hasPermission(777)) {
            const isHidden =
                this.domElements.dataForm.style.display === "none" ||
                this.domElements.dataForm.style.display === "";
            this.domElements.dataForm.style.display = isHidden
                ? "block"
                : "none";
            this.domElements.toggleFormBtn.textContent = isHidden
                ? "Ẩn biểu mẫu"
                : "Hiện biểu mẫu";
        } else {
            notificationManager.error("Không có quyền truy cập form");
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        if (!authManager.hasPermission(3)) {
            notificationManager.error("Không có quyền upload ảnh");
            return;
        }

        // Refresh session trước khi thực hiện action quan trọng
        authManager.refreshSession();

        if (this.domElements.addBtn) {
            this.domElements.addBtn.disabled = true;
        }

        try {
            const category = this.domElements.categorySelect?.value;
            const liveBatchValue = this.domElements.liveBatchInput?.value;

            if (!liveBatchValue) {
                notificationManager.error("Vui lòng chọn một đợt Live");
                return;
            }

            if (!category || !this.pathMapping[category]) {
                notificationManager.error("Vui lòng chọn phân loại hợp lệ");
                return;
            }

            const uploadPath = `live/${liveBatchValue}/${this.pathMapping[category]}/`;
            const files = this.domElements.imageFileInput?.files;

            if (!files || files.length === 0) {
                notificationManager.error("Vui lòng chọn ít nhất một hình ảnh");
                return;
            }

            await this.uploadImages(files, uploadPath);
        } catch (error) {
            console.error("Form submission error:", error);
            notificationManager.error("Lỗi khi xử lý form");
        } finally {
            if (this.domElements.addBtn) {
                this.domElements.addBtn.disabled = false;
            }
        }
    }

    async uploadImages(files, uploadPath) {
        notificationManager.loading(`Đang xử lý ${files.length} ảnh...`);

        try {
            let uploadedCount = 0;
            const totalFiles = files.length;
            const errors = [];

            // Process in batches
            for (let i = 0; i < totalFiles; i += CONFIG.BATCH_SIZE) {
                const batch = Array.from(files).slice(i, i + CONFIG.BATCH_SIZE);

                const batchPromises = batch.map(async (file, index) => {
                    try {
                        // Validate file
                        if (!this.validateImageFile(file)) {
                            throw new Error(`File không hợp lệ: ${file.name}`);
                        }

                        // Compress image
                        const compressedFile =
                            await ImageUtils.compressImage(file);
                        const filePath = uploadPath + compressedFile.name;

                        // Upload to Firebase
                        await this.firebase.uploadImage(
                            compressedFile,
                            filePath,
                        );

                        uploadedCount++;
                        notificationManager.show(
                            `Đã tải ${uploadedCount}/${totalFiles} ảnh`,
                            "info",
                            0,
                            true,
                        );

                        return { success: true, file: file.name };
                    } catch (error) {
                        console.error(`Error processing ${file.name}:`, error);
                        errors.push({ file: file.name, error: error.message });
                        return { success: false, file: file.name, error };
                    }
                });

                await Promise.allSettled(batchPromises);

                // Brief pause between batches
                if (i + CONFIG.BATCH_SIZE < totalFiles) {
                    await new Promise((resolve) => setTimeout(resolve, 300));
                }
            }

            // Clear cache and reload
            cacheManager.invalidate();

            notificationManager.clear();

            if (errors.length > 0) {
                notificationManager.warning(
                    `Upload hoàn tất với ${errors.length} lỗi. Đã tải ${uploadedCount}/${totalFiles} ảnh`,
                );
                console.warn("Upload errors:", errors);
            } else {
                notificationManager.success("Upload hoàn tất thành công!");
            }

            // Reload page after delay
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } catch (error) {
            console.error("Upload process error:", error);
            notificationManager.error("Lỗi trong quá trình upload");
        }
    }

    validateImageFile(file) {
        // Check file type
        const allowedTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
        ];
        if (!allowedTypes.includes(file.type)) {
            return false;
        }

        // Check file size (max 10MB)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            return false;
        }

        return true;
    }

    handleLiveBatchFilterChange() {
        const selectedBatch = this.domElements.liveBatchFilter?.value;

        if (selectedBatch === "all") {
            if (this.domElements.liveBatchDisplay) {
                this.domElements.liveBatchDisplay.textContent = "Tất cả";
            }
            this.showAllTableRows();
        } else {
            if (this.domElements.liveBatchDisplay) {
                this.domElements.liveBatchDisplay.textContent = selectedBatch;
            }
            this.filterTableRows(selectedBatch);
        }

        this.loadImages();
    }

    showAllTableRows() {
        if (!this.domElements.liveTable) return;

        for (const row of this.domElements.liveTable.rows) {
            if (row.cells[0] && row.cells[0].textContent !== "ĐỢT LIVE") {
                row.style.display = "table-row";
            }
        }
    }

    filterTableRows(selectedBatch) {
        if (!this.domElements.liveTable) return;

        for (const row of this.domElements.liveTable.rows) {
            if (row.cells[0] && row.cells[0].textContent !== "ĐỢT LIVE") {
                const rowBatch = row.cells[0].textContent;
                row.style.display =
                    selectedBatch === rowBatch ? "table-row" : "none";
            }
        }
    }

    async loadImages() {
        this.lazyLoader.resetProgress();

        const selectedBatch = this.domElements.liveBatchFilter?.value || "all";
        const cacheKey = `import_${selectedBatch}`;

        // Check cache first
        const cachedData = cacheManager.get(cacheKey, "images");
        if (cachedData) {
            notificationManager.loading("Sử dụng dữ liệu cache...");
            this.renderImagesFromCache(cachedData);
            notificationManager.success("Tải hình ảnh từ cache hoàn tất!");
            return;
        }

        // Clear existing images
        this.clearAllImageContainers();

        try {
            const liveFolder = await this.firebase.listFolder("live/");

            if (liveFolder.prefixes.length === 0) {
                notificationManager.error("Không tìm thấy dữ liệu");
                return;
            }

            const batchesToProcess =
                selectedBatch === "all"
                    ? liveFolder.prefixes.map((folderRef) => folderRef.name)
                    : [selectedBatch];

            const imageData = {};

            // Process dates with limited concurrency
            for (const batch of batchesToProcess) {
                await this.processBatchImages(batch, imageData);
            }

            // Cache the results
            cacheManager.set(cacheKey, imageData, "images");

            notificationManager.success("Tải hình ảnh hoàn tất!");

            // Log performance stats
            const stats = cacheManager.getStats();
            console.log(
                `Cache stats - Hit rate: ${stats.hitRate}%, Size: ${stats.cacheSize}`,
            );
        } catch (error) {
            console.error("Error loading images:", error);
            notificationManager.error("Lỗi khi tải hình ảnh");
        }
    }

    async processBatchImages(batch, imageData) {
        const categoryPromises = this.categories.map(async (category) => {
            try {
                const urls = await this.loadCategoryImages(category, batch);
                if (!imageData[category]) {
                    imageData[category] = [];
                }
                imageData[category] = imageData[category].concat(urls || []);
            } catch (error) {
                console.error(
                    `Error loading ${category} images for ${batch}:`,
                    error,
                );
            }
        });

        await Promise.allSettled(categoryPromises);
    }

    async loadCategoryImages(category, batch) {
        const path = `live/${batch}/${this.getCategoryPath(category)}/`;
        const imageContainer = document.querySelector(
            `.${category}-product-row`,
        );

        if (!imageContainer) {
            console.warn(`Image container not found for category: ${category}`);
            return [];
        }

        try {
            const cacheKey = `images_${path}`;
            let imageUrls = cacheManager.get(cacheKey, "urls");

            if (!imageUrls) {
                const folderData = await this.firebase.listFolder(path);
                imageUrls = [];

                // Get URLs in batches
                const batchSize = 5;
                for (let i = 0; i < folderData.items.length; i += batchSize) {
                    const batch = folderData.items.slice(i, i + batchSize);
                    const batchPromises = batch.map((imageRef) =>
                        this.firebase.getImageUrl(imageRef),
                    );

                    const batchResults =
                        await Promise.allSettled(batchPromises);
                    batchResults.forEach((result) => {
                        if (result.status === "fulfilled" && result.value) {
                            imageUrls.push(result.value);
                        }
                    });
                }

                cacheManager.set(cacheKey, imageUrls, "urls");
            }

            // Render images
            imageUrls.reverse().forEach((url, index) => {
                const priority = index < 6 ? "high" : "normal";
                const imgElement = ImageUtils.createLazyImageElement(
                    url,
                    priority,
                );
                imageContainer.appendChild(imgElement);
                this.lazyLoader.observe(imgElement, priority);
            });

            return imageUrls;
        } catch (error) {
            console.error(`Error loading images for ${category}:`, error);
            return [];
        }
    }

    getCategoryPath(category) {
        const pathMap = {
            shirt: "ao",
            pants: "quan",
            "dress-set": "setvadam",
            accessories: "pkgd",
        };
        return pathMap[category] || category;
    }

    renderImagesFromCache(imageData) {
        Object.keys(imageData).forEach((category) => {
            const imageContainer = document.querySelector(
                `.${category}-product-row`,
            );
            if (imageContainer && imageData[category]) {
                imageData[category].forEach((url, index) => {
                    const priority = index < 6 ? "high" : "normal";
                    const imgElement = ImageUtils.createLazyImageElement(
                        url,
                        priority,
                    );
                    imageContainer.appendChild(imgElement);
                    this.lazyLoader.observe(imgElement, priority);
                });
            }
        });
    }

    clearAllImageContainers() {
        this.categories.forEach((category) => {
            const imageContainer = document.querySelector(
                `.${category}-product-row`,
            );
            if (imageContainer) {
                imageContainer.innerHTML = "";
            }
        });
    }

    clearForm() {
        if (this.domElements.productForm) {
            this.domElements.productForm.reset();
        }
    }

    handleLogout() {
        authManager.logout(); // Sử dụng method có confirmation built-in
    }

    async handleDelete() {
        if (!authManager.hasPermission(0)) {
            notificationManager.error("Không đủ quyền để xóa!");
            return;
        }

        // Refresh session trước khi thực hiện action quan trọng
        authManager.refreshSession();

        const selectedBatch = this.domElements.liveBatchFilter?.value;
        if (!selectedBatch || selectedBatch === "all") {
            notificationManager.error(
                "Vui lòng chọn một đợt live cụ thể để xóa",
            );
            return;
        }

        const confirmDelete = confirm(
            `Bạn có chắc chắn muốn xóa đợt live ${selectedBatch}? Hành động này không thể hoàn tác.`,
        );
        if (!confirmDelete) return;

        notificationManager.loading("Đang xóa dữ liệu...");

        try {
            const result = await this.firebase.deleteFolder(
                `live/${selectedBatch}`,
            );

            if (result.success) {
                cacheManager.invalidate();
                notificationManager.success(
                    `Đã xóa thành công ${result.deletedCount} file!`,
                );
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            } else {
                notificationManager.error("Lỗi khi xóa dữ liệu");
            }
        } catch (error) {
            console.error("Delete operation error:", error);
            notificationManager.error("Lỗi khi xóa dữ liệu");
        }
    }

    async updateLiveBatchFilterDropdown() {
        if (!this.domElements.liveBatchFilter) return;

        // Clear existing options except "Tất cả"
        while (this.domElements.liveBatchFilter.options.length > 1) {
            this.domElements.liveBatchFilter.remove(1);
        }

        try {
            const liveFolder = await this.firebase.listFolder("live/");
            const batches = liveFolder.prefixes.map(
                (folderRef) => folderRef.name,
            );

            batches
                .sort()
                .reverse()
                .forEach((batch) => {
                    const option = document.createElement("option");
                    option.value = batch;
                    option.textContent = batch;
                    this.domElements.liveBatchFilter.appendChild(option);
                });

            if (this.domElements.liveBatchInput) {
                this.domElements.liveBatchInput.value =
                    batches.length > 0 ? batches[0] : "1";
            }
        } catch (error) {
            console.error("Error updating live batch filter dropdown:", error);
            notificationManager.error("Lỗi khi tải danh sách ngày");
        }
    }

    setupControlButtons() {
        const controlsContainer = document.createElement("div");
        controlsContainer.style.cssText = `
            display: flex;
            gap: 10px;
            margin: 15px 0;
            flex-wrap: wrap;
            justify-content: center;
        `;
    }

    forceRefresh() {
        cacheManager.invalidate();
        this.lazyLoader.resetProgress();
        this.clearAllImageContainers();
        this.loadImages();
        notificationManager.success("Đã làm mới dữ liệu!");
    }

    showPerformanceStats() {
        const stats = cacheManager.getStats();
        const lazyStats = this.lazyLoader.loadingProgress;

        const message = `
Cache: ${stats.hitRate}% hit rate (${stats.cacheSize} entries)
Ảnh: ${lazyStats.loaded}/${lazyStats.total} loaded${lazyStats.failed > 0 ? `, ${lazyStats.failed} failed` : ""}
        `.trim();

        notificationManager.show(message, "info", 4000);
    }

    clearCache() {
        const confirmClear = confirm("Bạn có chắc muốn xóa toàn bộ cache?");
        if (confirmClear) {
            cacheManager.invalidate();
            notificationManager.success("Cache đã được xóa hoàn toàn!");
        }
    }

    injectStyles() {
        if (document.getElementById("app-styles")) return;

        const style = document.createElement("style");
        style.id = "app-styles";
        style.textContent = `
        .lazy-image {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .lazy-loading {
            opacity: 0.6;
            animation: pulse 1.5s ease-in-out infinite;
        }
        
        .lazy-loaded {
            opacity: 1;
            transform: scale(1);
        }
        
        .lazy-error {
            opacity: 0.3;
            filter: grayscale(1);
            border: 2px dashed #dc3545;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 0.8; }
        }
        
        .category-section {
            margin: 20px 0;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #007bff;
        }
        
        /* THÊM PHẦN NÀY - Cải thiện style cho product-row containers */
        .shirt-product-row,
        .pants-product-row, 
        .dress-set-product-row,
        .accessories-product-row {
            vertical-align: top !important;
            padding: 8px !important;
            min-height: 100px;
        }
        
        /* Đảm bảo images được align properly */
        .product-image {
            vertical-align: top !important;
            margin: 2px !important;
            display: inline-block !important;
        }
    `;
        document.head.appendChild(style);
    }
}
