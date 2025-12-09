/**
 * Product Search Module
 * Tách riêng các hàm search, suggestion, và xử lý sản phẩm
 * Có thể tái sử dụng ở các trang khác
 */

// ============================================
// STATE MANAGEMENT
// ============================================
let productsData = [];
let isLoadingExcel = false;
let autoAddVariants = true; // Mặc định BẬT chế độ tự động thêm variants
let bearerToken = null;
let tokenExpiry = null;

// ============================================
// CONFIGURATION
// ============================================
const config = {
    // Sử dụng Cloudflare Worker proxy thay vì gọi trực tiếp tomato.tpos.vn
    apiBaseUrl: 'https://chatomni-proxy.nhijudyshop.workers.dev/api',
    auth: {
        username: 'nvkt',
        password: 'Aa@123456789',
        clientId: 'tmtWebApp'
    }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Loại bỏ dấu tiếng Việt khỏi chuỗi
 * @param {string} str - Chuỗi cần xử lý
 * @returns {string} Chuỗi không dấu
 */
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

/**
 * Sắp xếp variants theo thứ tự số (1), (2), (3)... và size (S), (M), (L), (XL), (XXL), (XXXL)
 * @param {Array} variants - Mảng variants cần sắp xếp
 * @returns {Array} Mảng variants đã được sắp xếp
 */
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

/**
 * Làm sạch dữ liệu sản phẩm cho Firebase
 * @param {Object} product - Sản phẩm cần làm sạch
 * @returns {Object} Sản phẩm đã được làm sạch
 */
function cleanProductForFirebase(product) {
    const cleanProduct = {
        Id: typeof product.Id === 'object' ? product.Id?.Id : product.Id,
        NameGet: String(product.NameGet || ''),
        QtyAvailable: Number(product.QtyAvailable) || 0,
        soldQty: Number(product.soldQty) || 0,
        remainingQty: Number(product.remainingQty) || 0,
        imageUrl: product.imageUrl ? String(product.imageUrl) : null,
        ProductTmplId: typeof product.ProductTmplId === 'object' ? product.ProductTmplId?.Id : product.ProductTmplId,
        addedAt: product.addedAt || Date.now(), // Timestamp for auto-cleanup
        isHidden: product.isHidden || false, // Hidden status
        lastRefreshed: product.lastRefreshed || null // Timestamp for image cache-busting
    };
    return cleanProduct;
}

// ============================================
// AUTHENTICATION
// ============================================

/**
 * Lấy token xác thực mới từ API
 * @returns {Promise<string>} Bearer token
 */
async function getAuthToken() {
    try {
        const response = await fetch(`${config.apiBaseUrl}/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `grant_type=password&username=${config.auth.username}&password=${encodeURIComponent(config.auth.password)}&client_id=${config.auth.clientId}`
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

/**
 * Lấy token hợp lệ (sử dụng cached token nếu còn hiệu lực)
 * @returns {Promise<string>} Bearer token
 */
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

/**
 * Thực hiện fetch với authentication
 * @param {string} url - URL cần fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Response object
 */
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

// ============================================
// DATA LOADING
// ============================================

/**
 * Load dữ liệu Excel từ API
 * Yêu cầu: XLSX library phải được load trước (https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js)
 * @param {Function} onLoadingStart - Callback khi bắt đầu loading (optional)
 * @param {Function} onLoadingEnd - Callback khi kết thúc loading (optional)
 * @returns {Promise<Array>} Mảng sản phẩm đã load
 */
async function loadExcelData(onLoadingStart = null, onLoadingEnd = null) {
    if (isLoadingExcel || productsData.length > 0) return productsData;

    isLoadingExcel = true;
    if (onLoadingStart) onLoadingStart();

    try {
        const response = await authenticatedFetch(`${config.apiBaseUrl}/Product/ExportFileWithVariantPrice`, {
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

        // Check if XLSX is available
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library chưa được load. Vui lòng thêm: <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>');
        }

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
        return productsData;
    } catch (error) {
        console.error('Error loading Excel:', error);
        throw error;
    } finally {
        isLoadingExcel = false;
        if (onLoadingEnd) onLoadingEnd();
    }
}

// ============================================
// SEARCH FUNCTIONS
// ============================================

/**
 * Tìm kiếm sản phẩm theo text
 * @param {string} searchText - Text cần tìm
 * @returns {Array} Mảng sản phẩm phù hợp (tối đa 10)
 */
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

/**
 * Hiển thị suggestions (yêu cầu DOM elements)
 * @param {Array} suggestions - Mảng sản phẩm gợi ý
 * @param {string} suggestionsElementId - ID của element hiển thị suggestions (default: 'suggestions')
 * @param {Function} onProductClick - Callback khi click vào suggestion (nhận productId)
 */
function displaySuggestions(suggestions, suggestionsElementId = 'suggestions', onProductClick = null) {
    const suggestionsDiv = document.getElementById(suggestionsElementId);

    if (!suggestionsDiv) {
        console.error(`Element #${suggestionsElementId} không tồn tại`);
        return;
    }

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
            if (onProductClick) {
                onProductClick(productId, item.textContent.trim());
            }
            suggestionsDiv.classList.remove('show');
        });
    });
}

