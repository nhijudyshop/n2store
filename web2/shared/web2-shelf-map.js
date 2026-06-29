// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared.
// =====================================================================
// Web2ShelfMap — SƠ ĐỒ KỆ VẬT LÝ: map STT (campaign_stt) → ô vật lý (Kệ·Hàng·Cột).
// Layout (user chốt 2026-06-29): 9 KỆ, mỗi kệ 15 CỘT × 6 HÀNG = 90 ô.
//   - STT tuần tự qua kệ: Kệ1=STT 1–90, Kệ2=91–180 … Kệ9=721–810.
//   - Trong 1 kệ: HÀNG-MAJOR (STT cục bộ 1–15 = hàng 1 trái→phải, 16–30 = hàng 2…).
// Sắp xếp vật lý (đường đi): Kệ 1-2 (tường TRÁI) · 3-4-5-6 (GIỮA) · 7-8 (tường PHẢI)
//   · 9 (lẻ, tường phải). Kệ đánh số 1→9 đúng thứ tự đi ⇒ STT tăng = đường đi.
// 9 XE = 9 KỆ: quét → biết KỆ (xe nào) bỏ vào; ra kệ đặt theo ô (Hàng·Cột) + nhãn.
// Dùng: sort-station (Bàn chia hàng), unit-scan, shelf-labels (in nhãn ô).
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2ShelfMap) return;

    const COLS = 15;
    const ROWS = 6;
    const PER_KE = COLS * ROWS; // 90
    const KE_COUNT = 9;

    // Nhóm tường theo thứ tự ĐƯỜNG ĐI (trái → giữa → phải → lẻ).
    const WALLS = [
        { name: 'tường trái', short: 'trái', kes: [1, 2] },
        { name: 'giữa', short: 'giữa', kes: [3, 4, 5, 6] },
        { name: 'tường phải', short: 'phải', kes: [7, 8] },
        { name: 'lẻ (phải)', short: 'lẻ', kes: [9] },
    ];
    function wallOf(ke) {
        const w = WALLS.find((x) => x.kes.includes(ke));
        return w ? w.short : '';
    }

    // STT (1..810) → { ke, hang, cot, localStt, wall, short, full } | null nếu sai/ngoài.
    function locate(stt) {
        const n = Number(stt);
        if (!Number.isFinite(n) || n < 1) return null;
        const ke = Math.floor((n - 1) / PER_KE) + 1;
        if (ke > KE_COUNT) return { stt: n, ke: null, overflow: true };
        const local0 = (n - 1) % PER_KE; // 0..89
        const hang = Math.floor(local0 / COLS) + 1; // hàng-major
        const cot = (local0 % COLS) + 1;
        return {
            stt: n,
            ke,
            hang,
            cot,
            localStt: local0 + 1,
            wall: wallOf(ke),
            short: `K${ke}·H${hang}·C${cot}`,
            full: `Kệ ${ke} · Hàng ${hang} · Cột ${cot}`,
        };
    }

    const keOf = (stt) => {
        const l = locate(stt);
        return l && l.ke ? l.ke : null;
    };

    // Lưới STT của 1 kệ (6 hàng × 15 cột) — cho sơ đồ + in nhãn. base = (ke-1)*90.
    function keGrid(ke) {
        const base = (ke - 1) * PER_KE;
        const rows = [];
        for (let r = 0; r < ROWS; r++) {
            const row = [];
            for (let c = 0; c < COLS; c++) row.push(base + r * COLS + c + 1);
            rows.push(row);
        }
        return rows;
    }

    // Thứ tự đi đặt hàng (kệ tăng dần = trái→giữa→phải→lẻ). STT tăng = đường đi.
    const compareWalk = (sttA, sttB) => Number(sttA) - Number(sttB);

    global.Web2ShelfMap = {
        COLS,
        ROWS,
        PER_KE,
        KE_COUNT,
        WALLS,
        wallOf,
        locate,
        keOf,
        keGrid,
        compareWalk,
    };
})(typeof window !== 'undefined' ? window : this);
