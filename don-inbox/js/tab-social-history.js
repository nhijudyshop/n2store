// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Tab Social Orders - History Module
 *
 * Lưu lịch sử toàn bộ thao tác trên trang Đơn Inbox.
 * Primary: Server PostgreSQL (bảng social_orders_history) — dữ liệu bền vững
 * Fallback: IndexedDB local — khi offline hoặc API lỗi
 * Dù đơn hàng bị xóa/sửa/mất, lịch sử vẫn còn nguyên.
 */

const InboxHistory = (() => {
    // ===== API =====
    const API_BASE = (window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/social-orders/history';

    async function _apiPost(data) {
        try {
            const resp = await fetch(API_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!resp.ok) throw new Error(`API ${resp.status}`);
            return true;
        } catch (e) {
            console.warn('[InboxHistory] API POST failed:', e.message);
            return false;
        }
    }

    async function _apiGet(params = {}) {
        try {
            const qs = new URLSearchParams(params).toString();
            const resp = await fetch(`${API_BASE}?${qs}`, {
                headers: { 'Content-Type': 'application/json' }
            });
            if (!resp.ok) throw new Error(`API ${resp.status}`);
            const data = await resp.json();
            return data.success ? data : null;
        } catch (e) {
            console.warn('[InboxHistory] API GET failed:', e.message);
            return null;
        }
    }

    async function _apiDelete() {
        try {
            const resp = await fetch(API_BASE, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            return resp.ok;
        } catch (e) {
            console.warn('[InboxHistory] API DELETE failed:', e.message);
            return false;
        }
    }

    // ===== IndexedDB Fallback =====
    const DB_NAME = 'inbox_history_db';
    const DB_VERSION = 1;
    const STORE_NAME = 'history';
    let _db = null;

    function _openDB() {
        return new Promise((resolve, reject) => {
            if (_db) return resolve(_db);
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('action', 'action', { unique: false });
                }
            };
            request.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function _idbSave(entry) {
        try {
            const db = await _openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).add(entry);
        } catch (e) { /* ignore */ }
    }

    async function _idbGetAll(options = {}) {
        try {
            const db = await _openDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const index = tx.objectStore(STORE_NAME).index('timestamp');
            return new Promise((resolve) => {
                const entries = [];
                const request = index.openCursor(null, 'prev');
                let count = 0;
                const limit = options.limit || 300;
                request.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor && count < limit) {
                        entries.push(cursor.value);
                        count++;
                        cursor.continue();
                    } else {
                        resolve(entries);
                    }
                };
                request.onerror = () => resolve([]);
            });
        } catch (e) { return []; }
    }

    async function _idbClear() {
        try {
            const db = await _openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).clear();
        } catch (e) { /* ignore */ }
    }

    // ===== Helpers =====
    function _getCurrentUser() {
        try { return window.authManager?.currentUser?.email || 'unknown'; }
        catch { return 'unknown'; }
    }

    function _buildSnapshot(order) {
        if (!order) return null;
        return {
            id: order.id,
            stt: order.stt,
            customerName: order.customerName,
            phone: order.phone,
            address: order.address,
            source: order.source,
            status: order.status,
            tags: (order.tags || []).map(t => ({ id: t.id, name: t.name, color: t.color })),
            totalQuantity: order.totalQuantity,
            totalAmount: order.totalAmount,
            products: (order.products || []).map(p => ({
                name: p.name,
                quantity: p.quantity,
                sellingPrice: p.sellingPrice
            })),
            note: order.note,
            createdAt: order.createdAt
        };
    }

    // ===== Core: Log an action (server + local fallback) =====
    async function log(action, data = {}) {
        const entry = {
            action,
            orderId: data.orderId || null,
            orderStt: data.orderStt || null,
            customerName: data.customerName || null,
            phone: data.phone || null,
            details: data.details || null,
            snapshot: data.snapshot || null,
            userEmail: _getCurrentUser(),
            timestamp: Date.now()
        };

        // Save to server (fire-and-forget)
        _apiPost(entry);

        // Also save to IndexedDB as backup
        _idbSave({ ...entry });
    }

    // ===== Get history (server first, fallback to IndexedDB) =====
    async function getAll(options = {}) {
        const params = { limit: options.limit || 300 };
        if (options.action && options.action !== 'all') params.action = options.action;
        if (options.search) params.search = options.search;
        if (options.offset) params.offset = options.offset;

        const serverData = await _apiGet(params);
        if (serverData && serverData.entries) {
            return { entries: serverData.entries, total: serverData.total, hasMore: serverData.hasMore };
        }

        // Fallback to IndexedDB
        console.log('[InboxHistory] Using IndexedDB fallback');
        const local = await _idbGetAll({ limit: params.limit });
        let filtered = local;
        if (params.action) filtered = filtered.filter(e => e.action === params.action);
        if (params.search) {
            const q = params.search.toLowerCase();
            filtered = filtered.filter(e =>
                (e.customerName && e.customerName.toLowerCase().includes(q)) ||
                (e.phone && e.phone.includes(q)) ||
                (e.orderId && e.orderId.toLowerCase().includes(q)) ||
                (e.details && e.details.toLowerCase().includes(q))
            );
        }
        return { entries: filtered, total: filtered.length, hasMore: false };
    }

    // ===== Clear all =====
    async function clearAll() {
        await _apiDelete();
        await _idbClear();
    }

    // ===== High-level logging functions =====
    function logCreate(order) {
        log('create', {
            orderId: order.id,
            orderStt: order.stt,
            customerName: order.customerName,
            phone: order.phone,
            details: `Tạo đơn mới - KH: ${order.customerName}, SĐT: ${order.phone}${order.products?.length ? ', SP: ' + order.products.map(p => p.name).join(', ') : ''}`,
            snapshot: _buildSnapshot(order)
        });
    }

    function logUpdate(order, changes) {
        const changeDesc = changes || `Cập nhật đơn - KH: ${order.customerName}, SĐT: ${order.phone}`;
        log('update', {
            orderId: order.id,
            orderStt: order.stt,
            customerName: order.customerName,
            phone: order.phone,
            details: changeDesc,
            snapshot: _buildSnapshot(order)
        });
    }

    function logDelete(order) {
        log('delete', {
            orderId: order.id,
            orderStt: order.stt,
            customerName: order.customerName,
            phone: order.phone,
            details: `Xóa đơn #${order.stt || '?'} - KH: ${order.customerName}, SĐT: ${order.phone}${order.products?.length ? ', SP: ' + order.products.map(p => p.name).join(', ') : ''}`,
            snapshot: _buildSnapshot(order)
        });
    }

    function logBulkDelete(orders) {
        const names = orders.map(o => `#${o.stt || '?'} ${o.customerName || 'N/A'}`).join(', ');
        log('bulk_delete', {
            details: `Xóa hàng loạt ${orders.length} đơn: ${names}`,
            snapshot: orders.map(o => _buildSnapshot(o))
        });
    }

    function logTagChange(order, oldTags, newTags) {
        const oldNames = (oldTags || []).map(t => t.name).join(', ') || '(trống)';
        const newNames = (newTags || []).map(t => t.name).join(', ') || '(trống)';
        log('tag_change', {
            orderId: order.id,
            orderStt: order.stt,
            customerName: order.customerName,
            phone: order.phone,
            details: `Tags: [${oldNames}] → [${newNames}]`,
            snapshot: _buildSnapshot(order)
        });
    }

    function logBulkTagChange(orderIds, tags) {
        const tagNames = (tags || []).map(t => t.name).join(', ');
        log('bulk_tag', {
            details: `Gán tags [${tagNames}] cho ${orderIds.length} đơn`
        });
    }

    function logStatusChange(order, oldStatus, newStatus) {
        const oldLabel = window.STATUS_CONFIG?.[oldStatus]?.label || oldStatus;
        const newLabel = window.STATUS_CONFIG?.[newStatus]?.label || newStatus;
        log('status_change', {
            orderId: order.id,
            orderStt: order.stt,
            customerName: order.customerName,
            phone: order.phone,
            details: `Trạng thái: "${oldLabel}" → "${newLabel}"`,
            snapshot: _buildSnapshot(order)
        });
    }

    return { log, getAll, clearAll, logCreate, logUpdate, logDelete, logBulkDelete, logTagChange, logBulkTagChange, logStatusChange };
})();

