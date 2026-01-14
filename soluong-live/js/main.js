/**
 * Soluong-Live Main Application
 * ES Module version
 */

// Import Firebase helper functions
import {
    addProductToFirebase,
    addProductsToFirebase,
    removeProductFromFirebase,
    updateProductQtyInFirebase,
    updateProductVisibility,
    cleanupOldProducts,
    clearAllProducts,
    loadAllProductsFromFirebase,
    setupFirebaseChildListeners,
    getProductsArray,
    saveCartSnapshot,
    getCartSnapshot,
    getAllCartSnapshots,
    restoreProductsFromSnapshot,
    deleteCartSnapshot,
    logSaleTransaction,
    getSalesLogByDate,
    getAllSalesLogs
} from './firebase-helpers.js';

// State variables
let productsData = [];
let isLoadingExcel = false;
let bearerToken = null;
let tokenExpiry = null;
let soluongProducts = {}; // Object-based structure: { product_123: {...}, product_456: {...} }
let filteredProductsInList = []; // For search in product list
let listSearchKeyword = ''; // Current search keyword for product list
let filteredHiddenProducts = []; // For search in hidden product list
let hiddenListSearchKeyword = ''; // Current search keyword for hidden product list
let isSyncMode = false;
let autoAddVariants = true; // Mặc định BẬT chế độ tự động thêm variants

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    databaseURL: "https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let isSyncingFromFirebase = false;

function checkSyncMode() {
    const hash = window.location.hash.substring(1);
    isSyncMode = hash.includes('sync') || hash.includes('admin');
    updateExpandListLink();
}

function updateExpandListLink() {
    const btnExpandList = document.getElementById('btnExpandList');
    if (btnExpandList) {
        if (isSyncMode) {
            btnExpandList.href = 'soluong-list.html#sync';
        } else {
            btnExpandList.href = 'soluong-list.html';
        }
    }
}

function sortVariants(variants) {
    // Define size order
    const sizeOrder = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

    return [...variants].sort((a, b) => {
        const nameA = a.NameGet || '';
        const nameB = b.NameGet || '';

        // Extract number in parentheses (1), (2), (3), etc.
        const numberMatchA = nameA.match(/\((\d+)\)/);
        const numberMatchB = nameB.match(/\((\d+)\)/);

        // If both have numbers, sort by number
        if (numberMatchA && numberMatchB) {
            return parseInt(numberMatchA[1]) - parseInt(numberMatchB[1]);
        }

        // Extract size in parentheses (S), (M), (L), etc.
        const sizeMatchA = nameA.match(/\((S|M|L|XL|XXL|XXXL)\)/i);
        const sizeMatchB = nameB.match(/\((S|M|L|XL|XXL|XXXL)\)/i);

        // If both have sizes, sort by size order
        if (sizeMatchA && sizeMatchB) {
            const sizeA = sizeMatchA[1].toUpperCase();
            const sizeB = sizeMatchB[1].toUpperCase();
            const indexA = sizeOrder.indexOf(sizeA);
            const indexB = sizeOrder.indexOf(sizeB);

            // If both sizes are in the order list
            if (indexA !== -1 && indexB !== -1) {
                return indexA - indexB;
            }
            // If only one is in the list, prioritize it
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
        }

        // If one has number and other has size, number comes first
        if (numberMatchA && sizeMatchB) return -1;
        if (sizeMatchA && numberMatchB) return 1;

        // If one has pattern and other doesn't, pattern comes first
        if ((numberMatchA || sizeMatchA) && !(numberMatchB || sizeMatchB)) return -1;
        if ((numberMatchB || sizeMatchB) && !(numberMatchA || sizeMatchA)) return 1;

        // Default: alphabetical sort
        return nameA.localeCompare(nameB);
    });
}

function cleanProductForFirebase(product) {
    const cleanProduct = {
        Id: typeof product.Id === 'object' ? product.Id?.Id : product.Id,
        NameGet: String(product.NameGet || ''),
        QtyAvailable: Number(product.QtyAvailable) || 0,
        soldQty: Number(product.soldQty) || 0,
        remainingQty: Number(product.remainingQty) || 0,
        imageUrl: product.imageUrl ? String(product.imageUrl) : null,
        ProductTmplId: typeof product.ProductTmplId === 'object' ? product.ProductTmplId?.Id : product.ProductTmplId,
        ListPrice: Number(product.ListPrice) || 0, // Price for display
        PriceVariant: Number(product.PriceVariant) || 0, // Variant price for display
        addedAt: product.addedAt || Date.now(), // Timestamp for auto-cleanup
        isHidden: product.isHidden || false, // Hidden status
        lastRefreshed: product.lastRefreshed || null // Timestamp for image cache-busting
    };
    return cleanProduct;
}

function cleanProductsArray(products) {
    if (!Array.isArray(products)) return [];
    return products.map(p => cleanProductForFirebase(p));
}

async function cleanupOldProductsLocal() {
    const initialCount = Object.keys(soluongProducts).length;

    try {
        const result = await cleanupOldProducts(database, soluongProducts);

        if (result.removed > 0) {
            console.log(`🗑️ Đã xóa ${result.removed} sản phẩm cũ hơn 7 ngày`);
            updateProductListPreview();
            showNotificationMessage(`🗑️ Đã xóa ${result.removed} sản phẩm cũ hơn 7 ngày`);
        }
    } catch (error) {
        console.error('❌ Lỗi cleanup:', error);
    }
}

async function clearAllProductsLocal() {
    const count = Object.keys(soluongProducts).length;

    if (count === 0) {
        showNotificationMessage('⚠️ Danh sách đã trống');
        return;
    }

    if (confirm(`Bạn có chắc muốn xóa tất cả ${count} sản phẩm không?`)) {
        try {
            await clearAllProducts(database, soluongProducts);
            updateProductListPreview();
            showNotificationMessage('🗑️ Đã xóa tất cả sản phẩm');
        } catch (error) {
            console.error('❌ Lỗi xóa tất cả:', error);
            showNotificationMessage('❌ Lỗi: ' + error.message);
        }
    }
}

// ============================================================================
// CART HISTORY / SNAPSHOT FUNCTIONS
// ============================================================================

// Global variables for cart history
let soluongCartHistorySnapshots = [];
let pendingRestoreSnapshotId = null;

/**
 * Calculate cart statistics
 */
function calculateCartStats(products) {
    const productArray = Object.values(products);

    return {
        productCount: productArray.length,
        totalItems: productArray.reduce((sum, p) => sum + (p.QtyAvailable || 0), 0),
        visibleCount: productArray.filter(p => !p.isHidden).length,
        hiddenCount: productArray.filter(p => p.isHidden).length,
        soldItemsCount: productArray.reduce((sum, p) => sum + (p.soldQty || 0), 0),
        remainingItemsCount: productArray.reduce((sum, p) => sum + (p.remainingQty || p.QtyAvailable || 0), 0)
    };
}

/**
 * Format date time for display
 */
function formatDateTime(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} - ${hours}:${minutes}`;
}

/**
 * Save current cart and refresh
 */
async function saveCartAndRefresh() {
    const productCount = Object.keys(soluongProducts).length;

    if (productCount === 0) {
        showNotificationMessage('⚠️ Giỏ hàng đang trống, không có gì để lưu');
        return;
    }

    const defaultName = `Giỏ hàng ${formatDateTime(new Date())}`;
    const customName = prompt('Đặt tên cho giỏ hàng này:', defaultName);

    if (customName === null) return; // User cancelled

    const snapshotName = customName.trim() || defaultName;
    const description = prompt('Mô tả (tùy chọn):', '') || '';

    if (!confirm(`Lưu giỏ hàng với ${productCount} sản phẩm và làm mới?`)) {
        return;
    }

    try {
        const stats = calculateCartStats(soluongProducts);
        const snapshot = {
            metadata: {
                savedAt: Date.now(),
                name: snapshotName,
                description: description,
                productCount: stats.productCount,
                totalItems: stats.totalItems,
                visibleCount: stats.visibleCount,
                hiddenCount: stats.hiddenCount,
                soldItemsCount: stats.soldItemsCount,
                remainingItemsCount: stats.remainingItemsCount
            },
            products: { ...soluongProducts }
        };

        await saveCartSnapshot(database, snapshot);
        await clearAllProducts(database, soluongProducts);

        updateProductListPreview();
        await refreshCartHistory();

        showNotificationMessage('✅ Đã lưu giỏ hàng và làm mới thành công!');

    } catch (error) {
        console.error('Error saving cart:', error);
        showNotificationMessage('❌ Lỗi: ' + error.message);
    }
}

/**
 * Refresh cart history list
 */
async function refreshCartHistory() {
    try {
        const snapshots = await getAllCartSnapshots(database);
        soluongCartHistorySnapshots = snapshots;
        renderCartHistoryList(snapshots); // Show all snapshots
    } catch (error) {
        console.error('Error loading cart history:', error);
    }
}

/**
 * Filter cart history by selected date
 */
function filterCartHistoryByDate() {
    const dateInput = document.getElementById('snapshotDateFilter');
    if (!dateInput || !dateInput.value) {
        renderCartHistoryList(soluongCartHistorySnapshots);
        return;
    }

    const selectedDate = new Date(dateInput.value);
    selectedDate.setHours(0, 0, 0, 0);

    const filtered = soluongCartHistorySnapshots.filter(snapshot => {
        const snapshotDate = new Date(snapshot.metadata.savedAt);
        snapshotDate.setHours(0, 0, 0, 0);
        return snapshotDate.getTime() === selectedDate.getTime();
    });

    renderCartHistoryList(filtered);

    if (filtered.length === 0) {
        const container = document.getElementById('soluongCartHistoryList');
        if (container) {
            container.innerHTML = '<div class="no-history">Không tìm thấy snapshot nào trong ngày này</div>';
        }
    }
}

/**
 * Clear date filter and show all snapshots
 */
function clearDateFilter() {
    const dateInput = document.getElementById('snapshotDateFilter');
    if (dateInput) {
        dateInput.value = '';
    }
    renderCartHistoryList(soluongCartHistorySnapshots);
}

/**
 * Render cart history list
 */
function renderCartHistoryList(snapshots) {
    const container = document.getElementById('soluongCartHistoryList');

    if (!container) return;

    if (snapshots.length === 0) {
        container.innerHTML = '<div class="no-history">Chưa có lịch sử giỏ hàng</div>';
        return;
    }

    container.innerHTML = snapshots.map(snapshot => {
        const snapshotId = snapshot.id;
        const meta = snapshot.metadata;

        return `
            <div class="snapshot-card" data-snapshot-id="${snapshotId}">
                <div class="snapshot-header">
                    <div class="snapshot-name">${meta.name}</div>
                    <div class="snapshot-date">${formatDateTime(meta.savedAt)}</div>
                </div>

                <div class="snapshot-stats">
                    <span>📦 ${meta.productCount}</span>
                    <span>🛒 ${meta.soldItemsCount}</span>
                    <span>📊 ${meta.remainingItemsCount}</span>
                </div>

                ${meta.description ? `<div class="snapshot-desc">${meta.description}</div>` : ''}

                <div class="snapshot-actions">
                    <button onclick="viewSnapshot('${snapshotId}')" class="btn-view" title="Xem chi tiết">👁️</button>
                    <button onclick="restoreSnapshot('${snapshotId}')" class="btn-restore" title="Khôi phục">♻️</button>
                    <button onclick="deleteSnapshot('${snapshotId}')" class="btn-delete" title="Xóa">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * View snapshot details
 */
