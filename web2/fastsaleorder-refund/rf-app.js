// #Note: Refund list page — backed by /api/refunds/*
(function () {
    'use strict';
    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const STATE = { orders: [], total: 0, page: 1, limit: 200, state: '', search: '' };
    const $ = (s) => document.querySelector(s);

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
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }
    function notify(msg, type) {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type || 'info');
        else if (type === 'error') alert(msg);
    }

    const STATE_META = {
        draft: { label: 'Nháp', cls: 'status-draft', icon: 'file' },
        approved: { label: 'Đã duyệt', cls: 'status-confirmed', icon: 'check' },
        completed: { label: 'Hoàn thành', cls: 'status-delivered', icon: 'check-circle' },
        cancel: { label: 'Đã hủy', cls: 'status-cancelled', icon: 'x' },
    };
    function badge(s) {
        const m = STATE_META[s] || { label: s, cls: '', icon: 'help-circle' };
        return `<span class="status-badge ${m.cls}"><i data-lucide="${m.icon}"></i>${m.label}</span>`;
    }
    const MODE_LABEL = { cash: 'Tiền mặt', wallet: 'Ví', exchange: 'Đổi' };

    async function load() {
        const p = new URLSearchParams();
        if (STATE.search) p.set('search', STATE.search);
        if (STATE.state) p.set('state', STATE.state);
        p.set('page', STATE.page);
        p.set('limit', STATE.limit);
        try {
            const r = await fetch(`${WORKER}/api/refunds/load?${p}`);
            const d = await r.json();
            if (!r.ok || !d.success) throw new Error(d.error || `HTTP ${r.status}`);
            STATE.orders = d.orders || [];
            STATE.total = d.total || 0;
            renderRows();
            renderCounters();
            renderPagination();
        } catch (e) {
            $('#rfTbody').innerHTML =
                `<tr><td colspan="12" class="empty-row"><div class="empty-state empty-state-error"><i data-lucide="alert-triangle" class="empty-state-icon"></i><div class="empty-state-title">Lỗi: ${escapeHtml(e.message)}</div></div></td></tr>`;
            if (window.lucide) lucide.createIcons();
        }
    }
    function renderCounters() {
        $('#rfCounter').textContent = `${STATE.total} phiếu`;
        $('#rfResultCount').textContent = STATE.total;
    }
    function renderRows() {
        if (!STATE.orders.length) {
            const isFiltered = !!(STATE.search || STATE.state);
            const icon = isFiltered ? 'search-x' : 'inbox';
            const title = isFiltered ? 'Không có kết quả phù hợp' : 'Chưa có phiếu trả nào';
            const hint = isFiltered
                ? 'Xoá lọc hoặc thử từ khoá khác.'
                : 'Tạo từ trang PBH bằng nút "Trả hàng".';
            $('#rfTbody').innerHTML =
                `<tr><td colspan="12" class="empty-row"><div class="empty-state"><i data-lucide="${icon}" class="empty-state-icon"></i><div class="empty-state-title">${title}</div><div class="empty-state-hint">${hint}</div></div></td></tr>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        $('#rfTbody').innerHTML = STATE.orders
            .map((o) => {
                const p = o.partner || {};
                return `
            <tr data-number="${escapeHtml(o.number)}">
                <td><input type="checkbox" class="row-check" value="${escapeHtml(o.number)}" /></td>
                <td>
                    <div class="tpos-row-actions">
                        <button class="tpos-btn tpos-btn-primary tpos-btn-xs" title="Chi tiết" onclick="RfApp.detail('${escapeHtml(o.number)}')"><i data-lucide="eye" style="width:12px;height:12px;"></i></button>
                        ${o.state === 'draft' ? `<button class="tpos-btn tpos-btn-success tpos-btn-xs" title="Duyệt" onclick="RfApp.approve('${escapeHtml(o.number)}')"><i data-lucide="check" style="width:12px;height:12px;"></i></button>` : ''}
                        ${o.state === 'approved' ? `<button class="tpos-btn tpos-btn-success tpos-btn-xs" title="Hoàn thành" onclick="RfApp.complete('${escapeHtml(o.number)}')"><i data-lucide="check-circle" style="width:12px;height:12px;"></i></button>` : ''}
                        ${['draft', 'approved'].includes(o.state) ? `<button class="tpos-btn tpos-btn-danger tpos-btn-xs" title="Hủy" onclick="RfApp.cancel('${escapeHtml(o.number)}')"><i data-lucide="x-circle" style="width:12px;height:12px;"></i></button>` : ''}
                    </div>
                </td>
                <td class="tpos-cell-center"><strong>${o.displayStt ?? ''}</strong></td>
                <td class="tpos-cell-center"><strong>${escapeHtml(o.number)}</strong></td>
                <td class="tpos-cell-center"><a href="../fastsaleorder-invoice/index.html" class="web2-cell-link">${escapeHtml(o.fso?.number || '')}</a></td>
                <td>${escapeHtml(p.name || '—')}</td>
                <td>${escapeHtml(p.phone || '—')}</td>
                <td class="tpos-cell-center">${MODE_LABEL[o.refundMode] || o.refundMode}</td>
                <td style="text-align:right;font-weight:600;">${o.totalQuantity}</td>
                <td style="text-align:right;font-weight:600;color:#dc2626;">${fmtMoney(o.amountRefund)}</td>
                <td>${badge(o.state)}</td>
                <td class="tpos-cell-center">${fmtDate(o.dateRefund)}</td>
            </tr>`;
            })
            .join('');
        if (window.lucide) lucide.createIcons();
    }
    function renderPagination() {
        const pages = Math.max(1, Math.ceil(STATE.total / STATE.limit));
        if (pages <= 1) {
            $('#rfPagination').innerHTML =
                `<span class="page-info">${STATE.total} phiếu — trang 1/1</span>`;
            return;
        }
        const cur = STATE.page;
        let html = `<button class="page-btn" ${cur <= 1 ? 'disabled' : ''} onclick="RfApp.goPage(${cur - 1})">‹</button>`;
        for (let i = Math.max(1, cur - 2); i <= Math.min(pages, cur + 2); i++) {
            html += `<button class="page-btn ${i === cur ? 'active' : ''}" onclick="RfApp.goPage(${i})">${i}</button>`;
        }
        html += `<button class="page-btn" ${cur >= pages ? 'disabled' : ''} onclick="RfApp.goPage(${cur + 1})">›</button>`;
        html += `<span class="page-info">${STATE.total} phiếu — trang ${cur}/${pages}</span>`;
        $('#rfPagination').innerHTML = html;
    }

    async function detail(number) {
        const r = await fetch(`${WORKER}/api/refunds/${encodeURIComponent(number)}`);
        const d = await r.json();
        if (!d.success) return notify('Lỗi: ' + d.error, 'error');
        const o = d.order;
        alert(
            `Phiếu ${o.number}\nPBH: ${o.fso.number}\nKH: ${o.partner.name} — ${o.partner.phone}\nMode: ${MODE_LABEL[o.refundMode] || o.refundMode}\nSL trả: ${o.totalQuantity}\nTiền hoàn: ${fmtMoney(o.amountRefund)}\nLý do: ${o.reason || '—'}\nState: ${o.state}\nHistory:\n${(o.stateHistory || []).map((h) => `  ${h.from || '∅'} → ${h.to} @ ${new Date(h.at).toLocaleString('vi-VN')}`).join('\n')}`
        );
    }
    async function changeState(number, path, label) {
        if (!confirm(`${label} phiếu ${number}?`)) return;
        const r = await fetch(`${WORKER}/api/refunds/${encodeURIComponent(number)}/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        const d = await r.json();
        if (!d.success) return notify('Lỗi: ' + d.error, 'error');
        notify(label + ' ' + number, 'success');
        load();
    }

    function applyFilters() {
        STATE.search = $('#rfSearch').value.trim();
        STATE.state = $('#rfState').value;
        STATE.page = 1;
        load();
    }
    function clearFilters() {
        $('#rfSearch').value = '';
        $('#rfState').value = '';
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
                types: ['refund:created', 'refund:approved', 'refund:completed', 'refund:cancel'],
                onEvent: (msg) => {
                    console.log('[RF] realtime reload:', msg.type);
                    load();
                    if (msg.type === 'refund:created') {
                        notify(`🆕 Phiếu trả mới ${msg.order?.number}`, 'info');
                    }
                },
            });
        }
        $('#rfApply').addEventListener('click', applyFilters);
        $('#rfClear').addEventListener('click', clearFilters);
        $('#rfReload').addEventListener('click', load);
        $('#rfSearch').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applyFilters();
        });
        $('#rfState').addEventListener('change', applyFilters);
        $('#rfSearchClear').addEventListener('click', () => {
            $('#rfSearch').value = '';
            STATE.search = '';
            load();
        });
        load();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.RfApp = {
        detail,
        approve: (n) => changeState(n, 'approve', 'Duyệt'),
        complete: (n) => changeState(n, 'complete', 'Hoàn thành'),
        cancel: (n) => changeState(n, 'cancel', 'Hủy'),
        goPage,
    };
})();
