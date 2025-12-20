/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                         QUICK VIEW TAB - JAVASCRIPT                        ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  Purpose: Fast order processing during livestream                         ║
 * ║  Target: Load 50 latest orders in < 500ms, auto-refresh 5s               ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  Sections:                                                                 ║
 * ║    #GLOBAL     - Global variables and constants                           ║
 * ║    #INIT       - Initialization and setup                                 ║
 * ║    #FETCH      - Data fetching                                            ║
 * ║    #RENDER     - Table rendering                                          ║
 * ║    #REFRESH    - Auto-refresh system                                      ║
 * ║    #TAG        - Tag management                                           ║
 * ║    #QR         - QR code generation                                       ║
 * ║    #NOTE       - Note editing                                             ║
 * ║    #FIREBASE   - Firebase realtime sync                                   ║
 * ║    #UTILS      - Utility functions                                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ============================================================================
// #region GLOBAL - Global Variables and Constants
// ============================================================================

// Data storage
let displayedData = [];
let availableTags = [];

// Current order for modals
let currentEditOrderId = null;
let currentEditOrderCode = null;
let selectedTags = [];

// Refresh system
const REFRESH_INTERVALS = [3000, 5000, 10000, 15000, 30000, 60000];
const REFRESH_STORAGE_KEY = 'quickViewRefreshInterval';
let currentRefreshInterval = 5000;
let refreshTimer = null;
let isModalOpen = false;
let activeModal = null;

// Firebase
let database = null;
let currentUserIdentifier = null;

// Bank configuration for QR
const QR_BANK_CONFIG = {
    bin: '970416',
    name: 'ACB',
    accountNo: '75918',
    accountName: 'LAI THUY YEN NHI'
};

// #endregion

// ============================================================================
// #region INIT - Initialization and Setup
// ============================================================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('[QUICK-VIEW] Initializing...');
    const startTime = performance.now();

    try {
        // 1. Initialize Firebase
        await initFirebase();

        // 2. Initialize managers (wait for them to be ready)
        await waitForManagers();

        // 3. Get current user identifier
        currentUserIdentifier = getCurrentUserIdentifier();
        console.log('[QUICK-VIEW] User:', currentUserIdentifier);

        // 4. Load default refresh interval
        loadDefaultInterval();

        // 5. Load available tags
        await loadAvailableTags();

        // 6. Load orders
        await loadLatest50Orders();

        // 7. Setup Firebase realtime listeners
        setupFirebaseListeners();

        // 8. Start auto-refresh
        startAutoRefresh();

        // 9. Setup keyboard shortcuts
        setupKeyboardShortcuts();

        const loadTime = performance.now() - startTime;
        console.log(`[QUICK-VIEW] Initialized in ${loadTime.toFixed(0)}ms`);

    } catch (error) {
        console.error('[QUICK-VIEW] Initialization error:', error);
        showToast('Lỗi khởi tạo: ' + error.message, 'error');
    }
});

async function initFirebase() {
    const firebaseConfig = {
        apiKey: "AIzaSyD1P5tSSPk1fB8OyHM25B6CsP0IR-GaA6g",
        authDomain: "duahau-warehouse.firebaseapp.com",
        databaseURL: "https://duahau-warehouse-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "duahau-warehouse",
        storageBucket: "duahau-warehouse.firebasestorage.app",
        messagingSenderId: "594495920771",
        appId: "1:594495920771:web:f445abb6e57f19d4dee168"
    };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    database = firebase.database();
    console.log('[QUICK-VIEW] Firebase initialized');
}

async function waitForManagers() {
    const maxWait = 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
        if (window.tokenManager && window.API_CONFIG) {
            console.log('[QUICK-VIEW] Managers ready');
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error('Managers not available after 5s');
}

function getCurrentUserIdentifier() {
    try {
        if (window.authManager) {
            const auth = window.authManager.getAuthState();
            if (auth && auth.displayName) {
                return auth.displayName;
            }
        }
        if (window.tokenManager) {
            const tokenData = window.tokenManager.getTokenData();
            if (tokenData && tokenData.DisplayName) {
                return tokenData.DisplayName;
            }
        }
    } catch (e) {
        console.warn('[QUICK-VIEW] Could not get user identifier:', e);
    }
    return 'Unknown';
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // F5 - Manual refresh
        if (e.key === 'F5') {
            e.preventDefault();
            manualRefresh();
        }
        // Escape - Close modals
        if (e.key === 'Escape') {
            closeAllModals();
        }
        // Ctrl+Enter - Save tag modal
        if (e.ctrlKey && e.key === 'Enter' && activeModal === 'tag') {
            saveOrderTags();
        }
    });
}

