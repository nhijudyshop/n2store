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
        injectStyles: function() {
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
        createPopup: function(config) {
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
        show: function(config) {
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
        alert: function(message, title = 'Thông báo', type = 'alert') {
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
        confirm: function(message, title = 'Xác nhận') {
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
        prompt: function(message, title = 'Nhập thông tin', placeholder = '', defaultValue = '') {
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
        error: function(message, title = 'Lỗi') {
            return this.alert(message, title, 'error');
        },

        /**
         * Show success popup
         */
        success: function(message, title = 'Thành công') {
            return this.alert(message, title, 'success');
        },

        /**
         * Show warning popup
         */
        warning: function(message, title = 'Cảnh báo') {
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
     * Initialize chat modal products when modal is opened
     */
    window.initChatModalProducts = function (orderData) {
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

        // Update counts
        updateChatProductCounts();
    };

    /**
     * Listen to realtime held status
     */
    function listenToHeldStatus(orderId) {
        if (!orderId || !window.firebase) return;

        const ref = firebase.database().ref(`held_products/${orderId}`);
        ref.on('value', (snapshot) => {
            window.currentHeldStatus = snapshot.val() || {};
            renderChatProductsTable();
        });
    }

    /**
     * Update held status in Firebase
     */
    function updateHeldStatus(productId, isHeld, quantity = 1) {
        console.log('[HELD-DEBUG] updateHeldStatus called:', { productId, isHeld, quantity });

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
                timestamp: firebase.database.ServerValue.TIMESTAMP
            }).catch(err => console.error('[HELD-DEBUG] Firebase set error:', err));
        } else {
            console.log('[HELD-DEBUG] Removing held status from Firebase');
            ref.remove().catch(err => console.error('[HELD-DEBUG] Firebase remove error:', err));
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

            // Close loading
            if (window.notificationManager && notificationId) {
                window.notificationManager.remove(notificationId);
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
                // Increase quantity of HELD product
                updateChatProductQuantity(existingIndex, 1);
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

                // Render table
                renderChatProductsTable();

                // Save changes
                // await saveChatOrderChanges();

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
        if (newQty < oldQty && typeof window.addToDroppedProducts === 'function') {
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

        // Add to dropped products ONLY if it came from dropped list
        if (product.IsFromDropped && typeof window.addToDroppedProducts === 'function') {
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
     */
    function prepareChatOrderPayload(orderData) {
        // Clone data
        const payload = JSON.parse(JSON.stringify(orderData));

        // Add context
        if (!payload["@odata.context"]) {
            payload["@odata.context"] = "http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity";
        }

        // Clean top-level properties (remove navigation properties to avoid 400 Bad Request)
        delete payload.Partner;
        delete payload.User;
        delete payload.CRMTeam;
        delete payload.DeliveryInfo;
        delete payload.ExtraAddress;
        delete payload.Facebook_Configs;

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
                delete cleaned.ProductNameGet;
                delete cleaned.UOMName;
                delete cleaned.ImageUrl;
                delete cleaned.ProductCode; // Usually read-only or not needed if ProductId is set
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

        const details = window.currentChatOrderData?.Details || [];

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
            // console.log('[HELD-DEBUG] Checking held status for product:', p.ProductId, window.currentHeldStatus);
            if (window.currentHeldStatus && window.currentHeldStatus[p.ProductId]) {
                const holders = window.currentHeldStatus[p.ProductId];
                // Convert object to array of display names and calculate total held
                const names = [];
                let totalHeld = 0;

                Object.values(holders).forEach(h => {
                    names.push(h.displayName);
                    totalHeld += (parseInt(h.quantity) || 0);
                });

                // console.log('[HELD-DEBUG] Holders found:', names, 'Total held:', totalHeld);

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
                    <button onclick="removeChatProduct(${i})" class="chat-btn-product-action chat-btn-delete-item" title="Xóa">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `}).join('');

        // Split products
        const heldProducts = details.filter(p => p.IsHeld);
        const orderProducts = details.filter(p => !p.IsHeld);

        let tableContent = '';

        // Section 1: Held Products (if any)
        if (heldProducts.length > 0) {
            tableContent += `
                <tr class="chat-product-section-header" style="background: #fef3c7;">
                    <td colspan="6" style="padding: 8px 12px; font-weight: 600; color: #d97706; font-size: 13px;">
                        <i class="fas fa-hand-holding-box" style="margin-right: 6px;"></i>Sản phẩm đang giữ
                    </td>
                    <td colspan="2" style="text-align: right; padding: 4px 8px;">
                        <button onclick="confirmHeldProducts()" class="chat-btn-save-held" style="
                            background: #d97706;
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
                        ">
                            <i class="fas fa-check"></i> Lưu vào đơn
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
     * Confirm held products (save to order)
     */
    window.confirmHeldProducts = async function () {
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
            // VALIDATION: Check if total held quantity exceeds stock
            if (window.currentHeldStatus) {
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

            hasChanges = true;

            heldProducts.forEach(heldProduct => {
                // Find if exists in non-held (newDetails)
                const existingProduct = newDetails.find(p => p.ProductId === heldProduct.ProductId);

                if (existingProduct) {
                    // Merge quantity
                    existingProduct.Quantity += heldProduct.Quantity;
                } else {
                    // Add as new non-held
                    heldProduct.IsHeld = false;
                    newDetails.push(heldProduct);
                }

                // Remove from Firebase (since it's now saved/merged)
                updateHeldStatus(heldProduct.ProductId, false);
            });

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
                await window.addToDroppedProducts(p, p.Quantity, 'unsaved_exit');
                // Remove from Firebase
                updateHeldStatus(p.ProductId, false);
            }
        }

        // Remove from order
        window.currentChatOrderData.Details = window.currentChatOrderData.Details.filter(p => !p.IsHeld);

        // Save order (to remove them from backend)
        // Note: This might be called during close, so we need to ensure it runs
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
