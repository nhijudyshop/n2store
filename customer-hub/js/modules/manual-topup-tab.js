// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// customer-hub/js/modules/manual-topup-tab.js
import apiService from '../api-service.js';

const TYPE_LABELS = {
    'DEPOSIT': 'Nạp tiền',
    'WITHDRAW': 'Rút tiền',
    'VIRTUAL_CREDIT': 'Cộng công nợ ảo',
    'VIRTUAL_DEBIT': 'Trừ công nợ ảo',
    'VIRTUAL_CANCEL': 'Thu hồi công nợ ảo',
    'ADJUSTMENT': 'Điều chỉnh số dư'
};

const TYPE_COLORS = {
    'DEPOSIT': { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
    'WITHDRAW': { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
    'VIRTUAL_CREDIT': { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
    'VIRTUAL_DEBIT': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' },
    'VIRTUAL_CANCEL': { bg: 'bg-slate-100 dark:bg-slate-700/50', text: 'text-slate-700 dark:text-slate-300' },
    'ADJUSTMENT': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' }
};

const CREDIT_TYPES = ['DEPOSIT', 'VIRTUAL_CREDIT'];
const LARGE_AMOUNT_THRESHOLD = 1000000;

export class ManualTopupTabModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.currentPage = 1;
        this.limit = 20;
        this.filters = {};
        this.creators = [];
        this._refreshTimer = null;
        this.initUI();
    }

    initUI() {
        if (!this.container) return;

        this.container.innerHTML = `
            <!-- Header -->
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <span class="material-symbols-outlined text-green-600 dark:text-green-400">account_balance_wallet</span>
                    </div>
                    <div>
                        <h2 class="text-xl font-bold text-slate-800 dark:text-white">Giao dịch Nạp Tay</h2>
                        <p class="text-sm text-slate-500 dark:text-slate-400">Toàn bộ giao dịch nạp/rút tay và công nợ ảo trên hệ thống</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button id="mt-toggle-stats" class="inline-flex items-center gap-2 px-3 py-2 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" title="Thống kê người thực hiện">
                        <span class="material-symbols-outlined text-lg">bar_chart</span>
                        Thống kê
                    </button>
                    <button id="mt-export-csv" class="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl shadow-soft hover:shadow-glow transition-all text-sm">
                        <span class="material-symbols-outlined text-lg">download</span>
                        Xuất CSV
                    </button>
                </div>
            </div>

            <!-- Summary Cards -->
            <div id="mt-summary-cards" class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                ${this._renderSummaryCardsSkeleton()}
            </div>

            <!-- Creator Stats Panel (hidden by default) -->
            <div id="mt-creator-stats" class="hidden mb-6 bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card p-5">
                <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                    <span class="material-symbols-outlined text-lg">group</span>
                    Thống kê theo người thực hiện
                </h3>
                <div id="mt-creator-stats-body" class="text-sm text-slate-500">Đang tải...</div>
            </div>

            <!-- Filters -->
            <div class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card p-4 mb-6">
                <!-- Row 1: Date + Balance Type -->
                <div class="flex flex-wrap items-center gap-3 mb-3">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-slate-400 text-lg">calendar_today</span>
                        <input type="date" id="mt-start-date" class="px-3 py-2 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent">
                        <span class="text-slate-400 text-sm">đến</span>
                        <input type="date" id="mt-end-date" class="px-3 py-2 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent">
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button class="mt-date-preset px-3 py-1.5 text-xs font-medium rounded-lg border border-border-light dark:border-border-dark hover:bg-primary hover:text-white hover:border-primary transition-colors" data-days="0">Hôm nay</button>
                        <button class="mt-date-preset px-3 py-1.5 text-xs font-medium rounded-lg border border-border-light dark:border-border-dark hover:bg-primary hover:text-white hover:border-primary transition-colors" data-days="7">7 ngày</button>
                        <button class="mt-date-preset px-3 py-1.5 text-xs font-medium rounded-lg border border-border-light dark:border-border-dark hover:bg-primary hover:text-white hover:border-primary transition-colors" data-days="30">30 ngày</button>
                        <button class="mt-date-preset px-3 py-1.5 text-xs font-medium rounded-lg border border-border-light dark:border-border-dark hover:bg-primary hover:text-white hover:border-primary transition-colors" data-days="month">Tháng này</button>
                    </div>
                    <div class="relative">
                        <select id="mt-balance-type" class="appearance-none pl-3 pr-8 py-2 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary cursor-pointer">
                            <option value="">Tất cả loại số dư</option>
                            <option value="real">Số dư thực</option>
                            <option value="virtual">Công nợ ảo</option>
                        </select>
                        <div class="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                            <span class="material-symbols-outlined text-slate-400 text-sm">expand_more</span>
                        </div>
                    </div>
                </div>
                <!-- Row 2: Type + Creator + Amount + Search -->
                <div class="flex flex-wrap items-center gap-3">
                    <div class="relative">
                        <select id="mt-type-filter" class="appearance-none pl-3 pr-8 py-2 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary cursor-pointer min-w-[150px]">
                            <option value="">Tất cả loại GD</option>
                            <option value="DEPOSIT">Nạp tiền</option>
                            <option value="WITHDRAW">Rút tiền</option>
                            <option value="VIRTUAL_CREDIT">Cộng công nợ ảo</option>
                            <option value="VIRTUAL_DEBIT">Trừ công nợ ảo</option>
                            <option value="VIRTUAL_CANCEL">Thu hồi công nợ</option>
                            <option value="ADJUSTMENT">Điều chỉnh</option>
                        </select>
                        <div class="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                            <span class="material-symbols-outlined text-slate-400 text-sm">expand_more</span>
                        </div>
                    </div>
                    <div class="relative">
                        <select id="mt-creator-filter" class="appearance-none pl-3 pr-8 py-2 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary cursor-pointer min-w-[150px]">
                            <option value="">Tất cả người thực hiện</option>
                        </select>
                        <div class="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                            <span class="material-symbols-outlined text-slate-400 text-sm">expand_more</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <input type="number" id="mt-min-amount" placeholder="Từ (VND)" class="w-28 px-3 py-2 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary">
                        <span class="text-slate-400 text-sm">-</span>
                        <input type="number" id="mt-max-amount" placeholder="Đến (VND)" class="w-28 px-3 py-2 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary">
                    </div>
                    <div class="relative flex-1 min-w-[200px]">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span class="material-symbols-outlined text-slate-400 text-lg">search</span>
                        </div>
                        <input type="text" id="mt-search" placeholder="SĐT, tên KH, ghi chú..." class="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary">
                    </div>
                    <button id="mt-apply-filter" class="inline-flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg text-sm transition-colors">
                        <span class="material-symbols-outlined text-lg">filter_list</span>
                        Lọc
                    </button>
                    <button id="mt-clear-filter" class="inline-flex items-center gap-1.5 px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <span class="material-symbols-outlined text-lg">filter_list_off</span>
                        Xóa
                    </button>
                </div>
            </div>

            <!-- Data Table -->
            <div class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card overflow-hidden">
                <div class="overflow-x-auto custom-scrollbar">
                    <table class="w-full">
                        <thead class="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-36">Thời gian</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-44">Người nhận</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32">Loại GD</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-20">Số dư</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-28">Số tiền</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-28">Sau GD</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-36">Người thực hiện</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ghi chú</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-28">Đơn hàng</th>
                            </tr>
                        </thead>
                        <tbody id="mt-table-body" class="divide-y divide-border-light dark:divide-border-dark">
                            ${this._renderLoadingRow()}
                        </tbody>
                    </table>
                </div>
                <!-- Pagination -->
                <div class="px-6 py-4 border-t border-border-light dark:border-border-dark flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                    <p class="text-sm text-slate-600 dark:text-slate-400">
                        Hiển thị <span class="font-semibold text-slate-900 dark:text-white" id="mt-showing-start">0</span>
                        đến <span class="font-semibold text-slate-900 dark:text-white" id="mt-showing-end">0</span>
                        trên <span class="font-semibold text-slate-900 dark:text-white" id="mt-total-count">0</span> kết quả
                    </p>
                    <nav id="mt-pagination-nav" class="flex items-center gap-1"></nav>
                </div>
            </div>
        `;

        this._bindEvents();
        this._initImageLightbox();
        this.loadTransactions();

        // Auto-refresh every 60s
        this._refreshTimer = setInterval(() => this.loadTransactions(), 60000);
    }

    _bindEvents() {
        // Date presets
        this.container.querySelectorAll('.mt-date-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const days = btn.dataset.days;
                const startDate = document.getElementById('mt-start-date');
                const endDate = document.getElementById('mt-end-date');
                const today = new Date();
                endDate.value = this._toDateString(today);

                if (days === 'month') {
                    startDate.value = this._toDateString(new Date(today.getFullYear(), today.getMonth(), 1));
                } else if (days === '0') {
                    startDate.value = this._toDateString(today);
                } else {
                    const d = new Date();
                    d.setDate(d.getDate() - parseInt(days));
                    startDate.value = this._toDateString(d);
                }

                // Highlight active preset
                this.container.querySelectorAll('.mt-date-preset').forEach(b => {
                    b.classList.remove('bg-primary', 'text-white', 'border-primary');
                });
                btn.classList.add('bg-primary', 'text-white', 'border-primary');

                this.currentPage = 1;
                this.loadTransactions();
            });
        });

        // Apply filter
        document.getElementById('mt-apply-filter').addEventListener('click', () => {
            this.currentPage = 1;
            this.loadTransactions();
        });

        // Clear filter
        document.getElementById('mt-clear-filter').addEventListener('click', () => {
            document.getElementById('mt-start-date').value = '';
            document.getElementById('mt-end-date').value = '';
            document.getElementById('mt-balance-type').value = '';
            document.getElementById('mt-type-filter').value = '';
            document.getElementById('mt-creator-filter').value = '';
            document.getElementById('mt-min-amount').value = '';
            document.getElementById('mt-max-amount').value = '';
            document.getElementById('mt-search').value = '';
            this.container.querySelectorAll('.mt-date-preset').forEach(b => {
                b.classList.remove('bg-primary', 'text-white', 'border-primary');
            });
            this.currentPage = 1;
            this.loadTransactions();
        });

        // Search on Enter
        document.getElementById('mt-search').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.currentPage = 1;
                this.loadTransactions();
            }
        });

        // Export CSV
        document.getElementById('mt-export-csv').addEventListener('click', () => this._exportCSV());

        // Toggle creator stats
        document.getElementById('mt-toggle-stats').addEventListener('click', () => {
            const panel = document.getElementById('mt-creator-stats');
            panel.classList.toggle('hidden');
        });
    }

    _collectFilters() {
        const filters = {};
        const startDate = document.getElementById('mt-start-date')?.value;
        const endDate = document.getElementById('mt-end-date')?.value;
        const balanceType = document.getElementById('mt-balance-type')?.value;
        const type = document.getElementById('mt-type-filter')?.value;
        const createdBy = document.getElementById('mt-creator-filter')?.value;
        const minAmount = document.getElementById('mt-min-amount')?.value;
        const maxAmount = document.getElementById('mt-max-amount')?.value;
        const query = document.getElementById('mt-search')?.value?.trim();

        if (startDate) filters.startDate = startDate;
        if (endDate) filters.endDate = endDate;
        if (balanceType) filters.balanceType = balanceType;
        if (type) filters.type = type;
        if (createdBy) filters.createdBy = createdBy;
        if (minAmount) filters.minAmount = minAmount;
        if (maxAmount) filters.maxAmount = maxAmount;
        if (query) filters.query = query;

        return filters;
    }

    async loadTransactions() {
        const tableBody = document.getElementById('mt-table-body');
        if (!tableBody) return;
        tableBody.innerHTML = this._renderLoadingRow();

        try {
            const filters = this._collectFilters();
            const response = await apiService.getManualTransactions(this.currentPage, this.limit, filters);

            if (!response.success) {
                tableBody.innerHTML = this._renderErrorRow(response.error || 'Lỗi tải dữ liệu');
                return;
            }

            const { data, summary, creators, pagination } = response;

            // Update summary cards
            this._renderSummaryCards(summary);

            // Update creators dropdown (only on first load or when creators change)
            if (creators && creators.length > 0) {
                this._updateCreatorsDropdown(creators);
            }

            // Update creator stats panel
            this._renderCreatorStats(data);

            // Render table rows
            if (data.length === 0) {
                tableBody.innerHTML = this._renderEmptyRow();
            } else {
                tableBody.innerHTML = data.map(tx => this._renderRow(tx)).join('');
            }

            // Update pagination
            this._renderPagination(pagination);
        } catch (error) {
            console.error('[ManualTopupTab] Load failed:', error);
            tableBody.innerHTML = this._renderErrorRow(error.message);
        }
    }

    // =====================================================
    // SUMMARY CARDS
    // =====================================================

    _renderSummaryCardsSkeleton() {
        const cards = [
            { label: 'Tổng nạp tay (thật)', icon: 'add_circle', color: 'green' },
            { label: 'Tổng rút tay (thật)', icon: 'remove_circle', color: 'red' },
            { label: 'Tổng cấp công nợ ảo', icon: 'stars', color: 'amber' },
            { label: 'Tổng thu hồi/trừ ảo', icon: 'block', color: 'slate' }
        ];
        return cards.map(c => `
            <div class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4">
                <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-outlined text-${c.color}-500 text-xl">${c.icon}</span>
                    <span class="text-xs font-medium text-slate-500 dark:text-slate-400">${c.label}</span>
                </div>
                <div class="h-7 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                <div class="h-4 w-16 bg-slate-100 dark:bg-slate-700/50 rounded animate-pulse mt-1"></div>
            </div>
        `).join('');
    }

    _renderSummaryCards(summary) {
        const el = document.getElementById('mt-summary-cards');
        if (!el || !summary) return;

        const cards = [
            {
                label: 'Tổng nạp tay (thật)', icon: 'add_circle', color: 'green',
                amount: summary.totalDeposit, count: summary.countDeposit
            },
            {
                label: 'Tổng rút tay (thật)', icon: 'remove_circle', color: 'red',
                amount: summary.totalWithdraw, count: summary.countWithdraw
            },
            {
                label: 'Tổng cấp công nợ ảo', icon: 'stars', color: 'amber',
                amount: summary.totalVirtualCredit, count: summary.countVirtualCredit
            },
            {
                label: 'Tổng thu hồi/trừ ảo', icon: 'block', color: 'slate',
                amount: (summary.totalVirtualDebit || 0) + (summary.totalVirtualCancel || 0),
                count: summary.countVirtualDebitCancel
            }
        ];

        el.innerHTML = cards.map(c => `
            <div class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-4 hover:shadow-md transition-shadow">
                <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-outlined text-${c.color}-500 text-xl">${c.icon}</span>
                    <span class="text-xs font-medium text-slate-500 dark:text-slate-400">${c.label}</span>
                </div>
                <p class="text-lg font-bold text-${c.color}-600 dark:text-${c.color}-400 tabular-nums">${this._formatCurrency(c.amount)}</p>
                <p class="text-xs text-slate-400 mt-0.5">${c.count || 0} giao dịch</p>
            </div>
        `).join('');
    }

    // =====================================================
    // CREATOR STATS
    // =====================================================

    _renderCreatorStats(data) {
        const body = document.getElementById('mt-creator-stats-body');
        if (!body || !data || data.length === 0) {
            if (body) body.innerHTML = '<p class="text-slate-400">Không có dữ liệu</p>';
            return;
        }

        const stats = {};
        for (const tx of data) {
            const creator = tx.created_by || 'Không rõ';
            if (!stats[creator]) stats[creator] = { deposit: 0, withdraw: 0, virtualCredit: 0, count: 0 };
            stats[creator].count++;
            if (tx.type === 'DEPOSIT') stats[creator].deposit += parseFloat(tx.amount) || 0;
            else if (tx.type === 'WITHDRAW') stats[creator].withdraw += parseFloat(tx.amount) || 0;
            else if (tx.type === 'VIRTUAL_CREDIT') stats[creator].virtualCredit += parseFloat(tx.amount) || 0;
        }

        const sorted = Object.entries(stats).sort((a, b) => b[1].count - a[1].count);

        body.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                ${sorted.map(([creator, s]) => `
                    <div class="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
                        <p class="font-medium text-sm text-slate-700 dark:text-slate-300 truncate" title="${this._escapeHtml(creator)}">${this._escapeHtml(creator)}</p>
                        <p class="text-xs text-slate-400 mt-1">${s.count} giao dịch</p>
                        <div class="flex flex-wrap gap-2 mt-2 text-xs">
                            ${s.deposit > 0 ? `<span class="text-green-600">+${this._formatShort(s.deposit)}</span>` : ''}
                            ${s.withdraw > 0 ? `<span class="text-red-600">-${this._formatShort(s.withdraw)}</span>` : ''}
                            ${s.virtualCredit > 0 ? `<span class="text-amber-600">CN +${this._formatShort(s.virtualCredit)}</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // =====================================================
    // TABLE RENDERING
    // =====================================================

    _renderRow(tx) {
        const amount = parseFloat(tx.amount) || 0;
        const isAdjust = tx.type === 'ADJUSTMENT';
        const isCredit = isAdjust ? (amount >= 0) : CREDIT_TYPES.includes(tx.type);
        const isVirtual = ['VIRTUAL_CREDIT', 'VIRTUAL_DEBIT', 'VIRTUAL_CANCEL'].includes(tx.type);
        const isLarge = Math.abs(amount) >= LARGE_AMOUNT_THRESHOLD;

        const typeColor = TYPE_COLORS[tx.type] || TYPE_COLORS['ADJUSTMENT'];
        const amountColor = isCredit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
        const sign = isCredit ? '+' : '-';

        const balanceAfter = isVirtual
            ? (parseFloat(tx.virtual_balance_after) || 0)
            : (parseFloat(tx.balance_after) || 0);

        const date = tx.created_at
            ? new Date(tx.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
            : '';

        const customerName = tx.customer_name || '';
        const phone = tx.phone || '';
        const creator = tx.created_by || '';
        const note = tx.note || '';

        // Related orders
        const orders = tx.related_orders || [];
        const ordersHtml = orders.length > 0
            ? orders.map(o => `<span class="text-primary hover:underline cursor-pointer text-xs" title="Đơn ${o.order_number}">${o.order_number || o.order_id}</span>`).join(', ')
            : '<span class="text-slate-300 dark:text-slate-600">-</span>';

        return `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors${isLarge ? ' bg-amber-50/50 dark:bg-amber-900/10' : ''}">
                <td class="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">${date}</td>
                <td class="px-4 py-3">
                    <div class="flex flex-col">
                        <a href="javascript:void(0)" onclick="window.openCustomerModal('${this._escapeHtml(phone)}')" class="text-sm font-medium text-primary hover:underline truncate max-w-[160px]" title="${this._escapeHtml(customerName)}">${this._escapeHtml(customerName) || phone}</a>
                        <span class="text-xs text-slate-400">${this._escapeHtml(phone)}</span>
                    </div>
                </td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${typeColor.bg} ${typeColor.text}">
                        ${TYPE_LABELS[tx.type] || tx.type}
                    </span>
                </td>
                <td class="px-4 py-3 text-center">
                    ${isVirtual
                        ? '<span class="text-amber-500" title="Công nợ ảo">&#11088;</span>'
                        : '<span class="text-green-600" title="Tiền thật">&#128181;</span>'
                    }
                </td>
                <td class="px-4 py-3 text-right">
                    <span class="font-semibold tabular-nums ${amountColor}">
                        ${isLarge ? '<span class="material-symbols-outlined text-amber-500 text-sm align-middle mr-0.5" title="Giao dịch lớn">warning</span>' : ''}
                        ${sign}${this._formatCurrency(Math.abs(amount))}
                    </span>
                </td>
                <td class="px-4 py-3 text-right text-sm text-slate-600 dark:text-slate-400 tabular-nums">${this._formatCurrency(balanceAfter)}</td>
                <td class="px-4 py-3">
                    <span class="text-sm font-medium text-red-500 truncate block max-w-[130px]" title="${this._escapeHtml(creator)}">${this._escapeHtml(creator)}</span>
                </td>
                <td class="px-4 py-3 max-w-[200px]">
                    ${this._renderNoteWithImage(note)}
                </td>
                <td class="px-4 py-3 text-sm">${ordersHtml}</td>
            </tr>
        `;
    }

    _renderLoadingRow() {
        return `
            <tr>
                <td colspan="9" class="px-6 py-12 text-center">
                    <div class="flex flex-col items-center">
                        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                            <span class="material-symbols-outlined text-primary text-2xl animate-spin">progress_activity</span>
                        </div>
                        <p class="text-slate-500 dark:text-slate-400">Đang tải giao dịch nạp tay...</p>
                    </div>
                </td>
            </tr>
        `;
    }

    _renderEmptyRow() {
        return `
            <tr>
                <td colspan="9" class="px-6 py-12 text-center">
                    <div class="flex flex-col items-center">
                        <span class="material-symbols-outlined text-slate-300 dark:text-slate-600 text-5xl mb-3">receipt_long</span>
                        <p class="text-slate-500 dark:text-slate-400 font-medium">Không có giao dịch nạp tay nào</p>
                        <p class="text-xs text-slate-400 mt-1">Thử thay đổi bộ lọc để xem kết quả khác</p>
                    </div>
                </td>
            </tr>
        `;
    }

    _renderErrorRow(message) {
        return `
            <tr>
                <td colspan="9" class="px-6 py-12 text-center">
                    <div class="flex flex-col items-center">
                        <span class="material-symbols-outlined text-red-400 text-4xl mb-3">error</span>
                        <p class="text-red-500 font-medium">Lỗi tải dữ liệu</p>
                        <p class="text-xs text-slate-400 mt-1">${this._escapeHtml(message)}</p>
                        <button onclick="this.closest('tr').parentElement.closest('[id]').__module?.loadTransactions()" class="mt-3 px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors">Thử lại</button>
                    </div>
                </td>
            </tr>
        `;
    }

    // =====================================================
    // PAGINATION
    // =====================================================

    _renderPagination(pagination) {
        if (!pagination) return;
        const { page, total, totalPages } = pagination;

        const start = total === 0 ? 0 : (page - 1) * this.limit + 1;
        const end = Math.min(page * this.limit, total);

        const startEl = document.getElementById('mt-showing-start');
        const endEl = document.getElementById('mt-showing-end');
        const totalEl = document.getElementById('mt-total-count');
        if (startEl) startEl.textContent = start;
        if (endEl) endEl.textContent = end;
        if (totalEl) totalEl.textContent = total;

        const nav = document.getElementById('mt-pagination-nav');
        if (!nav || totalPages <= 1) {
            if (nav) nav.innerHTML = '';
            return;
        }

        const btnClass = (active) => active
            ? 'px-3 py-1.5 text-sm font-semibold bg-primary text-white rounded-lg'
            : 'px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors';

        let buttons = '';

        // Prev
        if (page > 1) {
            buttons += `<button class="${btnClass(false)}" data-page="${page - 1}">
                <span class="material-symbols-outlined text-sm">chevron_left</span>
            </button>`;
        }

        // Page numbers
        const maxVisible = 5;
        let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        if (startPage > 1) {
            buttons += `<button class="${btnClass(false)}" data-page="1">1</button>`;
            if (startPage > 2) buttons += `<span class="px-1 text-slate-400">...</span>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            buttons += `<button class="${btnClass(i === page)}" data-page="${i}">${i}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) buttons += `<span class="px-1 text-slate-400">...</span>`;
            buttons += `<button class="${btnClass(false)}" data-page="${totalPages}">${totalPages}</button>`;
        }

        // Next
        if (page < totalPages) {
            buttons += `<button class="${btnClass(false)}" data-page="${page + 1}">
                <span class="material-symbols-outlined text-sm">chevron_right</span>
            </button>`;
        }

        nav.innerHTML = buttons;

        // Bind page clicks
        nav.querySelectorAll('button[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentPage = parseInt(btn.dataset.page);
                this.loadTransactions();
                // Scroll to top of table
                this.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    // =====================================================
    // CREATORS DROPDOWN
    // =====================================================

    _updateCreatorsDropdown(creators) {
        if (JSON.stringify(this.creators) === JSON.stringify(creators)) return;
        this.creators = creators;

        const select = document.getElementById('mt-creator-filter');
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = `<option value="">Tất cả người thực hiện</option>` +
            creators.map(c => `<option value="${this._escapeHtml(c)}"${c === currentValue ? ' selected' : ''}>${this._escapeHtml(c)}</option>`).join('');
    }

    // =====================================================
    // CSV EXPORT
    // =====================================================

    async _exportCSV() {
        try {
            const filters = this._collectFilters();
            // Fetch all data (up to 5000) for export
            const response = await apiService.getManualTransactions(1, 5000, filters);
            if (!response.success || !response.data) {
                alert('Không thể xuất dữ liệu');
                return;
            }

            const rows = response.data;
            const headers = ['Thời gian', 'SĐT', 'Tên KH', 'Loại GD', 'Loại số dư', 'Số tiền', 'Số dư sau GD', 'Người thực hiện', 'Ghi chú', 'Đơn hàng liên quan'];

            const csvRows = [headers.join(',')];
            for (const tx of rows) {
                const amount = parseFloat(tx.amount) || 0;
                const isVirtual = ['VIRTUAL_CREDIT', 'VIRTUAL_DEBIT', 'VIRTUAL_CANCEL'].includes(tx.type);
                const balanceAfter = isVirtual ? (parseFloat(tx.virtual_balance_after) || 0) : (parseFloat(tx.balance_after) || 0);
                const orders = (tx.related_orders || []).map(o => o.order_number || o.order_id).join('; ');
                const note = (tx.note || '').replace(/\[Ảnh GD: https?:\/\/[^\]]+\]/, '').trim();

                csvRows.push([
                    tx.created_at ? new Date(tx.created_at).toLocaleString('vi-VN') : '',
                    tx.phone || '',
                    `"${(tx.customer_name || '').replace(/"/g, '""')}"`,
                    TYPE_LABELS[tx.type] || tx.type,
                    isVirtual ? 'Công nợ ảo' : 'Tiền thật',
                    amount,
                    balanceAfter,
                    tx.created_by || '',
                    `"${note.replace(/"/g, '""')}"`,
                    orders
                ].join(','));
            }

            const bom = '\uFEFF';
            const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `giao-dich-nap-tay-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('[ManualTopupTab] CSV export failed:', error);
            alert('Lỗi xuất CSV: ' + error.message);
        }
    }

    // =====================================================
    // HELPERS
    // =====================================================

    _renderNoteWithImage(note) {
        if (!note) return '<span class="text-slate-300 dark:text-slate-600">-</span>';
        const imgMatch = note.match(/\[Ảnh GD: (https?:\/\/[^\]]+)\]/);
        const textPart = note.replace(/\n?\[Ảnh GD: https?:\/\/[^\]]+\]/, '').trim();
        let html = '';
        if (textPart && imgMatch) {
            html = `<div class="flex items-center gap-1.5">
                <p class="text-xs text-slate-500 truncate flex-1" title="${this._escapeHtml(textPart)}">${this._escapeHtml(textPart)}</p>
                <img src="${imgMatch[1]}" class="wallet-tx-thumb w-7 h-7 rounded border border-slate-200 dark:border-slate-600 object-cover cursor-pointer flex-shrink-0" alt="Ảnh GD">
            </div>`;
        } else if (textPart) {
            html = `<p class="text-xs text-slate-500 truncate" title="${this._escapeHtml(textPart)}">${this._escapeHtml(textPart)}</p>`;
        } else if (imgMatch) {
            html = `<img src="${imgMatch[1]}" class="wallet-tx-thumb w-7 h-7 rounded border border-slate-200 dark:border-slate-600 object-cover cursor-pointer" alt="Ảnh GD">`;
        }
        return html || '<span class="text-slate-300 dark:text-slate-600">-</span>';
    }

    _initImageLightbox() {
        if (window._walletShowImage) return;
        window._walletShowImage = (url) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;cursor:pointer';
            overlay.innerHTML = `<img src="${url}" style="max-width:90vw;max-height:90vh;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.5);object-fit:contain">`;
            overlay.onclick = () => overlay.remove();
            document.body.appendChild(overlay);
        };
        document.addEventListener('click', (e) => {
            const thumb = e.target.closest('.wallet-tx-thumb');
            if (thumb) {
                e.preventDefault();
                window._walletShowImage(thumb.src);
            }
        });
    }

    _toDateString(date) {
        return date.toISOString().split('T')[0];
    }

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    _formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
    }

    _formatShort(amount) {
        if (amount >= 1e6) return (amount / 1e6).toFixed(1).replace('.0', '') + 'M';
        if (amount >= 1e3) return Math.round(amount / 1e3) + 'K';
        return new Intl.NumberFormat('vi-VN').format(amount || 0);
    }

    destroy() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
    }
}
