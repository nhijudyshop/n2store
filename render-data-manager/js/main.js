// =====================================================
// DATA MANAGER - Main JS
// =====================================================

const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api/admin/data'
    : 'https://n2store-fallback.onrender.com/api/admin/data';

const FB_API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api/admin/firebase'
    : 'https://n2store-fallback.onrender.com/api/admin/firebase';

const RS_API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api/admin/render'
    : 'https://n2store-fallback.onrender.com/api/admin/render';

// =====================================================
// STATE
// =====================================================

let activeTab = 'render';

// Render state
let currentTable = null;
let currentPage = 1;
let currentSearch = '';
let tableData = null;
let pendingDeleteAction = null;
let searchTimeout = null;
let loadedRows = [];
let loadedColumns = [];
let editingRowIdx = null;

// Firebase state
let fbCollections = [];
let fbCurrentPath = []; // breadcrumb path: [{type:'collection'|'document', name:'xxx'}]
let fbDocs = [];
let fbLastDocId = null;
let fbHasMore = false;
let fbSearchFilter = '';
let fbSearchTimeout = null;

// RTDB state
let rtdbRootKeys = [];
let rtdbCurrentPath = '/';
let rtdbChildren = [];

// Render Services state
let rsServices = [];
let rsCurrentService = null;

// =====================================================
// INIT
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    loadTableList();
});

// =====================================================
// TAB SWITCHING
// =====================================================

function switchTab(tab) {
    activeTab = tab;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
    });

    const tabMap = { render: 'renderTab', firebase: 'firebaseTab', rtdb: 'rtdbTab', renderSvc: 'renderSvcTab' };
    document.getElementById(tabMap[tab]).classList.add('active');

    // Lazy load on first switch
    if (tab === 'firebase' && fbCollections.length === 0) {
        fbLoadCollections();
    } else if (tab === 'rtdb' && rtdbRootKeys.length === 0) {
        rtdbLoadRoot();
    } else if (tab === 'renderSvc' && rsServices.length === 0) {
        rsLoadServices();
    }

    lucide.createIcons();
}

function refreshCurrentTab() {
    if (activeTab === 'render') refreshAllTables();
    else if (activeTab === 'firebase') fbRefresh();
    else if (activeTab === 'rtdb') rtdbRefresh();
    else if (activeTab === 'renderSvc') rsRefresh();
}

// =====================================================
// RENDER TAB - TABLE LIST (Sidebar)
// =====================================================

async function loadTableList() {
    const container = document.getElementById('tableGroups');
    container.innerHTML = '<div class="loading-placeholder"><div class="spinner" style="margin:0 auto 8px;"></div>Đang tải...</div>';

    try {
        const resp = await fetch(`${API_BASE}/tables`);
        const data = await resp.json();

        if (!data.success) throw new Error(data.error || 'Failed to load');

        tableData = data.groups;
        renderTableList(data.groups);
    } catch (err) {
        container.innerHTML = `<div class="loading-placeholder" style="color:var(--danger);">Lỗi: ${err.message}</div>`;
        console.error('[DATA-MANAGER] Load tables error:', err);
    }
}

function renderTableList(groups, filter = '') {
    const container = document.getElementById('tableGroups');
    const lowerFilter = filter.toLowerCase();
    let html = '';

    for (const [groupName, tables] of Object.entries(groups)) {
        const filteredTables = tables.filter(t =>
            !lowerFilter || t.name.includes(lowerFilter) || t.label.toLowerCase().includes(lowerFilter)
        );
        if (filteredTables.length === 0) continue;

        const totalRows = filteredTables.reduce((s, t) => s + t.rowCount, 0);
        html += `<div class="table-group">
            <div class="group-header" onclick="toggleGroup(this)">
                <span>${groupName}</span>
                <span class="group-count">${formatCount(totalRows)}</span>
            </div>
            <div class="group-items">
                ${filteredTables.map(t => `
                    <div class="table-item ${!t.exists ? 'not-exists' : ''} ${t.isView ? 'is-view' : ''} ${currentTable === t.name ? 'active' : ''}"
                         onclick="${t.exists ? `selectTable('${t.name}')` : ''}"
                         title="${t.usedBy || t.name}">
                        <span class="table-item-info">
                            <span class="table-item-name">${t.label}${t.isView ? ' <em class="view-tag">VIEW</em>' : ''}</span>
                            ${t.usedBy ? `<span class="table-item-used">${t.usedBy}</span>` : ''}
                        </span>
                        <span class="row-count">${t.exists ? formatCount(t.rowCount) : '-'}</span>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }

    container.innerHTML = html || '<div class="loading-placeholder">Không tìm thấy table nào</div>';
}

function filterTables(value) {
    if (tableData) renderTableList(tableData, value);
}

function toggleGroup(el) {
    const items = el.nextElementSibling;
    items.classList.toggle('collapsed');
}

