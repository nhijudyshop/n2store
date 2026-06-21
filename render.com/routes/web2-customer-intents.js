// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Customer Intents API (FLAG-only: huỷ đơn/đổi địa chỉ/xem đơn/ship)
// =====================================================
// Đọc web2_customer_intents (schema do detector ensureSchema quản lý).
// Mount /api/web2/customer-intents. KHÔNG auto-execute — chỉ để staff xử lý tay.
//   GET  /              → list (status, limit, offset)
//   GET  /stats         → đếm open
//   POST /:id/done      → đánh dấu đã xử lý
// SSE topic: web2:customer-intents

'use strict';
const express = require('express');
const router = express.Router();
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}
let _notifyClients = null;
function initializeNotifiers(n) {
    _notifyClients = n;
}

function mapRow(r) {
    return {
        id: Number(r.id),
        psid: r.psid,
        pageId: r.page_id,
        conversationId: r.conversation_id,
        customerName: r.customer_name,
        intent: r.intent,
        label: r.label,
        rawMessage: r.raw_message,
        status: r.status,
        createdAt: r.created_at ? Number(r.created_at) : null,
        doneAt: r.done_at ? Number(r.done_at) : null,
        doneBy: r.done_by,
    };
}

router.get('/', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const status = req.query.status || 'open';
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    let where = '';
    if (status && status !== 'all') {
        params.push(status);
        where = `WHERE status = $${params.length}`;
    }
    const countParams = [...params];
    params.push(limit);
    params.push(offset);
    try {
        const { rows } = await pool.query(
            `SELECT * FROM web2_customer_intents ${where}
             ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );
        const c = await pool.query(
            `SELECT COUNT(*)::int n FROM web2_customer_intents ${where}`,
            countParams
        );
        const total = c.rows[0].n;
        res.json({
            success: true,
            data: rows.map(mapRow),
            meta: { total, limit, offset, hasMore: offset + rows.length < total },
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/stats', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int n FROM web2_customer_intents WHERE status='open'`
        );
        res.json({ success: true, data: { open: rows[0].n } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// AUTH GATE (audit 2026-06-20 #9/#26): trước đây bare → ai cũng đánh dấu done.
router.post('/:id/done', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const id = Number(req.params.id);
    const by =
        (req.body && (req.web2User?.name || req.body.userName || req.body.by)) || '(ẩn danh)';
    try {
        const { rows } = await pool.query(
            `UPDATE web2_customer_intents SET status='done', done_at=$2, done_by=$3
             WHERE id=$1 RETURNING id`,
            [id, Date.now(), by]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'not found' });
        if (_notifyClients) {
            try {
                _notifyClients(
                    'web2:customer-intents',
                    { action: 'done', id, ts: Date.now() },
                    'update'
                );
            } catch (e) {
                /* ignore */
            }
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.initializeNotifiers = initializeNotifiers;
module.exports = router;
