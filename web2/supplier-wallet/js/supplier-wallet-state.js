// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Ví NCC — state + constants + utils (shared mutable state, formatters, helpers).
//
// Đây là module NỀN: định nghĩa namespace nội bộ `window.__SW` (KHÔNG phải public
// API — chỉ để các module supplier-wallet-*.js tham chiếu nhau khi load qua nhiều
// <script> tag, không bundler). Giữ NGUYÊN window.SW_DEBUG / window.__swDebugLog
// (debug globals — byte-identical với bản gốc).

(function () {
    'use strict';

    const SW = (window.__SW = window.__SW || {});

    SW.STATUS_LABELS = {
        draft: 'Nháp',
        partial_received: 'Nhận 1 phần',
        received: 'Đã Nhận',
        cancelled: 'Đã Hủy',
    };
    SW.FALLBACK_RATES = {
        VND: 1,
        CNY: 3500,
        USD: 26000,
        EUR: 28000,
        JPY: 170,
        KRW: 18,
        THB: 720,
    };

    // ---------- Shared mutable state (1 nguồn duy nhất) ----------
    SW.walletState = null;
    SW.soOrderData = null;
    // Aggregated suppliers — derived each render. Shape:
    //   { [supplier]: { supplier, totalPurchased, purchases: [...] } }
    SW.suppliers = {};
    SW.activeSupplier = null;
    SW.detailTab = 'purchases';

    // SSE bookkeeping (shared giữa app + actions không cần, nhưng giữ chung 1 chỗ).
    SW._sseUnsubs = [];
    SW._ssePollTimer = null;
    SW._sseReloadTimer = null;

    // 2026-06-16 DEBUG (tạm): trace chuỗi render lúc vào trang (dữ liệu hiện ra
    // rồi bị thay) + thứ tự sort. Bật/tắt qua window.SW_DEBUG (mặc định ON).
    // TODO: gỡ block debug này sau khi chẩn xong (grep "SW-DEBUG").
    SW._renderSeq = 0;
    const _t0 = Date.now();
    window.SW_DEBUG = window.SW_DEBUG !== false;
    window.__swDebugLog = window.__swDebugLog || [];
    function _dbg(...a) {
        if (!window.SW_DEBUG) return;
        const tag = `[SW-DEBUG +${Date.now() - _t0}ms]`;
        console.log(tag, ...a);
        // Mirror vào window array để browser-test đọc lại sau load (console buffer
        // của Playwright session đôi khi miss log lúc reload). Xem qua DevTools là
        // console.log thường; xem qua test là window.__swDebugLog.
        try {
            window.__swDebugLog.push(
                tag + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
            );
        } catch (_) {}
    }
    SW._dbg = _dbg;

    function fmtVnd(n) {
        if (window.Web2Format) return window.Web2Format.vnd(n);
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + '₫';
    }
    // A2 (2026-06-13): 1 dòng mua được coi "đã trả ĐỦ" khi qty đã trả >= qty mua.
    // `entry` = web2_supplier_meta.returned_row_ids[rowId]: dạng mới {qty,amount,ts}
    // (object) hoặc legacy truthy (boolean true = trả đủ). Trả 1 phần (qty>0 &
    // qty<qty mua) → CHƯA đủ → dòng còn xuất hiện trong modal trả + không badge.
    //
    // ⚠ AN TOÀN với data legacy {qty:0} (C18 — fallback cũ ghi qty:0 khi thiếu
    // rowReturns): qty<=0 nghĩa là entry rác/legacy boolean-style → coi như ĐÃ TRẢ
    // ĐỦ (KHÔNG cho trả lại → tránh over-refund ví NCC). Partial return THẬT luôn
    // có qty>0 (rowReturns gửi qty thật). C18 đã chặn ghi mới {qty:0}.
    function _isRowFullyReturned(entry, orderedQty) {
        if (!entry) return false;
        if (typeof entry === 'object') {
            const q = Number(entry.qty) || 0;
            if (q <= 0) return true; // legacy/garbage {qty:0} → coi đã trả đủ (an toàn)
            return q >= (Number(orderedQty) || 0);
        }
        return true; // legacy boolean → coi như trả đủ
    }
    // Audit: tên staff ghi trả/thanh toán NCC → lưu vào transaction (kiểm tra khi sai).
    function _swBy() {
        return (
            window.Web2UserInfo?.get?.()?.userName || window.Web2UserInfo?.label?.() || '(ẩn danh)'
        );
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
        if (!m) return iso;
        return `${parseInt(m[3], 10)}/${parseInt(m[2], 10)}/${m[1]}`;
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
            return Number(tab.rate) || SW.FALLBACK_RATES[currency] || 1;
        }
        return SW.FALLBACK_RATES[currency] || 1;
    }

    // Expose utils trên namespace nội bộ.
    SW.fmtVnd = fmtVnd;
    SW._isRowFullyReturned = _isRowFullyReturned;
    SW._swBy = _swBy;
    SW.escapeHtml = escapeHtml;
    SW.fmtDateVN = fmtDateVN;
    SW.fmtTime = fmtTime;
    SW.notify = notify;
    SW.rateToVnd = rateToVnd;
})();
