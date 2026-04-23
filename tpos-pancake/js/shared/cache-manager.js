// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Shared Cache Manager for TPOS-Pancake
 * Generic TTL+LRU cache replacing duplicate cache logic in tpos-chat.js and pancake-chat.js
 */

class SharedCache {
    /**
     * @param {object} options
     * @param {number} [options.maxSize=200] - Maximum entries
     * @param {number} [options.ttl=600000] - Time-to-live in ms (default 10 min)
     * @param {number} [options.cleanupInterval=300000] - Cleanup interval in ms (default 5 min)
     * @param {string} [options.name='cache'] - Name for logging
     */
    constructor(options = {}) {
        this.maxSize = options.maxSize || 200;
        this.ttl = options.ttl || 10 * 60 * 1000;
        this.cleanupInterval = options.cleanupInterval || 5 * 60 * 1000;
        this.name = options.name || 'cache';
        this._data = new Map();
        this._cleanupTimer = null;
    }

    /**
     * Get a value from cache (returns null if expired)
     * Updates access timestamp for LRU behavior
     * @param {string} key
     * @returns {*|null}
     */
    get(key) {
        const entry = this._data.get(key);
        if (!entry) return null;

        if (Date.now() - entry.timestamp > this.ttl) {
            this._data.delete(key);
            return null;
        }

        entry.timestamp = Date.now();
        return entry.value;
    }

    /**
     * Set a value in cache with automatic LRU eviction
     * @param {string} key
     * @param {*} value
     */
    set(key, value) {
        if (this._data.size >= this.maxSize && !this._data.has(key)) {
            this._evictOldest(Math.floor(this.maxSize * 0.2));
        }
        this._data.set(key, { value, timestamp: Date.now() });
    }

    /**
     * Check if key exists and is not expired
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
        return this.get(key) !== null;
    }

    /**
     * Delete a specific key
     * @param {string} key
     */
    delete(key) {
        this._data.delete(key);
    }

    /**
     * Clear all entries
     */
    clear() {
        this._data.clear();
    }

    /**
     * Get current cache size
     * @returns {number}
     */
    get size() {
        return this._data.size;
    }

    /**
     * Evict the oldest N entries (LRU)
     * @param {number} count
     */
    _evictOldest(count) {
        const entries = Array.from(this._data.entries()).sort(
            (a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0)
        );
        entries.slice(0, count).forEach(([key]) => this._data.delete(key));
    }

    /**
     * Remove all expired entries
     * @returns {number} Number of entries cleaned
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, entry] of this._data) {
            if (now - entry.timestamp > this.ttl) {
                this._data.delete(key);
                cleaned++;
            }
        }
        return cleaned;
    }

    /**
     * Start periodic cleanup timer
     */
    startCleanup() {
        this.stopCleanup();
        this._cleanupTimer = setInterval(() => {
            const cleaned = this.cleanup();
            if (cleaned > 0) {
                console.log(`[${this.name}] Cleaned ${cleaned} expired entries`);
            }
        }, this.cleanupInterval);
    }

    /**
     * Stop periodic cleanup timer
     */
    stopCleanup() {
        if (this._cleanupTimer) {
            clearInterval(this._cleanupTimer);
            this._cleanupTimer = null;
        }
    }

    /**
     * Destroy cache and stop timers
     */
    destroy() {
        this.stopCleanup();
        this.clear();
    }
}

// Export for script-tag usage
if (typeof window !== 'undefined') {
    window.SharedCache = SharedCache;
}
