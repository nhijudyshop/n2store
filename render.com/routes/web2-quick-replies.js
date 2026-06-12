// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
// =====================================================
// WEB 2.0 QUICK REPLIES — fork khỏi /api/quick-replies (Web 1.0).
//
// 3W1 (2026-06-12, audit vòng 3): web2-quick-reply.js trước đây CRUD thẳng
// bảng `quick_replies` trên chatDb PROD (orders-report chat Web 1.0 cùng dùng)
// → xoá quick-reply từ trang beta Web 2.0 là MẤT luôn ở chat Web 1.0.
// Fork: bảng riêng `web2_quick_replies` trên web2Db + one-time auto-seed
// READ-ONLY từ bảng Web 1.0 khi bảng mới còn rỗng (copy nội dung, không đụng
// bảng gốc). API shape GIỮ NGUYÊN của quick-replies.js để client chỉ đổi URL.
//
// Mount: app.use('/api/web2-quick-replies', ...) — pool web2Db || chatDb.
// SSE: _notify topic 'web2:quick-replies' sau mutation (hub web2).
// =====================================================

const express = require('express');
const router = express.Router();
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');

let _notifyClients = null;
router.initializeNotifiers = (notifyClients) => {
    _notifyClients = notifyClients;
};
function _notify(action, id) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:quick-replies', { action, id: id ?? null, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-QUICK-REPLIES] _notify failed:', e.message);
    }
}

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

// _ensuredPools: WeakSet key theo pool (không dùng flag boolean share giữa
// 2 pool — pattern SP-tablescreated đã catalog).
const _ensuredPools = new WeakSet();
async function ensureTables(req) {
    const pool = getPool(req);
    if (_ensuredPools.has(pool)) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_quick_replies (
            id          BIGSERIAL PRIMARY KEY,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            shortcut    TEXT DEFAULT '',
            topic       TEXT DEFAULT '',
            topic_color TEXT DEFAULT '#6b7280',
            message     TEXT NOT NULL,
            image_url   TEXT DEFAULT '',
            content_id  TEXT DEFAULT '',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    // One-time seed từ Web 1.0 (READ-ONLY trên chatDb — chỉ SELECT). Chạy khi
    // bảng mới rỗng VÀ có chatDb. Lỗi seed không chặn route (bảng mới vẫn dùng
    // được, chỉ là trống).
    try {
        const cnt = await pool.query(`SELECT COUNT(*)::int AS n FROM web2_quick_replies`);
        const chatDb = req.app.locals.chatDb;
        if (cnt.rows[0].n === 0 && chatDb && chatDb !== pool) {
            const src = await chatDb.query(
                `SELECT sort_order, shortcut, topic, topic_color, message, image_url, content_id
                 FROM quick_replies ORDER BY sort_order ASC`
            );
            for (const r of src.rows) {
                await pool.query(
                    `INSERT INTO web2_quick_replies
                        (sort_order, shortcut, topic, topic_color, message, image_url, content_id)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                    [
                        r.sort_order || 0,
                        r.shortcut || '',
                        r.topic || '',
                        r.topic_color || '#6b7280',
                        r.message,
                        r.image_url || '',
                        r.content_id || '',
                    ]
                );
            }
            console.log(
                `[WEB2-QUICK-REPLIES] one-time seed: copy ${src.rows.length} rows từ quick_replies (Web 1.0, read-only)`
            );
        }
    } catch (e) {
        console.warn('[WEB2-QUICK-REPLIES] seed từ Web 1.0 fail (bỏ qua):', e.message);
    }
    _ensuredPools.add(pool);
}

function mapRow(row) {
    return {
        id: row.id,
        sortOrder: row.sort_order,
        shortcut: row.shortcut || '',
        topic: row.topic || '',
        topicColor: row.topic_color || '#6b7280',
        message: row.message,
        imageUrl: row.image_url || '',
        contentId: row.content_id || '',
    };
}

// GET /api/web2-quick-replies
router.get('/', async (req, res) => {
    try {
        const pool = getPool(req);
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(req);
        const result = await pool.query(
            `SELECT * FROM web2_quick_replies ORDER BY sort_order ASC, id ASC`
        );
        res.json({ success: true, replies: result.rows.map(mapRow) });
    } catch (error) {
        console.error('[WEB2-QUICK-REPLIES] GET / error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/web2-quick-replies
router.post('/', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = getPool(req);
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(req);
        const { shortcut, topic, topicColor, message, imageUrl, contentId } = req.body || {};
        if (!message) return res.status(400).json({ error: 'message is required' });
        const result = await pool.query(
            `INSERT INTO web2_quick_replies
                (sort_order, shortcut, topic, topic_color, message, image_url, content_id)
             VALUES (
                (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM web2_quick_replies),
                $1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                shortcut || '',
                topic || '',
                topicColor || '#6b7280',
                message,
                imageUrl || '',
                contentId || '',
            ]
        );
        _notify('create', result.rows[0].id);
        res.json({ success: true, reply: mapRow(result.rows[0]) });
    } catch (error) {
        console.error('[WEB2-QUICK-REPLIES] POST / error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/web2-quick-replies/:id
router.put('/:id', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = getPool(req);
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(req);
        const id = parseInt(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
        const b = req.body || {};
        const result = await pool.query(
            `UPDATE web2_quick_replies SET
                shortcut    = COALESCE($2, shortcut),
                topic       = COALESCE($3, topic),
                topic_color = COALESCE($4, topic_color),
                message     = COALESCE($5, message),
                image_url   = COALESCE($6, image_url),
                content_id  = COALESCE($7, content_id),
                sort_order  = COALESCE($8, sort_order),
                updated_at  = NOW()
             WHERE id = $1 RETURNING *`,
            [
                id,
                b.shortcut ?? null,
                b.topic ?? null,
                b.topicColor ?? null,
                b.message ?? null,
                b.imageUrl ?? null,
                b.contentId ?? null,
                b.sortOrder ?? null,
            ]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
        _notify('update', id);
        res.json({ success: true, reply: mapRow(result.rows[0]) });
    } catch (error) {
        console.error('[WEB2-QUICK-REPLIES] PUT /:id error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/web2-quick-replies/:id
router.delete('/:id', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = getPool(req);
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(req);
        const id = parseInt(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
        const r = await pool.query(`DELETE FROM web2_quick_replies WHERE id = $1 RETURNING id`, [
            id,
        ]);
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        _notify('delete', id);
        res.json({ success: true });
    } catch (error) {
        console.error('[WEB2-QUICK-REPLIES] DELETE /:id error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
