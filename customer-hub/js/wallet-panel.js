/**
 * Wallet Panel - Handles wallet operations in customer detail page
 */

const WalletPanel = {
    // State
    phone: null,
    wallet: null,
    transactions: [],
    virtualCredits: [],

    /**
     * Load wallet data
     */
    async load(phone) {
        this.phone = phone;

        try {
            const result = await CustomerService.getWallet(phone);
            this.wallet = result.wallet || result;
            this.virtualCredits = result.virtual_credits || [];

            this.render();
            await this.loadTransactions();
            this.bindEvents();

        } catch (error) {
            console.error('Error loading wallet:', error);
            this.renderError();
        }
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Deposit button
        const depositBtn = document.getElementById('depositBtn');
        if (depositBtn) {
            depositBtn.onclick = () => this.showDepositModal();
        }

        // Withdraw button
        const withdrawBtn = document.getElementById('withdrawBtn');
        if (withdrawBtn) {
            withdrawBtn.onclick = () => this.showWithdrawModal();
        }

        // Add credit button
        const addCreditBtn = document.getElementById('addCreditBtn');
        if (addCreditBtn) {
            addCreditBtn.onclick = () => this.showCreditModal();
        }

        // Deposit form
        const depositForm = document.getElementById('depositForm');
        if (depositForm) {
            depositForm.onsubmit = (e) => this.handleDeposit(e);
        }

        // Withdraw form
        const withdrawForm = document.getElementById('withdrawForm');
        if (withdrawForm) {
            withdrawForm.onsubmit = (e) => this.handleWithdraw(e);
        }

        // Credit form
        const creditForm = document.getElementById('creditForm');
        if (creditForm) {
            creditForm.onsubmit = (e) => this.handleAddCredit(e);
        }

        // Close modal buttons
        this.bindModalCloseEvents();
    },

    /**
     * Bind modal close events
     */
    bindModalCloseEvents() {
        const modals = ['depositModal', 'withdrawModal', 'creditModal'];

        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            const closeBtn = document.getElementById(`close${modalId.charAt(0).toUpperCase() + modalId.slice(1)}Btn`);

            if (closeBtn) {
                closeBtn.onclick = () => this.hideModal(modalId);
            }

            if (modal) {
                modal.onclick = (e) => {
                    if (e.target === modal) this.hideModal(modalId);
                };
            }
        });
    },

    /**
     * Render wallet panel
     */
    render() {
        const w = this.wallet;
        if (!w) return;

        // Total balance
        const totalBalance = (w.real_balance || 0) + (w.virtual_balance || 0);
        document.getElementById('walletBalance').textContent = Utils.formatCurrency(totalBalance);
        document.getElementById('realBalance').textContent = Utils.formatCurrency(w.real_balance || 0);
        document.getElementById('virtualBalance').textContent = Utils.formatCurrency(w.virtual_balance || 0);

        // Update quick stats
        const statWalletBalance = document.getElementById('statWalletBalance');
        if (statWalletBalance) {
            statWalletBalance.textContent = Utils.formatCurrency(totalBalance);
        }

        // Available balance for withdraw
        const availableBalance = document.getElementById('availableBalance');
        if (availableBalance) {
            availableBalance.textContent = Utils.formatCurrency(totalBalance);
        }

        // Render virtual credits
        this.renderVirtualCredits();
    },

    /**
     * Render virtual credits
     */
    renderVirtualCredits() {
        const container = document.getElementById('virtualCreditsList');
        if (!container) return;

        if (!this.virtualCredits.length) {
            container.innerHTML = `
                <div class="empty-state-small">
                    <i data-lucide="inbox"></i>
                    <p>Chưa có công nợ ảo</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        container.innerHTML = this.virtualCredits.map(credit => `
            <div class="virtual-credit-item ${credit.status === 'expired' ? 'expired' : ''}">
                <div class="credit-info">
                    <span class="credit-amount">${Utils.formatCurrency(credit.remaining_amount)}</span>
                    <span class="credit-reason">${credit.reason || 'Công nợ ảo'}</span>
                </div>
                <div class="credit-meta">
                    <span class="credit-date">
                        <i data-lucide="calendar"></i>
                        ${credit.expires_at ? 'HSD: ' + Utils.formatDate(credit.expires_at) : 'Không HSD'}
                    </span>
                    <span class="credit-status ${credit.status}">${credit.status}</span>
                </div>
            </div>
        `).join('');

        lucide.createIcons();
    },

    /**
     * Load transactions
     */
    async loadTransactions() {
        try {
            const result = await CustomerService.getTransactions(this.phone);
            this.transactions = result.transactions || result.data || [];
            this.renderTransactions();
        } catch (error) {
            console.error('Error loading transactions:', error);
        }
    },

    /**
     * Render transactions
     */
    renderTransactions() {
        const container = document.getElementById('transactionList');
        if (!container) return;

        if (!this.transactions.length) {
            container.innerHTML = `
                <div class="empty-state-small">
                    <i data-lucide="receipt"></i>
                    <p>Chưa có giao dịch nào</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        container.innerHTML = this.transactions.map(tx => {
            const typeConfig = CONFIG.TRANSACTION_TYPES[tx.transaction_type] || {
                color: '#6b7280',
                icon: 'circle',
                label: tx.transaction_type
            };

            const isPositive = ['deposit', 'refund', 'virtual_credit'].includes(tx.transaction_type);
            const amountClass = isPositive ? 'text-success' : 'text-danger';
            const amountPrefix = isPositive ? '+' : '-';

            return `
                <div class="transaction-item">
                    <div class="transaction-icon" style="background: ${typeConfig.color}20; color: ${typeConfig.color};">
                        <i data-lucide="${typeConfig.icon}"></i>
                    </div>
                    <div class="transaction-info">
                        <span class="transaction-type">${typeConfig.label}</span>
                        <span class="transaction-note">${tx.note || '-'}</span>
                        <span class="transaction-time">${Utils.formatRelativeTime(tx.created_at)}</span>
                    </div>
                    <div class="transaction-amount ${amountClass}">
                        ${amountPrefix}${Utils.formatCurrency(tx.amount)}
                    </div>
                </div>
            `;
        }).join('');

        lucide.createIcons();
    },

    /**
     * Render error state
     */
    renderError() {
        document.getElementById('walletBalance').textContent = '-';
        document.getElementById('realBalance').textContent = '-';
        document.getElementById('virtualBalance').textContent = '-';
    },

    /**
     * Show deposit modal
     */
    showDepositModal() {
        const modal = document.getElementById('depositModal');
        const form = document.getElementById('depositForm');
        if (form) form.reset();
        if (modal) modal.classList.add('show');
        lucide.createIcons();
    },

    /**
     * Show withdraw modal
     */
    showWithdrawModal() {
        const modal = document.getElementById('withdrawModal');
        const form = document.getElementById('withdrawForm');
        const availableBalance = document.getElementById('availableBalance');

        if (form) form.reset();

        // Update available balance
        if (this.wallet && availableBalance) {
            const total = (this.wallet.real_balance || 0) + (this.wallet.virtual_balance || 0);
            availableBalance.textContent = Utils.formatCurrency(total);
        }

        if (modal) modal.classList.add('show');
        lucide.createIcons();
    },

    /**
     * Show credit modal
     */
    showCreditModal() {
        const modal = document.getElementById('creditModal');
        const form = document.getElementById('creditForm');
        if (form) form.reset();
        if (modal) modal.classList.add('show');
        lucide.createIcons();
    },

    /**
     * Hide modal
     */
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('show');
    },

    /**
     * Handle deposit form submit
     */
    async handleDeposit(e) {
        e.preventDefault();

        const amount = Utils.parseAmount(document.getElementById('depositAmount').value);
        const note = document.getElementById('depositNote').value.trim();
        const reference = document.getElementById('depositReference').value.trim();

        if (amount <= 0) {
            Utils.showToast('Vui lòng nhập số tiền hợp lệ', 'warning');
            return;
        }

        try {
            await CustomerService.deposit(this.phone, amount, note, reference);
            Utils.showToast('Nạp tiền thành công!', 'success');
            this.hideModal('depositModal');
            await this.load(this.phone);
        } catch (error) {
            Utils.showToast('Lỗi nạp tiền: ' + error.message, 'error');
        }
    },

    /**
     * Handle withdraw form submit
     */
    async handleWithdraw(e) {
        e.preventDefault();

        const amount = Utils.parseAmount(document.getElementById('withdrawAmount').value);
        const note = document.getElementById('withdrawNote').value.trim();

        if (amount <= 0) {
            Utils.showToast('Vui lòng nhập số tiền hợp lệ', 'warning');
            return;
        }

        const totalBalance = (this.wallet?.real_balance || 0) + (this.wallet?.virtual_balance || 0);
        if (amount > totalBalance) {
            Utils.showToast('Số tiền vượt quá số dư khả dụng', 'warning');
            return;
        }

        if (!note) {
            Utils.showToast('Vui lòng nhập lý do trừ tiền', 'warning');
            return;
        }

        try {
            await CustomerService.withdraw(this.phone, amount, note);
            Utils.showToast('Trừ tiền thành công!', 'success');
            this.hideModal('withdrawModal');
            await this.load(this.phone);
        } catch (error) {
            Utils.showToast('Lỗi trừ tiền: ' + error.message, 'error');
        }
    },

    /**
     * Handle add credit form submit
     */
    async handleAddCredit(e) {
        e.preventDefault();

        const amount = Utils.parseAmount(document.getElementById('creditAmount').value);
        const reason = document.getElementById('creditReason').value.trim();
        const expiryInput = document.getElementById('creditExpiry').value;
        const expiresAt = expiryInput ? new Date(expiryInput).toISOString() : null;

        if (amount <= 0) {
            Utils.showToast('Vui lòng nhập số tiền hợp lệ', 'warning');
            return;
        }

        if (!reason) {
            Utils.showToast('Vui lòng nhập lý do', 'warning');
            return;
        }

        try {
            await CustomerService.addVirtualCredit(this.phone, amount, reason, expiresAt);
            Utils.showToast('Thêm công nợ ảo thành công!', 'success');
            this.hideModal('creditModal');
            await this.load(this.phone);
        } catch (error) {
            Utils.showToast('Lỗi thêm công nợ ảo: ' + error.message, 'error');
        }
    }
};

// Export
window.WalletPanel = WalletPanel;
