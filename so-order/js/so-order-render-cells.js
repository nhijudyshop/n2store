// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — per-cell HTML builders (editableCellHtml, actionsCell, priceCell, imgCell, statusCell) + INLINE_*_FIELDS. MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    // Field nào dblclick được edit inline. STT auto-tính, ảnh có modal riêng,
    // actions là buttons → bỏ qua.
    SO.INLINE_EDIT_FIELDS = new Set([
        'supplier',
        'productName',
        'variant',
        'qty',
        'sellPrice',
        'costPrice',
        'note',
        'costNote',
        // 2026-06-16: 'status' ĐÃ BỎ — trạng thái không cho đổi tay (chỉ nút Nhận hàng).
    ]);
    SO.INLINE_IMAGE_FIELDS = new Set(['productImage', 'invoiceImage']);

    // Helper: check row status từ DOM (rẻ, tránh load lại state).
    SO._isRowLocked = function _isRowLocked(rowId, shipmentId) {
        const tr = document.querySelector(
            `#soTableBody tr.so-data-row[data-row-id="${CSS.escape(rowId)}"][data-shipment-id="${CSS.escape(shipmentId)}"]`
        );
        const st = tr?.dataset?.rowStatus;
        // 2026-06-28: khoá cả 'partial_received' (nhận 1 phần đã có tồn/nợ).
        return st === 'received' || st === 'partial_received';
    };

    // Tạo HTML <td> chứa input/select khi whole-table edit mode bật.
    // Field nào không có handler riêng → text input. Status → select.
    // Variant → wrapper với picker dropdown (lazy refresh khi focus/typing).
    SO.editableCellHtml = function editableCellHtml(field, r, rid, sid, extraTdAttr) {
        const dataAttr = `data-cell-field="${field}" data-row-id="${rid}" data-shipment-id="${sid}"`;
        const extra = extraTdAttr || '';
        const tdClass =
            {
                qty: 'so-cell-qty',
                sellPrice: 'so-cell-money',
                costPrice: 'so-cell-money',
                note: 'so-cell-note',
                costNote: 'so-cell-note so-cell-note-cp',
                status: 'so-cell-status',
                variant: 'so-cell-variant',
                supplier: 'so-cell-supplier',
                productName: 'so-cell-product',
            }[field] || '';
        if (field === 'qty') {
            return `<td class="${tdClass} so-cell-edit" ${dataAttr}${extra}>
                <input class="so-edit-input so-edit-num" type="number" min="0" step="1" value="${Number(r.qty) || 0}" data-edit-field="qty" data-row-id="${rid}" data-shipment-id="${sid}" />
            </td>`;
        }
        if (field === 'sellPrice' || field === 'costPrice') {
            return `<td class="${tdClass} so-cell-edit" ${dataAttr}>
                <input class="so-edit-input so-edit-num" type="text" inputmode="decimal" data-w2num="decimal" value="${Number(r[field]) || 0}" data-edit-field="${field}" data-row-id="${rid}" data-shipment-id="${sid}" />
            </td>`;
        }
        if (field === 'status') {
            const opts = Object.entries(SO.STATUS_LABELS)
                .map(
                    ([val, lbl]) =>
                        `<option value="${val}" ${val === (r.status || 'draft') ? 'selected' : ''}>${SO.escapeHtml(lbl)}</option>`
                )
                .join('');
            return `<td class="${tdClass} so-cell-edit" ${dataAttr}>
                <select class="so-edit-select" data-edit-field="status" data-row-id="${rid}" data-shipment-id="${sid}">${opts}</select>
            </td>`;
        }
        if (field === 'variant') {
            return `<td class="${tdClass} so-cell-edit so-cell-edit-variant" ${dataAttr}>
                <div class="so-edit-variant-wrap">
                    <input class="so-edit-input" type="text" value="${SO.escapeHtml(r.variant || '')}" placeholder="Pick từ kho…" autocomplete="off" data-edit-field="variant" data-row-id="${rid}" data-shipment-id="${sid}" />
                    <div class="so-edit-variant-dropdown" hidden></div>
                </div>
            </td>`;
        }
        if (field === 'supplier') {
            return `<td class="${tdClass} so-cell-edit so-cell-edit-supplier" ${dataAttr}${extra}>
                <div class="so-supplier-pick-wrap">
                    <input class="so-edit-input" type="text" value="${SO.escapeHtml(r.supplier || '')}" placeholder="Pick từ Ví NCC…" autocomplete="off" data-edit-field="supplier" data-row-id="${rid}" data-shipment-id="${sid}" />
                    <div class="so-supplier-dropdown" hidden></div>
                </div>
            </td>`;
        }
        return `<td class="${tdClass} so-cell-edit" ${dataAttr}${extra}>
            <input class="so-edit-input" type="text" value="${SO.escapeHtml(r[field] || '')}" data-edit-field="${field}" data-row-id="${rid}" data-shipment-id="${sid}" />
        </td>`;
    };

    SO.actionsCell = function actionsCell(rowId, shipmentId, status) {
        // P1 2026-05-29: bỏ nút "Mua hàng" per row (đã thay bằng "Nhận hàng"
        // per shipment trên header — handle cả mua đủ lẫn mua 1 phần).
        // 2026-05-30: status='received' (Đã nhận) → khoá row, thay nút sửa/xoá
        // bằng icon lock. User muốn sửa lại phải dùng flow "trả hàng" hoặc
        // revert status từ UI khác.
        if (status === 'received' || status === 'partial_received') {
            return `<td class="so-cell-actions so-cell-actions-locked">
                <span class="so-action-btn so-action-locked" title="Đã nhận / nhận 1 phần — không thể chỉnh sửa">
                    <i data-lucide="lock"></i>
                </span>
            </td>`;
        }
        return `<td class="so-cell-actions">
            <button class="so-action-btn" type="button" data-row-action="edit" data-row-id="${SO.escapeHtml(rowId)}" data-shipment-id="${SO.escapeHtml(shipmentId)}" title="Sửa">
                <i data-lucide="edit-2"></i>
            </button>
            <button class="so-action-btn" type="button" data-row-action="delete" data-row-id="${SO.escapeHtml(rowId)}" data-shipment-id="${SO.escapeHtml(shipmentId)}" title="Xóa">
                <i data-lucide="trash-2"></i>
            </button>
        </td>`;
    };

    SO.priceCell = function priceCell(amount, tab, meta) {
        const raw = Number(amount) || 0;
        const isVnd = tab.currency === 'VND';
        const rawText = isVnd ? '' : SO.fmtCurrency(raw, tab.currency);
        const vndText = SO.fmtVnd(SO.toVnd(raw, tab));
        const attrs = meta
            ? ` data-cell-field="${meta.field}" data-row-id="${meta.rid}" data-shipment-id="${meta.sid}"`
            : '';
        return `<td class="so-cell-money"${attrs}>
            ${rawText ? '<span class="so-cell-money-raw">' + SO.escapeHtml(rawText) + '</span>' : '<span class="so-cell-money-raw">' + SO.escapeHtml(vndText) + '</span>'}
            ${!isVnd ? '<span class="so-cell-money-vnd">≈ ' + SO.escapeHtml(vndText) + '</span>' : ''}
        </td>`;
    };

    SO.imgCell = function imgCell(url, meta) {
        const rowspan = meta?.rowspan && meta.rowspan > 1 ? ` rowspan="${meta.rowspan}"` : '';
        const mergedClass = meta?.merged ? ' so-cell-merged' : '';
        const igAttr = meta?.invoiceGroupId
            ? ` data-invoice-group-id="${SO.escapeHtml(meta.invoiceGroupId)}"`
            : '';
        const attrs = meta
            ? ` data-cell-field="${meta.field}" data-row-id="${meta.rid}" data-shipment-id="${meta.sid}"${igAttr}`
            : '';
        // Edit affordance: pencil button overlay top-right (always rendered;
        // CSS shows it on hover). Click → opens inline image modal so user
        // can replace/clear ngay cả khi cell đã có ảnh.
        const editBtn = meta
            ? `<button type="button" class="so-cell-img-edit" data-img-edit data-cell-field="${meta.field}" data-row-id="${meta.rid}" data-shipment-id="${meta.sid}" title="Sửa ảnh"><i data-lucide="pencil"></i></button>`
            : '';
        if (!url) {
            return `<td class="so-cell-img${mergedClass}"${attrs}${rowspan}><span class="so-cell-img-missing" data-img-edit>—</span>${editBtn}</td>`;
        }
        return `<td class="so-cell-img${mergedClass}"${attrs}${rowspan}><img src="${SO.escapeHtml(url)}" alt="" data-zoomable loading="lazy" />${editBtn}</td>`;
    };

    SO.statusCell = function statusCell(status, meta) {
        const lbl = SO.STATUS_LABELS[status] || status;
        const attrs = meta
            ? ` data-cell-field="status" data-row-id="${meta.rid}" data-shipment-id="${meta.sid}"`
            : '';
        return `<td class="so-cell-status"${attrs}><span class="so-status-pill" data-status="${SO.escapeHtml(status || 'draft')}">${SO.escapeHtml(lbl)}</span></td>`;
    };
})();
