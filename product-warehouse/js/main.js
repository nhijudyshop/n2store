// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   KHO SẢN PHẨM - PRODUCT WAREHOUSE
   Main JS - UI with all columns, column visibility,
   search with Excel suggestions, filter, sort,
   server-side pagination, variant images
   Data from Render PostgreSQL (web_warehouse table)
   + SSE real-time updates
   ===================================================== */

(function () {
    'use strict';

    // Shared utilities alias
    const WS = window.WarehouseShared;

    // SSE endpoint — built from shared endpoints (single source of truth)
    const SSE_URL = WS.buildSseUrl('web_warehouse');
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

    // Sort field mapping (local key → Render DB column)
    const SORT_FIELD_MAP = {
        code: 'product_code',
        name: 'product_name',
        group: 'category',
        price: 'selling_price',
        defaultBuyPrice: 'purchase_price',
        costPrice: 'standard_price',
        qtyActual: 'tpos_qty_available',
        active: 'active',
        createdAt: 'created_at',
    };

    const RENDER_API = WS.WAREHOUSE_API; // https://.../api/v2/web-warehouse
    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev'; // kept for edit/save operations

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

    // Search debounce
    let _searchDebounceTimer = null;

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
    // SEARCH SUGGESTION SYSTEM (via Render DB)
    // =====================================================

    /**
     * Search products from Render DB for suggestions.
     * Uses the /search endpoint with server-side unaccent.
     */
    async function searchProductsSuggestion(searchText) {
        if (!searchText || searchText.length < 2) return [];
        const rows = await WarehouseAPI.search(searchText, 10);
        return rows.map(row => ({
            id: row.tpos_template_id || row.tpos_product_id,
            name: row.name_get || row.product_name,
            code: row.product_code,
            image: WarehouseAPI.proxyImageUrl(row),
            qty: parseFloat(row.tpos_qty_available) || 0,
            price: parseFloat(row.selling_price) || 0,
        }));
    }

    /**
     * Display suggestion dropdown with product images.
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
                ? `<img class="suggestion-img" src="${escapeHtml(p.image)}" alt="" loading="lazy">`
                : `<span class="suggestion-img suggestion-img-empty"></span>`;
            const qtyClass = p.qty <= 0 ? ' suggestion-qty-zero' : '';
            return `<div class="suggestion-item" data-code="${escapeHtml(p.code)}" data-name="${escapeHtml(p.name)}">
                ${imgHtml}
                <div class="suggestion-info">
                    <div class="suggestion-name"><strong>${escapeHtml(p.code)}</strong> — ${escapeHtml(p.name)}</div>
                    <div class="suggestion-meta">
                        <span class="suggestion-price">${formatPrice(p.price)}</span>
                        <span class="suggestion-qty${qtyClass}">Tồn: ${formatQty(p.qty)}</span>
                    </div>
                </div>
            </div>`;
        }).join('');

        suggestionsDiv.classList.add('show');

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
     * Load variant images for a product template from Render DB.
     * Updates the table row image in-place.
     */
    async function loadVariantImages(templateId, rowElement) {
        if (!templateId || imageCache[templateId] !== undefined) return;

        try {
            const result = await WarehouseAPI.getProduct(templateId);
            if (!result || !result.product) {
                imageCache[templateId] = null;
                return;
            }

            // Find the row with an image_url to proxy
            let imgRow = result.product.image_url ? result.product : null;
            if (!imgRow && result.variants) {
                imgRow = result.variants.find(v => v.image_url);
            }

            const imgUrl = imgRow ? WarehouseAPI.proxyImageUrl(imgRow) : null;
            imageCache[templateId] = imgUrl || null;

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

        const result = await WarehouseAPI.getProduct(templateId);
        if (!result || !result.variants) return [];

        // Map Render DB rows to TPOS-compatible variant objects for rendering
        const variants = result.variants
            .filter(v => v.active !== false)
            .map(v => ({
                Id: v.tpos_product_id,
                DefaultCode: v.product_code,
                NameGet: v.name_get || v.product_name,
                QtyAvailable: parseFloat(v.tpos_qty_available) || 0,
                ListPrice: parseFloat(v.selling_price) || 0,
                PriceVariant: parseFloat(v.selling_price) || 0,
                StandardPrice: parseFloat(v.standard_price) || 0,
                ImageUrl: v.image_url || '',
                Barcode: v.barcode || v.product_code,
                Active: v.active !== false,
                AttributeValues: v.variant ? [{ Name: v.variant }] : [],
            }));

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
    // API - Map Render DB row to local product format
    // =====================================================
    function mapProduct(row) {
        const cachedImg = imageCache[row.tpos_template_id];
        // Use proxied image URL to avoid CORS/auth issues with TPOS images
        const img = (row.image_url && row.tpos_product_id)
            ? `${RENDER_API}/image/${row.tpos_product_id}`
            : (cachedImg || '');
        return {
            id: row.tpos_template_id || row.tpos_product_id,
            code: row.product_code || '',
            name: row.product_name || '',
            group: row.category || '',
            price: parseFloat(row.selling_price) || 0,
            defaultBuyPrice: parseFloat(row.purchase_price) || 0,
            costPrice: parseFloat(row.standard_price) || 0,
            qtyActual: parseFloat(row.tpos_qty_available) || 0,
            qtyForecast: 0,
            unit: row.uom_name || '',
            label: false,
            active: row.active !== false,
            allCompany: false,
            note: '',
            createdAt: row.created_at ? row.created_at.split('T')[0] : '',
            company: '',
            creator: '',
            image: img,
        };
    }

    // =====================================================
    // API - Build filter params for Render GET /
    // =====================================================
    function buildRenderParams() {
        const params = new URLSearchParams();

        params.set('page', String(currentPage));
        params.set('limit', String(pageSize));

        // Sort
        const dbField = SORT_FIELD_MAP[sortField] || 'created_at';
        params.set('sort_by', dbField);
        params.set('sort_order', sortDirection.toUpperCase());

        // Search
        const searchQuery = ($('#searchInput')?.value || '').trim();
        if (searchQuery) params.set('search', searchQuery);

        // Status filter
        const statusFilter = $('#filterStatus')?.value || 'all';
        if (statusFilter === 'active') params.set('active', 'true');
        else if (statusFilter === 'inactive') params.set('active', 'false');

        // Stock filter
        const stockFilter = $('#filterStock')?.value || 'all';
        if (stockFilter === 'in-stock') params.set('has_inventory', 'true');
        else if (stockFilter === 'out-of-stock') params.set('has_inventory', 'false');

        // Category filter
        const categoryFilter = ($('[data-filter="group"]')?.value || '').trim();
        if (categoryFilter) params.set('category', categoryFilter);

        return params;
    }

    // =====================================================
    // SSE SYNC NOTIFICATION (throttled)
    // =====================================================
    let _lastToastAt = 0;
    const TOAST_THROTTLE_MS = 5000;

    function showSyncNotification(payload) {
        const data = payload?.data;
        if (!data) return;

        // Throttle to avoid spam when many events arrive in quick succession
        const now = Date.now();
        if (now - _lastToastAt < TOAST_THROTTLE_MS) return;

        const action = data.action;
        let message = null;
        let level = 'info';

        if (action === 'sync_complete') {
            const stats = data.stats || {};
            const changed = (stats.inserted || 0) + (stats.updated || 0);
            const typeLabel = data.syncType === 'full' ? 'toàn bộ' :
                              data.syncType === 'realtime' ? 'realtime' : 'định kỳ';
            if (changed === 0 && !stats.deactivated) return; // nothing interesting
            const parts = [];
            if (stats.inserted) parts.push(`+${stats.inserted} mới`);
            if (stats.updated)  parts.push(`${stats.updated} cập nhật`);
            if (stats.deactivated) parts.push(`${stats.deactivated} ngừng`);
            message = `Đồng bộ TPOS (${typeLabel}): ${parts.join(', ') || 'không đổi'}`;
            level = 'success';
        } else if (action === 'deactivated') {
            message = `TPOS xóa sản phẩm (${data.count || 1} biến thể)`;
            level = 'warning';
        } else if (action === 'image_update') {
            message = 'TPOS cập nhật ảnh sản phẩm';
            level = 'info';
        }

        if (message) {
            showToast(message, level);
            _lastToastAt = now;
        }
    }

    // =====================================================
    // MANUAL TPOS FULL SYNC
    // =====================================================
    let _syncPollTimer = null;

    async function triggerFullTPOSSync() {
        const btn = $('#btnSyncTPOS');
        if (!btn || btn.disabled) return;

        if (!confirm('Đồng bộ toàn bộ sản phẩm từ TPOS?\nThao tác này có thể mất vài phút (~4500 sản phẩm).')) return;

        btn.disabled = true;
        btn.classList.add('syncing');
        const originalLabel = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="refresh-cw"></i> Đang đồng bộ…';
        WS.initIcons();

        // Capture baseline before triggering — so poll doesn't match a pre-existing log
        let baselineId = 0;
        try {
            const baseRes = await fetch(`${RENDER_API}/sync/status`);
            const baseJson = await baseRes.json().catch(() => ({}));
            baselineId = baseJson?.lastSync?.id || 0;
        } catch (_) { /* best effort */ }

        try {
            const res = await fetch(`${RENDER_API}/sync?type=full`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const json = await res.json().catch(() => ({}));

            if (!res.ok || !json.success) {
                throw new Error(json.error || `HTTP ${res.status}`);
            }

            showToast('Đã bắt đầu đồng bộ TPOS. Đang chạy nền…', 'info');
            pollSyncStatus(btn, originalLabel, baselineId);
        } catch (err) {
            console.error('[SyncTPOS] Trigger failed:', err);
            showToast('Lỗi đồng bộ: ' + err.message, 'error');
            restoreSyncButton(btn, originalLabel);
        }
    }

    function pollSyncStatus(btn, originalLabel, baselineId = 0) {
        if (_syncPollTimer) clearInterval(_syncPollTimer);

        let ticks = 0;
        const MAX_TICKS = 120; // 120 * 5s = 10 phút timeout

        _syncPollTimer = setInterval(async () => {
            ticks++;
            try {
                const res = await fetch(`${RENDER_API}/sync/status`);
                const json = await res.json();
                const last = json.lastSync;

                // Only accept a log row that is NEWER than the baseline captured before trigger
                const isNewer = last && (last.id > baselineId);

                if (isNewer && last.sync_type === 'full') {
                    if (last.status === 'success') {
                        clearInterval(_syncPollTimer);
                        _syncPollTimer = null;
                        const stats = last.stats || {};
                        showToast(
                            `Đồng bộ xong: +${stats.inserted || 0} mới, ${stats.updated || 0} cập nhật, ${stats.deactivated || 0} ngừng hiệu lực`,
                            'success'
                        );
                        restoreSyncButton(btn, originalLabel);
                        fetchProducts(true);
                        return;
                    }
                    if (last.status === 'failed') {
                        clearInterval(_syncPollTimer);
                        _syncPollTimer = null;
                        showToast('Đồng bộ thất bại: ' + (last.error_message || 'unknown'), 'error');
                        restoreSyncButton(btn, originalLabel);
                        return;
                    }
                }

                if (ticks >= MAX_TICKS) {
                    clearInterval(_syncPollTimer);
                    _syncPollTimer = null;
                    showToast('Đồng bộ quá lâu, kiểm tra server log', 'warning');
                    restoreSyncButton(btn, originalLabel);
                }
            } catch (err) {
                console.warn('[SyncTPOS] Poll error:', err.message);
            }
        }, 5000);
    }

    function restoreSyncButton(btn, originalLabel) {
        if (!btn) return;
        btn.disabled = false;
        btn.classList.remove('syncing');
        btn.innerHTML = originalLabel;
        WS.initIcons();
    }

    // =====================================================
    // API - Fetch products from Render DB
    // =====================================================
    async function fetchProducts(silent = false) {
        if (isLoading) return;
        isLoading = true;
        if (!silent) showLoading(true);

        try {
            const params = buildRenderParams();
            const url = `${RENDER_API}?${params.toString()}`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            totalCount = result.pagination?.total || 0;
            pageProducts = (result.data || []).map(mapProduct);

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
                                <button class="btn-action btn-action-print" title="In mã vạch"><i data-lucide="printer"></i></button>
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
                    if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
                    _searchDebounceTimer = setTimeout(async () => {
                        const results = await searchProductsSuggestion(searchText);
                        displaySuggestions(results);
                    }, 300);
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

        // Print barcode — click print button (single product)
        $('#productTableBody')?.addEventListener('click', (e) => {
            const printBtn = e.target.closest('.btn-action-print');
            if (printBtn) {
                e.stopPropagation();
                const row = printBtn.closest('tr[data-template-id]');
                if (row) {
                    const templateId = parseInt(row.dataset.templateId, 10);
                    const product = allProducts.find(p => p.id === templateId);
                    if (product) openBarcodePrint([product]);
                }
                return;
            }
        });

        // Delete product — click delete button
        $('#productTableBody')?.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.btn-action-delete');
            if (deleteBtn) {
                e.stopPropagation();
                const row = deleteBtn.closest('tr[data-template-id]');
                if (row) {
                    const templateId = parseInt(row.dataset.templateId, 10);
                    if (templateId) deleteProduct(templateId);
                }
                return;
            }
        });

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

        // Sync TPOS full (manual)
        $('#btnSyncTPOS')?.addEventListener('click', triggerFullTPOSSync);

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

            showToast('Đã lưu. Đang đồng bộ TPOS…', 'success');
            closeEditModal();

            // Notify SSE clients (soluong-live, order-management) about image update
            if (editImageBase64) {
                const templateId = parseInt($('#editProductId').value);
                fetch(`${RENDER_API}/notify-image-update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tposProductId: templateId,
                        tposTemplateId: templateId,
                    }),
                }).catch(e => console.warn('[Edit] Notify image update failed:', e));
            }

            // Render DB lags behind: TPOS socket event (~instant) → listener debounce 3s
            // → _syncTemplate fetch (~1-2s) → SSE notify. Total ~5-7s.
            // Delay explicit refresh; SSE handler (setupSSE) will also refresh when sync lands.
            setTimeout(() => fetchProducts(true), 6000);
        } catch (err) {
            console.error('[Edit] Save failed:', err);
            showToast('Lỗi lưu: ' + err.message, 'error');
        }
    }

    // =====================================================
    // DELETE PRODUCT
    // =====================================================

    /**
     * Open barcode print dialog for products
     * @param {Array} products - Array of product objects from allProducts
     */
    function openBarcodePrint(products) {
        if (!window.BarcodeLabelDialog) {
            alert('Barcode label dialog chưa sẵn sàng. Vui lòng tải lại trang.');
            return;
        }
        if (!products.length) return;

        // Convert product-warehouse format to barcode dialog format
        const order = {
            items: products.map(p => ({
                id: p.id,
                productName: p.name || '',
                productCode: p.code || '',
                variant: '',
                quantity: Math.max(1, Math.round(p.qtyActual || 1)),
                sellingPrice: p.price || 0,
                tposProductId: p.id // product-warehouse ID = TPOS ProductTemplate ID
            }))
        };

        window.BarcodeLabelDialog.open(order);
    }

    // Expose for toolbar bulk print
    window.warehouseApp = window.warehouseApp || {};
    window.warehouseApp.printBarcode = function() {
        const selected = allProducts.filter(p => selectedIds.has(p.id));
        if (!selected.length) {
            alert('Vui lòng chọn sản phẩm trước');
            return;
        }
        openBarcodePrint(selected);
    };

    async function deleteProduct(templateId) {
        const product = pageProducts.find(p => p.id === templateId);
        const name = product ? `${product.code} - ${product.name}` : `ID ${templateId}`;

        if (!confirm(`Xóa sản phẩm "${name}"?\n\nSản phẩm sẽ bị ngưng hoạt động (Archive) trên TPOS.`)) {
            return;
        }

        try {
            showToast('Đang xóa...', 'info');

            // Use UpdateV2 to set Active=false (archive) — same as TPOS "Lưu trữ"
            const detail = await fetchProductDetail(templateId);
            const payload = { ...detail };
            delete payload['@odata.context'];
            payload.Active = false;

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

            showToast(`Đã xóa "${name}"`, 'success');
            fetchProducts(true);
        } catch (err) {
            console.error('[Delete] Failed:', err);
            showToast('Lỗi xóa: ' + err.message, 'error');
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

        // Fetch first page from Render DB
        await fetchProducts();

        // SSE real-time: auto-refresh when TPOS products change
        sseCtrl = WS.setupSSE({
            sseUrl: SSE_URL,
            onEvent: (payload) => {
                // Show a non-intrusive toast so user knows sync happened in the background
                showSyncNotification(payload);
            },
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
