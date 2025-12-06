// =====================================================
// BALANCE HISTORY - MAIN JAVASCRIPT
// =====================================================

// Configuration
const API_BASE_URL = window.CONFIG?.API_BASE_URL || (
    window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'https://your-cloudflare-worker.workers.dev'
);

// State
let currentPage = 1;
let totalPages = 1;
let currentQuickFilter = 'thisMonth'; // Default quick filter
let filters = {
    type: '',
    gateway: '',
    startDate: '',
    endDate: '',
    search: ''
};

// DOM Elements
const loadingIndicator = document.getElementById('loadingIndicator');
const tableBody = document.getElementById('tableBody');
const pageInfo = document.getElementById('pageInfo');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const refreshBtn = document.getElementById('refreshBtn');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const detailModal = document.getElementById('detailModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalBody = document.getElementById('modalBody');

// Set Default Current Month
function setDefaultCurrentMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // First day of current month
    const firstDay = `${year}-${month}-01`;

    // Last day of current month
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    const lastDayFormatted = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

    // Set input values
    document.getElementById('filterStartDate').value = firstDay;
    document.getElementById('filterEndDate').value = lastDayFormatted;

    // Update filters state
    filters.startDate = firstDay;
    filters.endDate = lastDayFormatted;
}

// Quick Filter Date Ranges
function getQuickFilterDates(filterType) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let startDate, endDate;

    switch(filterType) {
        case 'today':
            startDate = new Date(today);
            endDate = new Date(today);
            break;

        case 'yesterday':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 1);
            endDate = new Date(startDate);
            break;

        case 'thisWeek':
            // Monday to Sunday (current week)
            startDate = new Date(today);
            const dayOfWeek = startDate.getDay();
            const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            startDate.setDate(startDate.getDate() + diffToMonday);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            break;

        case 'lastWeek':
            // Previous Monday to Sunday
            startDate = new Date(today);
            const lastWeekDay = startDate.getDay();
            const diffToLastMonday = lastWeekDay === 0 ? -13 : -6 - lastWeekDay;
            startDate.setDate(startDate.getDate() + diffToLastMonday);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            break;

        case 'thisMonth':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;

        case 'lastMonth':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;

        case 'last7days':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 6);
            endDate = new Date(today);
            break;

        case 'last30days':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 29);
            endDate = new Date(today);
            break;

        default:
            return null;
    }

    // Format dates as YYYY-MM-DD
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
    };
}