// ===== HISTORY MODAL UI =====

const HISTORY_ACTION_CONFIG = {
    create:        { icon: 'fa-plus-circle',  color: '#10b981', label: 'Tạo đơn' },
    update:        { icon: 'fa-edit',         color: '#3b82f6', label: 'Cập nhật' },
    delete:        { icon: 'fa-trash-alt',    color: '#ef4444', label: 'Xóa đơn' },
    bulk_delete:   { icon: 'fa-trash',        color: '#dc2626', label: 'Xóa hàng loạt' },
    tag_change:    { icon: 'fa-tags',         color: '#f59e0b', label: 'Đổi tag' },
    bulk_tag:      { icon: 'fa-tags',         color: '#d97706', label: 'Gán tag hàng loạt' },
    status_change: { icon: 'fa-exchange-alt', color: '#8b5cf6', label: 'Đổi trạng thái' }
};

let _historyFilter = 'all';
let _historySearchDebounce = null;

async function openHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (!modal) return;
    modal.classList.add('show');
    _historyFilter = 'all';
    const searchInput = document.getElementById('historySearchInput');
    if (searchInput) searchInput.value = '';

    document.querySelectorAll('.history-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === 'all');
    });

    await _renderHistoryList();
}

function closeHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.remove('show');
}

async function filterHistory(action) {
    _historyFilter = action;
    document.querySelectorAll('.history-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === action);
    });
    await _renderHistoryList();
}

