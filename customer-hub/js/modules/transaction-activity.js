// customer-hub/js/modules/transaction-activity.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class TransactionActivityModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.currentPage = 1;
        this.limit = 10; // Number of items per page
        this.initUI();
    }

    initUI() {
        if (!this.permissionHelper.hasPermission('customer-hub', 'viewActivities')) {
            this.container.innerHTML = `<p class="text-red-500">Bạn không có quyền truy cập chức năng hoạt động giao dịch tổng hợp.</p>`;
            return;
        }

        this.container.innerHTML = `
            <div class="bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft p-6 mb-6">
                <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Hoạt động giao dịch tổng hợp</h2>
                <div id="transaction-activity-filters" class="mb-4 flex flex-wrap gap-4">
                    <!-- Filter elements will be added here -->
                    <input type="text" id="search-query" placeholder="Tìm kiếm khách hàng/giao dịch..."
                           class="flex-1 min-w-[200px] p-2 border border-border-light dark:border-border-dark rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary">
                    <select id="transaction-type-filter"
                            class="p-2 border border-border-light dark:border-border-dark rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary">
                        <option value="">Tất cả loại</option>
                        <option value="DEPOSIT">Nạp tiền</option>
                        <option value="WITHDRAW">Rút tiền</option>
                        <option value="VIRTUAL_CREDIT">Cấp ảo</option>
                        <option value="VIRTUAL_DEBIT">Trừ ảo</option>
                        <option value="RETURN_CLIENT">Hoàn hàng - Khách</option>
                        <option value="RETURN_SHIPPER">Hoàn hàng - Shipper</option>
                        <option value="COD_ADJUSTMENT">Điều chỉnh COD</option>
                        <option value="OTHER">Khác</option>
                    </select>
                    <input type="date" id="start-date-filter"
                           class="p-2 border border-border-light dark:border-border-dark rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary">
                    <input type="date" id="end-date-filter"
                           class="p-2 border border-border-light dark:border-border-dark rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary">
                    <button id="apply-filters-btn" class="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-md shadow-soft transition-colors duration-200">Áp dụng</button>
                </div>
                <div id="transaction-activity-list" class="overflow-x-auto">
                    <p class="text-gray-500 dark:text-gray-400">Đang tải hoạt động giao dịch...</p>
                </div>
                <div class="flex justify-between items-center mt-4">
                    <button id="prev-page-btn" class="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-md shadow-soft transition-colors duration-200" disabled>Trước</button>
                    <span id="page-info" class="text-gray-700 dark:text-gray-300">Trang 1</span>
                    <button id="next-page-btn" class="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-md shadow-soft transition-colors duration-200" disabled>Tiếp</button>
                </div>
            </div>
        `;

        this.transactionActivityList = this.container.querySelector('#transaction-activity-list');
        this.prevPageBtn = this.container.querySelector('#prev-page-btn');
        this.nextPageBtn = this.container.querySelector('#next-page-btn');
        this.pageInfoSpan = this.container.querySelector('#page-info');
        this.searchQueryInput = this.container.querySelector('#search-query');
        this.transactionTypeFilter = this.container.querySelector('#transaction-type-filter');
        this.startDateFilter = this.container.querySelector('#start-date-filter');
        this.endDateFilter = this.container.querySelector('#end-date-filter');
        this.applyFiltersBtn = this.container.querySelector('#apply-filters-btn');

        this.prevPageBtn.addEventListener('click', () => this.changePage(-1));
        this.nextPageBtn.addEventListener('click', () => this.changePage(1));
        this.applyFiltersBtn.addEventListener('click', () => {
            this.currentPage = 1; // Reset to first page on filter apply
            this.loadConsolidatedTransactions();
        });

        this.loadConsolidatedTransactions();
    }

    async loadConsolidatedTransactions() {
        this.transactionActivityList.innerHTML = `<p class="text-blue-500 dark:text-blue-400">Đang tải hoạt động...</p>`;
        const filters = {
            query: this.searchQueryInput.value,
            type: this.transactionTypeFilter.value,
            startDate: this.startDateFilter.value,
            endDate: this.endDateFilter.value,
        };

        try {
            const response = await apiService.getConsolidatedTransactions(this.currentPage, this.limit, filters);
            if (response.success && response.data && response.data.length > 0) {
                this.renderTransactions(response.data, response.pagination.total);
            } else {
                this.transactionActivityList.innerHTML = `<p class="text-gray-500 dark:text-gray-400">Không có hoạt động giao dịch nào.</p>`;
                this.prevPageBtn.disabled = true;
                this.nextPageBtn.disabled = true;
            }
        } catch (error) {
            this.transactionActivityList.innerHTML = `<p class="text-red-500">Lỗi khi tải hoạt động: ${error.message}</p>`;
            console.error('Error loading consolidated transactions:', error);
            this.prevPageBtn.disabled = true;
            this.nextPageBtn.disabled = true;
        }
    }

    renderTransactions(transactions, total) {
        let tableHtml = `
            <table class="min-w-full bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft">
                <thead>
                    <tr class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase text-sm leading-normal">
                        <th class="py-3 px-6 text-left">Thời gian</th>
                        <th class="py-3 px-6 text-left">Khách hàng</th>
                        <th class="py-3 px-6 text-left">Loại hoạt động</th>
                        <th class="py-3 px-6 text-left">Mô tả</th>
                        <th class="py-3 px-6 text-right">Số tiền</th>
                    </tr>
                </thead>
                <tbody class="text-gray-600 dark:text-gray-400 text-sm font-light">\
        `;

        transactions.forEach(activity => {
            let amountHtml = '';
            let amountClass = 'text-gray-600 dark:text-gray-400';
            if (activity.amount && activity.amount > 0) {
                amountClass = 'text-green-600 font-bold';
            } else if (activity.amount && activity.amount < 0) {
                amountClass = 'text-red-600 font-bold';
            }
            amountHtml = activity.amount ? `<span class="${amountClass}">${this.formatCurrency(activity.amount)}</span>` : 'N/A';


            tableHtml += `
                <tr class="border-b border-border-light dark:border-border-dark hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200">
                    <td class="py-3 px-6 text-left whitespace-nowrap">${new Date(activity.created_at).toLocaleString()}</td>
                    <td class="py-3 px-6 text-left">${activity.customer_name || 'N/A'} (${activity.customer_phone || 'N/A'})</td>
                    <td class="py-3 px-6 text-left">${this.mapActivityType(activity.type)}</td>
                    <td class="py-3 px-6 text-left">${activity.description || 'N/A'}</td>
                    <td class="py-3 px-6 text-right font-mono">${amountHtml}</td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
        `;
        this.transactionActivityList.innerHTML = tableHtml;

        // Update pagination controls
        const totalPages = Math.ceil(total / this.limit);
        this.pageInfoSpan.textContent = `Trang ${this.currentPage} / ${totalPages}`;
        this.prevPageBtn.disabled = this.currentPage === 1;
        this.nextPageBtn.disabled = this.currentPage === totalPages;
    }

    changePage(delta) {
        this.currentPage += delta;
        this.loadConsolidatedTransactions();
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    }

    mapActivityType(type) {
        switch (type) {
            case 'DEPOSIT': return 'Nạp tiền';
            case 'WITHDRAW': return 'Rút tiền';
            case 'VIRTUAL_CREDIT': return 'Cấp ảo';
            case 'VIRTUAL_DEBIT': return 'Trừ ảo';
            case 'RETURN_CLIENT': return 'Hoàn hàng - Khách';
            case 'RETURN_SHIPPER': return 'Hoàn hàng - Shipper';
            case 'COD_ADJUSTMENT': return 'Điều chỉnh COD';
            case 'OTHER': return 'Khác';
            case 'TICKET_CREATED': return 'Tạo Ticket';
            case 'TICKET_UPDATED': return 'Cập nhật Ticket';
            case 'NOTE_ADDED': return 'Thêm Ghi chú';
            case 'CUSTOMER_CREATED': return 'Tạo Khách hàng';
            default: return type || 'N/A';
        }
    }
}
