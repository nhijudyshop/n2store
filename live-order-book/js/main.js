/**
 * Live Order Book — Admin Page Main Logic
 * Regular script (not ES module) — uses global functions from firebase-helpers-global.js
 */

// ============================================================================
// STATE
// ============================================================================
let database = null;
let currentSessionId = null;
let localProducts = {}; // { product_123: {...}, ... }
let productsData = []; // TPOS product list from Excel API
let isLoadingExcel = false;
let firebaseListenerHandle = null;
let listSearchKeyword = '';
let filteredProductsInList = [];
let _tokenManagerInstance = null;
let searchDebounceTimer = null;

// Image modal state
let currentEditingProductKey = null;
let currentImageData = null;
let cameraStream = null;
let currentFacingMode = 'environment';

// Cart history state
let pendingRestoreSnapshotId = null;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
        color: white; padding: 15px 25px; border-radius: 10px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.3); z-index: 30000;
        font-weight: 600; animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

function formatDateTime(date) {
    const d = new Date(date);
    return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

// ============================================================================
// AUTH / TOKEN
// ============================================================================

function _getTokenManager() {
    if (_tokenManagerInstance) return _tokenManagerInstance;
    if (window.tokenManager) { _tokenManagerInstance = window.tokenManager; return _tokenManagerInstance; }
    if (window.TokenManager) {
        _tokenManagerInstance = new window.TokenManager();
        window.tokenManager = _tokenManagerInstance;
        return _tokenManagerInstance;
    }
    return null;
}

async function getValidToken() {
    const tm = _getTokenManager();
    if (!tm) throw new Error('TokenManager not available');
    return await tm.getToken();
}

async function authenticatedFetch(url, options = {}) {
    const tm = _getTokenManager();
    if (!tm) throw new Error('TokenManager not available');
    return await tm.authenticatedFetch(url, options);
}

function logoutUser() {
    if (confirm('Bạn có chắc muốn đăng xuất?')) {
        sessionStorage.removeItem('loginindex_auth');
        localStorage.removeItem('loginindex_auth');
        window.location.href = 'https://nhijudyshop.github.io/n2store/';
    }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

async function loadSessionDropdown() {
    const select = document.getElementById('sessionSelect');
    const sessions = await window.loadSessions(database);

    select.innerHTML = '<option value="">-- Chọn đợt live --</option>';
    sessions.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (${s.date}) — ${s.productCount || 0} SP`;
        select.appendChild(opt);
    });

    // Restore last selected session
    const savedSessionId = localStorage.getItem('liveOrderBook_currentSession');
    if (savedSessionId) {
        const exists = sessions.find(s => s.id === savedSessionId);
        if (exists) {
            select.value = savedSessionId;
            await switchToSession(savedSessionId);
        }
    }
}

async function onSessionChange() {
    const sessionId = document.getElementById('sessionSelect').value;
    if (sessionId) {
        localStorage.setItem('liveOrderBook_currentSession', sessionId);
        await switchToSession(sessionId);
    } else {
        currentSessionId = null;
        localProducts = {};
        if (firebaseListenerHandle) { firebaseListenerHandle.detach(); firebaseListenerHandle = null; }
        updateProductListUI();
    }
}

async function switchToSession(sessionId) {
    // Detach old listeners
    if (firebaseListenerHandle) { firebaseListenerHandle.detach(); firebaseListenerHandle = null; }

    currentSessionId = sessionId;
    localProducts = {};

    // Load products
    localProducts = await window.loadAllProductsFromFirebase(database, sessionId);

    // Setup realtime listeners
    firebaseListenerHandle = window.setupFirebaseChildListeners(database, sessionId, localProducts, {
        onProductAdded: () => updateProductListUI(),
        onProductChanged: () => updateProductListUI(),
        onQtyChanged: () => updateProductListUI(),
        onProductRemoved: () => updateProductListUI(),
        onInitialLoadComplete: () => updateProductListUI()
    });

    updateProductListUI();
    updateExpandLink();

    // Load display settings into sidebar
    const settings = await window.loadDisplaySettings(database, sessionId);
    document.getElementById('settingColumns').value = settings.gridColumns;
    document.getElementById('settingRows').value = settings.gridRows;
    document.getElementById('settingGap').value = settings.gridGap;
    document.getElementById('settingFontSize').value = settings.fontSize;

    // Load cart history
    refreshCartHistory();
}

async function createNewSession() {
    const name = prompt('Tên đợt live:');
    if (!name || !name.trim()) return;

    const date = prompt('Ngày (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!date) return;

    const sessionId = await window.createSession(database, name.trim(), date);
    showNotification('✅ Đã tạo đợt live: ' + name.trim());
    await loadSessionDropdown();

    // Auto-select new session
    document.getElementById('sessionSelect').value = sessionId;
    localStorage.setItem('liveOrderBook_currentSession', sessionId);
    await switchToSession(sessionId);
}

async function deleteCurrentSession() {
    if (!currentSessionId) { alert('Chưa chọn đợt live!'); return; }

    const select = document.getElementById('sessionSelect');
    const selectedOption = select.options[select.selectedIndex];
    const sessionName = selectedOption ? selectedOption.textContent : currentSessionId;
    const productCount = Object.keys(localProducts).length;

    if (!confirm(`Xóa đợt live "${sessionName}"?\n\nSẽ xóa ${productCount} sản phẩm và toàn bộ dữ liệu liên quan.`)) return;

    await window.deleteSession(database, currentSessionId);
    showNotification('🗑️ Đã xóa đợt live');

    currentSessionId = null;
    localProducts = {};
    localStorage.removeItem('liveOrderBook_currentSession');
    if (firebaseListenerHandle) { firebaseListenerHandle.detach(); firebaseListenerHandle = null; }

    await loadSessionDropdown();
    updateProductListUI();
}

async function renameCurrentSession() {
    if (!currentSessionId) { alert('Chưa chọn đợt live!'); return; }

    const select = document.getElementById('sessionSelect');
    const currentName = select.options[select.selectedIndex]?.textContent?.split(' (')[0] || '';
    const newName = prompt('Tên mới:', currentName);
    if (!newName || !newName.trim()) return;

    await window.renameSession(database, currentSessionId, newName.trim());
    showNotification('✏️ Đã đổi tên đợt live');
    await loadSessionDropdown();
    document.getElementById('sessionSelect').value = currentSessionId;
}

function updateExpandLink() {
    const btn = document.getElementById('btnGoDisplay');
    if (btn && currentSessionId) {
        btn.href = `order-list.html?sessionId=${currentSessionId}`;
    }
    const btnHidden = document.getElementById('btnGoHidden');
    if (btnHidden && currentSessionId) {
        btnHidden.href = `hidden-products.html?sessionId=${currentSessionId}`;
    }
}

// ============================================================================
// TPOS SEARCH
// ============================================================================

const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

async function loadExcelData() {
    if (isLoadingExcel || productsData.length > 0) return;
    isLoadingExcel = true;
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.style.display = 'block';

    try {
        const response = await authenticatedFetch(`${PROXY_URL}/api/Product/ExportFileWithVariantPrice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: { Active: "true" }, ids: "" })
        });

        if (!response.ok) throw new Error('Không thể tải dữ liệu sản phẩm');

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

        console.log(`Đã load ${productsData.length} sản phẩm từ TPOS`);
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

    const matched = productsData.filter(product => {
        const matchName = product.nameNoSign.includes(searchNoSign);
        const matchNameOriginal = product.name && product.name.toLowerCase().includes(searchLower);
        const matchCode = product.code && product.code.toLowerCase().includes(searchLower);
        return matchName || matchNameOriginal || matchCode;
    });

    // Sort by priority: [bracket] > code > name
    matched.sort((a, b) => {
        const extractBracket = (name) => {
            const match = name?.match(/\[([^\]]+)\]/);
            return match ? match[1].toLowerCase().trim() : '';
        };

        const aBracket = extractBracket(a.name);
        const bBracket = extractBracket(b.name);
        const aMatchBracket = aBracket && aBracket.includes(searchLower);
        const bMatchBracket = bBracket && bBracket.includes(searchLower);

        if (aMatchBracket && !bMatchBracket) return -1;
        if (!aMatchBracket && bMatchBracket) return 1;

        if (aMatchBracket && bMatchBracket) {
            if (aBracket === searchLower && bBracket !== searchLower) return -1;
            if (aBracket !== searchLower && bBracket === searchLower) return 1;
            if (aBracket.length !== bBracket.length) return aBracket.length - bBracket.length;
            return aBracket.localeCompare(bBracket);
        }

        const aMatchCode = a.code && a.code.toLowerCase().includes(searchLower);
        const bMatchCode = b.code && b.code.toLowerCase().includes(searchLower);
        if (aMatchCode && !bMatchCode) return -1;
        if (!aMatchCode && bMatchCode) return 1;

        return a.name.localeCompare(b.name);
    });

    return matched.slice(0, 10);
}

