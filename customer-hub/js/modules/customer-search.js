// customer-hub/js/modules/customer-search.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class CustomerSearchModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.currentPage = 1;
        this.limit = 20;
        this.totalCustomers = 0;
        this.customers = [];
        this.isLoading = false;
        this.hasMore = true;
        this.isSearchMode = false; // false = recent customers, true = search results
        this.initUI();
    }

    initUI() {
        this.container.innerHTML = `
            <!-- Combined Search and Results Card -->
            <div class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card overflow-hidden">
                <!-- Search Bar -->
                <div class="px-4 py-3 border-b border-border-light dark:border-border-dark">
                    <div class="flex gap-3 items-center">
                        <input type="text" id="search-input"
                            class="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                            placeholder="Nhập SĐT, tên hoặc email... (Enter để tìm)">
                        <select id="search-type" class="h-9 px-3 bg-white dark:bg-slate-700 border border-border-light dark:border-border-dark rounded-lg text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer">
                            <option value="">Tất cả</option>
                            <option value="phone">SĐT</option>
                            <option value="name">Tên</option>
                            <option value="email">Email</option>
                        </select>
                        <select id="status-filter" class="h-9 px-3 bg-white dark:bg-slate-700 border border-border-light dark:border-border-dark rounded-lg text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer">
                            <option value="">Tất cả trạng thái</option>
                            <option value="Bình thường">Bình thường</option>
                            <option value="Bom hàng">Bom hàng</option>
                            <option value="Cảnh báo">Cảnh báo</option>
                            <option value="Nguy hiểm">Nguy hiểm</option>
                            <option value="VIP">VIP</option>
                        </select>
                    </div>
                </div>

                <!-- Hidden elements for compatibility -->
                <span id="list-title" class="hidden">Khách hàng gần đây</span>
                <span id="list-subtitle" class="hidden">Hiển thị khách hàng hoạt động gần nhất</span>

                <!-- Table Container with scroll -->
                <div id="table-container" class="overflow-x-auto custom-scrollbar overflow-y-auto" style="max-height: calc(100vh - 180px);">
                    <table class="w-full">
                        <thead class="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Khách hàng</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Trạng thái</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Công nợ</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Địa chỉ</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ghi chú</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody id="customer-table-body" class="divide-y divide-border-light dark:divide-border-dark">
                            <tr>
                                <td colspan="6" class="px-4 py-12 text-center">
                                    <div class="flex flex-col items-center">
                                        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                                            <span class="material-symbols-outlined text-primary text-2xl animate-spin">progress_activity</span>
                                        </div>
                                        <p class="text-slate-500 dark:text-slate-400">Đang tải...</p>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Load More Indicator -->
                    <div id="load-more-indicator" class="hidden px-4 py-4 text-center">
                        <div class="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
                            <span class="material-symbols-outlined text-xl animate-spin">progress_activity</span>
                            <span>Đang tải thêm...</span>
                        </div>
                    </div>
                </div>

                <!-- Footer with count -->
                <div id="pagination-container" class="px-4 py-2 border-t border-border-light dark:border-border-dark flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                    <p class="text-sm text-slate-600 dark:text-slate-400">
                        Hiển thị <span class="font-semibold text-slate-900 dark:text-white" id="showing-count">0</span> khách hàng
                        <span id="total-info" class="hidden">trên tổng <span class="font-semibold text-slate-900 dark:text-white" id="total-count">0</span></span>
                    </p>
                    <div id="scroll-hint" class="text-sm text-slate-400 dark:text-slate-500 flex items-center gap-1">
                        <span class="material-symbols-outlined text-base">keyboard_arrow_down</span>
                        Cuộn xuống để tải thêm
                    </div>
                </div>
            </div>
        `;

        this.searchInput = this.container.querySelector('#search-input');
        this.searchType = this.container.querySelector('#search-type');
        this.statusFilter = this.container.querySelector('#status-filter');
        this.tableBody = this.container.querySelector('#customer-table-body');
        this.tableContainer = this.container.querySelector('#table-container');
        this.loadMoreIndicator = this.container.querySelector('#load-more-indicator');
        this.listTitle = this.container.querySelector('#list-title');
        this.listSubtitle = this.container.querySelector('#list-subtitle');
        this.scrollHint = this.container.querySelector('#scroll-hint');

        // Event listeners - Enter to search
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        // Clear search and show recent when input is cleared
        this.searchInput.addEventListener('input', (e) => {
            if (e.target.value.trim() === '' && this.isSearchMode) {
                this.resetToRecent();
            }
        });

        // Filter change triggers search
        this.statusFilter.addEventListener('change', () => {
            if (this.searchInput.value.trim() !== '' || this.statusFilter.value !== '') {
                this.performSearch();
            }
        });

        // Infinite scroll
        this.tableContainer.addEventListener('scroll', () => this.handleScroll());

        // Initial load - show recent customers
        this.loadRecentCustomers();
    }

    handleScroll() {
        if (this.isLoading || !this.hasMore) return;

        const { scrollTop, scrollHeight, clientHeight } = this.tableContainer;
        // Load more when user scrolls to bottom (with 100px threshold)
        if (scrollTop + clientHeight >= scrollHeight - 100) {
            this.loadMore();
        }
    }

    async loadMore() {
        if (this.isLoading || !this.hasMore) return;

        this.currentPage++;
        this.loadMoreIndicator.classList.remove('hidden');

        try {
            let response;
            if (this.isSearchMode) {
                const query = this.searchInput.value.trim();
                const searchType = this.searchType.value;
                const status = this.statusFilter.value;
                response = await apiService.searchCustomers(query, this.currentPage, this.limit, { searchType, status });
            } else {
                response = await apiService.getRecentCustomers(this.currentPage, this.limit);
            }

            if (response.success && response.data && response.data.length > 0) {
                this.customers = [...this.customers, ...response.data];
                this.appendResults(response.data);
                this.hasMore = response.data.length === this.limit;
            } else {
                this.hasMore = false;
            }
        } catch (error) {
            console.error('Load more error:', error);
            this.hasMore = false;
        } finally {
            this.loadMoreIndicator.classList.add('hidden');
            this.updateFooter();
        }
    }

    resetToRecent() {
        this.isSearchMode = false;
        this.currentPage = 1;
        this.customers = [];
        this.hasMore = true;
        this.listTitle.textContent = 'Khách hàng gần đây';
        this.listSubtitle.textContent = 'Hiển thị khách hàng hoạt động gần nhất';
        this.loadRecentCustomers();
    }

    async loadRecentCustomers() {
        this.isLoading = true;
        this.isSearchMode = false;
        this.currentPage = 1;
        this.customers = [];
        this.hasMore = true;

        this.tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center">
                    <div class="flex flex-col items-center">
                        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                            <span class="material-symbols-outlined text-primary text-2xl animate-spin">progress_activity</span>
                        </div>
                        <p class="text-slate-500 dark:text-slate-400">Đang tải khách hàng gần đây...</p>
                    </div>
                </td>
            </tr>
        `;

        try {
            const response = await apiService.getRecentCustomers(1, this.limit);
            if (response.success && response.data && response.data.length > 0) {
                this.customers = response.data;
                this.totalCustomers = response.pagination?.total || response.data.length;
                this.hasMore = response.data.length === this.limit;
                this.renderResults(response.data);
            } else {
                this.tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-12 text-center">
                            <div class="flex flex-col items-center">
                                <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                                    <span class="material-symbols-outlined text-slate-400 text-2xl">group</span>
                                </div>
                                <p class="text-slate-500 dark:text-slate-400">Chưa có khách hàng</p>
                                <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">Khách hàng sẽ xuất hiện ở đây khi được thêm vào</p>
                            </div>
                        </td>
                    </tr>
                `;
                this.hasMore = false;
            }
        } catch (error) {
            console.error('Load recent customers error:', error);
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-12 text-center">
                        <div class="flex flex-col items-center">
                            <div class="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mb-4">
                                <span class="material-symbols-outlined text-warning text-3xl">engineering</span>
                            </div>
                            <p class="text-lg font-medium text-warning mb-1">Đang tải khách hàng</p>
                            <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">API đang được phát triển. Hãy thử tìm kiếm.</p>
                        </div>
                    </td>
                </tr>
            `;
            this.hasMore = false;
        } finally {
            this.isLoading = false;
            this.updateFooter();
        }
    }

    async performSearch() {
        const query = this.searchInput.value.trim();
        const searchType = this.searchType.value;
        const status = this.statusFilter.value;

        // If query is empty, show recent customers
        if (query.length < 2) {
            if (query.length === 0) {
                this.resetToRecent();
            } else {
                // Show hint for minimum characters
                this.tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-12 text-center">
                            <div class="flex flex-col items-center">
                                <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                                    <span class="material-symbols-outlined text-primary text-3xl">person_search</span>
                                </div>
                                <p class="text-lg font-medium text-slate-700 dark:text-slate-300 mb-1">Tiếp tục nhập...</p>
                                <p class="text-sm text-slate-500 dark:text-slate-400">Nhập ít nhất 2 ký tự để tìm kiếm</p>
                            </div>
                        </td>
                    </tr>
                `;
                this.updateFooter();
            }
            return;
        }

        this.isLoading = true;
        this.isSearchMode = true;
        this.currentPage = 1;
        this.customers = [];
        this.hasMore = true;

        this.listTitle.textContent = 'Kết quả tìm kiếm';
        this.listSubtitle.textContent = `Tìm kiếm "${query}"`;

        this.tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center">
                    <div class="flex flex-col items-center">
                        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                            <span class="material-symbols-outlined text-primary text-2xl animate-spin">progress_activity</span>
                        </div>
                        <p class="text-slate-500 dark:text-slate-400">Đang tìm kiếm...</p>
                    </div>
                </td>
            </tr>
        `;

        try {
            const response = await apiService.searchCustomers(query, this.currentPage, this.limit, { searchType, status });
            if (response.success && response.data && response.data.length > 0) {
                this.customers = response.data;
                this.totalCustomers = response.pagination?.total || response.data.length;
                this.hasMore = response.data.length === this.limit;
                this.renderResults(response.data);
            } else {
                this.tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-12 text-center">
                            <div class="flex flex-col items-center">
                                <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                                    <span class="material-symbols-outlined text-slate-400 text-2xl">search_off</span>
                                </div>
                                <p class="text-slate-500 dark:text-slate-400">Không tìm thấy khách hàng</p>
                                <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">Thử điều chỉnh tiêu chí tìm kiếm</p>
                            </div>
                        </td>
                    </tr>
                `;
                this.hasMore = false;
            }
        } catch (error) {
            console.error('Customer search error:', error);
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-12 text-center">
                        <div class="flex flex-col items-center">
                            <div class="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-3">
                                <span class="material-symbols-outlined text-danger text-2xl">error</span>
                            </div>
                            <p class="text-danger font-medium">Lỗi tìm kiếm</p>
                            <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">${error.message}</p>
                        </div>
                    </td>
                </tr>
            `;
            this.hasMore = false;
        } finally {
            this.isLoading = false;
            this.updateFooter();
        }
    }

    renderResults(customers) {
        this.tableBody.innerHTML = this.generateRowsHtml(customers);
    }

    appendResults(customers) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `<table><tbody>${this.generateRowsHtml(customers, this.customers.length - customers.length)}</tbody></table>`;
        const newRows = tempDiv.querySelector('tbody').children;
        while (newRows.length > 0) {
            this.tableBody.appendChild(newRows[0]);
        }
    }

    generateRowsHtml(customers, startIndex = 0) {
        let html = '';
        customers.forEach((customer, index) => {
            const statusBadge = this.getStatusBadge(customer.status);
            // Format debt info - virtual and real balance
            const virtualBalance = customer.virtual_balance || 0;
            const realBalance = customer.real_balance || 0;
            const debtInfo = this.formatDebt(virtualBalance, realBalance);
            // Format address - truncate if too long
            const address = this.truncateText(customer.address || '', 30);
            // Format notes - join with | separator
            const notes = this.formatNotes(customer.notes || []);

            html += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td class="px-4 py-3">
                        <div>
                            <p class="font-medium text-slate-900 dark:text-white group-hover:text-primary transition-colors">${customer.name || 'Chưa có tên'}</p>
                            <p class="text-xs text-slate-500 dark:text-slate-400">${customer.phone || 'N/A'}</p>
                        </div>
                    </td>
                    <td class="px-4 py-3">
                        ${statusBadge}
                    </td>
                    <td class="px-4 py-3">
                        ${debtInfo}
                    </td>
                    <td class="px-4 py-3 text-sm text-slate-600 dark:text-slate-300" title="${customer.address || ''}">
                        ${address || '-'}
                    </td>
                    <td class="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 max-w-[200px]" title="${(customer.notes || []).map(n => n.content).join(' | ')}">
                        <div class="truncate">${notes || '-'}</div>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <button onclick="window.openCustomerModal('${customer.phone}')"
                            class="inline-flex items-center gap-1 px-2.5 py-1 text-sm font-medium text-primary hover:bg-primary hover:text-white border border-primary/30 hover:border-primary rounded-lg transition-all">
                            <span class="material-symbols-outlined text-base">visibility</span>
                            Xem
                        </button>
                    </td>
                </tr>
            `;
        });

        return html;
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    formatDebt(virtual, real) {
        const formatNum = (num) => {
            if (num === 0) return '0';
            return num.toLocaleString('vi-VN');
        };
        return `
            <div class="text-sm">
                <div class="text-slate-600 dark:text-slate-300">Ảo: <span class="font-medium">${formatNum(virtual)}</span></div>
                <div class="text-slate-600 dark:text-slate-300">Thực: <span class="font-medium">${formatNum(real)}</span></div>
            </div>
        `;
    }

    formatNotes(notes) {
        if (!notes || notes.length === 0) return '';
        // Get content from each note and join with |
        return notes.map(n => n.content || n).join(' | ');
    }

    updateFooter() {
        const showingCount = this.container.querySelector('#showing-count');
        const totalInfo = this.container.querySelector('#total-info');
        const totalCount = this.container.querySelector('#total-count');

        showingCount.textContent = this.customers.length;

        if (this.totalCustomers > this.customers.length) {
            totalInfo.classList.remove('hidden');
            totalCount.textContent = this.totalCustomers;
        } else {
            totalInfo.classList.add('hidden');
        }

        // Show/hide scroll hint
        if (this.hasMore && this.customers.length > 0) {
            this.scrollHint.classList.remove('hidden');
        } else {
            this.scrollHint.classList.add('hidden');
        }
    }

    getInitials(name) {
        if (!name) return 'CU';
        const words = name.trim().split(' ');
        if (words.length >= 2) {
            return (words[0][0] + words[words.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    getStatusBadge(status) {
        // Map status to colors based on image reference
        // Bình thường: green, Bom hàng: red, Cảnh báo: yellow/amber, Nguy hiểm: dark red, VIP: purple
        const statusLower = (status || 'Bình thường').toLowerCase();
        const statusMap = {
            'bình thường': { bg: 'bg-green-500', text: 'text-white', label: 'Bình thường' },
            'bom hàng': { bg: 'bg-red-500', text: 'text-white', label: 'Bom hàng' },
            'cảnh báo': { bg: 'bg-amber-500', text: 'text-white', label: 'Cảnh báo' },
            'nguy hiểm': { bg: 'bg-red-800', text: 'text-white', label: 'Nguy hiểm' },
            'vip': { bg: 'bg-purple-500', text: 'text-white', label: 'VIP' },
            // Fallback for old statuses
            'active': { bg: 'bg-green-500', text: 'text-white', label: 'Bình thường' },
            'inactive': { bg: 'bg-slate-400', text: 'text-white', label: 'Không hoạt động' },
            'pending': { bg: 'bg-amber-500', text: 'text-white', label: 'Chờ xử lý' },
        };
        const s = statusMap[statusLower] || statusMap['bình thường'];
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}">${s.label}</span>`;
    }

    getTierInfo(tier) {
        const tierLower = (tier || 'new').toLowerCase();
        const tierMap = {
            'platinum': { icon: 'diamond', color: 'text-purple-500', label: 'Platinum' },
            'gold': { icon: 'star', color: 'text-amber-500', label: 'Gold' },
            'silver': { icon: 'star_half', color: 'text-slate-400', label: 'Silver' },
            'bronze': { icon: 'star_outline', color: 'text-orange-500', label: 'Bronze' },
            'new': { icon: 'person', color: 'text-slate-400', label: 'New' },
        };
        const t = tierMap[tierLower] || tierMap['new'];
        return `
            <div class="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                <span class="material-symbols-outlined text-lg ${t.color}" style="font-variation-settings: 'FILL' 1;">${t.icon}</span>
                ${t.label}
            </div>
        `;
    }

    /**
     * Parse date string as UTC (handles API timestamps without 'Z' suffix)
     * @param {string} dateStr - Date string from API
     * @returns {Date} Date object
     */
    _parseAsUTC(dateStr) {
        if (!dateStr) return new Date();
        // If already has timezone info (Z or +/-), parse directly
        if (/[Z+\-]\d{0,2}:?\d{0,2}$/.test(dateStr)) {
            return new Date(dateStr);
        }
        // Otherwise, append 'Z' to treat as UTC
        return new Date(dateStr + 'Z');
    }

    formatLastActivity(dateStr) {
        if (!dateStr) return 'N/A';

        const date = this._parseAsUTC(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} mins ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
    }

    render() {
        // The UI is initialized in the constructor
    }
}
