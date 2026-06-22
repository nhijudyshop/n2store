// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// PBH (Fast Sale Orders) — list/filter/state/print/cancel/delete.
// Orchestrator: init, event wiring, SSE subscription, scope banner.
// Re-exports window.PbhApp (compat shim for inline onclick handlers).
// Modules: pbh-state → pbh-api → pbh-render → pbh-actions → pbh-filters → pbh-app.

(function () {
    'use strict';

    const { KPI_API } = window.PbhState;
    const { _fetch, load } = window.PbhApi;
    const PbhRender = window.PbhRender;
    const PbhActions = window.PbhActions;
    const PbhFilters = window.PbhFilters;
    const { $ } = window.PbhState;

    // Sprint 5 KPI: hiển thị banner cho NV restricted scope (giống native-orders pattern)
    async function _loadAndRenderScopeBanner() {
        try {
            const r = await _fetch(`${KPI_API}/scope`);
            const data = await r.json();
            if (!data?.success) return;
            if (data.access !== 'restricted' || !Array.isArray(data.scope) || !data.scope.length) {
                return;
            }
            const banner = document.createElement('div');
            banner.id = 'kpiScopeBannerPbh';
            banner.style.cssText =
                'background:#dbeafe;color:#1e40af;padding:8px 16px;border-bottom:1px solid #93c5fd;' +
                'font-size:13px;display:flex;align-items:center;gap:8px;';
            const summary = data.scope
                .map(
                    (s) =>
                        `<strong>${(s.campaign_name || '').replace(/[<>&]/g, '')}</strong> STT ${s.fromSTT}-${s.toSTT}`
                )
                .join(' · ');
            banner.innerHTML = `<i data-lucide="filter" style="width:14px;height:14px;"></i>
                <span>Bạn chỉ thấy PBH có nguồn từ đơn STT trong khoảng phân công: ${summary}</span>`;
            const main = document.querySelector('main, .main-content, body');
            if (main?.firstChild) main.insertBefore(banner, main.firstChild);
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.warn('[pbh] scope banner load fail:', e.message);
        }
    }

    function init() {
        if (window.lucide) lucide.createIcons();
        // Sprint 5 KPI: render scope banner cho NV restricted
        _loadAndRenderScopeBanner();
        // Phase 14: read customerId from URL search params on load
        const urlParams = new URLSearchParams(location.search);
        const urlCid = parseInt(urlParams.get('customerId'), 10);
        if (Number.isFinite(urlCid)) window.PbhState.STATE.customerId = urlCid;
        // 3W4: PbhRealtime (WS) đã gỡ — SSE bridge bên dưới là kênh realtime duy nhất
        // (trước đây WS + SSE chạy song song gây reload đôi).
        // Backend emit `web2:fast-sale-orders` + `web2:native-orders` → tự reload bảng.
        if (window.Web2SSE?.subscribe) {
            let sseTimer = null;
            const reload = (topic) => (msg) => {
                if (sseTimer) clearTimeout(sseTimer);
                sseTimer = setTimeout(() => {
                    sseTimer = null;
                    console.log('[PBH-SSE]', topic, msg.data?.action);
                    load();
                }, 500);
            };
            window.Web2SSE.subscribe('web2:fast-sale-orders', reload('fast-sale-orders'));
            window.Web2SSE.subscribe('web2:native-orders', reload('native-orders'));
        }
        $('#pbhExportCsv').addEventListener('click', PbhActions.exportCsv);
        // Bulk-confirm: bỏ — PBH state auto theo native-orders. Hide nút trong DOM nếu tồn tại.
        const bcBtn = $('#pbhBulkConfirm');
        if (bcBtn) bcBtn.style.display = 'none';
        $('#pbhBulkCancel').addEventListener('click', () =>
            PbhActions.bulkAction('bulk-cancel', 'Hủy')
        );
        $('#pbhBulkUnselect').addEventListener('click', PbhFilters.unselectAll);
        // Check-all + per-row check delegation
        $('#pbhCheckAll')?.addEventListener('change', (e) => {
            document.querySelectorAll('#pbhTbody .row-check').forEach((c) => {
                c.checked = e.target.checked;
            });
            PbhFilters.updateBulkBar();
        });
        document.addEventListener('change', (e) => {
            if (e.target.classList?.contains('row-check')) PbhFilters.updateBulkBar();
        });
        $('#pbhApply').addEventListener('click', PbhFilters.applyFilters);
        $('#pbhClear').addEventListener('click', PbhFilters.clearFilters);
        $('#pbhReload').addEventListener('click', load);
        $('#pbhSearch').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') PbhFilters.applyFilters();
        });
        $('#pbhSearchClear').addEventListener('click', () => {
            $('#pbhSearch').value = '';
            window.PbhState.STATE.search = '';
            window.PbhState.STATE.page = 1;
            load();
        });
        $('#pbhState').addEventListener('change', PbhFilters.applyFilters);
        $('#pbhLimit').addEventListener('change', PbhFilters.applyFilters);
        load();
    }

    // window.PbhApp — EXACT SAME method set as before the split. The 10 inline
    // onclick handlers in rendered HTML call window.PbhApp.X(...) → must all exist.
    window.PbhApp = {
        detail: PbhRender.detail,
        confirm: PbhActions.confirmOrder,
        cancel: PbhActions.cancelOrder,
        print: PbhActions.printOrder,
        goPage: PbhFilters.goPage,
        createDelivery: PbhActions.createDelivery,
        createRefund: PbhActions.createRefund,
        openCustomer: PbhRender.openCustomer,
        filterByCustomer: PbhFilters.filterByCustomer,
        clearCustomerFilter: PbhFilters.clearCustomerFilter,
        openHistory: PbhRender.openHistory,
    };

    // Inject CSS cho history modal (page không có file css riêng nên inline).
    PbhRender.injectHistoryCss();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
