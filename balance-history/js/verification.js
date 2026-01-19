// =====================================================
// BALANCE HISTORY - VERIFICATION WORKFLOW MODULE
// Handles verification queue for accountant approval
//
// PERMISSION CHECKS: Uses authManager.hasDetailedPermission()
// - viewVerificationQueue: Xem danh sách chờ duyệt
// - approveTransaction: Duyệt giao dịch
// - rejectTransaction: Từ chối giao dịch
// - resolveMatch: Chọn khách hàng từ dropdown
// =====================================================

/**
 * Verification Status Constants
 */
const VERIFICATION_STATUS = {
    PENDING: 'PENDING',
    AUTO_APPROVED: 'AUTO_APPROVED',
    PENDING_VERIFICATION: 'PENDING_VERIFICATION',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED'
};

/**
 * Match Method Labels
 */
const MATCH_METHOD_LABELS = {
    qr_code: 'QR Code',
    exact_phone: 'SĐT đầy đủ (10 số)',
    single_match: 'Tự động (1 KH duy nhất)',
    pending_match: 'NV chọn từ dropdown',
    manual_entry: 'Nhập tay',
    manual_link: 'Kế toán gán tay'
};

/**
 * Verification Status Badge Renderer
 */
function renderVerificationBadge(status) {
    const badges = {
        'PENDING': '<span class="badge badge-secondary" title="Chờ xử lý">Chờ xử lý</span>',
        'AUTO_APPROVED': '<span class="badge badge-success" title="Tự động duyệt">Auto</span>',
        'PENDING_VERIFICATION': '<span class="badge badge-warning" title="Chờ kế toán duyệt">Chờ duyệt</span>',
        'APPROVED': '<span class="badge badge-success" title="Đã duyệt">Đã duyệt</span>',
        'REJECTED': '<span class="badge badge-danger" title="Đã từ chối">Từ chối</span>'
    };
    return badges[status] || `<span class="badge badge-secondary">${status || 'N/A'}</span>`;
}

/**
 * Match Method Badge Renderer
 */
function renderMatchMethodBadge(method) {
    if (!method) return '';
    const label = MATCH_METHOD_LABELS[method] || method;
    const colors = {
        qr_code: 'info',
        exact_phone: 'success',
        single_match: 'success',
        pending_match: 'warning',
        manual_entry: 'warning',
        manual_link: 'primary'
    };
    const color = colors[method] || 'secondary';
    return `<span class="badge badge-${color}" title="${label}">${label}</span>`;
}

// =====================================================
// VERIFICATION QUEUE FUNCTIONS
// =====================================================

let verificationQueueData = [];
let verificationCurrentPage = 1;
let verificationTotalPages = 1;

/**
 * Load Verification Queue
 * Only for Admin/Accountant with viewVerificationQueue permission
 */
