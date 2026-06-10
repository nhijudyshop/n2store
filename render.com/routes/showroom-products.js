// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// SHOWROOM PRODUCTS REST API  (Web 1.0 — pool chatDb)
// Curated showroom catalog for /showroom1/ — admin panel adds/removes products.
// Storage: Postgres (chatDb). Images: BYTEA in showroom_product_images (like
// purchase_order_images). Realtime: Web 1.0 SSE hub, topic 'showroom_products'.
// Mounted at /api/showroom-products (see server.js).
// =====================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');

const MAX_NAME_LEN = 200;
const MAX_BADGE_LEN = 60;
const MAX_CATEGORY_LEN = 40;
const MAX_IMAGES = 8;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const SSE_KEY = 'showroom_products';
const BASE_URL = 'https://n2store-fallback.onrender.com';

// ----- SSE notifier (injected from server.js) -----
let notifyClients = null;
function initializeNotifiers(notify) {
    notifyClients = notify;
    console.log('[SHOWROOM-PRODUCTS] SSE notifier initialized');
}
function broadcast(action, payload) {
    if (typeof notifyClients !== 'function') return;
    try {
        notifyClients(SSE_KEY, { action, ...payload, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[SHOWROOM-PRODUCTS] broadcast failed:', e.message);
    }
}

// ----- Lazy schema (idempotent, runs on first request — survives fresh deploy) -----
let _tablesReady = false;
async function ensureTables(pool) {
    if (_tablesReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS showroom_product_images (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            data BYTEA NOT NULL,
            content_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
            filename VARCHAR(255),
            size_bytes INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS showroom_products (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            name TEXT NOT NULL,
            price BIGINT NOT NULL DEFAULT 0,
            sale_price BIGINT,
            category VARCHAR(40) NOT NULL DEFAULT 'phukien',
            badge VARCHAR(60),
            image_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            colors JSONB NOT NULL DEFAULT '[]'::jsonb,
            sizes JSONB NOT NULL DEFAULT '[]'::jsonb,
            sort_order INTEGER NOT NULL DEFAULT 0,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by VARCHAR(128),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE showroom_products ADD COLUMN IF NOT EXISTS colors JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE showroom_products ADD COLUMN IF NOT EXISTS sizes JSONB NOT NULL DEFAULT '[]'::jsonb;
        CREATE INDEX IF NOT EXISTS idx_showroom_products_sort
            ON showroom_products(active, sort_order ASC, created_at DESC);
    `);
    _tablesReady = true;
}

function getDb(req) {
    return req.app.locals.chatDb;
}

// ----- helpers -----
function sanitizeString(v, maxLen) {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    if (!t || t.length > maxLen) return null;
    return t;
}
function toIntOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : null;
}
function normalizeImageIds(v) {
    if (!Array.isArray(v)) return [];
    return v
        .filter((x) => typeof x === 'string' && x.length && x.length <= 64)
        .slice(0, MAX_IMAGES);
}
function normalizeStrList(v, maxLen, max) {
    if (!Array.isArray(v)) return [];
    const seen = new Set();
    const out = [];
    for (const x of v) {
        if (typeof x !== 'string') continue;
        const t = x.trim();
        if (!t || t.length > maxLen) continue;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(t);
        if (out.length >= max) break;
    }
    return out;
}
function rowToProduct(r) {
    return {
        id: r.id,
        name: r.name,
        price: Number(r.price),
        salePrice: r.sale_price === null ? null : Number(r.sale_price),
        category: r.category,
        badge: r.badge,
        imageIds: Array.isArray(r.image_ids) ? r.image_ids : [],
        colors: Array.isArray(r.colors) ? r.colors : [],
        sizes: Array.isArray(r.sizes) ? r.sizes : [],
        sortOrder: r.sort_order,
        active: r.active,
        createdBy: r.created_by,
        createdAt: r.created_at ? r.created_at.getTime() : null,
        updatedAt: r.updated_at ? r.updated_at.getTime() : null,
    };
}

const PRODUCT_COLS =
    'id, name, price, sale_price, category, badge, image_ids, colors, sizes, sort_order, active, created_by, created_at, updated_at';
const MAX_COLOR_LEN = 40;
const MAX_SIZE_LEN = 12;
const MAX_VARIANTS = 30;

// =====================================================
// PRODUCTS
// =====================================================

// GET /  — list products. ?all=1 includes inactive (admin view).
router.get('/', async (req, res) => {
    try {
        const pool = getDb(req);
        if (!pool) return res.status(500).json({ success: false, error: 'Database not available' });
        await ensureTables(pool);

        const includeInactive = req.query.all === '1' || req.query.all === 'true';
        const where = includeInactive ? '' : 'WHERE active = TRUE';
        const result = await pool.query(
            `SELECT ${PRODUCT_COLS} FROM showroom_products
             ${where}
             ORDER BY sort_order ASC, created_at DESC`
        );
        res.json({ success: true, products: result.rows.map(rowToProduct) });
    } catch (error) {
        console.error('[SHOWROOM-PRODUCTS] GET / error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /  — create product.
router.post('/', async (req, res) => {
    try {
        const pool = getDb(req);
        if (!pool) return res.status(500).json({ success: false, error: 'Database not available' });
        await ensureTables(pool);

        const name = sanitizeString(req.body?.name, MAX_NAME_LEN);
        if (!name) return res.status(400).json({ success: false, error: 'name required (1-200 chars)' });

        const price = toIntOrNull(req.body?.price) ?? 0;
        const salePrice = toIntOrNull(req.body?.salePrice);
        const category = sanitizeString(req.body?.category, MAX_CATEGORY_LEN) || 'phukien';
        const badge = sanitizeString(req.body?.badge, MAX_BADGE_LEN);
        const imageIds = normalizeImageIds(req.body?.imageIds);
        const colors = normalizeStrList(req.body?.colors, MAX_COLOR_LEN, MAX_VARIANTS);
        const sizes = normalizeStrList(req.body?.sizes, MAX_SIZE_LEN, MAX_VARIANTS);
        const sortOrder = toIntOrNull(req.body?.sortOrder) ?? 0;
        const createdBy = sanitizeString(req.body?.createdBy, 128);

        const result = await pool.query(
            `INSERT INTO showroom_products
                (name, price, sale_price, category, badge, image_ids, colors, sizes, sort_order, created_by)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)
             RETURNING ${PRODUCT_COLS}`,
            [name, price, salePrice, category, badge, JSON.stringify(imageIds),
             JSON.stringify(colors), JSON.stringify(sizes), sortOrder, createdBy]
        );
        const product = rowToProduct(result.rows[0]);
        broadcast('created', { id: product.id });
        res.json({ success: true, product });
    } catch (error) {
        console.error('[SHOWROOM-PRODUCTS] POST / error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /:id — update product (partial; only provided fields change).
router.put('/:id', async (req, res) => {
    try {
        const pool = getDb(req);
        if (!pool) return res.status(500).json({ success: false, error: 'Database not available' });
        await ensureTables(pool);

        const sets = [];
        const vals = [];
        let i = 1;
        const b = req.body || {};

        if (b.name !== undefined) {
            const name = sanitizeString(b.name, MAX_NAME_LEN);
            if (!name) return res.status(400).json({ success: false, error: 'name invalid (1-200 chars)' });
            sets.push(`name = $${i++}`); vals.push(name);
        }
        if (b.price !== undefined) { sets.push(`price = $${i++}`); vals.push(toIntOrNull(b.price) ?? 0); }
        if (b.salePrice !== undefined) { sets.push(`sale_price = $${i++}`); vals.push(toIntOrNull(b.salePrice)); }
        if (b.category !== undefined) { sets.push(`category = $${i++}`); vals.push(sanitizeString(b.category, MAX_CATEGORY_LEN) || 'phukien'); }
        if (b.badge !== undefined) { sets.push(`badge = $${i++}`); vals.push(sanitizeString(b.badge, MAX_BADGE_LEN)); }
        if (b.imageIds !== undefined) { sets.push(`image_ids = $${i++}::jsonb`); vals.push(JSON.stringify(normalizeImageIds(b.imageIds))); }
        if (b.colors !== undefined) { sets.push(`colors = $${i++}::jsonb`); vals.push(JSON.stringify(normalizeStrList(b.colors, MAX_COLOR_LEN, MAX_VARIANTS))); }
        if (b.sizes !== undefined) { sets.push(`sizes = $${i++}::jsonb`); vals.push(JSON.stringify(normalizeStrList(b.sizes, MAX_SIZE_LEN, MAX_VARIANTS))); }
        if (b.sortOrder !== undefined) { sets.push(`sort_order = $${i++}`); vals.push(toIntOrNull(b.sortOrder) ?? 0); }
        if (b.active !== undefined) { sets.push(`active = $${i++}`); vals.push(!!b.active); }

        if (!sets.length) return res.status(400).json({ success: false, error: 'no fields to update' });
        sets.push(`updated_at = NOW()`);
        vals.push(req.params.id);

        const result = await pool.query(
            `UPDATE showroom_products SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${PRODUCT_COLS}`,
            vals
        );
        if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'product not found' });

        const product = rowToProduct(result.rows[0]);
        broadcast('updated', { id: product.id });
        res.json({ success: true, product });
    } catch (error) {
        console.error('[SHOWROOM-PRODUCTS] PUT /:id error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /:id — remove product (and its images).
router.delete('/:id', async (req, res) => {
    try {
        const pool = getDb(req);
        if (!pool) return res.status(500).json({ success: false, error: 'Database not available' });
        await ensureTables(pool);

        const result = await pool.query(
            `DELETE FROM showroom_products WHERE id = $1 RETURNING id, image_ids`,
            [req.params.id]
        );
        if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'product not found' });

        const imageIds = Array.isArray(result.rows[0].image_ids) ? result.rows[0].image_ids : [];
        if (imageIds.length) {
            await pool.query('DELETE FROM showroom_product_images WHERE id = ANY($1)', [imageIds]);
        }
        broadcast('deleted', { id: result.rows[0].id });
        res.json({ success: true });
    } catch (error) {
        console.error('[SHOWROOM-PRODUCTS] DELETE /:id error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /reorder — body { order: [id1, id2, ...] } → sets sort_order by array index.
router.post('/reorder', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'Database not available' });
    const order = Array.isArray(req.body?.order) ? req.body.order : null;
    if (!order) return res.status(400).json({ success: false, error: 'order array required' });

    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        for (let idx = 0; idx < order.length; idx++) {
            const id = order[idx];
            if (typeof id !== 'string') continue;
            await client.query('UPDATE showroom_products SET sort_order = $1, updated_at = NOW() WHERE id = $2', [idx, id]);
        }
        await client.query('COMMIT');
        broadcast('reordered', { count: order.length });
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[SHOWROOM-PRODUCTS] POST /reorder error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// =====================================================
// IMAGES  (BYTEA — same pattern as purchase_order_images)
// =====================================================
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
        else cb(new Error(`Loại file không hợp lệ: ${file.mimetype}. Chỉ JPEG, PNG, WebP, GIF.`));
    },
});

// POST /images — upload (multipart field name "image").
router.post(
    '/images',
    (req, res, next) => {
        upload.single('image')(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(413).json({ success: false, error: `File quá lớn. Tối đa ${MAX_FILE_SIZE / 1024 / 1024}MB.` });
                }
                return res.status(400).json({ success: false, error: err.message });
            }
            if (err) return res.status(400).json({ success: false, error: err.message });
            next();
        });
    },
    async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ success: false, error: 'Không có file. Dùng field name "image".' });
            const pool = getDb(req);
            await ensureTables(pool);
            const { buffer, mimetype, originalname, size } = req.file;
            const result = await pool.query(
                `INSERT INTO showroom_product_images (data, content_type, filename, size_bytes)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, content_type, filename, size_bytes, created_at`,
                [buffer, mimetype, originalname || null, size || buffer.length]
            );
            const row = result.rows[0];
            res.json({
                success: true,
                id: row.id,
                url: `${BASE_URL}/api/showroom-products/images/${row.id}`,
                image: { id: row.id, contentType: row.content_type, filename: row.filename, sizeBytes: row.size_bytes },
            });
        } catch (error) {
            console.error('[SHOWROOM-PRODUCTS] image upload error:', error);
            res.status(500).json({ success: false, error: 'Không thể upload ảnh: ' + (error.message || 'lỗi') });
        }
    }
);

// GET /images/:id — serve binary.
router.get('/images/:id', async (req, res) => {
    try {
        const pool = getDb(req);
        await ensureTables(pool);
        const result = await pool.query(
            'SELECT data, content_type, filename FROM showroom_product_images WHERE id = $1',
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Ảnh không tồn tại' });
        const { data, content_type, filename } = result.rows[0];
        res.setHeader('Content-Type', content_type);
        res.setHeader('Content-Length', data.length);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        if (filename) res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.send(data);
    } catch (error) {
        console.error('[SHOWROOM-PRODUCTS] image serve error:', error);
        res.status(500).json({ success: false, error: 'Không thể tải ảnh' });
    }
});

// DELETE /images/:id — remove a stray uploaded image (not yet attached).
router.delete('/images/:id', async (req, res) => {
    try {
        const pool = getDb(req);
        await ensureTables(pool);
        const result = await pool.query(
            'DELETE FROM showroom_product_images WHERE id = $1 RETURNING id',
            [req.params.id]
        );
        if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Ảnh không tồn tại' });
        res.json({ success: true });
    } catch (error) {
        console.error('[SHOWROOM-PRODUCTS] image delete error:', error);
        res.status(500).json({ success: false, error: 'Không thể xóa ảnh' });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
