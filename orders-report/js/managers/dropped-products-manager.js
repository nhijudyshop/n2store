// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Dropped Products Manager
 * Manages dropped/clearance products (hàng rớt - xả)
 * Data stored in PostgreSQL (Render) with SSE for real-time sync
 * Migrated from Firebase Realtime Database (2026-04-05)
 */

(function () {
    'use strict';

    // Add CSS styles for search suggestions
    const style = document.createElement('style');
    style.textContent = `
        #droppedProductSearchSuggestions.show {
            display: block !important;
        }

        #droppedProductSearchSuggestions .suggestion-item {
            padding: 12px 16px;
            cursor: pointer;
            border-bottom: 1px solid #f1f5f9;
            transition: background-color 0.15s;
            font-size: 13px;
            color: #1e293b;
        }

        #droppedProductSearchSuggestions .suggestion-item:hover {
            background-color: #f8fafc;
        }

        #droppedProductSearchSuggestions .suggestion-item:last-child {
            border-bottom: none;
        }

        #droppedProductSearchSuggestions .suggestion-item strong {
            color: #3b82f6;
            font-weight: 600;
        }

        #droppedProductSearchSuggestions::-webkit-scrollbar {
            width: 6px;
        }

        #droppedProductSearchSuggestions::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 3px;
        }

        #droppedProductSearchSuggestions::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 3px;
        }

        #droppedProductSearchSuggestions::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
        }
    `;
    document.head.appendChild(style);

    // Render API base URL
    const RENDER_API = 'https://n2store-fallback.onrender.com';

    // Local state - PostgreSQL is the single source of truth
    let droppedProducts = [];
    // Warehouse (Kho Sản Phẩm) — in-memory only for now. Cart-drop flow KHÔNG ghi vào đây.
    // Logic add sản phẩm vào kho sẽ được hoàn thiện sau bởi user.
    let warehouseProducts = [];
    let isInitialized = false;
    let sseSource = null; // SSE EventSource
    let isFirstLoad = true;

    // Campaign filter state for dropped products
    let currentCampaignFilter = 'all'; // 'all' | specific campaignId
    let hasAutoSelectedCampaignFilter = false; // Flag to auto-select active campaign once

    // Debounce timer for render functions
    let renderDebounceTimer = null;
    const RENDER_DEBOUNCE_MS = 150;

    /**
     * Generate unique ID (replaces Firebase push ID)
     */
    function generateId() {
        return 'dp_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Debounced render and update counts
     */
    function debouncedRenderAndUpdate() {
        if (renderDebounceTimer) {
            clearTimeout(renderDebounceTimer);
        }
        renderDebounceTimer = setTimeout(() => {
            const filtered = getFilteredDroppedProducts();
            renderDroppedProductsTable(filtered);
            updateDroppedCounts();
        }, RENDER_DEBOUNCE_MS);
    }

    /**
     * Get dropped products filtered by campaign selection
     */
    function getFilteredDroppedProducts() {
        if (currentCampaignFilter === 'all') return null; // null = show all
        return droppedProducts.filter((p) => String(p.campaignId) === currentCampaignFilter);
    }

    /**
     * Get all campaigns from campaignManager + dropped products
     */
    function getAllCampaigns() {
        const campaigns = new Map();

        if (window.campaignManager?.allCampaigns) {
            Object.entries(window.campaignManager.allCampaigns).forEach(([id, campaign]) => {
                campaigns.set(String(id), campaign.name || campaign.displayName || id);
            });
        }

        droppedProducts.forEach((p) => {
            if (p.campaignId && p.campaignName && !campaigns.has(String(p.campaignId))) {
                campaigns.set(String(p.campaignId), p.campaignName);
            }
        });

        return campaigns;
    }

    /**
     * Filter dropped products by campaign — called from dropdown
     */
    window.filterDroppedByCampaign = function (filterValue) {
        currentCampaignFilter = filterValue;
        hasAutoSelectedCampaignFilter = true;
        const filtered = getFilteredDroppedProducts();
        renderDroppedProductsTable(filtered);
    };

    // Product search state
    let productSearchInitialized = false;
    let searchSuggestionsVisible = false;

    // =====================================================
    // INITIALIZATION
    // =====================================================

    /**
     * Initialize the dropped products manager
     * Loads data from Render PostgreSQL + connects SSE for real-time sync
     */
    window.initDroppedProductsManager = async function () {
        if (isInitialized) return;

        try {
            // Render initial loading state
            renderDroppedProductsTable();
            // Pre-wire warehouse sub-tab toolbar (empty grid until user adds logic)
            renderWarehouseProductsTable();
            renderHistoryList();
            updateDroppedCounts();

            // Load initial data from PostgreSQL
            await loadDroppedProductsFromAPI();

            // Setup SSE for real-time updates
            setupSSE();

            isInitialized = true;
            console.log('[DROPPED-PRODUCTS] Initialized with Render API + SSE');
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Initialization error:', error);
            showError('Lỗi khởi tạo. Vui lòng tải lại trang.');
        }
    };

    /**
     * Load dropped products from Render API
     */
    async function loadDroppedProductsFromAPI() {
        try {
            const response = await fetch(`${RENDER_API}/api/realtime/dropped-products`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            // Convert Firebase-like structure { [id]: { ...data } } to array
            droppedProducts = Object.entries(data).map(([id, item]) => ({
                id,
                ...item,
                ProductId: parseInt(item.ProductId) || item.ProductId,
            }));

            isFirstLoad = false;
            debouncedRenderAndUpdate();
            console.log(`[DROPPED-PRODUCTS] Loaded ${droppedProducts.length} products from API`);
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error loading from API:', error);
        }
    }

    /**
     * Setup SSE for real-time updates from other users
     */
    function setupSSE() {
        if (sseSource) {
            sseSource.close();
            sseSource = null;
        }

        const sseUrl = `${RENDER_API}/api/realtime/sse?keys=${encodeURIComponent('dropped_products')}`;

        try {
            sseSource = new EventSource(sseUrl);

            sseSource.addEventListener('update', (e) => {
                try {
                    const payload = JSON.parse(e.data);
                    const eventData = payload.data || payload;
                    handleSSEUpdate(eventData);
                } catch (err) {
                    console.warn('[DROPPED-PRODUCTS] SSE parse error:', err);
                }
            });

            sseSource.addEventListener('created', (e) => {
                try {
                    const payload = JSON.parse(e.data);
                    const eventData = payload.data || payload;
                    handleSSEUpdate(eventData);
                } catch (err) {
                    console.warn('[DROPPED-PRODUCTS] SSE created parse error:', err);
                }
            });

            sseSource.addEventListener('deleted', (e) => {
                try {
                    const payload = JSON.parse(e.data);
                    const eventData = payload.data || payload;
                    handleSSEDelete(eventData);
                } catch (err) {
                    console.warn('[DROPPED-PRODUCTS] SSE delete parse error:', err);
                }
            });

            sseSource.addEventListener('connected', () => {
                console.log('[DROPPED-PRODUCTS] SSE connected');
            });

            sseSource.onerror = () => {
                console.warn('[DROPPED-PRODUCTS] SSE disconnected, will auto-reconnect');
            };

            console.log('[DROPPED-PRODUCTS] SSE connected for dropped_products');
        } catch (e) {
            console.warn('[DROPPED-PRODUCTS] SSE setup failed:', e);
        }
    }

    /**
     * Handle SSE update/created event
     */
    function handleSSEUpdate(eventData) {
        if (!eventData || !eventData.id) return;

        const id = eventData.id;
        const existingIndex = droppedProducts.findIndex((p) => p.id === id);

        if (existingIndex > -1) {
            // Update existing item
            droppedProducts[existingIndex] = {
                ...droppedProducts[existingIndex],
                ...eventData,
                id,
                ProductId: parseInt(eventData.ProductId) || droppedProducts[existingIndex].ProductId,
            };
        } else {
            // New item
            droppedProducts.push({
                ...eventData,
                id,
                ProductId: parseInt(eventData.ProductId) || eventData.ProductId,
            });

            // Notification for new sale_removed items (skip during initial load)
            if (!isFirstLoad && eventData.reason === 'sale_removed') {
                const removedBy = eventData.removedBy || 'Sale';
                const productName = eventData.ProductNameGet || eventData.ProductName || 'SP';
                const qty = eventData.Quantity || 1;
                const stt = eventData.removedFromOrderSTT || '?';
                const customer = eventData.removedFromCustomer || '?';
                const msg = `🔔 ${removedBy} vừa xả ${productName} x${qty} từ đơn STT ${stt} (${customer})`;
                if (window.notificationManager) {
                    window.notificationManager.show(msg, 'warning', 5000);
                }
            }
        }

        debouncedRenderAndUpdate();
    }

    /**
     * Handle SSE deleted event
     */
    function handleSSEDelete(eventData) {
        if (!eventData) return;

        // Clear all case
        if (eventData.cleared) {
            droppedProducts = [];
            debouncedRenderAndUpdate();
            return;
        }

        // Single item delete
        if (eventData.id) {
            const idx = droppedProducts.findIndex((p) => p.id === eventData.id);
            if (idx > -1) {
                droppedProducts.splice(idx, 1);
            }
            debouncedRenderAndUpdate();
        }
    }

    // =====================================================
    // UTILITY FUNCTIONS
    // =====================================================

    function showError(message) {
        if (window.notificationManager) {
            window.notificationManager.show(message, 'error');
        } else {
            console.error('[DROPPED-PRODUCTS]', message);
            alert(message);
        }
    }

    function showSuccess(message) {
        if (window.notificationManager) {
            window.notificationManager.show(message, 'success');
        }
    }

    /**
     * Cleanup SSE connection
     */
    window.cleanupDroppedProductsManager = function () {
        if (sseSource) {
            sseSource.close();
            sseSource = null;
        }
        isInitialized = false;
    };

    // =====================================================
    // PRODUCT SEARCH
    // =====================================================

    async function initializeProductSearch() {
        if (productSearchInitialized) return;

        if (!window.ProductSearchModule) {
            console.error('[DROPPED-PRODUCTS] ProductSearchModule not found');
            return;
        }

        try {
            await window.ProductSearchModule.loadExcelData(() => {}, () => {});
            productSearchInitialized = true;
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error initializing product search:', error);
            showError('Lỗi khởi tạo tìm kiếm sản phẩm: ' + error.message);
        }
    }

    window.handleProductSearchInput = async function (searchText) {
        if (!productSearchInitialized) {
            await initializeProductSearch();
        }

        if (!window.ProductSearchModule) return;

        const input = document.getElementById('droppedProductSearchInput');
        const suggestionsDiv = document.getElementById('droppedProductSearchSuggestions');

        if (!input || !suggestionsDiv) return;

        if (!searchText || searchText.trim().length < 2) {
            suggestionsDiv.classList.remove('show');
            searchSuggestionsVisible = false;
            return;
        }

        const results = window.ProductSearchModule.searchProducts(searchText);

        if (results.length === 0) {
            suggestionsDiv.classList.remove('show');
            searchSuggestionsVisible = false;
            return;
        }

        suggestionsDiv.innerHTML = results
            .map(
                (product) => `
            <div class="suggestion-item" data-id="${product.id}">
                <strong>${product.code || ''}</strong> - ${product.name}
            </div>
        `
            )
            .join('');

        suggestionsDiv.classList.add('show');
        searchSuggestionsVisible = true;

        suggestionsDiv.querySelectorAll('.suggestion-item').forEach((item) => {
            item.addEventListener('click', () => {
                const productId = item.dataset.id;
                addProductFromSearch(productId);
                suggestionsDiv.classList.remove('show');
                searchSuggestionsVisible = false;
                if (input) input.value = '';
            });
        });
    };

    async function addProductFromSearch(productId) {
        if (!window.ProductSearchModule) {
            showError('ProductSearchModule không khả dụng');
            return;
        }

        try {
            const result = await window.ProductSearchModule.loadProductDetails(productId, {
                autoAddVariants: false,
            });

            const productData = result.productData;

            const product = {
                ProductId: productData.Id,
                ProductName: productData.Name || productData.NameTemplate,
                ProductNameGet:
                    productData.NameGet || `[${productData.DefaultCode}] ${productData.Name}`,
                ProductCode: productData.DefaultCode || productData.Barcode,
                ImageUrl: result.imageUrl,
                Price: productData.ListPrice || 0,
                UOMName: productData.UOM?.Name || 'Cái',
            };

            await window.addToDroppedProducts(product, 1, 'manual_add');
            showSuccess(`Đã thêm sản phẩm: ${product.ProductNameGet}`);
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error adding product from search:', error);
            showError('Lỗi khi thêm sản phẩm: ' + error.message);
        }
    }

    document.addEventListener('click', (e) => {
        const searchContainer = document.getElementById('droppedProductSearchContainer');
        const suggestionsDiv = document.getElementById('droppedProductSearchSuggestions');

        if (searchContainer && suggestionsDiv && searchSuggestionsVisible) {
            if (!searchContainer.contains(e.target)) {
                suggestionsDiv.classList.remove('show');
                searchSuggestionsVisible = false;
            }
        }
    });

    // =====================================================
    // CRUD OPERATIONS (Render API)
    // =====================================================

    /**
     * Add product to dropped list
     * Uses Render API with atomic quantity update for existing products
     */
    window.addToDroppedProducts = async function (
        product,
        quantity,
        reason = 'removed',
        holderName = null,
        metadata = null
    ) {
        try {
            const existing = droppedProducts.find((p) => p.ProductId === product.ProductId);

            if (existing && existing.id) {
                // Product exists - atomic increment via API
                const body = { change: quantity, reason };
                if (metadata) {
                    if (metadata.removedBy) body.removedBy = metadata.removedBy;
                    if (metadata.removedFromOrderSTT) body.removedFromOrderSTT = metadata.removedFromOrderSTT;
                    if (metadata.removedFromCustomer) body.removedFromCustomer = metadata.removedFromCustomer;
                    body.removedAt = metadata.removedAt || Date.now();
                }

                // Also update campaign info if not already present
                if (!existing.campaignId) {
                    const cId = window.currentChatOrderData?.LiveCampaignId ||
                        (typeof campaignInfoFromTab1 !== 'undefined' && campaignInfoFromTab1?.activeCampaignId) || null;
                    if (cId) {
                        // Use PATCH for campaign info update
                        const cName = window.currentChatOrderData?.LiveCampaignName ||
                            (typeof campaignInfoFromTab1 !== 'undefined' && campaignInfoFromTab1?.activeCampaignName) || '';
                        await fetch(`${RENDER_API}/api/realtime/dropped-products/${existing.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ campaignId: String(cId), campaignName: cName || '' }),
                        }).catch(() => {});
                    }
                }

                const resp = await fetch(`${RENDER_API}/api/realtime/dropped-products/${existing.id}/quantity`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });

                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            } else {
                // New product - PUT with generated ID
                const campaignId = window.currentChatOrderData?.LiveCampaignId ||
                    (typeof campaignInfoFromTab1 !== 'undefined' && campaignInfoFromTab1?.activeCampaignId) || null;
                const campaignName = window.currentChatOrderData?.LiveCampaignName ||
                    (typeof campaignInfoFromTab1 !== 'undefined' && campaignInfoFromTab1?.activeCampaignName) || '';

                const newItem = {
                    ProductId: product.ProductId,
                    ProductName: product.ProductName,
                    ProductNameGet: product.ProductNameGet,
                    ProductCode: product.ProductCode,
                    ImageUrl: product.ImageUrl,
                    Price: product.Price,
                    Quantity: quantity,
                    UOMName: product.UOMName || 'Cái',
                    reason: reason,
                    campaignId: campaignId ? String(campaignId) : null,
                    campaignName: campaignName || '',
                };

                if (metadata) {
                    if (metadata.removedBy) newItem.removedBy = metadata.removedBy;
                    if (metadata.removedFromOrderSTT) newItem.removedFromOrderSTT = metadata.removedFromOrderSTT;
                    if (metadata.removedFromCustomer) newItem.removedFromCustomer = metadata.removedFromCustomer;
                    newItem.removedAt = metadata.removedAt || Date.now();
                }

                const id = generateId();
                const resp = await fetch(`${RENDER_API}/api/realtime/dropped-products/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newItem),
                });

                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            }

            // SSE will update UI automatically
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error adding product:', error);
            showError('Lỗi khi thêm sản phẩm: ' + error.message);
        }
    };

    /**
     * Get list of users currently holding a product across ALL orders
     * Queries Render API instead of Firebase
     */
    window.getProductHolders = async function (productId) {
        try {
            const resp = await fetch(`${RENDER_API}/api/realtime/held-products/by-product/${productId}`);
            if (!resp.ok) return [];

            const data = await resp.json();
            return data.holders || [];
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error getting holders:', error);
            return [];
        }
    };

    /**
     * Check if a product is still being held by anyone
     */
    async function isProductStillHeld(productId) {
        try {
            const holders = await window.getProductHolders(productId);
            return holders.length > 0;
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error checking held status:', error);
            return false;
        }
    }

    /**
     * Clean up dropped product if it has quantity=0 and no one is holding it
     */
    window.clearHeldByIfNotHeld = async function (productId) {
        try {
            const normalizedProductId = parseInt(productId);
            if (isNaN(normalizedProductId)) return;

            const holders = await window.getProductHolders(normalizedProductId);
            if (holders.length > 0) return;

            const droppedProduct = droppedProducts.find((p) => p.ProductId === normalizedProductId);
            if (!droppedProduct) return;
            if ((droppedProduct.Quantity || 0) > 0) return;

            // Product has quantity=0 and no holders -> remove via API
            await fetch(`${RENDER_API}/api/realtime/dropped-products/${droppedProduct.id}`, {
                method: 'DELETE',
            });
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error during cleanup:', error);
        }
    };

    /**
     * Remove product from dropped list
     */
    window.removeFromDroppedProducts = async function (index, skipConfirm = false) {
        const product = droppedProducts[index];
        if (!product || !product.id) return;

        if (!skipConfirm) {
            const confirmMsg = `Bạn có chắc muốn xóa sản phẩm "${product.ProductNameGet || product.ProductName}" khỏi danh sách hàng rớt?`;
            let confirmed = false;
            if (window.CustomPopup) {
                confirmed = await window.CustomPopup.confirm(confirmMsg, 'Xác nhận xóa');
            } else {
                confirmed = confirm(confirmMsg);
            }
            if (!confirmed) return;
        }

        try {
            const resp = await fetch(`${RENDER_API}/api/realtime/dropped-products/${product.id}`, {
                method: 'DELETE',
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            showSuccess('Đã xóa khỏi hàng rớt - xả');
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error removing:', error);
            showError('Lỗi khi xóa: ' + error.message);
        }
    };

    /**
     * Remove dropped product by ProductId
     */
    window.removeDroppedProductByProductId = async function (productId) {
        productId = Number(productId);
        const product = droppedProducts.find(p => Number(p.ProductId) === productId);
        if (!product || !product.id) return;

        try {
            await fetch(`${RENDER_API}/api/realtime/dropped-products/${product.id}`, {
                method: 'DELETE',
            });
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error removing by ProductId:', error);
        }
    };

    /**
     * Update dropped product quantity
     * Uses atomic PATCH API (replaces Firebase transaction)
     */
    window.updateDroppedProductQuantity = async function (index, change, value = null) {
        const product = droppedProducts[index];
        if (!product || !product.id) return;

        try {
            const body = {};
            if (value !== null) {
                body.value = Math.max(1, parseInt(value, 10));
            } else {
                body.change = change;
            }

            const resp = await fetch(`${RENDER_API}/api/realtime/dropped-products/${product.id}/quantity`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            // SSE will update UI automatically
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error updating quantity:', error);
            showError('Lỗi khi cập nhật số lượng: ' + error.message);
        }
    };

    /**
     * Move product back to order
     * Syncs to Render held_products API for multi-user collaboration
     */
    window.moveDroppedToOrder = async function (index) {
        const product = droppedProducts[index];

        if (!window.currentChatOrderData) {
            showError('Vui lòng mở một đơn hàng trước');
            return;
        }

        if (!window.currentChatOrderData.Details) {
            window.currentChatOrderData.Details = [];
        }

        if (!product.Quantity || product.Quantity <= 0) {
            showError('Không thể chuyển sản phẩm có số lượng = 0. Sản phẩm này đang được giữ.');
            return;
        }

        const confirmMsg = `Chuyển 1 sản phẩm "${product.ProductNameGet || product.ProductName}" về đơn hàng?`;
        let confirmed = false;

        if (window.CustomPopup) {
            confirmed = await window.CustomPopup.confirm(confirmMsg, 'Xác nhận chuyển');
        } else {
            confirmed = confirm(confirmMsg);
        }

        if (!confirmed) return;

        try {
            // Fetch full product details
            let fullProduct = null;
            if (window.productSearchManager) {
                try {
                    fullProduct = await window.productSearchManager.getFullProductDetails(product.ProductId, true);
                } catch (e) {
                    console.error('[DROPPED-PRODUCTS] Failed to fetch full details:', e);
                }
            }

            // Check if product already exists in held list
            const existingHeldIndex = window.currentChatOrderData.Details.findIndex(
                (p) => p.ProductId === product.ProductId && p.IsHeld
            );

            if (existingHeldIndex > -1) {
                window.currentChatOrderData.Details[existingHeldIndex].Quantity += 1;
            } else {
                window.currentChatOrderData.Details.push({
                    ProductId: product.ProductId,
                    ProductName: product.ProductName,
                    ProductNameGet: product.ProductNameGet,
                    ProductCode: fullProduct ? fullProduct.DefaultCode || fullProduct.Barcode : product.ProductCode,
                    ImageUrl: fullProduct ? fullProduct.ImageUrl : product.ImageUrl,
                    Price: product.Price,
                    Quantity: 1,
                    UOMId: fullProduct ? fullProduct.UOM?.Id || 1 : 1,
                    UOMName: fullProduct ? fullProduct.UOM?.Name || 'Cái' : product.UOMName,
                    Factor: 1,
                    Priority: 0,
                    OrderId: window.currentChatOrderData.Id,
                    LiveCampaign_DetailId: null,
                    ProductWeight: 0,
                    Note: null,
                    IsHeld: true,
                    IsFromDropped: true,
                    StockQty: fullProduct ? fullProduct.QtyAvailable : 0,
                    Name: product.ProductName,
                    Code: product.ProductCode,
                });
            }

            // Sync to Render held_products API
            const orderId = window.currentChatOrderData.Id;
            const productId = product.ProductId;

            if (window.authManager && orderId) {
                const auth = window.authManager.getAuthState();

                if (auth) {
                    let userId = auth.id || auth.Id || auth.username || auth.userType;
                    if (!userId && auth.displayName) {
                        userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');
                    }

                    if (userId) {
                        const currentHeldProduct = window.currentChatOrderData.Details.find(
                            (p) => p.ProductId === productId && p.IsHeld
                        );
                        const heldQuantity = currentHeldProduct ? currentHeldProduct.Quantity : 1;

                        // PUT to Render held_products API
                        await fetch(`${RENDER_API}/api/realtime/held-products/${orderId}/${productId}/${userId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                productId: productId,
                                displayName: auth.displayName || auth.userType || 'Unknown',
                                quantity: heldQuantity,
                                isDraft: false,
                                timestamp: Date.now(),
                                campaignName: window.currentChatOrderData?.LiveCampaignName || '',
                                stt: window.currentChatOrderData?.SessionIndex || '',
                                productName: product.ProductName || '',
                                productNameGet: product.ProductNameGet || product.ProductName || '',
                                productCode: product.ProductCode || '',
                                imageUrl: product.ImageUrl || '',
                                price: product.Price || 0,
                                uomName: product.UOMName || 'Cái',
                            }),
                        });
                    }
                }
            }

            // KPI Audit Log - KHÔNG ghi ở đây
            // SP mới chỉ ở trạng thái held (chưa confirm vào đơn hàng)

            // Decrease quantity in dropped list via atomic API
            if (product.id) {
                await fetch(`${RENDER_API}/api/realtime/dropped-products/${product.id}/quantity`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ change: -1 }),
                });
            }

            // Clear heldBy if no one is holding this product anymore
            await window.clearHeldByIfNotHeld(productId);

            // Re-render orders table
            if (typeof window.renderChatProductsTable === 'function') {
                window.renderChatProductsTable();
            }

            switchChatPanelTab('orders');
            showSuccess('Đã chuyển 1 sản phẩm về đơn hàng');
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error moving to order:', error);
            showError('Lỗi khi chuyển sản phẩm: ' + error.message);
        }
    };

    // =====================================================
    // RENDER UI (unchanged from original)
    // =====================================================

    // =====================================================
    // GRID UI STATE (image grid redesign)
    // =====================================================
    let _droppedSearchText = '';
    let _droppedCategoryFilter = 'all'; // all|ao|quan|set|giay|pk
    const _droppedSelectedIds = new Set();
    let _droppedDragging = false;
    let _droppedDragMode = 'add'; // 'add' | 'remove'
    let _droppedGridListenersAttached = false;

    function _detectDroppedCategory(name) {
        const n = (name || '').toUpperCase();
        if (/\bSET\b|SET\s/.test(n)) return 'set';
        if (/ÁO|AO\s/.test(n)) return 'ao';
        if (/QUẦN|QUAN\s/.test(n)) return 'quan';
        if (/GIÀY|GIAY/.test(n)) return 'giay';
        return 'pk';
    }

    function _updateDroppedFabState() {
        const sendBtn = document.getElementById('droppedFabSend');
        const sendNameBtn = document.getElementById('droppedFabSendName');
        const sendImageBtn = document.getElementById('droppedFabSendImage');
        const delBtn = document.getElementById('droppedFabDelete');
        const has = _droppedSelectedIds.size > 0;
        if (sendBtn) sendBtn.disabled = !has;
        if (sendNameBtn) sendNameBtn.disabled = !has;
        if (sendImageBtn) sendImageBtn.disabled = !has;
        if (delBtn) delBtn.disabled = !has;
    }

    window._handleDroppedSendNameSelected = async function () {
        if (_droppedSelectedIds.size === 0) return;
        const ids = Array.from(_droppedSelectedIds);
        for (const pid of ids) {
            const p = droppedProducts.find((x) => x.ProductId === pid);
            if (!p) continue;
            const name = p.ProductNameGet || p.ProductName || '';
            try {
                if (typeof window.sendProductToChat === 'function') {
                    await window.sendProductToChat(pid, name);
                }
            } catch (e) { console.error(e); }
        }
    };

    window._handleDroppedSendImageSelected = async function () {
        if (_droppedSelectedIds.size === 0) return;
        const ids = Array.from(_droppedSelectedIds);
        for (const pid of ids) {
            const p = droppedProducts.find((x) => x.ProductId === pid);
            if (!p || !p.ImageUrl) continue;
            const name = p.ProductNameGet || p.ProductName || '';
            try {
                if (typeof window.sendImageToChat === 'function') {
                    await window.sendImageToChat(p.ImageUrl, name, pid, p.ProductCode || '');
                }
            } catch (e) { console.error(e); }
        }
    };

    function _attachDroppedGlobalListeners() {
        if (_droppedGridListenersAttached) return;
        _droppedGridListenersAttached = true;
        const stopDrag = () => { _droppedDragging = false; };
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('mouseleave', stopDrag);
    }

    function _applyDroppedSelectionToCell(cell, productId) {
        if (_droppedDragMode === 'add') {
            _droppedSelectedIds.add(productId);
            cell.classList.add('selected');
        } else {
            _droppedSelectedIds.delete(productId);
            cell.classList.remove('selected');
        }
    }

    window._handleDroppedSendSelected = async function () {
        if (_droppedSelectedIds.size === 0) return;
        const ids = Array.from(_droppedSelectedIds);
        for (const pid of ids) {
            const idx = droppedProducts.findIndex((p) => p.ProductId === pid);
            if (idx >= 0 && (droppedProducts[idx].Quantity || 0) > 0) {
                try { await window.moveDroppedToOrder(idx); } catch (e) { console.error(e); }
            }
        }
        _droppedSelectedIds.clear();
        renderDroppedProductsTable();
    };

    window._handleDroppedDeleteSelected = async function () {
        if (_droppedSelectedIds.size === 0) return;
        if (!confirm(`Xóa ${_droppedSelectedIds.size} sản phẩm đã chọn khỏi hàng rớt?`)) return;
        const ids = Array.from(_droppedSelectedIds);
        // Delete from highest index downward to keep indices stable
        const indexes = ids
            .map((pid) => droppedProducts.findIndex((p) => p.ProductId === pid))
            .filter((i) => i >= 0)
            .sort((a, b) => b - a);
        for (const idx of indexes) {
            try { await window.removeFromDroppedProducts(idx, true /*skipConfirm*/); } catch (e) { console.error(e); }
        }
        _droppedSelectedIds.clear();
        renderDroppedProductsTable();
    };

    /**
     * Render dropped products as image grid
     */
    async function renderDroppedProductsTable(filteredProducts = null) {
        const container = document.getElementById('chatDroppedProductsContainer');
        if (!container) return;

        _attachDroppedGlobalListeners();

        // Build toolbar skeleton ONCE — never re-render it (preserves input focus + IME)
        if (!container.querySelector('.dropped-toolbar')) {
            const pills = [
                { id: 'all', label: 'ALL' },
                { id: 'ao', label: 'Áo' },
                { id: 'quan', label: 'Quần' },
                { id: 'set', label: 'Set' },
                { id: 'giay', label: 'GIÀY' },
                { id: 'pk', label: 'PK' },
            ];
            container.innerHTML = `
                <div class="dropped-toolbar">
                    <div class="dropped-search-wrap">
                        <i class="fas fa-search"></i>
                        <input type="text" id="droppedGridSearchInput" class="dropped-search" placeholder="Tìm kiếm sản phẩm..." autocomplete="off">
                    </div>
                    <div class="dropped-pills">
                        ${pills.map((p) => `<button type="button" class="dropped-pill ${_droppedCategoryFilter === p.id ? 'active' : ''}" data-cat="${p.id}">${p.label}</button>`).join('')}
                    </div>
                </div>
                <div class="dropped-grid" id="droppedGridContainer"></div>
            `;
            const inp = document.getElementById('droppedGridSearchInput');
            if (inp) inp.value = _droppedSearchText || '';
            _wireDroppedToolbar();
        }

        await _renderDroppedGridOnly(filteredProducts);
    }

    async function _renderDroppedGridOnly(filteredProducts = null) {
        const grid = document.getElementById('droppedGridContainer');
        if (!grid) return;
        // Ẩn hover preview cũ — tránh overlay kẹt lại sau khi grid re-render (block clicks)
        _hideHoverPreview();

        const allProducts = filteredProducts || droppedProducts;
        const search = (_droppedSearchText || '').trim().toLowerCase();
        const products = allProducts.filter((p) => {
            const name = (p.ProductNameGet || p.ProductName || '').toLowerCase();
            const code = (p.ProductCode || '').toLowerCase();
            if (search && !name.includes(search) && !code.includes(search)) return false;
            if (_droppedCategoryFilter !== 'all') {
                if (_detectDroppedCategory(p.ProductNameGet || p.ProductName) !== _droppedCategoryFilter) return false;
            }
            return true;
        });

        // Prune selection to existing IDs
        const existingIds = new Set(droppedProducts.map((p) => p.ProductId));
        for (const id of Array.from(_droppedSelectedIds)) {
            if (!existingIds.has(id)) _droppedSelectedIds.delete(id);
        }

        if (products.length === 0) {
            grid.innerHTML = `
                <div class="chat-empty-products" style="grid-column: 1 / -1; text-align:center; padding:40px 20px; color:#94a3b8;">
                    <i class="fas fa-box-open" style="font-size:40px; margin-bottom:12px; opacity:0.5;"></i>
                    <p style="font-size:14px; margin:0;">${allProducts.length === 0 ? 'Chưa có hàng rớt - xả' : 'Không có sản phẩm phù hợp'}</p>
                </div>
            `;
            _wireDroppedGrid();
            _updateDroppedFabState();
            return;
        }

        const productsWithHolders = await Promise.all(
            products.map(async (p) => {
                const holders = await window.getProductHolders(p.ProductId);
                return { ...p, _holders: holders };
            })
        );

        const cellsHTML = productsWithHolders.map((p) => {
            const isOutOfStock = (p.Quantity || 0) === 0;
            const productNameEscaped = (p.ProductNameGet || p.ProductName || '').replace(/"/g, '&quot;');
            const codeEscaped = (p.ProductCode || '').replace(/'/g, "\\'");
            const isSelected = _droppedSelectedIds.has(p.ProductId);

            // Build custom tooltip HTML (rich styled, shown on hover)
            const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const ttRows = [];
            ttRows.push(`<div class="dpt-title">${esc(p.ProductNameGet || p.ProductName || '')}</div>`);
            const meta = [];
            if (p.ProductCode) meta.push(`Mã: <b>${esc(p.ProductCode)}</b>`);
            if (p.Quantity != null) meta.push(`SL: <b>${esc(p.Quantity)}</b>`);
            if (p.Price) meta.push(`<b>${(p.Price).toLocaleString('vi-VN')}đ</b>`);
            if (meta.length) ttRows.push(`<div class="dpt-meta">${meta.join(' • ')}</div>`);
            const campaignNameForTip = p.campaignName
                || window.currentChatOrderData?.LiveCampaignName
                || (typeof campaignInfoFromTab1 !== 'undefined' && campaignInfoFromTab1?.activeCampaignName)
                || '';
            if (campaignNameForTip) ttRows.push(`<div class="dpt-line">Chiến dịch: <b>${esc(campaignNameForTip)}</b></div>`);
            if (p.removedFromCustomer || p.removedFromOrderSTT || p.removedBy) {
                ttRows.push('<div class="dpt-sep"></div>');
                if (p.removedFromCustomer) ttRows.push(`<div class="dpt-kh">KH: <b>${esc(p.removedFromCustomer)}</b></div>`);
                if (p.removedFromOrderSTT) ttRows.push(`<div class="dpt-kh">STT: <b>${esc(p.removedFromOrderSTT)}</b></div>`);
                if (p.removedBy) ttRows.push(`<div class="dpt-kh">Xả bởi: <b>${esc(p.removedBy)}</b></div>`);
            }
            if (isOutOfStock && p._holders && p._holders[0]) {
                ttRows.push(`<div class="dpt-line">Đang giữ: <b>${esc(p._holders[0].name)}</b></div>`);
            }
            const tooltipHTML = ttRows.join('');
            const tooltipAttr = tooltipHTML.replace(/"/g, '&quot;');

            const imgInner = p.ImageUrl
                ? `<img src="${p.ImageUrl}" alt="${productNameEscaped}" draggable="false">`
                : `<div class="dropped-cell-noimg"><i class="fas fa-box"></i></div>`;

            return `
                <div class="dropped-cell${isSelected ? ' selected' : ''}${isOutOfStock ? ' held' : ''}"
                     data-pid="${p.ProductId}"
                     data-name="${productNameEscaped}"
                     data-code="${codeEscaped}"
                     data-tooltip="${tooltipAttr}">
                    ${imgInner}
                    <span class="dropped-cell-check"><i class="fas fa-check"></i></span>
                </div>
            `;
        }).join('');

        grid.innerHTML = cellsHTML;
        _wireDroppedGrid();
        _updateDroppedFabState();
    }

    function _wireDroppedToolbar() {
        const searchInput = document.getElementById('droppedGridSearchInput');
        if (searchInput && !searchInput._wired) {
            searchInput._wired = true;
            let t = null;
            let composing = false;
            searchInput.addEventListener('compositionstart', () => { composing = true; });
            searchInput.addEventListener('compositionend', (e) => {
                composing = false;
                _droppedSearchText = e.target.value;
                clearTimeout(t);
                _renderDroppedGridOnly();
            });
            searchInput.addEventListener('input', (e) => {
                if (composing) return; // Wait for IME composition to end
                clearTimeout(t);
                const v = e.target.value;
                t = setTimeout(() => {
                    _droppedSearchText = v;
                    _renderDroppedGridOnly();
                }, 200);
            });
        }
        document.querySelectorAll('#chatTabDropped .dropped-pill').forEach((btn) => {
            if (btn._wired) return;
            btn._wired = true;
            btn.addEventListener('click', () => {
                _droppedCategoryFilter = btn.dataset.cat;
                document.querySelectorAll('#chatTabDropped .dropped-pill').forEach((b) => {
                    b.classList.toggle('active', b.dataset.cat === _droppedCategoryFilter);
                });
                _renderDroppedGridOnly();
            });
        });
        const toggleBtn = document.getElementById('droppedFabToggle');
        const fabContainer = document.getElementById('droppedFloatingActions');
        if (toggleBtn && !toggleBtn._wired) {
            toggleBtn._wired = true;
            toggleBtn.addEventListener('click', () => {
                if (fabContainer) fabContainer.classList.toggle('collapsed');
            });
        }
        const sendBtn = document.getElementById('droppedFabSend');
        const sendNameBtn = document.getElementById('droppedFabSendName');
        const sendImageBtn = document.getElementById('droppedFabSendImage');
        const delBtn = document.getElementById('droppedFabDelete');
        if (sendBtn && !sendBtn._wired) {
            sendBtn._wired = true;
            sendBtn.addEventListener('click', () => window._handleDroppedSendSelected());
        }
        if (sendNameBtn && !sendNameBtn._wired) {
            sendNameBtn._wired = true;
            sendNameBtn.addEventListener('click', () => window._handleDroppedSendNameSelected());
        }
        if (sendImageBtn && !sendImageBtn._wired) {
            sendImageBtn._wired = true;
            sendImageBtn.addEventListener('click', () => window._handleDroppedSendImageSelected());
        }
        if (delBtn && !delBtn._wired) {
            delBtn._wired = true;
            delBtn.addEventListener('click', () => window._handleDroppedDeleteSelected());
        }
    }

    function _wireDroppedGrid() {
        const grid = document.getElementById('droppedGridContainer');
        if (!grid) return;

        grid.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            const cell = e.target.closest('.dropped-cell');
            if (!cell || cell.classList.contains('held')) return;
            const pid = Number(cell.dataset.pid);
            _droppedDragging = true;
            _droppedDragMode = _droppedSelectedIds.has(pid) ? 'remove' : 'add';
            _applyDroppedSelectionToCell(cell, pid);
            _updateDroppedFabState();
            e.preventDefault();
        });

        grid.addEventListener('mouseover', (e) => {
            if (!_droppedDragging) return;
            const cell = e.target.closest('.dropped-cell');
            if (!cell || cell.classList.contains('held')) return;
            const pid = Number(cell.dataset.pid);
            _applyDroppedSelectionToCell(cell, pid);
            _updateDroppedFabState();
        });

        // Hover preview - phóng to ảnh hết mức khi rê chuột vào ô
        let _hoverCell = null;
        grid.addEventListener('mouseover', (e) => {
            const cell = e.target.closest('.dropped-cell');
            if (!cell || cell === _hoverCell) return;
            const img = cell.querySelector('img');
            if (!img) { _hideHoverPreview(); _hoverCell = null; return; }
            _hoverCell = cell;
            _showHoverPreview(img.src, e.clientX, e.clientY, cell.dataset.tooltip || '');
        });
        grid.addEventListener('mousemove', (e) => {
            if (!_hoverCell) return;
            _positionHoverPreview(e.clientX, e.clientY);
        });
        grid.addEventListener('mouseout', (e) => {
            const to = e.relatedTarget;
            if (_hoverCell && (!to || !_hoverCell.contains(to))) {
                _hoverCell = null;
                _hideHoverPreview();
            }
        });

        // Right-click → send product name to chat
        grid.addEventListener('contextmenu', (e) => {
            const cell = e.target.closest('.dropped-cell');
            if (!cell) return;
            e.preventDefault();
            const pid = Number(cell.dataset.pid);
            const name = cell.dataset.name;
            if (typeof window.sendProductToChat === 'function') {
                window.sendProductToChat(pid, name);
            }
        });
    }

    // =====================================================
    // WAREHOUSE (Kho Sản Phẩm) — parallel grid bucket
    // UI/chức năng giống hàng rớt xả nhưng dùng container/FAB id riêng
    // và mảng warehouseProducts (in-memory). Cart-drop flow KHÔNG ghi vào đây.
    // =====================================================
    let _warehouseSearchText = '';
    let _warehouseCategoryFilter = 'all';
    const _warehouseSelectedIds = new Set();
    let _warehouseDragging = false;
    let _warehouseDragMode = 'add';
    let _warehouseGridListenersAttached = false;

    function _updateWarehouseFabState() {
        const sendBtn = document.getElementById('warehouseFabSend');
        const sendNameBtn = document.getElementById('warehouseFabSendName');
        const sendImageBtn = document.getElementById('warehouseFabSendImage');
        const delBtn = document.getElementById('warehouseFabDelete');
        const has = _warehouseSelectedIds.size > 0;
        if (sendBtn) sendBtn.disabled = !has;
        if (sendNameBtn) sendNameBtn.disabled = !has;
        if (sendImageBtn) sendImageBtn.disabled = !has;
        if (delBtn) delBtn.disabled = !has;
    }

    window._handleWarehouseSendNameSelected = async function () {
        if (_warehouseSelectedIds.size === 0) return;
        const ids = Array.from(_warehouseSelectedIds);
        for (const pid of ids) {
            const p = warehouseProducts.find((x) => x.ProductId === pid);
            if (!p) continue;
            const name = p.ProductNameGet || p.ProductName || '';
            try {
                if (typeof window.sendProductToChat === 'function') {
                    await window.sendProductToChat(pid, name);
                }
            } catch (e) { console.error(e); }
        }
    };

    window._handleWarehouseSendImageSelected = async function () {
        if (_warehouseSelectedIds.size === 0) return;
        const ids = Array.from(_warehouseSelectedIds);
        for (const pid of ids) {
            const p = warehouseProducts.find((x) => x.ProductId === pid);
            if (!p || !p.ImageUrl) continue;
            const name = p.ProductNameGet || p.ProductName || '';
            try {
                if (typeof window.sendImageToChat === 'function') {
                    await window.sendImageToChat(p.ImageUrl, name, pid, p.ProductCode || '');
                }
            } catch (e) { console.error(e); }
        }
    };

    window._handleWarehouseSendSelected = async function () {
        // Stub: chuyển sản phẩm vào đơn — sẽ hoàn thiện khi có backend kho.
        if (_warehouseSelectedIds.size === 0) return;
        showError('Chức năng chuyển từ Kho vào đơn sẽ hoàn thiện sau.');
    };

    window._handleWarehouseDeleteSelected = async function () {
        if (_warehouseSelectedIds.size === 0) return;
        if (!confirm(`Xóa ${_warehouseSelectedIds.size} sản phẩm đã chọn khỏi kho?`)) return;
        const ids = Array.from(_warehouseSelectedIds);
        warehouseProducts = warehouseProducts.filter((p) => !ids.includes(p.ProductId));
        _warehouseSelectedIds.clear();
        renderWarehouseProductsTable();
    };

    function _attachWarehouseGlobalListeners() {
        if (_warehouseGridListenersAttached) return;
        _warehouseGridListenersAttached = true;
        const stopDrag = () => { _warehouseDragging = false; };
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('mouseleave', stopDrag);
    }

    function _applyWarehouseSelectionToCell(cell, productId) {
        if (_warehouseDragMode === 'add') {
            _warehouseSelectedIds.add(productId);
            cell.classList.add('selected');
        } else {
            _warehouseSelectedIds.delete(productId);
            cell.classList.remove('selected');
        }
    }

    async function renderWarehouseProductsTable() {
        const container = document.getElementById('warehouseProductsContainer');
        if (!container) return;

        _attachWarehouseGlobalListeners();

        if (!container.querySelector('.dropped-toolbar')) {
            const pills = [
                { id: 'all', label: 'ALL' },
                { id: 'ao', label: 'Áo' },
                { id: 'quan', label: 'Quần' },
                { id: 'set', label: 'Set' },
                { id: 'giay', label: 'GIÀY' },
                { id: 'pk', label: 'PK' },
            ];
            container.innerHTML = `
                <div class="dropped-toolbar">
                    <div class="dropped-search-wrap">
                        <i class="fas fa-search"></i>
                        <input type="text" id="warehouseGridSearchInput" class="dropped-search" placeholder="Tìm kiếm sản phẩm..." autocomplete="off">
                    </div>
                    <div class="dropped-pills">
                        ${pills.map((p) => `<button type="button" class="dropped-pill ${_warehouseCategoryFilter === p.id ? 'active' : ''}" data-cat="${p.id}">${p.label}</button>`).join('')}
                    </div>
                </div>
                <div class="dropped-grid" id="warehouseGridContainer"></div>
            `;
            const inp = document.getElementById('warehouseGridSearchInput');
            if (inp) inp.value = _warehouseSearchText || '';
            _wireWarehouseToolbar();
        }

        await _renderWarehouseGridOnly();
    }

    async function _renderWarehouseGridOnly() {
        const grid = document.getElementById('warehouseGridContainer');
        if (!grid) return;

        const allProducts = warehouseProducts;
        const search = (_warehouseSearchText || '').trim().toLowerCase();
        const products = allProducts.filter((p) => {
            const name = (p.ProductNameGet || p.ProductName || '').toLowerCase();
            const code = (p.ProductCode || '').toLowerCase();
            if (search && !name.includes(search) && !code.includes(search)) return false;
            if (_warehouseCategoryFilter !== 'all') {
                if (_detectDroppedCategory(p.ProductNameGet || p.ProductName) !== _warehouseCategoryFilter) return false;
            }
            return true;
        });

        const existingIds = new Set(warehouseProducts.map((p) => p.ProductId));
        for (const id of Array.from(_warehouseSelectedIds)) {
            if (!existingIds.has(id)) _warehouseSelectedIds.delete(id);
        }

        if (products.length === 0) {
            grid.innerHTML = `
                <div class="chat-empty-products" style="grid-column: 1 / -1; text-align:center; padding:40px 20px; color:#94a3b8;">
                    <i class="fas fa-box-open" style="font-size:40px; margin-bottom:12px; opacity:0.5;"></i>
                    <p style="font-size:14px; margin:0;">${allProducts.length === 0 ? 'Chưa có sản phẩm trong kho' : 'Không có sản phẩm phù hợp'}</p>
                </div>
            `;
            _wireWarehouseGrid();
            _updateWarehouseFabState();
            return;
        }

        const cellsHTML = products.map((p) => {
            const productNameEscaped = (p.ProductNameGet || p.ProductName || '').replace(/"/g, '&quot;');
            const codeEscaped = (p.ProductCode || '').replace(/'/g, "\\'");
            const isSelected = _warehouseSelectedIds.has(p.ProductId);

            const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const ttRows = [];
            ttRows.push(`<div class="dpt-title">${esc(p.ProductNameGet || p.ProductName || '')}</div>`);
            const meta = [];
            if (p.ProductCode) meta.push(`Mã: <b>${esc(p.ProductCode)}</b>`);
            if (p.Quantity != null) meta.push(`SL: <b>${esc(p.Quantity)}</b>`);
            if (p.Price) meta.push(`<b>${(p.Price).toLocaleString('vi-VN')}đ</b>`);
            if (meta.length) ttRows.push(`<div class="dpt-meta">${meta.join(' • ')}</div>`);
            const tooltipHTML = ttRows.join('');
            const tooltipAttr = tooltipHTML.replace(/"/g, '&quot;');

            const imgInner = p.ImageUrl
                ? `<img src="${p.ImageUrl}" alt="${productNameEscaped}" draggable="false">`
                : `<div class="dropped-cell-noimg"><i class="fas fa-box"></i></div>`;

            return `
                <div class="dropped-cell${isSelected ? ' selected' : ''}"
                     data-pid="${p.ProductId}"
                     data-name="${productNameEscaped}"
                     data-code="${codeEscaped}"
                     data-tooltip="${tooltipAttr}">
                    ${imgInner}
                    <span class="dropped-cell-check"><i class="fas fa-check"></i></span>
                </div>
            `;
        }).join('');

        grid.innerHTML = cellsHTML;
        _wireWarehouseGrid();
        _updateWarehouseFabState();
    }

    function _wireWarehouseToolbar() {
        const searchInput = document.getElementById('warehouseGridSearchInput');
        if (searchInput && !searchInput._wired) {
            searchInput._wired = true;
            let t = null;
            let composing = false;
            searchInput.addEventListener('compositionstart', () => { composing = true; });
            searchInput.addEventListener('compositionend', (e) => {
                composing = false;
                _warehouseSearchText = e.target.value;
                clearTimeout(t);
                _renderWarehouseGridOnly();
            });
            searchInput.addEventListener('input', (e) => {
                if (composing) return;
                clearTimeout(t);
                const v = e.target.value;
                t = setTimeout(() => {
                    _warehouseSearchText = v;
                    _renderWarehouseGridOnly();
                }, 200);
            });
        }
        document.querySelectorAll('#droppedSubPanelKho .dropped-pill').forEach((btn) => {
            if (btn._wired) return;
            btn._wired = true;
            btn.addEventListener('click', () => {
                _warehouseCategoryFilter = btn.dataset.cat;
                document.querySelectorAll('#droppedSubPanelKho .dropped-pill').forEach((b) => {
                    b.classList.toggle('active', b.dataset.cat === _warehouseCategoryFilter);
                });
                _renderWarehouseGridOnly();
            });
        });
        const toggleBtn = document.getElementById('warehouseFabToggle');
        const fabContainer = document.getElementById('warehouseFloatingActions');
        if (toggleBtn && !toggleBtn._wired) {
            toggleBtn._wired = true;
            toggleBtn.addEventListener('click', () => {
                if (fabContainer) fabContainer.classList.toggle('collapsed');
            });
        }
        const sendBtn = document.getElementById('warehouseFabSend');
        const sendNameBtn = document.getElementById('warehouseFabSendName');
        const sendImageBtn = document.getElementById('warehouseFabSendImage');
        const delBtn = document.getElementById('warehouseFabDelete');
        if (sendBtn && !sendBtn._wired) {
            sendBtn._wired = true;
            sendBtn.addEventListener('click', () => window._handleWarehouseSendSelected());
        }
        if (sendNameBtn && !sendNameBtn._wired) {
            sendNameBtn._wired = true;
            sendNameBtn.addEventListener('click', () => window._handleWarehouseSendNameSelected());
        }
        if (sendImageBtn && !sendImageBtn._wired) {
            sendImageBtn._wired = true;
            sendImageBtn.addEventListener('click', () => window._handleWarehouseSendImageSelected());
        }
        if (delBtn && !delBtn._wired) {
            delBtn._wired = true;
            delBtn.addEventListener('click', () => window._handleWarehouseDeleteSelected());
        }
    }

    function _wireWarehouseGrid() {
        const grid = document.getElementById('warehouseGridContainer');
        if (!grid || grid._wired) return;
        grid._wired = true;

        grid.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            const cell = e.target.closest('.dropped-cell');
            if (!cell) return;
            const pid = Number(cell.dataset.pid);
            _warehouseDragging = true;
            _warehouseDragMode = _warehouseSelectedIds.has(pid) ? 'remove' : 'add';
            _applyWarehouseSelectionToCell(cell, pid);
            _updateWarehouseFabState();
            e.preventDefault();
        });

        grid.addEventListener('mouseover', (e) => {
            if (!_warehouseDragging) return;
            const cell = e.target.closest('.dropped-cell');
            if (!cell) return;
            const pid = Number(cell.dataset.pid);
            _applyWarehouseSelectionToCell(cell, pid);
            _updateWarehouseFabState();
        });

        // Hover preview - reuse the singleton from dropped grid
        let _hoverCell = null;
        grid.addEventListener('mouseover', (e) => {
            const cell = e.target.closest('.dropped-cell');
            if (!cell || cell === _hoverCell) return;
            const img = cell.querySelector('img');
            if (!img) { _hideHoverPreview(); _hoverCell = null; return; }
            _hoverCell = cell;
            _showHoverPreview(img.src, e.clientX, e.clientY, cell.dataset.tooltip || '');
        });
        grid.addEventListener('mousemove', (e) => {
            if (!_hoverCell) return;
            _positionHoverPreview(e.clientX, e.clientY);
        });
        grid.addEventListener('mouseout', (e) => {
            const to = e.relatedTarget;
            if (_hoverCell && (!to || !_hoverCell.contains(to))) {
                _hoverCell = null;
                _hideHoverPreview();
            }
        });

        grid.addEventListener('contextmenu', (e) => {
            const cell = e.target.closest('.dropped-cell');
            if (!cell) return;
            e.preventDefault();
            const pid = Number(cell.dataset.pid);
            const name = cell.dataset.name;
            if (typeof window.sendProductToChat === 'function') {
                window.sendProductToChat(pid, name);
            }
        });
    }

    // Public API for warehouse — user sẽ hoàn thiện logic add sau
    window.getWarehouseProducts = function () { return warehouseProducts; };
    window.addToWarehouseProducts = function (product, quantity = 1) {
        if (!product || !product.ProductId) return;
        const existing = warehouseProducts.find((p) => p.ProductId === product.ProductId);
        if (existing) {
            existing.Quantity = (existing.Quantity || 0) + quantity;
        } else {
            warehouseProducts.push({ ...product, Quantity: quantity });
        }
        renderWarehouseProductsTable();
    };
    window.removeFromWarehouseProducts = function (productId) {
        warehouseProducts = warehouseProducts.filter((p) => p.ProductId !== productId);
        renderWarehouseProductsTable();
    };

    // Sub-tab switcher (Hàng rớt xả / Kho Sản Phẩm)
    window.switchDroppedSubTab = function (bucketKey) {
        const xashaPanel = document.getElementById('droppedSubPanelXasha');
        const khoPanel = document.getElementById('droppedSubPanelKho');
        const buttons = document.querySelectorAll('.dropped-subtab-btn');
        buttons.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.bucket === bucketKey);
        });
        if (bucketKey === 'kho') {
            if (xashaPanel) xashaPanel.style.display = 'none';
            if (khoPanel) khoPanel.style.display = 'flex';
            renderWarehouseProductsTable();
        } else {
            if (khoPanel) khoPanel.style.display = 'none';
            if (xashaPanel) xashaPanel.style.display = 'flex';
            renderDroppedProductsTable();
        }
    };

    // ===== Hover preview singleton =====
    let _hoverPreviewEl = null;
    function _getHoverPreviewEl() {
        if (_hoverPreviewEl) return _hoverPreviewEl;
        const el = document.createElement('div');
        el.id = 'droppedHoverPreview';
        el.innerHTML = '<img alt=""><div class="dpt-tooltip"></div>';
        document.body.appendChild(el);
        _hoverPreviewEl = el;
        return el;
    }
    function _showHoverPreview(src, x, y, tooltipHTML) {
        const el = _getHoverPreviewEl();
        const img = el.querySelector('img');
        if (img.src !== src) img.src = src;
        const tt = el.querySelector('.dpt-tooltip');
        if (tt) {
            tt.innerHTML = tooltipHTML || '';
            tt.style.display = tooltipHTML ? '' : 'none';
        }
        el.classList.add('show');
        _positionHoverPreview(x, y);
    }
    function _hideHoverPreview() {
        if (_hoverPreviewEl) _hoverPreviewEl.classList.remove('show');
    }
    function _positionHoverPreview(x, y) {
        const el = _hoverPreviewEl;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const pad = 16;
        let left = x + 20;
        let top = y + 20;
        if (left + rect.width + pad > window.innerWidth)  left = x - rect.width - 20;
        if (top + rect.height + pad > window.innerHeight) top = window.innerHeight - rect.height - pad;
        if (left < pad) left = pad;
        if (top < pad)  top = pad;
        el.style.left = left + 'px';
        el.style.top  = top  + 'px';
    }

    // Legacy code removed below
    /* LEGACY_REMOVED_START
            <div id="droppedProductSearchContainer" style="
                padding: 12px 16px;
                border-bottom: 2px solid #f1f5f9;
                background: #f8fafc;
                position: relative;
            ">
                <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
                    <div style="position: relative; flex: 1;">
                        <input
                            type="text"
                            id="droppedProductSearchInput"
                            placeholder="🔍 Tìm kiếm sản phẩm để thêm vào hàng rớt..."
                            oninput="handleProductSearchInput(this.value)"
                            style="
                                width: 100%;
                                padding: 10px 40px 10px 12px;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 14px;
                                outline: none;
                                transition: all 0.2s;
                                box-sizing: border-box;
                            "
                            onfocus="this.style.borderColor='#3b82f6'; this.style.boxShadow='0 0 0 3px rgba(59, 130, 246, 0.1)';"
                            onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none';"
                        />
                        <i class="fas fa-search" style="
                            position: absolute;
                            right: 14px;
                            top: 50%;
                            transform: translateY(-50%);
                            color: #94a3b8;
                            pointer-events: none;
                        "></i>
                    </div>
                    <select id="droppedCampaignFilter" onchange="filterDroppedByCampaign(this.value)" style="
                        padding: 10px 12px;
                        border: 2px solid #e2e8f0;
                        border-radius: 8px;
                        font-size: 13px;
                        background: white;
                        color: #334155;
                        cursor: pointer;
                        outline: none;
                        min-width: 160px;
                        transition: all 0.2s;
                    ">
                        ${campaignOptions}
                    </select>
                </div>
                <div id="droppedProductSearchSuggestions" class="suggestions-dropdown" style="
                    position: absolute;
                    top: 100%;
                    left: 16px;
                    right: 16px;
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                    max-height: 300px;
                    overflow-y: auto;
                    z-index: 1000;
                    display: none;
                    margin-top: 4px;
                "></div>
            </div>
        `;

        if (productsWithHolders.length === 0) {
            container.innerHTML =
                searchUI +
                `
                <div class="chat-empty-products" style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                    <i class="fas fa-box-open" style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;"></i>
                    <p style="font-size: 14px; margin: 0;">Chưa có hàng rớt - xả</p>
                    <p style="font-size: 12px; margin-top: 4px;">Sử dụng thanh tìm kiếm để thêm sản phẩm</p>
                </div>
            `;
            return;
        }

        const productsHTML = productsWithHolders
            .map((p, i) => {
                const actualIndex = droppedProducts.findIndex(
                    (orig) => orig.ProductId === p.ProductId
                );
                const isOutOfStock = (p.Quantity || 0) === 0;
                const rowOpacity = isOutOfStock ? '0.6' : '1';
                const nameColor = isOutOfStock ? '#94a3b8' : '#1e293b';

                let removedInfo = '';
                if (p.removedBy || p.removedFromOrderSTT || p.removedFromCustomer) {
                    removedInfo = [
                        p.removedBy ? `Xả bởi: ${p.removedBy}` : '',
                        p.removedFromOrderSTT ? `STT: ${p.removedFromOrderSTT}` : '',
                        p.removedFromCustomer ? `KH: ${p.removedFromCustomer}` : '',
                    ]
                        .filter(Boolean)
                        .join(' | ')
                        .replace(/"/g, '&quot;');
                }

                const productNameEscaped = (p.ProductNameGet || p.ProductName || '').replace(
                    /"/g,
                    '&quot;'
                );

                let tooltipParts = [productNameEscaped];
                if (p.ProductCode) tooltipParts.push(`Mã: ${p.ProductCode}`);
                if (p.campaignName) tooltipParts.push(`Live: ${p.campaignName}`);
                if (p.addedDate) tooltipParts.push(p.addedDate);
                if (removedInfo) tooltipParts.push('---', removedInfo);
                const tooltipText = tooltipParts.join('&#10;');

                return `
            <tr class="chat-product-row" data-index="${actualIndex}" style="opacity: ${rowOpacity};">
                <td style="width: 60px;">
                    ${p.ImageUrl ? `<img src="${p.ImageUrl}" class="chat-product-image" style="opacity: ${isOutOfStock ? '0.7' : '1'}; cursor: pointer;" onclick="showImageZoom('${p.ImageUrl}', '${productNameEscaped}')" oncontextmenu="sendImageToChat('${p.ImageUrl}', '${productNameEscaped}', ${p.ProductId}, '${(p.ProductCode || '').replace(/'/g, "\\'")}'); return false;" title="Click: Xem ảnh | Chuột phải: Gửi ảnh vào chat">` : `<div class="chat-product-image" style="background: linear-gradient(135deg, ${isOutOfStock ? '#9ca3af' : '#ef4444'} 0%, ${isOutOfStock ? '#6b7280' : '#dc2626'} 100%); display: flex; align-items: center; justify-content: center;"><i class="fas fa-box" style="color: white; font-size: 18px;"></i></div>`}
                </td>
                <td title="${tooltipText}" style="cursor: help;">
                    <div style="font-weight: 600; margin-bottom: 2px; color: ${nameColor};">
                        ${p.ProductNameGet || p.ProductName}
                        ${
                            isOutOfStock && p._holders && p._holders.length > 0
                                ? (() => {
                                      const h = p._holders[0];
                                      const badgeInfo =
                                          h.campaign || h.stt
                                              ? ` (${h.campaign ? h.campaign : ''}${h.campaign && h.stt ? ' - ' : ''}${h.stt ? 'STT ' + h.stt : ''})`
                                              : '';
                                      return `<span style="font-size: 11px; color: #f59e0b; margin-left: 6px;"><i class="fas fa-user-clock"></i> ${h.name}${badgeInfo}</span>`;
                                  })()
                                : isOutOfStock
                                  ? '<span style="font-size: 11px; color: #f59e0b; margin-left: 6px;"><i class="fas fa-user-clock"></i> Đang được giữ</span>'
                                  : ''
                        }
                    </div>
                    ${
                        p._holders && p._holders.length > 1
                            ? p._holders
                                  .slice(1)
                                  .map((h) => {
                                      const orderInfo =
                                          h.campaign || h.stt
                                              ? ` <span style="color: #6b7280;">(${h.campaign ? h.campaign : ''}${h.campaign && h.stt ? ' - ' : ''}${h.stt ? 'STT ' + h.stt : ''})</span>`
                                              : '';
                                      return `<div style="font-size: 11px; color: #d97706; margin-top: 2px;"><i class="fas fa-user"></i> <strong>${h.name}</strong>${orderInfo}</div>`;
                                  })
                                  .join('')
                            : ''
                    }
                </td>
                <td style="text-align: center; width: 140px;">
                    <div class="chat-quantity-controls">
                        <button onclick="updateDroppedProductQuantity(${actualIndex}, -1)" class="chat-qty-btn" ${isOutOfStock ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>
                            <i class="fas fa-minus"></i>
                        </button>
                        <input type="number" class="chat-quantity-input" value="${p.Quantity || 0}"
                            onchange="updateDroppedProductQuantity(${actualIndex}, 0, this.value)" min="0" ${isOutOfStock ? 'readonly style="background: #f1f5f9; color: #94a3b8;"' : ''}>
                        <button onclick="updateDroppedProductQuantity(${actualIndex}, 1)" class="chat-qty-btn">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </td>
                <td style="text-align: right; width: 100px;">${(p.Price || 0).toLocaleString('vi-VN')}đ</td>
                <td style="text-align: center; width: 140px;">
                    <button onclick="moveDroppedToOrder(${actualIndex})" class="chat-btn-product-action" title="${isOutOfStock ? 'Không thể chuyển (số lượng = 0)' : 'Chuyển về đơn hàng'}" style="margin-right: 4px; color: ${isOutOfStock ? '#cbd5e1' : '#10b981'}; ${isOutOfStock ? 'cursor: not-allowed; opacity: 0.5;' : ''}" ${isOutOfStock ? 'disabled' : ''}>
                        <i class="fas fa-plus"></i>
                    </button>
                    <button onclick="sendProductToChat(${p.ProductId}, '${(p.ProductNameGet || p.ProductName || '').replace(/'/g, "\\'")}')" class="chat-btn-product-action" style="
                        background: #3b82f6;
                        color: white;
                        border: none;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: 600;
                        cursor: pointer;
                        margin-right: 4px;
                    " title="Gửi tên sản phẩm vào chat">Gửi tên</button>
                    ${p.ImageUrl ? `<button onclick="sendImageToChat('${p.ImageUrl}', '${productNameEscaped}', ${p.ProductId}, '${(p.ProductCode || '').replace(/'/g, "\\'")}')" class="chat-btn-product-action" style="
                        background: #8b5cf6;
                        color: white;
                        border: none;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: 600;
                        cursor: pointer;
                        margin-right: 4px;
                    " title="Gửi ảnh sản phẩm vào chat">Gửi ảnh</button>` : ''}
                    <button onclick="removeFromDroppedProducts(${actualIndex})" class="chat-btn-product-action chat-btn-delete-item" title="Xóa vĩnh viễn">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
            })
            .join('');

        const totalQuantity = productsWithHolders.reduce((sum, p) => sum + (p.Quantity || 0), 0);
        const totalAmount = productsWithHolders.reduce(
            (sum, p) => sum + (p.Quantity || 0) * (p.Price || 0),
            0
        );

        container.innerHTML =
            searchUI +
            `
            <table class="chat-products-table">
                <thead>
                    <tr>
                        <th>Ảnh</th>
                        <th>Sản phẩm</th>
                        <th style="text-align: center;">SL</th>
                        <th style="text-align: right;">Đơn giá</th>
                        <th style="text-align: center;">Thao tác</th>
                    </tr>
                </thead>
                <tbody>
                    ${productsHTML}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" style="text-align: right;">Tổng cộng:</td>
                        <td style="text-align: center;">${totalQuantity}</td>
                        <td style="text-align: right; color: #ef4444; font-size: 14px;">${totalAmount.toLocaleString('vi-VN')}đ</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        `;
    }
    LEGACY_REMOVED_END */

    /**
     * Filter dropped products
     */
    window.filterDroppedProducts = async function (query) {
        let base = getFilteredDroppedProducts() || droppedProducts;

        if (!query || query.trim() === '') {
            await renderDroppedProductsTable(currentCampaignFilter === 'all' ? null : base);
            return;
        }

        const lowerQuery = query.toLowerCase().trim();
        const filtered = base.filter(
            (p) =>
                (p.ProductName && p.ProductName.toLowerCase().includes(lowerQuery)) ||
                (p.ProductNameGet && p.ProductNameGet.toLowerCase().includes(lowerQuery)) ||
                (p.ProductCode && p.ProductCode.toLowerCase().includes(lowerQuery))
        );

        await renderDroppedProductsTable(filtered);
    };

    /**
     * Render history list - DISABLED
     */
    function renderHistoryList() {
        const container = document.getElementById('chatHistoryContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="chat-empty-products" style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <i class="fas fa-history" style="font-size: 40px; margin-bottom: 12px; opacity: 0.3;"></i>
                <p style="font-size: 14px; margin: 0; color: #64748b;">Lịch sử đã tắt</p>
                <p style="font-size: 12px; margin-top: 4px;">Tính năng này đã được tắt để tiết kiệm chi phí</p>
            </div>
        `;
    }

    /**
     * Update dropped product counts in UI
     */
    function updateDroppedCounts() {
        const totalQuantity = droppedProducts.reduce((sum, p) => sum + (p.Quantity || 0), 0);
        const totalAmount = droppedProducts.reduce(
            (sum, p) => sum + (p.Quantity || 0) * (p.Price || 0),
            0
        );

        const badge = document.getElementById('chatDroppedCountBadge');
        if (badge) badge.textContent = totalQuantity;

        const footerTotal = document.getElementById('chatDroppedTotal');
        if (footerTotal) footerTotal.textContent = `${totalAmount.toLocaleString('vi-VN')}đ`;

        const countEl = document.getElementById('droppedProductCount');
        if (countEl) countEl.textContent = totalQuantity;
    }

    /**
     * Switch between tabs
     */
    window.switchChatPanelTab = function (tabName) {
        const buttons = document.querySelectorAll('.chat-tab-btn');
        buttons.forEach((btn) => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.style.background = isActive ? 'white' : '#f8fafc';
            btn.style.color = isActive ? '#3b82f6' : '#64748b';
            btn.style.borderBottomColor = isActive ? '#3b82f6' : 'transparent';
        });

        const contents = document.querySelectorAll('.chat-tab-content');
        contents.forEach((content) => { content.style.display = 'none'; });

        const activeContent = document.getElementById(
            tabName === 'orders'
                ? 'chatTabOrders'
                : tabName === 'dropped'
                  ? 'chatTabDropped'
                  : tabName === 'history'
                    ? 'chatTabHistory'
                    : 'chatTabInvoiceHistory'
        );

        if (activeContent) activeContent.style.display = 'flex';

        if (tabName === 'dropped') {
            // Render active sub-tab (default: xasha)
            const activeSubBtn = document.querySelector('.dropped-subtab-btn.active');
            const activeBucket = activeSubBtn ? activeSubBtn.dataset.bucket : 'xasha';
            if (activeBucket === 'kho') {
                renderWarehouseProductsTable();
            } else {
                renderDroppedProductsTable();
            }
        } else if (tabName === 'history') {
            renderHistoryList();
        } else if (tabName === 'invoice_history') {
            if (window.chatProductManager && typeof window.chatProductManager.renderInvoiceHistory === 'function') {
                window.chatProductManager.renderInvoiceHistory();
            }
        }
    };

    /**
     * Clear all dropped products
     */
    window.clearAllDroppedProducts = async function () {
        let confirmed = false;
        if (window.CustomPopup) {
            confirmed = await window.CustomPopup.confirm(
                'Bạn có chắc muốn xóa toàn bộ danh sách hàng rớt?',
                'Xác nhận xóa tất cả'
            );
        } else {
            confirmed = confirm('Bạn có chắc muốn xóa toàn bộ danh sách hàng rớt?');
        }

        if (!confirmed) return;

        try {
            const resp = await fetch(`${RENDER_API}/api/realtime/dropped-products/all`, {
                method: 'DELETE',
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            showSuccess('Đã xóa tất cả hàng rớt - xả');
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error clearing:', error);
            showError('Lỗi khi xóa: ' + error.message);
        }
    };

    // =====================================================
    // GETTERS FOR EXTERNAL MODULES
    // =====================================================

    window.getDroppedProducts = function () {
        return droppedProducts;
    };

    // Deprecated - kept for compatibility
    window.getDroppedFirebaseDb = function () {
        return null;
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initDroppedProductsManager, 500);
        });
    } else {
        setTimeout(initDroppedProductsManager, 500);
    }

})();
