// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// API V2 — Web 2.0 Balance History (ĐỘC LẬP với /v2/balance-history cũ)
// =====================================================================
// Đọc/sửa web2_balance_history (Web 2.0 source-of-truth).
// Không có endpoint /approve, /reject — Web 2.0 không cần kế toán duyệt.
//
// Endpoints:
//   GET  /api/web2/balance-history               — list (pagination + filter)
//   GET  /api/web2/balance-history/stats         — counts by status/phone
//   GET  /api/web2/balance-history/pending       — list multi-match cần user chọn
//   POST /api/web2/balance-history/pending/:id/resolve — chọn KH cho pending match
//   PATCH /api/web2/balance-history/:id/link     — gán SĐT thủ công
// =====================================================================

const express = require('express');
const router = express.Router();
const web2SepayMatching = require('../../services/web2-sepay-matching');
const web2WalletService = require('../../services/web2-wallet-service');
const web2ContentParser = require('../../services/web2-content-parser');
const { extractPhoneFromContent } = require('../sepay-transaction-matching');

function handleError(res, err, msg = 'Internal error') {
    console.error(`[Web2BalanceHistory] ${msg}:`, err.message);
    res.status(500).json({ success: false, error: msg, details: err.message });
}

// =====================================================
// GET /api/web2/balance-history
// Query: ?limit=50&offset=0&status=AUTO_APPROVED|NO_PHONE|all&search=<phone|content>
// =====================================================
router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.chatDb || req.app.locals.db;
        const limit = Math.min(parseInt(req.query.limit) || 50, 500);
        const offset = parseInt(req.query.offset) || 0;
        const status = req.query.status || 'all';
        const search = (req.query.search || '').trim();

        const params = [];
        const where = [];
        if (status === 'AUTO_APPROVED') {
            where.push(`verification_status = 'AUTO_APPROVED'`);
        } else if (status === 'NO_PHONE') {
            // B (2026-05-30): exclude manual deposit/withdraw NCC — đã có
            // display_name dù không phone, không phải webhook unmatched.
            where.push(`linked_customer_phone IS NULL`);
            where.push(
                `(match_method IS NULL OR match_method NOT IN ('manual_deposit', 'manual_withdraw'))`
            );
        } else if (status === 'PENDING_MATCH') {
            where.push(`match_method = 'pending_match'`);
        } else if (status === 'MANUAL') {
            where.push(`match_method IN ('manual_deposit', 'manual_withdraw')`);
        } else if (status === 'MANUAL_ALL') {
            // Audit view: mọi action thủ công (gán/chọn KH + nạp/rút tay + reassign)
            where.push(
                `match_method IN ('manual_link', 'manual_resolve', 'manual_reassign', 'manual_deposit', 'manual_withdraw')`
            );
        }
        if (search) {
            params.push(`%${search}%`);
            where.push(
                `(content ILIKE $${params.length} OR linked_customer_phone ILIKE $${params.length} OR sepay_id ILIKE $${params.length})`
            );
        }
        // Date range filter (YYYY-MM-DD inclusive)
        const since = (req.query.since || '').trim();
        const until = (req.query.until || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(since)) {
            params.push(since + ' 00:00:00');
            where.push(`transaction_date >= $${params.length}`);
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(until)) {
            params.push(until + ' 23:59:59');
            where.push(`transaction_date <= $${params.length}`);
        }
        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

        // MANUAL_ALL view sort theo `verified_at DESC` (thứ tự thao tác user,
        // mới nhất ở trên) thay vì `transaction_date` (thứ tự bank).
        const orderSql =
            status === 'MANUAL_ALL'
                ? `ORDER BY COALESCE(verified_at, transaction_date) DESC NULLS LAST, id DESC`
                : `ORDER BY transaction_date DESC NULLS LAST, id DESC`;
        const list = await db.query(
            `SELECT * FROM web2_balance_history
             ${whereSql}
             ${orderSql}
             LIMIT ${limit} OFFSET ${offset}`,
            params
        );
        const count = await db.query(
            `SELECT COUNT(*) AS n FROM web2_balance_history ${whereSql}`,
            params
        );
        // Phase 6 UX: include extraction preview for rows chưa gán
        // (NO_PHONE) — server-side extractor cho UI hiển thị candidate
        // mà không cần port logic xuống client.
        const rows = list.rows.map((r) => {
            if (!r.linked_customer_phone && r.content) {
                try {
                    const ext = extractPhoneFromContent(r.content);
                    r.extraction_preview = {
                        type: ext.type,
                        value: ext.value,
                        note: ext.note,
                    };
                } catch (e) {
                    r.extraction_preview = null;
                }
            }
            return r;
        });
        res.json({
            success: true,
            data: rows,
            total: Number(count.rows[0].n) || 0,
            limit,
            offset,
        });
    } catch (e) {
        handleError(res, e, 'List');
    }
});

