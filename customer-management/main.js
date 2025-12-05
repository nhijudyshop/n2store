// Customer Management System
let customers = [];
let filteredCustomers = [];
let editingCustomerId = null;

// Pagination state
let currentPage = 1;
let pageSize = 100;
let totalCustomers = 0;
let lastVisible = null;
let firstVisible = null;
let isSearching = false;

// TPOS API Configuration - using Cloudflare Worker proxy
const CLOUDFLARE_PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const TPOS_API_URL = `${CLOUDFLARE_PROXY}/api/odata/Partner/ODataService.GetViewV2`;
let isSyncing = false;
let tposAccessToken = null;

// Check authentication - Admin only
if (typeof authManager !== 'undefined') {
    if (!authManager.requireAuth()) {
        throw new Error('Authentication required');
    }
    if (!authManager.isAdmin()) {
        alert('Chỉ Admin mới có quyền truy cập trang này');
        window.location.href = '../index.html';
        throw new Error('Admin permission required');
    }
}

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(window.FIREBASE_CONFIG);
}

// Firebase references
const db = firebase.firestore();
const customersCollection = db.collection('customers');

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
    // Load customers first (fast - only 100 records)
    await loadCustomers();
    initializeEventListeners();
    lucide.createIcons();

    // Load statistics in background (slow - don't block UI)
    loadTotalCountAndStats();

    // Auto-sync from TPOS if needed
    autoSyncFromTPOS();
});

// Initialize event listeners
function initializeEventListeners() {
    // Button listeners
    document.getElementById('addCustomerBtn').addEventListener('click', openAddCustomerModal);
    document.getElementById('importExcelBtn').addEventListener('click', openImportModal);
    document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);
    document.getElementById('syncTPOSBtn').addEventListener('click', syncFromTPOS);
    document.getElementById('selectAll').addEventListener('click', handleSelectAll);

    // Pagination
    document.getElementById('prevPageBtn').addEventListener('click', goToPreviousPage);
    document.getElementById('nextPageBtn').addEventListener('click', goToNextPage);
    document.getElementById('pageSizeSelect').addEventListener('change', handlePageSizeChange);

    // Search and filter
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    document.getElementById('statusFilter').addEventListener('change', handleFilter);

    // Form submission
    document.getElementById('customerForm').addEventListener('submit', handleCustomerSubmit);

    // Excel file input
    document.getElementById('excelFile').addEventListener('change', handleFileSelect);

    // Import confirmation
    document.getElementById('confirmImportBtn').addEventListener('click', handleImportConfirm);

    // Drag and drop for file upload
    const uploadArea = document.getElementById('uploadArea');
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
}

// Load total customer count and statistics (runs in background)
async function loadTotalCountAndStats() {
    try {
        // Show loading state
        document.getElementById('totalCount').textContent = '...';
        document.getElementById('normalCount').textContent = '...';
        document.getElementById('dangerCount').textContent = '...';
        document.getElementById('warningCount').textContent = '...';
        document.getElementById('criticalCount').textContent = '...';
        document.getElementById('vipCount').textContent = '...';

        // Load counts (this is slow for 80K records but doesn't block UI)
        const [totalSnap, normalSnap, dangerSnap, warningSnap, criticalSnap, vipSnap] = await Promise.all([
            customersCollection.get(),
            customersCollection.where('status', '==', 'Bình thường').get(),
            customersCollection.where('status', '==', 'Bom hàng').get(),
            customersCollection.where('status', '==', 'Cảnh báo').get(),
            customersCollection.where('status', '==', 'Nguy hiểm').get(),
            customersCollection.where('status', '==', 'VIP').get()
        ]);

        totalCustomers = totalSnap.size;

        document.getElementById('totalCount').textContent = formatNumber(totalSnap.size);
        document.getElementById('normalCount').textContent = formatNumber(normalSnap.size);
        document.getElementById('dangerCount').textContent = formatNumber(dangerSnap.size);
        document.getElementById('warningCount').textContent = formatNumber(warningSnap.size);
        document.getElementById('criticalCount').textContent = formatNumber(criticalSnap.size);
        document.getElementById('vipCount').textContent = formatNumber(vipSnap.size);

        updatePaginationUI();
    } catch (error) {
        console.error('Error loading statistics:', error);
        document.getElementById('totalCount').textContent = '?';
    }
}

