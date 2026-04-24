// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * LiveSale Customer Panel — opens the customer-info modal.
 *
 * Phase 1: minimal implementation. The modal DOM already exists in
 * index.html (#customerInfoModal). We render a simple placeholder card
 * until Phase 4 wires the real Customer-360 data from /api/v2/customers.
 */

const LiveSaleCustomerPanel = {
    async showCustomerInfo(fbUserId, name) {
        const modal = document.getElementById('customerInfoModal');
        const body = document.getElementById('customerInfoBody');
        const title = document.getElementById('customerInfoTitle');
        if (!modal || !body) return;

        if (title) title.textContent = name ? `Thông tin: ${name}` : 'Thông tin khách hàng';
        body.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div><span>Đang tải...</span>
            </div>
        `;
        modal.style.display = 'flex';
        if (window.lucide?.createIcons) window.lucide.createIcons();

        try {
            const data = await window.LiveSaleApi?.getPartnerInfo(null, fbUserId);
            if (data) {
                this._renderPartner(body, data);
            } else {
                body.innerHTML = `
                    <div style="padding:16px;color:var(--gray-600);">
                        Chưa có thông tin cho người dùng này.
                        <div style="margin-top:8px;font-size:12px;color:var(--gray-500);">
                            fb_user_id: ${escape(fbUserId)}
                        </div>
                    </div>
                `;
            }
        } catch (err) {
            body.innerHTML = `<div style="padding:16px;color:#ef4444;">Lỗi: ${escape(err.message)}</div>`;
        }
    },

    _renderPartner(host, partner) {
        const p = partner?.Partner || partner || {};
        const lines = [
            ['Tên', p.Name],
            ['Phone', p.Phone],
            ['Email', p.Email],
            ['Địa chỉ', p.Street],
            ['Trạng thái', p.StatusText],
        ]
            .filter(([, v]) => v)
            .map(([k, v]) => `<div class="kv"><span>${escape(k)}</span><strong>${escape(v)}</strong></div>`)
            .join('');
        host.innerHTML = `<div class="ls-partner-card">${lines || '<em>Không có dữ liệu</em>'}</div>`;
    },

    closeModal() {
        const modal = document.getElementById('customerInfoModal');
        if (modal) modal.style.display = 'none';
    },

    toggleStatusDropdown() { /* Phase 4 */ },
    selectStatus() { /* Phase 4 */ },
};

function escape(v) {
    if (v == null) return '';
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

if (typeof window !== 'undefined') {
    window.LiveSaleCustomerPanel = LiveSaleCustomerPanel;
    window.TposCustomerPanel = window.TposCustomerPanel || LiveSaleCustomerPanel;
}