function displaySuggestions(suggestions) {
    const suggestionsDiv = document.getElementById('suggestions');
    if (suggestions.length === 0) { suggestionsDiv.classList.remove('show'); return; }

    suggestionsDiv.innerHTML = suggestions.map(p => `
        <div class="suggestion-item" data-id="${p.id}">
            <strong>${p.code || ''}</strong> - ${p.name}
        </div>
    `).join('');

    suggestionsDiv.classList.add('show');

    suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            loadProductDetails(item.dataset.id);
            suggestionsDiv.classList.remove('show');
            document.getElementById('productSearch').value = '';
        });
    });
}

// ============================================================================
// ADD PRODUCT FLOW
// ============================================================================

async function loadProductDetails(productId) {
    if (!currentSessionId) { alert('Vui lòng chọn đợt live trước!'); return; }

    try {
        const response = await authenticatedFetch(
            `${PROXY_URL}/api/odata/Product(${productId})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues`
        );
        if (!response.ok) throw new Error('Không thể tải thông tin sản phẩm');

        const productData = await response.json();
        let imageUrl = productData.ImageUrl;
        let templateData = null;

        // Load template for image and variants
        if (productData.ProductTmplId) {
            try {
                const tmplResponse = await authenticatedFetch(
                    `${PROXY_URL}/api/odata/ProductTemplate(${productData.ProductTmplId})?$expand=ProductVariants($expand=AttributeValues)`
                );
                if (tmplResponse.ok) {
                    templateData = await tmplResponse.json();
                    if (!imageUrl) imageUrl = templateData.ImageUrl;
                }
            } catch (e) { console.error('Error loading template:', e); }
        }

        // Check for variants
        if (templateData && templateData.ProductVariants && templateData.ProductVariants.length > 1) {
            const activeVariants = templateData.ProductVariants.filter(v => v.Active !== false);
            if (activeVariants.length > 1) {
                showVariantModal(activeVariants, imageUrl, productData.ProductTmplId);
                return;
            }
        }

        // No variants — add directly
        await addSingleProduct(productData, imageUrl);

    } catch (error) {
        console.error('Error loading product:', error);
        showNotification('❌ Lỗi: ' + error.message);
    }
}

