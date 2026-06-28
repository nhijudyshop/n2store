// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Trợ lý AI (ai-hub) — tab "Gemini Free" = THIN WRAPPER mount module shared
 * Web2GeminiChat (web2/shared/web2-gemini-chat.js). Chat TEXT bằng tài khoản
 * Gemini cookie của shop (FREE) qua sidecar gemini-tryon /chat — multi-turn,
 * xem được đoạn hội thoại. KHÔNG fork logic; trang chỉ mount vào #aihGeminiMount.
 */
(function (global) {
    'use strict';

    let inst = null;
    function init() {
        /* lazy — chỉ mount khi mở tab (onShow) */
    }
    function onShow() {
        if (inst) return;
        const host = document.getElementById('aihGeminiMount');
        if (!host) return;
        if (!global.Web2GeminiChat || !global.Web2GeminiChat.mount) {
            host.innerHTML =
                '<div style="padding:24px;text-align:center;color:var(--web2-danger,#dc2626);font-size:.84rem">⚠️ Chưa tải module Chat Gemini (web2-gemini-chat.js)</div>';
            return;
        }
        inst = global.Web2GeminiChat.mount(host);
        if (global.lucide) global.lucide.createIcons();
    }

    global.AiGeminiChat = { init, onShow };
})(window);
