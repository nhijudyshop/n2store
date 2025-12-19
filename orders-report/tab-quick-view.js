/**
 * Quick View - 50 Đơn Mới Nhất
 * Fast loading view for processing orders during livestream
 */

// =====================================================
// CONFIGURATION & STATE
// =====================================================

const CONFIG = {
    API_BASE: 'https://chatomni-proxy.nhijudyshop.workers.dev',
    ORDERS_COUNT: 50,
    DEFAULT_REFRESH_INTERVAL: 5000, // 5 seconds
    STORAGE_KEY_INTERVAL: 'quick_view_refresh_interval',
    STORAGE_KEY_AUTO_REFRESH: 'quick_view_auto_refresh'
};

// State
let allData = [];
let availableTags = [];
let currentOrderTags = [];
let currentEditingOrderId = null;
let currentEditingOrderCode = null;
let autoRefreshEnabled = true;
let refreshInterval = CONFIG.DEFAULT_REFRESH_INTERVAL;
let refreshTimer = null;
let countdownTimer = null;
let isRefreshing = false;
let isModalOpen = false;

// Pancake state
let pancakeInitialized = false;

// QR Bank Config
const QR_BANK_CONFIG = {
    bin: '970416',
    name: 'ACB',
    accountNo: '75918',
    accountName: 'LAI THUY YEN NHI'
};

// QR Cache
let qrCache = {};

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[QUICK-VIEW] Initializing...');

    // Load saved settings
    loadSettings();

    // Setup event listeners
    setupEventListeners();

    // Initialize Pancake for chat
    await initPancake();

    // Load tags in background
    loadAvailableTags();

    // Load QR cache
    loadQRCache();

    // Initial data load
    await loadOrders();

    // Start auto-refresh if enabled
    if (autoRefreshEnabled) {
        startAutoRefresh();
    }

    console.log('[QUICK-VIEW] Initialization complete');
});

// =====================================================
// SETTINGS
// =====================================================

function loadSettings() {
    // Load refresh interval
    const savedInterval = localStorage.getItem(CONFIG.STORAGE_KEY_INTERVAL);
    if (savedInterval) {
        refreshInterval = parseInt(savedInterval);
        document.getElementById('refreshInterval').value = refreshInterval;
    }

    // Load auto-refresh state
    const savedAutoRefresh = localStorage.getItem(CONFIG.STORAGE_KEY_AUTO_REFRESH);
    if (savedAutoRefresh !== null) {
        autoRefreshEnabled = savedAutoRefresh === 'true';
        document.getElementById('autoRefreshToggle').checked = autoRefreshEnabled;
    }

    console.log('[QUICK-VIEW] Settings loaded:', { refreshInterval, autoRefreshEnabled });
}

function saveSettings() {
    localStorage.setItem(CONFIG.STORAGE_KEY_INTERVAL, refreshInterval);
    localStorage.setItem(CONFIG.STORAGE_KEY_AUTO_REFRESH, autoRefreshEnabled);
    showNotification('Đã lưu cài đặt mặc định', 'success');
}

// =====================================================
// EVENT LISTENERS
// =====================================================

function setupEventListeners() {
    // Auto-refresh toggle
    document.getElementById('autoRefreshToggle').addEventListener('change', (e) => {
        autoRefreshEnabled = e.target.checked;
        if (autoRefreshEnabled) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });

    // Refresh interval change
    document.getElementById('refreshInterval').addEventListener('change', (e) => {
        refreshInterval = parseInt(e.target.value);
        if (autoRefreshEnabled) {
            stopAutoRefresh();
            startAutoRefresh();
        }
    });

    // Save default button
    document.getElementById('setDefaultBtn').addEventListener('click', saveSettings);

    // Manual refresh button
    document.getElementById('manualRefreshBtn').addEventListener('click', () => {
        manualRefresh();
    });

    // Modal close handlers
    document.addEventListener('click', (e) => {
        // Close modals when clicking outside
        if (e.target.classList.contains('tag-modal')) closeTagModal();
        if (e.target.classList.contains('qr-modal')) closeOrderQRModal();
        if (e.target.classList.contains('chat-modal')) closeChatModal();
        if (e.target.classList.contains('edit-modal')) closeEditModal();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeTagModal();
            closeOrderQRModal();
            closeChatModal();
            closeEditModal();
        }
        if (e.ctrlKey && e.key === 'Enter' && document.getElementById('tagModal').style.display === 'flex') {
            saveOrderTags();
        }
    });
}

