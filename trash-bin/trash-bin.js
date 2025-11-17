// Trash Bin Management System
// Handles trash display, restoration, and permanent deletion

// =====================================================
// CONFIGURATION & INITIALIZATION
// =====================================================

// Use centralized Firebase config if available (loaded by core-loader.js)
// Otherwise fall back to local config
const firebaseConfig = window.FIREBASE_CONFIG || {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Initialize Firebase (only if not already initialized)
let app, db;
if (!firebase.apps.length) {
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
} else {
    app = firebase.app();
    db = firebase.firestore();
}

// Global variables
let trashManager = null;
let notificationManager = null;
let trashItems = [];
let selectedItems = new Set();
let currentFilter = 'all';
let searchQuery = '';

// DOM Elements
const tableBody = document.getElementById('tableBody');
const emptyState = document.getElementById('emptyState');
const bulkActions = document.getElementById('bulkActions');
const selectedCount = document.getElementById('selectedCount');
const searchInput = document.getElementById('searchInput');
const pageFilter = document.getElementById('pageFilter');

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function formatDate(date) {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function calculateDaysUntilExpiry(expiresAt) {
    if (!expiresAt) return null;
    const expiry = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
    const now = new Date();
    const diff = expiry - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
}

function formatExpiryBadge(days) {
    if (days === null) return '<span class="expiry-badge normal">Không xác định</span>';

    let badgeClass = 'normal';
    let text = '';

    if (days < 0) {
        badgeClass = 'danger';
        text = 'Đã hết hạn';
    } else if (days === 0) {
        badgeClass = 'danger';
        text = 'Hôm nay';
    } else if (days <= 7) {
        badgeClass = 'warning';
        text = `${days} ngày`;
    } else {
        badgeClass = 'normal';
        text = `${days} ngày`;
    }

    return `<span class="expiry-badge ${badgeClass}">${text}</span>`;
}

function getPageBadge(pageSource) {
    const badges = {
        'ck': '<span class="page-badge ck">Chuyển Khoản</span>',
        'hanghoan': '<span class="page-badge hanghoan">Hàng Hoàn</span>'
    };
    return badges[pageSource] || `<span class="page-badge">${pageSource}</span>`;
}

function getItemInfo(item) {
    // Extract relevant info based on page source
    if (item.pageSource === 'ck') {
        return `${item.transferNote || ''} - ${item.customerInfo || ''} - ${item.transferAmount || ''}`;
    } else if (item.pageSource === 'hanghoan') {
        return `${item.customerInfoValue || ''} - ${item.causeValue || ''} - ${item.totalAmountValue || ''}`;
    }
    return 'N/A';
}

// =====================================================
// DATA LOADING
// =====================================================

async function loadTrashData() {
    try {
        notificationManager.loading('Đang tải dữ liệu thùng rác...');

        // Add timeout protection (30 seconds)
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: Quá thời gian tải dữ liệu')), 30000)
        );

        trashItems = await Promise.race([
            trashManager.getTrashItems(),
            timeoutPromise
        ]);

        renderTable();
        updateStats();

        notificationManager.success('Đã tải dữ liệu thành công', 2000);
    } catch (error) {
        console.error('Error loading trash data:', error);
        notificationManager.error('Lỗi khi tải dữ liệu: ' + error.message);

        // Show empty state on error
        trashItems = [];
        renderTable();
        updateStats();
    }
}

// =====================================================
// TABLE RENDERING
// =====================================================

function renderTable() {
    const filteredItems = getFilteredItems();

    if (filteredItems.length === 0) {
        emptyState.classList.add('show');
        tableBody.innerHTML = '';
        bulkActions.style.display = 'none';
        return;
    }

    emptyState.classList.remove('show');

    tableBody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    filteredItems.forEach(item => {
        const row = createTableRow(item);
        fragment.appendChild(row);
    });

    tableBody.appendChild(fragment);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    updateBulkActionsVisibility();
}

function createTableRow(item) {
    const row = document.createElement('tr');
    row.setAttribute('data-id', item.id);

    const daysUntilExpiry = calculateDaysUntilExpiry(item.expiresAt);
    if (daysUntilExpiry !== null && daysUntilExpiry <= 7) {
        row.classList.add('expiring-soon');
    }

    if (selectedItems.has(item.id)) {
        row.classList.add('selected');
    }

    row.innerHTML = `
        <td>
            <input type="checkbox" class="row-checkbox" data-id="${item.id}" ${selectedItems.has(item.id) ? 'checked' : ''}>
        </td>
        <td>${getPageBadge(item.pageSource)}</td>
        <td class="info-cell" title="${getItemInfo(item)}">${getItemInfo(item)}</td>
        <td>${item.deletedBy || 'Unknown'}</td>
        <td>${formatDate(item.deletedAt)}</td>
        <td>${formatExpiryBadge(daysUntilExpiry)}</td>
        <td>
            <div class="action-buttons">
                <button class="btn-restore" data-id="${item.id}">
                    <i data-lucide="rotate-ccw"></i>
                    Khôi phục
                </button>
                <button class="btn-delete-permanent" data-id="${item.id}">
                    <i data-lucide="trash-2"></i>
                    Xóa vĩnh viễn
                </button>
            </div>
        </td>
    `;

    return row;
}

function getFilteredItems() {
    return trashItems.filter(item => {
        // Page filter
        if (currentFilter !== 'all' && item.pageSource !== currentFilter) {
            return false;
        }

        // Search filter
        if (searchQuery) {
            const itemInfo = getItemInfo(item).toLowerCase();
            const deletedBy = (item.deletedBy || '').toLowerCase();

            if (!itemInfo.includes(searchQuery) && !deletedBy.includes(searchQuery)) {
                return false;
            }
        }

        return true;
    });
}

// =====================================================
// STATS UPDATE
// =====================================================

function updateStats() {
    const total = trashItems.length;
    const ckCount = trashItems.filter(item => item.pageSource === 'ck').length;
    const hangHoanCount = trashItems.filter(item => item.pageSource === 'hanghoan').length;

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));

    const expiringCount = trashItems.filter(item => {
        if (!item.expiresAt) return false;
        const expiry = item.expiresAt.toDate ? item.expiresAt.toDate() : new Date(item.expiresAt);
        return expiry <= sevenDaysFromNow;
    }).length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statCK').textContent = ckCount;
    document.getElementById('statHangHoan').textContent = hangHoanCount;
    document.getElementById('statExpiring').textContent = expiringCount;
}

