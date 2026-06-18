// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — currency/format + small helpers (fmtVnd, fmtCurrency, toVnd, fromVnd,
// escapeHtml, notify, activeColVis). MOVE-only từ so-order-app.js.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    // ---------- helpers ----------

    SO.fmtVnd = function fmtVnd(n) {
        const v = Math.round(Number(n) || 0);
        return v.toLocaleString('vi-VN') + '₫';
    };

    SO.fmtCurrency = function fmtCurrency(n, currency) {
        const v = Number(n) || 0;
        if (currency === 'VND') return Math.round(v).toLocaleString('vi-VN') + '₫';
        // Plain decimal with currency suffix for FX
        const decimals = currency === 'JPY' || currency === 'KRW' ? 0 : 2;
        return (
            v.toLocaleString('vi-VN', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            }) +
            ' ' +
            currency
        );
    };

    SO.toVnd = function toVnd(amount, tab) {
        return Math.round((Number(amount) || 0) * (Number(tab.rate) || 1));
    };

    // Quy đổi 1 giá VND (canonical từ Kho SP) → tiền của tab hiện hành.
    // Kho SP là NGUỒN DUY NHẤT, lưu giá VND; khi kéo SP vào dòng đơn ở tab có
    // currency X rate R → giá tab = VND ÷ R. Tab VND (rate 1) giữ nguyên.
    // Làm tròn: VND → integer; JPY/KRW → 0 lẻ; ngoại tệ khác → 2 lẻ (khớp fmtCurrency).
    SO.fromVnd = function fromVnd(vnd, tab) {
        const v = Number(vnd) || 0;
        const rate = Number(tab && tab.rate) || 1;
        if (!tab || tab.currency === 'VND' || rate === 1) return Math.round(v);
        const conv = v / rate;
        const dec = tab.currency === 'JPY' || tab.currency === 'KRW' ? 0 : 2;
        const f = Math.pow(10, dec);
        return Math.round(conv * f) / f;
    };

    SO.escapeHtml = function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    SO.notify = function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {
            /* ignore */
        }
    };

    // Per-tab column visibility helper. Active tab's settings are
    // what every renderer reads from.
    SO.activeColVis = function activeColVis() {
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        return window.SoOrderStorage.getColumnVisibility(tab);
    };

    // formatDateVN sống ở format module (dùng rộng rãi bởi render/receive).
    SO.formatDateVN = function formatDateVN(iso) {
        // Accept YYYY-MM-DD → D/M/YYYY
        if (!iso) return '';
        const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return iso;
        return `${parseInt(m[3], 10)}/${parseInt(m[2], 10)}/${m[1]}`;
    };

    // currencyToVndRate + FALLBACK_RATES (dùng cho contract amount hint).
    SO.FALLBACK_RATES = {
        VND: 1,
        CNY: 3500,
        USD: 26000,
        EUR: 28000,
        JPY: 170,
        KRW: 18,
        THB: 720,
    };
    SO.currencyToVndRate = function currencyToVndRate(currency, tab) {
        if (!currency || currency === 'VND') return 1;
        if (tab && tab.currency === currency)
            return Number(tab.rate) || SO.FALLBACK_RATES[currency] || 1;
        return SO.FALLBACK_RATES[currency] || 1;
    };

    // pushSync — fan a save back to Firestore after every local mutation.
    // Sync layer's own echo-guard handles re-entrance. (dùng ở mọi module mutation.)
    SO.pushSync = function pushSync() {
        window.SoOrderStorage.Sync?.pushToFirestore?.(SO.state);
    };
})();
