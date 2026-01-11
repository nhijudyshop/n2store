// customer-hub/js/modules/transaction-activity.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class TransactionActivityModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.currentPage = 1;
        this.limit = 10;
        this.totalItems = 0;
        this.initUI();
    }

    initUI() {
        if (!this.permissionHelper.hasPermission('customer-hub', 'viewActivities')) {
            this.container.innerHTML = `<p class="text-red-500">Bạn không có quyền truy cập chức năng hoạt động giao dịch tổng hợp.</p>`;
            return;
        }

        this.container.innerHTML = `
            <!-- Filters & Actions Area -->
            <div class="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4 py-2 mb-6">
                <!-- Left: Search & Filters -->
                <div class="flex flex-col sm:flex-row gap-3 w-full lg:w-auto flex-1">
                    <!-- Search -->
                    <div class="relative w-full sm:w-80 group">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span class="material-symbols-outlined text-slate-400 group-focus-within:text-primary transition-colors">search</span>
                        </div>
                        <input id="search-input" class="block w-full pl-10 pr-3 py-2.5 border border-border-light dark:border-border-dark rounded-lg leading-5 bg-background-light dark:bg-background-dark placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm transition-all shadow-sm" placeholder="Tìm theo ID, khách hàng, số tiền..." type="text"/>
                    </div>
                    <!-- Event Type Filter -->
                    <div class="relative w-full sm:w-48">
                        <select id="type-filter" class="w-full bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg py-2.5 pl-3 pr-10 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm shadow-sm">
                            <option value="">Tất cả loại</option>
                            <option value="DEPOSIT">Nạp tiền</option>
                            <option value="WITHDRAW">Rút tiền</option>
                            <option value="VIRTUAL_CREDIT">Cấp ảo</option>
                            <option value="VIRTUAL_DEBIT">Trừ ảo</option>
                            <option value="RETURN_CLIENT">Hoàn hàng - Khách</option>
                            <option value="RETURN_SHIPPER">Hoàn hàng - Shipper</option>
                            <option value="COD_ADJUSTMENT">Điều chỉnh COD</option>
                            <option value="customer_ticket">Sự vụ</option>
                            <option value="OTHER">Khác</option>
                        </select>
                    </div>
                    <!-- Date Range -->
                    <div class="relative w-full sm:w-48">
                        <select id="date-filter" class="w-full bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg py-2.5 pl-3 pr-10 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm shadow-sm">
                            <option value="">Tất cả thời gian</option>
                            <option value="7">7 ngày gần đây</option>
                            <option value="30" selected>30 ngày gần đây</option>
                            <option value="90">90 ngày gần đây</option>
                        </select>
                    </div>
                </div>
                <!-- Right: Actions -->
                <div class="flex items-center gap-3">
                    <button id="apply-filters-btn" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-opacity-80 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary">
                        <span class="material-symbols-outlined text-[20px]">filter_list</span>
                        <span>Áp dụng</span>
                    </button>
                    <button class="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white border border-transparent rounded-lg text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors">
                        <span class="material-symbols-outlined text-[20px]">download</span>
                        <span>Xuất CSV</span>
                    </button>
                </div>
            </div>

            <!-- Data Grid -->
            <div class="bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark overflow-hidden flex flex-col flex-1">
                <div class="overflow-x-auto custom-scrollbar">
                    <table class="min-w-full divide-y divide-border-light dark:divide-border-dark">
                        <thead class="bg-slate-50 dark:bg-black/20">
                            <tr>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[180px]" scope="col">Thời gian</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider" scope="col">Khách hàng</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider" scope="col">Loại sự kiện</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider" scope="col">Mô tả</th>
                                <th class="px-6 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider" scope="col">Số tiền</th>
                                <th class="px-6 py-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider" scope="col">Trạng thái</th>
                                <th class="relative px-6 py-3" scope="col">
                                    <span class="sr-only">Hành động</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody id="transaction-table-body" class="bg-white dark:bg-surface-dark divide-y divide-border-light dark:divide-border-dark">
                            <tr>
                                <td colspan="7" class="py-8 text-center text-blue-500">
                                    <span class="material-symbols-outlined text-4xl mb-2 animate-spin">progress_activity</span>
                                    <p>Đang tải dữ liệu...</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <!-- Pagination -->
                <div class="bg-white dark:bg-surface-dark px-4 py-3 flex items-center justify-between border-t border-border-light dark:border-border-dark sm:px-6">
                    <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                        <div>
                            <p class="text-sm text-slate-700 dark:text-slate-300">
                                Hiển thị <span class="font-medium" id="showing-start">0</span> đến <span class="font-medium" id="showing-end">0</span> trong <span class="font-medium" id="total-count">0</span> kết quả
                            </p>
                        </div>
                        <div>
                            <nav aria-label="Pagination" class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" id="pagination-nav">
                            </nav>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.searchInput = this.container.querySelector('#search-input');
        this.typeFilter = this.container.querySelector('#type-filter');
        this.dateFilter = this.container.querySelector('#date-filter');
        this.applyFiltersBtn = this.container.querySelector('#apply-filters-btn');
        this.tableBody = this.container.querySelector('#transaction-table-body');

        this.applyFiltersBtn.addEventListener('click', () => {
            this.currentPage = 1;
            this.loadTransactions();
        });

        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.currentPage = 1;
                this.loadTransactions();
            }
        });

        this.loadTransactions();
    }

    async loadTransactions() {
        this.tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="py-8 text-center text-blue-500">
                    <span class="material-symbols-outlined text-4xl mb-2 animate-spin">progress_activity</span>
                    <p>Đang tải hoạt động...</p>
                </td>
            </tr>
        `;

        const filters = {
            query: this.searchInput.value,
            type: this.typeFilter.value,
        };

        // Calculate date range
        const days = this.dateFilter.value;
        if (days) {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - parseInt(days));
            filters.startDate = startDate.toISOString().split('T')[0];
            filters.endDate = endDate.toISOString().split('T')[0];
        }

        try {
            const response = await apiService.getConsolidatedTransactions(this.currentPage, this.limit, filters);
            if (response.success && response.data && response.data.length > 0) {
                this.totalItems = response.pagination?.total || response.data.length;
                this.renderTransactions(response.data);
            } else {
                this.tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="py-8 text-center text-slate-500">
                            <span class="material-symbols-outlined text-4xl mb-2">inbox</span>
                            <p>Không có hoạt động giao dịch nào.</p>
                        </td>
                    </tr>
                `;
                this.updatePagination(0);
            }
        } catch (error) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="py-8 text-center text-red-500">
                        <span class="material-symbols-outlined text-4xl mb-2">error</span>
                        <p>Lỗi khi tải hoạt động: ${error.message}</p>
                    </td>
                </tr>
            `;
            console.error('Error loading consolidated transactions:', error);
        }
    }

    renderTransactions(transactions) {
        const avatarColors = ['purple', 'blue', 'orange', 'teal', 'indigo', 'pink', 'green', 'cyan'];

        let html = '';
        transactions.forEach((activity, index) => {
            const colorClass = avatarColors[index % avatarColors.length];
            const initials = this.getInitials(activity.customer_name);
            const eventTypeInfo = this.getEventTypeInfo(activity.type);
            const statusBadge = this.getStatusBadge(activity.color || 'blue');
            const amountHtml = this.formatAmount(activity.amount);
            const timestamp = this.formatTimestamp(activity.created_at);

            html += `
                <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400 font-mono">
                        ${timestamp}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="h-8 w-8 rounded-full bg-${colorClass}-100 dark:bg-${colorClass}-900/30 text-${colorClass}-600 dark:text-${colorClass}-400 flex items-center justify-center text-xs font-bold mr-3">
                                ${initials}
                            </div>
                            <div class="text-sm font-medium text-primary dark:text-blue-400 hover:underline cursor-pointer" onclick="window.openCustomerModal('${activity.customer_phone}')">${activity.customer_name || 'Chưa xác định'}</div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                            <span class="material-symbols-outlined text-[18px] text-slate-400">${eventTypeInfo.icon}</span>
                            ${eventTypeInfo.text}
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate" title="${activity.description || ''}">
                        ${activity.description || 'N/A'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-mono font-medium ${amountHtml.colorClass}">
                        ${amountHtml.text}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-center">
                        ${statusBadge}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button class="text-slate-400 hover:text-primary dark:hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <span class="material-symbols-outlined text-[20px]">more_vert</span>
                        </button>
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;
        this.updatePagination(this.totalItems);
    }

    getInitials(name) {
        if (!name) return 'KH';
        const words = name.trim().split(' ');
        if (words.length >= 2) {
            return (words[0][0] + words[words.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    getEventTypeInfo(type) {
        const typeMap = {
            'DEPOSIT': { text: 'Nạp tiền', icon: 'savings' },
            'WITHDRAW': { text: 'Rút tiền', icon: 'payments' },
            'VIRTUAL_CREDIT': { text: 'Cấp ảo', icon: 'add_card' },
            'VIRTUAL_DEBIT': { text: 'Trừ ảo', icon: 'credit_card_off' },
            'RETURN_CLIENT': { text: 'Hoàn hàng - Khách', icon: 'assignment_return' },
            'RETURN_SHIPPER': { text: 'Hoàn hàng - Shipper', icon: 'local_shipping' },
            'COD_ADJUSTMENT': { text: 'Điều chỉnh COD', icon: 'tune' },
            'OTHER': { text: 'Khác', icon: 'more_horiz' },
            'TICKET_CREATED': { text: 'Tạo Ticket', icon: 'confirmation_number' },
            'TICKET_UPDATED': { text: 'Cập nhật Ticket', icon: 'edit_note' },
            'NOTE_ADDED': { text: 'Thêm Ghi chú', icon: 'sticky_note_2' },
            'CUSTOMER_CREATED': { text: 'Tạo Khách hàng', icon: 'person_add' },
            'customer_ticket': { text: 'Sự vụ', icon: 'confirmation_number' },
        };

        return typeMap[type] || { text: type || 'N/A', icon: 'help' };
    }

    getStatusBadge(color) {
        const colorMap = {
            'green': { text: 'Hoàn thành', class: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-800' },
            'yellow': { text: 'Chờ xử lý', class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-800' },
            'red': { text: 'Thất bại', class: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-800' },
            'blue': { text: 'Đang xử lý', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-800' },
        };

        const config = colorMap[color] || colorMap['blue'];
        return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.class} border border-transparent dark:border-${color}-800">${config.text}</span>`;
    }

    formatAmount(amount) {
        if (amount === null || amount === undefined) {
            return { text: '-', colorClass: 'text-slate-400 dark:text-slate-500' };
        }

        const formatted = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Math.abs(amount));

        if (amount > 0) {
            return { text: `+${formatted}`, colorClass: 'text-green-600 dark:text-green-400' };
        } else if (amount < 0) {
            return { text: `-${formatted}`, colorClass: 'text-red-600 dark:text-red-400' };
        }

        return { text: formatted, colorClass: 'text-slate-900 dark:text-slate-200' };
    }

    formatTimestamp(dateStr) {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
        return date.toLocaleString('vi-VN', options);
    }

    updatePagination(total) {
        const totalPages = Math.ceil(total / this.limit);
        const showingStart = total > 0 ? (this.currentPage - 1) * this.limit + 1 : 0;
        const showingEnd = Math.min(this.currentPage * this.limit, total);

        this.container.querySelector('#showing-start').textContent = showingStart;
        this.container.querySelector('#showing-end').textContent = showingEnd;
        this.container.querySelector('#total-count').textContent = total;

        const paginationNav = this.container.querySelector('#pagination-nav');
        if (!paginationNav || totalPages <= 1) {
            if (paginationNav) paginationNav.innerHTML = '';
            return;
        }

        let html = `
            <button class="prev-page relative inline-flex items-center px-2 py-2 rounded-l-md border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark text-sm font-medium text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 ${this.currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}" ${this.currentPage === 1 ? 'disabled' : ''}>
                <span class="sr-only">Trước</span>
                <span class="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
        `;

        // Show first page, current-1, current, current+1, last page
        const pagesToShow = [];
        pagesToShow.push(1);
        if (this.currentPage > 3) pagesToShow.push('...');
        for (let i = Math.max(2, this.currentPage - 1); i <= Math.min(totalPages - 1, this.currentPage + 1); i++) {
            if (!pagesToShow.includes(i)) pagesToShow.push(i);
        }
        if (this.currentPage < totalPages - 2) pagesToShow.push('...');
        if (totalPages > 1 && !pagesToShow.includes(totalPages)) pagesToShow.push(totalPages);

        pagesToShow.forEach(page => {
            if (page === '...') {
                html += `<span class="relative inline-flex items-center px-4 py-2 border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark text-sm font-medium text-slate-700 dark:text-slate-400">...</span>`;
            } else if (page === this.currentPage) {
                html += `<span aria-current="page" class="z-10 bg-primary/10 border-primary text-primary relative inline-flex items-center px-4 py-2 border text-sm font-medium">${page}</span>`;
            } else {
                html += `<button class="page-btn bg-white dark:bg-surface-dark border-border-light dark:border-border-dark text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 relative inline-flex items-center px-4 py-2 border text-sm font-medium" data-page="${page}">${page}</button>`;
            }
        });

        html += `
            <button class="next-page relative inline-flex items-center px-2 py-2 rounded-r-md border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark text-sm font-medium text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 ${this.currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" ${this.currentPage === totalPages ? 'disabled' : ''}>
                <span class="sr-only">Tiếp</span>
                <span class="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
        `;

        paginationNav.innerHTML = html;

        // Add event listeners
        paginationNav.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentPage = parseInt(btn.dataset.page);
                this.loadTransactions();
            });
        });

        const prevBtn = paginationNav.querySelector('.prev-page');
        const nextBtn = paginationNav.querySelector('.next-page');

        if (prevBtn && this.currentPage > 1) {
            prevBtn.addEventListener('click', () => {
                this.currentPage--;
                this.loadTransactions();
            });
        }

        if (nextBtn && this.currentPage < totalPages) {
            nextBtn.addEventListener('click', () => {
                this.currentPage++;
                this.loadTransactions();
            });
        }
    }
}
