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

    // Get current user from authManager
    const userInfo = authManager?.getUserInfo() || {};
    const verifiedBy = userInfo.email || userInfo.displayName || userInfo.username || 'Unknown';

    if (!confirm(`Xác nhận DUYỆT giao dịch #${transactionId}?\n\nTiền sẽ được cộng vào ví khách hàng ngay lập tức.`)) {
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
    VERIFICATION_STATUS,
    MATCH_METHOD_LABELS
};