function showVariantModal(variants, fallbackImage, tmplId) {
    const list = document.getElementById('variantList');
    list.innerHTML = variants.map((v, i) => `
        <div class="variant-item">
            <input type="checkbox" id="variant_${i}" checked data-variant-index="${i}">
            <label for="variant_${i}">${v.NameGet || v.Name || 'Variant ' + v.Id}</label>
        </div>
    `).join('');

    // Store variants data for later
    window._pendingVariants = variants;
    window._pendingFallbackImage = fallbackImage;
    window._pendingTmplId = tmplId;

    document.getElementById('variantModalTitle').textContent = `Chọn biến thể (${variants.length})`;
    document.getElementById('variantModal').style.display = 'flex';
}

function closeVariantModal() {
    document.getElementById('variantModal').style.display = 'none';
    window._pendingVariants = null;
}

async function confirmAddVariants() {
    const variants = window._pendingVariants;
    const fallbackImage = window._pendingFallbackImage;
    const tmplId = window._pendingTmplId;
    if (!variants) return;

    const checkboxes = document.querySelectorAll('#variantList input[type="checkbox"]:checked');
    let addedCount = 0;
    let updatedCount = 0;

    for (const cb of checkboxes) {
        const idx = parseInt(cb.dataset.variantIndex);
        const v = variants[idx];
        if (!v) continue;

        const product = {
            Id: v.Id,
            NameGet: v.NameGet || v.Name,
            QtyAvailable: v.QtyAvailable || 0,
            ProductTmplId: tmplId,
            ListPrice: v.ListPrice || 0,
            imageUrl: v.ImageUrl || fallbackImage || '',
            soldQty: 0,
            orderedQty: 0,
            isHidden: false
        };

        const result = await window.addProductToFirebase(database, currentSessionId, product, localProducts);
        if (result.action === 'added') addedCount++;
        else updatedCount++;
    }

    closeVariantModal();
    updateProductListUI();

    if (addedCount > 0 && updatedCount > 0) {
        showNotification(`✅ Thêm ${addedCount} mới, cập nhật ${updatedCount} biến thể`);
    } else if (updatedCount > 0) {
        showNotification(`🔄 Cập nhật ${updatedCount} biến thể (giữ nguyên SL)`);
    } else if (addedCount > 0) {
        showNotification(`✅ Đã thêm ${addedCount} biến thể`);
    }
}

