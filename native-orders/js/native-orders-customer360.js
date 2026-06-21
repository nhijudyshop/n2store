// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — Customer 360 modal (openCustomer). MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    NO.openCustomer = async function openCustomer(customerId) {
        if (!customerId) return;
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
                        <button id="c360FilterBtn" class="web2-btn web2-btn-default web2-btn-sm" style="color:#0068ff;" title="Lọc tất cả đơn web của khách này">
                            <i data-lucide="filter" style="width:12px;height:12px;"></i> Lọc đơn
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
        const filterBtn = modal.querySelector('#c360FilterBtn');
        if (filterBtn) filterBtn.onclick = () => NO.filterByCustomer(customerId);
        modal.style.display = 'flex';
        const body = modal.querySelector('#c360Body');
        const title = modal.querySelector('#c360Title');
        title.textContent = `Khách hàng #${customerId} — Đơn web + PBH`;
        body.innerHTML = '<div style="color:#6b7280;">Đang tải aggregation…</div>';
        const money = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
        try {
            // 2026-06-01: Web 2.0 aggregate (native + PBH + refunds) thay legacy.
            // Backend shape: {success, native:[], pbh:[], refund:[],
            //   totals:{native:{count,amount}, pbh:{count,amount}, refund:{count,amount}, net},
            //   summary:{totalNative, totalNativeAmount, totalPbh, totalPbhAmount, ...},
            //   orders:[{source,number,date,state,totalAmount,itemCount}]}.
            // Items trong native[]/pbh[] có shape: {source, number, date, state,
            //   totalAmount, itemCount} — KHÔNG có .code (PBH dùng .number, đơn web cũng dùng .number).
            // 2026-06-02 fix: cũ đọc summary.native.count → undefined → "Cannot read
            // properties of undefined" — chuyển sang totals.native.count + tổng item shape.
            const r = await fetch(
                `${NO.WORKER_URL}/api/web2/customer-orders/${customerId}?limit=20`,
                { headers: window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders() : {} }
            );
            const data = await r.json();
            if (!data?.success) throw new Error(data?.error || `HTTP ${r.status}`);
            const native = Array.isArray(data.native) ? data.native : [];
            const pbh = Array.isArray(data.pbh) ? data.pbh : [];
            const totals = data.totals || {};
            const nativeTotal = totals.native || { count: native.length, amount: 0 };
            const pbhTotal = totals.pbh || { count: pbh.length, amount: 0 };
            const refundTotal = totals.refund || { count: 0, amount: 0 };
            const renderRow = (label, items) => `
                <div style="margin-bottom:14px;">
                    <div style="font-weight:600;margin-bottom:6px;color:#111827;">${label} (${items.length})</div>
                    ${
                        items.length === 0
                            ? '<div style="color:#9ca3af;font-style:italic;">Không có đơn</div>'
                            : `<table style="width:100%;border-collapse:collapse;font-size:12px;">
                                <thead><tr style="background:#f9fafb;text-align:left;">
                                    <th style="padding:6px 8px;">Mã</th>
                                    <th style="padding:6px 8px;">SL SP</th>
                                    <th style="padding:6px 8px;text-align:right;">Tổng</th>
                                    <th style="padding:6px 8px;">Trạng thái</th>
                                    <th style="padding:6px 8px;">Ngày</th>
                                </tr></thead>
                                <tbody>
                                ${items
                                    .slice(0, 10)
                                    .map(
                                        (it) => `<tr style="border-top:1px solid #e5e7eb;">
                                            <td style="padding:6px 8px;font-weight:600;">${NO.escapeHtml(it.number || it.code || '—')}</td>
                                            <td style="padding:6px 8px;">${it.itemCount ?? it.totalQuantity ?? '—'}</td>
                                            <td style="padding:6px 8px;text-align:right;">${money(it.totalAmount ?? it.amountTotal ?? 0)}</td>
                                            <td style="padding:6px 8px;">${NO.escapeHtml(it.state || it.status || '—')}</td>
                                            <td style="padding:6px 8px;color:#6b7280;">${it.date ? new Date(it.date).toLocaleDateString('vi-VN') : '—'}</td>
                                        </tr>`
                                    )
                                    .join('')}
                                </tbody>
                            </table>`
                    }
                </div>`;
            const refundBlock =
                refundTotal.count > 0
                    ? `<div style="background:#fee2e2;color:#991b1b;padding:10px 14px;border-radius:8px;flex:1;min-width:140px;">
                       <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Trả hàng</div>
                       <div style="font-size:18px;font-weight:700;">${refundTotal.count}</div>
                       <div style="font-size:11px;">${money(refundTotal.amount)}</div>
                   </div>`
                    : '';
            body.innerHTML = `
                <div style="display:flex;gap:14px;margin-bottom:16px;flex-wrap:wrap;">
                    <div style="background:#e8f2ff;color:#004bb5;padding:10px 14px;border-radius:8px;flex:1;min-width:140px;">
                        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Đơn web (NW)</div>
                        <div style="font-size:18px;font-weight:700;">${nativeTotal.count}</div>
                        <div style="font-size:11px;">${money(nativeTotal.amount)}</div>
                    </div>
                    <div style="background:#dbeafe;color:#1e40af;padding:10px 14px;border-radius:8px;flex:1;min-width:140px;">
                        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Phiếu bán hàng (HD)</div>
                        <div style="font-size:18px;font-weight:700;">${pbhTotal.count}</div>
                        <div style="font-size:11px;">${money(pbhTotal.amount)}</div>
                    </div>
                    ${refundBlock}
                </div>
                ${renderRow('Đơn web', native)}
                ${renderRow('PBH', pbh)}
            `;
        } catch (e) {
            body.innerHTML = `<div style="color:#dc2626;">Lỗi tải dữ liệu: ${NO.escapeHtml(e.message)}</div>`;
        }
    };
})();
