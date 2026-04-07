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
        const delBtn = document.getElementById('droppedFabDelete');
        const has = _droppedSelectedIds.size > 0;
        if (sendBtn) sendBtn.disabled = !has;
        if (delBtn) delBtn.disabled = !has;
    }

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

        const allProducts = filteredProducts || droppedProducts;

        // Apply search + category filter
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

        const pills = [
            { id: 'all', label: 'ALL' },
            { id: 'ao', label: 'Áo' },
            { id: 'quan', label: 'Quần' },
            { id: 'set', label: 'Set' },
            { id: 'giay', label: 'GIÀY' },
            { id: 'pk', label: 'PK' },
        ];
        const toolbarHTML = `
            <div class="dropped-toolbar">
                <div class="dropped-search-wrap">
                    <i class="fas fa-search"></i>
                    <input type="text" id="droppedGridSearchInput" class="dropped-search" placeholder="Tìm kiếm sản phẩm..." value="${(_droppedSearchText || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="dropped-pills">
                    ${pills.map((p) => `<button type="button" class="dropped-pill ${_droppedCategoryFilter === p.id ? 'active' : ''}" data-cat="${p.id}">${p.label}</button>`).join('')}
                </div>
            </div>
        `;

        if (products.length === 0) {
            container.innerHTML = toolbarHTML + `
                <div class="chat-empty-products" style="text-align:center; padding:40px 20px; color:#94a3b8;">
                    <i class="fas fa-box-open" style="font-size:40px; margin-bottom:12px; opacity:0.5;"></i>
                    <p style="font-size:14px; margin:0;">${allProducts.length === 0 ? 'Chưa có hàng rớt - xả' : 'Không có sản phẩm phù hợp'}</p>
                </div>
            `;
            _wireDroppedToolbar();
            _updateDroppedFabState();
            return;
        }

        // Fetch holders (only used to mark held items)
        const productsWithHolders = await Promise.all(
            products.map(async (p) => {
                const holders = await window.getProductHolders(p.ProductId);
                return {
                    ...p,
                    _holders: holders,
                };
            })
        );

        // Build cell HTML for image grid
        const cellsHTML = productsWithHolders.map((p) => {
            const isOutOfStock = (p.Quantity || 0) === 0;
            const productNameEscaped = (p.ProductNameGet || p.ProductName || '').replace(/"/g, '&quot;');
            const codeEscaped = (p.ProductCode || '').replace(/'/g, "\\'");
            const isSelected = _droppedSelectedIds.has(p.ProductId);

            let tooltipParts = [productNameEscaped];
            if (p.ProductCode) tooltipParts.push(`Mã: ${p.ProductCode}`);
            if (p.Quantity != null) tooltipParts.push(`SL: ${p.Quantity}`);
            if (p.Price) tooltipParts.push(`${(p.Price).toLocaleString('vi-VN')}đ`);
            if (p.campaignName) tooltipParts.push(`Live: ${p.campaignName}`);
            if (p.removedBy) tooltipParts.push(`Xả bởi: ${p.removedBy}`);
            if (isOutOfStock && p._holders && p._holders[0]) tooltipParts.push(`Đang giữ: ${p._holders[0].name}`);
            const tooltipText = tooltipParts.join('&#10;');

            const imgInner = p.ImageUrl
                ? `<img src="${p.ImageUrl}" alt="${productNameEscaped}" draggable="false">`
                : `<div class="dropped-cell-noimg"><i class="fas fa-box"></i></div>`;

            return `
                <div class="dropped-cell${isSelected ? ' selected' : ''}${isOutOfStock ? ' held' : ''}"
                     data-pid="${p.ProductId}"
                     data-name="${productNameEscaped}"
                     data-code="${codeEscaped}"
                     title="${tooltipText}">
                    ${imgInner}
                    <span class="dropped-cell-check"><i class="fas fa-check"></i></span>
                </div>
            `;
        }).join('');

        container.innerHTML = toolbarHTML + `<div class="dropped-grid" id="droppedGridContainer">${cellsHTML}</div>`;

        _wireDroppedToolbar();
        _wireDroppedGrid();
        _updateDroppedFabState();
    }

    function _wireDroppedToolbar() {
        const searchInput = document.getElementById('droppedGridSearchInput');
        if (searchInput) {
            let t = null;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(t);
                const v = e.target.value;
                t = setTimeout(() => {
                    _droppedSearchText = v;
                    renderDroppedProductsTable();
                    // Refocus
                    const i = document.getElementById('droppedGridSearchInput');
                    if (i) { i.focus(); i.setSelectionRange(v.length, v.length); }
                }, 150);
            });
        }
        document.querySelectorAll('#chatTabDropped .dropped-pill').forEach((btn) => {
            btn.addEventListener('click', () => {
                _droppedCategoryFilter = btn.dataset.cat;
                renderDroppedProductsTable();
            });
        });
        const sendBtn = document.getElementById('droppedFabSend');
        const delBtn = document.getElementById('droppedFabDelete');
        if (sendBtn && !sendBtn._wired) {
            sendBtn._wired = true;
            sendBtn.addEventListener('click', () => window._handleDroppedSendSelected());
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
                        <i class="fas fa-undo"></i>
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
                    " title="Gửi tên sản phẩm vào chat">
                        <i class="fas fa-paper-plane"></i>
                    </button>
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
            renderDroppedProductsTable();
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
