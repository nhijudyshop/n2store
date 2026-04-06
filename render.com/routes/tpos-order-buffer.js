// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// TPOS ORDER BUFFER
// Server-side buffer for TPOS order events.
// Ensures no orders are lost when client disconnects.
// Client polls this buffer to catch up on missed events.
// =====================================================

const express = require('express');
const router = express.Router();

let tableReady = false;

async function ensureTable(db) {
    if (tableReady) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS tpos_order_buffer (
                id SERIAL PRIMARY KEY,
                order_code VARCHAR(50) NOT NULL,
                order_id VARCHAR(100),
                event_type VARCHAR(20) DEFAULT 'created',
                session_id INT,
                session_index INT,
                customer_name VARCHAR(255),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_tpos_order_buffer_created_at
            ON tpos_order_buffer(created_at DESC)
        `);
        // Add session_id column if table already exists without it
        await db.query(`
            ALTER TABLE tpos_order_buffer ADD COLUMN IF NOT EXISTS session_id INT
        `);
        tableReady = true;
        console.log('[ORDER-BUFFER] Table ready');
    } catch (error) {
        console.error('[ORDER-BUFFER] Table creation error:', error.message);
    }
}

/**
 * Save an order event to the buffer (fire-and-forget from server.js).
 */
async function saveOrderToBuffer(db, orderData) {
    if (!db) return null;
    await ensureTable(db);

    const code = orderData?.Data?.Code || orderData?.Code;
    if (!code) return null;

    const id = orderData?.Data?.Id || orderData?.Id || null;
    const eventAction = orderData?.EventName || 'created';
    const sessionId = orderData?.Data?.Session || orderData?.Session || null;
    const sessionIndex = orderData?.Data?.SessionIndex || orderData?.SessionIndex || null;
    const customerName = orderData?.Data?.Facebook_UserName || orderData?.Facebook_UserName || null;

    try {
        const result = await db.query(
            `INSERT INTO tpos_order_buffer (order_code, order_id, event_type, session_id, session_index, customer_name)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, created_at`,
            [code, id, eventAction, sessionId, sessionIndex, customerName]
        );
        return result.rows[0];
    } catch (error) {
        console.error('[ORDER-BUFFER] Save error:', error.message);
        return null;
    }
}

/**
 * GET /api/tpos/order-buffer?since=<timestamp>&limit=<n>
 * Returns buffered order events since the given timestamp.
 */
router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        await ensureTable(db);

        const since = parseInt(req.query.since) || 0;
        const limit = Math.min(parseInt(req.query.limit) || 200, 500);

        // Default: last 3 hours if no since provided
        const sinceDate = since > 0
            ? new Date(since)
            : new Date(Date.now() - 3 * 60 * 60 * 1000);

        const result = await db.query(
            `SELECT order_code, order_id, event_type, session_id, session_index, customer_name, created_at
             FROM tpos_order_buffer
             WHERE created_at > $1
             ORDER BY created_at ASC
             LIMIT $2`,
            [sinceDate.toISOString(), limit]
        );

        res.json({
            success: true,
            data: result.rows,
            count: result.rows.length,
            serverTime: Date.now()
        });
    } catch (error) {
        console.error('[ORDER-BUFFER] Query error:', error.message);
        res.status(500).json({ error: 'Failed to query order buffer' });
    }
});

/**
 * Cleanup buffer entries older than 3 days.
 */
async function cleanupOrderBuffer(db) {
    try {
        await ensureTable(db);
        const result = await db.query(
            `DELETE FROM tpos_order_buffer WHERE created_at < NOW() - INTERVAL '3 days' RETURNING id`
        );
        return result.rowCount;
    } catch (error) {
        console.error('[ORDER-BUFFER] Cleanup error:', error.message);
        return 0;
    }
}

module.exports = router;
module.exports.saveOrderToBuffer = saveOrderToBuffer;
module.exports.cleanupOrderBuffer = cleanupOrderBuffer;
