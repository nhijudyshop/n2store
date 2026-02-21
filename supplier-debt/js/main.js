/**
 * Supplier Debt Report - Main JavaScript
 * Công nợ nhà cung cấp
 */

// =====================================================
// CONFIGURATION
// =====================================================

const CONFIG = {
    API_BASE: 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata',
    API_BASE_PARTNER: 'https://chatomni-proxy.nhijudyshop.workers.dev/api',
    ENDPOINT: 'Report/PartnerDebtReport',
    RESULT_SELECTION: 'supplier',
    DEFAULT_PAGE_SIZE: 20,
    DETAIL_PAGE_SIZE: 10,
    COLUMN_VISIBILITY_KEY: 'supplierDebt_columnVisibility'
};

// Column definitions for visibility toggle
const COLUMNS = [
    { id: 'code', index: 1, label: 'Mã khách hàng' },
    { id: 'name', index: 2, label: 'Tên KH/Facebook' },
    { id: 'phone', index: 3, label: 'Điện thoại' },
    { id: 'begin', index: 4, label: 'Nợ đầu kỳ' },
    { id: 'debit', index: 5, label: 'Phát sinh' },
    { id: 'credit', index: 6, label: 'Thanh toán' },
    { id: 'end', index: 7, label: 'Nợ cuối kỳ' }
];

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
    selectedSupplier: '',
    // Expanded row state
    expandedRows: new Map(), // partnerId -> { congNo, info, invoices, debtDetails, activeTab, ... }
    // Column visibility state
    columnVisibility: {
        code: true,
        name: true,
        phone: true,
        begin: true,
        debit: true,
        credit: true,
        end: true
    }
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
    get btnLast() { return document.getElementById('btnLast'); },
    get btnColumnToggle() { return document.getElementById('btnColumnToggle'); },
    get columnToggleDropdown() { return document.getElementById('columnToggleDropdown'); },
    get dataTable() { return document.getElementById('dataTable'); }
};

// =====================================================
// COLUMN VISIBILITY
// =====================================================

function loadColumnVisibility() {
    try {
        const saved = localStorage.getItem(CONFIG.COLUMN_VISIBILITY_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            State.columnVisibility = { ...State.columnVisibility, ...parsed };
        }
    } catch (e) {
        console.error('[SupplierDebt] Error loading column visibility:', e);
    }
}

function saveColumnVisibility() {
    try {
        localStorage.setItem(CONFIG.COLUMN_VISIBILITY_KEY, JSON.stringify(State.columnVisibility));
    } catch (e) {
        console.error('[SupplierDebt] Error saving column visibility:', e);
    }
}

function applyColumnVisibility() {
    const table = DOM.dataTable;
    if (!table) return;

    COLUMNS.forEach(col => {
        const isVisible = State.columnVisibility[col.id];

        // Update all cells with this data-col attribute (header, body, footer)
        const cells = table.querySelectorAll(`[data-col="${col.id}"]`);
        cells.forEach(cell => {
            cell.classList.toggle('col-hidden', !isVisible);
        });

        // Update checkbox in dropdown
        const checkbox = document.getElementById(`col-${col.id}`);
        if (checkbox) {
            checkbox.checked = isVisible;
        }
    });
}

function toggleColumn(colId, isVisible) {
    State.columnVisibility[colId] = isVisible;
    saveColumnVisibility();
    applyColumnVisibility();
}

function initColumnToggle() {
    // Load saved visibility
    loadColumnVisibility();

    // Toggle dropdown visibility
    DOM.btnColumnToggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        DOM.columnToggleDropdown?.classList.toggle('show');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.column-toggle-wrapper')) {
            DOM.columnToggleDropdown?.classList.remove('show');
        }
    });

    // Handle checkbox changes
    COLUMNS.forEach(col => {
        const checkbox = document.getElementById(`col-${col.id}`);
        if (checkbox) {
            checkbox.checked = State.columnVisibility[col.id];
            checkbox.addEventListener('change', (e) => {
                toggleColumn(col.id, e.target.checked);
            });
        }
    });

    // Apply initial visibility
    applyColumnVisibility();
}

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
        const partnerId = item.PartnerId;
        const isExpanded = State.expandedRows.has(partnerId);

        // Main row
        const tr = document.createElement('tr');
        tr.className = 'data-row';
        tr.dataset.partnerId = partnerId;
        tr.innerHTML = `
            <td class="col-expand" onclick="toggleRowExpand(${partnerId}, this)">
                <i data-lucide="chevron-right" class="expand-icon ${isExpanded ? 'expanded' : ''}" style="width: 14px; height: 14px;"></i>
            </td>
            <td data-col="code">${escapeHtml(item.Code || '')}</td>
            <td data-col="name">${escapeHtml(item.PartnerName || '')}</td>
            <td data-col="phone">${escapeHtml(item.PartnerPhone || '')}</td>
            <td data-col="begin" class="col-number">${formatNumber(item.Begin)}</td>
            <td data-col="debit" class="col-number">${formatNumber(item.Debit)}</td>
            <td data-col="credit" class="col-number">${formatNumber(item.Credit)}</td>
            <td data-col="end" class="col-number">${formatNumber(item.End)}</td>
        `;
        tbody.appendChild(tr);

        // Detail row (hidden by default)
        const detailTr = document.createElement('tr');
        detailTr.className = `detail-row ${isExpanded ? 'expanded' : ''}`;
        detailTr.id = `detail-row-${partnerId}`;
        detailTr.innerHTML = `
            <td colspan="8">
                <div class="detail-panel" id="detail-panel-${partnerId}">
                    ${isExpanded ? renderDetailPanel(partnerId) : ''}
                </div>
            </td>
        `;
        tbody.appendChild(detailTr);
    });

    // Re-render Lucide icons
    if (window.lucide) {
        window.lucide.createIcons();
    }

    // Apply column visibility
    applyColumnVisibility();
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