function formatCount(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

// =====================================================
// RENDER TAB - SELECT TABLE & LOAD DATA
// =====================================================

function selectTable(tableName) {
    currentTable = tableName;
    currentPage = 1;
    currentSearch = '';
    document.getElementById('dataSearch').value = '';

    // Update sidebar active state
    document.querySelectorAll('#renderTab .table-item').forEach(el => el.classList.remove('active'));
    const item = [...document.querySelectorAll('#renderTab .table-item')].find(el =>
        el.getAttribute('onclick')?.includes(`'${tableName}'`)
    );
    if (item) item.classList.add('active');

    document.getElementById('welcomePanel').style.display = 'none';
    document.getElementById('dataPanel').style.display = 'flex';

    loadData();
}

async function loadData() {
    if (!currentTable) return;

    const tableBody = document.getElementById('dataTableBody');
    const tableHead = document.getElementById('dataTableHead');
    const loadingEl = document.getElementById('loadingState');
    const emptyEl = document.getElementById('emptyState');
    const tableEl = document.getElementById('dataTable');

    tableBody.innerHTML = '';
    tableHead.innerHTML = '';
    emptyEl.style.display = 'none';
    tableEl.style.display = 'none';
    loadingEl.style.display = 'flex';

    try {
        const params = new URLSearchParams({
            page: currentPage,
            limit: 20,
            ...(currentSearch && { search: currentSearch })
        });

        const resp = await fetch(`${API_BASE}/browse/${currentTable}?${params}`);
        const data = await resp.json();

        if (!data.success) throw new Error(data.error || 'Failed');

        loadingEl.style.display = 'none';
        document.getElementById('currentTableName').textContent = currentTable;
        document.getElementById('currentTableCount').textContent = `${data.pagination.total} rows`;

        if (data.rows.length === 0) {
            emptyEl.style.display = 'flex';
            renderPagination(data.pagination);
            lucide.createIcons();
            return;
        }

        tableEl.style.display = 'table';

        // Store loaded data for index-based access
        loadedRows = data.rows;
        loadedColumns = data.columns;

        // Render header
        const cols = data.columns.map(c => c.column_name);
        tableHead.innerHTML = `<tr>
            <th style="width:90px">Actions</th>
            ${cols.map(c => `<th>${c}</th>`).join('')}
        </tr>`;

        // Check if table is a view (no edit/delete for views)
        const isView = isCurrentTableView();

        // Render rows using index-based references
        tableBody.innerHTML = data.rows.map((row, idx) => {
            return `<tr>
                <td class="cell-actions">
                    <button class="btn-icon btn-icon-view" onclick="viewRowByIdx(${idx})"
                            title="Xem chi tiết">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    ${!isView ? `<button class="btn-icon btn-icon-edit" onclick="editRowByIdx(${idx})"
                            title="Sửa row">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon" onclick="deleteRowByIdx(${idx})"
                            title="Xóa row">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>` : ''}
                </td>
                ${cols.map(c => `<td>${renderCell(row[c])}</td>`).join('')}
            </tr>`;
        }).join('');

        renderPagination(data.pagination);

    } catch (err) {
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'flex';
        emptyEl.querySelector('p').textContent = `Lỗi: ${err.message}`;
        console.error('[DATA-MANAGER] Load data error:', err);
    }

    lucide.createIcons();
}

function getPkValue(row) {
    if (!tableData) return null;
    for (const tables of Object.values(tableData)) {
        const tInfo = tables.find(t => t.name === currentTable);
        if (tInfo) {
            if (tInfo.compositePk) {
                const pkValues = {};
                for (const col of tInfo.compositePk) {
                    pkValues[col] = row[col];
                }
                return { compositePk: true, pkValues };
            }
            return { pk: tInfo.pk, value: row[tInfo.pk] };
        }
    }
    const firstKey = Object.keys(row)[0];
    return { pk: firstKey, value: row[firstKey] };
}

function renderCell(value) {
    if (value === null || value === undefined) {
        return '<span class="cell-null">null</span>';
    }
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (str.length > 60) {
        const escaped = escapeHtml(str.substring(0, 60));
        return `<span class="cell-long" title="Click to view" onclick="viewLongText(this)" data-full="${escapeHtml(str)}">${escaped}...</span>`;
    }
    return escapeHtml(str);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// RENDER TAB - SEARCH
// =====================================================

function searchData(value) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        currentSearch = value;
        currentPage = 1;
        loadData();
    }, 400);
}

// =====================================================
// RENDER TAB - PAGINATION
// =====================================================

function renderPagination(p) {
    const container = document.getElementById('pagination');
    if (p.totalPages <= 1) {
        container.innerHTML = `<span class="page-info">Trang ${p.page} / ${p.totalPages} (${p.total} rows)</span>`;
        return;
    }

    let html = '';
    html += `<button ${p.page <= 1 ? 'disabled' : ''} onclick="goToPage(${p.page - 1})">&laquo;</button>`;

    const maxButtons = 7;
    let start = Math.max(1, p.page - 3);
    let end = Math.min(p.totalPages, start + maxButtons - 1);
    if (end - start < maxButtons - 1) start = Math.max(1, end - maxButtons + 1);

    if (start > 1) {
        html += `<button onclick="goToPage(1)">1</button>`;
        if (start > 2) html += '<span class="page-info">...</span>';
    }

    for (let i = start; i <= end; i++) {
        html += `<button class="${i === p.page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }

    if (end < p.totalPages) {
        if (end < p.totalPages - 1) html += '<span class="page-info">...</span>';
        html += `<button onclick="goToPage(${p.totalPages})">${p.totalPages}</button>`;
    }

    html += `<button ${p.page >= p.totalPages ? 'disabled' : ''} onclick="goToPage(${p.page + 1})">&raquo;</button>`;
    html += `<span class="page-info">${p.total} rows</span>`;

    container.innerHTML = html;
}

function goToPage(page) {
    currentPage = page;
    loadData();
}

// =====================================================
// RENDER TAB - HELPERS
// =====================================================

function isCurrentTableView() {
    if (!tableData) return false;
    for (const tables of Object.values(tableData)) {
        const tInfo = tables.find(t => t.name === currentTable);
        if (tInfo) return !!tInfo.isView;
    }
    return false;
}

// =====================================================
// RENDER TAB - DELETE ROW (index-based)
// =====================================================

function deleteRowByIdx(idx) {
    const row = loadedRows[idx];
    if (!row) return;
    const pkInfo = getPkValue(row);
    pendingDeleteAction = { type: 'row', pkInfo };

    const modal = document.getElementById('confirmModal');
    document.getElementById('modalTitle').textContent = 'Xác nhận xóa row';
    let desc = '';
    if (pkInfo.compositePk) {
        desc = Object.entries(pkInfo.pkValues).map(([k, v]) => `${k} = ${v}`).join(', ');
    } else {
        desc = `${pkInfo.pk} = ${pkInfo.value}`;
    }
    document.getElementById('modalBody').innerHTML =
        `Bạn có chắc chắn muốn xóa row này?<br><strong>${escapeHtml(String(desc))}</strong><br><br>` +
        `<span style="color:var(--danger);font-size:0.8rem;">Hành động này không thể hoàn tác!</span>`;
    modal.style.display = 'flex';
}

function confirmTruncate() {
    if (!currentTable) return;
    pendingDeleteAction = { type: 'truncate' };
    const modal = document.getElementById('confirmModal');
    document.getElementById('modalTitle').textContent = 'Xóa tất cả dữ liệu';
    document.getElementById('modalBody').innerHTML =
        `Bạn có chắc chắn muốn xóa <strong>TẤT CẢ</strong> dữ liệu trong table <strong>${currentTable}</strong>?<br><br>` +
        `<span style="color:var(--danger);font-weight:600;">Hành động này sẽ xóa toàn bộ rows và KHÔNG THỂ hoàn tác!</span>`;
    modal.style.display = 'flex';
}

async function executeDelete() {
    if (!pendingDeleteAction) return;
    const action = pendingDeleteAction;
    closeModal();

    try {
        if (action.type === 'row') {
            const pkInfo = action.pkInfo;
            const body = pkInfo.compositePk
                ? { pkValues: pkInfo.pkValues }
                : { pkValue: pkInfo.value };

            const resp = await fetch(`${API_BASE}/row/${currentTable}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error);
            showToast('Xóa row thành công', 'success');

        } else if (action.type === 'truncate') {
            const resp = await fetch(`${API_BASE}/truncate/${currentTable}`, {
                method: 'DELETE'
            });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error);
            showToast(`Đã xóa ${data.deletedRows} rows thành công`, 'success');

        } else if (action.type === 'fb-doc') {
            const docPath = action.docPath;
            const resp = await fetch(`${FB_API_BASE}/document/${docPath}`, {
                method: 'DELETE'
            });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error);
            showToast('Xóa document thành công', 'success');
            fbReloadCurrentCollection();

        } else if (action.type === 'rtdb') {
            const path = action.path;
            const resp = await fetch(`${FB_API_BASE}/rtdb/value?path=${encodeURIComponent(path)}`, {
                method: 'DELETE'
            });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error);
            showToast('Xóa RTDB data thành công', 'success');
            rtdbLoadData();
            rtdbLoadRoot();
        }

        // Refresh for render tab
        if (action.type === 'row' || action.type === 'truncate') {
            loadData();
            loadTableList();
        }

    } catch (err) {
        showToast('Lỗi: ' + err.message, 'error');
        console.error('[DATA-MANAGER] Delete error:', err);
    }

    pendingDeleteAction = null;
}

