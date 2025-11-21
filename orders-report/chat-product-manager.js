class ChatProductManager {
    constructor() {
        this.orderId = null;
        this.products = [];
        this.firebaseRef = null;
        this.historyRef = null;
        this.isListening = false;
        this.searchResults = [];
        this.productHistory = [];
    }

    init(orderId) {
        if (!orderId) {
            console.error('[CHAT-PRODUCT] No orderId provided');
            return;
        }

        this.orderId = orderId;
        this.products = [];
        this.searchResults = [];
        this.productHistory = [];

        // Initialize Firebase reference
        // Path: chat_products/{orderId}
        // History Path: chat_products_history/{orderId}
        if (firebase && firebase.database) {
            this.firebaseRef = firebase.database().ref(`chat_products/${this.orderId}`);
            this.historyRef = firebase.database().ref(`chat_products_history/${this.orderId}`);
            this.startListening();
            this.startHistoryListening();
        } else {
            console.error('[CHAT-PRODUCT] Firebase not initialized');
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
        const searchInput = document.getElementById('chatProductSearch');
        if (searchInput) searchInput.value = '';

        // Hide suggestions
        const suggestions = document.getElementById('chatProductSuggestions');
        if (suggestions) suggestions.style.display = 'none';
    }

    startHistoryListening() {
        if (!this.historyRef) return;

        console.log(`[CHAT-PRODUCT-HISTORY] Listening for changes on chat_products_history/${this.orderId}`);

        this.historyRef.orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                this.productHistory = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
            } else {
                this.productHistory = [];
            }
            this.renderHistory();
        }, (error) => {
            console.error('[CHAT-PRODUCT-HISTORY] Firebase listener error:', error);
        });
    }

    async logHistory(action, productName, details = {}) {
        if (!this.historyRef) return;

        try {
            const historyEntry = {
                action: action, // 'add', 'remove', 'update_quantity'
                productName: productName,
                details: details,
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
                        const token = await window.tokenManager.getValidToken();
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
        const suggestionsEl = document.getElementById('chatProductSuggestions');
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
        const suggestionsEl = document.getElementById('chatProductSuggestions');
        if (!suggestionsEl) return;

        if (this.searchResults.length === 0) {
            suggestionsEl.style.display = 'none';
            return;
        }

        suggestionsEl.innerHTML = this.searchResults.map(product => `
            <div class="chat-product-suggestion-item" onclick="window.chatProductManager.selectProduct(${product.Id})">
                <div class="suggestion-image">
                    ${product.ImageUrl ? `<img src="${product.ImageUrl}" onerror="this.src='https://via.placeholder.com/40'"/>` : '<div class="no-image"><i class="fas fa-box"></i></div>'}
                </div>
                <div class="suggestion-info">
                    <div class="suggestion-name">${product.Name}</div>
                    <div class="suggestion-meta">
                        <span class="suggestion-code">${product.Code || 'No Code'}</span>
                        <span class="suggestion-price">${(product.Price || 0).toLocaleString('vi-VN')}đ</span>
                    </div>
                </div>
            </div>
        `).join('');

        suggestionsEl.style.display = 'block';
    }

    selectProduct(productId) {
        const product = this.searchResults.find(p => p.Id === productId);
        if (product) {
            this.addProduct(product);

            // Clear search
            const searchInput = document.getElementById('chatProductSearch');
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            document.getElementById('chatProductSuggestions').style.display = 'none';
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

        tbody.innerHTML = this.products.map(product => {
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
            const timeStr = date.toLocaleString('vi-VN');

            let actionIcon = '';
            let actionText = '';
            let actionColor = '';

            switch (entry.action) {
                case 'add':
                    actionIcon = '<i class="fas fa-plus-circle"></i>';
                    actionText = 'Thêm';
                    actionColor = '#10b981';
                    break;
                case 'remove':
                    actionIcon = '<i class="fas fa-trash-alt"></i>';
                    actionText = 'Xóa';
                    actionColor = '#ef4444';
                    break;
                case 'update_quantity':
                    actionIcon = '<i class="fas fa-edit"></i>';
                    actionText = 'Cập nhật SL';
                    actionColor = '#3b82f6';
                    break;
            }

            let detailsHtml = '';
            if (entry.action === 'update_quantity') {
                detailsHtml = `<span style="color: #6b7280; font-size: 11px;">${entry.details.oldQuantity} → ${entry.details.newQuantity}</span>`;
            } else if (entry.action === 'add') {
                detailsHtml = `<span style="color: #6b7280; font-size: 11px;">SL: ${entry.details.quantity}</span>`;
            }

            return `
                <div class="history-item" style="
                    padding: 10px 12px;
                    border-bottom: 1px solid #f3f4f6;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    transition: background 0.2s;
                " onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
                    <div style="color: ${actionColor}; font-size: 16px; flex-shrink: 0;">
                        ${actionIcon}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 13px; font-weight: 500; color: #1f2937; margin-bottom: 2px;">
                            ${entry.productName}
                        </div>
                        <div style="font-size: 11px; color: #9ca3af;">
                            ${timeStr}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="color: ${actionColor}; font-size: 11px; font-weight: 600; margin-bottom: 2px;">
                            ${actionText}
                        </div>
                        ${detailsHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    setupEventListeners() {
        const searchInput = document.getElementById('chatProductSearch');
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
                const suggestions = document.getElementById('chatProductSuggestions');
                if (suggestions && e.target !== searchInput && !suggestions.contains(e.target)) {
                    suggestions.style.display = 'none';
                }
            });
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
            if (productsContent) productsContent.style.display = 'block';
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
            if (historyContent) historyContent.style.display = 'block';
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
