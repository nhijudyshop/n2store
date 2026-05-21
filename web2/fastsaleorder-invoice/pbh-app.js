// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// PBH (Fast Sale Orders) — list/filter/state/print/cancel/delete.
// Backed by /api/fast-sale-orders/* (Render Postgres).

(function () {
    'use strict';

    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const STATE = {
        orders: [],
        total: 0,
        page: 1,
        limit: 200,
        state: '',
        search: '',
        // Phase 14: scope list to a single Customer 360 record (parsed from URL on init)
        customerId: null,
    };

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
        else if (type === 'error' && window.Popup) window.Popup.error(msg);
        else if (type === 'error') alert(msg);
        else console.log('[pbh]', msg);
    }
    // Promise-based confirm/alert/prompt helpers (graceful fallback to native).
    function w2pConfirm(msg, opts) {
        return window.Popup ? window.Popup.confirm(msg, opts) : Promise.resolve(confirm(msg));
    }
    function w2pAlert(msg, opts) {
        if (window.Popup) return window.Popup.alert(msg, opts);
        alert(msg);
        return Promise.resolve();
    }
    function w2pPrompt(msg, opts) {
        if (window.Popup) return window.Popup.prompt(msg, opts);
        return Promise.resolve(prompt(msg, opts?.defaultValue || ''));
    }

    // Model 2-state đơn giản: 'done' (Hoàn thành) + 'cancel' (Đã hủy).
    // Legacy 'draft'/'confirmed' từ row cũ vẫn render label cùng style với 'done'
    // để bảng không vỡ trong khi data migrate. Tab filter chỉ còn 2 option.
    const STATE_META = {
        draft: { label: 'Hoàn thành', cls: 'status-delivered', icon: 'check-circle' },
        confirmed: { label: 'Hoàn thành', cls: 'status-delivered', icon: 'check-circle' },
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
        if (STATE.customerId) params.set('customerId', String(STATE.customerId));
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
            renderCustomerChip();
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

    // Phase 14: show a chip when filtering by Customer 360 id; click X to clear.
    function renderCustomerChip() {
        let chip = document.getElementById('pbhCustomerChip');
        if (!STATE.customerId) {
            if (chip) chip.remove();
            return;
        }
        if (!chip) {
            chip = document.createElement('div');
            chip.id = 'pbhCustomerChip';
            chip.style.cssText =
                'display:inline-flex;align-items:center;gap:8px;padding:6px 12px;background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd;border-radius:999px;font-size:12px;font-weight:600;margin:8px 0 12px 0;';
            const infoEl =
                document.querySelector('.search-info') || document.querySelector('.search-section');
            infoEl?.parentNode?.insertBefore(chip, infoEl);
        }
        chip.innerHTML = `
            <i data-lucide="user-circle" style="width:14px;height:14px;color:#7c3aed;"></i>
            Đang lọc theo Khách hàng #${STATE.customerId}
            <button onclick="PbhApp.clearCustomerFilter()" title="Bỏ lọc" style="background:transparent;border:none;color:#5b21b6;cursor:pointer;font-size:14px;line-height:1;padding:0 0 0 6px;">×</button>`;
        if (window.lucide) lucide.createIcons();
    }

    function filterByCustomer(customerId) {
        if (!customerId) return;
        STATE.customerId = Number(customerId);
        STATE.page = 1;
        // Persist in URL so reload keeps the filter
        const url = new URL(location.href);
        url.searchParams.set('customerId', String(customerId));
        history.replaceState(null, '', url.toString());
        // Close modal if open
        const modal = document.getElementById('customer360Modal');
        if (modal) modal.style.display = 'none';
        load();
    }

    function clearCustomerFilter() {
        STATE.customerId = null;
        STATE.page = 1;
        const url = new URL(location.href);
        url.searchParams.delete('customerId');
        history.replaceState(null, '', url.toString());
        load();
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
                            ${o.customerId ? `<button class="tpos-btn tpos-btn-default tpos-btn-xs" title="Khách hàng 360° (id ${o.customerId})" style="color:#7c3aed;" onclick="PbhApp.openCustomer(${o.customerId})"><i data-lucide="user-circle" style="width:12px;height:12px;"></i></button>` : ''}
                            ${/* Nút Xác nhận đã bỏ — PBH state auto sync theo native-orders.status */ ''}
                            ${o.state !== 'cancel' ? `<button class="tpos-btn tpos-btn-warning tpos-btn-xs" title="Hủy" onclick="PbhApp.cancel('${escapeHtml(o.number)}')"><i data-lucide="x-circle" style="width:12px;height:12px;"></i></button>` : ''}
                            <button class="tpos-btn tpos-btn-default tpos-btn-xs" title="In" onclick="PbhApp.print('${escapeHtml(o.number)}')"><i data-lucide="printer" style="width:12px;height:12px;"></i></button>
                            ${o.state !== 'cancel' ? `<button class="tpos-btn tpos-btn-info tpos-btn-xs" title="Tạo phiếu giao" onclick="PbhApp.createDelivery('${escapeHtml(o.number)}')"><i data-lucide="truck" style="width:12px;height:12px;"></i></button>` : ''}
                            ${o.state !== 'cancel' ? `<button class="tpos-btn tpos-btn-warning tpos-btn-xs" title="Trả hàng" onclick="PbhApp.createRefund('${escapeHtml(o.number)}')"><i data-lucide="undo-2" style="width:12px;height:12px;"></i></button>` : ''}
                            ${src.code && src.type === 'native_order' ? `<a class="tpos-btn tpos-btn-default tpos-btn-xs" title="Xem đơn nguồn ${escapeHtml(src.code)}" href="../../native-orders/index.html?search=${encodeURIComponent(src.code)}" target="_blank" style="color:#0ea5e9;"><i data-lucide="external-link" style="width:12px;height:12px;"></i></a>` : ''}
                        </div>
                    </td>
                    <td class="tpos-cell-center"><strong>${
                        Array.isArray(o.mergedDisplayStt) && o.mergedDisplayStt.length > 1
                            ? o.mergedDisplayStt
                                  .map((n) => parseInt(n, 10))
                                  .filter(Number.isFinite)
                                  .sort((a, b) => a - b)
                                  .join(' + ')
                            : o.splitIndex && o.splitIndex > 1
                              ? `${o.displayStt}-${o.splitIndex}`
                              : (o.displayStt ?? '')
                    }</strong></td>
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

            await w2pAlert(
                `KH: ${o.partner.name} — ${o.partner.phone}\n` +
                    `Địa chỉ: ${o.partner.address || '—'}\n` +
                    `Trạng thái: ${o.state}\n\n` +
                    `Tổng SL: ${o.totals.quantity}\n` +
                    `Tổng tiền: ${fmtMoney(o.totals.total)}\n` +
                    `Đã thanh toán: ${fmtMoney(o.payment.amount)}\n` +
                    `Còn nợ: ${fmtMoney(o.payment.residual)}\n\n` +
                    `Số dòng SP: ${(o.orderLines || []).length}\n` +
                    `In: ${o.printCount} lần\n` +
                    `Đơn nguồn: ${o.sourceLink.code || '(Manual)'}`,
                { title: `Phiếu bán hàng ${o.number}`, type: 'info' }
            );
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    async function confirmOrder(number) {
        if (!(await w2pConfirm(`Xác nhận PBH ${number}?`, { okText: 'Xác nhận' }))) return;
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
        if (
            !(await w2pConfirm(`Hủy PBH ${number}?`, {
                type: 'warning',
                okText: 'Hủy đơn',
                cancelText: 'Đóng',
            }))
        )
            return;
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
        if (
            !(await w2pConfirm(`Tạo Phiếu Giao Hàng từ ${number}?`, {
                okText: 'Tạo phiếu giao',
                type: 'info',
            }))
        )
            return;
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
    async function openCustomer(customerId) {
        if (!customerId) return;
        // Build a tiny modal showing aggregation from /api/v2/customers/:id/orders
        let modal = document.getElementById('customer360Modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'customer360Modal';
            modal.style.cssText =
                'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto;';
            modal.innerHTML = `
                <div style="background:#fff;border-radius:10px;max-width:760px;width:100%;padding:0;box-shadow:0 16px 48px rgba(0,0,0,0.15);">
                    <div style="padding:14px 18px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <strong id="c360Title" style="font-size:14px;color:#1f2937;flex:1;">Khách hàng 360°</strong>
                        <button id="c360FilterBtn" class="tpos-btn tpos-btn-default tpos-btn-sm" style="color:#7c3aed;" title="Lọc tất cả PBH của khách này">
                            <i data-lucide="filter" style="width:12px;height:12px;"></i> Lọc PBH
                        </button>
                        <button id="c360Close" style="background:transparent;border:none;font-size:18px;cursor:pointer;color:#6b7280;">×</button>
                    </div>
                    <div id="c360Body" style="padding:16px;font-size:13px;color:#374151;">Đang tải…</div>
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.style.display = 'none';
            });
            modal.querySelector('#c360Close').addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
        // Wire/refresh filter button to current customerId
        const filterBtn = modal.querySelector('#c360FilterBtn');
        if (filterBtn) {
            filterBtn.onclick = () => filterByCustomer(customerId);
        }
        modal.style.display = 'flex';
        const body = modal.querySelector('#c360Body');
        const title = modal.querySelector('#c360Title');
        title.textContent = `Khách hàng #${customerId} — Đơn web + PBH`;
        body.innerHTML = '<div style="color:#6b7280;">Đang tải aggregation…</div>';
        try {
            const r = await fetch(`${WORKER}/api/v2/customers/${customerId}/orders?limit=20`);
            const data = await r.json();
            if (!data?.success) throw new Error(data?.error || `HTTP ${r.status}`);
            const { native, pbh, summary } = data;
            const renderRow = (label, items, codeKey, totalKey, stateKey) => `
                <div style="margin-bottom:14px;">
                    <div style="font-weight:600;margin-bottom:6px;color:#111827;">${label} (${items.length})</div>
                    ${
                        items.length === 0
                            ? '<div style="color:#9ca3af;font-style:italic;">Không có đơn</div>'
                            : `<table style="width:100%;border-collapse:collapse;font-size:12px;">
                                <thead><tr style="background:#f9fafb;text-align:left;">
                                    <th style="padding:6px 8px;">Mã</th>
                                    <th style="padding:6px 8px;">SP</th>
                                    <th style="padding:6px 8px;text-align:right;">Tổng</th>
                                    <th style="padding:6px 8px;">Trạng thái</th>
                                    <th style="padding:6px 8px;">Chiến dịch</th>
                                </tr></thead>
                                <tbody>
                                ${items
                                    .slice(0, 10)
                                    .map(
                                        (it) => `<tr style="border-top:1px solid #e5e7eb;">
                                            <td style="padding:6px 8px;font-weight:600;">${escapeHtml(it[codeKey])}</td>
                                            <td style="padding:6px 8px;">${it.totalQuantity ?? '—'}</td>
                                            <td style="padding:6px 8px;text-align:right;">${fmtMoney(it[totalKey])}</td>
                                            <td style="padding:6px 8px;">${escapeHtml(it[stateKey] || '—')}</td>
                                            <td style="padding:6px 8px;color:#6b7280;">${escapeHtml(it.liveCampaign?.name || '—')}</td>
                                        </tr>`
                                    )
                                    .join('')}
                                </tbody>
                            </table>`
                    }
                </div>`;
            body.innerHTML = `
                <div style="display:flex;gap:14px;margin-bottom:16px;flex-wrap:wrap;">
                    <div style="background:#ede9fe;color:#5b21b6;padding:10px 14px;border-radius:8px;flex:1;min-width:140px;">
                        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Đơn web (NW)</div>
                        <div style="font-size:18px;font-weight:700;">${summary.native.count}</div>
                        <div style="font-size:11px;">${fmtMoney(summary.native.totalAmount)}</div>
                    </div>
                    <div style="background:#dbeafe;color:#1e40af;padding:10px 14px;border-radius:8px;flex:1;min-width:140px;">
                        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Phiếu bán hàng (HD)</div>
                        <div style="font-size:18px;font-weight:700;">${summary.pbh.count}</div>
                        <div style="font-size:11px;">${fmtMoney(summary.pbh.totalAmount)}</div>
                    </div>
                </div>
                ${renderRow('Đơn web', native, 'code', 'totalAmount', 'status')}
                ${renderRow('PBH', pbh, 'number', 'amountTotal', 'state')}
            `;
        } catch (e) {
            body.innerHTML = `<div style="color:#dc2626;">Lỗi tải dữ liệu: ${escapeHtml(e.message)}</div>`;
        }
    }

    async function createRefund(number) {
        const reason = await w2pPrompt(`Lý do trả hàng?`, {
            title: `Tạo phiếu trả từ ${number}`,
            defaultValue: 'Khách đổi/trả',
            placeholder: 'Nhập lý do (vd: hàng lỗi, sai size)',
            okText: 'Tạo refund',
            type: 'warning',
        });
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
        if (STATE.customerId) p.set('customerId', String(STATE.customerId));
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
        const isCancel = /hủy/i.test(label);
        if (
            !(await w2pConfirm(`${label} ${numbers.length} đơn?`, {
                okText: label,
                type: isCancel ? 'warning' : 'question',
            }))
        )
            return;
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

    // Gộp 2+ PBH cùng KH → 1 PBH mới với STT hiển thị "1 + 2"
    async function bulkMerge() {
        const numbers = getSelectedNumbers();
        if (numbers.length < 2) {
            notify('Cần chọn ít nhất 2 PBH để gộp', 'warning');
            return;
        }
        // Client-side preflight validation: same phone + all draft
        const selected = STATE.orders.filter((o) => numbers.includes(o.number));
        const phones = new Set(selected.map((o) => o.partner?.phone || ''));
        if (phones.size > 1) {
            notify(
                `Phải cùng SĐT khách. Đang có ${phones.size} SĐT: ${Array.from(phones).join(', ')}`,
                'error'
            );
            return;
        }
        const nonDraft = selected.filter((o) => o.state !== 'draft');
        if (nonDraft.length) {
            notify(
                `Chỉ gộp được PBH trạng thái "draft". Đơn không hợp lệ: ${nonDraft.map((o) => o.number).join(', ')}`,
                'error'
            );
            return;
        }
        const phone = Array.from(phones)[0] || '';
        const customerName = selected[0]?.partner?.name || '';
        const stts = selected
            .map((o) => Number(o.displayStt) || 0)
            .filter(Boolean)
            .sort((a, b) => a - b);
        if (
            !(await w2pConfirm(
                `Gộp ${numbers.length} PBH của KH ${customerName} (${phone})?\n\n` +
                    `STT sẽ hiển thị: "${stts.join(' + ')}"\n` +
                    `Các PBH gốc (${numbers.join(', ')}) sẽ bị xóa và thay bằng 1 PBH mới.`,
                { okText: 'Gộp đơn', type: 'warning' }
            ))
        )
            return;
        try {
            const r = await fetch(`${WORKER}/api/fast-sale-orders/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numbers }),
            });
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
            notify(
                `✅ Đã gộp thành PBH ${data.order.number} (STT ${data.mergedStts.join(' + ')})`,
                'success'
            );
            const ca = $('#pbhCheckAll');
            if (ca) ca.checked = false;
            updateBulkBar();
            load();
        } catch (e) {
            notify('Lỗi gộp đơn: ' + e.message, 'error');
        }
    }

    // In thermal 80mm tất cả PBH đang chọn (1 popup, page-break giữa)
    async function bulkPrint() {
        const numbers = getSelectedNumbers();
        if (!numbers.length) {
            notify('Chưa chọn PBH nào để in', 'warning');
            return;
        }
        if (!window.Web2Bill) {
            notify('Web2Bill chưa load — kiểm tra script', 'error');
            return;
        }
        try {
            // Fetch detail PBH theo numbers (load endpoint chỉ trả summary, cần GET /:number)
            const detailed = await Promise.all(
                numbers.map(async (num) => {
                    const r = await fetch(`${WORKER}/api/fast-sale-orders/${num}`);
                    const d = await r.json();
                    return d.order || null;
                })
            );
            const valid = detailed.filter(Boolean);
            if (!valid.length) {
                notify('Không lấy được data PBH', 'error');
                return;
            }
            if (valid.length === 1) {
                window.Web2Bill.openPrint(valid[0]);
            } else {
                window.Web2Bill.openCombinedPrint(valid);
            }
            notify(`Đang in ${valid.length} PBH...`, 'info');
        } catch (e) {
            notify('Lỗi in bill: ' + e.message, 'error');
        }
    }

    async function resetStt() {
        const renumber = await w2pConfirm(
            'OK để renumber TẤT CẢ PBH theo ngày HĐ.\nHuỷ để chỉ reset bộ đếm (PBH cũ giữ STT).',
            {
                title: 'Reset STT',
                type: 'warning',
                okText: 'Renumber tất cả',
                cancelText: 'Chỉ reset bộ đếm',
            }
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
        // Phase 14: read customerId from URL search params on load
        const urlParams = new URLSearchParams(location.search);
        const urlCid = parseInt(urlParams.get('customerId'), 10);
        if (Number.isFinite(urlCid)) STATE.customerId = urlCid;
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
        // Bulk-confirm: bỏ — PBH state auto theo native-orders. Hide nút trong DOM nếu tồn tại.
        const bcBtn = $('#pbhBulkConfirm');
        if (bcBtn) bcBtn.style.display = 'none';
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
        openCustomer,
        filterByCustomer,
        clearCustomerFilter,
    };
})();