// =====================================================
// GET /api/web2/balance-history/stats
// =====================================================
router.get('/stats', async (req, res) => {
    try {
        const db = req.app.locals.chatDb || req.app.locals.db;
        const r = await db.query(
            `SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE verification_status = 'AUTO_APPROVED') AS auto_approved,
                COUNT(*) FILTER (WHERE linked_customer_phone IS NULL) AS no_phone,
                COUNT(*) FILTER (WHERE match_method = 'pending_match') AS pending_match,
                COUNT(*) FILTER (WHERE match_method IN ('manual_deposit', 'manual_withdraw')) AS manual,
                COUNT(*) FILTER (WHERE match_method IN ('manual_link', 'manual_resolve', 'manual_reassign', 'manual_deposit', 'manual_withdraw')) AS manual_all,
                COALESCE(SUM(CASE WHEN transfer_type = 'in' THEN transfer_amount ELSE 0 END), 0) AS total_in,
                COALESCE(SUM(CASE WHEN transfer_type = 'out' THEN transfer_amount ELSE 0 END), 0) AS total_out
             FROM web2_balance_history`
        );
        res.json({ success: true, data: r.rows[0] });
    } catch (e) {
        handleError(res, e, 'Stats');
    }
});

// =====================================================
// GET /api/web2/balance-history/pending
// =====================================================
router.get('/pending', async (req, res) => {
    try {
        const db = req.app.locals.chatDb || req.app.locals.db;
        const r = await db.query(
            `SELECT pm.id, pm.transaction_id, pm.extracted_phone, pm.matched_customers,
                    pm.created_at,
                    bh.sepay_id, bh.content, bh.transfer_amount, bh.transaction_date
             FROM web2_pending_matches pm
             LEFT JOIN web2_balance_history bh ON bh.id = pm.transaction_id
             WHERE pm.status = 'pending'
             ORDER BY pm.created_at DESC
             LIMIT 200`
        );
        res.json({ success: true, data: r.rows });
    } catch (e) {
        handleError(res, e, 'Pending list');
    }
});

// =====================================================
// POST /api/web2/balance-history/pending/:id/resolve
// Body: { phone, name?, resolvedBy? }
// =====================================================
router.post('/pending/:id/resolve', async (req, res) => {
    try {
        const db = req.app.locals.chatDb || req.app.locals.db;
        const id = parseInt(req.params.id);
        const { phone, name, resolvedBy } = req.body || {};
        if (!phone) {
            return res.status(400).json({ success: false, error: 'phone required' });
        }
        const result = await web2SepayMatching.resolveWeb2PendingMatch(
            db,
            id,
            phone,
            name || null,
            resolvedBy || 'web2-ui'
        );
        res.json({ success: true, data: result });
    } catch (e) {
        handleError(res, e, 'Resolve pending');
    }
});

