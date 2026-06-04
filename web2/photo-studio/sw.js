// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Service worker cho web2/photo-studio (scope = thư mục này).
 *  - CDN model/lib/scene (mediapipe, esm.sh @imgly, google tflite, unsplash, lucide):
 *    cache-first → tải 1 lần, lần sau tức thì + chạy offline.
 *  - App shell same-origin (html/js/css trang này): network-first → luôn mới,
 *    fallback cache khi offline.
 * KHÔNG đụng phần còn lại của site (scope giới hạn /web2/photo-studio/).
 */
'use strict';

const CACHE = 'ps-cache-v2';
const CDN_RE = [
    /cdn\.jsdelivr\.net/,
    /esm\.sh/,
    /storage\.googleapis\.com/,
    /images\.unsplash\.com/,
    /unpkg\.com/,
    /staticimgly\.com/,
    /huggingface\.co/, // SlimSAM model weights (chọn đúng món)
    /cdn-lfs/,
];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
    e.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
            await self.clients.claim();
        })()
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // CDN model/lib/scene → cache-first (immutable, nặng)
    if (CDN_RE.some((re) => re.test(url.href))) {
        e.respondWith(
            (async () => {
                const c = await caches.open(CACHE);
                const hit = await c.match(req);
                if (hit) return hit;
                try {
                    const res = await fetch(req);
                    if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
                    return res;
                } catch (err) {
                    return hit || Response.error();
                }
            })()
        );
        return;
    }

    // App shell trang này → network-first
    if (url.origin === self.location.origin && url.pathname.includes('/web2/photo-studio/')) {
        e.respondWith(
            (async () => {
                try {
                    const res = await fetch(req);
                    const c = await caches.open(CACHE);
                    c.put(req, res.clone());
                    return res;
                } catch (err) {
                    const c = await caches.open(CACHE);
                    return (await c.match(req)) || Response.error();
                }
            })()
        );
    }
});
