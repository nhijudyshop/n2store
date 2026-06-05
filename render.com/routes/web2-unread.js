// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
// =====================================================
// Web 2.0 — Unread Messages API (độc lập Web 1.0)
// =====================================================
//
// Đọc web2_unread_messages (web2Db) — KHÔNG đọc pending_customers (Web 1.0).
// Schema do services/web2-unread-tracker.js quản lý (ensureSchema lúc boot).
//
// Mount: /api/web2/unread (CF worker forward /api/web2/* về Render).
//   GET    /              → list tin chưa đọc (filter page_id, limit)
//   GET    /stats         → tổng conversation + tổng message_count
//
// CHỈ ĐỌC: danh sách auto-clear hoàn toàn theo Pancake (unread=0 / shop trả lời)
// trong tracker — KHÔNG có mark-seen thủ công. SSE topic: web2:unread.

'use strict';

const express = require('express');
const router = express.Router();

const tracker = require('../services/web2-unread-tracker');

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

// ─── GET / — list tin chưa đọc ────────────────────────────────────────
router.get('/', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const pageId = req.query.page_id;
    const limit = Math.min(Number(req.query.limit) || 500, 1500);
    const params = [];
    let where = '';
    if (pageId) {
        params.push(pageId);
        where = 'WHERE page_id = $1';
    }
    params.push(limit);
    try {
        const { rows } = await pool.query(
            `SELECT psid, page_id, conversation_id, customer_name, last_message_snippet,
                    last_message_time, message_count, type
             FROM web2_unread_messages
             ${where}
             ORDER BY last_message_time DESC NULLS LAST
             LIMIT $${params.length}`,
            params
        );
        res.json({ success: true, count: rows.length, customers: rows });
    } catch (e) {
        console.error('[WEB2-UNREAD-API] list failed:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── GET /stats ───────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS conversations,
                    COALESCE(SUM(message_count),0)::int AS messages
             FROM web2_unread_messages`
        );
        res.json({ success: true, data: rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.ensureSchema = tracker.ensureSchema;

module.exports = router;
