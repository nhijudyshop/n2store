// =====================================================
// SỔ ORDER LIVE - MAIN APPLICATION
// Firebase Realtime Sync
// =====================================================

// =====================================================
// GLOBAL STATE
// =====================================================

const AppState = {
    database: null,
    currentUser: null,
    userIdentifier: null,
    sheets: {},
    activeSheetId: null,
    productsData: [],
    isLoadingProducts: false,
    searchDebounceTimer: null,
    unsubscribeSheets: null,
    unsubscribeHistory: null
};

// Firebase paths
const FIREBASE_PATHS = {
    SHEETS: 'liveOrderTracking/sheets',
    HISTORY: 'liveOrderTracking/history',
    ACTIVE_SHEET: 'liveOrderTracking/activeSheetId'
};

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[APP] Initializing Sổ Order Live...');

    // Initialize Firebase
    await initFirebase();

    // Initialize Auth
    await initAuth();

    // Setup event listeners
    setupEventListeners();

    // Load products data
    loadProductsData();

    console.log('[APP] Initialization complete');
});

async function initFirebase() {
    try {
        // Check if Firebase is already initialized
        if (firebase.apps.length === 0) {
            firebase.initializeApp(firebaseConfig);
        }
        AppState.database = firebase.database();
        console.log('[APP] Firebase initialized');
    } catch (error) {
        console.error('[APP] Firebase init error:', error);
        showToast('Lỗi kết nối Firebase', 'error');
    }
}

async function initAuth() {
    try {
        // Wait for authManager
        let attempts = 0;
        while (!window.authManager && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }

        if (window.authManager) {
            const authState = window.authManager.getAuthState();
            if (authState && authState.isLoggedIn === 'true') {
                AppState.currentUser = authState;
                // Extract user identifier
                if (authState.userType) {
                    AppState.userIdentifier = authState.userType.includes('-')
                        ? authState.userType.split('-')[0]
                        : authState.userType;
                } else if (authState.username) {
                    AppState.userIdentifier = authState.username;
                } else {
                    AppState.userIdentifier = 'default';
                }
                console.log('[APP] User authenticated:', AppState.userIdentifier);

                // Setup realtime listeners
                setupRealtimeListeners();
            } else {
                console.warn('[APP] User not logged in');
                AppState.userIdentifier = 'guest';
                setupRealtimeListeners();
            }
        } else {
            console.warn('[APP] AuthManager not found');
            AppState.userIdentifier = 'guest';
            setupRealtimeListeners();
        }
    } catch (error) {
        console.error('[APP] Auth init error:', error);
        AppState.userIdentifier = 'guest';
        setupRealtimeListeners();
    }
}

// =====================================================
// FIREBASE REALTIME LISTENERS
// =====================================================

function getUserPath(basePath) {
    return `${basePath}/${AppState.userIdentifier}`;
}

function setupRealtimeListeners() {
    if (!AppState.database) {
        console.error('[APP] Database not initialized');
        return;
    }

    // Listen to sheets
    const sheetsPath = getUserPath(FIREBASE_PATHS.SHEETS);
    console.log('[APP] Setting up listener for:', sheetsPath);

    AppState.database.ref(sheetsPath).on('value', (snapshot) => {
        const data = snapshot.val();
        AppState.sheets = data || {};
        console.log('[APP] Sheets updated:', Object.keys(AppState.sheets).length, 'sheets');
        renderSheetsList();

        // Re-render current sheet if active
        if (AppState.activeSheetId && AppState.sheets[AppState.activeSheetId]) {
            renderSheetContent();
        } else if (AppState.activeSheetId && !AppState.sheets[AppState.activeSheetId]) {
            // Active sheet was deleted
            AppState.activeSheetId = null;
            showNoSheetSelected();
        }

        updateSyncStatus('synced');
    });

    // Listen to active sheet ID
    const activePath = getUserPath(FIREBASE_PATHS.ACTIVE_SHEET);
    AppState.database.ref(activePath).on('value', (snapshot) => {
        const activeId = snapshot.val();
        if (activeId && activeId !== AppState.activeSheetId) {
            AppState.activeSheetId = activeId;
            if (AppState.sheets[activeId]) {
                renderSheetsList();
                renderSheetContent();
            }
        }
    });
}

