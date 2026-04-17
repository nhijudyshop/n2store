// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL PREPAYMENT - INVENTORY TRACKING
// Phase 4: Modal for add/edit prepayment
// =====================================================

let currentPrepayment = null;

/**
 * Open prepayment modal
 */
function openPrepaymentModal(prepayment = null) {
    currentPrepayment = prepayment;

    const modal = document.getElementById('modalPrepayment');
    const title = document.getElementById('modalPrepaymentTitle');

    if (title) {
        title.textContent = prepayment ? 'Sua Thanh Toan Truoc' : 'Them Thanh Toan Truoc';
    }

    // Fill form data
    const dateInput = document.getElementById('prepaymentDate');
    const amountInput = document.getElementById('prepaymentAmount');
    const noteInput = document.getElementById('prepaymentNote');

    if (dateInput) {
        dateInput.value = prepayment?.ngay || todayVN();
    }
    if (amountInput) {
        amountInput.value = prepayment?.soTien || '';
    }
    if (noteInput) {
        noteInput.value = prepayment?.ghiChu || '';
    }

    // Setup save button
    const saveBtn = document.getElementById('btnSavePrepayment');
    saveBtn?.removeEventListener('click', savePrepayment);
    saveBtn?.addEventListener('click', savePrepayment);

    openModal('modalPrepayment');
}

/**
 * Save prepayment
 */
async function savePrepayment() {
    const dateInput = document.getElementById('prepaymentDate');
    const amountInput = document.getElementById('prepaymentAmount');
    const noteInput = document.getElementById('prepaymentNote');

    const ngay = dateInput?.value;
    const soTien = parseFloat(amountInput?.value);
    const ghiChu = noteInput?.value || '';

    // Validate
    if (!ngay) {
        window.notificationManager?.warning('Vui long chon ngay');
        return;
    }
    if (!soTien || soTien <= 0) {
        window.notificationManager?.warning('Vui long nhap so tien hop le');
        return;
    }

    try {
        if (currentPrepayment) {
            // Update existing via API
            await prepaymentsApi.update(currentPrepayment.id, { ngay, soTien, ghiChu });
            window.notificationManager?.success('Da cap nhat thanh toan');
        } else {
            // Create new via API
            await prepaymentsApi.create({ ngay, soTien, ghiChu });
            window.notificationManager?.success('Da them thanh toan moi');
        }

        closeModal('modalPrepayment');

        // Reload finance data
        if (typeof loadFinanceData === 'function') {
            await loadFinanceData();
        }

    } catch (error) {
        console.error('[PREPAYMENT] Error saving:', error);
        window.notificationManager?.error('Khong the luu');
    }
}

console.log('[MODAL] Prepayment modal initialized');