async function loadVerificationQueue(page = 1, status = 'PENDING_VERIFICATION') {
    // Permission check
    if (!authManager?.hasDetailedPermission('balance-history', 'viewVerificationQueue')) {
        console.warn('[VERIFICATION] No permission to view verification queue');
        const tableBody = document.getElementById('verificationTableBody');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-warning py-4">
                <i data-lucide="shield-x"></i> Bạn không có quyền xem danh sách chờ duyệt
            </td></tr>`;
            lucide?.createIcons();
        }
        return;
    }

    const loadingEl = document.getElementById('verificationLoading');
    const tableBody = document.getElementById('verificationTableBody');

    if (loadingEl) loadingEl.style.display = 'block';

    try {
        const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/verification-queue?page=${page}&limit=20&status=${status}`);
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to load verification queue');
        }

        verificationQueueData = result.data;
        verificationCurrentPage = result.pagination.page;
        verificationTotalPages = result.pagination.totalPages;

        renderVerificationQueue(tableBody);
        updateVerificationPagination();

        // Update badge count
        updateVerificationBadgeCount(result.pagination.total);

    } catch (error) {
        console.error('[VERIFICATION] Load error:', error);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Lỗi: ${error.message}</td></tr>`;
        }
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

/**
 * Render Verification Queue Table
 */
function renderVerificationQueue(tableBody) {
    if (!tableBody) return;

    if (verificationQueueData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted py-4">
                    <i class="fas fa-check-circle fa-2x mb-2"></i>
                    <br>Không có giao dịch chờ duyệt
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = verificationQueueData.map(tx => {
        const amount = parseFloat(tx.amount || 0).toLocaleString('vi-VN');
        const date = tx.transaction_date ? new Date(tx.transaction_date).toLocaleString('vi-VN') : 'N/A';

        // Parse matched_customers if available
        let matchOptions = '';
        if (tx.matched_customers) {
            try {
                const customers = typeof tx.matched_customers === 'string'
                    ? JSON.parse(tx.matched_customers)
                    : tx.matched_customers;

                if (Array.isArray(customers) && customers.length > 0) {
                    matchOptions = customers.map(c => {
                        const phone = c.phone || '';
                        const name = c.customers?.[0]?.name || 'Unknown';
                        return `<option value="${phone}">${phone} - ${name}</option>`;
                    }).join('');
                }
            } catch (e) {
                console.error('[VERIFICATION] Parse matched_customers error:', e);
            }
        }

        const hasCustomer = tx.linked_customer_phone;
        // SECURITY: Chỉ cho phép thay đổi SĐT nếu chưa cộng ví
        // Nếu đã cộng ví (wallet_processed = true) thì KHÔNG cho phép thay đổi
        const canChangePhone = hasCustomer && tx.wallet_processed !== true;
        const customerDisplay = hasCustomer
            ? `<strong>${tx.customer_name || tx.linked_customer_phone}</strong><br><small>${tx.linked_customer_phone}</small>`
            : (matchOptions
                ? `<select class="form-control form-control-sm pending-match-dropdown" data-tx-id="${tx.id}" onchange="selectMatchAndApprove(${tx.id}, this)">
                     <option value="">-- Chọn KH --</option>
                     ${matchOptions}
                   </select>`
                : '<span class="text-muted">Chưa link</span>');

        return `
            <tr data-tx-id="${tx.id}">
                <td>${tx.id}</td>
                <td title="${tx.content || ''}">${(tx.content || '').substring(0, 50)}...</td>
                <td class="text-right text-success font-weight-bold">${amount}đ</td>
                <td>${date}</td>
                <td>${customerDisplay}</td>
                <td>
                    ${renderVerificationBadge(tx.verification_status)}
                    <br>
                    ${renderMatchMethodBadge(tx.match_method)}
                </td>
                <td>${tx.verification_note || ''}</td>
                <td>
                    ${hasCustomer ? `
                        <button class="btn btn-sm btn-success" onclick="approveTransaction(${tx.id})" title="Duyệt">
                            <i class="fas fa-check"></i> Duyệt
                        </button>
                        <button class="btn btn-sm btn-change" onclick="showChangeModal(${tx.id}, '${tx.linked_customer_phone || ''}', '${(tx.customer_name || '').replace(/'/g, "\\'")}')\" title="Thay đổi SĐT">
                            <i data-lucide="edit-2" style="width: 12px; height: 12px;"></i> Thay đổi
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="showRejectModal(${tx.id})" title="Từ chối">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : `
                        <span class="text-muted small">Chọn KH trước</span>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Update Verification Pagination
 */
function updateVerificationPagination() {
    const pageInfo = document.getElementById('verificationPageInfo');
    const prevBtn = document.getElementById('verificationPrevBtn');
    const nextBtn = document.getElementById('verificationNextBtn');

    if (pageInfo) pageInfo.textContent = `Trang ${verificationCurrentPage} / ${verificationTotalPages}`;
    if (prevBtn) prevBtn.disabled = verificationCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = verificationCurrentPage >= verificationTotalPages;
}

/**
 * Update Badge Count for Verification Tab
 */
function updateVerificationBadgeCount(count) {
    const badge = document.getElementById('verificationBadge');
    if (badge) {
        badge.textContent = count > 0 ? count : '';
        badge.style.display = count > 0 ? 'inline' : 'none';
    }
}

// =====================================================
// APPROVAL/REJECTION FUNCTIONS
// =====================================================

/**
 * Approve Transaction
 * Requires approveTransaction permission
 * @param {number} transactionId
 */
async function approveTransaction(transactionId) {
    // Permission check
    if (!authManager?.hasDetailedPermission('balance-history', 'approveTransaction')) {
        showNotification('Bạn không có quyền duyệt giao dịch', 'error');
        return;
    }

    // Disable button to prevent double-click
    const btn = document.querySelector(`button[onclick*="approveTransaction(${transactionId})"]`);
    if (btn) {
        if (btn.disabled) {
            console.log('[VERIFICATION] Button already disabled, skipping');
            return;
        }
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    // Get current user from authManager
    const userInfo = authManager?.getUserInfo() || {};
    const verifiedBy = userInfo.email || userInfo.displayName || userInfo.username || 'Unknown';

    if (!confirm(`Xác nhận DUYỆT giao dịch #${transactionId}?\n\nTiền sẽ được cộng vào ví khách hàng ngay lập tức.`)) {
        // Re-enable button if user cancels
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Duyệt';
        }
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/${transactionId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                verified_by: verifiedBy,
                note: 'Approved via Balance History UI'
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to approve');
        }

        showNotification(`Đã duyệt giao dịch #${transactionId}. Ví đã được cộng ${result.data.amount?.toLocaleString()}đ`, 'success');

        // Refresh verification queue
        loadVerificationQueue(verificationCurrentPage);

    } catch (error) {
        console.error('[VERIFICATION] Approve error:', error);
        showNotification(`Lỗi: ${error.message}`, 'error');
    }
}

/**
 * Show Reject Modal
 */
function showRejectModal(transactionId) {
    const modal = document.getElementById('rejectModal');
    if (!modal) {
        // Fallback to prompt
        const reason = prompt('Nhập lý do từ chối:');
        if (reason) {
            rejectTransaction(transactionId, reason);
        }
        return;
    }

    document.getElementById('rejectTransactionId').value = transactionId;
    document.getElementById('rejectReason').value = '';
    modal.style.display = 'block';
}

/**
 * Reject Transaction
 * Requires rejectTransaction permission
 */
async function rejectTransaction(transactionId, reason) {
    // Permission check
    if (!authManager?.hasDetailedPermission('balance-history', 'rejectTransaction')) {
        showNotification('Bạn không có quyền từ chối giao dịch', 'error');
        return;
    }

    // Get current user from authManager
    const userInfo = authManager?.getUserInfo() || {};
    const verifiedBy = userInfo.email || userInfo.displayName || userInfo.username || 'Unknown';

    try {
        const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/${transactionId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                verified_by: verifiedBy,
                reason: reason
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to reject');
        }

        showNotification(`Đã từ chối giao dịch #${transactionId}`, 'warning');

        // Close modal if exists
        const modal = document.getElementById('rejectModal');
        if (modal) modal.style.display = 'none';

        // Refresh verification queue
        loadVerificationQueue(verificationCurrentPage);

    } catch (error) {
        console.error('[VERIFICATION] Reject error:', error);
        showNotification(`Lỗi: ${error.message}`, 'error');
    }
}

/**
 * Select customer from dropdown and auto-approve
 * For PENDING_MATCH transactions
 * Requires resolveMatch permission
 */
async function selectMatchAndApprove(transactionId, selectElement) {
    // Permission check
    if (!authManager?.hasDetailedPermission('balance-history', 'resolveMatch')) {
        showNotification('Bạn không có quyền chọn khách hàng', 'error');
        selectElement.value = '';
        return;
    }

    const phone = selectElement.value;
    if (!phone) return;

    // Get current user from authManager
    const userInfo = authManager?.getUserInfo() || {};
    const performedBy = userInfo.email || userInfo.displayName || userInfo.username || 'Unknown';

    try {
        selectElement.disabled = true;

        // First resolve the match
        const resolveResponse = await fetch(`${API_BASE_URL}/api/v2/balance-history/${transactionId}/resolve-match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: phone,
                performed_by: performedBy,
                note: 'Selected via verification queue'
            })
        });

        const resolveResult = await resolveResponse.json();

        if (!resolveResult.success) {
            throw new Error(resolveResult.error || 'Failed to resolve match');
        }

        showNotification(`Đã chọn khách hàng ${phone}. Vui lòng bấm Duyệt để cộng tiền vào ví.`, 'info');

        // Refresh to show updated state
        loadVerificationQueue(verificationCurrentPage);

    } catch (error) {
        console.error('[VERIFICATION] Select match error:', error);
        showNotification(`Lỗi: ${error.message}`, 'error');
        selectElement.disabled = false;
    }
}

// =====================================================
// VERIFICATION STATS
// =====================================================

/**
 * Load Verification Stats
 */
async function loadVerificationStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/stats`);
        const result = await response.json();

        if (result.success) {
            const stats = result.data;

            // Update stat badges if elements exist
            const elements = {
                'stat-pending-verification': stats.pending_verification || 0,
                'stat-auto-approved': stats.auto_approved || 0,
                'stat-manually-approved': stats.manually_approved || 0,
                'stat-rejected': stats.rejected || 0
            };

            Object.entries(elements).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value.toLocaleString();
            });
        }
    } catch (error) {
        console.error('[VERIFICATION] Stats error:', error);
    }
}