async function viewSnapshot(snapshotId) {
    try {
        const snapshot = await getCartSnapshot(database, snapshotId);

        if (!snapshot) {
            showNotificationMessage('❌ Không tìm thấy giỏ hàng này');
            return;
        }

        // Populate modal
        document.getElementById('snapshotModalTitle').textContent = snapshot.metadata.name;
        document.getElementById('snapshotModalInfo').innerHTML = `
            <div>📅 Lưu lúc: ${formatDateTime(snapshot.metadata.savedAt)}</div>
            <div>📦 Tổng sản phẩm: ${snapshot.metadata.productCount}</div>
            <div>🛒 Đã bán: ${snapshot.metadata.soldItemsCount}</div>
            <div>📊 Còn lại: ${snapshot.metadata.remainingItemsCount}</div>
            ${snapshot.metadata.description ? `<div>📝 Mô tả: ${snapshot.metadata.description}</div>` : ''}
        `;

        // Render products
        renderSnapshotProducts(snapshot.products);

        // Show modal
        const modal = document.getElementById('snapshotViewModal');
        modal.style.display = 'flex';
        modal.dataset.snapshotId = snapshotId;

    } catch (error) {
        console.error('Error viewing snapshot:', error);
        showNotificationMessage('❌ Lỗi: ' + error.message);
    }
}

/**
 * Render snapshot products in modal
 */
function renderSnapshotProducts(products) {
    const grid = document.getElementById('snapshotProductsGrid');
    if (!grid) return;

    const productArray = Object.values(products);

    grid.innerHTML = productArray.map(product => {
        const price = Math.round((product.PriceVariant || product.ListPrice || 0) / 1000);
        const imageUrl = product.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E';

        return `
            <div class="snapshot-product-card">
                <img src="${imageUrl}" alt="${product.NameGet}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23ddd%22 width=%22200%22 height=%22200%22/%3E%3Ctext fill=%22%23999%22 x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E'">
                <div class="product-name">${product.NameGet} ${price}K</div>
                <div class="product-stats">
                    <span>📦 ${product.QtyAvailable}</span>
                    <span>🛒 ${product.soldQty || 0}</span>
                    <span>📊 ${product.remainingQty || product.QtyAvailable}</span>
                </div>
                ${product.isHidden ? '<div class="hidden-badge">Đã ẩn</div>' : ''}
            </div>
        `;
    }).join('');
}

/**
 * Close snapshot view modal
 */
function closeSnapshotModal() {
    const modal = document.getElementById('snapshotViewModal');
    if (modal) {
        modal.style.display = 'none';
        delete modal.dataset.snapshotId;
    }
}

/**
 * Restore snapshot from modal (safer wrapper)
 */
async function restoreSnapshotFromModal() {
    const modal = document.getElementById('snapshotViewModal');
    const snapshotId = modal?.dataset?.snapshotId;

    console.log('DEBUG: Restore from modal, snapshotId:', snapshotId);

    if (!snapshotId) {
        console.error('DEBUG: No snapshotId found in modal dataset');
        showNotificationMessage('❌ Lỗi: Không xác định được ID giỏ hàng');
        return;
    }

    await restoreSnapshot(snapshotId);
}

/**
 * Restore snapshot with auto-save protection
 */
async function restoreSnapshot(snapshotId) {
    console.log('DEBUG: restoreSnapshot() called with snapshotId:', snapshotId);

    const currentProductCount = Object.keys(soluongProducts).length;
    console.log('DEBUG: Current cart has', currentProductCount, 'products');

    // Validate snapshotId
    if (!snapshotId) {
        console.error('DEBUG: snapshotId is null/undefined in restoreSnapshot()!');
        showNotificationMessage('❌ Lỗi: ID giỏ hàng không hợp lệ');
        return;
    }

    // Store snapshot ID for later use
    pendingRestoreSnapshotId = snapshotId;
    console.log('DEBUG: Set pendingRestoreSnapshotId to:', pendingRestoreSnapshotId);

    // If current cart is empty, restore directly
    if (currentProductCount === 0) {
        console.log('DEBUG: Cart is empty, restore directly');
        if (confirm('Khôi phục giỏ hàng này?')) {
            await performRestore(snapshotId, false, null);
        }
        return;
    }

    // Show smart restore dialog
    console.log('DEBUG: Cart has products, showing restore dialog');
    showRestoreConfirmDialog(snapshotId, currentProductCount);
}

/**
 * Show restore confirmation dialog
 */
function showRestoreConfirmDialog(snapshotId, currentProductCount) {
    // Update current cart count
    document.getElementById('currentCartCount').textContent = currentProductCount;

    // Generate default auto-save name
    const defaultName = `Giỏ hàng trước khi khôi phục - ${formatDateTime(new Date())}`;
    document.getElementById('autoSaveName').value = defaultName;

    // Reset checkbox to checked (default behavior)
    const checkbox = document.getElementById('autoSaveBeforeRestore');
    checkbox.checked = true;

    // Show name input
    document.getElementById('autoSaveNameInput').style.display = 'block';

    // Show modal
    document.getElementById('restoreConfirmModal').style.display = 'flex';
}

/**
 * Toggle auto-save name input visibility
 */
function toggleAutoSaveInput() {
    const checkbox = document.getElementById('autoSaveBeforeRestore');
    const nameInput = document.getElementById('autoSaveNameInput');
    nameInput.style.display = checkbox.checked ? 'block' : 'none';
}

/**
 * Confirm and execute restore
 */
async function confirmRestore() {
    const shouldAutoSave = document.getElementById('autoSaveBeforeRestore').checked;
    const autoSaveName = shouldAutoSave ? document.getElementById('autoSaveName').value.trim() : null;

    console.log('DEBUG: confirmRestore() called');
    console.log('DEBUG: pendingRestoreSnapshotId:', pendingRestoreSnapshotId);
    console.log('DEBUG: shouldAutoSave:', shouldAutoSave);
    console.log('DEBUG: autoSaveName:', autoSaveName);

    // Validate pendingRestoreSnapshotId exists
    if (!pendingRestoreSnapshotId) {
        console.error('DEBUG: pendingRestoreSnapshotId is null/undefined!');
        showNotificationMessage('❌ Lỗi: Không xác định được ID giỏ hàng cần khôi phục');
        closeRestoreConfirmModal();
        return;
    }

    // Validate auto-save name if needed
    if (shouldAutoSave && !autoSaveName) {
        showNotificationMessage('⚠️ Vui lòng nhập tên cho giỏ hàng sẽ lưu');
        return;
    }

    // IMPORTANT: Save snapshotId to local variable BEFORE closing modal
    // Because closeRestoreConfirmModal() sets pendingRestoreSnapshotId = null
    const snapshotIdToRestore = pendingRestoreSnapshotId;
    console.log('DEBUG: Saved snapshotIdToRestore:', snapshotIdToRestore);

    // Close modal
    closeRestoreConfirmModal();

    // Perform restore with auto-save (use local variable)
    await performRestore(snapshotIdToRestore, shouldAutoSave, autoSaveName);
}

/**
 * Close restore confirm modal
 */
function closeRestoreConfirmModal() {
    document.getElementById('restoreConfirmModal').style.display = 'none';
    pendingRestoreSnapshotId = null;
}

/**
 * Perform the actual restore operation
 */
