/**
 * TAB SOCIAL ORDERS - Main JavaScript
 * Quản lý đơn hàng nháp từ các kênh mạng xã hội
 */

// =====================================================
// CONFIGURATION
// =====================================================
const SOCIAL_API_BASE = 'https://n2store-fallback.onrender.com/api/social-orders';
const REALTIME_API_BASE = 'https://n2store-realtime.onrender.com';

// =====================================================
// STATE
// =====================================================
let socialOrders = [];
let filteredOrders = [];
let currentPage = 1;
let totalPages = 1;
let pageSize = 50;
let sortBy = 'created_at';
let sortOrder = 'DESC';
let currentEditOrder = null;
let availableTags = [];
let currentUserId = null;
let currentUserName = null;

// =====================================================
// INITIALIZATION
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[SOCIAL-ORDERS] Initializing...');

    // Get user info from auth
    await loadUserInfo();

    // Load initial data
    await loadOrders();
    await loadStats();
    await loadAvailableTags();

    // Setup event listeners
    setupEventListeners();

    console.log('[SOCIAL-ORDERS] Initialized successfully');
});

/**
 * Load user info from auth system
 */
async function loadUserInfo() {
    try {
        // Try to get from parent window (main.html)
        if (window.parent && window.parent.authManager) {
            const auth = window.parent.authManager;
            currentUserId = auth.getUserId();
            currentUserName = auth.getUserName?.() || 'Unknown';
        } else {
            // Fallback to localStorage
            const authData = localStorage.getItem('loginindex_auth');
            if (authData) {
                const parsed = JSON.parse(authData);
                currentUserId = parsed.userId || parsed.id;
                currentUserName = parsed.userName || parsed.name || 'Unknown';
            }
        }
    } catch (err) {
        console.error('[SOCIAL-ORDERS] Failed to load user info:', err);
    }
}

// =====================================================
// API FUNCTIONS
// =====================================================

/**
 * Load orders from API
 */
async function loadOrders(options = {}) {
    try {
        showLoading(true);

        const params = new URLSearchParams({
            page: options.page || currentPage,
            limit: pageSize,
            sort_by: sortBy,
            sort_order: sortOrder,
        });

        // Add filters
        const statusFilter = document.getElementById('filterStatus')?.value;
        const sourceFilter = document.getElementById('filterSource')?.value;
        const searchFilter = document.getElementById('filterSearch')?.value;

        if (statusFilter) params.append('status', statusFilter);
        if (sourceFilter) params.append('source', sourceFilter);
        if (searchFilter) params.append('search', searchFilter);

        const response = await fetch(`${SOCIAL_API_BASE}?${params}`);
        const data = await response.json();

        if (data.success) {
            socialOrders = data.data;
            filteredOrders = socialOrders;
            currentPage = data.pagination.page;
            totalPages = data.pagination.totalPages;

            renderTable();
            renderPagination();
        } else {
            showNotification('Lỗi tải đơn hàng: ' + data.error, 'error');
        }
    } catch (err) {
        console.error('[SOCIAL-ORDERS] Load orders error:', err);
        showNotification('Lỗi kết nối server', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Load statistics
 */
async function loadStats() {
    try {
        const response = await fetch(`${SOCIAL_API_BASE}/stats`);
        const data = await response.json();

        if (data.success) {
            const stats = data.data;
            document.getElementById('statTotalOrders').textContent = formatNumber(
                stats.total_orders || 0
            );
            document.getElementById('statTotalProducts').textContent = formatNumber(
                stats.total_products || 0
            );
            document.getElementById('statTotalAmount').textContent = formatCurrency(
                stats.total_amount || 0
            );
            document.getElementById('statUniqueCustomers').textContent = formatNumber(
                stats.unique_customers || 0
            );
        }
    } catch (err) {
        console.error('[SOCIAL-ORDERS] Load stats error:', err);
    }
}

/**
 * Load available tags from TPOS (for consistency with tab1)
 */
async function loadAvailableTags() {
    try {
        // Try to get tags from parent or shared storage
        const cachedTags = localStorage.getItem('tpos_tags_cache');
        if (cachedTags) {
            availableTags = JSON.parse(cachedTags);
        }
    } catch (err) {
        console.error('[SOCIAL-ORDERS] Load tags error:', err);
    }
}

/**
 * Create new order
 */
async function createOrder(orderData) {
    try {
        const response = await fetch(SOCIAL_API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...orderData,
                created_by: currentUserId,
                created_by_name: currentUserName,
            }),
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Tạo đơn hàng thành công!', 'success');
            closeCreateModal();
            await loadOrders();
            await loadStats();
            return data.data;
        } else {
            showNotification('Lỗi tạo đơn: ' + data.error, 'error');
            return null;
        }
    } catch (err) {
        console.error('[SOCIAL-ORDERS] Create order error:', err);
        showNotification('Lỗi kết nối server', 'error');
        return null;
    }
}

/**
 * Update order
 */
async function updateOrder(orderId, updates) {
    try {
        const response = await fetch(`${SOCIAL_API_BASE}/${orderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...updates,
                updated_by: currentUserId,
                updated_by_name: currentUserName,
            }),
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Cập nhật thành công!', 'success');
            await loadOrders();
            await loadStats();
            return data.data;
        } else {
            showNotification('Lỗi cập nhật: ' + data.error, 'error');
            return null;
        }
    } catch (err) {
        console.error('[SOCIAL-ORDERS] Update order error:', err);
        showNotification('Lỗi kết nối server', 'error');
        return null;
    }
}

/**
 * Delete order
 */
async function deleteOrder(orderId) {
    try {
        const response = await fetch(`${SOCIAL_API_BASE}/${orderId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deleted_by: currentUserId,
                deleted_by_name: currentUserName,
            }),
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Xóa đơn thành công!', 'success');
            await loadOrders();
            await loadStats();
        } else {
            showNotification('Lỗi xóa đơn: ' + data.error, 'error');
        }
    } catch (err) {
        console.error('[SOCIAL-ORDERS] Delete order error:', err);
        showNotification('Lỗi kết nối server', 'error');
    }
}

