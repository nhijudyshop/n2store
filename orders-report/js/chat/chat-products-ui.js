/* =====================================================
   CHAT PRODUCTS UI - Right panel product management
   Tab Đơn hàng: held/main products, actions, search, KPI
   Tab Lịch sử + Hóa đơn (dropped tab do manager render)
   ===================================================== */

console.log('[ChatProducts-UI] Loading...');

// =====================================================
// STATE
// =====================================================
let _orderProducts = [];
let _currentOrderId = null;
let _currentOrderSTT = null;
let _searchDebounce = null;
let _historyLoaded = false;
let _invoicesLoaded = false;

// =====================================================
// TOGGLE RIGHT PANEL
// =====================================================

window.toggleChatRightPanel = function() {
    const panel = document.getElementById('chatRightPanel');
    if (panel) panel.classList.toggle('hidden');
};

// =====================================================
// INIT & CLEANUP
// =====================================================

window.initProductPanel = function(orderData) {
    if (!orderData) return;

    _orderProducts = (orderData.Details || []).slice(); // shallow copy
    _currentOrderId = orderData.Id || window.currentChatOrderId;
    _currentOrderSTT = orderData.SessionIndex || window.currentChatOrderSTT || '';
    _historyLoaded = false;
    _invoicesLoaded = false;

    // Reset search
    const searchInput = document.getElementById('chatProductSearchInput');
    if (searchInput) searchInput.value = '';
    _hideSearchSuggestions();

    // Render products
    _renderAllProducts();

    // Init KPI badge
    if (window.kpiManager && window.kpiManager.initKPIBadge && _currentOrderId) {
        window.kpiManager.initKPIBadge(String(_currentOrderId));
    }
};

window.cleanupProductPanel = function() {
    _orderProducts = [];
    _currentOrderId = null;
    _currentOrderSTT = null;
    _historyLoaded = false;
    _invoicesLoaded = false;
    _hideSearchSuggestions();
};

// =====================================================
// TAB 1: ĐƠN HÀNG - RENDERING
// =====================================================

function _renderAllProducts() {
    const heldProducts = _orderProducts.filter(p => p.IsHeld);
    const mainProducts = _orderProducts.filter(p => !p.IsHeld);

    // Held section
    const heldSection = document.getElementById('chatHeldSection');
    const heldList = document.getElementById('chatHeldProductsList');
    if (heldSection && heldList) {
        if (heldProducts.length > 0) {
            heldSection.style.display = '';
            heldList.innerHTML = heldProducts.map((p, i) => _renderHeldProduct(p)).join('');
        } else {
            heldSection.style.display = 'none';
            heldList.innerHTML = '';
        }
    }

    // Main products
    const mainList = document.getElementById('chatProductList');
    if (mainList) {
        if (mainProducts.length > 0) {
            mainList.innerHTML = mainProducts.map((p, i) => _renderMainProduct(p)).join('');
        } else {
            mainList.innerHTML = '<div class="chat-panel-empty">Không có sản phẩm</div>';
        }
    }

    _updateTotals();
}

