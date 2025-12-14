/**
 * Dropped Products Manager
 * Manages dropped/clearance products and history
 * Data is shared across all orders and stored in Firebase
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

    // Product search state
    let productSearchInitialized = false;
    let searchSuggestionsVisible = false;

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

            // Ensure Firebase is initialized
            if (!window.firebase.apps.length) {
                console.log('[DROPPED-PRODUCTS] Firebase not initialized, initializing now...');
                const firebaseConfig = {
                    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
                    authDomain: "n2shop-69e37.firebaseapp.com",
                    databaseURL: "https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app",
                    projectId: "n2shop-69e37",
                    storageBucket: "n2shop-69e37-ne0q1",
                    messagingSenderId: "598906493303",
                    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
                    measurementId: "G-TEJH3S2T1D",
                };
                window.firebase.initializeApp(firebaseConfig);
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
    window.cleanupDroppedProductsManager = function () {
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
     * Initialize product search functionality
     */
    async function initializeProductSearch() {
        if (productSearchInitialized) return;

        if (!window.ProductSearchModule) {
            console.error('[DROPPED-PRODUCTS] ProductSearchModule not found');
            return;
        }

        try {
            console.log('[DROPPED-PRODUCTS] Initializing product search...');

            // Load Excel data for search
            await window.ProductSearchModule.loadExcelData(
                () => {
                    console.log('[DROPPED-PRODUCTS] Loading product data...');
                },
                () => {
                    console.log('[DROPPED-PRODUCTS] Product data loaded');
                }
            );

            productSearchInitialized = true;
            console.log('[DROPPED-PRODUCTS] ✓ Product search initialized');
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error initializing product search:', error);
            showError('Lỗi khởi tạo tìm kiếm sản phẩm: ' + error.message);
        }
    }

    /**
     * Handle product search input
     */
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

        // Search for products
        const results = window.ProductSearchModule.searchProducts(searchText);

        if (results.length === 0) {
            suggestionsDiv.classList.remove('show');
            searchSuggestionsVisible = false;
            return;
        }

        // Display suggestions
        suggestionsDiv.innerHTML = results.map(product => `
            <div class="suggestion-item" data-id="${product.id}">
                <strong>${product.code || ''}</strong> - ${product.name}
            </div>
        `).join('');

        suggestionsDiv.classList.add('show');
        searchSuggestionsVisible = true;

        // Add click handlers
        suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const productId = item.dataset.id;
                addProductFromSearch(productId);
                suggestionsDiv.classList.remove('show');
                searchSuggestionsVisible = false;
                if (input) input.value = '';
            });
        });
    };

    /**
     * Add product from search to dropped list
     */
    async function addProductFromSearch(productId) {
        if (!window.ProductSearchModule) {
            showError('ProductSearchModule không khả dụng');
            return;
        }

        try {
            console.log('[DROPPED-PRODUCTS] Loading product details for:', productId);

            // Load full product details
            const result = await window.ProductSearchModule.loadProductDetails(productId, {
                autoAddVariants: false // Don't auto-add variants for dropped products
            });

            const productData = result.productData;

            // Create product object for dropped list
            const product = {
                ProductId: productData.Id,
                ProductName: productData.Name || productData.NameTemplate,
                ProductNameGet: productData.NameGet || `[${productData.DefaultCode}] ${productData.Name}`,
                ProductCode: productData.DefaultCode || productData.Barcode,
                ImageUrl: result.imageUrl,
                Price: productData.ListPrice || 0,
                UOMName: productData.UOM?.Name || 'Cái'
            };

            // Add to dropped products with quantity 1
            await window.addToDroppedProducts(product, 1, 'manual_add');

            showSuccess(`Đã thêm sản phẩm: ${product.ProductNameGet}`);

        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error adding product from search:', error);
            showError('Lỗi khi thêm sản phẩm: ' + error.message);
        }
    }

    /**
     * Close search suggestions when clicking outside
     */
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


    /**
     * Add product to dropped list
     * FIREBASE-ONLY: Uses transaction for atomic quantity updates in multi-user environment
     */
    window.addToDroppedProducts = async function (product, quantity, reason = 'removed', holderName = null) {
        if (!firebaseDb) {
            showError('Firebase không khả dụng');
            return;
        }

        console.log('[DROPPED-PRODUCTS] Adding product:', product.ProductNameGet, 'qty:', quantity, 'holder:', holderName);

        try {
            // Check if product already exists
            const existing = droppedProducts.find(p => p.ProductId === product.ProductId);

            if (existing && existing.id) {
                // Product exists - use TRANSACTION to increment quantity atomically
                const itemRef = firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${existing.id}`);

                await itemRef.transaction((current) => {
                    if (current === null) return current; // Item was deleted, abort

                    // Atomic increment and update holder info
                    const updates = {
                        ...current,
                        Quantity: (current.Quantity || 0) + quantity,
                        addedAt: window.firebase.database.ServerValue.TIMESTAMP,
                        addedDate: new Date().toLocaleString('vi-VN')
                    };

                    // Add holder name if provided (for draft products)
                    if (holderName) {
                        updates.heldBy = holderName;
                    }

                    return updates;
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

                // Add holder name if provided (for draft products)
                if (holderName) {
                    newItem.heldBy = holderName;
                }

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
     * Check if a product is still being held by anyone in Firebase
     * Scans all orders to see if product has any active holders
     * @param {number|string} productId - Product ID to check
     * @returns {Promise<boolean>} True if still held, false otherwise
     */
    async function isProductStillHeld(productId) {
        if (!firebaseDb) return false;

        try {
            console.log('[DROPPED-PRODUCTS] Checking if product is still held:', productId);

            const heldProductsRef = firebaseDb.ref('held_products');
            const snapshot = await heldProductsRef.once('value');
            const allOrders = snapshot.val() || {};

            // Scan all orders for this product
            for (const orderId in allOrders) {
                const orderProducts = allOrders[orderId];
                if (!orderProducts) continue;

                const productHolders = orderProducts[String(productId)];
                if (!productHolders) continue;

                // Check if any holder has quantity > 0
                for (const userId in productHolders) {
                    const holderData = productHolders[userId];
                    if (holderData && (parseInt(holderData.quantity) || 0) > 0) {
                        console.log('[DROPPED-PRODUCTS] Product still held by:', holderData.displayName, 'in order:', orderId);
                        return true;
                    }
                }
            }

            console.log('[DROPPED-PRODUCTS] Product no longer held by anyone');
            return false;

        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error checking held status:', error);
            return false; // Assume not held on error
        }
    }

    /**
     * Clear heldBy field from dropped product if no one is holding it anymore
     * @param {number|string} productId - Product ID to check and update
     */
    window.clearHeldByIfNotHeld = async function (productId) {
        if (!firebaseDb) return;

        try {
            console.log('[DROPPED-PRODUCTS] Checking to clear heldBy for product:', productId);

            // Check if still held in Firebase
            const stillHeld = await isProductStillHeld(productId);

            if (!stillHeld) {
                // Find the dropped product in Firebase
                const droppedProduct = droppedProducts.find(p => String(p.ProductId) === String(productId));

                if (droppedProduct && droppedProduct.id && droppedProduct.heldBy) {
                    console.log('[DROPPED-PRODUCTS] Clearing heldBy from dropped product:', productId);

                    // Remove heldBy field using transaction
                    const itemRef = firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${droppedProduct.id}`);

                    await itemRef.transaction((current) => {
                        if (current === null) return current; // Item was deleted, abort

                        // Remove heldBy field
                        const updated = { ...current };
                        delete updated.heldBy;

                        return updated;
                    });

                    console.log('[DROPPED-PRODUCTS] ✓ Cleared heldBy field');
                } else {
                    console.log('[DROPPED-PRODUCTS] Product not in dropped list or no heldBy field');
                }
            } else {
                console.log('[DROPPED-PRODUCTS] Product still held, keeping heldBy field');
            }

        } catch (error) {
            console.error('[DROPPED-PRODUCTS] ❌ Error clearing heldBy:', error);
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
     * Syncs to Firebase held_products for multi-user collaboration
     */
    window.moveDroppedToOrder = async function (index) {
        const product = droppedProducts[index];

        if (!window.currentChatOrderData) {
            showError('Vui lòng mở một đơn hàng trước');
            return;
        }

        // Check if product has quantity > 0
        if (!product.Quantity || product.Quantity <= 0) {
            showError('Không thể chuyển sản phẩm có số lượng = 0. Sản phẩm này đang được giữ.');
            return;
        }

        // Confirm action
        const confirmMsg = `Chuyển 1 sản phẩm "${product.ProductNameGet || product.ProductName}" về đơn hàng?`;
        let confirmed = false;

        if (window.CustomPopup) {
            confirmed = await window.CustomPopup.confirm(confirmMsg, 'Xác nhận chuyển');
        } else {
            confirmed = confirm(confirmMsg);
        }

        if (!confirmed) return;

        try {
            // Fetch full product details for complete payload
            let fullProduct = null;
            if (window.productSearchManager) {
                try {
                    fullProduct = await window.productSearchManager.getFullProductDetails(product.ProductId, true);
                } catch (e) {
                    console.error('[DROPPED-PRODUCTS] Failed to fetch full details:', e);
                }
            }

            // Check if product already exists in held list (merge quantity)
            const existingHeldIndex = window.currentChatOrderData.Details.findIndex(
                p => p.ProductId === product.ProductId && p.IsHeld
            );

            if (existingHeldIndex > -1) {
                // Product already in held list - increment quantity
                window.currentChatOrderData.Details[existingHeldIndex].Quantity += 1;
                console.log('[DROPPED-PRODUCTS] Merged with existing held product, new qty:',
                    window.currentChatOrderData.Details[existingHeldIndex].Quantity);
            } else {
                // Add as NEW held item
                window.currentChatOrderData.Details.push({
                    ProductId: product.ProductId,
                    ProductName: fullProduct ? (fullProduct.Name || fullProduct.NameTemplate) : product.ProductName,
                    ProductNameGet: fullProduct ? (fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`) : product.ProductNameGet,
                    ProductCode: fullProduct ? (fullProduct.DefaultCode || fullProduct.Barcode) : product.ProductCode,
                    ImageUrl: fullProduct ? fullProduct.ImageUrl : product.ImageUrl,
                    Price: product.Price,
                    Quantity: 1,
                    UOMId: fullProduct ? (fullProduct.UOM?.Id || 1) : 1,
                    UOMName: fullProduct ? (fullProduct.UOM?.Name || 'Cái') : product.UOMName,
                    Factor: 1,
                    Priority: 0,
                    OrderId: window.currentChatOrderData.Id,
                    LiveCampaign_DetailId: null,
                    ProductWeight: 0,
                    Note: null,
                    IsHeld: true,
                    IsFromDropped: true,
                    StockQty: fullProduct ? fullProduct.QtyAvailable : 0
                });
            }

            // CRITICAL: Sync to Firebase held_products for multi-user collaboration
            const orderId = window.currentChatOrderData.Id;
            const productId = product.ProductId;

            if (window.firebase && window.authManager && orderId) {
                const auth = window.authManager.getAuthState();

                if (auth) {
                    // Get userId (same logic as updateHeldStatus)
                    let userId = auth.id || auth.Id || auth.username || auth.userType;

                    if (!userId && auth.displayName) {
                        userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');
                    }

                    if (userId) {
                        // Get current held quantity for this user
                        const currentHeldProduct = window.currentChatOrderData.Details.find(
                            p => p.ProductId === productId && p.IsHeld
                        );
                        const heldQuantity = currentHeldProduct ? currentHeldProduct.Quantity : 1;

                        // Sync to Firebase
                        const ref = window.firebase.database().ref(`held_products/${orderId}/${productId}/${userId}`);

                        await ref.set({
                            displayName: auth.displayName || auth.userType || 'Unknown',
                            quantity: heldQuantity,
                            isDraft: false,  // Not a draft, will be removed on disconnect
                            timestamp: window.firebase.database.ServerValue.TIMESTAMP
                        });

                        // Remove on disconnect (not a saved draft)
                        ref.onDisconnect().remove();

                        console.log('[DROPPED-PRODUCTS] ✓ Synced to Firebase held_products:', {
                            orderId,
                            productId,
                            userId,
                            quantity: heldQuantity
                        });
                    } else {
                        console.warn('[DROPPED-PRODUCTS] No userId found, cannot sync to Firebase held_products');
                    }
                } else {
                    console.warn('[DROPPED-PRODUCTS] No auth state, cannot sync to Firebase held_products');
                }
            } else {
                console.warn('[DROPPED-PRODUCTS] Firebase/AuthManager not available, cannot sync held_products');
            }

            // Decrease quantity in dropped list using TRANSACTION
            if (!firebaseDb || !product.id) {
                showError('Firebase không khả dụng');
                return;
            }

            const itemRef = firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${product.id}`);

            const result = await itemRef.transaction((current) => {
                if (current === null) return current; // Item was deleted, abort

                const newQty = (current.Quantity || 1) - 1;

                // Keep product with quantity 0 instead of deleting
                // This allows tracking which products are being held
                return {
                    ...current,
                    Quantity: Math.max(0, newQty)
                };
            });

            if (result.committed) {
                console.log('[DROPPED-PRODUCTS] ✓ Quantity decremented via transaction');
            }

            // Add to history
            await addHistoryItem({
                action: 'Chuyển về đơn hàng',
                productName: product.ProductNameGet || product.ProductName,
                productCode: product.ProductCode,
                quantity: 1,
                price: product.Price
            });

            // Clear heldBy if no one is holding this product anymore
            await window.clearHeldByIfNotHeld(productId);

            // Re-render orders table (not managed by Firebase)
            if (typeof window.renderChatProductsTable === 'function') {
                window.renderChatProductsTable();
            }

            // Switch to orders tab
            switchChatPanelTab('orders');

            showSuccess('Đã chuyển 1 sản phẩm về đơn hàng');

        } catch (error) {
            console.error('[DROPPED-PRODUCTS] ❌ Error moving to order:', error);
            showError('Lỗi khi chuyển sản phẩm: ' + error.message);
        }
    };

    /**
     * Render dropped products table
     */
    function renderDroppedProductsTable(filteredProducts = null) {
        const container = document.getElementById('chatDroppedProductsContainer');
        if (!container) return;

        const products = filteredProducts || droppedProducts;

        // Add search UI at the top
        const searchUI = `
            <div id="droppedProductSearchContainer" style="
                padding: 12px 16px;
                border-bottom: 2px solid #f1f5f9;
                background: #f8fafc;
                position: relative;
            ">
                <div style="position: relative;">
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

        if (products.length === 0) {
            container.innerHTML = searchUI + `
                <div class="chat-empty-products" style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                    <i class="fas fa-box-open" style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;"></i>
                    <p style="font-size: 14px; margin: 0;">Chưa có hàng rớt - xả</p>
                    <p style="font-size: 12px; margin-top: 4px;">Sử dụng thanh tìm kiếm để thêm sản phẩm</p>
                </div>
            `;
            return;
        }

        const productsHTML = products.map((p, i) => {
            const actualIndex = droppedProducts.indexOf(p);
            const isOutOfStock = (p.Quantity || 0) === 0;
            const rowOpacity = isOutOfStock ? '0.6' : '1';
            const nameColor = isOutOfStock ? '#94a3b8' : '#1e293b';

            return `
            <tr class="chat-product-row" data-index="${actualIndex}" style="opacity: ${rowOpacity};">
                <td style="width: 30px;">${i + 1}</td>
                <td style="width: 60px;">
                    ${p.ImageUrl ? `<img src="${p.ImageUrl}" class="chat-product-image" style="opacity: ${isOutOfStock ? '0.7' : '1'}; cursor: pointer;" onclick="showImageZoom('${p.ImageUrl}', '${(p.ProductNameGet || p.ProductName || '').replace(/'/g, "\\'")}')" oncontextmenu="sendImageToChat('${p.ImageUrl}', '${(p.ProductNameGet || p.ProductName || '').replace(/'/g, "\\'")}'); return false;" title="Click: Xem ảnh | Chuột phải: Gửi ảnh vào chat">` : `<div class="chat-product-image" style="background: linear-gradient(135deg, ${isOutOfStock ? '#9ca3af' : '#ef4444'} 0%, ${isOutOfStock ? '#6b7280' : '#dc2626'} 100%); display: flex; align-items: center; justify-content: center;"><i class="fas fa-box" style="color: white; font-size: 18px;"></i></div>`}
                </td>
                <td>
                    <div style="font-weight: 600; margin-bottom: 2px; color: ${nameColor};">
                        ${p.ProductNameGet || p.ProductName}
                        ${isOutOfStock ? '<span style="font-size: 11px; color: #f59e0b; margin-left: 6px;"><i class="fas fa-user-clock"></i> Đang được giữ</span>' : ''}
                    </div>
                    <div style="font-size: 11px; color: #6b7280;">Mã: ${p.ProductCode || 'N/A'}</div>
                    ${p.heldBy ? `<div style="font-size: 11px; color: #d97706; margin-top: 2px;"><i class="fas fa-user"></i> Người giữ: <strong>${p.heldBy}</strong></div>` : ''}
                    <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">${p.addedDate || ''}</div>
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
                <td style="text-align: right; font-weight: 600; width: 120px; color: #ef4444;">${((p.Quantity || 0) * (p.Price || 0)).toLocaleString('vi-VN')}đ</td>
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
        `}).join('');

        // Calculate totals
        const totalQuantity = products.reduce((sum, p) => sum + (p.Quantity || 0), 0);
        const totalAmount = products.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);

        container.innerHTML = searchUI + `
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

    // =====================================================
    // HELD PRODUCTS MANAGEMENT
    // =====================================================

    /**
     * Cleanup held products for current user when closing modal or disconnecting
     * Removes all held products from Firebase held_products collection
     */
    window.cleanupHeldProducts = async function () {
        if (!window.firebase || !window.authManager) {
            console.log('[HELD-PRODUCTS] Firebase/AuthManager not available');
            return;
        }

        const auth = window.authManager.getAuthState();
        if (!auth) {
            console.log('[HELD-PRODUCTS] No auth state');
            return;
        }

        // Get userId
        let userId = auth.id || auth.Id || auth.username || auth.userType;
        if (!userId && auth.displayName) {
            userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');
        }

        if (!userId) {
            console.warn('[HELD-PRODUCTS] No userId found');
            return;
        }

        const orderId = window.currentChatOrderData?.Id;
        if (!orderId) {
            console.log('[HELD-PRODUCTS] No current order');
            return;
        }

        try {
            console.log('[HELD-PRODUCTS] Cleaning up held products for user:', userId, 'order:', orderId);

            // Get all held products for this user in this order
            const heldRef = window.firebase.database().ref(`held_products/${orderId}`);
            const snapshot = await heldRef.once('value');
            const orderProducts = snapshot.val() || {};

            let cleanupCount = 0;

            for (const productId in orderProducts) {
                const productHolders = orderProducts[productId];
                if (productHolders && productHolders[userId]) {
                    // Remove this user's hold
                    await window.firebase.database().ref(`held_products/${orderId}/${productId}/${userId}`).remove();
                    cleanupCount++;

                    // Clear heldBy from dropped products if no one else is holding
                    if (window.clearHeldByIfNotHeld) {
                        await window.clearHeldByIfNotHeld(productId);
                    }
                }
            }

            console.log(`[HELD-PRODUCTS] ✓ Cleaned up ${cleanupCount} held products`);

        } catch (error) {
            console.error('[HELD-PRODUCTS] ❌ Error cleaning up:', error);
        }
    };

    /**
     * Update held product quantity in Firebase
     * @param {number} productId - Product ID
     * @param {number} quantity - New quantity
     */
    window.updateHeldProductQuantity = async function (productId, quantity) {
        if (!window.firebase || !window.authManager) return;

        const auth = window.authManager.getAuthState();
        if (!auth) return;

        let userId = auth.id || auth.Id || auth.username || auth.userType;
        if (!userId && auth.displayName) {
            userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');
        }

        const orderId = window.currentChatOrderData?.Id;
        if (!userId || !orderId) return;

        try {
            const ref = window.firebase.database().ref(`held_products/${orderId}/${productId}/${userId}`);

            if (quantity > 0) {
                // Update quantity
                await ref.update({
                    quantity: quantity,
                    timestamp: Date.now()
                });
                console.log('[HELD-PRODUCTS] ✓ Updated quantity to', quantity);
            } else {
                // Remove if quantity is 0
                await ref.remove();
                console.log('[HELD-PRODUCTS] ✓ Removed (quantity = 0)');

                // Clear heldBy if no one else is holding
                if (window.clearHeldByIfNotHeld) {
                    await window.clearHeldByIfNotHeld(productId);
                }
            }

        } catch (error) {
            console.error('[HELD-PRODUCTS] ❌ Error updating quantity:', error);
        }
    };

    /**
     * Remove held product from Firebase
     * @param {number} productId - Product ID to remove
     */
    window.removeHeldProduct = async function (productId) {
        if (!window.firebase || !window.authManager) return;

        const auth = window.authManager.getAuthState();
        if (!auth) return;

        let userId = auth.id || auth.Id || auth.username || auth.userType;
        if (!userId && auth.displayName) {
            userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');
        }

        const orderId = window.currentChatOrderData?.Id;
        if (!userId || !orderId) return;

        try {
            console.log('[HELD-PRODUCTS] Removing held product:', productId);

            const ref = window.firebase.database().ref(`held_products/${orderId}/${productId}/${userId}`);
            await ref.remove();

            console.log('[HELD-PRODUCTS] ✓ Removed from Firebase');

            // Clear heldBy from dropped products if no one else is holding
            if (window.clearHeldByIfNotHeld) {
                await window.clearHeldByIfNotHeld(productId);
            }

        } catch (error) {
            console.error('[HELD-PRODUCTS] ❌ Error removing:', error);
        }
    };

    /**
     * Setup realtime listener for held products changes
     * Syncs changes from other users in real-time
     */
    window.setupHeldProductsListener = function () {
        if (!window.firebase) return;

        const orderId = window.currentChatOrderData?.Id;
        if (!orderId) return;

        console.log('[HELD-PRODUCTS] Setting up realtime listener for order:', orderId);

        const heldRef = window.firebase.database().ref(`held_products/${orderId}`);

        // Listen for changes
        heldRef.on('value', (snapshot) => {
            const heldData = snapshot.val() || {};

            console.log('[HELD-PRODUCTS] Realtime update received:', Object.keys(heldData).length, 'products');

            // Update window.currentChatOrderData.Details with held products
            if (window.currentChatOrderData && window.currentChatOrderData.Details) {
                // Remove old held products
                window.currentChatOrderData.Details = window.currentChatOrderData.Details.filter(p => !p.IsHeld);

                // Add current held products from Firebase
                for (const productId in heldData) {
                    const productHolders = heldData[productId];

                    // Sum quantities from all holders
                    let totalQuantity = 0;
                    let holders = [];

                    for (const userId in productHolders) {
                        const holderData = productHolders[userId];
                        if (holderData && !holderData.isDraft) {
                            totalQuantity += parseInt(holderData.quantity) || 0;
                            holders.push(holderData.displayName);
                        }
                    }

                    if (totalQuantity > 0) {
                        // Find product in dropped products for details
                        const droppedProduct = droppedProducts.find(p => String(p.ProductId) === String(productId));

                        if (droppedProduct) {
                            window.currentChatOrderData.Details.push({
                                ProductId: parseInt(productId),
                                ProductName: droppedProduct.ProductName,
                                ProductCode: droppedProduct.ProductCode,
                                ProductNameGet: droppedProduct.ProductNameGet,
                                ImageUrl: droppedProduct.ImageUrl,
                                Price: droppedProduct.Price,
                                Quantity: totalQuantity,
                                UOMId: 1,
                                UOMName: droppedProduct.UOMName || 'Cái',
                                Factor: 1,
                                Priority: 0,
                                OrderId: window.currentChatOrderData.Id,
                                LiveCampaign_DetailId: null,
                                ProductWeight: 0,
                                Note: null,
                                IsHeld: true,
                                HeldBy: holders.join(', ')
                            });
                        }
                    }
                }

                // Re-render Orders tab
                if (typeof window.renderChatProductsTable === 'function') {
                    window.renderChatProductsTable();
                }
            }
        });

        // Store reference for cleanup
        window.heldProductsListener = heldRef;
    };

    /**
     * Cleanup held products listener
     */
    window.cleanupHeldProductsListener = function () {
        if (window.heldProductsListener) {
            console.log('[HELD-PRODUCTS] Cleaning up listener');
            window.heldProductsListener.off();
            window.heldProductsListener = null;
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
