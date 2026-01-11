// customer-hub/js/modules/link-bank-transaction.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class LinkBankTransactionModule {
    constructor(containerId, permissionHelper, onUpdateCallback = null) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.onUpdateCallback = onUpdateCallback;
        this.currentPage = 1;
        this.limit = 10;
        this.totalItems = 0;
        this.initUI();
    }

    initUI() {
        if (!this.permissionHelper.hasPermission('customer-hub', 'linkTransactions')) {
            this.container.innerHTML = `<p class="text-red-500">Bạn không có quyền truy cập chức năng liên kết giao dịch ngân hàng.</p>`;
            return;
        }

        this.container.innerHTML = `
            <!-- Page Header -->
            <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                <div class="flex flex-col gap-2">
                    <h1 class="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Giao dịch ngân hàng chưa liên kết</h1>
                    <p class="text-slate-500 dark:text-slate-400 max-w-2xl text-base">
                        Xem lại các giao dịch ngân hàng chưa được tự động khớp với hồ sơ khách hàng. Sử dụng công cụ bên dưới để liên kết thủ công.
                    </p>
                </div>
                <!-- Action / Export -->
                <div class="flex gap-3">
                    <button class="flex items-center gap-2 px-4 py-2 bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm">
                        <span class="material-symbols-outlined text-[18px]">download</span>
                        Xuất CSV
                    </button>
                    <button id="refresh-btn" class="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors shadow-sm shadow-primary/20">
                        <span class="material-symbols-outlined text-[18px]">refresh</span>
                        Làm mới
                    </button>
                </div>
            </div>

            <!-- Main Content Area: Filter & Table -->
            <div class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm flex flex-col overflow-hidden flex-1">
                <!-- Filters Toolbar -->
                <div class="p-4 border-b border-border-light dark:border-border-dark bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row gap-4 justify-between items-center">
                    <!-- Search -->
                    <div class="relative w-full sm:max-w-md">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span class="material-symbols-outlined text-slate-400 text-[20px]">search</span>
                        </div>
                        <input id="search-input" class="block w-full pl-10 pr-3 py-2.5 border-none ring-1 ring-slate-200 dark:ring-slate-700 rounded-lg leading-5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm transition-all shadow-sm" placeholder="Lọc theo số tiền, mã ngân hàng, mô tả..." type="text"/>
                    </div>
                    <!-- Secondary Filters -->
                    <div class="flex items-center gap-3 w-full sm:w-auto">
                        <div class="relative group">
                            <select id="date-filter" class="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm cursor-pointer">
                                <option value="">Tất cả ngày</option>
                                <option value="7">7 ngày gần đây</option>
                                <option value="30">30 ngày gần đây</option>
                                <option value="90">90 ngày gần đây</option>
                            </select>
                        </div>
                        <button id="apply-filters-btn" class="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm">
                            <span class="material-symbols-outlined text-[18px]">filter_list</span>
                            <span>Áp dụng</span>
                        </button>
                    </div>
                </div>

                <!-- Table -->
                <div class="overflow-x-auto custom-scrollbar flex-1">
                    <table class="min-w-full divide-y divide-border-light dark:divide-border-dark">
                        <thead class="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[140px]" scope="col">Ngày</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[160px]" scope="col">Mã ngân hàng</th>
                                <th class="px-6 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[140px]" scope="col">Số tiền</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider" scope="col">Mô tả gốc</th>
                                <th class="px-6 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[200px]" scope="col">Hành động</th>
                            </tr>
                        </thead>
                        <tbody id="transaction-table-body" class="bg-surface-light dark:bg-surface-dark divide-y divide-border-light dark:divide-border-dark">
                            <tr>
                                <td colspan="5" class="py-8 text-center text-blue-500">
                                    <span class="material-symbols-outlined text-4xl mb-2 animate-spin">progress_activity</span>
                                    <p>Đang tải dữ liệu...</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Pagination -->
                <div class="px-6 py-4 border-t border-border-light dark:border-border-dark flex items-center justify-between bg-white dark:bg-surface-dark">
                    <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                        <div>
                            <p class="text-sm text-slate-600 dark:text-slate-400">
                                Hiển thị <span class="font-bold text-slate-900 dark:text-white" id="showing-start">0</span> đến <span class="font-bold text-slate-900 dark:text-white" id="showing-end">0</span> trong <span class="font-bold text-slate-900 dark:text-white" id="total-count">0</span> kết quả
                            </p>
                        </div>
                        <div>
                            <nav aria-label="Pagination" class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" id="pagination-nav">
                            </nav>
                        </div>
                    </div>
                    <!-- Mobile Pagination View -->
                    <div class="flex items-center justify-between w-full sm:hidden">
                        <button id="prev-page-mobile" class="relative inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50">
                            Trước
                        </button>
                        <button id="next-page-mobile" class="ml-3 relative inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50">
                            Tiếp
                        </button>
                    </div>
                </div>
            </div>

            <!-- Link Transaction Modal -->
            <div id="link-transaction-modal" class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center hidden">
                <div class="bg-surface-light dark:bg-surface-dark p-6 rounded-xl shadow-2xl w-full max-w-md mx-4 border border-border-light dark:border-border-dark">
                    <div class="flex items-center justify-between mb-6">
                        <h3 class="text-xl font-bold text-slate-900 dark:text-white">Liên kết giao dịch</h3>
                        <button id="close-modal-btn" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <div id="modal-transaction-details" class="mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-border-light dark:border-border-dark">
                        <!-- Transaction details will be injected here -->
                    </div>
                    <div class="mb-4">
                        <label for="customer-phone-input" class="block text-slate-700 dark:text-slate-300 text-sm font-medium mb-2">Số điện thoại khách hàng</label>
                        <input type="tel" id="customer-phone-input" class="w-full p-3 border border-border-light dark:border-border-dark rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary" placeholder="Nhập số điện thoại...">
                    </div>
                    <div class="mb-6 flex items-center">
                        <input type="checkbox" id="auto-deposit-checkbox" class="mr-3 h-4 w-4 text-primary rounded border-slate-300 focus:ring-primary">
                        <label for="auto-deposit-checkbox" class="text-slate-700 dark:text-slate-300 text-sm">Tự động nạp vào ví khách hàng</label>
                    </div>
                    <div class="flex justify-end gap-3">
                        <button id="cancel-link-btn" class="px-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">Hủy</button>
                        <button id="confirm-link-btn" class="px-4 py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary-dark transition-colors shadow-sm">
                            <span class="material-symbols-outlined text-[18px] align-middle mr-1">person_add</span>
                            Liên kết
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.tableBody = this.container.querySelector('#transaction-table-body');
        this.searchInput = this.container.querySelector('#search-input');
        this.dateFilter = this.container.querySelector('#date-filter');
        this.applyFiltersBtn = this.container.querySelector('#apply-filters-btn');
        this.refreshBtn = this.container.querySelector('#refresh-btn');

        this.modal = this.container.querySelector('#link-transaction-modal');
        this.modalTransactionDetails = this.container.querySelector('#modal-transaction-details');
        this.customerPhoneInput = this.container.querySelector('#customer-phone-input');
        this.autoDepositCheckbox = this.container.querySelector('#auto-deposit-checkbox');
        this.cancelLinkBtn = this.container.querySelector('#cancel-link-btn');
        this.confirmLinkBtn = this.container.querySelector('#confirm-link-btn');
        this.closeModalBtn = this.container.querySelector('#close-modal-btn');

        this.applyFiltersBtn.addEventListener('click', () => {
            this.currentPage = 1;
            this.loadUnlinkedTransactions();
        });

        this.refreshBtn.addEventListener('click', () => {
            this.currentPage = 1;
            this.loadUnlinkedTransactions();
        });

        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.currentPage = 1;
                this.loadUnlinkedTransactions();
            }
        });

        this.cancelLinkBtn.addEventListener('click', () => this.hideModal());
        this.closeModalBtn.addEventListener('click', () => this.hideModal());
        this.confirmLinkBtn.addEventListener('click', () => this.confirmLinkTransaction());

        // Close modal on backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hideModal();
            }
        });

        this.loadUnlinkedTransactions();
    }

    async loadUnlinkedTransactions() {
        this.tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="py-8 text-center text-blue-500">
                    <span class="material-symbols-outlined text-4xl mb-2 animate-spin">progress_activity</span>
                    <p>Đang tải giao dịch...</p>
                </td>
            </tr>
        `;

        try {
            const response = await apiService.getUnlinkedBankTransactions(this.currentPage, this.limit);
            const data = response.data?.data || response.data || [];
            const total = response.data?.pagination?.total || data.length;

            if (response.success && data.length > 0) {
                this.totalItems = total;
                this.renderTransactions(data);
            } else {
                this.tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="py-8 text-center text-slate-500">
                            <span class="material-symbols-outlined text-4xl mb-2">check_circle</span>
                            <p>Không có giao dịch ngân hàng nào chưa liên kết.</p>
                        </td>
                    </tr>
                `;
                this.updatePagination(0);
            }
        } catch (error) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="py-8 text-center text-red-500">
                        <span class="material-symbols-outlined text-4xl mb-2">error</span>
                        <p>Lỗi khi tải giao dịch: ${error.message}</p>
                    </td>
                </tr>
            `;
            console.error('Error loading unlinked transactions:', error);
        }
    }

    renderTransactions(transactions) {
        const icons = ['receipt_long', 'shopping_bag', 'move_to_inbox', 'payments', 'credit_card'];

        let html = '';
        transactions.forEach((tx, index) => {
            const icon = icons[index % icons.length];
            const dateStr = this.formatDate(tx.transaction_date);
            const bankCode = tx.bank_code || `TX-${tx.id}`;

            html += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-300 font-medium">${dateStr}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono">
                            ${bankCode}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-white font-bold text-right font-mono">${this.formatCurrency(tx.amount)}</td>
                    <td class="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-[16px] text-slate-400">${icon}</span>
                            <span class="truncate max-w-[300px] block" title="${tx.description || ''}">${tx.description || 'N/A'}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right">
                        <button data-transaction-id="${tx.id}" data-transaction-amount="${tx.amount}" data-transaction-desc="${tx.description || ''}" data-transaction-date="${dateStr}"
                                class="link-transaction-btn inline-flex items-center gap-1.5 px-3 py-1.5 border border-primary text-primary hover:bg-primary hover:text-white rounded-md text-sm font-semibold transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-slate-900">
                            <span class="material-symbols-outlined text-[18px]">person_add</span>
                            Liên kết
                        </button>
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;

        // Add click handlers
        this.container.querySelectorAll('.link-transaction-btn').forEach(button => {
            button.addEventListener('click', (e) => this.showModal(e.currentTarget.dataset));
        });

        this.updatePagination(this.totalItems);
    }

    formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
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
            <button class="prev-page relative inline-flex items-center px-2 py-2 rounded-l-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 ${this.currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}" ${this.currentPage === 1 ? 'disabled' : ''}>
                <span class="sr-only">Trước</span>
                <span class="material-symbols-outlined text-[20px]">chevron_left</span>
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
                html += `<span class="relative inline-flex items-center px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-400">...</span>`;
            } else if (page === this.currentPage) {
                html += `<span aria-current="page" class="z-10 bg-primary/10 border-primary text-primary relative inline-flex items-center px-4 py-2 border text-sm font-medium">${page}</span>`;
            } else {
                html += `<button class="page-btn bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 relative inline-flex items-center px-4 py-2 border text-sm font-medium" data-page="${page}">${page}</button>`;
            }
        });

        html += `
            <button class="next-page relative inline-flex items-center px-2 py-2 rounded-r-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 ${this.currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" ${this.currentPage === totalPages ? 'disabled' : ''}>
                <span class="sr-only">Tiếp</span>
                <span class="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
        `;

        paginationNav.innerHTML = html;

        // Add event listeners
        paginationNav.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentPage = parseInt(btn.dataset.page);
                this.loadUnlinkedTransactions();
            });
        });

        const prevBtn = paginationNav.querySelector('.prev-page');
        const nextBtn = paginationNav.querySelector('.next-page');

        if (prevBtn && this.currentPage > 1) {
            prevBtn.addEventListener('click', () => {
                this.currentPage--;
                this.loadUnlinkedTransactions();
            });
        }

        if (nextBtn && this.currentPage < totalPages) {
            nextBtn.addEventListener('click', () => {
                this.currentPage++;
                this.loadUnlinkedTransactions();
            });
        }
    }

    showModal(transactionData) {
        this.currentTransaction = transactionData;
        this.modalTransactionDetails.innerHTML = `
            <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-slate-500 dark:text-slate-400">ID:</span>
                    <span class="font-mono font-medium text-slate-900 dark:text-white">#${transactionData.transactionId}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-slate-500 dark:text-slate-400">Số tiền:</span>
                    <span class="font-bold text-primary">${this.formatCurrency(transactionData.transactionAmount)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-slate-500 dark:text-slate-400">Ngày:</span>
                    <span class="text-slate-900 dark:text-white">${transactionData.transactionDate || 'N/A'}</span>
                </div>
                <div class="pt-2 border-t border-border-light dark:border-border-dark">
                    <span class="text-slate-500 dark:text-slate-400">Mô tả:</span>
                    <p class="text-slate-900 dark:text-white mt-1">${transactionData.transactionDesc || 'Không có'}</p>
                </div>
            </div>
        `;
        this.customerPhoneInput.value = '';
        this.autoDepositCheckbox.checked = true;
        this.modal.classList.remove('hidden');
    }

    hideModal() {
        this.modal.classList.add('hidden');
        this.currentTransaction = null;
    }

    async confirmLinkTransaction() {
        const phone = this.customerPhoneInput.value.trim();
        const autoDeposit = this.autoDepositCheckbox.checked;

        if (!phone) {
            alert('Vui lòng nhập số điện thoại khách hàng.');
            return;
        }

        if (!this.currentTransaction || !this.currentTransaction.transactionId) {
            alert('Không có giao dịch nào được chọn.');
            return;
        }

        this.confirmLinkBtn.disabled = true;
        this.confirmLinkBtn.innerHTML = '<span class="material-symbols-outlined text-[18px] align-middle mr-1 animate-spin">progress_activity</span> Đang liên kết...';

        try {
            const response = await apiService.linkBankTransaction(
                parseInt(this.currentTransaction.transactionId),
                phone,
                autoDeposit
            );

            if (response.success) {
                alert('Liên kết giao dịch thành công!');
                this.hideModal();
                this.loadUnlinkedTransactions();

                // Call the update callback if provided
                if (this.onUpdateCallback) {
                    this.onUpdateCallback();
                }
            } else {
                alert('Lỗi khi liên kết giao dịch: ' + response.error);
            }
        } catch (error) {
            alert('Lỗi khi liên kết giao dịch: ' + error.message);
            console.error('Error linking transaction:', error);
        } finally {
            this.confirmLinkBtn.disabled = false;
            this.confirmLinkBtn.innerHTML = '<span class="material-symbols-outlined text-[18px] align-middle mr-1">person_add</span> Liên kết';
        }
    }
}
