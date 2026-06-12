// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Live Customer Info Panel
 * Modal for viewing/editing customer (partner) details
 * Dependencies: LiveState, LiveApi, SharedUtils, LiveCommentList (for status options)
 */

/**
 * Escape giá trị nhét vào HTML ATTRIBUTE (double-quoted). SharedUtils.escapeHtml
 * (textContent→innerHTML) KHÔNG escape dấu " → không an toàn cho attribute.
 * @param {*} v
 * @returns {string}
 */
function lcpAttr(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const LiveCustomerPanel = {
    /**
     * Show customer info modal
     * @param {string} customerId - Facebook user ID
     * @param {string} customerName
     */
    async showCustomerInfo(customerId, customerName) {
        const state = window.LiveState;

        if (!customerId) {
            if (window.notificationManager)
                window.notificationManager.show('Không có ID khách hàng', 'error');
            return;
        }

        // Show modal with loading state
        const modal = document.getElementById('customerInfoModal');
        const titleEl = document.getElementById('customerInfoTitle');
        const bodyEl = document.getElementById('customerInfoBody');

        if (!modal || !bodyEl) {
            console.error('[Live-CUSTOMER] Customer info modal not found');
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
            // 2026-06-12: bỏ crmTeamId (di tích TPOS) — warehouse lookup chỉ cần fb_id.
            const data = await window.LiveApi.getPartnerInfo(customerId);
            if (!data) throw new Error('Không lấy được thông tin khách hàng');

            this.renderCustomerInfoModal(data, customerName);
        } catch (error) {
            console.error('[Live-CUSTOMER] Error loading customer info:', error);
            bodyEl.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #ef4444;"></i>
                    <p style="margin-top: 12px; color: #ef4444; font-weight: 500;">Lỗi tải thông tin</p>
                    <p style="color: #6b7280; font-size: 13px;">${SharedUtils.escapeHtml(error.message)}</p>
                    <button onclick="LiveCustomerPanel.closeModal()"
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
        const state = window.LiveState;
        const bodyEl = document.getElementById('customerInfoBody');
        if (!bodyEl) return;

        const partner = data.Partner || {};
        const order = data.Order || {};
        const conversation = data.Conversation || {};
        const revenue = data.Revenue || {};

        // Store partner ID for status update
        state.currentPartnerId = partner.Id;

        // Status options
        const statusOptions = window.LiveCommentList.getStatusOptions();
        const currentStatus = partner.StatusText || 'Bình thường';

        // Options dùng data-value/data-text + delegated listener (XSS-safe,
        // không inline onclick chứa giá trị động).
        const statusOptionsHtml = statusOptions
            .map(
                (opt) =>
                    `<div class="status-option" data-value="${lcpAttr(opt.value)}" data-text="${lcpAttr(opt.text)}" style="padding: 8px 12px; cursor: pointer; font-size: 13px;"
                 onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
                ${SharedUtils.escapeHtml(opt.text)}
            </div>`
            )
            .join('');

        const getStatusClass = (status) => {
            if (status === 0 || status === 'Nháp') return 'status-normal';
            if (status === 1 || status === 'Đã xác nhận') return 'status-normal';
            if (status === 'cancel' || status === 'Huỷ bỏ') return 'status-danger';
            return 'status-warning';
        };

        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            const date = SharedUtils.parseTimestamp(dateStr);
            if (!date) return '-';
            const tz = { timeZone: 'Asia/Ho_Chi_Minh' };
            return (
                date.toLocaleDateString('vi-VN', tz) +
                ' ' +
                date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', ...tz })
            );
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
                                onclick="LiveCustomerPanel.toggleStatusDropdown()">
                            <span id="statusText">${SharedUtils.escapeHtml(currentStatus)}</span>
                            <i data-lucide="chevron-down" style="width: 14px; height: 14px;"></i>
                        </button>
                        <div id="statusDropdown" style="display: none; position: absolute; top: 100%; left: 0; min-width: 160px; background: white; border: 1px solid #d1d5db; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; margin-top: 4px;">
                            ${statusOptionsHtml}
                        </div>
                    </div>
                </div>
                <div class="customer-field">
                    <label>Điện thoại:</label>
                    <span>${SharedUtils.escapeHtml(String(partner.Phone || conversation.Phone || '-'))} <span class="w2wb-slot" data-w2wallet-phone="${lcpAttr(partner.Phone || conversation.Phone || '')}"></span></span>
                </div>
                <div class="customer-field">
                    <label>Email:</label>
                    <span>${SharedUtils.escapeHtml(String(partner.Email || '-'))}</span>
                </div>
                <div class="customer-field">
                    <label>Địa chỉ:</label>
                    <span>${SharedUtils.escapeHtml(String(partner.FullAddress || partner.Street || '-'))}</span>
                </div>
                ${
                    partner.Comment
                        ? `
                <div class="customer-field">
                    <label>Ghi chú:</label>
                    <span>${SharedUtils.escapeHtml(partner.Comment)}</span>
                </div>
                `
                        : ''
                }
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
            ${
                order.Id
                    ? `
            <div class="customer-section">
                <h4><i data-lucide="shopping-bag" style="width: 16px; height: 16px;"></i> Đơn hàng gần nhất</h4>
                <table class="order-table">
                    <thead>
                        <tr><th>Mã</th><th>STT</th><th>Trạng thái</th><th>Ngày tạo</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><span class="order-code">${SharedUtils.escapeHtml(String(order.Code || order.Id))}</span></td>
                            <td>${SharedUtils.escapeHtml(String(order.SessionIndex || '-'))}</td>
                            <td><span class="status-badge ${getStatusClass(order.Status)}" id="orderStatusBadge">${SharedUtils.escapeHtml(String(order.StatusText || 'Nháp'))}</span></td>
                            <td>${formatDate(order.DateCreated)}</td>
                        </tr>
                    </tbody>
                </table>
                ${
                    order.Details && order.Details.length > 0
                        ? `
                <div style="margin-top: 12px;">
                    <strong style="font-size: 12px; color: #374151;">Sản phẩm:</strong>
                    <table class="order-table" style="margin-top: 6px;">
                        <thead><tr><th>Tên</th><th>SL</th><th>Đơn giá</th></tr></thead>
                        <tbody>
                            ${order.Details.map(
                                (d) => `<tr>
                                <td>${SharedUtils.escapeHtml(d.ProductName || d.Product?.NameGet || '-')}</td>
                                <td>${d.Quantity || 0}</td>
                                <td>${(d.PriceUnit || d.Price || 0).toLocaleString('vi-VN')}đ</td>
                            </tr>`
                            ).join('')}
                        </tbody>
                    </table>
                </div>
                `
                        : '<p style="margin-top:8px;color:#9ca3af;font-size:12px;">Chưa có sản phẩm trong đơn</p>'
                }
                ${
                    order.Note
                        ? `
                <div style="margin-top: 12px; padding: 8px 12px; background: #fef3c7; border-radius: 6px;">
                    <strong style="font-size: 12px; color: #92400e;">Ghi chú đơn:</strong>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #92400e;">${SharedUtils.escapeHtml(order.Note)}</p>
                </div>
                `
                        : ''
                }
            </div>
            `
                    : `
            <div class="customer-section">
                <h4><i data-lucide="shopping-bag" style="width: 16px; height: 16px;"></i> Đơn hàng</h4>
                <p style="color: #6b7280; font-size: 13px; text-align: center; padding: 20px 0;">Chưa có đơn hàng</p>
            </div>
            `
            }

            <!-- Actions -->
            <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button onclick="LiveCustomerPanel.closeModal()"
                        style="flex: 1; padding: 10px 16px; background: #f3f4f6; color: #374151; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                    Đóng
                </button>
                ${
                    order.Code
                        ? `
                <button onclick="window.open('https://tomato.live.vn/#/app/saleOnline/facebook/post/${String(order.Facebook_PostId || '').replace(/[^0-9A-Za-z_.-]/g, '')}/false', '_blank')"
                        style="flex: 1; padding: 10px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                    <i data-lucide="external-link" style="width: 14px; height: 14px; display: inline; vertical-align: middle;"></i>
                    Mở trên Live
                </button>
                `
                        : ''
                }
            </div>
        `;

        // Delegated click cho options trạng thái (element được render mới mỗi
        // lần → guard dataset tự reset, không bind trùng).
        const statusDd = document.getElementById('statusDropdown');
        if (statusDd && statusDd.dataset.delegated !== '1') {
            statusDd.dataset.delegated = '1';
            statusDd.addEventListener('click', (e) => {
                const opt = e.target.closest('.status-option[data-value]');
                if (opt) this.selectStatus(opt.dataset.value, opt.dataset.text);
            });
        }

        if (window.lucide) lucide.createIcons();
        // Số dư ví Web 2.0 cạnh SĐT (chỉ hiện khi > 0).
        window.Web2WalletBalance?.attachBalances?.(bodyEl);
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

    // confirmOrder / cancelOrder REMOVED — not used by this page.

    async selectStatus(value, text) {
        const state = window.LiveState;

        // Hide dropdown
        const dropdown = document.getElementById('statusDropdown');
        if (dropdown) dropdown.style.display = 'none';

        // Update UI immediately
        const statusTextEl = document.getElementById('statusText');
        if (statusTextEl) statusTextEl.textContent = text;

        // Call API to update status
        if (state.currentPartnerId) {
            await window.LiveApi.updatePartnerStatus(state.currentPartnerId, value);
        }
    },
};

// Export for script-tag usage
if (typeof window !== 'undefined') {
    window.LiveCustomerPanel = LiveCustomerPanel;
}
