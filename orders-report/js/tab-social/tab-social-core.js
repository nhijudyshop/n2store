/**
 * Tab Social Orders - Core Module
 * Initialization, state management, utilities
 */

// ===== GLOBAL STATE =====
const SocialOrderState = {
    orders: [], // All orders from Firebase
    filteredOrders: [], // Orders after filtering
    selectedOrders: new Set(), // Selected order IDs
    tags: [], // Available tags
    isLoading: false,
    currentEditingOrder: null,

    // Filters
    filters: {
        search: '',
        status: 'all',
        source: 'all',
        tag: 'all',
    },
};

// ===== CONSTANTS =====
const SOURCE_CONFIG = {
    manual: { label: 'Thủ công', icon: 'fa-pen', color: '#6b7280' },
    facebook_post: { label: 'Facebook', icon: 'fa-facebook-f', color: '#1877f2' },
    instagram: { label: 'Instagram', icon: 'fa-instagram', color: '#e4405f' },
    tiktok: { label: 'TikTok', icon: 'fa-tiktok', color: '#000000' },
};

const STATUS_CONFIG = {
    draft: { label: 'Nháp', color: '#fbbf24', bgColor: '#fef3c7', textColor: '#92400e' },
    processing: { label: 'Đang xử lý', color: '#3b82f6', bgColor: '#dbeafe', textColor: '#1e40af' },
    completed: { label: 'Hoàn thành', color: '#10b981', bgColor: '#d1fae5', textColor: '#065f46' },
    cancelled: { label: 'Đã hủy', color: '#ef4444', bgColor: '#fee2e2', textColor: '#991b1b' },
};

// ===== MOCK DATA FOR UI TESTING =====
const MOCK_ORDERS = [
    {
        id: 'SO-20260124-0001',
        stt: 1,
        customerName: 'Nguyễn Văn An',
        phone: '0901234567',
        address: '123 Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM',
        postUrl: 'https://facebook.com/n2store/posts/123456',
        postLabel: 'FB Post 24/01',
        source: 'facebook_post',
        products: [
            { productId: 'p1', name: 'Áo thun trắng', code: 'AT001', quantity: 2, price: 150000 },
            { productId: 'p2', name: 'Quần jean xanh', code: 'QJ002', quantity: 1, price: 350000 },
        ],
        totalQuantity: 3,
        totalAmount: 650000,
        tags: [{ id: 'tag_vip', name: 'VIP', color: '#ef4444' }],
        status: 'draft',
        note: 'Khách yêu cầu giao trước 5h',
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now(),
    },
    {
        id: 'SO-20260124-0002',
        stt: 2,
        customerName: 'Trần Thị Bình',
        phone: '0912345678',
        address: '456 Nguyễn Huệ, Quận 1, TP.HCM',
        postUrl: 'https://instagram.com/p/ABC123',
        postLabel: 'IG Post 23/01',
        source: 'instagram',
        products: [{ productId: 'p3', name: 'Váy hoa', code: 'VH003', quantity: 1, price: 450000 }],
        totalQuantity: 1,
        totalAmount: 450000,
        tags: [{ id: 'tag_new', name: 'Khách mới', color: '#10b981' }],
        status: 'processing',
        note: '',
        createdAt: Date.now() - 7200000,
        updatedAt: Date.now(),
    },
    {
        id: 'SO-20260124-0003',
        stt: 3,
        customerName: 'Lê Văn Cường',
        phone: '0923456789',
        address: '789 Trần Hưng Đạo, Quận 5, TP.HCM',
        postUrl: '',
        postLabel: '',
        source: 'manual',
        products: [
            { productId: 'p4', name: 'Giày sneaker', code: 'GS004', quantity: 1, price: 890000 },
        ],
        totalQuantity: 1,
        totalAmount: 890000,
        tags: [],
        status: 'completed',
        note: 'Đã thanh toán COD',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now(),
    },
    {
        id: 'SO-20260124-0004',
        stt: 4,
        customerName: 'Phạm Thị Dung',
        phone: '0934567890',
        address: '321 Điện Biên Phủ, Quận 3, TP.HCM',
        postUrl: 'https://tiktok.com/@n2store/video/123',
        postLabel: 'TikTok 22/01',
        source: 'tiktok',
        products: [
            { productId: 'p5', name: 'Túi xách', code: 'TX005', quantity: 1, price: 550000 },
            { productId: 'p6', name: 'Ví da', code: 'VD006', quantity: 2, price: 250000 },
        ],
        totalQuantity: 3,
        totalAmount: 1050000,
        tags: [
            { id: 'tag_vip', name: 'VIP', color: '#ef4444' },
            { id: 'tag_call', name: 'Đã gọi', color: '#3b82f6' },
        ],
        status: 'draft',
        note: '',
        createdAt: Date.now() - 172800000,
        updatedAt: Date.now(),
    },
    {
        id: 'SO-20260124-0005',
        stt: 5,
        customerName: 'Hoàng Văn Em',
        phone: '0945678901',
        address: '654 Cách Mạng Tháng 8, Quận 10, TP.HCM',
        postUrl: 'https://facebook.com/n2store/posts/789',
        postLabel: 'FB Post 21/01',
        source: 'facebook_post',
        products: [
            { productId: 'p7', name: 'Áo khoác', code: 'AK007', quantity: 1, price: 750000 },
        ],
        totalQuantity: 1,
        totalAmount: 750000,
        tags: [],
        status: 'cancelled',
        note: 'Khách hủy đơn',
        createdAt: Date.now() - 259200000,
        updatedAt: Date.now(),
    },
];

