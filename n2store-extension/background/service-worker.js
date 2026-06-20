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
import {
    handlePreinitializePages,
    handleGetBusinessContext,
    getAllSessions,
} from './facebook/session.js';
import { handleSendComment, handleSendPrivateReply } from './facebook/commenter.js';
import { startInterceptor, getInterceptedCount } from './facebook/doc-id-interceptor.js';
import { setupUpdateNotifier } from './update-notifier.js';
import { setupVersionChecker } from './version-checker.js';
import { showNotification, setupNotificationClickHandlers } from './server/notifications.js';
import { startSSE, stopSSE, restartSSE, getSSEStatus } from './server/sse-listener.js';
import {
    initStorage,
    getStatus,
    resetBadge,
    getActivity,
    clearActivity,
    getPreferences,
    savePreferences,
    incrementMessagesSent,
    getNotifications,
    markAllRead,
    getUnreadCount,
    getOnCallSettings,
    saveOnCallSettings,
    addCallLog,
    getCallLog,
    clearCallLog,
} from './sync/storage.js';

const MODULE = 'SW';

// Track connected tabs
const connectedPorts = new Map();

// Track message stats
let msgSentCount = 0;
let msgFailCount = 0;

// === INITIALIZATION ===

log.info(MODULE, `N2Store Extension v${VERSION} (build ${BUILD}) starting...`);

// Setup update notifier early — must register onInstalled listener at top-level
// of service worker, not inside async IIFE (Chrome may dispatch event before async init resolves).
setupUpdateNotifier();

// Periodic check GH Pages manifest for newer version → popup banner sẽ đọc storage.
setupVersionChecker();

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
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        log.debug(MODULE, 'Keep-alive alarm fired');
    }
});

// === ONCALLCX PHONE WINDOW ===

let phoneWindowId = null;

async function openPhoneWindow(phone, customerName) {
    // If window already open, focus it and send dial command
    if (phoneWindowId !== null) {
        try {
            await chrome.windows.update(phoneWindowId, { focused: true });
            // Send dial command to existing window
            if (phone) {
                const tabs = await chrome.tabs.query({ windowId: phoneWindowId });
                if (tabs[0]) {
                    chrome.tabs
                        .sendMessage(tabs[0].id, {
                            type: 'DIAL_NUMBER',
                            phone,
                            customerName,
                        })
                        .catch(() => {});
                }
            }
            return;
        } catch {
            phoneWindowId = null; // Window was closed
        }
    }

    // Build URL with params
    let url = chrome.runtime.getURL('pages/phone.html');
    const params = new URLSearchParams();
    if (phone) params.set('phone', phone);
    if (customerName) params.set('name', customerName);
    if (params.toString()) url += '?' + params.toString();

    // Create floating window
    const win = await chrome.windows.create({
        url,
        type: 'popup',
        width: 320,
        height: 540,
        focused: true,
    });
    phoneWindowId = win.id;
    log.info(MODULE, `Phone window opened: ${phoneWindowId}`);
}

chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === phoneWindowId) {
        phoneWindowId = null;
        log.info(MODULE, 'Phone window closed');
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
                const successCount = Object.values(results).filter((r) => r.success).length;
                if (successCount < pageCount) {
                    const failedPages = Object.entries(results)
                        .filter(([, r]) => !r.success)
                        .map(([id]) => id);
                    showNotification(
                        'session_failed',
                        `Khong ket noi duoc: ${failedPages.join(', ')}`
                    );
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
                sendResponse({
                    type: 'GET_BUSINESS_CONTEXT_FAILURE',
                    taskId: msg.taskId,
                    error: err.message,
                });
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
                    const attachInfo =
                        msg.attachmentType !== 'SEND_TEXT_ONLY' ? ` [${msg.attachmentType}]` : '';
                    showNotification(
                        'msg_sent',
                        `${msg.customerName || 'Khach hang'}: ${preview || '(anh)'}${attachInfo}`,
                        { threadId: msg.threadId, pageId: msg.pageId }
                    );
                } else {
                    msgFailCount++;
                    showNotification(
                        'msg_failed',
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
                    showNotification('upload_done', `Anh da upload (fbId: ${response.fbId})`, {
                        fbId: response.fbId,
                    });
                } else {
                    showNotification(
                        'upload_failed',
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
                    showNotification(
                        'global_id_resolved',
                        `${msg.customerName || 'Khach hang'} → ID: ${response.globalId}`,
                        { globalId: response.globalId, threadId: msg.threadId }
                    );
                } else {
                    showNotification(
                        'global_id_failed',
                        `${msg.customerName || 'Thread ' + msg.threadId}: ${response.error}`,
                        { threadId: msg.threadId }
                    );
                }
            });
            break;
        }

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
            if (msg.enabled) {
                await startSSE();
            } else {
                stopSSE();
            }
            sendResponse({ success: true, sse: getSSEStatus() });
            break;

        case 'TEST_NOTIFICATION':
            await showNotification(
                msg.notifType || 'msg_sent',
                msg.body || 'Day la thong bao test',
                {}
            );
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
            sendResponse({
                type: `${type}_FAILURE`,
                taskId: msg.taskId,
                error: 'Chua ho tro (Phase 2)',
            });
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

        // === OnCallCX Phone Window ===
        case 'OPEN_PHONE':
            openPhoneWindow(msg.phone, msg.customerName);
            sendResponse({ success: true });
            break;

        // === OnCallCX ===
        case 'GET_ONCALL_SETTINGS':
            sendResponse({ settings: await getOnCallSettings() });
            break;

        case 'SAVE_ONCALL_SETTINGS':
            await saveOnCallSettings(msg.settings);
            sendResponse({ success: true });
            break;

        case 'GET_CALL_LOG':
            sendResponse({ callLog: await getCallLog(msg.limit || 30) });
            break;

        case 'ADD_CALL_LOG':
            await addCallLog(msg.entry || msg);
            sendResponse({ success: true });
            break;

        case 'CLEAR_CALL_LOG':
            await clearCallLog();
            sendResponse({ success: true });
            break;

        // === Livestream Snapshot — Tab Capture (no popup) ===
        // Page (nhijudy.store/tpos-pancake) requests a JPEG of the visible tab.
        // chrome.tabs.captureVisibleTab works without user gesture because we
        // have host permission for nhijudy.store. Page crops iframe region itself.
        case 'N2_CAPTURE_VISIBLE_TAB': {
            try {
                // Lookup tab → windowId. tabId comes from port.sender (passed in).
                let windowId = null;
                if (typeof tabId === 'number') {
                    try {
                        const tab = await chrome.tabs.get(tabId);
                        windowId = tab.windowId;
                    } catch {}
                }
                const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
                    format: 'jpeg',
                    quality: msg.quality || 80,
                });
                sendResponse({
                    type: 'N2_CAPTURE_VISIBLE_TAB_SUCCESS',
                    requestId: msg.requestId,
                    dataUrl,
                });
            } catch (err) {
                log.warn(MODULE, 'captureVisibleTab failed:', err.message);
                sendResponse({
                    type: 'N2_CAPTURE_VISIBLE_TAB_FAILURE',
                    requestId: msg.requestId,
                    error: err.message,
                });
            }
            break;
        }

        // === Web 2.0 — Pancake token auto-refresh ===
        // Page (web2/pancake-settings, …) requests the current pancake.vn JWT.
        // We have `cookies` permission + pancake.vn host access, so the
        // background can read the `jwt` cookie directly from the browser cookie
        // store — no pancake.vn tab needs to be open, no user click. The page
        // calls this silently when its saved token is near expiry.
        case 'GET_PANCAKE_TOKEN': {
            try {
                // `jwt` cookie is set on domain `.pancake.vn`, not HttpOnly.
                const cookies = await chrome.cookies.getAll({
                    domain: 'pancake.vn',
                    name: 'jwt',
                });
                // Prefer the longest value (most complete JWT) if duplicates exist.
                const token =
                    (cookies || [])
                        .map((c) => c.value)
                        .filter(Boolean)
                        .sort((a, b) => b.length - a.length)[0] || null;
                if (!token) {
                    sendResponse({
                        type: 'GET_PANCAKE_TOKEN_FAILURE',
                        requestId: msg.requestId,
                        reason: 'not_logged_in',
                    });
                    break;
                }
                sendResponse({
                    type: 'GET_PANCAKE_TOKEN_SUCCESS',
                    requestId: msg.requestId,
                    token,
                });
            } catch (err) {
                log.warn(MODULE, 'GET_PANCAKE_TOKEN failed:', err.message);
                sendResponse({
                    type: 'GET_PANCAKE_TOKEN_FAILURE',
                    requestId: msg.requestId,
                    reason: err.message || 'cookie_read_error',
                });
            }
            break;
        }

        // === Web 2.0 — Đăng nhập Zalo 1-click (zca-js cookie login) ===
        // chat.zalo.me content script gửi imei + userAgent → cache (1-click không cần tab mở).
        case 'ZALO_CREDS_CACHE': {
            try {
                if (msg.imei) {
                    await chrome.storage.local.set({
                        zaloCreds: {
                            imei: msg.imei,
                            userAgent: msg.userAgent || '',
                            uid: msg.uid || null, // 2026-06-20: uid TK đang đăng nhập chat.zalo.me
                            ts: Date.now(),
                        },
                    });
                }
            } catch (err) {
                log.warn(MODULE, 'ZALO_CREDS_CACHE failed:', err.message);
            }
            break;
        }

        // Trang Web 2.0 xin {cookie, imei, userAgent} của phiên Zalo Web để login zca-js.
        case 'GET_ZALO_CREDS': {
            try {
                // 1) Cookie chat.zalo.me — chrome.cookies đọc được cả httpOnly. getAll by url →
                //    đủ cookie sẽ gửi tới chat.zalo.me (gồm .zalo.me + host-only). Shape khớp zca-js Cookie[].
                const raw = await chrome.cookies.getAll({ url: 'https://chat.zalo.me/' });
                const cookie = (raw || []).map((c) => ({
                    domain: c.domain,
                    expirationDate: c.expirationDate || null,
                    hostOnly: !!c.hostOnly,
                    httpOnly: !!c.httpOnly,
                    name: c.name,
                    path: c.path,
                    sameSite: c.sameSite || 'no_restriction',
                    secure: !!c.secure,
                    session: !!c.session,
                    storeId: c.storeId || null,
                    value: c.value,
                }));

                // 2) imei + userAgent + uid: cache trước; không có → hỏi tươi tab chat.zalo.me.
                let imei = null;
                let userAgent = '';
                let uid = null; // uid TK đang đăng nhập chat.zalo.me (ưu tiên gửi theo TK này)
                try {
                    const st = await chrome.storage.local.get('zaloCreds');
                    if (st && st.zaloCreds && st.zaloCreds.imei) {
                        imei = st.zaloCreds.imei;
                        userAgent = st.zaloCreds.userAgent || '';
                        uid = st.zaloCreds.uid || null;
                    }
                } catch (e) {
                    /* storage có thể trống */
                }
                if (!imei || !uid) {
                    try {
                        const tabs = await chrome.tabs.query({ url: '*://chat.zalo.me/*' });
                        for (const t of tabs) {
                            const r = await chrome.tabs
                                .sendMessage(t.id, { type: 'ZALO_READ_CREDS' })
                                .catch(() => null);
                            if (r && r.imei) {
                                imei = imei || r.imei;
                                userAgent = r.userAgent || userAgent;
                                uid = uid || r.uid || null;
                                break;
                            }
                        }
                    } catch (e) {
                        /* không có tab chat.zalo.me / content script chưa inject */
                    }
                }

                // Chưa đăng nhập chat.zalo.me → thiếu cookie phiên (zpsid/zpw_sek).
                const loggedIn =
                    cookie.some((c) => /zpsid|zpw_sek/i.test(c.name)) || cookie.length >= 4;
                if (!loggedIn) {
                    sendResponse({
                        type: 'GET_ZALO_CREDS_FAILURE',
                        taskId: msg.taskId,
                        reason: 'no_session',
                    });
                    break;
                }
                if (!imei) {
                    sendResponse({
                        type: 'GET_ZALO_CREDS_FAILURE',
                        taskId: msg.taskId,
                        reason: 'no_imei',
                    });
                    break;
                }
                sendResponse({
                    type: 'GET_ZALO_CREDS_SUCCESS',
                    taskId: msg.taskId,
                    cookie,
                    imei,
                    userAgent: userAgent || navigator.userAgent,
                    uid: uid || null, // TK đang đăng nhập chat.zalo.me (ưu tiên gửi tin theo TK này)
                });
            } catch (err) {
                log.warn(MODULE, 'GET_ZALO_CREDS failed:', err.message);
                sendResponse({
                    type: 'GET_ZALO_CREDS_FAILURE',
                    taskId: msg.taskId,
                    reason: err.message || 'creds_read_error',
                });
            }
            break;
        }

        // === TPOS Interceptor Events ===
        case 'tpos:tag-assigned':
            log.info(
                MODULE,
                `TPOS tag assigned: ${msg.orderId}, tags: ${msg.tags?.map((t) => t.Name).join(', ')}`
            );
            // Forward to Render server for WebSocket broadcast
            fetch(`${CONFIG.RENDER_API_URL}/api/tpos-events/broadcast`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(msg),
            }).catch((err) => log.warn(MODULE, 'Failed to forward TPOS event:', err.message));
            // Also broadcast to connected N2Store tabs directly
            broadcast({ type: 'tpos:tag-assigned', orderId: msg.orderId, tags: msg.tags });
            break;

        default:
            log.debug(MODULE, `Unknown message type: ${type}`);
            break;
    }
}

log.info(MODULE, 'Service worker initialized');
