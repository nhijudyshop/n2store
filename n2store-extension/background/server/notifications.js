// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// N2Store Extension - Chrome Notification Dispatcher
// Creates rich chrome.notifications for each event type with click-to-action
import { log } from '../../shared/logger.js';
import { addActivity, incrementBadge, getPreferences, saveNotification } from '../sync/storage.js';

const MODULE = 'Notif';
const INBOX_URL = 'https://nhijudyshop.github.io/n2store/inbox/index.html';
const ORDERS_URL = 'https://nhijudyshop.github.io/n2store/orders-report/main.html';

// Notification type definitions: icon, title template, body template, click URL
const NOTIF_TYPES = {
  msg_sent: {
    title: 'Tin nhắn đã gửi',
    icon: 'MSG_SENT',
    getUrl: (d) => INBOX_URL,
  },
  msg_failed: {
    title: 'Gửi tin nhắn thất bại',
    icon: 'MSG_FAIL',
    getUrl: (d) => INBOX_URL,
  },
  upload_done: {
    title: 'Upload ảnh thành công',
    icon: 'UPLOAD',
    getUrl: (d) => INBOX_URL,
  },
  upload_failed: {
    title: 'Upload ảnh thất bại',
    icon: 'UPLOAD_FAIL',
    getUrl: (d) => INBOX_URL,
  },
  global_id_resolved: {
    title: 'Đã xác định khách hàng',
    icon: 'ID',
    getUrl: (d) => INBOX_URL,
  },
  global_id_failed: {
    title: 'Không xác định được khách hàng',
    icon: 'ID_FAIL',
    getUrl: (d) => INBOX_URL,
  },
  session_ready: {
    title: 'Facebook đã kết nối',
    icon: 'FB_OK',
    getUrl: () => null,
  },
  session_failed: {
    title: 'Kết nối Facebook thất bại',
    icon: 'FB_FAIL',
    getUrl: () => null,
  },
  // SSE events from Render server
  new_transaction: {
    title: 'Chuyển khoản mới',
    icon: 'BANK',
    getUrl: (d) => ORDERS_URL,
  },
  wallet_update: {
    title: 'Cập nhật ví khách hàng',
    icon: 'WALLET',
    getUrl: (d) => ORDERS_URL,
  },
  held_product: {
    title: 'Sản phẩm bị hold',
    icon: 'HOLD',
    getUrl: (d) => ORDERS_URL,
  },
  new_message: {
    title: 'Tin nhắn mới',
    icon: 'NEW_MSG',
    getUrl: (d) => INBOX_URL,
  },
  processing_update: {
    title: 'Cập nhật xử lý đơn',
    icon: 'ORDER',
    getUrl: (d) => ORDERS_URL,
  },
  extension_error: {
    title: 'Lỗi Extension',
    icon: 'ERROR',
    getUrl: () => null,
  },
};

// Track notification data for click handler
const notifDataMap = new Map();

/**
 * Show a chrome notification
 * @param {string} type - notification type key from NOTIF_TYPES
 * @param {string} body - notification body text
 * @param {object} data - extra data for click handling + activity log
 */
export async function showNotification(type, body, data = {}) {
  const prefs = await getPreferences();

  // Check if notifications are enabled globally
  if (!prefs.enabled) return;

  // Check if this specific type is enabled
  if (prefs.disabledTypes && prefs.disabledTypes.includes(type)) return;

  const typeDef = NOTIF_TYPES[type] || { title: 'N2Store', getUrl: () => null };
  const notifId = `n2s_${type}_${Date.now()}`;

  const options = {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('images/icon-128.png'),
    title: typeDef.title,
    message: body,
    priority: getPriority(type),
    silent: !prefs.sound,
  };

  // Add contextMessage for extra info
  if (data.contextMessage) {
    options.contextMessage = data.contextMessage;
  }

  // Add buttons for actionable notifications
  const buttons = getButtons(type, data);
  if (buttons.length > 0) {
    options.buttons = buttons;
  }

  try {
    await chrome.notifications.create(notifId, options);

    // Store data for click handler
    notifDataMap.set(notifId, { type, data, typeDef, buttons });

    // Auto-cleanup after 60s
    setTimeout(() => notifDataMap.delete(notifId), 60000);

    // Save to notification history
    await saveNotification({ type, text: body, data });

    // Log to activity
    await addActivity(getActivityIcon(type) + ' ' + body, type);

    // Update badge
    if (shouldIncrementBadge(type)) {
      await incrementBadge();
    }

    log.info(MODULE, `Notification shown: [${type}] ${body}`);
  } catch (err) {
    log.error(MODULE, 'Failed to show notification:', err.message);
  }
}

