/**
 * Chat Modal Products Manager
 * Handles product search, add, edit, remove functionality in the chat modal
 */

(function () {
    'use strict';

    // ==================== CUSTOM POPUP MANAGER ====================
    /**
     * Custom Popup Manager - Replaces browser default alert/confirm/prompt
     */
    const CustomPopup = {
        /**
         * Initialize popup styles
         */
        injectStyles: function () {
            if (document.getElementById('custom-popup-styles')) return;

            const styles = document.createElement('style');
            styles.id = 'custom-popup-styles';
            styles.textContent = `
                .custom-popup-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(4px);
                    z-index: 99999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                }

                .custom-popup-overlay.show {
                    opacity: 1;
                }

                .custom-popup-container {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    max-width: 500px;
                    width: 90%;
                    overflow: hidden;
                    transform: scale(0.9) translateY(-20px);
                    transition: transform 0.2s ease;
                }

                .custom-popup-overlay.show .custom-popup-container {
                    transform: scale(1) translateY(0);
                }

                .custom-popup-header {
                    padding: 20px 24px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .custom-popup-header.alert {
                    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                }

                .custom-popup-header.confirm {
                    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                }

                .custom-popup-header.error {
                    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                }

                .custom-popup-header.success {
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                }

                .custom-popup-header-icon {
                    font-size: 24px;
                }

                .custom-popup-header-title {
                    font-size: 18px;
                    font-weight: 600;
                    margin: 0;
                }

                .custom-popup-body {
                    padding: 24px;
                    color: #1f2937;
                    font-size: 15px;
                    line-height: 1.6;
                    white-space: pre-wrap;
                }

                .custom-popup-input {
                    width: 100%;
                    padding: 10px 12px;
                    border: 2px solid #e5e7eb;
                    border-radius: 6px;
                    font-size: 14px;
                    margin-top: 12px;
                    transition: border-color 0.2s;
                }

                .custom-popup-input:focus {
                    outline: none;
                    border-color: #3b82f6;
                }

                .custom-popup-footer {
                    padding: 16px 24px;
                    background: #f9fafb;
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                }

                .custom-popup-btn {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }

                .custom-popup-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                }

                .custom-popup-btn:active {
                    transform: translateY(0);
                }

                .custom-popup-btn-primary {
                    background: #3b82f6;
                    color: white;
                }

                .custom-popup-btn-primary:hover {
                    background: #2563eb;
                }

                .custom-popup-btn-success {
                    background: #10b981;
                    color: white;
                }

                .custom-popup-btn-success:hover {
                    background: #059669;
                }

                .custom-popup-btn-danger {
                    background: #ef4444;
                    color: white;
                }

                .custom-popup-btn-danger:hover {
                    background: #dc2626;
                }

                .custom-popup-btn-secondary {
                    background: #e5e7eb;
                    color: #374151;
                }

                .custom-popup-btn-secondary:hover {
                    background: #d1d5db;
                }
            `;
            document.head.appendChild(styles);
        },

        /**
         * Create popup element
         */
        createPopup: function (config) {
            const {
                type = 'alert',
                title = 'Thông báo',
                message = '',
                icon = 'fa-info-circle',
                confirmText = 'OK',
                cancelText = 'Hủy',
                showInput = false,
                inputPlaceholder = '',
                inputValue = ''
            } = config;

            const overlay = document.createElement('div');
            overlay.className = 'custom-popup-overlay';
            overlay.innerHTML = `
                <div class="custom-popup-container">
                    <div class="custom-popup-header ${type}">
                        <i class="fas ${icon} custom-popup-header-icon"></i>
                        <h3 class="custom-popup-header-title">${title}</h3>
                    </div>
                    <div class="custom-popup-body">
                        ${message}
                        ${showInput ? `<input type="text" class="custom-popup-input" placeholder="${inputPlaceholder}" value="${inputValue}">` : ''}
                    </div>
                    <div class="custom-popup-footer">
                        ${type === 'confirm' ? `<button class="custom-popup-btn custom-popup-btn-secondary" data-action="cancel">
                            <i class="fas fa-times"></i> ${cancelText}
                        </button>` : ''}
                        <button class="custom-popup-btn custom-popup-btn-primary" data-action="confirm">
                            <i class="fas fa-check"></i> ${confirmText}
                        </button>
                    </div>
                </div>
            `;

            return overlay;
        },

        /**
         * Show popup and return promise
         */
        show: function (config) {
            this.injectStyles();

            return new Promise((resolve) => {
                const popup = this.createPopup(config);
                document.body.appendChild(popup);

                const input = popup.querySelector('.custom-popup-input');

                // Focus input if exists
                if (input) {
                    setTimeout(() => input.focus(), 100);
                }

                // Animate in
                setTimeout(() => popup.classList.add('show'), 10);

                // Handle button clicks
                const handleClick = (e) => {
                    const action = e.target.closest('[data-action]')?.dataset.action;
                    if (!action) return;

                    // Animate out
                    popup.classList.remove('show');

                    setTimeout(() => {
                        popup.remove();

                        if (action === 'confirm') {
                            resolve(input ? input.value : true);
                        } else {
                            resolve(false);
                        }
                    }, 200);
                };

                popup.addEventListener('click', (e) => {
                    // Close on overlay click
                    if (e.target === popup) {
                        handleClick({ target: { closest: () => ({ dataset: { action: 'cancel' } }) } });
                    }
                });

                popup.querySelectorAll('[data-action]').forEach(btn => {
                    btn.addEventListener('click', handleClick);
                });

                // Handle Enter key
                if (input) {
                    input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            handleClick({ target: { closest: () => ({ dataset: { action: 'confirm' } }) } });
                        }
                    });
                }

                // Handle Escape key
                const handleEscape = (e) => {
                    if (e.key === 'Escape') {
                        handleClick({ target: { closest: () => ({ dataset: { action: 'cancel' } }) } });
                        document.removeEventListener('keydown', handleEscape);
                    }
                };
                document.addEventListener('keydown', handleEscape);
            });
        },

        /**
         * Show alert popup
         */
        alert: function (message, title = 'Thông báo', type = 'alert') {
            const icons = {
                alert: 'fa-info-circle',
                error: 'fa-exclamation-circle',
                success: 'fa-check-circle',
                warning: 'fa-exclamation-triangle'
            };

            return this.show({
                type: type,
                title: title,
                message: message,
                icon: icons[type] || icons.alert,
                confirmText: 'Đóng'
            });
        },

        /**
         * Show confirm popup
         */
        confirm: function (message, title = 'Xác nhận') {
            return this.show({
                type: 'confirm',
                title: title,
                message: message,
                icon: 'fa-question-circle',
                confirmText: 'Xác nhận',
                cancelText: 'Hủy'
            });
        },

        /**
         * Show prompt popup
         */
        prompt: function (message, title = 'Nhập thông tin', placeholder = '', defaultValue = '') {
            return this.show({
                type: 'confirm',
                title: title,
                message: message,
                icon: 'fa-edit',
                showInput: true,
                inputPlaceholder: placeholder,
                inputValue: defaultValue,
                confirmText: 'Xác nhận',
                cancelText: 'Hủy'
            });
        },

        /**
         * Show error popup
         */
        error: function (message, title = 'Lỗi') {
            return this.alert(message, title, 'error');
        },

        /**
         * Show success popup
         */
        success: function (message, title = 'Thành công') {
            return this.alert(message, title, 'success');
        },

        /**
         * Show warning popup
         */
        warning: function (message, title = 'Cảnh báo') {
            return this.alert(message, title, 'confirm');
        }
    };

    // Make CustomPopup globally available
    window.CustomPopup = CustomPopup;
    // ==================== END CUSTOM POPUP MANAGER ====================

    // Global state for current chat order
    window.currentChatOrderData = null;
    let chatInlineSearchTimeout = null;

    /**
     * Load order product history from Firebase
     * DUAL TRACKING METHOD: Returns a Map of productId -> {baseProduct, baseline, currentQty, kpiQty}
     * - baseProduct: Initial quantity when order FIRST OPENED (IMMUTABLE - không đổi)
     * - baseline: High water mark - mức cao nhất từng đạt (chỉ tăng, không giảm)
     * - currentQty: Current quantity in order
     * - kpiQty: Total KPI counted (cumulative)
     */
    async function loadOrderProductHistory(orderId) {
        if (!window.firebase || !orderId) return new Map();

        try {
            const ref = firebase.database().ref(`order_product_history/${orderId}`);
            const snapshot = await ref.once('value');
            const data = snapshot.val() || {};

            // Convert to Map<productId, {baseProduct, baseline, currentQty, kpiQty}>
            const historyMap = new Map();
            Object.keys(data).forEach(productId => {
                const entry = data[productId];
                if (typeof entry === 'object') {
                    // NEW DUAL TRACKING format
                    if (entry.baseProduct !== undefined && entry.baseline !== undefined) {
                        historyMap.set(productId, {
                            baseProduct: entry.baseProduct || 0,
                            baseline: entry.baseline || 0,
                            currentQty: entry.currentQty || 0,
                            kpiQty: entry.kpiQty || 0
                        });
                    }
                    // MIGRATE from old watermark format (baselineQty)
                    else if (entry.baselineQty !== undefined) {
                        const baselineQty = entry.baselineQty || 0;
                        const currentQty = entry.currentQty || 0;
                        historyMap.set(productId, {
                            baseProduct: baselineQty,  // Old baseline becomes baseProduct
                            baseline: Math.max(baselineQty, currentQty), // High water mark
                            currentQty: currentQty,
                            kpiQty: entry.kpiQty || 0
                        });
                        console.log(`[MIGRATION] Product ${productId}: baselineQty=${baselineQty} → baseProduct=${baselineQty}, baseline=${Math.max(baselineQty, currentQty)}`);
                    }
                    // MIGRATE from old format (quantity + kpiQuantity)
                    else {
                        const oldQty = entry.quantity || 0;
                        const oldKpiQty = entry.kpiQuantity || 0;
                        const calcBaseProduct = oldQty - oldKpiQty;
                        historyMap.set(productId, {
                            baseProduct: calcBaseProduct,
                            baseline: oldQty, // Old qty becomes baseline (high water mark)
                            currentQty: oldQty,
                            kpiQty: oldKpiQty
                        });
                        console.log(`[MIGRATION] Product ${productId}: oldFormat → baseProduct=${calcBaseProduct}, baseline=${oldQty}`);
                    }
                } else {
                    historyMap.set(productId, { baseProduct: 0, baseline: 0, currentQty: 0, kpiQty: 0 });
                }
            });

            console.log('[DUAL-TRACKING] Loaded history from Firebase:', historyMap.size, 'products');
            return historyMap;
        } catch (error) {
            console.error('[DUAL-TRACKING] Error loading history:', error);
            return new Map();
        }
    }

    /**
     * Update order product history in Firebase (DUAL TRACKING METHOD)
     * @param {string} orderId - The order ID
     * @param {Array<{productId: string, productName: string, baseProduct: number, baseline: number, currentQty: number, kpiQty: number}>} products
     */
    async function updateOrderProductHistory(orderId, products) {
        if (!window.firebase || !orderId || !products || products.length === 0) return;

        try {
            const ref = firebase.database().ref(`order_product_history/${orderId}`);

            // Create updates object with dual tracking structure
            const updates = {};
            products.forEach(p => {
                updates[String(p.productId)] = {
                    productName: p.productName || `Product ${p.productId}`,  // Store product name
                    baseProduct: p.baseProduct || 0,    // Immutable - số lượng ban đầu
                    baseline: p.baseline || 0,          // High water mark
                    currentQty: p.currentQty || 0,
                    kpiQty: p.kpiQty || 0,
                    lastUpdated: Date.now()
                };
            });

            await ref.update(updates);
            console.log('[DUAL-TRACKING] Updated history in Firebase:', products.length, 'products');
        } catch (error) {
            console.error('[DUAL-TRACKING] Error updating history:', error);
        }
    }

    /**
     * Initialize chat modal products when modal is opened
     */
    window.initChatModalProducts = async function (orderData) {
        console.log('[CHAT-PRODUCTS] Initializing with order data:', orderData);

        window.currentChatOrderData = orderData;

        // Ensure Details array exists
        if (!window.currentChatOrderData.Details) {
            window.currentChatOrderData.Details = [];
        }

        // Reset IsHeld for all existing products (they are now part of the order)
        window.currentChatOrderData.Details.forEach(p => {
            p.IsHeld = false;
        });

        // Initialize held status listener
        window.currentHeldStatus = {};
        listenToHeldStatus(window.currentChatOrderData.Id);

        // Render products table
        renderChatProductsTable();

        // Initialize search
        initChatInlineProductSearch();

        // WATERMARK METHOD: ONLY LOAD history from Firebase (DO NOT set baseline yet)
        // Baseline will be set BEFORE the FIRST action that changes the order
        // This is a Map<productId, {baselineQty, currentQty, kpiQty}>
        window.originalOrderProductQuantities = await loadOrderProductHistory(window.currentChatOrderData.Id);

        console.log('[KPI-WATERMARK] Loaded history:', window.originalOrderProductQuantities.size, 'products');

        // BASELINE SAVE: Capture initial snapshot of products when order is opened
        // This snapshot will be used as baseline (ONLY products that existed when order was opened)
        // Products added AFTER opening will NOT be included in baseline
        window.initialOrderSnapshot = new Map();
        (window.currentChatOrderData.Details || []).forEach(p => {
            if (p.ProductId && !p.IsHeld) {
                const productId = String(p.ProductId);
                window.initialOrderSnapshot.set(productId, p.Quantity || 0);
                console.log(`[BASELINE-SNAPSHOT] Captured initial product: ${productId} = ${p.Quantity || 0}`);
            }
        });
        console.log('[BASELINE-SNAPSHOT] Captured', window.initialOrderSnapshot.size, 'products from initial order state');

        // Update counts
        updateChatProductCounts();
    };

    /**
     * Listen to realtime held status (GLOBAL)
     */
    function listenToHeldStatus(currentOrderId) {
        if (!window.firebase) return;

        // Listen to ROOT held_products to get status from ALL orders
        const ref = firebase.database().ref(`held_products`);
        ref.on('value', async (snapshot) => {
            const globalData = snapshot.val() || {};

            // Aggregate data: productId -> { userId -> { quantity, displayName, orderId, isDraft } }
            const aggregatedStatus = {};
            const currentOrderHeldData = globalData[currentOrderId] || {};

            Object.keys(globalData).forEach(orderId => {
                const productsInOrder = globalData[orderId];
                if (!productsInOrder) return;

                Object.keys(productsInOrder).forEach(productId => {
                    const holders = productsInOrder[productId];
                    if (!holders) return;

                    if (!aggregatedStatus[productId]) {
                        aggregatedStatus[productId] = {};
                    }

                    Object.keys(holders).forEach(userId => {
                        const holderData = holders[userId];
                        // Composite key to allow same user holding in multiple orders (though rare for same product)
                        // Actually, we want to list them all.
                        // Let's keep userId as key if we assume one user holds per product per order?
                        // But wait, if User A holds Product X in Order 1 AND Order 2?
                        // The structure is productId -> userId -> data. 
                        // If we use userId as key, we overwrite.
                        // So we need a unique key for the holder entry in the aggregated view.
                        // Let's use `${userId}_${orderId}` as key?
                        // Or better, just an array of holders?
                        // But existing code expects an object where values have .quantity.
                        // Let's check renderRows usage of currentHeldStatus.

                        // Existing usage in renderRows:
                        // const holders = window.currentHeldStatus[p.ProductId];
                        // Object.values(holders).forEach(h => ... h.displayName ... h.quantity)

                        // So we can just use unique keys for the object values.
                        const uniqueKey = `${userId}_${orderId}`;
                        aggregatedStatus[productId][uniqueKey] = {
                            ...holderData,
                            orderId: orderId,
                            isCurrentOrder: String(orderId) === String(currentOrderId)
                        };
                    });
                });
            });

            // console.log('[HELD-DEBUG] Aggregated held status:', aggregatedStatus);
            window.currentHeldStatus = aggregatedStatus;

            // SYNC LOGIC: Check for products in Firebase that are NOT in local Details
            // ONLY for the current order
            if (currentOrderHeldData) {
                const heldProductIds = Object.keys(currentOrderHeldData);
                const localProductIds = window.currentChatOrderData.Details.map(p => String(p.ProductId));

                const missingProductIds = heldProductIds.filter(id => !localProductIds.includes(id));

                // IMPORTANT: Also update IsHeld for draft products already in Details
                heldProductIds.forEach(productId => {
                    const holders = currentOrderHeldData[productId];
                    if (!holders) return;

                    // Check if this is a draft (any holder has isDraft = true)
                    let isDraft = false;
                    let totalHeldQty = 0;
                    Object.values(holders).forEach(h => {
                        if (h.isDraft) isDraft = true;
                        totalHeldQty += (parseInt(h.quantity) || 0);
                    });

                    // Find product in local Details
                    const localProduct = window.currentChatOrderData.Details.find(p => String(p.ProductId) === productId);

                    if (localProduct && isDraft && totalHeldQty > 0) {
                        // Update IsHeld and quantity for draft products
                        localProduct.IsHeld = true;
                        localProduct.Quantity = totalHeldQty;
                        console.log('[HELD-DEBUG] Updated draft product in Details:', productId, 'qty:', totalHeldQty);
                    }
                });

                if (missingProductIds.length > 0) {
                    console.log('[HELD-DEBUG] Found missing held products for CURRENT order:', missingProductIds);

                    // Fetch and add missing products
                    for (const productId of missingProductIds) {
                        try {
                            // Check if we have valid holders for this product in CURRENT order
                            const holders = currentOrderHeldData[productId];
                            let hasValidHolders = false;
                            let totalHeldQty = 0;
                            let hasDraftHolder = false; // IMPORTANT: Only add if has draft holder
                            if (holders) {
                                Object.values(holders).forEach(h => {
                                    if ((parseInt(h.quantity) || 0) > 0) {
                                        hasValidHolders = true;
                                        totalHeldQty += (parseInt(h.quantity) || 0);
                                    }
                                    if (h.isDraft) {
                                        hasDraftHolder = true;
                                    }
                                });
                            }

                            // ONLY add if has draft holder (saved draft)
                            // Non-draft products will be removed on disconnect, so don't restore them
                            if (!hasValidHolders || !hasDraftHolder) {
                                console.log('[HELD-DEBUG] Skipping product without draft:', productId);
                                continue;
                            }

                            // Fetch full details
                            if (window.productSearchManager) {
                                const fullProduct = await window.productSearchManager.getFullProductDetails(parseInt(productId));

                                if (fullProduct) {
                                    // Add to local details as HELD
                                    const newProduct = {
                                        ProductId: fullProduct.Id,
                                        Quantity: totalHeldQty, // Use total held quantity from Firebase
                                        Price: fullProduct.PriceVariant || fullProduct.ListPrice || fullProduct.StandardPrice || 0,
                                        Note: null,
                                        UOMId: fullProduct.UOM?.Id || 1,
                                        Factor: 1,
                                        Priority: 0,
                                        OrderId: window.currentChatOrderData?.Id || null,
                                        LiveCampaign_DetailId: null,
                                        ProductWeight: 0,
                                        ProductName: fullProduct.Name || fullProduct.NameTemplate,
                                        ProductNameGet: fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                                        ProductCode: fullProduct.DefaultCode || fullProduct.Barcode,
                                        UOMName: fullProduct.UOM?.Name || 'Cái',
                                        ImageUrl: fullProduct.ImageUrl,
                                        IsHeld: true,
                                        IsFromDropped: false,
                                        StockQty: fullProduct.QtyAvailable
                                    };

                                    window.currentChatOrderData.Details.push(newProduct);
                                    console.log('[HELD-DEBUG] Added missing DRAFT product to local list:', newProduct.ProductNameGet, 'qty:', totalHeldQty);
                                }
                            }
                        } catch (err) {
                            console.error('[HELD-DEBUG] Error syncing product ' + productId, err);
                        }
                    }
                }
            }

            renderChatProductsTable();
        });
    }

    /**
     * Update held status in Firebase
     */
    function updateHeldStatus(productId, isHeld, quantity = 1, isDraft = false) {
        console.log('[HELD-DEBUG] updateHeldStatus called:', { productId, isHeld, quantity, isDraft });

        if (!window.currentChatOrderData?.Id) {
            console.warn('[HELD-DEBUG] No current order data');
            return;
        }
        if (!window.firebase) {
            console.error('[HELD-DEBUG] Firebase not available');
            return;
        }
        if (!window.authManager) {
            console.error('[HELD-DEBUG] AuthManager not available');
            return;
        }

        const orderId = window.currentChatOrderData.Id;
        const auth = window.authManager.getAuthState();
        console.log('[HELD-DEBUG] Auth state:', auth);

        if (!auth) {
            console.warn('[HELD-DEBUG] No auth object');
            return;
        }

        // Fallback for userId if id is missing
        let userId = auth.id || auth.Id || auth.username || auth.userType;

        if (!userId) {
            // Last resort: use displayName but sanitize it
            if (auth.displayName) {
                userId = auth.displayName.replace(/[.#$/\[\]]/g, '_'); // Sanitize for Firebase key
            } else {
                console.warn('[HELD-DEBUG] No usable User ID found in auth');
                return;
            }
        }

        const ref = firebase.database().ref(`held_products/${orderId}/${productId}/${userId}`);

        if (isHeld) {
            console.log('[HELD-DEBUG] Setting held status in Firebase');
            ref.set({
                displayName: auth.displayName || auth.userType || 'Unknown',
                quantity: quantity,
                isDraft: isDraft,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            }).then(() => {
                // IMPORTANT: Handle disconnect behavior
                if (isDraft) {
                    // If draft, CANCEL any remove-on-disconnect (persist)
                    ref.onDisconnect().cancel();
                    console.log('[HELD-DEBUG] Draft saved - persisted on disconnect');
                } else {
                    // If NOT draft, ensure it is removed on disconnect (refresh/close)
                    ref.onDisconnect().remove();
                    console.log('[HELD-DEBUG] Held status - set to remove on disconnect');
                }
            }).catch(err => console.error('[HELD-DEBUG] Firebase set error:', err));
        } else {
            console.log('[HELD-DEBUG] Removing held status from Firebase');
            ref.remove().then(() => {
                // Cancel onDisconnect since we already removed it
                ref.onDisconnect().cancel();
            }).catch(err => console.error('[HELD-DEBUG] Firebase remove error:', err));
        }
    }

    /**
     * Initialize inline product search for chat modal
     */
    function initChatInlineProductSearch() {
        const searchInput = document.getElementById('chatInlineProductSearch');
        if (!searchInput) return;

        // Remove existing listeners
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);

        newSearchInput.addEventListener('input', () => {
            const query = newSearchInput.value.trim();

            if (chatInlineSearchTimeout) {
                clearTimeout(chatInlineSearchTimeout);
            }

            if (query.length < 2) {
                hideChatInlineResults();
                return;
            }

            chatInlineSearchTimeout = setTimeout(async () => {
                await searchChatProducts(query);
            }, 300);
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.chat-product-search-inline')) {
                hideChatInlineResults();
            }
        });
    }

    /**
     * Search products for chat modal
     */
    async function searchChatProducts(query) {
        if (!window.productSearchManager) {
            console.error('[CHAT-PRODUCTS] productSearchManager not available');
            return;
        }

        try {
            // Ensure products are loaded first
            if (!window.productSearchManager.isLoaded) {
                await window.productSearchManager.fetchExcelProducts();
            }
            const results = window.productSearchManager.search(query, 10);
            displayChatSearchResults(results);
        } catch (error) {
            console.error('[CHAT-PRODUCTS] Search error:', error);
            showChatSearchError(error.message);
        }
    }

    /**
     * Display search results in chat modal
     */
    function displayChatSearchResults(results) {
        const resultsContainer = document.getElementById('chatInlineSearchResults');
        if (!resultsContainer) return;

        if (!results || results.length === 0) {
            resultsContainer.innerHTML = '<div class="chat-search-no-results">Không tìm thấy sản phẩm nào</div>';
            resultsContainer.style.display = 'block';
            return;
        }

        const html = results.map(product => {
            const imageUrl = product.ImageUrl || '';
            const name = product.NameGet || product.Name || 'N/A';
            const code = product.DefaultCode || product.Barcode || 'N/A';
            const price = product.PriceVariant || product.ListPrice || product.StandardPrice || 0;

            // Check if product is already in order
            const isInOrder = window.currentChatOrderData?.Details?.some(p => p.ProductId == product.Id);
            const badge = isInOrder ? '<span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">Đã có</span>' : '';

            return `
                <div class="chat-search-result-item" onclick="addChatProductToOrder(${product.Id})">
                    ${imageUrl ? `<img src="${imageUrl}" class="chat-search-result-image">` : '<div class="chat-search-result-image" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center;"><i class="fas fa-box" style="color: white;"></i></div>'}
                    <div class="chat-search-result-info">
                        <div class="chat-search-result-name">${name} ${badge}</div>
                        <div class="chat-search-result-code">Mã: ${code}</div>
                    </div>
                    <div class="chat-search-result-price">${price.toLocaleString('vi-VN')}đ</div>
                </div>
            `;
        }).join('');

        resultsContainer.innerHTML = html;
        resultsContainer.style.display = 'block';
    }

    /**
     * Show search error
     */
    function showChatSearchError(message) {
        const resultsContainer = document.getElementById('chatInlineSearchResults');
        if (!resultsContainer) return;

        resultsContainer.innerHTML = `<div class="chat-search-no-results" style="color: #ef4444;"><i class="fas fa-exclamation-triangle"></i> ${message}</div>`;
        resultsContainer.style.display = 'block';
    }

    /**
     * Hide search results
     */
    function hideChatInlineResults() {
        const resultsContainer = document.getElementById('chatInlineSearchResults');
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
        }
    }

    /**
     * Add product to chat order
     */
    /**
     * Add product to chat order
     */
    window.addChatProductToOrder = async function (productId) {
        let notificationId = null;

        try {
            // Show loading
            if (window.notificationManager) {
                notificationId = window.notificationManager.show(
                    'Đang thêm sản phẩm...',
                    'info',
                    0,
                    { showOverlay: true, persistent: true }
                );
            }

            // Get full product details
            // Get full product details (FORCE REFRESH to get latest qty)
            const fullProduct = await window.productSearchManager.getFullProductDetails(productId, true);

            if (!fullProduct) {
                throw new Error('Không tìm thấy thông tin sản phẩm');
            }

            // Ensure Details array exists
            if (!window.currentChatOrderData.Details) {
                window.currentChatOrderData.Details = [];
            }

            // Check if product already exists IN HELD LIST
            const existingIndex = window.currentChatOrderData.Details.findIndex(
                p => p.ProductId == productId && p.IsHeld
            );

            if (existingIndex > -1) {
                // Increase quantity of HELD product directly (avoid async issues)
                const existingProduct = window.currentChatOrderData.Details[existingIndex];
                existingProduct.Quantity = (existingProduct.Quantity || 0) + 1;

                // Close loading
                if (window.notificationManager && notificationId) {
                    window.notificationManager.remove(notificationId);
                }

                // Render table
                renderChatProductsTable();

                // Update Firebase status with new quantity
                updateHeldStatus(existingProduct.ProductId, true, existingProduct.Quantity);

                if (window.notificationManager) {
                    window.notificationManager.show(
                        `Đã tăng số lượng ${existingProduct.ProductNameGet || existingProduct.ProductName} (${existingProduct.Quantity})`,
                        'success'
                    );
                }
            } else {
                // Add new product
                const newProduct = {
                    ProductId: fullProduct.Id,
                    Quantity: 1,
                    Price: fullProduct.PriceVariant || fullProduct.ListPrice || fullProduct.StandardPrice || 0,
                    Note: null,
                    UOMId: fullProduct.UOM?.Id || 1,
                    Factor: 1,
                    Priority: 0,
                    OrderId: window.currentChatOrderData?.Id || null,
                    LiveCampaign_DetailId: null,
                    ProductWeight: 0,
                    ProductName: fullProduct.Name || fullProduct.NameTemplate,
                    ProductNameGet: fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                    ProductCode: fullProduct.DefaultCode || fullProduct.Barcode,
                    UOMName: fullProduct.UOM?.Name || 'Cái',
                    ImageUrl: fullProduct.ImageUrl,
                    IsHeld: true, // Mark as held (new product)
                    IsFromDropped: false, // Mark as NOT from dropped list
                    StockQty: fullProduct.QtyAvailable // Store stock quantity
                };

                window.currentChatOrderData.Details.push(newProduct);

                // Close loading
                if (window.notificationManager && notificationId) {
                    window.notificationManager.remove(notificationId);
                }

                // Render table
                renderChatProductsTable();

                // Update Firebase status
                updateHeldStatus(newProduct.ProductId, true, newProduct.Quantity);

                if (window.notificationManager) {
                    window.notificationManager.show(
                        `Đã thêm ${newProduct.ProductNameGet} vào danh sách đang giữ`,
                        'success'
                    );
                }
            }

            // Hide search results
            hideChatInlineResults();

            // Clear search input
            const searchInput = document.getElementById('chatInlineProductSearch');
            if (searchInput) {
                searchInput.value = '';
            }

        } catch (error) {
            console.error('[CHAT-PRODUCTS] Error adding product:', error);

            if (window.notificationManager && notificationId) {
                window.notificationManager.remove(notificationId);
            }

            if (window.notificationManager) {
                window.notificationManager.show(
                    `Lỗi: ${error.message}`,
                    'error'
                );
            } else {
                CustomPopup.error(`${error.message}`, 'Lỗi');
            }
        }
    };

    /**
     * Update product quantity in chat order
     */
    window.updateChatProductQuantity = async function (index, change, value = null) {
        const product = window.currentChatOrderData.Details[index];
        const oldQty = product.Quantity || 0;

        // Handle decrease confirmation
        if (change < 0) {
            if (oldQty <= 1) {
                // If quantity is 1, treat as remove request
                // removeChatProduct has its own confirmation
                window.removeChatProduct(index);
                return;
            } else {
                // If quantity > 1, confirm decrease
                const confirmed = await CustomPopup.confirm(
                    `Bạn có chắc muốn giảm số lượng sản phẩm "${product.ProductNameGet || product.ProductName}"?`,
                    'Xác nhận giảm số lượng'
                );
                if (!confirmed) {
                    return;
                }
            }
        }

        let newQty = value !== null ? parseInt(value, 10) : oldQty + change;

        if (newQty < 1) newQty = 1;

        // If quantity is reduced, add the difference to dropped products
        // Applies to order products OR held products from dropped list
        if (newQty < oldQty && (!product.IsHeld || product.IsFromDropped) && typeof window.addToDroppedProducts === 'function') {
            const reducedQty = oldQty - newQty;
            window.addToDroppedProducts(product, reducedQty, 'reduced');
        }

        product.Quantity = newQty;

        // Re-render table
        renderChatProductsTable();

        // Save changes ONLY if not held
        if (!product.IsHeld) {
            await saveChatOrderChanges();
            if (window.notificationManager) {
                window.notificationManager.show('Đã cập nhật số lượng', 'success');
            }
        } else {
            // Update Firebase status with new quantity
            updateHeldStatus(product.ProductId, true, newQty);

            // Just show local notification
            if (window.notificationManager) {
                window.notificationManager.show('Đã cập nhật số lượng (chưa lưu)', 'success');
            }
        }
    };

    /**
     * Update product note in chat order
     */
    window.updateChatProductNote = function (index, note) {
        const product = window.currentChatOrderData.Details[index];
        product.Note = note;

        // Debounce save for note updates could be good, but for now let's just save on change (blur)
        // The input has onchange="updateChatProductNote..." which triggers on blur/enter

        if (!product.IsHeld) {
            saveChatOrderChanges();
            if (window.notificationManager) {
                window.notificationManager.show('Đã cập nhật ghi chú', 'success');
            }
        }
    };

    /**
     * Remove product from chat order
     */
    window.removeChatProduct = async function (index) {
        const product = window.currentChatOrderData.Details[index];

        const confirmed = await CustomPopup.confirm(
            `Bạn có chắc muốn xóa sản phẩm "${product.ProductNameGet || product.ProductName}"?`,
            'Xác nhận xóa sản phẩm'
        );
        if (!confirmed) {
            return;
        }

        // Add to dropped products if it's an order product OR came from dropped list
        if ((!product.IsHeld || product.IsFromDropped) && typeof window.addToDroppedProducts === 'function') {
            window.addToDroppedProducts(product, product.Quantity || 1, 'removed');
        }

        window.currentChatOrderData.Details.splice(index, 1);

        // Re-render table
        renderChatProductsTable();

        // Save changes ONLY if not held
        if (!product.IsHeld) {
            await saveChatOrderChanges();
            if (window.notificationManager) {
                window.notificationManager.show('Đã xóa sản phẩm', 'success');
            }
        } else {
            // Remove from Firebase
            updateHeldStatus(product.ProductId, false);

            if (window.notificationManager) {
                window.notificationManager.show('Đã xóa sản phẩm đang giữ', 'success');
            }
        }
    };

    /**
     * Save chat order changes to API
     */
    async function saveChatOrderChanges() {
        if (!window.currentChatOrderData || !window.currentChatOrderData.Id) return;

        let notifId = null;
        try {
            // Show inline loading
            showChatTableLoading();

            // Optional: still show global notification if preferred, or rely on inline
            // if (window.notificationManager) {
            //     notifId = window.notificationManager.saving('Đang lưu thay đổi...');
            // }

            // Check if this is the FIRST action (declare at the top to avoid reference errors)
            const hasAnyTracking = window.originalOrderProductQuantities.size > 0;

            // DUAL TRACKING: Set baseProduct + baseline before API call (ONLY on FIRST action)
            // - baseProduct: Immutable - số lượng ban đầu từ snapshot
            // - baseline: High water mark - mức cao nhất (initially = currentQty)

            // Note: hasAnyTracking is used in multiple places below

            if (!hasAnyTracking && window.initialOrderSnapshot && window.initialOrderSnapshot.size > 0) {
                // FIRST ACTION: Set baseProduct + baseline for products from initial snapshot
                const trackingSnapshot = [];
                window.initialOrderSnapshot.forEach((initialQty, productId) => {
                    // Check if product still exists in order (and not held)
                    const product = (window.currentChatOrderData.Details || []).find(p =>
                        String(p.ProductId) === productId && !p.IsHeld
                    );

                    if (product) {
                        const currentQty = product.Quantity || 0;

                        const newEntry = {
                            productId: productId,
                            productName: product.ProductNameGet || product.ProductName || `Product ${productId}`,
                            baseProduct: initialQty,        // IMMUTABLE - from snapshot
                            baseline: currentQty,           // High water mark - initially = currentQty
                            currentQty: currentQty,
                            kpiQty: Math.max(0, currentQty - initialQty)  // KPI from baseProduct
                        };

                        trackingSnapshot.push(newEntry);

                        // Update in-memory map
                        window.originalOrderProductQuantities.set(productId, newEntry);

                        console.log(`[DUAL-TRACKING] First action before API: ${productId} baseProduct=${initialQty}, baseline=${currentQty}, KPI=${newEntry.kpiQty}`);
                    } else {
                        console.log(`[DUAL-TRACKING] Product ${productId} from snapshot no longer in order (removed before first action)`);
                    }
                });

                // Save tracking to Firebase BEFORE API call
                if (trackingSnapshot.length > 0) {
                    await updateOrderProductHistory(window.currentChatOrderData.Id, trackingSnapshot);
                    console.log(`[DUAL-TRACKING] Saved ${trackingSnapshot.length} tracking records before API call (first action)`);
                }
            }
            // SUBSEQUENT ACTIONS: baseProduct stays immutable, baseline follows high water mark

            const payload = prepareChatOrderPayload(window.currentChatOrderData);

            // Get auth headers
            const headers = await window.tokenManager.getAuthHeader();

            const response = await API_CONFIG.smartFetch(
                `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${window.currentChatOrderData.Id})`,
                {
                    method: "PUT",
                    headers: {
                        ...headers,
                        "Content-Type": "application/json",
                        Accept: "application/json",
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            if (window.notificationManager && notifId) {
                window.notificationManager.remove(notifId);
            }

            // Update cache if needed
            if (window.cacheManager) {
                window.cacheManager.clear("orders");
            }

            // DUAL TRACKING: Check for KPI changes with HIGH WATER MARK logic AFTER API call
            const productsToUpdate = [];
            const reductions = [];
            const kpiIncreases = [];

            // Create a set of current product IDs for quick lookup
            const currentProductIds = new Set(
                (window.currentChatOrderData.Details || [])
                    .filter(p => !p.IsHeld)
                    .map(p => String(p.ProductId))
            );

            // NEW: Check if this is FIRST action AND there are reductions/deletions
            // If so, set baseProduct from snapshot BEFORE processing
            // Note: hasAnyTracking already declared at the top of this function

            if (!hasAnyTracking && window.initialOrderSnapshot && window.initialOrderSnapshot.size > 0) {
                // Check if there will be any reductions or deletions
                let hasReductionOrDeletion = false;

                // Check for reductions (quantity decreased)
                (window.currentChatOrderData.Details || [])
                    .filter(p => !p.IsHeld)
                    .forEach(p => {
                        const productId = String(p.ProductId);
                        const snapshotQty = window.initialOrderSnapshot.get(productId);
                        if (snapshotQty !== undefined && p.Quantity < snapshotQty) {
                            hasReductionOrDeletion = true;
                        }
                    });

                // Check for deletions (product in snapshot but not in current order)
                window.initialOrderSnapshot.forEach((qty, productId) => {
                    if (!currentProductIds.has(productId)) {
                        hasReductionOrDeletion = true;
                    }
                });

                // If there are reductions or deletions, set baseProduct from snapshot
                if (hasReductionOrDeletion) {
                    console.log('[BASE-PRODUCT] First action is reduction/deletion, setting baseProduct from snapshot');
                    const trackingSnapshot = [];

                    window.initialOrderSnapshot.forEach((initialQty, productId) => {
                        // Find current quantity (may be 0 if deleted)
                        const product = (window.currentChatOrderData.Details || []).find(p =>
                            String(p.ProductId) === productId && !p.IsHeld
                        );
                        const currentQty = product ? (product.Quantity || 0) : 0;

                        const newEntry = {
                            productId: productId,
                            productName: product ? (product.ProductNameGet || product.ProductName) : `Product ${productId}`,
                            baseProduct: initialQty,        // IMMUTABLE - from snapshot
                            baseline: initialQty,           // Set to base for compatibility
                            currentQty: currentQty,
                            kpiQty: Math.max(0, currentQty - initialQty)
                        };

                        trackingSnapshot.push(newEntry);
                        window.originalOrderProductQuantities.set(productId, newEntry);

                        console.log(`[BASE-PRODUCT] Set from snapshot: ${productId} baseProduct=${initialQty}, current=${currentQty}, KPI=${newEntry.kpiQty}`);
                    });

                    // Save tracking to Firebase
                    if (trackingSnapshot.length > 0) {
                        await updateOrderProductHistory(window.currentChatOrderData.Id, trackingSnapshot);
                        console.log(`[BASE-PRODUCT] Saved ${trackingSnapshot.length} tracking records from snapshot (first action: reduction/deletion)`);
                    }
                }
            }

            // Check products that are STILL IN ORDER
            (window.currentChatOrderData.Details || [])
                .filter(p => !p.IsHeld) // Only check non-held (saved) products
                .forEach(p => {
                    const productId = String(p.ProductId);
                    if (!productId || productId === 'undefined' || productId === 'null') return;

                    const newQuantity = p.Quantity || 0;
                    const historical = window.originalOrderProductQuantities.get(productId);

                    // If product not tracked, skip (shouldn't happen after tracking is set)
                    if (!historical) {
                        console.warn(`[DUAL-TRACKING] Product ${productId} not tracked, skipping`);
                        return;
                    }

                    // Get tracking data
                    const baseProduct = historical.baseProduct || 0;      // IMMUTABLE
                    const oldCurrentQty = historical.currentQty || 0;     // Previous qty
                    const oldKpiQty = historical.kpiQty || 0;            // Previous KPI

                    // BASE PRODUCT METHOD: KPI = Max(0, currentQty - baseProduct)
                    const newKpiQty = Math.max(0, newQuantity - baseProduct);
                    const kpiDelta = newKpiQty - oldKpiQty;

                    // Check if quantity DECREASED (reduction)
                    if (newQuantity < oldCurrentQty) {
                        const decreaseAmount = oldCurrentQty - newQuantity;
                        reductions.push({
                            productId: productId,
                            productName: p.ProductNameGet || p.ProductName || 'Unknown',
                            baseProduct: baseProduct,
                            oldKpiQty: oldKpiQty,
                            newQuantity: newQuantity,
                            newKpiQty: newKpiQty,
                            decreaseAmount: decreaseAmount,
                            reductionQty: Math.abs(kpiDelta) // Actual KPI reduction
                        });
                        console.log(`[BASE-PRODUCT] Quantity decreased ${productId}: ${oldCurrentQty} → ${newQuantity} (-${decreaseAmount}), KPI: ${oldKpiQty} → ${newKpiQty} (${kpiDelta})`);
                    }

                    // Check if KPI increased (quantity increased beyond previous)
                    if (kpiDelta > 0) {
                        kpiIncreases.push({
                            productId: productId,
                            productName: p.ProductNameGet || p.ProductName || 'Unknown',
                            oldKpiQty: oldKpiQty,
                            newKpiQty: newKpiQty,
                            kpiDelta: kpiDelta
                        });
                        console.log(`[BASE-PRODUCT] KPI increased ${productId}: ${oldKpiQty} → ${newKpiQty} (+${kpiDelta})`);
                    } else if (kpiDelta < 0) {
                        console.log(`[BASE-PRODUCT] KPI decreased ${productId}: ${oldKpiQty} → ${newKpiQty} (${kpiDelta})`);
                    } else {
                        console.log(`[BASE-PRODUCT] No KPI change ${productId}: qty=${newQuantity}, base=${baseProduct}, KPI=${newKpiQty}`);
                    }

                    // Prepare history update
                    productsToUpdate.push({
                        productId: productId,
                        productName: p.ProductNameGet || p.ProductName || historical.productName || `Product ${productId}`,
                        baseProduct: baseProduct,      // UNCHANGED
                        baseline: baseProduct,         // Deprecated, keep for compatibility
                        currentQty: newQuantity,
                        kpiQty: newKpiQty
                    });

                    // Update in-memory tracking
                    window.originalOrderProductQuantities.set(productId, {
                        productName: p.ProductNameGet || p.ProductName || historical.productName || `Product ${productId}`,
                        baseProduct: baseProduct,
                        baseline: baseProduct,
                        currentQty: newQuantity,
                        kpiQty: newKpiQty
                    });
                });

            // Check products that were DELETED (exist in history but not in current order)
            window.originalOrderProductQuantities.forEach((historical, productId) => {
                if (!currentProductIds.has(productId)) {
                    // Product was deleted - create reduction record
                    const oldCurrentQty = historical.currentQty || 0;
                    const oldKpiQty = historical.kpiQty || 0;
                    const baseProduct = historical.baseProduct || 0;

                    // Calculate new KPI for deleted product (qty = 0)
                    const newKpiQty = Math.max(0, 0 - baseProduct); // Always 0 since qty = 0
                    const kpiDelta = newKpiQty - oldKpiQty; // Will be negative if had KPI

                    if (oldCurrentQty > 0) {
                        reductions.push({
                            productId: productId,
                            productName: historical.productName || `Product ${productId}`, // Get name from history
                            baseProduct: baseProduct,
                            oldKpiQty: oldKpiQty,
                            newQuantity: 0,
                            newKpiQty: newKpiQty,
                            decreaseAmount: oldCurrentQty,
                            reductionQty: Math.abs(kpiDelta) // Actual KPI reduction
                        });
                        console.log(`[DUAL-TRACKING] Deleted product ${productId}: qty ${oldCurrentQty} → 0 (full deletion), KPI: ${oldKpiQty} → ${newKpiQty} (${kpiDelta})`);
                    }

                    // Update history: set currentQty = 0, KEEP baseline (high water mark never decreases)
                    productsToUpdate.push({
                        productId: productId,
                        productName: historical.productName || `Product ${productId}`,
                        baseProduct: historical.baseProduct || 0,  // UNCHANGED
                        baseline: historical.baseline || 0,        // KEEP high water mark
                        currentQty: 0,
                        kpiQty: newKpiQty                          // BUGFIX: Reset to 0 when deleted
                    });

                    // Update in-memory tracking
                    window.originalOrderProductQuantities.set(productId, {
                        productName: historical.productName || `Product ${productId}`,
                        baseProduct: historical.baseProduct || 0,
                        baseline: historical.baseline || 0,
                        currentQty: 0,
                        kpiQty: newKpiQty  // BUGFIX: Reset to 0 when deleted
                    });
                }
            });

            // Save NEGATIVE stats for reductions
            if (reductions.length > 0 && window.firebase && window.authManager) {
                try {
                    const auth = window.authManager.getAuthState();
                    let userId = auth.id || auth.Id || auth.username || auth.userType;
                    if (!userId && auth.displayName) userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');

                    if (userId) {
                        // Generate unique transaction ID
                        const transactionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                        // Generate session ID if not exists
                        if (!window.kpiSessionId) {
                            window.kpiSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        }

                        const totalReductionQty = reductions.reduce((sum, r) => sum + r.reductionQty, 0);
                        const statsRef = firebase.database().ref(`held_product_stats/${userId}/${Date.now()}`);

                        await statsRef.set({
                            transactionId: transactionId,        // NEW: Unique ID
                            action: 'reduce_quantity',           // NEW: Type of action
                            sessionId: window.kpiSessionId,      // NEW: Session grouping
                            userName: auth.displayName || auth.userType || 'Unknown',
                            productCount: -totalReductionQty, // NEGATIVE count
                            amount: -totalReductionQty * 5000, // NEGATIVE amount
                            timestamp: firebase.database.ServerValue.TIMESTAMP,
                            orderId: window.currentChatOrderData.Id || 'unknown',
                            orderSTT: window.currentChatOrderData.SessionIndex || '',
                            isReduction: true, // Flag to indicate this is a reduction
                            products: reductions.map(r => ({
                                name: r.productName,
                                quantity: -r.reductionQty, // Negative quantity
                                baseProduct: r.baseProduct,  // Base quantity (immutable)
                                oldKpiQty: r.oldKpiQty,
                                newQuantity: r.newQuantity,
                                newKpiQty: r.newKpiQty,
                                decreaseAmount: r.decreaseAmount,
                                isCounted: true
                            }))
                        });

                        console.log(`[KPI-REDUCTION] Saved negative stats: -${totalReductionQty} items, -${totalReductionQty * 5000}đ`);
                    }
                } catch (err) {
                    console.error('[KPI-REDUCTION] Error saving reduction stats:', err);
                }
            }

            // Update history in Firebase
            if (productsToUpdate.length > 0) {
                await updateOrderProductHistory(window.currentChatOrderData.Id, productsToUpdate);
            }

            console.log('[CHAT-PRODUCTS] Order saved successfully');

        } catch (error) {
            console.error('[CHAT-PRODUCTS] Error saving order:', error);
            if (window.notificationManager) {
                if (notifId) window.notificationManager.remove(notifId);
                window.notificationManager.error(`Lỗi lưu đơn hàng: ${error.message}`, 5000);
            }
        } finally {
            // Hide inline loading
            hideChatTableLoading();
        }
    }

    /**
     * Show inline loading overlay for chat table
     */
    function showChatTableLoading() {
        const container = document.getElementById('chatProductsTableContainer');
        if (!container) return;

        // Ensure container is relative for absolute positioning of overlay
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        // Check if overlay already exists
        let overlay = container.querySelector('.chat-table-loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'chat-table-loading-overlay';
            overlay.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(255, 255, 255, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
                backdrop-filter: blur(1px);
                border-radius: 8px;
            `;
            overlay.innerHTML = `
                <div style="text-align: center; color: #3b82f6;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 8px;"></i>
                    <div style="font-size: 13px; font-weight: 500;">Đang cập nhật...</div>
                </div>
            `;
            container.appendChild(overlay);
        }

        overlay.style.display = 'flex';
    }

    /**
     * Hide inline loading overlay
     */
    function hideChatTableLoading() {
        const container = document.getElementById('chatProductsTableContainer');
        if (!container) return;

        const overlay = container.querySelector('.chat-table-loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            // Optional: remove it from DOM if you prefer not to keep it
            // overlay.remove();
        }
    }

    /**
     * Prepare payload for chat order update
     * CRITICAL: Do NOT modify the structure of this payload without checking payload_chinh_xac.json
     * The server expects Partner, User, CRMTeam, and specific product details (ProductCode, UOMName, etc.) to be present.
     * Do NOT delete these fields.
     */
    function prepareChatOrderPayload(orderData) {
        // Clone data
        const payload = JSON.parse(JSON.stringify(orderData));

        // Add context
        if (!payload["@odata.context"]) {
            payload["@odata.context"] = "http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity";
        }

        // Clean top-level properties (remove navigation properties to avoid 400 Bad Request)
        // User requested to match "correct" payload which includes these.
        // DO NOT DELETE Partner, User, CRMTeam unless confirmed broken
        // delete payload.Partner;
        // delete payload.User;
        // delete payload.CRMTeam;
        // delete payload.DeliveryInfo;
        // delete payload.ExtraAddress;
        // delete payload.Facebook_Configs;

        // Clean Details
        if (payload.Details && Array.isArray(payload.Details)) {
            payload.Details = payload.Details.map(detail => {
                const cleaned = { ...detail };

                // Remove null/undefined Id
                if (!cleaned.Id) {
                    delete cleaned.Id;
                }

                // Ensure OrderId matches
                cleaned.OrderId = payload.Id;

                // Remove client-only properties
                delete cleaned.IsHeld;
                delete cleaned.IsFromDropped; // Remove IsFromDropped
                // delete cleaned.ProductNameGet; // Keep
                // delete cleaned.UOMName; // Keep
                // delete cleaned.ImageUrl; // Keep
                // delete cleaned.ProductCode; // Keep
                delete cleaned.StockQty; // Remove stock quantity (client-only)

                return cleaned;
            });
        }

        // Recalculate totals
        const details = payload.Details || [];
        payload.TotalQuantity = details.reduce((sum, p) => sum + (p.Quantity || 0), 0);
        payload.TotalAmount = details.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);

        return payload;
    }

    /**
     * Render products table in chat modal
     */
    window.renderChatProductsTable = function () {
        const container = document.getElementById('chatProductsTableContainer');
        if (!container) return;

        let details = window.currentChatOrderData?.Details || []; // Changed to 'let' to allow reassignment

        if (details.length === 0) {
            container.innerHTML = `
                <div class="chat-empty-products" style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                    <i class="fas fa-box-open" style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;"></i>
                    <p style="font-size: 14px; margin: 0;">Chưa có sản phẩm</p>
                    <p style="font-size: 12px; margin-top: 4px;">Tìm kiếm để thêm sản phẩm vào đơn</p>
                </div>
            `;
            updateChatProductCounts();
            return;
        }

        // Helper to render rows
        const renderRows = (products) => products.map((p) => {
            const i = details.indexOf(p); // Get actual index in main array
            const isHeld = p.IsHeld === true;

            const isOutOfStock = p.StockQty === 0;
            const nameColor = isOutOfStock ? '#ef4444' : 'inherit';
            const stockColor = isOutOfStock ? '#ef4444' : '#059669';

            // Check realtime held status
            let heldStatusHtml = '';

            // Debug: Log held status check
            // console.log('[HELD-DEBUG] Checking held status for product:', p.ProductId, window.currentHeldStatus);

            if (window.currentHeldStatus) {
                // Robust ID comparison: Convert both to strings
                const productIdStr = String(p.ProductId);
                const holders = window.currentHeldStatus[productIdStr] || window.currentHeldStatus[p.ProductId];

                if (holders) {
                    // Convert object to array of display names and calculate total held
                    const names = [];
                    let totalHeld = 0;

                    Object.values(holders).forEach(h => {
                        // Filter out stale entries if needed, or just display all
                        if (h.displayName) {
                            names.push(h.displayName);
                            totalHeld += (parseInt(h.quantity) || 0);
                        }
                    });

                    // console.log('[HELD-DEBUG] Holders found for ' + productIdStr + ':', names, 'Total held:', totalHeld);

                    if (names.length > 0) {
                        // Join names if multiple people holding
                        const namesStr = names.join(', ');

                        // Check if oversold
                        const isOversold = (p.StockQty !== undefined && p.StockQty !== null) && (totalHeld > p.StockQty);
                        const statusColor = isOversold ? '#ef4444' : '#d97706'; // Red if oversold, Orange if normal
                        const warningText = isOversold ? ' <b>(Vượt quá tồn!)</b>' : '';

                        heldStatusHtml = `<span style="color: ${statusColor}; font-size: 11px; margin-left: 6px; font-style: italic;">
                            <i class="fas fa-user-clock" style="margin-right: 2px;"></i> ${namesStr} đang giữ ${totalHeld > 1 ? `(${totalHeld})` : ''}${warningText}
                        </span>`;
                    }
                }
            }

            return `
            <tr class="chat-product-row" data-index="${i}">
                <td style="width: 30px;">${i + 1}</td>
                <td style="width: 60px;">
                    ${p.ImageUrl ? `<img src="${p.ImageUrl}" class="chat-product-image">` : '<div class="chat-product-image" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center;"><i class="fas fa-box" style="color: white; font-size: 18px;"></i></div>'}
                </td>
                <td>
                    <div style="font-weight: 600; margin-bottom: 2px; color: ${nameColor};">${p.ProductNameGet || p.ProductName}</div>
                    <div style="font-size: 11px; color: #6b7280;">Mã: ${p.ProductCode || 'N/A'}</div>
                    <div style="display: flex; align-items: center;">
                        ${p.StockQty !== undefined && p.StockQty !== null ? `<div style="font-size: 11px; color: ${stockColor}; font-weight: 500;">Tồn: ${p.StockQty}</div>` : ''}
                        ${heldStatusHtml}
                    </div>
                </td>
                <td style="text-align: center; width: 140px;">
                    <div class="chat-quantity-controls">
                        <button onclick="updateChatProductQuantity(${i}, -1)" class="chat-qty-btn" ${isHeld ? 'disabled style="opacity: 0.5; cursor: not-allowed; background: #f1f5f9; color: #cbd5e1;"' : ''}>
                            <i class="fas fa-minus"></i>
                        </button>
                        <span class="chat-quantity-label" style="
                            width: 32px;
                            height: 24px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 13px;
                            font-weight: 600;
                            border-left: 1px solid #e2e8f0;
                            border-right: 1px solid #e2e8f0;
                            background: ${isHeld ? '#f1f5f9' : '#f8fafc'};
                            color: ${isHeld ? '#94a3b8' : '#1e293b'};
                        ">${p.Quantity || 1}</span>
                        <button onclick="updateChatProductQuantity(${i}, 1)" class="chat-qty-btn" ${isHeld ? 'disabled style="opacity: 0.5; cursor: not-allowed; background: #f1f5f9; color: #cbd5e1;"' : 'disabled style="opacity: 0.5; cursor: not-allowed; background: #f1f5f9; color: #cbd5e1;"'}>
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </td>
                <td style="text-align: right; width: 100px;">${(p.Price || 0).toLocaleString('vi-VN')}đ</td>
                <td style="text-align: right; font-weight: 600; width: 120px;">${((p.Quantity || 0) * (p.Price || 0)).toLocaleString('vi-VN')}đ</td>
                <td style="width: 150px;">
                    <input type="text" class="chat-note-input" value="${p.Note || ''}"
                        onchange="updateChatProductNote(${i}, this.value)" placeholder="Ghi chú...">
                </td>
                <td style="text-align: center; width: 80px;">
                    ${isHeld ? `
                        <button onclick="confirmSingleHeldProduct('${p.ProductId}')" class="chat-btn-product-action" style="
                            background: #10b981;
                            color: white;
                            border: none;
                            padding: 4px 8px;
                            border-radius: 4px;
                            font-size: 11px;
                            font-weight: 600;
                            cursor: pointer;
                            margin-right: 4px;
                        " title="Lưu sản phẩm này vào đơn">
                            <i class="fas fa-check"></i>
                        </button>
                    ` : ''}
                    <button onclick="removeChatProduct(${details.findIndex(d => d.ProductId === p.ProductId)})" class="chat-btn-product-action chat-btn-delete-item" title="Xóa">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `}).join('');

        // Split products AND merge duplicate held products by ProductId
        const heldProductsRaw = details.filter(p => p.IsHeld);
        const heldProductsMap = new Map();

        // Merge held products with same ProductId
        heldProductsRaw.forEach(p => {
            const productId = String(p.ProductId);
            if (heldProductsMap.has(productId)) {
                // Duplicate found - merge by adding quantities
                const existing = heldProductsMap.get(productId);
                existing.Quantity = (existing.Quantity || 0) + (p.Quantity || 0);
                console.log(`[MERGE-HELD] Merged duplicate product ${productId}: ${existing.Quantity - (p.Quantity || 0)} + ${p.Quantity || 0} = ${existing.Quantity}`);
            } else {
                // First occurrence - add to map (clone to avoid mutating original)
                heldProductsMap.set(productId, { ...p });
            }
        });

        const heldProducts = Array.from(heldProductsMap.values());
        const orderProducts = details.filter(p => !p.IsHeld);

        // Update original Details array to remove duplicates (sync back)
        if (heldProductsRaw.length !== heldProducts.length) {
            console.log(`[MERGE-HELD] Removed ${heldProductsRaw.length - heldProducts.length} duplicate held products`);
            window.currentChatOrderData.Details = [...heldProducts, ...orderProducts];
            // BUGFIX: Update local details reference after merging
            details = window.currentChatOrderData.Details;
        }

        let tableContent = '';

        // Section 1: Held Products (if any)
        if (heldProducts.length > 0) {
            tableContent += `
                <tr class="chat-product-section-header" style="background: #fef3c7;">
                    <td colspan="8" style="padding: 8px 12px; font-weight: 600; color: #d97706; font-size: 13px;">
                        <i class="fas fa-hand-holding-box" style="margin-right: 6px;"></i>Sản phẩm đang giữ
                        <button onclick="confirmHeldProducts(true)" class="chat-btn-save-draft" style="
                            background: #f59e0b;
                            color: white;
                            border: none;
                            padding: 4px 12px;
                            border-radius: 4px;
                            font-size: 12px;
                            font-weight: 600;
                            cursor: pointer;
                            display: inline-flex;
                            align-items: center;
                            gap: 4px;
                            margin-left: 12px;
                            float: right;
                        " title="Lưu nháp tất cả sản phẩm đang giữ">
                            <i class="fas fa-save"></i> Lưu nháp
                        </button>
                    </td>
                </tr>
                ${renderRows(heldProducts)}
            `;
        }

        // Section 2: Order Products
        if (orderProducts.length > 0) {
            tableContent += `
                <tr class="chat-product-section-header" style="background: #f1f5f9;">
                    <td colspan="8" style="padding: 8px 12px; font-weight: 600; color: #475569; font-size: 13px;">
                        <i class="fas fa-list-alt" style="margin-right: 6px;"></i>Danh sách sản phẩm của đơn hàng
                    </td>
                </tr>
                ${renderRows(orderProducts)}
            `;
        } else if (heldProducts.length === 0) {
            // Should be handled by empty check at top, but just in case
            tableContent += `<tr><td colspan="8" style="text-align:center; padding: 20px;">Không có sản phẩm</td></tr>`;
        }

        // Calculate totals
        const totalQuantity = details.reduce((sum, p) => sum + (p.Quantity || 0), 0);
        const totalAmount = details.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);

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
                        <th>Ghi chú</th>
                        <th style="text-align: center;">Thao tác</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableContent}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align: right;">Tổng cộng:</td>
                        <td style="text-align: center;">${totalQuantity}</td>
                        <td></td>
                        <td style="text-align: right; color: #3b82f6; font-size: 14px;">${totalAmount.toLocaleString('vi-VN')}đ</td>
                        <td colspan="2"></td>
                    </tr>
                </tfoot>
            </table>
        `;

        // Update counts in header and footer
        updateChatProductCounts();
    }


    /**
     * Save a single held product to order
     * @param {string|number} productId - ProductId of the held product to save
     */
    window.confirmSingleHeldProduct = async function (productId) {
        if (!window.currentChatOrderData || !window.currentChatOrderData.Details) return;

        // Find product by ProductId instead of index (safer for realtime updates)
        const product = window.currentChatOrderData.Details.find(p =>
            String(p.ProductId) === String(productId) && p.IsHeld
        );

        if (!product) {
            console.error('[SINGLE-HELD] Product not found or not held:', productId);
            return;
        }

        // Show confirmation dialog
        const confirmMessage = `Bạn có chắc muốn lưu sản phẩm này vào đơn hàng?\n\n• ${product.ProductNameGet || product.ProductName} (SL: ${product.Quantity})\n\nSản phẩm sẽ được thêm vào đơn hàng và xóa khỏi danh sách đang giữ.`;

        const confirmed = await CustomPopup.confirm(confirmMessage, 'Xác nhận lưu vào đơn');
        if (!confirmed) {
            return;
        }

        // VALIDATION: Check if total held quantity exceeds stock
        if (window.currentHeldStatus && product.StockQty !== undefined && product.StockQty !== null) {
            const holders = window.currentHeldStatus[product.ProductId];
            if (holders) {
                let totalHeld = 0;
                Object.values(holders).forEach(h => {
                    totalHeld += (parseInt(h.quantity) || 0);
                });

                if (totalHeld > product.StockQty) {
                    const msg = `Sản phẩm "${product.ProductNameGet || product.ProductName}" đang được giữ quá số lượng tồn!\n\nTổng đang giữ: ${totalHeld}\nTồn kho: ${product.StockQty}\n\nVui lòng giảm số lượng hoặc thương lượng với người khác.`;
                    await CustomPopup.warning(msg, 'Cảnh báo vượt quá tồn kho');
                    return; // ABORT SAVE
                }
            }
        }

        try {
            // Call confirmHeldProducts with only this product
            // Temporarily filter to only this product
            const allDetails = [...window.currentChatOrderData.Details];

            // Create temporary details with only non-held + this one held product
            window.currentChatOrderData.Details = allDetails.filter(p => !p.IsHeld || String(p.ProductId) === String(productId));

            // Call the main function (will save only this product)
            await confirmHeldProducts(false);

            // Restore all details (confirmHeldProducts already updated it, but add back other held products)
            const savedDetails = [...window.currentChatOrderData.Details];
            const otherHeldProducts = allDetails.filter(p => p.IsHeld && String(p.ProductId) !== String(productId));
            window.currentChatOrderData.Details = [...savedDetails, ...otherHeldProducts];

            // Re-render
            renderChatProductsTable();

        } catch (err) {
            console.error('[SINGLE-HELD] Error saving single held product:', err);
            if (window.notificationManager) {
                window.notificationManager.show('Lỗi khi lưu sản phẩm: ' + err.message, 'error');
            }
        }
    };


    /**
     * Confirm held products (save to order)
     * @param {boolean} isDraft - If true, save to order but keep in Firebase (held status)
     */
    window.confirmHeldProducts = async function (isDraft = false) {
        if (!window.currentChatOrderData || !window.currentChatOrderData.Details) return;

        let hasChanges = false;
        const newDetails = [];
        const heldProducts = [];

        // Separate held and non-held products
        window.currentChatOrderData.Details.forEach(p => {
            if (p.IsHeld) {
                heldProducts.push(p);
            } else {
                newDetails.push(p);
            }
        });

        if (heldProducts.length > 0) {
            // Show confirmation dialog
            const productList = heldProducts.map(p =>
                `• ${p.ProductNameGet || p.ProductName} (SL: ${p.Quantity})`
            ).join('\n');

            const actionText = isDraft ? 'Lưu nháp' : 'Lưu vào đơn';
            const noteText = isDraft
                ? 'Sản phẩm sẽ được đánh dấu là NHÁP và KHÔNG bị xóa khi đóng đơn hàng. Sản phẩm CHƯA được thêm vào đơn hàng.'
                : 'Sản phẩm sẽ được thêm vào đơn hàng và xóa khỏi danh sách đang giữ.';

            const confirmMessage = `Bạn có chắc muốn ${actionText} ${heldProducts.length} sản phẩm?\n\n${productList}\n\n${noteText}`;

            const confirmed = await CustomPopup.confirm(confirmMessage, `Xác nhận ${actionText}`);
            if (!confirmed) {
                return;
            }

            // VALIDATION: Check if total held quantity exceeds stock
            // SKIP validation if saving as draft
            if (!isDraft && window.currentHeldStatus) {
                for (const p of heldProducts) {
                    // Skip check if StockQty is not available (e.g. service product or error)
                    if (p.StockQty === undefined || p.StockQty === null) continue;

                    const holders = window.currentHeldStatus[p.ProductId];
                    if (holders) {
                        let totalHeld = 0;
                        Object.values(holders).forEach(h => {
                            totalHeld += (parseInt(h.quantity) || 0);
                        });

                        if (totalHeld > p.StockQty) {
                            const msg = `Sản phẩm "${p.ProductNameGet || p.ProductName}" đang được giữ quá số lượng tồn!\n\nTổng đang giữ: ${totalHeld}\nTồn kho: ${p.StockQty}\n\nVui lòng giảm số lượng hoặc thương lượng với người khác.`;
                            await CustomPopup.warning(msg, 'Cảnh báo vượt quá tồn kho');
                            return; // ABORT SAVE
                        }
                    }
                }
            }

            if (isDraft) {
                // DRAFT MODE:
                // 1. Do NOT add to newDetails (so they remain held in UI, or rather, we don't save them to API order yet)
                // 2. Update Firebase with isDraft = true

                heldProducts.forEach(heldProduct => {
                    updateHeldStatus(heldProduct.ProductId, true, heldProduct.Quantity, true);
                });

                if (window.notificationManager) {
                    window.notificationManager.show('Đã lưu nháp sản phẩm (sẽ giữ lại khi đóng)', 'success');
                }

                // No need to save order changes or re-render, as we just updated Firebase status.
                // But we might want to visually indicate they are drafts?
                // For now, just keeping them in the list is enough.
                return;
            }

            // NORMAL SAVE MODE:
            hasChanges = true;

            // DUAL TRACKING: Set baseProduct + baseline BEFORE merging held products (ONLY on FIRST action)
            // - baseProduct: IMMUTABLE - from initial snapshot
            // - baseline: HIGH WATER MARK - initially = currentQty before merge

            // Check if this is the FIRST action (no tracking yet)
            const hasAnyTracking = window.originalOrderProductQuantities.size > 0;

            if (!hasAnyTracking && window.initialOrderSnapshot && window.initialOrderSnapshot.size > 0) {
                // FIRST ACTION: Set baseProduct + baseline for products from initial snapshot (BEFORE merge)
                const trackingSnapshot = [];
                window.initialOrderSnapshot.forEach((initialQty, productId) => {
                    // Check if product exists in newDetails (products BEFORE merge, excluding held)
                    const product = newDetails.find(p => String(p.ProductId) === productId);

                    if (product) {
                        const currentQty = product.Quantity || 0;

                        const newEntry = {
                            productId: productId,
                            productName: product.ProductNameGet || product.ProductName || `Product ${productId}`,
                            baseProduct: initialQty,        // IMMUTABLE - from snapshot
                            baseline: currentQty,           // High water mark - initially = currentQty
                            currentQty: currentQty,
                            kpiQty: Math.max(0, currentQty - initialQty)  // KPI from baseProduct
                        };

                        trackingSnapshot.push(newEntry);
                        window.originalOrderProductQuantities.set(productId, newEntry);

                        console.log(`[DUAL-TRACKING] First action before merge: ${productId} baseProduct=${initialQty}, baseline=${currentQty}, KPI=${newEntry.kpiQty}`);
                    } else {
                        console.log(`[DUAL-TRACKING] Product ${productId} from snapshot no longer in order before merge (removed)`);
                    }
                });

                // Save tracking to Firebase BEFORE merging
                if (trackingSnapshot.length > 0) {
                    await updateOrderProductHistory(window.currentChatOrderData.Id, trackingSnapshot);
                    console.log(`[DUAL-TRACKING] Saved ${trackingSnapshot.length} tracking records before merge (first action)`);
                }
            }
            // SUBSEQUENT ACTIONS: baseProduct immutable, baseline follows high water mark

            // IMPORTANT: Capture quantities BEFORE merge for KPI calculation
            const preMergeQuantities = new Map();
            newDetails.forEach(p => {
                if (p.ProductId) {
                    preMergeQuantities.set(p.ProductId, p.Quantity || 0);
                }
            });

            heldProducts.forEach(heldProduct => {
                // Find if exists in non-held (newDetails)
                const existingProduct = newDetails.find(p => p.ProductId === heldProduct.ProductId);

                if (existingProduct) {
                    // Merge quantity
                    existingProduct.Quantity += heldProduct.Quantity;
                } else {
                    // Add as new non-held
                    const productToAdd = { ...heldProduct };
                    productToAdd.IsHeld = false;
                    newDetails.push(productToAdd);
                }

                // Remove from Firebase
                updateHeldStatus(heldProduct.ProductId, false);
            });

            // SAVE STATS TO FIREBASE
            try {
                if (window.firebase && window.authManager) {
                    const auth = window.authManager.getAuthState();
                    let userId = auth.id || auth.Id || auth.username || auth.userType;
                    // Sanitize userId if needed or use displayName as fallback for ID if real ID missing
                    if (!userId && auth.displayName) userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');

                    if (userId) {
                        // Generate unique transaction ID to prevent duplicates
                        const transactionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        const statsRef = firebase.database().ref(`held_product_stats/${userId}/${Date.now()}`);

                        // Generate session ID if not exists (persists during page session)
                        if (!window.kpiSessionId) {
                            window.kpiSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        }

                        // BASE PRODUCT ANCHOR METHOD: Compare with initial base quantity
                        let totalKpiDelta = 0;
                        const productDetails = heldProducts.map(p => {
                            const productId = String(p.ProductId);

                            // Get quantity AFTER merge (from newDetails)
                            const productAfterMerge = newDetails.find(np => np.ProductId === p.ProductId);
                            const newQuantityInOrder = productAfterMerge ? (productAfterMerge.Quantity || 0) : 0;

                            // Get historical tracking data
                            const historical = (window.originalOrderProductQuantities && window.originalOrderProductQuantities.get(productId)) || {
                                baseProduct: 0,
                                baseline: 0,
                                currentQty: 0,
                                kpiQty: 0
                            };

                            const baseProduct = historical.baseProduct || 0;
                            const oldCurrentQty = historical.currentQty || 0;
                            const oldKpiQty = historical.kpiQty || 0;

                            // BASE PRODUCT METHOD: KPI = Max(0, currentQty - baseProduct)
                            // This means:
                            // - Base products (initial quantity) don't count for KPI
                            // - Adding beyond base = +KPI
                            // - Removing below previous qty = -KPI (handled in stats below)
                            const newKpiQty = Math.max(0, newQuantityInOrder - baseProduct);
                            const kpiDelta = newKpiQty - oldKpiQty;

                            console.log(`[BASE-PRODUCT] Product ${productId}: base=${baseProduct}, old=${oldCurrentQty}, new=${newQuantityInOrder}, oldKPI=${oldKpiQty}, newKPI=${newKpiQty}, delta=${kpiDelta}`);

                            totalKpiDelta += kpiDelta;

                            return {
                                name: p.ProductNameGet || p.ProductName || 'Unknown Product',
                                quantity: p.Quantity || 0,
                                newQuantityInOrder: newQuantityInOrder,
                                baseProduct: baseProduct,
                                oldCurrentQty: oldCurrentQty,
                                oldKpiQty: oldKpiQty,
                                newKpiQty: newKpiQty,
                                kpiDelta: kpiDelta,
                                isCounted: kpiDelta > 0,
                                isFromDropped: p.IsFromDropped || false
                            };
                        });

                        statsRef.set({
                            transactionId: transactionId,        // NEW: Unique ID to prevent duplicates
                            action: 'add_from_held',             // NEW: Type of action
                            sessionId: window.kpiSessionId,      // NEW: Session grouping
                            userName: auth.displayName || auth.userType || 'Unknown',
                            productCount: totalKpiDelta,
                            amount: totalKpiDelta * 5000,
                            timestamp: firebase.database.ServerValue.TIMESTAMP,
                            orderId: window.currentChatOrderData.Id || 'unknown',
                            orderSTT: window.currentChatOrderData.SessionIndex || '',
                            products: productDetails
                        });
                        console.log(`[DUAL-TRACKING] Saved KPI stats: +${totalKpiDelta} items (Total held: ${heldProducts.length})`);
                    }
                }
            } catch (err) {
                console.error('[CHAT-PRODUCTS] Error saving held stats:', err);
            }

            // Update dual tracking history for merged products
            const productsToUpdateHistory = [];
            heldProducts.forEach(p => {
                const productId = String(p.ProductId);
                const productInOrder = newDetails.find(np => np.ProductId === p.ProductId);
                const newQuantityInOrder = productInOrder ? (productInOrder.Quantity || 0) : 0;

                // Update both in-memory and prepare for Firebase update
                const existing = window.originalOrderProductQuantities.get(productId);

                if (!existing) {
                    // NEW product: Set baseProduct=0, baseline=newQty (first record)
                    const newEntry = {
                        productName: p.ProductNameGet || p.ProductName || `Product ${productId}`,
                        baseProduct: 0,                 // New product
                        baseline: newQuantityInOrder,   // High water mark = first qty
                        currentQty: newQuantityInOrder,
                        kpiQty: newQuantityInOrder      // All qty counts for KPI (first time)
                    };

                    window.originalOrderProductQuantities.set(productId, newEntry);

                    productsToUpdateHistory.push({
                        productId: productId,
                        ...newEntry
                    });

                    console.log(`[DUAL-TRACKING] Product ${productId}: NEW product, baseProduct=0, baseline=${newQuantityInOrder}, kpiQty=${newQuantityInOrder}`);
                } else {
                    // EXISTING product: baseProduct IMMUTABLE, KPI = Max(0, currentQty - baseProduct)
                    const baseProduct = existing.baseProduct || 0;      // IMMUTABLE
                    const oldCurrentQty = existing.currentQty || 0;

                    // BASE PRODUCT METHOD: Calculate KPI directly from base
                    const newKpiQty = Math.max(0, newQuantityInOrder - baseProduct);

                    const newEntry = {
                        productName: p.ProductNameGet || p.ProductName || existing.productName || `Product ${productId}`,
                        baseProduct: baseProduct,       // UNCHANGED
                        baseline: baseProduct,          // Deprecated, keep for compatibility
                        currentQty: newQuantityInOrder,
                        kpiQty: newKpiQty
                    };

                    window.originalOrderProductQuantities.set(productId, newEntry);

                    productsToUpdateHistory.push({
                        productId: productId,
                        ...newEntry
                    });

                    console.log(`[BASE-PRODUCT] Product ${productId}: baseProduct=${baseProduct}, qty ${oldCurrentQty}→${newQuantityInOrder}, kpiQty=${newKpiQty}`);
                }
            });

            // Save updated dual tracking to Firebase
            if (productsToUpdateHistory.length > 0) {
                await updateOrderProductHistory(window.currentChatOrderData.Id, productsToUpdateHistory);
                console.log('[DUAL-TRACKING] Updated tracking for', productsToUpdateHistory.length, 'products');
            }

            // SAVE ORDER SNAPSHOT for statistics page
            try {
                if (window.firebase && window.authManager) {
                    const auth = window.authManager.getAuthState();
                    let userId = auth.id || auth.Id || auth.username || auth.userType;
                    if (!userId && auth.displayName) userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');

                    if (userId && window.currentChatOrderData.Id) {
                        const snapshotRef = firebase.database().ref(`order_snapshots/${window.currentChatOrderData.Id}`);

                        // Extract invoice ID and OrderLines from chat modal if available
                        let invoiceId = null;
                        let invoiceProducts = [];

                        // Try to get invoice data from chatProductManager cache
                        if (window.chatProductManager && window.chatProductManager.invoiceCache) {
                            // Find the first invoice in cache
                            const invoices = Array.from(window.chatProductManager.invoiceCache.values());
                            if (invoices.length > 0) {
                                const firstInvoice = invoices[0];
                                invoiceId = firstInvoice.Id;

                                // Extract OrderLines with full details
                                if (firstInvoice.OrderLines && firstInvoice.OrderLines.length > 0) {
                                    invoiceProducts = firstInvoice.OrderLines.map(line => ({
                                        productId: line.ProductId,
                                        name: line.Product?.NameGet || line.ProductName || 'Unknown Product',
                                        quantity: line.ProductUOMQty || 0,
                                        price: line.PriceUnit || 0,
                                        total: line.PriceTotal || 0,
                                        note: line.Note || null,
                                        imageUrl: line.ProductImageUrl || line.Product?.ImageUrl || null,
                                        barcode: line.ProductBarcode || line.Product?.DefaultCode || null
                                    }));
                                    console.log('[ORDER-SNAPSHOT] Extracted', invoiceProducts.length, 'products from invoice OrderLines');
                                }
                            }
                        }

                        // Fallback: Try to extract invoice ID from DOM if cache not available
                        if (!invoiceId) {
                            const invoiceContainer = document.getElementById('chatInvoiceHistoryContainer');
                            if (invoiceContainer) {
                                const firstLink = invoiceContainer.querySelector('a[href]');
                                if (firstLink) {
                                    const href = firstLink.getAttribute('href');
                                    const match = href.match(/FastSaleOrder\((\d+)\)/);
                                    if (match) {
                                        invoiceId = match[1];
                                    }
                                }
                            }
                        }

                        // Save complete order snapshot with invoice products
                        await snapshotRef.set({
                            orderId: window.currentChatOrderData.Id,
                            orderSTT: window.currentChatOrderData.SessionIndex || '',
                            products: newDetails.map(p => ({
                                productId: p.ProductId,
                                name: p.ProductNameGet || p.ProductName || 'Unknown Product',
                                quantity: p.Quantity || 0,
                                price: p.Price || 0
                            })),
                            invoiceProducts: invoiceProducts, // NEW: Products from invoice OrderLines
                            userId: userId,
                            userName: auth.displayName || auth.userType || 'Unknown',
                            lastUpdated: firebase.database.ServerValue.TIMESTAMP,
                            invoiceId: invoiceId
                        });

                        console.log('[ORDER-SNAPSHOT] Saved snapshot for order:', window.currentChatOrderData.Id, 'Invoice ID:', invoiceId, 'Invoice Products:', invoiceProducts.length);
                    }
                }
            } catch (err) {
                console.error('[ORDER-SNAPSHOT] Error saving order snapshot:', err);
            }

            // Update Details array
            window.currentChatOrderData.Details = newDetails;
        }

        if (hasChanges) {
            renderChatProductsTable();
            await saveChatOrderChanges();

            if (window.notificationManager) {
                window.notificationManager.show('Đã lưu sản phẩm vào đơn hàng', 'success');
            }
        }
    };

    /**
     * Cleanup held products (move back to dropped)
     * Called when closing modal without saving
     */
    window.cleanupHeldProducts = async function () {
        if (!window.currentChatOrderData || !window.currentChatOrderData.Details) return;

        const heldProducts = window.currentChatOrderData.Details.filter(p => p.IsHeld);

        if (heldProducts.length === 0) return;

        console.log('[CHAT-PRODUCTS] Cleaning up held products:', heldProducts.length);

        // Move to dropped products
        if (typeof window.addToDroppedProducts === 'function') {
            for (const p of heldProducts) {
                // CHECK DRAFT STATUS
                let isDraft = false;
                if (window.currentHeldStatus && window.currentHeldStatus[p.ProductId]) {
                    const holders = window.currentHeldStatus[p.ProductId];
                    // Check if CURRENT user has it marked as draft
                    // We need current user ID logic again here, or just check all holders?
                    // Ideally check if *I* am holding it as draft.
                    // But for simplicity, if ANYONE holds it as draft, we shouldn't delete?
                    // No, only if *I* hold it.
                    // Re-using auth logic from updateHeldStatus is hard here without duplicating.
                    // Let's assume if it's in the list, I am holding it.
                    // We need to check the Firebase data for MY entry.

                    if (window.authManager) {
                        const auth = window.authManager.getAuthState();
                        let userId = auth.id || auth.Id || auth.username || auth.userType;
                        if (!userId && auth.displayName) userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');

                        if (userId && holders[userId] && holders[userId].isDraft) {
                            isDraft = true;
                        }
                    }
                }

                if (isDraft) {
                    console.log(`[CHAT-PRODUCTS] Product ${p.ProductId} is DRAFT. Skipping removal.`);
                    continue;
                }

                await window.addToDroppedProducts(p, p.Quantity, 'unsaved_exit');
                // Remove from Firebase
                updateHeldStatus(p.ProductId, false);
            }
        }

        // Remove from order (local only, as they are not saved to DB yet)
        // Note: We remove ALL held products from the local order object because we are closing the modal.
        // Even drafts shouldn't remain in the "Order Details" array if we are closing,
        // because next time we open, we fetch them again from Firebase.
        window.currentChatOrderData.Details = window.currentChatOrderData.Details.filter(p => !p.IsHeld);

        // Save order (to remove them from backend if they were somehow saved? No, held products are not saved to backend order)
        // Actually, held products are ONLY in local Details and Firebase. They are NOT in the API order until "Save to Order".
        // So we don't need to saveChatOrderChanges() here unless we want to ensure they are gone from some other state?
        // The original code called saveChatOrderChanges(), maybe to sync the removal of IsHeld items if they were accidentally saved?
        // Or maybe just to be safe.
        // If we don't save, it's fine.
        await saveChatOrderChanges();
    };


    /**
     * Update product counts in UI
     */
    function updateChatProductCounts() {
        const details = window.currentChatOrderData?.Details || [];
        const totalQuantity = details.reduce((sum, p) => sum + (p.Quantity || 0), 0);
        const totalAmount = details.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);

        // Update orders tab badge
        const ordersBadge = document.getElementById('chatOrdersCountBadge');
        if (ordersBadge) {
            ordersBadge.textContent = totalQuantity;
        }

        // Update footer total
        const footerTotal = document.getElementById('chatProductTotal');
        if (footerTotal) {
            footerTotal.textContent = `${totalAmount.toLocaleString('vi-VN')}đ`;
        }

        // Update product count in footer
        const productCount = document.getElementById('productCount');
        if (productCount) {
            productCount.textContent = totalQuantity;
        }
    }

    console.log('[CHAT-PRODUCTS] Chat modal products manager loaded');

})();
