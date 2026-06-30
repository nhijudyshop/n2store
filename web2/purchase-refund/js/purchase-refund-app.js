// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// purchase-refund-app.js — orchestrator (init/events/SSE). Trả hàng NCC.
// Module set load TRƯỚC theo thứ tự state→api→render→modal→actions→app (file
// này LAST). Tất cả state/util/handler nằm trong window.PurchaseRefund (PR).
// Page KHÔNG expose public global nào khác; events wire qua addEventListener.

(function () {
    'use strict';

    const PR = (window.PurchaseRefund = window.PurchaseRefund || {});
    const { STATE, SOURCE_STATE } = PR.state;
    const { $, openImageLightbox } = PR.util;
    const { loadList } = PR.api;
    const { renderList, loadSourceItems, renderSourceList } = PR.render;

    // ---------- SSE ----------
    function setupSSE() {
        if (!window.Web2SSE?.subscribe) return;
        // 1 nguồn debounce (Web2SSE.subscribeReload); fallback subscribe nếu bridge cũ.
        STATE.sseUnsub = window.Web2SSE.subscribeReload
            ? window.Web2SSE.subscribeReload('web2:purchase-refund', loadList, { debounce: 600 })
            : window.Web2SSE.subscribe('web2:purchase-refund', () => {
                  clearTimeout(setupSSE._t);
                  setupSSE._t = setTimeout(() => loadList(), 600);
              });
        // 2026-06-28: picker Section A đọc SP đã nhận từ Sổ Order (web2_so_order) gom
        // theo lô → phải subscribe web2:so-order (+ web2:products khi nhận hàng đổi
        // tồn) để picker tự cập nhật, không cần bấm "Đồng bộ"/reload tay.
        const reloadSource = () => {
            clearTimeout(setupSSE._ts);
            setupSSE._ts = setTimeout(() => {
                loadSourceItems();
                loadList();
            }, 600);
        };
        STATE.sseUnsubSrc = window.Web2SSE.subscribe('web2:so-order', reloadSource);
        STATE.sseUnsubSrc2 = window.Web2SSE.subscribe('web2:products', reloadSource);
    }

    function wireSourceList() {
        $('prReloadBtn').addEventListener('click', async () => {
            await Promise.all([loadSourceItems(), loadList()]);
        });
        $('prSourceSearch').addEventListener('input', (e) => {
            SOURCE_STATE.search = e.target.value;
            renderSourceList();
        });
        $('prSourceSupplier').addEventListener('change', (e) => {
            SOURCE_STATE.supplierFilter = e.target.value;
            renderSourceList();
        });
        // Delegate "Trả NCC" (1 SP) + "Trả hàng" (cả đơn) buttons
        $('prSourceList').addEventListener('click', (e) => {
            const bulkBtn = e.target.closest('.pr-bulk-btn');
            if (bulkBtn) {
                PR.actions.openBulkRefund(Number(bulkBtn.dataset.bulkGroup));
                return;
            }
            const btn = e.target.closest('.pr-source-refund');
            if (!btn) return;
            PR.actions.openQuickRefund(btn.dataset.srcAgg);
        });
    }

    // ---------- Init ----------
    function init() {
        // Mount sidebar
        if (window.Web2Sidebar) {
            window.Web2Sidebar.mount('#web2Aside', { activeUrl: window.location.href });
        }
        // Wire UI — section A + B
        $('prFilterStatus')?.addEventListener('change', (e) => {
            STATE.filterStatus = e.target.value;
            renderList();
        });
        $('prSearch')?.addEventListener('input', (e) => {
            STATE.search = e.target.value;
            renderList();
        });
        // Legacy modal close (still has form for edit existing)
        document
            .querySelectorAll('[data-pr-modal-close]')
            .forEach((el) => el.addEventListener('click', PR.modal.closeModal));
        $('prForm')?.addEventListener('submit', PR.modal.handleFormSubmit);
        PR.modal.wirePicker();
        wireSourceList();
        PR.actions.wireQuickModal();
        PR.actions.wireBulkModal();
        // Click thumbnail SP (bất kỳ đâu) → xem ảnh full-size.
        document.addEventListener('click', (e) => {
            const img = e.target.closest('img.pr-thumb-zoom');
            if (img && img.dataset.full) {
                e.preventDefault();
                e.stopPropagation();
                openImageLightbox(img.dataset.full);
            }
        });

        // Initial loads: section A (so-order) + section B (refunds)
        loadSourceItems();
        loadList();
        setupSSE();
    }

    PR.app = { setupSSE, wireSourceList, init };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
