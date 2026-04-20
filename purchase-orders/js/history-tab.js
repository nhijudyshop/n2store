// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * PURCHASE ORDERS MODULE - HISTORY TAB (Lịch sử)
 * File: history-tab.js
 * Purpose: Fetch and display FastPurchaseOrder data from TPOS API with paging
 */

window.PurchaseOrderHistory = (function () {
    'use strict';

    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const PAGE_SIZE = 20;
    const VND_FORMAT = new Intl.NumberFormat('vi-VN');

    let currentPage = 1;
    let totalCount = 0;
    let isLoading = false;
    let currentData = [];
    // Track expanded rows: { orderId: orderLinesData[] }
    const expandedRows = {};
    // Track done rows: Set of orderId (synced to Firestore)
    const doneRows = new Set();
    const DONE_DOC_PATH = 'purchase_history_done/done_invoices';
    let doneLoaded = false;

    // DOM containers (set during init)
    let tableContainer = null;
    let paginationContainer = null;
    let filterContainer = null;
    let statsContainer = null;

    // Filter state
    let filterStartDate = null;
    let filterEndDate = null;
    let searchTerm = '';
    let filterState = ''; // '', 'open', 'paid', 'draft', 'cancel'

    // Summary stats (accumulated from all pages via @odata.count and current page)
    let summaryTotalAmount = 0;
    let summaryTotalResidual = 0;
    let summaryTotalQty = 0;
    let qtyLoading = false;
    // Cache: orderId -> total ProductQty (avoid refetching when paginating back)
    const qtyCache = new Map();
    // Token to invalidate in-flight qty requests when page changes
    let qtyRequestToken = 0;

    /**
     * Initialize with default date range (current month)
     */
    function init() {
        tableContainer = document.getElementById('tableContainer');
        paginationContainer = document.getElementById('pagination');
        filterContainer = document.getElementById('filterBar');

        // Default: current month
        const now = new Date();
        filterStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
        filterEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        renderHistoryFilterBar();
        loadDoneRows().then(() => loadPage(1));
    }

    let doneUnsubscribe = null;

    /**
     * Load done rows from Firestore with real-time sync
     */
    function getDb() {
        return window.db || (typeof getFirestore === 'function' ? getFirestore() : null) || firebase.firestore();
    }

    async function loadDoneRows() {
        // Always re-subscribe if listener was destroyed
        if (doneLoaded && doneUnsubscribe) return;
        try {
            const db = getDb();
            // Initial load
            if (!doneLoaded) {
                const doc = await db.doc(DONE_DOC_PATH).get();
                if (doc.exists) {
                    const ids = doc.data().ids || [];
                    ids.forEach(id => doneRows.add(id));
                    console.log('[History] Loaded done rows:', ids.length);
                } else {
                    console.log('[History] No done rows doc yet');
                }
                doneLoaded = true;
            }

            // Real-time listener for cross-device sync
            if (!doneUnsubscribe) {
                doneUnsubscribe = db.doc(DONE_DOC_PATH).onSnapshot((snap) => {
                    if (!snap.exists) return;
                    const ids = new Set(snap.data().ids || []);
                    const changed = ids.size !== doneRows.size || [...ids].some(id => !doneRows.has(id));
                    if (!changed) return;
                    doneRows.clear();
                    ids.forEach(id => doneRows.add(id));
                    if (currentData.length > 0) {
                        renderTable(currentData);
                        renderPagination();
                    }
                });
            }
        } catch (e) {
            console.error('[History] Failed to load done rows:', e);
        }
    }

    /**
     * Save done rows to Firestore
     */
    function saveDoneRows() {
        try {
            const db = getDb();
            const data = { ids: Array.from(doneRows), lastUpdated: Date.now() };
            console.log('[History] Saving done rows...', data.ids.length);
            db.doc(DONE_DOC_PATH).set(data)
                .then(() => console.log('[History] Done rows saved OK'))
                .catch(e => console.error('[History] Firestore save error:', e));
        } catch (e) {
            console.error('[History] Failed to save done rows:', e);
        }
    }

    /**
     * Render a simplified filter bar for history tab
     */
    function renderHistoryFilterBar() {
        if (!filterContainer) return;

        const fmt = (d) => {
            if (!d) return '';
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        filterContainer.innerHTML = `
            <div class="history-stats-bar" id="historyStatsBar"></div>
            <div class="filter-bar">
                <div class="filter-group">
                    <label class="filter-label">Từ ngày</label>
                    <div class="input-icon">
                        <i data-lucide="calendar"></i>
                        <input type="date" id="historyStartDate" class="filter-input" value="${fmt(filterStartDate)}">
                    </div>
                </div>
                <div class="filter-group">
                    <label class="filter-label">Đến ngày</label>
                    <div class="input-icon">
                        <i data-lucide="calendar"></i>
                        <input type="date" id="historyEndDate" class="filter-input" value="${fmt(filterEndDate)}">
                    </div>
                </div>
                <div class="filter-group">
                    <label class="filter-label">Trạng thái</label>
                    <div class="input-icon">
                        <i data-lucide="filter"></i>
                        <select id="historyStateFilter" class="filter-input">
                            <option value="">Tất cả</option>
                            <option value="draft"${filterState === 'draft' ? ' selected' : ''}>Nháp</option>
                            <option value="open"${filterState === 'open' ? ' selected' : ''}>Đã xác nhận</option>
                            <option value="paid"${filterState === 'paid' ? ' selected' : ''}>Đã thanh toán</option>
                            <option value="cancel"${filterState === 'cancel' ? ' selected' : ''}>Huỷ bỏ</option>
                        </select>
                    </div>
                </div>
                <div class="filter-group filter-group--search">
                    <label class="filter-label">Tìm NCC</label>
                    <div class="input-icon">
                        <i data-lucide="search"></i>
                        <input type="text" id="historySearchInput" class="filter-input"
                               value="${searchTerm}"
                               placeholder="Tên NCC... (Enter để tìm)">
                    </div>
                </div>
                <div class="filter-group filter-group--actions">
                    <button id="btnHistoryReload" class="btn btn-outline" title="Tải lại bảng">
                        <i data-lucide="refresh-cw"></i>
                    </button>
                </div>
            </div>
        `;

        statsContainer = document.getElementById('historyStatsBar');

        if (typeof lucide !== 'undefined') lucide.createIcons();

        const applyFilters = () => {
            const s = document.getElementById('historyStartDate').value;
            const e = document.getElementById('historyEndDate').value;
            filterStartDate = s ? new Date(s) : null;
            filterEndDate = e ? new Date(e + 'T23:59:59') : null;
            searchTerm = (document.getElementById('historySearchInput').value || '').trim();
            filterState = document.getElementById('historyStateFilter').value;
            loadPage(1);
        };

        document.getElementById('btnHistoryReload').addEventListener('click', () => loadPage(currentPage));
        document.getElementById('historyStateFilter').addEventListener('change', applyFilters);

        document.getElementById('historyStartDate').addEventListener('change', applyFilters);
        document.getElementById('historyEndDate').addEventListener('change', applyFilters);

        const searchInput = document.getElementById('historySearchInput');
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyFilters();
            }
        });
        // Clear search: when input is emptied, reload full list
        searchInput.addEventListener('input', () => {
            if (searchInput.value === '' && searchTerm !== '') {
                searchTerm = '';
                loadPage(1);
            }
        });
    }

    /**
     * Render the summary stats bar above the table
     */
    function renderStatsBar() {
        if (!statsContainer) return;
        const qtyDisplay = qtyLoading
            ? '<span style="opacity:0.6;">đang tính...</span>'
            : `<strong>${VND_FORMAT.format(summaryTotalQty)}</strong> SP`;
        statsContainer.innerHTML = `
            <div class="history-stats">
                <span class="history-stats__item">
                    <i data-lucide="file-text" style="width:14px;height:14px;"></i>
                    <strong>${VND_FORMAT.format(totalCount)}</strong> phiếu
                </span>
                <span class="history-stats__sep">|</span>
                <span class="history-stats__item">
                    Tổng: <strong>${formatMoney(summaryTotalAmount)} đ</strong>
                </span>
                <span class="history-stats__sep">|</span>
                <span class="history-stats__item history-stats__item--debt">
                    Nợ: <strong>${formatMoney(summaryTotalResidual)} đ</strong>
                </span>
                <span class="history-stats__sep">|</span>
                <span class="history-stats__item" title="Tổng số lượng sản phẩm trong trang hiện tại">
                    <i data-lucide="package" style="width:14px;height:14px;"></i>
                    SL: ${qtyDisplay}
                </span>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /**
     * Build the OData URL for FastPurchaseOrder
     */
    function buildUrl(page) {
        const skip = (page - 1) * PAGE_SIZE;
        let url = `${PROXY_URL}/api/odata/FastPurchaseOrder/OdataService.GetView?&$top=${PAGE_SIZE}`;
        if (skip > 0) url += `&$skip=${skip}`;
        url += `&$orderby=DateInvoice+desc,Id+desc`;

        // Build filter
        const filters = ["Type eq 'invoice'"];
        if (filterStartDate) {
            const iso = toUTCISOString(filterStartDate);
            filters.push(`DateInvoice ge ${iso}`);
        }
        if (filterEndDate) {
            const iso = toUTCISOString(filterEndDate);
            filters.push(`DateInvoice le ${iso}`);
        }
        if (filterState) {
            filters.push(`State eq '${filterState}'`);
        }
        if (searchTerm) {
            // Remove Vietnamese diacritics for PartnerNameNoSign search
            const normalized = removeVietnameseDiacritics(searchTerm).toLowerCase();
            filters.push(`contains(PartnerNameNoSign,'${encodeODataString(normalized)}')`);
        }
        url += `&$filter=(${filters.join(' and ')})`;
        url += `&$count=true`;

        return url;
    }

    /**
     * Convert date to UTC ISO string for OData filter (offset +07:00 -> subtract 7h)
     */
    function toUTCISOString(date) {
        const utc = new Date(date.getTime() - 7 * 60 * 60 * 1000);
        // Encode special chars: + -> %2B, : -> %3A (OData URL requires this)
        return utc.toISOString().replace('Z', '%2B00%3A00').replaceAll(':', '%3A');
    }

    /**
     * Load a page of data from TPOS API
     */
    async function loadPage(page) {
        if (isLoading) return;
        isLoading = true;
        currentPage = page;

        renderLoading();

        try {
            if (!window.TPOSClient?.authenticatedFetch) {
                throw new Error('TPOSClient not available');
            }
            const url = buildUrl(page);

            const response = await window.TPOSClient.authenticatedFetch(url);

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            totalCount = data['@odata.count'] || 0;
            currentData = data.value || [];

            // Compute summary stats from current page data
            summaryTotalAmount = currentData.reduce((sum, item) => sum + (item.AmountTotal || 0), 0);
            summaryTotalResidual = currentData.reduce((sum, item) => sum + (item.Residual || 0), 0);
            summaryTotalQty = 0;
            qtyLoading = currentData.length > 0;

            renderStatsBar();
            renderTable(currentData);
            renderPagination();

            loadPageQtyStats(currentData, ++qtyRequestToken);
        } catch (error) {
            console.error('[History] Load failed:', error);
            renderError(error.message);
        } finally {
            isLoading = false;
        }
    }

    /**
     * Render the SL cell content for a given order (from cache or placeholder)
     */
    function renderQtyCell(orderId) {
        if (qtyCache.has(orderId)) {
            return VND_FORMAT.format(qtyCache.get(orderId));
        }
        return '<span style="opacity:0.4;">...</span>';
    }

    /**
     * Update a single row's SL cell in the DOM
     */
    function updateQtyCell(orderId, qty) {
        if (!tableContainer) return;
        const cell = tableContainer.querySelector(`.history-qty-cell[data-order-id="${orderId}"]`);
        if (cell) cell.textContent = VND_FORMAT.format(qty);
    }

    /**
     * Load total product quantity per order on the current page in parallel,
     * cache results, update each row's SL cell, and update the stats bar total.
     * Aborts if a newer request starts.
     */
    async function loadPageQtyStats(items, token) {
        if (!items || items.length === 0) {
            qtyLoading = false;
            summaryTotalQty = 0;
            renderStatsBar();
            return;
        }
        try {
            const qtys = await Promise.all(items.map(async item => {
                if (qtyCache.has(item.Id)) {
                    return qtyCache.get(item.Id);
                }
                try {
                    const url = `${PROXY_URL}/api/odata/FastPurchaseOrder(${item.Id})/OrderLines?$select=ProductQty`;
                    const res = await window.TPOSClient.authenticatedFetch(url);
                    if (!res.ok) return 0;
                    const data = await res.json();
                    const qty = (data.value || []).reduce((s, l) => s + (l.ProductQty || 0), 0);
                    qtyCache.set(item.Id, qty);
                    if (token === qtyRequestToken) updateQtyCell(item.Id, qty);
                    return qty;
                } catch (_e) {
                    return 0;
                }
            }));
            if (token !== qtyRequestToken) return; // Stale response
            // Paint any cached rows we skipped (in case DOM was re-rendered between fetches)
            items.forEach(item => {
                if (qtyCache.has(item.Id)) updateQtyCell(item.Id, qtyCache.get(item.Id));
            });
            summaryTotalQty = qtys.reduce((s, q) => s + q, 0);
            qtyLoading = false;
            renderStatsBar();
        } catch (err) {
            console.warn('[History] loadPageQtyStats failed:', err);
            if (token === qtyRequestToken) {
                qtyLoading = false;
                renderStatsBar();
            }
        }
    }

    /**
     * Format number as VND (with dot separator)
     */
    function formatMoney(value) {
        if (!value && value !== 0) return '0';
        return VND_FORMAT.format(value);
    }

    /**
     * Format date from ISO string - short dd/mm format
     */
    function formatDateShort(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}`;
    }

    /**
     * Format date from ISO string - full format
     */
    function formatDate(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year}\n${hours}:${minutes}`;
    }

    /**
     * Truncate string to maxLen chars with ellipsis
     */
    function truncate(str, maxLen) {
        if (!str) return '';
        return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
    }

    /**
     * Render payment status badge
     */
    function renderPaymentBadge(residual, amountTotal) {
        if (residual === 0 || residual == null) {
            return '<span class="status-badge" style="background:#d1fae5;color:#059669;border:1px solid #a7f3d0;font-size:11px;">Đã TT</span>';
        }
        if (residual > 0 && residual < amountTotal) {
            return '<span class="status-badge" style="background:#fef3c7;color:#d97706;border:1px solid #fde68a;font-size:11px;">TT 1 phần</span>';
        }
        return '<span class="status-badge" style="background:#fee2e2;color:#dc2626;border:1px solid #fecaca;font-size:11px;">Chưa TT</span>';
    }

    /**
     * Render the history table
     */
    function renderTable(items) {
        if (!tableContainer) return;

        if (!items || items.length === 0) {
            tableContainer.innerHTML = `
                <div class="table-empty">
                    <div class="table-empty__icon"><i data-lucide="inbox"></i></div>
                    <div class="table-empty__title">Không có dữ liệu</div>
                    <div class="table-empty__description">Không tìm thấy hóa đơn nào trong khoảng thời gian này</div>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const startIdx = (currentPage - 1) * PAGE_SIZE;

        const rows = items.map((item, idx) => {
            const rowNum = startIdx + idx + 1;
            const isExpanded = !!expandedRows[item.Id];
            const isDone = doneRows.has(item.Id);
            const residual = item.Residual ?? 0;
            const amountTotal = item.AmountTotal || 0;
            const residualColor = residual > 0 ? 'var(--color-danger, #dc2626)' : 'var(--color-success, #22c55e)';

            return `
                <tr class="order-row ${idx === 0 ? 'order-row--first' : ''} ${isExpanded ? 'order-row--expanded' : ''} ${isDone ? 'order-row--done' : ''}"
                    data-order-id="${item.Id}" style="border-top: ${idx > 0 ? '1px solid var(--color-border-light)' : 'none'}; cursor: pointer; position: relative;">
                    <td style="width:32px;text-align:center;font-size:12px;color:var(--color-text-muted);">${rowNum}</td>
                    <td>
                        <span style="font-family:monospace;font-size:12px;color:var(--color-text-secondary);" title="${escapeHtml(item.Number || '')}">${escapeHtml(item.Number || '')}</span>
                    </td>
                    <td>
                        <span class="supplier-name" title="${escapeHtml(item.PartnerDisplayName || '')}">${escapeHtml(truncate(item.PartnerDisplayName || '', 25))}</span>
                    </td>
                    <td style="text-align:center;">
                        <span class="date-main">${formatDateShort(item.DateInvoice)}</span>
                    </td>
                    <td class="text-right history-qty-cell" data-order-id="${item.Id}" style="width:50px;font-weight:600;color:var(--color-text-secondary);">${renderQtyCell(item.Id)}</td>
                    <td class="text-right"><span class="price-value">${formatMoney(amountTotal)}</span></td>
                    <td class="text-right">
                        <span style="font-weight:600;color:${residualColor};">${formatMoney(residual)}</span>
                        <div style="margin-top:2px;">${renderPaymentBadge(residual, amountTotal)}</div>
                    </td>
                    <td class="td-status ${isDone ? 'td-status--done' : ''}">${renderState(item.ShowState, item.State)}${isDone ? '<span class="done-check-icon">✓</span>' : ''}</td>
                    <td><span style="font-size:12px;" title="${escapeHtml(item.UserName || '')}">${escapeHtml(truncate(item.UserName || '', 10))}</span></td>
                    <td style="white-space:nowrap;" onclick="event.stopPropagation();">
                        <div style="display:flex;align-items:center;gap:4px;">
                            <button class="btn-icon-sm history-print-btn" data-id="${item.Id}" title="In phiếu">
                                <i data-lucide="printer" style="width:14px;height:14px;"></i>
                            </button>
                            <label class="history-done-toggle" title="${isDone ? 'Bỏ đánh dấu Done' : 'Đánh dấu Done'}">
                                <input type="checkbox" class="history-done-cb" data-id="${item.Id}" ${isDone ? 'checked' : ''}>
                                <span class="history-done-toggle__indicator ${isDone ? 'history-done-toggle__indicator--on' : ''}">
                                    ${isDone ? '✓' : ''}
                                </span>
                            </label>
                        </div>
                    </td>
                </tr>
                <tr class="expand-row" id="expand-${item.Id}" style="display: ${isExpanded ? 'table-row' : 'none'};">
                    <td colspan="10" style="padding: 0; background: #f8fafc;">
                        <div class="expand-content" id="expand-content-${item.Id}">
                            ${isExpanded ? renderExpandedContent(item.Id, item) : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tableContainer.innerHTML = `
            <div class="table-wrapper">
                <table class="po-table history-table">
                    <thead>
                        <tr>
                            <th style="width:32px;text-align:center;">#</th>
                            <th>Số phiếu</th>
                            <th>NCC</th>
                            <th style="width:60px;text-align:center;">Ngày</th>
                            <th class="text-right" style="width:50px;" title="Tổng số lượng sản phẩm">SL</th>
                            <th class="text-right">Tổng tiền</th>
                            <th class="text-right" style="width:120px;">Còn nợ</th>
                            <th class="th-filter-wrap" style="width:110px;">
                                <span>Trạng thái</span>
                                <span class="th-filter-icon" id="thStatusFilterBtn" title="Lọc trạng thái">
                                    <i data-lucide="filter" style="width:14px;height:14px;"></i>
                                </span>
                                <div class="th-filter-dropdown" id="thStatusDropdown" style="display:none;">
                                    <div class="th-filter-option ${filterState === '' ? 'active' : ''}" data-state="">Tất cả</div>
                                    <div class="th-filter-option ${filterState === 'draft' ? 'active' : ''}" data-state="draft">Nháp</div>
                                    <div class="th-filter-option ${filterState === 'open' ? 'active' : ''}" data-state="open">Đã xác nhận</div>
                                    <div class="th-filter-option ${filterState === 'paid' ? 'active' : ''}" data-state="paid">Đã thanh toán</div>
                                    <div class="th-filter-option ${filterState === 'cancel' ? 'active' : ''}" data-state="cancel">Hủy bỏ</div>
                                </div>
                            </th>
                            <th style="width:70px;">NV</th>
                            <th style="width:80px;">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Bind row click to toggle expand
        tableContainer.querySelectorAll('tr.order-row[data-order-id]').forEach(row => {
            row.addEventListener('click', () => {
                const orderId = parseInt(row.dataset.orderId, 10);
                toggleExpandRow(orderId);
            });
        });

        // Bind print buttons
        tableContainer.querySelectorAll('.history-print-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                window.open(`https://tomato.tpos.vn/FastPurchaseOrder/Print/${id}`, '_blank');
            });
        });

        // Bind checkbox for Done watermark (persisted to Firestore)
        tableContainer.querySelectorAll('.history-done-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const id = parseInt(cb.dataset.id, 10);
                const row = tableContainer.querySelector(`tr.order-row[data-order-id="${id}"]`);
                const statusTd = row?.querySelector('.td-status');
                const indicator = cb.closest('.history-done-toggle')?.querySelector('.history-done-toggle__indicator');
                if (cb.checked) {
                    doneRows.add(id);
                    row?.classList.add('order-row--done');
                    statusTd?.classList.add('td-status--done');
                    if (statusTd && !statusTd.querySelector('.done-check-icon')) {
                        statusTd.insertAdjacentHTML('beforeend', '<span class="done-check-icon">✓</span>');
                    }
                    if (indicator) {
                        indicator.classList.add('history-done-toggle__indicator--on');
                        indicator.textContent = '✓';
                    }
                } else {
                    doneRows.delete(id);
                    row?.classList.remove('order-row--done');
                    statusTd?.classList.remove('td-status--done');
                    statusTd?.querySelector('.done-check-icon')?.remove();
                    if (indicator) {
                        indicator.classList.remove('history-done-toggle__indicator--on');
                        indicator.textContent = '';
                    }
                }
                saveDoneRows();
            });
        });

        // Bind column header status filter dropdown
        const filterBtn = document.getElementById('thStatusFilterBtn');
        const filterDropdown = document.getElementById('thStatusDropdown');
        if (filterBtn && filterDropdown) {
            filterBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                filterDropdown.style.display = filterDropdown.style.display === 'none' ? 'block' : 'none';
            });
            filterDropdown.querySelectorAll('.th-filter-option').forEach(opt => {
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    filterState = opt.dataset.state;
                    // Sync the filter bar dropdown
                    const sel = document.getElementById('historyStateFilter');
                    if (sel) sel.value = filterState;
                    filterDropdown.style.display = 'none';
                    loadPage(1);
                });
            });
            // Close dropdown when clicking outside
            document.addEventListener('click', () => {
                filterDropdown.style.display = 'none';
            });
        }
    }

    /**
     * Toggle expand/collapse for a row
     */
    async function toggleExpandRow(orderId) {
        const expandRow = document.getElementById(`expand-${orderId}`);
        const contentDiv = document.getElementById(`expand-content-${orderId}`);
        const mainRow = tableContainer.querySelector(`tr.order-row[data-order-id="${orderId}"]`);
        if (!expandRow || !contentDiv) return;

        if (expandedRows[orderId]) {
            // Collapse
            delete expandedRows[orderId];
            expandRow.style.display = 'none';
            mainRow?.classList.remove('order-row--expanded');
            return;
        }

        // Expand: show loading, fetch data
        expandRow.style.display = 'table-row';
        mainRow?.classList.add('order-row--expanded');

        const item = currentData.find(d => d.Id === orderId);
        contentDiv.innerHTML = '<div style="padding: 12px 16px; color: var(--color-text-muted); font-size: 13px;">Đang tải chi tiết...</div>';

        try {
            // Ensure Notes items are loaded so we can check existing keys
            if (window.PurchaseOrderNotes?.loadItems) {
                await window.PurchaseOrderNotes.loadItems();
            }
            const url = `${PROXY_URL}/api/odata/FastPurchaseOrder(${orderId})/OrderLines?$expand=Product,ProductUOM,Account`;
            const response = await window.TPOSClient.authenticatedFetch(url);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const data = await response.json();
            const lines = data.value || [];
            expandedRows[orderId] = lines;
            contentDiv.innerHTML = renderExpandedContent(orderId, item, lines);
            if (typeof lucide !== 'undefined') lucide.createIcons();
            bindNoteCheckboxes(contentDiv);
        } catch (error) {
            console.error('[History] Expand failed:', error);
            contentDiv.innerHTML = `<div style="padding: 12px 16px; color: var(--color-danger); font-size: 13px;">Lỗi: ${escapeHtml(error.message)}</div>`;
        }
    }

    /**
     * Get product thumbnail URL (128px version)
     */
    function getProductThumb(line) {
        // Product.Thumbnails is typically an array: [0]=64px, [1]=128px
        const thumbnails = line.Product?.Thumbnails;
        if (thumbnails && thumbnails.length > 1) {
            return thumbnails[1];
        }
        if (thumbnails && thumbnails.length > 0) {
            return thumbnails[0];
        }
        return null;
    }

    /**
     * Render expanded detail content (order lines table with product images)
     */
    function renderExpandedContent(orderId, item, lines) {
        if (!lines) lines = expandedRows[orderId];
        if (!lines || lines.length === 0) {
            return '<div style="padding: 12px 16px; color: var(--color-text-muted); font-size: 13px;">Không có chi tiết sản phẩm</div>';
        }

        const supplierName = item?.PartnerDisplayName || '';
        const lineRows = lines.map((line, idx) => {
            const lineKey = `${orderId}_${line.Id}`;
            const alreadyInNotes = window.PurchaseOrderNotes?.hasKey?.(lineKey) || false;
            const thumbUrl = getProductThumb(line);
            const productCode = line.ProductBarcode || line.Product?.DefaultCode || '';
            const productName = line.Name || line.ProductNameGet || line.ProductName || '';

            return `
            <tr class="expand-line-row"${alreadyInNotes ? ' style="opacity: 0.5;"' : ''}>
                <td style="text-align: center; width: 40px;">${idx + 1}</td>
                <td style="width:48px;text-align:center;">
                    ${thumbUrl
                        ? `<img src="${escapeHtml(thumbUrl)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb;">`
                        : '<div style="width:40px;height:40px;background:#f1f5f9;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:11px;">N/A</div>'
                    }
                </td>
                <td style="width:100px;">
                    <span style="font-family:monospace;font-size:12px;color:var(--color-text-secondary);background:#f1f5f9;padding:1px 4px;border-radius:3px;">${escapeHtml(productCode)}</span>
                </td>
                <td style="font-weight: 500;">${escapeHtml(productName)}</td>
                <td style="text-align: right; width: 60px; font-weight:600;">${line.ProductQty ?? ''}</td>
                <td style="text-align: right; width: 100px;">${formatMoney(line.PriceUnit)}</td>
                <td style="text-align: right; width: 110px; font-weight:600;">${formatMoney(line.PriceSubTotal)}</td>
                <td style="text-align: center; width: 36px;">
                    <input type="checkbox" class="note-product-cb" title="Thêm vào Ghi chú"
                           data-key="${lineKey}"
                           data-order-id="${orderId}"
                           data-line-id="${line.Id}"
                           data-product-name="${escapeHtml(productName)}"
                           data-product-code="${escapeHtml(productCode)}"
                           data-supplier="${escapeHtml(supplierName)}"
                           data-qty="${line.ProductQty || 0}"
                           data-price="${line.PriceUnit || 0}"
                           ${alreadyInNotes ? 'checked disabled' : ''}
                           style="width: 15px; height: 15px; cursor: pointer; accent-color: #3b82f6;">
                </td>
            </tr>`;
        }).join('');

        const totalAmount = item?.AmountTotal || lines.reduce((s, l) => s + (l.PriceSubTotal || 0), 0);
        const residual = item?.Residual ?? totalAmount;

        return `
            <div style="padding: 8px 16px 12px 16px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background: #e2e8f0; font-weight: 600;">
                            <th style="padding: 6px 8px; text-align: center; width: 40px;">STT</th>
                            <th style="padding: 6px 8px; text-align: center; width: 48px;">Ảnh</th>
                            <th style="padding: 6px 8px; text-align: left; width: 100px;">Mã SP</th>
                            <th style="padding: 6px 8px; text-align: left;">Sản phẩm</th>
                            <th style="padding: 6px 8px; text-align: right; width: 60px;">SL</th>
                            <th style="padding: 6px 8px; text-align: right; width: 100px;">Đơn giá</th>
                            <th style="padding: 6px 8px; text-align: right; width: 110px;">Tổng</th>
                            <th style="padding: 6px 8px; text-align: center; width: 36px;" title="Ghi chú">📝</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lineRows}
                        <tr style="border-top: 2px solid #cbd5e1;">
                            <td colspan="6" style="padding: 6px 8px; text-align: right; font-weight: 600;">Tổng tiền:</td>
                            <td style="padding: 6px 8px; text-align: right; font-weight: 700; font-size:14px;">${formatMoney(totalAmount)} đ</td>
                            <td></td>
                        </tr>
                        <tr>
                            <td colspan="6" style="padding: 6px 8px; text-align: right; font-weight: 600;">Còn nợ:</td>
                            <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: ${residual > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">${formatMoney(residual)} đ</td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Bind note checkboxes inside expanded content
     */
    function bindNoteCheckboxes(container) {
        container.querySelectorAll('.note-product-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    const noteItem = {
                        key: cb.dataset.key,
                        orderId: parseInt(cb.dataset.orderId, 10),
                        lineId: parseInt(cb.dataset.lineId, 10),
                        productName: cb.dataset.productName,
                        productCode: cb.dataset.productCode,
                        supplierName: cb.dataset.supplier,
                        quantity: parseFloat(cb.dataset.qty) || 0,
                        priceUnit: parseFloat(cb.dataset.price) || 0,
                        note: `${cb.dataset.supplier} bán dùm`,
                        createdAt: Date.now()
                    };
                    if (window.PurchaseOrderNotes?.addItem) {
                        window.PurchaseOrderNotes.addItem(noteItem);
                    }
                    cb.disabled = true;
                    cb.closest('tr').style.opacity = '0.5';
                } else {
                    if (window.PurchaseOrderNotes?.removeByKey) {
                        window.PurchaseOrderNotes.removeByKey(cb.dataset.key);
                    }
                }
            });
        });
    }

    /**
     * Render state badge matching the screenshot style
     */
    function renderState(showState, state) {
        const colors = {
            'open': { bg: '#d1fae5', text: '#059669', border: '#a7f3d0' },
            'paid': { bg: '#dbeafe', text: '#2563eb', border: '#bfdbfe' },
            'draft': { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
            'cancel': { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' }
        };
        const c = colors[state] || colors['open'];
        return `<span class="status-badge" style="background: ${c.bg}; color: ${c.text}; border: 1px solid ${c.border};">${escapeHtml(showState || state || '')}</span>`;
    }

    /**
     * Render pagination controls
     */
    function renderPagination() {
        if (!paginationContainer) return;

        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        if (totalPages <= 0) {
            paginationContainer.innerHTML = '';
            return;
        }

        const startItem = totalCount > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
        const endItem = Math.min(currentPage * PAGE_SIZE, totalCount);

        // Generate page numbers
        const pages = generatePageNumbers(currentPage, totalPages, 5);

        paginationContainer.innerHTML = `
            <div class="pagination">
                <div class="pagination__info">
                    Hiển thị ${startItem} - ${endItem} trong ${totalCount} hóa đơn
                </div>
                <div class="pagination__controls">
                    ${totalPages > 1 ? `
                        <button class="pagination__btn pagination__btn--prev ${currentPage <= 1 ? 'disabled' : ''}"
                                data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>
                            <i data-lucide="chevron-left"></i>
                        </button>

                        ${pages.map(p => {
                            if (p === '...') return '<span class="pagination__ellipsis">...</span>';
                            const isActive = p === currentPage;
                            return `<button class="pagination__btn pagination__btn--page ${isActive ? 'active' : ''}"
                                            data-page="${p}" ${isActive ? 'disabled' : ''}>${p}</button>`;
                        }).join('')}

                        <button class="pagination__btn pagination__btn--next ${currentPage >= totalPages ? 'disabled' : ''}"
                                data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>
                            <i data-lucide="chevron-right"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Bind click handlers
        paginationContainer.querySelectorAll('.pagination__btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page, 10);
                if (!isNaN(page) && page >= 1 && page <= totalPages) {
                    loadPage(page);
                }
            });
        });
    }

    /**
     * Generate page numbers array
     */
    function generatePageNumbers(current, total, maxVisible) {
        if (total <= maxVisible) {
            return Array.from({ length: total }, (_, i) => i + 1);
        }

        const pages = [];
        const half = Math.floor(maxVisible / 2);
        let start = current - half;
        let end = current + half;

        if (start < 1) { start = 1; end = maxVisible; }
        if (end > total) { end = total; start = total - maxVisible + 1; }

        if (start > 1) {
            pages.push(1);
            if (start > 2) pages.push('...');
        }

        for (let i = start; i <= end; i++) {
            if (i >= 1 && i <= total && !pages.includes(i)) pages.push(i);
        }

        if (end < total) {
            if (end < total - 1) pages.push('...');
            if (!pages.includes(total)) pages.push(total);
        }

        return pages;
    }

    /**
     * Render loading state
     */
    function renderLoading() {
        if (!tableContainer) return;
        tableContainer.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <div class="loading-text">Đang tải dữ liệu lịch sử...</div>
            </div>
        `;
        if (paginationContainer) paginationContainer.innerHTML = '';
    }

    /**
     * Render error state
     */
    function renderError(message) {
        if (!tableContainer) return;
        tableContainer.innerHTML = `
            <div class="error-state">
                <div class="error-state__icon"><i data-lucide="alert-circle"></i></div>
                <div class="error-state__title">Không thể tải dữ liệu</div>
                <div class="error-state__description">${escapeHtml(message)}</div>
                <button class="btn btn-outline" onclick="window.PurchaseOrderHistory.reload()">
                    <i data-lucide="refresh-cw"></i>
                    <span>Thử lại</span>
                </button>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /**
     * View detail - open TPOS URL for this invoice
     */
    function viewDetail(id) {
        window.open(`https://tomato.tpos.vn/FastPurchaseOrder/Edit/${id}`, '_blank');
    }

    /**
     * Remove Vietnamese diacritics for search (PartnerNameNoSign is already without diacritics)
     */
    function removeVietnameseDiacritics(str) {
        if (window.ProductCodeGenerator?.removeVietnameseDiacritics) {
            return window.ProductCodeGenerator.removeVietnameseDiacritics(str);
        }
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D');
    }

    /**
     * Escape single quotes for OData string values
     */
    function encodeODataString(str) {
        return str.replace(/'/g, "''");
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Reload current page
     */
    function reload() {
        loadPage(currentPage);
    }

    /**
     * Destroy / cleanup when switching away from history tab
     */
    function destroy() {
        currentData = [];
        currentPage = 1;
        totalCount = 0;
        searchTerm = '';
        filterState = '';
        summaryTotalAmount = 0;
        summaryTotalResidual = 0;
        // Clear expanded state
        Object.keys(expandedRows).forEach(k => delete expandedRows[k]);
        // Unsubscribe real-time listener
        if (doneUnsubscribe) {
            doneUnsubscribe();
            doneUnsubscribe = null;
        }
    }

    return {
        init,
        destroy,
        reload,
        viewDetail
    };
})();

console.log('[Purchase Orders] History tab loaded');
