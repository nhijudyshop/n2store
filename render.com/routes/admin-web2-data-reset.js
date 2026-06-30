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
    // [2026-06-20] Require x-admin-secret HEADER only. The ?secret= query
    // fallback was removed: the global request logger (server.js) prints
    // req.url (incl. query string) for every admin call, so a secret passed
    // via ?secret= leaked CLEANUP_SECRET into Render logs in plaintext.
    const p = req.headers['x-admin-secret'] || '';
    return ADMIN_SECRET && p === ADMIN_SECRET;
}

// Bảng data SP/đơn/PBH/cart cần wipe khi tạo lại data ảo. KHÔNG gồm bảng KH/ví.
const PRODUCT_TABLES = [
    'web2_products',
    'web2_variants',
    'web2_product_history',
    'web2_product_units', // per-unit (mã đơn vị + QR)
    'web2_product_unit_events',
    'native_orders',
    'web2_cart_history',
    'fast_sale_orders',
    'refunds',
];

// [2026-06-28] target='reset-flow' — wipe ĐÚNG 9 domain luồng mua→bán→kho user yêu cầu:
//   Sổ Order · Kho SP (+per-unit) · Đơn Web · PBH · Đối soát đóng gói · Công nợ NCC ·
//   Ví NCC · purchase-refund (ghi vào supplier_ledger) · CK dashboard.
// GIỮ NGUYÊN: web2_variants, web2_users, web2_customers, web2_records (cấu hình + hồ sơ).
// KHÔNG CASCADE (TRUNCATE nhiều bảng 1 lệnh tự xử FK giữa chúng); backup trước khi xoá.
const RESET_FLOW_TABLES = [
    // Sổ Order (mua từ NCC) + ảnh đợt
    'web2_so_order',
    'web2_so_order_images',
    // Kho SP + per-unit (mã đơn vị + QR + lịch sử)
    'web2_products',
    'web2_product_history',
    'web2_product_units',
    'web2_product_unit_events',
    // Đơn Web + giỏ
    'native_orders',
    'web2_cart_history',
    // PBH
    'fast_sale_orders',
    // Đối soát đóng gói
    'pbh_fulfillment_logs',
    // NCC: công nợ + ví (ledger giao dịch + meta số dư)
    'web2_supplier_ledger',
    'web2_supplier_meta',
    // CK dashboard
    'web2_payment_signals',
    'web2_customer_intents',
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
//   - KHÁCH HÀNG (hồ sơ): web2_customers (warehouse KH riêng Web 2.0 — 2026-06-07
//     gộp 1 kho duy nhất, KHÔNG TPOS), partner-customer (web2_records)
//   - TPOS shadow/reference (web2_records: product, producttemplate, tag,
//     partner-customer, deliveryzone, printer, …) — KHÔNG truncate cả bảng.
// "Xóa tiền giữ KH": ví/giao dịch/SePay wipe; hồ sơ KH giữ nguyên.
// NCC (web2_suppliers / web2_supplier_wallet) ở Firestore → wipe phía client.
// PBH thật nằm ở bảng riêng `fast_sale_orders` (đã có trong WEB2_ALL_TABLES → được
// TRUNCATE). web2_records KHÔNG bị đụng ở target='web2-all' (giữ 92k partner-customer
// + TPOS shadow). (AUDIT 2026-06-20 #LOW1: sửa comment cũ mô tả sai 1 bước per-slug
// delete 'fastsaleorder-invoice' từ web2_records mà code KHÔNG hề thực thi.)
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

// [2026-06-09] target='ck' — wipe CHỈ data của Dashboard đối soát CK
// (web2/ck-dashboard/). 2 bảng nguồn của 3 cột + tab Lịch sử CK. KHÔNG đụng
// đơn/PBH/ví. web2_unread_messages (tab "Tin nhắn chưa đọc") là chat inbox,
// KHÔNG phải data CK → giữ nguyên.
const CK_TABLES = ['web2_payment_signals', 'web2_customer_intents'];

function pickTables(target) {
    if (target === 'inventory') return INVENTORY_TABLES;
    if (target === 'web2-all') return WEB2_ALL_TABLES;
    if (target === 'ck') return CK_TABLES;
    if (target === 'reset-flow') return RESET_FLOW_TABLES;
    return PRODUCT_TABLES;
}
// Backward-compat: GET /status vẫn report product tables.
const TARGET_TABLES = PRODUCT_TABLES;

function tsTag() {
    // AUDIT 2026-06-20 #LOW2: thêm giây + random suffix → 2 reset cùng phút KHÔNG
    // còn trùng tên bảng backup `<t>_bak_<tag>` (đồng bộ admin-web2-wallet-reset.js).
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const rnd = require('crypto').randomBytes(2).toString('hex');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${rnd}`;
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

    const target = ['inventory', 'web2-all', 'ck', 'reset-flow'].includes(body.target)
        ? body.target
        : 'products';
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

// =====================================================================
// POST /web2-cleanup-dead — dọn DB chết Web 2.0 (beta):
//   1. DROP mọi bảng backup `*_bak_*` (an toàn — beta, wipe đã verify).
//   2. DELETE web2_records orphan slug `deliveryzone`/`printer` (đã sang bảng
//      riêng web2_delivery_zones/web2_printers — bản trong web2_records dead).
//   GET /web2-tables — list mọi bảng web2Db để soi dead table.
//   Header x-admin-secret = CLEANUP_SECRET. Body { confirm:'YES-CLEANUP' }.
//   CHỈ web2Db (từ chối nếu === chatDb).
// =====================================================================
router.get('/web2-tables', async (req, res) => {
    if (!authOk(req)) return res.status(403).json({ error: 'forbidden' });
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!db) return res.status(500).json({ error: 'web2Db unavailable' });
    try {
        const r = await db.query(
            `SELECT tablename,
                    pg_size_pretty(pg_total_relation_size('"'||tablename||'"')) AS size
             FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
        );
        res.json({ success: true, count: r.rows.length, tables: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/web2-cleanup-dead', async (req, res) => {
    if (!authOk(req)) return res.status(403).json({ error: 'forbidden' });
    if ((req.body || {}).confirm !== 'YES-CLEANUP') {
        return res.status(400).json({ error: "cần confirm:'YES-CLEANUP'" });
    }
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!db) return res.status(500).json({ error: 'web2Db unavailable' });
    if (db === req.app.locals.chatDb) {
        return res.status(400).json({ error: 'web2Db === chatDb — từ chối (tránh Web 1.0)' });
    }
    const out = { droppedBackups: [], web2RecordsOrphansDeleted: 0 };
    try {
        // 1. Drop backup tables `*_bak_*`
        const baks = await db.query(
            `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE '%\\_bak\\_%'`
        );
        for (const row of baks.rows) {
            await db.query(`DROP TABLE IF EXISTS "${row.tablename}"`);
            out.droppedBackups.push(row.tablename);
        }
        // 2. Delete web2_records orphans (đã sang bảng riêng)
        const orphan = await db.query(
            `DELETE FROM web2_records WHERE entity_slug IN ('deliveryzone','printer') RETURNING id`
        );
        out.web2RecordsOrphansDeleted = orphan.rowCount;
        // 3. VACUUM (non-full) để cập nhật stats
        await db.query(`VACUUM ANALYZE web2_records`).catch(() => {});
        res.json({ success: true, ...out });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message, ...out });
    }
});

