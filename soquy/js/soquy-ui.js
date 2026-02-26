// =====================================================
// SỔ QUỸ - UI RENDERING & INTERACTIONS
// File: soquy-ui.js
// =====================================================

const SoquyUI = (function () {
    const config = window.SoquyConfig;
    const state = window.SoquyState;
    const db = window.SoquyDatabase;
    const els = window.SoquyElements;

    // =====================================================
    // TABLE RENDERING
    // =====================================================

    function renderTable() {
        if (!els.tableBody) return;

        const start = (state.currentPage - 1) * state.pageSize;
        const end = start + state.pageSize;
        state.displayedVouchers = state.filteredVouchers.slice(start, end);

        if (state.displayedVouchers.length === 0) {
            els.tableBody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="7" style="text-align: center; padding: 40px; color: #999;">
                        <div style="font-size: 48px; margin-bottom: 12px;">
                            <i data-lucide="inbox" style="width: 48px; height: 48px;"></i>
                        </div>
                        <div>Không có dữ liệu phiếu thu chi</div>
                    </td>
                </tr>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        els.tableBody.innerHTML = state.displayedVouchers.map(v => {
            const isPayment = v.type === config.VOUCHER_TYPES.PAYMENT;
            const displayAmount = isPayment
                ? `-${db.formatCurrency(v.amount)}`
                : db.formatCurrency(v.amount);
            const amountClass = isPayment ? 'text-danger' : 'text-success';
            const dateStr = db.formatVoucherDateTime(v.voucherDateTime);
            const isCancelled = v.status === config.VOUCHER_STATUS.CANCELLED;

            return `
                <tr class="${isCancelled ? 'row-cancelled' : ''}" data-id="${v.id}">
                    <td><input type="checkbox" class="voucher-checkbox" data-id="${v.id}"></td>
                    <td class="star-cell">
                        <i data-lucide="star" class="${v.starred ? 'text-warning star-filled' : 'star-empty'}"></i>
                    </td>
                    <td>
                        <a href="#" class="voucher-code-link text-primary" data-id="${v.id}">${escapeHtml(v.code)}</a>
                        ${isCancelled ? '<span class="badge-cancelled">Đã hủy</span>' : ''}
                    </td>
                    <td>${escapeHtml(dateStr)}</td>
                    <td>${escapeHtml(v.category || '')}</td>
                    <td>${escapeHtml(v.personName || '')}</td>
                    <td style="text-align: right;" class="${amountClass}">${displayAmount}</td>
                </tr>`;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
        bindTableEvents();
    }

    function bindTableEvents() {
        // Voucher code click -> open detail
        document.querySelectorAll('.voucher-code-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const id = e.currentTarget.dataset.id;
                openDetailModal(id);
            });
        });

        // Row click
        document.querySelectorAll('.cashbook-table tbody tr[data-id]').forEach(row => {
            row.addEventListener('dblclick', () => {
                const id = row.dataset.id;
                openDetailModal(id);
            });
        });
    }

    // =====================================================
    // SUMMARY STATS
    // =====================================================

    function updateSummaryStats() {
        // Calculate from filtered vouchers (only paid ones for the period)
        const paidVouchers = state.filteredVouchers.filter(
            v => v.status === config.VOUCHER_STATUS.PAID
        );

        state.totalReceipts = paidVouchers
            .filter(v => v.type === config.VOUCHER_TYPES.RECEIPT)
            .reduce((sum, v) => sum + Math.abs(v.amount || 0), 0);

        state.totalPayments = paidVouchers
            .filter(v => v.type === config.VOUCHER_TYPES.PAYMENT)
            .reduce((sum, v) => sum + Math.abs(v.amount || 0), 0);

        state.closingBalance = state.openingBalance + state.totalReceipts - state.totalPayments;

        if (els.statOpeningBalance) {
            els.statOpeningBalance.textContent = db.formatCurrency(state.openingBalance);
            els.statOpeningBalance.className = 'stat-value ' +
                (state.openingBalance >= 0 ? 'text-dark' : 'text-danger');
        }
        if (els.statTotalReceipts) {
            els.statTotalReceipts.textContent = db.formatCurrency(state.totalReceipts);
        }
        if (els.statTotalPayments) {
            els.statTotalPayments.textContent = state.totalPayments > 0
                ? `-${db.formatCurrency(state.totalPayments)}`
                : '0';
        }
        if (els.statClosingBalance) {
            els.statClosingBalance.textContent = db.formatCurrency(state.closingBalance);
            els.statClosingBalance.className = 'stat-value ' +
                (state.closingBalance >= 0 ? 'text-success' : 'text-danger');
        }
    }

    // =====================================================
    // PAGINATION
    // =====================================================

    function updatePagination() {
        state.totalItems = state.filteredVouchers.length;
        state.totalPages = Math.max(1, Math.ceil(state.totalItems / state.pageSize));

        if (state.currentPage > state.totalPages) {
            state.currentPage = state.totalPages;
        }

        const start = state.totalItems === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
        const end = Math.min(state.currentPage * state.pageSize, state.totalItems);

        if (els.currentPageSpan) els.currentPageSpan.textContent = state.currentPage;
        if (els.pageInfoSpan) {
            els.pageInfoSpan.textContent = `${start} - ${end} trong ${state.totalItems} phiếu thu chi`;
        }

        if (els.btnFirstPage) els.btnFirstPage.disabled = state.currentPage <= 1;
        if (els.btnPrevPage) els.btnPrevPage.disabled = state.currentPage <= 1;
        if (els.btnNextPage) els.btnNextPage.disabled = state.currentPage >= state.totalPages;
        if (els.btnLastPage) els.btnLastPage.disabled = state.currentPage >= state.totalPages;
    }

    function goToPage(page) {
        const newPage = Math.max(1, Math.min(page, state.totalPages));
        if (newPage !== state.currentPage) {
            state.currentPage = newPage;
            renderTable();
            updatePagination();
        }
    }

    // =====================================================
    // SIDEBAR TITLE UPDATE
    // =====================================================

    function updateSidebarTitle() {
        if (els.sidebarTitle) {
            els.sidebarTitle.textContent = `Sổ quỹ ${config.FUND_TYPE_LABELS[state.fundType] || ''}`.toLowerCase();
            // Capitalize first letter
            const text = els.sidebarTitle.textContent;
            els.sidebarTitle.textContent = text.charAt(0).toUpperCase() + text.slice(1);
        }
    }

    // =====================================================
    // MODAL: CREATE RECEIPT
    // =====================================================

    function openReceiptModal() {
        if (!els.receiptModal) return;

        // Reset form
        resetReceiptForm();

        // Set current date time
        const now = new Date();
        const dateStr = formatDateTimeForInput(now);
        if (els.receiptDateTime) els.receiptDateTime.value = dateStr;

        // Show modal
        els.receiptModal.style.display = 'flex';
    }

    function resetReceiptForm() {
        if (els.receiptVoucherCode) els.receiptVoucherCode.value = '';
        if (els.receiptDateTime) els.receiptDateTime.value = '';
        if (els.receiptCategory) els.receiptCategory.selectedIndex = 0;
        if (els.receiptCollector) els.receiptCollector.value = db.getCurrentUserName();
        if (els.receiptObjectType) els.receiptObjectType.selectedIndex = 0;
        if (els.receiptPayerName) els.receiptPayerName.value = '';
        if (els.receiptAmount) els.receiptAmount.value = '0';
        if (els.receiptNote) els.receiptNote.value = '';
        if (els.receiptBusinessAccounting) els.receiptBusinessAccounting.checked = true;
    }

    function closeReceiptModal() {
        if (els.receiptModal) els.receiptModal.style.display = 'none';
    }

    async function saveReceipt() {
        try {
            const amount = parseAmountInput(els.receiptAmount?.value);
            if (amount <= 0) {
                showNotification('Vui lòng nhập số tiền hợp lệ', 'error');
                return;
            }

            showLoadingOverlay(true);

            const voucherData = {
                type: config.VOUCHER_TYPES.RECEIPT,
                category: els.receiptCategory?.value || '',
                collector: els.receiptCollector?.value || '',
                objectType: els.receiptObjectType?.value || 'Khác',
                personName: els.receiptPayerName?.value || '',
                amount: amount,
                note: els.receiptNote?.value || '',
                businessAccounting: els.receiptBusinessAccounting?.checked !== false,
                dateTime: els.receiptDateTime?.value || ''
            };

            await db.createVoucher(voucherData);
            closeReceiptModal();
            showNotification('Tạo phiếu thu thành công!', 'success');
            await refreshData();
        } catch (error) {
            console.error('[SoquyUI] Error saving receipt:', error);
            showNotification('Lỗi khi tạo phiếu thu: ' + error.message, 'error');
        } finally {
            showLoadingOverlay(false);
        }
    }

    // =====================================================
    // MODAL: CREATE PAYMENT
    // =====================================================

    function openPaymentModal() {
        if (!els.paymentModal) return;

        resetPaymentForm();

        const now = new Date();
        const dateStr = formatDateTimeForInput(now);
        if (els.paymentDateTime) els.paymentDateTime.value = dateStr;

        els.paymentModal.style.display = 'flex';
    }

    function resetPaymentForm() {
        if (els.paymentVoucherCode) els.paymentVoucherCode.value = '';
        if (els.paymentDateTime) els.paymentDateTime.value = '';
        if (els.paymentCategory) els.paymentCategory.selectedIndex = 0;
        if (els.paymentCollector) els.paymentCollector.value = db.getCurrentUserName();
        if (els.paymentObjectType) els.paymentObjectType.selectedIndex = 0;
        if (els.paymentReceiverName) els.paymentReceiverName.value = '';
        if (els.paymentAmount) els.paymentAmount.value = '0';
        if (els.paymentNote) els.paymentNote.value = '';
        if (els.paymentBusinessAccounting) els.paymentBusinessAccounting.checked = true;
    }

    function closePaymentModal() {
        if (els.paymentModal) els.paymentModal.style.display = 'none';
    }

    async function savePayment() {
        try {
            const amount = parseAmountInput(els.paymentAmount?.value);
            if (amount <= 0) {
                showNotification('Vui lòng nhập số tiền hợp lệ', 'error');
                return;
            }

            showLoadingOverlay(true);

            const voucherData = {
                type: config.VOUCHER_TYPES.PAYMENT,
                category: els.paymentCategory?.value || '',
                collector: els.paymentCollector?.value || '',
                objectType: els.paymentObjectType?.value || 'Khác',
                personName: els.paymentReceiverName?.value || '',
                amount: amount,
                note: els.paymentNote?.value || '',
                businessAccounting: els.paymentBusinessAccounting?.checked !== false,
                dateTime: els.paymentDateTime?.value || ''
            };

            await db.createVoucher(voucherData);
            closePaymentModal();
            showNotification('Tạo phiếu chi thành công!', 'success');
            await refreshData();
        } catch (error) {
            console.error('[SoquyUI] Error saving payment:', error);
            showNotification('Lỗi khi tạo phiếu chi: ' + error.message, 'error');
        } finally {
            showLoadingOverlay(false);
        }
    }

    // =====================================================
    // MODAL: VOUCHER DETAIL (View/Edit)
    // =====================================================

    async function openDetailModal(voucherId) {
        const voucher = state.filteredVouchers.find(v => v.id === voucherId);
        if (!voucher) return;

        state.viewingVoucherId = voucherId;

        const detailModal = els.detailModal;
        if (!detailModal) return;

        const isReceipt = voucher.type === config.VOUCHER_TYPES.RECEIPT;
        const isCancelled = voucher.status === config.VOUCHER_STATUS.CANCELLED;
        const dateStr = db.formatVoucherDateTime(voucher.voucherDateTime);
        const amountDisplay = isReceipt
            ? db.formatCurrency(voucher.amount)
            : `-${db.formatCurrency(voucher.amount)}`;

        const detailBody = detailModal.querySelector('.modal-body');
        if (detailBody) {
            detailBody.innerHTML = `
                <div class="detail-header-section">
                    <div class="detail-voucher-code">
                        <span class="code-label">${isReceipt ? 'PHIẾU THU' : 'PHIẾU CHI'}</span>
                        <span class="code-value">${escapeHtml(voucher.code)}</span>
                        ${isCancelled ? '<span class="badge-cancelled-lg">Đã hủy</span>' : '<span class="badge-paid">Đã thanh toán</span>'}
                    </div>
                </div>

                <div class="detail-grid">
                    <div class="detail-row">
                        <span class="detail-label">Thời gian:</span>
                        <span class="detail-value">${escapeHtml(dateStr)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Quỹ:</span>
                        <span class="detail-value">${escapeHtml(config.FUND_TYPE_LABELS[voucher.fundType] || voucher.fundType)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${isReceipt ? 'Loại thu:' : 'Loại chi:'}</span>
                        <span class="detail-value">${escapeHtml(voucher.category || '-')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${isReceipt ? 'Người thu:' : 'Người chi:'}</span>
                        <span class="detail-value">${escapeHtml(voucher.collector || '-')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${isReceipt ? 'Người nộp:' : 'Người nhận:'}</span>
                        <span class="detail-value">${escapeHtml(voucher.personName || '-')}</span>
                    </div>
                    <div class="detail-row detail-row-highlight">
                        <span class="detail-label">Giá trị:</span>
                        <span class="detail-value detail-amount ${isReceipt ? 'text-success' : 'text-danger'}">${amountDisplay}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Ghi chú:</span>
                        <span class="detail-value">${escapeHtml(voucher.note || '-')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Hạch toán KQKD:</span>
                        <span class="detail-value">${voucher.businessAccounting ? 'Có' : 'Không'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Người tạo:</span>
                        <span class="detail-value">${escapeHtml(voucher.createdBy || '-')}</span>
                    </div>
                    ${isCancelled ? `
                    <div class="detail-row detail-row-cancelled">
                        <span class="detail-label">Lý do hủy:</span>
                        <span class="detail-value">${escapeHtml(voucher.cancelReason || '-')}</span>
                    </div>` : ''}
                </div>`;
        }

        // Show/hide action buttons based on status
        const detailFooter = detailModal.querySelector('.modal-footer');
        if (detailFooter) {
            detailFooter.innerHTML = `
                <button class="btn-outline-secondary" id="btnCloseDetailFooter">Đóng</button>
                ${!isCancelled ? `
                <button class="btn-outline-danger" id="btnCancelVoucher" data-id="${voucherId}">
                    <i data-lucide="x-circle"></i> Hủy phiếu
                </button>
                <button class="btn-primary" id="btnEditVoucher" data-id="${voucherId}">
                    <i data-lucide="edit-3"></i> Sửa phiếu
                </button>` : ''}`;

            if (typeof lucide !== 'undefined') lucide.createIcons();

            // Bind footer button events
            const btnClose = detailFooter.querySelector('#btnCloseDetailFooter');
            if (btnClose) btnClose.addEventListener('click', closeDetailModal);

            const btnCancel = detailFooter.querySelector('#btnCancelVoucher');
            if (btnCancel) btnCancel.addEventListener('click', () => openCancelModal(voucherId));

            const btnEdit = detailFooter.querySelector('#btnEditVoucher');
            if (btnEdit) btnEdit.addEventListener('click', () => openEditFromDetail(voucherId));
        }

        // Update modal title
        const detailTitle = detailModal.querySelector('.modal-header h3');
        if (detailTitle) {
            detailTitle.textContent = `Chi tiết phiếu ${voucher.code}`;
        }

        detailModal.style.display = 'flex';
    }

    function closeDetailModal() {
        if (els.detailModal) {
            els.detailModal.style.display = 'none';
            state.viewingVoucherId = null;
        }
    }

    // =====================================================
    // MODAL: EDIT VOUCHER (Opens from detail)
    // =====================================================

    function openEditFromDetail(voucherId) {
        const voucher = state.filteredVouchers.find(v => v.id === voucherId);
        if (!voucher) return;

        closeDetailModal();

        const isReceipt = voucher.type === config.VOUCHER_TYPES.RECEIPT;

        if (isReceipt) {
            openReceiptModal();
            // Fill in existing data
            if (els.receiptVoucherCode) els.receiptVoucherCode.value = voucher.code;
            if (els.receiptDateTime) els.receiptDateTime.value = db.formatVoucherDateTime(voucher.voucherDateTime);
            if (els.receiptCategory) setSelectValue(els.receiptCategory, voucher.category);
            if (els.receiptCollector) els.receiptCollector.value = voucher.collector || '';
            if (els.receiptObjectType) setSelectValue(els.receiptObjectType, voucher.objectType);
            if (els.receiptPayerName) els.receiptPayerName.value = voucher.personName || '';
            if (els.receiptAmount) els.receiptAmount.value = db.formatCurrency(voucher.amount);
            if (els.receiptNote) els.receiptNote.value = voucher.note || '';
            if (els.receiptBusinessAccounting) els.receiptBusinessAccounting.checked = voucher.businessAccounting;

            // Switch save button to update mode
            state.editingVoucherId = voucherId;
        } else {
            openPaymentModal();
            if (els.paymentVoucherCode) els.paymentVoucherCode.value = voucher.code;
            if (els.paymentDateTime) els.paymentDateTime.value = db.formatVoucherDateTime(voucher.voucherDateTime);
            if (els.paymentCategory) setSelectValue(els.paymentCategory, voucher.category);
            if (els.paymentCollector) els.paymentCollector.value = voucher.collector || '';
            if (els.paymentObjectType) setSelectValue(els.paymentObjectType, voucher.objectType);
            if (els.paymentReceiverName) els.paymentReceiverName.value = voucher.personName || '';
            if (els.paymentAmount) els.paymentAmount.value = db.formatCurrency(voucher.amount);
            if (els.paymentNote) els.paymentNote.value = voucher.note || '';
            if (els.paymentBusinessAccounting) els.paymentBusinessAccounting.checked = voucher.businessAccounting;

            state.editingVoucherId = voucherId;
        }
    }

    async function saveEditedVoucher(voucherType) {
        if (!state.editingVoucherId) return;

        try {
            showLoadingOverlay(true);
            const isReceipt = voucherType === config.VOUCHER_TYPES.RECEIPT;

            const updateData = {
                category: isReceipt ? els.receiptCategory?.value : els.paymentCategory?.value,
                collector: isReceipt ? els.receiptCollector?.value : els.paymentCollector?.value,
                objectType: isReceipt ? els.receiptObjectType?.value : els.paymentObjectType?.value,
                personName: isReceipt ? els.receiptPayerName?.value : els.paymentReceiverName?.value,
                amount: parseAmountInput(isReceipt ? els.receiptAmount?.value : els.paymentAmount?.value),
                note: isReceipt ? els.receiptNote?.value : els.paymentNote?.value,
                businessAccounting: isReceipt
                    ? els.receiptBusinessAccounting?.checked
                    : els.paymentBusinessAccounting?.checked,
                dateTime: isReceipt ? els.receiptDateTime?.value : els.paymentDateTime?.value
            };

            await db.updateVoucher(state.editingVoucherId, updateData);
            state.editingVoucherId = null;

            if (isReceipt) closeReceiptModal();
            else closePaymentModal();

            showNotification('Cập nhật phiếu thành công!', 'success');
            await refreshData();
        } catch (error) {
            console.error('[SoquyUI] Error updating voucher:', error);
            showNotification('Lỗi khi cập nhật: ' + error.message, 'error');
        } finally {
            showLoadingOverlay(false);
        }
    }

    // =====================================================
    // MODAL: CANCEL VOUCHER
    // =====================================================

    function openCancelModal(voucherId) {
        closeDetailModal();
        state.viewingVoucherId = voucherId;

        if (els.cancelModal) {
            if (els.cancelReason) els.cancelReason.value = '';
            els.cancelModal.style.display = 'flex';
        }
    }

    function closeCancelModal() {
        if (els.cancelModal) {
            els.cancelModal.style.display = 'none';
            state.viewingVoucherId = null;
        }
    }

    async function confirmCancelVoucher() {
        if (!state.viewingVoucherId) return;

        try {
            showLoadingOverlay(true);
            const reason = els.cancelReason?.value || '';
            await db.cancelVoucher(state.viewingVoucherId, reason);
            closeCancelModal();
            showNotification('Đã hủy phiếu thành công!', 'success');
            await refreshData();
        } catch (error) {
            console.error('[SoquyUI] Error cancelling voucher:', error);
            showNotification('Lỗi khi hủy phiếu: ' + error.message, 'error');
        } finally {
            showLoadingOverlay(false);
        }
    }

    // =====================================================
    // DATA REFRESH
    // =====================================================

    async function refreshData() {
        try {
            state.isLoading = true;
            showTableLoading(true);

            // Fetch vouchers
            const vouchers = await db.fetchVouchers();
            state.vouchers = vouchers;
            state.filteredVouchers = vouchers;

            // Calculate opening balance
            state.openingBalance = await db.calculateOpeningBalance(state.fundType);

            // Update all UI
            updateSummaryStats();
            updatePagination();
            renderTable();
            updateSidebarTitle();
        } catch (error) {
            console.error('[SoquyUI] Error refreshing data:', error);
            showNotification('Lỗi khi tải dữ liệu: ' + error.message, 'error');
        } finally {
            state.isLoading = false;
            showTableLoading(false);
        }
    }

    // =====================================================
    // FILTER HANDLERS
    // =====================================================

    function handleFundTypeChange(fundType) {
        state.fundType = fundType;
        state.currentPage = 1;
        updateSidebarTitle();
        refreshData();
    }

    function handleTimeFilterChange(filter) {
        state.timeFilter = filter;
        state.currentPage = 1;
        refreshData();
    }

    function handleVoucherTypeFilterChange() {
        const types = [];
        if (els.receiptCheckbox?.checked) types.push(config.VOUCHER_TYPES.RECEIPT);
        if (els.paymentCheckbox?.checked) types.push(config.VOUCHER_TYPES.PAYMENT);
        state.voucherTypeFilter = types;
        state.currentPage = 1;
        refreshData();
    }

    function handleStatusFilterChange() {
        const statuses = [];
        if (els.statusPaidCheckbox?.checked) statuses.push(config.VOUCHER_STATUS.PAID);
        if (els.statusCancelledCheckbox?.checked) statuses.push(config.VOUCHER_STATUS.CANCELLED);
        state.statusFilter = statuses;
        state.currentPage = 1;
        refreshData();
    }

    function handleBusinessAccountingChange(value) {
        state.businessAccounting = value;
        state.currentPage = 1;
        refreshData();
    }

    function handleSearchChange(query) {
        state.searchQuery = query;
        state.currentPage = 1;
        refreshData();
    }

    function handleCategoryFilterChange(value) {
        state.categoryFilter = value;
        state.currentPage = 1;
        refreshData();
    }

    function handleCreatorFilterChange(value) {
        state.creatorFilter = value;
        state.currentPage = 1;
        refreshData();
    }

    function handleEmployeeFilterChange(value) {
        state.employeeFilter = value;
        state.currentPage = 1;
        refreshData();
    }

    function handlePageSizeChange(size) {
        state.pageSize = parseInt(size) || config.DEFAULT_PAGE_SIZE;
        state.currentPage = 1;
        renderTable();
        updatePagination();
    }

    // =====================================================
    // EXPORT HANDLER
    // =====================================================

    function handleExport() {
        if (state.filteredVouchers.length === 0) {
            showNotification('Không có dữ liệu để xuất', 'error');
            return;
        }
        db.exportToCSV(state.filteredVouchers);
        showNotification('Đã xuất file thành công!', 'success');
    }

    // =====================================================
    // POPULATE DROPDOWNS
    // =====================================================

    function populateCategoryDropdowns() {
        // Receipt categories
        if (els.receiptCategory) {
            els.receiptCategory.innerHTML = '<option value="">Chọn loại thu</option>' +
                config.RECEIPT_CATEGORIES.map(cat =>
                    `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`
                ).join('');
        }

        // Payment categories
        if (els.paymentCategory) {
            els.paymentCategory.innerHTML = '<option value="">Chọn loại chi</option>' +
                config.PAYMENT_CATEGORIES.map(cat =>
                    `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`
                ).join('');
        }

        // Object type dropdowns
        [els.receiptObjectType, els.paymentObjectType].forEach(select => {
            if (select) {
                select.innerHTML = config.OBJECT_TYPES.map(type =>
                    `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`
                ).join('');
            }
        });

        // Time filter select
        if (els.timeFilterSelect) {
            els.timeFilterSelect.innerHTML = Object.entries(config.TIME_FILTER_LABELS)
                .filter(([key]) => key !== config.TIME_FILTERS.CUSTOM)
                .map(([key, label]) =>
                    `<option value="${key}">${escapeHtml(label)}</option>`
                ).join('');
        }

        // Page size select
        if (els.pageSizeSelect) {
            els.pageSizeSelect.innerHTML = config.PAGE_SIZES.map(size =>
                `<option value="${size}" ${size === config.DEFAULT_PAGE_SIZE ? 'selected' : ''}>${size} dòng</option>`
            ).join('');
        }
    }

    // =====================================================
    // HELPER FUNCTIONS
    // =====================================================

    function formatDateTimeForInput(date) {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    }

    function parseAmountInput(value) {
        if (!value) return 0;
        // Remove formatting characters
        const cleaned = String(value).replace(/[.,\s]/g, '');
        return Math.abs(parseInt(cleaned) || 0);
    }

    function setSelectValue(selectEl, value) {
        if (!selectEl || !value) return;
        for (let i = 0; i < selectEl.options.length; i++) {
            if (selectEl.options[i].value === value) {
                selectEl.selectedIndex = i;
                return;
            }
        }
        // If not found, add it
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        selectEl.appendChild(option);
        selectEl.value = value;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showNotification(message, type) {
        // Use shared notification system if available
        if (typeof window.showSuccess === 'function' && type === 'success') {
            window.showSuccess(message);
            return;
        }
        if (typeof window.showError === 'function' && type === 'error') {
            window.showError(message);
            return;
        }

        // Fallback: simple toast notification
        const existing = document.querySelector('.soquy-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `soquy-toast soquy-toast-${type}`;
        toast.innerHTML = `
            <i data-lucide="${type === 'success' ? 'check-circle' : 'alert-circle'}"></i>
            <span>${escapeHtml(message)}</span>`;
        document.body.appendChild(toast);

        if (typeof lucide !== 'undefined') lucide.createIcons();

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function showTableLoading(show) {
        const container = document.querySelector('.cashbook-table-container');
        if (!container) return;

        const existingLoader = container.querySelector('.table-loading-overlay');
        if (show && !existingLoader) {
            const loader = document.createElement('div');
            loader.className = 'table-loading-overlay';
            loader.innerHTML = '<div class="loading-spinner"></div>';
            container.appendChild(loader);
        } else if (!show && existingLoader) {
            existingLoader.remove();
        }
    }

    function showLoadingOverlay(show) {
        let overlay = document.querySelector('.global-loading-overlay');
        if (show && !overlay) {
            overlay = document.createElement('div');
            overlay.className = 'global-loading-overlay';
            overlay.innerHTML = '<div class="loading-spinner large"></div>';
            document.body.appendChild(overlay);
        } else if (!show && overlay) {
            overlay.remove();
        }
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    return {
        renderTable,
        updateSummaryStats,
        updatePagination,
        goToPage,
        updateSidebarTitle,
        openReceiptModal,
        closeReceiptModal,
        saveReceipt,
        openPaymentModal,
        closePaymentModal,
        savePayment,
        openDetailModal,
        closeDetailModal,
        openCancelModal,
        closeCancelModal,
        confirmCancelVoucher,
        openEditFromDetail,
        saveEditedVoucher,
        refreshData,
        handleFundTypeChange,
        handleTimeFilterChange,
        handleVoucherTypeFilterChange,
        handleStatusFilterChange,
        handleBusinessAccountingChange,
        handleSearchChange,
        handleCategoryFilterChange,
        handleCreatorFilterChange,
        handleEmployeeFilterChange,
        handlePageSizeChange,
        handleExport,
        populateCategoryDropdowns,
        showNotification,
        escapeHtml,
        formatDateTimeForInput,
        parseAmountInput
    };
})();

// Export
window.SoquyUI = SoquyUI;
