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
const TARGET_TABLES = [
    'web2_products',
    'web2_variants',
    'web2_product_history',
    'native_orders',
    'web2_cart_history',
    'fast_sale_orders',
    'refunds',
];

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
        const out = [];
        for (const t of TARGET_TABLES) {
            if (!(await tableExists(db, t))) {
                out.push({ table: t, exists: false });
                continue;
            }
            const n = Number((await db.query(`SELECT COUNT(*)::bigint n FROM "${t}"`)).rows[0].n);
            out.push({ table: t, exists: true, rows: n });
        }
        res.json({ success: true, tables: out });
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

    const tag = tsTag();
    const steps = [];
    try {
        // 1. BACKUP
        const backups = [];
        for (const t of TARGET_TABLES) {
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
        steps.push({ step: 'backup', backups });

        if (mode === 'backup') {
            return res.json({ success: true, mode, dryRun, tag, steps });
        }

        // 2. WIPE (TRUNCATE) — RESTART IDENTITY reset BIGSERIAL về 1
        if (!dryRun) {
            for (const t of TARGET_TABLES) {
                if (await tableExists(db, t)) {
                    await db.query(`TRUNCATE TABLE "${t}" RESTART IDENTITY`);
                }
            }
        }
        steps.push({ step: 'truncate', tables: TARGET_TABLES, done: !dryRun });

        res.json({
            success: true,
            mode,
            dryRun,
            tag,
            steps,
            next: 'Seed data ảo mới qua POST /api/web2-variants + /api/web2-products (mã SP gen bằng Web2ProductCode).',
        });
    } catch (e) {
        console.error('[web2-data-reset] error:', e.message);
        res.status(500).json({ success: false, error: e.message, steps });
    }
});

module.exports = router;
