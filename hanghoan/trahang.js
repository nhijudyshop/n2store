/* =====================================================
   TRẢ HÀNG - RETURN PRODUCT FUNCTIONALITY
   Separate JS for Trả Hàng tab section
   ===================================================== */

// Trả Hàng Module - Self-contained to avoid conflicts
const TraHangModule = (function() {
    'use strict';

    // API Configuration - Using proxy to bypass CORS
    const API_CONFIG = {
        // Proxy URL to bypass CORS restrictions
        proxyBaseUrl: 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata',
        // Direct URL (for reference, not used due to CORS)
        directBaseUrl: 'https://tomato.tpos.vn/odata',
        // OData endpoint
        endpoint: '/FastSaleOrder/ODataService.GetView',
        pageSize: 50,

        // Get token from multiple sources (priority order)
        getToken: () => {
            // 1. Use global tokenManager if available
            if (typeof window.tokenManager !== 'undefined' && window.tokenManager.getToken) {
                const token = window.tokenManager.getToken();
                if (token) return token;
            }

            // 2. Check bearer_token_data (primary storage)
            try {
                const bearerData = localStorage.getItem('bearer_token_data');
                if (bearerData) {
                    const parsed = JSON.parse(bearerData);
                    if (parsed.access_token) return parsed.access_token;
                }
            } catch (e) {}

            // 3. Check auth key
            try {
                const authData = localStorage.getItem('auth');
                if (authData) {
                    const parsed = JSON.parse(authData);
                    if (parsed.access_token) return parsed.access_token;
                    if (parsed.token) return parsed.token;
                }
            } catch (e) {}

            // 4. Fallback to tpos_token
            return localStorage.getItem('tpos_token') || '';
        }
    };

    // State
    let traHangData = [];
    let filteredData = [];
    let isLoading = false;
    let totalCount = 0;
    let hasLoadedOnce = false;
    let currentDetailId = null; // Store current order ID for detail modal

    // DOM Elements cache
    const elements = {
        tableBody: null,
        emptyState: null,
        loadingState: null,
        searchInput: null,
        statusFilter: null,
        startDate: null,
        endDate: null,
        statTotal: null,
        statConfirmed: null,
        statDraft: null
    };

    // Initialize
    function init() {
        cacheElements();
        bindEvents();
        setDefaultDates();
        console.log('TraHangModule initialized');
    }

    // Cache DOM elements
    function cacheElements() {
        elements.tableBody = document.getElementById('trahangTableBody');
        elements.emptyState = document.getElementById('trahangEmptyState');
        elements.loadingState = document.getElementById('trahangLoadingState');
        elements.searchInput = document.getElementById('trahangSearchInput');
        elements.statusFilter = document.getElementById('trahangStatusFilter');
        elements.startDate = document.getElementById('trahangStartDate');
        elements.endDate = document.getElementById('trahangEndDate');
        elements.statTotal = document.getElementById('trahangStatTotal');
        elements.statConfirmed = document.getElementById('trahangStatConfirmed');
        elements.statDraft = document.getElementById('trahangStatDraft');
    }

    // Set default dates (1 month ago to today)
    function setDefaultDates() {
        const today = new Date();
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        if (elements.startDate) {
            elements.startDate.value = formatDateForInput(oneMonthAgo);
        }
        if (elements.endDate) {
            elements.endDate.value = formatDateForInput(today);
        }
    }

    // Format date for input[type="date"]
    function formatDateForInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Bind events
    function bindEvents() {
        // Search input
        if (elements.searchInput) {
            elements.searchInput.addEventListener('input', debounce(handleSearch, 300));
        }

        // Status filter
        if (elements.statusFilter) {
            elements.statusFilter.addEventListener('change', applyFilters);
        }

        // Date filters - refetch from API when dates change
        if (elements.startDate) {
            elements.startDate.addEventListener('change', () => fetchFromAPI());
        }
        if (elements.endDate) {
            elements.endDate.addEventListener('change', () => fetchFromAPI());
        }

        // Select all checkbox
        const selectAll = document.getElementById('trahangSelectAll');
        if (selectAll) {
            selectAll.addEventListener('change', handleSelectAll);
        }
    }

    // Debounce utility
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Build API URL with date filters
    function buildApiUrl() {
        const startDate = elements.startDate?.value;
        const endDate = elements.endDate?.value;

        // Default to 1 month range if not specified
        const today = new Date();
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        // Format dates for OData filter (ISO format with timezone)
        const startISO = startDate
            ? new Date(startDate + 'T00:00:00').toISOString().replace('.000Z', '+00:00')
            : oneMonthAgo.toISOString().replace('.000Z', '+00:00');

        const endISO = endDate
            ? new Date(endDate + 'T23:59:59').toISOString().replace('.000Z', '+00:00')
            : today.toISOString().replace('.000Z', '+00:00');

        // OData filter for refund orders
        const filter = `(Type eq 'refund' and DateInvoice ge ${startISO} and DateInvoice le ${endISO} and IsMergeCancel ne true)`;

        const params = new URLSearchParams({
            '$top': API_CONFIG.pageSize.toString(),
            '$orderby': 'DateInvoice desc',
            '$filter': filter,
            '$count': 'true'
        });

        // Use proxy URL to bypass CORS
        return `${API_CONFIG.proxyBaseUrl}${API_CONFIG.endpoint}?${params.toString()}`;
    }

    // Fetch data from TPOS API
    async function fetchFromAPI() {
        const token = API_CONFIG.getToken();

        if (!token) {
            console.warn('No TPOS token found. Please login to TPOS first.');
            hideLoading();
            showEmptyState();
            // Show notification to user
            if (typeof showNotification === 'function') {
                showNotification('Vui lòng đăng nhập TPOS để xem dữ liệu trả hàng', 'warning');
            }
            return;
        }

        showLoading();

        try {
            const url = buildApiUrl();
            let response;

            // Use tokenManager.authenticatedFetch if available (handles token refresh)
            if (typeof window.tokenManager !== 'undefined' && window.tokenManager.authenticatedFetch) {
                response = await window.tokenManager.authenticatedFetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
            } else {
                // Fallback to regular fetch with token
                // Only use headers allowed by CORS proxy
                response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });
            }

            if (!response.ok) {
                // Handle token expiry (401)
                if (response.status === 401) {
                    console.warn('Token expired or invalid');
                    if (typeof showNotification === 'function') {
                        showNotification('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại TPOS.', 'warning');
                    }
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            // Get total count from OData response
            totalCount = data['@odata.count'] || 0;

            // Map API response to our format
            const mappedData = mapApiResponse(data.value || []);

            loadData(mappedData);
            hasLoadedOnce = true;

            console.log(`TraHang: Loaded ${mappedData.length} items (total: ${totalCount})`);

        } catch (error) {
            console.error('Error fetching data from API:', error);
            hideLoading();
            showEmptyState();

            // Show error notification if available
            if (typeof showNotification === 'function') {
                showNotification('Lỗi khi tải dữ liệu trả hàng: ' + error.message, 'error');
            }
        }
    }

    // Map API response to table format
    function mapApiResponse(items) {
        return items.map(item => ({
            id: item.Id,
            customerName: item.PartnerDisplayName || item.PartnerName || '',
            phone: item.Phone || '',
            invoiceDate: item.DateInvoice,
            invoiceNumber: item.Number || '',
            reference: item.ReferenceNumber || item.InvoiceReference || '',
            totalAmount: item.AmountTotal || 0,
            remainingDebt: item.Residual || 0,
            status: mapStatus(item.State, item.ShowState),
            // Keep original data for reference
            _original: item
        }));
    }

    // Map API status to display status
    function mapStatus(state, showState) {
        if (showState) {
            return showState;
        }

        switch (state) {
            case 'open':
            case 'paid':
                return 'Đã xác nhận';
            case 'draft':
                return 'Nháp';
            case 'cancel':
                return 'Đã hủy';
            default:
                return state || 'Nháp';
        }
    }

    // Show loading state
    function showLoading() {
        isLoading = true;
        if (elements.loadingState) {
            elements.loadingState.classList.add('show');
        }
        if (elements.tableBody) {
            elements.tableBody.innerHTML = '';
        }
        if (elements.emptyState) {
            elements.emptyState.classList.remove('show');
        }
    }

    // Hide loading state
    function hideLoading() {
        isLoading = false;
        if (elements.loadingState) {
            elements.loadingState.classList.remove('show');
        }
    }

    // Show empty state
    function showEmptyState() {
        if (elements.emptyState) {
            elements.emptyState.classList.add('show');
        }
    }

    // Hide empty state
    function hideEmptyState() {
        if (elements.emptyState) {
            elements.emptyState.classList.remove('show');
        }
    }

    // Format currency
    function formatCurrency(amount) {
        if (!amount && amount !== 0) return '';
        return new Intl.NumberFormat('vi-VN').format(amount);
    }

    // Format date for display
    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${day}/${month}/${year}<br>${hours}:${minutes}`;
    }

    // Get status class
    function getStatusClass(status) {
        const statusLower = (status || '').toLowerCase();
        if (statusLower.includes('xác nhận') || statusLower === 'confirmed' || statusLower === 'open' || statusLower === 'paid') {
            return 'confirmed';
        } else if (statusLower.includes('nháp') || statusLower === 'draft') {
            return 'draft';
        } else if (statusLower.includes('hủy') || statusLower === 'cancelled' || statusLower === 'cancel') {
            return 'cancelled';
        }
        return 'draft';
    }

    // Get status display text
    function getStatusText(status) {
        const statusLower = (status || '').toLowerCase();
        if (statusLower.includes('xác nhận') || statusLower === 'confirmed' || statusLower === 'open' || statusLower === 'paid') {
            return 'Đã xác nhận';
        } else if (statusLower.includes('nháp') || statusLower === 'draft') {
            return 'Nháp';
        } else if (statusLower.includes('hủy') || statusLower === 'cancelled' || statusLower === 'cancel') {
            return 'Đã hủy';
        }
        return status || 'Nháp';
    }

    // Render table
    function renderTable(data) {
        if (!elements.tableBody) return;

        // Filter out draft status items - only show confirmed items
        const filteredData = (data || []).filter(item => {
            const statusClass = getStatusClass(item.status);
            return statusClass !== 'draft';
        });

        if (!filteredData || filteredData.length === 0) {
            elements.tableBody.innerHTML = '';
            showEmptyState();
            return;
        }

        hideEmptyState();

        const html = filteredData.map((item, index) => `
            <tr data-id="${item.id || index}">
                <td class="col-checkbox">
                    <input type="checkbox" class="row-checkbox" data-id="${item.id || index}">
                </td>
                <td>
                    <div class="customer-info">
                        <span class="customer-name">${escapeHtml(item.customerName || '')}</span>
                        <span class="customer-phone-label">Điện thoại:</span>
                        <a href="tel:${item.phone || ''}" class="customer-phone">${escapeHtml(item.phone || '')}</a>
                    </div>
                </td>
                <td class="col-date">${formatDate(item.invoiceDate)}</td>
                <td class="col-invoice">${escapeHtml(item.invoiceNumber || '')}</td>
                <td class="col-reference">${escapeHtml(item.reference || '')}</td>
                <td class="col-amount">${formatCurrency(item.totalAmount)}</td>
                <td class="col-amount">${formatCurrency(item.remainingDebt)}</td>
                <td class="col-status">
                    <span class="trahang-status ${getStatusClass(item.status)}">${getStatusText(item.status)}</span>
                </td>
                <td class="col-returned">
                    <input type="checkbox" class="returned-checkbox" data-id="${item.id || index}" title="Đánh dấu đã trả hàng">
                </td>
            </tr>
        `).join('');

        elements.tableBody.innerHTML = html;

        // Re-initialize Lucide icons for new elements
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Bind row checkbox events
        bindRowCheckboxEvents();
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Bind row checkbox events
    function bindRowCheckboxEvents() {
        const checkboxes = document.querySelectorAll('#trahangTableBody .row-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', updateSelectAllState);
        });

        // Bind row click events to open detail modal
        const rows = document.querySelectorAll('#trahangTableBody tr');
        rows.forEach(row => {
            row.addEventListener('click', (e) => {
                // Don't open modal if clicking on checkbox
                if (e.target.type === 'checkbox' || e.target.closest('.col-checkbox') || e.target.closest('.col-returned')) {
                    return;
                }
                const orderId = row.dataset.id;
                if (orderId) {
                    openDetailModal(orderId);
                }
            });
        });
    }

    // Handle select all
    function handleSelectAll(e) {
        const isChecked = e.target.checked;
        const checkboxes = document.querySelectorAll('#trahangTableBody .row-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
        });
    }

    // Update select all state based on individual checkboxes
    function updateSelectAllState() {
        const selectAll = document.getElementById('trahangSelectAll');
        const checkboxes = document.querySelectorAll('#trahangTableBody .row-checkbox');
        const checkedCount = document.querySelectorAll('#trahangTableBody .row-checkbox:checked').length;

        if (selectAll) {
            selectAll.checked = checkedCount === checkboxes.length && checkboxes.length > 0;
            selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
        }
    }

    // Handle search
    function handleSearch() {
        applyFilters();
    }

    // Apply local filters (search and status)
    function applyFilters() {
        let result = [...traHangData];

        // Search filter
        const searchTerm = elements.searchInput?.value?.toLowerCase()?.trim() || '';
        if (searchTerm) {
            result = result.filter(item => {
                return (
                    (item.customerName || '').toLowerCase().includes(searchTerm) ||
                    (item.phone || '').toLowerCase().includes(searchTerm) ||
                    (item.invoiceNumber || '').toLowerCase().includes(searchTerm) ||
                    (item.reference || '').toLowerCase().includes(searchTerm)
                );
            });
        }

        // Status filter
        const statusValue = elements.statusFilter?.value || 'all';
        if (statusValue !== 'all') {
            result = result.filter(item => {
                const statusClass = getStatusClass(item.status);
                return statusClass === statusValue;
            });
        }

        filteredData = result;
        renderTable(result);
    }

    // Update stats
    function updateStats() {
        const total = traHangData.length;
        const confirmed = traHangData.filter(item => getStatusClass(item.status) === 'confirmed').length;
        const draft = traHangData.filter(item => getStatusClass(item.status) === 'draft').length;

        if (elements.statTotal) elements.statTotal.textContent = total;
        if (elements.statConfirmed) elements.statConfirmed.textContent = confirmed;
        if (elements.statDraft) elements.statDraft.textContent = draft;
    }

    // Load data
    function loadData(data) {
        showLoading();

        try {
            traHangData = data || [];
            filteredData = [...traHangData];

            hideLoading();
            renderTable(traHangData);
            updateStats();
        } catch (error) {
            console.error('Error loading data:', error);
            hideLoading();
            showEmptyState();
        }
    }

    // Set custom data source function
    function setDataSource(fetchFunction) {
        if (typeof fetchFunction === 'function') {
            showLoading();
            fetchFunction()
                .then(data => {
                    loadData(data);
                })
                .catch(error => {
                    console.error('Error fetching data:', error);
                    hideLoading();
                    showEmptyState();
                });
        }
    }

    // Edit item - opens TPOS edit page
    function editItem(id) {
        const item = traHangData.find(d => (d.id || '').toString() === id.toString());
        if (item) {
            // Open TPOS refund order edit page
            const editUrl = `https://tomato.tpos.vn/Sale/RefundOrders/${id}`;
            window.open(editUrl, '_blank');
        }
    }

    // Delete item - placeholder (TPOS doesn't support direct delete via API)
    function deleteItem(id) {
        const item = traHangData.find(d => (d.id || '').toString() === id.toString());
        if (item) {
            alert('Để xóa đơn trả hàng, vui lòng thao tác trực tiếp trên TPOS.\nMã đơn: ' + item.invoiceNumber);
            // Open TPOS page for the order
            const editUrl = `https://tomato.tpos.vn/Sale/RefundOrders/${id}`;
            window.open(editUrl, '_blank');
        }
    }

    // Refresh data from API
    function refresh() {
        fetchFromAPI();
    }

    // Get selected items
    function getSelectedItems() {
        const checkboxes = document.querySelectorAll('#trahangTableBody .row-checkbox:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.dataset.id);
        return traHangData.filter(item => selectedIds.includes((item.id || '').toString()));
    }

    // Check if data has been loaded
    function hasLoaded() {
        return hasLoadedOnce;
    }

    // =====================================================
    // DETAIL MODAL FUNCTIONS
    // =====================================================

    // Open detail modal and fetch order details
    async function openDetailModal(orderId) {
        currentDetailId = orderId;

        const modal = document.getElementById('returnDetailModal');
        const loadingEl = document.getElementById('returnDetailLoading');
        const contentEl = document.getElementById('returnDetailContent');

        if (!modal) return;

        // Show modal with loading state
        modal.classList.add('show');
        loadingEl.classList.add('show');
        contentEl.classList.remove('show');

        // Reinitialize Lucide icons for loading spinner
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        try {
            const orderData = await fetchOrderDetail(orderId);
            if (orderData) {
                populateModal(orderData);
                loadingEl.classList.remove('show');
                contentEl.classList.add('show');

                // Initialize modal tabs
                initModalTabs();

                // Reinitialize Lucide icons
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }
        } catch (error) {
            console.error('Error fetching order details:', error);
            loadingEl.classList.remove('show');
            if (typeof showNotification === 'function') {
                showNotification('Lỗi khi tải chi tiết đơn hàng: ' + error.message, 'error');
            }
            closeDetailModal();
        }
    }

    // Close detail modal
    function closeDetailModal() {
        const modal = document.getElementById('returnDetailModal');
        if (modal) {
            modal.classList.remove('show');
        }
        currentDetailId = null;
    }

    // Fetch order detail from API
    async function fetchOrderDetail(orderId) {
        const token = API_CONFIG.getToken();

        if (!token) {
            throw new Error('Chưa đăng nhập TPOS');
        }

        // Build detail URL using proxy
        const expandParams = 'Partner,User,Warehouse,Company,PriceList,RefundOrder,Account,Journal,PaymentJournal,Carrier,Tax,SaleOrder,HistoryDeliveryDetails,OrderLines($expand=Product,ProductUOM,Account,SaleLine,User),Ship_ServiceExtras,OutstandingInfo($expand=Content),Team,OfferAmountDetails,DestConvertCurrencyUnit,PackageImages';
        const url = `${API_CONFIG.proxyBaseUrl}/FastSaleOrder(${orderId})?$expand=${encodeURIComponent(expandParams)}`;

        let response;

        // Use tokenManager.authenticatedFetch if available
        if (typeof window.tokenManager !== 'undefined' && window.tokenManager.authenticatedFetch) {
            response = await window.tokenManager.authenticatedFetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
        } else {
            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
        }

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Phiên đăng nhập hết hạn');
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    }

    // Populate modal with order data
    function populateModal(data) {
        // Customer info
        const customerNameEl = document.getElementById('returnCustomerName');
        const customerStatusEl = document.getElementById('returnCustomerStatus');
        if (customerNameEl) customerNameEl.textContent = data.PartnerDisplayName || data.Partner?.Name || '-';
        if (customerStatusEl) {
            const partnerStatus = data.Partner?.StatusText || '';
            customerStatusEl.textContent = partnerStatus;
            customerStatusEl.style.display = partnerStatus ? 'inline-block' : 'none';
            // Add status class based on status
            customerStatusEl.classList.remove('status-good');
            if (partnerStatus.toLowerCase().includes('tốt') || partnerStatus.toLowerCase().includes('good')) {
                customerStatusEl.classList.add('status-good');
            }
        }

        // Payment method
        const paymentMethodEl = document.getElementById('returnPaymentMethod');
        if (paymentMethodEl) {
            paymentMethodEl.textContent = data.PaymentJournal?.Name || '-';
        }

        // Deliver
        const deliverEl = document.getElementById('returnDeliver');
        if (deliverEl) {
            deliverEl.textContent = data.Deliver || '-';
        }

        // Old debt (Nợ cũ)
        const oldDebtEl = document.getElementById('returnOldDebt');
        if (oldDebtEl) {
            const oldDebt = data.PreviousBalance || 0;
            oldDebtEl.textContent = formatCurrency(oldDebt);
        }

        // Order lines
        const linesBody = document.getElementById('returnLinesBody');
        if (linesBody && data.OrderLines) {
            const linesHtml = data.OrderLines.map((line, index) => `
                <tr>
                    <td class="text-center">${index + 1}</td>
                    <td>${escapeHtml(line.Name || line.ProductNameGet || '-')}</td>
                    <td class="text-right">${line.ProductUOMQty || 0}</td>
                    <td class="text-right">${formatCurrency(line.PriceUnit || 0)}</td>
                    <td class="text-right">${formatCurrency(line.PriceTotal || 0)}</td>
                </tr>
            `).join('');
            linesBody.innerHTML = linesHtml;
        }

        // Summary
        const totalQtyEl = document.getElementById('returnTotalQty');
        const totalAmountEl = document.getElementById('returnTotalAmount');
        const paidAmountEl = document.getElementById('returnPaidAmount');
        const remainingEl = document.getElementById('returnRemaining');

        if (totalQtyEl) totalQtyEl.textContent = data.TotalQuantity || 0;
        if (totalAmountEl) totalAmountEl.textContent = formatCurrency(data.AmountTotal || 0);
        if (paidAmountEl) paidAmountEl.textContent = formatCurrency(data.PaymentAmount || 0);
        if (remainingEl) remainingEl.textContent = formatCurrency(data.Residual || 0);

        // Receiver tab
        const receiverNameEl = document.getElementById('returnReceiverName');
        const receiverPhoneEl = document.getElementById('returnReceiverPhone');
        const receiverAddressEl = document.getElementById('returnReceiverAddress');
        const receiverNoteEl = document.getElementById('returnReceiverNote');

        if (receiverNameEl) receiverNameEl.textContent = data.ReceiverName || '-';
        if (receiverPhoneEl) receiverPhoneEl.textContent = data.ReceiverPhone || '-';
        if (receiverAddressEl) receiverAddressEl.textContent = data.ReceiverAddress || '-';
        if (receiverNoteEl) receiverNoteEl.textContent = data.ReceiverNote || '-';

        // Other info tab
        const invoiceNumberEl = document.getElementById('returnInvoiceNumber');
        const invoiceDateEl = document.getElementById('returnInvoiceDate');
        const warehouseEl = document.getElementById('returnWarehouse');
        const userEl = document.getElementById('returnUser');
        const commentEl = document.getElementById('returnComment');

        if (invoiceNumberEl) invoiceNumberEl.textContent = data.Number || '-';
        if (invoiceDateEl) invoiceDateEl.textContent = formatDateFull(data.DateInvoice);
        if (warehouseEl) warehouseEl.textContent = data.Warehouse?.Name || '-';
        if (userEl) userEl.textContent = data.User?.Name || data.UserName || '-';
        if (commentEl) commentEl.textContent = data.Comment || '-';

        // Package images
        const imagesGrid = document.getElementById('returnImagesGrid');
        if (imagesGrid) {
            if (data.PackageImages && data.PackageImages.length > 0) {
                const imagesHtml = data.PackageImages.map(img => `
                    <img src="${escapeHtml(img.Url || img)}" alt="Package Image" onclick="window.open('${escapeHtml(img.Url || img)}', '_blank')">
                `).join('');
                imagesGrid.innerHTML = imagesHtml;
            } else {
                imagesGrid.innerHTML = `
                    <div class="return-no-images">
                        <i data-lucide="image-off"></i>
                        <p>Chưa có hình ảnh đóng gói</p>
                    </div>
                `;
            }
        }

        // History
        const historyList = document.getElementById('returnHistoryList');
        if (historyList) {
            if (data.HistoryDeliveryDetails && data.HistoryDeliveryDetails.length > 0) {
                const historyHtml = data.HistoryDeliveryDetails.map(item => `
                    <div class="return-history-item">
                        <span class="history-date">${formatDateFull(item.Date || item.CreatedDate)}</span>
                        <span class="history-content">${escapeHtml(item.Description || item.Status || '-')}</span>
                    </div>
                `).join('');
                historyList.innerHTML = historyHtml;
            } else {
                historyList.innerHTML = `
                    <div class="return-no-history">
                        <i data-lucide="clock"></i>
                        <p>Chưa có lịch sử giao hàng</p>
                    </div>
                `;
            }
        }
    }

    // Format full date
    function formatDateFull(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    // Initialize modal tabs
    function initModalTabs() {
        const tabBtns = document.querySelectorAll('.return-tab-btn');
        const tabContents = document.querySelectorAll('.return-tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const targetTab = this.dataset.tab;

                // Remove active from all
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                // Add active to clicked
                this.classList.add('active');

                // Map tab name to content ID
                const contentId = 'returnTab' + targetTab.charAt(0).toUpperCase() + targetTab.slice(1);
                const content = document.getElementById(contentId);
                if (content) {
                    content.classList.add('active');
                }

                // Reinitialize icons
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        });
    }

    // Open order in TPOS
    function openInTpos() {
        if (currentDetailId) {
            const url = `https://tomato.tpos.vn/Sale/RefundOrders/${currentDetailId}`;
            window.open(url, '_blank');
        }
    }

    // Public API
    return {
        init,
        loadData,
        setDataSource,
        fetchFromAPI,
        editItem,
        deleteItem,
        refresh,
        getSelectedItems,
        getData: () => traHangData,
        getFilteredData: () => filteredData,
        getTotalCount: () => totalCount,
        hasLoaded,
        // Modal functions
        openDetailModal,
        closeDetailModal,
        openInTpos
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize if we're on the correct page
    if (document.getElementById('trahangTableBody')) {
        TraHangModule.init();
    }

    // Modal overlay click handler - close on click outside
    const returnDetailModal = document.getElementById('returnDetailModal');
    if (returnDetailModal) {
        returnDetailModal.addEventListener('click', function(e) {
            // Close if clicked on overlay (not on modal content)
            if (e.target === returnDetailModal) {
                TraHangModule.closeDetailModal();
            }
        });
    }

    // Escape key handler
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('returnDetailModal');
            if (modal && modal.classList.contains('show')) {
                TraHangModule.closeDetailModal();
            }
        }
    });
});

// Tab switching functionality
function initMainTabs() {
    const tabBtns = document.querySelectorAll('.main-tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const targetTab = this.dataset.tab;

            // Remove active from all tabs
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active to clicked tab
            this.classList.add('active');
            const targetContent = document.getElementById(targetTab);
            if (targetContent) {
                targetContent.classList.add('active');
            }

            // Re-initialize Lucide icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

            // Auto-fetch data when switching to Trả Hàng tab
            if (targetTab === 'traHangTab' && !TraHangModule.hasLoaded()) {
                TraHangModule.fetchFromAPI();
            }
        });
    });
}

// Initialize tabs when DOM is ready
document.addEventListener('DOMContentLoaded', initMainTabs);