async function performRestore(snapshotId, shouldAutoSave, autoSaveName) {
    try {
        // Step 1: Auto-save current cart if needed
        if (shouldAutoSave && Object.keys(soluongProducts).length > 0) {
            showNotificationMessage('💾 Đang lưu giỏ hàng hiện tại...');

            const stats = calculateCartStats(soluongProducts);
            const currentSnapshot = {
                metadata: {
                    savedAt: Date.now(),
                    name: autoSaveName,
                    description: '(Tự động lưu trước khi khôi phục)',
                    productCount: stats.productCount,
                    totalItems: stats.totalItems,
                    visibleCount: stats.visibleCount,
                    hiddenCount: stats.hiddenCount,
                    soldItemsCount: stats.soldItemsCount,
                    remainingItemsCount: stats.remainingItemsCount
                },
                products: { ...soluongProducts }
            };

            await saveCartSnapshot(database, currentSnapshot);
            showNotificationMessage('✅ Đã lưu giỏ hàng hiện tại');

            // Refresh history to show the new snapshot
            await refreshCartHistory();
        }

        // Step 2: Load snapshot to restore
        showNotificationMessage('🔄 Đang tải giỏ hàng...');

        console.log('DEBUG: Restoring snapshot ID:', snapshotId);
        const snapshot = await getCartSnapshot(database, snapshotId);
        console.log('DEBUG: Snapshot loaded:', snapshot);

        if (!snapshot) {
            console.error('DEBUG: Snapshot is null or undefined');
            showNotificationMessage('❌ Không tìm thấy giỏ hàng');
            return;
        }

        if (!snapshot.products) {
            console.error('DEBUG: Snapshot.products is missing. Snapshot structure:', snapshot);
            showNotificationMessage('❌ Dữ liệu giỏ hàng không hợp lệ (thiếu products)');
            return;
        }

        const productCount = Object.keys(snapshot.products).length;
        if (productCount === 0) {
            console.error('DEBUG: Snapshot.products is empty');
            showNotificationMessage('❌ Giỏ hàng không có sản phẩm');
            return;
        }

        console.log('DEBUG: Snapshot has', productCount, 'products');

        // Step 3: Clear current products
        showNotificationMessage('🗑️ Đang xóa giỏ hàng hiện tại...');
        await clearAllProducts(database, soluongProducts);

        // Step 4: Restore products from snapshot
        showNotificationMessage('♻️ Đang khôi phục sản phẩm...');
        await restoreProductsFromSnapshot(database, snapshot.products, soluongProducts);

        // Step 5: Update UI
        updateProductListPreview();

        // Close any open modals
        closeSnapshotModal();

        // Show success message
        const successMsg = shouldAutoSave
            ? `✅ Đã lưu giỏ cũ và khôi phục ${snapshot.metadata.productCount} sản phẩm`
            : `✅ Đã khôi phục ${snapshot.metadata.productCount} sản phẩm`;

        showNotificationMessage(successMsg);

    } catch (error) {
        console.error('Error restoring snapshot:', error);
        showNotificationMessage('❌ Lỗi: ' + error.message);
    }
}

/**
 * Delete snapshot
 */
async function deleteSnapshot(snapshotId) {
    if (!confirm('⚠️ Xóa giỏ hàng đã lưu này?\n\nHành động này không thể hoàn tác.')) {
        return;
    }

    try {
        await deleteCartSnapshot(database, snapshotId);
        await refreshCartHistory();
        showNotificationMessage('🗑️ Đã xóa giỏ hàng đã lưu');

    } catch (error) {
        console.error('Error deleting snapshot:', error);
        showNotificationMessage('❌ Lỗi: ' + error.message);
    }
}

/**
 * Toggle cart history section collapse/expand
 */
function toggleCartHistory() {
    const list = document.getElementById('soluongCartHistoryList');
    const icon = document.getElementById('soluongCartHistoryToggleIcon');
    const dateFilter = document.getElementById('dateFilterContainer');

    if (!list || !icon) return;

    const isCollapsed = list.classList.contains('collapsed');

    if (isCollapsed) {
        // Expand
        list.classList.remove('collapsed');
        icon.classList.add('expanded');
        if (dateFilter) dateFilter.style.display = 'block';
        // Save state to localStorage
        localStorage.setItem('soluongCartHistoryExpanded', 'true');
    } else {
        // Collapse
        list.classList.add('collapsed');
        icon.classList.remove('expanded');
        if (dateFilter) dateFilter.style.display = 'none';
        // Save state to localStorage
        localStorage.setItem('soluongCartHistoryExpanded', 'false');
    }
}

/**
 * Initialize cart history collapse state from localStorage
 */
function initCartHistoryState() {
    const list = document.getElementById('soluongCartHistoryList');
    const icon = document.getElementById('soluongCartHistoryToggleIcon');
    const dateFilter = document.getElementById('dateFilterContainer');

    if (!list || !icon) return;

    // Check saved state (default is collapsed)
    const isExpanded = localStorage.getItem('soluongCartHistoryExpanded') === 'true';

    if (isExpanded) {
        list.classList.remove('collapsed');
        icon.classList.add('expanded');
        if (dateFilter) dateFilter.style.display = 'block';
    } else {
        list.classList.add('collapsed');
        icon.classList.remove('expanded');
        if (dateFilter) dateFilter.style.display = 'none';
    }
}

async function getAuthToken() {
    try {
        const response = await fetch('https://tomato.tpos.vn/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=password&username=nvkt&password=Aa%40123456789&client_id=tmtWebApp'
        });

        if (!response.ok) {
            throw new Error('Không thể xác thực');
        }

        const data = await response.json();
        bearerToken = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in * 1000);

        localStorage.setItem('bearerToken', bearerToken);
        localStorage.setItem('tokenExpiry', tokenExpiry.toString());

        console.log('✅ Đã xác thực thành công');
        return bearerToken;
    } catch (error) {
        console.error('❌ Lỗi xác thực:', error);
        throw error;
    }
}

async function getValidToken() {
    const storedToken = localStorage.getItem('bearerToken');
    const storedExpiry = localStorage.getItem('tokenExpiry');

    if (storedToken && storedExpiry) {
        const expiry = parseInt(storedExpiry);
        if (expiry > Date.now() + 300000) {
            bearerToken = storedToken;
            tokenExpiry = expiry;
            console.log('✅ Sử dụng token đã lưu');
            return bearerToken;
        }
    }

    return await getAuthToken();
}

async function authenticatedFetch(url, options = {}) {
    const token = await getValidToken();

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (response.status === 401) {
        console.log('🔄 Token hết hạn, đang lấy token mới...');
        const newToken = await getAuthToken();
        headers.Authorization = `Bearer ${newToken}`;

        return fetch(url, {
            ...options,
            headers
        });
    }

    return response;
}

function logoutUser() {
    if (confirm('Bạn có chắc muốn đăng xuất?')) {
        // Clear all auth data
        localStorage.removeItem('bearerToken');
        localStorage.removeItem('tokenExpiry');
        sessionStorage.removeItem('loginindex_auth');
        localStorage.removeItem('loginindex_auth');

        // Redirect to home page
        window.location.href = 'https://nhijudyshop.github.io/n2store/';
    }
}

function removeVietnameseTones(str) {
    if (!str) return '';
    str = str.toLowerCase();
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
    str = str.replace(/đ/g, 'd');
    return str;
}

async function loadExcelData() {
    if (isLoadingExcel || productsData.length > 0) return;

    isLoadingExcel = true;
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.style.display = 'block';

    try {
        const response = await authenticatedFetch('https://tomato.tpos.vn/Product/ExportFileWithVariantPrice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: { Active: "true" },
                ids: ""
            })
        });

        if (!response.ok) {
            throw new Error('Không thể tải dữ liệu sản phẩm');
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        productsData = jsonData.map(row => ({
            id: row['Id sản phẩm (*)'],
            name: row['Tên sản phẩm'],
            nameNoSign: removeVietnameseTones(row['Tên sản phẩm'] || ''),
            code: row['Mã sản phẩm']
        }));

        console.log(`Đã load ${productsData.length} sản phẩm`);
    } catch (error) {
        console.error('Error loading Excel:', error);
        alert('Lỗi khi tải dữ liệu sản phẩm: ' + error.message);
    } finally {
        loadingIndicator.style.display = 'none';
        isLoadingExcel = false;
    }
}

