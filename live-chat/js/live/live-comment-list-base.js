// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Live Comment List UI — BASE module (shared helpers, constants, public shell).
 * Tách MOVE-only từ live-comment-list.js (2026-06-19) thành 6 module nhỏ. Public
 * API window.LiveCommentList được dựng ở module này (object rỗng) rồi các module
 * sau Object.assign methods vào CÙNG object → mọi `this.method()` + external
 * window.LiveCommentList.method() giữ nguyên. Internal namespace window._LiveCmtList
 * chứa helpers/constants để các module method tham chiếu byte-identical.
 *
 * Load theo thứ tự phụ thuộc: base → state → events → render-list → render-row →
 * actions. base PHẢI load TRƯỚC mọi module khác.
 *
 * Dependencies: LiveState, LiveApi, SharedUtils, sharedDebtManager, eventBus
 */
(function () {
    'use strict';

    // Internal namespace chia sẻ helpers/constants giữa các module split.
    const NS = (window._LiveCmtList = window._LiveCmtList || {});

    // Inline SVG icons — KHÔNG dùng <i data-lucide> + lucide.createIcons() trong
    // list. createIcons() scan TOÀN BỘ DOM mỗi call; mỗi comment có ~7 icon nên
    // 100 rows = 700 icon scan / render → lag nặng. Inline SVG render 1 lần, 0 scan.
    // (Cùng pattern đã áp dụng trong live-livestream-snap.js.)
    const _Live_ICON_PATHS = {
        facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
        save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
        'shopping-cart':
            '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
        'plus-square':
            '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/>',
        'check-square':
            '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
        user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        contact:
            '<path d="M16 18a4 4 0 0 0-8 0"/><rect width="18" height="18" x="3" y="4" rx="2"/><circle cx="12" cy="10" r="2"/><line x1="8" x2="8" y1="2" y2="4"/><line x1="16" x2="16" y1="2" y2="4"/>',
        reply: '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
        'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
        eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
        'eye-off':
            '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
        'user-x':
            '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/>',
    };

    /**
     * Inline SVG icon string (lucide-compatible paths, no DOM scan).
     * @param {string} name
     * @param {number} [size=13]
     * @param {string} [cls=''] extra class (vd 'channel-icon fb')
     * @returns {string}
     */
    function liveSvgIcon(name, size = 13, cls = '') {
        const p = _Live_ICON_PATHS[name];
        if (!p) return '';
        return `<svg xmlns="http://www.w3.org/2000/svg"${cls ? ` class="${cls}"` : ''} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;pointer-events:none;flex-shrink:0;">${p}</svg>`;
    }

    /**
     * Escape giá trị nhét vào HTML ATTRIBUTE (double-quoted). SharedUtils.escapeHtml
     * (textContent→innerHTML) KHÔNG escape dấu " → không an toàn cho attribute.
     * Helper này escape đủ &<>"' — dùng cho data-*, value, id, title.
     * @param {*} v
     * @returns {string}
     */
    function liveAttr(v) {
        return String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Cap render: chỉ dựng N comment MỚI NHẤT trong DOM (comments sorted newest-first).
    // 843 dòng non-virtualized → mỗi render reflow O(n) + inventory-panel/livestream-snap
    // quét all rows → giật. Cap giữ DOM nhỏ (~200) → nhẹ. Nút "xem cũ hơn" tăng cap.
    const RENDER_LIMIT_INITIAL = 200;
    const RENDER_LIMIT_STEP = 200;

    // ENFORCE-PREP: gắn x-web2-token cho route web2 soft-gated (WEB2_AUTH_ENFORCE).
    // Chưa login web2 → bỏ qua header, request vẫn đi (server enforce → 401).
    function _liveW2Auth(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra || {});
        const h = { ...(extra || {}) };
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null');
            if (t && t.token) h['x-web2-token'] = t.token;
        } catch {
            /* no token */
        }
        return h;
    }

    // Expose helpers/constants vào internal namespace cho các module method.
    NS.liveSvgIcon = liveSvgIcon;
    NS.liveAttr = liveAttr;
    NS.RENDER_LIMIT_INITIAL = RENDER_LIMIT_INITIAL;
    NS.RENDER_LIMIT_STEP = RENDER_LIMIT_STEP;
    NS._liveW2Auth = _liveW2Auth;

    // Public object — methods được Object.assign vào từ các module sau. Tạo SHELL
    // ở đây (TRƯỚC mọi module) để external code (live-kho-enricher wrap renderComments,
    // app-init, live-init…) luôn thấy window.LiveCommentList tồn tại theo load order.
    if (typeof window !== 'undefined') {
        window.LiveCommentList = window.LiveCommentList || {};
    }
})();
