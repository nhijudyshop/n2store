// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Ví NCC — money mutations + modals: trả hàng (return), tạo NCC, thanh toán (payment).
//
// ⚠ MONEY surface — GIỮ NGUYÊN await + loading (btn.disabled) + idempotency txId +
// rollback toast. KHÔNG fire-and-forget. Tham chiếu state/utils/api qua `window.__SW`.

(function () {
    'use strict';

    const SW = (window.__SW = window.__SW || {});
    const fmtVnd = SW.fmtVnd;
    const escapeHtml = SW.escapeHtml;
    const notify = SW.notify;

    // ---------- Return modal ----------
    function openReturnModal() {
        const w = SW.walletState.wallets[SW.activeSupplier];
        const agg = SW.suppliers[SW.activeSupplier];
        if (!agg) return;
        document.getElementById('swReturnSupplier').textContent = SW.activeSupplier;
        const tbody = document.getElementById('swReturnBody');
        const available = agg.purchases.filter(
            (p) => !SW._isRowFullyReturned(w.returnedRowIds[p.rowId], p.qty)
        );
        if (!available.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">Không còn dòng nào để trả</td></tr>`;
        } else {
            tbody.innerHTML = available
                .map((p) => {
                    // [12] (2026-06-13): SL CÒN LẠI = SL mua − SL đã trả tích luỹ
                    // (returnedRowIds[rowId].qty). max/value/data-qty/total dùng remaining
                    // → KHÔNG cho trả quá phần còn lại (tránh over-refund khi trả nhiều đợt).
                    const already = Number(w.returnedRowIds[p.rowId]?.qty) || 0;
                    const remaining = Math.max(0, (Number(p.qty) || 0) - already);
                    const alreadyTag =
                        already > 0
                            ? ` <span style="color:#16a34a;font-size:11px;">(đã trả ${already})</span>`
                            : '';
                    return `<tr data-row-id="${escapeHtml(p.rowId)}" data-cost="${p.costVnd}" data-qty="${remaining}" data-ordered="${Number(p.qty) || 0}">
                <td><input type="checkbox" class="sw-return-check" /></td>
                <td>${escapeHtml(p.productName || '—')}</td>
                <td>${escapeHtml(p.variant || '—')}</td>
                <td class="num">${remaining}${alreadyTag}</td>
                <td class="num"><input type="number" class="sw-return-qty" min="0" max="${remaining}" value="${remaining}" /></td>
                <td class="num sw-return-line-total">${fmtVnd(remaining * p.costVnd)}</td>
            </tr>`;
                })
                .join('');
        }
        recalcReturnTotal();
        const rm = document.getElementById('swReturnModal');
        // HIGH-3 FIX: idempotency key sinh 1 lần mỗi lần mở modal — double-click /
        // retry dùng cùng txId → server ON CONFLICT(tx_id) chặn ghi đôi ledger.
        rm.dataset.txid = 'tx-return-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        rm.hidden = false;
    }

    function recalcReturnTotal() {
        let total = 0;
        document.querySelectorAll('#swReturnBody tr[data-row-id]').forEach((tr) => {
            const check = tr.querySelector('.sw-return-check');
            const qtyInput = tr.querySelector('.sw-return-qty');
            const lineEl = tr.querySelector('.sw-return-line-total');
            const cost = Number(tr.dataset.cost) || 0;
            const qty = Math.min(Number(qtyInput.value) || 0, Number(tr.dataset.qty) || 0);
            const sub = check.checked ? qty * cost : 0;
            // Hiện thành tiền dòng = sub (0 nếu chưa tích) → khớp với tổng (chỉ cộng
            // dòng đã tích); tránh hiển thị số tiền dòng chưa tích gây hiểu nhầm.
            lineEl.textContent = fmtVnd(sub);
            total += sub;
        });
        document.getElementById('swReturnTotal').textContent = fmtVnd(total);
    }

    async function confirmReturn() {
        const btn = document.getElementById('swReturnConfirmBtn');
        if (btn?.disabled) return; // guard: đang xử lý (chống double-click)
        const selectedRows = [];
        let total = 0;
        document.querySelectorAll('#swReturnBody tr[data-row-id]').forEach((tr) => {
            const check = tr.querySelector('.sw-return-check');
            if (!check.checked) return;
            const qty = Math.min(
                Number(tr.querySelector('.sw-return-qty').value) || 0,
                Number(tr.dataset.qty) || 0
            );
            const cost = Number(tr.dataset.cost) || 0;
            const amount = qty * cost;
            if (amount <= 0) return;
            // HIGH-4: gửi `ordered` (SL đã nhận của row) để server cap over-refund.
            const ordered = Number(tr.dataset.ordered) || 0;
            selectedRows.push({ rowId: tr.dataset.rowId, qty, amount, ordered });
            total += amount;
        });
        if (!selectedRows.length) {
            notify('Chưa chọn dòng nào để trả', 'warning');
            return;
        }
        if (btn) btn.disabled = true; // chống double-click ghi ledger 2 lần
        try {
            // FIX (logic): GHI LEDGER TRƯỚC (tiền là nguồn sự thật), CHỈ điều chỉnh
            // tồn kho SAU khi ledger ghi thành công. Trước đây stock adjust chạy
            // trước → nếu ledger fail thì kho đã bị giảm nhưng không có giao dịch trả
            // tương ứng (lệch tồn kho ↔ sổ ví).
            // ĐỢT E: money op — await server ledger; rowReturns lưu qty/amount
            // THẬT từng dòng (server merge vào returned_row_ids).
            const rowReturns = {};
            for (const r of selectedRows)
                rowReturns[r.rowId] = { qty: r.qty, amount: r.amount, ordered: r.ordered };
            try {
                await window.SupplierWalletStorage.addTransaction(
                    SW.walletState,
                    SW.activeSupplier,
                    {
                        type: 'return',
                        amount: total,
                        note: `Trả ${selectedRows.length} dòng`,
                        ref: { rowIds: selectedRows.map((r) => r.rowId), rows: selectedRows },
                        rowReturns,
                        // HIGH-3: txId idempotent sinh khi mở modal (chống double-submit).
                        txId: document.getElementById('swReturnModal').dataset.txid || undefined,
                        performedBy: SW._swBy(), // audit: ai ghi trả hàng
                    }
                );
            } catch (e) {
                notify(`Ghi trả hàng thất bại: ${e.message}`, 'error');
                return; // ledger fail → KHÔNG đụng tồn kho
            }
            // Stock adjust: trả NCC = xuất kho (giảm stock đã +qty khi sync).
            // Match qua productName. Best-effort, không chặn flow nếu fail (ledger
            // đã ghi xong → tiền là nguồn sự thật; lệch kho có thể sync lại sau).
            try {
                const agg = SW.suppliers[SW.activeSupplier];
                const adjustments = [];
                for (const sel of selectedRows) {
                    const p = agg?.purchases?.find((x) => x.rowId === sel.rowId);
                    if (!p) continue;
                    // E-match-ten fix (đợt E): ưu tiên MÃ SP của chính row so-order
                    // (p.code) — match tên không phân biệt variant trả nhầm SP.
                    const code =
                        p.code ||
                        window.Web2ProductsCache?.findByNameExact?.(p.productName)?.code ||
                        null;
                    if (code) {
                        adjustments.push({
                            code,
                            delta: -sel.qty,
                            reason: `Trả NCC ${SW.activeSupplier}`,
                        });
                    }
                }
                if (adjustments.length && window.Web2ProductsApi?.adjustStock) {
                    await window.Web2ProductsApi.adjustStock(adjustments);
                    window.Web2ProductsCache?.pushTickle?.({ action: 'supplier-return' });
                }
            } catch (e) {
                console.warn('[supplier-wallet] stock adjust fail:', e.message);
            }
            notify(`Đã ghi trả hàng ${fmtVnd(total)} cho ${SW.activeSupplier}`, 'success');
            document.getElementById('swReturnModal').hidden = true;
            SW.renderList();
            SW.openDetail(SW.activeSupplier);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ---------- Create NCC modal ----------
    function openCreateModal() {
        const input = document.getElementById('swCreateName');
        if (input) input.value = '';
        document.getElementById('swCreateModal').hidden = false;
        setTimeout(() => input?.focus(), 80);
    }

    async function confirmCreate() {
        const input = document.getElementById('swCreateName');
        const rawName = (input?.value || '').trim();
        if (!rawName) {
            notify('Cần nhập tên NCC', 'warning');
            input?.focus();
            return;
        }
        // Đối chiếu case-insensitive với state hiện tại trước khi viết.
        const existingKey = Object.keys(SW.walletState.wallets || {}).find(
            (k) => k.toLowerCase() === rawName.toLowerCase()
        );
        if (existingKey) {
            notify(`NCC "${existingKey}" đã tồn tại`, 'warning');
            document.getElementById('swCreateModal').hidden = true;
            return;
        }
        // FIX (data-loss): ghi server TRƯỚC, chỉ mutate state local SAU khi server
        // xác nhận. Tránh để lại NCC "mồ côi" chỉ tồn tại ở local IDB/localStorage/RAM
        // khi ensure() thất bại (trước đây getOrCreateWallet+save chạy trước await).
        // ĐỢT E: NCC mới ghi vào meta server (atomic ON CONFLICT) qua cache.
        if (window.Web2SuppliersCache?.ensure) {
            try {
                await window.Web2SuppliersCache.ensure(rawName);
            } catch (e) {
                notify(`Lưu NCC lên server thất bại: ${e.message}`, 'error');
                return;
            }
        }
        // Server đã xác nhận → tạo wallet entry rỗng + lưu local cache (bảo toàn
        // migration shape). Web2SuppliersCache cũng phát SSE cho các trang khác.
        window.SupplierWalletStorage.getOrCreateWallet(SW.walletState, rawName);
        window.SupplierWalletStorage.save(SW.walletState);
        notify(`Đã tạo NCC "${rawName}"`, 'success');
        document.getElementById('swCreateModal').hidden = true;
        SW.renderList();
    }

    // ---------- Payment modal ----------
    function openPayModal() {
        document.getElementById('swPaySupplier').textContent = SW.activeSupplier;
        document.getElementById('swPayAmount').value = 0;
        document.getElementById('swPayNote').value = '';
        const pm = document.getElementById('swPayModal');
        // HIGH-3 FIX: idempotency key per modal-open (chống ghi đôi thanh toán).
        pm.dataset.txid = 'tx-pay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        pm.hidden = false;
        // Task 7: autofocus + select so typing replaces the prefilled 0
        setTimeout(() => {
            const el = document.getElementById('swPayAmount');
            el?.focus();
            el?.select();
        }, 30);
    }

    async function confirmPay() {
        const btn = document.getElementById('swPayConfirmBtn');
        if (btn?.disabled) return; // guard: đang xử lý (chống double-click)
        const amount = Number(document.getElementById('swPayAmount').value) || 0;
        const note = document.getElementById('swPayNote').value || '';
        if (amount <= 0) {
            notify('Số tiền phải > 0', 'warning');
            return;
        }
        if (btn) btn.disabled = true; // chống double-click ghi ledger 2 lần
        try {
            // ĐỢT E: money op — await server, lỗi → toast, KHÔNG ghi local lệch.
            await window.SupplierWalletStorage.addTransaction(SW.walletState, SW.activeSupplier, {
                type: 'payment',
                amount,
                note: note || 'Thanh toán',
                // HIGH-3: txId idempotent sinh khi mở modal (chống double-submit).
                txId: document.getElementById('swPayModal').dataset.txid || undefined,
                performedBy: SW._swBy(), // audit: ai ghi thanh toán
            });
            notify(`Đã ghi thanh toán ${fmtVnd(amount)} cho ${SW.activeSupplier}`, 'success');
            document.getElementById('swPayModal').hidden = true;
            SW.renderList();
            SW.openDetail(SW.activeSupplier);
        } catch (e) {
            notify(`Ghi thanh toán thất bại: ${e.message}`, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    SW.openReturnModal = openReturnModal;
    SW.recalcReturnTotal = recalcReturnTotal;
    SW.confirmReturn = confirmReturn;
    SW.openCreateModal = openCreateModal;
    SW.confirmCreate = confirmCreate;
    SW.openPayModal = openPayModal;
    SW.confirmPay = confirmPay;
})();
