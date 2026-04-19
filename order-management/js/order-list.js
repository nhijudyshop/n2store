// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
let orderProducts = {}; // Object-based structure
let filteredProducts = []; // For search results
let searchKeyword = ''; // Current search keyword
let pageBeforeSearch = 1; // Save page before searching
let currentPage = 1;
let itemsPerPage = 8;
let displaySettings = {
    columns: 4,
    rows: 2,
    gap: 15,
    itemHeight: 500,
    nameMargin: 3,
};
let isSyncMode = false;
let isMergeVariants = false; // Merge variants mode disabled by default
let orderIsHideEditControls = false; // Hide edit controls mode disabled by default

// Campaign ID from localStorage (set by admin page)
let currentCampaignId = localStorage.getItem('om_current_campaign_id') || null;
let currentCampaignName = null;

// Add product data
let autoAddVariants = true;

// Optimization: Cache normalized product names for faster search
let normalizedProductNames = new Map(); // productId -> normalized name

// Optimization: Debounce timers for search input and Firebase sync
let searchInputDebounceTimer = null;
let firebaseSyncDebounceTimer = null;
const SEARCH_INPUT_DEBOUNCE_MS = 300; // Wait 300ms after user stops typing
const FIREBASE_SYNC_DEBOUNCE_MS = 500; // Wait 500ms before syncing to Firebase

// Firebase Configuration - use shared config (loaded via shared/js/firebase-config.js)
// Firebase is auto-initialized by shared config
const database = firebase.database();

let isSyncingFromFirebase = false;

function cleanProductForFirebase(product) {
    const cleanProduct = {
        Id: typeof product.Id === 'object' ? product.Id?.Id : product.Id,
        NameGet: String(product.NameGet || ''),
        QtyAvailable: Number(product.QtyAvailable) || 0,
        soldQty: Number(product.soldQty) || 0,
        remainingQty: Number(product.remainingQty) || 0,
        imageUrl: product.imageUrl ? String(product.imageUrl) : null,
        ProductTmplId:
            typeof product.ProductTmplId === 'object'
                ? product.ProductTmplId?.Id
                : product.ProductTmplId,
        ListPrice: Number(product.ListPrice) || 0,
        PriceVariant: Number(product.PriceVariant) || 0,
        addedAt: product.addedAt || Date.now(),
        isHidden: product.isHidden || false,
        lastRefreshed: product.lastRefreshed || null,
        campaignId: product.campaignId || currentCampaignId || null,
        campaignName: product.campaignName || currentCampaignName || null,
    };
    return cleanProduct;
}

// Auth functions removed — product data now fetched from Render DB via WarehouseAPI

function toggleSyncMode() {
    isSyncMode = !isSyncMode;
    updateHashUrl();
    updateSyncToggleButton();

    if (isSyncMode) {
        database
            .ref('orderSyncCurrentPage')
            .set(currentPage)
            .catch((error) => {
                console.error('❌ Lỗi sync page:', error);
            });

        // Sync current search data when enabling sync mode
        syncSearchKeywordToFirebase(searchKeyword);
    }

    console.log(isSyncMode ? '🔄 Đã bật chế độ đồng bộ' : '⏸️ Đã tắt chế độ đồng bộ');
}

function updateSyncToggleButton() {
    const btnToggle = document.getElementById('btnToggleSync');
    if (btnToggle) {
        if (isSyncMode) {
            btnToggle.classList.add('active');
            btnToggle.textContent = '🔄 Đang đồng bộ';
        } else {
            btnToggle.classList.remove('active');
            btnToggle.textContent = '⏸️ Đồng bộ';
        }
    }
}

function toggleMergeVariants() {
    isMergeVariants = !isMergeVariants;
    // Save to localStorage for backward compatibility
    localStorage.setItem('orderIsMergeVariants', JSON.stringify(isMergeVariants));

    // Sync to Firebase to sync between machines
    if (!isSyncingFromFirebase) {
        database
            .ref('orderIsMergeVariants')
            .set(isMergeVariants)
            .catch((error) => {
                console.error('❌ Lỗi sync merge variants:', error);
            });
    }

    updateMergeVariantsUI();
    updateProductGrid();
    console.log(
        isMergeVariants ? '📦 Đã bật chế độ gộp biến thể' : '📋 Đã tắt chế độ gộp biến thể'
    );
}

function updateMergeVariantsUI() {
    const btnToggle = document.getElementById('btnMergeVariants');

    if (isMergeVariants) {
        if (btnToggle) {
            btnToggle.classList.add('active');
            btnToggle.textContent = '📦 Đang gộp';
        }
    } else {
        if (btnToggle) {
            btnToggle.classList.remove('active');
            btnToggle.textContent = '📋 Gộp biến thể';
        }
    }
}

function toggleHideEditControls() {
    orderIsHideEditControls = !orderIsHideEditControls;
    // Save to localStorage only (no sync between machines)
    localStorage.setItem('orderIsHideEditControls', JSON.stringify(orderIsHideEditControls));

    updateHideEditControlsUI();
    console.log(
        orderIsHideEditControls ? '👁️ Đã ẩn các nút chỉnh sửa' : '👁️ Đã hiện các nút chỉnh sửa'
    );
}

function updateHideEditControlsUI() {
    const btnToggle = document.getElementById('btnToggleEdit');

    if (orderIsHideEditControls) {
        document.body.classList.add('hide-edit-controls');
        if (btnToggle) {
            btnToggle.classList.add('active');
            btnToggle.textContent = '👁️ Đang ẩn';
        }
    } else {
        document.body.classList.remove('hide-edit-controls');
        if (btnToggle) {
            btnToggle.classList.remove('active');
            btnToggle.textContent = '👁️ Ẩn chỉnh sửa';
        }
    }
}

async function loadMergeVariantsMode() {
    // Try to load from Firebase first, fallback to localStorage
    try {
        const snapshot = await database.ref('orderIsMergeVariants').once('value');
        const firebaseValue = snapshot.val();

        if (firebaseValue !== null && firebaseValue !== undefined) {
            isMergeVariants = firebaseValue;
            console.log('🔥 Loaded merge variants mode from Firebase:', isMergeVariants);
        } else {
            // Fallback to localStorage
            const saved = localStorage.getItem('orderIsMergeVariants');
            if (saved !== null) {
                isMergeVariants = JSON.parse(saved);
                console.log('💾 Loaded merge variants mode from localStorage:', isMergeVariants);
            }
        }
    } catch (error) {
        console.error('❌ Error loading merge variants mode from Firebase:', error);
        // Fallback to localStorage
        const saved = localStorage.getItem('orderIsMergeVariants');
        if (saved !== null) {
            isMergeVariants = JSON.parse(saved);
        }
    }

    updateMergeVariantsUI();
}

function loadHideEditControlsMode() {
    // Load from localStorage only (no sync between machines)
    const saved = localStorage.getItem('orderIsHideEditControls');
    if (saved !== null) {
        orderIsHideEditControls = JSON.parse(saved);
        console.log(
            '💾 Loaded hide edit controls mode from localStorage:',
            orderIsHideEditControls
        );
    }

    updateHideEditControlsUI();
}

function parseHashParams() {
    const hash = window.location.hash.substring(1);
    const params = {};

    if (!hash) return params;

    if (hash.includes('sync') || hash.includes('admin')) {
        params.sync = true;
    }

    const pageMatch = hash.match(/page=(\d+)/);
    if (pageMatch) {
        params.page = parseInt(pageMatch[1]);
    }

    return params;
}

function updateHashUrl() {
    const parts = [];

    if (isSyncMode) {
        parts.push('sync');
    }

    if (currentPage > 1) {
        parts.push(`page=${currentPage}`);
    }

    const newHash = parts.length > 0 ? '#' + parts.join('&') : '';

    if (window.location.hash !== newHash) {
        window.history.replaceState(null, null, newHash || window.location.pathname);
    }
}

async function loadSettings() {
    // Try localStorage first for instant load
    try {
        const cachedSettings = localStorage.getItem('orderDisplaySettings');
        if (cachedSettings) {
            const settings = JSON.parse(cachedSettings);
            displaySettings = settings;
            itemsPerPage = settings.itemsPerPage || settings.columns * settings.rows;
            console.log('⚡ Settings loaded from localStorage cache');
            applySettings();
        }
    } catch (e) {
        console.log('📋 No cached settings, loading from Firebase');
    }

    // Then sync from Firebase (source of truth)
    try {
        const snapshot = await database.ref('orderDisplaySettings').once('value');
        const settings = snapshot.val();
        if (settings) {
            displaySettings = settings;
            itemsPerPage = settings.itemsPerPage || settings.columns * settings.rows;
            // Cache to localStorage
            localStorage.setItem('orderDisplaySettings', JSON.stringify(settings));
            console.log('🔥 Settings synced from Firebase');
        }
    } catch (error) {
        console.error('❌ Error loading settings from Firebase:', error);
    }
    applySettings();
}

