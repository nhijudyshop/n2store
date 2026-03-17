// =====================================================
// RENDER DATA MANAGER - Main JS
// =====================================================

const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api/admin/data'
    : 'https://n2store-fallback.onrender.com/api/admin/data';

// State
let currentTable = null;
let currentPage = 1;
let currentSearch = '';
let tableData = null;
let pendingDeleteAction = null;
let searchTimeout = null;

// =====================================================
// INIT
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    loadTableList();
});

// =====================================================
// TABLE LIST (Sidebar)
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
// SELECT TABLE & LOAD DATA
// =====================================================

function selectTable(tableName) {
    currentTable = tableName;
    currentPage = 1;
    currentSearch = '';
    document.getElementById('dataSearch').value = '';

    // Update sidebar active state
    document.querySelectorAll('.table-item').forEach(el => el.classList.remove('active'));
    const item = [...document.querySelectorAll('.table-item')].find(el =>
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

        // Render header
        const cols = data.columns.map(c => c.column_name);
        tableHead.innerHTML = `<tr>
            <th style="width:60px">Actions</th>
            ${cols.map(c => `<th>${c}</th>`).join('')}
        </tr>`;

        // Render rows
        tableBody.innerHTML = data.rows.map((row, idx) => {
            const pkValue = getPkValue(row);
            return `<tr>
                <td class="cell-actions">
                    <button class="btn-icon btn-icon-view" onclick='viewRow(${JSON.stringify(row).replace(/'/g, "\\'")})'
                            title="Xem chi tiết">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button class="btn-icon" onclick='confirmDeleteRow(${JSON.stringify(pkValue).replace(/'/g, "\\'")})'
                            title="Xóa row">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
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
    // Find PK from tableData
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
    // Fallback: use first column
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
// SEARCH
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
// PAGINATION
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
// DELETE ROW
// =====================================================

function confirmDeleteRow(pkInfo) {
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
        `Bạn có chắc chắn muốn xóa row này?<br><strong>${escapeHtml(desc)}</strong><br><br>` +
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
    closeModal();

    try {
        if (pendingDeleteAction.type === 'row') {
            const pkInfo = pendingDeleteAction.pkInfo;
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

        } else if (pendingDeleteAction.type === 'truncate') {
            const resp = await fetch(`${API_BASE}/truncate/${currentTable}`, {
                method: 'DELETE'
            });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error);
            showToast(`Đã xóa ${data.deletedRows} rows thành công`, 'success');
        }

        // Refresh
        loadData();
        loadTableList();

    } catch (err) {
        showToast('Lỗi: ' + err.message, 'error');
        console.error('[DATA-MANAGER] Delete error:', err);
    }

    pendingDeleteAction = null;
}

// =====================================================
// VIEW ROW DETAIL
// =====================================================

function viewRow(row) {
    const modal = document.getElementById('detailModal');
    const body = document.getElementById('detailModalBody');

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
    body.innerHTML = `<pre style="white-space:pre-wrap;word-break:break-all;font-size:0.82rem;">${fullText}</pre>`;
    modal.style.display = 'flex';
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

// =====================================================
// REFRESH
// =====================================================

function refreshAllTables() {
    loadTableList();
    if (currentTable) loadData();
    showToast('Đã làm mới', 'info');
}
