// utils-helpers.js - Complete Version
// Utility Functions and Helpers with Vietnam Timezone Support

// =====================================================
// VIETNAM TIMEZONE UTILITIES
// =====================================================

const VietnamTime = {
    // Vietnam timezone offset: UTC+7
    VIETNAM_OFFSET: 7 * 60, // 7 hours in minutes

    // Get current Vietnam time
    now() {
        const utc = new Date();
        // Note: This creates a Date object that represents Vietnam time
        // but the timezone info is still system timezone
        return new Date(utc.getTime() + this.VIETNAM_OFFSET * 60 * 1000);
    },

    // Convert any date to Vietnam timezone
    toVietnamTime(date) {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        return new Date(date.getTime() + this.VIETNAM_OFFSET * 60 * 1000);
    },

    // Get Vietnam date string (YYYY-MM-DD format for input[type="date"])
    getDateString(date = null) {
        if (date) {
            // Convert provided date to Vietnam timezone
            const vietnamDate = this.toVietnamTime(date);
            return vietnamDate.toISOString().split("T")[0];
        } else {
            // Get current Vietnam date
            const now = new Date();
            const vietnamNow = new Date(
                now.getTime() + this.VIETNAM_OFFSET * 60 * 1000,
            );
            return vietnamNow.toISOString().split("T")[0];
        }
    },

    // Convert Vietnam date string to timestamp range for that day
    getDateRange(dateString) {
        if (!dateString) return null;

        // Parse date string as local date (assumes system is set to Vietnam time)
        const [year, month, day] = dateString.split("-").map(Number);

        // Create dates in local timezone
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

        return {
            start: startOfDay.getTime(),
            end: endOfDay.getTime(),
        };
    },

    // Check if a timestamp falls within a Vietnam date
    isInVietnamDate(timestamp, dateString) {
        const range = this.getDateRange(dateString);
        if (!range) return true; // No date filter

        return timestamp >= range.start && timestamp <= range.end;
    },

    // Format timestamp to Vietnam date display (DD-MM-YY)
    formatVietnamDate(timestamp) {
        const date = new Date(timestamp);

        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear() % 100;

        return `${day}-${month}-${year}`;
    },

    // Get Vietnam time info for debugging
    debug() {
        const now = new Date();
        const vnNow = this.now();
        const vnDateString = this.getDateString();

        const debugInfo = {
            systemTime: now,
            vietnamTime: vnNow,
            vietnamDateString: vnDateString,
            timeDifference: vnNow.getTime() - now.getTime(),
            expectedDiff: 7 * 60 * 60 * 1000, // 7 hours in ms
            systemTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };

        console.log("Vietnam Time Debug:", debugInfo);
        return debugInfo;
    },

    // Convert DD-MM-YY format to Date object
    parseVietnamDate(dateStr) {
        if (!dateStr || typeof dateStr !== "string") return null;

        const parts = dateStr.split("-");
        if (parts.length !== 3) return null;

        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // Month is 0-indexed
        let year = parseInt(parts[2]);

        // Handle 2-digit years
        if (year < 100) {
            year = year < 50 ? 2000 + year : 1900 + year;
        }

        const result = new Date(year, month, day);
        return isNaN(result.getTime()) ? null : result;
    },
};

// =====================================================
// PERFORMANCE UTILITIES
// =====================================================

