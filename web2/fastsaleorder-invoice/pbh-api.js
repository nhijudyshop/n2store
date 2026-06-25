// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// PBH API layer — auth-injected fetch + load() (fetch orders → state → render).
// Backed by /api/fast-sale-orders/* + /api/web2/kpi (Render Postgres).

(function () {
    'use strict';

    const { WORKER, KPI_API, STATE, tbody, escapeHtml } = window.PbhState;

    // Sprint 5 KPI: inject Web2Auth token vào mọi request để backend apply scope.
    function _authHeaders() {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(); // 1 nguồn
        try {
            const stored = window.Web2Auth?.getStored?.();
            if (stored?.token) return { 'x-web2-token': stored.token };
        } catch {}
        return {};
    }

    // Wrap fetch để auto-inject auth header (chỉ khi GET /load + scope endpoints).
    async function _fetch(url, opts = {}) {
        return fetch(url, {
            ...opts,
            headers: { ..._authHeaders(), ...(opts.headers || {}) },
        });
    }

    async function load() {
        const params = new URLSearchParams();
        if (STATE.search) params.set('search', STATE.search);
        if (STATE.state) params.set('state', STATE.state);
        if (STATE.customerId) params.set('customerId', String(STATE.customerId));
        params.set('page', STATE.page);
        params.set('limit', STATE.limit);
        // Initial-load skeleton: only when tbody has no real data rows yet
        // (avoid flashing skeleton over already-present data on re-render).
        if (window.Web2Skeleton && !tbody().querySelector('tr[data-number]')) {
            window.Web2Skeleton.rows(tbody(), { rows: 8, cols: 11 });
        }
        try {
            // Sprint 5 KPI: scope auto-applied backend nếu user có x-web2-token + assignments.
            const r = await _fetch(`${WORKER}/api/fast-sale-orders/load?${params}`);
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
            STATE.orders = data.orders || [];
            STATE.total = data.total || 0;
            window.PbhRender.renderRows();
            window.PbhRender.renderCounters();
            window.PbhRender.renderCustomerChip();
            window.PbhRender.renderPagination();
        } catch (e) {
            tbody().innerHTML = `<tr><td colspan="11" class="empty-row"><div class="empty-state empty-state-error"><i data-lucide="alert-triangle" class="empty-state-icon"></i><div class="empty-state-title">Lỗi tải dữ liệu</div><div class="empty-state-hint">${escapeHtml(e.message)}</div></div></td></tr>`;
            if (window.lucide) lucide.createIcons();
            console.error(e);
        }
    }

    window.PbhApi = {
        _authHeaders,
        _fetch,
        load,
    };
})();
