// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// WEB 2.0 PRODUCTS REST API
// Kho sản phẩm riêng cho native_orders flow, tách biệt hoàn toàn với
// TPOS Product + Excel cache của orders-report.
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
            CREATE TABLE IF NOT EXISTS web2_products (
                id          BIGSERIAL PRIMARY KEY,
                code        VARCHAR(40)  UNIQUE NOT NULL,
                name        VARCHAR(255) NOT NULL,
                price       NUMERIC(14,2) NOT NULL DEFAULT 0,
                image_url   TEXT,
                stock       INTEGER NOT NULL DEFAULT 0,
                note        TEXT,
                tags        JSONB NOT NULL DEFAULT '[]'::jsonb,
                is_active   BOOLEAN NOT NULL DEFAULT true,
                created_by  VARCHAR(100),
                created_at  BIGINT NOT NULL,
                updated_at  BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_web2_products_code    ON web2_products(code);
            CREATE INDEX IF NOT EXISTS idx_web2_products_name    ON web2_products(name);
            CREATE INDEX IF NOT EXISTS idx_web2_products_active  ON web2_products(is_active);
            CREATE INDEX IF NOT EXISTS idx_web2_products_created ON web2_products(created_at DESC);
        `);
        _tablesCreated = true;
        console.log('[WEB2-PRODUCTS] Tables created/verified');
    } catch (error) {
        console.error('[WEB2-PRODUCTS] Table creation error:', error.message);
    }
}

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
function mapRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        code: row.code,
        name: row.name,
        price: Number(row.price || 0),
        imageUrl: row.image_url,
        stock: row.stock,
        note: row.note,
        tags: row.tags || [],
        isActive: !!row.is_active,
        createdBy: row.created_by,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

// -----------------------------------------------------
// GET /api/web2-products/health
// -----------------------------------------------------
router.get('/health', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ ok: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT COUNT(*)::int AS n FROM web2_products');
        res.json({ ok: true, count: r.rows[0].n });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// -----------------------------------------------------
// GET /api/web2-products/list?search&activeOnly&page&limit
// Cho cả UI quản lý kho + UI picker khi tạo đơn
// -----------------------------------------------------
router.get('/list', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const { search, activeOnly, page = 1, limit = 200 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10)));
        const offset = (pageNum - 1) * limitNum;

        const conds = [];
        const params = [];
        if (activeOnly === 'true' || activeOnly === '1') {
            conds.push('is_active = true');
        }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(`(code ILIKE $${i} OR name ILIKE $${i})`);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

        const countR = await pool.query(
            `SELECT COUNT(*)::int AS n FROM web2_products ${where}`, params
        );
        const total = countR.rows[0].n;

        const listParams = [...params, limitNum, offset];
        const listR = await pool.query(
            `SELECT * FROM web2_products ${where}
             ORDER BY is_active DESC, updated_at DESC
             LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
            listParams
        );

        res.json({
            success: true,
            products: listR.rows.map(mapRow),
            total,
            page: pageNum,
            limit: limitNum,
            hasMore: offset + listR.rows.length < total,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /api/web2-products/:code
// -----------------------------------------------------
router.get('/:code', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `SELECT * FROM web2_products WHERE code = $1 LIMIT 1`, [req.params.code]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, product: mapRow(r.rows[0]) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/web2-products — create
// Body: { code, name, price?, imageUrl?, stock?, note?, tags?, createdBy? }
// -----------------------------------------------------
router.post('/', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        if (!b.code || !b.name) {
            return res.status(400).json({ error: 'code + name required' });
        }
        const now = Date.now();
        try {
            const r = await pool.query(
                `INSERT INTO web2_products
                 (code, name, price, image_url, stock, note, tags, is_active, created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $9)
                 RETURNING *`,
                [
                    b.code.trim(),
                    b.name.trim(),
                    Number(b.price) || 0,
                    b.imageUrl || null,
                    Number.isFinite(Number(b.stock)) ? Number(b.stock) : 0,
                    b.note || null,
                    JSON.stringify(Array.isArray(b.tags) ? b.tags : []),
                    b.createdBy || null,
                    now,
                ]
            );
            res.json({ success: true, product: mapRow(r.rows[0]) });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ error: `Mã SP "${b.code}" đã tồn tại` });
            }
            throw err;
        }
    } catch (e) {
        console.error('[WEB2-PRODUCTS] POST / error:', e);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// PATCH /api/web2-products/:code — update mutable fields
// -----------------------------------------------------
router.patch('/:code', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const allowed = {
            name: 'name',
            price: 'price',
            imageUrl: 'image_url',
            stock: 'stock',
            note: 'note',
            tags: 'tags',
            isActive: 'is_active',
        };
        const sets = [];
        const params = [];
        for (const [k, col] of Object.entries(allowed)) {
            if (req.body[k] === undefined) continue;
            params.push(k === 'tags' ? JSON.stringify(req.body[k]) : req.body[k]);
            sets.push(`${col} = $${params.length}`);
        }
        if (!sets.length) return res.status(400).json({ error: 'No update fields' });
        params.push(Date.now());
        sets.push(`updated_at = $${params.length}`);
        params.push(req.params.code);

        const r = await pool.query(
            `UPDATE web2_products SET ${sets.join(', ')}
             WHERE code = $${params.length}
             RETURNING *`,
            params
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, product: mapRow(r.rows[0]) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// DELETE /api/web2-products/:code — hard delete
// -----------------------------------------------------
router.delete('/:code', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `DELETE FROM web2_products WHERE code = $1 RETURNING code`,
            [req.params.code]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