async function addSingleProduct(productData, imageUrl) {
    const product = {
        Id: productData.Id,
        NameGet: productData.NameGet,
        QtyAvailable: productData.QtyAvailable || 0,
        ProductTmplId: productData.ProductTmplId,
        ListPrice: productData.ListPrice || 0,
        imageUrl: imageUrl || '',
        soldQty: 0,
        orderedQty: 0,
        isHidden: false
    };

    const result = await window.addProductToFirebase(database, currentSessionId, product, localProducts);
    updateProductListUI();

    if (result.action === 'added') {
        showNotification('✅ Đã thêm: ' + product.NameGet);
    } else {
        showNotification('🔄 Cập nhật: ' + product.NameGet + ' (giữ nguyên SL)');
    }
}

// ============================================================================
// PRODUCT LIST UI
// ============================================================================

function updateProductListUI() {
    const section = document.getElementById('productListSection');
    const preview = document.getElementById('productListPreview');
    const countEl = document.getElementById('productCount');

    // Filter visible products (not hidden)
    const visibleProducts = Object.values(localProducts).filter(p => !p.isHidden);

    if (visibleProducts.length === 0 && Object.keys(localProducts).length === 0) {
        section.style.display = currentSessionId ? 'block' : 'none';
        if (currentSessionId) {
            preview.innerHTML = `<div class="empty-state"><div class="icon">📦</div><p>Chưa có sản phẩm. Tìm kiếm TPOS để thêm.</p></div>`;
        }
        countEl.textContent = '0';
        return;
    }

    section.style.display = 'block';

    // Use filtered products if searching
    const productsToDisplay = listSearchKeyword ? filteredProductsInList : visibleProducts;

    countEl.textContent = listSearchKeyword
        ? `${productsToDisplay.length}/${visibleProducts.length}`
        : visibleProducts.length;

    // Group by ProductTmplId
    const groups = {};
    productsToDisplay.forEach(p => {
        const tmplId = p.ProductTmplId || p.Id;
        if (!groups[tmplId]) groups[tmplId] = { products: [], maxAddedAt: 0 };
        groups[tmplId].products.push(p);
        groups[tmplId].maxAddedAt = Math.max(groups[tmplId].maxAddedAt, p.addedAt || 0);
    });

    // Sort groups by addedAt descending, then flatten
    const sortedGroups = Object.entries(groups)
        .sort((a, b) => b[1].maxAddedAt - a[1].maxAddedAt);

    let html = '';
    sortedGroups.forEach(([tmplId, group]) => {
        if (group.products.length > 1) {
            html += `<div class="variant-group-header">📦 Nhóm ${group.products[0].NameGet?.split(' ')[0] || tmplId} (${group.products.length} biến thể)</div>`;
        }
        group.products.sort((a, b) => (a.NameGet || '').localeCompare(b.NameGet || ''));
        group.products.forEach(p => {
            html += renderProductCard(p);
        });
    });

    preview.innerHTML = html || `<div class="empty-state"><div class="icon">🔍</div><p>Không tìm thấy sản phẩm phù hợp.</p></div>`;
}

function renderProductCard(product) {
    const key = `product_${product.Id}`;
    const imageHtml = product.imageUrl
        ? `<img src="${product.imageUrl}" class="preview-image" alt="${product.NameGet}">`
        : `<div class="preview-image no-image">📦</div>`;

    return `
        <div class="preview-item" data-key="${key}">
            ${imageHtml}
            <div class="preview-info">
                <div class="preview-name">${product.NameGet || 'N/A'}</div>
                <div class="preview-stats">
                    <div class="qty-control">
                        <span style="font-size:11px;color:#e65100;">Tổng:</span>
                        <button class="qty-btn" onclick="updateSoldQty('${key}', -1)">−</button>
                        <input class="qty-input" type="number" value="${product.soldQty || 0}" min="0"
                            onchange="setSoldQty('${key}', this.value)" style="width:45px;">
                        <button class="qty-btn" onclick="updateSoldQty('${key}', 1)">+</button>
                    </div>
                    <div class="ordered-qty-control">
                        <span style="font-size:11px;color:#2e7d32;">Đã đặt:</span>
                        <input class="qty-input" type="number" value="${product.orderedQty || 0}" min="0"
                            onchange="setOrderedQty('${key}', this.value)" style="width:45px;">
                    </div>
                </div>
            </div>
            <div class="preview-actions">
                <button class="btn-action btn-change-image" onclick="changeProductImage('${key}')">🖼️ Đổi ảnh</button>
                <button class="btn-action btn-hide" onclick="hideProduct('${key}')">👁️ Ẩn</button>
                <button class="btn-action btn-remove" onclick="removeProduct('${key}')">🗑️ Xóa</button>
            </div>
        </div>
    `;
}

