#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * INVENTORY-TRACKING — RENUMBER ĐỢT (dot_so) cho DUY NHẤT TOÀN CỤC
 * =====================================================
 * Web 1.0 (PROD, pool chatDb / n2store_chat). KHÔNG đụng web2.
 *
 * BỐI CẢNH BUG:
 *   - `dot_so` xưa đánh số theo TỪNG NGÀY (migration 053: "mỗi ngày đếm lại từ 1").
 *   - Nhưng từ 2026-05-31 UI lại DÙNG `dot_so` như khoá đợt TOÀN CỤC (filters.js +
 *     getAllDotsAggregated gom theo dotSo span mọi ngày).
 *   → 2 đợt khác ngày trùng số (vd đợt 3 tháng 5 và đợt 3 tháng 6 đều dot_so=3) bị
 *     GỘP làm một; đợt mới còn KẾ THỪA thanh toán đợt cũ ở POST /shipments.
 *
 * Script này SỬA DATA CŨ: tách mỗi (ngay_di_hang, dot_so) "đụng số" thành đợt có
 * số DUY NHẤT toàn cục — giữ NHÓM CŨ NHẤT số gốc, cấp số mới (MAX+1, +2, ...) cho
 * các nhóm còn lại. Cập nhật cả inventory_product_images (ảnh keyed theo
 * (ngay_di_hang, dot_so)) để ảnh không mồ côi.
 *
 * THANH TOÁN (thanh_toan_ck): nhóm tách ra mà mảng thanh toán GIỐNG HỆT nhóm giữ
 * lại → đó là bản KẾ THỪA (không phải của nó) → set [] (đợt mới bắt đầu sạch).
 * Khác → giữ nguyên (đợt có thanh toán riêng). Tắt bằng --no-clear-inherited.
 *
 * AN TOÀN:
 *   - MẶC ĐỊNH = DRY-RUN: chỉ in kế hoạch, KHÔNG ghi. Chạy xem trước rồi mới --apply.
 *   - --apply chạy trong 1 transaction; lỗi → ROLLBACK.
 *   - Idempotent: chạy lại sau khi --apply → 0 collision → no-op.
 *   - Cần `DATABASE_URL` (chuỗi kết nối n2store_chat) qua ENV — KHÔNG hardcode secret.
 *
 * DÙNG:
 *   node inventory-renumber-dots.js --self-test          # test logic thuần (không cần DB)
 *   DATABASE_URL=... node inventory-renumber-dots.js      # DRY-RUN trên prod (chỉ đọc)
 *   DATABASE_URL=... node inventory-renumber-dots.js --apply
 *   thêm --no-clear-inherited để GIỮ nguyên mọi thanh toán (chỉ đổi số đợt).
 */

'use strict';

const path = require('path');

const ARGS = process.argv.slice(2);
const IS_APPLY = ARGS.includes('--apply');
const IS_SELF_TEST = ARGS.includes('--self-test');
const IS_INSPECT = ARGS.includes('--inspect');
const CLEAR_INHERITED = !ARGS.includes('--no-clear-inherited');

const log = (...a) => console.log('[RENUMBER-DOTS]', ...a);

// ----------------------------------------------------------------------------
// PURE LOGIC (testable, không phụ thuộc DB)
// ----------------------------------------------------------------------------

/** Canonical JSON cho 1 mảng thanh toán để so sánh "giống hệt". */
function _canonPayment(ck) {
    let arr = ck;
    if (typeof ck === 'string') {
        try {
            arr = JSON.parse(ck || '[]');
        } catch {
            arr = [];
        }
    }
    if (!Array.isArray(arr)) arr = [];
    return JSON.stringify(arr);
}

function _isEmptyPayment(canon) {
    return canon === '[]' || canon === '' || canon == null;
}

/**
 * Lập kế hoạch renumber từ danh sách shipment rows.
 * @param {Array<{id,ngay_di_hang,dot_so,thanh_toan_ck,created_at}>} rows
 * @param {{clearInherited?:boolean}} [opts]
 * @returns {{
 *   maxDotSo:number,
 *   collisions:Array<{dotSo:number, dates:string[]}>,
 *   reassigns:Array<{ngayDiHang:string, oldDot:number, newDot:number, clearPayment:boolean}>,
 * }}
 */
