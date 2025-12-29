// =====================================================
// BALANCE HISTORY - MAIN JAVASCRIPT
// =====================================================

// Configuration
const API_BASE_URL = window.CONFIG?.API_BASE_URL || (
    window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'chatomni-proxy.nhijudyshop.workers.dev'
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
    search: '',
    amount: ''
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

    switch (filterType) {
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

    // View phone data button
    const viewPhoneDataBtn = document.getElementById('viewPhoneDataBtn');
    if (viewPhoneDataBtn) {
        viewPhoneDataBtn.addEventListener('click', () => {
            showPhoneDataModal();
        });
    }

    // Close phone data modal button
    const closePhoneDataModalBtn = document.getElementById('closePhoneDataModalBtn');
    if (closePhoneDataModalBtn) {
        closePhoneDataModalBtn.addEventListener('click', () => {
            closePhoneDataModal();
        });
    }

    // Refresh phone data button
    const refreshPhoneDataBtn = document.getElementById('refreshPhoneDataBtn');
    if (refreshPhoneDataBtn) {
        refreshPhoneDataBtn.addEventListener('click', () => {
            showPhoneDataModal(); // Reload data
        });
    }

    // Fetch names from TPOS button
    const fetchNamesBtn = document.getElementById('fetchNamesBtn');
    if (fetchNamesBtn) {
        fetchNamesBtn.addEventListener('click', async () => {
            await fetchCustomerNamesFromTPOS();
        });
    }

    // Batch update phones button
    const updatePhonesBtn = document.getElementById('updatePhonesBtn');
    if (updatePhonesBtn) {
        updatePhonesBtn.addEventListener('click', async () => {
            if (!confirm('Cập nhật phone cho tất cả transactions chưa xử lý?\n\nĐiều này sẽ extract phone từ nội dung chuyển khoản và lưu vào database.')) {
                return;
            }

            updatePhonesBtn.disabled = true;
            updatePhonesBtn.innerHTML = '<i data-lucide="loader-2"></i> Đang xử lý...';
            lucide.createIcons();

            try {
                const response = await fetch(`${API_BASE_URL}/api/sepay/batch-update-phones`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        limit: 100,
                        force: false
                    })
                });

                const result = await response.json();

                if (result.success) {
                    alert(`✅ Cập nhật thành công!\n\n` +
                        `Tổng: ${result.data.total}\n` +
                        `Thành công: ${result.data.success}\n` +
                        `Bỏ qua: ${result.data.skipped}\n` +
                        `Lỗi: ${result.data.failed}`);

                    // Reload data to show updated phones
                    loadData();
                } else {
                    alert('❌ Lỗi: ' + result.message);
                }
            } catch (error) {
                console.error('[UPDATE-PHONES] Error:', error);
                alert('❌ Lỗi khi cập nhật: ' + error.message);
            } finally {
                updatePhonesBtn.disabled = false;
                updatePhonesBtn.innerHTML = '<i data-lucide="phone"></i> Cập nhật Phone';
                lucide.createIcons();
            }
        });
    }

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
    filters.amount = parseAmountInput(document.getElementById('filterAmount').value);
}

// Parse amount input (supports formats like 100000, 100k, 1m, 1.5m)
function parseAmountInput(input) {
    if (!input) return '';

    // Normalize input - remove spaces, commas, dots used as thousand separators
    let normalized = input.trim().toLowerCase();

    // Handle k (thousand) and m (million) suffixes
    if (normalized.endsWith('k')) {
        const num = parseFloat(normalized.slice(0, -1).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000));
    }
    if (normalized.endsWith('m')) {
        const num = parseFloat(normalized.slice(0, -1).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000000));
    }
    if (normalized.endsWith('tr')) {
        const num = parseFloat(normalized.slice(0, -2).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000000));
    }

    // Remove all non-numeric characters except digits
    const numericOnly = normalized.replace(/[^\d]/g, '');
    return numericOnly || '';
}

// Reset Filters
function resetFilters() {
    document.getElementById('filterType').value = '';
    document.getElementById('filterGateway').value = '';
    document.getElementById('filterSearch').value = '';
    document.getElementById('filterAmount').value = '';

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
    filters.amount = '';
    // startDate and endDate are already set by setDefaultCurrentMonth()
}

/**
 * Filter data by customer name/phone (client-side filtering)
 * This searches in CustomerInfoManager data which is stored locally
 * @param {Array} data - Transaction data from API
 * @param {string} searchQuery - Search term
 * @returns {Array} Filtered data
 */
function filterByCustomerInfo(data, searchQuery) {
    if (!searchQuery || !data || data.length === 0) return data;
    if (!window.CustomerInfoManager) return data;

    const lowerQuery = searchQuery.toLowerCase().trim();
    const isSearchingNoInfo = lowerQuery === 'chưa có thông tin';

    return data.filter(row => {
        // Extract unique code from content
        const content = row.content || '';
        const uniqueCodeMatch = content.match(/\bN2[A-Z0-9]{16}\b/);
        const uniqueCode = uniqueCodeMatch ? uniqueCodeMatch[0] : null;

        // Skip rows without unique code (these show N/A, not customer info)
        // This also excludes gap rows which don't have unique codes
        if (!uniqueCode) return false;

        // Get customer info
        const customerDisplay = window.CustomerInfoManager.getCustomerDisplay(uniqueCode);

        // Special case: searching for "Chưa có thông tin" - only match phone column
        if (isSearchingNoInfo) {
            return customerDisplay.phone === 'Chưa có thông tin';
        }

        // Check if search matches customer name (case-insensitive)
        const nameMatch = customerDisplay.name &&
            customerDisplay.name.toLowerCase().includes(lowerQuery);

        // Check if search matches customer phone
        const phoneMatch = customerDisplay.phone &&
            customerDisplay.phone.includes(searchQuery.trim());

        // Also check backend fields (content, reference_code, gateway)
        const contentMatch = content.toLowerCase().includes(lowerQuery);
        const refMatch = row.reference_code &&
            row.reference_code.toLowerCase().includes(lowerQuery);
        const gatewayMatch = row.gateway &&
            row.gateway.toLowerCase().includes(lowerQuery);

        return nameMatch || phoneMatch || contentMatch || refMatch || gatewayMatch;
    });
}

