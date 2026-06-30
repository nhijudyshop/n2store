// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Báo cáo công nợ NCC — STATE + constants + pure helpers.
// MOVE-only split (2026-06-18) khỏi supplier-debt-app.js: nội dung hàm giữ
// nguyên byte, chỉ gom vào namespace nội bộ window.__SupplierDebt (cầu nối giữa
// các module <script>). KHÔNG phải public API — file vẫn không expose global nào
// dùng bên ngoài (onclick/inline → 0).

(function () {
    'use strict';

    const SD = (window.__SupplierDebt = window.__SupplierDebt || {});

    // GMT+7 (quy tắc 10): bucket/format NGÀY luôn theo Asia/Ho_Chi_Minh —
    // toISOString() là UTC, giao dịch 00:00-07:00 VN rơi sai kỳ báo cáo.
    const _vnDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    function vnDate(tsOrDate) {
        const d = tsOrDate instanceof Date ? tsOrDate : new Date(Number(tsOrDate) || tsOrDate);
        return Number.isNaN(d.getTime()) ? '' : _vnDateFmt.format(d);
    }

    const FALLBACK_RATES = {
        VND: 1,
        CNY: 3500,
        USD: 26000,
        EUR: 28000,
        JPY: 170,
        KRW: 18,
        THB: 720,
    };

    const STATE = {
        soOrderData: null,
        walletData: null,
        suppliersList: [], // [{ name, code, note, createdAt }] từ server /state (id cũ bỏ — không nơi nào dùng)
        rows: [], // aggregated supplier rows after filter
        sortField: 'code',
        sortDir: 'asc',
        page: 1,
        pageSize: 50,
        filters: {
            from: '', // yyyy-mm-dd
            to: '',
            search: '',
            display: 'all', // 'all' | 'endnonzero'
            sourceWeb2: true,
        },
        expanded: new Set(), // expanded supplier names
        detailTabs: new Map(), // supplier → active tab name (default 'congno')
    };

    // ---------- helpers ----------
    function fmtVnd(n) {
        if (window.Web2Format) return window.Web2Format.vnd(n);
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + '₫';
    }
    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function fmtDateVN(iso) {
        if (!iso) return '—';
        const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${parseInt(m[3], 10)}/${parseInt(m[2], 10)}/${m[1]}` : iso;
    }
    function fmtTime(ts) {
        if (!ts) return '—';
        const d = new Date(Number(ts));
        return (
            d.toLocaleDateString('vi-VN') +
            ' ' +
            d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        );
    }
    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {
            /* ignore */
        }
    }
    function rateToVnd(currency, tab) {
        if (!currency || currency === 'VND') return 1;
        if (tab && tab.currency === currency) {
            return Number(tab.rate) || FALLBACK_RATES[currency] || 1;
        }
        return FALLBACK_RATES[currency] || 1;
    }
    function isoToTs(iso) {
        if (!iso) return 0;
        const t = Date.parse(iso);
        return Number.isFinite(t) ? t : 0;
    }
    function isInPeriod(date, fromIso, toIso) {
        if (!date) return false;
        const d = String(date).slice(0, 10);
        if (fromIso && d < fromIso) return false;
        if (toIso && d > toIso) return false;
        return true;
    }
    function isBefore(date, fromIso) {
        if (!fromIso) return false;
        if (!date) return false;
        return String(date).slice(0, 10) < fromIso;
    }

    function cssAttrEscape(s) {
        return String(s || '').replace(/(["\\])/g, '\\$1');
    }

    function csvEscape(s) {
        let str = String(s == null ? '' : s);
        // MEDIUM-cleanup (2026-06-13): chống CSV formula injection — tên NCC/ghi chú do user nhập;
        // cell bắt đầu = + - @ \t \r → Excel/Sheets thực thi như công thức. Prefix nháy đơn để vô hiệu.
        if (/^[=+\-@\t\r]/.test(str.trimStart())) str = "'" + str;
        if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
        return str;
    }

    // expose to namespace
    SD.FALLBACK_RATES = FALLBACK_RATES;
    SD.STATE = STATE;
    SD.vnDate = vnDate;
    SD.fmtVnd = fmtVnd;
    SD.escapeHtml = escapeHtml;
    SD.fmtDateVN = fmtDateVN;
    SD.fmtTime = fmtTime;
    SD.notify = notify;
    SD.rateToVnd = rateToVnd;
    SD.isoToTs = isoToTs;
    SD.isInPeriod = isInPeriod;
    SD.isBefore = isBefore;
    SD.cssAttrEscape = cssAttrEscape;
    SD.csvEscape = csvEscape;
})();