function searchProducts(searchText) {
    if (!searchText || searchText.length < 2) return [];

    const searchLower = searchText.toLowerCase();
    const searchNoSign = removeVietnameseTones(searchText);

    // Filter products that match
    const matchedProducts = productsData.filter(product => {
        // Match in product name (no Vietnamese tones)
        const matchName = product.nameNoSign.includes(searchNoSign);

        // Match in original name (lowercase, for special chars like [Q5X1])
        const matchNameOriginal = product.name && product.name.toLowerCase().includes(searchLower);

        // Match in product code
        const matchCode = product.code && product.code.toLowerCase().includes(searchLower);

        return matchName || matchNameOriginal || matchCode;
    });

    // Sort by priority: match in [] first, then code, then name
    matchedProducts.sort((a, b) => {
        // Extract text within [] brackets
        const extractBracket = (name) => {
            const match = name?.match(/\[([^\]]+)\]/);
            return match ? match[1].toLowerCase().trim() : '';
        };

        const aBracket = extractBracket(a.name);
        const bBracket = extractBracket(b.name);

        // Check if search term matches in brackets
        const aMatchInBracket = aBracket && aBracket.includes(searchLower);
        const bMatchInBracket = bBracket && bBracket.includes(searchLower);

        // Priority 1: Match in brackets
        if (aMatchInBracket && !bMatchInBracket) return -1;
        if (!aMatchInBracket && bMatchInBracket) return 1;

        // Priority 2: Among bracket matches, exact match comes first
        if (aMatchInBracket && bMatchInBracket) {
            const aExactMatch = aBracket === searchLower;
            const bExactMatch = bBracket === searchLower;
            if (aExactMatch && !bExactMatch) return -1;
            if (!aExactMatch && bExactMatch) return 1;

            // If both exact or both not exact, sort by bracket length (shorter first)
            if (aBracket.length !== bBracket.length) {
                return aBracket.length - bBracket.length;
            }

            // If same length, sort alphabetically
            return aBracket.localeCompare(bBracket);
        }

        // Priority 3: Match in product code
        const aMatchInCode = a.code && a.code.toLowerCase().includes(searchLower);
        const bMatchInCode = b.code && b.code.toLowerCase().includes(searchLower);

        if (aMatchInCode && !bMatchInCode) return -1;
        if (!aMatchInCode && bMatchInCode) return 1;

        // Priority 4: Sort alphabetically by product name
        return a.name.localeCompare(b.name);
    });

    return matchedProducts.slice(0, 10);
}

function displaySuggestions(suggestions) {
    const suggestionsDiv = document.getElementById('suggestions');

    if (suggestions.length === 0) {
        suggestionsDiv.classList.remove('show');
        return;
    }

    suggestionsDiv.innerHTML = suggestions.map(product => `
        <div class="suggestion-item" data-id="${product.id}">
            <strong>${product.code || ''}</strong> - ${product.name}
        </div>
    `).join('');

    suggestionsDiv.classList.add('show');

    suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const productId = item.dataset.id;
            loadProductDetails(productId);
            suggestionsDiv.classList.remove('show');
            document.getElementById('productSearch').value = item.textContent.trim();
        });
    });
}

async function loadProductDetails(productId) {
    try {
        const response = await authenticatedFetch(
            `https://tomato.tpos.vn/odata/Product(${productId})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues`
        );

        if (!response.ok) {
            throw new Error('Không thể tải thông tin sản phẩm');
        }

        const productData = await response.json();
        let imageUrl = productData.ImageUrl;
        let templateData = null;

        // Load template to get image and variants
        if (productData.ProductTmplId) {
            try {
                const templateResponse = await authenticatedFetch(
                    `https://tomato.tpos.vn/odata/ProductTemplate(${productData.ProductTmplId})?$expand=UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues)`
                );

                if (templateResponse.ok) {
                    templateData = await templateResponse.json();
                    if (!imageUrl) {
                        imageUrl = templateData.ImageUrl;
                    }
                }
            } catch (fallbackError) {
                console.error('Error loading template:', fallbackError);
            }
        }

        // Check if auto-add variants is enabled and variants exist
        if (autoAddVariants && templateData && templateData.ProductVariants && templateData.ProductVariants.length > 0) {
            // Filter only active variants (Active === true)
            const activeVariants = templateData.ProductVariants.filter(v => v.Active === true);

            // Sort variants by number (1), (2), (3)... and size (S), (M), (L), (XL), (XXL), (XXXL)
            const sortedVariants = sortVariants(activeVariants);

            // Check if there are active variants after filtering
            if (sortedVariants.length === 0) {
                // No active variants, fallback to single product
                const tposQty = productData.QtyAvailable || 0;
                // Auto-use TPOS quantity without prompting
                const qtyAvailable = tposQty;
                const addSuccess = await addProductToList({
                    Id: productData.Id,
                    NameGet: productData.NameGet,
                    QtyAvailable: qtyAvailable,
                    ProductTmplId: productData.ProductTmplId,
                    ListPrice: productData.ListPrice || 0,
                    PriceVariant: productData.PriceVariant || 0,
                    imageUrl: imageUrl,
                    soldQty: 0,
                    remainingQty: qtyAvailable
                }, true);

                if (addSuccess) {
                    document.getElementById('productSearch').value = '';
                }
                return; // Exit early
            }

            // Prepare all variants for batch add
            const variantsToAdd = sortedVariants.map(variant => {
                const tposQty = variant.QtyAvailable || 0;
                // Auto-use TPOS quantity without prompting
                const qtyAvailable = tposQty;
                const variantImageUrl = variant.ImageUrl || imageUrl; // Use variant image or fallback to template image

                return cleanProductForFirebase({
                    Id: variant.Id,
                    NameGet: variant.NameGet,
                    QtyAvailable: qtyAvailable,
                    ProductTmplId: productData.ProductTmplId,
                    ListPrice: variant.ListPrice || 0,
                    PriceVariant: variant.PriceVariant || 0,
                    imageUrl: variantImageUrl,
                    soldQty: 0,
                    remainingQty: qtyAvailable,
                    isHidden: false // Variants are visible
                });
            });

            // Use batch add helper (only variants, no main product)
            try {
                const result = await addProductsToFirebase(database, variantsToAdd, soluongProducts);

                updateProductListPreview();

                const totalAdded = result.added;
                const totalUpdated = result.updated;

                if (totalAdded > 0 && totalUpdated > 0) {
                    showNotificationMessage(`✅ Đã thêm ${totalAdded} biến thể mới, cập nhật ${totalUpdated} biến thể (giữ nguyên số lượng đã bán)`);
                } else if (totalUpdated > 0) {
                    showNotificationMessage(`🔄 Đã cập nhật ${totalUpdated} biến thể (giữ nguyên số lượng đã bán)`);
                } else if (totalAdded > 0) {
                    showNotificationMessage(`✅ Đã thêm ${totalAdded} biến thể sản phẩm`);
                }

                document.getElementById('productSearch').value = '';
            } catch (error) {
                console.error('❌ Error saving variants to Firebase:', error);
                showNotificationMessage('⚠️ Lỗi đồng bộ Firebase: ' + error.message);
            }
        } else {
            // Add single product (original behavior)
            const tposQty = productData.QtyAvailable || 0;
            // Auto-use TPOS quantity without prompting
            const qtyAvailable = tposQty;
            const addSuccess = addProductToList({
                Id: productData.Id,
                NameGet: productData.NameGet,
                QtyAvailable: qtyAvailable,
                ProductTmplId: productData.ProductTmplId,
                ListPrice: productData.ListPrice || 0,
                PriceVariant: productData.PriceVariant || 0,
                imageUrl: imageUrl,
                soldQty: 0,
                remainingQty: qtyAvailable
            }, true);

            if (addSuccess) {
                document.getElementById('productSearch').value = '';
            }
        }
    } catch (error) {
        console.error('Error loading product:', error);
        showNotificationMessage('❌ Lỗi: ' + error.message);
    }
}

async function addProductToList(product, showNotification = true) {
    try {
        const cleanProduct = cleanProductForFirebase(product);

        if (!isSyncingFromFirebase) {
            const result = await addProductToFirebase(database, cleanProduct, soluongProducts);

            if (showNotification) {
                if (result.action === 'updated') {
                    showNotificationMessage('🔄 Đã cập nhật thông tin sản phẩm (giữ nguyên số lượng đã bán)');
                } else {
                    showNotificationMessage('✅ Đã thêm sản phẩm vào danh sách');
                }
            }
        } else {
            // During sync from Firebase, just add to local object
            const productKey = `product_${cleanProduct.Id}`;
            const existingProduct = soluongProducts[productKey];

            if (existingProduct) {
                soluongProducts[productKey] = {
                    ...cleanProduct,
                    soldQty: existingProduct.soldQty || 0,
                    remainingQty: cleanProduct.QtyAvailable - (existingProduct.soldQty || 0),
                    addedAt: existingProduct.addedAt || cleanProduct.addedAt,
                    lastRefreshed: Date.now()
                };
            } else {
                soluongProducts[productKey] = cleanProduct;
            }
        }

        updateProductListPreview();

        return true;
    } catch (error) {
        console.error('❌ Lỗi thêm sản phẩm:', error);
        showNotificationMessage('❌ Lỗi: ' + error.message);
        return false;
    }
}

