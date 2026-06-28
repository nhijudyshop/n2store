// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2 Products — search / active filter / limit + pagination navigation.
 * [SPLIT 2026-06-18] tách từ web2-products-app.js. Namespace nội bộ
 * window.Web2ProductsCore (W). Cross-module call qua W.foo(...).
 */

(function () {
    'use strict';

    const W = (window.Web2ProductsCore = window.Web2ProductsCore || {});
    const STATE = W.STATE;
    const $ = W.$;

    // ---------- Filter ----------
    // Dropdown #filterActive 3 trạng thái (logic mới 2026-06-28):
    //   'true'     → Đang bán (activeOnly=true) — MẶC ĐỊNH, ẩn HẾT HÀNG + Tạm dừng
    //   'het_hang' → chỉ SP HẾT HÀNG (statusFilter='HET_HANG') để xem/quản lý
    //   'all'      → tất cả
    function _parseActiveFilter(val) {
        if (val === 'het_hang') return { activeOnly: false, statusFilter: 'HET_HANG' };
        if (val === 'true') return { activeOnly: true, statusFilter: null };
        return { activeOnly: false, statusFilter: null }; // 'all'
    }
    function applyFilters() {
        STATE.search = $('#filterSearch').value.trim();
        const af = _parseActiveFilter($('#filterActive').value);
        STATE.activeOnly = af.activeOnly;
        STATE.statusFilter = af.statusFilter;
        STATE.limit = parseInt($('#filterLimit').value, 10) || 200;
        STATE.page = 1;
        W.load();
    }
    function clearFilters() {
        $('#filterSearch').value = '';
        $('#filterActive').value = 'true'; // mặc định "Đang bán" — ẩn hết hàng
        $('#filterLimit').value = '200';
        STATE.search = '';
        STATE.activeOnly = true;
        STATE.statusFilter = null;
        STATE.limit = 200;
        STATE.page = 1;
        W.load();
    }

    function goPage(p) {
        const totalPages = Math.max(1, Math.ceil(STATE.total / STATE.limit));
        STATE.page = Math.min(Math.max(1, p), totalPages);
        W.load();
    }

    // Export to shared namespace.
    W.applyFilters = applyFilters;
    W.clearFilters = clearFilters;
    W.goPage = goPage;
})();