// =====================================================
// PATCH /api/web2/balance-history/:id/link
// Body: { phone, name? }
// Gán SĐT thủ công cho transaction chưa có phone — auto credit ví.
// =====================================================
router.patch('/:id/link', async (req, res) => {
    try {
        const db = req.app.locals.chatDb || req.app.locals.db;
        const id = parseInt(req.params.id);
        const { phone, name, verifiedBy } = req.body || {};
        if (!phone) {
            return res.status(400).json({ success: false, error: 'phone required' });
        }
        const verifiedByVal =
            String(verifiedBy || '')
                .trim()
                .slice(0, 100) || null;

        const r = await db.query(
            `SELECT id, sepay_id, transfer_amount, transfer_type, debt_added
             FROM web2_balance_history WHERE id = $1`,
            [id]
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Not found' });
        }
        const tx = r.rows[0];
        if (tx.debt_added === true) {
            return res
                .status(400)
                .json({ success: false, error: 'Đã được xử lý — không thể link lại' });
        }
        const amount = parseInt(tx.transfer_amount) || 0;
        if (tx.transfer_type !== 'in' || amount <= 0) {
            // Just link phone, don't credit
            await db.query(
                `UPDATE web2_balance_history
                 SET linked_customer_phone = $2,
                     display_name = COALESCE(display_name, $3),
                     match_method = 'manual_link',
                     verified_by = COALESCE($4, verified_by)
                 WHERE id = $1`,
                [id, phone, name || null, verifiedByVal]
            );
            return res.json({ success: true, data: { linked: true, credited: false } });
        }

        const walletResult = await web2WalletService.processDeposit(
            db,
            phone,
            amount,
            tx.id,
            'Nap tu CK (manual link)',
            null,
            null,
            tx.sepay_id
        );
        await db.query(
            `UPDATE web2_balance_history
             SET debt_added = TRUE,
                 linked_customer_phone = $2,
                 wallet_processed = TRUE,
                 verification_status = 'AUTO_APPROVED',
                 match_method = 'manual_link',
                 display_name = COALESCE(display_name, $3),
                 verified_at = NOW(),
                 verified_by = COALESCE($4, verified_by)
             WHERE id = $1`,
            [id, phone, name || null, verifiedByVal]
        );
        res.json({
            success: true,
            data: {
                linked: true,
                credited: true,
                wallet_tx_id: walletResult.transaction?.id,
            },
        });
    } catch (e) {
        handleError(res, e, 'Link');
    }
});

