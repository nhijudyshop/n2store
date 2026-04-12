// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * PURCHASE ORDERS MODULE - REFUND TAB (Trả hàng NCC)
 * File: refund-tab.js
 * Purpose: Fetch and display FastPurchaseOrder refunds from TPOS API with paging
 * TPOS filter: Type eq 'refund' (trả hàng cho NCC)
 */

window.PurchaseOrderRefunds = (function () {
    'use strict';

    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const PAGE_SIZE = 20;

    let currentPage = 1;
    let totalCount = 0;
    let isLoading = false;
    let currentData = [];
    const expandedRows = {};

    let tableContainer = null;
    let paginationContainer = null;
    let filterContainer = null;

    // Filter state
    let filterStartDate = null;
    let filterEndDate = null;
    let searchTerm = '';
    let filterState = '';

    function init() {
        tableContainer = document.getElementById('tableContainer');
        paginationContainer = document.getElementById('pagination');
        filterContainer = document.getElementById('filterBar');

        const now = new Date();
        filterStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
        filterEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        renderFilterBar();
        loadPage(1);
    }

    function renderFilterBar() {
        if (!filterContainer) return;

        const fmt = (d) => {
            if (!d) return '';
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        filterContainer.innerHTML = `
            <div class="filter-bar">
                <div class="filter-group">
                    <label class="filter-label">Từ ngày</label>
                    <div class="input-icon">
                        <i data-lucide="calendar"></i>
                        <input type="date" id="refundStartDate" class="filter-input" value="${fmt(filterStartDate)}">
                    </div>
                </div>
                <div class="filter-group">
                    <label class="filter-label">Đến ngày</label>
                    <div class="input-icon">
                        <i data-lucide="calendar"></i>
                        <input type="date" id="refundEndDate" class="filter-input" value="${fmt(filterEndDate)}">
                    </div>
                </div>
                <div class="filter-group">
                    <label class="filter-label">Trạng thái</label>
                    <div class="input-icon">
                        <i data-lucide="filter"></i>
                        <select id="refundStateFilter" class="filter-input">
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
                        <input type="text" id="refundSearchInput" class="filter-input"
                               value="${searchTerm}"
                               placeholder="Tên NCC... (Enter để tìm)">
                    </div>
                </div>
                <div class="filter-group filter-group--actions">
                    <button id="btnRefundReload" class="btn btn-outline" title="Tải lại">
                        <i data-lucide="refresh-cw"></i>
                    </button>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        const applyFilters = () => {
            const s = document.getElementById('refundStartDate').value;
            const e = document.getElementById('refundEndDate').value;
            filterStartDate = s ? new Date(s) : null;
            filterEndDate = e ? new Date(e + 'T23:59:59') : null;
            searchTerm = (document.getElementById('refundSearchInput').value || '').trim();
            filterState = document.getElementById('refundStateFilter').value;
            loadPage(1);
        };

        document.getElementById('btnRefundReload').addEventListener('click', () => loadPage(currentPage));
        document.getElementById('refundStateFilter').addEventListener('change', applyFilters);
        document.getElementById('refundStartDate').addEventListener('change', applyFilters);
        document.getElementById('refundEndDate').addEventListener('change', applyFilters);

        const searchInput = document.getElementById('refundSearchInput');
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); applyFilters(); }
        });
        searchInput.addEventListener('input', () => {
            if (searchInput.value === '' && searchTerm !== '') {
                searchTerm = '';
                loadPage(1);
            }
        });
    }

    function buildUrl(page) {
        const skip = (page - 1) * PAGE_SIZE;
        let url = `${PROXY_URL}/api/odata/FastPurchaseOrder/OdataService.GetView?&$top=${PAGE_SIZE}`;
        if (skip > 0) url += `&$skip=${skip}`;
        url += `&$orderby=DateInvoice+desc,Id+desc`;

        const filters = ["Type eq 'refund'"];
        if (filterStartDate) filters.push(`DateInvoice ge ${toUTCISOString(filterStartDate)}`);
        if (filterEndDate) filters.push(`DateInvoice le ${toUTCISOString(filterEndDate)}`);
        if (filterState) filters.push(`State eq '${filterState}'`);
        if (searchTerm) {
            const normalized = removeVietnameseDiacritics(searchTerm).toLowerCase();
            filters.push(`contains(PartnerNameNoSign,'${encodeODataString(normalized)}')`);
        }
        url += `&$filter=(${filters.join(' and ')})`;
        url += `&$count=true`;
        return url;
    }

    function toUTCISOString(date) {
        const utc = new Date(date.getTime() - 7 * 60 * 60 * 1000);
        return utc.toISOString().replace('Z', '%2B00%3A00').replaceAll(':', '%3A');
    }

    async function loadPage(page) {
        if (isLoading) return;
        isLoading = true;
        currentPage = page;
        renderLoading();

        try {
            if (!window.TPOSClient?.authenticatedFetch) throw new Error('TPOSClient not available');
            const url = buildUrl(page);
            const response = await window.TPOSClient.authenticatedFetch(url);
            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            totalCount = data['@odata.count'] || 0;
            currentData = data.value || [];
            renderTable(currentData);
            renderPagination();
        } catch (error) {
            console.error('[Refunds] Load failed:', error);
            renderError(error.message);
        } finally {
            isLoading = false;
        }
    }

    function formatMoney(value) {
        if (!value && value !== 0) return '';
        return new Intl.NumberFormat('vi-VN').format(value);
    }

    function formatDate(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}\n${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    function renderTable(items) {
        if (!tableContainer) return;

        if (!items || items.length === 0) {
            tableContainer.innerHTML = `
                <div class="table-empty">
                    <div class="table-empty__icon"><i data-lucide="undo-2"></i></div>
                    <div class="table-empty__title">Không có phiếu trả hàng</div>
                    <div class="table-empty__description">Không tìm thấy phiếu trả hàng NCC nào trong khoảng thời gian này</div>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const rows = items.map((item, idx) => {
            const dateParts = formatDate(item.DateInvoice).split('\n');
            const isExpanded = !!expandedRows[item.Id];
            return `
                <tr class="order-row ${idx === 0 ? 'order-row--first' : ''} ${isExpanded ? 'order-row--expanded' : ''}"
                    data-order-id="${item.Id}" style="border-top: ${idx > 0 ? '1px solid var(--color-border-light)' : 'none'}; cursor: pointer;">
                    <td>
                        <div class="cell-supplier">
                            <span class="supplier-name">${escapeHtml(item.PartnerDisplayName || '')}</span>
                        </div>
                    </td>
                    <td>
                        <div class="date-info">
                            <span class="date-main">${dateParts[0] || ''}</span>
                            <span class="date-time">${dateParts[1] || ''}</span>
                        </div>
                    </td>
                    <td><span style="font-family: monospace; font-size: 13px;">${escapeHtml(item.Number || '')}</span></td>
                    <td class="text-right"><span class="price-value" style="color: var(--color-danger);">-${formatMoney(item.AmountTotal)}</span></td>
                    <td>${renderState(item.ShowState, item.State)}</td>
                    <td><span style="font-size: 13px;">${escapeHtml(item.UserName || '')}</span></td>
                    <td><span style="font-size: 13px;">${escapeHtml(item.CompanyName || '')}</span></td>
                </tr>
                <tr class="expand-row" id="refund-expand-${item.Id}" style="display: ${isExpanded ? 'table-row' : 'none'};">
                    <td colspan="7" style="padding: 0; background: #fef2f2;">
                        <div class="expand-content" id="refund-expand-content-${item.Id}">
                            ${isExpanded ? renderExpandedContent(item.Id, item) : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tableContainer.innerHTML = `
            <div class="table-wrapper">
                <table class="po-table">
                    <thead>
                        <tr>
                            <th>Nhà cung cấp</th>
                            <th style="width: 120px;">Ngày trả hàng</th>
                            <th>Số phiếu</th>
                            <th class="text-right">Số tiền trả</th>
                            <th>Trạng thái</th>
                            <th>Nhân viên</th>
                            <th>Công ty</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        tableContainer.querySelectorAll('tr.order-row[data-order-id]').forEach(row => {
            row.addEventListener('click', () => {
                toggleExpandRow(parseInt(row.dataset.orderId, 10));
            });
        });
    }

    async function toggleExpandRow(orderId) {
        const expandRow = document.getElementById(`refund-expand-${orderId}`);
        const contentDiv = document.getElementById(`refund-expand-content-${orderId}`);
        const mainRow = tableContainer.querySelector(`tr.order-row[data-order-id="${orderId}"]`);
        if (!expandRow || !contentDiv) return;

        if (expandedRows[orderId]) {
            delete expandedRows[orderId];
            expandRow.style.display = 'none';
            mainRow?.classList.remove('order-row--expanded');
            return;
        }

        expandRow.style.display = 'table-row';
        mainRow?.classList.add('order-row--expanded');
        contentDiv.innerHTML = '<div style="padding: 12px 16px; color: var(--color-text-muted); font-size: 13px;">Đang tải chi tiết...</div>';

        try {
            const url = `${PROXY_URL}/api/odata/FastPurchaseOrder(${orderId})/OrderLines?$expand=Product,ProductUOM,Account`;
            const response = await window.TPOSClient.authenticatedFetch(url);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const data = await response.json();
            const lines = data.value || [];
            expandedRows[orderId] = lines;
            contentDiv.innerHTML = renderExpandedContent(orderId, currentData.find(d => d.Id === orderId), lines);
        } catch (error) {
            console.error('[Refunds] Expand failed:', error);
            contentDiv.innerHTML = `<div style="padding: 12px 16px; color: var(--color-danger); font-size: 13px;">Lỗi: ${escapeHtml(error.message)}</div>`;
        }
    }

    function renderExpandedContent(orderId, item, lines) {
        if (!lines) lines = expandedRows[orderId];
        if (!lines || lines.length === 0) {
            return '<div style="padding: 12px 16px; color: var(--color-text-muted); font-size: 13px;">Không có chi tiết sản phẩm</div>';
        }

        const lineRows = lines.map((line, idx) => `
            <tr>
                <td style="text-align: center; width: 40px;">${idx + 1}</td>
                <td style="font-weight: 500;">${escapeHtml(line.Name || line.ProductNameGet || line.ProductName || '')}</td>
                <td style="text-align: right; width: 80px;">${line.ProductQty ?? ''}</td>
                <td style="text-align: right; width: 120px;">${formatMoney(line.PriceUnit)}</td>
                <td style="text-align: right; width: 120px;">${formatMoney(line.PriceSubTotal)}</td>
            </tr>`
        ).join('');

        const totalAmount = item?.AmountTotal || lines.reduce((s, l) => s + (l.PriceSubTotal || 0), 0);

        return `
            <div style="padding: 8px 16px 12px;">
                <div style="font-size: 12px; color: #991b1b; margin-bottom: 8px; font-weight: 600;">
                    Phiếu trả hàng — ${escapeHtml(item?.PartnerDisplayName || '')}
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background: #fecaca; font-weight: 600;">
                            <th style="padding: 6px 8px; text-align: center; width: 40px;">STT</th>
                            <th style="padding: 6px 8px; text-align: left;">Sản phẩm</th>
                            <th style="padding: 6px 8px; text-align: right; width: 80px;">Số lượng</th>
                            <th style="padding: 6px 8px; text-align: right; width: 120px;">Đơn giá</th>
                            <th style="padding: 6px 8px; text-align: right; width: 120px;">Tổng</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lineRows}
                        <tr style="border-top: 1px solid #fecaca;">
                            <td colspan="4" style="padding: 6px 8px; text-align: right; font-weight: 600;">Tổng tiền trả:</td>
                            <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: #dc2626;">${formatMoney(totalAmount)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

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

    function renderPagination() {
        if (!paginationContainer) return;
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        if (totalPages <= 0) { paginationContainer.innerHTML = ''; return; }

        const startItem = totalCount > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
        const endItem = Math.min(currentPage * PAGE_SIZE, totalCount);
        const pages = generatePageNumbers(currentPage, totalPages, 5);

        paginationContainer.innerHTML = `
            <div class="pagination">
                <div class="pagination__info">Hiển thị ${startItem} - ${endItem} trong ${totalCount} phiếu trả hàng</div>
                <div class="pagination__controls">
                    ${totalPages > 1 ? `
                        <button class="pagination__btn pagination__btn--prev ${currentPage <= 1 ? 'disabled' : ''}" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>
                            <i data-lucide="chevron-left"></i>
                        </button>
                        ${pages.map(p => {
                            if (p === '...') return '<span class="pagination__ellipsis">...</span>';
                            const isActive = p === currentPage;
                            return `<button class="pagination__btn pagination__btn--page ${isActive ? 'active' : ''}" data-page="${p}" ${isActive ? 'disabled' : ''}>${p}</button>`;
                        }).join('')}
                        <button class="pagination__btn pagination__btn--next ${currentPage >= totalPages ? 'disabled' : ''}" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>
                            <i data-lucide="chevron-right"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        paginationContainer.querySelectorAll('.pagination__btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page, 10);
                if (!isNaN(page) && page >= 1 && page <= totalPages) loadPage(page);
            });
        });
    }

    function generatePageNumbers(current, total, maxVisible) {
        if (total <= maxVisible) return Array.from({ length: total }, (_, i) => i + 1);
        const pages = [];
        const half = Math.floor(maxVisible / 2);
        let start = Math.max(1, current - half);
        let end = Math.min(total, current + half);
        if (start === 1) end = Math.min(total, maxVisible);
        if (end === total) start = Math.max(1, total - maxVisible + 1);
        if (start > 1) { pages.push(1); if (start > 2) pages.push('...'); }
        for (let i = start; i <= end; i++) { if (!pages.includes(i)) pages.push(i); }
        if (end < total) { if (end < total - 1) pages.push('...'); if (!pages.includes(total)) pages.push(total); }
        return pages;
    }

    function renderLoading() {
        if (!tableContainer) return;
        tableContainer.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <div class="loading-text">Đang tải phiếu trả hàng...</div>
            </div>
        `;
        if (paginationContainer) paginationContainer.innerHTML = '';
    }

    function renderError(message) {
        if (!tableContainer) return;
        tableContainer.innerHTML = `
            <div class="error-state">
                <div class="error-state__icon"><i data-lucide="alert-circle"></i></div>
                <div class="error-state__title">Không thể tải dữ liệu</div>
                <div class="error-state__description">${escapeHtml(message)}</div>
                <button class="btn btn-outline" onclick="window.PurchaseOrderRefunds.reload()">
                    <i data-lucide="refresh-cw"></i> Thử lại
                </button>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function removeVietnameseDiacritics(str) {
        if (window.ProductCodeGenerator?.removeVietnameseDiacritics) {
            return window.ProductCodeGenerator.removeVietnameseDiacritics(str);
        }
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    }

    function encodeODataString(str) { return str.replace(/'/g, "''"); }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function reload() { loadPage(currentPage); }

    function destroy() {
        currentData = [];
        currentPage = 1;
        totalCount = 0;
        searchTerm = '';
        filterState = '';
        Object.keys(expandedRows).forEach(k => delete expandedRows[k]);
    }

    return { init, destroy, reload };
})();

console.log('[Purchase Orders] Refund tab loaded');
