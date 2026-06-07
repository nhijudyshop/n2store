// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 shared.
// =====================================================
// WEB2 EXTENSION BRIDGE
// Cầu nối tới N2 browser extension (n2store-extension) để GỬI tin nhắn FB
// qua Business Suite GraphQL — BYPASS quy tắc 24h của Pancake.
//
// Extension content script lắng nghe window.postMessage với `type` thuộc
// INBOUND_TYPES (REPLY_INBOX_PHOTO, GET_GLOBAL_ID_FOR_CONV, ...) rồi forward
// sang service worker. SW trả lại `type + '_SUCCESS'` hoặc `type + '_FAILURE'`
// (kèm taskId để match request). Khi load, extension announce EXTENSION_LOADED.
//
// Đây là bản TÁCH RA từ native-orders (_extensionRequest inline) để web2-pancake
// và các trang Web 2.0 khác dùng chung. Public API:
//   window.Web2Ext.hasExtension()            → boolean
//   window.Web2Ext.version()                 → string|null
//   window.Web2Ext.request(type, data, ms)   → Promise<{ok, data?, error?}>
//   window._w2ExtensionRequest(type,data,ms)  → alias request (web2-msg-template dùng)
// =====================================================
(function (global) {
    'use strict';
    if (global.Web2Ext) return; // idempotent — chỉ khởi tạo 1 lần

    let _ready = false;
    let _version = null;

    global.addEventListener('message', (e) => {
        const m = e.data;
        if (!m || typeof m !== 'object') return;
        if (m.type === 'EXTENSION_LOADED' || m.type === 'EXTENSION_VERSION') {
            _ready = true;
            _version = m.version || m.payload?.version || 'unknown';
            console.log('[Web2Ext] n2store-extension ready v' + _version);
        }
    });

    function hasExtension() {
        return _ready;
    }

    function version() {
        return _version;
    }

    /**
     * Gửi 1 request tới extension qua window.postMessage bridge.
     * @param {string} type - vd 'REPLY_INBOX_PHOTO', 'GET_GLOBAL_ID_FOR_CONV'
     * @param {object} data - payload (pageId, globalUserId, message, ...)
     * @param {number} timeoutMs
     * @returns {Promise<{ok:boolean, data?:object, error?:string}>}
     */
    function request(type, data, timeoutMs = 30000) {
        return new Promise((resolve) => {
            const taskId = `w2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const SUCCESS = type + '_SUCCESS';
            const FAILURE = type + '_FAILURE';
            let done = false;
            const onMsg = (e) => {
                const m = e.data;
                if (!m || typeof m !== 'object') return;
                if (m.taskId && m.taskId !== taskId) return;
                if (m.type === SUCCESS) {
                    done = true;
                    global.removeEventListener('message', onMsg);
                    resolve({ ok: true, data: m });
                } else if (m.type === FAILURE) {
                    done = true;
                    global.removeEventListener('message', onMsg);
                    resolve({ ok: false, error: m.error || 'Extension reported failure' });
                }
            };
            global.addEventListener('message', onMsg);
            global.postMessage({ ...data, type, taskId }, '*');
            setTimeout(() => {
                if (!done) {
                    global.removeEventListener('message', onMsg);
                    resolve({ ok: false, error: 'Extension timeout' });
                }
            }, timeoutMs);
        });
    }

    global.Web2Ext = { hasExtension, version, request };
    // web2-msg-template.js dùng `window.NativeOrdersApp?._extensionRequest || window._w2ExtensionRequest`
    if (!global._w2ExtensionRequest) global._w2ExtensionRequest = request;
})(window);
