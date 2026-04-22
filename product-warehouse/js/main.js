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

    /**
     * Escape a user-provided string for safe embedding in OData $filter string literals.
     * OData escapes `'` by doubling: O'Brien → 'O''Brien'. Then URI-encode.
     * Prevents OData injection (e.g. `'; Id eq 1 or 1 eq 1--'`).
     */
    const _odataStr = (s) => encodeURIComponent(String(s ?? '').replace(/'/g, "''"));
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
        // Only iterate main product rows (exclude expanded variant sub-rows) to avoid off-by-one
        // when mapping `rows[idx]` → `pageProducts[idx]`.
        const rows = $$('#productTableBody tr[data-template-id]');
        rows.forEach(row => {
            const templateId = parseInt(row.dataset.templateId, 10);
            if (!templateId) return;
            const product = pageProducts.find(p => p.id === templateId);
            if (!product || product.image) return; // already has image
            if (imageCache[templateId] === null) return; // already checked, no image

            if (imageCache[templateId]) {
                const imgCell = row.querySelector('.product-image-cell');
                if (imgCell) {
                    imgCell.innerHTML = `<img src="${escapeHtml(imageCache[templateId])}" alt="" class="product-thumb" loading="lazy" onclick="window.warehouseApp.showImage(this.src)">`;
                }
            } else {
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
            // Tags: forward-compat — if Render sync includes tags JSONB, use it; else empty.
            tags: Array.isArray(row.tags) ? row.tags : (row.tags && typeof row.tags === 'object' ? [row.tags] : []),
            label: Array.isArray(row.tags) ? row.tags.length > 0 : false,
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
    async function buildRenderParams() {
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

        // Tag filter — resolve Tag → Template IDs via TPOS (bridge until Render schema has tags)
        const tagVal = $('#filterTag')?.value;
        if (tagVal && tagVal !== 'all') {
            const ids = await resolveTagTemplateIds(tagVal);
            if (ids && ids.length) {
                // Cap at 500 IDs to avoid URL length limit
                if (ids.length > 500) {
                    showToast(`Nhãn khớp ${ids.length} SP — chỉ hiển thị 500 đầu (dùng search để thu hẹp)`, 'info');
                }
                params.set('template_ids', ids.slice(0, 500).join(','));
            } else if (ids !== null) {
                // Tag resolved to 0 products — force empty set
                params.set('template_ids', '0');
            }
        }

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
            const params = await buildRenderParams();
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
                                <button class="btn-action btn-action-stock" title="Điều chỉnh tồn" style="color:#0ea5e9;"><i data-lucide="package-plus"></i></button>
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
                        <td data-col="label">${p.tags && p.tags.length ? p.tags.map(t => `<span class="tag-chip" style="background:${t.Color||'#6366f1'};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;margin-right:3px;display:inline-block;">${escapeHtml(t.Name||t.name||'')}</span>`).join('') : '-'}</td>
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
                    const product = pageProducts.find(p => p.id === templateId);
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
                e.target.closest('.btn-action-stock') ||
                e.target.closest('.btn-action-print') ||
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
            pageSize = parseInt(e.target.value, 10) || 50;
            currentPage = 1;
            fetchProducts();
        });

        // Refresh
        $('#refreshButton')?.addEventListener('click', () => {
            fetchProducts();
        });

        // Sync TPOS full (manual)
        $('#btnSyncTPOS')?.addEventListener('click', triggerFullTPOSSync);

        // --- P1 features ---
        // Create product (opens edit modal in 'create' mode)
        $('#btnCreateProduct')?.addEventListener('click', openCreateProduct);

        // Export Excel
        $('#btnExportExcel')?.addEventListener('click', exportToExcel);

        // Import Excel
        $('#btnImportExcel')?.addEventListener('click', openImportExcel);
        $('#closeImportExcel')?.addEventListener('click', closeImportExcel);
        $('#cancelImportExcel')?.addEventListener('click', closeImportExcel);
        $('#importExcelFile')?.addEventListener('change', (e) => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f);
        });
        $('#confirmImportExcel')?.addEventListener('click', confirmImport);
        $('#downloadImportTemplate')?.addEventListener('click', (e) => {
            e.preventDefault();
            downloadImportTemplate();
        });

        // Bulk price update
        $('#btnBulkPrice')?.addEventListener('click', openBulkPrice);
        $('#closeBulkPrice')?.addEventListener('click', closeBulkPrice);
        $('#cancelBulkPrice')?.addEventListener('click', closeBulkPrice);
        $('#bulkPriceFile')?.addEventListener('change', (e) => {
            const f = e.target.files?.[0];
            if (f) handleBulkPriceFile(f);
        });
        $('#confirmBulkPrice')?.addEventListener('click', confirmBulkPrice);

        // Tag filter — loads list lazily
        $('#filterTag')?.addEventListener('focus', () => { populateTagFilter(); }, { once: true });
        $('#filterTag')?.addEventListener('change', () => {
            currentPage = 1;
            fetchProducts();
        });

        // --- P2/P3 features ---
        // AttributeLines add/edit/delete
        $('#btnAddAttributeLine')?.addEventListener('click', () => promptAttributeLine(null));
        $('#attributeLinesList')?.addEventListener('click', (e) => {
            const editBtn = e.target.closest('[data-edit-attr-line]');
            if (editBtn) {
                promptAttributeLine(parseInt(editBtn.dataset.editAttrLine));
                return;
            }
            const delBtn = e.target.closest('[data-del-attr-line]');
            if (delBtn) {
                const idx = parseInt(delBtn.dataset.delAttrLine);
                editAttributeLines.splice(idx, 1);
                renderAttributeLines();
            }
        });
        $('#btnRegenVariants')?.addEventListener('click', () => {
            if (!editAttributeLines.length) {
                showToast('Chưa có thuộc tính — không có gì để tạo biến thể', 'info');
                return;
            }
            if (editVariants.length && !confirm('Tạo lại biến thể sẽ giữ lại các biến thể khớp thuộc tính + tạo biến thể mới. Tiếp tục?')) return;
            regenerateVariants();
            showToast(`Đã tạo ${editVariants.length} biến thể`, 'success');
        });

        // Combo toggle + delete
        $('#editIsCombo')?.addEventListener('change', () => renderComboItems());
        $('#comboItemsList')?.addEventListener('click', (e) => {
            const del = e.target.closest('[data-del-combo]');
            if (del) {
                editComboProducts.splice(parseInt(del.dataset.delCombo), 1);
                renderComboItems();
            }
        });
        $('#comboItemsList')?.addEventListener('change', (e) => {
            const qty = e.target.closest('[data-combo-qty]');
            const price = e.target.closest('[data-combo-price]');
            if (qty) editComboProducts[parseInt(qty.dataset.comboQty)].Quantity = parseInt(qty.value) || 1;
            if (price) editComboProducts[parseInt(price.dataset.comboPrice)].ProductPrice = parseFloat(price.value) || 0;
        });

        // UOM Lines add/delete
        $('#btnAddUOMLine')?.addEventListener('click', () => {
            const defaultUOM = (cachedUOMs || [])[0];
            editUOMLines.push({ UOMId: defaultUOM?.Id || 1, Name: defaultUOM?.Name || 'Cái', FactorInv: 1 });
            renderUOMLines();
        });
        $('#uomLinesTbody')?.addEventListener('click', (e) => {
            const del = e.target.closest('[data-del-uomline]');
            if (del) {
                editUOMLines.splice(parseInt(del.dataset.delUomline), 1);
                renderUOMLines();
            }
        });

        // Supplier delete
        $('#supplierTbody')?.addEventListener('click', (e) => {
            const del = e.target.closest('[data-del-sup]');
            if (del) {
                editSupplierInfos.splice(parseInt(del.dataset.delSup), 1);
                renderSuppliers();
            }
        });

        // Audit log load
        $('#btnLoadAuditLog')?.addEventListener('click', () => {
            const id = parseInt($('#editProductId').value);
            if (id) loadAuditLog(id);
        });

        // Stock adjust
        $('#productTableBody')?.addEventListener('click', (e) => {
            const stockBtn = e.target.closest('.btn-action-stock');
            if (stockBtn) {
                e.stopPropagation();
                const row = stockBtn.closest('tr[data-template-id]');
                if (row) openStockAdjust(parseInt(row.dataset.templateId, 10));
            }
        });
        $('#closeStockAdjust')?.addEventListener('click', closeStockAdjust);
        $('#cancelStockAdjust')?.addEventListener('click', closeStockAdjust);
        $('#confirmStockAdjust')?.addEventListener('click', confirmStockAdjust);
        $('#stockAdjustModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeStockAdjust();
        });

        // Bulk actions
        $('#btnBulkActions')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleBulkMenu();
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.bulk-actions-wrap')) toggleBulkMenu(false);
        });
        $('#bulkActionsMenu')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.bulk-action-item');
            if (btn) handleBulkAction(btn.dataset.action);
        });
        $('#closeBulkTag')?.addEventListener('click', closeBulkTagModal);
        $('#cancelBulkTag')?.addEventListener('click', closeBulkTagModal);
        $('#confirmBulkTag')?.addEventListener('click', confirmBulkTag);
        $('#bulkTagModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeBulkTagModal();
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
    let cachedTags = null; // TPOS Tag list (for filter dropdown)
    let editImageBase64 = null; // new image selected by user
    let modalMode = 'edit'; // 'edit' | 'create'

    /**
     * Fetch full product detail from TPOS (needed for UpdateV2)
     */
    async function fetchProductDetail(templateId) {
        // Full expand: variants/attrs/combo/UOM-lines/suppliers for Phase 2+3 edit sections.
        const expand = encodeURIComponent(
            'UOM,UOMCateg,Categ,UOMPO,POSCateg,ProductVariants($expand=AttributeValues),AttributeLines($expand=Attribute,Values),UOMLines($expand=UOM),ComboProducts,ProductSupplierInfos($expand=Partner)'
        );
        const url = `${PROXY_URL}/api/odata/ProductTemplate(${templateId})?$expand=${expand}`;
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
            modalMode = 'edit';

            // Restore heading + save button for edit mode
            const heading = $('#editProductModal h3');
            if (heading) heading.innerHTML = '<i data-lucide="pencil"></i> Chỉnh sửa sản phẩm';
            const saveBtn = $('#saveEditProduct');
            if (saveBtn) saveBtn.innerHTML = '<i data-lucide="check"></i> Lưu lên TPOS';

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

            // Populate Phase 2/3 sections
            await populateAdvancedSections(detail);

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
        modalMode = 'edit';
        resetAdvancedSections();
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
        if (modalMode === 'create') {
            return saveCreateProduct();
        }
        if (!editingProduct) return;
        const saveBtn = $('#saveEditProduct');
        if (saveBtn?.disabled) return; // re-entrancy guard (double-click)
        if (saveBtn) saveBtn.disabled = true;

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

        // Merge Phase 2/3 advanced sections (variants, attrs, combo, uom-lines, supplier, tags)
        mergeAdvancedIntoPayload(payload);

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
        } finally {
            const saveBtn = $('#saveEditProduct');
            if (saveBtn) saveBtn.disabled = false;
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
        const selected = pageProducts.filter(p => selectedIds.has(p.id));
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
    // CREATE PRODUCT — reuse edit modal in 'create' mode
    // =====================================================
    async function openCreateProduct() {
        try {
            showToast('Đang chuẩn bị form...', 'info');
            await ensureDropdownData();
            modalMode = 'create';
            editingProduct = null;
            editImageBase64 = null;

            const heading = $('#editProductModal h3');
            if (heading) heading.innerHTML = '<i data-lucide="plus"></i> Thêm sản phẩm mới';
            const saveBtn = $('#saveEditProduct');
            if (saveBtn) saveBtn.innerHTML = '<i data-lucide="plus"></i> Tạo sản phẩm';

            // Reset fields
            $('#editProductId').value = '';
            $('#editProductName').value = '';
            $('#editProductCode').value = '';
            $('#editBarcode').value = '';
            $('#editListPrice').value = 0;
            $('#editPurchasePrice').value = 0;
            $('#editDiscountSale').value = 0;
            $('#editDiscountPurchase').value = 0;
            $('#editWeight').value = 0;
            $('#editTracking').value = 'none';
            $('#editActive').checked = true;
            $('#editSaleOK').checked = true;
            $('#editPurchaseOK').checked = true;
            $('#editAvailableInPOS').checked = true;
            $('#editInvoicePolicy').value = 'order';
            $('#editPurchaseMethod').value = 'receive';
            $('#editDescriptionSale').value = '';
            $('#editDescriptionPurchase').value = '';
            $('#editDescription').value = '';

            populateSelect('#editCategId', cachedCategories, 'Id', 'CompleteName', null);
            populateSelect('#editPOSCategId', cachedPOSCategories, 'Id', 'Name', null);
            populateSelect('#editUOMId', cachedUOMs, 'Id', 'Name', 1);
            populateSelect('#editUOMPOId', cachedUOMs, 'Id', 'Name', 1);

            const imgPreview = $('#editImagePreview');
            if (imgPreview) imgPreview.innerHTML = '<span style="color:#9ca3af;font-size:11px;">No image</span>';

            // Reset advanced sections + render empty tag picker
            resetAdvancedSections();
            await renderTagsPicker([]);
            bindTagsPickerEvents();
            bindComboSearchEvents();
            bindSupplierEvents();
            bindUOMLinesEvents();
            bindVariantsTableEvents();

            $('#editProductModal').classList.add('show');
            WS.initIcons();
        } catch (err) {
            console.error('[Create] Prepare form failed:', err);
            showToast('Lỗi mở form: ' + err.message, 'error');
        }
    }

    function _uomPayload(u) {
        if (!u?.Id) return null;
        return {
            Id: u.Id, Name: u.Name, NameNoSign: null,
            Rounding: u.Rounding ?? 0.001, Active: true,
            Factor: u.Factor ?? 1, FactorInv: u.FactorInv ?? 1,
            UOMType: u.UOMType || 'reference',
            CategoryId: u.CategoryId ?? 1, CategoryName: u.CategoryName || 'Đơn vị'
        };
    }

    /**
     * Build TPOS ProductTemplate InsertV2 payload from a simple product spec.
     * Payload shape mirrors TPOS tpos-product-creator.js (verified against production).
     */
    function _buildInsertPayload(spec) {
        const categ = cachedCategories?.find(c => c.Id == spec.categId) || null;
        const uom = cachedUOMs?.find(u => u.Id == spec.uomId) || null;
        const uomPO = cachedUOMs?.find(u => u.Id == spec.uomPOId) || uom;

        return {
            Id: 0,
            Name: spec.name,
            NameNoSign: null,
            Description: spec.description || null,
            Type: 'product',
            ShowType: 'Có thể lưu trữ',
            ListPrice: spec.listPrice ?? 0,
            DiscountSale: spec.discountSale ?? 0,
            DiscountPurchase: spec.discountPurchase ?? 0,
            PurchasePrice: spec.purchasePrice ?? 0,
            StandardPrice: spec.standardPrice ?? spec.purchasePrice ?? 0,
            SaleOK: spec.saleOK !== false,
            PurchaseOK: spec.purchaseOK !== false,
            Active: spec.active !== false,
            UOMId: uom?.Id || 1,
            UOMPOId: uomPO?.Id || uom?.Id || 1,
            UOSId: null,
            IsProductVariant: false,
            EAN13: null,
            DefaultCode: spec.code,
            QtyAvailable: 0,
            VirtualAvailable: 0,
            OutgoingQty: 0,
            IncomingQty: 0,
            PropertyCostMethod: null,
            CategId: categ?.Id || null,
            CategCompleteName: categ?.CompleteName || null,
            CategName: categ?.Name || null,
            Weight: spec.weight ?? 0,
            Tracking: spec.tracking || 'none',
            DescriptionPurchase: spec.descriptionPurchase || null,
            DescriptionSale: spec.descriptionSale || null,
            CompanyId: 1,
            NameGet: null,
            PropertyStockProductionId: null,
            SaleDelay: 0,
            InvoicePolicy: spec.invoicePolicy || 'order',
            PurchaseMethod: spec.purchaseMethod || 'receive',
            PropertyValuation: null, Valuation: null,
            AvailableInPOS: spec.availableInPOS !== false,
            POSCategId: spec.posCategId || null,
            CostMethod: null,
            Barcode: spec.barcode || spec.code,
            Image: spec.imageBase64 || null,
            ImageUrl: null,
            Thumbnails: [],
            ProductVariantCount: 0,
            LastUpdated: null,
            UOMCategId: null, BOMCount: 0, Volume: null,
            CategNameNoSign: null, UOMNameNoSign: null, UOMPONameNoSign: null,
            IsCombo: false, EnableAll: false, ComboPurchased: null,
            TaxAmount: null, Version: 0,
            VariantFirstId: null, VariantFistId: null,
            ZaloProductId: null,
            CompanyName: null, CompanyNameNoSign: null,
            DateCreated: null, InitInventory: 0,
            UOMViewId: null, ImporterId: null, ProducerId: null,
            DistributorId: null, OriginCountryId: null,
            Tags: null, CreatedByName: null, OrderTag: null,
            StringExtraProperties: null, CreatedById: null, Error: null,
            UOM: _uomPayload(uom),
            UOMPO: _uomPayload(uomPO),
            Categ: categ ? {
                Id: categ.Id, Name: categ.Name,
                CompleteName: categ.CompleteName,
                Type: categ.Type || 'normal',
                IsPos: categ.IsPos !== false,
            } : null,
            AttributeLines: [],
            ProductVariants: [],
            UOMLines: [],
            ComboProducts: [],
            ProductSupplierInfos: [],
            Items: [],
        };
    }

    /**
     * POST InsertV2 with retry on 429 (rate limit).
     * Returns full TPOS response (includes new Id, ProductVariants, etc.)
     */
    async function _insertProductTPOS(payload, retries = 2) {
        const url = `${PROXY_URL}/api/odata/ProductTemplate/ODataService.InsertV2?$expand=ProductVariants,UOM,UOMPO`;
        for (let attempt = 0; attempt <= retries; attempt++) {
            const response = await window.tokenManager.authenticatedFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (response.ok) return response.json();
            if (response.status === 429 && attempt < retries) {
                await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                continue;
            }
            const errData = await response.json().catch(() => ({}));
            const msg = errData.error?.message || errData.message || `HTTP ${response.status}`;
            const e = new Error(msg);
            e.status = response.status;
            throw e;
        }
        // Safety net: all retries exhausted on 429 without returning (should be unreachable).
        throw new Error('Max retries exceeded (rate limited)');
    }

    async function saveCreateProduct() {
        const name = $('#editProductName').value.trim();
        const code = $('#editProductCode').value.trim();
        if (!name) { showToast('Tên SP bắt buộc', 'error'); return; }
        if (!code) { showToast('Mã SP bắt buộc', 'error'); return; }
        if (!$('#editCategId').value) { showToast('Chọn Nhóm SP', 'error'); return; }

        const spec = {
            name, code,
            barcode: $('#editBarcode').value.trim(),
            listPrice: parseFloat($('#editListPrice').value) || 0,
            purchasePrice: parseFloat($('#editPurchasePrice').value) || 0,
            standardPrice: parseFloat($('#editPurchasePrice').value) || 0,
            discountSale: parseFloat($('#editDiscountSale').value) || 0,
            discountPurchase: parseFloat($('#editDiscountPurchase').value) || 0,
            categId: parseInt($('#editCategId').value),
            posCategId: $('#editPOSCategId').value ? parseInt($('#editPOSCategId').value) : null,
            uomId: parseInt($('#editUOMId').value) || 1,
            uomPOId: parseInt($('#editUOMPOId').value) || 1,
            weight: parseFloat($('#editWeight').value) || 0,
            tracking: $('#editTracking').value,
            active: $('#editActive').checked,
            saleOK: $('#editSaleOK').checked,
            purchaseOK: $('#editPurchaseOK').checked,
            availableInPOS: $('#editAvailableInPOS').checked,
            invoicePolicy: $('#editInvoicePolicy').value,
            purchaseMethod: $('#editPurchaseMethod').value,
            descriptionSale: $('#editDescriptionSale').value.trim() || null,
            descriptionPurchase: $('#editDescriptionPurchase').value.trim() || null,
            description: $('#editDescription').value.trim() || null,
            imageBase64: editImageBase64,
        };

        const saveBtn = $('#saveEditProduct');
        if (saveBtn?.disabled) return; // re-entrancy guard
        if (saveBtn) saveBtn.disabled = true;

        try {
            showToast('Đang tạo SP...', 'info');
            const payload = _buildInsertPayload(spec);
            // Merge Phase 2/3 sections if user configured them in the modal
            mergeAdvancedIntoPayload(payload);
            const data = await _insertProductTPOS(payload);
            showToast(`Đã tạo SP #${data.Id} (${data.DefaultCode}). Đang đồng bộ...`, 'success');
            closeEditModal();

            // Kick incremental sync + delayed refresh
            fetch(`${RENDER_API}/sync?type=incremental`, { method: 'POST' }).catch(()=>{});
            setTimeout(() => fetchProducts(true), 5000);
        } catch (err) {
            console.error('[Create] InsertV2 failed:', err);
            const hint = err.status === 400 ? ' (mã SP có thể đã tồn tại)' : '';
            showToast('Lỗi tạo SP: ' + err.message + hint, 'error');
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    // =====================================================
    // TAG COLUMN + FILTER (limited: tags aren't in Render schema yet)
    // =====================================================
    async function ensureTagList() {
        if (cachedTags) return cachedTags;
        try {
            // TPOS Tag entity filterable by Type='ProductTemplate' (observed in other ERP deployments).
            // Fallback: fetch all tags if filter unsupported.
            let url = `${PROXY_URL}/api/odata/Tag?$filter=Type eq 'ProductTemplate'&$orderby=Name asc&$top=500`;
            let r = await window.tokenManager.authenticatedFetch(url, { headers: { 'Accept': 'application/json' } });
            if (!r.ok) {
                url = `${PROXY_URL}/api/odata/Tag?$orderby=Name asc&$top=500`;
                r = await window.tokenManager.authenticatedFetch(url, { headers: { 'Accept': 'application/json' } });
            }
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            cachedTags = data.value || [];
            return cachedTags;
        } catch (err) {
            console.warn('[Tag] Load failed:', err.message);
            // Don't cache [] — allow retry on next call.
            return [];
        }
    }

    async function populateTagFilter() {
        const sel = $('#filterTag');
        if (!sel) return;
        const tags = await ensureTagList();
        sel.innerHTML = '<option value="all">Tất cả</option>' +
            tags.map(t => `<option value="${t.Id}">${escapeHtml(t.Name || '')}</option>`).join('');
        if (!tags.length) {
            const opt = sel.querySelector('option[value="all"]');
            if (opt) opt.textContent = 'Tất cả (chưa load được)';
        }
    }

    /**
     * Server-side filter by tag: resolve tag → list of template IDs via TPOS, then pass to Render `ids=` param.
     * This is a best-effort until Render schema includes tags (Phase 2).
     */
    async function resolveTagTemplateIds(tagId) {
        if (!tagId || tagId === 'all') return null;
        try {
            const url = `${PROXY_URL}/api/odata/ProductTemplate?$filter=Tags/any(t: t/Id eq ${tagId})&$top=2000&$select=Id`;
            const r = await window.tokenManager.authenticatedFetch(url, { headers: { 'Accept': 'application/json' } });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            return (data.value || []).map(t => t.Id);
        } catch (err) {
            console.warn('[Tag Filter] Resolve failed:', err.message);
            showToast('Lỗi filter nhãn: ' + err.message, 'error');
            return null;
        }
    }

    // =====================================================
    // EXCEL EXPORT (SheetJS)
    // =====================================================
    async function ensureSheetJS() {
        if (window.XLSX) return window.XLSX;
        // CDN is in HTML with defer; wait for it (<=5s)
        for (let i = 0; i < 50; i++) {
            if (window.XLSX) return window.XLSX;
            await new Promise(r => setTimeout(r, 100));
        }
        throw new Error('SheetJS chưa load được');
    }

    async function exportToExcel() {
        try {
            showToast('Đang chuẩn bị xuất Excel...', 'info');
            const XLSX = await ensureSheetJS();

            // Reuse buildRenderParams so the export respects ALL filters (including Tag → template_ids).
            const params = await buildRenderParams();
            params.set('page', '1');
            params.set('limit', String(Math.min(totalCount || pageSize, 5000)));

            const resp = await fetch(`${RENDER_API}?${params.toString()}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();
            const rows = (json.data || []).map(r => ({
                'Mã': r.product_code || '',
                'Tên': r.product_name || r.name_get || '',
                'Nhóm SP': r.category || '',
                'Giá bán': r.selling_price || 0,
                'Giá mua': r.purchase_price || 0,
                'Giá vốn': r.standard_price || 0,
                'Số lượng thực tế': r.tpos_qty_available ?? r.quantity ?? 0,
                'Đơn vị': r.uom_name || '',
                'Biến thể': r.variant || '',
                'Barcode': r.barcode || '',
                'Hiệu lực': r.active === false ? 'Không' : 'Có',
                'Ngày tạo': r.created_at ? new Date(r.created_at).toLocaleDateString('vi-VN') : '',
                'TPOS Template ID': r.tpos_template_id || '',
            }));

            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Sản phẩm');

            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const fname = `san-pham-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;
            XLSX.writeFile(wb, fname);
            showToast(`Đã xuất ${rows.length} SP → ${fname}`, 'success');
        } catch (err) {
            console.error('[Export] Failed:', err);
            showToast('Lỗi xuất Excel: ' + err.message, 'error');
        }
    }

    // =====================================================
    // EXCEL IMPORT (batch InsertV2 with preview)
    // =====================================================
    const IMPORT_COLS = [
        { key: 'Mã', required: true, alias: ['ma', 'code', 'default_code'] },
        { key: 'Tên', required: true, alias: ['ten', 'name', 'product_name'] },
        { key: 'Giá bán', required: true, alias: ['gia_ban', 'list_price', 'selling_price'] },
        { key: 'Giá mua', required: false, alias: ['gia_mua', 'purchase_price'] },
        { key: 'Giá vốn', required: false, alias: ['gia_von', 'standard_price'] },
        { key: 'Nhóm SP', required: true, alias: ['nhom_sp', 'category'] },
        { key: 'Đơn vị', required: true, alias: ['don_vi', 'uom'] },
        { key: 'Barcode', required: false, alias: ['barcode', 'ma_vach'] },
    ];

    let importRows = []; // parsed rows with validation info

    function _normKey(s) {
        return String(s || '').trim().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '_');
    }

    function _findKey(row, target) {
        const normTarget = _normKey(target.key);
        const aliases = [normTarget, ...target.alias];
        for (const k of Object.keys(row)) {
            if (aliases.includes(_normKey(k))) return k;
        }
        return null;
    }

    function _validateImportRow(raw, idx, categMap, uomMap, existingCodes) {
        const row = { _idx: idx + 2 }; // +2: 1-indexed + header row
        const errors = [];
        for (const col of IMPORT_COLS) {
            const key = _findKey(raw, col);
            const val = key ? raw[key] : '';
            row[col.key] = val === undefined || val === null ? '' : String(val).trim();
            if (col.required && !row[col.key]) errors.push(`Thiếu "${col.key}"`);
        }
        // Check duplicate code
        if (row['Mã'] && existingCodes.has(String(row['Mã']).trim().toUpperCase())) {
            errors.push(`Mã "${row['Mã']}" đã tồn tại`);
        }
        // Validate prices — supports EN (1,000.50) and VI (1.000,50) formats.
        // Strategy: detect decimal separator by position (last separator in number with ≤2 trailing digits).
        for (const p of ['Giá bán', 'Giá mua', 'Giá vốn']) {
            if (row[p] !== '' && row[p] !== null && row[p] !== undefined) {
                const raw = String(row[p]).trim();
                // If already a number from sheetjs, parseFloat handles it.
                let s = raw;
                if (/[.,]/.test(s)) {
                    const lastComma = s.lastIndexOf(',');
                    const lastDot = s.lastIndexOf('.');
                    const decSep = lastComma > lastDot ? ',' : '.';
                    const thouSep = decSep === ',' ? '.' : ',';
                    s = s.split(thouSep).join('');        // strip thousands
                    if (decSep === ',') s = s.replace(',', '.');
                }
                const n = parseFloat(s);
                if (isNaN(n) || n < 0) errors.push(`${p} không hợp lệ`);
                else row[`_${p}`] = n;
            } else {
                row[`_${p}`] = 0;
            }
        }
        // Resolve Nhóm SP & Đơn vị
        if (row['Nhóm SP']) {
            const c = categMap.get(row['Nhóm SP'].toLowerCase()) || categMap.get(row['Nhóm SP'].toLowerCase().trim());
            if (c) row._categId = c.Id;
            else errors.push(`Nhóm SP "${row['Nhóm SP']}" không tồn tại`);
        }
        if (row['Đơn vị']) {
            const u = uomMap.get(row['Đơn vị'].toLowerCase());
            if (u) row._uomId = u.Id;
            else errors.push(`Đơn vị "${row['Đơn vị']}" không tồn tại`);
        }
        row._errors = errors;
        row._valid = errors.length === 0;
        return row;
    }

    async function openImportExcel() {
        try {
            showToast('Đang tải danh mục...', 'info');
            await ensureDropdownData();
            await ensureSheetJS();
            importRows = [];
            $('#importStepPick').style.display = 'block';
            $('#importStepPreview').style.display = 'none';
            $('#importStepProgress').style.display = 'none';
            $('#confirmImportExcel').style.display = 'none';
            $('#importExcelFile').value = '';
            $('#importExcelModal').classList.add('show');
            WS.initIcons();
        } catch (err) {
            showToast('Lỗi mở import: ' + err.message, 'error');
        }
    }

    function closeImportExcel() {
        $('#importExcelModal')?.classList.remove('show');
        importRows = [];
    }

    async function handleImportFile(file) {
        try {
            const XLSX = await ensureSheetJS();
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
            if (!raw.length) {
                showToast('File trống', 'error');
                return;
            }

            // Build category + uom lookup (by CompleteName or Name, lowercased)
            if (!cachedCategories || !cachedUOMs) {
                showToast('Danh mục chưa load — thử lại sau khi đóng modal', 'error');
                return;
            }
            const categMap = new Map();
            cachedCategories.forEach(c => {
                categMap.set((c.CompleteName || '').toLowerCase(), c);
                categMap.set((c.Name || '').toLowerCase(), c);
            });
            const uomMap = new Map();
            cachedUOMs.forEach(u => uomMap.set((u.Name || '').toLowerCase(), u));

            // Existing codes from Render (approximate — use /search or full fetch)
            const existingCodes = new Set();
            try {
                const r = await fetch(`${RENDER_API}?page=1&limit=5000&fields=product_code`);
                if (r.ok) {
                    const j = await r.json();
                    (j.data || []).forEach(p => existingCodes.add(String(p.product_code || '').trim().toUpperCase()));
                }
            } catch (err) { console.warn('[Import] Existing codes fetch failed:', err.message); }

            importRows = raw.map((r, i) => _validateImportRow(r, i, categMap, uomMap, existingCodes));
            renderImportPreview();
        } catch (err) {
            console.error('[Import] Parse failed:', err);
            showToast('Lỗi đọc file: ' + err.message, 'error');
        }
    }

    function renderImportPreview() {
        const total = importRows.length;
        const valid = importRows.filter(r => r._valid).length;
        const errors = total - valid;
        $('#importTotalRows').textContent = total;
        $('#importValidRows').textContent = valid;
        $('#importErrorRows').textContent = errors;
        $('#importValidRowsBtn').textContent = valid;

        const thead = $('#importPreviewTable thead');
        const tbody = $('#importPreviewTable tbody');
        const cols = ['Dòng', ...IMPORT_COLS.map(c => c.key), 'Lỗi'];
        thead.innerHTML = `<tr>${cols.map(c => `<th style="padding:6px;border:1px solid #e5e7eb;text-align:left;">${c}</th>`).join('')}</tr>`;
        tbody.innerHTML = importRows.slice(0, 200).map(r => {
            const err = r._errors.join('; ');
            return `<tr style="${r._valid ? '' : 'background:#fee2e2;'}">
                <td style="padding:4px 6px;border:1px solid #e5e7eb;">${r._idx}</td>
                ${IMPORT_COLS.map(c => `<td style="padding:4px 6px;border:1px solid #e5e7eb;">${escapeHtml(r[c.key] || '')}</td>`).join('')}
                <td style="padding:4px 6px;border:1px solid #e5e7eb;color:#dc2626;">${escapeHtml(err)}</td>
            </tr>`;
        }).join('');

        $('#importStepPick').style.display = 'none';
        $('#importStepPreview').style.display = 'block';
        $('#confirmImportExcel').style.display = valid > 0 ? '' : 'none';
    }

    async function confirmImport() {
        const rows = importRows.filter(r => r._valid);
        if (!rows.length) return;
        $('#importStepPreview').style.display = 'none';
        $('#importStepProgress').style.display = 'block';
        $('#confirmImportExcel').style.display = 'none';

        const errorsDiv = $('#importProgressErrors');
        errorsDiv.innerHTML = '';
        let done = 0, ok = 0, failed = 0;

        // Concurrency 3 with rate limit
        const queue = rows.slice();
        const workers = Array.from({ length: 3 }, async () => {
            while (queue.length) {
                const row = queue.shift();
                try {
                    const payload = _buildInsertPayload({
                        name: row['Tên'],
                        code: row['Mã'],
                        barcode: row['Barcode'] || row['Mã'],
                        listPrice: row['_Giá bán'] || 0,
                        purchasePrice: row['_Giá mua'] || 0,
                        standardPrice: row['_Giá vốn'] || row['_Giá mua'] || 0,
                        categId: row._categId,
                        uomId: row._uomId,
                        uomPOId: row._uomId,
                    });
                    await _insertProductTPOS(payload);
                    ok++;
                } catch (err) {
                    failed++;
                    errorsDiv.insertAdjacentHTML('beforeend',
                        `<div style="color:#dc2626;">Dòng ${row._idx} (${escapeHtml(row['Mã'])}): ${escapeHtml(err.message)}</div>`);
                }
                done++;
                const pct = Math.round(done / rows.length * 100);
                $('#importProgressBar').style.width = pct + '%';
                $('#importProgressText').textContent = `${done} / ${rows.length} (OK: ${ok}, Lỗi: ${failed})`;
                await new Promise(r => setTimeout(r, 200)); // rate limit
            }
        });
        await Promise.all(workers);

        showToast(`Hoàn tất: ${ok} thành công, ${failed} lỗi`, ok > 0 ? 'success' : 'error');
        fetch(`${RENDER_API}/sync?type=incremental`, { method: 'POST' }).catch(()=>{});
        setTimeout(() => {
            closeImportExcel();
            fetchProducts(true);
        }, 3000);
    }

    function downloadImportTemplate() {
        ensureSheetJS().then(XLSX => {
            const sample = [{
                'Mã': 'SP001',
                'Tên': 'Áo thun trắng',
                'Giá bán': 150000,
                'Giá mua': 80000,
                'Giá vốn': 80000,
                'Nhóm SP': 'Có thể bán',
                'Đơn vị': 'Cái',
                'Barcode': 'SP001',
            }];
            const ws = XLSX.utils.json_to_sheet(sample);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Mẫu');
            XLSX.writeFile(wb, 'mau-nhap-san-pham.xlsx');
        }).catch(err => showToast('Lỗi tạo mẫu: ' + err.message, 'error'));
    }

    // =====================================================
    // BULK PRICE UPDATE (XLSX → UpdateV2 batch)
    // =====================================================
    let bulkPriceRows = [];

    async function openBulkPrice() {
        await ensureSheetJS();
        bulkPriceRows = [];
        $('#bulkPriceStepPick').style.display = 'block';
        $('#bulkPriceStepPreview').style.display = 'none';
        $('#bulkPriceStepProgress').style.display = 'none';
        $('#confirmBulkPrice').style.display = 'none';
        $('#bulkPriceFile').value = '';
        $('#bulkPriceModal').classList.add('show');
        WS.initIcons();
    }

    function closeBulkPrice() {
        $('#bulkPriceModal')?.classList.remove('show');
        bulkPriceRows = [];
    }

    async function handleBulkPriceFile(file) {
        try {
            const XLSX = await ensureSheetJS();
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
            if (!raw.length) { showToast('File trống', 'error'); return; }

            // Look up each code in Render
            showToast('Đang tra cứu SP...', 'info');
            const rows = [];
            for (let i = 0; i < raw.length; i++) {
                const r = raw[i];
                const codeKey = Object.keys(r).find(k => _normKey(k) === 'ma' || _normKey(k) === 'code' || _normKey(k) === 'default_code');
                const code = codeKey ? String(r[codeKey] || '').trim() : '';
                if (!code) {
                    rows.push({ _idx: i+2, code: '', error: 'Thiếu mã' });
                    continue;
                }
                const findNumKey = (...targets) => {
                    for (const t of targets) {
                        const k = Object.keys(r).find(kk => _normKey(kk) === _normKey(t));
                        if (k && r[k] !== '') return parseFloat(String(r[k]).replace(',', '.'));
                    }
                    return null;
                };
                const newList = findNumKey('Giá bán', 'gia_ban', 'list_price');
                const newPurchase = findNumKey('Giá mua', 'gia_mua', 'purchase_price');
                const newStandard = findNumKey('Giá vốn', 'gia_von', 'standard_price');

                // Find product via search
                let product = null;
                try {
                    const sr = await fetch(`${RENDER_API}/search?q=${encodeURIComponent(code)}&limit=5`);
                    if (sr.ok) {
                        const sj = await sr.json();
                        const list = sj.data || sj || [];
                        product = list.find(p => String(p.product_code).trim().toUpperCase() === code.toUpperCase())
                            || list.find(p => String(p.parent_product_code || '').trim().toUpperCase() === code.toUpperCase());
                    }
                } catch {}

                if (!product) {
                    rows.push({ _idx: i+2, code, error: 'Không tìm thấy SP' });
                    continue;
                }

                const oldList = product.selling_price;
                const oldPurchase = product.purchase_price;
                const oldStandard = product.standard_price;
                const changed =
                    (newList !== null && newList !== oldList) ||
                    (newPurchase !== null && newPurchase !== oldPurchase) ||
                    (newStandard !== null && newStandard !== oldStandard);

                rows.push({
                    _idx: i+2, code,
                    templateId: product.tpos_template_id,
                    name: product.product_name || product.name_get || '',
                    oldList, oldPurchase, oldStandard,
                    newList, newPurchase, newStandard,
                    changed, error: null,
                });
            }
            bulkPriceRows = rows;
            renderBulkPricePreview();
        } catch (err) {
            console.error('[BulkPrice] Parse failed:', err);
            showToast('Lỗi đọc file: ' + err.message, 'error');
        }
    }

    function renderBulkPricePreview() {
        const total = bulkPriceRows.length;
        const changed = bulkPriceRows.filter(r => r.changed && !r.error).length;
        const unchanged = bulkPriceRows.filter(r => !r.changed && !r.error).length;
        const missing = bulkPriceRows.filter(r => r.error).length;
        $('#bulkPriceTotal').textContent = total;
        $('#bulkPriceChanged').textContent = changed;
        $('#bulkPriceUnchanged').textContent = unchanged;
        $('#bulkPriceMissing').textContent = missing;
        $('#bulkPriceChangedBtn').textContent = changed;

        const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('vi-VN').format(n);
        const diff = (o, n) => {
            if (n == null) return fmt(o);
            if (o === n) return fmt(o);
            const color = n > o ? '#059669' : '#dc2626';
            return `<span style="text-decoration:line-through;color:#9ca3af;">${fmt(o)}</span> → <strong style="color:${color};">${fmt(n)}</strong>`;
        };

        const thead = $('#bulkPricePreviewTable thead');
        const tbody = $('#bulkPricePreviewTable tbody');
        thead.innerHTML = `<tr>
            <th style="padding:6px;border:1px solid #e5e7eb;">Dòng</th>
            <th style="padding:6px;border:1px solid #e5e7eb;">Mã</th>
            <th style="padding:6px;border:1px solid #e5e7eb;">Tên</th>
            <th style="padding:6px;border:1px solid #e5e7eb;">Giá bán</th>
            <th style="padding:6px;border:1px solid #e5e7eb;">Giá mua</th>
            <th style="padding:6px;border:1px solid #e5e7eb;">Giá vốn</th>
            <th style="padding:6px;border:1px solid #e5e7eb;">Ghi chú</th>
        </tr>`;
        tbody.innerHTML = bulkPriceRows.slice(0, 500).map(r => {
            if (r.error) {
                return `<tr style="background:#fee2e2;">
                    <td style="padding:4px 6px;border:1px solid #e5e7eb;">${r._idx}</td>
                    <td style="padding:4px 6px;border:1px solid #e5e7eb;">${escapeHtml(r.code)}</td>
                    <td colspan="5" style="padding:4px 6px;border:1px solid #e5e7eb;color:#dc2626;">${escapeHtml(r.error)}</td>
                </tr>`;
            }
            return `<tr style="${r.changed ? 'background:#f0fdf4;' : ''}">
                <td style="padding:4px 6px;border:1px solid #e5e7eb;">${r._idx}</td>
                <td style="padding:4px 6px;border:1px solid #e5e7eb;">${escapeHtml(r.code)}</td>
                <td style="padding:4px 6px;border:1px solid #e5e7eb;">${escapeHtml(r.name)}</td>
                <td style="padding:4px 6px;border:1px solid #e5e7eb;">${diff(r.oldList, r.newList)}</td>
                <td style="padding:4px 6px;border:1px solid #e5e7eb;">${diff(r.oldPurchase, r.newPurchase)}</td>
                <td style="padding:4px 6px;border:1px solid #e5e7eb;">${diff(r.oldStandard, r.newStandard)}</td>
                <td style="padding:4px 6px;border:1px solid #e5e7eb;color:#6b7280;">${r.changed ? 'Sẽ cập nhật' : 'Không đổi'}</td>
            </tr>`;
        }).join('');

        $('#bulkPriceStepPick').style.display = 'none';
        $('#bulkPriceStepPreview').style.display = 'block';
        $('#confirmBulkPrice').style.display = changed > 0 ? '' : 'none';
    }

    async function confirmBulkPrice() {
        const rows = bulkPriceRows.filter(r => r.changed && !r.error);
        if (!rows.length) return;
        $('#bulkPriceStepPreview').style.display = 'none';
        $('#bulkPriceStepProgress').style.display = 'block';
        $('#confirmBulkPrice').style.display = 'none';
        const errorsDiv = $('#bulkPriceProgressErrors');
        errorsDiv.innerHTML = '';

        let done = 0, ok = 0, failed = 0;
        const queue = rows.slice();
        const workers = Array.from({ length: 3 }, async () => {
            while (queue.length) {
                const row = queue.shift();
                try {
                    // Fetch current TPOS payload → patch prices → UpdateV2
                    const detail = await fetchProductDetail(row.templateId);
                    const payload = { ...detail };
                    delete payload['@odata.context'];
                    if (row.newList != null) payload.ListPrice = row.newList;
                    if (row.newPurchase != null) payload.PurchasePrice = row.newPurchase;
                    if (row.newStandard != null) payload.StandardPrice = row.newStandard;

                    const url = `${PROXY_URL}/api/odata/ProductTemplate/ODataService.UpdateV2`;
                    const r = await window.tokenManager.authenticatedFetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify(payload),
                    });
                    if (!r.ok) {
                        const e = await r.json().catch(() => ({}));
                        throw new Error(e.error?.message || `HTTP ${r.status}`);
                    }
                    ok++;
                } catch (err) {
                    failed++;
                    errorsDiv.insertAdjacentHTML('beforeend',
                        `<div style="color:#dc2626;">Dòng ${row._idx} (${escapeHtml(row.code)}): ${escapeHtml(err.message)}</div>`);
                }
                done++;
                const pct = Math.round(done / rows.length * 100);
                $('#bulkPriceProgressBar').style.width = pct + '%';
                $('#bulkPriceProgressText').textContent = `${done} / ${rows.length} (OK: ${ok}, Lỗi: ${failed})`;
                await new Promise(r => setTimeout(r, 250));
            }
        });
        await Promise.all(workers);

        showToast(`Hoàn tất: ${ok} cập nhật, ${failed} lỗi`, ok > 0 ? 'success' : 'error');
        fetch(`${RENDER_API}/sync?type=incremental`, { method: 'POST' }).catch(()=>{});
        setTimeout(() => {
            closeBulkPrice();
            fetchProducts(true);
        }, 3000);
    }

    // =====================================================
    // PHASE 2+3: ATTRIBUTES, VARIANTS, COMBO, UOM LINES, SUPPLIER, AUDIT LOG
    // =====================================================
    let cachedAttributes = null;        // ProductAttribute list (with Values)
    let editAttributeLines = [];        // [{AttributeId, Attribute, Values:[]}]
    let editVariants = [];              // working copy of ProductVariants (Id, DefaultCode, Barcode, PriceVariant, Active, AttributeValues)
    let editComboProducts = [];         // [{ProductId, ProductNameGet, Quantity, ProductPrice}]
    let editUOMLines = [];              // [{UOMId, FactorInv, Name}]
    let editSupplierInfos = [];         // [{PartnerId, PartnerName, ProductCode, Price, MinQty}]
    let editTagIds = new Set();         // Tag IDs selected for this product

    async function ensureAttributesList() {
        if (cachedAttributes) return cachedAttributes;
        try {
            const url = `${PROXY_URL}/api/odata/ProductAttribute?$expand=Values&$orderby=Id asc&$top=200`;
            const r = await window.tokenManager.authenticatedFetch(url, { headers: { 'Accept': 'application/json' } });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            cachedAttributes = data.value || [];
            return cachedAttributes;
        } catch (err) {
            console.warn('[Attr] Load failed:', err.message);
            // Don't cache [] — allow retry.
            return [];
        }
    }

    function renderAttributeLines() {
        const list = $('#attributeLinesList');
        if (!list) return;
        if (!editAttributeLines.length) {
            list.innerHTML = '<div style="color:#9ca3af;font-size:12px;">Chưa có thuộc tính — SP không biến thể.</div>';
            return;
        }
        list.innerHTML = editAttributeLines.map((line, idx) => {
            const attr = line.Attribute || {};
            const values = (line.Values || []).map(v => v.Name).join(', ');
            return `<div style="display:flex;align-items:center;gap:6px;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;background:#fff;">
                <strong style="min-width:80px;font-size:12px;">${escapeHtml(attr.Name || '?')}</strong>
                <span style="flex:1;font-size:11px;color:#6b7280;">${escapeHtml(values) || '(chưa chọn giá trị)'}</span>
                <button type="button" data-edit-attr-line="${idx}" style="padding:2px 6px;font-size:11px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;">Sửa</button>
                <button type="button" data-del-attr-line="${idx}" style="padding:2px 6px;font-size:11px;border:1px solid #fecaca;border-radius:4px;background:#fee2e2;color:#dc2626;cursor:pointer;">×</button>
            </div>`;
        }).join('');
    }

    async function promptAttributeLine(existingIdx = null) {
        await ensureAttributesList();
        if (!cachedAttributes.length) {
            showToast('Không load được danh sách thuộc tính', 'error');
            return;
        }
        // Build picker: select Attribute + check Values
        const existing = existingIdx !== null ? editAttributeLines[existingIdx] : null;

        const attrOpts = cachedAttributes.map(a =>
            `<option value="${a.Id}"${existing && existing.AttributeId === a.Id ? ' selected' : ''}>${escapeHtml(a.Name)}</option>`
        ).join('');

        const dlg = document.createElement('div');
        dlg.className = 'column-settings-modal show';
        dlg.style.zIndex = '10000';
        dlg.innerHTML = `
            <div class="column-settings-modal-content" style="max-width:480px;">
                <div class="column-settings-modal-header">
                    <h3>${existing ? 'Sửa' : 'Thêm'} thuộc tính</h3>
                    <button class="column-settings-modal-close" data-act="cancel">&times;</button>
                </div>
                <div class="column-settings-modal-body" style="padding:16px;">
                    <label class="edit-label">Thuộc tính</label>
                    <select id="_attrSel" class="edit-input" style="margin-bottom:12px;">${attrOpts}</select>
                    <label class="edit-label">Giá trị</label>
                    <div id="_attrValList" style="max-height:260px;overflow:auto;display:grid;gap:4px;padding:8px;border:1px solid #e5e7eb;border-radius:6px;"></div>
                </div>
                <div class="column-settings-modal-footer">
                    <button class="column-settings-btn column-settings-btn-cancel" data-act="cancel">Hủy</button>
                    <button class="column-settings-btn column-settings-btn-save" data-act="ok"><i data-lucide="check"></i> OK</button>
                </div>
            </div>`;
        document.body.appendChild(dlg);
        WS.initIcons();

        const renderValues = () => {
            const sel = dlg.querySelector('#_attrSel');
            const attr = cachedAttributes.find(a => a.Id == sel.value);
            const existingIds = new Set((existing?.Values || []).map(v => v.Id));
            const vals = (attr?.Values || []);
            dlg.querySelector('#_attrValList').innerHTML = vals.length
                ? vals.map(v => `<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;"><input type="checkbox" value="${v.Id}"${existingIds.has(v.Id) ? ' checked' : ''}> ${escapeHtml(v.Name)}</label>`).join('')
                : '<div style="color:#9ca3af;font-size:12px;">(Chưa có giá trị — tạo trên TPOS trước)</div>';
        };
        renderValues();
        dlg.querySelector('#_attrSel').addEventListener('change', renderValues);

        return new Promise(resolve => {
            dlg.addEventListener('click', (e) => {
                const act = e.target.closest('[data-act]')?.dataset.act;
                if (act === 'cancel') {
                    dlg.remove();
                    resolve(null);
                } else if (act === 'ok') {
                    const attrId = parseInt(dlg.querySelector('#_attrSel').value);
                    const attr = cachedAttributes.find(a => a.Id === attrId);
                    const checkedIds = Array.from(dlg.querySelectorAll('#_attrValList input:checked')).map(i => parseInt(i.value));
                    const values = (attr?.Values || []).filter(v => checkedIds.includes(v.Id));
                    if (!attr || !values.length) {
                        showToast('Chọn ít nhất 1 giá trị', 'error');
                        return;
                    }
                    const line = {
                        AttributeId: attr.Id,
                        Attribute: { Id: attr.Id, Name: attr.Name, Code: attr.Code || null, Sequence: null, CreateVariant: attr.CreateVariant !== false },
                        Values: values.map(v => ({
                            Id: v.Id, Name: v.Name, Code: v.Code || null,
                            Sequence: v.Sequence || null, AttributeId: attr.Id, AttributeName: attr.Name,
                            PriceExtra: v.PriceExtra || null, NameGet: v.Name, DateCreated: null,
                        })),
                    };
                    if (existingIdx !== null) editAttributeLines[existingIdx] = line;
                    else editAttributeLines.push(line);
                    renderAttributeLines();
                    dlg.remove();
                    resolve(line);
                }
            });
        });
    }

    /**
     * Generate cartesian product of AttributeLines.Values → create new variant rows.
     * Preserve existing variants (by matching AttributeValues signature) so edits aren't lost.
     */
    function regenerateVariants() {
        if (!editAttributeLines.length) {
            editVariants = [];
            renderVariantsTable();
            return;
        }
        // Cartesian product
        const combos = [[]];
        for (const line of editAttributeLines) {
            const next = [];
            for (const combo of combos) {
                for (const v of (line.Values || [])) {
                    next.push([...combo, v]);
                }
            }
            combos.length = 0;
            combos.push(...next);
        }

        // Build lookup of existing by signature
        const sig = (attrValues) => (attrValues || []).map(v => v.Id).sort((a,b)=>a-b).join('|');
        const existingBySig = new Map();
        for (const v of editVariants) {
            existingBySig.set(sig(v.AttributeValues || []), v);
        }

        const templateCode = $('#editProductCode')?.value?.trim() || 'SP';
        const listPrice = parseFloat($('#editListPrice')?.value) || 0;

        editVariants = combos.map((combo) => {
            const signature = sig(combo);
            const existing = existingBySig.get(signature);
            if (existing) return existing;
            // New variant
            const attrStr = combo.map(v => v.Name).join(', ');
            return {
                Id: 0,
                DefaultCode: `${templateCode}-${combo.map(v => v.Code || v.Name).join('-')}`.replace(/\s+/g, ''),
                Barcode: null,
                PriceVariant: listPrice,
                Active: true,
                AttributeValues: combo.map(v => ({
                    Id: v.Id, Name: v.Name, Code: v.Code || null,
                    Sequence: v.Sequence || null, AttributeId: v.AttributeId, AttributeName: v.AttributeName,
                    PriceExtra: v.PriceExtra || null, NameGet: v.Name, DateCreated: null,
                })),
                NameGet: `[${templateCode}] (${attrStr})`,
                ListPrice: listPrice, StandardPrice: 0,
                SaleOK: true, PurchaseOK: true, AvailableInPOS: true,
                Type: 'product', TaxesIds: [],
            };
        });
        renderVariantsTable();
    }

    function renderVariantsTable() {
        const tbody = $('#variantsTbody');
        if (!tbody) return;
        if (!editVariants.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding:10px;color:#9ca3af;text-align:center;">Chưa có biến thể</td></tr>';
            return;
        }
        tbody.innerHTML = editVariants.map((v, idx) => {
            const attrStr = (v.AttributeValues || []).map(a => a.Name).join(', ');
            return `<tr data-variant-idx="${idx}">
                <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;font-size:11px;">${escapeHtml(attrStr) || '—'}</td>
                <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;"><input type="text" class="variant-input" data-field="DefaultCode" value="${escapeHtml(v.DefaultCode || '')}" style="width:100%;padding:2px 4px;font-size:11px;border:1px solid #e5e7eb;border-radius:3px;"></td>
                <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;"><input type="text" class="variant-input" data-field="Barcode" value="${escapeHtml(v.Barcode || '')}" style="width:100%;padding:2px 4px;font-size:11px;border:1px solid #e5e7eb;border-radius:3px;"></td>
                <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;"><input type="number" class="variant-input" data-field="PriceVariant" value="${v.PriceVariant || 0}" min="0" style="width:100%;padding:2px 4px;font-size:11px;border:1px solid #e5e7eb;border-radius:3px;text-align:right;"></td>
                <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;text-align:center;"><input type="checkbox" class="variant-input" data-field="Active" ${v.Active !== false ? 'checked' : ''}></td>
            </tr>`;
        }).join('');
    }

    function bindVariantsTableEvents() {
        const tbody = $('#variantsTbody');
        if (!tbody || tbody._bound) return;
        tbody._bound = true;
        tbody.addEventListener('change', (e) => {
            const input = e.target.closest('.variant-input');
            if (!input) return;
            const row = input.closest('tr[data-variant-idx]');
            const idx = parseInt(row.dataset.variantIdx);
            const field = input.dataset.field;
            if (!editVariants[idx]) return;
            if (field === 'Active') editVariants[idx].Active = input.checked;
            else if (field === 'PriceVariant') editVariants[idx].PriceVariant = parseFloat(input.value) || 0;
            else editVariants[idx][field] = input.value.trim();
        });
    }

    // --------- Combo ---------
    function renderComboItems() {
        const wrap = $('#comboWrap');
        const list = $('#comboItemsList');
        if (!wrap || !list) return;
        wrap.style.display = $('#editIsCombo')?.checked ? 'block' : 'none';
        list.innerHTML = editComboProducts.length
            ? editComboProducts.map((it, idx) => `
                <div style="display:flex;align-items:center;gap:6px;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;">
                    <span style="flex:1;font-size:12px;">${escapeHtml(it.ProductNameGet || '?')}</span>
                    <input type="number" value="${it.Quantity || 1}" min="1" data-combo-qty="${idx}" style="width:60px;padding:2px 4px;font-size:11px;border:1px solid #e5e7eb;border-radius:3px;text-align:right;" title="Số lượng">
                    <input type="number" value="${it.ProductPrice || 0}" min="0" data-combo-price="${idx}" style="width:90px;padding:2px 4px;font-size:11px;border:1px solid #e5e7eb;border-radius:3px;text-align:right;" title="Đơn giá">
                    <button type="button" data-del-combo="${idx}" style="padding:2px 6px;font-size:11px;border:1px solid #fecaca;border-radius:4px;background:#fee2e2;color:#dc2626;cursor:pointer;">×</button>
                </div>`).join('')
            : '<div style="color:#9ca3af;font-size:12px;">Chưa có SP con.</div>';
    }

    async function searchComboProduct(query) {
        if (!query || query.length < 2) return [];
        try {
            const url = `${PROXY_URL}/api/odata/ProductTemplate/ODataService.GetViewV2?Active=true&$top=10&$filter=contains(NameGet,'${_odataStr(query)}') or contains(DefaultCode,'${_odataStr(query)}')`;
            const r = await window.tokenManager.authenticatedFetch(url, { headers: { 'Accept': 'application/json' } });
            if (!r.ok) return [];
            const data = await r.json();
            return data.value || [];
        } catch { return []; }
    }

    function bindComboSearchEvents() {
        const input = $('#comboSearchInput');
        const results = $('#comboSearchResults');
        if (!input || input._bound) return;
        input._bound = true;

        let timer = null;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(async () => {
                const q = input.value.trim();
                if (!q) { results.style.display = 'none'; return; }
                const list = await searchComboProduct(q);
                if (!list.length) {
                    results.innerHTML = '<div style="padding:8px;color:#9ca3af;">Không tìm thấy</div>';
                } else {
                    results.innerHTML = list.map(p => `<div data-combo-add="${p.Id}" style="padding:6px 10px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:12px;">[${escapeHtml(p.DefaultCode||'')}] ${escapeHtml(p.Name||'')} — ${formatPrice(p.ListPrice||0)}</div>`).join('');
                }
                // Position it
                const rect = input.getBoundingClientRect();
                results.style.width = rect.width + 'px';
                results.style.display = 'block';
                results.dataset.products = JSON.stringify(list);
            }, 300);
        });
        input.addEventListener('blur', () => setTimeout(() => { results.style.display = 'none'; }, 200));
        results.addEventListener('mousedown', (e) => {
            const el = e.target.closest('[data-combo-add]');
            if (!el) return;
            const pid = parseInt(el.dataset.comboAdd);
            let list = [];
            try { list = JSON.parse(results.dataset.products || '[]'); } catch { list = []; }
            const product = list.find(p => p.Id === pid);
            if (product && !editComboProducts.find(c => c.ProductId === pid)) {
                editComboProducts.push({
                    ProductId: product.Id,
                    ProductNameGet: product.NameGet || `[${product.DefaultCode}] ${product.Name}`,
                    Quantity: 1,
                    ProductPrice: product.ListPrice || 0,
                });
                renderComboItems();
            }
            input.value = '';
            results.style.display = 'none';
        });
    }

    // --------- UOM Lines ---------
    function renderUOMLines() {
        const tbody = $('#uomLinesTbody');
        if (!tbody) return;
        if (!editUOMLines.length) {
            tbody.innerHTML = '<tr><td colspan="3" style="padding:8px;color:#9ca3af;text-align:center;font-size:12px;">Chưa có ĐVT quy đổi</td></tr>';
            return;
        }
        tbody.innerHTML = editUOMLines.map((line, idx) => {
            const uomOpts = (cachedUOMs || []).map(u =>
                `<option value="${u.Id}"${u.Id == line.UOMId ? ' selected' : ''}>${escapeHtml(u.Name)}</option>`
            ).join('');
            return `
            <tr data-uomline-idx="${idx}">
                <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;">
                    <select class="uomline-input" data-field="UOMId" style="width:100%;padding:2px 4px;font-size:11px;">${uomOpts}</select>
                </td>
                <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;">
                    <input type="number" class="uomline-input" data-field="FactorInv" value="${line.FactorInv || 1}" min="0.001" step="0.001" style="width:100%;padding:2px 4px;font-size:11px;border:1px solid #e5e7eb;border-radius:3px;text-align:right;">
                </td>
                <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;text-align:center;">
                    <button type="button" data-del-uomline="${idx}" style="padding:2px 6px;font-size:11px;border:1px solid #fecaca;border-radius:4px;background:#fee2e2;color:#dc2626;cursor:pointer;">×</button>
                </td>
            </tr>`;
        }).join('');
    }

    function bindUOMLinesEvents() {
        const tbody = $('#uomLinesTbody');
        if (!tbody || tbody._bound) return;
        tbody._bound = true;
        tbody.addEventListener('change', (e) => {
            const input = e.target.closest('.uomline-input');
            if (!input) return;
            const row = input.closest('tr[data-uomline-idx]');
            const idx = parseInt(row.dataset.uomlineIdx);
            if (!editUOMLines[idx]) return;
            const field = input.dataset.field;
            if (field === 'UOMId') {
                const uomId = parseInt(input.value);
                const uom = (cachedUOMs || []).find(u => u.Id === uomId);
                editUOMLines[idx].UOMId = uomId;
                editUOMLines[idx].Name = uom?.Name || '';
            } else {
                editUOMLines[idx].FactorInv = parseFloat(input.value) || 1;
            }
        });
    }

    // --------- Supplier Infos ---------
    function renderSuppliers() {
        const tbody = $('#supplierTbody');
        if (!tbody) return;
        if (!editSupplierInfos.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding:8px;color:#9ca3af;text-align:center;font-size:12px;">Chưa có NCC</td></tr>';
            return;
        }
        tbody.innerHTML = editSupplierInfos.map((s, idx) => `
            <tr data-supplier-idx="${idx}">
                <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(s.PartnerName || s.Partner?.Name || '?')}</td>
                <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;"><input type="text" class="sup-input" data-field="ProductCode" value="${escapeHtml(s.ProductCode || '')}" style="width:100%;padding:2px 4px;font-size:11px;border:1px solid #e5e7eb;border-radius:3px;"></td>
                <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;"><input type="number" class="sup-input" data-field="Price" value="${s.Price || 0}" min="0" style="width:100%;padding:2px 4px;font-size:11px;border:1px solid #e5e7eb;border-radius:3px;text-align:right;"></td>
                <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;"><input type="number" class="sup-input" data-field="MinQty" value="${s.MinQty || 0}" min="0" style="width:100%;padding:2px 4px;font-size:11px;border:1px solid #e5e7eb;border-radius:3px;text-align:right;"></td>
                <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;text-align:center;"><button type="button" data-del-sup="${idx}" style="padding:2px 6px;font-size:11px;border:1px solid #fecaca;border-radius:4px;background:#fee2e2;color:#dc2626;cursor:pointer;">×</button></td>
            </tr>`).join('');
    }

    function bindSupplierEvents() {
        const tbody = $('#supplierTbody');
        if (tbody && !tbody._bound) {
            tbody._bound = true;
            tbody.addEventListener('change', (e) => {
                const input = e.target.closest('.sup-input');
                if (!input) return;
                const row = input.closest('tr[data-supplier-idx]');
                const idx = parseInt(row.dataset.supplierIdx);
                if (!editSupplierInfos[idx]) return;
                const field = input.dataset.field;
                editSupplierInfos[idx][field] = field === 'ProductCode' ? input.value.trim() : (parseFloat(input.value) || 0);
            });
        }
        const input = $('#supplierSearchInput');
        const results = $('#supplierSearchResults');
        if (!input || input._bound) return;
        input._bound = true;

        let timer = null;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(async () => {
                const q = input.value.trim();
                if (q.length < 2) { results.style.display = 'none'; return; }
                try {
                    const url = `${PROXY_URL}/api/odata/Partner/ODataService.GetViewV2?Type=Supplier&Active=true&$top=10&$filter=contains(Name,'${_odataStr(q)}')`;
                    const r = await window.tokenManager.authenticatedFetch(url, { headers: { 'Accept': 'application/json' } });
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    const data = await r.json();
                    const list = data.value || [];
                    results.innerHTML = list.length
                        ? list.map(p => `<div data-sup-add="${p.Id}" style="padding:6px 10px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:12px;">${escapeHtml(p.Name||'')} — ${escapeHtml(p.Phone||'')}</div>`).join('')
                        : '<div style="padding:8px;color:#9ca3af;">Không tìm thấy</div>';
                    results.dataset.partners = JSON.stringify(list);
                    results.style.display = 'block';
                } catch (err) {
                    results.innerHTML = `<div style="padding:8px;color:#dc2626;">${escapeHtml(err.message)}</div>`;
                    results.style.display = 'block';
                }
            }, 300);
        });
        input.addEventListener('blur', () => setTimeout(() => { results.style.display = 'none'; }, 200));
        results.addEventListener('mousedown', (e) => {
            const el = e.target.closest('[data-sup-add]');
            if (!el) return;
            const pid = parseInt(el.dataset.supAdd);
            let list = [];
            try { list = JSON.parse(results.dataset.partners || '[]'); } catch { list = []; }
            const p = list.find(x => x.Id === pid);
            if (p && !editSupplierInfos.find(s => s.PartnerId === pid)) {
                editSupplierInfos.push({
                    PartnerId: p.Id, PartnerName: p.Name,
                    Partner: { Id: p.Id, Name: p.Name, Phone: p.Phone || null },
                    ProductCode: '', Price: 0, MinQty: 0,
                });
                renderSuppliers();
            }
            input.value = '';
            results.style.display = 'none';
        });
    }

    // --------- Tag Picker (in edit modal) ---------
    async function renderTagsPicker(productTags = []) {
        const wrap = $('#tagsPickerList');
        if (!wrap) return;
        const tags = await ensureTagList();
        editTagIds = new Set((productTags || []).map(t => t.Id));
        if (!tags.length) {
            wrap.innerHTML = '<span style="font-size:12px;color:#9ca3af;">(Chưa load được nhãn từ TPOS)</span>';
            return;
        }
        wrap.innerHTML = tags.map(t => {
            const on = editTagIds.has(t.Id);
            return `<button type="button" data-tag-id="${t.Id}" style="padding:4px 10px;border-radius:12px;border:1.5px solid ${t.Color || '#6366f1'};background:${on ? (t.Color || '#6366f1') : '#fff'};color:${on ? '#fff' : (t.Color || '#6366f1')};font-size:11px;cursor:pointer;">${escapeHtml(t.Name || '')}</button>`;
        }).join('');
    }

    function bindTagsPickerEvents() {
        const wrap = $('#tagsPickerList');
        if (!wrap || wrap._bound) return;
        wrap._bound = true;
        wrap.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-tag-id]');
            if (!btn) return;
            const id = parseInt(btn.dataset.tagId);
            if (editTagIds.has(id)) editTagIds.delete(id);
            else editTagIds.add(id);
            await renderTagsPicker(Array.from(editTagIds).map(id => (cachedTags.find(t => t.Id === id) || { Id: id })));
        });
    }

    // --------- Audit Log ---------
    async function loadAuditLog(templateId) {
        const content = $('#auditLogContent');
        if (!content) return;
        content.innerHTML = '<div style="color:#9ca3af;">Đang tải...</div>';
        try {
            // TPOS audit log endpoint varies; try common paths.
            const candidates = [
                `${PROXY_URL}/api/odata/AuditLog/ODataService.GetAuditLogEntity(entityId=${templateId},entityType='ProductTemplate')`,
                `${PROXY_URL}/api/odata/AuditLog?$filter=EntityId eq ${templateId} and EntityType eq 'ProductTemplate'&$orderby=DateCreated desc&$top=50`,
                `${PROXY_URL}/api/odata/ProductTemplate(${templateId})/ODataService.GetAuditLogEntity`,
            ];
            let rows = null;
            for (const url of candidates) {
                try {
                    const r = await window.tokenManager.authenticatedFetch(url, { headers: { 'Accept': 'application/json' } });
                    if (!r.ok) continue;
                    const data = await r.json();
                    rows = data.value || data.Items || data.data || (Array.isArray(data) ? data : null);
                    if (rows) break;
                } catch (err) { console.warn('[Audit] endpoint failed:', url, err.message); }
            }
            if (!rows) {
                content.innerHTML = '<div style="color:#f59e0b;">Endpoint audit log của TPOS chưa xác định — không load được.</div>';
                return;
            }
            if (!rows.length) {
                content.innerHTML = '<div style="color:#9ca3af;">Không có lịch sử.</div>';
                return;
            }
            content.innerHTML = rows.slice(0, 30).map(r => `
                <div style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">
                    <div><strong>${escapeHtml(r.UserName || r.CreatedByName || 'Ẩn danh')}</strong> — <span style="color:#6b7280;">${escapeHtml(r.Action || r.ActionName || '')}</span></div>
                    <div style="font-size:11px;color:#9ca3af;">${escapeHtml(r.DateCreated || r.CreatedAt || '')}</div>
                    ${r.Details || r.Description ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${escapeHtml(r.Details || r.Description)}</div>` : ''}
                </div>`).join('');
        } catch (err) {
            content.innerHTML = `<div style="color:#dc2626;">Lỗi: ${escapeHtml(err.message)}</div>`;
        }
    }

    // --------- Hook up into openEditProduct + saveEditProduct ---------
    /** Populate all Phase 2/3 sections after product detail loaded. */
    async function populateAdvancedSections(detail) {
        // Variants & AttributeLines
        editAttributeLines = (detail.AttributeLines || []).map(l => ({
            AttributeId: l.AttributeId || l.Attribute?.Id,
            Attribute: l.Attribute || { Id: l.AttributeId, Name: '?' },
            Values: l.Values || [],
        }));
        editVariants = (detail.ProductVariants || []).map(v => ({
            Id: v.Id,
            DefaultCode: v.DefaultCode || '',
            Barcode: v.Barcode || '',
            PriceVariant: v.PriceVariant || v.ListPrice || 0,
            Active: v.Active !== false,
            AttributeValues: v.AttributeValues || [],
            NameGet: v.NameGet,
            NameTemplate: v.NameTemplate,
            ListPrice: v.ListPrice || 0, StandardPrice: v.StandardPrice || 0,
            SaleOK: v.SaleOK !== false, PurchaseOK: v.PurchaseOK !== false, AvailableInPOS: v.AvailableInPOS !== false,
            Type: v.Type || 'product', TaxesIds: v.TaxesIds || [],
            UOMId: v.UOMId, QtyAvailable: v.QtyAvailable, EAN13: v.EAN13 || null,
            Version: v.Version || 0,
        }));
        renderAttributeLines();
        renderVariantsTable();
        bindVariantsTableEvents();

        // Combo
        const isComboEl = $('#editIsCombo');
        if (isComboEl) isComboEl.checked = !!detail.IsCombo;
        editComboProducts = (detail.ComboProducts || []).map(c => ({
            ProductId: c.ProductId, ProductNameGet: c.ProductNameGet || c.Product?.NameGet,
            Quantity: c.Quantity || 1, ProductPrice: c.ProductPrice || 0,
        }));
        renderComboItems();
        bindComboSearchEvents();

        // UOM Lines
        editUOMLines = (detail.UOMLines || []).map(u => ({
            Id: u.Id, UOMId: u.UOMId, Name: u.UOM?.Name || u.Name, FactorInv: u.FactorInv || 1,
        }));
        renderUOMLines();
        bindUOMLinesEvents();

        // Supplier infos
        editSupplierInfos = (detail.ProductSupplierInfos || []).map(s => ({
            Id: s.Id, PartnerId: s.PartnerId, PartnerName: s.Partner?.Name || s.PartnerName,
            Partner: s.Partner || null,
            ProductCode: s.ProductCode || '', Price: s.Price || 0, MinQty: s.MinQty || 0,
        }));
        renderSuppliers();
        bindSupplierEvents();

        // Tags
        await renderTagsPicker(detail.Tags || []);
        bindTagsPickerEvents();

        // Audit log — just reset (user must click Load)
        const auditEl = $('#auditLogContent');
        if (auditEl) auditEl.innerHTML = '';
    }

    function resetAdvancedSections() {
        editAttributeLines = [];
        editVariants = [];
        editComboProducts = [];
        editUOMLines = [];
        editSupplierInfos = [];
        editTagIds = new Set();
        renderAttributeLines();
        renderVariantsTable();
        renderComboItems();
        renderUOMLines();
        renderSuppliers();
        const tagWrap = $('#tagsPickerList');
        if (tagWrap) tagWrap.innerHTML = '';

        // CRITICAL: clear _bound flags on containers so listeners re-attach after modal reopen.
        // Without this, Phase 2/3 sections become non-interactive on 2nd modal open.
        ['#variantsTbody', '#uomLinesTbody', '#supplierTbody', '#tagsPickerList',
         '#comboSearchInput', '#supplierSearchInput'].forEach(sel => {
            const el = $(sel);
            if (el) delete el._bound;
        });
    }

    /** Merge advanced sections back into payload before UpdateV2 / InsertV2. */
    function mergeAdvancedIntoPayload(payload) {
        // Attribute lines
        payload.AttributeLines = editAttributeLines.map(l => ({
            Attribute: l.Attribute,
            Values: l.Values,
            AttributeId: l.AttributeId,
        }));
        payload.IsProductVariant = editAttributeLines.length > 0;

        // Variants
        payload.ProductVariants = editVariants.map(v => ({
            Id: v.Id || 0,
            EAN13: v.EAN13 || null,
            DefaultCode: v.DefaultCode || '',
            NameTemplate: v.NameTemplate || payload.Name || payload.DefaultCode || '',
            NameNoSign: null,
            ProductTmplId: payload.Id || 0,
            UOMId: v.UOMId || payload.UOMId || 1,
            QtyAvailable: v.QtyAvailable || 0,
            NameGet: v.NameGet || `${payload.DefaultCode || ''} (${(v.AttributeValues || []).map(a => a.Name).join(', ')})`,
            Price: null,
            Barcode: v.Barcode || null,
            PriceVariant: v.PriceVariant || 0,
            SaleOK: v.SaleOK !== false,
            PurchaseOK: v.PurchaseOK !== false,
            Active: v.Active !== false,
            ListPrice: v.ListPrice || 0,
            PurchasePrice: v.PurchasePrice || null,
            StandardPrice: v.StandardPrice || 0,
            AvailableInPOS: v.AvailableInPOS !== false,
            Version: v.Version || 0,
            Type: v.Type || 'product',
            CompanyId: null, Tags: null, DateCreated: null,
            InitInventory: 0, TaxAmount: null, Error: null,
            AttributeValues: v.AttributeValues || [],
            TaxesIds: v.TaxesIds || [],
        }));
        payload.ProductVariantCount = payload.ProductVariants.length;

        // Combo
        payload.IsCombo = !!$('#editIsCombo')?.checked;
        payload.ComboProducts = payload.IsCombo ? editComboProducts.map(c => ({
            ProductId: c.ProductId,
            ProductNameGet: c.ProductNameGet,
            Quantity: c.Quantity || 1,
            ProductPrice: c.ProductPrice || 0,
        })) : [];

        // UOM Lines
        payload.UOMLines = editUOMLines.map(u => ({
            Id: u.Id || 0,
            UOMId: u.UOMId,
            UOM: (cachedUOMs || []).find(x => x.Id === u.UOMId) || null,
            FactorInv: u.FactorInv || 1,
            Name: u.Name || '',
        }));

        // Supplier infos
        payload.ProductSupplierInfos = editSupplierInfos.map(s => ({
            Id: s.Id || 0,
            PartnerId: s.PartnerId,
            Partner: s.Partner,
            ProductCode: s.ProductCode || '',
            Price: s.Price || 0,
            MinQty: s.MinQty || 0,
        }));

        // Tags
        payload.Tags = Array.from(editTagIds).map(id => {
            const t = (cachedTags || []).find(tt => tt.Id === id);
            return t ? { Id: t.Id, Name: t.Name, Color: t.Color } : { Id: id };
        });

        return payload;
    }

    // =====================================================
    // STOCK ADJUST (P3.4)
    // =====================================================
    let stockAdjustCtx = null; // { templateId, variants:[{Id, code, qty}] }

    async function openStockAdjust(templateId) {
        try {
            showToast('Đang tải tồn kho...', 'info');
            const detail = await fetchProductDetail(templateId);
            const variants = (detail.ProductVariants || []).filter(v => v.Active !== false);

            stockAdjustCtx = {
                templateId,
                templateName: `${detail.DefaultCode || ''} - ${detail.Name || ''}`,
                variants: variants.length ? variants : [{
                    Id: detail.VariantFirstId || null,
                    DefaultCode: detail.DefaultCode,
                    NameGet: detail.NameGet || detail.Name,
                    QtyAvailable: detail.QtyAvailable || 0,
                }],
            };

            $('#stockAdjustProductInfo').innerHTML = `<strong>${escapeHtml(stockAdjustCtx.templateName)}</strong>`;
            const variantSelect = $('#stockAdjustVariantSelect');
            variantSelect.innerHTML = stockAdjustCtx.variants.map((v, idx) =>
                `<option value="${idx}">${escapeHtml(v.NameGet || v.DefaultCode || `BT ${idx+1}`)} — Tồn: ${v.QtyAvailable || 0}</option>`
            ).join('');
            $('#stockAdjustVariantPick').style.display = stockAdjustCtx.variants.length > 1 ? 'block' : 'none';

            const updateCurrentQty = () => {
                const idx = parseInt(variantSelect.value) || 0;
                const v = stockAdjustCtx.variants[idx];
                $('#stockAdjustCurrentQty').value = v?.QtyAvailable ?? 0;
                $('#stockAdjustNewQty').value = v?.QtyAvailable ?? 0;
            };
            variantSelect.onchange = updateCurrentQty;
            updateCurrentQty();

            $('#stockAdjustReason').value = '';
            $('#stockAdjustModal').classList.add('show');
            WS.initIcons();
        } catch (err) {
            console.error('[Stock] Open failed:', err);
            showToast('Lỗi mở dialog: ' + err.message, 'error');
        }
    }

    function closeStockAdjust() {
        $('#stockAdjustModal')?.classList.remove('show');
        stockAdjustCtx = null;
    }

    async function confirmStockAdjust() {
        if (!stockAdjustCtx) return;
        const idx = parseInt($('#stockAdjustVariantSelect').value) || 0;
        const variant = stockAdjustCtx.variants[idx];
        if (!variant?.Id) { showToast('Không xác định được biến thể', 'error'); return; }
        const newQty = parseFloat($('#stockAdjustNewQty').value);
        if (isNaN(newQty) || newQty < 0) { showToast('Số lượng không hợp lệ', 'error'); return; }

        try {
            showToast('Đang điều chỉnh tồn...', 'info');
            // TPOS StockChangeProductQty action (most common endpoint)
            const payload = {
                model: {
                    ProductId: variant.Id,
                    NewQuantity: newQty,
                    LocationId: 12, // default warehouse location (TPOS std)
                    Name: $('#stockAdjustReason').value || 'Điều chỉnh qua n2store',
                }
            };
            // Try multiple action paths (TPOS variants differ per tenant)
            const candidates = [
                `${PROXY_URL}/api/odata/StockChangeProductQty/ODataService.Change`,
                `${PROXY_URL}/api/odata/StockChangeProductQty`,
                `${PROXY_URL}/api/odata/Product/ODataService.ChangeProductQty`,
            ];
            let ok = false;
            let lastErr = null;
            for (const url of candidates) {
                try {
                    const r = await window.tokenManager.authenticatedFetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify(url.includes('ODataService') ? payload : payload.model),
                    });
                    if (r.ok) { ok = true; break; }
                    lastErr = `HTTP ${r.status} @ ${url}`;
                } catch (e) { lastErr = e.message; }
            }
            if (!ok) throw new Error(lastErr || 'Không endpoint nào thành công');

            showToast(`Đã điều chỉnh tồn: ${variant.QtyAvailable} → ${newQty}`, 'success');
            closeStockAdjust();
            fetch(`${RENDER_API}/sync?type=incremental`, { method: 'POST' }).catch(()=>{});
            setTimeout(() => fetchProducts(true), 5000);
        } catch (err) {
            console.error('[Stock] Adjust failed:', err);
            showToast('Lỗi điều chỉnh: ' + err.message, 'error');
        }
    }

    // =====================================================
    // BULK ACTIONS (P2.3)
    // =====================================================
    function toggleBulkMenu(show) {
        const menu = $('#bulkActionsMenu');
        if (!menu) return;
        menu.style.display = show === undefined ? (menu.style.display === 'none' ? 'block' : 'none') : (show ? 'block' : 'none');
    }

    async function handleBulkAction(action) {
        toggleBulkMenu(false);
        const ids = Array.from(selectedIds);
        if (!ids.length) { showToast('Vui lòng chọn SP trước', 'error'); return; }

        if (action === 'print') {
            const selected = pageProducts.filter(p => selectedIds.has(p.id));
            openBarcodePrint(selected);
            return;
        }

        if (action === 'archive' || action === 'activate') {
            const verb = action === 'archive' ? 'ngưng hiệu lực' : 'kích hoạt lại';
            if (!confirm(`${verb.toUpperCase()} ${ids.length} SP?\n\nCó thể mất vài phút.`)) return;
            showToast(`Đang ${verb}...`, 'info');
            let ok = 0, failed = 0;
            const queue = ids.slice();
            const workers = Array.from({ length: 3 }, async () => {
                while (queue.length) {
                    const id = queue.shift();
                    try {
                        const detail = await fetchProductDetail(id);
                        const payload = { ...detail };
                        delete payload['@odata.context'];
                        payload.Active = action !== 'archive';
                        const url = `${PROXY_URL}/api/odata/ProductTemplate/ODataService.UpdateV2`;
                        const r = await window.tokenManager.authenticatedFetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify(payload),
                        });
                        if (r.ok) ok++; else failed++;
                    } catch (err) { failed++; console.warn('[BulkAction]', id, err.message); }
                    await new Promise(r => setTimeout(r, 200));
                }
            });
            await Promise.all(workers);
            showToast(`Hoàn tất: ${ok} OK, ${failed} lỗi`, ok > 0 ? 'success' : 'error');
            fetch(`${RENDER_API}/sync?type=incremental`, { method: 'POST' }).catch(()=>{});
            setTimeout(() => fetchProducts(true), 3000);
            return;
        }

        if (action === 'tag') {
            await openBulkTagModal(ids);
            return;
        }
    }

    async function openBulkTagModal(ids) {
        const tags = await ensureTagList();
        $('#bulkTagCount').innerHTML = `<strong>${ids.length}</strong> sản phẩm đã chọn`;
        const list = $('#bulkTagList');
        list.innerHTML = tags.length
            ? tags.map(t => `<label style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:10px;border:1px solid ${t.Color || '#6366f1'};cursor:pointer;font-size:11px;"><input type="checkbox" value="${t.Id}"> ${escapeHtml(t.Name || '')}</label>`).join('')
            : '<div style="color:#9ca3af;font-size:12px;">Không load được danh sách nhãn.</div>';
        $('#bulkTagModal').dataset.ids = JSON.stringify(ids);
        $('#bulkTagModal').classList.add('show');
        WS.initIcons();
    }

    function closeBulkTagModal() {
        $('#bulkTagModal')?.classList.remove('show');
    }

    async function confirmBulkTag() {
        let ids = [];
        try { ids = JSON.parse($('#bulkTagModal').dataset.ids || '[]'); } catch { ids = []; }
        if (!Array.isArray(ids) || !ids.length) { showToast('Không có SP được chọn', 'error'); return; }
        const mode = $('#bulkTagMode').value;
        const selectedTagIds = Array.from($('#bulkTagList').querySelectorAll('input:checked')).map(i => parseInt(i.value));
        if (!selectedTagIds.length) { showToast('Chọn ít nhất 1 nhãn', 'error'); return; }
        const selectedTags = selectedTagIds.map(id => (cachedTags || []).find(t => t.Id === id) || { Id: id });

        showToast(`Đang áp dụng cho ${ids.length} SP...`, 'info');
        let ok = 0, failed = 0;
        const queue = ids.slice();
        const workers = Array.from({ length: 3 }, async () => {
            while (queue.length) {
                const id = queue.shift();
                try {
                    const detail = await fetchProductDetail(id);
                    const payload = { ...detail };
                    delete payload['@odata.context'];
                    const currentTags = payload.Tags || [];
                    let newTags;
                    if (mode === 'replace') newTags = selectedTags;
                    else if (mode === 'add') {
                        const existingIds = new Set(currentTags.map(t => t.Id));
                        newTags = [...currentTags, ...selectedTags.filter(t => !existingIds.has(t.Id))];
                    } else { // remove
                        const removeIds = new Set(selectedTagIds);
                        newTags = currentTags.filter(t => !removeIds.has(t.Id));
                    }
                    payload.Tags = newTags;
                    const url = `${PROXY_URL}/api/odata/ProductTemplate/ODataService.UpdateV2`;
                    const r = await window.tokenManager.authenticatedFetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify(payload),
                    });
                    if (r.ok) ok++; else failed++;
                } catch (err) { failed++; console.warn('[BulkTag]', id, err.message); }
                await new Promise(r => setTimeout(r, 200));
            }
        });
        await Promise.all(workers);
        showToast(`Hoàn tất: ${ok} OK, ${failed} lỗi`, ok > 0 ? 'success' : 'error');
        closeBulkTagModal();
        fetch(`${RENDER_API}/sync?type=incremental`, { method: 'POST' }).catch(()=>{});
        setTimeout(() => fetchProducts(true), 3000);
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
