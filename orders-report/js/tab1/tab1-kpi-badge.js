// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   TAB1 KPI BADGE — render badge "KPI" inline trong cột STT cho đơn có
   ít nhất 1 SP đã đánh dấu KPI (qua KpiSaleFlagStore).

   Lifecycle:
   1. createRowHTML() gọi renderKpiBadge(orderCode) lúc render row.
   2. Sau khi allData load xong → preloadKpiBadges() bulk fetch → batch
      apply badge cho tất cả row đã trong DOM (không cần full re-render).
   3. Lắng nghe event 'kpi-sale-flag-changed' → surgical update badge
      cho row có orderCode đó.
   ===================================================== */
(function () {
    'use strict';

    /**
     * Render badge HTML khi đơn có KPI flag, '' khi không.
     * Sync read — caller (createRowHTML) chỉ cần gọi inline.
     * Caller phải đảm bảo `KpiSaleFlagStore.loadKpiOrderCodes()` đã chạy
     * trước (hoặc badge sẽ trống lần render đầu, batch apply sau khi load).
     * @param {string} orderCode
     * @returns {string} HTML
     */
    function renderKpiBadge(orderCode) {
        if (!orderCode || !window.KpiSaleFlagStore?.hasKpiFlag) return '';
        if (!window.KpiSaleFlagStore.hasKpiFlag(orderCode)) return '';
        return _buildBadgeHtml();
    }

    function _buildBadgeHtml() {
        return (
            '<span class="kpi-badge" title="Đơn có sản phẩm đã đánh dấu KPI" ' +
            'style="display:inline-flex;align-items:center;gap:2px;' +
            'background:linear-gradient(135deg,#fbbf24 0%,#f59e0b 100%);' +
            'color:#78350f;font-size:9px;font-weight:700;padding:1px 5px;' +
            'border-radius:4px;line-height:1.2;letter-spacing:0.3px;' +
            'box-shadow:0 1px 2px rgba(245,158,11,0.3);">' +
            '<i class="fas fa-star" style="font-size:7px;"></i>KPI</span>'
        );
    }

    /**
     * Bulk pre-load KPI flags cho tất cả orderCodes đang có trong allData.
     * Sau khi load xong, batch apply badge vào DOM (chèn span vào STT cell)
     * cho row chưa có badge — không phải full re-render bảng.
     */
    async function preloadKpiBadges() {
        if (!window.KpiSaleFlagStore?.loadKpiOrderCodes) return;
        const orders = window.allData || [];
        if (orders.length === 0) return;
        const codes = orders.map((o) => o.Code).filter(Boolean);
        try {
            await window.KpiSaleFlagStore.loadKpiOrderCodes(codes);
        } catch (e) {
            console.warn('[KPI-BADGE] preload failed:', e?.message);
            return;
        }
        // Apply badge to existing rows in DOM
        _refreshAllBadgesInDom();
    }

    /**
     * Surgical update: re-paint KPI badge cho mọi row trong DOM hiện tại.
     * Idempotent — đã có badge & vẫn flagged → no-op; flagged mới → insert;
     * không flag → remove badge cũ.
     */
    function _refreshAllBadgesInDom() {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        const rows = tbody.querySelectorAll('tr[data-order-id]');
        rows.forEach((row) => {
            const orderId = row.dataset.orderId;
            const order =
                window.OrderStore?.get?.(orderId) ||
                (window.allData || []).find((o) => o.Id === orderId);
            if (!order?.Code) return;
            _applyBadgeToRow(row, order.Code);
        });
    }

    /**
     * Apply badge state cho 1 row dựa vào current flag state.
     * @param {HTMLElement} row
     * @param {string} orderCode
     */
    function _applyBadgeToRow(row, orderCode) {
        const sttCell = row.querySelector('td[data-column="stt"] > div');
        if (!sttCell) return;
        const existing = sttCell.querySelector('.kpi-badge');
        const shouldShow = window.KpiSaleFlagStore?.hasKpiFlag?.(orderCode) === true;

        if (shouldShow && !existing) {
            const tmp = document.createElement('span');
            tmp.innerHTML = _buildBadgeHtml();
            const badge = tmp.firstElementChild;
            if (badge) sttCell.appendChild(badge);
        } else if (!shouldShow && existing) {
            existing.remove();
        }
    }

    /**
     * Surgical update cho 1 orderCode (gọi từ event handler).
     * @param {string} orderCode
     */
    function refreshBadgeForOrder(orderCode) {
        if (!orderCode) return;
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        // Find row by orderCode — match through allData mapping orderCode → orderId.
        const order = (window.allData || []).find((o) => String(o.Code) === String(orderCode));
        if (!order?.Id) return;
        const row = tbody.querySelector(`tr[data-order-id="${order.Id}"]`);
        if (!row) return; // Row hidden by filter — sẽ được render lại nếu user filter "Có KPI"
        _applyBadgeToRow(row, orderCode);
    }

    // ───────────────────────────────────────────────────────────────────
    // Event wiring
    // ───────────────────────────────────────────────────────────────────

    // Toggle KPI flag (chat / edit modal) → surgical update badge cho row đó.
    window.addEventListener('kpi-sale-flag-changed', (ev) => {
        const orderCode = ev.detail?.orderCode;
        if (orderCode) refreshBadgeForOrder(orderCode);
    });

    // Sau khi bảng render lần đầu (allData load xong) → preload + batch apply.
    // Hook vào sự kiện custom mà tab1-search/table có thể fire, hoặc đơn giản
    // poll allData length stable → trigger 1 lần.
    let _preloadDone = false;
    function _maybePreload() {
        if (_preloadDone) return;
        const len = window.allData?.length || 0;
        if (len === 0) return;
        _preloadDone = true;
        preloadKpiBadges();
    }

    // Poll mỗi 500ms × 30 lần (15s) chờ allData load
    let attempts = 0;
    const pollInterval = setInterval(() => {
        attempts++;
        _maybePreload();
        if (_preloadDone || attempts >= 30) clearInterval(pollInterval);
    }, 500);

    // Re-preload sau mỗi performTableSearch (để pickup row mới chưa có badge).
    // Wrap minimal — không full re-fetch, chỉ batch apply từ cache hiện tại.
    if (typeof window.performTableSearch === 'function') {
        const orig = window.performTableSearch;
        if (!window.__kpiBadgeWrappedSearch) {
            window.performTableSearch = function (...args) {
                const ret = orig.apply(this, args);
                // Defer DOM apply 1 frame để chờ renderTable xong.
                setTimeout(_refreshAllBadgesInDom, 50);
                return ret;
            };
            window.__kpiBadgeWrappedSearch = true;
        }
    } else {
        // performTableSearch chưa load → wrap khi sẵn sàng
        const wrapInterval = setInterval(() => {
            if (
                typeof window.performTableSearch === 'function' &&
                !window.__kpiBadgeWrappedSearch
            ) {
                const orig = window.performTableSearch;
                window.performTableSearch = function (...args) {
                    const ret = orig.apply(this, args);
                    setTimeout(_refreshAllBadgesInDom, 50);
                    return ret;
                };
                window.__kpiBadgeWrappedSearch = true;
                clearInterval(wrapInterval);
            }
        }, 200);
        setTimeout(() => clearInterval(wrapInterval), 10000);
    }

    // Public API
    window.renderKpiBadge = renderKpiBadge;
    window.preloadKpiBadges = preloadKpiBadges;
    window.refreshKpiBadgeForOrder = refreshBadgeForOrder;
})();