// =====================================================
// EXPANDABLE ROW FUNCTIONS
// =====================================================

async function toggleRowExpand(partnerId, expandCell) {
    const detailRow = document.getElementById(`detail-row-${partnerId}`);
    const detailPanel = document.getElementById(`detail-panel-${partnerId}`);
    const expandIcon = expandCell.querySelector('.expand-icon');

    if (State.expandedRows.has(partnerId)) {
        // Collapse
        State.expandedRows.delete(partnerId);
        detailRow.classList.remove('expanded');
        expandIcon.classList.remove('expanded');
        detailPanel.innerHTML = '';
    } else {
        // Expand - only set up state, don't fetch all data
        const partnerData = State.filteredData.find(item => item.PartnerId === partnerId);
        State.expandedRows.set(partnerId, {
            partnerData,
            // Tab data (null = not loaded yet)
            congNo: null,
            congNoPage: 1,
            congNoTotal: 0,
            info: null,
            invoices: null,
            invoicePage: 1,
            invoiceTotal: 0,
            debtDetails: null,
            debtPage: 1,
            debtTotal: 0,
            activeTab: 'congno', // Default to first tab
            isLoading: {} // Track which tabs are loading
        });

        detailRow.classList.add('expanded');
        expandIcon.classList.add('expanded');

        // Render panel with first tab selected
        detailPanel.innerHTML = renderDetailPanel(partnerId);
        if (window.lucide) window.lucide.createIcons();

        // Fetch data for the default tab (congno)
        await loadTabData(partnerId, 'congno');
    }
}

function renderDetailPanel(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    if (!rowState) return '';

    const activeTab = rowState.activeTab || 'congno';

    return `
        <div class="detail-tabs">
            <button class="detail-tab ${activeTab === 'congno' ? 'active' : ''}" onclick="switchDetailTab(${partnerId}, 'congno')">Công nợ</button>
            <button class="detail-tab ${activeTab === 'info' ? 'active' : ''}" onclick="switchDetailTab(${partnerId}, 'info')">Thông tin</button>
            <button class="detail-tab ${activeTab === 'invoice' ? 'active' : ''}" onclick="switchDetailTab(${partnerId}, 'invoice')">Hóa đơn</button>
            <button class="detail-tab ${activeTab === 'debt' ? 'active' : ''}" onclick="switchDetailTab(${partnerId}, 'debt')">Chi tiết nợ</button>
        </div>
        <div class="detail-tab-content ${activeTab === 'congno' ? 'active' : ''}" id="tab-congno-${partnerId}">
            ${renderCongNoTab(partnerId)}
        </div>
        <div class="detail-tab-content ${activeTab === 'info' ? 'active' : ''}" id="tab-info-${partnerId}">
            ${renderInfoTab(partnerId)}
        </div>
        <div class="detail-tab-content ${activeTab === 'invoice' ? 'active' : ''}" id="tab-invoice-${partnerId}">
            ${renderInvoiceTab(partnerId)}
        </div>
        <div class="detail-tab-content ${activeTab === 'debt' ? 'active' : ''}" id="tab-debt-${partnerId}">
            ${renderDebtTab(partnerId)}
        </div>
    `;
}