const MOCK_TAGS = [
    { id: 'tag_vip', name: 'VIP', color: '#ef4444' },
    { id: 'tag_new', name: 'Khách mới', color: '#10b981' },
    { id: 'tag_call', name: 'Đã gọi', color: '#3b82f6' },
    { id: 'tag_wait', name: 'Chờ ship', color: '#f59e0b' },
    { id: 'tag_return', name: 'Khách cũ', color: '#8b5cf6' },
];

// ===== UTILITY FUNCTIONS =====
function formatCurrency(amount) {
    if (!amount && amount !== 0) return '0đ';
    return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function generateOrderId() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0');
    return `SO-${dateStr}-${random}`;
}

function showLoading(show = true) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
    SocialOrderState.isLoading = show;
}

function showNotification(message, type = 'success') {
    // Try to use the shared notification system
    if (typeof window.notificationManager !== 'undefined') {
        window.notificationManager.show(message, type);
    } else if (typeof showToast === 'function') {
        showToast(message, type);
    } else {
        // Fallback to alert
        alert(message);
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function () {
    console.log('[Tab Social] Initializing...');
    initSocialTab();
});

async function initSocialTab() {
    try {
        showLoading(true);

        // Load mock data for now (Phase 1 - UI only)
        SocialOrderState.orders = [...MOCK_ORDERS];
        SocialOrderState.tags = [...MOCK_TAGS];
        SocialOrderState.filteredOrders = [...MOCK_ORDERS];

        // Render table
        renderTable();

        // Update stats
        updateStats();

        // Populate tag filter
        populateTagFilter();

        console.log('[Tab Social] Initialized with', SocialOrderState.orders.length, 'orders');
    } catch (error) {
        console.error('[Tab Social] Init error:', error);
        showNotification('Lỗi tải dữ liệu: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function loadOrders() {
    // Reload from mock data (will be Firebase later)
    console.log('[Tab Social] Reloading orders...');
    SocialOrderState.orders = [...MOCK_ORDERS];
    performTableSearch();
    showNotification('Đã tải lại dữ liệu', 'success');
}

// ===== CONTROL BAR =====
function toggleControlBar() {
    const controlBar = document.getElementById('controlBar');
    if (controlBar) {
        controlBar.style.display = controlBar.style.display === 'none' ? 'flex' : 'none';
    }
}

// ===== EXPORT FOR OTHER MODULES =====
window.SocialOrderState = SocialOrderState;
window.SOURCE_CONFIG = SOURCE_CONFIG;
window.STATUS_CONFIG = STATUS_CONFIG;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.generateOrderId = generateOrderId;
window.showLoading = showLoading;
window.showNotification = showNotification;
window.debounce = debounce;
window.loadOrders = loadOrders;
window.toggleControlBar = toggleControlBar;
