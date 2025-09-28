// utils-helpers.js
// Utility Functions and Helpers

// =====================================================
// PERFORMANCE UTILITIES
// =====================================================

class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.isEnabled = true;
    }

    start(operation) {
        if (!this.isEnabled) return;
        this.metrics.set(operation, {
            start: performance.now(),
            memory: performance.memory ? performance.memory.usedJSHeapSize : 0,
        });
    }

    end(operation) {
        if (!this.isEnabled) return;
        const metric = this.metrics.get(operation);
        if (metric) {
            const duration = performance.now() - metric.start;
            const memoryDelta = performance.memory
                ? performance.memory.usedJSHeapSize - metric.memory
                : 0;

            console.log(
                `Performance: ${operation} took ${duration.toFixed(2)}ms, memory: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB`,
            );

            // Store for analysis
            APP_STATE.performance[operation] = {
                duration,
                memoryDelta,
                timestamp: Date.now(),
            };

            this.metrics.delete(operation);
            return duration;
        }
    }

    getAverage(operation) {
        const metrics = Object.values(APP_STATE.performance)
            .filter((m) => m.operation === operation)
            .map((m) => m.duration);

        return metrics.length > 0
            ? metrics.reduce((a, b) => a + b, 0) / metrics.length
            : 0;
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
    return input.replace(/[<>\"']/g, "").trim();
}

function numberWithCommas(x) {
    if (!x && x !== 0) return "0";
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDate(date) {
    if (!date || !(date instanceof Date)) return "";

    const year = date.getFullYear() % 100;
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${day}-${month}-${year}`;
}

function parseDisplayDate(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return null;

    const parts = dateStr.split("-");
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    let year = parseInt(parts[2]);

    if (year < 100) {
        year = year < 50 ? 2000 + year : 1900 + year;
    }

    const result = new Date(year, month, day);
    return isNaN(result.getTime()) ? null : result;
}

function convertToTimestamp(dateString) {
    const tempTimeStamp = new Date();
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

// =====================================================
// CACHE UTILITIES
// =====================================================

class CacheManager {
    constructor() {
        this.cache = APP_STATE.memoryCache;
        this.observers = new Set();
    }

    get(key = "data") {
        try {
            if (this.cache.data && this.cache.timestamp) {
                if (
                    Date.now() - this.cache.timestamp <
                    CONFIG.performance.CACHE_EXPIRY
                ) {
                    console.log("Cache hit for:", key);
                    return this.cache.data;
                } else {
                    console.log("Cache expired for:", key);
                    this.invalidate();
                }
            }
        } catch (e) {
            console.warn("Error accessing cache:", e);
            this.invalidate();
        }
        return null;
    }

    set(data, key = "data") {
        try {
            this.cache.data = Array.isArray(data) ? [...data] : data;
            this.cache.timestamp = Date.now();
            console.log("Data cached successfully:", key);
            this.notifyObservers("cached", { key, data });
        } catch (e) {
            console.warn("Cannot cache data:", e);
        }
    }

    invalidate(key = "data") {
        this.cache.data = null;
        this.cache.timestamp = null;
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
        return {
            hasData: !!this.cache.data,
            timestamp: this.cache.timestamp,
            age: this.cache.timestamp ? Date.now() - this.cache.timestamp : 0,
            sizeEstimate: this.cache.data
                ? JSON.stringify(this.cache.data).length
                : 0,
        };
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
                element.setAttribute(key, value);
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

        return element;
    }

    createFragment() {
        return document.createDocumentFragment();
    }

    clearCache() {
        this.elementCache.clear();
    }

    // Batch DOM operations
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

        // Use merge sort for large arrays
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
        };
    }

    detectBrowser(userAgent) {
        if (userAgent.includes("Chrome")) return "Chrome";
        if (userAgent.includes("Firefox")) return "Firefox";
        if (userAgent.includes("Safari") && !userAgent.includes("Chrome"))
            return "Safari";
        if (userAgent.includes("Edge")) return "Edge";
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
                enableVirtualScrolling: false, // High-end devices can handle full rendering
            },
            medium: {
                virtualRowHeight: 40,
                visibleRows: 30,
                batchSize: 50,
                filterChunkSize: 2000,
                enableAnimations: true,
                enableVirtualScrolling: true,
            },
            low: {
                virtualRowHeight: 35,
                visibleRows: 20,
                batchSize: 25,
                filterChunkSize: 1000,
                enableAnimations: false,
                enableVirtualScrolling: true,
            },
        };

        return settings[profile];
    }
}

const deviceDetector = new DeviceDetector();

// =====================================================
// EXPORT UTILITIES
// =====================================================

// Export all utilities
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        PerformanceMonitor,
        ThrottleManager,
        CacheManager,
        DOMManager,
        ArrayUtils,
        DeviceDetector,
        performanceMonitor,
        throttleManager,
        cacheManager,
        domManager,
        deviceDetector,
        // Utility functions
        generateUniqueId,
        ensureUniqueId,
        sanitizeInput,
        numberWithCommas,
        formatDate,
        parseDisplayDate,
        convertToTimestamp,
        isValidDateFormat,
    };
} else {
    // Browser environment
    window.PerformanceMonitor = PerformanceMonitor;
    window.ThrottleManager = ThrottleManager;
    window.CacheManager = CacheManager;
    window.DOMManager = DOMManager;
    window.ArrayUtils = ArrayUtils;
    window.DeviceDetector = DeviceDetector;

    window.performanceMonitor = performanceMonitor;
    window.throttleManager = throttleManager;
    window.cacheManager = cacheManager;
    window.domManager = domManager;
    window.deviceDetector = deviceDetector;

    // Utility functions
    window.generateUniqueId = generateUniqueId;
    window.ensureUniqueId = ensureUniqueId;
    window.sanitizeInput = sanitizeInput;
    window.numberWithCommas = numberWithCommas;
    window.formatDate = formatDate;
    window.parseDisplayDate = parseDisplayDate;
    window.convertToTimestamp = convertToTimestamp;
    window.isValidDateFormat = isValidDateFormat;
}
