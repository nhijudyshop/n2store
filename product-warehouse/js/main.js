/* =====================================================
   KHO SẢN PHẨM - PRODUCT WAREHOUSE
   Main JS - UI with all columns, column visibility,
   search with Excel suggestions, filter, sort,
   server-side pagination, variant images
   Data from TPOS OData API via Cloudflare proxy
   ===================================================== */

(function () {
    'use strict';

    // =====================================================
    // COLUMN DEFINITIONS (order matches screenshot)
    // =====================================================
    const COLUMNS = [
        { key: 'code',           label: 'Mã',                  visible: true,  locked: false },
        { key: 'name',           label: 'Tên',                 visible: true,  locked: false },
        { key: 'group',          label: 'Nhóm sản phẩm',      visible: true,  locked: false },
        { key: 'price',          label: 'Giá bán',             visible: true,  locked: false },
        { key: 'defaultBuyPrice',label: 'Giá mua mặc định',   visible: true,  locked: false },
        { key: 'costPrice',      label: 'Giá vốn',            visible: true,  locked: false },
        { key: 'qtyActual',      label: 'Số lượng thực tế',   visible: true,  locked: false },
        { key: 'qtyForecast',    label: 'Số lượng dự báo',    visible: true,  locked: false },
        { key: 'unit',           label: 'Đơn vị',             visible: true,  locked: false },
        { key: 'label',          label: 'Nhãn',               visible: true,  locked: false },
        { key: 'active',         label: 'Hiệu lực',           visible: true,  locked: false },
        { key: 'allCompany',     label: 'All company',         visible: true,  locked: false },
        { key: 'note',           label: 'Ghi chú',            visible: true,  locked: false },
        { key: 'createdAt',      label: 'Ngày tạo',           visible: true,  locked: false },
        { key: 'company',        label: 'Công ty',            visible: true,  locked: false },
        { key: 'creator',        label: 'Người tạo',          visible: true,  locked: false },
    ];

    const STORAGE_KEY = 'n2store_warehouse_columns';

    // OData sort field mapping (local key → API field)
    const SORT_FIELD_MAP = {
        code: 'DefaultCode',
        name: 'Name',
        group: 'CategCompleteName',
        price: 'ListPrice',
        defaultBuyPrice: 'PurchasePrice',
        costPrice: 'StandardPrice',
        qtyActual: 'QtyAvailable',
        qtyForecast: 'VirtualAvailable',
        active: 'Active',
        createdAt: 'DateCreated',
    };

    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // =====================================================
    // STATE
    // =====================================================
    let pageProducts = [];   // current page data from API
    let totalCount = 0;      // total from @odata.count
    let currentPage = 1;
    let pageSize = 50;
    let sortField = 'createdAt';
    let sortDirection = 'desc';
    let selectedIds = new Set();
    let isLoading = false;

    // Excel suggestion state
    let excelProducts = [];       // product list from Excel export
    let isLoadingExcel = false;
    let excelLoaded = false;

    // Image cache: templateId → imageUrl
    let imageCache = {};

    // =====================================================
    // DOM REFS
    // =====================================================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // =====================================================
    // HELPERS
    // =====================================================
    function formatPrice(val) {
        if (val === null || val === undefined) return '-';
        return val.toLocaleString('vi-VN');
    }

    function formatQty(val) {
        if (val === null || val === undefined) return '-';
        return val.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function getQtyClass(qty) {
        if (qty <= 0) return 'qty-out-of-stock';
        if (qty <= 5) return 'qty-low-stock';
        return 'qty-in-stock';
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function highlightMatch(text, query) {
        if (!query || !text) return escapeHtml(text);
        const escaped = escapeHtml(text);
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return escaped.replace(regex, '<span class="highlight">$1</span>');
    }

    function removeVietnameseTones(str) {
        if (!str) return '';
        str = str.toLowerCase();
        str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
        str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
        str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
        str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
        str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
        str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
        str = str.replace(/đ/g, 'd');
        return str;
    }

    // =====================================================
    // EXCEL SUGGESTION SYSTEM
    // =====================================================

    /**
     * Load product data from TPOS Excel export API.
     * Used for fast client-side search suggestions.
     */
    async function loadExcelData() {
        if (isLoadingExcel || excelLoaded) return;
        isLoadingExcel = true;

        const suggestionsDiv = $('#searchSuggestions');
        if (suggestionsDiv) {
            suggestionsDiv.innerHTML = '<div class="suggestion-loading">Đang tải danh sách sản phẩm...</div>';
            suggestionsDiv.classList.add('show');
        }

        try {
            const response = await window.tokenManager.authenticatedFetch(
                `${PROXY_URL}/api/Product/ExportFileWithVariantPrice`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: { Active: 'true' }, ids: '' })
                }
            );

            if (!response.ok) throw new Error('Không thể tải dữ liệu sản phẩm');

            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            excelProducts = jsonData.map(row => ({
                id: row['Id sản phẩm (*)'],
                name: row['Tên sản phẩm'] || '',
                nameNoSign: removeVietnameseTones(row['Tên sản phẩm'] || ''),
                code: row['Mã sản phẩm'] || '',
                image: row['Link ảnh'] || ''
            }));

            excelLoaded = true;
            console.log(`[Warehouse] Excel loaded: ${excelProducts.length} products`);
        } catch (error) {
            console.error('[Warehouse] Excel load error:', error);
            showToast('Lỗi tải suggestion: ' + error.message, 'error');
        } finally {
            isLoadingExcel = false;
        }
    }

    /**
     * Search products from Excel data for suggestions.
     * Matches by code, name (with and without Vietnamese tones).
     */
    function searchProductsSuggestion(searchText) {
        if (!searchText || searchText.length < 2 || excelProducts.length === 0) return [];

        const searchLower = searchText.toLowerCase();
        const searchNoSign = removeVietnameseTones(searchText);

        const matched = excelProducts.filter(p => {
            const matchName = p.nameNoSign.includes(searchNoSign);
            const matchNameOriginal = p.name.toLowerCase().includes(searchLower);
            const matchCode = p.code.toLowerCase().includes(searchLower);
            return matchName || matchNameOriginal || matchCode;
        });

        // Sort: bracket match first, then code match, then alphabetical
        matched.sort((a, b) => {
            const extractBracket = (name) => {
                const m = name?.match(/\[([^\]]+)\]/);
                return m ? m[1].toLowerCase().trim() : '';
            };

            const aBracket = extractBracket(a.name);
            const bBracket = extractBracket(b.name);
            const aInBracket = aBracket && aBracket.includes(searchLower);
            const bInBracket = bBracket && bBracket.includes(searchLower);

            if (aInBracket && !bInBracket) return -1;
            if (!aInBracket && bInBracket) return 1;

            if (aInBracket && bInBracket) {
                if (aBracket === searchLower && bBracket !== searchLower) return -1;
                if (aBracket !== searchLower && bBracket === searchLower) return 1;
                if (aBracket.length !== bBracket.length) return aBracket.length - bBracket.length;
                return aBracket.localeCompare(bBracket);
            }

            const aCode = a.code.toLowerCase().includes(searchLower);
            const bCode = b.code.toLowerCase().includes(searchLower);
            if (aCode && !bCode) return -1;
            if (!aCode && bCode) return 1;

            return a.name.localeCompare(b.name);
        });

        return matched.slice(0, 10);
    }

    /**
     * Display suggestion dropdown below search input.
     */
    function displaySuggestions(suggestions) {
        const suggestionsDiv = $('#searchSuggestions');
        if (!suggestionsDiv) return;

        if (suggestions.length === 0) {
            suggestionsDiv.classList.remove('show');
            return;
        }

        suggestionsDiv.innerHTML = suggestions.map(p => {
            const imgHtml = p.image
                ? `<img class="sugg-img" src="${escapeHtml(p.image)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="sugg-img-placeholder" style="display:none">?</div>`
                : `<div class="sugg-img-placeholder">?</div>`;
            return `<div class="suggestion-item" data-code="${escapeHtml(p.code)}" data-name="${escapeHtml(p.name)}">
                ${imgHtml}
                <div class="sugg-info">
                    <div class="sugg-code">${escapeHtml(p.code)}</div>
                    <div class="sugg-name">${escapeHtml(p.name)}</div>
                </div>
            </div>`;
        }).join('');

        suggestionsDiv.classList.add('show');

        // Click handlers for suggestion items
        suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const code = item.dataset.code;
                const searchInput = $('#searchInput');
                if (searchInput) searchInput.value = code;
                suggestionsDiv.classList.remove('show');
                currentPage = 1;
                fetchProducts();
            });
        });
    }

    function hideSuggestions() {
        $('#searchSuggestions')?.classList.remove('show');
    }

    // =====================================================
    // VARIANT IMAGE LOADING
    // =====================================================

    /**
     * Load variant images for a product template from TPOS API.
     * Updates the table row image in-place.
     */
    async function loadVariantImages(templateId, rowElement) {
        if (!templateId || imageCache[templateId] !== undefined) return;

        try {
            const url = `${PROXY_URL}/api/odata/ProductTemplate(${templateId})?$expand=Images,ProductVariants`;
            const response = await window.tokenManager.authenticatedFetch(url, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) return;

            const data = await response.json();

            // Try template ImageUrl, then Images array, then first variant ImageUrl
            let imgUrl = data.ImageUrl || '';
            if (!imgUrl && data.Images && data.Images.length > 0) {
                imgUrl = data.Images[0].Url || data.Images[0].ImageUrl || '';
            }
            if (!imgUrl && data.ProductVariants) {
                for (const v of data.ProductVariants) {
                    if (v.ImageUrl) { imgUrl = v.ImageUrl; break; }
                }
            }

            imageCache[templateId] = imgUrl || null;

            // Update the row's image cell if we found an image
            if (imgUrl && rowElement) {
                const imgCell = rowElement.querySelector('.product-image-cell');
                if (imgCell) {
                    imgCell.innerHTML = `<img src="${escapeHtml(imgUrl)}" alt="" class="product-thumb" loading="lazy" onclick="window.warehouseApp.showImage(this.src)">`;
                }
            }
        } catch (e) {
            console.warn('[Warehouse] Image load error for template', templateId, e);
            imageCache[templateId] = null;
        }
    }

    /**
     * After render, lazy-load images for products without ImageUrl.
     * Uses IntersectionObserver for viewport-based loading.
     */
    function lazyLoadImages() {
        const rows = $$('#productTableBody tr');
        rows.forEach((row, idx) => {
            const product = pageProducts[idx];
            if (!product || product.image) return; // already has image

            // Get templateId from the product's TPOS data (stored in product.id → actually product template ID)
            // The GetViewV2 returns product templates, so product.id IS the template ID
            const templateId = product.id;
            if (imageCache[templateId] === null) return; // already checked, no image

            if (imageCache[templateId]) {
                // Use cached image
                const imgCell = row.querySelector('.product-image-cell');
                if (imgCell) {
                    imgCell.innerHTML = `<img src="${escapeHtml(imageCache[templateId])}" alt="" class="product-thumb" loading="lazy" onclick="window.warehouseApp.showImage(this.src)">`;
                }
            } else {
                // Load from API
                loadVariantImages(templateId, row);
            }
        });
    }

    // =====================================================
    // API - Map TPOS response to local product format
    // =====================================================
    function mapProduct(item) {
        // Check image cache for this template
        const cachedImg = imageCache[item.Id];
        return {
            id: item.Id,
            code: item.DefaultCode || '',
            name: item.Name || '',
            group: item.CategCompleteName || '',
            price: item.ListPrice || 0,
            defaultBuyPrice: item.PurchasePrice || 0,
            costPrice: item.StandardPrice || 0,
            qtyActual: item.QtyAvailable || 0,
            qtyForecast: item.VirtualAvailable || 0,
            unit: item.UOMName || '',
            label: !!item.Tags,
            active: item.Active,
            allCompany: item.EnableAll,
            note: item.DescriptionSale || '',
            createdAt: item.DateCreated ? item.DateCreated.split('T')[0] : '',
            company: item.CompanyName || '',
            creator: item.CreatedByName || '',
            image: item.ImageUrl || cachedImg || '',
        };
    }

    // =====================================================
    // API - Build OData filter string
    // =====================================================
    function buildODataFilter() {
        const filters = [];

        // Status filter (Active)
        const statusFilter = $('#filterStatus')?.value || 'all';
        if (statusFilter === 'active') filters.push('Active eq true');
        else if (statusFilter === 'inactive') filters.push('Active eq false');

        // Stock filter (QtyAvailable)
        const stockFilter = $('#filterStock')?.value || 'all';
        if (stockFilter === 'in-stock') filters.push('QtyAvailable gt 0');
        else if (stockFilter === 'low-stock') filters.push('QtyAvailable gt 0 and QtyAvailable le 5');
        else if (stockFilter === 'out-of-stock') filters.push('QtyAvailable le 0');

        // Search (global)
        const searchQuery = ($('#searchInput')?.value || '').trim();
        if (searchQuery) {
            const escaped = searchQuery.replace(/'/g, "''");
            filters.push(`(contains(Name,'${escaped}') or contains(DefaultCode,'${escaped}'))`);
        }

        // Column-level filters
        const codeFilter = ($('[data-filter="code"]')?.value || '').trim();
        if (codeFilter) {
            filters.push(`contains(DefaultCode,'${codeFilter.replace(/'/g, "''")}')`);
        }
        const nameFilter = ($('[data-filter="name"]')?.value || '').trim();
        if (nameFilter) {
            filters.push(`contains(Name,'${nameFilter.replace(/'/g, "''")}')`);
        }

        return filters.length > 0 ? filters.join(' and ') : '';
    }

    // =====================================================
    // API - Fetch products from TPOS OData
    // =====================================================
    async function fetchProducts() {
        if (isLoading) return;
        isLoading = true;
        showLoading(true);

        try {
            const skip = (currentPage - 1) * pageSize;

            // Build OData orderby
            const odataField = SORT_FIELD_MAP[sortField] || 'DateCreated';
            const orderby = `${odataField} ${sortDirection}`;

            // Build URL params
            const params = new URLSearchParams();
            params.set('priceId', '0');
            params.set('$top', String(pageSize));
            params.set('$skip', String(skip));
            params.set('$orderby', orderby);
            params.set('$count', 'true');

            const filterStr = buildODataFilter();
            if (filterStr) params.set('$filter', filterStr);

            const url = API_CONFIG.buildUrl.tposOData(
                'ProductTemplate/ODataService.GetViewV2',
                params.toString()
            );

            console.log('[Warehouse] Fetching:', url);

            const response = await window.tokenManager.authenticatedFetch(url, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            totalCount = data['@odata.count'] || 0;
            pageProducts = (data.value || []).map(mapProduct);

            console.log('[Warehouse] Loaded', pageProducts.length, 'products, total:', totalCount);
        } catch (error) {
            console.error('[Warehouse] Fetch error:', error);
            pageProducts = [];
            totalCount = 0;
            showToast('Lỗi tải dữ liệu: ' + error.message, 'error');
        } finally {
            isLoading = false;
            showLoading(false);
            render();
            // Lazy-load images for products without ImageUrl
            lazyLoadImages();
        }
    }

    function showLoading(show) {
        const loadingState = $('#loadingState');
        const tableBody = $('#productTableBody');
        if (show) {
            if (loadingState) loadingState.classList.remove('hidden');
            if (tableBody) tableBody.innerHTML = '';
        } else {
            if (loadingState) loadingState.classList.add('hidden');
        }
    }

    function showToast(message, type = 'info') {
        const container = $('#toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // =====================================================
    // COLUMN VISIBILITY
    // =====================================================
    function loadColumnVisibility() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                COLUMNS.forEach(col => {
                    if (parsed[col.key] !== undefined) {
                        col.visible = parsed[col.key];
                    }
                });
            }
        } catch (e) {
            console.warn('[Warehouse] Error loading column settings:', e);
        }
        syncColumnVisibilityToDOM();
    }

    function saveColumnVisibility() {
        const data = {};
        COLUMNS.forEach(col => { data[col.key] = col.visible; });
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    }

    function syncColumnVisibilityToDOM() {
        COLUMNS.forEach(col => {
            const th = $(`th[data-col="${col.key}"]`);
            if (th) th.style.display = col.visible ? '' : 'none';

            $$(`td[data-col="${col.key}"]`).forEach(td => {
                td.style.display = col.visible ? '' : 'none';
            });
        });
    }

    function openColumnSettings() {
        const modal = $('#columnSettingsModal');
        const list = $('#columnSettingsList');
        if (!modal || !list) return;

        list.innerHTML = COLUMNS.map(col => `
            <label class="column-setting-item ${col.visible ? 'checked' : ''}">
                <input type="checkbox" data-col-key="${col.key}" ${col.visible ? 'checked' : ''}>
                <span>${col.label}</span>
            </label>
        `).join('');

        list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                cb.closest('.column-setting-item').classList.toggle('checked', cb.checked);
            });
        });

        modal.classList.add('show');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function closeColumnSettingsModal() {
        $('#columnSettingsModal')?.classList.remove('show');
    }

    function saveColumnSettingsFromModal() {
        const checkboxes = $$('#columnSettingsList input[type="checkbox"]');
        checkboxes.forEach(cb => {
            const key = cb.dataset.colKey;
            const col = COLUMNS.find(c => c.key === key);
            if (col) col.visible = cb.checked;
        });
        saveColumnVisibility();
        syncColumnVisibilityToDOM();
        closeColumnSettingsModal();
    }

    function resetColumnDefaults() {
        COLUMNS.forEach(col => { col.visible = true; });
        const list = $('#columnSettingsList');
        if (list) {
            list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = true;
                cb.closest('.column-setting-item').classList.add('checked');
            });
        }
    }

    // =====================================================
    // RENDER (uses server-side paged data)
    // =====================================================
    function render() {
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
        if (currentPage > totalPages) currentPage = totalPages;

        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageProducts.length, totalCount);

        // Update count
        const countEl = $('#productCount');
        if (countEl) countEl.innerHTML = `<i data-lucide="package"></i> <strong>${totalCount}</strong> sản phẩm`;

        // Empty state
        const emptyState = $('#emptyState');
        if (emptyState) emptyState.classList.toggle('hidden', pageProducts.length > 0);

        const searchQuery = ($('#searchInput')?.value || '').trim();
        const tableBody = $('#productTableBody');

        if (tableBody) {
            if (pageProducts.length === 0) {
                tableBody.innerHTML = '';
            } else {
                tableBody.innerHTML = pageProducts.map(p => {
                    const imageHtml = p.image
                        ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.code)}" class="product-thumb" loading="lazy" onclick="window.warehouseApp.showImage(this.src)">`
                        : `<div class="product-thumb-placeholder"><i data-lucide="image-off"></i></div>`;

                    const checked = selectedIds.has(p.id) ? 'checked' : '';
                    const rowClass = selectedIds.has(p.id) ? ' selected' : '';

                    return `<tr class="${rowClass}" data-template-id="${p.id}">
                        <td class="col-checkbox"><input type="checkbox" class="row-checkbox" data-id="${p.id}" ${checked}></td>
                        <td class="col-actions">
                            <div class="action-btns">
                                <button class="btn-action btn-action-edit" title="Sửa"><i data-lucide="pencil"></i></button>
                                <button class="btn-action btn-action-delete" title="Xóa"><i data-lucide="trash-2"></i></button>
                            </div>
                        </td>
                        <td class="product-image-cell">${imageHtml}</td>
                        <td data-col="code"><span class="product-code">${highlightMatch(p.code, searchQuery)}</span></td>
                        <td data-col="name" class="td-name"><span class="product-name">${highlightMatch(p.name, searchQuery)}</span></td>
                        <td data-col="group" class="td-group"><span class="product-group-text">${escapeHtml(p.group)}</span></td>
                        <td data-col="price" class="td-price">${formatPrice(p.price)}</td>
                        <td data-col="defaultBuyPrice" class="td-price">${formatPrice(p.defaultBuyPrice)}</td>
                        <td data-col="costPrice" class="td-price">${formatPrice(p.costPrice)}</td>
                        <td data-col="qtyActual" class="td-qty ${getQtyClass(p.qtyActual)}">${formatQty(p.qtyActual)}</td>
                        <td data-col="qtyForecast" class="td-qty">${formatQty(p.qtyForecast)}</td>
                        <td data-col="unit">${escapeHtml(p.unit)}</td>
                        <td data-col="label">${p.label ? '<span class="label-badge"><i data-lucide="tag"></i></span>' : '-'}</td>
                        <td data-col="active">${p.active
                            ? '<span class="status-active"><i data-lucide="check-circle-2"></i></span>'
                            : '<span class="status-inactive"><i data-lucide="x"></i></span>'}</td>
                        <td data-col="allCompany">${p.allCompany
                            ? '<span class="company-check"><i data-lucide="check"></i></span>'
                            : '<span class="company-cross"><i data-lucide="x"></i></span>'}</td>
                        <td data-col="note" class="td-note" title="${escapeHtml(p.note)}">${escapeHtml(p.note) || ''}</td>
                        <td data-col="createdAt" class="td-date">${p.createdAt || '-'}</td>
                        <td data-col="company" class="td-creator">${escapeHtml(p.company)}</td>
                        <td data-col="creator" class="td-creator">${escapeHtml(p.creator)}</td>
                    </tr>`;
                }).join('');
            }
        }

        // Pagination
        renderPagination(totalCount, totalPages, start, end);

        // Column visibility
        syncColumnVisibilityToDOM();

        // Lucide icons
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function renderPagination(total, totalPages, start, end) {
        const info = $('#paginationInfo');
        if (info) {
            info.textContent = total > 0
                ? `Hiển thị ${start + 1} - ${end} / ${total} sản phẩm`
                : 'Không có sản phẩm';
        }

        const btnPrev = $('#btnPrevPage');
        const btnNext = $('#btnNextPage');
        if (btnPrev) btnPrev.disabled = currentPage <= 1;
        if (btnNext) btnNext.disabled = currentPage >= totalPages;

        const pageNums = $('#pageNumbers');
        if (pageNums) {
            const pages = [];
            const maxVisible = 5;
            let sp = Math.max(1, currentPage - Math.floor(maxVisible / 2));
            let ep = Math.min(totalPages, sp + maxVisible - 1);
            if (ep - sp < maxVisible - 1) sp = Math.max(1, ep - maxVisible + 1);

            for (let i = sp; i <= ep; i++) {
                pages.push(`<button class="btn-page ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`);
            }
            pageNums.innerHTML = pages.join('');
        }
    }

    // =====================================================
    // EVENT HANDLERS
    // =====================================================
    function setupEventListeners() {
        // Search — show suggestions + debounced server-side search
        let searchTimeout;
        let suggestionTimeout;

        const searchInput = $('#searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const text = searchInput.value.trim();

                // Show suggestions (fast, client-side from Excel data)
                clearTimeout(suggestionTimeout);
                if (text.length >= 2) {
                    suggestionTimeout = setTimeout(async () => {
                        if (!excelLoaded && !isLoadingExcel) {
                            await loadExcelData();
                        }
                        const results = searchProductsSuggestion(text);
                        displaySuggestions(results);
                    }, 150);
                } else {
                    hideSuggestions();
                }

                // Debounced server-side search
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    hideSuggestions();
                    currentPage = 1;
                    fetchProducts();
                }, 600);
            });

            // Enter key: immediately search and hide suggestions
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    clearTimeout(searchTimeout);
                    clearTimeout(suggestionTimeout);
                    hideSuggestions();
                    currentPage = 1;
                    fetchProducts();
                }
            });

            // Focus: load Excel data in background
            searchInput.addEventListener('focus', () => {
                if (!excelLoaded && !isLoadingExcel) {
                    loadExcelData();
                }
            });
        }

        // Search button
        $('#searchBtn')?.addEventListener('click', () => {
            hideSuggestions();
            currentPage = 1;
            fetchProducts();
        });

        // Click outside to close suggestions
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.header-search-box')) {
                hideSuggestions();
            }
        });

        // Filters — reset to page 1 and re-fetch
        $('#filterStock')?.addEventListener('change', () => { currentPage = 1; fetchProducts(); });
        $('#filterStatus')?.addEventListener('change', () => { currentPage = 1; fetchProducts(); });
        $('#filterGroup')?.addEventListener('change', () => { currentPage = 1; fetchProducts(); });

        // Column filter toggle
        $$('.th-filter-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                const th = e.target.closest('th');
                const input = th?.querySelector('.th-filter-input');
                if (input) {
                    const wasActive = input.classList.contains('active');
                    $$('.th-filter-input').forEach(i => i.classList.remove('active'));
                    $$('.th-filter-icon').forEach(i => i.classList.remove('active'));
                    if (!wasActive) {
                        input.classList.add('active');
                        icon.classList.add('active');
                        input.focus();
                    }
                }
            });
        });

        // Column filter inputs — debounced re-fetch
        let colFilterTimeout;
        $$('.th-filter-input').forEach(input => {
            input.addEventListener('input', () => {
                clearTimeout(colFilterTimeout);
                colFilterTimeout = setTimeout(() => { currentPage = 1; fetchProducts(); }, 400);
            });
            input.addEventListener('click', (e) => e.stopPropagation());
        });

        // Sort — server-side via $orderby
        $$('.sortable').forEach(th => {
            th.addEventListener('click', (e) => {
                if (e.target.closest('.th-filter-input') || e.target.closest('.th-filter-icon')) return;
                const field = th.dataset.sort;
                if (!SORT_FIELD_MAP[field]) return;
                if (sortField === field) {
                    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    sortField = field;
                    sortDirection = 'asc';
                }
                $$('.sortable').forEach(t => t.classList.remove('sort-asc', 'sort-desc'));
                th.classList.add(`sort-${sortDirection}`);
                currentPage = 1;
                fetchProducts();
            });
        });

        // Select all checkbox
        $('#selectAll')?.addEventListener('change', (e) => {
            const checked = e.target.checked;
            $$('.row-checkbox').forEach(cb => {
                cb.checked = checked;
                const id = parseInt(cb.dataset.id, 10);
                if (checked) selectedIds.add(id); else selectedIds.delete(id);
                cb.closest('tr')?.classList.toggle('selected', checked);
            });
        });

        // Row checkbox delegation
        $('#productTableBody')?.addEventListener('change', (e) => {
            if (e.target.classList.contains('row-checkbox')) {
                const id = parseInt(e.target.dataset.id, 10);
                if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
                e.target.closest('tr')?.classList.toggle('selected', e.target.checked);
            }
        });

        // Pagination — fetch new page
        $('#btnPrevPage')?.addEventListener('click', () => {
            if (currentPage > 1) { currentPage--; fetchProducts(); }
        });

        $('#btnNextPage')?.addEventListener('click', () => {
            const totalPages = Math.ceil(totalCount / pageSize);
            if (currentPage < totalPages) { currentPage++; fetchProducts(); }
        });

        $('#pageNumbers')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page]');
            if (btn) {
                currentPage = parseInt(btn.dataset.page, 10);
                fetchProducts();
            }
        });

        $('#pageSize')?.addEventListener('change', (e) => {
            pageSize = parseInt(e.target.value, 10);
            currentPage = 1;
            fetchProducts();
        });

        // Refresh
        $('#refreshButton')?.addEventListener('click', () => {
            fetchProducts();
        });

        // Column settings modal
        $('#btnColumnSettings')?.addEventListener('click', openColumnSettings);
        $('#closeColumnSettings')?.addEventListener('click', closeColumnSettingsModal);
        $('#cancelColumnSettings')?.addEventListener('click', closeColumnSettingsModal);
        $('#saveColumnSettings')?.addEventListener('click', saveColumnSettingsFromModal);
        $('#resetColumns')?.addEventListener('click', resetColumnDefaults);

        // Close modal on overlay click
        $('#columnSettingsModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeColumnSettingsModal();
        });

        // Close modal on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeColumnSettingsModal();
                hideSuggestions();
            }
        });
    }

    // =====================================================
    // IMAGE VIEWER
    // =====================================================
    function showImage(src) {
        const overlay = document.createElement('div');
        overlay.className = 'image-modal-overlay';
        overlay.innerHTML = `<img src="${escapeHtml(src)}" alt="Ảnh sản phẩm">`;
        overlay.addEventListener('click', () => overlay.remove());
        document.body.appendChild(overlay);
    }

    // =====================================================
    // INIT
    // =====================================================
    async function init() {
        console.log('[ProductWarehouse] Initializing...');

        const pageSizeSelect = $('#pageSize');
        if (pageSizeSelect) pageSize = parseInt(pageSizeSelect.value, 10);

        loadColumnVisibility();
        setupEventListeners();

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Wait for TokenManager then fetch first page
        if (window.tokenManager) {
            await window.tokenManager.waitForFirebaseAndInit();
        }
        await fetchProducts();

        console.log('[ProductWarehouse] Initialized, total products:', totalCount);
    }

    window.warehouseApp = { showImage };

    document.addEventListener('DOMContentLoaded', init);
})();