class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.isEnabled = true;
        this.history = [];
        this.maxHistorySize = 100;
    }

    start(operation) {
        if (!this.isEnabled) return;

        const startData = {
            start: performance.now(),
            memory: performance.memory ? performance.memory.usedJSHeapSize : 0,
            timestamp: Date.now(),
        };

        this.metrics.set(operation, startData);
    }

    end(operation) {
        if (!this.isEnabled) return;

        const metric = this.metrics.get(operation);
        if (metric) {
            const duration = performance.now() - metric.start;
            const memoryDelta = performance.memory
                ? performance.memory.usedJSHeapSize - metric.memory
                : 0;

            const result = {
                operation,
                duration,
                memoryDelta,
                timestamp: metric.timestamp,
                endTime: Date.now(),
            };

            console.log(
                `Performance: ${operation} took ${duration.toFixed(2)}ms, memory: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB`,
            );

            // Store for analysis
            APP_STATE.performance[operation] = result;

            // Add to history
            this.history.push(result);
            if (this.history.length > this.maxHistorySize) {
                this.history.shift();
            }

            this.metrics.delete(operation);
            return duration;
        }
        return 0;
    }

    getAverage(operation) {
        const metrics = this.history
            .filter((m) => m.operation === operation)
            .map((m) => m.duration);

        return metrics.length > 0
            ? metrics.reduce((a, b) => a + b, 0) / metrics.length
            : 0;
    }

    getStats() {
        return {
            activeMetrics: this.metrics.size,
            historySize: this.history.length,
            isEnabled: this.isEnabled,
            recentOperations: this.history.slice(-10),
            averages: this.getOperationAverages(),
        };
    }

    getOperationAverages() {
        const operations = [...new Set(this.history.map((m) => m.operation))];
        const averages = {};

        operations.forEach((op) => {
            averages[op] = this.getAverage(op);
        });

        return averages;
    }

    clear() {
        this.metrics.clear();
        this.history = [];
    }

    enable() {
        this.isEnabled = true;
    }

    disable() {
        this.isEnabled = false;
    }
}

const performanceMonitor = new PerformanceMonitor();

// =====================================================
// THROTTLING AND DEBOUNCING
// =====================================================

class ThrottleManager {
    constructor() {
        this.throttled = new Map();
        this.debounced = new Map();
    }

    throttle(func, delay, id = func.name) {
        if (this.throttled.has(id)) {
            return this.throttled.get(id);
        }

        let lastCall = 0;
        const throttledFunc = (...args) => {
            const now = Date.now();
            if (now - lastCall >= delay) {
                lastCall = now;
                return func.apply(this, args);
            }
        };

        this.throttled.set(id, throttledFunc);
        return throttledFunc;
    }

    debounce(func, delay, id = func.name) {
        if (this.debounced.has(id)) {
            clearTimeout(this.debounced.get(id).timeoutId);
        }

        const debounceData = {
            timeoutId: null,
            func: func,
        };

        const debouncedFunc = (...args) => {
            clearTimeout(debounceData.timeoutId);
            debounceData.timeoutId = setTimeout(() => {
                func.apply(this, args);
                this.debounced.delete(id);
            }, delay);
        };

        debounceData.debouncedFunc = debouncedFunc;
        this.debounced.set(id, debounceData);
        return debouncedFunc;
    }

    clear(id) {
        this.throttled.delete(id);
        if (this.debounced.has(id)) {
            clearTimeout(this.debounced.get(id).timeoutId);
            this.debounced.delete(id);
        }
    }

    clearAll() {
        this.throttled.clear();
        this.debounced.forEach((data) => clearTimeout(data.timeoutId));
        this.debounced.clear();
    }

    getStats() {
        return {
            throttledCount: this.throttled.size,
            debouncedCount: this.debounced.size,
            throttledKeys: Array.from(this.throttled.keys()),
            debouncedKeys: Array.from(this.debounced.keys()),
        };
    }
}

const throttleManager = new ThrottleManager();

// =====================================================
// DATA UTILITIES
// =====================================================

function generateUniqueId() {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 9);
    return `tx_${timestamp}_${randomPart}`;
}

function ensureUniqueId(item) {
    if (!item.uniqueId) {
        item.uniqueId = generateUniqueId();
    }
    return item;
}

