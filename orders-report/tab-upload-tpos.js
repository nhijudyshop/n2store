// Upload TPOS Tab JavaScript
(function() {
    'use strict';

    // State
    let assignments = [];
    let sessionIndexData = {}; // Group by SessionIndex
    let selectedSessionIndexes = new Set();
    let bearerToken = null;
    let tokenExpiry = null;
    let ordersData = []; // Orders data from tab1

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

        updateSelectedCount();
        renderTable();
    };

    // Toggle Select All
    window.toggleSelectAll = function() {
        const selectAllCheckbox = document.getElementById('selectAll');
        const isChecked = selectAllCheckbox.checked;

        if (isChecked) {
            // Select all SessionIndexes
            Object.keys(sessionIndexData).forEach(stt => selectedSessionIndexes.add(stt));
        } else {
            // Deselect all
            selectedSessionIndexes.clear();
        }

        updateSelectedCount();
        renderTable();
    };

    // Clear Selection
    window.clearSelection = function() {
        selectedSessionIndexes.clear();
        document.getElementById('selectAll').checked = false;
        updateSelectedCount();
        renderTable();
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

                    const response = await authenticatedFetch(apiUrl);
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

            // Store fetched products in sessionIndexData
            results.forEach(result => {
                if (result.orderData && sessionIndexData[result.stt]) {
                    // Parse products from Details and store in sessionIndexData
                    sessionIndexData[result.stt].fetchedProducts = (result.orderData.Details || []).map(detail => ({
                        code: detail.Product?.Code || detail.ProductCode || '',
                        name: detail.Product?.NameGet || detail.ProductName || '',
                        nameGet: detail.Product?.NameGet || detail.ProductName || '',
                        quantity: detail.Quantity || 0,
                        price: detail.Price || 0,
                        imageUrl: detail.Product?.Image1 || ''
                    }));
                    console.log(`💾 Stored ${sessionIndexData[result.stt].fetchedProducts.length} products for STT ${result.stt}`);
                }
            });

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

            // Count assigned products
            const assignedProductCounts = {};
            data.products.forEach(product => {
                const key = product.productId;
                if (!assignedProductCounts[key]) {
                    assignedProductCounts[key] = {
                        ...product,
                        count: 0
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
                            <!-- Assigned Products -->
                            <div class="col-md-6">
                                <h6 class="text-success">
                                    <i class="fas fa-plus-circle"></i> Sản phẩm đã gán (${Object.keys(assignedProductCounts).length})
                                </h6>
                                <table class="table table-sm">
                                    <thead>
                                        <tr>
                                            <th>Sản phẩm</th>
                                            <th class="text-center">SL</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${Object.values(assignedProductCounts).map(product => `
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center gap-2">
                                                        ${product.imageUrl ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">` : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                        <div>
                                                            <div style="font-weight: 600;">${product.productName}</div>
                                                            <div style="font-size: 12px; color: #6b7280;">${product.productCode || 'N/A'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td class="text-center">
                                                    <span class="badge bg-success">${product.count}</span>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>

                            <!-- Original Order Products -->
                            <div class="col-md-6">
                                <h6 class="text-info">
                                    <i class="fas fa-box"></i> Sản phẩm có sẵn (${orderProducts.length})
                                </h6>
                                ${orderProducts.length > 0 ? `
                                    <table class="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>Sản phẩm</th>
                                                <th class="text-center">SL</th>
                                                <th class="text-end">Giá</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${orderProducts.map(product => `
                                                <tr>
                                                    <td>
                                                        <div class="d-flex align-items-center gap-2">
                                                            ${product.imageUrl ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">` : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                            <div>
                                                                <div style="font-weight: 600;">${product.nameGet || product.name}</div>
                                                                <div style="font-size: 12px; color: #6b7280;">${product.code || 'N/A'}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td class="text-center">
                                                        <span class="badge bg-info">${product.quantity}</span>
                                                    </td>
                                                    <td class="text-end">
                                                        <span style="font-weight: 600; color: #3b82f6;">${(product.price || 0).toLocaleString('vi-VN')}đ</span>
                                                    </td>
                                                </tr>
                                            `).join('')}
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
                    // Fetch current order data
                    console.log(`📡 Fetching order ${orderId} for upload...`);
                    const apiUrl = `https://tomato.tpos.vn/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product),Partner,User,CRMTeam`;
                    const response = await authenticatedFetch(apiUrl);

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

                    // PUT request to update order
                    const uploadResponse = await authenticatedFetch(
                        `https://tomato.tpos.vn/odata/SaleOnline_Order(${orderId})`,
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
    async function prepareUploadDetails(orderData, sessionData) {
        const existingDetails = orderData.Details || [];
        const assignedProducts = sessionData.products || [];

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
                    count: 0
                };
            }
            assignedByProductId[productId].count++;
        });

        // Merge: Update quantities for existing, add new products
        const mergedDetails = [...existingDetails];

        // Process assigned products: update existing or fetch and add new
        const newProductIds = [];

        Object.keys(assignedByProductId).forEach(productId => {
            const assignedData = assignedByProductId[productId];
            const existingDetail = existingByProductId[productId];

            if (existingDetail) {
                // Product exists - add to quantity
                existingDetail.Quantity += assignedData.count;
                console.log(`   ✏️ Updated ${existingDetail.ProductCode}: +${assignedData.count} (total: ${existingDetail.Quantity})`);
            } else {
                // New product - need to fetch and add
                console.log(`   ➕ Will fetch and add new product: ${assignedData.productCode} x${assignedData.count}`);
                newProductIds.push(productId);
            }
        });

        // Fetch product info for new products from TPOS API
        if (newProductIds.length > 0) {
            console.log(`\n🔍 Fetching ${newProductIds.length} new products from TPOS...`);

            const fetchPromises = newProductIds.map(async productId => {
                try {
                    const apiUrl = `https://tomato.tpos.vn/odata/Product(${productId})`;
                    console.log(`   📡 Fetching product: ${productId}`);

                    const response = await authenticatedFetch(apiUrl);
                    if (!response.ok) {
                        console.error(`   ❌ Failed to fetch product ${productId}: ${response.status}`);
                        return null;
                    }

                    const productData = await response.json();
                    console.log(`   ✅ Fetched product: ${productData.Code} - ${productData.NameGet}`);
                    console.log(`   📋 Product data fields:`, {
                        Code: productData.Code,
                        Name: productData.Name,
                        NameGet: productData.NameGet,
                        Price: productData.Price,
                        UOMId: productData.UOMId,
                        UOMName: productData.UOMName,
                        Weight: productData.Weight,
                        Image1: productData.Image1
                    });
                    return {
                        productId: productId,
                        productData: productData
                    };
                } catch (error) {
                    console.error(`   ❌ Error fetching product ${productId}:`, error);
                    return null;
                }
            });

            const fetchedProducts = await Promise.all(fetchPromises);

            // Add new products to mergedDetails
            fetchedProducts.forEach(result => {
                if (!result || !result.productData) return;

                const productId = result.productId;
                const productData = result.productData;
                const assignedData = assignedByProductId[productId];

                // Create new Detail object matching existing details structure EXACTLY
                const newDetail = {
                    // Note: No Id field - this is a new detail, API will create it
                    Quantity: assignedData.count,
                    Price: productData.Price || 0,
                    ProductId: parseInt(productId), // MUST be number, not string
                    ProductName: productData.Name,
                    ProductNameGet: productData.NameGet || productData.Name,
                    ProductCode: productData.Code,
                    UOMId: productData.UOMId || 1,
                    UOMName: productData.UOMName || 'Cái',
                    Note: null,
                    Factor: 1,
                    OrderId: orderData.Id,
                    Priority: 0,
                    ImageUrl: productData.Image1 || '',
                    LiveCampaign_DetailId: null,
                    IsOrderPriority: null,
                    QuantityRegex: null,
                    IsDisabledLiveCampaignDetail: false,
                    ProductWeight: productData.Weight || 0,
                    CreatedById: orderData.UserId || null
                };

                mergedDetails.push(newDetail);
                console.log(`   ✅ Added new product: ${newDetail.ProductCode} x${newDetail.Quantity}`);
                console.log(`   🔍 newDetail structure:`, JSON.stringify(newDetail, null, 2));
            });
        }

        console.log(`   📦 Final details count: ${mergedDetails.length}`);
        return mergedDetails;
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
            console.log(`[PAYLOAD] Processing ${payload.Details.length} details...`);

            payload.Details = payload.Details.map((detail, index) => {
                console.log(`[PAYLOAD] Detail[${index}] BEFORE processing:`, {
                    hasId: !!detail.Id,
                    ProductId: detail.ProductId,
                    ProductIdType: typeof detail.ProductId,
                    ProductCode: detail.ProductCode,
                    UOMName: detail.UOMName,
                    hasAllFields: !!(detail.ProductCode && detail.Note !== undefined && detail.Priority !== undefined)
                });

                const cleaned = { ...detail };

                // CRITICAL: Remove nested "Product" object (only for GET, not for PUT)
                if (cleaned.Product) {
                    delete cleaned.Product;
                    console.log(`[PAYLOAD FIX] Detail[${index}]: Removed nested Product object`);
                }

                // Remove Id if null/undefined (new products that need to be created)
                // Keep Id if exists (existing products that need to be updated)
                if (!cleaned.Id || cleaned.Id === null || cleaned.Id === undefined) {
                    delete cleaned.Id;
                    console.log(`[PAYLOAD FIX] Detail[${index}]: Removed Id:null for ProductId:`, cleaned.ProductId, `(type: ${typeof cleaned.ProductId})`);
                } else {
                    console.log(`[PAYLOAD] Detail[${index}]: Keeping existing Id:`, cleaned.Id);
                }

                // Ensure OrderId matches the parent order (for existing details)
                if (cleaned.Id) {
                    cleaned.OrderId = payload.Id;
                }

                // For new details (no Id), ensure minimum required fields
                // ProductId, ProductName, ProductNameGet, UOMId, UOMName, Quantity, Price, Factor, ProductWeight

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
            // Fetch order data from TPOS API
            const apiUrl = `https://tomato.tpos.vn/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product),Partner,User,CRMTeam`;
            const response = await authenticatedFetch(apiUrl);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            currentEditOrderData = await response.json();

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
                        imageUrl: detail.Product?.Image1 || '',
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
            await getValidToken();
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
