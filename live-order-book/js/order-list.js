/**
 * Live Order Book — Display Page (order-list.js)
 * Grid display for large screens / OBS
 * Uses global functions from firebase-helpers-global.js
 */

// ============================================================================
// STATE
// ============================================================================
let database = null;
let currentSessionId = null;
let localProducts = {};
let currentPage = 1;
let itemsPerPage = 8;
let displaySettings = { gridColumns: 4, gridRows: 2, gridGap: 10, fontSize: 14 };
let firebaseListenerHandle = null;
let settingsListenerRef = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

function getSessionId() {
    const urlParams = new URLSearchParams(window.location.search);
    let sessionId = urlParams.get('sessionId');
    if (!sessionId) {
        try { sessionId = localStorage.getItem('liveOrderBook_currentSession'); } catch (e) {}
    }
    return sessionId;
}

function waitForFirebaseHelpers(callback, retries = 20, delay = 200) {
    if (typeof loadAllProductsFromFirebase === 'function' && typeof firebase !== 'undefined') {
        callback();
    } else if (retries > 0) {
        setTimeout(() => waitForFirebaseHelpers(callback, retries - 1, delay), delay);
    } else {
        console.error('❌ Firebase helpers not loaded');
        showEmptyState('Lỗi tải module. Vui lòng refresh trang.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    waitForFirebaseHelpers(init);
});

async function init() {
    database = firebase.database();
    currentSessionId = getSessionId();

    if (!currentSessionId) {
        showEmptyState('Không tìm thấy đợt live. Vui lòng mở từ trang Admin.');
        return;
    }

    console.log('📺 Display Page — Session:', currentSessionId);

    await loadSettings();
    await loadProducts();
    setupSettingsListener();
}

// ============================================================================
// DISPLAY SETTINGS
// ============================================================================

async function loadSettings() {
    try {
        const settings = await loadDisplaySettings(database, currentSessionId);
        displaySettings = settings;
        itemsPerPage = settings.gridColumns * settings.gridRows;
        applySettings();
        console.log('⚙️ Settings loaded:', settings);
    } catch (error) {
        console.error('❌ Error loading settings:', error);
        applySettings();
    }
}

function applySettings() {
    const root = document.documentElement;
    root.style.setProperty('--grid-columns', displaySettings.gridColumns);
    root.style.setProperty('--grid-rows', displaySettings.gridRows);
    root.style.setProperty('--grid-gap', `${displaySettings.gridGap}px`);
    root.style.setProperty('--font-size', `${displaySettings.fontSize}px`);

    itemsPerPage = displaySettings.gridColumns * displaySettings.gridRows;
}

function setupSettingsListener() {
    if (settingsListenerRef) settingsListenerRef.off();

    settingsListenerRef = database.ref(`liveOrderDisplaySettings/${currentSessionId}`);
    settingsListenerRef.on('value', (snapshot) => {
        const settings = snapshot.val();
        if (settings) {
            const defaults = window.DEFAULT_DISPLAY_SETTINGS || { gridColumns: 4, gridRows: 2, gridGap: 10, fontSize: 14 };
            displaySettings = {
                gridColumns: settings.gridColumns ?? defaults.gridColumns,
                gridRows: settings.gridRows ?? defaults.gridRows,
                gridGap: settings.gridGap ?? defaults.gridGap,
                fontSize: settings.fontSize ?? defaults.fontSize
            };
            applySettings();
            updateProductGrid();
            console.log('🔄 Settings updated from Admin:', displaySettings);
        }
    });
}

// ============================================================================
// PRODUCTS
// ============================================================================

async function loadProducts() {
    try {
        localProducts = await loadAllProductsFromFirebase(database, currentSessionId);
        console.log('🔥 Loaded', Object.keys(localProducts).length, 'products');

        if (Object.keys(localProducts).length === 0) {
            showEmptyState();
        } else {
            updateProductGrid();
        }

        setupFirebaseListeners();
    } catch (error) {
        console.error('❌ Error loading products:', error);
        localProducts = {};
        showEmptyState('Lỗi tải sản phẩm.');
    }
}

function setupFirebaseListeners() {
    if (firebaseListenerHandle) firebaseListenerHandle.detach();

    firebaseListenerHandle = setupFirebaseChildListeners(database, currentSessionId, localProducts, {
        onProductAdded: () => updateProductGrid(),
        onProductChanged: () => updateProductGrid(),
        onProductRemoved: () => updateProductGrid(),
        onQtyChanged: (product, productKey) => {
            updateSingleCard(productKey, product);
        },
        onInitialLoadComplete: () => updateProductGrid()
    });
}

// ============================================================================
// GRID RENDERING
// ============================================================================

function getVisibleProducts() {
    return Object.entries(localProducts)
        .filter(([, p]) => !p.isHidden)
        .map(([key, p]) => ({ ...p, _key: key }));
}

function getTotalPages(visibleCount) {
    if (itemsPerPage <= 0) return 1;
    return Math.max(1, Math.ceil(visibleCount / itemsPerPage));
}

function updateProductGrid() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    const visible = getVisibleProducts();
    const totalPages = getTotalPages(visible.length);

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageProducts = visible.slice(startIdx, startIdx + itemsPerPage);

    if (visible.length === 0) {
        showEmptyState();
        return;
    }

    // Restore main content if it was replaced by empty state
    const mainContent = document.getElementById('mainContent');
    if (!mainContent.querySelector('.product-grid')) {
        mainContent.innerHTML = '<div class="product-grid" id="productGrid"></div>';
    }

    const productGrid = document.getElementById('productGrid');
    productGrid.innerHTML = pageProducts.map(p => renderGridCard(p)).join('');

    updatePaginationUI(totalPages);
}

