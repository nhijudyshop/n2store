/**
 * Live Order Book — Hidden Products Page (hidden-products.js)
 * Shows products with isHidden === true, allows unhiding
 * Uses global functions from firebase-helpers-global.js
 */

// ============================================================================
// STATE
// ============================================================================
let database = null;
let currentSessionId = null;
let localProducts = {};
let firebaseListenerHandle = null;

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

    console.log('👁️ Hidden Products Page — Session:', currentSessionId);

    await loadSessionInfo();
    await loadProducts();
}

// ============================================================================
// SESSION INFO
// ============================================================================

async function loadSessionInfo() {
    try {
        const snapshot = await database.ref(`liveOrderSessions/${currentSessionId}`).once('value');
        const session = snapshot.val();
        if (session) {
            const nameEl = document.getElementById('sessionName');
            if (nameEl) nameEl.textContent = session.name || currentSessionId;
        }
    } catch (error) {
        console.error('❌ Error loading session info:', error);
    }
}

// ============================================================================
// PRODUCTS
// ============================================================================

async function loadProducts() {
    try {
        localProducts = await loadAllProductsFromFirebase(database, currentSessionId);
        console.log('🔥 Loaded', Object.keys(localProducts).length, 'products');
        renderHiddenProducts();
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
        onProductAdded: () => renderHiddenProducts(),
        onProductChanged: () => renderHiddenProducts(),
        onProductRemoved: () => renderHiddenProducts(),
        onQtyChanged: () => renderHiddenProducts(),
        onInitialLoadComplete: () => renderHiddenProducts()
    });
}

// ============================================================================
// RENDERING
// ============================================================================

function getHiddenProducts() {
    return Object.entries(localProducts)
        .filter(([, p]) => p.isHidden === true)
        .map(([key, p]) => ({ ...p, _key: key }));
}

function renderHiddenProducts() {
    const list = document.getElementById('productList');
    const countEl = document.getElementById('hiddenCount');
    if (!list) return;

    const hidden = getHiddenProducts();

    if (countEl) countEl.textContent = hidden.length;

    if (hidden.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <h2>✅ Không có sản phẩm ẩn</h2>
                <p>Tất cả sản phẩm đang hiển thị trên trang chính</p>
            </div>
        `;
        return;
    }

    list.innerHTML = hidden.map(p => renderProductItem(p)).join('');
}

function renderProductItem(product) {
    const key = product._key;
    const name = product.NameGet || 'Không tên';
    const code = product.Id ? `#${product.Id}` : '';
    const soldQty = product.soldQty || 0;
    const orderedQty = product.orderedQty || 0;
    const imageUrl = product.imageUrl;

    const imageHtml = imageUrl
        ? `<img class="product-image" src="${imageUrl}" alt="${name}" onerror="this.classList.add('no-image');this.outerHTML='<div class=\\'product-image no-image\\'>📦</div>'">`
        : `<div class="product-image no-image">📦</div>`;

    return `
        <div class="product-item" data-key="${key}">
            ${imageHtml}
            <div class="product-info">
                <div class="product-name">${name}</div>
                <div class="product-code">${code}</div>
                <div class="product-qty">
                    <span class="qty-total">Tổng: ${soldQty}</span>
                    <span class="qty-ordered">Đã đặt: ${orderedQty}</span>
                </div>
            </div>
            <button class="btn-unhide" onclick="unhideProduct('${key}')">👁️ Hiện lại</button>
        </div>
    `;
}

// ============================================================================
// ACTIONS
// ============================================================================

async function unhideProduct(productKey) {
    try {
        await updateProductVisibility(database, currentSessionId, productKey, false);
        console.log('✅ Product unhidden:', productKey);
    } catch (error) {
        console.error('❌ Error unhiding product:', error);
        alert('Lỗi khi hiện lại sản phẩm. Vui lòng thử lại.');
    }
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function showEmptyState(message) {
    const list = document.getElementById('productList');
    if (list) {
        list.innerHTML = `
            <div class="empty-state">
                <h2>⚠️ ${message || 'Không có sản phẩm ẩn'}</h2>
            </div>
        `;
    }
}
