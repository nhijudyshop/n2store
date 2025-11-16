// Upload TPOS Tab JavaScript
(function() {
    'use strict';

    // State
    let assignments = [];
    let sessionIndexData = {}; // Group by SessionIndex
    let selectedSessionIndexes = new Set();
    let ordersData = []; // Orders data from tab1
    let productNotes = {}; // Store notes for each product: { "stt-productId": "note text" }

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

    // =====================================================
    // AUTH: Using tokenManager (EXACTLY like tab1-orders.js)
    // =====================================================
    // Auth is handled by token-manager.js (loaded in HTML)
    // Use: const headers = await window.tokenManager.getAuthHeader();
    // Then: fetch(url, { method: 'PUT', headers: { ...headers, ... }, ... })

    // Load Assignments Data from localStorage (SOURCE OF TRUTH)
    function loadAssignmentsFromLocalStorage() {
        try {
            const saved = localStorage.getItem('productAssignments');
            if (saved) {
                const data = JSON.parse(saved);

                // Handle both old format (array) and new format (object with timestamp)
                let rawAssignments = [];
                if (Array.isArray(data)) {
                    // Old format
                    console.log('[LOAD] 📦 Old format detected');
                    rawAssignments = data;
                } else if (data && data.assignments) {
                    // New format with timestamp
                    console.log('[LOAD] ✅ New format with timestamp:', data._timestamp);
                    rawAssignments = data.assignments;
                } else {
                    rawAssignments = [];
                }

                // Filter only products with STT assigned (DO NOT MUTATE original array)
                const assignmentsWithSTT = rawAssignments.filter(a => a.sttList && a.sttList.length > 0);

                // Use filtered array for display
                assignments = assignmentsWithSTT;

                console.log(`[LOAD] 📦 Loaded ${rawAssignments.length} products, ${assignments.length} with STT`);

                // Group by SessionIndex
                groupBySessionIndex();
                renderTable();
                updateTotalCount();
            } else {
                console.log('[LOAD] ⚠️ No assignments data in localStorage');
                assignments = [];
                groupBySessionIndex();
                renderTable();
                updateTotalCount();
            }
        } catch (error) {
            console.error('[LOAD] ❌ Error loading assignments:', error);
            assignments = [];
            groupBySessionIndex();
            renderTable();
            updateTotalCount();
        }
    }

    // Backward compatibility - deprecated, use loadAssignmentsFromLocalStorage instead
    function loadAssignments() {
        loadAssignmentsFromLocalStorage();
    }

    // Group assignments by SessionIndex
    function groupBySessionIndex() {
        sessionIndexData = {};

        assignments.forEach(assignment => {
            assignment.sttList.forEach(sttItem => {
                const stt = sttItem.stt;

                if (!sessionIndexData[stt]) {
                    sessionIndexData[stt] = {
                        stt: stt,
                        orderInfo: sttItem.orderInfo,
                        products: []
                    };
                }

                // Add product to this SessionIndex
                sessionIndexData[stt].products.push({
                    productId: assignment.productId,
                    productName: assignment.productName,
                    productCode: assignment.productCode,
                    imageUrl: assignment.imageUrl
                });
            });
        });

        console.log(`📊 Đã group thành ${Object.keys(sessionIndexData).length} SessionIndex`);
    }

    // Render Table (grouped by SessionIndex)
    function renderTable() {
        const tbody = document.getElementById('productsTableBody');
        const totalProducts = document.getElementById('totalProducts');

        const sessionIndexKeys = Object.keys(sessionIndexData);
        totalProducts.textContent = sessionIndexKeys.length;

        if (sessionIndexKeys.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted py-5">
                        <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                        <p class="mb-2">Chưa có sản phẩm nào được gán STT</p>
                        <p class="small">Vui lòng vào tab "Gán Sản Phẩm - STT" để thêm sản phẩm</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = sessionIndexKeys.map(stt => {
            const data = sessionIndexData[stt];
            const isSelected = selectedSessionIndexes.has(stt);

            // Count products by ID
            const productCounts = {};
            data.products.forEach(product => {
                const key = product.productId;
                if (!productCounts[key]) {
                    productCounts[key] = {
                        ...product,
                        count: 0
                    };
                }
                productCounts[key].count++;
            });

            // Create product list text (simple format: N55 x2, N60 x1)
            const productsText = Object.values(productCounts).map(product => {
                const code = product.productCode || product.productName;
                return `${code} x${product.count}`;
            }).join(', ');

            // Calculate total quantity
            const totalQuantity = data.products.length;

            // Get orderId from orderInfo in sessionIndexData
            const orderId = data.orderInfo?.orderId || '';

            return `
                <tr class="${isSelected ? 'selected' : ''}">
                    <td>
                        <input
                            type="checkbox"
                            class="form-check-input stt-checkbox"
                            data-stt="${stt}"
                            ${isSelected ? 'checked' : ''}
                            onchange="handleSTTCheckbox('${stt}', this.checked)"
                        >
                    </td>
                    <td>
                        <div class="stt-cell">
                            <div class="stt-badge-large">
                                <i class="fas fa-hashtag"></i>${stt}
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="order-info-cell">
                            <div class="order-customer">
                                <i class="fas fa-user"></i>
                                ${data.orderInfo?.customerName || 'N/A'}
                            </div>
                            <div class="order-phone">
                                <i class="fas fa-phone"></i>
                                ${data.orderInfo?.phone || 'N/A'}
                            </div>
                            <div class="order-address">
                                <i class="fas fa-map-marker-alt"></i>
                                ${data.orderInfo?.address || 'N/A'}
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="products-text">
                            ${productsText}
                        </div>
                    </td>
                    <td class="text-center">
                        <div class="total-quantity-cell">
                            <div class="total-badge">${totalQuantity}</div>
                            <div class="total-label">sản phẩm</div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Update Total Count
    function updateTotalCount() {
        const totalProducts = document.getElementById('totalProducts');
        totalProducts.textContent = Object.keys(sessionIndexData).length;
    }

    // Update Selected Count
    function updateSelectedCount() {
        const selectedCount = document.getElementById('selectedCount');
        const uploadBtn = document.getElementById('uploadBtn');
        const actionSection = document.getElementById('actionSection');
        const selectAllCheckbox = document.getElementById('selectAll');

        selectedCount.textContent = selectedSessionIndexes.size;

        // Show/hide action section
        if (selectedSessionIndexes.size > 0) {
            actionSection.style.display = 'block';
            uploadBtn.disabled = false;
        } else {
            actionSection.style.display = 'none';
            uploadBtn.disabled = true;
        }

        // Update select all checkbox
        const totalSTT = Object.keys(sessionIndexData).length;
        if (totalSTT > 0) {
            const allSelected = selectedSessionIndexes.size === totalSTT;
            const someSelected = selectedSessionIndexes.size > 0 && selectedSessionIndexes.size < totalSTT;

            selectAllCheckbox.checked = allSelected;
            selectAllCheckbox.indeterminate = someSelected;
        }
    }

    // Handle STT Checkbox
    window.handleSTTCheckbox = function(stt, checked) {
        if (checked) {
            selectedSessionIndexes.add(stt);
        } else {
            selectedSessionIndexes.delete(stt);
        }

        // Update row visual state
        const checkbox = document.querySelector(`.stt-checkbox[data-stt="${stt}"]`);
        if (checkbox) {
            const row = checkbox.closest('tr');
            if (row) {
                if (checked) {
                    row.classList.add('selected');
                } else {
                    row.classList.remove('selected');
                }
            }
        }

        updateSelectedCount();
    };

    // Toggle Select All
    window.toggleSelectAll = function() {
        const selectAllCheckbox = document.getElementById('selectAll');
        const isChecked = selectAllCheckbox.checked;

        console.log('[SELECT-ALL] Toggle called, checked:', isChecked);

        if (isChecked) {
            // Select all SessionIndexes
            Object.keys(sessionIndexData).forEach(stt => selectedSessionIndexes.add(stt));
        } else {
            // Deselect all
            selectedSessionIndexes.clear();
        }

        // Update all individual checkboxes without re-rendering entire table
        document.querySelectorAll('.stt-checkbox').forEach(checkbox => {
            const stt = checkbox.dataset.stt;
            checkbox.checked = selectedSessionIndexes.has(stt);

            // Update row visual state
            const row = checkbox.closest('tr');
            if (row) {
                if (checkbox.checked) {
                    row.classList.add('selected');
                } else {
                    row.classList.remove('selected');
                }
            }
        });

        updateSelectedCount();
    };

    // Clear Selection
    window.clearSelection = function() {
        selectedSessionIndexes.clear();
        document.getElementById('selectAll').checked = false;
        document.getElementById('selectAll').indeterminate = false;

        // Update all individual checkboxes without re-rendering
        document.querySelectorAll('.stt-checkbox').forEach(checkbox => {
            checkbox.checked = false;

            // Update row visual state
            const row = checkbox.closest('tr');
            if (row) {
                row.classList.remove('selected');
            }
        });

        updateSelectedCount();
    };

    // Upload to TPOS - Show Preview Modal First
    window.uploadToTPOS = async function() {
        console.log('🚀 uploadToTPOS called');
        console.log('📊 selectedSessionIndexes:', selectedSessionIndexes);

        if (selectedSessionIndexes.size === 0) {
            showNotification('Vui lòng chọn SessionIndex để upload', 'error');
            return;
        }

        // Show preview modal with loading state
        showPreviewModal();

        // Fetch detailed order data from TPOS API
        console.log('🔄 Calling fetchOrdersDetails...');
        await fetchOrdersDetails();
    };

    // Fetch Orders Details from TPOS API
    async function fetchOrdersDetails() {
        const selectedSTTs = Array.from(selectedSessionIndexes);
        const modalBody = document.getElementById('previewModalBody');

        console.log('🔍 fetchOrdersDetails START');
        console.log('📊 selectedSTTs:', selectedSTTs);

        // Show loading state
        modalBody.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="text-muted">Đang tải dữ liệu sản phẩm từ TPOS...</p>
            </div>
        `;

        try {
            // Fetch all orders in parallel
            const fetchPromises = selectedSTTs.map(async stt => {
                console.log(`\n🔎 Processing STT: ${stt}`);

                // Get order info from sessionIndexData
                const sessionData = sessionIndexData[stt];
                if (!sessionData) {
                    console.warn(`⚠️ STT ${stt} - No sessionData found`);
                    return { stt, orderData: null };
                }

                // Get orderId from orderInfo
                const orderId = sessionData.orderInfo?.orderId;
                console.log(`📄 STT ${stt} - Order info:`, sessionData.orderInfo);
                console.log(`📄 STT ${stt} - OrderId: ${orderId}`);

                if (!orderId) {
                    console.warn(`⚠️ STT ${stt} - No orderId found in orderInfo`);
                    return { stt, orderData: null };
                }

                try {
                    const apiUrl = `https://tomato.tpos.vn/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product),Partner,User,CRMTeam`;
                    console.log(`📡 API Request for STT ${stt}:`);
                    console.log(`   URL: ${apiUrl}`);

                    // Get auth headers from tokenManager
                    const headers = await window.tokenManager.getAuthHeader();
                    
                    const response = await fetch(apiUrl, {
                        headers: {
                            ...headers,
                            "Content-Type": "application/json",
                            Accept: "application/json",
                        },
                    });
                    
                    console.log(`📬 Response status for STT ${stt}:`, response.status);

                    if (!response.ok) {
                        console.error(`❌ Failed to fetch order ${orderId} - Status: ${response.status}`);
                        return { stt, orderData: null };
                    }

                    const orderData = await response.json();
                    console.log(`✅ Successfully fetched order data for STT ${stt}`);
                    console.log(`   Products count: ${orderData.Details?.length || 0}`);
                    return { stt, orderData };
                } catch (error) {
                    console.error(`❌ Error fetching order ${orderId}:`, error);
                    return { stt, orderData: null };
                }
            });

            console.log(`\n⏳ Waiting for ${fetchPromises.length} fetch requests...`);
            const results = await Promise.all(fetchPromises);
            console.log(`✅ All fetch requests completed. Results:`, results.length);

            // Store fetched products in sessionIndexData and fetch template images if needed
            for (const result of results) {
                if (result.orderData && sessionIndexData[result.stt]) {
                    // Parse products from Details
                    const products = await Promise.all((result.orderData.Details || []).map(async detail => {
                        let imageUrl = detail.Product?.ImageUrl || '';

                        // Load template image if product has no image
                        if (!imageUrl && detail.Product?.ProductTmplId) {
                            try {
                                console.log(`📸 Fetching template image for ProductTmplId: ${detail.Product.ProductTmplId}`);
                                const headers = await window.tokenManager.getAuthHeader();
                                const templateResponse = await fetch(
                                    `https://tomato.tpos.vn/odata/ProductTemplate(${detail.Product.ProductTmplId})`,
                                    {
                                        headers: {
                                            ...headers,
                                            "Content-Type": "application/json",
                                            Accept: "application/json",
                                        },
                                    }
                                );

                                if (templateResponse.ok) {
                                    const templateData = await templateResponse.json();
                                    imageUrl = templateData.ImageUrl || '';
                                    console.log(`✅ Got template image: ${imageUrl ? 'Yes' : 'No'}`);
                                }
                            } catch (error) {
                                console.error('Error fetching template image:', error);
                            }
                        }

                        const productId = detail.ProductId;
                        const noteKey = `${result.stt}-${productId}`;

                        // Store existing note for this product
                        if (detail.Note) {
                            productNotes[noteKey] = detail.Note;
                        }

                        return {
                            code: detail.Product?.Code || detail.ProductCode || '',
                            name: detail.Product?.NameGet || detail.ProductName || '',
                            nameGet: detail.Product?.NameGet || detail.ProductName || '',
                            quantity: detail.Quantity || 0,
                            price: detail.Price || 0,
                            imageUrl: imageUrl,
                            productId: productId,
                            detailId: detail.Id, // Store detail ID to update existing products
                            note: detail.Note || '' // Store existing note
                        };
                    }));

                    sessionIndexData[result.stt].fetchedProducts = products;
                    console.log(`💾 Stored ${products.length} products for STT ${result.stt}`);
                }
            }

            // Re-render modal with fetched data
            renderPreviewModal();

        } catch (error) {
            console.error('Error fetching orders details:', error);
            modalBody.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
                    <p class="text-danger">Lỗi: ${error.message}</p>
                    <button class="btn btn-primary" onclick="uploadToTPOS()">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    }

    // Show Preview Modal with Both Assigned and Original Products
    function showPreviewModal() {
        // Show modal first with loading state
        const previewModal = new bootstrap.Modal(document.getElementById('previewModal'));
        previewModal.show();

        const modalBody = document.getElementById('previewModalBody');
        modalBody.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="text-muted">Đang chuẩn bị...</p>
            </div>
        `;
    }

    // Update Product Note
    window.updateProductNote = function(noteKey, value) {
        productNotes[noteKey] = value;
        console.log(`📝 Updated note for ${noteKey}:`, value);
    };

    // Render Preview Modal Content
    function renderPreviewModal() {
        const selectedSTTs = Array.from(selectedSessionIndexes);
        const modalBody = document.getElementById('previewModalBody');

        let html = '';

        selectedSTTs.forEach(stt => {
            const data = sessionIndexData[stt];
            if (!data) return;

            // Get order products from the fetched data (stored temporarily)
            const orderProducts = data.fetchedProducts || [];

            // Create map of existing products by ProductId for quick lookup
            const existingProductsMap = {};
            orderProducts.forEach(product => {
                if (product.productId) {
                    existingProductsMap[product.productId] = product;
                }
            });

            // Count assigned products and check if they exist
            const assignedProductCounts = {};
            data.products.forEach(product => {
                const key = product.productId;
                if (!assignedProductCounts[key]) {
                    assignedProductCounts[key] = {
                        ...product,
                        count: 0,
                        isExisting: !!existingProductsMap[product.productId] // Check if product exists in order
                    };
                }
                assignedProductCounts[key].count++;
            });

            html += `
                <div class="card mb-4">
                    <div class="card-header bg-primary text-white">
                        <h5 class="mb-0">
                            <i class="fas fa-hashtag"></i> STT ${stt}
                            ${data.orderInfo?.customerName ? `- ${data.orderInfo.customerName}` : ''}
                            ${data.orderInfo?.note ? `- ${data.orderInfo.note}` : ''}
                        </h5>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <!-- Assigned Products with Note -->
                            <div class="col-md-6">
                                <h6 class="text-success">
                                    <i class="fas fa-plus-circle"></i> Sản phẩm sẽ upload (${Object.keys(assignedProductCounts).length})
                                </h6>
                                <table class="table table-sm">
                                    <thead>
                                        <tr>
                                            <th>Sản phẩm</th>
                                            <th class="text-center">SL</th>
                                            <th style="width: 200px;">Note</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${Object.values(assignedProductCounts).map(product => {
                                            const noteKey = `${stt}-${product.productId}`;

                                            // Tự động thêm "live" nếu chưa có note
                                            if (!productNotes[noteKey]) {
                                                productNotes[noteKey] = 'live';
                                            }
                                            const existingNote = productNotes[noteKey] || '';

                                            // Badge to show if product is new or existing
                                            const statusBadge = product.isExisting
                                                ? '<span class="badge bg-warning text-dark ms-2" title="Sản phẩm đã có trong đơn, sẽ cộng thêm số lượng"><i class="fas fa-plus"></i> Cộng SL</span>'
                                                : '<span class="badge bg-success ms-2" title="Sản phẩm mới sẽ được thêm vào đơn"><i class="fas fa-star"></i> Mới</span>';

                                            return `
                                            <tr class="${product.isExisting ? 'table-warning' : 'table-success'}">
                                                <td>
                                                    <div class="d-flex align-items-center gap-2">
                                                        ${product.imageUrl ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">` : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                        <div>
                                                            <div style="font-weight: 600;">${product.productName}</div>
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
                                                    <input
                                                        type="text"
                                                        class="form-control form-control-sm"
                                                        placeholder="Nhập ghi chú..."
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

                            <!-- Original Order Products with Note (Editable) -->
                            <div class="col-md-6">
                                <h6 class="text-info">
                                    <i class="fas fa-box"></i> Sản phẩm có sẵn trong đơn (${orderProducts.length})
                                </h6>
                                ${orderProducts.length > 0 ? `
                                    <table class="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>Sản phẩm</th>
                                                <th class="text-center">SL</th>
                                                <th class="text-end">Giá</th>
                                                <th style="width: 180px;">Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${orderProducts.map(product => {
                                                const noteKey = `${stt}-${product.productId}`;
                                                const existingNote = productNotes[noteKey] || product.note || '';

                                                // Check if this product will be updated (exists in assigned products)
                                                const willBeUpdated = !!assignedProductCounts[product.productId];
                                                const updateBadge = willBeUpdated
                                                    ? '<span class="badge bg-warning text-dark ms-1" title="Sản phẩm này sẽ được cộng thêm số lượng"><i class="fas fa-arrow-up"></i></span>'
                                                    : '';

                                                return `
                                                <tr class="${willBeUpdated ? 'table-warning' : ''}">
                                                    <td>
                                                        <div class="d-flex align-items-center gap-2">
                                                            ${product.imageUrl ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">` : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                            <div>
                                                                <div style="font-weight: 600;">${product.nameGet || product.name}</div>
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
                                ` : `
                                    <div class="text-center text-muted py-3">
                                        <i class="fas fa-inbox fa-2x mb-2"></i>
                                        <p class="mb-0">Không có sản phẩm có sẵn</p>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        modalBody.innerHTML = html;
    }

    // Remove uploaded STTs from productAssignments
    async function removeUploadedSTTsFromAssignments(uploadedSTTs) {
        try {
            console.log('[REMOVE-STT] 🗑️ Removing uploaded STTs from productAssignments...');
            console.log('[REMOVE-STT] STTs to remove:', uploadedSTTs);
            console.log('[REMOVE-STT] STTs types:', uploadedSTTs.map(s => `${s} (${typeof s})`));

            // Convert uploadedSTTs to strings for consistent comparison
            const uploadedSTTsStr = uploadedSTTs.map(s => String(s));
            console.log('[REMOVE-STT] STTs as strings:', uploadedSTTsStr);

            // Load current assignments from localStorage
            const saved = localStorage.getItem('productAssignments');
            if (!saved) {
                console.log('[REMOVE-STT] No assignments found in localStorage');
                return { success: true, removedCount: 0, removedProducts: 0 };
            }

            const data = JSON.parse(saved);

            // Handle both old and new format
            let productAssignments = [];
            let isOldFormat = false;

            if (Array.isArray(data)) {
                // Old format
                isOldFormat = true;
                productAssignments = data;
                console.log('[REMOVE-STT] Old format detected');
            } else if (data && data.assignments) {
                // New format
                productAssignments = data.assignments;
                console.log('[REMOVE-STT] New format detected, timestamp:', data._timestamp);
            } else {
                console.log('[REMOVE-STT] Invalid data format');
                throw new Error('Invalid productAssignments format');
            }

            console.log(`[REMOVE-STT] Current assignments: ${productAssignments.length} products`);

            // Log all current STTs in assignments before removal
            console.log('   Current STTs in assignments:');
            productAssignments.forEach(assignment => {
                if (assignment.sttList && assignment.sttList.length > 0) {
                    const sttValues = assignment.sttList.map(item => `${item.stt} (${typeof item.stt})`);
                    console.log(`     ${assignment.productCode}: [${sttValues.join(', ')}]`);
                }
            });

            // Remove uploaded STTs from each assignment
            let totalRemovedSTTs = 0;
            let removedProducts = 0;

            productAssignments = productAssignments.filter(assignment => {
                if (!assignment.sttList || !Array.isArray(assignment.sttList)) {
                    return true; // Keep products without sttList
                }

                const originalLength = assignment.sttList.length;

                // Remove all sttList items that match uploaded STTs (convert to string for comparison)
                assignment.sttList = assignment.sttList.filter(sttItem => {
                    const sttStr = String(sttItem.stt);
                    const shouldRemove = uploadedSTTsStr.includes(sttStr);
                    if (shouldRemove) {
                        console.log(`     🗑️ Removing STT ${sttStr} from ${assignment.productCode}`);
                    }
                    return !shouldRemove;
                });

                const removedCount = originalLength - assignment.sttList.length;
                totalRemovedSTTs += removedCount;

                if (removedCount > 0) {
                    console.log(`   📦 ${assignment.productCode}: removed ${removedCount} STT(s), remaining: ${assignment.sttList.length}`);
                }

                // If no STTs left, remove the entire product
                if (assignment.sttList.length === 0) {
                    console.log(`   🗑️ Removing product ${assignment.productCode} (no STTs left)`);
                    removedProducts++;
                    return false;
                }

                return true; // Keep products that still have STTs
            });

            console.log(`[REMOVE-STT] ✅ Removed ${totalRemovedSTTs} STT entries from ${removedProducts} products`);
            console.log(`[REMOVE-STT] 📦 Remaining assignments: ${productAssignments.length} products`);

            // Save updated assignments to localStorage with timestamp
            const dataWithTimestamp = {
                assignments: productAssignments,
                _timestamp: Date.now(),
                _version: 1
            };

            localStorage.setItem('productAssignments', JSON.stringify(dataWithTimestamp));
            console.log('[REMOVE-STT] ✅ Saved to localStorage with timestamp:', dataWithTimestamp._timestamp);

            // Save to Firebase
            console.log('[REMOVE-STT] 📤 Syncing to Firebase:', productAssignments.length, 'products');
            await database.ref('productAssignments').set(dataWithTimestamp);
            console.log('[REMOVE-STT] ✅ Synced to Firebase successfully');

            // Return success with stats
            return {
                success: true,
                removedCount: totalRemovedSTTs,
                removedProducts: removedProducts
            };

        } catch (error) {
            console.error('[REMOVE-STT] ❌ Error removing uploaded STTs:', error);
            // THROW to propagate error (don't swallow)
            throw new Error(`Failed to remove STTs: ${error.message}`);
        }
    }

    // Confirm Upload - Proceed with Actual Upload (WITH BACKUP & RESTORE)
    window.confirmUpload = async function() {
        console.log('[UPLOAD] 🚀 confirmUpload() called');

        // Get selected STTs
        const selectedSTTs = Array.from(selectedSessionIndexes);
        console.log('[UPLOAD] Selected STTs:', selectedSTTs);

        // Confirm with user
        const confirmMsg = `Bạn có chắc muốn upload ${selectedSTTs.length} đơn hàng lên TPOS?\n\n` +
                           `Sau khi upload thành công, các sản phẩm sẽ tự động bị xóa khỏi danh sách gán.`;

        if (!confirm(confirmMsg)) {
            console.log('[UPLOAD] ❌ User cancelled upload');
            return;
        }

        // Hide preview modal
        const previewModal = bootstrap.Modal.getInstance(document.getElementById('previewModal'));
        if (previewModal) {
            previewModal.hide();
        }

        // Disable upload button to prevent concurrent uploads
        const uploadBtn = document.getElementById('uploadBtn');
        const prevBtnText = uploadBtn ? uploadBtn.textContent : '';
        const prevBtnDisabled = uploadBtn ? uploadBtn.disabled : false;

        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.textContent = '⏳ Đang upload...';
        }

        // Variables for tracking
        let uploadId = null;
        let backupData = null;
        let uploadModal = null;

        try {
            // =====================================================
            // PHASE 1: CREATE BACKUP
            // =====================================================
            console.log('[UPLOAD] 📦 Phase 1: Creating backup...');

            try {
                uploadId = await createBackupBeforeUpload(selectedSTTs);
                backupData = await loadBackupData(uploadId);
                console.log('[UPLOAD] ✅ Backup created:', uploadId);
            } catch (error) {
                console.error('[UPLOAD] ❌ Cannot create backup:', error);
                showNotification('❌ Lỗi: Không thể tạo backup trước khi upload', 'error');
                return; // STOP if backup fails
            }

            // =====================================================
            // PHASE 2: UPLOAD TO TPOS
            // =====================================================
            console.log('[UPLOAD] 📤 Phase 2: Uploading to TPOS...');

            // Show upload modal
            uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
            uploadModal.show();

            const progressBar = document.getElementById('uploadProgress');
            const statusText = document.getElementById('uploadStatus');

            // Reset progress
            progressBar.style.width = '0%';
            progressBar.textContent = '0%';
            progressBar.classList.remove('bg-success', 'bg-warning', 'bg-danger');
            progressBar.classList.add('bg-primary');

            let completed = 0;
            const total = selectedSTTs.length;
            const results = [];

            // Upload loop
            for (const stt of selectedSTTs) {
                const sessionData = sessionIndexData[stt];
                if (!sessionData) {
                    console.warn(`[UPLOAD] ⚠️ No sessionData for STT ${stt}`);
                    results.push({ stt, orderId: null, success: false, error: 'No session data' });
                    completed++;
                    continue;
                }

                const orderId = sessionData.orderInfo?.orderId;
                if (!orderId) {
                    console.warn(`[UPLOAD] ⚠️ No orderId for STT ${stt}`);
                    results.push({ stt, orderId: null, success: false, error: 'No order ID' });
                    completed++;
                    continue;
                }

                statusText.textContent = `Đang upload STT ${stt} - ${sessionData.orderInfo?.customerName || 'N/A'}...`;

                try {
                    // Fetch current order data
                    console.log(`[UPLOAD] 📡 Fetching order ${orderId} for STT ${stt}...`);
                    const apiUrl = `https://tomato.tpos.vn/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product),Partner,User,CRMTeam`;

                    const headers = await window.tokenManager.getAuthHeader();

                    const response = await fetch(apiUrl, {
                        headers: {
                            ...headers,
                            "Content-Type": "application/json",
                            Accept: "application/json",
                        },
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to fetch order ${orderId}: ${response.status}`);
                    }

                    const orderData = await response.json();
                    console.log(`[UPLOAD] ✅ Fetched order data for STT ${stt}`);

                    // Prepare merged Details
                    const mergedDetails = await prepareUploadDetails(orderData, sessionData);
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

                    // Prepare payload
                    const payload = prepareUploadPayload(orderData);

                    console.log(`[UPLOAD] 📤 Uploading order ${orderId}...`);
                    console.log(`[UPLOAD]   Details count: ${payload.Details.length}`);
                    console.log(`[UPLOAD]   Total Quantity: ${payload.TotalQuantity}`);

                    // PUT request
                    const uploadHeaders = await window.tokenManager.getAuthHeader();

                    const uploadResponse = await fetch(
                        `https://tomato.tpos.vn/odata/SaleOnline_Order(${orderId})`,
                        {
                            method: "PUT",
                            headers: {
                                ...uploadHeaders,
                                "Content-Type": "application/json",
                                Accept: "application/json",
                            },
                            body: JSON.stringify(payload),
                        },
                    );

                    if (!uploadResponse.ok) {
                        const errorText = await uploadResponse.text();
                        throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
                    }

                    console.log(`[UPLOAD] ✅ Successfully uploaded STT ${stt}`);
                    results.push({ stt, orderId, success: true });

                } catch (error) {
                    console.error(`[UPLOAD] ❌ Error uploading STT ${stt}:`, error);
                    results.push({ stt, orderId, success: false, error: error.message });
                }

                // Update progress
                completed++;
                const percentage = Math.round((completed / total) * 100);
                progressBar.style.width = percentage + '%';
                progressBar.textContent = percentage + '%';
            }

            // =====================================================
            // PHASE 3: PROCESS RESULTS
            // =====================================================
            console.log('[UPLOAD] 📊 Phase 3: Processing results...');

            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            console.log(`[UPLOAD] Results: ${successCount} success, ${failCount} failed`);

            if (failCount === 0) {
                // ===== ALL SUCCESS =====
                console.log('[UPLOAD] ✅ ALL SUCCESS - Processing deletion...');

                statusText.textContent = `✅ Upload thành công ${successCount} đơn hàng! Đang xóa sản phẩm...`;

                try {
                    // Step 1: Delete products
                    const successfulSTTs = results.map(r => r.stt);
                    const deleteResult = await removeUploadedSTTsFromAssignments(successfulSTTs);

                    console.log('[UPLOAD] ✅ Deleted:', deleteResult.removedCount, 'STT entries');

                    // Step 2: Read afterSnapshot (AFTER deletion completes)
                    const afterData = localStorage.getItem('productAssignments');
                    const afterSnapshot = afterData ? JSON.parse(afterData) : null;

                    // Step 3: Save history
                    await saveToHistory(uploadId, results, 'completed', backupData, afterSnapshot);

                    // Step 4: Mark as committed
                    await markHistoryAsCommitted(uploadId);

                    // Step 5: Update UI
                    statusText.textContent = `✅ Hoàn tất! Đã upload ${successCount} đơn hàng và xóa sản phẩm`;
                    progressBar.classList.remove('bg-primary');
                    progressBar.classList.add('bg-success');

                    // Reload assignments table
                    loadAssignmentsFromLocalStorage();

                    setTimeout(() => {
                        if (uploadModal) uploadModal.hide();
                        showNotification(`✅ Đã upload ${successCount} đơn hàng lên TPOS thành công!`);
                        clearSelection();
                    }, 1500);

                } catch (deleteError) {
                    // Deletion failed (CRITICAL)
                    console.error('[UPLOAD] ❌ Deletion failed:', deleteError);

                    statusText.textContent = `⚠️ Upload thành công nhưng không thể xóa sản phẩm`;
                    progressBar.classList.remove('bg-primary');
                    progressBar.classList.add('bg-warning');

                    // Save history with special status
                    const afterData = localStorage.getItem('productAssignments');
                    const afterSnapshot = afterData ? JSON.parse(afterData) : null;
                    await saveToHistory(uploadId, results, 'deletion_failed', backupData, afterSnapshot);

                    setTimeout(() => {
                        if (uploadModal) uploadModal.hide();
                        showNotification('⚠️ Upload thành công nhưng không thể xóa products. Vui lòng xóa thủ công!', 'warning');
                    }, 2000);
                }

            } else if (failCount < total) {
                // ===== PARTIAL SUCCESS =====
                console.log('[UPLOAD] ⚠️ PARTIAL SUCCESS - Processing...');

                const successfulSTTs = results.filter(r => r.success).map(r => r.stt);

                statusText.textContent = `⚠️ Thành công: ${successCount}, Thất bại: ${failCount}. Đang xóa sản phẩm thành công...`;

                try {
                    // Step 1: Delete ONLY successful STTs
                    if (successfulSTTs.length > 0) {
                        const deleteResult = await removeUploadedSTTsFromAssignments(successfulSTTs);
                        console.log('[UPLOAD] ✅ Deleted successful STTs:', deleteResult.removedCount);
                    }

                    // Step 2: Read afterSnapshot
                    const afterData = localStorage.getItem('productAssignments');
                    const afterSnapshot = afterData ? JSON.parse(afterData) : null;

                    // Step 3: Save history
                    await saveToHistory(uploadId, results, 'partial', backupData, afterSnapshot);

                    // Step 4: Mark as committed (cannot safely restore partial)
                    await markHistoryAsCommitted(uploadId);

                    // Step 5: Update UI
                    statusText.textContent = `⚠️ Thành công: ${successCount}, Thất bại: ${failCount}`;
                    progressBar.classList.remove('bg-primary');
                    progressBar.classList.add('bg-warning');

                    // Reload table
                    loadAssignmentsFromLocalStorage();

                    setTimeout(() => {
                        if (uploadModal) uploadModal.hide();
                        showNotification(`⚠️ Upload hoàn tất: ${successCount} thành công, ${failCount} thất bại`, 'warning');
                    }, 2000);

                } catch (deleteError) {
                    console.error('[UPLOAD] ❌ Partial deletion failed:', deleteError);

                    statusText.textContent = `❌ Lỗi xử lý kết quả upload`;

                    // Try to save history anyway
                    const afterData = localStorage.getItem('productAssignments');
                    const afterSnapshot = afterData ? JSON.parse(afterData) : null;
                    await saveToHistory(uploadId, results, 'deletion_failed', backupData, afterSnapshot);

                    setTimeout(() => {
                        if (uploadModal) uploadModal.hide();
                        showNotification('❌ Lỗi xử lý kết quả. Vui lòng kiểm tra lại dữ liệu!', 'error');
                    }, 2000);
                }

            } else {
                // ===== ALL FAILED =====
                console.log('[UPLOAD] ❌ ALL FAILED - Restoring from backup...');

                statusText.textContent = `❌ Upload thất bại. Đang khôi phục dữ liệu...`;

                try {
                    // Step 1: Restore from backup
                    await restoreFromBackup(uploadId);

                    // Step 2: Save history (for audit)
                    await saveToHistory(uploadId, results, 'failed', backupData, null);

                    // Step 3: Update UI
                    statusText.textContent = `❌ Upload thất bại. Đã khôi phục dữ liệu`;
                    progressBar.classList.remove('bg-primary');
                    progressBar.classList.add('bg-danger');

                    setTimeout(() => {
                        if (uploadModal) uploadModal.hide();

                        // Show detailed error
                        const firstError = results.find(r => !r.success);
                        const errorMsg = firstError ? firstError.error : 'Unknown error';
                        showNotification(`❌ Upload thất bại: ${errorMsg}. Đã khôi phục dữ liệu.`, 'error');
                    }, 2000);

                } catch (restoreError) {
                    console.error('[UPLOAD] ❌❌ CRITICAL: Restore failed:', restoreError);

                    statusText.textContent = `❌❌ CRITICAL: Không thể khôi phục!`;

                    setTimeout(() => {
                        if (uploadModal) uploadModal.hide();
                        alert('❌ CRITICAL ERROR:\n\n' +
                              'Upload thất bại VÀ không thể khôi phục dữ liệu!\n\n' +
                              'Vui lòng KHÔNG thao tác gì thêm và liên hệ IT ngay!\n\n' +
                              `Backup ID: ${uploadId}`);
                    }, 2000);
                }
            }

        } catch (error) {
            // UNEXPECTED ERROR during upload loop
            console.error('[UPLOAD] ❌ Unexpected error:', error);

            try {
                // Try to restore from backup
                if (uploadId) {
                    console.log('[UPLOAD] 🔄 Attempting restore due to unexpected error...');
                    await restoreFromBackup(uploadId);
                    await saveToHistory(uploadId, [], 'failed', backupData, null);
                    showNotification('❌ Upload thất bại: ' + error.message + '. Đã khôi phục dữ liệu.', 'error');
                } else {
                    showNotification('❌ Upload thất bại: ' + error.message, 'error');
                }
            } catch (restoreError) {
                console.error('[UPLOAD] ❌❌ CRITICAL: Cannot restore after unexpected error:', restoreError);
                alert('❌ CRITICAL ERROR:\n\nĐã xảy ra lỗi nghiêm trọng!\n\nVui lòng liên hệ IT ngay!');
            }

            if (uploadModal) {
                uploadModal.hide();
            }

        } finally {
            // Always cleanup and re-enable button
            console.log('[UPLOAD] 🧹 Cleanup...');

            // Cleanup backup (if not already cleaned by saveToHistory)
            if (uploadId) {
                await cleanupBackup(uploadId);
            }

            // Re-enable upload button
            if (uploadBtn) {
                uploadBtn.disabled = prevBtnDisabled;
                uploadBtn.textContent = prevBtnText || 'Upload lên TPOS';
            }

            console.log('[UPLOAD] ✅ Upload flow completed');
        }
    };

    // Prepare Details for upload (merge existing + assigned)
    // LOGIC GIỐNG tab1-orders.js: addProductToOrderFromInline (dòng 2214-2369)
    async function prepareUploadDetails(orderData, sessionData) {
        const existingDetails = orderData.Details || [];
        const assignedProducts = sessionData.products || [];
        const stt = sessionData.stt; // Get STT for note lookup

        console.log(`\n📊 Preparing upload details:`);
        console.log(`   Existing products: ${existingDetails.length}`);
        console.log(`   Assigned products: ${assignedProducts.length}`);

        // Group existing products by ProductId
        const existingByProductId = {};
        existingDetails.forEach(detail => {
            existingByProductId[detail.ProductId] = detail;
        });

        // Group assigned products by ProductId and count
        const assignedByProductId = {};
        assignedProducts.forEach(product => {
            const productId = product.productId;
            if (!assignedByProductId[productId]) {
                assignedByProductId[productId] = {
                    productId: productId,
                    productCode: product.productCode,
                    productName: product.productName,
                    imageUrl: product.imageUrl,
                    count: 0
                };
            }
            assignedByProductId[productId].count++;
        });

        // Clone existing details to modify
        const mergedDetails = [...existingDetails];

        // Process assigned products: Update existing OR Add new
        for (const productId of Object.keys(assignedByProductId)) {
            const assignedData = assignedByProductId[productId];
            const existingDetail = existingByProductId[productId];

            // Get note for this product
            const noteKey = `${stt}-${productId}`;
            const note = productNotes[noteKey] || null;

            if (existingDetail) {
                // ============================================
                // PRODUCT EXISTS - Increase quantity and update note
                // ============================================
                const oldQty = existingDetail.Quantity || 0;
                existingDetail.Quantity = oldQty + assignedData.count;

                // Update note if provided
                if (note !== null && note.trim() !== '') {
                    existingDetail.Note = note;
                    console.log(`   📝 Updated note for ${existingDetail.ProductCode}: "${note}"`);
                }

                console.log(`   ✏️ Updated ${existingDetail.ProductCode}: ${oldQty} → ${existingDetail.Quantity} (+${assignedData.count})`);
            } else {
                // ============================================
                // NEW PRODUCT - Fetch full info and add (EXACTLY like tab1-orders.js)
                // ============================================
                console.log(`   ➕ Adding new product: ${assignedData.productCode} x${assignedData.count}`);
                
                try {
                    // Fetch full product details from API
                    const fullProduct = await fetchProductDetails(productId);
                    
                    if (!fullProduct) {
                        console.error(`   ❌ Cannot fetch product ${productId}, skipping...`);
                        continue;
                    }

                    // ============================================
                    // CREATE NEW DETAIL WITH COMPUTED FIELDS
                    // EXACTLY like tab1-orders.js (dòng 2284-2322)
                    // ============================================
                    const newProduct = {
                        // ============================================
                        // REQUIRED FIELDS
                        // ============================================
                        // ✅ KHÔNG có Id: để API tự tạo cho sản phẩm mới
                        ProductId: fullProduct.Id,
                        Quantity: assignedData.count,  // Use counted quantity
                        Price:
                            fullProduct.PriceVariant ||
                            fullProduct.ListPrice ||
                            fullProduct.StandardPrice ||
                            0,
                        Note: note && note.trim() !== '' ? note : null, // Add note from input
                        UOMId: fullProduct.UOM?.Id || 1,
                        Factor: 1,
                        Priority: 0,
                        OrderId: orderData.Id,
                        LiveCampaign_DetailId: null,
                        ProductWeight: 0,

                        // ============================================
                        // COMPUTED FIELDS - PHẢI CÓ! (EXACTLY like tab1-orders.js)
                        // ============================================
                        ProductName: fullProduct.Name || fullProduct.NameTemplate,
                        ProductNameGet:
                            fullProduct.NameGet ||
                            `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                        ProductCode: fullProduct.DefaultCode || fullProduct.Barcode,
                        UOMName: fullProduct.UOM?.Name || "Cái",
                        ImageUrl: fullProduct.ImageUrl || assignedData.imageUrl,
                        IsOrderPriority: null,
                        QuantityRegex: null,
                        IsDisabledLiveCampaignDetail: false,

                        // Creator ID
                        CreatedById: orderData.UserId || orderData.CreatedById,
                    };

                    if (note && note.trim() !== '') {
                        console.log(`   📝 Added note for new product ${assignedData.productCode}: "${note}"`);
                    }

                    mergedDetails.push(newProduct);
                    console.log(`   ✅ Added new product with computed fields:`, newProduct);
                    
                } catch (error) {
                    console.error(`   ❌ Error adding product ${productId}:`, error);
                    console.error(`   ⚠️ Skipping product ${assignedData.productCode}`);
                }
            }
        }

        // ============================================
        // UPDATE NOTES for existing products that are NOT in assigned products
        // (User might have edited notes for products already in order)
        // ============================================
        for (const existingDetail of mergedDetails) {
            const productId = existingDetail.ProductId;

            // Skip if this product was already processed above (in assigned products)
            if (assignedByProductId[productId]) {
                continue;
            }

            // Check if there's a note update for this existing product
            const noteKey = `${stt}-${productId}`;
            const note = productNotes[noteKey] || null;

            if (note !== null && note.trim() !== '') {
                existingDetail.Note = note;
                console.log(`   📝 Updated note for existing product ${existingDetail.ProductCode}: "${note}"`);
            }
        }

        console.log(`   📦 Final details count: ${mergedDetails.length}`);
        return mergedDetails;
    }

    // Fetch full product details from TPOS API
    async function fetchProductDetails(productId) {
        try {
            const apiUrl = `https://tomato.tpos.vn/odata/Product(${productId})?$expand=UOM`;
            
            // Get auth headers from tokenManager
            const headers = await window.tokenManager.getAuthHeader();
            
            const response = await fetch(apiUrl, {
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
            });

            if (!response.ok) {
                console.error(`Failed to fetch product ${productId}: ${response.status}`);
                return null;
            }

            const product = await response.json();
            console.log(`   📦 Fetched product details for ${productId}:`, product);
            return product;
            
        } catch (error) {
            console.error(`Error fetching product ${productId}:`, error);
            return null;
        }
    }

    // Prepare payload for PUT request (exactly like tab1-orders.js)
    function prepareUploadPayload(orderData) {
        console.log('[PAYLOAD] Preparing payload for PUT request...');

        // Clone data to avoid modifying original
        const payload = JSON.parse(JSON.stringify(orderData));

        // CRITICAL: Add @odata.context (exactly as in tab1-orders.js)
        if (!payload['@odata.context']) {
            payload['@odata.context'] =
                'http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity';
            console.log('[PAYLOAD] ✓ Added @odata.context');
        }

        // Process Details array (exactly as in tab1-orders.js)
        if (payload.Details && Array.isArray(payload.Details)) {
            payload.Details = payload.Details.map((detail, index) => {
                const cleaned = { ...detail };

                // Remove Id if null/undefined (new products that need to be created)
                // Keep Id if exists (existing products that need to be updated)
                if (!cleaned.Id || cleaned.Id === null || cleaned.Id === undefined) {
                    delete cleaned.Id;
                    console.log(`[PAYLOAD FIX] Detail[${index}]: Removed Id:null for ProductId:`, cleaned.ProductId);
                } else {
                    console.log(`[PAYLOAD] Detail[${index}]: Keeping existing Id:`, cleaned.Id);
                }

                // Ensure OrderId matches the parent order
                cleaned.OrderId = payload.Id;

                // Keep all other fields intact (ProductName, ProductNameGet, ProductCode, etc.)
                // These fields are already in the detail object from TPOS API

                return cleaned;
            });
        }

        // Statistics for logging
        const newDetailsCount = payload.Details?.filter(d => !d.Id).length || 0;
        const existingDetailsCount = payload.Details?.filter(d => d.Id).length || 0;

        const summary = {
            orderId: payload.Id,
            orderCode: payload.Code,
            topLevelFields: Object.keys(payload).length,
            detailsCount: payload.Details?.length || 0,
            newDetails: newDetailsCount,
            existingDetails: existingDetailsCount,
            hasContext: !!payload['@odata.context'],
            hasPartner: !!payload.Partner,
            hasUser: !!payload.User,
            hasCRMTeam: !!payload.CRMTeam,
            hasRowVersion: !!payload.RowVersion
        };

        console.log('[PAYLOAD] ✓ Payload prepared successfully:', summary);

        // Validate critical fields
        if (!payload.RowVersion) {
            console.warn('[PAYLOAD] ⚠️ WARNING: Missing RowVersion!');
        }
        if (!payload['@odata.context']) {
            console.error('[PAYLOAD] ❌ ERROR: Missing @odata.context!');
        }

        // VALIDATION: Check for Id: null (this will cause API error)
        const detailsWithNullId = payload.Details?.filter(d =>
            d.hasOwnProperty('Id') && (d.Id === null || d.Id === undefined)
        ) || [];

        if (detailsWithNullId.length > 0) {
            console.error('[PAYLOAD] ❌ ERROR: Found details with null Id:', detailsWithNullId);
            throw new Error('Payload contains details with null Id - this will cause API error');
        }

        return payload;
    }

    // =====================================================
    // EDIT MODAL FUNCTIONALITY
    // =====================================================
    let currentEditOrderData = null;
    let currentEditSTT = null;

    // Open Edit Modal - Fetch Order Data from TPOS
    window.openEditModal = async function(stt, orderId) {
        currentEditSTT = stt;

        // Show modal
        const editModal = new bootstrap.Modal(document.getElementById('editOrderModal'));
        editModal.show();

        // Show loading state
        document.getElementById('editModalBody').innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="text-muted">Đang tải dữ liệu đơn hàng...</p>
            </div>
        `;

        try {
            // Fetch order data from TPOS API (EXACTLY like tab1-orders.js)
            const apiUrl = `https://tomato.tpos.vn/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product),Partner,User,CRMTeam`;
            
            // Get auth headers from tokenManager
            const headers = await window.tokenManager.getAuthHeader();
            
            const response = await fetch(apiUrl, {
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            currentEditOrderData = await response.json();

            // Fetch template images for products without ImageUrl
            if (currentEditOrderData.Details && Array.isArray(currentEditOrderData.Details)) {
                for (const detail of currentEditOrderData.Details) {
                    if (detail.Product && !detail.Product.ImageUrl && detail.Product.ProductTmplId) {
                        try {
                            console.log(`📸 Fetching template image for ProductTmplId: ${detail.Product.ProductTmplId}`);
                            const headers = await window.tokenManager.getAuthHeader();
                            const templateResponse = await fetch(
                                `https://tomato.tpos.vn/odata/ProductTemplate(${detail.Product.ProductTmplId})`,
                                {
                                    headers: {
                                        ...headers,
                                        "Content-Type": "application/json",
                                        Accept: "application/json",
                                    },
                                }
                            );

                            if (templateResponse.ok) {
                                const templateData = await templateResponse.json();
                                detail.Product.ImageUrl = templateData.ImageUrl || '';
                                console.log(`✅ Got template image for edit modal: ${detail.Product.ImageUrl ? 'Yes' : 'No'}`);
                            }
                        } catch (error) {
                            console.error('Error fetching template image:', error);
                        }
                    }
                }
            }

            // Render modal content
            renderEditModalContent(stt);

        } catch (error) {
            console.error('Error fetching order data:', error);
            document.getElementById('editModalBody').innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
                    <p class="text-danger">Lỗi: ${error.message}</p>
                    <button class="btn btn-primary" onclick="openEditModal('${stt}', '${orderId}')">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    };

    // Render Edit Modal Content with Merged Products
    function renderEditModalContent(stt) {
        const data = sessionIndexData[stt];
        if (!data || !currentEditOrderData) return;

        // Get assigned products for this STT
        const assignedProductCounts = {};
        data.products.forEach(product => {
            const key = product.productCode || product.productName;
            if (!assignedProductCounts[key]) {
                assignedProductCounts[key] = {
                    ...product,
                    count: 0,
                    source: 'assigned'
                };
            }
            assignedProductCounts[key].count++;
        });

        // Get existing products from order
        const existingProducts = {};
        if (currentEditOrderData.Details && Array.isArray(currentEditOrderData.Details)) {
            currentEditOrderData.Details.forEach(detail => {
                const code = detail.Product?.Code || detail.ProductCode || '';
                if (code) {
                    existingProducts[code] = {
                        code: code,
                        name: detail.Product?.NameGet || detail.ProductName || '',
                        quantity: detail.Quantity || 0,
                        price: detail.Price || 0,
                        imageUrl: detail.Product?.ImageUrl || '',
                        source: 'existing'
                    };
                }
            });
        }

        // Merge products: combine quantities if codes match
        const mergedProducts = {};

        // Add existing products first
        Object.keys(existingProducts).forEach(code => {
            mergedProducts[code] = {
                ...existingProducts[code],
                assignedQuantity: 0,
                existingQuantity: existingProducts[code].quantity,
                totalQuantity: existingProducts[code].quantity,
                hasMatch: false
            };
        });

        // Add assigned products and merge if match
        Object.keys(assignedProductCounts).forEach(code => {
            const assignedProduct = assignedProductCounts[code];
            if (mergedProducts[code]) {
                // Match found - merge quantities
                mergedProducts[code].assignedQuantity = assignedProduct.count;
                mergedProducts[code].totalQuantity = mergedProducts[code].existingQuantity + assignedProduct.count;
                mergedProducts[code].hasMatch = true;
                mergedProducts[code].imageUrl = mergedProducts[code].imageUrl || assignedProduct.imageUrl;
            } else {
                // New product to be added
                mergedProducts[code] = {
                    code: code,
                    name: assignedProduct.productName,
                    quantity: 0,
                    price: 0,
                    imageUrl: assignedProduct.imageUrl || '',
                    assignedQuantity: assignedProduct.count,
                    existingQuantity: 0,
                    totalQuantity: assignedProduct.count,
                    hasMatch: false,
                    source: 'new'
                };
            }
        });

        // Render modal body
        const modalBody = document.getElementById('editModalBody');

        let html = `
            <div class="mb-4">
                <h5 class="mb-3">
                    <i class="fas fa-hashtag"></i> STT ${stt} - ${data.orderInfo?.customerName || 'N/A'}
                </h5>
                <div class="alert alert-info mb-3">
                    <i class="fas fa-info-circle"></i>
                    <strong>Mã đơn hàng:</strong> ${currentEditOrderData.Code || 'N/A'}
                </div>
            </div>

            <div class="table-responsive">
                <table class="table table-bordered">
                    <thead class="table-light">
                        <tr>
                            <th style="width: 50px">#</th>
                            <th>Sản phẩm</th>
                            <th class="text-center" style="width: 120px">SL có sẵn</th>
                            <th class="text-center" style="width: 120px">SL sẽ upload</th>
                            <th class="text-center" style="width: 120px">Tổng</th>
                            <th class="text-end" style="width: 150px">Giá</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        Object.values(mergedProducts).forEach((product, index) => {
            const rowClass = product.hasMatch ? 'table-warning' : (product.source === 'new' ? 'table-success' : '');
            const badge = product.hasMatch ? '<span class="badge bg-warning text-dark ms-2">Trùng mã</span>' :
                         (product.source === 'new' ? '<span class="badge bg-success ms-2">Mới</span>' : '');

            html += `
                <tr class="${rowClass}">
                    <td class="text-center">${index + 1}</td>
                    <td>
                        <div class="d-flex align-items-center gap-2">
                            ${product.imageUrl ?
                                `<img src="${product.imageUrl}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">` :
                                '<div style="width: 50px; height: 50px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-box"></i></div>'
                            }
                            <div>
                                <div style="font-weight: 600;">${product.name}</div>
                                <div style="font-size: 12px; color: #6b7280;">
                                    ${product.code}${badge}
                                </div>
                            </div>
                        </div>
                    </td>
                    <td class="text-center">
                        <span class="badge bg-info">${product.existingQuantity}</span>
                    </td>
                    <td class="text-center">
                        <span class="badge bg-success">${product.assignedQuantity}</span>
                    </td>
                    <td class="text-center">
                        <strong class="badge bg-primary">${product.totalQuantity}</strong>
                    </td>
                    <td class="text-end">
                        <span style="font-weight: 600; color: #3b82f6;">
                            ${product.price.toLocaleString('vi-VN')}đ
                        </span>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>

            <div class="alert alert-warning mt-3">
                <i class="fas fa-lightbulb"></i>
                <strong>Lưu ý:</strong>
                <ul class="mb-0 mt-2">
                    <li><span class="badge bg-warning text-dark">Trùng mã</span>: Sản phẩm có sẵn sẽ được cộng thêm số lượng khi upload</li>
                    <li><span class="badge bg-success">Mới</span>: Sản phẩm mới sẽ được thêm vào đơn hàng</li>
                </ul>
            </div>
        `;

        modalBody.innerHTML = html;
    }

    // Close Edit Modal
    window.closeEditModal = function() {
        const editModal = bootstrap.Modal.getInstance(document.getElementById('editOrderModal'));
        if (editModal) {
            editModal.hide();
        }
        currentEditOrderData = null;
        currentEditSTT = null;
    };

    // Setup Firebase Listeners with timestamp-based conflict resolution
    function setupFirebaseListeners() {
        console.log('[SYNC] 🔧 Setting up Firebase listeners...');

        let isFirstLoad = true; // Skip first trigger (we already loaded from localStorage)

        database.ref('productAssignments').on('value', (snapshot) => {
            console.log('[SYNC] 🔔 Firebase listener triggered!');

            // Skip first trigger (already loaded in init)
            if (isFirstLoad) {
                console.log('[SYNC] ⏭️ Skip first listener trigger (initial data already loaded)');
                isFirstLoad = false;
                return;
            }

            // Read localStorage for comparison
            const localData = localStorage.getItem('productAssignments');
            const localParsed = localData ? JSON.parse(localData) : null;
            const localTimestamp = localParsed?._timestamp || 0;

            // Read Firebase data
            const firebaseData = snapshot.val();
            const firebaseTimestamp = firebaseData?._timestamp || 0;

            console.log('[SYNC] 📊 Timestamp comparison:');
            console.log('[SYNC]   localStorage:', localTimestamp, new Date(localTimestamp).toLocaleTimeString());
            console.log('[SYNC]   Firebase:', firebaseTimestamp, new Date(firebaseTimestamp).toLocaleTimeString());

            // Only update if Firebase is newer
            if (firebaseTimestamp > localTimestamp) {
                console.log('[SYNC] ✅ Firebase is newer, syncing to localStorage and updating display');

                // Handle new format
                if (firebaseData && firebaseData.assignments && Array.isArray(firebaseData.assignments)) {
                    // Update localStorage with Firebase data
                    localStorage.setItem('productAssignments', JSON.stringify(firebaseData));

                    // Update display using filtered assignments
                    const assignmentsWithSTT = firebaseData.assignments.filter(a => a.sttList?.length > 0);
                    assignments = assignmentsWithSTT;

                    groupBySessionIndex();
                    renderTable();
                    updateTotalCount();

                    console.log('[SYNC] 🔄 Synced from Firebase:', assignmentsWithSTT.length, 'products with STT');
                }
                // Handle old format (backward compatibility)
                else if (firebaseData && Array.isArray(firebaseData)) {
                    console.log('[SYNC] 📦 Old format detected, syncing...');

                    // Convert to new format
                    const dataWithTimestamp = {
                        assignments: firebaseData,
                        _timestamp: firebaseTimestamp || Date.now(),
                        _version: 1
                    };
                    localStorage.setItem('productAssignments', JSON.stringify(dataWithTimestamp));

                    const assignmentsWithSTT = firebaseData.filter(a => a.sttList?.length > 0);
                    assignments = assignmentsWithSTT;

                    groupBySessionIndex();
                    renderTable();
                    updateTotalCount();

                    console.log('[SYNC] 🔄 Synced old format:', assignmentsWithSTT.length, 'products');
                }
                // Handle empty/null data
                else if (firebaseData === null) {
                    console.log('[SYNC] 🗑️ Firebase is empty, clearing assignments');

                    const dataWithTimestamp = {
                        assignments: [],
                        _timestamp: Date.now(),
                        _version: 1
                    };
                    localStorage.setItem('productAssignments', JSON.stringify(dataWithTimestamp));

                    assignments = [];
                    groupBySessionIndex();
                    renderTable();
                    updateTotalCount();
                } else {
                    console.log('[SYNC] ⚠️ Unexpected Firebase data format:', typeof firebaseData);
                }
            } else {
                console.log('[SYNC] ⏭️ Skip sync: localStorage is newer or equal');
                console.log('[SYNC]   Difference:', (localTimestamp - firebaseTimestamp) / 1000, 'seconds');
            }
        });

        console.log('[SYNC] ✅ Firebase listeners setup complete');
    }

    // =====================================================
    // HELPER: Sync from Firebase if newer than localStorage
    // =====================================================
    // This function checks if Firebase has newer data than localStorage
    // and syncs if needed. Used by visibility/focus listeners to prevent
    // stale data from background tabs.
    // Returns: true if synced, false if no sync needed
    async function syncFromFirebaseIfNewer(eventType) {
        try {
            console.log(`[${eventType}] 🔍 Checking Firebase for updates...`);

            // Step 1: Read localStorage timestamp
            const localData = localStorage.getItem('productAssignments');
            const localParsed = localData ? JSON.parse(localData) : null;
            const localTimestamp = localParsed?._timestamp || 0;

            // Step 2: Read ONLY Firebase timestamp (lightweight query)
            const timestampSnapshot = await database.ref('productAssignments/_timestamp').once('value');
            const firebaseTimestamp = timestampSnapshot.val() || 0;

            console.log(`[${eventType}] 📊 Timestamp comparison:`);
            console.log(`[${eventType}]   localStorage: ${localTimestamp} (${new Date(localTimestamp).toLocaleString('vi-VN')})`);
            console.log(`[${eventType}]   Firebase: ${firebaseTimestamp} (${new Date(firebaseTimestamp).toLocaleString('vi-VN')})`);

            // Step 3: Only fetch full data if Firebase is newer
            if (firebaseTimestamp > localTimestamp) {
                console.log(`[${eventType}] ⚠️ localStorage is STALE! Syncing from Firebase...`);

                // Fetch full data from Firebase
                const fullSnapshot = await database.ref('productAssignments').once('value');
                const firebaseData = fullSnapshot.val();

                if (firebaseData && firebaseData.assignments && Array.isArray(firebaseData.assignments)) {
                    // Update localStorage with newer data from Firebase
                    localStorage.setItem('productAssignments', JSON.stringify(firebaseData));
                    console.log(`[${eventType}] ✅ Synced from Firebase: ${firebaseData.assignments.length} products`);
                    return true; // Data was synced
                } else {
                    console.warn(`[${eventType}] ⚠️ Firebase has newer timestamp but invalid data format`);
                    return false;
                }
            } else {
                console.log(`[${eventType}] ✅ localStorage is up-to-date (${(localTimestamp - firebaseTimestamp) / 1000}s newer)`);
                return false; // No sync needed
            }
        } catch (error) {
            console.error(`[${eventType}] ❌ Error checking Firebase:`, error);
            console.log(`[${eventType}] 🔄 Falling back to localStorage (safe mode)`);
            return false; // On error, trust localStorage (safe fallback)
        }
    }

    // Load Orders Data from localStorage
    function loadOrdersData() {
        try {
            const cachedOrders = localStorage.getItem('ordersData');
            if (cachedOrders) {
                ordersData = JSON.parse(cachedOrders);
                console.log(`📦 Đã load ${ordersData.length} đơn hàng từ localStorage`);
            } else {
                console.log('⚠️ Chưa có orders data trong localStorage');
            }
        } catch (error) {
            console.error('Error loading orders data:', error);
            ordersData = [];
        }
    }

    // Setup localStorage event listener (for cross-tab sync)
    function setupLocalStorageListener() {
        // Note: storage event only fires in OTHER tabs, not the current tab
        window.addEventListener('storage', (e) => {
            if (e.key === 'productAssignments') {
                console.log('[STORAGE-EVENT] 🔔 productAssignments changed in another tab!');
                console.log('[STORAGE-EVENT] Old value timestamp:', e.oldValue ? JSON.parse(e.oldValue)?._timestamp : 'null');
                console.log('[STORAGE-EVENT] New value timestamp:', e.newValue ? JSON.parse(e.newValue)?._timestamp : 'null');

                // Reload from localStorage
                loadAssignmentsFromLocalStorage();
            }
        });

        console.log('[STORAGE-EVENT] ✅ localStorage event listener setup complete');
    }

    // Setup visibility change listener (reload when tab becomes visible)
    function setupVisibilityListener() {
        // Flag to prevent duplicate syncs from rapid tab switches
        let isVisibilitySyncing = false;

        document.addEventListener('visibilitychange', async () => {
            if (!document.hidden && !isVisibilitySyncing) {
                isVisibilitySyncing = true;
                console.log('[VISIBILITY] 👁️ Tab became visible, checking for updates...');

                try {
                    // Check Firebase first (background tabs may have stale localStorage)
                    const synced = await syncFromFirebaseIfNewer('VISIBILITY');

                    // Reload data (from localStorage, which may have been synced above)
                    loadAssignmentsFromLocalStorage();

                    // Show notification only if data actually changed
                    if (synced) {
                        showNotification('🔄 Đã đồng bộ dữ liệu mới');
                    }
                } catch (error) {
                    console.error('[VISIBILITY] ❌ Error during sync:', error);
                    // Still load from localStorage as fallback
                    loadAssignmentsFromLocalStorage();
                } finally {
                    // Release lock after 1 second to allow next sync
                    setTimeout(() => {
                        isVisibilitySyncing = false;
                    }, 1000);
                }
            }
        });

        console.log('[VISIBILITY] ✅ Visibility change listener setup complete');
    }

    // Setup focus listener (reload when iframe gains focus)
    function setupFocusListener() {
        // Flag to prevent duplicate syncs
        let isFocusSyncing = false;

        window.addEventListener('focus', async () => {
            if (!isFocusSyncing) {
                isFocusSyncing = true;
                console.log('[FOCUS] 🎯 Tab gained focus, checking for updates...');

                try {
                    // Check Firebase first (may be stale from background)
                    const synced = await syncFromFirebaseIfNewer('FOCUS');

                    // Reload data (from localStorage, which may have been synced above)
                    loadAssignmentsFromLocalStorage();

                    // Show notification only if data actually changed
                    if (synced) {
                        showNotification('🔄 Đã đồng bộ dữ liệu mới');
                    }
                } catch (error) {
                    console.error('[FOCUS] ❌ Error during sync:', error);
                    // Still load from localStorage as fallback
                    loadAssignmentsFromLocalStorage();
                } finally {
                    // Release lock after 500ms (focus is less frequent than visibility)
                    setTimeout(() => {
                        isFocusSyncing = false;
                    }, 500);
                }
            }
        });

        console.log('[FOCUS] ✅ Focus listener setup complete');
    }

    // =====================================================
    // HISTORY & BACKUP SYSTEM
    // =====================================================

    /**
     * Create backup before upload starts
     * @param {Array<string>} uploadedSTTs - STTs to be uploaded
     * @returns {Promise<string>} uploadId for tracking
     */
    async function createBackupBeforeUpload(uploadedSTTs) {
        try {
            console.log('[BACKUP] 📦 Creating backup before upload...');
            console.log('[BACKUP] STTs to upload:', uploadedSTTs);

            // 1. Load current productAssignments from localStorage
            const saved = localStorage.getItem('productAssignments');
            if (!saved) {
                console.log('[BACKUP] ⚠️ No assignments to backup');
                throw new Error('Không có dữ liệu để backup');
            }

            const currentData = JSON.parse(saved);

            // Validate data structure
            if (!currentData.assignments || !Array.isArray(currentData.assignments)) {
                throw new Error('Invalid productAssignments structure');
            }

            // 2. Create unique upload ID
            const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log('[BACKUP] Upload ID:', uploadId);

            // 3. Create backup snapshot
            const backupSnapshot = {
                uploadId: uploadId,
                timestamp: Date.now(),
                assignments: currentData.assignments,
                _timestamp: currentData._timestamp || Date.now(),
                _version: currentData._version || 1,
                uploadedSTTs: uploadedSTTs,
                expiresAt: Date.now() + (30 * 60 * 1000) // 30 minutes
            };

            // 4. Save to Firebase (use uploadId as key to prevent overwrites)
            await database.ref(`productAssignments_backup/${uploadId}`).set(backupSnapshot);

            console.log('[BACKUP] ✅ Backup created successfully');
            console.log('[BACKUP] Backed up:', currentData.assignments.length, 'products');

            return uploadId;

        } catch (error) {
            console.error('[BACKUP] ❌ Error creating backup:', error);
            throw new Error(`Không thể tạo backup: ${error.message}`);
        }
    }

    /**
     * Load backup data from Firebase
     * @param {string} uploadId - Upload ID
     * @returns {Promise<Object>} Backup data
     */
    async function loadBackupData(uploadId) {
        try {
            console.log('[BACKUP] 📥 Loading backup:', uploadId);

            const snapshot = await database.ref(`productAssignments_backup/${uploadId}`).once('value');
            const backup = snapshot.val();

            if (!backup) {
                throw new Error('Backup not found');
            }

            console.log('[BACKUP] ✅ Backup loaded:', backup.assignments.length, 'products');
            return backup;

        } catch (error) {
            console.error('[BACKUP] ❌ Error loading backup:', error);
            throw error;
        }
    }

    /**
     * Save upload history to Firebase
     * @param {string} uploadId - Upload ID
     * @param {Array} results - Upload results
     * @param {string} status - Upload status
     * @param {Object} beforeSnapshot - Snapshot before upload
     * @param {Object|null} afterSnapshot - Snapshot after upload (null if failed)
     */
    async function saveToHistory(uploadId, results, status, beforeSnapshot, afterSnapshot) {
        try {
            console.log('[HISTORY] 💾 Saving upload history:', uploadId);
            console.log('[HISTORY] Status:', status);

            // Build history record
            const historyRecord = {
                uploadId: uploadId,
                timestamp: Date.now(),

                // Snapshots
                beforeSnapshot: {
                    assignments: beforeSnapshot.assignments || [],
                    _timestamp: beforeSnapshot._timestamp,
                    _version: beforeSnapshot._version
                },
                afterSnapshot: afterSnapshot ? {
                    assignments: afterSnapshot.assignments || [],
                    _timestamp: afterSnapshot._timestamp,
                    _version: afterSnapshot._version
                } : null,

                // Upload details
                uploadedSTTs: results.map(r => r.stt),
                uploadResults: results.map(r => ({
                    stt: r.stt,
                    orderId: r.orderId,
                    success: r.success,
                    error: r.error || null
                })),

                // Statistics
                totalSTTs: results.length,
                successCount: results.filter(r => r.success).length,
                failCount: results.filter(r => !r.success).length,

                // Status
                uploadStatus: status,
                canRestore: false, // Always false (restore happens immediately if needed)
                restoredAt: (status === 'failed') ? Date.now() : null,
                committedAt: null, // Will be set when marked as committed

                // Metadata
                note: ""
            };

            // Batch update: Save history AND delete backup in one operation
            const updates = {};
            updates[`productAssignments_history/${uploadId}`] = historyRecord;
            updates[`productAssignments_backup/${uploadId}`] = null; // Delete backup

            await database.ref().update(updates);

            console.log('[HISTORY] ✅ History saved and backup cleaned');

        } catch (error) {
            console.error('[HISTORY] ❌ Error saving history:', error);
            // Don't throw - history is for audit, not critical for operation
            showNotification('⚠️ Không thể lưu lịch sử upload (không ảnh hưởng dữ liệu)', 'warning');
        }
    }

    /**
     * Mark history as committed (finalized, cannot restore)
     * @param {string} uploadId - Upload ID
     */
    async function markHistoryAsCommitted(uploadId) {
        try {
            console.log('[HISTORY] 🔒 Marking history as committed:', uploadId);

            await database.ref(`productAssignments_history/${uploadId}`).update({
                canRestore: false,
                committedAt: Date.now()
            });

            console.log('[HISTORY] ✅ History marked as committed');

        } catch (error) {
            console.error('[HISTORY] ❌ Error marking history:', error);
            // Not critical, just log
        }
    }

    /**
     * Restore from backup when upload fails
     * @param {string} uploadId - Upload ID
     * @returns {Promise<boolean>} Success status
     */
    async function restoreFromBackup(uploadId) {
        try {
            console.log('[RESTORE] 🔄 Restoring from backup:', uploadId);

            // 1. Load backup from Firebase
            const backup = await loadBackupData(uploadId);

            // 2. Validate backup structure
            if (!backup.assignments || !Array.isArray(backup.assignments)) {
                throw new Error('Invalid backup structure');
            }

            // 3. Check backup age (warn if old)
            const backupAge = Date.now() - (backup.timestamp || 0);
            const MAX_BACKUP_AGE = 30 * 60 * 1000; // 30 minutes

            if (backupAge > MAX_BACKUP_AGE) {
                console.warn('[RESTORE] ⚠️ Backup is older than 30 minutes:', Math.floor(backupAge / 60000), 'min');
            }

            // 4. Prepare restored data
            const restoredData = {
                assignments: backup.assignments,
                _timestamp: Date.now(), // New timestamp to trigger sync
                _version: backup._version || 1
            };

            console.log('[RESTORE] 📦 Restoring:', restoredData.assignments.length, 'products');

            // 5. Set flag to prevent Firebase listener from double-rendering
            isLocalUpdate = true;

            // 6. Update localStorage
            localStorage.setItem('productAssignments', JSON.stringify(restoredData));
            console.log('[RESTORE] ✅ Restored to localStorage');

            // 7. Sync to Firebase
            await database.ref('productAssignments').set(restoredData);
            console.log('[RESTORE] ✅ Synced to Firebase');

            // 8. Reload UI
            loadAssignmentsFromLocalStorage();

            // 9. Reset flag after Firebase listener processes
            setTimeout(() => {
                isLocalUpdate = false;
                console.log('[RESTORE] 🔓 isLocalUpdate flag reset');
            }, 2000);

            // 10. Show notification
            showNotification('🔄 Đã khôi phục dữ liệu do upload thất bại');

            console.log('[RESTORE] ✅ Restore completed successfully');
            return true;

        } catch (error) {
            console.error('[RESTORE] ❌ Error restoring from backup:', error);
            isLocalUpdate = false; // Reset flag on error
            showNotification('❌ Lỗi khôi phục dữ liệu: ' + error.message, 'error');
            return false;
        }
    }

    /**
     * Cleanup backup (delete from Firebase)
     * @param {string} uploadId - Upload ID
     */
    async function cleanupBackup(uploadId) {
        try {
            if (!uploadId) return;

            console.log('[CLEANUP] 🗑️ Cleaning up backup:', uploadId);
            await database.ref(`productAssignments_backup/${uploadId}`).remove();
            console.log('[CLEANUP] ✅ Backup cleaned up');

        } catch (error) {
            console.error('[CLEANUP] ❌ Error cleaning up backup:', error);
            // Not critical, just log
        }
    }

    // Initialize on load
    window.addEventListener('load', async () => {
        try {
            console.log('[INIT] 🚀 Initializing Tab Upload TPOS...');

            // Auth handled by tokenManager automatically when needed

            // 1. Load orders data from localStorage
            loadOrdersData();

            // 2. Load assignments from localStorage FIRST (source of truth)
            console.log('[INIT] 📱 Loading from localStorage (source of truth)...');
            loadAssignmentsFromLocalStorage();

            // 3. Setup all listeners (do NOT overwrite localStorage unless Firebase is newer)
            console.log('[INIT] 🔧 Setting up listeners...');
            setupFirebaseListeners();       // Firebase sync (with timestamp check)
            setupLocalStorageListener();    // Cross-tab sync via storage event
            setupVisibilityListener();      // Reload when tab visible
            setupFocusListener();           // Reload when iframe focused

            // 4. Update UI
            updateSelectedCount();

            console.log('[INIT] ✅ Initialization complete!');
        } catch (error) {
            console.error('[INIT] ❌ Initialization error:', error);
            showNotification('Lỗi khởi tạo: ' + error.message, 'error');
        }
    });

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
    window.openUploadHistoryModal = async function() {
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
                        <span class="visually-hidden">Loading...</span>
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
            const snapshot = await database.ref('productAssignments_history')
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
    window.filterUploadHistory = function() {
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
    window.changeHistoryPage = function(page) {
        currentHistoryPage = page;
        renderUploadHistoryList();

        // Scroll to top of list
        document.getElementById('historyListContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    /**
     * View upload history detail
     * Lazy load uploadResults from Firebase
     */
    window.viewUploadHistoryDetail = async function(uploadId) {
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
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-3">Đang tải chi tiết upload...</p>
                </div>
            `;

            // Load full record from Firebase (with uploadResults)
            const snapshot = await database.ref(`productAssignments_history/${uploadId}`).once('value');
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
            <div class="history-detail-info">
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

        // Build upload results table
        html += `
            <h6 class="mb-3"><i class="fas fa-list"></i> Kết Quả Upload Chi Tiết</h6>
            <table class="upload-results-table">
                <thead>
                    <tr>
                        <th style="width: 50px;">Trạng thái</th>
                        <th style="width: 100px;">STT</th>
                        <th style="width: 120px;">Order ID</th>
                        <th>Kết quả / Lỗi</th>
                    </tr>
                </thead>
                <tbody>
        `;

        // Render upload results
        if (record.uploadResults && record.uploadResults.length > 0) {
            record.uploadResults.forEach(result => {
                const isSuccess = result.success;
                const rowClass = isSuccess ? 'result-success' : 'result-failed';
                const icon = isSuccess ? '<i class="fas fa-check-circle result-icon-success"></i>' : '<i class="fas fa-times-circle result-icon-failed"></i>';
                const resultText = isSuccess ? 'Thành công' : 'Thất bại';
                const errorMsg = result.error ? `<div class="result-error-message">${result.error}</div>` : '';

                html += `
                    <tr class="${rowClass}">
                        <td class="text-center">${icon}</td>
                        <td><strong>${result.stt}</strong></td>
                        <td>${result.orderId || 'N/A'}</td>
                        <td>
                            ${resultText}
                            ${errorMsg}
                        </td>
                    </tr>
                `;
            });
        } else {
            html += `
                <tr>
                    <td colspan="4" class="text-center text-muted py-3">
                        Không có dữ liệu upload results
                    </td>
                </tr>
            `;
        }

        html += `
                </tbody>
            </table>
        `;

        // Note section
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

})();