// Apply Quick Filter
function applyQuickFilter(filterType) {
    const dates = getQuickFilterDates(filterType);

    if (dates) {
        // Update date inputs
        document.getElementById('filterStartDate').value = dates.startDate;
        document.getElementById('filterEndDate').value = dates.endDate;

        // Update filters state
        filters.startDate = dates.startDate;
        filters.endDate = dates.endDate;

        // Update active button
        document.querySelectorAll('.btn-quick-filter').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-filter="${filterType}"]`)?.classList.add('active');

        // Store current filter
        currentQuickFilter = filterType;

        // Reload data
        currentPage = 1;
        loadData();
        loadStatistics();
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Initialize CustomerInfoManager and sync from database
    if (window.CustomerInfoManager) {
        window.CustomerInfoManager.init();
    }

    setDefaultCurrentMonth();
    loadData();
    loadStatistics();
    setupEventListeners();
});

// Event Listeners
function setupEventListeners() {
    // Quick Filter Buttons
    document.querySelectorAll('.btn-quick-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            const filterType = btn.getAttribute('data-filter');
            applyQuickFilter(filterType);
        });
    });

    refreshBtn.addEventListener('click', () => {
        currentPage = 1;
        loadData();
        loadStatistics();
    });

    applyFiltersBtn.addEventListener('click', () => {
        currentPage = 1;
        applyFilters();
        loadData();
        loadStatistics();

        // Clear quick filter active state when manually applying filters
        document.querySelectorAll('.btn-quick-filter').forEach(btn => {
            btn.classList.remove('active');
        });
    });

    resetFiltersBtn.addEventListener('click', () => {
        resetFilters();
        currentPage = 1;
        loadData();
        loadStatistics();
    });

    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadData();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadData();
        }
    });

    closeModalBtn.addEventListener('click', () => {
        detailModal.classList.remove('active');
    });

    // Click outside modal to close
    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) {
            detailModal.classList.remove('active');
        }
    });

    // Enter key to apply filters
    document.querySelectorAll('.filter-input, .filter-select').forEach(element => {
        element.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                applyFiltersBtn.click();
            }
        });
    });

    // Date input change - clear quick filter active state
    document.getElementById('filterStartDate').addEventListener('change', () => {
        document.querySelectorAll('.btn-quick-filter').forEach(btn => {
            btn.classList.remove('active');
        });
    });

    document.getElementById('filterEndDate').addEventListener('change', () => {
        document.querySelectorAll('.btn-quick-filter').forEach(btn => {
            btn.classList.remove('active');
        });
    });
}

// Apply Filters
function applyFilters() {
    filters.type = document.getElementById('filterType').value;
    filters.gateway = document.getElementById('filterGateway').value;
    filters.startDate = document.getElementById('filterStartDate').value;
    filters.endDate = document.getElementById('filterEndDate').value;
    filters.search = document.getElementById('filterSearch').value;
}

// Reset Filters
function resetFilters() {
    document.getElementById('filterType').value = '';
    document.getElementById('filterGateway').value = '';
    document.getElementById('filterSearch').value = '';

    // Reset dates to current month
    setDefaultCurrentMonth();

    // Reset quick filter to "thisMonth"
    document.querySelectorAll('.btn-quick-filter').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector('[data-filter="thisMonth"]')?.classList.add('active');
    currentQuickFilter = 'thisMonth';

    filters.type = '';
    filters.gateway = '';
    filters.search = '';
    // startDate and endDate are already set by setDefaultCurrentMonth()
}

// Load Data
async function loadData() {
    showLoading();

    try {
        const queryParams = new URLSearchParams({
            page: currentPage,
            limit: 50,
            ...filters
        });

        // Remove empty params
        for (let [key, value] of queryParams.entries()) {
            if (!value) queryParams.delete(key);
        }

        const response = await fetch(`${API_BASE_URL}/api/sepay/history?${queryParams}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
            renderTable(result.data);
            updatePagination(result.pagination);
        } else {
            showError('Không thể tải dữ liệu: ' + result.error);
        }
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Lỗi khi tải dữ liệu: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Load Statistics
async function loadStatistics() {
    try {
        const queryParams = new URLSearchParams({
            ...filters
        });

        // Remove empty params and search (stats don't use search)
        for (let [key, value] of queryParams.entries()) {
            if (!value || key === 'search') queryParams.delete(key);
        }

        const response = await fetch(`${API_BASE_URL}/api/sepay/statistics?${queryParams}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
            renderStatistics(result.statistics);
        }
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// Render Table
function renderTable(data) {
    if (!data || data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; padding: 40px;">
                    <i class="fas fa-inbox" style="font-size: 48px; color: #bdc3c7;"></i>
                    <p style="margin-top: 15px; color: #7f8c8d;">Không có dữ liệu</p>
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = data.map(row => {
        // Extract unique code from content (look for N2 prefix pattern - exactly 18 chars)
        const content = row.content || '';
        const uniqueCodeMatch = content.match(/\bN2[A-Z0-9]{16}\b/);
        const uniqueCode = uniqueCodeMatch ? uniqueCodeMatch[0] : null;

        // Get customer info if unique code exists
        let customerDisplay = { name: 'N/A', phone: 'N/A', hasInfo: false };
        if (uniqueCode && window.CustomerInfoManager) {
            customerDisplay = window.CustomerInfoManager.getCustomerDisplay(uniqueCode);
        }

        return `
        <tr>
            <td>${formatDateTime(row.transaction_date)}</td>
            <td>${row.gateway}</td>
            <td>
                <span class="badge ${row.transfer_type === 'in' ? 'badge-success' : 'badge-danger'}">
                    <i class="fas fa-arrow-${row.transfer_type === 'in' ? 'down' : 'up'}"></i>
                    ${row.transfer_type === 'in' ? 'Tiền vào' : 'Tiền ra'}
                </span>
            </td>
            <td class="${row.transfer_type === 'in' ? 'amount-in' : 'amount-out'}">
                ${row.transfer_type === 'in' ? '+' : '-'}${formatCurrency(row.transfer_amount)}
            </td>
            <td>${formatCurrency(row.accumulated)}</td>
            <td>${truncateText(content || 'N/A', 50)}</td>
            <td>${row.reference_code || 'N/A'}</td>
            <td class="customer-info-cell ${customerDisplay.hasInfo ? '' : 'no-info'}">
                ${uniqueCode ? `
                    <div style="display: flex; align-items: center; gap: 5px;">
                        <span>${customerDisplay.name}</span>
                        <button class="btn btn-secondary btn-sm" onclick="editCustomerInfo('${uniqueCode}')" title="Chỉnh sửa" style="padding: 4px 6px;">
                            <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                        </button>
                    </div>
                ` : '<span style="color: #999;">N/A</span>'}
            </td>
            <td class="customer-info-cell ${customerDisplay.hasInfo ? '' : 'no-info'}">
                ${uniqueCode && customerDisplay.phone !== 'N/A' ? `
                    <a href="javascript:void(0)" onclick="showCustomersByPhone('${customerDisplay.phone}')" class="phone-link" title="Xem danh sách khách hàng" style="color: #3b82f6; text-decoration: none; cursor: pointer;">
                        ${customerDisplay.phone}
                        <i data-lucide="users" style="width: 12px; height: 12px; vertical-align: middle; margin-left: 4px;"></i>
                    </a>
                ` : '<span style="color: #999;">N/A</span>'}
            </td>
            <td class="text-center">
                ${uniqueCode ? `
                    <button class="btn btn-success btn-sm" onclick="showTransactionQR('${uniqueCode}', 0)" title="Xem QR Code">
                        <i data-lucide="qr-code"></i>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="copyUniqueCode('${uniqueCode}')" title="Copy mã" style="margin-left: 4px;">
                        <i data-lucide="copy"></i>
                    </button>
                ` : '<span style="color: #999;">N/A</span>'}
            </td>
            <td class="text-center">
                <button class="btn btn-primary btn-sm" onclick="showDetail(${row.id})">
                    Chi tiết
                </button>
            </td>
        </tr>
        `;
    }).join('');

    // Reinitialize Lucide icons for dynamically added buttons
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Render Statistics
function renderStatistics(stats) {
    document.getElementById('totalIn').textContent = formatCurrency(stats.total_in);
    document.getElementById('totalInCount').textContent = `${stats.total_in_count} giao dịch`;

    document.getElementById('totalOut').textContent = formatCurrency(stats.total_out);
    document.getElementById('totalOutCount').textContent = `${stats.total_out_count} giao dịch`;

    document.getElementById('netChange').textContent = formatCurrency(stats.net_change);
    document.getElementById('totalTransactions').textContent = `${stats.total_transactions} giao dịch`;

    document.getElementById('latestBalance').textContent = formatCurrency(stats.latest_balance);
}

// Update Pagination
function updatePagination(pagination) {
    currentPage = pagination.page;
    totalPages = pagination.totalPages;

    pageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;

    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
}

// Show Detail Modal
async function showDetail(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/sepay/history?page=1&limit=9999`);
        const result = await response.json();

        if (result.success) {
            const transaction = result.data.find(t => t.id === id);

            if (transaction) {
                modalBody.innerHTML = `
                    <div class="detail-row">
                        <div class="detail-label">ID giao dịch:</div>
                        <div class="detail-value">${transaction.sepay_id}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Ngân hàng:</div>
                        <div class="detail-value">${transaction.gateway}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Ngày giờ:</div>
                        <div class="detail-value">${formatDateTime(transaction.transaction_date)}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Số tài khoản:</div>
                        <div class="detail-value">${transaction.account_number}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Loại giao dịch:</div>
                        <div class="detail-value">
                            <span class="badge ${transaction.transfer_type === 'in' ? 'badge-success' : 'badge-danger'}">
                                ${transaction.transfer_type === 'in' ? 'Tiền vào' : 'Tiền ra'}
                            </span>
                        </div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Số tiền:</div>
                        <div class="detail-value ${transaction.transfer_type === 'in' ? 'amount-in' : 'amount-out'}">
                            ${transaction.transfer_type === 'in' ? '+' : '-'}${formatCurrency(transaction.transfer_amount)}
                        </div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Số dư sau GD:</div>
                        <div class="detail-value">${formatCurrency(transaction.accumulated)}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Nội dung:</div>
                        <div class="detail-value">${transaction.content || 'N/A'}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Mã tham chiếu:</div>
                        <div class="detail-value">${transaction.reference_code || 'N/A'}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Mã giao dịch:</div>
                        <div class="detail-value">${transaction.code || 'N/A'}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Mô tả:</div>
                        <div class="detail-value">${transaction.description || 'N/A'}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Tài khoản phụ:</div>
                        <div class="detail-value">${transaction.sub_account || 'N/A'}</div>
                    </div>
                `;

                detailModal.classList.add('active');
            }
        }
    } catch (error) {
        console.error('Error loading detail:', error);
        alert('Lỗi khi tải chi tiết giao dịch');
    }
}