function planRenumber(rows, opts = {}) {
    const clearInherited = opts.clearInherited !== false;

    // Gom theo (ngay_di_hang, dot_so) → mỗi nhóm = 1 "lô vật lý".
    const groups = new Map(); // key `${date}|${dot}` -> { date, dot, minCreated, payments:Set, paymentCanon }
    let maxDotSo = 0;
    for (const r of rows) {
        const date = String(r.ngay_di_hang);
        const dot = parseInt(r.dot_so, 10) || 1;
        if (dot > maxDotSo) maxDotSo = dot;
        const key = `${date}|${dot}`;
        let g = groups.get(key);
        if (!g) {
            g = { date, dot, minCreated: r.created_at, paymentCanons: new Set() };
            groups.set(key, g);
        }
        if (r.created_at && (!g.minCreated || r.created_at < g.minCreated))
            g.minCreated = r.created_at;
        const canon = _canonPayment(r.thanh_toan_ck);
        if (!_isEmptyPayment(canon)) g.paymentCanons.add(canon);
    }

    // Payment "đại diện" của nhóm = mảng non-empty đầu tiên (các row trong nhóm
    // được sync giống nhau qua payment-by-dot).
    for (const g of groups.values()) {
        g.payment = g.paymentCanons.size > 0 ? [...g.paymentCanons][0] : '[]';
    }

    // dot_so nào xuất hiện trên >1 ngày → collision.
    const datesByDot = new Map(); // dot -> [groups]
    for (const g of groups.values()) {
        if (!datesByDot.has(g.dot)) datesByDot.set(g.dot, []);
        datesByDot.get(g.dot).push(g);
    }

    const collisions = [];
    const reassigns = [];
    let nextDot = maxDotSo;

    // Sắp xếp dot tăng dần cho output ổn định.
    const dots = [...datesByDot.keys()].sort((a, b) => a - b);
    for (const dot of dots) {
        const gs = datesByDot.get(dot);
        if (gs.length <= 1) continue; // không đụng số

        // Giữ nhóm CŨ NHẤT (minCreated, tie-break theo ngày) số gốc; tách phần còn lại.
        gs.sort((a, b) => {
            const ca = a.minCreated ? new Date(a.minCreated).getTime() : 0;
            const cb = b.minCreated ? new Date(b.minCreated).getTime() : 0;
            if (ca !== cb) return ca - cb;
            return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
        });
        const keep = gs[0];
        collisions.push({ dotSo: dot, dates: gs.map((g) => g.date) });

        for (let i = 1; i < gs.length; i++) {
            const g = gs[i];
            const newDot = ++nextDot;
            const inherited =
                clearInherited && !_isEmptyPayment(keep.payment) && g.payment === keep.payment;
            reassigns.push({
                ngayDiHang: g.date,
                oldDot: dot,
                newDot,
                clearPayment: inherited,
            });
        }
    }

    return { maxDotSo, collisions, reassigns };
}

// ----------------------------------------------------------------------------
// SELF-TEST (không cần DB) — mô phỏng đúng bug "đợt 3 hiện data đợt cũ"
// ----------------------------------------------------------------------------

