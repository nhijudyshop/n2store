// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Báo cáo công nợ NCC — action handlers: modal Ghi chú + mở modal Thanh toán.
// ⚠ MONEY OP: thanh toán giờ dùng CHUNG Web2SupplierPay (web2/shared) — component
// giữ await server TRƯỚC + loading + rollback + txId idempotent. openPayModal chỉ
// truyền context (NCC cố định + summary nợ + history) + onSubmit gọi SD.recordPayment.
// Cross-module qua namespace SD: getNoteForRow/saveSupplierNote/recordPayment (api),
// applyFilterAndRender (render), vnDate/fmtVnd/notify (state).

(function () {
    'use strict';

    const SD = (window.__SupplierDebt = window.__SupplierDebt || {});
    const STATE = SD.STATE;
    const { vnDate, fmtVnd, notify } = SD;

    // ---------- Note modal ----------
    function openNoteModal(supplierKey) {
        const row = STATE.rows.find((r) => r.supplier === supplierKey);
        if (!row) return;
        const note = SD.getNoteForRow(row);
        document.getElementById('sdEditNoteSupplier').textContent = row.code
            ? `[${row.code}] ${row.supplier.startsWith(row.code + ' ') ? row.supplier : row.code + ' ' + row.supplier}`
            : row.supplier;
        document.getElementById('sdNoteTextarea').value = note;
        document.getElementById('sdEditNoteModal').hidden = false;
        document.getElementById('sdEditNoteModal').dataset.supplier = supplierKey;
        document.getElementById('sdEditNoteModal').dataset.code = row.code || '';
        if (window.lucide?.createIcons) window.lucide.createIcons();
        setTimeout(() => document.getElementById('sdNoteTextarea')?.focus(), 30);
    }

    async function confirmNote() {
        const modal = document.getElementById('sdEditNoteModal');
        const supplier = modal.dataset.supplier;
        const code = modal.dataset.code || '';
        const note = document.getElementById('sdNoteTextarea').value || '';
        try {
            await SD.saveSupplierNote(supplier, code, note);
            notify('Đã lưu ghi chú', 'success');
            modal.hidden = true;
            SD.applyFilterAndRender();
        } catch (e) {
            notify(e.message || 'Lỗi lưu ghi chú', 'error');
        }
    }

    // ---------- Payment modal → dùng CHUNG Web2SupplierPay (2026-06-28) ----------
    // NCC cố định (1 hàng = 1 NCC) + summary công nợ + lịch sử thanh toán NCC.
    // Bút toán vẫn qua SD.recordPayment (ledger /tx, idempotent txId). Money op:
    // component giữ await + loading + rollback toast.
    function openPayModal(supplierKey) {
        if (!window.Web2SupplierPay) {
            notify('Module thanh toán chưa load — refresh trang', 'error');
            return;
        }
        const row = STATE.rows.find((r) => r.supplier === supplierKey);
        if (!row) return;
        const display = row.code
            ? `[${row.code}] ${row.supplier.startsWith(row.code + ' ') ? row.supplier : row.code + ' ' + row.supplier}`
            : row.supplier;
        // Lịch sử = các bút toán payment của NCC này (ledger).
        const w = STATE.walletData?.wallets?.[supplierKey];
        const history = ((w && w.transactions) || [])
            .filter((t) => t.type === 'payment')
            .map((t) => ({
                ts: Number(t.ts) || 0,
                supplier: display,
                amountVnd: Number(t.amount) || 0,
                moveName: t.moveName || '',
            }))
            .sort((a, b) => b.ts - a.ts);
        window.Web2SupplierPay.open({
            title: `Thanh toán NCC: ${display}`,
            summary: [
                { label: 'Tổng mua', value: fmtVnd(row.debit + row._purchasesBefore) },
                { label: 'Đã thanh toán', value: fmtVnd(row.credit + row._txBefore) },
                { label: 'Còn nợ', value: fmtVnd(row.ending), tone: 'danger' },
            ],
            ncc: { mode: 'fixed', value: supplierKey, display },
            amountVnd: Math.max(0, Math.round(row.ending)),
            historyHead: 'Lịch sử thanh toán NCC',
            history,
            onSubmit: async ({ amountVnd, date, note, txId }) => {
                const moveName = await SD.recordPayment(supplierKey, amountVnd, date, note, txId);
                notify(`Đã ghi ${moveName}: ${fmtVnd(amountVnd)} cho ${supplierKey}`, 'success');
                SD.applyFilterAndRender();
            },
        });
    }

    // expose to namespace
    SD.openNoteModal = openNoteModal;
    SD.confirmNote = confirmNote;
    SD.openPayModal = openPayModal;
})();
