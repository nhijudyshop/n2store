// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — 1 NGUỒN format tiền/ngày/giờ (GMT+7) cho Web 2.0.
// =====================================================================
// Web2Format — NGUỒN DUY NHẤT format tiền VND + ngày/giờ GMT+7 cho Web 2.0.
//
// Lý do (codemap §4, 2026-06-18): fmtVnd/fmtMoney/fmtDate/fmtTime copy-paste
// rải ~48 file, mỗi bản lệch nhẹ (có/không hậu tố ₫, parse UTC sai múi giờ).
// Gom 1 nguồn để logic thống nhất + đúng GMT+7 mọi nơi.
//
// ⏰ GMT+7 (CLAUDE.md quy tắc 10): Pancake `inserted_at` là UTC KHÔNG hậu tố `Z`
// → parseTs tự append `Z`. Hiển thị qua Intl timeZone 'Asia/Ho_Chi_Minh'.
//
// API:
//   Web2Format.num(n)        → "1.234.567"        (toLocaleString vi-VN, làm tròn)
//   Web2Format.vnd(n)        → "1.234.567₫"       (num + hậu tố ₫)
//   Web2Format.date(v)       → "18/06/2026"        (GMT+7)
//   Web2Format.time(v)       → "21:30"             (GMT+7, 24h)
//   Web2Format.dateTime(v)   → "18/06/2026 21:30"  (GMT+7)
//   Web2Format.rel(v)        → "5 phút trước" / "2 giờ trước" / fallback date()
//   Web2Format.parseTs(v)    → Date | null  (append Z nếu thiếu timezone)
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2Format) return;

    const TZ = 'Asia/Ho_Chi_Minh';

    function num(n) {
        return Math.round(Number(n) || 0).toLocaleString('vi-VN');
    }
    function vnd(n) {
        return num(n) + '₫';
    }

    // Parse robust: số (epoch ms), Date, ISO. Chuỗi ISO KHÔNG có timezone →
    // hiểu là UTC (append Z) để khớp Pancake inserted_at + server TZ=+7.
    function parseTs(v) {
        if (v == null || v === '') return null;
        if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
        if (typeof v === 'number') {
            const d = new Date(v);
            return isNaN(d.getTime()) ? null : d;
        }
        let s = String(v).trim();
        if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
            s = s.replace(' ', 'T') + 'Z';
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }

    function _fmt(v, opts) {
        const d = parseTs(v);
        if (!d) return '';
        try {
            return new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, ...opts }).format(d);
        } catch {
            return '';
        }
    }

    function date(v) {
        return _fmt(v, { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    function time(v) {
        return _fmt(v, { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    function dateTime(v) {
        // Date-first "DD/MM/YYYY HH:mm" (Intl vi-VN tự đặt giờ trước → compose tay).
        const d = date(v);
        if (!d) return '';
        return d + ' ' + time(v);
    }

    function rel(v) {
        const d = parseTs(v);
        if (!d) return '';
        const diff = Date.now() - d.getTime();
        const sec = Math.round(diff / 1000);
        if (sec < 0) return dateTime(v);
        if (sec < 60) return 'vừa xong';
        const min = Math.round(sec / 60);
        if (min < 60) return min + ' phút trước';
        const hr = Math.round(min / 60);
        if (hr < 24) return hr + ' giờ trước';
        const day = Math.round(hr / 24);
        if (day < 7) return day + ' ngày trước';
        return date(v);
    }

    global.Web2Format = { num, vnd, date, time, dateTime, rel, parseTs, TZ };
})(typeof window !== 'undefined' ? window : globalThis);