// ============================================================================
// QTY CONTROLS
// ============================================================================

async function updateSoldQty(productKey, delta) {
    if (!currentSessionId) return;
    const product = localProducts[productKey];
    if (!product) return;

    const newQty = Math.max(0, (product.soldQty || 0) + delta);
    product.soldQty = newQty;
    await window.updateProductQtyInFirebase(database, currentSessionId, productKey, newQty);
    updateProductListUI();
}

async function setSoldQty(productKey, value) {
    if (!currentSessionId) return;
    const newQty = Math.max(0, parseInt(value) || 0);
    if (localProducts[productKey]) localProducts[productKey].soldQty = newQty;
    await window.updateProductQtyInFirebase(database, currentSessionId, productKey, newQty);
}

async function setOrderedQty(productKey, value) {
    if (!currentSessionId) return;
    const newQty = Math.max(0, parseInt(value) || 0);
    if (localProducts[productKey]) localProducts[productKey].orderedQty = newQty;
    await window.updateOrderedQtyInFirebase(database, currentSessionId, productKey, newQty);
}

// ============================================================================
// PRODUCT ACTIONS
// ============================================================================

async function removeProduct(productKey) {
    const product = localProducts[productKey];
    if (!product) return;
    if (!confirm(`Xóa "${product.NameGet}"?`)) return;

    await window.removeProductFromFirebase(database, currentSessionId, productKey, localProducts);
    showNotification('🗑️ Đã xóa: ' + product.NameGet);

    if (listSearchKeyword) performListSearch(listSearchKeyword);
    else updateProductListUI();
}

async function hideProduct(productKey) {
    if (!currentSessionId) return;
    await window.updateProductVisibility(database, currentSessionId, productKey, true);
    if (localProducts[productKey]) localProducts[productKey].isHidden = true;
    showNotification('👁️ Đã ẩn sản phẩm');
    updateProductListUI();
}

// ============================================================================
// LIST SEARCH (in-list, not TPOS)
// ============================================================================

function performListSearch(keyword) {
    listSearchKeyword = keyword.trim();
    if (!listSearchKeyword) {
        filteredProductsInList = [];
        updateProductListUI();
        return;
    }

    const searchNorm = removeVietnameseTones(listSearchKeyword);
    const visibleProducts = Object.values(localProducts).filter(p => !p.isHidden);

    filteredProductsInList = visibleProducts.filter(p => {
        const nameNorm = removeVietnameseTones(p.NameGet || '');
        const id = String(p.Id || '');
        return nameNorm.includes(searchNorm) || id.includes(listSearchKeyword);
    });

    updateProductListUI();
}

function clearListSearch() {
    listSearchKeyword = '';
    filteredProductsInList = [];
    document.getElementById('listSearchInput').value = '';
    document.getElementById('listSearchClear').classList.remove('show');
    updateProductListUI();
}

// ============================================================================
// IMAGE MODAL
// ============================================================================

function changeProductImage(productKey) {
    const product = localProducts[productKey];
    if (!product) { showNotification('❌ Không tìm thấy sản phẩm'); return; }

    currentEditingProductKey = productKey;
    currentImageData = null;

    // Reset all tabs
    resetPasteTab();
    resetUploadTab();
    resetLinkTab();
    resetCameraTab();

    // Pre-fill link if product has image
    const linkInput = document.getElementById('linkInput');
    if (linkInput && product.imageUrl) {
        linkInput.value = product.imageUrl;
        handleLinkInput({ target: linkInput });
    }

    // Show first tab
    switchImageTab('paste');
    document.getElementById('imageModalOverlay').classList.add('show');
}

function closeImageModal() {
    document.getElementById('imageModalOverlay').classList.remove('show');
    currentEditingProductKey = null;
    currentImageData = null;
    stopCamera();
}

function switchImageTab(tabName) {
    document.querySelectorAll('.image-modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.image-modal-content').forEach(c => c.classList.remove('active'));

    const tabs = { paste: 0, upload: 1, camera: 2, link: 3 };
    const tabButtons = document.querySelectorAll('.image-modal-tab');
    const tabContents = document.querySelectorAll('.image-modal-content');

    if (tabButtons[tabs[tabName]]) tabButtons[tabs[tabName]].classList.add('active');
    if (tabContents[tabs[tabName]]) tabContents[tabs[tabName]].classList.add('active');
}

