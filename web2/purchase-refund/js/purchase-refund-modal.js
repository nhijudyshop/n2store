// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// purchase-refund-modal.js — create/edit modal (legacy) + Picker (chọn SP đã
// nhận hàng từ Sổ Order, group theo ĐƠN NCC+shipment, key chọn/SL = aggId).
// ⚠ confirmPicker recompute total từ TOÀN BỘ textarea + clamp qty về 0..tồn.

(function () {
    'use strict';

    const PR = (window.PurchaseRefund = window.PurchaseRefund || {});
    const { GENERIC_API } = PR.const;
    const { STATE, PICKER_STATE } = PR.state;
    const { $, notify, fmtMoney, escapeHtml, _orderGroupKey, _orderGroupLabel, parseProducts } =
        PR.util;

    // ---------- Create / Edit Modal ----------
    // NCC dùng chung: gợi ý tên NCC trong form thủ công từ nguồn duy nhất
    // Web2SuppliersCache (Ví NCC / supplier-wallet). Form quick-refund vẫn lấy NCC
    // từ ngữ cảnh mua hàng (so-order) — không đụng.
    function _populateSupplierDatalist() {
        const dl = document.getElementById('prSupplierNameList');
        const cache = window.Web2SuppliersCache;
        if (!dl || !cache?.init) return;
        cache
            .init()
            .then(() => {
                const names = cache.getNames ? cache.getNames() : [];
                dl.innerHTML = names
                    .map((n) => `<option value="${escapeHtml(n)}"></option>`)
                    .join('');
            })
            .catch(() => {});
    }

    function openModal(existing) {
        const modal = $('prModal');
        modal.hidden = false;
        $('prModalTitle').textContent = existing
            ? `Sửa phiếu ${existing.code}`
            : 'Phiếu trả hàng NCC mới';

        const form = $('prForm');
        form.reset();
        _populateSupplierDatalist();
        if (existing) {
            const set = (name, val) => {
                if (form.elements[name]) form.elements[name].value = val ?? '';
            };
            set('code', existing.code);
            set('name', existing.name);
            set('supplierCode', existing.supplierCode);
            set('supplierName', existing.supplierName);
            set('supplierPhone', existing.supplierPhone);
            set('sourcePurchaseCode', existing.sourcePurchaseCode);
            set('refundDate', existing.refundDate);
            set('reason', existing.reason || 'defect');
            set('refundMethod', existing.refundMethod || 'bank');
            set('totalQty', existing.totalQty);
            set('totalAmount', existing.totalAmount);
            set('note', existing.note);
            // Products: serialize to pipe text
            const prods = parseProducts(existing.products);
            const text = prods
                .map((p) => `${p.code} | ${p.name} | ${p.qty} | ${p.price}`)
                .join('\n');
            set('productsText', text);
            form.dataset.editCode = existing.code;
        } else {
            // Auto-fill new code
            const today = new Date();
            const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
            const rnd = String(Math.floor(Math.random() * 999)).padStart(3, '0');
            form.elements['code'].value = `TRA-${ymd}-${rnd}`;
            form.elements['refundDate'].value = today.toISOString().slice(0, 10);
            delete form.dataset.editCode;
        }
    }
    function closeModal() {
        $('prModal').hidden = true;
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        const form = e.target;
        // Chống double-submit (audit HIGH 2026-06-20): click nhanh 2 lần tạo 2 phiếu.
        if (handleFormSubmit._busy) return;
        handleFormSubmit._busy = true;
        const submitBtn = form.querySelector('[type="submit"]') || e.submitter || null;
        if (submitBtn) submitBtn.disabled = true;
        const fd = new FormData(form);
        const productsText = fd.get('productsText') || '';
        const products = parseProducts(String(productsText));
        const payload = {
            code: fd.get('code'),
            name: fd.get('name'),
            data: {
                supplierCode: fd.get('supplierCode') || null,
                supplierName: fd.get('supplierName') || null,
                supplierPhone: fd.get('supplierPhone') || null,
                sourcePurchaseCode: fd.get('sourcePurchaseCode') || null,
                refundDate: fd.get('refundDate') || null,
                reason: fd.get('reason') || null,
                refundMethod: fd.get('refundMethod') || null,
                totalQty: Number(fd.get('totalQty') || 0),
                totalAmount: Number(fd.get('totalAmount') || 0),
                note: fd.get('note') || null,
                products,
                status: 'draft', // mới tạo = draft; edit thì giữ status cũ ở server side qua merge
            },
        };
        // NCC dùng chung: tên NCC nhập tay → đảm bảo tồn tại trong nguồn duy nhất
        // Ví NCC (fire-and-forget, idempotent). Không chặn submit nếu lỗi.
        if (payload.data.supplierName && window.Web2SuppliersCache?.ensure) {
            window.Web2SuppliersCache.ensure(payload.data.supplierName).catch(() => {});
        }
        const isEdit = !!form.dataset.editCode;
        try {
            if (isEdit) {
                const code = form.dataset.editCode;
                // Generic update merges JSONB → giữ status hiện tại nếu không gửi
                const existing = STATE.items.find((x) => x.code === code);
                if (existing?.status) payload.data.status = existing.status;
                if (existing?.stock_deducted != null)
                    payload.data.stock_deducted = existing.stock_deducted;
                await PR.api.fetchJson(`${GENERIC_API}/update/${encodeURIComponent(code)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                notify(`✓ Đã cập nhật phiếu ${code}`, 'success');
            } else {
                await PR.api.fetchJson(`${GENERIC_API}/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                notify(`✓ Đã tạo phiếu ${payload.code}`, 'success');
            }
            closeModal();
            await PR.api.loadList();
            PR.render.selectRefund(payload.code);
        } catch (e) {
            notify(`Lưu thất bại: ${e.message}`, 'error');
        } finally {
            handleFormSubmit._busy = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    // ---------- Picker: chọn SP đã nhận hàng từ so-order ----------
    async function openPicker() {
        if (!window.Web2ProductsCache) {
            notify('Web2ProductsCache chưa load — refresh trang', 'error');
            return;
        }
        PICKER_STATE.selectedCodes.clear();
        PICKER_STATE.qtyOverrides.clear();
        PICKER_STATE.search = '';
        try {
            await window.Web2ProductsCache.init();
        } catch (e) {
            notify(`Tải kho SP thất bại: ${e.message}`, 'error');
            return;
        }
        const { items, err } = await PR.api.loadSoOrderReceivedItems();
        if (err) {
            notify(`Tải so-order: ${err}`, 'warning');
        }
        PICKER_STATE.items = items;

        // Pre-fill supplier filter từ form NCC nếu có
        const formSupplier = $('prForm').elements['supplierName']?.value?.trim() || '';
        PICKER_STATE.supplierFilter = formSupplier;

        // Populate supplier dropdown — distinct từ so-order items
        const suppliers = Array.from(
            new Set(PICKER_STATE.items.map((p) => p.supplier).filter(Boolean))
        ).sort();
        const supSel = $('prPickerSupplierFilter');
        supSel.innerHTML =
            '<option value="">Tất cả NCC</option>' +
            suppliers
                .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
                .join('');
        supSel.value = PICKER_STATE.supplierFilter;
        $('prPickerSearch').value = '';
        $('prPickerOnlyStock').checked = PICKER_STATE.onlyStock;

        renderPicker();
        $('prPicker').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    }

    function closePicker() {
        $('prPicker').hidden = true;
    }

    function renderPicker() {
        const q = PICKER_STATE.search.trim().toLowerCase();
        const filtered = PICKER_STATE.items.filter((it) => {
            if (PICKER_STATE.supplierFilter && it.supplier !== PICKER_STATE.supplierFilter)
                return false;
            if (q) {
                const hay =
                    `${it.code} ${it.name} ${it.variant || ''} ${it.supplier}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        // Group by ĐƠN (NCC + shipment/đợt) — tách đơn khác nhau dù cùng NCC.
        const grouped = new Map();
        for (const it of filtered) {
            const k = _orderGroupKey(it);
            if (!grouped.has(k)) grouped.set(k, []);
            grouped.get(k).push(it);
        }

        const listEl = $('prPickerList');
        if (!grouped.size) {
            const emptyMsg = PICKER_STATE.items.length
                ? 'Không có SP nào phù hợp filter.'
                : 'Chưa có SP đã nhận hàng từ Sổ Order — vào Sổ Order → Nhận hàng trước.';
            listEl.innerHTML = `<div class="pr-picker-empty">${emptyMsg}</div>`;
            updatePickerCount();
            return;
        }
        let html = '';
        for (const [, items] of grouped) {
            const first = items[0];
            html += `<div class="pr-picker-group">
                <h4>${escapeHtml(first.supplier)} <span class="pr-source-order-tag">${escapeHtml(_orderGroupLabel(first))}</span> <span class="pr-picker-group-count">${items.length} SP đã nhận</span></h4>
                <table class="pr-picker-table">
                    <thead><tr>
                        <th style="width:32px"></th>
                        <th style="width:140px">Mã SP</th>
                        <th>Tên + Biến thể</th>
                        <th class="num" style="width:70px" title="Tổng SL đã đặt từ Sổ Order">Đã đặt</th>
                        <th class="num" style="width:70px" title="Tồn kho hiện tại = đã nhận, tối đa có thể trả">Tồn kho</th>
                        <th class="num" style="width:80px">Trả SL</th>
                        <th class="num" style="width:100px">Giá</th>
                    </tr></thead>
                    <tbody>
                ${items
                    .map((it) => {
                        const isPicked = PICKER_STATE.selectedCodes.has(it.aggId);
                        const stock = it.stock;
                        const qty = PICKER_STATE.qtyOverrides.get(it.aggId) ?? stock;
                        return `<tr data-pick-agg="${escapeHtml(it.aggId)}" class="${isPicked ? 'is-picked' : ''}">
                            <td><input type="checkbox" class="pr-pick-cb" ${isPicked ? 'checked' : ''}></td>
                            <td><code>${escapeHtml(it.code)}</code></td>
                            <td>${escapeHtml(it.name)}${it.variant ? ` <small style="color:#64748b">(${escapeHtml(it.variant)})</small>` : ''}</td>
                            <td class="num" style="color:#64748b">${it.orderedQty}</td>
                            <td class="num"><strong>${stock}</strong></td>
                            <td class="num"><input type="number" class="pr-pick-qty" min="1" max="${stock}" value="${qty}" style="width:60px;text-align:right;"></td>
                            <td class="num">${fmtMoney(it.price)}</td>
                        </tr>`;
                    })
                    .join('')}
                    </tbody>
                </table>
            </div>`;
        }
        listEl.innerHTML = html;
        updatePickerCount();
    }

    function updatePickerCount() {
        $('prPickerCount').textContent = `${PICKER_STATE.selectedCodes.size} SP đã chọn`;
    }

    function confirmPicker() {
        if (!PICKER_STATE.selectedCodes.size) {
            notify('Chưa chọn SP nào — tick checkbox bên trái', 'warning');
            return;
        }
        const lines = [];
        for (const aggId of PICKER_STATE.selectedCodes) {
            const it = PICKER_STATE.items.find((x) => x.aggId === aggId);
            if (!it) continue;
            const stock = it.stock;
            const qty = Math.min(Math.max(1, PICKER_STATE.qtyOverrides.get(aggId) ?? stock), stock);
            const nameWithVariant = it.variant ? `${it.name} (${it.variant})` : it.name;
            const price = Number(it.price) || 0;
            lines.push(`${it.code} | ${nameWithVariant} | ${qty} | ${price}`);
        }
        const textarea = $('prForm').elements['productsText'];
        const existing = (textarea.value || '').trim();
        textarea.value = existing ? `${existing}\n${lines.join('\n')}` : lines.join('\n');

        // C11 (2026-06-13): recompute totalQty + totalAmount từ TOÀN BỘ textarea
        // (gồm cả các lần pick trước), KHÔNG chỉ batch hiện tại. Trước đây chỉ điền
        // batch cuối + guard `!value` → pick nhiều lần ⇒ tổng thiếu ⇒ trừ ví NCC
        // sai. Picker là nguồn chuẩn của danh sách → set đè; muốn tổng tuỳ chỉnh
        // (chiết khấu) thì sửa tay SAU lần pick cuối. Dòng format: `code|name|qty|price`.
        const qtyInp = $('prForm').elements['totalQty'];
        const amtInp = $('prForm').elements['totalAmount'];
        let totalQtyAll = 0;
        let totalAmountAll = 0;
        for (const line of textarea.value.split('\n')) {
            const parts = line.split('|').map((s) => s.trim());
            if (parts.length < 4) continue;
            const lq = Number(parts[2]) || 0;
            const lp = Number(parts[3]) || 0;
            totalQtyAll += lq;
            totalAmountAll += lq * lp;
        }
        if (qtyInp) qtyInp.value = totalQtyAll;
        if (amtInp) amtInp.value = totalAmountAll;

        closePicker();
        notify(`✓ Đã thêm ${lines.length} SP vào danh sách`, 'success');
    }

    function wirePicker() {
        $('prPickFromKho')?.addEventListener('click', openPicker);
        $('prPickerConfirm')?.addEventListener('click', confirmPicker);
        document
            .querySelectorAll('[data-pr-picker-close]')
            .forEach((el) => el.addEventListener('click', closePicker));
        $('prPickerSearch')?.addEventListener('input', (e) => {
            PICKER_STATE.search = e.target.value;
            renderPicker();
        });
        $('prPickerSupplierFilter')?.addEventListener('change', (e) => {
            PICKER_STATE.supplierFilter = e.target.value;
            renderPicker();
        });
        $('prPickerOnlyStock')?.addEventListener('change', (e) => {
            PICKER_STATE.onlyStock = e.target.checked;
            renderPicker();
        });
        // Delegated change handler cho checkbox + qty input
        $('prPickerList')?.addEventListener('change', (e) => {
            const cb = e.target.closest('.pr-pick-cb');
            if (cb) {
                const row = cb.closest('[data-pick-agg]');
                if (!row) return;
                const aggId = row.dataset.pickAgg;
                if (cb.checked) PICKER_STATE.selectedCodes.add(aggId);
                else PICKER_STATE.selectedCodes.delete(aggId);
                row.classList.toggle('is-picked', cb.checked);
                updatePickerCount();
                return;
            }
            const qty = e.target.closest('.pr-pick-qty');
            if (qty) {
                const row = qty.closest('[data-pick-agg]');
                if (!row) return;
                const aggId = row.dataset.pickAgg;
                const v = Number(qty.value || 0);
                PICKER_STATE.qtyOverrides.set(aggId, v);
                // Auto-pick when user nhập qty mà chưa checkbox
                if (v > 0 && !PICKER_STATE.selectedCodes.has(aggId)) {
                    PICKER_STATE.selectedCodes.add(aggId);
                    const cb = row.querySelector('.pr-pick-cb');
                    if (cb) cb.checked = true;
                    row.classList.add('is-picked');
                    updatePickerCount();
                }
            }
        });
    }

    PR.modal = {
        _populateSupplierDatalist,
        openModal,
        closeModal,
        handleFormSubmit,
        openPicker,
        closePicker,
        renderPicker,
        updatePickerCount,
        confirmPicker,
        wirePicker,
    };
})();
