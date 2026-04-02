// N2Store Extension - Popup Logic

document.addEventListener('DOMContentLoaded', async () => {
  // Set extension status to green (always running)
  document.getElementById('extStatus').classList.add('green');

  // Check Facebook session status
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (response) {
      updateStatus(response);
    }
  } catch (err) {
    console.log('Failed to get status:', err);
  }

  // Check connected tabs
  updateTabCount();

  // Quick actions
  document.getElementById('openInbox').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://nhijudyshop.workers.dev/inbox/' });
    window.close();
  });

  document.getElementById('openOrders').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://nhijudyshop.workers.dev/orders-report/' });
    window.close();
  });

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    const btn = document.getElementById('refreshBtn');
    btn.disabled = true;
    btn.textContent = 'Refreshing...';
    try {
      await chrome.runtime.sendMessage({ type: 'REFRESH_SESSIONS' });
    } catch (err) {
      console.log('Refresh error:', err);
    }
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<span>&#128260;</span> Refresh';
    }, 2000);
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage?.() ||
      chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings.html') });
    window.close();
  });

  // Load activity log from storage
  loadActivity();
});

function updateStatus(status) {
  const fbDot = document.getElementById('fbStatus');
  if (status.fbConnected) {
    fbDot.classList.add('green');
  } else {
    fbDot.classList.add('yellow');
  }

  document.getElementById('sessionCount').textContent = status.sessionCount || 0;
  document.getElementById('cacheCount').textContent = status.cacheCount || 0;
  document.getElementById('msgCount').textContent = status.msgCount || 0;
}

async function updateTabCount() {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://*.nhijudyshop.workers.dev/*', '*://nhijudyshop.github.io/*'],
    });
    const count = tabs.length;
    document.getElementById('tabCount').textContent = `${count} tab${count !== 1 ? 's' : ''}`;
    const dot = document.getElementById('tabStatus');
    dot.classList.add(count > 0 ? 'green' : 'red');
  } catch (err) {
    document.getElementById('tabCount').textContent = '? tabs';
  }
}

async function loadActivity() {
  try {
    const data = await chrome.storage.local.get('activity');
    const list = data.activity || [];
    const container = document.getElementById('activityList');

    if (list.length === 0) return;

    container.innerHTML = '';
    // Show last 10 activities
    list.slice(-10).reverse().forEach((item) => {
      const div = document.createElement('div');
      div.className = 'activity-item';
      const time = new Date(item.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      div.innerHTML = `${item.text} <span class="time">${time}</span>`;
      container.appendChild(div);
    });
  } catch (err) {
    console.log('Failed to load activity:', err);
  }
}
