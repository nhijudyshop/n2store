// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — admin backup + reset ví/matching web2Db (lấy lại số dư từ đầu).
// =====================================================================
// ADMIN WEB2 WALLET RESET — backup + xóa data ví/matching Web 2.0 → rebuild.
//
// CHỈ đụng web2Db (n2store_web2). TUYỆT ĐỐI không đụng Web 1.0 (chatDb).
// Auto-backup TRƯỚC mọi wipe (CREATE TABLE <t>_bak_<ts>).
//
// Modes:
//   backup        — chỉ backup 6 bảng → <t>_bak_<ts> (không xóa gì).
//   reset-rematch — backup + TRUNCATE ví/transactions/adjustments/pending/audit
//                   + RESET assignments trên web2_balance_history (giữ SePay log)
//                   → rồi gọi /reprocess-unmatched để re-match sạch.
//   full-wipe     — backup + TRUNCATE TẤT CẢ 6 bảng (kể cả balance_history).
//
//   POST /api/admin/web2-wallet-reset  { confirm:'YES-RESET', mode, dryRun }
//        Header x-admin-secret = CLEANUP_SECRET
//   GET  /api/admin/web2-wallet-reset/backups — list bảng _bak_*
// =====================================================================

const express = require('express');
const router = express.Router();

const ADMIN_SECRET = process.env.CLEANUP_SECRET || '';
function authOk(req) {
    const p = req.headers['x-admin-secret'] || req.query.secret || '';
    return ADMIN_SECRET && p === ADMIN_SECRET;
}

// 6 bảng ví/matching Web 2.0 (derived). balance_history = SePay log (giữ ở reset-rematch).
const DERIVED = [
    'web2_customer_wallets',
    'web2_wallet_transactions',
    'web2_wallet_adjustments',
    'web2_pending_matches',
    'web2_match_audit',
];
const SEPAY_LOG = 'web2_balance_history';
const ALL_TABLES = [...DERIVED, SEPAY_LOG];

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

router.post('/web2-wallet-reset', async (req, res) => {
    if (!authOk(req)) return res.status(403).json({ error: 'forbidden' });
    const body = req.body || {};
    const mode = body.mode || 'backup';
    const dryRun = body.dryRun === true;
    if (!['backup', 'reset-rematch', 'full-wipe'].includes(mode)) {
        return res.status(400).json({ error: 'mode phải: backup | reset-rematch | full-wipe' });
    }
    if (mode !== 'backup' && !dryRun && body.confirm !== 'YES-RESET') {
        return res.status(400).json({ error: "cần confirm:'YES-RESET' khi wipe (mode != backup)" });
    }
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    const chatDb = req.app.locals.chatDb;
    if (!db) return res.status(500).json({ error: 'web2Db unavailable' });
    if (db === chatDb) {
        return res
            .status(400)
            .json({
                error: 'web2Db === chatDb (WEB2_DATABASE_URL unset) — TỪ CHỐI để không đụng Web 1.0',
            });
    }

    const tag = tsTag();
    const steps = [];
    try {
        // 1. BACKUP (luôn chạy trước, trừ dryRun)
        const backups = [];
        const wipeTables = mode === 'full-wipe' ? ALL_TABLES : DERIVED;
        const toBackup = mode === 'backup' ? ALL_TABLES : [...wipeTables, SEPAY_LOG];
        for (const t of [...new Set(toBackup)]) {
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

        // 2. WIPE (TRUNCATE)
        if (!dryRun) {
            for (const t of wipeTables) {
                if (await tableExists(db, t)) {
                    await db.query(`TRUNCATE TABLE "${t}" RESTART IDENTITY`);
                }
            }
        }
        steps.push({ step: 'truncate', tables: wipeTables, done: !dryRun });

        // 3. RESET assignments trên SePay log (chỉ reset-rematch — giữ transactions)
        if (mode === 'reset-rematch' && !dryRun) {
            await db.query(
                `UPDATE ${SEPAY_LOG}
                 SET linked_customer_phone = NULL,
                     display_name = NULL,
                     match_method = NULL,
                     debt_added = FALSE,
                     wallet_processed = FALSE,
                     verification_status = 'PENDING',
                     verified_at = NULL
                 WHERE TRUE`
            );
            steps.push({ step: 'reset-balance-history-assignments', done: true });
        }

        res.json({
            success: true,
            mode,
            dryRun,
            tag,
            steps,
            next: 'Gọi POST /api/web2/balance-history/reprocess-unmatched (nhiều lần đến hết) để re-match + rebuild ví.',
        });
    } catch (e) {
        console.error('[web2-wallet-reset] error:', e.message);
        res.status(500).json({ success: false, error: e.message, steps });
    }
});

// GET /backups — list bảng backup đã tạo
router.get('/web2-wallet-reset/backups', async (req, res) => {
    if (!authOk(req)) return res.status(403).json({ error: 'forbidden' });
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        const r = await db.query(
            `SELECT table_name,
                    (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name=t.table_name) AS cols
             FROM information_schema.tables t
             WHERE table_schema='public' AND table_name LIKE '%_bak_%'
             ORDER BY table_name DESC`
        );
        res.json({ success: true, backups: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
