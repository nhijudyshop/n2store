// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * KPI Base Button - Nút đánh KPI Base độc lập cho Admin
 * Cho phép admin chủ động đánh KPI base cho toàn bộ đơn hàng
 * mà không cần gửi tin nhắn hàng loạt.
 *
 * Dependencies: kpi-manager.js, tab1-core.js (OrderStore), shared-auth-manager.js
 */

(function () {
    'use strict';

    function initKpiBaseButton() {
        const isAdmin = window.authManager?.isAdminTemplate?.() || false;
        const btn = document.getElementById('kpiBaseAllBtn');
        if (btn && isAdmin) {
            btn.style.display = '';
        }
    }

    // Wait for auth to be ready, then show/hide button
    setTimeout(initKpiBaseButton, 1500);

    // Also listen for auth state changes
    window.addEventListener('authStateChanged', initKpiBaseButton);

    window.handleKpiBaseAll = async function () {
        if (!window.kpiManager?.saveAutoBaseSnapshot) {
            alert('KPI Manager chưa sẵn sàng. Vui lòng tải lại trang.');
            return;
        }

        if (!window.OrderStore?.isInitialized || window.OrderStore.size === 0) {
            alert('Chưa có đơn hàng nào được tải. Vui lòng chọn chiến dịch trước.');
            return;
        }

        const allOrders = window.OrderStore.getAll();
        const totalOrders = allOrders.length;

        const campaignName = window.campaignManager?.activeCampaign?.name
            || window.campaignManager?.activeCampaign?.displayName
            || window.currentCampaignName
            || '';

        const confirmed = confirm(
            `Đánh KPI Base cho ${totalOrders} đơn hàng?\n\n` +
            `Chiến dịch: ${campaignName || '(không rõ)'}\n` +
            `Đơn đã có BASE sẽ được bỏ qua (không ghi đè).`
        );
        if (!confirmed) return;

        const btn = document.getElementById('kpiBaseAllBtn');
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';

        try {
            const userId = window.authManager?.getUserInfo()?.uid || '';
            const result = await window.kpiManager.saveAutoBaseSnapshot(allOrders, campaignName, userId);

            const { saved = 0, skipped = 0, failed = 0 } = result || {};

            let message = `Hoàn tất đánh KPI Base!\n\n`;
            message += `✓ Đã lưu: ${saved} đơn\n`;
            message += `→ Bỏ qua (đã có BASE): ${skipped} đơn\n`;
            if (failed > 0) {
                message += `✗ Lỗi: ${failed} đơn\n`;
            }
            const noProduct = totalOrders - saved - skipped - failed;
            if (noProduct > 0) {
                message += `⊘ Không có sản phẩm: ${noProduct} đơn`;
            }

            alert(message);
        } catch (err) {
            console.error('[KPI Base Button] Error:', err);
            alert('Lỗi khi đánh KPI Base: ' + (err.message || 'Unknown error'));
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    };

})();
