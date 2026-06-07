// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — admin backup + reset data SP/đơn/PBH (giữ KH). | WEB2.0 module.
// =====================================================================
// ADMIN WEB2 DATA RESET — backup + wipe data Sản phẩm / Đơn Web / PBH / Cart
// trên web2Db (Render n2store-web2-db) để tạo lại data ảo mới với mã SP đúng
// logic Web2ProductCode.
//
// GIỮ NGUYÊN: customers, ví KH/NCC, balance_history (dữ liệu khách).
// CHỈ đụng web2Db. Từ chối nếu web2Db === chatDb (tránh đụng Web 1.0).
// Auto-backup TRƯỚC mọi wipe (CREATE TABLE <t>_bak_<ts>).
//
//   POST /api/admin/web2-data-reset  { confirm:'YES-RESET', mode, dryRun }
//        Header x-admin-secret = CLEANUP_SECRET
//        mode: 'backup' (chỉ backup) | 'wipe' (backup + TRUNCATE)
//   GET  /api/admin/web2-data-reset/status — list bảng + rowcount
// =====================================================================

const express = require('express');
const router = express.Router();

const ADMIN_SECRET = process.env.CLEANUP_SECRET || '';
function authOk(req) {
    const p = req.headers['x-admin-secret'] || req.query.secret || '';
    return ADMIN_SECRET && p === ADMIN_SECRET;
}

// Bảng data SP/đơn/PBH/cart cần wipe khi tạo lại data ảo. KHÔNG gồm bảng KH/ví.
const PRODUCT_TABLES = [
    'web2_products',
    'web2_variants',
    'web2_product_history',
    'native_orders',
    'web2_cart_history',
    'fast_sale_orders',
    'refunds',
];

// Module Theo dõi nhập hàng (supplier-debt/aging/360). FK: shipments+order_bookings
// → suppliers. TRUNCATE cần CASCADE. Liệt kê children trước cho rõ.
const INVENTORY_TABLES = [
    'inventory_shipments',
    'inventory_order_bookings',
    'inventory_prepayments',
    'inventory_other_expenses',
    'inventory_edit_history',
    'inventory_suppliers',
];

// [2026-06-07] target='web2-all' — wipe data GIAO DỊCH Web 2.0 do shop tạo trên
// web2Db. CHỪA LẠI:
//   - Cấu hình: web2_variants, web2_users, web2_user_sessions, web2_entities,
//     web2_payment_qr_codes
//   - KHÁCH HÀNG (hồ sơ): web2_customers, web2_order_customers (tên/SĐT/địa chỉ
//     KH đơn hàng — 2026-06-03 tách kho KH), partner-customer (web2_records)
//   - TPOS shadow/reference (web2_records: product, producttemplate, tag,
//     partner-customer, deliveryzone, printer, …) — KHÔNG truncate cả bảng.
// "Xóa tiền giữ KH": ví/giao dịch/SePay wipe; hồ sơ KH giữ nguyên.
// NCC (web2_suppliers / web2_supplier_wallet) ở Firestore → wipe phía client.
// PBH shadow `fastsaleorder-invoice` (web2_records) → xoá slug riêng (delete-all),
// KHÔNG truncate cả web2_records (sẽ mất 92k partner-customer + TPOS shadow).
// KHÔNG dùng CASCADE: nếu 1 bảng GIỮ ref tới bảng WIPE → TRUNCATE fail (an toàn,
// fail loud) thay vì âm thầm xoá data KH/cấu hình.
const WEB2_ALL_TABLES = [
    // Sản phẩm + Sổ Order sync
    'web2_products',
    'web2_product_history',
    // Đơn Web + PBH (table native) + trả/thu
    'native_orders',
    'fast_sale_orders',
    'refunds',
    'web2_returns',
    'web2_cart_history',
    // KPI + đối soát
    'web2_kpi_events',
    'web2_match_audit',
    'web2_pending_matches',
    // Tin nhắn / hàng đợi
    'web2_msg_send_jobs',
    'web2_msg_send_items',
    'web2_unread_messages',
    'web2_webhook_retry_queue',
    // Intent (derived từ chat) + blacklist trích xuất
    'web2_customer_intents',
    'web2_extraction_blacklist',
    // Tiền KH (xóa tiền, GIỮ hồ sơ KH) + SePay
    'web2_customer_wallets',
    'web2_wallet_transactions',
    'web2_wallet_adjustments',
    'web2_balance_history',
    'web2_payment_signals',
];

