// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web2Escape — 1 NGUỒN escape/sanitize cho Web 2.0 (đợt escape, 2026-06-12).
//
// Lý do (audit vòng 3, pattern lỗi lặp #4): escapeHtml copy-paste drift thành
// 3 thế hệ rải ~15 file — bản DOM-based textContent→innerHTML (3 ký tự, KHÔNG
// escape quote → attribute-injection, gốc S6), bản 4 ký tự (thiếu '), bản
// 5 ký tự chuẩn. Fix S6 phải vá tay từng file vì không có module chung.
//
// TRANG MỚI: load file này + dùng Web2Escape.* — ĐỪNG copy hàm vào file riêng.
// Trang cũ: migrate dần khi đụng file (giữ wrapper local trỏ về đây được).
//
//   Web2Escape.escapeHtml(v)   — 5 ký tự & < > " ' (an toàn cả text node lẫn
//                                attribute trong nháy kép/đơn)
//   Web2Escape.escJs(v)        — nhúng vào chuỗi JS trong inline handler
//                                (onclick="f('...')"): \ ' " ` ${ newline
//   Web2Escape.safeUrl(v)      — allowlist https?://, //, /, ../, # — chặn
//                                javascript:/data:/vbscript: (S7)
//   Web2Escape.safeImageUrl(v) — như safeUrl + cho data:image/* (ảnh inline)
// =====================================================
(function (global) {
    'use strict';
    if (global.Web2Escape) return;

    function escapeHtml(v) {
        if (v == null) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escJs(v) {
        if (v == null) return '';
        return String(v)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/`/g, '\\`')
            .replace(/\$\{/g, '\\${')
            .replace(/\r?\n/g, '\\n');
    }

    function safeUrl(v) {
        const s = String(v || '').trim();
        if (!s) return '';
        if (/^(https?:)?\/\//i.test(s) || /^\//.test(s) || /^\.\.\//.test(s) || /^#/.test(s)) {
            return s;
        }
        return '';
    }

    function safeImageUrl(v) {
        const s = String(v || '').trim();
        if (!s) return '';
        if (/^data:image\//i.test(s)) return s;
        return safeUrl(s);
    }

    global.Web2Escape = { escapeHtml, escJs, safeUrl, safeImageUrl };
})(typeof window !== 'undefined' ? window : globalThis);
