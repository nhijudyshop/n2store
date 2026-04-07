// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// customer-hub/js/modules/wallet-panel.js
import apiService from '../api-service.js';
import { logAction } from '../../../shared/js/audit-logger.esm.js';

const TYPE_LABELS = {
    'DEPOSIT': 'Nạp tiền',
    'WITHDRAW': 'Rút tiền',
    'VIRTUAL_CREDIT': 'Cộng công nợ ảo',
    'VIRTUAL_DEBIT': 'Trừ công nợ ảo',
    'VIRTUAL_EXPIRE': 'Công nợ hết hạn',
    'VIRTUAL_CANCEL': 'Thu hồi công nợ ảo',
    'ADJUSTMENT': 'Điều chỉnh số dư',
    'RETURN_SHIPPER': 'Phiếu thu về',
    'RETURN_CLIENT': 'Phiếu trả hàng',
    'BOOM': 'Phiếu boom hàng',
    'FIX_COD': 'Phiếu sửa COD',
    'COD_ADJUSTMENT': 'Điều chỉnh COD',
    'ORDER_CANCEL_REFUND': 'Hoàn tiền hủy đơn',
    'OTHER': 'Phiếu khác'
};

const CREDIT_TYPES = ['DEPOSIT', 'VIRTUAL_CREDIT', 'ORDER_CANCEL_REFUND'];

// Manual operation types for the "Nạp/Rút Tay Công Nợ" tab
const MANUAL_TYPES = ['DEPOSIT', 'WITHDRAW', 'VIRTUAL_CREDIT', 'VIRTUAL_DEBIT', 'VIRTUAL_CANCEL', 'ADJUSTMENT'];

