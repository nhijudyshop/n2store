// customer-hub/js/modules/ticket-list.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class TicketListModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.customerPhone = null;
    }

    async render(phone) {
        this.customerPhone = phone;
        if (!this.permissionHelper.hasPermission('customer-hub', 'viewTickets')) {
            this.container.innerHTML = `<p class="text-red-500">Bạn không có quyền xem danh sách ticket.</p>`;
            return;
        }

        this.container.innerHTML = `
            <div class="bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft p-6 mb-6">
                <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Danh sách Ticket</h3>
                <div id="ticket-list-content">Đang tải danh sách ticket...</div>
            </div>
        `;
        await this.loadTickets();
    }

    async loadTickets() {
        if (!this.customerPhone) {
            this.container.querySelector('#ticket-list-content').innerHTML = `<p class="text-yellow-500">Không có số điện thoại khách hàng để tải ticket.</p>`;
            return;
        }
        try {
            // Assuming apiService.subscribeToTickets can filter by phone and fetch initial data
            // For a single fetch, we might need a dedicated API endpoint like getTicketsByPhone
            // For now, we'll use a placeholder or adapt subscribeToTickets if possible
            const response = await apiService.subscribeToTickets((tickets) => {
                // This callback will be called when tickets are available
                // We'll need to filter them if subscribeToTickets doesn't do it server-side
                const customerTickets = tickets.filter(ticket => ticket.phone === this.customerPhone);
                this.renderTickets(customerTickets);
            }, { phone: this.customerPhone, limit: 10 });

            // If subscribeToTickets returns an unsubscribe function, store it if needed
            this.unsubscribeTickets = response;

        } catch (error) {
            this.container.querySelector('#ticket-list-content').innerHTML = `<p class="text-red-500">Lỗi khi tải danh sách ticket: ${error.message}</p>`;
            console.error('Error loading tickets:', error);
        }
    }

    renderTickets(tickets) {
        if (tickets.length === 0) {
            this.container.querySelector('#ticket-list-content').innerHTML = `<p class="text-gray-500 dark:text-gray-400">Không có ticket nào cho khách hàng này.</p>`;
            return;
        }

        let ticketsHtml = `
            <table class="min-w-full bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft">
                <thead>
                    <tr class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase text-sm leading-normal">
                        <th class="py-3 px-6 text-left">Mã Ticket</th>
                        <th class="py-3 px-6 text-left">Loại</th>
                        <th class="py-3 px-6 text-left">Trạng thái</th>
                        <th class="py-3 px-6 text-left">Ngày tạo</th>
                        <th class="py-3 px-6 text-left">Ghi chú</th>
                    </tr>
                </thead>
                <tbody class="text-gray-600 dark:text-gray-400 text-sm font-light">
        `;

        tickets.forEach(ticket => {
            ticketsHtml += `
                <tr class="border-b border-border-light dark:border-border-dark hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200">
                    <td class="py-3 px-6 text-left">${ticket.ticketCode || ticket.firebaseId}</td>
                    <td class="py-3 px-6 text-left">${ticket.type}</td>
                    <td class="py-3 px-6 text-left">${ticket.status}</td>
                    <td class="py-3 px-6 text-left">${new Date(ticket.createdAt).toLocaleDateString()}</td>
                    <td class="py-3 px-6 text-left">${ticket.note || ''}</td>
                </tr>
            `;
        });

        ticketsHtml += `
                </tbody>
            </table>
        `;
        this.container.querySelector('#ticket-list-content').innerHTML = ticketsHtml;
    }

    // Cleanup function if using subscribeToTickets
    destroy() {
        if (this.unsubscribeTickets) {
            this.unsubscribeTickets();
        }
    }
}
