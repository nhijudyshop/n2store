// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Tra cứu vận đơn J&T (orchestrator).
// Điều phối: load() data fetch, init() event wiring, DOMContentLoaded, debounce, SSE subscribe.
// Logic chi tiết nằm trong các module: const / api / state / render / modals / actions.
(function () {
    'use strict';

    const { $, esc, icons } = window.JtTrackingConst;
    const { api } = window.JtTrackingApi;
    const S = window.JtTrackingState;
    const R = window.JtTrackingRender;
    const M = window.JtTrackingModals;
    const A = window.JtTrackingActions;

    async function load() {
        try {
            const q = new URLSearchParams();
            if (S.state.status !== 'all') q.set('status', S.state.status);
            if (S.state.search) q.set('search', S.state.search);
            // /list + tập SĐT đã gắn thẻ (DB) song song → render đúng nút đã-gắn đa máy.
            const [j] = await Promise.all([api('/list?' + q.toString()), S.loadBcTags()]);
            S.state.list = j.data || [];
            S.state.kpi = j.kpi || {};
            R.renderKpi();
            R.renderList();
        } catch (e) {
            $('jtList').innerHTML =
                `<div class="jt-state"><h3>Lỗi tải</h3><p>${esc(e.message)}</p></div>`;
        }
    }

    // ── Wire up ─────────────────────────────────────────────────────
    function debounce(fn, ms) {
        let t;
        return (...a) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...a), ms);
        };
    }

    function init() {
        // Sidebar KHÔNG tự mount — phải gọi tay (giống các trang Báo cáo khác).
        if (window.Web2Sidebar)
            window.Web2Sidebar.mount('#web2Aside', { activeUrl: window.location.href });
        // Capture-phase — chặn TRƯỚC click row/modal:
        //  • mã đơn (data-copy) → copy.  • SĐT (data-msg-phone) → mở modal nhắn tin.
        document.addEventListener(
            'click',
            (e) => {
                const cp = e.target.closest('[data-copy]');
                if (cp) {
                    e.stopPropagation();
                    e.preventDefault();
                    R.copyText(cp.dataset.copy);
                    return;
                }
                const ph = e.target.closest('[data-msg-phone]');
                if (ph) {
                    e.stopPropagation();
                    e.preventDefault();
                    M.openMsgModal(ph.dataset.msgPhone, ph.dataset.msgName || '');
                }
            },
            true
        );
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const cp = e.target.closest?.('[data-copy]');
            if (cp) {
                e.stopPropagation();
                e.preventDefault();
                R.copyText(cp.dataset.copy);
                return;
            }
            const ph = e.target.closest?.('[data-msg-phone]');
            if (ph) {
                e.stopPropagation();
                e.preventDefault();
                M.openMsgModal(ph.dataset.msgPhone, ph.dataset.msgName || '');
            }
        });
        icons();
        $('jtQuickForm').addEventListener('submit', A.quickAdd);
        $('jtScan').addEventListener('click', A.scanZalo);
        $('jtScanHistory')?.addEventListener('click', A.scanHistory);
        $('jtPaste')?.addEventListener('click', M.openPasteModal);
        // "Làm mới tất cả" đã bỏ — trạng thái tự cập nhật khi mở trang (A.startAutoRefresh).
        $('jtKpis').addEventListener('click', (e) => {
            const k = e.target.closest('.jt-kpi');
            if (!k) return;
            S.state.status = k.dataset.st === 'total' ? 'all' : k.dataset.st;
            load();
        });
        $('jtSearch').addEventListener(
            'input',
            debounce((e) => {
                S.state.search = e.target.value.trim();
                load();
            }, 350)
        );
        $('jtList').addEventListener('click', (e) => {
            const ab = e.target.closest('[data-act]');
            if (ab) {
                e.stopPropagation();
                if (ab.dataset.act === 'chat') M.openChat(ab.dataset.conv, ab.dataset.billcode);
                else if (ab.dataset.act === 'tag') A.tagPancake(ab.dataset.phone, ab);
                else if (ab.dataset.act === 'history')
                    window.Web2AuditLog?.openRecord?.({
                        entity: 'jt-tracking',
                        entityId: ab.dataset.code,
                        title: 'Lịch sử vận đơn: ' + ab.dataset.code,
                    });
                else A.rowAction(ab.dataset.act, ab.dataset.code);
                return;
            }
            const row = e.target.closest('[data-open]');
            if (row) R.openTimeline(row.dataset.open);
        });
        $('jtList').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const row = e.target.closest('[data-open]');
                if (row) R.openTimeline(row.dataset.open);
            }
        });

        // SSE realtime: mã được scan/track/xoá ở tab/máy khác → reload (debounce)
        const reload = debounce(load, 600);
        if (window.Web2SSE?.subscribe) window.Web2SSE.subscribe('web2:jt-tracking', reload);

        load();
        // Tự cập nhật trạng thái J&T khi MỞ trang (nhỏ giọt, nhẹ J&T) — thay nút "Làm mới tất cả".
        A.startAutoRefresh?.();
    }

    // Public surface (orchestrator) — gom các entrypoint chính qua 1 namespace để
    // code ngoài / inline gọi được nếu cần. Không bắt buộc nhưng giữ ổn định.
    window.JtTrackingApp = { load, init, debounce };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
