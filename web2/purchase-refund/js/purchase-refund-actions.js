// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// purchase-refund-actions.js — ⚠ MONEY surface. State-machine handleAction +
// Quick Refund (1 SP) + Bulk Refund (cả đơn). Mọi mutation: guard re-entry +
// disable submit TRƯỚC khi sinh mã (chống double-submit trừ kho/ghi ví NCC 2 lần)
// + await + loading state + confirm. quick-refund server ATOMIC (trừ kho từng
// dòng + ghi ledger ví NCC theo totalAmount, idempotent theo txId=code).

(function () {
    'use strict';

    const PR = (window.PurchaseRefund = window.PurchaseRefund || {});
    const { SM_API } = PR.const;
    const { STATE, SOURCE_STATE, QUICK_STATE, BULK_STATE } = PR.state;
    const { $, notify, fmtMoney, escapeHtml, thumbHtml, _orderGroupLabel, _currentUserInfo } =
        PR.util;
    const { fetchJson, loadList } = PR.api;

    // ---------- State machine actions ----------
    async function handleAction(action) {
        const code = STATE.selected?.code;
        if (!code) return;
        if (action === 'edit') {
            PR.modal.openModal(STATE.selected);
            return;
        }
        if (action === 'approve') {
            if (
                !(await Popup.confirm(
                    `Duyệt phiếu ${code}? Stock kho sẽ TRỪ qty cho từng SP. Hành động idempotent.`
                ))
            )
                return;
            try {
                const res = await fetchJson(`${SM_API}/${encodeURIComponent(code)}/approve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: _currentUserInfo().userId,
                        userName: _currentUserInfo().userName,
                    }),
                });
                const n = res.linesProcessed || 0;
                notify(
                    res.idempotent
                        ? `Phiếu ${code} đã ở trạng thái duyệt (không đổi)`
                        : `✓ Đã duyệt ${code}. Trừ kho ${n} dòng SP.`,
                    'success'
                );
                await loadList();
                PR.render.selectRefund(code);
            } catch (e) {
                notify(`Duyệt thất bại: ${e.message}`, 'error');
            }
            return;
        }
        if (action === 'cancel-approve') {
            const reason = await Popup.prompt('Lý do hủy duyệt (sẽ trả tồn về):', {
                defaultValue: '',
            });
            if (reason === null) return;
            try {
                const res = await fetchJson(
                    `${SM_API}/${encodeURIComponent(code)}/cancel-approve`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            reason,
                            userId: _currentUserInfo().userId,
                            userName: _currentUserInfo().userName,
                        }),
                    }
                );
                notify(`✓ Đã trả tồn về (${res.linesProcessed || 0} dòng SP)`, 'success');
                await loadList();
                PR.render.selectRefund(code);
            } catch (e) {
                notify(`Hủy duyệt thất bại: ${e.message}`, 'error');
            }
            return;
        }
        if (action === 'refunded') {
            const method = await Popup.prompt('Phương thức hoàn (cash/bank/debt_offset/replace):', {
                defaultValue: STATE.selected.refundMethod || 'bank',
            });
            if (method === null) return;
            try {
                await fetchJson(`${SM_API}/${encodeURIComponent(code)}/refunded`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        refundMethod: method,
                        userId: _currentUserInfo().userId,
                        userName: _currentUserInfo().userName,
                    }),
                });
                notify(`✓ Đã ghi nhận NCC hoàn tiền`, 'success');
                await loadList();
                PR.render.selectRefund(code);
            } catch (e) {
                notify(`Đánh dấu hoàn tiền thất bại: ${e.message}`, 'error');
            }
            return;
        }
        if (action === 'reject') {
            const reason = await Popup.prompt('Lý do NCC từ chối (sẽ trả tồn nếu đã trừ):', {
                defaultValue: '',
            });
            if (reason === null) return;
            try {
                const res = await fetchJson(`${SM_API}/${encodeURIComponent(code)}/reject`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        reason,
                        userId: _currentUserInfo().userId,
                        userName: _currentUserInfo().userName,
                    }),
                });
                notify(
                    `✓ Đã từ chối${res.linesProcessed ? ` + trả tồn ${res.linesProcessed} dòng` : ''}`,
                    'success'
                );
                await loadList();
                PR.render.selectRefund(code);
            } catch (e) {
                notify(`Từ chối thất bại: ${e.message}`, 'error');
            }
            return;
        }
    }

    // ---------- Quick Refund Modal ----------
    function openQuickRefund(aggId) {
        const item = SOURCE_STATE.items.find((it) => it.aggId === aggId);
        if (!item) {
            notify('SP không còn trong danh sách', 'error');
            return;
        }
        QUICK_STATE.item = item;
        const form = $('prQuickForm');
        form.reset();
        form.elements['qty'].value = item.stock;
        form.elements['qty'].max = item.stock;
        if (window.Web2NumberInput) Web2NumberInput.setValue(form.elements['price'], item.price);
        else form.elements['price'].value = item.price;
        $('prQuickQtyHint').querySelector('span').textContent = String(item.stock);

        $('prQuickInfo').innerHTML = `
            <div class="pr-quick-info-row" style="align-items:center;">
                <span class="pr-quick-label">Ảnh:</span>
                ${thumbHtml(item.imageUrl)}
            </div>
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">NCC:</span>
                <strong>${escapeHtml(item.supplier)}</strong>
            </div>
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">Đơn:</span>
                <span>${escapeHtml(_orderGroupLabel(item))}</span>
            </div>
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">Mã SP:</span>
                <code>${escapeHtml(item.code)}</code>
            </div>
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">Tên SP:</span>
                ${escapeHtml(item.name)}${item.variant ? ` <small style="color:#64748b">(${escapeHtml(item.variant)})</small>` : ''}
            </div>
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">Tồn kho:</span>
                <strong>${item.stock}</strong>
                <span style="color:#64748b">· đã đặt qua Sổ Order ${item.orderedQty}</span>
            </div>
        `;
        updateQuickTotal();
        $('prQuickModal').hidden = false;
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => form.elements['qty'].focus(), 50);
    }

    function closeQuickRefund() {
        $('prQuickModal').hidden = true;
        QUICK_STATE.item = null;
    }

    function updateQuickTotal() {
        const form = $('prQuickForm');
        const qty = Number(form.elements['qty'].value) || 0;
        const price =
            (window.Web2NumberInput
                ? Web2NumberInput.getValue(form.elements['price'])
                : Number(form.elements['price'].value)) || 0;
        $('prQuickTotal').textContent = fmtMoney(qty * price);
    }

    /**
     * Submit quick refund:
     *   1. POST /api/web2/purchase-refund/create — tạo phiếu draft
     *   2. POST /api/purchase-refund/:code/approve — trừ stock idempotent
     *   3. SupplierWalletStorage.addTransaction type='return' — giảm balance NCC
     *   4. Push wallet → Firestore
     */
    async function submitQuickRefund(e) {
        e.preventDefault();
        const item = QUICK_STATE.item;
        if (!item) return;
        const form = $('prQuickForm');
        const qty = Math.max(1, Math.min(item.stock, Number(form.elements['qty'].value) || 0));
        const price =
            (window.Web2NumberInput
                ? Web2NumberInput.getValue(form.elements['price'])
                : Number(form.elements['price'].value)) || 0;
        const reason = form.elements['reason'].value;
        const method = form.elements['refundMethod'].value;
        const note = form.elements['note'].value || '';
        const amount = qty * price;

        // HIGH-2 FIX (2026-06-18): guard re-entry + disable TRƯỚC khi sinh mã. Trước
        // đây refundCode (random) sinh trước khi disable → double-submit (Enter/2 click
        // nhanh/programmatic) tạo 2 mã khác nhau → 2 phiếu = trừ kho + ghi ví NCC 2 lần.
        const submitBtn = $('prQuickSubmit');
        if (submitBtn.disabled) return;
        submitBtn.disabled = true;
        const orig = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i data-lucide="loader"></i> Đang xử lý...';

        // Gen mã phiếu: TRA-<yyyymmdd>-<NCCshort>-<rand4>
        const today = new Date();
        const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const ncShort = (item.supplier || 'NCC')
            .replace(/[^A-Z0-9]/gi, '')
            .toUpperCase()
            .slice(0, 6);
        const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
        const refundCode = `TRA-${ymd}-${ncShort}-${rand}`;
        const refundName = `Trả ${item.name}${item.variant ? ' (' + item.variant + ')' : ''} cho ${item.supplier}`;

        const userInfo = _currentUserInfo();
        try {
            // C9 (2026-06-13): 1 LẦN GỌI ATOMIC thay 3 bước rời (create→approve→
            // wallet). Server tạo phiếu (approved) + trừ kho + ghi ledger ví NCC
            // trong 1 transaction → approve fail KHÔNG còn để lại phiếu draft mồ côi.
            const productName = item.variant ? `${item.name} (${item.variant})` : item.name;
            await fetchJson(`${SM_API}/quick-refund`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: refundCode,
                    name: refundName,
                    supplier: item.supplier,
                    supplierCode: null,
                    refundDate: today.toISOString().slice(0, 10),
                    reason,
                    refundMethod: method,
                    totalQty: qty,
                    totalAmount: amount,
                    note,
                    products: [{ code: item.code, name: productName, qty, price }],
                    sourcePurchaseCode: item.sources?.[0]?.ship || null,
                    userId: userInfo.userId,
                    userName: userInfo.userName,
                }),
            });

            notify(
                `✓ Đã trả ${qty} ${item.name} cho ${item.supplier} — giảm ví NCC ${fmtMoney(amount)}`,
                'success'
            );
            closeQuickRefund();
            // Reload section A (stock đã giảm) + section B (phiếu mới). Ví NCC cập
            // nhật realtime qua SSE web2:supplier-wallet (server đã _notify).
            // quick-refund KHÔNG notify SSE 'web2:products' → ép refresh cache để
            // section A hiện tồn kho mới (init() idempotent sẽ giữ stock cũ).
            await window.Web2ProductsCache?.refresh?.().catch(() => {});
            await PR.render.loadSourceItems();
            await loadList();
        } catch (e) {
            console.error('[quick refund] fail:', e);
            notify(`Trả NCC thất bại: ${e.message}`, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = orig;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    function wireQuickModal() {
        $('prQuickForm').addEventListener('submit', submitQuickRefund);
        document
            .querySelectorAll('[data-pr-quick-close]')
            .forEach((el) => el.addEventListener('click', closeQuickRefund));
        const form = $('prQuickForm');
        form.elements['qty'].addEventListener('input', updateQuickTotal);
        form.elements['price'].addEventListener('input', updateQuickTotal);
        // Esc to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !$('prQuickModal').hidden) closeQuickRefund();
        });
    }

    // ---------- Bulk Refund Modal (trả cả đơn 1 lần, SL mặc định 0) ----------
    //
    // User ask 2026-06-17: nút "Trả hàng" ở header NHÓM (đơn) → mở modal gồm
    // TẤT CẢ SP của đơn, mỗi SP 1 ô SL mặc định 0 để chỉnh → nhanh hơn trả từng
    // cái. Submit 1 phiếu quick-refund đa SP (backend đã atomic: trừ kho từng
    // dòng + ghi ví NCC theo totalAmount). CHỈ SP có SL>0 mới đưa vào phiếu.

    function openBulkRefund(groupIdx) {
        const group = SOURCE_STATE.groups[groupIdx];
        if (!group || !group.length) {
            notify('Đơn không còn SP nào', 'error');
            return;
        }
        BULK_STATE.group = group;
        const first = group[0];
        const form = $('prBulkForm');
        form.reset();

        $('prBulkInfo').innerHTML = `
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">NCC:</span>
                <strong>${escapeHtml(first.supplier)}</strong>
            </div>
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">Đơn:</span>
                <span>${escapeHtml(_orderGroupLabel(first))}</span>
            </div>
            <div class="pr-quick-info-row">
                <span class="pr-quick-label">Số SP:</span>
                <strong>${group.length}</strong>
                <span style="color:#64748b">· nhập SL muốn trả cho từng dòng</span>
            </div>
        `;
        renderBulkRows();
        updateBulkTotal();
        $('prBulkModal').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    }

    function renderBulkRows() {
        const group = BULK_STATE.group || [];
        $('prBulkRows').innerHTML = group
            .map(
                (it, i) => `<tr data-bulk-idx="${i}">
                    <td><code>${escapeHtml(it.code)}</code></td>
                    <td><div class="pr-name-cell">${thumbHtml(it.imageUrl)}<span>${escapeHtml(it.name)}${it.variant ? ` <small style="color:#64748b">(${escapeHtml(it.variant)})</small>` : ''}</span></div></td>
                    <td class="num"><strong>${it.stock}</strong></td>
                    <td class="num">${fmtMoney(it.price)}</td>
                    <td class="num"><input type="number" class="pr-bulk-qty" min="0" max="${it.stock}" value="0" data-bulk-idx="${i}"></td>
                    <td class="num pr-bulk-line" data-bulk-line="${i}">0₫</td>
                </tr>`
            )
            .join('');
    }

    // Đọc qty từng dòng (clamp 0..stock), trả [{item, qty}] cho SP có qty>0.
    function _collectBulkLines() {
        const group = BULK_STATE.group || [];
        const out = [];
        document.querySelectorAll('#prBulkRows .pr-bulk-qty').forEach((inp) => {
            const i = Number(inp.dataset.bulkIdx);
            const it = group[i];
            if (!it) return;
            const qty = Math.max(0, Math.min(Number(it.stock) || 0, Number(inp.value) || 0));
            if (qty > 0) out.push({ item: it, qty });
        });
        return out;
    }

    function updateBulkTotal() {
        const group = BULK_STATE.group || [];
        let totalQty = 0;
        let totalAmount = 0;
        document.querySelectorAll('#prBulkRows .pr-bulk-qty').forEach((inp) => {
            const i = Number(inp.dataset.bulkIdx);
            const it = group[i];
            if (!it) return;
            const qty = Math.max(0, Math.min(Number(it.stock) || 0, Number(inp.value) || 0));
            const line = qty * (Number(it.price) || 0);
            totalQty += qty;
            totalAmount += line;
            const cell = document.querySelector(`#prBulkRows [data-bulk-line="${i}"]`);
            if (cell) cell.textContent = fmtMoney(line);
            const row = inp.closest('tr');
            if (row) row.classList.toggle('is-on', qty > 0);
        });
        $('prBulkQty').textContent = String(totalQty);
        $('prBulkTotal').textContent = fmtMoney(totalAmount);
    }

    function closeBulkRefund() {
        $('prBulkModal').hidden = true;
        BULK_STATE.group = null;
    }

    async function submitBulkRefund(e) {
        e.preventDefault();
        const lines = _collectBulkLines();
        if (!lines.length) {
            notify('Chưa nhập SL cho SP nào (mặc định 0) — nhập SL muốn trả', 'warning');
            return;
        }
        const form = $('prBulkForm');
        const first = BULK_STATE.group[0];
        const supplier = first.supplier;
        const reason = form.elements['reason'].value;
        const method = form.elements['refundMethod'].value;
        const note = form.elements['note'].value || '';

        const products = lines.map(({ item, qty }) => ({
            code: item.code,
            name: item.variant ? `${item.name} (${item.variant})` : item.name,
            qty,
            price: Number(item.price) || 0,
        }));
        const totalQty = lines.reduce((s, l) => s + l.qty, 0);
        const totalAmount = lines.reduce((s, l) => s + l.qty * (Number(l.item.price) || 0), 0);

        // HIGH-2 FIX: guard re-entry + disable TRƯỚC khi sinh mã (chống double-submit
        // tạo 2 phiếu trừ kho/ghi ví NCC 2 lần).
        const submitBtn = $('prBulkSubmit');
        if (submitBtn.disabled) return;
        submitBtn.disabled = true;
        const orig = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i data-lucide="loader"></i> Đang xử lý...';
        if (window.lucide) window.lucide.createIcons();

        // Mã + tên phiếu (gộp cả đơn).
        const today = new Date();
        const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const ncShort = (supplier || 'NCC')
            .replace(/[^A-Z0-9]/gi, '')
            .toUpperCase()
            .slice(0, 6);
        const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
        const refundCode = `TRA-${ymd}-${ncShort}-${rand}`;
        const refundName = `Trả ${products.length} SP cho ${supplier}`;

        const userInfo = _currentUserInfo();
        try {
            // 1 phiếu quick-refund đa SP — atomic ở server (trừ kho từng dòng +
            // ghi ledger ví NCC theo totalAmount, idempotent theo txId=code).
            await fetchJson(`${SM_API}/quick-refund`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: refundCode,
                    name: refundName,
                    supplier,
                    supplierCode: null,
                    refundDate: today.toISOString().slice(0, 10),
                    reason,
                    refundMethod: method,
                    totalQty,
                    totalAmount,
                    note,
                    products,
                    sourcePurchaseCode: first.shipmentId || first.sources?.[0]?.ship || null,
                    userId: userInfo.userId,
                    userName: userInfo.userName,
                }),
            });
            notify(
                `✓ Đã trả ${totalQty} SP (${products.length} dòng) cho ${supplier} — giảm ví NCC ${fmtMoney(totalAmount)}`,
                'success'
            );
            closeBulkRefund();
            // quick-refund KHÔNG notify SSE 'web2:products' → ép refresh cache để
            // section A hiện tồn kho mới (init() idempotent giữ stock cũ).
            await window.Web2ProductsCache?.refresh?.().catch(() => {});
            await PR.render.loadSourceItems();
            await loadList();
        } catch (err) {
            console.error('[bulk refund] fail:', err);
            notify(`Trả NCC thất bại: ${err.message}`, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = orig;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    function wireBulkModal() {
        $('prBulkForm')?.addEventListener('submit', submitBulkRefund);
        document
            .querySelectorAll('[data-pr-bulk-close]')
            .forEach((el) => el.addEventListener('click', closeBulkRefund));
        // Live total khi đổi qty bất kỳ dòng nào. Clamp input về 0..tồn để user
        // thấy đúng số (không cho gõ vượt tồn kho).
        $('prBulkRows')?.addEventListener('input', (e) => {
            const inp = e.target.closest('.pr-bulk-qty');
            if (!inp) return;
            const group = BULK_STATE.group || [];
            const it = group[Number(inp.dataset.bulkIdx)];
            if (it && inp.value !== '') {
                const max = Number(it.stock) || 0;
                let v = Math.floor(Number(inp.value) || 0);
                if (v < 0) v = 0;
                if (v > max) v = max;
                if (String(v) !== inp.value) inp.value = String(v);
            }
            updateBulkTotal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !$('prBulkModal').hidden) closeBulkRefund();
        });
    }

    PR.actions = {
        handleAction,
        openQuickRefund,
        closeQuickRefund,
        updateQuickTotal,
        submitQuickRefund,
        wireQuickModal,
        openBulkRefund,
        renderBulkRows,
        updateBulkTotal,
        closeBulkRefund,
        submitBulkRefund,
        wireBulkModal,
    };
})();