/**
 * Add tag to order
 */
async function addTagToOrder(orderId, tag) {
    try {
        const response = await fetch(`${SOCIAL_API_BASE}/${orderId}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tag,
                updated_by: currentUserId,
                updated_by_name: currentUserName,
            }),
        });

        const data = await response.json();

        if (data.success) {
            // Update local state
            const order = socialOrders.find((o) => o.id === orderId);
            if (order) {
                order.tags = data.data.tags;
                renderTable();
            }
        }

        return data.success;
    } catch (err) {
        console.error('[SOCIAL-ORDERS] Add tag error:', err);
        return false;
    }
}

/**
 * Remove tag from order
 */
async function removeTagFromOrder(orderId, tagId) {
    try {
        const response = await fetch(`${SOCIAL_API_BASE}/${orderId}/tags/${tagId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                updated_by: currentUserId,
                updated_by_name: currentUserName,
            }),
        });

        const data = await response.json();

        if (data.success) {
            // Update local state
            const order = socialOrders.find((o) => o.id === orderId);
            if (order) {
                order.tags = data.data.tags;
                renderTable();
            }
        }

        return data.success;
    } catch (err) {
        console.error('[SOCIAL-ORDERS] Remove tag error:', err);
        return false;
    }
}

// =====================================================
// RENDER FUNCTIONS
// =====================================================

/**
 * Render orders table
 */
