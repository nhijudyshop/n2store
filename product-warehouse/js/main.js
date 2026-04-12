// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   KHO SẢN PHẨM - PRODUCT WAREHOUSE
   Main JS - UI with all columns, column visibility,
   search with Excel suggestions, filter, sort,
   server-side pagination, variant images
   Data from TPOS OData API via Cloudflare proxy
   + SSE real-time updates (shared with web-warehouse)
   ===================================================== */

(function () {
    'use strict';

    // Shared utilities alias
    const WS = window.WarehouseShared;

    // SSE endpoint — same as web-warehouse, listens for TPOS product changes
    const SSE_URL = 'https://n2store-fallback.onrender.com/api/realtime/sse?keys=web_warehouse';
    let sseCtrl = null;

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

    // Excel suggestion state (same pattern as soluong-live)
    let excelProducts = [];
    let isLoadingExcel = false;

    // Image cache: templateId → imageUrl
    let imageCache = {};

    // Variant expand state
    let variantCache = {};        // templateId → variants array
    let expandedIds = new Set();  // currently expanded template IDs

    // =====================================================
    // DOM REFS
    // =====================================================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // =====================================================
    // HELPERS (delegates to WarehouseShared)
    // =====================================================
    const formatPrice = WS.formatPrice;
    const formatQty = WS.formatQty;
    const getQtyClass = WS.getQtyClass;
    const escapeHtml = WS.escapeHtml;
    const highlightMatch = WS.highlightMatch;
    const removeVietnameseTones = WS.removeVietnameseTones;

    // =====================================================
    // EXCEL SUGGESTION SYSTEM
    // =====================================================

    /**
     * Load product data from TPOS Excel export API.
     * Used for fast client-side search suggestions.
     */
    async function loadExcelData() {
        if (isLoadingExcel || excelProducts.length > 0) return;

        isLoadingExcel = true;
        console.log('[Warehouse] Loading Excel data...');

        try {
            const response = await window.tokenManager.authenticatedFetch(
                `${PROXY_URL}/api/ProductTemplate/ExportFileV2?Active=true&priceId=0&DefaultCodeView=&company_id=&all_company=false`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'feature-version': '2'
                    },
                    body: JSON.stringify({
                        data: JSON.stringify({"Filter":{"logic":"and","filters":[{"field":"Active","operator":"eq","value":true}]}}),
                        ids: []
                    })
                }
            );

            if (!response.ok) throw new Error('HTTP ' + response.status);

            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            excelProducts = jsonData.map(row => {
                const name = row['Tên sản phẩm'] || '';
                let code = row['Mã sản phẩm'] || '';
                if (!code) {
                    const bracketMatch = name.match(/\[([^\]]+)\]/);
                    if (bracketMatch) code = bracketMatch[1];
                }
                return {
                    id: row['Id sản phẩm (*)'] || row['Id'],
                    name: name,
                    nameNoSign: removeVietnameseTones(name),
                    code: code
                };
            });

            console.log(`[Warehouse] Excel loaded: ${excelProducts.length} products`);
        } catch (error) {
            console.error('[Warehouse] Excel load error:', error);
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

        suggestionsDiv.innerHTML = suggestions.map(p => `
            <div class="suggestion-item" data-code="${escapeHtml(p.code)}" data-name="${escapeHtml(p.name)}">
                <strong>${escapeHtml(p.code)}</strong> - ${escapeHtml(p.name)}
            </div>
        `).join('');

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
    // VARIANT EXPAND SYSTEM
    // =====================================================

    const SIZE_ORDER = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

    function sortVariants(variants) {
        return [...variants].sort((a, b) => {
            const nameA = a.NameGet || '';
            const nameB = b.NameGet || '';

            // Extract number in parentheses: (1), (2), (3)
            const numA = nameA.match(/\((\d+)\)/);
            const numB = nameB.match(/\((\d+)\)/);
            if (numA && numB) return parseInt(numA[1]) - parseInt(numB[1]);
            if (numA) return -1;
            if (numB) return 1;

            // Extract size in parentheses: (S), (M), (L)
            const sizeA = nameA.match(/\(([^)]+)\)$/);
            const sizeB = nameB.match(/\(([^)]+)\)$/);
            if (sizeA && sizeB) {
                const idxA = SIZE_ORDER.indexOf(sizeA[1].toUpperCase());
                const idxB = SIZE_ORDER.indexOf(sizeB[1].toUpperCase());
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
            }

            return nameA.localeCompare(nameB, 'vi');
        });
    }

    async function fetchVariants(templateId) {
        if (variantCache[templateId]) return variantCache[templateId];

        const url = `${PROXY_URL}/api/odata/ProductTemplate(${templateId})?$expand=ProductVariants($expand=AttributeValues)`;
        const response = await window.tokenManager.authenticatedFetch(url, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const variants = (data.ProductVariants || []).filter(v => v.Active === true);
        const sorted = sortVariants(variants);

        variantCache[templateId] = sorted;
        return sorted;
    }

    function formatAttributeValues(attrValues) {
        if (!attrValues || attrValues.length === 0) return '-';
        return attrValues.map(a => {
            const name = a.AttributeName || a.Attribute?.Name || '';
            const value = a.Name || a.Value || '';
            return name ? `${name}: ${value}` : value;
        }).join(', ');
    }

    function renderVariantSubRow(variants, templateId, templateImage) {
        if (!variants || variants.length === 0) {
            return `<tr class="variant-expand-row" data-variant-for="${templateId}">
                <td colspan="20"><div class="variant-loading">Không có biến thể</div></td>
            </tr>`;
        }

        const rows = variants.map(v => {
            const imgUrl = v.ImageUrl || templateImage || '';
            const imgHtml = imgUrl
                ? `<img class="variant-img" src="${escapeHtml(imgUrl)}" alt="" loading="lazy">`
                : `<span class="variant-img-placeholder">-</span>`;
            const qtyClass = (v.QtyAvailable || 0) <= 0 ? ' qty-zero' : '';
            const price = v.PriceVariant || v.ListPrice || 0;
            const cost = v.StandardPrice || 0;

            return `<tr>
                <td>${imgHtml}</td>
                <td class="variant-code">${escapeHtml(v.DefaultCode || '')}</td>
                <td>${escapeHtml(v.NameGet || '')}</td>
                <td class="variant-attr">${formatAttributeValues(v.AttributeValues)}</td>
                <td class="variant-price">${formatPrice(price)}</td>
                <td class="variant-price">${formatPrice(cost)}</td>
                <td class="variant-qty${qtyClass}">${formatQty(v.QtyAvailable || 0)}</td>
                <td class="variant-barcode">${escapeHtml(v.Barcode || v.DefaultCode || '')}</td>
            </tr>`;
        }).join('');

        return `<tr class="variant-expand-row" data-variant-for="${templateId}">
            <td colspan="20">
                <div class="variant-container">
                    <h4>*Biến thể</h4>
                    <table class="variant-table">
                        <thead><tr>
                            <th style="width:40px"></th>
                            <th>Mã</th>
                            <th>Tên</th>
                            <th>Thuộc tính</th>
                            <th style="text-align:right">Giá biến thể</th>
                            <th style="text-align:right">Giá vốn</th>
                            <th style="text-align:right">Số lượng thực tế</th>
                            <th>Mã vạch</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </td>
        </tr>`;
    }

    async function toggleVariantExpand(templateId, rowElement) {
        const existingRow = document.querySelector(`tr[data-variant-for="${templateId}"]`);

        if (existingRow) {
            // Collapse
            existingRow.remove();
            expandedIds.delete(templateId);
            rowElement.classList.remove('row-expanded-parent');
            const btn = rowElement.querySelector('.btn-action-expand');
            if (btn) btn.classList.remove('expanded');
            return;
        }

        // Expand
        expandedIds.add(templateId);
        rowElement.classList.add('row-expanded-parent');
        const btn = rowElement.querySelector('.btn-action-expand');
        if (btn) btn.classList.add('expanded');

        // Show loading row
        const loadingRow = document.createElement('tr');
        loadingRow.className = 'variant-expand-row';
        loadingRow.setAttribute('data-variant-for', templateId);
        loadingRow.innerHTML = '<td colspan="20"><div class="variant-loading">Đang tải biến thể...</div></td>';
        rowElement.after(loadingRow);

        try {
            const variants = await fetchVariants(templateId);
            const product = pageProducts.find(p => p.id === templateId);
            const templateImage = product?.image || '';
            loadingRow.outerHTML = renderVariantSubRow(variants, templateId, templateImage);
        } catch (error) {
            console.error('[Warehouse] Variant load error:', error);
            loadingRow.innerHTML = '<td colspan="20"><div class="variant-loading" style="color:#dc2626">Lỗi tải biến thể</div></td>';
        }
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

        // Search is handled via DefaultCode param in fetchProducts, not in $filter

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
    async function fetchProducts(silent = false) {
        if (isLoading) return;
        isLoading = true;
        if (!silent) showLoading(true);

        try {
            const skip = (currentPage - 1) * pageSize;

            // Build OData orderby
            const odataField = SORT_FIELD_MAP[sortField] || 'DateCreated';
            const orderby = `${odataField} ${sortDirection}`;

            // Search by DefaultCode as top-level param
            const searchQuery = ($('#searchInput')?.value || '').trim();

            // Build common params
            function buildParams(endpoint) {
                const params = new URLSearchParams();
                params.set('Active', 'true');
                if (endpoint === 'ProductTemplate') {
                    params.set('priceId', '0');
                }
                if (searchQuery) {
                    params.set('DefaultCode', searchQuery);
                }
                params.set('$top', String(pageSize));
                params.set('$skip', String(skip));
                params.set('$orderby', orderby);
                params.set('$count', 'true');
                if (endpoint === 'ProductTemplate') {
                    const filterStr = buildODataFilter();
                    const fullFilter = filterStr ? `Active eq true and ${filterStr}` : 'Active eq true';
                    params.set('$filter', fullFilter);
                }
                return params;
            }

            // Try ProductTemplate first
            const templateParams = buildParams('ProductTemplate');
            const templateUrl = API_CONFIG.buildUrl.tposOData(
                'ProductTemplate/ODataService.GetViewV2',
                templateParams.toString()
            );

            console.log('[Warehouse] Fetching:', templateUrl);

            const response = await window.tokenManager.authenticatedFetch(templateUrl, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            let data = await response.json();
            totalCount = data['@odata.count'] || 0;

            // Fallback: if searching and no template results, try variant endpoint
            if (totalCount === 0 && searchQuery) {
                console.log('[Warehouse] No template results, fallback to variant search...');
                const variantParams = buildParams('Product');
                const variantUrl = API_CONFIG.buildUrl.tposOData(
                    'Product/OdataService.GetViewV2',
                    variantParams.toString()
                );

                console.log('[Warehouse] Variant fallback:', variantUrl);

                const variantResponse = await window.tokenManager.authenticatedFetch(variantUrl, {
                    headers: { 'Accept': 'application/json' }
                });

                if (variantResponse.ok) {
                    data = await variantResponse.json();
                    totalCount = data['@odata.count'] || 0;
                    console.log('[Warehouse] Variant fallback found:', totalCount, 'results');
                }
            }

            pageProducts = (data.value || []).map(mapProduct);

            console.log('[Warehouse] Loaded', pageProducts.length, 'products, total:', totalCount);
        } catch (error) {
            console.error('[Warehouse] Fetch error:', error);
            pageProducts = [];
            totalCount = 0;
            showToast('Lỗi tải dữ liệu: ' + error.message, 'error');
        } finally {
            isLoading = false;
            if (!silent) showLoading(false);
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

    const showToast = WS.showToast;

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
        WS.initIcons();
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
                                <button class="btn-action btn-action-expand${expandedIds.has(p.id) ? ' expanded' : ''}" title="Xem biến thể" data-expand-id="${p.id}"><i data-lucide="chevron-down"></i></button>
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
        WS.initIcons();
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
        // Search — show suggestion dropdown only (no server search on typing)
        const searchInput = $('#searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchText = e.target.value.trim();

                if (searchText.length >= 2) {
                    if (excelProducts.length === 0) {
                        loadExcelData().then(() => {
                            const results = searchProductsSuggestion(searchText);
                            displaySuggestions(results);
                        });
                    } else {
                        const results = searchProductsSuggestion(searchText);
                        displaySuggestions(results);
                    }
                } else {
                    hideSuggestions();
                }
            });

            // Enter key: search server and hide suggestions
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    hideSuggestions();
                    currentPage = 1;
                    fetchProducts();
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

        // Edit product — click edit button
        $('#productTableBody')?.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.btn-action-edit');
            if (editBtn) {
                e.stopPropagation();
                const row = editBtn.closest('tr[data-template-id]');
                if (row) {
                    const templateId = parseInt(row.dataset.templateId, 10);
                    if (templateId) openEditProduct(templateId);
                }
                return;
            }
        });

        // Edit modal buttons
        $('#closeEditProduct')?.addEventListener('click', closeEditModal);
        $('#cancelEditProduct')?.addEventListener('click', closeEditModal);
        $('#saveEditProduct')?.addEventListener('click', saveEditProduct);
        $('#editProductModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeEditModal();
        });
        setupImageUpload();

        // Variant expand — click expand button or click on row
        $('#productTableBody')?.addEventListener('click', (e) => {
            // Expand button click
            const expandBtn = e.target.closest('.btn-action-expand');
            if (expandBtn) {
                e.stopPropagation();
                const templateId = parseInt(expandBtn.dataset.expandId, 10);
                const row = expandBtn.closest('tr');
                if (templateId && row) toggleVariantExpand(templateId, row);
                return;
            }

            // Row click (exclude checkbox, actions buttons, image)
            if (e.target.closest('.col-checkbox') ||
                e.target.closest('.btn-action-edit') ||
                e.target.closest('.btn-action-delete') ||
                e.target.closest('.product-image-cell') ||
                e.target.closest('.variant-expand-row')) return;

            const row = e.target.closest('tr[data-template-id]');
            if (row) {
                const templateId = parseInt(row.dataset.templateId, 10);
                if (templateId) toggleVariantExpand(templateId, row);
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
                closeEditModal();
                hideSuggestions();
            }
        });
    }

    // =====================================================
    // EDIT PRODUCT
    // =====================================================

    let editingProduct = null; // full TPOS product detail for update
    let cachedCategories = null;
    let cachedPOSCategories = null;
    let cachedUOMs = null;
    let editImageBase64 = null; // new image selected by user

    /**
     * Fetch full product detail from TPOS (needed for UpdateV2)
     */
    async function fetchProductDetail(templateId) {
        const url = `${PROXY_URL}/api/odata/ProductTemplate(${templateId})?$expand=ProductVariants($expand=AttributeValues)`;
        const response = await window.tokenManager.authenticatedFetch(url, {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }

    /**
     * Fetch dropdown data (categories, UOMs) — cached after first load
     */
    async function ensureDropdownData() {
        const fetchJSON = async (endpoint) => {
            const r = await window.tokenManager.authenticatedFetch(
                `${PROXY_URL}/api/odata/${endpoint}`,
                { headers: { 'Accept': 'application/json' } }
            );
            return r.ok ? (await r.json()).value || [] : [];
        };

        if (!cachedCategories) {
            cachedCategories = await fetchJSON('ProductCategory?$orderby=CompleteName asc&$top=500');
        }
        if (!cachedPOSCategories) {
            cachedPOSCategories = await fetchJSON('POSCategory?$orderby=Name asc&$top=500');
        }
        if (!cachedUOMs) {
            cachedUOMs = await fetchJSON('ProductUOM?$orderby=Name asc&$top=200');
        }
    }

    function populateSelect(selectId, items, valueField, textField, selectedValue) {
        const el = $(selectId);
        if (!el) return;
        const hasEmpty = el.querySelector('option[value=""]');
        el.innerHTML = (hasEmpty ? '<option value="">-- Không --</option>' : '') +
            items.map(it => {
                const val = it[valueField];
                const text = it[textField] || it.Name || '';
                return `<option value="${val}"${val == selectedValue ? ' selected' : ''}>${escapeHtml(text)}</option>`;
            }).join('');
    }

    /**
     * Open edit modal for a product
     */
    async function openEditProduct(templateId) {
        try {
            showToast('Đang tải chi tiết...', 'info');

            const [detail] = await Promise.all([
                fetchProductDetail(templateId),
                ensureDropdownData()
            ]);
            editingProduct = detail;
            editImageBase64 = null;

            // Basic info
            $('#editProductId').value = templateId;
            $('#editProductName').value = detail.Name || '';
            $('#editProductCode').value = detail.DefaultCode || '';
            $('#editBarcode').value = detail.Barcode || '';

            // Image preview
            const imgPreview = $('#editImagePreview');
            if (imgPreview) {
                const imgUrl = detail.ImageUrl || (detail.Image ? `data:image/png;base64,${detail.Image}` : '');
                imgPreview.innerHTML = imgUrl
                    ? `<img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;">`
                    : '<span style="color:#9ca3af;font-size:11px;">No image</span>';
            }

            // Prices
            $('#editListPrice').value = detail.ListPrice || 0;
            $('#editPurchasePrice').value = detail.PurchasePrice || 0;
            $('#editDiscountSale').value = detail.DiscountSale || 0;
            $('#editDiscountPurchase').value = detail.DiscountPurchase || 0;

            // Categories & UOM dropdowns
            populateSelect('#editCategId', cachedCategories, 'Id', 'CompleteName', detail.CategId);
            populateSelect('#editPOSCategId', cachedPOSCategories, 'Id', 'Name', detail.POSCategId);
            populateSelect('#editUOMId', cachedUOMs, 'Id', 'Name', detail.UOMId);
            populateSelect('#editUOMPOId', cachedUOMs, 'Id', 'Name', detail.UOMPOId);

            // Classification
            $('#editWeight').value = detail.Weight || 0;
            $('#editTracking').value = detail.Tracking || 'none';

            // Status checkboxes
            $('#editActive').checked = detail.Active !== false;
            $('#editSaleOK').checked = detail.SaleOK !== false;
            $('#editPurchaseOK').checked = detail.PurchaseOK !== false;
            $('#editAvailableInPOS').checked = detail.AvailableInPOS !== false;

            // Accounting
            $('#editInvoicePolicy').value = detail.InvoicePolicy || 'order';
            $('#editPurchaseMethod').value = detail.PurchaseMethod || 'receive';

            // Descriptions
            $('#editDescriptionSale').value = detail.DescriptionSale || '';
            $('#editDescriptionPurchase').value = detail.DescriptionPurchase || '';
            $('#editDescription').value = detail.Description || '';

            $('#editProductModal').classList.add('show');
            WS.initIcons();
        } catch (err) {
            console.error('[Edit] Failed to load product detail:', err);
            showToast('Lỗi tải chi tiết: ' + err.message, 'error');
        }
    }

    function closeEditModal() {
        $('#editProductModal')?.classList.remove('show');
        editingProduct = null;
        editImageBase64 = null;
    }

    /**
     * Handle image file selection
     */
    function setupImageUpload() {
        const preview = $('#editImagePreview');
        const fileInput = $('#editImageFile');
        if (!preview || !fileInput) return;

        preview.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const dataUrl = ev.target.result;
                editImageBase64 = dataUrl.split(',')[1]; // strip data:image/...;base64,
                preview.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
            };
            reader.readAsDataURL(file);
        });
    }

    /**
     * Save edited product to TPOS via UpdateV2
     */
    async function saveEditProduct() {
        if (!editingProduct) return;

        const payload = { ...editingProduct };
        delete payload['@odata.context'];

        // Basic info
        payload.Name = $('#editProductName').value.trim();
        payload.DefaultCode = $('#editProductCode').value.trim();
        payload.Barcode = $('#editBarcode').value.trim();

        // Image
        if (editImageBase64) {
            payload.Image = editImageBase64;
        }

        // Prices
        payload.ListPrice = parseFloat($('#editListPrice').value) || 0;
        payload.PurchasePrice = parseFloat($('#editPurchasePrice').value) || 0;
        payload.DiscountSale = parseFloat($('#editDiscountSale').value) || 0;
        payload.DiscountPurchase = parseFloat($('#editDiscountPurchase').value) || 0;

        // Categories & UOM
        payload.CategId = parseInt($('#editCategId').value) || payload.CategId;
        payload.POSCategId = $('#editPOSCategId').value ? parseInt($('#editPOSCategId').value) : null;
        payload.UOMId = parseInt($('#editUOMId').value) || payload.UOMId;
        payload.UOMPOId = parseInt($('#editUOMPOId').value) || payload.UOMPOId;
        payload.Weight = parseFloat($('#editWeight').value) || 0;
        payload.Tracking = $('#editTracking').value || 'none';

        // Status
        payload.Active = $('#editActive').checked;
        payload.SaleOK = $('#editSaleOK').checked;
        payload.PurchaseOK = $('#editPurchaseOK').checked;
        payload.AvailableInPOS = $('#editAvailableInPOS').checked;

        // Accounting
        payload.InvoicePolicy = $('#editInvoicePolicy').value || 'order';
        payload.PurchaseMethod = $('#editPurchaseMethod').value || 'receive';

        // Descriptions
        payload.DescriptionSale = $('#editDescriptionSale').value.trim();
        payload.DescriptionPurchase = $('#editDescriptionPurchase').value.trim();
        payload.Description = $('#editDescription').value.trim();

        try {
            showToast('Đang lưu...', 'info');

            const url = `${PROXY_URL}/api/odata/ProductTemplate/ODataService.UpdateV2`;
            const response = await window.tokenManager.authenticatedFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `HTTP ${response.status}`);
            }

            showToast('Đã lưu thành công!', 'success');
            closeEditModal();
            fetchProducts(true);
        } catch (err) {
            console.error('[Edit] Save failed:', err);
            showToast('Lỗi lưu: ' + err.message, 'error');
        }
    }

    // =====================================================
    // IMAGE (delegates to WarehouseShared)
    // =====================================================
    const showImage = WS.showImageOverlay;

    // =====================================================
    // INIT
    // =====================================================
    async function init() {
        console.log('[ProductWarehouse] Initializing...');

        const pageSizeSelect = $('#pageSize');
        if (pageSizeSelect) pageSize = parseInt(pageSizeSelect.value, 10);

        loadColumnVisibility();
        setupEventListeners();
        WS.initImageZoomHover('#productTableBody');

        WS.initIcons();

        // Wait for TokenManager then fetch first page
        if (window.tokenManager) {
            await window.tokenManager.waitForFirebaseAndInit();
        }
        await fetchProducts();

        // Preload Excel data for search suggestions (after token is ready)
        loadExcelData();

        // SSE real-time: auto-refresh when TPOS products change
        sseCtrl = WS.setupSSE({
            sseUrl: SSE_URL,
            onReload: () => {
                console.log('[ProductWarehouse] SSE triggered refresh');
                variantCache = {}; // Clear variant cache on TPOS change
                imageCache = {};   // Clear image cache
                fetchProducts(true); // silent=true: no loading flash
            },
            ignoreActions: [], // Refresh on all TPOS changes
            debounceMs: 3000,
        });

        console.log('[ProductWarehouse] Initialized with SSE real-time, total products:', totalCount);
    }

    window.warehouseApp = { showImage };

    document.addEventListener('DOMContentLoaded', init);
})();
