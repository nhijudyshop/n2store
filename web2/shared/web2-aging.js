// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Aging bucket helper — pure function, dùng cho F02 supplier-aging + F07 NCC 360.
 *
 * bucketByAge(items, refDate?) → {
 *   b0_30, b31_60, b61_90, b90_plus,
 *   total, items: { b0_30: [...], ... }
 * }
 *
 * `items[i].date` phải là Date hoặc ISO string. `items[i].amount` là số.
 */
(function (global) {
    'use strict';
    if (global.Web2Aging) return;

    const DAY = 86400000;

    function daysBetween(d1, d2) {
        return Math.floor((d2.getTime() - d1.getTime()) / DAY);
    }

    function toDate(v) {
        if (v instanceof Date) return v;
        if (typeof v === 'string' || typeof v === 'number') return new Date(v);
        return null;
    }

    function bucketByAge(items, refDate) {
        const ref = refDate ? toDate(refDate) : new Date();
        const out = {
            b0_30: 0,
            b31_60: 0,
            b61_90: 0,
            b90_plus: 0,
            total: 0,
            items: { b0_30: [], b31_60: [], b61_90: [], b90_plus: [] },
        };
        for (const it of items || []) {
            const d = toDate(it.date);
            if (!d || isNaN(d)) continue;
            const amt = Number(it.amount) || 0;
            const age = daysBetween(d, ref);
            let key;
            if (age <= 30) key = 'b0_30';
            else if (age <= 60) key = 'b31_60';
            else if (age <= 90) key = 'b61_90';
            else key = 'b90_plus';
            out[key] += amt;
            out.total += amt;
            out.items[key].push({ ...it, _age_days: age });
        }
        return out;
    }

    global.Web2Aging = Object.freeze({ bucketByAge });
})(typeof window !== 'undefined' ? window : globalThis);