// #endregion

// ============================================================================
// #region FETCH - Data Fetching
// ============================================================================

// Columns needed for Quick View - extract from response on client side
const QUICK_VIEW_COLUMNS = ['Id', 'Code', 'Name', 'PartnerName', 'Telephone', 'Tags', 'Note', 'Address', 'Street', 'Ward', 'District', 'City', 'Revenue', 'AmountDepot', 'AmountTotal', 'DateCreated', 'CRMTeamId', 'Facebook_UserId'];

function extractColumns(orders) {
    return orders.map(order => {
        const extracted = {};
        QUICK_VIEW_COLUMNS.forEach(col => {
            if (order.hasOwnProperty(col)) {
                extracted[col] = order[col];
            }
        });
        return extracted;
    });
}

function buildDateFilter() {
    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const toDate = now.toISOString();
    const fromDate = oneMonthAgo.toISOString();

    return `(DateCreated ge ${fromDate} and DateCreated le ${toDate})`;
}

async function loadLatest50Orders() {
    console.log('[QUICK-VIEW] Loading 50 latest orders...');
    showLoading(true);
    const startTime = performance.now();

    try {
        const headers = await window.tokenManager.getAuthHeader();
        const dateFilter = buildDateFilter();

        // Use same endpoint as Tab 1: /ODataService.GetView (without $select - filter columns on client)
        const apiUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order/ODataService.GetView?' +
            '$top=50&' +
            '$skip=0&' +
            '$orderby=DateCreated desc&' +
            '$filter=' + encodeURIComponent(dateFilter) + '&' +
            '$count=true';

        const response = await API_CONFIG.smartFetch(apiUrl, {
            headers: {
                ...headers,
                'accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        // Extract only needed columns on client side
        displayedData = extractColumns(data.value || []);

        // Add SessionIndex
        displayedData.forEach((order, index) => {
            order.SessionIndex = index + 1;
        });

        renderTable();
        updateOrderCount();

        const loadTime = performance.now() - startTime;
        console.log(`[QUICK-VIEW] Loaded ${displayedData.length} orders in ${loadTime.toFixed(0)}ms`);

    } catch (error) {
        console.error('[QUICK-VIEW] Load error:', error);
        showToast('Lỗi tải dữ liệu: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function loadAvailableTags() {
    try {
        const headers = await window.tokenManager.getAuthHeader();
        const response = await API_CONFIG.smartFetch(
            'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag?$orderby=Name',
            { headers }
        );

        if (response.ok) {
            const data = await response.json();
            availableTags = data.value || [];
            console.log('[QUICK-VIEW] Loaded', availableTags.length, 'tags');
        }
    } catch (error) {
        console.error('[QUICK-VIEW] Load tags error:', error);
    }
}

// #endregion

// ============================================================================
// #region RENDER - Table Rendering
// ============================================================================

function renderTable() {
    const tbody = document.getElementById('tableBody');

    if (displayedData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="13" class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Không có đơn hàng nào</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = displayedData.map(order => renderOrderRow(order)).join('');
}

function renderOrderRow(order) {
    const orderId = order.Id;
    const orderCode = order.Code || '';
    const name = order.Name || order.PartnerName || 'N/A';
    const phone = order.Telephone || '';
    const note = order.Note || '';
    const revenue = order.Revenue || order.AmountTotal || 0;
    const paid = order.AmountDepot || 0;
    const debt = revenue - paid;
    const address = buildAddress(order);
    const dateCreated = order.DateCreated;
    const channelId = order.CRMTeamId || '';
    const psid = order.Facebook_UserId || '';

    // Tags
    const tagsHtml = renderTagsHtml(order.Tags, orderId, orderCode);

    // Debt display
    const debtClass = debt > 0 ? 'debt-warning' : 'debt-ok';
    const debtText = debt > 0 ? formatCurrency(debt) : 'Đủ';

    // Date display
    const dateDisplay = formatRelativeTime(dateCreated);

    return `
        <tr data-order-id="${orderId}">
            <td class="cell-stt">${order.SessionIndex}</td>
            <td class="cell-name" data-column="name">
                <a href="javascript:void(0)" onclick="openChat('${orderId}', '${channelId}', '${psid}')">${escapeHtml(name)}</a>
            </td>
            <td class="cell-phone" data-column="phone">
                ${escapeHtml(phone)}
                ${phone ? `<button class="btn-copy-phone" onclick="copyPhone('${phone}')" title="Copy"><i class="fas fa-copy"></i></button>` : ''}
            </td>
            <td class="cell-tag" data-column="tag">
                <div class="tag-buttons">
                    <button class="tag-icon-btn" onclick="openTagModal('${orderId}', '${orderCode}')" title="Quản lý tag">
                        <i class="fas fa-tags"></i>
                    </button>
                    <button class="quick-tag-btn" onclick="quickAssignTag('${orderId}', '${orderCode}', 'xử lý')" title="Xử lý + định danh">
                        <i class="fas fa-clock"></i>
                    </button>
                    <button class="quick-tag-btn quick-tag-ok" onclick="quickAssignTag('${orderId}', '${orderCode}', 'ok')" title="OK + định danh">
                        <i class="fas fa-check"></i>
                    </button>
                </div>
                <div class="tag-list">${tagsHtml}</div>
            </td>
            <td class="cell-note" data-column="note">
                <div class="note-content">
                    <span class="note-text" title="${escapeHtml(note)}">${escapeHtml(note) || '-'}</span>
                    <button class="btn-edit-note" onclick="openNoteModal('${orderId}')" title="Sửa ghi chú">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </td>
            <td class="cell-debt ${debtClass}" data-column="debt">${debtText}</td>
            <td class="cell-address" data-column="address" title="${escapeHtml(address)}">${escapeHtml(address) || '-'}</td>
            <td class="cell-action">
                <button class="btn-action btn-qr" onclick="showQRModal('${phone}', ${debt})" title="QR Code">
                    <i class="fas fa-qrcode"></i>
                </button>
            </td>
            <td class="cell-action">
                <button class="btn-action btn-chat" onclick="openChat('${orderId}', '${channelId}', '${psid}')" title="Chat">
                    <i class="fas fa-comment"></i>
                </button>
                <button class="btn-action btn-comment" onclick="openComment('${orderId}', '${channelId}', '${psid}')" title="Comments">
                    <i class="fas fa-comments"></i>
                </button>
            </td>
            <td class="cell-action">
                <button class="btn-action btn-edit" onclick="editOrder('${orderId}')" title="Sửa đơn">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
            <td class="cell-money" data-column="revenue">${formatCurrency(revenue)}</td>
            <td class="cell-money" data-column="paid">${formatCurrency(paid)}</td>
            <td class="cell-date" data-column="date">${dateDisplay}</td>
        </tr>
    `;
}

function renderTagsHtml(tagsJson, orderId, orderCode) {
    if (!tagsJson) return '';

    try {
        const tags = typeof tagsJson === 'string' ? JSON.parse(tagsJson) : tagsJson;
        if (!Array.isArray(tags) || tags.length === 0) return '';

        return tags.map(tag => {
            const color = tag.Color || '#6b7280';
            const name = tag.Name || 'Unknown';
            return `<span class="tag-badge" style="background-color: ${color};">${escapeHtml(name)}</span>`;
        }).join('');

    } catch (e) {
        console.warn('[QUICK-VIEW] Parse tags error:', e);
        return '';
    }
}

function updateOrderCount() {
    const countEl = document.getElementById('orderCount');
    countEl.textContent = `${displayedData.length} orders`;
}

function buildAddress(order) {
    const parts = [
        order.Address || order.Street,
        order.Ward,
        order.District,
        order.City
    ].filter(Boolean);
    return parts.join(', ');
}

// #endregion

// ============================================================================
// #region REFRESH - Auto-refresh System
// ============================================================================

function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(smartRefresh, currentRefreshInterval);
    console.log(`[QUICK-VIEW] Auto-refresh started: ${currentRefreshInterval}ms`);
}

function stopAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

async function smartRefresh() {
    if (isModalOpen) {
        console.log('[QUICK-VIEW] Modal open, skipping refresh');
        return;
    }

    console.log('[QUICK-VIEW] Smart refresh...');
    const previousScrollTop = document.getElementById('tableContainer').scrollTop;

    try {
        const headers = await window.tokenManager.getAuthHeader();
        const dateFilter = buildDateFilter();

        // Use same endpoint as Tab 1: /ODataService.GetView (without $select - filter columns on client)
        const apiUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order/ODataService.GetView?' +
            '$top=50&' +
            '$skip=0&' +
            '$orderby=DateCreated desc&' +
            '$filter=' + encodeURIComponent(dateFilter) + '&' +
            '$count=true';

        const response = await API_CONFIG.smartFetch(apiUrl, {
            headers: {
                ...headers,
                'accept': 'application/json'
            }
        });

        if (!response.ok) return;

        const data = await response.json();
        // Extract only needed columns on client side
        const newData = extractColumns(data.value || []);

        // Add SessionIndex
        newData.forEach((order, index) => {
            order.SessionIndex = index + 1;
        });

        // Check for changes and update
        let hasChanges = false;
        newData.forEach((newOrder, index) => {
            const oldOrder = displayedData.find(o => o.Id === newOrder.Id);
            if (!oldOrder || hasOrderChanged(oldOrder, newOrder)) {
                hasChanges = true;
            }
        });

        if (hasChanges || newData.length !== displayedData.length) {
            displayedData = newData;
            renderTable();
            updateOrderCount();
        }

        // Restore scroll position
        document.getElementById('tableContainer').scrollTop = previousScrollTop;

        // Update last refresh time
        updateLastRefreshTime();

    } catch (error) {
        console.error('[QUICK-VIEW] Refresh error:', error);
    }
}

function hasOrderChanged(oldOrder, newOrder) {
    return oldOrder.Tags !== newOrder.Tags ||
           oldOrder.Note !== newOrder.Note ||
           oldOrder.Revenue !== newOrder.Revenue ||
           oldOrder.AmountDepot !== newOrder.AmountDepot;
}

function manualRefresh() {
    console.log('[QUICK-VIEW] Manual refresh');
    loadLatest50Orders();
    updateLastRefreshTime();
}

function updateRefreshInterval(value) {
    currentRefreshInterval = parseInt(value, 10);
    startAutoRefresh();
    console.log(`[QUICK-VIEW] Refresh interval changed to ${currentRefreshInterval}ms`);
}

function saveDefaultInterval() {
    localStorage.setItem(REFRESH_STORAGE_KEY, currentRefreshInterval.toString());
    showToast('Đã lưu mặc định', 'success');
}

function loadDefaultInterval() {
    const saved = localStorage.getItem(REFRESH_STORAGE_KEY);
    if (saved) {
        currentRefreshInterval = parseInt(saved, 10);
        document.getElementById('refreshIntervalSelect').value = saved;
    }
}

function updateLastRefreshTime() {
    const el = document.getElementById('lastRefreshTime');
    el.textContent = 'Vừa xong';
}

// #endregion

// ============================================================================
// #region TAG - Tag Management
// ============================================================================

function openTagModal(orderId, orderCode) {
    currentEditOrderId = orderId;
    currentEditOrderCode = orderCode;

    // Find order and get current tags
    const order = displayedData.find(o => o.Id === orderId);
    if (!order) {
        showToast('Không tìm thấy đơn hàng', 'error');
        return;
    }

    // Parse current tags
    try {
        const currentTags = order.Tags ? JSON.parse(order.Tags) : [];
        selectedTags = Array.isArray(currentTags) ? [...currentTags] : [];
    } catch (e) {
        selectedTags = [];
    }

    // Render modal
    renderSelectedTagsPills();
    renderTagList();

    // Show modal
    document.getElementById('tagModal').classList.add('show');
    document.getElementById('tagSearchInput').value = '';
    document.getElementById('tagSearchInput').focus();

    setModalOpen('tag');
}

function closeTagModal() {
    document.getElementById('tagModal').classList.remove('show');
    currentEditOrderId = null;
    currentEditOrderCode = null;
    selectedTags = [];
    setModalClosed();
}

function renderSelectedTagsPills() {
    const container = document.getElementById('selectedTagsPills');
    container.innerHTML = selectedTags.map(tag => {
        const color = tag.Color || '#6b7280';
        return `
            <span class="selected-tag-pill" style="background-color: ${color};">
                ${escapeHtml(tag.Name)}
                <button onclick="removeSelectedTag('${tag.Id}')">&times;</button>
            </span>
        `;
    }).join('');
}

function renderTagList() {
    const container = document.getElementById('tagList');
    const searchValue = (document.getElementById('tagSearchInput')?.value || '').toLowerCase();

    if (availableTags.length === 0) {
        container.innerHTML = `
            <div class="no-tags-message">
                <i class="fas fa-tags"></i>
                <p>Chưa có tag nào. Tạo tag mới!</p>
            </div>
        `;
        return;
    }

    const selectedIds = new Set(selectedTags.map(t => t.Id));

    container.innerHTML = availableTags.map(tag => {
        const isSelected = selectedIds.has(tag.Id);
        const matchesSearch = !searchValue || tag.Name.toLowerCase().includes(searchValue);
        const hiddenClass = matchesSearch ? '' : 'hidden';
        const selectedClass = isSelected ? 'selected' : '';
        // Encode tag name for safe use in onclick (handles quotes and special chars)
        const encodedName = encodeURIComponent(tag.Name);

        return `
            <div class="tag-option ${selectedClass} ${hiddenClass}" onclick="toggleTagEncoded('${tag.Id}', '${encodedName}', '${tag.Color || '#6b7280'}')">
                <span class="tag-color-dot" style="background-color: ${tag.Color || '#6b7280'};"></span>
                <span class="tag-option-name">${escapeHtml(tag.Name)}</span>
                ${isSelected ? '<i class="fas fa-check" style="color: #10b981;"></i>' : ''}
            </div>
        `;
    }).join('');
}

function toggleTag(tagId, tagName, tagColor) {
    const index = selectedTags.findIndex(t => t.Id === tagId || t.Id === parseInt(tagId));

    if (index > -1) {
        selectedTags.splice(index, 1);
    } else {
        selectedTags.push({
            Id: parseInt(tagId),
            Name: tagName,
            Color: tagColor
        });
    }

    renderSelectedTagsPills();
    renderTagList();
}

// Wrapper function that decodes encoded tag name
function toggleTagEncoded(tagId, encodedName, tagColor) {
    const tagName = decodeURIComponent(encodedName);
    toggleTag(tagId, tagName, tagColor);
}

function removeSelectedTag(tagId) {
    selectedTags = selectedTags.filter(t => t.Id !== tagId && t.Id !== parseInt(tagId));
    renderSelectedTagsPills();
    renderTagList();
}

function filterTags() {
    renderTagList();
}

function handleTagInputKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        // Find first visible tag and select it
        const firstVisible = document.querySelector('.tag-option:not(.hidden):not(.selected)');
        if (firstVisible) {
            firstVisible.click();
        }
    } else if (event.key === 'Escape') {
        closeTagModal();
    }
}

async function saveOrderTags() {
    if (!currentEditOrderId) return;

    const orderId = currentEditOrderId;
    const orderCode = currentEditOrderCode;

    try {
        const headers = await window.tokenManager.getAuthHeader();

        // Format tags for API
        const tagsForApi = selectedTags.map(t => ({
            Id: parseInt(t.Id),
            Name: t.Name,
            Color: t.Color
        }));

        const response = await API_CONFIG.smartFetch(
            'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag',
            {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    Tags: tagsForApi,
                    OrderId: orderId
                })
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        // Update local data
        updateTagCellOnly(orderId, orderCode, tagsForApi);

        // Emit to Firebase
        emitTagUpdate(orderId, orderCode, tagsForApi);

        showToast('Đã lưu tag', 'success');
        closeTagModal();

    } catch (error) {
        console.error('[QUICK-VIEW] Save tags error:', error);
        showToast('Lỗi lưu tag: ' + error.message, 'error');
    }
}

async function quickAssignTag(orderId, orderCode, tagType) {
    // Find the tag
    const tagName = tagType === 'ok' ? 'OK' : 'XỬ LÝ';
    const tag = availableTags.find(t => t.Name.toUpperCase() === tagName);

    if (!tag) {
        showToast(`Không tìm thấy tag "${tagName}"`, 'warning');
        return;
    }

    // Get current tags
    const order = displayedData.find(o => o.Id === orderId);
    if (!order) return;

    let currentTags = [];
    try {
        currentTags = order.Tags ? JSON.parse(order.Tags) : [];
    } catch (e) {
        currentTags = [];
    }

    // Check if already has this tag
    if (currentTags.some(t => t.Id === tag.Id)) {
        showToast('Đã có tag này', 'info');
        return;
    }

    // Add user identifier tag
    const userTag = availableTags.find(t => t.Name === currentUserIdentifier);

    // Build new tags array
    const newTags = [...currentTags, { Id: tag.Id, Name: tag.Name, Color: tag.Color }];
    if (userTag && !currentTags.some(t => t.Id === userTag.Id)) {
        newTags.push({ Id: userTag.Id, Name: userTag.Name, Color: userTag.Color });
    }

    try {
        const headers = await window.tokenManager.getAuthHeader();

        const response = await API_CONFIG.smartFetch(
            'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag',
            {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    Tags: newTags,
                    OrderId: orderId
                })
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        updateTagCellOnly(orderId, orderCode, newTags);
        emitTagUpdate(orderId, orderCode, newTags);
        showToast(`Đã gán tag ${tagName}`, 'success');

    } catch (error) {
        console.error('[QUICK-VIEW] Quick assign error:', error);
        showToast('Lỗi gán tag: ' + error.message, 'error');
    }
}

function updateTagCellOnly(orderId, orderCode, tags) {
    // Update data array
    const order = displayedData.find(o => o.Id === orderId);
    if (order) {
        order.Tags = JSON.stringify(tags);
    }

    // Update DOM
    const row = document.querySelector(`tr[data-order-id="${orderId}"]`);
    if (!row) return;

    const tagCell = row.querySelector('td[data-column="tag"]');
    if (!tagCell) return;

    const tagsHtml = renderTagsHtml(JSON.stringify(tags), orderId, orderCode);

    tagCell.innerHTML = `
        <div class="tag-buttons">
            <button class="tag-icon-btn" onclick="openTagModal('${orderId}', '${orderCode}')" title="Quản lý tag">
                <i class="fas fa-tags"></i>
            </button>
            <button class="quick-tag-btn" onclick="quickAssignTag('${orderId}', '${orderCode}', 'xử lý')" title="Xử lý + định danh">
                <i class="fas fa-clock"></i>
            </button>
            <button class="quick-tag-btn quick-tag-ok" onclick="quickAssignTag('${orderId}', '${orderCode}', 'ok')" title="OK + định danh">
                <i class="fas fa-check"></i>
            </button>
        </div>
        <div class="tag-list">${tagsHtml}</div>
    `;
}

// Create Tag Modal
function openCreateTagModal() {
    document.getElementById('createTagModal').style.display = 'flex';
    document.getElementById('newTagName').value = '';
    document.getElementById('newTagName').focus();
}

function closeCreateTagModal() {
    document.getElementById('createTagModal').style.display = 'none';
}

function updateColorPreview() {
    const hex = document.getElementById('newTagColorHex').value;
    document.getElementById('newTagColor').value = hex;
}

// Sync from color picker to hex input
function syncColorFromPicker() {
    const color = document.getElementById('newTagColor').value;
    document.getElementById('newTagColorHex').value = color;
}

async function createNewTag() {
    const name = document.getElementById('newTagName').value.trim().toUpperCase();
    const color = document.getElementById('newTagColor').value || '#3b82f6';

    if (!name) {
        showToast('Vui lòng nhập tên tag', 'warning');
        return;
    }

    try {
        const headers = await window.tokenManager.getAuthHeader();

        const response = await API_CONFIG.smartFetch(
            'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag',
            {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ Name: name, Color: color })
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const newTag = await response.json();
        availableTags.push(newTag);
        renderTagList();

        showToast(`Đã tạo tag "${name}"`, 'success');
        closeCreateTagModal();

    } catch (error) {
        console.error('[QUICK-VIEW] Create tag error:', error);
        showToast('Lỗi tạo tag: ' + error.message, 'error');
    }
}

async function refreshTags() {
    await loadAvailableTags();
    renderTagList();
    showToast('Đã tải lại tags', 'success');
}

// #endregion

// ============================================================================
// #region QR - QR Code Generation
// ============================================================================

function showQRModal(phone, amount = 0) {
    if (!phone) {
        showToast('Không có số điện thoại', 'warning');
        return;
    }

    const normalizedPhone = normalizePhoneForQR(phone);
    const uniqueCode = getOrCreateQRForPhone(normalizedPhone);

    if (!uniqueCode) {
        showToast('Không thể tạo mã QR', 'error');
        return;
    }

    const qrUrl = generateVietQRUrl(uniqueCode, amount);
    const modal = document.getElementById('orderQRModal');
    const modalBody = document.getElementById('orderQRModalBody');

    const amountText = amount > 0 ? `<strong>Số tiền:</strong> <span style="color: #059669; font-weight: 700;">${formatCurrency(amount)}</span><br>` : '';

    modalBody.innerHTML = `
        <img src="${qrUrl}" alt="QR Code" style="width: 280px; max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">

        <div style="margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; text-align: left; font-size: 13px;">
            <div style="margin-bottom: 8px;">
                <strong>Ngân hàng:</strong> ${QR_BANK_CONFIG.name}<br>
                <strong>Số TK:</strong> ${QR_BANK_CONFIG.accountNo}<br>
                <strong>Chủ TK:</strong> ${QR_BANK_CONFIG.accountName}<br>
                ${amountText}
            </div>
            <div style="padding: 8px; background: white; border: 2px dashed #dee2e6; border-radius: 6px; font-family: monospace; font-size: 13px; font-weight: bold; color: #495057; text-align: center;">
                ${uniqueCode}
            </div>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <button onclick="copyQRCode('${uniqueCode}')" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">
                <i class="fas fa-copy"></i> Copy mã
            </button>
        </div>

        <div style="margin-top: 12px; padding: 10px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; font-size: 12px; color: #92400e; text-align: left;">
            <strong>Lưu ý:</strong> Khách hàng cần nhập đúng mã <strong>${uniqueCode}</strong> khi chuyển khoản.
        </div>
    `;

    modal.style.display = 'flex';
    setModalOpen('qr');
}

function closeOrderQRModal() {
    document.getElementById('orderQRModal').style.display = 'none';
    setModalClosed();
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

function normalizePhoneForQR(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('84')) {
        cleaned = '0' + cleaned.substring(2);
    }
    return cleaned;
}

function getOrCreateQRForPhone(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return null;

    // Use same cache format as Tab 1 for consistency
    const QR_CACHE_KEY = 'n2store_qr_codes_v2';
    let cache = {};
    try {
        cache = JSON.parse(localStorage.getItem(QR_CACHE_KEY) || '{}');
    } catch (e) {
        cache = {};
    }

    // Check cache first
    if (cache[normalizedPhone]?.uniqueCode) {
        return cache[normalizedPhone].uniqueCode;
    }

    // Generate new code with same format as Tab 1
    const timestamp = Date.now().toString(36).toUpperCase().slice(-8);
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const sequence = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
    const uniqueCode = `N2${timestamp}${random}${sequence}`;

    // Save to cache
    cache[normalizedPhone] = {
        uniqueCode: uniqueCode,
        createdAt: new Date().toISOString(),
        synced: false
    };
    localStorage.setItem(QR_CACHE_KEY, JSON.stringify(cache));

    console.log(`[QUICK-VIEW] Created QR for ${normalizedPhone}: ${uniqueCode}`);
    return uniqueCode;
}

async function copyQRCode(code) {
    try {
        await navigator.clipboard.writeText(code);
        showToast('Đã copy mã QR', 'success');
    } catch (error) {
        showToast('Không thể copy', 'error');
    }
}

// #endregion

// ============================================================================
// #region NOTE - Note Editing
// ============================================================================

function openNoteModal(orderId) {
    currentEditOrderId = orderId;

    const order = displayedData.find(o => o.Id === orderId);
    if (!order) return;

    document.getElementById('noteEditInput').value = order.Note || '';
    document.getElementById('noteEditModal').style.display = 'flex';
    document.getElementById('noteEditInput').focus();

    setModalOpen('note');
}

function closeNoteModal() {
    document.getElementById('noteEditModal').style.display = 'none';
    currentEditOrderId = null;
    setModalClosed();
}

async function saveNote() {
    if (!currentEditOrderId) return;

    const orderId = currentEditOrderId;
    const newNote = document.getElementById('noteEditInput').value.trim();

    try {
        const headers = await window.tokenManager.getAuthHeader();

        const response = await API_CONFIG.smartFetch(
            `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})`,
            {
                method: 'PATCH',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ Note: newNote })
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        // Update local data and DOM
        const order = displayedData.find(o => o.Id === orderId);
        if (order) {
            order.Note = newNote;
        }

        const row = document.querySelector(`tr[data-order-id="${orderId}"]`);
        if (row) {
            const noteCell = row.querySelector('td[data-column="note"]');
            if (noteCell) {
                noteCell.innerHTML = `
                    <div class="note-content">
                        <span class="note-text" title="${escapeHtml(newNote)}">${escapeHtml(newNote) || '-'}</span>
                        <button class="btn-edit-note" onclick="openNoteModal('${orderId}')" title="Sửa ghi chú">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                `;
            }
        }

        showToast('Đã lưu ghi chú', 'success');
        closeNoteModal();

    } catch (error) {
        console.error('[QUICK-VIEW] Save note error:', error);
        showToast('Lỗi lưu ghi chú: ' + error.message, 'error');
    }
}

// #endregion

// ============================================================================
// #region FIREBASE - Firebase Realtime Sync
// ============================================================================

function setupFirebaseListeners() {
    if (!database) {
        console.warn('[QUICK-VIEW] Firebase not available');
        return;
    }

    // Listen for tag updates
    database.ref('tag_updates')
        .orderByChild('timestamp')
        .startAt(Date.now())
        .on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            // Skip if from current user
            if (data.updatedBy === currentUserIdentifier) return;

            // Check if order is in our list
            const order = displayedData.find(o => o.Id === data.orderId);
            if (order) {
                console.log('[QUICK-VIEW] Tag update from:', data.updatedBy);
                updateTagCellOnly(data.orderId, data.orderCode, data.tags);
            }
        });

    console.log('[QUICK-VIEW] Firebase listeners setup');
}

function emitTagUpdate(orderId, orderCode, tags) {
    if (!database) return;

    const update = {
        orderId: orderId,
        orderCode: orderCode,
        tags: tags,
        updatedBy: currentUserIdentifier,
        timestamp: Date.now()
    };

    database.ref('tag_updates').push(update)
        .then(() => console.log('[QUICK-VIEW] Tag update emitted'))
        .catch(err => console.error('[QUICK-VIEW] Emit error:', err));
}

// #endregion

// ============================================================================
// #region CROSS-TAB COMMUNICATION
// ============================================================================

function openChat(orderId, channelId, psid) {
    // Send message to parent (main.html) to open chat in Tab 1
    window.parent.postMessage({
        type: 'OPEN_CHAT_IN_TAB1',
        orderId: orderId,
        channelId: channelId,
        psid: psid
    }, '*');
}

function openComment(orderId, channelId, psid) {
    // Send message to parent to open comments in Tab 1
    window.parent.postMessage({
        type: 'OPEN_COMMENTS_IN_TAB1',
        orderId: orderId,
        channelId: channelId,
        psid: psid
    }, '*');
}

function editOrder(orderId) {
    // Send message to parent to open edit modal in Tab 1
    window.parent.postMessage({
        type: 'OPEN_EDIT_IN_TAB1',
        orderId: orderId
    }, '*');
}

// #endregion

// ============================================================================
// #region UTILS - Utility Functions
// ============================================================================

function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${getToastIcon(type)}"></i> ${escapeHtml(message)}`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function getToastIcon(type) {
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    return icons[type] || 'info-circle';
}

