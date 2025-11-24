class ChatProductManager {
    constructor() {
        this.orderId = null;
        this.products = [];
        this.firebaseRef = null;
        this.historyRef = null;
        this.isListening = false;
        this.searchResults = [];
        this.productHistory = [];
        this.invoiceCache = new Map(); // Cache for invoice details with OrderLines
        this.invoiceCacheTimestamp = null; // Timestamp for cache expiration
    }

    async init(orderId) {
        if (!orderId) {
            console.error('[CHAT-PRODUCT] No orderId provided');
            return;
        }

        this.orderId = orderId;
        this.products = [];
        this.searchResults = [];
        this.productHistory = [];

        // Initialize Firebase reference
        // Path: chat_products/shared (Global List)
        // History Path: chat_products_history/shared (Global History)
        if (firebase && firebase.database) {
            this.firebaseRef = firebase.database().ref(`chat_products/shared`);
            this.historyRef = firebase.database().ref(`chat_products_history/shared`);
            this.startListening();
            this.startHistoryListening();
        } else {
            console.error('[CHAT-PRODUCT] Firebase not initialized');
        }

        // Load Excel products for suggestions
        if (window.enhancedProductSearchManager) {
            try {
                await window.enhancedProductSearchManager.fetchExcelProducts();
                console.log('[CHAT-PRODUCT] Excel products loaded for suggestions');
            } catch (error) {
                console.error('[CHAT-PRODUCT] Error loading Excel products:', error);
            }
        }

        this.renderTable();
        this.setupEventListeners();
    }

    cleanup() {
        if (this.firebaseRef && this.isListening) {
            this.firebaseRef.off();
            this.isListening = false;
        }
        if (this.historyRef) {
            this.historyRef.off();
        }
        this.orderId = null;
        this.products = [];
        this.searchResults = [];
        this.productHistory = [];

        // Clear search input
        const searchInput = document.getElementById('chatInlineProductSearch');
        if (searchInput) searchInput.value = '';

        // Hide suggestions
        const suggestions = document.getElementById('chatInlineSearchResults');
        if (suggestions) suggestions.style.display = 'none';
    }

    startHistoryListening() {
        if (!this.historyRef) return;

        console.log(`[CHAT-PRODUCT-HISTORY] Listening for changes on chat_products_history/shared`);

        // Note: To optimize Firebase query performance, add this to your Firebase Rules:
        // "chat_products_history": {
        //   "shared": {
        //     ".indexOn": ["timestamp"]
        //   }
        // }
        this.historyRef.orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                this.productHistory = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                })).sort((a, b) => b.timestamp - a.timestamp);

                // Auto-delete entries older than 30 days
                this.cleanupOldHistory();
            } else {
                this.productHistory = [];
            }
            this.renderHistory();
        }, (error) => {
            console.error('[CHAT-PRODUCT-HISTORY] Firebase listener error:', error);
        });
    }

    async cleanupOldHistory() {
        if (!this.historyRef) return;

        try {
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            const snapshot = await this.historyRef.orderByChild('timestamp').endAt(thirtyDaysAgo).once('value');

            if (snapshot.exists()) {
                const updates = {};
                snapshot.forEach(child => {
                    updates[child.key] = null; // Mark for deletion
                });

                if (Object.keys(updates).length > 0) {
                    await this.historyRef.update(updates);
                    console.log(`[CHAT-PRODUCT-HISTORY] Cleaned up ${Object.keys(updates).length} old entries`);
                }
            }
        } catch (error) {
            console.error('[CHAT-PRODUCT-HISTORY] Error cleaning up old history:', error);
        }
    }

    async removeHistoryEntry(entryId) {
        if (!this.historyRef) return;

        try {
            await this.historyRef.child(entryId).remove();
            console.log('[CHAT-PRODUCT-HISTORY] Removed entry:', entryId);
        } catch (error) {
            console.error('[CHAT-PRODUCT-HISTORY] Error removing entry:', error);
        }
    }

    async clearHistory() {
        if (!confirm('Bạn có chắc muốn xóa toàn bộ lịch sử? Hành động này không thể hoàn tác.')) {
            return;
        }

        try {
            await this.historyRef.remove();

            if (window.notificationManager) {
                window.notificationManager.show('✅ Đã xóa toàn bộ lịch sử', 'success');
            } else {
                alert('✅ Đã xóa toàn bộ lịch sử');
            }

            console.log('[CHAT-PRODUCT-HISTORY] History cleared by admin');
        } catch (error) {
            console.error('[CHAT-PRODUCT-HISTORY] Error clearing history:', error);
            if (window.notificationManager) {
                window.notificationManager.show('❌ Lỗi khi xóa lịch sử: ' + error.message, 'error');
            } else {
                alert('❌ Lỗi khi xóa lịch sử: ' + error.message);
            }
        }
    }

    async logHistory(action, productName, details = {}) {
        if (!this.historyRef) return;

        try {
            // Remove undefined values from details to avoid Firebase errors
            const cleanDetails = {};
            Object.keys(details).forEach(key => {
                if (details[key] !== undefined) {
                    cleanDetails[key] = details[key];
                }
            });

            const historyEntry = {
                action: action, // 'add', 'remove', 'update_quantity'
                productName: productName,
                details: cleanDetails,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                user: 'Current User' // You can get from auth if available
            };

            await this.historyRef.push(historyEntry);
        } catch (error) {
            console.error('[CHAT-PRODUCT-HISTORY] Error logging history:', error);
        }
    }

    startListening() {
        if (!this.firebaseRef) return;

        console.log(`[CHAT-PRODUCT] Listening for changes on chat_products/${this.orderId}`);
        this.isListening = true;

        this.firebaseRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // Convert object to array if needed, or just use values
                // Assuming data is stored as { productId: { ...productData } }
                this.products = Object.values(data);
            } else {
                this.products = [];
            }
            this.renderTable();
        }, (error) => {
            console.error('[CHAT-PRODUCT] Firebase listener error:', error);
        });
    }

    async addProduct(product) {
        if (!this.firebaseRef) return;

        try {
            // Check if product already exists
            const existingProduct = this.products.find(p => p.Id === product.Id);

            if (existingProduct) {
                // Update quantity
                const newQuantity = (existingProduct.Quantity || 1) + 1;
                await this.firebaseRef.child(String(product.Id)).update({
                    Quantity: newQuantity
                });

                // Log history
                await this.logHistory('update_quantity', product.Name, {
                    productId: product.Id,
                    oldQuantity: existingProduct.Quantity || 1,
                    newQuantity: newQuantity
                });

                if (window.notificationManager) {
                    window.notificationManager.show(`Đã tăng số lượng: ${product.Name}`, 'success');
                }
            } else {
                // Load product details with real image from API
                let productData = { ...product };

                // Try to load full product details including image
                if (product.Id && window.tokenManager) {
                    try {
                        const token = await window.tokenManager.getToken();
                        const response = await fetch(
                            `${API_CONFIG.WORKER_URL}/api/odata/Product(${product.Id})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues`,
                            {
                                headers: {
                                    'Authorization': `Bearer ${token}`
                                }
                            }
                        );

                        if (response.ok) {
                            const fullProductData = await response.json();
                            productData.ImageUrl = fullProductData.ImageUrl;
                            productData.Name = fullProductData.NameGet || productData.Name;
                            productData.Code = fullProductData.DefaultCode || fullProductData.Barcode || productData.Code;

                            // Load template for image if product doesn't have one
                            if (!productData.ImageUrl && fullProductData.ProductTmplId) {
                                try {
                                    const templateResponse = await fetch(
                                        `${API_CONFIG.WORKER_URL}/api/odata/ProductTemplate(${fullProductData.ProductTmplId})?$expand=Images`,
                                        {
                                            headers: {
                                                'Authorization': `Bearer ${token}`
                                            }
                                        }
                                    );

                                    if (templateResponse.ok) {
                                        const templateData = await templateResponse.json();
                                        productData.ImageUrl = templateData.ImageUrl;
                                    }
                                } catch (error) {
                                    console.error('[CHAT-PRODUCT] Error loading template:', error);
                                }
                            }
                        }
                    } catch (error) {
                        console.error('[CHAT-PRODUCT] Error loading product details:', error);
                        // Continue with basic product data
                    }
                }

                // Add new product
                const newProduct = {
                    Id: productData.Id,
                    Code: productData.Code || '',
                    Name: productData.Name || '',
                    Price: productData.Price || 0,
                    Quantity: 1,
                    ImageUrl: productData.ImageUrl || '',
                    AddedAt: firebase.database.ServerValue.TIMESTAMP
                };

                await this.firebaseRef.child(String(productData.Id)).set(newProduct);

                // Log history
                await this.logHistory('add', productData.Name, {
                    productId: productData.Id,
                    quantity: 1,
                    price: productData.Price
                });

                if (window.notificationManager) {
                    window.notificationManager.show(`Đã thêm: ${productData.Name}`, 'success');
                }
            }
        } catch (error) {
            console.error('[CHAT-PRODUCT] Error adding product:', error);
            alert('Lỗi khi thêm sản phẩm: ' + error.message);
        }
    }

    async removeProduct(productId) {
        if (!this.firebaseRef) return;

        try {
            const product = this.products.find(p => p.Id === productId);
            await this.firebaseRef.child(String(productId)).remove();

            // Log history
            if (product) {
                await this.logHistory('remove', product.Name, {
                    productId: productId,
                    quantity: product.Quantity,
                    price: product.Price
                });
            }

            if (window.notificationManager) {
                window.notificationManager.show('Đã xóa sản phẩm', 'success');
            }
        } catch (error) {
            console.error('[CHAT-PRODUCT] Error removing product:', error);
            alert('Lỗi khi xóa sản phẩm: ' + error.message);
        }
    }

    async updateQuantity(productId, newQuantity) {
        if (!this.firebaseRef) return;

        if (newQuantity <= 0) {
            this.removeProduct(productId);
            return;
        }

        try {
            const product = this.products.find(p => p.Id === productId);
            const oldQuantity = product ? product.Quantity : 0;

            await this.firebaseRef.child(String(productId)).update({
                Quantity: newQuantity
            });

            // Log history
            if (product) {
                await this.logHistory('update_quantity', product.Name, {
                    productId: productId,
                    oldQuantity: oldQuantity,
                    newQuantity: newQuantity
                });
            }
        } catch (error) {
            console.error('[CHAT-PRODUCT] Error updating quantity:', error);
        }
    }

    handleSearch(query) {
        const suggestionsEl = document.getElementById('chatProductSearchResults');
        if (!query || query.trim().length < 2) {
            suggestionsEl.style.display = 'none';
            return;
        }

        if (window.enhancedProductSearchManager) {
            this.searchResults = window.enhancedProductSearchManager.search(query, 10);
            this.renderSuggestions();
        }
    }

    renderSuggestions() {
        const suggestionsEl = document.getElementById('chatProductSearchResults');
        if (!suggestionsEl) return;

        if (this.searchResults.length === 0) {
            suggestionsEl.innerHTML = `
                <div style="padding: 16px; text-align: center; color: #9ca3af;">
                    <i class="fas fa-search" style="font-size: 20px; opacity: 0.5; margin-bottom: 8px;"></i>
                    <p style="margin: 0; font-size: 13px;">Không tìm thấy sản phẩm</p>
                </div>
            `;
            suggestionsEl.style.display = 'block';
            return;
        }

        suggestionsEl.innerHTML = this.searchResults.map(product => {
            const imageUrl = product.ImageUrl || (product.Thumbnails && product.Thumbnails[0]);
            return `
                <div class="suggestion-item" onclick="window.chatProductManager.selectProduct(${product.Id})" style="
                    display: flex; align-items: center; gap: 12px; padding: 10px 14px; cursor: pointer; transition: background 0.2s; border-bottom: 1px solid #f3f4f6;
                " onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
                    <div style="width: 40px; height: 40px; border-radius: 8px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden;">
                        ${imageUrl
                    ? `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                               <i class="fas fa-box" style="color: #9ca3af; display: none;"></i>`
                    : `<i class="fas fa-box" style="color: #9ca3af;"></i>`
                }
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 14px; font-weight: 500; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${product.Name}</div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                            ${product.Code ? `<span style="font-size: 11px; color: #6b7280; background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${product.Code}</span>` : ''}
                            <span style="font-size: 12px; font-weight: 600; color: #8b5cf6;">${(product.Price || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                    </div>
                    <i class="fas fa-plus-circle" style="color: #8b5cf6; font-size: 18px;"></i>
                </div>
            `;
        }).join('');

        suggestionsEl.style.display = 'block';
    }

    selectProduct(productId) {
        const product = this.searchResults.find(p => p.Id === productId);
        if (product) {
            this.addProduct(product);

            // Clear search
            const searchInput = document.getElementById('chatInlineProductSearch');
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            document.getElementById('chatInlineSearchResults').style.display = 'none';
        }
    }

    // Add product directly from external search (e.g., tab1-orders.js)
    async addProductFromSearch(productId) {
        try {
            // Get product details from productSearchManager
            if (!window.productSearchManager) {
                console.error('[CHAT-PRODUCT] productSearchManager not available');
                return;
            }

            const product = await window.productSearchManager.getFullProductDetails(productId);
            if (!product) {
                console.error('[CHAT-PRODUCT] Product not found:', productId);
                return;
            }

            // Add to Firebase
            await this.addProduct(product);

            // Clear search and hide dropdown
            const searchInput = document.getElementById('chatProductSearchInput');
            if (searchInput) {
                searchInput.value = '';
            }
            const suggestions = document.getElementById('chatProductSearchResults');
            if (suggestions) {
                suggestions.style.display = 'none';
            }
        } catch (error) {
            console.error('[CHAT-PRODUCT] Error adding product from search:', error);
            if (window.notificationManager) {
                window.notificationManager.show('❌ Lỗi khi thêm sản phẩm', 'error');
            }
        }
    }

    renderTable() {
        const tbody = document.getElementById('chatProductTableBody');
        const totalEl = document.getElementById('chatProductTotal');
        const totalFooterEl = document.getElementById('chatProductTotalFooter');
        const productCountEl = document.getElementById('productCount');

        if (!tbody) return;

        if (this.products.length === 0) {
            tbody.innerHTML = `
                <div class="empty-products-state" style="
                    text-align: center;
                    padding: 60px 20px;
                    color: #9ca3af;
                ">
                    <i class="fas fa-shopping-cart" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
                    <p style="font-size: 15px; font-weight: 500; margin: 0;">Chưa có sản phẩm nào</p>
                    <p style="font-size: 13px; margin: 8px 0 0 0;">Thêm sản phẩm vào giỏ hàng</p>
                </div>
            `;
            if (totalEl) totalEl.textContent = '0đ';
            if (totalFooterEl) totalFooterEl.textContent = '0đ';
            if (productCountEl) productCountEl.textContent = '0';
            return;
        }

        let totalPrice = 0;

        // Sort products by AddedAt timestamp (newest first)
        const sortedProducts = [...this.products].sort((a, b) => {
            const timeA = a.AddedAt || 0;
            const timeB = b.AddedAt || 0;
            return timeB - timeA; // Descending order (newest first)
        });

        tbody.innerHTML = sortedProducts.map(product => {
            const lineTotal = (product.Price || 0) * (product.Quantity || 1);
            totalPrice += lineTotal;

            return `
                <div class="product-card">
                    <div class="product-card-content">
                        <div class="product-image">
                            ${product.ImageUrl
                    ? `<img src="${product.ImageUrl}" alt="${product.Name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                   <i class="fas fa-box" style="display: none;"></i>`
                    : `<i class="fas fa-box"></i>`
                }
                        </div>
                        <div class="product-details">
                            <div class="product-name" title="${product.Name}">${product.Name}</div>
                            ${product.Code ? `<div style="font-size: 11px; color: #9ca3af; margin-bottom: 8px;">${product.Code}</div>` : ''}
                            <div class="product-meta">
                                <div class="product-quantity">
                                    <button class="btn-qty-adjust" onclick="window.chatProductManager.updateQuantity(${product.Id}, ${(product.Quantity || 1) - 1})"
                                        style="background: none; border: none; cursor: pointer; color: #6b7280; padding: 0 4px; font-size: 14px; font-weight: bold;">
                                        -
                                    </button>
                                    <span style="min-width: 20px; text-align: center;">${product.Quantity || 1}</span>
                                    <button class="btn-qty-adjust" onclick="window.chatProductManager.updateQuantity(${product.Id}, ${(product.Quantity || 1) + 1})"
                                        style="background: none; border: none; cursor: pointer; color: #6b7280; padding: 0 4px; font-size: 14px; font-weight: bold;">
                                        +
                                    </button>
                                </div>
                                <div class="product-price">${lineTotal.toLocaleString('vi-VN')}đ</div>
                            </div>
                            <div class="product-actions">
                                <button class="product-action-btn" onclick="window.chatProductManager.updateQuantity(${product.Id}, ${(product.Quantity || 1) - 1})">
                                    <i class="fas fa-minus"></i> Giảm
                                </button>
                                <button class="product-action-btn" onclick="window.chatProductManager.updateQuantity(${product.Id}, ${(product.Quantity || 1) + 1})">
                                    <i class="fas fa-plus"></i> Thêm
                                </button>
                                <button class="product-action-btn delete" onclick="window.chatProductManager.removeProduct(${product.Id})">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Update all total displays
        const formattedTotal = totalPrice.toLocaleString('vi-VN') + 'đ';
        if (totalEl) totalEl.textContent = formattedTotal;
        if (totalFooterEl) totalFooterEl.textContent = formattedTotal;
        if (productCountEl) productCountEl.textContent = this.products.length;
    }

    renderHistory() {
        const historyContainer = document.getElementById('chatProductHistoryBody');
        if (!historyContainer) return;

        if (this.productHistory.length === 0) {
            historyContainer.innerHTML = `
                <div class="empty-history-state" style="
                    text-align: center;
                    padding: 40px 20px;
                    color: #9ca3af;
                ">
                    <i class="fas fa-history" style="font-size: 36px; opacity: 0.3; margin-bottom: 12px;"></i>
                    <p style="font-size: 14px; font-weight: 500; margin: 0;">Chưa có lịch sử</p>
                </div>
            `;
            return;
        }

        historyContainer.innerHTML = this.productHistory.map(entry => {
            const date = new Date(entry.timestamp);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            let timeStr;
            if (diffMins < 1) {
                timeStr = 'Vừa xong';
            } else if (diffMins < 60) {
                timeStr = `${diffMins} phút trước`;
            } else if (diffHours < 24) {
                timeStr = `${diffHours} giờ trước`;
            } else if (diffDays < 7) {
                timeStr = `${diffDays} ngày trước`;
            } else {
                timeStr = date.toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }

            let actionIcon = '';
            let actionText = '';
            let actionColor = '';
            let actionBgColor = '';

            switch (entry.action) {
                case 'add':
                    actionIcon = '<i class="fas fa-plus-circle"></i>';
                    actionText = 'Thêm';
                    actionColor = '#10b981';
                    actionBgColor = '#d1fae5';
                    break;
                case 'remove':
                    actionIcon = '<i class="fas fa-trash-alt"></i>';
                    actionText = 'Xóa';
                    actionColor = '#ef4444';
                    actionBgColor = '#fee2e2';
                    break;
                case 'update_quantity':
                    actionIcon = '<i class="fas fa-edit"></i>';
                    actionText = 'Cập nhật';
                    actionColor = '#3b82f6';
                    actionBgColor = '#dbeafe';
                    break;
            }

            let detailsHtml = '';
            if (entry.action === 'update_quantity' && entry.details) {
                detailsHtml = `
                    <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #6b7280; margin-top: 4px;">
                        <span style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${entry.details.oldQuantity || 0}</span>
                        <i class="fas fa-arrow-right" style="font-size: 8px;"></i>
                        <span style="background: ${actionBgColor}; color: ${actionColor}; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${entry.details.newQuantity || 0}</span>
                    </div>
                `;
            } else if (entry.action === 'add' && entry.details) {
                detailsHtml = `
                    <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">
                        <span style="background: ${actionBgColor}; color: ${actionColor}; padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                            SL: ${entry.details.quantity || 1}
                        </span>
                        ${entry.details.price ? `<span style="margin-left: 6px;">${(entry.details.price || 0).toLocaleString('vi-VN')}đ</span>` : ''}
                    </div>
                `;
            } else if (entry.action === 'remove' && entry.details) {
                detailsHtml = `
                    <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">
                        SL: ${entry.details.quantity || 0}
                    </div>
                `;
            }

            return `
                <div class="history-item" style="
                    padding: 12px 14px;
                    border-bottom: 1px solid #f3f4f6;
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    transition: all 0.2s;
                    position: relative;
                " onmouseover="this.style.background='#f9fafb'; this.style.borderLeftColor='${actionColor}'; this.style.borderLeftWidth='3px'; this.style.paddingLeft='11px'; this.querySelector('.delete-history-btn').style.opacity='1';"
                   onmouseout="this.style.background='white'; this.style.borderLeftWidth='0'; this.style.paddingLeft='14px'; this.querySelector('.delete-history-btn').style.opacity='0';">
                    <div style="
                        width: 32px;
                        height: 32px;
                        border-radius: 8px;
                        background: ${actionBgColor};
                        color: ${actionColor};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 14px;
                        flex-shrink: 0;
                    ">
                        ${actionIcon}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="
                                display: inline-block;
                                padding: 2px 8px;
                                background: ${actionBgColor};
                                color: ${actionColor};
                                border-radius: 4px;
                                font-size: 10px;
                                font-weight: 700;
                                text-transform: uppercase;
                                letter-spacing: 0.5px;
                            ">${actionText}</span>
                            <span style="font-size: 10px; color: #9ca3af;">
                                <i class="far fa-clock"></i> ${timeStr}
                            </span>
                        </div>
                        <div style="font-size: 13px; font-weight: 600; color: #1f2937; line-height: 1.4; margin-bottom: 2px;">
                            ${entry.productName || 'Sản phẩm'}
                        </div>
                        ${detailsHtml}
                    </div>
                    <button class="delete-history-btn" onclick="window.chatProductManager.removeHistoryEntry('${entry.id}')" style="
                        position: absolute;
                        top: 8px;
                        right: 8px;
                        width: 24px;
                        height: 24px;
                        border: none;
                        background: #fee2e2;
                        color: #ef4444;
                        border-radius: 4px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        opacity: 0;
                        transition: all 0.2s;
                        font-size: 11px;
                    " onmouseover="this.style.background='#ef4444'; this.style.color='white';" onmouseout="this.style.background='#fee2e2'; this.style.color='#ef4444';" title="Xóa">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    async renderInvoiceHistory(forceRefresh = false) {
        const container = document.getElementById('chatInvoiceHistoryContainer');
        if (!container) return;

        // Show loading
        container.innerHTML = `
            <div class="chat-loading-state" style="text-align: center; padding: 40px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 32px; color: #3b82f6; margin-bottom: 12px;"></i>
                <p style="color: #64748b; font-size: 14px;">Đang tải lịch sử hóa đơn...</p>
            </div>
        `;

        try {
            if (!window.currentChatOrderData || !window.currentChatOrderData.PartnerId) {
                throw new Error('Không tìm thấy thông tin khách hàng');
            }

            const partnerId = window.currentChatOrderData.PartnerId;
            const invoices = await this.fetchInvoiceHistory(partnerId, forceRefresh);

            if (!invoices || invoices.length === 0) {
                container.innerHTML = `
                    <div style="display: flex; flex-direction: column; height: 100%;">
                        <div style="padding: 12px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
                            <button onclick="window.chatProductManager.refreshInvoiceHistory()" style="
                                padding: 6px 12px;
                                background: #3b82f6;
                                color: white;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 12px;
                                font-weight: 600;
                                display: flex;
                                align-items: center;
                                gap: 6px;
                                transition: background 0.2s;
                            " onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
                                <i class="fas fa-sync-alt"></i> Làm mới
                            </button>
                        </div>
                        <div class="chat-empty-products" style="text-align: center; padding: 40px 20px; color: #94a3b8; flex: 1; display: flex; flex-direction: column; justify-content: center;">
                            <i class="fas fa-file-invoice-dollar" style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;"></i>
                            <p style="font-size: 14px; margin: 0;">Chưa có lịch sử hóa đơn</p>
                            <p style="font-size: 12px; margin-top: 4px;">Khách hàng chưa có hóa đơn nào trong 30 ngày qua</p>
                        </div>
                    </div>
                `;
                return;
            }

            // Render invoice cards with OrderLines
            const invoiceCards = invoices.map((inv, index) => {
                const date = inv.DateInvoice ? new Date(inv.DateInvoice).toLocaleDateString('vi-VN') : 'N/A';
                const amount = (inv.AmountTotal || 0).toLocaleString('vi-VN');
                const statusClass = inv.ShowState === 'Đã thanh toán' ? 'text-success' :
                    inv.ShowState === 'Đã hủy' ? 'text-danger' : 'text-warning';
                const statusColor = inv.ShowState === 'Đã thanh toán' ? '#10b981' :
                    inv.ShowState === 'Đã hủy' ? '#ef4444' : '#f59e0b';

                // Link to invoice form
                const invoiceLink = `https://tomato.tpos.vn/#/app/fastsaleorder/invoiceform1?id=${inv.Id}`;

                // Render OrderLines (products)
                let productsHtml = '';
                if (inv.OrderLines && inv.OrderLines.length > 0) {
                    const productRows = inv.OrderLines.map((line, idx) => {
                        const productName = line.Product?.NameGet || line.ProductName || 'N/A';
                        const quantity = line.ProductUOMQty || 0;
                        const price = (line.PriceUnit || 0).toLocaleString('vi-VN');
                        const total = (line.PriceTotal || 0).toLocaleString('vi-VN');
                        const imageUrl = line.ProductImageUrl || line.Product?.ImageUrl;
                        const note = line.Note ? `<div style="font-size: 10px; color: #6b7280; margin-top: 2px;">Ghi chú: ${line.Note}</div>` : '';

                        return `
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 8px 4px; text-align: center; color: #94a3b8; font-size: 11px;">${idx + 1}</td>
                                <td style="padding: 8px 4px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        ${imageUrl ? `<img src="${imageUrl}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px;">` : '<div style="width: 32px; height: 32px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-box" style="font-size: 12px; color: #9ca3af;"></i></div>'}
                                        <div style="flex: 1; min-width: 0;">
                                            <div style="font-size: 12px; font-weight: 500; color: #1f2937; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${productName}</div>
                                            ${note}
                                        </div>
                                    </div>
                                </td>
                                <td style="padding: 8px 4px; text-align: center; font-size: 12px; font-weight: 600; color: #1f2937;">${quantity}</td>
                                <td style="padding: 8px 4px; text-align: right; font-size: 11px; color: #64748b;">${price}đ</td>
                                <td style="padding: 8px 4px; text-align: right; font-size: 12px; font-weight: 600; color: #1f2937;">${total}đ</td>
                            </tr>
                        `;
                    }).join('');

                    productsHtml = `
                        <div id="invoice-products-${inv.Id}" style="display: none; padding: 12px; background: #f8fafc; border-top: 1px solid #e5e7eb;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                                <thead style="background: #e5e7eb;">
                                    <tr>
                                        <th style="padding: 6px 4px; text-align: center; color: #64748b; font-weight: 600; width: 30px; font-size: 11px;">#</th>
                                        <th style="padding: 6px 4px; text-align: left; color: #64748b; font-weight: 600; font-size: 11px;">Sản phẩm</th>
                                        <th style="padding: 6px 4px; text-align: center; color: #64748b; font-weight: 600; width: 50px; font-size: 11px;">SL</th>
                                        <th style="padding: 6px 4px; text-align: right; color: #64748b; font-weight: 600; width: 80px; font-size: 11px;">Đơn giá</th>
                                        <th style="padding: 6px 4px; text-align: right; color: #64748b; font-weight: 600; width: 90px; font-size: 11px;">Thành tiền</th>
                                    </tr>
                                </thead>
                                <tbody style="background: white;">
                                    ${productRows}
                                </tbody>
                            </table>
                        </div>
                    `;
                }

                return `
                    <div style="border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 12px; background: white; overflow: hidden;">
                        <div style="padding: 12px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="window.chatProductManager.toggleInvoiceProducts('${inv.Id}')">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                    <a href="${invoiceLink}" target="_blank" style="font-weight: 600; color: #3b82f6; text-decoration: none; font-size: 14px;" onclick="event.stopPropagation()">
                                        ${inv.Number || 'N/A'}
                                    </a>
                                    <span style="background: ${statusColor}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600;">${inv.ShowState || 'N/A'}</span>
                                    ${inv.OrderLines && inv.OrderLines.length > 0 ? `<span style="background: #e5e7eb; color: #64748b; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600;">${inv.OrderLines.length} SP</span>` : ''}
                                </div>
                                <div style="display: flex; gap: 16px; font-size: 12px; color: #64748b;">
                                    <span><i class="fas fa-calendar" style="margin-right: 4px;"></i>${date}</span>
                                    <span style="font-weight: 600; color: #1f2937;"><i class="fas fa-money-bill-wave" style="margin-right: 4px;"></i>${amount}đ</span>
                                </div>
                            </div>
                            ${inv.OrderLines && inv.OrderLines.length > 0 ? `
                                <div>
                                    <i id="invoice-toggle-icon-${inv.Id}" class="fas fa-chevron-down" style="color: #94a3b8; transition: transform 0.2s;"></i>
                                </div>
                            ` : ''}
                        </div>
                        ${productsHtml}
                    </div>
                `;
            }).join('');

            container.innerHTML = `
                <div style="display: flex; flex-direction: column; height: 100%;">
                    <div style="padding: 12px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: white;">
                        <div style="font-size: 13px; color: #64748b;">
                            <i class="fas fa-receipt" style="margin-right: 6px;"></i>
                            Tìm thấy <strong style="color: #1f2937;">${invoices.length}</strong> hóa đơn
                        </div>
                        <button onclick="window.chatProductManager.refreshInvoiceHistory()" style="
                            padding: 6px 12px;
                            background: #3b82f6;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 12px;
                            font-weight: 600;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            transition: background 0.2s;
                        " onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
                            <i class="fas fa-sync-alt"></i> Làm mới
                        </button>
                    </div>
                    <div style="flex: 1; overflow-y: auto; padding: 12px;">
                        ${invoiceCards}
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('[CHAT-INVOICE] Error rendering history:', error);
            container.innerHTML = `
                <div class="chat-error-state" style="text-align: center; padding: 40px 20px; color: #ef4444;">
                    <i class="fas fa-exclamation-circle" style="font-size: 32px; margin-bottom: 12px;"></i>
                    <p style="font-size: 14px; margin: 0;">Lỗi tải lịch sử hóa đơn</p>
                    <p style="font-size: 12px; margin-top: 4px;">${error.message}</p>
                    <button onclick="window.chatProductManager.renderInvoiceHistory()" style="
                        margin-top: 12px;
                        padding: 6px 16px;
                        background: #fff;
                        border: 1px solid #ef4444;
                        color: #ef4444;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 12px;
                    ">Thử lại</button>
                </div>
            `;
        }
    }

    toggleInvoiceProducts(invoiceId) {
        const productsContainer = document.getElementById(`invoice-products-${invoiceId}`);
        const toggleIcon = document.getElementById(`invoice-toggle-icon-${invoiceId}`);

        if (productsContainer && toggleIcon) {
            const isVisible = productsContainer.style.display !== 'none';
            productsContainer.style.display = isVisible ? 'none' : 'block';
            toggleIcon.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    }

    async refreshInvoiceHistory() {
        console.log('[CHAT-INVOICE] Refreshing invoice history...');
        await this.renderInvoiceHistory(true);
    }

    async fetchInvoiceHistory(partnerId, forceRefresh = false) {
        // Check cache first (cache expires after 5 minutes)
        const now = Date.now();
        const cacheExpiry = 5 * 60 * 1000; // 5 minutes

        if (!forceRefresh && this.invoiceCacheTimestamp && (now - this.invoiceCacheTimestamp < cacheExpiry)) {
            console.log('[CHAT-INVOICE] Using cached invoice data');
            return Array.from(this.invoiceCache.values());
        }

        // Calculate date range (last 30 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        const formatDate = (date) => {
            return date.toISOString().split('T')[0]; // YYYY-MM-DD
        };

        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.GetOrdersByPartnerId?partnerId=${partnerId}&fromDate=${formatDate(startDate)}&toDate=${formatDate(endDate)}`;

        try {
            const headers = await window.tokenManager.getAuthHeader();
            const response = await API_CONFIG.smartFetch(apiUrl, {
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const invoices = data.value || [];

            console.log(`[CHAT-INVOICE] Fetched ${invoices.length} invoices, now fetching details...`);

            // Clear old cache
            this.invoiceCache.clear();

            // Fetch details for each invoice (with OrderLines)
            const detailedInvoices = [];
            for (const invoice of invoices) {
                try {
                    const details = await this.fetchInvoiceDetails(invoice.Id);
                    if (details) {
                        this.invoiceCache.set(invoice.Id, details);
                        detailedInvoices.push(details);
                    }
                } catch (error) {
                    console.error(`[CHAT-INVOICE] Error fetching details for invoice ${invoice.Id}:`, error);
                    // Still add basic invoice without details
                    this.invoiceCache.set(invoice.Id, invoice);
                    detailedInvoices.push(invoice);
                }
            }

            // Update cache timestamp
            this.invoiceCacheTimestamp = now;

            console.log(`[CHAT-INVOICE] Cached ${detailedInvoices.length} invoices with details`);
            return detailedInvoices;
        } catch (error) {
            console.error('[CHAT-INVOICE] API Error:', error);
            throw error;
        }
    }

    async fetchInvoiceDetails(invoiceId) {
        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder(${invoiceId})?$expand=OrderLines($expand=Product,ProductUOM,User)`;

        try {
            const headers = await window.tokenManager.getAuthHeader();
            const response = await API_CONFIG.smartFetch(apiUrl, {
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            console.log(`[CHAT-INVOICE] Fetched details for invoice ${invoiceId} with ${data.OrderLines?.length || 0} products`);
            return data;
        } catch (error) {
            console.error(`[CHAT-INVOICE] Error fetching invoice ${invoiceId} details:`, error);
            throw error;
        }
    }

    clearInvoiceCache() {
        this.invoiceCache.clear();
        this.invoiceCacheTimestamp = null;
        console.log('[CHAT-INVOICE] Cache cleared');
    }

    setupEventListeners() {
        const searchInput = document.getElementById('chatProductSearchInput');
        if (searchInput) {
            // Debounce search
            let timeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.handleSearch(e.target.value);
                }, 300);
            });

            // Hide suggestions when clicking outside
            document.addEventListener('click', (e) => {
                const suggestions = document.getElementById('chatProductSearchResults');
                if (suggestions && e.target !== searchInput && !suggestions.contains(e.target)) {
                    suggestions.style.display = 'none';
                }
            });
        }

        // Prevent scroll propagation for product list and history
        const productList = document.getElementById('chatProductTableBody');
        const historyList = document.getElementById('chatProductHistoryBody');

        if (productList) {
            productList.addEventListener('wheel', (e) => {
                // Check if scrolled to top or bottom
                const isAtTop = productList.scrollTop === 0;
                const isAtBottom = productList.scrollHeight - productList.scrollTop === productList.clientHeight;

                // Prevent scroll propagation if not at boundaries
                if ((e.deltaY < 0 && !isAtTop) || (e.deltaY > 0 && !isAtBottom)) {
                    e.stopPropagation();
                }
            }, { passive: false });
        }

        if (historyList) {
            historyList.addEventListener('wheel', (e) => {
                // Check if scrolled to top or bottom
                const isAtTop = historyList.scrollTop === 0;
                const isAtBottom = historyList.scrollHeight - historyList.scrollTop === historyList.clientHeight;

                // Prevent scroll propagation if not at boundaries
                if ((e.deltaY < 0 && !isAtTop) || (e.deltaY > 0 && !isAtBottom)) {
                    e.stopPropagation();
                }
            }, { passive: false });
        }

        // Setup tab switching
        const productsTab = document.getElementById('productsTabBtn');
        const historyTab = document.getElementById('historyTabBtn');

        if (productsTab) {
            productsTab.addEventListener('click', () => {
                this.switchTab('products');
            });
        }

        if (historyTab) {
            historyTab.addEventListener('click', () => {
                this.switchTab('history');
            });
        }
    }

    switchTab(tab) {
        const productsContent = document.getElementById('chatProductListContainer');
        const historyContent = document.getElementById('chatProductHistoryContainer');
        const productsTabBtn = document.getElementById('productsTabBtn');
        const historyTabBtn = document.getElementById('historyTabBtn');

        if (tab === 'products') {
            if (productsContent) productsContent.style.display = 'flex';
            if (historyContent) historyContent.style.display = 'none';
            if (productsTabBtn) {
                productsTabBtn.classList.add('active');
                productsTabBtn.style.background = 'white';
                productsTabBtn.style.color = '#667eea';
            }
            if (historyTabBtn) {
                historyTabBtn.classList.remove('active');
                historyTabBtn.style.background = 'transparent';
                historyTabBtn.style.color = 'rgba(255, 255, 255, 0.8)';
            }
        } else {
            if (productsContent) productsContent.style.display = 'none';
            if (historyContent) historyContent.style.display = 'flex';
            if (historyTabBtn) {
                historyTabBtn.classList.add('active');
                historyTabBtn.style.background = 'white';
                historyTabBtn.style.color = '#667eea';
            }
            if (productsTabBtn) {
                productsTabBtn.classList.remove('active');
                productsTabBtn.style.background = 'transparent';
                productsTabBtn.style.color = 'rgba(255, 255, 255, 0.8)';
            }
        }
    }
}

// Initialize global instance
window.chatProductManager = new ChatProductManager();