function _renderHeldProduct(product) {
    const pid = parseInt(product.ProductId);
    const name = product.ProductNameGet || product.ProductName || 'Sản phẩm';
    const code = product.ProductCode || product.Code || '';
    const qty = product.Quantity || 1;
    const price = product.Price || 0;
    const imgUrl = product.ImageUrl || '';
    const uomName = product.UOMName || '';
    const note = product.Note || '';

    const imgHtml = imgUrl
        ? `<img class="chat-product-img" src="${_escapeHtml(imgUrl)}" alt="" onerror="this.style.display='none'"
               onclick="window.showImageZoom && showImageZoom('${_escapeHtml(imgUrl)}', '${_escapeJs(name)}')"
               oncontextmenu="window.sendImageToChat && sendImageToChat('${_escapeHtml(imgUrl)}', '${_escapeJs(name)}', ${pid}, '${_escapeJs(code)}'); return false"
               title="Click: Xem ảnh | Chuột phải: Gửi ảnh">`
        : `<div class="chat-product-img" style="display:flex;align-items:center;justify-content:center;color:#f59e0b;font-size:16px;background:#fffbeb"><i class="fas fa-hand-holding"></i></div>`;

    const variant = [code, uomName].filter(Boolean).join(' · ');

    return `
        <div class="chat-product-card held-product">
            ${imgHtml}
            <div class="chat-product-info">
                <div class="chat-product-name" title="${_escapeHtml(name)}">${_escapeHtml(name)}</div>
                ${variant ? `<div class="chat-product-variant">${_escapeHtml(variant)}</div>` : ''}
                <div class="chat-product-price">${_formatCurrency(price)}</div>
                <input class="chat-product-note" type="text" placeholder="Ghi chú..." value="${_escapeHtml(note)}"
                    onblur="window.updateProductNote(${pid}, this.value)">
            </div>
            <div class="chat-product-qty">
                <button onclick="window.updateHeldProductQty(${pid}, -1)" class="chat-qty-btn"><i class="fas fa-minus"></i></button>
                <input type="number" class="chat-quantity-input" value="${qty}" min="1"
                    onchange="window.updateHeldProductQty(${pid}, 0, parseInt(this.value))" style="width:36px;text-align:center">
                <button onclick="window.updateHeldProductQty(${pid}, 1)" class="chat-qty-btn"><i class="fas fa-plus"></i></button>
            </div>
            <div class="held-actions">
                <button class="btn-confirm" onclick="window.confirmHeldProduct(${pid})" title="Xác nhận thêm vào đơn">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn-delete" onclick="window.deleteHeldProduct(${pid})" title="Xóa / Trả lại">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

function _renderMainProduct(product) {
    const pid = parseInt(product.ProductId);
    const name = product.ProductNameGet || product.ProductName || 'Sản phẩm';
    const code = product.ProductCode || product.Code || '';
    const qty = product.Quantity || 1;
    const price = product.Price || 0;
    const imgUrl = product.ImageUrl || '';
    const uomName = product.UOMName || '';

    const imgHtml = imgUrl
        ? `<img class="chat-product-img" src="${_escapeHtml(imgUrl)}" alt="" onerror="this.style.display='none'"
               onclick="window.showImageZoom && showImageZoom('${_escapeHtml(imgUrl)}', '${_escapeJs(name)}')">`
        : `<div class="chat-product-img" style="display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:16px"><i class="fas fa-box"></i></div>`;

    const variant = [code, uomName].filter(Boolean).join(' · ');

    return `
        <div class="chat-product-card">
            ${imgHtml}
            <div class="chat-product-info">
                <div class="chat-product-name" title="${_escapeHtml(name)}">${_escapeHtml(name)}</div>
                ${variant ? `<div class="chat-product-variant">${_escapeHtml(variant)}</div>` : ''}
                <div class="chat-product-price">${_formatCurrency(price)}</div>
            </div>
            <div class="chat-product-qty">
                <button onclick="window.decreaseMainProductQty(${pid})" class="chat-qty-btn" title="Giảm số lượng">
                    <i class="fas fa-minus"></i>
                </button>
                <span>${qty}</span>
            </div>
        </div>
    `;
}

function _updateTotals() {
    const mainProducts = _orderProducts.filter(p => !p.IsHeld);
    const totalAmount = mainProducts.reduce((sum, p) => sum + (p.Price || 0) * (p.Quantity || 1), 0);
    const totalQty = mainProducts.reduce((sum, p) => sum + (p.Quantity || 1), 0);

    const totalEl = document.getElementById('chatProductTotal');
    if (totalEl) totalEl.textContent = _formatCurrency(totalAmount);

    const countEl = document.getElementById('chatProductCount');
    if (countEl) countEl.textContent = `${totalQty} sản phẩm`;

    // Update tab badge
    const badge = document.getElementById('chatOrdersCountBadge');
    if (badge) badge.textContent = totalQty || '';
}

// =====================================================
// PRODUCT ACTIONS
// =====================================================

window.confirmHeldProduct = async function(productId) {
    productId = parseInt(productId);
    const heldIndex = _orderProducts.findIndex(p => parseInt(p.ProductId) === productId && p.IsHeld);
    if (heldIndex === -1) {
        console.warn('[ChatProducts] Held product not found:', productId);
        return;
    }

    const heldProduct = _orderProducts[heldIndex];
    const orderId = String(_currentOrderId);

    try {
        // 1. KPI BASE check
        if (window.kpiManager && window.kpiManager.promptAndSaveKPIBase) {
            const mainProducts = _orderProducts.filter(p => !p.IsHeld);
            await window.kpiManager.promptAndSaveKPIBase(orderId, _currentOrderSTT, mainProducts);
        }

        // 2. Remove from held
        _orderProducts.splice(heldIndex, 1);

        // 3. Merge with existing main product or add as new
        const existingMain = _orderProducts.find(p => parseInt(p.ProductId) === productId && !p.IsHeld);
        if (existingMain) {
            existingMain.Quantity = (existingMain.Quantity || 1) + (heldProduct.Quantity || 1);
            if (heldProduct.Note) existingMain.Note = heldProduct.Note;
        } else {
            _orderProducts.push({
                ...heldProduct,
                IsHeld: false,
                IsFromDropped: false,
                IsFromSearch: false
            });
        }

        // 4. Update on TPOS backend
        await _updateOrderOnBackend();

        // 5. Remove from Firebase held_products
        await _removeFromFirebaseHeld(productId);

        // 6. KPI audit log
        if (window.kpiAuditLogger && window.kpiAuditLogger.logProductAction) {
            const auth = window.authManager?.getAuthState();
            window.kpiAuditLogger.logProductAction({
                orderId: orderId,
                action: 'add',
                productId: productId,
                productCode: heldProduct.ProductCode || heldProduct.Code || '',
                productName: heldProduct.ProductNameGet || heldProduct.ProductName || '',
                quantity: heldProduct.Quantity || 1,
                userId: auth?.id || auth?.Id || '',
                userName: auth?.displayName || '',
                campaignName: window.currentChatOrderData?.LiveCampaignName || '',
                source: 'chat_confirm_held'
            });
        }

        // 7. Recalculate KPI
        if (window.kpiManager && window.kpiManager.recalculateAndSaveKPI) {
            window.kpiManager.recalculateAndSaveKPI(orderId);
        }

        // 8. Sync to window.currentChatOrderData
        if (window.currentChatOrderData) {
            window.currentChatOrderData.Details = _orderProducts.slice();
        }

        // 9. Re-render
        _renderAllProducts();

        console.log('[ChatProducts] ✓ Confirmed held product:', productId);
    } catch (e) {
        console.error('[ChatProducts] Error confirming held product:', e);
        // Re-add held product on error
        _orderProducts.splice(heldIndex, 0, heldProduct);
        _renderAllProducts();
        _showError('Lỗi xác nhận sản phẩm: ' + e.message);
    }
};

window.deleteHeldProduct = async function(productId) {
    productId = parseInt(productId);
    const heldIndex = _orderProducts.findIndex(p => parseInt(p.ProductId) === productId && p.IsHeld);
    if (heldIndex === -1) return;

    const heldProduct = _orderProducts[heldIndex];
    const name = heldProduct.ProductNameGet || heldProduct.ProductName || '';

    // Confirm
    let confirmed = false;
    if (window.CustomPopup) {
        confirmed = await window.CustomPopup.confirm(`Xóa sản phẩm "${name}" khỏi danh sách giữ?`, 'Xác nhận xóa');
    } else {
        confirmed = confirm(`Xóa sản phẩm "${name}" khỏi danh sách giữ?`);
    }
    if (!confirmed) return;

    try {
        // Remove from local
        _orderProducts.splice(heldIndex, 1);

        // If from dropped, return to dropped products
        if (heldProduct.IsFromDropped && window.addToDroppedProducts) {
            await window.addToDroppedProducts({
                ProductId: productId,
                ProductName: heldProduct.ProductName,
                ProductNameGet: heldProduct.ProductNameGet,
                ProductCode: heldProduct.ProductCode || heldProduct.Code,
                ImageUrl: heldProduct.ImageUrl,
                Price: heldProduct.Price,
                UOMName: heldProduct.UOMName
            }, heldProduct.Quantity || 1, 'returned_from_held', null, {});
        }

        // Remove from Firebase held_products
        await _removeFromFirebaseHeld(productId);

        // Sync
        if (window.currentChatOrderData) {
            window.currentChatOrderData.Details = _orderProducts.slice();
        }

        _renderAllProducts();
        console.log('[ChatProducts] ✓ Deleted held product:', productId);
    } catch (e) {
        console.error('[ChatProducts] Error deleting held product:', e);
        _showError('Lỗi xóa sản phẩm: ' + e.message);
    }
};

window.decreaseMainProductQty = async function(productId) {
    productId = parseInt(productId);
    const mainIndex = _orderProducts.findIndex(p => parseInt(p.ProductId) === productId && !p.IsHeld);
    if (mainIndex === -1) return;

    const product = _orderProducts[mainIndex];
    const name = product.ProductNameGet || product.ProductName || '';
    const currentQty = product.Quantity || 1;

    const msg = currentQty > 1
        ? `Giảm số lượng "${name}" từ ${currentQty} xuống ${currentQty - 1}?`
        : `Xóa sản phẩm "${name}" khỏi đơn hàng?`;

    let confirmed = false;
    if (window.CustomPopup) {
        confirmed = await window.CustomPopup.confirm(msg, 'Xác nhận');
    } else {
        confirmed = confirm(msg);
    }
    if (!confirmed) return;

    try {
        const orderId = String(_currentOrderId);

        if (currentQty > 1) {
            product.Quantity = currentQty - 1;
        } else {
            _orderProducts.splice(mainIndex, 1);
        }

        // Update backend
        await _updateOrderOnBackend();

        // KPI audit log
        if (window.kpiAuditLogger && window.kpiAuditLogger.logProductAction) {
            const auth = window.authManager?.getAuthState();
            window.kpiAuditLogger.logProductAction({
                orderId: orderId,
                action: 'remove',
                productId: productId,
                productCode: product.ProductCode || product.Code || '',
                productName: product.ProductNameGet || product.ProductName || '',
                quantity: 1,
                userId: auth?.id || auth?.Id || '',
                userName: auth?.displayName || '',
                campaignName: window.currentChatOrderData?.LiveCampaignName || '',
                source: 'chat_decrease'
            });
        }

        // Recalculate KPI
        if (window.kpiManager && window.kpiManager.recalculateAndSaveKPI) {
            window.kpiManager.recalculateAndSaveKPI(orderId);
        }

        // Sync
        if (window.currentChatOrderData) {
            window.currentChatOrderData.Details = _orderProducts.slice();
        }

        _renderAllProducts();
        console.log('[ChatProducts] ✓ Decreased product qty:', productId);
    } catch (e) {
        console.error('[ChatProducts] Error decreasing qty:', e);
        _showError('Lỗi cập nhật số lượng: ' + e.message);
    }
};

window.updateHeldProductQty = function(productId, change, value) {
    productId = parseInt(productId);
    const product = _orderProducts.find(p => parseInt(p.ProductId) === productId && p.IsHeld);
    if (!product) return;

    if (change !== 0) {
        product.Quantity = Math.max(1, (product.Quantity || 1) + change);
    } else if (value !== undefined) {
        product.Quantity = Math.max(1, parseInt(value) || 1);
    }

    _renderAllProducts();
};

window.updateProductNote = function(productId, note) {
    productId = parseInt(productId);
    const product = _orderProducts.find(p => parseInt(p.ProductId) === productId);
    if (product) product.Note = note;
};

// =====================================================
// SEARCH & ADD PRODUCTS
// =====================================================

window.chatProductSearch = function(query) {
    clearTimeout(_searchDebounce);

    if (!query || query.trim().length < 2) {
        _hideSearchSuggestions();
        return;
    }

    _searchDebounce = setTimeout(() => {
        const manager = window.productSearchManager || window.enhancedProductSearchManager;
        if (!manager || !manager.search) {
            console.warn('[ChatProducts] Product search manager not available');
            return;
        }

        const results = manager.search(query, 15);
        _displaySearchResults(results);
    }, 300);
};

function _displaySearchResults(results) {
    const container = document.getElementById('chatProductSearchSuggestions');
    if (!container) return;

    if (results.length === 0) {
        container.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:12px">Không tìm thấy sản phẩm</div>';
        container.style.display = 'block';
        return;
    }

    container.innerHTML = results.map(p => {
        const pid = parseInt(p.Id || p.ProductId);
        const name = p.NameGet || p.Name || '';
        const code = p.Code || p.DefaultCode || '';
        const price = p.ListPrice || p.PriceVariant || 0;
        const imgUrl = p.ImageUrl || '';

        // Check if already in order
        const inOrder = _orderProducts.find(op => parseInt(op.ProductId) === pid);
        const badge = inOrder
            ? (inOrder.IsHeld ? '<span style="color:#f59e0b;font-size:10px;font-weight:600">Giữ</span>' : `<span style="color:#059669;font-size:10px;font-weight:600">x${inOrder.Quantity}</span>`)
            : '';

        const imgHtml = imgUrl
            ? `<img src="${_escapeHtml(imgUrl)}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`
            : `<div style="width:36px;height:36px;border-radius:6px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#9ca3af"><i class="fas fa-box" style="font-size:14px"></i></div>`;

        return `
            <div class="search-suggestion-item" onclick="window.addProductFromSearch(${pid})" style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid #f3f4f6;transition:background 0.15s"
                 onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">
                ${imgHtml}
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${code ? `[${_escapeHtml(code)}] ` : ''}${_escapeHtml(name)}</div>
                    <div style="font-size:11px;color:#059669;font-weight:600">${_formatCurrency(price)}</div>
                </div>
                <div style="flex-shrink:0;display:flex;align-items:center;gap:6px">
                    ${badge}
                    ${inOrder
                        ? `<i class="fas fa-check-circle" style="color:#059669;font-size:14px"></i>`
                        : `<i class="fas fa-plus-circle" style="color:#6366f1;font-size:14px"></i>`
                    }
                </div>
            </div>
        `;
    }).join('');

    container.style.display = 'block';
}