function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input
        .replace(/[<>"'&]/g, "") // Remove potentially dangerous characters
        .replace(/\s+/g, " ") // Replace multiple spaces with single space
        .trim();
}

function numberWithCommas(x) {
    if (!x && x !== 0) return "0";
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDate(date) {
    if (!date || !(date instanceof Date)) return "";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear() % 100;

    return `${day}-${month}-${year}`;
}

function parseDisplayDate(dateStr) {
    return VietnamTime.parseVietnamDate(dateStr);
}

function convertToTimestamp(dateString) {
    const tempTimeStamp = VietnamTime.now();
    const parts = dateString.split("-");

    if (parts.length !== 3) {
        throw new Error("Invalid date format. Expected DD-MM-YY");
    }

    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    let year = parseInt(parts[2]);

    if (year < 100) {
        year = 2000 + year;
    }

    const dateObj = new Date(year, month - 1, day);
    const timestamp =
        dateObj.getTime() +
        (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;

    return timestamp.toString();
}

function isValidDateFormat(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return false;

    const regex = /^\d{2}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;

    const parts = dateStr.split("-");
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const year = parseInt(parts[2]);

    return day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 0;
}

// Enhanced validation functions
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePhoneNumber(phone) {
    const phoneRegex = /^[0-9+\-\s()]{10,15}$/;
    return phoneRegex.test(phone.replace(/\s/g, ""));
}

function validateAmount(amount) {
    const cleanAmount = amount.toString().replace(/[,\.]/g, "");
    const numAmount = parseFloat(cleanAmount);
    return !isNaN(numAmount) && numAmount > 0;
}

// =====================================================
// CACHE UTILITIES
// =====================================================

class CacheManager {
    constructor() {
        this.cache = APP_STATE.memoryCache;
        this.observers = new Set();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            invalidations: 0,
        };
    }

    get(key = "data") {
        try {
            if (this.cache.data && this.cache.timestamp) {
                if (
                    Date.now() - this.cache.timestamp <
                    CONFIG.performance.CACHE_EXPIRY
                ) {
                    console.log("Cache hit for:", key);
                    this.stats.hits++;
                    return this.cache.data;
                } else {
                    console.log("Cache expired for:", key);
                    this.invalidate();
                    this.stats.misses++;
                }
            } else {
                this.stats.misses++;
            }
        } catch (e) {
            console.warn("Error accessing cache:", e);
            this.invalidate();
            this.stats.misses++;
        }
        return null;
    }

    set(data, key = "data") {
        try {
            this.cache.data = Array.isArray(data) ? [...data] : data;
            this.cache.timestamp = Date.now();
            this.stats.sets++;
            console.log("Data cached successfully:", key);
            this.notifyObservers("cached", { key, data });
        } catch (e) {
            console.warn("Cannot cache data:", e);
        }
    }

    invalidate(key = "data") {
        this.cache.data = null;
        this.cache.timestamp = null;
        this.stats.invalidations++;
        console.log("Cache invalidated:", key);
        this.notifyObservers("invalidated", { key });
    }

    addObserver(callback) {
        this.observers.add(callback);
    }

    removeObserver(callback) {
        this.observers.delete(callback);
    }

    notifyObservers(event, data) {
        this.observers.forEach((callback) => {
            try {
                callback(event, data);
            } catch (e) {
                console.error("Cache observer error:", e);
            }
        });
    }

    getStats() {
        const hitRate =
            this.stats.hits + this.stats.misses > 0
                ? (
                      (this.stats.hits /
                          (this.stats.hits + this.stats.misses)) *
                      100
                  ).toFixed(2)
                : 0;

        return {
            hasData: !!this.cache.data,
            timestamp: this.cache.timestamp,
            age: this.cache.timestamp ? Date.now() - this.cache.timestamp : 0,
            sizeEstimate: this.cache.data
                ? JSON.stringify(this.cache.data).length
                : 0,
            observerCount: this.observers.size,
            hitRate: `${hitRate}%`,
            ...this.stats,
        };
    }

    clear() {
        this.cache.data = null;
        this.cache.timestamp = null;
        this.stats = { hits: 0, misses: 0, sets: 0, invalidations: 0 };
        this.observers.clear();
    }
}

const cacheManager = new CacheManager();

// =====================================================
// DOM UTILITIES
// =====================================================

class DOMManager {
    constructor() {
        this.elementCache = new Map();
        this.observedElements = new Set();
        this.mutationObserver = null;
        this.initMutationObserver();
    }

    initMutationObserver() {
        if (typeof MutationObserver !== "undefined") {
            this.mutationObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === "childList") {
                        // Clear cache for removed elements
                        mutation.removedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                this.clearElementFromCache(node);
                            }
                        });
                    }
                });
            });

            this.mutationObserver.observe(document.body, {
                childList: true,
                subtree: true,
            });
        }
    }

    clearElementFromCache(element) {
        // Remove element and its descendants from cache
        this.elementCache.forEach((cachedElement, selector) => {
            if (
                !document.contains(cachedElement) ||
                cachedElement === element ||
                element.contains(cachedElement)
            ) {
                this.elementCache.delete(selector);
            }
        });
    }

    get(selector) {
        if (this.elementCache.has(selector)) {
            const element = this.elementCache.get(selector);
            // Verify element is still in DOM
            if (element && document.contains(element)) {
                return element;
            }
            this.elementCache.delete(selector);
        }

        const element = document.querySelector(selector);
        if (element) {
            this.elementCache.set(selector, element);
        }
        return element;
    }

    getAll(selector) {
        return document.querySelectorAll(selector);
    }

    create(tagName, options = {}) {
        const element = document.createElement(tagName);

        if (options.className) element.className = options.className;
        if (options.id) element.id = options.id;
        if (options.textContent) element.textContent = options.textContent;
        if (options.innerHTML) element.innerHTML = options.innerHTML;

        if (options.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                // Handle checkbox checked specially
                if (tagName === "input" && key === "checked") {
                    element.checked = Boolean(value);
                    console.log(
                        `Set checkbox.checked property to: ${element.checked}`,
                    );
                } else {
                    element.setAttribute(key, value);
                }
            });
        }

        if (options.styles) {
            Object.assign(element.style, options.styles);
        }

        if (options.eventListeners) {
            Object.entries(options.eventListeners).forEach(
                ([event, handler]) => {
                    element.addEventListener(event, handler);
                },
            );
        }

        if (options.dataset) {
            Object.entries(options.dataset).forEach(([key, value]) => {
                element.dataset[key] = value;
            });
        }

        return element;
    }

    createFragment() {
        return document.createDocumentFragment();
    }

    clearCache() {
        this.elementCache.clear();
    }

    // Batch DOM operations for better performance
    batch(operations) {
        const fragment = this.createFragment();

        operations.forEach((op) => {
            switch (op.type) {
                case "create":
                    const element = this.create(op.tagName, op.options);
                    fragment.appendChild(element);
                    break;
                case "append":
                    if (op.element && op.parent) {
                        op.parent.appendChild(op.element);
                    }
                    break;
            }
        });

        return fragment;
    }

    // Efficient element visibility check
    isVisible(element) {
        return !!(
            element.offsetWidth ||
            element.offsetHeight ||
            element.getClientRects().length
        );
    }

    // Scroll into view with performance considerations
    scrollIntoView(element, options = {}) {
        if (element && typeof element.scrollIntoView === "function") {
            element.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "nearest",
                ...options,
            });
        }
    }

    // Add CSS classes with animation support
    addClass(element, className, animate = false) {
        if (!element) return;

        if (animate) {
            element.style.transition = "all 0.3s ease";
        }

        element.classList.add(className);
    }

    removeClass(element, className, animate = false) {
        if (!element) return;

        if (animate) {
            element.style.transition = "all 0.3s ease";
        }

        element.classList.remove(className);
    }

    // Get computed styles
    getStyles(element, properties = []) {
        if (!element) return {};

        const computedStyles = window.getComputedStyle(element);
        const result = {};

        if (properties.length === 0) {
            return computedStyles;
        }

        properties.forEach((prop) => {
            result[prop] = computedStyles.getPropertyValue(prop);
        });

        return result;
    }

    getStats() {
        return {
            cacheSize: this.elementCache.size,
            observedElements: this.observedElements.size,
            hasMutationObserver: !!this.mutationObserver,
            cachedSelectors: Array.from(this.elementCache.keys()),
        };
    }

    destroy() {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        this.clearCache();
        this.observedElements.clear();
    }
}

