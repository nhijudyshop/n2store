// #Note: Delivery Invoice list page — backed by /api/delivery-invoices/*
(function () {
    'use strict';
    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const STATE = { orders: [], total: 0, page: 1, limit: 200, state: '', search: '' };
    const $ = (s) => document.querySelector(s);

    function fmtDate(s) {
        if (!s) return '';
        const d = new Date(s);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    function escapeHtml(s) {
        if (s == null) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }
    function notify(msg, type) {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type || 'info');
        else if (type === 'error') alert(msg);
    }

    const STATE_META = {
        pending: { label: 'Chờ giao', cls: 'status-draft', icon: 'clock' },
        shipping: { label: 'Đang giao', cls: 'status-confirmed', icon: 'truck' },
        delivered: { label: 'Đã giao', cls: 'status-delivered', icon: 'check-circle' },
        returned: { label: 'Bị trả', cls: 'status-cancelled', icon: 'undo-2' },
        cancel: { label: 'Đã hủy', cls: 'status-cancelled', icon: 'x' },
    };
    function badge(s) {
        const m = STATE_META[s] || { label: s, cls: '', icon: 'help-circle' };
        return `<span class="status-badge ${m.cls}"><i data-lucide="${m.icon}"></i>${m.label}</span>`;
    }

    async function load() {
        const p = new URLSearchParams();
        if (STATE.search) p.set('search', STATE.search);
        if (STATE.state) p.set('state', STATE.state);
        p.set('page', STATE.page);
        p.set('limit', STATE.limit);
        try {
            const r = await fetch(`${WORKER}/api/delivery-invoices/load?${p}`);
            const d = await r.json();
            if (!r.ok || !d.success) throw new Error(d.error || `HTTP ${r.status}`);
            STATE.orders = d.orders || [];
            STATE.total = d.total || 0;
            renderRows();
            renderCounters();
            renderPagination();
        } catch (e) {
            $('#dlvTbody').innerHTML =
                `<tr><td colspan="12" class="empty-row"><div class="empty-state empty-state-error"><i data-lucide="alert-triangle" class="empty-state-icon"></i><div class="empty-state-title">Lỗi: ${escapeHtml(e.message)}</div></div></td></tr>`;
            if (window.lucide) lucide.createIcons();
        }
    }
    function renderCounters() {
        $('#dlvCounter').textContent = `${STATE.total} phiếu`;
        $('#dlvResultCount').textContent = STATE.total;
    }
    function renderRows() {
        if (!STATE.orders.length) {
            const isFiltered = !!(STATE.search || STATE.state);
            const icon = isFiltered ? 'search-x' : 'inbox';
            const title = isFiltered ? 'Không có kết quả phù hợp' : 'Chưa có phiếu giao nào';
            const hint = isFiltered
                ? 'Xoá lọc hoặc thử từ khoá khác.'
                : 'Tạo từ trang PBH bằng nút "Tạo phiếu giao".';
            $('#dlvTbody').innerHTML =
                `<tr><td colspan="12" class="empty-row"><div class="empty-state"><i data-lucide="${icon}" class="empty-state-icon"></i><div class="empty-state-title">${title}</div><div class="empty-state-hint">${hint}</div></div></td></tr>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        $('#dlvTbody').innerHTML = STATE.orders
            .map((o) => {
                const p = o.partner || {};
                const c = o.carrier || {};
                return `
            <tr data-number="${escapeHtml(o.number)}">
                <td><input type="checkbox" class="row-check" value="${escapeHtml(o.number)}" /></td>
                <td>
                    <div class="tpos-row-actions">
                        <button class="tpos-btn tpos-btn-primary tpos-btn-xs" title="Chi tiết" onclick="DlvApp.detail('${escapeHtml(o.number)}')"><i data-lucide="eye" style="width:12px;height:12px;"></i></button>
                        ${o.state === 'pending' ? `<button class="tpos-btn tpos-btn-success tpos-btn-xs" title="Bắt đầu giao" onclick="DlvApp.ship('${escapeHtml(o.number)}')"><i data-lucide="truck" style="width:12px;height:12px;"></i></button>` : ''}
                        ${o.state === 'shipping' ? `<button class="tpos-btn tpos-btn-success tpos-btn-xs" title="Giao thành công" onclick="DlvApp.deliver('${escapeHtml(o.number)}')"><i data-lucide="check-circle" style="width:12px;height:12px;"></i></button>` : ''}
                        ${o.state === 'shipping' ? `<button class="tpos-btn tpos-btn-warning tpos-btn-xs" title="Bị trả" onclick="DlvApp.return_('${escapeHtml(o.number)}')"><i data-lucide="undo-2" style="width:12px;height:12px;"></i></button>` : ''}
                        ${['pending', 'shipping'].includes(o.state) ? `<button class="tpos-btn tpos-btn-danger tpos-btn-xs" title="Hủy" onclick="DlvApp.cancel('${escapeHtml(o.number)}')"><i data-lucide="x-circle" style="width:12px;height:12px;"></i></button>` : ''}
                    </div>
                </td>
                <td class="tpos-cell-center"><strong>${o.displayStt ?? ''}</strong></td>
                <td class="tpos-cell-center"><strong>${escapeHtml(o.number)}</strong></td>
                <td class="tpos-cell-center"><a href="../fastsaleorder-invoice/index.html" class="web2-cell-link">${escapeHtml(o.fso?.number || '')}</a></td>
                <td>${escapeHtml(p.name || '—')}</td>
                <td>${escapeHtml(p.phone || '—')}</td>
                <td>${escapeHtml(c.name || '—')}</td>
                <td><code style="font-size:11px;">${escapeHtml(c.trackingRef || '—')}</code></td>
                <td style="text-align:right;font-weight:600;">${o.totalQuantity}</td>
                <td>${badge(o.state)}</td>
                <td class="tpos-cell-center">${fmtDate(o.dateDelivery)}</td>
            </tr>`;
            })
            .join('');
        if (window.lucide) lucide.createIcons();
    }
    function renderPagination() {
        const pages = Math.max(1, Math.ceil(STATE.total / STATE.limit));
        if (pages <= 1) {
            $('#dlvPagination').innerHTML =
                `<span class="page-info">${STATE.total} phiếu — trang 1/1</span>`;
            return;
        }
        const cur = STATE.page;
        let html = `<button class="page-btn" ${cur <= 1 ? 'disabled' : ''} onclick="DlvApp.goPage(${cur - 1})">‹</button>`;
        for (let i = Math.max(1, cur - 2); i <= Math.min(pages, cur + 2); i++) {
            html += `<button class="page-btn ${i === cur ? 'active' : ''}" onclick="DlvApp.goPage(${i})">${i}</button>`;
        }
        html += `<button class="page-btn" ${cur >= pages ? 'disabled' : ''} onclick="DlvApp.goPage(${cur + 1})">›</button>`;
        html += `<span class="page-info">${STATE.total} phiếu — trang ${cur}/${pages}</span>`;
        $('#dlvPagination').innerHTML = html;
    }

    async function detail(number) {
        const r = await fetch(`${WORKER}/api/delivery-invoices/${encodeURIComponent(number)}`);
        const d = await r.json();
        if (!d.success) return notify('Lỗi: ' + d.error, 'error');
        const o = d.order;
        alert(
            `Phiếu ${o.number}\nPBH: ${o.fso.number}\nKH: ${o.partner.name} — ${o.partner.phone}\nĐịa chỉ: ${o.partner.address || '—'}\nVận chuyển: ${o.carrier.name || '—'}\nTracking: ${o.carrier.trackingRef || '—'}\nSL: ${o.totalQuantity}\nCOD: ${o.cashOnDelivery}đ\nState: ${o.state}\nHistory:\n${(o.stateHistory || []).map((h) => `  ${h.from || '∅'} → ${h.to} @ ${new Date(h.at).toLocaleString('vi-VN')}`).join('\n')}`
        );
    }
    async function changeState(number, path, label) {
        if (!confirm(`${label} phiếu ${number}?`)) return;
        const r = await fetch(
            `${WORKER}/api/delivery-invoices/${encodeURIComponent(number)}/${path}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            }
        );
        const d = await r.json();
        if (!d.success) return notify('Lỗi: ' + d.error, 'error');
        notify(label + ' ' + number, 'success');
        load();
    }

    function applyFilters() {
        STATE.search = $('#dlvSearch').value.trim();
        STATE.state = $('#dlvState').value;
        STATE.page = 1;
        load();
    }
    function clearFilters() {
        $('#dlvSearch').value = '';
        $('#dlvState').value = '';
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
        if (window.PbhRealtime) {
            window.PbhRealtime.subscribe({
                types: [
                    'delivery:created',
                    'delivery:shipping',
                    'delivery:delivered',
                    'delivery:returned',
                    'delivery:cancel',
                ],
                onEvent: (msg) => {
                    console.log('[DLV] realtime reload:', msg.type);
                    load();
                    if (msg.type === 'delivery:created') {
                        notify(`🆕 Phiếu giao mới ${msg.order?.number}`, 'info');
                    }
                },
            });
        }
        $('#dlvApply').addEventListener('click', applyFilters);
        $('#dlvClear').addEventListener('click', clearFilters);
        $('#dlvReload').addEventListener('click', load);
        $('#dlvSearch').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applyFilters();
        });
        $('#dlvState').addEventListener('change', applyFilters);
        $('#dlvSearchClear').addEventListener('click', () => {
            $('#dlvSearch').value = '';
            STATE.search = '';
            load();
        });
        load();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.DlvApp = {
        detail,
        ship: (n) => changeState(n, 'ship', 'Bắt đầu giao'),
        deliver: (n) => changeState(n, 'deliver', 'Giao thành công'),
        return_: (n) => changeState(n, 'return', 'Đánh dấu bị trả'),
        cancel: (n) => changeState(n, 'cancel', 'Hủy'),
        goPage,
    };
})();