// Load Data
async function loadData() {
    showLoading();

    try {
        // Create query params but exclude 'search' for API call
        // We'll do client-side search to include customer name/phone
        const apiFilters = { ...filters };
        const searchQuery = filters.search;
        delete apiFilters.search; // Remove search from API request

        const queryParams = new URLSearchParams({
            page: currentPage,
            limit: searchQuery ? 500 : 50, // Get more rows if searching (for client-side filter)
            ...apiFilters
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
            // Apply client-side filtering for customer name/phone
            let filteredData = result.data;
            if (searchQuery) {
                filteredData = filterByCustomerInfo(result.data, searchQuery);
            }

            // Skip gap detection when searching (don't show missing transaction rows)
            renderTable(filteredData, !!searchQuery);

            // Update pagination info
            if (searchQuery) {
                // For client-side search, show custom pagination info
                updatePagination({
                    ...result.pagination,
                    total: filteredData.length,
                    totalPages: 1,
                    page: 1
                });
            } else {
                updatePagination(result.pagination);
            }
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
function renderTable(data, skipGapDetection = false) {
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

    // Build rows with gap detection
    const rows = [];

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const currentRef = parseInt(row.reference_code);

        // Check for gap with the NEXT row (since data is sorted DESC by date)
        // If current is 2567 and next is 2565, there's a gap of 2566
        // Skip gap detection when searching/filtering
        if (!skipGapDetection && i < data.length - 1) {
            const nextRow = data[i + 1];
            const nextRef = parseInt(nextRow.reference_code);

            // Only check if both are valid numbers
            if (!isNaN(currentRef) && !isNaN(nextRef) && currentRef - nextRef > 1) {
                // There are missing reference codes between current and next
                for (let missing = currentRef - 1; missing > nextRef; missing--) {
                    rows.push(renderGapRow(missing, nextRef, currentRef, nextRow.transaction_date, row.transaction_date));
                }
            }
        }

        // Add the actual transaction row
        rows.push(renderTransactionRow(row));
    }

    tableBody.innerHTML = rows.join('');

    // Reinitialize Lucide icons for dynamically added buttons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Render a single transaction row
 */
function renderTransactionRow(row) {
    // Extract unique code from content (look for N2 prefix pattern - exactly 18 chars)
    const content = row.content || '';
    const uniqueCodeMatch = content.match(/\bN2[A-Z0-9]{16}\b/);
    const uniqueCode = uniqueCodeMatch ? uniqueCodeMatch[0] : null;

    // Get customer info - PRIORITY:
    // 1. From backend JOIN (row.customer_phone, row.customer_name) - NEW!
    // 2. From CustomerInfoManager (QR code fallback)
    let customerDisplay = { name: 'N/A', phone: 'N/A', hasInfo: false };

    // Priority 1: Use data from backend LEFT JOIN (partial phone match)
    if (row.customer_phone || row.customer_name) {
        customerDisplay = {
            name: row.customer_name || 'N/A',
            phone: row.customer_phone || 'N/A',
            hasInfo: !!(row.customer_phone || row.customer_name)
        };
        console.log('[RENDER] Using backend JOIN data:', customerDisplay);
    }
    // Priority 2: Fallback to CustomerInfoManager (QR code)
    else if (uniqueCode && window.CustomerInfoManager) {
        customerDisplay = window.CustomerInfoManager.getCustomerDisplay(uniqueCode);
        console.log('[RENDER] Using CustomerInfoManager:', customerDisplay);
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
                    ${hasPermission(2) ? `
                        <button class="btn btn-secondary btn-sm" onclick="editCustomerInfo('${uniqueCode}')" title="Chỉnh sửa" style="padding: 4px 6px;">
                            <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                        </button>
                    ` : ''}
                </div>
            ` : `
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="color: #999;">N/A</span>
                    ${hasPermission(2) ? `
                        <button class="btn btn-secondary btn-sm" onclick="editCustomerInfo('tx_${row.id}')" title="Thêm thông tin khách hàng" style="padding: 4px 6px;">
                            <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                        </button>
                    ` : ''}
                </div>
            `}
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
}

/**
 * Render a gap warning row for missing reference code
 */
function renderGapRow(missingRef, prevRef, nextRef, prevDate, nextDate) {
    return `
    <tr class="gap-row" style="background: linear-gradient(90deg, #fef3c7 0%, #fffbeb 50%, #fef3c7 100%); border: 2px dashed #f59e0b;">
        <td style="text-align: center; color: #92400e; font-style: italic;">
            <i data-lucide="alert-triangle" style="width: 16px; height: 16px; color: #d97706;"></i>
        </td>
        <td colspan="5" style="color: #92400e; font-weight: 500;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="alert-circle" style="width: 18px; height: 18px; color: #d97706;"></i>
                <span>Giao dịch bị thiếu - Webhook không nhận được</span>
            </div>
        </td>
        <td style="font-family: monospace; font-weight: bold; color: #d97706; font-size: 1.1em; text-align: center;">
            ${missingRef}
        </td>
        <td colspan="3" style="text-align: center;">
            <button class="btn btn-sm" onclick="fetchMissingTransaction('${missingRef}')" title="Lấy lại giao dịch từ Sepay" style="background: #3b82f6; color: white; border: none; padding: 4px 10px; margin-right: 4px;">
                <i data-lucide="download" style="width: 14px; height: 14px;"></i> Lấy lại
            </button>
            <button class="btn btn-sm" onclick="ignoreGap('${missingRef}')" title="Bỏ qua" style="background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; padding: 4px 8px;">
                <i data-lucide="eye-off" style="width: 14px; height: 14px;"></i>
            </button>
        </td>
        <td></td>
    </tr>
    `;
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

// Generate QR Button (without customer info)
generateQRBtn?.addEventListener('click', () => {
    generateDepositQR();
});

// Inline QR Form - Generate QR with Customer Info
const inlineGenerateQRBtn = document.getElementById('inlineGenerateQRBtn');
const inlineCustomerName = document.getElementById('inlineCustomerName');
const inlineCustomerPhone = document.getElementById('inlineCustomerPhone');
const inlineQRDisplay = document.getElementById('inlineQRDisplay');
const inlineQRImage = document.getElementById('inlineQRImage');
const inlineQRCode = document.getElementById('inlineQRCode');
const copyInlineQRBtn = document.getElementById('copyInlineQRBtn');
const closeInlineQRBtn = document.getElementById('closeInlineQRBtn');

// Store current QR URL for copy function
let currentInlineQRUrl = '';
let hasCopiedCurrentQR = false; // Track if current QR has been copied
let currentCustomerInfo = ''; // Store customer name/phone for QR image

inlineGenerateQRBtn?.addEventListener('click', () => {
    generateDepositQRInline();
});

// Handle Enter key on inline inputs
inlineCustomerName?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        generateDepositQRInline();
    }
});

inlineCustomerPhone?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        generateDepositQRInline();
    }
});

// Copy QR image to clipboard
copyInlineQRBtn?.addEventListener('click', async () => {
    if (!currentInlineQRUrl) return;

    // Check if already copied this QR
    const alreadyCopied = hasCopiedCurrentQR;

    try {
        // Create custom image with Canvas (without account number, with customer info)
        const customImageBlob = await createCustomQRImage(currentInlineQRUrl, currentCustomerInfo);

        // Copy to clipboard
        await navigator.clipboard.write([
            new ClipboardItem({
                'image/png': customImageBlob
            })
        ]);

        // Visual feedback
        const originalHTML = copyInlineQRBtn.innerHTML;
        copyInlineQRBtn.innerHTML = '<i data-lucide="check"></i>';
        copyInlineQRBtn.classList.remove('btn-primary');
        copyInlineQRBtn.classList.add('btn-success');

        if (window.lucide) lucide.createIcons();

        setTimeout(() => {
            copyInlineQRBtn.innerHTML = originalHTML;
            copyInlineQRBtn.classList.remove('btn-success');
            copyInlineQRBtn.classList.add('btn-primary');
            if (window.lucide) lucide.createIcons();
        }, 1500);

        // Show appropriate notification
        if (window.NotificationManager) {
            if (alreadyCopied) {
                // Warning: already copied once
                window.NotificationManager.showNotification('⚠️ Đã copy lần 2! Có thể bạn cần tạo QR mới cho khách khác?', 'warning');
            } else {
                window.NotificationManager.showNotification('Đã copy hình QR!', 'success');
            }
        }

        // Mark as copied
        hasCopiedCurrentQR = true;

    } catch (error) {
        console.error('Failed to copy QR image:', error);
        // Fallback: copy URL
        try {
            await navigator.clipboard.writeText(currentInlineQRUrl);
            if (window.NotificationManager) {
                if (alreadyCopied) {
                    window.NotificationManager.showNotification('⚠️ Đã copy URL lần 2! Có thể bạn cần tạo QR mới?', 'warning');
                } else {
                    window.NotificationManager.showNotification('Đã copy URL QR!', 'success');
                }
            }
            hasCopiedCurrentQR = true;
        } catch (e) {
            if (window.NotificationManager) {
                window.NotificationManager.showNotification('Không thể copy', 'error');
            }
        }
    }
});

/**
 * Create custom QR image with bank info but WITHOUT account number
 * @param {string} qrUrl - Original QR URL
 * @param {string} customerInfo - Customer name or phone to display
 * @returns {Promise<Blob>} - PNG image blob
 */
async function createCustomQRImage(qrUrl, customerInfo = '') {
    return new Promise(async (resolve, reject) => {
        try {
            // Load the QR image
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                // Canvas dimensions
                const padding = 30;
                const hasCustomer = customerInfo && customerInfo.trim();
                const textAreaHeight = hasCustomer ? 105 : 80;
                const canvasWidth = img.width + padding * 2;
                const canvasHeight = img.height + padding * 2 + textAreaHeight;

                // Create canvas
                const canvas = document.createElement('canvas');
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
                const ctx = canvas.getContext('2d');

                // White background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);

                // Draw QR code (centered)
                const qrX = (canvasWidth - img.width) / 2;
                ctx.drawImage(img, qrX, padding, img.width, img.height);

                // Text area background (light gray)
                const textAreaY = img.height + padding * 1.5;
                ctx.fillStyle = '#f8f9fa';
                ctx.fillRect(padding / 2, textAreaY, canvasWidth - padding, textAreaHeight);

                // Draw text - WITHOUT account number
                ctx.fillStyle = '#333333';
                ctx.textAlign = 'center';
                const centerX = canvasWidth / 2;

                // Bank name
                ctx.font = 'bold 16px Arial, sans-serif';
                ctx.fillText('Ngân hàng: ACB', centerX, textAreaY + 28);

                // Account holder name (NO account number!)
                ctx.font = '15px Arial, sans-serif';
                ctx.fillText('Chủ tài khoản: LAI THUY YEN NHI', centerX, textAreaY + 55);

                // Customer info (if provided)
                if (hasCustomer) {
                    ctx.font = 'bold 14px Arial, sans-serif';
                    ctx.fillStyle = '#10b981'; // Green color
                    ctx.fillText('Khách hàng: ' + customerInfo, centerX, textAreaY + 82);
                }

                // Convert to blob
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create blob'));
                    }
                }, 'image/png');
            };

            img.onerror = () => {
                reject(new Error('Failed to load QR image'));
            };

            img.src = qrUrl;
        } catch (error) {
            reject(error);
        }
    });
}

// Close inline QR display
closeInlineQRBtn?.addEventListener('click', () => {
    if (inlineQRDisplay) {
        inlineQRDisplay.style.display = 'none';
        currentInlineQRUrl = '';
    }
});

// Generate QR inline (no popup)
async function generateDepositQRInline() {
    if (!window.QRGenerator) {
        console.error('QR Generator not loaded');
        return;
    }

    const customerName = inlineCustomerName?.value?.trim() || '';
    const customerPhone = inlineCustomerPhone?.value?.trim() || '';

    // Generate QR code
    const qrData = window.QRGenerator.generateDepositQR(0); // 0 = customer fills amount

    // If customer info is provided, save it
    if ((customerName || customerPhone) && window.CustomerInfoManager) {
        await window.CustomerInfoManager.saveCustomerInfo(qrData.uniqueCode, {
            name: customerName,
            phone: customerPhone
        });
    }

    // Display QR inline
    const inlineCustomerInfo = document.getElementById('inlineCustomerInfo');
    if (inlineQRDisplay && inlineQRImage && inlineQRCode) {
        currentInlineQRUrl = qrData.qrUrl;
        inlineQRImage.src = qrData.qrUrl;
        inlineQRCode.textContent = qrData.uniqueCode;

        // Show customer name only (no phone)
        if (inlineCustomerInfo) {
            const displayInfo = customerName || '';
            inlineCustomerInfo.textContent = displayInfo;
            inlineCustomerInfo.title = displayInfo; // Full text on hover
            inlineCustomerInfo.style.display = displayInfo ? 'inline' : 'none';
        }

        // Store customer info for QR image (name or phone)
        currentCustomerInfo = customerName || customerPhone || '';

        inlineQRDisplay.style.display = 'flex';
        hasCopiedCurrentQR = false; // Reset copy tracking for new QR

        // Reinitialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    // Clear the inline inputs after generating QR
    if (inlineCustomerName) inlineCustomerName.value = '';
    if (inlineCustomerPhone) inlineCustomerPhone.value = '';

    // Show notification
    if (window.NotificationManager) {
        const msg = customerName ? `QR tạo cho ${customerName}` : 'Đã tạo QR code!';
        window.NotificationManager.showNotification(msg, 'success');
    }
}

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
async function handleNewTransaction(transaction) {
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

    // Amount filter
    if (filters.amount) {
        const filterAmount = parseInt(filters.amount, 10);
        const transactionAmount = parseInt(transaction.transfer_amount, 10);
        if (filterAmount !== transactionAmount) {
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
 * Get TPOS bearer token from localStorage
 * @returns {string|null} - Bearer token or null if not found
 */
function getTposToken() {
    try {
        const tokenData = localStorage.getItem('bearer_token_data');
        if (tokenData) {
            const parsed = JSON.parse(tokenData);
            // Check if token is still valid (with 5 minute buffer)
            if (parsed.access_token && parsed.expires_at) {
                const bufferTime = 5 * 60 * 1000;
                if (Date.now() < (parsed.expires_at - bufferTime)) {
                    return parsed.access_token;
                }
            }
        }
    } catch (error) {
        console.error('[CUSTOMER-LIST] Error reading token:', error);
    }
    return null;
}

/**
 * Fallback to TPOS OData API when proxy API returns empty
 * @param {string} phone - Phone number to search
 * @returns {Promise<Array>} - Array of customers from TPOS
 */
async function fetchCustomersFromTpos(phone) {
    const token = getTposToken();
    if (!token) {
        console.warn('[CUSTOMER-LIST] No valid TPOS token available for fallback');
        return [];
    }

    try {
        const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Name=${encodeURIComponent(phone)}&$top=50&$orderby=DateCreated+desc&$filter=Type+eq+'Customer'&$count=true`;

        console.log('[CUSTOMER-LIST] Fallback to TPOS OData API:', tposUrl);

        const response = await fetch(tposUrl, {
            headers: {
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'authorization': `Bearer ${token}`,
                'x-requested-with': 'XMLHttpRequest'
            }
        });

        if (!response.ok) {
            console.warn('[CUSTOMER-LIST] TPOS API returned status:', response.status);
            return [];
        }

        const result = await response.json();

        if (!result.value || result.value.length === 0) {
            console.log('[CUSTOMER-LIST] TPOS API returned no results');
            return [];
        }

        console.log('[CUSTOMER-LIST] TPOS API found', result.value.length, 'customers');

        // Transform TPOS response to match expected customer format
        return result.value.map(tposCustomer => ({
            id: tposCustomer.Id,
            tpos_id: tposCustomer.Id,
            name: tposCustomer.Name || tposCustomer.DisplayName || '',
            phone: tposCustomer.Phone || '',
            address: tposCustomer.Street || tposCustomer.FullAddress || '',
            email: tposCustomer.Email || '',
            status: tposCustomer.StatusText || tposCustomer.Status || 'Bình thường',
            debt: tposCustomer.Debit || 0,
            source: 'TPOS',
            // Additional TPOS fields
            facebook_id: tposCustomer.FacebookASIds || null,
            zalo: tposCustomer.Zalo || null,
            created_at: tposCustomer.DateCreated || null,
            updated_at: tposCustomer.LastUpdated || null
        }));

    } catch (error) {
        console.error('[CUSTOMER-LIST] TPOS fallback error:', error);
        return [];
    }
}

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
        // Fetch customers and transaction stats in parallel
        const [customersResponse, transactionsResponse] = await Promise.all([
            fetch(`${CUSTOMER_API_URL}/api/customers/search?q=${encodeURIComponent(phone)}&limit=50`),
            fetch(`${CUSTOMER_API_URL}/api/sepay/transactions-by-phone?phone=${encodeURIComponent(phone)}&limit=1`)
        ]);

        if (!customersResponse.ok) {
            throw new Error(`HTTP error! status: ${customersResponse.status}`);
        }

        const customersResult = await customersResponse.json();
        let balanceStats = null;

        // Get balance statistics from transactions
        if (transactionsResponse.ok) {
            const transactionsResult = await transactionsResponse.json();
            if (transactionsResult.success && transactionsResult.statistics) {
                balanceStats = transactionsResult.statistics;
                console.log('[CUSTOMER-LIST] Balance stats:', balanceStats);
            }
        }

        if (!customersResult.success) {
            throw new Error(customersResult.message || 'Failed to fetch customers');
        }

        // Filter customers with exact phone match
        let customers = (customersResult.data || []).filter(c => {
            const customerPhone = (c.phone || '').replace(/\D/g, '');
            const searchPhone = phone.replace(/\D/g, '');
            return customerPhone === searchPhone || customerPhone.endsWith(searchPhone) || searchPhone.endsWith(customerPhone);
        });

        // Fallback to TPOS OData API if proxy returned empty results
        if (customers.length === 0) {
            console.log('[CUSTOMER-LIST] Proxy API returned empty, trying TPOS fallback...');
            if (window.NotificationManager) {
                window.NotificationManager.showNotification('Đang tìm kiếm trong TPOS...', 'info');
            }

            const tposCustomers = await fetchCustomersFromTpos(phone);
            if (tposCustomers.length > 0) {
                customers = tposCustomers;
                console.log('[CUSTOMER-LIST] Using TPOS fallback results:', customers.length, 'customers');
                if (window.NotificationManager) {
                    window.NotificationManager.showNotification(`Tìm thấy ${customers.length} khách hàng từ TPOS`, 'success');
                }
            }
        }

        renderCustomerList(customers, balanceStats, phone);

    } catch (error) {
        console.error('[CUSTOMER-LIST] Error:', error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
        emptyEl.querySelector('p').textContent = 'Lỗi khi tải dữ liệu: ' + error.message;
    }
}

/**
 * Merge customers with the same phone number (like customer-management)
 * @param {Array} customers - List of customers
 * @returns {Array} - Merged customer list
 */
function mergeCustomersByPhone(customers) {
    const phoneMap = new Map();

    customers.forEach(customer => {
        const phone = (customer.phone || '').trim();
        if (!phone) {
            // Customers without phone are kept as-is
            const uniqueKey = `no_phone_${customer.id}`;
            phoneMap.set(uniqueKey, {
                ...customer,
                mergedNames: [customer.name || ''],
                mergedAddresses: [customer.address || ''],
                mergedIds: [customer.id]
            });
            return;
        }

        if (phoneMap.has(phone)) {
            // Merge with existing customer
            const existing = phoneMap.get(phone);
            const newName = (customer.name || '').trim();
            const newAddress = (customer.address || '').trim();

            // Add unique names
            if (newName && !existing.mergedNames.includes(newName)) {
                existing.mergedNames.push(newName);
            }

            // Add unique addresses
            if (newAddress && !existing.mergedAddresses.includes(newAddress)) {
                existing.mergedAddresses.push(newAddress);
            }

            // Merge IDs for reference
            existing.mergedIds.push(customer.id);

            // Keep the higher debt
            if ((customer.debt || 0) > (existing.debt || 0)) {
                existing.debt = customer.debt;
            }

            // Keep VIP or worse status
            existing.status = getMergedCustomerStatus(existing.status, customer.status);
        } else {
            // First occurrence
            phoneMap.set(phone, {
                ...customer,
                mergedNames: [customer.name || ''],
                mergedAddresses: [customer.address || ''],
                mergedIds: [customer.id]
            });
        }
    });

    return Array.from(phoneMap.values());
}

/**
 * Get merged status (prioritize VIP > Nguy hiểm > Cảnh báo > Bom hàng > Bình thường)
 */
function getMergedCustomerStatus(status1, status2) {
    const statusPriority = {
        'VIP': 5,
        'Nguy hiểm': 4,
        'Cảnh báo': 3,
        'Bom hàng': 2,
        'Bình thường': 1
    };

    const priority1 = statusPriority[status1] || 1;
    const priority2 = statusPriority[status2] || 1;

    return priority1 >= priority2 ? status1 : status2;
}

/**
 * Render customer list in modal
 * @param {Array} customers - List of customers
 * @param {Object} balanceStats - Transaction statistics from balance-history
 * @param {string} phone - Phone number for debt lookup
 */
function renderCustomerList(customers, balanceStats = null, phone = null) {
    const loadingEl = document.getElementById('customerListLoading');
    const emptyEl = document.getElementById('customerListEmpty');
    const contentEl = document.getElementById('customerListContent');
    const totalEl = document.getElementById('customerListTotal');
    const tbody = document.getElementById('customerListTableBody');
    const countDiv = document.getElementById('customerListCount');

    // Safety check for null elements
    if (!loadingEl || !emptyEl || !contentEl) {
        console.error('[CUSTOMER-LIST] Required DOM elements not found');
        return;
    }

    loadingEl.style.display = 'none';

    if (!customers || customers.length === 0) {
        emptyEl.style.display = 'block';
        contentEl.style.display = 'none';
        return;
    }

    emptyEl.style.display = 'none';
    contentEl.style.display = 'block';

    // Merge customers with the same phone number
    const mergedCustomers = mergeCustomersByPhone(customers);

    // Safety check before setting textContent
    if (totalEl) {
        totalEl.textContent = mergedCustomers.length;
    }

    // Update count div with balance statistics
    if (balanceStats) {
        const totalIn = balanceStats.total_in || 0;
        countDiv.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; gap: 15px; align-items: center;">
                <span>
                    <i data-lucide="users" style="width: 16px; height: 16px; vertical-align: middle;"></i>
                    <strong>${mergedCustomers.length}</strong> khách hàng
                </span>
                <span style="color: #16a34a; font-weight: 600;">
                    <i data-lucide="banknote" style="width: 14px; height: 14px; vertical-align: middle;"></i>
                    Tổng GD: <strong>${formatCurrency(totalIn)}</strong>
                </span>
                <span style="color: #6b7280;">
                    (${balanceStats.total_transactions || 0} giao dịch)
                </span>
            </div>
        `;
    }

    tbody.innerHTML = mergedCustomers.map((customer, index) => {
        // Handle merged names display (Tên 1 | Tên 2 | Tên 3...)
        const mergedNames = customer.mergedNames || [customer.name || ''];
        const displayName = mergedNames.filter(n => n.trim()).join(' | ');

        // Check if this is a merged customer (has multiple entries)
        const isMerged = (customer.mergedIds && customer.mergedIds.length > 1);
        const mergedBadge = isMerged ? `<span style="background: #f59e0b; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${customer.mergedIds.length} trùng</span>` : '';

        // Get TPOS ID
        const tposId = customer.tpos_id || '';

        return `
        <tr>
            <td>${index + 1}</td>
            <td>
                <strong>${escapeHtmlForCustomer(displayName || 'N/A')}</strong>
                ${mergedBadge}
                ${customer.email ? `<br><small style="color: #6b7280;">${escapeHtmlForCustomer(customer.email)}</small>` : ''}
            </td>
            <td style="text-align: center;">
                ${tposId ? `<code style="background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${tposId}</code>` : '<span style="color: #9ca3af;">-</span>'}
            </td>
            <td>
                <span class="badge ${getStatusBadgeClass(customer.status)}">
                    ${customer.status || 'Bình thường'}
                </span>
            </td>
            <td id="debtCell_${index}" style="text-align: right;">
                <span style="color: #9ca3af;">Đang tải...</span>
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
    `}).join('');

    // Reinitialize icons
    if (window.lucide) lucide.createIcons();

    // Load debt data for this phone
    if (phone) {
        loadDebtForPhone(phone);
    }
}

/**
 * Load debt data for a phone number and update the debt cell
 * @param {string} phone - Phone number
 */
async function loadDebtForPhone(phone) {
    try {
        const response = await fetch(`${CUSTOMER_API_URL}/api/sepay/debt-summary?phone=${encodeURIComponent(phone)}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch debt');
        }

        const data = result.data;
        const totalDebt = data.total_debt || 0;
        const transactions = data.transactions || [];

        console.log('[DEBT] Loaded for phone:', phone, 'Total:', totalDebt, 'Transactions:', transactions.length);

        // Update all debt cells (there's only one row per phone now)
        const debtCell = document.getElementById('debtCell_0');
        if (debtCell) {
            if (totalDebt > 0) {
                // Build expandable transaction list
                const transactionListHtml = transactions.length > 0 ? `
                    <div id="debtDetail" style="display: none; margin-top: 8px; padding: 8px; background: #f9fafb; border-radius: 6px; font-size: 12px; text-align: left;">
                        ${transactions.slice(0, 20).map((t, i) => {
                    const isLast = i === Math.min(transactions.length - 1, 19);
                    const prefix = isLast ? '└──' : '├──';
                    const dateStr = t.date ? new Date(t.date).toLocaleDateString('vi-VN') : 'N/A';
                    const statusIcon = t.debt_added ? '✓' : '○';
                    return `
                                <div style="padding: 2px 0; color: #374151; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${prefix} ${statusIcon} <strong>${formatCurrency(t.amount)}</strong>
                                    <span style="color: #9ca3af;">(${dateStr})</span>
                                </div>
                            `;
                }).join('')}
                        ${transactions.length > 20 ? `<div style="color: #9ca3af; font-style: italic;">... và ${transactions.length - 20} giao dịch khác</div>` : ''}
                    </div>
                ` : '';

                debtCell.innerHTML = `
                    <div onclick="toggleDebtDetail()" style="cursor: pointer;">
                        <div style="color: #16a34a; font-weight: 600;">
                            ${formatCurrency(totalDebt)}
                        </div>
                        <small style="color: #9ca3af; font-size: 10px;">
                            ${transactions.length} giao dịch
                            <span id="debtExpandIcon" style="font-size: 10px;">▼</span>
                        </small>
                    </div>
                    ${transactionListHtml}
                `;
            } else {
                debtCell.innerHTML = `
                    <span style="color: #9ca3af;">0 đ</span>
                    <br><small style="color: #9ca3af; font-size: 10px;">Chưa có GD</small>
                `;
            }
        }

    } catch (error) {
        console.error('[DEBT] Error loading:', error);
        const debtCell = document.getElementById('debtCell_0');
        if (debtCell) {
            debtCell.innerHTML = `<span style="color: #ef4444;">Lỗi</span>`;
        }
    }
}

/**
 * Toggle debt detail expandable row
 */
function toggleDebtDetail() {
    const detail = document.getElementById('debtDetail');
    const icon = document.getElementById('debtExpandIcon');
    if (detail) {
        const isHidden = detail.style.display === 'none';
        detail.style.display = isHidden ? 'block' : 'none';
        if (icon) {
            icon.textContent = isHidden ? '▲' : '▼';
        }
    }
}

// Export toggleDebtDetail
window.toggleDebtDetail = toggleDebtDetail;

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

    // Load gap detection data
    setTimeout(() => {
        loadGapData();
    }, 2000);
});

