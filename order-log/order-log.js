// =====================================================
// ORDER LOG - MAIN APPLICATION (Phase 2 with Holiday Management)
// =====================================================

// API Configuration
const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : 'https://n2store.onrender.com/api';

// State
let currentDate = new Date();
let orders = [];
let holidays = [];
let isCurrentDateHoliday = false;
let editingOrderId = null;
let currentUserId = null;

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

// Format date
function formatDate(date) {
    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dayName = days[date.getDay()];
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${dayName}, ${day}/${month}/${year}`;
}

// Get date string for API (YYYY-MM-DD)
function getDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Check if a date is a holiday
function checkIsHoliday(dateStr) {
    return holidays.some(h => getDateString(new Date(h.date)) === dateStr);
}

// Toggle holiday UI elements
function toggleHolidayUI(isHoliday) {
    isCurrentDateHoliday = isHoliday;

    const holidayBadge = document.getElementById('holidayBadge');
    const holidayColumns = document.querySelectorAll('.holiday-column');
    const holidayFields = document.querySelectorAll('.holiday-field');

    if (isHoliday) {
        document.body.classList.add('is-holiday');
        holidayBadge.style.display = 'inline-block';
        holidayColumns.forEach(col => col.style.display = 'table-cell');
        holidayFields.forEach(field => field.style.display = 'block');
    } else {
        document.body.classList.remove('is-holiday');
        holidayBadge.style.display = 'none';
        holidayColumns.forEach(col => col.style.display = 'none');
        holidayFields.forEach(field => field.style.display = 'none');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('[ORDER-LOG] Initializing...');

    // Get user ID from authManager
    if (window.authManager && window.authManager.isAuthenticated()) {
        const userInfo = window.authManager.getUserInfo();
        currentUserId = userInfo.userType || userInfo.username || 'authenticated-user';
        console.log('[ORDER-LOG] User authenticated:', currentUserId);
    } else {
        console.warn('[ORDER-LOG] User not authenticated, using anonymous');
        currentUserId = 'anonymous';
    }

    initializeApp();
});

function initializeApp() {
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Set initial date
    updateDateDisplay();

    // Load holidays first, then orders
    loadHolidays().then(() => {
        loadOrders();
    });

    // Event listeners
    document.getElementById('prevDayBtn').addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() - 1);
        updateDateDisplay();
        loadOrders();
    });

    document.getElementById('nextDayBtn').addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() + 1);
        updateDateDisplay();
        loadOrders();
    });

    document.getElementById('dateInput').addEventListener('change', (e) => {
        currentDate = new Date(e.target.value + 'T00:00:00');
        updateDateDisplay();
        loadOrders();
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadOrders();
    });

    document.getElementById('addOrderBtn').addEventListener('click', () => {
        openModal();
    });

    document.getElementById('closeModalBtn').addEventListener('click', () => {
        closeModal();
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
        closeModal();
    });

    document.getElementById('orderForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveOrder();
    });

    // Close modal on outside click
    document.getElementById('orderModal').addEventListener('click', (e) => {
        if (e.target.id === 'orderModal') {
            closeModal();
        }
    });

    // Holiday management
    document.getElementById('manageHolidaysBtn').addEventListener('click', () => {
        openHolidayModal();
    });

    document.getElementById('closeHolidayModalBtn').addEventListener('click', () => {
        closeHolidayModal();
    });

    document.getElementById('addHolidayBtn').addEventListener('click', () => {
        addHoliday();
    });

    document.getElementById('holidayModal').addEventListener('click', (e) => {
        if (e.target.id === 'holidayModal') {
            closeHolidayModal();
        }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        // Don't trigger when typing in input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        if (e.key === 'ArrowLeft') {
            currentDate.setDate(currentDate.getDate() - 1);
            updateDateDisplay();
            loadOrders();
        } else if (e.key === 'ArrowRight') {
            currentDate.setDate(currentDate.getDate() + 1);
            updateDateDisplay();
            loadOrders();
        }
    });

    console.log('[ORDER-LOG] Initialized successfully');
}

// Update date display
function updateDateDisplay() {
    const dateLabel = document.getElementById('dateLabel');
    const dateInput = document.getElementById('dateInput');

    dateLabel.textContent = formatDate(currentDate);
    dateInput.value = getDateString(currentDate);
}

// Load holidays from API
async function loadHolidays() {
    try {
        console.log('[ORDER-LOG] Loading holidays...');

        const response = await fetch(`${API_BASE}/holidays`, {
            headers: {
                'X-User-Id': currentUserId
            }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        holidays = data.holidays || [];
        console.log('[ORDER-LOG] Loaded holidays:', holidays.length);

    } catch (error) {
        console.error('[ORDER-LOG] Failed to load holidays:', error);
        holidays = [];
    }
}

// Load orders from API
async function loadOrders() {
    try {
        console.log('[ORDER-LOG] Loading orders for date:', getDateString(currentDate));

        const response = await fetch(`${API_BASE}/order-logs?date=${getDateString(currentDate)}`, {
            headers: {
                'X-User-Id': currentUserId
            }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('[ORDER-LOG] Loaded orders:', data);

        orders = data.orders || [];
        isCurrentDateHoliday = data.isHoliday || false;

        // Toggle UI based on holiday status
        toggleHolidayUI(isCurrentDateHoliday);

        updateStats(data.summary);
        renderOrders();

    } catch (error) {
        console.error('[ORDER-LOG] Failed to load orders:', error);
        showNotification('Không thể tải dữ liệu. Vui lòng thử lại.', 'error');
    }
}

// Update stats cards
function updateStats(summary) {
    if (!summary) return;

    document.getElementById('statTotal').textContent = formatCurrency(summary.totalAmount || 0);
    document.getElementById('statPaid').textContent = formatCurrency(summary.paidAmount || 0);
    document.getElementById('statUnpaid').textContent = formatCurrency(summary.unpaidAmount || 0);

    const difference = summary.totalDifference || 0;
    const diffElem = document.getElementById('statDifference');
    diffElem.textContent = formatCurrency(Math.abs(difference));

    if (difference > 0) {
        diffElem.style.color = '#4caf50';
    } else if (difference < 0) {
        diffElem.style.color = '#f44336';
    } else {
        diffElem.style.color = '#999';
    }
}

// Render orders table
function renderOrders() {
    const tbody = document.getElementById('ordersTableBody');
    const noData = document.getElementById('noData');

    if (orders.length === 0) {
        tbody.innerHTML = '';
        noData.style.display = 'flex';
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        return;
    }

    noData.style.display = 'none';

    tbody.innerHTML = orders.map((order, index) => {
        let row = `<tr>
            <td>${index + 1}</td>
            <td><span class="ncc-badge">${escapeHtml(order.ncc)}</span></td>`;

        // Add "Người thực hiện" column if holiday
        if (isCurrentDateHoliday) {
            row += `<td>${escapeHtml(order.performedBy || '-')}</td>`;
        }

        row += `<td>
                <div class="amount-cell">
                    <input
                        type="checkbox"
                        class="paid-checkbox"
                        ${order.isPaid ? 'checked' : ''}
                        onchange="togglePaid(${order.id}, this.checked)"
                    />
                    <span class="amount-text ${order.isPaid ? 'paid' : ''}">
                        ${formatCurrency(order.amount)}
                    </span>
                </div>
            </td>`;

        // Add "Đối soát" column if holiday
        if (isCurrentDateHoliday) {
            row += `<td>
                <input
                    type="checkbox"
                    class="paid-checkbox"
                    ${order.isReconciled ? 'checked' : ''}
                    onchange="toggleReconciled(${order.id}, this.checked)"
                />
            </td>`;
        }

        row += `<td class="${order.difference > 0 ? 'difference-positive' : order.difference < 0 ? 'difference-negative' : 'difference-zero'}">
                ${order.difference > 0 ? '+' : ''}${formatCurrency(order.difference)}
            </td>
            <td>
                <div class="note-text" title="${escapeHtml(order.note || '')}">
                    ${escapeHtml(order.note || '-')}
                </div>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-icon-small edit" onclick="editOrder(${order.id})" title="Sửa">
                        <i data-lucide="edit-2"></i>
                    </button>
                    <button class="btn-icon-small delete" onclick="deleteOrder(${order.id})" title="Xóa">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </td>
        </tr>`;

        return row;
    }).join('');

    // Re-initialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Toggle paid status
async function togglePaid(orderId, isPaid) {
    try {
        console.log('[ORDER-LOG] Toggling paid status:', orderId, isPaid);

        const response = await fetch(`${API_BASE}/order-logs/${orderId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': currentUserId
            },
            body: JSON.stringify({ isPaid })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('[ORDER-LOG] Updated order:', data);

        // Update local state
        const orderIndex = orders.findIndex(o => o.id === orderId);
        if (orderIndex !== -1) {
            orders[orderIndex].isPaid = isPaid;
        }

        // Reload to update stats
        loadOrders();
        showNotification('Đã cập nhật trạng thái thanh toán', 'success');

    } catch (error) {
        console.error('[ORDER-LOG] Failed to toggle paid:', error);
        showNotification('Không thể cập nhật. Vui lòng thử lại.', 'error');
        // Reload to revert UI
        loadOrders();
    }
}

