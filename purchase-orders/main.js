/* =====================================================
   PURCHASE ORDERS - MAIN JAVASCRIPT
   Firebase Service Layer, UI Logic, and State Management
   ===================================================== */

// =====================================================
// CONSTANTS & TYPES
// =====================================================

const COLLECTION = 'purchase_orders';
const PAGE_SIZE = 20;

// Order Status
const OrderStatus = {
    DRAFT: 'DRAFT',
    AWAITING_PURCHASE: 'AWAITING_PURCHASE',
    AWAITING_DELIVERY: 'AWAITING_DELIVERY',
    RECEIVED: 'RECEIVED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED'
};

// Status Labels (Vietnamese)
const STATUS_LABELS = {
    DRAFT: 'Nháp',
    AWAITING_PURCHASE: 'Chờ mua',
    AWAITING_DELIVERY: 'Chờ hàng',
    RECEIVED: 'Đã nhận',
    COMPLETED: 'Hoàn thành',
    CANCELLED: 'Đã hủy'
};

// Status Colors
const STATUS_COLORS = {
    DRAFT: { bg: '#f3f4f6', text: '#6b7280' },
    AWAITING_PURCHASE: { bg: '#dbeafe', text: '#2563eb' },
    AWAITING_DELIVERY: { bg: '#fef3c7', text: '#d97706' },
    RECEIVED: { bg: '#d1fae5', text: '#059669' },
    COMPLETED: { bg: '#d1fae5', text: '#059669' },
    CANCELLED: { bg: '#fee2e2', text: '#dc2626' }
};

// Status CSS Classes
const STATUS_CLASSES = {
    DRAFT: 'draft',
    AWAITING_PURCHASE: 'awaiting-purchase',
    AWAITING_DELIVERY: 'awaiting-delivery',
    RECEIVED: 'received',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
};

// Allowed Status Transitions
const ALLOWED_TRANSITIONS = {
    DRAFT: ['AWAITING_PURCHASE', 'CANCELLED'],
    AWAITING_PURCHASE: ['AWAITING_DELIVERY', 'DRAFT', 'CANCELLED'],
    AWAITING_DELIVERY: ['RECEIVED', 'CANCELLED'],
    RECEIVED: ['COMPLETED'],
    COMPLETED: [],
    CANCELLED: []
};

// Validation Messages
const VALIDATION_MESSAGES = {
    SUPPLIER_REQUIRED: 'Vui lòng nhập tên nhà cung cấp',
    ITEMS_REQUIRED: 'Đơn hàng phải có ít nhất 1 sản phẩm',
    PRODUCT_NAME_REQUIRED: 'Tên sản phẩm không được để trống',
    QUANTITY_MIN: 'Số lượng tối thiểu là 1',
    PURCHASE_PRICE_REQUIRED: 'Vui lòng nhập giá mua',
    DELETE_COMPLETED_FORBIDDEN: 'Không thể xóa đơn đã hoàn thành'
};

// =====================================================
// STATE MANAGEMENT
// =====================================================

let state = {
    orders: [],
    filteredOrders: [],
    currentStatus: 'DRAFT',
    currentPage: 1,
    totalPages: 1,
    isLoading: false,
    editingOrderId: null,
    orderItems: [],
    stats: {
        totalOrders: 0,
        totalValue: 0,
        todayOrders: 0,
        todayValue: 0,
        tposSyncRate: 0,
        draftCount: 0,
        awaitingPurchaseCount: 0,
        awaitingDeliveryCount: 0
    },
    filters: {
        startDate: null,
        endDate: null,
        search: '',
        status: ''
    }
};

// =====================================================
// FIREBASE SERVICE LAYER
// =====================================================

// Initialize Firebase (assuming firebase-config.js is loaded)
let db = null;
let auth = null;
let storage = null;

function initializeFirebase() {
    try {
        // Check if Firebase is already initialized
        if (firebase.apps.length === 0) {
            // Firebase config should be in firebase-config.js
            console.warn('Firebase not initialized. Please check firebase-config.js');
            return false;
        }

        db = firebase.firestore();
        auth = firebase.auth();
        storage = firebase.storage();

        return true;
    } catch (error) {
        console.error('Firebase initialization error:', error);
        return false;
    }
}