// =====================================================
// GAP DETECTION (MISSING TRANSACTIONS)
// =====================================================

let gapsData = [];

/**
 * Load gap detection data from backend
 */
async function loadGapData() {
    try {
        console.log('[GAPS] Loading gap data...');

        // First, trigger gap detection
        const detectResponse = await fetch(`${API_BASE_URL}/api/sepay/detect-gaps`);
        const detectResult = await detectResponse.json();

        if (detectResult.success && detectResult.total_gaps > 0) {
            gapsData = detectResult.gaps || [];
            updateGapCard(detectResult.total_gaps);
            console.log('[GAPS] Found', detectResult.total_gaps, 'gaps');
        } else {
            // No gaps found
            gapsData = [];
            updateGapCard(0);
            console.log('[GAPS] No gaps found');
        }

    } catch (error) {
        console.error('[GAPS] Error loading gap data:', error);
        updateGapCard(0);
    }
}

/**
 * Update the gap card in statistics
 */
function updateGapCard(count) {
    const gapCard = document.getElementById('gapCard');
    const totalGaps = document.getElementById('totalGaps');
    const gapHint = document.getElementById('gapHint');

    if (count > 0) {
        gapCard.style.display = 'block';
        totalGaps.textContent = count;
        gapHint.textContent = 'Nhấn để xem chi tiết';

        // Add warning animation
        gapCard.classList.add('gap-warning');
    } else {
        gapCard.style.display = 'none';
    }

    // Reinitialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Show gaps modal
 */
async function showGapsModal() {
    const modal = document.getElementById('gapsModal');
    const loadingEl = document.getElementById('gapsLoading');
    const emptyEl = document.getElementById('gapsEmpty');
    const contentEl = document.getElementById('gapsContent');

    // Show modal and loading state
    modal.style.display = 'block';
    loadingEl.style.display = 'block';
    emptyEl.style.display = 'none';
    contentEl.style.display = 'none';

    // Reinitialize icons
    if (window.lucide) lucide.createIcons();

    try {
        // Fetch gaps from backend
        const response = await fetch(`${API_BASE_URL}/api/sepay/gaps?status=detected`);
        const result = await response.json();

        loadingEl.style.display = 'none';

        if (result.success && result.data && result.data.length > 0) {
            gapsData = result.data;
            renderGapsList(result.data);
            contentEl.style.display = 'block';
        } else if (gapsData.length > 0) {
            // Use cached data from detect-gaps
            renderGapsList(gapsData);
            contentEl.style.display = 'block';
        } else {
            emptyEl.style.display = 'block';
        }

        // Reinitialize icons
        if (window.lucide) lucide.createIcons();

    } catch (error) {
        console.error('[GAPS] Error fetching gaps:', error);
        loadingEl.style.display = 'none';

        if (gapsData.length > 0) {
            renderGapsList(gapsData);
            contentEl.style.display = 'block';
        } else {
            emptyEl.style.display = 'block';
        }
    }
}

/**
 * Render gaps list in modal
 */
function renderGapsList(gaps) {
    const tbody = document.getElementById('gapsTableBody');
    const totalEl = document.getElementById('gapsTotal');

    totalEl.textContent = gaps.length;

    tbody.innerHTML = gaps.map((gap, index) => {
        const status = gap.status || 'detected';
        const statusBadge = status === 'detected'
            ? '<span class="badge badge-warning">Phát hiện</span>'
            : status === 'ignored'
            ? '<span class="badge badge-secondary">Bỏ qua</span>'
            : '<span class="badge badge-success">Đã xử lý</span>';

        return `
        <tr>
            <td>${index + 1}</td>
            <td style="font-family: monospace; font-weight: bold; color: #d97706;">
                ${gap.missing_reference_code}
            </td>
            <td style="font-family: monospace; color: #6b7280;">
                ${gap.previous_reference_code || 'N/A'}
                ${gap.previous_date ? `<br><small style="color: #9ca3af;">${formatDateTime(gap.previous_date)}</small>` : ''}
            </td>
            <td style="font-family: monospace; color: #6b7280;">
                ${gap.next_reference_code || 'N/A'}
                ${gap.next_date ? `<br><small style="color: #9ca3af;">${formatDateTime(gap.next_date)}</small>` : ''}
            </td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="ignoreGap('${gap.missing_reference_code}')" title="Bỏ qua">
                    <i data-lucide="eye-off" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        </tr>
        `;
    }).join('');

    // Reinitialize icons
    if (window.lucide) lucide.createIcons();
}

/**
 * Close gaps modal
 */
function closeGapsModal() {
    const modal = document.getElementById('gapsModal');
    modal.style.display = 'none';
}

/**
 * Ignore a specific gap (mark as not a real transaction)
 */
async function ignoreGap(referenceCode) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/sepay/gaps/${referenceCode}/ignore`, {
            method: 'POST'
        });
        const result = await response.json();

        if (result.success) {
            if (window.NotificationManager) {
                window.NotificationManager.showNotification(`Đã bỏ qua mã ${referenceCode}`, 'success');
            }

            // Reload gaps data
            await loadGapData();

            // Refresh modal if open
            const modal = document.getElementById('gapsModal');
            if (modal.style.display === 'block') {
                showGapsModal();
            }
        } else {
            throw new Error(result.error || 'Failed to ignore gap');
        }

    } catch (error) {
        console.error('[GAPS] Error ignoring gap:', error);
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Lỗi khi bỏ qua gap: ' + error.message, 'error');
        }
    }
}

/**
 * Re-detect gaps (rescan)
 */
async function rescanGaps() {
    const detectBtn = document.getElementById('detectGapsBtn');
    if (detectBtn) {
        detectBtn.disabled = true;
        detectBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Đang quét...';
    }

    try {
        await loadGapData();

        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Đã quét lại gaps', 'success');
        }

        // Refresh modal
        showGapsModal();

    } catch (error) {
        console.error('[GAPS] Error rescanning:', error);
    } finally {
        if (detectBtn) {
            detectBtn.disabled = false;
            detectBtn.innerHTML = '<i data-lucide="search"></i> Quét lại';
            if (window.lucide) lucide.createIcons();
        }
    }
}

/**
 * Retry all items in the failed webhook queue
 */
async function retryFailedQueue() {
    const retryBtn = document.getElementById('retryAllGapsBtn');
    if (retryBtn) {
        retryBtn.disabled = true;
        retryBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Đang retry...';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/sepay/failed-queue/retry-all`, {
            method: 'POST'
        });
        const result = await response.json();

        if (result.success) {
            if (window.NotificationManager) {
                window.NotificationManager.showNotification(result.message, 'success');
            }

            // Reload gaps after retry
            await loadGapData();

            // Reload main data
            loadData();
            loadStatistics();

            // Refresh modal
            showGapsModal();
        } else {
            throw new Error(result.error || 'Failed to retry');
        }

    } catch (error) {
        console.error('[GAPS] Error retrying failed queue:', error);
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Lỗi khi retry: ' + error.message, 'error');
        }
    } finally {
        if (retryBtn) {
            retryBtn.disabled = false;
            retryBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Retry Failed Queue';
            if (window.lucide) lucide.createIcons();
        }
    }
}

