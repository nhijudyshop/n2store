// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2CustomerWalletApp — Ví KH dùng 100% Web 2.0 backend. (STATE module)
// =====================================================================
// Shared namespace W2CW: state + constants + helpers + DOM cache.
// Sub-modules (api / render / events / app) extend this same object.
//
// Data sources:
//   • /api/web2/wallets/*           → Postgres web2_customer_wallets (Web 2 isolated)
//   • /api/fast-sale-orders/load    → PBH "Tổng mua" (shared nghiệp vụ)
//   • /api/native-orders/load       → Đơn Web (Web 2 module, KH chưa lập PBH)
//   • SSE web2:wallet:*             → realtime credit từ SePay match auto
//
// KHÔNG dùng:
//   • Firestore web2_customer_wallet (Phase 3 deprecated — flash demo data)
//   • /api/wallet-deposits/load     (Web 1 legacy)
//   • SSE wallet:all                (Web 1 legacy)
//
// Card display:
//   Tổng mua = sum PBH (state='confirmed' không cancel)
//   Đã thu   = web2_wallet.total_deposited
//   Đã trả   = sum web2_wallet_transactions WHERE type='WITHDRAW' AND reference_type='return'
//   Còn nợ   = Tổng mua - Đã thu - Đã trả
// =====================================================================

(function (global) {
    'use strict';

    const W2CW = global.W2CW || (global.W2CW = {});

    const PROXY =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const FALLBACK =
        (window.API_CONFIG && window.API_CONFIG.WEB2_API) || 'https://web2-api-kv04.onrender.com';

    const state = {
        // Server-paged rows for current view (50/page typical, max 200)
        rows: [],
        total: 0,
        page: 1,
        pageSize: 50,
        // Local cache: { [phone]: row } — populated as user pages through.
        // Used for detail modal lookup + SSE in-place updates.
        cache: {},
        // Stats summary (aggregate across ALL customers, not just current page)
        stats: {},
        // WEB2 partner enrichment per phone (only for visible page)
        web2Partners: {},
        activePhone: null,
        detailTab: 'orders',
        sort: 'balance-desc',
        search: '',
        quickFilter: 'all', // server-side: all | debt | has_balance | paid_off | vip | bomb | warning
        loading: false,
        // Detail-only data (fetched on openDetail)
        detailOrders: [], // PBH list for active phone
    };

    // Diacritic strip (inline, no deps)
    function stripDiacritics(s) {
        if (!s) return '';
        return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    }
    function searchNormalize(s) {
        return stripDiacritics(String(s || ''))
            .toLowerCase()
            .trim();
    }

    // ─── Helpers ────────────────────────────────────────────────────
    const EXCLUDED_PBH_STATES = new Set(['cancelled', 'cancel', 'canceled', 'huy', 'hủy']);

    function fmtVnd(n) {
        if (window.Web2Format) return window.Web2Format.vnd(n); // 1 nguồn (₫)
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + '₫';
    }
    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s); // 1 nguồn
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function fmtTime(ts) {
        if (!ts) return '—';
        const d = new Date(Number(ts) || ts);
        return (
            d.toLocaleDateString('vi-VN') +
            ' ' +
            d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        );
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleDateString('vi-VN');
        } catch {
            return iso;
        }
    }
    function normPhone(p) {
        if (window.Web2PhoneUtils && window.Web2PhoneUtils.norm)
            return window.Web2PhoneUtils.norm(p);
        if (!p) return '';
        const s = String(p).replace(/\D/g, '');
        if (!s) return '';
        if (s.startsWith('84') && s.length >= 11) return '0' + s.slice(2);
        return s;
    }
    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {}
    }
    function debounce(fn, delay) {
        let t = null;
        return function () {
            const args = arguments;
            if (t) clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), delay);
        };
    }
    async function jsonFetch(url, opts) {
        const r = await fetch(url, opts);
        const ct = r.headers.get('content-type') || '';
        const body = ct.includes('json') ? await r.json() : await r.text();
        if (!r.ok) {
            throw new Error(
                (body && body.error) ||
                    (typeof body === 'string' ? body.slice(0, 200) : `HTTP ${r.status}`)
            );
        }
        return body;
    }

    // ─── DOM ────────────────────────────────────────────────────────
    const dom = {};
    function cacheDom() {
        dom.list = document.getElementById('cwList');
        dom.empty = document.getElementById('cwEmptyState');
        dom.search = document.getElementById('cwSearch');
        dom.sort = document.getElementById('cwSort');
        dom.totalCustomers = document.getElementById('cwTotalCustomers');
        dom.totalOutstanding = document.getElementById('cwTotalOutstanding');
        dom.refreshBtn = document.getElementById('cwRefreshBtn');
        dom.hardResetBtn = document.getElementById('cwHardResetBtn');
        dom.exportCsvBtn = document.getElementById('cwExportCsv');
        dom.statKh = document.getElementById('cwStatKh');
        dom.statDebt = document.getElementById('cwStatDebt');
        dom.statWallet = document.getElementById('cwStatWallet');
        dom.statPaid = document.getElementById('cwStatPaid');
        dom.chipAll = document.getElementById('cwChipAll');
        dom.chipDebt = document.getElementById('cwChipDebt');
        dom.chipBalance = document.getElementById('cwChipBalance');
        dom.chipVip = document.getElementById('cwChipVip');
        dom.chipWarn = document.getElementById('cwChipWarn');
        dom.chipBomb = document.getElementById('cwChipBomb');
        dom.chipsContainer = document.getElementById('cwChips');
        dom.detailModal = document.getElementById('cwDetailModal');
        dom.detailTitle = document.getElementById('cwDetailTitle');
        dom.detailSub = document.getElementById('cwDetailSub');
        dom.statTotal = document.getElementById('cwStatTotal');
        dom.statPaid = document.getElementById('cwStatPaid');
        dom.statReturned = document.getElementById('cwStatReturned');
        dom.statBalance = document.getElementById('cwStatBalance');
        dom.ordersBody = document.getElementById('cwOrdersBody');
        dom.historyBody = document.getElementById('cwHistoryBody');
        dom.returnBtn = document.getElementById('cwReturnBtn');
        dom.payBtn = document.getElementById('cwPayBtn');
        dom.pagination = document.getElementById('cwPagination');
        dom.pageInfo = document.getElementById('cwPageInfo');
        dom.pageButtons = document.getElementById('cwPageButtons');
        dom.pageSize = document.getElementById('cwPageSize');
    }

    // Expose shared state + constants + helpers + DOM cache on W2CW
    W2CW.PROXY = PROXY;
    W2CW.FALLBACK = FALLBACK;
    W2CW.state = state;
    W2CW.dom = dom;
    W2CW.cacheDom = cacheDom;
    W2CW.EXCLUDED_PBH_STATES = EXCLUDED_PBH_STATES;
    W2CW.stripDiacritics = stripDiacritics;
    W2CW.searchNormalize = searchNormalize;
    W2CW.fmtVnd = fmtVnd;
    W2CW.escapeHtml = escapeHtml;
    W2CW.fmtTime = fmtTime;
    W2CW.fmtDate = fmtDate;
    W2CW.normPhone = normPhone;
    W2CW.notify = notify;
    W2CW.debounce = debounce;
    W2CW.jsonFetch = jsonFetch;
})(window);
