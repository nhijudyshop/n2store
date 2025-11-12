// Product Assignment Tab JavaScript
(function() {
    'use strict';

    // State
    let productsData = [];
    let ordersData = [];
    let assignments = [];
    let savedProducts = []; // Products from product-search
    let isLoadingProducts = false;
    let bearerToken = null;
    let tokenExpiry = null;
    let saveDebounceTimer = null;

    // Firebase Configuration
    const firebaseConfig = {
        apiKey: "AIzaSyD2izLYXLYWR8RtsIS7vvQWroPPtxi_50A",
        authDomain: "product-s-98d2c.firebaseapp.com",
        databaseURL: "https://product-s-98d2c-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "product-s-98d2c",
        storageBucket: "product-s-98d2c.firebasestorage.app",
        messagingSenderId: "692514176406",
        appId: "1:692514176406:web:429fb683b8905e10e131b7",
        measurementId: "G-MXT4TJK349"
    };

    // Initialize Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const database = firebase.database();

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

    // Auth Functions
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

            return bearerToken;
        } catch (error) {
            console.error('Lỗi xác thực:', error);
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
            // Try to get from localStorage first
            const cachedOrders = localStorage.getItem('ordersData');
            if (cachedOrders) {
                ordersData = JSON.parse(cachedOrders);
                console.log(`📦 Đã load ${ordersData.length} đơn hàng từ cache`);
            } else {
                console.log('⚠️ Chưa có orders data trong cache, đang request từ tab1...');
            }

            // Always request fresh data from tab1
            requestOrdersDataFromTab1();
        } catch (error) {
            console.error('Error loading orders:', error);
            ordersData = [];
            requestOrdersDataFromTab1();
        }
    }

    // Request orders data from tab1
    let ordersDataRequestAttempts = 0;
    const MAX_REQUEST_ATTEMPTS = 3;

    function requestOrdersDataFromTab1() {
        // Send message to parent window to request data from tab1
        if (window.parent) {
            window.parent.postMessage({
                type: 'REQUEST_ORDERS_DATA_FROM_TAB3'
            }, '*');
            console.log('📤 Đã gửi request lấy orders data từ tab1 (lần', ordersDataRequestAttempts + 1, ')');

            // Retry after 2 seconds if no response (max 3 attempts)
            ordersDataRequestAttempts++;
            if (ordersDataRequestAttempts < MAX_REQUEST_ATTEMPTS) {
                setTimeout(() => {
                    // Only retry if still no data
                    if (!ordersData || ordersData.length === 0) {
                        console.log('⚠️ Chưa nhận được dữ liệu, thử lại...');
                        requestOrdersDataFromTab1();
                    }
                }, 2000);
            }
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

    // Add Product to Assignment Table
    async function addProductToAssignment(productId) {
        try {
            // Load product details
            const response = await authenticatedFetch(
                `https://tomato.tpos.vn/odata/Product(${productId})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues`
            );

            if (!response.ok) {
                throw new Error('Không thể tải thông tin sản phẩm');
            }

            const productData = await response.json();
            let imageUrl = productData.ImageUrl;

            // Load template for image if needed
            if (!imageUrl && productData.ProductTmplId) {
                try {
                    const templateResponse = await authenticatedFetch(
                        `https://tomato.tpos.vn/odata/ProductTemplate(${productData.ProductTmplId})?$expand=Images`
                    );

                    if (templateResponse.ok) {
                        const templateData = await templateResponse.json();
                        imageUrl = templateData.ImageUrl;
                    }
                } catch (error) {
                    console.error('Error loading template:', error);
                }
            }

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
                sttList: [] // Changed from sttNumber to sttList array
            };

            assignments.push(assignment);
            saveAssignments();
            renderAssignmentTable();
            showNotification('Đã thêm sản phẩm vào danh sách');
        } catch (error) {
            console.error('Error adding product:', error);
            showNotification('Lỗi: ' + error.message, 'error');
        }
    }

    // Add Saved Product to Assignment (from product-search list)
    window.addSavedProductToAssignment = async function(productId, productName, productCode, imageUrl) {
        try {
            // Check if product already assigned
            const existingIndex = assignments.findIndex(a => a.productId === productId);
            if (existingIndex !== -1) {
                showNotification('Sản phẩm đã có trong danh sách', 'error');
                // Scroll to the existing assignment
                const tableBody = document.getElementById('assignmentTableBody');
                const existingRow = tableBody.children[existingIndex];
                if (existingRow) {
                    existingRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    existingRow.style.backgroundColor = '#fff3cd';
                    setTimeout(() => {
                        existingRow.style.backgroundColor = '';
                    }, 2000);
                }
                return;
            }

            // Extract code from product name (in square brackets)
            const codeFromName = extractProductCode(productName);

            // Add to assignments
            const assignment = {
                id: Date.now(),
                productId: productId,
                productName: productName,
                productCode: codeFromName || productCode || '',
                imageUrl: imageUrl,
                sttList: []
            };

            assignments.push(assignment);
            saveAssignments();
            renderAssignmentTable();
            showNotification('✅ Đã thêm sản phẩm vào danh sách gán');

            // Scroll to the new assignment
            setTimeout(() => {
                const tableBody = document.getElementById('assignmentTableBody');
                const newRow = tableBody.lastElementChild;
                if (newRow) {
                    newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        } catch (error) {
            console.error('Error adding saved product:', error);
            showNotification('Lỗi: ' + error.message, 'error');
        }
    };

    // Add All Saved Products to Assignment
    window.addAllSavedProducts = async function() {
        if (savedProducts.length === 0) {
            showNotification('Không có sản phẩm nào để thêm', 'error');
            return;
        }

        // Count products that will be added (exclude already added)
        const productsToAdd = savedProducts.filter(product =>
            !assignments.some(a => a.productId === product.Id)
        );

        if (productsToAdd.length === 0) {
            showNotification('Tất cả sản phẩm đã có trong danh sách gán', 'error');
            return;
        }

        // Confirm with user
        if (!confirm(`Bạn có muốn thêm ${productsToAdd.length} sản phẩm vào danh sách gán không?`)) {
            return;
        }

        let addedCount = 0;
        let skippedCount = 0;

        // Add each product to assignments
        for (const product of savedProducts) {
            // Check if product already assigned
            const existingIndex = assignments.findIndex(a => a.productId === product.Id);
            if (existingIndex !== -1) {
                skippedCount++;
                continue;
            }

            // Extract code from product name (in square brackets)
            const codeFromName = extractProductCode(product.NameGet);

            // Add to assignments
            const assignment = {
                id: Date.now() + addedCount, // Ensure unique IDs
                productId: product.Id,
                productName: product.NameGet,
                productCode: codeFromName || product.Code || product.DefaultCode || '',
                imageUrl: product.imageUrl || '',
                sttList: []
            };

            assignments.push(assignment);
            addedCount++;

            // Small delay to ensure unique timestamps
            await new Promise(resolve => setTimeout(resolve, 1));
        }

        // Save and render
        saveAssignments();
        renderAssignmentTable();

        // Show success notification
        if (addedCount > 0) {
            showNotification(`✅ Đã thêm ${addedCount} sản phẩm vào danh sách gán${skippedCount > 0 ? ` (bỏ qua ${skippedCount} đã có)` : ''}`);
        }

        // Scroll to assignment table
        setTimeout(() => {
            const assignmentTable = document.querySelector('.card:has(#assignmentTableBody)');
            if (assignmentTable) {
                assignmentTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    };

    // Auto Add All Saved Products (without confirmation, for automatic sync)
    async function autoAddAllSavedProducts() {
        if (savedProducts.length === 0) {
            return;
        }

        // Count products that will be added (exclude already added)
        const productsToAdd = savedProducts.filter(product =>
            !assignments.some(a => a.productId === product.Id)
        );

        if (productsToAdd.length === 0) {
            return; // Nothing to add, silently exit
        }

        let addedCount = 0;

        // Add each product to assignments
        for (const product of productsToAdd) {
            // Extract code from product name (in square brackets)
            const codeFromName = extractProductCode(product.NameGet);

            // Add to assignments
            const assignment = {
                id: Date.now() + addedCount, // Ensure unique IDs
                productId: product.Id,
                productName: product.NameGet,
                productCode: codeFromName || product.Code || product.DefaultCode || '',
                imageUrl: product.imageUrl || '',
                sttList: []
            };

            assignments.push(assignment);
            addedCount++;

            // Small delay to ensure unique timestamps
            await new Promise(resolve => setTimeout(resolve, 1));
        }

        // Save and render
        if (addedCount > 0) {
            saveAssignments();
            renderAssignmentTable();
            console.log(`🔄 Tự động thêm ${addedCount} sản phẩm vào danh sách gán`);
        }
    }

    // Render Saved Products List from product-search
    function renderSavedProductsList() {
        const container = document.getElementById('savedProductsContainer');
        const countBadge = document.getElementById('savedProductsCount');

        if (!container) return;

        // Update count
        if (countBadge) {
            countBadge.textContent = savedProducts.length;
        }

        if (savedProducts.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-2 d-block"></i>
                    <small>Chưa có sản phẩm nào trong danh sách.<br>Thêm sản phẩm từ trang Product Search.</small>
                </div>
            `;
            return;
        }

        // Sort products by addedAt (newest first)
        const sortedProducts = [...savedProducts].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

        container.innerHTML = sortedProducts.map(product => {
            const imageHtml = product.imageUrl
                ? `<img src="${product.imageUrl}" class="saved-product-image" alt="${product.NameGet}">`
                : `<div class="saved-product-image no-image"><i class="fas fa-box"></i></div>`;

            // Check if already in assignments
            const isAlreadyAdded = assignments.some(a => a.productId === product.Id);

            // Extract code from product name (in square brackets)
            const codeFromName = extractProductCode(product.NameGet);
            const productCode = codeFromName || product.Code || product.DefaultCode || '';

            return `
                <div class="saved-product-item ${isAlreadyAdded ? 'already-added' : ''}"
                     onclick="${isAlreadyAdded ? '' : `addSavedProductToAssignment(${product.Id}, '${product.NameGet.replace(/'/g, "\\'")}', '${productCode.replace(/'/g, "\\'")}', '${product.imageUrl || ''}')`}"
                     title="${isAlreadyAdded ? 'Đã có trong danh sách gán' : 'Click để thêm vào danh sách gán'}">
                    ${imageHtml}
                    <div class="saved-product-info">
                        <div class="saved-product-name">${product.NameGet}</div>
                        <div class="saved-product-stats">
                            <span class="badge bg-secondary">📦 ${product.QtyAvailable || 0}</span>
                            ${product.soldQty > 0 ? `<span class="badge bg-success">✅ ${product.soldQty}</span>` : ''}
                            ${product.remainingQty !== undefined ? `<span class="badge bg-info">Còn ${product.remainingQty}</span>` : ''}
                        </div>
                    </div>
                    ${isAlreadyAdded ? '<div class="added-checkmark"><i class="fas fa-check-circle"></i></div>' : '<div class="add-icon"><i class="fas fa-plus-circle"></i></div>'}
                </div>
            `;
        }).join('');
    }

    // Render Assignment Table
    function renderAssignmentTable() {
        const tableBody = document.getElementById('assignmentTableBody');
        const countSpan = document.getElementById('assignmentCount');

        countSpan.textContent = assignments.length;

        // Update saved products list to show "already-added" state
        renderSavedProductsList();

        if (assignments.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-muted py-5">
                        <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                        Chưa có sản phẩm nào được gán. Hãy tìm kiếm và thêm sản phẩm.
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = assignments.map(assignment => {
            const imageHtml = assignment.imageUrl
                ? `<img src="${assignment.imageUrl}" class="product-image" alt="${assignment.productName}">`
                : `<div class="product-image no-image">📦</div>`;

            // Ensure backward compatibility
            if (!assignment.sttList) {
                assignment.sttList = assignment.sttNumber ? [{stt: assignment.sttNumber, orderInfo: assignment.orderInfo}] : [];
            }

            // Render STT chips (with index for duplicate STT)
            const chipsHtml = assignment.sttList.length > 0
                ? assignment.sttList.map((item, index) => {
                    const chipText = [item.orderInfo?.customerName, item.orderInfo?.note].filter(Boolean).join(' - ');
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
                <tr class="assignment-row">
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
    }

    // STT Input Handlers
    window.handleSTTInput = function(event) {
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

    window.handleSTTFocus = function(event) {
        const input = event.target;
        const assignmentId = parseInt(input.dataset.assignmentId);
        const value = input.value.trim();

        if (value.length >= 1) {
            showSTTSuggestions(assignmentId, value);
        }
    };

    window.handleSTTBlur = function(event) {
        const assignmentId = parseInt(event.target.dataset.assignmentId);
        // Delay to allow click on suggestion
        setTimeout(() => {
            hideSTTSuggestions(assignmentId);
        }, 200);
    };

    window.handleSTTKeyPress = function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const input = event.target;
            const assignmentId = parseInt(input.dataset.assignmentId);
            const value = input.value.trim();

            if (value) {
                // Try to find exact match
                const order = ordersData.find(o => o.stt && o.stt.toString() === value);
                if (order) {
                    addSTTToAssignment(assignmentId, value, order);
                    input.value = '';
                    hideSTTSuggestions(assignmentId);
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
        }).slice(0, 10);

        if (filteredOrders.length === 0) {
            suggestionsDiv.classList.remove('show');
            return;
        }

        suggestionsDiv.innerHTML = filteredOrders.map(order => {
            const displayText = [order.customerName, order.note].filter(Boolean).join(' - ') || 'N/A';
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
        addSTTToAssignment(assignmentId, stt, orderData);

        // Clear input
        const input = document.querySelector(`input[data-assignment-id="${assignmentId}"]`);
        if (input) {
            input.value = '';
        }
        hideSTTSuggestions(assignmentId);
        hideOrderTooltip(); // Hide tooltip after selection
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

        // Show count if duplicate
        const count = assignment.sttList.filter(item => item.stt === stt).length;
        const countText = count > 1 ? ` (x${count})` : '';
        showNotification(`✅ Đã thêm STT ${stt}${countText} - ${orderData.customerName || 'N/A'}`);
        hideOrderTooltip(); // Hide tooltip after adding
    }

    // Remove STT by index (to support duplicate STT)
    window.removeSTTByIndex = function(assignmentId, index) {
        const assignment = assignments.find(a => a.id === assignmentId);
        if (!assignment || !assignment.sttList) return;

        const stt = assignment.sttList[index].stt;
        assignment.sttList.splice(index, 1);

        saveAssignments();
        renderAssignmentTable();

        // Show remaining count if there are duplicates
        const remainingCount = assignment.sttList.filter(item => item.stt === stt).length;
        const countText = remainingCount > 0 ? ` (còn ${remainingCount})` : '';
        showNotification(`🗑️ Đã xóa STT ${stt}${countText}`);
    };

    // Show tooltip for STT chip (by index)
    window.showSTTChipTooltip = function(event, assignmentId, index) {
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
    window.removeAssignment = function(assignmentId) {
        if (confirm('Bạn có chắc muốn xóa sản phẩm này?')) {
            assignments = assignments.filter(a => a.id !== assignmentId);
            saveAssignments();
            renderAssignmentTable();
            showNotification('Đã xóa sản phẩm');
        }
    };

    // Clear All Assignments
    window.clearAllAssignments = function() {
        if (assignments.length === 0) {
            showNotification('Danh sách đã trống', 'error');
            return;
        }

        if (confirm(`Bạn có chắc muốn xóa tất cả ${assignments.length} sản phẩm?`)) {
            assignments = [];
            saveAssignments();
            renderAssignmentTable();
            showNotification('Đã xóa tất cả sản phẩm');
        }
    };

    // Save/Load Assignments
    function saveAssignments() {
        try {
            localStorage.setItem('productAssignments', JSON.stringify(assignments));
            // Also save to Firebase
            database.ref('productAssignments').set(assignments).catch(error => {
                console.error('Error saving to Firebase:', error);
            });
        } catch (error) {
            console.error('Error saving assignments:', error);
        }
    }

    function loadAssignments() {
        try {
            const saved = localStorage.getItem('productAssignments');
            if (saved) {
                assignments = JSON.parse(saved);
                renderAssignmentTable();
            }
        } catch (error) {
            console.error('Error loading assignments:', error);
            assignments = [];
        }
    }

    // Setup Firebase Listeners
    function setupFirebaseListeners() {
        // Listen for product assignments
        database.ref('productAssignments').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && Array.isArray(data)) {
                assignments = data;
                localStorage.setItem('productAssignments', JSON.stringify(assignments));
                renderAssignmentTable();
            }
        });

        // Listen for saved products from product-search
        database.ref('savedProducts').on('value', async (snapshot) => {
            const data = snapshot.val();
            if (data && Array.isArray(data)) {
                savedProducts = data.filter(p => !p.isHidden); // Only show visible products
                console.log(`📦 Đã đồng bộ ${savedProducts.length} sản phẩm từ product-search`);
                renderSavedProductsList();

                // Auto-add all saved products to assignments
                await autoAddAllSavedProducts();
            } else {
                savedProducts = [];
                renderSavedProductsList();
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
            await getValidToken();
            loadOrdersData();
            loadAssignments();
            setupFirebaseListeners();
            await loadProductsData();
            updateOrdersCount(); // Update initial count
        } catch (error) {
            console.error('Initialization error:', error);
            showNotification('Lỗi khởi tạo: ' + error.message, 'error');
        }
    });

    // Listen for orders data updates from parent window
    window.addEventListener('message', (event) => {
        if (event.data.type === 'ORDERS_DATA_UPDATE') {
            ordersData = event.data.orders;
            ordersDataRequestAttempts = 0; // Reset attempts counter
            localStorage.setItem('ordersData', JSON.stringify(ordersData));
            console.log('✅ Đã cập nhật dữ liệu đơn hàng:', ordersData.length, 'đơn');

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

})();