// Generate Order Number
async function generateOrderNumber() {
    const today = new Date();
    const datePrefix = today.toISOString().slice(0, 10).replace(/-/g, '');

    try {
        const snapshot = await db.collection(COLLECTION)
            .where('orderNumber', '>=', `PO-${datePrefix}-`)
            .where('orderNumber', '<', `PO-${datePrefix}-~`)
            .orderBy('orderNumber', 'desc')
            .limit(1)
            .get();

        let sequence = 1;
        if (!snapshot.empty) {
            const lastNumber = snapshot.docs[0].data().orderNumber;
            const lastSequence = parseInt(lastNumber.split('-')[2], 10);
            sequence = lastSequence + 1;
        }

        return `PO-${datePrefix}-${String(sequence).padStart(3, '0')}`;
    } catch (error) {
        console.error('Error generating order number:', error);
        return `PO-${datePrefix}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    }
}

// Generate UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Get Current User
function getCurrentUser() {
    const user = auth?.currentUser;
    if (user) {
        return {
            uid: user.uid,
            displayName: user.displayName || 'Unknown',
            email: user.email || ''
        };
    }
    // Return mock user if not authenticated
    return {
        uid: 'system',
        displayName: 'Admin',
        email: 'admin@n2shop.com'
    };
}

// Create Order
async function createOrder(orderData, isDraft = false) {
    try {
        // Validate
        const validation = validateOrder(orderData);
        if (!validation.isValid && !isDraft) {
            showToast(validation.errors[0].message, 'error');
            return null;
        }

        const user = getCurrentUser();
        const orderNumber = await generateOrderNumber();

        // Calculate totals
        const totalAmount = orderData.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
        const finalAmount = totalAmount - (orderData.discountAmount || 0) + (orderData.shippingFee || 0);

        const orderDoc = {
            orderNumber,
            orderDate: orderData.orderDate || firebase.firestore.Timestamp.now(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: isDraft ? OrderStatus.DRAFT : OrderStatus.AWAITING_PURCHASE,
            supplier: orderData.supplier || null,
            invoiceAmount: orderData.invoiceAmount || 0,
            totalAmount,
            discountAmount: orderData.discountAmount || 0,
            shippingFee: orderData.shippingFee || 0,
            finalAmount,
            invoiceImages: orderData.invoiceImages || [],
            notes: orderData.notes || '',
            items: orderData.items.map((item, index) => ({
                ...item,
                id: item.id || generateUUID(),
                position: index + 1
            })),
            totalItems: orderData.items.length,
            totalQuantity: orderData.items.reduce((sum, item) => sum + (item.quantity || 0), 0),
            createdBy: user,
            lastModifiedBy: user,
            statusHistory: [{
                from: null,
                to: isDraft ? OrderStatus.DRAFT : OrderStatus.AWAITING_PURCHASE,
                changedAt: firebase.firestore.Timestamp.now(),
                changedBy: user
            }]
        };

        const docRef = await db.collection(COLLECTION).add(orderDoc);
        showToast(isDraft ? 'Đã lưu nháp đơn hàng' : 'Đã tạo đơn hàng thành công', 'success');

        return docRef.id;
    } catch (error) {
        console.error('Error creating order:', error);
        showToast('Không thể tạo đơn hàng. Vui lòng thử lại.', 'error');
        return null;
    }
}

// Get Orders by Status
async function getOrdersByStatus(status, filters = {}) {
    try {
        let query = db.collection(COLLECTION);

        if (status) {
            query = query.where('status', '==', status);
        }

        query = query.orderBy('createdAt', 'desc');

        const snapshot = await query.get();

        let orders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Apply filters
        if (filters.startDate) {
            const startDate = new Date(filters.startDate);
            startDate.setHours(0, 0, 0, 0);
            orders = orders.filter(order => {
                const orderDate = order.orderDate?.toDate?.() || new Date(order.orderDate);
                return orderDate >= startDate;
            });
        }

        if (filters.endDate) {
            const endDate = new Date(filters.endDate);
            endDate.setHours(23, 59, 59, 999);
            orders = orders.filter(order => {
                const orderDate = order.orderDate?.toDate?.() || new Date(order.orderDate);
                return orderDate <= endDate;
            });
        }

        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            orders = orders.filter(order => {
                const supplierName = (order.supplier?.name || '').toLowerCase();
                const supplierCode = (order.supplier?.code || '').toLowerCase();
                const orderNumber = (order.orderNumber || '').toLowerCase();
                const hasMatchingItem = order.items?.some(item =>
                    (item.productCode || '').toLowerCase().includes(searchLower) ||
                    (item.productName || '').toLowerCase().includes(searchLower)
                );

                return supplierName.includes(searchLower) ||
                       supplierCode.includes(searchLower) ||
                       orderNumber.includes(searchLower) ||
                       hasMatchingItem;
            });
        }

        return orders;
    } catch (error) {
        console.error('Error fetching orders:', error);
        showToast('Không thể tải danh sách đơn hàng.', 'error');
        return [];
    }
}

// Get All Orders (for stats)
async function getAllOrders() {
    try {
        const snapshot = await db.collection(COLLECTION).get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error fetching all orders:', error);
        return [];
    }
}

// Update Order Status
async function updateOrderStatus(orderId, newStatus, reason = '') {
    try {
        const docRef = db.collection(COLLECTION).doc(orderId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            showToast('Đơn hàng không tồn tại.', 'error');
            return false;
        }

        const currentStatus = docSnap.data().status;

        if (!canTransition(currentStatus, newStatus)) {
            showToast(`Không thể chuyển từ "${STATUS_LABELS[currentStatus]}" sang "${STATUS_LABELS[newStatus]}"`, 'error');
            return false;
        }

        const user = getCurrentUser();
        const currentHistory = docSnap.data().statusHistory || [];

        await docRef.update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastModifiedBy: user,
            statusHistory: [...currentHistory, {
                from: currentStatus,
                to: newStatus,
                changedAt: firebase.firestore.Timestamp.now(),
                changedBy: user,
                reason
            }]
        });

        showToast(`Đã cập nhật trạng thái sang "${STATUS_LABELS[newStatus]}"`, 'success');
        return true;
    } catch (error) {
        console.error('Error updating order status:', error);
        showToast('Không thể cập nhật trạng thái.', 'error');
        return false;
    }
}

// Update Order
async function updateOrder(orderId, orderData) {
    try {
        const user = getCurrentUser();

        // Calculate totals
        const totalAmount = orderData.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
        const finalAmount = totalAmount - (orderData.discountAmount || 0) + (orderData.shippingFee || 0);

        await db.collection(COLLECTION).doc(orderId).update({
            ...orderData,
            totalAmount,
            finalAmount,
            totalItems: orderData.items.length,
            totalQuantity: orderData.items.reduce((sum, item) => sum + (item.quantity || 0), 0),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastModifiedBy: user
        });

        showToast('Đã cập nhật đơn hàng', 'success');
        return true;
    } catch (error) {
        console.error('Error updating order:', error);
        showToast('Không thể cập nhật đơn hàng.', 'error');
        return false;
    }
}

// Delete Order
async function deleteOrder(orderId) {
    try {
        const docRef = db.collection(COLLECTION).doc(orderId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            showToast('Đơn hàng không tồn tại.', 'error');
            return false;
        }

        const status = docSnap.data().status;

        if (status === OrderStatus.COMPLETED) {
            showToast(VALIDATION_MESSAGES.DELETE_COMPLETED_FORBIDDEN, 'error');
            return false;
        }

        await docRef.delete();
        showToast('Đã xóa đơn hàng', 'success');
        return true;
    } catch (error) {
        console.error('Error deleting order:', error);
        showToast('Không thể xóa đơn hàng.', 'error');
        return false;
    }
}

// Copy Order
async function copyOrder(sourceOrderId) {
    try {
        const docSnap = await db.collection(COLLECTION).doc(sourceOrderId).get();

        if (!docSnap.exists) {
            showToast('Đơn hàng không tồn tại.', 'error');
            return null;
        }

        const sourceData = docSnap.data();
        const user = getCurrentUser();

        const newOrderData = {
            supplier: sourceData.supplier,
            invoiceAmount: sourceData.invoiceAmount,
            notes: sourceData.notes,
            discountAmount: sourceData.discountAmount,
            shippingFee: sourceData.shippingFee,
            items: sourceData.items.map(item => ({
                ...item,
                id: generateUUID(),
                tposSyncStatus: undefined,
                tposProductId: undefined
            }))
        };

        const newOrderId = await createOrder(newOrderData, true);

        if (newOrderId) {
            showToast('Đã sao chép đơn hàng', 'success');
        }

        return newOrderId;
    } catch (error) {
        console.error('Error copying order:', error);
        showToast('Không thể sao chép đơn hàng.', 'error');
        return null;
    }
}

// =====================================================
// VALIDATION
// =====================================================

function validateOrder(order) {
    const errors = [];

    // Supplier validation
    if (!order.supplier?.name) {
        errors.push({
            field: 'supplier',
            code: 'SUPPLIER_REQUIRED',
            message: VALIDATION_MESSAGES.SUPPLIER_REQUIRED
        });
    }

    // Items validation
    const validItems = order.items?.filter(item => item.productName?.trim()) || [];
    if (validItems.length === 0) {
        errors.push({
            field: 'items',
            code: 'ITEMS_REQUIRED',
            message: VALIDATION_MESSAGES.ITEMS_REQUIRED
        });
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

function canTransition(from, to) {
    return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// =====================================================
// UI UTILITIES
// =====================================================

// Format Currency
function formatVND(value) {
    if (value === null || value === undefined) return '0 đ';
    return new Intl.NumberFormat('vi-VN').format(value) + ' đ';
}

// Format Date
function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function formatDateTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

// Parse Currency Input
function parseCurrency(value) {
    if (!value) return 0;
    return parseInt(value.toString().replace(/[^\d]/g, ''), 10) || 0;
}

// Toast Notification
function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';
    toast.innerHTML = `<i data-lucide="${icon}"></i> ${message}`;

    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// =====================================================
// UI RENDERING
// =====================================================

// Render Statistics
async function renderStats() {
    const allOrders = await getAllOrders();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = {
        totalOrders: allOrders.length,
        totalValue: allOrders.reduce((sum, order) => sum + (order.finalAmount || 0), 0),
        todayOrders: 0,
        todayValue: 0,
        tposSyncRate: 0,
        draftCount: 0,
        awaitingPurchaseCount: 0,
        awaitingDeliveryCount: 0
    };

    allOrders.forEach(order => {
        const orderDate = order.createdAt?.toDate?.() || new Date(order.createdAt);
        if (orderDate >= today) {
            stats.todayOrders++;
            stats.todayValue += order.finalAmount || 0;
        }

        if (order.status === OrderStatus.DRAFT) stats.draftCount++;
        if (order.status === OrderStatus.AWAITING_PURCHASE) stats.awaitingPurchaseCount++;
        if (order.status === OrderStatus.AWAITING_DELIVERY) stats.awaitingDeliveryCount++;
    });

    // Calculate TPOS sync rate
    const completedOrders = allOrders.filter(o => o.status === OrderStatus.COMPLETED);
    const syncedOrders = completedOrders.filter(o =>
        o.items?.every(item => item.tposSyncStatus === 'success')
    );
    stats.tposSyncRate = completedOrders.length > 0
        ? Math.round((syncedOrders.length / completedOrders.length) * 100)
        : 0;

    state.stats = stats;

    // Update UI
    document.getElementById('totalOrders').textContent = stats.totalOrders;
    document.getElementById('totalValue').textContent = formatVND(stats.totalValue);
    document.getElementById('todayOrders').textContent = stats.todayOrders;
    document.getElementById('todayValue').textContent = formatVND(stats.todayValue);
    document.getElementById('tposSyncRate').textContent = stats.tposSyncRate + '%';
    document.getElementById('draftCount').textContent = stats.draftCount;
    document.getElementById('awaitingPurchaseCount').textContent = stats.awaitingPurchaseCount;
    document.getElementById('awaitingDeliveryCount').textContent = stats.awaitingDeliveryCount;
}

// Render Orders Table with Row Spanning
function renderOrdersTable(orders) {
    const tbody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    const tableContainer = document.querySelector('.table-container');

    if (!orders || orders.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        tableContainer.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    tableContainer.style.display = 'block';

    let html = '';

    orders.forEach((order, orderIndex) => {
        const items = order.items || [];
        const itemCount = Math.max(items.length, 1);

        items.forEach((item, itemIndex) => {
            html += '<tr>';

            // Row-spanning columns (only for first item)
            if (itemIndex === 0) {
                // Order Date
                html += `
                    <td rowspan="${itemCount}">
                        <div class="order-date-cell">
                            <i data-lucide="calendar"></i>
                            <div>
                                <div class="order-date">${formatDate(order.orderDate || order.createdAt)}</div>
                                <div class="order-time">${formatTime(order.createdAt)}</div>
                            </div>
                        </div>
                    </td>
                `;

                // Supplier
                html += `
                    <td rowspan="${itemCount}">
                        <div class="supplier-name">${order.supplier?.code || order.supplier?.name || 'N/A'}</div>
                        <span class="supplier-badge">${order.totalItems || 0} sản phẩm</span>
                    </td>
                `;

                // Invoice
                const invoiceThumb = order.invoiceImages?.[0]
                    ? `<img src="${order.invoiceImages[0]}" class="invoice-thumb" alt="Invoice">`
                    : '<div class="invoice-thumb" style="background:#f3f4f6;display:flex;align-items:center;justify-content:center;"><i data-lucide="image" style="width:16px;height:16px;color:#9ca3af;"></i></div>';
                html += `
                    <td rowspan="${itemCount}">
                        <div class="invoice-cell">
                            ${invoiceThumb}
                            <div class="invoice-amount">${formatVND(order.invoiceAmount || order.finalAmount)}</div>
                        </div>
                    </td>
                `;
            }

            // Product Name
            html += `<td>${item.productName || '-'}</td>`;

            // SKU
            html += `<td>${item.productCode || '-'}</td>`;

            // Variant
            html += `<td class="text-center">${item.variant || '-'}</td>`;

            // Quantity
            html += `<td class="text-center font-semibold">${item.quantity || 0}</td>`;

            // Purchase Price
            html += `<td class="text-right">${formatVND(item.purchasePrice)}</td>`;

            // Selling Price
            html += `<td class="text-right">${formatVND(item.sellingPrice)}</td>`;

            // Notes
            html += `<td>${item.notes || order.notes || ''}</td>`;

            // Status
            html += `
                <td class="text-center">
                    <span class="status-badge ${STATUS_CLASSES[order.status] || 'draft'}">
                        ${STATUS_LABELS[order.status] || order.status}
                    </span>
                </td>
            `;

            // Actions (only for first item)
            if (itemIndex === 0) {
                const isEditable = order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.CANCELLED;
                const isDeletable = order.status !== OrderStatus.COMPLETED;

                html += `
                    <td rowspan="${itemCount}">
                        <div class="action-buttons-cell">
                            <div class="action-row">
                                <button class="action-btn edit" onclick="editOrder('${order.id}')" title="Sửa" ${!isEditable ? 'disabled' : ''}>
                                    <i data-lucide="pencil"></i>
                                </button>
                                <button class="action-btn download" onclick="downloadOrder('${order.id}')" title="Xuất Excel">
                                    <i data-lucide="download"></i>
                                </button>
                                <button class="action-btn copy" onclick="copyOrderHandler('${order.id}')" title="Sao chép">
                                    <i data-lucide="copy"></i>
                                </button>
                                <button class="action-btn delete" onclick="confirmDeleteOrder('${order.id}')" title="Xóa" ${!isDeletable ? 'disabled' : ''}>
                                    <i data-lucide="trash-2"></i>
                                </button>
                            </div>
                            <input type="checkbox" class="action-checkbox" data-order-id="${order.id}">
                        </div>
                    </td>
                `;
            }

            html += '</tr>';
        });

        // If no items, still render one row
        if (items.length === 0) {
            html += `
                <tr>
                    <td>
                        <div class="order-date-cell">
                            <i data-lucide="calendar"></i>
                            <div>
                                <div class="order-date">${formatDate(order.orderDate || order.createdAt)}</div>
                                <div class="order-time">${formatTime(order.createdAt)}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="supplier-name">${order.supplier?.code || order.supplier?.name || 'N/A'}</div>
                        <span class="supplier-badge">0 sản phẩm</span>
                    </td>
                    <td>
                        <div class="invoice-cell">
                            <div class="invoice-thumb" style="background:#f3f4f6;display:flex;align-items:center;justify-content:center;">
                                <i data-lucide="image" style="width:16px;height:16px;color:#9ca3af;"></i>
                            </div>
                            <div class="invoice-amount">${formatVND(order.finalAmount)}</div>
                        </div>
                    </td>
                    <td colspan="7" class="text-muted">Chưa có sản phẩm</td>
                    <td class="text-center">
                        <span class="status-badge ${STATUS_CLASSES[order.status] || 'draft'}">
                            ${STATUS_LABELS[order.status] || order.status}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons-cell">
                            <div class="action-row">
                                <button class="action-btn edit" onclick="editOrder('${order.id}')" title="Sửa">
                                    <i data-lucide="pencil"></i>
                                </button>
                                <button class="action-btn download" onclick="downloadOrder('${order.id}')" title="Xuất Excel">
                                    <i data-lucide="download"></i>
                                </button>
                                <button class="action-btn copy" onclick="copyOrderHandler('${order.id}')" title="Sao chép">
                                    <i data-lucide="copy"></i>
                                </button>
                                <button class="action-btn delete" onclick="confirmDeleteOrder('${order.id}')" title="Xóa">
                                    <i data-lucide="trash-2"></i>
                                </button>
                            </div>
                            <input type="checkbox" class="action-checkbox" data-order-id="${order.id}">
                        </div>
                    </td>
                </tr>
            `;
        }
    });

    tbody.innerHTML = html;
    lucide.createIcons();
}

// Render Pagination
function renderPagination(total, current, pageSize) {
    const totalPages = Math.ceil(total / pageSize);
    const start = (current - 1) * pageSize + 1;
    const end = Math.min(current * pageSize, total);

    document.getElementById('pageInfo').textContent =
        total > 0 ? `Showing ${start} to ${end} of ${total} entries` : 'Showing 0 to 0 of 0 entries';

    const pageNumbersContainer = document.getElementById('pageNumbers');
    let pageHtml = '';

    for (let i = 1; i <= totalPages; i++) {
        if (i <= 3 || i > totalPages - 3 || Math.abs(i - current) <= 1) {
            pageHtml += `<button class="page-num ${i === current ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
        } else if (i === 4 && current > 5) {
            pageHtml += '<span>...</span>';
        } else if (i === totalPages - 3 && current < totalPages - 4) {
            pageHtml += '<span>...</span>';
        }
    }

    pageNumbersContainer.innerHTML = pageHtml;

    document.getElementById('prevPageBtn').disabled = current <= 1;
    document.getElementById('nextPageBtn').disabled = current >= totalPages;

    state.totalPages = totalPages;
}

