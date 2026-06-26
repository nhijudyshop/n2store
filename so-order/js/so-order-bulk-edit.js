// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — whole-table edit mode (bulk edit) delegated handlers. MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    SO.onBulkEditChange = function onBulkEditChange(e) {
        const el = e.target.closest('[data-edit-field]');
        if (!el) return;
        const field = el.dataset.editField;
        const rowId = el.dataset.rowId;
        const shipmentId = el.dataset.shipmentId;
        if (!field || !rowId || !shipmentId) return;
        SO.commitBulkEditField(rowId, shipmentId, field, el.value);
    };
    SO.onBulkEditKeydown = function onBulkEditKeydown(e) {
        if (e.key !== 'Enter') return;
        const el = e.target.closest('input[data-edit-field]');
        if (!el || el.tagName !== 'INPUT') return;
        e.preventDefault();
        el.blur(); // triggers change
    };
    SO.onBulkEditFocusIn = function onBulkEditFocusIn(e) {
        const elVariant = e.target.closest('input[data-edit-field="variant"]');
        if (elVariant) SO.attachVariantPickerOnDemand(elVariant);
        const elSupplier = e.target.closest('input[data-edit-field="supplier"]');
        if (elSupplier) {
            SO._ensureSupplierCacheSubscription();
            SO.attachSupplierPickerOnDemand(elSupplier, {
                onPick: (val) => {
                    SO.commitBulkEditField(
                        elSupplier.dataset.rowId,
                        elSupplier.dataset.shipmentId,
                        'supplier',
                        val
                    );
                    SO._ensureSupplierAsync(val);
                },
            });
        }
    };

    SO.commitBulkEditField = function commitBulkEditField(rowId, shipmentId, field, rawValue) {
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        const r = sh?.rows.find((x) => x.id === rowId);
        if (!r) return;
        let value = rawValue;
        if (field === 'qty' || field === 'sellPrice' || field === 'costPrice') {
            // Giá có thể đã format (1.000) → parse số thật; qty không format.
            value =
                (field !== 'qty' && window.Web2NumberInput
                    ? Web2NumberInput.parse(value)
                    : Number(value)) || 0;
            if (field === 'sellPrice' || field === 'costPrice') {
                const expanded = SO._maybeExpandVndShorthand(value, tab);
                if (expanded !== value) {
                    value = expanded;
                    const input = document.querySelector(
                        `#soTableBody input[data-edit-field="${field}"][data-row-id="${rowId}"]`
                    );
                    if (input && window.Web2NumberInput) Web2NumberInput.setValue(input, value);
                    else if (input) input.value = String(value);
                }
            }
        } else if (typeof value === 'string') {
            value = value.trim();
        }
        // Variant không bắt buộc tồn tại trong Kho Biến Thể (so-order là
        // draft đơn, có thể gõ size mới chưa khai báo).
        if (r[field] === value) return; // no-op skip
        // Capture delta cho qty change → sync Kho.
        let pendingAdj = null;
        if (field === 'qty') {
            const oldQty = Number(r.qty) || 0;
            const delta = (Number(value) || 0) - oldQty;
            if (delta !== 0) {
                pendingAdj = { ...SO._rowToKhoMatch(r), delta };
            }
        }
        window.SoOrderStorage.updateRow(SO.state, tab.id, shipmentId, rowId, { [field]: value });
        if (pendingAdj && pendingAdj.name) SO.adjustKhoPending([pendingAdj]);
        if (field === 'supplier' && value) SO._ensureSupplierAsync(value);
        SO.pushSync();
        SO.renderFooterTotals();
        SO.flashRow(rowId);
    };
})();
