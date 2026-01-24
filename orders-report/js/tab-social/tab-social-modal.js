/**
 * Tab Social Orders - Modal Module
 * Create/Edit order modal functionality
 */

// ===== MODAL STATE =====
let isEditMode = false;
let currentOrderProducts = [];

// ===== MOCK PRODUCTS FOR SEARCH =====
const MOCK_PRODUCTS = [
    { productId: 'p1', name: 'Áo thun trắng', code: 'AT001', price: 150000 },
    { productId: 'p2', name: 'Quần jean xanh', code: 'QJ002', price: 350000 },
    { productId: 'p3', name: 'Váy hoa', code: 'VH003', price: 450000 },
    { productId: 'p4', name: 'Giày sneaker', code: 'GS004', price: 890000 },
    { productId: 'p5', name: 'Túi xách', code: 'TX005', price: 550000 },
    { productId: 'p6', name: 'Ví da', code: 'VD006', price: 250000 },
    { productId: 'p7', name: 'Áo khoác', code: 'AK007', price: 750000 },
    { productId: 'p8', name: 'Áo sơ mi trắng', code: 'ASM008', price: 280000 },
    { productId: 'p9', name: 'Quần tây đen', code: 'QT009', price: 420000 },
    { productId: 'p10', name: 'Đầm maxi', code: 'DM010', price: 680000 },
];

// ===== OPEN MODAL =====
function openCreateOrderModal() {
    isEditMode = false;
    currentOrderProducts = [];

    // Reset form
    document.getElementById('orderForm')?.reset();
    document.getElementById('orderId').value = '';
    document.getElementById('orderProducts').value = '[]';

    // Update title
    const title = document.getElementById('orderModalTitle');
    if (title) {
        title.innerHTML = '<i class="fas fa-plus-circle"></i> Tạo đơn hàng mới';
    }

    // Clear products list
    renderOrderProducts();
    updateProductsSummary();

    // Show modal
    const modal = document.getElementById('orderModalOverlay');
    if (modal) {
        modal.classList.add('show');
    }
}

function openEditOrderModal(orderId) {
    isEditMode = true;

    const order = SocialOrderState.orders.find((o) => o.id === orderId);
    if (!order) {
        showNotification('Không tìm thấy đơn hàng', 'error');
        return;
    }

    SocialOrderState.currentEditingOrder = order;
    currentOrderProducts = [...(order.products || [])];

    // Fill form
    document.getElementById('orderId').value = order.id;
    document.getElementById('customerName').value = order.customerName || '';
    document.getElementById('customerPhone').value = order.phone || '';
    document.getElementById('customerAddress').value = order.address || '';
    document.getElementById('postUrl').value = order.postUrl || '';
    document.getElementById('orderSource').value = order.source || 'manual';
    document.getElementById('orderNote').value = order.note || '';
    document.getElementById('orderProducts').value = JSON.stringify(order.products || []);

    // Update title
    const title = document.getElementById('orderModalTitle');
    if (title) {
        title.innerHTML = `<i class="fas fa-edit"></i> Sửa đơn hàng ${order.id}`;
    }

    // Render products
    renderOrderProducts();
    updateProductsSummary();

    // Show modal
    const modal = document.getElementById('orderModalOverlay');
    if (modal) {
        modal.classList.add('show');
    }
}

function closeOrderModal() {
    const modal = document.getElementById('orderModalOverlay');
    if (modal) {
        modal.classList.remove('show');
    }

    // Clear search results
    const searchResults = document.getElementById('productSearchResults');
    if (searchResults) {
        searchResults.classList.remove('show');
        searchResults.innerHTML = '';
    }

    SocialOrderState.currentEditingOrder = null;
    currentOrderProducts = [];
}

// ===== PRODUCT SEARCH =====
function searchProducts() {
    const input = document.getElementById('productSearchInput');
    const resultsContainer = document.getElementById('productSearchResults');

    if (!input || !resultsContainer) return;

    const term = input.value.toLowerCase().trim();

    if (term.length < 1) {
        resultsContainer.classList.remove('show');
        resultsContainer.innerHTML = '';
        return;
    }

    // Search mock products
    const results = MOCK_PRODUCTS.filter(
        (p) => p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term)
    ).slice(0, 5);

    if (results.length === 0) {
        resultsContainer.innerHTML =
            '<div class="product-search-item" style="color: #9ca3af;">Không tìm thấy sản phẩm</div>';
    } else {
        resultsContainer.innerHTML = results
            .map(
                (p) => `
            <div class="product-search-item" onclick="addProductToOrder('${p.productId}')">
                <div>
                    <div style="font-weight: 500;">${p.name}</div>
                    <div style="font-size: 11px; color: #6b7280;">${p.code}</div>
                </div>
                <div style="font-weight: 600; color: #8b5cf6;">${formatCurrency(p.price)}</div>
            </div>
        `
            )
            .join('');
    }

    resultsContainer.classList.add('show');
}

function addProductToOrder(productId) {
    const product = MOCK_PRODUCTS.find((p) => p.productId === productId);
    if (!product) return;

    // Check if already in list
    const existing = currentOrderProducts.find((p) => p.productId === productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        currentOrderProducts.push({
            ...product,
            quantity: 1,
        });
    }

    // Clear search
    document.getElementById('productSearchInput').value = '';
    document.getElementById('productSearchResults').classList.remove('show');

    // Re-render
    renderOrderProducts();
    updateProductsSummary();
}

function removeProductFromOrder(productId) {
    currentOrderProducts = currentOrderProducts.filter((p) => p.productId !== productId);
    renderOrderProducts();
    updateProductsSummary();
}