// =====================================================
// PANCAKE INITIALIZATION
// =====================================================

async function initPancake() {
    try {
        if (window.pancakeTokenManager && window.pancakeDataManager) {
            console.log('[QUICK-VIEW] Initializing Pancake...');
            window.pancakeTokenManager.initialize();
            pancakeInitialized = await window.pancakeDataManager.initialize();
            console.log('[QUICK-VIEW] Pancake initialized:', pancakeInitialized);
        }
    } catch (error) {
        console.error('[QUICK-VIEW] Pancake init error:', error);
    }
}

// =====================================================
// AUTO-REFRESH
// =====================================================

function startAutoRefresh() {
    stopAutoRefresh(); // Clear existing timers

    console.log(`[QUICK-VIEW] Starting auto-refresh every ${refreshInterval}ms`);

    // Start countdown
    startCountdown();

    // Set refresh timer
    refreshTimer = setInterval(() => {
        smartRefresh();
        startCountdown();
    }, refreshInterval);
}

function stopAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    document.getElementById('countdownProgress').style.width = '100%';
}

function startCountdown() {
    const progressBar = document.getElementById('countdownProgress');
    const startTime = Date.now();

    if (countdownTimer) {
        clearInterval(countdownTimer);
    }

    countdownTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, refreshInterval - elapsed);
        const percentage = (remaining / refreshInterval) * 100;
        progressBar.style.width = percentage + '%';

        if (remaining <= 0) {
            clearInterval(countdownTimer);
        }
    }, 50);
}

async function manualRefresh() {
    const btn = document.getElementById('manualRefreshBtn');
    btn.classList.add('refreshing');

    await smartRefresh();

    btn.classList.remove('refreshing');

    // Reset countdown if auto-refresh is on
    if (autoRefreshEnabled) {
        stopAutoRefresh();
        startAutoRefresh();
    }
}

// =====================================================
// DATA LOADING
// =====================================================