// Helper Functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount || 0);
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function truncateText(text, maxLength) {
    if (!text) return 'N/A';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function showLoading() {
    loadingIndicator.style.display = 'block';
    tableBody.style.opacity = '0.5';
}

function hideLoading() {
    loadingIndicator.style.display = 'none';
    tableBody.style.opacity = '1';
}

function showError(message) {
    tableBody.innerHTML = `
        <tr>
            <td colspan="9" style="text-align: center; padding: 40px; color: #e74c3c;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px;"></i>
                <p style="margin-top: 15px;">${message}</p>
            </td>
        </tr>
    `;
}

// =====================================================
// RAW DATA VIEWER
// =====================================================

let rawDataCache = null;

// View Raw Data Button
const viewRawDataBtn = document.getElementById('viewRawDataBtn');
const rawDataModal = document.getElementById('rawDataModal');
const closeRawDataModalBtn = document.getElementById('closeRawDataModalBtn');
const rawDataContent = document.getElementById('rawDataContent');
const rawDataCount = document.getElementById('rawDataCount');
const copyRawDataBtn = document.getElementById('copyRawDataBtn');
const downloadRawDataBtn = document.getElementById('downloadRawDataBtn');

viewRawDataBtn?.addEventListener('click', async () => {
    try {
        rawDataContent.textContent = 'Đang tải dữ liệu...';
        rawDataModal.classList.add('active');

        // Fetch all data (no pagination limit)
        const response = await fetch(`${API_BASE_URL}/api/sepay/history?limit=10000`);
        const result = await response.json();

        if (result.success) {
            rawDataCache = result.data;
            const jsonString = JSON.stringify(result.data, null, 2);
            rawDataContent.textContent = jsonString;
            rawDataCount.textContent = `Tổng số: ${result.data.length} records`;

            // Re-initialize Lucide icons
            setTimeout(() => lucide.createIcons(), 100);
        } else {
            rawDataContent.textContent = 'Lỗi: ' + (result.error || 'Không thể tải dữ liệu');
        }
    } catch (error) {
        console.error('Error loading raw data:', error);
        rawDataContent.textContent = 'Lỗi khi tải dữ liệu: ' + error.message;
    }
});

// Copy Raw Data
copyRawDataBtn?.addEventListener('click', async () => {
    try {
        const jsonString = JSON.stringify(rawDataCache, null, 2);
        await navigator.clipboard.writeText(jsonString);

        // Visual feedback
        const originalText = copyRawDataBtn.innerHTML;
        copyRawDataBtn.innerHTML = '<i data-lucide="check"></i> Đã copy!';
        setTimeout(() => {
            copyRawDataBtn.innerHTML = originalText;
            lucide.createIcons();
        }, 2000);

        lucide.createIcons();
    } catch (error) {
        alert('Lỗi khi copy: ' + error.message);
    }
});

// Download Raw Data
downloadRawDataBtn?.addEventListener('click', () => {
    try {
        const jsonString = JSON.stringify(rawDataCache, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `balance_history_raw_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Visual feedback
        const originalText = downloadRawDataBtn.innerHTML;
        downloadRawDataBtn.innerHTML = '<i data-lucide="check"></i> Đã tải!';
        setTimeout(() => {
            downloadRawDataBtn.innerHTML = originalText;
            lucide.createIcons();
        }, 2000);

        lucide.createIcons();
    } catch (error) {
        alert('Lỗi khi tải file: ' + error.message);
    }
});

// Close Raw Data Modal
closeRawDataModalBtn?.addEventListener('click', () => {
    rawDataModal.classList.remove('active');
});

// Close modal when clicking outside
rawDataModal?.addEventListener('click', (e) => {
    if (e.target === rawDataModal) {
        rawDataModal.classList.remove('active');
    }
});

// =====================================================
// QR CODE MODAL EVENT LISTENERS
// =====================================================

const generateQRBtn = document.getElementById('generateQRBtn');
const qrModal = document.getElementById('qrModal');
const closeQRModalBtn = document.getElementById('closeQRModalBtn');

// Generate QR Button
generateQRBtn?.addEventListener('click', () => {
    generateDepositQR();
});

// Close QR Modal
closeQRModalBtn?.addEventListener('click', () => {
    qrModal.style.display = 'none';
});

// Close modal when clicking outside
qrModal?.addEventListener('click', (e) => {
    if (e.target === qrModal) {
        qrModal.style.display = 'none';
    }
});

// =====================================================
// EDIT CUSTOMER MODAL EVENT LISTENERS
// =====================================================

const editCustomerModal = document.getElementById('editCustomerModal');
const closeEditCustomerModalBtn = document.getElementById('closeEditCustomerModalBtn');
const cancelEditCustomerBtn = document.getElementById('cancelEditCustomerBtn');
const editCustomerForm = document.getElementById('editCustomerForm');

// Close Edit Customer Modal
closeEditCustomerModalBtn?.addEventListener('click', () => {
    editCustomerModal.style.display = 'none';
});

// Cancel Edit Customer
cancelEditCustomerBtn?.addEventListener('click', () => {
    editCustomerModal.style.display = 'none';
});

// Close modal when clicking outside
editCustomerModal?.addEventListener('click', (e) => {
    if (e.target === editCustomerModal) {
        editCustomerModal.style.display = 'none';
    }
});

// Submit Edit Customer Form
editCustomerForm?.addEventListener('submit', saveEditCustomerInfo);

// Export for use in HTML onclick
window.showDetail = showDetail;
window.showTransactionQR = showTransactionQR;
window.copyUniqueCode = copyUniqueCode;
window.copyQRUrl = copyQRUrl;
window.downloadQR = downloadQR;
window.editCustomerInfo = editCustomerInfo;
window.saveQRCustomerInfo = saveQRCustomerInfo;

// =====================================================
// REALTIME UPDATES (SSE)
// =====================================================

let eventSource = null;
let reconnectTimeout = null;
let isManualClose = false;

// Connect to SSE endpoint for realtime updates
function connectRealtimeUpdates() {
    if (eventSource) return; // Already connected

    try {
        console.log('[REALTIME] Connecting to SSE endpoint...');
        eventSource = new EventSource(`${API_BASE_URL}/api/sepay/stream`);

        // Connection established
        eventSource.addEventListener('connected', (e) => {
            console.log('[REALTIME] Connected to SSE:', JSON.parse(e.data));
            showRealtimeStatus('connected');
        });

        // New transaction received
        eventSource.addEventListener('new-transaction', (e) => {
            const transaction = JSON.parse(e.data);
            console.log('[REALTIME] New transaction received:', transaction);

            handleNewTransaction(transaction);
        });

        // Connection error
        eventSource.onerror = (error) => {
            console.error('[REALTIME] SSE Error:', error);
            showRealtimeStatus('error');

            // Close current connection
            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }

            // Attempt to reconnect after 5 seconds (if not manually closed)
            if (!isManualClose) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = setTimeout(() => {
                    console.log('[REALTIME] Attempting to reconnect...');
                    connectRealtimeUpdates();
                }, 5000);
            }
        };

    } catch (error) {
        console.error('[REALTIME] Failed to connect:', error);
        showRealtimeStatus('error');
    }
}

// Disconnect from SSE
function disconnectRealtimeUpdates() {
    isManualClose = true;
    clearTimeout(reconnectTimeout);

    if (eventSource) {
        eventSource.close();
        eventSource = null;
        console.log('[REALTIME] Disconnected from SSE');
    }

    showRealtimeStatus('disconnected');
}

// Handle new transaction from SSE
function handleNewTransaction(transaction) {
    // Show notification
    showNotification(transaction);

    // Check if transaction matches current filters
    if (!transactionMatchesFilters(transaction)) {
        console.log('[REALTIME] Transaction does not match current filters, skipping UI update');
        return;
    }

    // If on first page, reload data to show new transaction
    if (currentPage === 1) {
        loadData();
        loadStatistics();
    } else {
        // Show a notification that there's new data
        showNewDataBanner();
    }
}

// Check if transaction matches current filters
function transactionMatchesFilters(transaction) {
    // Type filter
    if (filters.type && transaction.transfer_type !== filters.type) {
        return false;
    }

    // Gateway filter
    if (filters.gateway && !transaction.gateway.toLowerCase().includes(filters.gateway.toLowerCase())) {
        return false;
    }

    // Date range filter
    const transactionDate = new Date(transaction.transaction_date);
    if (filters.startDate && transactionDate < new Date(filters.startDate)) {
        return false;
    }
    if (filters.endDate && transactionDate > new Date(filters.endDate)) {
        return false;
    }

    // Search filter
    if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const content = (transaction.content || '').toLowerCase();
        const refCode = (transaction.reference_code || '').toLowerCase();
        const code = (transaction.code || '').toLowerCase();

        if (!content.includes(searchLower) && !refCode.includes(searchLower) && !code.includes(searchLower)) {
            return false;
        }
    }

    return true;
}

// Show notification for new transaction
function showNotification(transaction) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'realtime-notification';
    notification.innerHTML = `
        <div class="notification-icon ${transaction.transfer_type === 'in' ? 'notification-success' : 'notification-danger'}">
            <i data-lucide="arrow-${transaction.transfer_type === 'in' ? 'down' : 'up'}"></i>
        </div>
        <div class="notification-content">
            <strong>${transaction.transfer_type === 'in' ? 'Tiền vào' : 'Tiền ra'}</strong>
            <p>${formatCurrency(transaction.transfer_amount)} - ${transaction.gateway}</p>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;

    // Add to page
    document.body.appendChild(notification);

    // Initialize Lucide icons for the notification
    lucide.createIcons();

    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Show new data banner
function showNewDataBanner() {
    const existingBanner = document.querySelector('.new-data-banner');
    if (existingBanner) return; // Already showing

    const banner = document.createElement('div');
    banner.className = 'new-data-banner';
    banner.innerHTML = `
        <i data-lucide="info"></i>
        <span>Có giao dịch mới. Quay về trang 1 để xem.</span>
        <button onclick="currentPage = 1; loadData(); this.parentElement.remove();">
            Tải lại
        </button>
        <button onclick="this.parentElement.remove();">×</button>
    `;

    const container = document.querySelector('.container');
    container.insertBefore(banner, container.querySelector('.filters'));

    lucide.createIcons();
}

// Show realtime connection status
function showRealtimeStatus(status) {
    let statusElement = document.getElementById('realtimeStatus');

    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.id = 'realtimeStatus';
        statusElement.className = 'realtime-status';
        document.body.appendChild(statusElement);
    }

    const statusConfig = {
        connected: {
            icon: 'wifi',
            text: 'Realtime',
            class: 'status-connected'
        },
        error: {
            icon: 'wifi-off',
            text: 'Mất kết nối',
            class: 'status-error'
        },
        disconnected: {
            icon: 'wifi-off',
            text: 'Ngắt kết nối',
            class: 'status-disconnected'
        }
    };

    const config = statusConfig[status] || statusConfig.disconnected;

    statusElement.className = `realtime-status ${config.class}`;
    statusElement.innerHTML = `
        <i data-lucide="${config.icon}"></i>
        <span>${config.text}</span>
    `;

    lucide.createIcons();
}

// =====================================================
// QR CODE FUNCTIONS
// =====================================================

// Generate and show a new deposit QR code
function generateDepositQR() {
    if (!window.QRGenerator) {
        console.error('QR Generator not loaded');
        return;
    }

    const qrData = window.QRGenerator.generateDepositQR(0); // 0 = customer fills amount
    showQRModal(qrData, true); // true = is new QR
}

// Show QR code for an existing transaction
function showTransactionQR(uniqueCode, amount = 0) {
    if (!window.QRGenerator) {
        console.error('QR Generator not loaded');
        return;
    }

    const qrData = window.QRGenerator.regenerateQR(uniqueCode, amount);
    showQRModal(qrData);
}

// Display QR modal with QR code
function showQRModal(qrData, isNewQR = false) {
    const qrModal = document.getElementById('qrModal');
    const qrModalBody = document.getElementById('qrModalBody');

    // Get existing customer info if available
    const customerInfo = window.CustomerInfoManager ? window.CustomerInfoManager.getCustomerInfo(qrData.uniqueCode) : null;

    qrModalBody.innerHTML = `
        <div style="padding: 20px;">
            <img src="${qrData.qrUrl}" alt="QR Code" style="width: 300px; max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">

            <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <div style="margin-bottom: 12px;">
                    <strong>Ngân hàng:</strong> ${qrData.bankInfo.bank}<br>
                    <strong>Số tài khoản:</strong> ${qrData.bankInfo.accountNo}<br>
                    <strong>Chủ tài khoản:</strong> ${qrData.bankInfo.accountName}
                </div>
                <div style="margin-top: 12px; padding: 10px; background: white; border: 2px dashed #dee2e6; border-radius: 6px; font-family: monospace; font-size: 14px; font-weight: bold; color: #495057;">
                    Mã giao dịch: ${qrData.uniqueCode}
                </div>
                ${qrData.amount > 0 ? `<div style="margin-top: 8px;"><strong>Số tiền:</strong> ${formatCurrency(qrData.amount)}</div>` : '<div style="margin-top: 8px; color: #6c757d;"><em>Khách hàng tự điền số tiền</em></div>'}
            </div>

            ${isNewQR ? `
                <div style="margin-top: 20px; padding: 15px; background: #e7f3ff; border-radius: 8px; border: 1px solid #b3d9ff;">
                    <div style="margin-bottom: 10px; font-weight: 600; color: #0056b3;">
                        <i data-lucide="user-plus" style="width: 16px; height: 16px; vertical-align: middle;"></i> Thông tin khách hàng (tùy chọn)
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <input type="text" id="qrCustomerName" class="filter-input" placeholder="Tên khách hàng" value="${customerInfo?.name || ''}" style="width: 100%;">
                        <input type="tel" id="qrCustomerPhone" class="filter-input" placeholder="Số điện thoại" value="${customerInfo?.phone || ''}" style="width: 100%;">
                        <button class="btn btn-success btn-sm" onclick="saveQRCustomerInfo('${qrData.uniqueCode}')" style="width: 100%;">
                            <i data-lucide="save"></i> Lưu thông tin khách hàng
                        </button>
                    </div>
                </div>
            ` : ''}

            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button class="btn btn-primary" onclick="copyQRUrl('${qrData.qrUrl}')">
                    <i data-lucide="image"></i> Copy URL QR
                </button>
                <button class="btn btn-success" onclick="copyUniqueCode('${qrData.uniqueCode}')">
                    <i data-lucide="hash"></i> Copy Mã GD
                </button>
                <button class="btn btn-secondary" onclick="downloadQR('${qrData.qrUrl}', '${qrData.uniqueCode}')">
                    <i data-lucide="download"></i> Tải QR
                </button>
                ${!isNewQR ? `
                    <button class="btn btn-info" onclick="editCustomerInfo('${qrData.uniqueCode}')">
                        <i data-lucide="user-pen"></i> Sửa TT Khách
                    </button>
                ` : ''}
            </div>

            <div style="margin-top: 15px; padding: 12px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px; font-size: 13px; color: #856404;">
                <strong>Lưu ý:</strong> Khách hàng phải nhập đúng mã giao dịch <strong>${qrData.uniqueCode}</strong> khi chuyển khoản để hệ thống tự động xác nhận.
            </div>
        </div>
    `;

    qrModal.style.display = 'block';

    // Reinitialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Copy QR URL to clipboard
async function copyQRUrl(qrUrl) {
    if (!window.QRGenerator) return;

    const success = await window.QRGenerator.copyQRUrl(qrUrl);
    if (success) {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Đã copy URL QR code!', 'success');
        } else {
            alert('Đã copy URL QR code!');
        }
    } else {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Không thể copy URL', 'error');
        } else {
            alert('Không thể copy URL');
        }
    }
}

// Copy unique code to clipboard
async function copyUniqueCode(uniqueCode) {
    if (!window.QRGenerator) return;

    const success = await window.QRGenerator.copyUniqueCode(uniqueCode);
    if (success) {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification(`Đã copy mã: ${uniqueCode}`, 'success');
        } else {
            alert(`Đã copy mã: ${uniqueCode}`);
        }
    } else {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Không thể copy mã', 'error');
        } else {
            alert('Không thể copy mã');
        }
    }
}

// Download QR code image
async function downloadQR(qrUrl, uniqueCode) {
    if (!window.QRGenerator) return;

    const filename = `QR-${uniqueCode}-${Date.now()}.png`;
    const success = await window.QRGenerator.downloadQRImage(qrUrl, filename);

    if (success) {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Đang tải QR code...', 'success');
        }
    } else {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Không thể tải QR code', 'error');
        } else {
            alert('Không thể tải QR code');
        }
    }
}

