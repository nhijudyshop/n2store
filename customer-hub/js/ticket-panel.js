/**
 * Ticket Panel - Handles ticket operations in customer detail page
 */

const TicketPanel = {
    // State
    phone: null,
    tickets: [],

    /**
     * Load tickets
     */
    async load(phone) {
        this.phone = phone;

        try {
            const result = await CustomerService.getCustomerTickets(phone);
            this.tickets = result.tickets || result.data || [];
            this.render();
            this.bindEvents();
        } catch (error) {
            console.error('Error loading tickets:', error);
            this.renderError();
        }
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Create ticket button
        const createTicketBtn = document.getElementById('createTicketBtn');
        if (createTicketBtn) {
            createTicketBtn.onclick = () => this.showTicketModal();
        }

        // Ticket form
        const ticketForm = document.getElementById('ticketForm');
        if (ticketForm) {
            ticketForm.onsubmit = (e) => this.handleCreateTicket(e);
        }

        // Close modal
        const closeTicketModalBtn = document.getElementById('closeTicketModalBtn');
        if (closeTicketModalBtn) {
            closeTicketModalBtn.onclick = () => this.hideTicketModal();
        }

        const ticketModal = document.getElementById('ticketModal');
        if (ticketModal) {
            ticketModal.onclick = (e) => {
                if (e.target === ticketModal) this.hideTicketModal();
            };
        }
    },

    /**
     * Render tickets list
     */
    render() {
        const container = document.getElementById('ticketsList');
        if (!container) return;

        if (!this.tickets.length) {
            container.innerHTML = `
                <div class="empty-state-small">
                    <i data-lucide="ticket"></i>
                    <p>Chưa có sự vụ nào</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        container.innerHTML = this.tickets.map(ticket => {
            const typeConfig = CONFIG.TICKET_TYPES[ticket.ticket_type] || {
                color: '#6b7280',
                icon: 'file-text',
                label: ticket.ticket_type
            };

            const statusConfig = CONFIG.TICKET_STATUSES[ticket.status] || {
                color: '#6b7280',
                label: ticket.status
            };

            const priorityConfig = CONFIG.TICKET_PRIORITIES[ticket.priority] || {
                color: '#6b7280',
                label: ticket.priority
            };

            return `
                <div class="ticket-item" onclick="TicketPanel.viewTicket('${ticket.ticket_code}')">
                    <div class="ticket-header">
                        <span class="ticket-code">${ticket.ticket_code}</span>
                        <span class="ticket-status" style="background: ${statusConfig.color}20; color: ${statusConfig.color};">
                            ${statusConfig.label}
                        </span>
                    </div>
                    <div class="ticket-body">
                        <div class="ticket-type" style="color: ${typeConfig.color};">
                            <i data-lucide="${typeConfig.icon}"></i>
                            ${typeConfig.label}
                        </div>
                        <h4 class="ticket-subject">${ticket.subject || 'Không có tiêu đề'}</h4>
                        <p class="ticket-description">${ticket.description || ''}</p>
                    </div>
                    <div class="ticket-footer">
                        <span class="ticket-priority" style="color: ${priorityConfig.color};">
                            <i data-lucide="alert-circle"></i>
                            ${priorityConfig.label}
                        </span>
                        <span class="ticket-time">
                            <i data-lucide="clock"></i>
                            ${Utils.formatRelativeTime(ticket.created_at)}
                        </span>
                        ${ticket.order_id ? `
                            <span class="ticket-order">
                                <i data-lucide="shopping-bag"></i>
                                ${ticket.order_id}
                            </span>
                        ` : ''}
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
        const container = document.getElementById('ticketsList');
        if (container) {
            container.innerHTML = `
                <div class="empty-state-small error">
                    <i data-lucide="alert-triangle"></i>
                    <p>Lỗi tải danh sách sự vụ</p>
                </div>
            `;
            lucide.createIcons();
        }
    },

    /**
     * Show create ticket modal
     */
    showTicketModal() {
        const modal = document.getElementById('ticketModal');
        const form = document.getElementById('ticketForm');
        if (form) form.reset();
        if (modal) modal.classList.add('show');
        lucide.createIcons();
    },

    /**
     * Hide ticket modal
     */
    hideTicketModal() {
        const modal = document.getElementById('ticketModal');
        if (modal) modal.classList.remove('show');
    },

    /**
     * Handle create ticket form submit
     */
    async handleCreateTicket(e) {
        e.preventDefault();

        const data = {
            customer_phone: this.phone,
            ticket_type: document.getElementById('ticketType').value,
            priority: document.getElementById('ticketPriority').value,
            subject: document.getElementById('ticketSubject').value.trim(),
            description: document.getElementById('ticketDescription').value.trim(),
            order_id: document.getElementById('ticketOrderId').value.trim() || null
        };

        if (!data.ticket_type) {
            Utils.showToast('Vui lòng chọn loại sự vụ', 'warning');
            return;
        }

        if (!data.subject) {
            Utils.showToast('Vui lòng nhập tiêu đề', 'warning');
            return;
        }

        try {
            await CustomerService.createTicket(data);
            Utils.showToast('Tạo sự vụ thành công!', 'success');
            this.hideTicketModal();
            await this.load(this.phone);
        } catch (error) {
            Utils.showToast('Lỗi tạo sự vụ: ' + error.message, 'error');
        }
    },

    /**
     * View ticket detail
     */
    viewTicket(ticketCode) {
        // For now, show toast. In production, could open ticket detail modal
        Utils.showToast(`Xem chi tiết ticket: ${ticketCode}`, 'info');
        // Could redirect to ticket detail page or show modal
    }
};

// Export
window.TicketPanel = TicketPanel;
