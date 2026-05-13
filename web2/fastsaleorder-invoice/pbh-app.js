// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// PBH (Fast Sale Orders) — list/filter/state/print/cancel/delete.
// Backed by /api/fast-sale-orders/* (Render Postgres).

(function () {
    'use strict';

    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const STATE = { orders: [], total: 0, page: 1, limit: 200, state: '', search: '' };

    const $ = (s) => document.querySelector(s);
    const tbody = () => $('#pbhTbody');

    function fmtMoney(n) {
        return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    }
    function fmtDate(s) {
        if (!s) return '';
        const d = new Date(s);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }
    function notify(msg, type) {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type || 'info');
        else if (type === 'error') alert(msg);
        else console.log('[pbh]', msg);
    }

    const STATE_META = {
        draft: { label: 'Nháp', cls: 'status-draft', icon: 'file' },
        confirmed: { label: 'Đã XN', cls: 'status-confirmed', icon: 'check' },
        done: { label: 'Hoàn thành', cls: 'status-delivered', icon: 'check-circle' },
        cancel: { label: 'Đã hủy', cls: 'status-cancelled', icon: 'x' },
    };

    function stateBadge(s) {
        const m = STATE_META[s] || { label: s || '—', cls: '', icon: 'help-circle' };
        return `<span class="status-badge ${m.cls}"><i data-lucide="${m.icon}"></i>${m.label}</span>`;
    }

    async function load() {
        const params = new URLSearchParams();
        if (STATE.search) params.set('search', STATE.search);
        if (STATE.state) params.set('state', STATE.state);
        params.set('page', STATE.page);
        params.set('limit', STATE.limit);
        try {
            const r = await fetch(`${WORKER}/api/fast-sale-orders/load?${params}`);
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
            STATE.orders = data.orders || [];
            STATE.total = data.total || 0;
            renderRows();
            renderCounters();
            renderPagination();
        } catch (e) {
            tbody().innerHTML = `<tr><td colspan="11" class="empty-row"><div class="empty-state empty-state-error"><i data-lucide="alert-triangle" class="empty-state-icon"></i><div class="empty-state-title">Lỗi tải dữ liệu</div><div class="empty-state-hint">${escapeHtml(e.message)}</div></div></td></tr>`;
            if (window.lucide) lucide.createIcons();
            console.error(e);
        }
    }

    function renderCounters() {
        $('#pbhCounter').textContent = `${STATE.total} PBH`;
        $('#pbhResultCount').textContent = STATE.total;
    }

    function renderRows() {
        if (!STATE.orders.length) {
            const isFiltered = !!(STATE.search || STATE.state);
            const icon = isFiltered ? 'search-x' : 'inbox';
            const title = isFiltered ? 'Không có kết quả phù hợp' : 'Chưa có PBH nào';
            const hint = isFiltered
                ? 'Xoá lọc hoặc thử từ khoá khác.'
                : 'Tạo PBH bằng cách bấm nút "Tạo PBH" trên trang Đơn Web.';
            tbody().innerHTML = `<tr><td colspan="11" class="empty-row"><div class="empty-state"><i data-lucide="${icon}" class="empty-state-icon"></i><div class="empty-state-title">${title}</div><div class="empty-state-hint">${hint}</div></div></td></tr>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        tbody().innerHTML = STATE.orders
            .map((o) => {
                const p = o.partner || {};
                const src = o.sourceLink || {};
                const addr = [
                    p.address,
                    o.addressDetail?.wardName,
                    o.addressDetail?.districtName,
                    o.addressDetail?.cityName,
                ]
                    .filter(Boolean)
                    .join(', ');
                return `
                <tr data-number="${escapeHtml(o.number)}">
                    <td><input type="checkbox" class="row-check" value="${escapeHtml(o.number)}" /></td>
                    <td>
                        <div class="tpos-row-actions">
                            <button class="tpos-btn tpos-btn-primary tpos-btn-xs" title="Chi tiết" onclick="PbhApp.detail('${escapeHtml(o.number)}')"><i data-lucide="eye" style="width:12px;height:12px;"></i></button>
                            ${o.state === 'draft' ? `<button class="tpos-btn tpos-btn-success tpos-btn-xs" title="Xác nhận" onclick="PbhApp.confirm('${escapeHtml(o.number)}')"><i data-lucide="check" style="width:12px;height:12px;"></i></button>` : ''}
                            ${o.state !== 'cancel' ? `<button class="tpos-btn tpos-btn-warning tpos-btn-xs" title="Hủy" onclick="PbhApp.cancel('${escapeHtml(o.number)}')"><i data-lucide="x-circle" style="width:12px;height:12px;"></i></button>` : ''}
                            <button class="tpos-btn tpos-btn-default tpos-btn-xs" title="In" onclick="PbhApp.print('${escapeHtml(o.number)}')"><i data-lucide="printer" style="width:12px;height:12px;"></i></button>
                            ${o.state !== 'cancel' ? `<button class="tpos-btn tpos-btn-info tpos-btn-xs" title="Tạo phiếu giao" onclick="PbhApp.createDelivery('${escapeHtml(o.number)}')"><i data-lucide="truck" style="width:12px;height:12px;"></i></button>` : ''}
                            ${o.state !== 'cancel' ? `<button class="tpos-btn tpos-btn-warning tpos-btn-xs" title="Trả hàng" onclick="PbhApp.createRefund('${escapeHtml(o.number)}')"><i data-lucide="undo-2" style="width:12px;height:12px;"></i></button>` : ''}
                        </div>
                    </td>
                    <td class="tpos-cell-center"><strong>${o.displayStt ?? ''}</strong></td>
                    <td class="tpos-cell-center"><strong>${escapeHtml(o.number)}</strong></td>
                    <td>${escapeHtml(p.name || '—')}</td>
                    <td>${escapeHtml(p.phone || '—')}</td>
                    <td>${escapeHtml(addr || '—')}</td>
                    <td style="text-align:right;font-weight:600;">${fmtMoney(o.totals?.total)}</td>
                    <td>${stateBadge(o.state)}</td>
                    <td>${src.code ? `<a href="../../native-orders/index.html#${escapeHtml(src.code)}" class="web2-cell-link">${escapeHtml(src.code)}</a>` : '<em style="color:#9ca3af">Manual</em>'}</td>
                    <td class="tpos-cell-center">${fmtDate(o.dateInvoice)}</td>
                </tr>`;
            })
            .join('');
        if (window.lucide) lucide.createIcons();
    }

    function renderPagination() {
        const pages = Math.max(1, Math.ceil(STATE.total / STATE.limit));
        if (pages <= 1) {
            $('#pbhPagination').innerHTML =
                `<span class="page-info">${STATE.total} bản ghi — trang 1/1</span>`;
            return;
        }
        const cur = STATE.page;
        let html = `<button class="page-btn" ${cur <= 1 ? 'disabled' : ''} onclick="PbhApp.goPage(${cur - 1})">‹</button>`;
        const start = Math.max(1, cur - 2);
        const end = Math.min(pages, cur + 2);
        for (let i = start; i <= end; i++) {
            html += `<button class="page-btn ${i === cur ? 'active' : ''}" onclick="PbhApp.goPage(${i})">${i}</button>`;
        }
        html += `<button class="page-btn" ${cur >= pages ? 'disabled' : ''} onclick="PbhApp.goPage(${cur + 1})">›</button>`;
        html += `<span class="page-info">${STATE.total} PBH — trang ${cur}/${pages}</span>`;
        $('#pbhPagination').innerHTML = html;
    }

    async function detail(number) {
        try {
            const r = await fetch(`${WORKER}/api/fast-sale-orders/${encodeURIComponent(number)}`);
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
            const o = data.order;
            const linesHtml =
                (o.orderLines || [])
                    .map(
                        (l, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td>${escapeHtml(l.productCode || '')}</td>
                    <td>${escapeHtml(l.productName || '')}</td>
                    <td style="text-align:right">${l.quantity}</td>
                    <td style="text-align:right">${fmtMoney(l.priceUnit)}</td>
                    <td style="text-align:right">${fmtMoney((Number(l.quantity) || 0) * (Number(l.priceUnit) || 0))}</td>
                </tr>
            `
                    )
                    .join('') ||
                '<tr><td colspan="6" style="text-align:center;color:#9ca3af">Không có dòng nào</td></tr>';

            alert(
                `PBH ${o.number}\n\n` +
                    `KH: ${o.partner.name} — ${o.partner.phone}\n` +
                    `Địa chỉ: ${o.partner.address || '—'}\n` +
                    `Trạng thái: ${o.state}\n\n` +
                    `Tổng SL: ${o.totals.quantity}\n` +
                    `Tổng tiền: ${fmtMoney(o.totals.total)}\n` +
                    `Đã thanh toán: ${fmtMoney(o.payment.amount)}\n` +
                    `Còn nợ: ${fmtMoney(o.payment.residual)}\n\n` +
                    `Số dòng SP: ${(o.orderLines || []).length}\n` +
                    `In: ${o.printCount} lần\n` +
                    `Đơn nguồn: ${o.sourceLink.code || '(Manual)'}`
            );
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    async function confirmOrder(number) {
        if (!confirm(`Xác nhận PBH ${number}?`)) return;
        const r = await fetch(
            `${WORKER}/api/fast-sale-orders/${encodeURIComponent(number)}/confirm`,
            { method: 'POST' }
        );
        const data = await r.json();
        if (!r.ok || !data.success) return notify('Lỗi: ' + (data.error || r.status), 'error');
        notify('Đã xác nhận ' + number, 'success');
        load();
    }
    async function cancelOrder(number) {
        if (!confirm(`Hủy PBH ${number}?`)) return;
        const r = await fetch(
            `${WORKER}/api/fast-sale-orders/${encodeURIComponent(number)}/cancel`,
            { method: 'POST' }
        );
        const data = await r.json();
        if (!r.ok || !data.success) return notify('Lỗi: ' + (data.error || r.status), 'error');
        notify('Đã hủy ' + number, 'success');
        load();
    }
    function printOrder(number) {
        // Open print page in popup; page tự fetch detail + auto-call /print API
        const url = `print.html?number=${encodeURIComponent(number)}`;
        const w = window.open(url, `pbh_print_${number}`, 'width=900,height=1000');
        if (!w) notify('Trình duyệt chặn popup — hãy cho phép', 'warning');
        // Reload list sau 3s để print_count cập nhật
        setTimeout(() => load(), 3000);
    }

    async function createDelivery(number) {
        if (!confirm(`Tạo Phiếu Giao Hàng từ ${number}?`)) return;
        try {
            const r = await fetch(`${WORKER}/api/delivery-invoices/from-pbh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pbhNumber: number }),
            });
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
            notify(`Đã tạo phiếu giao ${data.order.number}`, 'success');
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }
    async function createRefund(number) {
        const reason = prompt(`Tạo phiếu trả hàng từ ${number}\n\nLý do trả?`, 'Khách đổi/trả');
        if (!reason) return;
        try {
            const r = await fetch(`${WORKER}/api/refunds/from-pbh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pbhNumber: number, reason, refundMode: 'cash' }),
            });
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
            notify(`Đã tạo refund ${data.order.number}`, 'success');
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    function exportCsv() {
        const p = new URLSearchParams();
        if (STATE.search) p.set('search', STATE.search);
        if (STATE.state) p.set('state', STATE.state);
        const url = `${WORKER}/api/fast-sale-orders/export?${p}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        a.remove();
        notify('Đang tải Excel...', 'info');
    }

    // -------- Bulk actions --------
    function getSelectedNumbers() {
        return Array.from(document.querySelectorAll('#pbhTbody .row-check:checked')).map(
            (c) => c.value
        );
    }
    function updateBulkBar() {
        const sel = getSelectedNumbers();
        const bar = $('#pbhBulkBar');
        if (sel.length === 0) {
            bar.style.display = 'none';
        } else {
            bar.style.display = 'flex';
            $('#pbhBulkCount').textContent = sel.length;
        }
    }
    async function bulkAction(endpoint, label) {
        const numbers = getSelectedNumbers();
        if (!numbers.length) return;
        if (!confirm(`${label} ${numbers.length} đơn?`)) return;
        try {
            const r = await fetch(`${WORKER}/api/fast-sale-orders/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numbers }),
            });
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
            notify(`${label}: ${data.changed}/${data.requested} đơn`, 'success');
            // Uncheck check-all + reload
            const ca = $('#pbhCheckAll');
            if (ca) ca.checked = false;
            updateBulkBar();
            load();
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }
    function unselectAll() {
        document.querySelectorAll('#pbhTbody .row-check:checked').forEach((c) => {
            c.checked = false;
        });
        const ca = $('#pbhCheckAll');
        if (ca) ca.checked = false;
        updateBulkBar();
    }

    async function resetStt() {
        const renumber = confirm(
            'Reset STT — OK để renumber tất cả PBH theo ngày HĐ. Cancel để chỉ reset bộ đếm.'
        );
        try {
            const r = await fetch(`${WORKER}/api/fast-sale-orders/reset-stt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ renumber }),
            });
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || r.status);
            notify(
                data.mode === 'renumber'
                    ? `Đã renumber ${data.renumbered} PBH`
                    : 'Đã reset bộ đếm — PBH mới từ 1',
                'success'
            );
            load();
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    function applyFilters() {
        STATE.search = $('#pbhSearch').value.trim();
        STATE.state = $('#pbhState').value;
        STATE.limit = parseInt($('#pbhLimit').value, 10) || 200;
        STATE.page = 1;
        load();
    }
    function clearFilters() {
        $('#pbhSearch').value = '';
        $('#pbhState').value = '';
        STATE.search = '';
        STATE.state = '';
        STATE.page = 1;
        load();
    }
    function goPage(p) {
        STATE.page = Math.max(1, p);
        load();
    }

    function init() {
        if (window.lucide) lucide.createIcons();
        // Realtime auto-refresh khi có PBH mới hoặc state đổi
        if (window.PbhRealtime) {
            window.PbhRealtime.subscribe({
                types: ['pbh:created', 'pbh:cancelled', 'pbh:confirmed', 'pbh:printed'],
                onEvent: (msg) => {
                    console.log('[PBH] realtime reload:', msg.type);
                    load();
                    if (msg.type === 'pbh:created') {
                        notify(
                            `🆕 PBH mới ${msg.order?.number} (${msg.order?.partner?.name})`,
                            'info'
                        );
                    }
                },
            });
        }
        $('#pbhExportCsv').addEventListener('click', exportCsv);
        $('#pbhBulkConfirm').addEventListener('click', () =>
            bulkAction('bulk-confirm', 'Xác nhận')
        );
        $('#pbhBulkCancel').addEventListener('click', () => bulkAction('bulk-cancel', 'Hủy'));
        $('#pbhBulkUnselect').addEventListener('click', unselectAll);
        // Check-all + per-row check delegation
        $('#pbhCheckAll')?.addEventListener('change', (e) => {
            document.querySelectorAll('#pbhTbody .row-check').forEach((c) => {
                c.checked = e.target.checked;
            });
            updateBulkBar();
        });
        document.addEventListener('change', (e) => {
            if (e.target.classList?.contains('row-check')) updateBulkBar();
        });
        $('#pbhApply').addEventListener('click', applyFilters);
        $('#pbhClear').addEventListener('click', clearFilters);
        $('#pbhReload').addEventListener('click', load);
        $('#pbhResetStt').addEventListener('click', resetStt);
        $('#pbhSearch').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applyFilters();
        });
        $('#pbhSearchClear').addEventListener('click', () => {
            $('#pbhSearch').value = '';
            STATE.search = '';
            STATE.page = 1;
            load();
        });
        $('#pbhState').addEventListener('change', applyFilters);
        $('#pbhLimit').addEventListener('change', applyFilters);
        load();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.PbhApp = {
        detail,
        confirm: confirmOrder,
        cancel: cancelOrder,
        print: printOrder,
        goPage,
        resetStt,
        createDelivery,
        createRefund,
    };
})();