const domManager = new DOMManager();

// =====================================================
// ARRAY UTILITIES
// =====================================================

class ArrayUtils {
    static chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    static binarySearchInsert(array, item, compareFn) {
        let low = 0;
        let high = array.length;

        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (compareFn(array[mid], item) < 0) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        array.splice(low, 0, item);
        return low;
    }

    static fastFilter(
        array,
        predicate,
        chunkSize = CONFIG.performance.MAX_FILTER_CHUNK_SIZE,
    ) {
        if (array.length <= chunkSize) {
            return array.filter(predicate);
        }

        const result = [];
        const chunks = this.chunk(array, chunkSize);

        for (const chunk of chunks) {
            result.push(...chunk.filter(predicate));
        }

        return result;
    }

    static fastSort(array, compareFn, chunkSize = 1000) {
        if (array.length <= chunkSize) {
            return array.sort(compareFn);
        }

        return this.mergeSort(array, compareFn);
    }

    static mergeSort(array, compareFn) {
        if (array.length <= 1) return array;

        const mid = Math.floor(array.length / 2);
        const left = this.mergeSort(array.slice(0, mid), compareFn);
        const right = this.mergeSort(array.slice(mid), compareFn);

        return this.merge(left, right, compareFn);
    }

    static merge(left, right, compareFn) {
        const result = [];
        let leftIndex = 0;
        let rightIndex = 0;

        while (leftIndex < left.length && rightIndex < right.length) {
            if (compareFn(left[leftIndex], right[rightIndex]) <= 0) {
                result.push(left[leftIndex]);
                leftIndex++;
            } else {
                result.push(right[rightIndex]);
                rightIndex++;
            }
        }

        return result
            .concat(left.slice(leftIndex))
            .concat(right.slice(rightIndex));
    }

