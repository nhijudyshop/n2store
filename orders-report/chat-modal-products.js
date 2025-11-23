/**
 * Chat Modal Products Manager
 * Handles product search, add, edit, remove functionality in the chat modal
 */

(function () {
    'use strict';

    // Global state for current chat order
    window.currentChatOrderData = null;
    let chatInlineSearchTimeout = null;

    // Pending confirm action state
    let pendingConfirmAction = null;

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

        // Render products table
        renderChatProductsTable();

        // Initialize search
        initChatInlineProductSearch();

        // Update counts
        updateChatProductCounts();
    };

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
            const results = await window.productSearchManager.searchProducts(query);
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
            const fullProduct = await window.productSearchManager.getFullProductDetails(productId);

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

            // Check if product already exists
            const existingIndex = window.currentChatOrderData.Details.findIndex(
                p => p.ProductId == productId
            );

            if (existingIndex > -1) {
                // Increase quantity
                updateChatProductQuantity(existingIndex, 1);

                if (window.notificationManager) {
                    window.notificationManager.show(
                        `Đã tăng số lượng sản phẩm`,
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
                    ImageUrl: fullProduct.ImageUrl
                };

                window.currentChatOrderData.Details.push(newProduct);

                // Render table
                renderChatProductsTable();

                if (window.notificationManager) {
                    window.notificationManager.show(
                        `Đã thêm ${newProduct.ProductNameGet}`,
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
                alert(`Lỗi: ${error.message}`);
            }
        }
    };

    /**
     * Update product quantity in chat order
     */
    window.updateChatProductQuantity = function (index, change, value = null) {
        const product = window.currentChatOrderData.Details[index];
        const oldQty = product.Quantity || 0;
        let newQty = value !== null ? parseInt(value, 10) : oldQty + change;

        if (newQty < 1) newQty = 1;

        // If quantity is being reduced, show confirm modal
        if (newQty < oldQty) {
            const reducedQty = oldQty - newQty;
            showProductConfirmModal({
                type: 'reduce',
                index: index,
                product: product,
                oldQty: oldQty,
                newQty: newQty,
                reducedQty: reducedQty
            });
            return;
        }

        // If increasing, just update directly
        product.Quantity = newQty;

        // Re-render table
        renderChatProductsTable();

        if (window.notificationManager) {
            window.notificationManager.show('Đã cập nhật số lượng', 'success');
        }
    };

    /**
     * Update product note in chat order
     */
    window.updateChatProductNote = function (index, note) {
        const product = window.currentChatOrderData.Details[index];
        product.Note = note;

        if (window.notificationManager) {
            window.notificationManager.show('Đã cập nhật ghi chú', 'success');
        }
    };

    /**
     * Remove product from chat order
     */
    window.removeChatProduct = function (index) {
        const product = window.currentChatOrderData.Details[index];

        showProductConfirmModal({
            type: 'remove',
            index: index,
            product: product,
            quantity: product.Quantity || 1
        });
    };

    /**
     * Show product confirm modal
     */
    function showProductConfirmModal(action) {
        pendingConfirmAction = action;

        const modal = document.getElementById('productConfirmModal');
        const icon = document.getElementById('productConfirmIcon');
        const title = document.getElementById('productConfirmTitle');
        const message = document.getElementById('productConfirmMessage');
        const details = document.getElementById('productConfirmDetails');
        const confirmBtn = document.getElementById('productConfirmBtn');

        if (!modal) return;

        const product = action.product;
        const productImage = product.ImageUrl
            ? `<img src="${product.ImageUrl}" class="product-img">`
            : `<div class="product-img-placeholder"><i class="fas fa-box"></i></div>`;

        if (action.type === 'remove') {
            // Remove product
            icon.className = 'product-confirm-icon danger';
            icon.innerHTML = '<i class="fas fa-trash-alt"></i>';
            title.textContent = 'Xóa sản phẩm';
            message.textContent = 'Sản phẩm sẽ được chuyển vào tab "Hàng rớt - xả"';
            confirmBtn.className = 'product-confirm-btn confirm';
            confirmBtn.innerHTML = '<i class="fas fa-trash"></i> Xóa sản phẩm';

            details.innerHTML = `
                ${productImage}
                <div class="product-info">
                    <div class="product-name">${product.ProductNameGet || product.ProductName}</div>
                    <div class="product-meta">Mã: ${product.ProductCode || 'N/A'} • ${(product.Price || 0).toLocaleString('vi-VN')}đ</div>
                </div>
                <div class="product-qty">
                    <div class="qty-change remove">
                        <span class="old">${action.quantity}</span>
                        <span class="arrow">→</span>
                        <span class="new">Xóa</span>
                    </div>
                </div>
            `;
        } else if (action.type === 'reduce') {
            // Reduce quantity
            icon.className = 'product-confirm-icon warning';
            icon.innerHTML = '<i class="fas fa-minus-circle"></i>';
            title.textContent = 'Giảm số lượng';
            message.textContent = `Giảm ${action.reducedQty} sản phẩm và chuyển vào "Hàng rớt - xả"`;
            confirmBtn.className = 'product-confirm-btn confirm warning';
            confirmBtn.innerHTML = '<i class="fas fa-check"></i> Xác nhận giảm';

            details.innerHTML = `
                ${productImage}
                <div class="product-info">
                    <div class="product-name">${product.ProductNameGet || product.ProductName}</div>
                    <div class="product-meta">Mã: ${product.ProductCode || 'N/A'} • ${(product.Price || 0).toLocaleString('vi-VN')}đ</div>
                </div>
                <div class="product-qty">
                    <div class="qty-change">
                        <span class="old">${action.oldQty}</span>
                        <span class="arrow">→</span>
                        <span class="new">${action.newQty}</span>
                    </div>
                </div>
            `;
        }

        modal.classList.add('show');
    }

    /**
     * Close product confirm modal
     */
    window.closeProductConfirmModal = function () {
        const modal = document.getElementById('productConfirmModal');
        if (modal) {
            modal.classList.remove('show');
        }
        pendingConfirmAction = null;
    };

    /**
     * Execute the pending confirm action
     */
    window.executeProductConfirm = function () {
        if (!pendingConfirmAction) return;

        const action = pendingConfirmAction;
        closeProductConfirmModal();

        if (action.type === 'remove') {
            // Add to dropped products before removing
            if (typeof window.addToDroppedProducts === 'function') {
                window.addToDroppedProducts(action.product, action.quantity, 'removed');
            }

            window.currentChatOrderData.Details.splice(action.index, 1);

            // Re-render table
            renderChatProductsTable();

            if (window.notificationManager) {
                window.notificationManager.show('Đã xóa sản phẩm (chuyển vào hàng rớt - xả)', 'success');
            }
        } else if (action.type === 'reduce') {
            // Add reduced quantity to dropped products
            if (typeof window.addToDroppedProducts === 'function') {
                window.addToDroppedProducts(action.product, action.reducedQty, 'reduced');
            }

            // Update the quantity
            action.product.Quantity = action.newQty;

            // Re-render table
            renderChatProductsTable();

            if (window.notificationManager) {
                window.notificationManager.show('Đã giảm số lượng (chuyển vào hàng rớt - xả)', 'success');
            }
        }
    };

    /**
     * Render products table in chat modal
     */
    function renderChatProductsTable() {
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

        const productsHTML = details.map((p, i) => `
            <tr class="chat-product-row" data-index="${i}">
                <td style="width: 30px;">${i + 1}</td>
                <td style="width: 60px;">
                    ${p.ImageUrl ? `<img src="${p.ImageUrl}" class="chat-product-image">` : '<div class="chat-product-image" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center;"><i class="fas fa-box" style="color: white; font-size: 18px;"></i></div>'}
                </td>
                <td>
                    <div style="font-weight: 600; margin-bottom: 2px;">${p.ProductNameGet || p.ProductName}</div>
                    <div style="font-size: 11px; color: #6b7280;">Mã: ${p.ProductCode || 'N/A'}</div>
                </td>
                <td style="text-align: center; width: 140px;">
                    <div class="chat-quantity-controls">
                        <button onclick="updateChatProductQuantity(${i}, -1)" class="chat-qty-btn">
                            <i class="fas fa-minus"></i>
                        </button>
                        <input type="number" class="chat-quantity-input" value="${p.Quantity || 1}"
                            onchange="updateChatProductQuantity(${i}, 0, this.value)" min="1">
                        <button onclick="updateChatProductQuantity(${i}, 1)" class="chat-qty-btn">
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
        `).join('');

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
                    ${productsHTML}
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