function selfTest() {
    const assert = (cond, msg) => {
        if (!cond) {
            console.error('  ✗ FAIL:', msg);
            process.exitCode = 1;
        } else {
            console.log('  ✓', msg);
        }
    };

    const mayCk = JSON.stringify([
        { id: 'tt_1', ngayTT: '2026-05-18', soTienTT: 100000, ghiChu: 'CK NGÀY 18/5' },
        { id: 'tt_2', ngayTT: '2026-05-21', soTienTT: 100000, ghiChu: 'CK NGÀY 23/5' },
    ]);

    // Đợt 3 tháng 5 (gốc, có thanh toán) + đợt 3 tháng 6 (mới, KẾ THỪA y hệt) +
    // đợt 1 (1 ngày, không đụng số) + đợt 2 (1 ngày).
    const rows = [
        {
            id: 's1',
            ngay_di_hang: '2026-05-18',
            dot_so: 3,
            thanh_toan_ck: mayCk,
            created_at: '2026-05-18T02:00:00Z',
        },
        {
            id: 's2',
            ngay_di_hang: '2026-05-18',
            dot_so: 3,
            thanh_toan_ck: mayCk,
            created_at: '2026-05-18T02:01:00Z',
        },
        {
            id: 's3',
            ngay_di_hang: '2026-06-21',
            dot_so: 3,
            thanh_toan_ck: mayCk,
            created_at: '2026-06-21T03:00:00Z',
        }, // kế thừa
        {
            id: 's4',
            ngay_di_hang: '2026-05-10',
            dot_so: 1,
            thanh_toan_ck: '[]',
            created_at: '2026-05-10T01:00:00Z',
        },
        {
            id: 's5',
            ngay_di_hang: '2026-05-12',
            dot_so: 2,
            thanh_toan_ck: '[]',
            created_at: '2026-05-12T01:00:00Z',
        },
    ];

    log('SELF-TEST: bug đợt 3 trùng số (tháng 5 ↔ tháng 6)');
    const plan = planRenumber(rows, { clearInherited: true });

    assert(plan.maxDotSo === 3, `maxDotSo = 3 (got ${plan.maxDotSo})`);
    assert(
        plan.collisions.length === 1 && plan.collisions[0].dotSo === 3,
        'phát hiện đúng 1 collision: dot_so=3'
    );
    assert(plan.reassigns.length === 1, `1 nhóm cần tách (got ${plan.reassigns.length})`);

    const ra = plan.reassigns[0];
    assert(
        ra.ngayDiHang === '2026-06-21',
        `tách nhóm NGÀY MỚI 2026-06-21 (giữ 2026-05-18 số gốc), got ${ra.ngayDiHang}`
    );
    assert(
        ra.oldDot === 3 && ra.newDot === 4,
        `đổi dot_so 3 → 4 (MAX+1), got ${ra.oldDot}→${ra.newDot}`
    );
    assert(ra.clearPayment === true, 'XÓA thanh toán kế thừa của đợt tách (giống hệt đợt gốc)');

    // Khác: nếu đợt mới có thanh toán RIÊNG → giữ nguyên.
    const ownCk = JSON.stringify([
        { id: 'x', ngayTT: '2026-06-20', soTienTT: 5000, ghiChu: 'riêng' },
    ]);
    const rows2 = [
        {
            id: 'a',
            ngay_di_hang: '2026-05-18',
            dot_so: 3,
            thanh_toan_ck: mayCk,
            created_at: '2026-05-18T02:00:00Z',
        },
        {
            id: 'b',
            ngay_di_hang: '2026-06-21',
            dot_so: 3,
            thanh_toan_ck: ownCk,
            created_at: '2026-06-21T03:00:00Z',
        },
    ];
    const plan2 = planRenumber(rows2, { clearInherited: true });
    assert(
        plan2.reassigns.length === 1 && plan2.reassigns[0].clearPayment === false,
        'GIỮ thanh toán riêng (khác đợt gốc)'
    );

    // Idempotent: data đã unique → 0 reassign.
    const rows3 = [
        {
            id: 'a',
            ngay_di_hang: '2026-05-18',
            dot_so: 1,
            thanh_toan_ck: '[]',
            created_at: '2026-05-18T02:00:00Z',
        },
        {
            id: 'b',
            ngay_di_hang: '2026-06-21',
            dot_so: 2,
            thanh_toan_ck: '[]',
            created_at: '2026-06-21T03:00:00Z',
        },
    ];
    const plan3 = planRenumber(rows3);
    assert(
        plan3.reassigns.length === 0 && plan3.collisions.length === 0,
        'idempotent: data đã unique → no-op'
    );

    log(process.exitCode ? 'SELF-TEST: CÓ LỖI ✗' : 'SELF-TEST: TẤT CẢ PASS ✓');
}

// ----------------------------------------------------------------------------
// DB DRIVER (dry-run / apply)
// ----------------------------------------------------------------------------