// =====================================================
// ORDER MODAL FUNCTIONS
// =====================================================

function openCreateOrderModal() {
    state.editingOrderId = null;
    state.orderItems = [];

    // Reset form
    document.getElementById('supplierName').value = '';
    document.getElementById('orderDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('invoiceAmount').value = '';
    document.getElementById('orderNotes').value = '';
    document.getElementById('discountAmount').value = '0';
    document.getElementById('shippingFee').value = '0';
    document.getElementById('invoiceImageUpload').classList.remove('has-image');
    document.getElementById('invoiceImageUpload').innerHTML = '<i data-lucide="image"></i><span>Ctrl+V</span>';

    // Add default empty rows
    addDefaultRows();

    // Show modal
    document.getElementById('orderModal').classList.add('active');
    lucide.createIcons();

    updateTotals();
}

function closeOrderModal() {
    document.getElementById('orderModal').classList.remove('active');
}

function addDefaultRows() {
    state.orderItems = [
        createEmptyItem(1),
        createEmptyItem(2),
        createEmptyItem(3)
    ];
    renderOrderItems();
}

function createEmptyItem(position) {
    return {
        id: generateUUID(),
        position,
        productName: '',
        productCode: '',
        variant: '',
        quantity: 1,
        purchasePrice: 0,
        sellingPrice: 0,
        subtotal: 0,
        productImages: [],
        priceImages: [],
        notes: ''
    };
}

function addNewProduct() {
    const newPosition = state.orderItems.length + 1;
    state.orderItems.push(createEmptyItem(newPosition));
    renderOrderItems();
}

function removeProduct(itemId) {
    state.orderItems = state.orderItems.filter(item => item.id !== itemId);
    // Update positions
    state.orderItems.forEach((item, index) => {
        item.position = index + 1;
    });
    renderOrderItems();
    updateTotals();
}

function duplicateProduct(itemId) {
    const item = state.orderItems.find(i => i.id === itemId);
    if (item) {
        const newItem = {
            ...item,
            id: generateUUID(),
            position: state.orderItems.length + 1
        };
        state.orderItems.push(newItem);
        renderOrderItems();
        updateTotals();
    }
}

function renderOrderItems() {
    const tbody = document.getElementById('orderItemsBody');

    let html = '';
    state.orderItems.forEach((item, index) => {
        const hasError = item.purchasePrice === 0 || item.sellingPrice === 0;

        html += `
            <tr data-item-id="${item.id}">
                <td class="text-center">${item.position}</td>
                <td>
                    <input type="text" class="product-name-input"
                        placeholder="Nhập tên sản phẩm"
                        value="${item.productName || ''}"
                        onchange="updateItemField('${item.id}', 'productName', this.value)">
                </td>
                <td>
                    <button type="button" class="variant-btn" onclick="openVariantPicker('${item.id}')">
                        ${item.variant || 'Nhấn để tạo biến thể'}
                    </button>
                </td>
                <td>
                    <div class="sku-wrapper">
                        <input type="text" class="sku-input"
                            placeholder="Mã SP"
                            value="${item.productCode || ''}"
                            onchange="updateItemField('${item.id}', 'productCode', this.value)">
                        <button type="button" class="sku-edit-btn" onclick="editSku('${item.id}')">
                            <i data-lucide="pencil"></i>
                        </button>
                    </div>
                </td>
                <td class="text-center">
                    <input type="number" class="qty-input"
                        value="${item.quantity || 1}" min="1"
                        onchange="updateItemQuantity('${item.id}', this.value)">
                </td>
                <td>
                    <input type="text" class="price-input ${hasError ? 'error' : ''}"
                        placeholder="0"
                        value="${item.purchasePrice || ''}"
                        onchange="updateItemPrice('${item.id}', 'purchasePrice', this.value)">
                </td>
                <td>
                    <input type="text" class="price-input ${hasError ? 'error' : ''}"
                        placeholder="0"
                        value="${item.sellingPrice || ''}"
                        onchange="updateItemPrice('${item.id}', 'sellingPrice', this.value)">
                </td>
                <td class="total-amount">${formatVND(item.subtotal)}</td>
                <td>
                    <div class="table-image-upload ${item.productImages?.length > 0 ? 'has-image' : ''}"
                        onclick="uploadProductImage('${item.id}')">
                        ${item.productImages?.length > 0
                            ? `<img src="${item.productImages[0]}" alt="Product">`
                            : '<i data-lucide="image"></i><span>Ctrl+V</span>'}
                    </div>
                </td>
                <td>
                    <div class="table-image-upload ${item.priceImages?.length > 0 ? 'has-image' : ''}"
                        onclick="uploadPriceImage('${item.id}')">
                        ${item.priceImages?.length > 0
                            ? `<img src="${item.priceImages[0]}" alt="Price">`
                            : '<i data-lucide="image"></i><span>Ctrl+V</span>'}
                    </div>
                </td>
                <td>
                    <div class="table-actions">
                        <button type="button" class="table-action-btn save" onclick="saveItem('${item.id}')" title="Lưu">
                            <i data-lucide="save"></i>
                        </button>
                        <button type="button" class="table-action-btn copy" onclick="duplicateProduct('${item.id}')" title="Sao chép">
                            <i data-lucide="copy"></i>
                        </button>
                        <button type="button" class="table-action-btn delete" onclick="removeProduct('${item.id}')" title="Xóa">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    lucide.createIcons();
}

function updateItemField(itemId, field, value) {
    const item = state.orderItems.find(i => i.id === itemId);
    if (item) {
        item[field] = value;
    }
}

function updateItemQuantity(itemId, value) {
    const item = state.orderItems.find(i => i.id === itemId);
    if (item) {
        item.quantity = parseInt(value) || 1;
        item.subtotal = item.quantity * (item.purchasePrice || 0);
        renderOrderItems();
        updateTotals();
    }
}

function updateItemPrice(itemId, field, value) {
    const item = state.orderItems.find(i => i.id === itemId);
    if (item) {
        item[field] = parseCurrency(value);
        item.subtotal = item.quantity * (item.purchasePrice || 0);
        renderOrderItems();
        updateTotals();
    }
}

function updateTotals() {
    const totalQuantity = state.orderItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const subtotal = state.orderItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const discount = parseCurrency(document.getElementById('discountAmount').value);
    const shipping = parseCurrency(document.getElementById('shippingFee').value);
    const finalAmount = subtotal - discount + shipping;

    document.getElementById('totalQuantity').textContent = totalQuantity;
    document.getElementById('subtotalAmount').textContent = formatVND(subtotal);
    document.getElementById('finalAmount').textContent = formatVND(finalAmount);
}

function toggleShippingInput() {
    const row = document.getElementById('shippingInputRow');
    row.style.display = row.style.display === 'none' ? 'flex' : 'none';
}

// Placeholder functions for image uploads
function triggerInvoiceUpload() {
    document.getElementById('invoiceImageInput').click();
}

function uploadProductImage(itemId) {
    // Implement image upload logic
    showToast('Tính năng upload ảnh sản phẩm', 'info');
}

function uploadPriceImage(itemId) {
    // Implement image upload logic
    showToast('Tính năng upload ảnh giá', 'info');
}

function openVariantPicker(itemId) {
    const variant = prompt('Nhập biến thể (VD: 38, M, Đỏ):');
    if (variant) {
        const item = state.orderItems.find(i => i.id === itemId);
        if (item) {
            item.variant = variant;
            renderOrderItems();
        }
    }
}

function editSku(itemId) {
    const item = state.orderItems.find(i => i.id === itemId);
    if (item) {
        const sku = prompt('Nhập mã sản phẩm:', item.productCode);
        if (sku !== null) {
            item.productCode = sku;
            renderOrderItems();
        }
    }
}

function saveItem(itemId) {
    showToast('Đã lưu thông tin sản phẩm', 'success');
}

function openProductSelector() {
    showToast('Tính năng chọn từ kho sản phẩm', 'info');
}

// Save Draft
async function saveDraft() {
    const orderData = getOrderFormData();
    const orderId = await createOrder(orderData, true);
    if (orderId) {
        closeOrderModal();
        loadOrders();
    }
}

// Create Order
async function createOrderHandler() {
    const orderData = getOrderFormData();
    const orderId = await createOrder(orderData, false);
    if (orderId) {
        closeOrderModal();
        loadOrders();
    }
}

function getOrderFormData() {
    const supplierName = document.getElementById('supplierName').value.trim();
    const orderDateValue = document.getElementById('orderDate').value;
    const invoiceAmount = parseCurrency(document.getElementById('invoiceAmount').value);
    const notes = document.getElementById('orderNotes').value.trim();
    const discountAmount = parseCurrency(document.getElementById('discountAmount').value);
    const shippingFee = parseCurrency(document.getElementById('shippingFee').value);

    // Parse supplier name to get code
    const supplierCode = supplierName.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 5);

    return {
        supplier: {
            id: generateUUID(),
            code: supplierCode,
            name: supplierName
        },
        orderDate: orderDateValue ? firebase.firestore.Timestamp.fromDate(new Date(orderDateValue)) : null,
        invoiceAmount,
        notes,
        discountAmount,
        shippingFee,
        invoiceImages: [],
        items: state.orderItems.filter(item => item.productName?.trim())
    };
}

// =====================================================
// ORDER ACTIONS
// =====================================================

async function editOrder(orderId) {
    try {
        const docSnap = await db.collection(COLLECTION).doc(orderId).get();
        if (!docSnap.exists) {
            showToast('Đơn hàng không tồn tại', 'error');
            return;
        }

        const order = { id: docSnap.id, ...docSnap.data() };

        state.editingOrderId = orderId;
        state.orderItems = order.items || [];

        // Populate form
        document.getElementById('supplierName').value = order.supplier?.name || '';
        document.getElementById('orderDate').value = order.orderDate?.toDate?.()?.toISOString()?.split('T')[0] || '';
        document.getElementById('invoiceAmount').value = order.invoiceAmount || '';
        document.getElementById('orderNotes').value = order.notes || '';
        document.getElementById('discountAmount').value = order.discountAmount || '0';
        document.getElementById('shippingFee').value = order.shippingFee || '0';

        if (state.orderItems.length === 0) {
            addDefaultRows();
        } else {
            renderOrderItems();
        }

        document.getElementById('orderModal').classList.add('active');
        lucide.createIcons();
        updateTotals();
    } catch (error) {
        console.error('Error loading order for edit:', error);
        showToast('Không thể tải thông tin đơn hàng', 'error');
    }
}

let deleteOrderId = null;

function confirmDeleteOrder(orderId) {
    deleteOrderId = orderId;
    document.getElementById('confirmMessage').textContent = 'Bạn có chắc chắn muốn xóa đơn hàng này?';
    document.getElementById('confirmModal').classList.add('active');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
    deleteOrderId = null;
}

async function executeDelete() {
    if (deleteOrderId) {
        const success = await deleteOrder(deleteOrderId);
        if (success) {
            closeConfirmModal();
            loadOrders();
        }
    }
}

async function copyOrderHandler(orderId) {
    const newOrderId = await copyOrder(orderId);
    if (newOrderId) {
        loadOrders();
    }
}

function downloadOrder(orderId) {
    showToast('Tính năng xuất Excel', 'info');
}

// =====================================================
// DATA LOADING & FILTERING
// =====================================================

async function loadOrders() {
    showLoading(true);

    const orders = await getOrdersByStatus(state.currentStatus, state.filters);
    state.orders = orders;
    state.filteredOrders = orders;

    // Pagination
    const start = (state.currentPage - 1) * PAGE_SIZE;
    const paginatedOrders = orders.slice(start, start + PAGE_SIZE);

    renderOrdersTable(paginatedOrders);
    renderPagination(orders.length, state.currentPage, PAGE_SIZE);
    await renderStats();

    showLoading(false);
}

function showLoading(show) {
    document.getElementById('loadingIndicator').style.display = show ? 'flex' : 'none';
}

function goToPage(page) {
    state.currentPage = page;
    loadOrders();
}

// =====================================================
// EVENT LISTENERS
// =====================================================

function initEventListeners() {
    // Create Order Button
    document.getElementById('createOrderBtn')?.addEventListener('click', openCreateOrderModal);

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentStatus = btn.dataset.status;
            state.currentPage = 1;
            loadOrders();
        });
    });

    // Filters
    document.getElementById('filterStartDate')?.addEventListener('change', (e) => {
        state.filters.startDate = e.target.value;
        state.currentPage = 1;
        loadOrders();
    });

    document.getElementById('filterEndDate')?.addEventListener('change', (e) => {
        state.filters.endDate = e.target.value;
        state.currentPage = 1;
        loadOrders();
    });

    // Quick Filter
    document.getElementById('quickFilter')?.addEventListener('change', (e) => {
        const value = e.target.value;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let startDate = null;
        let endDate = null;

        switch (value) {
            case 'today':
                startDate = today;
                endDate = today;
                break;
            case 'yesterday':
                startDate = new Date(today);
                startDate.setDate(startDate.getDate() - 1);
                endDate = startDate;
                break;
            case '7days':
                startDate = new Date(today);
                startDate.setDate(startDate.getDate() - 7);
                endDate = today;
                break;
            case '30days':
                startDate = new Date(today);
                startDate.setDate(startDate.getDate() - 30);
                endDate = today;
                break;
            case 'thisMonth':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = today;
                break;
            case 'lastMonth':
                startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                endDate = new Date(today.getFullYear(), today.getMonth(), 0);
                break;
        }

        if (startDate) {
            document.getElementById('filterStartDate').value = startDate.toISOString().split('T')[0];
            state.filters.startDate = startDate.toISOString().split('T')[0];
        } else {
            document.getElementById('filterStartDate').value = '';
            state.filters.startDate = null;
        }

        if (endDate) {
            document.getElementById('filterEndDate').value = endDate.toISOString().split('T')[0];
            state.filters.endDate = endDate.toISOString().split('T')[0];
        } else {
            document.getElementById('filterEndDate').value = '';
            state.filters.endDate = null;
        }

        state.currentPage = 1;
        loadOrders();
    });

    // Search with debounce
    let searchTimeout;
    document.getElementById('filterSearch')?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            state.filters.search = e.target.value;
            state.currentPage = 1;
            loadOrders();
        }, 300);
    });

    // Pagination
    document.getElementById('prevPageBtn')?.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            loadOrders();
        }
    });

    document.getElementById('nextPageBtn')?.addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
            state.currentPage++;
            loadOrders();
        }
    });

    // Confirm Delete
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', executeDelete);

    // Modal discount/shipping change
    document.getElementById('discountAmount')?.addEventListener('change', updateTotals);
    document.getElementById('shippingFee')?.addEventListener('change', updateTotals);

    // Invoice image upload
    document.getElementById('invoiceImageInput')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const uploadBox = document.getElementById('invoiceImageUpload');
                uploadBox.classList.add('has-image');
                uploadBox.innerHTML = `<img src="${event.target.result}" alt="Invoice">`;
            };
            reader.readAsDataURL(file);
        }
    });

    // Clipboard paste for images
    document.addEventListener('paste', (e) => {
        const modal = document.getElementById('orderModal');
        if (!modal.classList.contains('active')) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                const reader = new FileReader();
                reader.onload = (event) => {
                    // Check if focused on invoice upload
                    const uploadBox = document.getElementById('invoiceImageUpload');
                    uploadBox.classList.add('has-image');
                    uploadBox.innerHTML = `<img src="${event.target.result}" alt="Invoice">`;
                };
                reader.readAsDataURL(file);
                break;
            }
        }
    });
}

// =====================================================
// INITIALIZATION
// =====================================================

async function init() {
    console.log('Initializing Purchase Orders module...');

    // Initialize Firebase
    if (!initializeFirebase()) {
        console.warn('Firebase not ready, retrying...');
        setTimeout(init, 1000);
        return;
    }

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Set default date
    document.getElementById('orderDate').value = new Date().toISOString().split('T')[0];

    // Initialize event listeners
    initEventListeners();

    // Load initial data
    await loadOrders();

    console.log('Purchase Orders module initialized successfully');
}

// Make functions globally available
window.openCreateOrderModal = openCreateOrderModal;
window.closeOrderModal = closeOrderModal;
window.addNewProduct = addNewProduct;
window.removeProduct = removeProduct;
window.duplicateProduct = duplicateProduct;
window.saveDraft = saveDraft;
window.createOrder = createOrderHandler;
window.editOrder = editOrder;
window.confirmDeleteOrder = confirmDeleteOrder;
window.closeConfirmModal = closeConfirmModal;
window.copyOrderHandler = copyOrderHandler;
window.downloadOrder = downloadOrder;
window.goToPage = goToPage;
window.updateItemField = updateItemField;
window.updateItemQuantity = updateItemQuantity;
window.updateItemPrice = updateItemPrice;
window.openVariantPicker = openVariantPicker;
window.editSku = editSku;
window.saveItem = saveItem;
window.uploadProductImage = uploadProductImage;
window.uploadPriceImage = uploadPriceImage;
window.triggerInvoiceUpload = triggerInvoiceUpload;
window.toggleShippingInput = toggleShippingInput;
window.openProductSelector = openProductSelector;

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Also try on window load as fallback
window.addEventListener('load', () => {
    if (!db) {
        init();
    }
});
