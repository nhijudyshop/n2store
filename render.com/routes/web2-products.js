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

            -- Migration 067: extend with original_price, barcode, category
            ALTER TABLE web2_products
                ADD COLUMN IF NOT EXISTS original_price NUMERIC(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS barcode        VARCHAR(60),
                ADD COLUMN IF NOT EXISTS category       VARCHAR(80);

            CREATE INDEX IF NOT EXISTS idx_web2_products_barcode  ON web2_products(barcode);
            CREATE INDEX IF NOT EXISTS idx_web2_products_category ON web2_products(category);

            -- Migration 068: dedicated variant column (size/color/spec). Trước đó
            -- variant đi ké vào note ở so-order; tách riêng để Kho SP hiển thị
            -- cột BIẾN THỂ độc lập với ghi chú.
            ALTER TABLE web2_products
                ADD COLUMN IF NOT EXISTS variant TEXT;

            -- Migration 069: status (CHO_MUA | DANG_BAN) + pending_qty.
            -- so-order Lưu Nháp → tạo SP với status='CHO_MUA' và pending_qty=qty.
            -- Khi nhấn "Mua hàng" cho NCC → status='DANG_BAN', stock += pending_qty,
            -- pending_qty = 0.
            ALTER TABLE web2_products
                ADD COLUMN IF NOT EXISTS status       VARCHAR(20) DEFAULT 'DANG_BAN',
                ADD COLUMN IF NOT EXISTS pending_qty  INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS supplier     VARCHAR(255);

            CREATE INDEX IF NOT EXISTS idx_web2_products_status   ON web2_products(status);
            CREATE INDEX IF NOT EXISTS idx_web2_products_supplier ON web2_products(supplier);
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
        // Migration 067
        originalPrice: Number(row.original_price || 0),
        barcode: row.barcode,
        category: row.category,
        // Migration 068
        variant: row.variant || null,
        // Migration 069: purchase pipeline status
        status: row.status || 'DANG_BAN',
        pendingQty: Number(row.pending_qty) || 0,
        supplier: row.supplier || null,
    };
}

// -----------------------------------------------------
// GET /api/web2/products/health
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
// GET /api/web2/products/list?search&activeOnly&page&limit
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
            `SELECT COUNT(*)::int AS n FROM web2_products ${where}`,
            params
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

