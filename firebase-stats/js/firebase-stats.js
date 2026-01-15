/**
 * Firebase Statistics Dashboard
 * Thống kê toàn bộ dữ liệu Firebase sử dụng trong dự án
 */

// =====================================================
// DATA DEFINITIONS
// =====================================================

const FIRESTORE_COLLECTIONS = [
    {
        name: 'users',
        description: 'Thông tin người dùng, permissions, roleTemplate',
        modules: ['login', 'user-management', 'navigation'],
        status: 'active'
    },
    {
        name: 'dathang',
        description: 'Dữ liệu đặt hàng chính',
        modules: ['bangkiemhang', 'hangdat'],
        status: 'active'
    },
    {
        name: 'edit_history',
        description: 'Lịch sử chỉnh sửa của tất cả modules',
        modules: ['lichsuchinhsua', 'all modules'],
        status: 'active'
    },
    {
        name: 'livestream_reports',
        description: 'Báo cáo livestream và orders',
        modules: ['orders-report', 'livestream', 'tpos-pancake'],
        status: 'active'
    },
    {
        name: 'customers',
        description: 'Thông tin khách hàng',
        modules: ['balance-history', 'customer-hub'],
        status: 'active'
    },
    {
        name: 'hangrotxa',
        description: 'Quản lý hàng rớt xa',
        modules: ['hangrotxa'],
        status: 'active'
    },
    {
        name: 'ib',
        description: 'Quản lý inbox/messages',
        modules: ['ib'],
        status: 'active'
    },
    {
        name: 'tokens',
        description: 'Lưu trữ API tokens (TPOS)',
        modules: ['orders-report', 'tpos-pancake'],
        status: 'active'
    },
    {
        name: 'pancake_tokens',
        description: 'Lưu trữ Pancake JWT tokens',
        modules: ['orders-report', 'tpos-pancake'],
        status: 'active'
    },
    {
        name: 'settings',
        description: 'Cài đặt chung (table_name, etc.)',
        modules: ['orders-report'],
        status: 'active'
    },
    {
        name: 'nhanhang',
        description: 'Quản lý nhận hàng',
        modules: ['nhanhang'],
        status: 'active'
    },
    {
        name: 'report_order_details',
        description: 'Chi tiết báo cáo orders (cache)',
        modules: ['orders-report'],
        status: 'active'
    },
    {
        name: 'app_config',
        description: 'Cấu hình ứng dụng, version',
        modules: ['navigation-modern'],
        status: 'active'
    },
    {
        name: 'order-logs',
        description: 'Logs đơn hàng',
        modules: ['soorder'],
        status: 'active'
    },
    {
        name: 'ncc-names',
        description: 'Tên nhà cung cấp',
        modules: ['soorder'],
        status: 'active'
    },
    {
        name: 'employeeRanges',
        description: 'Phân chia dãy nhân viên theo campaign',
        modules: ['orders-report'],
        status: 'active'
    }
];