// Toggle reconciled status
async function toggleReconciled(orderId, isReconciled) {
    try {
        console.log('[ORDER-LOG] Toggling reconciled status:', orderId, isReconciled);

        const response = await fetch(`${API_BASE}/order-logs/${orderId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': currentUserId
            },
            body: JSON.stringify({ isReconciled })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('[ORDER-LOG] Updated order:', data);

        // Update local state
        const orderIndex = orders.findIndex(o => o.id === orderId);
        if (orderIndex !== -1) {
            orders[orderIndex].isReconciled = isReconciled;
        }

        showNotification('Đã cập nhật trạng thái đối soát', 'success');

    } catch (error) {
        console.error('[ORDER-LOG] Failed to toggle reconciled:', error);
        showNotification('Không thể cập nhật. Vui lòng thử lại.', 'error');
        // Reload to revert UI
        loadOrders();
    }
}

// Open modal
function openModal(order = null) {
    const modal = document.getElementById('orderModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('orderForm');

    editingOrderId = order ? order.id : null;

    if (order) {
        modalTitle.textContent = 'Sửa Order';
        document.getElementById('orderId').value = order.id;
        document.getElementById('nccInput').value = order.ncc;
        document.getElementById('performedByInput').value = order.performedBy || '';
        document.getElementById('amountInput').value = order.amount;
        document.getElementById('isPaidCheck').checked = order.isPaid;
        document.getElementById('isReconciledCheck').checked = order.isReconciled || false;
        document.getElementById('differenceInput').value = order.difference;
        document.getElementById('noteInput').value = order.note || '';
    } else {
        modalTitle.textContent = isCurrentDateHoliday ? 'Thêm Order Mới - NGÀY NGHỈ' : 'Thêm Order Mới';
        form.reset();
        document.getElementById('orderId').value = '';
    }

    modal.classList.add('show');

    // Re-initialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Close modal
function closeModal() {
    const modal = document.getElementById('orderModal');
    modal.classList.remove('show');
    editingOrderId = null;
}

// Save order
async function saveOrder() {
    try {
        const ncc = document.getElementById('nccInput').value.trim();
        const amount = parseInt(document.getElementById('amountInput').value);
        const isPaid = document.getElementById('isPaidCheck').checked;
        const difference = parseInt(document.getElementById('differenceInput').value || 0);
        const note = document.getElementById('noteInput').value.trim();

        // Holiday-specific fields
        const performedBy = isCurrentDateHoliday ? document.getElementById('performedByInput').value.trim() : null;
        const isReconciled = isCurrentDateHoliday ? document.getElementById('isReconciledCheck').checked : false;

        if (!ncc || isNaN(amount)) {
            showNotification('Vui lòng điền đầy đủ thông tin', 'error');
            return;
        }

        const orderData = {
            date: getDateString(currentDate),
            ncc,
            amount,
            isPaid,
            difference,
            note,
            performedBy,
            isReconciled
        };

        console.log('[ORDER-LOG] Saving order:', orderData);

        let response;
        if (editingOrderId) {
            // Update existing order
            response = await fetch(`${API_BASE}/order-logs/${editingOrderId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': currentUserId
                },
                body: JSON.stringify(orderData)
            });
        } else {
            // Create new order
            response = await fetch(`${API_BASE}/order-logs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': currentUserId
                },
                body: JSON.stringify(orderData)
            });
        }

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('[ORDER-LOG] Saved order:', data);

        closeModal();
        loadOrders();
        showNotification(editingOrderId ? 'Đã cập nhật order' : 'Đã thêm order mới', 'success');

    } catch (error) {
        console.error('[ORDER-LOG] Failed to save order:', error);
        showNotification('Không thể lưu. Vui lòng thử lại.', 'error');
    }
}

// Edit order
function editOrder(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (order) {
        openModal(order);
    }
}

// Delete order
async function deleteOrder(orderId) {
    if (!confirm('Bạn có chắc chắn muốn xóa order này?')) {
        return;
    }

    try {
        console.log('[ORDER-LOG] Deleting order:', orderId);

        const response = await fetch(`${API_BASE}/order-logs/${orderId}`, {
            method: 'DELETE',
            headers: {
                'X-User-Id': currentUserId
            }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        console.log('[ORDER-LOG] Deleted order:', orderId);

        loadOrders();
        showNotification('Đã xóa order', 'success');

    } catch (error) {
        console.error('[ORDER-LOG] Failed to delete order:', error);
        showNotification('Không thể xóa. Vui lòng thử lại.', 'error');
    }
}

// =====================================================
// HOLIDAY MANAGEMENT
// =====================================================

// Open holiday modal
function openHolidayModal() {
    const modal = document.getElementById('holidayModal');
    modal.classList.add('show');
    renderHolidayList();

    // Re-initialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Close holiday modal
function closeHolidayModal() {
    const modal = document.getElementById('holidayModal');
    modal.classList.remove('show');
}

// Render holiday list
function renderHolidayList() {
    const listContainer = document.getElementById('holidayList');

    if (holidays.length === 0) {
        listContainer.innerHTML = '<p class="loading-text">Chưa có ngày nghỉ nào</p>';
        return;
    }

    listContainer.innerHTML = holidays.map(holiday => {
        const date = new Date(holiday.date);
        const dateStr = formatDate(date);

        return `
            <div class="holiday-item">
                <div>
                    <div class="holiday-item-date">${getDateString(date)}</div>
                    <div class="holiday-item-day">${dateStr}</div>
                </div>
                <button class="holiday-item-delete" onclick="deleteHoliday(${holiday.id})" title="Xóa">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        `;
    }).join('');

    // Re-initialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Add holiday
async function addHoliday() {
    try {
        const dateInput = document.getElementById('holidayDateInput');
        const date = dateInput.value;

        if (!date) {
            showNotification('Vui lòng chọn ngày', 'error');
            return;
        }

        console.log('[ORDER-LOG] Adding holiday:', date);

        const response = await fetch(`${API_BASE}/holidays`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': currentUserId
            },
            body: JSON.stringify({ date })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('[ORDER-LOG] Added holiday:', data);

        // Reload holidays and update UI
        await loadHolidays();
        renderHolidayList();

        // Check if current date is affected
        if (getDateString(currentDate) === date) {
            loadOrders();
        }

        dateInput.value = '';
        showNotification('Đã thêm ngày nghỉ', 'success');

    } catch (error) {
        console.error('[ORDER-LOG] Failed to add holiday:', error);
        showNotification('Không thể thêm ngày nghỉ. Vui lòng thử lại.', 'error');
    }
}

// Delete holiday
async function deleteHoliday(holidayId) {
    if (!confirm('Bạn có chắc chắn muốn xóa ngày nghỉ này?')) {
        return;
    }

    try {
        console.log('[ORDER-LOG] Deleting holiday:', holidayId);

        const response = await fetch(`${API_BASE}/holidays/${holidayId}`, {
            method: 'DELETE',
            headers: {
                'X-User-Id': currentUserId
            }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        console.log('[ORDER-LOG] Deleted holiday:', holidayId);

        // Reload holidays and update UI
        await loadHolidays();
        renderHolidayList();

        // Reload orders if viewing the deleted holiday
        loadOrders();

        showNotification('Đã xóa ngày nghỉ', 'success');

    } catch (error) {
        console.error('[ORDER-LOG] Failed to delete holiday:', error);
        showNotification('Không thể xóa ngày nghỉ. Vui lòng thử lại.', 'error');
    }
}

// Show notification using floating alert from common-utils.js
function showNotification(message, type = 'info') {
    // Use floating alert from common-utils.js (NOT window.showNotification to avoid recursion!)
    if (typeof window.showFloatingAlert === 'function') {
        window.showFloatingAlert(message, type);
    } else {
        // Fallback to alert
        alert(message);
    }
}

// Make functions global for inline event handlers
window.togglePaid = togglePaid;
window.toggleReconciled = toggleReconciled;
window.editOrder = editOrder;
window.deleteOrder = deleteOrder;
window.deleteHoliday = deleteHoliday;

console.log('[ORDER-LOG] Script loaded with Phase 2 holiday management');
