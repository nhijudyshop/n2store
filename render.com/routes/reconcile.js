// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// RECONCILE (PBH Fulfillment) REST API — WEB 2.0 MODULE
// =====================================================
// Đối soát + đóng gói PBH:
//   pending → picking → picked → packed → shipped → delivered
// 1 kho, 1 nhân viên, scanner-driven. Stock đã trừ tại lúc tạo PBH (web2_products.stock),
// reconcile KHÔNG trừ lại — chỉ verify pick + state machine + audit log.
//
// Endpoints:
//   GET    /api/reconcile/health
//   GET    /api/reconcile/list                   — list PBH theo fulfillment_state
//   GET    /api/reconcile/:number                — detail 1 PBH
//   POST   /api/reconcile/:number/scan           — scan 1 SP (productCode) → +1 picked_qty
//   POST   /api/reconcile/:number/manual-pick    — set picked_qty trực tiếp cho 1 line
//   POST   /api/reconcile/:number/reset-pick     — clear picked_lines, về pending
//   POST   /api/reconcile/:number/pack           — chuyển → packed (block nếu thiếu)
//   POST   /api/reconcile/:number/ship           — chuyển → shipped
//   POST   /api/reconcile/:number/deliver        — chuyển → delivered
//   GET    /api/reconcile/:number/logs           — audit log của 1 PBH
//
// SSE: broadcast 'web2:reconcile' + 'web2:fast-sale-orders' sau mỗi mutation.

const express = require('express');
const router = express.Router();
const { withTransaction } = require('../db/with-transaction');
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');

// AUTH GATE (audit 2026-06-20 #43): mọi route PBH đối soát (scan/pack/ship/
// deliver/return-failed…) PHẢI qua web2-auth — trước đây bare, ai cũng POST được
// và userFromReq tin body. requireWeb2AuthSoft → 401 khi WEB2_AUTH_ENFORCE=1
// (trang reconcile đã gửi x-web2-token sẵn), warn-and-pass khi transition.
router.use(requireWeb2AuthSoft);

