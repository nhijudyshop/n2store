/**
 * Device Detection & CSS Loader
 * Automatically detects device type and loads appropriate CSS file
 */

(function () {
    "use strict";

    // Device detection configuration
    const CONFIG = {
        // CSS file paths
        CSS_FILES: {
            desktop: "../css/main.css", // Đường dẫn đến CSS desktop
            mobile: "../css/mobile.css", // Đường dẫn đến CSS mobile
        },

        // Detection thresholds
        MOBILE_MAX_WIDTH: 768,
        MOBILE_MAX_HEIGHT: 1024,

        // User agent patterns for mobile devices
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

        // Debug mode
        DEBUG: false,
    };

    // Device detection class
    class DeviceDetector {
        constructor() {
            this.isMobile = false;
            this.isTablet = false;
            this.screenWidth =
                window.innerWidth || document.documentElement.clientWidth;
            this.screenHeight =
                window.innerHeight || document.documentElement.clientHeight;
            this.userAgent = navigator.userAgent;
            this.hasTouch =
                "ontouchstart" in window || navigator.maxTouchPoints > 0;

            this.detect();
        }

        /**
         * Main detection method
         */
        detect() {
            this.isMobile = this.detectMobile();
            this.isTablet = this.detectTablet();

            if (CONFIG.DEBUG) {
                console.log("Device Detection Results:", {
                    isMobile: this.isMobile,
                    isTablet: this.isTablet,
                    screenWidth: this.screenWidth,
                    screenHeight: this.screenHeight,
                    hasTouch: this.hasTouch,
                    userAgent: this.userAgent,
                });
            }
        }

        /**
         * Detect if device is mobile
         */
        detectMobile() {
            // Check screen size
            const isSmallScreen = this.screenWidth <= CONFIG.MOBILE_MAX_WIDTH;

            // Check user agent
            const isMobileUserAgent = CONFIG.MOBILE_PATTERNS.some((pattern) =>
                pattern.test(this.userAgent),
            );

            // Check for touch support
            const hasTouch = this.hasTouch;

            // Special cases
            const isiPad =
                /iPad/i.test(this.userAgent) ||
                (navigator.platform === "MacIntel" &&
                    navigator.maxTouchPoints > 1);

            // Combine all checks
            return (
                isSmallScreen ||
                (isMobileUserAgent && !isiPad) ||
                (hasTouch && isSmallScreen)
            );
        }

        /**
         * Detect if device is tablet
         */
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

        /**
         * Get device type
         */
        getDeviceType() {
            if (this.isMobile) return "mobile";
            if (this.isTablet) return "tablet";
            return "desktop";
        }

        /**
         * Check if should use mobile CSS
         */
        shouldUseMobileCSS() {
            return (
                this.isMobile ||
                (this.isTablet && this.screenWidth <= CONFIG.MOBILE_MAX_WIDTH)
            );
        }
    }

    // CSS Loader class
    class CSSLoader {
        constructor() {
            this.loadedCSS = new Set();
        }

        /**
         * Load CSS file dynamically
         */
        loadCSS(href, id = null) {
            return new Promise((resolve, reject) => {
                // Check if already loaded
                if (this.loadedCSS.has(href)) {
                    if (CONFIG.DEBUG)
                        console.log(`CSS already loaded: ${href}`);
                    resolve();
                    return;
                }

                // Create link element
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.type = "text/css";
                link.href = href;

                if (id) {
                    link.id = id;
                }

                // Handle load events
                link.onload = () => {
                    this.loadedCSS.add(href);
                    if (CONFIG.DEBUG)
                        console.log(`CSS loaded successfully: ${href}`);
                    resolve();
                };

                link.onerror = () => {
                    console.error(`Failed to load CSS: ${href}`);
                    reject(new Error(`Failed to load CSS: ${href}`));
                };

                // Add to document head
                document.head.appendChild(link);
            });
        }

        /**
         * Remove CSS file
         */
        removeCSS(selector) {
            const elements = document.querySelectorAll(selector);
            elements.forEach((element) => {
                if (element && element.parentNode) {
                    element.parentNode.removeChild(element);
                    if (CONFIG.DEBUG) console.log(`CSS removed: ${selector}`);
                }
            });
        }

        /**
         * Replace CSS file
         */
        async replaceCSS(oldSelector, newHref, newId = null) {
            this.removeCSS(oldSelector);
            await this.loadCSS(newHref, newId);
        }
    }

    // Main application class
    class ResponsiveCSSLoader {
        constructor() {
            this.detector = new DeviceDetector();
            this.loader = new CSSLoader();
            this.currentCSS = null;
            this.isInitialized = false;
        }

        /**
         * Initialize the loader
         */
        async init() {
            if (this.isInitialized) return;

            try {
                await this.loadAppropriateCSS();
                this.setupEventListeners();
                this.addDeviceClasses();
                this.isInitialized = true;

                if (CONFIG.DEBUG) {
                    console.log("ResponsiveCSSLoader initialized successfully");
                    this.showDebugInfo();
                }
            } catch (error) {
                console.error(
                    "Failed to initialize ResponsiveCSSLoader:",
                    error,
                );
            }
        }

        /**
         * Load appropriate CSS based on device
         */
        async loadAppropriateCSS() {
            const shouldUseMobile = this.detector.shouldUseMobileCSS();
            const cssFile = shouldUseMobile
                ? CONFIG.CSS_FILES.mobile
                : CONFIG.CSS_FILES.desktop;
            const cssId = shouldUseMobile ? "mobile-css" : "desktop-css";

            // Remove any existing CSS
            this.loader.removeCSS('link[id*="-css"]');

            // Load new CSS
            await this.loader.loadCSS(cssFile, cssId);
            this.currentCSS = cssFile;

            if (CONFIG.DEBUG) {
                console.log(
                    `Loaded ${shouldUseMobile ? "mobile" : "desktop"} CSS: ${cssFile}`,
                );
            }
        }

        /**
         * Setup event listeners
         */
        setupEventListeners() {
            let resizeTimeout;

            // Handle window resize with debouncing
            window.addEventListener("resize", () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    this.handleResize();
                }, 250);
            });

            // Handle orientation change
            window.addEventListener("orientationchange", () => {
                setTimeout(() => {
                    this.handleResize();
                }, 100);
            });

            // Handle visibility change (for mobile browser address bar changes)
            document.addEventListener("visibilitychange", () => {
                if (!document.hidden) {
                    setTimeout(() => {
                        this.handleResize();
                    }, 100);
                }
            });
        }

        /**
         * Handle resize events
         */
        async handleResize() {
            const oldDetector = this.detector;
            this.detector = new DeviceDetector();

            const oldShouldUseMobile = oldDetector.shouldUseMobileCSS();
            const newShouldUseMobile = this.detector.shouldUseMobileCSS();

            // Only reload CSS if device type changed
            if (oldShouldUseMobile !== newShouldUseMobile) {
                if (CONFIG.DEBUG) {
                    console.log(
                        `Device type changed: ${oldShouldUseMobile ? "mobile" : "desktop"} → ${newShouldUseMobile ? "mobile" : "desktop"}`,
                    );
                }

                await this.loadAppropriateCSS();
                this.updateDeviceClasses();

                // Dispatch custom event
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

        /**
         * Add device-specific classes to body
         */
        addDeviceClasses() {
            const body = document.body;
            const deviceType = this.detector.getDeviceType();

            // Remove existing device classes
            body.classList.remove(
                "device-mobile",
                "device-tablet",
                "device-desktop",
            );
            body.classList.remove("has-touch", "no-touch");

            // Add new classes
            body.classList.add(`device-${deviceType}`);
            body.classList.add(
                this.detector.hasTouch ? "has-touch" : "no-touch",
            );

            // Add screen size classes
            if (this.detector.screenWidth <= 480) {
                body.classList.add("screen-small");
            } else if (this.detector.screenWidth <= 768) {
                body.classList.add("screen-medium");
            } else {
                body.classList.add("screen-large");
            }
        }

        /**
         * Update device classes on resize
         */
        updateDeviceClasses() {
            this.addDeviceClasses();
        }

        /**
         * Get current device info
         */
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

        /**
         * Force load specific CSS
         */
        async forceLoadCSS(type) {
            if (!["mobile", "desktop"].includes(type)) {
                throw new Error('Invalid CSS type. Use "mobile" or "desktop".');
            }

            const cssFile = CONFIG.CSS_FILES[type];
            const cssId = `${type}-css`;

            this.loader.removeCSS('link[id*="-css"]');
            await this.loader.loadCSS(cssFile, cssId);
            this.currentCSS = cssFile;

            // Update body classes
            document.body.classList.remove(
                "device-mobile",
                "device-tablet",
                "device-desktop",
            );
            document.body.classList.add(`device-${type}`);

            if (CONFIG.DEBUG) {
                console.log(`Force loaded ${type} CSS: ${cssFile}`);
            }
        }

        /**
         * Show debug information
         */
        showDebugInfo() {
            console.table({
                "Device Type": this.detector.getDeviceType(),
                "Is Mobile": this.detector.isMobile,
                "Is Tablet": this.detector.isTablet,
                "Has Touch": this.detector.hasTouch,
                "Screen Size": `${this.detector.screenWidth}x${this.detector.screenHeight}`,
                "Current CSS": this.currentCSS,
                "User Agent": this.detector.userAgent,
            });
        }
    }

    // Auto-initialize when DOM is ready
    function autoInit() {
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

    // Auto-initialize
    autoInit();

    // Utility functions for manual control
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

    // Enable debug mode
    window.enableCSSLoaderDebug = function () {
        CONFIG.DEBUG = true;
        console.log("CSS Loader debug mode enabled");
    };
})();
