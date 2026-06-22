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
const crypto = require('crypto');
const router = express.Router();

const ADMIN_SECRET = process.env.CLEANUP_SECRET || '';
// So sánh secret hằng-thời-gian (chống timing side-channel). Header-only —
// KHÔNG nhận ?secret= query (tránh secret rò vào access log qua req.url).
function secretEquals(provided) {
    if (!ADMIN_SECRET || !provided) return false;
    const a = Buffer.from(String(provided));
    const b = Buffer.from(ADMIN_SECRET);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}
function authOk(req) {
    const p = req.headers['x-admin-secret'] || '';
    return secretEquals(p);
}

// Defense-in-depth: chỉ cho phép tên bảng từ allowlist hằng được nội suy vào SQL.
function assertSafeTable(name) {
    if (!/^[a-z0-9_]+$/.test(name)) {
        throw new Error(`tên bảng không hợp lệ: ${name}`);
    }
    return name;
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
    // Giây + suffix ngẫu nhiên → 2 reset cùng phút (hoặc retry) KHÔNG trùng tên
    // bảng backup <t>_bak_<tag> (tránh DROP đè backup vừa tạo của call kia).
    const rnd = Math.random().toString(36).slice(2, 6);
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${rnd}`;
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
            assertSafeTable(t);
            const cnt = Number((await db.query(`SELECT COUNT(*)::bigint n FROM "${t}"`)).rows[0].n);
            const bak = `${t}_bak_${tag}`;
            assertSafeTable(bak);
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
                assertSafeTable(t);
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
        let errors = 0;
        const errorSamples = [];
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
                // KHÔNG nuốt im lặng: đếm + log mẫu để phát hiện lỗi hệ thống
                // (matching service down → success/matched=0 nhìn giống run sạch).
                errors++;
                if (errorSamples.length < 5) errorSamples.push({ id: r.id, error: e.message });
                console.error(`[web2-rematch-all] row id=${r.id} match error:`, e.message);
            }
        }
        res.json({
            success: true,
            processed,
            matched,
            errors,
            errorSamples,
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
    if (!db) return res.status(500).json({ error: 'web2Db unavailable' });
    if (db === req.app.locals.chatDb) {
        return res
            .status(400)
            .json({ error: 'web2Db === chatDb — từ chối (không đọc backup Web 1.0)' });
    }
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
    // Guard cô lập Web1/Web2: by-phone DELETE cả native_orders/fast_sale_orders
    // (bảng PROD nằm trên chatDb) — nếu web2Db rớt về chatDb sẽ xoá nhầm Web 1.0.
    if (db === req.app.locals.chatDb) {
        return res.status(400).json({
            error: 'web2Db === chatDb (WEB2_DATABASE_URL unset) — TỪ CHỐI để không đụng Web 1.0',
        });
    }
    const phoneRaw = String(req.body?.phone || '').trim();
    const digits = phoneRaw.replace(/\D/g, '');
    // SĐT VN chuẩn xác 10 số bắt đầu bằng 0 → tránh nhầm fb_id/dãy số rác
    // (chuỗi quá dài có thể over-match unrelated rows qua digits.slice(-10)).
    const phone = digits.length >= 9 ? '0' + digits.slice(-9) : '';
    if (!/^0\d{9}$/.test(phone)) {
        return res.status(400).json({ error: 'phone không hợp lệ (cần SĐT VN 10 số)' });
    }
    if (req.body?.confirm !== 'YES-RESET') {
        return res.status(400).json({ error: "confirm phải = 'YES-RESET'" });
    }
    const dryRun = req.body?.dryRun === true;
    // Các biến thể SĐT để khớp (lưu khác nhau giữa các bảng): chuẩn 10 số
    // (vd 0912345678) + 9 số bỏ số 0 đầu (vd 912345678).
    const variants = Array.from(new Set([phone, phone.slice(1)]));
    const maskedPhone = phone.replace(/^(\d{2})\d{4}(\d{4})$/, '$1****$2');
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
        // Log SĐT đã mask (last-4) theo convention — KHÔNG ghi PII đầy đủ vào log.
        console.log(
            `[web2-wallet-reset/by-phone] ${dryRun ? 'DRY ' : ''}phone=${maskedPhone} → ${JSON.stringify(steps)}`
        );
        res.json({ success: true, dryRun, phone: variants, steps });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message, steps });
    }
});

// =====================================================================
// SELECTIVE DATA WIPE — xoá data đơn/SP/NCC/ví/KPI/chiến-dịch-cha trên web2Db.
// GIỮ: khách hàng (web2_customers) + chuyển khoản (web2_balance_history) +
//      vận hành (live comments, Zalo/chat, FB, noti, J&T) + auth/config.
// POST /api/admin/web2-data-wipe   body {mode:'audit'}  → CHỈ đọc, đếm dòng + phân loại
//                                  body {mode:'execute', confirm:'XOA-HET'} → TRUNCATE
// Header x-admin-secret = CLEANUP_SECRET.
// =====================================================================
const WIPE_DELETE_TABLES = [
    // Đơn hàng
    'web2_so_order',
    'web2_order_tags',
    'web2_returns',
    'web2_cart_history',
    'native_orders',
    'fast_sale_orders',
    // Sản phẩm
    'web2_products',
    'web2_variants',
    'web2_product_history',
    'web2_campaign_products',
    // NCC
    'web2_supplier_meta',
    'web2_supplier_ledger',
    // Tiền/ví KH (user chọn XOÁ — chỉ giữ web2_customers + web2_balance_history)
    'web2_customer_wallets',
    'web2_wallet_transactions',
    'web2_wallet_adjustments',
    'web2_payment_signals',
    'web2_payment_qr_codes',
    'web2_pending_matches',
    // Chiến dịch cha (live-control / live-tv hiển thị SP đã xoá)
    'web2_live_parent_campaigns',
    // KPI (user yêu cầu xoá — vốn tính từ đơn hàng)
    'web2_kpi_assignments',
    'web2_kpi_assignments_history',
    'web2_kpi_events',
];
// TUYỆT ĐỐI không bao giờ TRUNCATE — guard chống lỡ tay.
const WIPE_HARD_KEEP = new Set([
    'web2_customers',
    'web2_balance_history',
    'web2_customer_intents',
    'web2_users',
    'web2_user_sessions',
    'web2_migrations',
    'web2_zalo_accounts',
]);

router.post('/web2-data-wipe', async (req, res) => {
    if (!authOk(req)) return res.status(401).json({ error: 'unauthorized' });
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!db) return res.status(500).json({ error: 'web2Db unavailable' });
    if (db === req.app.locals.chatDb) {
        return res.status(400).json({
            error: 'web2Db === chatDb (WEB2_DATABASE_URL unset) — TỪ CHỐI để không đụng Web 1.0',
        });
    }
    const mode = (req.body && req.body.mode) === 'execute' ? 'execute' : 'audit';
    try {
        const { rows: tbls } = await db.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema='public' AND table_type='BASE TABLE'
              AND (table_name LIKE 'web2\\_%' OR table_name IN ('native_orders','fast_sale_orders'))
            ORDER BY table_name`);
        const existing = tbls.map((r) => r.table_name);
        const counts = {};
        for (const t of existing) {
            const r = await db.query(`SELECT count(*)::int AS c FROM "${assertSafeTable(t)}"`);
            counts[t] = r.rows[0].c;
        }
        const classify = (n) =>
            WIPE_HARD_KEEP.has(n)
                ? 'KEEP_GUARD'
                : WIPE_DELETE_TABLES.includes(n)
                  ? 'DELETE'
                  : 'KEEP';
        const { rows: fks } = await db.query(`
            SELECT tc.table_name AS child, ccu.table_name AS parent
            FROM information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
            WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'`);
        const cascadeRisk = fks.filter(
            (f) => WIPE_DELETE_TABLES.includes(f.parent) && classify(f.child) !== 'DELETE'
        );
        const delExisting = WIPE_DELETE_TABLES.filter((t) => existing.includes(t));
        const delMissing = WIPE_DELETE_TABLES.filter((t) => !existing.includes(t));
        const keepRows = existing
            .filter((t) => classify(t) !== 'DELETE')
            .map((t) => ({ table: t, rows: counts[t], cls: classify(t) }));
        const delRows = delExisting.map((t) => ({ table: t, rows: counts[t] }));
        const totalDelRows = delRows.reduce((s, x) => s + x.rows, 0);

        if (mode === 'audit') {
            return res.json({
                success: true,
                mode: 'audit',
                deleteTables: delRows,
                deleteMissing: delMissing,
                totalDelTables: delExisting.length,
                totalDelRows,
                keepTables: keepRows,
                cascadeRisk,
            });
        }
        if (!req.body || req.body.confirm !== 'XOA-HET') {
            return res.status(400).json({ error: "execute cần confirm:'XOA-HET'" });
        }
        if (cascadeRisk.length) {
            return res
                .status(409)
                .json({ error: 'FK cascade-risk tới bảng GIỮ — DỪNG', cascadeRisk });
        }
        const toTruncate = delExisting.filter((t) => !WIPE_HARD_KEEP.has(t)).map(assertSafeTable);
        if (!toTruncate.length) {
            return res.json({
                success: true,
                mode: 'execute',
                truncated: [],
                note: 'không có bảng nào để xoá',
            });
        }
        await db.query(
            `TRUNCATE TABLE ${toTruncate.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`
        );
        console.log(
            `[web2-data-wipe] EXECUTED — truncated ${toTruncate.length} tables, ${totalDelRows} rows`
        );
        return res.json({
            success: true,
            mode: 'execute',
            truncated: toTruncate,
            rowsDeleted: totalDelRows,
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
