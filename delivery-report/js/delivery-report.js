// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// DELIVERY REPORT - Thống Kê Giao Hàng
// Main controller: API calls, filters, table rendering, pagination
// =====================================================

(function () {
    'use strict';

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const RENDER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

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
        hiddenNumbers: new Set(),
        activeTab: 'all', // 'city', 'province', 'shop', 'all'
        scanFilter: 'unscanned', // 'unscanned' | 'scanned'
        provinceGroups: {}, // { Number: 'tomato' | 'nap' }
        _provinceGroupsLoaded: false,
        dbAssignments: {}, // { Number: groupName } — loaded from PostgreSQL (source of truth)
        _dbAssignmentsLoaded: false,
        _dbLockedCount: 0,
        _dbNewCount: 0,
        lastScannedColumn: null, // 'tomato' | 'nap'
        _focusedGroup: null, // focused group in all-tab after scan
        _scannedListener: null,
        _groupsListener: null,

        // Filter values
        filters: {
            fromDate: '',
            toDate: '',
            keyword: '',
        },

        // Header filter: Công nợ < Tổng tiền (toggle khi click cột Công nợ)
        filter: {
            debtLessThanTotal: false,
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
            forControlStatus: false,
        },
    };

    // =====================================================
    // PERMISSION HELPER
    // =====================================================
    function canTraSoat() {
        if (!window.authManager) return false;
        if (window.authManager.isAdmin()) return true;
        return window.authManager.getUserInfo()?.displayName === 'Phước đẹp trai';
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================
    function initDeliveryReport() {
        setDefaultDates();
        bindFilterEvents();
        bindColumnToggle();
        bindFilterableHeaders();
        applyColumnVisibility();
        loadFiltersFromStorage();

        // Ẩn nút tra soát nếu không có quyền
        if (!canTraSoat()) {
            const btn = document.getElementById('drBtnTraSoat');
            if (btn) btn.style.display = 'none';
        }

        loadHiddenNumbers().finally(() => fetchData());
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
                    // Nếu đang ở chế độ Tra soát → xử lý như barcode scan
                    if (DeliveryReportState.traSoatMode) {
                        const scanned = keywordInput.value.trim().toUpperCase();
                        if (scanned) {
                            processScan(scanned);
                            keywordInput.value = '';
                        }
                        return;
                    }
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
        } catch (e) {
            /* ignore quota errors */
        }
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
        } catch (e) {
            /* ignore */
        }
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
        dropdown.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => {
                DeliveryReportState.columns[cb.dataset.col] = cb.checked;
                applyColumnVisibility();
            });
        });
    }

    // =====================================================
    // CỘT CÔNG NỢ: click toggle partition "Công nợ < Tổng tiền" lên đầu
    // Giữ toàn bộ đơn, đơn đầu tiên của phần còn lại tô đỏ làm boundary.
    // =====================================================
    function bindFilterableHeaders() {
        const th = document.querySelector('.dr-table thead th[data-col="cashOnDelivery"]');
        if (!th) return;
        if (!th.querySelector('.sort-icon')) {
            const icon = document.createElement('i');
            icon.className = 'fas fa-filter sort-icon';
            th.appendChild(document.createTextNode(' '));
            th.appendChild(icon);
        }
        th.addEventListener('click', () => {
            DeliveryReportState.filter.debtLessThanTotal =
                !DeliveryReportState.filter.debtLessThanTotal;
            DeliveryReportState.currentPage = 1;
            renderTable();
        });
        updateFilterIndicators();
    }

    function updateFilterIndicators() {
        const th = document.querySelector('.dr-table thead th[data-col="cashOnDelivery"]');
        if (!th) return;
        const icon = th.querySelector('.sort-icon');
        if (!icon) return;
        if (DeliveryReportState.filter.debtLessThanTotal) {
            icon.style.color = '#4f46e5';
            th.title = 'Đơn Công nợ < Tổng tiền đang được đưa lên đầu (click để bỏ)';
        } else {
            icon.style.color = '';
            th.title = 'Click để đưa đơn Công nợ < Tổng tiền lên đầu';
        }
    }

    // Trả về { data: [...], boundaryIndex: index của đơn đầu tiên KHÔNG thoả điều kiện
    // trong mảng đã sắp xếp, hoặc -1 nếu không cần highlight }.
    function applyDebtSort(data) {
        if (!DeliveryReportState.filter.debtLessThanTotal) {
            return { data, boundaryIndex: -1 };
        }
        const matching = [];
        const rest = [];
        data.forEach((item) => {
            const cod = Number(item.CashOnDelivery) || 0;
            const total = Number(item.AmountTotal) || 0;
            if (cod < total) matching.push(item);
            else rest.push(item);
        });
        const combined = matching.concat(rest);
        // Không highlight nếu không có đơn nào match hoặc tất cả đều match
        const boundaryIndex =
            matching.length === 0 || rest.length === 0 ? -1 : matching.length;
        return { data: combined, boundaryIndex };
    }

    function applyColumnVisibility() {
        const cols = DeliveryReportState.columns;
        Object.keys(cols).forEach((colKey) => {
            const cells = document.querySelectorAll(`[data-col="${colKey}"]`);
            cells.forEach((cell) => {
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
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    tposappversion: window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1',
                },
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const result = await response.json();
            const raw = result.value || [];
            DeliveryReportState.allData = raw.filter(
                (i) => !DeliveryReportState.hiddenNumbers.has(i.Number)
            );

            // Debug: check DeliveryNote field
            const withNote = DeliveryReportState.allData.filter((i) => i.DeliveryNote);
            console.log(
                '[DELIVERY-REPORT] Items with DeliveryNote:',
                withNote.length,
                withNote.map((i) => ({ Number: i.Number, DeliveryNote: i.DeliveryNote }))
            );
            const returnItems = DeliveryReportState.allData.filter((i) => isReturnItem(i));
            console.log(
                '[DELIVERY-REPORT] Return items (THU VE):',
                returnItems.length,
                returnItems.map((i) => ({ Number: i.Number, DeliveryNote: i.DeliveryNote }))
            );

            // Reset DB assignment cache on each fetch (date may have changed)
            DeliveryReportState._dbAssignmentsLoaded = false;
            DeliveryReportState._provinceGroupsLoaded = false;
            DeliveryReportState.dbAssignments = {};
            DeliveryReportState.provinceGroups = {};

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
        } catch (e) {
            /* ignore */
        }

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
                data = data.filter((item) => !state.scannedNumbers.has(item.Number));
            } else {
                data = data.filter((item) => state.scannedNumbers.has(item.Number));
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
        if (
            DeliveryReportState.traSoatMode &&
            (DeliveryReportState.activeTab === 'all' || DeliveryReportState.activeTab === 'zero')
        ) {
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

        const { data: allData, boundaryIndex } = applyDebtSort(getFilteredData());
        DeliveryReportState.totalCount = allData.length;
        updateFilterIndicators();

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
            const rowClass = startIndex + i === boundaryIndex ? ' class="dr-debt-boundary"' : '';

            html += `<tr${rowClass}>
                <td data-col="index">${startIndex + i + 1}</td>
                <td data-col="number">${escapeHtml(item.Number || '')}</td>
                <td data-col="customer" data-phone="${escapeHtml(item.Phone || '')}">
                    <div class="dr-customer-name">${escapeHtml(item.PartnerDisplayName || '')}</div>
                    <div class="dr-customer-phone">ĐT: ${escapeHtml(item.Phone || '')}</div>
                    <div class="dr-pancake-badge"></div>
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

        // Pancake enrichment — async, non-blocking
        if (window.PancakeValidator) {
            const cells = tbody.querySelectorAll('td[data-col="customer"][data-phone]');
            const uniquePhones = [
                ...new Set([...cells].map((c) => c.dataset.phone).filter(Boolean)),
            ];
            uniquePhones.slice(0, 50).forEach((phone) => {
                window.PancakeValidator.quickLookup(phone).then((data) => {
                    if (!data) return;
                    cells.forEach((cell) => {
                        if (cell.dataset.phone !== phone) return;
                        const badge = cell.querySelector('.dr-pancake-badge');
                        if (badge)
                            badge.innerHTML = window.PancakeValidator.renderCustomerBadge(data);
                    });
                });
            });
        }

        // Footer totals (from ALL data, not just current page)
        let allTotalAmount = 0,
            allTotalCOD = 0,
            allTotalShipPrice = 0;
        allData.forEach((item) => {
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
        data.forEach((item) => {
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
        range.forEach((p) => {
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
            none: 'none',
            picking: 'picking',
            shipping: 'shipping',
            done: 'done',
            returned: 'returned',
            cancel: 'cancel',
        };
        return map[status] || 'none';
    }

    function getForControlText(item) {
        if (!item.ShipPaymentStatus && !item.CrossCheckTimes) return '';
        if (item.ShipPaymentStatus === 'done')
            return '<span style="color:#22c55e;font-weight:600;">Đã đối soát</span>';
        if (item.ShipPaymentStatus === 'fail')
            return '<span style="color:#ef4444;font-weight:600;">Không thành công</span>';
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
        city: { name: 'THANHPHO', sheet: 'Thành phố' },
        province: { name: 'TINH', sheet: 'Tỉnh' },
        shop: { name: 'SHOP', sheet: 'Bán hàng shop' },
        return: { name: 'THUVE', sheet: 'Thu về' },
        zero: { name: 'DON0D', sheet: 'ĐƠN 0đ' },
        all: { name: 'TATCA', sheet: 'Tất cả' },
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
                item.CashOnDelivery || 0,
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
        return `${label}_${now.getDate()}_${now.getMonth() + 1}.xlsx`;
    }

    async function exportExcel() {
        if (typeof XLSX === 'undefined') {
            alert('Thư viện XLSX chưa được tải. Vui lòng tải lại trang.');
            return;
        }

        const btn = document.getElementById('drBtnExport');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Đang xuất...';
        }

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

            if (tab === 'zero' && state.traSoatMode) {
                // ĐƠN 0đ tab: export chỉ đơn 0đ, chia theo nhóm
                exportExcelZeroDong();
                return;
            }

            const items = state.traSoatMode ? getTabFilteredData() : state.allData || [];
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
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-file-excel"></i> Xuất excel';
            }
        }
    }

    function exportExcelProvinceAll() {
        const provinceData = getTabFilteredData();
        const groups = DeliveryReportState.provinceGroups;
        const tomatoItems = provinceData.filter((item) => groups[item.Number] === 'tomato');
        const napItems = provinceData.filter((item) => groups[item.Number] === 'nap');

        const wb = XLSX.utils.book_new();
        const tomatoRows = buildExcelRows(tomatoItems);
        const tomatoWs = XLSX.utils.aoa_to_sheet(tomatoRows);
        autoFitColumns(tomatoWs, tomatoRows);
        const napRows = buildExcelRows(napItems);
        const napWs = XLSX.utils.aoa_to_sheet(napRows);
        autoFitColumns(napWs, napRows);
        XLSX.utils.book_append_sheet(wb, tomatoWs, 'TOMATO');
        XLSX.utils.book_append_sheet(wb, napWs, 'NAP');
        XLSX.writeFile(wb, makeFileName('TOMATO_NAP'));
    }

    function exportExcelProvince(group) {
        if (typeof XLSX === 'undefined') {
            alert('Thư viện XLSX chưa được tải. Vui lòng tải lại trang.');
            return;
        }

        const provinceData = getTabFilteredData();
        const groups = DeliveryReportState.provinceGroups;
        const items = provinceData.filter((item) => groups[item.Number] === group);
        const label = GROUP_LABELS[group] || group.toUpperCase();

        const wsData = buildExcelRows(items);
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        autoFitColumns(ws, wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, label);
        XLSX.writeFile(wb, makeFileName(GROUP_FILE_NAMES[group] || group.toUpperCase()));
    }

    function exportExcelAllGroups() {
        const allData = DeliveryReportState.allData || [];
        const wb = XLSX.utils.book_new();
        const groupKeys = ['tomato', 'nap', 'city', 'shop', 'return'];

        groupKeys.forEach((key) => {
            const items = allData.filter((item) => getItemGroup(item) === key);
            if (items.length === 0) return;
            const rows = buildExcelRows(items);
            const ws = XLSX.utils.aoa_to_sheet(rows);
            autoFitColumns(ws, rows);
            XLSX.utils.book_append_sheet(wb, ws, GROUP_LABELS[key]);
        });

        XLSX.writeFile(wb, makeFileName('TATCA'));
    }

    function exportExcelGroup(group) {
        if (typeof XLSX === 'undefined') {
            alert('Thư viện XLSX chưa được tải. Vui lòng tải lại trang.');
            return;
        }
        const allData = DeliveryReportState.allData || [];
        const items = allData.filter((item) => getItemGroup(item) === group);
        const label = GROUP_LABELS[group] || group.toUpperCase();

        const wsData = buildExcelRows(items);
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        autoFitColumns(ws, wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, label);
        XLSX.writeFile(wb, makeFileName(GROUP_FILE_NAMES[group] || group.toUpperCase()));
    }

    function exportExcelZeroDong() {
        const allData = (DeliveryReportState.allData || []).filter((item) => isZeroCOD(item));
        const wb = XLSX.utils.book_new();
        const groupKeys = ['nap', 'city', 'shop', 'return'];
        let hasData = false;

        groupKeys.forEach((key) => {
            const items = allData.filter((item) => getItemGroup(item) === key);
            if (items.length === 0) return;
            hasData = true;
            const rows = buildExcelRows(items);
            const ws = XLSX.utils.aoa_to_sheet(rows);
            autoFitColumns(ws, rows);
            XLSX.utils.book_append_sheet(wb, ws, GROUP_LABELS[key]);
        });

        if (!hasData) {
            alert('Không có đơn 0đ để xuất.');
            return;
        }

        XLSX.writeFile(wb, makeFileName('DON0D'));
    }

    // =====================================================
    // TRA SOÁT - Barcode Scanner Mode
    // =====================================================
    let barcodeBuffer = '';
    let barcodeTimeout = null;
    const soundError = new Audio('sound/sai.mp3');
    const soundDuplicate = new Audio('sound/trung.mp3');

    // Sound riêng cho đơn 0đ — 2 beep ngắn tần số cao
    function playZeroDongSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [0, 0.15].forEach((delay) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = 1200;
                gain.gain.value = 0.3;
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + delay);
                osc.stop(ctx.currentTime + delay + 0.1);
            });
        } catch (e) {
            /* fallback: no sound */
        }
    }

    async function traSoat() {
        if (!canTraSoat()) {
            alert('Bạn không có quyền sử dụng chức năng tra soát.');
            return;
        }
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

            // Load scanned numbers + province groups from DB
            await loadScannedNumbers();
            await ensureProvinceGroups();

            updateTabUI();
            updateProvinceExportButtons();
            document.addEventListener('keydown', onBarcodeKeydown);
            startSyncPolling();
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

            stopSyncPolling();
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
        DeliveryReportState._focusedGroup = null;
        updateTabUI();
        updateProvinceExportButtons();

        if (tab === 'province' && DeliveryReportState.traSoatMode) {
            await ensureProvinceGroups();
            renderProvinceView();
        } else if ((tab === 'all' || tab === 'zero') && DeliveryReportState.traSoatMode) {
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
        const isProvince =
            DeliveryReportState.activeTab === 'province' && DeliveryReportState.traSoatMode;
        if (tomatoBtn) tomatoBtn.style.display = isProvince ? '' : 'none';
        if (napBtn) napBtn.style.display = isProvince ? '' : 'none';

        // All-groups export buttons
        const isAll =
            (DeliveryReportState.activeTab === 'all' || DeliveryReportState.activeTab === 'zero') &&
            DeliveryReportState.traSoatMode;
        document.querySelectorAll('.dr-btn-group-export').forEach((btn) => {
            btn.style.display = isAll ? '' : 'none';
        });
    }

    function setScanFilter(filter) {
        DeliveryReportState.scanFilter = filter;
        DeliveryReportState.currentPage = 1;
        DeliveryReportState._focusedGroup = null;

        // Update scan filter tab UI
        document.querySelectorAll('.dr-scan-filter-tab').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        // Show/hide "Xóa tất cả" button
        const unscanAllBtn = document.getElementById('drBtnUnscanAll');
        if (unscanAllBtn) unscanAllBtn.style.display = filter === 'scanned' ? '' : 'none';

        if (DeliveryReportState.activeTab === 'province' && DeliveryReportState.traSoatMode) {
            renderProvinceView();
        } else if (
            (DeliveryReportState.activeTab === 'all' || DeliveryReportState.activeTab === 'zero') &&
            DeliveryReportState.traSoatMode
        ) {
            renderAllGroupsView();
        } else {
            renderTable();
            renderPagination();
        }
        updateScanCount();
    }

    function updateTabUI() {
        const tabs = document.querySelectorAll('.dr-trasoat-tab');
        tabs.forEach((t) => {
            t.classList.toggle('active', t.dataset.tab === DeliveryReportState.activeTab);
        });
    }

    function updateScanCount() {
        const countEl = document.getElementById('drScanCount');
        const totalEl = document.getElementById('drScanTotal');
        const amountEl = document.getElementById('drScanTotalAmount');
        if (!countEl || !totalEl) return;

        const tabData = getTabFilteredData();
        const scannedItems = tabData.filter((item) =>
            DeliveryReportState.scannedNumbers.has(item.Number)
        );
        countEl.textContent = `Đã quét: ${formatNumber(scannedItems.length)}`;
        totalEl.textContent = formatNumber(tabData.length);

        // Show total amount for current view (scanned or unscanned)
        if (amountEl) {
            const showScanned = DeliveryReportState.scanFilter === 'scanned';
            const viewItems = showScanned
                ? scannedItems
                : tabData.filter((item) => !DeliveryReportState.scannedNumbers.has(item.Number));
            const totalCOD = viewItems.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);
            amountEl.textContent = `CN: ${formatMoney(totalCOD)}`;
        }
    }

    function removeTones(str) {
        return (str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
    }

    function isReturnItem(item) {
        return removeTones(item.DeliveryNote || '')
            .toUpperCase()
            .includes('THU VE');
    }

    function isZeroCOD(item) {
        return !item.CashOnDelivery || item.CashOnDelivery === 0;
    }

    // Determine which group an item belongs to (for "all" tab 5-column view)
    // Priority: DB assignment (locked) > provinceGroups > carrier-based detection
    function getItemGroup(item) {
        // Check DB locked assignment first (source of truth)
        const dbGroup = DeliveryReportState.dbAssignments[item.Number];
        if (dbGroup) return dbGroup;

        // Fallback to carrier-based detection
        if (isReturnItem(item)) return 'return';
        const nc = normalizeCarrier(item.CarrierName);
        if (nc === 'THÀNH PHỐ') return 'city';
        if (nc === 'BÁN HÀNG SHOP') return 'shop';
        return DeliveryReportState.provinceGroups[item.Number] || 'nap';
    }

    const GROUP_COL_MAP = {
        tomato: 'drColTomato',
        nap: 'drColNap',
        city: 'drColCity',
        shop: 'drColShop',
        return: 'drColReturn',
    };

    const GROUP_LABELS = {
        tomato: 'TOMATO',
        nap: 'TỈNH NAP',
        city: 'THÀNH PHỐ',
        shop: 'BÁN HÀNG SHOP',
        return: 'THU VỀ',
    };

    const GROUP_FILE_NAMES = {
        tomato: 'TOMATO',
        nap: 'NAP',
        city: 'THANHPHO',
        shop: 'SHOP',
        return: 'THUVE',
    };

    const GROUP_HEADER_CLASS = {
        tomato: 'dr-province-header-tomato',
        nap: 'dr-province-header-nap',
        city: 'dr-province-header-city',
        shop: 'dr-province-header-shop',
        return: 'dr-province-header-return',
    };

    function getTabFilteredData() {
        let data = DeliveryReportState.allData || [];
        // Apply tab filter
        const tab = DeliveryReportState.activeTab;
        if (tab === 'city') {
            data = data.filter(
                (item) => normalizeCarrier(item.CarrierName) === 'THÀNH PHỐ' && !isReturnItem(item)
            );
        } else if (tab === 'province') {
            data = data.filter((item) => {
                const nc = normalizeCarrier(item.CarrierName);
                return nc && nc !== 'THÀNH PHỐ' && nc !== 'BÁN HÀNG SHOP' && !isReturnItem(item);
            });
        } else if (tab === 'shop') {
            data = data.filter(
                (item) =>
                    normalizeCarrier(item.CarrierName) === 'BÁN HÀNG SHOP' && !isReturnItem(item)
            );
        } else if (tab === 'return') {
            data = data.filter((item) => isReturnItem(item));
        } else if (tab === 'zero') {
            data = data.filter((item) => isZeroCOD(item));
        }
        return data;
    }

    // =====================================================
    // PROVINCE GROUPS - TOMATO/NAP Split + Firebase Persistence
    // =====================================================
    function getProvinceData() {
        const data = DeliveryReportState.allData || [];
        // Province = everything NOT city, NOT shop, NOT return
        return data.filter((item) => {
            const nc = normalizeCarrier(item.CarrierName);
            return nc && nc !== 'THÀNH PHỐ' && nc !== 'BÁN HÀNG SHOP' && !isReturnItem(item);
        });
    }

    // Assign TOMATO/NAP: random pick, TOMATO ~20-22% of total AmountTotal (all items)
    // ĐƠN 0đ (CashOnDelivery === 0) KHÔNG BAO GIỜ vào TOMATO → luôn vào NAP
    function assignTomatoNap(unassignedItems, groups) {
        // Separate 0đ items — always go to NAP
        const zeroItems = unassignedItems.filter((i) => isZeroCOD(i));
        const nonZeroItems = unassignedItems.filter((i) => !isZeroCOD(i));

        zeroItems.forEach((item) => {
            groups[item.Number] = 'nap';
        });

        // Calculate based on ALL province items (assigned + unassigned)
        const allProvinceData = getProvinceData();
        const grandTotal = allProvinceData.reduce((sum, i) => sum + (i.AmountTotal || 0), 0);
        const targetAmount = grandTotal * 0.21;

        // Sum of existing TOMATO assignments
        const existingTomatoSum = allProvinceData
            .filter((i) => groups[i.Number] === 'tomato')
            .reduce((sum, i) => sum + (i.AmountTotal || 0), 0);

        // Remaining budget for new TOMATO assignments
        const remainingBudget = targetAmount - existingTomatoSum;

        // Shuffle randomly (only non-zero items eligible for TOMATO)
        const shuffled = [...nonZeroItems].sort(() => Math.random() - 0.5);
        let newTomatoSum = 0;

        shuffled.forEach((item) => {
            const amt = item.AmountTotal || 0;
            if (
                remainingBudget > 0 &&
                (newTomatoSum + amt <= remainingBudget ||
                    (newTomatoSum === 0 && existingTomatoSum === 0))
            ) {
                groups[item.Number] = 'tomato';
                newTomatoSum += amt;
            } else {
                groups[item.Number] = 'nap';
            }
        });
    }

    // =====================================================
    // DB ASSIGNMENTS — PostgreSQL as Source of Truth
    // =====================================================
    function getAssignmentDate() {
        // Use the fromDate filter date (YYYY-MM-DD)
        const fromDate = document.getElementById('drFilterFromDate')?.value;
        if (fromDate) return fromDate;
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    async function loadAssignmentsFromDB() {
        const date = getAssignmentDate();
        try {
            const resp = await fetch(`${RENDER_URL}/api/v2/delivery-assignments?date=${date}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const result = await resp.json();
            if (result.success && result.data) {
                DeliveryReportState.dbAssignments = result.data.assignments || {};
                DeliveryReportState._dbAssignmentsLoaded = true;
                DeliveryReportState._dbLockedCount = result.data.totalCount || 0;

                // Load scanned + hidden from same response
                DeliveryReportState.scannedNumbers = new Set(result.data.scannedNumbers || []);
                DeliveryReportState.hiddenNumbers = new Set(result.data.hiddenNumbers || []);

                console.log(
                    `[DELIVERY-REPORT] DB: ${result.data.totalCount} assignments, ${result.data.scannedCount} scanned, ${result.data.hiddenCount} hidden for ${date}`
                );
                return result.data.assignments;
            }
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to load DB assignments:', e.message);
        }
        return {};
    }

    async function saveAssignmentsToDB(items, groups) {
        const date = getAssignmentDate();
        const assignments = items.map((item) => ({
            orderNumber: item.Number,
            groupName: groups[item.Number] || getItemGroup(item),
            amountTotal: item.AmountTotal || 0,
            cashOnDelivery: item.CashOnDelivery || 0,
            carrierName: item.CarrierName || '',
        }));

        if (assignments.length === 0) return { inserted: 0, skipped: 0 };

        try {
            const user = window.authManager?.getUserInfo?.()?.displayName || 'anonymous';
            const resp = await fetch(`${RENDER_URL}/api/v2/delivery-assignments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-data': btoa(
                        unescape(encodeURIComponent(JSON.stringify({ userName: user })))
                    ),
                },
                body: JSON.stringify({ date, assignments }),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const result = await resp.json();
            if (result.success) {
                DeliveryReportState._dbNewCount = result.data.inserted || 0;
                console.log(
                    `[DELIVERY-REPORT] DB: saved ${result.data.inserted} new, ${result.data.skipped} already locked`
                );
                return result.data;
            }
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to save assignments to DB:', e.message);
        }
        return { inserted: 0, skipped: 0 };
    }

    // =====================================================
    // SCANNED / HIDDEN — PostgreSQL via Render API
    // =====================================================
    async function loadScannedNumbers() {
        // Scanned numbers are loaded together with assignments in loadAssignmentsFromDB()
        // This function is kept for backward compatibility with traSoat() flow
        if (DeliveryReportState._dbAssignmentsLoaded) return;
        await loadAssignmentsFromDB();
    }

    async function loadHiddenNumbers() {
        // Hidden numbers are loaded together with assignments in loadAssignmentsFromDB()
        if (DeliveryReportState._dbAssignmentsLoaded) return;
        await loadAssignmentsFromDB();
    }

    async function hideOrder(number) {
        if (!number) return;
        const date = getAssignmentDate();
        DeliveryReportState.hiddenNumbers.add(number);
        DeliveryReportState.scannedNumbers.delete(number);
        DeliveryReportState.allData = (DeliveryReportState.allData || []).filter(
            (i) => i.Number !== number
        );

        // Save to DB
        try {
            const user = window.authManager?.getUserInfo?.()?.displayName || 'anonymous';
            await fetch(
                `${RENDER_URL}/api/v2/delivery-assignments/hide/${encodeURIComponent(number)}?date=${date}`,
                {
                    method: 'PATCH',
                    headers: {
                        'x-auth-data': btoa(
                            unescape(encodeURIComponent(JSON.stringify({ userName: user })))
                        ),
                    },
                }
            );
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to hide order in DB:', e.message);
        }

        renderTable();
        renderStats();
        renderPagination();
        if (DeliveryReportState.traSoatMode) updateScanCount();
    }

    async function saveScannedNumber(orderNumber) {
        const date = getAssignmentDate();
        try {
            const user = window.authManager?.getUserInfo?.()?.displayName || 'anonymous';
            await fetch(
                `${RENDER_URL}/api/v2/delivery-assignments/scan/${encodeURIComponent(orderNumber)}?date=${date}`,
                {
                    method: 'PATCH',
                    headers: {
                        'x-auth-data': btoa(
                            unescape(encodeURIComponent(JSON.stringify({ userName: user })))
                        ),
                    },
                }
            );
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to save scan to DB:', e.message);
        }
    }

    async function unscanNumberInDB(orderNumber) {
        const date = getAssignmentDate();
        try {
            await fetch(
                `${RENDER_URL}/api/v2/delivery-assignments/unscan/${encodeURIComponent(orderNumber)}?date=${date}`,
                {
                    method: 'PATCH',
                }
            );
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to unscan in DB:', e.message);
        }
    }

    async function unscanBulkInDB(orderNumbers) {
        const date = getAssignmentDate();
        try {
            await fetch(`${RENDER_URL}/api/v2/delivery-assignments/unscan-bulk`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, orderNumbers }),
            });
        } catch (e) {
            console.warn('[DELIVERY-REPORT] Failed to bulk unscan in DB:', e.message);
        }
    }

    async function unscanItem(number) {
        if (!canTraSoat()) {
            alert('Bạn không có quyền xóa quét.');
            return;
        }
        if (!confirm(`Chắc chắn đơn ${number} đã được đưa vào kho xử lý?`)) return;
        DeliveryReportState.scannedNumbers.delete(number);
        await unscanNumberInDB(number);
        refreshTraSoatView();
    }

    async function unscanAllTab() {
        if (!canTraSoat()) {
            alert('Bạn không có quyền xóa quét.');
            return;
        }
        const tabData = getTabFilteredData();
        const scannedInTab = tabData.filter((item) =>
            DeliveryReportState.scannedNumbers.has(item.Number)
        );
        if (scannedInTab.length === 0) return;
        if (
            !confirm(
                `⚠️ Xóa tất cả ${scannedInTab.length} đơn đã quét?\n\nHành động này KHÔNG THỂ hoàn tác!`
            )
        )
            return;
        const numbers = scannedInTab.map((item) => item.Number);
        numbers.forEach((n) => DeliveryReportState.scannedNumbers.delete(n));
        await unscanBulkInDB(numbers);
        refreshTraSoatView();
    }

    function unscanGroup(groupKey) {
        if (!canTraSoat()) {
            alert('Bạn không có quyền xóa quét.');
            return;
        }
        const allData = DeliveryReportState.allData || [];
        const scanned = DeliveryReportState.scannedNumbers;
        const items = allData.filter(
            (item) => getItemGroup(item) === groupKey && scanned.has(item.Number)
        );
        if (items.length === 0) return;
        if (
            !confirm(
                `Xóa tất cả ${items.length} đơn đã quét trong nhóm ${GROUP_LABELS[groupKey] || groupKey}?`
            )
        )
            return;
        const numbers = items.map((item) => item.Number);
        numbers.forEach((n) => scanned.delete(n));
        unscanBulkInDB(numbers);
        refreshTraSoatView();
    }

    // =====================================================
    // CROSS-MACHINE SYNC — Polling from PostgreSQL
    // =====================================================
    let _syncInterval = null;

    function startSyncPolling() {
        stopSyncPolling();
        // Poll every 5 seconds for changes from other machines
        _syncInterval = setInterval(async () => {
            if (!DeliveryReportState.traSoatMode) return;
            try {
                const date = getAssignmentDate();
                const resp = await fetch(`${RENDER_URL}/api/v2/delivery-assignments?date=${date}`);
                if (!resp.ok) return;
                const result = await resp.json();
                if (!result.success) return;

                const newScanned = new Set(result.data.scannedNumbers || []);
                const oldScanned = DeliveryReportState.scannedNumbers;

                // Only refresh if scanned set changed
                if (
                    newScanned.size !== oldScanned.size ||
                    [...newScanned].some((n) => !oldScanned.has(n))
                ) {
                    DeliveryReportState.scannedNumbers = newScanned;
                    DeliveryReportState.hiddenNumbers = new Set(result.data.hiddenNumbers || []);
                    refreshTraSoatView();
                    console.log('[DELIVERY-REPORT] Sync: updated from DB');
                }
            } catch (_) {
                /* silent fail for polling */
            }
        }, 5000);
    }

    function stopSyncPolling() {
        if (_syncInterval) {
            clearInterval(_syncInterval);
            _syncInterval = null;
        }
    }

    function refreshTraSoatView() {
        if (!DeliveryReportState.traSoatMode) return;
        if (DeliveryReportState.activeTab === 'province') {
            renderProvinceView();
        } else if (
            DeliveryReportState.activeTab === 'all' ||
            DeliveryReportState.activeTab === 'zero'
        ) {
            renderAllGroupsView();
        } else {
            renderTable();
            renderPagination();
        }
        updateScanCount();
    }

    async function ensureProvinceGroups() {
        const state = DeliveryReportState;
        const allData = state.allData || [];
        const provinceData = getProvinceData();

        // Step 1: Load locked assignments from DB (source of truth)
        if (!state._dbAssignmentsLoaded) {
            const dbAssignments = await loadAssignmentsFromDB();
            for (const [orderNumber, groupName] of Object.entries(dbAssignments)) {
                if (groupName === 'tomato' || groupName === 'nap') {
                    state.provinceGroups[orderNumber] = groupName;
                }
            }
            state.dbAssignments = dbAssignments;
            state._dbAssignmentsLoaded = true;
            state._provinceGroupsLoaded = true;
        }

        // Step 2: Assign TOMATO/NAP for new province items not in DB
        const unassigned = provinceData.filter((item) => !state.provinceGroups[item.Number]);
        if (unassigned.length > 0) {
            assignTomatoNap(unassigned, state.provinceGroups);
        }

        // Step 3: Build full assignment list and save new ones to DB
        const itemsToSave = [];
        const allGroups = {};
        for (const item of allData) {
            const group = getItemGroup(item);
            allGroups[item.Number] = group;
            if (!state.dbAssignments[item.Number]) {
                itemsToSave.push(item);
            }
        }

        // Step 4: Save new assignments to DB (ON CONFLICT DO NOTHING)
        if (itemsToSave.length > 0) {
            const result = await saveAssignmentsToDB(itemsToSave, allGroups);
            for (const item of itemsToSave) {
                state.dbAssignments[item.Number] = allGroups[item.Number];
            }
            updateAssignmentStatus(
                Object.keys(state.dbAssignments).length -
                    itemsToSave.length +
                    (result.inserted || 0),
                result.inserted || 0
            );
        } else {
            updateAssignmentStatus(Object.keys(state.dbAssignments).length, 0);
        }
    }

    function updateAssignmentStatus(lockedCount, newCount) {
        const el = document.getElementById('drAssignmentStatus');
        if (!el) return;
        if (lockedCount > 0 || newCount > 0) {
            const parts = [];
            if (lockedCount > 0) parts.push(`<i class="fas fa-lock"></i> ${lockedCount} đã khóa`);
            if (newCount > 0) parts.push(`<i class="fas fa-plus-circle"></i> ${newCount} mới`);
            el.innerHTML = parts.join(' &middot; ');
            el.style.display = '';
        } else {
            el.style.display = 'none';
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
        ['drColCity', 'drColShop', 'drColReturn'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        const provinceData = getTabFilteredData();
        const groups = DeliveryReportState.provinceGroups;
        const scanned = DeliveryReportState.scannedNumbers;

        // Auto-assign items without group (fallback if ensureProvinceGroups didn't run)
        const unassigned = provinceData.filter((item) => !groups[item.Number]);
        if (unassigned.length > 0) {
            assignTomatoNap(unassigned, groups);
            // Save to DB in background
            const allGroups = {};
            unassigned.forEach((item) => {
                allGroups[item.Number] = groups[item.Number];
            });
            saveAssignmentsToDB(unassigned, allGroups);
        }

        const allTomato = provinceData.filter((item) => groups[item.Number] === 'tomato');
        const allNap = provinceData.filter((item) => groups[item.Number] === 'nap');

        // Count scanned for display
        const tomatoScannedCount = allTomato.filter((i) => scanned.has(i.Number)).length;
        const napScannedCount = allNap.filter((i) => scanned.has(i.Number)).length;

        // Apply scan filter
        const showScanned = DeliveryReportState.scanFilter === 'scanned';
        const tomatoItems = allTomato.filter((item) =>
            showScanned ? scanned.has(item.Number) : !scanned.has(item.Number)
        );
        const napItems = allNap.filter((item) =>
            showScanned ? scanned.has(item.Number) : !scanned.has(item.Number)
        );

        // Calculate COD totals for current view (filtered by scan status)
        const tomatoCOD = tomatoItems.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);
        const napCOD = napItems.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);

        // Render TOMATO column
        let tomatoHtml = `<div class="dr-province-header dr-province-header-tomato">
            <div>TOMATO <span class="dr-province-count">${tomatoScannedCount}/${allTomato.length}</span></div>
            <div style="display:flex;align-items:center;gap:8px;">
                <span class="dr-province-total" style="margin:0;">${formatMoney(tomatoCOD)}</span>
                ${showScanned && tomatoItems.length > 0 ? `<button class="dr-btn-unscan-all" onclick="DeliveryReport.unscanGroup('tomato')" title="Xóa tất cả TOMATO"><i class="fas fa-trash"></i> Xóa</button>` : ''}
            </div>
        </div>`;
        tomatoItems.forEach((item) => {
            const isScanned = scanned.has(item.Number);
            const zeroClass = isZeroCOD(item) ? ' zero-dong' : '';
            tomatoHtml += `<div class="dr-province-item ${isScanned ? 'scanned' : ''}${zeroClass}">
                <div class="dr-province-left">
                    <span class="dr-province-num">${escapeHtml(item.Number)}</span>
                    <span class="dr-province-customer">${escapeHtml(item.PartnerDisplayName || '')}</span>
                    ${item.Phone ? `<span class="dr-province-phone">${escapeHtml(item.Phone)}</span>` : ''}
                </div>
                <div class="dr-province-right">
                    <span class="dr-province-date">${formatDate(item.DateInvoice)}</span>
                    <span class="dr-province-amount">${formatMoney(item.CashOnDelivery || 0)}${isZeroCOD(item) ? ' <span class="dr-zero-badge">0đ</span>' : ''}</span>
                    ${showScanned ? `<button class="dr-btn-unscan" onclick="DeliveryReport.unscanItem('${escapeHtml(item.Number)}')" title="Xóa quét"><i class="fas fa-times"></i></button>` : ''}
                </div>
            </div>`;
        });
        if (tomatoItems.length === 0) {
            tomatoHtml += `<div class="dr-province-item" style="justify-content:center;color:#9ca3af;padding:20px;">Không có dữ liệu</div>`;
        }

        // Render NAP column
        let napHtml = `<div class="dr-province-header dr-province-header-nap">
            <div>TỈNH NAP <span class="dr-province-count">${napScannedCount}/${allNap.length}</span></div>
            <div style="display:flex;align-items:center;gap:8px;">
                <span class="dr-province-total" style="margin:0;">${formatMoney(napCOD)}</span>
                ${showScanned && napItems.length > 0 ? `<button class="dr-btn-unscan-all" onclick="DeliveryReport.unscanGroup('nap')" title="Xóa tất cả TỈNH NAP"><i class="fas fa-trash"></i> Xóa</button>` : ''}
            </div>
        </div>`;
        napItems.forEach((item) => {
            const isScanned = scanned.has(item.Number);
            const zeroClass = isZeroCOD(item) ? ' zero-dong' : '';
            napHtml += `<div class="dr-province-item ${isScanned ? 'scanned' : ''}${zeroClass}">
                <div class="dr-province-left">
                    <span class="dr-province-num">${escapeHtml(item.Number)}</span>
                    <span class="dr-province-customer">${escapeHtml(item.PartnerDisplayName || '')}</span>
                    ${item.Phone ? `<span class="dr-province-phone">${escapeHtml(item.Phone)}</span>` : ''}
                </div>
                <div class="dr-province-right">
                    <span class="dr-province-date">${formatDate(item.DateInvoice)}</span>
                    <span class="dr-province-amount">${formatMoney(item.CashOnDelivery || 0)}${isZeroCOD(item) ? ' <span class="dr-zero-badge">0đ</span>' : ''}</span>
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

        // Use tab-filtered data (respects 'zero' tab to show only 0đ items)
        const isZeroTab = DeliveryReportState.activeTab === 'zero';
        const allData = isZeroTab
            ? (DeliveryReportState.allData || []).filter((item) => isZeroCOD(item))
            : DeliveryReportState.allData || [];
        const groups = DeliveryReportState.provinceGroups;
        const scanned = DeliveryReportState.scannedNumbers;
        const showScanned = DeliveryReportState.scanFilter === 'scanned';

        // Classify all items into 5 groups
        const grouped = { tomato: [], nap: [], city: [], shop: [], return: [] };
        allData.forEach((item) => {
            const g = getItemGroup(item);
            if (grouped[g]) grouped[g].push(item);
        });

        // Render each column
        const groupKeys = ['tomato', 'nap', 'city', 'shop', 'return'];
        groupKeys.forEach((key) => {
            const colEl = document.getElementById(GROUP_COL_MAP[key]);
            if (!colEl) return;
            colEl.style.display = '';

            const allItems = grouped[key];
            const scannedItems = allItems.filter((i) => scanned.has(i.Number));
            const viewItems = allItems.filter((item) =>
                showScanned ? scanned.has(item.Number) : !scanned.has(item.Number)
            );
            const totalCOD = viewItems.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);

            let html = `<div class="dr-province-header ${GROUP_HEADER_CLASS[key]}">
                <div>${GROUP_LABELS[key]} <span class="dr-province-count">${scannedItems.length}/${allItems.length}</span></div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="dr-province-total" style="margin:0;">${formatMoney(totalCOD)}</span>
                    ${showScanned && viewItems.length > 0 ? `<button class="dr-btn-unscan-all" onclick="DeliveryReport.unscanGroup('${key}')" title="Xóa tất cả nhóm ${GROUP_LABELS[key]}"><i class="fas fa-trash"></i> Xóa</button>` : ''}
                </div>
            </div>`;

            viewItems.forEach((item) => {
                const isItemScanned = scanned.has(item.Number);
                const zeroClass = isZeroCOD(item) ? ' zero-dong' : '';
                html += `<div class="dr-province-item ${isItemScanned ? 'scanned' : ''}${zeroClass}">
                    <div class="dr-province-left">
                        <span class="dr-province-num">${escapeHtml(item.Number)}</span>
                        <span class="dr-province-customer">${escapeHtml(item.PartnerDisplayName || '')}</span>
                        ${item.Phone ? `<span class="dr-province-phone">${escapeHtml(item.Phone)}</span>` : ''}
                    </div>
                    <div class="dr-province-right">
                        <span class="dr-province-date">${formatDate(item.DateInvoice)}</span>
                        <span class="dr-province-amount">${formatMoney(item.CashOnDelivery || 0)}${isZeroCOD(item) ? ' <span class="dr-zero-badge">0đ</span>' : ''}</span>
                        ${showScanned ? `<button class="dr-btn-unscan" onclick="DeliveryReport.unscanItem('${escapeHtml(item.Number)}')" title="Xóa quét"><i class="fas fa-times"></i></button>` : ''}
                    </div>
                </div>`;
            });

            if (viewItems.length === 0) {
                html += `<div class="dr-province-item" style="justify-content:center;color:#9ca3af;padding:20px;">Không có dữ liệu</div>`;
            }

            colEl.innerHTML = html;
        });

        // Re-apply focused group (hide others) after re-render
        const focused = DeliveryReportState._focusedGroup;
        if (focused) {
            Object.entries(GROUP_COL_MAP).forEach(([g, id]) => {
                const el = document.getElementById(id);
                if (el) el.style.display = g === focused ? '' : 'none';
            });
            highlightProvinceColumn(focused);
        }
    }

    function showGroupColumn(group) {
        DeliveryReportState._focusedGroup = group;
        Object.entries(GROUP_COL_MAP).forEach(([g, id]) => {
            const el = document.getElementById(id);
            if (el) el.style.display = g === group ? '' : 'none';
        });
        highlightProvinceColumn(group);
        // Scroll matched group to top
        const colEl = document.getElementById(GROUP_COL_MAP[group]);
        if (colEl) colEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function showAllGroupColumns() {
        DeliveryReportState._focusedGroup = null;
        Object.values(GROUP_COL_MAP).forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        });
        document
            .querySelectorAll('.dr-province-col')
            .forEach((el) => el.classList.remove('active-scan'));
    }

    function hideAllGroupColumns() {
        Object.values(GROUP_COL_MAP).forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    function highlightProvinceColumn(column) {
        // Remove from all columns
        document
            .querySelectorAll('.dr-province-col')
            .forEach((el) => el.classList.remove('active-scan'));

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
                const scanned = barcodeBuffer.trim().toUpperCase();
                const kwInput = document.getElementById('drFilterKeyword');
                if (kwInput) kwInput.value = scanned;
                processScan(scanned);
                barcodeBuffer = '';
            }
            return;
        }

        // Only accept printable characters
        if (e.key.length === 1) {
            barcodeBuffer += e.key;
            clearTimeout(barcodeTimeout);
            barcodeTimeout = setTimeout(() => {
                barcodeBuffer = '';
            }, 500);
        }
    }

    async function checkCrossCheckStatus(orderNumber) {
        try {
            const token = await getToken();
            if (!token) return null;
            const url = `${WORKER_URL}/api/odata/FastSaleOrder/ODataService.GetView?&$top=1&$filter=(Type+eq+'invoice'+and+contains(Number,'${orderNumber}'))&$select=Number,StateCode`;
            const res = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    tposappversion: window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1',
                },
            });
            if (!res.ok) return null;
            const data = await res.json();
            const item = (data.value || [])[0];
            return item?.StateCode || null;
        } catch (e) {
            console.warn('[DELIVERY-REPORT] checkCrossCheckStatus error:', e);
            return null;
        }
    }

    async function processScan(value) {
        console.log('[DELIVERY-REPORT] Scanned:', value);
        const state = DeliveryReportState;

        // Chỉ cho quét ở tab "Tất cả" hoặc "ĐƠN 0đ"
        if (state.activeTab !== 'all' && state.activeTab !== 'zero') {
            showScanFeedback(false, `Chuyển sang tab "Tất cả" hoặc "ĐƠN 0đ" để quét`, true);
            return;
        }

        const isProvinceTab = state.activeTab === 'province' && state.traSoatMode;
        const isAllTab =
            (state.activeTab === 'all' || state.activeTab === 'zero') && state.traSoatMode;
        const isMultiColView = isProvinceTab || isAllTab;

        // Find matching item by Number (case-insensitive)
        const upperValue = value.toUpperCase();
        const match = (state.allData || []).find(
            (item) => (item.Number || '').toUpperCase() === upperValue
        );
        if (!match) {
            if (isMultiColView) isAllTab ? hideAllGroupColumns() : hideProvinceColumns();
            soundError.currentTime = 0;
            soundError.play();
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
            soundDuplicate.currentTime = 0;
            soundDuplicate.play();
            showScanFeedback(
                'warning',
                `Đã quét rồi: ${match.Number} - ${match.PartnerDisplayName || ''}`,
                true
            );
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
            else if (state.activeTab === 'province' && isProvince && !matchIsReturn)
                belongsToTab = true;
            else if (state.activeTab === 'shop' && isShop && !matchIsReturn) belongsToTab = true;

            if (!belongsToTab) {
                let correctTab = 'khác';
                if (matchIsReturn) correctTab = 'Thu về';
                else if (isCity) correctTab = 'Thành phố';
                else if (isProvince) correctTab = 'Tỉnh';
                else if (isShop) correctTab = 'Bán hàng shop';

                if (isProvinceTab) hideProvinceColumns();
                soundError.currentTime = 0;
                soundError.play();
                showScanFeedback(
                    'wrong-tab',
                    `${match.Number} - ${match.PartnerDisplayName || ''} thuộc tab "${correctTab}"!`,
                    true
                );
                return;
            }
        }

        // Check CrossCheckComplete status from TPOS
        showScanFeedback('warning', `Đang kiểm tra đối soát: ${match.Number}...`, false);
        const stateCode = await checkCrossCheckStatus(match.Number);
        if (stateCode !== 'CrossCheckComplete') {
            if (isMultiColView) isAllTab ? hideAllGroupColumns() : hideProvinceColumns();
            soundError.currentTime = 0;
            soundError.play();
            showScanFeedback(
                false,
                `${match.Number} - ${match.PartnerDisplayName || ''} chưa đối soát (${stateCode || 'không rõ'})`,
                true
            );
            return;
        }

        // Mark as scanned
        state.scannedNumbers.add(match.Number);

        // Save to DB
        saveScannedNumber(match.Number);

        // Detect 0đ order → play distinct sound
        const isZero = isZeroCOD(match);
        if (isZero) {
            playZeroDongSound();
        }

        // Update view based on active tab
        const customerName = match.PartnerDisplayName || '';
        const zeroBadge = isZero ? ' [0đ]' : '';
        const feedbackType = isZero ? 'zero-dong' : true;

        if (isAllTab) {
            const group = getItemGroup(match);
            renderAllGroupsView();
            showGroupColumn(group);
            updateScanCount();
            showScanFeedback(
                feedbackType,
                `${match.Number} - ${customerName}${zeroBadge} → ${GROUP_LABELS[group]}`,
                false
            );
        } else if (isProvinceTab) {
            renderProvinceView();
            const group = state.provinceGroups[match.Number];
            if (group) {
                showProvinceColumn(group);
            }
            updateScanCount();
            showScanFeedback(
                feedbackType,
                `${match.Number} - ${customerName}${zeroBadge} → ${GROUP_LABELS[group] || (group || '').toUpperCase()}`,
                false
            );
        } else {
            renderTable();
            renderPagination();
            updateScanCount();
            showScanFeedback(feedbackType, `${match.Number} - ${customerName}${zeroBadge}`, false);
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
        else if (type === 'zero-dong') className += 'zero-dong';
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
    // PRINT PREVIEW
    // =====================================================
    function buildPrintTitle() {
        const state = DeliveryReportState;
        let title = 'Thống Kê Giao Hàng';
        if (state.traSoatMode) {
            const tab = state.activeTab;
            const tabName = TAB_LABELS[tab]?.sheet || GROUP_LABELS[tab] || 'Tất cả';
            const scanLabel = state.scanFilter === 'scanned' ? 'Đã quét' : 'Chưa quét';
            title = `Tra Soát — ${tabName} (${scanLabel})`;
        }
        return title;
    }

    function buildPrintDate() {
        const from = document.getElementById('drFilterFromDate')?.value || '';
        const to = document.getElementById('drFilterToDate')?.value || '';
        return from && to ? `${from} → ${to}` : new Date().toLocaleDateString('vi-VN');
    }

    function buildPrintContent() {
        const state = DeliveryReportState;

        // Tra soát mode: multi-column groups
        if (
            state.traSoatMode &&
            (state.activeTab === 'all' ||
                state.activeTab === 'zero' ||
                state.activeTab === 'province')
        ) {
            return buildPrintGroups();
        }

        // Tra soát mode: single tab (city/shop/return)
        if (state.traSoatMode) {
            return buildPrintList(getFilteredData());
        }

        // Normal mode: table
        return buildPrintTable();
    }

    function buildPrintGroups() {
        const state = DeliveryReportState;
        const isZeroTab = state.activeTab === 'zero';
        const isProvinceTab = state.activeTab === 'province';
        const allData = isZeroTab
            ? (state.allData || []).filter((item) => isZeroCOD(item))
            : state.allData || [];
        const showScanned = state.scanFilter === 'scanned';

        // Classify
        const grouped = { tomato: [], nap: [], city: [], shop: [], return: [] };
        allData.forEach((item) => {
            const g = getItemGroup(item);
            if (grouped[g]) grouped[g].push(item);
        });

        const groupKeys = isProvinceTab
            ? ['tomato', 'nap']
            : ['tomato', 'nap', 'city', 'shop', 'return'];
        let html = '<div class="drp-grid">';

        groupKeys.forEach((key) => {
            const allItems = grouped[key];
            if (!allItems || allItems.length === 0) return;
            const scannedItems = allItems.filter((i) => state.scannedNumbers.has(i.Number));
            const viewItems = allItems.filter((item) =>
                showScanned
                    ? state.scannedNumbers.has(item.Number)
                    : !state.scannedNumbers.has(item.Number)
            );
            const totalCOD = viewItems.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);

            html += `<div class="drp-col">
                <div class="drp-col-header ${GROUP_HEADER_CLASS[key]}">
                    <span>${GROUP_LABELS[key]} <b>${scannedItems.length}/${allItems.length}</b></span>
                    <span>${formatMoney(totalCOD)}</span>
                </div>`;

            viewItems.forEach((item, i) => {
                const zeroClass = isZeroCOD(item) ? ' drp-zero' : '';
                html += `<div class="drp-row${zeroClass}">
                    <span class="drp-idx">${i + 1}</span>
                    <span class="drp-num">${escapeHtml(item.Number)}</span>
                    <span class="drp-name">${escapeHtml(item.PartnerDisplayName || '')}</span>
                    <span class="drp-phone">${escapeHtml(item.Phone || '')}</span>
                    <span class="drp-addr">${escapeHtml(item.Address || '')}</span>
                    <span class="drp-amt">${formatMoney(item.CashOnDelivery || 0)}${isZeroCOD(item) ? ' <span class="drp-zero-badge">0đ</span>' : ''}</span>
                </div>`;
            });

            if (viewItems.length === 0) {
                html +=
                    '<div class="drp-row" style="color:#999;text-align:center;">Không có dữ liệu</div>';
            }
            html += '</div>';
        });

        html += '</div>';
        return html;
    }

    function buildPrintList(items) {
        let html =
            '<table class="drp-table"><thead><tr><th>#</th><th>Số</th><th>Khách hàng</th><th>ĐT</th><th>Địa chỉ</th><th>Công nợ</th></tr></thead><tbody>';
        items.forEach((item, i) => {
            const zeroClass = isZeroCOD(item) ? ' class="drp-zero"' : '';
            html += `<tr${zeroClass}>
                <td>${i + 1}</td>
                <td>${escapeHtml(item.Number)}</td>
                <td>${escapeHtml(item.PartnerDisplayName || '')}</td>
                <td>${escapeHtml(item.Phone || '')}</td>
                <td>${escapeHtml(item.Address || '')}</td>
                <td style="text-align:right;">${formatMoney(item.CashOnDelivery || 0)}</td>
            </tr>`;
        });
        const total = items.reduce((sum, i) => sum + (i.CashOnDelivery || 0), 0);
        html += `<tr style="font-weight:700;border-top:2px solid #333;"><td colspan="5" style="text-align:right;">Tổng:</td><td style="text-align:right;">${formatMoney(total)}</td></tr>`;
        html += '</tbody></table>';
        return html;
    }

    function buildPrintTable() {
        const items = DeliveryReportState.allData || [];
        return buildPrintList(items);
    }

    function printView() {
        // Build preview modal
        const existing = document.getElementById('drPrintPreviewModal');
        if (existing) existing.remove();

        const title = buildPrintTitle();
        const dateStr = buildPrintDate();
        const content = buildPrintContent();

        const modal = document.createElement('div');
        modal.id = 'drPrintPreviewModal';
        modal.className = 'drp-modal-overlay';
        modal.innerHTML = `
            <div class="drp-modal">
                <div class="drp-modal-toolbar">
                    <span style="font-weight:600;font-size:15px;">Xem trước khi in</span>
                    <div style="display:flex;gap:8px;">
                        <button class="drp-btn drp-btn-print" onclick="DeliveryReport.confirmPrint()"><i class="fas fa-print"></i> In</button>
                        <button class="drp-btn drp-btn-close" onclick="document.getElementById('drPrintPreviewModal').remove()"><i class="fas fa-times"></i> Đóng</button>
                    </div>
                </div>
                <div class="drp-paper" id="drPrintPaper">
                    <div class="drp-header">
                        <h2>${escapeHtml(title)}</h2>
                        <div class="drp-date">${escapeHtml(dateStr)}</div>
                    </div>
                    ${content}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    function confirmPrint() {
        const paper = document.getElementById('drPrintPaper');
        if (!paper) return;

        const printWin = window.open('', '_blank', 'width=900,height=700');
        printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>In</title>
        <style>${getPrintCSS()}</style>
        </head><body>${paper.innerHTML}</body></html>`);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => {
            printWin.print();
        }, 300);
    }

    function getPrintCSS() {
        return `
            * { margin:0; padding:0; box-sizing:border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size:11px; color:#111; padding:16px; }
            .drp-header { text-align:center; margin-bottom:14px; padding-bottom:10px; border-bottom:2px solid #333; }
            .drp-header h2 { font-size:16px; margin-bottom:4px; }
            .drp-date { font-size:12px; color:#666; }
            .drp-grid { display:flex; gap:6px; }
            .drp-col { flex:1; border:1px solid #ccc; border-radius:4px; min-width:0; }
            .drp-col-header { display:flex; justify-content:space-between; padding:6px 8px; font-size:11px; font-weight:700; color:white; }
            .dr-province-header-tomato { background:#dc2626; }
            .dr-province-header-nap { background:#2563eb; }
            .dr-province-header-city { background:#d97706; }
            .dr-province-header-shop { background:#059669; }
            .dr-province-header-return { background:#7c3aed; }
            .drp-row { display:flex; align-items:center; gap:4px; padding:3px 6px; border-bottom:1px solid #f0f0f0; font-size:9px; }
            .drp-row.drp-zero { background:#fef9c3; border-left:2px solid #f59e0b; }
            .drp-idx { color:#999; min-width:16px; }
            .drp-num { font-weight:600; min-width:90px; }
            .drp-name { min-width:0; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .drp-phone { color:#666; min-width:75px; white-space:nowrap; }
            .drp-addr { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#555; }
            .drp-amt { text-align:right; white-space:nowrap; min-width:55px; font-weight:500; }
            .drp-zero-badge { background:#f59e0b; color:white; font-size:8px; font-weight:700; padding:1px 4px; border-radius:3px; }
            .drp-table { width:100%; border-collapse:collapse; }
            .drp-table th, .drp-table td { padding:4px 8px; border:1px solid #ddd; font-size:11px; }
            .drp-table th { background:#f3f4f6; font-weight:600; text-align:left; }
            .drp-table tr.drp-zero { background:#fef9c3; }
            @page { size:landscape; margin:10mm; }
        `;
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
            const needRefetch =
                oldFromDate !== DeliveryReportState.filters.fromDate ||
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
            const totalPages = Math.ceil(
                DeliveryReportState.totalCount / DeliveryReportState.pageSize
            );
            if (page < 1 || page > totalPages) return;
            DeliveryReportState.currentPage = page;
            // Client-side pagination: just re-render, no API call
            renderTable();
            renderPagination();
            document
                .getElementById('drTableWrapper')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        unscanGroup: unscanGroup,
        hideOrder: hideOrder,
        printView: printView,
        confirmPrint: confirmPrint,
        getState: () => DeliveryReportState,
    };
})();
