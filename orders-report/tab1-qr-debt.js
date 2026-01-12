/**
 * TAB1-QR-DEBT.JS - QR Code & Debt Management Module
 * Handles QR code generation, debt tracking, payment confirmation
 * Depends on: tab1-core.js
 */

// =====================================================
// QR API CONFIGURATION
// =====================================================
const QR_API_URL = window.SEPAY_API_URL || 'https://n2-node-sepay.glitch.me';

// Debt cache for performance
const DEBT_CACHE_KEY = 'debt_cache';
const DEBT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// =====================================================
// QR CODE FUNCTIONS
// =====================================================
async function showQRModal(orderId, phone, amount) {
    console.log('[QR] Opening QR modal:', { orderId, phone, amount });

    const modal = document.getElementById('qrModal');
    const qrContainer = document.getElementById('qrCodeContainer');
    const qrInfo = document.getElementById('qrInfo');

    if (!modal || !qrContainer) {
        console.error('[QR] Modal elements not found');
        return;
    }

    modal.classList.add('show');

    // Show loading
    qrContainer.innerHTML = `
        <div class="qr-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tạo mã QR...</p>
        </div>`;

    try {
        const normalizedPhone = normalizePhoneForQR(phone);

        if (!normalizedPhone) {
            throw new Error('Số điện thoại không hợp lệ');
        }

        // Get bank info from settings or use default
        const bankInfo = window.BANK_INFO || {
            bankId: 'MBBank',
            accountNumber: '0981832233',
            accountName: 'NHI JUDY SHOP'
        };

        // Generate QR content
        const qrData = {
            bankId: bankInfo.bankId,
            accountNumber: bankInfo.accountNumber,
            accountName: bankInfo.accountName,
            amount: amount || 0,
            description: `DH ${orderId} - ${normalizedPhone}`
        };

        // Use VietQR API
        const qrUrl = `https://img.vietqr.io/image/${qrData.bankId}-${qrData.accountNumber}-print.jpg?amount=${qrData.amount}&addInfo=${encodeURIComponent(qrData.description)}&accountName=${encodeURIComponent(qrData.accountName)}`;

        qrContainer.innerHTML = `
            <img src="${qrUrl}" alt="QR Code" class="qr-image" onerror="handleQRError(this)">
            <div class="qr-download-actions">
                <a href="${qrUrl}" download="QR_${orderId}.jpg" class="btn-download-qr">
                    <i class="fas fa-download"></i> Tải QR
                </a>
                <button class="btn-copy-qr" onclick="copyQRInfo('${qrData.accountNumber}', '${qrData.description}', ${amount})">
                    <i class="fas fa-copy"></i> Copy TK
                </button>
            </div>`;

        if (qrInfo) {
            qrInfo.innerHTML = `
                <div class="qr-info-item">
                    <span class="qr-info-label">Ngân hàng:</span>
                    <span class="qr-info-value">${bankInfo.bankId}</span>
                </div>
                <div class="qr-info-item">
                    <span class="qr-info-label">Số tài khoản:</span>
                    <span class="qr-info-value">${bankInfo.accountNumber}</span>
                </div>
                <div class="qr-info-item">
                    <span class="qr-info-label">Chủ tài khoản:</span>
                    <span class="qr-info-value">${bankInfo.accountName}</span>
                </div>
                <div class="qr-info-item">
                    <span class="qr-info-label">Số tiền:</span>
                    <span class="qr-info-value">${(amount || 0).toLocaleString('vi-VN')}đ</span>
                </div>
                <div class="qr-info-item">
                    <span class="qr-info-label">Nội dung CK:</span>
                    <span class="qr-info-value">${qrData.description}</span>
                </div>`;
        }

    } catch (error) {
        console.error('[QR] Error:', error);
        qrContainer.innerHTML = `
            <div class="qr-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Lỗi tạo mã QR</p>
                <p style="font-size: 12px;">${error.message}</p>
            </div>`;
    }
}

