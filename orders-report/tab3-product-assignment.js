// Product Assignment Tab JavaScript
(function () {
    'use strict';

    // State
    let productsData = [];
    let ordersData = [];
    let assignments = [];
    let isLoadingProducts = false;
    let bearerToken = null;
    let tokenExpiry = null;
    let saveDebounceTimer = null;
    let userStorageManager = null; // User-specific storage manager

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
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const database = firebase.database();

    // Get Firebase path for current user
    function getUserFirebasePath() {
        if (!userStorageManager) {
            userStorageManager = window.userStorageManager;
        }
        return userStorageManager ? userStorageManager.getUserFirebasePath('productAssignments') : 'productAssignments/guest';
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
                body: 'grant_type=password&username=nvkt&password=Aa%40123456789&client_id=tmtWebApp'
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
                `${API_CONFIG.WORKER_URL}/api/odata/Product(${productId})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues`
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
                        `${API_CONFIG.WORKER_URL}/api/odata/ProductTemplate(${productData.ProductTmplId})?$expand=Images`
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
                    localStorage.setItem('productAssignments', JSON.stringify(dataWithTimestamp));
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
     * Hard refresh - Force reload data from LocalStorage
     * Called from UI button
     */
    window.hardRefreshFromFirebase = async function () {
        try {
            console.log('[HARD-REFRESH] 🔄 Hard refresh requested...');

            // Show loading indicator
            const btn = event.target.closest('button');
            const originalHTML = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

            // Force reload from LocalStorage
            loadAssignmentsFromLocalStorage();

            // Restore button
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
                console.log('[HARD-REFRESH] ✅ Hard refresh completed');
                alert('✅ Đã tải lại dữ liệu từ LocalStorage!');
            }, 500);

        } catch (error) {
            console.error('[HARD-REFRESH] ❌ Error:', error);
            alert('❌ Lỗi khi tải dữ liệu: ' + error.message);

            // Restore button
            if (event && event.target) {
                const btn = event.target.closest('button');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync-alt"></i> Hard Refresh';
            }
        }
    };

    // Load assignments from LocalStorage
    function loadAssignmentsFromLocalStorage() {
        try {
            console.log('[INIT] 🔄 Loading assignments from LocalStorage...');

            const storedData = localStorage.getItem('productAssignments');

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
            if (event.key === 'productAssignments') {
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
                userStorageManager = { getUserFirebasePath: (path) => `${path}/guest` };
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
        if (event.data.type === 'ORDERS_DATA_UPDATE' || event.data.type === 'ORDERS_DATA_RESPONSE') {
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
                        ${record.note}
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

})();