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
        scanFilter: 'unscanned', // 'unscanned' | 'scanned'
        provinceGroups: {}, // { Number: 'tomato' | 'nap' }
        _provinceGroupsLoaded: false,
        lastScannedColumn: null, // 'tomato' | 'nap'
        _scannedListener: null,
        _groupsListener: null,

        // Filter values
        filters: {
            fromDate: '',
            toDate: '',
            keyword: ''
        },

        // Column visibility (default: only key columns visible)
        columns: {
            index: true,
            customer: true,
            receiverInfo: false,
            dateInvoice: true,
            number: true,
            amountTotal: false,
            cashOnDelivery: true,
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
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const fromDateInput = document.getElementById('drFilterFromDate');
        const fromTimeInput = document.getElementById('drFilterFromTime');
        const toDateInput = document.getElementById('drFilterToDate');
        const toTimeInput = document.getElementById('drFilterToTime');

        if (fromDateInput && !fromDateInput.value) {
            fromDateInput.value = todayStr;
        }
        if (fromTimeInput && !fromTimeInput.value) {
            fromTimeInput.value = '00:00';
        }
        if (toDateInput && !toDateInput.value) {
            toDateInput.value = todayStr;
        }
        if (toTimeInput && !toTimeInput.value) {
            toTimeInput.value = '23:59';
        }

        DeliveryReportState.filters.fromDate = `${fromDateInput.value}T${fromTimeInput.value}`;
        DeliveryReportState.filters.toDate = `${toDateInput.value}T${toTimeInput.value}`;
    }

    // =====================================================
    // FILTER EVENTS
    // =====================================================
    function bindFilterEvents() {
        // Search button is handled by onclick="DeliveryReport.search()" in HTML

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
        const fromDate = document.getElementById('drFilterFromDate')?.value || '';
        const fromTime = document.getElementById('drFilterFromTime')?.value || '00:00';
        const toDate = document.getElementById('drFilterToDate')?.value || '';
        const toTime = document.getElementById('drFilterToTime')?.value || '23:59';
        f.fromDate = fromDate ? `${fromDate}T${fromTime}` : '';
        f.toDate = toDate ? `${toDate}T${toTime}` : '';
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
                // Only restore keyword, not dates (dates always default to today)
                if (f.keyword) {
                    DeliveryReportState.filters.keyword = f.keyword;
                    document.getElementById('drFilterKeyword').value = f.keyword;
                }
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

            // Debug: check DeliveryNote field
            const withNote = DeliveryReportState.allData.filter(i => i.DeliveryNote);
            console.log('[DELIVERY-REPORT] Items with DeliveryNote:', withNote.length, withNote.map(i => ({ Number: i.Number, DeliveryNote: i.DeliveryNote })));
            const returnItems = DeliveryReportState.allData.filter(i => isReturnItem(i));
            console.log('[DELIVERY-REPORT] Return items (THU VE):', returnItems.length, returnItems.map(i => ({ Number: i.Number, DeliveryNote: i.DeliveryNote })));

            await ensureProvinceGroups();
            renderTable();
            renderStats();
            renderPagination();
            if (DeliveryReportState.traSoatMode) {
                updateScanCount();
            }
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


    // =====================================================
    // CLIENT-SIDE FILTER (carrier + tra soát)
    // =====================================================
    function getFilteredData() {
        const state = DeliveryReportState;

        if (state.traSoatMode) {
            // In tra soát mode: use tab filter + scan filter
            let data = getTabFilteredData();
            if (state.scanFilter === 'unscanned') {
                data = data.filter(item => !state.scannedNumbers.has(item.Number));
            } else {
                data = data.filter(item => state.scannedNumbers.has(item.Number));
            }
            return data;
        }

        // Normal mode: no additional filter
        return state.allData || [];
    }

    // =====================================================
    // RENDER TABLE
    // =====================================================
    function renderTable() {
        // Multi-column views in tra soát mode
        if (DeliveryReportState.traSoatMode && DeliveryReportState.activeTab === 'province') {
            renderProvinceView();
            return;
        }
        if (DeliveryReportState.traSoatMode && DeliveryReportState.activeTab === 'all') {
            renderAllGroupsView();
            return;
        }

        // Ensure normal table is visible
        const provinceView = document.getElementById('drProvinceView');
        const tableWrapper = document.getElementById('drTableWrapper');
        const grid = document.getElementById('drProvinceGrid');
        if (provinceView) provinceView.style.display = 'none';
        if (grid) grid.classList.remove('all-groups');
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
                ${DeliveryReportState.traSoatMode && DeliveryReportState.scanFilter === 'scanned' ? `<td class="dr-unscan-cell"><button class="dr-btn-unscan" onclick="DeliveryReport.unscanItem('${escapeHtml(item.Number)}')" title="Xóa quét"><i class="fas fa-times"></i></button></td>` : ''}
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
    // Tab name mapping for filenames and sheet names
    const TAB_LABELS = {
        city: { name: 'ThanhPho', sheet: 'Thành phố' },
        province: { name: 'Tinh', sheet: 'Tỉnh' },
        shop: { name: 'BanHangShop', sheet: 'Bán hàng shop' },
        return: { name: 'ThuVe', sheet: 'Thu về' },
        all: { name: 'TatCa', sheet: 'Tất cả' }
    };

    function buildExcelRows(items) {
        const wsData = [['#', 'Số', 'Khách hàng', 'ĐT', 'Địa chỉ', 'Công nợ']];
        items.forEach((item, i) => {
            wsData.push([
                i + 1,
                item.Number || '',
                item.PartnerDisplayName || '',
                item.Phone || '',
                item.Address || '',
                item.CashOnDelivery || 0
            ]);
        });
        const total = items.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);
        wsData.push(['', '', '', '', 'Tổng:', total]);
        return wsData;
    }

    function autoFitColumns(ws, wsData) {
        const cols = wsData[0].map((_, colIdx) => {
            let maxLen = 0;
            for (const row of wsData) {
                const val = row[colIdx];
                const len = val != null ? String(val).length : 0;
                if (len > maxLen) maxLen = len;
            }
            return { wch: Math.max(maxLen + 2, 4) };
        });
        ws['!cols'] = cols;
    }

    function makeFileName(label) {
        const now = new Date();
        return `GiaoHang_${label}_${now.getDate()}-${now.getMonth()+1}-${now.getFullYear()}.xlsx`;
    }

    async function exportExcel() {
        if (typeof XLSX === 'undefined') {
            alert('Thư viện XLSX chưa được tải. Vui lòng tải lại trang.');
            return;
        }

        const btn = document.getElementById('drBtnExport');
        if (btn) { btn.disabled = true; btn.textContent = 'Đang xuất...'; }

        try {
            const state = DeliveryReportState;
            const tab = state.traSoatMode ? state.activeTab : 'all';
            const tabInfo = TAB_LABELS[tab] || TAB_LABELS.all;

            if (tab === 'province' && state.traSoatMode) {
                // Tỉnh tab: export 2 sheets (TOMATO + NAP)
                exportExcelProvinceAll();
                return;
            }

            if (tab === 'all' && state.traSoatMode) {
                // Tất cả tab: export 5 sheets
                exportExcelAllGroups();
                return;
            }

            const items = state.traSoatMode ? getTabFilteredData() : (state.allData || []);
            const wsData = buildExcelRows(items);

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            autoFitColumns(ws, wsData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, tabInfo.sheet);
            XLSX.writeFile(wb, makeFileName(tabInfo.name));
        } catch (error) {
            console.error('[DELIVERY-REPORT] Export error:', error);
            alert('Lỗi khi xuất Excel: ' + error.message);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-excel"></i> Xuất excel'; }
        }
    }

    function exportExcelProvinceAll() {
        const provinceData = getTabFilteredData();
        const groups = DeliveryReportState.provinceGroups;
        const tomatoItems = provinceData.filter(item => groups[item.Number] === 'tomato');
        const napItems = provinceData.filter(item => groups[item.Number] === 'nap');

        const wb = XLSX.utils.book_new();
        const tomatoRows = buildExcelRows(tomatoItems);
        const tomatoWs = XLSX.utils.aoa_to_sheet(tomatoRows);
        autoFitColumns(tomatoWs, tomatoRows);
        const napRows = buildExcelRows(napItems);
        const napWs = XLSX.utils.aoa_to_sheet(napRows);
        autoFitColumns(napWs, napRows);
        XLSX.utils.book_append_sheet(wb, tomatoWs, 'TOMATO');
        XLSX.utils.book_append_sheet(wb, napWs, 'NAP');
        XLSX.writeFile(wb, makeFileName('Tinh_TOMATO_NAP'));
    }

    function exportExcelProvince(group) {
        if (typeof XLSX === 'undefined') {
            alert('Thư viện XLSX chưa được tải. Vui lòng tải lại trang.');
            return;
        }

        const provinceData = getTabFilteredData();
        const groups = DeliveryReportState.provinceGroups;
        const items = provinceData.filter(item => groups[item.Number] === group);
        const label = group.toUpperCase();

        const wsData = buildExcelRows(items);
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        autoFitColumns(ws, wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, label);
        XLSX.writeFile(wb, makeFileName(label));
    }

    function exportExcelAllGroups() {
        const allData = DeliveryReportState.allData || [];
        const wb = XLSX.utils.book_new();
        const groupKeys = ['tomato', 'nap', 'city', 'shop', 'return'];

        groupKeys.forEach(key => {
            const items = allData.filter(item => getItemGroup(item) === key);
            if (items.length === 0) return;
            const rows = buildExcelRows(items);
            const ws = XLSX.utils.aoa_to_sheet(rows);
            autoFitColumns(ws, rows);
            XLSX.utils.book_append_sheet(wb, ws, GROUP_LABELS[key]);
        });

        XLSX.writeFile(wb, makeFileName('TatCa_5Nhom'));
    }

    function exportExcelGroup(group) {
        if (typeof XLSX === 'undefined') {
            alert('Thư viện XLSX chưa được tải. Vui lòng tải lại trang.');
            return;
        }
        const allData = DeliveryReportState.allData || [];
        const items = allData.filter(item => getItemGroup(item) === group);
        const label = GROUP_LABELS[group] || group.toUpperCase();

        const wsData = buildExcelRows(items);
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        autoFitColumns(ws, wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, label);
        XLSX.writeFile(wb, makeFileName(label.replace(/\s+/g, '_')));
    }

    // =====================================================
    // TRA SOÁT - Barcode Scanner Mode
    // =====================================================
    let barcodeBuffer = '';
    let barcodeTimeout = null;
    const soundError = new Audio('sound/sai.mp3');
    const soundDuplicate = new Audio('sound/trung.mp3');

    async function traSoat() {
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
            state.activeTab = 'all';
            state.scanFilter = 'unscanned';
            state.currentPage = 1;

            // Load scanned numbers + province groups from server + setup cross-machine sync
            await loadScannedNumbers();
            await ensureProvinceGroups();
            setupRealtimeSync();

            updateTabUI();
            updateProvinceExportButtons();
            document.addEventListener('keydown', onBarcodeKeydown);
            renderAllGroupsView();
            updateScanCount();
        } else {
            // Exit scan mode
            if (btn) {
                btn.classList.remove('dr-btn-active');
                btn.innerHTML = '<i class="fas fa-clipboard-check"></i> Tra soát';
            }
            if (bar) bar.style.display = 'none';

            // Hide province/all-groups view if active
            const provinceView = document.getElementById('drProvinceView');
            if (provinceView) provinceView.style.display = 'none';
            const grid = document.getElementById('drProvinceGrid');
            if (grid) grid.classList.remove('all-groups');
            const tableWrapper = document.getElementById('drTableWrapper');
            if (tableWrapper) tableWrapper.style.display = '';

            // Teardown cross-machine sync
            teardownRealtimeSync();

            state.scannedNumbers = new Set();
            state.activeTab = 'all';
            state.scanFilter = 'unscanned';
            state.currentPage = 1;
            document.removeEventListener('keydown', onBarcodeKeydown);
            updateProvinceExportButtons();
            renderTable();
            renderStats();
            renderPagination();
        }
    }

    async function setTab(tab) {
        DeliveryReportState.activeTab = tab;
        DeliveryReportState.currentPage = 1;
        updateTabUI();
        updateProvinceExportButtons();

        if (tab === 'province' && DeliveryReportState.traSoatMode) {
            await ensureProvinceGroups();
            renderProvinceView();
        } else if (tab === 'all' && DeliveryReportState.traSoatMode) {
            await ensureProvinceGroups();
            renderAllGroupsView();
        } else {
            renderTable();
            renderPagination();
        }
        updateScanCount();
    }

    function updateProvinceExportButtons() {
        const tomatoBtn = document.getElementById('drBtnExportTomato');
        const napBtn = document.getElementById('drBtnExportNap');
        const isProvince = DeliveryReportState.activeTab === 'province' && DeliveryReportState.traSoatMode;
        if (tomatoBtn) tomatoBtn.style.display = isProvince ? '' : 'none';
        if (napBtn) napBtn.style.display = isProvince ? '' : 'none';
    }

    function setScanFilter(filter) {
        DeliveryReportState.scanFilter = filter;
        DeliveryReportState.currentPage = 1;

        // Update UI
        const select = document.getElementById('drScanFilterSelect');
        if (select) select.value = filter;

        // Show/hide "Xóa tất cả" button
        const unscanAllBtn = document.getElementById('drBtnUnscanAll');
        if (unscanAllBtn) unscanAllBtn.style.display = filter === 'scanned' ? '' : 'none';

        if (DeliveryReportState.activeTab === 'province' && DeliveryReportState.traSoatMode) {
            renderProvinceView();
        } else if (DeliveryReportState.activeTab === 'all' && DeliveryReportState.traSoatMode) {
            renderAllGroupsView();
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
        const amountEl = document.getElementById('drScanTotalAmount');
        if (!countEl || !totalEl) return;

        const tabData = getTabFilteredData();
        const scannedItems = tabData.filter(item => DeliveryReportState.scannedNumbers.has(item.Number));
        countEl.textContent = `Đã quét: ${formatNumber(scannedItems.length)}`;
        totalEl.textContent = formatNumber(tabData.length);

        // Show total amount for current view (scanned or unscanned)
        if (amountEl) {
            const showScanned = DeliveryReportState.scanFilter === 'scanned';
            const viewItems = showScanned
                ? scannedItems
                : tabData.filter(item => !DeliveryReportState.scannedNumbers.has(item.Number));
            const totalCOD = viewItems.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);
            amountEl.textContent = `CN: ${formatMoney(totalCOD)}`;
        }
    }

    function removeTones(str) {
        return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    }

    function isReturnItem(item) {
        return removeTones(item.DeliveryNote || '').toUpperCase().includes('THU VE');
    }

    // Determine which group an item belongs to (for "all" tab 5-column view)
    function getItemGroup(item) {
        if (isReturnItem(item)) return 'return';
        const nc = normalizeCarrier(item.CarrierName);
        if (nc === 'THÀNH PHỐ') return 'city';
        if (nc === 'BÁN HÀNG SHOP') return 'shop';
        return DeliveryReportState.provinceGroups[item.Number] || 'nap';
    }

    const GROUP_COL_MAP = {
        tomato: 'drColTomato', nap: 'drColNap',
        city: 'drColCity', shop: 'drColShop', return: 'drColReturn'
    };

    const GROUP_LABELS = {
        tomato: 'TOMATO', nap: 'NAP',
        city: 'THÀNH PHỐ', shop: 'BÁN HÀNG SHOP', return: 'THU VỀ'
    };

    const GROUP_HEADER_CLASS = {
        tomato: 'dr-province-header-tomato', nap: 'dr-province-header-nap',
        city: 'dr-province-header-city', shop: 'dr-province-header-shop',
        return: 'dr-province-header-return'
    };

    function getTabFilteredData() {
        let data = DeliveryReportState.allData || [];
        // Apply tab filter
        const tab = DeliveryReportState.activeTab;
        if (tab === 'city') {
            data = data.filter(item => normalizeCarrier(item.CarrierName) === 'THÀNH PHỐ' && !isReturnItem(item));
        } else if (tab === 'province') {
            data = data.filter(item => {
                const nc = normalizeCarrier(item.CarrierName);
                return nc && nc !== 'THÀNH PHỐ' && nc !== 'BÁN HÀNG SHOP' && !isReturnItem(item);
            });
        } else if (tab === 'shop') {
            data = data.filter(item => normalizeCarrier(item.CarrierName) === 'BÁN HÀNG SHOP' && !isReturnItem(item));
        } else if (tab === 'return') {
            data = data.filter(item => isReturnItem(item));
        }
        return data;
    }

    // =====================================================
    // PROVINCE GROUPS - TOMATO/NAP Split + Firebase Persistence
    // =====================================================
    function getProvinceData() {
        const data = DeliveryReportState.allData || [];
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

    // =====================================================
    // SCANNED NUMBERS - Firestore Sync
    // =====================================================
    async function loadScannedNumbers() {
        const db = getFirestoreDB();
        if (!db) return;

        try {
            const doc = await db.collection('delivery_report').doc('scanned_numbers').get();
            if (doc.exists) {
                const numbers = doc.data().numbers || [];
                DeliveryReportState.scannedNumbers = new Set(numbers);
            }
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to load scanned numbers:', e);
        }
    }

    function saveScannedNumbers() {
        const db = getFirestoreDB();
        if (!db) return;

        db.collection('delivery_report').doc('scanned_numbers').set({
            numbers: [...DeliveryReportState.scannedNumbers],
            lastUpdated: Date.now()
        }).catch(e => console.warn('[DELIVERY-REPORT] Failed to save scanned numbers:', e));
    }

    function unscanItem(number) {
        DeliveryReportState.scannedNumbers.delete(number);
        saveScannedNumbers();
        refreshTraSoatView();
    }

    function unscanAllTab() {
        const tabData = getTabFilteredData();
        tabData.forEach(item => {
            DeliveryReportState.scannedNumbers.delete(item.Number);
        });
        saveScannedNumbers();
        refreshTraSoatView();
    }

    // =====================================================
    // REALTIME SYNC - Cross-machine sync via Firestore listeners
    // =====================================================
    function setupRealtimeSync() {
        const db = getFirestoreDB();
        if (!db) return;

        // Listen for scanned numbers changes from other machines
        DeliveryReportState._scannedListener = db.collection('delivery_report')
            .doc('scanned_numbers')
            .onSnapshot(doc => {
                if (!doc.exists || !DeliveryReportState.traSoatMode) return;
                const numbers = doc.data().numbers || [];
                DeliveryReportState.scannedNumbers = new Set(numbers);
                refreshTraSoatView();
            });

        // Listen for province groups changes from other machines
        DeliveryReportState._groupsListener = db.collection('delivery_report')
            .doc('province_groups')
            .onSnapshot(doc => {
                if (!doc.exists) return;
                DeliveryReportState.provinceGroups = doc.data().groups || {};
                DeliveryReportState._provinceGroupsLoaded = true;
                if (DeliveryReportState.traSoatMode) {
                    if (DeliveryReportState.activeTab === 'province') {
                        renderProvinceView();
                        updateScanCount();
                    } else if (DeliveryReportState.activeTab === 'all') {
                        renderAllGroupsView();
                        updateScanCount();
                    }
                }
            });
    }

    function teardownRealtimeSync() {
        if (DeliveryReportState._scannedListener) {
            DeliveryReportState._scannedListener();
            DeliveryReportState._scannedListener = null;
        }
        if (DeliveryReportState._groupsListener) {
            DeliveryReportState._groupsListener();
            DeliveryReportState._groupsListener = null;
        }
    }

    function refreshTraSoatView() {
        if (!DeliveryReportState.traSoatMode) return;
        if (DeliveryReportState.activeTab === 'province') {
            renderProvinceView();
        } else if (DeliveryReportState.activeTab === 'all') {
            renderAllGroupsView();
        } else {
            renderTable();
            renderPagination();
        }
        updateScanCount();
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
            // Sort by price ascending - smallest goes to TOMATO
            const sorted = [...unassigned].sort((a, b) => (a.AmountTotal || 0) - (b.AmountTotal || 0));

            // 1/4 cheapest → TOMATO, 3/4 rest → NAP
            const tomatoCount = Math.max(1, Math.round(sorted.length / 4));

            sorted.forEach((item, index) => {
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
        const grid = document.getElementById('drProvinceGrid');
        const tableWrapper = document.getElementById('drTableWrapper');
        if (!view) return;

        // Show province view (2-column), hide table + extra columns
        view.style.display = '';
        if (grid) grid.classList.remove('all-groups');
        if (tableWrapper) tableWrapper.style.display = 'none';
        // Hide city/shop/return columns (only used in "all" tab)
        ['drColCity', 'drColShop', 'drColReturn'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        const provinceData = getTabFilteredData();
        const groups = DeliveryReportState.provinceGroups;
        const scanned = DeliveryReportState.scannedNumbers;

        // Auto-assign items without group (fallback if ensureProvinceGroups didn't run)
        const unassigned = provinceData.filter(item => !groups[item.Number]);
        if (unassigned.length > 0) {
            const sorted = [...unassigned].sort((a, b) => (a.AmountTotal || 0) - (b.AmountTotal || 0));
            const tomatoCount = Math.max(1, Math.round(sorted.length / 4));
            sorted.forEach((item, index) => {
                groups[item.Number] = index < tomatoCount ? 'tomato' : 'nap';
            });
            saveProvinceGroups(groups);
        }

        const allTomato = provinceData.filter(item => groups[item.Number] === 'tomato');
        const allNap = provinceData.filter(item => groups[item.Number] === 'nap');

        // Count scanned for display
        const tomatoScannedCount = allTomato.filter(i => scanned.has(i.Number)).length;
        const napScannedCount = allNap.filter(i => scanned.has(i.Number)).length;

        // Apply scan filter
        const showScanned = DeliveryReportState.scanFilter === 'scanned';
        const tomatoItems = allTomato.filter(item => showScanned ? scanned.has(item.Number) : !scanned.has(item.Number));
        const napItems = allNap.filter(item => showScanned ? scanned.has(item.Number) : !scanned.has(item.Number));

        // Calculate COD totals for current view (filtered by scan status)
        const tomatoCOD = tomatoItems.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);
        const napCOD = napItems.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);

        // Render TOMATO column
        let tomatoHtml = `<div class="dr-province-header dr-province-header-tomato">
            TOMATO <span class="dr-province-count">${tomatoScannedCount}/${allTomato.length}</span>
            <div class="dr-province-total">${formatMoney(tomatoCOD)}</div>
        </div>`;
        tomatoItems.forEach(item => {
            const isScanned = scanned.has(item.Number);
            tomatoHtml += `<div class="dr-province-item ${isScanned ? 'scanned' : ''}">
                <div class="dr-province-left">
                    <span class="dr-province-num">${escapeHtml(item.Number)}</span>
                    <span class="dr-province-customer">${escapeHtml(item.PartnerDisplayName || '')}</span>
                </div>
                <div class="dr-province-right">
                    <span class="dr-province-date">${formatDate(item.DateInvoice)}</span>
                    <span class="dr-province-amount">${formatMoney(item.CashOnDelivery || 0)}</span>
                    ${showScanned ? `<button class="dr-btn-unscan" onclick="DeliveryReport.unscanItem('${escapeHtml(item.Number)}')" title="Xóa quét"><i class="fas fa-times"></i></button>` : ''}
                </div>
            </div>`;
        });
        if (tomatoItems.length === 0) {
            tomatoHtml += `<div class="dr-province-item" style="justify-content:center;color:#9ca3af;padding:20px;">Không có dữ liệu</div>`;
        }

        // Render NAP column
        let napHtml = `<div class="dr-province-header dr-province-header-nap">
            NAP <span class="dr-province-count">${napScannedCount}/${allNap.length}</span>
            <div class="dr-province-total">${formatMoney(napCOD)}</div>
        </div>`;
        napItems.forEach(item => {
            const isScanned = scanned.has(item.Number);
            napHtml += `<div class="dr-province-item ${isScanned ? 'scanned' : ''}">
                <div class="dr-province-left">
                    <span class="dr-province-num">${escapeHtml(item.Number)}</span>
                    <span class="dr-province-customer">${escapeHtml(item.PartnerDisplayName || '')}</span>
                </div>
                <div class="dr-province-right">
                    <span class="dr-province-date">${formatDate(item.DateInvoice)}</span>
                    <span class="dr-province-amount">${formatMoney(item.CashOnDelivery || 0)}</span>
                    ${showScanned ? `<button class="dr-btn-unscan" onclick="DeliveryReport.unscanItem('${escapeHtml(item.Number)}')" title="Xóa quét"><i class="fas fa-times"></i></button>` : ''}
                </div>
            </div>`;
        });
        if (napItems.length === 0) {
            napHtml += `<div class="dr-province-item" style="justify-content:center;color:#9ca3af;padding:20px;">Không có dữ liệu</div>`;
        }

        document.getElementById('drColTomato').innerHTML = tomatoHtml;
        document.getElementById('drColNap').innerHTML = napHtml;
    }

    // =====================================================
    // ALL GROUPS VIEW - 5-Column Layout (TOMATO/NAP/CITY/SHOP/RETURN)
    // =====================================================
    function renderAllGroupsView() {
        const view = document.getElementById('drProvinceView');
        const grid = document.getElementById('drProvinceGrid');
        const tableWrapper = document.getElementById('drTableWrapper');
        if (!view) return;

        view.style.display = '';
        if (tableWrapper) tableWrapper.style.display = 'none';
        if (grid) grid.classList.add('all-groups');

        const allData = DeliveryReportState.allData || [];
        const groups = DeliveryReportState.provinceGroups;
        const scanned = DeliveryReportState.scannedNumbers;
        const showScanned = DeliveryReportState.scanFilter === 'scanned';

        // Classify all items into 5 groups
        const grouped = { tomato: [], nap: [], city: [], shop: [], return: [] };
        allData.forEach(item => {
            const g = getItemGroup(item);
            if (grouped[g]) grouped[g].push(item);
        });

        // Render each column
        const groupKeys = ['tomato', 'nap', 'city', 'shop', 'return'];
        groupKeys.forEach(key => {
            const colEl = document.getElementById(GROUP_COL_MAP[key]);
            if (!colEl) return;
            colEl.style.display = '';

            const allItems = grouped[key];
            const scannedItems = allItems.filter(i => scanned.has(i.Number));
            const viewItems = allItems.filter(item =>
                showScanned ? scanned.has(item.Number) : !scanned.has(item.Number)
            );
            const totalCOD = viewItems.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);

            let html = `<div class="dr-province-header ${GROUP_HEADER_CLASS[key]}">
                ${GROUP_LABELS[key]} <span class="dr-province-count">${scannedItems.length}/${allItems.length}</span>
                <button class="dr-group-export-btn" onclick="DeliveryReport.exportExcelGroup('${key}')" title="Xuất Excel ${GROUP_LABELS[key]}"><i class="fas fa-file-excel"></i> Xuất</button>
                <div class="dr-province-total">${formatMoney(totalCOD)}</div>
            </div>`;

            viewItems.forEach(item => {
                const isItemScanned = scanned.has(item.Number);
                html += `<div class="dr-province-item ${isItemScanned ? 'scanned' : ''}">
                    <div class="dr-province-left">
                        <span class="dr-province-num">${escapeHtml(item.Number)}</span>
                        <span class="dr-province-customer">${escapeHtml(item.PartnerDisplayName || '')}</span>
                    </div>
                    <div class="dr-province-right">
                        <span class="dr-province-date">${formatDate(item.DateInvoice)}</span>
                        <span class="dr-province-amount">${formatMoney(item.CashOnDelivery || 0)}</span>
                        ${showScanned ? `<button class="dr-btn-unscan" onclick="DeliveryReport.unscanItem('${escapeHtml(item.Number)}')" title="Xóa quét"><i class="fas fa-times"></i></button>` : ''}
                    </div>
                </div>`;
            });

            if (viewItems.length === 0) {
                html += `<div class="dr-province-item" style="justify-content:center;color:#9ca3af;padding:20px;">Không có dữ liệu</div>`;
            }

            colEl.innerHTML = html;
        });
    }

    function showGroupColumn(group) {
        Object.entries(GROUP_COL_MAP).forEach(([g, id]) => {
            const el = document.getElementById(id);
            if (el) el.style.display = g === group ? '' : 'none';
        });
        highlightProvinceColumn(group);
    }

    function showAllGroupColumns() {
        Object.values(GROUP_COL_MAP).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        });
        document.querySelectorAll('.dr-province-col').forEach(el => el.classList.remove('active-scan'));
    }

    function hideAllGroupColumns() {
        Object.values(GROUP_COL_MAP).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    function highlightProvinceColumn(column) {
        // Remove from all columns
        document.querySelectorAll('.dr-province-col').forEach(el => el.classList.remove('active-scan'));

        // Add persistent highlight to the scanned column
        const colId = GROUP_COL_MAP[column] || (column === 'tomato' ? 'drColTomato' : 'drColNap');
        const colEl = document.getElementById(colId);
        if (colEl) colEl.classList.add('active-scan');
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
        const isProvinceTab = state.activeTab === 'province' && state.traSoatMode;
        const isAllTab = state.activeTab === 'all' && state.traSoatMode;
        const isMultiColView = isProvinceTab || isAllTab;

        // Find matching item by Number (case-insensitive)
        const upperValue = value.toUpperCase();
        const match = (state.allData || []).find(item => (item.Number || '').toUpperCase() === upperValue);
        if (!match) {
            if (isMultiColView) isAllTab ? hideAllGroupColumns() : hideProvinceColumns();
            soundError.currentTime = 0; soundError.play();
            showScanFeedback(false, `Không tìm thấy: ${value}`, true);
            return;
        }

        // Check if already scanned
        if (state.scannedNumbers.has(match.Number)) {
            if (isAllTab) {
                const group = getItemGroup(match);
                renderAllGroupsView();
                showGroupColumn(group);
            } else if (isProvinceTab) {
                const group = state.provinceGroups[match.Number];
                if (group) {
                    renderProvinceView();
                    showProvinceColumn(group);
                }
            }
            soundDuplicate.currentTime = 0; soundDuplicate.play();
            showScanFeedback('warning', `Đã quét rồi: ${value}`, true);
            return;
        }

        // Tab-aware scanning (skip tab check for "all" tab)
        if (!isAllTab) {
            const normalizedCarrier = normalizeCarrier(match.CarrierName);
            const matchIsReturn = isReturnItem(match);
            let belongsToTab = false;

            const isCity = normalizedCarrier === 'THÀNH PHỐ';
            const isShop = normalizedCarrier === 'BÁN HÀNG SHOP';
            const isProvince = normalizedCarrier && !isCity && !isShop;

            if (state.activeTab === 'return' && matchIsReturn) belongsToTab = true;
            else if (state.activeTab === 'city' && isCity && !matchIsReturn) belongsToTab = true;
            else if (state.activeTab === 'province' && isProvince && !matchIsReturn) belongsToTab = true;
            else if (state.activeTab === 'shop' && isShop && !matchIsReturn) belongsToTab = true;

            if (!belongsToTab) {
                let correctTab = 'khác';
                if (matchIsReturn) correctTab = 'Thu về';
                else if (isCity) correctTab = 'Thành phố';
                else if (isProvince) correctTab = 'Tỉnh';
                else if (isShop) correctTab = 'Bán hàng shop';

                if (isProvinceTab) hideProvinceColumns();
                soundError.currentTime = 0; soundError.play();
                showScanFeedback('wrong-tab', `${value} thuộc tab "${correctTab}"!`, true);
                return;
            }
        }

        // Mark as scanned
        state.scannedNumbers.add(match.Number);

        // Save to Firestore for cross-machine sync
        saveScannedNumbers();

        // Update view based on active tab
        if (isAllTab) {
            const group = getItemGroup(match);
            renderAllGroupsView();
            showGroupColumn(group);
            updateScanCount();
            showScanFeedback(true, `${match.Number} → ${GROUP_LABELS[group]}`, false);
        } else if (isProvinceTab) {
            renderProvinceView();
            const group = state.provinceGroups[match.Number];
            if (group) {
                showProvinceColumn(group);
            }
            updateScanCount();
            showScanFeedback(true, `${match.Number} → ${(group || '').toUpperCase()}`, false);
        } else {
            renderTable();
            renderPagination();
            updateScanCount();
            showScanFeedback(true, `${match.Number}`, false);
        }
    }

    function hideProvinceColumns() {
        const tomato = document.getElementById('drColTomato');
        const nap = document.getElementById('drColNap');
        if (tomato) tomato.style.display = 'none';
        if (nap) nap.style.display = 'none';
    }

    function showProvinceColumn(group) {
        const tomato = document.getElementById('drColTomato');
        const nap = document.getElementById('drColNap');
        if (group === 'tomato') {
            if (tomato) tomato.style.display = '';
            if (nap) nap.style.display = 'none';
        } else {
            if (tomato) tomato.style.display = 'none';
            if (nap) nap.style.display = '';
        }
        highlightProvinceColumn(group);
    }

    function showScanFeedback(type, value, persistent) {
        // type: true/'success' | false/'error' | 'warning' | 'wrong-tab'
        // persistent: if true, feedback stays until next successful scan
        const existing = document.getElementById('drScanFeedback');
        if (existing) existing.remove();

        let className = 'dr-scan-feedback ';
        if (type === true || type === 'success') className += 'success';
        else if (type === 'warning') className += 'warning';
        else if (type === 'wrong-tab') className += 'wrong-tab';
        else className += 'error';

        const div = document.createElement('div');
        div.id = 'drScanFeedback';
        div.className = className;

        const textSpan = document.createElement('span');
        textSpan.textContent = value;
        div.appendChild(textSpan);

        const closeBtn = document.createElement('span');
        closeBtn.className = 'dr-scan-feedback-close';
        closeBtn.textContent = '✕';
        closeBtn.onclick = () => div.remove();
        div.appendChild(closeBtn);

        document.body.appendChild(div);

        if (!persistent) {
            setTimeout(() => div.remove(), 2000);
        }
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
        exportExcelProvince: exportExcelProvince,
        exportExcelGroup: exportExcelGroup,
        traSoat: traSoat,
        setTab: setTab,
        setScanFilter: setScanFilter,
        unscanItem: unscanItem,
        unscanAllTab: unscanAllTab,
        getState: () => DeliveryReportState
    };
})();
