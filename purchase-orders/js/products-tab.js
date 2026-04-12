// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * PURCHASE ORDERS MODULE - PRODUCTS TAB (Kho sản phẩm TPOS)
 * File: products-tab.js
 * Purpose: Browse TPOS ProductTemplate + Product catalog with search, filter, pagination
 */

window.PurchaseOrderProducts = (function () {
    'use strict';

    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const PAGE_SIZE = 50;

    let currentPage = 1;
    let totalCount = 0;
    let isLoading = false;
    let currentData = [];
    const expandedRows = {};

    let tableContainer = null;
    let paginationContainer = null;
    let filterContainer = null;

    // Filter state
    let searchTerm = '';
    let searchMode = 'code'; // 'code', 'name', 'all'
    let sortBy = 'DateCreated desc';
    let activeOnly = true;

    function init() {
        tableContainer = document.getElementById('tableContainer');
        paginationContainer = document.getElementById('pagination');
        filterContainer = document.getElementById('filterBar');

        renderFilterBar();
        loadPage(1);
    }

    function renderFilterBar() {
        if (!filterContainer) return;

        filterContainer.innerHTML = `
            <div class="filter-bar">
                <div class="filter-group filter-group--search" style="flex: 2;">
                    <label class="filter-label">Tìm sản phẩm</label>
                    <div class="input-icon">
                        <i data-lucide="search"></i>
                        <input type="text" id="productSearchInput" class="filter-input"
                               value="${escapeHtml(searchTerm)}"
                               placeholder="Nhập mã SP hoặc tên... (Enter để tìm)">
                    </div>
                </div>
                <div class="filter-group">
                    <label class="filter-label">Tìm theo</label>
                    <div class="input-icon">
                        <i data-lucide="layers"></i>
                        <select id="productSearchMode" class="filter-input">
                            <option value="code"${searchMode === 'code' ? ' selected' : ''}>Mã SP</option>
                            <option value="name"${searchMode === 'name' ? ' selected' : ''}>Tên SP</option>
                            <option value="all"${searchMode === 'all' ? ' selected' : ''}>Tất cả</option>
                        </select>
                    </div>
                </div>
                <div class="filter-group">
                    <label class="filter-label">Sắp xếp</label>
                    <div class="input-icon">
                        <i data-lucide="arrow-up-down"></i>
                        <select id="productSortBy" class="filter-input">
                            <option value="DateCreated desc"${sortBy === 'DateCreated desc' ? ' selected' : ''}>Mới nhất</option>
                            <option value="DateCreated asc"${sortBy === 'DateCreated asc' ? ' selected' : ''}>Cũ nhất</option>
                            <option value="Name asc"${sortBy === 'Name asc' ? ' selected' : ''}>Tên A-Z</option>
                            <option value="DefaultCode asc"${sortBy === 'DefaultCode asc' ? ' selected' : ''}>Mã A-Z</option>
                            <option value="ListPrice desc"${sortBy === 'ListPrice desc' ? ' selected' : ''}>Giá bán cao→thấp</option>
                        </select>
                    </div>
                </div>
                <div class="filter-group filter-group--actions" style="display: flex; gap: 8px; align-items: flex-end;">
                    <button id="btnProductSearch" class="btn btn-primary" title="Tìm kiếm">
                        <i data-lucide="search"></i> Tìm
                    </button>
                    <button id="btnProductReload" class="btn btn-outline" title="Tải lại">
                        <i data-lucide="refresh-cw"></i>
                    </button>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        const applySearch = () => {
            searchTerm = (document.getElementById('productSearchInput').value || '').trim();
            searchMode = document.getElementById('productSearchMode').value;
            sortBy = document.getElementById('productSortBy').value;
            loadPage(1);
        };

        document.getElementById('btnProductSearch').addEventListener('click', applySearch);
        document.getElementById('btnProductReload').addEventListener('click', () => loadPage(currentPage));
        document.getElementById('productSortBy').addEventListener('change', applySearch);

        const searchInput = document.getElementById('productSearchInput');
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); applySearch(); }
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
        let url = `${PROXY_URL}/api/odata/ProductTemplate/ODataService.GetViewV2?Active=${activeOnly}`;
        url += `&$top=${PAGE_SIZE}`;
        if (skip > 0) url += `&$skip=${skip}`;
        url += `&$orderby=${encodeURIComponent(sortBy)}`;
        url += `&$count=true`;

        if (searchTerm) {
            const safe = encodeODataString(searchTerm);
            if (searchMode === 'code') {
                url += `&DefaultCode=${encodeURIComponent(searchTerm)}`;
            } else if (searchMode === 'name') {
                url += `&$filter=contains(NameNoSign,'${encodeURIComponent(removeVietnameseDiacritics(safe).toLowerCase())}')`;
            } else {
                // all: search by code OR name
                url += `&$filter=(contains(DefaultCode,'${encodeURIComponent(safe)}') or contains(NameNoSign,'${encodeURIComponent(removeVietnameseDiacritics(safe).toLowerCase())}'))`;
            }
        }

        return url;
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
            console.error('[Products] Load failed:', error);
            renderError(error.message);
        } finally {
            isLoading = false;
        }
    }

    function formatMoney(value) {
        if (!value && value !== 0) return '';
        return new Intl.NumberFormat('vi-VN').format(value);
    }

    function renderTable(items) {
        if (!tableContainer) return;

        if (!items || items.length === 0) {
            tableContainer.innerHTML = `
                <div class="table-empty">
                    <div class="table-empty__icon"><i data-lucide="package"></i></div>
                    <div class="table-empty__title">Không tìm thấy sản phẩm</div>
                    <div class="table-empty__description">${searchTerm ? 'Thử tìm với từ khóa khác' : 'Kho sản phẩm trống'}</div>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const rows = items.map((item, idx) => {
            const imgUrl = item.ImageUrl
                ? item.ImageUrl.replace('/rs::0:0:0/', '/rs::64:64:0/')
                : '';
            const hasVariants = (item.ProductVariantCount || 0) > 1;
            const isExpanded = !!expandedRows[item.Id];

            return `
                <tr class="order-row ${isExpanded ? 'order-row--expanded' : ''}" data-product-id="${item.Id}" style="cursor: pointer;">
                    <td style="width: 56px; text-align: center;">
                        ${imgUrl
                            ? `<img src="${escapeHtml(imgUrl)}" alt="" style="width: 44px; height: 44px; object-fit: cover; border-radius: 6px; border: 1px solid var(--color-border-light);" loading="lazy">`
                            : '<div style="width: 44px; height: 44px; background: var(--color-muted); border-radius: 6px; display: flex; align-items: center; justify-content: center;"><i data-lucide="image-off" style="width: 18px; height: 18px; color: var(--color-text-muted);"></i></div>'
                        }
                    </td>
                    <td>
                        <div style="font-weight: 600; font-size: 13px; color: var(--color-primary);">${escapeHtml(item.DefaultCode || '')}</div>
                    </td>
                    <td>
                        <div style="font-size: 13px;">${escapeHtml(item.Name || '')}</div>
                        ${hasVariants ? `<span style="font-size: 11px; color: var(--color-text-muted);">${item.ProductVariantCount} biến thể</span>` : ''}
                    </td>
                    <td class="text-right">
                        <span style="font-weight: 600;">${formatMoney(item.ListPrice)}</span>
                    </td>
                    <td class="text-right">
                        <span style="color: var(--color-success);">${formatMoney(item.PurchasePrice)}</span>
                    </td>
                    <td class="text-right">
                        <span style="font-weight: 500; ${(item.QtyAvailable || 0) <= 0 ? 'color: var(--color-danger);' : ''}">${item.QtyAvailable ?? 0}</span>
                    </td>
                    <td style="font-size: 12px; color: var(--color-text-muted);">
                        ${item.CategCompleteName || ''}
                    </td>
                </tr>
                ${hasVariants ? `
                <tr class="expand-row" id="product-expand-${item.Id}" style="display: ${isExpanded ? 'table-row' : 'none'};">
                    <td colspan="7" style="padding: 0; background: #f8fafc;">
                        <div id="product-expand-content-${item.Id}">
                            ${isExpanded ? renderVariants(expandedRows[item.Id]) : ''}
                        </div>
                    </td>
                </tr>` : ''}
            `;
        }).join('');

        tableContainer.innerHTML = `
            <div class="table-wrapper">
                <div style="padding: 8px 16px; font-size: 12px; color: var(--color-text-muted); background: var(--color-muted); border-bottom: 1px solid var(--color-border-light);">
                    Tổng: <strong>${totalCount.toLocaleString('vi-VN')}</strong> sản phẩm
                </div>
                <table class="po-table">
                    <thead>
                        <tr>
                            <th style="width: 56px;">Ảnh</th>
                            <th style="width: 100px;">Mã SP</th>
                            <th>Tên sản phẩm</th>
                            <th class="text-right" style="width: 120px;">Giá bán</th>
                            <th class="text-right" style="width: 120px;">Giá mua</th>
                            <th class="text-right" style="width: 80px;">Tồn kho</th>
                            <th style="width: 160px;">Danh mục</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Bind row click for variant expansion
        tableContainer.querySelectorAll('tr.order-row[data-product-id]').forEach(row => {
            row.addEventListener('click', () => {
                toggleExpandRow(parseInt(row.dataset.productId, 10));
            });
        });
    }

    async function toggleExpandRow(productId) {
        const expandRow = document.getElementById(`product-expand-${productId}`);
        if (!expandRow) return; // No variants for this product
        const contentDiv = document.getElementById(`product-expand-content-${productId}`);
        const mainRow = tableContainer.querySelector(`tr.order-row[data-product-id="${productId}"]`);

        if (expandedRows[productId]) {
            delete expandedRows[productId];
            expandRow.style.display = 'none';
            mainRow?.classList.remove('order-row--expanded');
            return;
        }

        expandRow.style.display = 'table-row';
        mainRow?.classList.add('order-row--expanded');
        contentDiv.innerHTML = '<div style="padding: 12px 16px; color: var(--color-text-muted); font-size: 13px;">Đang tải biến thể...</div>';

        try {
            const url = `${PROXY_URL}/api/odata/ProductTemplate(${productId})?$expand=ProductVariants($expand=AttributeValues)`;
            const response = await window.TPOSClient.authenticatedFetch(url);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const data = await response.json();
            const variants = data.ProductVariants || [];
            expandedRows[productId] = variants;
            contentDiv.innerHTML = renderVariants(variants);
        } catch (error) {
            console.error('[Products] Expand failed:', error);
            contentDiv.innerHTML = `<div style="padding: 12px 16px; color: var(--color-danger); font-size: 13px;">Lỗi: ${escapeHtml(error.message)}</div>`;
        }
    }

    function renderVariants(variants) {
        if (!variants || variants.length === 0) {
            return '<div style="padding: 12px 16px; color: var(--color-text-muted); font-size: 13px;">Không có biến thể</div>';
        }

        const rows = variants.map((v, idx) => {
            const attrs = (v.AttributeValues || []).map(a => a.Name).join(', ');
            return `
                <tr>
                    <td style="text-align: center; width: 40px;">${idx + 1}</td>
                    <td style="font-weight: 600; color: var(--color-primary);">${escapeHtml(v.DefaultCode || '')}</td>
                    <td>${escapeHtml(v.NameGet || '')}</td>
                    <td style="font-size: 12px; color: var(--color-text-secondary);">${escapeHtml(attrs)}</td>
                    <td class="text-right">${formatMoney(v.PriceVariant || v.ListPrice)}</td>
                    <td class="text-right" style="${(v.QtyAvailable || 0) <= 0 ? 'color: var(--color-danger);' : ''}">${v.QtyAvailable ?? 0}</td>
                </tr>`;
        }).join('');

        return `
            <div style="padding: 8px 16px 12px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background: #e2e8f0; font-weight: 600;">
                            <th style="padding: 6px 8px; text-align: center; width: 40px;">STT</th>
                            <th style="padding: 6px 8px;">Mã</th>
                            <th style="padding: 6px 8px;">Tên biến thể</th>
                            <th style="padding: 6px 8px;">Thuộc tính</th>
                            <th style="padding: 6px 8px; text-align: right;">Giá</th>
                            <th style="padding: 6px 8px; text-align: right; width: 80px;">Tồn kho</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
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
                <div class="pagination__info">Hiển thị ${startItem} - ${endItem} trong ${totalCount.toLocaleString('vi-VN')} sản phẩm</div>
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
                <div class="loading-text">Đang tải kho sản phẩm...</div>
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
                <button class="btn btn-outline" onclick="window.PurchaseOrderProducts.reload()">
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
        Object.keys(expandedRows).forEach(k => delete expandedRows[k]);
    }

    return { init, destroy, reload };
})();

console.log('[Purchase Orders] Products tab loaded');