// =====================================================
// RENDER TAB - EDIT ROW
// =====================================================

function editRowByIdx(idx) {
    const row = loadedRows[idx];
    if (!row) return;
    editingRowIdx = idx;

    const modal = document.getElementById('editModal');
    const body = document.getElementById('editModalBody');
    const pkInfo = getPkValue(row);

    // Get PK columns to mark as readonly
    let pkCols = [];
    if (pkInfo.compositePk) {
        pkCols = Object.keys(pkInfo.pkValues);
    } else if (pkInfo.pk) {
        pkCols = [pkInfo.pk];
    }

    const cols = loadedColumns.map(c => c.column_name);
    const colTypes = {};
    loadedColumns.forEach(c => { colTypes[c.column_name] = c.data_type; });

    body.innerHTML = cols.map(col => {
        const val = row[col];
        const isPk = pkCols.includes(col);
        const dataType = colTypes[col] || 'text';
        const isJson = typeof val === 'object' && val !== null;
        const displayVal = val === null || val === undefined ? '' : (isJson ? JSON.stringify(val, null, 2) : String(val));

        const isLongText = displayVal.length > 80 || isJson || dataType === 'text' || dataType === 'jsonb' || dataType === 'json';

        return `<div class="edit-field">
            <label class="edit-label">
                ${escapeHtml(col)}
                <span class="edit-type">${escapeHtml(dataType)}${isPk ? ' (PK)' : ''}</span>
            </label>
            ${isLongText
                ? `<textarea class="edit-input" data-col="${escapeHtml(col)}" data-type="${escapeHtml(dataType)}" ${isPk ? 'readonly' : ''} rows="3">${escapeHtml(displayVal)}</textarea>`
                : `<input class="edit-input" data-col="${escapeHtml(col)}" data-type="${escapeHtml(dataType)}" ${isPk ? 'readonly' : ''} value="${escapeHtml(displayVal)}">`
            }
            ${val === null ? '<span class="edit-null-hint">NULL</span>' : ''}
        </div>`;
    }).join('');

    modal.style.display = 'flex';
}