// =====================================================
// POST /api/web2/balance-history/:id/reassign
// Body: { phone, name?, verifiedBy?, reason? }
// Admin chuyển 1 giao dịch đã gán sang KH khác (gán nhầm / phòng cases sai):
//   1. Validate row đã có debt_added=true + linked_customer_phone
//   2. Withdraw ví KH cũ (số tiền = transfer_amount, idempotent ref qua sepay_id)
//   3. Deposit ví KH mới (cùng số tiền, reference = sepay_id để giữ idempotency)
//   4. UPDATE web2_balance_history: linked_customer_phone, display_name,
//      match_method = 'manual_reassign', verified_by, verified_at
//   5. Audit log
// Idempotency: nếu reassign cùng KH với hiện tại → no-op return.
// =====================================================
router.post('/:id/reassign', async (req, res) => {
    try {
        const db = req.app.locals.chatDb || req.app.locals.db;
        const id = parseInt(req.params.id);
        const { phone, name, verifiedBy, reason } = req.body || {};
        if (!phone) {
            return res.status(400).json({ success: false, error: 'phone required' });
        }
        const verifiedByVal =
            String(verifiedBy || '')
                .trim()
                .slice(0, 100) || null;
        const reasonText =
            String(reason || '')
                .trim()
                .slice(0, 500) || null;

        const r = await db.query(
            `SELECT id, sepay_id, transfer_amount, transfer_type, debt_added,
                    linked_customer_phone, display_name, match_method
             FROM web2_balance_history WHERE id = $1`,
            [id]
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Not found' });
        }
        const tx = r.rows[0];
        const oldPhone = tx.linked_customer_phone || null;
        const amount = parseInt(tx.transfer_amount) || 0;

        // Normalize phones (loose: strip non-digits, handle 84 prefix)
        const normalize = (p) => {
            let s = String(p || '').replace(/[^0-9]/g, '');
            if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);
            return s;
        };
        const newPhoneNorm = normalize(phone);
        if (!newPhoneNorm || newPhoneNorm.length < 9 || newPhoneNorm.length > 11) {
            return res.status(400).json({ success: false, error: 'SĐT không hợp lệ' });
        }
        const oldPhoneNorm = normalize(oldPhone || '');

        // Idempotent: cùng KH → no-op (vẫn cho cập nhật name/verified_by để fix typo)
        if (oldPhoneNorm && oldPhoneNorm === newPhoneNorm) {
            await db.query(
                `UPDATE web2_balance_history
                 SET display_name = COALESCE($2, display_name),
                     verified_by = COALESCE($3, verified_by)
                 WHERE id = $1`,
                [id, name || null, verifiedByVal]
            );
            return res.json({
                success: true,
                data: { reassigned: false, sameCustomer: true },
            });
        }

        // Refuse nếu row chưa từng credit (chưa có gì để "chuyển")
        if (!tx.debt_added || !oldPhoneNorm) {
            return res.status(400).json({
                success: false,
                error: 'Giao dịch chưa được cộng vào ví nào — dùng "Gán KH" thay vì "Sửa KH".',
            });
        }

        if (tx.transfer_type !== 'in' || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Chỉ reassign được giao dịch tiền vào (+) với amount > 0',
            });
        }

        // Step 1: withdraw từ ví cũ — reference giữ sepay_id để link audit
        let withdrawResult = null;
        try {
            withdrawResult = await web2WalletService.processWithdraw(
                db,
                oldPhoneNorm,
                amount,
                'sepay',
                tx.sepay_id,
                `Reassign giao dịch ${tx.sepay_id} → ${newPhoneNorm}${reasonText ? ` (${reasonText})` : ''}${verifiedByVal ? ` bởi ${verifiedByVal}` : ''}`
            );
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: `Không thể trừ ví cũ (${oldPhoneNorm}): ${e.message}`,
            });
        }

        // Step 2: deposit vào ví mới — KHÔNG dùng sepay_id (đã đc dùng ở row gốc) →
        // dùng ref 'reassign' + sepayId variant để idempotent theo row+phone.
        const reassignRef = `${tx.sepay_id}:reassign:${newPhoneNorm}`;
        let depositResult = null;
        try {
            depositResult = await web2WalletService.processDeposit(
                db,
                newPhoneNorm,
                amount,
                tx.id,
                `Reassign từ ${oldPhoneNorm} → bởi ${verifiedByVal || 'admin'}${reasonText ? ` (${reasonText})` : ''}`,
                null,
                null,
                reassignRef
            );
        } catch (e) {
            // Rollback withdraw — re-credit ví cũ để không mất tiền
            try {
                await web2WalletService.processDeposit(
                    db,
                    oldPhoneNorm,
                    amount,
                    tx.id,
                    `Rollback reassign fail (deposit new ${newPhoneNorm} fail: ${e.message})`,
                    null,
                    null,
                    `${tx.sepay_id}:rollback:${Date.now()}`
                );
            } catch (rbErr) {
                console.error('[reassign] CRITICAL: rollback also failed:', rbErr.message);
            }
            return res.status(500).json({
                success: false,
                error: `Không thể cộng ví mới (${newPhoneNorm}): ${e.message}`,
            });
        }

        // Step 3: update history row
        await db.query(
            `UPDATE web2_balance_history
             SET linked_customer_phone = $2,
                 display_name = COALESCE($3, display_name),
                 match_method = 'manual_reassign',
                 verified_by = COALESCE($4, verified_by),
                 verified_at = NOW()
             WHERE id = $1`,
            [id, newPhoneNorm, name || null, verifiedByVal]
        );

        // Step 4: audit log
        try {
            await web2MatchAudit.log(db, {
                transactionId: id,
                sepayId: tx.sepay_id,
                extractedValue: newPhoneNorm,
                extractedType: 'manual_reassign',
                candidates: [
                    { phone: oldPhoneNorm, name: tx.display_name || '' },
                    { phone: newPhoneNorm, name: name || '' },
                ],
                chosenPhone: newPhoneNorm,
                chosenName: name || null,
                decisionTier: 'manual_reassign',
                confidenceScore: 100,
                confidenceBreakdown: {
                    reason: 'admin_reassign',
                    oldPhone: oldPhoneNorm,
                    newPhone: newPhoneNorm,
                    note: reasonText,
                },
                amount,
                decidedBy: verifiedByVal || 'admin',
                walletTxId: depositResult.transaction?.id,
                note: `Reassign: ${oldPhoneNorm} → ${newPhoneNorm}${reasonText ? ` (${reasonText})` : ''}`,
            });
        } catch (auditErr) {
            console.warn('[reassign] audit log fail:', auditErr.message);
        }

        res.json({
            success: true,
            data: {
                reassigned: true,
                oldPhone: oldPhoneNorm,
                newPhone: newPhoneNorm,
                amount,
                withdrawTxId: withdrawResult.transaction?.id,
                depositTxId: depositResult.transaction?.id,
            },
        });
    } catch (e) {
        handleError(res, e, 'Reassign');
    }
});

