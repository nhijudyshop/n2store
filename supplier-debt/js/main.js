/**
 * Supplier Debt Report - Main JavaScript
 * Công nợ nhà cung cấp
 */

// =====================================================
// CONFIGURATION
// =====================================================

const CONFIG = {
    API_BASE: 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata',
    ENDPOINT: 'Report/PartnerDebtReport',
    RESULT_SELECTION: 'supplier',
    DEFAULT_PAGE_SIZE: 20
};

// =====================================================
// STATE
// =====================================================

const State = {
    data: [],
    filteredData: [],
    allSuppliers: [],
    currentPage: 1,
    pageSize: CONFIG.DEFAULT_PAGE_SIZE,
    totalCount: 0,
    isLoading: false,
    dateFrom: null,
    dateTo: null,
    display: 'all',
    selectedSupplier: ''
};

// =====================================================
// DOM ELEMENTS
// =====================================================

const DOM = {
    get dateFromDisplay() { return document.getElementById('dateFromDisplay'); },
    get dateFrom() { return document.getElementById('dateFrom'); },
    get dateToDisplay() { return document.getElementById('dateToDisplay'); },
    get dateTo() { return document.getElementById('dateTo'); },
    get displayRadios() { return document.querySelectorAll('input[name="display"]'); },
    get supplierFilter() { return document.getElementById('supplierFilter'); },
    get clearSupplier() { return document.getElementById('clearSupplier'); },
    get btnSearch() { return document.getElementById('btnSearch'); },
    get btnExport() { return document.getElementById('btnExport'); },
    get btnRefresh() { return document.getElementById('btnRefresh'); },
    get loadingIndicator() { return document.getElementById('loadingIndicator'); },
    get tableBody() { return document.getElementById('tableBody'); },
    get totalBegin() { return document.getElementById('totalBegin'); },
    get totalDebit() { return document.getElementById('totalDebit'); },
    get totalCredit() { return document.getElementById('totalCredit'); },
    get totalEnd() { return document.getElementById('totalEnd'); },
    get pageNumbers() { return document.getElementById('pageNumbers'); },
    get pageSize() { return document.getElementById('pageSize'); },
    get pageInfo() { return document.getElementById('pageInfo'); },
    get btnFirst() { return document.getElementById('btnFirst'); },
    get btnPrev() { return document.getElementById('btnPrev'); },
    get btnNext() { return document.getElementById('btnNext'); },
    get btnLast() { return document.getElementById('btnLast'); }
};

// =====================================================
// UTILITIES
// =====================================================

function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Math.round(num).toLocaleString('vi-VN');
}

function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

function parseVietnameseDate(dateStr) {
    // Parse dd/mm/yyyy format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }
    return null;
}

function toISODateString(date, isEndOfDay = false) {
    const d = new Date(date);
    if (isEndOfDay) {
        d.setHours(23, 59, 59, 999);
    } else {
        d.setHours(0, 0, 0, 0);
    }
    return d.toISOString();
}

function getFirstDayOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

function getLastDayOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

// =====================================================
// DATE INPUT HANDLING
// =====================================================

