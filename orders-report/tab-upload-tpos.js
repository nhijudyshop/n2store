// Upload TPOS Tab JavaScript
(function() {
    'use strict';

    // State
    let assignments = [];
    let sessionIndexData = {}; // Group by SessionIndex
    let selectedSessionIndexes = new Set();
    let bearerToken = null;
    let tokenExpiry = null;

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

    // Upload to TPOS
    window.uploadToTPOS = async function() {
        if (selectedSessionIndexes.size === 0) {
            showNotification('Vui lòng chọn SessionIndex để upload', 'error');
            return;
        }

        const selectedSTTs = Array.from(selectedSessionIndexes);
        const selectedData = selectedSTTs.map(stt => sessionIndexData[stt]);

        // Show confirmation
        const confirmMessage = `Bạn có chắc muốn upload ${selectedSTTs.length} đơn hàng lên TPOS?\n\n` +
            selectedData.map(data => {
                const totalProducts = data.products.length;
                return `• STT ${data.stt}: ${totalProducts} sản phẩm - ${data.orderInfo?.customerName || 'N/A'}`;
            }).join('\n');

        if (!confirm(confirmMessage)) {
            return;
        }

        // Show upload modal
        const uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
        uploadModal.show();

        const progressBar = document.getElementById('uploadProgress');
        const statusText = document.getElementById('uploadStatus');

        try {
            let completed = 0;
            const total = selectedData.length;

            for (const data of selectedData) {
                statusText.textContent = `Đang upload STT ${data.stt} - ${data.orderInfo?.customerName || 'N/A'}...`;

                // TODO: Implement actual TPOS API upload here
                // For now, simulate upload
                await new Promise(resolve => setTimeout(resolve, 1000));

                completed++;
                const percentage = Math.round((completed / total) * 100);
                progressBar.style.width = percentage + '%';
                progressBar.textContent = percentage + '%';
            }

            // Success
            statusText.textContent = '✅ Upload thành công!';
            progressBar.classList.remove('bg-primary');
            progressBar.classList.add('bg-success');

            setTimeout(() => {
                uploadModal.hide();
                showNotification(`✅ Đã upload ${total} đơn hàng lên TPOS thành công!`);

                // Clear selection after successful upload
                clearSelection();
            }, 1500);

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

    // Initialize on load
    window.addEventListener('load', async () => {
        try {
            await getValidToken();
            loadAssignments();
            setupFirebaseListeners();
            updateSelectedCount();
        } catch (error) {
            console.error('Initialization error:', error);
            showNotification('Lỗi khởi tạo: ' + error.message, 'error');
        }
    });

})();