function closeQRModal() {
    const modal = document.getElementById('qrModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function handleQRError(img) {
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent) {
        const error = document.createElement('div');
        error.className = 'qr-error';
        error.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <p>Không thể tải mã QR</p>`;
        parent.insertBefore(error, img);
    }
}

function copyQRInfo(accountNumber, description, amount) {
    const text = `STK: ${accountNumber}\nNội dung: ${description}\nSố tiền: ${amount.toLocaleString('vi-VN')}đ`;

    navigator.clipboard.writeText(text).then(() => {
        if (window.notificationManager) {
            window.notificationManager.success('Đã copy thông tin chuyển khoản');
        }
    }).catch(err => {
        console.error('[QR] Copy failed:', err);
        if (window.notificationManager) {
            window.notificationManager.error('Không thể copy');
        }
    });
}

// =====================================================
// DEBT MANAGEMENT FUNCTIONS
// =====================================================
async function fetchCustomerDebt(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return null;

    // Check cache first
    const cached = getCachedDebt(normalizedPhone);
    if (cached !== null) {
        return cached;
    }

    try {
        const response = await fetch(`${QR_API_URL}/api/sepay/debt/${normalizedPhone}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            const debt = data.debt || 0;
            setCachedDebt(normalizedPhone, debt);
            return debt;
        }

        return 0;

    } catch (error) {
        console.error('[DEBT] Error fetching debt:', error);
        return null;
    }
}

async function updateCustomerDebt(phone, newDebt, oldDebt, reason) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return false;

    try {
        const response = await fetch(`${QR_API_URL}/api/sepay/update-debt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: normalizedPhone,
                new_debt: newDebt,
                old_debt: oldDebt,
                reason: reason || 'Cập nhật công nợ'
            })
        });

        const data = await response.json();

        if (data.success) {
            // Update cache
            setCachedDebt(normalizedPhone, newDebt);

            // Update table cells
            updateDebtCellsInTable(normalizedPhone, newDebt);

            return true;
        }

        return false;

    } catch (error) {
        console.error('[DEBT] Error updating debt:', error);
        return false;
    }
}

async function fetchDebtHistory(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return [];

    try {
        const response = await fetch(`${QR_API_URL}/api/sepay/debt-history/${normalizedPhone}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return data.history || [];

    } catch (error) {
        console.error('[DEBT] Error fetching history:', error);
        return [];
    }
}