// Load customers from Firebase with pagination
async function loadCustomers(direction = 'next') {
    showLoading(true);
    try {
        let query = customersCollection.orderBy('createdAt', 'desc').limit(pageSize);

        if (direction === 'next' && lastVisible) {
            query = query.startAfter(lastVisible);
        } else if (direction === 'prev' && firstVisible) {
            query = customersCollection
                .orderBy('createdAt', 'desc')
                .endBefore(firstVisible)
                .limitToLast(pageSize);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            customers = [];
            filteredCustomers = [];
            renderCustomers();
            updatePaginationUI();
            showEmptyState(true);
            return;
        }

        // Store pagination cursors
        firstVisible = snapshot.docs[0];
        lastVisible = snapshot.docs[snapshot.docs.length - 1];

        customers = [];
        snapshot.forEach(doc => {
            customers.push({
                id: doc.id,
                ...doc.data()
            });
        });

        filteredCustomers = [...customers];
        renderCustomers();
        updatePaginationUI();
        showEmptyState(false);
    } catch (error) {
        console.error('Error loading customers:', error);
        showNotification('Lỗi khi tải dữ liệu khách hàng', 'error');
    } finally {
        showLoading(false);
    }
}

// Update pagination UI
function updatePaginationUI() {
    const totalPages = Math.ceil(totalCustomers / pageSize);
    document.getElementById('pageInfo').textContent = `Trang ${currentPage} / ${totalPages} (${totalCustomers} khách hàng)`;
    document.getElementById('prevPageBtn').disabled = currentPage === 1;
    document.getElementById('nextPageBtn').disabled = currentPage >= totalPages;
}

// Go to previous page
async function goToPreviousPage() {
    if (currentPage > 1) {
        currentPage--;
        await loadCustomers('prev');
    }
}

// Go to next page
async function goToNextPage() {
    const totalPages = Math.ceil(totalCustomers / pageSize);
    if (currentPage < totalPages) {
        currentPage++;
        await loadCustomers('next');
    }
}

// Handle page size change
async function handlePageSizeChange(e) {
    pageSize = parseInt(e.target.value);
    currentPage = 1;
    lastVisible = null;
    firstVisible = null;
    await loadCustomers();
}

// Render customers in table
function renderCustomers() {
    const tbody = document.getElementById('customerTableBody');
    tbody.innerHTML = '';

    if (filteredCustomers.length === 0) {
        showEmptyState(true);
        return;
    }

    showEmptyState(false);

    filteredCustomers.forEach(customer => {
        const row = createCustomerRow(customer);
        tbody.appendChild(row);
    });

    lucide.createIcons();
}

