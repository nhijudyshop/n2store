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
        return res.status(400).json({
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

// POST /web2-rematch-all — re-match TOÀN BỘ balance_history 'in' theo keyset id
// (mỗi row xử lý 1 lần — KHÔNG bị re-pick như reprocess-unmatched). Gọi nhiều
// lần với afterId tăng dần đến done=true.
//   Body: { afterId?: number, batch?: number }
router.post('/web2-rematch-all', async (req, res) => {
    if (!authOk(req)) return res.status(403).json({ error: 'forbidden' });
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    if (db === req.app.locals.chatDb) {
        return res.status(400).json({ error: 'web2Db === chatDb — từ chối' });
    }
    const body = req.body || {};
    const afterId = parseInt(body.afterId, 10) || 0;
    const batch = Math.min(parseInt(body.batch, 10) || 300, 500);
    try {
        const sepayMatching = require('../services/web2-sepay-matching');
        const { fetchWithTimeout } = require('../../shared/node/fetch-utils.cjs');
        const rows = (
            await db.query(
                `SELECT id FROM web2_balance_history
                 WHERE transfer_type = 'in' AND id > $1
                 ORDER BY id ASC LIMIT $2`,
                [afterId, batch]
            )
        ).rows;
        let processed = 0;
        let matched = 0;
        let lastId = afterId;
        for (const r of rows) {
            lastId = r.id;
            processed++;
            try {
                const out = await sepayMatching.processWeb2Match(db, r.id, fetchWithTimeout);
                if (out && out.success && out.method && out.method !== 'pending_match_created') {
                    matched++;
                }
            } catch (e) {
                // skip lỗi từng row
            }
        }
        res.json({
            success: true,
            processed,
            matched,
            lastId,
            done: rows.length < batch,
        });
    } catch (e) {
        console.error('[web2-rematch-all] error:', e.message);
        res.status(500).json({ success: false, error: e.message });
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

// =====================================================================
// POST /api/admin/web2-wallet-reset/by-phone
// Body: { phone, confirm:'YES-RESET', dryRun? }  Header x-admin-secret
// Reset SẠCH 1 SĐT (dùng để dọn clone test): xoá ví + giao dịch + đơn test
// (native_orders + fast_sale_orders) + reset link SePay (giữ log) + reset
// matched_tx của tín hiệu CK. CHỈ đụng đúng SĐT truyền vào (+ các biến thể
// normalize). web2Db only.
// =====================================================================
router.post('/web2-wallet-reset/by-phone', async (req, res) => {
    if (!authOk(req)) return res.status(403).json({ error: 'forbidden' });
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!db) return res.status(500).json({ error: 'web2Db unavailable' });
    const phoneRaw = String(req.body?.phone || '').trim();
    const digits = phoneRaw.replace(/\D/g, '');
    if (!digits || digits.length < 9) {
        return res.status(400).json({ error: 'phone không hợp lệ' });
    }
    if (req.body?.confirm !== 'YES-RESET') {
        return res.status(400).json({ error: "confirm phải = 'YES-RESET'" });
    }
    const dryRun = req.body?.dryRun === true;
    // Các biến thể SĐT để khớp (lưu khác nhau giữa các bảng).
    const variants = Array.from(
        new Set([phoneRaw, digits, digits.slice(-10), '0' + digits.slice(-9)].filter(Boolean))
    );
    const steps = [];
    const step = async (label, table, whereCol, mutSql) => {
        try {
            if (dryRun) {
                const r = await db.query(
                    `SELECT COUNT(*)::int n FROM ${table} WHERE ${whereCol} = ANY($1)`,
                    [variants]
                );
                steps.push({ step: label, willAffect: r.rows[0].n });
            } else {
                const r = await db.query(mutSql, [variants]);
                steps.push({ step: label, rowCount: r.rowCount });
            }
        } catch (e) {
            steps.push({ step: label, error: e.message });
        }
    };
    try {
        await step(
            'web2_wallet_transactions',
            'web2_wallet_transactions',
            'phone',
            `DELETE FROM web2_wallet_transactions WHERE phone = ANY($1)`
        );
        await step(
            'web2_wallet_adjustments',
            'web2_wallet_adjustments',
            'phone',
            `DELETE FROM web2_wallet_adjustments WHERE phone = ANY($1)`
        );
        await step(
            'web2_customer_wallets',
            'web2_customer_wallets',
            'phone',
            `DELETE FROM web2_customer_wallets WHERE phone = ANY($1)`
        );
        await step(
            'fast_sale_orders',
            'fast_sale_orders',
            'partner_phone',
            `DELETE FROM fast_sale_orders WHERE partner_phone = ANY($1)`
        );
        await step(
            'native_orders',
            'native_orders',
            'phone',
            `DELETE FROM native_orders WHERE phone = ANY($1)`
        );
        await step(
            'web2_balance_history (unlink, giữ SePay log)',
            'web2_balance_history',
            'linked_customer_phone',
            `UPDATE web2_balance_history
             SET linked_customer_phone=NULL, debt_added=FALSE, wallet_processed=FALSE,
                 verification_status=NULL, match_method=NULL, display_name=NULL,
                 verified_by=NULL, verified_at=NULL
             WHERE linked_customer_phone = ANY($1)`
        );
        await step(
            'web2_payment_signals (reset matched_tx)',
            'web2_payment_signals',
            'phone',
            `UPDATE web2_payment_signals SET matched_tx_id=NULL, matched_tx_at=NULL WHERE phone = ANY($1)`
        );
        console.log(
            `[web2-wallet-reset/by-phone] ${dryRun ? 'DRY ' : ''}phone=${variants.join('|')} → ${JSON.stringify(steps)}`
        );
        res.json({ success: true, dryRun, phone: variants, steps });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message, steps });
    }
});

module.exports = router;