/**
 * Tự động tìm kiếm exact match
 * Nếu tìm thấy exact match hoặc chỉ 1 kết quả -> gọi callback
 * Nếu nhiều kết quả -> hiển thị suggestions
 * @param {string} searchText - Text cần tìm
 * @param {Function} onSingleMatch - Callback khi tìm thấy exact match hoặc 1 kết quả duy nhất (nhận productId)
 * @param {string} suggestionsElementId - ID của element hiển thị suggestions
 * @param {Function} onProductClick - Callback khi click vào suggestion
 */
function autoSearchExactMatch(searchText, onSingleMatch = null, suggestionsElementId = 'suggestions', onProductClick = null) {
    // Try exact match first
    const exactMatch = productsData.find(p =>
        p.code && p.code.toLowerCase() === searchText.toLowerCase()
    );

    if (exactMatch) {
        if (onSingleMatch) {
            onSingleMatch(exactMatch.id);
        }
        const suggestionsDiv = document.getElementById(suggestionsElementId);
        if (suggestionsDiv) {
            suggestionsDiv.classList.remove('show');
        }
    } else {
        // If no exact match, try fuzzy search
        const results = searchProducts(searchText);
        if (results.length === 1) {
            if (onSingleMatch) {
                onSingleMatch(results[0].id);
            }
            const suggestionsDiv = document.getElementById(suggestionsElementId);
            if (suggestionsDiv) {
                suggestionsDiv.classList.remove('show');
            }
        } else if (results.length > 1) {
            // Multiple results, show suggestions
            displaySuggestions(results, suggestionsElementId, onProductClick);
        }
    }
}

// ============================================
// PRODUCT DETAILS
// ============================================

/**
 * Load thông tin chi tiết sản phẩm từ API
 * @param {number|string} productId - ID sản phẩm
 * @param {Object} options - Tùy chọn
 * @param {boolean} options.autoAddVariants - Tự động thêm variants (default: true)
 * @param {Object} options.database - Firebase database reference (bắt buộc nếu autoAddVariants = true)
 * @param {Object} options.savedProducts - Object chứa sản phẩm đã lưu (bắt buộc nếu autoAddVariants = true)
 * @param {Function} options.onSuccess - Callback khi thành công (nhận product data)
 * @param {Function} options.onError - Callback khi lỗi (nhận error)
 * @param {Function} options.updateProductList - Callback để update product list UI
 * @param {Function} options.showNotification - Callback để hiển thị notification
 * @returns {Promise<Object>} Product data
 */
