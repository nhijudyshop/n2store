// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// NATIVE ORDERS REST API
// Web-native order creation, ISOLATED from TPOS SaleOnline_Order
// and from social_orders (which belongs to don-inbox).
//
// Used by tpos-pancake "Tạo đơn" button (replaces TPOS flow).
// Orders are marked with source='NATIVE_WEB' so they can be
// distinguished from TPOS orders in any downstream report.
// =====================================================

const express = require('express');
const router = express.Router();

// -----------------------------------------------------
// Auto-create table on first request
// -----------------------------------------------------
let _tablesCreated = false;
async function ensureTables(pool) {
    if (_tablesCreated) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS native_orders (
                id              BIGSERIAL PRIMARY KEY,
                code            VARCHAR(40)  UNIQUE NOT NULL,
                session_index   INTEGER,
                source          VARCHAR(30)  NOT NULL DEFAULT 'NATIVE_WEB',

                customer_name   VARCHAR(255),
                phone           VARCHAR(40),
                address         TEXT,
                note            TEXT,

                fb_user_id      VARCHAR(100),
                fb_user_name    VARCHAR(255),
                fb_page_id      VARCHAR(100),
                fb_post_id      VARCHAR(100),
                fb_comment_id   VARCHAR(100),
                crm_team_id     INTEGER,

                products        JSONB  DEFAULT '[]'::jsonb,
                total_quantity  INTEGER DEFAULT 0,
                total_amount    NUMERIC(14,2) DEFAULT 0,

                status          VARCHAR(20) NOT NULL DEFAULT 'draft',
                tags            JSONB  DEFAULT '[]'::jsonb,

                created_by      VARCHAR(100),
                created_by_name VARCHAR(255),
                created_at      BIGINT NOT NULL,
                updated_at      BIGINT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_native_orders_created_at
                ON native_orders(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_native_orders_fb_user_id
                ON native_orders(fb_user_id);
            CREATE INDEX IF NOT EXISTS idx_native_orders_fb_post_id
                ON native_orders(fb_post_id);
            CREATE INDEX IF NOT EXISTS idx_native_orders_status
                ON native_orders(status);
            CREATE INDEX IF NOT EXISTS idx_native_orders_phone
                ON native_orders(phone);
            CREATE UNIQUE INDEX IF NOT EXISTS uq_native_orders_comment
                ON native_orders(fb_comment_id)
                WHERE fb_comment_id IS NOT NULL;
        `);
        _tablesCreated = true;
        console.log('[NATIVE-ORDERS] Tables created/verified');
    } catch (error) {
        console.error('[NATIVE-ORDERS] Table creation error:', error.message);
    }
}

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
function mapRowToOrder(row) {
    if (!row) return null;
    return {
        id: row.id,
        code: row.code,
        sessionIndex: row.session_index,
        source: row.source,
        customerName: row.customer_name,
        phone: row.phone,
        address: row.address,
        note: row.note,
        fbUserId: row.fb_user_id,
        fbUserName: row.fb_user_name,
        fbPageId: row.fb_page_id,
        fbPostId: row.fb_post_id,
        fbCommentId: row.fb_comment_id,
        crmTeamId: row.crm_team_id,
        products: row.products || [],
        totalQuantity: row.total_quantity,
        totalAmount: Number(row.total_amount || 0),
        status: row.status,
        tags: row.tags || [],
        createdBy: row.created_by,
        createdByName: row.created_by_name,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

function pad(n, width) {
    const s = String(n);
    return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

async function nextDailyCode(pool) {
    // NW-YYYYMMDD-XXXX (VN timezone)
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 3600 * 1000);
    const datePart = `${vn.getUTCFullYear()}${pad(vn.getUTCMonth() + 1, 2)}${pad(vn.getUTCDate(), 2)}`;
    const prefix = `NW-${datePart}-`;

    const r = await pool.query(
        `SELECT code FROM native_orders
         WHERE code LIKE $1
         ORDER BY code DESC
         LIMIT 1`,
        [prefix + '%']
    );
    let seq = 1;
    if (r.rows.length > 0) {
        const last = r.rows[0].code;
        const m = last.match(/-(\d+)$/);
        if (m) seq = parseInt(m[1], 10) + 1;
    }
    return prefix + pad(seq, 4);
}

async function nextSessionIndex(pool, fbUserId) {
    if (!fbUserId) return 1;
    const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM native_orders WHERE fb_user_id = $1`,
        [fbUserId]
    );
    return (r.rows[0]?.n || 0) + 1;
}

// -----------------------------------------------------
// GET /api/native-orders/health
// -----------------------------------------------------
router.get('/health', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ ok: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT COUNT(*)::int AS n FROM native_orders');
        res.json({ ok: true, count: r.rows[0].n });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/native-orders/from-comment
// Body:
//  { fbUserId, fbUserName, fbPageId, fbPostId, fbCommentId,
//    crmTeamId, message?, phone?, address?, note?,
//    createdBy?, createdByName? }
// -----------------------------------------------------
router.post('/from-comment', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        if (!b.fbUserId) {
            return res.status(400).json({ error: 'fbUserId required' });
        }

        // Idempotency: if same comment already has an order, return it
        if (b.fbCommentId) {
            const existing = await pool.query(
                `SELECT * FROM native_orders WHERE fb_comment_id = $1 LIMIT 1`,
                [b.fbCommentId]
            );
            if (existing.rows.length > 0) {
                return res.json({
                    success: true,
                    order: mapRowToOrder(existing.rows[0]),
                    idempotent: true,
                });
            }
        }

        const now = Date.now();
        const code = await nextDailyCode(pool);
        const sessionIndex = await nextSessionIndex(pool, b.fbUserId);

        const note = b.note || (b.message ? String(b.message).slice(0, 500) : null);

        const insert = await pool.query(
            `INSERT INTO native_orders (
                code, session_index, source,
                customer_name, phone, address, note,
                fb_user_id, fb_user_name, fb_page_id, fb_post_id, fb_comment_id, crm_team_id,
                products, total_quantity, total_amount,
                status, tags,
                created_by, created_by_name, created_at, updated_at
            ) VALUES (
                $1, $2, 'NATIVE_WEB',
                $3, $4, $5, $6,
                $7, $8, $9, $10, $11, $12,
                '[]'::jsonb, 0, 0,
                'draft', '[]'::jsonb,
                $13, $14, $15, $15
            ) RETURNING *`,
            [
                code,
                sessionIndex,
                b.customerName || b.fbUserName || null,
                b.phone || null,
                b.address || null,
                note,
                b.fbUserId,
                b.fbUserName || null,
                b.fbPageId || null,
                b.fbPostId || null,
                b.fbCommentId || null,
                b.crmTeamId ? parseInt(b.crmTeamId, 10) : null,
                b.createdBy || null,
                b.createdByName || null,
                now,
            ]
        );

        res.json({ success: true, order: mapRowToOrder(insert.rows[0]) });
    } catch (error) {
        console.error('[NATIVE-ORDERS] POST /from-comment error:', error);
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------
// GET /api/native-orders/by-user/:fbUserId — latest order
// -----------------------------------------------------
router.get('/by-user/:fbUserId', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `SELECT * FROM native_orders
             WHERE fb_user_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [req.params.fbUserId]
        );
        if (r.rows.length === 0) return res.json({ success: true, order: null });
        res.json({ success: true, order: mapRowToOrder(r.rows[0]) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------
// GET /api/native-orders/load — list with filters
// -----------------------------------------------------
router.get('/load', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const { status, page = 1, limit = 200, search, fbPostId } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        const conds = [];
        const params = [];
        if (status && status !== 'all') {
            params.push(status);
            conds.push(`status = $${params.length}`);
        }
        if (fbPostId) {
            params.push(fbPostId);
            conds.push(`fb_post_id = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(`(customer_name ILIKE $${i} OR phone ILIKE $${i} OR code ILIKE $${i} OR note ILIKE $${i})`);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

        const countR = await pool.query(`SELECT COUNT(*)::int AS n FROM native_orders ${where}`, params);
        const total = countR.rows[0].n;

        const listParams = [...params, limitNum, offset];
        const listR = await pool.query(
            `SELECT * FROM native_orders ${where}
             ORDER BY created_at DESC
             LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
            listParams
        );

        res.json({
            success: true,
            orders: listR.rows.map(mapRowToOrder),
            total,
            page: pageNum,
            limit: limitNum,
            hasMore: offset + listR.rows.length < total,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------
// PATCH /api/native-orders/:code — update mutable fields
// -----------------------------------------------------
router.patch('/:code', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const body = { ...req.body };

        // If client sends `products`, auto-recompute total_quantity + total_amount
        // (prevents mismatch between list + totals). Client MAY still override by
        // sending totalQuantity/totalAmount explicitly — respected below.
        if (Array.isArray(body.products)) {
            if (body.totalQuantity === undefined) {
                body.totalQuantity = body.products.reduce(
                    (s, p) => s + (Number(p.quantity) || 0), 0
                );
            }
            if (body.totalAmount === undefined) {
                body.totalAmount = body.products.reduce(
                    (s, p) => s + (Number(p.quantity) || 0) * (Number(p.price) || 0), 0
                );
            }
        }

        const allowed = {
            customerName: 'customer_name',
            phone: 'phone',
            address: 'address',
            note: 'note',
            products: 'products',
            totalQuantity: 'total_quantity',
            totalAmount: 'total_amount',
            status: 'status',
            tags: 'tags',
        };
        const sets = [];
        const params = [];
        for (const [k, col] of Object.entries(allowed)) {
            if (body[k] === undefined) continue;
            params.push(k === 'products' || k === 'tags' ? JSON.stringify(body[k]) : body[k]);
            sets.push(`${col} = $${params.length}`);
        }
        if (sets.length === 0) return res.status(400).json({ error: 'No update fields' });
        params.push(Date.now());
        sets.push(`updated_at = $${params.length}`);
        params.push(req.params.code);

        const r = await pool.query(
            `UPDATE native_orders SET ${sets.join(', ')}
             WHERE code = $${params.length}
             RETURNING *`,
            params
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, order: mapRowToOrder(r.rows[0]) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------
// DELETE /api/native-orders/:code — hard delete
// -----------------------------------------------------
router.delete('/:code', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `DELETE FROM native_orders WHERE code = $1 RETURNING code`,
            [req.params.code]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