// =====================================================
// SHEETS MANAGEMENT
// =====================================================

function renderSheetsList() {
    const container = document.getElementById('sheetsList');
    const emptyState = document.getElementById('emptySheets');

    const sheetIds = Object.keys(AppState.sheets);

    if (sheetIds.length === 0) {
        emptyState.style.display = 'block';
        container.innerHTML = '';
        container.appendChild(emptyState);
        return;
    }

    emptyState.style.display = 'none';

    // Sort by createdAt desc
    const sortedSheets = sheetIds
        .map(id => ({ id, ...AppState.sheets[id] }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    container.innerHTML = sortedSheets.map(sheet => `
        <div class="sheet-item ${sheet.id === AppState.activeSheetId ? 'active' : ''}"
             onclick="selectSheet('${sheet.id}')"
             data-sheet-id="${sheet.id}">
            <div class="sheet-item-info">
                <div class="sheet-item-name">📄 ${escapeHtml(sheet.name || 'Chưa đặt tên')}</div>
                <div class="sheet-item-meta">${formatDate(sheet.createdAt)} • ${(sheet.items || []).length} SP</div>
            </div>
            <div class="sheet-item-actions">
                <button onclick="event.stopPropagation(); editSheetNameById('${sheet.id}')" title="Đổi tên">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn-delete" onclick="event.stopPropagation(); deleteSheet('${sheet.id}')" title="Xóa">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function selectSheet(sheetId) {
    AppState.activeSheetId = sheetId;

    // Save active sheet to Firebase
    const activePath = getUserPath(FIREBASE_PATHS.ACTIVE_SHEET);
    AppState.database.ref(activePath).set(sheetId);

    renderSheetsList();
    renderSheetContent();

    // Close sidebar on mobile
    closePanels();
}

function showNoSheetSelected() {
    document.getElementById('noSheetSelected').style.display = 'flex';
    document.getElementById('sheetContent').style.display = 'none';
}

function renderSheetContent() {
    if (!AppState.activeSheetId || !AppState.sheets[AppState.activeSheetId]) {
        showNoSheetSelected();
        return;
    }

    document.getElementById('noSheetSelected').style.display = 'none';
    document.getElementById('sheetContent').style.display = 'block';

    const sheet = AppState.sheets[AppState.activeSheetId];

    // Update header
    document.getElementById('sheetTitle').textContent = sheet.name || 'Chưa đặt tên';
    document.getElementById('sheetCreatedAt').textContent = formatDate(sheet.createdAt);
    document.getElementById('itemCount').textContent = (sheet.items || []).length;

    // Render table
    renderProductsTable(sheet.items || []);

    // Load history for this sheet
    loadSheetHistory(AppState.activeSheetId);
}

// =====================================================
// SHEET CRUD
// =====================================================

let editingSheetId = null;

function createNewSheet() {
    editingSheetId = null;
    document.getElementById('sheetModalTitle').innerHTML = '<i class="bi bi-journal-plus"></i> Tạo trang mới';
    document.getElementById('sheetNameInput').value = '';
    document.getElementById('sheetModalSaveBtn').innerHTML = '<i class="bi bi-check-lg"></i> Tạo';

    const modal = new bootstrap.Modal(document.getElementById('sheetModal'));
    modal.show();

    setTimeout(() => {
        document.getElementById('sheetNameInput').focus();
    }, 300);
}

function editSheetName() {
    if (!AppState.activeSheetId) return;
    editSheetNameById(AppState.activeSheetId);
}

function editSheetNameById(sheetId) {
    editingSheetId = sheetId;
    const sheet = AppState.sheets[sheetId];

    document.getElementById('sheetModalTitle').innerHTML = '<i class="bi bi-pencil"></i> Đổi tên trang';
    document.getElementById('sheetNameInput').value = sheet?.name || '';
    document.getElementById('sheetModalSaveBtn').innerHTML = '<i class="bi bi-check-lg"></i> Lưu';

    const modal = new bootstrap.Modal(document.getElementById('sheetModal'));
    modal.show();

    setTimeout(() => {
        document.getElementById('sheetNameInput').focus();
        document.getElementById('sheetNameInput').select();
    }, 300);
}

async function saveSheet() {
    const nameInput = document.getElementById('sheetNameInput');
    const name = nameInput.value.trim();

    if (!name) {
        nameInput.classList.add('is-invalid');
        return;
    }

    nameInput.classList.remove('is-invalid');
    updateSyncStatus('syncing');

    try {
        const sheetsPath = getUserPath(FIREBASE_PATHS.SHEETS);

        if (editingSheetId) {
            // Update existing sheet
            await AppState.database.ref(`${sheetsPath}/${editingSheetId}/name`).set(name);
            await AppState.database.ref(`${sheetsPath}/${editingSheetId}/updatedAt`).set(Date.now());

            // Log history
            await logHistory(editingSheetId, 'edit', `Đổi tên thành "${name}"`);

            showToast('Đã cập nhật tên trang', 'success');
        } else {
            // Create new sheet
            const newSheetId = 'sheet_' + Date.now();
            const newSheet = {
                id: newSheetId,
                name: name,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                items: []
            };

            await AppState.database.ref(`${sheetsPath}/${newSheetId}`).set(newSheet);

            // Auto select new sheet
            AppState.activeSheetId = newSheetId;
            await AppState.database.ref(getUserPath(FIREBASE_PATHS.ACTIVE_SHEET)).set(newSheetId);

            showToast('Đã tạo trang mới', 'success');
        }

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('sheetModal'));
        modal.hide();

    } catch (error) {
        console.error('[APP] Error saving sheet:', error);
        showToast('Lỗi lưu trang', 'error');
        updateSyncStatus('error');
    }
}

let deletingSheetId = null;

function deleteSheet(sheetId) {
    deletingSheetId = sheetId;
    const sheet = AppState.sheets[sheetId];
    document.getElementById('deleteSheetName').textContent = sheet?.name || 'này';

    const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
    modal.show();
}

function deleteCurrentSheet() {
    if (!AppState.activeSheetId) return;
    deleteSheet(AppState.activeSheetId);
}

async function confirmDeleteSheet() {
    if (!deletingSheetId) return;

    updateSyncStatus('syncing');

    try {
        const sheetsPath = getUserPath(FIREBASE_PATHS.SHEETS);
        await AppState.database.ref(`${sheetsPath}/${deletingSheetId}`).remove();

        // Clear history for this sheet
        const historyPath = getUserPath(FIREBASE_PATHS.HISTORY);
        await AppState.database.ref(`${historyPath}/${deletingSheetId}`).remove();

        // If deleted sheet was active, clear active
        if (deletingSheetId === AppState.activeSheetId) {
            AppState.activeSheetId = null;
            await AppState.database.ref(getUserPath(FIREBASE_PATHS.ACTIVE_SHEET)).remove();
        }

        showToast('Đã xóa trang', 'success');

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('deleteModal'));
        modal.hide();

    } catch (error) {
        console.error('[APP] Error deleting sheet:', error);
        showToast('Lỗi xóa trang', 'error');
        updateSyncStatus('error');
    }

    deletingSheetId = null;
}

// =====================================================
// PRODUCTS TABLE
// =====================================================

function renderProductsTable(items) {
    const tbody = document.getElementById('productsTableBody');
    const emptyTable = document.getElementById('emptyTable');
    const tableFoot = document.getElementById('tableFoot');

    if (!items || items.length === 0) {
        tbody.innerHTML = '';
        emptyTable.style.display = 'block';
        tableFoot.style.display = 'none';
        return;
    }

    emptyTable.style.display = 'none';
    tableFoot.style.display = 'table-footer-group';

    tbody.innerHTML = items.map((item, index) => `
        <tr data-index="${index}">
            <td>
                <div class="product-cell">
                    ${item.imageUrl
                        ? `<img src="${item.imageUrl}" class="product-cell-image" alt="" onerror="this.outerHTML='<div class=\\'product-cell-placeholder\\'>📦</div>'">`
                        : '<div class="product-cell-placeholder">📦</div>'
                    }
                    <div class="product-cell-info">
                        <div class="product-cell-name">${escapeHtml(item.productName || 'Sản phẩm')}</div>
                        <div class="product-cell-code">Mã: ${escapeHtml(item.productCode || '--')}</div>
                    </div>
                </div>
            </td>
            <td class="image-cell">
                ${item.imageUrl
                    ? `<img src="${item.imageUrl}" alt="" onclick="viewImage('${item.imageUrl}')" onerror="this.outerHTML='📦'">`
                    : '📦'
                }
            </td>
            <td class="text-center">
                <input type="number" class="qty-input" value="${item.qtyLive || 0}"
                       min="0" onchange="updateItemQty(${index}, 'qtyLive', this.value)">
            </td>
            <td class="text-center">
                <input type="number" class="qty-input" value="${item.qtyInbox || 0}"
                       min="0" onchange="updateItemQty(${index}, 'qtyInbox', this.value)">
            </td>
            <td class="text-center">
                <input type="number" class="qty-input" value="${item.sentToNCC || 0}"
                       min="0" onchange="updateItemQty(${index}, 'sentToNCC', this.value)">
            </td>
            <td class="text-center">
                <input type="number" class="qty-input" value="${item.receivedIB || 0}"
                       min="0" onchange="updateItemQty(${index}, 'receivedIB', this.value)">
            </td>
            <td class="text-center">
                <button class="btn-delete-row" onclick="deleteItem(${index})" title="Xóa">
                    <i class="bi bi-x-lg"></i>
                </button>
            </td>
        </tr>
    `).join('');

    // Update totals
    updateTotals(items);
}

function updateTotals(items) {
    let totalLive = 0, totalInbox = 0, totalSentNCC = 0, totalReceivedIB = 0;

    items.forEach(item => {
        totalLive += parseInt(item.qtyLive) || 0;
        totalInbox += parseInt(item.qtyInbox) || 0;
        totalSentNCC += parseInt(item.sentToNCC) || 0;
        totalReceivedIB += parseInt(item.receivedIB) || 0;
    });

    document.getElementById('totalLive').textContent = totalLive;
    document.getElementById('totalInbox').textContent = totalInbox;
    document.getElementById('totalSentNCC').textContent = totalSentNCC;
    document.getElementById('totalReceivedIB').textContent = totalReceivedIB;
}

// =====================================================
// ITEM CRUD
// =====================================================

async function addProductToSheet(product) {
    if (!AppState.activeSheetId) {
        showToast('Vui lòng chọn trang trước', 'warning');
        return;
    }

    const sheet = AppState.sheets[AppState.activeSheetId];
    const items = sheet.items || [];

    // Check duplicate
    const exists = items.some(item => item.productCode === product.code);
    if (exists) {
        showToast('Sản phẩm đã có trong danh sách', 'warning');
        return;
    }

    // Show loading toast
    showToast('Đang thêm sản phẩm...', 'info');

    // Fetch image URL from API
    let imageUrl = '';
    if (product.id) {
        imageUrl = await fetchProductImage(product.id);
    }

    const newItem = {
        id: 'item_' + Date.now(),
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        imageUrl: imageUrl || '',
        qtyLive: 0,
        qtyInbox: 0,
        sentToNCC: 0,
        receivedIB: 0,
        addedAt: Date.now()
    };

    items.push(newItem);

    updateSyncStatus('syncing');

    try {
        const sheetsPath = getUserPath(FIREBASE_PATHS.SHEETS);
        await AppState.database.ref(`${sheetsPath}/${AppState.activeSheetId}/items`).set(items);
        await AppState.database.ref(`${sheetsPath}/${AppState.activeSheetId}/updatedAt`).set(Date.now());

        // Log history
        await logHistory(AppState.activeSheetId, 'add', `Thêm ${product.code || product.name}`);

        showToast('Đã thêm sản phẩm', 'success');

        // Clear search
        document.getElementById('productSearch').value = '';
        hideSuggestions();

    } catch (error) {
        console.error('[APP] Error adding product:', error);
        showToast('Lỗi thêm sản phẩm', 'error');
        updateSyncStatus('error');
    }
}

async function updateItemQty(index, field, value) {
    if (!AppState.activeSheetId) return;

    const sheet = AppState.sheets[AppState.activeSheetId];
    const items = sheet.items || [];

    if (!items[index]) return;

    const oldValue = items[index][field] || 0;
    const newValue = parseInt(value) || 0;

    if (oldValue === newValue) return;

    items[index][field] = newValue;

    updateSyncStatus('syncing');

    try {
        const sheetsPath = getUserPath(FIREBASE_PATHS.SHEETS);
        await AppState.database.ref(`${sheetsPath}/${AppState.activeSheetId}/items/${index}/${field}`).set(newValue);
        await AppState.database.ref(`${sheetsPath}/${AppState.activeSheetId}/updatedAt`).set(Date.now());

        // Log history
        const fieldNames = {
            qtyLive: 'SL Live',
            qtyInbox: 'SL Inbox',
            sentToNCC: 'Gửi NCC',
            receivedIB: 'Nhận IB'
        };
        await logHistory(AppState.activeSheetId, 'edit',
            `${items[index].productCode}: ${fieldNames[field]} ${oldValue} → ${newValue}`);

    } catch (error) {
        console.error('[APP] Error updating item:', error);
        showToast('Lỗi cập nhật', 'error');
        updateSyncStatus('error');
    }
}

async function deleteItem(index) {
    if (!AppState.activeSheetId) return;

    const sheet = AppState.sheets[AppState.activeSheetId];
    const items = sheet.items || [];

    if (!items[index]) return;

    const deletedItem = items[index];
    items.splice(index, 1);

    updateSyncStatus('syncing');

    try {
        const sheetsPath = getUserPath(FIREBASE_PATHS.SHEETS);
        await AppState.database.ref(`${sheetsPath}/${AppState.activeSheetId}/items`).set(items);
        await AppState.database.ref(`${sheetsPath}/${AppState.activeSheetId}/updatedAt`).set(Date.now());

        // Log history
        await logHistory(AppState.activeSheetId, 'delete', `Xóa ${deletedItem.productName}`);

        showToast('Đã xóa sản phẩm', 'success');

    } catch (error) {
        console.error('[APP] Error deleting item:', error);
        showToast('Lỗi xóa sản phẩm', 'error');
        updateSyncStatus('error');
    }
}

// =====================================================
// PRODUCT SEARCH (TPOS)
// =====================================================

async function loadProductsData() {
    if (AppState.isLoadingProducts || AppState.productsData.length > 0) return;

    AppState.isLoadingProducts = true;
    console.log('[APP] Loading products from TPOS...');

    try {
        // Check cache first
        const cached = window.tposProductsCache?.getData();
        if (cached && cached.length > 0) {
            AppState.productsData = cached;
            console.log('[APP] Loaded', cached.length, 'products from cache');
            AppState.isLoadingProducts = false;
            return;
        }

        // Fetch from API
        const token = await getTPOSToken();
        if (!token) {
            console.warn('[APP] No TPOS token available');
            AppState.isLoadingProducts = false;
            return;
        }

        const response = await smartFetch(
            '/api/Product/ExportFileWithVariantPrice',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    Keyword: "",
                    Status: 1
                })
            }
        );

        if (response.ok) {
            const blob = await response.blob();
            const data = await parseExcelBlob(blob);
            AppState.productsData = data;
            console.log('[APP] Loaded', data.length, 'products from API');

            // Save to cache
            if (window.tposProductsCache) {
                window.tposProductsCache.setData(data);
            }
        }

    } catch (error) {
        console.error('[APP] Error loading products:', error);
    }

    AppState.isLoadingProducts = false;
}

async function getTPOSToken() {
    try {
        // Try using existing token manager
        if (window.tokenManager) {
            return await window.tokenManager.getToken();
        }

        // Fallback: fetch token directly
        const response = await smartFetch('/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'nvkt',
                password: 'Aa@123456789'
            })
        });

        if (response.ok) {
            const data = await response.json();
            return data.access_token;
        }
    } catch (error) {
        console.error('[APP] Error getting token:', error);
    }
    return null;
}

async function parseExcelBlob(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                // Parse with header row
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);

                // Parse products using Vietnamese headers
                const products = jsonData.map(row => {
                    const productName = row['Tên sản phẩm'] || '';
                    const codeMatch = productName.match(/\[([^\]]+)\]/);
                    const codeFromName = codeMatch ? codeMatch[1] : '';

                    return {
                        id: row['Id sản phẩm (*)'],
                        name: productName,
                        nameNoSign: removeVietnameseTones(productName || ''),
                        code: codeFromName || row['Mã sản phẩm'] || ''
                    };
                }).filter(p => p.name);

                resolve(products);
            } catch (error) {
                console.error('[APP] Error parsing Excel:', error);
                resolve([]);
            }
        };
        reader.readAsArrayBuffer(blob);
    });
}

// Fetch product image from TPOS API
async function fetchProductImage(productId) {
    try {
        const token = await getTPOSToken();
        if (!token || !productId) return null;

        // First try to get from product API
        const response = await smartFetch(
            `/api/odata/Product(${productId})?$select=Id,ImageUrl,ProductTmplId`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (response.ok) {
            const productData = await response.json();
            if (productData.ImageUrl) {
                return productData.ImageUrl;
            }

            // If no image, try to get from template
            if (productData.ProductTmplId) {
                const templateResponse = await smartFetch(
                    `/api/odata/ProductTemplate(${productData.ProductTmplId})?$select=Id,ImageUrl`,
                    {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }
                );

                if (templateResponse.ok) {
                    const templateData = await templateResponse.json();
                    return templateData.ImageUrl || null;
                }
            }
        }
    } catch (error) {
        console.error('[APP] Error fetching product image:', error);
    }
    return null;
}

function searchProducts(keyword) {
    if (!keyword || keyword.length < 2) return [];

    const searchNoSign = removeVietnameseTones(keyword.toLowerCase());

    return AppState.productsData
        .filter(product => {
            const matchName = (product.nameNoSign || '').toLowerCase().includes(searchNoSign);
            const matchCode = product.code && product.code.toLowerCase().includes(keyword.toLowerCase());
            return matchName || matchCode;
        })
        .slice(0, 10); // Max 10 results
}

function removeVietnameseTones(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

// =====================================================
// SEARCH UI
// =====================================================

function setupEventListeners() {
    const searchInput = document.getElementById('productSearch');

    searchInput.addEventListener('input', (e) => {
        clearTimeout(AppState.searchDebounceTimer);
        AppState.searchDebounceTimer = setTimeout(() => {
            handleSearch(e.target.value);
        }, 300);
    });

    searchInput.addEventListener('focus', () => {
        if (searchInput.value.length > 0) {
            handleSearch(searchInput.value);
        }
    });

    // Close suggestions on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            hideSuggestions();
        }
    });

    // Enter key in sheet name input
    document.getElementById('sheetNameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveSheet();
        }
    });
}

function handleSearch(keyword) {
    const dropdown = document.getElementById('suggestionsDropdown');
    const loadingEl = document.getElementById('searchLoading');

    if (!keyword || keyword.length < 2) {
        hideSuggestions();
        return;
    }

    // Show loading if products not loaded yet
    if (AppState.productsData.length === 0) {
        loadingEl.style.display = 'block';
        loadProductsData().then(() => {
            loadingEl.style.display = 'none';
            handleSearch(keyword);
        });
        return;
    }

    const results = searchProducts(keyword);

    if (results.length === 0) {
        dropdown.innerHTML = `
            <div class="suggestion-item" style="justify-content: center; color: var(--gray-500);">
                <i class="bi bi-search"></i> Không tìm thấy sản phẩm
            </div>
        `;
        dropdown.classList.add('show');
        return;
    }

    // Products from Excel don't have imageUrl - show placeholder
    dropdown.innerHTML = results.map(product => `
        <div class="suggestion-item" onclick='addProductToSheet(${JSON.stringify(product)})'>
            <div class="suggestion-placeholder">📦</div>
            <div class="suggestion-info">
                <div class="suggestion-name">${escapeHtml(product.name)}</div>
                <div class="suggestion-code">Mã: ${escapeHtml(product.code)}</div>
            </div>
        </div>
    `).join('');

    dropdown.classList.add('show');
}

function hideSuggestions() {
    document.getElementById('suggestionsDropdown').classList.remove('show');
}

// =====================================================
// HISTORY
// =====================================================

async function logHistory(sheetId, action, description) {
    try {
        const historyPath = getUserPath(FIREBASE_PATHS.HISTORY);
        const historyId = 'h_' + Date.now();

        await AppState.database.ref(`${historyPath}/${sheetId}/${historyId}`).set({
            id: historyId,
            action: action, // add, edit, delete
            description: description,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('[APP] Error logging history:', error);
    }
}

function loadSheetHistory(sheetId) {
    const historyPath = getUserPath(FIREBASE_PATHS.HISTORY);

    // Remove old listener
    if (AppState.unsubscribeHistory) {
        AppState.database.ref(`${historyPath}/${AppState.activeSheetId}`).off();
    }

    // Setup new listener
    AppState.database.ref(`${historyPath}/${sheetId}`)
        .orderByChild('timestamp')
        .limitToLast(50)
        .on('value', (snapshot) => {
            const data = snapshot.val();
            renderHistory(data);
        });
}

function renderHistory(historyData) {
    const container = document.getElementById('historyList');
    const emptyHistory = document.getElementById('emptyHistory');

    if (!historyData) {
        container.innerHTML = '';
        emptyHistory.style.display = 'block';
        container.appendChild(emptyHistory);
        return;
    }

    emptyHistory.style.display = 'none';

    // Sort by timestamp desc
    const items = Object.values(historyData).sort((a, b) => b.timestamp - a.timestamp);

    container.innerHTML = items.map(item => {
        const icons = {
            add: 'bi-plus-circle',
            edit: 'bi-pencil',
            delete: 'bi-trash'
        };
        const titles = {
            add: 'Thêm mới',
            edit: 'Chỉnh sửa',
            delete: 'Xóa'
        };

        return `
            <div class="history-item ${item.action}">
                <div class="history-icon">
                    <i class="bi ${icons[item.action] || 'bi-clock'}"></i>
                </div>
                <div class="history-content">
                    <div class="history-title">${titles[item.action] || item.action}</div>
                    <div class="history-desc">${escapeHtml(item.description)}</div>
                    <div class="history-time">${formatDateTime(item.timestamp)}</div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// UI HELPERS
// =====================================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    sidebar.classList.toggle('show');
    overlay.classList.toggle('show');
}

function toggleHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    const overlay = document.getElementById('overlay');

    panel.classList.toggle('show');
    overlay.classList.toggle('show');
}

function closePanels() {
    document.getElementById('sidebar').classList.remove('show');
    document.getElementById('historyPanel').classList.remove('show');
    document.getElementById('overlay').classList.remove('show');
}

function updateSyncStatus(status) {
    const el = document.getElementById('syncStatus');

    el.classList.remove('syncing', 'error');

    switch (status) {
        case 'syncing':
            el.classList.add('syncing');
            el.innerHTML = '<i class="bi bi-arrow-repeat"></i><span>Đang đồng bộ...</span>';
            break;
        case 'error':
            el.classList.add('error');
            el.innerHTML = '<i class="bi bi-exclamation-circle"></i><span>Lỗi đồng bộ</span>';
            break;
        default:
            el.innerHTML = '<i class="bi bi-cloud-check"></i><span>Đã đồng bộ</span>';
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toastId = 'toast_' + Date.now();

    const icons = {
        success: 'bi-check-circle',
        error: 'bi-x-circle',
        warning: 'bi-exclamation-circle',
        info: 'bi-info-circle'
    };

    const html = `
        <div id="${toastId}" class="toast toast-${type}" role="alert">
            <div class="toast-body d-flex align-items-center gap-2">
                <i class="bi ${icons[type]}"></i>
                ${escapeHtml(message)}
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', html);

    const toastEl = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
    toast.show();

    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

function viewImage(url) {
    window.open(url, '_blank');
}

// =====================================================
// UTILITIES
// =====================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(timestamp) {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function formatDateTime(timestamp) {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    return date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// =====================================================
// XLSX LIBRARY LOADER
// =====================================================

// Load XLSX library if not available
if (typeof XLSX === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
    document.head.appendChild(script);
}

console.log('[APP] Sổ Order Live app.js loaded');