// =====================================================
// POST /api/web2/balance-history/:id/auto-match
// Single-row reprocess — chạy lại processWeb2Match với extractor mới.
// =====================================================
router.post('/:id/auto-match', async (req, res) => {
    try {
        const db = req.app.locals.chatDb || req.app.locals.db;
        const id = parseInt(req.params.id);
        const { fetchWithTimeout } = require('../../../shared/node/fetch-utils.cjs');
        const result = await web2SepayMatching.processWeb2Match(db, id, fetchWithTimeout);
        res.json({ success: true, data: result });
    } catch (e) {
        handleError(res, e, 'Auto-match single');
    }
});

// =====================================================
// POST /api/web2/balance-history/reprocess-unmatched
// Bulk re-run processWeb2Match for ALL unprocessed 'in' rows:
//   - linked_customer_phone IS NULL (chưa extract được phone), OR
//   - linked_customer_phone IS NOT NULL nhưng debt_added=false (legacy
//     từ Web 1.0 backfill, có phone nhưng ví Web 2.0 chưa cộng tiền)
// Web 2.0 = 100% auto: không có khái niệm "manual" hay "cũ" cho user.
// Body: { limit?: number, dryRun?: boolean }
// =====================================================
router.post('/reprocess-unmatched', async (req, res) => {
    try {
        const db = req.app.locals.chatDb || req.app.locals.db;
        const limit = Math.min(parseInt(req.body?.limit) || 200, 500);
        const dryRun = req.body?.dryRun === true;
        const { fetchWithTimeout } = require('../../../shared/node/fetch-utils.cjs');

        const rows = await db.query(
            `SELECT id, sepay_id, content, transfer_amount, linked_customer_phone
             FROM web2_balance_history
             WHERE transfer_type = 'in'
               AND debt_added = FALSE
               AND COALESCE(match_method, '') NOT IN ('pending_match', 'pending_low_confidence')
             ORDER BY transaction_date DESC NULLS LAST
             LIMIT $1`,
            [limit]
        );

        if (rows.rows.length === 0) {
            return res.json({
                success: true,
                data: { picked: 0, matched: 0, pending: 0, no_match: 0, errors: 0 },
            });
        }

        const stats = { picked: rows.rows.length, matched: 0, pending: 0, no_match: 0, errors: 0 };
        const results = [];

        for (const row of rows.rows) {
            try {
                const r = await web2SepayMatching.processWeb2Match(db, row.id, fetchWithTimeout);
                const r2 = {
                    id: row.id,
                    sepay: row.sepay_id,
                    amount: row.transfer_amount,
                    method: r?.method || null,
                    phone: r?.phone || null,
                    name: r?.customerName || null,
                    confidence: r?.confidenceScore || null,
                };
                if (
                    r?.success &&
                    (r.method === 'exact_phone' ||
                        r.method === 'single_match' ||
                        r.method === 'qr_code' ||
                        r.method === 'legacy_credited')
                ) {
                    stats.matched++;
                } else if (
                    r?.method === 'pending_match_created' ||
                    r?.method === 'pending_low_confidence'
                ) {
                    stats.pending++;
                } else {
                    stats.no_match++;
                }
                if (results.length < 50) results.push(r2);
            } catch (e) {
                stats.errors++;
                console.warn(`[reprocess] row ${row.id} fail:`, e.message);
            }
        }
        res.json({ success: true, data: { ...stats, sample: results } });
    } catch (e) {
        handleError(res, e, 'Reprocess unmatched');
    }
});