function searchHistoryDebounced() {
    clearTimeout(_historySearchDebounce);
    _historySearchDebounce = setTimeout(() => _renderHistoryList(), 300);
}

async function _renderHistoryList() {
    const container = document.getElementById('historyListContainer');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';

    const searchQuery = document.getElementById('historySearchInput')?.value?.trim() || '';
    const options = { limit: 300 };
    if (_historyFilter !== 'all') options.action = _historyFilter;
    if (searchQuery) options.search = searchQuery;

    const result = await InboxHistory.getAll(options);
    const entries = result.entries || [];

    if (entries.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#9ca3af;">
            <i class="fas fa-history" style="font-size:36px;margin-bottom:12px;display:block;"></i>
            Chưa có lịch sử thao tác
        </div>`;
        _updateHistoryCount(0);
        return;
    }

    _updateHistoryCount(result.total || entries.length);

    // Group by date
    const groups = {};
    entries.forEach(entry => {
        const date = new Date(entry.timestamp);
        const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(entry);
    });

    let html = '';
    for (const [dateKey, items] of Object.entries(groups)) {
        const d = new Date(dateKey + 'T00:00:00');
        const today = new Date();
        let dateLabel;
        if (d.toDateString() === today.toDateString()) {
            dateLabel = 'Hôm nay';
        } else {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            dateLabel = d.toDateString() === yesterday.toDateString()
                ? 'Hôm qua'
                : `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
        }

        html += `<div class="history-date-group">
            <div class="history-date-header">
                <span>${dateLabel}</span>
                <span class="history-date-count">${items.length} thao tác</span>
            </div>`;

        items.forEach(entry => {
            const cfg = HISTORY_ACTION_CONFIG[entry.action] || { icon: 'fa-circle', color: '#6b7280', label: entry.action };
            const time = new Date(entry.timestamp);
            const timeStr = `${time.getHours().toString().padStart(2,'0')}:${time.getMinutes().toString().padStart(2,'0')}:${time.getSeconds().toString().padStart(2,'0')}`;

            html += `<div class="history-entry" onclick="toggleHistoryDetail(this)">
                <div class="history-entry-icon" style="background:${cfg.color}15;color:${cfg.color}">
                    <i class="fas ${cfg.icon}"></i>
                </div>
                <div class="history-entry-content">
                    <div class="history-entry-header">
                        <span class="history-action-label" style="background:${cfg.color}15;color:${cfg.color}">${cfg.label}</span>
                        ${entry.orderStt ? `<span class="history-stt">#${entry.orderStt}</span>` : ''}
                        ${entry.customerName ? `<span class="history-customer">${_escHtml(entry.customerName)}</span>` : ''}
                        ${entry.phone ? `<span class="history-phone">${_escHtml(entry.phone)}</span>` : ''}
                    </div>
                    <div class="history-entry-details">${_escHtml(entry.details || '')}</div>
                    <div class="history-entry-meta">
                        <span><i class="fas fa-clock"></i> ${timeStr}</span>
                        ${entry.userEmail && entry.userEmail !== 'unknown' ? `<span><i class="fas fa-user"></i> ${_escHtml(entry.userEmail)}</span>` : ''}
                    </div>
                </div>
                <div class="history-entry-expand"><i class="fas fa-chevron-down"></i></div>
            </div>
            ${entry.snapshot ? `<div class="history-detail-panel" style="display:none">${_renderSnapshot(entry.snapshot)}</div>` : ''}`;
        });

        html += '</div>';
    }

    container.innerHTML = html;
}

function _updateHistoryCount(total) {
    const el = document.getElementById('historyTotalCount');
    if (el) el.textContent = `${total} bản ghi`;
}

function toggleHistoryDetail(el) {
    const detail = el.nextElementSibling;
    if (detail && detail.classList.contains('history-detail-panel')) {
        const isOpen = detail.style.display !== 'none';
        detail.style.display = isOpen ? 'none' : 'block';
        const chevron = el.querySelector('.history-entry-expand i');
        if (chevron) {
            chevron.className = isOpen ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        }
    }
}

function _renderSnapshot(snapshot) {
    if (!snapshot) return '';

    // Array snapshot (bulk delete)
    if (Array.isArray(snapshot)) {
        return `<div class="history-snapshot">
            <div class="history-snapshot-title"><i class="fas fa-database"></i> Dữ liệu ${snapshot.length} đơn đã xóa:</div>
            <div class="history-snapshot-list">
                ${snapshot.map(s => `<div class="history-snapshot-item">
                    <strong>#${s.stt || '?'}</strong>
                    <span>${_escHtml(s.customerName || 'N/A')}</span>
                    <span>${s.phone || 'N/A'}</span>
                    ${s.products?.length ? `<span class="history-snapshot-products">${s.products.map(p => `${_escHtml(p.name)} x${p.quantity}`).join(', ')}</span>` : ''}
                    ${s.totalAmount ? `<span class="history-snapshot-amount">${Number(s.totalAmount).toLocaleString('vi-VN')}đ</span>` : ''}
                </div>`).join('')}
            </div>
        </div>`;
    }

    // Single snapshot
    const s = snapshot;
    const SOURCE_LABELS = { facebook_post: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', manual: 'Thủ công' };
    const STATUS_LABELS = { draft: 'Nháp', order: 'Đơn hàng', cancelled: 'Đã hủy' };

    return `<div class="history-snapshot">
        <div class="history-snapshot-title"><i class="fas fa-database"></i> Dữ liệu tại thời điểm thao tác:</div>
        <table class="history-snapshot-table">
            <tr><td><i class="fas fa-hashtag"></i> Mã đơn</td><td>${_escHtml(s.id || '')}</td></tr>
            <tr><td><i class="fas fa-sort-numeric-up"></i> STT</td><td>${s.stt || ''}</td></tr>
            <tr><td><i class="fas fa-user"></i> Khách hàng</td><td><strong>${_escHtml(s.customerName || '')}</strong></td></tr>
            <tr><td><i class="fas fa-phone"></i> SĐT</td><td>${s.phone || ''}</td></tr>
            ${s.address ? `<tr><td><i class="fas fa-map-marker-alt"></i> Địa chỉ</td><td>${_escHtml(s.address)}</td></tr>` : ''}
            <tr><td><i class="fas fa-globe"></i> Nguồn</td><td>${SOURCE_LABELS[s.source] || s.source || ''}</td></tr>
            <tr><td><i class="fas fa-flag"></i> Trạng thái</td><td>${STATUS_LABELS[s.status] || s.status || ''}</td></tr>
            ${s.tags?.length ? `<tr><td><i class="fas fa-tags"></i> Tags</td><td>${s.tags.map(t => `<span class="history-tag-pill" style="background:${t.color || '#6b7280'}22;color:${t.color || '#6b7280'};border:1px solid ${t.color || '#6b7280'}44">${_escHtml(t.name)}</span>`).join(' ')}</td></tr>` : ''}
            ${s.products?.length ? `<tr><td><i class="fas fa-box"></i> Sản phẩm</td><td>${s.products.map(p => `<div class="history-product-row">${_escHtml(p.name)} <strong>x${p.quantity}</strong>${p.sellingPrice ? ` — ${Number(p.sellingPrice).toLocaleString('vi-VN')}đ` : ''}</div>`).join('')}</td></tr>` : ''}
            ${s.totalAmount ? `<tr><td><i class="fas fa-money-bill"></i> Tổng tiền</td><td><strong>${Number(s.totalAmount).toLocaleString('vi-VN')}đ</strong></td></tr>` : ''}
            ${s.note ? `<tr><td><i class="fas fa-sticky-note"></i> Ghi chú</td><td>${_escHtml(s.note)}</td></tr>` : ''}
            ${s.createdAt ? `<tr><td><i class="fas fa-calendar"></i> Ngày tạo đơn</td><td>${new Date(s.createdAt).toLocaleString('vi-VN')}</td></tr>` : ''}
        </table>
    </div>`;
}

function _escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function clearHistoryConfirm() {
    if (confirm('Bạn có chắc muốn xóa toàn bộ lịch sử?\nHành động này không thể hoàn tác.')) {
        await InboxHistory.clearAll();
        await _renderHistoryList();
        if (typeof showNotification === 'function') showNotification('Đã xóa toàn bộ lịch sử', 'success');
    }
}

// ===== EXPORTS =====
window.InboxHistory = InboxHistory;
window.openHistoryModal = openHistoryModal;
window.closeHistoryModal = closeHistoryModal;
window.filterHistory = filterHistory;
window.searchHistoryDebounced = searchHistoryDebounced;
window.toggleHistoryDetail = toggleHistoryDetail;
window.clearHistoryConfirm = clearHistoryConfirm;