function renderGridCard(product) {
    const key = product._key;
    const name = product.NameGet || 'Không tên';
    const soldQty = product.soldQty || 0;
    const orderedQty = product.orderedQty || 0;
    const imageUrl = product.imageUrl;

    const imageHtml = imageUrl
        ? `<img class="grid-item-image" src="${imageUrl}" alt="${name}" onerror="this.classList.add('no-image');this.outerHTML='<div class=\\'grid-item-image no-image\\'>📦</div>'">`
        : `<div class="grid-item-image no-image">📦</div>`;

    return `
        <div class="grid-item" data-key="${key}">
            ${imageHtml}
            <div class="grid-item-name">
                <span class="grid-item-name-text">${name}</span>
            </div>
            <div class="grid-item-stats">
                <div class="grid-stat grid-stat-total">
                    <div class="grid-stat-label">Tổng</div>
                    <div class="qty-controls">
                        <button class="qty-btn" onclick="changeQty('${key}', -1, 'sold')">−</button>
                        <span class="grid-stat-value" id="sold-${key}">${soldQty}</span>
                        <button class="qty-btn" onclick="changeQty('${key}', 1, 'sold')">+</button>
                    </div>
                </div>
                <div class="grid-stat grid-stat-ordered">
                    <div class="grid-stat-label">Đã đặt</div>
                    <div class="qty-controls">
                        <button class="qty-btn" onclick="changeQty('${key}', -1, 'ordered')">−</button>
                        <span class="grid-stat-value" id="ordered-${key}">${orderedQty}</span>
                        <button class="qty-btn" onclick="changeQty('${key}', 1, 'ordered')">+</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateSingleCard(productKey, product) {
    const soldEl = document.getElementById(`sold-${productKey}`);
    const orderedEl = document.getElementById(`ordered-${productKey}`);
    if (soldEl) soldEl.textContent = product.soldQty || 0;
    if (orderedEl) orderedEl.textContent = product.orderedQty || 0;
}

// ============================================================================
// QTY EDITING
// ============================================================================

function changeQty(productKey, delta, type) {
    if (!localProducts[productKey]) return;

    if (type === 'sold') {
        const current = localProducts[productKey].soldQty || 0;
        const newVal = Math.max(0, current + delta);
        localProducts[productKey].soldQty = newVal;
        const el = document.getElementById(`sold-${productKey}`);
        if (el) el.textContent = newVal;
        updateProductQtyInFirebase(database, currentSessionId, productKey, newVal);
    } else {
        const current = localProducts[productKey].orderedQty || 0;
        const newVal = Math.max(0, current + delta);
        localProducts[productKey].orderedQty = newVal;
        const el = document.getElementById(`ordered-${productKey}`);
        if (el) el.textContent = newVal;
        updateOrderedQtyInFirebase(database, currentSessionId, productKey, newVal);
    }
}

// ============================================================================
// PAGINATION
// ============================================================================

function changePage(direction) {
    const visible = getVisibleProducts();
    const totalPages = getTotalPages(visible.length);
    const newPage = currentPage + direction;

    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        updateProductGrid();
    }
}

function updatePaginationUI(totalPages) {
    const pageInfo = document.getElementById('pageInfo');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');

    if (pageInfo) pageInfo.textContent = `Trang ${currentPage}/${totalPages}`;
    if (btnPrev) btnPrev.disabled = currentPage <= 1;
    if (btnNext) btnNext.disabled = currentPage >= totalPages;

    if (pageInfo) pageInfo.style.display = totalPages > 1 ? '' : 'none';
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function showEmptyState(message) {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
        <div class="empty-state">
            <h2>📦 ${message || 'Chưa có sản phẩm nào'}</h2>
            <p>Vui lòng quay lại trang Admin để thêm sản phẩm</p>
            <a href="index.html" class="btn-back">← Quay lại trang Admin</a>
        </div>
    `;

    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const pageInfo = document.getElementById('pageInfo');
    if (btnPrev) btnPrev.style.display = 'none';
    if (btnNext) btnNext.style.display = 'none';
    if (pageInfo) pageInfo.style.display = 'none';
}

// ============================================================================
// NAV HOVER AREAS
// ============================================================================

(function setupNavHoverAreas() {
    document.addEventListener('DOMContentLoaded', () => {
        const hoverAreas = document.querySelectorAll('.nav-hover-area');
        const btnPrev = document.getElementById('btnPrev');
        const btnNext = document.getElementById('btnNext');

        hoverAreas.forEach(area => {
            area.addEventListener('mouseenter', () => {
                if (area.classList.contains('left') && btnPrev && !btnPrev.disabled) {
                    btnPrev.classList.add('active');
                } else if (area.classList.contains('right') && btnNext && !btnNext.disabled) {
                    btnNext.classList.add('active');
                }
            });
            area.addEventListener('mouseleave', () => {
                if (btnPrev) btnPrev.classList.remove('active');
                if (btnNext) btnNext.classList.remove('active');
            });
        });

        [btnPrev, btnNext].forEach(btn => {
            if (!btn) return;
            btn.addEventListener('mouseenter', () => {
                if (!btn.disabled) btn.classList.add('active');
            });
            btn.addEventListener('mouseleave', () => {
                btn.classList.remove('active');
            });
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') changePage(-1);
            if (e.key === 'ArrowRight') changePage(1);
        });
    });
})();
