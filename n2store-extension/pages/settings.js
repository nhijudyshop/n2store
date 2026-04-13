// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// N2Store Extension - Settings Page Logic

document.addEventListener('DOMContentLoaded', async () => {
  // Sync version from manifest
  try {
    const v = chrome.runtime.getManifest().version;
    const el = document.getElementById('versionText');
    if (el) el.textContent = `v${v}`;
  } catch {}

  // Load current preferences
  await loadPreferences();
  await loadOnCallSettings();
  await loadStatus();

  // Save button
  document.getElementById('saveBtn').addEventListener('click', saveSettings);

  // Test notification
  document.getElementById('testBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({
      type: 'TEST_NOTIFICATION',
      notifType: 'new_transaction',
      body: 'Test: 500,000đ từ VCB - TT ĐƠN 1234'
    });
    showToast('Đã gửi test notification!');
  });

  // Clear data
  document.getElementById('clearDataBtn').addEventListener('click', async () => {
    if (confirm('Xóa toàn bộ dữ liệu thông báo và hoạt động?')) {
      await chrome.runtime.sendMessage({ type: 'CLEAR_ACTIVITY' });
      await chrome.runtime.sendMessage({ type: 'MARK_ALL_READ' });
      await chrome.runtime.sendMessage({ type: 'RESET_BADGE' });
      showToast('Đã xóa dữ liệu!');
    }
  });
});

async function loadPreferences() {
  try {
    const { prefs } = await chrome.runtime.sendMessage({ type: 'GET_PREFERENCES' });
    if (!prefs) return;

    document.getElementById('notifEnabled').checked = prefs.enabled !== false;
    document.getElementById('notifSound').checked = prefs.sound !== false;
    document.getElementById('sseEnabled').checked = prefs.sseEnabled !== false;

    // Set individual type toggles
    const disabledTypes = prefs.disabledTypes || [];
    document.querySelectorAll('.notif-type').forEach(cb => {
      const type = cb.dataset.type;
      cb.checked = !disabledTypes.includes(type);
    });
  } catch (err) {
    console.error('Load prefs error:', err);
  }
}

async function saveSettings() {
  // Collect disabled types
  const disabledTypes = [];
  document.querySelectorAll('.notif-type').forEach(cb => {
    if (!cb.checked) {
      disabledTypes.push(cb.dataset.type);
      // Also include the failure variant
      const failType = cb.dataset.type.replace('_done', '_failed')
        .replace('_resolved', '_failed')
        .replace('_ready', '_failed');
      if (failType !== cb.dataset.type) {
        disabledTypes.push(failType);
      }
    }
  });

  const prefs = {
    enabled: document.getElementById('notifEnabled').checked,
    sound: document.getElementById('notifSound').checked,
    sseEnabled: document.getElementById('sseEnabled').checked,
    disabledTypes,
  };

  // Save OnCallCX settings too
  const oncallSettings = {
    extension: document.getElementById('oncallExtension').value,
    autoConfirm: document.getElementById('oncallAutoConfirm').checked,
    sipAuthId: document.getElementById('oncallAuthId').value.trim(),
    sipPassword: document.getElementById('oncallPassword').value.trim(),
  };

  try {
    await chrome.runtime.sendMessage({ type: 'SAVE_PREFERENCES', prefs });
    await chrome.runtime.sendMessage({ type: 'SAVE_ONCALL_SETTINGS', settings: oncallSettings });
    showToast('Đã lưu cài đặt!');
  } catch (err) {
    console.error('Save error:', err);
    showToast('Lỗi khi lưu!');
  }
}

async function loadStatus() {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (!status) return;

    // Facebook
    const fbDot = document.getElementById('fbDot');
    const fbText = document.getElementById('fbStatusText');
    if (status.sessionCount > 0) {
      fbDot.classList.add('green');
      fbText.textContent = `Facebook: ${status.sessionCount} trang đã kết nối`;
    } else {
      fbDot.classList.add('yellow');
      fbText.textContent = 'Facebook: Chưa kết nối (mở Inbox để khởi tạo)';
    }

    // SSE
    const sseDot = document.getElementById('sseDot');
    const sseText = document.getElementById('sseStatusText');
    if (status.sse?.connected) {
      sseDot.classList.add('green');
      sseText.textContent = 'SSE: Đang kết nối (real-time)';
    } else {
      sseDot.classList.add('red');
      sseText.textContent = `SSE: Chưa kết nối (retry: ${status.sse?.reconnectAttempts || 0})`;
    }

    // Tabs
    const tabs = await chrome.tabs.query({
      url: ['*://*.nhijudyshop.workers.dev/*', '*://nhijudyshop.github.io/*'],
    });
    const tabDot = document.getElementById('tabDot');
    const tabText = document.getElementById('tabStatusText');
    tabDot.classList.add(tabs.length > 0 ? 'green' : 'red');
    tabText.textContent = `Tabs: ${tabs.length} tab đang mở`;
  } catch (err) {
    console.error('Status error:', err);
  }
}

async function loadOnCallSettings() {
  try {
    const { settings } = await chrome.runtime.sendMessage({ type: 'GET_ONCALL_SETTINGS' });
    if (!settings) return;
    document.getElementById('oncallExtension').value = settings.extension || '';
    document.getElementById('oncallAutoConfirm').checked = settings.autoConfirm === true;
    document.getElementById('oncallAuthId').value = settings.sipAuthId || '';
    document.getElementById('oncallPassword').value = settings.sipPassword || '';
  } catch {
    // OnCallCX settings not available
  }
}

function showToast(msg) {
  const toast = document.getElementById('savedToast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}
