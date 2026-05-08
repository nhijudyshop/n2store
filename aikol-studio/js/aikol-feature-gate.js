// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// AI Tools feature gate — mặc định AI tắt cho mọi user. Phải vào aikol-studio
// index → toggle ON mới được dùng các sub-page (library, models, history, …).
// Stored: localStorage.aiToolsEnabled === 'true'.
(function (global) {
    'use strict';

    const STORAGE_KEY = 'aiToolsEnabled';

    function isEnabled() {
        try {
            return global.localStorage?.getItem(STORAGE_KEY) === 'true';
        } catch (_) {
            return false;
        }
    }

    function setEnabled(value) {
        try {
            global.localStorage?.setItem(STORAGE_KEY, value ? 'true' : 'false');
            global.dispatchEvent(
                new CustomEvent('aikol:feature-toggled', { detail: { enabled: !!value } })
            );
        } catch (_) {}
    }

    // Sub-page guard: gọi sớm trên load. Nếu disabled → redirect về index với
    // hash #disabled để index hiển thị banner cho user toggle ON.
    function requireEnabled(redirectUrl = './index.html#disabled') {
        if (isEnabled()) return true;
        try {
            global.location.replace(redirectUrl);
        } catch (_) {}
        return false;
    }

    global.AikolGate = { isEnabled, setEnabled, requireEnabled, STORAGE_KEY };
})(typeof window !== 'undefined' ? window : globalThis);
