/**
 * Verification Module for Balance History
 * Handles verification queue, approval/rejection of transactions
 */

// =====================================================
// GLOBAL STATE
// =====================================================
let verificationQueueData = [];
let verificationCurrentPage = 1;
let verificationTotalPages = 1;
const VERIFICATION_PAGE_SIZE = 20;

// =====================================================
// API CONFIGURATION
// =====================================================
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://chatomni-proxy.nhijudyshop.workers.dev';

// =====================================================
// VERIFICATION QUEUE FUNCTIONS
// =====================================================

/**
 * Load Verification Queue
 * Fetches pending transactions that need accountant verification
 * @param {number} page - Page number
 */
async function loadVerificationQueue(page = 1) {
    const tableBody = document.getElementById('verificationTableBody');
    const loadingEl = document.getElementById('verificationLoading');

    if (loadingEl) loadingEl.style.display = 'block';
    if (tableBody) tableBody.innerHTML = '';

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/v2/balance-history/verification-queue?page=${page}&limit=${VERIFICATION_PAGE_SIZE}`
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

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

        // Escape customer name for onclick
        const escapedName = (tx.customer_name || '').replace(/'/g, "\\'").replace(/"/g, '\\"');

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
                    ${tx.wallet_processed === true ? `
                        <span class="badge badge-secondary" title="Giao dịch đã được cộng vào ví, không thể thay đổi">
                            🔒 Đã cộng ví
                        </span>
                    ` : (hasCustomer ? `
                        <button class="btn btn-sm btn-success" onclick="approveTransaction(${tx.id})" title="Duyệt">
                            <i class="fas fa-check"></i> Duyệt
                        </button>
                        <button class="btn btn-sm btn-change" onclick="showChangeModal(${tx.id}, '${tx.linked_customer_phone || ''}', '${escapedName}')" title="Thay đổi SĐT">
                            <i data-lucide="edit-2" style="width: 12px; height: 12px;"></i> Thay đổi
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="showRejectModal(${tx.id})" title="Từ chối">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : `
                        <span class="text-muted small">Chọn KH trước</span>
                    `)}
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

    // SECURITY: Check if transaction already credited to wallet
    const tx = verificationQueueData.find(t => t.id === transactionId);
    if (tx && tx.wallet_processed === true) {
        showNotification('Giao dịch đã được cộng vào ví, không thể duyệt lại', 'error');
        console.log(`[SECURITY] Blocked approveTransaction for tx ${transactionId} - wallet_processed = true`);
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

    // Get current user
    const userInfo = authManager?.getUserInfo() || {};
    const performedBy = userInfo.email || userInfo.displayName || userInfo.username || 'Unknown';

    try {
        const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/${transactionId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                verified_by: performedBy,
                note: 'Approved by accountant'
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to approve');
        }

        showNotification(`Đã duyệt giao dịch #${transactionId}`, 'success');

        // Refresh verification queue
        loadVerificationQueue(verificationCurrentPage);

        // Also refresh main data if function exists
        if (typeof loadData === 'function') {
            loadData(true);
        }

    } catch (error) {
        console.error('[VERIFICATION] Approve error:', error);
        showNotification(`Lỗi: ${error.message}`, 'error');
        // Re-enable button on error
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Duyệt';
        }
    }
}

/**
 * Show Reject Modal
 * @param {number} transactionId
 */
function showRejectModal(transactionId) {
    // Permission check
    if (!authManager?.hasDetailedPermission('balance-history', 'approveTransaction')) {
        showNotification('Bạn không có quyền từ chối giao dịch', 'error');
        return;
    }

    const modal = document.getElementById('rejectModal');
    const txIdInput = document.getElementById('rejectTransactionId');
    const reasonInput = document.getElementById('rejectReason');

    if (modal && txIdInput) {
        txIdInput.value = transactionId;
        if (reasonInput) reasonInput.value = '';
        modal.style.display = 'block';
    }
}

/**
 * Reject Transaction
 * Called from reject modal submit
 */
