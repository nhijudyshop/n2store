class ChatProductManager {
    constructor() {
        this.orderId = null;
        this.products = [];
        this.firebaseRef = null;
        this.isListening = false;
        this.searchResults = [];
    }

    init(orderId) {
        if (!orderId) {
            console.error('[CHAT-PRODUCT] No orderId provided');
            return;
        }

        this.orderId = orderId;
        this.products = [];
        this.searchResults = [];

        // Initialize Firebase reference
        // Path: chat_products/{orderId}
        if (firebase && firebase.database) {
            this.firebaseRef = firebase.database().ref(`chat_products/${this.orderId}`);
            this.startListening();
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
        this.orderId = null;
        this.products = [];
        this.searchResults = [];

        // Clear search input
        const searchInput = document.getElementById('chatProductSearch');
        if (searchInput) searchInput.value = '';

        // Hide suggestions
        const suggestions = document.getElementById('chatProductSuggestions');
        if (suggestions) suggestions.style.display = 'none';
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

                if (window.notificationManager) {
                    window.notificationManager.show(`Đã tăng số lượng: ${product.Name}`, 'success');
                }
            } else {
                // Add new product
                const newProduct = {
                    Id: product.Id,
                    Code: product.Code || '',
                    Name: product.Name || '',
                    Price: product.Price || 0,
                    Quantity: 1,
                    ImageUrl: product.ImageUrl || '',
                    AddedAt: firebase.database.ServerValue.TIMESTAMP
                };

                await this.firebaseRef.child(String(product.Id)).set(newProduct);

                if (window.notificationManager) {
                    window.notificationManager.show(`Đã thêm: ${product.Name}`, 'success');
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
            await this.firebaseRef.child(String(productId)).remove();
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
            await this.firebaseRef.child(String(productId)).update({
                Quantity: newQuantity
            });
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
    }
}

// Initialize global instance
window.chatProductManager = new ChatProductManager();