function updateProductQuantity(productId, quantity) {
    const product = currentOrderProducts.find((p) => p.productId === productId);
    if (product) {
        product.quantity = Math.max(1, parseInt(quantity) || 1);
    }
    updateProductsSummary();
}

// ===== RENDER PRODUCTS IN MODAL =====
function renderOrderProducts() {
    const container = document.getElementById('orderProductsList');
    if (!container) return;

    if (currentOrderProducts.length === 0) {
        container.innerHTML = `
            <div class="products-empty">
                <i class="fas fa-shopping-basket"></i>
                <p>Chưa có sản phẩm. Tìm kiếm để thêm.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = currentOrderProducts
        .map(
            (p) => `
        <div class="product-item">
            <div class="product-item-info">
                <div class="product-item-name">${p.name}</div>
                <div class="product-item-code">${p.code}</div>
            </div>
            <div class="product-item-qty">
                <span>x</span>
                <input type="number" 
                       min="1" 
                       value="${p.quantity}" 
                       onchange="updateProductQuantity('${p.productId}', this.value)"
                       style="width: 50px; text-align: center;">
            </div>
            <div class="product-item-price">${formatCurrency(p.price * p.quantity)}</div>
            <button class="product-item-remove" onclick="removeProductFromOrder('${p.productId}')">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `
        )
        .join('');
}

function updateProductsSummary() {
    const totalQty = currentOrderProducts.reduce((sum, p) => sum + p.quantity, 0);
    const totalAmount = currentOrderProducts.reduce((sum, p) => sum + p.price * p.quantity, 0);

    const qtyEl = document.getElementById('summaryQuantity');
    const totalEl = document.getElementById('summaryTotal');

    if (qtyEl) qtyEl.textContent = totalQty + ' cái';
    if (totalEl) totalEl.textContent = formatCurrency(totalAmount);
}

// ===== SAVE ORDER =====
function saveOrder() {
    const customerName = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const address = document.getElementById('customerAddress').value.trim();
    const postUrl = document.getElementById('postUrl').value.trim();
    const source = document.getElementById('orderSource').value;
    const note = document.getElementById('orderNote').value.trim();
    const orderId = document.getElementById('orderId').value;

    // Validation
    if (!customerName) {
        showNotification('Vui lòng nhập tên khách hàng', 'error');
        document.getElementById('customerName').focus();
        return;
    }

    if (!phone) {
        showNotification('Vui lòng nhập số điện thoại', 'error');
        document.getElementById('customerPhone').focus();
        return;
    }

    // Calculate totals
    const totalQuantity = currentOrderProducts.reduce((sum, p) => sum + p.quantity, 0);
    const totalAmount = currentOrderProducts.reduce((sum, p) => sum + p.price * p.quantity, 0);

    // Generate post label from URL
    let postLabel = '';
    if (postUrl) {
        const now = new Date();
        const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}`;
        const sourceLabel =
            source === 'facebook_post'
                ? 'FB'
                : source === 'instagram'
                  ? 'IG'
                  : source === 'tiktok'
                    ? 'TT'
                    : 'Post';
        postLabel = `${sourceLabel} ${dateStr}`;
    }

    if (isEditMode && orderId) {
        // Update existing order
        const orderIndex = SocialOrderState.orders.findIndex((o) => o.id === orderId);
        if (orderIndex > -1) {
            const existingOrder = SocialOrderState.orders[orderIndex];
            SocialOrderState.orders[orderIndex] = {
                ...existingOrder,
                customerName,
                phone,
                address,
                postUrl,
                postLabel,
                source,
                products: [...currentOrderProducts],
                totalQuantity,
                totalAmount,
                note,
                updatedAt: Date.now(),
            };
            showNotification('Đã cập nhật đơn hàng', 'success');
        }
    } else {
        // Create new order
        const newOrder = {
            id: generateOrderId(),
            stt: SocialOrderState.orders.length + 1,
            customerName,
            phone,
            address,
            postUrl,
            postLabel,
            source,
            products: [...currentOrderProducts],
            totalQuantity,
            totalAmount,
            tags: [],
            status: 'draft',
            note,
            pageId: '',
            psid: '',
            conversationId: '',
            assignedUserId: '',
            assignedUserName: '',
            createdBy: 'admin',
            createdByName: 'Admin',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        SocialOrderState.orders.unshift(newOrder);
        showNotification('Đã tạo đơn hàng mới', 'success');
    }

    // Close modal and refresh
    closeOrderModal();
    performTableSearch();
}

// ===== CLOSE MODAL ON OUTSIDE CLICK =====
document.addEventListener('click', function (e) {
    const modalOverlay = document.getElementById('orderModalOverlay');
    if (e.target === modalOverlay) {
        closeOrderModal();
    }

    // Close product search results when clicking outside
    const searchResults = document.getElementById('productSearchResults');
    const searchInput = document.getElementById('productSearchInput');
    if (searchResults && !searchResults.contains(e.target) && e.target !== searchInput) {
        searchResults.classList.remove('show');
    }
});

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', function (e) {
    // ESC to close modal
    if (e.key === 'Escape') {
        closeOrderModal();
        closeTagModal();
        closeConfirmDeleteModal();
    }
});

// ===== EXPORTS =====
window.openCreateOrderModal = openCreateOrderModal;
window.openEditOrderModal = openEditOrderModal;
window.closeOrderModal = closeOrderModal;
window.searchProducts = searchProducts;
window.addProductToOrder = addProductToOrder;
window.removeProductFromOrder = removeProductFromOrder;
window.updateProductQuantity = updateProductQuantity;
window.saveOrder = saveOrder;