// Setup Gaps Modal Event Listeners
const gapsModal = document.getElementById('gapsModal');
const closeGapsModalBtn = document.getElementById('closeGapsModalBtn');
const detectGapsBtn = document.getElementById('detectGapsBtn');
const retryAllGapsBtn = document.getElementById('retryAllGapsBtn');

closeGapsModalBtn?.addEventListener('click', closeGapsModal);

gapsModal?.addEventListener('click', (e) => {
    if (e.target === gapsModal) {
        closeGapsModal();
    }
});

detectGapsBtn?.addEventListener('click', rescanGaps);
retryAllGapsBtn?.addEventListener('click', retryFailedQueue);

// Filter Gaps Only Button
let showGapsOnly = false;
const filterGapsOnlyBtn = document.getElementById('filterGapsOnlyBtn');

filterGapsOnlyBtn?.addEventListener('click', () => {
    showGapsOnly = !showGapsOnly;

    if (showGapsOnly) {
        filterGapsOnlyBtn.style.background = '#f59e0b';
        filterGapsOnlyBtn.style.color = 'white';
        filterGapsOnlyBtn.innerHTML = '<i data-lucide="alert-triangle"></i> Đang lọc GD thiếu';

        // Hide all non-gap rows
        document.querySelectorAll('#tableBody tr:not(.gap-row)').forEach(row => {
            row.style.display = 'none';
        });

        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Đang hiển thị chỉ giao dịch thiếu', 'info');
        }
    } else {
        filterGapsOnlyBtn.style.background = '#fef3c7';
        filterGapsOnlyBtn.style.color = '#92400e';
        filterGapsOnlyBtn.innerHTML = '<i data-lucide="alert-triangle"></i> Chỉ GD thiếu';

        // Show all rows
        document.querySelectorAll('#tableBody tr').forEach(row => {
            row.style.display = '';
        });
    }

    if (window.lucide) lucide.createIcons();
});

