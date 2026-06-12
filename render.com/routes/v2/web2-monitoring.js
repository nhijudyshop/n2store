// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — monitoring + audit + blacklist endpoints.
// =====================================================================
// API V2 — Web 2.0 Monitoring & Audit
// =====================================================================
// Endpoints:
//   GET    /api/web2/monitoring/stats         — daily stats: matched / unmatched / pending / failed
//   GET    /api/web2/monitoring/audit         — list match audit log (paginated)
//   POST   /api/web2/monitoring/audit/:id/revert — undo a match (within 5 min)
//   GET    /api/web2/monitoring/retry-queue   — webhook retry queue status
//   GET    /api/web2/monitoring/blacklist     — list blacklist patterns
//   POST   /api/web2/monitoring/blacklist     — add pattern
//   DELETE /api/web2/monitoring/blacklist/:id — deactivate
// =====================================================================

const express = require('express');
const router = express.Router();
const web2MatchAudit = require('../../services/web2-match-audit');
// 3H17 (2026-06-12): mutation (revert = đảo tiền ví, replay, blacklist) là endpoint
// nguy hiểm NGOÀI page-flow → gate HARD requireWeb2Admin; GET gate SOFT.
const { requireWeb2Admin, requireWeb2AuthSoft } = require('../../middleware/web2-auth');
const web2WebhookRetry = require('../../services/web2-webhook-retry');
const web2Blacklist = require('../../services/web2-blacklist');

function handleError(res, err, msg = 'Internal error') {
    console.error(`[Web2Monitoring] ${msg}:`, err.message);
    res.status(500).json({ success: false, error: msg, details: err.message });
}

function getDb(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

// =====================================================
// GET /api/web2/monitoring/stats
// Daily aggregated stats for dashboard
// =====================================================
router.get('/stats', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = getDb(req);
        const sinceMs = parseInt(req.query.since) || Date.now() - 7 * 86400 * 1000;
        const since = new Date(sinceMs).toISOString();

        // 1. balance_history breakdown (Web 2.0)
        const bh = await db.query(
            `SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE verification_status = 'AUTO_APPROVED') AS auto_approved,
                COUNT(*) FILTER (WHERE linked_customer_phone IS NULL) AS no_phone,
                COUNT(*) FILTER (WHERE match_method = 'pending_match') AS pending_multi,
                COUNT(*) FILTER (WHERE match_method = 'pending_low_confidence') AS pending_low_conf,
                COALESCE(SUM(CASE WHEN transfer_type = 'in' THEN transfer_amount ELSE 0 END), 0) AS total_in,
                COALESCE(SUM(CASE WHEN transfer_type = 'in' AND wallet_processed = TRUE THEN transfer_amount ELSE 0 END), 0) AS total_credited
             FROM web2_balance_history
             WHERE transaction_date >= $1`,
            [since]
        );

        // 2. audit log decision tier breakdown
        const audit = await db.query(
            `SELECT
                decision_tier,
                COUNT(*) AS count,
                AVG(confidence_score)::INT AS avg_confidence
             FROM web2_match_audit
             WHERE created_at >= $1
             GROUP BY decision_tier`,
            [since]
        );

        // 3. retry queue status
        const retryStats = await web2WebhookRetry.getStats(db).catch(() => null);

        // 4. pending matches count
        const pending = await db.query(
            `SELECT COUNT(*) AS count FROM web2_pending_matches WHERE status = 'pending'`
        );

        // 5. revertable matches (within 5min window)
        const revertable = await db.query(
            `SELECT COUNT(*) AS count
             FROM web2_match_audit
             WHERE reverted = FALSE
             AND decided_at >= NOW() - INTERVAL '5 minutes'
             AND chosen_phone IS NOT NULL`
        );

        // 6. wallets touched in window
        const walletActivity = await db.query(
            `SELECT COUNT(DISTINCT phone) AS active_wallets,
                    COUNT(*) AS tx_count,
                    COALESCE(SUM(amount), 0) AS total_amount
             FROM web2_wallet_transactions
             WHERE created_at >= $1`,
            [since]
        );

        res.json({
            success: true,
            data: {
                period: { sinceMs, sinceISO: since },
                balance_history: bh.rows[0],
                audit_decisions: audit.rows.reduce((o, r) => {
                    o[r.decision_tier || 'unknown'] = {
                        count: Number(r.count),
                        avg_confidence: r.avg_confidence,
                    };
                    return o;
                }, {}),
                retry_queue: retryStats,
                pending_matches: Number(pending.rows[0].count),
                revertable_matches: Number(revertable.rows[0].count),
                wallet_activity: walletActivity.rows[0],
            },
        });
    } catch (e) {
        handleError(res, e, 'Stats');
    }
});

