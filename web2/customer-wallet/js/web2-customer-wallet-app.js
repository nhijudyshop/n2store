// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2CustomerWalletApp — Orchestrator (app entrypoint).
// load() dispatcher + refreshSinglePhone + hardReset + SSE + init.
// Composes modules: state → api → render → events (loaded before this).
// Re-exports the SAME public API on window.Web2CustomerWalletApp.
//
// Full module/data docs: see web2-customer-wallet-state.js header.
// =====================================================================

(function (global) {
    'use strict';

    const W2CW = global.W2CW || (global.W2CW = {});
    const { state, dom, normPhone, notify, escapeHtml, debounce } = W2CW;
    const api = W2CW.api;
    const render = W2CW.render;
    const events = W2CW.events;

    // ─── Main load (WEB2 primary + Web 2.0 overlay) ──────────────────
    // V2 architecture (2026-05-30):
    //   1. Source primary = PartnerCustomerApi.list (WEB2 Partner OData)
    //   2. Cho phones page hiện tại → POST /overlay-by-phones lấy wallet/debt
    //   3. Merge: WEB2 partner data + overlay → state.rows
    //   4. Client-side filter cho 'debt' / 'has_balance' (chỉ trên page)
    //   5. Stats vẫn từ /stats endpoint (web2 aggregate, có thể khác total
    //      nhưng vẫn hữu ích cho summary)
    let _loadSeq = 0;
    async function load() {
        const mySeq = ++_loadSeq;
        state.loading = true;
        render.renderList();
        try {
            // Hybrid: wallet-focused filter → /aggregate web2-only.
            // Có thể fetch debt/has_balance globally (KH có web2 activity).
            if (
                state.quickFilter === 'debt' ||
                state.quickFilter === 'has_balance' ||
                state.quickFilter === 'paid_off'
            ) {
                const aggResult = await api.fetchAggregateWeb2Only({
                    limit: state.pageSize,
                    offset: (state.page - 1) * state.pageSize,
                    sort: state.sort,
                    filter: state.quickFilter,
                    search: state.search,
                });
                if (mySeq !== _loadSeq) return;
                const statsResult = await api.fetchAggregateStats().catch(() => ({
                    data: state.stats,
                }));
                state.rows = (aggResult?.data || []).map((r) => ({
                    ...r,
                    web2Status: 'Normal',
                    web2Active: true,
                }));
                state.total = aggResult?.total || 0;
                state.stats = statsResult?.data || {};
                for (const r of state.rows) state.cache[r.phone] = r;
                state.loading = false;
                render.renderList();
                render.enrichWeb2ForCurrentPage().catch(() => {});
                return;
            }

            // WEB2-primary mode: list toàn bộ WEB2 customers + overlay web2 data
            const web2Opts = {
                top: state.pageSize,
                skip: (state.page - 1) * state.pageSize,
                orderby: 'DateCreated desc',
            };
            if (state.search) web2Opts.search = state.search;
            if (state.quickFilter === 'vip') web2Opts.status = 'VIP';
            else if (state.quickFilter === 'warning') web2Opts.status = 'Warning';
            // 1D FIX (2026-06-12): kho web2_customers dùng enum 'Bom' (không phải
            // 'BomHang' legacy) — giá trị cũ exact-match 0 KH, chip luôn rỗng.
            else if (state.quickFilter === 'bomb') web2Opts.status = 'Bom';

            const web2Result = await window.PartnerCustomerApi.list(web2Opts);
            if (mySeq !== _loadSeq) return;
            const partners = web2Result?.value || [];
            const web2Total = web2Result?.count || partners.length;

            // 1D FIX (2026-06-12): dùng normPhone (84xxx → 0xxx) — ví server lưu
            // '0xxxxxxxxx', gửi raw '84...' overlay không match → KH hiện ví/nợ = 0 sai.
            const phones = partners
                .map((p) => normPhone(p.Phone || p.Mobile || ''))
                .filter((p) => p.length >= 9 && p.length <= 12);

            // Parallel: overlay + stats
            const [overlayResult, statsResult] = await Promise.all([
                phones.length > 0
                    ? api.fetchOverlay(phones).catch(() => ({ data: [] }))
                    : Promise.resolve({ data: [] }),
                api.fetchAggregateStats().catch(() => ({ data: state.stats })),
            ]);
            if (mySeq !== _loadSeq) return;

            const overlayMap = new Map();
            for (const o of overlayResult?.data || []) overlayMap.set(o.phone, o);

            // Merge WEB2 + overlay
            const merged = partners.map((p) => {
                const phone = normPhone(p.Phone || p.Mobile || ''); // key merge cùng chuẩn overlay
                const o = overlayMap.get(phone) || {};
                return {
                    phone,
                    name: p.Name || phone || '(không tên)',
                    customerId: p.Id,
                    web2Status: p.Status || 'Normal',
                    web2Active: p.Active !== false,
                    totalPurchased: o.totalPurchased || 0,
                    paidAmount: o.totalDeposited || 0,
                    returnedAmount: o.totalReturned || 0,
                    balance: o.balance || 0,
                    walletBalance: o.walletBalance || 0,
                    totalDeposited: o.totalDeposited || 0,
                    totalWithdrawn: o.totalWithdrawn || 0,
                    pbhCount: o.pbhCount || 0,
                    nativeCount: o.nativeCount || 0,
                };
            });

            // Client-side wallet filter (chỉ áp page hiện tại)
            let rows = merged;
            if (state.quickFilter === 'debt') {
                rows = rows.filter((r) => r.balance > 0);
            } else if (state.quickFilter === 'has_balance') {
                rows = rows.filter((r) => r.walletBalance > 0);
            }

            // Client-side sort cho wallet-related (WEB2 đã sort theo DateCreated)
            if (state.sort === 'balance-desc') {
                rows.sort((a, b) => b.balance - a.balance);
            } else if (state.sort === 'balance-asc') {
                rows.sort((a, b) => a.balance - b.balance);
            } else if (state.sort === 'wallet-desc') {
                rows.sort((a, b) => b.walletBalance - a.walletBalance);
            } else if (state.sort === 'total-desc') {
                rows.sort((a, b) => b.totalPurchased - a.totalPurchased);
            } else if (state.sort === 'paid-desc') {
                rows.sort((a, b) => b.paidAmount - a.paidAmount);
            } else if (state.sort === 'name-asc') {
                rows.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
            }

            state.rows = rows;
            state.total = web2Total;
            state.stats = statsResult?.data || {};

            // Cache rows + web2Partners cho detail modal & QR
            for (const p of partners) {
                const phone = String(p.Phone || p.Mobile || '').replace(/\D/g, '');
                if (phone) state.web2Partners[phone] = p;
            }
            for (const r of state.rows) state.cache[r.phone] = r;

            state.loading = false;
            render.renderList();
        } catch (e) {
            if (mySeq !== _loadSeq) return;
            state.loading = false;
            state.rows = [];
            console.error('[CW4] load fail:', e.message);
            dom.list.innerHTML = `<div class="cw-error">Lỗi tải: ${escapeHtml(e.message)}</div>`;
            notify('Lỗi tải dữ liệu: ' + e.message, 'error');
        }
    }

    // ─── Refresh single wallet (SSE) ────────────────────────────────
    // For SSE deposit events: just re-fetch the current page so amounts
    // stay consistent (server-side aggregate). Cheap (~50 rows).
    const _reloadOnSse = debounce(() => load(), 800);
    async function refreshSinglePhone(phone) {
        if (!phone) return;
        // Trigger debounced page reload — server returns fresh aggregates.
        _reloadOnSse();
        // If detail modal open for this phone, update amount display from
        // single-wallet lookup (faster than full reload for modal).
        if (state.activePhone === phone && !dom.detailModal.hidden) {
            try {
                const w = await window.Web2WalletApi.getWallet(phone);
                const c = state.cache[phone];
                if (w && c) {
                    c.walletBalance = Number(w.balance || 0);
                    c.totalDeposited = Number(w.total_deposited || 0);
                    c.totalWithdrawn = Number(w.total_withdrawn || 0);
                    c.paidAmount = c.totalDeposited;
                    c.balance = (c.totalPurchased || 0) - c.paidAmount - (c.returnedAmount || 0);
                    dom.statPaid.textContent = W2CW.fmtVnd(c.paidAmount);
                    dom.statBalance.textContent = W2CW.fmtVnd(c.balance);
                    render.renderDetailExtras(phone);
                }
            } catch (e) {
                console.warn('[CW4] refreshSinglePhone modal fail:', e.message);
            }
        }
    }

    // ─── Hard reset ─────────────────────────────────────────────────
    async function hardReset() {
        if (
            !(await Popup.danger(
                'Xoá cache localStorage?\n• Xoá toàn bộ dữ liệu cache trên trình duyệt\n• Tải lại dữ liệu mới nhất từ server (/api/web2/*)\n\n⚠ Chỉ cache trình duyệt bị xoá — dữ liệu trên server không bị ảnh hưởng.',
                { okText: 'Xoá cache' }
            ))
        )
            return;
        try {
            localStorage.removeItem('customerWallet_v1');
            localStorage.removeItem('customerWallet_v2');
            localStorage.removeItem('web2CustomerWallet');
            state.rows = [];
            state.total = 0;
            state.page = 1;
            state.cache = {};
            state.web2Partners = {};
            render.renderList();
            notify('Đã clear cache. Đang reload từ Web 2.0…', 'info');
            await load();
            notify('Reload xong từ /api/web2/*', 'success');
        } catch (e) {
            notify('Lỗi hard reset: ' + e.message, 'error');
        }
    }

    // ─── SSE realtime ───────────────────────────────────────────────
    let _sseUnsub = null;
    function setupSSE() {
        if (!window.Web2SSE?.subscribe) return;
        // web2:wallet:* — wildcard cho mọi update từ Web 2.0 wallet service
        _sseUnsub = window.Web2SSE.subscribe('web2:wallet:*', (msg) => {
            // 1D FIX (2026-06-12): payload đã strip PII từ S5 (chỉ {action, phone, ts})
            // — đọc msg.data.transaction.* luôn undefined nên toast cũ chết im lặng.
            // Toast generic + re-fetch số dư thật qua refreshSinglePhone.
            const phone = msg?.data?.phone;
            if (!phone) return;
            console.log('[CW4-SSE] web2:wallet:update', phone, msg?.data?.action);
            refreshSinglePhone(phone).catch(() => {});
            if (msg?.data?.action === 'update' || msg?.data?.action === 'manual-deposit') {
                notify(`💳 Ví Web 2.0 của ${phone} vừa cập nhật`, 'info');
            }
        });
        // Also subscribe to PBH changes (web2:fast-sale-orders → reload list)
        const reloadDebounced = debounce(() => load(), 1000);
        window.Web2SSE.subscribe('web2:fast-sale-orders', () => reloadDebounced());
        window.Web2SSE.subscribe('web2:native-orders', () => reloadDebounced());
    }

    // Expose load/hardReset on W2CW BEFORE wireUi() reads them in init()
    W2CW.load = load;
    W2CW.hardReset = hardReset;
    W2CW.refreshSinglePhone = refreshSinglePhone;
    W2CW.setupSSE = setupSSE;

    // ─── Init ───────────────────────────────────────────────────────
    async function init() {
        W2CW.cacheDom();
        events.wireUi();
        await load();
        setupSSE();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.Web2CustomerWalletApp = { load, hardReset, refreshSinglePhone, state };
})(window);