// =====================================================
// CUSTOMER INFO FUNCTIONS
// =====================================================

// Save customer info from QR modal
async function saveQRCustomerInfo(uniqueCode) {
    if (!window.CustomerInfoManager) return;

    const name = document.getElementById('qrCustomerName')?.value || '';
    const phone = document.getElementById('qrCustomerPhone')?.value || '';

    const success = await window.CustomerInfoManager.saveCustomerInfo(uniqueCode, { name, phone });

    if (success) {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Đã lưu thông tin khách hàng!', 'success');
        } else {
            alert('Đã lưu thông tin khách hàng!');
        }
        // Reload table to show updated customer info
        loadData();
    } else {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Không thể lưu thông tin', 'error');
        } else {
            alert('Không thể lưu thông tin');
        }
    }
}

// Edit customer info - show edit modal
function editCustomerInfo(uniqueCode) {
    if (!window.CustomerInfoManager) return;

    const editCustomerModal = document.getElementById('editCustomerModal');
    const editCustomerUniqueCode = document.getElementById('editCustomerUniqueCode');
    const editCustomerName = document.getElementById('editCustomerName');
    const editCustomerPhone = document.getElementById('editCustomerPhone');

    // Get existing customer info
    const customerInfo = window.CustomerInfoManager.getCustomerInfo(uniqueCode) || { name: '', phone: '' };

    // Fill form
    editCustomerUniqueCode.textContent = uniqueCode;
    editCustomerName.value = customerInfo.name || '';
    editCustomerPhone.value = customerInfo.phone || '';

    // Store unique code for form submission
    editCustomerForm.dataset.uniqueCode = uniqueCode;

    // Show modal
    editCustomerModal.style.display = 'block';

    // Reinitialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Save customer info from edit modal
async function saveEditCustomerInfo(event) {
    event.preventDefault();

    if (!window.CustomerInfoManager) return;

    const uniqueCode = event.target.dataset.uniqueCode;
    const name = document.getElementById('editCustomerName').value;
    const phone = document.getElementById('editCustomerPhone').value;

    const success = await window.CustomerInfoManager.saveCustomerInfo(uniqueCode, { name, phone });

    if (success) {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Đã cập nhật thông tin khách hàng!', 'success');
        } else {
            alert('Đã cập nhật thông tin khách hàng!');
        }

        // Close modal
        document.getElementById('editCustomerModal').style.display = 'none';

        // Reload table to show updated customer info
        loadData();
    } else {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Không thể cập nhật thông tin', 'error');
        } else {
            alert('Không thể cập nhật thông tin');
        }
    }
}

