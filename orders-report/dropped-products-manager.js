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

    // Local state
    let droppedProducts = [];
    let historyItems = [];
    let isInitialized = false;
    let firebaseDb = null;
    let droppedProductsRef = null;
    let historyRef = null;
    let lastSyncTime = null;
    let isFirstLoad = true;

    /**
     * Initialize the dropped products manager
     */
    window.initDroppedProductsManager = async function () {
        if (isInitialized) return;

        console.log('[DROPPED-PRODUCTS] Initializing...');

        try {
            // SMART CACHING: Load from localStorage FIRST for instant UI
            const cacheData = loadFromLocalStorage();
            if (cacheData) {
                console.log('[DROPPED-PRODUCTS] Loaded from cache, showing cached data first');
                renderDroppedProductsTable();
                renderHistoryList();
                updateDroppedCounts();
            }

            // Get Firebase database reference
            if (window.firebase && window.firebase.database) {
                firebaseDb = window.firebase.database();
                // Setup realtime listeners (will sync in background)
                loadDroppedProductsFromFirebase();
                loadHistoryFromFirebase();
                isInitialized = true;
                console.log('[DROPPED-PRODUCTS] Initialized with Firebase realtime sync');
            } else {
                console.warn('[DROPPED-PRODUCTS] Firebase not available, using local storage only');
                isInitialized = true;
            }

            // Render initial state if not cached
            if (!cacheData) {
                renderDroppedProductsTable();
                renderHistoryList();
                updateDroppedCounts();
            }

        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Initialization error:', error);
            loadFromLocalStorage();
            isInitialized = true;
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

                // Check if item already exists by ID or ProductId (prevent duplicates from optimistic updates)
                const existingByIdIndex = droppedProducts.findIndex(p => p.id === itemId);
                const existingByProductIdIndex = droppedProducts.findIndex(p =>
                    p.ProductId === itemData.ProductId && p.id && p.id.startsWith('temp_')
                );

                if (existingByIdIndex > -1) {
                    // Item already exists with this Firebase ID, skip
                    if (!isFirstLoad) {
                        console.warn('[DROPPED-PRODUCTS] Duplicate add detected for ID:', itemId, '- skipped');
                    }
                } else if (existingByProductIdIndex > -1) {
                    // Item exists with temp ID, update to real Firebase ID
                    console.log('[DROPPED-PRODUCTS] Updating temp ID to Firebase ID:', itemId);
                    droppedProducts[existingByProductIdIndex] = {
                        id: itemId,
                        ...itemData
                    };
                    renderDroppedProductsTable();
                    updateDroppedCounts();
                } else {
                    // Truly new item, add it
                    droppedProducts.push({
                        id: itemId,
                        ...itemData
                    });

                    // Only log if not first load to avoid spam
                    if (!isFirstLoad) {
                        console.log('[DROPPED-PRODUCTS] Item added:', itemId);
                    }

                    // Update UI
                    renderDroppedProductsTable();
                    updateDroppedCounts();
                }
            }, (error) => {
                console.error('[DROPPED-PRODUCTS] child_added error:', error);
            });

            // Handle updated items
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
                    console.log('[DROPPED-PRODUCTS] Item updated:', itemId);
                } else {
                    console.warn('[DROPPED-PRODUCTS] Update for non-existent item:', itemId);
                }

                // Update UI
                renderDroppedProductsTable();
                updateDroppedCounts();
            }, (error) => {
                console.error('[DROPPED-PRODUCTS] child_changed error:', error);
            });

            // Handle removed items
            droppedProductsRef.on('child_removed', (snapshot) => {
                const itemId = snapshot.key;

                // Find and remove item
                const existingIndex = droppedProducts.findIndex(p => p.id === itemId);

                if (existingIndex > -1) {
                    droppedProducts.splice(existingIndex, 1);
                    console.log('[DROPPED-PRODUCTS] Item removed:', itemId);
                } else {
                    console.warn('[DROPPED-PRODUCTS] Remove for non-existent item:', itemId);
                }

                // Update UI
                renderDroppedProductsTable();
                updateDroppedCounts();
            }, (error) => {
                console.error('[DROPPED-PRODUCTS] child_removed error:', error);
            });

            // Mark first load complete after initial sync
            setTimeout(() => {
                isFirstLoad = false;
                lastSyncTime = Date.now();
                console.log('[DROPPED-PRODUCTS] Initial sync complete:', droppedProducts.length, 'items');
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
     * Load from localStorage with timestamp validation
     * @returns {boolean} True if valid cache was loaded, false otherwise
     */
    function loadFromLocalStorage() {
        try {
            const savedDropped = localStorage.getItem('droppedProducts');
            const savedHistory = localStorage.getItem('droppedProductsHistory');
            const savedTimestamp = localStorage.getItem('droppedProductsLastSync');

            if (!savedDropped && !savedHistory) {
                console.log('[DROPPED-PRODUCTS] No cache found in localStorage');
                return false;
            }

            // Parse timestamp
            const cacheAge = savedTimestamp ? Date.now() - parseInt(savedTimestamp, 10) : Infinity;
            const cacheAgeMinutes = Math.floor(cacheAge / 60000);

            droppedProducts = savedDropped ? JSON.parse(savedDropped) : [];
            historyItems = savedHistory ? JSON.parse(savedHistory) : [];
            lastSyncTime = savedTimestamp ? parseInt(savedTimestamp, 10) : null;

            console.log('[DROPPED-PRODUCTS] Loaded from localStorage:', {
                products: droppedProducts.length,
                history: historyItems.length,
                cacheAge: cacheAgeMinutes > 0 ? `${cacheAgeMinutes}m ago` : 'just now'
            });

            return true;
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error loading from localStorage:', error);
            droppedProducts = [];
            historyItems = [];
            return false;
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
     * Save to localStorage with timestamp
     * ONLY call this on WRITE operations (add/update/delete), NOT in realtime listeners
     */
    function saveToLocalStorage() {
        try {
            const timestamp = Date.now();
            localStorage.setItem('droppedProducts', JSON.stringify(droppedProducts));
            localStorage.setItem('droppedProductsHistory', JSON.stringify(historyItems));
            localStorage.setItem('droppedProductsLastSync', timestamp.toString());
            lastSyncTime = timestamp;

            console.log('[DROPPED-PRODUCTS] Saved to localStorage (backup after write operation)');
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error saving to localStorage:', error);
        }
    }

    /**
     * Add product to dropped list
     */
    window.addToDroppedProducts = async function (product, quantity, reason = 'removed') {
        console.log('[DROPPED-PRODUCTS] Adding product:', product, 'qty:', quantity, 'reason:', reason);

        const droppedItem = {
            ProductId: product.ProductId,
            ProductName: product.ProductName,
            ProductNameGet: product.ProductNameGet,
            ProductCode: product.ProductCode,
            ImageUrl: product.ImageUrl,
            Price: product.Price,
            Quantity: quantity,
            UOMName: product.UOMName || 'Cái',
            reason: reason,
            addedAt: Date.now(),
            addedDate: new Date().toLocaleString('vi-VN')
        };

        // Check if product already exists in dropped list
        const existingIndex = droppedProducts.findIndex(p => p.ProductId === product.ProductId);

        if (existingIndex > -1) {
            // Increase quantity - OPTIMISTIC UPDATE
            droppedProducts[existingIndex].Quantity += quantity;
            droppedProducts[existingIndex].addedAt = Date.now();
            droppedProducts[existingIndex].addedDate = new Date().toLocaleString('vi-VN');

            // Sync to Firebase in background
            if (firebaseDb && droppedProducts[existingIndex].id) {
                firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${droppedProducts[existingIndex].id}`).update({
                    Quantity: droppedProducts[existingIndex].Quantity,
                    addedAt: droppedProducts[existingIndex].addedAt,
                    addedDate: droppedProducts[existingIndex].addedDate
                }).catch(err => {
                    console.error('[DROPPED-PRODUCTS] Firebase update failed:', err);
                });
            }
        } else {
            // Add new item - OPTIMISTIC UPDATE with temporary ID
            droppedItem.id = 'temp_' + Date.now() + '_' + product.ProductId;
            droppedProducts.push(droppedItem);

            // Sync to Firebase in background (realtime listener will update the temp ID)
            if (firebaseDb) {
                firebaseDb.ref(DROPPED_PRODUCTS_COLLECTION).push(droppedItem).then(newRef => {
                    console.log('[DROPPED-PRODUCTS] Created in Firebase with ID:', newRef.key);
                    // Realtime listener will automatically replace temp ID with real ID
                }).catch(err => {
                    console.error('[DROPPED-PRODUCTS] Firebase push failed:', err);
                });
            }
        }

        // Add to history
        await addHistoryItem({
            action: reason === 'removed' ? 'Xóa sản phẩm' : 'Giảm số lượng',
            productName: product.ProductNameGet || product.ProductName,
            productCode: product.ProductCode,
            quantity: quantity,
            price: product.Price
        });

        // Save to localStorage only if Firebase is not available
        if (!firebaseDb) {
            saveToLocalStorage();
        }

        // Update UI
        renderDroppedProductsTable();
        updateDroppedCounts();

        console.log('[DROPPED-PRODUCTS] Product added to dropped list');
    };

    /**
     * Add history item
     */
    async function addHistoryItem(item) {
        const historyItem = {
            ...item,
            timestamp: Date.now(),
            date: new Date().toLocaleString('vi-VN')
        };

        if (firebaseDb) {
            try {
                const newRef = await firebaseDb.ref(HISTORY_COLLECTION).push(historyItem);
                historyItem.id = newRef.key;
            } catch (error) {
                console.error('[DROPPED-PRODUCTS] Error saving history:', error);
                historyItem.id = 'local_' + Date.now();
            }
        } else {
            historyItem.id = 'local_' + Date.now();
        }

        historyItems.unshift(historyItem);

        // Keep only last 100 items locally
        if (historyItems.length > 100) {
            historyItems = historyItems.slice(0, 100);
        }

        renderHistoryList();
    }

    /**
     * Remove product from dropped list
     */
    window.removeFromDroppedProducts = async function (index) {
        const product = droppedProducts[index];

        if (window.CustomPopup) {
            const confirmed = await window.CustomPopup.confirm(
                `Bạn có chắc muốn xóa sản phẩm "${product.ProductNameGet || product.ProductName}" khỏi danh sách hàng rớt?`,
                'Xác nhận xóa'
            );
            if (!confirmed) return;
        } else if (!confirm(`Bạn có chắc muốn xóa sản phẩm "${product.ProductNameGet || product.ProductName}" khỏi danh sách hàng rớt?`)) {
            return;
        }

        // OPTIMISTIC UPDATE: Remove from local array first for instant UI feedback
        droppedProducts.splice(index, 1);
        renderDroppedProductsTable();
        updateDroppedCounts();

        // Sync to Firebase (realtime listener will handle if this fails)
        if (firebaseDb && product.id) {
            try {
                await firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${product.id}`).remove();
            } catch (error) {
                console.error('[DROPPED-PRODUCTS] Error removing from Firebase:', error);
                // Revert optimistic update on error
                droppedProducts.splice(index, 0, product);
                renderDroppedProductsTable();
                updateDroppedCounts();
                if (window.notificationManager) {
                    window.notificationManager.show('Lỗi khi xóa khỏi Firebase', 'error');
                }
                return;
            }
        } else {
            // No Firebase, save to localStorage as backup
            saveToLocalStorage();
        }

        if (window.notificationManager) {
            window.notificationManager.show('Đã xóa khỏi hàng rớt - xả', 'success');
        }
    };

    /**
     * Update dropped product quantity
     */
    window.updateDroppedProductQuantity = async function (index, change, value = null) {
        const product = droppedProducts[index];
        const oldQty = product.Quantity || 0;
        let newQty = value !== null ? parseInt(value, 10) : oldQty + change;

        if (newQty < 1) newQty = 1;

        // OPTIMISTIC UPDATE: Update local state first for instant UI feedback
        product.Quantity = newQty;
        renderDroppedProductsTable();
        updateDroppedCounts();

        // Sync to Firebase
        if (firebaseDb && product.id) {
            try {
                await firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${product.id}`).update({
                    Quantity: newQty
                });
            } catch (error) {
                console.error('[DROPPED-PRODUCTS] Error updating quantity:', error);
                // Revert optimistic update on error
                product.Quantity = oldQty;
                renderDroppedProductsTable();
                updateDroppedCounts();
                if (window.notificationManager) {
                    window.notificationManager.show('Lỗi khi cập nhật số lượng', 'error');
                }
            }
        } else {
            // No Firebase, save to localStorage as backup
            saveToLocalStorage();
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

        // OPTIMISTIC UPDATE: Decrease quantity in dropped list
        const oldQty = product.Quantity;
        product.Quantity -= 1;

        if (product.Quantity <= 0) {
            // Remove from local array
            droppedProducts.splice(index, 1);

            // Remove from Firebase
            if (firebaseDb && product.id) {
                try {
                    await firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${product.id}`).remove();
                } catch (error) {
                    console.error('[DROPPED-PRODUCTS] Error removing from Firebase:', error);
                    // Revert optimistic update
                    product.Quantity = oldQty;
                    droppedProducts.splice(index, 0, product);
                    if (window.notificationManager) {
                        window.notificationManager.show('Lỗi khi đồng bộ Firebase', 'error');
                    }
                    return;
                }
            } else {
                // No Firebase, save to localStorage
                saveToLocalStorage();
            }
        } else {
            // Update quantity in Firebase
            if (firebaseDb && product.id) {
                try {
                    await firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${product.id}`).update({
                        Quantity: product.Quantity
                    });
                } catch (error) {
                    console.error('[DROPPED-PRODUCTS] Error updating quantity:', error);
                    // Revert optimistic update
                    product.Quantity = oldQty;
                    if (window.notificationManager) {
                        window.notificationManager.show('Lỗi khi đồng bộ Firebase', 'error');
                    }
                    return;
                }
            } else {
                // No Firebase, save to localStorage
                saveToLocalStorage();
            }
        }

        // Add history
        await addHistoryItem({
            action: 'Chuyển về đơn hàng',
            productName: product.ProductNameGet || product.ProductName,
            productCode: product.ProductCode,
            quantity: 1,
            price: product.Price
        });

        // Update UIs
        renderDroppedProductsTable();
        updateDroppedCounts();

        // Re-render orders table
        if (typeof window.renderChatProductsTable === 'function') {
            window.renderChatProductsTable();
        }

        // Switch to orders tab
        switchChatPanelTab('orders');

        if (window.notificationManager) {
            window.notificationManager.show('Đã chuyển 1 sản phẩm về đơn hàng', 'success');
        }
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
     */
    window.clearAllDroppedProducts = async function () {
        if (window.CustomPopup) {
            const confirmed = await window.CustomPopup.confirm(
                'Bạn có chắc muốn xóa toàn bộ danh sách hàng rớt?',
                'Xác nhận xóa tất cả'
            );
            if (!confirmed) return;
        } else if (!confirm('Bạn có chắc muốn xóa toàn bộ danh sách hàng rớt?')) {
            return;
        }

        // OPTIMISTIC UPDATE: Clear local array first
        const backup = [...droppedProducts];
        droppedProducts = [];
        renderDroppedProductsTable();
        updateDroppedCounts();

        // Remove all from Firebase
        if (firebaseDb) {
            try {
                await firebaseDb.ref(DROPPED_PRODUCTS_COLLECTION).remove();
            } catch (error) {
                console.error('[DROPPED-PRODUCTS] Error clearing from Firebase:', error);
                // Revert optimistic update
                droppedProducts = backup;
                renderDroppedProductsTable();
                updateDroppedCounts();
                if (window.notificationManager) {
                    window.notificationManager.show('Lỗi khi xóa khỏi Firebase', 'error');
                }
                return;
            }
        } else {
            // No Firebase, save to localStorage
            saveToLocalStorage();
        }

        if (window.notificationManager) {
            window.notificationManager.show('Đã xóa tất cả hàng rớt - xả', 'success');
        }
    };

    /**
     * Periodic backup to localStorage (every 2 minutes)
     * Only saves if Firebase is connected to ensure we have a backup
     */
    setInterval(() => {
        if (isInitialized && firebaseDb) {
            saveToLocalStorage();
            console.log('[DROPPED-PRODUCTS] Periodic backup to localStorage');
        }
    }, 120000); // 2 minutes

    /**
     * Save to localStorage before page unload
     */
    window.addEventListener('beforeunload', () => {
        if (isInitialized) {
            saveToLocalStorage();
            console.log('[DROPPED-PRODUCTS] Saved to localStorage on beforeunload');
        }
    });

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initDroppedProductsManager, 500);
        });
    } else {
        setTimeout(initDroppedProductsManager, 500);
    }

    console.log('[DROPPED-PRODUCTS] Manager loaded');

})();