function updateProductListPreview() {
    const productListSection = document.getElementById('productListSection');
    const productListPreview = document.getElementById('productListPreview');
    const productCount = document.getElementById('productCount');

    // Filter visible (not hidden) products
    const visibleProducts = Object.values(soluongProducts).filter(p => !p.isHidden);

    if (visibleProducts.length === 0) {
        productListSection.style.display = 'none';
    } else {
        productListSection.style.display = 'block';
    }

    // Use filtered products if searching, otherwise use all visible products
    const productsToDisplay = listSearchKeyword ? filteredProductsInList : visibleProducts;

    productCount.textContent = listSearchKeyword
        ? `${productsToDisplay.length}/${visibleProducts.length}`
        : visibleProducts.length;

    // Group products by ProductTmplId to keep variants together
    const groupedProducts = {};
    productsToDisplay.forEach(product => {
        const tmplId = product.ProductTmplId || product.Id;
        if (!groupedProducts[tmplId]) {
            groupedProducts[tmplId] = {
                products: [],
                maxAddedAt: 0
            };
        }
        groupedProducts[tmplId].products.push(product);
        // Track latest addedAt for sorting groups
        groupedProducts[tmplId].maxAddedAt = Math.max(
            groupedProducts[tmplId].maxAddedAt,
            product.addedAt || 0
        );
    });

    // Sort each group's variants, then sort groups by addedAt (recent first)
    const sortedGroups = Object.values(groupedProducts)
        .map(group => ({
            products: sortVariants(group.products),
            maxAddedAt: group.maxAddedAt
        }))
        .sort((a, b) => b.maxAddedAt - a.maxAddedAt);

    // Flatten groups to get final sorted product list
    const recentProducts = sortedGroups.flatMap(group => group.products);

    productListPreview.innerHTML = recentProducts.map(product => {
        const imageHtml = product.imageUrl
            ? `<img src="${product.imageUrl}" class="preview-image" alt="${product.NameGet}">`
            : `<div class="preview-image no-image">📦</div>`;

        return `
            <div class="preview-item">
                ${imageHtml}
                <div class="preview-info">
                    <div class="preview-name">${product.NameGet}</div>
                    <div class="preview-stats">
                        <span>📦 Tổng: ${product.QtyAvailable}</span>
                        <div class="qty-control">
                            <button class="qty-btn" onclick="updateProductQty(${product.Id}, -1)">−</button>
                            <span class="qty-value">${product.soldQty}</span>
                            <button class="qty-btn" onclick="updateProductQty(${product.Id}, 1)">+</button>
                        </div>
                        <span>✅ Còn: ${product.remainingQty}</span>
                    </div>
                </div>
                <div class="preview-actions">
                    <button class="btn-change-image" onclick="changeProductImage(${product.Id})">🖼️ Đổi ảnh</button>
                    <button class="btn-remove" onclick="removeProduct(${product.Id})">🗑️ Xóa</button>
                </div>
            </div>
        `;
    }).join('');

    // Update hidden products list
    updateHiddenProductListPreview();
}

function updateHiddenProductListPreview() {
    const hiddenProductsSection = document.getElementById('hiddenProductsSection');
    const hiddenProductListPreview = document.getElementById('hiddenProductListPreview');
    const hiddenProductCount = document.getElementById('hiddenProductCount');

    // Filter hidden products
    const hiddenProducts = Object.values(soluongProducts).filter(p => p.isHidden);

    if (hiddenProducts.length === 0) {
        hiddenProductsSection.style.display = 'none';
        return;
    }

    hiddenProductsSection.style.display = 'block';

    // Use filtered products if searching, otherwise use all hidden products
    const productsToDisplay = hiddenListSearchKeyword ? filteredHiddenProducts : hiddenProducts;

    hiddenProductCount.textContent = hiddenListSearchKeyword
        ? `${productsToDisplay.length}/${hiddenProducts.length}`
        : hiddenProducts.length;

    const recentProducts = [...productsToDisplay].reverse();

    hiddenProductListPreview.innerHTML = recentProducts.map(product => {
        const imageHtml = product.imageUrl
            ? `<img src="${product.imageUrl}" class="preview-image" alt="${product.NameGet}">`
            : `<div class="preview-image no-image">📦</div>`;

        return `
            <div class="preview-item">
                ${imageHtml}
                <div class="preview-info">
                    <div class="preview-name">${product.NameGet}</div>
                    <div class="preview-stats">
                        <span>📦 Tổng: ${product.QtyAvailable}</span>
                        <div class="qty-control">
                            <button class="qty-btn" onclick="updateProductQty(${product.Id}, -1)">−</button>
                            <span class="qty-value">${product.soldQty}</span>
                            <button class="qty-btn" onclick="updateProductQty(${product.Id}, 1)">+</button>
                        </div>
                        <span>✅ Còn: ${product.remainingQty}</span>
                    </div>
                </div>
                <div class="preview-actions">
                    <button class="btn-change-image" onclick="changeProductImage(${product.Id})">🖼️ Đổi ảnh</button>
                    <button class="btn-remove" onclick="unhideProduct(${product.Id})" style="background: #28a745;">👁️ Hiện</button>
                    <button class="btn-remove" onclick="removeProduct(${product.Id})">🗑️ Xóa</button>
                </div>
            </div>
        `;
    }).join('');
}

async function unhideProduct(productId) {
    if (!isSyncingFromFirebase) {
        try {
            await updateProductVisibility(database, productId, false, soluongProducts);
            updateProductListPreview();
            updateHiddenProductListPreview();
            showNotificationMessage('👁️ Đã hiện sản phẩm');
        } catch (error) {
            console.error('❌ Lỗi hiện sản phẩm:', error);
        }
    }
}

async function updateProductQty(productId, change) {
    if (!isSyncingFromFirebase) {
        try {
            await updateProductQtyInFirebase(database, productId, change, soluongProducts);
            updateProductListPreview();
            updateHiddenProductListPreview();
        } catch (error) {
            console.error('❌ Lỗi cập nhật số lượng:', error);
        }
    }
}

async function removeProduct(productId) {
    if (confirm('Bạn có chắc muốn xóa sản phẩm này?')) {
        try {
            if (!isSyncingFromFirebase) {
                await removeProductFromFirebase(database, productId, soluongProducts);
            }

            // Re-apply search if active
            if (listSearchKeyword) {
                performListSearch(listSearchKeyword);
            } else {
                updateProductListPreview();
            }

            // Also update hidden products list
            if (hiddenListSearchKeyword) {
                performHiddenListSearch(hiddenListSearchKeyword);
            } else {
                updateHiddenProductListPreview();
            }

            showNotificationMessage('🗑️ Đã xóa sản phẩm');
        } catch (error) {
            console.error('❌ Lỗi xóa sản phẩm:', error);
            showNotificationMessage('❌ Lỗi: ' + error.message);
        }
    }
}

// Image Modal State
let currentEditingProductId = null;
let currentImageData = null; // Store base64 or URL

function changeProductImage(productId) {
    const productKey = `product_${productId}`;
    const product = soluongProducts[productKey];
    if (!product) {
        showNotificationMessage('❌ Không tìm thấy sản phẩm');
        return;
    }

    currentEditingProductId = productId;
    currentImageData = null;

    // Pre-fill link input if product has existing image
    const linkInput = document.getElementById('linkInput');
    if (linkInput && product.imageUrl) {
        linkInput.value = product.imageUrl;
        handleLinkInput({ target: linkInput });
    }

    // Open modal
    const modal = document.getElementById('imageModalOverlay');
    modal.classList.add('show');

    // Focus on paste area by default
    setTimeout(() => {
        document.getElementById('pasteArea').focus();
    }, 100);
}

function closeImageModal() {
    const modal = document.getElementById('imageModalOverlay');
    modal.classList.remove('show');

    // Reset state
    currentEditingProductId = null;
    currentImageData = null;

    // Reset all tabs
    resetPasteTab();
    resetUploadTab();
    resetCameraTab();
    resetLinkTab();

    // Switch back to paste tab
    switchImageTab('paste');
}

function switchImageTab(tabName) {
    // Update tab buttons
    const tabs = document.querySelectorAll('.image-modal-tab');
    tabs.forEach(tab => tab.classList.remove('active'));

    // Update tab contents
    const contents = document.querySelectorAll('.image-modal-content');
    contents.forEach(content => content.classList.remove('active'));

    // Activate selected tab
    if (tabName === 'paste') {
        tabs[0].classList.add('active');
        document.getElementById('pasteTab').classList.add('active');
    } else if (tabName === 'upload') {
        tabs[1].classList.add('active');
        document.getElementById('uploadTab').classList.add('active');
    } else if (tabName === 'camera') {
        tabs[2].classList.add('active');
        document.getElementById('cameraTab').classList.add('active');
    } else if (tabName === 'link') {
        tabs[3].classList.add('active');
        document.getElementById('linkTab').classList.add('active');
    }
}

function resetPasteTab() {
    const pasteArea = document.getElementById('pasteArea');
    const pastePreview = document.getElementById('pastePreview');
    pasteArea.classList.remove('has-image');
    pastePreview.classList.remove('show');
    pastePreview.src = '';
}

function resetUploadTab() {
    const uploadArea = document.getElementById('fileUploadArea');
    const uploadPreview = document.getElementById('uploadPreview');
    const fileInput = document.getElementById('fileUploadInput');
    uploadArea.classList.remove('has-image');
    uploadPreview.classList.remove('show');
    uploadPreview.src = '';
    fileInput.value = '';
}

function resetLinkTab() {
    const linkInput = document.getElementById('linkInput');
    const linkPreviewContainer = document.getElementById('linkPreviewContainer');
    const linkPreviewImage = document.getElementById('linkPreviewImage');
    linkInput.value = '';
    linkPreviewContainer.classList.remove('show');
    linkPreviewImage.src = '';
}

function resetCameraTab() {
    stopCamera();
    const cameraPreview = document.getElementById('cameraPreview');
    cameraPreview.classList.remove('show');
    cameraPreview.src = '';
}

// Camera functionality
let cameraStream = null;
let currentFacingMode = 'environment'; // 'user' for front, 'environment' for back