// =====================================================
// POST /api/web2/balance-history/manual-deposit
// User có quyền (admin) nạp/rút tay tiền vào ví KH hoặc NCC.
//
// Body: {
//   target: 'KH' | 'NCC',
//   type?: 'deposit' | 'withdraw'   (default 'deposit')
//   phone?: string (KH bắt buộc, NCC optional),
//   name: string,
//   customerId?: number (TPOS partner id KH),
//   amount: number (VND > 0),
//   note?: string,
//   userName?: string
// }
//
// Withdraw guards: balance sau khi trừ KHÔNG được < 0. KH check via Postgres
// FOR UPDATE lock + balance comparison. NCC qua Firestore (chưa enforce ở
// backend — sẽ check ở supplier-wallet client trước khi POST).
// =====================================================
router.post('/manual-deposit', async (req, res) => {
    try {
        const db = req.app.locals.chatDb || req.app.locals.db;
        const body = req.body || {};
        const target = String(body.target || '').toUpperCase();
        const type = String(body.type || 'deposit').toLowerCase();
        const amount = Math.floor(Number(body.amount) || 0);
        const name = String(body.name || '').trim();
        const phone = String(body.phone || '').replace(/\D/g, '');
        const note = String(body.note || '').trim();
        const userName = String(body.userName || 'system').trim();
        const customerId = Number(body.customerId) || null;

        if (!['KH', 'NCC'].includes(target)) {
            return res.status(400).json({ success: false, error: 'target phải là KH hoặc NCC' });
        }
        if (!['deposit', 'withdraw'].includes(type)) {
            return res
                .status(400)
                .json({ success: false, error: 'type phải là deposit hoặc withdraw' });
        }
        if (amount <= 0) {
            return res.status(400).json({ success: false, error: 'amount phải > 0' });
        }
        if (!name) {
            return res.status(400).json({ success: false, error: 'name bắt buộc' });
        }
        if (target === 'KH' && phone.length < 9) {
            return res.status(400).json({
                success: false,
                error: 'KH bắt buộc có phone hợp lệ (≥9 digits)',
            });
        }

        // Withdraw: pre-check balance để fail fast trước khi insert balance_history
        if (type === 'withdraw' && target === 'KH') {
            const balCheck = await db.query(
                `SELECT balance FROM web2_customer_wallets WHERE phone = $1`,
                [phone]
            );
            const currentBal = Number(balCheck.rows[0]?.balance || 0);
            if (currentBal < amount) {
                return res.status(400).json({
                    success: false,
                    error: `Số dư ví KH không đủ. Hiện có ${currentBal.toLocaleString('vi-VN')}đ, cần ${amount.toLocaleString('vi-VN')}đ`,
                    currentBalance: currentBal,
                });
            }
        }

        // Unique negative sepay_id cho manual deposit (không trùng SePay thật).
        // SePay id INTEGER PostgreSQL range: −2_147_483_648 to 2_147_483_647.
        // Dùng floor(Date.now() / 1000) như magnitude, mark negative.
        const manualSepayId = -Math.floor(Date.now() / 1000);

        // Build content readable cho audit + cho supplier-wallet polling pick up
        // qua name match (NCC). Format: "[Nạp tay] <userName> → <target>:<name> | <note>"
        const content = `[Nạp tay] ${userName} -> ${target}: ${name}` + (note ? ` | ${note}` : '');

        // Ensure raw_data column exists (table có thể chưa có nếu schema cũ).
        // Idempotent — chạy rất nhanh khi column đã tồn tại.
        try {
            await db.query(
                `ALTER TABLE web2_balance_history ADD COLUMN IF NOT EXISTS raw_data JSONB`
            );
        } catch (_) {}

        const metadataJson = JSON.stringify({
            manual: true,
            type,
            target,
            name,
            phone: phone || null,
            customerId,
            note,
            userName,
            userId: body.userId || null,
            timestamp: new Date().toISOString(),
        });

        const transferType = type === 'deposit' ? 'in' : 'out';
        const matchMethod = type === 'deposit' ? 'manual_deposit' : 'manual_withdraw';

        // Insert row
        const insertResult = await db.query(
            `INSERT INTO web2_balance_history (
                sepay_id, gateway, transaction_date, account_number, code,
                content, transfer_type, transfer_amount, accumulated,
                sub_account, reference_code, description, raw_data,
                linked_customer_phone, display_name, match_method,
                debt_added, wallet_processed, verification_status, verified_at
             )
             VALUES ($1, 'MANUAL', NOW(), 'MANUAL', NULL,
                     $2, $10, $3, 0,
                     NULL, $4, $5, $6,
                     $7, $8, $11,
                     TRUE, $9, 'AUTO_APPROVED', NOW())
             ON CONFLICT (sepay_id) DO NOTHING
             RETURNING id`,
            [
                manualSepayId,
                content,
                amount,
                `MANUAL-${manualSepayId}`,
                note || null,
                metadataJson,
                target === 'KH' ? phone : null,
                name,
                target === 'KH',
                transferType,
                matchMethod,
            ]
        );

        if (insertResult.rows.length === 0) {
            return res.status(409).json({ success: false, error: 'Trùng manual sepay_id (rare)' });
        }
        const balanceHistoryId = insertResult.rows[0].id;

        // Credit/Debit ví KH (Postgres web2_customer_wallets)
        let walletResult = null;
        if (target === 'KH') {
            try {
                const web2WalletService = require('../../services/web2-wallet-service');
                const opLabel = type === 'deposit' ? 'Nạp tay' : 'Rút tay';
                const opNote = `${opLabel} bởi ${userName}` + (note ? ` (${note})` : '');
                if (type === 'deposit') {
                    walletResult = await web2WalletService.processDeposit(
                        db,
                        phone,
                        amount,
                        balanceHistoryId,
                        opNote,
                        customerId,
                        null,
                        String(manualSepayId)
                    );
                } else {
                    // Withdraw — signature (db, phone, amount, referenceType, referenceId, note)
                    // Atomic balance check trong transaction; throw nếu insufficient.
                    walletResult = await web2WalletService.processWithdraw(
                        db,
                        phone,
                        amount,
                        'manual_balance_history',
                        String(balanceHistoryId),
                        opNote
                    );
                }
            } catch (e) {
                console.error(`[manual-deposit] KH wallet ${type} fail:`, e.message);
                // Rollback balance_history row
                try {
                    await db.query(`DELETE FROM web2_balance_history WHERE id = $1`, [
                        balanceHistoryId,
                    ]);
                } catch (_) {}
                return res.status(500).json({
                    success: false,
                    error: `${type === 'deposit' ? 'Nạp' : 'Rút'} ví KH thất bại: ${e.message}`,
                });
            }
        }

        // SSE notify: balance-history page refresh + KH wallet event
        try {
            const notify = req.app.locals.web2RealtimeSseNotify;
            if (notify) {
                notify('web2:balance-history', {
                    action: 'manual-deposit',
                    id: balanceHistoryId,
                    target,
                    name,
                    amount,
                    ts: Date.now(),
                });
                if (target === 'KH') {
                    notify(`web2:wallet:${phone}`, {
                        action: 'manual-deposit',
                        amount,
                        ts: Date.now(),
                    });
                    notify('web2:wallet:update', {
                        phone,
                        action: 'manual-deposit',
                        amount,
                        ts: Date.now(),
                    });
                }
            }
        } catch (e) {
            console.warn('[manual-deposit] SSE notify fail:', e.message);
        }

        res.json({
            success: true,
            data: {
                balanceHistoryId,
                manualSepayId,
                target,
                phone: phone || null,
                name,
                amount,
                userName,
                walletTxId: walletResult?.transaction?.id || null,
                walletNewBalance: walletResult?.wallet?.balance || null,
            },
        });
    } catch (e) {
        handleError(res, e, 'Manual deposit');
    }
});

