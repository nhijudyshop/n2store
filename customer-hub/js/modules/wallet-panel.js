// customer-hub/js/modules/wallet-panel.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class WalletPanelModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.customerPhone = null;
    }

    async render(phone) {
        this.customerPhone = phone;
        if (!this.permissionHelper.hasPermission('customer-hub', 'viewWallet')) {
            this.container.innerHTML = `<p class="text-red-500">Bạn không có quyền xem thông tin ví.</p>`;
            return;
        }

        this.container.innerHTML = `
            <div class="bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft p-6 mb-6">
                <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Thông tin Ví</h3>
                <div id="wallet-details-content">Đang tải thông tin ví...</div>
            </div>
        `;
        await this.loadWalletDetails();
    }

    async loadWalletDetails() {
        if (!this.customerPhone) {
            this.container.querySelector('#wallet-details-content').innerHTML = `<p class="text-yellow-500">Không có số điện thoại khách hàng.</p>`;
            return;
        }
        try {
            const wallet = await apiService.getWallet(this.customerPhone);
            if (wallet) {
                this.renderWallet(wallet);
            } else {
                this.container.querySelector('#wallet-details-content').innerHTML = `<p class="text-gray-500 dark:text-gray-400">Không tìm thấy ví cho khách hàng này.</p>`;
            }
        } catch (error) {
            this.container.querySelector('#wallet-details-content').innerHTML = `<p class="text-red-500">Lỗi khi tải thông tin ví: ${error.message}</p>`;
            console.error('Error loading wallet details:', error);
        }
    }

    renderWallet(wallet) {
        let virtualCreditsHtml = '';
        if (wallet.virtual_credits && wallet.virtual_credits.length > 0) {
            virtualCreditsHtml = `
                <h4 class="font-semibold mt-4 mb-2">Tín dụng ảo:</h4>
                <ul class="list-disc list-inside text-gray-700 dark:text-gray-300">
                    ${wallet.virtual_credits.map(credit => `
                        <li>${this.formatCurrency(credit.amount)} từ ${credit.source_type} (hết hạn ${new Date(credit.expires_at).toLocaleDateString()})</li>
                    `).join('')}
                </ul>
            `;
        }

        this.container.querySelector('#wallet-details-content').innerHTML = `
            <p class="text-gray-700 dark:text-gray-300">Số dư thực: <span class="font-bold text-green-600">${this.formatCurrency(wallet.real_balance)}</span></p>
            <p class="text-gray-700 dark:text-gray-300">Số dư ảo: <span class="font-bold text-blue-600">${this.formatCurrency(wallet.virtual_balance)}</span></p>
            <p class="text-gray-700 dark:text-gray-300">Tổng số dư: <span class="font-bold text-purple-600">${this.formatCurrency(wallet.total_balance)}</span></p>
            ${virtualCreditsHtml}
            <!-- Add deposit/withdraw/issue virtual credit buttons here -->
        `;
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    }
}
