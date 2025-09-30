// =====================================================
// CACHE MANAGEMENT SYSTEM
// =====================================================

let memoryCache = { data: null, timestamp: null };

function getCachedData() {
    try {
        if (memoryCache.data && memoryCache.timestamp) {
            if (Date.now() - memoryCache.timestamp < APP_CONFIG.CACHE_EXPIRY) {
                console.log("Using cached inventory data");
                return [...memoryCache.data];
            } else {
                console.log("Cache expired, clearing");
                invalidateCache();
            }
        }
    } catch (e) {
        console.warn("Error accessing cache:", e);
        invalidateCache();
    }
    return null;
}

function setCachedData(data) {
    try {
        memoryCache.data = [...data];
        memoryCache.timestamp = Date.now();
        console.log("Inventory data cached successfully");
    } catch (e) {
        console.warn("Cannot cache data:", e);
    }
}

function invalidateCache() {
    memoryCache.data = null;
    memoryCache.timestamp = null;
    console.log("Cache invalidated");
}

console.log("Cache management system loaded");
