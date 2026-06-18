// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — shipment metadata ops (openShipmentModal / openShipmentEditAllRows / per-order meta). MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    SO.openShipmentModal = function openShipmentModal(shipmentId) {
        // P1 2026-05-30: trước chỉ load row đầu (sh.rows[0]) → user nói
        // "chỉ thấy 1 sản phẩm đầu". Giờ load TẤT CẢ rows của shipment
        // vào modal để user thấy + sửa nguyên lô.
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        if (!sh) return;
        if (!sh.rows.length) {
            SO.openOrderModal(null, shipmentId);
            return;
        }
        // 2026-05-30: rows đã nhận (status='received') bị khoá. Nếu TẤT CẢ
        // rows đã nhận → không cho mở modal. Nếu có rows draft/ordered →
        // mở modal nhưng chỉ load rows editable (received rows giữ nguyên
        // trong storage, bảo vệ qua _finalizeShipmentSubmit toDelete loop).
        const editableRows = (sh.rows || []).filter((r) => r.status !== 'received');
        const skippedCount = (sh.rows || []).length - editableRows.length;
        if (!editableRows.length) {
            SO.notify(
                'Tất cả SP trong lô đã nhận — không sửa được. Xoá lô nếu muốn dọn.',
                'warning'
            );
            return;
        }
        if (skippedCount > 0) {
            SO.notify(
                `Bỏ qua ${skippedCount} SP đã nhận khỏi modal (giữ nguyên trong lô).`,
                'info'
            );
        }
        SO.openShipmentEditAllRows(sh, tab, editableRows);
    };

    // NCC xuất hiện nhiều nhất trong list rows (để default SP mới thêm).
    SO._mostCommonSupplier = function _mostCommonSupplier(rows) {
        const counts = new Map();
        for (const r of rows || []) {
            const s = (r.supplier || '').trim();
            if (!s) continue;
            counts.set(s, (counts.get(s) || 0) + 1);
        }
        let best = '';
        let bestN = 0;
        for (const [s, n] of counts) {
            if (n > bestN) {
                best = s;
                bestN = n;
            }
        }
        return best;
    };

    // P1 2026-05-30: mở modal edit shipment với TẤT CẢ rows
    // (vs openOrderModal(rowId, ...) chỉ edit 1 row).
    // Modal mode = 'edit-shipment' — handleOrderSubmit handle update bulk rows.
    SO.openShipmentEditAllRows = function openShipmentEditAllRows(sh, tab, rowsOverride) {
        SO.editingRowId = null;
        SO.editingShipmentId = sh.id;
        SO.editingTabId = tab.id;
        // Sửa lô có thể gồm nhiều đơn — giảm giá/ship gắn vào ĐƠN ĐẦU TIÊN của các
        // dòng đang load (đơn giản hoá; sửa lẻ từng dòng để chỉnh đúng đơn).
        SO.editingInvoiceGroupId = (rowsOverride || sh.rows || [])[0]?.invoiceGroupId || null;
        SO.modalMode = 'edit-shipment';
        const form = document.getElementById('soOrderForm');
        const titleEl = document.getElementById('soModalTitle');
        form.reset();
        titleEl.textContent = `Sửa lô — ${sh.batch ? 'Đợt ' + sh.batch : SO.formatDateVN(sh.date)}`;
        form.elements.shipDate.value = sh.date || '';
        form.elements.shipBatch.value = sh.batch || '';
        form.elements.shipCaseCount.value = sh.caseCount || 0;
        form.elements.shipWeightKg.value = sh.weightKg || 0;
        form.elements.shipContractAmount.value = sh.contractAmount || 0;
        form.elements.shipContractCurrency.value = sh.contractCurrency || tab.currency || 'VND';
        if (form.elements.shipExpectedDeliveryDate) {
            form.elements.shipExpectedDeliveryDate.value = sh.expectedDeliveryDate || '';
        }
        // Shared fields lấy từ row đầu — note/costNote shipment-wide. NCC thì
        // KHÔNG còn dùng ô chung (lô gồm nhiều NCC → mỗi dòng giữ NCC riêng).
        const r0 = sh.rows[0] || {};
        form.elements.supplier.value = r0.supplier || ''; // fallback cho SP thiếu NCC
        form.elements.note.value = r0.note || '';
        form.elements.costNote.value = r0.costNote || '';
        // Load rows vào modal. rowsOverride filter rows đã nhận trước khi
        // vào modal — guarantee user không thấy/sửa được rows received.
        const rowsToLoad = rowsOverride || sh.rows;
        SO.modalRows = rowsToLoad.map((r) =>
            SO._newModalRow({
                rowId: r.id, // track existing row id để update không tạo mới
                supplier: r.supplier || '', // NCC riêng của dòng
                invoiceGroupId: r.invoiceGroupId || r.id, // đơn của dòng (gom meta)
                productName: r.productName || '',
                variant: r.variant || '',
                qty: r.qty,
                sellPrice: r.sellPrice,
                costPrice: r.costPrice,
                productImage: r.productImage || '',
                invoiceImage: r.invoiceImage || '',
            })
        );
        // NCC mặc định cho SP mới = NCC phổ biến nhất trong lô (mode-by count).
        SO._editShipDefaultSupplier = SO._mostCommonSupplier(SO.modalRows) || r0.supplier || '';
        // Ảnh hóa đơn cấp đơn cho header (các row trong lô share 1 ảnh).
        SO.modalInvoiceImage = SO.modalRows[0]?.invoiceImage || '';
        const curHint =
            tab.currency === 'VND'
                ? 'VNĐ · gõ 100 = 100k'
                : `${tab.currency} (≈ ${Number(tab.rate).toLocaleString('vi-VN')} ₫)`;
        document.getElementById('soSellCurHint').textContent = `[${curHint}]`;
        document.getElementById('soCostCurHint').textContent = `[${curHint}]`;
        const updateContractHint = () => {
            const cur = form.elements.shipContractCurrency.value;
            const rate = SO.currencyToVndRate(cur, tab);
            const text = cur === 'VND' ? 'VNĐ' : `${cur} (≈ ${rate.toLocaleString('vi-VN')} ₫)`;
            const el = document.getElementById('soContractCurHint');
            if (el) el.textContent = `[${text}]`;
        };
        updateContractHint();
        form.elements.shipContractCurrency.onchange = updateContractHint;
        SO._applyShipMetaUi(tab, sh);
        SO.renderModalRows();
        // 2026-06-17: Sửa lô gồm nhiều ĐƠN → meta (KG/Kiện/HĐ/Giảm/Ship) theo
        // TỪNG NCC/đơn = cụm riêng. Render clusters + ẩn ô meta chung của form.
        SO._renderPerOrderMeta(sh, tab);
        SO.showModal('soOrderModal');
        SO._bindModalScrollCloseDropdowns();
        SO._ensureSupplierCacheSubscription();
        if (form.elements.supplier) {
            // onPick: click "+ Tạo NCC …" / chọn NCC → tạo NGAY vào nguồn chung
            // Ví NCC (supplier-wallet) + báo kết quả.
            SO.attachSupplierPickerOnDemand(form.elements.supplier, {
                onPick: (val) => SO._ensureSupplierWithFeedback(val),
            });
        }
    };

    // 2026-06-17: render cụm meta PER-ĐƠN trong modal Sửa lô. Mỗi đơn (gid) 1
    // cụm: NCC + Kiện/KG/HĐ/Giảm/Ship. Đơn = gid của các dòng đang load; SP mới
    // (chưa gid) gom vào cụm "Đơn mới". Field theo tab flags (KG/Kiện/HĐ); Giảm/
    // Ship luôn hiện. Ẩn cụm meta chung của form (chỉ dùng cho tạo/sửa-1-dòng).
    SO._renderPerOrderMeta = function _renderPerOrderMeta(sh, tab) {
        const list = document.getElementById('soPerOrderMetaList');
        if (!list) return;
        if (SO.modalMode !== 'edit-shipment') {
            list.innerHTML = '';
            return;
        }
        // Gom các đơn (gid) theo thứ tự xuất hiện trong modalRows (dòng cũ có gid).
        // Luôn thêm cụm "__new__" ở cuối cho SP thêm mới (đơn mới) — render 1 lần
        // lúc mở, KHÔNG re-render khi thêm/xoá dòng (giữ giá trị user đang gõ).
        const order = [];
        const seen = new Set();
        for (const r of SO.modalRows) {
            if (!r.rowId) continue; // dòng mới → gộp vào cụm "__new__"
            const key = r.invoiceGroupId || '__new__';
            if (!seen.has(key)) {
                seen.add(key);
                order.push({ key, supplier: r.supplier || '' });
            }
        }
        order.push({ key: '__new__', supplier: '' }); // cụm SP thêm mới
        const cur = tab.currency || 'VND';
        // Cụm Sửa lô = nơi user nhập meta per-NCC → LUÔN hiện đủ 5 ô (không phụ
        // thuộc tab flags). Tab flags chỉ ảnh hưởng ô meta CHUNG của form (tạo mới).
        const numField = (pm, label, val) =>
            `<label class="so-pm-field"><span>${label}</span><input type="number" min="0" step="any" data-pm="${pm}" value="${Number(val) || 0}" class="so-input-v2 so-input-num" /></label>`;
        list.innerHTML = order
            .map((o) => {
                const m =
                    o.key === '__new__'
                        ? { caseCount: 0, weightKg: 0, contractAmount: 0, discount: 0, shipping: 0 }
                        : window.SoOrderStorage.getOrderAdjustment(sh, o.key);
                const label = o.key === '__new__' ? 'Đơn mới' : SO.escapeHtml(o.supplier || '—');
                return `<div class="so-pm-cluster" data-gid="${SO.escapeHtml(o.key)}">
                    <span class="so-pm-ncc"><i data-lucide="store"></i> ${label}</span>
                    ${numField('caseCount', 'Kiện', m.caseCount)}
                    ${numField('weightKg', 'KG', m.weightKg)}
                    ${numField('contractAmount', `HĐ (${cur})`, m.contractAmount)}
                    ${numField('discount', `Giảm (${cur})`, m.discount)}
                    ${numField('shipping', `Ship (${cur})`, m.shipping)}
                </div>`;
            })
            .join('');
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };

    // Đọc cụm meta per-đơn từ modal Sửa lô. Trả map { gid|'__new__': meta }.
    SO._readPerOrderMeta = function _readPerOrderMeta() {
        const out = {};
        document.querySelectorAll('#soPerOrderMetaList .so-pm-cluster').forEach((el) => {
            const gid = el.dataset.gid;
            const num = (pm) => Number(el.querySelector(`[data-pm="${pm}"]`)?.value) || 0;
            out[gid] = {
                caseCount: num('caseCount'),
                weightKg: num('weightKg'),
                contractAmount: num('contractAmount'),
                discount: num('discount'),
                shipping: num('shipping'),
            };
        });
        return out;
    };
})();