// =====================================================
// DEBT CACHE MANAGEMENT
// =====================================================
function getDebtCache() {
    try {
        const cached = localStorage.getItem(DEBT_CACHE_KEY);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (e) {
        console.warn('[DEBT] Error reading cache:', e);
    }
    return {};
}

function saveDebtCache(cache) {
    try {
        localStorage.setItem(DEBT_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.warn('[DEBT] Error saving cache:', e);
    }
}

function getCachedDebt(phone) {
    const cache = getDebtCache();
    const entry = cache[phone];

    if (entry && Date.now() - entry.timestamp < DEBT_CACHE_TTL) {
        return entry.debt;
    }

    return null;
}

function setCachedDebt(phone, debt) {
    const cache = getDebtCache();
    cache[phone] = {
        debt: debt,
        timestamp: Date.now()
    };
    saveDebtCache(cache);
}

function invalidateDebtCache(phone) {
    const cache = getDebtCache();
    if (cache[phone]) {
        delete cache[phone];
        saveDebtCache(cache);
    }
}

// =====================================================
// DEBT UI HELPERS
// =====================================================
function updateDebtCellsInTable(phone, debt) {
    // Find all cells with matching phone number
    const rows = document.querySelectorAll('#tableBody tr');

    rows.forEach(row => {
        const phoneCell = row.querySelector('[data-column="phone"]');
        const debtCell = row.querySelector('[data-column="debt"]');

        if (phoneCell && debtCell) {
            const cellPhone = normalizePhoneForQR(phoneCell.textContent);
            if (cellPhone === phone) {
                debtCell.textContent = debt > 0 ? `${debt.toLocaleString('vi-VN')}đ` : '-';
                debtCell.className = debt > 0 ? 'debt-cell has-debt' : 'debt-cell';
            }
        }
    });
}

function renderDebtBadge(debt) {
    if (!debt || debt <= 0) return '';

    return `
        <span class="debt-badge" title="Công nợ: ${debt.toLocaleString('vi-VN')}đ">
            <i class="fas fa-exclamation-circle"></i>
            ${debt.toLocaleString('vi-VN')}đ
        </span>`;
}

// =====================================================
// DEBT MODAL
// =====================================================
async function showDebtModal(phone, customerName) {
    const normalizedPhone = normalizePhoneForQR(phone);

    const modal = document.getElementById('debtModal');
    const modalBody = document.getElementById('debtModalBody');
    const modalTitle = document.getElementById('debtModalTitle');

    if (!modal || !modalBody) {
        console.error('[DEBT] Modal elements not found');
        return;
    }

    modal.classList.add('show');

    if (modalTitle) {
        modalTitle.textContent = `Công nợ - ${customerName || phone}`;
    }

    // Show loading
    modalBody.innerHTML = `
        <div class="debt-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải thông tin công nợ...</p>
        </div>`;

    try {
        // Fetch debt and history in parallel
        const [debt, history] = await Promise.all([
            fetchCustomerDebt(normalizedPhone),
            fetchDebtHistory(normalizedPhone)
        ]);

        const currentDebt = debt || 0;

        modalBody.innerHTML = `
            <div class="debt-summary">
                <div class="debt-current">
                    <span class="debt-label">Công nợ hiện tại</span>
                    <span class="debt-amount ${currentDebt > 0 ? 'has-debt' : ''}">${currentDebt.toLocaleString('vi-VN')}đ</span>
                </div>
                <div class="debt-actions">
                    <button class="btn-add-debt" onclick="showAddDebtForm('${normalizedPhone}', ${currentDebt})">
                        <i class="fas fa-plus"></i> Thêm công nợ
                    </button>
                    <button class="btn-pay-debt" onclick="showPayDebtForm('${normalizedPhone}', ${currentDebt})" ${currentDebt <= 0 ? 'disabled' : ''}>
                        <i class="fas fa-minus"></i> Thanh toán
                    </button>
                </div>
            </div>

            <div class="debt-form" id="debtForm" style="display: none;">
                <!-- Form content will be inserted here -->
            </div>

            <div class="debt-history">
                <h4><i class="fas fa-history"></i> Lịch sử công nợ</h4>
                ${renderDebtHistoryList(history)}
            </div>`;

    } catch (error) {
        console.error('[DEBT] Error loading debt modal:', error);
        modalBody.innerHTML = `
            <div class="debt-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Lỗi khi tải thông tin công nợ</p>
                <p style="font-size: 12px;">${error.message}</p>
            </div>`;
    }
}

function closeDebtModal() {
    const modal = document.getElementById('debtModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function renderDebtHistoryList(history) {
    if (!history || history.length === 0) {
        return `
            <div class="debt-history-empty">
                <i class="fas fa-inbox"></i>
                <p>Chưa có lịch sử công nợ</p>
            </div>`;
    }

    return `
        <div class="debt-history-list">
            ${history.slice(0, 20).map(entry => `
                <div class="debt-history-item ${entry.amount > 0 ? 'debt-increase' : 'debt-decrease'}">
                    <div class="debt-history-icon">
                        <i class="fas ${entry.amount > 0 ? 'fa-arrow-up' : 'fa-arrow-down'}"></i>
                    </div>
                    <div class="debt-history-info">
                        <div class="debt-history-amount ${entry.amount > 0 ? 'positive' : 'negative'}">
                            ${entry.amount > 0 ? '+' : ''}${entry.amount.toLocaleString('vi-VN')}đ
                        </div>
                        <div class="debt-history-reason">${escapeHtml(entry.reason || '-')}</div>
                        <div class="debt-history-time">${formatDebtTime(entry.timestamp)}</div>
                    </div>
                </div>
            `).join('')}
        </div>`;
}

function showAddDebtForm(phone, currentDebt) {
    const formContainer = document.getElementById('debtForm');
    if (!formContainer) return;

    formContainer.style.display = 'block';
    formContainer.innerHTML = `
        <div class="debt-form-content">
            <h4>Thêm công nợ</h4>
            <div class="form-group">
                <label>Số tiền</label>
                <input type="number" id="debtAmount" placeholder="Nhập số tiền" min="0">
            </div>
            <div class="form-group">
                <label>Lý do</label>
                <input type="text" id="debtReason" placeholder="Nhập lý do">
            </div>
            <div class="form-actions">
                <button class="btn-cancel" onclick="hideDebtForm()">Hủy</button>
                <button class="btn-confirm" onclick="confirmAddDebt('${phone}', ${currentDebt})">Xác nhận</button>
            </div>
        </div>`;

    document.getElementById('debtAmount')?.focus();
}

function showPayDebtForm(phone, currentDebt) {
    const formContainer = document.getElementById('debtForm');
    if (!formContainer) return;

    formContainer.style.display = 'block';
    formContainer.innerHTML = `
        <div class="debt-form-content">
            <h4>Thanh toán công nợ</h4>
            <div class="form-group">
                <label>Số tiền thanh toán (Tối đa: ${currentDebt.toLocaleString('vi-VN')}đ)</label>
                <input type="number" id="debtAmount" placeholder="Nhập số tiền" min="0" max="${currentDebt}" value="${currentDebt}">
            </div>
            <div class="form-group">
                <label>Lý do</label>
                <input type="text" id="debtReason" placeholder="Nhập lý do" value="Thanh toán công nợ">
            </div>
            <div class="form-actions">
                <button class="btn-cancel" onclick="hideDebtForm()">Hủy</button>
                <button class="btn-confirm" onclick="confirmPayDebt('${phone}', ${currentDebt})">Xác nhận</button>
            </div>
        </div>`;

    document.getElementById('debtAmount')?.focus();
}

function hideDebtForm() {
    const formContainer = document.getElementById('debtForm');
    if (formContainer) {
        formContainer.style.display = 'none';
    }
}

async function confirmAddDebt(phone, currentDebt) {
    const amountInput = document.getElementById('debtAmount');
    const reasonInput = document.getElementById('debtReason');

    const amount = parseFloat(amountInput?.value) || 0;
    const reason = reasonInput?.value?.trim() || 'Thêm công nợ';

    if (amount <= 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng nhập số tiền hợp lệ');
        }
        return;
    }

    const newDebt = currentDebt + amount;

    const success = await updateCustomerDebt(phone, newDebt, currentDebt, reason);

    if (success) {
        if (window.notificationManager) {
            window.notificationManager.success(`Đã thêm ${amount.toLocaleString('vi-VN')}đ công nợ`);
        }
        // Refresh modal
        const customerName = document.getElementById('debtModalTitle')?.textContent?.replace('Công nợ - ', '');
        await showDebtModal(phone, customerName);
    } else {
        if (window.notificationManager) {
            window.notificationManager.error('Không thể cập nhật công nợ');
        }
    }
}

async function confirmPayDebt(phone, currentDebt) {
    const amountInput = document.getElementById('debtAmount');
    const reasonInput = document.getElementById('debtReason');

    const amount = parseFloat(amountInput?.value) || 0;
    const reason = reasonInput?.value?.trim() || 'Thanh toán công nợ';

    if (amount <= 0 || amount > currentDebt) {
        if (window.notificationManager) {
            window.notificationManager.warning('Số tiền thanh toán không hợp lệ');
        }
        return;
    }

    const newDebt = currentDebt - amount;

    const success = await updateCustomerDebt(phone, newDebt, currentDebt, reason);

    if (success) {
        if (window.notificationManager) {
            window.notificationManager.success(`Đã thanh toán ${amount.toLocaleString('vi-VN')}đ công nợ`);
        }
        // Refresh modal
        const customerName = document.getElementById('debtModalTitle')?.textContent?.replace('Công nợ - ', '');
        await showDebtModal(phone, customerName);
    } else {
        if (window.notificationManager) {
            window.notificationManager.error('Không thể cập nhật công nợ');
        }
    }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================
function normalizePhoneForQR(phone) {
    if (!phone) return null;

    // Remove all non-digit characters
    let normalized = phone.toString().replace(/\D/g, '');

    // Handle Vietnamese phone numbers
    if (normalized.startsWith('84')) {
        normalized = '0' + normalized.substring(2);
    }

    // Validate length
    if (normalized.length < 9 || normalized.length > 11) {
        return null;
    }

    return normalized;
}

function formatDebtTime(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
        return 'Hôm qua';
    } else if (diffDays < 7) {
        return `${diffDays} ngày trước`;
    }

    return date.toLocaleDateString('vi-VN');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// EXPORTS
// =====================================================
window.showQRModal = showQRModal;
window.closeQRModal = closeQRModal;
window.handleQRError = handleQRError;
window.copyQRInfo = copyQRInfo;
window.fetchCustomerDebt = fetchCustomerDebt;
window.updateCustomerDebt = updateCustomerDebt;
window.fetchDebtHistory = fetchDebtHistory;
window.showDebtModal = showDebtModal;
window.closeDebtModal = closeDebtModal;
window.showAddDebtForm = showAddDebtForm;
window.showPayDebtForm = showPayDebtForm;
window.hideDebtForm = hideDebtForm;
window.confirmAddDebt = confirmAddDebt;
window.confirmPayDebt = confirmPayDebt;
window.normalizePhoneForQR = normalizePhoneForQR;
window.renderDebtBadge = renderDebtBadge;
window.updateDebtCellsInTable = updateDebtCellsInTable;
window.getDebtCache = getDebtCache;
window.saveDebtCache = saveDebtCache;
window.invalidateDebtCache = invalidateDebtCache;

console.log('[TAB1-QR-DEBT] Module loaded');