function pickTables(target) {
    if (target === 'inventory') return INVENTORY_TABLES;
    if (target === 'web2-all') return WEB2_ALL_TABLES;
    return PRODUCT_TABLES;
}
// Backward-compat: GET /status vẫn report product tables.
const TARGET_TABLES = PRODUCT_TABLES;

function tsTag() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

async function tableExists(db, name) {
    const r = await db.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
        [name]
    );
    return r.rows.length > 0;
}

// GET status — rowcount mỗi bảng target
router.get('/web2-data-reset/status', async (req, res) => {
    if (!authOk(req)) return res.status(403).json({ error: 'forbidden' });
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!db) return res.status(500).json({ error: 'web2Db unavailable' });
    try {
        const tables = pickTables(req.query.target);
        const out = [];
        for (const t of tables) {
            if (!(await tableExists(db, t))) {
                out.push({ table: t, exists: false });
                continue;
            }
            const n = Number((await db.query(`SELECT COUNT(*)::bigint n FROM "${t}"`)).rows[0].n);
            out.push({ table: t, exists: true, rows: n });
        }
        res.json({ success: true, target: req.query.target || 'products', tables: out });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/web2-data-reset', async (req, res) => {
    if (!authOk(req)) return res.status(403).json({ error: 'forbidden' });
    const body = req.body || {};
    const mode = body.mode || 'backup';
    const dryRun = body.dryRun === true;
    if (!['backup', 'wipe'].includes(mode)) {
        return res.status(400).json({ error: 'mode phải: backup | wipe' });
    }
    if (mode === 'wipe' && !dryRun && body.confirm !== 'YES-RESET') {
        return res.status(400).json({ error: "cần confirm:'YES-RESET' khi mode=wipe" });
    }
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    const chatDb = req.app.locals.chatDb;
    if (!db) return res.status(500).json({ error: 'web2Db unavailable' });
    if (db === chatDb) {
        return res.status(400).json({
            error: 'web2Db === chatDb (WEB2_DATABASE_URL unset) — TỪ CHỐI để không đụng Web 1.0',
        });
    }

    const target = ['inventory', 'web2-all'].includes(body.target) ? body.target : 'products';
    const tables = pickTables(target);
    const tag = tsTag();
    const steps = [];
    try {
        // 1. BACKUP
        const backups = [];
        for (const t of tables) {
            if (!(await tableExists(db, t))) {
                backups.push({ table: t, skipped: 'không tồn tại' });
                continue;
            }
            const cnt = Number((await db.query(`SELECT COUNT(*)::bigint n FROM "${t}"`)).rows[0].n);
            const bak = `${t}_bak_${tag}`;
            if (!dryRun) {
                await db.query(`DROP TABLE IF EXISTS "${bak}"`);
                await db.query(`CREATE TABLE "${bak}" AS TABLE "${t}"`);
            }
            backups.push({ table: t, rows: cnt, backupTable: bak, done: !dryRun });
        }
        steps.push({ step: 'backup', target, backups });

        if (mode === 'backup') {
            return res.json({ success: true, mode, target, dryRun, tag, steps });
        }

        // 2. WIPE (TRUNCATE) — RESTART IDENTITY reset serial về 1.
        // Inventory có FK (shipments+order_bookings → suppliers) → CASCADE.
        if (!dryRun) {
            const existing = [];
            for (const t of tables) {
                if (await tableExists(db, t)) existing.push(`"${t}"`);
            }
            if (existing.length) {
                // web2-all KHÔNG cascade: bảo vệ bảng GIỮ (KH/cấu hình) — nếu có FK
                // tới bảng wipe thì TRUNCATE fail loud thay vì âm thầm xoá lan.
                const cascade = target === 'inventory' ? ' CASCADE' : '';
                await db.query(`TRUNCATE TABLE ${existing.join(', ')} RESTART IDENTITY${cascade}`);
            }
        }
        steps.push({ step: 'truncate', target, tables, done: !dryRun });

        res.json({
            success: true,
            mode,
            target,
            dryRun,
            tag,
            steps,
            next:
                target === 'inventory'
                    ? 'Seed lại qua POST /api/web2/inventory-tracking/shipments (auto-create supplier).'
                    : 'Seed data ảo mới qua POST /api/web2-variants + /api/web2-products.',
        });
    } catch (e) {
        console.error('[web2-data-reset] error:', e.message);
        res.status(500).json({ success: false, error: e.message, steps });
    }
});

