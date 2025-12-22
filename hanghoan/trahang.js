/* =====================================================
   TRẢ HÀNG - RETURN PRODUCT FUNCTIONALITY
   Separate JS for Trả Hàng tab section
   ===================================================== */

// Trả Hàng Module - Self-contained to avoid conflicts
const TraHangModule = (function() {
    'use strict';

    // State
    let traHangData = [];
    let filteredData = [];
    let isLoading = false;

    // DOM Elements cache
    const elements = {
        tableBody: null,
        emptyState: null,
        loadingState: null,
        searchInput: null,
        statusFilter: null,
        startDate: null,
        endDate: null,
        statTotal: null,
        statConfirmed: null,
        statDraft: null
    };

    // Initialize
    function init() {
        cacheElements();
        bindEvents();
        // Data will be loaded when user provides the method
        console.log('TraHangModule initialized');
    }

    // Cache DOM elements
    function cacheElements() {
        elements.tableBody = document.getElementById('trahangTableBody');
        elements.emptyState = document.getElementById('trahangEmptyState');
        elements.loadingState = document.getElementById('trahangLoadingState');
        elements.searchInput = document.getElementById('trahangSearchInput');
        elements.statusFilter = document.getElementById('trahangStatusFilter');
        elements.startDate = document.getElementById('trahangStartDate');
        elements.endDate = document.getElementById('trahangEndDate');
        elements.statTotal = document.getElementById('trahangStatTotal');
        elements.statConfirmed = document.getElementById('trahangStatConfirmed');
        elements.statDraft = document.getElementById('trahangStatDraft');
    }

    // Bind events
    function bindEvents() {
        // Search input
        if (elements.searchInput) {
            elements.searchInput.addEventListener('input', debounce(handleSearch, 300));
        }

        // Status filter
        if (elements.statusFilter) {
            elements.statusFilter.addEventListener('change', applyFilters);
        }

        // Date filters
        if (elements.startDate) {
            elements.startDate.addEventListener('change', applyFilters);
        }
        if (elements.endDate) {
            elements.endDate.addEventListener('change', applyFilters);
        }

        // Select all checkbox
        const selectAll = document.getElementById('trahangSelectAll');
        if (selectAll) {
            selectAll.addEventListener('change', handleSelectAll);
        }
    }

    // Debounce utility
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Show loading state
    function showLoading() {
        isLoading = true;
        if (elements.loadingState) {
            elements.loadingState.classList.add('show');
        }
        if (elements.tableBody) {
            elements.tableBody.innerHTML = '';
        }
        if (elements.emptyState) {
            elements.emptyState.classList.remove('show');
        }
    }

    // Hide loading state
    function hideLoading() {
        isLoading = false;
        if (elements.loadingState) {
            elements.loadingState.classList.remove('show');
        }
    }

    // Show empty state
    function showEmptyState() {
        if (elements.emptyState) {
            elements.emptyState.classList.add('show');
        }
    }

    // Hide empty state
    function hideEmptyState() {
        if (elements.emptyState) {
            elements.emptyState.classList.remove('show');
        }
    }

    // Format currency
    function formatCurrency(amount) {
        if (!amount && amount !== 0) return '';
        return new Intl.NumberFormat('vi-VN').format(amount);
    }

    // Format date
    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${day}/${month}/${year}<br>${hours}:${minutes}`;
    }

    // Get status class
    function getStatusClass(status) {
        const statusLower = (status || '').toLowerCase();
        if (statusLower.includes('xác nhận') || statusLower === 'confirmed') {
            return 'confirmed';
        } else if (statusLower.includes('nháp') || statusLower === 'draft') {
            return 'draft';
        } else if (statusLower.includes('hủy') || statusLower === 'cancelled') {
            return 'cancelled';
        }
        return 'draft';
    }

    // Get status display text
    function getStatusText(status) {
        const statusLower = (status || '').toLowerCase();
        if (statusLower.includes('xác nhận') || statusLower === 'confirmed') {
            return 'Đã xác nhận';
        } else if (statusLower.includes('nháp') || statusLower === 'draft') {
            return 'Nháp';
        } else if (statusLower.includes('hủy') || statusLower === 'cancelled') {
            return 'Đã hủy';
        }
        return status || 'Nháp';
    }

    // Render table
    function renderTable(data) {
        if (!elements.tableBody) return;

        if (!data || data.length === 0) {
            elements.tableBody.innerHTML = '';
            showEmptyState();
            return;
        }

        hideEmptyState();

        const html = data.map((item, index) => `
            <tr data-id="${item.id || index}">
                <td class="col-checkbox">
                    <input type="checkbox" class="row-checkbox" data-id="${item.id || index}">
                </td>
                <td>
                    <div class="customer-info">
                        <span class="customer-name">${escapeHtml(item.customerName || '')}</span>
                        <span class="customer-phone-label">Điện thoại:</span>
                        <a href="tel:${item.phone || ''}" class="customer-phone">${escapeHtml(item.phone || '')}</a>
                    </div>
                </td>
                <td class="col-date">${formatDate(item.invoiceDate)}</td>
                <td class="col-invoice">${escapeHtml(item.invoiceNumber || '')}</td>
                <td class="col-reference">${escapeHtml(item.reference || '')}</td>
                <td class="col-amount">${formatCurrency(item.totalAmount)}</td>
                <td class="col-amount">${formatCurrency(item.remainingDebt)}</td>
                <td class="col-status">
                    <span class="trahang-status ${getStatusClass(item.status)}">${getStatusText(item.status)}</span>
                </td>
                <td class="col-actions">
                    <button class="action-btn btn-edit" onclick="TraHangModule.editItem('${item.id || index}')" title="Sửa">
                        <i data-lucide="edit-2"></i>
                    </button>
                </td>
                <td class="col-actions">
                    <button class="action-btn btn-delete" onclick="TraHangModule.deleteItem('${item.id || index}')" title="Xóa">
                        <i data-lucide="trash-2"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        elements.tableBody.innerHTML = html;

        // Re-initialize Lucide icons for new elements
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Bind row checkbox events
        bindRowCheckboxEvents();
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Bind row checkbox events
    function bindRowCheckboxEvents() {
        const checkboxes = document.querySelectorAll('#trahangTableBody .row-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', updateSelectAllState);
        });
    }

    // Handle select all
    function handleSelectAll(e) {
        const isChecked = e.target.checked;
        const checkboxes = document.querySelectorAll('#trahangTableBody .row-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
        });
    }

    // Update select all state based on individual checkboxes
    function updateSelectAllState() {
        const selectAll = document.getElementById('trahangSelectAll');
        const checkboxes = document.querySelectorAll('#trahangTableBody .row-checkbox');
        const checkedCount = document.querySelectorAll('#trahangTableBody .row-checkbox:checked').length;

        if (selectAll) {
            selectAll.checked = checkedCount === checkboxes.length && checkboxes.length > 0;
            selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
        }
    }

    // Handle search
    function handleSearch() {
        applyFilters();
    }

    // Apply all filters
    function applyFilters() {
        let result = [...traHangData];

        // Search filter
        const searchTerm = elements.searchInput?.value?.toLowerCase()?.trim() || '';
        if (searchTerm) {
            result = result.filter(item => {
                return (
                    (item.customerName || '').toLowerCase().includes(searchTerm) ||
                    (item.phone || '').toLowerCase().includes(searchTerm) ||
                    (item.invoiceNumber || '').toLowerCase().includes(searchTerm) ||
                    (item.reference || '').toLowerCase().includes(searchTerm)
                );
            });
        }

        // Status filter
        const statusValue = elements.statusFilter?.value || 'all';
        if (statusValue !== 'all') {
            result = result.filter(item => {
                const statusClass = getStatusClass(item.status);
                return statusClass === statusValue;
            });
        }

        // Date range filter
        const startDate = elements.startDate?.value;
        const endDate = elements.endDate?.value;

        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            result = result.filter(item => {
                const itemDate = new Date(item.invoiceDate);
                return itemDate >= start;
            });
        }

        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            result = result.filter(item => {
                const itemDate = new Date(item.invoiceDate);
                return itemDate <= end;
            });
        }

        filteredData = result;
        renderTable(result);
    }

    // Update stats
    function updateStats() {
        const total = traHangData.length;
        const confirmed = traHangData.filter(item => getStatusClass(item.status) === 'confirmed').length;
        const draft = traHangData.filter(item => getStatusClass(item.status) === 'draft').length;

        if (elements.statTotal) elements.statTotal.textContent = total;
        if (elements.statConfirmed) elements.statConfirmed.textContent = confirmed;
        if (elements.statDraft) elements.statDraft.textContent = draft;
    }

    // Load data - this function will be called externally when user provides data source
    function loadData(data) {
        showLoading();

        try {
            traHangData = data || [];
            filteredData = [...traHangData];

            hideLoading();
            renderTable(traHangData);
            updateStats();
        } catch (error) {
            console.error('Error loading data:', error);
            hideLoading();
            showEmptyState();
        }
    }

    // Set data source function - user can override this
    function setDataSource(fetchFunction) {
        if (typeof fetchFunction === 'function') {
            showLoading();
            fetchFunction()
                .then(data => {
                    loadData(data);
                })
                .catch(error => {
                    console.error('Error fetching data:', error);
                    hideLoading();
                    showEmptyState();
                });
        }
    }

    // Edit item - placeholder for user to implement
    function editItem(id) {
        console.log('Edit item:', id);
        const item = traHangData.find(d => (d.id || '').toString() === id.toString());
        if (item) {
            // User can implement their own edit logic
            console.log('Item data:', item);
            alert('Chức năng sửa sẽ được triển khai sau. ID: ' + id);
        }
    }

    // Delete item - placeholder for user to implement
    function deleteItem(id) {
        console.log('Delete item:', id);
        if (confirm('Bạn có chắc muốn xóa mục này?')) {
            // User can implement their own delete logic
            console.log('Deleting item with ID:', id);
            alert('Chức năng xóa sẽ được triển khai sau. ID: ' + id);
        }
    }

    // Refresh data
    function refresh() {
        applyFilters();
    }

    // Get selected items
    function getSelectedItems() {
        const checkboxes = document.querySelectorAll('#trahangTableBody .row-checkbox:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.dataset.id);
        return traHangData.filter(item => selectedIds.includes((item.id || '').toString()));
    }

    // Public API
    return {
        init,
        loadData,
        setDataSource,
        editItem,
        deleteItem,
        refresh,
        getSelectedItems,
        getData: () => traHangData,
        getFilteredData: () => filteredData
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize if we're on the correct page
    if (document.getElementById('trahangTableBody')) {
        TraHangModule.init();
    }
});

// Tab switching functionality
function initMainTabs() {
    const tabBtns = document.querySelectorAll('.main-tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const targetTab = this.dataset.tab;

            // Remove active from all tabs
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active to clicked tab
            this.classList.add('active');
            const targetContent = document.getElementById(targetTab);
            if (targetContent) {
                targetContent.classList.add('active');
            }

            // Re-initialize Lucide icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
    });
}

// Initialize tabs when DOM is ready
document.addEventListener('DOMContentLoaded', initMainTabs);