/**
 * Handle notification click → open relevant page
 */
export function setupNotificationClickHandlers() {
  chrome.notifications.onClicked.addListener(async (notifId) => {
    const info = notifDataMap.get(notifId);
    if (!info) return;

    const url = info.typeDef.getUrl(info.data);
    if (url) {
      await openOrFocusTab(url);
    }

    chrome.notifications.clear(notifId);
    notifDataMap.delete(notifId);
  });

  chrome.notifications.onButtonClicked.addListener(async (notifId, buttonIndex) => {
    const info = notifDataMap.get(notifId);
    if (!info) return;

    const button = info.buttons[buttonIndex];
    if (button?.action === 'open_inbox') {
      await openOrFocusTab(INBOX_URL);
    } else if (button?.action === 'open_orders') {
      await openOrFocusTab(ORDERS_URL);
    } else if (button?.action === 'open_url' && button.url) {
      await openOrFocusTab(button.url);
    } else if (button?.action === 'dismiss') {
      // Just dismiss
    }

    chrome.notifications.clear(notifId);
    notifDataMap.delete(notifId);
  });

  chrome.notifications.onClosed.addListener((notifId) => {
    notifDataMap.delete(notifId);
  });
}

/**
 * Open or focus an existing tab with the given URL
 */
async function openOrFocusTab(url) {
  try {
    const domain = new URL(url).hostname;
    const tabs = await chrome.tabs.query({ url: `*://${domain}/*` });

    if (tabs.length > 0) {
      // Focus existing tab and update URL if different
      await chrome.tabs.update(tabs[0].id, { active: true, url });
      await chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url });
    }
  } catch (err) {
    log.warn(MODULE, 'Failed to open tab:', err.message);
    chrome.tabs.create({ url });
  }
}

/**
 * Get notification buttons based on type
 */
function getButtons(type, data) {
  switch (type) {
    case 'msg_sent':
    case 'msg_failed':
    case 'new_message':
    case 'global_id_resolved':
    case 'global_id_failed':
      return [
        { title: 'Mo Inbox', action: 'open_inbox' },
      ];
    case 'new_transaction':
    case 'wallet_update':
    case 'held_product':
    case 'processing_update':
      return [
        { title: 'Mo Don hang', action: 'open_orders' },
      ];
    case 'upload_done':
    case 'upload_failed':
      return [
        { title: 'Mo Inbox', action: 'open_inbox' },
      ];
    default:
      return [];
  }
}

/**
 * Get activity log icon for notification type
 */
function getActivityIcon(type) {
  const icons = {
    msg_sent: '\u2709',       // Envelope
    msg_failed: '\u2718',     // X mark
    upload_done: '\u2191',    // Up arrow
    upload_failed: '\u2718',  // X mark
    global_id_resolved: '\u2714', // Check mark
    global_id_failed: '\u2718',
    session_ready: '\u26A1',  // Lightning
    session_failed: '\u26A0', // Warning
    new_transaction: '\u2B24', // Circle (bank)
    wallet_update: '\u2B24',
    held_product: '\u26A0',
    new_message: '\u2709',
    processing_update: '\u2B24',
    extension_error: '\u26A0',
  };
  return icons[type] || '\u2022'; // Bullet
}

/**
 * Get notification priority
 */
function getPriority(type) {
  if (['msg_failed', 'session_failed', 'extension_error', 'upload_failed', 'global_id_failed'].includes(type)) return 2;
  if (['new_transaction', 'new_message'].includes(type)) return 1;
  return 0;
}

/**
 * Should this notification type increment the badge counter?
 */
function shouldIncrementBadge(type) {
  return ['new_message', 'new_transaction', 'msg_failed', 'held_product'].includes(type);
}
