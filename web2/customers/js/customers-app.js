// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Kho KH warehouse UI. warehouse riêng.
// =====================================================================
// Kho Khách Hàng Web 2.0 (warehouse) — ORCHESTRATOR: load/init/SSE.
// File điều phối CUỐI: gọi bind() (events) + load() (fetch+render) +
// subscribeSse() (realtime web2:customers). State/utils/render/detail/
// events nằm ở customers-state/render/detail/events.js (load TRƯỚC qua
// thứ tự <script>). Nguyên tắc warehouse: 1 SĐT (10 số) = 1 KH (phone
// UNIQUE). 1 KH có thể nhiều FB account. Đọc/ghi /api/web2/customers/*
// ĐỘC LẬP. UI-first qua Web2Optimistic.
// =====================================================================

(function () {
    'use strict';

    const NS = (window.__wcApp = window.__wcApp || {});
    const { state, $, esc } = NS;

    // ─── Load + render ──────────────────────────────────────────────────
    async function load() {
        if (state.loading) return;
        state.loading = true;
        // TASK 5: show loading indicator in toolbar
        const loadingEl = document.getElementById('wcLoadingIndicator');
        if (loadingEl) loadingEl.hidden = false;
        const body = $('#wcTableBody');
        // Skeleton rows only on the INITIAL load (no real data rendered yet).
        if (body && !(state.rows && state.rows.length)) {
            if (window.Web2Skeleton) {
                window.Web2Skeleton.rows(body, { rows: 9, cols: 8 });
            } else {
                body.innerHTML = `<tr><td colspan="8"><div class="wc-loading">Đang tải…</div></td></tr>`;
            }
        }
        try {
            const res = await window.CustomersApi.list({
                search: state.search,
                status: state.status,
                source: state.source,
                page: state.page,
                limit: state.limit,
            });
            if (!res.success) throw new Error(res.error || 'Lỗi tải');
            state.rows = res.data || [];
            state.total = res.total || 0;
            NS.renderTable();
            NS.renderPagination();
            $('#wcStatAll').textContent = state.total.toLocaleString('vi-VN');
            // Không có trong kho + có từ khoá tìm → fallback Pancake.
            if (state.search && state.total === 0) {
                NS.runPancakeFallback(state.search);
            } else {
                NS.hidePancakeResults();
            }
        } catch (e) {
            body.innerHTML = `<tr><td colspan="8"><div class="wc-empty">✗ ${esc(e.message)}</div></td></tr>`;
        } finally {
            state.loading = false;
            // TASK 5: hide loading indicator
            if (loadingEl) loadingEl.hidden = true;
        }
    }

    function scheduleReload() {
        clearTimeout(NS._reloadTimer);
        NS._reloadTimer = setTimeout(load, 500);
    }

    // ─── SSE realtime ───────────────────────────────────────────────────
    function subscribeSse() {
        if (!window.Web2SSE?.subscribe) return;
        NS._sseUnsub = window.Web2SSE.subscribe('web2:customers', () => scheduleReload());
    }

    // ─── Init ───────────────────────────────────────────────────────────
    function init() {
        NS.bind();
        // Deep-link: ?phone= / ?q= → prefill search + filter NGAY (mở thẻ KH từ
        // live-chat, Đơn Web…). Phải set TRƯỚC load() để fetch đúng từ khoá.
        try {
            const sp = new URLSearchParams(window.location.search);
            const q = (sp.get('phone') || sp.get('q') || '').trim();
            if (q) {
                state.search = q;
                const input = document.getElementById('wcSearchInput');
                if (input) input.value = q;
            }
        } catch (_) {
            /* ignore */
        }
        load();
        subscribeSse();
    }

    // Expose cho các module con gọi reload sau mutation (detail/events) + SSE.
    NS.load = load;
    NS.scheduleReload = scheduleReload;
    NS.subscribeSse = subscribeSse;
    NS.init = init;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.addEventListener('beforeunload', () => {
        if (typeof NS._sseUnsub === 'function') NS._sseUnsub();
    });
})();
