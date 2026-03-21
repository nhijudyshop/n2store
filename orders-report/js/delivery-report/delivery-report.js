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
        data: [],
        totalCount: 0,
        currentPage: 1,
        pageSize: 50,
        isLoading: false,

        // Filter values
        filters: {
            fromDate: '',
            toDate: '',
            partnerId: '',
            carrierId: '',
            shipState: '',
            forControl: '',
            deliveryType: '',
            companyId: '',
            cityCode: '',
            keyword: ''
        },

        // Column visibility
        columns: {
            index: true,
            customer: true,
            receiverInfo: true,
            dateInvoice: true,
            number: true,
            amountTotal: true,
            cashOnDelivery: true,
            carrierName: true,
            deliveryPrice: true,
            shipWeight: true,
            trackingRef: true,
            showShipStatus: true,
            forControlStatus: true
        }
    };

    // =====================================================
    // INITIALIZATION
    // =====================================================
    function initDeliveryReport() {
        setDefaultDates();
        bindFilterEvents();
        bindColumnToggle();
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
        f.partnerId = document.getElementById('drFilterPartner')?.value || '';
        f.carrierId = document.getElementById('drFilterCarrier')?.value || '';
        f.shipState = document.getElementById('drFilterShipState')?.value || '';
        f.forControl = document.getElementById('drFilterForControl')?.value || '';
        f.deliveryType = document.getElementById('drFilterDeliveryType')?.value || '';
        f.companyId = document.getElementById('drFilterCompany')?.value || '';
        f.cityCode = document.getElementById('drFilterCity')?.value || '';
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
                if (f.partnerId) document.getElementById('drFilterPartner').value = f.partnerId;
                if (f.carrierId) document.getElementById('drFilterCarrier').value = f.carrierId;
                if (f.shipState) document.getElementById('drFilterShipState').value = f.shipState;
                if (f.forControl) document.getElementById('drFilterForControl').value = f.forControl;
                if (f.deliveryType) document.getElementById('drFilterDeliveryType').value = f.deliveryType;
                if (f.companyId) document.getElementById('drFilterCompany').value = f.companyId;
                if (f.cityCode) document.getElementById('drFilterCity').value = f.cityCode;
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
    // API FETCH
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
            DeliveryReportState.data = result.value || [];
            DeliveryReportState.totalCount = result['@odata.count'] || 0;

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

        params.set('PartnerId', f.partnerId);
        params.set('CarrierId', f.carrierId);
        params.set('ShipState', f.shipState);
        params.set('ForControl', f.forControl);
        params.set('DeliveryType', f.deliveryType);
        params.set('CompanyId', f.companyId);
        params.set('CityCode', f.cityCode);
        params.set('Q', f.keyword);

        // Paging
        params.set('$top', DeliveryReportState.pageSize);
        if (DeliveryReportState.currentPage > 1) {
            params.set('$skip', (DeliveryReportState.currentPage - 1) * DeliveryReportState.pageSize);
        }

        // Sort
        params.set('$orderby', 'DateInvoice desc,Number desc,Id desc');
        params.set('$count', 'true');

        return `${WORKER_URL}/api/odata/Report/DeliveryReport?${params.toString()}`;
    }

    // =====================================================
    // RENDER TABLE
    // =====================================================
    function renderTable() {
        const tbody = document.getElementById('drTableBody');
        const tfoot = document.getElementById('drTableFoot');
        if (!tbody) return;

        const data = DeliveryReportState.data;

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="13" class="dr-empty"><i class="fas fa-inbox"></i>Không có dữ liệu</td></tr>`;
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        const startIndex = (DeliveryReportState.currentPage - 1) * DeliveryReportState.pageSize;

        let html = '';
        let totalAmount = 0;
        let totalCOD = 0;
        let totalShipPrice = 0;

        data.forEach((item, i) => {
            totalAmount += item.AmountTotal || 0;
            totalCOD += item.CashOnDelivery || 0;
            totalShipPrice += item.DeliveryPrice || 0;

            const shipStatusClass = getShipStatusClass(item.ShipStatus);
            const forControlText = getForControlText(item);

            html += `<tr>
                <td data-col="index">${startIndex + i + 1}</td>
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
                <td data-col="number">${escapeHtml(item.Number || '')}</td>
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

        // Footer totals
        if (tfoot) {
            tfoot.innerHTML = `<tr>
                <td data-col="index"></td>
                <td data-col="customer"><strong>Tổng: ${formatNumber(DeliveryReportState.totalCount)}</strong></td>
                <td data-col="receiverInfo"></td>
                <td data-col="dateInvoice"></td>
                <td data-col="number"></td>
                <td data-col="amountTotal" class="dr-money"><strong>${formatMoney(totalAmount)}</strong></td>
                <td data-col="cashOnDelivery" class="dr-money"><strong>${formatMoney(totalCOD)}</strong></td>
                <td data-col="carrierName"></td>
                <td data-col="deliveryPrice" class="dr-money"><strong>${formatMoney(totalShipPrice)}</strong></td>
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
        const data = DeliveryReportState.data;
        const totalCount = DeliveryReportState.totalCount;

        // Calculate stats from current page data (approximation)
        // For accurate totals, we'd need a separate summary API or compute from all pages
        let totalCOD = 0;
        let paidCount = 0;
        let paidAmount = 0;
        let returnCount = 0;
        let returnAmount = 0;
        let shippingCount = 0;
        let shippingAmount = 0;
        let failControlCount = 0;
        let failControlAmount = 0;

        // We compute basic stats from the visible data
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
                    <option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option>
                    <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
                    <option value="200" ${pageSize === 200 ? 'selected' : ''}>200</option>
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

        // Fetch all data (without paging) for export
        const btn = document.getElementById('drBtnExport');
        if (btn) { btn.disabled = true; btn.textContent = 'Đang xuất...'; }

        try {
            const token = await getToken();
            const f = DeliveryReportState.filters;
            const params = new URLSearchParams();
            if (f.fromDate) params.set('FromDate', new Date(f.fromDate).toISOString());
            if (f.toDate) params.set('ToDate', new Date(f.toDate).toISOString());
            params.set('PartnerId', f.partnerId);
            params.set('CarrierId', f.carrierId);
            params.set('ShipState', f.shipState);
            params.set('ForControl', f.forControl);
            params.set('DeliveryType', f.deliveryType);
            params.set('CompanyId', f.companyId);
            params.set('CityCode', f.cityCode);
            params.set('Q', f.keyword);
            params.set('$top', '10000');
            params.set('$orderby', 'DateInvoice desc,Number desc,Id desc');

            const url = `${WORKER_URL}/api/odata/Report/DeliveryReport?${params.toString()}`;
            const resp = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1'
                }
            });

            const result = await resp.json();
            const items = result.value || [];

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
    // PUBLIC API
    // =====================================================
    window.DeliveryReport = {
        init: initDeliveryReport,
        search: () => {
            DeliveryReportState.currentPage = 1;
            collectFilters();
            saveFiltersToStorage();
            fetchData();
        },
        goToPage: (page) => {
            const totalPages = Math.ceil(DeliveryReportState.totalCount / DeliveryReportState.pageSize);
            if (page < 1 || page > totalPages) return;
            DeliveryReportState.currentPage = page;
            fetchData();
            // Scroll to top of table
            document.getElementById('drTableWrapper')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        changePageSize: (size) => {
            DeliveryReportState.pageSize = parseInt(size, 10) || 50;
            DeliveryReportState.currentPage = 1;
            fetchData();
        },
        exportExcel: exportExcel,
        getState: () => DeliveryReportState
    };
})();
