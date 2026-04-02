// N2Store Extension - Chrome Notification Dispatcher
// Creates rich chrome.notifications for each event type with click-to-action
import { log } from '../../shared/logger.js';
import { addActivity, incrementBadge, getPreferences, saveNotification } from '../sync/storage.js';

const MODULE = 'Notif';
const BASE_URL = 'https://nhijudyshop.workers.dev';

// Notification type definitions: icon, title template, body template, click URL
const NOTIF_TYPES = {
  msg_sent: {
    title: 'Tin nhan da gui',
    icon: 'MSG_SENT',
    getUrl: (d) => `${BASE_URL}/inbox/`,
  },
  msg_failed: {
    title: 'Gui tin nhan that bai',
    icon: 'MSG_FAIL',
    getUrl: (d) => `${BASE_URL}/inbox/`,
  },
  upload_done: {
    title: 'Upload anh thanh cong',
    icon: 'UPLOAD',
    getUrl: (d) => `${BASE_URL}/inbox/`,
  },
  upload_failed: {
    title: 'Upload anh that bai',
    icon: 'UPLOAD_FAIL',
    getUrl: (d) => `${BASE_URL}/inbox/`,
  },
  global_id_resolved: {
    title: 'Da xac dinh khach hang',
    icon: 'ID',
    getUrl: (d) => `${BASE_URL}/inbox/`,
  },
  global_id_failed: {
    title: 'Khong xac dinh duoc khach hang',
    icon: 'ID_FAIL',
    getUrl: (d) => `${BASE_URL}/inbox/`,
  },
  session_ready: {
    title: 'Facebook da ket noi',
    icon: 'FB_OK',
    getUrl: () => null,
  },
  session_failed: {
    title: 'Ket noi Facebook that bai',
    icon: 'FB_FAIL',
    getUrl: () => null,
  },
  // SSE events from Render server
  new_transaction: {
    title: 'Chuyen khoan moi',
    icon: 'BANK',
    getUrl: (d) => `${BASE_URL}/orders-report/#tab1`,
  },
  wallet_update: {
    title: 'Cap nhat vi khach hang',
    icon: 'WALLET',
    getUrl: (d) => `${BASE_URL}/orders-report/#tab1`,
  },
  held_product: {
    title: 'San pham bi hold',
    icon: 'HOLD',
    getUrl: (d) => `${BASE_URL}/orders-report/#tab1`,
  },
  new_message: {
    title: 'Tin nhan moi',
    icon: 'NEW_MSG',
    getUrl: (d) => `${BASE_URL}/inbox/`,
  },
  processing_update: {
    title: 'Cap nhat xu ly don',
    icon: 'ORDER',
    getUrl: (d) => `${BASE_URL}/orders-report/#tab1`,
  },
  extension_error: {
    title: 'Loi Extension',
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
      await openOrFocusTab(`${BASE_URL}/inbox/`);
    } else if (button?.action === 'open_orders') {
      await openOrFocusTab(`${BASE_URL}/orders-report/#tab1`);
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
