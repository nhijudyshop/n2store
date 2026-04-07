// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// Facebook Global ID Cache
// Stores resolved (page_id, psid) → globalUserId mappings.
// Lý do: 6 strategies trong N2Store extension hay fail (Facebook doc_id rotate).
// Khi máy A resolve thành công → save vào DB → máy B lookup → bypass cả pipeline.
// Cache không TTL — FBID hiếm khi đổi. Stale entries auto-invalidated khi send fail.
// =====================================================

const express = require('express');
const router = express.Router();

let dbPool = null;

async function ensureTable() {
    if (!dbPool) return;
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS fb_global_id_cache (
            id SERIAL PRIMARY KEY,
            page_id VARCHAR(50) NOT NULL,
            psid VARCHAR(50) NOT NULL,
            global_user_id VARCHAR(50) NOT NULL,
            conversation_id VARCHAR(100),
            customer_name VARCHAR(255),
            thread_id VARCHAR(100),
            resolved_by VARCHAR(50),
            resolved_at TIMESTAMP DEFAULT NOW(),
            last_used_at TIMESTAMP DEFAULT NOW(),
            use_count INTEGER DEFAULT 0,
            send_success_count INTEGER DEFAULT 0,
            send_fail_count INTEGER DEFAULT 0,
            UNIQUE(page_id, psid)
        )
    `);
    await dbPool.query(`
        CREATE INDEX IF NOT EXISTS idx_fb_global_id_psid ON fb_global_id_cache(psid);
        CREATE INDEX IF NOT EXISTS idx_fb_global_id_conv ON fb_global_id_cache(conversation_id);
    `);
}

router.init = async (pool) => {
    dbPool = pool;
    try {
        await ensureTable();
        console.log('[FB-GLOBAL-ID] Table ready');
    } catch (e) {
        console.error('[FB-GLOBAL-ID] ensureTable error:', e.message);
    }
};

// =====================================================
// GET /api/fb-global-id?pageId=X&psid=Y
// Lookup cached globalUserId. Returns null if not found.
// =====================================================
router.get('/', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });

    const { pageId, psid, conversationId } = req.query;
    if (!pageId || (!psid && !conversationId)) {
        return res.status(400).json({ error: 'pageId + (psid or conversationId) required' });
    }

    try {
        let row = null;
        if (psid) {
            const r = await dbPool.query(
                'SELECT * FROM fb_global_id_cache WHERE page_id = $1 AND psid = $2',
                [pageId, psid]
            );
            row = r.rows[0];
        }
        if (!row && conversationId) {
            const r = await dbPool.query(
                'SELECT * FROM fb_global_id_cache WHERE page_id = $1 AND conversation_id = $2',
                [pageId, conversationId]
            );
            row = r.rows[0];
        }

        if (!row) {
            return res.json({ found: false });
        }

        // Bump use stats async
        dbPool.query(
            'UPDATE fb_global_id_cache SET last_used_at = NOW(), use_count = use_count + 1 WHERE id = $1',
            [row.id]
        ).catch(() => {});

        return res.json({
            found: true,
            globalUserId: row.global_user_id,
            customerName: row.customer_name,
            resolvedBy: row.resolved_by,
            resolvedAt: row.resolved_at,
            useCount: row.use_count + 1,
        });
    } catch (e) {
        console.error('[FB-GLOBAL-ID] GET error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// PUT /api/fb-global-id
// Body: { pageId, psid, globalUserId, conversationId?, customerName?, threadId?, resolvedBy? }
// Idempotent upsert.
// =====================================================
router.put('/', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });

    const { pageId, psid, globalUserId, conversationId, customerName, threadId, resolvedBy } = req.body || {};
    if (!pageId || !psid || !globalUserId) {
        return res.status(400).json({ error: 'pageId, psid, globalUserId required' });
    }

    try {
        await dbPool.query(`
            INSERT INTO fb_global_id_cache
                (page_id, psid, global_user_id, conversation_id, customer_name, thread_id, resolved_by, resolved_at, last_used_at, use_count)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), 0)
            ON CONFLICT (page_id, psid) DO UPDATE SET
                global_user_id = EXCLUDED.global_user_id,
                conversation_id = COALESCE(EXCLUDED.conversation_id, fb_global_id_cache.conversation_id),
                customer_name = COALESCE(EXCLUDED.customer_name, fb_global_id_cache.customer_name),
                thread_id = COALESCE(EXCLUDED.thread_id, fb_global_id_cache.thread_id),
                resolved_by = EXCLUDED.resolved_by,
                resolved_at = NOW(),
                last_used_at = NOW()
        `, [pageId, psid, globalUserId, conversationId || null, customerName || null, threadId || null, resolvedBy || null]);

        res.json({ success: true });
    } catch (e) {
        console.error('[FB-GLOBAL-ID] PUT error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// POST /api/fb-global-id/send-result
// Body: { pageId, psid, success: bool }
// Track send success/fail counts. Auto-invalidate entry after 3 consecutive fails.
// =====================================================
router.post('/send-result', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });

    const { pageId, psid, success } = req.body || {};
    if (!pageId || !psid || typeof success !== 'boolean') {
        return res.status(400).json({ error: 'pageId, psid, success(bool) required' });
    }

    try {
        if (success) {
            await dbPool.query(
                'UPDATE fb_global_id_cache SET send_success_count = send_success_count + 1, send_fail_count = 0, last_used_at = NOW() WHERE page_id = $1 AND psid = $2',
                [pageId, psid]
            );
        } else {
            // Auto-invalidate after 3 consecutive fails
            const r = await dbPool.query(
                'UPDATE fb_global_id_cache SET send_fail_count = send_fail_count + 1 WHERE page_id = $1 AND psid = $2 RETURNING send_fail_count',
                [pageId, psid]
            );
            const failCount = r.rows[0]?.send_fail_count || 0;
            if (failCount >= 3) {
                await dbPool.query(
                    'DELETE FROM fb_global_id_cache WHERE page_id = $1 AND psid = $2',
                    [pageId, psid]
                );
                console.log(`[FB-GLOBAL-ID] Auto-invalidated stale entry: page=${pageId} psid=${psid} (3 consecutive fails)`);
                return res.json({ success: true, invalidated: true });
            }
        }
        res.json({ success: true });
    } catch (e) {
        console.error('[FB-GLOBAL-ID] send-result error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// GET /api/fb-global-id/stats
// Stats: total entries, total successful sends, top resolved-by accounts
// =====================================================
router.get('/stats', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        const total = await dbPool.query('SELECT COUNT(*) as c FROM fb_global_id_cache');
        const recent = await dbPool.query(`
            SELECT COUNT(*) as c FROM fb_global_id_cache
            WHERE last_used_at > NOW() - INTERVAL '7 days'
        `);
        const successCount = await dbPool.query('SELECT SUM(send_success_count) as s FROM fb_global_id_cache');
        res.json({
            totalEntries: parseInt(total.rows[0].c),
            recentEntries: parseInt(recent.rows[0].c),
            totalSuccessfulSends: parseInt(successCount.rows[0].s || 0),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
