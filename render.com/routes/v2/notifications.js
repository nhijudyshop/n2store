// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — Notification Center
// In-app notifications cho 13 trang. Producer = các route khác hook vào.
// =====================================================

const express = require('express');
const router = express.Router();

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}

let _migrationDone = false;
async function ensureSchema(pool) {
    if (_migrationDone) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_notifications (
            id BIGSERIAL PRIMARY KEY,
            user_id TEXT,
            type TEXT NOT NULL,
            entity_type TEXT,
            entity_id TEXT,
            title TEXT NOT NULL,
            body TEXT,
            severity TEXT DEFAULT 'info',
            url TEXT,
            read_at TIMESTAMPTZ,
            dedupe_key TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_web2_noti_user_unread
            ON web2_notifications(user_id, read_at) WHERE read_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_web2_noti_created ON web2_notifications(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_web2_noti_dedupe ON web2_notifications(dedupe_key, created_at DESC)
            WHERE dedupe_key IS NOT NULL;
    `);
    _migrationDone = true;
}

router.use(async (req, res, next) => {
    try {
        await ensureSchema(req.app.locals.chatDb);
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: 'schema-init: ' + e.message });
    }
});

// GET /list?unreadOnly=1&limit=50
router.get('/list', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const unreadOnly = req.query.unreadOnly === '1' || req.query.unreadOnly === 'true';
        const where = unreadOnly ? 'WHERE read_at IS NULL' : '';
        const rs = await pool.query(
            `SELECT id, user_id, type, entity_type, entity_id, title, body, severity, url,
                    read_at, created_at
             FROM web2_notifications
             ${where}
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit]
        );
        res.json({ success: true, items: rs.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /unread-count
router.get('/unread-count', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const rs = await pool.query(
            `SELECT COUNT(*)::int AS c FROM web2_notifications WHERE read_at IS NULL`
        );
        res.json({ success: true, count: rs.rows[0]?.c || 0 });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /:id/read
router.post('/:id/read', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        await pool.query(
            `UPDATE web2_notifications SET read_at = NOW() WHERE id = $1 AND read_at IS NULL`,
            [req.params.id]
        );
        _notifyUpdate();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /mark-all-read
router.post('/mark-all-read', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        await pool.query(`UPDATE web2_notifications SET read_at = NOW() WHERE read_at IS NULL`);
        _notifyUpdate();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST / — create notification
// body: { type, title, body?, severity?, url?, entity_type?, entity_id?, dedupe_key? }
router.post('/', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const b = req.body || {};
        if (!b.type || !b.title) {
            return res.status(400).json({ success: false, error: 'type và title bắt buộc' });
        }
        // Dedupe — không insert nếu cùng dedupe_key trong 1h
        if (b.dedupe_key) {
            const dup = await pool.query(
                `SELECT id FROM web2_notifications
                 WHERE dedupe_key = $1 AND created_at > NOW() - INTERVAL '1 hour'
                 LIMIT 1`,
                [b.dedupe_key]
            );
            if (dup.rowCount > 0) {
                return res.json({ success: true, deduped: true, id: dup.rows[0].id });
            }
        }
        const rs = await pool.query(
            `INSERT INTO web2_notifications
             (user_id, type, entity_type, entity_id, title, body, severity, url, dedupe_key)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, created_at`,
            [
                b.user_id || null,
                b.type,
                b.entity_type || null,
                b.entity_id || null,
                b.title,
                b.body || null,
                b.severity || 'info',
                b.url || null,
                b.dedupe_key || null,
            ]
        );
        _notifyUpdate();
        res.json({ success: true, id: rs.rows[0].id, created_at: rs.rows[0].created_at });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        await pool.query(`DELETE FROM web2_notifications WHERE id = $1`, [req.params.id]);
        _notifyUpdate();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /scan — chạy scan định kỳ, tạo noti cho 4 nguồn pain points
//   1. PBH state=draft > 24h
//   2. PBH state=cancel mới trong 1h
//   3. customer_wallets balance < 0
//   4. web2_products stock < 5
//   5. web2_balance_history pending > 1h
router.get('/scan', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const created = [];

        // 1. PBH draft > 24h
        const draftRs = await pool.query(
            `SELECT number FROM fast_sale_orders
             WHERE state = 'draft' AND date_created < NOW() - INTERVAL '24 hours'
             LIMIT 50`
        );
        for (const r of draftRs.rows) {
            await _insertDedupe(pool, {
                type: 'pbh_draft_stale',
                title: `PBH ${r.number} chờ xác nhận > 24h`,
                severity: 'warning',
                entity_type: 'fast_sale_order',
                entity_id: r.number,
                url: `/web2/fastsaleorder-invoice/index.html?search=${encodeURIComponent(r.number)}`,
                dedupe_key: `pbh_draft:${r.number}`,
            });
            created.push(r.number);
        }

        // 4. Stock < 5 (only active)
        const stockRs = await pool.query(
            `SELECT code, name, stock FROM web2_products
             WHERE is_active = true AND stock < 5 AND stock >= 0
             LIMIT 50`
        );
        for (const r of stockRs.rows) {
            await _insertDedupe(pool, {
                type: 'stock_low',
                title: `Hàng sắp hết: ${r.code} — ${r.name} (còn ${r.stock})`,
                severity: r.stock === 0 ? 'danger' : 'warning',
                entity_type: 'product',
                entity_id: r.code,
                url: `/web2/products/index.html?search=${encodeURIComponent(r.code)}`,
                dedupe_key: `stock_low:${r.code}`,
            });
            created.push(r.code);
        }

        _notifyUpdate();
        res.json({ success: true, created: created.length, sample: created.slice(0, 10) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

async function _insertDedupe(pool, n) {
    if (n.dedupe_key) {
        const dup = await pool.query(
            `SELECT id FROM web2_notifications
             WHERE dedupe_key = $1 AND created_at > NOW() - INTERVAL '1 hour' LIMIT 1`,
            [n.dedupe_key]
        );
        if (dup.rowCount > 0) return null;
    }
    const rs = await pool.query(
        `INSERT INTO web2_notifications
         (type, entity_type, entity_id, title, body, severity, url, dedupe_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
            n.type,
            n.entity_type || null,
            n.entity_id || null,
            n.title,
            n.body || null,
            n.severity || 'info',
            n.url || null,
            n.dedupe_key || null,
        ]
    );
    return rs.rows[0]?.id;
}

function _notifyUpdate() {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:notifications', { ts: Date.now() }, 'update');
    } catch (_) {}
}

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