const REALTIME_NODES = [
    // Active - Order Management
    {
        name: 'cartHistory',
        description: 'Lịch sử giỏ hàng snapshots',
        fileCount: 28,
        status: 'active',
        category: 'order-management'
    },
    {
        name: 'cartHistoryMeta',
        description: 'Metadata của cartHistory',
        fileCount: 6,
        status: 'active',
        category: 'order-management'
    },
    {
        name: 'orderProducts',
        description: 'Sản phẩm trong đơn hàng',
        fileCount: 11,
        status: 'active',
        category: 'order-management'
    },
    {
        name: 'orderProductsMeta',
        description: 'Metadata của orderProducts',
        fileCount: 11,
        status: 'active',
        category: 'order-management'
    },
    {
        name: 'orderDisplaySettings',
        description: 'Cài đặt hiển thị orders',
        fileCount: 14,
        status: 'active',
        category: 'order-management'
    },
    {
        name: 'orderIsMergeVariants',
        description: 'Cài đặt gộp variants',
        fileCount: 2,
        status: 'active',
        category: 'order-management'
    },
    {
        name: 'orderSyncCurrentPage',
        description: 'Sync trang hiện tại',
        fileCount: 14,
        status: 'active',
        category: 'order-management'
    },
    {
        name: 'orderSyncSearchData',
        description: 'Sync dữ liệu tìm kiếm',
        fileCount: 14,
        status: 'active',
        category: 'order-management'
    },
    {
        name: 'hiddenProductsDisplaySettings',
        description: 'Cài đặt hiển thị sản phẩm ẩn',
        fileCount: 3,
        status: 'active',
        category: 'order-management'
    },
    {
        name: 'bulkTagHistory',
        description: 'Lịch sử gắn tag hàng loạt',
        fileCount: 3,
        status: 'active',
        category: 'order-management'
    },
    {
        name: 'bulkTagDeleteHistory',
        description: 'Lịch sử xóa tag hàng loạt',
        fileCount: 3,
        status: 'active',
        category: 'order-management'
    },
    {
        name: 'syncSearchKeyword',
        description: 'Sync từ khóa tìm kiếm',
        fileCount: 4,
        status: 'active',
        category: 'order-management'
    },
    {
        name: 'order_products',
        description: 'Sản phẩm cho chat/message',
        fileCount: 2,
        status: 'active',
        category: 'order-management'
    },

    // Active - Soluong Live
    {
        name: 'soluongProducts',
        description: 'Sản phẩm inventory',
        fileCount: 9,
        status: 'active',
        category: 'soluong-live'
    },
    {
        name: 'soluongProductsMeta',
        description: 'Metadata inventory',
        fileCount: 9,
        status: 'active',
        category: 'soluong-live'
    },
    {
        name: 'soluongDisplaySettings',
        description: 'Cài đặt hiển thị inventory',
        fileCount: 3,
        status: 'active',
        category: 'soluong-live'
    },
    {
        name: 'soluongIsMergeVariants',
        description: 'Gộp variants inventory',
        fileCount: 14,
        status: 'active',
        category: 'soluong-live'
    },
    {
        name: 'soluongSyncCurrentPage',
        description: 'Sync trang inventory',
        fileCount: 15,
        status: 'active',
        category: 'soluong-live'
    },
    {
        name: 'soluongSyncSearchData',
        description: 'Sync search inventory',
        fileCount: 15,
        status: 'active',
        category: 'soluong-live'
    },
    {
        name: 'soluongCartHistory',
        description: 'Lịch sử cart inventory',
        fileCount: 6,
        status: 'active',
        category: 'soluong-live'
    },
    {
        name: 'soluongCartHistoryMeta',
        description: 'Metadata cart inventory',
        fileCount: 6,
        status: 'active',
        category: 'soluong-live'
    },

    // Active - Core Features
    {
        name: 'tag_updates',
        description: 'Sync tags giữa users (multi-user)',
        fileCount: 11,
        status: 'migration',
        category: 'core'
    },
    {
        name: 'dropped_products',
        description: 'Sản phẩm bị drop',
        fileCount: 10,
        status: 'migration',
        category: 'core'
    },
    {
        name: 'dropped_products_history',
        description: 'Lịch sử sản phẩm drop',
        fileCount: 10,
        status: 'migration',
        category: 'core'
    },
    {
        name: 'kpi_base',
        description: 'Dữ liệu KPI thống kê',
        fileCount: 18,
        status: 'migration',
        category: 'core'
    },
    {
        name: 'issue_tracking',
        description: 'Theo dõi issues',
        fileCount: 11,
        status: 'active',
        category: 'core'
    },
    {
        name: 'liveOrderTracking',
        description: 'Theo dõi orders realtime',
        fileCount: 1,
        status: 'active',
        category: 'core'
    },
    {
        name: 'pancake_jwt_token',
        description: 'JWT token Pancake (single)',
        fileCount: 13,
        status: 'active',
        category: 'core'
    },
    {
        name: 'pancake_jwt_tokens',
        description: 'JWT tokens Pancake (multi)',
        fileCount: 13,
        status: 'active',
        category: 'core'
    },
    {
        name: 'pancake_images',
        description: 'Cache hình ảnh Pancake',
        fileCount: 3,
        status: 'active',
        category: 'core'
    },
    {
        name: 'productAssignments',
        description: 'Phân công sản phẩm',
        fileCount: 3,
        status: 'active',
        category: 'core'
    },
    {
        name: 'productAssignments_v2_history',
        description: 'Lịch sử phân công v2',
        fileCount: 3,
        status: 'active',
        category: 'core'
    },
    {
        name: 'settings',
        description: 'Cài đặt chung (employee ranges)',
        fileCount: 12,
        status: 'active',
        category: 'core'
    },
    {
        name: 'report_order_details',
        description: 'Cache chi tiết báo cáo',
        fileCount: 12,
        status: 'active',
        category: 'core'
    },

    // Verify before delete
    {
        name: 'user_campaigns',
        description: 'Campaigns của user',
        fileCount: 2,
        status: 'verify',
        category: 'verify'
    },
    {
        name: 'user_preferences',
        description: 'Preferences của user',
        fileCount: 4,
        status: 'verify',
        category: 'verify'
    },
    {
        name: 'soluongSalesLog',
        description: 'Log bán hàng inventory',
        fileCount: 3,
        status: 'verify',
        category: 'verify'
    },

    // Can be deleted
    {
        name: 'adminCurrentPage',
        description: 'Không còn sử dụng',
        fileCount: 0,
        status: 'deletable',
        category: 'deletable'
    },
    {
        name: 'app_version',
        description: 'Không còn sử dụng',
        fileCount: 0,
        status: 'deletable',
        category: 'deletable'
    },
    {
        name: 'isHideEditControls',
        description: 'Không còn sử dụng',
        fileCount: 0,
        status: 'deletable',
        category: 'deletable'
    },
    {
        name: 'uploadSessionFinalize',
        description: 'Không còn sử dụng',
        fileCount: 0,
        status: 'deletable',
        category: 'deletable'
    }
];

