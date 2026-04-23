// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// N2Store Extension - Storage & Badge Management
// Manages activity log, badge counter, notification preferences
import { log } from '../../shared/logger.js';

const MODULE = 'Storage';
const MAX_ACTIVITY_ITEMS = 100;
const MAX_NOTIFICATIONS = 200;

// In-memory counters (synced with chrome.storage)
let badgeCount = 0;
let messagesSentCount = 0;

// === BADGE ===

/**
 * Increment badge counter and update icon
 */
export async function incrementBadge(amount = 1) {
    badgeCount += amount;
    await updateBadgeDisplay();
    await chrome.storage.local.set({ badgeCount });
}

/**
 * Reset badge counter
 */
export async function resetBadge() {
    badgeCount = 0;
    await updateBadgeDisplay();
    await chrome.storage.local.set({ badgeCount });
}

/**
 * Get current badge count
 */
export function getBadgeCount() {
    return badgeCount;
}

/**
 * Update badge visual on extension icon
 */
async function updateBadgeDisplay() {
    try {
        if (badgeCount > 0) {
            const text = badgeCount > 99 ? '99+' : String(badgeCount);
            await chrome.action.setBadgeText({ text });
            await chrome.action.setBadgeBackgroundColor({ color: '#e53935' });
        } else {
            await chrome.action.setBadgeText({ text: '' });
        }
    } catch (err) {
        log.debug(MODULE, 'Badge update failed:', err.message);
    }
}

// === ACTIVITY LOG ===

/**
 * Add an entry to the activity log
 */
export async function addActivity(text, type = 'info') {
    try {
        const data = await chrome.storage.local.get('activity');
        const list = data.activity || [];

        list.push({
            text,
            type,
            timestamp: Date.now(),
        });

        // Keep only last N items
        if (list.length > MAX_ACTIVITY_ITEMS) {
            list.splice(0, list.length - MAX_ACTIVITY_ITEMS);
        }

        await chrome.storage.local.set({ activity: list });
    } catch (err) {
        log.debug(MODULE, 'Activity log error:', err.message);
    }
}

/**
 * Get activity log
 */
export async function getActivity(limit = 20) {
    try {
        const data = await chrome.storage.local.get('activity');
        const list = data.activity || [];
        return list.slice(-limit);
    } catch (err) {
        return [];
    }
}

/**
 * Clear activity log
 */
export async function clearActivity() {
    await chrome.storage.local.set({ activity: [] });
}

// === NOTIFICATION HISTORY ===

/**
 * Save notification to history
 */
export async function saveNotification(notif) {
    try {
        const data = await chrome.storage.local.get('notifications');
        const list = data.notifications || [];

        list.push({
            ...notif,
            timestamp: Date.now(),
            read: false,
        });

        if (list.length > MAX_NOTIFICATIONS) {
            list.splice(0, list.length - MAX_NOTIFICATIONS);
        }

        await chrome.storage.local.set({ notifications: list });
    } catch (err) {
        log.debug(MODULE, 'Save notification error:', err.message);
    }
}

/**
 * Get notification history
 */
export async function getNotifications(limit = 50) {
    try {
        const data = await chrome.storage.local.get('notifications');
        return (data.notifications || []).slice(-limit);
    } catch (err) {
        return [];
    }
}

/**
 * Mark all notifications as read
 */
export async function markAllRead() {
    try {
        const data = await chrome.storage.local.get('notifications');
        const list = (data.notifications || []).map((n) => ({ ...n, read: true }));
        await chrome.storage.local.set({ notifications: list });
    } catch (err) {
        log.debug(MODULE, 'Mark all read error:', err.message);
    }
}

/**
 * Get unread count
 */
export async function getUnreadCount() {
    try {
        const data = await chrome.storage.local.get('notifications');
        return (data.notifications || []).filter((n) => !n.read).length;
    } catch (err) {
        return 0;
    }
}

// === MESSAGE COUNTER ===

/**
 * Increment messages sent counter
 */
export async function incrementMessagesSent() {
    messagesSentCount++;
    await chrome.storage.local.set({ messagesSentCount });
}

/**
 * Get messages sent count
 */
export function getMessagesSentCount() {
    return messagesSentCount;
}

// === PREFERENCES ===

const DEFAULT_PREFS = {
    enabled: true, // notifications enabled globally
    sound: true, // play sound
    sseEnabled: true, // connect to SSE server
    disabledTypes: [], // array of disabled notification type keys
    sseUrl: '', // custom SSE URL (empty = use default)
};

/**
 * Get notification preferences
 */
export async function getPreferences() {
    try {
        const data = await chrome.storage.local.get('notifPrefs');
        return { ...DEFAULT_PREFS, ...(data.notifPrefs || {}) };
    } catch (err) {
        return DEFAULT_PREFS;
    }
}

/**
 * Save notification preferences
 */
export async function savePreferences(prefs) {
    await chrome.storage.local.set({ notifPrefs: { ...DEFAULT_PREFS, ...prefs } });
}

// === ONCALLCX SETTINGS & CALL LOG ===

const MAX_CALL_LOG = 50;

const DEFAULT_ONCALL_SETTINGS = {
    extension: '101',
    autoConfirm: false,
    sipAuthId: 'LRmeWThKCcC63CZk',
    sipPassword: '0We6H7AB15Boci0D',
};

/**
 * Get OnCallCX settings
 */
export async function getOnCallSettings() {
    try {
        const data = await chrome.storage.local.get('oncallSettings');
        return { ...DEFAULT_ONCALL_SETTINGS, ...(data.oncallSettings || {}) };
    } catch (err) {
        return DEFAULT_ONCALL_SETTINGS;
    }
}

/**
 * Save OnCallCX settings
 */
export async function saveOnCallSettings(settings) {
    await chrome.storage.local.set({ oncallSettings: { ...DEFAULT_ONCALL_SETTINGS, ...settings } });
}

/**
 * Add a call log entry
 */
export async function addCallLog(entry) {
    try {
        const data = await chrome.storage.local.get('callLog');
        const list = data.callLog || [];
        list.push({
            phone: entry.phone,
            customerName: entry.customerName || '',
            orderCode: entry.orderCode || '',
            timestamp: entry.timestamp || Date.now(),
        });
        if (list.length > MAX_CALL_LOG) {
            list.splice(0, list.length - MAX_CALL_LOG);
        }
        await chrome.storage.local.set({ callLog: list });
    } catch (err) {
        log.debug(MODULE, 'Add call log error:', err.message);
    }
}

/**
 * Get call log
 */
export async function getCallLog(limit = 30) {
    try {
        const data = await chrome.storage.local.get('callLog');
        return (data.callLog || []).slice(-limit);
    } catch (err) {
        return [];
    }
}

/**
 * Clear call log
 */
export async function clearCallLog() {
    await chrome.storage.local.set({ callLog: [] });
}

// === STATUS ===

/**
 * Get full extension status for popup
 */
export async function getStatus(extraInfo = {}) {
    return {
        badgeCount,
        messagesSentCount,
        ...extraInfo,
    };
}

// === INITIALIZATION ===

/**
 * Load counters from storage on startup
 */
export async function initStorage() {
    try {
        const data = await chrome.storage.local.get(['badgeCount', 'messagesSentCount']);
        badgeCount = data.badgeCount || 0;
        messagesSentCount = data.messagesSentCount || 0;
        await updateBadgeDisplay();
        log.info(MODULE, `Storage initialized: badge=${badgeCount}, msgs=${messagesSentCount}`);
    } catch (err) {
        log.warn(MODULE, 'Storage init error:', err.message);
    }
}
