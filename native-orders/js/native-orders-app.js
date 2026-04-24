// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Native Orders — main app logic.
 * Render bảng + filter + pagination + edit modal + delete.
 */

(function () {
    'use strict';

    const STATE = {
        orders: [],
        total: 0,
        page: 1,
        limit: 200,
        status: 'all',
        search: '',
        editingCode: null,
        loading: false,
    };

    // ---------- DOM ----------
    const $ = (sel) => document.querySelector(sel);
    const tbody = () => $('#ordersTbody');
    const counter = () => $('#totalCounter');
    const pag = () => $('#pagination');
    const modal = () => $('#editModal');
    const modalBody = () => $('#editModalBody');
    const modalTitle = () => $('#editModalTitle');

    // ---------- Helpers ----------
    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }

    function formatTime(ms) {
        if (!ms) return '';
        const d = new Date(Number(ms));
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const hour = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month} ${hour}:${min}`;
    }
    function formatFullTime(ms) {
        if (!ms) return '';
        return new Date(Number(ms)).toLocaleString('vi-VN');
    }

    const STATUS_META = {
        draft:     { label: 'Nháp',           icon: 'file' },
        confirmed: { label: 'Đã xác nhận',    icon: 'check' },
        cancelled: { label: 'Đã hủy',         icon: 'x' },
        delivered: { label: 'Đã giao',        icon: 'truck' },
    };
    function statusBadge(status) {
        const meta = STATUS_META[status] || { label: status || '—', icon: 'help-circle' };
        return `<span class="status-badge status-${status || 'draft'}"><i data-lucide="${meta.icon}"></i> ${meta.label}</span>`;
    }

    function notify(msg, type = 'info') {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type);
        else console.log(`[${type}]`, msg);
    }

    // ---------- Render ----------
    function renderRows() {
        const orders = STATE.orders;
        if (!orders.length) {
            tbody().innerHTML = `<tr><td colspan="10" class="empty-row">
                Không có đơn nào khớp bộ lọc
            </td></tr>`;
            return;
        }
        tbody().innerHTML = orders.map((o) => {
            const fbUserShort = o.fbUserId ? `${o.fbUserId.slice(0, 6)}…${o.fbUserId.slice(-4)}` : '';
            return `
                <tr data-code="${escapeHtml(o.code)}">
                    <td>
                        <span class="code-badge" title="Click để copy" onclick="NativeOrdersApp.copyCode('${escapeHtml(o.code)}')">
                            <i data-lucide="package-open"></i>${escapeHtml(o.code)}
                        </span>
                    </td>
                    <td class="stt-cell">${o.sessionIndex ?? '—'}</td>
                    <td>
                        <div class="cust-name">${escapeHtml(o.customerName || '—')}</div>
                        ${o.fbUserId ? `<div class="cust-fb"><i data-lucide="facebook"></i>${fbUserShort}</div>` : ''}
                    </td>
                    <td class="phone-cell">${escapeHtml(o.phone || '—')}</td>
                    <td>${escapeHtml(o.address || '—')}</td>
                    <td class="note-cell">${escapeHtml(o.note || '—')}</td>
                    <td>${statusBadge(o.status)}</td>
                    <td class="time-cell">
                        ${formatTime(o.createdAt)}
                        <div class="full">${formatFullTime(o.createdAt)}</div>
                    </td>
                    <td>${escapeHtml(o.createdByName || o.createdBy || '—')}</td>
                    <td>
                        <div class="row-actions">
                            <button class="btn-icon" title="Sửa" onclick="NativeOrdersApp.openEdit('${escapeHtml(o.code)}')">
                                <i data-lucide="pencil"></i>
                            </button>
                            <button class="btn-icon" title="Xác nhận" onclick="NativeOrdersApp.quickStatus('${escapeHtml(o.code)}','confirmed')">
                                <i data-lucide="check-circle"></i>
                            </button>
                            <button class="btn-icon" title="Hủy" onclick="NativeOrdersApp.quickStatus('${escapeHtml(o.code)}','cancelled')">
                                <i data-lucide="x-circle"></i>
                            </button>
                            <button class="btn-icon" title="Xóa" onclick="NativeOrdersApp.removeOrder('${escapeHtml(o.code)}')" style="color:#ef4444;">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }).join('');
        if (window.lucide) lucide.createIcons();
    }

    function renderPagination() {
        const totalPages = Math.max(1, Math.ceil(STATE.total / STATE.limit));
        const cur = STATE.page;
        const html = [];
        html.push(`<button class="page-btn" ${cur === 1 ? 'disabled' : ''} onclick="NativeOrdersApp.goPage(${cur - 1})">‹</button>`);
        // Window of 5 pages around current
        const start = Math.max(1, cur - 2);
        const end = Math.min(totalPages, start + 4);
        if (start > 1) {
            html.push(`<button class="page-btn" onclick="NativeOrdersApp.goPage(1)">1</button>`);
            if (start > 2) html.push(`<span class="page-info">…</span>`);
        }
        for (let p = start; p <= end; p++) {
            html.push(`<button class="page-btn ${p === cur ? 'active' : ''}" onclick="NativeOrdersApp.goPage(${p})">${p}</button>`);
        }
        if (end < totalPages) {
            if (end < totalPages - 1) html.push(`<span class="page-info">…</span>`);
            html.push(`<button class="page-btn" onclick="NativeOrdersApp.goPage(${totalPages})">${totalPages}</button>`);
        }
        html.push(`<button class="page-btn" ${cur >= totalPages ? 'disabled' : ''} onclick="NativeOrdersApp.goPage(${cur + 1})">›</button>`);
        html.push(`<span class="page-info">${STATE.total.toLocaleString('vi-VN')} đơn — trang ${cur}/${totalPages}</span>`);
        pag().innerHTML = html.join('');
    }

    function renderCounter() {
        counter().textContent = `${STATE.total.toLocaleString('vi-VN')} đơn`;
    }

    // ---------- Data load ----------
    async function load() {
        if (STATE.loading) return;
        STATE.loading = true;
        tbody().innerHTML = `<tr><td colspan="10" class="loading-row">
            <div class="spinner"></div>Đang tải dữ liệu...
        </td></tr>`;
        try {
            const resp = await window.NativeOrdersApi.list({
                status: STATE.status,
                search: STATE.search || undefined,
                page: STATE.page,
                limit: STATE.limit,
            });
            STATE.orders = resp.orders || [];
            STATE.total = resp.total || 0;
            renderRows();
            renderPagination();
            renderCounter();
        } catch (e) {
            console.error(e);
            tbody().innerHTML = `<tr><td colspan="10" class="empty-row" style="color:#ef4444;">
                Lỗi tải dữ liệu: ${escapeHtml(e.message)}
            </td></tr>`;
            notify('Lỗi tải dữ liệu: ' + e.message, 'error');
        } finally {
            STATE.loading = false;
        }
    }

    // ---------- Filter wiring ----------
    function applyFilters() {
        STATE.search = $('#filterSearch').value.trim();
        STATE.status = $('#filterStatus').value;
        STATE.limit = parseInt($('#filterLimit').value, 10) || 200;
        STATE.page = 1;
        load();
    }
    function clearFilters() {
        $('#filterSearch').value = '';
        $('#filterStatus').value = 'all';
        $('#filterLimit').value = '200';
        STATE.search = '';
        STATE.status = 'all';
        STATE.limit = 200;
        STATE.page = 1;
        load();
    }

    // ---------- Modal (edit) ----------
    function openEdit(code) {
        const o = STATE.orders.find((x) => x.code === code);
        if (!o) return;
        STATE.editingCode = code;
        modalTitle().textContent = `Chỉnh sửa đơn ${code}`;
        modalBody().innerHTML = `
            <div class="field-row">
                <label>Tên khách</label>
                <input id="editCustomerName" value="${escapeHtml(o.customerName || '')}">
            </div>
            <div class="field-row">
                <label>SĐT</label>
                <input id="editPhone" value="${escapeHtml(o.phone || '')}">
            </div>
            <div class="field-row">
                <label>Địa chỉ</label>
                <input id="editAddress" value="${escapeHtml(o.address || '')}">
            </div>
            <div class="field-row">
                <label>Ghi chú</label>
                <textarea id="editNote">${escapeHtml(o.note || '')}</textarea>
            </div>
            <div class="field-row">
                <label>Trạng thái</label>
                <select id="editStatus">
                    ${['draft', 'confirmed', 'cancelled', 'delivered'].map((s) => `
                        <option value="${s}" ${s === o.status ? 'selected' : ''}>${STATUS_META[s].label}</option>
                    `).join('')}
                </select>
            </div>
            <details style="margin-top:12px;">
                <summary style="cursor:pointer;color:var(--gray-600);font-size:12px;">Facebook context (read-only)</summary>
                <div style="margin-top:8px;font-size:11px;color:var(--gray-500);font-family:monospace;line-height:1.6;">
                    fbUserId: ${escapeHtml(o.fbUserId || '—')}<br>
                    fbPageId: ${escapeHtml(o.fbPageId || '—')}<br>
                    fbPostId: ${escapeHtml(o.fbPostId || '—')}<br>
                    fbCommentId: ${escapeHtml(o.fbCommentId || '—')}<br>
                    crmTeamId: ${escapeHtml(o.crmTeamId || '—')}<br>
                    sessionIndex: ${escapeHtml(o.sessionIndex || '—')}<br>
                    source: ${escapeHtml(o.source || 'NATIVE_WEB')}
                </div>
            </details>
        `;
        modal().classList.add('active');
        if (window.lucide) lucide.createIcons();
    }
    function closeEdit() {
        STATE.editingCode = null;
        modal().classList.remove('active');
    }
    async function saveEdit() {
        if (!STATE.editingCode) return;
        const fields = {
            customerName: $('#editCustomerName').value.trim(),
            phone: $('#editPhone').value.trim(),
            address: $('#editAddress').value.trim(),
            note: $('#editNote').value.trim(),
            status: $('#editStatus').value,
        };
        try {
            const resp = await window.NativeOrdersApi.update(STATE.editingCode, fields);
            // Update in-memory list
            const idx = STATE.orders.findIndex((x) => x.code === STATE.editingCode);
            if (idx !== -1 && resp.order) STATE.orders[idx] = resp.order;
            renderRows();
            notify('Đã lưu', 'success');
            closeEdit();
        } catch (e) {
            notify('Lỗi lưu: ' + e.message, 'error');
        }
    }

    async function quickStatus(code, status) {
        try {
            const resp = await window.NativeOrdersApi.update(code, { status });
            const idx = STATE.orders.findIndex((x) => x.code === code);
            if (idx !== -1 && resp.order) STATE.orders[idx] = resp.order;
            renderRows();
            notify(`Đã chuyển sang "${STATUS_META[status]?.label || status}"`, 'success');
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    async function removeOrder(code) {
        if (!confirm(`Xóa đơn ${code}? Hành động không thể hoàn tác.`)) return;
        try {
            await window.NativeOrdersApi.remove(code);
            STATE.orders = STATE.orders.filter((x) => x.code !== code);
            STATE.total = Math.max(0, STATE.total - 1);
            renderRows();
            renderPagination();
            renderCounter();
            notify(`Đã xóa ${code}`, 'success');
        } catch (e) {
            notify('Lỗi xóa: ' + e.message, 'error');
        }
    }

    function copyCode(code) {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(code).then(() => notify(`Đã copy ${code}`, 'success'));
        }
    }

    function goPage(p) {
        const totalPages = Math.max(1, Math.ceil(STATE.total / STATE.limit));
        STATE.page = Math.min(Math.max(1, p), totalPages);
        load();
    }

    // ---------- Init ----------
    function init() {
        if (window.lucide) lucide.createIcons();

        // Filter handlers
        $('#btnApplyFilter')?.addEventListener('click', applyFilters);
        $('#btnClearFilter')?.addEventListener('click', clearFilters);
        $('#btnRefresh')?.addEventListener('click', load);
        $('#filterSearch')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilters(); });
        $('#filterStatus')?.addEventListener('change', applyFilters);
        $('#filterLimit')?.addEventListener('change', applyFilters);

        // Modal handlers
        $('#btnCloseModal')?.addEventListener('click', closeEdit);
        $('#btnCancelEdit')?.addEventListener('click', closeEdit);
        $('#btnSaveEdit')?.addEventListener('click', saveEdit);
        modal()?.addEventListener('click', (e) => { if (e.target === modal()) closeEdit(); });

        // First load
        load();
    }

    // Expose for inline onclicks
    window.NativeOrdersApp = {
        openEdit,
        quickStatus,
        removeOrder,
        copyCode,
        goPage,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