// =====================================================
// SELECTION MANAGEMENT
// =====================================================

function toggleSelection(itemId) {
    if (selectedItems.has(itemId)) {
        selectedItems.delete(itemId);
    } else {
        selectedItems.add(itemId);
    }

    updateBulkActionsVisibility();
    updateSelectedCount();

    // Update row appearance
    const row = tableBody.querySelector(`tr[data-id="${itemId}"]`);
    if (row) {
        row.classList.toggle('selected', selectedItems.has(itemId));
    }
}

function selectAll(checked) {
    selectedItems.clear();

    if (checked) {
        const filteredItems = getFilteredItems();
        filteredItems.forEach(item => selectedItems.add(item.id));
    }

    renderTable();
    updateSelectedCount();
}

function updateSelectedCount() {
    selectedCount.textContent = `${selectedItems.size} mục được chọn`;
}

function updateBulkActionsVisibility() {
    if (selectedItems.size > 0) {
        bulkActions.style.display = 'flex';
    } else {
        bulkActions.style.display = 'none';
    }
}

// =====================================================
// RESTORE & DELETE FUNCTIONS
// =====================================================

async function restoreItem(itemId) {
    try {
        const item = trashItems.find(i => i.id === itemId);
        if (!item) {
            notificationManager.error('Không tìm thấy mục cần khôi phục');
            return;
        }

        if (!confirm(`Bạn có chắc muốn khôi phục mục này?`)) {
            return;
        }

        notificationManager.loading('Đang khôi phục...');

        // Restore to original collection
        const result = await trashManager.restoreFromTrash(itemId);

        if (result.success && result.items.length > 0) {
            const restoredItem = result.items[0];

            // Add back to original collection
            if (restoredItem.pageSource === 'ck') {
                await restoreToCK(restoredItem.item);
            } else if (restoredItem.pageSource === 'hanghoan') {
                await restoreToHangHoan(restoredItem.item);
            }

            // Delete from trash
            await trashManager.permanentlyDelete(itemId);

            // Remove from local array
            trashItems = trashItems.filter(i => i.id !== itemId);
            selectedItems.delete(itemId);

            renderTable();
            updateStats();

            notificationManager.success('Đã khôi phục thành công', 2000);
        }
    } catch (error) {
        console.error('Error restoring item:', error);
        notificationManager.error('Lỗi khi khôi phục: ' + error.message);
    }
}

async function restoreToCK(item) {
    const ckCollection = db.collection('moneyTransfer');
    const doc = await ckCollection.doc('ck').get();

    if (doc.exists) {
        const data = doc.data();
        const dataArray = data['arrayData'] || [];
        dataArray.push(item);
        await ckCollection.doc('ck').update({ arrayData: dataArray });
    }
}

async function restoreToHangHoan(item) {
    const hangHoanCollection = db.collection('hanghoan');
    const doc = await hangHoanCollection.doc('hanghoan').get();

    if (doc.exists) {
        const data = doc.data();
        const dataArray = data['data'] || [];
        dataArray.push(item);
        await hangHoanCollection.doc('hanghoan').update({ data: dataArray });
    }
}

async function deleteItemPermanently(itemId) {
    try {
        if (!confirm('⚠️ BẠN CÓ CHẮC MUỐN XÓA VĨNH VIỄN MỤC NÀY?\n\nHành động này KHÔNG THỂ HOÀN TÁC!')) {
            return;
        }

        notificationManager.loading('Đang xóa vĩnh viễn...');

        await trashManager.permanentlyDelete(itemId);

        // Remove from local array
        trashItems = trashItems.filter(i => i.id !== itemId);
        selectedItems.delete(itemId);

        renderTable();
        updateStats();

        notificationManager.success('Đã xóa vĩnh viễn', 2000);
    } catch (error) {
        console.error('Error permanently deleting item:', error);
        notificationManager.error('Lỗi khi xóa: ' + error.message);
    }
}

