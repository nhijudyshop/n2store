// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// PBH filters — apply/clear/search/state/limit/pagination + customer-360 filter
// + bulk selection (getSelectedNumbers / updateBulkBar / unselectAll).

(function () {
    'use strict';

    const { STATE, $ } = window.PbhState;
    const load = () => window.PbhApi.load();

    function filterByCustomer(customerId) {
        if (!customerId) return;
        STATE.customerId = Number(customerId);
        STATE.page = 1;
        // Persist in URL so reload keeps the filter
        const url = new URL(location.href);
        url.searchParams.set('customerId', String(customerId));
        history.replaceState(null, '', url.toString());
        // Close modal if open
        const modal = document.getElementById('customer360Modal');
        if (modal) modal.style.display = 'none';
        load();
    }

    function clearCustomerFilter() {
        STATE.customerId = null;
        STATE.page = 1;
        const url = new URL(location.href);
        url.searchParams.delete('customerId');
        history.replaceState(null, '', url.toString());
        load();
    }

    // -------- Bulk actions (selection) --------
    function getSelectedNumbers() {
        return Array.from(document.querySelectorAll('#pbhTbody .row-check:checked')).map(
            (c) => c.value
        );
    }
    function updateBulkBar() {
        const sel = getSelectedNumbers();
        const bar = $('#pbhBulkBar');
        if (sel.length === 0) {
            bar.style.display = 'none';
        } else {
            bar.style.display = 'flex';
            $('#pbhBulkCount').textContent = sel.length;
        }
    }
    function unselectAll() {
        document.querySelectorAll('#pbhTbody .row-check:checked').forEach((c) => {
            c.checked = false;
        });
        const ca = $('#pbhCheckAll');
        if (ca) ca.checked = false;
        updateBulkBar();
    }

    function applyFilters() {
        STATE.search = $('#pbhSearch').value.trim();
        STATE.state = $('#pbhState').value;
        STATE.limit = parseInt($('#pbhLimit').value, 10) || 200;
        STATE.page = 1;
        load();
    }
    function clearFilters() {
        $('#pbhSearch').value = '';
        $('#pbhState').value = '';
        STATE.search = '';
        STATE.state = '';
        STATE.page = 1;
        load();
    }
    function goPage(p) {
        STATE.page = Math.max(1, p);
        load();
    }

    window.PbhFilters = {
        filterByCustomer,
        clearCustomerFilter,
        getSelectedNumbers,
        updateBulkBar,
        unselectAll,
        applyFilters,
        clearFilters,
        goPage,
    };
})();