async function loadOrders() {
    console.log('[QUICK-VIEW] Loading orders...');
    showLoading(true);

    try {
        const orders = await fetchLatestOrders();
        allData = orders;
        renderTable(orders);
        updateStats();

        // Load chat data in background
        loadChatDataForOrders(orders);

        // Load debt data in background
        loadDebtDataForOrders(orders);

    } catch (error) {
        console.error('[QUICK-VIEW] Error loading orders:', error);
        showNotification('Lỗi tải dữ liệu: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function fetchLatestOrders() {
    const token = getAuthToken();
    if (!token) {
        throw new Error('Chưa đăng nhập');
    }

    // Build date filter (last 7 days to ensure we get 50 orders)
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    const url = `${CONFIG.API_BASE}/api/odata/SaleOnline_Order/ODataService.GetView?` +
        `$top=${CONFIG.ORDERS_COUNT}&` +
        `$orderby=DateCreated desc&` +
        `$filter=(DateCreated ge ${startISO} and DateCreated le ${endISO})`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.value || [];
}

// =====================================================
// SMART REFRESH
// =====================================================

async function smartRefresh() {
    if (isRefreshing) {
        console.log('[QUICK-VIEW] Refresh already in progress, skipping');
        return;
    }

    // Check if modal is open - still refresh but don't close modal
    const isAnyModalOpen = checkIfModalOpen();

    isRefreshing = true;
    console.log('[QUICK-VIEW] Smart refresh starting...');

    try {
        const newOrders = await fetchLatestOrders();

        // Find new orders (not in current data)
        const existingIds = new Set(allData.map(o => o.Id));
        const addedOrders = newOrders.filter(o => !existingIds.has(o.Id));

        // Find changed orders
        const changedOrders = [];
        newOrders.forEach(newOrder => {
            const existingOrder = allData.find(o => o.Id === newOrder.Id);
            if (existingOrder && hasOrderChanged(existingOrder, newOrder)) {
                changedOrders.push(newOrder);
            }
        });

        // Update data
        if (addedOrders.length > 0) {
            console.log(`[QUICK-VIEW] Found ${addedOrders.length} new orders`);

            // Prepend new orders
            allData = [...addedOrders, ...allData].slice(0, CONFIG.ORDERS_COUNT);

            // Add new rows to table
            prependNewRows(addedOrders);

            // Show badge
            showNewOrdersBadge(addedOrders.length);

            // Load additional data for new orders
            loadChatDataForOrders(addedOrders);
            loadDebtDataForOrders(addedOrders);
        }

        // Update changed orders
        if (changedOrders.length > 0) {
            console.log(`[QUICK-VIEW] Found ${changedOrders.length} changed orders`);
            changedOrders.forEach(order => {
                updateOrderInData(order);
                updateOrderRow(order);
            });
        }

        // Update stats
        updateStats();

    } catch (error) {
        console.error('[QUICK-VIEW] Smart refresh error:', error);
    } finally {
        isRefreshing = false;
    }
}

function checkIfModalOpen() {
    const tagModal = document.getElementById('tagModal');
    const qrModal = document.getElementById('orderQRModal');
    const chatModal = document.getElementById('chatModal');
    const editModal = document.getElementById('editModal');

    return (tagModal && tagModal.style.display === 'flex') ||
           (qrModal && qrModal.style.display === 'flex') ||
           (chatModal && chatModal.style.display === 'flex') ||
           (editModal && editModal.style.display === 'flex');
}

function hasOrderChanged(oldOrder, newOrder) {
    return oldOrder.Tags !== newOrder.Tags ||
           oldOrder.Status !== newOrder.Status ||
           oldOrder.Address !== newOrder.Address ||
           oldOrder.Note !== newOrder.Note ||
           oldOrder.TotalAmount !== newOrder.TotalAmount ||
           oldOrder.Name !== newOrder.Name ||
           oldOrder.Telephone !== newOrder.Telephone;
}

function updateOrderInData(order) {
    const index = allData.findIndex(o => o.Id === order.Id);
    if (index !== -1) {
        allData[index] = { ...allData[index], ...order };
    }
}

// =====================================================
// TABLE RENDERING
// =====================================================

function renderTable(orders) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = orders.map(order => createOrderRow(order)).join('');
}

function createOrderRow(order, highlight = false) {
    const tags = parseOrderTags(order.Tags);
    const tagsHTML = tags.map(tag =>
        `<span class="tag-pill" style="background: ${tag.Color}20; color: ${tag.Color}; border: 1px solid ${tag.Color}40;">${tag.Name}</span>`
    ).join('');

    const phone = order.Telephone || '';
    const hasQR = qrCache[normalizePhone(phone)] ? 'has-qr' : '';

    const dateCreated = order.DateCreated ?
        new Date(order.DateCreated).toLocaleString('vi-VN', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        }) : '';

    const amount = order.TotalAmount ?
        order.TotalAmount.toLocaleString('vi-VN') + 'đ' : '0đ';

    return `
        <tr data-order-id="${order.Id}" class="${highlight ? 'highlight-new' : ''}">
            <td>${order.SessionIndex || '-'}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn edit" onclick="openEditModal('${order.Id}')" title="Sửa">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn tag" onclick="openTagModal('${order.Id}', '${order.Code}')" title="TAG">
                        <i class="fas fa-tags"></i>
                    </button>
                    <button class="action-btn qr" onclick="showOrderQRModal('${phone}')" title="QR">
                        <i class="fas fa-qrcode"></i>
                    </button>
                    <button class="action-btn chat" onclick="openChatModal('${order.Id}', '${order.Facebook_PostId || ''}', '${order.Facebook_ASUserId || ''}')" title="Chat">
                        <i class="fas fa-comment"></i>
                    </button>
                </div>
            </td>
            <td>${order.Code || ''}</td>
            <td>${order.Name || ''}</td>
            <td>
                <div class="phone-cell">
                    <span>${phone}</span>
                    ${phone ? `<button class="phone-copy-btn" onclick="copyPhone('${phone}')" title="Copy"><i class="fas fa-copy"></i></button>` : ''}
                </div>
            </td>
            <td>${order.Address || ''}</td>
            <td data-column="tag">
                <div class="tag-pills">${tagsHTML}</div>
            </td>
            <td>
                <button class="qr-btn ${hasQR}" onclick="showOrderQRModal('${phone}')">
                    <i class="fas fa-qrcode"></i>
                </button>
            </td>
            <td class="message-cell" data-column="messages" onclick="openChatModal('${order.Id}', '${order.Facebook_PostId || ''}', '${order.Facebook_ASUserId || ''}')" data-order-id="${order.Id}">
                <span class="message-placeholder">--</span>
            </td>
            <td class="debt-cell" data-column="debt" data-phone="${phone}">
                <i class="fas fa-spinner fa-spin" style="color: #9ca3af;"></i>
            </td>
            <td class="notes-cell" title="${(order.Note || '').replace(/"/g, '&quot;')}">${order.Note || ''}</td>
            <td class="amount-cell">${amount}</td>
            <td class="date-cell">${dateCreated}</td>
        </tr>
    `;
}

