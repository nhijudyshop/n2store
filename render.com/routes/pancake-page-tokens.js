// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// Pancake Page Access Tokens API
// Store & retrieve page_access_tokens in PostgreSQL
// Replaces Firestore pancake_tokens/page_access_tokens
// =====================================================

const express = require('express');
const router = express.Router();

let dbPool = null;

router.init = async (pool) => {
    dbPool = pool;
    console.log('[PANCAKE-PAGE-TOKENS] Route initialized');
};

// =====================================================
// GET /api/pancake-page-tokens
// Returns all cached page_access_tokens
// =====================================================
router.get('/', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        const r = await dbPool.query('SELECT * FROM pancake_page_access_tokens ORDER BY updated_at DESC');
        const tokens = {};
        for (const row of r.rows) {
            tokens[row.page_id] = {
                token: row.token,
                pageId: row.page_id,
                pageName: row.page_name || '',
                timestamp: row.timestamp ? Number(row.timestamp) : null,
                savedAt: row.saved_at ? Number(row.saved_at) : null,
                generatedBy: row.generated_by || ''
            };
        }
        res.json({ success: true, tokens });
    } catch (e) {
        console.error('[PANCAKE-PAGE-TOKENS] GET error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// PUT /api/pancake-page-tokens/:pageId
// Upsert a page_access_token
// Body: { token, pageName?, timestamp?, generatedBy? }
// =====================================================
router.put('/:pageId', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    const { pageId } = req.params;
    const { token, pageName, timestamp, generatedBy } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });

    try {
        await dbPool.query(`
            INSERT INTO pancake_page_access_tokens (page_id, token, page_name, timestamp, saved_at, generated_by, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (page_id) DO UPDATE SET
                token = EXCLUDED.token,
                page_name = COALESCE(EXCLUDED.page_name, pancake_page_access_tokens.page_name),
                timestamp = EXCLUDED.timestamp,
                saved_at = EXCLUDED.saved_at,
                generated_by = EXCLUDED.generated_by,
                updated_at = NOW()
        `, [pageId, token, pageName || null, timestamp || null, Date.now(), generatedBy || null]);

        res.json({ success: true });
    } catch (e) {
        console.error('[PANCAKE-PAGE-TOKENS] PUT error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// DELETE /api/pancake-page-tokens/:pageId
// Delete a page_access_token
// =====================================================
router.delete('/:pageId', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        await dbPool.query('DELETE FROM pancake_page_access_tokens WHERE page_id = $1', [req.params.pageId]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// POST /api/pancake-page-tokens/:pageId/lock
// Distributed regen lock — atomic acquire via SQL UPDATE WHERE lock expired.
// Only one machine can hold the lock at a time. TTL 5s.
// Body: { ttlMs? } — optional, default 5000ms
// Response: { acquired: true, lockUntil } or { acquired: false, lockUntil }
// =====================================================
router.post('/:pageId/lock', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    const { pageId } = req.params;
    const ttlMs = Math.max(1000, Math.min(30000, parseInt(req.body?.ttlMs, 10) || 5000));

    try {
        // Atomic: acquire only if no active lock.
        // UPSERT pattern: insert row with lock if missing, else update only if expired.
        // NOTE: page_id is PK so ON CONFLICT resolves to the existing row.
        const result = await dbPool.query(`
            INSERT INTO pancake_page_access_tokens (page_id, token, regen_lock_until, updated_at)
            VALUES ($1, '__LOCK_PLACEHOLDER__', NOW() + ($2 || ' milliseconds')::interval, NOW())
            ON CONFLICT (page_id) DO UPDATE
                SET regen_lock_until = NOW() + ($2 || ' milliseconds')::interval,
                    updated_at = NOW()
                WHERE pancake_page_access_tokens.regen_lock_until IS NULL
                   OR pancake_page_access_tokens.regen_lock_until < NOW()
            RETURNING regen_lock_until, token
        `, [pageId, String(ttlMs)]);

        if (result.rowCount > 0) {
            // Cleanup placeholder token if we just inserted one
            if (result.rows[0].token === '__LOCK_PLACEHOLDER__') {
                await dbPool.query(
                    `UPDATE pancake_page_access_tokens SET token = '' WHERE page_id = $1 AND token = '__LOCK_PLACEHOLDER__'`,
                    [pageId]
                );
            }
            return res.json({ acquired: true, lockUntil: result.rows[0].regen_lock_until });
        }

        // Lock held by another machine — return current lock expiry
        const existing = await dbPool.query(
            'SELECT regen_lock_until FROM pancake_page_access_tokens WHERE page_id = $1',
            [pageId]
        );
        res.json({
            acquired: false,
            lockUntil: existing.rows[0]?.regen_lock_until || null
        });
    } catch (e) {
        console.error('[PANCAKE-PAGE-TOKENS] LOCK error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// DELETE /api/pancake-page-tokens/:pageId/lock
// Release regen lock (called after regen finishes)
// =====================================================
router.delete('/:pageId/lock', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        await dbPool.query(
            'UPDATE pancake_page_access_tokens SET regen_lock_until = NULL WHERE page_id = $1',
            [req.params.pageId]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