async function switchDetailTab(partnerId, tabName) {
    const rowState = State.expandedRows.get(partnerId);
    if (!rowState) return;

    rowState.activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll(`#detail-panel-${partnerId} .detail-tab`).forEach(tab => {
        tab.classList.remove('active');
    });
    const tabIndex = { congno: 1, info: 2, invoice: 3, debt: 4 }[tabName] || 1;
    document.querySelector(`#detail-panel-${partnerId} .detail-tab:nth-child(${tabIndex})`).classList.add('active');

    // Update tab content
    document.querySelectorAll(`#detail-panel-${partnerId} .detail-tab-content`).forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}-${partnerId}`).classList.add('active');

    // Lazy load data for this tab if not already loaded
    await loadTabData(partnerId, tabName);
}

// Load data for a specific tab (lazy loading)
async function loadTabData(partnerId, tabName) {
    const rowState = State.expandedRows.get(partnerId);
    if (!rowState) return;

    // Check if already loaded or loading
    const dataKey = {
        congno: 'congNo',
        info: 'info',
        invoice: 'invoices',
        debt: 'debtDetails'
    }[tabName];

    if (rowState[dataKey] !== null || rowState.isLoading[tabName]) {
        return; // Already loaded or loading
    }

    // Mark as loading
    rowState.isLoading[tabName] = true;

    // Show loading state in the tab content
    const tabContent = document.getElementById(`tab-${tabName}-${partnerId}`);
    if (tabContent) {
        tabContent.innerHTML = `
            <div class="detail-loading">
                <i data-lucide="loader-2" class="spin" style="width: 20px; height: 20px;"></i>
                Đang tải dữ liệu...
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }

    // Fetch data based on tab
    switch (tabName) {
        case 'congno':
            await fetchPartnerCongNo(partnerId, 1);
            break;
        case 'info':
            await fetchPartnerInfo(partnerId);
            break;
        case 'invoice':
            await fetchPartnerInvoices(partnerId, 1);
            break;
        case 'debt':
            await fetchPartnerDebtDetails(partnerId, 1);
            break;
    }

    // Mark as loaded
    rowState.isLoading[tabName] = false;

    // Re-render the tab content
    if (tabContent) {
        switch (tabName) {
            case 'congno':
                tabContent.innerHTML = renderCongNoTab(partnerId);
                break;
            case 'info':
                tabContent.innerHTML = renderInfoTab(partnerId);
                break;
            case 'invoice':
                tabContent.innerHTML = renderInvoiceTab(partnerId);
                break;
            case 'debt':
                tabContent.innerHTML = renderDebtTab(partnerId);
                break;
        }
        if (window.lucide) window.lucide.createIcons();
    }
}

// =====================================================
// DETAIL TAB RENDERERS
// =====================================================