// =====================================================
// GET /api/web2/monitoring/audit
// =====================================================
router.get('/audit', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = getDb(req);
        const result = await web2MatchAudit.list(db, {
            limit: parseInt(req.query.limit) || 100,
            offset: parseInt(req.query.offset) || 0,
            phone: req.query.phone,
            decisionTier: req.query.tier,
            minScore: req.query.minScore != null ? Number(req.query.minScore) : null,
            maxScore: req.query.maxScore != null ? Number(req.query.maxScore) : null,
            reverted: req.query.reverted,
            sinceMs: req.query.since,
        });
        res.json({ success: true, ...result });
    } catch (e) {
        handleError(res, e, 'Audit list');
    }
});

// =====================================================
// POST /api/web2/monitoring/audit/:id/revert
// Undo a match within 5-min window
// Body: { revertedBy: 'username' }
// =====================================================
router.post('/audit/:id/revert', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const id = parseInt(req.params.id);
        // 3H17: route đã gate requireWeb2Admin → lấy danh tính từ req.web2User
        const revertedBy =
            req.web2User?.display_name ||
            req.web2User?.username ||
            req.body?.revertedBy ||
            'unknown';
        const result = await web2MatchAudit.revert(db, id, revertedBy);
        res.json({ success: true, data: result });
    } catch (e) {
        const code = e.code || null;
        if (
            code === 'WINDOW_EXPIRED' ||
            code === 'ALREADY_REVERTED' ||
            code === 'NO_CREDIT' ||
            code === 'WALLET_REVERT_FAILED'
        ) {
            return res.status(400).json({ success: false, error: e.message, code });
        }
        if (code === 'NOT_FOUND') {
            return res.status(404).json({ success: false, error: e.message });
        }
        handleError(res, e, 'Revert');
    }
});

// =====================================================
// GET /api/web2/monitoring/retry-queue
// =====================================================
router.get('/retry-queue', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = getDb(req);
        const stats = await web2WebhookRetry.getStats(db);
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const r = await db.query(
            `SELECT id, sepay_id, retry_count, last_error, last_retry_at,
                    next_retry_at, status, created_at, resolved_at
             FROM web2_webhook_retry_queue
             ORDER BY created_at DESC LIMIT $1`,
            [limit]
        );
        res.json({ success: true, stats, items: r.rows });
    } catch (e) {
        handleError(res, e, 'Retry queue');
    }
});

// =====================================================
// POST /api/web2/monitoring/retry-queue/replay
// Reset 'permanent_failure' (và 'pending' đã quá hạn) về pending để cron
// retry chạy lại — dùng sau khi fix bug khiến GD fail hàng loạt (vd lỗi
// cột "body" sau cutover DB 2026-06-03). Idempotent, an toàn gọi nhiều lần.
// Body (optional): { status: 'permanent_failure' | 'all' } — mặc định cả 2.
// =====================================================
router.post('/retry-queue/replay', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const scope = String(req.body?.status || 'all').toLowerCase();
        const statuses =
            scope === 'permanent_failure'
                ? ['permanent_failure']
                : ['permanent_failure', 'pending'];
        const r = await db.query(
            `UPDATE web2_webhook_retry_queue
                SET status = 'pending', retry_count = 0,
                    next_retry_at = NOW(), last_error = NULL
              WHERE status = ANY($1::text[])
              RETURNING id`,
            [statuses]
        );
        console.log(`[web2-webhook-retry] replay reset ${r.rowCount} rows (scope=${scope})`);
        res.json({ success: true, requeued: r.rowCount });
    } catch (e) {
        handleError(res, e, 'Retry queue replay');
    }
});

// =====================================================
// GET /api/web2/monitoring/blacklist
// =====================================================
router.get('/blacklist', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = getDb(req);
        const items = await web2Blacklist.listAll(db);
        res.json({ success: true, data: items });
    } catch (e) {
        handleError(res, e, 'Blacklist list');
    }
});

// =====================================================
// POST /api/web2/monitoring/blacklist
// Body: { pattern, reason, addedBy }
// =====================================================
router.post('/blacklist', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const { pattern, type, reason, addedBy } = req.body || {};
        if (!pattern) {
            return res.status(400).json({ success: false, error: 'pattern required' });
        }
        const row = await web2Blacklist.add(db, { pattern, type, reason, addedBy });
        res.json({ success: true, data: row });
    } catch (e) {
        handleError(res, e, 'Blacklist add');
    }
});

// =====================================================
// DELETE /api/web2/monitoring/blacklist/:id  → deactivate
// =====================================================
router.delete('/blacklist/:id', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const id = parseInt(req.params.id);
        const by = req.query.by || req.body?.by || 'unknown';
        const row = await web2Blacklist.deactivate(db, id, by);
        if (!row) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, data: row });
    } catch (e) {
        handleError(res, e, 'Blacklist deactivate');
    }
});

module.exports = router;
