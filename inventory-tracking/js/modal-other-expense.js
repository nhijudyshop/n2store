// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL OTHER EXPENSE - INVENTORY TRACKING
// Phase 4: Modal for add/edit other expenses
// =====================================================

let currentExpense = null;

/**
 * Open expense modal
 */
function openExpenseModal(expense = null) {
    currentExpense = expense;

    const modal = document.getElementById('modalExpense');
    const title = document.getElementById('modalExpenseTitle');

    if (title) {
        title.textContent = expense ? 'Sua Chi Phi Khac' : 'Them Chi Phi Khac';
    }

    // Fill form data
    const dateInput = document.getElementById('expenseDate');
    const typeInput = document.getElementById('expenseType');
    const amountInput = document.getElementById('expenseAmount');
    const noteInput = document.getElementById('expenseNote');

    if (dateInput) {
        dateInput.value = expense?.ngay || new Date().toISOString().split('T')[0];
    }
    if (typeInput) {
        typeInput.value = expense?.loaiChi || '';
    }
    if (amountInput) {
        amountInput.value = expense?.soTien || '';
    }
    if (noteInput) {
        noteInput.value = expense?.ghiChu || '';
    }

    // Setup save button
    const saveBtn = document.getElementById('btnSaveExpense');
    saveBtn?.removeEventListener('click', saveExpense);
    saveBtn?.addEventListener('click', saveExpense);

    openModal('modalExpense');
}

/**
 * Save expense
 */
async function saveExpense() {
    const dateInput = document.getElementById('expenseDate');
    const typeInput = document.getElementById('expenseType');
    const amountInput = document.getElementById('expenseAmount');
    const noteInput = document.getElementById('expenseNote');

    const ngay = dateInput?.value;
    const loaiChi = typeInput?.value?.trim();
    const soTien = parseFloat(amountInput?.value);
    const ghiChu = noteInput?.value || '';

    // Validate
    if (!ngay) {
        window.notificationManager?.warning('Vui long chon ngay');
        return;
    }
    if (!loaiChi) {
        window.notificationManager?.warning('Vui long nhap loai chi phi');
        return;
    }
    if (!soTien || soTien <= 0) {
        window.notificationManager?.warning('Vui long nhap so tien hop le');
        return;
    }

    try {
        if (currentExpense) {
            // Update existing via API
            await otherExpensesApi.update(currentExpense.id, { ngay, loaiChi, soTien, ghiChu });
            window.notificationManager?.success('Da cap nhat chi phi');
        } else {
            // Create new via API
            await otherExpensesApi.create({ ngay, loaiChi, soTien, ghiChu });
            window.notificationManager?.success('Da them chi phi moi');
        }

        closeModal('modalExpense');

        // Reload finance data
        if (typeof loadFinanceData === 'function') {
            await loadFinanceData();
        }

    } catch (error) {
        console.error('[EXPENSE] Error saving:', error);
        window.notificationManager?.error('Khong the luu');
    }
}

console.log('[MODAL] Other expense modal initialized');
