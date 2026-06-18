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
    function applyFilters() {
        STATE.search = $('#filterSearch').value.trim();
        STATE.activeOnly = $('#filterActive').value === 'true';
        STATE.limit = parseInt($('#filterLimit').value, 10) || 200;
        STATE.page = 1;
        W.load();
    }
    function clearFilters() {
        $('#filterSearch').value = '';
        $('#filterActive').value = 'all';
        $('#filterLimit').value = '200';
        STATE.search = '';
        STATE.activeOnly = false;
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
