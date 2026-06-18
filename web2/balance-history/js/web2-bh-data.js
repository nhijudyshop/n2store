// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// web2-bh-data — data loading (list + stats) + SSE realtime.
// load() là choke point được gọi từ mọi module qua W2BH.load.
// =====================================================================

(function (global) {
    'use strict';

    const W2BH = global.W2BH || (global.W2BH = {});
    const { state, dom, withFallback, escapeHtml } = W2BH;

    // ----- Data loading -----
    let _seq = 0;
    async function load() {
        const my = ++_seq;
        state.loading = true;
        W2BH.renderTable();
        try {
            const params = new URLSearchParams();
            params.set('limit', String(state.pageSize));
            params.set('offset', String((state.page - 1) * state.pageSize));
            if (state.status !== 'all') params.set('status', state.status);
            if (state.search) params.set('search', state.search);
            if (state.dateFrom) params.set('since', state.dateFrom);
            if (state.dateTo) params.set('until', state.dateTo);
            const [list, stats] = await Promise.all([
                withFallback(`?${params.toString()}`),
                withFallback('/stats'),
            ]);
            if (my !== _seq) return;
            state.rows = list?.data || [];
            state.total = list?.total || 0;
            state.stats = stats?.data || {};
            state.loading = false;
            W2BH.renderStats();
            W2BH.renderTable();
            W2BH.renderPagination();
            W2BH.renderChips();
            if (window.lucide?.createIcons) window.lucide.createIcons();
        } catch (e) {
            if (my !== _seq) return;
            state.loading = false;
            state.rows = [];
            dom.tbody.innerHTML = `<tr><td colspan="5" class="w2bh-error">Lỗi tải: ${escapeHtml(e.message)}</td></tr>`;
        }
    }

    // ----- SSE realtime -----
    function setupSSE() {
        if (!window.Web2SSE?.subscribe) return;
        let timer = null;
        const reload = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                load();
            }, 800);
        };
        window.Web2SSE.subscribe('web2:wallet:*', reload);
        // GD SePay mới (kể cả chưa gán KH) → reload bảng realtime, khỏi F5.
        window.Web2SSE.subscribe('web2:balance-history', reload);
    }

    // Expose to namespace
    W2BH.load = load;
    W2BH.setupSSE = setupSSE;
})(window);
