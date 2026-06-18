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
        document.getElementById('soGenRandomBtn')?.addEventListener('click', async () => {
            const c = await Popup.prompt('Tạo bao nhiêu đơn ngẫu nhiên?', { defaultValue: '5' });
            if (c === null) return;
            SO.generateRandomOrders(parseInt(c, 10) || 0);
        });
        // Import dữ liệu CSV/JSON + tải file mẫu (NGUỒN CHUNG Web2Import).
        document.getElementById('soImportBtn')?.addEventListener('click', () => {
            if (!window.Web2Import) return SO.notify('Module nhập dữ liệu chưa load', 'error');
            window.Web2Import.open(SO._soImportConfig());
        });
        document.getElementById('soSampleBtn')?.addEventListener('click', () => {
            if (!window.Web2Import) return SO.notify('Module nhập dữ liệu chưa load', 'error');
            window.Web2Import.downloadSample(SO._soImportConfig());
        });
        document
            .getElementById('soModalFillRandomBtn')
            ?.addEventListener('click', SO.fillModalRandom);
        document.getElementById('soTrashBtn')?.addEventListener('click', SO.openTrashModal);
        document
            .getElementById('soColumnSettingsBtn')
            .addEventListener('click', SO.openColumnModal);
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

        // Generic close handlers
        document.querySelectorAll('[data-so-close]').forEach((el) => {
            el.addEventListener('click', () => {
                el.closest('.so-modal, .so-lightbox')?.setAttribute('hidden', '');
            });
        });

        // ESC closes any open modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document
                    .querySelectorAll('.so-modal:not([hidden]), .so-lightbox:not([hidden])')
                    .forEach((m) => {
                        m.hidden = true;
                    });
            }
        });
    };
})();
