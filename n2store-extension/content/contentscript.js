// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// N2Store Extension - Content Script
// Bridge between web page (N2Store) and service worker (background)
// API-compatible with Pancake Extension contentscript.js

(function () {
  'use strict';

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
  ]);

  // Message types to forward from service worker → page
  const OUTBOUND_TYPES = new Set([
    'EXTENSION_LOADED',
    'EXTENSION_VERSION',
    'EXTENSION_NOTIFICATIONS',
    'REPORT_EXTENSION_STATUS',
    'PREINITIALIZE_PAGES_DONE',
    'REPLY_INBOX_PHOTO_SUCCESS', 'REPLY_INBOX_PHOTO_FAILURE',
    'UPLOAD_INBOX_PHOTO_SUCCESS', 'UPLOAD_INBOX_PHOTO_FAILURE',
    'SEND_COMMENT_SUCCESS', 'SEND_COMMENT_FAILURE',
    'EDIT_COMMENT_SUCCESS', 'EDIT_COMMENT_FAILURE',
    'REMOVE_COMMENT_SUCCESS', 'REMOVE_COMMENT_FAILURE',
    'SEND_PRIVATE_REPLY_SUCCESS', 'SEND_PRIVATE_REPLY_FAILURE',
    'GET_GLOBAL_ID_FOR_CONV_SUCCESS', 'GET_GLOBAL_ID_FOR_CONV_FAILURE',
    'GET_BUSINESS_CONTEXT_SUCCESS', 'GET_BUSINESS_CONTEXT_FAILURE',
    'GET_PROFILE_INFO_SUCCESS', 'GET_PROFILE_INFO_FAILURE',
    'GET_PROFILE_LINK_SUCCESS', 'GET_PROFILE_LINK_FAILURE',
    'GET_BIRTHDAY_INFO_SUCCESS', 'GET_BIRTHDAY_INFO_FAILURE',
    'GET_POST_ID_FROM_LINK_SUCCESS', 'GET_POST_ID_FROM_LINK_FAILURE',
    'GET_IMG_FROM_SHARED_ATTACHMENT_SUCCESS', 'GET_IMG_FROM_SHARED_ATTACHMENT_FAILURE',
    'LOAD_FACEBOOK_MESSAGES_SUCCESS', 'LOAD_FACEBOOK_MESSAGES_FAILURE',
    'LOAD_FB_POST_SUCCESS', 'LOAD_FB_POST_FAILURE',
    'GET_FB_MSG_SUCCESS', 'GET_FB_MSG_FAILURE',
    'MAKE_MESSENGER_LINK_SUCCESS', 'MAKE_MESSENGER_LINK_FAILURE',
    'REACT_MESSAGE_SUCCESS', 'REACT_MESSAGE_FAILURE',
    'BLOCK_FACEBOOK_USER_SUCCESS', 'BLOCK_FACEBOOK_USER_FAILURE',
    'CHANGE_CONV_STATUS_TO_ARCHIVED_SUCCESS', 'CHANGE_CONV_STATUS_TO_ARCHIVED_FAILURE',
    'DOWNLOAD_FILE_SUCCESS', 'DOWNLOAD_FILE_FAILURE',
    'BATCH_GET_GLOBAL_ID_SUCCESS', 'BATCH_GET_GLOBAL_ID_FAILURE',
    'INVITE_LIKE_PAGE_START', 'INVITE_LIKE_PAGE_PROGRESS', 'INVITE_LIKE_PAGE_END',
    'REPLY_INBOX_PRODUCT_SUCCESS', 'REPLY_INBOX_PRODUCT_FAILURE',
    'GET_STICKERS_SUCCESS', 'GET_STICKERS_FAILURE',
    'GET_PACK_STICKERS_SUCCESS', 'GET_PACK_STICKERS_FAILURE',
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
          console.warn('[N2EXT] Extension context invalidated. Reload page to reconnect.');
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
          if (_isDead(e)) { _dead = true; return; }
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

  window.addEventListener('message', (event) => {
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
  }, false);

  // === INITIALIZATION ===

  // Connect to service worker
  connect();

  // Notify page that extension is loaded
  // Compatible with Pancake Extension: { type: 'EXTENSION_LOADED', from: 'EXTENSION' }
  window.postMessage({
    type: 'EXTENSION_LOADED',
    from: 'EXTENSION',
    extensionName: 'N2Store Messenger',
  }, '*');

  console.log('[N2EXT] Content script loaded');
})();
