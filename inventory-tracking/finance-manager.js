// =====================================================
// FINANCE MANAGER - INVENTORY TRACKING
// Phase 4: Tab 2 - Cong No / Quan Ly Tai Chinh
// =====================================================

/**
 * Load all finance data
 */
async function loadFinanceData() {
    console.log('[FINANCE] Loading finance data...');

    try {
        // Load all data in parallel
        await Promise.all([
            loadPrepaymentsData(),
            loadOtherExpensesData()
        ]);

        // Build transactions list
        buildTransactionsList();

        // Render finance table
        renderFinanceTable();

        // Update balance display
        updateBalanceDisplay();

    } catch (error) {
        console.error('[FINANCE] Error loading finance data:', error);
        toast.error('Khong the tai du lieu tai chinh');
    }
}

/**
 * Build merged transactions list from all sources
 */
function buildTransactionsList() {
    const transactions = [];

    // 1. Prepayments (positive, green)
    globalState.prepayments.forEach(p => {
        transactions.push({
            type: TRANSACTION_TYPES.PREPAYMENT,
            ngay: p.ngay,
            soTien: p.soTien,
            ghiChu: p.ghiChu || '',
            id: p.id,
            canEdit: permissionHelper?.can('edit_prepayment'),
            canDelete: permissionHelper?.can('delete_prepayment'),
            canViewDetail: false
        });
    });

    // 2. Invoices (negative, red) - grouped by date
    const invoicesByDate = {};
    globalState.shipments.forEach(s => {
        const date = s.ngayDiHang;
        if (!invoicesByDate[date]) {
            invoicesByDate[date] = { shipments: [], total: 0, nccCount: 0 };
        }
        invoicesByDate[date].shipments.push(s);
        invoicesByDate[date].total += s.tongTienHoaDon || 0;
        invoicesByDate[date].nccCount += (s.hoaDon?.length || 0);
    });

    Object.entries(invoicesByDate).forEach(([date, data]) => {
        if (data.total > 0) {
            transactions.push({
                type: TRANSACTION_TYPES.INVOICE,
                ngay: date,
                soTien: data.total,
                ghiChu: `${data.nccCount} NCC`,
                shipmentIds: data.shipments.map(s => s.id),
                canEdit: permissionHelper?.can('edit_invoiceTotal'),
                canDelete: false,
                canViewDetail: true
            });
        }
    });

    // 3. Shipping costs (negative, red) - grouped by date
    const shippingByDate = {};
    globalState.shipments.forEach(s => {
        if (s.chiPhiHangVe?.length > 0) {
            const date = s.ngayDiHang;
            if (!shippingByDate[date]) {
                shippingByDate[date] = { shipments: [], total: 0, count: 0 };
            }
            shippingByDate[date].shipments.push(s);
            shippingByDate[date].total += s.tongChiPhi || 0;
            shippingByDate[date].count += s.chiPhiHangVe.length;
        }
    });

    Object.entries(shippingByDate).forEach(([date, data]) => {
        if (data.total > 0) {
            transactions.push({
                type: TRANSACTION_TYPES.SHIPPING_COST,
                ngay: date,
                soTien: data.total,
                ghiChu: `${data.count} khoan`,
                shipmentIds: data.shipments.map(s => s.id),
                canEdit: permissionHelper?.can('edit_shippingCost'),
                canDelete: false,
                canViewDetail: true
            });
        }
    });

    // 4. Other expenses (negative, red)
    globalState.otherExpenses.forEach(e => {
        transactions.push({
            type: TRANSACTION_TYPES.OTHER_EXPENSE,
            ngay: e.ngay,
            soTien: e.soTien,
            ghiChu: e.loaiChi + (e.ghiChu ? ` - ${e.ghiChu}` : ''),
            id: e.id,
            canEdit: permissionHelper?.can('edit_otherExpense'),
            canDelete: permissionHelper?.can('delete_otherExpense'),
            canViewDetail: false
        });
    });

    // Sort by date
    transactions.sort((a, b) => a.ngay.localeCompare(b.ngay));

    globalState.transactions = transactions;
    return transactions;
}