/**
 * Fetch missing transaction from Sepay API by reference code
 */
async function fetchMissingTransaction(referenceCode) {
    if (window.NotificationManager) {
        window.NotificationManager.showNotification(`Đang lấy giao dịch ${referenceCode}...`, 'info');
    }

    try {
        // Call Sepay API to fetch transaction by reference code
        const response = await fetch(`${API_BASE_URL}/api/sepay/fetch-by-reference/${referenceCode}`, {
            method: 'POST'
        });
        const result = await response.json();

        if (result.success) {
            if (window.NotificationManager) {
                window.NotificationManager.showNotification(`Đã lấy được giao dịch ${referenceCode}!`, 'success');
            }

            // Reload data to show the new transaction
            await loadGapData();
            loadData();
            loadStatistics();
        } else {
            throw new Error(result.error || result.message || 'Không tìm thấy giao dịch');
        }

    } catch (error) {
        console.error('[GAPS] Error fetching missing transaction:', error);
        if (window.NotificationManager) {
            window.NotificationManager.showNotification(`Không thể lấy GD ${referenceCode}: ${error.message}`, 'error');
        }
    }
}

/**
 * Fetch customer names from TPOS Partner API for phones without names
 */
async function fetchCustomerNamesFromTPOS() {
    try {
        // Fetch phone data from database
        const response = await fetch(`${API_BASE_URL}/api/sepay/phone-data?limit=500`);
        const result = await response.json();

        if (!result.success || !result.data) {
            throw new Error('Failed to fetch phone data');
        }

        // Filter phones that are PENDING (valid 10-digit phones without names)
        const phonesToFetch = result.data.filter(row => {
            const phone = row.customer_phone || '';
            const status = row.name_fetch_status || '';
            // Only fetch if: has valid 10-digit phone AND status is PENDING
            return phone.length === 10 && /^0\d{9}$/.test(phone) && status === 'PENDING';
        });

        if (phonesToFetch.length === 0) {
            alert('✅ Không có phone nào cần fetch!\n\nTất cả phone hợp lệ đã được xử lý.');
            return;
        }

        if (!confirm(`Tìm thấy ${phonesToFetch.length} phone numbers chưa có tên.\n\nGọi TPOS API để lấy tên?`)) {
            return;
        }

        console.log(`[FETCH-NAMES] Processing ${phonesToFetch.length} phones...`);

        let success = 0;
        let notFound = 0;
        let failed = 0;

        // Process each phone
        for (const row of phonesToFetch) {
            try {
                const phone = row.customer_phone;
                console.log(`[FETCH-NAMES] Fetching name for: ${phone}`);

                // Call backend API (uses automatic TPOS token from environment)
                const tposResponse = await fetch(`${API_BASE_URL}/api/sepay/tpos/customer/${phone}`);
                const tposData = await tposResponse.json();

                if (!tposData.success || !tposData.data || tposData.data.length === 0) {
                    console.log(`[FETCH-NAMES] No customer found for ${phone}`);

                    // Mark as NOT_FOUND_IN_TPOS
                    await fetch(`${API_BASE_URL}/api/sepay/customer-info/${row.unique_code}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            customer_name: null,
                            name_fetch_status: 'NOT_FOUND_IN_TPOS'
                        })
                    });

                    notFound++;
                    continue;
                }

                // Take first match
                const customer = tposData.data[0];
                const customerName = customer.name || 'Unknown';

                console.log(`[FETCH-NAMES] Found: ${customerName} (${tposData.count} matches)`);

                // Update database
                const updateResponse = await fetch(`${API_BASE_URL}/api/sepay/customer-info/${row.unique_code}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        customer_name: customerName
                    })
                });

                const updateResult = await updateResponse.json();

                if (updateResult.success) {
                    console.log(`[FETCH-NAMES] ✅ Updated ${row.unique_code} → ${customerName}`);
                    success++;
                } else {
                    console.error(`[FETCH-NAMES] Failed to update ${row.unique_code}`);
                    failed++;
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                console.error(`[FETCH-NAMES] Error for ${row.customer_phone}:`, error);
                failed++;
            }
        }

        alert(`✅ Hoàn thành!\n\nThành công: ${success}\nKhông tìm thấy: ${notFound}\nLỗi: ${failed}`);

        // Reload data
        loadData();
        if (document.getElementById('phoneDataModal').style.display === 'flex') {
            showPhoneDataModal(); // Refresh phone data modal if open
        }

    } catch (error) {
        console.error('[FETCH-NAMES] Error:', error);
        alert('❌ Lỗi: ' + error.message);
    }
}

