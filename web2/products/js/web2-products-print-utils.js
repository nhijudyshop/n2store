// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2ProductsPrint — In tem mã vạch (layout chuẩn nội bộ Web 2.0).
 * [SPLIT 2026-06-18] Tách từ web2-products-print.js (1293 dòng) → 5 module nhỏ.
 *   Module này: BASE/UTILS — namespace W2PP, shared state, constants (paper/print
 *   types), escapeHtml / stripBrackets / formatPrice / notify / auth helper.
 *   Source-of-truth cho cross-module functions = window.W2PP.
 *
 * Layout tem (visual + structure, khổ giấy hardcoded theo máy in shop):
 *   - label sheet CSS (vertical: name → barcode → code → price)
 *   - bản 2-col (code+price | barcode)
 *   - modal UI + dynamic margins
 *   - 3 paper presets (khổ giấy in, hardcoded — KHÔNG gọi API ngoài)
 *
 * Barcode: JsBarcode CDN (jsdelivr) render Code128 SVG client-side. Code128 là
 *   chuẩn ISO/IEC 15417 → bars/spaces pattern ổn định cho cùng input.
 *   Print size 25mm wide × 25px tall.
 *   KHÔNG gọi API ngoài — đảm bảo Web 2.0 hoàn toàn độc lập.
 *
 * Strip-down từ purchase-orders/js/lib/barcode-label-dialog.js (1504 dòng):
 *   - BỎ toàn bộ lookup/template/print qua API ngoài
 *   - GIỮ visual + local HTML render path
 *
 * Font: Helvetica Neue/Arial 13px (modal), Arial (print labels) — font tem mặc
 * định, KHÔNG dùng Inter (web2 dùng Inter cho UI khác, riêng print giữ font tem).
 */
(function () {
    'use strict';

    const W2PP = (window.W2PP = window.W2PP || {});
    // Shared mutable state (modal overlay tham chiếu chung giữa modal module).
    W2PP._state = W2PP._state || { overlay: null };

    function _w2Auth(extra) {
        if (window.Web2Auth && window.Web2Auth.authHeaders)
            return window.Web2Auth.authHeaders(extra || {});
        var h = Object.assign({}, extra || {});
        try {
            var t = JSON.parse(localStorage.getItem('web2_auth') || 'null');
            if (t && t.token) h['x-web2-token'] = t.token;
        } catch (e) {}
        return h;
    }

    // ---------- Paper presets — khổ giấy in (hardcoded, theo máy in shop) ----------
    const PAPERS = [
        {
            // P1 2026-05-30: khổ giấy chuẩn (user paste settings).
            // Sheet 66×21mm, 2 nhãn × 25mm = 50mm + 0.5mm margin × 4 lề = 2mm.
            // → còn dư 14mm là khoảng cách physical giữa 2 con tem trên roll
            //   nhãn. Trước đây float:left dồn 2 nhãn về trái, gap dư ở phải.
            // → Refactor: sheet dùng flex space-evenly để chia 14mm dư thành
            //   3 vùng đều (~4.7mm/vùng) — 2 tem CHIA ĐỀU + CANH GIỮA trên
            //   sheet. CSS handle bên dưới (.barcode-sheet flex space-evenly).
            // FontSize giữ 6 đúng preset khổ giấy 7.
            id: 7,
            name: '2 Tem (66×21mm)',
            sheetW: 66,
            sheetH: 21,
            labelW: 25,
            labelH: 21,
            cols: 2,
            fontSize: 6,
            topMargin: 0.5,
            leftMargin: 0.5,
            bottomMargin: 0.5,
            rightMargin: 0.5,
            hSpacing: 0,
            vSpacing: 0,
        },
        {
            id: 8,
            name: '1 Tem (65×22mm)',
            sheetW: 65,
            sheetH: 22,
            labelW: 27,
            labelH: 21,
            cols: 2,
            fontSize: 7,
            topMargin: 0,
            leftMargin: 0,
            bottomMargin: 0,
            rightMargin: 0,
            hSpacing: 0,
            vSpacing: 0,
        },
        {
            id: 9,
            name: 'Tem 35×22mm',
            sheetW: 70,
            sheetH: 22,
            labelW: 35,
            labelH: 22,
            cols: 2,
            fontSize: 8,
            topMargin: 0,
            leftMargin: 0,
            bottomMargin: 0,
            rightMargin: 0,
            hSpacing: 0,
            vSpacing: 0,
        },
        {
            // 2026-06-06: tem RỘNG 1 con cho MÃ DÀI (≥7 ký tự). Trên tem 25mm,
            // Code128 ~10 ký tự → vạch ~0.15mm (dưới ngưỡng quét ~0.2mm) → không
            // quét được. Tem 50mm 1-con → vạch ~0.3mm → quét tốt mọi mã.
            id: 10,
            name: 'Tem rộng 50×30mm (mã dài)',
            sheetW: 50,
            sheetH: 30,
            labelW: 50,
            labelH: 30,
            cols: 1,
            fontSize: 9,
            topMargin: 1,
            leftMargin: 1,
            bottomMargin: 1,
            rightMargin: 1,
            hSpacing: 0,
            vSpacing: 0,
        },
    ];

    // 2026-06-06: khổ tem MẶC ĐỊNH = "2 Tem (66×21mm)" (id 7) — đúng khổ tem vật lý
    // user đang dùng (cuộn 2-con 25mm). Tem rộng 50mm chỉ là option.
    const DEFAULT_PAPER_IDX = Math.max(
        0,
        PAPERS.findIndex((p) => p.id === 7)
    );

    const PRINT_TYPES = [
        { id: 'default', name: 'Mặc định (dọc)' },
        { id: 'new', name: '2 cột (ngang)' },
    ];

    // 2026-06-07: CHỈ DÙNG QR Code cho tem SP (user bỏ barcode 1D). QR (2D) quét
    // được mọi độ dài mã trên tem 25mm/203DPI (decoder ZXing xác nhận). Máy quét
    // 2D (imager) — user XP-470B + máy quét 2D. Code128 path giữ làm fallback nội
    // bộ nếu QR lib lỗi, KHÔNG cho user chọn nữa.

    // ---------- Helpers ----------
    // Key qrMap theo code + biến thể (biến thể bake vào giữa QR → QR khác nhau).
    function _qrKey(code, variant) {
        return String(code) + '' + (variant || '');
    }
    // S6-residual fix (2026-06-12): bản DOM-based KHÔNG escape quote —
    // nhúng vào attribute (value="...") là injectable. Chuẩn 5 ký tự.
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

    function stripBrackets(str) {
        return String(str || '')
            .replace(/\[[^\]]*\]\s*/g, '')
            .trim();
    }

    function formatPrice(n) {
        const num = parseInt(n) || 0;
        return num.toLocaleString('de-DE');
    }

    function notify(msg, type = 'info') {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type);
        else console.log(`[w2p-print:${type}]`, msg);
    }

    // Export ra namespace shared.
    W2PP._w2Auth = _w2Auth;
    W2PP.PAPERS = PAPERS;
    W2PP.DEFAULT_PAPER_IDX = DEFAULT_PAPER_IDX;
    W2PP.PRINT_TYPES = PRINT_TYPES;
    W2PP._qrKey = _qrKey;
    W2PP.escapeHtml = escapeHtml;
    W2PP.stripBrackets = stripBrackets;
    W2PP.formatPrice = formatPrice;
    W2PP.notify = notify;
})();