// =====================================================
// INITIALIZATION
// =====================================================

// =====================================================
// CHANGE AND APPROVE FUNCTIONS (FOR ACCOUNTANT)
// =====================================================

/**
 * Show Change Modal for accountant to change phone/customer before approve
 * @param {number} transactionId - Transaction ID
 * @param {string} currentPhone - Current linked phone
 * @param {string} currentName - Current customer name
 */
function showChangeModal(transactionId, currentPhone, currentName) {
    // Permission check
    if (!authManager?.hasDetailedPermission('balance-history', 'approveTransaction')) {
        showNotification('Bạn không có quyền thay đổi giao dịch', 'error');
        return;
    }

    // SECURITY: Check if transaction already credited to wallet
    // Find transaction in verificationQueueData to check wallet_processed
    const tx = verificationQueueData.find(t => t.id === transactionId);
    if (tx && tx.wallet_processed === true) {
        showNotification('Không thể thay đổi SĐT - Giao dịch đã được cộng vào ví khách hàng', 'error');
        console.log(`[SECURITY] Blocked showChangeModal for tx ${transactionId} - wallet_processed = true`);
        return;
    }

    // Use the existing editCustomerModal but with special handling
    const modal = document.getElementById('editCustomerModal');
    const editCustomerUniqueCode = document.getElementById('editCustomerUniqueCode');
    const editCustomerName = document.getElementById('editCustomerName');
    const editCustomerPhone = document.getElementById('editCustomerPhone');
    const editCustomerForm = document.getElementById('editCustomerForm');
    const tposContainer = document.getElementById('tposLookupContainer');

    if (!modal || !editCustomerForm) {
        showNotification('Modal không tìm thấy', 'error');
        return;
    }

    // Fill form with current values
    editCustomerUniqueCode.textContent = `Thay đổi SĐT - GD #${transactionId}`;
    editCustomerName.value = currentName || '';
    editCustomerPhone.value = currentPhone || '';

    // Store transaction ID and mark as accountant change
    editCustomerForm.dataset.transactionId = transactionId;
    editCustomerForm.dataset.isTransactionEdit = 'true';
    editCustomerForm.dataset.isAccountantChange = 'true';

    // Enable TPOS lookup mode
    if (tposContainer) {
        tposContainer.style.display = 'block';

        // Make name field readonly (will be auto-filled from TPOS)
        editCustomerName.readOnly = true;
        editCustomerName.placeholder = 'Tự động tìm từ TPOS...';
        editCustomerName.style.backgroundColor = '#f3f4f6';

        // Setup phone input listener for TPOS lookup
        if (typeof handlePhoneInputForTPOS === 'function') {
            editCustomerPhone.removeEventListener('input', handlePhoneInputForTPOS);
            editCustomerPhone.addEventListener('input', handlePhoneInputForTPOS);
        }

        // Setup dropdown change listener
        const dropdown = document.getElementById('tposCustomerDropdown');
        if (dropdown && typeof handleTPOSDropdownChange === 'function') {
            dropdown.removeEventListener('change', handleTPOSDropdownChange);
            dropdown.addEventListener('change', handleTPOSDropdownChange);
        }

        // Reset TPOS lookup UI
        const tposResult = document.getElementById('tposLookupResult');
        const tposLoading = document.getElementById('tposLookupLoading');
        if (tposResult) tposResult.style.display = 'none';
        if (tposLoading) tposLoading.style.display = 'none';

        // Trigger TPOS lookup if phone already has 10 digits
        const phone = currentPhone?.replace(/\D/g, '') || '';
        if (phone.length === 10 && typeof handlePhoneInputForTPOS === 'function') {
            handlePhoneInputForTPOS();
        }
    }

    // Show modal
    modal.style.display = 'block';

    // Reinitialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Change phone/customer and approve transaction
 * Used by accountant to correct mapping and approve in one step
 * @param {number} transactionId - Transaction ID
 * @param {string} newPhone - New phone number
 * @param {string} newName - New customer name (optional)
 */
async function changeAndApproveTransaction(transactionId, newPhone, newName) {
    // Permission check
    if (!authManager?.hasDetailedPermission('balance-history', 'approveTransaction')) {
        showNotification('Bạn không có quyền thay đổi và duyệt giao dịch', 'error');
        return;
    }

    // SECURITY: Check if transaction already credited to wallet
    const tx = verificationQueueData.find(t => t.id === transactionId);
    if (tx && tx.wallet_processed === true) {
        showNotification('Không thể thay đổi SĐT - Giao dịch đã được cộng vào ví khách hàng', 'error');
        console.log(`[SECURITY] Blocked changeAndApproveTransaction for tx ${transactionId} - wallet_processed = true`);
        return;
    }

    // Get current user
    const userInfo = authManager?.getUserInfo() || {};
    const performedBy = userInfo.email || userInfo.displayName || userInfo.username || 'Unknown';

    if (!confirm(`Xác nhận THAY ĐỔI SĐT thành ${newPhone} và DUYỆT giao dịch #${transactionId}?\n\nTiền sẽ được cộng vào ví khách hàng mới ngay lập tức.`)) {
        return;
    }

    try {
        // First, update the phone number
        const updateResponse = await fetch(`${API_BASE_URL}/api/sepay/transaction/${transactionId}/phone`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: newPhone,
                customer_name: newName || null,
                entered_by: performedBy,
                is_accountant_correction: true
            })
        });

        const updateResult = await updateResponse.json();

        if (!updateResult.success) {
            throw new Error(updateResult.error || 'Failed to update phone');
        }

        // NOTE: The PUT /api/sepay/transaction/:id/phone endpoint already:
        // 1. Sets verification_status = 'APPROVED' (when is_manual_entry = false)
        // 2. Credits wallet immediately via processDeposit()
        // 3. Sets wallet_processed = TRUE
        // So we do NOT need to call the approve endpoint - it would fail with "already approved"

        console.log(`[VERIFICATION] Transaction ${transactionId} updated and auto-approved by backend`);
        showNotification(`Đã thay đổi SĐT thành ${newPhone} và duyệt giao dịch #${transactionId}`, 'success');

        // Close the modal
        const modal = document.getElementById('editCustomerModal');
        if (modal) modal.style.display = 'none';

        // Refresh verification queue
        loadVerificationQueue(verificationCurrentPage);

        // Also refresh main data if function exists
        if (typeof loadData === 'function') {
            loadData(true);
        }

    } catch (error) {
        console.error('[VERIFICATION] Change and approve error:', error);
        showNotification(`Lỗi: ${error.message}`, 'error');
    }
}

