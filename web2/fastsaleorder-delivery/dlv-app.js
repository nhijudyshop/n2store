// #Note: Delivery Invoice list page — backed by /api/delivery-invoices/*
(function () {
    'use strict';
    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const STATE = { orders: [], total: 0, page: 1, limit: 200, state: '', search: '' };
    const $ = (s) => document.querySelector(s);

    function fmtDate(s) {
        if (window.Web2Format) return window.Web2Format.dateTime(s);
        if (!s) return '';
        const d = new Date(s);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s);
        if (s == null) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }
    function notify(msg, type) {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type || 'info');
        else if (type === 'error') window.Popup.error(msg);
    }
    function w2pConfirm(msg, opts) {
        return window.Popup.confirm(msg, opts);
    }
    function w2pAlert(msg, opts) {
        return window.Popup.alert(msg, opts);
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
        // Skeleton on initial load only (tbody empty / no data rendered yet).
        if (!STATE._loaded) {
            if (window.Web2Skeleton) {
                window.Web2Skeleton.rows('#dlvTbody', { rows: 8, cols: 12 });
            }
        }
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
            STATE._loaded = true;
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
                    <div class="web2-row-actions">
                        <button class="web2-btn web2-btn-primary web2-btn-xs" title="Chi tiết" onclick="DlvApp.detail('${escapeHtml(o.number)}')"><i data-lucide="eye" style="width:12px;height:12px;"></i></button>
                        <button class="web2-btn web2-btn-xs" title="Lịch sử thao tác" onclick="DlvApp.openHistory('${escapeHtml(o.number)}')"><i data-lucide="history" style="width:12px;height:12px;"></i></button>
                        ${o.state === 'pending' ? `<button class="web2-btn web2-btn-success web2-btn-xs" title="Bắt đầu giao" onclick="DlvApp.ship('${escapeHtml(o.number)}')"><i data-lucide="truck" style="width:12px;height:12px;"></i></button>` : ''}
                        ${o.state === 'shipping' ? `<button class="web2-btn web2-btn-success web2-btn-xs" title="Giao thành công" onclick="DlvApp.deliver('${escapeHtml(o.number)}')"><i data-lucide="check-circle" style="width:12px;height:12px;"></i></button>` : ''}
                        ${o.state === 'shipping' ? `<button class="web2-btn web2-btn-warning web2-btn-xs" title="Bị trả" onclick="DlvApp.return_('${escapeHtml(o.number)}')"><i data-lucide="undo-2" style="width:12px;height:12px;"></i></button>` : ''}
                        ${['pending', 'shipping'].includes(o.state) ? `<button class="web2-btn web2-btn-danger web2-btn-xs" title="Hủy" onclick="DlvApp.cancel('${escapeHtml(o.number)}')"><i data-lucide="x-circle" style="width:12px;height:12px;"></i></button>` : ''}
                    </div>
                </td>
                <td class="web2-cell-center"><strong>${o.displayStt ?? ''}</strong></td>
                <td class="web2-cell-center"><strong>${escapeHtml(o.number)}</strong></td>
                <td class="web2-cell-center"><a href="../fastsaleorder-invoice/index.html" class="web2-cell-link">${escapeHtml(o.fso?.number || '')}</a></td>
                <td>${escapeHtml(p.name || '—')}</td>
                <td>${escapeHtml(p.phone || '—')}</td>
                <td>${escapeHtml(c.name || '—')}</td>
                <td><code style="font-size:11px;">${escapeHtml(c.trackingRef || '—')}</code></td>
                <td style="text-align:right;font-weight:600;">${o.totalQuantity}</td>
                <td>${badge(o.state)}</td>
                <td class="web2-cell-center">${fmtDate(o.dateDelivery)}</td>
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
        await w2pAlert(
            `PBH: ${o.fso?.number || '—'}\nKH: ${o.partner.name} — ${o.partner.phone}\nĐịa chỉ: ${o.partner.address || '—'}\nVận chuyển: ${o.carrier.name || '—'}\nTracking: ${o.carrier.trackingRef || '—'}\nSL: ${o.totalQuantity}\nCOD: ${o.cashOnDelivery}đ\nState: ${o.state}\n\nHistory:\n${(o.stateHistory || []).map((h) => `  ${h.from || '∅'} → ${h.to} @ ${new Date(h.at).toLocaleString('vi-VN')}`).join('\n')}`,
            { title: `Phiếu giao ${o.number}`, type: 'info' }
        );
    }
    async function changeState(number, path, label) {
        if (
            !(await w2pConfirm(`${label} phiếu ${number}?`, {
                okText: label,
                type: /hủy/i.test(label) ? 'warning' : 'question',
            }))
        )
            return;
        const row = document.querySelector(`tr[data-number="${CSS.escape(String(number))}"]`);
        const prevOpacity = row?.style.opacity;
        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => prevOpacity,
                apply: () => {
                    if (row) {
                        row.style.opacity = '0.6';
                        row.style.pointerEvents = 'none';
                    }
                },
                run: async () => {
                    const r = await fetch(
                        `${WORKER}/api/delivery-invoices/${encodeURIComponent(number)}/${path}`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(window.Web2Auth?.authHeaders
                                    ? window.Web2Auth.authHeaders()
                                    : {}),
                            },
                            body: JSON.stringify({}),
                        }
                    );
                    const d = await r.json();
                    if (!d.success) throw new Error(d.error || `HTTP ${r.status}`);
                    return d;
                },
                onSuccess: () => load(),
                rollback: (prev) => {
                    if (row) {
                        row.style.opacity = prev || '';
                        row.style.pointerEvents = '';
                    }
                },
                successMsg: label + ' ' + number,
                errLabel: `${label} ${number}`,
            });
        } else {
            const r = await fetch(
                `${WORKER}/api/delivery-invoices/${encodeURIComponent(number)}/${path}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders() : {}),
                    },
                    body: JSON.stringify({}),
                }
            );
            const d = await r.json();
            if (!d.success) return notify('Lỗi: ' + d.error, 'error');
            notify(label + ' ' + number, 'success');
            load();
        }
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
        // 3W4: PbhRealtime (WS) đã gỡ — SSE web2:delivery bên dưới là kênh realtime duy nhất.
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
        // 2026-06-04: SSE realtime web2:delivery — backend delivery-invoices.js
        // _notify create/ship/deliver/return/cancel → tự refresh đa tab/máy.
        if (window.Web2SSE?.subscribe) {
            let _t = null;
            window.Web2SSE.subscribe('web2:delivery', () => {
                clearTimeout(_t);
                _t = setTimeout(load, 600);
            });
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    // 🕘 Lịch sử thao tác — module shared (auto-load qua sidebar). Gọi phòng thủ.
    function openHistory(number) {
        window.Web2AuditLog?.openRecord?.({
            entity: 'delivery-invoice',
            entityId: number,
            title: 'Lịch sử phiếu giao: ' + number,
        });
    }

    window.DlvApp = {
        STATE, // expose FULL dataset cho widget AI (Web2AiPageRegistry) — không chỉ DOM phân trang
        detail,
        openHistory,
        ship: (n) => changeState(n, 'ship', 'Bắt đầu giao'),
        deliver: (n) => changeState(n, 'deliver', 'Giao thành công'),
        return_: (n) => changeState(n, 'return', 'Đánh dấu bị trả'),
        cancel: (n) => changeState(n, 'cancel', 'Hủy'),
        goPage,
    };
})();