function renderTable() {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;

    if (filteredOrders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10">
                    <div class="social-empty-state">
                        <i class="fas fa-inbox"></i>
                        <h3>Chưa có đơn hàng</h3>
                        <p>Nhấn "Tạo đơn mới" để bắt đầu</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredOrders
        .map((order, index) => {
            const stt = order.stt || (currentPage - 1) * pageSize + index + 1;
            const products = order.products || [];
            const tags = order.tags || [];

            return `
            <tr data-order-id="${order.id}">
                <td class="stt">${stt}</td>
                <td class="order-code">${order.order_code}</td>
                <td class="customer">
                    <span class="social-customer-name">${escapeHtml(order.customer_name || 'Chưa có tên')}</span>
                    <span class="social-customer-phone">${order.phone || ''}</span>
                </td>
                <td class="products">
                    <span class="social-product-count">${products.length} SP</span>
                    <span style="color: #6b7280; font-size: 12px;">(${order.total_quantity || 0} cái)</span>
                </td>
                <td class="amount">${formatCurrency(order.total_amount || 0)}</td>
                <td>${renderStatusBadge(order.status)}</td>
                <td>${renderSourceBadge(order.source)}</td>
                <td class="social-tags-cell">${renderTags(tags, order.id)}</td>
                <td>
                    ${order.assigned_user_name || '<span style="color: #9ca3af;">-</span>'}
                </td>
                <td class="social-actions-cell">
                    ${
                        order.psid
                            ? `
                        <button class="social-action-btn chat" onclick="openChatModal(${order.id})" title="Chat">
                            <i class="fas fa-comment"></i>
                        </button>
                    `
                            : ''
                    }
                    <button class="social-action-btn tag" onclick="openTagModal(${order.id})" title="Gán tag">
                        <i class="fas fa-tag"></i>
                    </button>
                    <button class="social-action-btn edit" onclick="openEditModal(${order.id})" title="Sửa">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="social-action-btn delete" onclick="confirmDeleteOrder(${order.id})" title="Xóa">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
        })
        .join('');
}

/**
 * Render status badge
 */
function renderStatusBadge(status) {
    const statusMap = {
        draft: { label: 'Nháp', class: 'draft' },
        processing: { label: 'Đang xử lý', class: 'processing' },
        completed: { label: 'Hoàn thành', class: 'completed' },
        cancelled: { label: 'Đã hủy', class: 'cancelled' },
    };

    const info = statusMap[status] || statusMap.draft;
    return `<span class="social-status-badge social-status-${info.class}">${info.label}</span>`;
}

/**
 * Render source badge
 */
function renderSourceBadge(source) {
    const sourceMap = {
        manual: { label: 'Thủ công', icon: 'fa-hand-pointer', color: '#6b7280' },
        facebook_post: { label: 'FB Post', icon: 'fa-facebook', color: '#1877f2' },
        instagram: { label: 'Instagram', icon: 'fa-instagram', color: '#e4405f' },
        tiktok: { label: 'TikTok', icon: 'fa-tiktok', color: '#000000' },
        pancake_import: { label: 'Pancake', icon: 'fa-comments', color: '#ff6b35' },
    };

    const info = sourceMap[source] || sourceMap.manual;
    return `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: ${info.color};">
        <i class="fab ${info.icon}"></i> ${info.label}
    </span>`;
}

/**
 * Render tags
 */
function renderTags(tags, orderId) {
    if (!tags || tags.length === 0) {
        return '<span style="color: #9ca3af; font-size: 12px;">-</span>';
    }

    return (
        tags
            .slice(0, 3)
            .map((tag) => {
                const bgColor = tag.color || '#e5e7eb';
                const textColor = getContrastColor(bgColor);
                return `<span class="social-tag" style="background: ${bgColor}; color: ${textColor};" title="${escapeHtml(tag.name || '')}">${escapeHtml(tag.name || '')}</span>`;
            })
            .join('') +
        (tags.length > 3 ? `<span class="social-tag">+${tags.length - 3}</span>` : '')
    );
}

/**
 * Render pagination
 */
function renderPagination() {
    const container = document.getElementById('paginationContainer');
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = `<div style="display: flex; justify-content: center; gap: 8px; padding: 16px;">`;

    // Previous button
    html += `<button class="social-btn social-btn-secondary" ${currentPage <= 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">
        <i class="fas fa-chevron-left"></i>
    </button>`;

    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="social-btn ${i === currentPage ? 'social-btn-primary' : 'social-btn-secondary'}" onclick="goToPage(${i})">${i}</button>`;
    }

    // Next button
    html += `<button class="social-btn social-btn-secondary" ${currentPage >= totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">
        <i class="fas fa-chevron-right"></i>
    </button>`;

    html += `</div>`;
    container.innerHTML = html;
}

/**
 * Go to specific page
 */
function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    loadOrders({ page });
}

// =====================================================
// MODAL FUNCTIONS
// =====================================================

/**
 * Open create order modal
 */
function openCreateModal() {
    currentEditOrder = null;
    document.getElementById('modalTitle').textContent = 'Tạo đơn hàng mới';
    document.getElementById('orderForm').reset();
    document.getElementById('productsList').innerHTML = '';
    updateProductTotals();
    document.getElementById('orderModalOverlay').classList.add('show');
}

/**
 * Open edit order modal
 */
async function openEditModal(orderId) {
    try {
        const response = await fetch(`${SOCIAL_API_BASE}/${orderId}`);
        const data = await response.json();

        if (!data.success) {
            showNotification('Lỗi tải đơn hàng', 'error');
            return;
        }

        currentEditOrder = data.data;
        document.getElementById('modalTitle').textContent =
            `Sửa đơn: ${currentEditOrder.order_code}`;

        // Fill form
        document.getElementById('customerName').value = currentEditOrder.customer_name || '';
        document.getElementById('customerPhone').value = currentEditOrder.phone || '';
        document.getElementById('customerAddress').value = currentEditOrder.address || '';
        document.getElementById('extraAddress').value = currentEditOrder.extra_address || '';
        document.getElementById('orderStatus').value = currentEditOrder.status || 'draft';
        document.getElementById('orderSource').value = currentEditOrder.source || 'manual';
        document.getElementById('orderNote').value = currentEditOrder.note || '';
        document.getElementById('shippingFee').value = currentEditOrder.shipping_fee || 0;
        document.getElementById('discount').value = currentEditOrder.discount || 0;

        // Render products
        renderProductsInModal(currentEditOrder.products || []);

        document.getElementById('orderModalOverlay').classList.add('show');
    } catch (err) {
        console.error('[SOCIAL-ORDERS] Open edit modal error:', err);
        showNotification('Lỗi kết nối server', 'error');
    }
}

/**
 * Close create/edit modal
 */
function closeCreateModal() {
    document.getElementById('orderModalOverlay').classList.remove('show');
    currentEditOrder = null;
}

/**
 * Save order (create or update)
 */
async function saveOrder() {
    const orderData = {
        customer_name: document.getElementById('customerName').value.trim(),
        phone: document.getElementById('customerPhone').value.trim(),
        address: document.getElementById('customerAddress').value.trim(),
        extra_address: document.getElementById('extraAddress').value.trim(),
        status: document.getElementById('orderStatus').value,
        source: document.getElementById('orderSource').value,
        note: document.getElementById('orderNote').value.trim(),
        shipping_fee: parseFloat(document.getElementById('shippingFee').value) || 0,
        discount: parseFloat(document.getElementById('discount').value) || 0,
        products: getProductsFromModal(),
    };

    if (currentEditOrder) {
        // Update existing
        await updateOrder(currentEditOrder.id, orderData);
    } else {
        // Create new
        await createOrder(orderData);
    }

    closeCreateModal();
}

/**
 * Render products in modal
 */
function renderProductsInModal(products) {
    const container = document.getElementById('productsList');

    if (!products || products.length === 0) {
        container.innerHTML =
            '<p style="text-align: center; color: #9ca3af; padding: 20px;">Chưa có sản phẩm. Tìm kiếm để thêm.</p>';
        updateProductTotals();
        return;
    }

    container.innerHTML = `
        <div class="social-products-list">
            <div class="social-products-list-header">
                <span>Sản phẩm</span>
                <span style="text-align: center;">SL</span>
                <span style="text-align: right;">Giá</span>
                <span style="text-align: right;">Thành tiền</span>
                <span></span>
            </div>
            ${products
                .map(
                    (p, index) => `
                <div class="social-product-row" data-index="${index}">
                    <div>
                        <div style="font-weight: 500;">${escapeHtml(p.name || '')}</div>
                        <div style="font-size: 11px; color: #6b7280;">${p.code || ''}</div>
                    </div>
                    <input type="number" class="product-qty" value="${p.quantity || 1}" min="1" onchange="updateProductQty(${index}, this.value)">
                    <div style="text-align: right;">${formatCurrency(p.price || 0)}</div>
                    <div style="text-align: right; font-weight: 600;">${formatCurrency((p.quantity || 1) * (p.price || 0))}</div>
                    <button class="social-product-remove" onclick="removeProductFromModal(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `
                )
                .join('')}
        </div>
    `;

    updateProductTotals();
}

/**
 * Get products from modal form
 */
function getProductsFromModal() {
    const container = document.getElementById('productsList');
    const rows = container.querySelectorAll('.social-product-row');
    const products = [];

    rows.forEach((row) => {
        const index = parseInt(row.dataset.index);
        if (currentEditOrder && currentEditOrder.products[index]) {
            const p = currentEditOrder.products[index];
            const qty = parseInt(row.querySelector('.product-qty').value) || 1;
            products.push({
                ...p,
                quantity: qty,
            });
        }
    });

    return products;
}

/**
 * Update product quantity
 */
function updateProductQty(index, value) {
    if (currentEditOrder && currentEditOrder.products[index]) {
        currentEditOrder.products[index].quantity = parseInt(value) || 1;
        renderProductsInModal(currentEditOrder.products);
    }
}

/**
 * Remove product from modal
 */
function removeProductFromModal(index) {
    if (currentEditOrder && currentEditOrder.products) {
        currentEditOrder.products.splice(index, 1);
        renderProductsInModal(currentEditOrder.products);
    }
}

/**
 * Update product totals
 */
function updateProductTotals() {
    let totalQty = 0;
    let totalAmount = 0;

    if (currentEditOrder && currentEditOrder.products) {
        currentEditOrder.products.forEach((p) => {
            totalQty += parseInt(p.quantity) || 0;
            totalAmount += (parseInt(p.quantity) || 0) * (parseFloat(p.price) || 0);
        });
    }

    const shippingFee = parseFloat(document.getElementById('shippingFee')?.value) || 0;
    const discount = parseFloat(document.getElementById('discount')?.value) || 0;
    const finalAmount = totalAmount + shippingFee - discount;

    const totalDisplay = document.getElementById('productTotals');
    if (totalDisplay) {
        totalDisplay.innerHTML = `
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-top: 1px solid #e5e7eb;">
                <span>Tổng SL:</span>
                <strong>${totalQty} cái</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                <span>Tổng tiền hàng:</span>
                <strong>${formatCurrency(totalAmount)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                <span>Phí ship:</span>
                <span>${formatCurrency(shippingFee)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                <span>Giảm giá:</span>
                <span>-${formatCurrency(discount)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px 0; border-top: 2px solid #e5e7eb; font-size: 16px;">
                <strong>Thành tiền:</strong>
                <strong style="color: #10b981;">${formatCurrency(finalAmount)}</strong>
            </div>
        `;
    }
}

/**
 * Confirm delete order
 */
function confirmDeleteOrder(orderId) {
    const order = socialOrders.find((o) => o.id === orderId);
    if (!order) return;

    if (confirm(`Bạn có chắc muốn xóa đơn ${order.order_code}?`)) {
        deleteOrder(orderId);
    }
}

/**
 * Open tag modal
 */
function openTagModal(orderId) {
    const order = socialOrders.find((o) => o.id === orderId);
    if (!order) return;

    // TODO: Implement tag modal
    showNotification('Tính năng gán tag đang phát triển', 'warning');
}

/**
 * Open chat modal
 */
function openChatModal(orderId) {
    const order = socialOrders.find((o) => o.id === orderId);
    if (!order || !order.psid) {
        showNotification('Không có thông tin chat cho đơn này', 'warning');
        return;
    }

    // TODO: Integrate with Pancake chat
    showNotification('Tính năng chat đang phát triển', 'warning');
}

// =====================================================
// EVENT LISTENERS
// =====================================================

function setupEventListeners() {
    // Toggle filters
    document.getElementById('toggleFiltersBtn')?.addEventListener('click', () => {
        document.getElementById('filtersSection')?.classList.toggle('show');
    });

    // Search on enter
    document.getElementById('filterSearch')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadOrders({ page: 1 });
        }
    });

    // Filter changes
    document
        .getElementById('filterStatus')
        ?.addEventListener('change', () => loadOrders({ page: 1 }));
    document
        .getElementById('filterSource')
        ?.addEventListener('change', () => loadOrders({ page: 1 }));

    // Shipping fee / discount changes
    document.getElementById('shippingFee')?.addEventListener('input', updateProductTotals);
    document.getElementById('discount')?.addEventListener('input', updateProductTotals);

    // Close modals on overlay click
    document.querySelectorAll('.social-modal-overlay').forEach((overlay) => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('show');
            }
        });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.social-modal-overlay.show').forEach((overlay) => {
                overlay.classList.remove('show');
            });
        }
    });
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function showLoading(show) {
    const loader = document.getElementById('loadingOverlay');
    if (loader) {
        loader.style.display = show ? 'flex' : 'none';
    }
}

function showNotification(message, type = 'info') {
    // Use notification system if available
    if (window.notificationManager) {
        window.notificationManager[type]?.(message) || window.notificationManager.info(message);
    } else {
        alert(message);
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
    }).format(amount || 0);
}

function formatNumber(num) {
    return new Intl.NumberFormat('vi-VN').format(num || 0);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getContrastColor(hexColor) {
    if (!hexColor) return '#000000';
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
}

// =====================================================
// EXPORT FOR GLOBAL ACCESS
// =====================================================
window.socialOrdersModule = {
    loadOrders,
    loadStats,
    createOrder,
    updateOrder,
    deleteOrder,
    openCreateModal,
    openEditModal,
    closeCreateModal,
    saveOrder,
    confirmDeleteOrder,
    goToPage,
};