function prependNewRows(orders) {
    const tbody = document.getElementById('tableBody');

    orders.forEach(order => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = createOrderRow(order, true);
        const newRow = tempDiv.firstElementChild;
        tbody.insertBefore(newRow, tbody.firstChild);
    });

    // Remove excess rows
    while (tbody.children.length > CONFIG.ORDERS_COUNT) {
        tbody.removeChild(tbody.lastChild);
    }
}

function updateOrderRow(order) {
    const row = document.querySelector(`tr[data-order-id="${order.Id}"]`);
    if (!row) return;

    // Update TAG cell
    const tagCell = row.querySelector('td[data-column="tag"]');
    if (tagCell) {
        const tags = parseOrderTags(order.Tags);
        const tagsHTML = tags.map(tag =>
            `<span class="tag-pill" style="background: ${tag.Color}20; color: ${tag.Color}; border: 1px solid ${tag.Color}40;">${tag.Name}</span>`
        ).join('');
        tagCell.innerHTML = `<div class="tag-pills">${tagsHTML}</div>`;
    }

    // Flash highlight
    row.classList.add('highlight-new');
    setTimeout(() => row.classList.remove('highlight-new'), 3000);
}

// =====================================================
// STATS
// =====================================================

function updateStats() {
    document.getElementById('totalOrders').textContent = allData.length;

    const totalAmount = allData.reduce((sum, order) => sum + (order.TotalAmount || 0), 0);
    document.getElementById('totalAmount').textContent = totalAmount.toLocaleString('vi-VN') + 'đ';
}

function showNewOrdersBadge(count) {
    const badge = document.getElementById('newOrdersBadge');
    const countEl = document.getElementById('newOrdersCount');

    countEl.textContent = count;
    badge.style.display = 'flex';

    // Hide after 5 seconds
    setTimeout(() => {
        badge.style.display = 'none';
    }, 5000);
}

// =====================================================
// TAG MODAL
// =====================================================

function openTagModal(orderId, orderCode) {
    currentEditingOrderId = orderId;
    currentEditingOrderCode = orderCode;

    const order = allData.find(o => o.Id === orderId);
    if (!order) {
        showNotification('Không tìm thấy đơn hàng', 'error');
        return;
    }

    currentOrderTags = parseOrderTags(order.Tags);

    renderSelectedTags();
    renderAvailableTags();

    document.getElementById('tagModal').style.display = 'flex';
    document.getElementById('tagSearchInput').focus();
}

function closeTagModal() {
    document.getElementById('tagModal').style.display = 'none';
    currentEditingOrderId = null;
    currentEditingOrderCode = null;
    currentOrderTags = [];
}

function renderSelectedTags() {
    const container = document.getElementById('selectedTagsPills');
    container.innerHTML = currentOrderTags.map(tag => `
        <span class="selected-tag-pill" style="background: ${tag.Color}20; color: ${tag.Color}; border: 1px solid ${tag.Color};">
            ${tag.Name}
            <button onclick="removeTag('${tag.Id}')" style="background: none; border: none; color: inherit; cursor: pointer; margin-left: 4px;">×</button>
        </span>
    `).join('');
}