// Create customer table row
function createCustomerRow(customer) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>
            <input type="checkbox" class="customer-checkbox" data-id="${customer.id}">
        </td>
        <td>
            <div class="customer-name">
                <span class="name">${escapeHtml(customer.name || '')}</span>
                <span class="status-badge ${getStatusClass(customer.status)}">${customer.status || 'Bình thường'}</span>
            </div>
        </td>
        <td>
            <div class="customer-phone">
                <span class="phone">${escapeHtml(customer.phone || '')}</span>
                ${customer.carrier ? `<span class="carrier">${customer.carrier}</span>` : ''}
            </div>
        </td>
        <td>${escapeHtml(customer.email || '')}</td>
        <td>${escapeHtml(customer.address || '')}</td>
        <td>
            ${customer.phone ? `<a href="https://zalo.me/${customer.phone}" target="_blank" class="zalo-link" title="Chat Zalo">
                <i data-lucide="message-circle"></i>
            </a>` : ''}
        </td>
        <td>
            <div class="debt-amount ${customer.debt > 0 ? 'negative' : 'positive'}">
                ${formatNumber(customer.debt || 0)}
            </div>
        </td>
        <td>
            ${customer.active !== false ? '<div class="active-badge"><i data-lucide="check"></i></div>' : ''}
        </td>
        <td>
            <div class="action-buttons">
                <button class="icon-btn edit" onclick="openEditCustomerModal('${customer.id}')" title="Sửa">
                    <i data-lucide="edit"></i>
                </button>
                <button class="icon-btn delete" onclick="deleteCustomer('${customer.id}')" title="Xóa">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </td>
    `;
    return tr;
}

// Get status CSS class
function getStatusClass(status) {
    const statusMap = {
        'Bình thường': 'normal',
        'Bom hàng': 'danger',
        'Cảnh báo': 'warning',
        'Nguy hiểm': 'critical',
        'VIP': 'vip'
    };
    return statusMap[status] || 'normal';
}

// Update statistics - load from entire database (runs in background)
function updateStatistics() {
    // Run in background, don't await
    loadTotalCountAndStats().catch(err => {
        console.error('Failed to update statistics:', err);
    });
}

// Search handler - only searches current page
function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase().trim();

    if (searchTerm === '') {
        filteredCustomers = [...customers];
    } else {
        // Search only in current page
        filteredCustomers = customers.filter(customer => {
            return (
                (customer.name || '').toLowerCase().includes(searchTerm) ||
                (customer.phone || '').toLowerCase().includes(searchTerm) ||
                (customer.email || '').toLowerCase().includes(searchTerm) ||
                (customer.address || '').toLowerCase().includes(searchTerm)
            );
        });
    }

    applyStatusFilter();
}

// Filter handler
function handleFilter() {
    applyStatusFilter();
}

// Apply status filter
function applyStatusFilter() {
    const statusFilter = document.getElementById('statusFilter').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();

    // Start with all customers or search results
    let result = customers;

    if (searchTerm !== '') {
        result = result.filter(customer => {
            return (
                (customer.name || '').toLowerCase().includes(searchTerm) ||
                (customer.phone || '').toLowerCase().includes(searchTerm) ||
                (customer.email || '').toLowerCase().includes(searchTerm) ||
                (customer.address || '').toLowerCase().includes(searchTerm)
            );
        });
    }

    if (statusFilter !== '') {
        result = result.filter(customer => {
            return (customer.status || 'Bình thường') === statusFilter;
        });
    }

    filteredCustomers = result;
    renderCustomers();
}

// Open add customer modal
function openAddCustomerModal() {
    editingCustomerId = null;
    document.getElementById('modalTitle').textContent = 'Thêm Khách Hàng';
    document.getElementById('customerForm').reset();
    document.getElementById('customerId').value = '';
    document.getElementById('customerActive').checked = true;
    document.getElementById('customerStatus').value = 'Bình thường';
    document.getElementById('customerModal').classList.add('active');
}

// Open edit customer modal
function openEditCustomerModal(customerId) {
    editingCustomerId = customerId;
    const customer = customers.find(c => c.id === customerId);

    if (!customer) {
        showNotification('Không tìm thấy khách hàng', 'error');
        return;
    }

    document.getElementById('modalTitle').textContent = 'Sửa Thông Tin Khách Hàng';
    document.getElementById('customerId').value = customer.id;
    document.getElementById('customerName').value = customer.name || '';
    document.getElementById('customerPhone').value = customer.phone || '';
    document.getElementById('customerCarrier').value = customer.carrier || '';
    document.getElementById('customerStatus').value = customer.status || 'Bình thường';
    document.getElementById('customerEmail').value = customer.email || '';
    document.getElementById('customerAddress').value = customer.address || '';
    document.getElementById('customerDebt').value = customer.debt || 0;
    document.getElementById('customerActive').checked = customer.active !== false;

    document.getElementById('customerModal').classList.add('active');
}

// Close customer modal
function closeCustomerModal() {
    document.getElementById('customerModal').classList.remove('active');
    document.getElementById('customerForm').reset();
    editingCustomerId = null;
}

// Handle customer form submit
async function handleCustomerSubmit(e) {
    e.preventDefault();

    const customerData = {
        name: document.getElementById('customerName').value.trim(),
        phone: document.getElementById('customerPhone').value.trim(),
        carrier: document.getElementById('customerCarrier').value,
        status: document.getElementById('customerStatus').value,
        email: document.getElementById('customerEmail').value.trim(),
        address: document.getElementById('customerAddress').value.trim(),
        debt: parseFloat(document.getElementById('customerDebt').value) || 0,
        active: document.getElementById('customerActive').checked,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (editingCustomerId) {
            // Update existing customer
            await customersCollection.doc(editingCustomerId).update(customerData);
            showNotification('Cập nhật khách hàng thành công', 'success');
        } else {
            // Add new customer
            customerData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await customersCollection.add(customerData);
            showNotification('Thêm khách hàng thành công', 'success');
        }

        closeCustomerModal();
        // Update statistics in background if adding new customer
        if (!editingCustomerId) {
            updateStatistics();
        }
        await loadCustomers();
    } catch (error) {
        console.error('Error saving customer:', error);
        showNotification('Lỗi khi lưu khách hàng', 'error');
    }
}

// Delete customer
async function deleteCustomer(customerId) {
    const customer = customers.find(c => c.id === customerId);

    if (!confirm(`Bạn có chắc chắn muốn xóa khách hàng "${customer.name}"?`)) {
        return;
    }

    try {
        await customersCollection.doc(customerId).delete();
        showNotification('Xóa khách hàng thành công', 'success');
        updateStatistics(); // Update in background
        await loadCustomers();
    } catch (error) {
        console.error('Error deleting customer:', error);
        showNotification('Lỗi khi xóa khách hàng', 'error');
    }
}

// Handle select all
function handleSelectAll(e) {
    const checkboxes = document.querySelectorAll('.customer-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
}

// Open import modal
function openImportModal() {
    document.getElementById('importModal').classList.add('active');
    document.getElementById('previewSection').style.display = 'none';
    document.getElementById('excelFile').value = '';
}

// Close import modal
function closeImportModal() {
    document.getElementById('importModal').classList.remove('active');
}

// Handle file select
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        processExcelFile(file);
    }
}

// Handle drag over
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
}

// Handle drag leave
function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
}

// Handle drop
function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
        processExcelFile(file);
    } else {
        showNotification('Vui lòng chọn file Excel (.xlsx hoặc .xls)', 'error');
    }
}

// Process Excel file
let importData = [];

function processExcelFile(file) {
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            // Map Excel columns to customer fields
            importData = jsonData.map(row => ({
                name: row['Tên'] || row['Ten'] || '',
                phone: String(row['Điện thoại'] || row['Dien thoai'] || '').trim(),
                email: row['Email'] || '',
                address: row['Địa chỉ'] || row['Dia chi'] || '',
                status: row['Trạng thái'] || row['Trang thai'] || 'Bình thường',
                carrier: detectCarrier(String(row['Điện thoại'] || row['Dien thoai'] || '')),
                debt: parseFloat(row['Nợ'] || row['No'] || row['Doanh số đầu kỳ Nhóm'] || 0) || 0,
                active: true
            })).filter(customer => customer.name && customer.phone);

            if (importData.length === 0) {
                showNotification('Không tìm thấy dữ liệu hợp lệ trong file Excel', 'error');
                return;
            }

            displayPreview();
        } catch (error) {
            console.error('Error processing Excel file:', error);
            showNotification('Lỗi khi đọc file Excel', 'error');
        }
    };

    reader.readAsArrayBuffer(file);
}

// Detect carrier from phone number
function detectCarrier(phone) {
    const phoneClean = phone.replace(/\D/g, '');

    // Viettel prefixes
    if (/^(086|096|097|098|032|033|034|035|036|037|038|039)/.test(phoneClean)) {
        return 'Viettel';
    }
    // Vinaphone prefixes
    if (/^(088|091|094|083|084|085|081|082)/.test(phoneClean)) {
        return 'Vinaphone';
    }
    // Mobifone prefixes
    if (/^(089|090|093|070|079|077|076|078)/.test(phoneClean)) {
        return 'Mobifone';
    }
    // Vietnamobile prefixes
    if (/^(092|056|058)/.test(phoneClean)) {
        return 'Vietnamobile';
    }
    // Gmobile prefixes
    if (/^(099|059)/.test(phoneClean)) {
        return 'Gmobile';
    }

    return '';
}

// Display preview of import data
function displayPreview() {
    const previewBody = document.getElementById('previewTableBody');
    previewBody.innerHTML = '';

    importData.slice(0, 100).forEach(customer => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(customer.name)}</td>
            <td>${escapeHtml(customer.phone)}</td>
            <td>${escapeHtml(customer.email)}</td>
            <td>${escapeHtml(customer.address)}</td>
            <td><span class="status-badge ${getStatusClass(customer.status)}">${customer.status}</span></td>
        `;
        previewBody.appendChild(tr);
    });

    document.getElementById('previewCount').textContent = importData.length;
    document.getElementById('previewSection').style.display = 'block';

    lucide.createIcons();
}

