// customer-hub/js/modules/customer-profile.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class CustomerProfileModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.customerPhone = null; // Will be set when rendering a specific customer
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
                        <div class="bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft p-6">
                            <div class="flex items-center justify-between mb-4">
                                <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-100">Ví tiền</h3>
                                ${this.permissionHelper.hasPermission('customer-hub', 'manageWallet') ? `
                                    <div class="flex space-x-2">
                                        <button id="deposit-btn" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-md text-sm transition-colors duration-200">
                                            <span class="material-symbols-outlined align-middle text-base">add</span> Nạp
                                        </button>
                                        <button id="withdraw-btn" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md text-sm transition-colors duration-200">
                                            <span class="material-symbols-outlined align-middle text-base">remove</span> Rút
                                        </button>
                                        <button id="issue-vc-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-sm transition-colors duration-200">
                                            <span class="material-symbols-outlined align-middle text-base">credit_card</span> Cấp ảo
                                        </button>
                                    </div>
                                ` : ''}
                            </div>
                            <div class="grid grid-cols-2 gap-4 text-gray-700 dark:text-gray-300">
                                <div><strong>Số dư thực:</strong> <span id="wallet-balance" class="text-primary font-bold"></span></div>
                                <div><strong>Số dư ảo:</strong> <span id="wallet-virtual-balance" class="text-info font-bold"></span></div>
                                <div class="col-span-2"><strong>Tổng số dư:</strong> <span id="wallet-total" class="text-success font-bold"></span></div>
                            </div>
                            <div class="mt-4">
                                <h4 class="font-semibold text-gray-700 dark:text-gray-200 mb-2">Công nợ ảo đang hoạt động:</h4>
                                <ul id="virtual-credits-list" class="list-disc list-inside text-gray-600 dark:text-gray-400">
                                    <!-- Virtual credits will be loaded here -->
                                </ul>
                            </div>
                        </div>

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
                    <div class="bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft p-6 mb-6">
                        <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Sự vụ gần đây (${this.permissionHelper.hasPermission('customer-hub', 'viewTickets') ? '' : 'Không có quyền xem'})</h3>
                        <div id="recent-tickets-list">
                            <p class="text-gray-500 dark:text-gray-400">Chưa có sự vụ nào.</p>
                        </div>
                    </div>

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
                this.displayCustomerData(response.data);
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

    displayCustomerData(data) {
        // Customer Info
        this.container.querySelector('#profile-phone').textContent = data.customer.phone;
        this.container.querySelector('#profile-name').textContent = data.customer.name || 'N/A';
        this.container.querySelector('#profile-email').textContent = data.customer.email || 'N/A';
        this.container.querySelector('#profile-address').textContent = data.customer.address || 'N/A';
        this.container.querySelector('#profile-status').textContent = data.customer.status || 'Bình thường';
        this.container.querySelector('#profile-tier').textContent = data.customer.tier || 'New';
        this.container.querySelector('#profile-tags').textContent = data.customer.tags && data.customer.tags.length > 0 ? data.customer.tags.join(', ') : 'Không có';

        // Wallet Info
        this.container.querySelector('#wallet-balance').textContent = this.formatCurrency(data.wallet.balance);
        this.container.querySelector('#wallet-virtual-balance').textContent = this.formatCurrency(data.wallet.virtualBalance);
        this.container.querySelector('#wallet-total').textContent = this.formatCurrency(data.wallet.total);

        const vcList = this.container.querySelector('#virtual-credits-list');
        vcList.innerHTML = '';
        if (data.wallet.virtualCredits && data.wallet.virtualCredits.length > 0) {
            data.wallet.virtualCredits.forEach(vc => {
                const li = document.createElement('li');
                li.textContent = `${this.formatCurrency(vc.remaining_amount)} (Hết hạn: ${new Date(vc.expires_at).toLocaleDateString()})`;
                vcList.appendChild(li);
            });
        } else {
            vcList.innerHTML = '<li>Không có công nợ ảo đang hoạt động.</li>';
        }

        // Recent Tickets (only if has permission)
        const recentTicketsList = this.container.querySelector('#recent-tickets-list');
        if (this.permissionHelper.hasPermission('customer-hub', 'viewTickets') && data.recentTickets && data.recentTickets.length > 0) {
            let ticketsHtml = `<ul class="space-y-2">`;
            data.recentTickets.forEach(ticket => {
                ticketsHtml += `
                    <li class="bg-gray-50 dark:bg-gray-700 p-3 rounded-md border border-border-light dark:border-border-dark">
                        <strong>${ticket.ticket_code}</strong>: ${ticket.type} - Trạng thái: ${ticket.status}
                        <span class="text-gray-500 dark:text-gray-400 text-sm block">${new Date(ticket.created_at).toLocaleString()}</span>
                    </li>
                `;
            });
            ticketsHtml += `</ul>`;
            recentTicketsList.innerHTML = ticketsHtml;
        } else if (this.permissionHelper.hasPermission('customer-hub', 'viewTickets')) {
            recentTicketsList.innerHTML = `<p class="text-gray-500 dark:text-gray-400">Chưa có sự vụ nào.</p>`;
        } else {
            recentTicketsList.innerHTML = `<p class="text-red-500">Bạn không có quyền xem sự vụ.</p>`;
        }


        // Activity Timeline (only if has permission)
        const activityTimeline = this.container.querySelector('#activity-timeline');
        if (this.permissionHelper.hasPermission('customer-hub', 'viewActivities') && data.recentActivities && data.recentActivities.length > 0) {
            let activitiesHtml = `<ul class="space-y-4">`;
            data.recentActivities.forEach(activity => {
                activitiesHtml += `
                    <li class="flex items-start space-x-3">
                        <span class="material-symbols-outlined text-${activity.color || 'gray'}-500 text-xl">${activity.icon || 'info'}</span>
                        <div>
                            <p class="font-medium text-gray-800 dark:text-gray-100">${activity.title}</p>
                            <p class="text-sm text-gray-600 dark:text-gray-400">${activity.description || ''}</p>
                            <span class="text-xs text-gray-500 dark:text-gray-500">${new Date(activity.created_at).toLocaleString()}</span>
                        </div>
                    </li>
                `;
            });
            activitiesHtml += `</ul>`;
            activityTimeline.innerHTML = activitiesHtml;
        } else if (this.permissionHelper.hasPermission('customer-hub', 'viewActivities')) {
            activityTimeline.innerHTML = `<p class="text-gray-500 dark:text-gray-400">Chưa có hoạt động nào.</p>`;
        } else {
            activityTimeline.innerHTML = `<p class="text-red-500">Bạn không có quyền xem dòng thời gian hoạt động.</p>`;
        }

        // Customer Notes (only if has permission)
        const customerNotes = this.container.querySelector('#customer-notes');
        const newNoteContent = this.container.querySelector('#new-note-content');
        const addNoteBtn = this.container.querySelector('#add-note-btn');

        if (this.permissionHelper.hasPermission('customer-hub', 'addNote')) {
            addNoteBtn.onclick = () => this.addCustomerNote(newNoteContent.value);
        }

        this.renderNotes(data.notes);
    }

    renderNotes(notes) {
        const notesContainer = this.container.querySelector('#customer-notes');
        const existingNotesList = notesContainer.querySelector('ul');
        if (existingNotesList) existingNotesList.remove();

        if (notes && notes.length > 0) {
            let notesHtml = `<ul class="space-y-3 mb-4">`;
            notes.forEach(note => {
                notesHtml += `
                    <li class="bg-gray-50 dark:bg-gray-700 p-3 rounded-md border border-border-light dark:border-border-dark ${note.is_pinned ? 'border-primary-hover border-2' : ''}">
                        <p class="text-gray-800 dark:text-gray-100">${note.content}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            ${note.category ? `[${note.category}] ` : ''}Bởi: ${note.created_by || 'System'} vào ${new Date(note.created_at).toLocaleString()}
                            ${note.is_pinned ? '<span class="material-symbols-outlined text-sm text-primary align-bottom ml-1">push_pin</span>' : ''}
                        </p>
                    </li>
                `;
            });
            notesHtml += `</ul>`;
            notesContainer.insertAdjacentHTML('afterbegin', notesHtml);
        } else {
            notesContainer.insertAdjacentHTML('afterbegin', `<p class="text-gray-500 dark:text-gray-400 mb-4">Chưa có ghi chú nào.</p>`);
        }
    }

    async addCustomerNote(content) {
        if (!this.customerPhone || !content.trim()) {
            alert('Nội dung ghi chú không được trống!');
            return;
        }
        try {
            // Assuming there's an API endpoint for adding notes
            const response = await apiService.addCustomerNote(this.customerPhone, content, 'general', false, 'current_user'); // TODO: Replace 'current_user'
            if (response.success) {
                alert('Ghi chú đã được thêm thành công!');
                this.container.querySelector('#new-note-content').value = '';
                // Re-render notes or prepend the new note
                this.render(this.customerPhone); // Easiest way to refresh all data for now
            } else {
                alert('Lỗi khi thêm ghi chú: ' + response.error);
            }
        } catch (error) {
            alert('Lỗi khi thêm ghi chú: ' + error.message);
            console.error('Error adding note:', error);
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    }
}