async function saveEdit() {
    if (editingRowIdx === null) return;
    const row = loadedRows[editingRowIdx];
    if (!row) return;

    const pkInfo = getPkValue(row);
    const inputs = document.querySelectorAll('#editModalBody .edit-input');
    const updates = {};

    // Get PK columns
    let pkCols = [];
    if (pkInfo.compositePk) {
        pkCols = Object.keys(pkInfo.pkValues);
    } else if (pkInfo.pk) {
        pkCols = [pkInfo.pk];
    }

    inputs.forEach(input => {
        const col = input.dataset.col;
        const dataType = input.dataset.type;
        if (pkCols.includes(col)) return; // skip PK fields

        const newVal = input.tagName === 'TEXTAREA' ? input.value : input.value;
        const oldVal = row[col];

        // Convert value based on type
        let parsedNew = newVal;
        if (newVal === '' && oldVal === null) return; // still null, skip
        if (newVal === '') {
            parsedNew = null;
        } else if (['integer', 'bigint', 'smallint', 'serial', 'bigserial'].includes(dataType)) {
            parsedNew = parseInt(newVal);
            if (isNaN(parsedNew)) { parsedNew = newVal; }
        } else if (['numeric', 'decimal', 'real', 'double precision'].includes(dataType)) {
            parsedNew = parseFloat(newVal);
            if (isNaN(parsedNew)) { parsedNew = newVal; }
        } else if (dataType === 'boolean') {
            parsedNew = newVal === 'true' || newVal === '1';
        } else if (['jsonb', 'json'].includes(dataType)) {
            try { parsedNew = JSON.parse(newVal); } catch { parsedNew = newVal; }
        }

        // Compare with old value
        const oldStr = oldVal === null || oldVal === undefined ? null : (typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal));
        const newStr = parsedNew === null ? null : (typeof parsedNew === 'object' ? JSON.stringify(parsedNew) : String(parsedNew));
        if (oldStr !== newStr) {
            updates[col] = parsedNew;
        }
    });

    if (Object.keys(updates).length === 0) {
        showToast('Không có thay đổi nào', 'info');
        closeEditModal();
        return;
    }

    // Build request body
    const body = { updates };
    if (pkInfo.compositePk) {
        body.pkValues = pkInfo.pkValues;
    } else {
        body.pkValue = pkInfo.value;
    }

    try {
        const resp = await fetch(`${API_BASE}/row/${currentTable}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await resp.json();
        if (!data.success) throw new Error(data.error);
        showToast('Cập nhật thành công', 'success');
        closeEditModal();
        loadData();
    } catch (err) {
        showToast('Lỗi: ' + err.message, 'error');
        console.error('[DATA-MANAGER] Edit error:', err);
    }
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    editingRowIdx = null;
}

// =====================================================
// RENDER TAB - VIEW ROW DETAIL (index-based)
// =====================================================

function viewRowByIdx(idx) {
    const row = loadedRows[idx];
    if (!row) return;
    viewRow(row);
}

function viewRow(row) {
    const modal = document.getElementById('detailModal');
    const body = document.getElementById('detailModalBody');
    document.getElementById('detailModalTitle').textContent = 'Chi tiết row';

    body.innerHTML = Object.entries(row).map(([key, val]) => {
        let display;
        if (val === null || val === undefined) {
            display = '<span class="null">null</span>';
        } else if (typeof val === 'object') {
            display = `<pre style="white-space:pre-wrap;font-size:0.75rem;background:var(--gray-50);padding:8px;border-radius:4px;max-height:200px;overflow:auto;">${escapeHtml(JSON.stringify(val, null, 2))}</pre>`;
        } else {
            display = escapeHtml(String(val));
        }
        return `<div class="detail-row">
            <div class="detail-key">${key}</div>
            <div class="detail-value">${display}</div>
        </div>`;
    }).join('');

    modal.style.display = 'flex';
}

function viewLongText(el) {
    const fullText = el.getAttribute('data-full');
    const modal = document.getElementById('detailModal');
    const body = document.getElementById('detailModalBody');
    document.getElementById('detailModalTitle').textContent = 'Chi tiết';
    body.innerHTML = `<pre style="white-space:pre-wrap;word-break:break-all;font-size:0.82rem;">${fullText}</pre>`;
    modal.style.display = 'flex';
}

// =====================================================
// RENDER TAB - REFRESH
// =====================================================

function refreshAllTables() {
    loadTableList();
    if (currentTable) loadData();
    showToast('Đã làm mới', 'info');
}

// =====================================================
// FIREBASE TAB - LOAD COLLECTIONS
// =====================================================

async function fbLoadCollections() {
    const container = document.getElementById('fbCollectionList');
    container.innerHTML = '<div class="loading-placeholder"><div class="spinner" style="margin:0 auto 8px;"></div>Đang tải...</div>';

    try {
        const resp = await fetch(`${FB_API_BASE}/collections`);
        const data = await resp.json();

        if (!data.success) throw new Error(data.error || 'Failed to load');

        fbCollections = data.collections;
        fbRenderCollectionList(fbCollections);
    } catch (err) {
        container.innerHTML = `<div class="loading-placeholder" style="color:var(--danger);">Lỗi: ${err.message}</div>`;
        console.error('[DATA-MANAGER] Load Firebase collections error:', err);
    }
}

function fbRenderCollectionList(collections, filter = '') {
    const container = document.getElementById('fbCollectionList');
    const lowerFilter = filter.toLowerCase();

    const filtered = collections.filter(c =>
        !lowerFilter || c.id.toLowerCase().includes(lowerFilter)
    );

    if (filtered.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">Không tìm thấy collection nào</div>';
        return;
    }

    const currentCollectionName = fbCurrentPath.length > 0 ? fbCurrentPath[0].name : null;

    container.innerHTML = filtered.map(c => `
        <div class="table-item ${currentCollectionName === c.id ? 'active' : ''}"
             onclick="fbSelectCollection('${escapeHtml(c.id)}')">
            <span class="table-item-info">
                <span class="table-item-name">${escapeHtml(c.id)}</span>
            </span>
            <span class="row-count"><i data-lucide="chevron-right" style="width:14px;height:14px;"></i></span>
        </div>
    `).join('');

    lucide.createIcons();
}

function fbFilterCollections(value) {
    fbRenderCollectionList(fbCollections, value);
}

// =====================================================
// FIREBASE TAB - SELECT & BROWSE
// =====================================================

function fbSelectCollection(collectionName) {
    fbCurrentPath = [{ type: 'collection', name: collectionName }];
    fbDocs = [];
    fbLastDocId = null;
    fbHasMore = false;
    fbSearchFilter = '';
    document.getElementById('fbDataSearch').value = '';

    // Update sidebar active
    document.querySelectorAll('#fbSidebar .table-item').forEach(el => el.classList.remove('active'));
    const item = [...document.querySelectorAll('#fbSidebar .table-item')].find(el =>
        el.getAttribute('onclick')?.includes(`'${collectionName}'`)
    );
    if (item) item.classList.add('active');

    document.getElementById('fbWelcomePanel').style.display = 'none';
    document.getElementById('fbDataPanel').style.display = 'flex';

    fbRenderBreadcrumb();
    fbLoadDocuments();
}

function fbNavigateTo(index) {
    // Navigate to a breadcrumb position
    // If clicking on a collection, load its documents
    // If clicking on a document, load its subcollections view
    const targetItem = fbCurrentPath[index];

    if (targetItem.type === 'collection') {
        fbCurrentPath = fbCurrentPath.slice(0, index + 1);
        fbDocs = [];
        fbLastDocId = null;
        fbHasMore = false;
        fbSearchFilter = '';
        document.getElementById('fbDataSearch').value = '';
        fbRenderBreadcrumb();
        fbLoadDocuments();
    }
}

function fbNavigateToSubcollection(docId, subCollectionName) {
    // Add document + subcollection to path
    fbCurrentPath.push(
        { type: 'document', name: docId },
        { type: 'collection', name: subCollectionName }
    );
    fbDocs = [];
    fbLastDocId = null;
    fbHasMore = false;
    fbSearchFilter = '';
    document.getElementById('fbDataSearch').value = '';
    fbRenderBreadcrumb();
    fbLoadDocuments();
}

function fbGetCollectionPath() {
    // Build Firestore collection path from breadcrumb
    return fbCurrentPath.map(p => p.name).join('/');
}

function fbRenderBreadcrumb() {
    const container = document.getElementById('fbBreadcrumb');
    let html = '<span class="breadcrumb-item clickable" onclick="fbLoadCollections(); fbCurrentPath=[]; document.getElementById(\'fbDataPanel\').style.display=\'none\'; document.getElementById(\'fbWelcomePanel\').style.display=\'flex\';">Firestore</span>';

    fbCurrentPath.forEach((item, idx) => {
        const isLast = idx === fbCurrentPath.length - 1;
        const icon = item.type === 'collection' ? '📁' : '📄';
        html += `<span class="breadcrumb-sep">/</span>`;
        if (isLast) {
            html += `<span class="breadcrumb-item current">${icon} ${escapeHtml(item.name)}</span>`;
        } else {
            html += `<span class="breadcrumb-item clickable" onclick="fbNavigateTo(${idx})">${icon} ${escapeHtml(item.name)}</span>`;
        }
    });

    container.innerHTML = html;
}

// =====================================================
// FIREBASE TAB - LOAD DOCUMENTS
// =====================================================

async function fbLoadDocuments(append = false) {
    const tableBody = document.getElementById('fbDataTableBody');
    const tableHead = document.getElementById('fbDataTableHead');
    const loadingEl = document.getElementById('fbLoadingState');
    const emptyEl = document.getElementById('fbEmptyState');
    const tableEl = document.getElementById('fbDataTable');
    const loadMoreEl = document.getElementById('fbLoadMore');

    if (!append) {
        tableBody.innerHTML = '';
        tableHead.innerHTML = '';
        fbDocs = [];
        fbLastDocId = null;
    }

    emptyEl.style.display = 'none';
    if (!append) tableEl.style.display = 'none';
    loadingEl.style.display = 'flex';
    loadMoreEl.style.display = 'none';

    const collectionPath = fbGetCollectionPath();

    try {
        const params = new URLSearchParams({ limit: 20 });
        if (append && fbLastDocId) {
            params.set('startAfter', fbLastDocId);
        }

        const resp = await fetch(`${FB_API_BASE}/browse/${collectionPath}?${params}`);
        const data = await resp.json();

        if (!data.success) throw new Error(data.error || 'Failed');

        loadingEl.style.display = 'none';

        // Update header
        const lastSegment = fbCurrentPath[fbCurrentPath.length - 1];
        document.getElementById('fbCurrentName').textContent = lastSegment.name;
        document.getElementById('fbCurrentCount').textContent = `${data.total} docs`;

        fbHasMore = data.hasMore;
        fbLastDocId = data.lastDocId;

        // Filter by search
        let docs = data.docs;
        if (fbSearchFilter) {
            const lower = fbSearchFilter.toLowerCase();
            docs = docs.filter(d => d._id.toLowerCase().includes(lower));
        }

        fbDocs = append ? [...fbDocs, ...docs] : docs;

        if (fbDocs.length === 0 && !append) {
            emptyEl.style.display = 'flex';
            return;
        }

        tableEl.style.display = 'table';

        // Collect all unique keys across documents
        const allKeys = new Set();
        fbDocs.forEach(doc => {
            Object.keys(doc).forEach(k => { if (k !== '_id') allKeys.add(k); });
        });
        const cols = Array.from(allKeys);

        // Render header
        tableHead.innerHTML = `<tr>
            <th style="width:60px">Actions</th>
            <th>Document ID</th>
            ${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}
        </tr>`;

        // Render all rows
        tableBody.innerHTML = fbDocs.map(doc => {
            const docPath = collectionPath + '/' + doc._id;
            return `<tr>
                <td class="cell-actions">
                    <button class="btn-icon btn-icon-view" onclick="fbViewDocument('${escapeHtml(docPath)}')"
                            title="Xem chi tiết">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button class="btn-icon" onclick="fbConfirmDeleteDoc('${escapeHtml(docPath)}')"
                            title="Xóa document">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </td>
                <td><strong class="fb-doc-id">${escapeHtml(doc._id)}</strong></td>
                ${cols.map(c => `<td>${renderCell(doc[c])}</td>`).join('')}
            </tr>`;
        }).join('');

        // Show load more
        if (fbHasMore) {
            loadMoreEl.style.display = 'flex';
        }

    } catch (err) {
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'flex';
        emptyEl.querySelector('p').textContent = `Lỗi: ${err.message}`;
        console.error('[DATA-MANAGER] Load Firebase docs error:', err);
    }

    lucide.createIcons();
}

function fbLoadMore() {
    fbLoadDocuments(true);
}

// =====================================================
// FIREBASE TAB - SEARCH
// =====================================================

function fbSearchDocs(value) {
    clearTimeout(fbSearchTimeout);
    fbSearchTimeout = setTimeout(() => {
        fbSearchFilter = value;
        // Re-render with filter (client-side filter on loaded docs)
        const tableBody = document.getElementById('fbDataTableBody');
        const tableEl = document.getElementById('fbDataTable');
        const emptyEl = document.getElementById('fbEmptyState');

        if (!fbDocs.length) return;

        const lower = value.toLowerCase();
        const filtered = value ? fbDocs.filter(d => d._id.toLowerCase().includes(lower)) : fbDocs;

        if (filtered.length === 0) {
            tableEl.style.display = 'none';
            emptyEl.style.display = 'flex';
            emptyEl.querySelector('p').textContent = 'Không tìm thấy document nào';
            return;
        }

        tableEl.style.display = 'table';
        emptyEl.style.display = 'none';

        const collectionPath = fbGetCollectionPath();
        const allKeys = new Set();
        filtered.forEach(doc => {
            Object.keys(doc).forEach(k => { if (k !== '_id') allKeys.add(k); });
        });
        const cols = Array.from(allKeys);

        tableBody.innerHTML = filtered.map(doc => {
            const docPath = collectionPath + '/' + doc._id;
            return `<tr>
                <td class="cell-actions">
                    <button class="btn-icon btn-icon-view" onclick="fbViewDocument('${escapeHtml(docPath)}')"
                            title="Xem chi tiết">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button class="btn-icon" onclick="fbConfirmDeleteDoc('${escapeHtml(docPath)}')"
                            title="Xóa document">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </td>
                <td><strong class="fb-doc-id">${escapeHtml(doc._id)}</strong></td>
                ${cols.map(c => `<td>${renderCell(doc[c])}</td>`).join('')}
            </tr>`;
        }).join('');
    }, 300);
}

// =====================================================
// FIREBASE TAB - VIEW DOCUMENT
// =====================================================

async function fbViewDocument(docPath) {
    const modal = document.getElementById('detailModal');
    const body = document.getElementById('detailModalBody');
    document.getElementById('detailModalTitle').textContent = 'Chi tiết Document';

    body.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Đang tải...</p></div>';
    modal.style.display = 'flex';

    try {
        const resp = await fetch(`${FB_API_BASE}/document/${docPath}`);
        const data = await resp.json();

        if (!data.success) throw new Error(data.error || 'Failed');

        const doc = data.document;
        let html = '';

        // Document path
        html += `<div class="detail-row">
            <div class="detail-key">Path</div>
            <div class="detail-value" style="font-family:monospace;font-size:0.78rem;color:var(--primary);">${escapeHtml(doc.path)}</div>
        </div>`;

        // Document ID
        html += `<div class="detail-row">
            <div class="detail-key">Document ID</div>
            <div class="detail-value"><strong>${escapeHtml(doc.id)}</strong></div>
        </div>`;

        // Fields
        for (const [key, val] of Object.entries(doc.data)) {
            let display;
            if (val === null || val === undefined) {
                display = '<span class="null">null</span>';
            } else if (typeof val === 'object') {
                display = `<pre style="white-space:pre-wrap;font-size:0.75rem;background:var(--gray-50);padding:8px;border-radius:4px;max-height:200px;overflow:auto;">${escapeHtml(JSON.stringify(val, null, 2))}</pre>`;
            } else {
                display = escapeHtml(String(val));
            }
            html += `<div class="detail-row">
                <div class="detail-key">${escapeHtml(key)}</div>
                <div class="detail-value">${display}</div>
            </div>`;
        }

        // Subcollections
        if (doc.subcollections && doc.subcollections.length > 0) {
            html += `<div class="detail-row" style="border-top:2px solid var(--gray-200);margin-top:8px;padding-top:12px;">
                <div class="detail-key">Subcollections</div>
                <div class="detail-value">
                    ${doc.subcollections.map(sub => `
                        <button class="btn btn-sm btn-outline" style="margin:2px;" onclick="closeDetailModal(); fbNavigateToSubcollection('${escapeHtml(doc.id)}', '${escapeHtml(sub.id)}')">
                            📁 ${escapeHtml(sub.id)}
                        </button>
                    `).join('')}
                </div>
            </div>`;
        }

        body.innerHTML = html;

    } catch (err) {
        body.innerHTML = `<div style="color:var(--danger);">Lỗi: ${escapeHtml(err.message)}</div>`;
        console.error('[DATA-MANAGER] View Firebase doc error:', err);
    }
}

// =====================================================
// FIREBASE TAB - DELETE DOCUMENT
// =====================================================

function fbConfirmDeleteDoc(docPath) {
    pendingDeleteAction = { type: 'fb-doc', docPath };
    const modal = document.getElementById('confirmModal');
    document.getElementById('modalTitle').textContent = 'Xóa Firebase Document';
    document.getElementById('modalBody').innerHTML =
        `Bạn có chắc chắn muốn xóa document này?<br><strong style="font-family:monospace;">${escapeHtml(docPath)}</strong><br><br>` +
        `<span style="color:var(--danger);font-size:0.8rem;">Hành động này không thể hoàn tác!</span>`;
    modal.style.display = 'flex';
}

function fbReloadCurrentCollection() {
    fbDocs = [];
    fbLastDocId = null;
    fbHasMore = false;
    fbLoadDocuments();
}

// =====================================================
// FIREBASE TAB - REFRESH
// =====================================================

function fbRefresh() {
    fbLoadCollections();
    if (fbCurrentPath.length > 0) {
        fbReloadCurrentCollection();
    }
    showToast('Đã làm mới', 'info');
}

// =====================================================
// RTDB TAB - LOAD ROOT KEYS
// =====================================================

async function rtdbLoadRoot() {
    rtdbCurrentPath = '/';
    const container = document.getElementById('rtdbKeyList');
    container.innerHTML = '<div class="loading-placeholder"><div class="spinner" style="margin:0 auto 8px;"></div>Đang tải...</div>';

    try {
        const resp = await fetch(`${FB_API_BASE}/rtdb/browse?path=/`);
        const data = await resp.json();

        if (!data.success) throw new Error(data.error || 'Failed');

        rtdbRootKeys = data.children || [];
        rtdbRenderKeyList(rtdbRootKeys);
    } catch (err) {
        container.innerHTML = `<div class="loading-placeholder" style="color:var(--danger);">Lỗi: ${err.message}</div>`;
    }
}

function rtdbRenderKeyList(keys, filter = '') {
    const container = document.getElementById('rtdbKeyList');
    const lower = filter.toLowerCase();
    const filtered = keys.filter(k => !lower || k.key.toLowerCase().includes(lower));

    if (filtered.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">Không tìm thấy key nào</div>';
        return;
    }

    container.innerHTML = filtered.map(k => {
        const typeIcon = k.type === 'object' ? '{}' : k.type === 'array' ? '[]' : '=';
        const isActive = rtdbCurrentPath === '/' + k.key;
        return `<div class="table-item ${isActive ? 'active' : ''}" onclick="rtdbNavigate('/${k.key}')">
            <span class="table-item-info">
                <span class="table-item-name">${escapeHtml(k.key)}</span>
                <span class="table-item-used">${escapeHtml(k.preview)}</span>
            </span>
            <span class="row-count">${k.childCount || typeIcon}</span>
        </div>`;
    }).join('');
}

function rtdbFilterKeys(value) {
    rtdbRenderKeyList(rtdbRootKeys, value);
}

// =====================================================
// RTDB TAB - NAVIGATE & BROWSE
// =====================================================

async function rtdbNavigate(path) {
    rtdbCurrentPath = path;

    document.getElementById('rtdbWelcomePanel').style.display = 'none';
    document.getElementById('rtdbDataPanel').style.display = 'flex';

    rtdbRenderBreadcrumb();
    await rtdbLoadData();

    // Update sidebar active
    document.querySelectorAll('#rtdbSidebar .table-item').forEach(el => el.classList.remove('active'));
    const rootKey = path.split('/')[1];
    const item = [...document.querySelectorAll('#rtdbSidebar .table-item')].find(el =>
        el.getAttribute('onclick')?.includes(`'/${rootKey}'`)
    );
    if (item) item.classList.add('active');
}

function rtdbRenderBreadcrumb() {
    const container = document.getElementById('rtdbBreadcrumb');
    const parts = rtdbCurrentPath.split('/').filter(Boolean);

    let html = `<span class="breadcrumb-item clickable" onclick="rtdbNavigate('/'); document.getElementById('rtdbDataPanel').style.display='none'; document.getElementById('rtdbWelcomePanel').style.display='flex';">Root</span>`;

    parts.forEach((part, idx) => {
        const path = '/' + parts.slice(0, idx + 1).join('/');
        const isLast = idx === parts.length - 1;
        html += '<span class="breadcrumb-sep">/</span>';
        if (isLast) {
            html += `<span class="breadcrumb-item current">${escapeHtml(part)}</span>`;
        } else {
            html += `<span class="breadcrumb-item clickable" onclick="rtdbNavigate('${path}')">${escapeHtml(part)}</span>`;
        }
    });

    container.innerHTML = html;
}

async function rtdbLoadData() {
    const loadingEl = document.getElementById('rtdbLoadingState');
    const emptyEl = document.getElementById('rtdbEmptyState');
    const tableEl = document.getElementById('rtdbTable');
    const valueEl = document.getElementById('rtdbValueDisplay');

    tableEl.style.display = 'none';
    valueEl.style.display = 'none';
    emptyEl.style.display = 'none';
    loadingEl.style.display = 'flex';

    try {
        const resp = await fetch(`${FB_API_BASE}/rtdb/browse?path=${encodeURIComponent(rtdbCurrentPath)}&limit=100`);
        const data = await resp.json();

        if (!data.success) throw new Error(data.error || 'Failed');

        loadingEl.style.display = 'none';

        if (data.data === null) {
            emptyEl.style.display = 'flex';
            return;
        }

        // Primitive value
        if (data.type !== 'object' && data.type !== 'array') {
            valueEl.style.display = 'block';
            valueEl.innerHTML = `
                <div class="rtdb-value-card">
                    <div class="detail-row">
                        <div class="detail-key">Path</div>
                        <div class="detail-value" style="font-family:monospace;color:var(--primary);">${escapeHtml(rtdbCurrentPath)}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-key">Type</div>
                        <div class="detail-value">${escapeHtml(data.type)}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-key">Value</div>
                        <div class="detail-value"><pre style="white-space:pre-wrap;font-size:0.82rem;">${escapeHtml(String(data.data))}</pre></div>
                    </div>
                </div>`;
            return;
        }

        // Object/Array - show children table
        rtdbChildren = data.children || [];

        if (rtdbChildren.length === 0) {
            emptyEl.style.display = 'flex';
            return;
        }

        tableEl.style.display = 'table';
        const tbody = document.getElementById('rtdbTableBody');
        tbody.innerHTML = rtdbChildren.map(child => {
            const childPath = rtdbCurrentPath === '/' ? `/${child.key}` : `${rtdbCurrentPath}/${child.key}`;
            const isNavigable = child.type === 'object' || child.type === 'array';
            return `<tr>
                <td class="cell-actions">
                    ${isNavigable ? `<button class="btn-icon btn-icon-view" onclick="rtdbNavigate('${childPath}')" title="Mở">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </button>` : `<button class="btn-icon btn-icon-view" onclick="rtdbViewValue('${childPath}')" title="Xem">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>`}
                    <button class="btn-icon" onclick="rtdbConfirmDelete('${childPath}')" title="Xóa">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </td>
                <td><strong class="${isNavigable ? 'fb-doc-id' : ''}" ${isNavigable ? `style="cursor:pointer" onclick="rtdbNavigate('${childPath}')"` : ''}>${escapeHtml(child.key)}</strong></td>
                <td><span class="rtdb-type-badge rtdb-type-${child.type}">${child.type}</span></td>
                <td>${escapeHtml(child.preview)}</td>
            </tr>`;
        }).join('');

        if (data.hasMore) {
            tbody.innerHTML += `<tr><td colspan="4" style="text-align:center;color:var(--gray-400);font-size:0.78rem;padding:12px;">+ thêm dữ liệu (giới hạn 100 keys)</td></tr>`;
        }

    } catch (err) {
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'flex';
        emptyEl.querySelector('p').textContent = `Lỗi: ${err.message}`;
    }

    lucide.createIcons();
}

async function rtdbViewValue(path) {
    const modal = document.getElementById('detailModal');
    const body = document.getElementById('detailModalBody');
    document.getElementById('detailModalTitle').textContent = 'RTDB Value';

    body.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Đang tải...</p></div>';
    modal.style.display = 'flex';

    try {
        const resp = await fetch(`${FB_API_BASE}/rtdb/value?path=${encodeURIComponent(path)}`);
        const data = await resp.json();

        if (!data.success) throw new Error(data.error);

        body.innerHTML = `
            <div class="detail-row">
                <div class="detail-key">Path</div>
                <div class="detail-value" style="font-family:monospace;color:var(--primary);">${escapeHtml(path)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-key">Value</div>
                <div class="detail-value"><pre style="white-space:pre-wrap;font-size:0.75rem;background:var(--gray-50);padding:8px;border-radius:4px;max-height:400px;overflow:auto;">${escapeHtml(typeof data.data === 'object' ? JSON.stringify(data.data, null, 2) : String(data.data))}</pre></div>
            </div>`;
    } catch (err) {
        body.innerHTML = `<div style="color:var(--danger);">Lỗi: ${escapeHtml(err.message)}</div>`;
    }
}

function rtdbConfirmDelete(path) {
    pendingDeleteAction = { type: 'rtdb', path };
    const modal = document.getElementById('confirmModal');
    document.getElementById('modalTitle').textContent = 'Xóa RTDB Data';
    document.getElementById('modalBody').innerHTML =
        `Bạn có chắc chắn muốn xóa dữ liệu tại path này?<br><strong style="font-family:monospace;">${escapeHtml(path)}</strong><br><br>` +
        `<span style="color:var(--danger);font-size:0.8rem;">Hành động này không thể hoàn tác!</span>`;
    modal.style.display = 'flex';
}

function rtdbRefresh() {
    rtdbLoadRoot();
    if (rtdbCurrentPath !== '/') rtdbLoadData();
    showToast('Đã làm mới', 'info');
}

// =====================================================
// RENDER SERVICES TAB
// =====================================================

async function rsLoadServices() {
    const container = document.getElementById('rsServiceList');
    container.innerHTML = '<div class="loading-placeholder"><div class="spinner" style="margin:0 auto 8px;"></div>Đang tải...</div>';

    try {
        const statusResp = await fetch(`${RS_API_BASE}/status`);
        const statusData = await statusResp.json();

        if (!statusData.configured) {
            container.innerHTML = '<div class="loading-placeholder" style="color:var(--warning);">RENDER_API_KEY chưa được cấu hình.<br><br>Thêm env var RENDER_API_KEY vào Render service.</div>';
            return;
        }

        const resp = await fetch(`${RS_API_BASE}/services`);
        const data = await resp.json();

        if (!data.success) throw new Error(data.error || 'Failed');

        rsServices = data.services;
        rsRenderServiceList(rsServices);
    } catch (err) {
        container.innerHTML = `<div class="loading-placeholder" style="color:var(--danger);">Lỗi: ${err.message}</div>`;
    }
}

function rsRenderServiceList(services, filter = '') {
    const container = document.getElementById('rsServiceList');
    const lower = filter.toLowerCase();
    const filtered = services.filter(s => !lower || s.name.toLowerCase().includes(lower));

    if (filtered.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">Không tìm thấy service nào</div>';
        return;
    }

    container.innerHTML = filtered.map(s => {
        const isActive = rsCurrentService?.id === s.id;
        const typeMap = { web_service: 'Web', static_site: 'Static', private_service: 'Private', background_worker: 'Worker', cron_job: 'Cron' };
        const typeLabel = typeMap[s.type] || s.type || '?';
        return `<div class="table-item ${isActive ? 'active' : ''}" onclick="rsSelectService('${s.id}')">
            <span class="table-item-info">
                <span class="table-item-name">${escapeHtml(s.name)}</span>
                ${s.url ? `<span class="table-item-used">${escapeHtml(s.url)}</span>` : ''}
            </span>
            <span class="row-count"><em class="view-tag">${typeLabel}</em></span>
        </div>`;
    }).join('');
}

function rsFilterServices(value) {
    rsRenderServiceList(rsServices, value);
}

async function rsSelectService(serviceId) {
    rsCurrentService = rsServices.find(s => s.id === serviceId);
    if (!rsCurrentService) return;

    // Update sidebar
    document.querySelectorAll('#rsSidebar .table-item').forEach(el => el.classList.remove('active'));
    const item = [...document.querySelectorAll('#rsSidebar .table-item')].find(el =>
        el.getAttribute('onclick')?.includes(`'${serviceId}'`)
    );
    if (item) item.classList.add('active');

    document.getElementById('rsWelcomePanel').style.display = 'none';
    document.getElementById('rsDataPanel').style.display = 'flex';
    document.getElementById('rsServiceName').textContent = rsCurrentService.name;
    document.getElementById('rsServiceType').textContent = rsCurrentService.type || '-';
    document.getElementById('rsServiceUrl').textContent = rsCurrentService.url || '';

    const loadingEl = document.getElementById('rsLoadingState');
    const emptyEl = document.getElementById('rsEmptyState');
    const tableEl = document.getElementById('rsEnvTable');

    tableEl.style.display = 'none';
    emptyEl.style.display = 'none';
    loadingEl.style.display = 'flex';

    try {
        const resp = await fetch(`${RS_API_BASE}/services/${serviceId}/env`);
        const data = await resp.json();

        loadingEl.style.display = 'none';

        if (!data.success) throw new Error(data.error);

        if (data.envVars.length === 0) {
            emptyEl.style.display = 'flex';
            return;
        }

        tableEl.style.display = 'table';
        document.getElementById('rsEnvTableBody').innerHTML = data.envVars.map(ev => {
            const isSensitive = ev.key.includes('KEY') || ev.key.includes('SECRET') || ev.key.includes('PASSWORD') || ev.key.includes('TOKEN') || ev.key.includes('PRIVATE');
            const val = ev.value || '';
            const displayVal = isSensitive && val.length > 10
                ? `<span class="rs-secret" onclick="this.textContent=this.dataset.full;this.classList.remove('rs-secret')" data-full="${escapeHtml(val)}">${escapeHtml(val.substring(0, 6))}${'*'.repeat(Math.min(16, val.length - 6))} (click)</span>`
                : escapeHtml(val);
            return `<tr>
                <td><strong>${escapeHtml(ev.key)}</strong></td>
                <td style="font-family:monospace;font-size:0.78rem;word-break:break-all;">${displayVal}</td>
            </tr>`;
        }).join('');

    } catch (err) {
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'flex';
        emptyEl.querySelector('p').textContent = `Lỗi: ${err.message}`;
    }

    lucide.createIcons();
}

function rsRefresh() {
    rsLoadServices();
    showToast('Đã làm mới', 'info');
}

// =====================================================
// MODALS
// =====================================================

function closeModal() {
    document.getElementById('confirmModal').style.display = 'none';
    pendingDeleteAction = null;
}

function closeDetailModal() {
    document.getElementById('detailModal').style.display = 'none';
}

// Close modals on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.style.display = 'none';
        pendingDeleteAction = null;
    }
});

// Close on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
        pendingDeleteAction = null;
        editingRowIdx = null;
    }
});

// =====================================================
// TOAST
// =====================================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        toast.style.transition = 'all 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