// -----------------------------------------------------
// SSE notifier
// -----------------------------------------------------
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, number, extra = {}) {
    if (!_notifyClients) return;
    try {
        const payload = { action, number: number || null, ts: Date.now(), ...extra };
        _notifyClients('web2:reconcile', payload, 'update');
        // Cross-broadcast cho PBH page biết fulfillment_state thay đổi
        _notifyClients(
            'web2:fast-sale-orders',
            { action: `reconcile:${action}`, number: number || null, ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[RECONCILE] _notify failed:', e.message);
    }
}

// -----------------------------------------------------
// Schema (chỉ tạo bảng audit log; cột fulfillment_* đã có ở fast-sale-orders.js migration 076)
// -----------------------------------------------------
const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (_ensuredPools.has(pool)) return;
    try {
        await pool.query(`
            -- Migration 076b: Audit log cho mọi mutation fulfillment
            CREATE TABLE IF NOT EXISTS pbh_fulfillment_logs (
                id           BIGSERIAL PRIMARY KEY,
                pbh_number   VARCHAR(50) NOT NULL,
                action       VARCHAR(40) NOT NULL,   -- scan|manual-pick|reset-pick|pack|ship|deliver|cancel-pack
                payload      JSONB,
                state_before VARCHAR(20),
                state_after  VARCHAR(20),
                user_id      VARCHAR(100),
                user_name    VARCHAR(255),
                created_at   BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_pbh_log_number ON pbh_fulfillment_logs(pbh_number);
            CREATE INDEX IF NOT EXISTS idx_pbh_log_created ON pbh_fulfillment_logs(created_at DESC);
        `);
        _ensuredPools.add(pool);
        console.log('[RECONCILE] Tables created/verified (migration 076b)');
    } catch (e) {
        console.error('[RECONCILE] migration error:', e.message);
    }
}

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
const FULFILL_STATES = [
    'pending',
    'picking',
    'picked',
    'packed',
    'shipped',
    'delivered',
    'returned', // giao thất bại / khách trả về kho → restock + cancel PBH
    'cancelled',
];

// Import restock helper từ fast-sale-orders (đã export). DRY: cancel PBH +
// reconcile return-failed dùng chung 1 logic.
const fastSaleOrdersRouter = require('./fast-sale-orders');
const restockOrderLines = fastSaleOrdersRouter.restockOrderLines;
// 2026-06-23 FIX: return-failed PHẢI huỷ PBH ĐÚNG NGHĨA (restock + HOÀN VÍ + sync
// native_orders) dùng chung _cancelPbhInTx — trước đây chỉ UPDATE state=cancel +
// restock, BỎ SÓT hoàn wallet_deducted (mất tiền thu hộ) + không sync đơn web.
const _cancelPbhInTx = fastSaleOrdersRouter._cancelPbhInTx;
const syncNativeOrderStatusFromPbh = fastSaleOrdersRouter.syncNativeOrderStatusFromPbh;

// 2026-06-06: chuẩn hoá mã SP khi đối chiếu barcode quét.
// Lý do: máy quét có thể trả mã khác hoa/thường hoặc kèm khoảng trắng so với
// order_lines → trước đây so sánh === thất bại ("SP không có trong PBH") HOẶC
// lưu picked_qty dưới key sai (mã quét) ≠ key line → mapPbh đọc lại = 0
// (nhìn như "không lưu được"). Chuẩn hoá + luôn lưu theo CANONICAL code của line.
function normCode(s) {
    return String(s == null ? '' : s)
        .trim()
        .toUpperCase();
}
function findLineByCode(lines, productCode) {
    const norm = normCode(productCode);
    return lines.find((l) => normCode(l.productCode || l.code) === norm) || null;
}

function userFromReq(req) {
    // Ưu tiên danh tính ĐÃ VERIFY từ token (requireWeb2AuthSoft set req.web2User);
    // chỉ fallback body/header khi soft-mode chưa có token (transition).
    return {
        id: req.web2User?.id || req.body?.userId || req.headers['x-user-id'] || null,
        name: req.web2User?.name || req.body?.userName || req.headers['x-user-name'] || null,
    };
}

// 2026-06-30 (#2/#55): nhận `db` = client (trong transaction) HOẶC pool. Gọi TRONG tx
// với client → audit INSERT cùng tx với mutation (crash giữa COMMIT↔log không còn mất log;
// log fail → tx abort → mutation rollback, audit-trail không lệch). Log fail nâng warn→error
// để monitor được trên Render (camera-verify phụ thuộc bảng này).
async function logAction(db, pbhNumber, action, payload, stateBefore, stateAfter, user) {
    try {
        await db.query(
            `INSERT INTO pbh_fulfillment_logs
               (pbh_number, action, payload, state_before, state_after, user_id, user_name, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
                pbhNumber,
                action,
                JSON.stringify(payload || {}),
                stateBefore,
                stateAfter,
                user.id,
                user.name,
                Date.now(),
            ]
        );
    } catch (e) {
        console.error('[RECONCILE] AUDIT LOG FAILED for', pbhNumber, action, '—', e.message);
        throw e; // trong tx: rethrow → mutation rollback (không để state đổi mà mất audit)
    }
}

function mapPbh(row) {
    if (!row) return null;
    const lines = Array.isArray(row.order_lines) ? row.order_lines : [];
    const picked = Array.isArray(row.fulfillment_picked_lines) ? row.fulfillment_picked_lines : [];
    const pickedByCode = new Map();
    for (const p of picked) {
        if (p && p.productCode)
            pickedByCode.set(normCode(p.productCode), Number(p.picked_qty) || 0);
    }
    // Mỗi line + picked_qty. 2026-06-04: imageUrl ƯU TIÊN ảnh kho hiện tại
    // (row._productImages — tham chiếu web2_products) thay vì snapshot order_lines cũ.
    const imgMap = row._productImages || {};
    const mergedLines = lines.map((l) => {
        const code = l.productCode || l.code || null;
        return {
            productCode: code,
            productName: l.productName || l.name || l.productCode || '',
            quantity: Number(l.quantity) || 0,
            priceUnit: Number(l.priceUnit ?? l.price ?? 0),
            imageUrl: imgMap[code] || l.imageUrl || l.image_url || null,
            picked_qty: pickedByCode.get(normCode(code)) || 0,
        };
    });
    const totalQty = mergedLines.reduce((s, l) => s + l.quantity, 0);
    const totalPicked = mergedLines.reduce((s, l) => s + l.picked_qty, 0);
    return {
        number: row.number,
        displayStt: row.display_stt,
        mergedDisplayStt: row.merged_display_stt || null,
        partner: {
            name: row.partner_name,
            phone: row.partner_phone,
            address: row.partner_address,
        },
        state: row.state,
        fulfillmentState: row.fulfillment_state || 'pending',
        packedAt: row.fulfillment_packed_at != null ? Number(row.fulfillment_packed_at) : null,
        shippedAt: row.fulfillment_shipped_at != null ? Number(row.fulfillment_shipped_at) : null,
        deliveredAt:
            row.fulfillment_delivered_at != null ? Number(row.fulfillment_delivered_at) : null,
        lines: mergedLines,
        totals: {
            quantity: totalQty,
            picked: totalPicked,
            isComplete: totalPicked >= totalQty && totalQty > 0,
        },
        amountTotal: Number(row.amount_total || 0),
        dateInvoice: row.date_invoice,
    };
}

async function getPbh(pool, number) {
    const r = await pool.query(
        `SELECT number, display_stt, merged_display_stt,
                partner_name, partner_phone, partner_address,
                state, fulfillment_state, fulfillment_picked_lines,
                fulfillment_packed_at, fulfillment_shipped_at, fulfillment_delivered_at,
                order_lines, amount_total, date_invoice
         FROM fast_sale_orders WHERE number = $1`,
        [number]
    );
    const row = r.rows[0] || null;
    // 2026-06-04: lấy ảnh SP HIỆN TẠI từ kho (web2_products) theo productCode →
    // reconcile luôn hiện ảnh kho mới nhất (không phụ thuộc snapshot order_lines).
    if (row) {
        const codes = [
            ...new Set(
                (Array.isArray(row.order_lines) ? row.order_lines : [])
                    .map((l) => l.productCode || l.code)
                    .filter(Boolean)
            ),
        ];
        if (codes.length) {
            try {
                const pr = await pool.query(
                    `SELECT code, image_url FROM web2_products WHERE code = ANY($1)`,
                    [codes]
                );
                row._productImages = {};
                for (const p of pr.rows) row._productImages[p.code] = p.image_url;
            } catch (e) {
                /* web2_products có thể chưa tồn tại — bỏ qua, fallback snapshot */
            }
        }
    }
    return row;
}

// -----------------------------------------------------
// GET /health
// -----------------------------------------------------
router.get('/health', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ ok: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        // 2026-06-30 (#15): đếm PBH đã xác nhận theo fulfillment_state + PBH đã trả
        // về kho (state='cancel' + fulfillment='returned') → badge số trên mỗi tab.
        const r = await pool.query(
            `SELECT fulfillment_state, COUNT(*)::int AS n
             FROM fast_sale_orders
             WHERE state IN ('confirmed','done')
                OR (state = 'cancel' AND fulfillment_state = 'returned')
             GROUP BY fulfillment_state`
        );
        const counts = {};
        for (const s of FULFILL_STATES) counts[s] = 0;
        for (const row of r.rows) counts[row.fulfillment_state || 'pending'] = row.n;
        res.json({ ok: true, counts });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// -----------------------------------------------------
// GET /list?state=pending|picking|picked|packed|shipped|delivered|all
// Mặc định: trả về PBH cần xử lý (pending + picking + picked + packed).
// Filter state PBH: chỉ những PBH state='confirmed' hoặc 'done' (đã xác nhận).
// -----------------------------------------------------
router.get('/list', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const stateFilter = req.query.state || 'active';
        const search = req.query.search ? String(req.query.search).trim() : '';
        const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);

        const conds = [];
        const params = [];

        // 2026-06-30 (#21/#42): tab 'Trả về / Hủy' = PBH đã huỷ (state='cancel') +
        // fulfillment_state='returned'. Các tab còn lại CHỈ trên PBH đã xác nhận
        // ('confirmed'/'done') — bỏ 'draft' (khớp comment; PBH tạo tay đã gỡ 410).
        if (stateFilter === 'returned') {
            conds.push(`state = 'cancel'`);
            conds.push(`COALESCE(fulfillment_state,'pending') = 'returned'`);
        } else {
            conds.push(`state IN ('confirmed','done')`);
            if (stateFilter === 'active') {
                conds.push(
                    `COALESCE(fulfillment_state,'pending') IN ('pending','picking','picked','packed')`
                );
            } else if (stateFilter !== 'all' && FULFILL_STATES.includes(stateFilter)) {
                params.push(stateFilter);
                conds.push(`COALESCE(fulfillment_state,'pending') = $${params.length}`);
            }
        }

        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(
                `(partner_name ILIKE $${i} OR partner_phone ILIKE $${i} OR number ILIKE $${i})`
            );
        }

        const where = 'WHERE ' + conds.join(' AND ');
        const r = await pool.query(
            `SELECT number, display_stt, merged_display_stt,
                    partner_name, partner_phone, partner_address,
                    state, fulfillment_state, fulfillment_picked_lines,
                    fulfillment_packed_at, fulfillment_shipped_at, fulfillment_delivered_at,
                    order_lines, amount_total, date_invoice
             FROM fast_sale_orders ${where}
             ORDER BY date_invoice DESC
             LIMIT ${limit}`,
            params
        );
        res.json({ success: true, items: r.rows.map(mapPbh) });
    } catch (e) {
        console.error('[RECONCILE] list error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /logs — audit log TOÀN BỘ PBH (cross-PBH) để đối chiếu camera.
// PHẢI khai báo TRƯỚC '/:number' (nếu không '/logs' bị bắt làm :number='logs').
// Query: action, from (ms), to (ms), search (pbh/SP/người), limit.
// Dùng chính: filter action='manual-pick' + khoảng thời gian → biết tích tay lúc nào → soi camera.
// -----------------------------------------------------
router.get('/logs', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const action = req.query.action ? String(req.query.action).trim() : '';
        const from = req.query.from ? parseInt(req.query.from, 10) : null;
        const to = req.query.to ? parseInt(req.query.to, 10) : null;
        const search = req.query.search ? String(req.query.search).trim() : '';
        const limit = Math.min(parseInt(req.query.limit, 10) || 300, 1000);

        const conds = [];
        const params = [];
        if (action) {
            params.push(action);
            conds.push(`action = $${params.length}`);
        }
        if (Number.isFinite(from)) {
            params.push(from);
            conds.push(`created_at >= $${params.length}`);
        }
        if (Number.isFinite(to)) {
            params.push(to);
            conds.push(`created_at <= $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(
                `(pbh_number ILIKE $${i} OR user_name ILIKE $${i} OR payload->>'productCode' ILIKE $${i})`
            );
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const r = await pool.query(
            `SELECT id, pbh_number, action, payload, state_before, state_after,
                    user_id, user_name, created_at
             FROM pbh_fulfillment_logs
             ${where}
             ORDER BY created_at DESC
             LIMIT ${limit}`,
            params
        );
        res.json({
            success: true,
            logs: r.rows.map((x) => ({
                id: Number(x.id),
                pbhNumber: x.pbh_number,
                action: x.action,
                payload: x.payload || {},
                stateBefore: x.state_before,
                stateAfter: x.state_after,
                userId: x.user_id,
                userName: x.user_name,
                createdAt: Number(x.created_at),
            })),
        });
    } catch (e) {
        console.error('[RECONCILE] logs error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /:number — detail
// -----------------------------------------------------
router.get('/:number', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const row = await getPbh(pool, req.params.number);
        if (!row) return res.status(404).json({ error: 'PBH not found' });
        res.json({ success: true, pbh: mapPbh(row) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// Internal helper: apply pick mutation atomically
// -----------------------------------------------------
async function applyPick(pool, number, mutator, opts = {}) {
    const r = await pool.query(`SELECT * FROM fast_sale_orders WHERE number = $1 FOR UPDATE`, [
        number,
    ]);
    const row = r.rows[0];
    if (!row) throw new Error('PBH not found');
    if (!['draft', 'confirmed', 'done'].includes(row.state)) {
        throw new Error(`PBH state=${row.state} không thể pick (cần draft/confirmed/done)`);
    }
    const lines = Array.isArray(row.order_lines) ? row.order_lines : [];
    const picked = Array.isArray(row.fulfillment_picked_lines) ? row.fulfillment_picked_lines : [];
    const stateBefore = row.fulfillment_state || 'pending';

    if (['packed', 'shipped', 'delivered', 'cancelled'].includes(stateBefore)) {
        throw new Error(`Không thể chỉnh pick khi PBH đã ở state ${stateBefore}`);
    }

    const updated = mutator({ lines, picked });

    // Tính state mới
    const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
    const totalPicked = updated.reduce((s, p) => s + (Number(p.picked_qty) || 0), 0);
    let newState;
    let setPackedAt = false;
    // 2026-06-30 (#7): PBH 0 dòng (order_lines rỗng) → totalQty=0 → '0>=0' true sẽ
    // auto-pack đơn rỗng. Guard: tồn 0 SL ⇒ luôn 'pending', không auto-pack.
    if (totalQty === 0) newState = 'pending';
    else if (totalPicked === 0) newState = 'pending';
    else if (totalPicked >= totalQty) {
        // 2026-06-04: quét ĐỦ SL → tự chuyển 'packed' (đã đối soát đủ → đóng gói luôn,
        // KHÔNG cần bấm nút Đóng gói). Chỉ khi opts.autoPack (từ /scan) + chưa packed.
        // 2026-06-30 (#6): BẤT ĐỐI XỨNG CÓ CHỦ Ý — /manual-pick (tích tay) KHÔNG truyền
        // opts.autoPack → đủ-bằng-tích-tay chỉ tới 'picked', BẮT BUỘC bấm nút "Đóng gói"
        // (chốt người xác nhận cho thao tác không-quét-barcode). Chỉ /scan mới autoPack.
        if (opts.autoPack) {
            newState = 'packed';
            setPackedAt = true;
        } else {
            newState = 'picked';
        }
    } else newState = 'picking';

    if (setPackedAt) {
        await pool.query(
            `UPDATE fast_sale_orders
             SET fulfillment_picked_lines = $1::jsonb,
                 fulfillment_state = $2,
                 fulfillment_packed_at = $4,
                 date_updated = NOW()
             WHERE number = $3`,
            [JSON.stringify(updated), newState, number, Date.now()]
        );
    } else {
        await pool.query(
            `UPDATE fast_sale_orders
             SET fulfillment_picked_lines = $1::jsonb,
                 fulfillment_state = $2,
                 date_updated = NOW()
             WHERE number = $3`,
            [JSON.stringify(updated), newState, number]
        );
    }
    return { stateBefore, stateAfter: newState, picked: updated, lines };
}

// -----------------------------------------------------
// POST /:number/scan — quét 1 SP, +1 picked_qty
// Body: { productCode }
// -----------------------------------------------------
router.post('/:number/scan', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const { number } = req.params;
    const productCode = String(req.body?.productCode || '').trim();
    if (!productCode) return res.status(400).json({ error: 'productCode required' });
    const user = userFromReq(req);

    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        const result = await applyPick(
            client,
            number,
            ({ lines, picked }) => {
                const line = findLineByCode(lines, productCode);
                if (!line) {
                    // Liệt kê mã CẦN quét → user thấy ngay barcode đọc ra giá trị lệch
                    // (label/barcode in sai) so với mã trong đơn.
                    const expected = lines
                        .map((l) => l.productCode || l.code)
                        .filter(Boolean)
                        .join(', ');
                    throw new Error(
                        `Mã "${productCode}" không khớp đơn. Mã cần quét: ${expected || '(đơn không có SP)'}`
                    );
                }
                // Luôn dùng mã canonical của line để lưu → mapPbh đọc lại khớp.
                const code = line.productCode || line.code;
                const existing = picked.find((p) => normCode(p.productCode) === normCode(code));
                const maxQty = Number(line.quantity) || 0;
                if (existing) {
                    if (existing.picked_qty >= maxQty) {
                        throw new Error(
                            `SP ${code} đã đủ (${existing.picked_qty}/${maxQty}). Không thể scan thêm.`
                        );
                    }
                    return picked.map((p) =>
                        normCode(p.productCode) === normCode(code)
                            ? {
                                  ...p,
                                  productCode: code,
                                  picked_qty: p.picked_qty + 1,
                                  last_scan_at: Date.now(),
                              }
                            : p
                    );
                }
                return [...picked, { productCode: code, picked_qty: 1, last_scan_at: Date.now() }];
            },
            { autoPack: true }
        );
        // 2026-06-30 (#2): audit log TRONG tx (trước COMMIT) — cùng client.
        await logAction(
            client,
            number,
            'scan',
            { productCode },
            result.stateBefore,
            result.stateAfter,
            user
        );
        await client.query('COMMIT');

        _notify('scan', number, { productCode });

        const row = await getPbh(pool, number);
        res.json({ success: true, pbh: mapPbh(row) });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.warn('[RECONCILE] scan error:', e.message);
        res.status(400).json({ error: e.message });
    } finally {
        client.release();
    }
});

// -----------------------------------------------------
// POST /:number/manual-pick — set picked_qty trực tiếp 1 line
// Body: { productCode, pickedQty, note? }
// note: lý do tích tay (vd "đối chiếu camera") — lưu vào audit payload.
// -----------------------------------------------------
router.post('/:number/manual-pick', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const { number } = req.params;
    const productCode = String(req.body?.productCode || '').trim();
    const qty = Math.max(0, parseInt(req.body?.pickedQty, 10) || 0);
    const note = req.body?.note ? String(req.body.note).slice(0, 200) : null;
    if (!productCode) return res.status(400).json({ error: 'productCode required' });
    const user = userFromReq(req);

    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        const result = await applyPick(client, number, ({ lines, picked }) => {
            const line = findLineByCode(lines, productCode);
            if (!line) throw new Error(`SP ${productCode} không có trong PBH này`);
            const code = line.productCode || line.code;
            const maxQty = Number(line.quantity) || 0;
            if (qty > maxQty) throw new Error(`picked_qty (${qty}) > quantity (${maxQty})`);
            const filtered = picked.filter((p) => normCode(p.productCode) !== normCode(code));
            if (qty === 0) return filtered;
            return [...filtered, { productCode: code, picked_qty: qty, last_scan_at: Date.now() }];
        });
        // 2026-06-30 (#2): audit log TRONG tx (trước COMMIT).
        await logAction(
            client,
            number,
            'manual-pick',
            { productCode, pickedQty: qty, note },
            result.stateBefore,
            result.stateAfter,
            user
        );
        await client.query('COMMIT');

        _notify('manual-pick', number, { productCode, pickedQty: qty });

        const row = await getPbh(pool, number);
        res.json({ success: true, pbh: mapPbh(row) });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.warn('[RECONCILE] manual-pick error:', e.message);
        res.status(400).json({ error: e.message });
    } finally {
        client.release();
    }
});

// -----------------------------------------------------
// POST /:number/reset-pick — clear toàn bộ picked_lines, về pending
// -----------------------------------------------------
router.post('/:number/reset-pick', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const { number } = req.params;
    const user = userFromReq(req);
    try {
        await ensureTables(pool);
        // FOR UPDATE: lock PBH → check state → reset trong cùng 1 transaction.
        // Idempotent (về 'pending') nên ưu tiên thấp, nhưng lock tránh đè lên
        // thao tác pick song song.
        let stateBefore;
        try {
            stateBefore = await withTransaction(pool, async (client) => {
                const cur = await client.query(
                    `SELECT state, fulfillment_state FROM fast_sale_orders WHERE number = $1 FOR UPDATE`,
                    [number]
                );
                if (cur.rows.length === 0) {
                    const err = new Error('PBH not found');
                    err.httpStatus = 404;
                    throw err;
                }
                // 2026-06-30 (#8): chặn reset PBH đã huỷ/trả về — trước đây chỉ check
                // fulfillment_state, bỏ sót 'returned' + state='cancel' → có thể đưa PBH
                // đã huỷ/restock về 'pending' (mâu thuẫn + mất marker returned).
                if (cur.rows[0].state === 'cancel') {
                    const err = new Error('PBH đã huỷ — không thể reset pick');
                    err.httpStatus = 400;
                    throw err;
                }
                const sBefore = cur.rows[0].fulfillment_state || 'pending';
                if (['packed', 'shipped', 'delivered', 'returned'].includes(sBefore)) {
                    const err = new Error(`Không thể reset khi đã ở state ${sBefore}`);
                    err.httpStatus = 400;
                    throw err;
                }
                await client.query(
                    `UPDATE fast_sale_orders
                     SET fulfillment_picked_lines = '[]'::jsonb,
                         fulfillment_state = 'pending',
                         date_updated = NOW()
                     WHERE number = $1`,
                    [number]
                );
                await logAction(client, number, 'reset-pick', {}, sBefore, 'pending', user);
                return sBefore;
            });
        } catch (e) {
            if (e.httpStatus) return res.status(e.httpStatus).json({ error: e.message });
            throw e;
        }
        _notify('reset-pick', number);
        const row = await getPbh(pool, number);
        res.json({ success: true, pbh: mapPbh(row) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /:number/pack — chuyển → packed
// Block nếu picked_qty < quantity (KHÔNG cho thiếu hàng).
// -----------------------------------------------------
router.post('/:number/pack', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const { number } = req.params;
    const user = userFromReq(req);
    try {
        await ensureTables(pool);
        // 1D-reconcile-no-lock FIX (2026-06-12): read-then-update cũ không lock,
        // và whitelist thiếu → PBH shipped/delivered đủ picked_lines bị kéo LÙI
        // về 'packed'. Giờ: withTransaction + FOR UPDATE + whitelist nguồn
        // ['pending','picking','picked'] (cùng pattern delivery-invoices._changeState).
        let stateBefore;
        try {
            stateBefore = await withTransaction(pool, async (client) => {
                const r = await client.query(
                    `SELECT state, fulfillment_state, order_lines, fulfillment_picked_lines
                     FROM fast_sale_orders WHERE number = $1 FOR UPDATE`,
                    [number]
                );
                if (r.rows.length === 0) {
                    const err = new Error('PBH not found');
                    err.httpStatus = 404;
                    throw err;
                }
                const before = r.rows[0];
                if (!['draft', 'confirmed', 'done'].includes(before.state)) {
                    const err = new Error(`PBH state=${before.state} không thể đóng gói`);
                    err.httpStatus = 400;
                    throw err;
                }
                const sBefore = before.fulfillment_state || 'pending';
                if (!['pending', 'picking', 'picked'].includes(sBefore)) {
                    const err = new Error(
                        `Không đóng gói được từ trạng thái '${sBefore}' (đã packed/shipped/delivered?)`
                    );
                    err.httpStatus = 400;
                    throw err;
                }
                // 2026-06-30 (#14): LUÔN verify đủ hàng (bỏ điều kiện `sBefore !== 'picked'`)
                // — defense-in-depth: nếu state bị set 'picked' do bug/edit ngoài mà
                // picked_lines thiếu, không tin state cũ, vẫn chặn đóng gói thiếu hàng.
                const lines = Array.isArray(before.order_lines) ? before.order_lines : [];
                const picked = Array.isArray(before.fulfillment_picked_lines)
                    ? before.fulfillment_picked_lines
                    : [];
                const pickedMap = new Map(
                    picked.map((p) => [normCode(p.productCode), p.picked_qty || 0])
                );
                const missing = [];
                for (const l of lines) {
                    const code = l.productCode || l.code;
                    const need = Number(l.quantity) || 0;
                    const got = pickedMap.get(normCode(code)) || 0;
                    if (got < need)
                        missing.push({ code, name: l.productName || l.name, need, got });
                }
                if (missing.length > 0) {
                    const err = new Error('Chưa đủ hàng để đóng gói');
                    err.httpStatus = 400;
                    err.missing = missing;
                    throw err;
                }
                await client.query(
                    `UPDATE fast_sale_orders
                     SET fulfillment_state = 'packed',
                         fulfillment_packed_at = $1,
                         date_updated = NOW()
                     WHERE number = $2`,
                    [Date.now(), number]
                );
                await logAction(client, number, 'pack', {}, sBefore, 'packed', user);
                return sBefore;
            });
        } catch (err) {
            if (err.httpStatus)
                return res
                    .status(err.httpStatus)
                    .json({ error: err.message, missing: err.missing });
            throw err;
        }
        _notify('pack', number);
        const row = await getPbh(pool, number);
        res.json({ success: true, pbh: mapPbh(row) });
    } catch (e) {
        console.error('[RECONCILE] pack error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /:number/cancel-pack — hủy đóng gói (packed → picked/picking/pending).
// Undo khi lỡ đóng gói nhầm (chưa giao shipper). Tính lại state từ picked_lines,
// xóa packed_at. Chặn nếu đã shipped/delivered.
// -----------------------------------------------------
router.post('/:number/cancel-pack', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const { number } = req.params;
    const user = userFromReq(req);
    try {
        await ensureTables(pool);
        // 1D-reconcile-no-lock FIX: lock + check + UPDATE cùng transaction —
        // hết race /cancel-pack đua /ship (đọc 'packed' cũ rồi kéo lùi sau khi ship).
        let stateBefore;
        let newState;
        try {
            ({ stateBefore, newState } = await withTransaction(pool, async (client) => {
                const r = await client.query(
                    `SELECT order_lines, fulfillment_state, fulfillment_picked_lines
                     FROM fast_sale_orders WHERE number = $1 FOR UPDATE`,
                    [number]
                );
                if (r.rows.length === 0) {
                    const err = new Error('PBH not found');
                    err.httpStatus = 404;
                    throw err;
                }
                const row = r.rows[0];
                const sBefore = row.fulfillment_state || 'pending';
                if (sBefore !== 'packed') {
                    const err = new Error(
                        `Chỉ hủy đóng gói khi đang ở 'packed' (hiện: ${sBefore})`
                    );
                    err.httpStatus = 400;
                    throw err;
                }
                // Tính lại state từ picked_lines hiện có.
                const lines = Array.isArray(row.order_lines) ? row.order_lines : [];
                const picked = Array.isArray(row.fulfillment_picked_lines)
                    ? row.fulfillment_picked_lines
                    : [];
                const totalQty = lines.reduce((s2, l) => s2 + (Number(l.quantity) || 0), 0);
                const totalPicked = picked.reduce((s2, p) => s2 + (Number(p.picked_qty) || 0), 0);
                let ns = 'picking';
                if (totalPicked === 0) ns = 'pending';
                else if (totalPicked >= totalQty) ns = 'picked';
                await client.query(
                    `UPDATE fast_sale_orders
                     SET fulfillment_state = $1,
                         fulfillment_packed_at = NULL,
                         date_updated = NOW()
                     WHERE number = $2`,
                    [ns, number]
                );
                await logAction(client, number, 'cancel-pack', {}, sBefore, ns, user);
                return { stateBefore: sBefore, newState: ns };
            }));
        } catch (err) {
            if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
            throw err;
        }
        _notify('cancel-pack', number);
        const updated = await getPbh(pool, number);
        res.json({ success: true, pbh: mapPbh(updated) });
    } catch (e) {
        console.error('[RECONCILE] cancel-pack error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /:number/ship — chuyển → shipped
// -----------------------------------------------------
router.post('/:number/ship', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const { number } = req.params;
    const user = userFromReq(req);
    try {
        await ensureTables(pool);
        // 1D-reconcile-no-lock FIX: lock + whitelist + chặn PBH đã huỷ
        // (trước đây không check state → PBH cancel vẫn ship được).
        let stateBefore;
        try {
            stateBefore = await withTransaction(pool, async (client) => {
                const r = await client.query(
                    `SELECT state, fulfillment_state FROM fast_sale_orders
                     WHERE number = $1 FOR UPDATE`,
                    [number]
                );
                if (r.rows.length === 0) {
                    const err = new Error('PBH not found');
                    err.httpStatus = 404;
                    throw err;
                }
                if (r.rows[0].state === 'cancel') {
                    const err = new Error('PBH đã huỷ — không thể giao shipper');
                    err.httpStatus = 400;
                    throw err;
                }
                const sBefore = r.rows[0].fulfillment_state || 'pending';
                if (sBefore !== 'packed') {
                    const err = new Error(
                        `Phải đóng gói trước khi giao shipper (hiện: ${sBefore})`
                    );
                    err.httpStatus = 400;
                    throw err;
                }
                await client.query(
                    `UPDATE fast_sale_orders
                     SET fulfillment_state = 'shipped',
                         fulfillment_shipped_at = $1,
                         date_updated = NOW()
                     WHERE number = $2`,
                    [Date.now(), number]
                );
                await logAction(client, number, 'ship', {}, sBefore, 'shipped', user);
                return sBefore;
            });
        } catch (err) {
            if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
            throw err;
        }
        _notify('ship', number);
        const row = await getPbh(pool, number);
        res.json({ success: true, pbh: mapPbh(row) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /:number/deliver — chuyển → delivered
// -----------------------------------------------------
router.post('/:number/deliver', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const { number } = req.params;
    const user = userFromReq(req);
    try {
        await ensureTables(pool);
        // 1D-reconcile-no-lock FIX: lock + whitelist + chặn PBH đã huỷ.
        let stateBefore;
        try {
            stateBefore = await withTransaction(pool, async (client) => {
                const r = await client.query(
                    `SELECT state, fulfillment_state FROM fast_sale_orders
                     WHERE number = $1 FOR UPDATE`,
                    [number]
                );
                if (r.rows.length === 0) {
                    const err = new Error('PBH not found');
                    err.httpStatus = 404;
                    throw err;
                }
                if (r.rows[0].state === 'cancel') {
                    const err = new Error('PBH đã huỷ — không thể đánh dấu giao thành công');
                    err.httpStatus = 400;
                    throw err;
                }
                const sBefore = r.rows[0].fulfillment_state || 'pending';
                if (sBefore !== 'shipped') {
                    const err = new Error(`Phải ship trước khi giao thành công (hiện: ${sBefore})`);
                    err.httpStatus = 400;
                    throw err;
                }
                await client.query(
                    `UPDATE fast_sale_orders
                     SET fulfillment_state = 'delivered',
                         fulfillment_delivered_at = $1,
                         date_updated = NOW()
                     WHERE number = $2`,
                    [Date.now(), number]
                );
                await logAction(client, number, 'deliver', {}, sBefore, 'delivered', user);
                return sBefore;
            });
        } catch (err) {
            if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
            throw err;
        }
        _notify('deliver', number);
        const row = await getPbh(pool, number);
        res.json({ success: true, pbh: mapPbh(row) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /:number/return-failed — giao thất bại / khách trả lại kho
// Workflow: shipped/delivered → returned. Auto restock + cancel PBH.
//   - fulfillment_state = 'returned'
//   - state = 'cancel' (kế toán: PBH bị hủy)
//   - web2_products.stock += qty (trả tồn về kho) — idempotent qua stock_restored.
//   - Audit log: action='return-failed', state_before, state_after.
// Body (optional): { reason?: string }
// -----------------------------------------------------
router.post('/:number/return-failed', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const { number } = req.params;
    const reason = req.body?.reason || null;
    const user = userFromReq(req);
    try {
        await ensureTables(pool);
        // ATOMIC: lock PBH (FOR UPDATE) → check state → cancel + restock trong
        // CÙNG 1 transaction. Tránh cancel state nhưng restock fail riêng lẻ
        // (mất đồng bộ tồn kho ⊥ state). restockOrderLines nhận client → cùng tx.
        let stateBefore;
        let restockSummary = null;
        let cancelRes = null;
        try {
            ({ stateBefore, restockSummary, cancelRes } = await withTransaction(
                pool,
                async (client) => {
                    const r = await client.query(
                        `SELECT number, fulfillment_state
                         FROM fast_sale_orders WHERE number = $1 FOR UPDATE`,
                        [number]
                    );
                    if (r.rows.length === 0) {
                        const err = new Error('PBH not found');
                        err.httpStatus = 404;
                        throw err;
                    }
                    const sBefore = r.rows[0].fulfillment_state || 'pending';
                    // Cho phép return từ shipped HOẶC delivered (khách nhận rồi trả lại).
                    if (!['shipped', 'delivered'].includes(sBefore)) {
                        const err = new Error(
                            `Chỉ có thể đánh dấu trả về sau khi ship/delivered (hiện: ${sBefore})`
                        );
                        err.httpStatus = 400;
                        throw err;
                    }
                    // Marker trả về (phân biệt với huỷ thường) — set TRƯỚC khi cancel.
                    await client.query(
                        `UPDATE fast_sale_orders SET fulfillment_state = 'returned', date_updated = NOW()
                         WHERE number = $1`,
                        [number]
                    );
                    // Huỷ PBH ĐÚNG NGHĨA: state=cancel + restock + HOÀN VÍ wallet_deducted
                    // (idempotent) — dùng chung _cancelPbhInTx (giống /cancel). FIX: trước
                    // đây chỉ UPDATE state=cancel + restock → BỎ SÓT hoàn ví thu hộ.
                    const cr = await _cancelPbhInTx(
                        client,
                        number,
                        (user && (user.name || user.id)) || '(thu về)'
                    );
                    // 2026-06-30 (#2): audit log TRONG tx — cùng số phận với restock+hoàn ví.
                    await logAction(
                        client,
                        number,
                        'return-failed',
                        { reason, restocked: (cr && cr.restock && cr.restock.restored) || 0 },
                        sBefore,
                        'returned',
                        user
                    );
                    return {
                        stateBefore: sBefore,
                        restockSummary: cr && cr.restock,
                        cancelRes: cr,
                    };
                }
            ));
        } catch (e) {
            if (e.httpStatus) return res.status(e.httpStatus).json({ error: e.message });
            throw e;
        }

        // Sau commit: SSE products (restock) + ví (hoàn) + sync ngược native_orders → cancelled.
        try {
            if (restockSummary && restockSummary.restored > 0 && _notifyClients) {
                _notifyClients(
                    'web2:products',
                    { action: 'pbh-return-restock', ts: Date.now() },
                    'update'
                );
            }
            if (
                cancelRes &&
                cancelRes.walletRefunded > 0 &&
                _notifyClients &&
                cancelRes.prevRow?.partner_phone
            ) {
                _notifyClients(
                    `web2:wallet:${String(cancelRes.prevRow.partner_phone).replace(/\D/g, '')}`,
                    {
                        action: 'pbh-return-refund',
                        phone: cancelRes.prevRow.partner_phone,
                        ts: Date.now(),
                    },
                    'update'
                );
            }
            if (cancelRes && cancelRes.wasNotCancelled && syncNativeOrderStatusFromPbh) {
                const nativeSync = await syncNativeOrderStatusFromPbh(
                    pool,
                    cancelRes.prevRow,
                    'cancel'
                );
                if (nativeSync.synced > 0 && req.app.locals.web2RealtimeSseNotify) {
                    req.app.locals.web2RealtimeSseNotify(
                        'web2:native-orders',
                        {
                            action: 'pbh-state-sync',
                            state: 'cancel',
                            codes: nativeSync.codes,
                            ts: Date.now(),
                        },
                        'update'
                    );
                }
            }
        } catch (e) {
            console.warn('[RECONCILE] return-failed post-cancel sync warn:', e.message);
        }

        _notify('return-failed', number);

        const updated = await getPbh(pool, number);
        res.json({
            success: true,
            pbh: mapPbh(updated),
            restock: restockSummary,
            cancelled: true,
        });
    } catch (e) {
        console.error('[RECONCILE] return-failed error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /:number/logs — audit log
// -----------------------------------------------------
router.get('/:number/logs', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `SELECT id, action, payload, state_before, state_after,
                    user_id, user_name, created_at
             FROM pbh_fulfillment_logs
             WHERE pbh_number = $1
             ORDER BY created_at DESC
             LIMIT 200`,
            [req.params.number]
        );
        res.json({
            success: true,
            logs: r.rows.map((x) => ({
                id: Number(x.id),
                action: x.action,
                payload: x.payload || {},
                stateBefore: x.state_before,
                stateAfter: x.state_after,
                userId: x.user_id,
                userName: x.user_name,
                createdAt: Number(x.created_at),
            })),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.initializeNotifiers = initializeNotifiers;
module.exports = router;