    static removeDuplicates(array, keyFn = (item) => item) {
        const seen = new Set();
        return array.filter((item) => {
            const key = keyFn(item);
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    static groupBy(array, keyFn) {
        return array.reduce((groups, item) => {
            const key = keyFn(item);
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(item);
            return groups;
        }, {});
    }

    static partition(array, predicate) {
        const truthy = [];
        const falsy = [];

        array.forEach((item) => {
            if (predicate(item)) {
                truthy.push(item);
            } else {
                falsy.push(item);
            }
        });

        return [truthy, falsy];
    }

    static flatten(array, depth = 1) {
        if (depth <= 0) return array.slice();

        return array.reduce((acc, val) => {
            if (Array.isArray(val)) {
                acc.push(...this.flatten(val, depth - 1));
            } else {
                acc.push(val);
            }
            return acc;
        }, []);
    }

    static unique(array) {
        return [...new Set(array)];
    }

    static intersection(array1, array2) {
        const set2 = new Set(array2);
        return array1.filter((item) => set2.has(item));
    }

    static difference(array1, array2) {
        const set2 = new Set(array2);
        return array1.filter((item) => !set2.has(item));
    }
}

// =====================================================
// DEVICE DETECTION
// =====================================================

class DeviceDetector {
    constructor() {
        this.info = this.detectDevice();
        this.performanceProfile = this.createPerformanceProfile();
    }

    detectDevice() {
        const userAgent = navigator.userAgent;
        const platform = navigator.platform;
        const screen = window.screen;

        return {
            isMobile:
                /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                    userAgent,
                ),
            isTablet: /iPad|Android(?=.*\bMobile\b)/i.test(userAgent),
            isDesktop:
                !/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                    userAgent,
                ),
            browser: this.detectBrowser(userAgent),
            os: this.detectOS(userAgent, platform),
            touchSupport: "ontouchstart" in window,
            hardwareConcurrency: navigator.hardwareConcurrency || 4,
            memory: navigator.deviceMemory || 4,
            connection: navigator.connection || null,
            screen: {
                width: screen.width,
                height: screen.height,
                availWidth: screen.availWidth,
                availHeight: screen.availHeight,
                pixelDepth: screen.pixelDepth,
            },
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
            },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language,
            languages: navigator.languages,
        };
    }

