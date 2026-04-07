// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// N2Store Extension - Service Worker (Entry Point)
// Routes messages from content script to appropriate handlers
// Integrates Facebook module + notifications + SSE + badge
import { MSG, VERSION, BUILD } from '../shared/constants.js';
import { CONFIG } from '../shared/config.js';
import { log } from '../shared/logger.js';
import { handleReplyInboxPhoto } from './facebook/sender.js';
import { handleUploadInboxPhoto } from './facebook/uploader.js';
import { handleGetGlobalIdForConv, loadCacheFromStorage } from './facebook/global-id.js';
import { handlePreinitializePages, handleGetBusinessContext, getAllSessions } from './facebook/session.js';
import { handleSendComment, handleSendPrivateReply } from './facebook/commenter.js';
import { startInterceptor, getInterceptedCount, periodicHealthCheck } from './facebook/doc-id-interceptor.js';
import { processMessageQueue, enqueueMessage, getQueueStats } from './sync/message-queue.js';
import { showNotification, setupNotificationClickHandlers } from './server/notifications.js';
import { startSSE, stopSSE, restartSSE, getSSEStatus } from './server/sse-listener.js';
import {
  initStorage, getStatus, resetBadge, getActivity, clearActivity,
  getPreferences, savePreferences, incrementMessagesSent,
  getNotifications, markAllRead, getUnreadCount,
} from './sync/storage.js';

const MODULE = 'SW';

// Track connected tabs
const connectedPorts = new Map();

// Track message stats
let msgSentCount = 0;
let msgFailCount = 0;

// === INITIALIZATION ===

log.info(MODULE, `N2Store Extension v${VERSION} (build ${BUILD}) starting...`);

// Initialize all subsystems
(async () => {
  await initStorage();
  await loadCacheFromStorage();
  startInterceptor();
  setupNotificationClickHandlers();
  startSSE();
  log.info(MODULE, 'All subsystems initialized');
})();

// === KEEP-ALIVE ===

chrome.alarms.create('keepAlive', { periodInMinutes: CONFIG.ALARM_INTERVAL_MIN });
// Doc_id health check every 30 minutes — log warning when critical doc_ids missing
chrome.alarms.create('docIdHealthCheck', { periodInMinutes: 30, delayInMinutes: 5 });
// Process queued messages every 1 minute (offline retry)
chrome.alarms.create('processMessageQueue', { periodInMinutes: 1, delayInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'keepAlive') {
    log.debug(MODULE, 'Keep-alive alarm fired');
  } else if (alarm.name === 'docIdHealthCheck') {
    try { await periodicHealthCheck(); } catch (e) { log.warn(MODULE, 'docIdHealthCheck error:', e.message); }
  } else if (alarm.name === 'processMessageQueue') {
    try { await processMessageQueue(); } catch (e) { log.warn(MODULE, 'processMessageQueue error:', e.message); }
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
  if (msg?.type) {
    const tabId = sender?.tab?.id || 'internal';
    handleMessage(msg, tabId, null, sendResponse);
    return true;
  }
});

/**
 * Main message router
 */
