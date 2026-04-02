// N2Store Extension - SSE Real-time Event Listener
// Connects to Render server SSE for wallet, held products, transactions, messages
import { log } from '../../shared/logger.js';
import { CONFIG } from '../../shared/config.js';
import { showNotification } from './notifications.js';
import { getPreferences } from '../sync/storage.js';

const MODULE = 'SSE';

let eventSource = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 60000; // 60s max

/**
 * Start SSE listener with configured keys
 */
export async function startSSE() {
  const prefs = await getPreferences();
  if (!prefs.sseEnabled) {
    log.info(MODULE, 'SSE disabled in preferences');
    return;
  }

  // Build keys from enabled notification types
  const keys = buildSSEKeys(prefs);
  if (keys.length === 0) {
    log.info(MODULE, 'No SSE keys to subscribe to');
    return;
  }

  const url = `${CONFIG.RENDER_SSE_URL}/api/realtime/sse?keys=${keys.join(',')}`;
  connect(url);
}

/**
 * Stop SSE listener
 */
export function stopSSE() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  log.info(MODULE, 'SSE stopped');
}

/**
 * Restart SSE (e.g., after preference change)
 */
export async function restartSSE() {
  stopSSE();
  await startSSE();
}

/**
 * Get SSE connection status
 */
export function getSSEStatus() {
  return {
    connected: eventSource?.readyState === EventSource.OPEN,
    readyState: eventSource?.readyState ?? -1,
    reconnectAttempts,
  };
}

/**
 * Connect to SSE endpoint
 */
function connect(url) {
  if (eventSource) {
    eventSource.close();
  }

  log.info(MODULE, `Connecting to SSE: ${url}`);
  eventSource = new EventSource(url);

  eventSource.addEventListener('connected', (e) => {
    log.info(MODULE, 'SSE connected:', e.data);
    reconnectAttempts = 0;
  });

  // === Real-time event handlers ===

  // New bank transaction (SePay)
  eventSource.addEventListener('new-transaction', (e) => {
    try {
      const data = JSON.parse(e.data);
      const amount = formatCurrency(data.transferAmount || data.amount);
      const bank = data.bankShortName || data.gateway || 'Bank';
      const content = data.content || data.description || '';
      showNotification('new_transaction',
        `${amount} tu ${bank}\n${content}`,
        { contextMessage: data.transactionDate || '', raw: data }
      );
    } catch (err) {
      log.error(MODULE, 'Parse new-transaction error:', err.message);
    }
  });

  // Wallet update
  eventSource.addEventListener('wallet_update', (e) => {
    try {
      const data = JSON.parse(e.data);
      const action = data.action || 'update';
      const amount = formatCurrency(data.amount);
      const customer = data.customerName || data.customerId || '';
      showNotification('wallet_update',
        `${action === 'deposit' ? 'Nap' : action === 'withdraw' ? 'Rut' : 'Cap nhat'} ${amount} - ${customer}`,
        { raw: data }
      );
    } catch (err) {
      log.error(MODULE, 'Parse wallet_update error:', err.message);
    }
  });

  // Held product
  eventSource.addEventListener('update', (e) => {
    try {
      const data = JSON.parse(e.data);

      // Determine what kind of update this is based on key
      if (data.key && data.key.startsWith('held_products')) {
        const product = data.value?.productName || data.value?.sku || 'San pham';
        const user = data.value?.userName || '';
        showNotification('held_product',
          `${product} dang bi hold boi ${user}`,
          { raw: data }
        );
      } else if (data.key && data.key.startsWith('new_messages')) {
        const msg = data.value?.message || data.value?.preview || 'Tin nhan moi';
        const from = data.value?.customerName || data.value?.from || '';
        showNotification('new_message',
          `${from}: ${msg}`,
          { raw: data }
        );
      } else if (data.key && data.key.startsWith('processing_tags')) {
        showNotification('processing_update',
          `Don hang ${data.value?.orderId || ''} da cap nhat`,
          { raw: data }
        );
      }
    } catch (err) {
      log.error(MODULE, 'Parse update error:', err.message);
    }
  });

  // Generic message event
  eventSource.addEventListener('message', (e) => {
    log.debug(MODULE, 'SSE message:', e.data?.substring(0, 200));
  });

  // Error handling + auto-reconnect
  eventSource.onerror = (e) => {
    log.warn(MODULE, `SSE error (readyState: ${eventSource.readyState})`);

    if (eventSource.readyState === EventSource.CLOSED) {
      eventSource = null;
      scheduleReconnect(url);
    }
  };
}

/**
 * Schedule reconnection with exponential backoff
 */
function scheduleReconnect(url) {
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY);
  log.info(MODULE, `Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);

  reconnectTimer = setTimeout(() => {
    connect(url);
  }, delay);
}

/**
 * Build SSE subscription keys based on preferences
 */
function buildSSEKeys(prefs) {
  const keys = [];

  if (!prefs.disabledTypes?.includes('new_transaction')) {
    keys.push('wallet'); // wallet covers bank transactions too
  }
  if (!prefs.disabledTypes?.includes('held_product')) {
    keys.push('held_products');
  }
  if (!prefs.disabledTypes?.includes('new_message')) {
    keys.push('new_messages');
  }
  if (!prefs.disabledTypes?.includes('processing_update')) {
    keys.push('processing_tags');
  }

  return keys;
}

/**
 * Format currency amount
 */
function formatCurrency(amount) {
  if (!amount && amount !== 0) return '0d';
  return Number(amount).toLocaleString('vi-VN') + 'd';
}
