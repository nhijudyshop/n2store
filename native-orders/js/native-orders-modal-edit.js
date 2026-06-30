// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — edit modal open/close/save + order lines + quick status. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // Warm dataset Tỉnh/TP→Phường/Xã sớm để khi mở/save modal là đã load xong
    // (mount đồng bộ, không có cửa sổ "đang tải" gây ghi đè rỗng — xem saveEdit).
    if (window.Web2VnAddress?.load) window.Web2VnAddress.load().catch(() => {});

    // ---------- Modal (edit) ----------
    // Working copy of current order's lines while modal is open.
    NO.EDIT_LINES = [];

    NO.openEdit = function openEdit(code) {
        const o = NO.STATE.orders.find((x) => x.code === code);
        if (!o) return;
        NO.STATE.editingCode = code;
        NO.EDIT_LINES = Array.isArray(o.products) ? o.products.map((p) => ({ ...p })) : [];

        // LOCK edit khi status='confirmed' (đã PBH thành công). User phải hủy
        // PBH hoặc tạo đơn mới (drag SP lại) để chỉnh sửa SP.
        const isLocked = o.status === 'confirmed';
        const lockBanner = isLocked
            ? `<div class="lock-banner" style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 14px;margin-bottom:14px;display:flex;gap:12px;align-items:flex-start;">
                <i data-lucide="lock" style="width:20px;height:20px;color:#92400e;flex-shrink:0;margin-top:1px;"></i>
                <div style="flex:1;font-size:13px;color:#78350f;line-height:1.5;">
                    <strong>Đơn đã tạo PBH — không thể chỉnh sửa giỏ sản phẩm.</strong><br>
                    Để sửa SP, hãy <strong>hủy PBH</strong> rồi mở lại, hoặc <strong>kéo SP mới</strong> từ WEB2 panel lên cùng khách để tạo đơn mới (PBH mới).
                </div>
                <button type="button" class="btn-primary" style="background:#dc2626;font-size:12px;padding:6px 12px;flex-shrink:0;" onclick="NativeOrdersApp.cancelPbhFromEdit('${NO.escapeHtml(code)}')">
                    <i data-lucide="x-circle" style="width:14px;height:14px;"></i> Hủy PBH
                </button>
            </div>`
            : '';

        NO.modalTitle().innerHTML = `<i data-lucide="${isLocked ? 'lock' : 'pencil'}"></i><span>${isLocked ? 'Xem đơn' : 'Chỉnh sửa đơn'} ${NO.escapeHtml(code)}</span>`;
        NO.modalBody().innerHTML =
            lockBanner +
            `
            <div class="field-row-grid">
                <div class="field-row">
                    <label>Tên khách</label>
                    <input id="editCustomerName" value="${NO.escapeHtml(o.customerName || '')}" placeholder="Tên khách hàng">
                </div>
                <div class="field-row">
                    <label>Số điện thoại</label>
                    <input id="editPhone" value="${NO.escapeHtml(o.phone || '')}" placeholder="0901234567">
                </div>
            </div>
            <div class="field-row">
                <label>Địa chỉ <span style="font-weight:400;color:#9aa1ab;font-size:12px;">(số nhà, đường)</span></label>
                <input id="editAddress" value="${NO.escapeHtml(o.address || '')}" placeholder="Số nhà, tên đường…" ${isLocked ? 'disabled' : ''}>
            </div>
            <div class="field-row-grid">
                <div class="field-row">
                    <label>Tỉnh/TP</label>
                    <select id="editCity" ${isLocked ? 'disabled' : ''}></select>
                </div>
                <div class="field-row">
                    <label>Phường/Xã</label>
                    <select id="editWard" ${isLocked ? 'disabled' : ''}></select>
                </div>
            </div>
            ${NO._renderCommentReadonlyBlock(o)}
            <div class="field-row">
                <label>Ghi chú</label>
                <textarea id="editUserNote" placeholder="Ghi chú nội bộ (size, màu, yêu cầu KH…)">${NO.escapeHtml(o.userNote || '')}</textarea>
            </div>
            <div class="field-row">
                <label>Trạng thái</label>
                <select id="editStatus">
                    ${
                        // Server PATCH chỉ nhận draft/confirmed (cancelled → dùng flow
                        // /cancel; delivered set bởi flow giao riêng). Chỉ offer 2 option
                        // đó. Nếu đơn đang ở status khác (cancelled/delivered) → vẫn show
                        // status hiện tại (disabled) để không “đổi ngầm” khi lưu.
                        (o.status === 'draft' || o.status === 'confirmed'
                            ? ['draft', 'confirmed']
                            : [o.status, 'draft', 'confirmed']
                        )
                            .map(
                                (s) =>
                                    `<option value="${s}" ${s === o.status ? 'selected' : ''}${s === o.status && s !== 'draft' && s !== 'confirmed' ? ' disabled' : ''}>${NO.STATUS_META[s]?.label || s}</option>`
                            )
                            .join('')
                    }
                </select>
            </div>

            <!-- ========== PRODUCTS SECTION ========== -->
            <div class="products-section${isLocked ? ' is-locked' : ''}">
                <div class="products-header">
                    <span class="products-title">
                        <i data-lucide="${isLocked ? 'lock' : 'package'}"></i>
                        Sản phẩm trong đơn ${isLocked ? '(đã khóa)' : ''}
                    </span>
                    <span class="products-totals" id="editProductsTotals">—</span>
                </div>

                ${
                    isLocked
                        ? ''
                        : `<div class="product-picker">
                    <div class="search-wrapper" style="flex:1;max-width:100%;">
                        <i data-lucide="search" class="search-icon"></i>
                        <input type="text" id="productPickerInput" class="search-input"
                               placeholder="Tìm theo mã SP hoặc tên… (gõ ≥ 2 ký tự)"
                               autocomplete="off">
                    </div>
                    <a class="btn-ghost" href="../web2/products/index.html" target="_blank" rel="noopener"
                       title="Mở kho để thêm SP mới">
                        <i data-lucide="external-link"></i> Kho SP
                    </a>
                </div>
                <div class="product-picker-results" id="productPickerResults" style="display:none;"></div>`
                }

                <div class="order-lines-wrapper">
                    <table class="order-lines-table">
                        <thead>
                            <tr>
                                <th style="width:48px;">#</th>
                                <th style="width:56px;">ẢNH</th>
                                <th>SẢN PHẨM</th>
                                <th style="width:120px;">SL</th>
                                <th style="width:120px;">ĐƠN GIÁ</th>
                                <th style="width:130px;">THÀNH TIỀN</th>
                                <th style="width:56px;"></th>
                            </tr>
                        </thead>
                        <tbody id="orderLinesTbody"></tbody>
                    </table>
                </div>
            </div>

            <details class="fb-context">
                <summary>Facebook context (read-only) — trace về comment nguồn</summary>
                <div class="fb-context-body">
                    fbUserId: ${NO.escapeHtml(o.fbUserId || '—')}<br>
                    fbPageId: ${NO.escapeHtml(o.fbPageId || '—')}<br>
                    fbPostId: ${NO.escapeHtml(o.fbPostId || '—')}<br>
                    fbCommentId: ${NO.escapeHtml(o.fbCommentId || '—')}<br>
                    sessionIndex: ${NO.escapeHtml(o.sessionIndex || '—')}<br>
                    source: ${NO.escapeHtml(o.source || 'NATIVE_WEB')}
                </div>
            </details>
        `;

        // Wire picker + lines
        NO.renderOrderLines();

        // Load product cache in background (so typing is instant)
        NO.EDIT_PRODUCTS_CACHE = null;
        NO.loadEditProductsCache();

        const pickerInput = NO.$('#productPickerInput');
        pickerInput?.addEventListener('input', (e) => {
            NO.searchPickerProducts(e.target.value.trim());
        });
        // Show first 20 on focus (empty query) so user can browse without typing
        pickerInput?.addEventListener('focus', () => {
            NO.searchPickerProducts(pickerInput.value.trim());
        });
        document.addEventListener('click', NO._pickerOutsideClick);

        // Tỉnh/TP + Phường/Xã = dropdown phụ thuộc (Web2VnAddress, 2 cấp). Giữ
        // giá trị legacy không khớp dataset. Destroy controller cũ trước khi mount.
        if (NO._vnAddr?.destroy) NO._vnAddr.destroy();
        if (window.Web2VnAddress) {
            NO._vnAddr = window.Web2VnAddress.mount({
                provinceEl: '#editCity',
                wardEl: '#editWard',
                province: o.cityName || o.cityCode || '',
                ward: o.wardName || o.wardCode || '',
            });
        }

        NO.modal().classList.add('active');
        if (window.lucide) lucide.createIcons();
        // Task 2: autofocus first input after modal opens
        setTimeout(() => document.getElementById('editCustomerName')?.focus(), 50);
    };

    NO.closeEdit = function closeEdit() {
        NO.STATE.editingCode = null;
        NO.EDIT_LINES = [];
        document.removeEventListener('click', NO._pickerOutsideClick);
        NO.modal().classList.remove('active');
    };

    NO.renderOrderLines = function renderOrderLines() {
        const tb = NO.$('#orderLinesTbody');
        const totals = NO.$('#editProductsTotals');
        if (!tb) return;

        // Lock check: re-derive từ STATE.editingCode + orders (cùng logic openEdit)
        const editingOrder = NO.STATE.editingCode
            ? NO.STATE.orders.find((x) => x.code === NO.STATE.editingCode)
            : null;
        const isLocked = editingOrder?.status === 'confirmed';

        if (!NO.EDIT_LINES.length) {
            tb.innerHTML = `<tr><td colspan="7" class="empty-lines">${isLocked ? 'Đơn không có sản phẩm.' : 'Chưa có sản phẩm — gõ mã/tên SP ở trên để tìm và thêm'}</td></tr>`;
            if (totals) totals.textContent = '0 SP · 0đ';
            return;
        }

        // Queue fetch snapshot cho mọi line có fbCommentId chưa cache.
        // Khi fetch xong → re-render để hiện thumbnail.
        const needsSnap = NO.EDIT_LINES.filter(
            (l) => l.fbCommentId && !NO._snapCache.has(l.fbCommentId)
        );
        if (needsSnap.length) {
            needsSnap.forEach((l) =>
                NO._queueSnapFetch(l.fbCommentId, () => NO.renderOrderLines())
            );
        }

        let totalQty = 0,
            totalAmount = 0;
        tb.innerHTML = NO.EDIT_LINES.map((l, i) => {
            const qty = Number(l.quantity) || 0;
            const price = Number(l.price) || 0;
            const amount = qty * price;
            totalQty += qty;
            totalAmount += amount;
            const snapThumb = NO._renderLineSnapThumb(l.fbCommentId);
            const img = l.imageUrl
                ? `<img src="${NO.escapeHtml(l.imageUrl)}" class="line-img" onerror="this.style.display='none';this.nextElementSibling.style.setProperty('display','inline-flex');">
                   <span class="line-img-ph" style="display:none;"><i data-lucide="image"></i></span>${snapThumb}`
                : `<span class="line-img-ph"><i data-lucide="image"></i></span>${snapThumb}`;
            // Locked → disable qty buttons + remove button, hiển thị read-only.
            const qtyCell = isLocked
                ? `<div class="qty-ctl" style="opacity:0.6;pointer-events:none;">
                       <span style="font-weight:600;padding:0 10px;">${qty}</span>
                   </div>`
                : `<div class="qty-ctl">
                       <button onclick="NativeOrdersApp.changeLineQty(${i}, -1)"><i data-lucide="minus"></i></button>
                       <input type="number" min="1" value="${qty}" onchange="NativeOrdersApp.setLineQty(${i}, this.value)">
                       <button onclick="NativeOrdersApp.changeLineQty(${i}, 1)"><i data-lucide="plus"></i></button>
                   </div>`;
            const actionCell = isLocked
                ? `<span title="Đơn đã PBH — không thể xóa SP" style="opacity:0.4;"><i data-lucide="lock"></i></span>`
                : `<button class="btn-action act-delete" title="Xóa" onclick="NativeOrdersApp.removeLine(${i})"><i data-lucide="trash-2"></i></button>`;
            // Ghi chú SP — ALWAYS editable (kể cả khi locked). User cần ghi
            // size/màu/yêu cầu đóng gói lên line ngay cả sau khi đã PBH.
            const noteCell = `
                <div class="line-note-wrap" style="margin-top:4px;">
                    <input type="text" class="line-note-input"
                        value="${NO.escapeHtml(l.note || '')}"
                        placeholder="Ghi chú SP (size/màu/đóng gói…)"
                        oninput="NativeOrdersApp.setLineNote(${i}, this.value)"
                        style="width:100%;padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;color:#475569;background:#f8fafc;"
                    />
                </div>`;
            const sourceBadge = NO._renderSourceBadge(l.source);
            return `
                <tr data-idx="${i}">
                    <td>${i + 1}</td>
                    <td>${img}</td>
                    <td>
                        <div class="line-name">${NO.escapeHtml(l.name || '—')}</div>
                        <div class="line-code">${NO.escapeHtml(l.productCode || '')}${sourceBadge}</div>
                        ${noteCell}
                    </td>
                    <td>${qtyCell}</td>
                    <td class="line-price">${price.toLocaleString('vi-VN')}đ</td>
                    <td class="line-amount">${amount.toLocaleString('vi-VN')}đ</td>
                    <td>${actionCell}</td>
                </tr>`;
        }).join('');

        if (totals) {
            totals.textContent = `${totalQty} SP · ${totalAmount.toLocaleString('vi-VN')}đ`;
        }
        if (window.lucide) lucide.createIcons();
    };

    NO.changeLineQty = function changeLineQty(idx, delta) {
        const line = NO.EDIT_LINES[idx];
        if (!line) return;
        const nextQty = Math.max(1, (Number(line.quantity) || 0) + delta);
        line.quantity = nextQty;
        line.total = nextQty * (Number(line.price) || 0);
        NO.renderOrderLines();
    };

    NO.setLineQty = function setLineQty(idx, val) {
        const line = NO.EDIT_LINES[idx];
        if (!line) return;
        const q = Math.max(1, parseInt(val, 10) || 1);
        line.quantity = q;
        line.total = q * (Number(line.price) || 0);
        NO.renderOrderLines();
    };

    NO.removeLine = function removeLine(idx) {
        NO.EDIT_LINES.splice(idx, 1);
        NO.renderOrderLines();
    };

    // Cập nhật ghi chú SP — KHÔNG re-render (giữ caret position khi đang gõ).
    // EDIT_LINES[idx].note sẽ được saveEdit gửi lên backend.
    NO.setLineNote = function setLineNote(idx, val) {
        const line = NO.EDIT_LINES[idx];
        if (!line) return;
        line.note = val || null;
    };

    // UI-first: modal đóng + danh sách update NGAY, PATCH chạy background.
    // Lỗi → rollback order về snapshot cũ + re-render + show error toast.
    NO.saveEdit = function saveEdit() {
        if (!NO.STATE.editingCode) return;
        const code = NO.STATE.editingCode;
        const editingOrder = NO.STATE.orders.find((x) => x.code === code);
        if (!editingOrder) return;
        const fields = {
            customerName: NO.$('#editCustomerName')?.value?.trim() || '',
            phone: NO.$('#editPhone')?.value?.trim() || '',
            address: NO.$('#editAddress')?.value?.trim() || '',
            userNote: NO.$('#editUserNote')?.value?.trim() || '',
            status: NO.$('#editStatus')?.value || editingOrder.status,
        };
        fields.products = NO.EDIT_LINES.map((l) => ({
            productCode: l.productCode,
            name: l.name,
            price: Number(l.price) || 0,
            quantity: Number(l.quantity) || 0,
            imageUrl: l.imageUrl || null,
            note: l.note || null,
            total: (Number(l.price) || 0) * (Number(l.quantity) || 0),
            addedAt: l.addedAt || Date.now(),
            source: l.source || undefined,
            fbCommentId: l.fbCommentId || undefined,
            addedBy: l.addedBy || undefined,
            addedById: l.addedById || undefined,
            clientEventId: l.clientEventId || undefined,
        }));
        const editorInfo = window.Web2UserInfo?.get('native-orders') || {};
        fields._editor = {
            userId: editorInfo.userId || null,
            userName: editorInfo.userName || null,
            sourcePage: editorInfo.sourcePage || 'native-orders',
        };

        // Tỉnh/TP + Phường/Xã (Web2VnAddress, 2 cấp) → cột city_*/ward_* đã có
        // sẵn ở native_orders + PATCH allow-list. CHỈ ghi khi dataset đã LOAD XONG
        // (isReady): lúc đang tải getValue() trả {''} placeholder → backend chỉ bỏ
        // qua `undefined` (không bỏ '' / null) nên sẽ ghi đè RỖNG lên city/ward thật
        // → mất data. Chưa ready → bỏ qua, để PATCH giữ nguyên cột cũ.
        const vnReady = window.Web2VnAddress?.isReady?.() ?? false;
        const vnAddr = vnReady && NO._vnAddr?.getValue ? NO._vnAddr.getValue() : null;
        if (vnAddr) {
            fields.cityCode = vnAddr.provinceCode || null;
            fields.cityName = vnAddr.provinceName || '';
            fields.wardCode = vnAddr.wardCode || null;
            fields.wardName = vnAddr.wardName || '';
        }

        // Đổi địa chỉ / Tỉnh/TP / Phường/Xã → tự nhận lại phương thức giao hàng
        // (trừ khi đã chỉnh tay). Detect trên địa chỉ ĐẦY ĐỦ (đường + Phường + Tỉnh)
        // vì city/ward giờ tách khỏi ô địa chỉ.
        const newCityName = vnAddr ? fields.cityName : editingOrder.cityName || '';
        const newWardName = vnAddr ? fields.wardName : editingOrder.wardName || '';
        const fullAddr = [fields.address, newWardName, newCityName].filter(Boolean).join(', ');
        const addrChanged =
            (editingOrder.address || '') !== fields.address ||
            (editingOrder.cityName || '') !== newCityName ||
            (editingOrder.wardName || '') !== newWardName;
        let reDetected = null;
        if (addrChanged && !editingOrder.deliveryMethodManual) {
            reDetected = NO._detectDelivery(fullAddr);
            if (reDetected) {
                fields.deliveryMethod = reDetected.value;
                fields.deliveryMethodLabel = reDetected.label;
                fields.deliveryMethodManual = false;
            }
        }

        // Optimistic order shape: merge fields vào order cũ.
        const optimisticOrder = {
            ...editingOrder,
            customerName: fields.customerName,
            phone: fields.phone,
            address: fields.address,
            userNote: fields.userNote,
            status: fields.status,
            ...(vnAddr
                ? {
                      cityCode: fields.cityCode,
                      cityName: fields.cityName,
                      wardCode: fields.wardCode,
                      wardName: fields.wardName,
                  }
                : {}),
            ...(reDetected
                ? {
                      deliveryMethod: reDetected.value,
                      deliveryMethodLabel: reDetected.label,
                      deliveryMethodManual: false,
                  }
                : {}),
            products: fields.products,
            totalQuantity: fields.products.reduce((s, p) => s + (Number(p.quantity) || 0), 0),
            totalAmount: fields.products.reduce(
                (s, p) => s + (Number(p.quantity) || 0) * (Number(p.price) || 0),
                0
            ),
        };

        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => ({ ...editingOrder, products: [...(editingOrder.products || [])] }),
                apply: () => {
                    const idx = NO.STATE.orders.findIndex((x) => x.code === code);
                    if (idx !== -1) NO.STATE.orders[idx] = optimisticOrder;
                    NO.renderRows();
                    NO.closeEdit();
                },
                run: async () => {
                    return await window.NativeOrdersApi.update(code, fields);
                },
                onSuccess: (resp) => {
                    if (resp?.order) {
                        const idx = NO.STATE.orders.findIndex((x) => x.code === code);
                        if (idx !== -1) NO.STATE.orders[idx] = resp.order;
                        NO.renderRows();
                    }
                },
                rollback: (prev) => {
                    if (!prev) return;
                    const idx = NO.STATE.orders.findIndex((x) => x.code === code);
                    if (idx !== -1) NO.STATE.orders[idx] = prev;
                    NO.renderRows();
                },
                successMsg: 'Đã lưu',
                errLabel: `lưu đơn ${code}`,
            });
        } else {
            // Fallback nếu helper chưa load — keep old behavior.
            (async () => {
                try {
                    const resp = await window.NativeOrdersApi.update(code, fields);
                    const idx = NO.STATE.orders.findIndex((x) => x.code === code);
                    if (idx !== -1 && resp.order) NO.STATE.orders[idx] = resp.order;
                    NO.renderRows();
                    NO.notify('Đã lưu', 'success');
                    NO.closeEdit();
                } catch (e) {
                    NO.notify('Lỗi lưu: ' + e.message, 'error');
                }
            })();
        }
    };

    // UI-first: badge status đổi NGAY, PATCH chạy background. Lỗi → rollback.
    NO.quickStatus = function quickStatus(code, status) {
        const order = NO.STATE.orders.find((x) => x.code === code);
        if (!order) return;
        const prevStatus = order.status;
        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => prevStatus,
                apply: () => {
                    order.status = status;
                    NO.renderRows();
                },
                run: async () => {
                    return await window.NativeOrdersApi.update(code, { status });
                },
                onSuccess: (resp) => {
                    if (resp?.order) {
                        const idx = NO.STATE.orders.findIndex((x) => x.code === code);
                        if (idx !== -1) NO.STATE.orders[idx] = resp.order;
                        NO.renderRows();
                    }
                },
                rollback: (prev) => {
                    order.status = prev;
                    NO.renderRows();
                },
                successMsg: `Đã chuyển "${NO.STATUS_META[status]?.label || status}"`,
                errLabel: `chuyển trạng thái ${code}`,
            });
        } else {
            (async () => {
                try {
                    const resp = await window.NativeOrdersApi.update(code, { status });
                    const idx = NO.STATE.orders.findIndex((x) => x.code === code);
                    if (idx !== -1 && resp.order) NO.STATE.orders[idx] = resp.order;
                    NO.renderRows();
                    NO.notify(`Đã chuyển "${NO.STATUS_META[status]?.label || status}"`, 'success');
                } catch (e) {
                    NO.notify('Lỗi: ' + e.message, 'error');
                }
            })();
        }
    };
})();
