// js/cache.js - Cache Management System (In-Memory)

let memoryCache = {
    data: null,
    timestamp: null,
};

function getCachedData() {
    if (memoryCache.data && memoryCache.timestamp) {
        if (Date.now() - memoryCache.timestamp < APP_CONFIG.CACHE_EXPIRY) {
            console.log("Using cached data");
            return memoryCache.data;
        } else {
            console.log("Cache expired, clearing");
            invalidateCache();
        }
    }
    return null;
}

function setCachedData(data) {
    memoryCache.data = Array.isArray(data) ? [...data] : data;
    memoryCache.timestamp = Date.now();
    console.log("Data cached successfully");
}

function invalidateCache() {
    memoryCache.data = null;
    memoryCache.timestamp = null;
    console.log("Cache invalidated");
}

// Export functions
window.getCachedData = getCachedData;
window.setCachedData = setCachedData;
window.invalidateCache = invalidateCache;