// =====================================================================
// POST /web2-rename-to-nj — sửa data hiện tại cho khớp NJ (one-off).
// - Xoá order test (fb_user_id LIKE 'TEST-NJ-%').
// - native_orders.code: NW-... → NJ-... (skip nếu NJ-... đã tồn tại).
// - fast_sale_orders: number = mã đơn web mới (NJ, = source); split → -N. source_code NW→NJ.
// - pbh_fulfillment_logs.pbh_number map theo PBH number mới.
//   Body: { dryRun? }  Header x-admin-secret = CLEANUP_SECRET
// =====================================================================
router.post('/web2-rename-to-nj', async (req, res) => {
    if (!authOk(req)) return res.status(403).json({ error: 'forbidden' });
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!db) return res.status(500).json({ error: 'web2Db unavailable' });
    if (db === req.app.locals.chatDb) {
        return res.status(400).json({ error: 'web2Db === chatDb — từ chối (tránh Web 1.0)' });
    }
    const dryRun = req.body?.dryRun === true;
    const client = await db.connect();
    const steps = [];
    try {
        await client.query('BEGIN');

        // 0. Xoá order test NJ verification
        const delPbh = await client.query(
            `DELETE FROM fast_sale_orders
             WHERE source_code IN (SELECT code FROM native_orders WHERE fb_user_id LIKE 'TEST-NJ-%')
             RETURNING number`
        );
        const delNat = await client.query(
            `DELETE FROM native_orders WHERE fb_user_id LIKE 'TEST-NJ-%' RETURNING code`
        );
        steps.push({
            step: 'delete-test',
            pbh: delPbh.rows.map((r) => r.number),
            native: delNat.rows.map((r) => r.code),
        });

        // 1. native code map NW-X → NJ-X (skip nếu target tồn tại)
        const nat = (
            await client.query(
                `SELECT code FROM native_orders WHERE code LIKE 'NW-%' ORDER BY code`
            )
        ).rows;
        const natMap = {};
        for (const r of nat) {
            const nc = r.code.replace(/^NW-/, 'NJ-');
            const exists = (await client.query(`SELECT 1 FROM native_orders WHERE code = $1`, [nc]))
                .rows.length;
            if (exists) {
                steps.push({ skipNative: r.code, reason: `${nc} đã tồn tại` });
                continue;
            }
            natMap[r.code] = nc;
        }

        // 2. PBH number map: number = source mới (NJ), split → -N
        const fso = (
            await client.query(
                `SELECT number, source_code, split_index FROM fast_sale_orders
                 WHERE number LIKE 'HD-%' OR source_code LIKE '%NW-%'
                 ORDER BY split_index ASC NULLS FIRST, date_created ASC`
            )
        ).rows;
        const pbhMap = {};
        const srcSeen = {};
        for (const r of fso) {
            let newSrc = r.source_code || '';
            for (const [o, n] of Object.entries(natMap)) newSrc = newSrc.split(o).join(n);
            const base = newSrc.replace(/^NW-/, 'NJ-');
            srcSeen[base] = (srcSeen[base] || 0) + 1;
            const newNum = srcSeen[base] === 1 ? base : `${base}-${srcSeen[base]}`;
            pbhMap[r.number] = { newNum, newSrc };
        }

        if (dryRun) {
            await client.query('ROLLBACK');
            return res.json({ success: true, dryRun: true, natMap, pbhMap, steps });
        }

        // 3. Apply — logs trước (ref số PBH cũ), rồi FSO, rồi native.
        for (const [oldNum, m] of Object.entries(pbhMap)) {
            await client
                .query(`UPDATE pbh_fulfillment_logs SET pbh_number = $1 WHERE pbh_number = $2`, [
                    m.newNum,
                    oldNum,
                ])
                .catch(() => {});
            await client.query(
                `UPDATE fast_sale_orders SET number = $1, source_code = $2 WHERE number = $3`,
                [m.newNum, m.newSrc, oldNum]
            );
        }
        for (const [oldCode, newCode] of Object.entries(natMap)) {
            // FSO source_code chứa native code cũ nhưng number không HD (đã xử lý trên) — update source.
            await client.query(
                `UPDATE fast_sale_orders SET source_code = REPLACE(source_code, $1, $2)
                 WHERE source_code LIKE '%' || $1 || '%'`,
                [oldCode, newCode]
            );
            await client.query(`UPDATE native_orders SET code = $1 WHERE code = $2`, [
                newCode,
                oldCode,
            ]);
        }
        await client.query('COMMIT');
        res.json({ success: true, natMap, pbhMap, steps });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[web2-rename-to-nj] error:', e.message);
        res.status(500).json({ success: false, error: e.message, steps });
    } finally {
        client.release();
    }
});

module.exports = router;
