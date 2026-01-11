// customer-hub/js/modules/customer-search.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class CustomerSearchModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.currentPage = 1;
        this.limit = 10;
        this.totalCustomers = 0;
        this.initUI();
    }

    initUI() {
        this.container.innerHTML = `
            <!-- Search and Filter Section -->
            <div class="bg-surface-light dark:bg-surface-dark p-6 rounded-lg border border-border-light dark:border-border-dark shadow-sm mb-8">
                <div class="flex flex-col md:flex-row gap-4 items-end">
                    <div class="flex-1 w-full">
                        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5" for="search-input">Tìm kiếm khách hàng</label>
                        <div class="relative rounded-md shadow-sm">
                            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                <span class="material-symbols-outlined text-slate-400 text-[20px]">search</span>
                            </div>
                            <input class="block w-full rounded-md border-border-light dark:border-border-dark pl-10 pr-12 py-3 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-primary sm:text-sm" id="search-input" name="search" placeholder="Tìm theo số điện thoại hoặc tên..." type="text"/>
                            <div class="absolute inset-y-0 right-0 flex items-center">
                                <select class="h-full rounded-md border-0 bg-transparent py-0 pl-2 pr-7 text-slate-500 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm" id="search-type" name="search-type">
                                    <option value="">Tất cả</option>
                                    <option value="phone">SĐT</option>
                                    <option value="name">Tên</option>
                                    <option value="email">Email</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div class="w-full md:w-48">
                        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5" for="status-filter">Trạng thái</label>
                        <select class="block w-full rounded-md border-border-light dark:border-border-dark py-3 pl-3 pr-10 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-primary sm:text-sm" id="status-filter" name="status">
                            <option value="">Tất cả</option>
                            <option value="active">Hoạt động</option>
                            <option value="inactive">Ngừng hoạt động</option>
                            <option value="pending">Chờ xử lý</option>
                        </select>
                    </div>
                    <div class="flex gap-3 w-full md:w-auto mt-2 md:mt-0">
                        <button id="search-btn" class="flex-1 md:flex-none items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors">
                            Tìm kiếm
                        </button>
                        <button class="flex-none items-center justify-center rounded-md bg-white dark:bg-slate-700 px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors" title="Bộ lọc nâng cao">
                            <span class="material-symbols-outlined text-[20px]">filter_list</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Data Card -->
            <div class="bg-surface-light dark:bg-surface-dark rounded-lg border border-border-light dark:border-border-dark shadow-sm overflow-hidden">
                <!-- Card Header -->
                <div class="px-6 py-5 border-b border-border-light dark:border-border-dark flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-surface-dark">
                    <div>
                        <h3 class="text-base font-semibold leading-6 text-slate-900 dark:text-white">Danh sách khách hàng</h3>
                        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Hiển thị kết quả tìm kiếm và hồ sơ khách hàng.</p>
                    </div>
                    <div class="flex gap-2">
                        <button class="inline-flex items-center rounded-md bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700" type="button">
                            <span class="material-symbols-outlined text-[18px] mr-1.5 text-slate-500">download</span>
                            Xuất Excel
                        </button>
                    </div>
                </div>
                <!-- Table -->
                <div class="overflow-x-auto custom-scrollbar">
                    <table class="min-w-full divide-y divide-border-light dark:divide-border-dark">
                        <thead class="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th class="py-3.5 pl-6 pr-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400" scope="col">Khách hàng</th>
                                <th class="px-3 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400" scope="col">Số điện thoại</th>
                                <th class="px-3 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400" scope="col">Trạng thái</th>
                                <th class="px-3 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400" scope="col">Cấp bậc</th>
                                <th class="px-3 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400" scope="col">Hoạt động gần đây</th>
                                <th class="relative py-3.5 pl-3 pr-6" scope="col">
                                    <span class="sr-only">Hành động</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody id="customer-table-body" class="divide-y divide-border-light dark:divide-border-dark bg-white dark:bg-surface-dark">
                            <tr>
                                <td colspan="6" class="py-8 text-center text-slate-500">
                                    <span class="material-symbols-outlined text-4xl mb-2">hourglass_empty</span>
                                    <p>Đang tải dữ liệu...</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <!-- Pagination -->
                <div id="pagination-container" class="flex items-center justify-between border-t border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-4 py-3 sm:px-6">
                    <div class="flex flex-1 justify-between sm:hidden">
                        <button id="prev-page-mobile" class="relative inline-flex items-center rounded-md border border-border-light bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Trước</button>
                        <button id="next-page-mobile" class="relative ml-3 inline-flex items-center rounded-md border border-border-light bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Tiếp</button>
                    </div>
                    <div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                        <div>
                            <p class="text-sm text-slate-700 dark:text-slate-300">
                                Hiển thị <span class="font-medium" id="showing-start">0</span> đến <span class="font-medium" id="showing-end">0</span> trong <span class="font-medium" id="total-count">0</span> kết quả
                            </p>
                        </div>
                        <div>
                            <nav aria-label="Pagination" class="isolate inline-flex -space-x-px rounded-md shadow-sm" id="pagination-nav">
                            </nav>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.searchInput = this.container.querySelector('#search-input');
        this.searchType = this.container.querySelector('#search-type');
        this.statusFilter = this.container.querySelector('#status-filter');
        this.searchBtn = this.container.querySelector('#search-btn');
        this.tableBody = this.container.querySelector('#customer-table-body');

        this.searchBtn.addEventListener('click', () => this.performSearch());
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        // Initial load
        this.performSearch();
    }

    async performSearch() {
        const query = this.searchInput.value.trim();
        const searchType = this.searchType.value;
        const status = this.statusFilter.value;

        this.tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="py-8 text-center text-blue-500">
                    <span class="material-symbols-outlined text-4xl mb-2 animate-spin">progress_activity</span>
                    <p>Đang tìm kiếm...</p>
                </td>
            </tr>
        `;

        try {
            const response = await apiService.searchCustomers(query, this.currentPage, this.limit, { searchType, status });
            if (response.success && response.data && response.data.length > 0) {
                this.totalCustomers = response.pagination?.total || response.data.length;
                this.renderResults(response.data);
            } else {
                this.tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="py-8 text-center text-slate-500">
                            <span class="material-symbols-outlined text-4xl mb-2">search_off</span>
                            <p>Không tìm thấy khách hàng nào.</p>
                        </td>
                    </tr>
                `;
                this.updatePagination(0);
            }
        } catch (error) {
            console.error('Customer search error:', error);
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-8 text-center text-red-500">
                        <span class="material-symbols-outlined text-4xl mb-2">error</span>
                        <p>Lỗi khi tìm kiếm: ${error.message}</p>
                    </td>
                </tr>
            `;
        }
    }

    renderResults(customers) {
        const avatarColors = ['indigo', 'pink', 'blue', 'teal', 'purple', 'orange', 'green', 'cyan'];

        let html = '';
        customers.forEach((customer, index) => {
            const colorClass = avatarColors[index % avatarColors.length];
            const initials = this.getInitials(customer.name || 'KH');
            const statusBadge = this.getStatusBadge(customer.status);
            const tierInfo = this.getTierInfo(customer.tier);
            const lastActivity = this.formatLastActivity(customer.last_activity || customer.updated_at);

            html += `
                <tr class="group hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <td class="whitespace-nowrap py-4 pl-6 pr-3">
                        <div class="flex items-center">
                            <div class="h-10 w-10 flex-shrink-0 rounded-full bg-${colorClass}-100 dark:bg-${colorClass}-900/30 flex items-center justify-center text-${colorClass}-600 dark:text-${colorClass}-400 font-bold text-sm">
                                ${initials}
                            </div>
                            <div class="ml-4">
                                <div class="font-medium text-slate-900 dark:text-white group-hover:text-primary transition-colors">${customer.name || 'Chưa có tên'}</div>
                                <div class="text-xs text-slate-500 dark:text-slate-400">ID: #${customer.id || 'N/A'}</div>
                            </div>
                        </div>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-600 dark:text-slate-300">
                        <div class="flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-[16px] text-slate-400">call</span>
                            ${customer.phone || 'N/A'}
                        </div>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm">
                        ${statusBadge}
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                        ${tierInfo}
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                        ${lastActivity}
                    </td>
                    <td class="relative whitespace-nowrap py-4 pl-3 pr-6 text-right text-sm font-medium">
                        <button onclick="window.openCustomerModal('${customer.phone}')" class="text-primary hover:text-primary-dark font-semibold border border-primary/20 hover:border-primary/50 bg-primary/5 hover:bg-primary/10 rounded px-3 py-1.5 transition-all text-xs uppercase tracking-wide">
                            Xem hồ sơ
                        </button>
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;
        this.updatePagination(this.totalCustomers);
    }

    getInitials(name) {
        if (!name) return 'KH';
        const words = name.trim().split(' ');
        if (words.length >= 2) {
            return (words[0][0] + words[words.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    getStatusBadge(status) {
        const statusMap = {
            'active': { text: 'Hoạt động', class: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 ring-green-600/20' },
            'inactive': { text: 'Ngừng hoạt động', class: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 ring-slate-500/10' },
            'pending': { text: 'Chờ xử lý', class: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 ring-yellow-600/20' },
            'VIP': { text: 'VIP', class: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 ring-purple-600/20' },
        };

        const config = statusMap[status] || statusMap['active'];
        return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.class} ring-1 ring-inset">${config.text}</span>`;
    }

    getTierInfo(tier) {
        const tierMap = {
            'platinum': { text: 'Platinum', icon: 'diamond', color: 'text-cyan-500' },
            'gold': { text: 'Vàng', icon: 'stars', color: 'text-amber-500' },
            'silver': { text: 'Bạc', icon: 'stars', color: 'text-slate-400' },
            'bronze': { text: 'Đồng', icon: 'stars', color: 'text-orange-600' },
        };

        const config = tierMap[(tier || '').toLowerCase()] || { text: tier || 'Mới', icon: 'grade', color: 'text-slate-400' };

        return `
            <div class="flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[18px] ${config.color}" style="font-variation-settings: 'FILL' 1;">${config.icon}</span>
                <span class="font-medium text-slate-700 dark:text-slate-200">${config.text}</span>
            </div>
        `;
    }

    formatLastActivity(dateStr) {
        if (!dateStr) return 'Chưa có';

        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Vừa xong';
        if (diffMins < 60) return `${diffMins} phút trước`;
        if (diffHours < 24) return `${diffHours} giờ trước`;
        if (diffDays < 7) return `${diffDays} ngày trước`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`;

        return date.toLocaleDateString('vi-VN');
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
            <button onclick="this.closest('[id]').querySelector('#customer-search-container')" class="prev-page relative inline-flex items-center rounded-l-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 ${this.currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}" ${this.currentPage === 1 ? 'disabled' : ''}>
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
                html += `<span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 focus:outline-offset-0 dark:ring-slate-600 dark:text-slate-400">...</span>`;
            } else if (page === this.currentPage) {
                html += `<span aria-current="page" class="relative z-10 inline-flex items-center bg-primary px-4 py-2 text-sm font-semibold text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">${page}</span>`;
            } else {
                html += `<button class="page-btn relative inline-flex items-center px-4 py-2 text-sm font-semibold text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 dark:ring-slate-600 dark:text-white dark:hover:bg-slate-700" data-page="${page}">${page}</button>`;
            }
        });

        html += `
            <button class="next-page relative inline-flex items-center rounded-r-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 ${this.currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" ${this.currentPage === totalPages ? 'disabled' : ''}>
                <span class="sr-only">Tiếp</span>
                <span class="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
        `;

        paginationNav.innerHTML = html;

        // Add event listeners
        paginationNav.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentPage = parseInt(btn.dataset.page);
                this.performSearch();
            });
        });

        const prevBtn = paginationNav.querySelector('.prev-page');
        const nextBtn = paginationNav.querySelector('.next-page');

        if (prevBtn && this.currentPage > 1) {
            prevBtn.addEventListener('click', () => {
                this.currentPage--;
                this.performSearch();
            });
        }

        if (nextBtn && this.currentPage < totalPages) {
            nextBtn.addEventListener('click', () => {
                this.currentPage++;
                this.performSearch();
            });
        }
    }

    render() {
        // The UI is initialized in the constructor
    }
}
