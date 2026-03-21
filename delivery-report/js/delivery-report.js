// =====================================================
// DELIVERY REPORT - Thống Kê Giao Hàng
// Main controller: API calls, filters, table rendering, pagination
// =====================================================

(function () {
    'use strict';

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // =====================================================
    // STATE
    // =====================================================
    const DeliveryReportState = {
        allData: [],
        totalCount: 0,
        currentPage: 1,
        pageSize: 1000,
        isLoading: false,

        // Tra soát mode
        traSoatMode: false,
        scannedNumbers: new Set(),
        activeTab: 'all', // 'city', 'province', 'shop', 'all'
        provinceGroups: {}, // { Number: 'tomato' | 'nap' }
        _provinceGroupsLoaded: false,
        lastScannedColumn: null, // 'tomato' | 'nap'

        // Filter values
        filters: {
            fromDate: '',
            toDate: '',
            carrierId: '',
            keyword: ''
        },

        // Column visibility (default: only key columns visible)
        columns: {
            index: true,
            customer: true,
            receiverInfo: false,
            dateInvoice: true,
            number: true,
            amountTotal: true,
            cashOnDelivery: false,
            carrierName: false,
            deliveryPrice: false,
            shipWeight: false,
            trackingRef: false,
            showShipStatus: false,
            forControlStatus: false
        }
    };

    // =====================================================
    // INITIALIZATION
    // =====================================================
    function initDeliveryReport() {
        setDefaultDates();
        bindFilterEvents();
        bindColumnToggle();
        applyColumnVisibility();
        loadFiltersFromStorage();
        fetchData();
    }

    function setDefaultDates() {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const fromInput = document.getElementById('drFilterFromDate');
        const toInput = document.getElementById('drFilterToDate');

        if (fromInput && !fromInput.value) {
            fromInput.value = formatDateForInput(firstDay);
            DeliveryReportState.filters.fromDate = fromInput.value;
        }
        if (toInput && !toInput.value) {
            toInput.value = formatDateForInput(lastDay);
            DeliveryReportState.filters.toDate = toInput.value;
        }
    }

    function formatDateForInput(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d}T${h}:${min}`;
    }

    // =====================================================
    // FILTER EVENTS
    // =====================================================
    function bindFilterEvents() {
        const searchBtn = document.getElementById('drBtnSearch');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                DeliveryReportState.currentPage = 1;
                collectFilters();
                saveFiltersToStorage();
                fetchData();
            });
        }

        // Enter key on keyword
        const keywordInput = document.getElementById('drFilterKeyword');
        if (keywordInput) {
            keywordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    DeliveryReportState.currentPage = 1;
                    collectFilters();
                    saveFiltersToStorage();
                    fetchData();
                }
            });
        }
    }

    function collectFilters() {
        const f = DeliveryReportState.filters;
        f.fromDate = document.getElementById('drFilterFromDate')?.value || '';
        f.toDate = document.getElementById('drFilterToDate')?.value || '';
        f.carrierId = document.getElementById('drFilterCarrier')?.value || '';
        f.keyword = document.getElementById('drFilterKeyword')?.value?.trim() || '';
    }

    function saveFiltersToStorage() {
        try {
            localStorage.setItem('dr_filters', JSON.stringify(DeliveryReportState.filters));
        } catch (e) { /* ignore quota errors */ }
    }

    function loadFiltersFromStorage() {
        try {
            const saved = localStorage.getItem('dr_filters');
            if (saved) {
                const f = JSON.parse(saved);
                Object.assign(DeliveryReportState.filters, f);

                // Apply to inputs
                if (f.fromDate) document.getElementById('drFilterFromDate').value = f.fromDate;
                if (f.toDate) document.getElementById('drFilterToDate').value = f.toDate;
                if (f.carrierId) document.getElementById('drFilterCarrier').value = f.carrierId;
                if (f.keyword) document.getElementById('drFilterKeyword').value = f.keyword;
            }
        } catch (e) { /* ignore */ }
    }

    // =====================================================
    // COLUMN TOGGLE
    // =====================================================
    function bindColumnToggle() {
        const toggleBtn = document.getElementById('drColumnToggleBtn');
        const dropdown = document.getElementById('drColumnDropdown');
        if (!toggleBtn || !dropdown) return;

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== toggleBtn) {
                dropdown.classList.remove('show');
            }
        });

        // Column checkboxes
        dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                DeliveryReportState.columns[cb.dataset.col] = cb.checked;
                applyColumnVisibility();
            });
        });
    }

    function applyColumnVisibility() {
        const cols = DeliveryReportState.columns;
        Object.keys(cols).forEach(colKey => {
            const cells = document.querySelectorAll(`[data-col="${colKey}"]`);
            cells.forEach(cell => {
                cell.style.display = cols[colKey] ? '' : 'none';
            });
        });
    }

    // =====================================================
    // API FETCH - Loads ALL data, client-side pagination
    // =====================================================
    async function fetchData() {
        if (DeliveryReportState.isLoading) return;
        DeliveryReportState.isLoading = true;
        showLoading();

        try {
            const token = await getToken();
            if (!token) {
                showError('Không thể lấy token xác thực. Vui lòng tải lại trang.');
                return;
            }

            const url = buildApiUrl();
            console.log('[DELIVERY-REPORT] Fetching:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1'
                }
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const result = await response.json();
            DeliveryReportState.allData = result.value || [];

            populateCarrierFilter();
            await ensureProvinceGroups();
            renderTable();
            renderStats();
            renderPagination();
        } catch (error) {
            console.error('[DELIVERY-REPORT] Fetch error:', error);
            showError('Lỗi khi tải dữ liệu: ' + error.message);
        } finally {
            DeliveryReportState.isLoading = false;
        }
    }

    async function getToken() {
        // Try tokenManager (if loaded on this page)
        if (window.tokenManager && typeof window.tokenManager.getToken === 'function') {
            try {
                return await window.tokenManager.getToken();
            } catch (e) {
                console.warn('[DELIVERY-REPORT] tokenManager.getToken failed:', e);
            }
        }

        // Fallback: try localStorage
        try {
            const companyId = window.ShopConfig?.getConfig?.()?.CompanyId || 1;
            const key = 'bearer_token_data_' + companyId;
            const stored = localStorage.getItem(key);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.access_token) return data.access_token;
            }
        } catch (e) { /* ignore */ }

        return null;
    }

    function buildApiUrl() {
        const f = DeliveryReportState.filters;
        const params = new URLSearchParams();

        // Date conversion: local datetime → UTC ISO
        if (f.fromDate) {
            params.set('FromDate', new Date(f.fromDate).toISOString());
        }
        if (f.toDate) {
            params.set('ToDate', new Date(f.toDate).toISOString());
        }

        params.set('Q', f.keyword);

        // Fetch all data (client-side pagination)
        params.set('$top', '10000');

        // Sort
        params.set('$orderby', 'DateInvoice desc,Number desc,Id desc');
        params.set('$count', 'true');

        return `${WORKER_URL}/api/odata/Report/DeliveryReport?${params.toString()}`;
    }

    // =====================================================
    // POPULATE CARRIER FILTER FROM DATA
    // =====================================================
    // Normalize carrier name: group all "THÀNH PHỐ (...)" into "THÀNH PHỐ"
    function normalizeCarrier(name) {
        if (!name) return '';
        if (name.toUpperCase().startsWith('THÀNH PHỐ')) return 'THÀNH PHỐ';
        return name;
    }

    function populateCarrierFilter() {
        const select = document.getElementById('drFilterCarrier');
        if (!select) return;

        const currentValue = select.value;
        const carriers = new Set();
        (DeliveryReportState.allData || []).forEach(item => {
            if (item.CarrierName) carriers.add(normalizeCarrier(item.CarrierName));
        });

        const sorted = [...carriers].sort();
        let html = '<option value="">Tất cả</option>';
        sorted.forEach(name => {
            html += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
        });
        select.innerHTML = html;

        // Restore selection if still valid
        if (currentValue && carriers.has(currentValue)) {
            select.value = currentValue;
        }
    }

    // =====================================================
    // CLIENT-SIDE FILTER (carrier + tra soát)
    // =====================================================
    function getFilteredData() {
        const state = DeliveryReportState;

        if (state.traSoatMode) {
            // In tra soát mode: use tab filter + exclude scanned
            let data = getTabFilteredData();
            data = data.filter(item => !state.scannedNumbers.has(item.Number));
            return data;
        }

        // Normal mode: carrier filter only (normalized)
        let data = state.allData || [];
        const carrier = state.filters.carrierId;
        if (carrier) {
            data = data.filter(item => normalizeCarrier(item.CarrierName) === carrier);
        }
        return data;
    }

    // =====================================================
    // RENDER TABLE
    // =====================================================
    function renderTable() {
        // Province tab in tra soát mode uses special 2-column view
        if (DeliveryReportState.traSoatMode && DeliveryReportState.activeTab === 'province') {
            renderProvinceView();
            return;
        }

        // Ensure normal table is visible
        const provinceView = document.getElementById('drProvinceView');
        const tableWrapper = document.getElementById('drTableWrapper');
        if (provinceView) provinceView.style.display = 'none';
        if (tableWrapper) tableWrapper.style.display = '';

        const tbody = document.getElementById('drTableBody');
        const tfoot = document.getElementById('drTableFoot');
        if (!tbody) return;

        const allData = getFilteredData();
        DeliveryReportState.totalCount = allData.length;

        if (!allData || allData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="13" class="dr-empty"><i class="fas fa-inbox"></i>Không có dữ liệu</td></tr>`;
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        // Client-side pagination: slice from allData
        const startIndex = (DeliveryReportState.currentPage - 1) * DeliveryReportState.pageSize;
        const endIndex = startIndex + DeliveryReportState.pageSize;
        const pageData = allData.slice(startIndex, endIndex);

        let html = '';
        let totalAmount = 0;
        let totalCOD = 0;
        let totalShipPrice = 0;

        pageData.forEach((item, i) => {
            totalAmount += item.AmountTotal || 0;
            totalCOD += item.CashOnDelivery || 0;
            totalShipPrice += item.DeliveryPrice || 0;

            const shipStatusClass = getShipStatusClass(item.ShipStatus);
            const forControlText = getForControlText(item);

            html += `<tr>
                <td data-col="index">${startIndex + i + 1}</td>
                <td data-col="number">${escapeHtml(item.Number || '')}</td>
                <td data-col="customer">
                    <div class="dr-customer-name">${escapeHtml(item.PartnerDisplayName || '')}</div>
                    <div class="dr-customer-phone">ĐT: ${escapeHtml(item.Phone || '')}</div>
                </td>
                <td data-col="receiverInfo">
                    <div class="dr-receiver-name">${escapeHtml(item.Ship_Receiver_Name || '')}</div>
                    <div class="dr-receiver-phone">Điện thoại: ${escapeHtml(item.Ship_Receiver_Phone || item.Phone || '')}</div>
                    <div class="dr-receiver-address">Địa chỉ: ${escapeHtml(item.FullAddress || item.Address || '')}</div>
                </td>
                <td data-col="dateInvoice">${formatDate(item.DateInvoice)}</td>
                <td data-col="amountTotal" class="dr-money">${formatMoney(item.AmountTotal)}</td>
                <td data-col="cashOnDelivery" class="dr-money">${formatMoney(item.CashOnDelivery)}</td>
                <td data-col="carrierName">${escapeHtml(item.CarrierName || '')}</td>
                <td data-col="deliveryPrice" class="dr-money">${formatMoney(item.DeliveryPrice)}</td>
                <td data-col="shipWeight" style="text-align:center">${item.ShipWeight || ''}</td>
                <td data-col="trackingRef">${escapeHtml(item.TrackingRef || '')}</td>
                <td data-col="showShipStatus"><span class="dr-ship-status ${shipStatusClass}">${escapeHtml(item.ShowShipStatus || '')}</span></td>
                <td data-col="forControlStatus">${forControlText}</td>
            </tr>`;
        });

        tbody.innerHTML = html;

        // Footer totals (from ALL data, not just current page)
        let allTotalAmount = 0, allTotalCOD = 0, allTotalShipPrice = 0;
        allData.forEach(item => {
            allTotalAmount += item.AmountTotal || 0;
            allTotalCOD += item.CashOnDelivery || 0;
            allTotalShipPrice += item.DeliveryPrice || 0;
        });

        if (tfoot) {
            tfoot.innerHTML = `<tr>
                <td data-col="index"></td>
                <td data-col="number"></td>
                <td data-col="customer"><strong>Tổng: ${formatNumber(DeliveryReportState.totalCount)}</strong></td>
                <td data-col="receiverInfo"></td>
                <td data-col="dateInvoice"></td>
                <td data-col="amountTotal" class="dr-money"><strong>${formatMoney(allTotalAmount)}</strong></td>
                <td data-col="cashOnDelivery" class="dr-money"><strong>${formatMoney(allTotalCOD)}</strong></td>
                <td data-col="carrierName"></td>
                <td data-col="deliveryPrice" class="dr-money"><strong>${formatMoney(allTotalShipPrice)}</strong></td>
                <td data-col="shipWeight"></td>
                <td data-col="trackingRef"></td>
                <td data-col="showShipStatus"></td>
                <td data-col="forControlStatus"></td>
            </tr>`;
        }

        applyColumnVisibility();
    }

    // =====================================================
    // RENDER STATS
    // =====================================================
    function renderStats() {
        const data = getFilteredData();
        const totalCount = data.length;

        let totalCOD = 0;
        let paidCount = 0;
        let paidAmount = 0;
        let returnCount = 0;
        let returnAmount = 0;
        let shippingCount = 0;
        let shippingAmount = 0;
        let failControlCount = 0;
        let failControlAmount = 0;

        // Stats from ALL data (accurate)
        data.forEach(item => {
            totalCOD += item.CashOnDelivery || 0;
            if (item.ShipStatus === 'done') {
                paidCount++;
                paidAmount += item.CashOnDelivery || 0;
            } else if (item.ShipStatus === 'returned' || item.ShipStatus === 'cancel') {
                returnCount++;
                returnAmount += item.CashOnDelivery || 0;
            } else {
                shippingCount++;
                shippingAmount += item.CashOnDelivery || 0;
            }
        });

        // Update stat elements
        updateStatElement('drStatCODCount', `${formatNumber(totalCount)} Hóa đơn`);
        updateStatElement('drStatCODValue', formatMoney(totalCOD));

        updateStatElement('drStatPaidCount', `${formatNumber(paidCount)} Hóa đơn`);
        updateStatElement('drStatPaidValue', formatMoney(paidAmount));

        updateStatElement('drStatReturnCount', `${formatNumber(returnCount)} Hóa đơn`);
        updateStatElement('drStatReturnValue', formatMoney(returnAmount));

        updateStatElement('drStatShippingCount', `${formatNumber(totalCount)} Hóa đơn`);
        updateStatElement('drStatShippingValue', formatMoney(shippingAmount));

        updateStatElement('drStatFailCount', `${formatNumber(failControlCount)} Hóa đơn`);
        updateStatElement('drStatFailValue', formatMoney(failControlAmount));
    }

    function updateStatElement(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // =====================================================
    // RENDER PAGINATION
    // =====================================================
    function renderPagination() {
        const container = document.getElementById('drPagination');
        if (!container) return;

        const totalPages = Math.ceil(DeliveryReportState.totalCount / DeliveryReportState.pageSize);
        const currentPage = DeliveryReportState.currentPage;
        const totalCount = DeliveryReportState.totalCount;
        const pageSize = DeliveryReportState.pageSize;

        const startItem = (currentPage - 1) * pageSize + 1;
        const endItem = Math.min(currentPage * pageSize, totalCount);

        let pagesHtml = '';

        // First & Prev
        pagesHtml += `<button class="dr-page-btn" onclick="DeliveryReport.goToPage(1)" ${currentPage === 1 ? 'disabled' : ''} title="Trang đầu">&laquo;</button>`;
        pagesHtml += `<button class="dr-page-btn" onclick="DeliveryReport.goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} title="Trang trước">&lsaquo;</button>`;

        // Page numbers
        const range = getPageRange(currentPage, totalPages);
        range.forEach(p => {
            if (p === '...') {
                pagesHtml += `<span style="padding: 0 6px; color: #9ca3af;">...</span>`;
            } else {
                pagesHtml += `<button class="dr-page-btn ${p === currentPage ? 'active' : ''}" onclick="DeliveryReport.goToPage(${p})">${p}</button>`;
            }
        });

        // Next & Last
        pagesHtml += `<button class="dr-page-btn" onclick="DeliveryReport.goToPage(${currentPage + 1})" ${currentPage === totalPages || totalPages === 0 ? 'disabled' : ''} title="Trang sau">&rsaquo;</button>`;
        pagesHtml += `<button class="dr-page-btn" onclick="DeliveryReport.goToPage(${totalPages})" ${currentPage === totalPages || totalPages === 0 ? 'disabled' : ''} title="Trang cuối">&raquo;</button>`;

        container.innerHTML = `
            <div class="dr-pagination-pages">${pagesHtml}</div>
            <div class="dr-page-size">
                <select id="drPageSizeSelect" onchange="DeliveryReport.changePageSize(this.value)">
                    <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                    <option value="200" ${pageSize === 200 ? 'selected' : ''}>200</option>
                    <option value="500" ${pageSize === 500 ? 'selected' : ''}>500</option>
                    <option value="1000" ${pageSize === 1000 ? 'selected' : ''}>1000</option>
                </select>
                <span>Số dòng trên trang</span>
            </div>
            <div class="dr-page-info">${totalCount > 0 ? `${formatNumber(startItem)} - ${formatNumber(endItem)} của ${formatNumber(totalCount)} dòng` : 'Không có dữ liệu'}</div>
        `;
    }

    function getPageRange(current, total) {
        if (total <= 10) {
            return Array.from({ length: total }, (_, i) => i + 1);
        }

        const pages = [];
        pages.push(1);

        let start = Math.max(2, current - 3);
        let end = Math.min(total - 1, current + 3);

        if (start > 2) pages.push('...');
        for (let i = start; i <= end; i++) pages.push(i);
        if (end < total - 1) pages.push('...');

        pages.push(total);
        return pages;
    }

    // =====================================================
    // UI HELPERS
    // =====================================================
    function showLoading() {
        const tbody = document.getElementById('drTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="13" class="dr-loading"><div class="spinner"></div><div>Đang tải dữ liệu...</div></td></tr>`;
        }
        const tfoot = document.getElementById('drTableFoot');
        if (tfoot) tfoot.innerHTML = '';
    }

    function showError(message) {
        const tbody = document.getElementById('drTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="13" class="dr-empty"><i class="fas fa-exclamation-triangle" style="color:#ef4444;"></i>${escapeHtml(message)}</td></tr>`;
        }
    }

    function getShipStatusClass(status) {
        const map = {
            'none': 'none',
            'picking': 'picking',
            'shipping': 'shipping',
            'done': 'done',
            'returned': 'returned',
            'cancel': 'cancel'
        };
        return map[status] || 'none';
    }

    function getForControlText(item) {
        if (!item.ShipPaymentStatus && !item.CrossCheckTimes) return '';
        if (item.ShipPaymentStatus === 'done') return '<span style="color:#22c55e;font-weight:600;">Đã đối soát</span>';
        if (item.ShipPaymentStatus === 'fail') return '<span style="color:#ef4444;font-weight:600;">Không thành công</span>';
        return escapeHtml(item.ShipPaymentStatus || '');
    }

    // =====================================================
    // FORMAT HELPERS
    // =====================================================
    function formatMoney(amount) {
        if (!amount && amount !== 0) return '';
        return new Intl.NumberFormat('vi-VN').format(Math.round(amount));
    }

    function formatNumber(num) {
        if (!num && num !== 0) return '0';
        return new Intl.NumberFormat('vi-VN').format(num);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            const hours = String(d.getHours()).padStart(2, '0');
            const mins = String(d.getMinutes()).padStart(2, '0');
            return `${day}/${month}/${year}\n${hours}:${mins}`;
        } catch (e) {
            return dateStr;
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // =====================================================
    // EXCEL EXPORT
    // =====================================================
    async function exportExcel() {
        if (typeof XLSX === 'undefined') {
            alert('Thư viện XLSX chưa được tải. Vui lòng tải lại trang.');
            return;
        }

        const btn = document.getElementById('drBtnExport');
        if (btn) { btn.disabled = true; btn.textContent = 'Đang xuất...'; }

        try {
            // Use filtered data
            const items = getFilteredData();

            const wsData = [
                ['#', 'Khách hàng', 'ĐT Khách hàng', 'Người nhận', 'ĐT Người nhận', 'Địa chỉ', 'Ngày hóa đơn', 'Số', 'Tổng tiền', 'Giao hàng thu tiền', 'Đối tác GH', 'Tiền ship', 'Khối lượng (g)', 'Mã vận đơn', 'Trạng thái GH', 'Đối soát GH']
            ];

            items.forEach((item, i) => {
                wsData.push([
                    i + 1,
                    item.PartnerDisplayName || '',
                    item.Phone || '',
                    item.Ship_Receiver_Name || '',
                    item.Ship_Receiver_Phone || '',
                    item.FullAddress || item.Address || '',
                    item.DateInvoice ? new Date(item.DateInvoice).toLocaleString('vi-VN') : '',
                    item.Number || '',
                    item.AmountTotal || 0,
                    item.CashOnDelivery || 0,
                    item.CarrierName || '',
                    item.DeliveryPrice || 0,
                    item.ShipWeight || 0,
                    item.TrackingRef || '',
                    item.ShowShipStatus || '',
                    item.ShipPaymentStatus || ''
                ]);
            });

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Thống kê giao hàng');

            const now = new Date();
            const fileName = `ThongKeGiaoHang_${now.getDate()}-${now.getMonth()+1}-${now.getFullYear()}.xlsx`;
            XLSX.writeFile(wb, fileName);
        } catch (error) {
            console.error('[DELIVERY-REPORT] Export error:', error);
            alert('Lỗi khi xuất Excel: ' + error.message);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-excel"></i> Xuất excel'; }
        }
    }

    // =====================================================
    // TRA SOÁT - Barcode Scanner Mode
    // =====================================================
    let barcodeBuffer = '';
    let barcodeTimeout = null;

    function traSoat() {
        const state = DeliveryReportState;
        state.traSoatMode = !state.traSoatMode;

        const btn = document.getElementById('drBtnTraSoat');
        const bar = document.getElementById('drTraSoatBar');

        if (state.traSoatMode) {
            // Enter scan mode
            if (btn) {
                btn.classList.add('dr-btn-active');
                btn.innerHTML = '<i class="fas fa-times"></i> Tắt tra soát';
            }
            if (bar) bar.style.display = '';
            state.scannedNumbers = new Set();
            state.activeTab = 'all';
            state.currentPage = 1;
            updateTabUI();
            document.addEventListener('keydown', onBarcodeKeydown);
            renderTable();
            renderPagination();
            updateScanCount();
        } else {
            // Exit scan mode
            if (btn) {
                btn.classList.remove('dr-btn-active');
                btn.innerHTML = '<i class="fas fa-clipboard-check"></i> Tra soát';
            }
            if (bar) bar.style.display = 'none';

            // Hide province view if active
            const provinceView = document.getElementById('drProvinceView');
            if (provinceView) provinceView.style.display = 'none';
            const tableWrapper = document.getElementById('drTableWrapper');
            if (tableWrapper) tableWrapper.style.display = '';

            state.scannedNumbers = new Set();
            state.activeTab = 'all';
            state.currentPage = 1;
            document.removeEventListener('keydown', onBarcodeKeydown);
            renderTable();
            renderStats();
            renderPagination();
        }
    }

    async function setTab(tab) {
        DeliveryReportState.activeTab = tab;
        DeliveryReportState.currentPage = 1;
        updateTabUI();

        if (tab === 'province' && DeliveryReportState.traSoatMode) {
            await ensureProvinceGroups();
            renderProvinceView();
        } else {
            renderTable();
            renderPagination();
        }
        updateScanCount();
    }

    function updateTabUI() {
        const tabs = document.querySelectorAll('.dr-trasoat-tab');
        tabs.forEach(t => {
            t.classList.toggle('active', t.dataset.tab === DeliveryReportState.activeTab);
        });
    }

    function updateScanCount() {
        const countEl = document.getElementById('drScanCount');
        const totalEl = document.getElementById('drScanTotal');
        if (!countEl || !totalEl) return;

        const tabData = getTabFilteredData();
        const scanned = tabData.filter(item => DeliveryReportState.scannedNumbers.has(item.Number)).length;
        countEl.textContent = `Đã quét: ${formatNumber(scanned)}`;
        totalEl.textContent = formatNumber(tabData.length);
    }

    function getTabFilteredData() {
        let data = DeliveryReportState.allData || [];
        // Apply carrier filter from dropdown (normalized)
        const carrier = DeliveryReportState.filters.carrierId;
        if (carrier) {
            data = data.filter(item => normalizeCarrier(item.CarrierName) === carrier);
        }
        // Apply tab filter
        const tab = DeliveryReportState.activeTab;
        if (tab === 'city') {
            data = data.filter(item => normalizeCarrier(item.CarrierName) === 'THÀNH PHỐ');
        } else if (tab === 'province') {
            // Province = everything NOT city and NOT shop
            data = data.filter(item => {
                const nc = normalizeCarrier(item.CarrierName);
                return nc && nc !== 'THÀNH PHỐ' && nc !== 'BÁN HÀNG SHOP';
            });
        } else if (tab === 'shop') {
            data = data.filter(item => normalizeCarrier(item.CarrierName) === 'BÁN HÀNG SHOP');
        }
        return data;
    }

    // =====================================================
    // PROVINCE GROUPS - TOMATO/NAP Split + Firebase Persistence
    // =====================================================
    function getProvinceData() {
        let data = DeliveryReportState.allData || [];
        const carrier = DeliveryReportState.filters.carrierId;
        if (carrier) {
            data = data.filter(item => normalizeCarrier(item.CarrierName) === carrier);
        }
        // Province = everything NOT city and NOT shop
        return data.filter(item => {
            const nc = normalizeCarrier(item.CarrierName);
            return nc && nc !== 'THÀNH PHỐ' && nc !== 'BÁN HÀNG SHOP';
        });
    }

    function getFirestoreDB() {
        // Use shared getFirestore() which handles initialization
        if (typeof getFirestore === 'function') {
            return getFirestore();
        }
        // Fallback: direct Firebase access
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
            return firebase.firestore();
        }
        // Last resort: try to initialize
        if (typeof initializeFirestore === 'function') {
            return initializeFirestore();
        }
        console.warn('[DELIVERY-REPORT] Firestore not available');
        return null;
    }

    async function loadProvinceGroups() {
        const db = getFirestoreDB();
        if (!db) {
            console.warn('[DELIVERY-REPORT] No Firestore DB for loading province groups');
            return {};
        }

        try {
            const doc = await db.collection('delivery_report').doc('province_groups').get();
            if (doc.exists) {
                console.log('[DELIVERY-REPORT] Loaded province groups from Firestore');
                return doc.data().groups || {};
            }
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to load province groups:', e);
        }
        return {};
    }

    async function saveProvinceGroups(groups) {
        const db = getFirestoreDB();
        if (!db) {
            console.warn('[DELIVERY-REPORT] No Firestore DB for saving province groups');
            return;
        }

        try {
            await db.collection('delivery_report').doc('province_groups').set({
                groups: groups,
                lastUpdated: Date.now()
            }, { merge: true });
            console.log('[DELIVERY-REPORT] Province groups saved to Firestore');
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to save province groups:', e);
        }
    }

    async function ensureProvinceGroups() {
        const state = DeliveryReportState;
        const provinceData = getProvinceData();

        if (!provinceData.length) return;

        // Load saved groups from Firestore (once per session)
        if (!state._provinceGroupsLoaded) {
            state.provinceGroups = await loadProvinceGroups();
            state._provinceGroupsLoaded = true;
        }

        // Find items without group assignment
        const unassigned = provinceData.filter(item => !state.provinceGroups[item.Number]);

        if (unassigned.length > 0) {
            // Shuffle randomly
            const shuffled = [...unassigned].sort(() => Math.random() - 0.5);

            // Split 1:3 ratio (TOMATO gets 1/4, NAP gets 3/4)
            const tomatoCount = Math.max(1, Math.round(shuffled.length / 4));

            shuffled.forEach((item, index) => {
                state.provinceGroups[item.Number] = index < tomatoCount ? 'tomato' : 'nap';
            });

            await saveProvinceGroups(state.provinceGroups);
        }
    }

    // =====================================================
    // PROVINCE VIEW - 2-Column Layout (TOMATO / NAP)
    // =====================================================
    function renderProvinceView() {
        const view = document.getElementById('drProvinceView');
        const tableWrapper = document.getElementById('drTableWrapper');
        if (!view) return;

        // Show province view, hide table
        view.style.display = '';
        if (tableWrapper) tableWrapper.style.display = 'none';

        const provinceData = getTabFilteredData();
        const groups = DeliveryReportState.provinceGroups;
        const scanned = DeliveryReportState.scannedNumbers;

        // Auto-assign items without group (fallback if ensureProvinceGroups didn't run)
        const unassigned = provinceData.filter(item => !groups[item.Number]);
        if (unassigned.length > 0) {
            const shuffled = [...unassigned].sort(() => Math.random() - 0.5);
            const tomatoCount = Math.max(1, Math.round(shuffled.length / 4));
            shuffled.forEach((item, index) => {
                groups[item.Number] = index < tomatoCount ? 'tomato' : 'nap';
            });
            // Save in background (don't await)
            saveProvinceGroups(groups);
        }

        const tomatoItems = provinceData.filter(item => groups[item.Number] === 'tomato');
        const napItems = provinceData.filter(item => groups[item.Number] === 'nap');

        // Render TOMATO column
        const tomatoScanned = tomatoItems.filter(i => scanned.has(i.Number)).length;
        let tomatoHtml = `<div class="dr-province-header dr-province-header-tomato">
            TOMATO <span class="dr-province-count">${tomatoScanned}/${tomatoItems.length}</span>
        </div>`;
        tomatoItems.forEach(item => {
            const isScanned = scanned.has(item.Number);
            tomatoHtml += `<div class="dr-province-item ${isScanned ? 'scanned' : ''}">
                <div class="dr-province-left">
                    <span class="dr-province-num">${escapeHtml(item.Number)}</span>
                    <span class="dr-province-customer">${escapeHtml(item.PartnerDisplayName || '')}</span>
                </div>
                <div class="dr-province-right">
                    <span class="dr-province-amount">${formatMoney(item.AmountTotal)}</span>
                    ${isScanned ? '<i class="fas fa-check" style="color:#22c55e"></i>' : ''}
                </div>
            </div>`;
        });

        // Render NAP column
        const napScanned = napItems.filter(i => scanned.has(i.Number)).length;
        let napHtml = `<div class="dr-province-header dr-province-header-nap">
            NAP <span class="dr-province-count">${napScanned}/${napItems.length}</span>
        </div>`;
        napItems.forEach(item => {
            const isScanned = scanned.has(item.Number);
            napHtml += `<div class="dr-province-item ${isScanned ? 'scanned' : ''}">
                <div class="dr-province-left">
                    <span class="dr-province-num">${escapeHtml(item.Number)}</span>
                    <span class="dr-province-customer">${escapeHtml(item.PartnerDisplayName || '')}</span>
                </div>
                <div class="dr-province-right">
                    <span class="dr-province-amount">${formatMoney(item.AmountTotal)}</span>
                    ${isScanned ? '<i class="fas fa-check" style="color:#22c55e"></i>' : ''}
                </div>
            </div>`;
        });

        document.getElementById('drColTomato').innerHTML = tomatoHtml;
        document.getElementById('drColNap').innerHTML = napHtml;
    }

    function highlightProvinceColumn(column) {
        const colId = column === 'tomato' ? 'drColTomato' : 'drColNap';
        const colEl = document.getElementById(colId);
        if (!colEl) return;

        // Remove previous highlight
        document.querySelectorAll('.dr-province-col').forEach(el => el.classList.remove('highlight'));

        // Add highlight with animation
        colEl.classList.add('highlight');
        setTimeout(() => colEl.classList.remove('highlight'), 1500);
    }

    function onBarcodeKeydown(e) {
        // Ignore if focus is on an input/select
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

        if (e.key === 'Enter') {
            e.preventDefault();
            if (barcodeBuffer.length > 0) {
                processScan(barcodeBuffer.trim());
                barcodeBuffer = '';
            }
            return;
        }

        // Only accept printable characters
        if (e.key.length === 1) {
            barcodeBuffer += e.key;
            clearTimeout(barcodeTimeout);
            barcodeTimeout = setTimeout(() => { barcodeBuffer = ''; }, 500);
        }
    }

    function processScan(value) {
        console.log('[DELIVERY-REPORT] Scanned:', value);
        const state = DeliveryReportState;

        // Find matching item by Number
        const match = (state.allData || []).find(item => item.Number === value);
        if (!match) {
            showScanFeedback(false, `Không tìm thấy: ${value}`);
            return;
        }

        // Check if already scanned
        if (state.scannedNumbers.has(match.Number)) {
            showScanFeedback(false, `Đã quét rồi: ${value}`);
            return;
        }

        // Tab-aware scanning: check if item belongs to current tab
        if (state.activeTab !== 'all') {
            const normalizedCarrier = normalizeCarrier(match.CarrierName);
            let belongsToTab = false;

            const isCity = normalizedCarrier === 'THÀNH PHỐ';
            const isShop = normalizedCarrier === 'BÁN HÀNG SHOP';
            const isProvince = normalizedCarrier && !isCity && !isShop;

            if (state.activeTab === 'city' && isCity) belongsToTab = true;
            else if (state.activeTab === 'province' && isProvince) belongsToTab = true;
            else if (state.activeTab === 'shop' && isShop) belongsToTab = true;

            if (!belongsToTab) {
                let correctTab = 'khác';
                if (isCity) correctTab = 'Thành phố';
                else if (isProvince) correctTab = 'Tỉnh';
                else if (isShop) correctTab = 'Bán hàng shop';

                showScanFeedback(false, `${value} thuộc tab "${correctTab}"!`);
                return;
            }
        }

        // Mark as scanned
        state.scannedNumbers.add(match.Number);

        // Province tab: highlight column + render province view
        if (state.activeTab === 'province' && state.traSoatMode) {
            const group = state.provinceGroups[match.Number];
            if (group) {
                highlightProvinceColumn(group);
            }
            renderProvinceView();
        } else {
            renderTable();
            renderPagination();
        }

        updateScanCount();
        showScanFeedback(true, match.Number);
    }

    function showScanFeedback(success, value) {
        // Remove existing feedback
        const existing = document.getElementById('drScanFeedback');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.id = 'drScanFeedback';
        div.className = success ? 'dr-scan-feedback success' : 'dr-scan-feedback error';
        div.textContent = success ? `${value}` : `Không tìm thấy: ${value}`;
        document.body.appendChild(div);

        setTimeout(() => div.remove(), 2000);
    }

    // =====================================================
    // PUBLIC API
    // =====================================================
    window.DeliveryReport = {
        init: initDeliveryReport,
        search: () => {
            const oldFromDate = DeliveryReportState.filters.fromDate;
            const oldToDate = DeliveryReportState.filters.toDate;
            const oldKeyword = DeliveryReportState.filters.keyword;

            DeliveryReportState.currentPage = 1;
            collectFilters();
            saveFiltersToStorage();

            // Only re-fetch from API if date/keyword changed
            const needRefetch = oldFromDate !== DeliveryReportState.filters.fromDate ||
                oldToDate !== DeliveryReportState.filters.toDate ||
                oldKeyword !== DeliveryReportState.filters.keyword;

            if (needRefetch || !DeliveryReportState.allData.length) {
                fetchData();
            } else {
                // Carrier filter is client-side, just re-render
                renderTable();
                renderStats();
                renderPagination();
            }
        },
        goToPage: (page) => {
            const totalPages = Math.ceil(DeliveryReportState.totalCount / DeliveryReportState.pageSize);
            if (page < 1 || page > totalPages) return;
            DeliveryReportState.currentPage = page;
            // Client-side pagination: just re-render, no API call
            renderTable();
            renderPagination();
            document.getElementById('drTableWrapper')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        changePageSize: (size) => {
            DeliveryReportState.pageSize = parseInt(size, 10) || 200;
            DeliveryReportState.currentPage = 1;
            renderTable();
            renderPagination();
        },
        exportExcel: exportExcel,
        traSoat: traSoat,
        setTab: setTab,
        getState: () => DeliveryReportState
    };
})();