async function loadProductDetails(productId, options = {}) {
    const {
        autoAddVariants: shouldAutoAddVariants = autoAddVariants,
        database = null,
        savedProducts = null,
        onSuccess = null,
        onError = null,
        updateProductList = null,
        showNotification = null
    } = options;

    try {
        const response = await authenticatedFetch(
            `${config.apiBaseUrl}/odata/Product(${productId})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues`
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
                    `${config.apiBaseUrl}/odata/ProductTemplate(${productData.ProductTmplId})?$expand=UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues)`
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

        const result = {
            productData,
            templateData,
            imageUrl,
            variants: templateData?.ProductVariants || []
        };

        // Check if auto-add variants is enabled and variants exist
        if (shouldAutoAddVariants && templateData && templateData.ProductVariants && templateData.ProductVariants.length > 0) {
            if (!database || !savedProducts) {
                throw new Error('Database và savedProducts bắt buộc khi sử dụng autoAddVariants');
            }

            // Kiểm tra xem addProductsToFirebase có tồn tại không
            if (typeof addProductsToFirebase === 'undefined') {
                throw new Error('Function addProductsToFirebase chưa được định nghĩa. Vui lòng import firebase-helpers.js');
            }

            // Sort variants by number (1), (2), (3)... and size (S), (M), (L), (XL), (XXL), (XXXL)
            const sortedVariants = sortVariants(templateData.ProductVariants);

            // Prepare all variants for batch add
            const variantsToAdd = sortedVariants.map(variant => {
                const qtyAvailable = variant.QtyAvailable || 0;
                const variantImageUrl = variant.ImageUrl || imageUrl; // Use variant image or fallback to template image

                return cleanProductForFirebase({
                    Id: variant.Id,
                    NameGet: variant.NameGet,
                    QtyAvailable: qtyAvailable,
                    ProductTmplId: productData.ProductTmplId,
                    imageUrl: variantImageUrl,
                    soldQty: 0,
                    remainingQty: qtyAvailable,
                    isHidden: false // Variants are visible
                });
            });

            // Add main product to hidden list
            const mainProductQty = templateData.QtyAvailable || 0;
            const mainProduct = cleanProductForFirebase({
                Id: templateData.Id,
                NameGet: templateData.NameGet,
                QtyAvailable: mainProductQty,
                ProductTmplId: templateData.Id,
                imageUrl: imageUrl,
                soldQty: 0,
                remainingQty: mainProductQty,
                isHidden: true // Main product is hidden
            });

            // Add main product to the batch
            const allProducts = [...variantsToAdd, mainProduct];

            // Use batch add helper
            try {
                const addResult = await addProductsToFirebase(database, allProducts, savedProducts);

                if (updateProductList) {
                    updateProductList();
                }

                const totalAdded = addResult.added;
                const totalUpdated = addResult.updated;

                let message = '';
                if (totalAdded > 0 && totalUpdated > 0) {
                    message = `✅ Đã thêm ${totalAdded} biến thể mới, cập nhật ${totalUpdated} biến thể (giữ nguyên số lượng đã bán)`;
                } else if (totalUpdated > 0) {
                    message = `🔄 Đã cập nhật ${totalUpdated} biến thể (giữ nguyên số lượng đã bán)`;
                } else if (totalAdded > 0) {
                    message = `✅ Đã thêm ${totalAdded} biến thể sản phẩm`;
                }

                if (showNotification && message) {
                    showNotification(message);
                }

                result.addResult = addResult;
                result.message = message;
            } catch (error) {
                console.error('❌ Error saving variants to Firebase:', error);
                if (showNotification) {
                    showNotification('⚠️ Lỗi đồng bộ Firebase: ' + error.message);
                }
                throw error;
            }
        }

        if (onSuccess) {
            onSuccess(result);
        }

        return result;
    } catch (error) {
        console.error('Error loading product:', error);
        if (onError) {
            onError(error);
        }
        throw error;
    }
}

// ============================================
// STATE GETTERS/SETTERS
// ============================================

/**
 * Lấy dữ liệu sản phẩm hiện tại
 * @returns {Array} Mảng sản phẩm
 */
function getProductsData() {
    return productsData;
}

/**
 * Set dữ liệu sản phẩm
 * @param {Array} data - Mảng sản phẩm
 */
function setProductsData(data) {
    productsData = data;
}

/**
 * Lấy trạng thái autoAddVariants
 * @returns {boolean}
 */
function getAutoAddVariants() {
    return autoAddVariants;
}

/**
 * Set trạng thái autoAddVariants
 * @param {boolean} value
 */
function setAutoAddVariants(value) {
    autoAddVariants = value;
}

/**
 * Lấy trạng thái loading Excel
 * @returns {boolean}
 */
function getIsLoadingExcel() {
    return isLoadingExcel;
}

/**
 * Cấu hình lại module
 * @param {Object} newConfig - Cấu hình mới
 */
function configure(newConfig) {
    if (newConfig.apiBaseUrl) config.apiBaseUrl = newConfig.apiBaseUrl;
    if (newConfig.auth) {
        config.auth = { ...config.auth, ...newConfig.auth };
    }
}

// ============================================
// EXPORTS
// ============================================

// Export cho ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        // Core functions
        removeVietnameseTones,
        loadExcelData,
        searchProducts,
        displaySuggestions,
        loadProductDetails,
        autoSearchExactMatch,

        // Helper functions
        sortVariants,
        cleanProductForFirebase,
        authenticatedFetch,
        getAuthToken,
        getValidToken,

        // State management
        getProductsData,
        setProductsData,
        getAutoAddVariants,
        setAutoAddVariants,
        getIsLoadingExcel,

        // Configuration
        configure
    };
}

// Export cho browser (global)
if (typeof window !== 'undefined') {
    window.ProductSearchModule = {
        // Core functions
        removeVietnameseTones,
        loadExcelData,
        searchProducts,
        displaySuggestions,
        loadProductDetails,
        autoSearchExactMatch,

        // Helper functions
        sortVariants,
        cleanProductForFirebase,
        authenticatedFetch,
        getAuthToken,
        getValidToken,

        // State management
        getProductsData,
        setProductsData,
        getAutoAddVariants,
        setAutoAddVariants,
        getIsLoadingExcel,

        // Configuration
        configure
    };
}
