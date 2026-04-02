// N2Store Extension - Popup Logic
// Manages tabs, notifications display, activity log, quick actions

document.addEventListener('DOMContentLoaded', async () => {
  // Extension always green
  document.getElementById('extStatus').classList.add('green');

  // Load status from service worker
  await loadStatus();
  await updateTabCount();

  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Quick actions
  document.getElementById('openInbox').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://nhijudyshop.workers.dev/inbox/' });
    window.close();
  });

  document.getElementById('openOrders').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://nhijudyshop.github.io/n2store/orders-report/main.html' });
    window.close();
  });

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    const btn = document.getElementById('refreshBtn');
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
    try {
      await chrome.runtime.sendMessage({ type: 'REFRESH_SESSIONS' });
    } catch (err) { /* ignore */ }
    setTimeout(() => { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }, 2000);
  });

  // Settings
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings.html') });
    window.close();
  });

  // Test notification
  document.getElementById('testNotifBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({
      type: 'TEST_NOTIFICATION',
      notifType: 'msg_sent',
      body: 'Test: Tin nhắn đã gửi thành công!'
    });
  });

  // SSE toggle
  const sseToggle = document.getElementById('sseToggle');
  try {
    const { prefs } = await chrome.runtime.sendMessage({ type: 'GET_PREFERENCES' });
    sseToggle.checked = prefs?.sseEnabled !== false;
  } catch (e) { /* ignore */ }

  sseToggle.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({ type: 'TOGGLE_SSE', enabled: sseToggle.checked });
  });

  // Mark all read
  document.getElementById('markAllReadBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'MARK_ALL_READ' });
    await loadNotifications();
    updateNotifBadge(0);
  });

  // Clear activity
  document.getElementById('clearActivityBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_ACTIVITY' });
    await loadActivity();
  });

  // Load notification and activity tabs
  await loadNotifications();
  await loadActivity();
});

// === TAB SWITCHING ===

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
  document.getElementById(`tab-${tabId}`).classList.add('active');
}

// === STATUS ===

async function loadStatus() {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (!status) return;

    // Facebook
    const fbDot = document.getElementById('fbStatus');
    fbDot.classList.add(status.sessionCount > 0 ? 'green' : 'yellow');

    // SSE
    const sseDot = document.getElementById('sseStatus');
    sseDot.classList.add(status.sse?.connected ? 'green' : status.sse?.readyState === 0 ? 'yellow' : 'red');

    // Dashboard stats
    document.getElementById('sessionCount').textContent = status.sessionCount || 0;
    document.getElementById('msgCount').textContent = status.msgCount || 0;
    document.getElementById('msgFailed').textContent = status.msgFailed || 0;
    document.getElementById('unreadCount').textContent = status.unreadCount || 0;

    // Notif badge
    if (status.unreadCount > 0) {
      updateNotifBadge(status.unreadCount);
    }
  } catch (err) {
    console.log('Status error:', err);
  }
}

async function updateTabCount() {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://*.nhijudyshop.workers.dev/*', '*://nhijudyshop.github.io/*'],
    });
    const count = tabs.length;
    document.getElementById('tabCount').textContent = `${count} tab${count !== 1 ? 's' : ''}`;
    document.getElementById('tabStatus').classList.add(count > 0 ? 'green' : 'red');
  } catch (err) {
    document.getElementById('tabCount').textContent = '?';
  }
}

function updateNotifBadge(count) {
  const badge = document.getElementById('notifBadge');
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// === NOTIFICATIONS ===

async function loadNotifications() {
  try {
    const { notifications } = await chrome.runtime.sendMessage({ type: 'GET_NOTIFICATIONS', limit: 30 });
    const container = document.getElementById('notifList');

    if (!notifications || notifications.length === 0) {
      container.innerHTML = '<div class="empty-state">Chưa có thông báo nào</div>';
      return;
    }

    container.innerHTML = '';
    // Show newest first
    notifications.reverse().forEach(notif => {
      const div = document.createElement('div');
      div.className = `notif-item${notif.read ? '' : ' unread'}`;

      const icon = getNotifIcon(notif.type);
      const badge = getTypeBadge(notif.type);
      const time = formatTimeAgo(notif.timestamp);

      div.innerHTML = `
        <div class="notif-title">${badge}${escapeHtml(notif.text || '')}</div>
        <div class="notif-time">${time}</div>
      `;

      // Click to open relevant page
      div.addEventListener('click', () => {
        const url = getNotifUrl(notif.type);
        if (url) {
          chrome.tabs.create({ url });
          window.close();
        }
      });

      container.appendChild(div);
    });
  } catch (err) {
    console.log('Load notifications error:', err);
  }
}

// === ACTIVITY ===

async function loadActivity() {
  try {
    const { activity } = await chrome.runtime.sendMessage({ type: 'GET_ACTIVITY', limit: 30 });
    const container = document.getElementById('activityList');

    if (!activity || activity.length === 0) {
      container.innerHTML = '<div class="empty-state">Chưa có hoạt động nào</div>';
      return;
    }

    container.innerHTML = '';
    activity.reverse().forEach(item => {
      const div = document.createElement('div');
      div.className = 'activity-item';
      const time = formatTimeAgo(item.timestamp);
      div.innerHTML = `
        <span class="activity-text">${escapeHtml(item.text)}</span>
        <span class="activity-time">${time}</span>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    console.log('Load activity error:', err);
  }
}

// === HELPERS ===

function getNotifIcon(type) {
  const icons = {
    msg_sent: '\u2709', msg_failed: '\u2718', upload_done: '\u2191', upload_failed: '\u2718',
    global_id_resolved: '\u2714', global_id_failed: '\u2718', session_ready: '\u26A1',
    session_failed: '\u26A0', new_transaction: '\u25CF', wallet_update: '\u25CF',
    held_product: '\u26A0', new_message: '\u2709', processing_update: '\u25CF',
    extension_error: '\u26A0',
  };
  return icons[type] || '\u2022';
}

function getTypeBadge(type) {
  const badges = {
    msg_sent: '<span class="type-badge success">GỬI</span>',
    msg_failed: '<span class="type-badge error">LỖI</span>',
    upload_done: '<span class="type-badge success">UPLOAD</span>',
    upload_failed: '<span class="type-badge error">UPLOAD</span>',
    global_id_resolved: '<span class="type-badge info">ID</span>',
    global_id_failed: '<span class="type-badge error">ID</span>',
    session_ready: '<span class="type-badge success">FB</span>',
    session_failed: '<span class="type-badge error">FB</span>',
    new_transaction: '<span class="type-badge bank">BANK</span>',
    wallet_update: '<span class="type-badge bank">VÍ</span>',
    held_product: '<span class="type-badge warning">HOLD</span>',
    new_message: '<span class="type-badge info">MSG</span>',
    processing_update: '<span class="type-badge info">ĐƠN</span>',
    extension_error: '<span class="type-badge error">ERR</span>',
  };
  return badges[type] || '';
}

function getNotifUrl(type) {
  const base = 'https://nhijudyshop.workers.dev';
  if (['msg_sent', 'msg_failed', 'new_message', 'global_id_resolved', 'global_id_failed', 'upload_done', 'upload_failed'].includes(type)) {
    return `${base}/inbox/`;
  }
  if (['new_transaction', 'wallet_update', 'held_product', 'processing_update'].includes(type)) {
    return 'https://nhijudyshop.github.io/n2store/orders-report/main.html';
  }
  return null;
}

function formatTimeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Vừa xong';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ trước`;
  return new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
