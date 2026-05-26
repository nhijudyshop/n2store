// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Shared Return Order Modal - Trả hàng nhà cung cấp
 * Mimics TPOS fastpurchaseorder/refundform1
 *
 * Self-contained module — usable from any page that loads
 *   window.tokenManager, window.notificationManager (optional ShopConfig).
 *
 * Usage:
 *   <link rel="stylesheet" href="../shared/css/return-order.css">
 *   <script src="../shared/js/return-order-modal.js"></script>
 *   window.ReturnOrderModal.ensureMarkup();              // injects #returnOrderModal into <body>
 *   window.ReturnOrderModal.open(supplierData?);         // pre-fills supplier if given
 *   window.ReturnOrderModal.onSuccess(result => {...});  // refresh hook for host page
 */

window.ReturnOrderModal = (function () {
    'use strict';

    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const PRODUCTS_PER_PAGE = 50;

    // Bulk-load + client-side filter (TPOS refundform1 pattern). Eliminates per-keystroke
    // server fetches and fixes silent $filter ignore on ODataService.GetViewV2 endpoint.
    const CACHE_KEY_PRODUCTS = 'returnOrder_productIndex_v1';
    const CACHE_KEY_SUPPLIERS = 'returnOrder_suppliers_v1';
    const CACHE_KEY_PAYMENT = 'returnOrder_paymentMethods_v1';
    const CACHE_TTL_PRODUCTS = 10 * 60 * 1000;
    const CACHE_TTL_REFDATA = 30 * 60 * 1000;

    // Self-contained authenticated fetch. Uses global tposFetch helper if defined by host page,
    // otherwise falls back to window.tokenManager.authenticatedFetch with TPOS headers.
    async function tposFetchLocal(url, options = {}) {
        if (typeof window.tposFetch === 'function') {
            return window.tposFetch(url, options);
        }
        if (!window.tokenManager?.authenticatedFetch) {
            throw new Error('tokenManager not available');
        }
        return window.tokenManager.authenticatedFetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                tposappversion: '6.2.6.1',
                ...options.headers,
            },
        });
    }
    const tposFetch = tposFetchLocal;

    // Host-page integration hooks. Pages register via ReturnOrderModal.onSuccess(fn) /.onClose(fn).
    const _hooks = { success: [], close: [] };
    function _emit(event, payload) {
        for (const fn of _hooks[event] || []) {
            try {
                fn(payload);
            } catch (err) {
                console.warn(`[ReturnOrderModal] ${event} hook error:`, err);
            }
        }
    }

    // =====================================================
    // STATIC CONFIG — extracted to shared/js/return-order-config.js (window.ReturnOrderConfig)
    // =====================================================

    function getCompanyId() {
        return window.ReturnOrderConfig?.getCompanyId?.() ?? 1;
    }

    function getConfig() {
        return window.ReturnOrderConfig?.getConfig?.();
    }

    // =====================================================
    // STATE
    // =====================================================

    const S = {
        allProducts: [], // bulk-loaded catalog index — populated once per cache TTL
        products: [], // current page slice for render
        productPage: 1,
        productTotal: 0,
        searchQuery: '',
        categoryFilter: '',
        sortBy: 'DateCreated desc',
        isLoadingProducts: false,
        orderLines: [], // { product, quantity, price, productId, uom, uomId, accountId }
        selectedSupplier: null, // { Id, Name, Ref, DisplayName }
        suppliers: [],
        paymentMethods: [],
        orderDate: null,
        paymentMethodId: null,
        shippingCost: 0,
        paymentAmount: 0,
        discountAmount: 0,
        isSubmitting: false,
        searchDebounce: null,
    };

    // =====================================================
    // HELPERS
    // =====================================================

    function fmt(n) {
        if (n == null || isNaN(n)) return '0';
        return Number(n).toLocaleString('vi-VN');
    }

    function parseFmt(s) {
        if (!s) return 0;
        return parseInt(String(s).replace(/\D/g, ''), 10) || 0;
    }

    function escHtml(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function $(id) {
        return document.getElementById(id);
    }

    // =====================================================
    // PRODUCT CATALOG
    // =====================================================
    //
    // Strategy: bulk-fetch all active products once (≈1s, ~1MB), then filter/sort/paginate
    // client-side. Old code used ODataService.GetViewV2 with $filter — TPOS server silently
    // ignores $filter on that endpoint, so search returned unfiltered data (3579 rows).
    // Plain /odata/ProductTemplate respects $filter and matches TPOS native refundform1
    // behavior (client-side search after bulk preload + cache).

    function _readProductCache() {
        try {
            const raw = sessionStorage.getItem(CACHE_KEY_PRODUCTS);
            if (!raw) return null;
            const { data, ts } = JSON.parse(raw);
            if (!Array.isArray(data) || Date.now() - ts > CACHE_TTL_PRODUCTS) return null;
            return data;
        } catch (_) {
            return null;
        }
    }

    function _writeProductCache(data) {
        try {
            sessionStorage.setItem(CACHE_KEY_PRODUCTS, JSON.stringify({ data, ts: Date.now() }));
        } catch (_) {
            // Quota exceeded — skip cache, in-memory still works
        }
    }

    async function loadProductIndex(force = false) {
        if (!force && S.allProducts.length > 0) return;
        if (!force) {
            const cached = _readProductCache();
            if (cached) {
                S.allProducts = cached;
                return;
            }
        }
        // QtyAvailable/VirtualAvailable are computed nav fields and cannot appear in $select
        // (server returns 500). Stock is intentionally omitted — shown as "—" in list.
        const url = `${PROXY_URL}/api/odata/ProductTemplate?$top=5000&$count=true&$filter=${encodeURIComponent('Active eq true')}&$select=Id,NameGet,Name,DefaultCode,Barcode,PurchasePrice,ListPrice,UOMName,UOMId,ImageUrl,Type,DateCreated`;
        const response = await tposFetch(url, {
            headers: { 'feature-version': '2', 'x-tpos-lang': 'vi' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        S.allProducts = data.value || [];
        _writeProductCache(S.allProducts);
    }

    function _applyFilterSort() {
        const q = (S.searchQuery || '').trim().toLowerCase();
        let arr = S.allProducts;
        if (q) {
            arr = arr.filter((p) => {
                const name = (p.NameGet || p.Name || '').toLowerCase();
                const code = (p.DefaultCode || '').toLowerCase();
                const barcode = (p.Barcode || '').toLowerCase();
                return name.includes(q) || code.includes(q) || barcode.includes(q);
            });
        }
        // Sort: client-side replica of $orderby. Default = newest first via DateCreated, fallback Id desc.
        if (S.sortBy === 'DateCreated desc' || !S.sortBy) {
            arr = arr.slice().sort((a, b) => {
                const da = a.DateCreated ? new Date(a.DateCreated).getTime() : 0;
                const db = b.DateCreated ? new Date(b.DateCreated).getTime() : 0;
                if (da !== db) return db - da;
                return (b.Id || 0) - (a.Id || 0);
            });
        } else if (S.sortBy === 'DateCreated asc') {
            arr = arr.slice().sort((a, b) => {
                const da = a.DateCreated ? new Date(a.DateCreated).getTime() : 0;
                const db = b.DateCreated ? new Date(b.DateCreated).getTime() : 0;
                return da - db;
            });
        } else if (S.sortBy === 'NameGet asc' || S.sortBy === 'Name asc') {
            arr = arr
                .slice()
                .sort((a, b) =>
                    (a.NameGet || a.Name || '').localeCompare(b.NameGet || b.Name || '', 'vi')
                );
        } else if (S.sortBy === 'PurchasePrice desc') {
            arr = arr.slice().sort((a, b) => (b.PurchasePrice || 0) - (a.PurchasePrice || 0));
        } else if (S.sortBy === 'PurchasePrice asc') {
            arr = arr.slice().sort((a, b) => (a.PurchasePrice || 0) - (b.PurchasePrice || 0));
        }
        return arr;
    }

    async function fetchProducts(page = 1) {
        if (S.isLoadingProducts) return;

        const grid = $('returnProductList');

        // First-time load (or after cache expiry / force refresh)
        if (S.allProducts.length === 0) {
            S.isLoadingProducts = true;
            if (grid) {
                grid.innerHTML = `<div class="return-product-loading"><svg class="spin" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Đang tải danh mục...</div>`;
            }
            try {
                await loadProductIndex();
            } catch (err) {
                console.error('[ReturnOrder] loadProductIndex error:', err);
                if (grid) {
                    grid.innerHTML = `<div class="return-product-loading" style="color:#dc2626;">Lỗi tải sản phẩm: ${err.message}</div>`;
                }
                S.isLoadingProducts = false;
                return;
            }
            S.isLoadingProducts = false;
        }

        S.productPage = page;
        const filtered = _applyFilterSort();
        S.productTotal = filtered.length;
        const skip = (page - 1) * PRODUCTS_PER_PAGE;
        S.products = filtered.slice(skip, skip + PRODUCTS_PER_PAGE);

        renderProductList();
        renderProductPagination();
    }

    function renderProductList() {
        const list = $('returnProductList');
        if (!list) return;

        if (!S.products.length) {
            list.innerHTML = '<div class="return-product-loading">Không có sản phẩm</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        S.products.forEach((p) => {
            const code = p.DefaultCode || '';
            const name = p.NameGet || p.Name || '';
            const unit = p.UOMName || 'Cái';
            const price = p.PurchasePrice || p.ListPrice || 0;
            // Stock fields are computed by TPOS and unavailable from bulk $select endpoint.
            // Show "—" instead of misleading "0" when value is genuinely unknown.
            const hasStock = p.QtyAvailable !== undefined;
            const stock = hasStock ? p.QtyAvailable : null;
            const forecast = hasStock ? (p.VirtualAvailable ?? 0) : null;
            const imageUrl = p.ImageUrl;

            const stockText = stock === null ? '—' : fmt(stock);
            const forecastText = forecast === null ? '—' : fmt(forecast);
            const stockClass =
                stock === null
                    ? 'stock-unknown'
                    : stock > 0
                      ? 'stock-value'
                      : stock === 0
                        ? 'stock-zero'
                        : 'stock-negative';
            const forecastClass =
                forecast === null
                    ? 'stock-unknown'
                    : forecast > 0
                      ? 'stock-value'
                      : forecast < 0
                        ? 'stock-negative'
                        : 'stock-zero';

            const row = document.createElement('div');
            row.className = 'return-product-row';
            row.dataset.productId = p.Id;

            const imgHtml = imageUrl
                ? `<img class="return-product-img" src="${imageUrl}" loading="lazy" onerror="this.outerHTML='<div class=\\'return-product-img-placeholder\\'>${escHtml(code.substring(0, 4) || 'SP')}</div>'">`
                : `<div class="return-product-img-placeholder">${escHtml(code.substring(0, 4) || 'SP')}</div>`;

            row.innerHTML = `
                ${imgHtml}
                <div class="return-product-info">
                    <div class="return-product-name">${code ? `<span class="product-code">[${escHtml(code)}]</span> ` : ''}${escHtml(name)}</div>
                    <div class="return-product-stock">Tồn kho: <span class="${stockClass}">${stockText}</span> / Tồn dự báo: <span class="${forecastClass}">${forecastText}</span></div>
                </div>
                <div class="return-product-unit">${escHtml(unit)}</div>
                <div class="return-product-price">${fmt(price)}</div>
            `;
            fragment.appendChild(row);
        });

        list.innerHTML = '';
        list.appendChild(fragment);
    }

    function renderProductPagination() {
        const wrap = $('returnProductPagination');
        if (!wrap) return;

        const totalPages = Math.ceil(S.productTotal / PRODUCTS_PER_PAGE);
        if (totalPages <= 1) {
            wrap.innerHTML = `<span class="return-product-page-info">${S.productTotal} sản phẩm</span>`;
            return;
        }

        let html = '';
        if (S.productPage > 1)
            html += `<button class="btn-page" data-page="${S.productPage - 1}">&laquo;</button>`;

        const start = Math.max(1, S.productPage - 2);
        const end = Math.min(totalPages, start + 4);
        for (let i = start; i <= end; i++) {
            html += `<button class="btn-page ${i === S.productPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        if (S.productPage < totalPages)
            html += `<button class="btn-page" data-page="${S.productPage + 1}">&raquo;</button>`;
        html += `<span class="return-product-page-info">${S.productTotal} SP</span>`;

        wrap.innerHTML = html;
    }

    function _goProductPage(page) {
        fetchProducts(page);
    }

    // =====================================================
    // ADD / REMOVE / EDIT ORDER LINES
    // =====================================================

    async function _addProduct(productId) {
        const product = S.products.find((p) => p.Id === productId);
        if (!product) return;

        // Check if already in order (by template ID)
        const existing = S.orderLines.find((l) => l.templateId === productId);
        if (existing) {
            existing.quantity += 1;
            renderOrderLines();
            return;
        }

        // GetViewV2 returns ProductTemplate IDs, but TPOS FastPurchaseOrder needs Product variant IDs
        // Fetch the first variant's ID from the template
        let variantId = productId;
        let variantData = null;
        try {
            const resp = await tposFetch(
                `${PROXY_URL}/api/odata/ProductTemplate(${productId})?$select=Id&$expand=ProductVariants($select=Id,Name,NameGet,DefaultCode,Barcode,PurchasePrice,Price,UOMId,UOMName,Active,ProductTmplId,Weight,DiscountSale,DiscountPurchase,ImageUrl;$top=1)`
            );
            if (resp.ok) {
                const data = await resp.json();
                if (data.ProductVariants?.length > 0) {
                    variantData = data.ProductVariants[0];
                    variantId = variantData.Id;
                }
            }
        } catch (e) {
            console.warn('[ReturnOrder] Failed to fetch variant, using template ID:', e);
        }

        S.orderLines.push({
            templateId: productId,
            productId: variantId,
            variantData: variantData,
            product: product,
            name: product.NameGet || product.Name || '',
            code: product.DefaultCode || '',
            quantity: 1,
            price: product.PurchasePrice || product.ListPrice || 0,
            uom: product.UOMName || 'Cái',
            uomId: product.UOMId || 1,
            accountId: getConfig().AccountId,
        });

        renderOrderLines();
    }

    function removeLine(index) {
        S.orderLines.splice(index, 1);
        renderOrderLines();
    }

    function updateLineQty(index, val) {
        const qty = parseInt(val, 10);
        if (isNaN(qty) || qty < 1) return;
        S.orderLines[index].quantity = qty;
        // Update only the total cell for this row instead of full re-render
        const row = document.querySelector(`tr[data-line-index="${index}"]`);
        if (row) {
            const totalCell = row.querySelector('.col-total');
            if (totalCell)
                totalCell.textContent = fmt(
                    S.orderLines[index].quantity * S.orderLines[index].price
                );
        }
        renderSummary();
    }

    function updateLinePrice(index, val) {
        const price = parseFmt(val);
        S.orderLines[index].price = price;
        const row = document.querySelector(`tr[data-line-index="${index}"]`);
        if (row) {
            const totalCell = row.querySelector('.col-total');
            if (totalCell) totalCell.textContent = fmt(S.orderLines[index].quantity * price);
        }
        renderSummary();
    }

    // =====================================================
    // RENDER ORDER LINES
    // =====================================================

    function renderOrderLines() {
        const tbody = $('returnOrderLines');
        if (!tbody) return;

        if (!S.orderLines.length) {
            tbody.innerHTML = `<tr><td colspan="6"><div class="return-order-empty"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg><div>Chọn sản phẩm từ danh sách bên trái</div></div></td></tr>`;
            renderSummary();
            return;
        }

        tbody.innerHTML = S.orderLines
            .map(
                (line, i) => `
            <tr data-line-index="${i}">
                <td class="col-stt">${i + 1}</td>
                <td class="col-product">
                    <div class="product-name-cell">${line.code ? `[${escHtml(line.code)}] ` : ''}${escHtml(line.name)}</div>
                </td>
                <td class="col-qty">
                    <input type="number" class="qty-input" value="${line.quantity}" min="1" data-line="${i}" data-field="qty">
                </td>
                <td class="col-price">
                    <input type="text" class="price-input" value="${fmt(line.price)}" data-line="${i}" data-field="price">
                </td>
                <td class="col-total">${fmt(line.quantity * line.price)}</td>
                <td class="col-action">
                    <button class="btn-remove-line" data-line="${i}" title="Xóa">&times;</button>
                </td>
            </tr>
        `
            )
            .join('');

        renderSummary();
    }

    function renderSummary() {
        const summary = $('returnOrderSummary');
        if (!summary) return;

        let totalQty = 0,
            totalAmount = 0;
        S.orderLines.forEach((l) => {
            totalQty += l.quantity;
            totalAmount += l.quantity * l.price;
        });

        const discount = S.discountAmount || 0;
        const shipping = S.shippingCost || 0;
        const grandTotal = totalAmount - discount + shipping;

        summary.innerHTML = `
            <div class="return-summary-row">
                <span class="label">Tổng số lượng:</span>
                <span class="value">${fmt(totalQty)}</span>
            </div>
            <div class="return-summary-row">
                <span class="label">Tổng:</span>
                <span class="value">${fmt(totalAmount)}</span>
            </div>
            <div class="return-summary-row">
                <span class="label">Chiết khấu - Giảm giá:</span>
                <input type="text" class="discount-input" value="${fmt(discount)}"
                    oninput="this.value = this.value.replace(/[^0-9]/g,'')"
                    onchange="ReturnOrderModal._setDiscount(this.value)">
            </div>
            <div class="return-summary-row">
                <span class="label">Cước phí:</span>
                <span class="value">${fmt(shipping)}</span>
            </div>
            <div class="return-summary-row total">
                <span class="label">Tổng tiền:</span>
                <span class="value">${fmt(grandTotal)}</span>
            </div>
        `;
    }

    function _setDiscount(val) {
        S.discountAmount = parseFmt(val);
        renderSummary();
    }

    // =====================================================
    // SUPPLIER SELECTOR
    // =====================================================

    function _readRefCache(key) {
        try {
            const raw = sessionStorage.getItem(key);
            if (!raw) return null;
            const { data, ts } = JSON.parse(raw);
            if (!Array.isArray(data) || Date.now() - ts > CACHE_TTL_REFDATA) return null;
            return data;
        } catch (_) {
            return null;
        }
    }

    function _writeRefCache(key, data) {
        try {
            sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
        } catch (_) {}
    }

    async function fetchSuppliers() {
        // Reuse from main.js State if available
        if (window.State && window.State.allSuppliers && window.State.allSuppliers.length > 0) {
            S.suppliers = window.State.allSuppliers.map((s) => ({
                Id: s.PartnerId,
                Name: s.Name,
                Ref: s.Code,
                DisplayName: `[${s.Code}] ${s.Name}`,
            }));
            return;
        }

        const cached = _readRefCache(CACHE_KEY_SUPPLIERS);
        if (cached) {
            S.suppliers = cached;
            return;
        }

        try {
            const url = `${PROXY_URL}/api/odata/Partner?$filter=Supplier eq true and Active eq true&$top=500&$orderby=Name asc&$select=Id,Name,Ref,DisplayName`;
            const resp = await tposFetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            S.suppliers = (data.value || []).map((s) => ({
                Id: s.Id,
                Name: s.Name,
                Ref: s.Ref || '',
                DisplayName: s.DisplayName || `[${s.Ref || ''}] ${s.Name}`,
            }));
            _writeRefCache(CACHE_KEY_SUPPLIERS, S.suppliers);
        } catch (err) {
            console.error('[ReturnOrder] fetchSuppliers error:', err);
        }
    }

    function renderSupplierDropdown(query) {
        const dropdown = $('returnSupplierDropdown');
        if (!dropdown) return;

        const q = (query || '').toLowerCase();
        const filtered = q
            ? S.suppliers.filter(
                  (s) =>
                      s.DisplayName.toLowerCase().includes(q) ||
                      (s.Ref || '').toLowerCase().includes(q)
              )
            : S.suppliers.slice(0, 30);

        if (!filtered.length) {
            dropdown.style.display = 'none';
            return;
        }

        dropdown.innerHTML = filtered
            .slice(0, 30)
            .map(
                (s) =>
                    `<div class="dropdown-item" onclick="ReturnOrderModal._selectSupplier(${s.Id})">${escHtml(s.DisplayName)}</div>`
            )
            .join('');
        dropdown.style.display = 'block';
    }

    function _selectSupplier(id) {
        const supplier = S.suppliers.find((s) => s.Id === id);
        if (!supplier) return;

        S.selectedSupplier = supplier;
        const input = $('returnSupplierSearch');
        const dropdown = $('returnSupplierDropdown');
        const wrapper = $('returnSupplierWrapper');

        if (dropdown) dropdown.style.display = 'none';

        // Replace input with selected chip
        if (wrapper) {
            wrapper.innerHTML = `
                <div class="return-supplier-selected">
                    ${escHtml(supplier.DisplayName)}
                    <button class="btn-clear-supplier" onclick="ReturnOrderModal._clearSupplier()" title="Bỏ chọn">&times;</button>
                </div>
            `;
        }
    }

    function _clearSupplier() {
        S.selectedSupplier = null;
        const wrapper = $('returnSupplierWrapper');
        if (wrapper) {
            wrapper.innerHTML = `
                <input type="text" id="returnSupplierSearch" class="form-input" placeholder="Tìm nhà cung cấp..." autocomplete="off">
                <div class="searchable-dropdown" id="returnSupplierDropdown" style="display: none;"></div>
            `;
            initSupplierSearchEvents();
            $('returnSupplierSearch')?.focus();
        }
    }

    function initSupplierSearchEvents() {
        const input = $('returnSupplierSearch');
        if (!input) return;

        input.addEventListener('input', () => {
            renderSupplierDropdown(input.value);
        });
        input.addEventListener('focus', () => {
            renderSupplierDropdown(input.value);
        });
    }

    // =====================================================
    // PAYMENT METHODS
    // =====================================================

    async function fetchPaymentMethods() {
        const cached = _readRefCache(CACHE_KEY_PAYMENT);
        if (cached) {
            S.paymentMethods = cached;
            renderPaymentMethods();
            return;
        }

        try {
            const url = `${PROXY_URL}/api/odata/AccountJournal?$filter=${encodeURIComponent("Type eq 'cash' or Type eq 'bank'")}&$select=Id,Name,Type`;
            const resp = await tposFetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            // Deduplicate by Name (API can return duplicates across companies)
            const seen = new Set();
            S.paymentMethods = (data.value || []).filter((m) => {
                if (seen.has(m.Name)) return false;
                seen.add(m.Name);
                return true;
            });
            _writeRefCache(CACHE_KEY_PAYMENT, S.paymentMethods);
            renderPaymentMethods();
        } catch (err) {
            console.error('[ReturnOrder] fetchPaymentMethods error:', err);
            S.paymentMethods = [
                { Id: 8, Name: 'Ngân hàng', Type: 'bank' },
                { Id: 1, Name: 'Tiền mặt', Type: 'cash' },
            ];
            renderPaymentMethods();
        }
    }

    function renderPaymentMethods() {
        const select = $('returnPaymentMethod');
        if (!select) return;

        // Default to bank
        select.innerHTML = S.paymentMethods
            .map(
                (m) =>
                    `<option value="${m.Id}" ${m.Type === 'bank' ? 'selected' : ''}>${escHtml(m.Name)}</option>`
            )
            .join('');

        if (S.paymentMethods.length > 0) {
            S.paymentMethodId =
                S.paymentMethods.find((m) => m.Type === 'bank')?.Id || S.paymentMethods[0].Id;
        }
    }

    // =====================================================
    // SUBMIT RETURN ORDER
    // =====================================================

    async function submitReturn(formAction) {
        if (S.isSubmitting) return;

        // Validate
        if (!S.selectedSupplier) {
            window.notificationManager?.warning('Vui lòng chọn nhà cung cấp');
            return;
        }
        if (!S.orderLines.length) {
            window.notificationManager?.warning('Vui lòng thêm sản phẩm');
            return;
        }

        S.isSubmitting = true;
        const loadingId = window.notificationManager?.loading('Đang tạo đơn trả hàng...');

        try {
            const config = getConfig();
            const now = new Date();

            // Read form values - combine selected date with current machine time
            const dateInput = $('returnOrderDate');
            let orderDate = now;
            if (dateInput?.value) {
                const [y, m, d] = dateInput.value.split('-').map(Number);
                orderDate = new Date(
                    y,
                    m - 1,
                    d,
                    now.getHours(),
                    now.getMinutes(),
                    now.getSeconds()
                );
            }
            const paymentMethodSelect = $('returnPaymentMethod');
            const paymentMethodId = paymentMethodSelect
                ? parseInt(paymentMethodSelect.value)
                : config.PaymentJournalId;
            const paymentMethod = S.paymentMethods.find((m) => m.Id === paymentMethodId) || {
                Id: config.PaymentJournalId,
                Name: 'Tiền mặt',
                Type: 'cash',
                TypeGet: 'Tiền mặt',
            };
            const shippingCost = parseFmt($('returnShippingCost')?.value);
            const paymentAmount = parseFmt($('returnPaymentAmount')?.value);

            // Build payload via shared schema builder (return-order-payload.js)
            if (!window.ReturnOrderPayload?.buildRefundPayload) {
                throw new Error(
                    'ReturnOrderPayload not loaded — include shared/js/return-order-payload.js before return-order-modal.js'
                );
            }
            const payload = window.ReturnOrderPayload.buildRefundPayload({
                selectedSupplier: S.selectedSupplier,
                orderLines: S.orderLines,
                orderDate,
                now,
                paymentMethodId,
                paymentMethod,
                shippingCost,
                paymentAmount,
                discountAmount: S.discountAmount,
                formAction,
                refundOrderId: S.refundOrderId,
                origin: S.origin,
            });

            console.log('[ReturnOrder] Submitting return order:', payload);

            const url = `${PROXY_URL}/api/odata/FastPurchaseOrder`;
            const response = await tposFetch(url, {
                method: 'POST',
                headers: { 'feature-version': '2' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}: ${errText}`);
            }

            const result = await response.json();
            console.log(
                '[ReturnOrder] Return order created:',
                result.Id,
                result.Number,
                result.ShowState
            );

            if (loadingId) window.notificationManager?.remove?.(loadingId);
            window.notificationManager?.success(
                `Đã tạo đơn trả hàng: ${result.Number || result.Id}`
            );

            close();

            // Host-page refresh hook (replaces previous direct fetchData/RefundOrders calls).
            _emit('success', result);
        } catch (err) {
            console.error('[ReturnOrder] Submit error:', err);
            if (loadingId) window.notificationManager?.remove?.(loadingId);
            window.notificationManager?.error(`Lỗi tạo đơn trả hàng: ${err.message}`);
        } finally {
            S.isSubmitting = false;
        }
    }

    // =====================================================
    // MODAL LIFECYCLE
    // =====================================================

    /**
     * Open the refund modal. Two usage modes:
     *
     *   1. open() / open(supplierData)
     *      Free-form refund — user picks supplier + products manually.
     *
     *   2. open({ supplierData, presetLines, refundOrderId, origin, title, note })
     *      Refund-from-purchase mode — locks supplier, hides product catalog,
     *      pre-fills order lines from the source BILL. User adjusts qty / removes
     *      lines to partially refund, or keeps as-is to refund the full BILL.
     *      `refundOrderId` + `origin` get forwarded to the POST payload.
     */
    function open(arg) {
        resetState();

        // Normalize: legacy `open(supplierData)` vs new `open(opts)`
        const opts =
            arg && (arg.presetLines || arg.refundOrderId || arg.supplierData)
                ? arg
                : arg
                  ? { supplierData: arg }
                  : {};

        const supplierData = opts.supplierData;
        const presetLines = Array.isArray(opts.presetLines) ? opts.presetLines : null;
        S.refundOrderId = opts.refundOrderId || null;
        S.origin = opts.origin || null;
        S.modeFromPurchase = !!(presetLines && presetLines.length);

        const modal = $('returnOrderModal');
        if (!modal) return;

        // Toggle product panel visibility for refund-from-purchase mode (no catalog needed)
        const productPanel = modal.querySelector('.return-product-panel');
        if (productPanel) {
            productPanel.style.display = S.modeFromPurchase ? 'none' : '';
        }
        modal.classList.toggle('mode-from-purchase', S.modeFromPurchase);

        // Optional title override + source banner
        const titleEl = modal.querySelector('.modal-header h3');
        if (titleEl) {
            titleEl.textContent =
                opts.title ||
                (S.modeFromPurchase
                    ? `Trả hàng từ ${opts.origin || 'BILL'} — chỉnh số lượng / xóa dòng cho trả 1 phần`
                    : 'Đơn trả hàng nhà cung cấp');
        }

        // Pre-fill supplier if provided
        if (supplierData) {
            // Inject into state immediately so _selectSupplier can find it even
            // before fetchSuppliers resolves.
            const Id = supplierData.Id || supplierData.PartnerId;
            const existing = S.suppliers.find((s) => s.Id === Id);
            if (!existing) {
                S.suppliers = [
                    {
                        Id,
                        Name: supplierData.Name || supplierData.PartnerName || '',
                        DisplayName:
                            supplierData.DisplayName ||
                            supplierData.PartnerDisplayName ||
                            supplierData.Name ||
                            '',
                        Ref: supplierData.Ref || null,
                        Active: true,
                    },
                    ...S.suppliers,
                ];
            }
            _selectSupplier(Id);
        }

        // Seed preset order lines (refund-from-purchase mode)
        if (presetLines) {
            S.orderLines = presetLines.map((l) => ({ ...l }));
        }

        modal.classList.add('show');

        // Set default date (date only, time uses current machine time on submit)
        const dateInput = $('returnOrderDate');
        if (dateInput) {
            const now = new Date();
            dateInput.value = now.toISOString().slice(0, 10);
        }

        // Load data — skip product catalog in from-purchase mode
        if (!S.modeFromPurchase) fetchProducts();
        fetchSuppliers();
        fetchPaymentMethods();
        renderOrderLines();
    }

    function close() {
        const modal = $('returnOrderModal');
        if (modal) modal.classList.remove('show');
    }

    function resetState() {
        S.products = [];
        S.productPage = 1;
        S.productTotal = 0;
        S.searchQuery = '';
        S.categoryFilter = '';
        S.sortBy = 'DateCreated desc';
        S.isLoadingProducts = false;
        S.orderLines = [];
        S.selectedSupplier = null;
        S.paymentMethodId = null;
        S.shippingCost = 0;
        S.paymentAmount = 0;
        S.discountAmount = 0;
        S.isSubmitting = false;
        S.refundOrderId = null;
        S.origin = null;
        S.modeFromPurchase = false;

        // Reset supplier input
        _clearSupplier();
    }

    // =====================================================
    // EVENT HANDLERS
    // =====================================================

    function initEvents() {
        // Close modal
        $('btnCloseReturnOrder')?.addEventListener('click', close);
        $('btnReturnBack')?.addEventListener('click', close);
        $('returnOrderModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'returnOrderModal') close();
        });

        // Action buttons
        $('btnReturnSave')?.addEventListener('click', () => submitReturn(null));

        // Product search — client-side filter, tiny debounce to coalesce rapid keystrokes
        const searchInput = $('returnProductSearch');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(S.searchDebounce);
                S.searchDebounce = setTimeout(() => {
                    S.searchQuery = searchInput.value.trim();
                    fetchProducts(1);
                }, 80);
            });
        }

        // Sort
        $('returnSortBy')?.addEventListener('change', (e) => {
            S.sortBy = e.target.value;
            fetchProducts(1);
        });

        // Shipping cost input
        $('returnShippingCost')?.addEventListener('change', (e) => {
            S.shippingCost = parseFmt(e.target.value);
            e.target.value = fmt(S.shippingCost);
            renderSummary();
        });

        // Payment amount input
        $('returnPaymentAmount')?.addEventListener('change', (e) => {
            S.paymentAmount = parseFmt(e.target.value);
            e.target.value = fmt(S.paymentAmount);
        });

        // Payment method
        $('returnPaymentMethod')?.addEventListener('change', (e) => {
            S.paymentMethodId = parseInt(e.target.value);
        });

        // Supplier search
        initSupplierSearchEvents();

        // Close dropdown on outside click
        document.addEventListener('click', (e) => {
            const dropdown = $('returnSupplierDropdown');
            const wrapper = $('returnSupplierWrapper');
            if (dropdown && wrapper && !wrapper.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        // Event delegation: product list clicks
        $('returnProductList')?.addEventListener('click', (e) => {
            const row = e.target.closest('.return-product-row');
            if (row && row.dataset.productId) {
                _addProduct(parseInt(row.dataset.productId));
            }
        });

        // Event delegation: pagination clicks
        $('returnProductPagination')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-page');
            if (btn && btn.dataset.page) {
                _goProductPage(parseInt(btn.dataset.page));
            }
        });

        // Event delegation: order lines table (qty, price, remove)
        const orderLinesTable = $('returnOrderLines');
        if (orderLinesTable) {
            orderLinesTable.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.btn-remove-line');
                if (removeBtn && removeBtn.dataset.line != null) {
                    removeLine(parseInt(removeBtn.dataset.line));
                }
            });
            orderLinesTable.addEventListener('change', (e) => {
                const input = e.target;
                const lineIdx = parseInt(input.dataset.line);
                if (isNaN(lineIdx)) return;
                if (input.dataset.field === 'qty') {
                    updateLineQty(lineIdx, input.value);
                } else if (input.dataset.field === 'price') {
                    updateLinePrice(lineIdx, input.value);
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            const modal = $('returnOrderModal');
            if (!modal || !modal.classList.contains('show')) return;

            if (e.key === 'Escape') {
                close();
                e.preventDefault();
            }
            if (e.key === 'F2') {
                $('returnProductSearch')?.focus();
                e.preventDefault();
            }
        });
    }

    // =====================================================
    // MARKUP INJECTION — template lives in shared/js/return-order-markup.js (window.ReturnOrderMarkup.MODAL_HTML)
    // =====================================================

    let _markupInjected = false;
    let _eventsInited = false;

    function ensureMarkup() {
        if (_markupInjected || document.getElementById('returnOrderModal')) {
            _markupInjected = true;
            return;
        }
        if (!window.ReturnOrderMarkup?.MODAL_HTML) {
            throw new Error(
                'ReturnOrderMarkup not loaded — include shared/js/return-order-markup.js before return-order-modal.js'
            );
        }
        const wrap = document.createElement('div');
        wrap.innerHTML = window.ReturnOrderMarkup.MODAL_HTML.trim();
        document.body.appendChild(wrap.firstElementChild);
        _markupInjected = true;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function ensureEventsBound() {
        if (_eventsInited) return;
        if (!document.getElementById('returnOrderModal')) return;
        initEvents();
        _eventsInited = true;
    }

    // Auto-init on DOM ready ONLY if markup already exists (back-compat with supplier-debt).
    // For host pages that call ensureMarkup() later, events are bound by ensureEventsBound().
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('returnOrderModal')) {
            _markupInjected = true;
            ensureEventsBound();
        }
    });

    // =====================================================
    // PUBLIC API
    // =====================================================

    function _openPublic(supplierData) {
        ensureMarkup();
        ensureEventsBound();
        return open(supplierData);
    }

    function _closePublic() {
        _emit('close', null);
        return close();
    }

    return {
        ensureMarkup,
        open: _openPublic,
        close: _closePublic,
        onSuccess(fn) {
            if (typeof fn === 'function') _hooks.success.push(fn);
        },
        onClose(fn) {
            if (typeof fn === 'function') _hooks.close.push(fn);
        },
        // Backwards-compat exposed for inline handlers (supplier dropdown, discount)
        _selectSupplier,
        _clearSupplier,
        _setDiscount,
    };
})();
