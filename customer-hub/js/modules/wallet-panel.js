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

                    <!-- Tiền thật & Công nợ ảo -->
                    <div class="flex items-center gap-3 py-3 border-y border-dashed border-slate-200 dark:border-slate-700">
                        <div class="flex-1">
                            <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Tiền thật</p>
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
        const actionConfig = {
            'deposit': {
                title: 'Nạp tiền vào ví',
                icon: 'add',
                color: 'green',
                placeholder: 'Nhập số tiền cần nạp',
                buttonText: 'Nạp tiền',
                showExpiryDays: false
            },
            'withdraw': {
                title: 'Rút tiền từ ví',
                icon: 'remove',
                color: 'red',
                placeholder: 'Nhập số tiền cần rút',
                buttonText: 'Rút tiền',
                showExpiryDays: false
            },
            'issue_vc': {
                title: 'Cấp công nợ ảo',
                icon: 'stars',
                color: 'amber',
                placeholder: 'Nhập số tiền công nợ ảo',
                buttonText: 'Cấp công nợ',
                showExpiryDays: true
            }
        };

        const config = actionConfig[action];
        if (!config) return;

        const modalHTML = `
            <div id="wallet-action-modal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <span class="material-symbols-outlined text-${config.color}-600">${config.icon}</span>
                            ${config.title}
                        </h3>
                        <button id="close-action-modal" class="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <div class="p-6">
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Số tiền (VNĐ)</label>
                            <input type="number" id="wallet-action-amount"
                                class="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-${config.color}-500 focus:border-${config.color}-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-lg"
                                placeholder="${config.placeholder}"
                                min="1000" step="1000">
                        </div>
                        ${config.showExpiryDays ? `
                            <div class="mb-4">
                                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Số ngày hiệu lực</label>
                                <input type="number" id="wallet-action-expiry"
                                    class="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                    value="15" min="1" max="365">
                            </div>
                        ` : ''}
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Ghi chú (tùy chọn)</label>
                            <textarea id="wallet-action-note" rows="2"
                                class="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-${config.color}-500 focus:border-${config.color}-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                placeholder="Nhập ghi chú..."></textarea>
                        </div>
                        <div id="wallet-action-error" class="hidden mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm"></div>
                        <button id="wallet-action-submit"
                            class="w-full py-3 px-4 bg-${config.color}-600 hover:bg-${config.color}-700 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined">${config.icon}</span>
                            ${config.buttonText}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('wallet-action-modal');
        const closeBtn = document.getElementById('close-action-modal');
        const submitBtn = document.getElementById('wallet-action-submit');
        const amountInput = document.getElementById('wallet-action-amount');
        const noteInput = document.getElementById('wallet-action-note');
        const errorDiv = document.getElementById('wallet-action-error');
        const expiryInput = document.getElementById('wallet-action-expiry');

        const closeModal = () => modal.remove();

        closeBtn.onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        submitBtn.onclick = async () => {
            const amount = parseFloat(amountInput.value);
            const note = noteInput.value.trim();
            const expiryDays = expiryInput ? parseInt(expiryInput.value) || 15 : 15;

            if (!amount || amount < 1000) {
                errorDiv.textContent = 'Số tiền phải lớn hơn 1,000 VNĐ';
                errorDiv.classList.remove('hidden');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="animate-spin material-symbols-outlined">sync</span> Đang xử lý...';
            errorDiv.classList.add('hidden');

            try {
                let result;
                if (action === 'deposit') {
                    result = await this._handleDeposit(amount, note);
                } else if (action === 'withdraw') {
                    result = await this._handleWithdraw(amount, note);
                } else if (action === 'issue_vc') {
                    result = await this._handleIssueVirtualCredit(amount, expiryDays, note);
                }

                if (result && result.success) {
                    closeModal();
                    // Refresh wallet panel
                    await this.loadWalletDetails();
                } else {
                    throw new Error(result?.error || 'Có lỗi xảy ra');
                }
            } catch (error) {
                errorDiv.textContent = error.message;
                errorDiv.classList.remove('hidden');
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span class="material-symbols-outlined">${config.icon}</span> ${config.buttonText}`;
            }
        };

        // Focus on amount input
        amountInput.focus();
    }

    async _handleDeposit(amount, note) {
        const response = await fetch(`${apiService.RENDER_API_URL}/wallets/${this.customerPhone}/deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount,
                source: 'MANUAL_ADJUSTMENT',
                note: note || 'Nạp tiền thủ công từ Customer 360',
                created_by: this._getCurrentUserEmail()
            })
        });
        return await response.json();
    }

    async _handleWithdraw(amount, note) {
        const response = await fetch(`${apiService.RENDER_API_URL}/wallets/${this.customerPhone}/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount,
                note: note || 'Rút tiền từ Customer 360'
            })
        });
        return await response.json();
    }

    async _handleIssueVirtualCredit(amount, expiryDays, note) {
        const response = await fetch(`${apiService.RENDER_API_URL}/wallets/${this.customerPhone}/credit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount,
                expiry_days: expiryDays,
                source_type: 'ADMIN_ISSUE',
                note: note || `Cấp công nợ ảo từ Customer 360 (${expiryDays} ngày)`,
                created_by: this._getCurrentUserEmail()
            })
        });
        return await response.json();
    }

    _getCurrentUserEmail() {
        try {
            const user = JSON.parse(localStorage.getItem('n2shop_current_user') || '{}');
            return user.email || user.displayName || 'admin';
        } catch {
            return 'admin';
        }
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

        // Format datetime same as _getTimeAgo in customer-profile.js
        const dateTimeStr = this._formatDateTime(tx.created_at);

        return `
            <div class="flex items-center gap-3 p-3 rounded-lg ${bgClass}">
                <div class="flex-1">
                    <p class="font-medium text-slate-800 dark:text-slate-200">${typeLabels[tx.type] || tx.type}</p>
                    <p class="text-xs text-slate-500">${tx.note || tx.source || ''}</p>
                    <p class="text-xs text-slate-400">${dateTimeStr}</p>
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

    /**
     * Format datetime same as formatTimestamp in transaction-activity.js
     * Uses toLocaleString for consistent formatting
     */
    _formatDateTime(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
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
        // Route is /api/realtime/sse (note: /api prefix required)
        const sseUrl = `${apiService.RENDER_SSE_URL}/api/realtime/sse?keys=wallet:${this.customerPhone}`;
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
