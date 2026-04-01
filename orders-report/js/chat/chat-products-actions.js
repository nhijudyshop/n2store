/* =====================================================
   CHAT PRODUCTS ACTIONS
   Handles product actions in chat modal:
   - confirmHeldProduct: held → main (API PUT)
   - deleteHeldProduct: remove held product
   - updateHeldProductQuantityById: +/- quantity
   - decreaseMainProductQuantityById: reduce main product
   - updateChatProductNote: update product note
   ===================================================== */

(function () {
    'use strict';

    // Lock to prevent double-clicks
    const actionLocks = new Set();

    function acquireLock(key) {
        if (actionLocks.has(key)) return false;
        actionLocks.add(key);
        return true;
    }

    function releaseLock(key) {
        actionLocks.delete(key);
    }

    // =====================================================
    // CONFIRM HELD PRODUCT → MAIN PRODUCT
    // =====================================================

    /**
     * Confirm a held product - add to order via API
     */
    window.confirmHeldProduct = async function (productId) {
        productId = Number(productId);
        const lockKey = `confirm_${productId}`;

        if (!acquireLock(lockKey)) {
            console.warn('[ChatProducts-Actions] Confirm already in progress for', productId);
            return;
        }

        try {
            const orderData = window.currentChatOrderData;
            if (!orderData) {
                showError('Không có dữ liệu đơn hàng');
                return;
            }

            // Find held product
            const heldIndex = orderData.Details.findIndex(
                p => p.ProductId === productId && p.IsHeld
            );

            if (heldIndex === -1) {
                showError('Không tìm thấy sản phẩm giữ');
                return;
            }

            const heldProduct = orderData.Details[heldIndex];
            const quantity = heldProduct.Quantity || 1;

            // Fetch fresh order data
            const freshOrder = await fetchFreshOrderData(orderData.Id);
            if (!freshOrder) {
                showError('Không thể tải dữ liệu đơn hàng mới nhất');
                return;
            }

            // Fetch full product details for accurate info
            let fullProduct = null;
            try {
                if (window.productSearchManager) {
                    fullProduct = await window.productSearchManager.getFullProductDetails(productId, true);
                }
                if (!fullProduct) {
                    const headers = await window.tokenManager.getAuthHeader();
                    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Product(${productId})?$expand=UOM,Images`;
                    const resp = await API_CONFIG.smartFetch(apiUrl, {
                        headers: { ...headers, 'Content-Type': 'application/json', 'Accept': 'application/json' }
                    });
                    if (resp.ok) fullProduct = await resp.json();
                }
            } catch (e) {
                console.warn('[ChatProducts-Actions] Could not fetch full product details:', e);
            }

            // Remove held product from local
            orderData.Details.splice(heldIndex, 1);

            // Build new Details for API
            let newDetails = [...(freshOrder.Details || [])];

            // Check if product already exists in main list → merge
            const existingMainIndex = newDetails.findIndex(d => d.ProductId === productId);

            if (existingMainIndex > -1) {
                newDetails[existingMainIndex].Quantity += quantity;
            } else {
                // Add new main product entry
                newDetails.push({
                    ProductId: productId,
                    Quantity: quantity,
                    Price: heldProduct.Price || (fullProduct?.PriceVariant || fullProduct?.ListPrice || 0),
                    Note: heldProduct.Note || null,
                    UOMId: heldProduct.UOMId || (fullProduct?.UOM?.Id || 1),
                    Factor: 1,
                    Priority: 0
                });
            }

            // Calculate totals
            const totalAmount = newDetails.reduce((sum, d) => sum + ((d.Quantity || 0) * (d.Price || 0)), 0);
            const totalQuantity = newDetails.reduce((sum, d) => sum + (d.Quantity || 0), 0);

            // PUT to API
            if (typeof updateOrderWithFullPayload === 'function') {
                await updateOrderWithFullPayload(freshOrder, newDetails, totalAmount, totalQuantity);
            } else if (typeof window.updateOrderWithFullPayload === 'function') {
                await window.updateOrderWithFullPayload(freshOrder, newDetails, totalAmount, totalQuantity);
            } else {
                throw new Error('updateOrderWithFullPayload not available');
            }

            // Remove from Firebase held_products
            await removeHeldFromFirebase(orderData.Id, productId);

            // Remove from dropped products list if it came from there
            // Check both IsFromDropped flag and actual presence in dropped list
            if (typeof window.removeDroppedProductByProductId === 'function') {
                const droppedProducts = typeof window.getDroppedProducts === 'function' ? window.getDroppedProducts() : [];
                const inDropped = droppedProducts.some(p => Number(p.ProductId) === productId);
                if (heldProduct.IsFromDropped || inDropped) {
                    await window.removeDroppedProductByProductId(productId);
                }
            }

            // Invalidate cache
            if (typeof window.invalidateOrderDetailsCache === 'function') {
                window.invalidateOrderDetailsCache(orderData.Id);
            }

            // KPI audit log
            if (window.kpiAuditLogger) {
                const source = heldProduct.IsFromDropped ? 'chat_from_dropped' : 'chat_confirm_held';
                window.kpiAuditLogger.logProductAction({
                    orderId: orderData.Id,
                    action: 'add',
                    productId: productId,
                    productCode: heldProduct.ProductCode || heldProduct.Code || '',
                    productName: heldProduct.ProductName || heldProduct.Name || '',
                    quantity: quantity,
                    source: source
                });
            }

            // Reload order data for UI
            await window.loadChatOrderProducts(orderData.Id);

            // Update main table row if visible
            updateMainTableRow(orderData.Id, totalAmount, totalQuantity);

            showSuccess('Đã xác nhận và thêm vào đơn hàng');

        } catch (error) {
            console.error('[ChatProducts-Actions] Confirm error:', error);
            showError('Lỗi xác nhận sản phẩm: ' + error.message);
        } finally {
            releaseLock(lockKey);
        }
    };

    // =====================================================
    // DELETE HELD PRODUCT
    // =====================================================

    /**
     * Delete a held product from the order
     */
    window.deleteHeldProduct = async function (productId) {
        productId = Number(productId);

        const orderData = window.currentChatOrderData;
        if (!orderData) return;

        const heldIndex = orderData.Details.findIndex(
            p => p.ProductId === productId && p.IsHeld
        );

        if (heldIndex === -1) {
            showError('Không tìm thấy sản phẩm giữ');
            return;
        }

        const heldProduct = orderData.Details[heldIndex];
        const productName = heldProduct.ProductNameGet || heldProduct.ProductName || 'sản phẩm';

        // Confirm
        let confirmed = false;
        if (window.CustomPopup) {
            confirmed = await window.CustomPopup.confirm(`Xóa "${productName}" khỏi danh sách giữ?`, 'Xác nhận xóa');
        } else {
            confirmed = confirm(`Xóa "${productName}"?`);
        }
        if (!confirmed) return;

        try {
            // If from dropped → return to dropped products
            if (heldProduct.IsFromDropped) {
                if (typeof window.addToDroppedProducts === 'function') {
                    await window.addToDroppedProducts(heldProduct, heldProduct.Quantity, 'returned_from_held');
                }
            }

            // Remove from local
            orderData.Details.splice(heldIndex, 1);

            // Remove from Firebase
            await removeHeldFromFirebase(orderData.Id, productId);

            // Re-render
            window.renderChatProductsTable();

            // Re-render dropped tab
            if (typeof window.renderDroppedProductsTable === 'function') {
                window.renderDroppedProductsTable();
            }

            showSuccess('Đã xóa sản phẩm giữ');

        } catch (error) {
            console.error('[ChatProducts-Actions] Delete error:', error);
            showError('Lỗi xóa sản phẩm: ' + error.message);
        }
    };

    // =====================================================
    // UPDATE HELD PRODUCT QUANTITY
    // =====================================================

    /**
     * Update held product quantity by delta or specific value
     */
    window.updateHeldProductQuantityById = function (productId, delta, specificValue) {
        productId = Number(productId);

        const orderData = window.currentChatOrderData;
        if (!orderData) return;

        const held = orderData.Details.find(p => p.ProductId === productId && p.IsHeld);
        if (!held) return;

        let newQty;
        if (specificValue !== undefined && specificValue !== null) {
            newQty = Math.max(1, specificValue);
        } else {
            newQty = Math.max(1, (held.Quantity || 1) + delta);
        }

        held.Quantity = newQty;

        // Sync to Firebase
        syncHeldQuantityToFirebase(orderData.Id, productId, newQty);

        // Re-render
        window.renderChatProductsTable();
    };

    /**
     * Sync held quantity to Firebase
     */
    async function syncHeldQuantityToFirebase(orderId, productId, quantity) {
        if (!window.firebase || !window.authManager) return;

        try {
            const auth = window.authManager.getAuthState();
            if (!auth) return;

            let userId = auth.id || auth.Id || auth.username || auth.userType;
            if (!userId && auth.displayName) {
                userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');
            }
            if (!userId) return;

            const ref = window.firebase.database().ref(`held_products/${orderId}/${productId}/${userId}`);
            await ref.update({
                quantity: quantity,
                timestamp: window.firebase.database.ServerValue.TIMESTAMP
            });
        } catch (e) {
            console.error('[ChatProducts-Actions] Firebase sync error:', e);
        }
    }

    // =====================================================
    // DECREASE MAIN PRODUCT QUANTITY
    // =====================================================

    /**
     * Decrease main product quantity by 1
     * When quantity reaches 0 → moves to dropped products
     */
    window.decreaseMainProductQuantityById = async function (productId) {
        productId = Number(productId);
        const lockKey = `decrease_${productId}`;

        if (!acquireLock(lockKey)) return;

        try {
            const orderData = window.currentChatOrderData;
            if (!orderData) {
                showError('Không có dữ liệu đơn hàng');
                return;
            }

            const mainProduct = orderData.Details.find(
                p => p.ProductId === productId && !p.IsHeld
            );
            if (!mainProduct) {
                showError('Không tìm thấy sản phẩm');
                return;
            }

            const productName = mainProduct.ProductNameGet || mainProduct.ProductName || 'sản phẩm';
            const currentQty = mainProduct.Quantity || 0;

            // Confirm
            const msg = currentQty <= 1
                ? `Giảm "${productName}" về 0 sẽ chuyển sang hàng rớt xả. Tiếp tục?`
                : `Giảm số lượng "${productName}" từ ${currentQty} xuống ${currentQty - 1}?`;

            let confirmed = false;
            if (window.CustomPopup) {
                confirmed = await window.CustomPopup.confirm(msg, 'Xác nhận giảm');
            } else {
                confirmed = confirm(msg);
            }
            if (!confirmed) return;

            // Fetch fresh order data
            const freshOrder = await fetchFreshOrderData(orderData.Id);
            if (!freshOrder) {
                showError('Không thể tải dữ liệu đơn hàng mới nhất');
                return;
            }

            let newDetails = [...(freshOrder.Details || [])];
            const freshIndex = newDetails.findIndex(d => d.ProductId === productId);

            if (freshIndex === -1) {
                showError('Sản phẩm không còn trong đơn hàng');
                return;
            }

            const freshProduct = newDetails[freshIndex];
            const freshQty = freshProduct.Quantity || 0;

            if (freshQty <= 1) {
                // Remove entirely → move to dropped
                newDetails.splice(freshIndex, 1);

                // Add to dropped products
                if (typeof window.addToDroppedProducts === 'function') {
                    const userName = getUserDisplayName();
                    const orderSTT = orderData.SessionIndex || '';
                    const customerName = orderData.Partner?.Name || window.currentCustomerName || '';

                    await window.addToDroppedProducts(mainProduct, 1, 'removed', null, {
                        removedBy: userName,
                        removedFromOrderSTT: orderSTT,
                        removedFromCustomer: customerName,
                        removedAt: Date.now()
                    });
                }
            } else {
                // Decrease by 1
                newDetails[freshIndex].Quantity = freshQty - 1;
            }

            // Calculate totals
            const totalAmount = newDetails.reduce((sum, d) => sum + ((d.Quantity || 0) * (d.Price || 0)), 0);
            const totalQuantity = newDetails.reduce((sum, d) => sum + (d.Quantity || 0), 0);

            // PUT to API
            if (typeof updateOrderWithFullPayload === 'function') {
                await updateOrderWithFullPayload(freshOrder, newDetails, totalAmount, totalQuantity);
            } else if (typeof window.updateOrderWithFullPayload === 'function') {
                await window.updateOrderWithFullPayload(freshOrder, newDetails, totalAmount, totalQuantity);
            }

            // Invalidate cache
            if (typeof window.invalidateOrderDetailsCache === 'function') {
                window.invalidateOrderDetailsCache(orderData.Id);
            }

            // KPI audit log
            if (window.kpiAuditLogger) {
                window.kpiAuditLogger.logProductAction({
                    orderId: orderData.Id,
                    action: 'remove',
                    productId: productId,
                    productCode: mainProduct.ProductCode || mainProduct.Code || '',
                    productName: mainProduct.ProductName || mainProduct.Name || '',
                    quantity: 1,
                    source: 'chat_decrease'
                });
            }

            // Reload order data
            await window.loadChatOrderProducts(orderData.Id);

            // Update main table row
            updateMainTableRow(orderData.Id, totalAmount, totalQuantity);

            showSuccess(freshQty <= 1 ? 'Đã chuyển sản phẩm sang hàng rớt xả' : 'Đã giảm số lượng');

        } catch (error) {
            console.error('[ChatProducts-Actions] Decrease error:', error);
            showError('Lỗi giảm số lượng: ' + error.message);
        } finally {
            releaseLock(lockKey);
        }
    };

    // =====================================================
    // UPDATE PRODUCT NOTE
    // =====================================================

    /**
     * Update product note (main or held)
     */
    window.updateChatProductNote = async function (productId, newNote) {
        productId = Number(productId);

        const orderData = window.currentChatOrderData;
        if (!orderData) return;

        // Find product
        const product = orderData.Details.find(p => p.ProductId === productId);
        if (!product) return;

        // Same note → skip
        if ((product.Note || '') === (newNote || '')) return;

        if (product.IsHeld) {
            // Held product: update locally only
            product.Note = newNote;
            return;
        }

        // Main product: update via API
        try {
            const freshOrder = await fetchFreshOrderData(orderData.Id);
            if (!freshOrder) return;

            let newDetails = [...(freshOrder.Details || [])];
            const idx = newDetails.findIndex(d => d.ProductId === productId);
            if (idx === -1) return;

            newDetails[idx].Note = newNote;

            const totalAmount = newDetails.reduce((sum, d) => sum + ((d.Quantity || 0) * (d.Price || 0)), 0);
            const totalQuantity = newDetails.reduce((sum, d) => sum + (d.Quantity || 0), 0);

            if (typeof updateOrderWithFullPayload === 'function') {
                await updateOrderWithFullPayload(freshOrder, newDetails, totalAmount, totalQuantity);
            } else if (typeof window.updateOrderWithFullPayload === 'function') {
                await window.updateOrderWithFullPayload(freshOrder, newDetails, totalAmount, totalQuantity);
            }

            // Invalidate cache
            if (typeof window.invalidateOrderDetailsCache === 'function') {
                window.invalidateOrderDetailsCache(orderData.Id);
            }

            // Update local
            product.Note = newNote;

        } catch (error) {
            console.error('[ChatProducts-Actions] Note update error:', error);
        }
    };

    // =====================================================
    // HELPERS
    // =====================================================

    /**
     * Fetch fresh order data from API (bypass cache)
     */
    async function fetchFreshOrderData(orderId) {
        try {
            const headers = await window.tokenManager.getAuthHeader();
            const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
            const response = await API_CONFIG.smartFetch(apiUrl, {
                headers: { ...headers, 'Content-Type': 'application/json', 'Accept': 'application/json' }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('[ChatProducts-Actions] Fetch fresh order error:', error);
            return null;
        }
    }

    /**
     * Remove held product from Firebase
     */
    async function removeHeldFromFirebase(orderId, productId) {
        if (!window.firebase || !window.authManager) return;

        try {
            const auth = window.authManager.getAuthState();
            if (!auth) return;

            let userId = auth.id || auth.Id || auth.username || auth.userType;
            if (!userId && auth.displayName) {
                userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');
            }
            if (!userId) return;

            const ref = window.firebase.database().ref(`held_products/${orderId}/${productId}/${userId}`);
            await ref.remove();
        } catch (e) {
            console.error('[ChatProducts-Actions] Firebase remove error:', e);
        }
    }

    /**
     * Update the main orders table row with new totals
     */
    function updateMainTableRow(orderId, totalAmount, totalQuantity) {
        const row = document.querySelector(`tr[data-order-id="${orderId}"]`);
        if (!row) return;

        // Update total amount cell
        const amountCell = row.querySelector('.order-amount');
        if (amountCell) {
            amountCell.textContent = totalAmount.toLocaleString('vi-VN') + 'đ';
        }

        // Update product count cell
        const qtyCell = row.querySelector('.order-quantity');
        if (qtyCell) {
            qtyCell.textContent = totalQuantity;
        }
    }

    function getUserDisplayName() {
        if (!window.authManager) return 'Unknown';
        const auth = window.authManager.getAuthState();
        return auth?.displayName || auth?.userType?.split('-')[0] || 'Unknown';
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
            console.error('[ChatProducts-Actions]', message);
        }
    }

})();
