// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// N2Store Extension - Popup Logic
// Manages tabs, notifications display, activity log, quick actions

document.addEventListener('DOMContentLoaded', async () => {
    // Extension always green
    document.getElementById('extStatus').classList.add('green');

    // Sync version from manifest
    try {
        const v = chrome.runtime.getManifest().version;
        const el = document.getElementById('version');
        if (el) el.textContent = `v${v}`;
    } catch {}

    // Update banner: nếu version-checker đã lưu updateInfo và remote > installed → show
    showUpdateBannerIfAvailable();

    // Livestream Snapshot: auto-grab tab streamId nếu active tab là tpos-pancake.
    // chrome.tabCapture.getMediaStreamId() yêu cầu user gesture (popup click =
    // gesture). Sau khi user click extension icon, streamId được sent về page
    // → page dùng getUserMedia tạo MediaStream → capture tab dù focused hay
    // không (no popup, no tab-switch limitation).
    grabTabStreamForLivestreamSnap();

    // Load status from service worker
    await loadStatus();
    await updateTabCount();

    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Quick actions
    document.getElementById('openInbox').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://nhijudy.store/inbox/index.html' });
        window.close();
    });

    document.getElementById('openOrders').addEventListener('click', () => {
        chrome.tabs.create({
            url: 'https://nhijudy.store/orders-report/main.html',
        });
        window.close();
    });

    document.getElementById('refreshBtn').addEventListener('click', async () => {
        const btn = document.getElementById('refreshBtn');
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
        try {
            await chrome.runtime.sendMessage({ type: 'REFRESH_SESSIONS' });
        } catch (err) {
            /* ignore */
        }
        setTimeout(() => {
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        }, 2000);
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
            body: 'Test: Tin nhắn đã gửi thành công!',
        });
    });

    // SSE toggle
    const sseToggle = document.getElementById('sseToggle');
    try {
        const { prefs } = await chrome.runtime.sendMessage({ type: 'GET_PREFERENCES' });
        sseToggle.checked = prefs?.sseEnabled !== false;
    } catch (e) {
        /* ignore */
    }

    sseToggle.addEventListener('change', async () => {
        await chrome.runtime.sendMessage({ type: 'TOGGLE_SSE', enabled: sseToggle.checked });
    });

    // Stat card clicks
    document.querySelectorAll('.stat-card.clickable').forEach((card) => {
        card.addEventListener('click', () => handleStatClick(card.dataset.stat));
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

    // Call tab - quick dial
    document.getElementById('callBtn').addEventListener('click', () => {
        const phone = document.getElementById('callInput').value.trim();
        if (phone) quickDial(phone);
    });

    document.getElementById('callInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const phone = e.target.value.trim();
            if (phone) quickDial(phone);
        }
    });

    document.getElementById('clearCallLogBtn').addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ type: 'CLEAR_CALL_LOG' });
        await loadCallLog();
    });

    // Load notification and activity tabs
    await loadNotifications();
    await loadActivity();
    await loadCallTab();
});

// === TAB SWITCHING ===

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
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
        sseDot.classList.add(
            status.sse?.connected ? 'green' : status.sse?.readyState === 0 ? 'yellow' : 'red'
        );

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
            url: [
                '*://*.nhijudyshop.workers.dev/*',
                '*://nhijudyshop.github.io/*',
                '*://nhijudy.store/*',
            ],
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

// === STAT CARD DETAIL ===

let _activeStatCard = null;

async function handleStatClick(stat) {
    const detail = document.getElementById('statDetail');
    const cards = document.querySelectorAll('.stat-card.clickable');

    // Toggle off if clicking same card
    if (_activeStatCard === stat) {
        _activeStatCard = null;
        detail.style.display = 'none';
        cards.forEach((c) => c.classList.remove('active'));
        return;
    }

    _activeStatCard = stat;
    cards.forEach((c) => c.classList.toggle('active', c.dataset.stat === stat));

    if (stat === 'pages') {
        detail.innerHTML = '<div class="stat-detail-title">Loading...</div>';
        detail.style.display = 'block';
        try {
            const { pages } = await chrome.runtime.sendMessage({ type: 'GET_SESSION_DETAILS' });
            if (!pages || pages.length === 0) {
                detail.innerHTML = '<div class="empty-state">Chưa kết nối trang nào</div>';
            } else {
                detail.innerHTML =
                    `<div class="stat-detail-title">Trang Facebook đã kết nối</div>` +
                    pages
                        .map(
                            (p) =>
                                `<div class="stat-detail-item">
              <span class="stat-detail-id">${p.id}</span>
              <span class="stat-detail-meta">${p.age} phút trước</span>
            </div>`
                        )
                        .join('');
            }
        } catch (err) {
            detail.innerHTML = '<div class="empty-state">Lỗi tải dữ liệu</div>';
        }
    } else if (stat === 'sent') {
        // Switch to notifications tab, filtered by msg_sent
        switchTab('notifications');
        _activeStatCard = null;
        detail.style.display = 'none';
        cards.forEach((c) => c.classList.remove('active'));
        await loadNotifications('msg_sent');
    } else if (stat === 'failed') {
        switchTab('notifications');
        _activeStatCard = null;
        detail.style.display = 'none';
        cards.forEach((c) => c.classList.remove('active'));
        await loadNotifications('msg_failed');
    } else if (stat === 'unread') {
        switchTab('notifications');
        _activeStatCard = null;
        detail.style.display = 'none';
        cards.forEach((c) => c.classList.remove('active'));
        await loadNotifications('unread');
    }
}