/**
 * Initialize Verification Module
 */
function initVerificationModule() {
    console.log('[VERIFICATION] Initializing...');

    // Check if verification tab exists
    const verificationTab = document.getElementById('verificationTab');
    if (verificationTab) {
        verificationTab.addEventListener('click', () => {
            loadVerificationQueue();
            loadVerificationStats();
        });
    }

    // Pagination buttons
    const prevBtn = document.getElementById('verificationPrevBtn');
    const nextBtn = document.getElementById('verificationNextBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (verificationCurrentPage > 1) {
                loadVerificationQueue(verificationCurrentPage - 1);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (verificationCurrentPage < verificationTotalPages) {
                loadVerificationQueue(verificationCurrentPage + 1);
            }
        });
    }

    // Reject modal close button
    const rejectModalClose = document.getElementById('closeRejectModal');
    if (rejectModalClose) {
        rejectModalClose.addEventListener('click', () => {
            document.getElementById('rejectModal').style.display = 'none';
        });
    }

    // Reject modal confirm button
    const confirmRejectBtn = document.getElementById('confirmRejectBtn');
    if (confirmRejectBtn) {
        confirmRejectBtn.addEventListener('click', () => {
            const txId = document.getElementById('rejectTransactionId').value;
            const reason = document.getElementById('rejectReason').value;
            if (txId && reason) {
                rejectTransaction(parseInt(txId), reason);
            } else {
                showNotification('Vui lòng nhập lý do từ chối', 'warning');
            }
        });
    }

    // Load initial stats
    loadVerificationStats();

    console.log('[VERIFICATION] Module initialized');
}

// Auto-init when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVerificationModule);
} else {
    initVerificationModule();
}

// Export for use in main.js
window.VerificationModule = {
    loadVerificationQueue,
    approveTransaction,
    rejectTransaction,
    loadVerificationStats,
    renderVerificationBadge,
    renderMatchMethodBadge,
    showChangeModal,
    changeAndApproveTransaction,
    VERIFICATION_STATUS,
    MATCH_METHOD_LABELS
};
