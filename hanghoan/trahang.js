/* =====================================================
   TRẢ HÀNG - RETURN PRODUCT FUNCTIONALITY
   Simple Excel Import & Display
   ===================================================== */

// Trả Hàng Module - Simple version
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
        setDefaultDates();
        console.log('TraHangModule initialized (Simple version)');
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

    // Set default dates (1 month ago to today)
    function setDefaultDates() {
        const today = new Date();
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        if (elements.startDate) {
            elements.startDate.value = formatDateForInput(oneMonthAgo);
        }
        if (elements.endDate) {
            elements.endDate.value = formatDateForInput(today);
        }
    }

    // Format date for input[type="date"]
    function formatDateForInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
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

    // Format date for display
    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        return `${day}/${month}/${year}`;
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

    // Render table - match Excel structure exactly
    function renderTable(data) {
        if (!elements.tableBody) return;

        if (!data || data.length === 0) {
            elements.tableBody.innerHTML = '';
            showEmptyState();
            return;
        }

        hideEmptyState();

        const html = data.map((item, index) => `
            <tr data-index="${index}">
                <td class="text-center">${item.stt || index + 1}</td>
                <td>${escapeHtml(item.khachHang || '')}</td>
                <td>${escapeHtml(item.facebook || '')}</td>
                <td><a href="tel:${item.dienThoai || ''}" class="phone-link">${escapeHtml(item.dienThoai || '')}</a></td>
                <td class="col-address">${escapeHtml(item.diaChi || '')}</td>
                <td>${escapeHtml(item.so || '')}</td>
                <td>${escapeHtml(item.thamChieu || '')}</td>
                <td class="text-center">${formatDate(item.ngayBan)}</td>
                <td class="text-right">${formatCurrency(item.tongTien)}</td>
                <td class="text-right">${formatCurrency(item.conNo)}</td>
                <td class="text-center">
                    <span class="trahang-status ${getStatusClass(item.trangThai)}">${escapeHtml(item.trangThai || '')}</span>
                </td>
                <td>${escapeHtml(item.congTy || '')}</td>
            </tr>
        `).join('');

        elements.tableBody.innerHTML = html;

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Handle search
    function handleSearch() {
        applyFilters();
    }

    // Apply filters
    function applyFilters() {
        let result = [...traHangData];

        // Search filter
        const searchTerm = elements.searchInput?.value?.toLowerCase()?.trim() || '';
        if (searchTerm) {
            result = result.filter(item => {
                return (
                    (item.khachHang || '').toLowerCase().includes(searchTerm) ||
                    (item.dienThoai || '').toLowerCase().includes(searchTerm) ||
                    (item.so || '').toLowerCase().includes(searchTerm) ||
                    (item.thamChieu || '').toLowerCase().includes(searchTerm) ||
                    (item.diaChi || '').toLowerCase().includes(searchTerm)
                );
            });
        }

        // Status filter
        const statusValue = elements.statusFilter?.value || 'all';
        if (statusValue !== 'all') {
            result = result.filter(item => {
                const statusClass = getStatusClass(item.trangThai);
                return statusClass === statusValue;
            });
        }

        // Date range filter
        const startDate = elements.startDate?.value;
        const endDate = elements.endDate?.value;

        if (startDate || endDate) {
            result = result.filter(item => {
                if (!item.ngayBan) return false;

                const itemDate = new Date(item.ngayBan);
                if (isNaN(itemDate.getTime())) return false;

                if (startDate) {
                    const start = new Date(startDate);
                    if (itemDate < start) return false;
                }

                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    if (itemDate > end) return false;
                }

                return true;
            });
        }

        filteredData = result;
        renderTable(result);
        updateStats();
    }

    // Update stats
    function updateStats() {
        const total = filteredData.length;
        const confirmed = filteredData.filter(item => getStatusClass(item.trangThai) === 'confirmed').length;
        const draft = filteredData.filter(item => getStatusClass(item.trangThai) === 'draft').length;

        if (elements.statTotal) elements.statTotal.textContent = total;
        if (elements.statConfirmed) elements.statConfirmed.textContent = confirmed;
        if (elements.statDraft) elements.statDraft.textContent = draft;
    }

    /**
     * Import Excel file
     */
    async function importExcel(file) {
        if (!file) return;

        showLoading();
        if (typeof showNotification === 'function') {
            showNotification('Đang đọc file Excel...', 'info');
        }

        try {
            // Load XLSX library if not already loaded
            if (typeof XLSX === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
                document.head.appendChild(script);
                await new Promise((resolve, reject) => {
                    script.onload = resolve;
                    script.onerror = reject;
                });
            }

            // Read Excel file
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

            // Read with header row starting at row 3 (skip title rows)
            const rows = XLSX.utils.sheet_to_json(firstSheet, {
                range: 2, // Start from row 3 (0-indexed, so 2)
                defval: null // Default value for empty cells
            });

            console.log(`Read ${rows.length} rows from Excel`);

            if (rows.length === 0) {
                hideLoading();
                if (typeof showNotification === 'function') {
                    showNotification('File Excel không có dữ liệu', 'warning');
                }
                return;
            }

            // Map Excel rows - match exact column names
            // Excel structure: STT, Khách hàng, Facebook, Điện thoại, Địa chỉ, Số, Tham chiếu, Ngày bán, Tổng tiền, Còn nợ, Trạng thái, Công ty
            const importedData = rows.map((row, index) => ({
                stt: row['STT'] || index + 1,
                khachHang: row['Khách hàng'] || '',
                facebook: row['Facebook'] || '',
                dienThoai: row['Điện thoại'] || '',
                diaChi: row['Địa chỉ'] || '',
                so: row['Số'] || '',
                thamChieu: row['Tham chiếu'] || '',
                ngayBan: row['Ngày bán'] || null,
                tongTien: parseFloat(row['Tổng tiền'] || 0),
                conNo: parseFloat(row['Còn nợ'] || 0),
                trangThai: row['Trạng thái'] || 'Nháp',
                congTy: row['Công ty'] || ''
            }));

            // Load data
            traHangData = importedData;
            filteredData = [...traHangData];

            hideLoading();
            renderTable(traHangData);
            updateStats();

            if (typeof showNotification === 'function') {
                showNotification(`Đã nhập ${importedData.length} đơn hàng từ Excel`, 'success');
            }

        } catch (error) {
            console.error('Error importing Excel:', error);
            hideLoading();

            if (typeof showNotification === 'function') {
                showNotification('Lỗi khi nhập Excel: ' + error.message, 'error');
            }
        }
    }

    // Public API
    return {
        init,
        importExcel,
        getData: () => traHangData,
        getFilteredData: () => filteredData
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize if we're on the correct page
    if (document.getElementById('trahangTableBody')) {
        TraHangModule.init();

        // Import Excel button
        const btnImportExcel = document.getElementById('btnImportExcel');
        const excelFileInput = document.getElementById('excelFileInput');

        if (btnImportExcel && excelFileInput) {
            btnImportExcel.addEventListener('click', () => {
                excelFileInput.click();
            });

            excelFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    btnImportExcel.disabled = true;
                    try {
                        await TraHangModule.importExcel(file);
                    } finally {
                        btnImportExcel.disabled = false;
                        excelFileInput.value = ''; // Reset file input
                        // Reinitialize Lucide icons
                        if (typeof lucide !== 'undefined') {
                            lucide.createIcons();
                        }
                    }
                }
            });
        }
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