function resetPasteTab() {
    const preview = document.getElementById('pastePreview');
    const area = document.getElementById('pasteArea');
    if (preview) { preview.classList.remove('show'); preview.src = ''; }
    if (area) area.classList.remove('has-image');
}

function resetUploadTab() {
    const preview = document.getElementById('uploadPreview');
    const input = document.getElementById('fileUploadInput');
    if (preview) { preview.classList.remove('show'); preview.src = ''; }
    if (input) input.value = '';
}

function resetLinkTab() {
    const input = document.getElementById('linkInput');
    const container = document.getElementById('linkPreviewContainer');
    if (input) input.value = '';
    if (container) container.classList.remove('show');
}

function resetCameraTab() {
    const preview = document.getElementById('cameraPreview');
    if (preview) { preview.classList.remove('show'); preview.src = ''; }
    stopCamera();
}

function focusPasteArea() {
    document.getElementById('pasteArea').focus();
}

function handlePaste(e) {
    const modal = document.getElementById('imageModalOverlay');
    if (!modal.classList.contains('show')) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = (ev) => {
                currentImageData = ev.target.result;
                const preview = document.getElementById('pastePreview');
                preview.src = currentImageData;
                preview.classList.add('show');
                document.getElementById('pasteArea').classList.add('has-image');
            };
            reader.readAsDataURL(blob);
            return;
        }
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        currentImageData = ev.target.result;
        const preview = document.getElementById('uploadPreview');
        preview.src = currentImageData;
        preview.classList.add('show');
    };
    reader.readAsDataURL(file);
}

function handleLinkInput(event) {
    const url = event.target.value.trim();
    const container = document.getElementById('linkPreviewContainer');
    const img = document.getElementById('linkPreviewImage');

    if (url) {
        currentImageData = url;
        img.src = url;
        container.classList.add('show');
        img.onerror = () => { container.classList.remove('show'); };
    } else {
        currentImageData = '';
        container.classList.remove('show');
    }
}

async function saveImageChange() {
    if (!currentEditingProductKey || !currentSessionId) return;

    const imageUrl = currentImageData || '';
    await window.updateProductImage(database, currentSessionId, currentEditingProductKey, imageUrl);

    if (localProducts[currentEditingProductKey]) {
        localProducts[currentEditingProductKey].imageUrl = imageUrl;
    }

    closeImageModal();
    updateProductListUI();
    showNotification('🖼️ Đã cập nhật ảnh');
}

