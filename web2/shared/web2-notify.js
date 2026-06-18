// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — 1 NGUỒN toast/notify cho Web 2.0.
// =====================================================================
// Web2Notify — NGUỒN DUY NHẤT bắn toast/notify cho Web 2.0.
//
// Lý do (codemap §4): hàm `notify(msg,type)` copy rải ~5+ file, đều bridge
// notificationManager với fallback Popup/console. Gom 1 nguồn.
//
// API:
//   Web2Notify.show(msg, type?)   type: 'success'|'error'|'warning'|'info' (default 'info')
//   Web2Notify.success(msg) / error(msg) / warning(msg) / info(msg)
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2Notify) return;

    function show(msg, type) {
        const t = type || 'info';
        try {
            if (
                global.notificationManager &&
                typeof global.notificationManager.show === 'function'
            ) {
                global.notificationManager.show(msg, t);
                return;
            }
            if (global.Popup) {
                if (t === 'error') global.Popup.error(msg);
                else if (t === 'success') global.Popup.success(msg);
                else if (t === 'warning') global.Popup.warning(msg);
                else global.Popup.info(msg);
                return;
            }
        } catch {
            /* fall through to console */
        }
        // Last resort — không nuốt im lặng.
        if (t === 'error') console.error('[web2]', msg);
        else console.log('[web2]', msg);
    }

    global.Web2Notify = {
        show,
        success: (m) => show(m, 'success'),
        error: (m) => show(m, 'error'),
        warning: (m) => show(m, 'warning'),
        info: (m) => show(m, 'info'),
    };
})(typeof window !== 'undefined' ? window : globalThis);