function initDateInputs() {
    // Set default dates (first and last day of current month)
    const firstDay = getFirstDayOfMonth();
    const lastDay = getLastDayOfMonth();

    State.dateFrom = firstDay;
    State.dateTo = lastDay;

    DOM.dateFromDisplay.value = formatDate(firstDay);
    DOM.dateToDisplay.value = formatDate(lastDay);

    // Sync display input with hidden datetime-local input
    DOM.dateFromDisplay.addEventListener('change', function() {
        const parsed = parseVietnameseDate(this.value);
        if (parsed) {
            State.dateFrom = parsed;
        }
    });

    DOM.dateToDisplay.addEventListener('change', function() {
        const parsed = parseVietnameseDate(this.value);
        if (parsed) {
            State.dateTo = parsed;
            State.dateTo.setHours(23, 59, 59, 999);
        }
    });

    // Handle hidden input clicks
    DOM.dateFrom.addEventListener('change', function() {
        if (this.value) {
            const date = new Date(this.value);
            State.dateFrom = date;
            DOM.dateFromDisplay.value = formatDate(date);
        }
    });

    DOM.dateTo.addEventListener('change', function() {
        if (this.value) {
            const date = new Date(this.value);
            date.setHours(23, 59, 59, 999);
            State.dateTo = date;
            DOM.dateToDisplay.value = formatDate(date);
        }
    });

    // Auto-format date input
    [DOM.dateFromDisplay, DOM.dateToDisplay].forEach(input => {
        input.addEventListener('input', function(e) {
            let value = this.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.slice(0, 2) + '/' + value.slice(2);
            }
            if (value.length >= 5) {
                value = value.slice(0, 5) + '/' + value.slice(5, 9);
            }
            this.value = value;
        });
    });
}

// =====================================================
// API CALLS
// =====================================================

