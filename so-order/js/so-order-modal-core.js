// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — modal multi-row: row model/render/wire inputs + per-row meta/total + modal totals. MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    SO._newModalRow = function _newModalRow(prefill = {}) {
        SO.modalRowCounter += 1;
        return {
            uid: 'r' + SO.modalRowCounter + '-' + Math.random().toString(36).slice(2, 7),
            // P1 2026-05-30: rowId track existing storage row id khi
            // modalMode='edit-shipment' để update không tạo mới.
            rowId: prefill.rowId || null,
            // 2026-06-16: NCC per-row. Sửa lô = nguyên ngày giao → có thể gồm
            // NHIỀU NCC (A1, b1…). Mỗi dòng giữ NCC riêng, KHÔNG ép 1 NCC chung.
            supplier: prefill.supplier || '',
            // 2026-06-17: gid (đơn) của dòng — để gom meta per-đơn trong modal Sửa lô.
            invoiceGroupId: prefill.invoiceGroupId || null,
            productName: prefill.productName || '',
            variant: prefill.variant || '',
            qty: Number.isFinite(Number(prefill.qty)) ? Number(prefill.qty) : 1,
            costPrice: Number(prefill.costPrice) || 0,
            sellPrice: Number(prefill.sellPrice) || 0,
            productImage: prefill.productImage || '',
            // Row mới kế thừa ảnh hóa đơn của đơn (1 ảnh dùng chung cả đơn).
            invoiceImage:
                prefill.invoiceImage !== undefined ? prefill.invoiceImage : SO.modalInvoiceImage,
            matchedCode: prefill.matchedCode || null,
        };
    };

    // (2026-06-22) _addRowFromScannedCode đã gỡ — chỉ dùng cho 2 nút quét/đọc nhãn
    // (đã bỏ theo yêu cầu user). Thêm SP thủ công qua "Thêm sản phẩm".

    // Match SP Kho cho 1 dòng modal — VARIANT-AWARE (2026-06-25): matchedCode →
    // findByCode; else findByNameVariant(name, variant). KHÔNG dùng findByNameExact
    // (chỉ theo tên) vì 1 tên có nhiều biến thể = nhiều MÃ khác nhau → badge "Tồn"
    // + mã sẽ mượn nhầm code biến thể khác cùng tên (vd "Trắng" HNMMTRANG cho cả
    // "Đỏ"). Cùng nguyên tắc unique-theo-mã + table-view SO._lookupKhoCode.
    SO._modalMatchKho = function _modalMatchKho(row) {
        const cache = window.Web2ProductsCache;
        if (!cache) return null;
        return (
            (row.matchedCode && cache.findByCode?.(row.matchedCode)) ||
            (cache.findByNameVariant
                ? cache.findByNameVariant(
                      (row.productName || '').trim(),
                      (row.variant || '').trim()
                  )
                : null) ||
            null
        );
    };

    SO.modalRowHtml = function modalRowHtml(row, idx, total) {
        const matched = SO._modalMatchKho(row);
        const stockText = matched
            ? `<span class="so-row-stock ${(matched.stock || 0) <= 0 ? 'is-zero' : (matched.stock || 0) < 5 ? 'is-low' : ''}">
                   <i data-lucide="package-check"></i> Tồn: <strong>${matched.stock ?? 0}</strong>
               </span>`
            : '';
        const badge = matched
            ? `<span class="so-row-kho-badge" title="Đã có trong Kho SP Web 2.0 — mã ${SO.escapeHtml(matched.code)}">
                   <i data-lucide="check-circle-2"></i> Đã có ở kho
               </span>`
            : `<span class="so-row-kho-badge so-row-kho-new" title="Sẽ tự thêm vào Kho SP Web 2.0 khi lưu">
                   <i data-lucide="plus-circle"></i> SP mới
               </span>`;
        const delBtnHtml =
            (SO.modalMode === 'create' || SO.modalMode === 'edit-shipment') && total > 1
                ? `<button type="button" class="so-action-btn so-row-del" data-action="remove-row" data-uid="${row.uid}" title="Xóa dòng">
                       <i data-lucide="x"></i>
                   </button>`
                : '';
        return `
        <tr class="so-modal-row modal-row" data-uid="${row.uid}">
            <td class="so-td-stt">${idx + 1}</td>
            <td class="so-td-ncc">
                <div class="so-supplier-pick-wrap so-row-ncc-wrap">
                    <input
                        type="text"
                        data-field="supplier"
                        data-uid="${row.uid}"
                        placeholder="NCC"
                        title="Nhà cung cấp của riêng dòng này — gợi ý từ Ví NCC"
                        class="so-input-v2 so-row-ncc-input"
                        autocomplete="off"
                        value="${SO.escapeHtml(row.supplier || '')}"
                    />
                    <div class="so-supplier-dropdown" hidden></div>
                </div>
            </td>
            <td class="so-td-product">
                <div class="so-product-input-wrap">
                    <input
                        type="text"
                        data-field="productName"
                        data-uid="${row.uid}"
                        required
                        placeholder="VD: 2003 B5 SET ÁO DÀI"
                        class="so-input-v2 so-input-product-name"
                        autocomplete="off"
                        value="${SO.escapeHtml(row.productName)}"
                    />
                    <div class="so-row-meta">
                        ${badge}
                        ${stockText}
                    </div>
                </div>
            </td>
            <td class="so-td-variant">
                <div class="so-variant-picker-wrap">
                    <input
                        type="text"
                        data-field="variant"
                        data-uid="${row.uid}"
                        placeholder="Pick từ kho… · Đen / S / M / L"
                        title="Nhập nhiều biến thể: 'Đen / S / M / L' = 4 SP màu Đen; 'M / Đỏ / Trắng' = 2 SP size M"
                        class="so-input-v2"
                        value="${SO.escapeHtml(row.variant)}"
                        autocomplete="off"
                    />
                    <div class="so-variant-multi-preview" data-multi-preview-uid="${row.uid}" hidden></div>
                </div>
            </td>
            <td class="so-td-qty">
                <input
                    type="number"
                    data-field="qty"
                    data-uid="${row.uid}"
                    min="0"
                    value="${row.qty}"
                    required
                    class="so-input-v2 so-input-num"
                />
            </td>
            <td class="so-td-money">
                <input
                    type="number"
                    data-field="costPrice"
                    data-uid="${row.uid}"
                    min="0"
                    step="any"
                    value="${row.costPrice}"
                    class="so-input-v2 so-input-num so-input-money"
                />
            </td>
            <td class="so-td-money">
                <input
                    type="number"
                    data-field="sellPrice"
                    data-uid="${row.uid}"
                    min="0"
                    step="any"
                    value="${row.sellPrice}"
                    class="so-input-v2 so-input-num so-input-money"
                />
            </td>
            <td class="so-td-money so-td-total">
                <span data-total-for="${row.uid}">0₫</span>
            </td>
            <td class="so-td-img">
                ${SO._imgPasteCellHtml(row, 'productImage')}
            </td>
            <td class="so-td-row-actions">${delBtnHtml}</td>
        </tr>`;
    };

    SO.renderModalRows = function renderModalRows() {
        const tbody = document.getElementById('soModalProductsBody');
        if (!tbody) return;
        // 2026-06-16: Sửa lô (edit-shipment) gồm nhiều NCC → NCC tách RIÊNG mỗi
        // dòng (cột "NCC"), ẩn ô "Nhà cung cấp" chung ở header (gây hiểu nhầm cả
        // lô 1 NCC). Mode khác (tạo mới / sửa 1 dòng) giữ ô NCC chung.
        const isEditShip = SO.modalMode === 'edit-shipment';
        const tbl = document.getElementById('soModalProductsTable');
        if (tbl) tbl.classList.toggle('so-show-ncc', isEditShip);
        const supCell = document.querySelector('#soOrderForm .so-cell-supplier-input');
        if (supCell) supCell.style.display = isEditShip ? 'none' : '';
        // 2026-06-17: edit-shipment → ẩn cụm meta CHUNG (KG/Kiện/HĐ/Giảm/Ship của
        // form), hiện section per-NCC. Mode khác → ngược lại. (Toggle visibility ở
        // đây — chạy mỗi render; nội dung cụm render 1 lần ở _renderPerOrderMeta.)
        const pmWrap = document.getElementById('soPerOrderMetaWrap');
        if (pmWrap) pmWrap.hidden = !isEditShip;
        document
            .querySelectorAll('#soOrderForm [data-single-meta]')
            .forEach((el) => (el.style.display = isEditShip ? 'none' : ''));
        if (!isEditShip) {
            const pmList = document.getElementById('soPerOrderMetaList');
            if (pmList) pmList.innerHTML = '';
        }
        tbody.innerHTML = SO.modalRows
            .map((r, i) => SO.modalRowHtml(r, i, SO.modalRows.length))
            .join('');
        // Show + button trong create mode VÀ edit-shipment mode (cho phép thêm
        // SP mới vào lô khi sửa nguyên lô).
        const addWrap = document.getElementById('soModalAddRowWrap');
        if (addWrap) addWrap.hidden = SO.modalMode !== 'create' && SO.modalMode !== 'edit-shipment';
        SO.wireModalRowInputs();
        SO.wireModalImagePasteDrop();
        SO._renderOrderInvoiceImage(); // ô ảnh hóa đơn cấp đơn (header)
        if (window.lucide?.createIcons) window.lucide.createIcons();
        SO.updateModalTotals();
    };

    SO.wireModalRowInputs = function wireModalRowInputs() {
        const tbody = document.getElementById('soModalProductsBody');
        if (!tbody) return;
        // Generic field input listener — update modalRows + re-render targeted bits.
        tbody.querySelectorAll('input[data-field]').forEach((input) => {
            input.addEventListener('input', SO.onModalRowFieldInput);
            input.addEventListener('change', SO.onModalRowFieldInput);
        });
        // Price shorthand: gõ "100" tự hiểu là 100.000 cho VND khi blur.
        tbody
            .querySelectorAll('input[data-field="costPrice"], input[data-field="sellPrice"]')
            .forEach((input) => {
                input.addEventListener('blur', SO.onModalPriceBlur);
            });
        // Product name dropdown trigger.
        // P1 2026-05-30: bỏ trigger trên 'focus' — gây suggestion auto-bật
        // spam khi mở edit modal (input đã pre-fill tên SP). Chỉ trigger
        // khi user thực sự gõ ('input') hoặc nhấn ArrowDown chủ động.
        tbody.querySelectorAll('input[data-field="productName"]').forEach((input) => {
            input.addEventListener('input', () => {
                SO.activeSuggestUid = input.dataset.uid;
                SO.showSuggest(input.dataset.uid, input.value);
            });
            // ArrowDown khi focus → mở suggest dropdown thủ công.
            input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    SO.activeSuggestUid = input.dataset.uid;
                    SO.showSuggest(input.dataset.uid, input.value);
                }
            });
            input.addEventListener('blur', () => {
                // Delay so click on suggestion item registers first
                setTimeout(() => {
                    if (SO.activeSuggestUid === input.dataset.uid)
                        SO.hideSuggest(input.dataset.uid);
                }, 180);
            });
        });
        // Variant picker per row — pick từ Kho Biến Thể.
        // P1 2026-05-30: cùng pattern — chỉ trigger trên 'input' / ArrowDown,
        // không trên focus.
        tbody.querySelectorAll('input[data-field="variant"]').forEach((input) => {
            input.addEventListener('input', () => {
                // LUÔN gợi ý từ Kho Biến Thể theo token CUỐI (kể cả đang build
                // "Đen / d" → gợi ý Đỏ cho token "d"). KHÔNG ẩn theo detect nữa —
                // trước đây ẩn sớm khiến không pick được token đang gõ. Preview N
                // SP hiện inline phía dưới (dropdown nổi đè khi đang gõ, blur thì
                // thấy preview).
                SO.showVariantSuggest(input.dataset.uid, input.value);
                SO._updateVariantMultiPreview(input.dataset.uid, input.value);
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    SO.showVariantSuggest(input.dataset.uid, input.value);
                }
            });
            input.addEventListener('blur', () => {
                setTimeout(() => SO.hideVariantSuggest(input.dataset.uid), 180);
            });
            // Prefill: nếu mở lại modal với variant multi sẵn → hiện preview.
            SO._updateVariantMultiPreview(input.dataset.uid, input.value);
        });
        // NCC per-row picker (chỉ render khi edit-shipment). Dùng chung
        // attachSupplierPickerOnDemand → gợi ý từ Ví NCC + "+ Tạo NCC".
        tbody.querySelectorAll('input[data-field="supplier"]').forEach((input) => {
            SO.attachSupplierPickerOnDemand(input, {
                onPick: (val) => {
                    const row = SO.modalRows.find((r) => r.uid === input.dataset.uid);
                    if (row) row.supplier = val;
                    SO._ensureSupplierWithFeedback(val);
                },
            });
        });
        // + Thêm SP
        const addBtn = document.getElementById('soModalAddRowBtn');
        if (addBtn) {
            addBtn.onclick = () => {
                // Edit-shipment: SP mới kế thừa NCC của dòng cuối (hoặc NCC mặc
                // định của lô) để user không phải gõ lại — vẫn sửa được per-row.
                const prefill =
                    SO.modalMode === 'edit-shipment'
                        ? {
                              supplier:
                                  SO.modalRows[SO.modalRows.length - 1]?.supplier ||
                                  SO._editShipDefaultSupplier ||
                                  '',
                          }
                        : {};
                SO.modalRows.push(SO._newModalRow(prefill));
                SO.renderModalRows();
            };
        }
        // (2026-06-22) 2 nút "Quét mã" (camera barcode) + "Đọc nhãn" (OCR) đã gỡ theo yêu cầu.
        // Delete row + image upload via event delegation
        tbody.querySelectorAll('[data-action="remove-row"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const uid = btn.dataset.uid;
                SO.modalRows = SO.modalRows.filter((r) => r.uid !== uid);
                if (!SO.modalRows.length) SO.modalRows.push(SO._newModalRow());
                SO.renderModalRows();
            });
        });
        // (Upload button đã bỏ — chỉ dùng Ctrl+V / kéo thả)
    };

    SO.onModalPriceBlur = function onModalPriceBlur(e) {
        const input = e.currentTarget;
        const uid = input.dataset.uid;
        const field = input.dataset.field;
        if (field !== 'costPrice' && field !== 'sellPrice') return;
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const raw = Number(input.value) || 0;
        const expanded = SO._maybeExpandVndShorthand(raw, tab);
        if (expanded === raw) return;
        input.value = String(expanded);
        const row = SO.modalRows.find((r) => r.uid === uid);
        if (row) row[field] = expanded;
        SO.updateRowTotal(uid);
        SO.updateModalGrandTotals();
    };

    SO.onModalRowFieldInput = function onModalRowFieldInput(e) {
        const input = e.currentTarget;
        // Guard chống stale `change` event từ input đã bị detach (vd:
        // applySuggestionToRow rerender → renderModalRows replace tbody
        // → OLD input detached → browser async firebrate 'change' với value
        // user gõ TRƯỚC khi pick → handler cũ ghi đè row.productName về
        // text query → SAVE sai. Verified 2026-05-30.
        if (!input.isConnected) return;
        const uid = input.dataset.uid;
        const field = input.dataset.field;
        const row = SO.modalRows.find((r) => r.uid === uid);
        if (!row) return;
        const v = input.value;
        if (field === 'qty' || field === 'costPrice' || field === 'sellPrice') {
            row[field] = Number(v) || 0;
        } else {
            row[field] = v;
        }
        if (field === 'productName' || field === 'variant') {
            // VARIANT-AWARE (2026-06-25): re-resolve mã theo TÊN + BIẾN THỂ khi user
            // đổi 1 trong 2 → badge "Tồn"/mã khớp ĐÚNG cặp (tên+biến thể), không mượn
            // nhầm code biến thể khác cùng tên. (Trước đây chỉ field==='productName'
            // + findByNameExact theo tên → bỏ sót đổi biến thể + gán nhầm mã.)
            const cache = window.Web2ProductsCache;
            const match =
                cache?.findByNameVariant?.(
                    (row.productName || '').trim(),
                    (row.variant || '').trim()
                ) ||
                (row.matchedCode && cache?.findByCode?.(row.matchedCode)) ||
                null;
            row.matchedCode = match?.code || null;
            // Refresh meta inline without rebuilding entire row (to keep focus).
            SO.updateRowMeta(uid);
        }
        if (field === 'productImage' || field === 'invoiceImage') {
            SO.updateRowImagePreview(uid, field, v);
        }
        if (field === 'qty' || field === 'sellPrice') {
            SO.updateRowTotal(uid);
            SO.updateModalGrandTotals();
        }
    };

    SO.updateRowMeta = function updateRowMeta(uid) {
        const row = SO.modalRows.find((r) => r.uid === uid);
        if (!row) return;
        const tr = document
            .getElementById('soModalProductsBody')
            ?.querySelector(`tr[data-uid="${uid}"]`);
        if (!tr) return;
        const metaEl = tr.querySelector('.so-row-meta');
        if (!metaEl) return;
        const matched = SO._modalMatchKho(row);
        row.matchedCode = matched?.code || null;
        const stockText = matched
            ? `<span class="so-row-stock ${(matched.stock || 0) <= 0 ? 'is-zero' : (matched.stock || 0) < 5 ? 'is-low' : ''}">
                   <i data-lucide="package-check"></i> Tồn: <strong>${matched.stock ?? 0}</strong>
               </span>`
            : '';
        const badge = matched
            ? `<span class="so-row-kho-badge" title="Đã có trong Kho SP Web 2.0 — mã ${SO.escapeHtml(matched.code)}">
                   <i data-lucide="check-circle-2"></i> Đã có ở kho
               </span>`
            : `<span class="so-row-kho-badge so-row-kho-new" title="Sẽ tự thêm vào Kho SP Web 2.0 khi lưu">
                   <i data-lucide="plus-circle"></i> SP mới
               </span>`;
        metaEl.innerHTML = badge + stockText;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };

    SO.updateRowImagePreview = function updateRowImagePreview(uid, name, url) {
        const el = document.querySelector(`[data-preview-uid="${uid}"][data-img-name="${name}"]`);
        if (!el) return;
        el.innerHTML = url ? `<img src="${SO.escapeHtml(url)}" alt="" />` : '';
    };

    SO.updateRowTotal = function updateRowTotal(uid) {
        const row = SO.modalRows.find((r) => r.uid === uid);
        if (!row) return;
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        // Thành tiền tính theo GIÁ NHẬP (đây là đơn MUA hàng từ NCC), không phải giá bán.
        const subtotal = (Number(row.qty) || 0) * (Number(row.costPrice) || 0);
        const el = document.querySelector(`[data-total-for="${uid}"]`);
        if (el) el.textContent = SO.fmtCurrency(subtotal, tab.currency || 'VND');
    };

    // Recompute per-row "Thành tiền" + footer totals for the multi-row modal.
    SO.updateModalTotals = function updateModalTotals() {
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        if (!tab) return;
        for (const r of SO.modalRows) SO.updateRowTotal(r.uid);
        SO.updateModalGrandTotals();
    };

    SO.updateModalGrandTotals = function updateModalGrandTotals() {
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        if (!tab) return;
        const totalQty = SO.modalRows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
        // Tổng tiền = Σ(SL × GIÁ NHẬP) — đơn mua hàng tính theo giá nhập.
        const subtotal = SO.modalRows.reduce(
            (s, r) => s + (Number(r.qty) || 0) * (Number(r.costPrice) || 0),
            0
        );
        // THÀNH TIỀN = Tổng tiền − Giảm giá + Phí ship (per-đơn, nhập ở modal).
        const form = document.getElementById('soOrderForm');
        const discount = Number(form?.elements?.shipDiscount?.value) || 0;
        const shipping = Number(form?.elements?.shipShipping?.value) || 0;
        const grand = Math.max(0, subtotal - discount + shipping);
        const qtyEl = document.getElementById('soModalTotalQty');
        if (qtyEl) qtyEl.textContent = totalQty.toLocaleString('vi-VN');
        const sumEl = document.getElementById('soModalTotalAmount');
        if (sumEl) sumEl.textContent = SO.fmtCurrency(subtotal, tab.currency || 'VND');
        const finalEl = document.getElementById('soModalFinalAmount');
        if (finalEl) finalEl.textContent = SO.fmtCurrency(grand, tab.currency || 'VND');
    };

    SO.wireModalTotals = function wireModalTotals() {
        // Multi-row inputs auto-wired in wireModalRowInputs via onModalRowFieldInput.
    };

    // ---------- Inline image edit modal ----------
})();
