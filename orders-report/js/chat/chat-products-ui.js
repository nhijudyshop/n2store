// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   CHAT PRODUCTS UI
   Renders product panel in chat modal:
   - Tab Đơn hàng: main + held products table
   - Product search (inline)
   - Total, count, BASE status
   ===================================================== */

(function () {
    'use strict';

    // Order details cache (5 min TTL)
    const orderDetailsCache = new Map();
    const CACHE_TTL = 5 * 60 * 1000;

    // Search debounce
    let searchDebounceTimer = null;
    const SEARCH_DEBOUNCE_MS = 300;

    // =====================================================
    // PANEL TOGGLE
    // =====================================================

    window.toggleChatPanel = function () {
        const panel = document.getElementById('chatRightPanel');
        const resizeHandle = document.getElementById('chatPanelResizeHandle');
        const toggleBtn = document.querySelector('.chat-panel-toggle-btn');

        if (!panel) return;

        const isCollapsed = panel.classList.toggle('collapsed');

        if (resizeHandle) {
            resizeHandle.style.display = isCollapsed ? 'none' : '';
        }
        if (toggleBtn) {
            toggleBtn.classList.toggle('active', !isCollapsed);
        }
    };

    // =====================================================
    // PANEL RESIZE (drag to resize)
    // =====================================================

    (function initPanelResize() {
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        document.addEventListener('mousedown', function (e) {
            const handle = e.target.closest('#chatPanelResizeHandle');
            if (!handle) return;

            const panel = document.getElementById('chatRightPanel');
            if (!panel || panel.classList.contains('collapsed')) return;

            isResizing = true;
            startX = e.clientX;
            startWidth = panel.offsetWidth;
            handle.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', function (e) {
            if (!isResizing) return;

            const panel = document.getElementById('chatRightPanel');
            if (!panel) return;

            // Dragging left = panel wider, dragging right = panel narrower
            const delta = startX - e.clientX;
            let newWidth = startWidth + delta;

            // Clamp between min and max
            const modalBody = panel.closest('.chat-modal-body');
            const maxWidth = modalBody ? modalBody.offsetWidth * 0.65 : 800;
            newWidth = Math.max(350, Math.min(newWidth, maxWidth));

            panel.style.width = newWidth + 'px';
        });

        document.addEventListener('mouseup', function () {
            if (!isResizing) return;
            isResizing = false;

            const handle = document.getElementById('chatPanelResizeHandle');
            if (handle) handle.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // Save width preference
            const panel = document.getElementById('chatRightPanel');
            if (panel) {
                try {
                    localStorage.setItem('chatPanelWidth', panel.style.width);
                } catch (e) {
                    /* ignore */
                }
            }
        });

        // Restore saved width on page load
        try {
            const savedWidth = localStorage.getItem('chatPanelWidth');
            if (savedWidth) {
                const panel = document.getElementById('chatRightPanel');
                if (panel) panel.style.width = savedWidth;
            }
        } catch (e) {
            /* ignore */
        }
    })();

    // =====================================================
    // LOAD ORDER DATA
    // =====================================================

    /**
     * Load order details for current chat and render
     * Called when openChatModal opens a new order
     */
    window.loadChatOrderProducts = async function (orderId) {
        if (!orderId) {
            console.warn('[ChatProducts-UI] loadChatOrderProducts called without orderId');
            return;
        }

        const container = document.getElementById('chatProductsTableContainer');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #94a3b8;">
                    <div class="loading-spinner" style="width:24px;height:24px;border:3px solid #e5e7eb;border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 10px;"></div>
                    <p style="font-size:13px;">Đang tải sản phẩm...</p>
                </div>`;
        }

        try {
            // Get order details from API or cache
            const orderData = await getOrderDetailsWithCache(orderId);

            if (!orderData) {
                console.warn('[ChatProducts-UI] No order data returned for:', orderId);
                if (container) {
                    container.innerHTML =
                        '<div class="chat-empty-products"><i class="fas fa-exclamation-triangle"></i><p>Không tải được dữ liệu đơn hàng</p></div>';
                }
                return;
            }

            // Store globally for other modules
            window.currentChatOrderData = orderData;
            window.currentChatOrderData.Details = orderData.Details || [];

            // Enrich product details with display info from API response
            window.currentChatOrderData.Details.forEach((d) => {
                if (!d.ProductNameGet && d.ProductName) {
                    d.ProductNameGet = d.ProductName;
                }
            });

            // Setup held products listener
            if (typeof window.setupHeldProductsListener === 'function') {
                window.setupHeldProductsListener();
            }

            // Render
            renderChatProductsTable();

            // Check BASE status
            updateBaseStatus(orderId);
        } catch (error) {
            console.error('[ChatProducts-UI] Error loading order:', error);
            if (container) {
                container.innerHTML =
                    '<div class="chat-empty-products"><i class="fas fa-exclamation-triangle"></i><p>Lỗi tải dữ liệu: ' +
                    error.message +
                    '</p></div>';
            }
        }
    };

    /**
     * Get order details with caching
     */
    async function getOrderDetailsWithCache(orderId) {
        // Check cache
        const cached = orderDetailsCache.get(orderId);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return JSON.parse(JSON.stringify(cached.data));
        }

        // Fetch from API (use tab1-merge.js's getOrderDetails if available)
        let data;
        if (typeof window.getOrderDetails === 'function') {
            data = await window.getOrderDetails(orderId);
        } else if (typeof getOrderDetails === 'function') {
            data = await getOrderDetails(orderId);
        } else {
            // Direct fetch
            const headers = await window.tokenManager.getAuthHeader();
            const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
            const response = await API_CONFIG.smartFetch(apiUrl, {
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            data = await response.json();
        }

        // Cache result
        orderDetailsCache.set(orderId, {
            data: JSON.parse(JSON.stringify(data)),
            timestamp: Date.now(),
        });
        return data;
    }

    /**
     * Invalidate cache for an order
     */
    window.invalidateOrderDetailsCache = function (orderId) {
        orderDetailsCache.delete(orderId);
    };

    // =====================================================
    // RENDER PRODUCTS TABLE
    // =====================================================

    /**
     * Render the products table in the orders tab
     * Shows both main products (confirmed) and held products (pending)
     */
    window.renderChatProductsTable = function () {
        const container = document.getElementById('chatProductsTableContainer');
        if (!container) return;

        const orderData = window.currentChatOrderData;
        if (!orderData || !orderData.Details) {
            container.innerHTML =
                '<div class="chat-empty-products"><i class="fas fa-box-open"></i><p>Chưa có sản phẩm trong đơn</p></div>';
            updateOrderCounts(0, 0);
            return;
        }

        const details = orderData.Details;
        const mainProducts = details.filter((p) => !p.IsHeld);
        const heldProducts = details.filter((p) => p.IsHeld);

        if (details.length === 0) {
            container.innerHTML =
                '<div class="chat-empty-products"><i class="fas fa-box-open"></i><p>Chưa có sản phẩm trong đơn</p></div>';
            updateOrderCounts(0, 0);
            return;
        }

        let html = '<table class="chat-products-table"><tbody>';

        // 1. Render held products FIRST (on top)
        if (heldProducts.length > 0) {
            html += `<tr><td colspan="3" style="padding: 4px 10px; background: #fef9c3; text-align: center; font-size: 11px; color: #d97706; font-weight: 600; border-bottom: 1px solid #fde047;">
                <i class="fas fa-clock"></i> Sản phẩm đang giữ (chưa xác nhận)
            </td></tr>`;
        }

        heldProducts.forEach((p, i) => {
            html += renderHeldProductRow(p, i);
        });

        // 2. Render main products SECOND
        if (mainProducts.length > 0 && heldProducts.length > 0) {
            html += `<tr><td colspan="3" style="padding: 4px 10px; background: #f3f4f6; text-align: center; font-size: 11px; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb; border-top: 1px solid #e5e7eb;">
                <i class="fas fa-check-circle"></i> Sản phẩm chính thức
            </td></tr>`;
        }

        mainProducts.forEach((p, i) => {
            html += renderMainProductRow(p, i);
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // Update counts and totals
        const totalAmount = mainProducts.reduce(
            (sum, p) => sum + (p.Quantity || 0) * (p.Price || 0),
            0
        );
        const totalHeldAmount = heldProducts.reduce(
            (sum, p) => sum + (p.Quantity || 0) * (p.Price || 0),
            0
        );
        const totalQuantity = details.reduce((sum, p) => sum + (p.Quantity || 0), 0);

        updateOrderCounts(totalQuantity, totalAmount + totalHeldAmount);
    };

    /**
     * Render a main product row (confirmed, on API)
     */
    function renderMainProductRow(p, index) {
        const productName = p.ProductNameGet || p.ProductName || p.Name || 'Sản phẩm';
        const productCode = p.ProductCode || p.Code || '';
        const imgUrl = p.ImageUrl || '';
        const imgHtml = imgUrl
            ? `<img src="${imgUrl}" class="chat-product-image" onclick="window.showImageZoom && showImageZoom('${imgUrl.replace(/'/g, "\\'")}')" oncontextmenu="window.sendImageToChat && sendImageToChat('${imgUrl.replace(/'/g, "\\'")}', '${productName.replace(/'/g, "\\'")}', ${p.ProductId}); return false;" title="Click: Xem ảnh | Chuột phải: Gửi ảnh">`
            : `<div class="chat-product-image" style="background: linear-gradient(135deg, #6366f1, #818cf8); display: flex; align-items: center; justify-content: center;"><i class="fas fa-box" style="color: white; font-size: 16px;"></i></div>`;

        return `
        <tr class="chat-product-row" data-product-id="${p.ProductId}">
            <td style="width: 48px;">${imgHtml}</td>
            <td class="chat-product-info-cell">
                <div class="chat-product-name" title="${productName}">${productName}</div>
                <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px; flex-wrap: wrap;">
                    <span class="chat-main-badge"><i class="fas fa-check-circle"></i> Chính</span>
                    ${productCode ? `<span style="font-size: 10px; color: #6b7280;">Mã: ${productCode}</span>` : ''}
                </div>
                <input type="text" class="chat-product-note" value="${(p.Note || '').replace(/"/g, '&quot;')}" placeholder="Ghi chú"
                    onblur="window.updateChatProductNote(${p.ProductId}, this.value)">
                <div style="font-size: 12px; color: #3b82f6; font-weight: 600; margin-top: 2px;">
                    ${(p.Price || 0).toLocaleString('vi-VN')}đ
                    <span style="color: #3b82f6; cursor: pointer; margin-left: 4px;" onclick="window.sendProductToChat && sendProductToChat(${p.ProductId}, '${productName.replace(/'/g, "\\'")}')" title="Gửi vào chat">
                        <i class="fas fa-paper-plane" style="font-size: 10px;"></i>
                    </span>
                </div>
            </td>
            <td style="text-align: center; width: 70px;">
                <div class="chat-quantity-controls">
                    <button class="chat-qty-btn" onclick="window.decreaseMainProductQuantityById(${p.ProductId})" title="Giảm số lượng">
                        <i class="fas fa-minus"></i>
                    </button>
                    <span style="font-size: 14px; font-weight: 700; min-width: 20px; text-align: center;">${p.Quantity || 0}</span>
                </div>
            </td>
        </tr>`;
    }

    /**
     * Render a held product row (pending confirmation)
     */
    function renderHeldProductRow(p, index) {
        const productName = p.ProductNameGet || p.ProductName || p.Name || 'Sản phẩm';
        const productCode = p.ProductCode || p.Code || '';
        const imgUrl = p.ImageUrl || '';
        const heldBy = p.HeldBy || '';
        const isDraft = p.isDraft === true;
        const isFromDropped = p.IsFromDropped === true;
        const imgHtml = imgUrl
            ? `<img src="${imgUrl}" class="chat-product-image" onclick="window.showImageZoom && showImageZoom('${imgUrl.replace(/'/g, "\\'")}')" oncontextmenu="window.sendImageToChat && sendImageToChat('${imgUrl.replace(/'/g, "\\'")}', '${productName.replace(/'/g, "\\'")}', ${p.ProductId}); return false;" title="Click: Xem ảnh | Chuột phải: Gửi ảnh">`
            : `<div class="chat-product-image" style="background: linear-gradient(135deg, #f59e0b, #fbbf24); display: flex; align-items: center; justify-content: center;"><i class="fas fa-box" style="color: white; font-size: 16px;"></i></div>`;

        return `
        <tr class="chat-product-row held-product" data-product-id="${p.ProductId}">
            <td style="width: 48px;">${imgHtml}</td>
            <td class="chat-product-info-cell">
                <div class="chat-product-name held" title="${productName}">${productName}</div>
                <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 2px;">
                    <span class="chat-held-badge${isDraft ? ' saved' : ''}">
                        <i class="fas fa-${isDraft ? 'save' : 'clock'}"></i> ${isDraft ? 'Đã lưu' : 'Tạm giữ'}
                    </span>
                    ${productCode ? `<span style="font-size: 10px; color: #6b7280;">Mã: ${productCode}</span>` : ''}
                </div>
                ${heldBy ? `<div style="font-size: 10px; color: #d97706;"><i class="fas fa-user"></i> ${heldBy}</div>` : ''}
                <div style="font-size: 12px; color: #d97706; font-weight: 600; margin-top: 2px;">${(p.Price || 0).toLocaleString('vi-VN')}đ</div>
            </td>
            <td style="text-align: center; width: 110px;">
                <div class="chat-quantity-controls" style="margin-bottom: 4px;">
                    <button class="chat-qty-btn" onclick="window.updateHeldProductQuantityById(${p.ProductId}, -1)">
                        <i class="fas fa-minus"></i>
                    </button>
                    <input type="number" class="chat-quantity-input" value="${p.Quantity || 1}" min="1"
                        onchange="window.updateHeldProductQuantityById(${p.ProductId}, 0, parseInt(this.value))">
                    <button class="chat-qty-btn" onclick="window.updateHeldProductQuantityById(${p.ProductId}, 1)">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <div style="display: flex; gap: 4px; justify-content: center;">
                    <button class="chat-btn-product-action chat-btn-confirm" onclick="window.confirmHeldProduct(${p.ProductId})" title="Xác nhận thêm vào đơn">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="chat-btn-product-action chat-btn-delete-item" onclick="window.deleteHeldProduct(${p.ProductId})" title="Xóa sản phẩm giữ">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }

    /**
     * Update order counts and totals in UI
     */
    function updateOrderCounts(totalQuantity, totalAmount) {
        const badge = document.getElementById('chatOrdersCountBadge');
        if (badge) badge.textContent = totalQuantity;

        const totalEl = document.getElementById('chatProductTotal');
        if (totalEl) totalEl.textContent = `${totalAmount.toLocaleString('vi-VN')}đ`;

        const countEl = document.getElementById('productCount');
        if (countEl) countEl.textContent = totalQuantity;
    }

    /**
     * Update BASE status indicator
     */
    async function updateBaseStatus(orderId) {
        const statusEl = document.getElementById('chatBaseStatus');
        if (!statusEl) return;

        try {
            // Use REST API via kpiManager (Render PostgreSQL)
            const orderCode = (window.OrderStore?.get(orderId))?.Code || '';
            if (window.kpiManager && orderCode) {
                const hasBase = await window.kpiManager.checkKPIBaseExists(orderCode);
                if (hasBase) {
                    statusEl.textContent = 'Có BASE';
                    statusEl.classList.add('has-base');
                } else {
                    statusEl.textContent = 'Chưa có BASE';
                    statusEl.classList.remove('has-base');
                }
            }
        } catch (e) {
            console.warn('[ChatProducts-UI] Could not check BASE status:', e.message);
        }
    }

    // =====================================================
    // PRODUCT SEARCH (Inline in Orders tab)
    // =====================================================

    /**
     * Initialize product search in the orders tab
     */
    window.initChatProductSearch = function () {
        const input = document.getElementById('chatInlineProductSearch');
        if (!input) return;

        // Close dropdown on click outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('chatInlineSearchResults');
            const searchContainer = document.querySelector('.chat-order-search-container');
            if (dropdown && searchContainer && !searchContainer.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    };

    /**
     * Force-reload Excel product cache (latest file from TPOS)
     */
    window.reloadChatExcelProducts = async function () {
        const btn = document.getElementById('btnReloadChatExcel');
        if (!btn || btn.disabled) return;
        const icon = btn.querySelector('i');

        btn.disabled = true;
        if (icon) icon.className = 'fas fa-sync-alt fa-spin';

        try {
            if (!window.productSearchManager || typeof window.productSearchManager.fetchExcelProducts !== 'function') {
                throw new Error('productSearchManager không khả dụng');
            }
            await window.productSearchManager.fetchExcelProducts(true);

            if (window.notificationManager && typeof window.notificationManager.success === 'function') {
                window.notificationManager.success('Đã tải lại file Excel sản phẩm mới nhất');
            }

            const input = document.getElementById('chatInlineProductSearch');
            const query = input ? input.value.trim() : '';
            if (query.length >= 2 && typeof window.performChatProductSearch === 'function') {
                window.performChatProductSearch(query);
            }
        } catch (error) {
            console.error('[ChatProducts-UI] Reload Excel failed:', error);
            if (window.notificationManager && typeof window.notificationManager.error === 'function') {
                window.notificationManager.error('Tải lại Excel thất bại: ' + (error.message || error));
            }
        } finally {
            btn.disabled = false;
            if (icon) icon.className = 'fas fa-sync-alt';
        }
    };

    /**
     * Perform product search
     */
    window.performChatProductSearch = function (query) {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

        const dropdown = document.getElementById('chatInlineSearchResults');
        if (!dropdown) return;

        if (!query || query.trim().length < 2) {
            dropdown.style.display = 'none';
            return;
        }

        searchDebounceTimer = setTimeout(async () => {
            try {
                dropdown.innerHTML =
                    '<div style="padding: 12px; text-align: center; color: #94a3b8; font-size: 12px;">Đang tìm...</div>';
                dropdown.style.display = 'block';

                let results = [];

                // Use ProductSearchModule if available
                if (window.productSearchManager) {
                    // Try loading if not loaded yet
                    if (
                        !window.productSearchManager.isLoaded &&
                        typeof window.productSearchManager.fetchExcelProducts === 'function'
                    ) {
                        try {
                            await window.productSearchManager.fetchExcelProducts();
                        } catch (e) {
                            console.warn('[ChatProducts-UI] Could not load Excel data:', e.message);
                        }
                    }

                    if (
                        window.productSearchManager.isLoaded &&
                        typeof window.productSearchManager.search === 'function'
                    ) {
                        results = window.productSearchManager.search(query, 15);
                    } else {
                        // Fallback to API search
                        results = await searchProductsFromAPI(query);
                    }
                } else {
                    // Fallback to API search
                    results = await searchProductsFromAPI(query);
                }

                displayChatSearchResults(results, dropdown);
            } catch (error) {
                console.error('[ChatProducts-UI] Search error:', error);
                dropdown.innerHTML =
                    '<div style="padding: 12px; text-align: center; color: #ef4444; font-size: 12px;">Lỗi tìm kiếm</div>';
            }
        }, SEARCH_DEBOUNCE_MS);
    };

    /**
     * Search products from API (fallback)
     */
    async function searchProductsFromAPI(query) {
        const headers = await window.tokenManager.getAuthHeader();
        const encodedQuery = encodeURIComponent(query);
        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Product?$filter=contains(Name,'${encodedQuery}') or contains(DefaultCode,'${encodedQuery}')&$expand=UOM,Images&$top=15`;

        const response = await API_CONFIG.smartFetch(apiUrl, {
            headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' },
        });

        if (!response.ok) return [];
        const data = await response.json();
        return (data.value || []).map((p) => ({
            Id: p.Id,
            ProductId: p.Id,
            Name: p.Name,
            DefaultCode: p.DefaultCode || p.Barcode || '',
            ListPrice: p.PriceVariant || p.ListPrice || 0,
            ImageUrl: p.ImageUrl || (p.Images && p.Images[0]?.Url) || '',
            UOM: p.UOM,
            QtyAvailable: p.QtyAvailable || 0,
        }));
    }

    /**
     * Display search results in dropdown
     */
    function displayChatSearchResults(results, dropdown) {
        if (!results || results.length === 0) {
            dropdown.innerHTML =
                '<div style="padding: 12px; text-align: center; color: #94a3b8; font-size: 12px;">Không tìm thấy sản phẩm</div>';
            return;
        }

        // Check which products are already in the order
        const existingIds = new Set();
        if (window.currentChatOrderData?.Details) {
            window.currentChatOrderData.Details.forEach((d) => existingIds.add(d.ProductId));
        }

        dropdown.innerHTML = results
            .map((p) => {
                const productId = p.Id || p.ProductId;
                const name = p.NameGet || p.Name || '';
                const code = p.DefaultCode || p.Code || '';
                const price = p.PriceVariant || p.ListPrice || 0;
                const imgUrl = p.ImageUrl || '';
                const inOrder = existingIds.has(productId);

                return `
                <div class="chat-search-item" onclick="window.addChatProductFromSearch(${productId})">
                    ${imgUrl ? `<img src="${imgUrl}" class="chat-search-item-img" onerror="this.style.display='none'">` : '<div class="chat-search-item-img" style="background:#f1f5f9; display:flex; align-items:center; justify-content:center;"><i class="fas fa-box" style="color:#cbd5e1;"></i></div>'}
                    <div class="chat-search-item-info">
                        <div class="chat-search-item-name">${name}</div>
                        <div class="chat-search-item-code">${code}</div>
                    </div>
                    <div class="chat-search-item-price">${price.toLocaleString('vi-VN')}đ</div>
                    ${inOrder ? '<span class="chat-search-item-badge">Đã có</span>' : ''}
                </div>`;
            })
            .join('');
    }

    /**
     * Add product from search to held list
     */
    window.addChatProductFromSearch = async function (productId) {
        if (!productId || !window.currentChatOrderData) {
            console.warn('[ChatProducts-UI] No productId or no order data');
            return;
        }

        // Ensure Details array exists
        if (!window.currentChatOrderData.Details) {
            window.currentChatOrderData.Details = [];
        }

        // Check if already in held list → merge quantity
        const existingHeld = window.currentChatOrderData.Details.find(
            (p) => p.ProductId === productId && p.IsHeld
        );

        if (existingHeld) {
            existingHeld.Quantity = (existingHeld.Quantity || 1) + 1;
            renderChatProductsTable();

            // Sync to Firebase
            syncHeldToFirebase(productId, existingHeld.Quantity);

            if (window.notificationManager) {
                window.notificationManager.show('Đã tăng số lượng sản phẩm giữ', 'success');
            }
            return;
        }

        try {
            // Fetch full product details
            let fullProduct = null;
            if (window.productSearchManager) {
                fullProduct = await window.productSearchManager.getFullProductDetails(
                    productId,
                    true
                );
            }

            if (!fullProduct) {
                // Direct API fetch
                const headers = await window.tokenManager.getAuthHeader();
                const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Product(${productId})?$expand=UOM,Images`;
                const resp = await API_CONFIG.smartFetch(apiUrl, {
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                });
                if (resp.ok) fullProduct = await resp.json();
            }

            if (!fullProduct) {
                if (window.notificationManager)
                    window.notificationManager.error('Không tìm thấy thông tin sản phẩm');
                return;
            }

            // Get price
            const price = fullProduct.PriceVariant || fullProduct.ListPrice || 0;

            // Get image - try variant first, then template
            let imageUrl = fullProduct.ImageUrl || '';
            if (!imageUrl && fullProduct.Images && fullProduct.Images.length > 0) {
                imageUrl = fullProduct.Images[0].Url || '';
            }

            // Create held product
            const heldProduct = {
                ProductId: productId,
                ProductName: fullProduct.Name || '',
                ProductNameGet: fullProduct.NameGet || fullProduct.Name || '',
                ProductCode: fullProduct.DefaultCode || fullProduct.Barcode || '',
                ImageUrl: imageUrl,
                Price: price,
                Quantity: 1,
                UOMId: fullProduct.UOM?.Id || 1,
                UOMName: fullProduct.UOM?.Name || 'Cái',
                Factor: 1,
                Priority: 0,
                OrderId: window.currentChatOrderData.Id,
                LiveCampaign_DetailId: null,
                ProductWeight: 0,
                Note: null,
                IsHeld: true,
                IsFromSearch: true,
                IsFromDropped: false,
                StockQty: fullProduct.QtyAvailable || 0,
                HeldBy: getUserDisplayName(),
                Name: fullProduct.Name || '',
                Code: fullProduct.DefaultCode || fullProduct.Barcode || '',
            };

            // Add to Details
            window.currentChatOrderData.Details.push(heldProduct);

            // Sync to Firebase
            syncHeldToFirebase(productId, 1);

            // Render
            renderChatProductsTable();

            // Close search dropdown
            const dropdown = document.getElementById('chatInlineSearchResults');
            if (dropdown) dropdown.style.display = 'none';
            const input = document.getElementById('chatInlineProductSearch');
            if (input) input.value = '';

            if (window.notificationManager) {
                window.notificationManager.show(
                    `Đã thêm "${heldProduct.ProductNameGet}" vào danh sách giữ`,
                    'success'
                );
            }
        } catch (error) {
            console.error('[ChatProducts-UI] Error adding product:', error);
            if (window.notificationManager)
                window.notificationManager.error('Lỗi thêm sản phẩm: ' + error.message);
        }
    };

    /**
     * Sync held product to Firebase
     */
    async function syncHeldToFirebase(productId, quantity) {
        const orderId = window.currentChatOrderData?.Id;
        if (!orderId || !window.firebase || !window.authManager) return;

        try {
            const auth = window.authManager.getAuthState();
            if (!auth) return;

            let userId = auth.id || auth.Id || auth.username || auth.userType;
            if (!userId && auth.displayName) {
                userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');
            }
            if (!userId) return;

            const heldProduct = window.currentChatOrderData.Details.find(
                (p) => p.ProductId === productId && p.IsHeld
            );

            const ref = window.firebase
                .database()
                .ref(`held_products/${orderId}/${productId}/${userId}`);
            await ref.set({
                productId: productId,
                displayName: auth.displayName || auth.userType || 'Unknown',
                quantity: quantity,
                isDraft: false,
                isFromSearch: heldProduct?.IsFromSearch || false,
                timestamp: window.firebase.database.ServerValue.TIMESTAMP,
                campaignName: window.currentChatOrderData?.LiveCampaignName || '',
                stt: window.currentChatOrderData?.SessionIndex || '',
                productName: heldProduct?.ProductName || '',
                productNameGet: heldProduct?.ProductNameGet || '',
                productCode: heldProduct?.ProductCode || '',
                imageUrl: heldProduct?.ImageUrl || '',
                price: heldProduct?.Price || 0,
                uomName: heldProduct?.UOMName || 'Cái',
            });

        } catch (e) {
            console.error('[ChatProducts-UI] Firebase sync error:', e);
        }
    }

    // =====================================================
    // SEND TO CHAT HELPERS
    // =====================================================

    /**
     * Send product name/info to chat input
     */
    window.sendProductToChat = function (productId, productName) {
        const input = document.getElementById('chatInput');
        if (!input) return;

        input.value = productName;
        input.focus();
    };

    /**
     * Send order total to chat
     */
    window.sendOrderTotalToChat = function () {
        const totalEl = document.getElementById('chatProductTotal');
        if (!totalEl) return;

        const input = document.getElementById('chatInput');
        if (!input) return;

        input.value = `Tổng tiền đơn hàng: ${totalEl.textContent}`;
        input.focus();
    };

    /**
     * Send product image to chat via Pancake API
     * Downloads image → uploads via upload_contents → sends with content_ids
     */
    window.sendImageToChat = async function (imageUrl, productName, productId, productCode) {
        if (!imageUrl) {
            if (window.notificationManager) window.notificationManager.error('Sản phẩm không có ảnh');
            return;
        }
        if (!window.currentConversationId || !window.currentChatChannelId) {
            if (window.notificationManager) window.notificationManager.error('Chưa mở cuộc hội thoại');
            return;
        }

        const pdm = window.pancakeDataManager;
        if (!pdm) {
            if (window.notificationManager) window.notificationManager.error('PancakeDataManager chưa sẵn sàng');
            return;
        }

        try {
            if (window.notificationManager) window.notificationManager.info('Đang gửi ảnh...', 5000);

            const channelId = window.currentSendPageId || window.currentChatChannelId;
            const conversationId = window.currentConversationId;
            const pat = await pdm.getPageAccessToken(channelId);
            if (!pat) throw new Error('Không tìm thấy page_access_token');

            // Download image (use proxy for CORS-blocked TPOS images)
            const PROXY_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/image-proxy';
            const fetchUrl = imageUrl.includes('tpos.vn')
                ? `${PROXY_BASE}?url=${encodeURIComponent(imageUrl)}`
                : imageUrl;
            const resp = await fetch(fetchUrl);
            if (!resp.ok) throw new Error('Tải ảnh thất bại');
            const blob = await resp.blob();
            const ext = imageUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
            const file = new File([blob], `product-${productId || 'img'}.${ext}`, { type: blob.type || `image/${ext}` });

            // Upload via upload_contents API
            const uploadResult = await pdm.uploadMedia(channelId, file, pat);
            if (!uploadResult?.id) throw new Error('Upload không trả về content_id');

            // Send image with content_ids
            const sendResult = await pdm.sendMessage(channelId, conversationId, {
                action: 'reply_inbox', content_ids: [uploadResult.id]
            }, pat);

            if (sendResult?.success === false) {
                const errMsg = sendResult.message || '';
                const is24h = sendResult.e_code === 10 || errMsg.includes('khoảng thời gian cho phép');
                const is551 = sendResult.e_code === 551 || errMsg.includes('không có mặt');
                if (is24h || is551) {
                    if (window.notificationManager) window.notificationManager.show(is551 ? 'Lỗi #551: Khách không có mặt' : 'Không thể gửi (quá 24h)', 'warning', 5000);
                    return;
                }
                throw new Error(errMsg || 'Gửi ảnh thất bại');
            }

            if (window.notificationManager) window.notificationManager.success('Đã gửi ảnh!', 2000);

            // Mark as replied: clear pending_customers from DB + browser badge
            const psid = window.currentChatPSID;
            if (psid) {
                window.newMessagesNotifier?.clearPendingForCustomer(psid);
                const body = JSON.stringify({ psid, pageId: channelId || null });
                const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
                fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/mark-replied', opts).catch(() => {});
                fetch('https://n2store-realtime.onrender.com/api/realtime/mark-replied', opts).catch(() => {});
            }

            // Refresh messages after send
            setTimeout(async () => {
                try {
                    if (window.currentConversationId !== conversationId) return;
                    pdm.clearMessagesCache?.(channelId, conversationId);
                    const result = await pdm.fetchMessages(channelId, conversationId);
                    if (result.messages?.length > 0 && window.currentConversationId === conversationId) {
                        const messages = result.messages.map(msg => {
                            const isFromPage = msg.from?.id === channelId;
                            return {
                                id: msg.id,
                                text: msg.original_message || (msg.message || '').replace(/<[^>]+>/g, ''),
                                time: window._parseTimestamp?.(msg.inserted_at) || new Date(msg.inserted_at),
                                sender: isFromPage ? 'shop' : 'customer',
                                senderName: msg.from?.name || '',
                                fromId: msg.from?.id || '',
                                attachments: msg.attachments || [],
                                reactions: (msg.attachments || []).filter(a => a.type === 'reaction'),
                                reactionSummary: msg.reaction_summary || msg.reactions || null,
                                isHidden: msg.is_hidden || false,
                                isRemoved: msg.is_removed || false,
                                canHide: msg.can_hide !== false,
                                canRemove: msg.can_remove !== false,
                                canLike: msg.can_like !== false,
                                userLikes: msg.user_likes || false,
                                privateReplyConversation: msg.private_reply_conversation || null,
                            };
                        });
                        window.allChatMessages = messages;
                        if (window.renderChatMessages) window.renderChatMessages(messages);
                    }
                } catch (e) { /* ignore refresh error */ }
            }, 2000);

        } catch (error) {
            console.error('[ChatProducts] sendImageToChat error:', error);
            if (window.notificationManager) window.notificationManager.error('Lỗi gửi ảnh: ' + error.message);
        }
    };

    // =====================================================
    // CLEANUP ON MODAL CLOSE
    // =====================================================

    /**
     * Cleanup when chat modal closes
     */
    window.cleanupChatProducts = function () {
        // Cleanup held products listener
        if (typeof window.cleanupHeldProductsListener === 'function') {
            window.cleanupHeldProductsListener();
        }

        // Clear order data
        window.currentChatOrderData = null;

        // Reset UI
        const container = document.getElementById('chatProductsTableContainer');
        if (container) {
            container.innerHTML =
                '<div class="chat-empty-products"><i class="fas fa-box-open"></i><p>Chưa có sản phẩm trong đơn</p></div>';
        }
        updateOrderCounts(0, 0);

        const searchInput = document.getElementById('chatInlineProductSearch');
        if (searchInput) searchInput.value = '';

        const searchDropdown = document.getElementById('chatInlineSearchResults');
        if (searchDropdown) searchDropdown.style.display = 'none';
    };

    // =====================================================
    // HELPERS
    // =====================================================

    function getUserDisplayName() {
        if (!window.authManager) return 'Unknown';
        const auth = window.authManager.getAuthState();
        return auth?.displayName || auth?.userType?.split('-')[0] || 'Unknown';
    }

    // Initialize search on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.initChatProductSearch());
    } else {
        window.initChatProductSearch();
    }

})();
