// Customer Management System
let customers = [];
let filteredCustomers = [];
let editingCustomerId = null;

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
    await loadCustomers();
    initializeEventListeners();
    lucide.createIcons();
});

// Initialize event listeners
function initializeEventListeners() {
    // Button listeners
    document.getElementById('addCustomerBtn').addEventListener('click', openAddCustomerModal);
    document.getElementById('importExcelBtn').addEventListener('click', openImportModal);
    document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);
    document.getElementById('selectAll').addEventListener('click', handleSelectAll);

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

// Load customers from Firebase
async function loadCustomers() {
    showLoading(true);
    try {
        const snapshot = await customersCollection.get();
        customers = [];
        snapshot.forEach(doc => {
            customers.push({
                id: doc.id,
                ...doc.data()
            });
        });

        filteredCustomers = [...customers];
        renderCustomers();
        updateStatistics();
        showEmptyState(customers.length === 0);
    } catch (error) {
        console.error('Error loading customers:', error);
        showNotification('Lỗi khi tải dữ liệu khách hàng', 'error');
    } finally {
        showLoading(false);
    }
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

// Update statistics
function updateStatistics() {
    const stats = {
        total: customers.length,
        normal: customers.filter(c => c.status === 'Bình thường' || !c.status).length,
        danger: customers.filter(c => c.status === 'Bom hàng').length,
        warning: customers.filter(c => c.status === 'Cảnh báo').length,
        critical: customers.filter(c => c.status === 'Nguy hiểm').length,
        vip: customers.filter(c => c.status === 'VIP').length
    };

    document.getElementById('totalCount').textContent = stats.total;
    document.getElementById('normalCount').textContent = stats.normal;
    document.getElementById('dangerCount').textContent = stats.danger;
    document.getElementById('warningCount').textContent = stats.warning;
    document.getElementById('criticalCount').textContent = stats.critical;
    document.getElementById('vipCount').textContent = stats.vip;
}

// Search handler
function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase().trim();

    if (searchTerm === '') {
        filteredCustomers = [...customers];
    } else {
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
        const batch = db.batch();
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
            }
        }

        // Commit remaining
        if (count % 500 !== 0) {
            await batch.commit();
        }

        showNotification(`Import thành công ${importData.length} khách hàng`, 'success');
        closeImportModal();
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