function applySettings() {
    const productGrid = document.getElementById('productGrid');
    productGrid.style.gridTemplateColumns = `repeat(${displaySettings.columns}, 1fr)`;
    productGrid.style.gridTemplateRows = `repeat(${displaySettings.rows}, 1fr)`;
    productGrid.style.gap = `${displaySettings.gap}px`;

    // Apply Frame Layout CSS Variables
    document.documentElement.style.setProperty(
        '--name-line-clamp',
        displaySettings.nameLineClamp || 1
    );

    // Apply Image CSS Variables
    document.documentElement.style.setProperty(
        '--image-border-radius',
        `${displaySettings.imageBorderRadius || 8}px`
    );
    document.documentElement.style.setProperty(
        '--image-border-width',
        `${displaySettings.imageBorderWidth || 2}px`
    );
    document.documentElement.style.setProperty(
        '--image-margin-bottom',
        `${displaySettings.imageMarginBottom || 4}px`
    );

    // Apply Name CSS Variables
    document.documentElement.style.setProperty(
        '--name-font-size',
        `${displaySettings.nameFontSize || 13}px`
    );
    document.documentElement.style.setProperty(
        '--name-font-weight',
        displaySettings.nameFontWeight || 700
    );
    document.documentElement.style.setProperty(
        '--name-margin',
        `${displaySettings.nameMargin || 3}px`
    );
    document.documentElement.style.setProperty(
        '--name-line-height',
        displaySettings.nameLineHeight || 1.2
    );

    // Apply Stats CSS Variables
    document.documentElement.style.setProperty(
        '--stats-value-size',
        `${displaySettings.statsValueSize || 16}px`
    );
    document.documentElement.style.setProperty(
        '--stats-label-size',
        `${displaySettings.statsLabelSize || 9}px`
    );
    document.documentElement.style.setProperty(
        '--stats-padding',
        `${displaySettings.statsPadding || 3}px`
    );
    document.documentElement.style.setProperty('--stats-gap', `${displaySettings.statsGap || 4}px`);
    document.documentElement.style.setProperty(
        '--stats-border-radius',
        `${displaySettings.statsBorderRadius || 6}px`
    );
    document.documentElement.style.setProperty(
        '--stats-margin-top',
        `${displaySettings.statsMarginTop || 4}px`
    );
}

async function loadProducts() {
    if (!currentCampaignId) {
        console.log('⚠️ No campaign selected');
        showEmptyState();
        return;
    }
    try {
        orderProducts = await loadAllProductsFromFirebase(database, currentCampaignId);
        console.log('🔥 Loaded from Firebase:', Object.keys(orderProducts).length, 'products');

        if (Object.keys(orderProducts).length === 0) {
            showEmptyState();
        } else {
            updateProductGrid();
        }
    } catch (error) {
        console.error('❌ Error loading from Firebase:', error);
        orderProducts = {};
        console.log('⚠️ Using empty product list');
    }
}