function _hideSearchSuggestions() {
    const container = document.getElementById('chatProductSearchSuggestions');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
}

window.addProductFromSearch = async function(productId) {
    productId = parseInt(productId);

    // Check if already held → merge qty
    const existingHeld = _orderProducts.find(p => parseInt(p.ProductId) === productId && p.IsHeld);
    if (existingHeld) {
        existingHeld.Quantity = (existingHeld.Quantity || 1) + 1;
        _renderAllProducts();
        _hideSearchSuggestions();
        return;
    }

    try {
        // Get full product details
        const manager = window.productSearchManager || window.enhancedProductSearchManager;
        let fullProduct = null;
        if (manager && manager.getFullProductDetails) {
            fullProduct = await manager.getFullProductDetails(productId);
        }

        if (!fullProduct) {
            // Fallback from search results
            const searchResults = manager?.search(String(productId), 1) || [];
            const match = searchResults.find(p => parseInt(p.Id) === productId);
            if (match) {
                fullProduct = match;
            } else {
                _showError('Không tìm thấy thông tin sản phẩm');
                return;
            }
        }

        // Use correct price (PriceVariant or ListPrice, NOT StandardPrice)
        const price = fullProduct.PriceVariant || fullProduct.ListPrice || fullProduct.Price || 0;

        // Create held product
        const heldProduct = {
            ProductId: productId,
            ProductName: fullProduct.Name || fullProduct.ProductName || '',
            ProductNameGet: fullProduct.NameGet || fullProduct.ProductNameGet || fullProduct.Name || '',
            ProductCode: fullProduct.DefaultCode || fullProduct.Code || fullProduct.Barcode || '',
            Code: fullProduct.DefaultCode || fullProduct.Code || '',
            ImageUrl: fullProduct.ImageUrl || '',
            Price: price,
            Quantity: 1,
            UOMId: fullProduct.UOM?.Id || fullProduct.UOMId || 1,
            UOMName: fullProduct.UOM?.Name || fullProduct.UOMName || 'Cái',
            Factor: 1,
            Priority: 0,
            OrderId: _currentOrderId,
            Note: null,
            IsHeld: true,
            IsFromSearch: true,
            IsFromDropped: false,
            StockQty: fullProduct.QtyAvailable || 0
        };

        _orderProducts.push(heldProduct);

        // Sync to Firebase held_products
        await _syncToFirebaseHeld(heldProduct);

        // Sync to window.currentChatOrderData
        if (window.currentChatOrderData) {
            window.currentChatOrderData.Details = _orderProducts.slice();
        }

        _renderAllProducts();
        _hideSearchSuggestions();

        // Clear search input
        const searchInput = document.getElementById('chatProductSearchInput');
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }

        console.log('[ChatProducts] ✓ Added product from search:', productId, heldProduct.ProductNameGet);
    } catch (e) {
        console.error('[ChatProducts] Error adding product:', e);
        _showError('Lỗi thêm sản phẩm: ' + e.message);
    }
};

