// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * IMAGE CACHE — IndexedDB blob cache for images
 *
 * Cache ảnh (Firebase Storage URLs etc.) dạng Blob trong IndexedDB.
 * Auto-cleanup entries > 7 ngày + cap tổng size 200MB (LRU evict).
 *
 * Usage:
 *   const url = await window.ImageCache.getUrl(remoteUrl);
 *   img.src = url;
 *
 * Window globals: ImageCache.{ getUrl, prefetch, cleanup, stats }
 */

(function () {
    'use strict';
    if (typeof window === 'undefined' || window.ImageCache) return;

    const DB_NAME = 'n2store_image_cache';
    const STORE = 'blobs';
    const DB_VERSION = 1;
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày
    const MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB cap
    const MAX_SIZE_TARGET = 160 * 1024 * 1024; // evict tới 160MB khi vượt cap
    const CLEANUP_KEY = 'imageCache_lastCleanupTs';
    const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 lần/ngày

    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    const os = db.createObjectStore(STORE, { keyPath: 'url' });
                    os.createIndex('addedAt', 'addedAt', { unique: false });
                    os.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        }).catch((err) => {
            console.warn('[ImageCache] IndexedDB unavailable, fallback to direct URL:', err);
            dbPromise = null;
            return null;
        });
        return dbPromise;
    }

    function tx(db, mode = 'readonly') {
        return db.transaction(STORE, mode).objectStore(STORE);
    }

    function reqAsPromise(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function get(url) {
        const db = await openDB();
        if (!db) return null;
        try {
            const entry = await reqAsPromise(tx(db).get(url));
            if (!entry) return null;
            // Hết hạn → xóa, return null
            if (Date.now() - entry.addedAt > MAX_AGE_MS) {
                reqAsPromise(tx(db, 'readwrite').delete(url)).catch(() => {});
                return null;
            }
            // LRU touch — async, không await
            reqAsPromise(
                tx(db, 'readwrite').put({ ...entry, lastAccessedAt: Date.now() })
            ).catch(() => {});
            return entry.blob;
        } catch (e) {
            return null;
        }
    }

    async function put(url, blob) {
        const db = await openDB();
        if (!db) return;
        try {
            const now = Date.now();
            await reqAsPromise(
                tx(db, 'readwrite').put({
                    url,
                    blob,
                    size: blob.size,
                    addedAt: now,
                    lastAccessedAt: now,
                })
            );
        } catch (e) {
            if (e?.name === 'QuotaExceededError') {
                // Evict tới target rồi retry 1 lần
                await evictToTarget(MAX_SIZE_TARGET);
                try {
                    const db2 = await openDB();
                    const now = Date.now();
                    await reqAsPromise(
                        tx(db2, 'readwrite').put({
                            url,
                            blob,
                            size: blob.size,
                            addedAt: now,
                            lastAccessedAt: now,
                        })
                    );
                } catch (_) {
                    // Bỏ qua — fallback sẽ chạy direct URL
                }
            }
        }
    }

    /**
     * Get blob URL (object URL từ cache, hoặc direct URL nếu cache fail).
     * Caller KHÔNG cần revoke — object URL valid suốt session.
     */
    async function getUrl(remoteUrl) {
        if (!remoteUrl) return remoteUrl;
        try {
            const cached = await get(remoteUrl);
            if (cached) return URL.createObjectURL(cached);

            // Fetch + cache
            const res = await fetch(remoteUrl, { mode: 'cors', credentials: 'omit' });
            if (!res.ok) return remoteUrl;
            const blob = await res.blob();
            put(remoteUrl, blob).catch(() => {});
            return URL.createObjectURL(blob);
        } catch (e) {
            return remoteUrl; // fallback
        }
    }

    /**
     * Prefetch (no return) — fire-and-forget warm cache.
     */
    async function prefetch(urls) {
        if (!Array.isArray(urls)) return;
        for (const u of urls) {
            try {
                const cached = await get(u);
                if (cached) continue;
                const res = await fetch(u, { mode: 'cors', credentials: 'omit' });
                if (!res.ok) continue;
                const blob = await res.blob();
                await put(u, blob);
            } catch (_) {}
        }
    }

    async function evictToTarget(targetBytes) {
        const db = await openDB();
        if (!db) return;
        const all = await reqAsPromise(tx(db).getAll());
        let totalSize = all.reduce((s, e) => s + (e.size || 0), 0);
        if (totalSize <= targetBytes) return;
        // Sort theo lastAccessedAt asc (cũ nhất trước)
        all.sort((a, b) => (a.lastAccessedAt || 0) - (b.lastAccessedAt || 0));
        for (const entry of all) {
            if (totalSize <= targetBytes) break;
            try {
                await reqAsPromise(tx(db, 'readwrite').delete(entry.url));
                totalSize -= entry.size || 0;
            } catch (_) {}
        }
    }

    /**
     * Cleanup: xóa entries > 7 ngày + evict nếu vượt cap.
     * Throttled qua localStorage timestamp — chỉ chạy 1 lần/ngày trên client.
     */
    async function cleanup({ force = false } = {}) {
        try {
            if (!force) {
                const last = parseInt(localStorage.getItem(CLEANUP_KEY) || '0', 10);
                if (Date.now() - last < CLEANUP_INTERVAL_MS) return;
            }
            const db = await openDB();
            if (!db) return;
            const all = await reqAsPromise(tx(db).getAll());
            const now = Date.now();
            let deleted = 0;
            let totalSize = 0;
            for (const entry of all) {
                if (now - entry.addedAt > MAX_AGE_MS) {
                    try {
                        await reqAsPromise(tx(db, 'readwrite').delete(entry.url));
                        deleted++;
                    } catch (_) {}
                } else {
                    totalSize += entry.size || 0;
                }
            }
            if (totalSize > MAX_SIZE_BYTES) {
                await evictToTarget(MAX_SIZE_TARGET);
            }
            localStorage.setItem(CLEANUP_KEY, String(now));
            console.log(
                `[ImageCache] cleanup done — deleted ${deleted} expired, remaining ~${Math.round(totalSize / 1024 / 1024)}MB`
            );
        } catch (e) {
            console.warn('[ImageCache] cleanup error:', e);
        }
    }

    async function stats() {
        const db = await openDB();
        if (!db) return { available: false };
        const all = await reqAsPromise(tx(db).getAll());
        const totalSize = all.reduce((s, e) => s + (e.size || 0), 0);
        return {
            available: true,
            count: all.length,
            totalSizeMB: Math.round((totalSize / 1024 / 1024) * 100) / 100,
            maxSizeMB: MAX_SIZE_BYTES / 1024 / 1024,
            maxAgeDays: MAX_AGE_MS / 86400000,
        };
    }

    async function clear() {
        const db = await openDB();
        if (!db) return;
        await reqAsPromise(tx(db, 'readwrite').clear());
        localStorage.removeItem(CLEANUP_KEY);
    }

    // Request persistent storage (best-effort) — tránh browser auto-evict khi disk đầy
    if (navigator.storage?.persist) {
        navigator.storage.persisted().then((p) => {
            if (!p) navigator.storage.persist().catch(() => {});
        });
    }

    // Auto-cleanup khi load (throttled 1 lần/ngày)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => cleanup());
    } else {
        cleanup();
    }

    window.ImageCache = { getUrl, prefetch, cleanup, stats, clear };
})();
