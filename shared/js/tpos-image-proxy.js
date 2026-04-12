// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * TPOS IMAGE PROXY (Shared)
 * =====================================================
 * Proxies TPOS product images through Cloudflare Worker
 * to bypass CORS/CDN errors (ERR_FAILED).
 *
 * Usage:
 *   proxyImageUrl(url) → proxied URL string
 *   proxyImgTag(url, alt) → <img> HTML with onerror fallback
 *
 * Only proxies vn.img1.tpos.vn URLs. Others pass through.
 * =====================================================
 */

(function() {
    'use strict';

    const TPOS_CDN_PATTERN = /vn\.img1\.tpos\.vn/;

    function getWorkerUrl() {
        return window.WORKER_URL
            || window.API_CONFIG?.WORKER_URL
            || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    }

    /**
     * Convert a TPOS CDN URL to proxied URL via CF Worker
     * Non-TPOS URLs pass through unchanged.
     */
    function proxyImageUrl(url) {
        if (!url) return '';
        if (!TPOS_CDN_PATTERN.test(url)) return url;
        return `${getWorkerUrl()}/api/image-proxy?url=${encodeURIComponent(url)}`;
    }

    /**
     * Generate <img> tag with proxy URL + onerror fallback
     */
    function proxyImgTag(url, alt, extraAttrs) {
        if (!url) return '';
        const proxied = proxyImageUrl(url);
        const altEsc = (alt || '').replace(/"/g, '&quot;');
        const attrs = extraAttrs || '';
        return `<img src="${proxied}" alt="${altEsc}" ${attrs} onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex'">`;
    }

    /**
     * Auto-intercept: MutationObserver rewrites all TPOS CDN img src
     * to go through CF Worker proxy. Covers dynamically added images.
     */
    function interceptImages(root) {
        const imgs = (root || document).querySelectorAll('img[src]');
        imgs.forEach(rewriteImg);
    }

    function rewriteImg(img) {
        const src = img.getAttribute('src') || '';
        if (!TPOS_CDN_PATTERN.test(src)) return;
        if (src.includes('/api/image-proxy')) return; // already proxied
        img.setAttribute('src', proxyImageUrl(src));
    }

    // Observe DOM for new images
    if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach(node => {
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
                    childList: true, subtree: true,
                    attributes: true, attributeFilter: ['src']
                });
            });
        } else {
            interceptImages();
            observer.observe(document.body, {
                childList: true, subtree: true,
                attributes: true, attributeFilter: ['src']
            });
        }
    }

    // Expose
    window.TPOSImageProxy = {
        proxyImageUrl,
        proxyImgTag,
        interceptImages
    };

})();
