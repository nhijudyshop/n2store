// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// purchase-refund-render.js — Section B (DS phiếu + chi tiết read-only) +
// Section A (hàng nhận từ Sổ Order, group theo ĐƠN NCC+shipment).
// renderSourceList lưu SOURCE_STATE.groups theo index cho modal trả-cả-đơn.

(function () {
    'use strict';

    const PR = (window.PurchaseRefund = window.PurchaseRefund || {});
    const { STATUS_LABEL, REASON_LABEL, REFUND_METHOD_LABEL } = PR.const;
    const { STATE, SOURCE_STATE } = PR.state;
    const {
        $,
        notify,
        fmtMoney,
        fmtDate,
        escapeHtml,
        thumbHtml,
        _orderGroupKey,
        _orderGroupLabel,
        parseProducts,
    } = PR.util;

    // ---------- Section B: DS phiếu + chi tiết ----------
    function applyFilters(items) {
        const s = STATE.search.trim().toLowerCase();
        const st = STATE.filterStatus;
        return items.filter((it) => {
            if (st && (it.status || 'draft') !== st) return false;
            if (s) {
                const hay =
                    `${it.code} ${it.name} ${it.supplierName || ''} ${it.supplierCode || ''} ${it.reason || ''}`.toLowerCase();
                if (!hay.includes(s)) return false;
            }
            return true;
        });
    }

    function renderList() {
        const items = applyFilters(STATE.items);
        $('prListCount').textContent = `${items.length} phiếu`;
        const ul = $('prList');
        const empty = $('prEmpty');
        if (!items.length) {
            ul.innerHTML = '';
            empty.hidden = false;
            return;
        }
        empty.hidden = true;
        ul.innerHTML = items
            .map((it) => {
                const sel = it.code === STATE.selected?.code ? 'is-selected' : '';
                const status = it.status || 'draft';
                return `
                <li class="${sel}" data-code="${escapeHtml(it.code)}">
                    <div class="pr-li-row1">
                        <span class="pr-li-code">${escapeHtml(it.code)}</span>
                        <span class="pr-status-badge pr-status-${status}">${STATUS_LABEL[status] || status}</span>
                    </div>
                    <div class="pr-li-supplier">${escapeHtml(it.supplierName || it.supplierCode || '—')}</div>
                    <div class="pr-li-row2">
                        <span>${escapeHtml(it.name || '')}</span>
                        <span>${fmtMoney(it.totalAmount)}</span>
                    </div>
                </li>
            `;
            })
            .join('');
        ul.querySelectorAll('li').forEach((li) => {
            li.addEventListener('click', () => selectRefund(li.dataset.code));
        });
        if (window.lucide) window.lucide.createIcons();
    }

    function selectRefund(code) {
        STATE.selected = STATE.items.find((x) => x.code === code) || null;
        renderList();
        renderDetail();
    }

    function renderDetail() {
        const detail = $('prDetail');
        const empty = $('prDetailEmpty');
        if (!STATE.selected) {
            detail.hidden = true;
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';
        detail.hidden = false;
        const r = STATE.selected;
        const status = r.status || 'draft';
        const products = parseProducts(r.products);

        // P1 2026-05-30: bỏ tất cả action buttons (Duyệt/NCC từ chối/Sửa/
        // Hủy duyệt/Hoàn tiền). User ask "trả → xác nhận là trả luôn" —
        // quick refund đã auto-create + auto-approve + trừ kho + ghi ví NCC
        // atomic. Detail view CHỈ HIỂN THỊ thông tin + lịch sử (read-only).
        // Phiếu đã chốt khi tạo → không cần state machine UI nữa.
        const actions = [];
        if (false) {
            actions.push(
                `<button class="btn btn-secondary btn-sm" data-action="view-only" disabled>Đã chốt — không sửa được</button>`
            );
        }

        detail.innerHTML = `
            <div class="pr-detail-head">
                <div>
                    <h2>${escapeHtml(r.name || '')}</h2>
                    <div style="color:#64748b;font-size:13px;margin-top:2px">${escapeHtml(r.code)}</div>
                </div>
                <span class="pr-status-badge pr-status-${status}">${STATUS_LABEL[status] || status}</span>
            </div>
            <div class="pr-detail-grid">
                <div><strong>NCC:</strong> ${escapeHtml(r.supplierName || '—')}</div>
                <div><strong>Mã NCC:</strong> ${escapeHtml(r.supplierCode || '—')}</div>
                <div><strong>SĐT NCC:</strong> ${escapeHtml(r.supplierPhone || '—')}</div>
                <div><strong>Sổ Order gốc:</strong> ${
                    r.sourcePurchaseCode
                        ? `<a href="../../so-order/index.html?code=${encodeURIComponent(r.sourcePurchaseCode)}" target="_blank" style="color:#3b82f6;text-decoration:none;">${escapeHtml(r.sourcePurchaseCode)}</a>`
                        : '—'
                }</div>
                <div><strong>Ngày trả:</strong> ${escapeHtml(r.refundDate || '—')}</div>
                <div><strong>Lý do:</strong> ${escapeHtml(REASON_LABEL[r.reason] || r.reason || '—')}</div>
                <div><strong>Tổng SL:</strong> ${Number(r.totalQty || 0)}</div>
                <div><strong>Tổng tiền:</strong> ${fmtMoney(r.totalAmount)}</div>
                <div><strong>Phương thức hoàn:</strong> ${escapeHtml(REFUND_METHOD_LABEL[r.refundMethod] || r.refundMethod || '—')}</div>
                <div><strong>Đã trừ kho:</strong> ${r.stock_deducted ? '✓ Yes' : '— No'}</div>
                ${r.approved_at ? `<div><strong>Duyệt lúc:</strong> ${new Date(r.approved_at).toLocaleString('vi-VN')}</div>` : ''}
                ${r.refunded_at ? `<div><strong>Hoàn tiền lúc:</strong> ${new Date(r.refunded_at).toLocaleString('vi-VN')}</div>` : ''}
                ${r.rejected_at ? `<div><strong>Từ chối lúc:</strong> ${new Date(r.rejected_at).toLocaleString('vi-VN')}</div>` : ''}
                ${r.note ? `<div style="grid-column:1/-1"><strong>Ghi chú:</strong> ${escapeHtml(r.note)}</div>` : ''}
                ${r.approved_note ? `<div style="grid-column:1/-1"><strong>Ghi chú duyệt:</strong> ${escapeHtml(r.approved_note)}</div>` : ''}
                ${r.rejected_reason ? `<div style="grid-column:1/-1"><strong>Lý do từ chối:</strong> ${escapeHtml(r.rejected_reason)}</div>` : ''}
            </div>

            ${
                products.length > 0
                    ? `
            <div class="pr-products">
                <h3>Danh sách SP trả (${products.length})</h3>
                <table>
                    <thead><tr>
                        <th>Mã SP</th><th>Tên SP</th>
                        <th class="num">SL</th><th class="num">Giá</th><th class="num">Thành tiền</th>
                    </tr></thead>
                    <tbody>
                        ${products
                            .map(
                                (p) => `<tr>
                            <td><code>${escapeHtml(p.code || '')}</code></td>
                            <td>${escapeHtml(p.name || '')}</td>
                            <td class="num">${Number(p.qty || 0)}</td>
                            <td class="num">${fmtMoney(p.price)}</td>
                            <td class="num">${fmtMoney(Number(p.qty || 0) * Number(p.price || 0))}</td>
                        </tr>`
                            )
                            .join('')}
                    </tbody>
                </table>
            </div>`
                    : '<div class="pr-empty" style="padding:16px;background:#fef3c7;color:#92400e;border-radius:8px;margin-top:14px">⚠️ Phiếu chưa có SP — không thể duyệt (cần thêm SP để trừ tồn).</div>'
            }

            <div class="pr-detail-actions">${actions.join('')}</div>

            ${
                window.Web2HistoryTimeline?.render
                    ? window.Web2HistoryTimeline.render(r.history)
                    : ''
            }
        `;

        detail.querySelectorAll('[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => PR.actions.handleAction(btn.dataset.action));
        });
        if (window.lucide) window.lucide.createIcons();
    }

    // ---------- Section A: Hàng nhận từ Sổ Order (main UI) ----------
    //
    // P1 2026-05-30: user ask "đâu cần tạo phiếu mới — purchase-refund SẼ CÓ
    // DANH SÁCH nhận hàng từ so-order → trả hàng confirm, nhớ logic SL +
    // tiền ví NCC". Page giờ auto load so-order items khi init, render section
    // A. User click "Trả NCC" trên 1 row → quick modal → submit:
    //   1) POST /create với prefilled single product line
    //   2) POST /:code/approve (trừ stock idempotent)
    //   3) SupplierWalletStorage.addTransaction type='return' (giảm balance NCC)
    //   4) Push wallet → Firestore
    //   5) Reload section A + section B

    async function loadSourceItems() {
        if (!window.Web2ProductsCache) {
            notify('Web2ProductsCache chưa load — refresh trang', 'error');
            return;
        }
        try {
            await window.Web2ProductsCache.init();
        } catch (e) {
            notify(`Tải kho SP: ${e.message}`, 'error');
        }
        const { items, err } = await PR.api.loadSoOrderReceivedItems();
        if (err) notify(`Tải Sổ Order: ${err}`, 'warning');
        SOURCE_STATE.items = items;
        SOURCE_STATE.loaded = true;

        // Populate supplier dropdown distinct
        const suppliers = Array.from(new Set(items.map((it) => it.supplier))).sort();
        const sel = $('prSourceSupplier');
        sel.innerHTML =
            '<option value="">Tất cả NCC</option>' +
            suppliers
                .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
                .join('');
        if (SOURCE_STATE.supplierFilter) sel.value = SOURCE_STATE.supplierFilter;

        renderSourceList();
    }

    function renderSourceList() {
        const q = SOURCE_STATE.search.trim().toLowerCase();
        const filtered = SOURCE_STATE.items.filter((it) => {
            if (SOURCE_STATE.supplierFilter && it.supplier !== SOURCE_STATE.supplierFilter)
                return false;
            if (q) {
                const hay =
                    `${it.code} ${it.name} ${it.variant || ''} ${it.supplier}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        $('prSourceCount').textContent = `${filtered.length} SP`;
        const listEl = $('prSourceList');
        const emptyEl = $('prSourceEmpty');
        if (!filtered.length) {
            listEl.innerHTML = '';
            emptyEl.hidden = false;
            return;
        }
        emptyEl.hidden = true;

        // Group by ĐƠN (NCC + shipment/đợt) — tách đơn khác nhau dù cùng NCC.
        const grouped = new Map();
        for (const it of filtered) {
            const k = _orderGroupKey(it);
            if (!grouped.has(k)) grouped.set(k, []);
            grouped.get(k).push(it);
        }

        // Lưu groups để modal trả-cả-đơn truy theo index (rebuild mỗi lần render).
        SOURCE_STATE.groups = Array.from(grouped.values());

        let html = '';
        SOURCE_STATE.groups.forEach((items, gi) => {
            const first = items[0];
            const totalValue = items.reduce((s, it) => s + it.stock * it.price, 0);
            html += `<div class="pr-source-group">
                <h3 class="pr-source-group-head">
                    <i data-lucide="building-2"></i>
                    ${escapeHtml(first.supplier)}
                    <span class="pr-source-order-tag">${escapeHtml(_orderGroupLabel(first))}</span>
                    <span class="pr-source-group-meta">${items.length} SP · tồn ${fmtMoney(totalValue)}</span>
                    <button class="btn btn-danger btn-sm pr-bulk-btn" data-bulk-group="${gi}" title="Trả nhiều SP của đơn này cùng lúc"><i data-lucide="undo-2"></i> Trả hàng</button>
                </h3>
                <table class="pr-source-table">
                    <thead><tr>
                        <th style="width:130px">Mã SP</th>
                        <th>Tên + Biến thể</th>
                        <th class="num" style="width:80px">Đã đặt</th>
                        <th class="num" style="width:80px">Tồn kho</th>
                        <th class="num" style="width:110px">Giá</th>
                        <th style="width:130px"></th>
                    </tr></thead>
                    <tbody>
                ${items
                    .map(
                        (it) => `<tr data-src-agg="${escapeHtml(it.aggId)}">
                        <td><code>${escapeHtml(it.code)}</code></td>
                        <td><div class="pr-name-cell">${thumbHtml(it.imageUrl)}<span>${escapeHtml(it.name)}${it.variant ? ` <small style="color:#64748b">(${escapeHtml(it.variant)})</small>` : ''}</span></div></td>
                        <td class="num" style="color:#64748b">${it.orderedQty}</td>
                        <td class="num"><strong>${it.stock}</strong></td>
                        <td class="num">${fmtMoney(it.price)}</td>
                        <td><button class="btn btn-danger btn-sm pr-source-refund" data-src-agg="${escapeHtml(it.aggId)}"><i data-lucide="undo-2"></i> Trả NCC</button></td>
                    </tr>`
                    )
                    .join('')}
                    </tbody>
                </table>
            </div>`;
        });
        listEl.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    PR.render = {
        applyFilters,
        renderList,
        selectRefund,
        renderDetail,
        loadSourceItems,
        renderSourceList,
    };
})();
