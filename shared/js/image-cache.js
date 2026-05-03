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
    const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB cap (catalog ảnh TPOS lớn)
    const MAX_SIZE_TARGET = 400 * 1024 * 1024; // evict tới 400MB khi vượt cap
    const CLEANUP_KEY = 'imageCache_lastCleanupTs';
    const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // age-cleanup 1 lần/ngày
    const SIZE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // size check 5 phút/lần (không throttle như age-cleanup)
    const SIZE_CHECK_KEY = 'imageCache_lastSizeCheckTs';

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
            reqAsPromise(tx(db, 'readwrite').put({ ...entry, lastAccessedAt: Date.now() })).catch(
                () => {}
            );
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

    // Một số CDN không cho CORS từ origin khác (TPOS img\d.tpos.vn) →
    // route fetch qua CF Worker proxy để có response CORS-ok.
    const NON_CORS_PATTERNS = [/img\d*\.tpos\.vn/i];
    const WORKER_URL_FALLBACK = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    function getWorkerUrl() {
        return window.WORKER_URL || window.API_CONFIG?.WORKER_URL || WORKER_URL_FALLBACK;
    }
    function toCorsUrl(url) {
        // Đã là proxy URL rồi → giữ nguyên
        if (/\/api\/image-proxy\?/.test(url)) return url;
        if (NON_CORS_PATTERNS.some((p) => p.test(url))) {
            return `${getWorkerUrl()}/api/image-proxy?url=${encodeURIComponent(url)}`;
        }
        return url;
    }

    /**
     * Get blob URL (object URL từ cache, hoặc direct URL nếu cache fail).
     * Caller KHÔNG cần revoke — object URL valid suốt session.
     * KEY trong cache là URL gốc (không phải proxy URL) — share cache giữa
     * các caller dùng url gốc khác nhau.
     */
    async function getUrl(remoteUrl) {
        if (!remoteUrl) return remoteUrl;
        try {
            const cached = await get(remoteUrl);
            if (cached) return URL.createObjectURL(cached);

            // Fetch + cache. Wrap qua proxy nếu domain không cho CORS.
            const fetchUrl = toCorsUrl(remoteUrl);
            const res = await fetch(fetchUrl, { mode: 'cors', credentials: 'omit' });
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
     * Size-only check (throttle ngắn 5 phút) — evict khi cache vượt cap.
     * Không scan từng entry để xóa expired (đó là việc của cleanup).
     */
    async function sizeCheck() {
        try {
            const last = parseInt(localStorage.getItem(SIZE_CHECK_KEY) || '0', 10);
            if (Date.now() - last < SIZE_CHECK_INTERVAL_MS) return;
            const db = await openDB();
            if (!db) return;
            const all = await reqAsPromise(tx(db).getAll());
            const totalSize = all.reduce((s, e) => s + (e.size || 0), 0);
            if (totalSize > MAX_SIZE_BYTES) {
                console.log(
                    `[ImageCache] size-check: ${Math.round(totalSize / 1024 / 1024)}MB > cap ${MAX_SIZE_BYTES / 1024 / 1024}MB → evict to ${MAX_SIZE_TARGET / 1024 / 1024}MB`
                );
                await evictToTarget(MAX_SIZE_TARGET);
            }
            localStorage.setItem(SIZE_CHECK_KEY, String(Date.now()));
        } catch (_) {}
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

    // Auto-cleanup khi load: age-cleanup (1/ngày) + size-check (5 phút)
    function runMaintenance() {
        cleanup();
        sizeCheck();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runMaintenance);
    } else {
        runMaintenance();
    }

    /**
     * Quét rootEl tìm <img data-cache-src> + [data-cache-bg], hoán src/background sang blob URL.
     * Idempotent — đã apply rồi sẽ skip (đánh dấu data-cache-applied).
     */
    function applyTo(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        const imgs = root.querySelectorAll('img[data-cache-src]:not([data-cache-applied])');
        imgs.forEach((img) => {
            const remote = img.getAttribute('data-cache-src');
            if (!remote) return;
            img.setAttribute('data-cache-applied', '1');
            getUrl(remote)
                .then((blobUrl) => {
                    if (blobUrl && blobUrl !== remote) img.src = blobUrl;
                })
                .catch(() => {});
        });
        const bgs = root.querySelectorAll('[data-cache-bg]:not([data-cache-applied])');
        bgs.forEach((el) => {
            const remote = el.getAttribute('data-cache-bg');
            if (!remote) return;
            el.setAttribute('data-cache-applied', '1');
            getUrl(remote)
                .then((blobUrl) => {
                    if (blobUrl && blobUrl !== remote)
                        el.style.backgroundImage = `url('${blobUrl}')`;
                })
                .catch(() => {});
        });
    }

    /**
     * Set src của <img> qua cache (async). Caller có thể giữ fallback src cũ
     * trong lúc chờ cache resolve.
     */
    function setImgSrc(imgEl, remoteUrl) {
        if (!imgEl || !remoteUrl) return;
        getUrl(remoteUrl)
            .then((blobUrl) => {
                if (blobUrl) imgEl.src = blobUrl;
            })
            .catch(() => {
                imgEl.src = remoteUrl;
            });
    }

    /**
     * Auto-observe DOM for img elements matching configured URL patterns,
     * và auto-swap src → blob URL từ cache. Idempotent qua data-cache-wired flag.
     *
     * Default patterns: TPOS CDN (img\d+\.tpos\.vn), Firebase Storage,
     * Cloudflare Worker image-proxy. Caller có thể append patterns.
     */
    const AUTO_PATTERNS = [
        /img\d*\.tpos\.vn/i,
        /firebasestorage\.googleapis\.com/i,
        /\/api\/image-proxy\?/i,
    ];

    function shouldAutoCache(src) {
        if (!src || src.startsWith('blob:') || src.startsWith('data:')) return false;
        return AUTO_PATTERNS.some((p) => p.test(src));
    }

    function autoCacheImg(img) {
        if (!img || img.getAttribute('data-cache-wired')) return;
        const src = img.getAttribute('src') || img.src;
        if (!shouldAutoCache(src)) return;
        img.setAttribute('data-cache-wired', '1');
        setImgSrc(img, src);
    }

    function attachAutoObserver() {
        if (typeof MutationObserver === 'undefined') return;
        const scan = (root) => {
            (root || document)
                .querySelectorAll('img[src]:not([data-cache-wired])')
                .forEach(autoCacheImg);
        };
        const mo = new MutationObserver((muts) => {
            for (const m of muts) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach((n) => {
                        if (n.nodeType !== 1) return;
                        if (n.tagName === 'IMG') autoCacheImg(n);
                        else if (n.querySelectorAll) {
                            n.querySelectorAll('img[src]:not([data-cache-wired])').forEach(
                                autoCacheImg
                            );
                        }
                    });
                } else if (m.type === 'attributes' && m.target.tagName === 'IMG') {
                    autoCacheImg(m.target);
                }
            }
        });
        const start = () => {
            scan();
            mo.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src'],
            });
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
    }

    // Bật auto-observer mặc định — chỉ caches URLs match AUTO_PATTERNS.
    attachAutoObserver();

    window.ImageCache = {
        getUrl,
        prefetch,
        cleanup,
        sizeCheck,
        stats,
        clear,
        applyTo,
        setImgSrc,
        shouldAutoCache,
        AUTO_PATTERNS,
    };
})();
