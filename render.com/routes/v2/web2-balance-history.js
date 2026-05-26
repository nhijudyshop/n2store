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
            where.push(`linked_customer_phone IS NULL`);
        } else if (status === 'PENDING_MATCH') {
            where.push(`match_method = 'pending_match'`);
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

        const list = await db.query(
            `SELECT * FROM web2_balance_history
             ${whereSql}
             ORDER BY transaction_date DESC NULLS LAST, id DESC
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
        const { phone, name } = req.body || {};
        if (!phone) {
            return res.status(400).json({ success: false, error: 'phone required' });
        }

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
                     match_method = 'manual_link'
                 WHERE id = $1`,
                [id, phone, name || null]
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
                 verified_at = NOW()
             WHERE id = $1`,
            [id, phone, name || null]
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
// Bulk re-run processWeb2Match for NO_PHONE rows (backfilled từ legacy
// chưa từng đi qua Web 2.0 matching engine với improved extractor).
// Body: { limit?: number, dryRun?: boolean }
// =====================================================
router.post('/reprocess-unmatched', async (req, res) => {
    try {
        const db = req.app.locals.chatDb || req.app.locals.db;
        const limit = Math.min(parseInt(req.body?.limit) || 200, 500);
        const dryRun = req.body?.dryRun === true;
        const { fetchWithTimeout } = require('../../../shared/node/fetch-utils.cjs');
        // path is 3 levels up: routes/v2 → routes → render.com → n2store → shared/

        const rows = await db.query(
            `SELECT id, sepay_id, content, transfer_amount
             FROM web2_balance_history
             WHERE linked_customer_phone IS NULL
               AND transfer_type = 'in'
               AND debt_added = FALSE
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
                        r.method === 'qr_code')
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

module.exports = router;
