// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Held Products Manager
 * Manages held products lifecycle - Render API sync, SSE listeners, cleanup
 * Migrated from Firebase Realtime Database (2026-04-05)
 *
 * Dependencies:
 * - window.authManager
 * - window.currentChatOrderData
 * - window.getDroppedProducts() - from dropped-products-manager.js
 * - window.clearHeldByIfNotHeld() - from dropped-products-manager.js
 * - window.renderChatProductsTable() - from chat-products-ui.js
 * - window.renderDroppedProductsTable() - from dropped-products-manager.js
 */
(function () {
    'use strict';

    const RENDER_API = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // Debounce timer for render functions
    let renderDebounceTimer = null;
    const RENDER_DEBOUNCE_MS = 150;

    // SSE EventSource for held products
    let heldSSESource = null;

    /**
     * Debounced render function
     */
    function debouncedRender() {
        if (renderDebounceTimer) {
            clearTimeout(renderDebounceTimer);
        }
        renderDebounceTimer = setTimeout(() => {
            if (typeof window.renderChatProductsTable === 'function') {
                window.renderChatProductsTable();
            }
            if (typeof window.renderDroppedProductsTable === 'function') {
                window.renderDroppedProductsTable();
            }
        }, RENDER_DEBOUNCE_MS);
    }

    // =====================================================
    // HELPER FUNCTIONS
    // =====================================================

    function getUserId() {
        if (!window.authManager) return null;

        const auth = window.authManager.getAuthState();
        if (!auth) return null;

        let userId = auth.id || auth.Id || auth.username || auth.userType;
        if (!userId && auth.displayName) {
            userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');
        }

        return userId || null;
    }

    function showSuccess(message) {
        if (window.notificationManager) {
            window.notificationManager.show(message, 'success');
        }
    }

    function showError(message) {
        if (window.notificationManager) {
            window.notificationManager.error(message);
        } else {
            console.error('[HELD-PRODUCTS] Error:', message);
        }
    }

    // =====================================================
    // SAVE HELD PRODUCTS
    // =====================================================

    /**
     * Save held products - marks them as persisted (isDraft: true)
     */
    window.saveHeldProducts = async function () {
        const userId = getUserId();
        if (!userId) {
            console.warn('[HELD-PRODUCTS] No userId found');
            return false;
        }

        const orderId = window.currentChatOrderData?.Id;
        if (!orderId) return false;

        try {
            // Get held products for this order from API
            const resp = await fetch(`${RENDER_API}/api/realtime/held-products/${orderId}`);
            if (!resp.ok) return false;

            const orderProducts = await resp.json();
            let savedCount = 0;

            for (const productId in orderProducts) {
                const productHolders = orderProducts[productId];
                if (productHolders && productHolders[userId] && !productHolders[userId].isDraft) {
                    // Update isDraft to true via API
                    await fetch(
                        `${RENDER_API}/api/realtime/held-products/${orderId}/${productId}/${userId}/draft`,
                        {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ isDraft: true }),
                        }
                    );
                    savedCount++;
                }
            }

            if (savedCount > 0) {
                showSuccess(`Đã lưu ${savedCount} sản phẩm đang giữ`);
            }

            if (typeof window.renderChatProductsTable === 'function') {
                window.renderChatProductsTable();
            }

            return true;
        } catch (error) {
            console.error('[HELD-PRODUCTS] Error saving:', error);
            showError('Lỗi khi lưu sản phẩm giữ');
            return false;
        }
    };

    // =====================================================
    // CLEANUP HELD PRODUCTS
    // =====================================================

    /**
     * Cleanup held products for current user when closing modal
     * Only removes temporary (isDraft: false) held products and returns them to dropped
     */
    window.cleanupHeldProducts = async function () {
        const userId = getUserId();
        if (!userId) return;

        const orderId = window.currentChatOrderData?.Id;
        if (!orderId) return;

        try {
            const resp = await fetch(`${RENDER_API}/api/realtime/held-products/${orderId}`);
            if (!resp.ok) return;

            const orderProducts = await resp.json();

            for (const productId in orderProducts) {
                const productHolders = orderProducts[productId];
                if (productHolders && productHolders[userId]) {
                    const holderData = productHolders[userId];

                    // Only cleanup temporary holds (isDraft === false)
                    if (holderData.isDraft === true) continue;

                    // Remove this user's hold via API
                    // For web-warehouse sourced products, releasing the hold auto-restores available_qty
                    // (available_qty = quantity - SUM(held), so deleting held row restores it)
                    await fetch(
                        `${RENDER_API}/api/realtime/held-products/${orderId}/${productId}/${userId}`,
                        { method: 'DELETE' }
                    );

                    // Also try web-warehouse hold endpoint (productId here is product_code for kho products)
                    const WAREHOUSE_API = `${RENDER_API}/api/v2/web-warehouse`;
                    await fetch(
                        `${WAREHOUSE_API}/hold/${orderId}/${encodeURIComponent(productId)}/${userId}`,
                        { method: 'DELETE' }
                    ).catch(() => {});

                    if (typeof window.clearHeldByIfNotHeld === 'function') {
                        await window.clearHeldByIfNotHeld(productId);
                    }
                }
            }
        } catch (error) {
            console.error('[HELD-PRODUCTS] Error cleaning up:', error);
        }
    };

    // =====================================================
    // UPDATE HELD PRODUCT QUANTITY
    // =====================================================

    /**
     * Update held product quantity via API
     */
    window.updateHeldProductQuantity = async function (productId, quantity) {
        const normalizedProductId = parseInt(productId);
        if (isNaN(normalizedProductId)) return;

        const userId = getUserId();
        const orderId = window.currentChatOrderData?.Id;
        if (!userId || !orderId) return;

        try {
            if (quantity > 0) {
                await fetch(
                    `${RENDER_API}/api/realtime/held-products/${orderId}/${normalizedProductId}/${userId}/quantity`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ quantity }),
                    }
                );
            } else {
                // Remove if quantity is 0
                await fetch(
                    `${RENDER_API}/api/realtime/held-products/${orderId}/${normalizedProductId}/${userId}`,
                    { method: 'DELETE' }
                );

                if (typeof window.clearHeldByIfNotHeld === 'function') {
                    await window.clearHeldByIfNotHeld(normalizedProductId);
                }
            }
        } catch (error) {
            console.error('[HELD-PRODUCTS] Error updating quantity:', error);
        }
    };

    // =====================================================
    // REMOVE HELD PRODUCT
    // =====================================================

    /**
     * Remove held product via API
     */
    window.removeHeldProduct = async function (productId) {
        const normalizedProductId = parseInt(productId);
        if (isNaN(normalizedProductId)) return;

        const userId = getUserId();
        const orderId = window.currentChatOrderData?.Id;
        if (!userId || !orderId) return;

        try {
            await fetch(
                `${RENDER_API}/api/realtime/held-products/${orderId}/${normalizedProductId}/${userId}`,
                { method: 'DELETE' }
            );

            if (typeof window.clearHeldByIfNotHeld === 'function') {
                await window.clearHeldByIfNotHeld(normalizedProductId);
            }
        } catch (error) {
            console.error('[HELD-PRODUCTS] Error removing:', error);
        }
    };

    // =====================================================
    // REALTIME LISTENER (SSE)
    // =====================================================

    /**
     * Setup SSE listener for held products changes
     * Syncs changes from other users in real-time
     */
    window.setupHeldProductsListener = function () {
        const orderId = window.currentChatOrderData?.Id;
        if (!orderId) return;

        // Cleanup any existing listener
        if (heldSSESource) {
            heldSSESource.close();
            heldSSESource = null;
        }
        if (window.heldProductsListener) {
            if (window.heldProductsListener.close) window.heldProductsListener.close();
            window.heldProductsListener = null;
        }

        const sseKey = `held_products/${orderId}`;
        const sseUrl = `${RENDER_API}/api/realtime/sse?keys=${encodeURIComponent(sseKey)}`;

        try {
            heldSSESource = new EventSource(sseUrl);

            const handleHeldUpdate = async () => {
                // Re-fetch held products for this order and update UI
                try {
                    const resp = await fetch(`${RENDER_API}/api/realtime/held-products/${orderId}`);
                    if (!resp.ok) return;

                    const heldData = await resp.json();

                    if (window.currentChatOrderData && window.currentChatOrderData.Details) {
                        // Save existing held products info
                        const existingHeldProducts = {};
                        window.currentChatOrderData.Details.filter((p) => p.IsHeld).forEach((p) => {
                            existingHeldProducts[p.ProductId] = {
                                ProductId: p.ProductId,
                                ProductName: p.ProductName,
                                ProductNameGet: p.ProductNameGet,
                                ProductCode: p.ProductCode,
                                ImageUrl: p.ImageUrl,
                                Price: p.Price,
                                UOMId: p.UOMId,
                                UOMName: p.UOMName,
                                IsFromSearch: p.IsFromSearch,
                                IsFromDropped: p.IsFromDropped,
                                StockQty: p.StockQty,
                            };
                        });

                        // Remove old held products
                        window.currentChatOrderData.Details =
                            window.currentChatOrderData.Details.filter((p) => !p.IsHeld);

                        const droppedProducts =
                            typeof window.getDroppedProducts === 'function'
                                ? window.getDroppedProducts()
                                : [];

                        // Add current held products from API data
                        for (const productId in heldData) {
                            const productHolders = heldData[productId];

                            let totalQuantity = 0;
                            let holders = [];
                            let isFromSearch = false;
                            let apiProductInfo = null;

                            for (const odooUserId in productHolders) {
                                const holderData = productHolders[odooUserId];
                                if (holderData && (parseInt(holderData.quantity) || 0) > 0) {
                                    totalQuantity += parseInt(holderData.quantity) || 0;
                                    holders.push(holderData.displayName);
                                    if (holderData.isFromSearch) isFromSearch = true;
                                    if (!apiProductInfo && holderData.productName) {
                                        apiProductInfo = {
                                            ProductName: holderData.productName,
                                            ProductNameGet:
                                                holderData.productNameGet || holderData.productName,
                                            ProductCode: holderData.productCode || '',
                                            ImageUrl: holderData.imageUrl || '',
                                            Price: holderData.price || 0,
                                            UOMName: holderData.uomName || 'Cái',
                                        };
                                    }
                                }
                            }

                            if (totalQuantity > 0) {
                                const existingHeld = existingHeldProducts[parseInt(productId)];
                                const droppedProduct = droppedProducts.find(
                                    (p) => String(p.ProductId) === String(productId)
                                );
                                const productSource =
                                    existingHeld || droppedProduct || apiProductInfo;

                                if (productSource) {
                                    const isFromDropped =
                                        !!droppedProduct ||
                                        (existingHeld && existingHeld.IsFromDropped);

                                    window.currentChatOrderData.Details.push({
                                        ProductId: parseInt(productId),
                                        ProductName: productSource.ProductName,
                                        ProductCode: productSource.ProductCode,
                                        ProductNameGet:
                                            productSource.ProductNameGet ||
                                            productSource.ProductName,
                                        ImageUrl: productSource.ImageUrl,
                                        Price: productSource.Price,
                                        Quantity: totalQuantity,
                                        UOMId: productSource.UOMId || 1,
                                        UOMName: productSource.UOMName || 'Cái',
                                        Factor: 1,
                                        Priority: 0,
                                        OrderId: window.currentChatOrderData.Id,
                                        LiveCampaign_DetailId: null,
                                        ProductWeight: 0,
                                        Note: null,
                                        IsHeld: true,
                                        IsFromDropped: isFromDropped,
                                        IsFromSearch: isFromSearch || productSource.IsFromSearch,
                                        StockQty: productSource.StockQty || 0,
                                        HeldBy: holders.join(', '),
                                    });
                                } else {
                                    console.warn(
                                        '[HELD-PRODUCTS] Product not found in any source:',
                                        productId
                                    );
                                    window.currentChatOrderData.Details.push({
                                        ProductId: parseInt(productId),
                                        ProductName: `Sản phẩm #${productId}`,
                                        ProductCode: '',
                                        ProductNameGet: `Sản phẩm #${productId}`,
                                        ImageUrl: '',
                                        Price: 0,
                                        Quantity: totalQuantity,
                                        UOMId: 1,
                                        UOMName: 'Cái',
                                        Factor: 1,
                                        Priority: 0,
                                        OrderId: window.currentChatOrderData.Id,
                                        LiveCampaign_DetailId: null,
                                        ProductWeight: 0,
                                        Note: null,
                                        IsHeld: true,
                                        IsFromSearch: isFromSearch,
                                        HeldBy: holders.join(', '),
                                    });
                                }
                            }
                        }

                        debouncedRender();
                    }
                } catch (err) {
                    console.warn('[HELD-PRODUCTS] Error handling SSE update:', err);
                }
            };

            heldSSESource.addEventListener('update', handleHeldUpdate);
            heldSSESource.addEventListener('created', handleHeldUpdate);
            heldSSESource.addEventListener('deleted', handleHeldUpdate);

            heldSSESource.addEventListener('connected', () => {
                console.log('[HELD-PRODUCTS] SSE connected for', sseKey);
                // Initial load of held products
                handleHeldUpdate();
            });

            heldSSESource.onerror = () => {
                console.warn('[HELD-PRODUCTS] SSE disconnected');
            };

            // Store reference for cleanup
            window.heldProductsListener = heldSSESource;
        } catch (e) {
            console.warn('[HELD-PRODUCTS] SSE setup failed:', e);
        }
    };

    /**
     * Cleanup held products listener
     */
    window.cleanupHeldProductsListener = function () {
        if (heldSSESource) {
            heldSSESource.close();
            heldSSESource = null;
        }
        if (window.heldProductsListener) {
            if (window.heldProductsListener.close) window.heldProductsListener.close();
            window.heldProductsListener = null;
        }
    };

    // =====================================================
    // PAGE UNLOAD CLEANUP
    // =====================================================

    /**
     * Remove temporary held products for current user when leaving page
     */
    window.cleanupAllUserHeldProducts = async function () {
        const userId = getUserId();
        if (!userId) return;

        try {
            const droppedProducts =
                typeof window.getDroppedProducts === 'function' ? window.getDroppedProducts() : [];

            // We need to scan all orders. Since there's no "get all held by user" API,
            // use the current order. For a full scan, we'd need a dedicated endpoint.
            // For now, clean up current order only (most common case)
            const orderId = window.currentChatOrderData?.Id;
            if (!orderId) return;

            const resp = await fetch(`${RENDER_API}/api/realtime/held-products/${orderId}`);
            if (!resp.ok) return;

            const orderProducts = await resp.json();

            for (const productId in orderProducts) {
                const productHolders = orderProducts[productId];
                if (productHolders && productHolders[userId]) {
                    const holderData = productHolders[userId];

                    if (holderData.isDraft === true) continue;

                    // Remove held product
                    // For web-warehouse products, releasing hold auto-restores available_qty
                    await fetch(
                        `${RENDER_API}/api/realtime/held-products/${orderId}/${productId}/${userId}`,
                        { method: 'DELETE' }
                    ).catch(() => {});

                    // Also try web-warehouse hold release
                    const WAREHOUSE_API = `${RENDER_API}/api/v2/web-warehouse`;
                    await fetch(
                        `${WAREHOUSE_API}/hold/${orderId}/${encodeURIComponent(productId)}/${userId}`,
                        { method: 'DELETE' }
                    ).catch(() => {});
                }
            }
        } catch (error) {
            console.error('[HELD-PRODUCTS] Error cleaning up all held products:', error);
        }
    };

    /**
     * Synchronous cleanup for beforeunload (sendBeacon approach)
     */
    window.cleanupHeldProductsSync = function () {
        const userId = getUserId();
        if (!userId) return;

        try {
            const cleanupInfo = {
                userId: userId,
                timestamp: Date.now(),
                pending: true,
            };
            localStorage.setItem('orders_held_cleanup_pending', JSON.stringify(cleanupInfo));
        } catch (e) {
            console.error('[HELD-PRODUCTS] Failed to mark cleanup pending:', e);
        }
    };

    /**
     * Check and complete any pending cleanup from previous session
     */
    window.checkPendingHeldCleanup = async function () {
        try {
            const pendingCleanup = localStorage.getItem('orders_held_cleanup_pending');
            if (!pendingCleanup) return;

            const cleanupInfo = JSON.parse(pendingCleanup);

            if (cleanupInfo.pending && Date.now() - cleanupInfo.timestamp < 3600000) {
                await window.cleanupAllUserHeldProducts();
            }

            localStorage.removeItem('orders_held_cleanup_pending');
        } catch (e) {
            console.error('[HELD-PRODUCTS] Error checking pending cleanup:', e);
            localStorage.removeItem('orders_held_cleanup_pending');
        }
    };
})();
