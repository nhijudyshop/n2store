// customer-hub/js/modules/link-bank-transaction.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class LinkBankTransactionModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.currentPage = 1;
        this.limit = 10; // Number of transactions per page
        this.initUI();
    }

    initUI() {
        if (!this.permissionHelper.hasPermission('customer-hub', 'linkTransactions')) {
            this.container.innerHTML = `<p class="text-red-500">Bạn không có quyền truy cập chức năng liên kết giao dịch ngân hàng.</p>`;
            return;
        }

        this.container.innerHTML = `
            <div class="bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft p-6 mb-6">
                <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Liên kết giao dịch ngân hàng</h2>
                <div id="unlinked-transactions-list" class="overflow-x-auto">
                    <p class="text-gray-500 dark:text-gray-400">Đang tải danh sách giao dịch chưa liên kết...</p>
                </div>
                <div class="flex justify-between items-center mt-4">
                    <button id="prev-page-btn" class="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-md shadow-soft transition-colors duration-200" disabled>Trước</button>
                    <span id="page-info" class="text-gray-700 dark:text-gray-300">Trang 1</span>
                    <button id="next-page-btn" class="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-md shadow-soft transition-colors duration-200" disabled>Tiếp</button>
                </div>
            </div>

            <!-- Link Transaction Modal -->
            <div id="link-transaction-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center hidden">
                <div class="bg-surface-light dark:bg-surface-dark p-6 rounded-lg shadow-lg w-full max-w-md mx-auto">
                    <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Liên kết giao dịch ngân hàng</h3>
                    <div id="modal-transaction-details" class="mb-4 text-gray-700 dark:text-gray-300">
                        <!-- Transaction details will be injected here -->
                    </div>
                    <div class="mb-4">
                        <label for="customer-phone-input" class="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Số điện thoại khách hàng:</label>
                        <input type="tel" id="customer-phone-input" class="w-full p-2 border border-border-light dark:border-border-dark rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary" placeholder="Nhập số điện thoại...">
                    </div>
                    <div class="mb-4 flex items-center">
                        <input type="checkbox" id="auto-deposit-checkbox" class="mr-2 h-4 w-4 text-primary rounded border-gray-300 focus:ring-primary">
                        <label for="auto-deposit-checkbox" class="text-gray-700 dark:text-gray-300 text-sm">Tự động nạp vào ví khách hàng</label>
                    </div>
                    <div class="flex justify-end space-x-2">
                        <button id="cancel-link-btn" class="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md transition-colors duration-200">Hủy</button>
                        <button id="confirm-link-btn" class="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-md transition-colors duration-200">Liên kết</button>
                    </div>
                </div>
            </div>
        `;

        this.unlinkedTransactionsList = this.container.querySelector('#unlinked-transactions-list');
        this.prevPageBtn = this.container.querySelector('#prev-page-btn');
        this.nextPageBtn = this.container.querySelector('#next-page-btn');
        this.pageInfoSpan = this.container.querySelector('#page-info');

        this.modal = this.container.querySelector('#link-transaction-modal');
        this.modalTransactionDetails = this.container.querySelector('#modal-transaction-details');
        this.customerPhoneInput = this.container.querySelector('#customer-phone-input');
        this.autoDepositCheckbox = this.container.querySelector('#auto-deposit-checkbox');
        this.cancelLinkBtn = this.container.querySelector('#cancel-link-btn');
        this.confirmLinkBtn = this.container.querySelector('#confirm-link-btn');

        this.prevPageBtn.addEventListener('click', () => this.changePage(-1));
        this.nextPageBtn.addEventListener('click', () => this.changePage(1));
        this.cancelLinkBtn.addEventListener('click', () => this.hideModal());
        this.confirmLinkBtn.addEventListener('click', () => this.confirmLinkTransaction());

        this.loadUnlinkedTransactions();
    }

    async loadUnlinkedTransactions() {
        this.unlinkedTransactionsList.innerHTML = `<p class="text-blue-500 dark:text-blue-400">Đang tải danh sách giao dịch...</p>`;
        try {
            const response = await apiService.getUnlinkedBankTransactions(this.currentPage, this.limit);
            if (response.success && response.data.data && response.data.data.length > 0) {
                this.renderTransactions(response.data.data, response.data.pagination.total);
            } else {
                this.unlinkedTransactionsList.innerHTML = `<p class="text-gray-500 dark:text-gray-400">Không có giao dịch ngân hàng nào chưa liên kết.</p>`;
                this.prevPageBtn.disabled = true;
                this.nextPageBtn.disabled = true;
            }
        } catch (error) {
            this.unlinkedTransactionsList.innerHTML = `<p class="text-red-500">Lỗi khi tải giao dịch: ${error.message}</p>`;
            console.error('Error loading unlinked transactions:', error);
            this.prevPageBtn.disabled = true;
            this.nextPageBtn.disabled = true;
        }
    }

    renderTransactions(transactions, total) {
        let tableHtml = `
            <table class="min-w-full bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft">
                <thead>
                    <tr class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase text-sm leading-normal">
                        <th class="py-3 px-6 text-left">ID Giao dịch</th>
                        <th class="py-3 px-6 text-left">Mô tả</th>
                        <th class="py-3 px-6 text-right">Số tiền</th>
                        <th class="py-3 px-6 text-left">Thời gian</th>
                        <th class="py-3 px-6 text-center">Hành động</th>
                    </tr>
                </thead>
                <tbody class="text-gray-600 dark:text-gray-400 text-sm font-light">
        `;

        transactions.forEach(tx => {
            tableHtml += `
                <tr class="border-b border-border-light dark:border-border-dark hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200">
                    <td class="py-3 px-6 text-left font-mono">${tx.id}</td>
                    <td class="py-3 px-6 text-left">${tx.description || 'N/A'}</td>
                    <td class="py-3 px-6 text-right font-mono">${this.formatCurrency(tx.amount)}</td>
                    <td class="py-3 px-6 text-left whitespace-nowrap">${new Date(tx.transaction_date).toLocaleString()}</td>
                    <td class="py-3 px-6 text-center">
                        <button data-transaction-id="${tx.id}" data-transaction-amount="${tx.amount}" data-transaction-desc="${tx.description}"
                                class="link-transaction-btn bg-primary hover:bg-primary-hover text-white px-3 py-1 rounded-md text-sm transition-colors duration-200">
                            <span class="material-symbols-outlined align-middle text-base">link</span> Liên kết
                        </button>
                    </td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
        `;
        this.unlinkedTransactionsList.innerHTML = tableHtml;

        this.container.querySelectorAll('.link-transaction-btn').forEach(button => {
            button.addEventListener('click', (e) => this.showModal(e.currentTarget.dataset));
        });

        // Update pagination controls
        const totalPages = Math.ceil(total / this.limit);
        this.pageInfoSpan.textContent = `Trang ${this.currentPage} / ${totalPages}`;
        this.prevPageBtn.disabled = this.currentPage === 1;
        this.nextPageBtn.disabled = this.currentPage === totalPages;
    }

    changePage(delta) {
        this.currentPage += delta;
        this.loadUnlinkedTransactions();
    }

    showModal(transactionData) {
        this.currentTransaction = transactionData;
        this.modalTransactionDetails.innerHTML = `
            <p><strong>ID:</strong> <span class="font-mono">${transactionData.transactionId}</span></p>
            <p><strong>Số tiền:</strong> <span class="font-bold text-primary">${this.formatCurrency(transactionData.transactionAmount)}</span></p>
            <p><strong>Mô tả:</strong> ${transactionData.transactionDesc || 'Không có'}</p>
        `;
        this.customerPhoneInput.value = ''; // Clear previous input
        this.autoDepositCheckbox.checked = true; // Default to checked
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
        this.confirmLinkBtn.textContent = 'Đang liên kết...';

        try {
            const response = await apiService.linkBankTransaction(
                parseInt(this.currentTransaction.transactionId),
                phone,
                autoDeposit
            );

            if (response.success) {
                alert('Liên kết giao dịch thành công!');
                this.hideModal();
                this.loadUnlinkedTransactions(); // Refresh the list
            } else {
                alert('Lỗi khi liên kết giao dịch: ' + response.error);
            }
        } catch (error) {
            alert('Lỗi khi liên kết giao dịch: ' + error.message);
            console.error('Error linking transaction:', error);
        } finally {
            this.confirmLinkBtn.disabled = false;
            this.confirmLinkBtn.textContent = 'Liên kết';
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    }
}
