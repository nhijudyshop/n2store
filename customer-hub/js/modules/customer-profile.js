// customer-hub/js/modules/customer-profile.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';
import { WalletPanelModule } from './wallet-panel.js';
import { TicketListModule } from './ticket-list.js';

export class CustomerProfileModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.customerPhone = null; // Will be set when rendering a specific customer
        this.walletPanelModule = new WalletPanelModule('customer-wallet-panel', permissionHelper);
        this.ticketListModule = new TicketListModule('customer-ticket-list', permissionHelper);
        this.initUI();
    }

    initUI() {
        this.container.innerHTML = `
            <div id="customer-profile-content">
                <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Thông tin khách hàng 360°</h2>
                <div id="customer-profile-loader" class="text-center py-8">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p class="text-gray-500 dark:text-gray-400">Đang tải thông tin khách hàng...</p>
                </div>
                <div id="customer-profile-data" class="hidden">
                    <!-- Customer Info Card -->
                    <div class="bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft p-6 mb-6">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-100">Thông tin khách hàng</h3>
                            ${this.permissionHelper.hasPermission('customer-hub', 'editCustomer') ? `
                                <button id="edit-customer-btn" class="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-md text-sm transition-colors duration-200">
                                    <span class="material-symbols-outlined align-middle text-base">edit</span> Sửa
                                </button>
                            ` : ''}
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-700 dark:text-gray-300">
                            <div><strong>SĐT:</strong> <span id="profile-phone" class="font-mono"></span></div>
                            <div><strong>Tên:</strong> <span id="profile-name"></span></div>
                            <div><strong>Email:</strong> <span id="profile-email"></span></div>
                            <div><strong>Địa chỉ:</strong> <span id="profile-address"></span></div>
                            <div><strong>Trạng thái:</strong> <span id="profile-status"></span></div>
                            <div><strong>Cấp bậc:</strong> <span id="profile-tier"></span></div>
                            <div class="md:col-span-2"><strong>Tags:</strong> <span id="profile-tags"></span></div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <!-- Wallet Balance Panel -->
                        <div id="customer-wallet-panel"></div>

                        <!-- RFM Score Panel (Placeholder) -->
                        <div class="bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft p-6">
                            <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">RFM Score</h3>
                            <p class="text-gray-500 dark:text-gray-400">Chức năng RFM Score đang được phát triển.</p>
                            <!-- Chart placeholder -->
                            <div class="h-48 bg-gray-100 dark:bg-gray-700 rounded-md flex items-center justify-center">
                                <span class="material-symbols-outlined text-gray-400 text-4xl">trending_up</span>
                            </div>
                        </div>
                    </div>

                    <!-- Recent Tickets Panel -->
                    <div id="customer-ticket-list"></div>

                    <!-- Activity Timeline Panel -->
                    <div class="bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft p-6 mb-6">
                        <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Dòng thời gian hoạt động (${this.permissionHelper.hasPermission('customer-hub', 'viewActivities') ? '' : 'Không có quyền xem'})</h3>
                        <div id="activity-timeline">
                            <p class="text-gray-500 dark:text-gray-400">Chưa có hoạt động nào.</p>
                        </div>
                    </div>

                    <!-- Notes Panel -->
                    <div class="bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft p-6 mb-6">
                        <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Ghi chú khách hàng (${this.permissionHelper.hasPermission('customer-hub', 'addNote') ? '' : 'Không có quyền thêm'})</h3>
                        <div id="customer-notes">
                            <p class="text-gray-500 dark:text-gray-400">Chưa có ghi chú nào.</p>
                            ${this.permissionHelper.hasPermission('customer-hub', 'addNote') ? `
                                <div class="mt-4">
                                    <textarea id="new-note-content" class="w-full p-2 border border-border-light dark:border-border-dark rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm" rows="3" placeholder="Thêm ghi chú mới..."></textarea>
                                    <button id="add-note-btn" class="mt-2 bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-md text-sm transition-colors duration-200">
                                        Thêm ghi chú
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.loader = this.container.querySelector('#customer-profile-loader');
        this.profileDataContainer = this.container.querySelector('#customer-profile-data');
    }

    async render(phone) {
        this.customerPhone = phone;
        this.loader.classList.remove('hidden');
        this.profileDataContainer.classList.add('hidden');

        try {
            const response = await apiService.getCustomer360(phone);
            if (response.success && response.data) {
                this._displayCustomerInfo(response.data.customer);
                this.walletPanelModule.render(phone);
                this.ticketListModule.render(phone);
                // Render other sections as needed
                this.profileDataContainer.classList.remove('hidden');
            } else {
                this.container.innerHTML = `<p class="text-red-500 text-center py-8">Không tìm thấy thông tin khách hàng cho SĐT: ${phone}</p>`;
            }
        } catch (error) {
            this.container.innerHTML = `<p class="text-red-500 text-center py-8">Lỗi khi tải thông tin khách hàng: ${error.message}</p>`;
            console.error('Customer profile load error:', error);
        } finally {
            this.loader.classList.add('hidden');
        }
    }

    _displayCustomerInfo(customerData) {
        // Customer Info
        this.container.querySelector('#profile-phone').textContent = customerData.phone;
        this.container.querySelector('#profile-name').textContent = customerData.name || 'N/A';
        this.container.querySelector('#profile-email').textContent = customerData.email || 'N/A';
        this.container.querySelector('#profile-address').textContent = customerData.address || 'N/A';
        this.container.querySelector('#profile-status').textContent = customerData.status || 'Bình thường';
        this.container.querySelector('#profile-tier').textContent = customerData.tier || 'New';
        this.container.querySelector('#profile-tags').textContent = customerData.tags && customerData.tags.length > 0 ? customerData.tags.join(', ') : 'Không có';

        // Customer Notes (only if has permission)
        const customerNotes = this.container.querySelector('#customer-notes');
        const newNoteContent = this.container.querySelector('#new-note-content');
        const addNoteBtn = this.container.querySelector('#add-note-btn');

        if (this.permissionHelper.hasPermission('customer-hub', 'addNote')) {
            if (addNoteBtn) addNoteBtn.onclick = () => this.addCustomerNote(newNoteContent.value);
        }

        this.renderNotes(customerData.notes);
    }
    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    }
}