// Close search suggestions when clicking outside
document.addEventListener('click', function(e) {
    const searchContainer = document.getElementById('chatProductSearchInput');
    const suggestions = document.getElementById('chatProductSearchSuggestions');
    if (searchContainer && suggestions && !searchContainer.contains(e.target) && !suggestions.contains(e.target)) {
        _hideSearchSuggestions();
    }
});

// =====================================================
// FIREBASE HELPERS
// =====================================================

async function _syncToFirebaseHeld(product) {
    if (!window.firebase || !window.authManager || !_currentOrderId) return;

    try {
        const auth = window.authManager.getAuthState();
        if (!auth) return;

        let userId = auth.id || auth.Id || auth.username || auth.userType;
        if (!userId && auth.displayName) {
            userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');
        }
        if (!userId) return;

        const ref = window.firebase.database().ref(`held_products/${_currentOrderId}/${product.ProductId}/${userId}`);
        await ref.transaction((current) => {
            const preservedIsDraft = current?.isDraft === true;
            return {
                productId: product.ProductId,
                displayName: auth.displayName || auth.userType || 'Unknown',
                quantity: product.Quantity || 1,
                isDraft: preservedIsDraft,
                isFromSearch: true,
                timestamp: window.firebase.database.ServerValue.TIMESTAMP,
                campaignName: window.currentChatOrderData?.LiveCampaignName || '',
                stt: window.currentChatOrderData?.SessionIndex || '',
                productName: product.ProductName || '',
                productNameGet: product.ProductNameGet || '',
                productCode: product.ProductCode || '',
                imageUrl: product.ImageUrl || '',
                price: product.Price || 0,
                uomName: product.UOMName || 'Cái'
            };
        });
    } catch (e) {
        console.warn('[ChatProducts] Firebase held sync error:', e);
    }
}

