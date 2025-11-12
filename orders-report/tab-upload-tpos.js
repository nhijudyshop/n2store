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

    // Load Assignments Data and Group by SessionIndex
    function loadAssignments() {
        try {
            const saved = localStorage.getItem('productAssignments');
            if (saved) {
                assignments = JSON.parse(saved);
                console.log(`📦 Đã load ${assignments.length} sản phẩm từ assignments`);

                // Filter only products with STT assigned
                assignments = assignments.filter(a => a.sttList && a.sttList.length > 0);

                // Group by SessionIndex
                groupBySessionIndex();
                renderTable();
                updateTotalCount();
            } else {
                console.log('⚠️ Chưa có assignments data');
            }
        } catch (error) {
            console.error('Error loading assignments:', error);
            assignments = [];
        }
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
                            ${orderId ? `<button class="btn btn-sm btn-outline-primary mt-1" onclick="openEditModal('${stt}', '${orderId}')" title="Chỉnh sửa"><i class="fas fa-edit"></i></button>` : ''}
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

                        <!-- Legend -->
                        <div class="alert alert-light mt-3 mb-0">
                            <small>
                                <strong><i class="fas fa-info-circle"></i> Chú thích:</strong><br>
                                <span class="badge bg-success me-2"><i class="fas fa-star"></i> Mới</span> Sản phẩm mới sẽ được thêm vào đơn hàng<br>
                                <span class="badge bg-warning text-dark me-2"><i class="fas fa-plus"></i> Cộng SL</span> Sản phẩm đã có, sẽ cộng thêm số lượng<br>
                                <span class="badge bg-warning text-dark me-2"><i class="fas fa-arrow-up"></i></span> Đánh dấu sản phẩm có sẵn sẽ được cập nhật
                            </small>
                        </div>
                    </div>
                </div>
            `;
        });

        modalBody.innerHTML = html;
    }

    // Confirm Upload - Proceed with Actual Upload
    window.confirmUpload = async function() {
        // Hide preview modal
        const previewModal = bootstrap.Modal.getInstance(document.getElementById('previewModal'));
        if (previewModal) {
            previewModal.hide();
        }

        const selectedSTTs = Array.from(selectedSessionIndexes);

        // Show upload modal
        const uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
        uploadModal.show();

        const progressBar = document.getElementById('uploadProgress');
        const statusText = document.getElementById('uploadStatus');

        try {
            let completed = 0;
            const total = selectedSTTs.length;
            const results = [];

            for (const stt of selectedSTTs) {
                const sessionData = sessionIndexData[stt];
                if (!sessionData) continue;

                const orderId = sessionData.orderInfo?.orderId;
                if (!orderId) continue;

                statusText.textContent = `Đang upload STT ${stt} - ${sessionData.orderInfo?.customerName || 'N/A'}...`;

                try {
                    // Fetch current order data (EXACTLY like tab1-orders.js)
                    console.log(`📡 Fetching order ${orderId} for upload...`);
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
                        throw new Error(`Failed to fetch order ${orderId}: ${response.status}`);
                    }

                    const orderData = await response.json();
                    console.log(`✅ Fetched order data:`, orderData);

                    // Prepare new Details: merge existing products with assigned products
                    const mergedDetails = await prepareUploadDetails(orderData, sessionData);

                    // Update orderData with merged Details
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

                    // Prepare payload for PUT request
                    const payload = prepareUploadPayload(orderData);

                    console.log(`📤 Uploading order ${orderId}...`);
                    console.log(`   Details count: ${payload.Details.length}`);
                    console.log(`   Total Quantity: ${payload.TotalQuantity}`);
                    console.log(`   Total Amount: ${payload.TotalAmount}`);
                    console.log(`   Payload size: ${JSON.stringify(payload).length} bytes`);

                    // Log full payload for debugging (can be removed in production)
                    if (console.groupCollapsed) {
                        console.groupCollapsed(`📋 Full Payload for ${payload.Code}`);
                        console.log(JSON.stringify(payload, null, 2));
                        console.groupEnd();
                    }

                    // =====================================================
                    // PUT REQUEST (EXACTLY like tab1-orders.js - line 1796-1810)
                    // =====================================================
                    
                    // Get auth headers from tokenManager
                    const uploadHeaders = await window.tokenManager.getAuthHeader();
                    
                    // PUT request to update order
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

                    console.log(`✅ Successfully uploaded order ${orderId}`);
                    results.push({ stt, orderId, success: true });

                } catch (error) {
                    console.error(`❌ Error uploading STT ${stt}:`, error);
                    results.push({ stt, orderId, success: false, error: error.message });
                }

                completed++;
                const percentage = Math.round((completed / total) * 100);
                progressBar.style.width = percentage + '%';
                progressBar.textContent = percentage + '%';
            }

            // Check results
            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            if (failCount === 0) {
                // All success
                statusText.textContent = `✅ Upload thành công ${successCount} đơn hàng!`;
                progressBar.classList.remove('bg-primary');
                progressBar.classList.add('bg-success');

                setTimeout(() => {
                    uploadModal.hide();
                    showNotification(`✅ Đã upload ${successCount} đơn hàng lên TPOS thành công!`);
                    clearSelection();
                }, 1500);
            } else {
                // Some failed
                statusText.textContent = `⚠️ Thành công: ${successCount}, Thất bại: ${failCount}`;
                progressBar.classList.remove('bg-primary');
                progressBar.classList.add('bg-warning');

                setTimeout(() => {
                    uploadModal.hide();
                    showNotification(`⚠️ Upload hoàn tất: ${successCount} thành công, ${failCount} thất bại`, 'error');
                }, 2000);
            }

        } catch (error) {
            console.error('Upload error:', error);
            statusText.textContent = '❌ Upload thất bại: ' + error.message;
            progressBar.classList.remove('bg-primary');
            progressBar.classList.add('bg-danger');

            setTimeout(() => {
                uploadModal.hide();
                showNotification('❌ Upload thất bại: ' + error.message, 'error');
            }, 2000);
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

    // Setup Firebase Listeners
    function setupFirebaseListeners() {
        database.ref('productAssignments').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && Array.isArray(data)) {
                assignments = data.filter(a => a.sttList && a.sttList.length > 0);
                localStorage.setItem('productAssignments', JSON.stringify(data));
                groupBySessionIndex();
                renderTable();
                updateTotalCount();
                console.log('🔄 Đã sync assignments từ Firebase');
            }
        });
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

    // Initialize on load
    window.addEventListener('load', async () => {
        try {
            // Auth handled by tokenManager automatically when needed
            loadOrdersData();
            loadAssignments();
            setupFirebaseListeners();
            updateSelectedCount();
        } catch (error) {
            console.error('Initialization error:', error);
            showNotification('Lỗi khởi tạo: ' + error.message, 'error');
        }
    });

})();
