// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// PBH render layer — table rows / pagination / counters + modals (detail,
// customer-360, history-with-timeline). Inline onclick targets PbhApp.* preserved.

(function () {
    'use strict';

    const { WORKER, STATE, $, tbody, fmtMoney, fmtDate, escapeHtml, notify, w2pAlert, stateBadge } =
        window.PbhState;

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
                'display:inline-flex;align-items:center;gap:8px;padding:6px 12px;background:#e8f2ff;color:#004bb5;border:1px solid #bcdcff;border-radius:999px;font-size:12px;font-weight:600;margin:8px 0 12px 0;';
            const infoEl =
                document.querySelector('.search-info') || document.querySelector('.search-section');
            infoEl?.parentNode?.insertBefore(chip, infoEl);
        }
        chip.innerHTML = `
            <i data-lucide="user-circle" style="width:14px;height:14px;color:#0068ff;"></i>
            Đang lọc theo Khách hàng #${STATE.customerId}
            <button onclick="PbhApp.clearCustomerFilter()" title="Bỏ lọc" style="background:transparent;border:none;color:#004bb5;cursor:pointer;font-size:14px;line-height:1;padding:0 0 0 6px;">×</button>`;
        if (window.lucide) lucide.createIcons();
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
                        <div class="web2-row-actions">
                            <button class="web2-btn web2-btn-primary web2-btn-xs" title="Chi tiết" onclick="PbhApp.detail('${escapeHtml(o.number)}')"><i data-lucide="eye" style="width:12px;height:12px;"></i></button>
                            ${o.customerId ? `<button class="web2-btn web2-btn-default web2-btn-xs" title="Khách hàng 360° (id ${o.customerId})" style="color:#0068ff;" onclick="PbhApp.openCustomer(${o.customerId})"><i data-lucide="user-circle" style="width:12px;height:12px;"></i></button>` : ''}
                            ${/* Nút Xác nhận + Hủy đã bỏ — PBH state auto sync theo native-orders.status. Muốn huỷ phải qua native-orders → cancelOrder (huỷ cả đơn + restock). */ ''}
                            <button class="web2-btn web2-btn-default web2-btn-xs" title="Lịch sử PBH (tạo / chỉnh sửa / huỷ)" style="color:#2a96ff;" onclick="PbhApp.openHistory('${escapeHtml(o.number)}')"><i data-lucide="history" style="width:12px;height:12px;"></i></button>
                            <button class="web2-btn web2-btn-default web2-btn-xs" title="In" onclick="PbhApp.print('${escapeHtml(o.number)}')"><i data-lucide="printer" style="width:12px;height:12px;"></i></button>
                            ${o.state !== 'cancel' ? `<button class="web2-btn web2-btn-info web2-btn-xs" title="Tạo phiếu giao" onclick="PbhApp.createDelivery('${escapeHtml(o.number)}')"><i data-lucide="truck" style="width:12px;height:12px;"></i></button>` : ''}
                            ${o.state !== 'cancel' ? `<button class="web2-btn web2-btn-warning web2-btn-xs" title="Trả hàng" onclick="PbhApp.createRefund('${escapeHtml(o.number)}')"><i data-lucide="undo-2" style="width:12px;height:12px;"></i></button>` : ''}
                            ${src.code && src.type === 'native_order' ? `<a class="web2-btn web2-btn-default web2-btn-xs" title="Xem đơn nguồn ${escapeHtml(src.code)}" href="../../native-orders/index.html?search=${encodeURIComponent(src.code)}" target="_blank" style="color:#0ea5e9;"><i data-lucide="external-link" style="width:12px;height:12px;"></i></a>` : ''}
                        </div>
                    </td>
                    <td class="web2-cell-center"><strong>${
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
                    <td class="web2-cell-center"><strong>${escapeHtml(o.number)}</strong></td>
                    <td>${escapeHtml(p.name || '—')}</td>
                    <td>${escapeHtml(p.phone || '—')}</td>
                    <td>${escapeHtml(addr || '—')}</td>
                    <td style="text-align:right;font-weight:600;">${fmtMoney(o.totals?.total)}</td>
                    <td>${stateBadge(o.state)}</td>
                    <td>${src.code ? `<a href="../../native-orders/index.html#${escapeHtml(src.code)}" class="web2-cell-link">${escapeHtml(src.code)}</a>` : '<em style="color:#9ca3af">Manual</em>'}</td>
                    <td class="web2-cell-center">${fmtDate(o.dateInvoice)}</td>
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
                        <button id="c360FilterBtn" class="web2-btn web2-btn-default web2-btn-sm" style="color:#0068ff;" title="Lọc tất cả PBH của khách này">
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
            filterBtn.onclick = () => window.PbhFilters.filterByCustomer(customerId);
        }
        modal.style.display = 'flex';
        const body = modal.querySelector('#c360Body');
        const title = modal.querySelector('#c360Title');
        title.textContent = `Khách hàng #${customerId} — Đơn web + PBH`;
        body.innerHTML = '<div style="color:#6b7280;">Đang tải aggregation…</div>';
        try {
            // 2026-06-01: Web 2.0 aggregate endpoint (native + PBH + refunds) thay cho
            // legacy /api/v2/customers/:id/orders (chỉ native + PBH, không refund).
            const r = await fetch(`${WORKER}/api/web2/customer-orders/${customerId}?limit=20`);
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
                    <div style="background:#e8f2ff;color:#004bb5;padding:10px 14px;border-radius:8px;flex:1;min-width:140px;">
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

    // ─── PBH history modal ────────────────────────────────────────
    async function openHistory(pbhNumber) {
        document.querySelectorAll('.pbh-history-modal').forEach((el) => el.remove());
        const m = document.createElement('div');
        m.className = 'pbh-history-modal';
        m.innerHTML = `
            <div class="pbh-history-box">
                <div class="pbh-history-head">
                    <i data-lucide="history" style="width:18px;height:18px;"></i>
                    <div style="flex:1;min-width:0;">
                        <strong style="display:block;font-size:14px;">Lịch sử PBH ${escapeHtml(pbhNumber)}</strong>
                        <span style="font-size:11px;opacity:.85;">Tạo, chỉnh sửa, huỷ — đầy đủ chi tiết</span>
                    </div>
                    <button class="pbh-history-close">×</button>
                </div>
                <div class="pbh-history-body" id="pbhHistList">
                    <div class="pbh-history-loading">Đang tải...</div>
                </div>
            </div>`;
        document.body.appendChild(m);
        m.querySelector('.pbh-history-close').onclick = () => m.remove();
        m.addEventListener('click', (e) => {
            if (e.target === m) m.remove();
        });
        if (window.lucide) lucide.createIcons();

        try {
            const r = await fetch(
                `${WORKER}/api/fast-sale-orders/${encodeURIComponent(pbhNumber)}/history?limit=100`
            );
            const data = await r.json();
            const list = data?.history || [];
            const listEl = m.querySelector('#pbhHistList');
            if (!list.length) {
                listEl.innerHTML =
                    '<div class="pbh-history-empty">Chưa có lịch sử (PBH có thể được tạo trước khi bật audit log).</div>';
                return;
            }
            const actionMeta = {
                'create-from-native': {
                    label: 'Tạo từ native-order',
                    color: '#16a34a',
                    icon: 'plus-circle',
                },
                create: { label: 'Tạo mới', color: '#16a34a', icon: 'plus-circle' },
                cancel: { label: 'Huỷ', color: '#dc2626', icon: 'x-octagon' },
                update: { label: 'Cập nhật', color: '#3b82f6', icon: 'pencil' },
                print: { label: 'In', color: '#2a96ff', icon: 'printer' },
            };
            listEl.innerHTML = list
                .map((h) => {
                    const am = actionMeta[h.action] || {
                        label: h.action,
                        color: '#64748b',
                        icon: 'circle',
                    };
                    const time = new Date(h.createdAt).toLocaleString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    });
                    // XSS fix (2026-06-11): userName/userId là input client-supplied
                    // (header x-user-name) → PHẢI escape trước khi vào innerHTML.
                    const user =
                        h.userName || h.userId
                            ? escapeHtml(h.userName || h.userId)
                            : '<em>không rõ</em>';
                    const src = h.sourcePage
                        ? `<span class="pbh-hist-source">${escapeHtml(h.sourcePage)}</span>`
                        : '';

                    // Render changes — products list cho create, prevState+reason cho cancel
                    let body = '';
                    const c = h.changes || {};
                    if (h.action === 'create-from-native' && Array.isArray(c.products)) {
                        body =
                            `<div style="font-size:12px;color:#475569;margin-bottom:6px;">Đơn nguồn: <strong>${escapeHtml(c.sourceCode || '?')}</strong> · STT-split: ${c.splitIndex || 1} · Tổng: <strong>${(Number(c.totalAmount) || 0).toLocaleString('vi-VN')}đ</strong></div>` +
                            '<table class="pbh-hist-prod"><thead><tr><th>SP</th><th>Mã</th><th class="num">SL</th><th class="num">Giá</th></tr></thead><tbody>' +
                            c.products
                                .map(
                                    (p) =>
                                        `<tr><td>${escapeHtml(p.name || '?')}</td><td><code>${escapeHtml(p.code || '?')}</code></td><td class="num">${p.qty}</td><td class="num">${(Number(p.priceUnit) || 0).toLocaleString('vi-VN')}đ</td></tr>`
                                )
                                .join('') +
                            '</tbody></table>';
                    } else if (h.action === 'cancel') {
                        body = `<div class="pbh-hist-field">Trạng thái trước: <span class="pbh-hist-before">${escapeHtml(c.prevState || '?')}</span> → <span class="pbh-hist-after">cancel</span></div>${c.reason ? `<div class="pbh-hist-field">Lý do: <em>${escapeHtml(c.reason)}</em></div>` : ''}${c.restoredLines ? `<div class="pbh-hist-field">Restock: ${c.restoredLines} dòng</div>` : ''}${Array.isArray(c.nativeSync) ? `<div class="pbh-hist-field">Sync native: ${c.nativeSync.join(', ')}</div>` : ''}`;
                    } else {
                        body = `<pre class="pbh-hist-raw">${escapeHtml(JSON.stringify(c, null, 2).slice(0, 1000))}</pre>`;
                    }

                    return `<div class="pbh-hist-entry">
                        <div class="pbh-hist-marker" style="background:${am.color}20;color:${am.color};">
                            <i data-lucide="${am.icon}" style="width:14px;height:14px;"></i>
                        </div>
                        <div class="pbh-hist-content">
                            <div class="pbh-hist-meta">
                                <strong style="color:${am.color};">${am.label}</strong>
                                <span class="pbh-hist-user"><i data-lucide="user" style="width:10px;height:10px;"></i>${user}</span>
                                ${src}
                                <span class="pbh-hist-time">${time}</span>
                            </div>
                            <div class="pbh-hist-body">${body}</div>
                        </div>
                    </div>`;
                })
                .join('');
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            m.querySelector('#pbhHistList').innerHTML =
                `<div class="pbh-history-empty" style="color:#dc2626;">Lỗi: ${escapeHtml(e.message)}</div>`;
        }
    }

    // Inject CSS cho history modal (page không có file css riêng nên inline).
    function injectHistoryCss() {
        if (document.getElementById('pbhHistoryCss')) return;
        const s = document.createElement('style');
        s.id = 'pbhHistoryCss';
        s.textContent = `
            .pbh-history-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9500;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow:auto;}
            .pbh-history-box{background:#fff;border-radius:14px;width:min(780px,100%);max-height:calc(100vh - 80px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,.25);}
            .pbh-history-head{padding:14px 20px;background:linear-gradient(135deg,#2a96ff,#2a96ff);color:#fff;display:flex;align-items:center;gap:10px;}
            .pbh-history-close{margin-left:auto;background:rgba(255,255,255,.2);border:0;color:#fff;width:28px;height:28px;border-radius:7px;cursor:pointer;font-size:18px;line-height:1;}
            .pbh-history-close:hover{background:rgba(255,255,255,.35);}
            .pbh-history-body{padding:12px 0;overflow:auto;flex:1;}
            .pbh-history-loading,.pbh-history-empty{text-align:center;color:#94a3b8;padding:40px 20px;font-size:13px;}
            .pbh-hist-entry{display:flex;gap:12px;padding:14px 20px;border-bottom:1px solid #f1f5f9;}
            .pbh-hist-entry:last-child{border-bottom:0;}
            .pbh-hist-marker{flex-shrink:0;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;}
            .pbh-hist-content{flex:1;min-width:0;}
            .pbh-hist-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12px;color:#475569;}
            .pbh-hist-meta strong{font-size:13px;}
            .pbh-hist-user{display:inline-flex;align-items:center;gap:4px;background:#f1f5f9;padding:2px 8px;border-radius:999px;color:#475569;font-weight:500;}
            .pbh-hist-source{background:#e8f2ff;color:#0058da;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:.4px;}
            .pbh-hist-time{margin-left:auto;font-size:11px;color:#94a3b8;}
            .pbh-hist-body{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:12px;}
            .pbh-hist-field{margin:3px 0;color:#475569;}
            .pbh-hist-before{background:#fef2f2;color:#b91c1c;padding:1px 6px;border-radius:4px;text-decoration:line-through;}
            .pbh-hist-after{background:#f0fdf4;color:#15803d;padding:1px 6px;border-radius:4px;font-weight:600;}
            .pbh-hist-raw{margin:0;font-family:ui-monospace,monospace;font-size:11px;color:#475569;white-space:pre-wrap;word-break:break-all;}
            .pbh-hist-prod{width:100%;border-collapse:collapse;font-size:11px;}
            .pbh-hist-prod th,.pbh-hist-prod td{padding:4px 6px;border-bottom:1px solid #e2e8f0;text-align:left;}
            .pbh-hist-prod th{background:#f1f5f9;color:#475569;font-weight:600;}
            .pbh-hist-prod .num{text-align:right;}
            .pbh-hist-prod code{font-size:10px;background:#fff;padding:1px 4px;border-radius:3px;color:#0068ff;}
        `;
        document.head.appendChild(s);
    }

    window.PbhRender = {
        renderCounters,
        renderCustomerChip,
        renderRows,
        renderPagination,
        detail,
        openCustomer,
        openHistory,
        injectHistoryCss,
    };
})();
