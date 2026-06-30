// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — toolbar/footer wiring. MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    SO.wireFooterInputs = function wireFooterInputs() {
        // 2026-06-16: footer giảm giá / phí ship = DERIVED (Σ các đơn trong ngày
        // giao) → readonly, KHÔNG nhập tay. Nhập discount/ship ở modal tạo/sửa đơn.
        ['soFootDiscount', 'soFootShipping'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.readOnly = true;
                el.tabIndex = -1;
                el.title =
                    'Tổng giảm giá / phí ship của các đơn trong ngày giao (tự tính từ từng đơn)';
            }
        });
    };

    SO.wireToolbar = function wireToolbar() {
        document
            .getElementById('soAddTabBtn')
            .addEventListener('click', () => SO.openTabSettingsModal(true));
        document
            .getElementById('soTabSettingsBtn')
            .addEventListener('click', () => SO.openTabSettingsModal(false));
        document
            .getElementById('soCreateOrderBtn')
            .addEventListener('click', () => SO.openOrderModal(null));
        // 2026-06-28: BỎ 3 nút toolbar Nhập / Tải mẫu / Tạo data ngẫu nhiên (user
        // yêu cầu). Handler tương ứng gỡ luôn. "Điền ngẫu nhiên" TRONG modal vẫn giữ.
        document
            .getElementById('soModalFillRandomBtn')
            ?.addEventListener('click', SO.fillModalRandom);
        document.getElementById('soTrashBtn')?.addEventListener('click', SO.openTrashModal);
        document
            .getElementById('soColumnSettingsBtn')
            .addEventListener('click', SO.openColumnModal);
        // #2 follow-up: SP chờ hàng cần đặt thêm NCC (giỏ nháp > tồn).
        document
            .getElementById('soRestockBtn')
            ?.addEventListener('click', () => SO.openRestockModal && SO.openRestockModal());
        // Lịch sử chỉnh sửa Sổ Order (document-level) — module chung Web2AuditLog.
        document.getElementById('soHistoryBtn')?.addEventListener('click', () => {
            if (window.Web2AuditLog) {
                window.Web2AuditLog.openRecord({
                    entity: 'so-order',
                    entityId: 'main',
                    title: 'Lịch sử chỉnh sửa Sổ Order',
                });
            } else if (window.notificationManager) {
                notificationManager.show('Module lịch sử chưa tải', 'error');
            }
        });
        document.getElementById('soTabDeleteBtn').addEventListener('click', SO.handleTabDelete);
        SO._wireShipMetaAll();
        const editBtn = document.getElementById('soEditTableBtn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                SO.setEditTableMode(!SO.editTableMode);
                SO.renderAll();
            });
        }

        document.getElementById('soOrderForm').addEventListener('submit', SO.handleOrderSubmit);
        document
            .getElementById('soTabSettingsForm')
            .addEventListener('submit', SO.handleTabSettingsSubmit);
        // Giảm giá / phí ship per-đơn → cập nhật THÀNH TIỀN modal ngay khi gõ.
        ['shipDiscount', 'shipShipping'].forEach((name) => {
            const el = document.querySelector(`#soOrderForm [name="${name}"]`);
            if (el) el.addEventListener('input', SO.updateModalGrandTotals);
        });

        // Generic close handlers. Đóng bằng backdrop/✕ → ẩn luôn 2 float panel
        // (suggest/variant) treo ở <body>, tránh dropdown lơ lửng sau khi modal
        // đóng (chỉ submit path gọi hideModal→_hideFloatPanels; path này thì không).
        document.querySelectorAll('[data-so-close]').forEach((el) => {
            el.addEventListener('click', () => {
                const m = el.closest('.so-modal, .so-lightbox');
                // Qua SO.hideModal để unlock body scroll-lock (backdrop/✕/Hủy).
                if (m?.id) SO.hideModal(m.id);
                else m?.setAttribute('hidden', '');
                SO._hideFloatPanels?.();
            });
        });

        // ESC closes any open modal (+ ẩn float panel orphan như trên)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document
                    .querySelectorAll('.so-modal:not([hidden]), .so-lightbox:not([hidden])')
                    .forEach((m) => {
                        // Qua SO.hideModal để unlock body scroll-lock.
                        if (m.id) SO.hideModal(m.id);
                        else m.hidden = true;
                    });
                SO._hideFloatPanels?.();
            }
        });
    };
})();