async function bulkRestore() {
    if (selectedItems.size === 0) return;

    if (!confirm(`Bạn có chắc muốn khôi phục ${selectedItems.size} mục đã chọn?`)) {
        return;
    }

    try {
        notificationManager.loading(`Đang khôi phục ${selectedItems.size} mục...`);

        const itemsToRestore = Array.from(selectedItems);

        for (const itemId of itemsToRestore) {
            await restoreItem(itemId);
        }

        selectedItems.clear();
        notificationManager.success(`Đã khôi phục ${itemsToRestore.length} mục thành công`, 3000);
    } catch (error) {
        console.error('Error bulk restoring:', error);
        notificationManager.error('Lỗi khi khôi phục hàng loạt: ' + error.message);
    }
}

async function bulkDelete() {
    if (selectedItems.size === 0) return;

    if (!confirm(`⚠️ BẠN CÓ CHẮC MUỐN XÓA VĨNH VIỄN ${selectedItems.size} MỤC ĐÃ CHỌN?\n\nHành động này KHÔNG THỂ HOÀN TÁC!`)) {
        return;
    }

    try {
        notificationManager.loading(`Đang xóa ${selectedItems.size} mục...`);

        const itemsToDelete = Array.from(selectedItems);
        await trashManager.permanentlyDelete(itemsToDelete);

        // Remove from local array
        trashItems = trashItems.filter(i => !selectedItems.has(i.id));
        selectedItems.clear();

        renderTable();
        updateStats();

        notificationManager.success(`Đã xóa vĩnh viễn ${itemsToDelete.length} mục`, 3000);
    } catch (error) {
        console.error('Error bulk deleting:', error);
        notificationManager.error('Lỗi khi xóa hàng loạt: ' + error.message);
    }
}

async function cleanExpiredItems() {
    if (!confirm('Bạn có chắc muốn xóa tất cả các mục đã hết hạn?')) {
        return;
    }

    try {
        notificationManager.loading('Đang dọn dẹp các mục hết hạn...');

        const result = await trashManager.cleanExpiredItems();

        if (result.success) {
            await loadTrashData();
            notificationManager.success(`Đã dọn dẹp ${result.count} mục hết hạn`, 3000);
        }
    } catch (error) {
        console.error('Error cleaning expired items:', error);
        notificationManager.error('Lỗi khi dọn dẹp: ' + error.message);
    }
}

// =====================================================
// EVENT HANDLERS
// =====================================================

function initializeEventHandlers() {
    // Table clicks
    if (tableBody) {
        tableBody.addEventListener('click', (e) => {
            if (e.target.classList.contains('row-checkbox')) {
                const itemId = e.target.getAttribute('data-id');
                toggleSelection(itemId);
            } else if (e.target.closest('.btn-restore')) {
                const itemId = e.target.closest('.btn-restore').getAttribute('data-id');
                restoreItem(itemId);
            } else if (e.target.closest('.btn-delete-permanent')) {
                const itemId = e.target.closest('.btn-delete-permanent').getAttribute('data-id');
                deleteItemPermanently(itemId);
            }
        });
    }

    // Header checkbox
    const headerCheckbox = document.getElementById('headerCheckbox');
    if (headerCheckbox) {
        headerCheckbox.addEventListener('change', (e) => {
            selectAll(e.target.checked);
        });
    }

    // Select all checkbox
    const selectAllCheckbox = document.getElementById('selectAll');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            selectAll(e.target.checked);
        });
    }

    // Bulk action buttons
    const btnBulkRestore = document.getElementById('btnBulkRestore');
    if (btnBulkRestore) {
        btnBulkRestore.addEventListener('click', bulkRestore);
    }

    const btnBulkDelete = document.getElementById('btnBulkDelete');
    if (btnBulkDelete) {
        btnBulkDelete.addEventListener('click', bulkDelete);
    }

    // Clean expired button
    const btnCleanExpired = document.getElementById('btnCleanExpired');
    if (btnCleanExpired) {
        btnCleanExpired.addEventListener('click', cleanExpiredItems);
    }

    // Refresh button
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', loadTrashData);
    }

    // Search input
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchQuery = e.target.value.toLowerCase();
                renderTable();
            }, 300);
        });
    }

    // Page filter
    if (pageFilter) {
        pageFilter.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            renderTable();
        });
    }
}

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Check authentication
        if (!authManager || !authManager.isAuthenticated()) {
            alert('Phiên đăng nhập hết hạn');
            window.location.href = '../index.html';
            return;
        }

        // Initialize managers
        notificationManager = new NotificationManager();
        trashManager = new TrashManager('trash_bin', db);

        notificationManager.info('Đang khởi tạo hệ thống thùng rác...', 1500);

        // Initialize event handlers
        initializeEventHandlers();

        // Load initial data
        await loadTrashData();

        // Initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        console.log('Trash Bin System initialized successfully');
    } catch (error) {
        console.error('Critical initialization error:', error);
        alert('Lỗi khởi tạo hệ thống: ' + error.message);
    }
});