function _printPlan(plan) {
    log(`MAX(dot_so) hiện tại = ${plan.maxDotSo}`);
    log(`Collisions (số đợt trùng trên nhiều ngày): ${plan.collisions.length}`);
    for (const c of plan.collisions) {
        log(`  • Đợt ${c.dotSo} xuất hiện ở ${c.dates.length} ngày: ${c.dates.join(', ')}`);
    }
    log(`Nhóm sẽ ĐỔI SỐ: ${plan.reassigns.length}`);
    for (const r of plan.reassigns) {
        log(
            `  • ${r.ngayDiHang}: Đợt ${r.oldDot} → Đợt ${r.newDot}` +
                (r.clearPayment ? '  [XÓA thanh toán kế thừa]' : '  [giữ thanh toán]')
        );
    }
    if (plan.reassigns.length === 0) log('  (không có gì để đổi — data đã sạch)');
}

// READ-ONLY: in dấu vân tay thanh toán theo từng dotSo để hiểu data thật.
async function inspectDb(pool) {
    const { rows } = await pool.query(
        `SELECT dot_so, ngay_di_hang::text AS ngay_di_hang, thanh_toan_ck, ti_gia
         FROM inventory_shipments`
    );
    const byDot = new Map();
    for (const r of rows) {
        const dot = r.dot_so == null ? '(null)' : r.dot_so;
        if (!byDot.has(dot))
            byDot.set(dot, { dates: new Set(), payments: new Set(), tiGias: new Set(), n: 0 });
        const g = byDot.get(dot);
        g.n++;
        g.dates.add(r.ngay_di_hang);
        if (r.ti_gia != null) g.tiGias.add(String(r.ti_gia));
        const canon = _canonPayment(r.thanh_toan_ck);
        if (!_isEmptyPayment(canon)) g.payments.add(canon);
    }
    // Vân tay payment → đối chiếu trùng giữa các dotSo.
    const fingerprint = new Map(); // canon -> [dot...]
    for (const [dot, g] of byDot) {
        for (const c of g.payments) {
            if (!fingerprint.has(c)) fingerprint.set(c, []);
            fingerprint.get(c).push(dot);
        }
    }
    log('=== INSPECT (read-only) — thanh toán theo từng Đợt ===');
    const dots = [...byDot.keys()].sort((a, b) =>
        a === '(null)' ? -1 : b === '(null)' ? 1 : a - b
    );
    for (const dot of dots) {
        const g = byDot.get(dot);
        const pays = [...g.payments];
        log(
            `Đợt ${dot}: ${g.n} dòng, ${g.dates.size} ngày, tỉ giá {${[...g.tiGias].join(',')}}, ${pays.length} mảng TT non-empty`
        );
        pays.forEach((c, i) => {
            let arr = [];
            try {
                arr = JSON.parse(c);
            } catch {}
            const total = arr.reduce((s, p) => s + (parseFloat(p.soTienTT) || 0), 0);
            const notes = arr
                .map((p) => `${p.ngayTT || '?'}:${(p.ghiChu || '').slice(0, 18)}`)
                .slice(0, 6)
                .join(' | ');
            const sharedWith = fingerprint.get(c).filter((d) => d !== dot);
            log(
                `   • mảng#${i + 1}: ${arr.length} dòng, tổng=${total}${sharedWith.length ? `  ⚠ GIỐNG HỆT Đợt ${sharedWith.join(',')}` : ''}`
            );
            log(`       ${notes}`);
        });
    }
}