async function _removeFromFirebaseHeld(productId) {
    if (!window.firebase || !window.authManager || !_currentOrderId) return;

    try {
        const auth = window.authManager.getAuthState();
        if (!auth) return;

        let userId = auth.id || auth.Id || auth.username || auth.userType;
        if (!userId && auth.displayName) {
            userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');
        }
        if (!userId) return;

        const ref = window.firebase.database().ref(`held_products/${_currentOrderId}/${productId}/${userId}`);
        await ref.remove();
    } catch (e) {
        console.warn('[ChatProducts] Firebase held remove error:', e);
    }
}

async function _updateOrderOnBackend() {
    if (!_currentOrderId || !window.currentChatOrderData) return;

    try {
        const headers = await window.tokenManager?.getAuthHeader();
        if (!headers) return;

        const mainProducts = _orderProducts.filter(p => !p.IsHeld);
        const orderLines = mainProducts.map(p => ({
            ProductId: parseInt(p.ProductId),
            ProductName: p.ProductName || '',
            ProductNameGet: p.ProductNameGet || p.ProductName || '',
            Quantity: p.Quantity || 1,
            Price: p.Price || 0,
            UOMId: p.UOMId || 1,
            Factor: p.Factor || 1,
            Priority: p.Priority || 0,
            Note: p.Note || null,
            ProductUOMQty: p.Quantity || 1
        }));

        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${_currentOrderId})`;
        const response = await API_CONFIG.smartFetch(apiUrl, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                Details: orderLines
            })
        });

        if (!response.ok) {
            console.warn('[ChatProducts] Backend update failed:', response.status);
        } else {
            console.log('[ChatProducts] ✓ Order updated on backend');
        }
    } catch (e) {
        console.warn('[ChatProducts] Backend update error:', e);
    }
}

// =====================================================
// TAB 3: LỊCH SỬ (Order History)
// =====================================================

window.loadChatHistoryTab = async function() {
    if (_historyLoaded) return;
    _historyLoaded = true;

    const container = document.getElementById('chatHistoryList');
    if (!container) return;

    const phone = window.currentChatOrderData?.Phone
        || window.currentChatOrderData?.Partner?.Phone
        || '';

    if (!phone) {
        container.innerHTML = '<div class="chat-panel-empty">Không có số điện thoại để tra cứu</div>';
        return;
    }

    container.innerHTML = '<div class="chat-panel-empty"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';

    try {
        const db = window.getFirestore ? window.getFirestore() : (typeof initializeFirestore === 'function' ? initializeFirestore() : null);
        if (!db) {
            container.innerHTML = '<div class="chat-panel-empty">Firestore chưa khởi tạo</div>';
            return;
        }

        const normalizedPhone = phone.replace(/\D/g, '');
        const snapshot = await db.collection('order_creation_history')
            .where('_searchPhone', '==', normalizedPhone)
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();

        if (snapshot.empty) {
            container.innerHTML = '<div class="chat-panel-empty">Chưa có lịch sử đơn hàng</div>';
            return;
        }

        const records = [];
        snapshot.forEach(doc => records.push({ id: doc.id, ...doc.data() }));

        container.innerHTML = records.map(r => {
            const ref = r.reference || r.saleOnlineId || r.id;
            const date = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
            const dateStr = _formatDate(date);
            const amount = r.totalAmount || 0;
            const products = (r.products || []).map(p => `${p.name} x${p.quantity}`).join(', ');

            return `
                <div class="chat-history-card">
                    <div class="chat-history-header">
                        <span class="chat-history-ref">#${_escapeHtml(String(ref))}</span>
                        <span class="chat-history-date">${dateStr}</span>
                    </div>
                    <div class="chat-history-amount">${_formatCurrency(amount)}</div>
                    ${products ? `<div class="chat-history-products">${_escapeHtml(products)}</div>` : ''}
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('[ChatProducts] Load history error:', e);
        container.innerHTML = `<div class="chat-panel-empty">Lỗi: ${e.message}</div>`;
    }
};