    detectBrowser(userAgent) {
        if (userAgent.includes("Chrome")) return "Chrome";
        if (userAgent.includes("Firefox")) return "Firefox";
        if (userAgent.includes("Safari") && !userAgent.includes("Chrome"))
            return "Safari";
        if (userAgent.includes("Edge")) return "Edge";
        if (userAgent.includes("Opera")) return "Opera";
        return "Unknown";
    }

    detectOS(userAgent, platform) {
        if (userAgent.includes("Windows")) return "Windows";
        if (userAgent.includes("Mac")) return "macOS";
        if (userAgent.includes("Linux")) return "Linux";
        if (userAgent.includes("Android")) return "Android";
        if (userAgent.includes("iOS")) return "iOS";
        return "Unknown";
    }

    createPerformanceProfile() {
        const score = this.calculatePerformanceScore();

        if (score >= 80) return "high";
        if (score >= 50) return "medium";
        return "low";
    }

    calculatePerformanceScore() {
        let score = 50; // Base score

        // CPU cores
        score += Math.min(this.info.hardwareConcurrency * 10, 40);

        // Memory
        score += Math.min(this.info.memory * 5, 20);

        // Device type
        if (this.info.isDesktop) score += 20;
        else if (this.info.isTablet) score += 10;
        else score -= 10; // Mobile penalty

        // Browser
        if (this.info.browser === "Chrome") score += 10;
        else if (this.info.browser === "Firefox") score += 5;

        // Connection
        if (this.info.connection) {
            if (this.info.connection.effectiveType === "4g") score += 10;
            else if (this.info.connection.effectiveType === "3g") score += 5;
        }

        // Screen resolution
        const totalPixels = this.info.screen.width * this.info.screen.height;
        if (totalPixels > 2073600)
            score += 10; // 1920x1080+
        else if (totalPixels > 921600) score += 5; // 1280x720+

        return Math.max(0, Math.min(100, score));
    }

    getOptimalSettings() {
        const profile = this.performanceProfile;

        const settings = {
            high: {
                virtualRowHeight: 45,
                visibleRows: 50,
                batchSize: 100,
                filterChunkSize: 3000,
                enableAnimations: true,
                enableVirtualScrolling: false,
                enableWebWorkers: true,
                cacheSize: 1000,
            },
            medium: {
                virtualRowHeight: 40,
                visibleRows: 30,
                batchSize: 50,
                filterChunkSize: 2000,
                enableAnimations: true,
                enableVirtualScrolling: true,
                enableWebWorkers: true,
                cacheSize: 500,
            },
            low: {
                virtualRowHeight: 35,
                visibleRows: 20,
                batchSize: 25,
                filterChunkSize: 1000,
                enableAnimations: false,
                enableVirtualScrolling: true,
                enableWebWorkers: false,
                cacheSize: 100,
            },
        };

        return settings[profile];
    }

    isInVietnam() {
        return (
            this.info.timezone.includes("Asia/Ho_Chi_Minh") ||
            this.info.timezone.includes("Asia/Saigon") ||
            this.info.language.includes("vi")
        );
    }

    getStats() {
        return {
            ...this.info,
            performanceProfile: this.performanceProfile,
            performanceScore: this.calculatePerformanceScore(),
            optimalSettings: this.getOptimalSettings(),
            isInVietnam: this.isInVietnam(),
        };
    }
}

