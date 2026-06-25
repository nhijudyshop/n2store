// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Trợ lý AI (ai-hub) — tab "Ghép đồ" = THIN WRAPPER mount module shared Web2Tryon
 * (web2/shared/web2-tryon.js). 1 NGUỒN dùng chung với widget ✨ — KHÔNG fork logic.
 * Toàn bộ UI + gọi Nano Banana nằm trong Web2Tryon; trang chỉ mount vào #aihTryMount.
 */
(function (global) {
    'use strict';

    let inst = null;
    function init() {
        /* lazy — chỉ mount khi mở tab (onShow) */
    }
    function onShow() {
        if (inst) return;
        const host = document.getElementById('aihTryMount');
        if (!host) return;
        if (!global.Web2Tryon || !global.Web2Tryon.mount) {
            host.innerHTML =
                '<div style="padding:24px;text-align:center;color:var(--web2-danger,#dc2626);font-size:.84rem">⚠️ Chưa tải module Ghép đồ (web2-tryon.js)</div>';
            return;
        }
        inst = global.Web2Tryon.mount(host, { compact: false });
        if (global.lucide) global.lucide.createIcons();
    }

    global.AiTryon = { init, onShow };
})(window);
