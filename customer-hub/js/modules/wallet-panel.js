// customer-hub/js/modules/wallet-panel.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class WalletPanelModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.customerPhone = null;
        this.eventSource = null; // SSE connection
        this.lastWalletData = null; // Cache last wallet data for comparison
    }

    async render(phone) {
        // Close previous SSE connection if phone changes
        if (this.customerPhone && this.customerPhone !== phone) {
            this.closeSSE();
        }

        this.customerPhone = phone;
        if (!this.permissionHelper.hasPermission('customer-hub', 'viewWallet')) {
            this.container.innerHTML = `
                <div class="p-6 h-full flex flex-col items-center justify-center">
                    <span class="material-symbols-outlined text-4xl text-red-400 mb-2">lock</span>
                    <p class="text-red-500 text-sm">Bạn không có quyền xem thông tin ví.</p>
                </div>
            `;
            return;
        }

        // Show loading state
        this.container.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-50 to-transparent dark:from-green-900/10 rounded-bl-full -z-0 opacity-50"></div>
            <div class="p-6 relative z-10 flex flex-col h-full">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-green-600 dark:text-green-500">account_balance_wallet</span>
                        Ví Khách Hàng
                    </h3>
                </div>
                <div class="flex-1 flex items-center justify-center">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
            </div>
        `;
        await this.loadWalletDetails();
    }

    async loadWalletDetails() {
        if (!this.customerPhone) {
            this.renderError('Không có số điện thoại khách hàng.');
            return;
        }
        try {
            const wallet = await apiService.getWallet(this.customerPhone);
            if (wallet) {
                this.lastWalletData = wallet;
                this.renderWallet(wallet);
                // Start SSE subscription for realtime updates
                this.subscribeToRealtimeUpdates();
            } else {
                this.renderEmpty();
            }
        } catch (error) {
            this.renderError(`Lỗi: ${error.message}`);
            console.error('Error loading wallet details:', error);
        }
    }

    renderError(message) {
        this.container.innerHTML = `
            <div class="p-6 h-full flex flex-col items-center justify-center">
                <span class="material-symbols-outlined text-4xl text-red-400 mb-2">error</span>
                <p class="text-red-500 text-sm text-center">${message}</p>
            </div>
        `;
    }

    renderEmpty() {
        this.container.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-50 to-transparent dark:from-green-900/10 rounded-bl-full -z-0 opacity-50"></div>
            <div class="p-6 relative z-10 flex flex-col h-full">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-green-600 dark:text-green-500">account_balance_wallet</span>
                        Ví Khách Hàng
                    </h3>
                </div>
                <div class="flex-1 flex flex-col items-center justify-center text-slate-400">
                    <span class="material-symbols-outlined text-4xl mb-2">account_balance_wallet</span>
                    <p class="text-sm">Chưa có thông tin ví</p>
                </div>
            </div>
        `;
    }

    renderWallet(wallet) {
        // API returns 'balance' for real balance, not 'real_balance'
        const realBalance = parseFloat(wallet.balance) || parseFloat(wallet.real_balance) || 0;
        const virtualBalance = parseFloat(wallet.virtual_balance) || 0;
        const totalBalance = wallet.total_balance || (realBalance + virtualBalance);

        const canManageWallet = this.permissionHelper.hasPermission('customer-hub', 'manageWallet');

        this.container.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-50 to-transparent dark:from-green-900/10 rounded-bl-full -z-0 opacity-50"></div>
            <div class="p-6 relative z-10 flex flex-col h-full">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-green-600 dark:text-green-500">account_balance_wallet</span>
                        Ví Khách Hàng
                    </h3>
                    <button id="view-history-btn" class="text-xs text-primary font-medium hover:underline">Lịch sử</button>
                </div>
                <div class="flex-1 flex flex-col justify-center gap-4 py-2">
                    <!-- Số dư khả dụng (Tổng) - Hiển thị trước -->
                    <div>
                        <p class="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Số dư khả dụng</p>
                        <p class="text-4xl font-bold text-green-600 dark:text-green-500 tracking-tight tabular-nums">${this.formatCurrency(totalBalance)}</p>
                    </div>

                    <!-- Tiền nạp CK & Công nợ ảo -->
                    <div class="flex items-center gap-3 py-3 border-y border-dashed border-slate-200 dark:border-slate-700">
                        <div class="flex-1">
                            <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Tiền nạp CK</p>
                            <p class="text-xl font-semibold text-slate-700 dark:text-slate-300 tabular-nums">${this.formatCurrencyShort(realBalance)}</p>
                        </div>
                        <div class="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                        <div class="flex-1">
                            <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Công nợ ảo</p>
                            <p class="text-xl font-semibold text-amber-500 tabular-nums flex items-center gap-1">
                                <span class="material-symbols-outlined text-sm">token</span>
                                ${this.formatCurrencyShort(virtualBalance)}
                            </p>
                        </div>
                    </div>
                </div>

                ${canManageWallet ? `
                    <!-- Action Buttons -->
                    <div class="grid grid-cols-2 gap-2 mt-4">
                        <button id="deposit-btn" class="py-2 px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">add</span> Nạp tiền
                        </button>
                        <button id="withdraw-btn" class="py-2 px-3 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">remove</span> Rút tiền
                        </button>
                        <button id="issue-vc-btn" class="col-span-2 py-2 px-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800 text-xs font-bold transition-all flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">stars</span> Cấp công nợ ảo
                        </button>
                    </div>
                ` : ''}
            </div>
        `;

        // Setup button handlers (placeholder functionality)
        const viewHistoryBtn = this.container.querySelector('#view-history-btn');
        if (viewHistoryBtn) {
            viewHistoryBtn.onclick = () => this._showTransactionHistory();
        }

        if (canManageWallet) {
            const depositBtn = this.container.querySelector('#deposit-btn');
            const withdrawBtn = this.container.querySelector('#withdraw-btn');
            const issueVcBtn = this.container.querySelector('#issue-vc-btn');

            if (depositBtn) {
                depositBtn.onclick = () => this._showActionModal('deposit');
            }
            if (withdrawBtn) {
                withdrawBtn.onclick = () => this._showActionModal('withdraw');
            }
            if (issueVcBtn) {
                issueVcBtn.onclick = () => this._showActionModal('issue_vc');
            }
        }
    }

    _showActionModal(action) {
        const actionNames = {
            'deposit': 'Nạp tiền',
            'withdraw': 'Rút tiền',
            'issue_vc': 'Cấp tín dụng ảo'
        };
        alert(`Chức năng "${actionNames[action]}" đang được phát triển.`);
    }

    async _showTransactionHistory() {
        if (!this.customerPhone) {
            alert('Không có số điện thoại khách hàng.');
            return;
        }

        try {
            // Fetch transaction history from API
            const response = await fetch(`${apiService.RENDER_API_URL}/customer/${this.customerPhone}/transactions?limit=50`);
            if (!response.ok) {
                throw new Error('Không thể tải lịch sử giao dịch');
            }
            const result = await response.json();
            const transactions = result.data || [];

            // Create modal HTML
            const modalHTML = `
                <div id="transaction-history-modal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                        <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                            <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <span class="material-symbols-outlined text-green-600">history</span>
                                Lịch sử giao dịch ví
                            </h3>
                            <button id="close-history-modal" class="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                                <span class="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div class="flex-1 overflow-y-auto p-4">
                            ${transactions.length === 0 ? `
                                <div class="text-center py-8 text-slate-500">
                                    <span class="material-symbols-outlined text-4xl mb-2">receipt_long</span>
                                    <p>Chưa có giao dịch nào</p>
                                </div>
                            ` : `
                                <div class="space-y-3">
                                    ${transactions.map(tx => this._renderTransactionItem(tx)).join('')}
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            `;

            // Add modal to DOM
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            // Setup close handler
            const modal = document.getElementById('transaction-history-modal');
            const closeBtn = document.getElementById('close-history-modal');

            const closeModal = () => modal.remove();

            closeBtn.onclick = closeModal;
            modal.onclick = (e) => {
                if (e.target === modal) closeModal();
            };

        } catch (error) {
            console.error('Error loading transaction history:', error);
            alert(`Lỗi: ${error.message}`);
        }
    }

    _renderTransactionItem(tx) {
        const isCredit = tx.type === 'DEPOSIT' || tx.type === 'VIRTUAL_CREDIT';
        const colorClass = isCredit ? 'text-green-600' : 'text-red-600';
        const bgClass = isCredit ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20';
        const sign = isCredit ? '+' : '-';

        const typeLabels = {
            'DEPOSIT': 'Nạp tiền',
            'WITHDRAW': 'Rút tiền',
            'VIRTUAL_CREDIT': 'Cộng công nợ ảo',
            'VIRTUAL_DEBIT': 'Trừ công nợ ảo',
            'VIRTUAL_EXPIRE': 'Công nợ hết hạn'
        };

        const date = new Date(tx.created_at);
        const dateStr = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

        return `
            <div class="flex items-center gap-3 p-3 rounded-lg ${bgClass}">
                <div class="flex-1">
                    <p class="font-medium text-slate-800 dark:text-slate-200">${typeLabels[tx.type] || tx.type}</p>
                    <p class="text-xs text-slate-500">${tx.note || tx.source || ''}</p>
                    <p class="text-xs text-slate-400">${dateStr} ${timeStr}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold ${colorClass}">${sign}${this.formatCurrency(Math.abs(tx.amount))}</p>
                </div>
            </div>
        `;
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
    }

    formatCurrencyShort(amount) {
        if (amount >= 1000000) {
            return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(amount / 1000000) + 'M';
        } else if (amount >= 1000) {
            return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(amount / 1000) + 'K';
        }
        return new Intl.NumberFormat('vi-VN').format(amount || 0);
    }

    // =====================================================
    // SSE REALTIME SUBSCRIPTION
    // =====================================================

    /**
     * Subscribe to wallet updates via SSE
     */
    subscribeToRealtimeUpdates() {
        if (!this.customerPhone) return;

        // Close existing connection first
        this.closeSSE();

        // Use RENDER_SSE_URL (direct to Render.com) to bypass Cloudflare Worker proxy which doesn't support SSE
        const sseUrl = `${apiService.RENDER_SSE_URL}/realtime/sse?keys=wallet:${this.customerPhone}`;
        console.log(`[WalletPanel] Subscribing to SSE: ${sseUrl}`);

        try {
            this.eventSource = new EventSource(sseUrl);

            this.eventSource.onopen = () => {
                console.log(`[WalletPanel] SSE connected for wallet:${this.customerPhone}`);
            };

            // Listen for wallet_update events
            this.eventSource.addEventListener('wallet_update', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('[WalletPanel] Received wallet update:', data);

                    if (data.data && data.data.wallet) {
                        this.handleWalletUpdate(data.data);
                    }
                } catch (e) {
                    console.error('[WalletPanel] Error parsing SSE data:', e);
                }
            });

            // Listen for generic update events
            this.eventSource.addEventListener('update', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.event === 'wallet_update' && data.data && data.data.wallet) {
                        this.handleWalletUpdate(data.data);
                    }
                } catch (e) {
                    console.error('[WalletPanel] Error parsing SSE data:', e);
                }
            });

            this.eventSource.onerror = (error) => {
                console.warn('[WalletPanel] SSE error, will retry:', error);
                // EventSource auto-reconnects, no need to manually handle
            };

        } catch (error) {
            console.error('[WalletPanel] Failed to create SSE connection:', error);
        }
    }

    /**
     * Handle wallet update from SSE
     */
    handleWalletUpdate(data) {
        const { wallet, transaction } = data;

        // Update the panel with new wallet data
        if (wallet) {
            this.lastWalletData = wallet;
            this.renderWallet(wallet);

            // Show notification for deposit
            if (transaction && transaction.amount > 0) {
                this.showUpdateNotification(transaction);
            }
        }
    }

    /**
     * Show notification when wallet is updated
     */
    showUpdateNotification(transaction) {
        const { type, amount } = transaction;

        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-4 right-4 z-50 animate-pulse';
        notification.innerHTML = `
            <div class="bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
                <span class="material-symbols-outlined">account_balance_wallet</span>
                <div>
                    <p class="font-bold">${type === 'DEPOSIT' ? 'Nạp tiền thành công!' : 'Cập nhật ví'}</p>
                    <p class="text-sm">+${this.formatCurrency(amount)}</p>
                </div>
            </div>
        `;

        document.body.appendChild(notification);

        // Remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    /**
     * Close SSE connection
     */
    closeSSE() {
        if (this.eventSource) {
            console.log(`[WalletPanel] Closing SSE connection for wallet:${this.customerPhone}`);
            this.eventSource.close();
            this.eventSource = null;
        }
    }

    /**
     * Cleanup when module is destroyed
     */
    destroy() {
        this.closeSSE();
        this.customerPhone = null;
        this.lastWalletData = null;
    }
}