// =====================================================================
// POST /web2-wipe-9pages — Wipe data của 9 trang VẬN HÀNH Web 2.0 do shop
// tạo (beta), + data downstream LIÊN KẾT để KHÔNG còn trạng thái mồ côi:
//   Đơn Web (native_orders), PBH (fast_sale_orders + history),
//   Đối soát/giao (pbh_fulfillment_logs), Sổ Order (web2_so_order),
//   Kho SP (web2_products + history), Ví/Công nợ NCC (web2_supplier_ledger/
//   _meta + sequence), CK dashboard (web2_payment_signals + customer_intents),
//   Trả hàng NCC (web2_records[slug=purchase-refund]),
//   + downstream: ví KH (web2_customer_wallets/_wallet_transactions/_adjustments),
//     KPI (web2_kpi_*), cart, campaign-cha, web2_returns, pending matches;
//     + UNLINK (giữ dòng) các dòng web2_balance_history đã match.
//
// GIỮ NGUYÊN (KHÔNG đụng): web2_customers (hồ sơ KH), web2_balance_history
//   (log SePay gốc — chỉ reset cờ match), web2_variants (Kho Biến Thể — trang
//   riêng), web2_order_tags (catalog tag — CONFIG), web2_payment_qr_codes (QR
//   thanh toán — CONFIG), web2_users/_user_sessions/_entities/_zalo_accounts/
//   _migrations, web2_records (TRỪ slug 'purchase-refund').
//
// Auto-backup <t>_bak_<tag> TRƯỚC mọi thao tác. KHÔNG CASCADE (fail loud nếu
// 1 bảng NGOÀI danh sách FK tới bảng wipe). web2Db only.
//   Body { confirm:'YES-RESET', dryRun? }  Header x-admin-secret = CLEANUP_SECRET
// =====================================================================
const WIPE9_TRUNCATE = [
    // Đơn / PBH / đối soát-giao
    'native_orders',
    'fast_sale_orders',
    'fast_sale_order_history',
    'pbh_fulfillment_logs',
    // Sổ Order + Kho SP
    'web2_so_order',
    'web2_products',
    'web2_product_history',
    // Ví / Công nợ NCC
    'web2_supplier_ledger',
    'web2_supplier_meta',
    // CK dashboard
    'web2_payment_signals',
    'web2_customer_intents',
    // Ví KH (downstream của PBH/CK — xóa để không mồ côi)
    'web2_customer_wallets',
    'web2_wallet_transactions',
    'web2_wallet_adjustments',
    // KPI (derived từ đơn)
    'web2_kpi_assignments',
    'web2_kpi_assignments_history',
    'web2_kpi_events',
    // Phụ trợ đơn/SP
    'web2_cart_history',
    'web2_campaign_products',
    'web2_live_parent_campaigns',
    'web2_returns',
    'web2_pending_matches',
    // [2026-06-30] KHÔNG wipe 2 bảng CONFIG sau (danh mục, KHÔNG phải data giao
    // dịch — cùng nhóm web2_variants; target 'web2-all' cũng GIỮ chúng). Wipe nhầm
    // → mất tag toàn hệ + QR cấu hình, phải restore từ backup:
    //   'web2_order_tags',       — catalog định nghĩa tag (cho_hang/khach_la/…), seed lúc boot
    //   'web2_payment_qr_codes', — QR thanh toán cấu hình
];
const WIPE9_RECORDS_SLUG = 'purchase-refund';
const WIPE9_SEQUENCE = 'web2_supplier_move_seq';
const WIPE9_BALANCE_TABLE = 'web2_balance_history';
const WIPE9_BALANCE_MATCHED_WHERE =
    'linked_customer_phone IS NOT NULL OR wallet_processed = TRUE OR debt_added = TRUE';

