// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — 1 NGUỒN chuẩn hoá SĐT VN cho Web 2.0.
// =====================================================================
// Web2PhoneUtils — NGUỒN DUY NHẤT chuẩn hoá + validate SĐT VN cho Web 2.0.
//
// Lý do (codemap §4): `normPhone` copy ~10 file. SĐT VN = đúng 10 số /^0\d{9}$/
// (MEMORY feedback_web2_phone_10_digits) — tránh nhầm fb_id / dãy số rác.
// Web2CustomerStore.normPhone delegate về đây (lazy) khi module này có mặt.
//
// API:
//   Web2PhoneUtils.norm(p)     → "0xxxxxxxxx" (strip ký tự, 84/0084→0, pad số 0 đầu). '' nếu rỗng.
//   Web2PhoneUtils.isValid(p)  → bool, đúng /^0\d{9}$/ sau khi norm (LENIENT — cho MATCHING, chấp cả cố định)
//   Web2PhoneUtils.isMobile(p) → bool, đúng ĐẦU SỐ DI ĐỘNG VN thực (STRICT — cho form nhập)
//   Web2PhoneUtils.display(p)  → "0xxx xxx xxx" (nhóm 4-3-3) nếu hợp lệ, else norm
//
// NGUỒN DUY NHẤT: Web2CustomerStore.normPhone + ~12 helper local đều delegate về đây.
// Quy tắc norm = libphonenumber-correct (region VN): +84/84/0084 → 0; số 9 chữ số (thiếu
// 0 đầu, national) → pad 0. Đầu số di động (isMobile) lấy từ github.com/lehuygiang28/
// phone-validate (2025, gồm cả nhà mạng ảo iTel 087 / Wintel 055 / Vnsky-FPT 077x / 089).
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2PhoneUtils) return;

    function norm(p) {
        let s = String(p == null ? '' : p).replace(/\D/g, '');
        if (!s) return '';
        if (s.indexOf('0084') === 0 && s.length === 13) s = '0' + s.slice(4); // 0084xxxxxxxxx → 0xxxxxxxxx
        if (s.indexOf('84') === 0 && s.length === 11) s = '0' + s.slice(2); // +84xxxxxxxxx → 0xxxxxxxxx
        if (s.length === 9 && s[0] !== '0') s = '0' + s; // thiếu số 0 đầu (national → 0xxxxxxxxx)
        return s;
    }

    function isValid(p) {
        return /^0\d{9}$/.test(norm(p));
    }

    // Đầu số DI ĐỘNG VN (sau migration 2018 + nhà mạng ảo). Nguồn: lehuygiang28/phone-validate.
    //   3[2-9]=Viettel · 5[25689]=Vietnamobile/Wintel · 7[06-9]=Mobifone/Vnsky/FPT ·
    //   8[1-9]=Vinaphone/iTel/Mobifone-Local · 9[0-46-9]=các mạng.
    const MOBILE_RE = /^0(3[2-9]|5[25689]|7[06-9]|8[1-9]|9[0-46-9])\d{7}$/;
    function isMobile(p) {
        return MOBILE_RE.test(norm(p));
    }

    function display(p) {
        const s = norm(p);
        if (!isValid(s)) return s;
        return s.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
    }

    global.Web2PhoneUtils = { norm, isValid, isMobile, display };
})(typeof window !== 'undefined' ? window : globalThis);
