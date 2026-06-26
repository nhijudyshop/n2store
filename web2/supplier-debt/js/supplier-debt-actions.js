// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Báo cáo công nợ NCC — action handlers: modal Ghi chú + modal Thanh toán.
// ⚠ MONEY OP: confirmPay giữ NGUYÊN pattern await server TRƯỚC + loading state +
// guard double-submit (btn.disabled / txid idempotent). MOVE-only split
// (2026-06-18) khỏi supplier-debt-app.js — body giữ nguyên byte.
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

    // ---------- Payment modal ----------
    function openPayModal(supplierKey) {
        const row = STATE.rows.find((r) => r.supplier === supplierKey);
        if (!row) return;
        const today = vnDate(new Date());
        document.getElementById('sdPaySupplier').textContent = row.code
            ? `[${row.code}] ${row.supplier.startsWith(row.code + ' ') ? row.supplier : row.code + ' ' + row.supplier}`
            : row.supplier;
        document.getElementById('sdPaySummary').innerHTML = `
            <div class="sd-pay-row"><span>Tổng mua:</span><strong>${fmtVnd(row.debit + row._purchasesBefore)}</strong></div>
            <div class="sd-pay-row"><span>Đã thanh toán:</span><strong>${fmtVnd(row.credit + row._txBefore)}</strong></div>
            <div class="sd-pay-row sd-pay-row-strong"><span>Còn nợ:</span><strong>${fmtVnd(row.ending)}</strong></div>
        `;
        document.getElementById('sdPayDate').value = today;
        if (window.Web2NumberInput)
            Web2NumberInput.setValue(document.getElementById('sdPayAmount'), '');
        else document.getElementById('sdPayAmount').value = '';
        document.getElementById('sdPayNote').value = '';
        document.getElementById('sdPayModal').hidden = false;
        document.getElementById('sdPayModal').dataset.supplier = supplierKey;
        // HIGH-3: idempotency key per modal-open (chống ghi đôi thanh toán).
        document.getElementById('sdPayModal').dataset.txid =
            'tx-pay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        if (window.lucide?.createIcons) window.lucide.createIcons();
        setTimeout(() => {
            const el = document.getElementById('sdPayAmount');
            el?.focus();
            el?.select();
        }, 30);
    }

    async function confirmPay() {
        const modal = document.getElementById('sdPayModal');
        const btn = document.getElementById('sdPayConfirmBtn');
        if (btn?.disabled) return; // guard: already saving
        const supplier = modal.dataset.supplier;
        const date = document.getElementById('sdPayDate').value;
        const amount =
            (window.Web2NumberInput
                ? Web2NumberInput.getValue(document.getElementById('sdPayAmount'))
                : Number(document.getElementById('sdPayAmount').value)) || 0;
        const note = document.getElementById('sdPayNote').value || '';
        if (amount <= 0) {
            notify('Số tiền phải > 0', 'warning');
            return;
        }
        const origLabel = btn?.innerHTML;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2"></i> Đang lưu…';
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
        try {
            const moveName = await SD.recordPayment(
                supplier,
                amount,
                date,
                note,
                modal.dataset.txid
            );
            notify(`Đã ghi ${moveName}: ${fmtVnd(amount)} cho ${supplier}`, 'success');
            modal.hidden = true;
            SD.applyFilterAndRender();
        } catch (e) {
            notify(e.message || 'Lỗi ghi thanh toán', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                if (origLabel) btn.innerHTML = origLabel;
                if (window.lucide?.createIcons) window.lucide.createIcons();
            }
        }
    }

    // expose to namespace
    SD.openNoteModal = openNoteModal;
    SD.confirmNote = confirmNote;
    SD.openPayModal = openPayModal;
    SD.confirmPay = confirmPay;
})();