function renderAvailableTags() {
    const container = document.getElementById('tagList');
    const searchTerm = document.getElementById('tagSearchInput').value.toLowerCase();

    const filteredTags = availableTags.filter(tag =>
        tag.Name.toLowerCase().includes(searchTerm)
    );

    if (filteredTags.length === 0) {
        container.innerHTML = '<div class="no-tags-message"><p>Không tìm thấy tag</p></div>';
        return;
    }

    container.innerHTML = filteredTags.map(tag => {
        const isSelected = currentOrderTags.some(t => t.Id === tag.Id);
        return `
            <div class="tag-item ${isSelected ? 'selected' : ''}" onclick="toggleTag('${tag.Id}')">
                <span class="tag-color" style="background: ${tag.Color};"></span>
                <span class="tag-name">${tag.Name}</span>
                ${isSelected ? '<i class="fas fa-check" style="color: #10b981;"></i>' : ''}
            </div>
        `;
    }).join('');
}

function toggleTag(tagId) {
    const tag = availableTags.find(t => t.Id === tagId);
    if (!tag) return;

    const index = currentOrderTags.findIndex(t => t.Id === tagId);
    if (index === -1) {
        currentOrderTags.push(tag);
    } else {
        currentOrderTags.splice(index, 1);
    }

    renderSelectedTags();
    renderAvailableTags();
}

function removeTag(tagId) {
    currentOrderTags = currentOrderTags.filter(t => t.Id !== tagId);
    renderSelectedTags();
    renderAvailableTags();
}

function filterTags() {
    renderAvailableTags();
}

function handleTagInputKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        // Select first visible tag
        const firstTag = document.querySelector('.tag-item:not(.selected)');
        if (firstTag) {
            firstTag.click();
        }
    }
}

async function saveOrderTags() {
    if (!currentEditingOrderId) return;

    const token = getAuthToken();
    if (!token) {
        showNotification('Chưa đăng nhập', 'error');
        return;
    }

    try {
        const payload = {
            Tags: currentOrderTags.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
            OrderId: currentEditingOrderId
        };

        const response = await fetch(`${CONFIG.API_BASE}/api/odata/TagSaleOnlineOrder/ODataService.AssignTag`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error('Lỗi lưu tag');
        }

        // Update local data
        const order = allData.find(o => o.Id === currentEditingOrderId);
        if (order) {
            order.Tags = JSON.stringify(currentOrderTags);
            updateOrderRow(order);
        }

        showNotification('Đã lưu tag', 'success');
        closeTagModal();

    } catch (error) {
        console.error('[QUICK-VIEW] Save tag error:', error);
        showNotification('Lỗi lưu tag: ' + error.message, 'error');
    }
}