async function startCamera() {
    try {
        // Request camera permission
        const constraints = {
            video: {
                facingMode: currentFacingMode,
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        };

        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);

        // Set video source
        const video = document.getElementById('cameraVideo');
        video.srcObject = cameraStream;

        // Show video, hide message
        const cameraMessage = document.getElementById('cameraMessage');
        cameraMessage.style.display = 'none';
        video.style.display = 'block';

        // Update button visibility
        document.getElementById('btnStartCamera').style.display = 'none';
        document.getElementById('btnSwitchCamera').style.display = 'flex';
        document.getElementById('btnCapturePhoto').style.display = 'flex';
        document.getElementById('btnStopCamera').style.display = 'flex';

        showNotificationMessage('✅ Đã bật camera');
    } catch (error) {
        console.error('Error accessing camera:', error);
        showNotificationMessage('❌ Không thể truy cập camera: ' + error.message);
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;

        const video = document.getElementById('cameraVideo');
        const cameraMessage = document.getElementById('cameraMessage');

        video.style.display = 'none';
        cameraMessage.style.display = 'flex';

        // Update button visibility
        document.getElementById('btnStartCamera').style.display = 'flex';
        document.getElementById('btnSwitchCamera').style.display = 'none';
        document.getElementById('btnCapturePhoto').style.display = 'none';
        document.getElementById('btnStopCamera').style.display = 'none';
    }
}

async function switchCamera() {
    // Toggle facing mode
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

    // Restart camera with new facing mode
    stopCamera();
    await startCamera();
}

function capturePhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    const preview = document.getElementById('cameraPreview');

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64
    const base64 = canvas.toDataURL('image/jpeg', 0.9);
    currentImageData = base64;

    // Show preview
    preview.src = base64;
    preview.classList.add('show');

    // Stop camera after capture
    stopCamera();

    showNotificationMessage('📸 Đã chụp ảnh thành công');
}

// Paste Image Handler
function focusPasteArea() {
    const pasteArea = document.getElementById('pasteArea');
    pasteArea.focus();
}

// Listen for paste events in the modal
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('imageModalOverlay');

    modal.addEventListener('paste', (e) => {
        // Only handle if modal is open and paste tab is active
        const isModalOpen = modal.classList.contains('show');
        const isPasteTabActive = document.getElementById('pasteTab').classList.contains('active');

        if (!isModalOpen || !isPasteTabActive) return;

        handlePaste(e);
    });
});

function handlePaste(e) {
    e.preventDefault();

    const items = (e.clipboardData || e.originalEvent.clipboardData).items;

    for (let item of items) {
        if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            const reader = new FileReader();

            reader.onload = (event) => {
                const base64 = event.target.result;
                currentImageData = base64;

                // Show preview
                const pastePreview = document.getElementById('pastePreview');
                const pasteArea = document.getElementById('pasteArea');

                pastePreview.src = base64;
                pastePreview.classList.add('show');
                pasteArea.classList.add('has-image');

                showNotificationMessage('✅ Đã paste ảnh thành công');
            };

            reader.readAsDataURL(blob);
            return;
        }
    }

    showNotificationMessage('⚠️ Không tìm thấy ảnh trong clipboard');
}

// Upload File Handler
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showNotificationMessage('⚠️ Vui lòng chọn file ảnh');
        return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
        const base64 = e.target.result;
        currentImageData = base64;

        // Show preview
        const uploadPreview = document.getElementById('uploadPreview');
        const uploadArea = document.getElementById('fileUploadArea');

        uploadPreview.src = base64;
        uploadPreview.classList.add('show');
        uploadArea.classList.add('has-image');

        showNotificationMessage('✅ Đã chọn file thành công');
    };

    reader.readAsDataURL(file);
}

// Drag and Drop for Upload
document.addEventListener('DOMContentLoaded', () => {
    const uploadArea = document.getElementById('fileUploadArea');

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');

        const file = e.dataTransfer.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showNotificationMessage('⚠️ Vui lòng chọn file ảnh');
            return;
        }

        const reader = new FileReader();

        reader.onload = (event) => {
            const base64 = event.target.result;
            currentImageData = base64;

            // Show preview
            const uploadPreview = document.getElementById('uploadPreview');

            uploadPreview.src = base64;
            uploadPreview.classList.add('show');
            uploadArea.classList.add('has-image');

            showNotificationMessage('✅ Đã tải ảnh lên thành công');
        };

        reader.readAsDataURL(file);
    });
});

// Link Input Handler
function handleLinkInput(event) {
    const url = event.target.value.trim();
    const linkPreviewContainer = document.getElementById('linkPreviewContainer');
    const linkPreviewImage = document.getElementById('linkPreviewImage');

    if (!url) {
        linkPreviewContainer.classList.remove('show');
        currentImageData = null;
        return;
    }

    // Set current image data to URL
    currentImageData = url;

    // Show preview
    linkPreviewImage.src = url;
    linkPreviewContainer.classList.add('show');

    // Handle image load errors
    linkPreviewImage.onerror = () => {
        showNotificationMessage('⚠️ Không thể tải ảnh từ URL này');
        linkPreviewContainer.classList.remove('show');
        currentImageData = null;
    };
}

// Save Image Change
function saveImageChange() {
    if (!currentEditingProductId) {
        showNotificationMessage('❌ Không tìm thấy sản phẩm');
        return;
    }

    const productKey = `product_${currentEditingProductId}`;
    const product = soluongProducts[productKey];
    if (!product) {
        showNotificationMessage('❌ Không tìm thấy sản phẩm');
        return;
    }

    const newImageUrl = currentImageData || null;
    const timestamp = Date.now();

    // Update the image URL (can be null, base64, or URL)
    product.imageUrl = newImageUrl;
    product.lastRefreshed = timestamp;

    // If product has a template (is a variant), update all products with same template
    let updatedCount = 1;
    const updates = {};
    updates[`soluongProducts/${productKey}/imageUrl`] = newImageUrl;
    updates[`soluongProducts/${productKey}/lastRefreshed`] = timestamp;

    if (product.ProductTmplId) {
        const templateId = product.ProductTmplId;

        // Find and update all products with the same ProductTmplId (including main product and all variants)
        Object.entries(soluongProducts).forEach(([key, p]) => {
            if (p.ProductTmplId === templateId && p.Id !== product.Id) {
                p.imageUrl = newImageUrl;
                p.lastRefreshed = timestamp;
                updates[`soluongProducts/${key}/imageUrl`] = newImageUrl;
                updates[`soluongProducts/${key}/lastRefreshed`] = timestamp;
                updatedCount++;
            }
        });

        console.log(`🖼️ Updated image for ${updatedCount} products with template ID ${templateId}`);
    }

    // Sync to Firebase
    if (!isSyncingFromFirebase) {
        database.ref().update(updates).then(() => {
            console.log(`✅ Updated image for product ${product.NameGet}`);
            if (updatedCount > 1) {
                showNotificationMessage(`🖼️ Đã cập nhật hình ảnh cho ${updatedCount} sản phẩm cùng nhóm`);
            } else {
                showNotificationMessage('🖼️ Đã cập nhật hình ảnh sản phẩm');
            }
            closeImageModal();
        }).catch(error => {
            console.error('❌ Lỗi sync products lên Firebase:', error);
            showNotificationMessage('⚠️ Lỗi đồng bộ Firebase: ' + error.message);
        });
    }

    // Update UI
    updateProductListPreview();
    updateHiddenProductListPreview();
}

function performListSearch(keyword) {
    listSearchKeyword = keyword.trim();

    if (!listSearchKeyword) {
        filteredProductsInList = [];
        updateProductListPreview();
        return;
    }

    const searchLower = listSearchKeyword.toLowerCase();
    const searchNoSign = removeVietnameseTones(listSearchKeyword);

    // Filter visible products that match
    const visibleProducts = Object.values(soluongProducts).filter(p => !p.isHidden);
    const matchedProducts = visibleProducts.filter(product => {
        // Match in product name (no Vietnamese tones)
        const nameNoSign = removeVietnameseTones(product.NameGet || '');
        const matchName = nameNoSign.includes(searchNoSign);

        // Match in original name (lowercase, for special chars like [Q5X1])
        const matchNameOriginal = product.NameGet && product.NameGet.toLowerCase().includes(searchLower);

        return matchName || matchNameOriginal;
    });

    // Sort by priority: match in [] first
    matchedProducts.sort((a, b) => {
        const extractBracket = (name) => {
            const match = name?.match(/\[([^\]]+)\]/);
            return match ? match[1].toLowerCase().trim() : '';
        };

        const aBracket = extractBracket(a.NameGet);
        const bBracket = extractBracket(b.NameGet);

        const aMatchInBracket = aBracket && aBracket.includes(searchLower);
        const bMatchInBracket = bBracket && bBracket.includes(searchLower);

        if (aMatchInBracket && !bMatchInBracket) return -1;
        if (!aMatchInBracket && bMatchInBracket) return 1;

        if (aMatchInBracket && bMatchInBracket) {
            const aExactMatch = aBracket === searchLower;
            const bExactMatch = bBracket === searchLower;
            if (aExactMatch && !bExactMatch) return -1;
            if (!aExactMatch && bExactMatch) return 1;

            if (aBracket.length !== bBracket.length) {
                return aBracket.length - bBracket.length;
            }

            return aBracket.localeCompare(bBracket);
        }

        return a.NameGet.localeCompare(b.NameGet);
    });

    filteredProductsInList = matchedProducts;
    updateProductListPreview();
}

function clearListSearch() {
    listSearchKeyword = '';
    filteredProductsInList = [];
    document.getElementById('listSearchInput').value = '';
    document.getElementById('listSearchClear').classList.remove('show');
    updateProductListPreview();
}

