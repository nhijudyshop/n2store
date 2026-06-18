// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — 1 NGUỒN chuẩn hoá text/tìm kiếm tiếng Việt cho Web 2.0.
// =====================================================================
// Web2TextUtils — NGUỒN DUY NHẤT bỏ dấu + chuẩn hoá tìm kiếm tiếng Việt.
//
// Lý do (codemap §4): stripDiacritics/searchNormalize/asciiUpper copy ~6 file.
//
// API:
//   Web2TextUtils.stripDiacritics(s) → bỏ dấu + đ→d, Đ→D (giữ nguyên hoa/thường)
//   Web2TextUtils.searchNormalize(s) → bỏ dấu + lowercase + gộp khoảng trắng (so khớp tìm kiếm)
//   Web2TextUtils.asciiUpper(s)      → bỏ dấu + UPPERCASE (mã SP, prefix NCC)
//   Web2TextUtils.includes(haystack, needle) → searchNormalize cả 2 rồi indexOf
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2TextUtils) return;

    function stripDiacritics(s) {
        if (!s) return '';
        return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    }

    function searchNormalize(s) {
        return stripDiacritics(String(s || ''))
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function asciiUpper(s) {
        return stripDiacritics(String(s || '')).toUpperCase();
    }

    function includes(haystack, needle) {
        const n = searchNormalize(needle);
        if (!n) return true;
        return searchNormalize(haystack).indexOf(n) !== -1;
    }

    global.Web2TextUtils = { stripDiacritics, searchNormalize, asciiUpper, includes };
})(typeof window !== 'undefined' ? window : globalThis);
