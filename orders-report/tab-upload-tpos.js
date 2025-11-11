// Upload TPOS Tab JavaScript
(function() {
    'use strict';

    // State
    let assignments = [];
    let selectedProducts = new Set();
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

    // Load Assignments Data
    function loadAssignments() {
        try {
            const saved = localStorage.getItem('productAssignments');
            if (saved) {
                assignments = JSON.parse(saved);
                console.log(`📦 Đã load ${assignments.length} sản phẩm từ assignments`);

                // Filter only products with STT assigned
                assignments = assignments.filter(a => a.sttList && a.sttList.length > 0);

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

    // Render Table
    function renderTable() {
        const tbody = document.getElementById('productsTableBody');
        const totalProducts = document.getElementById('totalProducts');

        totalProducts.textContent = assignments.length;

        if (assignments.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted py-5">
                        <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                        <p class="mb-2">Chưa có sản phẩm nào được gán STT</p>
                        <p class="small">Vui lòng vào tab "Gán Sản Phẩm - STT" để thêm sản phẩm</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = assignments.map(assignment => {
            const imageHtml = assignment.imageUrl
                ? `<img src="${assignment.imageUrl}" alt="${assignment.productName}">`
                : `<div class="no-image">📦</div>`;

            // Count occurrences of each STT
            const sttCounts = {};
            assignment.sttList.forEach(item => {
                sttCounts[item.stt] = (sttCounts[item.stt] || 0) + 1;
            });

            // Create badges with count
            const sttBadges = Object.entries(sttCounts).map(([stt, count]) => {
                const orderInfo = assignment.sttList.find(item => item.stt === stt)?.orderInfo;
                const countText = count > 1 ? ` x${count}` : '';
                return `<span class="stt-badge" title="${orderInfo?.customerName || 'N/A'}">
                    <i class="fas fa-hashtag"></i>${stt}${countText}
                </span>`;
            }).join('');

            // Calculate total quantity
            const totalQuantity = assignment.sttList.length;
            const uniqueSTT = Object.keys(sttCounts).length;

            const isSelected = selectedProducts.has(assignment.id);

            return `
                <tr class="${isSelected ? 'selected' : ''}">
                    <td>
                        <input
                            type="checkbox"
                            class="form-check-input product-checkbox"
                            data-product-id="${assignment.id}"
                            ${isSelected ? 'checked' : ''}
                            onchange="handleProductCheckbox(${assignment.id}, this.checked)"
                        >
                    </td>
                    <td class="product-image-cell">
                        ${imageHtml}
                    </td>
                    <td>
                        <div class="product-name">${assignment.productName}</div>
                    </td>
                    <td>
                        <div class="product-code">${assignment.productCode || 'N/A'}</div>
                    </td>
                    <td>
                        <div class="stt-badges-container">
                            ${sttBadges}
                        </div>
                    </td>
                    <td>
                        <div class="quantity-info">
                            <div class="total-quantity">
                                <strong>Tổng SL:</strong> <span class="badge bg-success">${totalQuantity}</span>
                            </div>
                            <div class="unique-stt" style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                                ${uniqueSTT} STT khác nhau
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Update Total Count
    function updateTotalCount() {
        const totalProducts = document.getElementById('totalProducts');
        totalProducts.textContent = assignments.length;
    }

    // Update Selected Count
    function updateSelectedCount() {
        const selectedCount = document.getElementById('selectedCount');
        const uploadBtn = document.getElementById('uploadBtn');
        const actionSection = document.getElementById('actionSection');
        const selectAllCheckbox = document.getElementById('selectAll');

        selectedCount.textContent = selectedProducts.size;

        // Show/hide action section
        if (selectedProducts.size > 0) {
            actionSection.style.display = 'block';
            uploadBtn.disabled = false;
        } else {
            actionSection.style.display = 'none';
            uploadBtn.disabled = true;
        }

        // Update select all checkbox
        if (assignments.length > 0) {
            const allSelected = selectedProducts.size === assignments.length;
            const someSelected = selectedProducts.size > 0 && selectedProducts.size < assignments.length;

            selectAllCheckbox.checked = allSelected;
            selectAllCheckbox.indeterminate = someSelected;
        }
    }

    // Handle Product Checkbox
    window.handleProductCheckbox = function(productId, checked) {
        if (checked) {
            selectedProducts.add(productId);
        } else {
            selectedProducts.delete(productId);
        }

        updateSelectedCount();
        renderTable();
    };

    // Toggle Select All
    window.toggleSelectAll = function() {
        const selectAllCheckbox = document.getElementById('selectAll');
        const isChecked = selectAllCheckbox.checked;

        if (isChecked) {
            // Select all
            assignments.forEach(a => selectedProducts.add(a.id));
        } else {
            // Deselect all
            selectedProducts.clear();
        }

        updateSelectedCount();
        renderTable();
    };

    // Clear Selection
    window.clearSelection = function() {
        selectedProducts.clear();
        document.getElementById('selectAll').checked = false;
        updateSelectedCount();
        renderTable();
    };

    // Upload to TPOS
    window.uploadToTPOS = async function() {
        if (selectedProducts.size === 0) {
            showNotification('Vui lòng chọn sản phẩm để upload', 'error');
            return;
        }

        const selectedAssignments = assignments.filter(a => selectedProducts.has(a.id));

        // Show confirmation
        const confirmMessage = `Bạn có chắc muốn upload ${selectedProducts.size} sản phẩm lên TPOS?\n\n` +
            selectedAssignments.map(a => `• ${a.productName} (${a.sttList.length} STT)`).join('\n');

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
            const total = selectedAssignments.length;

            for (const assignment of selectedAssignments) {
                statusText.textContent = `Đang upload ${assignment.productName}...`;

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
                showNotification(`✅ Đã upload ${total} sản phẩm lên TPOS thành công!`);

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