async function handleMessage(msg, tabId, port, asyncSendResponse) {
  const type = msg?.type;
  if (!type) return;

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

  const broadcast = (response) => {
    for (const [id, p] of connectedPorts) {
      try { p.postMessage(response); } catch (err) { connectedPorts.delete(id); }
    }
  };

  switch (type) {
    // === Health & Lifecycle ===
    case MSG.WAKE_UP:
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
        sendResponse({ type: 'PREINITIALIZE_PAGES_DONE', results, taskId: msg.taskId });

        // Only notify on failure (session_ready is too noisy)
        const pageCount = Object.keys(results).length;
        const successCount = Object.values(results).filter(r => r.success).length;
        if (successCount < pageCount) {
          const failedPages = Object.entries(results).filter(([, r]) => !r.success).map(([id]) => id);
          showNotification('session_failed', `Khong ket noi duoc: ${failedPages.join(', ')}`);
        }
      } catch (err) {
        log.error(MODULE, 'PREINITIALIZE_PAGES error:', err.message);
        showNotification('session_failed', `Loi khoi tao: ${err.message}`);
      }
      break;

    case MSG.GET_BUSINESS_CONTEXT:
      try {
        const result = await handleGetBusinessContext(msg);
        sendResponse(result);
      } catch (err) {
        sendResponse({ type: 'GET_BUSINESS_CONTEXT_FAILURE', taskId: msg.taskId, error: err.message });
        showNotification('session_failed', `fb_dtsg error: ${err.message}`);
      }
      break;

    // === Core Messaging ===
    case MSG.REPLY_INBOX_PHOTO: {
      const originalSend = sendResponse;
      await handleReplyInboxPhoto(msg, (response) => {
        originalSend(response);

        // Notification based on result
        if (response.type === 'REPLY_INBOX_PHOTO_SUCCESS') {
          msgSentCount++;
          incrementMessagesSent();
          const preview = (msg.message || '').substring(0, 50);
          const attachInfo = msg.attachmentType !== 'SEND_TEXT_ONLY' ? ` [${msg.attachmentType}]` : '';
          showNotification('msg_sent',
            `${msg.customerName || 'Khach hang'}: ${preview || '(anh)'}${attachInfo}`,
            { threadId: msg.threadId, pageId: msg.pageId }
          );
        } else {
          msgFailCount++;
          showNotification('msg_failed',
            `${msg.customerName || 'Khach hang'}: ${response.error || 'Unknown error'}`,
            { threadId: msg.threadId, pageId: msg.pageId }
          );
        }
      });
      break;
    }

    case MSG.UPLOAD_INBOX_PHOTO: {
      const originalSend = sendResponse;
      await handleUploadInboxPhoto(msg, (response) => {
        originalSend(response);

        if (response.type === 'UPLOAD_INBOX_PHOTO_SUCCESS') {
          showNotification('upload_done',
            `Anh da upload (fbId: ${response.fbId})`,
            { fbId: response.fbId }
          );
        } else {
          showNotification('upload_failed',
            `Upload that bai: ${response.error || 'Unknown'}`,
            {}
          );
        }
      });
      break;
    }

    // === Global ID ===
    case MSG.GET_GLOBAL_ID_FOR_CONV: {
      const originalSend = sendResponse;
      await handleGetGlobalIdForConv(msg, (response) => {
        originalSend(response);

        if (response.type === 'GET_GLOBAL_ID_FOR_CONV_SUCCESS') {
          showNotification('global_id_resolved',
            `${msg.customerName || 'Khach hang'} → ID: ${response.globalId}`,
            { globalId: response.globalId, threadId: msg.threadId }
          );
        } else {
          showNotification('global_id_failed',
            `${msg.customerName || 'Thread ' + msg.threadId}: ${response.error}`,
            { threadId: msg.threadId }
          );
        }
      });
      break;
    }

    // === Queue + Rate limit status (for client UI) ===
    case 'GET_MSG_QUEUE_STATUS':
      try {
        const stats = await getQueueStats();
        sendResponse({ type: 'MSG_QUEUE_STATUS', stats });
      } catch (e) {
        sendResponse({ type: 'MSG_QUEUE_STATUS', error: e.message });
      }
      break;

    case 'GET_RATE_LIMIT_STATUS': {
      try {
        const pageId = msg.pageId;
        if (!pageId) {
          sendResponse({ type: 'RATE_LIMIT_STATUS', error: 'pageId required' });
          break;
        }
        const key = `fb_rate_limit_${pageId}`;
        const result = await chrome.storage.local.get(key);
        const cooldownEnd = result[key] || 0;
        const remaining = Math.max(0, cooldownEnd - Date.now());
        sendResponse({
          type: 'RATE_LIMIT_STATUS',
          pageId,
          isLimited: remaining > 0,
          cooldownEnd,
          remainingMs: remaining,
          remainingSec: Math.round(remaining / 1000),
        });
      } catch (e) {
        sendResponse({ type: 'RATE_LIMIT_STATUS', error: e.message });
      }
      break;
    }

    case 'PROCESS_MSG_QUEUE_NOW':
      try {
        const result = await processMessageQueue();
        sendResponse({ type: 'MSG_QUEUE_PROCESSED', ...result });
      } catch (e) {
        sendResponse({ type: 'MSG_QUEUE_PROCESSED', error: e.message });
      }
      break;

    // === Internal: Popup & Settings ===
    case 'GET_STATUS':
      sendResponse({
        fbConnected: getAllSessions && Object.keys(getAllSessions()).length > 0,
        sessionCount: getAllSessions ? Object.keys(getAllSessions()).length : 0,
        cacheCount: 0, // TODO: expose from global-id.js
        docIdCount: getInterceptedCount(),
        msgCount: msgSentCount,
        msgFailed: msgFailCount,
        sse: getSSEStatus(),
        unreadCount: await getUnreadCount(),
        connectedTabs: connectedPorts.size,
      });
      break;

    case 'GET_SESSION_DETAILS':
      sendResponse({
        pages: Object.entries(getAllSessions ? getAllSessions() : {}).map(([id, s]) => ({
          id,
          age: Math.round((Date.now() - (s.timestamp || 0)) / 60000),
        })),
      });
      break;

    case 'REFRESH_SESSIONS':
      log.info(MODULE, 'Refreshing sessions...');
      break;

    case 'RESET_BADGE':
      await resetBadge();
      sendResponse({ success: true });
      break;

    case 'GET_ACTIVITY':
      sendResponse({ activity: await getActivity(msg.limit || 20) });
      break;

    case 'CLEAR_ACTIVITY':
      await clearActivity();
      sendResponse({ success: true });
      break;

    case 'GET_NOTIFICATIONS':
      sendResponse({ notifications: await getNotifications(msg.limit || 50) });
      break;

    case 'MARK_ALL_READ':
      await markAllRead();
      await resetBadge();
      sendResponse({ success: true });
      break;

    case 'GET_PREFERENCES':
      sendResponse({ prefs: await getPreferences() });
      break;

    case 'SAVE_PREFERENCES': {
      await savePreferences(msg.prefs);
      // Restart SSE if SSE settings changed
      if (msg.prefs.sseEnabled !== undefined || msg.prefs.disabledTypes) {
        await restartSSE();
      }
      sendResponse({ success: true });
      break;
    }

    case 'TOGGLE_SSE':
      if (msg.enabled) { await startSSE(); } else { stopSSE(); }
      sendResponse({ success: true, sse: getSSEStatus() });
      break;

    case 'TEST_NOTIFICATION':
      await showNotification(msg.notifType || 'msg_sent', msg.body || 'Day la thong bao test', {});
      sendResponse({ success: true });
      break;

    // === Comments (Phase 2) ===
    case MSG.SEND_COMMENT:
      await handleSendComment(msg, sendResponse);
      break;
    case MSG.SEND_PRIVATE_REPLY:
      await handleSendPrivateReply(msg, sendResponse);
      break;
    case MSG.EDIT_COMMENT:
    case MSG.REMOVE_COMMENT:
      sendResponse({ type: `${type}_FAILURE`, taskId: msg.taskId, error: 'Chua ho tro (Phase 2)' });
      break;

    // === Interactions (Phase 2 - stub) ===
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
      sendResponse({ type: `${type}_FAILURE`, taskId: msg.taskId, error: 'Chua ho tro' });
      break;

    // === TPOS Interceptor Events ===
    case 'tpos:tag-assigned':
      log.info(MODULE, `TPOS tag assigned: ${msg.orderId}, tags: ${msg.tags?.map(t => t.Name).join(', ')}`);
      // Forward to Render server for WebSocket broadcast
      fetch(`${CONFIG.RENDER_API_URL}/api/tpos-events/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg)
      }).catch(err => log.warn(MODULE, 'Failed to forward TPOS event:', err.message));
      // Also broadcast to connected N2Store tabs directly
      broadcast({ type: 'tpos:tag-assigned', orderId: msg.orderId, tags: msg.tags });
      break;

    default:
      log.debug(MODULE, `Unknown message type: ${type}`);
      break;
  }
}

log.info(MODULE, 'Service worker initialized');
