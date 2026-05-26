// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// N2Store Extension - Content Script
// Bridge between web page (N2Store) and service worker (background)
// API-compatible with Pancake Extension contentscript.js

(function () {
    'use strict';

    // Marker để web page detect extension đã cài (dùng cho install-prompt modal).
    // Set ngay đầu IIFE, trước mọi async work, để web check ngay được.
    try {
        const v = (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '?';
        document.documentElement.setAttribute('data-n2store-extension', v);
        // Dispatch event cho code chạy SAU contentscript (nếu listener đã register kịp)
        window.dispatchEvent(
            new CustomEvent('n2store-extension-ready', { detail: { version: v } })
        );
    } catch {}

    const PREFIX_IN = '[CS→BG]';
    const PREFIX_OUT = '[BG→CS]';

    // Message types to forward from page → service worker
    const INBOUND_TYPES = new Set([
        'REPLY_INBOX_PHOTO',
        'UPLOAD_INBOX_PHOTO',
        'PREINITIALIZE_PAGES',
        'GET_BUSINESS_CONTEXT',
        'GET_GLOBAL_ID_FOR_CONV',
        'CHECK_EXTENSION_VERSION',
        'WAKE_UP',
        'SEND_COMMENT',
        'EDIT_COMMENT',
        'REMOVE_COMMENT',
        'SEND_PRIVATE_REPLY',
        'REACT_MESSAGE',
        'BLOCK_FACEBOOK_USER',
        'CHANGE_CONV_STATUS_TO_ARCHIVED',
        'GET_PROFILE_INFO',
        'GET_PROFILE_LINK',
        'GET_BIRTHDAY_INFO',
        'GET_POST_ID_FROM_LINK',
        'GET_IMG_FROM_SHARED_ATTACHMENT',
        'LOAD_FACEBOOK_MESSAGES',
        'LOAD_FB_POST',
        'GET_FB_MSG',
        'MAKE_MESSENGER_LINK',
        'DOWNLOAD_FILE',
        'REPLY_INBOX_PRODUCT',
        'INVITE_LIKE_PAGE',
        'GET_STICKERS',
        'GET_PACK_STICKERS',
        'BATCH_GET_GLOBAL_ID',
        'SET_ACCESS_TOKEN',
        'PRELOAD_DOC_IDS',
        // OnCallCX
        'ADD_CALL_LOG',
        'GET_CALL_LOG',
        'GET_ONCALL_SETTINGS',
        'OPEN_PHONE',
        // Livestream Snapshot capture (no popup)
        'N2_CAPTURE_VISIBLE_TAB',
    ]);

    // Message types to forward from service worker → page
    const OUTBOUND_TYPES = new Set([
        'EXTENSION_LOADED',
        'EXTENSION_VERSION',
        'EXTENSION_NOTIFICATIONS',
        'REPORT_EXTENSION_STATUS',
        'PREINITIALIZE_PAGES_DONE',
        'REPLY_INBOX_PHOTO_SUCCESS',
        'REPLY_INBOX_PHOTO_FAILURE',
        'UPLOAD_INBOX_PHOTO_SUCCESS',
        'UPLOAD_INBOX_PHOTO_FAILURE',
        'SEND_COMMENT_SUCCESS',
        'SEND_COMMENT_FAILURE',
        'EDIT_COMMENT_SUCCESS',
        'EDIT_COMMENT_FAILURE',
        'REMOVE_COMMENT_SUCCESS',
        'REMOVE_COMMENT_FAILURE',
        'SEND_PRIVATE_REPLY_SUCCESS',
        'SEND_PRIVATE_REPLY_FAILURE',
        'GET_GLOBAL_ID_FOR_CONV_SUCCESS',
        'GET_GLOBAL_ID_FOR_CONV_FAILURE',
        'GET_BUSINESS_CONTEXT_SUCCESS',
        'GET_BUSINESS_CONTEXT_FAILURE',
        'GET_PROFILE_INFO_SUCCESS',
        'GET_PROFILE_INFO_FAILURE',
        'GET_PROFILE_LINK_SUCCESS',
        'GET_PROFILE_LINK_FAILURE',
        'GET_BIRTHDAY_INFO_SUCCESS',
        'GET_BIRTHDAY_INFO_FAILURE',
        'GET_POST_ID_FROM_LINK_SUCCESS',
        'GET_POST_ID_FROM_LINK_FAILURE',
        'GET_IMG_FROM_SHARED_ATTACHMENT_SUCCESS',
        'GET_IMG_FROM_SHARED_ATTACHMENT_FAILURE',
        'LOAD_FACEBOOK_MESSAGES_SUCCESS',
        'LOAD_FACEBOOK_MESSAGES_FAILURE',
        'LOAD_FB_POST_SUCCESS',
        'LOAD_FB_POST_FAILURE',
        'GET_FB_MSG_SUCCESS',
        'GET_FB_MSG_FAILURE',
        'MAKE_MESSENGER_LINK_SUCCESS',
        'MAKE_MESSENGER_LINK_FAILURE',
        'REACT_MESSAGE_SUCCESS',
        'REACT_MESSAGE_FAILURE',
        'BLOCK_FACEBOOK_USER_SUCCESS',
        'BLOCK_FACEBOOK_USER_FAILURE',
        'CHANGE_CONV_STATUS_TO_ARCHIVED_SUCCESS',
        'CHANGE_CONV_STATUS_TO_ARCHIVED_FAILURE',
        'DOWNLOAD_FILE_SUCCESS',
        'DOWNLOAD_FILE_FAILURE',
        'BATCH_GET_GLOBAL_ID_SUCCESS',
        'BATCH_GET_GLOBAL_ID_FAILURE',
        'INVITE_LIKE_PAGE_START',
        'INVITE_LIKE_PAGE_PROGRESS',
        'INVITE_LIKE_PAGE_END',
        'REPLY_INBOX_PRODUCT_SUCCESS',
        'REPLY_INBOX_PRODUCT_FAILURE',
        'GET_STICKERS_SUCCESS',
        'GET_STICKERS_FAILURE',
        'GET_PACK_STICKERS_SUCCESS',
        'GET_PACK_STICKERS_FAILURE',
        // OnCallCX
        'ADD_CALL_LOG_SUCCESS',
        'ADD_CALL_LOG_FAILURE',
        'GET_CALL_LOG_SUCCESS',
        'GET_CALL_LOG_FAILURE',
        'GET_ONCALL_SETTINGS_SUCCESS',
        'GET_ONCALL_SETTINGS_FAILURE',
        // Livestream Snapshot capture responses
        'N2_CAPTURE_VISIBLE_TAB_SUCCESS',
        'N2_CAPTURE_VISIBLE_TAB_FAILURE',
    ]);

    // === PORT CONNECTION ===

    let port = null;
    let wakeUpTimer = null;
    let _dead = false; // Extension context invalidated — stop all retries

    function _isDead(err) {
        return _dead || (err && /invalidated|Extension context/i.test(err.message));
    }

    function connect() {
        if (_dead) return;
        try {
            port = chrome.runtime.connect({ name: 'n2store_tab' });

            // Forward messages from service worker → page
            port.onMessage.addListener((msg) => {
                if (msg && msg.type) {
                    if (OUTBOUND_TYPES.has(msg.type)) {
                        console.log(PREFIX_OUT, msg.type, JSON.stringify(msg).substring(0, 300));
                        window.postMessage(msg, '*');
                    }
                }
            });

            port.onDisconnect.addListener(() => {
                port = null;
                if (wakeUpTimer) clearInterval(wakeUpTimer);
                const lastErr = chrome.runtime.lastError;
                if (_isDead(lastErr)) {
                    _dead = true;
                    console.warn(
                        '[N2EXT] Extension context invalidated. Reload page to reconnect.'
                    );
                    return;
                }
                console.log('[N2EXT] Port disconnected, reconnecting in 1s...');
                setTimeout(connect, 1000);
            });

            // Start keep-alive
            if (wakeUpTimer) clearInterval(wakeUpTimer);
            wakeUpTimer = setInterval(() => {
                try {
                    if (port) port.postMessage({ type: 'WAKE_UP' });
                } catch (e) {
                    clearInterval(wakeUpTimer);
                    if (_isDead(e)) {
                        _dead = true;
                        return;
                    }
                    console.log('[N2EXT] WAKE_UP failed, reconnecting...');
                    setTimeout(connect, 1000);
                }
            }, 10000);

            console.log('[N2EXT] Connected to service worker');
        } catch (err) {
            if (_isDead(err)) {
                _dead = true;
                console.warn('[N2EXT] Extension context invalidated. Reload page to reconnect.');
                return;
            }
            console.error('[N2EXT] Failed to connect:', err.message);
            setTimeout(connect, 2000);
        }
    }

    // === PAGE → SERVICE WORKER ===

    window.addEventListener(
        'message',
        (event) => {
            if (event.source !== window) return;

            const data = event.data;
            if (!data || !data.type) return;

            // Only forward known inbound types
            if (INBOUND_TYPES.has(data.type)) {
                if (data.type !== 'WAKE_UP') {
                    console.log(PREFIX_IN, data.type, JSON.stringify(data).substring(0, 300));
                }

                if (port) {
                    try {
                        port.postMessage(data);
                    } catch (err) {
                        console.error('[N2EXT] Failed to send to service worker:', err.message);
                        // Try reconnecting
                        connect();
                        setTimeout(() => {
                            if (port) port.postMessage(data);
                        }, 500);
                    }
                } else {
                    console.warn('[N2EXT] Port not connected, queuing reconnect...');
                    connect();
                }
            }
        },
        false
    );

    // Livestream Snapshot — receive N2_TAB_STREAM_ID từ popup (qua chrome.tabs
    // .sendMessage), relay vào page qua window.postMessage. Page consume streamId
    // bằng navigator.mediaDevices.getUserMedia({chromeMediaSourceId}). 10s deadline
    // từ Chrome — page phải getUserMedia gấp.
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'N2_TAB_STREAM_ID' && msg.streamId) {
            console.log(PREFIX_OUT, 'N2_TAB_STREAM_ID forwarded to page');
            window.postMessage(
                { type: 'N2_TAB_STREAM_ID', streamId: msg.streamId, ts: msg.ts },
                '*'
            );
        }
    });

    // Page-triggered streamId grab (modal Enter / button click). Page postMessage
    // 'N2_TAB_STREAM_GRAB_REQUEST' synchronously trong user gesture handler →
    // forward chrome.runtime.sendMessage NGAY → background gọi getMediaStreamId.
    // Activation context theory: page gesture → window.postMessage (sync) →
    // content script listener (sync) → chrome.runtime.sendMessage (preserves
    // activation). Chrome có propagate hay không = tùy implementation.
    window.addEventListener(
        'message',
        (event) => {
            if (event.source !== window) return;
            if (event.data?.type !== 'N2_TAB_STREAM_GRAB_REQUEST') return;
            try {
                chrome.runtime.sendMessage(
                    { type: 'N2_GRAB_TAB_STREAM_FROM_CLICK' },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.warn(
                                '[N2EXT] tab stream grab (page-trigger) fail:',
                                chrome.runtime.lastError.message
                            );
                            return;
                        }
                        if (response?.streamId) {
                            console.log('[N2EXT] tab streamId grabbed via page modal ✓');
                            window.postMessage(
                                {
                                    type: 'N2_TAB_STREAM_ID',
                                    streamId: response.streamId,
                                    ts: Date.now(),
                                },
                                '*'
                            );
                        } else {
                            console.warn(
                                '[N2EXT] tab stream grab (page-trigger) rejected:',
                                response?.error
                            );
                        }
                    }
                );
            } catch (e) {
                console.warn('[N2EXT] sendMessage threw:', e.message);
            }
        },
        false
    );

    // === AUTO TAB-STREAM GRAB ON FIRST USER CLICK ===
    // Trên tpos-pancake page, listen click bất kỳ đâu (capture phase) → forward
    // user activation context tới background → background gọi
    // chrome.tabCapture.getMediaStreamId. Chrome MAY propagate activation từ
    // content script's gesture handler qua chrome.runtime.sendMessage. Best-effort:
    // nếu Chrome accept → auto-enable stream mode (zero icon click). Nếu reject
    // → fallback popup icon click.
    // Match prod URL + localhost dev (browser test với --load-extension)
    if (
        /(https:\/\/nhijudy\.store|http:\/\/localhost(:\d+)?|http:\/\/127\.0\.0\.1(:\d+)?)\/tpos-pancake\//.test(
            location.href
        )
    ) {
        let _streamGrabAttempted = false;
        const _tryGrabStream = () => {
            if (_streamGrabAttempted) return;
            _streamGrabAttempted = true;
            try {
                chrome.runtime.sendMessage(
                    { type: 'N2_GRAB_TAB_STREAM_FROM_CLICK' },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.warn(
                                '[N2EXT] tab stream grab fail:',
                                chrome.runtime.lastError.message
                            );
                            _streamGrabAttempted = false; // allow retry on next click
                            return;
                        }
                        if (response?.streamId) {
                            console.log('[N2EXT] tab streamId grabbed via page click ✓');
                            window.postMessage(
                                {
                                    type: 'N2_TAB_STREAM_ID',
                                    streamId: response.streamId,
                                    ts: Date.now(),
                                },
                                '*'
                            );
                            // Unregister listener (no need for more clicks)
                            document.removeEventListener('click', _tryGrabStream, true);
                        } else {
                            console.warn('[N2EXT] tab stream grab rejected:', response?.error);
                            _streamGrabAttempted = false; // allow retry
                        }
                    }
                );
            } catch (e) {
                console.warn('[N2EXT] sendMessage threw:', e.message);
                _streamGrabAttempted = false;
            }
        };
        document.addEventListener('click', _tryGrabStream, true);
    }

    // === INITIALIZATION ===

    // Connect to service worker
    connect();

    // Notify page that extension is loaded
    // Compatible with Pancake Extension: { type: 'EXTENSION_LOADED', from: 'EXTENSION' }
    window.postMessage(
        {
            type: 'EXTENSION_LOADED',
            from: 'EXTENSION',
            extensionName: 'N2Store Messenger',
        },
        '*'
    );

    console.log('[N2EXT] Content script loaded');
})();