// =====================================================
// CUSTOMER LIST BY PHONE - MAPPING FEATURE
// =====================================================

const CUSTOMER_API_URL = window.CONFIG?.API_BASE_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';

// Cache for customer data by phone
const customerListCache = {};
const CUSTOMER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Show customers list by phone number
 * @param {string} phone - Phone number to search
 */
async function showCustomersByPhone(phone) {
    if (!phone || phone === 'N/A') {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Không có số điện thoại để tìm kiếm', 'warning');
        }
        return;
    }

    const modal = document.getElementById('customerListModal');
    const loadingEl = document.getElementById('customerListLoading');
    const emptyEl = document.getElementById('customerListEmpty');
    const contentEl = document.getElementById('customerListContent');
    const phoneEl = document.getElementById('customerListPhone');

    // Show modal and loading state
    modal.style.display = 'block';
    phoneEl.textContent = phone;
    loadingEl.style.display = 'block';
    emptyEl.style.display = 'none';
    contentEl.style.display = 'none';

    // Reinitialize icons
    if (window.lucide) lucide.createIcons();

    try {
        // Check cache first
        const cacheKey = phone.replace(/\D/g, '');
        const cached = customerListCache[cacheKey];
        if (cached && (Date.now() - cached.timestamp < CUSTOMER_CACHE_TTL)) {
            console.log('[CUSTOMER-LIST] Using cached data for:', phone);
            renderCustomerList(cached.data);
            return;
        }

        // Fetch from API
        const response = await fetch(`${CUSTOMER_API_URL}/api/customers/search?q=${encodeURIComponent(phone)}&limit=50`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Failed to fetch customers');
        }

        // Filter customers with exact phone match
        const customers = (result.data || []).filter(c => {
            const customerPhone = (c.phone || '').replace(/\D/g, '');
            const searchPhone = phone.replace(/\D/g, '');
            return customerPhone === searchPhone || customerPhone.endsWith(searchPhone) || searchPhone.endsWith(customerPhone);
        });

        // Cache the result
        customerListCache[cacheKey] = {
            data: customers,
            timestamp: Date.now()
        };

        renderCustomerList(customers);

    } catch (error) {
        console.error('[CUSTOMER-LIST] Error:', error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
        emptyEl.querySelector('p').textContent = 'Lỗi khi tải dữ liệu: ' + error.message;
    }
}

