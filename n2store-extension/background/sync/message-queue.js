// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MESSAGE QUEUE — persist failed sends to chrome.storage.local
// Retry on:
//   1. Service worker restart (load on init)
//   2. processMessageQueue alarm (every 1 minute)
//   3. Manual trigger from popup
// Each entry: { id, payload, attempts, lastError, lastTryAt, nextTryAt, createdAt }
// Max attempts: 5 with exponential backoff (1m, 5m, 15m, 60m, 360m)
// =====================================================

import { log } from '../../shared/logger.js';

const MODULE = 'MsgQueue';
const STORAGE_KEY = 'fb_msg_queue';
const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 15, 60, 360];

let _queue = []; // in-memory mirror
let _loaded = false;

async function _load() {
  if (_loaded) return;
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    _queue = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    log.info(MODULE, `Loaded ${_queue.length} queued messages`);
  } catch (e) {
    log.warn(MODULE, 'Load failed:', e.message);
    _queue = [];
  }
  _loaded = true;
}

async function _save() {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: _queue });
  } catch (e) {
    log.warn(MODULE, 'Save failed:', e.message);
  }
}

/**
 * Enqueue a failed message for retry.
 * @param {Object} payload — REPLY_INBOX_PHOTO payload (pageId, message, globalUserId, etc.)
 * @param {string} reason — error reason (for debugging)
 */
export async function enqueueMessage(payload, reason = 'unknown') {
  await _load();
  const entry = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    payload,
    attempts: 0,
    lastError: reason,
    lastTryAt: null,
    nextTryAt: Date.now() + BACKOFF_MINUTES[0] * 60 * 1000,
    createdAt: Date.now(),
  };
  _queue.push(entry);
  await _save();
  log.info(MODULE, `Enqueued message ${entry.id} (queue size: ${_queue.length})`);
  return entry.id;
}

/**
 * Process all due messages (called by alarm).
 * Iterates entries where nextTryAt <= now and attempts < MAX_ATTEMPTS.
 * Calls handleReplyInboxPhoto for each — if success, removes from queue.
 * If fail, increment attempts + schedule next try.
 */
export async function processMessageQueue() {
  await _load();
  if (_queue.length === 0) return { processed: 0, succeeded: 0, failed: 0 };

  const now = Date.now();
  const due = _queue.filter(e => e.nextTryAt <= now && e.attempts < MAX_ATTEMPTS);
  if (due.length === 0) return { processed: 0, succeeded: 0, failed: 0 };

  log.info(MODULE, `Processing ${due.length} due messages (${_queue.length} total in queue)`);

  // Lazy import to avoid circular dependency
  const { handleReplyInboxPhoto } = await import('../facebook/sender.js');

  let succeeded = 0;
  let failed = 0;
  const stillFailed = [];

  for (const entry of due) {
    entry.attempts++;
    entry.lastTryAt = now;

    let resolved = false;
    const sendResponse = (resp) => {
      if (resolved) return;
      resolved = true;
      if (resp?.type === 'REPLY_INBOX_PHOTO_SUCCESS') {
        succeeded++;
        log.info(MODULE, `Queue retry SUCCESS for ${entry.id} (attempt ${entry.attempts})`);
      } else {
        failed++;
        entry.lastError = resp?.error || 'unknown';
        log.warn(MODULE, `Queue retry FAIL for ${entry.id} (attempt ${entry.attempts}/${MAX_ATTEMPTS}): ${entry.lastError}`);
      }
    };

    try {
      await handleReplyInboxPhoto(entry.payload, sendResponse);
    } catch (e) {
      sendResponse({ type: 'REPLY_INBOX_PHOTO_FAILURE', error: e.message });
    }

    // If still failing and under max → schedule next try
    if (resolved && _queue.find(q => q.id === entry.id)?.lastError && entry.attempts < MAX_ATTEMPTS) {
      const idx = Math.min(entry.attempts, BACKOFF_MINUTES.length - 1);
      entry.nextTryAt = now + BACKOFF_MINUTES[idx] * 60 * 1000;
      stillFailed.push(entry);
    } else if (!resolved || succeeded > 0) {
      // Either succeeded (remove) or attempts exhausted (drop)
      if (entry.attempts >= MAX_ATTEMPTS) {
        log.error(MODULE, `Message ${entry.id} exhausted ${MAX_ATTEMPTS} attempts, dropping. Last error: ${entry.lastError}`);
      }
    }
  }

  // Rebuild queue: keep entries that aren't in `due` (still pending future retry)
  // + stillFailed entries
  _queue = _queue.filter(e => !due.find(d => d.id === e.id));
  _queue.push(...stillFailed);
  await _save();

  return { processed: due.length, succeeded, failed, queueSize: _queue.length };
}

/**
 * Get queue stats for popup UI.
 */
export async function getQueueStats() {
  await _load();
  return {
    total: _queue.length,
    pending: _queue.filter(e => e.attempts < MAX_ATTEMPTS).length,
    exhausted: _queue.filter(e => e.attempts >= MAX_ATTEMPTS).length,
    oldest: _queue.length > 0 ? Math.min(..._queue.map(e => e.createdAt)) : null,
  };
}

/**
 * Clear all queued messages (for popup "Reset" button).
 */
export async function clearQueue() {
  _queue = [];
  await _save();
  log.info(MODULE, 'Queue cleared');
}
