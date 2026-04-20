// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// ORDER NOTES REST API
// CSKH order notes history — multi-entry per order.
// Each note: { id, order_id, author, text, created_at, updated_at, is_edited }
// Ownership: author-based (only author can edit/delete own notes).
// =====================================================

const express = require('express');
const router = express.Router();

const MAX_AGE_DAYS = 180;
const MAX_TEXT_LEN = 2000;
const MAX_AUTHOR_LEN = 128;
const MAX_ORDER_ID_LEN = 64;
const SSE_KEY = 'order_notes_global';

// Injected from server.js (see initializeNotifiers)
let notifyClients = null;
function initializeNotifiers(notify) {
    notifyClients = notify;
    console.log('[ORDER-NOTES] SSE notifier initialized');
}
function broadcast(action, payload) {
    if (typeof notifyClients !== 'function') return;
    try {
        notifyClients(SSE_KEY, { action, ...payload }, 'update');
    } catch (e) {
        console.warn('[ORDER-NOTES] broadcast failed:', e.message);
    }
}

function sanitizeString(v, maxLen) {
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    if (!trimmed || trimmed.length > maxLen) return null;
    return trimmed;
}

/**
 * GET /api/order-notes/load
 * Load all order notes within MAX_AGE_DAYS.
 * Returns { success, entries: [{id, orderId, author, text, createdAt, updatedAt, isEdited}] }
 */
router.get('/load', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
        const result = await pool.query(
            `SELECT id, order_id, author, text, created_at, updated_at, is_edited
               FROM order_notes
              WHERE created_at >= $1
              ORDER BY order_id ASC, created_at ASC`,
            [cutoff]
        );

        const entries = result.rows.map(r => ({
            id: r.id,
            orderId: r.order_id,
            author: r.author,
            text: r.text,
            createdAt: r.created_at.getTime(),
            updatedAt: r.updated_at.getTime(),
            isEdited: r.is_edited,
        }));

        res.json({ success: true, entries });
    } catch (error) {
        console.error('[ORDER-NOTES] GET /load error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/order-notes/entries
 * Body: { orderId, author, text }
 * Creates a new note; returns the full note row.
 */
router.post('/entries', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const orderId = sanitizeString(req.body?.orderId, MAX_ORDER_ID_LEN);
        const author = sanitizeString(req.body?.author, MAX_AUTHOR_LEN);
        const text = sanitizeString(req.body?.text, MAX_TEXT_LEN);

        if (!orderId) return res.status(400).json({ error: 'orderId required (1-64 chars)' });
        if (!author) return res.status(400).json({ error: 'author required (1-128 chars)' });
        if (!text) return res.status(400).json({ error: 'text required (1-2000 chars)' });

        const result = await pool.query(
            `INSERT INTO order_notes (order_id, author, text)
             VALUES ($1, $2, $3)
             RETURNING id, order_id, author, text, created_at, updated_at, is_edited`,
            [orderId, author, text]
        );
        const r = result.rows[0];
        const note = {
            id: r.id,
            orderId: r.order_id,
            author: r.author,
            text: r.text,
            createdAt: r.created_at.getTime(),
            updatedAt: r.updated_at.getTime(),
            isEdited: r.is_edited,
        };
        broadcast('created', { note });
        res.json({ success: true, note });
    } catch (error) {
        console.error('[ORDER-NOTES] POST /entries error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/order-notes/entries/:id
 * Body: { author, text }
 * Updates a note — only if request author matches row author.
 */
router.put('/entries/:id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const id = req.params.id;
        const author = sanitizeString(req.body?.author, MAX_AUTHOR_LEN);
        const text = sanitizeString(req.body?.text, MAX_TEXT_LEN);

        if (!author) return res.status(400).json({ error: 'author required (1-128 chars)' });
        if (!text) return res.status(400).json({ error: 'text required (1-2000 chars)' });

        const result = await pool.query(
            `UPDATE order_notes
                SET text = $1, is_edited = TRUE
              WHERE id = $2 AND author = $3
              RETURNING id, order_id, author, text, created_at, updated_at, is_edited`,
            [text, id, author]
        );

        if (result.rowCount === 0) {
            return res.status(403).json({ error: 'Not your note (or note not found)' });
        }
        const r = result.rows[0];
        const note = {
            id: r.id,
            orderId: r.order_id,
            author: r.author,
            text: r.text,
            createdAt: r.created_at.getTime(),
            updatedAt: r.updated_at.getTime(),
            isEdited: r.is_edited,
        };
        broadcast('updated', { note });
        res.json({ success: true, note });
    } catch (error) {
        console.error('[ORDER-NOTES] PUT /entries error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/order-notes/entries/:id?author=...
 * Deletes a note — only if query.author matches row.author.
 */
router.delete('/entries/:id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const id = req.params.id;
        const author = sanitizeString(req.query?.author, MAX_AUTHOR_LEN);
        if (!author) return res.status(400).json({ error: 'author query param required' });

        const result = await pool.query(
            `DELETE FROM order_notes WHERE id = $1 AND author = $2 RETURNING id, order_id`,
            [id, author]
        );

        if (result.rowCount === 0) {
            return res.status(403).json({ error: 'Not your note (or note not found)' });
        }

        broadcast('deleted', { noteId: result.rows[0].id, orderId: result.rows[0].order_id });
        res.json({ success: true });
    } catch (error) {
        console.error('[ORDER-NOTES] DELETE /entries error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/order-notes/cleanup
 * Removes notes older than MAX_AGE_DAYS.
 */
router.delete('/cleanup', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
        const result = await pool.query(
            `DELETE FROM order_notes WHERE created_at < $1 RETURNING id`,
            [cutoff]
        );

        res.json({ success: true, cleaned: result.rowCount });
    } catch (error) {
        console.error('[ORDER-NOTES] DELETE /cleanup error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