function formatCurrency(amount) {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

function formatRelativeTime(dateString) {
    if (!dateString) return '-';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút`;
    if (diffHours < 24) return `${diffHours} giờ`;
    if (diffDays < 7) return `${diffDays} ngày`;

    return date.toLocaleDateString('vi-VN');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function copyPhone(phone) {
    navigator.clipboard.writeText(phone)
        .then(() => showToast('Đã copy SĐT', 'success'))
        .catch(() => showToast('Không thể copy', 'error'));
}

function setModalOpen(modalName) {
    activeModal = modalName;
    isModalOpen = true;
}

function setModalClosed() {
    activeModal = null;
    isModalOpen = false;
}

function closeAllModals() {
    closeTagModal();
    closeCreateTagModal();
    closeOrderQRModal();
    closeNoteModal();
}

// #endregion

// ============================================================================
// #region WINDOW EXPORTS
// ============================================================================

// Export functions for HTML onclick handlers
window.manualRefresh = manualRefresh;
window.updateRefreshInterval = updateRefreshInterval;
window.saveDefaultInterval = saveDefaultInterval;
window.openTagModal = openTagModal;
window.closeTagModal = closeTagModal;
window.saveOrderTags = saveOrderTags;
window.quickAssignTag = quickAssignTag;
window.toggleTag = toggleTag;
window.toggleTagEncoded = toggleTagEncoded;
window.removeSelectedTag = removeSelectedTag;
window.filterTags = filterTags;
window.handleTagInputKeydown = handleTagInputKeydown;
window.openCreateTagModal = openCreateTagModal;
window.closeCreateTagModal = closeCreateTagModal;
window.createNewTag = createNewTag;
window.updateColorPreview = updateColorPreview;
window.syncColorFromPicker = syncColorFromPicker;
window.refreshTags = refreshTags;
window.showQRModal = showQRModal;
window.closeOrderQRModal = closeOrderQRModal;
window.copyQRCode = copyQRCode;
window.openNoteModal = openNoteModal;
window.closeNoteModal = closeNoteModal;
window.saveNote = saveNote;
window.openChat = openChat;
window.openComment = openComment;
window.editOrder = editOrder;
window.copyPhone = copyPhone;

// #endregion