// =====================================================
// GET /api/web2-products/pending?supplier=X
// List CHỜ MUA items, optional filter by supplier.
// NOTE: phải đặt trước /:code để không bị Express route catch /pending → code='pending'.
// =====================================================
router.get('/pending', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const supplier = req.query.supplier ? String(req.query.supplier).trim() : null;
        let sql = `SELECT * FROM web2_products WHERE status = 'CHO_MUA' AND pending_qty > 0`;
        const params = [];
        if (supplier) {
            params.push(supplier);
            sql += ` AND supplier = $${params.length}`;
        }
        sql += ` ORDER BY supplier, name`;
        const r = await pool.query(sql, params);
        res.json({ success: true, items: r.rows.map(mapRow) });
    } catch (e) {
        console.error('[WEB2-PRODUCTS] pending list error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /api/web2/products/:code
// -----------------------------------------------------
router.get('/:code', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(`SELECT * FROM web2_products WHERE code = $1 LIMIT 1`, [
            req.params.code,
        ]);
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
                 (code, name, price, image_url, stock, note, tags, is_active,
                  original_price, barcode, category, variant,
                  created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, true,
                         $8, $9, $10, $11,
                         $12, $13, $13)
                 RETURNING *`,
                [
                    b.code.trim(),
                    b.name.trim(),
                    Number(b.price) || 0,
                    b.imageUrl || null,
                    Number.isFinite(Number(b.stock)) ? Number(b.stock) : 0,
                    b.note || null,
                    JSON.stringify(Array.isArray(b.tags) ? b.tags : []),
                    Number(b.originalPrice) || 0,
                    b.barcode ? b.barcode.trim() : null,
                    b.category ? b.category.trim() : null,
                    b.variant ? String(b.variant).trim() : null,
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
// PATCH /api/web2/products/:code — update mutable fields
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
            // Migration 067
            originalPrice: 'original_price',
            barcode: 'barcode',
            category: 'category',
            // Migration 068
            variant: 'variant',
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
// POST /api/web2/products/adjust-stock
// Body: { adjustments: [{ code, delta, reason }] }
//   - delta > 0: nhập kho (mua từ NCC, KH trả về)
//   - delta < 0: xuất kho (bán PBH, trả NCC)
// Atomic in a single transaction. Returns updated stocks.
// Stock không bao giờ âm — clamp về 0 nếu tổng < 0 (warn).
// -----------------------------------------------------
router.post('/adjust-stock', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const adjustments = Array.isArray(req.body?.adjustments) ? req.body.adjustments : null;
    if (!adjustments || !adjustments.length) {
        return res.status(400).json({ error: 'adjustments array required' });
    }
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        const results = [];
        const warnings = [];
        for (const adj of adjustments) {
            const code = String(adj.code || '').trim();
            const delta = Number(adj.delta) || 0;
            if (!code || !Number.isFinite(delta) || delta === 0) continue;
            // GREATEST clamps negative result to 0
            const r = await client.query(
                `UPDATE web2_products
                 SET stock = GREATEST(0, stock + $1), updated_at = $2
                 WHERE code = $3
                 RETURNING code, stock`,
                [delta, Date.now(), code]
            );
            if (!r.rows.length) {
                warnings.push(`Code "${code}" not found, skipped`);
                continue;
            }
            results.push({ code: r.rows[0].code, stock: r.rows[0].stock, delta });
        }
        await client.query('COMMIT');
        res.json({ success: true, results, warnings });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// -----------------------------------------------------
// DELETE /api/web2/products/:code
// Query: ?force=1 để bỏ qua check pending_qty > 0.
// Trả 409 nếu pending_qty > 0 và không force (để caller cảnh báo user).
// -----------------------------------------------------
router.delete('/:code', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const force = req.query.force === '1' || req.query.force === 'true';
        const r0 = await pool.query(
            `SELECT code, name, pending_qty, supplier, stock FROM web2_products WHERE code = $1`,
            [req.params.code]
        );
        if (!r0.rows.length) return res.status(404).json({ error: 'Not found' });
        const cur = r0.rows[0];
        const curPending = Number(cur.pending_qty) || 0;
        if (curPending > 0 && !force) {
            return res.status(409).json({
                error: 'pending_qty_not_zero',
                code: cur.code,
                name: cur.name,
                pendingQty: curPending,
                stock: Number(cur.stock) || 0,
                supplier: cur.supplier,
                message: `SP còn ${curPending} cái chờ mua${cur.supplier ? ' từ ' + cur.supplier : ''}. Xóa sẽ mất số liệu này.`,
            });
        }
        await pool.query(`DELETE FROM web2_products WHERE code = $1`, [req.params.code]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// POST /api/web2-products/adjust-pending
// Body: { adjustments: [{ code?, name?, variant?, supplier?, delta }] }
//   - Match SP theo code (ưu tiên) hoặc name+variant.
//   - pending_qty = GREATEST(0, pending_qty + delta).
//   - delta < 0: giảm pending (user xóa/giảm qty row so-order).
//   - delta > 0: tăng pending (user tăng qty).
// Side effects:
//   - Nếu pending=0 AND stock=0 AND created_by='so-order' → DELETE SP (ghost cleanup).
//   - Nếu pending=0 AND stock>0 AND status='CHO_MUA' → SET status='DANG_BAN'.
// Atomic trong 1 transaction. Returns updated info per adjustment.
// =====================================================
router.post('/adjust-pending', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const adjustments = Array.isArray(req.body?.adjustments) ? req.body.adjustments : null;
    if (!adjustments || !adjustments.length) {
        return res.status(400).json({ error: 'adjustments array required' });
    }
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        const results = [];
        const warnings = [];
        for (const adj of adjustments) {
            const code = adj.code ? String(adj.code).trim() : null;
            const name = adj.name ? String(adj.name).trim() : null;
            const variant = adj.variant ? String(adj.variant).trim() : null;
            const delta = Number(adj.delta) || 0;
            if ((!code && !name) || !Number.isFinite(delta) || delta === 0) continue;

            let r;
            if (code) {
                r = await client.query(`SELECT * FROM web2_products WHERE code = $1 LIMIT 1`, [
                    code,
                ]);
            } else if (variant) {
                r = await client.query(
                    `SELECT * FROM web2_products
                     WHERE LOWER(name) = LOWER($1)
                       AND LOWER(COALESCE(variant, '')) = LOWER($2)
                     ORDER BY id LIMIT 1`,
                    [name, variant]
                );
            } else {
                r = await client.query(
                    `SELECT * FROM web2_products
                     WHERE LOWER(name) = LOWER($1)
                       AND (variant IS NULL OR variant = '')
                     ORDER BY id LIMIT 1`,
                    [name]
                );
            }
            if (!r.rows.length) {
                warnings.push(
                    `Không tìm thấy SP "${name || code}"${variant ? ' / ' + variant : ''}`
                );
                continue;
            }
            const row = r.rows[0];
            const curPending = Number(row.pending_qty) || 0;
            const curStock = Number(row.stock) || 0;
            const newPending = Math.max(0, curPending + delta);
            const now = Date.now();

            // Ghost cleanup: pending=0 + stock=0 + tạo từ so-order → DELETE.
            if (newPending === 0 && curStock === 0 && row.created_by === 'so-order') {
                await client.query(`DELETE FROM web2_products WHERE id = $1`, [row.id]);
                results.push({
                    code: row.code,
                    name: row.name,
                    action: 'deleted',
                    newPendingQty: 0,
                });
                continue;
            }
            // Pending về 0 mà còn stock → status DANG_BAN.
            const newStatus =
                newPending === 0 && curStock > 0 && row.status === 'CHO_MUA'
                    ? 'DANG_BAN'
                    : row.status;

            const u = await client.query(
                `UPDATE web2_products
                    SET pending_qty = $1, status = $2, updated_at = $3
                  WHERE id = $4
                  RETURNING code, name, pending_qty, status, stock`,
                [newPending, newStatus, now, row.id]
            );
            const ur = u.rows[0];
            results.push({
                code: ur.code,
                name: ur.name,
                action: 'updated',
                newPendingQty: Number(ur.pending_qty) || 0,
                status: ur.status,
                stock: Number(ur.stock) || 0,
            });
        }
        await client.query('COMMIT');
        res.json({ success: true, results, warnings });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-PRODUCTS] adjust-pending error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// =====================================================
// POST /api/web2-products/upsert-pending
// Body: { items: [{name, variant, qty, costPrice, sellPrice, supplier, imageUrl, note}] }
//
// Logic per item (so-order Lưu Nháp flow):
//   1. Tìm SP theo (name) — variant matching optional.
//   2. KHÔNG tìm thấy → INSERT mới
//        status='CHO_MUA', stock=0, pending_qty=qty, supplier=<supplier>
//   3. Tìm thấy:
//        - stock = 0 → SET status='CHO_MUA', pending_qty += qty
//        - stock > 0 → KEEP status, pending_qty += qty (giữ "đang bán" + có thêm "chờ mua")
//        - Update supplier nếu chưa có
// Returns: { success, created, updated, items: [{code, name, action, status, pendingQty, stock}] }
// =====================================================
router.post('/upsert-pending', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const items = Array.isArray((req.body || {}).items) ? req.body.items : [];
        if (!items.length) return res.json({ success: true, created: 0, updated: 0, items: [] });
        const now = Date.now();
        let created = 0,
            updated = 0;
        const results = [];
        for (const it of items) {
            const name = String(it.name || '').trim();
            const variant = it.variant ? String(it.variant).trim() : null;
            const qty = Math.max(0, Number(it.qty) || 0);
            const supplier = it.supplier ? String(it.supplier).trim() : null;
            if (!name || qty <= 0) continue;
            // Match: name + variant (variant nullable, NULL match NULL)
            const findSql = variant
                ? `SELECT * FROM web2_products WHERE LOWER(name) = LOWER($1) AND (variant IS NULL OR LOWER(variant) = LOWER($2)) ORDER BY id LIMIT 1`
                : `SELECT * FROM web2_products WHERE LOWER(name) = LOWER($1) ORDER BY id LIMIT 1`;
            const findParams = variant ? [name, variant] : [name];
            const existing = await pool.query(findSql, findParams);

            if (!existing.rows.length) {
                // INSERT new product with CHO_MUA status
                const code =
                    it.code ||
                    'KHO-' +
                        Math.random().toString(36).slice(2, 6).toUpperCase() +
                        '-' +
                        Date.now().toString(36).toUpperCase();
                try {
                    const r = await pool.query(
                        `INSERT INTO web2_products
                            (code, name, price, image_url, stock, note, tags, is_active,
                             original_price, barcode, category, variant,
                             status, pending_qty, supplier,
                             created_by, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, 0, $5, '[]'::jsonb, TRUE,
                                 $6, NULL, NULL, $7,
                                 'CHO_MUA', $8, $9,
                                 'so-order', $10, $10)
                         RETURNING *`,
                        [
                            code,
                            name,
                            Number(it.sellPrice) || 0,
                            it.imageUrl || null,
                            it.note || null,
                            Number(it.costPrice) || 0,
                            variant,
                            qty,
                            supplier,
                            now,
                        ]
                    );
                    const row = r.rows[0];
                    created++;
                    results.push({
                        code: row.code,
                        name: row.name,
                        action: 'created',
                        status: row.status,
                        pendingQty: row.pending_qty,
                        stock: row.stock,
                    });
                } catch (err) {
                    if (err.code === '23505') {
                        // Code collision (rare) — retry with new code
                        results.push({ name, action: 'error', error: 'Code collision' });
                    } else {
                        throw err;
                    }
                }
            } else {
                const row = existing.rows[0];
                const curStock = Number(row.stock) || 0;
                const curPending = Number(row.pending_qty) || 0;
                const newPending = curPending + qty;
                const newStatus = curStock === 0 ? 'CHO_MUA' : row.status;
                const newSupplier = row.supplier || supplier;
                const r2 = await pool.query(
                    `UPDATE web2_products
                       SET pending_qty = $1,
                           status      = $2,
                           supplier    = $3,
                           updated_at  = $4
                     WHERE code = $5
                     RETURNING *`,
                    [newPending, newStatus, newSupplier, now, row.code]
                );
                const updated_row = r2.rows[0];
                updated++;
                results.push({
                    code: updated_row.code,
                    name: updated_row.name,
                    action: 'updated',
                    status: updated_row.status,
                    pendingQty: updated_row.pending_qty,
                    stock: updated_row.stock,
                });
            }
        }
        res.json({ success: true, created, updated, items: results });
    } catch (e) {
        console.error('[WEB2-PRODUCTS] upsert-pending error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// POST /api/web2-products/confirm-purchase
// Body: { codes: [code1, code2, ...] }  hoặc  { supplier: "X" } (confirm all CHO_MUA của NCC)
//
// Logic: với mỗi SP → status='DANG_BAN', stock += pending_qty, pending_qty=0.
// Returns: { success, confirmed, items: [{code, name, stock, status}] }
// =====================================================
router.post('/confirm-purchase', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        const codes = Array.isArray(b.codes)
            ? b.codes.map((c) => String(c).trim()).filter(Boolean)
            : [];
        const supplier = b.supplier ? String(b.supplier).trim() : null;
        if (!codes.length && !supplier) {
            return res.status(400).json({ error: 'Cần codes[] hoặc supplier' });
        }
        const now = Date.now();
        const whereParts = ["status = 'CHO_MUA'"];
        const params = [];
        if (codes.length) {
            params.push(codes);
            whereParts.push(`code = ANY($${params.length}::text[])`);
        }
        if (supplier) {
            params.push(supplier);
            whereParts.push(`supplier = $${params.length}`);
        }
        params.push(now);
        const sql = `
            UPDATE web2_products
               SET status      = 'DANG_BAN',
                   stock       = stock + COALESCE(pending_qty, 0),
                   pending_qty = 0,
                   updated_at  = $${params.length}
             WHERE ${whereParts.join(' AND ')}
            RETURNING *
        `;
        const r = await pool.query(sql, params);
        res.json({
            success: true,
            confirmed: r.rows.length,
            items: r.rows.map(mapRow),
        });
    } catch (e) {
        console.error('[WEB2-PRODUCTS] confirm-purchase error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
