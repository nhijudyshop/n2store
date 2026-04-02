/**
 * Return Order Modal - Trả hàng nhà cung cấp
 * Mimics TPOS fastpurchaseorder/refundform1
 * Depends on: tposFetch() from main.js, window.tokenManager, window.notificationManager
 */

window.ReturnOrderModal = (function () {
    'use strict';

    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const PRODUCTS_PER_PAGE = 50;

    // =====================================================
    // STATIC CONFIG (from tpos-purchase.js)
    // =====================================================

    const STATIC_USER_ID = 'ae5c70a1-898c-4e9f-b248-acc10b7036bc';

    function getCompanyId() {
        return window.ShopConfig?.getConfig()?.CompanyId || 1;
    }

    const COMPANY_CONFIG = {
        1: {
            JournalId: 4, AccountId: 4, PickingTypeId: 1, PaymentJournalId: 1,
            Company: { Id: 1, Name: 'NJD Live', Sender: 'Tổng đài:19003357', Phone: '19003357', Street: '39/9A đường TMT 9A, Khu phố 2, Phường Trung Mỹ Tây, Quận 12, Hồ Chí Minh', CurrencyId: 1, Active: true, AllowSaleNegative: true, Customer: false, Supplier: false, DepositAccountId: 11, DeliveryCarrierId: 7, City: { name: 'Thành phố Hồ Chí Minh', code: '79' }, District: { name: 'Quận 12', code: '761', cityCode: '79' }, Ward: { name: 'Phường Trung Mỹ Tây', code: '26785', cityCode: '79', districtCode: '761' } },
            User: { Id: STATIC_USER_ID, Email: 'nvkt@gmail.com', Name: 'nvkt', UserName: 'nvkt', CompanyId: 1, CompanyName: 'NJD Live', Active: true },
            Journal: { Id: 4, Name: 'Nhật ký mua hàng', Type: 'purchase', TypeGet: 'Mua hàng', UpdatePosted: true, DedicatedRefund: false },
            PaymentJournal: { Id: 1, Name: 'Tiền mặt', Type: 'cash', TypeGet: 'Tiền mặt', UpdatePosted: true },
            PickingType: { Id: 1, Code: 'incoming', Name: 'Nhận hàng', Active: true, WarehouseId: 1, UseCreateLots: true, UseExistingLots: true, NameGet: 'Nhi Judy Store: Nhận hàng' },
            Account: { Id: 4, Name: 'Phải trả người bán', Code: '331', Active: true, NameGet: '331 Phải trả người bán', Reconcile: false }
        },
        2: {
            JournalId: 11, AccountId: 32, PickingTypeId: 5, PaymentJournalId: 8,
            Company: { Id: 2, Name: 'NJD Shop', Sender: 'Tổng đài:19003357', Phone: '19003357', Street: '39/9A đường TMT 9A, Khu phố 2, Phường Trung Mỹ Tây, Quận 12, Hồ Chí Minh', CurrencyId: 1, Active: true, AllowSaleNegative: true, Customer: false, Supplier: false, DepositAccountId: 11, DeliveryCarrierId: 7, City: { name: 'Thành phố Hồ Chí Minh', code: '79' }, District: { name: 'Quận 12', code: '761', cityCode: '79' }, Ward: { name: 'Phường Trung Mỹ Tây', code: '26785', cityCode: '79', districtCode: '761' } },
            User: { Id: STATIC_USER_ID, Email: 'nvkt@gmail.com', Name: 'nvkt', UserName: 'nvkt', CompanyId: 2, CompanyName: 'NJD Shop', Active: true },
            Journal: { Id: 11, Name: 'Nhật ký mua hàng', Type: 'purchase', TypeGet: 'Mua hàng', UpdatePosted: true, DedicatedRefund: false },
            PaymentJournal: { Id: 8, Name: 'Tiền mặt', Type: 'cash', TypeGet: 'Tiền mặt', UpdatePosted: true },
            PickingType: { Id: 5, Code: 'incoming', Name: 'Nhận hàng', Active: true, WarehouseId: 2, UseCreateLots: true, UseExistingLots: true, NameGet: 'Shop NJD: Nhận hàng' },
            Account: { Id: 32, Name: 'Phải trả người bán', Code: '331', Active: true, NameGet: '331 Phải trả người bán', Reconcile: false }
        }
    };

    function getConfig() {
        return COMPANY_CONFIG[getCompanyId()] || COMPANY_CONFIG[1];
    }

    function toVNDateString(date) {
        const d = date || new Date();
        const offset = 7 * 60;
        const local = new Date(d.getTime() + offset * 60000);
        return local.toISOString().replace('Z', '') + '+07:00';
    }

    // =====================================================
    // STATE
    // =====================================================

    const S = {
        products: [],
        productPage: 1,
        productTotal: 0,
        searchQuery: '',
        categoryFilter: '',
        sortBy: 'DateCreated desc',
        isLoadingProducts: false,
        orderLines: [],         // { product, quantity, price, productId, uom, uomId, accountId }
        selectedSupplier: null, // { Id, Name, Ref, DisplayName }
        suppliers: [],
        paymentMethods: [],
        orderDate: null,
        paymentMethodId: null,
        shippingCost: 0,
        paymentAmount: 0,
        discountAmount: 0,
        isSubmitting: false,
        searchDebounce: null
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

    function $(id) { return document.getElementById(id); }

    // =====================================================
    // PRODUCT CATALOG
    // =====================================================

    async function fetchProducts(page = 1) {
        if (S.isLoadingProducts) return;
        S.isLoadingProducts = true;
        S.productPage = page;

        const grid = $('returnProductList');
        if (grid) {
            grid.innerHTML = `<div class="return-product-loading"><svg class="spin" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Đang tải...</div>`;
        }

        try {
            const skip = (page - 1) * PRODUCTS_PER_PAGE;
            let url = `${PROXY_URL}/api/odata/ProductTemplate/ODataService.GetViewV2?Active=true&$top=${PRODUCTS_PER_PAGE}&$skip=${skip}&$count=true&$orderby=${encodeURIComponent(S.sortBy)}`;

            // Search filter
            if (S.searchQuery) {
                const q = S.searchQuery.trim();
                url += `&$filter=${encodeURIComponent(`contains(NameGet,'${q}') or contains(DefaultCode,'${q}') or contains(Barcode,'${q}')`)}`;
            }

            const response = await tposFetch(url, {
                headers: { 'feature-version': '2', 'x-tpos-lang': 'vi' }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            S.products = data.value || [];
            S.productTotal = data['@odata.count'] || S.products.length;
            renderProductList();
            renderProductPagination();
        } catch (err) {
            console.error('[ReturnOrder] fetchProducts error:', err);
            if (grid) grid.innerHTML = `<div class="return-product-loading" style="color:#dc2626;">Lỗi tải sản phẩm: ${err.message}</div>`;
        } finally {
            S.isLoadingProducts = false;
        }
    }

    function renderProductList() {
        const list = $('returnProductList');
        if (!list) return;

        if (!S.products.length) {
            list.innerHTML = '<div class="return-product-loading">Không có sản phẩm</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        S.products.forEach(p => {
            const code = p.DefaultCode || '';
            const name = p.NameGet || p.Name || '';
            const unit = p.UOMName || 'Cái';
            const price = p.PurchasePrice || p.ListPrice || 0;
            const stock = p.QtyAvailable ?? 0;
            const forecast = p.VirtualAvailable ?? 0;
            const imageUrl = p.ImageUrl;

            const stockClass = stock > 0 ? 'stock-value' : (stock === 0 ? 'stock-zero' : 'stock-negative');
            const forecastClass = forecast > 0 ? 'stock-value' : (forecast < 0 ? 'stock-negative' : 'stock-zero');

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
                    <div class="return-product-stock">Tồn kho: <span class="${stockClass}">${fmt(stock)}</span> / Tồn dự báo: <span class="${forecastClass}">${fmt(forecast)}</span></div>
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
        if (S.productPage > 1) html += `<button class="btn-page" data-page="${S.productPage - 1}">&laquo;</button>`;

        const start = Math.max(1, S.productPage - 2);
        const end = Math.min(totalPages, start + 4);
        for (let i = start; i <= end; i++) {
            html += `<button class="btn-page ${i === S.productPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        if (S.productPage < totalPages) html += `<button class="btn-page" data-page="${S.productPage + 1}">&raquo;</button>`;
        html += `<span class="return-product-page-info">${S.productTotal} SP</span>`;

        wrap.innerHTML = html;
    }

    function _goProductPage(page) {
        fetchProducts(page);
    }

    // =====================================================
    // ADD / REMOVE / EDIT ORDER LINES
    // =====================================================

    function _addProduct(productId) {
        const product = S.products.find(p => p.Id === productId);
        if (!product) return;

        // Check if already in order
        const existing = S.orderLines.find(l => l.productId === productId);
        if (existing) {
            existing.quantity += 1;
            renderOrderLines();
            return;
        }

        S.orderLines.push({
            productId: product.Id,
            product: product,
            name: product.NameGet || product.Name || '',
            code: product.DefaultCode || '',
            quantity: 1,
            price: product.PurchasePrice || product.ListPrice || 0,
            uom: product.UOMName || 'Cái',
            uomId: product.UOMId || 1,
            accountId: getConfig().AccountId
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
            if (totalCell) totalCell.textContent = fmt(S.orderLines[index].quantity * S.orderLines[index].price);
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

        tbody.innerHTML = S.orderLines.map((line, i) => `
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
        `).join('');

        renderSummary();
    }

    function renderSummary() {
        const summary = $('returnOrderSummary');
        if (!summary) return;

        let totalQty = 0, totalAmount = 0;
        S.orderLines.forEach(l => {
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

    async function fetchSuppliers() {
        // Reuse from main.js State if available
        if (window.State && window.State.allSuppliers && window.State.allSuppliers.length > 0) {
            S.suppliers = window.State.allSuppliers.map(s => ({
                Id: s.PartnerId,
                Name: s.Name,
                Ref: s.Code,
                DisplayName: `[${s.Code}] ${s.Name}`
            }));
            return;
        }

        try {
            const url = `${PROXY_URL}/api/odata/Partner?$filter=Supplier eq true and Active eq true&$top=500&$orderby=Name asc&$select=Id,Name,Ref,DisplayName`;
            const resp = await tposFetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            S.suppliers = (data.value || []).map(s => ({
                Id: s.Id,
                Name: s.Name,
                Ref: s.Ref || '',
                DisplayName: s.DisplayName || `[${s.Ref || ''}] ${s.Name}`
            }));
        } catch (err) {
            console.error('[ReturnOrder] fetchSuppliers error:', err);
        }
    }

    function renderSupplierDropdown(query) {
        const dropdown = $('returnSupplierDropdown');
        if (!dropdown) return;

        const q = (query || '').toLowerCase();
        const filtered = q
            ? S.suppliers.filter(s => s.DisplayName.toLowerCase().includes(q) || (s.Ref || '').toLowerCase().includes(q))
            : S.suppliers.slice(0, 30);

        if (!filtered.length) {
            dropdown.style.display = 'none';
            return;
        }

        dropdown.innerHTML = filtered.slice(0, 30).map(s =>
            `<div class="dropdown-item" onclick="ReturnOrderModal._selectSupplier(${s.Id})">${escHtml(s.DisplayName)}</div>`
        ).join('');
        dropdown.style.display = 'block';
    }

    function _selectSupplier(id) {
        const supplier = S.suppliers.find(s => s.Id === id);
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
        try {
            const url = `${PROXY_URL}/api/odata/AccountJournal?$filter=${encodeURIComponent("Type eq 'cash' or Type eq 'bank'")}&$select=Id,Name,Type`;
            const resp = await tposFetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            // Deduplicate by Name (API can return duplicates across companies)
            const seen = new Set();
            S.paymentMethods = (data.value || []).filter(m => {
                if (seen.has(m.Name)) return false;
                seen.add(m.Name);
                return true;
            });
            renderPaymentMethods();
        } catch (err) {
            console.error('[ReturnOrder] fetchPaymentMethods error:', err);
            S.paymentMethods = [{ Id: 8, Name: 'Ngân hàng', Type: 'bank' }, { Id: 1, Name: 'Tiền mặt', Type: 'cash' }];
            renderPaymentMethods();
        }
    }

    function renderPaymentMethods() {
        const select = $('returnPaymentMethod');
        if (!select) return;

        // Default to bank
        select.innerHTML = S.paymentMethods.map(m =>
            `<option value="${m.Id}" ${m.Type === 'bank' ? 'selected' : ''}>${escHtml(m.Name)}</option>`
        ).join('');

        if (S.paymentMethods.length > 0) {
            S.paymentMethodId = S.paymentMethods.find(m => m.Type === 'bank')?.Id || S.paymentMethods[0].Id;
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
                orderDate = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
            }
            const paymentMethodSelect = $('returnPaymentMethod');
            const paymentMethodId = paymentMethodSelect ? parseInt(paymentMethodSelect.value) : config.PaymentJournalId;
            const paymentMethod = S.paymentMethods.find(m => m.Id === paymentMethodId) || { Id: config.PaymentJournalId, Name: 'Tiền mặt', Type: 'cash', TypeGet: 'Tiền mặt' };
            const shippingCost = parseFmt($('returnShippingCost')?.value);
            const paymentAmount = parseFmt($('returnPaymentAmount')?.value);

            // Calculate totals
            let amountTotal = 0;
            S.orderLines.forEach(l => { amountTotal += l.quantity * l.price; });
            const finalAmount = amountTotal - S.discountAmount + shippingCost;

            // Build Partner object
            const partner = {
                Id: S.selectedSupplier.Id,
                Name: S.selectedSupplier.Name,
                DisplayName: S.selectedSupplier.DisplayName,
                Ref: S.selectedSupplier.Ref,
                Supplier: true,
                Customer: false,
                Active: true,
                Type: 'contact',
                CompanyType: 'person',
                Status: 'Normal',
                StatusText: 'Bình thường',
                Source: 'Default'
            };

            // Build payload
            const payload = {
                Id: 0,
                Name: null,
                PartnerId: S.selectedSupplier.Id,
                PartnerDisplayName: null,
                State: 'draft',
                Date: null,
                PickingTypeId: config.PickingTypeId,
                AmountTotal: finalAmount,
                TotalQuantity: 0,
                Amount: null,
                Discount: 0,
                DiscountAmount: 0,
                DecreaseAmount: S.discountAmount,
                AmountTax: 0,
                AmountUntaxed: amountTotal,
                TaxId: null,
                Note: '',
                CompanyId: getCompanyId(),
                JournalId: config.JournalId,
                DateInvoice: toVNDateString(orderDate),
                Number: null,
                Type: 'refund',
                Residual: null,
                RefundOrderId: null,
                Reconciled: null,
                AccountId: config.AccountId,
                UserId: STATIC_USER_ID,
                AmountTotalSigned: null,
                ResidualSigned: null,
                ShowState: 'Nháp',
                UserName: null,
                PartnerNameNoSign: null,
                PaymentJournalId: paymentMethodId,
                PaymentAmount: paymentAmount,
                Origin: null,
                CompanyName: null,
                PartnerPhone: null,
                Address: null,
                DateCreated: toVNDateString(now),
                TaxView: null,
                CostsIncurred: shippingCost,
                VatInvoiceNumber: null,
                ExchangeRate: null,
                DestConvertCurrencyUnitId: null,
                FormAction: formAction,
                PaymentInfo: [],
                Error: null,

                // Nested objects
                Company: config.Company,
                PickingType: config.PickingType,
                Journal: config.Journal,
                User: config.User,
                PaymentJournal: { ...paymentMethod, UpdatePosted: true },
                DestConvertCurrencyUnit: null,
                Partner: partner,
                Account: config.Account,

                // Order lines
                OrderLines: S.orderLines.map(line => ({
                    ProductUOM: { Id: line.uomId, Name: line.uom },
                    Name: line.name,
                    Account: config.Account,
                    PriceUnit: line.price,
                    AccountId: config.AccountId,
                    PriceRecent: line.price,
                    ProductQty: line.quantity,
                    Product: line.product,
                    ProductId: line.productId,
                    ProductUOMId: line.uomId,
                    Discount: 0,
                    PriceSubTotal: line.quantity * line.price
                }))
            };

            console.log('[ReturnOrder] Submitting return order:', payload);

            const url = `${PROXY_URL}/api/odata/FastPurchaseOrder`;
            const response = await tposFetch(url, {
                method: 'POST',
                headers: { 'feature-version': '2' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}: ${errText}`);
            }

            const result = await response.json();
            console.log('[ReturnOrder] Return order created:', result.Id, result.Number, result.ShowState);

            if (loadingId) window.notificationManager?.remove?.(loadingId);
            window.notificationManager?.success(`Đã tạo đơn trả hàng: ${result.Number || result.Id}`);

            close();

            // Refresh supplier debt data if available
            if (typeof fetchData === 'function') {
                fetchData();
            }

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

    function open(supplierData) {
        resetState();

        // Pre-fill supplier if provided
        if (supplierData) {
            _selectSupplier(supplierData.Id || supplierData.PartnerId);
        }

        const modal = $('returnOrderModal');
        if (modal) modal.classList.add('show');

        // Set default date (date only, time uses current machine time on submit)
        const dateInput = $('returnOrderDate');
        if (dateInput) {
            const now = new Date();
            dateInput.value = now.toISOString().slice(0, 10);
        }

        // Load data
        fetchProducts();
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
        $('btnReturnConfirmPrint')?.addEventListener('click', () => submitReturn('SaveAndPrint'));
        $('btnReturnConfirmView')?.addEventListener('click', () => submitReturn('SaveAndPrint'));
        $('btnReturnSave')?.addEventListener('click', () => submitReturn('Save'));

        // Product search
        const searchInput = $('returnProductSearch');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(S.searchDebounce);
                S.searchDebounce = setTimeout(() => {
                    S.searchQuery = searchInput.value.trim();
                    fetchProducts(1);
                }, 400);
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

    // Init on DOM ready
    document.addEventListener('DOMContentLoaded', initEvents);

    // =====================================================
    // PUBLIC API
    // =====================================================

    return {
        open,
        close,
        // Exposed for inline handlers still in use (supplier dropdown, discount)
        _selectSupplier,
        _clearSupplier,
        _setDiscount
    };
})();