/**
 * Render finance table
 */
function renderFinanceTable() {
    const tbody = document.getElementById('financeTableBody');
    if (!tbody) return;

    const transactions = globalState.transactions;

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4">
                    Chua co giao dich nao
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = transactions.map(txn => {
        const config = TRANSACTION_CONFIG[txn.type];
        const isPositive = config.isPositive;
        const amountClass = isPositive ? 'amount-positive' : 'amount-negative';
        const prefix = isPositive ? '+' : '-';

        return `
            <tr>
                <td>${formatDateDisplay(txn.ngay)}</td>
                <td>
                    <span class="transaction-type ${config.colorClass}">
                        <i data-lucide="${config.icon}"></i>
                        ${config.label}
                    </span>
                </td>
                <td>${txn.ghiChu}</td>
                <td class="text-right ${amountClass}">${prefix}${formatNumber(txn.soTien)}</td>
                <td class="text-center">
                    <div class="action-icons">
                        ${txn.canEdit ? `
                            <button class="btn-edit" onclick="editTransaction('${txn.type}', '${txn.id || txn.ngay}')" title="Sua">
                                <i data-lucide="edit"></i>
                            </button>
                        ` : ''}
                        ${txn.canDelete ? `
                            <button class="btn-delete" onclick="deleteTransaction('${txn.type}', '${txn.id}')" title="Xoa">
                                <i data-lucide="trash-2"></i>
                            </button>
                        ` : ''}
                        ${txn.canViewDetail ? `
                            <button class="btn-view" onclick="viewTransactionDetail('${txn.type}', '${txn.ngay}')" title="Xem chi tiet">
                                <i data-lucide="eye"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Re-initialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Edit transaction
 */
function editTransaction(type, id) {
    console.log('[FINANCE] Edit transaction:', type, id);

    switch (type) {
        case TRANSACTION_TYPES.PREPAYMENT:
            const prepayment = globalState.prepayments.find(p => p.id === id);
            if (prepayment && typeof openPrepaymentModal === 'function') {
                openPrepaymentModal(prepayment);
            }
            break;

        case TRANSACTION_TYPES.OTHER_EXPENSE:
            const expense = globalState.otherExpenses.find(e => e.id === id);
            if (expense && typeof openExpenseModal === 'function') {
                openExpenseModal(expense);
            }
            break;

        case TRANSACTION_TYPES.INVOICE:
        case TRANSACTION_TYPES.SHIPPING_COST:
            // These are grouped by date, open detail modal
            viewTransactionDetail(type, id);
            break;
    }
}

/**
 * Delete transaction
 */
async function deleteTransaction(type, id) {
    if (!confirm('Ban co chac muon xoa?')) return;

    try {
        switch (type) {
            case TRANSACTION_TYPES.PREPAYMENT:
                await prepaymentsRef.doc(id).delete();
                toast.success('Da xoa thanh toan');
                break;

            case TRANSACTION_TYPES.OTHER_EXPENSE:
                await otherExpensesRef.doc(id).delete();
                toast.success('Da xoa chi phi');
                break;
        }

        // Reload finance data
        await loadFinanceData();

    } catch (error) {
        console.error('[FINANCE] Error deleting:', error);
        toast.error('Khong the xoa');
    }
}

/**
 * View transaction detail
 */
function viewTransactionDetail(type, dateOrId) {
    console.log('[FINANCE] View detail:', type, dateOrId);

    if (type === TRANSACTION_TYPES.INVOICE) {
        if (typeof openInvoiceDetailModal === 'function') {
            openInvoiceDetailModal(dateOrId);
        }
    } else if (type === TRANSACTION_TYPES.SHIPPING_COST) {
        if (typeof openShippingDetailModal === 'function') {
            openShippingDetailModal(dateOrId);
        }
    }
}

console.log('[FINANCE] Finance manager initialized');