// =====================================================
// POST /api/web2/balance-history/cleanup-stale-pending
// Cleanup web2_pending_matches entries không thể giải quyết:
//   - candidates rỗng (customers=[]) → user không có gì để pick
//   - duplicate cho cùng transaction_id → keep newest
// Reset balance_history.match_method về null cho cleaned rows → re-process
// có thể chạy lại (TPOS state có thể đã đổi).
//
// Body (optional): { dryRun?: boolean }
// =====================================================
router.post('/cleanup-stale-pending', async (req, res) => {
    try {
        const db = req.app.locals.chatDb || req.app.locals.db;
        const dryRun = req.body?.dryRun === true;

        // Detect stale: any candidate có customers=[] empty
        const stale = await db.query(`
            SELECT pm.id, pm.transaction_id, pm.matched_customers
            FROM web2_pending_matches pm
            WHERE pm.status = 'pending'
              AND (
                  jsonb_array_length(pm.matched_customers) = 0
                  OR NOT EXISTS (
                      SELECT 1 FROM jsonb_array_elements(pm.matched_customers) cand
                      WHERE jsonb_array_length(COALESCE(cand->'customers', '[]'::jsonb)) > 0
                  )
              )
        `);

        // Detect duplicates: cùng transaction_id, keep id mới nhất
        const dups = await db.query(`
            SELECT id, transaction_id FROM web2_pending_matches
            WHERE status = 'pending'
              AND id NOT IN (
                  SELECT MAX(id) FROM web2_pending_matches
                  WHERE status = 'pending'
                  GROUP BY transaction_id
              )
        `);

        const stalePendingIds = stale.rows.map((r) => Number(r.id));
        const dupPendingIds = dups.rows.map((r) => Number(r.id));
        const allDelIds = Array.from(new Set([...stalePendingIds, ...dupPendingIds]));
        const affectedTxIds = Array.from(
            new Set([
                ...stale.rows.map((r) => Number(r.transaction_id)),
                ...dups.rows.map((r) => Number(r.transaction_id)),
            ])
        ).filter(Boolean);

        if (dryRun) {
            return res.json({
                success: true,
                dryRun: true,
                staleCount: stalePendingIds.length,
                dupCount: dupPendingIds.length,
                totalDelete: allDelIds.length,
                resetTxCount: affectedTxIds.length,
            });
        }

        let deletedPending = 0;
        let resetBalanceHistory = 0;
        if (allDelIds.length > 0) {
            const delResult = await db.query(
                `DELETE FROM web2_pending_matches WHERE id = ANY($1::int[])`,
                [allDelIds]
            );
            deletedPending = delResult.rowCount || 0;
        }
        if (affectedTxIds.length > 0) {
            // Reset match_method='pending_match' về null → reprocess
            const resetResult = await db.query(
                `UPDATE web2_balance_history
                 SET match_method = NULL
                 WHERE id = ANY($1::bigint[])
                   AND match_method = 'pending_match'
                   AND debt_added = FALSE`,
                [affectedTxIds]
            );
            resetBalanceHistory = resetResult.rowCount || 0;
        }
        res.json({
            success: true,
            deletedPending,
            resetBalanceHistory,
            staleCount: stalePendingIds.length,
            dupCount: dupPendingIds.length,
        });
    } catch (e) {
        handleError(res, e, 'Cleanup stale pending');
    }
});

module.exports = router;
