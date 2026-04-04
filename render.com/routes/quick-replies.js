// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// QUICK REPLIES REST API
// Replaces Firebase Firestore collection: quickReplies
// =====================================================

const express = require('express');
const router = express.Router();

/**
 * GET /api/quick-replies
 * Load all quick replies ordered by sort_order
 */
router.get('/', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const result = await pool.query(
            'SELECT * FROM quick_replies ORDER BY sort_order ASC'
        );

        res.json({
            success: true,
            replies: result.rows.map(row => ({
                id: row.id,
                sortOrder: row.sort_order,
                shortcut: row.shortcut || '',
                topic: row.topic || '',
                topicColor: row.topic_color || '#6b7280',
                message: row.message,
                imageUrl: row.image_url || '',
                contentId: row.content_id || ''
            }))
        });
    } catch (error) {
        console.error('[QUICK-REPLIES] GET / error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/quick-replies
 * Add a new quick reply
 */
router.post('/', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { shortcut, topic, topicColor, message, imageUrl, contentId } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'message is required' });
        }

        // Get next sort_order
        const maxResult = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM quick_replies');
        const nextOrder = maxResult.rows[0].next_order;

        const result = await pool.query(`
            INSERT INTO quick_replies (sort_order, shortcut, topic, topic_color, message, image_url, content_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [nextOrder, shortcut || '', topic || '', topicColor || '#6b7280', message, imageUrl || '', contentId || '']);

        const row = result.rows[0];
        res.json({
            success: true,
            reply: {
                id: row.id,
                sortOrder: row.sort_order,
                shortcut: row.shortcut,
                topic: row.topic,
                topicColor: row.topic_color,
                message: row.message,
                imageUrl: row.image_url || '',
                contentId: row.content_id || ''
            }
        });
    } catch (error) {
        console.error('[QUICK-REPLIES] POST / error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/quick-replies/:id
 * Update an existing quick reply
 */
router.put('/:id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { id } = req.params;
        const { shortcut, topic, topicColor, message, imageUrl, contentId } = req.body;

        const result = await pool.query(`
            UPDATE quick_replies SET
                shortcut = COALESCE($1, shortcut),
                topic = COALESCE($2, topic),
                topic_color = COALESCE($3, topic_color),
                message = COALESCE($4, message),
                image_url = COALESCE($5, image_url),
                content_id = COALESCE($6, content_id),
                updated_at = NOW()
            WHERE id = $7
            RETURNING *
        `, [shortcut, topic, topicColor, message, imageUrl, contentId, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Reply not found' });
        }

        const row = result.rows[0];
        res.json({
            success: true,
            reply: {
                id: row.id,
                sortOrder: row.sort_order,
                shortcut: row.shortcut,
                topic: row.topic,
                topicColor: row.topic_color,
                message: row.message,
                imageUrl: row.image_url || '',
                contentId: row.content_id || ''
            }
        });
    } catch (error) {
        console.error('[QUICK-REPLIES] PUT /:id error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/quick-replies/:id/content-id
 * Update only contentId for a quick reply (cache optimization)
 */
router.patch('/:id/content-id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { id } = req.params;
        const { contentId } = req.body;

        await pool.query(
            'UPDATE quick_replies SET content_id = $1, updated_at = NOW() WHERE id = $2',
            [contentId || '', id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('[QUICK-REPLIES] PATCH /:id/content-id error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/quick-replies/:id
 * Delete a quick reply
 */
router.delete('/:id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { id } = req.params;

        const result = await pool.query('DELETE FROM quick_replies WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Reply not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[QUICK-REPLIES] DELETE /:id error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/quick-replies/bulk
 * Replace all quick replies (for reorder or bulk import)
 */
router.put('/bulk', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { replies } = req.body;
        if (!Array.isArray(replies)) {
            return res.status(400).json({ error: 'replies array is required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM quick_replies');

            for (let i = 0; i < replies.length; i++) {
                const r = replies[i];
                await client.query(`
                    INSERT INTO quick_replies (sort_order, shortcut, topic, topic_color, message, image_url, content_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [i + 1, r.shortcut || '', r.topic || '', r.topicColor || '#6b7280', r.message || '', r.imageUrl || '', r.contentId || '']);
            }

            await client.query('COMMIT');
            res.json({ success: true, count: replies.length });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[QUICK-REPLIES] PUT /bulk error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
