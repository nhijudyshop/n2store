/* =====================================================
   CHAT PRODUCTS UI - Right panel product management
   Tabs: Đơn hàng, Hàng rớt-xả, Lịch sử, Hóa đơn
   ===================================================== */

console.log('[ChatProducts-UI] Loading...');

// =====================================================
// STATE
// =====================================================
let _currentTab = 'orders';
let _orderProducts = [];
let _searchQuery = '';

// =====================================================
// TAB MANAGEMENT
// =====================================================

window.switchProductTab = function(tabName) {
    _currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.chat-right-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.chat-right-tab-content').forEach(content => {
        content.classList.toggle('active', content.dataset.tab === tabName);
    });

    // Load data for tab on first switch
    if (tabName === 'dropped') _loadDroppedTab();
    if (tabName === 'history') _loadHistoryTab();
    if (tabName === 'invoices') _loadInvoicesTab();
};

// =====================================================
// TOGGLE RIGHT PANEL
// =====================================================

window.toggleChatRightPanel = function() {
    const panel = document.getElementById('chatRightPanel');
    if (panel) panel.classList.toggle('hidden');
};

// =====================================================
// TAB 1: ĐƠN HÀNG (Products)
// =====================================================

window.initProductPanel = function(orderData) {
    if (!orderData) return;

    _orderProducts = orderData.Details || [];
    _searchQuery = '';
    _currentTab = 'orders';

    // Reset search
    const searchInput = document.getElementById('chatProductSearchInput');
    if (searchInput) searchInput.value = '';

    // Reset tabs
    window.switchProductTab('orders');

    // Render products
    _renderProducts(_orderProducts);

    // Update badge
    const badge = document.getElementById('tabBadgeOrders');
    if (badge) badge.textContent = _orderProducts.length || '';
};

function _renderProducts(products) {
    const container = document.getElementById('chatProductList');
    if (!container) return;

    const filtered = _searchQuery
        ? products.filter(p => {
            const q = _searchQuery.toLowerCase();
            return (p.ProductName || '').toLowerCase().includes(q)
                || (p.ProductCode || '').toLowerCase().includes(q);
        })
        : products;

    if (filtered.length === 0) {
        container.innerHTML = '<div class="chat-panel-empty">Không có sản phẩm</div>';
        _updateTotals([]);
        return;
    }

    container.innerHTML = filtered.map(p => _renderProductCard(p)).join('');
    _updateTotals(filtered);
}

function _renderProductCard(product) {
    const name = product.ProductName || 'Sản phẩm';
    const code = product.ProductCode || '';
    const qty = product.Quantity || 1;
    const price = product.Price || 0;
    const imgUrl = product.ImageUrl || '';
    const uomName = product.UOMName || '';

    const imgHtml = imgUrl
        ? `<img class="chat-product-img" src="${_escapeHtml(imgUrl)}" alt="" onerror="this.style.display='none'">`
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
                <span>${qty}</span>
            </div>
        </div>
    `;
}

function _updateTotals(products) {
    const totalAmount = products.reduce((sum, p) => sum + (p.Price || 0) * (p.Quantity || 1), 0);
    const totalQty = products.reduce((sum, p) => sum + (p.Quantity || 1), 0);

    const totalEl = document.getElementById('chatProductTotal');
    if (totalEl) totalEl.textContent = _formatCurrency(totalAmount);

    const countEl = document.getElementById('chatProductCount');
    if (countEl) countEl.textContent = `${totalQty} sản phẩm`;
}

window.searchChatProducts = function(query) {
    _searchQuery = query;
    _renderProducts(_orderProducts);
};

// =====================================================
// TAB 2: HÀNG RỚT - XẢ (Dropped Products)
// =====================================================

let _droppedLoaded = false;

function _loadDroppedTab() {
    if (_droppedLoaded) return;
    _droppedLoaded = true;

    const container = document.getElementById('chatDroppedList');
    if (!container) return;

    // Use existing dropped products manager
    const droppedProducts = window.getDroppedProducts ? window.getDroppedProducts() : [];

    if (droppedProducts.length === 0) {
        container.innerHTML = '<div class="chat-panel-empty">Không có hàng rớt</div>';
        return;
    }

    const badge = document.getElementById('tabBadgeDropped');
    if (badge) badge.textContent = droppedProducts.length;

    container.innerHTML = droppedProducts.map(p => {
        const name = p.productName || p.ProductName || 'Sản phẩm';
        const code = p.productCode || p.ProductCode || '';
        const qty = p.quantity || p.Quantity || 1;
        const price = p.price || p.Price || 0;

        return `
            <div class="chat-product-card">
                <div class="chat-product-img" style="display:flex;align-items:center;justify-content:center;color:#f59e0b;font-size:16px;background:#fffbeb">
                    <i class="fas fa-box-open"></i>
                </div>
                <div class="chat-product-info">
                    <div class="chat-product-name" title="${_escapeHtml(name)}">${_escapeHtml(name)}</div>
                    ${code ? `<div class="chat-product-variant">${_escapeHtml(code)}</div>` : ''}
                    <div class="chat-product-price">${_formatCurrency(price)}</div>
                </div>
                <div class="chat-product-qty">
                    <span>${qty}</span>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// TAB 3: LỊCH SỬ (Order History)
// =====================================================

let _historyLoaded = false;

async function _loadHistoryTab() {
    if (_historyLoaded) return;
    _historyLoaded = true;

    const container = document.getElementById('chatHistoryList');
    if (!container) return;

    // Get customer phone from current order data
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

        // Query order_creation_history by phone
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
}

// =====================================================
// TAB 4: HÓA ĐƠN (Invoice History)
// =====================================================

let _invoicesLoaded = false;

async function _loadInvoicesTab() {
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
        // Fetch invoices from TPOS API via partner phone search
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
}

// =====================================================
// CLEANUP (called when modal closes)
// =====================================================

window.cleanupProductPanel = function() {
    _orderProducts = [];
    _searchQuery = '';
    _droppedLoaded = false;
    _historyLoaded = false;
    _invoicesLoaded = false;
    _currentTab = 'orders';
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

// Stubs for backward compatibility
window.removeChatProduct = window.removeChatProduct || function(productId) {
    console.log('[ChatProducts] removeChatProduct called:', productId);
};

window.updateChatProductQuantity = window.updateChatProductQuantity || function(productId, qty) {
    console.log('[ChatProducts] updateChatProductQuantity called:', productId, qty);
};

window.saveChatProductsToFirebase = window.saveChatProductsToFirebase || function() {
    console.log('[ChatProducts] saveChatProductsToFirebase called');
};

console.log('[ChatProducts-UI] Loaded.');
