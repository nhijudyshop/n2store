/**
 * Optimized Device Detection & CSS Loader
 * Eliminates flash of unstyled content (FOUC)
 */

(function () {
    "use strict";

    // Configuration
    const CONFIG = {
        CSS_FILES: {
            desktop: "../css/main.css",
            mobile: "../css/mobile.css",
        },
        MOBILE_MAX_WIDTH: 768,
        MOBILE_PATTERNS: [
            /Android/i,
            /iPhone/i,
            /iPad/i,
            /iPod/i,
            /BlackBerry/i,
            /Windows Phone/i,
            /Opera Mini/i,
            /IEMobile/i,
            /Mobile/i,
            /Tablet/i,
        ],
        DEBUG: false,
    };

    // Quick device detection (runs immediately)
    function quickDetectMobile() {
        const width =
            window.innerWidth || document.documentElement.clientWidth || 768;
        const userAgent = navigator.userAgent;
        const hasTouch =
            "ontouchstart" in window || navigator.maxTouchPoints > 0;

        const isSmallScreen = width <= CONFIG.MOBILE_MAX_WIDTH;
        const isMobileUserAgent = CONFIG.MOBILE_PATTERNS.some((pattern) =>
            pattern.test(userAgent),
        );
        const isiPad =
            /iPad/i.test(userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

        return (
            isSmallScreen ||
            (isMobileUserAgent && !isiPad) ||
            (hasTouch && isSmallScreen)
        );
    }

    // Load CSS immediately and synchronously if possible
    function loadCSSImmediate(href, id) {
        // Check if CSS already exists
        const existingLink = document.getElementById(id);
        if (existingLink) return Promise.resolve();

        return new Promise((resolve, reject) => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.type = "text/css";
            link.href = href;
            link.id = id;

            // Add preload hint for faster loading
            link.as = "style";

            // Critical: Add to head immediately
            const head =
                document.head || document.getElementsByTagName("head")[0];

            // Insert at the beginning for higher priority
            if (head.firstChild) {
                head.insertBefore(link, head.firstChild);
            } else {
                head.appendChild(link);
            }

            link.onload = () => {
                if (CONFIG.DEBUG) console.log(`CSS loaded: ${href}`);
                resolve();
            };

            link.onerror = () => {
                console.error(`Failed to load CSS: ${href}`);
                // Don't reject, continue anyway
                resolve();
            };
        });
    }

    // Hide body until CSS is loaded
    function hideBodyUntilStyled() {
        const style = document.createElement("style");
        style.id = "loading-hide";
        style.textContent = `
            body { 
                visibility: hidden !important; 
                opacity: 0 !important;
                transition: opacity 0.3s ease !important;
            }
            body.css-loaded { 
                visibility: visible !important; 
                opacity: 1 !important; 
            }
        `;

        const head = document.head || document.getElementsByTagName("head")[0];
        head.insertBefore(style, head.firstChild);
    }

    // Show body after CSS is loaded
    function showBody() {
        document.body.classList.add("css-loaded");

        // Remove loading hide style after transition
        setTimeout(() => {
            const loadingStyle = document.getElementById("loading-hide");
            if (loadingStyle) {
                loadingStyle.remove();
            }
        }, 300);
    }

    // Immediate execution before DOM is ready
    function preloadCSS() {
        const isMobile = quickDetectMobile();
        const cssFile = isMobile
            ? CONFIG.CSS_FILES.mobile
            : CONFIG.CSS_FILES.desktop;
        const cssId = isMobile ? "mobile-css" : "desktop-css";

        // Hide body to prevent FOUC
        hideBodyUntilStyled();

        // Add device class immediately
        if (document.body) {
            document.body.classList.add(
                isMobile ? "device-mobile" : "device-desktop",
            );
        } else {
            // If body doesn't exist yet, add when it does
            const addClassWhenReady = () => {
                if (document.body) {
                    document.body.classList.add(
                        isMobile ? "device-mobile" : "device-desktop",
                    );
                } else {
                    requestAnimationFrame(addClassWhenReady);
                }
            };
            addClassWhenReady();
        }

        // Load CSS immediately
        loadCSSImmediate(cssFile, cssId).then(() => {
            // Show body after a brief moment to ensure CSS is applied
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    showBody();
                });
            });
        });

        if (CONFIG.DEBUG) {
            console.log(
                `Preloading ${isMobile ? "mobile" : "desktop"} CSS: ${cssFile}`,
            );
        }
    }

    // Full device detector class (for post-load functionality)
    class DeviceDetector {
        constructor() {
            this.screenWidth =
                window.innerWidth || document.documentElement.clientWidth;
            this.screenHeight =
                window.innerHeight || document.documentElement.clientHeight;
            this.userAgent = navigator.userAgent;
            this.hasTouch =
                "ontouchstart" in window || navigator.maxTouchPoints > 0;
            this.isMobile = quickDetectMobile();
            this.isTablet = this.detectTablet();
        }

        detectTablet() {
            const isiPad =
                /iPad/i.test(this.userAgent) ||
                (navigator.platform === "MacIntel" &&
                    navigator.maxTouchPoints > 1);
            const isAndroidTablet =
                /Android/i.test(this.userAgent) &&
                !/Mobile/i.test(this.userAgent);
            const isLargeScreen =
                this.screenWidth > CONFIG.MOBILE_MAX_WIDTH &&
                this.screenWidth <= 1024;

            return (
                isiPad || isAndroidTablet || (isLargeScreen && this.hasTouch)
            );
        }

        getDeviceType() {
            if (this.isMobile) return "mobile";
            if (this.isTablet) return "tablet";
            return "desktop";
        }

        shouldUseMobileCSS() {
            return (
                this.isMobile ||
                (this.isTablet && this.screenWidth <= CONFIG.MOBILE_MAX_WIDTH)
            );
        }
    }

    // Main responsive loader (simplified for post-load)
    class ResponsiveCSSLoader {
        constructor() {
            this.detector = new DeviceDetector();
            this.currentCSS = this.detector.shouldUseMobileCSS()
                ? CONFIG.CSS_FILES.mobile
                : CONFIG.CSS_FILES.desktop;
        }

        async init() {
            this.setupEventListeners();
            this.updateDeviceClasses();

            if (CONFIG.DEBUG) {
                console.log("ResponsiveCSSLoader initialized");
                this.showDebugInfo();
            }
        }

        setupEventListeners() {
            let resizeTimeout;

            window.addEventListener("resize", () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    this.handleResize();
                }, 250);
            });

            window.addEventListener("orientationchange", () => {
                setTimeout(() => {
                    this.handleResize();
                }, 100);
            });
        }

        async handleResize() {
            const oldDetector = this.detector;
            this.detector = new DeviceDetector();

            const oldShouldUseMobile = oldDetector.shouldUseMobileCSS();
            const newShouldUseMobile = this.detector.shouldUseMobileCSS();

            if (oldShouldUseMobile !== newShouldUseMobile) {
                if (CONFIG.DEBUG) {
                    console.log(
                        `Device type changed: ${oldShouldUseMobile ? "mobile" : "desktop"} → ${newShouldUseMobile ? "mobile" : "desktop"}`,
                    );
                }

                await this.switchCSS(newShouldUseMobile);
                this.updateDeviceClasses();

                window.dispatchEvent(
                    new CustomEvent("deviceTypeChanged", {
                        detail: {
                            oldType: oldShouldUseMobile ? "mobile" : "desktop",
                            newType: newShouldUseMobile ? "mobile" : "desktop",
                            detector: this.detector,
                        },
                    }),
                );
            }
        }

        async switchCSS(useMobile) {
            const newCssFile = useMobile
                ? CONFIG.CSS_FILES.mobile
                : CONFIG.CSS_FILES.desktop;
            const newCssId = useMobile ? "mobile-css" : "desktop-css";
            const oldCssId = useMobile ? "desktop-css" : "mobile-css";

            // Remove old CSS
            const oldLink = document.getElementById(oldCssId);
            if (oldLink) oldLink.remove();

            // Load new CSS
            await loadCSSImmediate(newCssFile, newCssId);
            this.currentCSS = newCssFile;
        }

        updateDeviceClasses() {
            const body = document.body;
            const deviceType = this.detector.getDeviceType();

            // Remove existing classes
            body.classList.remove(
                "device-mobile",
                "device-tablet",
                "device-desktop",
            );
            body.classList.remove(
                "has-touch",
                "no-touch",
                "screen-small",
                "screen-medium",
                "screen-large",
            );

            // Add new classes
            body.classList.add(`device-${deviceType}`);
            body.classList.add(
                this.detector.hasTouch ? "has-touch" : "no-touch",
            );

            // Screen size classes
            if (this.detector.screenWidth <= 480) {
                body.classList.add("screen-small");
            } else if (this.detector.screenWidth <= 768) {
                body.classList.add("screen-medium");
            } else {
                body.classList.add("screen-large");
            }
        }

        getDeviceInfo() {
            return {
                type: this.detector.getDeviceType(),
                isMobile: this.detector.isMobile,
                isTablet: this.detector.isTablet,
                hasTouch: this.detector.hasTouch,
                screenWidth: this.detector.screenWidth,
                screenHeight: this.detector.screenHeight,
                currentCSS: this.currentCSS,
            };
        }

        async forceLoadCSS(type) {
            if (!["mobile", "desktop"].includes(type)) {
                throw new Error('Invalid CSS type. Use "mobile" or "desktop".');
            }

            const useMobile = type === "mobile";
            await this.switchCSS(useMobile);

            // Update body classes
            document.body.classList.remove(
                "device-mobile",
                "device-tablet",
                "device-desktop",
            );
            document.body.classList.add(`device-${type}`);

            if (CONFIG.DEBUG) {
                console.log(`Force loaded ${type} CSS`);
            }
        }

        showDebugInfo() {
            console.table({
                "Device Type": this.detector.getDeviceType(),
                "Is Mobile": this.detector.isMobile,
                "Is Tablet": this.detector.isTablet,
                "Has Touch": this.detector.hasTouch,
                "Screen Size": `${this.detector.screenWidth}x${this.detector.screenHeight}`,
                "Current CSS": this.currentCSS,
            });
        }
    }

    // Execute CSS preload immediately (before DOM ready)
    preloadCSS();

    // Initialize full functionality when DOM is ready
    function initWhenReady() {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
                window.responsiveCSSLoader = new ResponsiveCSSLoader();
                window.responsiveCSSLoader.init();
            });
        } else {
            window.responsiveCSSLoader = new ResponsiveCSSLoader();
            window.responsiveCSSLoader.init();
        }
    }

    // Public API
    window.ResponsiveCSSLoader = ResponsiveCSSLoader;
    window.DeviceDetector = DeviceDetector;

    // Initialize
    initWhenReady();

    // Utility functions
    window.loadMobileCSS = function () {
        if (window.responsiveCSSLoader) {
            return window.responsiveCSSLoader.forceLoadCSS("mobile");
        }
    };

    window.loadDesktopCSS = function () {
        if (window.responsiveCSSLoader) {
            return window.responsiveCSSLoader.forceLoadCSS("desktop");
        }
    };

    window.getDeviceInfo = function () {
        if (window.responsiveCSSLoader) {
            return window.responsiveCSSLoader.getDeviceInfo();
        }
        return null;
    };

    window.enableCSSLoaderDebug = function () {
        CONFIG.DEBUG = true;
        console.log("CSS Loader debug mode enabled");
        if (window.responsiveCSSLoader) {
            window.responsiveCSSLoader.showDebugInfo();
        }
    };

    // ==================== TOP BUTTONS MOBILE TOGGLE HANDLER ====================
    // Top Buttons Mobile Toggle Handler - Fixed Version
    document.addEventListener("DOMContentLoaded", function () {
        const topButtons = document.querySelector(".top-buttons");
        if (!topButtons) return;

        let isExpanded = false;
        let expandTimeout = null;

        // Chỉ áp dụng cho mobile - Sử dụng device detection từ trên
        function isMobile() {
            if (window.responsiveCSSLoader) {
                return window.responsiveCSSLoader.getDeviceInfo().isMobile;
            }
            return window.innerWidth <= 768;
        }

        // Toggle menu trên mobile
        function toggleTopButtonsMenu(force = null) {
            if (!isMobile()) return;

            // Clear existing timeout
            if (expandTimeout) {
                clearTimeout(expandTimeout);
                expandTimeout = null;
            }

            if (force !== null) {
                isExpanded = force;
            } else {
                isExpanded = !isExpanded;
            }

            if (isExpanded) {
                topButtons.classList.add("expanded");
                // Auto close sau 8 giây thay vì 5 giây
                expandTimeout = setTimeout(() => {
                    toggleTopButtonsMenu(false);
                }, 8000);
            } else {
                topButtons.classList.remove("expanded");
            }
        }

        // FIXED: Single click handler cho container
        topButtons.addEventListener("click", function (e) {
            if (!isMobile()) return;

            const clickedButton = e.target.closest("button");

            // Nếu menu chưa mở và click vào container hoặc icon
            if (!isExpanded) {
                // Ngăn button actions khi menu chưa mở
                if (clickedButton) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                toggleTopButtonsMenu(true);
                return;
            }

            // Nếu menu đã mở và click vào button thật sự
            if (clickedButton && isExpanded) {
                // Cho phép button được click
                toggleTopButtonsMenu(false); // Đóng menu sau khi click button
                // Button action sẽ được execute bình thường
                return;
            }

            // Click vào vùng trống trong expanded menu - không làm gì
            if (e.target === topButtons) {
                e.stopPropagation();
            }
        });

        // Đóng menu khi click bên ngoài
        document.addEventListener("click", function (e) {
            if (!isMobile() || !isExpanded) return;

            if (!topButtons.contains(e.target)) {
                toggleTopButtonsMenu(false);
            }
        });

        // Đóng menu khi resize về desktop
        window.addEventListener("resize", function () {
            if (!isMobile() && isExpanded) {
                toggleTopButtonsMenu(false);
            }
        });

        // ESC key để đóng menu
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && isMobile() && isExpanded) {
                toggleTopButtonsMenu(false);
            }
        });

        // Touch events cho mobile tốt hơn
        if ("ontouchstart" in window) {
            let touchStartTime = 0;

            topButtons.addEventListener("touchstart", function (e) {
                if (!isMobile()) return;
                touchStartTime = Date.now();
            });

            topButtons.addEventListener("touchend", function (e) {
                if (!isMobile()) return;

                const touchDuration = Date.now() - touchStartTime;
                const clickedButton = e.target.closest("button");

                // Quick tap to toggle menu or click button
                if (touchDuration < 300) {
                    if (!isExpanded && !clickedButton) {
                        e.preventDefault();
                        toggleTopButtonsMenu(true);
                    } else if (isExpanded && clickedButton) {
                        // Button sẽ được click tự nhiên
                        setTimeout(() => {
                            toggleTopButtonsMenu(false);
                        }, 100);
                    }
                }
            });
        }

        console.log("Top Buttons Mobile Handler initialized - Fixed Version");
    });

    // Utility function để tạo top-buttons programmatically
    window.createTopButtons = function (buttons) {
        const topButtonsContainer = document.createElement("div");
        topButtonsContainer.className = "top-buttons";

        buttons.forEach((btn, index) => {
            const button = document.createElement("button");
            button.setAttribute("data-icon", btn.icon || "⚡");
            button.textContent = btn.text || `Button ${index + 1}`;

            if (btn.onclick) {
                button.addEventListener("click", btn.onclick);
            }

            topButtonsContainer.appendChild(button);
        });

        document.body.appendChild(topButtonsContainer);
        return topButtonsContainer;
    };
})();
