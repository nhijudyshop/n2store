// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — modal open flows (openOrderModal / openShipmentModal / openShipmentEditAllRows) + ship-meta UI + per-order meta. MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    // Gán giá trị tiền vào ô đã format (1.000) — qua Web2NumberInput để hiển thị đúng.
    function _setMoneyVal(el, n) {
        if (!el) return;
        if (window.Web2NumberInput) Web2NumberInput.setValue(el, n);
        else el.value = n;
    }

    // 2026-06-16: thông tin lô nâng cao tách thành 6 field độc lập, mỗi field 1
    // checkbox riêng trong Cài đặt tab. key = data-ship-field trên `.so-ship-adv`.
    SO.SHIP_META_FIELDS = [
        { key: 'eta', label: 'ETA giao hàng' },
        { key: 'batch', label: 'Đợt' },
        { key: 'caseCount', label: 'Số Kiện' },
        { key: 'weightKg', label: 'Tổng KG' },
        { key: 'contractAmount', label: 'Tiền HĐ' },
        { key: 'contractCurrency', label: 'Tiền tệ' },
    ];

    // Trả map {key: bool} cho 1 tab. Backward-compat: tab cũ chỉ có
    // `showShipMeta` (bool gộp) → bật/tắt CẢ 6 field theo bool đó.
    SO._shipMetaFlags = function _shipMetaFlags(tab) {
        const out = {};
        const sf = tab && tab.shipMetaFields;
        const legacyAll = !!(tab && tab.showShipMeta);
        for (const f of SO.SHIP_META_FIELDS) {
            out[f.key] = sf && typeof sf[f.key] === 'boolean' ? sf[f.key] : legacyAll;
        }
        return out;
    };

    // 2026-06-16: (a) ẩn/hiện TỪNG field thông tin lô (.so-ship-adv[data-ship-field])
    // theo cài đặt per-field của tab; (b) populate giảm giá / phí ship của đơn.
    // sh = lô đang sửa (null khi tạo mới → 0). Dùng chung 2 modal open.
    SO._applyShipMetaUi = function _applyShipMetaUi(tab, sh) {
        const flags = SO._shipMetaFlags(tab);
        document.querySelectorAll('#soOrderForm .so-ship-adv').forEach((el) => {
            const key = el.dataset.shipField;
            // Field có data-ship-field → theo flag riêng; không có → ẩn nếu KHÔNG
            // field nào bật (giữ hành vi "ẩn cả cụm" cho phần tử lạ nếu có).
            el.hidden = key ? !flags[key] : !Object.values(flags).some(Boolean);
        });
        const form = document.getElementById('soOrderForm');
        // 2026-06-16: giảm giá/ship của ĐƠN đang sửa (editingInvoiceGroupId), KHÔNG
        // còn per-shipment. Tạo mới / đơn mới → 0.
        // 2026-06-17: KG/Kiện/HĐ + Giảm/Ship đều per-ĐƠN. Single-order context
        // (tạo mới / sửa 1 dòng) → load từ order meta của editingInvoiceGroupId
        // (đơn mới → 0). edit-shipment nhiều đơn dùng cụm per-NCC (field này ẩn).
        const adj =
            sh && SO.editingInvoiceGroupId && window.SoOrderStorage.getOrderAdjustment
                ? window.SoOrderStorage.getOrderAdjustment(sh, SO.editingInvoiceGroupId)
                : { discount: 0, shipping: 0, weightKg: 0, caseCount: 0, contractAmount: 0 };
        _setMoneyVal(form?.elements?.shipDiscount, adj.discount || 0);
        _setMoneyVal(form?.elements?.shipShipping, adj.shipping || 0);
        if (form?.elements?.shipWeightKg) form.elements.shipWeightKg.value = adj.weightKg || 0;
        if (form?.elements?.shipCaseCount) form.elements.shipCaseCount.value = adj.caseCount || 0;
        _setMoneyVal(form?.elements?.shipContractAmount, adj.contractAmount || 0);
    };

    SO.openOrderModal = function openOrderModal(rowId, shipmentId) {
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        // Guard: rows đã nhận → không mở modal edit. User phải revert status
        // (trả hàng / chuyển nháp) ở chỗ khác trước khi sửa.
        if (rowId && shipmentId) {
            const sh = tab.shipments.find((s) => s.id === shipmentId);
            const r = sh?.rows.find((x) => x.id === rowId);
            if (r?.status === 'received' || r?.status === 'partial_received') {
                SO.notify('Dòng đã nhận / nhận 1 phần — không chỉnh sửa được', 'warning');
                return;
            }
        }
        SO.editingRowId = rowId || null;
        SO.editingShipmentId = shipmentId || null;
        SO.editingTabId = tab.id;
        SO.editingInvoiceGroupId = null; // set bên dưới nếu là edit 1 dòng
        SO.modalMode = rowId ? 'edit' : 'create';
        SO.modalRows = [];
        SO.modalInvoiceImage = ''; // reset trước khi build rows (tránh kế thừa đơn trước)
        const form = document.getElementById('soOrderForm');
        const titleEl = document.getElementById('soModalTitle');
        form.reset();
        // Defaults for shipment metadata
        form.elements.shipDate.value = new Date().toISOString().slice(0, 10);
        form.elements.shipBatch.value = '';
        form.elements.shipCaseCount.value = 0;
        form.elements.shipWeightKg.value = 0;
        _setMoneyVal(form.elements.shipContractAmount, 0);
        form.elements.shipContractCurrency.value = tab.currency || 'VND';
        if (form.elements.shipExpectedDeliveryDate) {
            form.elements.shipExpectedDeliveryDate.value = '';
        }

        if (rowId && shipmentId) {
            const sh = tab.shipments.find((s) => s.id === shipmentId);
            const r = sh?.rows.find((x) => x.id === rowId);
            if (!r) return;
            SO.editingInvoiceGroupId = r.invoiceGroupId || null; // đơn của dòng đang sửa
            titleEl.textContent = 'Sửa dòng order';
            form.elements.shipDate.value = sh.date || '';
            form.elements.shipBatch.value = sh.batch || '';
            form.elements.shipCaseCount.value = sh.caseCount || 0;
            form.elements.shipWeightKg.value = sh.weightKg || 0;
            _setMoneyVal(form.elements.shipContractAmount, sh.contractAmount || 0);
            form.elements.shipContractCurrency.value = sh.contractCurrency || tab.currency || 'VND';
            if (form.elements.shipExpectedDeliveryDate) {
                form.elements.shipExpectedDeliveryDate.value = sh.expectedDeliveryDate || '';
            }
            form.elements.supplier.value = r.supplier || '';
            form.elements.note.value = r.note || '';
            if (form.elements.costNote) form.elements.costNote.value = r.costNote || ''; // ô đã bỏ
            SO.modalRows = [
                SO._newModalRow({
                    productName: r.productName || '',
                    variant: r.variant || '',
                    qty: r.qty,
                    sellPrice: r.sellPrice,
                    costPrice: r.costPrice,
                    productImage: r.productImage || '',
                    invoiceImage: r.invoiceImage || '',
                }),
            ];
        } else {
            if (shipmentId) {
                const sh = tab.shipments.find((s) => s.id === shipmentId);
                if (sh) {
                    titleEl.textContent = `Thêm SP vào ${sh.batch ? 'Đợt ' + sh.batch : SO.formatDateVN(sh.date)}`;
                    form.elements.shipDate.value = sh.date || '';
                    form.elements.shipBatch.value = sh.batch || '';
                    form.elements.shipCaseCount.value = sh.caseCount || 0;
                    form.elements.shipWeightKg.value = sh.weightKg || 0;
                    _setMoneyVal(form.elements.shipContractAmount, sh.contractAmount || 0);
                    form.elements.shipContractCurrency.value =
                        sh.contractCurrency || tab.currency || 'VND';
                    if (form.elements.shipExpectedDeliveryDate) {
                        form.elements.shipExpectedDeliveryDate.value =
                            sh.expectedDeliveryDate || '';
                    }
                }
            } else {
                titleEl.textContent = 'Tạo Đơn Hàng (Nháp)';
            }
            SO.modalRows = [SO._newModalRow()];
        }
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
        SO._applyShipMetaUi(
            tab,
            shipmentId ? tab.shipments.find((s) => s.id === shipmentId) : null
        );
        // Ảnh hóa đơn cấp đơn: edit → lấy từ row (các row share), tạo mới → rỗng.
        SO.modalInvoiceImage = SO.modalRows[0]?.invoiceImage || '';
        SO.renderModalRows();
        SO.showModal('soOrderModal');
        SO._bindModalScrollCloseDropdowns();
        // Bind supplier picker (idempotent — chỉ bind 1 lần cho input cố định).
        SO._ensureSupplierCacheSubscription();
        if (form.elements.supplier) {
            // onPick: click "+ Tạo NCC …" / chọn NCC → tạo NGAY vào nguồn chung
            // Ví NCC (supplier-wallet) + báo kết quả.
            SO.attachSupplierPickerOnDemand(form.elements.supplier, {
                onPick: (val) => {
                    SO._ensureSupplierWithFeedback(val);
                    if (SO._imgMgrAutoInvoice) SO._imgMgrAutoInvoice(val); // auto ảnh hóa đơn
                },
            });
            // NCC gõ tay → vẫn thử auto ảnh hóa đơn khi rời ô (tab bật Quản lý ảnh).
            form.elements.supplier.addEventListener('change', () => {
                if (SO._imgMgrAutoInvoice) SO._imgMgrAutoInvoice(form.elements.supplier.value);
            });
        }
        setTimeout(() => {
            const firstNameInput = document.querySelector(
                '#soModalProductsBody input[data-field="productName"]'
            );
            firstNameInput?.focus();
        }, 80);
    };
})();