const deviceDetector = new DeviceDetector();

// =====================================================
// ERROR HANDLING UTILITIES
// =====================================================

class ErrorHandler {
    constructor() {
        this.errors = [];
        this.maxErrors = 50;
        this.setupGlobalHandlers();
    }

    setupGlobalHandlers() {
        window.addEventListener("error", (event) => {
            this.logError({
                type: "javascript",
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error,
                timestamp: Date.now(),
            });
        });

        window.addEventListener("unhandledrejection", (event) => {
            this.logError({
                type: "promise",
                message: event.reason?.message || "Unhandled promise rejection",
                reason: event.reason,
                timestamp: Date.now(),
            });
        });
    }

    logError(errorInfo) {
        this.errors.push(errorInfo);

        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }

        console.error("Error logged:", errorInfo);

        // Send to analytics if available
        if (window.gtag) {
            window.gtag("event", "exception", {
                description: errorInfo.message,
                fatal: false,
            });
        }
    }

    getErrors() {
        return this.errors;
    }

    clearErrors() {
        this.errors = [];
    }

    getStats() {
        return {
            totalErrors: this.errors.length,
            recentErrors: this.errors.slice(-10),
            errorTypes: this.getErrorTypeStats(),
        };
    }

    getErrorTypeStats() {
        const types = {};
        this.errors.forEach((error) => {
            types[error.type] = (types[error.type] || 0) + 1;
        });
        return types;
    }
}

const errorHandler = new ErrorHandler();

// =====================================================
// EXPORT UTILITIES
// =====================================================

// Export all utilities
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        VietnamTime,
        PerformanceMonitor,
        ThrottleManager,
        CacheManager,
        DOMManager,
        ArrayUtils,
        DeviceDetector,
        ErrorHandler,
        performanceMonitor,
        throttleManager,
        cacheManager,
        domManager,
        deviceDetector,
        errorHandler,
        // Utility functions
        generateUniqueId,
        ensureUniqueId,
        sanitizeInput,
        numberWithCommas,
        formatDate,
        parseDisplayDate,
        convertToTimestamp,
        isValidDateFormat,
        validateEmail,
        validatePhoneNumber,
        validateAmount,
    };
} else {
    // Browser environment
    window.VietnamTime = VietnamTime;
    window.PerformanceMonitor = PerformanceMonitor;
    window.ThrottleManager = ThrottleManager;
    window.CacheManager = CacheManager;
    window.DOMManager = DOMManager;
    window.ArrayUtils = ArrayUtils;
    window.DeviceDetector = DeviceDetector;
    window.ErrorHandler = ErrorHandler;

    window.performanceMonitor = performanceMonitor;
    window.throttleManager = throttleManager;
    window.cacheManager = cacheManager;
    window.domManager = domManager;
    window.deviceDetector = deviceDetector;
    window.errorHandler = errorHandler;

    // Utility functions
    window.generateUniqueId = generateUniqueId;
    window.ensureUniqueId = ensureUniqueId;
    window.sanitizeInput = sanitizeInput;
    window.numberWithCommas = numberWithCommas;
    window.formatDate = formatDate;
    window.parseDisplayDate = parseDisplayDate;
    window.convertToTimestamp = convertToTimestamp;
    window.isValidDateFormat = isValidDateFormat;
    window.validateEmail = validateEmail;
    window.validatePhoneNumber = validatePhoneNumber;
    window.validateAmount = validateAmount;
}

// Global debug functions
window.debugVietnamTime = function () {
    return VietnamTime.debug();
};

window.debugPerformance = function () {
    return {
        performance: performanceMonitor.getStats(),
        throttle: throttleManager.getStats(),
        cache: cacheManager.getStats(),
        dom: domManager.getStats(),
        device: deviceDetector.getStats(),
        errors: errorHandler.getStats(),
    };
};

console.log(
    "Utils-helpers.js loaded successfully with Vietnam timezone support",
);