/**
 * Show phone data modal with data from balance_customer_info
 */
async function showPhoneDataModal() {
    const modal = document.getElementById('phoneDataModal');
    const loading = document.getElementById('phoneDataLoading');
    const empty = document.getElementById('phoneDataEmpty');
    const content = document.getElementById('phoneDataContent');
    const tableBody = document.getElementById('phoneDataTableBody');
    const totalSpan = document.getElementById('phoneDataTotal');
    const shownSpan = document.getElementById('phoneDataShown');

    // Show modal and loading state
    modal.style.display = 'flex';
    loading.style.display = 'block';
    empty.style.display = 'none';
    content.style.display = 'none';

    try {
        console.log('[PHONE-DATA] Fetching phone data...');

        const response = await fetch(`${API_BASE_URL}/api/sepay/phone-data?limit=500`);
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Failed to fetch phone data');
        }

        const data = result.data || [];
        const total = result.pagination?.total || 0;

        console.log(`[PHONE-DATA] Loaded ${data.length} records (total: ${total})`);

        // Hide loading
        loading.style.display = 'none';

        if (data.length === 0) {
            // Show empty state
            empty.style.display = 'block';
            return;
        }

        // Show content
        content.style.display = 'block';
        totalSpan.textContent = total;
        shownSpan.textContent = data.length;

        // Render table
        tableBody.innerHTML = data.map((row, index) => {
            const createdAt = new Date(row.created_at).toLocaleString('vi-VN');
            const updatedAt = new Date(row.updated_at).toLocaleString('vi-VN');
            const customerName = row.customer_name || '<em style="color: #9ca3af;">Chưa có</em>';

            // Format extraction_note with color coding
            const extractionNote = row.extraction_note || '-';
            let noteColor = '#6b7280';
            let noteIcon = '';
            if (extractionNote.startsWith('PHONE_EXTRACTED')) {
                noteColor = '#10b981';
                noteIcon = '✓';
            } else if (extractionNote.startsWith('QR_CODE_FOUND')) {
                noteColor = '#3b82f6';
                noteIcon = '🔗';
            } else if (extractionNote.startsWith('INVALID_PHONE_LENGTH')) {
                noteColor = '#f59e0b';
                noteIcon = '⚠️';
            } else if (extractionNote.startsWith('NO_PHONE_FOUND')) {
                noteColor = '#9ca3af';
                noteIcon = '✗';
            } else if (extractionNote.startsWith('MULTIPLE_PHONES_FOUND')) {
                noteColor = '#8b5cf6';
                noteIcon = '📞';
            }

            // Format name_fetch_status with badges
            const fetchStatus = row.name_fetch_status || '-';
            let statusBadge = '';
            if (fetchStatus === 'SUCCESS') {
                statusBadge = `<span style="background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">✓ SUCCESS</span>`;
            } else if (fetchStatus === 'PENDING') {
                statusBadge = `<span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">⏳ PENDING</span>`;
            } else if (fetchStatus === 'NOT_FOUND_IN_TPOS') {
                statusBadge = `<span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">✗ NOT FOUND</span>`;
            } else if (fetchStatus === 'INVALID_PHONE') {
                statusBadge = `<span style="background: #fed7aa; color: #9a3412; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">⚠ INVALID</span>`;
            } else if (fetchStatus === 'NO_PHONE_TO_FETCH') {
                statusBadge = `<span style="background: #e5e7eb; color: #4b5563; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">- N/A</span>`;
            } else {
                statusBadge = `<span style="color: #9ca3af;">${fetchStatus}</span>`;
            }

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td><code style="font-size: 11px; background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">${row.unique_code}</code></td>
                    <td><strong style="color: #3b82f6;">${row.customer_phone || '-'}</strong></td>
                    <td>${customerName}</td>
                    <td style="font-size: 12px; color: ${noteColor};">${noteIcon} ${extractionNote}</td>
                    <td>${statusBadge}</td>
                    <td style="font-size: 12px; color: #6b7280;">${createdAt}</td>
                    <td style="font-size: 12px; color: #6b7280;">${updatedAt}</td>
                </tr>
            `;
        }).join('');

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }

    } catch (error) {
        console.error('[PHONE-DATA] Error:', error);
        loading.style.display = 'none';
        empty.style.display = 'block';
        empty.innerHTML = `
            <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #ef4444;"></i>
            <p style="margin-top: 15px; color: #ef4444;">Lỗi khi tải dữ liệu!</p>
            <p style="color: #9ca3af; font-size: 14px;">${error.message}</p>
        `;
        if (window.lucide) {
            lucide.createIcons();
        }
    }
}

/**
 * Close phone data modal
 */
function closePhoneDataModal() {
    const modal = document.getElementById('phoneDataModal');
    modal.style.display = 'none';
}

// Export functions for global access
window.showGapsModal = showGapsModal;
window.closeGapsModal = closeGapsModal;
window.ignoreGap = ignoreGap;
window.rescanGaps = rescanGaps;
window.retryFailedQueue = retryFailedQueue;
window.fetchMissingTransaction = fetchMissingTransaction;
window.showPhoneDataModal = showPhoneDataModal;
window.closePhoneDataModal = closePhoneDataModal;

// Disconnect when page unloads
window.addEventListener('beforeunload', () => {
    disconnectRealtimeUpdates();
});