export class WalletPanelModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.customerPhone = null;
        this.eventSource = null;
        this._currentTab = 'overview'; // 'overview' | 'manual-history'
        this._walletData = null;
        this._manualTxCache = null; // cached manual transactions
        this._initImageLightbox();
    }

    async render(phone) {
        if (this.customerPhone !== phone) {
            this.closeSSE();
            this._manualTxCache = null;
        }
        this.customerPhone = phone;
        this._currentTab = 'overview';

        if (!this.permissionHelper.hasPermission('customer-hub', 'viewWallet')) {
            this.container.innerHTML = `
                <div class="p-6 h-full flex flex-col items-center justify-center">
                    <span class="material-symbols-outlined text-4xl text-red-400 mb-2">lock</span>
                    <p class="text-red-500 text-sm">Bạn không có quyền xem thông tin ví.</p>
                </div>`;
            return;
        }

        this._showLoading();
        await this.loadWalletDetails();
    }

    _showLoading() {
        this.container.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-50 to-transparent dark:from-green-900/10 rounded-bl-full -z-0 opacity-50"></div>
            <div class="p-6 relative z-10 flex flex-col h-full">
                <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
                    <span class="material-symbols-outlined text-green-600 dark:text-green-500">account_balance_wallet</span>
                    Ví Khách Hàng
                </h3>
                <div class="flex-1 flex items-center justify-center">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
            </div>`;
    }

    async loadWalletDetails() {
        if (!this.customerPhone) {
            return this._renderMessage('error', 'Không có số điện thoại khách hàng.');
        }
        try {
            const wallet = await apiService.getWallet(this.customerPhone);
            if (wallet) {
                this._walletData = wallet;
                this.renderWallet(wallet);
                this.subscribeToRealtimeUpdates();
            } else {
                this._renderMessage('empty', 'Chưa có thông tin ví');
            }
        } catch (error) {
            this._renderMessage('error', `Lỗi: ${error.message}`);
        }
    }

    _renderMessage(type, message) {
        const icon = type === 'error' ? 'error' : 'account_balance_wallet';
        const color = type === 'error' ? 'red' : 'slate';
        this.container.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-50 to-transparent dark:from-green-900/10 rounded-bl-full -z-0 opacity-50"></div>
            <div class="p-6 relative z-10 flex flex-col h-full">
                <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
                    <span class="material-symbols-outlined text-green-600">account_balance_wallet</span>
                    Ví Khách Hàng
                </h3>
                <div class="flex-1 flex flex-col items-center justify-center text-${color}-400">
                    <span class="material-symbols-outlined text-4xl mb-2">${icon}</span>
                    <p class="text-sm text-center">${message}</p>
                </div>
            </div>`;
    }

    _renderTabBar() {
        const isOverview = this._currentTab === 'overview';
        const activeStyle = 'color: #16a34a; border-bottom: 2px solid #16a34a; font-weight: 700;';
        const inactiveStyle = 'color: #94a3b8; border-bottom: 2px solid transparent;';
        return `
            <div style="display: flex; gap: 0; border-bottom: 1px solid #e2e8f0;" class="dark:border-slate-700">
                <button data-tab="overview" class="wallet-tab-btn" style="flex: 1; padding: 6px 4px; font-size: 11px; text-align: center; transition: all 0.15s; ${isOverview ? activeStyle : inactiveStyle}">
                    Tổng quan
                </button>
                <button data-tab="manual-history" class="wallet-tab-btn" style="flex: 1; padding: 6px 4px; font-size: 11px; text-align: center; transition: all 0.15s; ${!isOverview ? activeStyle : inactiveStyle}">
                    Nạp/Rút Tay
                </button>
            </div>`;
    }

    renderWallet(wallet) {
        const realBalance = parseFloat(wallet.balance || wallet.real_balance) || 0;
        const virtualBalance = parseFloat(wallet.virtual_balance) || 0;
        const totalBalance = wallet.total_balance || (realBalance + virtualBalance);
        const canManage = this.permissionHelper.hasPermission('customer-hub', 'manageWallet');
        this._walletData = wallet;

        this.container.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-50 to-transparent dark:from-green-900/10 rounded-bl-full -z-0 opacity-50"></div>
            <div class="relative z-10 flex flex-col h-full">
                <!-- Header -->
                <div class="flex items-center justify-between px-6 pt-4 pb-2">
                    <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-green-600 dark:text-green-500">account_balance_wallet</span>
                        Ví Khách Hàng
                    </h3>
                    <button id="view-history-btn" class="text-xs text-primary font-medium hover:underline">Lịch sử</button>
                </div>
                <!-- Tab Bar -->
                ${this._renderTabBar()}
                <!-- Tab Content -->
                <div id="wallet-tab-content" class="flex-1 overflow-y-auto">
                    ${this._currentTab === 'overview'
                        ? this._renderOverviewContent(totalBalance, realBalance, virtualBalance, canManage)
                        : '<div class="p-4 flex items-center justify-center"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div></div>'
                    }
                </div>
            </div>`;

        // Event delegation
        this.container.querySelector('#view-history-btn')?.addEventListener('click', () => this._showTransactionHistory());
        this.container.querySelectorAll('.wallet-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this._switchTab(btn.dataset.tab));
        });
        this.container.querySelectorAll('.wallet-action-btn').forEach(btn => {
            btn.addEventListener('click', () => this._showActionModal(btn.dataset.action));
        });

        // If manual-history tab is active, load data
        if (this._currentTab === 'manual-history') {
            this._loadManualHistory();
        }
    }

    _renderOverviewContent(totalBalance, realBalance, virtualBalance, canManage) {
        return `
            <div class="px-6 py-4 flex flex-col justify-center gap-4">
                <div>
                    <p class="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Số dư khả dụng</p>
                    <p class="text-4xl font-bold text-green-600 dark:text-green-500 tracking-tight tabular-nums">${this._formatCurrency(totalBalance)}</p>
                </div>
                <div class="flex items-center gap-3 py-3 border-y border-dashed border-slate-200 dark:border-slate-700">
                    <div class="flex-1">
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Tiền thật</p>
                        <p class="text-xl font-semibold text-slate-700 dark:text-slate-300 tabular-nums">${this._formatShort(realBalance)}</p>
                    </div>
                    <div class="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                    <div class="flex-1">
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Công nợ ảo</p>
                        <p class="text-xl font-semibold text-amber-500 tabular-nums flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm">token</span>
                            ${this._formatShort(virtualBalance)}
                        </p>
                    </div>
                </div>
            </div>
            ${canManage ? `
                <div class="grid grid-cols-2 gap-2 px-6 pb-4">
                    <button data-action="deposit" class="wallet-action-btn py-2 px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1">
                        <span class="material-symbols-outlined text-[16px]">add</span> Nạp tiền
                    </button>
                    <button data-action="withdraw" class="wallet-action-btn py-2 px-3 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-1">
                        <span class="material-symbols-outlined text-[16px]">remove</span> Rút tiền
                    </button>
                    <button data-action="issue_vc" class="wallet-action-btn col-span-2 py-2 px-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800 text-xs font-bold transition-all flex items-center justify-center gap-1">
                        <span class="material-symbols-outlined text-[16px]">stars</span> Cấp công nợ ảo
                    </button>
                </div>
            ` : ''}`;
    }

    async _switchTab(tab) {
        if (tab === this._currentTab) return;
        this._currentTab = tab;

        if (this._walletData) {
            this.renderWallet(this._walletData);
            if (tab === 'manual-history') {
                await this._loadManualHistory();
            }
        }
    }

    async _loadManualHistory() {
        const contentEl = this.container.querySelector('#wallet-tab-content');
        if (!contentEl) return;

        // Show loading
        contentEl.innerHTML = `
            <div class="p-6 flex items-center justify-center">
                <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
            </div>`;

        try {
            // Fetch all transactions (use larger limit to get full history)
            const response = await fetch(`${apiService.RENDER_API_URL}/v2/wallets/${this.customerPhone}/transactions?limit=200`);
            if (!response.ok) throw new Error('Không thể tải lịch sử');
            const { data: allTx = [] } = await response.json();

            // Filter only manual operation types
            this._manualTxCache = allTx.filter(tx => MANUAL_TYPES.includes(tx.type));

            this._renderManualHistoryTab();
        } catch (err) {
            contentEl.innerHTML = `
                <div class="p-6 text-center text-red-500">
                    <span class="material-symbols-outlined text-3xl mb-2">error</span>
                    <p class="text-xs">${err.message}</p>
                </div>`;
        }
    }

    _renderManualHistoryTab() {
        const contentEl = this.container.querySelector('#wallet-tab-content');
        if (!contentEl || !this._manualTxCache) return;

        const transactions = this._manualTxCache;

        // Extract unique created_by values for filter
        const creators = [...new Set(transactions.map(tx => tx.created_by).filter(c => c && c !== 'system'))];

        contentEl.innerHTML = `
            <!-- Filters -->
            <div class="px-3 pt-3 pb-2 space-y-2" style="border-bottom: 1px solid #e2e8f0;">
                <!-- Type filter chips -->
                <div class="flex flex-wrap gap-1">
                    <button data-filter-type="all" class="manual-type-chip px-2 py-0.5 rounded-full text-[10px] font-bold transition-all" style="background: #16a34a; color: white;">Tất cả</button>
                    <button data-filter-type="DEPOSIT" class="manual-type-chip px-2 py-0.5 rounded-full text-[10px] font-bold transition-all" style="background: #f1f5f9; color: #64748b;">Nạp</button>
                    <button data-filter-type="WITHDRAW" class="manual-type-chip px-2 py-0.5 rounded-full text-[10px] font-bold transition-all" style="background: #f1f5f9; color: #64748b;">Rút</button>
                    <button data-filter-type="VIRTUAL_CREDIT" class="manual-type-chip px-2 py-0.5 rounded-full text-[10px] font-bold transition-all" style="background: #f1f5f9; color: #64748b;">+CN ảo</button>
                    <button data-filter-type="VIRTUAL_DEBIT" class="manual-type-chip px-2 py-0.5 rounded-full text-[10px] font-bold transition-all" style="background: #f1f5f9; color: #64748b;">-CN ảo</button>
                    <button data-filter-type="VIRTUAL_CANCEL" class="manual-type-chip px-2 py-0.5 rounded-full text-[10px] font-bold transition-all" style="background: #f1f5f9; color: #64748b;">Thu hồi</button>
                    <button data-filter-type="ADJUSTMENT" class="manual-type-chip px-2 py-0.5 rounded-full text-[10px] font-bold transition-all" style="background: #f1f5f9; color: #64748b;">Đ.chỉnh</button>
                </div>
                <!-- Date range + Creator -->
                <div class="flex gap-1">
                    <input type="date" id="manual-date-from" class="flex-1 px-1.5 py-1 border border-slate-200 dark:border-slate-600 rounded text-[10px] bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200" title="Từ ngày">
                    <input type="date" id="manual-date-to" class="flex-1 px-1.5 py-1 border border-slate-200 dark:border-slate-600 rounded text-[10px] bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200" title="Đến ngày">
                </div>
                ${creators.length > 0 ? `
                    <select id="manual-creator-filter" class="w-full px-1.5 py-1 border border-slate-200 dark:border-slate-600 rounded text-[10px] bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                        <option value="">Người thực hiện: Tất cả</option>
                        ${creators.map(c => `<option value="${this._escapeHtml(c)}">${this._escapeHtml(c)}</option>`).join('')}
                    </select>
                ` : ''}
                <!-- Search -->
                <input type="text" id="manual-search" class="w-full px-2 py-1 border border-slate-200 dark:border-slate-600 rounded text-[10px] bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200" placeholder="Tìm ghi chú, người thực hiện...">
            </div>
            <!-- Transaction list -->
            <div id="manual-tx-list" class="overflow-y-auto" style="flex: 1;">
                ${this._renderManualTxList(transactions)}
            </div>
            <!-- Summary bar -->
            <div id="manual-summary" class="px-3 py-2 text-[10px] text-slate-500 font-medium" style="border-top: 1px solid #e2e8f0;">
                ${this._renderManualSummary(transactions)}
            </div>`;

        // Bind filter events
        this._bindManualFilters();
    }

    _renderManualTxList(transactions) {
        if (transactions.length === 0) {
            return `
                <div class="p-6 text-center text-slate-400">
                    <span class="material-symbols-outlined text-3xl mb-1">receipt_long</span>
                    <p class="text-xs">Không có giao dịch nào</p>
                </div>`;
        }

        return `<div class="space-y-1 p-2">${transactions.map(tx => this._renderManualTxItem(tx)).join('')}</div>`;
    }

    _renderManualTxItem(tx) {
        const txAmount = parseFloat(tx.amount) || 0;
        const isAdjust = tx.type === 'ADJUSTMENT';
        const isCredit = isAdjust ? (txAmount >= 0) : CREDIT_TYPES.includes(tx.type);
        const bgColor = isCredit ? '#f0fdf4' : '#fef2f2';
        const amountColor = isCredit ? '#16a34a' : '#dc2626';
        const sign = isCredit ? '+' : '-';
        let txLabel = TYPE_LABELS[tx.type] || 'Giao dịch';
        if (isAdjust) {
            const cp = tx.counterparty_phone;
            txLabel = isCredit
                ? (cp ? `Nhận ĐC từ ${cp}` : 'Nhận điều chỉnh ví')
                : (cp ? `ĐC chuyển sang ${cp}` : 'Điều chỉnh trừ ví');
        }

        const date = tx.created_at
            ? new Date(tx.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
            : '';
        const expiry = (tx.type === 'VIRTUAL_CREDIT' && tx.expires_at)
            ? ` · HSD: ${new Date(tx.expires_at).toLocaleDateString('vi-VN')}`
            : '';
        const creator = (tx.created_by && tx.created_by !== 'system') ? tx.created_by
            : (tx.reference_id && tx.reference_id !== 'admin' && tx.reference_id.includes('@')) ? tx.reference_id : '';
        const note = tx.note || tx.source || '';

        // Type icon mapping
        const typeIcons = {
            'DEPOSIT': 'add_circle',
            'WITHDRAW': 'remove_circle',
            'VIRTUAL_CREDIT': 'stars',
            'VIRTUAL_DEBIT': 'star_half',
            'VIRTUAL_CANCEL': 'block',
            'ADJUSTMENT': 'tune'
        };
        const icon = typeIcons[tx.type] || 'swap_horiz';

        return `
            <div class="rounded-lg p-2" style="background: ${bgColor};" data-tx-type="${tx.type}" data-tx-date="${tx.created_at || ''}" data-tx-creator="${this._escapeHtml(creator)}" data-tx-note="${this._escapeHtml(note)}">
                <div class="flex items-start gap-2">
                    <span class="material-symbols-outlined" style="font-size: 16px; color: ${amountColor}; margin-top: 1px;">${icon}</span>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between">
                            <span class="text-[11px] font-bold text-slate-800 dark:text-slate-200">${txLabel}</span>
                            <span class="text-[11px] font-bold tabular-nums" style="color: ${amountColor};">${sign}${this._formatCurrency(Math.abs(tx.amount))}</span>
                        </div>
                        ${note ? this._renderNoteWithImage(note) : ''}
                        <div class="flex items-center gap-1 mt-0.5">
                            <span class="text-[9px] text-slate-400">${date}${expiry}</span>
                            ${creator ? `<span class="text-[9px] text-slate-400">·</span><span class="text-[9px] font-semibold" style="color: #ef4444;">${this._escapeHtml(creator)}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>`;
    }

    _renderManualSummary(transactions) {
        const totalDeposit = transactions.filter(tx => tx.type === 'DEPOSIT').reduce((s, tx) => s + Math.abs(tx.amount || 0), 0);
        const totalWithdraw = transactions.filter(tx => tx.type === 'WITHDRAW').reduce((s, tx) => s + Math.abs(tx.amount || 0), 0);
        const totalVC = transactions.filter(tx => tx.type === 'VIRTUAL_CREDIT').reduce((s, tx) => s + Math.abs(tx.amount || 0), 0);

        const parts = [];
        if (totalDeposit > 0) parts.push(`<span style="color: #16a34a;">+${this._formatShort(totalDeposit)} nạp</span>`);
        if (totalWithdraw > 0) parts.push(`<span style="color: #dc2626;">-${this._formatShort(totalWithdraw)} rút</span>`);
        if (totalVC > 0) parts.push(`<span style="color: #d97706;">+${this._formatShort(totalVC)} CN ảo</span>`);

        return `${transactions.length} giao dịch${parts.length > 0 ? ' · ' + parts.join(' · ') : ''}`;
    }

    _bindManualFilters() {
        let activeType = 'all';

        const applyFilters = () => {
            if (!this._manualTxCache) return;

            const dateFrom = this.container.querySelector('#manual-date-from')?.value;
            const dateTo = this.container.querySelector('#manual-date-to')?.value;
            const creator = this.container.querySelector('#manual-creator-filter')?.value || '';
            const search = (this.container.querySelector('#manual-search')?.value || '').toLowerCase().trim();

            let filtered = this._manualTxCache;

            // Type filter
            if (activeType !== 'all') {
                filtered = filtered.filter(tx => tx.type === activeType);
            }

            // Date filter
            if (dateFrom) {
                const from = new Date(dateFrom);
                from.setHours(0, 0, 0, 0);
                filtered = filtered.filter(tx => tx.created_at && new Date(tx.created_at) >= from);
            }
            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                filtered = filtered.filter(tx => tx.created_at && new Date(tx.created_at) <= to);
            }

            // Creator filter
            if (creator) {
                filtered = filtered.filter(tx => tx.created_by === creator);
            }

            // Search filter (note + created_by)
            if (search) {
                filtered = filtered.filter(tx => {
                    const noteStr = (tx.note || tx.source || '').toLowerCase();
                    const creatorStr = (tx.created_by || '').toLowerCase();
                    return noteStr.includes(search) || creatorStr.includes(search);
                });
            }

            // Update list
            const listEl = this.container.querySelector('#manual-tx-list');
            if (listEl) listEl.innerHTML = this._renderManualTxList(filtered);

            // Update summary
            const summaryEl = this.container.querySelector('#manual-summary');
            if (summaryEl) summaryEl.innerHTML = this._renderManualSummary(filtered);
        };

        // Type chips
        this.container.querySelectorAll('.manual-type-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                activeType = chip.dataset.filterType;
                // Update chip styles
                this.container.querySelectorAll('.manual-type-chip').forEach(c => {
                    if (c.dataset.filterType === activeType) {
                        c.style.background = '#16a34a';
                        c.style.color = 'white';
                    } else {
                        c.style.background = '#f1f5f9';
                        c.style.color = '#64748b';
                    }
                });
                applyFilters();
            });
        });

        // Date, creator, search filters
        this.container.querySelector('#manual-date-from')?.addEventListener('change', applyFilters);
        this.container.querySelector('#manual-date-to')?.addEventListener('change', applyFilters);
        this.container.querySelector('#manual-creator-filter')?.addEventListener('change', applyFilters);

        let searchTimeout;
        this.container.querySelector('#manual-search')?.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(applyFilters, 300);
        });
    }

    _showActionModal(action) {
        // Defense-in-depth: chặn modal nếu user không có quyền manageWallet
        if (!this.permissionHelper.hasPermission('customer-hub', 'manageWallet')) {
            alert('Bạn không có quyền thực hiện thao tác này');
            return;
        }

        // Use inline styles for button colors because Tailwind CSS purge may not include
        // dynamic classes like bg-red-600, bg-amber-600 in the built CSS
        const configs = {
            deposit: { title: 'Nạp tiền vào ví', icon: 'add', btnStyle: 'background:#16a34a;', btnHoverBg: '#15803d', buttonText: 'Nạp tiền', iconColor: '#16a34a' },
            withdraw: { title: 'Rút tiền từ ví', icon: 'remove', btnStyle: 'background:#dc2626;', btnHoverBg: '#b91c1c', buttonText: 'Rút tiền', iconColor: '#dc2626' },
            issue_vc: { title: 'Cấp công nợ ảo', icon: 'stars', btnStyle: 'background:#d97706;', btnHoverBg: '#b45309', buttonText: 'Cấp công nợ', showExpiry: true, iconColor: '#d97706' }
        };
        const cfg = configs[action];
        if (!cfg) return;

        const modal = document.createElement('div');
        modal.id = 'wallet-action-modal';
        modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md">
                <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined" style="color:${cfg.iconColor}">${cfg.icon}</span>
                        ${cfg.title}
                    </h3>
                    <button class="close-btn p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="p-6">
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Số tiền (VNĐ)</label>
                    <input type="number" name="amount" class="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-lg mb-4" placeholder="Nhập số tiền" min="1000" step="1000">
                    ${cfg.showExpiry ? `
                        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Số ngày hiệu lực</label>
                        <input type="number" name="expiry" class="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white mb-4" value="15" min="1" max="365">
                    ` : ''}
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Ghi chú (tùy chọn)</label>
                    <textarea name="note" rows="2" class="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white mb-4" placeholder="Nhập ghi chú..."></textarea>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Ảnh giao dịch (tùy chọn)</label>
                    <div class="wallet-img-upload mb-4">
                        <div class="wallet-img-dropzone relative border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors" style="min-height:80px">
                            <input type="file" accept="image/*" class="wallet-img-input absolute inset-0 opacity-0 cursor-pointer" style="z-index:2">
                            <div class="wallet-img-placeholder pointer-events-none">
                                <span class="material-symbols-outlined text-slate-400 text-3xl">add_photo_alternate</span>
                                <p class="text-xs text-slate-400 mt-1">Nhấn để chọn ảnh hoặc dán (Ctrl+V)</p>
                            </div>
                            <div class="wallet-img-preview hidden">
                                <img class="wallet-img-thumb max-h-32 mx-auto rounded" />
                                <button type="button" class="wallet-img-remove absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600" style="z-index:3">&times;</button>
                            </div>
                        </div>
                    </div>
                    <div class="error-msg hidden mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm"></div>
                    <button class="submit-btn w-full py-3 px-4 text-white font-bold rounded-lg flex items-center justify-center gap-2" style="${cfg.btnStyle}">
                        <span class="material-symbols-outlined">${cfg.icon}</span> ${cfg.buttonText}
                    </button>
                </div>
            </div>`;

        document.body.appendChild(modal);

        const close = () => modal.remove();
        modal.querySelector('.close-btn').onclick = close;
        modal.onclick = e => e.target === modal && close();

        // --- Image upload/paste logic ---
        let selectedImageFile = null;
        const imgInput = modal.querySelector('.wallet-img-input');
        const imgPlaceholder = modal.querySelector('.wallet-img-placeholder');
        const imgPreview = modal.querySelector('.wallet-img-preview');
        const imgThumb = modal.querySelector('.wallet-img-thumb');
        const imgRemove = modal.querySelector('.wallet-img-remove');

        const showImagePreview = (file) => {
            if (!file || !file.type.startsWith('image/')) return;
            if (file.size > 5 * 1024 * 1024) { alert('Ảnh quá lớn (tối đa 5MB)'); return; }
            selectedImageFile = file;
            const url = URL.createObjectURL(file);
            imgThumb.src = url;
            imgPlaceholder.classList.add('hidden');
            imgPreview.classList.remove('hidden');
        };

        const clearImage = () => {
            selectedImageFile = null;
            imgInput.value = '';
            if (imgThumb.src) URL.revokeObjectURL(imgThumb.src);
            imgThumb.src = '';
            imgPreview.classList.add('hidden');
            imgPlaceholder.classList.remove('hidden');
        };

        imgInput.addEventListener('change', e => {
            if (e.target.files?.[0]) showImagePreview(e.target.files[0]);
        });
        imgRemove.addEventListener('click', e => { e.stopPropagation(); clearImage(); });

        // Paste support
        modal.addEventListener('paste', e => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    showImagePreview(item.getAsFile());
                    break;
                }
            }
        });

        const submitBtn = modal.querySelector('.submit-btn');
        const errorDiv = modal.querySelector('.error-msg');

        submitBtn.onclick = async () => {
            const amount = parseFloat(modal.querySelector('[name="amount"]').value);
            let note = modal.querySelector('[name="note"]').value.trim();
            const expiry = parseInt(modal.querySelector('[name="expiry"]')?.value) || 15;

            if (!amount || amount < 1000) {
                errorDiv.textContent = 'Số tiền phải >= 1,000 VNĐ';
                errorDiv.classList.remove('hidden');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="animate-spin material-symbols-outlined">sync</span> Đang xử lý...';

            try {
                // Upload image if selected
                if (selectedImageFile) {
                    submitBtn.innerHTML = '<span class="animate-spin material-symbols-outlined">sync</span> Đang tải ảnh...';
                    const imageUrl = await this._uploadWalletImage(selectedImageFile);
                    note = note ? `${note}\n[Ảnh GD: ${imageUrl}]` : `[Ảnh GD: ${imageUrl}]`;
                }

                const user = this._getCurrentUser();
                const actionTypeMap = { deposit: 'wallet_add_debt', withdraw: 'wallet_subtract_debt', issue_vc: 'wallet_adjust_debt' };
                const descMap = { deposit: `Nạp ${amount.toLocaleString('vi-VN')}đ vào ví ${this.customerPhone}`, withdraw: `Rút ${amount.toLocaleString('vi-VN')}đ từ ví ${this.customerPhone}`, issue_vc: `Cấp công nợ ảo ${amount.toLocaleString('vi-VN')}đ cho ${this.customerPhone} (${expiry} ngày)` };

                if (action === 'deposit') {
                    await apiService.walletDeposit(this.customerPhone, amount, { source: 'MANUAL_ADJUSTMENT', note: note || 'Nạp tiền từ Customer 360', created_by: user });
                } else if (action === 'withdraw') {
                    await apiService.walletWithdraw(this.customerPhone, amount, null, note || 'Rút tiền từ Customer 360', user);
                } else if (action === 'issue_vc') {
                    await apiService.issueVirtualCredit(this.customerPhone, amount, { source_type: 'ADMIN_ISSUE', expiry_days: expiry, note: note || `Cấp công nợ ảo (${expiry} ngày)`, created_by: user });
                }

                // Audit logging - fire-and-forget
                try {
                    logAction(actionTypeMap[action] || 'wallet_transaction', {
                        module: 'customer-hub',
                        description: descMap[action] || `Thao tác ví: ${action}`,
                        oldData: null,
                        newData: { amount, action, note, customerId: this.customerPhone },
                        entityId: this.customerPhone,
                        entityType: 'customer'
                    });
                } catch (e) { /* audit log error - ignore */ }

                close();
                this._manualTxCache = null; // invalidate cache
                await this.loadWalletDetails();

                // Notify search list to refresh wallet balance
                window.dispatchEvent(new CustomEvent('wallet-updated', {
                    detail: { phone: this.customerPhone, action }
                }));
            } catch (err) {
                errorDiv.textContent = err.message;
                errorDiv.classList.remove('hidden');
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span class="material-symbols-outlined">${cfg.icon}</span> Thử lại`;
            }
        };

        modal.querySelector('[name="amount"]').focus();
    }

    async _uploadWalletImage(file) {
        const reader = new FileReader();
        const base64 = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        const timestamp = Date.now();
        const ext = file.name?.split('.').pop() || 'jpg';
        const fileName = `wallet_${this.customerPhone}_${timestamp}.${ext}`;

        const response = await fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/upload/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: base64,
                fileName,
                folderPath: 'wallet-transactions',
                mimeType: file.type
            })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Upload ảnh thất bại');
        return result.url;
    }

    async _showTransactionHistory() {
        if (!this.customerPhone) return alert('Không có số điện thoại khách hàng.');

        try {
            const response = await fetch(`${apiService.RENDER_API_URL}/v2/wallets/${this.customerPhone}/transactions?limit=50`);
            if (!response.ok) throw new Error('Không thể tải lịch sử giao dịch');
            const { data: transactions = [] } = await response.json();

            const modal = document.createElement('div');
            modal.id = 'transaction-history-modal';
            modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6';
            modal.innerHTML = `
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col" style="max-height: calc(100dvh - 48px);">
                    <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <span class="material-symbols-outlined text-green-600">history</span>
                            Lịch sử giao dịch ví
                        </h3>
                        <button class="close-btn p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <div class="overflow-y-auto p-4 flex-1">
                        ${transactions.length === 0
                            ? '<div class="text-center py-8 text-slate-500"><span class="material-symbols-outlined text-4xl mb-2">receipt_long</span><p>Chưa có giao dịch nào</p></div>'
                            : `<div class="space-y-3">${transactions.map(tx => this._renderTx(tx)).join('')}</div>`
                        }
                    </div>
                </div>`;

            document.body.appendChild(modal);
            const close = () => modal.remove();
            modal.querySelector('.close-btn').onclick = close;
            modal.onclick = e => e.target === modal && close();
        } catch (err) {
            alert(`Lỗi: ${err.message}`);
        }
    }

    _renderTx(tx) {
        const txAmount = parseFloat(tx.amount) || 0;
        const isAdjust = tx.type === 'ADJUSTMENT';
        const isCredit = isAdjust ? (txAmount >= 0) : CREDIT_TYPES.includes(tx.type);
        const bg = isCredit ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20';
        const color = isCredit ? 'text-green-600' : 'text-red-600';
        let txLabel = TYPE_LABELS[tx.type] || 'Giao dịch ví';
        if (isAdjust) {
            const cp = tx.counterparty_phone;
            txLabel = isCredit
                ? (cp ? `Nhận điều chỉnh từ ${cp}` : 'Nhận điều chỉnh ví')
                : (cp ? `Điều chỉnh chuyển sang ${cp}` : 'Điều chỉnh trừ ví');
        }
        const date = tx.created_at ? new Date(tx.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const expiry = (tx.type === 'VIRTUAL_CREDIT' && tx.expires_at)
            ? `<span class="text-orange-500 ml-1">• HSD: ${new Date(tx.expires_at).toLocaleDateString('vi-VN')}</span>` : '';
        const creator = (tx.created_by && tx.created_by !== 'system') ? tx.created_by
            : (tx.reference_id && tx.reference_id !== 'admin' && tx.reference_id.includes('@')) ? tx.reference_id : '';
        const createdBy = creator ? ` · <span class="font-medium" style="color:#ef4444">${this._escapeHtml(creator)}</span>` : '';

        return `
            <div class="flex items-center gap-3 p-3 rounded-lg ${bg}">
                <div class="flex-1">
                    <p class="font-medium text-slate-800 dark:text-slate-200">${txLabel}</p>
                    <div class="text-xs text-slate-500">${this._renderNoteWithImage(tx.note || tx.source || '')}</div>
                    <p class="text-xs text-slate-400">${date}${expiry}${createdBy}</p>
                </div>
                <p class="font-bold ${color}">${isCredit ? '+' : '-'}${this._formatCurrency(Math.abs(tx.amount))}</p>
            </div>`;
    }

    // SSE Realtime
    subscribeToRealtimeUpdates() {
        if (!this.customerPhone) return;
        this.closeSSE();

        const sseUrl = `${apiService.RENDER_SSE_URL}/api/realtime/sse?keys=wallet:${this.customerPhone}`;
        this.eventSource = new EventSource(sseUrl);

        const handleUpdate = (event) => {
            try {
                const data = JSON.parse(event.data);
                const walletData = data.data?.wallet || (data.event === 'wallet_update' && data.data?.wallet);
                if (walletData) {
                    this._walletData = walletData;
                    this._manualTxCache = null; // invalidate cache on update
                    this.renderWallet(walletData);
                    if (data.data?.transaction?.amount > 0) this._showNotification(data.data.transaction);
                    // Notify search list to refresh wallet balance
                    window.dispatchEvent(new CustomEvent('wallet-updated', {
                        detail: { phone: this.customerPhone, action: 'sse_update' }
                    }));
                }
            } catch (e) { /* ignore parse errors */ }
        };

        this.eventSource.addEventListener('wallet_update', handleUpdate);
        this.eventSource.addEventListener('update', handleUpdate);
    }

    _showNotification(tx) {
        const el = document.createElement('div');
        el.className = 'fixed bottom-4 right-4 z-50 animate-pulse';
        el.innerHTML = `
            <div class="bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
                <span class="material-symbols-outlined">account_balance_wallet</span>
                <div>
                    <p class="font-bold">${tx.type === 'DEPOSIT' ? 'Nạp tiền thành công!' : 'Cập nhật ví'}</p>
                    <p class="text-sm">+${this._formatCurrency(tx.amount)}</p>
                </div>
            </div>`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 5000);
    }

    closeSSE() {
        this.eventSource?.close();
        this.eventSource = null;
    }

    destroy() {
        this.closeSSE();
        this.customerPhone = null;
        this._manualTxCache = null;
    }

    // Helpers
    _getCurrentUser() {
        try {
            const u = JSON.parse(localStorage.getItem('n2shop_current_user') || '{}');
            return u.email || u.displayName || 'admin';
        } catch { return 'admin'; }
    }

    _renderNoteWithImage(note) {
        const imgMatch = note.match(/\[Ảnh GD: (https?:\/\/[^\]]+)\]/);
        const textPart = note.replace(/\n?\[Ảnh GD: https?:\/\/[^\]]+\]/, '').trim();
        let html = '';
        if (textPart && imgMatch) {
            // Note + small thumbnail inline
            html = `<div class="flex items-center gap-1.5">
                <p class="text-[10px] text-slate-500 truncate flex-1">${this._escapeHtml(textPart)}</p>
                <img src="${imgMatch[1]}" class="wallet-tx-thumb w-8 h-8 rounded border border-slate-200 dark:border-slate-600 object-cover cursor-pointer flex-shrink-0" alt="Ảnh GD">
            </div>`;
        } else if (textPart) {
            html = `<p class="text-[10px] text-slate-500 truncate">${this._escapeHtml(textPart)}</p>`;
        } else if (imgMatch) {
            html = `<img src="${imgMatch[1]}" class="wallet-tx-thumb w-8 h-8 rounded border border-slate-200 dark:border-slate-600 object-cover cursor-pointer" alt="Ảnh GD">`;
        }
        return html;
    }

    _initImageLightbox() {
        if (window._walletShowImage) return;

        // Lightbox on click - z-index higher than any modal
        window._walletShowImage = (url) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;cursor:pointer';
            overlay.innerHTML = `<img src="${url}" style="max-width:90vw;max-height:90vh;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.5);object-fit:contain">`;
            overlay.onclick = () => overlay.remove();
            document.body.appendChild(overlay);
        };

        // Event delegation for click only
        document.addEventListener('click', (e) => {
            const thumb = e.target.closest('.wallet-tx-thumb');
            if (thumb) {
                e.preventDefault();
                window._walletShowImage(thumb.src);
            }
        });
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
}
