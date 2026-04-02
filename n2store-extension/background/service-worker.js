// N2Store Extension - Service Worker (Entry Point)
// Routes messages from content script to appropriate Facebook module handlers
import { MSG, VERSION, BUILD } from '../shared/constants.js';
import { CONFIG } from '../shared/config.js';
import { log } from '../shared/logger.js';
import { handleReplyInboxPhoto } from './facebook/sender.js';
import { handleUploadInboxPhoto } from './facebook/uploader.js';
import { handleGetGlobalIdForConv, loadCacheFromStorage } from './facebook/global-id.js';
import { handlePreinitializePages, handleGetBusinessContext } from './facebook/session.js';

const MODULE = 'SW';

// Track connected tabs
const connectedPorts = new Map();

// === INITIALIZATION ===

log.info(MODULE, `N2Store Extension v${VERSION} (build ${BUILD}) starting...`);

// Load cached data on startup
loadCacheFromStorage();

// === KEEP-ALIVE ===

// Chrome alarms as backup keep-alive
chrome.alarms.create('keepAlive', { periodInMinutes: CONFIG.ALARM_INTERVAL_MIN });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    log.debug(MODULE, 'Keep-alive alarm fired');
  }
});

// === PORT CONNECTIONS ===

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'n2store_tab') return;

  const tabId = port.sender?.tab?.id || `port_${Date.now()}`;
  connectedPorts.set(tabId, port);
  log.info(MODULE, `Tab connected: ${tabId}, total: ${connectedPorts.size}`);

  port.onMessage.addListener((msg) => {
    handleMessage(msg, tabId, port);
  });

  port.onDisconnect.addListener(() => {
    connectedPorts.delete(tabId);
    log.info(MODULE, `Tab disconnected: ${tabId}, total: ${connectedPorts.size}`);
  });
});

// === MESSAGE HANDLER ===

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Handle messages from offscreen or popup
  if (msg?.type) {
    const tabId = sender?.tab?.id || 'internal';
    handleMessage(msg, tabId, null, sendResponse);
    return true; // Keep sendResponse alive for async
  }
});

/**
 * Main message router - dispatches to appropriate handler
 */
async function handleMessage(msg, tabId, port, asyncSendResponse) {
  const type = msg?.type;
  if (!type) return;

  // Create response sender that works with both port and sendResponse
  const sendResponse = (response) => {
    try {
      if (port && port.sender) {
        port.postMessage(response);
      } else if (asyncSendResponse) {
        asyncSendResponse(response);
      }
    } catch (err) {
      log.warn(MODULE, `Failed to send response to tab ${tabId}:`, err.message);
    }
  };

  // Broadcast to all connected tabs (for responses that should go to all)
  const broadcast = (response) => {
    for (const [id, p] of connectedPorts) {
      try {
        p.postMessage(response);
      } catch (err) {
        connectedPorts.delete(id);
      }
    }
  };

  switch (type) {
    // === Health & Lifecycle ===
    case MSG.WAKE_UP:
      // No-op, just keeps service worker alive
      break;

    case MSG.CHECK_EXTENSION_VERSION:
      sendResponse({
        type: MSG.EXTENSION_VERSION,
        version: VERSION,
        build: BUILD,
        name: CONFIG.EXTENSION_NAME,
      });
      break;

    // === Facebook Session ===
    case MSG.PREINITIALIZE_PAGES:
      try {
        const results = await handlePreinitializePages(msg);
        sendResponse({
          type: 'PREINITIALIZE_PAGES_DONE',
          results,
          taskId: msg.taskId,
        });
      } catch (err) {
        log.error(MODULE, 'PREINITIALIZE_PAGES error:', err.message);
      }
      break;

    case MSG.GET_BUSINESS_CONTEXT:
      try {
        const result = await handleGetBusinessContext(msg);
        sendResponse(result);
      } catch (err) {
        sendResponse({
          type: 'GET_BUSINESS_CONTEXT_FAILURE',
          taskId: msg.taskId,
          error: err.message,
        });
      }
      break;

    // === Core Messaging ===
    case MSG.REPLY_INBOX_PHOTO:
      await handleReplyInboxPhoto(msg, sendResponse);
      break;

    case MSG.UPLOAD_INBOX_PHOTO:
      await handleUploadInboxPhoto(msg, sendResponse);
      break;

    // === Global ID ===
    case MSG.GET_GLOBAL_ID_FOR_CONV:
      await handleGetGlobalIdForConv(msg, sendResponse);
      break;

    // === Comments (Phase 2 - stub for now) ===
    case MSG.SEND_COMMENT:
    case MSG.EDIT_COMMENT:
    case MSG.REMOVE_COMMENT:
    case MSG.SEND_PRIVATE_REPLY:
      sendResponse({
        type: `${type}_FAILURE`,
        taskId: msg.taskId,
        error: 'Not implemented yet (Phase 2)',
      });
      break;

    // === Interactions (Phase 2 - stub for now) ===
    case MSG.REACT_MESSAGE:
    case MSG.BLOCK_FACEBOOK_USER:
    case MSG.CHANGE_CONV_STATUS_TO_ARCHIVED:
    case MSG.GET_PROFILE_INFO:
    case MSG.GET_PROFILE_LINK:
    case MSG.GET_BIRTHDAY_INFO:
    case MSG.GET_POST_ID_FROM_LINK:
    case MSG.GET_IMG_FROM_SHARED_ATTACHMENT:
    case MSG.LOAD_FACEBOOK_MESSAGES:
    case MSG.LOAD_FB_POST:
    case MSG.GET_FB_MSG:
    case MSG.MAKE_MESSENGER_LINK:
    case MSG.DOWNLOAD_FILE:
    case MSG.REPLY_INBOX_PRODUCT:
    case MSG.INVITE_LIKE_PAGE:
    case MSG.GET_STICKERS:
    case MSG.GET_PACK_STICKERS:
    case MSG.BATCH_GET_GLOBAL_ID:
      sendResponse({
        type: `${type}_FAILURE`,
        taskId: msg.taskId,
        error: 'Not implemented yet',
      });
      break;

    default:
      log.debug(MODULE, `Unknown message type: ${type}`);
      break;
  }
}

log.info(MODULE, 'Service worker initialized');