async function rejectTransaction() {
    const txId = document.getElementById('rejectTransactionId')?.value;
    const reason = document.getElementById('rejectReason')?.value;

    if (!txId) {
        showNotification('Transaction ID không hợp lệ', 'error');
        return;
    }

    if (!reason || reason.trim().length < 5) {
        showNotification('Vui lòng nhập lý do từ chối (ít nhất 5 ký tự)', 'error');
        return;
    }

    // Get current user
    const userInfo = authManager?.getUserInfo() || {};
    const performedBy = userInfo.email || userInfo.displayName || userInfo.username || 'Unknown';

    try {
        const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/${txId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rejected_by: performedBy,
                reason: reason.trim()
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to reject');
        }

        showNotification(`Đã từ chối giao dịch #${txId}`, 'success');

        // Close modal
        document.getElementById('rejectModal').style.display = 'none';

        // Refresh
        loadVerificationQueue(verificationCurrentPage);

    } catch (error) {
        console.error('[VERIFICATION] Reject error:', error);
        showNotification(`Lỗi: ${error.message}`, 'error');
    }
}

/**
 * Select match from dropdown and approve
 * @param {number} transactionId
 * @param {HTMLSelectElement} selectEl
 */
async function selectMatchAndApprove(transactionId, selectEl) {
    const phone = selectEl.value;
    if (!phone) return;

    // Get customer name from selected option
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const optionText = selectedOption.text;
    const customerName = optionText.split(' - ')[1] || '';

    // First link, then approve
    try {
        // Link transaction to selected phone
        const linkResponse = await fetch(`${API_BASE_URL}/api/v2/balance-history/${transactionId}/link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: phone,
                match_method: 'pending_match_selected'
            })
        });

        const linkResult = await linkResponse.json();
        if (!linkResult.success) {
            throw new Error(linkResult.error || 'Failed to link');
        }

        // Then approve
        await approveTransaction(transactionId);

    } catch (error) {
        console.error('[VERIFICATION] Select and approve error:', error);
        showNotification(`Lỗi: ${error.message}`, 'error');
        selectEl.value = ''; // Reset dropdown
    }
}

// =====================================================
// BADGE RENDERING
// =====================================================

function renderVerificationBadge(status) {
    const badges = {
        'PENDING_VERIFICATION': '<span class="badge badge-warning">Chờ duyệt</span>',
        'APPROVED': '<span class="badge badge-success">Đã duyệt</span>',
        'REJECTED': '<span class="badge badge-danger">Từ chối</span>',
        'AUTO_APPROVED': '<span class="badge badge-info">Tự động duyệt</span>'
    };
    return badges[status] || `<span class="badge badge-secondary">${status || 'Unknown'}</span>`;
}

function renderMatchMethodBadge(method) {
    const badges = {
        'qr_code': '<span class="badge badge-primary">QR Code</span>',
        'exact_phone': '<span class="badge badge-success">SĐT chính xác</span>',
        'single_match': '<span class="badge badge-info">1 KH khớp</span>',
        'pending_match': '<span class="badge badge-warning">Nhiều KH</span>',
        'manual_entry': '<span class="badge badge-secondary">Nhập tay</span>',
        'manual_link': '<span class="badge badge-dark">Gán tay</span>'
    };
    return badges[method] || '';
}

// =====================================================
// STATISTICS
// =====================================================

async function loadVerificationStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/verification-stats`);
        const result = await response.json();

        if (result.success && result.stats) {
            const stats = result.stats;
            const elements = {
                'stat-pending': stats.pending || 0,
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
        // Update the phone number - this also auto-approves and credits wallet
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

    // Reject confirm button
    const rejectConfirmBtn = document.getElementById('confirmRejectBtn');
    if (rejectConfirmBtn) {
        rejectConfirmBtn.addEventListener('click', rejectTransaction);
    }

    // Render auto-approve toggle for Admin users
    renderAutoApproveToggle();

    console.log('[VERIFICATION] Module initialized');
}

// =====================================================
// AUTO-APPROVE TOGGLE FUNCTIONS
// =====================================================

/**
 * Render Auto-Approve Toggle
 * Chỉ hiển thị cho Admin
 */
async function renderAutoApproveToggle() {
    // Check if user has toggleAutoApprove permission
    // Support multiple ways to check permission
    let hasPermission = false;

    // Method 1: authManager.hasDetailedPermission
    if (window.authManager?.hasDetailedPermission) {
        hasPermission = window.authManager.hasDetailedPermission('balance-history', 'toggleAutoApprove');
    }

    // Method 2: Check if user is Admin role (fallback)
    if (!hasPermission && window.authManager?.getUserRole) {
        const role = window.authManager.getUserRole();
        hasPermission = role === 'Admin';
    }

    // Method 3: Check user data directly
    if (!hasPermission && window.authManager?.user) {
        const user = window.authManager.user;
        hasPermission = user.role === 'Admin';
    }

    console.log('[VERIFICATION] toggleAutoApprove permission check:', hasPermission);

    if (!hasPermission) {
        console.log('[VERIFICATION] User does not have toggleAutoApprove permission');
        return;
    }

    const container = document.getElementById('verificationPanel');
    if (!container) return;

    // Check if toggle already exists
    if (document.getElementById('autoApproveToggleContainer')) return;

    // Create toggle container
    const toggleContainer = document.createElement('div');
    toggleContainer.id = 'autoApproveToggleContainer';
    toggleContainer.className = 'auto-approve-setting';
    toggleContainer.innerHTML = `
        <div class="toggle-wrapper">
            <label class="toggle-label">
                <span class="toggle-text">Tự động duyệt giao dịch auto-match</span>
                <div class="toggle-switch">
                    <input type="checkbox" id="autoApproveToggle" />
                    <span class="toggle-slider"></span>
                </div>
            </label>
            <small class="toggle-hint" id="toggleHint">
                Đang tải...
            </small>
        </div>
    `;

    // Insert before the dashboard cards
    const dashboard = container.querySelector('.acc-dashboard, #accDashboard');
    if (dashboard) {
        container.insertBefore(toggleContainer, dashboard);
    } else {
        container.insertAdjacentElement('afterbegin', toggleContainer);
    }

    // Load current setting
    await loadAutoApproveSetting();

    // Add event listener
    const toggle = document.getElementById('autoApproveToggle');
    if (toggle) {
        toggle.addEventListener('change', async (e) => {
            await toggleAutoApprove(e.target.checked);
        });
    }
}

/**
 * Load current auto-approve setting from server
 */
async function loadAutoApproveSetting() {
    const toggle = document.getElementById('autoApproveToggle');
    const hint = document.getElementById('toggleHint');

    if (!toggle) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/settings/auto-approve`);
        const data = await response.json();

        if (data.success) {
            toggle.checked = data.enabled;
            updateToggleHint(data.enabled);
        }
    } catch (error) {
        console.error('[VERIFICATION] Failed to load auto-approve setting:', error);
        if (hint) {
            hint.textContent = 'Lỗi tải cài đặt';
            hint.classList.add('error');
        }
    }
}

/**
 * Toggle auto-approve setting
 * @param {boolean} enabled
 */
async function toggleAutoApprove(enabled) {
    const toggle = document.getElementById('autoApproveToggle');
    const hint = document.getElementById('toggleHint');

    // Disable toggle while saving
    if (toggle) toggle.disabled = true;
    if (hint) {
        hint.textContent = 'Đang lưu...';
        hint.classList.remove('error');
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/settings/auto-approve`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                enabled,
                updated_by: window.authManager?.getUserInfo?.()?.email || 'admin'
            })
        });

        const data = await response.json();

        if (data.success) {
            updateToggleHint(enabled);

            // Show notification
            if (typeof showNotification === 'function') {
                showNotification(
                    enabled
                        ? 'Đã BẬT tự động duyệt cho giao dịch auto-match'
                        : 'Đã TẮT - Tất cả giao dịch cần kế toán duyệt',
                    'success'
                );
            }
        } else {
            throw new Error(data.error || 'Failed to update');
        }
    } catch (error) {
        console.error('[VERIFICATION] Failed to toggle auto-approve:', error);

        // Revert toggle
        if (toggle) toggle.checked = !enabled;
        if (hint) {
            hint.textContent = 'Lỗi: ' + error.message;
            hint.classList.add('error');
        }

        if (typeof showNotification === 'function') {
            showNotification('Lỗi khi cập nhật cài đặt: ' + error.message, 'error');
        }
    } finally {
        if (toggle) toggle.disabled = false;
    }
}

/**
 * Update toggle hint text based on state
 * @param {boolean} enabled
 */
function updateToggleHint(enabled) {
    const hint = document.getElementById('toggleHint');
    if (!hint) return;

    hint.classList.remove('error');

    if (enabled) {
        hint.innerHTML = `
            <span class="status-on">BẬT</span> - Giao dịch auto-match tự động cộng ví
        `;
    } else {
        hint.innerHTML = `
            <span class="status-off">TẮT</span> - Tất cả giao dịch cần kế toán duyệt trước khi cộng ví
        `;
    }
}

// Export for global access
window.VerificationModule = {
    loadVerificationQueue,
    approveTransaction,
    rejectTransaction,
    showRejectModal,
    showChangeModal,
    changeAndApproveTransaction,
    initVerificationModule,
    loadAutoApproveSetting,
    toggleAutoApprove
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVerificationModule);
} else {
    initVerificationModule();
}
