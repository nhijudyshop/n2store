// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
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
    // REMOVED: dropped_products_history - không còn sử dụng

    // Local state - FIREBASE IS THE SINGLE SOURCE OF TRUTH
    let droppedProducts = [];
    // REMOVED: historyItems - không còn sử dụng
    let isInitialized = false;
    let firebaseDb = null;
    let droppedProductsRef = null;
    let isFirstLoad = true;

    // Campaign filter state for dropped products
    let currentCampaignFilter = 'current'; // 'all' | 'current' | specific campaignId (default to current campaign for sync)

    /**
     * Get all Shopify campaign IDs belonging to the active DB campaign.
     * Uses Tab1's selectedCampaign.campaignIds (Shopify UUIDs) as primary source.
     * Falls back to currentChatOrderData.LiveCampaignId.
     */
    function _getCurrentCampaignIds() {
        const ids = new Set();

        // Source 1: Tab1's selected campaign has Shopify campaign IDs
        try {
            const tab1Win = window.parent?.document?.getElementById('ordersFrame')?.contentWindow;
            const shopifyIds = tab1Win?.selectedCampaign?.campaignIds;
            if (Array.isArray(shopifyIds) && shopifyIds.length > 0) {
                shopifyIds.forEach(id => ids.add(String(id)));
            }
        } catch (e) { /* cross-origin */ }

        // Source 2: Current chat order's campaign ID
        if (window.currentChatOrderData?.LiveCampaignId) {
            ids.add(String(window.currentChatOrderData.LiveCampaignId));
        }

        return Array.from(ids);
    }

    // Loading states for better UX during multi-user operations
    let operationsInProgress = new Set();

    // Debounce timer for render functions to prevent stack overflow
    let renderDebounceTimer = null;
    const RENDER_DEBOUNCE_MS = 150;

    /**
     * Debounced render and update counts to prevent "Maximum call stack size exceeded"
     * when multiple Firebase events fire simultaneously
     */
    function debouncedRenderAndUpdate() {
        if (renderDebounceTimer) {
            clearTimeout(renderDebounceTimer);
        }
        renderDebounceTimer = setTimeout(() => {
            // Apply campaign filter if active
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

        if (currentCampaignFilter === 'current') {
            // Collect ALL Shopify campaign IDs for the active DB campaign
            const currentCampaignIds = _getCurrentCampaignIds();

            if (currentCampaignIds.length === 0) return null; // No current campaign, show all
            return droppedProducts.filter((p) => currentCampaignIds.includes(String(p.campaignId)));
        }

        // Specific campaign ID
        return droppedProducts.filter((p) => String(p.campaignId) === currentCampaignFilter);
    }

    /**
     * Get all campaigns from campaignManager (tab1) + dropped products
     * Prioritizes campaignManager as source of truth, supplements with dropped products data
     */
    function getAllCampaigns() {
        const campaigns = new Map(); // campaignId -> campaignName

        // 1. Primary source: campaignManager from tab1
        if (window.campaignManager?.allCampaigns) {
            Object.entries(window.campaignManager.allCampaigns).forEach(([id, campaign]) => {
                campaigns.set(String(id), campaign.name || campaign.displayName || id);
            });
        }

        // 2. Supplement: campaigns from dropped products (for old campaigns with data but removed from campaignManager)
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
        console.log('[DROPPED-DEBUG] 🔄 Dropdown changed to:', filterValue);
        currentCampaignFilter = filterValue;
        const filtered = getFilteredDroppedProducts();
        console.log('[DROPPED-DEBUG] Filtered result:', filtered ? `${filtered.length} products` : 'null (show all)');
        renderDroppedProductsTable(filtered);
    };

    // Product search state
    let productSearchInitialized = false;
    let searchSuggestionsVisible = false;

    /**
     * Initialize the dropped products manager
     * FIREBASE-ONLY: Multi-user collaborative editing mode
     */
    window.initDroppedProductsManager = async function () {
        if (isInitialized) return;

        try {
            // Check Firebase availability
            if (!window.firebase || !window.firebase.database) {
                console.error('[DROPPED-PRODUCTS] Firebase not available - cannot initialize');
                showError('Firebase không khả dụng. Vui lòng tải lại trang.');
                return;
            }

            // Ensure Firebase is initialized (config from shared/js/firebase-config.js)
            if (!window.firebase.apps.length) {
                if (typeof FIREBASE_CONFIG !== 'undefined') {
                    window.firebase.initializeApp(FIREBASE_CONFIG);
                } else if (typeof firebaseConfig !== 'undefined') {
                    window.firebase.initializeApp(firebaseConfig);
                } else {
                    console.error(
                        '[DROPPED-PRODUCTS] No Firebase config found. Ensure shared/js/firebase-config.js is loaded.'
                    );
                    return;
                }
            }

            // Get Firebase database reference
            firebaseDb = window.firebase.database();

            // Setup realtime listeners - UI will update automatically
            loadDroppedProductsFromFirebase();
            // REMOVED: loadHistoryFromFirebase() - không còn sử dụng

            isInitialized = true;

            // Render initial loading state
            renderDroppedProductsTable();
            renderHistoryList(); // Hiển thị thông báo history đã bị tắt
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
            droppedProductsRef = firebaseDb.ref(DROPPED_PRODUCTS_COLLECTION);

            // Handle new items
            droppedProductsRef.on(
                'child_added',
                (snapshot) => {
                    const itemId = snapshot.key;
                    const itemData = snapshot.val();

                    // Check if item already exists by ID (prevent duplicates)
                    const existingIndex = droppedProducts.findIndex((p) => p.id === itemId);

                    if (existingIndex > -1) {
                        // Item already exists, skip (should not happen in normal flow)
                        if (!isFirstLoad) {
                            console.warn(
                                '[DROPPED-PRODUCTS] Duplicate add detected for ID:',
                                itemId
                            );
                        }
                        return;
                    }

                    // Add new item to local array with normalized ProductId (ensure number type)
                    droppedProducts.push({
                        id: itemId,
                        ...itemData,
                        ProductId: parseInt(itemData.ProductId) || itemData.ProductId, // Normalize to number
                    });

                    // Notification for other users (skip during initial load)
                    if (!isFirstLoad) {
                        // Real-time notification for sale_removed items
                        if (itemData.reason === 'sale_removed') {
                            const removedBy = itemData.removedBy || 'Sale';
                            const productName =
                                itemData.ProductNameGet || itemData.ProductName || 'SP';
                            const qty = itemData.Quantity || 1;
                            const stt = itemData.removedFromOrderSTT || '?';
                            const customer = itemData.removedFromCustomer || '?';
                            const msg = `🔔 ${removedBy} vừa xả ${productName} x${qty} từ đơn STT ${stt} (${customer})`;
                            if (window.notificationManager) {
                                window.notificationManager.show(msg, 'warning', 5000);
                            }
                        }
                    }

                    // Update UI with debounce to prevent stack overflow
                    debouncedRenderAndUpdate();
                },
                (error) => {
                    console.error('[DROPPED-PRODUCTS] ❌ child_added error:', error);
                }
            );

            // Handle updated items (e.g., quantity changes from other users)
            droppedProductsRef.on(
                'child_changed',
                (snapshot) => {
                    const itemId = snapshot.key;
                    const itemData = snapshot.val();

                    // Find and update existing item
                    const existingIndex = droppedProducts.findIndex((p) => p.id === itemId);

                    if (existingIndex > -1) {
                        droppedProducts[existingIndex] = {
                            id: itemId,
                            ...itemData,
                            ProductId: parseInt(itemData.ProductId) || itemData.ProductId, // Normalize to number
                        };
                    } else {
                        console.warn('[DROPPED-PRODUCTS] ⚠️ Update for non-existent item:', itemId);
                    }

                    // Update UI with debounce to prevent stack overflow
                    debouncedRenderAndUpdate();
                },
                (error) => {
                    console.error('[DROPPED-PRODUCTS] ❌ child_changed error:', error);
                }
            );

            // Handle removed items (deleted by other users)
            droppedProductsRef.on(
                'child_removed',
                (snapshot) => {
                    const itemId = snapshot.key;

                    // Find and remove item from local array
                    const existingIndex = droppedProducts.findIndex((p) => p.id === itemId);

                    if (existingIndex > -1) {
                        droppedProducts.splice(existingIndex, 1);
                    } else {
                        console.warn('[DROPPED-PRODUCTS] ⚠️ Remove for non-existent item:', itemId);
                    }

                    // Update UI with debounce to prevent stack overflow
                    debouncedRenderAndUpdate();
                },
                (error) => {
                    console.error('[DROPPED-PRODUCTS] ❌ child_removed error:', error);
                }
            );

            // Mark first load complete after initial sync
            setTimeout(() => {
                isFirstLoad = false;
            }, 1000);
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error setting up listeners:', error);
        }
    }

    // REMOVED: loadHistoryFromFirebase() - không còn sử dụng dropped_products_history

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
        if (droppedProductsRef) {
            droppedProductsRef.off();
            droppedProductsRef = null;
        }

        // REMOVED: historyRef cleanup - không còn sử dụng

        isInitialized = false;
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
            // Load Excel data for search
            await window.ProductSearchModule.loadExcelData(
                () => {},
                () => {}
            );

            productSearchInitialized = true;
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

        // Add click handlers
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

    /**
     * Add product from search to dropped list
     */
    async function addProductFromSearch(productId) {
        if (!window.ProductSearchModule) {
            showError('ProductSearchModule không khả dụng');
            return;
        }

        try {
            // Load full product details
            const result = await window.ProductSearchModule.loadProductDetails(productId, {
                autoAddVariants: false, // Don't auto-add variants for dropped products
            });

            const productData = result.productData;

            // Create product object for dropped list
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
    window.addToDroppedProducts = async function (
        product,
        quantity,
        reason = 'removed',
        holderName = null,
        metadata = null
    ) {
        if (!firebaseDb) {
            showError('Firebase không khả dụng');
            return;
        }

        // Note: holderName parameter is deprecated - heldBy is now computed dynamically from held_products
        // metadata: optional object { removedBy, removedFromOrderSTT, removedFromCustomer, removedAt }

        try {
            // Check if product already exists
            const existing = droppedProducts.find((p) => p.ProductId === product.ProductId);

            if (existing && existing.id) {
                // Product exists - use TRANSACTION to increment quantity atomically
                const itemRef = firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${existing.id}`);

                await itemRef.transaction((current) => {
                    if (current === null) return current; // Item was deleted, abort

                    // Atomic increment
                    const updates = {
                        ...current,
                        Quantity: (current.Quantity || 0) + quantity,
                        reason: reason,
                        addedAt: window.firebase.database.ServerValue.TIMESTAMP,
                        addedDate: new Date().toLocaleString('vi-VN'),
                    };

                    // Merge metadata if provided (update with latest removal info)
                    if (metadata) {
                        if (metadata.removedBy) updates.removedBy = metadata.removedBy;
                        if (metadata.removedFromOrderSTT)
                            updates.removedFromOrderSTT = metadata.removedFromOrderSTT;
                        if (metadata.removedFromCustomer)
                            updates.removedFromCustomer = metadata.removedFromCustomer;
                        updates.removedAt = metadata.removedAt || Date.now();
                    }

                    // Set campaign info if not already present
                    if (!current.campaignId) {
                        const cId =
                            window.currentChatOrderData?.LiveCampaignId ||
                            (typeof campaignInfoFromTab1 !== 'undefined' &&
                                campaignInfoFromTab1?.activeCampaignId) ||
                            null;
                        const cName =
                            window.currentChatOrderData?.LiveCampaignName ||
                            (typeof campaignInfoFromTab1 !== 'undefined' &&
                                campaignInfoFromTab1?.activeCampaignName) ||
                            '';
                        if (cId) {
                            updates.campaignId = String(cId);
                            updates.campaignName = cName || '';
                        }
                    }

                    return updates;
                });

            } else {
                // New product - push to Firebase (listener will update UI)
                // Get campaign info from current context
                const campaignId =
                    window.currentChatOrderData?.LiveCampaignId ||
                    (typeof campaignInfoFromTab1 !== 'undefined' &&
                        campaignInfoFromTab1?.activeCampaignId) ||
                    null;
                const campaignName =
                    window.currentChatOrderData?.LiveCampaignName ||
                    (typeof campaignInfoFromTab1 !== 'undefined' &&
                        campaignInfoFromTab1?.activeCampaignName) ||
                    '';

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
                    addedDate: new Date().toLocaleString('vi-VN'),
                    campaignId: campaignId ? String(campaignId) : null,
                    campaignName: campaignName || '',
                    // NO heldBy field - computed dynamically
                };

                // Merge metadata if provided
                if (metadata) {
                    if (metadata.removedBy) newItem.removedBy = metadata.removedBy;
                    if (metadata.removedFromOrderSTT)
                        newItem.removedFromOrderSTT = metadata.removedFromOrderSTT;
                    if (metadata.removedFromCustomer)
                        newItem.removedFromCustomer = metadata.removedFromCustomer;
                    newItem.removedAt = metadata.removedAt || Date.now();
                }

                await firebaseDb.ref(DROPPED_PRODUCTS_COLLECTION).push(newItem);
            }

            // Add to history
            await addHistoryItem({
                action: reason === 'removed' ? 'Xóa sản phẩm' : 'Giảm số lượng',
                productName: product.ProductNameGet || product.ProductName,
                productCode: product.ProductCode,
                quantity: quantity,
                price: product.Price,
            });

            // NO need to update UI manually - realtime listener handles it!
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] ❌ Error adding product:', error);
            showError('Lỗi khi thêm sản phẩm: ' + error.message);
        }
    };

    /**
     * Get list of users currently holding a product across ALL orders
     * Returns array of holder objects with detailed info for display in Dropped tab
     * @param {number|string} productId - Product ID to check
     * @returns {Promise<Array<{name: string, campaign: string, stt: string|number}>>} Array of holder info objects
     */
    window.getProductHolders = async function (productId) {
        if (!window.firebase) return [];

        try {
            const heldProductsRef = window.firebase.database().ref('held_products');
            const snapshot = await heldProductsRef.once('value');
            const allOrders = snapshot.val() || {};

            const holders = []; // Array to store holder info with campaign/STT
            const seenHolders = new Set(); // Track unique holder+campaign+stt combinations

            // Scan all orders for this product
            for (const orderId in allOrders) {
                const orderProducts = allOrders[orderId];
                if (!orderProducts) continue;

                const productHolders = orderProducts[String(productId)];
                if (!productHolders) continue;

                // Collect all holders with quantity > 0 (both temporary and saved)
                for (const userId in productHolders) {
                    const holderData = productHolders[userId];
                    if (holderData && (parseInt(holderData.quantity) || 0) > 0) {
                        const name = holderData.displayName || userId;
                        const campaign = holderData.campaignName || '';
                        const stt = holderData.stt || '';

                        // Create unique key to avoid duplicates
                        const key = `${name}|${campaign}|${stt}`;
                        if (!seenHolders.has(key)) {
                            seenHolders.add(key);
                            holders.push({
                                name: name,
                                campaign: campaign,
                                stt: stt,
                                quantity: parseInt(holderData.quantity) || 0,
                            });
                        }
                    }
                }
            }

            return holders;
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error getting holders:', error);
            return [];
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
            const heldProductsRef = firebaseDb.ref('held_products');
            const snapshot = await heldProductsRef.once('value');
            const allOrders = snapshot.val() || {};

            // Scan all orders for this product
            for (const orderId in allOrders) {
                const orderProducts = allOrders[orderId];
                if (!orderProducts) continue;

                const productHolders = orderProducts[String(productId)];
                if (!productHolders) continue;

                // Check if any holder has quantity > 0 (both temporary and saved)
                for (const userId in productHolders) {
                    const holderData = productHolders[userId];
                    if (holderData && (parseInt(holderData.quantity) || 0) > 0) {
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error checking held status:', error);
            return false; // Assume not held on error
        }
    }

    /**
     * Clean up dropped product if it has quantity=0 and no one is holding it
     * This removes "zombie" products that were fully transferred to orders
     * @param {number|string} productId - Product ID to check and potentially remove
     */
    window.clearHeldByIfNotHeld = async function (productId) {
        if (!firebaseDb) return;

        try {
            // Normalize productId
            const normalizedProductId = parseInt(productId);
            if (isNaN(normalizedProductId)) {
                console.error('[DROPPED-PRODUCTS] Invalid productId for cleanup:', productId);
                return;
            }

            // Check if product still has holders
            const holders = await window.getProductHolders(normalizedProductId);

            if (holders.length > 0) {
                return; // Don't clean up, still being held
            }

            // Find product in dropped list
            const droppedProduct = droppedProducts.find((p) => p.ProductId === normalizedProductId);

            if (!droppedProduct) {
                return;
            }

            // Check if quantity is 0
            if ((droppedProduct.Quantity || 0) > 0) {
                return; // Don't clean up, still has stock
            }

            // Product has quantity=0 and no holders -> remove from Firebase
            const itemRef = firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${droppedProduct.id}`);
            await itemRef.remove();
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] Error during cleanup:', error);
        }
    };

    /**
     * Add history item - DISABLED
     * History feature has been removed to reduce Firebase costs
     */
    async function addHistoryItem(item) {
        // DISABLED: dropped_products_history không còn sử dụng
        // Giữ function để không gây lỗi cho code gọi đến
        return;
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
            showSuccess('Đã xóa khỏi hàng rớt - xả');
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] ❌ Error removing from Firebase:', error);
            showError('Lỗi khi xóa: ' + error.message);
        }
    };

    /**
     * Remove dropped product by ProductId (used when confirming held product into order)
     */
    window.removeDroppedProductByProductId = async function (productId) {
        if (!firebaseDb) return;

        productId = Number(productId);
        const product = droppedProducts.find(p => Number(p.ProductId) === productId);
        if (!product || !product.id) return;

        try {
            await firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${product.id}`).remove();
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] ❌ Error removing by ProductId:', error);
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
                    Quantity: newQty,
                };
            });

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

        // Ensure Details array exists
        if (!window.currentChatOrderData.Details) {
            window.currentChatOrderData.Details = [];
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
                    fullProduct = await window.productSearchManager.getFullProductDetails(
                        product.ProductId,
                        true
                    );
                } catch (e) {
                    console.error('[DROPPED-PRODUCTS] Failed to fetch full details:', e);
                }
            }

            // Check if product already exists in held list (merge quantity)
            const existingHeldIndex = window.currentChatOrderData.Details.findIndex(
                (p) => p.ProductId === product.ProductId && p.IsHeld
            );

            if (existingHeldIndex > -1) {
                // Product already in held list - increment quantity
                window.currentChatOrderData.Details[existingHeldIndex].Quantity += 1;
            } else {
                // Add as NEW held item - PRESERVE original name from dropped products
                window.currentChatOrderData.Details.push({
                    ProductId: product.ProductId,
                    ProductName: product.ProductName, // Keep original name with [CODE] prefix
                    ProductNameGet: product.ProductNameGet, // Keep original format
                    ProductCode: fullProduct
                        ? fullProduct.DefaultCode || fullProduct.Barcode
                        : product.ProductCode,
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
                    // Additional fields for compatibility
                    Name: product.ProductName,
                    Code: product.ProductCode,
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
                            (p) => p.ProductId === productId && p.IsHeld
                        );
                        const heldQuantity = currentHeldProduct ? currentHeldProduct.Quantity : 1;

                        // Sync to Firebase - use transaction to preserve isDraft if already saved
                        const ref = window.firebase
                            .database()
                            .ref(`held_products/${orderId}/${productId}/${userId}`);

                        await ref.transaction((current) => {
                            // Preserve isDraft if already saved (true)
                            const preservedIsDraft = current?.isDraft === true ? true : false;

                            return {
                                productId: productId,
                                displayName: auth.displayName || auth.userType || 'Unknown',
                                quantity: heldQuantity,
                                isDraft: preservedIsDraft, // Preserve if saved, else temporary
                                timestamp: window.firebase.database.ServerValue.TIMESTAMP,
                                campaignName: window.currentChatOrderData?.LiveCampaignName || '',
                                stt: window.currentChatOrderData?.SessionIndex || '',
                                // Product details for reload
                                productName: product.ProductName || '',
                                productNameGet: product.ProductNameGet || product.ProductName || '',
                                productCode: product.ProductCode || '',
                                imageUrl: product.ImageUrl || '',
                                price: product.Price || 0,
                                uomName: product.UOMName || 'Cái',
                            };
                        });

                    } else {
                        console.warn(
                            '[DROPPED-PRODUCTS] No userId found, cannot sync to Firebase held_products'
                        );
                    }
                } else {
                    console.warn(
                        '[DROPPED-PRODUCTS] No auth state, cannot sync to Firebase held_products'
                    );
                }
            } else {
                console.warn(
                    '[DROPPED-PRODUCTS] Firebase/AuthManager not available, cannot sync held_products'
                );
            }

            // KPI Audit Log - KHÔNG ghi ở đây
            // SP mới chỉ ở trạng thái held (chưa confirm vào đơn hàng)
            // Audit log sẽ được ghi khi confirmHeldProduct() thực sự thêm SP vào đơn
            // Tránh double count: moveDroppedToOrder +1 rồi confirmHeldProduct +1 = 2

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
                    Quantity: Math.max(0, newQty),
                };
            });

            // Add to history
            await addHistoryItem({
                action: 'Chuyển về đơn hàng',
                productName: product.ProductNameGet || product.ProductName,
                productCode: product.ProductCode,
                quantity: 1,
                price: product.Price,
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
    async function renderDroppedProductsTable(filteredProducts = null) {
        const container = document.getElementById('chatDroppedProductsContainer');
        if (!container) return;

        const products = filteredProducts || droppedProducts;

        // Fetch holders for all products in parallel
        const productsWithHolders = await Promise.all(
            products.map(async (p) => {
                const holders = await window.getProductHolders(p.ProductId);
                return {
                    ...p,
                    _holders: holders, // Array of {name, campaign, stt, quantity}
                };
            })
        );

        // Auto-set default filter to active campaign on first load
        const activeCampaignId = window.campaignManager?.activeCampaignId
            ? String(window.campaignManager.activeCampaignId)
            : null;
        if (isFirstLoad && currentCampaignFilter === 'all' && activeCampaignId) {
            currentCampaignFilter = activeCampaignId;
        }

        // Build campaign filter options from campaignManager + droppedProducts
        const allCampaigns = getAllCampaigns();
        const activeCampaignName = window.campaignManager?.activeCampaign?.name || 'Live hiện tại';
        let campaignOptions = `<option value="all"${currentCampaignFilter === 'all' ? ' selected' : ''}>Tất cả đợt live</option>`;
        allCampaigns.forEach((name, id) => {
            const isActive = id === activeCampaignId;
            const displayName = isActive ? `${name} (hiện tại)` : name;
            const selected = currentCampaignFilter === id ? ' selected' : '';
            campaignOptions += `<option value="${id}"${selected}>${displayName}</option>`;
        });

        // Add search UI at the top
        const searchUI = `
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
                // Find actual index by ProductId instead of object reference
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

                // Build tooltip with product info + notes
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
                                      const h = p._holders[0]; // First holder info for badge
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

        // Calculate totals
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

    /**
     * Filter dropped products
     */
    window.filterDroppedProducts = async function (query) {
        // Start with campaign-filtered products
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
     * History feature has been removed to reduce Firebase costs
     */
    function renderHistoryList() {
        const container = document.getElementById('chatHistoryContainer');
        if (!container) return;

        // History feature đã bị tắt để tiết kiệm chi phí Firebase
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
        buttons.forEach((btn) => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.style.background = isActive ? 'white' : '#f8fafc';
            btn.style.color = isActive ? '#3b82f6' : '#64748b';
            btn.style.borderBottomColor = isActive ? '#3b82f6' : 'transparent';
        });

        // Update tab content
        const contents = document.querySelectorAll('.chat-tab-content');
        contents.forEach((content) => {
            content.style.display = 'none';
        });

        const activeContent = document.getElementById(
            tabName === 'orders'
                ? 'chatTabOrders'
                : tabName === 'dropped'
                  ? 'chatTabDropped'
                  : tabName === 'history'
                    ? 'chatTabHistory'
                    : 'chatTabInvoiceHistory'
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
            if (
                window.chatProductManager &&
                typeof window.chatProductManager.renderInvoiceHistory === 'function'
            ) {
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
            showSuccess('Đã xóa tất cả hàng rớt - xả');
        } catch (error) {
            console.error('[DROPPED-PRODUCTS] ❌ Error clearing from Firebase:', error);
            showError('Lỗi khi xóa: ' + error.message);
        }
    };

    // =====================================================
    // GETTERS FOR EXTERNAL MODULES
    // =====================================================

    /**
     * Get dropped products array (for held-products-manager.js)
     * @returns {Array} droppedProducts array
     */
    window.getDroppedProducts = function () {
        return droppedProducts;
    };

    /**
     * Get Firebase database reference (for held-products-manager.js)
     * @returns {Object} Firebase database reference
     */
    window.getDroppedFirebaseDb = function () {
        return firebaseDb;
    };

    // NOTE: Held Products Management has been moved to held-products-manager.js

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initDroppedProductsManager, 500);
        });
    } else {
        setTimeout(initDroppedProductsManager, 500);
    }

})();