async function fetchData() {
    if (State.isLoading) return;

    State.isLoading = true;
    showLoading(true);

    try {
        // Build URL with parameters
        const params = new URLSearchParams();
        params.set('Display', State.display);
        params.set('DateFrom', toISODateString(State.dateFrom, false));
        params.set('DateTo', toISODateString(State.dateTo, true));
        params.set('ResultSelection', CONFIG.RESULT_SELECTION);
        params.set('$top', State.pageSize);
        params.set('$skip', (State.currentPage - 1) * State.pageSize);
        params.set('$count', 'true');

        const url = `${CONFIG.API_BASE}/${CONFIG.ENDPOINT}?${params.toString()}`;

        // Get auth header
        const authHeader = await window.tokenManager.getAuthHeader();

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...authHeader,
                'Content-Type': 'application/json',
                'tposappversion': '6.2.6.1'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        State.data = result.value || [];
        State.totalCount = result['@odata.count'] || 0;

        // Apply client-side filter for supplier
        applySupplierFilter();

        // Update supplier dropdown on first load
        if (State.allSuppliers.length === 0 && State.data.length > 0) {
            await fetchAllSuppliers();
        }

        renderTable();
        renderPagination();
        calculateTotals();

    } catch (error) {
        console.error('[SupplierDebt] Error fetching data:', error);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi tải dữ liệu: ${error.message}`);
        }
        renderEmptyState();
    } finally {
        State.isLoading = false;
        showLoading(false);
    }
}

async function fetchAllSuppliers() {
    try {
        // Fetch all data to populate supplier dropdown (limited to 1000)
        const params = new URLSearchParams();
        params.set('Display', 'all');
        params.set('DateFrom', toISODateString(State.dateFrom, false));
        params.set('DateTo', toISODateString(State.dateTo, true));
        params.set('ResultSelection', CONFIG.RESULT_SELECTION);
        params.set('$top', '1000');

        const url = `${CONFIG.API_BASE}/${CONFIG.ENDPOINT}?${params.toString()}`;
        const authHeader = await window.tokenManager.getAuthHeader();

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...authHeader,
                'Content-Type': 'application/json',
                'tposappversion': '6.2.6.1'
            }
        });

        if (response.ok) {
            const result = await response.json();
            State.allSuppliers = (result.value || []).sort((a, b) =>
                (a.Code || '').localeCompare(b.Code || '', 'vi', { numeric: true })
            );
            populateSupplierDropdown();
        }
    } catch (error) {
        console.error('[SupplierDebt] Error fetching suppliers:', error);
    }
}

function applySupplierFilter() {
    if (State.selectedSupplier) {
        State.filteredData = State.data.filter(item =>
            item.Code === State.selectedSupplier
        );
    } else {
        State.filteredData = [...State.data];
    }
}

// =====================================================
// RENDERING
// =====================================================

function showLoading(show) {
    DOM.loadingIndicator.style.display = show ? 'flex' : 'none';
    DOM.tableBody.style.opacity = show ? '0.5' : '1';
}

function renderTable() {
    const tbody = DOM.tableBody;
    tbody.innerHTML = '';

    if (State.filteredData.length === 0) {
        renderEmptyState();
        return;
    }

    State.filteredData.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="col-expand">
                <i data-lucide="chevron-right" class="expand-icon" style="width: 14px; height: 14px;"></i>
            </td>
            <td>${escapeHtml(item.Code || '')}</td>
            <td>${escapeHtml(item.PartnerName || '')}</td>
            <td>${escapeHtml(item.PartnerPhone || '')}</td>
            <td class="col-number">${formatNumber(item.Begin)}</td>
            <td class="col-number">${formatNumber(item.Debit)}</td>
            <td class="col-number">${formatNumber(item.Credit)}</td>
            <td class="col-number">${formatNumber(item.End)}</td>
        `;
        tbody.appendChild(tr);
    });

    // Re-render Lucide icons
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function renderEmptyState() {
    DOM.tableBody.innerHTML = `
        <tr>
            <td colspan="8" class="empty-state">
                <i data-lucide="inbox"></i>
                <p>Không có dữ liệu</p>
            </td>
        </tr>
    `;
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function calculateTotals() {
    let totalBegin = 0, totalDebit = 0, totalCredit = 0, totalEnd = 0;

    State.filteredData.forEach(item => {
        totalBegin += item.Begin || 0;
        totalDebit += item.Debit || 0;
        totalCredit += item.Credit || 0;
        totalEnd += item.End || 0;
    });

    DOM.totalBegin.textContent = formatNumber(totalBegin);
    DOM.totalDebit.textContent = formatNumber(totalDebit);
    DOM.totalCredit.textContent = formatNumber(totalCredit);
    DOM.totalEnd.textContent = formatNumber(totalEnd);
}

function renderPagination() {
    const totalPages = Math.ceil(State.totalCount / State.pageSize);
    const currentPage = State.currentPage;

    // Update page info
    const start = State.totalCount > 0 ? (currentPage - 1) * State.pageSize + 1 : 0;
    const end = Math.min(currentPage * State.pageSize, State.totalCount);
    DOM.pageInfo.textContent = `${start} - ${end} của ${State.totalCount} dòng`;

    // Update navigation buttons
    DOM.btnFirst.disabled = currentPage <= 1;
    DOM.btnPrev.disabled = currentPage <= 1;
    DOM.btnNext.disabled = currentPage >= totalPages;
    DOM.btnLast.disabled = currentPage >= totalPages;

    // Render page numbers
    const pageNumbers = DOM.pageNumbers;
    pageNumbers.innerHTML = '';

    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement('button');
        btn.className = `btn-page ${i === currentPage ? 'active' : ''}`;
        btn.textContent = i;
        btn.addEventListener('click', () => goToPage(i));
        pageNumbers.appendChild(btn);
    }
}

