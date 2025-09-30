// =====================================================
// CACHE MANAGEMENT SYSTEM
// =====================================================

class CacheManager {
    constructor() {
        this.memoryCache = {
            data: null,
            timestamp: null,
        };
        this.expiry = CONFIG.cache.expiry;
    }

    // Get cached data if valid
    getCachedData() {
        try {
            if (this.memoryCache.data && this.memoryCache.timestamp) {
                if (Date.now() - this.memoryCache.timestamp < this.expiry) {
                    console.log("Using cached data");
                    return this.memoryCache.data;
                } else {
                    console.log("Cache expired, clearing");
                    this.invalidateCache();
                }
            }
        } catch (e) {
            console.warn("Error accessing cache:", e);
            this.invalidateCache();
        }
        return null;
    }

    // Set data in cache
    setCachedData(data) {
        try {
            this.memoryCache.data = Array.isArray(data) ? [...data] : data;
            this.memoryCache.timestamp = Date.now();
            console.log("Data cached successfully");
        } catch (e) {
            console.warn("Cannot cache data:", e);
        }
    }

    // Clear cache
    invalidateCache() {
        this.memoryCache.data = null;
        this.memoryCache.timestamp = null;
        console.log("Cache invalidated");
    }

    // Get cache status
    getCacheStatus() {
        if (!this.memoryCache.data || !this.memoryCache.timestamp) {
            return { status: "empty", age: 0 };
        }

        const age = Date.now() - this.memoryCache.timestamp;
        const isValid = age < this.expiry;

        return {
            status: isValid ? "valid" : "expired",
            age: age,
            size: Array.isArray(this.memoryCache.data)
                ? this.memoryCache.data.length
                : 0,
        };
    }

    // Cleanup cache if needed
    cleanup() {
        const status = this.getCacheStatus();
        if (status.status === "expired") {
            this.invalidateCache();
        }
    }
}

// Create global cache manager instance
window.cacheManager = new CacheManager();
