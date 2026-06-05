// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
// =====================================================
// Web 2.0 — Payment Signals API ("KH báo đã chuyển khoản")
// =====================================================
//
// Consumer: trang web2/payment-confirm/. Data ở web2Db, bảng web2_payment_signals
// (schema do services/web2-payment-signal-detector.js quản lý — ensureSchema gọi
// 1 lần lúc boot từ server.js).
//
// Mount: /api/web2/payment-signals (CF worker forward /api/web2/* về Render).
//   GET    /                 → list signals (filter status, from, to, page_id) + enrich đơn
//   GET    /stats            → đếm theo status (cho badge/chuông)
//   POST   /:id/confirm      → status='confirmed' (= gắn cờ đơn) + SSE
//   POST   /:id/dismiss      → status='dismissed' (false positive) + SSE
//   POST   /:id/link-order   → gán thủ công { orderType, orderCode } + SSE
//
// SSE topic: web2:payment-signals

'use strict';

const express = require('express');
const router = express.Router();

const detector = require('../services/web2-payment-signal-detector');

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

// ─── SSE notifier (injected từ server.js) ─────────────────────────────
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, id) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:payment-signals', { action, id, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-PAYSIG-API] _notify failed:', e.message);
    }
}

// ─── Map DB row → API shape ───────────────────────────────────────────
function mapSignal(row) {
    return {
        id: Number(row.id),
        psid: row.psid,
        pageId: row.page_id,
        conversationId: row.conversation_id,
        customerName: row.customer_name,
        rawMessage: row.raw_message,
        keyword: row.matched_keyword,
        phone: row.phone,
        orderType: row.matched_order_type,
        orderCode: row.matched_order_code,
        status: row.status,
        createdAt: row.created_at ? Number(row.created_at) : null,
        confirmedAt: row.confirmed_at ? Number(row.confirmed_at) : null,
        confirmedBy: row.confirmed_by,
        // enrich (LEFT JOIN — có thể null)
        order: row.o_code
            ? {
                  type: row.matched_order_type,
                  code: row.o_code,
                  name: row.o_name,
                  phone: row.o_phone,
                  total: row.o_total != null ? Number(row.o_total) : null,
                  status: row.o_status || null,
              }
            : null,
    };
}

// ─── GET / — list signals (enrich đơn qua LEFT JOIN theo type/code) ───
router.get('/', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });

    const status = req.query.status; // pending|confirmed|dismissed|all
    const pageId = req.query.page_id;
    const from = req.query.from ? Number(req.query.from) : null;
    const to = req.query.to ? Number(req.query.to) : null;
    const limit = Math.min(Number(req.query.limit) || 200, 500);

    const where = [];
    const params = [];
    if (status && status !== 'all') {
        params.push(status);
        where.push(`s.status = $${params.length}`);
    }
    if (pageId) {
        params.push(pageId);
        where.push(`s.page_id = $${params.length}`);
    }
    if (from) {
        params.push(from);
        where.push(`s.created_at >= $${params.length}`);
    }
    if (to) {
        params.push(to);
        where.push(`s.created_at <= $${params.length}`);
    }
    params.push(limit);
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // Enrich: 1 LEFT JOIN cho native + 1 cho fast_sale, COALESCE theo type.
    const sql = `
        SELECT s.*,
            COALESCE(no.code, fso.number)                AS o_code,
            COALESCE(no.customer_name, fso.partner_name) AS o_name,
            COALESCE(no.phone, fso.partner_phone)        AS o_phone,
            COALESCE(no.total_amount, fso.amount_total)  AS o_total,
            no.status                                    AS o_status
        FROM web2_payment_signals s
        LEFT JOIN native_orders   no  ON s.matched_order_type = 'native'
                                      AND no.code = s.matched_order_code
        LEFT JOIN fast_sale_orders fso ON s.matched_order_type = 'fast_sale'
                                      AND fso.number = s.matched_order_code
        ${whereSql}
        ORDER BY s.created_at DESC
        LIMIT $${params.length}`;

    try {
        const { rows } = await pool.query(sql, params);
        res.json({ success: true, data: rows.map(mapSignal), meta: { total: rows.length } });
    } catch (e) {
        console.error('[WEB2-PAYSIG-API] list failed:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── GET /stats — đếm theo status ─────────────────────────────────────
router.get('/stats', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        const { rows } = await pool.query(
            `SELECT status, COUNT(*)::int AS n FROM web2_payment_signals GROUP BY status`
        );
        const stats = { pending: 0, confirmed: 0, dismissed: 0 };
        for (const r of rows) stats[r.status] = r.n;
        res.json({ success: true, data: stats });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /:id/confirm — gắn cờ đơn (status=confirmed) ────────────────
router.post('/:id/confirm', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const id = Number(req.params.id);
    const by = (req.body && req.body.by) || req.headers['x-user'] || null;
    try {
        const { rows } = await pool.query(
            `UPDATE web2_payment_signals
             SET status = 'confirmed', confirmed_at = $2, confirmed_by = $3
             WHERE id = $1 RETURNING id`,
            [id, Date.now(), by]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'not found' });
        _notify('confirm', id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /:id/dismiss — false positive ───────────────────────────────
router.post('/:id/dismiss', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const id = Number(req.params.id);
    try {
        const { rows } = await pool.query(
            `UPDATE web2_payment_signals SET status = 'dismissed' WHERE id = $1 RETURNING id`,
            [id]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'not found' });
        _notify('dismiss', id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /:id/link-order — gán đơn thủ công ──────────────────────────
router.post('/:id/link-order', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const id = Number(req.params.id);
    const { orderType, orderCode } = req.body || {};
    if (!orderCode || !['native', 'fast_sale'].includes(orderType)) {
        return res
            .status(400)
            .json({ success: false, error: 'orderType (native|fast_sale) + orderCode required' });
    }
    try {
        const { rows } = await pool.query(
            `UPDATE web2_payment_signals
             SET matched_order_type = $2, matched_order_code = $3
             WHERE id = $1 RETURNING id`,
            [id, orderType, String(orderCode)]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'not found' });
        _notify('link', id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.ensureSchema = detector.ensureSchema;
router.initializeNotifiers = initializeNotifiers;

module.exports = router;
