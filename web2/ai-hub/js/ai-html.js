// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Trợ lý AI (ai-hub) — tab "HTML Studio" = THIN WRAPPER mount module shared
 * Web2ContentMaker (web2/shared/web2-content-maker.js). 1 NGUỒN dùng chung với
 * widget ✨ — KHÔNG fork logic. Web2ContentMaker tự điều phối Web2HtmlSkill +
 * Web2VideoRender; trang chỉ mount vào #aihHtml.
 */
(function (global) {
    'use strict';

    let inst = null;
    function init() {
        /* lazy — chỉ mount khi mở tab (onShow) */
    }
    function onShow() {
        if (inst) return;
        const host = document.getElementById('aihHtml');
        if (!host) return;
        if (!global.Web2ContentMaker || !global.Web2ContentMaker.mount) {
            host.innerHTML =
                '<div style="padding:24px;text-align:center;color:var(--web2-danger,#dc2626);font-size:.84rem">⚠️ Chưa tải module Tạo nội dung (web2-content-maker.js)</div>';
            return;
        }
        inst = global.Web2ContentMaker.mount(host, { compact: false });
        if (global.lucide) global.lucide.createIcons();
    }

    global.AiHtml = { init, onShow };
})(window);