// Camera functions
async function startCamera() {
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentFacingMode }
        });
        const video = document.getElementById('cameraVideo');
        video.srcObject = cameraStream;
        video.style.display = 'block';
        document.getElementById('cameraMessage').style.display = 'none';
        document.getElementById('btnStartCamera').style.display = 'none';
        document.getElementById('btnSwitchCamera').style.display = '';
        document.getElementById('btnCapturePhoto').style.display = '';
        document.getElementById('btnStopCamera').style.display = '';
    } catch (err) {
        alert('Không thể truy cập camera: ' + err.message);
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
    const video = document.getElementById('cameraVideo');
    if (video) { video.srcObject = null; video.style.display = 'none'; }
    const msg = document.getElementById('cameraMessage');
    if (msg) msg.style.display = '';
    const btnStart = document.getElementById('btnStartCamera');
    if (btnStart) btnStart.style.display = '';
    ['btnSwitchCamera', 'btnCapturePhoto', 'btnStopCamera'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

async function switchCamera() {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    stopCamera();
    await startCamera();
}

function capturePhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    currentImageData = canvas.toDataURL('image/jpeg', 0.8);
    const preview = document.getElementById('cameraPreview');
    preview.src = currentImageData;
    preview.classList.add('show');
}

// ============================================================================
// DISPLAY SETTINGS
// ============================================================================

async function applyDisplaySettings() {
    if (!currentSessionId) { alert('Chưa chọn đợt live!'); return; }

    const settings = {
        gridColumns: Math.min(10, Math.max(1, parseInt(document.getElementById('settingColumns').value) || 4)),
        gridRows: Math.min(10, Math.max(1, parseInt(document.getElementById('settingRows').value) || 2)),
        gridGap: Math.min(50, Math.max(0, parseInt(document.getElementById('settingGap').value) || 10)),
        fontSize: Math.min(48, Math.max(8, parseInt(document.getElementById('settingFontSize').value) || 14))
    };

    await window.saveDisplaySettings(database, currentSessionId, settings);
    showNotification('💾 Đã lưu cài đặt hiển thị');
}

// ============================================================================
// CART HISTORY
// ============================================================================

async function saveCartAndRefresh() {
    if (!currentSessionId) { alert('Chưa chọn đợt live!'); return; }

    const productCount = Object.keys(localProducts).length;
    if (productCount === 0) { alert('Không có sản phẩm để lưu!'); return; }

    const name = prompt('Tên snapshot:', `Snapshot ${new Date().toLocaleDateString('vi-VN')}`);
    if (!name) return;

    const snapshot = {
        metadata: {
            name: name.trim(),
            savedAt: Date.now(),
            productCount: productCount
        },
        products: JSON.parse(JSON.stringify(localProducts))
    };

    await window.saveCartSnapshot(database, currentSessionId, snapshot);
    showNotification(`💾 Đã lưu snapshot: ${name.trim()} (${productCount} SP)`);
    refreshCartHistory();
}

async function refreshCartHistory() {
    if (!currentSessionId) return;

    const listEl = document.getElementById('cartHistoryList');
    const snapshots = await window.getAllCartSnapshots(database, currentSessionId);

    if (snapshots.length === 0) {
        listEl.innerHTML = '<div class="no-history">Chưa có lịch sử</div>';
        return;
    }

    listEl.innerHTML = snapshots.map(s => `
        <div class="snapshot-card">
            <div class="snapshot-header">
                <div class="snapshot-name">${s.metadata?.name || 'Không tên'}</div>
                <div class="snapshot-date">${formatDateTime(s.metadata?.savedAt)}</div>
            </div>
            <div class="snapshot-stats">
                <span>📦 ${s.metadata?.productCount || 0} SP</span>
            </div>
            <div class="snapshot-actions">
                <button class="btn-restore" onclick="restoreSnapshot('${s.id}')">♻️ Khôi phục</button>
                <button class="btn-delete" onclick="deleteSnapshot('${s.id}')">🗑️ Xóa</button>
            </div>
        </div>
    `).join('');
}

function toggleCartHistory() {
    const list = document.getElementById('cartHistoryList');
    const icon = document.getElementById('cartHistoryToggleIcon');
    list.classList.toggle('collapsed');
    icon.classList.toggle('expanded');
}

async function restoreSnapshot(snapshotId) {
    if (!currentSessionId) return;

    const currentCount = Object.keys(localProducts).length;
    pendingRestoreSnapshotId = snapshotId;

    document.getElementById('currentCartCount').textContent = currentCount;
    document.getElementById('autoSaveBeforeRestore').checked = true;
    document.getElementById('autoSaveNameInput').style.display = '';
    document.getElementById('autoSaveName').value = `Trước khôi phục ${new Date().toLocaleDateString('vi-VN')}`;
    document.getElementById('restoreConfirmModal').style.display = 'flex';
}

function toggleAutoSaveInput() {
    const checked = document.getElementById('autoSaveBeforeRestore').checked;
    document.getElementById('autoSaveNameInput').style.display = checked ? '' : 'none';
}

function closeRestoreConfirmModal() {
    document.getElementById('restoreConfirmModal').style.display = 'none';
    pendingRestoreSnapshotId = null;
}

async function confirmRestore() {
    if (!pendingRestoreSnapshotId || !currentSessionId) return;

    const shouldAutoSave = document.getElementById('autoSaveBeforeRestore').checked;
    const autoSaveName = document.getElementById('autoSaveName').value.trim();

    // Auto-save current cart if requested
    if (shouldAutoSave && Object.keys(localProducts).length > 0) {
        const snapshot = {
            metadata: {
                name: autoSaveName || `Auto-save trước khôi phục`,
                savedAt: Date.now(),
                productCount: Object.keys(localProducts).length
            },
            products: JSON.parse(JSON.stringify(localProducts))
        };
        await window.saveCartSnapshot(database, currentSessionId, snapshot);
    }

    // Load snapshot data
    const snapshots = await window.getAllCartSnapshots(database, currentSessionId);
    const targetSnapshot = snapshots.find(s => s.id === pendingRestoreSnapshotId);

    if (!targetSnapshot || !targetSnapshot.products) {
        alert('Không tìm thấy snapshot!');
        closeRestoreConfirmModal();
        return;
    }

    await window.restoreProductsFromSnapshot(database, currentSessionId, targetSnapshot.products, localProducts);

    closeRestoreConfirmModal();
    updateProductListUI();
    refreshCartHistory();
    showNotification('♻️ Đã khôi phục giỏ hàng');
}

async function deleteSnapshot(snapshotId) {
    if (!confirm('Xóa snapshot này?')) return;
    await window.deleteCartSnapshot(database, currentSessionId, snapshotId);
    showNotification('🗑️ Đã xóa snapshot');
    refreshCartHistory();
}

// ============================================================================
// SETTINGS SIDEBAR
// ============================================================================

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

// ============================================================================
// INITIALIZATION
// ============================================================================

window.addEventListener('load', async () => {
    try {
        // Wait for Firebase to be ready
        database = firebase.database();

        await getValidToken();

        // Load TPOS product data in background
        loadExcelData();

        // Load sessions dropdown
        await loadSessionDropdown();

        // Setup TPOS search input
        const searchInput = document.getElementById('productSearch');
        searchInput.addEventListener('input', (e) => {
            const text = e.target.value.trim();
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

            if (text.length < 2) {
                document.getElementById('suggestions').classList.remove('show');
                return;
            }

            searchDebounceTimer = setTimeout(() => {
                if (productsData.length === 0) {
                    loadExcelData().then(() => {
                        displaySuggestions(searchProducts(text));
                    });
                } else {
                    displaySuggestions(searchProducts(text));
                }
            }, 300);
        });

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const text = e.target.value.trim();
                if (!text) return;
                const results = searchProducts(text);
                if (results.length === 1) {
                    loadProductDetails(results[0].id);
                    document.getElementById('suggestions').classList.remove('show');
                    searchInput.value = '';
                }
            }
        });

        // Close suggestions on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-wrapper')) {
                document.getElementById('suggestions').classList.remove('show');
            }
        });

        // Setup list search
        const listSearchInput = document.getElementById('listSearchInput');
        const listSearchClear = document.getElementById('listSearchClear');

        if (listSearchInput) {
            listSearchInput.addEventListener('input', (e) => {
                const value = e.target.value;
                if (value) listSearchClear.classList.add('show');
                else listSearchClear.classList.remove('show');
                performListSearch(value);
            });

            listSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') clearListSearch();
            });
        }

        // Setup paste handler for image modal
        document.addEventListener('paste', handlePaste);

        // Setup file drag & drop
        const fileUploadArea = document.getElementById('fileUploadArea');
        if (fileUploadArea) {
            fileUploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                fileUploadArea.classList.add('dragover');
            });
            fileUploadArea.addEventListener('dragleave', () => {
                fileUploadArea.classList.remove('dragover');
            });
            fileUploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                fileUploadArea.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        currentImageData = ev.target.result;
                        const preview = document.getElementById('uploadPreview');
                        preview.src = currentImageData;
                        preview.classList.add('show');
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

    } catch (error) {
        console.error('Lỗi khởi tạo:', error);
        alert('Không thể kết nối đến hệ thống. Vui lòng thử lại sau.');
    }
});