function renderCongNoTab(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    const congNo = rowState?.congNo || [];
    const page = rowState?.congNoPage || 1;
    const total = rowState?.congNoTotal || 0;
    const totalPages = Math.ceil(total / CONFIG.DETAIL_PAGE_SIZE);

    // Check if not loaded yet
    if (rowState?.congNo === null) {
        return `
            <div class="detail-loading">
                <i data-lucide="loader-2" class="spin" style="width: 20px; height: 20px;"></i>
                Đang tải dữ liệu...
            </div>
        `;
    }

    if (congNo.length === 0) {
        return '<div class="detail-loading">Không có dữ liệu công nợ</div>';
    }

    let tableHtml = `
        <table class="detail-table">
            <thead>
                <tr>
                    <th>Ngày</th>
                    <th>Nhập diễn giải</th>
                    <th>Ghi chú</th>
                    <th>Bút toán</th>
                    <th class="col-number">Nợ đầu kỳ</th>
                    <th class="col-number">Phát sinh</th>
                    <th class="col-number">Thanh toán</th>
                    <th class="col-number">Nợ cuối kỳ</th>
                </tr>
            </thead>
            <tbody>
    `;

    congNo.forEach(item => {
        tableHtml += `
            <tr>
                <td>${formatDateFromISO(item.Date)}</td>
                <td>${escapeHtml(item.Name || '')}</td>
                <td>${escapeHtml(item.Ref || '')}</td>
                <td>${escapeHtml(item.MoveName || '')}</td>
                <td class="col-number">${formatNumber(item.Begin)}</td>
                <td class="col-number">${formatNumber(item.Debit)}</td>
                <td class="col-number">${formatNumber(item.Credit)}</td>
                <td class="col-number">${formatNumber(item.End)}</td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table>';

    // Pagination
    const start = total > 0 ? (page - 1) * CONFIG.DETAIL_PAGE_SIZE + 1 : 0;
    const end = Math.min(page * CONFIG.DETAIL_PAGE_SIZE, total);

    tableHtml += `
        <div class="detail-pagination">
            <div class="detail-pagination-nav">
                <button class="btn-page" ${page <= 1 ? 'disabled' : ''} onclick="changeCongNoPage(${partnerId}, 1)"><i data-lucide="chevrons-left" style="width:12px;height:12px"></i></button>
                <button class="btn-page" ${page <= 1 ? 'disabled' : ''} onclick="changeCongNoPage(${partnerId}, ${page - 1})"><i data-lucide="chevron-left" style="width:12px;height:12px"></i></button>
                ${renderDetailPageNumbers(page, totalPages, partnerId, 'congno')}
                <button class="btn-page" ${page >= totalPages ? 'disabled' : ''} onclick="changeCongNoPage(${partnerId}, ${page + 1})"><i data-lucide="chevron-right" style="width:12px;height:12px"></i></button>
                <button class="btn-page" ${page >= totalPages ? 'disabled' : ''} onclick="changeCongNoPage(${partnerId}, ${totalPages})"><i data-lucide="chevrons-right" style="width:12px;height:12px"></i></button>
            </div>
            <select class="page-size-select" style="font-size:12px;padding:4px 8px;" onchange="changeCongNoPageSize(${partnerId}, this.value)">
                <option value="10" ${CONFIG.DETAIL_PAGE_SIZE === 10 ? 'selected' : ''}>10</option>
                <option value="20">20</option>
                <option value="50">50</option>
            </select>
            <span class="detail-pagination-info">Số dòng trên trang</span>
            <span class="detail-pagination-info">${start} - ${end} của ${total} dòng</span>
            <button class="btn-refresh" onclick="refreshCongNo(${partnerId})"><i data-lucide="refresh-cw" style="width:14px;height:14px"></i></button>
        </div>
    `;

    return tableHtml;
}

function renderInfoTab(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    const partnerData = rowState?.partnerData || {};
    const info = rowState?.info;

    // Check if not loaded yet
    if (info === null) {
        return `
            <div class="detail-loading">
                <i data-lucide="loader-2" class="spin" style="width: 20px; height: 20px;"></i>
                Đang tải dữ liệu...
            </div>
        `;
    }

    const infoData = info || {};
    const supplierDisplay = `[${escapeHtml(partnerData.Code || '')}] ${escapeHtml(partnerData.PartnerName || '')}`;
    const endAmount = partnerData.End || 0;

    return `
        <button class="btn-payment" onclick="openPaymentModal(${partnerId}, '${supplierDisplay.replace(/'/g, "\\'")}', ${endAmount})">
            <i data-lucide="credit-card" style="width: 14px; height: 14px;"></i>
            Thanh toán
        </button>
        <div class="info-grid">
            <div class="info-section">
                <div class="info-row">
                    <span class="info-label">Mã :</span>
                    <span class="info-value">${escapeHtml(partnerData.Code || '')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Tên:</span>
                    <span class="info-value">${escapeHtml(partnerData.PartnerName || '')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Nhóm:</span>
                    <span class="info-value"></span>
                </div>
                <div class="info-row">
                    <span class="info-label">Mã số thuế:</span>
                    <span class="info-value"></span>
                </div>
            </div>
            <div class="info-section">
                <div class="info-row">
                    <span class="info-label">Email:</span>
                    <span class="info-value"></span>
                </div>
                <div class="info-row">
                    <span class="info-label">Điện thoại:</span>
                    <span class="info-value">${escapeHtml(partnerData.PartnerPhone || '')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Di động:</span>
                    <span class="info-value"></span>
                </div>
                <div class="info-row">
                    <span class="info-label">Địa chỉ:</span>
                    <span class="info-value"></span>
                </div>
                <div class="info-row">
                    <span class="info-label">Zalo:</span>
                    <span class="info-value"></span>
                </div>
                <div class="info-row">
                    <span class="info-label">Facebook:</span>
                    <span class="info-value"></span>
                </div>
            </div>
        </div>
        <div class="revenue-summary">
            <div class="revenue-row">
                <span class="revenue-label">Doanh số đầu kỳ:</span>
                <span class="revenue-value">${formatNumber(infoData.RevenueBegan || 0)}</span>
            </div>
            <div class="revenue-row">
                <span class="revenue-label">Doanh số :</span>
                <span class="revenue-value">${formatNumber(infoData.Revenue || 0)}</span>
            </div>
            <div class="revenue-row">
                <span class="revenue-label">Tổng doanh số :</span>
                <span class="revenue-value">${formatNumber(infoData.RevenueTotal || 0)}</span>
            </div>
        </div>
    `;
}

function renderInvoiceTab(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    const invoices = rowState?.invoices;
    const page = rowState?.invoicePage || 1;
    const total = rowState?.invoiceTotal || 0;
    const totalPages = Math.ceil(total / CONFIG.DETAIL_PAGE_SIZE);

    // Check if not loaded yet
    if (invoices === null) {
        return `
            <div class="detail-loading">
                <i data-lucide="loader-2" class="spin" style="width: 20px; height: 20px;"></i>
                Đang tải dữ liệu...
            </div>
        `;
    }

    if (!invoices || invoices.length === 0) {
        return '<div class="detail-loading">Không có hóa đơn</div>';
    }

    let tableHtml = `
        <table class="detail-table">
            <thead>
                <tr>
                    <th>Mã</th>
                    <th>Ngày hóa đơn</th>
                    <th>Loại</th>
                    <th>Người lập</th>
                    <th>Nguồn</th>
                    <th>Trạng thái</th>
                    <th class="col-number">Tổng tiền</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
    `;

    invoices.forEach(inv => {
        const statusClass = inv.StateFast === 'open' ? 'status-open' : inv.StateFast === 'cancel' ? 'status-cancel' : 'status-draft';
        tableHtml += `
            <tr>
                <td>${escapeHtml(inv.Number || inv.MoveName || '')}</td>
                <td>${formatDateFromISO(inv.DateInvoice)}</td>
                <td>${escapeHtml(inv.ShowType || '')}</td>
                <td>${escapeHtml(inv.UserName || '')}</td>
                <td></td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(inv.ShowStateFast || '')}</span></td>
                <td class="col-number">${formatNumber(inv.AmountTotal)}</td>
                <td><button class="btn-view" title="Xem chi tiết"><i data-lucide="external-link" style="width: 14px; height: 14px;"></i></button></td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table>';

    // Pagination
    const start = total > 0 ? (page - 1) * CONFIG.DETAIL_PAGE_SIZE + 1 : 0;
    const end = Math.min(page * CONFIG.DETAIL_PAGE_SIZE, total);

    tableHtml += `
        <div class="detail-pagination">
            <div class="detail-pagination-nav">
                <button class="btn-page" ${page <= 1 ? 'disabled' : ''} onclick="changeInvoicePage(${partnerId}, 1)"><i data-lucide="chevrons-left" style="width:12px;height:12px"></i></button>
                <button class="btn-page" ${page <= 1 ? 'disabled' : ''} onclick="changeInvoicePage(${partnerId}, ${page - 1})"><i data-lucide="chevron-left" style="width:12px;height:12px"></i></button>
                ${renderDetailPageNumbers(page, totalPages, partnerId, 'invoice')}
                <button class="btn-page" ${page >= totalPages ? 'disabled' : ''} onclick="changeInvoicePage(${partnerId}, ${page + 1})"><i data-lucide="chevron-right" style="width:12px;height:12px"></i></button>
                <button class="btn-page" ${page >= totalPages ? 'disabled' : ''} onclick="changeInvoicePage(${partnerId}, ${totalPages})"><i data-lucide="chevrons-right" style="width:12px;height:12px"></i></button>
            </div>
            <select class="page-size-select" style="font-size:12px;padding:4px 8px;" onchange="changeInvoicePageSize(${partnerId}, this.value)">
                <option value="10" ${CONFIG.DETAIL_PAGE_SIZE === 10 ? 'selected' : ''}>10</option>
                <option value="20">20</option>
                <option value="50">50</option>
            </select>
            <span class="detail-pagination-info">Số dòng trên trang</span>
            <span class="detail-pagination-info">${start} - ${end} của ${total} dòng</span>
            <button class="btn-refresh" onclick="refreshInvoices(${partnerId})"><i data-lucide="refresh-cw" style="width:14px;height:14px"></i></button>
        </div>
    `;

    return tableHtml;
}

function renderDebtTab(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    const debtDetails = rowState?.debtDetails;
    const page = rowState?.debtPage || 1;
    const total = rowState?.debtTotal || 0;
    const totalPages = Math.ceil(total / CONFIG.DETAIL_PAGE_SIZE);

    // Check if not loaded yet
    if (debtDetails === null) {
        return `
            <div class="detail-loading">
                <i data-lucide="loader-2" class="spin" style="width: 20px; height: 20px;"></i>
                Đang tải dữ liệu...
            </div>
        `;
    }

    if (!debtDetails || debtDetails.length === 0) {
        return '<div class="detail-loading">Không có chi tiết nợ</div>';
    }

    let tableHtml = `
        <table class="detail-table">
            <thead>
                <tr>
                    <th>Ngày</th>
                    <th>Chứng từ/Hóa đơn</th>
                    <th class="col-number">Còn nợ</th>
                </tr>
            </thead>
            <tbody>
    `;

    debtDetails.forEach(debt => {
        tableHtml += `
            <tr>
                <td>${formatDateFromDotNet(debt.Date)}</td>
                <td>${escapeHtml(debt.DisplayedName || '')}</td>
                <td class="col-number">${formatNumber(debt.AmountResidual)}</td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table>';

    // Pagination
    const start = total > 0 ? (page - 1) * CONFIG.DETAIL_PAGE_SIZE + 1 : 0;
    const end = Math.min(page * CONFIG.DETAIL_PAGE_SIZE, total);

    tableHtml += `
        <div class="detail-pagination">
            <div class="detail-pagination-nav">
                <button class="btn-page" ${page <= 1 ? 'disabled' : ''} onclick="changeDebtPage(${partnerId}, 1)"><i data-lucide="chevrons-left" style="width:12px;height:12px"></i></button>
                <button class="btn-page" ${page <= 1 ? 'disabled' : ''} onclick="changeDebtPage(${partnerId}, ${page - 1})"><i data-lucide="chevron-left" style="width:12px;height:12px"></i></button>
                ${renderDetailPageNumbers(page, totalPages, partnerId, 'debt')}
                <button class="btn-page" ${page >= totalPages ? 'disabled' : ''} onclick="changeDebtPage(${partnerId}, ${page + 1})"><i data-lucide="chevron-right" style="width:12px;height:12px"></i></button>
                <button class="btn-page" ${page >= totalPages ? 'disabled' : ''} onclick="changeDebtPage(${partnerId}, ${totalPages})"><i data-lucide="chevrons-right" style="width:12px;height:12px"></i></button>
            </div>
            <select class="page-size-select" style="font-size:12px;padding:4px 8px;" onchange="changeDebtPageSize(${partnerId}, this.value)">
                <option value="10" ${CONFIG.DETAIL_PAGE_SIZE === 10 ? 'selected' : ''}>10</option>
                <option value="20">20</option>
                <option value="50">50</option>
            </select>
            <span class="detail-pagination-info">Số dòng trên trang</span>
            <span class="detail-pagination-info">${start} - ${end} của ${total} dòng</span>
            <button class="btn-refresh" onclick="refreshDebtDetails(${partnerId})"><i data-lucide="refresh-cw" style="width:14px;height:14px"></i></button>
        </div>
    `;

    return tableHtml;
}

function renderDetailPageNumbers(currentPage, totalPages, partnerId, type) {
    let html = '';
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
        start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
        let onclick;
        switch (type) {
            case 'congno':
                onclick = `changeCongNoPage(${partnerId}, ${i})`;
                break;
            case 'invoice':
                onclick = `changeInvoicePage(${partnerId}, ${i})`;
                break;
            case 'debt':
                onclick = `changeDebtPage(${partnerId}, ${i})`;
                break;
            default:
                onclick = '';
        }
        html += `<button class="btn-page ${i === currentPage ? 'active' : ''}" onclick="${onclick}">${i}</button>`;
    }

    return html;
}

// =====================================================
// DETAIL API CALLS
// =====================================================

async function fetchPartnerCongNo(partnerId, page) {
    try {
        const authHeader = await window.tokenManager.getAuthHeader();
        const skip = (page - 1) * CONFIG.DETAIL_PAGE_SIZE;

        // Build date params from current filter state
        const dateFrom = toISODateString(State.dateFrom, false);
        const dateTo = toISODateString(State.dateTo, true);

        const params = new URLSearchParams();
        params.set('ResultSelection', 'supplier');
        params.set('PartnerId', partnerId);
        params.set('DateFrom', dateFrom);
        params.set('DateTo', dateTo);
        params.set('CompanyId', '');
        params.set('$format', 'json');
        params.set('$top', CONFIG.DETAIL_PAGE_SIZE);
        params.set('$skip', skip);
        params.set('$count', 'true');

        const url = `${CONFIG.API_BASE}/Report/PartnerDebtReportDetail?${params.toString()}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...authHeader,
                'Content-Type': 'application/json',
                'tposappversion': '6.2.6.1'
            }
        });

        if (response.ok) {
            const data = await response.json();
            const rowState = State.expandedRows.get(partnerId);
            if (rowState) {
                rowState.congNo = data.value || [];
                rowState.congNoTotal = data['@odata.count'] || 0;
                rowState.congNoPage = page;
            }
        }
    } catch (error) {
        console.error('[SupplierDebt] Error fetching cong no:', error);
        const rowState = State.expandedRows.get(partnerId);
        if (rowState) {
            rowState.congNo = []; // Set empty array on error
        }
    }
}

async function fetchPartnerInfo(partnerId) {
    try {
        const authHeader = await window.tokenManager.getAuthHeader();
        const url = `${CONFIG.API_BASE_PARTNER}/partner/GetPartnerRevenueById?id=${partnerId}&supplier=true`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...authHeader,
                'Content-Type': 'application/json',
                'tposappversion': '6.2.6.1'
            }
        });

        if (response.ok) {
            const data = await response.json();
            const rowState = State.expandedRows.get(partnerId);
            if (rowState) {
                rowState.info = data;
            }
        }
    } catch (error) {
        console.error('[SupplierDebt] Error fetching partner info:', error);
    }
}