function performHiddenListSearch(keyword) {
    hiddenListSearchKeyword = keyword.trim();

    if (!hiddenListSearchKeyword) {
        filteredHiddenProducts = [];
        updateHiddenProductListPreview();
        return;
    }

    const searchLower = hiddenListSearchKeyword.toLowerCase();
    const searchNoSign = removeVietnameseTones(hiddenListSearchKeyword);

    // Filter hidden products that match
    const hiddenProducts = Object.values(soluongProducts).filter(p => p.isHidden);
    const matchedProducts = hiddenProducts.filter(product => {
        // Match in product name (no Vietnamese tones)
        const nameNoSign = removeVietnameseTones(product.NameGet || '');
        const matchName = nameNoSign.includes(searchNoSign);

        // Match in original name (lowercase, for special chars like [Q5X1])
        const matchNameOriginal = product.NameGet && product.NameGet.toLowerCase().includes(searchLower);

        return matchName || matchNameOriginal;
    });

    // Sort by priority: match in [] first
    matchedProducts.sort((a, b) => {
        const extractBracket = (name) => {
            const match = name?.match(/\[([^\]]+)\]/);
            return match ? match[1].toLowerCase().trim() : '';
        };

        const aBracket = extractBracket(a.NameGet);
        const bBracket = extractBracket(b.NameGet);

        const aMatchInBracket = aBracket && aBracket.includes(searchLower);
        const bMatchInBracket = bBracket && bBracket.includes(searchLower);

        if (aMatchInBracket && !bMatchInBracket) return -1;
        if (!aMatchInBracket && bMatchInBracket) return 1;

        if (aMatchInBracket && bMatchInBracket) {
            const aExactMatch = aBracket === searchLower;
            const bExactMatch = bBracket === searchLower;
            if (aExactMatch && !bExactMatch) return -1;
            if (!aExactMatch && bExactMatch) return 1;

            if (aBracket.length !== bBracket.length) {
                return aBracket.length - bBracket.length;
            }

            return aBracket.localeCompare(bBracket);
        }

        return a.NameGet.localeCompare(b.NameGet);
    });

    filteredHiddenProducts = matchedProducts;
    updateHiddenProductListPreview();
}

function clearHiddenListSearch() {
    hiddenListSearchKeyword = '';
    filteredHiddenProducts = [];
    document.getElementById('hiddenListSearchInput').value = '';
    document.getElementById('hiddenListSearchClear').classList.remove('show');
    updateHiddenProductListPreview();
}

function showNotificationMessage(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        font-weight: 600;
        animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

// Barcode scanner detection
let lastKeyTime = Date.now();
let isBarcodeScan = false;
let inputBuffer = '';
let barcodeTimeout = null;

document.getElementById('productSearch').addEventListener('input', (e) => {
    const searchText = e.target.value.trim();
    const currentTime = Date.now();
    const timeDiff = currentTime - lastKeyTime;
    lastKeyTime = currentTime;

    // Detect barcode scanner (very fast typing, < 50ms between keys)
    if (timeDiff < 50 && searchText.length > 2) {
        isBarcodeScan = true;
    } else if (timeDiff > 100) {
        isBarcodeScan = false;
    }

    // Clear previous timeout
    if (barcodeTimeout) {
        clearTimeout(barcodeTimeout);
    }

    // If barcode scan detected, wait for completion then auto-search
    if (isBarcodeScan) {
        barcodeTimeout = setTimeout(() => {
            if (productsData.length === 0) {
                loadExcelData().then(() => {
                    autoSearchExactMatch(searchText);
                });
            } else {
                autoSearchExactMatch(searchText);
            }
            isBarcodeScan = false;
        }, 100);
    } else {
        // Manual typing - show suggestions
        if (searchText.length >= 2) {
            if (productsData.length === 0) {
                loadExcelData().then(() => {
                    const results = searchProducts(searchText);
                    displaySuggestions(results);
                });
            } else {
                const results = searchProducts(searchText);
                displaySuggestions(results);
            }
        } else {
            document.getElementById('suggestions').classList.remove('show');
        }
    }
});

function autoSearchExactMatch(searchText) {
    // Try exact match first
    const exactMatch = productsData.find(p =>
        p.code && p.code.toLowerCase() === searchText.toLowerCase()
    );

    if (exactMatch) {
        loadProductDetails(exactMatch.id);
        document.getElementById('suggestions').classList.remove('show');
        document.getElementById('productSearch').value = '';
    } else {
        // If no exact match, try fuzzy search
        const results = searchProducts(searchText);
        if (results.length === 1) {
            loadProductDetails(results[0].id);
            document.getElementById('suggestions').classList.remove('show');
            document.getElementById('productSearch').value = '';
        } else if (results.length > 1) {
            // Multiple results, show suggestions
            displaySuggestions(results);
        }
    }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) {
        document.getElementById('suggestions').classList.remove('show');
    }
});

document.getElementById('productSearch').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const searchText = e.target.value.trim();
        if (searchText) {
            const exactMatch = productsData.find(p =>
                p.code && p.code.toLowerCase() === searchText.toLowerCase()
            );

            if (exactMatch) {
                loadProductDetails(exactMatch.id);
                document.getElementById('suggestions').classList.remove('show');
            } else {
                const results = searchProducts(searchText);
                if (results.length === 1) {
                    loadProductDetails(results[0].id);
                    document.getElementById('suggestions').classList.remove('show');
                }
            }
        }
    }
});

// Auto-focus search input for barcode scanner
document.addEventListener('keydown', (e) => {
    const productSearch = document.getElementById('productSearch');
    const activeElement = document.activeElement;

    // Ignore if already focused on an input/textarea or if modifier keys are pressed
    if (activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey) {
        return;
    }

    // Ignore special keys (arrows, function keys, etc.)
    if (e.key.length > 1 && e.key !== 'Enter' && e.key !== 'Backspace') {
        return;
    }

    // Auto-focus the search input
    productSearch.focus();
});

async function loadSettings() {
    try {
        const snapshot = await database.ref('soluongDisplaySettings').once('value');
        const settings = snapshot.val();
        if (settings) {
            // Frame Display settings
            document.getElementById('settingNameLineClamp').value = settings.nameLineClamp || 1;

            // Layout settings
            document.getElementById('settingColumns').value = settings.columns || 4;
            document.getElementById('settingRows').value = settings.rows || 2;
            document.getElementById('settingGap').value = settings.gap || 15;
            document.getElementById('settingItemHeight').value = settings.itemHeight || 500;

            // Image settings
            document.getElementById('settingImageBorderRadius').value = settings.imageBorderRadius || 8;
            document.getElementById('settingImageBorderWidth').value = settings.imageBorderWidth || 2;
            document.getElementById('settingImageMarginBottom').value = settings.imageMarginBottom || 4;

            // Name settings
            document.getElementById('settingNameFontSize').value = settings.nameFontSize || 13;
            document.getElementById('settingNameFontWeight').value = settings.nameFontWeight || 700;
            document.getElementById('settingNameMargin').value = settings.nameMargin || 3;
            document.getElementById('settingNameLineHeight').value = settings.nameLineHeight || 1.2;

            // Stats settings
            document.getElementById('settingStatsValueSize').value = settings.statsValueSize || 16;
            document.getElementById('settingStatsLabelSize').value = settings.statsLabelSize || 9;
            document.getElementById('settingStatsPadding').value = settings.statsPadding || 3;
            document.getElementById('settingStatsGap').value = settings.statsGap || 4;
            document.getElementById('settingStatsBorderRadius').value = settings.statsBorderRadius || 6;
            document.getElementById('settingStatsMarginTop').value = settings.statsMarginTop || 4;

            // Load autoAddVariants setting
            autoAddVariants = settings.autoAddVariants !== undefined ? settings.autoAddVariants : true;
            document.getElementById('toggleAutoVariants').checked = autoAddVariants;
        }

        // Load Hidden Products Display Settings
        const hiddenSnapshot = await database.ref('hiddenProductsDisplaySettings').once('value');
        const hiddenSettings = hiddenSnapshot.val();
        if (hiddenSettings) {
            document.getElementById('settingHiddenColumns').value = hiddenSettings.columns || 4;
            document.getElementById('settingHiddenRows').value = hiddenSettings.rows || 2;
            document.getElementById('settingHiddenGap').value = hiddenSettings.gap || 15;
        }
    } catch (error) {
        console.error('❌ Error loading settings from Firebase:', error);
    }
}