// === NOTIFICATIONS ===

async function loadNotifications(filter) {
    try {
        const { notifications } = await chrome.runtime.sendMessage({
            type: 'GET_NOTIFICATIONS',
            limit: 50,
        });
        const container = document.getElementById('notifList');

        if (!notifications || notifications.length === 0) {
            container.innerHTML = '<div class="empty-state">Chưa có thông báo nào</div>';
            return;
        }

        // Apply filter
        let filtered = [...notifications].reverse();
        let filterLabel = '';
        if (filter === 'unread') {
            filtered = filtered.filter((n) => !n.read);
            filterLabel = 'Chưa đọc';
        } else if (filter) {
            filtered = filtered.filter((n) => n.type === filter);
            filterLabel = filter === 'msg_sent' ? 'Đã gửi' : 'Thất bại';
        }

        if (filtered.length === 0) {
            const msg = filterLabel
                ? `Không có thông báo "${filterLabel}"`
                : 'Chưa có thông báo nào';
            container.innerHTML = `<div class="empty-state">${msg}</div>`;
            return;
        }

        container.innerHTML = '';

        // Show filter indicator
        if (filter) {
            const filterBar = document.createElement('div');
            filterBar.className = 'filter-bar';
            filterBar.innerHTML = `<span>Lọc: ${filterLabel} (${filtered.length})</span><button class="text-btn" id="clearFilterBtn">Xóa lọc</button>`;
            container.appendChild(filterBar);
            filterBar
                .querySelector('#clearFilterBtn')
                .addEventListener('click', () => loadNotifications());
        }

        filtered.forEach((notif) => {
            const div = document.createElement('div');
            div.className = `notif-item${notif.read ? '' : ' unread'}`;

            const badge = getTypeBadge(notif.type);
            const time = formatTimeAgo(notif.timestamp);

            div.innerHTML = `
        <div class="notif-title">${badge}${escapeHtml(notif.text || '')}</div>
        <div class="notif-time">${time}</div>
      `;

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
        activity.reverse().forEach((item) => {
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

// === CALL TAB ===

async function loadCallTab() {
    try {
        const { settings } = await chrome.runtime.sendMessage({ type: 'GET_ONCALL_SETTINGS' });
        const extLabel = document.getElementById('callExtLabel');
        if (settings?.extension) {
            extLabel.textContent = `Ext: ${settings.extension}`;
        } else {
            extLabel.textContent = 'Ext: chưa cấu hình';
        }
    } catch {
        // Settings not available yet
    }
    await loadCallLog();
}

async function loadCallLog() {
    try {
        const { callLog } = await chrome.runtime.sendMessage({ type: 'GET_CALL_LOG', limit: 30 });
        const container = document.getElementById('callLogList');

        if (!callLog || callLog.length === 0) {
            container.innerHTML = '<div class="empty-state">Chưa có cuộc gọi nào</div>';
            return;
        }

        container.innerHTML = '';
        [...callLog].reverse().forEach((entry) => {
            const div = document.createElement('div');
            div.className = 'call-log-item';
            const time = formatTimeAgo(entry.timestamp);
            const name = entry.customerName || 'Không rõ';
            div.innerHTML = `
        <span class="call-log-icon">&#128222;</span>
        <div class="call-log-info">
          <div class="call-log-name">${escapeHtml(name)}${entry.orderCode ? ` #${escapeHtml(entry.orderCode)}` : ''}</div>
          <div class="call-log-phone">${escapeHtml(entry.phone)}</div>
        </div>
        <span class="call-log-time">${time}</span>
      `;
            // Click to redial
            div.addEventListener('click', () => {
                document.getElementById('callInput').value = entry.phone;
                quickDial(entry.phone, entry.customerName);
            });
            container.appendChild(div);
        });
    } catch {
        // ignore
    }
}

async function quickDial(phone, customerName) {
    const normalized = phone.replace(/[\s\-()]/g, '');
    if (!normalized || normalized.length < 4) return;

    const displayName = customerName || normalized;
    const confirmed = confirm(`Gọi cho ${displayName} (${normalized})?`);
    if (!confirmed) return;

    // Check user preference: WebRTC phone window or tel: protocol
    let useWebRTC = false;
    try {
        const { settings } = await chrome.runtime.sendMessage({ type: 'GET_ONCALL_SETTINGS' });
        useWebRTC = settings?.useWebRTC === true;
    } catch {}

    if (useWebRTC) {
        // WebRTC: Open floating phone window
        chrome.runtime
            .sendMessage({
                type: 'OPEN_PHONE',
                phone: normalized,
                customerName: customerName || '',
            })
            .catch(() => window.open(`tel:${normalized}`, '_self'));
    } else {
        // Default: tel: protocol (Zoiper/anConnect desktop handles it)
        window.open(`tel:${normalized}`, '_self');
    }

    // Log the call
    chrome.runtime
        .sendMessage({
            type: 'ADD_CALL_LOG',
            entry: { phone: normalized, customerName: customerName || '', timestamp: Date.now() },
        })
        .catch(() => {});

    window.close();
}

// === HELPERS ===

function getNotifIcon(type) {
    const icons = {
        msg_sent: '\u2709',
        msg_failed: '\u2718',
        upload_done: '\u2191',
        upload_failed: '\u2718',
        global_id_resolved: '\u2714',
        global_id_failed: '\u2718',
        session_ready: '\u26A1',
        session_failed: '\u26A0',
        new_transaction: '\u25CF',
        wallet_update: '\u25CF',
        held_product: '\u26A0',
        new_message: '\u2709',
        processing_update: '\u25CF',
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
    if (
        [
            'msg_sent',
            'msg_failed',
            'new_message',
            'global_id_resolved',
            'global_id_failed',
            'upload_done',
            'upload_failed',
        ].includes(type)
    ) {
        return 'https://nhijudy.store/inbox/index.html';
    }
    if (['new_transaction', 'wallet_update', 'held_product', 'processing_update'].includes(type)) {
        return 'https://nhijudy.store/orders-report/main.html';
    }
    return null;
}

function formatTimeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Vừa xong';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ trước`;
    return new Date(ts).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Livestream Snapshot — grab tab streamId on popup open + send tới active tab.
// chrome.tabCapture.getMediaStreamId() là API duy nhất cho phép page lấy stream
// của tab SPECIFIC (regardless tab focus). Yêu cầu user gesture → popup click.
// Sau khi sent streamId, page dùng navigator.mediaDevices.getUserMedia
// ({chromeMediaSourceId}) tạo MediaStream → frame buffer + capture work mượt
// dù user switch sang tab khác.
async function grabTabStreamForLivestreamSnap() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !tab?.url) return;
        // Chỉ grab cho tpos-pancake page (host check). Pages khác không cần.
        const isTposPancake =
            /^https:\/\/nhijudy\.store\/tpos-pancake\//.test(tab.url) ||
            /^http:\/\/localhost(:\d+)?\/tpos-pancake\//.test(tab.url);
        if (!isTposPancake) return;
        // chrome.tabCapture.getMediaStreamId() — MV3 API, requires user gesture.
        // Popup click chính là gesture. consumerTabId = tab cần dùng stream;
        // targetTabId = tab cần capture (cùng tabId vì page tự dùng cho mình).
        const streamId = await new Promise((resolve, reject) => {
            chrome.tabCapture.getMediaStreamId(
                { consumerTabId: tab.id, targetTabId: tab.id },
                (id) => {
                    const err = chrome.runtime.lastError;
                    if (err) reject(new Error(err.message));
                    else resolve(id);
                }
            );
        });
        if (!streamId) {
            console.warn('[popup] no streamId returned');
            return;
        }
        // Send streamId via chrome.tabs.sendMessage. Content script forward
        // vào page qua window.postMessage. Page có 10s để consume streamId
        // (Chrome timeout for tab stream IDs).
        try {
            await chrome.tabs.sendMessage(tab.id, {
                type: 'N2_TAB_STREAM_ID',
                streamId,
                ts: Date.now(),
            });
            console.log('[popup] streamId sent to tab', tab.id);
        } catch (e) {
            console.warn('[popup] sendMessage fail:', e.message);
        }
    } catch (e) {
        // tabCapture API not available / permission denied / no host match — silent.
        console.warn('[popup] grabTabStream fail:', e.message);
    }
}

// === Update Available Banner ===
// Đọc updateInfo từ chrome.storage.local (do background/version-checker.js lưu).
// Nếu remote > installed → show banner với nút mở Chrome Web Store.
async function showUpdateBannerIfAvailable() {
    try {
        const banner = document.getElementById('updateBanner');
        if (!banner) return;
        const { updateInfo, updateBannerDismissedFor } = await chrome.storage.local.get([
            'updateInfo',
            'updateBannerDismissedFor',
        ]);
        if (!updateInfo || !updateInfo.updateAvailable) return;
        // User đã dismiss banner cho version này → ẩn cho đến khi có version mới hơn
        if (updateBannerDismissedFor === updateInfo.latestVersion) return;

        const subEl = document.getElementById('updateBannerSub');
        if (subEl) {
            subEl.textContent = `v${updateInfo.installedVersion} → v${updateInfo.latestVersion}`;
        }
        banner.style.display = 'block';

        const btn = document.getElementById('updateBannerBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                chrome.tabs.create({ url: updateInfo.storeUrl });
                window.close();
            });
        }

        const dismiss = document.getElementById('updateBannerDismiss');
        if (dismiss) {
            dismiss.addEventListener('click', async () => {
                banner.style.display = 'none';
                await chrome.storage.local.set({
                    updateBannerDismissedFor: updateInfo.latestVersion,
                });
            });
        }
    } catch (e) {
        console.warn('[popup] update banner check fail:', e.message);
    }
}