async function fetchPartnerInvoices(partnerId, page) {
    try {
        const authHeader = await window.tokenManager.getAuthHeader();
        const skip = (page - 1) * CONFIG.DETAIL_PAGE_SIZE;
        const url = `${CONFIG.API_BASE}/AccountInvoice/ODataService.GetInvoicePartner?partnerId=${partnerId}&$format=json&$top=${CONFIG.DETAIL_PAGE_SIZE}&$skip=${skip}&$orderby=DateInvoice+desc&$filter=PartnerId+eq+${partnerId}&$count=true`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...authHeader,
                'Content-Type': 'application/json',
                'tposappversion': '6.2.6.1'
            }
        });

        if (response.ok) {
            const data = await response.json();
            const rowState = State.expandedRows.get(partnerId);
            if (rowState) {
                rowState.invoices = data.value || [];
                rowState.invoiceTotal = data['@odata.count'] || 0;
                rowState.invoicePage = page;
            }
        }
    } catch (error) {
        console.error('[SupplierDebt] Error fetching invoices:', error);
    }
}

async function fetchPartnerDebtDetails(partnerId, page) {
    try {
        const authHeader = await window.tokenManager.getAuthHeader();
        const skip = (page - 1) * CONFIG.DETAIL_PAGE_SIZE;
        const url = `${CONFIG.API_BASE_PARTNER}/Partner/CreditDebitSupplierDetail?partnerId=${partnerId}&take=${CONFIG.DETAIL_PAGE_SIZE}&skip=${skip}&page=${page}&pageSize=${CONFIG.DETAIL_PAGE_SIZE}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...authHeader,
                'Content-Type': 'application/json',
                'tposappversion': '6.2.6.1'
            }
        });

        if (response.ok) {
            const data = await response.json();
            const rowState = State.expandedRows.get(partnerId);
            if (rowState) {
                rowState.debtDetails = data.Data || [];
                rowState.debtTotal = data.Total || 0;
                rowState.debtPage = page;
            }
        }
    } catch (error) {
        console.error('[SupplierDebt] Error fetching debt details:', error);
    }
}

// =====================================================
// DETAIL PAGINATION HANDLERS
// =====================================================

async function changeCongNoPage(partnerId, page) {
    await fetchPartnerCongNo(partnerId, page);
    const tabContent = document.getElementById(`tab-congno-${partnerId}`);
    if (tabContent) {
        tabContent.innerHTML = renderCongNoTab(partnerId);
        if (window.lucide) window.lucide.createIcons();
    }
}

async function refreshCongNo(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    await fetchPartnerCongNo(partnerId, rowState?.congNoPage || 1);
    const tabContent = document.getElementById(`tab-congno-${partnerId}`);
    if (tabContent) {
        tabContent.innerHTML = renderCongNoTab(partnerId);
        if (window.lucide) window.lucide.createIcons();
    }
}

async function changeInvoicePage(partnerId, page) {
    await fetchPartnerInvoices(partnerId, page);
    const detailPanel = document.getElementById(`detail-panel-${partnerId}`);
    if (detailPanel) {
        detailPanel.innerHTML = renderDetailPanel(partnerId);
        if (window.lucide) window.lucide.createIcons();
    }
}

async function changeDebtPage(partnerId, page) {
    await fetchPartnerDebtDetails(partnerId, page);
    const detailPanel = document.getElementById(`detail-panel-${partnerId}`);
    if (detailPanel) {
        detailPanel.innerHTML = renderDetailPanel(partnerId);
        if (window.lucide) window.lucide.createIcons();
    }
}

async function refreshInvoices(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    await fetchPartnerInvoices(partnerId, rowState?.invoicePage || 1);
    const detailPanel = document.getElementById(`detail-panel-${partnerId}`);
    if (detailPanel) {
        detailPanel.innerHTML = renderDetailPanel(partnerId);
        if (window.lucide) window.lucide.createIcons();
    }
}

async function refreshDebtDetails(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    await fetchPartnerDebtDetails(partnerId, rowState?.debtPage || 1);
    const detailPanel = document.getElementById(`detail-panel-${partnerId}`);
    if (detailPanel) {
        detailPanel.innerHTML = renderDetailPanel(partnerId);
        if (window.lucide) window.lucide.createIcons();
    }
}

// =====================================================
// PAYMENT MODAL
// =====================================================

let currentPaymentPartnerId = null;
let paymentMethods = [];

function openPaymentModal(partnerId, supplierName, amount) {
    currentPaymentPartnerId = partnerId;

    // Set supplier name
    document.getElementById('paymentSupplierName').textContent = supplierName;

    // Set amount (Nợ cuối kỳ)
    document.getElementById('paymentAmount').value = amount;

    // Set current datetime
    const now = new Date();
    const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    document.getElementById('paymentDate').value = localDatetime;

    // Clear content field
    document.getElementById('paymentContent').value = '';

    // Load payment methods if not loaded
    if (paymentMethods.length === 0) {
        loadPaymentMethods();
    }

    // Show modal
    document.getElementById('paymentModal').classList.add('show');
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.remove('show');
    currentPaymentPartnerId = null;
}

async function loadPaymentMethods() {
    try {
        const authHeader = await window.tokenManager.getAuthHeader();
        const url = `${CONFIG.API_BASE}/AccountJournal?$filter=Type eq 'cash' or Type eq 'bank'&$format=json`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...authHeader,
                'Content-Type': 'application/json',
                'tposappversion': '6.2.6.1'
            }
        });

        if (response.ok) {
            const data = await response.json();
            paymentMethods = data.value || [];
            populatePaymentMethods();
        }
    } catch (error) {
        console.error('[SupplierDebt] Error loading payment methods:', error);
    }
}

function populatePaymentMethods() {
    const select = document.getElementById('paymentMethod');
    select.innerHTML = '<option value="">-- Chọn phương thức --</option>';

    // Deduplicate by Name and rename "Ngân hàng" to "Chuyển khoản"
    const uniqueMethods = new Map();
    let defaultMethodId = null;

    paymentMethods.forEach(method => {
        let displayName = method.Name;

        // Rename "Ngân hàng" to "Chuyển khoản"
        if (method.Type === 'bank' || method.Name.toLowerCase().includes('ngân hàng')) {
            displayName = 'Chuyển khoản';
        }

        // Only add if not already exists (dedupe by displayName)
        if (!uniqueMethods.has(displayName)) {
            uniqueMethods.set(displayName, { id: method.Id, name: displayName, type: method.Type });

            // Set "Chuyển khoản" as default
            if (displayName === 'Chuyển khoản' && !defaultMethodId) {
                defaultMethodId = method.Id;
            }
        }
    });

    // Add unique methods to select
    uniqueMethods.forEach((method) => {
        const option = document.createElement('option');
        option.value = method.id;
        option.textContent = method.name;
        option.dataset.type = method.type || '';
        if (method.id === defaultMethodId) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    // Add "Khuyến mãi" option
    const promoOption = document.createElement('option');
    promoOption.value = 'promotion';
    promoOption.textContent = 'Khuyến mãi';
    promoOption.dataset.type = 'promotion';
    select.appendChild(promoOption);
}

function onPaymentMethodChange() {
    const select = document.getElementById('paymentMethod');
    const contentInput = document.getElementById('paymentContent');
    const selectedOption = select.options[select.selectedIndex];

    // If "Khuyến mãi" is selected, auto-fill content
    if (selectedOption && selectedOption.dataset.type === 'promotion') {
        contentInput.value = 'Khuyến mãi';
    } else {
        // If switching away from "Khuyến mãi", clear the auto-filled content
        if (contentInput.value === 'Khuyến mãi') {
            contentInput.value = '';
        }
    }
}

async function submitPayment() {
    const partnerId = currentPaymentPartnerId;
    let journalId = document.getElementById('paymentMethod').value;
    const amount = parseFloat(document.getElementById('paymentAmount').value) || 0;
    const paymentDateValue = document.getElementById('paymentDate').value;
    const content = document.getElementById('paymentContent').value;

    // Validation
    if (!journalId) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng chọn phương thức thanh toán');
        }
        return;
    }

    // Handle "Khuyến mãi" - use first available cash method
    if (journalId === 'promotion') {
        const cashMethod = paymentMethods.find(m => m.Type === 'cash');
        if (cashMethod) {
            journalId = cashMethod.Id;
        } else {
            if (window.notificationManager) {
                window.notificationManager.warning('Không tìm thấy phương thức tiền mặt');
            }
            return;
        }
    }

    if (amount <= 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Số tiền phải lớn hơn 0');
        }
        return;
    }

    try {
        const authHeader = await window.tokenManager.getAuthHeader();
        const paymentDate = new Date(paymentDateValue).toISOString();

        const payload = {
            PartnerId: partnerId,
            JournalId: parseInt(journalId),
            Amount: amount,
            PaymentDate: paymentDate,
            Ref: content,
            Communication: content,
            PartnerType: 'supplier'
        };

        const url = `${CONFIG.API_BASE_PARTNER}/AccountVoucher/RegisterSupplierPayment`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                ...authHeader,
                'Content-Type': 'application/json',
                'tposappversion': '6.2.6.1'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            if (window.notificationManager) {
                window.notificationManager.success('Thanh toán thành công');
            }
            closePaymentModal();
            // Refresh data
            await fetchData();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Lỗi thanh toán');
        }
    } catch (error) {
        console.error('[SupplierDebt] Payment error:', error);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`);
        }
    }
}

