// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2AvatarUtils — 1 NGUỒN avatar (màu + chữ cái + proxy URL + HTML) Web 2.0.
//
// Lý do (dedup, 2026-06-19): avatarColor/firstChar/renderAvatar/fb-avatar URL
// copy-paste ở native-orders-state.js (hex màu, charCode sum), chat-panel-state
// (gradient), web2-pm-customer-search (inline ini+img). Cùng pattern: chữ cái
// đầu trên nền màu deterministic + ảnh FB proxy phủ lên, lỗi ảnh → tự remove
// để lộ chữ cái. Gom 1 nguồn để màu/HTML thống nhất mọi nơi.
//
// API:
//   Web2AvatarUtils.color(seed)          → hex màu ("#2a96ff") deterministic
//   Web2AvatarUtils.initial(name)        → 1-2 ký tự HOA (đã escape an toàn)
//   Web2AvatarUtils.proxyUrl(fbId,pageId)→ URL /api/fb-avatar (rỗng nếu fbId rác)
//   Web2AvatarUtils.html(opts)           → <div> avatar (img + chữ fallback)
//        opts: { name, fbId, pageId, url, size, className }
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2AvatarUtils) return;

    // Palette hex (theo native-orders-state — xanh Zalo lặp lại cho cân bằng).
    var COLORS = [
        '#2a96ff',
        '#ec4899',
        '#ef4444',
        '#f59e0b',
        '#10b981',
        '#3b82f6',
        '#06b6d4',
        '#8b5cf6',
        '#0068ff',
    ];

    function _esc(v) {
        if (global.Web2Escape && global.Web2Escape.escapeHtml) {
            return global.Web2Escape.escapeHtml(v);
        }
        if (v == null) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Màu nền deterministic theo seed (charCode sum) — cùng tên = cùng màu.
    function color(seed) {
        var s = String(seed || '');
        var sum = 0;
        for (var i = 0; i < s.length; i++) sum += s.charCodeAt(i);
        return COLORS[sum % COLORS.length];
    }

    // Chữ cái đầu (1 ký tự HOA), đã escape. '?' nếu rỗng.
    function initial(name) {
        var c = (
            String(name || '?')
                .trim()
                .charAt(0) || '?'
        ).toUpperCase();
        return _esc(c);
    }

    function _workerUrl() {
        return (
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            (global.Web2Chat &&
                global.Web2Chat._internal &&
                global.Web2Chat._internal.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }

    // FB id hợp lệ là chuỗi SỐ ≥5 ký tự (PSID/global id). Rác → '' (KHÔNG proxy).
    // /api/fb-avatar trả SVG silhouette cho id không tồn tại → che mất chữ cái.
    function _isRealFbId(id) {
        return /^\d{5,}$/.test(String(id || '').trim());
    }

    // URL FB avatar qua CF Worker proxy. Rỗng nếu fbId rác.
    // Signature: ?id= + &page= (đồng nhất với native-orders + chat-panel).
    function proxyUrl(fbId, pageId) {
        if (!_isRealFbId(fbId)) return '';
        var u = _workerUrl() + '/api/fb-avatar?id=' + encodeURIComponent(String(fbId).trim());
        if (pageId) u += '&page=' + encodeURIComponent(pageId);
        return u;
    }

    // HTML avatar: chữ cái trên nền màu + ảnh FB phủ lên. Ảnh lỗi → tự remove
    // (chữ cái lộ ra). url trực tiếp ưu tiên hơn proxy theo fbId/pageId.
    function html(opts) {
        var o = opts || {};
        var bg = color(o.name);
        var ch = initial(o.name);
        var cls = _esc(o.className || 'w2-avatar');
        var sizeStyle = o.size
            ? 'width:' + Number(o.size) + 'px;height:' + Number(o.size) + 'px;'
            : '';
        var src = o.url
            ? global.Web2Escape && global.Web2Escape.safeImageUrl
                ? global.Web2Escape.safeImageUrl(o.url)
                : String(o.url)
            : proxyUrl(o.fbId, o.pageId);
        var base =
            'position:relative;display:inline-flex;align-items:center;justify-content:center;' +
            'border-radius:50%;overflow:hidden;color:#fff;font-weight:700;' +
            'background:' +
            bg +
            ';' +
            sizeStyle;
        if (!src) {
            return '<div class="' + cls + '" style="' + base + '">' + ch + '</div>';
        }
        return (
            '<div class="' +
            cls +
            '" style="' +
            base +
            '">' +
            '<span class="' +
            cls +
            '-initial">' +
            ch +
            '</span>' +
            '<img class="' +
            cls +
            '-img" src="' +
            _esc(src) +
            '" alt="" loading="lazy" ' +
            'style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" ' +
            'onload="this.classList.add(\'loaded\')" onerror="this.remove()">' +
            '</div>'
        );
    }

    global.Web2AvatarUtils = { color: color, initial: initial, proxyUrl: proxyUrl, html: html };
})(typeof window !== 'undefined' ? window : globalThis);