router.post('/web2-wipe-9pages', async (req, res) => {
    if (!authOk(req)) return res.status(403).json({ error: 'forbidden' });
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!db) return res.status(500).json({ error: 'web2Db unavailable' });
    if (db === req.app.locals.chatDb) {
        return res.status(400).json({
            error: 'web2Db === chatDb (WEB2_DATABASE_URL unset) — TỪ CHỐI để không đụng Web 1.0',
        });
    }
    const dryRun = req.body?.dryRun === true;
    if (!dryRun && req.body?.confirm !== 'YES-RESET') {
        return res.status(400).json({ error: "cần confirm:'YES-RESET' (hoặc dryRun:true)" });
    }
    const tag = tsTag();
    const out = {
        dryRun,
        tag,
        truncate: [],
        recordsPurchaseRefund: null,
        sequence: null,
        balanceUnlink: null,
    };
    try {
        // FK cascade-risk guard: nếu 1 bảng NGOÀI danh sách wipe FK tới bảng wipe,
        // TRUNCATE (no-cascade) sẽ fail → báo trước & DỪNG (không âm thầm xoá lan).
        const wipeSet = new Set(WIPE9_TRUNCATE);
        const { rows: fks } = await db.query(`
            SELECT tc.table_name AS child, ccu.table_name AS parent
            FROM information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
            WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'`);
        const cascadeRisk = fks.filter((f) => wipeSet.has(f.parent) && !wipeSet.has(f.child));
        if (cascadeRisk.length) {
            return res.status(409).json({
                error: 'FK cascade-risk: bảng NGOÀI danh sách tham chiếu bảng wipe — DỪNG',
                cascadeRisk,
            });
        }

        // 1. Backup + count + collect existing truncate targets.
        const existing = [];
        for (const t of WIPE9_TRUNCATE) {
            if (!(await tableExists(db, t))) {
                out.truncate.push({ table: t, exists: false });
                continue;
            }
            const n = Number((await db.query(`SELECT COUNT(*)::bigint n FROM "${t}"`)).rows[0].n);
            const bak = `${t}_bak_${tag}`;
            if (!dryRun) {
                await db.query(`DROP TABLE IF EXISTS "${bak}"`);
                await db.query(`CREATE TABLE "${bak}" AS TABLE "${t}"`);
            }
            out.truncate.push({ table: t, rows: n, backupTable: dryRun ? null : bak });
            existing.push(`"${t}"`);
        }

        // 2. web2_records slug='purchase-refund' (PARTIAL — chỉ slug này; bảng đa-tenant).
        if (await tableExists(db, 'web2_records')) {
            const n = Number(
                (
                    await db.query(
                        `SELECT COUNT(*)::bigint n FROM web2_records WHERE entity_slug=$1`,
                        [WIPE9_RECORDS_SLUG]
                    )
                ).rows[0].n
            );
            let bak = null;
            if (!dryRun && n > 0) {
                bak = `web2_records_prefund_bak_${tag}`;
                await db.query(`DROP TABLE IF EXISTS "${bak}"`);
                await db.query(
                    `CREATE TABLE "${bak}" AS SELECT * FROM web2_records WHERE entity_slug=$1`,
                    [WIPE9_RECORDS_SLUG]
                );
            }
            out.recordsPurchaseRefund = { rows: n, backupTable: bak };
        }

        // 3. web2_balance_history — count matched rows (sẽ UNLINK, GIỮ dòng).
        if (await tableExists(db, WIPE9_BALANCE_TABLE)) {
            const n = Number(
                (
                    await db.query(
                        `SELECT COUNT(*)::bigint n FROM ${WIPE9_BALANCE_TABLE} WHERE ${WIPE9_BALANCE_MATCHED_WHERE}`
                    )
                ).rows[0].n
            );
            let bak = null;
            if (!dryRun) {
                bak = `${WIPE9_BALANCE_TABLE}_bak_${tag}`;
                await db.query(`DROP TABLE IF EXISTS "${bak}"`);
                await db.query(`CREATE TABLE "${bak}" AS TABLE "${WIPE9_BALANCE_TABLE}"`);
            }
            out.balanceUnlink = { matchedRows: n, backupTable: bak };
        }

        // 4. Sequence presence.
        const seqExists =
            (
                await db.query(
                    `SELECT 1 FROM information_schema.sequences WHERE sequence_schema='public' AND sequence_name=$1`,
                    [WIPE9_SEQUENCE]
                )
            ).rows.length > 0;
        out.sequence = { name: WIPE9_SEQUENCE, exists: seqExists, reset: false };

        if (dryRun) {
            return res.json({ success: true, ...out, note: 'DRY-RUN — chưa đụng gì' });
        }

        // ===== EXECUTE =====
        if (existing.length) {
            await db.query(`TRUNCATE TABLE ${existing.join(', ')} RESTART IDENTITY`);
        }
        if (out.recordsPurchaseRefund && out.recordsPurchaseRefund.rows > 0) {
            const r = await db.query(`DELETE FROM web2_records WHERE entity_slug=$1`, [
                WIPE9_RECORDS_SLUG,
            ]);
            out.recordsPurchaseRefund.deleted = r.rowCount;
        }
        if (seqExists) {
            await db.query(`ALTER SEQUENCE "${WIPE9_SEQUENCE}" RESTART`);
            out.sequence.reset = true;
        }
        if (out.balanceUnlink) {
            const r = await db.query(
                `UPDATE ${WIPE9_BALANCE_TABLE}
                 SET linked_customer_phone = NULL, display_name = NULL, match_method = NULL,
                     debt_added = FALSE, wallet_processed = FALSE, verification_status = 'PENDING',
                     verified_by = NULL, verified_at = NULL
                 WHERE ${WIPE9_BALANCE_MATCHED_WHERE}`
            );
            out.balanceUnlink.updated = r.rowCount;
        }
        console.log(
            `[web2-wipe-9pages] EXECUTED tag=${tag} truncated=${existing.length} prefund=${out.recordsPurchaseRefund?.deleted || 0} seqReset=${out.sequence.reset} balanceUnlinked=${out.balanceUnlink?.updated || 0}`
        );
        return res.json({ success: true, ...out });
    } catch (e) {
        console.error('[web2-wipe-9pages] error:', e.message);
        return res.status(500).json({ success: false, error: e.message, ...out });
    }
});

module.exports = router;