// Expose functions to global scope for onclick handlers in HTML
window.createNewSession = createNewSession;
window.deleteCurrentSession = deleteCurrentSession;
window.renameCurrentSession = renameCurrentSession;
window.onSessionChange = onSessionChange;
window.updateSoldQty = updateSoldQty;
window.setSoldQty = setSoldQty;
window.setOrderedQty = setOrderedQty;
window.removeProduct = removeProduct;
window.hideProduct = hideProduct;
window.changeProductImage = changeProductImage;
window.closeImageModal = closeImageModal;
window.switchImageTab = switchImageTab;
window.focusPasteArea = focusPasteArea;
window.handleFileSelect = handleFileSelect;
window.handleLinkInput = handleLinkInput;
window.saveImageChange = saveImageChange;
window.startCamera = startCamera;
window.stopCamera = stopCamera;
window.switchCamera = switchCamera;
window.capturePhoto = capturePhoto;
window.clearListSearch = clearListSearch;
window.toggleSettingsSidebar = toggleSettingsSidebar;
window.applyDisplaySettings = applyDisplaySettings;
window.saveCartAndRefresh = saveCartAndRefresh;
window.toggleCartHistory = toggleCartHistory;
window.restoreSnapshot = restoreSnapshot;
window.toggleAutoSaveInput = toggleAutoSaveInput;
window.confirmRestore = confirmRestore;
window.closeRestoreConfirmModal = closeRestoreConfirmModal;
window.deleteSnapshot = deleteSnapshot;
window.logoutUser = logoutUser;
window.closeVariantModal = closeVariantModal;
window.confirmAddVariants = confirmAddVariants;
