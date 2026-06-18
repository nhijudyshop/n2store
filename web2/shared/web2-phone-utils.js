// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — 1 NGUỒN chuẩn hoá SĐT VN cho Web 2.0.
// =====================================================================
// Web2PhoneUtils — NGUỒN DUY NHẤT chuẩn hoá + validate SĐT VN cho Web 2.0.
//
// Lý do (codemap §4): `normPhone` copy ~10 file. SĐT VN = đúng 10 số /^0\d{9}$/
// (MEMORY feedback_web2_phone_10_digits) — tránh nhầm fb_id / dãy số rác.
// Web2CustomerStore.normPhone delegate về đây (lazy) khi module này có mặt.
//
// API:
//   Web2PhoneUtils.norm(p)     → "0xxxxxxxxx" (strip ký tự, 84→0). '' nếu rỗng.
//   Web2PhoneUtils.isValid(p)  → bool, đúng /^0\d{9}$/ sau khi norm
//   Web2PhoneUtils.display(p)  → "0xxx xxx xxx" (nhóm 4-3-3) nếu hợp lệ, else norm
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2PhoneUtils) return;

    function norm(p) {
        let s = String(p == null ? '' : p).replace(/\D/g, '');
        if (!s) return '';
        if (s.indexOf('84') === 0 && s.length === 11) s = '0' + s.slice(2); // +84xxxxxxxxx → 0xxxxxxxxx
        if (s.length === 9 && s[0] !== '0') s = '0' + s; // thiếu số 0 đầu
        return s;
    }

    function isValid(p) {
        return /^0\d{9}$/.test(norm(p));
    }

    function display(p) {
        const s = norm(p);
        if (!isValid(s)) return s;
        return s.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
    }

    global.Web2PhoneUtils = { norm, isValid, display };
})(typeof window !== 'undefined' ? window : globalThis);