// =====================================================
// TAB 4: HÓA ĐƠN (Invoice History)
// =====================================================

window.loadChatInvoicesTab = async function() {
    if (_invoicesLoaded) return;
    _invoicesLoaded = true;

    const container = document.getElementById('chatInvoiceList');
    if (!container) return;

    const phone = window.currentChatOrderData?.Phone
        || window.currentChatOrderData?.Partner?.Phone
        || '';

    if (!phone) {
        container.innerHTML = '<div class="chat-panel-empty">Không có số điện thoại để tra cứu</div>';
        return;
    }

    container.innerHTML = '<div class="chat-panel-empty"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';

    try {
        const headers = await window.tokenManager?.getAuthHeader();
        if (!headers) {
            container.innerHTML = '<div class="chat-panel-empty">Chưa đăng nhập</div>';
            return;
        }

        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder?$filter=Partner/Phone eq '${encodeURIComponent(phone)}'&$top=20&$orderby=DateCreated desc&$select=Id,Number,DateInvoice,AmountTotal,State,DateCreated`;

        const response = await API_CONFIG.smartFetch(apiUrl, {
            headers: { ...headers, 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });

        if (!response.ok) {
            container.innerHTML = '<div class="chat-panel-empty">Không tải được hóa đơn</div>';
            return;
        }

        const data = await response.json();
        const invoices = data.value || [];

        if (invoices.length === 0) {
            container.innerHTML = '<div class="chat-panel-empty">Chưa có hóa đơn</div>';
            return;
        }

        container.innerHTML = invoices.map(inv => {
            const number = inv.Number || inv.Id;
            const date = inv.DateInvoice || inv.DateCreated;
            const dateStr = date ? _formatDate(new Date(date)) : '';
            const amount = inv.AmountTotal || 0;
            const state = inv.State || '';

            const stateLabel = state === 'open' ? 'Mở' : state === 'paid' ? 'Đã thanh toán' : state === 'cancel' ? 'Hủy' : state;
            const stateColor = state === 'paid' ? '#059669' : state === 'cancel' ? '#ef4444' : '#6b7280';

            return `
                <div class="chat-history-card">
                    <div class="chat-history-header">
                        <span class="chat-history-ref">${_escapeHtml(String(number))}</span>
                        <span class="chat-history-date">${dateStr}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <span class="chat-history-amount">${_formatCurrency(amount)}</span>
                        <span style="font-size:11px;color:${stateColor};font-weight:500">${_escapeHtml(stateLabel)}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('[ChatProducts] Load invoices error:', e);
        container.innerHTML = `<div class="chat-panel-empty">Lỗi: ${e.message}</div>`;
    }
};

