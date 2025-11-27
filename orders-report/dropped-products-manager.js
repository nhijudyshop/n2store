/**
 * Dropped Products Manager
 * Manages dropped/clearance products and history
 * Data is shared across all orders and stored in Firebase
 */

(function () {
    'use strict';

    // Firebase collection path for dropped products
    const DROPPED_PRODUCTS_COLLECTION = 'dropped_products';
    const HISTORY_COLLECTION = 'dropped_products_history';

    // Local state - FIREBASE IS THE SINGLE SOURCE OF TRUTH
    let droppedProducts = [];
    let historyItems = [];
    let isInitialized = false;
    let firebaseDb = null;
    let droppedProductsRef = null;
    let historyRef = null;
    let isFirstLoad = true;

    // Loading states for better UX during multi-user operations
    let operationsInProgress = new Set();

    /**
     * Initialize the dropped products manager
     * FIREBASE-ONLY: Multi-user collaborative editing mode
     */
    window.initDroppedProductsManager = async function () {
        if (isInitialized) return;

        console.log('[DROPPED-PRODUCTS] Initializing Firebase-only multi-user mode...');

        try {
            // Check Firebase availability
            if (!window.firebase || !window.firebase.database) {
                console.error('[DROPPED-PRODUCTS] Firebase not available - cannot initialize');
                showError('Firebase không khả dụng. Vui lòng tải lại trang.');
                return;
            }

            // Get Firebase database reference
            firebaseDb = window.firebase.database();

            // Setup realtime listeners - UI will update automatically
            loadDroppedProductsFromFirebase();
            loadHistoryFromFirebase();

            isInitialized = true;
            console.log('[DROPPED-PRODUCTS] ✓ Initialized with Firebase realtime multi-user sync');

            // Render initial loading state
            renderDroppedProductsTable();
            renderHistoryList();
            updateDroppedCounts();

        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Initialization error:', error);
            showError('Lỗi khởi tạo Firebase. Vui lòng tải lại trang.');
        }
    };

    /**
     * Load dropped products from Firebase with realtime listener
     * Uses child_added/changed/removed for granular updates (prevents double/lost data)
     */
    function loadDroppedProductsFromFirebase() {
        if (!firebaseDb) return;

        try {
            console.log('[DROPPED-PRODUCTS] Setting up granular realtime listeners for dropped_products');

            droppedProductsRef = firebaseDb.ref(DROPPED_PRODUCTS_COLLECTION);

            // Handle new items
            droppedProductsRef.on('child_added', (snapshot) => {
                const itemId = snapshot.key;
                const itemData = snapshot.val();

                // Check if item already exists by ID (prevent duplicates)
                const existingIndex = droppedProducts.findIndex(p => p.id === itemId);

                if (existingIndex > -1) {
                    // Item already exists, skip (should not happen in normal flow)
                    if (!isFirstLoad) {
                        console.warn('[DROPPED-PRODUCTS] Duplicate add detected for ID:', itemId);
                    }
                    return;
                }

                // Add new item to local array
                droppedProducts.push({
                    id: itemId,
                    ...itemData
                });

                // Log for debugging (skip during initial load to reduce spam)
                if (!isFirstLoad) {
                    console.log('[DROPPED-PRODUCTS] ✓ Item added by user:', itemId, itemData.ProductNameGet);
                }

                // Update UI to show changes
                renderDroppedProductsTable();
                updateDroppedCounts();
            }, (error) => {
                console.error('[DROPPED-PRODUCTS] ❌ child_added error:', error);
            });

            // Handle updated items (e.g., quantity changes from other users)
            droppedProductsRef.on('child_changed', (snapshot) => {
                const itemId = snapshot.key;
                const itemData = snapshot.val();

                // Find and update existing item
                const existingIndex = droppedProducts.findIndex(p => p.id === itemId);

                if (existingIndex > -1) {
                    droppedProducts[existingIndex] = {
                        id: itemId,
                        ...itemData
                    };
                    console.log('[DROPPED-PRODUCTS] ✓ Item updated by user:', itemId, itemData.ProductNameGet);
                } else {
                    console.warn('[DROPPED-PRODUCTS] ⚠️ Update for non-existent item:', itemId);
                }

                // Update UI to reflect changes from other users
                renderDroppedProductsTable();
                updateDroppedCounts();
            }, (error) => {
                console.error('[DROPPED-PRODUCTS] ❌ child_changed error:', error);
            });

            // Handle removed items (deleted by other users)
            droppedProductsRef.on('child_removed', (snapshot) => {
                const itemId = snapshot.key;

                // Find and remove item from local array
                const existingIndex = droppedProducts.findIndex(p => p.id === itemId);

                if (existingIndex > -1) {
                    const removedItem = droppedProducts[existingIndex];
                    droppedProducts.splice(existingIndex, 1);
                    console.log('[DROPPED-PRODUCTS] ✓ Item removed by user:', itemId, removedItem.ProductNameGet);
                } else {
                    console.warn('[DROPPED-PRODUCTS] ⚠️ Remove for non-existent item:', itemId);
                }

                // Update UI to reflect removal
                renderDroppedProductsTable();
                updateDroppedCounts();
            }, (error) => {
                console.error('[DROPPED-PRODUCTS] ❌ child_removed error:', error);
            });

            // Mark first load complete after initial sync
            setTimeout(() => {
                isFirstLoad = false;
                console.log('[DROPPED-PRODUCTS] ✓ Initial sync complete:', droppedProducts.length, 'items loaded');
                console.log('[DROPPED-PRODUCTS] ✓ Real-time multi-user mode active');
            }, 1000);

        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error setting up listeners:', error);
        }
    }

    /**
     * Load history from Firebase with realtime listener
     * Uses child_added/changed/removed for granular updates
     */
    function loadHistoryFromFirebase() {
        if (!firebaseDb) return;

        try {
            console.log('[DROPPED-PRODUCTS] Setting up granular realtime listeners for history');

            historyRef = firebaseDb.ref(HISTORY_COLLECTION)
                .orderByChild('timestamp')
                .limitToLast(100);

            // Handle new history items
            historyRef.on('child_added', (snapshot) => {
                const itemId = snapshot.key;
                const itemData = snapshot.val();

                // Check if item already exists (prevent duplicates)
                const existingIndex = historyItems.findIndex(h => h.id === itemId);

                if (existingIndex === -1) {
                    // Add new item
                    const newItem = {
                        id: itemId,
                        ...itemData
                    };
                    historyItems.push(newItem);

                    // Sort by timestamp (newest first)
                    historyItems.sort((a, b) => b.timestamp - a.timestamp);

                    // Keep only last 100 items
                    if (historyItems.length > 100) {
                        historyItems = historyItems.slice(0, 100);
                    }

                    if (!isFirstLoad) {
                        console.log('[DROPPED-PRODUCTS] History item added:', itemId);
                    }
                } else if (!isFirstLoad) {
                    console.warn('[DROPPED-PRODUCTS] Duplicate history add detected for:', itemId, '- skipped');
                }

                // Update UI
                renderHistoryList();
            }, (error) => {
                console.error('[DROPPED-PRODUCTS] History child_added error:', error);
            });

            // Handle updated history items (rare, but possible)
            historyRef.on('child_changed', (snapshot) => {
                const itemId = snapshot.key;
                const itemData = snapshot.val();

                const existingIndex = historyItems.findIndex(h => h.id === itemId);

                if (existingIndex > -1) {
                    historyItems[existingIndex] = {
                        id: itemId,
                        ...itemData
                    };
                    // Re-sort
                    historyItems.sort((a, b) => b.timestamp - a.timestamp);
                    console.log('[DROPPED-PRODUCTS] History item updated:', itemId);
                } else {
                    console.warn('[DROPPED-PRODUCTS] History update for non-existent item:', itemId);
                }

                // Update UI
                renderHistoryList();
            }, (error) => {
                console.error('[DROPPED-PRODUCTS] History child_changed error:', error);
            });

            // Handle removed history items
            historyRef.on('child_removed', (snapshot) => {
                const itemId = snapshot.key;

                const existingIndex = historyItems.findIndex(h => h.id === itemId);

                if (existingIndex > -1) {
                    historyItems.splice(existingIndex, 1);
                    console.log('[DROPPED-PRODUCTS] History item removed:', itemId);
                } else {
                    console.warn('[DROPPED-PRODUCTS] History remove for non-existent item:', itemId);
                }

                // Update UI
                renderHistoryList();
            }, (error) => {
                console.error('[DROPPED-PRODUCTS] History child_removed error:', error);
            });

        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error setting up history listeners:', error);
        }
    }

    /**
     * Show error message to user
     */
    function showError(message) {
        if (window.notificationManager) {
            window.notificationManager.show(message, 'error');
        } else {
            console.error('[DROPPED-PRODUCTS]', message);
            alert(message);
        }
    }

    /**
     * Show success message to user
     */
    function showSuccess(message) {
        if (window.notificationManager) {
            window.notificationManager.show(message, 'success');
        }
    }

    /**
     * Cleanup Firebase listeners
     */
    window.cleanupDroppedProductsManager = function() {
        console.log('[DROPPED-PRODUCTS] Cleaning up listeners...');

        if (droppedProductsRef) {
            droppedProductsRef.off();
            droppedProductsRef = null;
        }

        if (historyRef) {
            historyRef.off();
            historyRef = null;
        }

        isInitialized = false;
        console.log('[DROPPED-PRODUCTS] Cleanup complete');
    };


    /**
     * Add product to dropped list
     * FIREBASE-ONLY: Uses transaction for atomic quantity updates in multi-user environment
     */
    window.addToDroppedProducts = async function (product, quantity, reason = 'removed') {
        if (!firebaseDb) {
            showError('Firebase không khả dụng');
            return;
        }

        console.log('[DROPPED-PRODUCTS] Adding product:', product.ProductNameGet, 'qty:', quantity);

        try {
            // Check if product already exists
            const existing = droppedProducts.find(p => p.ProductId === product.ProductId);

            if (existing && existing.id) {
                // Product exists - use TRANSACTION to increment quantity atomically
                const itemRef = firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${existing.id}`);

                await itemRef.transaction((current) => {
                    if (current === null) return current; // Item was deleted, abort

                    // Atomic increment
                    return {
                        ...current,
                        Quantity: (current.Quantity || 0) + quantity,
                        addedAt: window.firebase.database.ServerValue.TIMESTAMP,
                        addedDate: new Date().toLocaleString('vi-VN')
                    };
                });

                console.log('[DROPPED-PRODUCTS] ✓ Quantity updated via transaction');
            } else {
                // New product - push to Firebase (listener will update UI)
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
                    addedAt: window.firebase.database.ServerValue.TIMESTAMP,
                    addedDate: new Date().toLocaleString('vi-VN')
                };

                const newRef = await firebaseDb.ref(DROPPED_PRODUCTS_COLLECTION).push(newItem);
                console.log('[DROPPED-PRODUCTS] ✓ New item created:', newRef.key);
            }

            // Add to history
            await addHistoryItem({
                action: reason === 'removed' ? 'Xóa sản phẩm' : 'Giảm số lượng',
                productName: product.ProductNameGet || product.ProductName,
                productCode: product.ProductCode,
                quantity: quantity,
                price: product.Price
            });

            // NO need to update UI manually - realtime listener handles it!

        } catch (error) {
            console.error('[DROPPED-PRODUCTS] ❌ Error adding product:', error);
            showError('Lỗi khi thêm sản phẩm: ' + error.message);
        }
    };

    /**
     * Add history item
     * FIREBASE-ONLY: Listener will update UI automatically
     */
    async function addHistoryItem(item) {
        if (!firebaseDb) return;

        try {
            const historyItem = {
                ...item,
                timestamp: window.firebase.database.ServerValue.TIMESTAMP,
                date: new Date().toLocaleString('vi-VN')
            };

            await firebaseDb.ref(HISTORY_COLLECTION).push(historyItem);
            // Listener will handle adding to UI
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] ❌ Error saving history:', error);
        }
    }

    /**
     * Remove product from dropped list
     * FIREBASE-ONLY: Listener will update UI automatically
     */
    window.removeFromDroppedProducts = async function (index) {
        if (!firebaseDb) {
            showError('Firebase không khả dụng');
            return;
        }

        const product = droppedProducts[index];
        if (!product || !product.id) return;

        // Confirm deletion
        const confirmMsg = `Bạn có chắc muốn xóa sản phẩm "${product.ProductNameGet || product.ProductName}" khỏi danh sách hàng rớt?`;
        let confirmed = false;

        if (window.CustomPopup) {
            confirmed = await window.CustomPopup.confirm(confirmMsg, 'Xác nhận xóa');
        } else {
            confirmed = confirm(confirmMsg);
        }

        if (!confirmed) return;

        try {
            // Delete from Firebase - listener will update UI
            await firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${product.id}`).remove();
            console.log('[DROPPED-PRODUCTS] ✓ Item deleted:', product.id);
            showSuccess('Đã xóa khỏi hàng rớt - xả');
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] ❌ Error removing from Firebase:', error);
            showError('Lỗi khi xóa: ' + error.message);
        }
    };

    /**
     * Update dropped product quantity
     * FIREBASE-ONLY: Uses transaction for atomic updates (critical for multi-user)
     */
    window.updateDroppedProductQuantity = async function (index, change, value = null) {
        if (!firebaseDb) {
            showError('Firebase không khả dụng');
            return;
        }

        const product = droppedProducts[index];
        if (!product || !product.id) return;

        try {
            const itemRef = firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${product.id}`);

            // Use TRANSACTION for atomic quantity update
            await itemRef.transaction((current) => {
                if (current === null) return current; // Item was deleted, abort

                let newQty;
                if (value !== null) {
                    // Direct value set
                    newQty = parseInt(value, 10);
                } else {
                    // Increment/decrement
                    newQty = (current.Quantity || 0) + change;
                }

                // Validate minimum quantity
                if (newQty < 1) newQty = 1;

                return {
                    ...current,
                    Quantity: newQty
                };
            });

            console.log('[DROPPED-PRODUCTS] ✓ Quantity updated via transaction');
            // Listener will update UI automatically

        } catch (error) {
            console.error('[DROPPED-PRODUCTS] ❌ Error updating quantity:', error);
            showError('Lỗi khi cập nhật số lượng: ' + error.message);
        }
    };

    /**
     * Move product back to order
     */
    window.moveDroppedToOrder = async function (index) {
        const product = droppedProducts[index];

        if (!window.currentChatOrderData) {
            if (window.notificationManager) {
                window.notificationManager.show('Vui lòng mở một đơn hàng trước', 'warning');
            }
            return;
        }

        if (window.CustomPopup) {
            const confirmed = await window.CustomPopup.confirm(
                `Chuyển 1 sản phẩm "${product.ProductNameGet || product.ProductName}" về đơn hàng?`,
                'Xác nhận chuyển'
            );
            if (!confirmed) return;
        } else if (!confirm(`Chuyển 1 sản phẩm "${product.ProductNameGet || product.ProductName}" về đơn hàng?`)) {
            return;
        }

        // Fetch full details to ensure correct payload structure
        // CRITICAL: Must match payload_chinh_xac.json structure. Do NOT remove fields.
        let fullProduct = null;
        if (window.productSearchManager) {
            try {
                // Force refresh to get latest stock/details
                fullProduct = await window.productSearchManager.getFullProductDetails(product.ProductId, true);
            } catch (e) {
                console.error('[DROPPED-PRODUCTS] Failed to fetch full details:', e);
            }
        }

        // Always add as new held item (will be merged on save)
        window.currentChatOrderData.Details.push({
            ProductId: product.ProductId,
            ProductName: fullProduct ? (fullProduct.Name || fullProduct.NameTemplate) : product.ProductName,
            ProductNameGet: fullProduct ? (fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`) : product.ProductNameGet,
            ProductCode: fullProduct ? (fullProduct.DefaultCode || fullProduct.Barcode) : product.ProductCode,
            ImageUrl: fullProduct ? fullProduct.ImageUrl : product.ImageUrl,
            Price: product.Price,
            Quantity: 1, // Always 1
            UOMId: fullProduct ? (fullProduct.UOM?.Id || 1) : 1,
            UOMName: fullProduct ? (fullProduct.UOM?.Name || 'Cái') : product.UOMName,
            Factor: 1,
            Priority: 0,
            OrderId: window.currentChatOrderData.Id,
            LiveCampaign_DetailId: null,
            ProductWeight: 0,
            Note: null,
            IsHeld: true, // Always mark as held
            IsFromDropped: true, // Mark as from dropped list
            StockQty: fullProduct ? fullProduct.QtyAvailable : 0
        });

        // Decrease quantity using TRANSACTION (atomic for multi-user)
        if (!firebaseDb || !product.id) {
            showError('Firebase không khả dụng');
            return;
        }

        try {
            const itemRef = firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${product.id}`);

            // Use transaction to safely decrement
            const result = await itemRef.transaction((current) => {
                if (current === null) return current; // Item was deleted, abort

                const newQty = (current.Quantity || 1) - 1;

                if (newQty <= 0) {
                    // Mark for deletion by returning null
                    return null;
                } else {
                    // Decrease quantity
                    return {
                        ...current,
                        Quantity: newQty
                    };
                }
            });

            if (result.committed) {
                console.log('[DROPPED-PRODUCTS] ✓ Quantity decremented via transaction');
                // Listener will update UI automatically
            }

        } catch (error) {
            console.error('[DROPPED-PRODUCTS] ❌ Error decreasing quantity:', error);
            showError('Lỗi khi cập nhật số lượng: ' + error.message);
            return;
        }

        // Add history
        await addHistoryItem({
            action: 'Chuyển về đơn hàng',
            productName: product.ProductNameGet || product.ProductName,
            productCode: product.ProductCode,
            quantity: 1,
            price: product.Price
        });

        // Re-render orders table (not managed by Firebase)
        if (typeof window.renderChatProductsTable === 'function') {
            window.renderChatProductsTable();
        }

        // Switch to orders tab
        switchChatPanelTab('orders');

        showSuccess('Đã chuyển 1 sản phẩm về đơn hàng');
    };

    /**
     * Render dropped products table
     */
    function renderDroppedProductsTable(filteredProducts = null) {
        const container = document.getElementById('chatDroppedProductsContainer');
        if (!container) return;

        const products = filteredProducts || droppedProducts;

        if (products.length === 0) {
            container.innerHTML = `
                <div class="chat-empty-products" style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                    <i class="fas fa-box-open" style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;"></i>
                    <p style="font-size: 14px; margin: 0;">Chưa có hàng rớt - xả</p>
                    <p style="font-size: 12px; margin-top: 4px;">Sản phẩm bị xóa hoặc giảm số lượng sẽ hiển thị ở đây</p>
                </div>
            `;
            return;
        }

        const productsHTML = products.map((p, i) => {
            const actualIndex = droppedProducts.indexOf(p);
            return `
            <tr class="chat-product-row" data-index="${actualIndex}">
                <td style="width: 30px;">${i + 1}</td>
                <td style="width: 60px;">
                    ${p.ImageUrl ? `<img src="${p.ImageUrl}" class="chat-product-image">` : '<div class="chat-product-image" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); display: flex; align-items: center; justify-content: center;"><i class="fas fa-box" style="color: white; font-size: 18px;"></i></div>'}
                </td>
                <td>
                    <div style="font-weight: 600; margin-bottom: 2px;">${p.ProductNameGet || p.ProductName}</div>
                    <div style="font-size: 11px; color: #6b7280;">Mã: ${p.ProductCode || 'N/A'}</div>
                    <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">${p.addedDate || ''}</div>
                </td>
                <td style="text-align: center; width: 140px;">
                    <div class="chat-quantity-controls">
                        <button onclick="updateDroppedProductQuantity(${actualIndex}, -1)" class="chat-qty-btn">
                            <i class="fas fa-minus"></i>
                        </button>
                        <input type="number" class="chat-quantity-input" value="${p.Quantity || 1}"
                            onchange="updateDroppedProductQuantity(${actualIndex}, 0, this.value)" min="1">
                        <button onclick="updateDroppedProductQuantity(${actualIndex}, 1)" class="chat-qty-btn">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </td>
                <td style="text-align: right; width: 100px;">${(p.Price || 0).toLocaleString('vi-VN')}đ</td>
                <td style="text-align: right; font-weight: 600; width: 120px; color: #ef4444;">${((p.Quantity || 0) * (p.Price || 0)).toLocaleString('vi-VN')}đ</td>
                <td style="text-align: center; width: 100px;">
                    <button onclick="moveDroppedToOrder(${actualIndex})" class="chat-btn-product-action" title="Chuyển về đơn hàng" style="margin-right: 4px; color: #10b981;">
                        <i class="fas fa-undo"></i>
                    </button>
                    <button onclick="removeFromDroppedProducts(${actualIndex})" class="chat-btn-product-action chat-btn-delete-item" title="Xóa vĩnh viễn">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `}).join('');

        // Calculate totals
        const totalQuantity = products.reduce((sum, p) => sum + (p.Quantity || 0), 0);
        const totalAmount = products.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);

        container.innerHTML = `
            <table class="chat-products-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Ảnh</th>
                        <th>Sản phẩm</th>
                        <th style="text-align: center;">SL</th>
                        <th style="text-align: right;">Đơn giá</th>
                        <th style="text-align: right;">Thành tiền</th>
                        <th style="text-align: center;">Thao tác</th>
                    </tr>
                </thead>
                <tbody>
                    ${productsHTML}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align: right;">Tổng cộng:</td>
                        <td style="text-align: center;">${totalQuantity}</td>
                        <td></td>
                        <td style="text-align: right; color: #ef4444; font-size: 14px;">${totalAmount.toLocaleString('vi-VN')}đ</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        `;
    }

    /**
     * Filter dropped products
     */
    window.filterDroppedProducts = function (query) {
        if (!query || query.trim() === '') {
            renderDroppedProductsTable();
            return;
        }

        const lowerQuery = query.toLowerCase().trim();
        const filtered = droppedProducts.filter(p =>
            (p.ProductName && p.ProductName.toLowerCase().includes(lowerQuery)) ||
            (p.ProductNameGet && p.ProductNameGet.toLowerCase().includes(lowerQuery)) ||
            (p.ProductCode && p.ProductCode.toLowerCase().includes(lowerQuery))
        );

        renderDroppedProductsTable(filtered);
    };

    /**
     * Render history list
     */
    function renderHistoryList() {
        const container = document.getElementById('chatHistoryContainer');
        if (!container) return;

        if (historyItems.length === 0) {
            container.innerHTML = `
                <div class="chat-empty-products" style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                    <i class="fas fa-history" style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;"></i>
                    <p style="font-size: 14px; margin: 0;">Chưa có lịch sử</p>
                    <p style="font-size: 12px; margin-top: 4px;">Các thao tác sẽ được ghi lại ở đây</p>
                </div>
            `;
            return;
        }

        const historyHTML = historyItems.map(item => {
            const actionColor = item.action.includes('Xóa') ? '#ef4444' :
                item.action.includes('Giảm') ? '#f59e0b' :
                    item.action.includes('Chuyển') ? '#10b981' : '#3b82f6';

            const actionIcon = item.action.includes('Xóa') ? 'fa-trash' :
                item.action.includes('Giảm') ? 'fa-minus-circle' :
                    item.action.includes('Chuyển') ? 'fa-undo' : 'fa-info-circle';

            return `
                <div class="history-item" style="
                    padding: 12px 16px;
                    border-bottom: 1px solid #f1f5f9;
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                ">
                    <div style="
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        background: ${actionColor}15;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                    ">
                        <i class="fas ${actionIcon}" style="color: ${actionColor}; font-size: 12px;"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; color: ${actionColor}; font-size: 13px; margin-bottom: 2px;">
                            ${item.action}
                        </div>
                        <div style="font-size: 13px; color: #1e293b; margin-bottom: 4px;">
                            ${item.productName || 'N/A'}
                        </div>
                        <div style="font-size: 11px; color: #64748b;">
                            SL: ${item.quantity} • ${(item.price || 0).toLocaleString('vi-VN')}đ
                        </div>
                    </div>
                    <div style="font-size: 11px; color: #94a3b8; text-align: right; flex-shrink: 0;">
                        ${item.date || ''}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = historyHTML;
    }

    /**
     * Update dropped product counts in UI
     */
    function updateDroppedCounts() {
        const totalQuantity = droppedProducts.reduce((sum, p) => sum + (p.Quantity || 0), 0);
        const totalAmount = droppedProducts.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);

        // Update tab badge
        const badge = document.getElementById('chatDroppedCountBadge');
        if (badge) {
            badge.textContent = totalQuantity;
        }

        // Update footer
        const footerTotal = document.getElementById('chatDroppedTotal');
        if (footerTotal) {
            footerTotal.textContent = `${totalAmount.toLocaleString('vi-VN')}đ`;
        }

        const countEl = document.getElementById('droppedProductCount');
        if (countEl) {
            countEl.textContent = totalQuantity;
        }
    }

    /**
     * Switch between tabs
     */
    window.switchChatPanelTab = function (tabName) {
        // Update tab buttons
        const buttons = document.querySelectorAll('.chat-tab-btn');
        buttons.forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.style.background = isActive ? 'white' : '#f8fafc';
            btn.style.color = isActive ? '#3b82f6' : '#64748b';
            btn.style.borderBottomColor = isActive ? '#3b82f6' : 'transparent';
        });

        // Update tab content
        const contents = document.querySelectorAll('.chat-tab-content');
        contents.forEach(content => {
            content.style.display = 'none';
        });

        const activeContent = document.getElementById(
            tabName === 'orders' ? 'chatTabOrders' :
                tabName === 'dropped' ? 'chatTabDropped' :
                    tabName === 'history' ? 'chatTabHistory' : 'chatTabInvoiceHistory'
        );

        if (activeContent) {
            activeContent.style.display = 'flex';
        }

        // Refresh content based on tab
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
     * FIREBASE-ONLY: Listener will update UI automatically
     */
    window.clearAllDroppedProducts = async function () {
        if (!firebaseDb) {
            showError('Firebase không khả dụng');
            return;
        }

        // Confirm deletion
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
            // Remove all from Firebase - listener will clear UI
            await firebaseDb.ref(DROPPED_PRODUCTS_COLLECTION).remove();
            console.log('[DROPPED-PRODUCTS] ✓ All items cleared');
            showSuccess('Đã xóa tất cả hàng rớt - xả');
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] ❌ Error clearing from Firebase:', error);
            showError('Lỗi khi xóa: ' + error.message);
        }
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initDroppedProductsManager, 500);
        });
    } else {
        setTimeout(initDroppedProductsManager, 500);
    }

    console.log('[DROPPED-PRODUCTS] Firebase-only multi-user manager loaded');

})();
