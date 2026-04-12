// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * TPOS Customer Info Panel
 * Modal for viewing/editing customer (partner) details
 * Dependencies: TposState, TposApi, SharedUtils, TposCommentList (for status options)
 */

const TposCustomerPanel = {
    /**
     * Show customer info modal
     * @param {string} customerId - Facebook user ID
     * @param {string} customerName
     */
    async showCustomerInfo(customerId, customerName) {
        const state = window.TposState;

        if (!customerId) {
            if (window.notificationManager) window.notificationManager.show('Không có ID khách hàng', 'error');
            return;
        }

        // Show modal with loading state
        const modal = document.getElementById('customerInfoModal');
        const titleEl = document.getElementById('customerInfoTitle');
        const bodyEl = document.getElementById('customerInfoBody');

        if (!modal || !bodyEl) {
            console.error('[TPOS-CUSTOMER] Customer info modal not found');
            return;
        }

        titleEl.textContent = `Thông tin: ${customerName}`;
        bodyEl.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <i data-lucide="loader-2" class="spin" style="width: 32px; height: 32px; color: #3b82f6;"></i>
                <p style="margin-top: 12px; color: #6b7280;">Đang tải thông tin...</p>
            </div>
        `;
        modal.style.display = 'flex';
        if (window.lucide) lucide.createIcons();

        try {
            const crmTeamId = state.selectedTeamId || state.selectedPage?.CRMTeamId || state.selectedPage?.Id;
            if (!crmTeamId) throw new Error('Không xác định được CRM Team ID');

            const data = await window.TposApi.getPartnerInfo(crmTeamId, customerId);
            if (!data) throw new Error('Không lấy được thông tin khách hàng');

            this.renderCustomerInfoModal(data, customerName);
        } catch (error) {
            console.error('[TPOS-CUSTOMER] Error loading customer info:', error);
            bodyEl.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #ef4444;"></i>
                    <p style="margin-top: 12px; color: #ef4444; font-weight: 500;">Lỗi tải thông tin</p>
                    <p style="color: #6b7280; font-size: 13px;">${error.message}</p>
                    <button onclick="TposCustomerPanel.closeModal()"
                            style="margin-top: 16px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        Đóng
                    </button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    },

    /**
     * Render customer info data into modal
     * @param {object} data - API response from chatomni/info
     * @param {string} customerName
     */
    renderCustomerInfoModal(data, customerName) {
        const state = window.TposState;
        const bodyEl = document.getElementById('customerInfoBody');
        if (!bodyEl) return;

        const partner = data.Partner || {};
        const order = data.Order || {};
        const conversation = data.Conversation || {};
        const revenue = data.Revenue || {};

        // Store partner ID for status update
        state.currentPartnerId = partner.Id;

        // Status options
        const statusOptions = window.TposCommentList.getStatusOptions();
        const currentStatus = partner.StatusText || 'Bình thường';

        const statusOptionsHtml = statusOptions.map(opt =>
            `<div class="status-option" data-value="${opt.value}" style="padding: 8px 12px; cursor: pointer; font-size: 13px;"
                 onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'"
                 onclick="TposCustomerPanel.selectStatus('${opt.value}', '${opt.text}')">
                ${opt.text}
            </div>`
        ).join('');

        const getStatusClass = (status) => {
            if (status === 0 || status === 'Nháp') return 'status-normal';
            if (status === 1 || status === 'Đã xác nhận') return 'status-normal';
            if (status === 'cancel' || status === 'Huỷ bỏ') return 'status-danger';
            return 'status-warning';
        };

        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            const date = new Date(dateStr);
            return date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        };

        bodyEl.innerHTML = `
            <!-- Customer Basic Info -->
            <div class="customer-section">
                <h4><i data-lucide="user" style="width: 16px; height: 16px;"></i> Thông tin khách hàng</h4>
                <div class="customer-field">
                    <label>Tên:</label>
                    <span><strong>${SharedUtils.escapeHtml(partner.Name || customerName)}</strong> (Id: ${partner.Id || '-'})</span>
                </div>
                <div class="customer-field">
                    <label>Trạng thái:</label>
                    <div class="status-dropdown-container" style="position: relative; display: inline-block;">
                        <button id="statusDropdownBtn" class="status-dropdown-btn"
                                style="display: flex; align-items: center; gap: 4px; padding: 4px 10px; border: 1px solid #d1d5db; border-radius: 4px; background: white; cursor: pointer; font-size: 13px;"
                                onclick="TposCustomerPanel.toggleStatusDropdown()">
                            <span id="statusText">${currentStatus}</span>
                            <i data-lucide="chevron-down" style="width: 14px; height: 14px;"></i>
                        </button>
                        <div id="statusDropdown" style="display: none; position: absolute; top: 100%; left: 0; min-width: 160px; background: white; border: 1px solid #d1d5db; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; margin-top: 4px;">
                            ${statusOptionsHtml}
                        </div>
                    </div>
                </div>
                <div class="customer-field">
                    <label>Điện thoại:</label>
                    <span>${partner.Phone || conversation.Phone || '-'}</span>
                </div>
                <div class="customer-field">
                    <label>Email:</label>
                    <span>${partner.Email || '-'}</span>
                </div>
                <div class="customer-field">
                    <label>Địa chỉ:</label>
                    <span>${partner.FullAddress || partner.Street || '-'}</span>
                </div>
                ${partner.Comment ? `
                <div class="customer-field">
                    <label>Ghi chú:</label>
                    <span>${SharedUtils.escapeHtml(partner.Comment)}</span>
                </div>
                ` : ''}
            </div>

            <!-- Revenue Info -->
            <div class="customer-section">
                <h4><i data-lucide="trending-up" style="width: 16px; height: 16px;"></i> Doanh thu</h4>
                <div class="customer-field">
                    <label>Tổng doanh thu:</label>
                    <span><strong>${(revenue.RevenueTotal || 0).toLocaleString('vi-VN')}đ</strong></span>
                </div>
            </div>

            <!-- Order Info -->
            ${order.Id ? `
            <div class="customer-section">
                <h4><i data-lucide="shopping-bag" style="width: 16px; height: 16px;"></i> Đơn hàng gần nhất</h4>
                <table class="order-table">
                    <thead>
                        <tr><th>Mã</th><th>STT</th><th>Trạng thái</th><th>Ngày tạo</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><span class="order-code">${order.Code || order.Id}</span></td>
                            <td>${order.SessionIndex || '-'}</td>
                            <td><span class="status-badge ${getStatusClass(order.Status)}" id="orderStatusBadge">${order.StatusText || 'Nháp'}</span></td>
                            <td>${formatDate(order.DateCreated)}</td>
                        </tr>
                    </tbody>
                </table>
                ${(order.Details && order.Details.length > 0) ? `
                <div style="margin-top: 12px;">
                    <strong style="font-size: 12px; color: #374151;">Sản phẩm:</strong>
                    <table class="order-table" style="margin-top: 6px;">
                        <thead><tr><th>Tên</th><th>SL</th><th>Đơn giá</th></tr></thead>
                        <tbody>
                            ${order.Details.map(d => `<tr>
                                <td>${SharedUtils.escapeHtml(d.ProductName || d.Product?.NameGet || '-')}</td>
                                <td>${d.Quantity || 0}</td>
                                <td>${(d.PriceUnit || d.Price || 0).toLocaleString('vi-VN')}đ</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                ` : '<p style="margin-top:8px;color:#9ca3af;font-size:12px;">Chưa có sản phẩm trong đơn</p>'}
                ${order.Note ? `
                <div style="margin-top: 12px; padding: 8px 12px; background: #fef3c7; border-radius: 6px;">
                    <strong style="font-size: 12px; color: #92400e;">Ghi chú đơn:</strong>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #92400e;">${SharedUtils.escapeHtml(order.Note)}</p>
                </div>
                ` : ''}
                <!-- Order Actions -->
                <div style="display:flex;gap:8px;margin-top:12px;" id="orderActions">
                    ${order.StatusText === 'Nháp' ? `
                    <button onclick="TposCustomerPanel.confirmOrder('${order.Id}')"
                            style="padding:6px 14px;background:#10b981;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;">
                        Xác nhận đơn
                    </button>
                    <button onclick="TposCustomerPanel.cancelOrder('${order.Id}')"
                            style="padding:6px 14px;background:#ef4444;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;">
                        Hủy đơn
                    </button>
                    ` : ''}
                </div>
            </div>
            ` : `
            <div class="customer-section">
                <h4><i data-lucide="shopping-bag" style="width: 16px; height: 16px;"></i> Đơn hàng</h4>
                <p style="color: #6b7280; font-size: 13px; text-align: center; padding: 20px 0;">Chưa có đơn hàng</p>
            </div>
            `}

            <!-- Actions -->
            <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button onclick="TposCustomerPanel.closeModal()"
                        style="flex: 1; padding: 10px 16px; background: #f3f4f6; color: #374151; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                    Đóng
                </button>
                ${order.Code ? `
                <button onclick="window.open('https://tomato.tpos.vn/#/app/saleOnline/facebook/post/${order.Facebook_PostId || ''}/false', '_blank')"
                        style="flex: 1; padding: 10px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                    <i data-lucide="external-link" style="width: 14px; height: 14px; display: inline; vertical-align: middle;"></i>
                    Mở trên TPOS
                </button>
                ` : ''}
            </div>
        `;

        if (window.lucide) lucide.createIcons();
    },

    /**
     * Close customer info modal
     */
    closeModal() {
        const modal = document.getElementById('customerInfoModal');
        if (modal) modal.style.display = 'none';
    },

    /**
     * Toggle status dropdown in modal
     */
    toggleStatusDropdown() {
        const dropdown = document.getElementById('statusDropdown');
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
    },

    /**
     * Select status from dropdown and update via API
     * @param {string} value
     * @param {string} text
     */
    /**
     * Confirm an order
     * @param {string} orderId
     */
    async confirmOrder(orderId) {
        if (!confirm('Xác nhận đơn hàng này?')) return;
        const success = await window.TposApi.confirmOrder(orderId);
        if (success) {
            const badge = document.getElementById('orderStatusBadge');
            if (badge) { badge.textContent = 'Đã xác nhận'; badge.className = 'status-badge status-normal'; }
            const actions = document.getElementById('orderActions');
            if (actions) actions.innerHTML = '<span style="color:#10b981;font-size:12px;font-weight:500;">✓ Đã xác nhận</span>';
            if (window.notificationManager) window.notificationManager.show('Đã xác nhận đơn!', 'success');
        } else {
            if (window.notificationManager) window.notificationManager.show('Lỗi xác nhận đơn', 'error');
        }
    },

    /**
     * Cancel an order
     * @param {string} orderId
     */
    async cancelOrder(orderId) {
        if (!confirm('Hủy đơn hàng này?')) return;
        const success = await window.TposApi.cancelOrder(orderId);
        if (success) {
            const badge = document.getElementById('orderStatusBadge');
            if (badge) { badge.textContent = 'Huỷ bỏ'; badge.className = 'status-badge status-danger'; }
            const actions = document.getElementById('orderActions');
            if (actions) actions.innerHTML = '<span style="color:#ef4444;font-size:12px;font-weight:500;">✗ Đã hủy</span>';
            if (window.notificationManager) window.notificationManager.show('Đã hủy đơn!', 'info');
        } else {
            if (window.notificationManager) window.notificationManager.show('Lỗi hủy đơn', 'error');
        }
    },

    async selectStatus(value, text) {
        const state = window.TposState;

        // Hide dropdown
        const dropdown = document.getElementById('statusDropdown');
        if (dropdown) dropdown.style.display = 'none';

        // Update UI immediately
        const statusTextEl = document.getElementById('statusText');
        if (statusTextEl) statusTextEl.textContent = text;

        // Call API to update status
        if (state.currentPartnerId) {
            await window.TposApi.updatePartnerStatus(state.currentPartnerId, value);
        }
    }
};

// Export for script-tag usage
if (typeof window !== 'undefined') {
    window.TposCustomerPanel = TposCustomerPanel;
}