// =====================================================
// DOM ELEMENTS
// =====================================================

const elements = {
    mainContainer: document.getElementById('mainContainer'),
    accessDenied: document.getElementById('accessDenied'),
    firestoreCount: document.getElementById('firestoreCount'),
    realtimeCount: document.getElementById('realtimeCount'),
    firestoreTable: document.getElementById('firestoreTable'),
    realtimeTable: document.getElementById('realtimeTable'),
    btnRefresh: document.getElementById('btnRefresh'),
    tabs: document.querySelectorAll('.tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    filterBtns: document.querySelectorAll('.filter-btn')
};

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    if (!checkAuth()) {
        elements.accessDenied.style.display = 'flex';
        elements.mainContainer.style.display = 'none';
        lucide.createIcons();
        return;
    }

    // Show main container
    elements.mainContainer.style.display = 'flex';
    elements.accessDenied.style.display = 'none';

    // Initialize
    initTabs();
    initFilters();
    renderData();
    setupEventListeners();

    // Initialize Lucide icons
    lucide.createIcons();

    console.log('[Firebase Stats] Initialized');
});

// =====================================================
// AUTHENTICATION
// =====================================================

function checkAuth() {
    try {
        let authData = sessionStorage.getItem('loginindex_auth');
        if (!authData) {
            authData = localStorage.getItem('loginindex_auth');
        }

        if (!authData) return false;

        const auth = JSON.parse(authData);
        return auth.isLoggedIn === 'true' || auth.isLoggedIn === true;
    } catch (error) {
        console.error('[Firebase Stats] Auth check error:', error);
        return false;
    }
}

// =====================================================
// TABS
// =====================================================

function initTabs() {
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;

            // Update active tab
            elements.tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update active content
            elements.tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `tab-${tabId}`) {
                    content.classList.add('active');
                }
            });
        });
    });
}

// =====================================================
// FILTERS
// =====================================================

function initFilters() {
    elements.filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter;

            // Update active filter
            elements.filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Filter table
            filterRealtimeTable(filter);
        });
    });
}

function filterRealtimeTable(filter) {
    const rows = elements.realtimeTable.querySelectorAll('tr');

    rows.forEach(row => {
        const status = row.dataset.status;

        if (filter === 'all') {
            row.style.display = '';
        } else if (filter === status) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// =====================================================
// RENDER DATA
// =====================================================

function renderData() {
    renderFirestoreTable();
    renderRealtimeTable();
    updateCounts();
}

function renderFirestoreTable() {
    const tbody = elements.firestoreTable;
    tbody.innerHTML = '';

    FIRESTORE_COLLECTIONS.forEach(collection => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><code>${collection.name}</code></td>
            <td>${collection.description}</td>
            <td>${collection.modules.join(', ')}</td>
            <td><span class="status ${collection.status}">${getStatusLabel(collection.status)}</span></td>
        `;
        tbody.appendChild(row);
    });
}

function renderRealtimeTable() {
    const tbody = elements.realtimeTable;
    tbody.innerHTML = '';

    REALTIME_NODES.forEach(node => {
        const row = document.createElement('tr');
        row.dataset.status = node.status;
        row.innerHTML = `
            <td><code>${node.name}</code></td>
            <td>${node.description}</td>
            <td>${node.fileCount} files</td>
            <td><span class="status ${node.status}">${getStatusLabel(node.status)}</span></td>
        `;
        tbody.appendChild(row);
    });
}

function getStatusLabel(status) {
    const labels = {
        active: 'Đang dùng',
        deletable: 'Có thể xóa',
        migration: 'Cần migrate',
        verify: 'Cần kiểm tra'
    };
    return labels[status] || status;
}

function updateCounts() {
    elements.firestoreCount.textContent = FIRESTORE_COLLECTIONS.length;
    elements.realtimeCount.textContent = REALTIME_NODES.length;
}

// =====================================================
// EVENT LISTENERS
// =====================================================

function setupEventListeners() {
    // Refresh button
    if (elements.btnRefresh) {
        elements.btnRefresh.addEventListener('click', () => {
            renderData();
            lucide.createIcons();

            // Visual feedback
            elements.btnRefresh.classList.add('loading');
            setTimeout(() => {
                elements.btnRefresh.classList.remove('loading');
            }, 500);
        });
    }
}

// =====================================================
// EXPORTS (for debugging)
// =====================================================

window.FirebaseStats = {
    FIRESTORE_COLLECTIONS,
    REALTIME_NODES,
    renderData,
    filterRealtimeTable
};

console.log('[Firebase Stats] Module loaded');