/**
 * Render customer list in modal
 * @param {Array} customers - List of customers
 */
function renderCustomerList(customers) {
    const loadingEl = document.getElementById('customerListLoading');
    const emptyEl = document.getElementById('customerListEmpty');
    const contentEl = document.getElementById('customerListContent');
    const totalEl = document.getElementById('customerListTotal');
    const tbody = document.getElementById('customerListTableBody');

    loadingEl.style.display = 'none';

    if (!customers || customers.length === 0) {
        emptyEl.style.display = 'block';
        contentEl.style.display = 'none';
        return;
    }

    emptyEl.style.display = 'none';
    contentEl.style.display = 'block';
    totalEl.textContent = customers.length;

    tbody.innerHTML = customers.map((customer, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>
                <strong>${escapeHtmlForCustomer(customer.name || 'N/A')}</strong>
                ${customer.email ? `<br><small style="color: #6b7280;">${escapeHtmlForCustomer(customer.email)}</small>` : ''}
            </td>
            <td>
                <span class="badge ${getStatusBadgeClass(customer.status)}">
                    ${customer.status || 'Bình thường'}
                </span>
            </td>
            <td style="text-align: right; ${customer.debt > 0 ? 'color: #dc2626;' : 'color: #16a34a;'}">
                ${formatCurrency(customer.debt || 0)}
            </td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtmlForCustomer(customer.address || '')}">
                ${escapeHtmlForCustomer(customer.address || 'N/A')}
            </td>
            <td>
                <a href="../customer-management/index.html?search=${encodeURIComponent(customer.phone || '')}"
                   target="_blank"
                   class="btn btn-sm btn-secondary"
                   title="Xem chi tiết"
                   style="padding: 4px 8px;">
                    <i data-lucide="external-link" style="width: 14px; height: 14px;"></i>
                </a>
                ${customer.phone ? `
                    <a href="https://zalo.me/${customer.phone}"
                       target="_blank"
                       class="btn btn-sm btn-success"
                       title="Chat Zalo"
                       style="padding: 4px 8px; margin-left: 4px;">
                        <i data-lucide="message-circle" style="width: 14px; height: 14px;"></i>
                    </a>
                ` : ''}
            </td>
        </tr>
    `).join('');

    // Reinitialize icons
    if (window.lucide) lucide.createIcons();
}

/**
 * Get status badge CSS class
 */
function getStatusBadgeClass(status) {
    const statusMap = {
        'Bình thường': 'badge-secondary',
        'Bom hàng': 'badge-danger',
        'Cảnh báo': 'badge-warning',
        'Nguy hiểm': 'badge-danger',
        'VIP': 'badge-success'
    };
    return statusMap[status] || 'badge-secondary';
}

/**
 * Escape HTML for customer display
 */
function escapeHtmlForCustomer(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Close customer list modal
 */
function closeCustomerListModal() {
    const modal = document.getElementById('customerListModal');
    modal.style.display = 'none';
}

// Setup Customer List Modal Event Listeners
const customerListModal = document.getElementById('customerListModal');
const closeCustomerListModalBtn = document.getElementById('closeCustomerListModalBtn');

closeCustomerListModalBtn?.addEventListener('click', closeCustomerListModal);

customerListModal?.addEventListener('click', (e) => {
    if (e.target === customerListModal) {
        closeCustomerListModal();
    }
});

// Export functions
window.showCustomersByPhone = showCustomersByPhone;
window.closeCustomerListModal = closeCustomerListModal;

// Auto-connect on page load
document.addEventListener('DOMContentLoaded', () => {
    // Delay connection slightly to let page load first
    setTimeout(() => {
        connectRealtimeUpdates();
    }, 1000);
});

// Disconnect when page unloads
window.addEventListener('beforeunload', () => {
    disconnectRealtimeUpdates();
});
