/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                      TAB3-PRODUCT-ASSIGNMENT.JS                              ║
 * ║            Product Assignment Module - Assign Products to Orders             ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  📖 ĐỌC FILE ARCHITECTURE.md TRƯỚC ĐỂ HIỂU CẤU TRÚC TỔNG QUAN               ║
 * ║                                                                              ║
 * ║  📝 KHI THÊM HÀM MỚI:                                                        ║
 * ║     1. Thêm vào đúng SECTION bên dưới                                        ║
 * ║     2. Cập nhật TABLE OF CONTENTS nếu là hàm quan trọng                      ║
 * ║     3. Cập nhật ARCHITECTURE.md nếu thêm section mới                         ║
 * ║                                                                              ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                         TABLE OF CONTENTS                                     ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  [SECTION 1]  STATE & FIREBASE CONFIG ..................... search: #STATE   ║
 * ║               - assignments[], productsData[], ordersData[]                  ║
 * ║               - Firebase database reference                                   ║
 * ║                                                                              ║
 * ║  [SECTION 2]  AUTH & API .................................. search: #AUTH    ║
 * ║               - getAuthToken() - Lấy bearer token                            ║
 * ║               - getValidToken() - Token management                            ║
 * ║               - authenticatedFetch() - API calls với auth                    ║
 * ║                                                                              ║
 * ║  [SECTION 3]  PRODUCT DATA ................................ search: #PRODUCT ║
 * ║               - loadProductsData() - Tải danh sách sản phẩm                 ║
 * ║               - searchProducts() - Tìm kiếm sản phẩm                        ║
 * ║               - displayProductSuggestions()                                   ║
 * ║               - sortVariants() - Sắp xếp biến thể                           ║
 * ║                                                                              ║
 * ║  [SECTION 4]  ORDER DATA .................................. search: #ORDER   ║
 * ║               - loadOrdersData() - Tải danh sách đơn hàng                   ║
 * ║               - requestOrdersDataFromTab1() - Lấy từ tab1                   ║
 * ║                                                                              ║
 * ║  [SECTION 5]  PRODUCT ASSIGNMENT .......................... search: #ASSIGN  ║
 * ║               - addProductToAssignment() - Thêm SP vào assignment           ║
 * ║               - renderAssignmentTable() - Render bảng assignment            ║
 * ║               - saveAssignments() - Lưu assignment lên Firebase             ║
 * ║               - loadAssignments() - Tải assignment từ Firebase              ║
 * ║                                                                              ║
 * ║  [SECTION 6]  UPLOAD PREVIEW .............................. search: #PREVIEW ║
 * ║               - renderUploadTable() - Render bảng upload                    ║
 * ║               - renderPreviewModal() - Modal xem trước upload               ║
 * ║               - showPreviewBeforeUpload()                                     ║
 * ║                                                                              ║
 * ║  [SECTION 7]  UPLOAD FUNCTIONS ............................ search: #UPLOAD  ║
 * ║               - uploadSelectedSTTs() - Upload các STT đã chọn              ║
 * ║               - uploadSingleSTT() - Upload một STT                          ║
 * ║               - prepareUploadDetails() - Chuẩn bị payload                   ║
 * ║               - prepareUploadPayload()                                        ║
 * ║                                                                              ║
 * ║  [SECTION 8]  UPLOAD HISTORY .............................. search: #HISTORY ║
 * ║               - loadUploadHistory() - Tải lịch sử upload                    ║
 * ║               - filterUploadHistory() - Lọc lịch sử                         ║
 * ║               - renderUploadHistoryList() - Render danh sách                ║
 * ║               - formatHistoryCard() - Format card lịch sử                   ║
 * ║                                                                              ║
 * ║  [SECTION 9]  HISTORY DETAIL .............................. search: #DETAIL  ║
 * ║               - viewUploadHistoryDetail() - Xem chi tiết                    ║
 * ║               - renderHistoryDetailHTML()                                     ║
 * ║                                                                              ║
 * ║  [SECTION 10] HISTORY COMPARISON .......................... search: #COMPARE ║
 * ║               - compareCartHistory() - So sánh giỏ hàng                     ║
 * ║               - compareCartHistoryV2()                                        ║
 * ║               - renderComparisonContent()                                     ║
 * ║                                                                              ║
 * ║  [SECTION 11] NOTE ENCODING ............................... search: #NOTE    ║
 * ║               - processNoteForUpload() - Encode note                         ║
 * ║               - formatNoteWithClickableEncoded()                              ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// Product Assignment Tab JavaScript
