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
            <!-- Search Section - Modern Enterprise Style -->
            <div class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card p-6 mb-6">
                <div class="flex flex-col lg:flex-row gap-4 items-end">
                    <!-- Search Input with Icon -->
                    <div class="flex-1 w-full">
                        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Search Customer</label>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <span class="material-symbols-outlined text-slate-400 text-xl">search</span>
                            </div>
                            <input type="text" id="search-input"
                                class="w-full pl-12 pr-32 py-3 bg-slate-50 dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-full text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                placeholder="Search by phone number, name, or email...">
                            <div class="absolute inset-y-0 right-2 flex items-center">
                                <select id="search-type" class="h-9 px-3 bg-white dark:bg-slate-700 border border-border-light dark:border-border-dark rounded-full text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer">
                                    <option value="">All Fields</option>
                                    <option value="phone">Phone</option>
                                    <option value="name">Name</option>
                                    <option value="email">Email</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Status Filter -->
                    <div class="w-full lg:w-48">
                        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Status</label>
                        <select id="status-filter" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer">
                            <option value="">Any Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="pending">Pending</option>
                        </select>
                    </div>

                    <!-- Search Button -->
                    <button id="search-btn" class="w-full lg:w-auto px-8 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl shadow-soft hover:shadow-glow transition-all flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-xl">search</span>
                        Search
                    </button>
                </div>
            </div>

            <!-- Results Card -->
            <div class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card overflow-hidden">
                <!-- Card Header -->
                <div class="px-6 py-5 border-b border-border-light dark:border-border-dark flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h3 class="text-lg font-semibold text-slate-900 dark:text-white">Customer List</h3>
                        <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Showing recent customers and search results</p>
                    </div>
                    <button class="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-border-light dark:border-border-dark rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors">
                        <span class="material-symbols-outlined text-lg">download</span>
                        Export
                    </button>
                </div>

                <!-- Table -->
                <div class="overflow-x-auto custom-scrollbar">
                    <table class="w-full">
                        <thead class="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Customer</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Phone</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tier</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Last Activity</th>
                                <th class="px-6 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody id="customer-table-body" class="divide-y divide-border-light dark:divide-border-dark">
                            <tr>
                                <td colspan="6" class="px-6 py-12 text-center">
                                    <div class="flex flex-col items-center">
                                        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                                            <span class="material-symbols-outlined text-primary text-2xl animate-spin">progress_activity</span>
                                        </div>
                                        <p class="text-slate-500 dark:text-slate-400">Loading customers...</p>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Pagination -->
                <div id="pagination-container" class="px-6 py-4 border-t border-border-light dark:border-border-dark flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                    <p class="text-sm text-slate-600 dark:text-slate-400">
                        Showing <span class="font-semibold text-slate-900 dark:text-white" id="showing-start">0</span>
                        to <span class="font-semibold text-slate-900 dark:text-white" id="showing-end">0</span>
                        of <span class="font-semibold text-slate-900 dark:text-white" id="total-count">0</span> results
                    </p>
                    <nav id="pagination-nav" class="flex items-center gap-1"></nav>
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

        // API requires at least 2 characters for search query
        if (query.length < 2) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-12 text-center">
                        <div class="flex flex-col items-center">
                            <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                                <span class="material-symbols-outlined text-primary text-3xl">person_search</span>
                            </div>
                            <p class="text-lg font-medium text-slate-700 dark:text-slate-300 mb-1">Search for Customers</p>
                            <p class="text-sm text-slate-500 dark:text-slate-400">Enter at least 2 characters to search by phone, name, or email</p>
                        </div>
                    </td>
                </tr>
            `;
            this.updatePagination(0);
            return;
        }

        this.tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center">
                    <div class="flex flex-col items-center">
                        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                            <span class="material-symbols-outlined text-primary text-2xl animate-spin">progress_activity</span>
                        </div>
                        <p class="text-slate-500 dark:text-slate-400">Searching...</p>
                    </div>
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
                        <td colspan="6" class="px-6 py-12 text-center">
                            <div class="flex flex-col items-center">
                                <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                                    <span class="material-symbols-outlined text-slate-400 text-2xl">search_off</span>
                                </div>
                                <p class="text-slate-500 dark:text-slate-400">No customers found</p>
                                <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">Try adjusting your search criteria</p>
                            </div>
                        </td>
                    </tr>
                `;
                this.updatePagination(0);
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
                            <p class="text-danger font-medium">Search failed</p>
                            <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">${error.message}</p>
                        </div>
                    </td>
                </tr>
            `;
        }
    }

    renderResults(customers) {
        const avatarColors = [
            { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
            { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' },
            { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400' },
            { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400' },
            { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400' },
            { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-600 dark:text-cyan-400' },
        ];

        let html = '';
        customers.forEach((customer, index) => {
            const color = avatarColors[index % avatarColors.length];
            const initials = this.getInitials(customer.name || 'CU');
            const statusBadge = this.getStatusBadge(customer.status);
            const tierInfo = this.getTierInfo(customer.tier);
            const lastActivity = this.formatLastActivity(customer.last_activity || customer.updated_at);

            html += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full ${color.bg} ${color.text} flex items-center justify-center font-semibold text-sm flex-shrink-0">
                                ${initials}
                            </div>
                            <div>
                                <p class="font-medium text-slate-900 dark:text-white group-hover:text-primary transition-colors">${customer.name || 'No name'}</p>
                                <p class="text-xs text-slate-500 dark:text-slate-400">ID: #${customer.id || 'N/A'}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <span class="material-symbols-outlined text-base text-slate-400">call</span>
                            ${customer.phone || 'N/A'}
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        ${statusBadge}
                    </td>
                    <td class="px-6 py-4">
                        ${tierInfo}
                    </td>
                    <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                        ${lastActivity}
                    </td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="window.openCustomerModal('${customer.phone}')"
                            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary hover:text-white border border-primary/30 hover:border-primary rounded-lg transition-all">
                            <span class="material-symbols-outlined text-base">visibility</span>
                            View
                        </button>
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;
        this.updatePagination(this.totalCustomers);
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
        const statusLower = (status || 'active').toLowerCase();
        const statusMap = {
            'active': { bg: 'bg-success-light', text: 'text-success', label: 'Active' },
            'inactive': { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-400', label: 'Inactive' },
            'pending': { bg: 'bg-warning-light', text: 'text-warning', label: 'Pending' },
            'vip': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400', label: 'VIP' },
        };
        const s = statusMap[statusLower] || statusMap['active'];
        return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}">${s.label}</span>`;
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

    formatLastActivity(dateStr) {
        if (!dateStr) return 'N/A';

        const date = new Date(dateStr);
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

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
            <button class="prev-page w-9 h-9 flex items-center justify-center rounded-lg border border-border-light dark:border-border-dark text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${this.currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}" ${this.currentPage === 1 ? 'disabled' : ''}>
                <span class="material-symbols-outlined text-xl">chevron_left</span>
            </button>
        `;

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
                html += `<span class="px-2 text-slate-400">...</span>`;
            } else if (page === this.currentPage) {
                html += `<button class="w-9 h-9 flex items-center justify-center rounded-lg bg-primary text-white font-medium text-sm">${page}</button>`;
            } else {
                html += `<button class="page-btn w-9 h-9 flex items-center justify-center rounded-lg border border-border-light dark:border-border-dark text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-sm transition-colors" data-page="${page}">${page}</button>`;
            }
        });

        html += `
            <button class="next-page w-9 h-9 flex items-center justify-center rounded-lg border border-border-light dark:border-border-dark text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${this.currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" ${this.currentPage === totalPages ? 'disabled' : ''}>
                <span class="material-symbols-outlined text-xl">chevron_right</span>
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