function populateSupplierDropdown() {
    const select = DOM.supplierFilter;
    select.innerHTML = '<option value="">Chọn nhà cung cấp</option>';

    State.allSuppliers.forEach(supplier => {
        const option = document.createElement('option');
        option.value = supplier.Code;
        option.textContent = `[${supplier.Code}] ${supplier.PartnerName}`;
        select.appendChild(option);
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// PAGINATION HANDLERS
// =====================================================

function goToPage(page) {
    const totalPages = Math.ceil(State.totalCount / State.pageSize);
    if (page < 1 || page > totalPages) return;

    State.currentPage = page;
    fetchData();
}

function changePageSize(size) {
    State.pageSize = parseInt(size, 10);
    State.currentPage = 1;
    fetchData();
}

// =====================================================
// EXPORT TO EXCEL
// =====================================================

async function exportToExcel() {
    if (State.filteredData.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Không có dữ liệu để xuất');
        }
        return;
    }

    try {
        // Create CSV content
        const headers = ['Mã khách hàng', 'Tên KH/Facebook', 'Điện thoại', 'Nợ đầu kỳ', 'Phát sinh', 'Thanh toán', 'Nợ cuối kỳ'];
        const rows = State.filteredData.map(item => [
            item.Code || '',
            item.PartnerName || '',
            item.PartnerPhone || '',
            item.Begin || 0,
            item.Debit || 0,
            item.Credit || 0,
            item.End || 0
        ]);

        // Add totals row
        let totalBegin = 0, totalDebit = 0, totalCredit = 0, totalEnd = 0;
        State.filteredData.forEach(item => {
            totalBegin += item.Begin || 0;
            totalDebit += item.Debit || 0;
            totalCredit += item.Credit || 0;
            totalEnd += item.End || 0;
        });
        rows.push(['Tổng', '', '', totalBegin, totalDebit, totalCredit, totalEnd]);

        // Build CSV
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell =>
                typeof cell === 'string' ? `"${cell.replace(/"/g, '""')}"` : cell
            ).join(','))
        ].join('\n');

        // Add BOM for Excel UTF-8 support
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

        // Download
        const link = document.createElement('a');
        const dateStr = formatDate(new Date()).replace(/\//g, '-');
        link.download = `cong-no-nha-cung-cap-${dateStr}.csv`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);

        if (window.notificationManager) {
            window.notificationManager.success('Đã xuất file Excel thành công');
        }
    } catch (error) {
        console.error('[SupplierDebt] Export error:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi xuất file');
        }
    }
}

// =====================================================
// EVENT HANDLERS
// =====================================================

function initEventHandlers() {
    // Search button
    DOM.btnSearch.addEventListener('click', () => {
        State.currentPage = 1;
        fetchData();
    });

    // Export button
    DOM.btnExport.addEventListener('click', exportToExcel);

    // Refresh button
    DOM.btnRefresh.addEventListener('click', () => {
        fetchData();
    });

    // Display radio buttons
    DOM.displayRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            State.display = this.value;
        });
    });

    // Supplier filter
    DOM.supplierFilter.addEventListener('change', function() {
        State.selectedSupplier = this.value;
        DOM.clearSupplier.style.display = this.value ? 'flex' : 'none';
        applySupplierFilter();
        renderTable();
        calculateTotals();
    });

    // Clear supplier
    DOM.clearSupplier.addEventListener('click', function() {
        DOM.supplierFilter.value = '';
        State.selectedSupplier = '';
        this.style.display = 'none';
        applySupplierFilter();
        renderTable();
        calculateTotals();
    });

    // Page size
    DOM.pageSize.addEventListener('change', function() {
        changePageSize(this.value);
    });

    // Pagination buttons
    DOM.btnFirst.addEventListener('click', () => goToPage(1));
    DOM.btnPrev.addEventListener('click', () => goToPage(State.currentPage - 1));
    DOM.btnNext.addEventListener('click', () => goToPage(State.currentPage + 1));
    DOM.btnLast.addEventListener('click', () => goToPage(Math.ceil(State.totalCount / State.pageSize)));

    // Enter key on date inputs
    [DOM.dateFromDisplay, DOM.dateToDisplay].forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                DOM.btnSearch.click();
            }
        });
    });
}

// =====================================================
// INITIALIZATION
// =====================================================

async function init() {
    console.log('[SupplierDebt] Initializing...');

    // Wait for token manager to be ready
    if (window.tokenManager && window.tokenManager.initPromise) {
        await window.tokenManager.initPromise;
    }

    // Initialize date inputs
    initDateInputs();

    // Initialize event handlers
    initEventHandlers();

    // Load initial data
    await fetchData();

    console.log('[SupplierDebt] Initialization complete');
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