function initPaymentModal() {
    // Close modal handlers
    document.getElementById('btnCloseModal')?.addEventListener('click', closePaymentModal);
    document.getElementById('btnCancelPayment')?.addEventListener('click', closePaymentModal);

    // Submit payment handler
    document.getElementById('btnSubmitPayment')?.addEventListener('click', submitPayment);

    // Payment method change handler (for "Khuyến mãi" auto-fill)
    document.getElementById('paymentMethod')?.addEventListener('change', onPaymentMethodChange);

    // Close on overlay click
    document.getElementById('paymentModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'paymentModal') {
            closePaymentModal();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('paymentModal')?.classList.contains('show')) {
            closePaymentModal();
        }
    });
}

// =====================================================
// DATE FORMATTING HELPERS
// =====================================================

function formatDateFromISO(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return formatDate(date);
}

function formatDateFromDotNet(dotNetDate) {
    if (!dotNetDate) return '';
    // Parse /Date(1768708149760)/ format
    const match = dotNetDate.match(/\/Date\((\d+)\)\//);
    if (match) {
        const timestamp = parseInt(match[1], 10);
        const date = new Date(timestamp);
        return formatDate(date);
    }
    return '';
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

    // Initialize column toggle
    initColumnToggle();

    // Initialize payment modal
    initPaymentModal();

    // Load initial data
    await fetchData();

    console.log('[SupplierDebt] Initialization complete');
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