async function loadAvailableTags() {
    const token = getAuthToken();
    if (!token) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE}/api/odata/Tag?$top=1000`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            availableTags = data.value || [];
            console.log(`[QUICK-VIEW] Loaded ${availableTags.length} tags`);
        }
    } catch (error) {
        console.error('[QUICK-VIEW] Load tags error:', error);
    }
}

async function refreshTags() {
    showNotification('Đang tải lại tag...', 'info');
    await loadAvailableTags();
    renderAvailableTags();
    showNotification('Đã tải lại tag', 'success');
}

// =====================================================
// QR MODAL
// =====================================================

function showOrderQRModal(phone, amount = 0) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        showNotification('Không có số điện thoại', 'warning');
        return;
    }

    const uniqueCode = getOrCreateQRForPhone(normalizedPhone);
    if (!uniqueCode) {
        showNotification('Không thể tạo mã QR', 'error');
        return;
    }

    const qrUrl = generateVietQRUrl(uniqueCode, amount);

    const modalBody = document.getElementById('orderQRModalBody');
    modalBody.innerHTML = `
        <img src="${qrUrl}" alt="QR Code" style="width: 280px; max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">

        <div style="margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; text-align: left; font-size: 13px;">
            <div style="margin-bottom: 8px;">
                <strong>Ngân hàng:</strong> ${QR_BANK_CONFIG.name}<br>
                <strong>Số TK:</strong> ${QR_BANK_CONFIG.accountNo}<br>
                <strong>Chủ TK:</strong> ${QR_BANK_CONFIG.accountName}<br>
            </div>
            <div style="padding: 8px; background: white; border: 2px dashed #dee2e6; border-radius: 6px; font-family: monospace; font-size: 13px; font-weight: bold; color: #495057; text-align: center;">
                ${uniqueCode}
            </div>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <button onclick="copyText('${uniqueCode}')" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                <i class="fas fa-copy"></i> Copy mã
            </button>
            <button onclick="copyText('${qrUrl}')" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                <i class="fas fa-image"></i> Copy URL
            </button>
        </div>

        <div style="margin-top: 12px; padding: 10px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; font-size: 12px; color: #92400e; text-align: left;">
            <strong>Lưu ý:</strong> Khách hàng cần nhập đúng mã <strong>${uniqueCode}</strong> khi chuyển khoản.
        </div>
    `;

    document.getElementById('orderQRModal').style.display = 'flex';
}

function closeOrderQRModal() {
    document.getElementById('orderQRModal').style.display = 'none';
}

function generateVietQRUrl(uniqueCode, amount = 0) {
    const baseUrl = 'https://img.vietqr.io/image';
    const template = amount > 0 ? 'compact2' : 'compact';
    let url = `${baseUrl}/${QR_BANK_CONFIG.bin}-${QR_BANK_CONFIG.accountNo}-${template}.png`;

    const params = new URLSearchParams();
    if (amount > 0) {
        params.append('amount', amount);
    }
    params.append('addInfo', uniqueCode);
    params.append('accountName', QR_BANK_CONFIG.accountName);

    return `${url}?${params.toString()}`;
}

function getOrCreateQRForPhone(phone) {
    if (qrCache[phone]) {
        return qrCache[phone].code;
    }

    const code = generateUniqueCode();
    qrCache[phone] = { code, synced: false };
    saveQRCache();

    // Sync to API in background
    syncQRToAPI(phone, code);

    return code;
}

function generateUniqueCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function loadQRCache() {
    try {
        const cached = localStorage.getItem('orders_phone_qr_cache');
        if (cached) {
            qrCache = JSON.parse(cached);
        }
    } catch (e) {
        qrCache = {};
    }
}

function saveQRCache() {
    localStorage.setItem('orders_phone_qr_cache', JSON.stringify(qrCache));
}

async function syncQRToAPI(phone, code) {
    try {
        const token = getAuthToken();
        if (!token) return;

        await fetch(`${CONFIG.API_BASE}/api/sepay/customer-info`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ customer_phone: phone, qr_code: code })
        });

        qrCache[phone].synced = true;
        saveQRCache();
    } catch (e) {
        console.error('[QUICK-VIEW] QR sync error:', e);
    }
}

// =====================================================
// CHAT MODAL
// =====================================================

let currentChatOrderId = null;
let currentChatPageId = null;
let currentChatPSID = null;

async function openChatModal(orderId, postId, psid) {
    currentChatOrderId = orderId;
    currentChatPageId = postId ? postId.split('_')[0] : null;
    currentChatPSID = psid;

    const order = allData.find(o => o.Id === orderId);
    const customerName = order ? order.Name : 'Khách hàng';

    document.getElementById('chatModalTitle').textContent = `Tin nhắn với ${customerName}`;
    document.getElementById('chatModalSubtitleText').textContent = 'Đang tải...';
    document.getElementById('chatModalBody').innerHTML = `
        <div class="chat-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải tin nhắn...</p>
        </div>
    `;

    document.getElementById('chatModal').style.display = 'flex';

    // Load messages
    await loadChatMessages();
}

function closeChatModal() {
    document.getElementById('chatModal').style.display = 'none';
    currentChatOrderId = null;
    currentChatPageId = null;
    currentChatPSID = null;
}

async function loadChatMessages() {
    if (!pancakeInitialized || !currentChatPSID) {
        document.getElementById('chatModalBody').innerHTML = `
            <div class="chat-loading">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Không thể tải tin nhắn. Vui lòng thử lại sau.</p>
            </div>
        `;
        return;
    }

    try {
        // Get conversation from Pancake
        const conversation = window.pancakeDataManager.inboxMapByPSID.get(currentChatPSID);

        if (!conversation) {
            document.getElementById('chatModalBody').innerHTML = `
                <div class="chat-loading">
                    <i class="fas fa-comment-slash"></i>
                    <p>Chưa có tin nhắn</p>
                </div>
            `;
            document.getElementById('chatModalSubtitleText').textContent = 'Chưa có cuộc trò chuyện';
            return;
        }

        // Fetch messages
        const messages = await window.pancakeDataManager.fetchMessages(conversation.id);

        if (!messages || messages.length === 0) {
            document.getElementById('chatModalBody').innerHTML = `
                <div class="chat-loading">
                    <i class="fas fa-comment-slash"></i>
                    <p>Chưa có tin nhắn</p>
                </div>
            `;
            return;
        }

        // Render messages
        renderChatMessages(messages);
        document.getElementById('chatModalSubtitleText').textContent = `${messages.length} tin nhắn`;

    } catch (error) {
        console.error('[QUICK-VIEW] Load chat error:', error);
        document.getElementById('chatModalBody').innerHTML = `
            <div class="chat-loading">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Lỗi tải tin nhắn: ${error.message}</p>
            </div>
        `;
    }
}

function renderChatMessages(messages) {
    const container = document.getElementById('chatModalBody');

    container.innerHTML = messages.map(msg => {
        const isOutgoing = msg.is_page_reply || msg.from?.id !== currentChatPSID;
        const time = msg.created_time ? new Date(msg.created_time * 1000).toLocaleString('vi-VN', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
        }) : '';

        return `
            <div class="chat-message ${isOutgoing ? 'outgoing' : 'incoming'}">
                <div class="chat-message-bubble">
                    <div class="chat-message-text">${msg.text || msg.message || ''}</div>
                    <div class="chat-message-time">${time}</div>
                </div>
            </div>
        `;
    }).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();

    if (!message) return;

    showNotification('Chức năng gửi tin nhắn đang phát triển', 'info');
    input.value = '';
}

function openCommentsInChat() {
    showNotification('Chức năng xem bình luận đang phát triển', 'info');
}

// =====================================================
// EDIT MODAL
// =====================================================

let currentEditOrder = null;

async function openEditModal(orderId) {
    const order = allData.find(o => o.Id === orderId);
    if (!order) {
        showNotification('Không tìm thấy đơn hàng', 'error');
        return;
    }

    currentEditOrder = order;

    document.getElementById('editModalBody').innerHTML = `
        <div class="edit-form-group">
            <label>Mã đơn hàng</label>
            <input type="text" id="editOrderCode" value="${order.Code || ''}" disabled>
        </div>
        <div class="edit-form-group">
            <label>Tên khách hàng</label>
            <input type="text" id="editCustomerName" value="${order.Name || ''}">
        </div>
        <div class="edit-form-group">
            <label>Số điện thoại</label>
            <input type="text" id="editPhone" value="${order.Telephone || ''}">
        </div>
        <div class="edit-form-group">
            <label>Địa chỉ</label>
            <textarea id="editAddress">${order.Address || ''}</textarea>
        </div>
        <div class="edit-form-group">
            <label>Ghi chú</label>
            <textarea id="editNote">${order.Note || ''}</textarea>
        </div>
    `;

    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    currentEditOrder = null;
}

async function saveOrderEdit() {
    if (!currentEditOrder) return;

    const token = getAuthToken();
    if (!token) {
        showNotification('Chưa đăng nhập', 'error');
        return;
    }

    const updatedData = {
        Name: document.getElementById('editCustomerName').value,
        Telephone: document.getElementById('editPhone').value,
        Address: document.getElementById('editAddress').value,
        Note: document.getElementById('editNote').value
    };

    try {
        const response = await fetch(`${CONFIG.API_BASE}/api/odata/SaleOnline_Order(${currentEditOrder.Id})`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedData)
        });

        if (!response.ok) {
            throw new Error('Lỗi cập nhật');
        }

        // Update local data
        Object.assign(currentEditOrder, updatedData);

        // Refresh the row
        const row = document.querySelector(`tr[data-order-id="${currentEditOrder.Id}"]`);
        if (row) {
            row.outerHTML = createOrderRow(currentEditOrder, true);
        }

        showNotification('Đã cập nhật đơn hàng', 'success');
        closeEditModal();

    } catch (error) {
        console.error('[QUICK-VIEW] Save order error:', error);
        showNotification('Lỗi cập nhật: ' + error.message, 'error');
    }
}

// =====================================================
// CHAT DATA LOADING
// =====================================================

async function loadChatDataForOrders(orders) {
    if (!pancakeInitialized) return;

    try {
        const channelIds = [...new Set(
            orders
                .map(o => o.Facebook_PostId ? o.Facebook_PostId.split('_')[0] : null)
                .filter(id => id)
        )];

        if (channelIds.length > 0) {
            await window.pancakeDataManager.fetchConversations(true, channelIds);
        }

        // Update message cells
        orders.forEach(order => {
            updateMessageCell(order);
        });

    } catch (error) {
        console.error('[QUICK-VIEW] Load chat data error:', error);
    }
}

function updateMessageCell(order) {
    const cell = document.querySelector(`td[data-column="messages"][data-order-id="${order.Id}"]`);
    if (!cell || !order.Facebook_ASUserId) return;

    const conversation = window.pancakeDataManager?.inboxMapByPSID?.get(order.Facebook_ASUserId);

    if (conversation) {
        const lastMessage = conversation.last_message?.text || conversation.snippet || '';
        const isUnread = !conversation.is_read;
        const truncated = lastMessage.length > 30 ? lastMessage.substring(0, 30) + '...' : lastMessage;

        cell.innerHTML = `
            ${isUnread ? '<span class="unread-indicator"></span>' : ''}
            <span style="font-weight: ${isUnread ? '600' : '400'};">${truncated || '--'}</span>
        `;
    } else {
        cell.innerHTML = '<span class="message-placeholder">--</span>';
    }
}

// =====================================================
// DEBT DATA LOADING
// =====================================================

async function loadDebtDataForOrders(orders) {
    const token = getAuthToken();
    if (!token) return;

    for (const order of orders) {
        if (order.Telephone) {
            loadDebtForPhone(order.Telephone, token);
        }
    }
}

async function loadDebtForPhone(phone, token) {
    const normalizedPhone = normalizePhone(phone);
    const cell = document.querySelector(`td[data-column="debt"][data-phone="${phone}"]`);
    if (!cell) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE}/api/sepay/debt-summary?phone=${normalizedPhone}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            const debt = data.total_debt || 0;

            if (debt > 0) {
                cell.innerHTML = `<span class="debt-positive">${debt.toLocaleString('vi-VN')}đ</span>`;
            } else {
                cell.innerHTML = `<span class="debt-zero">0đ</span>`;
            }
        } else {
            cell.innerHTML = '--';
        }
    } catch (error) {
        cell.innerHTML = '--';
    }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function showNotification(message, type = 'info') {
    // Use existing notification system if available
    if (window.showNotification) {
        window.showNotification(message, type);
        return;
    }

    // Fallback: simple alert
    console.log(`[${type.toUpperCase()}] ${message}`);

    // Create toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function getAuthToken() {
    // Try session storage first
    const sessionAuth = sessionStorage.getItem('loginindex_auth');
    if (sessionAuth) {
        try {
            const parsed = JSON.parse(sessionAuth);
            return parsed.token || parsed.accessToken;
        } catch (e) {}
    }

    // Try localStorage
    const localAuth = localStorage.getItem('loginindex_auth');
    if (localAuth) {
        try {
            const parsed = JSON.parse(localAuth);
            return parsed.token || parsed.accessToken;
        } catch (e) {}
    }

    // Try tokenManager
    if (window.tokenManager && window.tokenManager.getToken) {
        return window.tokenManager.getToken();
    }

    return null;
}

function parseOrderTags(tagsString) {
    if (!tagsString) return [];
    try {
        const tags = JSON.parse(tagsString);
        return Array.isArray(tags) ? tags : [];
    } catch (e) {
        return [];
    }
}

function normalizePhone(phone) {
    if (!phone) return null;
    return phone.replace(/[\s\-\.]/g, '');
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Đã copy', 'success');
    } catch (e) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showNotification('Đã copy', 'success');
    }
}

function copyPhone(phone) {
    copyText(phone);
}