// Handle import confirm
async function handleImportConfirm() {
    if (importData.length === 0) {
        showNotification('Không có dữ liệu để import', 'error');
        return;
    }

    const confirmBtn = document.getElementById('confirmImportBtn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Đang import...';

    try {
        let batch = db.batch();
        let count = 0;

        for (const customer of importData) {
            const docRef = customersCollection.doc();
            batch.set(docRef, {
                ...customer,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            count++;

            // Firestore batch limit is 500
            if (count % 500 === 0) {
                await batch.commit();
                batch = db.batch(); // Create new batch after commit
            }
        }

        // Commit remaining
        if (count % 500 !== 0) {
            await batch.commit();
        }

        showNotification(`Import thành công ${importData.length} khách hàng`, 'success');
        closeImportModal();
        updateStatistics(); // Update in background
        await loadCustomers();
    } catch (error) {
        console.error('Error importing customers:', error);
        showNotification('Lỗi khi import khách hàng', 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i data-lucide="check"></i> Xác nhận Import';
        lucide.createIcons();
    }
}

// Export to Excel
function exportToExcel() {
    if (customers.length === 0) {
        showNotification('Không có dữ liệu để export', 'error');
        return;
    }

    const exportData = customers.map(customer => ({
        'Tên': customer.name || '',
        'Điện thoại': customer.phone || '',
        'Email': customer.email || '',
        'Địa chỉ': customer.address || '',
        'Nhà mạng': customer.carrier || '',
        'Trạng thái': customer.status || 'Bình thường',
        'Nợ hiện tại': customer.debt || 0,
        'Kích hoạt': customer.active !== false ? 'Có' : 'Không'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Khách hàng');

    const fileName = `khach-hang-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    showNotification('Export Excel thành công', 'success');
}

// ============================================
// TPOS API SYNCHRONIZATION
// ============================================

// Get TPOS access token (cached by Cloudflare Worker)
async function getTPOSToken() {
    try {
        // Check if we have a valid cached token
        if (tposAccessToken) {
            return tposAccessToken;
        }

        const response = await fetch(`${CLOUDFLARE_PROXY}/api/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=password&username=nvkt&password=Aa%40123456789&client_id=tmtWebApp'
        });

        if (!response.ok) {
            throw new Error(`Failed to get token: ${response.status}`);
        }

        const tokenData = await response.json();
        if (!tokenData.access_token) {
            throw new Error('No access_token in response');
        }

        // Cache token
        tposAccessToken = tokenData.access_token;

        // Clear cache before token expires (expires_in is in seconds)
        if (tokenData.expires_in) {
            setTimeout(() => {
                tposAccessToken = null;
            }, (tokenData.expires_in - 300) * 1000); // Refresh 5 min before expiry
        }

        console.log('✅ TPOS token obtained');
        return tposAccessToken;
    } catch (error) {
        console.error('Error getting TPOS token:', error);
        throw error;
    }
}

// Fetch customers from TPOS API
async function fetchTPOSCustomers(skip = 0, top = 100) {
    try {
        // Get access token first
        const token = await getTPOSToken();

        const url = `${TPOS_API_URL}?$skip=${skip}&$top=${top}&$orderby=CreatedDate desc`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            // If 401, clear token cache and retry once
            if (response.status === 401 && tposAccessToken) {
                console.log('Token expired, refreshing...');
                tposAccessToken = null;
                const newToken = await getTPOSToken();

                const retryResponse = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${newToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!retryResponse.ok) {
                    throw new Error(`HTTP error! status: ${retryResponse.status}`);
                }

                const retryData = await retryResponse.json();
                return {
                    count: retryData['@odata.count'] || 0,
                    customers: retryData.value || []
                };
            }

            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return {
            count: data['@odata.count'] || 0,
            customers: data.value || []
        };
    } catch (error) {
        console.error('Error fetching from TPOS:', error);
        throw error;
    }
}

// Map TPOS customer to Firestore format
function mapTPOSToFirestore(tposCustomer) {
    // Detect carrier from phone
    const carrier = detectCarrier(tposCustomer.Phone || '');

    // Map status
    let status = 'Bình thường';
    if (tposCustomer.Status) {
        const statusLower = tposCustomer.Status.toLowerCase();
        if (statusLower.includes('bom') || statusLower.includes('danger')) {
            status = 'Bom hàng';
        } else if (statusLower.includes('cảnh báo') || statusLower.includes('warning')) {
            status = 'Cảnh báo';
        } else if (statusLower.includes('nguy hiểm') || statusLower.includes('critical')) {
            status = 'Nguy hiểm';
        } else if (statusLower.includes('vip')) {
            status = 'VIP';
        }
    }

    return {
        tposId: tposCustomer.Id,
        name: tposCustomer.Name || '',
        phone: (tposCustomer.Phone || '').trim(),
        email: tposCustomer.Email || '',
        address: tposCustomer.Street || '',
        carrier: carrier,
        status: status,
        debt: parseFloat(tposCustomer.Credit || 0) || 0,
        active: tposCustomer.IsActive !== false,
        tposData: {
            code: tposCustomer.Code,
            createdDate: tposCustomer.CreatedDate,
            modifiedDate: tposCustomer.ModifiedDate
        }
    };
}

// Check if customer already exists
async function customerExists(phone, tposId) {
    try {
        // Check by phone
        if (phone) {
            const phoneQuery = await customersCollection.where('phone', '==', phone).limit(1).get();
            if (!phoneQuery.empty) {
                return true;
            }
        }

        // Check by TPOS ID
        if (tposId) {
            const tposIdQuery = await customersCollection.where('tposId', '==', tposId).limit(1).get();
            if (!tposIdQuery.empty) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('Error checking customer existence:', error);
        return false;
    }
}

// Sync customers from TPOS
async function syncFromTPOS() {
    if (isSyncing) {
        showNotification('Đang đồng bộ, vui lòng đợi...', 'warning');
        return;
    }

    isSyncing = true;
    const syncBtn = document.getElementById('syncTPOSBtn');
    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Đang đồng bộ...';
        lucide.createIcons();
    }

    try {
        showNotification('Bắt đầu đồng bộ từ TPOS...', 'info');

        let skip = 0;
        const top = 100;
        let newCustomersCount = 0;
        let duplicateFound = false;
        let batch = db.batch();
        let batchCount = 0;

        while (!duplicateFound) {
            // Fetch customers from TPOS
            const result = await fetchTPOSCustomers(skip, top);

            if (!result.customers || result.customers.length === 0) {
                break; // No more customers
            }

            console.log(`Fetched ${result.customers.length} customers from TPOS (skip: ${skip})`);

            // Process each customer
            for (const tposCustomer of result.customers) {
                // Skip if no phone number
                if (!tposCustomer.Phone || !tposCustomer.Phone.trim()) {
                    continue;
                }

                // Check if customer already exists
                const exists = await customerExists(tposCustomer.Phone, tposCustomer.Id);

                if (exists) {
                    console.log(`Duplicate found: ${tposCustomer.Name} (${tposCustomer.Phone})`);
                    duplicateFound = true;
                    break;
                }

                // Map and add new customer
                const customerData = mapTPOSToFirestore(tposCustomer);
                const docRef = customersCollection.doc();
                batch.set(docRef, {
                    ...customerData,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                batchCount++;
                newCustomersCount++;

                // Commit batch every 500 documents
                if (batchCount >= 500) {
                    await batch.commit();
                    console.log(`Committed batch of ${batchCount} customers`);
                    batch = db.batch();
                    batchCount = 0;
                }
            }

            if (duplicateFound) {
                break;
            }

            // Move to next page
            skip += top;

            // Safety limit to prevent infinite loop
            if (skip >= 10000) {
                console.log('Reached safety limit of 10000 customers');
                break;
            }
        }

        // Commit remaining customers
        if (batchCount > 0) {
            await batch.commit();
            console.log(`Committed final batch of ${batchCount} customers`);
        }

        // Save sync timestamp
        localStorage.setItem('lastTPOSSync', new Date().toISOString());

        if (newCustomersCount > 0) {
            showNotification(`Đồng bộ thành công ${newCustomersCount} khách hàng mới từ TPOS`, 'success');

            // Reload data
            updateStatistics(); // Update in background
            currentPage = 1;
            lastVisible = null;
            firstVisible = null;
            await loadCustomers();
        } else {
            showNotification('Không có khách hàng mới để đồng bộ', 'info');
        }
    } catch (error) {
        console.error('Error syncing from TPOS:', error);
        showNotification('Lỗi khi đồng bộ từ TPOS: ' + error.message, 'error');
    } finally {
        isSyncing = false;
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Sync từ TPOS';
            lucide.createIcons();
        }
    }
}

// Auto-sync on page load if needed
async function autoSyncFromTPOS() {
    try {
        const lastSync = localStorage.getItem('lastTPOSSync');
        const now = new Date();

        // Auto-sync if never synced or last sync was more than 1 hour ago
        if (!lastSync) {
            console.log('No previous sync found, skipping auto-sync');
            return;
        }

        const lastSyncDate = new Date(lastSync);
        const hoursSinceSync = (now - lastSyncDate) / (1000 * 60 * 60);

        if (hoursSinceSync >= 1) {
            console.log(`Auto-syncing from TPOS (${hoursSinceSync.toFixed(1)} hours since last sync)`);
            await syncFromTPOS();
        }
    } catch (error) {
        console.error('Error during auto-sync:', error);
    }
}

// Utility functions
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showEmptyState(show) {
    document.getElementById('emptyState').style.display = show ? 'block' : 'none';
    document.querySelector('.table-container').style.display = show ? 'none' : 'block';
}

function showNotification(message, type = 'info') {
    // Use common-utils if available
    if (window.showFloatingNotification) {
        window.showFloatingNotification(message, type);
    } else {
        alert(message);
    }
}

function formatNumber(num) {
    return new Intl.NumberFormat('vi-VN').format(num);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions globally available
window.openEditCustomerModal = openEditCustomerModal;
window.closeCustomerModal = closeCustomerModal;
window.closeImportModal = closeImportModal;
window.deleteCustomer = deleteCustomer;