function showEmptyState() {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
                <div class="empty-state">
                    <h2>📦 Chưa có sản phẩm nào</h2>
                    <p>Vui lòng quay lại trang tìm kiếm để thêm sản phẩm</p>
                    <a href="index.html" class="btn-back" style="font-size: 1.1em; padding: 12px 24px;">
                        ← Quay lại trang tìm kiếm
                    </a>
                </div>
            `;

    document.getElementById('btnPrev').style.display = 'none';
    document.getElementById('btnNext').style.display = 'none';
    document.getElementById('pageInfo').style.display = 'none';
}

function mergeProductsByTemplate(products) {
    // Group products by ProductTmplId
    const groupedProducts = {};

    products.forEach((product) => {
        const tmplId = product.ProductTmplId;

        // If product doesn't have ProductTmplId, treat it as individual product
        if (!tmplId) {
            // Use a unique key for products without template
            const uniqueKey = `no-template-${product.Id}`;
            groupedProducts[uniqueKey] = [product];
            return;
        }

        if (!groupedProducts[tmplId]) {
            groupedProducts[tmplId] = [];
        }
        groupedProducts[tmplId].push(product);
    });

    // Merge each group into a single product
    const mergedProducts = [];

    Object.entries(groupedProducts).forEach(([tmplId, variants]) => {
        if (variants.length === 1) {
            // Only one variant, keep as is
            mergedProducts.push(variants[0]);
        } else {
            // Multiple variants, merge them
            const firstVariant = variants[0];

            // Extract common name (remove variant-specific parts in parentheses)
            let commonName = firstVariant.NameGet;
            // Remove content within parentheses () to get base name
            commonName = commonName.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

            // Sum up quantities
            const totalQtyAvailable = variants.reduce((sum, v) => sum + (v.QtyAvailable || 0), 0);
            const totalSoldQty = variants.reduce((sum, v) => sum + (v.soldQty || 0), 0);

            // Create list of sold quantities for each variant
            const soldQtyList = variants.map((v) => ({
                id: v.Id,
                name: v.NameGet,
                qty: v.soldQty || 0,
                maxQty: v.QtyAvailable || 0,
            }));

            // Create list of remaining quantities for each variant
            const remainingQtyList = variants.map((v) => ({
                id: v.Id,
                name: v.NameGet,
                qty: v.remainingQty || 0,
            }));

            // Create list of deposit quantities for each variant
            const depositQtyList = variants.map((v) => ({
                id: v.Id,
                name: v.NameGet,
                qty: v.depositQty || 0,
            }));

            // Get the most recent addedAt timestamp from all variants
            const mostRecentAddedAt = Math.max(...variants.map((v) => v.addedAt || 0));

            // Create merged product
            const mergedProduct = {
                ...firstVariant,
                NameGet: commonName,
                QtyAvailable: totalQtyAvailable,
                soldQty: totalSoldQty,
                remainingQty: 0, // Not used for merged products
                soldQtyList: soldQtyList, // List of sold qty for each variant
                remainingQtyList: remainingQtyList, // List of remaining qty for each variant
                depositQtyList: depositQtyList, // List of deposit qty for each variant
                addedAt: mostRecentAddedAt, // Use most recent timestamp for sorting
                isMerged: true,
                variantCount: variants.length,
                variants: variants, // Keep reference to original variants for future use
            };

            mergedProducts.push(mergedProduct);
        }
    });

    // Sort merged products by addedAt (newest first) to maintain sort order
    mergedProducts.sort((a, b) => {
        const timeA = a.addedAt || 0;
        const timeB = b.addedAt || 0;
        return timeB - timeA; // Descending order (newest first)
    });

    return mergedProducts;
}

function updateProductGrid() {
    const productGrid = document.getElementById('productGrid');
    const pageInfo = document.getElementById('pageInfo');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');

    btnPrev.style.display = 'block';
    btnNext.style.display = 'block';
    pageInfo.style.display = 'block';

    // Filter out hidden products first
    const visibleProducts = Object.values(orderProducts).filter((p) => !p.isHidden);

    // Always show all products (search now jumps to product instead of filtering)
    const displayProducts = isMergeVariants
        ? mergeProductsByTemplate(visibleProducts)
        : visibleProducts;

    const totalPages = Math.ceil(displayProducts.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentProducts = displayProducts.slice(startIndex, endIndex);

    productGrid.innerHTML = currentProducts
        .map((product) => {
            // Add cache-busting version to image URL (only for HTTP URLs, not base64)
            // Use lastRefreshed (if exists) or addedAt (fallback) or Id (final fallback)
            const cacheVersion = product.lastRefreshed || product.addedAt || product.Id;
            let imageUrlWithVersion = product.imageUrl;

            // Only add cache-busting parameter for HTTP URLs, not base64 data URIs
            if (imageUrlWithVersion && !imageUrlWithVersion.startsWith('data:')) {
                imageUrlWithVersion = `${imageUrlWithVersion}${imageUrlWithVersion.includes('?') ? '&' : '?'}v=${cacheVersion}`;
            }

            const imageHtml = imageUrlWithVersion
                ? `<img src="${imageUrlWithVersion}" class="grid-item-image" alt="${product.NameGet}">`
                : `<div class="grid-item-image no-image"><span class="icon-emoji">📦</span></div>`;

            // Disable edit buttons for merged products
            const isMerged = product.isMerged || false;
            const disableEdit = isMerged ? 'disabled title="Tắt chế độ gộp để chỉnh sửa"' : '';

            // For delete button, create proper onclick handler
            let deleteButtonOnclick;
            let deleteButtonTitle;

            // For hide button, create proper onclick handler
            let hideButtonOnclick;
            let hideButtonTitle;

            if (isMerged && product.variants && product.variants.length > 0) {
                const variantIds = product.variants.map((v) => v.Id).join(',');
                deleteButtonOnclick = `deleteProducts([${variantIds}])`;
                deleteButtonTitle = 'Xóa tất cả biến thể';
                hideButtonOnclick = `hideProducts([${variantIds}])`;
                hideButtonTitle = 'Ẩn tất cả biến thể';
            } else {
                deleteButtonOnclick = `deleteProduct(${product.Id})`;
                deleteButtonTitle = 'Xóa sản phẩm';
                hideButtonOnclick = `hideProduct(${product.Id})`;
                hideButtonTitle = 'Ẩn sản phẩm';
            }

            // Format product name with price
            const productPrice = product.ListPrice || 0;
            const productNameDisplay =
                productPrice > 0 ? `${product.NameGet} ${productPrice / 1000}K` : product.NameGet;

            return `
                    <div class="grid-item ${isMerged ? 'mode-merged' : 'mode-single'}" data-product-id="${product.Id}">
                        ${imageHtml}
                        <div class="grid-item-name">
                            <span class="grid-item-name-text">${productNameDisplay}</span>
                            ${!orderIsHideEditControls ? `<div class="button-row"><button class="btn-delete" onclick="${deleteButtonOnclick}" title="${deleteButtonTitle}">Xóa</button><button class="btn-hide" onclick="${hideButtonOnclick}" title="${hideButtonTitle}">Ẩn</button></div>` : ''}
                        </div>
                        <div class="grid-item-stats">
                            <div class="grid-stat grid-stat-total">
                                <div class="grid-stat-label">📦 TỔNG</div>
                                ${
                                    isMerged && product.remainingQtyList
                                        ? `
                                    <div class="remaining-qty-list">
                                        ${product.remainingQtyList
                                            .map((item) => {
                                                const totalQty =
                                                    product.soldQtyList.find(
                                                        (s) => s.id === item.id
                                                    )?.maxQty || 0;
                                                return `
                                                <div class="remaining-qty-item">
                                                    <input type="number" class="remaining-qty-item-value" value="${totalQty}" onchange="updateProductTotalInput(${item.id}, this.value)" min="0">
                                                </div>
                                            `;
                                            })
                                            .join('')}
                                    </div>
                                `
                                        : `
                                    <input type="number" class="grid-stat-value editable-input" value="${product.QtyAvailable || 0}" onchange="updateProductTotalInput(${product.Id}, this.value)" ${disableEdit} min="0">
                                `
                                }
                            </div>
                            <div class="grid-stat grid-stat-sold">
                                <div class="grid-stat-label">🛒 BÁN</div>
                                ${
                                    isMerged && product.soldQtyList
                                        ? `
                                    <div class="remaining-qty-list">
                                        ${product.soldQtyList
                                            .map((item) => {
                                                return `
                                                <div class="remaining-qty-item sold-clickable" onclick="updateVariantQty(${item.id}, 1)" oncontextmenu="event.preventDefault(); updateVariantQty(${item.id}, -1)" title="Click trái +1 | Click phải -1" style="justify-content: center; cursor: pointer;">
                                                    <div class="remaining-qty-item-value">${item.qty}</div>
                                                </div>
                                            `;
                                            })
                                            .join('')}
                                    </div>
                                `
                                        : `
                                    <div class="grid-stat-value sold-clickable" onclick="updateProductQty(${product.Id}, 1)" oncontextmenu="event.preventDefault(); updateProductQty(${product.Id}, -1)" title="Click trái +1 | Click phải -1">${product.soldQty || 0}</div>
                                `
                                }
                            </div>
                            <div class="grid-stat grid-stat-deposit">
                                <div class="grid-stat-label">💰 CHỜ CỌC</div>
                                ${
                                    isMerged && product.depositQtyList
                                        ? `
                                    <div class="remaining-qty-list">
                                        ${product.depositQtyList
                                            .map((item) => {
                                                return `
                                                <div class="remaining-qty-item">
                                                    <input type="number" class="remaining-qty-item-value" value="${item.qty}" onchange="updateProductDepositInput(${item.id}, this.value)" min="0">
                                                </div>
                                            `;
                                            })
                                            .join('')}
                                    </div>
                                `
                                        : `
                                    <input type="number" class="grid-stat-value editable-input" value="${product.depositQty || 0}" onchange="updateProductDepositInput(${product.Id}, this.value)" ${disableEdit} min="0">
                                `
                                }
                            </div>
                            <div class="grid-stat grid-stat-remaining">
                                <div class="grid-stat-label">📝 ĐÃ ĐẶT</div>
                                ${
                                    isMerged && product.remainingQtyList
                                        ? `
                                    <div class="remaining-qty-list">
                                        ${product.remainingQtyList
                                            .map((item) => {
                                                // Extract only the part in parentheses () at the end
                                                const lastParenMatch =
                                                    item.name.match(/\(([^)]+)\)[^(]*$/);
                                                const variantName = lastParenMatch
                                                    ? '(' + lastParenMatch[1] + ')'
                                                    : item.name;
                                                return `
                                                <div class="remaining-qty-item">
                                                    <div class="remaining-qty-item-name">${variantName}</div>
                                                    <input type="number" class="remaining-qty-item-value" value="${item.qty}" onchange="updateProductOrderedInput(${item.id}, this.value)" min="0">
                                                </div>
                                            `;
                                            })
                                            .join('')}
                                    </div>
                                `
                                        : `
                                    <input type="number" class="grid-stat-value editable-input" value="${product.remainingQty || 0}" onchange="updateProductOrderedInput(${product.Id}, this.value)" ${disableEdit} min="0">
                                `
                                }
                            </div>
                        </div>
                    </div>
                `;
        })
        .join('');

    const searchInfo = searchKeyword ? ` - 🔍 "${searchKeyword}"` : '';
    pageInfo.textContent = `Trang ${currentPage}/${totalPages || 1} (${displayProducts.length} sản phẩm${isMergeVariants ? ' đã gộp' : ''})${searchInfo}`;
    btnPrev.disabled = currentPage === 1;
    btnNext.disabled = currentPage >= totalPages;
    const pageArrowPrev = document.getElementById('pageArrowPrev');
    const pageArrowNext = document.getElementById('pageArrowNext');
    if (pageArrowPrev) pageArrowPrev.disabled = currentPage === 1;
    if (pageArrowNext) pageArrowNext.disabled = currentPage >= totalPages;
}

function changePage(direction) {
    const visibleProducts = Object.values(orderProducts).filter((p) => !p.isHidden);
    const displayProducts = isMergeVariants
        ? mergeProductsByTemplate(visibleProducts)
        : visibleProducts;
    const totalPages = Math.ceil(displayProducts.length / itemsPerPage);

    if (direction === 'prev' && currentPage > 1) {
        currentPage--;
    } else if (direction === 'next' && currentPage < totalPages) {
        currentPage++;
    }

    updateProductGrid();
    updateHashUrl();

    if (isSyncMode && !isSyncingFromFirebase) {
        database
            .ref('orderSyncCurrentPage')
            .set(currentPage)
            .catch((error) => {
                console.error('❌ Lỗi sync page lên Firebase:', error);
            });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
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

// Optimization: Build cache of normalized product names
function buildNormalizedCache(products) {
    normalizedProductNames.clear();
    products.forEach((product) => {
        if (product && product.Id && product.NameGet) {
            normalizedProductNames.set(product.Id, removeVietnameseTones(product.NameGet));
        }
    });
}

// Optimization: Get normalized name from cache (or compute if not cached)
function getNormalizedName(product) {
    if (!product || !product.Id) return '';

    // Check cache first
    if (normalizedProductNames.has(product.Id)) {
        return normalizedProductNames.get(product.Id);
    }

    // Compute and cache
    const normalized = removeVietnameseTones(product.NameGet || '');
    normalizedProductNames.set(product.Id, normalized);
    return normalized;
}

function performSearch(keyword, syncToFirebase = true) {
    searchKeyword = keyword.trim();

    // Remove previous highlight
    document.querySelectorAll('.grid-item.search-highlight').forEach((el) => {
        el.classList.remove('search-highlight');
    });

    if (!searchKeyword) {
        filteredProducts = [];
        updateProductGrid();
        if (isSyncMode && syncToFirebase && !isSyncingFromFirebase) {
            syncSearchKeywordToFirebase('');
        }
        return;
    }

    const searchLower = searchKeyword.toLowerCase();
    const searchNoSign = removeVietnameseTones(searchKeyword);

    // Filter out hidden products first
    const visibleProducts = Object.values(orderProducts).filter((p) => !p.isHidden);
    const displayProducts = isMergeVariants
        ? mergeProductsByTemplate(visibleProducts)
        : visibleProducts;

    // Build cache if needed
    if (normalizedProductNames.size === 0) {
        buildNormalizedCache(displayProducts);
    }

    // Find matching product (best match)
    let bestMatch = null;
    let bestMatchIndex = -1;

    for (let i = 0; i < displayProducts.length; i++) {
        const product = displayProducts[i];
        const nameNoSign = getNormalizedName(product);
        const matchName = nameNoSign.includes(searchNoSign);
        const matchNameOriginal =
            product.NameGet && product.NameGet.toLowerCase().includes(searchLower);

        if (matchName || matchNameOriginal) {
            // Prioritize bracket match
            const bracketMatch = product.NameGet?.match(/\[([^\]]+)\]/);
            const bracket = bracketMatch ? bracketMatch[1].toLowerCase().trim() : '';
            if (bracket && bracket.includes(searchLower)) {
                bestMatch = product;
                bestMatchIndex = i;
                break; // Bracket match is highest priority
            }
            if (!bestMatch) {
                bestMatch = product;
                bestMatchIndex = i;
            }
        }
    }

    if (bestMatch && bestMatchIndex >= 0) {
        // Navigate to the page containing this product
        const targetPage = Math.floor(bestMatchIndex / itemsPerPage) + 1;
        if (currentPage !== targetPage) {
            currentPage = targetPage;
            updateProductGrid();
            updateHashUrl();
        }

        // Highlight the product after DOM update
        setTimeout(() => {
            const productEl = document.querySelector(
                `.grid-item[data-product-id="${bestMatch.Id}"]`
            );
            if (productEl) {
                productEl.classList.add('search-highlight');
                productEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }

    // Sync search keyword to Firebase if in sync mode (with debounce)
    if (isSyncMode && syncToFirebase && !isSyncingFromFirebase) {
        syncSearchKeywordToFirebase(searchKeyword);
    }
}

// Optimization: Debounced Firebase sync for search keyword
function syncSearchKeywordToFirebase(keyword) {
    // Clear existing timer
    if (firebaseSyncDebounceTimer) {
        clearTimeout(firebaseSyncDebounceTimer);
    }

    // Set new timer to sync after delay
    firebaseSyncDebounceTimer = setTimeout(() => {
        // Add timestamp to detect which search is most recent (avoid race conditions)
        const syncData = {
            keyword: keyword || '',
            timestamp: Date.now(),
        };

        database
            .ref('orderSyncSearchData')
            .set(syncData)
            .catch((error) => {
                console.error('❌ Lỗi sync search keyword:', error);
            });

        console.log('🔄 Synced search to Firebase:', keyword);
    }, FIREBASE_SYNC_DEBOUNCE_MS);
}

function clearSearch() {
    searchKeyword = '';
    filteredProducts = [];
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').classList.remove('show');

    // Remove highlight
    document.querySelectorAll('.grid-item.search-highlight').forEach((el) => {
        el.classList.remove('search-highlight');
    });

    updateProductGrid();

    // Sync empty search to Firebase if in sync mode (with debounce)
    if (isSyncMode && !isSyncingFromFirebase) {
        syncSearchKeywordToFirebase('');
    }
}

function updateProductQty(productId, change) {
    const productKey = `product_${productId}`;
    const product = orderProducts[productKey];
    if (!product) return;

    // Check if update is valid before calling helper
    const currentSoldQty = product.soldQty || 0;
    const newSoldQty = Math.max(0, Math.min(product.QtyAvailable, currentSoldQty + change));
    if (newSoldQty === currentSoldQty) return;

    // Let helper function update both local and Firebase
    // DO NOT update local here - helper will do it
    if (!isSyncingFromFirebase) {
        updateProductQtyInFirebase(
            database,
            currentCampaignId,
            productId,
            change,
            orderProducts
        ).catch((error) => {
            console.error('❌ Lỗi sync products:', error);
        });
    }

    updateProductGrid();
}

function updateVariantQty(variantId, change) {
    const variantKey = `product_${variantId}`;
    const variant = orderProducts[variantKey];
    if (!variant) return;

    // Check if update is valid before calling helper
    const currentSoldQty = variant.soldQty || 0;
    const newSoldQty = Math.max(0, Math.min(variant.QtyAvailable, currentSoldQty + change));
    if (newSoldQty === currentSoldQty) return;

    // Let helper function update both local and Firebase
    // DO NOT update local here - helper will do it
    if (!isSyncingFromFirebase) {
        updateProductQtyInFirebase(
            database,
            currentCampaignId,
            variantId,
            change,
            orderProducts
        ).catch((error) => {
            console.error('❌ Lỗi sync products:', error);
        });
    }

    updateProductGrid();
}

function hideProduct(productId) {
    if (!confirm('Bạn có chắc muốn ẩn sản phẩm này?')) return;

    const productKey = `product_${productId}`;
    const product = orderProducts[productKey];
    if (!product) return;

    product.isHidden = true;

    if (!isSyncingFromFirebase) {
        updateProductVisibility(database, currentCampaignId, productId, true, orderProducts).catch(
            (error) => {
                console.error('❌ Lỗi sync products:', error);
            }
        );
    }

    updateProductGrid();
    console.log(`👁️ Đã ẩn sản phẩm: ${product.NameGet}`);
}

function hideProducts(productIds) {
    const count = productIds.length;
    if (!confirm(`Bạn có chắc muốn ẩn tất cả ${count} biến thể?`)) return;

    let hiddenCount = 0;
    productIds.forEach((productId) => {
        const productKey = `product_${productId}`;
        const product = orderProducts[productKey];
        if (product) {
            product.isHidden = true;
            hiddenCount++;
        }
    });

    if (hiddenCount > 0 && !isSyncingFromFirebase) {
        // Batch update for all products
        const updates = {};
        productIds.forEach((productId) => {
            const productKey = `product_${productId}`;
            if (orderProducts[productKey]) {
                updates[`${getProductsPath(currentCampaignId)}/${productKey}/isHidden`] = true;
            }
        });
        database
            .ref()
            .update(updates)
            .catch((error) => {
                console.error('❌ Lỗi sync products:', error);
            });
    }

    updateProductGrid();
    console.log(`👁️ Đã ẩn ${hiddenCount} biến thể`);
}

function unhideProduct(productId) {
    const productKey = `product_${productId}`;
    const product = orderProducts[productKey];
    if (!product) return;

    product.isHidden = false;

    if (!isSyncingFromFirebase) {
        updateProductVisibility(database, currentCampaignId, productId, false, orderProducts).catch(
            (error) => {
                console.error('❌ Lỗi sync products:', error);
            }
        );
    }

    updateProductGrid();
    console.log(`👁️ Đã hiện sản phẩm: ${product.NameGet}`);
}

function deleteProduct(productId) {
    const productKey = `product_${productId}`;
    const product = orderProducts[productKey];
    if (!product) return;

    // Determine if this is a merged product with variants
    const isMergedProduct = product.isMerged && product.variants && product.variants.length > 0;
    const variantsToDelete = isMergedProduct ? product.variants : [product];

    // Prepare confirmation message
    const confirmMessage = isMergedProduct
        ? `Bạn có chắc muốn xóa sản phẩm gộp "${product.NameGet}"?\n\nToàn bộ ${variantsToDelete.length} biến thể sẽ bị xóa vĩnh viễn khỏi danh sách.`
        : `Bạn có chắc muốn xóa sản phẩm "${product.NameGet}"?\n\nSản phẩm sẽ bị xóa vĩnh viễn khỏi danh sách.`;

    if (!confirm(confirmMessage)) return;

    // Collect all product IDs to delete
    const productIdsToDelete = variantsToDelete.map((variant) => variant.Id);

    // Delete all variants from local object first
    variantsToDelete.forEach((variant) => {
        const variantKey = `product_${variant.Id}`;
        delete orderProducts[variantKey];
    });

    // Sync all deletions to Firebase in a single batch operation
    if (!isSyncingFromFirebase) {
        if (productIdsToDelete.length > 1) {
            // Use batch deletion for multiple products
            removeProductsFromFirebase(
                database,
                currentCampaignId,
                productIdsToDelete,
                orderProducts
            ).catch((error) => {
                console.error('❌ Lỗi xóa sản phẩm:', error);
            });
        } else {
            // Use single deletion for one product
            removeProductFromFirebase(
                database,
                currentCampaignId,
                productIdsToDelete[0],
                orderProducts
            ).catch((error) => {
                console.error('❌ Lỗi xóa sản phẩm:', error);
            });
        }
    }

    // Update UI
    updateProductGrid();

    const deletedCount = variantsToDelete.length;
    console.log(
        `🗑️ Đã xóa ${isMergedProduct ? `${deletedCount} biến thể của sản phẩm gộp` : 'sản phẩm'}: ${product.NameGet}`
    );
}

function deleteProducts(productIds) {
    const count = productIds.length;
    if (
        !confirm(
            `Bạn có chắc muốn xóa tất cả ${count} biến thể?\n\nTất cả biến thể sẽ bị xóa vĩnh viễn khỏi danh sách.`
        )
    )
        return;

    let deletedCount = 0;
    const productIdsToDelete = [];

    productIds.forEach((productId) => {
        const productKey = `product_${productId}`;
        const product = orderProducts[productKey];
        if (product) {
            delete orderProducts[productKey];
            productIdsToDelete.push(productId);
            deletedCount++;
        }
    });

    if (deletedCount > 0 && !isSyncingFromFirebase) {
        // Use batch deletion for all products
        removeProductsFromFirebase(
            database,
            currentCampaignId,
            productIdsToDelete,
            orderProducts
        ).catch((error) => {
            console.error('❌ Lỗi xóa sản phẩm:', error);
        });
    }

    // Update UI
    updateProductGrid();
    console.log(`🗑️ Đã xóa ${deletedCount} biến thể`);
}

function updateProductTotal(productId, change) {
    const productKey = `product_${productId}`;
    const product = orderProducts[productKey];
    if (!product) return;

    const newQtyAvailable = Math.max(0, product.QtyAvailable + change);
    if (newQtyAvailable === product.QtyAvailable) return;

    product.QtyAvailable = newQtyAvailable;

    // Ensure soldQty doesn't exceed new total
    if (product.soldQty > product.QtyAvailable) {
        product.soldQty = product.QtyAvailable;
    }

    if (!isSyncingFromFirebase) {
        database
            .ref(`${getProductsPath(currentCampaignId)}/${productKey}`)
            .update({
                QtyAvailable: product.QtyAvailable,
                soldQty: product.soldQty,
            })
            .catch((error) => {
                console.error('❌ Lỗi sync products:', error);
            });
    }

    updateProductGrid();
}

function updateProductTotalInput(productId, newValue) {
    const productKey = `product_${productId}`;
    const product = orderProducts[productKey];
    if (!product) return;

    const newQtyAvailable = Math.max(0, parseInt(newValue) || 0);
    if (newQtyAvailable === product.QtyAvailable) return;

    product.QtyAvailable = newQtyAvailable;

    // Ensure soldQty doesn't exceed new total
    if (product.soldQty > product.QtyAvailable) {
        product.soldQty = product.QtyAvailable;
    }

    if (!isSyncingFromFirebase) {
        database
            .ref(`${getProductsPath(currentCampaignId)}/${productKey}`)
            .update({
                QtyAvailable: product.QtyAvailable,
                soldQty: product.soldQty,
            })
            .catch((error) => {
                console.error('❌ Lỗi sync products:', error);
            });
    }

    updateProductGrid();
}

function updateProductOrderedInput(productId, newValue) {
    const productKey = `product_${productId}`;
    const product = orderProducts[productKey];
    if (!product) return;

    const newOrderedQty = Math.max(0, parseInt(newValue) || 0);

    if (newOrderedQty === product.remainingQty) return;

    // Update remainingQty independently (now represents "Đã đặt" - ordered quantity)
    product.remainingQty = newOrderedQty;

    if (!isSyncingFromFirebase) {
        database
            .ref(`${getProductsPath(currentCampaignId)}/${productKey}`)
            .update({
                remainingQty: product.remainingQty,
            })
            .catch((error) => {
                console.error('❌ Lỗi sync products:', error);
            });
    }

    updateProductGrid();
}

function updateProductDepositInput(productId, newValue) {
    const productKey = `product_${productId}`;
    const product = orderProducts[productKey];
    if (!product) return;

    const newDepositQty = Math.max(0, parseInt(newValue) || 0);

    if (newDepositQty === product.depositQty) return;

    product.depositQty = newDepositQty;

    if (!isSyncingFromFirebase) {
        database
            .ref(`${getProductsPath(currentCampaignId)}/${productKey}`)
            .update({
                depositQty: product.depositQty,
            })
            .catch((error) => {
                console.error('❌ Lỗi sync deposit qty:', error);
            });
    }

    updateProductGrid();
}

async function cleanupOldProductsLocal() {
    if (!isSyncingFromFirebase) {
        const result = await cleanupOldProducts(database, currentCampaignId, orderProducts);
        if (result.removed > 0) {
            console.log(`🗑️ Đã xóa ${result.removed} sản phẩm cũ hơn 7 ngày`);

            if (Object.keys(orderProducts).length === 0) {
                showEmptyState();
            } else {
                updateProductGrid();
            }
        }
    }
}

async function clearAllProductsLocal() {
    const productCount = Object.keys(orderProducts).length;
    if (productCount === 0) {
        alert('⚠️ Danh sách đã trống');
        return;
    }

    if (confirm(`Bạn có chắc muốn xóa tất cả ${productCount} sản phẩm không?`)) {
        if (!isSyncingFromFirebase) {
            await clearAllProducts(database, currentCampaignId, orderProducts);
        }
        showEmptyState();
    }
}

async function refreshProduct(productId) {
    const btnRefresh = event.target;
    const statTotal = btnRefresh.closest('.grid-stat-total');

    btnRefresh.classList.add('loading');
    btnRefresh.disabled = true;

    try {
        // Fetch from Render DB instead of TPOS OData
        const result = await WarehouseAPI.getProductAsTpos(productId);
        if (!result || !result.product) {
            throw new Error('Không tìm thấy sản phẩm trong kho');
        }

        const productData = result.product;
        const productKey = `product_${productId}`;
        const product = orderProducts[productKey];
        if (!product) {
            throw new Error('Không tìm thấy sản phẩm trong danh sách');
        }

        const oldQtyAvailable = product.QtyAvailable;
        product.QtyAvailable = productData.QtyAvailable || 0;

        // Update price information
        product.ListPrice = productData.ListPrice || 0;
        product.PriceVariant = productData.PriceVariant || 0;

        // Update image URL
        const newImageUrl = productData.imageUrl || productData.ImageUrl || '';

        // Update image if we got a new one
        if (newImageUrl) {
            product.imageUrl = newImageUrl;
        }

        // Add timestamp to track last refresh (for cache-busting)
        product.lastRefreshed = Date.now();

        if (!isSyncingFromFirebase) {
            database
                .ref(`${getProductsPath(currentCampaignId)}/${productKey}`)
                .update({
                    QtyAvailable: product.QtyAvailable,
                    ListPrice: product.ListPrice,
                    PriceVariant: product.PriceVariant,
                    imageUrl: product.imageUrl,
                    lastRefreshed: product.lastRefreshed,
                })
                .catch((error) => {
                    console.error('❌ Lỗi sync products:', error);
                });
        }

        updateProductGrid();

        console.log(`✅ Đã cập nhật sản phẩm ${product.NameGet}:`, {
            oldTotal: oldQtyAvailable,
            newTotal: product.QtyAvailable,
            sold: product.soldQty,
            remaining: product.remainingQty,
            imageUpdated: !!newImageUrl,
        });

        statTotal.style.background = 'linear-gradient(135deg, #c8e6c9 0%, #a5d6a7 100%)';
        setTimeout(() => {
            statTotal.style.background = '';
        }, 500);
    } catch (error) {
        console.error('❌ Lỗi refresh product:', error);
        alert('Lỗi khi cập nhật sản phẩm: ' + error.message);

        statTotal.style.background = 'linear-gradient(135deg, #ffcdd2 0%, #ef9a9a 100%)';
        setTimeout(() => {
            statTotal.style.background = '';
        }, 500);
    } finally {
        btnRefresh.classList.remove('loading');
        btnRefresh.disabled = false;
    }
}

document.getElementById('btnPrev').addEventListener('click', () => changePage('prev'));
document.getElementById('btnNext').addEventListener('click', () => changePage('next'));

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        changePage('prev');
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        changePage('next');
    } else if (e.key === 'Escape') {
        window.location.href = 'index.html';
    }
});

// Scroll wheel to change pages
let scrollCooldown = false;
document.addEventListener(
    'wheel',
    (e) => {
        if (scrollCooldown) return;
        if (e.deltaY > 0) {
            changePage('next');
        } else if (e.deltaY < 0) {
            changePage('prev');
        }
        scrollCooldown = true;
        setTimeout(() => {
            scrollCooldown = false;
        }, 300);
    },
    { passive: true }
);

// Touch swipe up/down to change pages
let touchStartY = 0;
let touchEndY = 0;
const productGrid = document.getElementById('productGrid');

productGrid.addEventListener(
    'touchstart',
    (e) => {
        touchStartY = e.changedTouches[0].screenY;
    },
    { passive: true }
);

productGrid.addEventListener(
    'touchend',
    (e) => {
        touchEndY = e.changedTouches[0].screenY;
        const swipeDistance = Math.abs(touchEndY - touchStartY);
        if (swipeDistance > 50) {
            if (touchEndY < touchStartY) {
                changePage('next'); // Swipe up = next
            } else {
                changePage('prev'); // Swipe down = prev
            }
        }
    },
    { passive: true }
);

const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');

// Use mouse position tracking instead of hover areas to avoid blocking input clicks
let mouseY = 0;
const edgeThreshold = 80; // Distance from edge to show buttons

document.addEventListener('mousemove', (e) => {
    mouseY = e.clientY;
    const windowHeight = window.innerHeight;

    // Check if mouse is near top edge
    if (mouseY < edgeThreshold && !btnPrev.disabled) {
        btnPrev.classList.add('active');
    } else {
        btnPrev.classList.remove('active');
    }

    // Check if mouse is near bottom edge
    if (mouseY > windowHeight - edgeThreshold && !btnNext.disabled) {
        btnNext.classList.add('active');
    } else {
        btnNext.classList.remove('active');
    }
});

// Keep buttons visible when hovering over them
[btnPrev, btnNext].forEach((btn) => {
    btn.addEventListener('mouseenter', () => {
        if (!btn.disabled) {
            btn.classList.add('active');
        }
    });

    btn.addEventListener('mouseleave', () => {
        // Recheck mouse position after leaving button
        const windowHeight = window.innerHeight;
        if (btn === btnPrev && mouseY >= edgeThreshold) {
            btn.classList.remove('active');
        } else if (btn === btnNext && mouseY <= windowHeight - edgeThreshold) {
            btn.classList.remove('active');
        }
    });
});

function setupFirebaseListeners() {
    database.ref('orderDisplaySettings').on('value', (snapshot) => {
        const settings = snapshot.val();
        if (settings && !isSyncingFromFirebase) {
            isSyncingFromFirebase = true;
            displaySettings = settings;
            itemsPerPage = settings.itemsPerPage || settings.columns * settings.rows;
            // Cache to localStorage for faster next load
            localStorage.setItem('orderDisplaySettings', JSON.stringify(settings));
            applySettings();
            updateProductGrid();
            console.log('🔥 Settings synced from Firebase');
            setTimeout(() => {
                isSyncingFromFirebase = false;
            }, 100);
        }
    });

    // Listen for merge variants mode changes
    database.ref('orderIsMergeVariants').on('value', (snapshot) => {
        const mergeMode = snapshot.val();
        if (mergeMode !== null && mergeMode !== undefined && !isSyncingFromFirebase) {
            isSyncingFromFirebase = true;
            isMergeVariants = mergeMode;
            localStorage.setItem('orderIsMergeVariants', JSON.stringify(isMergeVariants));
            updateMergeVariantsUI();
            updateProductGrid();
            console.log('🔥 Merge variants mode synced from Firebase:', isMergeVariants);
            setTimeout(() => {
                isSyncingFromFirebase = false;
            }, 100);
        }
    });

    // Products listener - USE CHILD LISTENERS (campaign-scoped)
    if (currentCampaignId) {
        setupFirebaseChildListeners(database, currentCampaignId, orderProducts, {
            onProductAdded: (product) => {
                if (!isSyncingFromFirebase) {
                    console.log('🔥 Product added from Firebase:', product.NameGet);
                    buildNormalizedCache(Object.values(orderProducts));
                    updateProductGrid();
                }
            },
            onProductChanged: (product) => {
                if (!isSyncingFromFirebase) {
                    console.log('🔥 Product updated from Firebase:', product.NameGet);
                    buildNormalizedCache(Object.values(orderProducts));
                    updateProductGrid();
                }
            },
            onProductRemoved: (product) => {
                if (!isSyncingFromFirebase) {
                    console.log('🔥 Product removed from Firebase:', product.NameGet);
                    buildNormalizedCache(Object.values(orderProducts));
                    updateProductGrid();
                }
            },
            onInitialLoadComplete: () => {
                console.log('✅ Firebase listeners setup complete');
            },
        });
    }

    database.ref('orderSyncCurrentPage').on('value', (snapshot) => {
        const page = snapshot.val();

        if (isSyncMode && page && !isSyncingFromFirebase && page !== currentPage) {
            isSyncingFromFirebase = true;

            const totalPages = Math.ceil(Object.keys(orderProducts).length / itemsPerPage);

            if (page >= 1 && page <= totalPages) {
                currentPage = page;
                updateProductGrid();
                updateHashUrl();
                console.log('🔥 Sync page synced from Firebase: page', page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }

            setTimeout(() => {
                isSyncingFromFirebase = false;
            }, 100);
        }
    });

    // Optimization: Listen for search data changes (with timestamp for race condition handling)
    let lastSyncedSearchTimestamp = 0;
    database.ref('orderSyncSearchData').on('value', (snapshot) => {
        const searchData = snapshot.val();

        // Only sync if in sync mode and not already syncing
        if (isSyncMode && !isSyncingFromFirebase && searchData) {
            const keyword = searchData.keyword || '';
            const timestamp = searchData.timestamp || 0;

            // Optimization: Only apply if this is a newer search (prevent race conditions)
            if (timestamp > lastSyncedSearchTimestamp) {
                const currentKeyword = document.getElementById('searchInput')?.value || '';

                // Only update if keyword is different
                if (keyword !== currentKeyword) {
                    isSyncingFromFirebase = true;
                    lastSyncedSearchTimestamp = timestamp;

                    const searchInput = document.getElementById('searchInput');
                    const searchClear = document.getElementById('searchClear');
                    const searchContainer = document.getElementById('searchContainer');

                    if (searchInput) {
                        searchInput.value = keyword;

                        // Show/hide clear button
                        if (keyword) {
                            searchClear.classList.add('show');
                            searchContainer.classList.add('active');
                        } else {
                            searchClear.classList.remove('show');
                            searchContainer.classList.remove('active');
                        }
                    }

                    // Perform search without syncing back to Firebase (prevent loop)
                    performSearch(keyword, false);

                    console.log(
                        '🔥 Search synced from Firebase:',
                        keyword,
                        '@',
                        new Date(timestamp).toLocaleTimeString()
                    );

                    setTimeout(() => {
                        isSyncingFromFirebase = false;
                    }, 100);
                }
            }
        }
    });
}

const settingsChannel = new BroadcastChannel('order-settings');

settingsChannel.onmessage = (event) => {
    if (event.data.type === 'settingsChanged') {
        console.log('⚙️ Settings updated from same device!');
        loadSettings();
        updateProductGrid();
    }
};

window.addEventListener('storage', (e) => {
    if (e.key === 'orderProducts') {
        loadProducts();
    } else if (e.key === 'orderDisplaySettings') {
        loadSettings();
        loadProducts();
    }
});

window.addEventListener('hashchange', () => {
    const params = parseHashParams();
    const wasSyncMode = isSyncMode;

    if (params.sync !== undefined) {
        isSyncMode = params.sync;
    } else {
        isSyncMode = false;
    }

    updateSyncToggleButton();

    if (isSyncMode && !wasSyncMode) {
        database
            .ref('orderSyncCurrentPage')
            .set(currentPage)
            .catch((error) => {
                console.error('❌ Lỗi sync page khi vào sync mode:', error);
            });
    }

    if (params.page) {
        const totalPages = Math.ceil(Object.keys(orderProducts).length / itemsPerPage);
        if (params.page >= 1 && params.page <= totalPages) {
            currentPage = params.page;
            updateProductGrid();

            if (isSyncMode && !isSyncingFromFirebase) {
                database
                    .ref('orderSyncCurrentPage')
                    .set(currentPage)
                    .catch((error) => {
                        console.error('❌ Lỗi sync page từ hash change:', error);
                    });
            }
        }
    } else {
        if (currentPage !== 1) {
            currentPage = 1;
            updateProductGrid();

            if (isSyncMode && !isSyncingFromFirebase) {
                database
                    .ref('orderSyncCurrentPage')
                    .set(currentPage)
                    .catch((error) => {
                        console.error('❌ Lỗi sync page reset:', error);
                    });
            }
        }
    }
});

// =====================================================
// SSE — Real-time image updates from product-warehouse
// =====================================================
let _sseSource = null;
let _sseImageTimer = null;

// Toast throttle so multiple TPOS events in quick succession only show 1 toast
let _sseToastAt = 0;
function _tposToast(message, level = 'info') {
    const now = Date.now();
    if (now - _sseToastAt < 5000) return;
    _sseToastAt = now;
    const nm = window.notificationManager;
    if (!nm) return;
    const fn = nm[level] || nm.info;
    try { fn.call(nm, message); } catch (_) {}
}

function setupImageSSE() {
    const SSE_URL = 'https://n2store-fallback.onrender.com/api/realtime/sse?keys=web_warehouse';
    try {
        _sseSource = new EventSource(SSE_URL);

        _sseSource.addEventListener('update', (e) => {
            try {
                const payload = JSON.parse(e.data);
                const action = payload?.data?.action;

                // User-visible notification for TPOS sync events
                if (action === 'sync_complete') {
                    const stats = payload.data.stats || {};
                    const changed = (stats.inserted || 0) + (stats.updated || 0);
                    if (changed > 0 || stats.deactivated) {
                        const parts = [];
                        if (stats.inserted) parts.push(`+${stats.inserted} mới`);
                        if (stats.updated)  parts.push(`${stats.updated} cập nhật`);
                        if (stats.deactivated) parts.push(`${stats.deactivated} ngừng`);
                        _tposToast(`TPOS đồng bộ: ${parts.join(', ')}`, 'success');
                    }
                    return;
                }
                if (action === 'deactivated') {
                    _tposToast(`TPOS xóa sản phẩm (${payload.data.count || 1} biến thể)`, 'warning');
                    return;
                }

                if (action !== 'image_update') return;

                const tposProductId = payload.data.tposProductId;
                const tposTemplateId = payload.data.tposTemplateId;
                const timestamp = payload.data.timestamp || Date.now();

                console.log('[SSE] Image update received:', { tposProductId, tposTemplateId });
                _tposToast('TPOS cập nhật ảnh sản phẩm', 'info');

                // Debounce — avoid rapid re-fetches
                if (_sseImageTimer) clearTimeout(_sseImageTimer);
                _sseImageTimer = setTimeout(() => {
                    refreshProductImages(tposProductId, tposTemplateId, timestamp);
                }, 2000);
            } catch (_) { /* ignore parse errors */ }
        });

        _sseSource.onerror = () => {
            console.warn('[SSE-Image] Disconnected, auto-reconnect...');
        };

        console.log('[SSE-Image] Listening for image updates');
    } catch (err) {
        console.warn('[SSE-Image] Setup failed:', err);
    }
}

/**
 * Refresh image for products matching the updated template/product ID.
 * Re-fetches from Render DB and updates Firebase RTDB + local state.
 */
async function refreshProductImages(tposProductId, tposTemplateId, timestamp) {
    const matchingKeys = Object.keys(orderProducts).filter(key => {
        const p = orderProducts[key];
        return p.Id == tposProductId ||
               p.Id == tposTemplateId ||
               p.ProductTmplId == tposTemplateId;
    });

    if (matchingKeys.length === 0) return;

    console.log(`[SSE-Image] Refreshing images for ${matchingKeys.length} product(s)`);

    for (const productKey of matchingKeys) {
        const product = orderProducts[productKey];
        try {
            const result = await WarehouseAPI.getProductAsTpos(product.Id);
            if (!result || !result.product) continue;

            const newImageUrl = result.product.imageUrl || result.product.ImageUrl || '';
            if (newImageUrl) {
                product.imageUrl = newImageUrl;
            }
            product.lastRefreshed = timestamp;

            // Sync to Firebase RTDB (scoped by campaign)
            if (!isSyncingFromFirebase && currentCampaignId) {
                const path = `${getProductsPath(currentCampaignId)}/${productKey}`;
                database.ref(path).update({
                    imageUrl: product.imageUrl,
                    lastRefreshed: product.lastRefreshed,
                }).catch(err => console.error('[SSE-Image] Firebase sync error:', err));
            }
        } catch (err) {
            console.warn('[SSE-Image] Refresh error for', productKey, err);
        }
    }

    // Re-render grid
    if (searchKeyword) {
        performSearch(searchKeyword, false);
    } else {
        updateProductGrid();
    }
}

window.addEventListener('load', async () => {
    loadSettings();
    loadMergeVariantsMode(); // Load merge variants mode from localStorage
    loadHideEditControlsMode(); // Load hide edit controls mode from localStorage

    // Load products FIRST (before listeners)
    await loadProducts();

    // THEN setup Firebase listeners
    setupFirebaseListeners();

    // Setup SSE for real-time image updates from product-warehouse
    setupImageSSE();

    // Cleanup products older than 7 days
    await cleanupOldProductsLocal();

    const params = parseHashParams();

    // Auto-enable sync mode by default
    isSyncMode = true;

    if (params.page && params.page > 1) {
        currentPage = params.page;
        updateProductGrid();
    }

    updateHashUrl();
    updateSyncToggleButton();

    if (isSyncMode) {
        database
            .ref('orderSyncCurrentPage')
            .set(currentPage)
            .catch((error) => {
                console.error('❌ Lỗi sync initial page lên Firebase:', error);
            });

        // Load current search data from Firebase when in sync mode
        try {
            const snapshot = await database.ref('orderSyncSearchData').once('value');
            const searchData = snapshot.val();

            if (searchData && searchData.keyword) {
                const keyword = searchData.keyword;
                const searchInput = document.getElementById('searchInput');
                const searchClear = document.getElementById('searchClear');
                const searchContainer = document.getElementById('searchContainer');

                if (searchInput) {
                    searchInput.value = keyword;
                    searchClear.classList.add('show');
                    searchContainer.classList.add('active');
                }

                // Perform initial search without syncing back
                performSearch(keyword, false);
                console.log('🔥 Loaded search from Firebase:', keyword);
            }
        } catch (error) {
            console.error('❌ Lỗi loading search từ Firebase:', error);
        }
    }

    // Setup search input event listener
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const searchContainer = document.getElementById('searchContainer');

    if (searchInput) {
        // Focus on click anywhere on search container
        searchContainer.addEventListener('click', () => {
            searchInput.focus();
        });

        // Optimization: Debounced search input to reduce Firebase calls
        searchInput.addEventListener('input', (e) => {
            const value = e.target.value;

            // Show/hide clear button (immediate visual feedback)
            if (value) {
                searchClear.classList.add('show');
                searchContainer.classList.add('active'); // Keep visible while typing
            } else {
                searchClear.classList.remove('show');
                searchContainer.classList.remove('active');
            }

            // Clear existing debounce timer
            if (searchInputDebounceTimer) {
                clearTimeout(searchInputDebounceTimer);
            }

            // Perform search after user stops typing (debounced)
            searchInputDebounceTimer = setTimeout(() => {
                performSearch(value);
            }, SEARCH_INPUT_DEBOUNCE_MS);
        });

        // Handle Enter key - perform search immediately (bypass debounce)
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                // Clear debounce timer
                if (searchInputDebounceTimer) {
                    clearTimeout(searchInputDebounceTimer);
                }
                // Perform search immediately
                performSearch(e.target.value);
            }
        });

        // Handle Escape key to clear search
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                clearSearch();
            }
        });
    }

    // === Campaign Selector ===
    loadCampaignsOL();

    // === Add Product Input ===
    const addProductInput = document.getElementById('addProductInput');
    const addProductContainer = document.getElementById('addProductContainer');
    const addProductSuggestions = document.getElementById('addProductSuggestions');
    let addProductDebounceTimer = null;

    if (addProductInput) {
        addProductInput.addEventListener('focus', () => {
            addProductContainer.classList.add('active');
        });

        addProductInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            addProductContainer.classList.add('active');

            if (addProductDebounceTimer) clearTimeout(addProductDebounceTimer);

            if (!value || value.length < 2) {
                addProductSuggestions.classList.remove('show');
                return;
            }

            addProductDebounceTimer = setTimeout(async () => {
                const results = await searchProductsFromAPI(value);
                displayAddProductSuggestions(results);
            }, 300);
        });

        addProductInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                if (addProductDebounceTimer) clearTimeout(addProductDebounceTimer);
                const value = e.target.value.trim();
                if (value.length >= 2) {
                    const results = await searchProductsFromAPI(value);
                    if (results.length === 1) {
                        loadProductDetailsOL(results[0].id);
                        addProductSuggestions.classList.remove('show');
                        addProductInput.value = '';
                    } else {
                        displayAddProductSuggestions(results);
                    }
                }
            }
        });

        addProductInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                addProductSuggestions.classList.remove('show');
                addProductInput.value = '';
                addProductContainer.classList.remove('active');
            }
        });

        // Close suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!addProductContainer.contains(e.target)) {
                addProductSuggestions.classList.remove('show');
            }
        });
    }
});

// === Campaign Functions ===
async function loadCampaignsOL() {
    try {
        const firestore = firebase.firestore();
        const selector = document.getElementById('campaignSelector');
        if (!selector) return;

        selector.innerHTML = '<option value="">-- Chọn đợt live --</option>';

        const list = (window.CampaignAPI && typeof window.CampaignAPI.loadAll === 'function')
            ? await window.CampaignAPI.loadAll()
            : [];
        const campaigns = list.map(c => ({
            id: c.id,
            name: c.name || c.id,
            createdAt: c.createdAt || '',
        }));

        // Load order counts
        const orderCountMap = {};
        try {
            const reportSnapshot = await firestore.collection('report_order_details').get();
            reportSnapshot.forEach((doc) => {
                const data = doc.data();
                if (!data.isSavedCopy) {
                    const name = data.tableName || doc.id.replace(/_/g, ' ');
                    orderCountMap[name] = data.totalOrders || 0;
                }
            });
        } catch (e) {
            /* ignore */
        }

        campaigns.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
        });

        campaigns.forEach((c) => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.dataset.campaignName = c.name;
            const orderCount = orderCountMap[c.name] || 0;
            opt.textContent = orderCount > 0 ? `${c.name} (${orderCount} đơn)` : c.name;
            selector.appendChild(opt);
        });

        // Restore last selected
        const savedCampaignId = localStorage.getItem('om_current_campaign_id');
        if (savedCampaignId) {
            selector.value = savedCampaignId;
            const selectedOpt = selector.options[selector.selectedIndex];
            if (selectedOpt && selectedOpt.value) {
                currentCampaignId = selectedOpt.value;
                currentCampaignName = selectedOpt.dataset.campaignName || '';
            }
        }
    } catch (error) {
        console.error('[CAMPAIGN-OL] Error loading campaigns:', error);
    }
}

function handleCampaignChangeOL() {
    const selector = document.getElementById('campaignSelector');
    const selectedOpt = selector.options[selector.selectedIndex];

    if (selectedOpt && selectedOpt.value) {
        currentCampaignId = selectedOpt.value;
        currentCampaignName = selectedOpt.dataset.campaignName || '';
        localStorage.setItem('om_current_campaign_id', currentCampaignId);
        // Reload page to switch campaign
        window.location.reload();
    }
}

// === Add Product Functions (via Render DB / WarehouseAPI) ===

async function searchProductsFromAPI(searchText) {
    if (!searchText || searchText.length < 1) return [];
    const rows = await WarehouseAPI.search(searchText, 10);
    return rows.map(row => WarehouseAPI.toSearchSuggestion(row));
}

function displayAddProductSuggestions(suggestions) {
    const suggestionsDiv = document.getElementById('addProductSuggestions');
    if (suggestions.length === 0) {
        suggestionsDiv.classList.remove('show');
        return;
    }

    suggestionsDiv.innerHTML = suggestions
        .map((product) => {
            const imgHtml = product.image
                ? `<img class="suggestion-img" src="${product.image}" alt="" loading="lazy">`
                : `<span class="suggestion-img-empty"></span>`;
            const qtyClass = (product.qty || 0) <= 0 ? ' suggestion-qty-zero' : '';
            return `<div class="suggestion-item" data-id="${product.id}">
                ${imgHtml}
                <div class="suggestion-info">
                    <div class="suggestion-name"><strong>${product.code || ''}</strong> — ${product.name}</div>
                    <div class="suggestion-meta">
                        <span class="suggestion-qty${qtyClass}">Tồn: ${product.qty || 0}</span>
                    </div>
                </div>
            </div>`;
        })
        .join('');

    suggestionsDiv.classList.add('show');

    suggestionsDiv.querySelectorAll('.suggestion-item').forEach((item) => {
        item.addEventListener('click', () => {
            const productId = parseInt(item.dataset.id);
            loadProductDetailsOL(productId);
            suggestionsDiv.classList.remove('show');
            document.getElementById('addProductInput').value = '';
        });
    });
}

function sortVariantsOL(variants) {
    const sizeOrder = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
    return [...variants].sort((a, b) => {
        const nameA = a.NameGet || '';
        const nameB = b.NameGet || '';
        const numberMatchA = nameA.match(/\((\d+)\)/);
        const numberMatchB = nameB.match(/\((\d+)\)/);
        if (numberMatchA && numberMatchB)
            return parseInt(numberMatchA[1]) - parseInt(numberMatchB[1]);
        const sizeMatchA = nameA.match(/\((S|M|L|XL|XXL|XXXL)\)/i);
        const sizeMatchB = nameB.match(/\((S|M|L|XL|XXL|XXXL)\)/i);
        if (sizeMatchA && sizeMatchB) {
            const indexA = sizeOrder.indexOf(sizeMatchA[1].toUpperCase());
            const indexB = sizeOrder.indexOf(sizeMatchB[1].toUpperCase());
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        }
        return nameA.localeCompare(nameB);
    });
}

async function loadProductDetailsOL(productId) {
    try {
        // Fetch from Render DB instead of TPOS OData
        const result = await WarehouseAPI.getProductAsTpos(productId);
        if (!result || !result.product) {
            throw new Error('Không tìm thấy sản phẩm');
        }

        const productData = result.product;
        const imageUrl = productData.imageUrl || productData.ImageUrl || '';

        if (autoAddVariants && result.variants && result.variants.length > 0) {
            const activeVariants = result.variants.filter((v) => v.Active === true);
            const sortedVariants = sortVariantsOL(activeVariants);

            if (sortedVariants.length === 0) {
                await addSingleProductOL(productData, imageUrl);
                return;
            }

            const variantsToAdd = sortedVariants.map((variant) => {
                const tposQty = variant.QtyAvailable || 0;
                const userInput = prompt(`Nhập số lượng tồn kho cho ${variant.NameGet}:`, tposQty);
                const qtyAvailable = userInput !== null ? parseInt(userInput) || 0 : tposQty;
                return cleanProductForFirebase({
                    Id: variant.Id,
                    NameGet: variant.NameGet,
                    QtyAvailable: qtyAvailable,
                    ProductTmplId: productData.ProductTmplId,
                    ListPrice: variant.ListPrice || 0,
                    PriceVariant: variant.PriceVariant || 0,
                    imageUrl: variant.imageUrl || variant.ImageUrl || imageUrl,
                    soldQty: 0,
                    remainingQty: 0,
                    isHidden: false,
                });
            });

            const batchResult = await addProductsToFirebase(
                database,
                currentCampaignId,
                variantsToAdd,
                orderProducts
            );
            updateProductGrid();
            alert(
                `Đã thêm ${batchResult.added} biến thể${batchResult.updated ? `, cập nhật ${batchResult.updated}` : ''}`
            );
        } else {
            await addSingleProductOL(productData, imageUrl);
        }
    } catch (error) {
        console.error('Error loading product:', error);
        alert('Lỗi: ' + error.message);
    }
}

async function addSingleProductOL(productData, imageUrl) {
    if (!currentCampaignId) {
        alert('⚠️ Vui lòng chọn đợt live trước khi thêm sản phẩm');
        return;
    }
    const tposQty = productData.QtyAvailable || 0;
    const userInput = prompt(`Nhập số lượng tồn kho cho ${productData.NameGet}:`, tposQty);
    const qtyAvailable = userInput !== null ? parseInt(userInput) || 0 : tposQty;

    const cleanProduct = cleanProductForFirebase({
        Id: productData.Id,
        NameGet: productData.NameGet,
        QtyAvailable: qtyAvailable,
        ProductTmplId: productData.ProductTmplId,
        ListPrice: productData.ListPrice || 0,
        PriceVariant: productData.PriceVariant || 0,
        imageUrl: imageUrl,
        soldQty: 0,
        remainingQty: 0,
    });

    await addProductToFirebase(database, currentCampaignId, cleanProduct, orderProducts);
    updateProductGrid();
    alert('✅ Đã thêm sản phẩm vào danh sách');
}

// Cleanup SSE on page unload
window.addEventListener('beforeunload', () => {
    if (_sseSource) { _sseSource.close(); _sseSource = null; }
    if (_sseImageTimer) clearTimeout(_sseImageTimer);
});