// =====================================================
// HELPERS
// =====================================================

function _formatCurrency(amount) {
    if (!amount && amount !== 0) return '0đ';
    return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

function _formatDate(date) {
    if (!date || isNaN(date.getTime())) return '';
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${d}/${m}/${y} ${h}:${min}`;
}

function _escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _escapeJs(str) {
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function _showError(msg) {
    if (window.showNotification) {
        window.showNotification(msg, 'error');
    } else {
        console.error('[ChatProducts]', msg);
    }
}

// =====================================================
// HOOK INTO TAB SWITCHING
// switchChatPanelTab is defined in dropped-products-manager.js
// We wrap it to add history/invoice loading
// =====================================================

(function() {
    const _origSwitchTab = window.switchChatPanelTab;
    if (_origSwitchTab) {
        window.switchChatPanelTab = function(tabName) {
            _origSwitchTab(tabName);
            // Load history/invoices on first tab switch
            if (tabName === 'history' && window.loadChatHistoryTab) {
                window.loadChatHistoryTab();
            } else if (tabName === 'invoice_history' && window.loadChatInvoicesTab) {
                window.loadChatInvoicesTab();
            }
        };
    }
})();

// Backward compatibility stubs
window.removeChatProduct = window.removeChatProduct || function(productId) {
    window.decreaseMainProductQty(productId);
};

window.updateChatProductQuantity = window.updateChatProductQuantity || function(productId, qty) {
    const product = _orderProducts.find(p => parseInt(p.ProductId) === parseInt(productId));
    if (product) {
        product.Quantity = qty;
        _renderAllProducts();
    }
};

window.saveChatProductsToFirebase = window.saveChatProductsToFirebase || function() {
    console.log('[ChatProducts] saveChatProductsToFirebase - no-op (real-time sync)');
};

console.log('[ChatProducts-UI] Loaded.');