async function runDb() {
    const DATABASE_URL = process.env.DATABASE_URL;
    if (!DATABASE_URL) {
        console.error(
            '[RENUMBER-DOTS] Thiếu ENV DATABASE_URL (chuỗi kết nối n2store_chat). ' +
                'Ví dụ: DATABASE_URL=postgresql://... node inventory-renumber-dots.js'
        );
        process.exit(1);
    }
    const PG_PATH = path.join(__dirname, '..', 'node_modules', 'pg');
    const { Pool } = require(PG_PATH);
    const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

    if (IS_INSPECT) {
        try {
            await inspectDb(pool);
        } finally {
            await pool.end();
        }
        return;
    }

    try {
        const { rows } = await pool.query(
            `SELECT id, ngay_di_hang::text AS ngay_di_hang, dot_so, thanh_toan_ck, created_at
             FROM inventory_shipments`
        );
        log(`Đọc ${rows.length} shipment rows.`);
        const nullCount = rows.filter((r) => r.dot_so === null || r.dot_so === undefined).length;
        if (nullCount > 0) {
            log(
                `  ⚠ ${nullCount} row có dot_so = NULL → sẽ normalize về 1 (coi như Đợt 1) khi --apply.`
            );
        }
        const plan = planRenumber(rows, { clearInherited: CLEAR_INHERITED });
        _printPlan(plan);

        if (!IS_APPLY) {
            log('DRY-RUN (chưa ghi gì). Thêm --apply để thực thi.');
            return;
        }
        if (plan.reassigns.length === 0) {
            log('Không có thay đổi → bỏ qua apply.');
            return;
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // NULL-safe: planRenumber coerce dot_so NULL→1, nên normalize NULL→1 TRƯỚC
            // (cùng transaction) để WHERE dot_so=1 bắt được các row này (SQL: NULL != 1).
            const nz = await client.query(
                `UPDATE inventory_shipments SET dot_so = 1 WHERE dot_so IS NULL`
            );
            if (nz.rowCount > 0) log(`  • normalize ${nz.rowCount} row dot_so NULL → 1`);
            try {
                await client.query(
                    `UPDATE inventory_product_images SET dot_so = 1 WHERE dot_so IS NULL`
                );
            } catch (e) {
                if (e.code !== '42703') throw e; // 42703 = cột không tồn tại → bỏ qua an toàn
            }
            for (const r of plan.reassigns) {
                // Đổi số đợt cho shipments của (ngày, dot cũ).
                const up = await client.query(
                    `UPDATE inventory_shipments SET dot_so = $1, updated_at = NOW()
                     WHERE ngay_di_hang = $2 AND dot_so = $3`,
                    [r.newDot, r.ngayDiHang, r.oldDot]
                );
                // Đồng bộ ảnh SP (keyed theo (ngay_di_hang, dot_so)) — tránh mồ côi.
                let imgN = 0;
                try {
                    const imgUp = await client.query(
                        `UPDATE inventory_product_images SET dot_so = $1
                         WHERE ngay_di_hang = $2 AND dot_so = $3`,
                        [r.newDot, r.ngayDiHang, r.oldDot]
                    );
                    imgN = imgUp.rowCount;
                } catch (e) {
                    // CHỈ nuốt lỗi "cột không tồn tại" (42703). Lỗi khác (mất kết nối,
                    // FK, quyền…) PHẢI ném ra → outer catch ROLLBACK, tránh COMMIT khi
                    // shipment đã đổi số nhưng ảnh còn trỏ số cũ (mồ côi).
                    if (e.code !== '42703') throw e;
                    log(`  (ảnh: cột dot_so không tồn tại — bỏ qua)`);
                }
                // Xóa thanh toán kế thừa cho nhóm vừa tách.
                if (r.clearPayment) {
                    await client.query(
                        `UPDATE inventory_shipments SET thanh_toan_ck = '[]'::jsonb, updated_at = NOW()
                         WHERE ngay_di_hang = $1 AND dot_so = $2`,
                        [r.ngayDiHang, r.newDot]
                    );
                }
                log(
                    `  ✓ ${r.ngayDiHang} Đợt ${r.oldDot}→${r.newDot}: ${up.rowCount} shipment, ${imgN} ảnh` +
                        (r.clearPayment ? ', đã xóa thanh toán kế thừa' : '')
                );
            }
            await client.query('COMMIT');
            log('APPLY xong (COMMIT).');
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('[RENUMBER-DOTS] Lỗi → ROLLBACK:', e.message);
            process.exitCode = 1;
        } finally {
            client.release();
        }
    } finally {
        await pool.end();
    }
}

// ----------------------------------------------------------------------------
// ENTRY
// ----------------------------------------------------------------------------

(async () => {
    if (IS_SELF_TEST) {
        selfTest();
        return;
    }
    await runDb();
})();

module.exports = { planRenumber, _canonPayment };
