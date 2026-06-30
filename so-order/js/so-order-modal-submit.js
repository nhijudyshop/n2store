// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — modal submit/validate/rows (handleOrderSubmit: create / edit-row / edit-shipment + kho sync). MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    SO.handleOrderSubmit = function handleOrderSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const shipMeta = {
            date: form.elements.shipDate.value || new Date().toISOString().slice(0, 10),
            batch: form.elements.shipBatch.value.trim(),
            contractCurrency: form.elements.shipContractCurrency.value,
            expectedDeliveryDate: form.elements.shipExpectedDeliveryDate?.value || null,
        };
        // 2026-06-17: KG / Kiện / Tiền HĐ + Giảm / Ship đều PER-ĐƠN (theo
        // invoiceGroupId) — KHÔNG ghi vào shipment. Lưu qua setOrderAdjustment.
        // (edit-shipment nhiều đơn → đọc từng cụm per-NCC, KHÔNG dùng orderAdj này.)
        const _gv = (el) =>
            (window.Web2NumberInput ? Web2NumberInput.getValue(el) : Number(el?.value)) || 0;
        const orderAdj = {
            discount: _gv(form.elements.shipDiscount),
            shipping: _gv(form.elements.shipShipping),
            weightKg: Number(form.elements.shipWeightKg?.value) || 0,
            caseCount: Number(form.elements.shipCaseCount?.value) || 0,
            contractAmount: _gv(form.elements.shipContractAmount),
        };
        // 2026-06-16: KHÔNG còn field status trong modal (bỏ đổi tay). Tạo mới →
        // addRow default 'draft'. Sửa → updateRow không có key status → giữ nguyên
        // status hiện tại của dòng (chỉ "Nhận hàng" đổi sang received/partial).
        const sharedFields = {
            supplier: form.elements.supplier.value.trim(),
            note: form.elements.note.value.trim(),
            // 2026-06-28: BỎ ô "Ghi chú CP" — costNote không còn nhập ở modal (thay
            // bằng "Chi phí đợt"). Giữ key rỗng để addRow/updateRow không phá data cũ.
            costNote: form.elements.costNote ? form.elements.costNote.value.trim() : '',
        };
        // Auto-create NCC vào Ví NCC nếu tên chưa có. Fire-and-forget — không
        // chặn submit, lỗi Firestore chỉ console.warn (vẫn lưu row bình thường).
        SO._ensureSupplierAsync(sharedFields.supplier);
        // Validate at least 1 row có tên SP
        const validRows = SO.modalRows.filter((r) => r.productName.trim());
        if (!validRows.length) {
            SO.notify('Cần ít nhất 1 sản phẩm có tên', 'warning');
            return;
        }
        // 2026-06-29 FIX#2: cảnh báo MỀM nếu có dòng SL ≤ 0 (vẫn cho lưu — KHÔNG
        // chặn, KHÔNG confirm). qty 0/âm vẫn tạo dòng như cũ, chỉ nhắc user.
        const zeroQtyCount = validRows.filter((r) => (Number(r.qty) || 0) <= 0).length;
        if (zeroQtyCount > 0) {
            SO.notify(`Có ${zeroQtyCount} dòng SL ≤ 0 — vẫn lưu`, 'warning');
        }
        // Variant không bắt buộc tồn tại trong Kho Biến Thể (so-order là draft
        // đơn — user có thể gõ size/màu mới chưa khai báo). Validation cũ đã
        // gỡ vì block flow không cần thiết.
        if (SO.modalMode === 'edit' && SO.editingRowId && SO.editingShipmentId) {
            const r = validRows[0];
            const rowData = {
                ...sharedFields,
                productName: r.productName.trim(),
                variant: r.variant.trim(),
                qty: Number(r.qty) || 0,
                sellPrice: Number(r.sellPrice) || 0,
                costPrice: Number(r.costPrice) || 0,
                productImage: r.productImage.trim(),
                invoiceImage: r.invoiceImage.trim(),
            };
            // Capture OLD row TRƯỚC khi update để tính delta sync Kho.
            const editSh = tab.shipments.find((s) => s.id === SO.editingShipmentId);
            const oldRow = editSh?.rows.find((x) => x.id === SO.editingRowId);
            const oldMatch = oldRow ? SO._rowToKhoMatch(oldRow) : null;
            const oldQty = Number(oldRow?.qty) || 0;
            const newMatch = SO._rowToKhoMatch({
                productName: rowData.productName,
                variant: rowData.variant,
                supplier: rowData.supplier,
            });
            const newQty = rowData.qty;
            const sameSp =
                oldMatch &&
                oldMatch.name.toLowerCase() === newMatch.name.toLowerCase() &&
                (oldMatch.variant || '').toLowerCase() === (newMatch.variant || '').toLowerCase();
            const sh = tab.shipments.find((s) => s.id === SO.editingShipmentId);
            const dateOrBatchChanged =
                sh && (sh.date !== shipMeta.date || (sh.batch || '') !== shipMeta.batch);
            if (dateOrBatchChanged) {
                const existing = window.SoOrderStorage.findShipment(tab, shipMeta);
                if (existing && existing.id !== SO.editingShipmentId) {
                    window.SoOrderStorage.moveRow(
                        SO.state,
                        tab.id,
                        SO.editingShipmentId,
                        existing.id,
                        SO.editingRowId
                    );
                    window.SoOrderStorage.updateRow(
                        SO.state,
                        tab.id,
                        existing.id,
                        SO.editingRowId,
                        rowData
                    );
                } else {
                    window.SoOrderStorage.updateShipment(
                        SO.state,
                        tab.id,
                        SO.editingShipmentId,
                        shipMeta
                    );
                    window.SoOrderStorage.updateRow(
                        SO.state,
                        tab.id,
                        SO.editingShipmentId,
                        SO.editingRowId,
                        rowData
                    );
                }
            } else {
                window.SoOrderStorage.updateRow(
                    SO.state,
                    tab.id,
                    SO.editingShipmentId,
                    SO.editingRowId,
                    rowData
                );
                window.SoOrderStorage.updateShipment(
                    SO.state,
                    tab.id,
                    SO.editingShipmentId,
                    shipMeta
                );
            }
            // Giảm giá / phí ship của ĐƠN đang sửa (per invoiceGroupId).
            if (SO.editingInvoiceGroupId) {
                window.SoOrderStorage.setOrderAdjustment(
                    SO.state,
                    tab.id,
                    SO.editingShipmentId,
                    SO.editingInvoiceGroupId,
                    orderAdj
                );
            }
            SO.notify('Đã cập nhật dòng order', 'success');
            // Sync Kho:
            //   - SP cùng name+variant với row cũ → adjust pending delta.
            //   - Rename → giảm pending SP cũ qty rồi upsert SP mới.
            if (sameSp) {
                const delta = newQty - oldQty;
                if (delta !== 0 && newMatch.name) {
                    SO.adjustKhoPending([{ ...newMatch, delta }]);
                }
            } else {
                if (oldMatch?.name && oldQty > 0) {
                    SO.adjustKhoPending([{ ...oldMatch, delta: -oldQty }]);
                }
                SO.syncRowsToKho([r], tab, sharedFields.supplier).catch(() => {});
            }
        } else if (SO.modalMode === 'edit-shipment' && SO.editingShipmentId) {
            // P1 2026-05-30: bulk update nguyên shipment.
            // Logic: rows có rowId → update tại chỗ; rows không có rowId →
            // addRow mới; rows từng có rowId trong sh nhưng modalRows không
            // còn → xóa (user đã click X xóa trong modal).
            const sh = tab.shipments.find((s) => s.id === SO.editingShipmentId);
            if (!sh) {
                SO.notify('Không tìm thấy lô để cập nhật', 'error');
                return;
            }
            window.SoOrderStorage.updateShipment(SO.state, tab.id, sh.id, shipMeta);
            const keptIds = new Set(validRows.filter((r) => r.rowId).map((r) => r.rowId));
            // Xóa rows bị remove khỏi modal
            const toDelete = (sh.rows || []).filter((r) => !keptIds.has(r.id));
            for (const old of toDelete) {
                // Bảo vệ rows đã nhận / nhận 1 phần: chúng bị loại khỏi modal Sửa lô
                // (isLocked ở so-order-shipment.js) nên KHÔNG nằm trong keptIds → nếu
                // không skip ở đây sẽ bị xoá oan = mất tồn Kho + nợ NCC phần đã nhận.
                if (old.status === 'received' || old.status === 'partial_received') continue;
                window.SoOrderStorage.deleteRow(SO.state, tab.id, sh.id, old.id);
            }
            // Update / add rows.
            // P1 2026-05-30: rows MỚI thêm trong cùng modal submit dùng
            // chung 1 invoiceGroupId — share Ảnh Hóa Đơn cell (rowspan).
            const addedRows = [];
            const newInvoiceGroupId = `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
            // NCC PER-ROW: lô gồm nhiều NCC → mỗi dòng giữ NCC riêng. Fallback
            // về NCC chung (ô header ẩn) nếu dòng để trống. Ensure mỗi NCC mới
            // vào Ví NCC (dedupe để khỏi spam).
            const ensuredSuppliers = new Set();
            for (const r of validRows) {
                const rowSupplier = (r.supplier || '').trim() || sharedFields.supplier;
                if (rowSupplier && !ensuredSuppliers.has(rowSupplier)) {
                    ensuredSuppliers.add(rowSupplier);
                    SO._ensureSupplierAsync(rowSupplier);
                }
                const rowData = {
                    ...sharedFields,
                    supplier: rowSupplier,
                    productName: r.productName.trim(),
                    variant: r.variant.trim(),
                    category: (r.category || '').trim(),
                    qty: Number(r.qty) || 0,
                    sellPrice: Number(r.sellPrice) || 0,
                    costPrice: Number(r.costPrice) || 0,
                    productImage: r.productImage.trim(),
                    invoiceImage: r.invoiceImage.trim(),
                };
                if (r.rowId) {
                    window.SoOrderStorage.updateRow(SO.state, tab.id, sh.id, r.rowId, rowData);
                } else {
                    // Dòng MỚI: nhập nhanh nhiều biến thể → tách N dòng SP. SET (có " + ")
                    // KHÔNG expand (tránh băm nhầm "Trắng / M + Đen / L").
                    const vstr = (r.variant || '').trim();
                    const variants = vstr.includes('+')
                        ? null
                        : window.Web2VariantMulti?.expand?.(vstr);
                    const isMulti = variants && variants.length > 1;
                    const vlist = isMulti ? variants : [rowData.variant];
                    // SP nhiều biến thể → con cùng productGroupId + SL từng biến thể.
                    const groupId = isMulti
                        ? 'pg-' +
                          Date.now().toString(36) +
                          '-' +
                          Math.random().toString(36).slice(2, 7)
                        : null;
                    const qtyMap = {};
                    for (const vq of r.variantQtys || []) {
                        if (vq && vq.variant != null)
                            qtyMap[String(vq.variant)] = Number(vq.qty) || 0;
                    }
                    for (const v of vlist) {
                        const q =
                            isMulti && Object.prototype.hasOwnProperty.call(qtyMap, v)
                                ? qtyMap[v]
                                : Number(rowData.qty) || 0;
                        window.SoOrderStorage.addRow(SO.state, tab.id, sh.id, {
                            ...rowData,
                            variant: v,
                            qty: q,
                            productGroupId: groupId,
                            invoiceGroupId: newInvoiceGroupId,
                        });
                        // Carry NCC đã resolve + groupId/qty để syncRowsToKho gom cha-con.
                        addedRows.push({
                            ...r,
                            supplier: rowSupplier,
                            variant: v,
                            qty: q,
                            productGroupId: groupId,
                        });
                    }
                }
            }
            // 2026-06-17: lưu meta PER-ĐƠN (KG/Kiện/HĐ/Giảm/Ship) từ các cụm trong
            // modal Sửa lô. Cụm "__new__" → đơn mới (newInvoiceGroupId). Mỗi NCC/đơn
            // 1 cụm riêng → không gộp meta giữa các NCC.
            const perOrderMeta = SO._readPerOrderMeta();
            for (const [key, meta] of Object.entries(perOrderMeta)) {
                const gid = key === '__new__' ? newInvoiceGroupId : key;
                window.SoOrderStorage.setOrderAdjustment(SO.state, tab.id, sh.id, gid, meta);
            }
            SO.notify(
                `Đã cập nhật lô (${validRows.length} SP${toDelete.length ? `, xóa ${toDelete.length}` : ''})`,
                'success'
            );
            if (addedRows.length > 0) {
                SO.syncRowsToKho(addedRows, tab, sharedFields.supplier).catch(() => {});
            }
        } else {
            let sh = window.SoOrderStorage.findShipment(tab, shipMeta);
            if (!sh) {
                sh = window.SoOrderStorage.addShipment(SO.state, tab.id, shipMeta);
            } else {
                // 2026-06-17: KG/Kiện/HĐ giờ per-đơn → chỉ merge contractCurrency
                // (shipment-level). Đơn mới tự có meta riêng qua setOrderAdjustment.
                window.SoOrderStorage.updateShipment(SO.state, tab.id, sh.id, {
                    contractCurrency: shipMeta.contractCurrency || sh.contractCurrency,
                });
            }
            // P1 2026-05-30: rows trong cùng modal submit dùng chung 1
            // invoiceGroupId → hóa đơn chung (cell rowspan + sync paste).
            const newInvoiceGroupId = `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
            // Nhập nhanh nhiều biến thể: "Đen / S / M / L" → tách thành N dòng SP.
            const createRows = SO._explodeVariants(validRows);
            for (const r of createRows) {
                window.SoOrderStorage.addRow(SO.state, tab.id, sh.id, {
                    ...sharedFields,
                    productName: r.productName.trim(),
                    variant: r.variant.trim(),
                    category: (r.category || '').trim(),
                    // productGroupId: nhóm con cùng 1 SP nhiều biến thể (Kho → 1 CHA + N con).
                    productGroupId: r.productGroupId || null,
                    qty: Number(r.qty) || 0,
                    sellPrice: Number(r.sellPrice) || 0,
                    costPrice: Number(r.costPrice) || 0,
                    productImage: r.productImage.trim(),
                    invoiceImage: r.invoiceImage.trim(),
                    invoiceGroupId: newInvoiceGroupId,
                });
            }
            // Giảm giá / phí ship của ĐƠN này (1 invoiceGroupId).
            window.SoOrderStorage.setOrderAdjustment(
                SO.state,
                tab.id,
                sh.id,
                newInvoiceGroupId,
                orderAdj
            );
            const _expanded = createRows.length - validRows.length;
            SO.notify(
                `Đã thêm ${createRows.length} dòng order (Nháp)` +
                    (_expanded > 0 ? ` — tách ${_expanded} biến thể` : ''),
                'success'
            );
            SO.syncRowsToKho(createRows, tab, sharedFields.supplier).catch(() => {});
        }
        SO.hideModal('soOrderModal');
        SO.pushSync();
        SO.renderAll();
    };
})();
