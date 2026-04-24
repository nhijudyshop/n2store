// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * TPOS IMAGE PROXY (Shared)
 * =====================================================
 * Proxies TPOS product images through Cloudflare Worker
 * (primary) with Render server fallback on failure.
 *
 * Why two proxies:
 *   - Browser HTTP/2 caps concurrent streams per-origin.
 *     With 100+ TPOS images on one page, vn.img1.tpos.vn
 *     starts returning ERR_HTTP2_SERVER_REFUSED_STREAM.
 *   - CF Worker proxies via a different origin, and can be
 *     hit in parallel with the Render proxy to spread load
 *     across two browser-visible origins.
 *
 * Fallback behavior:
 *   - Primary: CF Worker
 *   - On <img> onerror → rewrite src to Render proxy once
 *   - After Render fails → hide image (default onerror behavior)
 *
 * Usage:
 *   proxyImageUrl(url) → primary (CF Worker) proxied URL
 *   fallbackImageUrl(url) → Render proxied URL (only on primary failure)
 *   proxyImgTag(url, alt) → <img> HTML with fallback chain
 *
 * Only proxies vn.img1.tpos.vn URLs. Others pass through.
 * =====================================================
 */

(function () {
    'use strict';

    const TPOS_CDN_PATTERN = /vn\.img1\.tpos\.vn/;
    const PROXIED_PATTERN = /\/api\/image-proxy\?/;
    const RENDER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const FAILED_MARK_ATTR = 'data-tpos-fallback';

    function getWorkerUrl() {
        return (
            window.WORKER_URL ||
            window.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }

    function extractOriginalUrl(src) {
        if (!src) return '';
        const match = src.match(/[?&]url=([^&]+)/);
        if (!match) return src;
        try {
            return decodeURIComponent(match[1]);
        } catch (_) {
            return src;
        }
    }

    /**
     * Convert a TPOS CDN URL to CF Worker proxied URL.
     * Non-TPOS URLs pass through unchanged.
     */
    function proxyImageUrl(url) {
        if (!url) return '';
        if (!TPOS_CDN_PATTERN.test(url)) return url;
        if (PROXIED_PATTERN.test(url)) return url;
        return `${getWorkerUrl()}/api/image-proxy?url=${encodeURIComponent(url)}`;
    }

    /**
     * Render-server fallback URL — used when CF Worker fails.
     */
    function fallbackImageUrl(url) {
        if (!url) return '';
        const original = PROXIED_PATTERN.test(url) ? extractOriginalUrl(url) : url;
        if (!TPOS_CDN_PATTERN.test(original)) return original;
        return `${RENDER_URL}/api/image-proxy?url=${encodeURIComponent(original)}`;
    }

    /**
     * onerror handler: swap CF Worker → Render proxy once.
     * After Render fails, hide the image.
     * Idempotent — marks the element so it only attempts fallback once.
     */
    function handleImageError(img) {
        if (!img || img.getAttribute(FAILED_MARK_ATTR) === 'done') {
            if (img) img.style.display = 'none';
            const sib = img && img.nextElementSibling;
            if (sib) sib.style.display = 'flex';
            return;
        }
        img.setAttribute(FAILED_MARK_ATTR, 'done');
        const current = img.getAttribute('src') || '';
        const next = fallbackImageUrl(current);
        if (next && next !== current) {
            img.src = next;
        } else {
            img.style.display = 'none';
            const sib = img.nextElementSibling;
            if (sib) sib.style.display = 'flex';
        }
    }

    // Expose handler on window so inline onerror can call it
    window.__tposImgFallback = handleImageError;

    /**
     * Generate <img> tag with proxy URL + fallback chain.
     * If caller passed their own onerror (via extraAttrs), we still
     * wire our fallback first.
     */
    function proxyImgTag(url, alt, extraAttrs) {
        if (!url) return '';
        const proxied = proxyImageUrl(url);
        const altEsc = (alt || '').replace(/"/g, '&quot;');
        const attrs = extraAttrs || '';
        return `<img src="${proxied}" alt="${altEsc}" ${attrs} onerror="window.__tposImgFallback&&window.__tposImgFallback(this)">`;
    }

    /**
     * Auto-intercept: MutationObserver rewrites all TPOS CDN img src
     * to go through CF Worker proxy + installs fallback. Covers dynamically
     * added images.
     */
    function interceptImages(root) {
        const imgs = (root || document).querySelectorAll('img[src]');
        imgs.forEach(rewriteImg);
    }

    function rewriteImg(img) {
        const src = img.getAttribute('src') || '';
        if (!TPOS_CDN_PATTERN.test(src)) return;
        if (!PROXIED_PATTERN.test(src)) {
            img.setAttribute('src', proxyImageUrl(src));
        }
        // Always attach fallback onerror even for pre-proxied URLs
        if (!img.getAttribute('data-tpos-fallback-wired')) {
            img.setAttribute('data-tpos-fallback-wired', '1');
            const prev = img.getAttribute('onerror') || '';
            const hook = 'window.__tposImgFallback&&window.__tposImgFallback(this);';
            if (!prev.includes('__tposImgFallback')) {
                img.setAttribute('onerror', hook + prev);
            }
        }
    }

    // Proactive HTML string rewrite — ngăn browser parser load raw TPOS URL ngay từ đầu.
    // MutationObserver bên dưới chỉ rewrite sau khi DOM đã parse → browser đã bắn request raw
    // → vẫn có thể hit HTTP/2 REFUSED_STREAM. Hook này rewrite string trước khi parser chạm vào.
    // Chỉ trigger khi string chứa TPOS URL, nên không ảnh hưởng perf đa số innerHTML calls.
    const IMG_SRC_RE = /(<img\b[^>]*?\bsrc=["'])(https?:\/\/vn\.img1\.tpos\.vn[^"']+)(["'])/gi;
    function rewriteHtmlString(s) {
        if (typeof s !== 'string') return s;
        if (!TPOS_CDN_PATTERN.test(s)) return s;
        return s.replace(IMG_SRC_RE, (_, pre, url, post) => {
            if (PROXIED_PATTERN.test(url)) return pre + url + post;
            return pre + proxyImageUrl(url) + post;
        });
    }

    try {
        const htmlDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        if (htmlDesc && htmlDesc.set && htmlDesc.configurable !== false) {
            Object.defineProperty(Element.prototype, 'innerHTML', {
                ...htmlDesc,
                set(v) {
                    return htmlDesc.set.call(this, rewriteHtmlString(v));
                },
            });
        }
        const iah = Element.prototype.insertAdjacentHTML;
        if (typeof iah === 'function') {
            Element.prototype.insertAdjacentHTML = function (position, html) {
                return iah.call(this, position, rewriteHtmlString(html));
            };
        }
    } catch (_) {
        // Best-effort — if prototype hardening blocks redefine, MutationObserver still catches.
    }

    // Observe DOM for new images
    if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach((node) => {
                        if (node.nodeType !== 1) return;
                        if (node.tagName === 'IMG') rewriteImg(node);
                        else if (node.querySelectorAll) {
                            node.querySelectorAll('img[src*="tpos.vn"]').forEach(rewriteImg);
                        }
                    });
                } else if (m.type === 'attributes' && m.target.tagName === 'IMG') {
                    rewriteImg(m.target);
                }
            }
        });

        // Start observing after DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                interceptImages();
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['src'],
                });
            });
        } else {
            interceptImages();
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src'],
            });
        }
    }

    // Expose
    window.TPOSImageProxy = {
        proxyImageUrl,
        fallbackImageUrl,
        proxyImgTag,
        interceptImages,
        handleImageError,
    };
})();