(function () {
    'use strict';

    // #region ═══════════════════════════════════════════════════════════════════
    // ║                    SECTION 1: STATE & FIREBASE CONFIG                   ║
    // ║                            search: #STATE                               ║
    // #endregion ════════════════════════════════════════════════════════════════

    // State #STATE
    let productsData = [];
    let ordersData = [];
    let ordersDataRequestAttempts = 0; // Counter for request attempts
    let assignments = [];
    let isLoadingProducts = false;
    let bearerToken = null;
    let tokenExpiry = null;
    let saveDebounceTimer = null;
    let userStorageManager = null; // User-specific storage manager
    let autoAddVariants = true; // Auto-add all product variants when selecting a product
    let productNotes = {}; // Store notes for products in preview (like tab2)

    // Firebase Configuration - use shared config (loaded via shared/js/firebase-config.js)
    // FIREBASE_CONFIG and firebaseConfig are provided by shared/js/firebase-config.js

    // Initialize Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const database = firebase.database();

    // Get Firebase path for current user
    function getUserFirebasePath() {
        if (!userStorageManager) {
            userStorageManager = window.userStorageManager;
        }
        return userStorageManager ? userStorageManager.getUserFirebasePath('orders_productAssignments') : 'productAssignments/guest';
    }

    // Utility Functions
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

    function extractProductCode(productName) {
        if (!productName) return '';
        // Extract code from square brackets [CODE]
        const match = productName.match(/\[([^\]]+)\]/);
        return match ? match[1].trim() : '';
    }

    function formatCurrency(amount) {
        if (!amount) return '0đ';
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(amount);
    }

    /**
     * Escape HTML special characters to prevent XSS
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // =====================================================
    // NOTE ENCODING/DECODING UTILITIES (for upload)
    // =====================================================
    const ENCODE_KEY = 'live';

    /**
     * Base64URL encode - compact format without padding
     */
    function base64UrlEncode(str) {
        return btoa(String.fromCharCode(...new TextEncoder().encode(str)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * Base64URL decode
     */
    function base64UrlDecode(str) {
        const padding = '='.repeat((4 - str.length % 4) % 4);
        const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding;
        const binary = atob(base64);
        return new TextDecoder().decode(
            Uint8Array.from(binary, c => c.charCodeAt(0))
        );
    }

    /**
     * XOR encryption with key
     */
    function xorEncrypt(text, key) {
        const textBytes = new TextEncoder().encode(text);
        const keyBytes = new TextEncoder().encode(key);
        const encrypted = new Uint8Array(textBytes.length);

        for (let i = 0; i < textBytes.length; i++) {
            encrypted[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
        }

        return btoa(String.fromCharCode(...encrypted));
    }

    /**
     * XOR decryption with key
     */
    function xorDecrypt(encoded, key) {
        const encrypted = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
        const keyBytes = new TextEncoder().encode(key);
        const decrypted = new Uint8Array(encrypted.length);

        for (let i = 0; i < encrypted.length; i++) {
            decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
        }

        return new TextDecoder().decode(decrypted);
    }

    /**
     * Encode full note text - wrap in [""]
     */
    function encodeFullNote(text) {
        if (!text || text.trim() === '') return '';

        const encrypted = xorEncrypt(text, ENCODE_KEY);
        const encoded = base64UrlEncode(encrypted);

        // Wrap in [""] for easy identification
        return `["${encoded}"]`;
    }

    /**
     * Decode full note text - extract from [""] if present
     */
    function decodeFullNote(encoded) {
        if (!encoded || encoded.trim() === '') return null;

        try {
            let encodedString = encoded.trim();

            // Extract from [""] wrapper if present
            const wrapperMatch = encodedString.match(/^\["(.+)"\]$/);
            if (wrapperMatch) {
                encodedString = wrapperMatch[1];
            }

            const decrypted = base64UrlDecode(encodedString);
            const text = xorDecrypt(decrypted, ENCODE_KEY);

            return text;
        } catch (error) {
            return null;
        }
    }

    /**
     * Extract plain text and encoded content from note
     */
    function extractNoteComponents(note) {
        if (!note || note.trim() === '') {
            return { plainText: '', encodedContent: null };
        }

        const wrapperMatch = note.match(/\["([A-Za-z0-9\-_]+)"\]/);

        if (wrapperMatch) {
            const encodedContent = wrapperMatch[0];
            const plainText = note.replace(encodedContent, '').trim();
            return { plainText, encodedContent };
        }

        return { plainText: note.trim(), encodedContent: null };
    }

    /**
     * Build product info lines from products array
     */
    function buildProductNoteLines(products) {
        if (!products || products.length === 0) return '';

        return products.map(p =>
            `${p.productCode} - ${p.quantity} - ${p.price}`
        ).join('\n');
    }

    /**
     * Process note for upload: decode existing, add products, re-encode
     */
    function processNoteForUpload(currentNote, products) {
        let plainTextOutside = '';
        let decodedContent = '';

        if (currentNote && currentNote.trim() !== '') {
            const { plainText, encodedContent } = extractNoteComponents(currentNote);
            plainTextOutside = plainText;

            if (encodedContent) {
                console.log('[NOTE] Found encoded content in [""], decoding...');
                decodedContent = decodeFullNote(encodedContent) || '';
            } else {
                // Might be legacy encoded or plain text
                const decoded = decodeFullNote(currentNote);
                if (decoded) {
                    console.log('[NOTE] Legacy encoded note, decoding...');
                    decodedContent = decoded;
                    plainTextOutside = '';
                } else {
                    // Plain text note
                    decodedContent = currentNote;
                    plainTextOutside = '';
                }
            }
        }

        // Build product lines
        const productLines = buildProductNoteLines(products);

        // Combine decoded content + new products
        let contentToEncode = '';
        if (decodedContent.trim() !== '' && productLines !== '') {
            contentToEncode = `${decodedContent}\n${productLines}`;
        } else if (decodedContent.trim() !== '') {
            contentToEncode = decodedContent;
        } else if (productLines !== '') {
            contentToEncode = productLines;
        }

        console.log('[NOTE] Content to encode:\n', contentToEncode);

        // Build final note
        let finalNote = '';

        if (contentToEncode.trim() !== '') {
            const encoded = encodeFullNote(contentToEncode);
            console.log('[NOTE] Encoded content length:', encoded.length);

            if (plainTextOutside.trim() !== '') {
                finalNote = `${plainTextOutside}\n${encoded}`;
            } else {
                finalNote = encoded;
            }
        } else if (plainTextOutside.trim() !== '') {
            finalNote = plainTextOutside;
        }

        return finalNote;
    }

    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, ${type === 'success' ? '#10b981 0%, #059669 100%' : '#ef4444 0%, #dc2626 100%'});
            color: white;
            padding: 16px 24px;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            z-index: 10000;
            font-weight: 600;
            animation: slideInRight 0.3s ease-out;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Auth Functions - Server-side token caching (Cloudflare Worker & Render.com)
    async function getAuthToken() {
        try {
            // Server handles token caching - just request token
            // Server returns cached token if valid, or fetches new one if needed
            const response = await API_CONFIG.smartFetch(`${API_CONFIG.WORKER_URL}/api/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `grant_type=password&username=${(window.ShopConfig?.getConfig?.()?.CompanyId || 1) === 2 ? 'nvktshop1' : 'nvktlive1'}&password=Aa%4028612345678&client_id=tmtWebApp`
            });

            if (!response.ok) {
                throw new Error('Không thể xác thực');
            }

            const data = await response.json();

            // Cache token locally for quick access (optional, server already caches)
            bearerToken = data.access_token;
            tokenExpiry = Date.now() + (data.expires_in * 1000);
            console.log('[AUTH] ✅ Token received (server-side cached)');

            return data.access_token;
        } catch (error) {
            console.error('Lỗi xác thực:', error);
            throw error;
        }
    }

    async function getValidToken() {
        // Check local cache first (optional optimization)
        if (bearerToken && tokenExpiry && tokenExpiry > Date.now() + 300000) {
            console.log('[AUTH] ✅ Using locally cached token');
            return bearerToken;
        }

        // Token expired or not available, fetch new one
        console.log('[AUTH] Token expired or not available, fetching new token...');
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
            const newToken = await getAuthToken();
            headers.Authorization = `Bearer ${newToken}`;

            return fetch(url, {
                ...options,
                headers
            });
        }

        return response;
    }

    // Load Products Data
    async function loadProductsData() {
        if (isLoadingProducts || productsData.length > 0) return;

        isLoadingProducts = true;
        const loadingIndicator = document.getElementById('loadingIndicator');
        loadingIndicator.style.display = 'block';

        try {
            const response = await authenticatedFetch(`${API_CONFIG.WORKER_URL}/api/Product/ExportFileWithVariantPrice`, {
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

            productsData = jsonData.map(row => {
                const productName = row['Tên sản phẩm'];
                const codeFromName = extractProductCode(productName);
                return {
                    id: row['Id sản phẩm (*)'],
                    name: productName,
                    nameNoSign: removeVietnameseTones(productName || ''),
                    code: codeFromName || row['Mã sản phẩm'] // Prefer code from name, fallback to default code
                };
            });

            console.log(`Đã load ${productsData.length} sản phẩm`);
        } catch (error) {
            console.error('Error loading products:', error);
            showNotification('Lỗi khi tải dữ liệu sản phẩm: ' + error.message, 'error');
        } finally {
            loadingIndicator.style.display = 'none';
            isLoadingProducts = false;
        }
    }

    // Load Orders Data from Tab1
    function loadOrdersData() {
        try {
            // Request data from tab1 directly, no localStorage cache
            console.log('[ORDERS] Requesting fresh orders data from tab1...');
            requestOrdersDataFromTab1();
        } catch (error) {
            console.error('Error loading orders:', error);
            ordersData = [];
            requestOrdersDataFromTab1();
        }
    }

    // Request orders data from tab1
    function requestOrdersDataFromTab1() {
        // Send message to parent window to request data from tab1
        if (window.parent) {
            window.parent.postMessage({
                type: 'REQUEST_ORDERS_DATA_FROM_TAB3'
            }, '*');
            console.log('📤 Đã gửi request lấy orders data từ tab1');
        }
    }

    // Product Search
    function searchProducts(searchText) {
        if (!searchText || searchText.length < 2) return [];

        const searchNoSign = removeVietnameseTones(searchText);

        return productsData.filter(product => {
            const matchName = product.nameNoSign.includes(searchNoSign);
            const matchCode = product.code && product.code.toLowerCase().includes(searchText.toLowerCase());
            return matchName || matchCode;
        }).slice(0, 10);
    }

    function displayProductSuggestions(suggestions) {
        const suggestionsDiv = document.getElementById('productSuggestions');

        if (suggestions.length === 0) {
            suggestionsDiv.classList.remove('show');
            return;
        }

        suggestionsDiv.innerHTML = suggestions.map(product => `
            <div class="suggestion-item" data-id="${product.id}">
                <span class="product-code">${product.code || 'N/A'}</span>
                <span class="product-name">${product.name}</span>
            </div>
        `).join('');

        suggestionsDiv.classList.add('show');

        suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', async () => {
                const productId = item.dataset.id;
                await addProductToAssignment(productId);
                suggestionsDiv.classList.remove('show');
                document.getElementById('productSearch').value = '';
            });
        });
    }

    // Sort variants by number (1), (2), (3)... and size (S), (M), (L), (XL), (XXL), (XXXL)
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

    // Add Product to Assignment Table
    async function addProductToAssignment(productId) {
        try {
            // Load product details
            const response = await authenticatedFetch(
                `${API_CONFIG.WORKER_URL}/api/odata/Product(${productId})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues`
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
                        `${API_CONFIG.WORKER_URL}/api/odata/ProductTemplate(${productData.ProductTmplId})?$expand=UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues)`
                    );

                    if (templateResponse.ok) {
                        templateData = await templateResponse.json();
                        if (!imageUrl) {
                            imageUrl = templateData.ImageUrl;
                        }
                    }
                } catch (error) {
                    console.error('Error loading template:', error);
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
                    // Check if product already assigned
                    const existingIndex = assignments.findIndex(a => a.productId === productData.Id);
                    if (existingIndex !== -1) {
                        showNotification('Sản phẩm đã có trong danh sách', 'error');
                        return;
                    }

                    // Add single product to assignments
                    const productCode = extractProductCode(productData.NameGet) || productData.DefaultCode || productData.Barcode || '';
                    const assignment = {
                        id: Date.now(),
                        productId: productData.Id,
                        productName: productData.NameGet,
                        productCode: productCode,
                        imageUrl: imageUrl,
                        sttList: []
                    };

                    assignments.push(assignment);
                    saveAssignments();
                    renderAssignmentTable();
                    showNotification('Đã thêm sản phẩm vào danh sách');
                    return; // Exit early
                }

                // Add all variants to assignments
                let addedCount = 0;
                let skippedCount = 0;

                for (const variant of sortedVariants) {
                    // Check if variant already assigned
                    const existingIndex = assignments.findIndex(a => a.productId === variant.Id);
                    if (existingIndex !== -1) {
                        skippedCount++;
                        continue; // Skip if already exists
                    }

                    const variantImageUrl = variant.ImageUrl || imageUrl; // Use variant image or fallback to template image
                    const productCode = extractProductCode(variant.NameGet) || variant.DefaultCode || variant.Barcode || '';

                    const assignment = {
                        id: Date.now() + addedCount, // Unique ID for each variant
                        productId: variant.Id,
                        productName: variant.NameGet,
                        productCode: productCode,
                        imageUrl: variantImageUrl,
                        sttList: []
                    };

                    assignments.push(assignment);
                    addedCount++;
                }

                saveAssignments();
                renderAssignmentTable();

                if (addedCount > 0 && skippedCount > 0) {
                    showNotification(`✅ Đã thêm ${addedCount} biến thể, bỏ qua ${skippedCount} biến thể đã tồn tại`);
                } else if (skippedCount > 0) {
                    showNotification(`⚠️ Tất cả ${skippedCount} biến thể đã tồn tại trong danh sách`, 'error');
                } else if (addedCount > 0) {
                    showNotification(`✅ Đã thêm ${addedCount} biến thể sản phẩm`);
                }
            } else {
                // Add single product (original behavior when autoAddVariants is disabled or no variants)
                // Check if product already assigned
                const existingIndex = assignments.findIndex(a => a.productId === productData.Id);
                if (existingIndex !== -1) {
                    showNotification('Sản phẩm đã có trong danh sách', 'error');
                    return;
                }

                // Add to assignments
                const productCode = extractProductCode(productData.NameGet) || productData.DefaultCode || productData.Barcode || '';
                const assignment = {
                    id: Date.now(),
                    productId: productData.Id,
                    productName: productData.NameGet,
                    productCode: productCode,
                    imageUrl: imageUrl,
                    sttList: []
                };

                assignments.push(assignment);
                saveAssignments();
                renderAssignmentTable();
                showNotification('Đã thêm sản phẩm vào danh sách');
            }
        } catch (error) {
            console.error('Error adding product:', error);
            showNotification('Lỗi: ' + error.message, 'error');
        }
    }

    // Render Assignment Table
    function renderAssignmentTable() {
        const tableBody = document.getElementById('assignmentTableBody');
        const countSpan = document.getElementById('assignmentCount');

        countSpan.textContent = assignments.length;

        if (assignments.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-muted py-5">
                        <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                        Chưa có sản phẩm nào được gán. Hãy tìm kiếm và thêm sản phẩm.
                    </td>
                </tr>
            `;
            // Clear search input when table is empty
            const searchInput = document.getElementById('assignmentSearch');
            if (searchInput) {
                searchInput.value = '';
            }
            return;
        }

        tableBody.innerHTML = assignments.map(assignment => {
            const imageHtml = assignment.imageUrl
                ? `<img src="${assignment.imageUrl}" class="product-image" alt="${assignment.productName}">`
                : `<div class="product-image no-image">📦</div>`;

            // Ensure backward compatibility
            if (!assignment.sttList) {
                assignment.sttList = assignment.sttNumber ? [{ stt: assignment.sttNumber, orderInfo: assignment.orderInfo }] : [];
            }

            // Render STT chips (with index for duplicate STT)
            const chipsHtml = assignment.sttList.length > 0
                ? assignment.sttList.map((item, index) => {
                    // Decode note safely with fallback
                    let noteText = item.orderInfo?.note || '';
                    try {
                        if (noteText && window.DecodingUtility) {
                            // Remove [""] encoded blocks first
                            noteText = noteText.replace(/\["[A-Za-z0-9\-_]+"\]/g, '').trim();

                            // Then filter out legacy encoded lines
                            const lines = noteText.split('\n');
                            const plainLines = lines.filter(line => {
                                const trimmed = line.trim();
                                // Skip lines that look encoded (long strings without spaces)
                                if (trimmed.length > 20 && !trimmed.includes(' ')) {
                                    const decoded = window.DecodingUtility.decodeProductLine(trimmed);
                                    return !decoded; // Skip if it's encoded
                                }
                                return true; // Keep non-encoded lines
                            });
                            noteText = plainLines.join(' ').substring(0, 50); // Limit length for chip display
                        }
                    } catch (e) {
                        // Fallback to original note on error
                        noteText = (item.orderInfo?.note || '').substring(0, 50);
                    }

                    const chipText = [item.orderInfo?.customerName, noteText].filter(Boolean).join(' - ');
                    return `
                        <div class="stt-chip" onclick="showSTTChipTooltip(event, ${assignment.id}, ${index})">
                            <span class="stt-chip-number">STT ${item.stt}</span>
                            ${chipText ? `<span class="stt-chip-customer">${chipText}</span>` : ''}
                            <button class="stt-chip-remove" onclick="event.stopPropagation(); removeSTTByIndex(${assignment.id}, ${index})">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `;
                }).join('')
                : '<span class="stt-chips-empty">Chưa có STT nào</span>';

            return `
                <tr class="assignment-row" data-assignment-id="${assignment.id}">
                    <td>
                        <div class="product-cell">
                            ${imageHtml}
                            <div class="product-info">
                                <div class="product-name-text">${assignment.productName}</div>
                                <div class="product-code-text">Mã: ${assignment.productCode || 'N/A'}</div>
                            </div>
                        </div>
                    </td>
                    <td class="stt-cell">
                        <div class="stt-input-wrapper">
                            <div class="stt-chips-container ${assignment.sttList.length > 0 ? 'has-items' : ''}">
                                ${chipsHtml}
                            </div>
                            <input
                                type="text"
                                class="stt-input"
                                placeholder="Nhập STT để thêm..."
                                data-assignment-id="${assignment.id}"
                                oninput="handleSTTInput(event)"
                                onfocus="handleSTTFocus(event)"
                                onblur="handleSTTBlur(event)"
                                onkeypress="handleSTTKeyPress(event)"
                            />
                            <div class="stt-suggestions" id="stt-suggestions-${assignment.id}"></div>
                        </div>
                    </td>
                    <td>
                        <button class="btn-remove" onclick="removeAssignment(${assignment.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Reapply filter if search input has value
        const searchInput = document.getElementById('assignmentSearch');
        if (searchInput && searchInput.value.trim() !== '') {
            filterAssignments(searchInput.value);
        }
    }

    // STT Input Handlers
    window.handleSTTInput = function (event) {
        const input = event.target;
        const assignmentId = parseInt(input.dataset.assignmentId);
        const value = input.value.trim();

        // Show suggestions immediately (no debounce for better UX)
        if (value.length >= 1) {
            showSTTSuggestions(assignmentId, value);
        } else {
            hideSTTSuggestions(assignmentId);
        }
    };

    window.handleSTTFocus = function (event) {
        const input = event.target;
        const assignmentId = parseInt(input.dataset.assignmentId);
        const value = input.value.trim();

        if (value.length >= 1) {
            showSTTSuggestions(assignmentId, value);
        }
    };

    window.handleSTTBlur = function (event) {
        const assignmentId = parseInt(event.target.dataset.assignmentId);
        // Delay to allow click on suggestion
        setTimeout(() => {
            hideSTTSuggestions(assignmentId);
        }, 200);
    };

    window.handleSTTKeyPress = function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const input = event.target;
            const assignmentId = parseInt(input.dataset.assignmentId);
            const value = input.value.trim();

            if (value) {
                // Try to find exact match
                const order = ordersData.find(o => o.stt && o.stt.toString() === value);
                if (order) {
                    input.value = '';
                    hideSTTSuggestions(assignmentId);
                    addSTTToAssignment(assignmentId, value, order);
                    // Focus is handled in addSTTToAssignment after render
                } else {
                    showNotification('Không tìm thấy STT: ' + value, 'error');
                }
            }
        }
    };

    function showSTTSuggestions(assignmentId, searchText) {
        const suggestionsDiv = document.getElementById(`stt-suggestions-${assignmentId}`);
        if (!suggestionsDiv) return;

        // Filter orders by STT
        const filteredOrders = ordersData.filter(order => {
            const sttMatch = order.stt && order.stt.toString().includes(searchText);
            const customerMatch = order.customerName &&
                removeVietnameseTones(order.customerName).includes(removeVietnameseTones(searchText));
            return sttMatch || customerMatch;
        }).sort((a, b) => {
            // Sort to prioritize exact matches first
            const aSTT = a.stt.toString();
            const bSTT = b.stt.toString();

            // Check for exact match
            const aExactMatch = aSTT === searchText;
            const bExactMatch = bSTT === searchText;

            if (aExactMatch && !bExactMatch) return -1;
            if (!aExactMatch && bExactMatch) return 1;

            // Check for starts with match
            const aStartsWith = aSTT.startsWith(searchText);
            const bStartsWith = bSTT.startsWith(searchText);

            if (aStartsWith && !bStartsWith) return -1;
            if (!aStartsWith && bStartsWith) return 1;

            // Both start with or both don't start with, sort by numeric value (ascending)
            return parseInt(aSTT) - parseInt(bSTT);
        }).slice(0, 10);

        if (filteredOrders.length === 0) {
            suggestionsDiv.classList.remove('show');
            return;
        }

        suggestionsDiv.innerHTML = filteredOrders.map(order => {
            // Decode note safely with fallback
            let noteText = order.note || '';
            try {
                if (noteText && window.DecodingUtility) {
                    // Remove [""] encoded blocks first
                    noteText = noteText.replace(/\["[A-Za-z0-9\-_]+"\]/g, '').trim();

                    // Then filter out legacy encoded lines
                    const lines = noteText.split('\n');
                    const plainLines = lines.filter(line => {
                        const trimmed = line.trim();
                        // Skip lines that look encoded (long strings without spaces)
                        if (trimmed.length > 20 && !trimmed.includes(' ')) {
                            const decoded = window.DecodingUtility.decodeProductLine(trimmed);
                            return !decoded; // Skip if it's encoded
                        }
                        return true; // Keep non-encoded lines
                    });
                    noteText = plainLines.join(' ').substring(0, 50); // Limit length for dropdown
                }
            } catch (e) {
                // Fallback to original note on error
                noteText = (order.note || '').substring(0, 50);
            }

            const displayText = [order.customerName, noteText].filter(Boolean).join(' - ') || 'N/A';
            return `
                <div class="stt-suggestion-item" data-assignment-id="${assignmentId}" data-stt="${order.stt}" data-order='${JSON.stringify(order)}'>
                    <span class="stt-number">${order.stt}</span>
                    <span class="customer-name">${displayText}</span>
                </div>
            `;
        }).join('');

        suggestionsDiv.classList.add('show');

        // Add click handlers
        suggestionsDiv.querySelectorAll('.stt-suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const stt = item.dataset.stt;
                const orderData = JSON.parse(item.dataset.order);
                selectSTT(assignmentId, stt, orderData);
            });

            // Add hover to show tooltip
            item.addEventListener('mouseenter', (e) => {
                const orderData = JSON.parse(item.dataset.order);
                showOrderTooltip(orderData, e);
            });

            item.addEventListener('mouseleave', () => {
                hideOrderTooltip();
            });
        });
    }

    function hideSTTSuggestions(assignmentId) {
        const suggestionsDiv = document.getElementById(`stt-suggestions-${assignmentId}`);
        if (suggestionsDiv) {
            suggestionsDiv.classList.remove('show');
        }
    }

    function selectSTT(assignmentId, stt, orderData) {
        // Clear input before adding (to avoid race condition)
        const input = document.querySelector(`input[data-assignment-id="${assignmentId}"]`);
        if (input) {
            input.value = '';
        }
        hideSTTSuggestions(assignmentId);
        hideOrderTooltip(); // Hide tooltip after selection

        addSTTToAssignment(assignmentId, stt, orderData);
        // Focus is handled in addSTTToAssignment after render
    }

    // Add STT to assignment (supports multiple STT, including duplicates)
    function addSTTToAssignment(assignmentId, stt, orderData) {
        const assignment = assignments.find(a => a.id === assignmentId);
        if (!assignment) return;

        // Ensure sttList exists
        if (!assignment.sttList) {
            assignment.sttList = [];
        }

        // Allow duplicate STT - count quantity based on total entries
        assignment.sttList.push({
            stt: stt,
            orderInfo: orderData,
            addedAt: Date.now() // Track when added
        });

        saveAssignments();
        renderAssignmentTable();

        // Refocus input after render (use setTimeout to ensure DOM is updated)
        setTimeout(() => {
            const input = document.querySelector(`input[data-assignment-id="${assignmentId}"]`);
            if (input) {
                input.focus();
            }
        }, 0);

        // Show count if duplicate
        const count = assignment.sttList.filter(item => item.stt === stt).length;
        const countText = count > 1 ? ` (x${count})` : '';
        showNotification(`✅ Đã thêm STT ${stt}${countText} - ${orderData.customerName || 'N/A'}`);
        hideOrderTooltip(); // Hide tooltip after adding
    }

    // Remove STT by index (to support duplicate STT)
    window.removeSTTByIndex = function (assignmentId, index) {
        const assignment = assignments.find(a => a.id === assignmentId);
        if (!assignment || !assignment.sttList) return;

        const stt = assignment.sttList[index].stt;
        assignment.sttList.splice(index, 1);

        // Save immediately for delete (no debounce) to prevent race conditions
        saveAssignments(true);
        renderAssignmentTable();

        // Show remaining count if there are duplicates
        const remainingCount = assignment.sttList.filter(item => item.stt === stt).length;
        const countText = remainingCount > 0 ? ` (còn ${remainingCount})` : '';
        showNotification(`🗑️ Đã xóa STT ${stt}${countText}`);
    };

    // Show tooltip for STT chip (by index)
    window.showSTTChipTooltip = function (event, assignmentId, index) {
        const assignment = assignments.find(a => a.id === assignmentId);
        if (!assignment || !assignment.sttList) return;

        const sttItem = assignment.sttList[index];
        if (sttItem && sttItem.orderInfo) {
            showOrderTooltip(sttItem.orderInfo, event);
        }
    };

    // Order Tooltip
    function showOrderTooltip(orderData, event) {
        const tooltip = document.getElementById('orderTooltip');

        tooltip.innerHTML = `
            <div class="order-tooltip-header">
                Đơn hàng #${orderData.stt || 'N/A'}
            </div>
            <div class="order-tooltip-row">
                <span class="order-tooltip-label">Khách hàng:</span>
                <span class="order-tooltip-value">${orderData.customerName || 'N/A'}</span>
            </div>
            <div class="order-tooltip-row">
                <span class="order-tooltip-label">SĐT:</span>
                <span class="order-tooltip-value">${orderData.phone || 'N/A'}</span>
            </div>
            <div class="order-tooltip-row">
                <span class="order-tooltip-label">Địa chỉ:</span>
                <span class="order-tooltip-value">${orderData.address || 'N/A'}</span>
            </div>
            <div class="order-tooltip-row">
                <span class="order-tooltip-label">Tổng tiền:</span>
                <span class="order-tooltip-value">${formatCurrency(orderData.totalAmount)}</span>
            </div>
            <div class="order-tooltip-row">
                <span class="order-tooltip-label">Số lượng:</span>
                <span class="order-tooltip-value">${orderData.quantity || 0}</span>
            </div>
            ${orderData.products && orderData.products.length > 0 ? `
                <div class="order-tooltip-products">
                    <div class="order-tooltip-products-title">Sản phẩm:</div>
                    ${orderData.products.map(p => `
                        <div class="order-tooltip-product-item">${p.name} (x${p.quantity})</div>
                    `).join('')}
                </div>
            ` : ''}
        `;

        // Position tooltip
        const x = event.clientX + 15;
        const y = event.clientY + 15;

        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
        tooltip.classList.add('show');
    }

    function hideOrderTooltip() {
        const tooltip = document.getElementById('orderTooltip');
        if (tooltip) {
            tooltip.classList.remove('show');
        }
    }

    // Remove Assignment
    window.removeAssignment = function (assignmentId) {
        if (confirm('Bạn có chắc muốn xóa sản phẩm này?')) {
            assignments = assignments.filter(a => a.id !== assignmentId);
            // Save immediately for delete (no debounce) to prevent race conditions
            saveAssignments(true);
            renderAssignmentTable();
            showNotification('Đã xóa sản phẩm');
        }
    };

    // Clear All Assignments
    window.clearAllAssignments = function () {
        if (assignments.length === 0) {
            showNotification('Danh sách đã trống', 'error');
            return;
        }

        if (confirm(`Bạn có chắc muốn xóa tất cả ${assignments.length} sản phẩm?`)) {
            assignments = [];
            // Save immediately for delete (no debounce) to prevent race conditions
            saveAssignments(true);
            renderAssignmentTable();
            showNotification('Đã xóa tất cả sản phẩm');
        }
    };

    // Save/Load Assignments
    // @param {boolean} immediate - If true, save immediately without debounce (for delete operations)
    // Save/Load Assignments
    // @param {boolean} immediate - If true, save immediately without debounce (for delete operations)
    // Save/Load Assignments
    // @param {boolean} immediate - If true, save immediately without debounce (for delete operations)
    function saveAssignments(immediate = false) {
        try {
            // Sanitize assignments to remove undefined values
            const sanitizedAssignments = assignments.map(a => {
                // Create a clean copy of the assignment
                const cleanAssignment = { ...a };

                // Sanitize sttList if it exists
                if (cleanAssignment.sttList && Array.isArray(cleanAssignment.sttList)) {
                    cleanAssignment.sttList = cleanAssignment.sttList.map(s => {
                        const cleanSTT = { ...s };
                        if (cleanSTT.orderInfo) {
                            cleanSTT.orderInfo = { ...cleanSTT.orderInfo };
                            // Ensure totalAmount is defined (default to 0)
                            if (cleanSTT.orderInfo.totalAmount === undefined) {
                                cleanSTT.orderInfo.totalAmount = 0;
                            }
                        }
                        return cleanSTT;
                    });
                }
                return cleanAssignment;
            });

            // Create data with timestamp
            const dataWithTimestamp = {
                assignments: sanitizedAssignments,
                _timestamp: Date.now(), // Add timestamp for conflict resolution
                _version: 1 // Version for future compatibility
            };

            console.log('[SAVE] 💾 Saving to LocalStorage with timestamp:', dataWithTimestamp._timestamp);

            // Function to perform LocalStorage save
            const performSave = () => {
                try {
                    localStorage.setItem('orders_productAssignments', JSON.stringify(dataWithTimestamp));
                    console.log('[SAVE] ✅ LocalStorage save success');

                    // Dispatch storage event manually for same-window listeners (if any)
                    window.dispatchEvent(new Event('storage'));
                } catch (error) {
                    console.error('[SAVE] ❌ LocalStorage save error:', error);
                    showNotification('Lỗi lưu dữ liệu: ' + error.message, 'error');
                }
            };

            // If immediate save (e.g., delete operations), save right away
            // Otherwise debounce to reduce writes
            if (immediate) {
                performSave();
            } else {
                if (saveDebounceTimer) {
                    clearTimeout(saveDebounceTimer);
                }
                saveDebounceTimer = setTimeout(() => {
                    saveDebounceTimer = null; // Clear timer ref
                    performSave();
                }, 500); // Reduced debounce time for local storage
            }
        } catch (error) {
            console.error('Error saving assignments:', error);
        }
    }

    // loadAssignments() removed - now loading directly from Firebase only

    /**
     * Reload Page with Cache Clear
     * Clear cache và reload Tab1, sau đó nhận dữ liệu mới khi Tab1 load xong
     * Tab3 KHÔNG reload - chỉ nhận data mới từ Tab1
     */
    window.reloadWithCacheClear = function () {
        console.log('[RELOAD] 🔄 Reload with cache clear requested...');

        // 1. Clear cache trực tiếp (cùng localStorage với Tab1)
        if (window.cacheManager) {
            window.cacheManager.clear("orders");
            window.cacheManager.clear("campaigns");
            console.log('[RELOAD] ✅ Cache cleared (orders + campaigns)');
        }

        // 2. Clear current orders data và show loading state
        ordersData = [];
        updateOrdersCount();
        showNotification('🔄 Đang tải lại dữ liệu từ Tab Quản Lý...', 'info');

        // 3. Gửi message lên main.html để reload CHỈ Tab1
        // Tab3 sẽ tự động nhận data mới khi Tab1 load xong (via ORDERS_DATA_RESPONSE)
        if (window.parent) {
            window.parent.postMessage({
                type: 'RELOAD_TAB1_ONLY'
            }, '*');
            console.log('[RELOAD] 📤 Sent RELOAD_TAB1_ONLY message to parent');
        } else {
            // Fallback nếu không có parent
            window.location.reload();
        }
    };

    // ============================================================
    // EXPORT EXCEL FUNCTIONALITY
    // Xuất danh sách đơn hàng từ TPOS ra file Excel
    // ============================================================

    let exportExcelModal = null;

    /**
     * Open Export Excel Modal
     */
    window.openExportExcelModal = function () {
        console.log('[EXPORT] 📊 Opening Export Excel Modal...');

        // Initialize Bootstrap modal if not exists
        if (!exportExcelModal) {
            const modalEl = document.getElementById('exportExcelModal');
            if (modalEl) {
                exportExcelModal = new bootstrap.Modal(modalEl);
            }
        }

        // Reset UI
        const progressEl = document.getElementById('exportProgress');
        const footerEl = document.getElementById('exportModalFooter');
        const exportBtn = document.getElementById('exportExcelBtn');

        if (progressEl) progressEl.style.display = 'none';
        if (footerEl) footerEl.style.display = 'flex';
        if (exportBtn) exportBtn.disabled = false;

        // Reset progress bar
        const progressBar = document.getElementById('exportProgressBar');
        if (progressBar) progressBar.style.width = '0%';

        // Show modal
        if (exportExcelModal) {
            exportExcelModal.show();
        }
    };

    /**
     * Close Export Excel Modal
     */
    window.closeExportExcelModal = function () {
        if (exportExcelModal) {
            exportExcelModal.hide();
        }
    };

    /**
     * Format date to DD/MM/YYYY HH:mm
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted date
     */
    function formatDateForExcel(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    /**
     * Format date for filename (DD-MM-YYYY)
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted date for filename
     */
    function formatDateForFilename(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }

    /**
     * Export Orders to Excel
     * Load 3000 orders from TPOS and export to Excel file
     */
    window.exportOrdersToExcel = async function () {
        console.log('[EXPORT] 📊 Starting export to Excel...');

        const skipRange = document.getElementById('exportSkipRange');
        const skip = parseInt(skipRange?.value || '0', 10);

        console.log(`[EXPORT] Skip value: ${skip}`);

        // Show progress
        const progressEl = document.getElementById('exportProgress');
        const exportBtn = document.getElementById('exportExcelBtn');
        const progressText = document.getElementById('exportProgressText');
        const progressBar = document.getElementById('exportProgressBar');

        if (progressEl) progressEl.style.display = 'block';
        if (exportBtn) exportBtn.disabled = true;
        if (progressText) progressText.textContent = 'Đang tải đơn hàng từ TPOS...';
        if (progressBar) progressBar.style.width = '20%';

        try {
            // Get auth headers
            const headers = await window.tokenManager.getAuthHeader();

            // Build API URL - Load 3000 orders without any campaign filter
            const url = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order/ODataService.GetView?$top=3000&$skip=${skip}&$orderby=DateCreated desc&$count=true`;

            console.log(`[EXPORT] Fetching from: ${url}`);
            if (progressBar) progressBar.style.width = '40%';

            // Fetch orders
            const response = await API_CONFIG.smartFetch(url, {
                headers: { ...headers, accept: 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const orders = data.value || [];
            const totalCount = data['@odata.count'] || orders.length;

            console.log(`[EXPORT] Loaded ${orders.length} orders (total: ${totalCount})`);
            if (progressText) progressText.textContent = `Đã tải ${orders.length} đơn hàng. Đang tạo file Excel...`;
            if (progressBar) progressBar.style.width = '70%';

            if (orders.length === 0) {
                alert('Không có đơn hàng nào để xuất!');
                if (progressEl) progressEl.style.display = 'none';
                if (exportBtn) exportBtn.disabled = false;
                return;
            }

            // Find min and max DateCreated for filename
            let minDate = orders[0].DateCreated;
            let maxDate = orders[0].DateCreated;

            orders.forEach(order => {
                if (order.DateCreated < minDate) minDate = order.DateCreated;
                if (order.DateCreated > maxDate) maxDate = order.DateCreated;
            });

            // Prepare Excel data
            const excelData = orders.map((order, index) => ({
                'STT': index + 1,
                'Khách hàng': order.Name || '',
                'SĐT': order.Telephone || '',
                'Địa Chỉ': order.Address || '',
                'Tổng tiền': order.TotalAmount || 0,
                'SL': order.TotalQuantity || 0,
                'Trạng thái': order.StatusText || order.Status || '',
                'Ngày Tạo': formatDateForExcel(order.DateCreated)
            }));

            if (progressBar) progressBar.style.width = '85%';

            // Create workbook and worksheet
            const ws = XLSX.utils.json_to_sheet(excelData);

            // Auto-fit column widths
            const colWidths = [];
            const headerKeys = Object.keys(excelData[0] || {});
            headerKeys.forEach((header, i) => {
                const maxLength = Math.max(
                    header.length,
                    ...excelData.map(row => String(row[header] || '').length)
                );
                colWidths[i] = { width: Math.min(maxLength + 2, 50) };
            });
            ws['!cols'] = colWidths;

            // Create workbook
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Đơn hàng');

            // Generate filename with date range
            const minDateStr = formatDateForFilename(minDate);
            const maxDateStr = formatDateForFilename(maxDate);
            const fileName = `Đơn hàng ${minDateStr} - ${maxDateStr}.xlsx`;

            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = 'Hoàn thành! Đang tải file...';

            // Download file
            XLSX.writeFile(wb, fileName);

            console.log(`[EXPORT] ✅ Excel file exported: ${fileName}`);

            // Close modal after short delay
            setTimeout(() => {
                closeExportExcelModal();
                // Reset UI
                if (progressEl) progressEl.style.display = 'none';
                if (exportBtn) exportBtn.disabled = false;
                if (progressBar) progressBar.style.width = '0%';
            }, 1000);

        } catch (error) {
            console.error('[EXPORT] ❌ Error exporting to Excel:', error);
            alert(`Lỗi xuất Excel: ${error.message}`);

            // Reset UI
            if (progressEl) progressEl.style.display = 'none';
            if (exportBtn) exportBtn.disabled = false;
            if (progressBar) progressBar.style.width = '0%';
        }
    };

    // Load assignments from LocalStorage
    function loadAssignmentsFromLocalStorage() {
        try {
            console.log('[INIT] 🔄 Loading assignments from LocalStorage...');

            const storedData = localStorage.getItem('orders_productAssignments');

            if (storedData) {
                const parsedData = JSON.parse(storedData);

                if (parsedData && parsedData.assignments && Array.isArray(parsedData.assignments)) {
                    // New format with timestamp
                    assignments = parsedData.assignments;
                    console.log('[INIT] ✅ Loaded from LocalStorage:', assignments.length, 'assignments');
                } else if (Array.isArray(parsedData)) {
                    // Old format (direct array) - migrate
                    console.log('[INIT] 📦 Old LocalStorage format detected, migrating...');
                    assignments = parsedData;
                    saveAssignments(); // Save with timestamp
                } else {
                    console.log('[INIT] ⚠️ Invalid data in LocalStorage');
                    assignments = [];
                }
            } else {
                // Empty
                console.log('[INIT] 📭 LocalStorage is empty');
                assignments = [];
            }

            renderAssignmentTable();
            console.log('[INIT] ✅ Initial load complete, assignments count:', assignments.length);
        } catch (error) {
            console.error('[INIT] ❌ Error loading from LocalStorage:', error);
            assignments = [];
            renderAssignmentTable();
        }
    }

    // Setup LocalStorage Listeners (Sync between tabs)
    function setupLocalStorageListeners() {
        console.log('[SYNC] 🔧 Setting up LocalStorage listeners');

        window.addEventListener('storage', (event) => {
            if (event.key === 'orders_productAssignments') {
                console.log('[SYNC] 🔔 LocalStorage changed (from another tab)');
                loadAssignmentsFromLocalStorage();
                showNotification('🔄 Dữ liệu đã được cập nhật từ tab khác');
            }
        });
    }







    // Product Search Input Handler
    document.getElementById('productSearch').addEventListener('input', (e) => {
        const searchText = e.target.value.trim();

        if (searchText.length >= 2) {
            if (productsData.length === 0) {
                loadProductsData().then(() => {
                    const results = searchProducts(searchText);
                    displayProductSuggestions(results);
                });
            } else {
                const results = searchProducts(searchText);
                displayProductSuggestions(results);
            }
        } else {
            document.getElementById('productSuggestions').classList.remove('show');
        }
    });

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrapper')) {
            document.getElementById('productSuggestions').classList.remove('show');
        }
    });

    // Initialize on load
    window.addEventListener('load', async () => {
        try {
            console.log('[INIT] 🚀 Initializing Tab3 Product Assignment...');
            console.log('[INIT] ✅ Using server-side token caching (Cloudflare Worker & Render.com)');

            // Initialize userStorageManager
            userStorageManager = window.userStorageManager;
            if (!userStorageManager) {
                console.warn('[INIT] ⚠️ UserStorageManager not available, creating fallback');
                userStorageManager = {
                    getUserFirebasePath: (path) => `${path}/guest`,
                    getUserIdentifier: () => 'guest'
                };
            }
            console.log('[INIT] 📱 User identifier:', userStorageManager.getUserIdentifier ? userStorageManager.getUserIdentifier() : 'guest');

            await getValidToken();
            loadOrdersData();

            // Load assignments from LocalStorage
            console.log('[INIT] 📱 Loading from LocalStorage...');
            loadAssignmentsFromLocalStorage();

            // Setup all listeners
            console.log('[INIT] 🔧 Setting up listeners...');
            setupLocalStorageListeners();       // LocalStorage sync

            await loadProductsData();
            updateOrdersCount(); // Update initial count

            console.log('[INIT] ✅ Initialization complete!');
        } catch (error) {
            console.error('[INIT] ❌ Initialization error:', error);
            showNotification('Lỗi khởi tạo: ' + error.message, 'error');
        }
    });

    // Listen for orders data updates from parent window
    window.addEventListener('message', (event) => {
        if (event.data.type === 'ORDERS_DATA_UPDATE' || event.data.type === 'ORDERS_DATA_RESPONSE_TAB3') {
            ordersData = event.data.orders;
            ordersDataRequestAttempts = 0; // Reset attempts counter
            // Cache in memory only, no localStorage
            console.log('[ORDERS] ✅ Updated orders data in memory:', ordersData.length, 'orders');

            // Update orders count badge
            updateOrdersCount();

            // Show notification
            if (ordersData.length > 0) {
                showNotification(`📦 Đã load ${ordersData.length} đơn hàng từ Tab Quản Lý`);
            }
        }
    });

    // Update orders count display
    function updateOrdersCount() {
        const countElement = document.getElementById('ordersCount');
        if (countElement) {
            countElement.textContent = ordersData.length;
        }
    }

    // Filter Assignments by search text
    window.filterAssignments = function (searchText) {
        const searchLower = removeVietnameseTones(searchText.toLowerCase().trim());
        const tableBody = document.getElementById('assignmentTableBody');
        const rows = tableBody.querySelectorAll('tr.assignment-row');
        const countSpan = document.getElementById('assignmentCount');

        if (!searchText || searchText.trim() === '') {
            // Show all rows if search is empty
            rows.forEach(row => {
                row.style.display = '';
            });
            // Reset count
            countSpan.textContent = assignments.length;
            return;
        }

        let visibleCount = 0;

        rows.forEach(row => {
            const assignmentId = parseInt(row.dataset.assignmentId);
            const assignment = assignments.find(a => a.id === assignmentId);

            if (!assignment) {
                row.style.display = 'none';
                return;
            }

            // Search in product code
            const productCodeMatch = assignment.productCode &&
                removeVietnameseTones(assignment.productCode.toLowerCase()).includes(searchLower);

            // Search in product name
            const productNameMatch = assignment.productName &&
                removeVietnameseTones(assignment.productName.toLowerCase()).includes(searchLower);

            // Search in STT list
            const sttMatch = assignment.sttList && assignment.sttList.some(item =>
                item.stt && item.stt.toString().includes(searchText.trim())
            );

            // Show row if any match
            if (productCodeMatch || productNameMatch || sttMatch) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        // Update count badge with filtered results
        if (visibleCount < assignments.length) {
            countSpan.textContent = `${visibleCount}/${assignments.length}`;
        } else {
            countSpan.textContent = assignments.length;
        }
    };

    // =====================================================
    // UPLOAD HISTORY VIEWER
    // =====================================================

    // Global state for history viewer
    let uploadHistoryRecords = [];
    let filteredHistoryRecords = [];
    let currentHistoryPage = 1;
    const HISTORY_PAGE_SIZE = 20;

    // Global state for history viewer V2 (COMPLETELY SEPARATE)
    let uploadHistoryRecordsV2 = [];
    let filteredHistoryRecordsV2 = [];
    let currentHistoryPageV2 = 1;
    const HISTORY_PAGE_SIZE_V2 = 20;

    /**
     * Open Upload History Modal
     */
    window.openUploadHistoryModal = async function () {
        console.log('[HISTORY] 📜 Opening upload history modal...');

        try {
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('uploadHistoryModal'));
            modal.show();

            // Show loading state
            const container = document.getElementById('historyListContainer');
            container.innerHTML = `
                <div class="history-loading">
                    <div class="spinner-border text-info" role="status">
                        <span class="visibly-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-3">Đang tải lịch sử upload...</p>
                </div>
            `;

            // Load history from Firebase
            await loadUploadHistory();

            // Render history list
            renderUploadHistoryList();

        } catch (error) {
            console.error('[HISTORY] ❌ Error opening history modal:', error);
            showNotification('❌ Lỗi khi tải lịch sử upload', 'error');

            const container = document.getElementById('historyListContainer');
            container.innerHTML = `
                <div class="history-empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Lỗi khi tải lịch sử upload</p>
                    <p class="small text-danger">${error.message}</p>
                    <button class="btn btn-sm btn-primary mt-2" onclick="openUploadHistoryModal()">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    };

    /**
     * Load upload history from Firebase
     * Only loads summary fields for performance
     */
    async function loadUploadHistory() {
        try {
            console.log('[HISTORY] 📥 Loading history from Firebase...');

            // Query Firebase - orderByChild timestamp, limit to last 100 records
            const historyPath = userStorageManager ? userStorageManager.getUserFirebasePath('productAssignments_history') : 'productAssignments_history/guest';
            console.log('[HISTORY] Loading from path:', historyPath);
            const snapshot = await database.ref(historyPath)
                .orderByChild('timestamp')
                .limitToLast(100)
                .once('value');

            const data = snapshot.val();

            if (!data) {
                console.log('[HISTORY] ℹ️ No history records found');
                uploadHistoryRecords = [];
                filteredHistoryRecords = [];
                return;
            }

            // Convert to array and extract ONLY summary fields (not beforeSnapshot/afterSnapshot)
            uploadHistoryRecords = Object.keys(data).map(key => {
                const record = data[key];
                return {
                    uploadId: record.uploadId || key,
                    timestamp: record.timestamp || 0,
                    uploadStatus: record.uploadStatus || 'unknown',
                    totalSTTs: record.totalSTTs || 0,
                    successCount: record.successCount || 0,
                    failCount: record.failCount || 0,
                    uploadedSTTs: record.uploadedSTTs || [],
                    note: record.note || '',
                    committedAt: record.committedAt || null,
                    restoredAt: record.restoredAt || null
                    // DO NOT load beforeSnapshot/afterSnapshot here (lazy load when needed)
                };
            });

            // Sort by timestamp descending (newest first)
            uploadHistoryRecords.sort((a, b) => b.timestamp - a.timestamp);

            // Initialize filtered records (no filter yet)
            filteredHistoryRecords = [...uploadHistoryRecords];

            console.log(`[HISTORY] ✅ Loaded ${uploadHistoryRecords.length} history records`);

        } catch (error) {
            console.error('[HISTORY] ❌ Error loading history:', error);
            throw error;
        }
    }

    /**
     * Filter upload history based on user input
     */
    window.filterUploadHistory = function () {
        const status = document.getElementById('historyStatusFilter').value;
        const dateFrom = document.getElementById('historyDateFrom').value;
        const dateTo = document.getElementById('historyDateTo').value;
        const searchSTT = document.getElementById('historySearchSTT').value.trim();

        console.log('[HISTORY] 🔍 Filtering history:', { status, dateFrom, dateTo, searchSTT });

        // Start with all records
        filteredHistoryRecords = [...uploadHistoryRecords];

        // Filter by status
        if (status && status !== 'all') {
            filteredHistoryRecords = filteredHistoryRecords.filter(record => record.uploadStatus === status);
        }

        // Filter by date range
        if (dateFrom) {
            const fromTimestamp = new Date(dateFrom).getTime();
            filteredHistoryRecords = filteredHistoryRecords.filter(record => record.timestamp >= fromTimestamp);
        }

        if (dateTo) {
            const toTimestamp = new Date(dateTo).setHours(23, 59, 59, 999); // End of day
            filteredHistoryRecords = filteredHistoryRecords.filter(record => record.timestamp <= toTimestamp);
        }

        // Filter by STT search
        if (searchSTT) {
            filteredHistoryRecords = filteredHistoryRecords.filter(record => {
                return record.uploadedSTTs.some(stt => stt.toString().includes(searchSTT));
            });
        }

        // Reset to page 1
        currentHistoryPage = 1;

        // Re-render list
        renderUploadHistoryList();

        console.log(`[HISTORY] ✅ Filtered to ${filteredHistoryRecords.length} records`);
    };

    /**
     * Render upload history list with pagination
     */
    function renderUploadHistoryList() {
        const container = document.getElementById('historyListContainer');

        // Empty state
        if (filteredHistoryRecords.length === 0) {
            container.innerHTML = `
                <div class="history-empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Không tìm thấy lịch sử upload nào</p>
                    <p class="small">Lịch sử sẽ được lưu tự động sau mỗi lần upload</p>
                </div>
            `;
            document.getElementById('historyPagination').innerHTML = '';
            return;
        }

        // Calculate pagination
        const totalPages = Math.ceil(filteredHistoryRecords.length / HISTORY_PAGE_SIZE);
        const startIndex = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE;
        const endIndex = Math.min(startIndex + HISTORY_PAGE_SIZE, filteredHistoryRecords.length);
        const pageRecords = filteredHistoryRecords.slice(startIndex, endIndex);

        // Render history cards
        container.innerHTML = pageRecords.map(record => formatHistoryCard(record)).join('');

        // Render pagination
        renderHistoryPagination(totalPages);
    }

    /**
     * Format a single history card HTML
     */
    function formatHistoryCard(record) {
        // Status config
        const statusConfig = {
            'completed': { icon: '✅', text: 'Thành công', class: 'completed' },
            'partial': { icon: '⚠️', text: 'Thành công một phần', class: 'partial' },
            'failed': { icon: '❌', text: 'Thất bại', class: 'failed' },
            'deletion_failed': { icon: '⚠️', text: 'Upload OK - Xóa failed', class: 'deletion_failed' }
        };

        const config = statusConfig[record.uploadStatus] || { icon: '❓', text: 'Unknown', class: 'unknown' };

        // Format date
        const date = new Date(record.timestamp);
        const dateStr = date.toLocaleString('vi-VN');

        // Format uploadId (show last 8 chars)
        const shortId = record.uploadId.slice(-8);

        // Format STTs list (limit to first 20, then "...")
        const sttList = record.uploadedSTTs.slice(0, 20).join(', ');
        const moreStt = record.uploadedSTTs.length > 20 ? ` và ${record.uploadedSTTs.length - 20} STT khác` : '';

        return `
            <div class="history-card ${config.class}">
                <div class="history-card-header">
                    <div>
                        <h6 class="history-card-title">
                            ${config.icon} Upload #${shortId}
                            <span class="history-card-date">${dateStr}</span>
                        </h6>
                    </div>
                    <span class="history-status-badge ${config.class}">${config.text}</span>
                </div>

                <div class="history-stats">
                    <div class="history-stat-item history-stat-success">
                        <i class="fas fa-check-circle"></i>
                        <span><strong>${record.successCount}</strong> thành công</span>
                    </div>
                    <div class="history-stat-item history-stat-failed">
                        <i class="fas fa-times-circle"></i>
                        <span><strong>${record.failCount}</strong> thất bại</span>
                    </div>
                    <div class="history-stat-item history-stat-total">
                        <i class="fas fa-list"></i>
                        <span><strong>${record.totalSTTs}</strong> tổng STT</span>
                    </div>
                </div>

                <div class="history-stts">
                    <strong>STT:</strong> ${sttList}${moreStt}
                </div>

                <div class="history-actions">
                    <button class="btn btn-sm btn-info" onclick="compareCartHistory('${record.uploadId}')">
                        <i class="fas fa-balance-scale"></i> So Sánh Giỏ
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="viewUploadHistoryDetail('${record.uploadId}')">
                        <i class="fas fa-eye"></i> Xem Chi Tiết
                    </button>
                </div>

                ${record.note ? `
                    <div class="history-note">
                        <i class="fas fa-sticky-note"></i>
                        ${window.DecodingUtility ? window.DecodingUtility.formatNoteWithDecodedData(record.note) : record.note}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render pagination controls
     */
    function renderHistoryPagination(totalPages) {
        const pagination = document.getElementById('historyPagination');

        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        let html = '';

        // Previous button
        html += `
            <button class="btn btn-sm btn-outline-secondary"
                    onclick="changeHistoryPage(${currentHistoryPage - 1})"
                    ${currentHistoryPage === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
        `;

        // Page numbers (show max 7 pages)
        const maxPageButtons = 7;
        let startPage = Math.max(1, currentHistoryPage - Math.floor(maxPageButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);

        // Adjust startPage if endPage is at max
        if (endPage - startPage < maxPageButtons - 1) {
            startPage = Math.max(1, endPage - maxPageButtons + 1);
        }

        // First page button
        if (startPage > 1) {
            html += `
                <button class="btn btn-sm btn-outline-secondary" onclick="changeHistoryPage(1)">1</button>
                ${startPage > 2 ? '<span>...</span>' : ''}
            `;
        }

        // Page buttons
        for (let i = startPage; i <= endPage; i++) {
            html += `
                <button class="btn btn-sm ${i === currentHistoryPage ? 'btn-info active' : 'btn-outline-secondary'}"
                        onclick="changeHistoryPage(${i})">
                    ${i}
                </button>
            `;
        }

        // Last page button
        if (endPage < totalPages) {
            html += `
                ${endPage < totalPages - 1 ? '<span>...</span>' : ''}
                <button class="btn btn-sm btn-outline-secondary" onclick="changeHistoryPage(${totalPages})">${totalPages}</button>
            `;
        }

        // Next button
        html += `
            <button class="btn btn-sm btn-outline-secondary"
                    onclick="changeHistoryPage(${currentHistoryPage + 1})"
                    ${currentHistoryPage === totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        pagination.innerHTML = html;
    }

    /**
     * Change history page
     */
    window.changeHistoryPage = function (page) {
        currentHistoryPage = page;
        renderUploadHistoryList();

        // Scroll to top of list
        document.getElementById('historyListContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    /**
     * View upload history detail
     * Lazy load uploadResults from Firebase
     */
    window.viewUploadHistoryDetail = async function (uploadId) {
        console.log('[HISTORY] 👁️ Viewing detail for:', uploadId);

        try {
            // Show detail modal with loading state
            const detailModal = new bootstrap.Modal(document.getElementById('uploadHistoryDetailModal'));
            detailModal.show();

            const titleEl = document.getElementById('historyDetailModalTitle');
            const bodyEl = document.getElementById('historyDetailModalBody');

            titleEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';
            bodyEl.innerHTML = `
                <div class="history-loading">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visibly-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-3">Đang tải chi tiết upload...</p>
                </div>
            `;

            // Load full record from Firebase (with uploadResults)
            const historyPath = userStorageManager ? userStorageManager.getUserFirebasePath('productAssignments_history') : 'productAssignments_history/guest';
            const snapshot = await database.ref(`${historyPath}/${uploadId}`).once('value');
            const record = snapshot.val();

            if (!record) {
                throw new Error('Không tìm thấy record');
            }

            // Update title
            const shortId = uploadId.slice(-8);
            const date = new Date(record.timestamp).toLocaleString('vi-VN');
            titleEl.innerHTML = `<i class="fas fa-info-circle"></i> Chi Tiết Upload #${shortId}`;

            // Render detail content
            bodyEl.innerHTML = renderUploadHistoryDetail(record);

        } catch (error) {
            console.error('[HISTORY] ❌ Error viewing detail:', error);
            showNotification('❌ Lỗi khi tải chi tiết upload', 'error');

            const bodyEl = document.getElementById('historyDetailModalBody');
            bodyEl.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    Lỗi: ${error.message}
                </div>
            `;
        }
    };

    /**
     * Render upload history detail HTML
     * Shows detailed breakdown of each order (STT) with products uploaded
     */
    function renderUploadHistoryDetail(record) {
        // Status config
        const statusConfig = {
            'completed': { icon: '✅', text: 'Thành công hoàn toàn', class: 'success' },
            'partial': { icon: '⚠️', text: 'Thành công một phần', class: 'warning' },
            'failed': { icon: '❌', text: 'Thất bại hoàn toàn', class: 'danger' },
            'deletion_failed': { icon: '⚠️', text: 'Upload OK - Không xóa được', class: 'warning' }
        };

        const config = statusConfig[record.uploadStatus] || { icon: '❓', text: 'Unknown', class: 'secondary' };

        // Format date
        const date = new Date(record.timestamp).toLocaleString('vi-VN');

        // Build info section
        let html = `
            <div class="history-detail-info mb-4">
                <div class="row">
                    <div class="col-md-6">
                        <span class="history-detail-label">Upload ID:</span>
                        <span class="history-detail-value">${record.uploadId}</span>
                    </div>
                    <div class="col-md-6">
                        <span class="history-detail-label">Thời gian:</span>
                        <span class="history-detail-value">${date}</span>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <span class="history-detail-label">Trạng thái:</span>
                        <span class="history-detail-value">
                            <span class="badge bg-${config.class}">${config.icon} ${config.text}</span>
                        </span>
                    </div>
                    <div class="col-md-6">
                        <span class="history-detail-label">Tổng STT:</span>
                        <span class="history-detail-value">
                            <strong>${record.totalSTTs}</strong>
                            (✅ ${record.successCount} | ❌ ${record.failCount})
                        </span>
                    </div>
                </div>
            </div>
        `;

        // Group products by STT from beforeSnapshot.assignments
        const productsBySTT = {};

        if (record.beforeSnapshot && record.beforeSnapshot.assignments) {
            record.beforeSnapshot.assignments.forEach(assignment => {
                assignment.sttList.forEach(stt => {
                    if (!productsBySTT[stt]) {
                        productsBySTT[stt] = [];
                    }
                    productsBySTT[stt].push({
                        productId: assignment.productId,
                        productCode: assignment.productCode,
                        productName: assignment.productName,
                        imageUrl: assignment.imageUrl,
                        note: assignment.note || '',
                        sessionIndexes: assignment.sttList // Array of all STTs for this product
                    });
                });
            });
        }

        // Create upload results map for quick lookup
        const uploadResultsMap = {};
        if (record.uploadResults) {
            record.uploadResults.forEach(result => {
                uploadResultsMap[result.stt] = result;
            });
        }

        // Render each STT as a card (similar to preview modal)
        html += '<h6 class="mb-3"><i class="fas fa-shopping-cart"></i> Chi Tiết Từng Giỏ Hàng</h6>';

        const sortedSTTs = Object.keys(productsBySTT).sort((a, b) => Number(a) - Number(b));

        if (sortedSTTs.length === 0) {
            html += `
                <div class="alert alert-warning" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    Không có dữ liệu products trong beforeSnapshot
                </div>
            `;
        } else {
            sortedSTTs.forEach(stt => {
                const products = productsBySTT[stt];
                const uploadResult = uploadResultsMap[stt];

                // Determine card border color based on result
                let cardClass = 'border-secondary';
                let headerClass = 'bg-secondary';
                let resultBadge = '';

                if (uploadResult) {
                    if (uploadResult.success) {
                        cardClass = 'border-success';
                        headerClass = 'bg-success';
                        resultBadge = `<span class="badge bg-success ms-2">✅ Upload thành công → Order #${uploadResult.orderId}</span>`;
                    } else {
                        cardClass = 'border-danger';
                        headerClass = 'bg-danger';
                        resultBadge = `<span class="badge bg-danger ms-2">❌ Upload thất bại</span>`;
                    }
                }

                // Count products
                const productCounts = {};
                products.forEach(product => {
                    const key = product.productId;
                    if (!productCounts[key]) {
                        productCounts[key] = { ...product, count: 0 };
                    }
                    productCounts[key].count++;
                });

                html += `
                    <div class="card mb-3 ${cardClass}">
                        <div class="card-header ${headerClass} text-white">
                            <h6 class="mb-0">
                                <i class="fas fa-hashtag"></i> STT ${stt}
                                ${resultBadge}
                            </h6>
                        </div>
                        <div class="card-body">
                            <h6 class="text-primary mb-3">
                                <i class="fas fa-box"></i> Sản phẩm đã upload (${Object.keys(productCounts).length})
                            </h6>
                            <table class="table table-sm table-bordered">
                                <thead class="table-light">
                                    <tr>
                                        <th style="width: 40%;">Sản phẩm</th>
                                        <th class="text-center" style="width: 12%;">Số lượng</th>
                                        <th class="text-center" style="width: 25%;">Mã đơn hàng</th>
                                        <th style="width: 23%;">Note</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${Object.values(productCounts).map(product => `
                                        <tr>
                                            <td>
                                                <div class="d-flex align-items-center gap-2">
                                                    ${product.imageUrl
                        ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">`
                        : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 20px;">📦</div>'}
                                                    <div>
                                                        <div style="font-weight: 600; font-size: 14px;">${product.productName}</div>
                                                        <div style="font-size: 12px; color: #6b7280;">${product.productCode || 'N/A'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td class="text-center">
                                                <span class="badge bg-primary">${product.count}</span>
                                            </td>
                                            <td class="text-center">
                                                <span class="text-muted" style="font-size: 13px;">
                                                    ${(product.sessionIndexes || []).map(item => typeof item === 'object' ? item.stt : item).join(', ') || 'N/A'}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="text-muted" style="font-size: 13px;">${product.note || '(Không có ghi chú)'}</span>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>

                            ${uploadResult && !uploadResult.success && uploadResult.error ? `
                                <div class="alert alert-danger mt-3 mb-0" role="alert">
                                    <strong><i class="fas fa-exclamation-circle"></i> Lỗi:</strong> ${uploadResult.error}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
        }

        // Note section
        if (record.note) {
            html += `
                <div class="history-note mt-3">
                    <i class="fas fa-sticky-note"></i>
                    <strong>Ghi chú:</strong> ${window.DecodingUtility ? window.DecodingUtility.formatNoteWithDecodedData(record.note) : record.note}
                </div>
            `;
        }

        return html;
    }

    // =====================================================
    // COMPARE CART HISTORY - Show comparison modal
    // =====================================================

    /**
     * Compare Cart History - Show preview comparison modal
     * Similar to previewModal but for history records
     */
    window.compareCartHistory = async function (uploadId) {
        console.log('[HISTORY-COMPARE] 🔍 Comparing cart for uploadId:', uploadId);

        try {
            // Show comparison modal with loading state
            const compareModal = new bootstrap.Modal(document.getElementById('compareCartHistoryModal'));
            compareModal.show();

            const modalBody = document.getElementById('compareCartHistoryModalBody');
            modalBody.innerHTML = `
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-2">Đang tải dữ liệu so sánh...</p>
                </div>
            `;

            // Load full record from Firebase (with beforeSnapshot)
            const historyPath = userStorageManager ? userStorageManager.getUserFirebasePath('productAssignments_history') : 'productAssignments_history/guest';
            const snapshot = await database.ref(`${historyPath}/${uploadId}`).once('value');
            const record = snapshot.val();

            if (!record || !record.beforeSnapshot) {
                throw new Error('Không tìm thấy dữ liệu snapshot');
            }

            console.log('[HISTORY-COMPARE] ✅ Loaded record:', record);

            // Render comparison content (similar to renderPreviewModal)
            modalBody.innerHTML = renderComparisonContent(record);

        } catch (error) {
            console.error('[HISTORY-COMPARE] ❌ Error:', error);
            showNotification('❌ Lỗi khi tải dữ liệu so sánh', 'error');

            const modalBody = document.getElementById('compareCartHistoryModalBody');
            modalBody.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Lỗi:</strong> ${error.message}
                </div>
            `;
        }
    };

    /**
     * Render comparison content for history record
     * Format: Same as previewModal (2 columns: assigned products vs existing products)
     */
    function renderComparisonContent(record) {
        const beforeSnapshot = record.beforeSnapshot;
        const uploadResults = record.uploadResults || [];

        // Create map of upload results by STT for quick lookup
        const uploadResultsMap = {};
        uploadResults.forEach(result => {
            uploadResultsMap[result.stt] = result;
        });

        // Group products by STT from beforeSnapshot.assignments
        const productsBySTT = {};

        if (beforeSnapshot && beforeSnapshot.assignments) {
            beforeSnapshot.assignments.forEach(assignment => {
                if (!assignment.sttList || !Array.isArray(assignment.sttList)) return;

                assignment.sttList.forEach(sttItem => {
                    const stt = typeof sttItem === 'object' ? sttItem.stt : sttItem;

                    if (!productsBySTT[stt]) {
                        productsBySTT[stt] = {
                            assignedProducts: [],
                            orderInfo: typeof sttItem === 'object' ? sttItem.orderInfo : null
                        };
                    }

                    productsBySTT[stt].assignedProducts.push({
                        productId: assignment.productId,
                        productName: assignment.productName,
                        productCode: assignment.productCode,
                        imageUrl: assignment.imageUrl,
                        note: assignment.note || ''
                    });
                });
            });
        }

        // Render HTML for each STT
        let html = '';
        const sortedSTTs = Object.keys(productsBySTT).sort((a, b) => Number(a) - Number(b));

        sortedSTTs.forEach(stt => {
            const data = productsBySTT[stt];
            const uploadResult = uploadResultsMap[stt];

            // Count assigned products
            const assignedProductCounts = {};
            data.assignedProducts.forEach(product => {
                const key = product.productId;
                if (!assignedProductCounts[key]) {
                    assignedProductCounts[key] = { ...product, count: 0 };
                }
                assignedProductCounts[key].count++;
            });

            // Get existing products from upload result (if available)
            const existingProducts = uploadResult?.existingProducts || [];

            // Create map of existing products for highlighting
            const existingProductsMap = {};
            existingProducts.forEach(product => {
                if (product.productId) {
                    existingProductsMap[product.productId] = product;
                }
            });

            // Mark assigned products as new or existing
            Object.values(assignedProductCounts).forEach(product => {
                product.isExisting = !!existingProductsMap[product.productId];
            });

            // Card header with status badge
            let statusBadge = '';
            let cardClass = '';
            if (uploadResult) {
                if (uploadResult.success) {
                    statusBadge = `<span class="badge bg-success ms-2">✅ Upload thành công</span>`;
                    cardClass = 'border-success';
                } else {
                    statusBadge = `<span class="badge bg-danger ms-2">❌ Upload thất bại</span>`;
                    cardClass = 'border-danger';
                }
            }

            html += `
                <div class="card mb-4 ${cardClass}">
                    <div class="card-header bg-primary text-white">
                        <h5 class="mb-0">
                            <i class="fas fa-hashtag"></i> STT ${stt}
                            ${data.orderInfo?.customerName ? `- ${data.orderInfo.customerName}` : ''}
                            ${data.orderInfo?.note ? `<small class="ms-2">(${data.orderInfo.note})</small>` : ''}
                            ${statusBadge}
                        </h5>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <!-- Assigned Products (LEFT COLUMN) -->
                            <div class="col-md-6">
                                <h6 class="text-success">
                                    <i class="fas fa-plus-circle"></i> Sản phẩm đã upload (${Object.keys(assignedProductCounts).length})
                                </h6>
                                <table class="table table-sm table-bordered">
                                    <thead class="table-light">
                                        <tr>
                                            <th>Sản phẩm</th>
                                            <th class="text-center">SL</th>
                                            <th>Note</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${Object.values(assignedProductCounts).map(product => {
                const statusBadge = product.isExisting
                    ? '<span class="badge bg-warning text-dark ms-2" title="Sản phẩm đã có trong đơn, đã cộng thêm số lượng"><i class="fas fa-plus"></i> Cộng SL</span>'
                    : '<span class="badge bg-success ms-2" title="Sản phẩm mới đã được thêm vào đơn"><i class="fas fa-star"></i> Mới</span>';

                return `
                                            <tr class="${product.isExisting ? 'table-warning' : 'table-success'}">
                                                <td>
                                                    <div class="d-flex align-items-center gap-2">
                                                        ${product.imageUrl
                        ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">`
                        : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                        <div style="flex: 1;">
                                                            <div style="font-weight: 600; font-size: 14px;">${product.productName}</div>
                                                            <div style="font-size: 12px; color: #6b7280;">
                                                                ${product.productCode || 'N/A'}
                                                                ${statusBadge}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td class="text-center">
                                                    <span class="badge ${product.isExisting ? 'bg-warning text-dark' : 'bg-success'}">${product.count}</span>
                                                </td>
                                                <td>
                                                    <span class="text-muted" style="font-size: 13px;">${product.note || '(Không có)'}</span>
                                                </td>
                                            </tr>
                                        `}).join('')}
                                    </tbody>
                                </table>
                            </div>

                            <!-- Existing Products (RIGHT COLUMN) -->
                            <div class="col-md-6">
                                <h6 class="text-info">
                                    <i class="fas fa-box"></i> Sản phẩm có sẵn trong đơn (${existingProducts.length})
                                </h6>
                                ${existingProducts.length > 0 ? `
                                    <table class="table table-sm table-bordered">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Sản phẩm</th>
                                                <th class="text-center">SL</th>
                                                <th class="text-end">Giá</th>
                                                <th>Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${existingProducts.map(product => {
                            // Check if this product will be updated (exists in assigned products)
                            const willBeUpdated = !!assignedProductCounts[product.productId];
                            const updateBadge = willBeUpdated
                                ? '<span class="badge bg-warning text-dark ms-1" title="Sản phẩm này đã được cộng thêm số lượng"><i class="fas fa-arrow-up"></i></span>'
                                : '';

                            return `
                                                <tr class="${willBeUpdated ? 'table-warning' : ''}">
                                                    <td>
                                                        <div class="d-flex align-items-center gap-2">
                                                            ${product.imageUrl
                                    ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">`
                                    : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                            <div style="flex: 1;">
                                                                <div style="font-weight: 600; font-size: 14px;">${product.nameGet || product.name || 'N/A'}</div>
                                                                <div style="font-size: 12px; color: #6b7280;">${product.code || 'N/A'}${updateBadge}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td class="text-center">
                                                        <span class="badge bg-info">${product.quantity}</span>
                                                    </td>
                                                    <td class="text-end">
                                                        <span style="font-weight: 600; color: #3b82f6;">${(product.price || 0).toLocaleString('vi-VN')}đ</span>
                                                    </td>
                                                    <td>
                                                        <span class="text-muted" style="font-size: 13px;">${product.note || '(Không có)'}</span>
                                                    </td>
                                                </tr>
                                            `}).join('')}
                                        </tbody>
                                    </table>
                                ` : `
                                    <div class="text-center text-muted py-3 border rounded">
                                        <i class="fas fa-inbox fa-2x mb-2"></i>
                                        <p class="mb-0">Không có sản phẩm có sẵn</p>
                                        <small>(Tất cả sản phẩm đều là mới)</small>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        if (sortedSTTs.length === 0) {
            html = `
                <div class="alert alert-warning" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Không có dữ liệu để hiển thị</strong>
                    <p class="mb-0 mt-2">Bản ghi lịch sử này không chứa thông tin sản phẩm.</p>
                </div>
            `;
        }

        return html;
    }

    // =====================================================
    // UPLOAD SECTION - NEW FEATURE (INDEPENDENT FROM TAB 2)
    // =====================================================

    // Upload state
    let uploadData = {};
    let selectedSTTs = new Set();
    let currentViewMode = 'product'; // 'order' or 'product'

    /**
     * Build upload data from assignments
     * Group by STT (SessionIndex)
     */
    function buildUploadData() {
        const data = {};

        assignments.forEach(assignment => {
            if (!assignment.sttList || assignment.sttList.length === 0) return;

            assignment.sttList.forEach(sttItem => {
                const stt = typeof sttItem === 'object' ? sttItem.stt : sttItem;
                const orderInfo = typeof sttItem === 'object' ? sttItem.orderInfo : null;

                if (!data[stt]) {
                    data[stt] = {
                        stt: stt,
                        orderInfo: orderInfo,
                        products: []
                    };
                }

                // Count duplicates (if same product assigned multiple times to same STT)
                const existingProduct = data[stt].products.find(p => p.productId === assignment.productId);
                if (existingProduct) {
                    existingProduct.quantity++;
                } else {
                    data[stt].products.push({
                        productId: assignment.productId,
                        productName: assignment.productName,
                        productCode: assignment.productCode,
                        imageUrl: assignment.imageUrl,
                        quantity: 1
                    });
                }
            });
        });

        return data;
    }

    /**
     * Render upload table based on view mode
     */
    function renderUploadTable() {
        uploadData = buildUploadData();

        if (currentViewMode === 'order') {
            renderByOrderView();
        } else {
            renderByProductView();
        }

        updateUploadStats();
        updateUploadButtons();
    }

    /**
     * Render "By Order" view (group by STT)
     */
    function renderByOrderView() {
        const thead = document.getElementById('uploadTableHead');
        const tbody = document.getElementById('uploadTableBody');

        thead.innerHTML = `
            <tr>
                <th class="checkbox-cell"><input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll()"></th>
                <th>STT</th>
                <th>Khách hàng</th>
                <th>Sản phẩm</th>
                <th>Số lượng</th>
            </tr>
        `;

        const sttKeys = Object.keys(uploadData).sort((a, b) => Number(a) - Number(b));

        if (sttKeys.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted py-5">
                        <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                        Chưa có sản phẩm nào để upload. Hãy gán sản phẩm ở bảng trên.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = sttKeys.map(stt => {
            const data = uploadData[stt];
            const isSelected = selectedSTTs.has(stt);
            const customerName = data.orderInfo?.customerName || 'N/A';
            const totalQuantity = data.products.reduce((sum, p) => sum + p.quantity, 0);

            const productsList = data.products.map(p => `${p.productName} (x${p.quantity})`).join(', ');

            return `
                <tr class="${isSelected ? 'table-success' : ''}">
                    <td class="checkbox-cell">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSTTSelection('${stt}')">
                    </td>
                    <td><span class="stt-badge">${stt}</span></td>
                    <td>${customerName}</td>
                    <td><small>${productsList}</small></td>
                    <td><span class="product-count-badge"><i class="fas fa-box"></i> ${totalQuantity}</span></td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Render "By Product" view (group by product code)
     */
    function renderByProductView() {
        const thead = document.getElementById('uploadTableHead');
        const tbody = document.getElementById('uploadTableBody');

        thead.innerHTML = `
            <tr>
                <th class="checkbox-cell"><input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll()"></th>
                <th>Sản phẩm</th>
                <th>Mã SP</th>
                <th>STT Đơn Hàng</th>
                <th>Tổng SL</th>
            </tr>
        `;

        // Group by product
        const byProduct = {};
        Object.entries(uploadData).forEach(([stt, data]) => {
            data.products.forEach(product => {
                const key = product.productId;
                if (!byProduct[key]) {
                    byProduct[key] = {
                        ...product,
                        stts: [],
                        totalQuantity: 0
                    };
                }
                byProduct[key].stts.push(stt);
                byProduct[key].totalQuantity += product.quantity;
            });
        });

        const products = Object.values(byProduct);

        if (products.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted py-5">
                        <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                        Chưa có sản phẩm nào để upload. Hãy gán sản phẩm ở bảng trên.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = products.map(product => {
            // Check if all STTs of this product are selected
            const allSelected = product.stts.every(stt => selectedSTTs.has(stt));
            const someSelected = product.stts.some(stt => selectedSTTs.has(stt));
            const isIndeterminate = someSelected && !allSelected;

            const imageHtml = product.imageUrl
                ? `<img src="${product.imageUrl}" class="upload-product-image">`
                : `<div class="upload-product-image no-image">📦</div>`;

            return `
                <tr class="${allSelected ? 'table-success' : ''}">
                    <td class="checkbox-cell">
                        <input type="checkbox" ${allSelected ? 'checked' : ''} ${isIndeterminate ? 'indeterminate' : ''}
                               onchange="toggleProductSelection('${product.productId}')">
                    </td>
                    <td>
                        <div class="upload-product-cell">
                            ${imageHtml}
                            <div>
                                <div class="upload-product-name">${product.productName}</div>
                                <div class="upload-product-code">${product.productCode || 'N/A'}</div>
                            </div>
                        </div>
                    </td>
                    <td>${product.productCode || 'N/A'}</td>
                    <td><small>${product.stts.join(', ')}</small></td>
                    <td><span class="product-count-badge"><i class="fas fa-box"></i> ${product.totalQuantity}</span></td>
                </tr>
            `;
        }).join('');

        // Set indeterminate state after render
        setTimeout(() => {
            products.forEach(product => {
                const allSelected = product.stts.every(stt => selectedSTTs.has(stt));
                const someSelected = product.stts.some(stt => selectedSTTs.has(stt));
                if (someSelected && !allSelected) {
                    const checkbox = document.querySelector(`input[onchange*="toggleProductSelection('${product.productId}')"]`);
                    if (checkbox) checkbox.indeterminate = true;
                }
            });
        }, 0);
    }

    /**
     * Update upload stats display
     */
    function updateUploadStats() {
        const totalSTTs = Object.keys(uploadData).length;
        let totalProducts = 0;
        let totalItems = 0;

        Object.values(uploadData).forEach(data => {
            totalProducts += data.products.length;
            totalItems += data.products.reduce((sum, p) => sum + p.quantity, 0);
        });

        document.getElementById('totalOrders').textContent = totalSTTs;
        document.getElementById('totalProducts').textContent = totalProducts;
        document.getElementById('selectedCount').textContent = selectedSTTs.size;
        document.getElementById('totalItems').textContent = totalItems;
    }

    /**
     * Update upload buttons enabled/disabled state
     */
    function updateUploadButtons() {
        const hasSelection = selectedSTTs.size > 0;
        document.getElementById('previewUploadBtn').disabled = !hasSelection;
    }

    /**
     * Switch view mode (order/product)
     */
    window.switchViewMode = function (mode) {
        currentViewMode = mode;

        // Update button states
        document.getElementById('viewByOrderBtn').classList.toggle('active', mode === 'order');
        document.getElementById('viewByProductBtn').classList.toggle('active', mode === 'product');

        renderUploadTable();
    };

    /**
     * Toggle select all
     */
    window.toggleSelectAll = function () {
        const checkbox = document.getElementById('selectAllCheckbox');
        const allSTTs = Object.keys(uploadData);

        if (checkbox.checked) {
            allSTTs.forEach(stt => selectedSTTs.add(stt));
        } else {
            selectedSTTs.clear();
        }

        renderUploadTable();
    };

    /**
     * Select all upload
     */
    window.selectAllUpload = function () {
        const allSTTs = Object.keys(uploadData);
        allSTTs.forEach(stt => selectedSTTs.add(stt));
        renderUploadTable();
    };

    /**
     * Deselect all upload
     */
    window.deselectAllUpload = function () {
        selectedSTTs.clear();
        renderUploadTable();
    };

    /**
     * Toggle STT selection (for order view)
     */
    window.toggleSTTSelection = function (stt) {
        if (selectedSTTs.has(stt)) {
            selectedSTTs.delete(stt);
        } else {
            selectedSTTs.add(stt);
        }
        renderUploadTable();
    };

    /**
     * Toggle product selection (for product view)
     */
    window.toggleProductSelection = function (productId) {
        // Find all STTs that contain this product
        const sttsWithProduct = [];
        Object.entries(uploadData).forEach(([stt, data]) => {
            if (data.products.some(p => p.productId === productId)) {
                sttsWithProduct.push(stt);
            }
        });

        // Check if all are selected
        const allSelected = sttsWithProduct.every(stt => selectedSTTs.has(stt));

        // Toggle all
        if (allSelected) {
            sttsWithProduct.forEach(stt => selectedSTTs.delete(stt));
        } else {
            sttsWithProduct.forEach(stt => selectedSTTs.add(stt));
        }

        renderUploadTable();
    };

    /**
     * View STT detail
     */
    window.viewSTTDetail = function (stt) {
        const data = uploadData[stt];
        if (!data) return;

        const productsHtml = data.products.map(p => {
            const imageHtml = p.imageUrl
                ? `<img src="${p.imageUrl}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px;">`
                : '<div style="width: 50px; height: 50px; background: #e5e7eb; border-radius: 6px; display: flex; align-items: center; justify-content: center;">📦</div>';

            return `
                <div class="d-flex align-items-center gap-3 mb-2 p-2 border-bottom">
                    ${imageHtml}
                    <div class="flex-grow-1">
                        <div class="fw-bold">${p.productName}</div>
                        <div class="small text-muted">${p.productCode || 'N/A'}</div>
                    </div>
                    <div class="text-end">
                        <span class="badge bg-success">x${p.quantity}</span>
                    </div>
                </div>
            `;
        }).join('');

        alert(`STT ${stt}\nKhách hàng: ${data.orderInfo?.customerName || 'N/A'}\n\nSản phẩm:\n${data.products.map(p => `- ${p.productName} (x${p.quantity})`).join('\n')}`);
    };

    /**
     * View product STTs
     */
    window.viewProductSTTs = function (productId) {
        const stts = [];
        Object.entries(uploadData).forEach(([stt, data]) => {
            if (data.products.some(p => p.productId === productId)) {
                stts.push(stt);
            }
        });

        alert(`Sản phẩm này có trong các STT:\n${stts.join(', ')}`);
    };

    /**
     * Re-render upload table when assignments change
     * Call this function after any assignment update
     */
    function refreshUploadSection() {
        renderUploadTable();
    }

    // Hook into existing renderAssignmentTable to refresh upload section
    const originalRenderAssignmentTable = renderAssignmentTable;
    renderAssignmentTable = function () {
        originalRenderAssignmentTable();
        refreshUploadSection();
    };

    // Initialize upload section on load
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            refreshUploadSection();
        }, 1000);
    });

    // =====================================================
    // PREVIEW & UPLOAD FUNCTIONS
    // =====================================================

    /**
     * Preview upload - Show modal with comparison
     */
    window.previewUpload = async function () {
        if (selectedSTTs.size === 0) {
            showNotification('Vui lòng chọn ít nhất 1 STT để upload', 'error');
            return;
        }

        console.log('[PREVIEW] Opening preview modal for', selectedSTTs.size, 'STTs');

        const modal = new bootstrap.Modal(document.getElementById('previewModal'));
        modal.show();

        const modalBody = document.getElementById('previewModalBody');
        modalBody.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-info"></div><p class="text-muted mt-2">Đang tải preview...</p></div>';

        try {
            const html = await renderPreviewContent(Array.from(selectedSTTs));
            modalBody.innerHTML = html;
        } catch (error) {
            console.error('[PREVIEW] Error:', error);
            modalBody.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle"></i> Lỗi: ${error.message}</div>`;
        }
    };

    /**
     * Update Product Note (giống tab2)
     */
    window.updateProductNote = function (noteKey, value) {
        productNotes[noteKey] = value;
        console.log(`📝 Updated note for ${noteKey}:`, value);
    };

    async function renderPreviewContent(stts) {
        // =====================================================
        // STEP 1: Fetch all existing products for all STTs
        // =====================================================
        const sttProductsData = {};
        for (const stt of stts) {
            const data = uploadData[stt];
            if (!data) continue;

            let existingProducts = [];
            if (data.orderInfo?.orderId) {
                try {
                    existingProducts = await fetchExistingOrderProducts(data.orderInfo.orderId);
                } catch (error) {
                    console.warn(`Failed to fetch existing products for order ${data.orderInfo.orderId}`);
                }
            }

            sttProductsData[stt] = {
                data: data,
                existingProducts: existingProducts
            };
        }

        // =====================================================
        // STEP 2: Check for STTs with existing products (GIỐNG TAB-UPLOAD-TPOS)
        // =====================================================
        const sttsWithExistingProducts = [];

        Object.keys(sttProductsData).forEach(stt => {
            const { data, existingProducts } = sttProductsData[stt];

            // Create map of existing products
            const existingProductsMap = {};
            existingProducts.forEach(p => {
                if (p.productId) existingProductsMap[p.productId] = p;
            });

            // Check if any assigned products already exist in order
            const existingProductsInOrder = [];
            data.products.forEach(product => {
                if (existingProductsMap[product.productId]) {
                    const existingProduct = existingProductsInOrder.find(p => p.code === product.productCode);
                    if (existingProduct) {
                        existingProduct.quantity += 1;
                    } else {
                        existingProductsInOrder.push({
                            code: product.productCode,
                            quantity: 1,
                            currentQuantity: existingProductsMap[product.productId].quantity
                        });
                    }
                }
            });

            if (existingProductsInOrder.length > 0) {
                sttsWithExistingProducts.push({
                    stt: stt,
                    products: existingProductsInOrder
                });
            }
        });

        // =====================================================
        // STEP 3: Build HTML with warning if needed (GIỐNG TAB-UPLOAD-TPOS)
        // =====================================================
        let html = '';

        // Add warning section if there are STTs with existing products
        if (sttsWithExistingProducts.length > 0) {
            html += `
                <div class="alert alert-warning mb-4" role="alert">
                    <h6 class="alert-heading mb-3">
                        <i class="fas fa-info-circle"></i> Các STT có mã sản phẩm sắp upload đã có sẵn trong đơn hàng
                    </h6>
                    <div class="small">
                        ${sttsWithExistingProducts.map(item => `
                            <div class="mb-2">
                                <strong>STT ${item.stt}:</strong>
                                ${item.products.map(p => `${p.code} +${p.quantity}`).join(', ')}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // =====================================================
        // STEP 4: Render each STT card
        // =====================================================
        for (const stt of stts.sort((a, b) => Number(a) - Number(b))) {
            const sttData = sttProductsData[stt];
            if (!sttData) continue;

            const { data, existingProducts } = sttData;

            const existingProductsMap = {};
            existingProducts.forEach(p => {
                if (p.productId) existingProductsMap[p.productId] = p;
            });

            const productsWithStatus = data.products.map(p => ({
                ...p,
                isExisting: !!existingProductsMap[p.productId]
            }));

            // Store existing notes from fetched products
            existingProducts.forEach(p => {
                const noteKey = `${stt}-${p.productId}`;
                if (p.note && !productNotes[noteKey]) {
                    productNotes[noteKey] = p.note;
                }
            });

            html += `
                <div class="card mb-3">
                    <div class="card-header bg-primary text-white">
                        <h6 class="mb-0"><i class="fas fa-hashtag"></i> STT ${stt} ${data.orderInfo?.customerName ? ` - ${data.orderInfo.customerName}` : ''}</h6>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6 class="text-success"><i class="fas fa-plus-circle"></i> Sản phẩm sẽ upload (${productsWithStatus.length})</h6>
                                <table class="table table-sm table-bordered">
                                    <thead>
                                        <tr>
                                            <th>Sản phẩm</th>
                                            <th class="text-center">SL</th>
                                            <th style="width: 150px;">Note</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${productsWithStatus.map(p => {
                const noteKey = `${stt}-${p.productId}`;
                // Auto-add "live" as default note if no note exists (giống tab2)
                if (!productNotes[noteKey]) {
                    productNotes[noteKey] = 'live';
                }
                const existingNote = filterNonEncodedNotes(productNotes[noteKey] || '');
                return `
                                            <tr class="${p.isExisting ? 'table-warning' : 'table-success'}">
                                                <td>
                                                    <div class="d-flex align-items-center gap-2">
                                                        ${p.imageUrl ? `<img src="${p.imageUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">` : '<div style="width:40px;height:40px;background:#e5e7eb;border-radius:4px;display:flex;align-items:center;justify-content:center;">📦</div>'}
                                                        <div>
                                                            <div style="font-weight:600;">${p.productName}</div>
                                                            <div style="font-size:12px;color:#6b7280;">${p.productCode || 'N/A'} ${p.isExisting ? '<span class="badge bg-warning text-dark ms-2"><i class="fas fa-plus"></i> Cộng SL</span>' : '<span class="badge bg-success ms-2"><i class="fas fa-star"></i> Mới</span>'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td class="text-center"><span class="badge ${p.isExisting ? 'bg-warning text-dark' : 'bg-success'}">${p.quantity}</span></td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        class="form-control form-control-sm"
                                                        placeholder="Ghi chú..."
                                                        value="${existingNote}"
                                                        data-note-key="${noteKey}"
                                                        onchange="updateProductNote('${noteKey}', this.value)"
                                                    />
                                                </td>
                                            </tr>
                                        `}).join('')}
                                    </tbody>
                                </table>
                            </div>
                            <div class="col-md-6">
                                <h6 class="text-info"><i class="fas fa-box"></i> Sản phẩm có sẵn trong đơn (${existingProducts.length})</h6>
                                ${existingProducts.length > 0 ? `
                                    <table class="table table-sm table-bordered">
                                        <thead>
                                            <tr>
                                                <th>Sản phẩm</th>
                                                <th class="text-center">SL</th>
                                                <th class="text-end">Giá</th>
                                                <th style="width: 130px;">Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${existingProducts.map(p => {
                    const willBeUpdated = productsWithStatus.some(ap => ap.productId === p.productId);
                    const noteKey = `${stt}-${p.productId}`;
                    const rawNote = productNotes[noteKey] || p.note || '';
                    const existingNote = filterNonEncodedNotes(rawNote);
                    return `
                                                    <tr class="${willBeUpdated ? 'table-warning' : ''}">
                                                        <td>
                                                            <div class="d-flex align-items-center gap-2">
                                                                ${p.imageUrl ? `<img src="${p.imageUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">` : '<div style="width:40px;height:40px;background:#e5e7eb;border-radius:4px;display:flex;align-items:center;justify-content:center;">📦</div>'}
                                                                <div>
                                                                    <div style="font-weight:600;">${p.nameGet || p.name || 'N/A'}</div>
                                                                    <div style="font-size:12px;color:#6b7280;">${p.code || 'N/A'}${willBeUpdated ? '<span class="badge bg-warning text-dark ms-1"><i class="fas fa-arrow-up"></i></span>' : ''}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td class="text-center"><span class="badge bg-info">${p.quantity}</span></td>
                                                        <td class="text-end">
                                                            <span style="font-weight:600;color:#3b82f6;">${(p.price || 0).toLocaleString('vi-VN')}đ</span>
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="text"
                                                                class="form-control form-control-sm"
                                                                placeholder="Ghi chú..."
                                                                value="${existingNote}"
                                                                data-note-key="${noteKey}"
                                                                onchange="updateProductNote('${noteKey}', this.value)"
                                                            />
                                                        </td>
                                                    </tr>
                                                `;
                }).join('')}
                                        </tbody>
                                    </table>
                                ` : '<div class="text-center text-muted py-3 border rounded"><i class="fas fa-inbox fa-2x mb-2"></i><p class="mb-0">Không có sản phẩm có sẵn</p><small>(Tất cả sản phẩm đều là mới)</small></div>'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        return html || '<div class="alert alert-warning">Không có dữ liệu</div>';
    }

    async function fetchExistingOrderProducts(orderId) {
        try {
            const apiUrl = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product)`;
            const headers = await window.tokenManager.getAuthHeader();

            const response = await fetch(apiUrl, {
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                }
            });

            if (!response.ok) throw new Error('Failed to fetch order');
            const order = await response.json();

            // Parse Details to products
            return (order.Details || []).map(detail => ({
                productId: detail.Product?.Id || detail.ProductId,
                nameGet: detail.Product?.NameGet || detail.ProductName || 'N/A',
                code: detail.Product?.DefaultCode || detail.ProductCode || '',
                quantity: detail.Quantity || 0,
                price: detail.Price || 0,
                imageUrl: detail.Product?.ImageUrl || '',
                note: detail.Note || ''
            }));
        } catch (error) {
            console.error('[FETCH-ORDER] Error:', error);
            return [];
        }
    }

    window.confirmUpload = function () {
        const previewModal = bootstrap.Modal.getInstance(document.getElementById('previewModal'));
        if (previewModal) previewModal.hide();
        uploadToTPOS();
    };

    window.uploadToTPOS = async function () {
        if (selectedSTTs.size === 0) {
            showNotification('Vui lòng chọn ít nhất 1 STT để upload', 'error');
            return;
        }

        if (!confirm(`Bạn có chắc muốn upload ${selectedSTTs.size} STT lên TPOS?`)) return;

        try {
            const uploadId = `upload_${Date.now()}`;
            await createBackupBeforeUpload(uploadId, Array.from(selectedSTTs));

            const results = [];
            for (const stt of Array.from(selectedSTTs).sort((a, b) => Number(a) - Number(b))) {
                const result = await uploadSingleSTT(stt);
                results.push(result);
            }

            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;
            const status = failCount === 0 ? 'completed' : (successCount > 0 ? 'partial' : 'failed');

            await saveToUploadHistory(uploadId, results, status);

            const successfulSTTs = results.filter(r => r.success).map(r => r.stt);
            if (successfulSTTs.length > 0) {
                await removeUploadedSTTsFromAssignments(successfulSTTs);
            }

            selectedSTTs.clear();
            renderUploadTable();

            if (status === 'completed') {
                showNotification(`✅ Upload thành công ${successCount} STT và đã xóa khỏi danh sách gán`);
            } else if (status === 'partial') {
                showNotification(`⚠️ Upload thành công ${successCount} STT, thất bại ${failCount} STT`, 'error');
            } else {
                showNotification(`❌ Upload thất bại ${failCount} STT`, 'error');
            }
        } catch (error) {
            console.error('[UPLOAD] Error:', error);
            showNotification('Lỗi: ' + error.message, 'error');
        }
    };

    async function uploadSingleSTT(stt) {
        try {
            const sessionData = uploadData[stt];
            if (!sessionData) throw new Error('STT data not found');

            const orderId = sessionData.orderInfo?.orderId;
            if (!orderId) throw new Error('No order ID for this STT');

            console.log(`[UPLOAD] 📡 Fetching order ${orderId} for STT ${stt}...`);

            // Fetch current order data with full expand
            const apiUrl = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product),Partner,User,CRMTeam`;
            const headers = await window.tokenManager.getAuthHeader();

            const response = await fetch(apiUrl, {
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch order ${orderId}: ${response.status}`);
            }

            const orderData = await response.json();
            console.log(`[UPLOAD] ✅ Fetched order data for STT ${stt}`);

            // Save existing products BEFORE merging (for history tracking)
            const existingProducts = (orderData.Details || []).map(detail => ({
                productId: detail.Product?.Id || detail.ProductId,
                nameGet: detail.Product?.NameGet || detail.ProductNameGet || detail.ProductName || 'N/A',
                name: detail.Product?.Name || detail.ProductName || 'N/A',
                code: detail.Product?.DefaultCode || detail.ProductCode || '',
                quantity: detail.Quantity || 0,
                price: detail.Price || 0,
                imageUrl: detail.Product?.ImageUrl || detail.ImageUrl || '',
                note: detail.Note || ''
            }));

            // Prepare merged Details
            const mergedDetails = await prepareUploadDetails(orderData, sessionData, stt);
            orderData.Details = mergedDetails;

            // Recalculate totals
            let totalQty = 0;
            let totalAmount = 0;
            orderData.Details.forEach(detail => {
                totalQty += detail.Quantity || 0;
                totalAmount += (detail.Quantity || 0) * (detail.Price || 0);
            });
            orderData.TotalQuantity = totalQty;
            orderData.TotalAmount = totalAmount;

            // =====================================================
            // ENCODE ORDER NOTE WITH PRODUCTS (NEW [""] format)
            // Same logic as tab-upload-tpos.js
            // =====================================================
            // Build products list for encoding into note
            // Get price from mergedDetails for each product
            const productsForNote = [];

            // Create a map from mergedDetails for price lookup
            const priceByProductId = {};
            mergedDetails.forEach(detail => {
                const pid = detail.ProductId || detail.Product?.Id;
                if (pid) {
                    priceByProductId[pid] = detail.Price || 0;
                }
            });

            // Build products list with actual prices
            sessionData.products.forEach(p => {
                const price = priceByProductId[p.productId] || 0;
                productsForNote.push({
                    productCode: p.productCode || p.productName || 'N/A',
                    quantity: p.quantity || 1,
                    price: price
                });
            });

            if (productsForNote.length > 0) {
                console.log(`[UPLOAD] 📝 Encoding ${productsForNote.length} products into order note...`);

                // Get current order note
                const currentNote = orderData.Note || '';

                // Process note: decode existing → add products → encode with [""]
                const encodedNote = processNoteForUpload(currentNote, productsForNote);

                // Update order note
                orderData.Note = encodedNote;
                console.log(`[UPLOAD] ✅ Order note updated with encoded products`);
            }

            // Prepare payload
            const payload = prepareUploadPayload(orderData);

            console.log(`[UPLOAD] 📤 Uploading order ${orderId}...`);

            // PUT request
            const uploadHeaders = await window.tokenManager.getAuthHeader();
            const uploadResponse = await fetch(
                `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order(${orderId})`,
                {
                    method: "PUT",
                    headers: {
                        ...uploadHeaders,
                        "Content-Type": "application/json",
                        Accept: "application/json",
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
            }

            console.log(`[UPLOAD] ✅ Successfully uploaded STT ${stt}`);
            return {
                stt: stt,
                success: true,
                orderId: orderId,
                error: null,
                existingProducts: existingProducts  // Include existing products for history
            };

        } catch (error) {
            console.error(`[UPLOAD] ❌ Error uploading STT ${stt}:`, error);
            return {
                stt: stt,
                success: false,
                orderId: null,
                error: error.message,
                existingProducts: []  // Empty array for failed uploads
            };
        }
    }

    async function prepareUploadDetails(orderData, sessionData, stt) {
        const existingDetails = orderData.Details || [];

        // Create map: productId -> existing detail
        const existingByProductId = {};
        existingDetails.forEach(detail => {
            const pid = detail.Product?.Id || detail.ProductId;
            if (pid) existingByProductId[pid] = detail;
        });

        // Create map: productId -> assigned count from sessionData
        const assignedByProductId = {};
        sessionData.products.forEach(p => {
            const pid = p.productId;
            if (!assignedByProductId[pid]) {
                assignedByProductId[pid] = { count: 0, productCode: p.productCode, imageUrl: p.imageUrl };
            }
            assignedByProductId[pid].count += p.quantity;
        });

        // Clone existing details
        const mergedDetails = [...existingDetails];

        // Update notes for existing products (giống tab2)
        mergedDetails.forEach(detail => {
            const pid = detail.Product?.Id || detail.ProductId;
            const noteKey = `${stt}-${pid}`;
            if (productNotes[noteKey] !== undefined) {
                detail.Note = productNotes[noteKey] || '';
                console.log(`   📝 Updated note for ${detail.ProductCode || pid}: "${detail.Note}"`);
            }
        });

        // Process assigned products
        for (const productId of Object.keys(assignedByProductId)) {
            const assignedData = assignedByProductId[productId];
            const existingDetail = existingByProductId[productId];

            // Get note from productNotes (giống tab2)
            const noteKey = `${stt}-${productId}`;
            const noteValue = productNotes[noteKey] || 'live';

            if (existingDetail) {
                // Product exists - increase quantity
                const oldQty = existingDetail.Quantity || 0;
                existingDetail.Quantity = oldQty + assignedData.count;
                // Update note if set in preview
                existingDetail.Note = noteValue;
                console.log(`   ✏️ Updated ${existingDetail.ProductCode || productId}: ${oldQty} → ${existingDetail.Quantity}, note: "${noteValue}"`);
            } else {
                // New product - fetch and add
                console.log(`   ➕ Adding new product: ${productId} x${assignedData.count}`);

                const fullProduct = await fetchProductDetails(productId);
                if (!fullProduct) {
                    console.error(`   ❌ Cannot fetch product ${productId}, skipping...`);
                    continue;
                }

                // Validate sale price (only use PriceVariant or ListPrice, never StandardPrice)
                const salePrice = fullProduct.PriceVariant || fullProduct.ListPrice;
                if (salePrice == null || salePrice < 0) {
                    console.error(`   ❌ Sản phẩm "${fullProduct.Name || fullProduct.DefaultCode}" (ID: ${fullProduct.Id}) không có giá bán.`);
                    throw new Error(`Sản phẩm "${fullProduct.Name || fullProduct.DefaultCode}" (ID: ${fullProduct.Id}) không có giá bán.`);
                }

                const newProduct = {
                    ProductId: fullProduct.Id,
                    Quantity: assignedData.count,
                    Price: salePrice,
                    Note: noteValue,
                    UOMId: fullProduct.UOM?.Id || 1,
                    Factor: 1,
                    Priority: 0,
                    OrderId: orderData.Id,
                    LiveCampaign_DetailId: null,
                    ProductWeight: 0,
                    ProductName: fullProduct.Name || fullProduct.NameTemplate,
                    ProductNameGet: fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                    ProductCode: fullProduct.DefaultCode || fullProduct.Barcode,
                    UOMName: fullProduct.UOM?.Name || "Cái",
                    ImageUrl: fullProduct.ImageUrl || assignedData.imageUrl,
                    IsOrderPriority: null,
                    QuantityRegex: null,
                    IsDisabledLiveCampaignDetail: false,
                    CreatedById: orderData.UserId || orderData.CreatedById,
                };

                mergedDetails.push(newProduct);
                console.log(`   ✅ Added new product with note: "${noteValue}"`);
            }
        }

        return mergedDetails;
    }

    async function fetchProductDetails(productId) {
        try {
            const apiUrl = `${API_CONFIG.WORKER_URL}/api/odata/Product(${productId})?$expand=UOM`;
            const headers = await window.tokenManager.getAuthHeader();

            const response = await fetch(apiUrl, {
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                }
            });

            if (!response.ok) {
                console.error(`Failed to fetch product ${productId}: ${response.status}`);
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error(`Error fetching product ${productId}:`, error);
            return null;
        }
    }

    function prepareUploadPayload(orderData) {
        const payload = JSON.parse(JSON.stringify(orderData));

        if (!payload['@odata.context']) {
            payload['@odata.context'] = 'http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity';
        }

        if (payload.Details && Array.isArray(payload.Details)) {
            payload.Details = payload.Details.map(detail => {
                const cleaned = { ...detail };
                if (!cleaned.Id || cleaned.Id === null || cleaned.Id === undefined) {
                    delete cleaned.Id;
                }
                cleaned.OrderId = payload.Id;
                return cleaned;
            });
        }

        return payload;
    }

    async function removeUploadedSTTsFromAssignments(uploadedSTTs) {
        console.log('[DELETE] Removing uploaded STTs:', uploadedSTTs);

        assignments.forEach(assignment => {
            if (assignment.sttList && Array.isArray(assignment.sttList)) {
                assignment.sttList = assignment.sttList.filter(sttItem => {
                    const stt = typeof sttItem === 'object' ? sttItem.stt : sttItem;
                    return !uploadedSTTs.includes(stt.toString());
                });
            }
        });

        assignments = assignments.filter(a => a.sttList && a.sttList.length > 0);
        saveAssignments(true);
        renderAssignmentTable();
        console.log('[DELETE] ✅ Removed successfully');
    }

    async function createBackupBeforeUpload(uploadId, uploadedSTTs) {
        try {
            const backupData = {
                uploadId: uploadId,
                timestamp: Date.now(),
                beforeSnapshot: { assignments: JSON.parse(JSON.stringify(assignments)) },
                uploadedSTTs: uploadedSTTs
            };
            await database.ref(getUserFirebasePath('productAssignments_backup')).child(uploadId).set(backupData);
            console.log('[BACKUP] Created:', uploadId);
        } catch (error) {
            console.error('[BACKUP] Error:', error);
        }
    }

    async function saveToUploadHistory(uploadId, results, status) {
        try {
            const historyRecord = {
                uploadId: uploadId,
                timestamp: Date.now(),
                uploadStatus: status,
                totalSTTs: results.length,
                successCount: results.filter(r => r.success).length,
                failCount: results.filter(r => !r.success).length,
                uploadedSTTs: results.map(r => r.stt),
                uploadResults: results,
                beforeSnapshot: { assignments: JSON.parse(JSON.stringify(assignments)) }
            };
            await database.ref(getUserFirebasePath('productAssignments_history')).child(uploadId).set(historyRecord);
            console.log('[HISTORY] Saved:', uploadId);

            // Also save to V2 database (separate function, separate path)
            await saveToUploadHistoryV2(uploadId, results, status);
        } catch (error) {
            console.error('[HISTORY] Error:', error);
        }
    }

    window.finalizeSession = function () {
        const totalSTTs = Object.keys(uploadData).length;
        let totalProducts = 0;
        let totalItems = 0;

        Object.values(uploadData).forEach(data => {
            totalProducts += data.products.length;
            totalItems += data.products.reduce((sum, p) => sum + p.quantity, 0);
        });

        document.getElementById('finalizeTotalSTT').textContent = totalSTTs;
        document.getElementById('finalizeTotalProducts').textContent = totalProducts;
        document.getElementById('finalizeTotalItems').textContent = totalItems;

        const modal = new bootstrap.Modal(document.getElementById('finalizeModal'));
        modal.show();
    };

    window.confirmFinalize = async function () {
        try {
            const note = document.getElementById('finalizeNote').value.trim();

            const finalizeId = `finalize_${Date.now()}`;
            const finalizeData = {
                finalizeId: finalizeId,
                timestamp: Date.now(),
                type: 'finalize',
                totalSTTs: Object.keys(uploadData).length,
                totalProducts: assignments.length,
                note: note,
                beforeSnapshot: { assignments: JSON.parse(JSON.stringify(assignments)) }
            };

            await database.ref(getUserFirebasePath('productAssignments_finalize_history')).child(finalizeId).set(finalizeData);

            assignments = [];
            saveAssignments(true);
            renderAssignmentTable();

            const modal = bootstrap.Modal.getInstance(document.getElementById('finalizeModal'));
            if (modal) modal.hide();

            showNotification('✅ Đã finalize session thành công!');
            console.log('[FINALIZE] Success:', finalizeId);
        } catch (error) {
            console.error('[FINALIZE] Error:', error);
            showNotification('Lỗi: ' + error.message, 'error');
        }
    };

    // =====================================================
    // UPLOAD HISTORY V2 VIEWER (GIỐNG 100% TAB-UPLOAD-TPOS, DATABASE RIÊNG)
    // =====================================================

    // Helper function to get Firebase path for V2
    function getUserFirebasePathV2(basePath = 'productAssignments_v2_history') {
        if (!userStorageManager) {
            userStorageManager = window.userStorageManager;
        }
        return userStorageManager ? userStorageManager.getUserFirebasePath(basePath) : `${basePath}/guest`;
    }

    // Helper function to get user display name
    function getUserDisplayNameV2(userId) {
        if (!userId) return 'Unknown';
        if (userId.includes('-')) {
            return userId.split('-')[0];
        }
        return userId;
    }

    // Helper function to load all users for filter
    async function loadAllUsersForFilterV2() {
        try {
            console.log('[HISTORY-V2] 📥 Loading all users for filter...');
            const historyRef = database.ref('productAssignments_v2_history');
            const snapshot = await historyRef.once('value');

            const userIds = [];
            if (snapshot.exists()) {
                snapshot.forEach(childSnapshot => {
                    userIds.push(childSnapshot.key);
                });
            }

            userIds.sort();
            console.log(`[HISTORY-V2] ✅ Found ${userIds.length} users with upload history`);
            return userIds;
        } catch (error) {
            console.error('[HISTORY-V2] ❌ Error loading users for filter:', error);
            return [];
        }
    }

    // Populate user filter dropdown
    async function populateUserFilterV2() {
        try {
            const userFilterSelect = document.getElementById('historyV2UserFilter');
            if (!userFilterSelect) {
                console.warn('[HISTORY-V2] User filter select not found');
                return;
            }

            const previousSelection = userFilterSelect.value;
            console.log('[HISTORY-V2] Preserving selection:', previousSelection);

            const currentUser = (userStorageManager && typeof userStorageManager.getUserIdentifier === 'function')
                ? userStorageManager.getUserIdentifier()
                : null;
            console.log('[HISTORY-V2] Current user:', currentUser);

            const allUsers = await loadAllUsersForFilterV2();

            userFilterSelect.innerHTML = `
                <option value="current">👤 Lịch sử của tôi</option>
                <option value="all">👥 Tất cả người dùng</option>
            `;

            if (allUsers.length > 0) {
                const separator = document.createElement('option');
                separator.disabled = true;
                separator.textContent = '───────────────';
                userFilterSelect.appendChild(separator);
            }

            allUsers.forEach(userId => {
                const option = document.createElement('option');
                option.value = userId;
                option.textContent = `👤 ${getUserDisplayNameV2(userId)}`;

                if (userId === currentUser) {
                    option.textContent += ' (bạn)';
                }

                userFilterSelect.appendChild(option);
            });

            if (previousSelection) {
                const optionExists = Array.from(userFilterSelect.options).some(opt => opt.value === previousSelection);
                if (optionExists) {
                    userFilterSelect.value = previousSelection;
                    console.log('[HISTORY-V2] Restored selection to:', previousSelection);
                } else {
                    console.log('[HISTORY-V2] Previous selection no longer exists, keeping default');
                }
            }

            console.log('[HISTORY-V2] ✅ User filter populated with', allUsers.length, 'users');
        } catch (error) {
            console.error('[HISTORY-V2] ❌ Error populating user filter:', error);
        }
    }

    /**
     * Open Upload History V2 Modal
     */
    window.openUploadHistoryV2Modal = async function () {
        console.log('[HISTORY-V2] 📜 Opening upload history v2 modal...');

        try {
            const modal = new bootstrap.Modal(document.getElementById('uploadHistoryV2Modal'));
            modal.show();

            const container = document.getElementById('historyV2ListContainer');
            container.innerHTML = `
                <div class="history-loading">
                    <div class="spinner-border text-info" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-3">Đang tải lịch sử...</p>
                </div>
            `;

            // Check and sync any pending records first
            const pendingCount = await getPendingHistoryCount();
            if (pendingCount > 0) {
                console.log(`[HISTORY-V2] Found ${pendingCount} pending records, attempting sync...`);
                container.innerHTML = `
                    <div class="history-loading">
                        <div class="spinner-border text-warning" role="status">
                            <span class="visually-hidden">Syncing...</span>
                        </div>
                        <p class="text-muted mt-3">Đang đồng bộ ${pendingCount} bản ghi chưa lưu...</p>
                    </div>
                `;
                await syncPendingHistoryV2();
            }

            await populateUserFilterV2();
            await loadUploadHistoryV2();

            // Show remaining pending count if any
            const remainingPending = await getPendingHistoryCount();
            if (remainingPending > 0) {
                updatePendingSyncIndicator(remainingPending);
            }

        } catch (error) {
            console.error('[HISTORY-V2] ❌ Error opening history modal:', error);
            showNotification('❌ Lỗi khi tải lịch sử upload', 'error');

            const container = document.getElementById('historyV2ListContainer');
            container.innerHTML = `
                <div class="history-empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Lỗi khi tải lịch sử upload</p>
                    <p class="small text-danger">${error.message}</p>
                    <button class="btn btn-sm btn-primary mt-2" onclick="openUploadHistoryV2Modal()">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    };

    /**
     * Update pending sync indicator in modal header
     */
    function updatePendingSyncIndicator(count) {
        const modalHeader = document.querySelector('#uploadHistoryV2Modal .modal-header');
        if (!modalHeader) return;

        // Remove existing indicator
        const existing = modalHeader.querySelector('.pending-sync-indicator');
        if (existing) existing.remove();

        if (count > 0) {
            const indicator = document.createElement('div');
            indicator.className = 'pending-sync-indicator ms-3';
            indicator.innerHTML = `
                <span class="badge bg-warning text-dark" title="Có ${count} bản ghi chưa đồng bộ">
                    <i class="fas fa-exclamation-triangle"></i> ${count} chưa đồng bộ
                </span>
                <button class="btn btn-sm btn-outline-warning ms-2" onclick="retrySyncPendingHistory()" title="Thử đồng bộ lại">
                    <i class="fas fa-sync"></i>
                </button>
            `;
            modalHeader.querySelector('.modal-title').after(indicator);
        }
    }

    /**
     * Retry sync pending history (called from UI button)
     */
    window.retrySyncPendingHistory = async function () {
        showNotification('🔄 Đang đồng bộ...', 'info');
        const result = await syncPendingHistoryV2();

        if (result.synced > 0) {
            // Reload history to show newly synced records
            await loadUploadHistoryV2();
        }

        // Update indicator
        const remaining = await getPendingHistoryCount();
        updatePendingSyncIndicator(remaining);
    };

    /**
     * Load upload history V2 from Firebase
     */
    async function loadUploadHistoryV2() {
        try {
            console.log('[HISTORY-V2] 📥 Loading history from Firebase...');

            const userFilterSelect = document.getElementById('historyV2UserFilter');
            const selectedUser = userFilterSelect ? userFilterSelect.value : 'current';
            console.log('[HISTORY-V2] Selected user filter:', selectedUser);

            let historyPath;
            let snapshot;

            if (selectedUser === 'current') {
                historyPath = getUserFirebasePathV2('productAssignments_v2_history');
                console.log('[HISTORY-V2] Loading current user history from path:', historyPath);
                snapshot = await database.ref(historyPath)
                    .orderByChild('timestamp')
                    .limitToLast(100)
                    .once('value');
            } else if (selectedUser === 'all') {
                historyPath = 'productAssignments_v2_history';
                console.log('[HISTORY-V2] Loading ALL users history from path:', historyPath);
                snapshot = await database.ref(historyPath).once('value');
            } else {
                historyPath = `productAssignments_v2_history/${selectedUser}`;
                console.log('[HISTORY-V2] Loading specific user history from path:', historyPath);
                snapshot = await database.ref(historyPath)
                    .orderByChild('timestamp')
                    .limitToLast(100)
                    .once('value');
            }

            const data = snapshot.val();

            if (!data) {
                console.log('[HISTORY-V2] ℹ️ No history records found');
                uploadHistoryRecordsV2 = [];
                filteredHistoryRecordsV2 = [];
                filterUploadHistoryV2();
                return;
            }

            uploadHistoryRecordsV2 = [];

            if (selectedUser === 'all') {
                console.log('[HISTORY-V2] 🔍 Flattening data from all users...');
                Object.keys(data).forEach(userId => {
                    const userHistory = data[userId];
                    if (userHistory && typeof userHistory === 'object') {
                        Object.keys(userHistory).forEach(uploadKey => {
                            const record = userHistory[uploadKey];
                            if (!record || typeof record !== 'object') return;
                            if (!record.timestamp && !record.uploadId && !record.uploadStatus) return;

                            // Ensure uploadedSTTs is always a valid array
                            let validatedUploadedSTTs = [];
                            if (Array.isArray(record.uploadedSTTs)) {
                                validatedUploadedSTTs = record.uploadedSTTs.filter(stt => stt != null).map(stt => String(stt));
                            }

                            uploadHistoryRecordsV2.push({
                                uploadId: record.uploadId || uploadKey,
                                firebaseKey: uploadKey, // Key thực sự trong Firebase để query
                                timestamp: record.timestamp || 0,
                                uploadStatus: record.uploadStatus || 'unknown',
                                totalSTTs: record.totalSTTs || 0,
                                totalAssignments: record.totalAssignments || 0,
                                successCount: record.successCount || 0,
                                failCount: record.failCount || 0,
                                uploadedSTTs: validatedUploadedSTTs,
                                note: record.note || '',
                                committedAt: record.committedAt || null,
                                restoredAt: record.restoredAt || null,
                                userId: record.userId || userId || 'guest',
                                beforeSnapshot: record.beforeSnapshot || null
                            });
                        });
                    }
                });
            } else {
                uploadHistoryRecordsV2 = Object.keys(data).map(key => {
                    const record = data[key];

                    // Ensure uploadedSTTs is always a valid array
                    let validatedUploadedSTTs = [];
                    if (Array.isArray(record.uploadedSTTs)) {
                        validatedUploadedSTTs = record.uploadedSTTs.filter(stt => stt != null).map(stt => String(stt));
                    }

                    return {
                        uploadId: record.uploadId || key,
                        firebaseKey: key, // Key thực sự trong Firebase để query
                        timestamp: record.timestamp || 0,
                        uploadStatus: record.uploadStatus || 'unknown',
                        totalSTTs: record.totalSTTs || 0,
                        totalAssignments: record.totalAssignments || 0,
                        successCount: record.successCount || 0,
                        failCount: record.failCount || 0,
                        uploadedSTTs: validatedUploadedSTTs,
                        note: record.note || '',
                        committedAt: record.committedAt || null,
                        restoredAt: record.restoredAt || null,
                        userId: record.userId || selectedUser || 'guest',
                        beforeSnapshot: record.beforeSnapshot || null
                    };
                });
            }

            uploadHistoryRecordsV2.sort((a, b) => b.timestamp - a.timestamp);

            if (selectedUser === 'all' && uploadHistoryRecordsV2.length > 100) {
                uploadHistoryRecordsV2 = uploadHistoryRecordsV2.slice(0, 100);
            }

            filteredHistoryRecordsV2 = [...uploadHistoryRecordsV2];

            // Enhanced logging with timestamp range for debugging
            if (uploadHistoryRecordsV2.length > 0) {
                const newest = new Date(uploadHistoryRecordsV2[0].timestamp);
                const oldest = new Date(uploadHistoryRecordsV2[uploadHistoryRecordsV2.length - 1].timestamp);
                console.log(`[HISTORY-V2] ✅ Loaded ${uploadHistoryRecordsV2.length} records`, {
                    newest: newest.toLocaleString('vi-VN'),
                    oldest: oldest.toLocaleString('vi-VN'),
                    uploadIds: uploadHistoryRecordsV2.slice(0, 5).map(r => r.uploadId)
                });
            } else {
                console.log('[HISTORY-V2] ✅ Loaded 0 history records');
            }

            filterUploadHistoryV2();

        } catch (error) {
            console.error('[HISTORY-V2] ❌ Error loading history:', error);
            throw error;
        }
    }

    /**
     * Filter upload history V2 based on user input
     */
    window.filterUploadHistoryV2 = function () {
        const status = document.getElementById('historyV2StatusFilter').value;
        const dateFrom = document.getElementById('historyV2DateFrom').value;
        const dateTo = document.getElementById('historyV2DateTo').value;
        const searchSTT = document.getElementById('historyV2SearchSTT').value.trim();
        const searchProduct = document.getElementById('historyV2SearchProduct').value.trim();

        // Enhanced debug logging
        console.log('[HISTORY-V2] 🔍 Pre-filter state:', {
            totalUnfiltered: uploadHistoryRecordsV2.length,
            filters: { status, dateFrom, dateTo, searchSTT, searchProduct }
        });

        filteredHistoryRecordsV2 = [...uploadHistoryRecordsV2];

        // Filter by status
        if (status && status !== 'all') {
            filteredHistoryRecordsV2 = filteredHistoryRecordsV2.filter(record => record.uploadStatus === status);
            console.log('[HISTORY-V2] After status filter:', filteredHistoryRecordsV2.length);
        }

        // Filter by dateFrom with NaN check
        if (dateFrom) {
            const fromTimestamp = new Date(dateFrom).getTime();
            if (!isNaN(fromTimestamp)) {
                filteredHistoryRecordsV2 = filteredHistoryRecordsV2.filter(record => {
                    const recordTime = record.timestamp || 0;
                    return recordTime >= fromTimestamp;
                });
                console.log('[HISTORY-V2] After dateFrom filter:', filteredHistoryRecordsV2.length);
            } else {
                console.warn('[HISTORY-V2] Invalid dateFrom value:', dateFrom);
            }
        }

        // Filter by dateTo with NaN check
        if (dateTo) {
            const toTimestamp = new Date(dateTo).getTime();
            if (!isNaN(toTimestamp)) {
                filteredHistoryRecordsV2 = filteredHistoryRecordsV2.filter(record => {
                    const recordTime = record.timestamp || 0;
                    return recordTime <= toTimestamp;
                });
                console.log('[HISTORY-V2] After dateTo filter:', filteredHistoryRecordsV2.length);
            } else {
                console.warn('[HISTORY-V2] Invalid dateTo value:', dateTo);
            }
        }

        // Filter by STT with defensive null check
        if (searchSTT) {
            filteredHistoryRecordsV2 = filteredHistoryRecordsV2.filter(record => {
                // Defensive check for uploadedSTTs
                if (!Array.isArray(record.uploadedSTTs) || record.uploadedSTTs.length === 0) {
                    return false;
                }
                return record.uploadedSTTs.some(stt =>
                    stt != null && stt.toString().includes(searchSTT)
                );
            });
            console.log('[HISTORY-V2] After STT filter:', filteredHistoryRecordsV2.length);
        }

        // Filter by product with defensive null check
        if (searchProduct) {
            filteredHistoryRecordsV2 = filteredHistoryRecordsV2.filter(record => {
                // Check if beforeSnapshot has valid assignments array
                const assignments = record.beforeSnapshot?.assignments;
                if (!Array.isArray(assignments) || assignments.length === 0) {
                    return false;
                }
                return assignments.some(assignment => {
                    const productCode = String(assignment.productCode || '');
                    const productId = String(assignment.productId || '');
                    const productName = String(assignment.productName || '');
                    const searchLower = searchProduct.toLowerCase();
                    return productCode.toLowerCase().includes(searchLower) ||
                        productId.toLowerCase().includes(searchLower) ||
                        productName.toLowerCase().includes(searchLower);
                });
            });
            console.log('[HISTORY-V2] After product filter:', filteredHistoryRecordsV2.length);
        }

        currentHistoryPageV2 = 1;

        // Check if Group By STT view is active
        const isGroupBySTT = document.getElementById('historyV2GroupBySTT')?.checked;
        if (isGroupBySTT) {
            renderGroupBySTTView();
        } else {
            renderUploadHistoryListV2();
        }

        console.log(`[HISTORY-V2] ✅ Final filtered count: ${filteredHistoryRecordsV2.length} records`);
    };

    /**
     * Clear all history V2 filters and reload
     */
    window.clearHistoryV2Filters = function () {
        document.getElementById('historyV2StatusFilter').value = 'all';
        document.getElementById('historyV2DateFrom').value = '';
        document.getElementById('historyV2DateTo').value = '';
        document.getElementById('historyV2SearchSTT').value = '';
        document.getElementById('historyV2SearchProduct').value = '';
        filterUploadHistoryV2();
    };

    /**
     * Render upload history V2 list with pagination
     */
    function renderUploadHistoryListV2() {
        const container = document.getElementById('historyV2ListContainer');

        if (filteredHistoryRecordsV2.length === 0) {
            // Check if any filters are active
            const hasFilters = document.getElementById('historyV2StatusFilter').value !== 'all' ||
                document.getElementById('historyV2DateFrom').value ||
                document.getElementById('historyV2DateTo').value ||
                document.getElementById('historyV2SearchSTT').value.trim() ||
                document.getElementById('historyV2SearchProduct').value.trim();

            container.innerHTML = `
                <div class="history-empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Không tìm thấy lịch sử upload nào</p>
                    ${hasFilters ? `
                        <p class="small text-muted">
                            Đã tải ${uploadHistoryRecordsV2.length} bản ghi, nhưng không phù hợp với bộ lọc.
                        </p>
                        <button class="btn btn-sm btn-outline-secondary mt-2" onclick="clearHistoryV2Filters()">
                            <i class="fas fa-times"></i> Xóa bộ lọc
                        </button>
                    ` : `
                        <p class="small">Lịch sử sẽ được lưu tự động sau mỗi lần upload</p>
                    `}
                </div>
            `;
            document.getElementById('historyV2Pagination').innerHTML = '';
            return;
        }

        const totalPages = Math.ceil(filteredHistoryRecordsV2.length / HISTORY_PAGE_SIZE_V2);
        const startIndex = (currentHistoryPageV2 - 1) * HISTORY_PAGE_SIZE_V2;
        const endIndex = Math.min(startIndex + HISTORY_PAGE_SIZE_V2, filteredHistoryRecordsV2.length);
        const pageRecords = filteredHistoryRecordsV2.slice(startIndex, endIndex);

        container.innerHTML = pageRecords.map(record => formatHistoryCardV2(record)).join('');
        renderHistoryPaginationV2(totalPages);
    }

    /**
     * Format a single history V2 card HTML
     */
    function formatHistoryCardV2(record) {
        const statusConfig = {
            'completed': { icon: '✅', text: 'Thành công', class: 'completed' },
            'partial': { icon: '⚠️', text: 'Thành công một phần', class: 'partial' },
            'failed': { icon: '❌', text: 'Thất bại', class: 'failed' },
            'deletion_failed': { icon: '⚠️', text: 'Upload OK - Xóa failed', class: 'deletion_failed' }
        };

        const config = statusConfig[record.uploadStatus] || { icon: '❓', text: 'Unknown', class: 'unknown' };

        let totalAssignmentsCalc = record.totalAssignments || record.totalSTTs || 0;
        let successCountCalc = record.successCount || 0;
        let failCountCalc = record.failCount || 0;

        const date = new Date(record.timestamp);
        const dateStr = date.toLocaleString('vi-VN');
        const shortId = record.uploadId.slice(-8);
        const userBadge = record.userId ? `<span class="user-badge">👤 ${getUserDisplayNameV2(record.userId)}</span>` : '';
        const sttList = record.uploadedSTTs.slice(0, 20).join(', ');
        const moreStt = record.uploadedSTTs.length > 20 ? ` và ${record.uploadedSTTs.length - 20} STT khác` : '';

        return `
            <div class="history-card ${config.class}">
                <div class="history-card-header">
                    <div>
                        <h6 class="history-card-title">
                            ${config.icon} Upload #${shortId} ${userBadge}
                            <span class="history-card-date">${dateStr}</span>
                        </h6>
                    </div>
                    <span class="history-status-badge ${config.class}">${config.text}</span>
                </div>

                <div class="history-stats">
                    <div class="history-stat-item history-stat-success">
                        <i class="fas fa-check-circle"></i>
                        <span><strong>${successCountCalc}</strong> thành công</span>
                    </div>
                    <div class="history-stat-item history-stat-failed">
                        <i class="fas fa-times-circle"></i>
                        <span><strong>${failCountCalc}</strong> thất bại</span>
                    </div>
                    <div class="history-stat-item history-stat-total">
                        <i class="fas fa-list"></i>
                        <span><strong>${totalAssignmentsCalc}</strong> tổng STT</span>
                    </div>
                </div>

                <div class="history-stts">
                    <strong>STT:</strong> ${sttList}${moreStt}
                </div>

                <div class="history-actions">
                    <button class="btn btn-sm btn-info" onclick="compareCartHistoryV2('${record.firebaseKey || record.uploadId}', '${record.userId || ''}')">
                        <i class="fas fa-balance-scale"></i> So Sánh Giỏ
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="viewUploadHistoryDetailV2('${record.firebaseKey || record.uploadId}', '${record.userId || ''}')">
                        <i class="fas fa-eye"></i> Xem Chi Tiết
                    </button>
                </div>

                ${record.note ? `
                    <div class="history-note">
                        <i class="fas fa-sticky-note"></i>
                        ${record.note}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render pagination controls for V2
     */
    function renderHistoryPaginationV2(totalPages) {
        const pagination = document.getElementById('historyV2Pagination');

        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        let html = '';

        html += `
            <button class="btn btn-sm btn-outline-secondary"
                    onclick="changeHistoryPageV2(${currentHistoryPageV2 - 1})"
                    ${currentHistoryPageV2 === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
        `;

        const maxPageButtons = 7;
        let startPage = Math.max(1, currentHistoryPageV2 - Math.floor(maxPageButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);

        if (endPage - startPage < maxPageButtons - 1) {
            startPage = Math.max(1, endPage - maxPageButtons + 1);
        }

        if (startPage > 1) {
            html += `
                <button class="btn btn-sm btn-outline-secondary" onclick="changeHistoryPageV2(1)">1</button>
                ${startPage > 2 ? '<span>...</span>' : ''}
            `;
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `
                <button class="btn btn-sm ${i === currentHistoryPageV2 ? 'btn-info active' : 'btn-outline-secondary'}"
                        onclick="changeHistoryPageV2(${i})">
                    ${i}
                </button>
            `;
        }

        if (endPage < totalPages) {
            html += `
                ${endPage < totalPages - 1 ? '<span>...</span>' : ''}
                <button class="btn btn-sm btn-outline-secondary" onclick="changeHistoryPageV2(${totalPages})">${totalPages}</button>
            `;
        }

        html += `
            <button class="btn btn-sm btn-outline-secondary"
                    onclick="changeHistoryPageV2(${currentHistoryPageV2 + 1})"
                    ${currentHistoryPageV2 === totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        pagination.innerHTML = html;
    }

    /**
     * Change history page V2
     */
    window.changeHistoryPageV2 = function (page) {
        currentHistoryPageV2 = page;
        renderUploadHistoryListV2();
        document.getElementById('historyV2ListContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    /**
     * Toggle between normal view and Group By STT view
     */
    window.toggleGroupBySTTView = function () {
        const isGroupBySTT = document.getElementById('historyV2GroupBySTT').checked;
        console.log('[HISTORY-V2] Toggle Group By STT:', isGroupBySTT);

        if (isGroupBySTT) {
            renderGroupBySTTView();
        } else {
            renderUploadHistoryListV2();
        }
    };

    /**
     * Render Group By STT View - aggregates all uploads within selected time range by STT
     */
    function renderGroupBySTTView() {
        const container = document.getElementById('historyV2ListContainer');
        const dateFrom = document.getElementById('historyV2DateFrom').value;
        const dateTo = document.getElementById('historyV2DateTo').value;
        const searchSTT = document.getElementById('historyV2SearchSTT').value.trim();
        const searchProduct = document.getElementById('historyV2SearchProduct').value.trim();

        console.log('[HISTORY-V2] Rendering Group By STT view...');
        console.log('[HISTORY-V2] Total filtered records:', filteredHistoryRecordsV2.length);

        // Collect all STT -> Products mappings from all filtered records
        const sttProductMap = new Map(); // stt -> { products: Map, uploads: [] }

        filteredHistoryRecordsV2.forEach(record => {
            const uploadInfo = {
                uploadId: record.uploadId,
                timestamp: record.timestamp,
                userId: record.userId
            };

            // Try to get data from beforeSnapshot.assignments first
            if (record.beforeSnapshot && record.beforeSnapshot.assignments && record.beforeSnapshot.assignments.length > 0) {
                console.log('[HISTORY-V2] Processing record with beforeSnapshot:', record.uploadId);

                record.beforeSnapshot.assignments.forEach(assignment => {
                    if (!assignment.sttList || !assignment.sttList.length) return;

                    const productInfo = {
                        productCode: assignment.productCode || '',
                        productId: assignment.productId || '',
                        productName: assignment.productName || '',
                        productImage: assignment.productImage || ''
                    };

                    assignment.sttList.forEach(sttItem => {
                        // sttList can contain objects with stt property or direct values
                        const sttStr = String(typeof sttItem === 'object' ? sttItem.stt : sttItem);

                        if (!sttProductMap.has(sttStr)) {
                            sttProductMap.set(sttStr, {
                                products: new Map(),
                                uploads: []
                            });
                        }

                        const sttData = sttProductMap.get(sttStr);

                        // Use productCode as key to avoid duplicates
                        const productKey = productInfo.productCode || productInfo.productId || productInfo.productName;
                        if (productKey && !sttData.products.has(productKey)) {
                            sttData.products.set(productKey, productInfo);
                        }

                        // Track upload info
                        if (!sttData.uploads.find(u => u.uploadId === record.uploadId)) {
                            sttData.uploads.push(uploadInfo);
                        }
                    });
                });
            }
            // Fallback: use uploadedSTTs if beforeSnapshot is not available
            else if (record.uploadedSTTs && record.uploadedSTTs.length > 0) {
                console.log('[HISTORY-V2] Processing record with uploadedSTTs fallback:', record.uploadId);

                record.uploadedSTTs.forEach(stt => {
                    const sttStr = String(stt);

                    if (!sttProductMap.has(sttStr)) {
                        sttProductMap.set(sttStr, {
                            products: new Map(),
                            uploads: []
                        });
                    }

                    const sttData = sttProductMap.get(sttStr);

                    // Track upload info (no product info available in fallback)
                    if (!sttData.uploads.find(u => u.uploadId === record.uploadId)) {
                        sttData.uploads.push(uploadInfo);
                    }
                });
            }
        });

        console.log('[HISTORY-V2] Total STTs collected:', sttProductMap.size);

        // Filter by STT search if specified
        let filteredSTTs = Array.from(sttProductMap.entries());
        if (searchSTT) {
            filteredSTTs = filteredSTTs.filter(([stt]) => stt.includes(searchSTT));
        }

        // Filter by product search if specified
        if (searchProduct) {
            const searchLower = searchProduct.toLowerCase();
            filteredSTTs = filteredSTTs.filter(([stt, data]) => {
                return Array.from(data.products.values()).some(product => {
                    return product.productCode.toLowerCase().includes(searchLower) ||
                        product.productId.toLowerCase().includes(searchLower) ||
                        product.productName.toLowerCase().includes(searchLower);
                });
            });
        }

        // Sort by STT number (numeric if possible)
        filteredSTTs.sort((a, b) => {
            const numA = parseInt(a[0], 10);
            const numB = parseInt(b[0], 10);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            return a[0].localeCompare(b[0]);
        });

        if (filteredSTTs.length === 0) {
            container.innerHTML = `
                <div class="history-empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Không tìm thấy STT nào trong khoảng thời gian đã chọn</p>
                    <p class="small">Hãy điều chỉnh bộ lọc thời gian để xem dữ liệu</p>
                </div>
            `;
            document.getElementById('historyV2Pagination').innerHTML = '';
            return;
        }

        // Build date range display with formatted datetime
        const formatDateTime = (dateTimeStr) => {
            if (!dateTimeStr) return '';
            const date = new Date(dateTimeStr);
            return date.toLocaleString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        };

        let dateRangeText = '';
        if (dateFrom && dateTo) {
            dateRangeText = `Từ ${formatDateTime(dateFrom)} đến ${formatDateTime(dateTo)}`;
        } else if (dateFrom) {
            dateRangeText = `Từ ${formatDateTime(dateFrom)}`;
        } else if (dateTo) {
            dateRangeText = `Đến ${formatDateTime(dateTo)}`;
        } else {
            dateRangeText = 'Tất cả thời gian';
        }

        // Render the grouped view
        let html = `
            <div class="stt-group-header mb-3">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1"><i class="fas fa-layer-group"></i> Danh sách STT và Sản phẩm</h6>
                        <small class="text-muted">${dateRangeText} • ${filteredSTTs.length} STT</small>
                    </div>
                </div>
            </div>
            <div class="stt-group-list">
        `;

        filteredSTTs.forEach(([stt, data]) => {
            const products = Array.from(data.products.values());
            const uploadsCount = data.uploads.length;

            html += `
                <div class="stt-group-card">
                    <div class="stt-group-card-header">
                        <span class="stt-group-number">
                            <i class="fas fa-hashtag"></i> STT ${stt}
                        </span>
                        <div>
                            ${products.length > 0 ? `<span class="badge bg-success">${products.length} sản phẩm</span>` : ''}
                            <span class="badge bg-info ms-1">${uploadsCount} lần upload</span>
                        </div>
                    </div>
                    <div class="stt-group-products">
            `;

            if (products.length > 0) {
                products.forEach(product => {
                    const imgSrc = product.productImage || '';
                    const hasImage = imgSrc && imgSrc.length > 0;

                    html += `
                        <div class="stt-product-item">
                            <div class="stt-product-image ${hasImage ? '' : 'no-image'}">
                                ${hasImage ? `<img src="${imgSrc}" alt="${product.productName}" />` : '<i class="fas fa-box"></i>'}
                            </div>
                            <div class="stt-product-info">
                                <div class="stt-product-code">${product.productCode || product.productId || 'N/A'}</div>
                                <div class="stt-product-name">${product.productName || ''}</div>
                            </div>
                        </div>
                    `;
                });
            } else {
                html += `
                    <div class="stt-no-products">
                        <i class="fas fa-info-circle text-muted"></i>
                        <span class="text-muted">Không có thông tin sản phẩm chi tiết</span>
                    </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        });

        html += '</div>';

        container.innerHTML = html;
        document.getElementById('historyV2Pagination').innerHTML = '';

        console.log(`[HISTORY-V2] ✅ Rendered Group By STT view with ${filteredSTTs.length} STTs`);
    }

    /**
     * View upload history detail V2
     */
    window.viewUploadHistoryDetailV2 = async function (firebaseKey, userId = '') {
        console.log('[HISTORY-V2] 👁️ Viewing detail for firebaseKey:', firebaseKey, 'userId:', userId);

        try {
            const detailModal = new bootstrap.Modal(document.getElementById('uploadHistoryV2DetailModal'));
            detailModal.show();

            const titleEl = document.getElementById('historyV2DetailModalTitle');
            const bodyEl = document.getElementById('historyV2DetailModalBody');

            titleEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';
            bodyEl.innerHTML = `
                <div class="history-loading">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-3">Đang tải chi tiết upload...</p>
                </div>
            `;

            // Xác định userId - fallback to 'guest' nếu không có
            const effectiveUserId = (userId && userId !== '') ? userId : 'guest';
            let historyPath = `productAssignments_v2_history/${effectiveUserId}`;
            console.log('[HISTORY-V2] Loading detail from path:', `${historyPath}/${firebaseKey}`);

            let snapshot = await database.ref(`${historyPath}/${firebaseKey}`).once('value');
            let record = snapshot.val();

            // Nếu không tìm thấy và userId khác guest, thử tìm ở guest
            if (!record && effectiveUserId !== 'guest') {
                console.log('[HISTORY-V2] ⚠️ Not found, trying guest path...');
                historyPath = 'productAssignments_v2_history/guest';
                snapshot = await database.ref(`${historyPath}/${firebaseKey}`).once('value');
                record = snapshot.val();
            }

            // Nếu vẫn không tìm thấy, thử với user hiện tại
            if (!record) {
                const currentUserPath = getUserFirebasePathV2('productAssignments_v2_history');
                if (currentUserPath !== historyPath) {
                    console.log('[HISTORY-V2] ⚠️ Not found, trying current user path:', currentUserPath);
                    snapshot = await database.ref(`${currentUserPath}/${firebaseKey}`).once('value');
                    record = snapshot.val();
                }
            }

            if (!record) {
                const errorInfo = {
                    firebaseKey,
                    userId: effectiveUserId,
                    triedPaths: [
                        `productAssignments_v2_history/${effectiveUserId}/${firebaseKey}`,
                        `productAssignments_v2_history/guest/${firebaseKey}`
                    ]
                };
                console.error('[HISTORY-V2] ❌ Record not found:', errorInfo);
                throw new Error(`Không tìm thấy record (key: ${firebaseKey.slice(-8)}, user: ${effectiveUserId})`);
            }

            const shortId = firebaseKey.slice(-8);
            titleEl.innerHTML = `<i class="fas fa-info-circle"></i> Chi Tiết Upload #${shortId}`;

            bodyEl.innerHTML = renderUploadHistoryDetailV2(record);

        } catch (error) {
            console.error('[HISTORY-V2] ❌ Error viewing detail:', error);
            showNotification('❌ Lỗi khi tải chi tiết upload', 'error');

            const bodyEl = document.getElementById('historyV2DetailModalBody');
            bodyEl.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Lỗi:</strong> ${error.message}
                    <hr>
                    <small class="text-muted">
                        Có thể record này đã bị xóa hoặc được lưu với user khác.<br>
                        Thử chọn "Tất cả người dùng" trong bộ lọc và tìm lại.
                    </small>
                </div>
            `;
        }
    };

    /**
     * Render upload history detail V2 HTML
     */
    function renderUploadHistoryDetailV2(record) {
        const statusConfig = {
            'completed': { icon: '✅', text: 'Thành công hoàn toàn', class: 'success' },
            'partial': { icon: '⚠️', text: 'Thành công một phần', class: 'warning' },
            'failed': { icon: '❌', text: 'Thất bại hoàn toàn', class: 'danger' },
            'deletion_failed': { icon: '⚠️', text: 'Upload OK - Không xóa được', class: 'warning' }
        };

        const config = statusConfig[record.uploadStatus] || { icon: '❓', text: 'Unknown', class: 'secondary' };
        const date = new Date(record.timestamp).toLocaleString('vi-VN');

        let totalAssignmentsCalc = record.totalAssignments || record.totalSTTs || 0;
        let successCountCalc = record.successCount || 0;
        let failCountCalc = record.failCount || 0;

        let html = `
            <div class="history-detail-info mb-4">
                <div class="row">
                    <div class="col-md-6">
                        <span class="history-detail-label">Upload ID:</span>
                        <span class="history-detail-value">${record.uploadId}</span>
                    </div>
                    <div class="col-md-6">
                        <span class="history-detail-label">Thời gian:</span>
                        <span class="history-detail-value">${date}</span>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <span class="history-detail-label">Trạng thái:</span>
                        <span class="history-detail-value">
                            <span class="badge bg-${config.class}">${config.icon} ${config.text}</span>
                        </span>
                    </div>
                    <div class="col-md-6">
                        <span class="history-detail-label">Tổng STT:</span>
                        <span class="history-detail-value">
                            <strong>${totalAssignmentsCalc}</strong>
                            (✅ ${successCountCalc} | ❌ ${failCountCalc})
                        </span>
                    </div>
                </div>
            </div>
        `;

        // Group products by product code from beforeSnapshot
        const productsByCode = {};
        if (record.beforeSnapshot && record.beforeSnapshot.assignments) {
            record.beforeSnapshot.assignments.forEach(assignment => {
                if (assignment.sttList && Array.isArray(assignment.sttList)) {
                    assignment.sttList.forEach(sttItem => {
                        const stt = String(typeof sttItem === 'object' ? sttItem.stt : sttItem);
                        const productKey = assignment.productCode || assignment.productId;

                        if (!productsByCode[productKey]) {
                            productsByCode[productKey] = {
                                productId: assignment.productId,
                                productCode: assignment.productCode,
                                productName: assignment.productName,
                                imageUrl: assignment.imageUrl,
                                note: assignment.note || '',
                                count: 0,
                                sttList: []
                            };
                        }

                        productsByCode[productKey].count++;
                        productsByCode[productKey].sttList.push(stt);
                    });
                }
            });
        }

        html += '<h6 class="mb-3"><i class="fas fa-box"></i> Sản phẩm đã upload</h6>';

        if (Object.keys(productsByCode).length === 0) {
            html += `
                <div class="alert alert-warning" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    Không có dữ liệu products trong beforeSnapshot
                </div>
            `;
        } else {
            html += `
                <div class="card mb-3 border-primary">
                    <div class="card-body">
                        <table class="table table-sm table-bordered">
                            <thead class="table-light">
                                <tr>
                                    <th style="width: 50%;">Sản phẩm</th>
                                    <th class="text-center" style="width: 15%;">Số lượng</th>
                                    <th class="text-center" style="width: 20%;">Mã đơn hàng</th>
                                    <th style="width: 15%;">Note</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.values(productsByCode).map(product => `
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center gap-2">
                                                ${product.imageUrl
                    ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">`
                    : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                <div style="flex: 1;">
                                                    <div style="font-weight: 600; font-size: 14px;">${product.productName}</div>
                                                    <div style="font-size: 12px; color: #6b7280;">${product.productCode || 'N/A'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="text-center">
                                            <span class="badge bg-primary">${product.count}</span>
                                        </td>
                                        <td class="text-center small">${product.sttList.join(', ')}</td>
                                        <td class="small">${product.note}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // Display error details from uploadResults when there are failures
        const failedResults = (record.uploadResults || []).filter(r => !r.success && r.error);
        if (failedResults.length > 0) {
            html += `
                <h6 class="mb-3 mt-4 text-danger"><i class="fas fa-exclamation-triangle"></i> Chi tiết lỗi (${failedResults.length} STT thất bại)</h6>
                <div class="card mb-3 border-danger">
                    <div class="card-body p-0">
                        <table class="table table-sm table-bordered mb-0">
                            <thead class="table-danger">
                                <tr>
                                    <th style="width: 15%;">STT</th>
                                    <th style="width: 15%;">Mã đơn hàng</th>
                                    <th style="width: 70%;">Lỗi từ TPOS</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${failedResults.map(result => `
                                    <tr>
                                        <td><span class="badge bg-secondary">${result.stt}</span></td>
                                        <td>${result.orderId || 'N/A'}</td>
                                        <td class="text-danger small">
                                            <i class="fas fa-times-circle"></i>
                                            <code style="word-break: break-all; white-space: pre-wrap;">${escapeHtml(result.error || 'Unknown error')}</code>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        if (record.note) {
            html += `
                <div class="history-note mt-3">
                    <i class="fas fa-sticky-note"></i>
                    <strong>Ghi chú:</strong> ${record.note}
                </div>
            `;
        }

        return html;
    }

    // =====================================================
    // HELPER FUNCTIONS FOR COMPARISON CONTENT
    // =====================================================

    /**
     * Filter out encoded strings from note, keeping only plain text
     */
    function filterNonEncodedNotes(note) {
        if (!note) return '';
        // Remove [""] encoded blocks first
        let cleaned = note.replace(/\[\"[A-Za-z0-9\-_]+\"\]/g, '');
        // Remove legacy encoded pattern (UPPERCASE letters/numbers at least 40 chars)
        cleaned = cleaned.replace(/[A-Z0-9]{40,}/g, '');
        return cleaned.trim();
    }

    /**
     * Format note with clickable encoded strings
     */
    function formatNoteWithClickableEncoded(note) {
        if (!note) return '<span class="text-muted">(Không có)</span>';

        // Detect encoded strings (40+ uppercase alphanumeric chars)
        const encodedPattern = /([A-Z0-9]{40,})/g;
        const parts = note.split(encodedPattern);

        return parts.map(part => {
            if (part.match(encodedPattern)) {
                // This is an encoded string - make it clickable
                return `<span class="encoded-string-clickable badge bg-secondary"
                            data-encoded="${part}"
                            style="cursor: pointer; font-size: 0.75rem;"
                            title="Click to decode">
                            🔒 Encoded (${part.length} chars)
                        </span>`;
            } else {
                // Plain text
                return part;
            }
        }).join('');
    }

    /**
     * Render comparison content for history record (COPIED FROM TAB-UPLOAD-TPOS)
     */
    function renderComparisonContent(record) {
        const beforeSnapshot = record.beforeSnapshot;
        const uploadResults = record.uploadResults || [];

        // Create map of upload results by STT for quick lookup
        const uploadResultsMap = {};
        uploadResults.forEach(result => {
            uploadResultsMap[result.stt] = result;
        });

        // Group products by STT from beforeSnapshot.assignments
        const productsBySTT = {};

        if (beforeSnapshot && beforeSnapshot.assignments) {
            beforeSnapshot.assignments.forEach(assignment => {
                if (!assignment.sttList || !Array.isArray(assignment.sttList)) return;

                assignment.sttList.forEach(sttItem => {
                    const stt = typeof sttItem === 'object' ? sttItem.stt : sttItem;

                    if (!productsBySTT[stt]) {
                        productsBySTT[stt] = {
                            assignedProducts: [],
                            orderInfo: typeof sttItem === 'object' ? sttItem.orderInfo : null
                        };
                    }

                    productsBySTT[stt].assignedProducts.push({
                        productId: assignment.productId,
                        productName: assignment.productName,
                        productCode: assignment.productCode,
                        imageUrl: assignment.imageUrl,
                        note: assignment.note || ''
                    });
                });
            });
        }

        // Render HTML for each STT
        let html = '';
        const sortedSTTs = Object.keys(productsBySTT).sort((a, b) => Number(a) - Number(b));

        sortedSTTs.forEach(stt => {
            const data = productsBySTT[stt];
            const uploadResult = uploadResultsMap[stt];

            // Count assigned products
            const assignedProductCounts = {};
            data.assignedProducts.forEach(product => {
                const key = product.productId;
                if (!assignedProductCounts[key]) {
                    assignedProductCounts[key] = { ...product, count: 0 };
                }
                assignedProductCounts[key].count++;
            });

            // Get existing products from upload result (if available)
            const existingProducts = uploadResult?.existingProducts || [];

            // Create map of existing products for highlighting
            const existingProductsMap = {};
            existingProducts.forEach(product => {
                if (product.productId) {
                    existingProductsMap[product.productId] = product;
                }
            });

            // Mark assigned products as new or existing
            Object.values(assignedProductCounts).forEach(product => {
                product.isExisting = !!existingProductsMap[product.productId];
            });

            // Card header with status badge
            let statusBadge = '';
            let cardClass = '';
            if (uploadResult) {
                if (uploadResult.success) {
                    statusBadge = `<span class="badge bg-success ms-2">✅ Upload thành công</span>`;
                    cardClass = 'border-success';
                } else {
                    statusBadge = `<span class="badge bg-danger ms-2">❌ Upload thất bại</span>`;
                    cardClass = 'border-danger';
                }
            }

            // Header: Chỉ hiển thị STT và tên, BỎ GHI CHÚ
            html += `
                <div class="card mb-4 ${cardClass}">
                    <div class="card-header bg-primary text-white">
                        <h5 class="mb-0">
                            <i class="fas fa-hashtag"></i> STT ${stt}
                            ${data.orderInfo?.customerName ? `- ${data.orderInfo.customerName}` : ''}
                            ${statusBadge}
                        </h5>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <!-- Assigned Products (LEFT COLUMN) -->
                            <div class="col-md-6">
                                <h6 class="text-success">
                                    <i class="fas fa-plus-circle"></i> Sản phẩm đã upload (${Object.keys(assignedProductCounts).length})
                                </h6>
                                <table class="table table-sm table-bordered">
                                    <thead class="table-light">
                                        <tr>
                                            <th>Sản phẩm</th>
                                            <th class="text-center">SL</th>
                                            <th>Note</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${Object.values(assignedProductCounts).map(product => {
                const statusBadge = product.isExisting
                    ? '<span class="badge bg-warning text-dark ms-2" title="Sản phẩm đã có trong đơn, đã cộng thêm số lượng"><i class="fas fa-plus"></i> Cộng SL</span>'
                    : '<span class="badge bg-success ms-2" title="Sản phẩm mới đã được thêm vào đơn"><i class="fas fa-star"></i> Mới</span>';

                return `
                                            <tr class="${product.isExisting ? 'table-warning' : 'table-success'}">
                                                <td>
                                                    <div class="d-flex align-items-center gap-2">
                                                        ${product.imageUrl
                        ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">`
                        : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                        <div style="flex: 1;">
                                                            <div style="font-weight: 600; font-size: 14px;">${product.productName}</div>
                                                            <div style="font-size: 12px; color: #6b7280;">
                                                                ${product.productCode || 'N/A'}
                                                                ${statusBadge}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td class="text-center">
                                                    <span class="badge ${product.isExisting ? 'bg-warning text-dark' : 'bg-success'}">${product.count}</span>
                                                </td>
                                                <td>
                                                    ${formatNoteWithClickableEncoded(product.note)}
                                                </td>
                                            </tr>
                                        `}).join('')}
                                    </tbody>
                                </table>
                            </div>

                            <!-- Existing Products (RIGHT COLUMN) -->
                            <div class="col-md-6">
                                <h6 class="text-info">
                                    <i class="fas fa-box"></i> Sản phẩm có sẵn trong đơn (${existingProducts.length})
                                </h6>
                                ${existingProducts.length > 0 ? `
                                    <table class="table table-sm table-bordered">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Sản phẩm</th>
                                                <th class="text-center">SL</th>
                                                <th class="text-end">Giá</th>
                                                <th>Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${existingProducts.map(product => {
                            // Check if this product will be updated (exists in assigned products)
                            const willBeUpdated = !!assignedProductCounts[product.productId];
                            const updateBadge = willBeUpdated
                                ? '<span class="badge bg-warning text-dark ms-1" title="Sản phẩm này đã được cộng thêm số lượng"><i class="fas fa-arrow-up"></i></span>'
                                : '';

                            return `
                                                <tr class="${willBeUpdated ? 'table-warning' : ''}">
                                                    <td>
                                                        <div class="d-flex align-items-center gap-2">
                                                            ${product.imageUrl
                                    ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">`
                                    : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                            <div style="flex: 1;">
                                                                <div style="font-weight: 600; font-size: 14px;">${product.nameGet || product.name || 'N/A'}</div>
                                                                <div style="font-size: 12px; color: #6b7280;">${product.code || 'N/A'}${updateBadge}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td class="text-center">
                                                        <span class="badge bg-info">${product.quantity}</span>
                                                    </td>
                                                    <td class="text-end">
                                                        <span style="font-weight: 600; color: #3b82f6;">${(product.price || 0).toLocaleString('vi-VN')}đ</span>
                                                    </td>
                                                    <td>
                                                        ${formatNoteWithClickableEncoded(product.note)}
                                                    </td>
                                                </tr>
                                            `}).join('')}
                                        </tbody>
                                    </table>
                                ` : `
                                    <div class="text-center text-muted py-3 border rounded">
                                        <i class="fas fa-inbox fa-2x mb-2"></i>
                                        <p class="mb-0">Không có sản phẩm có sẵn</p>
                                        <small>(Tất cả sản phẩm đều là mới)</small>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        if (sortedSTTs.length === 0) {
            html = `
                <div class="alert alert-warning" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Không có dữ liệu để hiển thị</strong>
                    <p class="mb-0 mt-2">Bản ghi lịch sử này không chứa thông tin sản phẩm.</p>
                </div>
            `;
        }

        return html;
    }

    /**
     * Compare Cart History V2
     */
    window.compareCartHistoryV2 = async function (firebaseKey, userId = '') {
        console.log('[HISTORY-V2-COMPARE] 🔍 Comparing cart for firebaseKey:', firebaseKey, 'userId:', userId);

        try {
            const compareModal = new bootstrap.Modal(document.getElementById('compareCartHistoryV2Modal'));
            compareModal.show();

            const modalBody = document.getElementById('compareCartHistoryV2ModalBody');
            modalBody.innerHTML = `
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-2">Đang tải dữ liệu so sánh...</p>
                </div>
            `;

            // Xác định userId - fallback to 'guest' nếu không có
            const effectiveUserId = (userId && userId !== '') ? userId : 'guest';
            let historyPath = `productAssignments_v2_history/${effectiveUserId}`;
            console.log('[HISTORY-V2-COMPARE] Loading from path:', `${historyPath}/${firebaseKey}`);

            let snapshot = await database.ref(`${historyPath}/${firebaseKey}`).once('value');
            let record = snapshot.val();

            // Nếu không tìm thấy và userId khác guest, thử tìm ở guest
            if (!record && effectiveUserId !== 'guest') {
                console.log('[HISTORY-V2-COMPARE] ⚠️ Not found, trying guest path...');
                historyPath = 'productAssignments_v2_history/guest';
                snapshot = await database.ref(`${historyPath}/${firebaseKey}`).once('value');
                record = snapshot.val();
            }

            // Nếu vẫn không tìm thấy, thử với user hiện tại
            if (!record) {
                const currentUserPath = getUserFirebasePathV2('productAssignments_v2_history');
                if (currentUserPath !== historyPath) {
                    console.log('[HISTORY-V2-COMPARE] ⚠️ Not found, trying current user path:', currentUserPath);
                    snapshot = await database.ref(`${currentUserPath}/${firebaseKey}`).once('value');
                    record = snapshot.val();
                }
            }

            if (!record || !record.beforeSnapshot) {
                const errorInfo = { firebaseKey, userId: effectiveUserId };
                console.error('[HISTORY-V2-COMPARE] ❌ Record or snapshot not found:', errorInfo);
                throw new Error(`Không tìm thấy dữ liệu snapshot (key: ${firebaseKey.slice(-8)}, user: ${effectiveUserId})`);
            }

            console.log('[HISTORY-V2-COMPARE] ✅ Loaded record:', record);

            modalBody.innerHTML = renderComparisonContent(record);

        } catch (error) {
            console.error('[HISTORY-V2-COMPARE] ❌ Error:', error);
            showNotification('❌ Lỗi khi tải dữ liệu so sánh', 'error');

            const modalBody = document.getElementById('compareCartHistoryV2ModalBody');
            modalBody.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Lỗi:</strong> ${error.message}
                    <hr>
                    <small class="text-muted">
                        Có thể record này đã bị xóa hoặc không có snapshot.<br>
                        Thử chọn "Tất cả người dùng" trong bộ lọc và tìm lại.
                    </small>
                </div>
            `;
        }
    };

    /**
     * Save to upload history V2 (SEPARATE database: productAssignments_v2_history)
     * Called from saveToUploadHistory() - completely separate from tab-upload-tpos
     */
    async function saveToUploadHistoryV2(uploadId, results, status) {
        let historyRecord = null; // Defined outside try block for catch scope access

        try {
            console.log('[HISTORY-V2-SAVE] 💾 Saving to V2 database...');

            // Get current user ID (Safe access)
            const currentUserId = (window.userStorageManager && typeof window.userStorageManager.getUserIdentifier === 'function')
                ? window.userStorageManager.getUserIdentifier()
                : 'guest';

            // Get beforeSnapshot (current state before any deletions)
            const beforeSnapshot = {
                assignments: JSON.parse(JSON.stringify(assignments)),
                _timestamp: Date.now(),
                _version: 1
            };

            // Calculate total assignments and counts (like tab-upload-tpos)
            let totalAssignments = 0;
            let successfulAssignments = 0;
            let failedAssignments = 0;

            const uploadedSTTsSet = new Set(results.map(r => r.stt));
            const successfulSTTsSet = new Set(results.filter(r => r.success).map(r => r.stt));
            const failedSTTsSet = new Set(results.filter(r => !r.success).map(r => r.stt));

            if (beforeSnapshot && beforeSnapshot.assignments) {
                beforeSnapshot.assignments.forEach(assignment => {
                    if (assignment.sttList && Array.isArray(assignment.sttList)) {
                        assignment.sttList.forEach(sttItem => {
                            const stt = String(typeof sttItem === 'object' ? sttItem.stt : sttItem);
                            if (uploadedSTTsSet.has(stt)) {
                                totalAssignments++;
                                if (successfulSTTsSet.has(stt)) {
                                    successfulAssignments++;
                                } else if (failedSTTsSet.has(stt)) {
                                    failedAssignments++;
                                }
                            }
                        });
                    }
                });
            }

            // Build history record (GIỐNG 100% tab-upload-tpos structure)
            historyRecord = {
                uploadId: uploadId,
                timestamp: Date.now(),
                userId: currentUserId,

                // Snapshots
                beforeSnapshot: {
                    assignments: beforeSnapshot.assignments || [],
                    _timestamp: beforeSnapshot._timestamp,
                    _version: beforeSnapshot._version
                },
                afterSnapshot: null, // Tab3 doesn't track afterSnapshot (we delete immediately)

                // Upload details
                uploadedSTTs: results.map(r => r.stt),
                uploadResults: results.map(r => ({
                    stt: r.stt,
                    orderId: r.orderId,
                    success: r.success,
                    error: r.error || null,
                    existingProducts: r.existingProducts || []
                })),

                // Statistics
                totalSTTs: results.length,
                totalAssignments: totalAssignments,
                successCount: successfulAssignments,
                failCount: failedAssignments,

                // Status
                uploadStatus: status,
                canRestore: false,
                restoredAt: (status === 'failed') ? Date.now() : null,
                committedAt: null,

                // Metadata
                note: ""
            };

            // Save to V2 database path
            const historyPath = getUserFirebasePathV2('productAssignments_v2_history');
            console.log('[HISTORY-V2-SAVE] Saving to path:', `${historyPath}/${uploadId}`);
            await database.ref(`${historyPath}/${uploadId}`).set(historyRecord);

            console.log('[HISTORY-V2-SAVE] ✅ Saved to V2 database:', uploadId);

            // Clean up any pending backup for this uploadId (if previously failed but now succeeded)
            if (window.indexedDBStorage) {
                try {
                    await window.indexedDBStorage.removeItem(`pending_history_v2_${uploadId}`);
                } catch (e) { /* ignore */ }
            }

            return true;

        } catch (error) {
            console.error('[HISTORY-V2-SAVE] ❌ Error saving V2 history:', error);

            // Fallback: Save to IndexedDB for later retry
            try {
                if (window.indexedDBStorage) {
                    // Only save if historyRecord was successfully created
                    if (historyRecord) {
                        // Thêm thông tin lỗi vào record để có thể xem lại
                        historyRecord.saveError = {
                            message: error.message,
                            timestamp: Date.now(),
                            code: error.code || 'UNKNOWN'
                        };

                        const pendingRecord = {
                            uploadId: uploadId,
                            historyRecord: historyRecord,
                            error: error.message,
                            failedAt: Date.now(),
                            retryCount: 0
                        };
                        await window.indexedDBStorage.setItem(`pending_history_v2_${uploadId}`, pendingRecord);
                        console.log('[HISTORY-V2-SAVE] 💾 Saved to IndexedDB for later retry:', uploadId);
                        showNotification('⚠️ Lịch sử upload đã được lưu tạm. Sẽ đồng bộ lên server sau.', 'warning');
                    } else {
                        console.error('[HISTORY-V2-SAVE] Cannot save to IndexedDB because historyRecord is null');
                        showNotification('⚠️ Không thể lưu lịch sử upload (Dữ liệu bị lỗi).', 'error');
                    }
                } else {
                    showNotification('⚠️ Không thể lưu lịch sử upload. Vui lòng kiểm tra kết nối mạng.', 'error');
                }
            } catch (fallbackError) {
                console.error('[HISTORY-V2-SAVE] ❌ Fallback to IndexedDB also failed:', fallbackError);
                showNotification('⚠️ Không thể lưu lịch sử upload. Vui lòng kiểm tra kết nối mạng.', 'error');
            }

            return false;
        }
    }

    /**
     * Sync pending history records from IndexedDB to Firebase
     * Call this when user opens history modal or manually triggers sync
     */
    async function syncPendingHistoryV2() {
        if (!window.indexedDBStorage) {
            console.log('[HISTORY-V2-SYNC] IndexedDB not available');
            return { synced: 0, failed: 0, pending: 0 };
        }

        try {
            console.log('[HISTORY-V2-SYNC] 🔄 Checking for pending history records...');

            // Get all pending history keys
            const allKeys = await window.indexedDBStorage.getKeys('pending_history_v2_*');
            if (!allKeys || allKeys.length === 0) {
                console.log('[HISTORY-V2-SYNC] ✅ No pending records to sync');
                return { synced: 0, failed: 0, pending: 0 };
            }

            console.log(`[HISTORY-V2-SYNC] Found ${allKeys.length} pending records`);

            let synced = 0;
            let failed = 0;

            for (const key of allKeys) {
                try {
                    const pendingRecord = await window.indexedDBStorage.getItem(key);
                    if (!pendingRecord || !pendingRecord.historyRecord) {
                        // Invalid record, remove it
                        await window.indexedDBStorage.removeItem(key);
                        continue;
                    }

                    const { uploadId, historyRecord } = pendingRecord;
                    const historyPath = getUserFirebasePathV2('productAssignments_v2_history');

                    // Try to save to Firebase
                    await database.ref(`${historyPath}/${uploadId}`).set(historyRecord);

                    // Success! Remove from IndexedDB
                    await window.indexedDBStorage.removeItem(key);
                    synced++;
                    console.log(`[HISTORY-V2-SYNC] ✅ Synced: ${uploadId}`);

                } catch (syncError) {
                    console.error(`[HISTORY-V2-SYNC] ❌ Failed to sync ${key}:`, syncError);

                    // Update retry count
                    try {
                        const pendingRecord = await window.indexedDBStorage.getItem(key);
                        if (pendingRecord) {
                            pendingRecord.retryCount = (pendingRecord.retryCount || 0) + 1;
                            pendingRecord.lastRetryAt = Date.now();
                            pendingRecord.lastError = syncError.message;
                            await window.indexedDBStorage.setItem(key, pendingRecord);
                        }
                    } catch (e) { /* ignore */ }

                    failed++;
                }
            }

            const remaining = allKeys.length - synced;
            console.log(`[HISTORY-V2-SYNC] 📊 Result: ${synced} synced, ${failed} failed, ${remaining} remaining`);

            if (synced > 0) {
                showNotification(`✅ Đã đồng bộ ${synced} lịch sử upload lên server`, 'success');
            }

            return { synced, failed, pending: remaining };

        } catch (error) {
            console.error('[HISTORY-V2-SYNC] ❌ Error during sync:', error);
            return { synced: 0, failed: 0, pending: -1 };
        }
    }

    /**
     * Get count of pending history records
     */
    async function getPendingHistoryCount() {
        if (!window.indexedDBStorage) return 0;
        try {
            const keys = await window.indexedDBStorage.getKeys('pending_history_v2_*');
            return keys ? keys.length : 0;
        } catch (e) {
            return 0;
        }
    }

    // Expose sync function globally
    window.syncPendingHistoryV2 = syncPendingHistoryV2;
    window.getPendingHistoryCount = getPendingHistoryCount;

    // #region ═══════════════════════════════════════════════════════════════════
    // ║                 SECTION 12: PRODUCT REMOVAL FEATURE                     ║
    // ║                         search: #REMOVAL                                ║
    // #endregion ════════════════════════════════════════════════════════════════

    // ===================================================================
    // REMOVAL STATE
    // ===================================================================
    let removals = [];  // Array of removal items
    let removalUploadData = {};  // Compiled data for execution
    let currentRemovalViewMode = 'product';  // 'product' or 'order'
    let selectedRemovalSTTs = new Set();  // Selected STTs for removal

    // ===================================================================
    // MODAL CONTROLS
    // ===================================================================
    window.openRemoveProductModal = function () {
        const modalEl = document.getElementById('removeProductModal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        // Load removals from storage
        loadRemovals();
        renderRemovalTable();
    };

    window.closeRemoveProductModal = function () {
        const modalEl = document.getElementById('removeProductModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    };

    // ===================================================================
    // PRODUCT SEARCH FOR REMOVAL - CLONE 100% FROM MAIN UI
    // ===================================================================
    // Wrap in DOMContentLoaded to ensure modal HTML exists
    document.addEventListener('DOMContentLoaded', function () {
        // Product Search Input Handler (GIỐNG Y HỆT line 1571-1587)
        const removalSearchInput = document.getElementById('removalProductSearch');
        if (removalSearchInput) {
            removalSearchInput.addEventListener('input', (e) => {
                const searchText = e.target.value.trim();

                if (searchText.length >= 2) {
                    if (productsData.length === 0) {
                        loadProductsData().then(() => {
                            const results = searchProducts(searchText);
                            displayRemovalProductSuggestions(results);
                        });
                    } else {
                        const results = searchProducts(searchText);
                        displayRemovalProductSuggestions(results);
                    }
                } else {
                    const suggestionsEl = document.getElementById('removalProductSuggestions');
                    if (suggestionsEl) {
                        suggestionsEl.classList.remove('show');
                    }
                }
            });
        }

        // Close suggestions when clicking outside (GIỐNG Y HỆT line 1590-1594)
        document.addEventListener('click', (e) => {
            const removalModal = document.getElementById('removeProductModal');
            if (removalModal && removalModal.classList.contains('show')) {
                if (!e.target.closest('#removeProductModal .search-wrapper')) {
                    const suggestionsEl = document.getElementById('removalProductSuggestions');
                    if (suggestionsEl) {
                        suggestionsEl.classList.remove('show');
                    }
                }
            }
        });
    });

    // ===================================================================
    // STORAGE FUNCTIONS
    // ===================================================================
    function saveRemovals(immediate = false) {
        const saveAction = () => {
            try {
                localStorage.setItem('orders_productRemovals', JSON.stringify({
                    removals: removals,
                    _timestamp: Date.now(),
                    _version: 1
                }));
                console.log('[REMOVAL-SAVE] ✅ Saved', removals.length, 'removals to localStorage');
            } catch (error) {
                console.error('[REMOVAL-SAVE] Error:', error);
            }
        };

        if (immediate) {
            if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
            saveAction();
        } else {
            if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
            saveDebounceTimer = setTimeout(saveAction, 500);
        }
    }

    function loadRemovals() {
        try {
            const saved = localStorage.getItem('orders_productRemovals');
            if (saved) {
                const data = JSON.parse(saved);
                removals = data.removals || [];
                console.log('[REMOVAL-LOAD] Loaded', removals.length, 'removals from localStorage');
            }
        } catch (error) {
            console.error('[REMOVAL-LOAD] Error:', error);
            removals = [];
        }
    }

    // ===================================================================
    // DISPLAY REMOVAL PRODUCT SUGGESTIONS - CLONE 100% FROM LINE 545-570
    // ===================================================================
    function displayRemovalProductSuggestions(suggestions) {
        const suggestionsDiv = document.getElementById('removalProductSuggestions');

        if (suggestions.length === 0) {
            suggestionsDiv.classList.remove('show');
            return;
        }

        suggestionsDiv.innerHTML = suggestions.map(product => `
            <div class="suggestion-item" data-id="${product.id}">
                <span class="product-code">${product.code || 'N/A'}</span>
                <span class="product-name">${product.name}</span>
            </div>
        `).join('');

        suggestionsDiv.classList.add('show');

        suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', async () => {
                const productId = item.dataset.id;
                await addProductToRemoval(productId);
                suggestionsDiv.classList.remove('show');
                document.getElementById('removalProductSearch').value = '';
            });
        });
    }

    // ===================================================================
    // ADD PRODUCT TO REMOVAL - CLONE 100% FROM addProductToAssignment (line 624-760)
    // ===================================================================
    async function addProductToRemoval(productId) {
        try {
            // Load product details (GIỐNG Y HỆT line 627-635)
            const response = await authenticatedFetch(
                `${API_CONFIG.WORKER_URL}/api/odata/Product(${productId})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues`
            );

            if (!response.ok) {
                throw new Error('Không thể tải thông tin sản phẩm');
            }

            const productData = await response.json();
            let imageUrl = productData.ImageUrl;
            let templateData = null;

            // Load template to get image and variants (GIỐNG Y HỆT line 640-655)
            if (productData.ProductTmplId) {
                try {
                    const templateResponse = await authenticatedFetch(
                        `${API_CONFIG.WORKER_URL}/api/odata/ProductTemplate(${productData.ProductTmplId})?$expand=UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues)`
                    );

                    if (templateResponse.ok) {
                        templateData = await templateResponse.json();
                        if (!imageUrl) {
                            imageUrl = templateData.ImageUrl;
                        }
                    }
                } catch (error) {
                    console.error('Error loading template:', error);
                }
            }

            // Check if auto-add variants is enabled and variants exist (GIỐNG Y HỆT line 658-760)
            if (autoAddVariants && templateData && templateData.ProductVariants && templateData.ProductVariants.length > 0) {
                // Filter only active variants (Active === true)
                const activeVariants = templateData.ProductVariants.filter(v => v.Active === true);

                // Sort variants
                const sortedVariants = sortVariants(activeVariants);

                // Check if there are active variants after filtering
                if (sortedVariants.length === 0) {
                    // No active variants, fallback to single product
                    const existingIndex = removals.findIndex(a => a.productId === productData.Id);
                    if (existingIndex !== -1) {
                        showNotification('Sản phẩm đã có trong danh sách', 'error');
                        return;
                    }

                    // Add single product to removals
                    const productCode = extractProductCode(productData.NameGet) || productData.DefaultCode || productData.Barcode || '';
                    const removal = {
                        id: Date.now(),
                        productId: productData.Id,
                        productName: productData.NameGet,
                        productCode: productCode,
                        imageUrl: imageUrl,
                        sttList: []
                    };

                    removals.push(removal);
                    saveRemovals();
                    renderRemovalTable();
                    showNotification('Đã thêm sản phẩm vào danh sách');
                    return;
                }

                // Add all variants to removals
                let addedCount = 0;
                let skippedCount = 0;

                for (const variant of sortedVariants) {
                    // Check if variant already in removals
                    const existingIndex = removals.findIndex(a => a.productId === variant.Id);
                    if (existingIndex !== -1) {
                        skippedCount++;
                        continue;
                    }

                    const variantImageUrl = variant.ImageUrl || imageUrl;
                    const productCode = extractProductCode(variant.NameGet) || variant.DefaultCode || variant.Barcode || '';

                    const removal = {
                        id: Date.now() + addedCount,
                        productId: variant.Id,
                        productName: variant.NameGet,
                        productCode: productCode,
                        imageUrl: variantImageUrl,
                        sttList: []
                    };

                    removals.push(removal);
                    addedCount++;
                }

                saveRemovals();
                renderRemovalTable();

                if (addedCount > 0) {
                    showNotification(`Đã thêm ${addedCount} biến thể${skippedCount > 0 ? ` (${skippedCount} đã tồn tại)` : ''}`);
                } else if (skippedCount > 0) {
                    showNotification('Tất cả biến thể đã có trong danh sách', 'error');
                }
            } else {
                // No auto-add variants or no variants - add single product
                const existingIndex = removals.findIndex(a => a.productId === productData.Id);
                if (existingIndex !== -1) {
                    showNotification('Sản phẩm đã có trong danh sách', 'error');
                    return;
                }

                const productCode = extractProductCode(productData.NameGet) || productData.DefaultCode || productData.Barcode || '';
                const removal = {
                    id: Date.now(),
                    productId: productData.Id,
                    productName: productData.NameGet,
                    productCode: productCode,
                    imageUrl: imageUrl,
                    sttList: []
                };

                removals.push(removal);
                saveRemovals();
                renderRemovalTable();
                showNotification('Đã thêm sản phẩm vào danh sách');
            }

        } catch (error) {
            console.error('Error adding product to removal:', error);
            showNotification('Lỗi: ' + error.message, 'error');
        }
    }

    // ===================================================================
    // RENDER REMOVAL TABLE
    // ===================================================================
    function renderRemovalTable() {
        const tbody = document.getElementById('removalTableBody');
        const countEl = document.getElementById('removalCount');

        if (!removals || removals.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-muted py-4">
                        <i class="fas fa-inbox fa-3x mb-2"></i>
                        <p class="mb-0">Chưa có sản phẩm nào</p>
                        <small>Vui lòng tìm kiếm và thêm sản phẩm cần gỡ</small>
                    </td>
                </tr>
            `;
            countEl.textContent = '0';
            return;
        }

        let html = '';
        removals.forEach(removal => {
            const sttCount = removal.sttList ? removal.sttList.length : 0;
            const totalQty = removal.sttList ? removal.sttList.reduce((sum, item) => {
                return sum + (item.currentProductDetails?.currentQuantity || 0);
            }, 0) : 0;

            html += `
                <tr>
                    <td>
                        <div class="d-flex align-items-center gap-2">
                            ${removal.imageUrl ? `<img src="${removal.imageUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">` : '<div style="width:40px;height:40px;background:#e5e7eb;border-radius:4px;display:flex;align-items:center;justify-content:center;">📦</div>'}
                            <div>
                                <div style="font-weight:600;">${removal.productName}</div>
                                <div style="font-size:12px;color:#6b7280;">${removal.productCode}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        ${sttCount > 0 ? `
                            <div class="d-flex flex-wrap gap-1">
                                ${removal.sttList.map((item, index) => `
                                    <span class="badge bg-secondary position-relative">
                                        ${item.stt}
                                        <button type="button" class="btn-close btn-close-white ms-1"
                                            style="font-size:8px;vertical-align:middle;"
                                            onclick="removeSTTFromRemoval(${removal.id}, ${index})"
                                            title="Xóa STT này"></button>
                                    </span>
                                `).join('')}
                            </div>
                            <div class="mt-2">
                                <input type="text" class="form-control form-control-sm"
                                    placeholder="Nhập STT để thêm..."
                                    onkeypress="if(event.key==='Enter'){addSTTToRemoval(${removal.id}, this.value); this.value='';}"
                                    style="max-width:200px;">
                            </div>
                        ` : `
                            <input type="text" class="form-control form-control-sm"
                                placeholder="Nhập STT để thêm..."
                                onkeypress="if(event.key==='Enter'){addSTTToRemoval(${removal.id}, this.value); this.value='';}"
                                style="max-width:200px;">
                        `}
                    </td>
                    <td class="text-center">
                        ${sttCount > 0 ? `<span class="badge bg-info">${totalQty}</span>` : '-'}
                    </td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-danger" onclick="removeProductFromRemovalList(${removal.id})" title="Xóa sản phẩm">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        countEl.textContent = removals.length;
    }

    // ===================================================================
    // ADD STT TO REMOVAL
    // ===================================================================
    window.addSTTToRemoval = async function (removalId, stt) {
        if (!stt || !stt.trim()) return;

        stt = stt.trim();

        try {
            const removal = removals.find(r => r.id === removalId);
            if (!removal) {
                showNotification('❌ Không tìm thấy sản phẩm', 'error');
                return;
            }

            // Check if STT already exists
            if (removal.sttList.some(item => item.stt === stt)) {
                showNotification('⚠️ STT đã tồn tại', 'warning');
                return;
            }

            // Find order by STT (try ordersData first, then fetch directly)
            let order = ordersData.find(o => o.stt && o.stt.toString() === stt);
            let orderId = null;

            if (!order) {
                // If not in ordersData, try fetching directly by STT
                console.log(`[ADD-STT-REMOVAL] Order ${stt} not in cache, fetching by STT...`);
                try {
                    const sttSearchResponse = await authenticatedFetch(
                        `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order?$filter=STT eq '${stt}'`
                    );
                    if (sttSearchResponse.ok) {
                        const sttSearchData = await sttSearchResponse.json();
                        if (sttSearchData.value && sttSearchData.value.length > 0) {
                            orderId = sttSearchData.value[0].Id;
                            console.log(`[ADD-STT-REMOVAL] Found order ID ${orderId} for STT ${stt}`);
                        }
                    }
                } catch (err) {
                    console.error('[ADD-STT-REMOVAL] Error searching by STT:', err);
                }

                if (!orderId) {
                    showNotification(`⚠️ Không tìm thấy đơn hàng ${stt}`, 'warning');
                    return;
                }
            } else {
                orderId = order.orderId;
            }

            // Fetch full order details with products
            const response = await authenticatedFetch(
                `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product)`
            );

            if (!response.ok) {
                throw new Error('Failed to fetch order');
            }

            const orderData = await response.json();

            // Find product in order details
            const productInOrder = orderData.Details?.find(d => d.ProductId === removal.productId);

            // Add to sttList
            removal.sttList.push({
                stt: stt,
                orderId: orderId,
                orderInfo: {
                    CustomerName: orderData.CustomerName || 'N/A',
                    Mobile: orderData.Mobile || '',
                    TotalAmount: orderData.TotalAmount || 0
                },
                currentProductDetails: productInOrder ? {
                    currentQuantity: productInOrder.Quantity || 0,
                    unitPrice: productInOrder.Price || 0,
                    detailId: productInOrder.Id,
                    canRemove: true
                } : {
                    canRemove: false,
                    reason: 'Sản phẩm không có trong đơn'
                }
            });

            saveRemovals();
            renderRemovalTable();

            if (!productInOrder) {
                showNotification(`⚠️ Đã thêm STT ${stt} nhưng sản phẩm không có trong đơn (sẽ bỏ qua khi gỡ)`, 'warning');
            } else {
                showNotification(`✅ Đã thêm STT ${stt} (SL hiện tại: ${productInOrder.Quantity})`, 'success');
            }

        } catch (error) {
            console.error('[ADD-STT-REMOVAL] Error:', error);
            showNotification('❌ Lỗi: ' + error.message, 'error');
        }
    };

    // ===================================================================
    // REMOVE STT FROM REMOVAL
    // ===================================================================
    window.removeSTTFromRemoval = function (removalId, index) {
        const removal = removals.find(r => r.id === removalId);
        if (!removal || !removal.sttList) return;

        const stt = removal.sttList[index].stt;
        removal.sttList.splice(index, 1);

        saveRemovals(true);
        renderRemovalTable();
        showNotification(`🗑️ Đã xóa STT ${stt}`, 'success');
    };

    // ===================================================================
    // REMOVE PRODUCT FROM REMOVAL LIST
    // ===================================================================
    window.removeProductFromRemovalList = function (removalId) {
        if (!confirm('Bạn có chắc muốn xóa sản phẩm này khỏi danh sách gỡ?')) return;

        removals = removals.filter(r => r.id !== removalId);
        saveRemovals(true);
        renderRemovalTable();
        showNotification('✅ Đã xóa sản phẩm', 'success');
    };

    // ===================================================================
    // CLEAR ALL REMOVALS
    // ===================================================================
    window.clearAllRemovals = function () {
        if (!confirm('Bạn có chắc muốn xóa tất cả sản phẩm trong danh sách gỡ?')) return;

        removals = [];
        saveRemovals(true);
        renderRemovalTable();
        showNotification('✅ Đã xóa tất cả', 'success');
    };

    // ===================================================================
    // BUILD REMOVAL DATA
    // ===================================================================
    function buildRemovalData() {
        removalUploadData = {};

        removals.forEach(removal => {
            if (!removal.sttList) return;

            removal.sttList.forEach(sttItem => {
                const stt = sttItem.stt;

                if (!removalUploadData[stt]) {
                    removalUploadData[stt] = {
                        stt: stt,
                        orderId: sttItem.orderId,
                        orderInfo: sttItem.orderInfo,
                        products: []
                    };
                }

                const current = sttItem.currentProductDetails?.currentQuantity || 0;
                const after = current > 1 ? current - 1 : 0;

                removalUploadData[stt].products.push({
                    productId: removal.productId,
                    productName: removal.productName,
                    productCode: removal.productCode,
                    imageUrl: removal.imageUrl,
                    currentQuantity: current,
                    removeQuantity: 1,
                    afterQuantity: after,
                    action: after === 0 ? 'remove' : 'decrease',
                    canRemove: sttItem.currentProductDetails?.canRemove || false,
                    skipReason: sttItem.currentProductDetails?.reason || null
                });
            });
        });

        console.log('[BUILD-REMOVAL-DATA]', removalUploadData);
    }

    // ===================================================================
    // PREVIEW REMOVAL
    // ===================================================================
    window.previewRemoval = function () {
        buildRemovalData();

        const stts = Object.keys(removalUploadData);
        if (stts.length === 0) {
            showNotification('⚠️ Chưa có sản phẩm nào để gỡ', 'warning');
            return;
        }

        // Show preview card
        document.getElementById('removalPreviewCard').style.display = 'block';
        document.getElementById('executeRemovalBtn').style.display = 'inline-block';

        // Initialize selected STTs
        selectedRemovalSTTs = new Set(stts);

        // Render preview
        renderRemovalPreview();
    };

    window.switchRemovalViewMode = function (mode) {
        currentRemovalViewMode = mode;

        // Update button states
        document.getElementById('removalViewByProduct').classList.toggle('active', mode === 'product');
        document.getElementById('removalViewByOrder').classList.toggle('active', mode === 'order');

        renderRemovalPreview();
    };

    function renderRemovalPreview() {
        const previewArea = document.getElementById('removalPreviewArea');
        const stts = Array.from(selectedRemovalSTTs);

        let html = '';

        if (currentRemovalViewMode === 'order') {
            // View by order
            stts.forEach(stt => {
                const data = removalUploadData[stt];
                if (!data) return;

                const canRemoveCount = data.products.filter(p => p.canRemove).length;
                const skipCount = data.products.filter(p => !p.canRemove).length;

                html += `
                    <div class="card mb-3">
                        <div class="card-header bg-light d-flex justify-content-between align-items-center">
                            <div>
                                <input type="checkbox" class="form-check-input me-2"
                                    ${selectedRemovalSTTs.has(stt) ? 'checked' : ''}
                                    onchange="toggleRemovalSTT('${stt}', this.checked)">
                                <strong>STT: ${stt}</strong>
                                <span class="text-muted ms-2">${data.orderInfo.CustomerName}</span>
                            </div>
                            <span class="badge ${skipCount > 0 ? 'bg-warning' : 'bg-success'}">${canRemoveCount} sản phẩm</span>
                        </div>
                        <div class="card-body">
                            <table class="table table-sm table-bordered mb-0">
                                <thead>
                                    <tr>
                                        <th>Sản phẩm</th>
                                        <th class="text-center">SL Hiện tại</th>
                                        <th class="text-center">Gỡ</th>
                                        <th class="text-center">Còn lại</th>
                                        <th>Trạng thái</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.products.map(p => {
                    const statusIcon = p.canRemove ? '✅' : '⚠️';
                    const statusText = p.canRemove
                        ? (p.action === 'remove' ? 'Xóa hoàn toàn' : 'Giảm số lượng')
                        : (p.skipReason || 'Bỏ qua');
                    const rowClass = p.canRemove ? '' : 'table-warning';

                    return `
                                            <tr class="${rowClass}">
                                                <td>
                                                    <div class="d-flex align-items-center gap-2">
                                                        ${p.imageUrl ? `<img src="${p.imageUrl}" style="width:30px;height:30px;object-fit:cover;border-radius:4px;">` : '📦'}
                                                        <div>
                                                            <div style="font-size:13px;font-weight:600;">${p.productName}</div>
                                                            <div style="font-size:11px;color:#666;">${p.productCode}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td class="text-center"><strong>${p.currentQuantity}</strong></td>
                                                <td class="text-center text-danger"><strong>-1</strong></td>
                                                <td class="text-center"><strong>${p.afterQuantity}</strong></td>
                                                <td><small>${statusIcon} ${statusText}</small></td>
                                            </tr>
                                        `;
                }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            });
        } else {
            // View by product
            const productGroups = {};

            stts.forEach(stt => {
                const data = removalUploadData[stt];
                if (!data) return;

                data.products.forEach(p => {
                    if (!productGroups[p.productId]) {
                        productGroups[p.productId] = {
                            product: p,
                            stts: []
                        };
                    }
                    productGroups[p.productId].stts.push({
                        stt: stt,
                        ...p
                    });
                });
            });

            Object.values(productGroups).forEach(group => {
                const p = group.product;
                const canRemoveCount = group.stts.filter(s => s.canRemove).length;
                const totalQty = group.stts.reduce((sum, s) => sum + s.currentQuantity, 0);

                html += `
                    <div class="card mb-3">
                        <div class="card-header bg-light">
                            <div class="d-flex align-items-center gap-2">
                                ${p.imageUrl ? `<img src="${p.imageUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">` : '<div style="width:40px;height:40px;background:#e5e7eb;border-radius:4px;display:flex;align-items:center;justify-content:center;">📦</div>'}
                                <div>
                                    <strong>${p.productName}</strong>
                                    <div class="text-muted" style="font-size:12px;">${p.productCode}</div>
                                </div>
                                <span class="badge bg-info ms-auto">${group.stts.length} đơn</span>
                                <span class="badge bg-secondary">Tổng SL: ${totalQty}</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <table class="table table-sm table-bordered mb-0">
                                <thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>Khách hàng</th>
                                        <th class="text-center">SL Hiện tại</th>
                                        <th class="text-center">Sau khi gỡ</th>
                                        <th>Trạng thái</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${group.stts.map(s => {
                    const orderInfo = removalUploadData[s.stt].orderInfo;
                    const statusIcon = s.canRemove ? '✅' : '⚠️';
                    const statusText = s.canRemove
                        ? (s.action === 'remove' ? 'Xóa' : 'Giảm')
                        : 'Bỏ qua';
                    const rowClass = s.canRemove ? '' : 'table-warning';

                    return `
                                            <tr class="${rowClass}">
                                                <td><strong>${s.stt}</strong></td>
                                                <td>${orderInfo.CustomerName}</td>
                                                <td class="text-center">${s.currentQuantity}</td>
                                                <td class="text-center">${s.afterQuantity}</td>
                                                <td><small>${statusIcon} ${statusText}</small></td>
                                            </tr>
                                        `;
                }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            });
        }

        previewArea.innerHTML = html || '<div class="alert alert-warning">Không có dữ liệu</div>';

        // Update selection summary
        document.getElementById('removalSelectionSummary').style.display = 'block';
        document.getElementById('removalSelectedCount').textContent = selectedRemovalSTTs.size;
    }

    window.toggleRemovalSTT = function (stt, checked) {
        if (checked) {
            selectedRemovalSTTs.add(stt);
        } else {
            selectedRemovalSTTs.delete(stt);
        }
        renderRemovalPreview();
    };

    // ===================================================================
    // EXECUTE REMOVAL - MAIN FUNCTION
    // ===================================================================
    window.executeRemoval = async function () {
        const stts = Array.from(selectedRemovalSTTs);

        if (stts.length === 0) {
            showNotification('⚠️ Vui lòng chọn ít nhất 1 STT để gỡ sản phẩm', 'warning');
            return;
        }

        const confirmMsg = `Bạn có chắc muốn gỡ sản phẩm khỏi ${stts.length} đơn hàng?\n\nLưu ý: Thao tác này không thể hoàn tác!`;
        if (!confirm(confirmMsg)) return;

        // Show progress modal
        const progressModal = new bootstrap.Modal(document.getElementById('removalProgressModal'));
        progressModal.show();

        let results = {
            success: [],
            failed: [],
            skipped: []
        };

        // Process each STT
        for (let i = 0; i < stts.length; i++) {
            const stt = stts[i];

            document.getElementById('removalProgressText').textContent = `Đang gỡ sản phẩm khỏi STT ${stt}...`;
            document.getElementById('removalProgressDetail').textContent = `${i + 1} / ${stts.length}`;

            const result = await removeSingleSTT(stt);

            if (result.success) {
                results.success.push(result);
            } else {
                results.failed.push(result);
            }

            if (result.skippedProducts && result.skippedProducts.length > 0) {
                results.skipped.push(...result.skippedProducts.map(p => ({
                    stt: stt,
                    ...p
                })));
            }
        }

        // Hide progress modal
        progressModal.hide();

        // Show results
        showRemovalResults(results);

        // Save to history
        await saveRemovalHistory({
            timestamp: Date.now(),
            results: results,
            totalSTTs: stts.length,
            successCount: results.success.length,
            failedCount: results.failed.length,
            skippedCount: results.skipped.length
        });

        // Remove successful STTs from removals
        if (results.success.length > 0) {
            removeProcessedSTTsFromRemovals(results.success.map(r => r.stt));
        }

        // Refresh table
        renderRemovalTable();
    };

    // ===================================================================
    // REMOVE SINGLE STT - CORE LOGIC
    // ===================================================================
    async function removeSingleSTT(stt) {
        try {
            const sessionData = removalUploadData[stt];
            if (!sessionData) {
                throw new Error('STT data not found');
            }

            const orderId = sessionData.orderId;
            if (!orderId) {
                throw new Error('No order ID for this STT');
            }

            console.log(`[REMOVAL] 📡 Fetching order ${orderId} for STT ${stt}...`);

            // Fetch current order data using authenticatedFetch
            const response = await authenticatedFetch(
                `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product),Partner,User,CRMTeam`
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch order ${orderId}: ${response.status}`);
            }

            const orderData = await response.json();
            console.log(`[REMOVAL] ✅ Fetched order data for STT ${stt}`);

            // Process each product to remove
            let removedProducts = [];
            let skippedProducts = [];
            let totalQuantityChange = 0;

            for (const product of sessionData.products) {
                // Skip if cannot remove
                if (!product.canRemove) {
                    skippedProducts.push({
                        productId: product.productId,
                        productName: product.productName,
                        productCode: product.productCode,
                        reason: product.skipReason || 'Sản phẩm không có trong đơn'
                    });
                    continue;
                }

                // Find product in Details
                const detailIndex = orderData.Details.findIndex(
                    d => d.ProductId === product.productId
                );

                if (detailIndex === -1) {
                    skippedProducts.push({
                        productId: product.productId,
                        productName: product.productName,
                        productCode: product.productCode,
                        reason: 'Sản phẩm không tồn tại trong đơn'
                    });
                    continue;
                }

                const detail = orderData.Details[detailIndex];
                const currentQty = detail.Quantity;

                // Handle quantity
                if (currentQty > 1) {
                    // Decrease by 1
                    orderData.Details[detailIndex].Quantity = currentQty - 1;
                    totalQuantityChange -= 1;

                    removedProducts.push({
                        productId: product.productId,
                        productName: product.productName,
                        productCode: product.productCode,
                        action: 'decreased',
                        from: currentQty,
                        to: currentQty - 1
                    });
                } else {
                    // Remove completely
                    orderData.Details.splice(detailIndex, 1);
                    totalQuantityChange -= 1;

                    removedProducts.push({
                        productId: product.productId,
                        productName: product.productName,
                        productCode: product.productCode,
                        action: 'removed',
                        quantity: 1
                    });
                }
            }

            // If no products were removed, skip this order
            if (removedProducts.length === 0) {
                return {
                    success: false,
                    stt: stt,
                    orderId: orderId,
                    error: 'Không có sản phẩm nào để gỡ',
                    skippedProducts: skippedProducts
                };
            }

            // Update totals (let TPOS recalculate amounts)
            orderData.TotalQuantity = (orderData.TotalQuantity || 0) + totalQuantityChange;
            orderData.TotalAmount = 0;

            // Update Note field
            orderData.Note = processNoteForRemoval(orderData.Note || '', removedProducts);

            // Prepare payload
            const payload = prepareUploadPayload(orderData);

            console.log(`[REMOVAL] 📤 Updating order ${orderId}...`);

            // PUT request using authenticatedFetch
            const uploadResponse = await authenticatedFetch(
                `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order(${orderId})`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload)
                }
            );

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
            }

            console.log(`[REMOVAL] ✅ Successfully removed products from STT ${stt}`);

            return {
                success: true,
                stt: stt,
                orderId: orderId,
                removedProducts: removedProducts,
                skippedProducts: skippedProducts,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error(`[REMOVAL] ❌ Error removing from STT ${stt}:`, error);
            return {
                success: false,
                stt: stt,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    // ===================================================================
    // PROCESS NOTE FOR REMOVAL
    // ===================================================================
    function processNoteForRemoval(currentNote, removedProducts) {
        if (!currentNote || !currentNote.trim()) return '';

        let plainTextOutside = '';
        let decodedContent = '';

        // Extract and decode note
        if (currentNote && currentNote.trim() !== '') {
            const { plainText, encodedContent } = extractNoteComponents(currentNote);
            plainTextOutside = plainText;

            if (encodedContent) {
                decodedContent = decodeFullNote(encodedContent) || '';
            } else {
                const decoded = decodeFullNote(currentNote);
                if (decoded) {
                    decodedContent = decoded;
                    plainTextOutside = '';
                } else {
                    decodedContent = currentNote;
                    plainTextOutside = '';
                }
            }
        }

        console.log('[REMOVAL-NOTE] Decoded content:', decodedContent);

        // Parse note lines and remove/update products
        const lines = decodedContent.split('\n');
        const updatedLines = [];

        for (const line of lines) {
            if (!line || !line.trim()) continue;

            // Parse line format: "PRODUCT_CODE - QUANTITY - PRICE"
            const match = line.match(/^(.+?)\s*-\s*(\d+)\s*-\s*(.+)$/);

            if (match) {
                const [, productCode, quantity, price] = match;
                const productCodeTrimmed = productCode.trim();

                // Check if this product should be removed/decreased
                const removed = removedProducts.find(p =>
                    p.productCode === productCodeTrimmed
                );

                if (removed) {
                    if (removed.action === 'decreased') {
                        // Decrease quantity
                        const newQty = parseInt(quantity) - 1;
                        if (newQty > 0) {
                            updatedLines.push(`${productCodeTrimmed} - ${newQty} - ${price.trim()}`);
                        }
                        // If newQty === 0, don't add line (remove it)
                    }
                    // If action === 'removed', skip this line entirely
                } else {
                    // Keep line unchanged
                    updatedLines.push(line);
                }
            } else {
                // Not a product line, keep it
                updatedLines.push(line);
            }
        }

        const updatedContent = updatedLines.join('\n');
        console.log('[REMOVAL-NOTE] Updated content:', updatedContent);

        // Encode back
        let finalNote = '';
        if (updatedContent.trim() !== '') {
            const encoded = encodeFullNote(updatedContent);
            if (plainTextOutside.trim() !== '') {
                finalNote = `${plainTextOutside}\n${encoded}`;
            } else {
                finalNote = encoded;
            }
        } else if (plainTextOutside.trim() !== '') {
            finalNote = plainTextOutside;
        }

        return finalNote;
    }

    // ===================================================================
    // SHOW REMOVAL RESULTS
    // ===================================================================
    function showRemovalResults(results) {
        const resultsBody = document.getElementById('removalResultsBody');

        let html = '<div class="removal-results">';

        // Summary
        html += `
            <div class="row mb-4 text-center">
                <div class="col-md-4">
                    <div class="card border-success">
                        <div class="card-body">
                            <h3 class="text-success">${results.success.length}</h3>
                            <p class="mb-0">✅ Thành công</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-danger">
                        <div class="card-body">
                            <h3 class="text-danger">${results.failed.length}</h3>
                            <p class="mb-0">❌ Thất bại</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-warning">
                        <div class="card-body">
                            <h3 class="text-warning">${results.skipped.length}</h3>
                            <p class="mb-0">⚠️ Bỏ qua</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Success details
        if (results.success.length > 0) {
            html += '<h5 class="text-success">✅ Đơn hàng đã gỡ thành công:</h5>';
            html += '<div class="list-group mb-4">';
            results.success.forEach(r => {
                const removedCount = r.removedProducts.length;
                const skippedCount = r.skippedProducts?.length || 0;

                html += `
                    <div class="list-group-item">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <strong>STT ${r.stt}</strong>
                            <span class="badge bg-success">${removedCount} sản phẩm đã gỡ</span>
                        </div>
                        <ul class="mb-0" style="font-size:13px;">
                            ${r.removedProducts.map(p => {
                    if (p.action === 'removed') {
                        return `<li>${p.productCode}: <strong>Đã xóa hoàn toàn</strong></li>`;
                    } else {
                        return `<li>${p.productCode}: Giảm từ <strong>${p.from}</strong> → <strong>${p.to}</strong></li>`;
                    }
                }).join('')}
                        </ul>
                        ${skippedCount > 0 ? `<small class="text-muted">(${skippedCount} sản phẩm bỏ qua)</small>` : ''}
                    </div>
                `;
            });
            html += '</div>';
        }

        // Failed details
        if (results.failed.length > 0) {
            html += '<h5 class="text-danger">❌ Đơn hàng thất bại:</h5>';
            html += '<div class="list-group mb-4">';
            results.failed.forEach(r => {
                html += `
                    <div class="list-group-item list-group-item-danger">
                        <strong>STT ${r.stt}:</strong> ${r.error}
                    </div>
                `;
            });
            html += '</div>';
        }

        // Skipped products
        if (results.skipped.length > 0) {
            html += '<h5 class="text-warning">⚠️ Sản phẩm bỏ qua (không có trong đơn):</h5>';
            html += '<div class="list-group mb-4">';
            results.skipped.forEach(s => {
                html += `
                    <div class="list-group-item list-group-item-warning">
                        <strong>STT ${s.stt}</strong> - ${s.productName} (${s.productCode}): ${s.reason}
                    </div>
                `;
            });
            html += '</div>';
        }

        html += '</div>';

        resultsBody.innerHTML = html;

        // Show results modal
        const resultsModal = new bootstrap.Modal(document.getElementById('removalResultsModal'));
        resultsModal.show();
    }

    // ===================================================================
    // REMOVE PROCESSED STTs FROM REMOVALS
    // ===================================================================
    function removeProcessedSTTsFromRemovals(successfulSTTs) {
        removals.forEach(removal => {
            if (!removal.sttList) return;

            // Remove STTs that were successfully processed
            removal.sttList = removal.sttList.filter(item =>
                !successfulSTTs.includes(item.stt)
            );
        });

        // Remove removals that have no STTs left
        removals = removals.filter(r => r.sttList && r.sttList.length > 0);

        saveRemovals(true);
    }

    // ===================================================================
    // SAVE REMOVAL HISTORY TO FIREBASE
    // ===================================================================
    async function saveRemovalHistory(historyData) {
        try {
            const user = firebase.auth().currentUser;
            if (!user) return;

            const historyId = `removal_${Date.now()}`;

            await database.ref(`productRemovals_history/${user.uid}/${historyId}`).set({
                ...historyData,
                userId: user.uid,
                userEmail: user.email
            });

            console.log('[REMOVAL-HISTORY] ✅ Saved history:', historyId);

        } catch (error) {
            console.error('[REMOVAL-HISTORY] ❌ Error saving history:', error);
        }
    }

})();