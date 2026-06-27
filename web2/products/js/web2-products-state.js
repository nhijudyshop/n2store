// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2 Products — STATE + constants + utils + supplier/color caches.
 *
 * [SPLIT 2026-06-18] tách web2-products-app.js (2010 dòng) → 6 module:
 *   state → render → modal → actions → filters → app (orchestrator LAST).
 * Shared mutable state + helpers sống trong namespace nội bộ
 * `window.Web2ProductsCore` (KHÔNG phải public API). Public API vẫn là
 * `window.Web2ProductsApp` (re-export ở module app, byte-identical method set).
 * Cross-module call qua `W.foo(...)` thay vì bare `foo(...)` — MOVE-only.
 */

(function () {
    'use strict';

    const W = (window.Web2ProductsCore = window.Web2ProductsCore || {});

    // Proxy domain cho các fetch trực tiếp (history endpoint chưa có trong
    // Web2ProductsApi). Đưa vào hằng số để tránh hardcode rải rác.
    W.PROXY_BASE =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';

    W.STATE = {
        products: [],
        total: 0,
        page: 1,
        limit: 200,
        search: '',
        activeOnly: false, // 'all' (false) vs 'true' (active only)
        loading: false,
        editingCode: null, // null = creating, string = editing
        usage: {}, // productCode → array of order entries (from /usage endpoint)
        selectedCodes: new Set(), // P1 2026-05-30: multi-select cho bulk in tem
        // P4 cha-con 2026-06-27: SP cùng cha/cùng tên nhiều biến thể gom 1 dòng CHA
        // (expand xem CON). Set<groupKey> các nhóm đang mở. Reset khi đổi trang/search.
        expandedParents: new Set(),
    };

    W.$ = (sel) => document.querySelector(sel);
    W.tbody = () => W.$('#productsTbody');
    W.counter = () => W.$('#totalCounter');
    W.searchCount = () => W.$('#searchResultCount');
    W.pag = () => W.$('#pagination');
    W.modal = () => W.$('#productModal');

    // S6 fix 2026-06-11: escape đủ 5 ký tự (DOM textContent→innerHTML KHÔNG
    // escape quote → attribute-injection khi nhúng vào title="..."/src="...").
    W.escapeHtml = function escapeHtml(s) {
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s); // 1 nguồn
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };
    // Escape cho giá trị nhúng vào JS string literal trong inline handler
    // (onclick="fn('${...}')"): browser decode HTML entity TRƯỚC khi JS parse,
    // nên escapeHtml một mình không đủ — phải backslash-escape trước rồi mới
    // escapeHtml bọc ngoài: escapeHtml(escJs(v)).
    W.escJs = function escJs(s) {
        if (s == null) return '';
        return String(s)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/</g, '\\x3c')
            .replace(/>/g, '\\x3e')
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n');
    };
    // Chỉ render <img src> với scheme an toàn — chặn javascript:, vbscript:,
    // data:text/html… từ imageUrl do server/user nhập.
    W.safeImageUrl = function safeImageUrl(u) {
        const s = String(u || '').trim();
        return /^(https:\/\/|http:\/\/|\/|data:image\/)/i.test(s) ? s : '';
    };
    W.fmtPrice = function fmtPrice(n) {
        return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    };
    // 2026-06-16: Kho SP lưu giá VND canonical. SP nhập từ tab ngoại tệ (so-order
    // CNY/USD…) có origin_currency + origin_rate → suy ngược giá GỐC = VND/rate
    // cho tooltip hover. Trả {title, hasOrigin}; SP nhập VND (origin null/VND) → ''.
    W.originPriceHover = function originPriceHover(vnd, p) {
        const cur = p && p.originCurrency ? String(p.originCurrency).toUpperCase() : '';
        const rate = Number(p && p.originRate) || 0;
        if (!cur || cur === 'VND' || rate <= 0) return { title: '', hasOrigin: false };
        const v = (Number(vnd) || 0) / rate;
        const dec = cur === 'JPY' || cur === 'KRW' ? 0 : 2;
        const amt = v.toLocaleString('vi-VN', {
            minimumFractionDigits: dec,
            maximumFractionDigits: dec,
        });
        return {
            title: `Giá gốc: ${amt} ${cur} (nhập @ ${rate.toLocaleString('vi-VN')}₫/${cur})`,
            hasOrigin: true,
        };
    };
    W.notify = function notify(msg, type = 'info') {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type);
        else console.log(`[${type}]`, msg);
    };

    W.cssEscape = function cssEscape(s) {
        if (window.CSS?.escape) return window.CSS.escape(s);
        return String(s).replace(/[^a-zA-Z0-9_-]/g, (m) => '\\' + m);
    };

    // ---------- Supplier dropdown — NGUỒN CHUNG: Ví NCC (supplier-wallet) ----------
    // 2026-06-16: chuyển nguồn NCC từ "tab Sổ Order" sang NGUỒN DUY NHẤT
    // `Web2SuppliersCache` → GET /api/web2-supplier-wallet/suppliers (bảng
    // web2_supplier_meta = trang Ví NCC). Mọi trang Web 2.0 cần NCC dùng chung
    // cache này (so-order, supplier-debt, purchase-refund). NCC name vẫn drive
    // prefix mã SP qua Web2ProductCode.buildPrefixMap (HÀ NỘI→HN, A1→A1…).
    W._suppliersFromSoOrder = null; // (giữ tên var — đổi sẽ phải sửa nhiều call site)
    W._suppliersLoadPromise = null;

    W.loadSuppliersFromSoOrder = async function loadSuppliersFromSoOrder(force) {
        if (!force && Array.isArray(W._suppliersFromSoOrder)) return W._suppliersFromSoOrder;
        if (W._suppliersLoadPromise && !force) return W._suppliersLoadPromise;
        W._suppliersLoadPromise = (async () => {
            try {
                const cache = window.Web2SuppliersCache;
                if (!cache?.init) {
                    console.warn('[products] Web2SuppliersCache chưa load — empty supplier list');
                    return [];
                }
                await cache.init();
                if (force && cache.refresh) await cache.refresh();
                W._suppliersFromSoOrder = cache.getNames();
                return W._suppliersFromSoOrder;
            } catch (e) {
                console.warn('[products] load suppliers (Ví NCC) fail:', e.message);
                return [];
            }
        })();
        return W._suppliersLoadPromise;
    };

    // Synchronous accessor — sau khi loadSuppliersFromSoOrder() đã chạy
    W.collectExistingSuppliers = function collectExistingSuppliers() {
        return Array.isArray(W._suppliersFromSoOrder) ? W._suppliersFromSoOrder.slice() : [];
    };

    // Cache color shortmap — đọc TRỰC TIẾP từ variant.shortCode (locked tại DB)
    // Không compute client-side nữa → ổn định, không shift khi thêm biến thể mới.
    W._colorShortMapCache = null;
    W.getColorShortMap = function getColorShortMap() {
        // NGUỒN CHUNG (P5 2026-06-15): Web2VariantsCache.getColorShortMap (memoize +
        // tự invalidate khi variant đổi). Fallback inline nếu cache cũ chưa có method.
        const cache = window.Web2VariantsCache;
        if (cache?.getColorShortMap) return cache.getColorShortMap();
        if (W._colorShortMapCache) return W._colorShortMapCache;
        if (!cache?.getAll) return {};
        const map = {};
        for (const v of cache.getAll()) {
            if (!/màu/i.test(v.groupName || '')) continue;
            if (!v.shortCode) continue; // chỉ dùng locked shortcodes
            const stripped = String(v.value || '')
                .replace(/^\s*M[àáạăâ]u\s+/iu, '')
                .trim();
            const key = window.Web2ProductCode.toAsciiUpper(stripped);
            if (key) map[key] = v.shortCode;
        }
        W._colorShortMapCache = map;
        return W._colorShortMapCache;
    };
    // Reset cache fallback khi kho biến thể đổi (path không có getColorShortMap).
    if (window.Web2VariantsCache?.subscribe) {
        window.Web2VariantsCache.subscribe(() => {
            W._colorShortMapCache = null;
        });
    }
})();