function applySettings() {
    // Frame Display settings
    const nameLineClamp = parseInt(document.getElementById('settingNameLineClamp').value) || 1;

    // Layout settings
    const columns = parseInt(document.getElementById('settingColumns').value) || 4;
    const rows = parseInt(document.getElementById('settingRows').value) || 2;
    const gap = parseInt(document.getElementById('settingGap').value) || 15;
    const itemHeight = parseInt(document.getElementById('settingItemHeight').value) || 500;

    // Image settings
    const imageBorderRadius = parseInt(document.getElementById('settingImageBorderRadius').value) || 8;
    const imageBorderWidth = parseInt(document.getElementById('settingImageBorderWidth').value) || 2;
    const imageMarginBottom = parseInt(document.getElementById('settingImageMarginBottom').value) || 4;

    // Name settings
    const nameFontSize = parseInt(document.getElementById('settingNameFontSize').value) || 13;
    const nameFontWeight = parseInt(document.getElementById('settingNameFontWeight').value) || 700;
    const nameMargin = parseInt(document.getElementById('settingNameMargin').value) || 3;
    const nameLineHeight = parseFloat(document.getElementById('settingNameLineHeight').value) || 1.2;

    // Stats settings
    const statsValueSize = parseInt(document.getElementById('settingStatsValueSize').value) || 16;
    const statsLabelSize = parseInt(document.getElementById('settingStatsLabelSize').value) || 9;
    const statsPadding = parseInt(document.getElementById('settingStatsPadding').value) || 3;
    const statsGap = parseInt(document.getElementById('settingStatsGap').value) || 4;
    const statsBorderRadius = parseInt(document.getElementById('settingStatsBorderRadius').value) || 6;
    const statsMarginTop = parseInt(document.getElementById('settingStatsMarginTop').value) || 4;

    const settings = {
        // Frame Display
        nameLineClamp: nameLineClamp,

        // Layout
        columns: columns,
        rows: rows,
        gap: gap,
        itemHeight: itemHeight,
        itemsPerPage: columns * rows,

        // Image
        imageBorderRadius: imageBorderRadius,
        imageBorderWidth: imageBorderWidth,
        imageMarginBottom: imageMarginBottom,

        // Name
        nameFontSize: nameFontSize,
        nameFontWeight: nameFontWeight,
        nameMargin: nameMargin,
        nameLineHeight: nameLineHeight,

        // Stats
        statsValueSize: statsValueSize,
        statsLabelSize: statsLabelSize,
        statsPadding: statsPadding,
        statsGap: statsGap,
        statsBorderRadius: statsBorderRadius,
        statsMarginTop: statsMarginTop,

        // Other
        autoAddVariants: autoAddVariants
    };

    if (!isSyncingFromFirebase) {
        database.ref('soluongDisplaySettings').set(settings).catch(error => {
            console.error('❌ Lỗi sync settings lên Firebase:', error);
        });
    }

    if (window.settingsChannel) {
        window.settingsChannel.postMessage({ type: 'settingsChanged', settings: settings });
    }

    showNotificationMessage('💾 Đã lưu cài đặt thành công!');
}

function toggleAutoVariants() {
    autoAddVariants = document.getElementById('toggleAutoVariants').checked;
    
    // Auto save when toggle changes
    const settings = {
        columns: parseInt(document.getElementById('settingColumns').value) || 4,
        rows: parseInt(document.getElementById('settingRows').value) || 2,
        gap: parseInt(document.getElementById('settingGap').value) || 15,
        itemHeight: parseInt(document.getElementById('settingItemHeight').value) || 500,
        nameMargin: parseInt(document.getElementById('settingNameMargin').value) || 3,
        itemsPerPage: (parseInt(document.getElementById('settingColumns').value) || 4) * (parseInt(document.getElementById('settingRows').value) || 2),
        autoAddVariants: autoAddVariants
    };

    if (!isSyncingFromFirebase) {
        database.ref('soluongDisplaySettings').set(settings).catch(error => {
            console.error('❌ Lỗi sync settings lên Firebase:', error);
        });
    }

    const status = autoAddVariants ? 'BẬT' : 'TẮT';
    showNotificationMessage(`🔄 Đã ${status} chế độ tự động thêm tất cả biến thể`);
}

window.settingsChannel = new BroadcastChannel('soluong-settings');

function setupFirebaseListeners() {
    // Setup listeners for displaySettings
    database.ref('soluongDisplaySettings').on('value', (snapshot) => {
        const settings = snapshot.val();
        if (settings && !isSyncingFromFirebase) {
            isSyncingFromFirebase = true;
            console.log('🔥 Settings synced from Firebase');

            // Update autoAddVariants from Firebase
            if (settings.autoAddVariants !== undefined) {
                autoAddVariants = settings.autoAddVariants;
                document.getElementById('toggleAutoVariants').checked = autoAddVariants;
            }

            if (window.settingsChannel) {
                window.settingsChannel.postMessage({ type: 'settingsChanged', settings: settings });
            }

            setTimeout(() => { isSyncingFromFirebase = false; }, 100);
        }
    });

    // Setup child listeners for products (realtime sync)
    setupFirebaseChildListeners(database, soluongProducts, {
        onProductAdded: (product) => {
            if (!isSyncingFromFirebase) {
                console.log('🔥 Product added from Firebase:', product.NameGet);
                updateProductListPreview();
            }
        },
        onProductChanged: (product) => {
            if (!isSyncingFromFirebase) {
                console.log('🔥 Product updated from Firebase:', product.NameGet);
                updateProductListPreview();
            }
        },
        onProductRemoved: (product) => {
            if (!isSyncingFromFirebase) {
                console.log('🔥 Product removed from Firebase:', product.NameGet);
                updateProductListPreview();
            }
        },
        onInitialLoadComplete: () => {
            console.log('✅ Firebase listeners setup complete');
        }
    });
}

async function loadInitialData() {
    try {
        soluongProducts = await loadAllProductsFromFirebase(database);
        console.log('🔥 Loaded from Firebase:', Object.keys(soluongProducts).length, 'products');

        updateProductListPreview();
    } catch (error) {
        console.error('❌ Error loading from Firebase:', error);
        soluongProducts = {};
    }
}

window.addEventListener('load', async () => {
    checkSyncMode();

    try {
        await getValidToken();
        await loadExcelData();

        // Load initial data from Firebase FIRST
        await loadInitialData();

        // THEN setup Firebase listeners for realtime sync
        setupFirebaseListeners();

        // Cleanup products older than 7 days
        cleanupOldProductsLocal();

        // Always update preview to ensure correct visibility
        updateProductListPreview();

        loadSettings();

        // Load cart history
        refreshCartHistory();

        // Initialize cart history collapse state
        initCartHistoryState();

        // Setup list search event listener
        const listSearchInput = document.getElementById('listSearchInput');
        const listSearchClear = document.getElementById('listSearchClear');

        if (listSearchInput) {
            listSearchInput.addEventListener('input', (e) => {
                const value = e.target.value;

                // Show/hide clear button
                if (value) {
                    listSearchClear.classList.add('show');
                } else {
                    listSearchClear.classList.remove('show');
                }

                // Perform search
                performListSearch(value);
            });

            // Handle Escape key to clear search
            listSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    clearListSearch();
                }
            });
        }

        // Setup hidden list search event listener
        const hiddenListSearchInput = document.getElementById('hiddenListSearchInput');
        const hiddenListSearchClear = document.getElementById('hiddenListSearchClear');

        if (hiddenListSearchInput) {
            hiddenListSearchInput.addEventListener('input', (e) => {
                const value = e.target.value;

                // Show/hide clear button
                if (value) {
                    hiddenListSearchClear.classList.add('show');
                } else {
                    hiddenListSearchClear.classList.remove('show');
                }

                // Perform search
                performHiddenListSearch(value);
            });

            // Handle Escape key to clear search
            hiddenListSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    clearHiddenListSearch();
                }
            });
        }
    } catch (error) {
        console.error('Lỗi khởi tạo:', error);
        alert('Không thể kết nối đến hệ thống. Vui lòng thử lại sau.');
    }
});

window.addEventListener('hashchange', () => {
    checkSyncMode();
});

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

function toggleSettingsSidebar() {
    const sidebar = document.getElementById('settingsSidebar');
    const overlay = document.getElementById('settingsSidebarOverlay');

    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
        document.body.style.overflow = '';
    } else {
        sidebar.classList.add('open');
        overlay.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function toggleHiddenProductsSettings() {
    const sidebar = document.getElementById('hiddenSettingsSidebar');
    const overlay = document.getElementById('hiddenSettingsSidebarOverlay');

    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
        document.body.style.overflow = '';
    } else {
        sidebar.classList.add('open');
        overlay.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function openHiddenProductsSettings() {
    toggleHiddenProductsSettings();
}

function applyHiddenProductsSettings() {
    const hiddenColumns = parseInt(document.getElementById('settingHiddenColumns').value) || 4;
    const hiddenRows = parseInt(document.getElementById('settingHiddenRows').value) || 2;
    const hiddenGap = parseInt(document.getElementById('settingHiddenGap').value) || 15;

    const hiddenSettings = {
        columns: hiddenColumns,
        rows: hiddenRows,
        gap: hiddenGap,
        itemsPerPage: hiddenColumns * hiddenRows
    };

    if (!isSyncingFromFirebase) {
        database.ref('hiddenProductsDisplaySettings').set(hiddenSettings).catch(error => {
            console.error('❌ Lỗi sync hidden products settings lên Firebase:', error);
        });
    }

    showNotificationMessage('💾 Đã lưu cài đặt Danh Sách Ẩn thành công!');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const sidebar = document.getElementById('settingsSidebar');
        const hiddenSidebar = document.getElementById('hiddenSettingsSidebar');

        if (sidebar.classList.contains('open')) {
            toggleSettingsSidebar();
        }
        if (hiddenSidebar && hiddenSidebar.classList.contains('open')) {
            toggleHiddenProductsSettings();
        }
    }
});

// =====================================================
// WINDOW EXPORTS (for onclick handlers in HTML)
// =====================================================
Object.assign(window, {
    // Image modal functions
    closeImageModal,
    switchImageTab,
    focusPasteArea,
    startCamera,
    switchCamera,
    capturePhoto,
    stopCamera,
    saveImageChange,

    // Settings functions
    toggleSettingsSidebar,
    toggleHiddenProductsSettings,
    openHiddenProductsSettings,
    applySettings,

    // Product list functions
    clearListSearch,
    clearHiddenListSearch,

    // Cart functions
    clearAllProductsLocal,
    saveCartAndRefresh,
    toggleCartHistory,
    refreshCartHistory,
    clearDateFilter,

    // Auth functions
    logoutUser,

    // Snapshot modal functions
    closeSnapshotModal,
    restoreSnapshotFromModal
});
