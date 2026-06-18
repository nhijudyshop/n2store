// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Báo cáo công nợ NCC — filters: đọc filter từ DOM, range tháng hiện tại, set
// default date range, datalist gợi ý tên NCC (Web2SuppliersCache nguồn chung).
// MOVE-only split (2026-06-18) khỏi supplier-debt-app.js — body giữ nguyên byte.
// Cross-module qua namespace SD: escapeHtml (state).

(function () {
    'use strict';

    const SD = (window.__SupplierDebt = window.__SupplierDebt || {});
    const STATE = SD.STATE;
    const { escapeHtml } = SD;

    function readFilters() {
        STATE.filters.from = document.getElementById('sdDateFrom').value || '';
        STATE.filters.to = document.getElementById('sdDateTo').value || '';
        STATE.filters.search = document.getElementById('sdSearch').value || '';
        const chosen = document.querySelector('input[name="sdDisplay"]:checked');
        STATE.filters.display = chosen ? chosen.value : 'all';
        STATE.filters.sourceWeb2 = document.getElementById('sdSourceWeb2')?.checked ?? true;
    }

    // Default period = current month (1 → last day of month, local TZ).
    function currentMonthRange() {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const pad = (n) => String(n).padStart(2, '0');
        const lastDay = new Date(y, m + 1, 0).getDate();
        return {
            from: `${y}-${pad(m + 1)}-01`,
            to: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
        };
    }

    function setDefaultDateRange() {
        const fromEl = document.getElementById('sdDateFrom');
        const toEl = document.getElementById('sdDateTo');
        if (!fromEl || !toEl) return;
        if (!fromEl.value && !toEl.value) {
            const { from, to } = currentMonthRange();
            fromEl.value = from;
            toEl.value = to;
        }
    }

    // NCC dùng chung: gợi ý tên NCC khi tạo, lấy từ nguồn duy nhất
    // Web2SuppliersCache (Ví NCC / supplier-wallet). supplier-debt vẫn tạo NCC qua
    // POST /api/web2-supplier-wallet/suppliers (kèm mã) — CÙNG backend nên NCC tạo
    // ở đây cũng nằm trong nguồn chung; datalist chỉ để autocomplete.
    function _populateNccNameDatalist() {
        const dl = document.getElementById('sdNccNameList');
        const cache = window.Web2SuppliersCache;
        if (!dl || !cache?.init) return;
        cache
            .init()
            .then(() => {
                const names = cache.getNames ? cache.getNames() : [];
                dl.innerHTML = names
                    .map((n) => `<option value="${escapeHtml(n)}"></option>`)
                    .join('');
            })
            .catch(() => {});
    }

    // expose to namespace
    SD.readFilters = readFilters;
    SD.currentMonthRange = currentMonthRange;
    SD.setDefaultDateRange = setDefaultDateRange;
    SD._populateNccNameDatalist = _populateNccNameDatalist;
})();
