// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * API V2 - WEB WAREHOUSE ROUTES
 * =====================================================
 *
 * Web warehouse management - syncs products
 * from TPOS product catalog (2-way sync).
 *
 * Also serves as the product pool for "Bán Hàng" tab in orders-report.
 * Supports held products (multi-user), confirm-to-order (TPOS),
 * and undo (return from order back to warehouse).
 *
 * Routes:
 *   GET    /                      - List all products (with available_qty, holders)
 *   POST   /batch                 - Batch upsert products (from purchase-orders)
 *   POST   /subtract              - Subtract quantities after doi-soat
 *   PATCH  /:id                   - Update product (qty, price)
 *   DELETE /:id                   - Delete single product
 *   DELETE /                      - Clear all products (reset warehouse)
 *
 *   --- Held Products (multi-user) ---
 *   POST   /hold                  - Hold a product for an order
 *   DELETE /hold/:orderId/:productCode/:userId - Release hold
 *   GET    /holders/:productCode  - Get all holders of a product
 *
 *   --- Sales (confirm to TPOS order) ---
 *   POST   /confirm-sale          - Confirm held → subtract from warehouse
 *   POST   /return                - Return product from order back to warehouse
 *   GET    /sales                 - Get sales history (for undo lookup)
 *
 * Created: 2026-03-30
 * Updated: 2026-04-12 — Renamed kho_di_cho → web_warehouse
 * =====================================================
 */

const express = require('express');
const router = express.Router();

// =====================================================
// SSE NOTIFICATION
// =====================================================

let notifyClients, notifyClientsWildcard;

/**
 * Initialize SSE notifiers (called from server.js or v2/index.js)
 */
function initializeNotifiers(notify, notifyWildcard) {
    notifyClients = notify;
    notifyClientsWildcard = notifyWildcard;
    console.log('[WebWarehouse] SSE notifiers initialized');
}

function notifyWarehouseChange(data, eventType = 'update') {
    if (notifyClients) notifyClients('web_warehouse', data, eventType);
}

// =====================================================
// TABLE INITIALIZATION & MIGRATION
// =====================================================

let tableInitialized = false;

async function ensureTable(db) {
    if (tableInitialized) return;
    try {
        // Enable unaccent extension for Vietnamese diacritics-insensitive search
        await db.query(`CREATE EXTENSION IF NOT EXISTS unaccent;`);

        // Migration: rename old tables if they exist (one-time, idempotent)
        await db.query(`
            DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kho_di_cho') THEN
                    ALTER TABLE kho_di_cho RENAME TO web_warehouse;
                END IF;
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kho_di_cho_sales') THEN
                    ALTER TABLE kho_di_cho_sales RENAME TO web_warehouse_sales;
                END IF;
            END $$;
        `);

        // Main warehouse table
        await db.query(`
            CREATE TABLE IF NOT EXISTS web_warehouse (
                id SERIAL PRIMARY KEY,
                stt INTEGER NOT NULL,
                product_code VARCHAR(100) NOT NULL UNIQUE,
                parent_product_code VARCHAR(100),
                product_name TEXT NOT NULL,
                variant VARCHAR(100),
                quantity INTEGER NOT NULL DEFAULT 0,
                purchase_price NUMERIC(15,2) NOT NULL DEFAULT 0,
                source_po_ids TEXT[] DEFAULT '{}',
                image_url TEXT,
                tpos_product_id INTEGER,
                selling_price NUMERIC(15,2) DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_web_warehouse_product_code ON web_warehouse(product_code);
            CREATE INDEX IF NOT EXISTS idx_web_warehouse_parent_code ON web_warehouse(parent_product_code);
            CREATE INDEX IF NOT EXISTS idx_web_warehouse_stt ON web_warehouse(stt);
        `);

        // Migration: add columns incrementally (safe to run multiple times)
        await db.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='web_warehouse' AND column_name='image_url') THEN
                    ALTER TABLE web_warehouse ADD COLUMN image_url TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='web_warehouse' AND column_name='tpos_product_id') THEN
                    ALTER TABLE web_warehouse ADD COLUMN tpos_product_id INTEGER;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='web_warehouse' AND column_name='selling_price') THEN
                    ALTER TABLE web_warehouse ADD COLUMN selling_price NUMERIC(15,2) DEFAULT 0;
                END IF;
                -- v3 columns: TPOS product sync
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='web_warehouse' AND column_name='tpos_template_id') THEN
                    ALTER TABLE web_warehouse ADD COLUMN tpos_template_id INTEGER;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='web_warehouse' AND column_name='name_get') THEN
                    ALTER TABLE web_warehouse ADD COLUMN name_get TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='web_warehouse' AND column_name='category') THEN
                    ALTER TABLE web_warehouse ADD COLUMN category VARCHAR(255);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='web_warehouse' AND column_name='barcode') THEN
                    ALTER TABLE web_warehouse ADD COLUMN barcode VARCHAR(100);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='web_warehouse' AND column_name='uom_name') THEN
                    ALTER TABLE web_warehouse ADD COLUMN uom_name VARCHAR(50) DEFAULT 'Cái';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='web_warehouse' AND column_name='standard_price') THEN
                    ALTER TABLE web_warehouse ADD COLUMN standard_price NUMERIC(15,2) DEFAULT 0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='web_warehouse' AND column_name='tpos_qty_available') THEN
                    ALTER TABLE web_warehouse ADD COLUMN tpos_qty_available NUMERIC(10,2) DEFAULT 0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='web_warehouse' AND column_name='active') THEN
                    ALTER TABLE web_warehouse ADD COLUMN active BOOLEAN DEFAULT true;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='web_warehouse' AND column_name='data_hash') THEN
                    ALTER TABLE web_warehouse ADD COLUMN data_hash VARCHAR(64);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='web_warehouse' AND column_name='last_synced_at') THEN
                    ALTER TABLE web_warehouse ADD COLUMN last_synced_at TIMESTAMPTZ;
                END IF;
            END $$;
        `);

        // Sync log table — tracks TPOS sync runs
        await db.query(`
            CREATE TABLE IF NOT EXISTS tpos_sync_log (
                id SERIAL PRIMARY KEY,
                sync_type VARCHAR(50) NOT NULL,
                started_at TIMESTAMPTZ DEFAULT NOW(),
                finished_at TIMESTAMPTZ,
                status VARCHAR(20) DEFAULT 'running',
                stats JSONB,
                error_message TEXT,
                resume_page INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_sync_log_status ON tpos_sync_log(status);
        `);

        // Sales history table — for undo (return to warehouse)
        await db.query(`
            CREATE TABLE IF NOT EXISTS web_warehouse_sales (
                id SERIAL PRIMARY KEY,
                product_code VARCHAR(100) NOT NULL,
                parent_product_code VARCHAR(100),
                product_name TEXT,
                variant VARCHAR(100),
                purchase_price NUMERIC(15,2),
                selling_price NUMERIC(15,2),
                image_url TEXT,
                tpos_product_id INTEGER,
                quantity INTEGER NOT NULL DEFAULT 1,
                order_id VARCHAR(255),
                order_stt VARCHAR(50),
                sold_by_user_id VARCHAR(255),
                sold_by_name VARCHAR(255),
                sold_at TIMESTAMPTZ DEFAULT NOW(),
                returned_at TIMESTAMPTZ,
                status VARCHAR(20) DEFAULT 'sold'
            );
            CREATE INDEX IF NOT EXISTS idx_ww_sales_product_code ON web_warehouse_sales(product_code);
            CREATE INDEX IF NOT EXISTS idx_ww_sales_order_id ON web_warehouse_sales(order_id);
            CREATE INDEX IF NOT EXISTS idx_ww_sales_status ON web_warehouse_sales(status);
        `);

        tableInitialized = true;
        console.log('[WebWarehouse] Tables initialized');
    } catch (err) {
        console.error('[WebWarehouse] Table init error:', err.message);
    }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function handleError(res, error, message = 'Internal server error') {
    console.error(`[WebWarehouse V2] ${message}:`, error.message);
    res.status(500).json({ success: false, error: message, details: error.message });
}

/**
 * Get total held quantity for a product_code across all orders/users
 */
async function getHeldQuantity(db, productCode) {
    const result = await db.query(
        `SELECT COALESCE(SUM((data->>'quantity')::int), 0) as total_held
         FROM held_products
         WHERE product_id = $1 AND (data->>'quantity')::int > 0`,
        [String(productCode)]
    );
    return parseInt(result.rows[0].total_held) || 0;
}

/**
 * Get holders for a product_code
 */
async function getHolders(db, productCode) {
    const result = await db.query(
        `SELECT order_id, user_id, data, is_draft
         FROM held_products
         WHERE product_id = $1 AND (data->>'quantity')::int > 0`,
        [String(productCode)]
    );
    return result.rows.map(row => ({
        orderId: row.order_id,
        userId: row.user_id,
        displayName: row.data?.displayName || row.user_id,
        quantity: parseInt(row.data?.quantity) || 0,
        isDraft: row.is_draft,
    }));
}

// =====================================================
// ROUTES — WAREHOUSE CRUD
// =====================================================

/**
 * GET /api/v2/web-warehouse
 * List products with search, filter, pagination
 * Enhanced: includes available_qty (quantity - held) and holders info
 */
router.get('/', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const {
        page = 1,
        limit = 200,
        search,
        sort_by = 'stt',
        sort_order = 'ASC',
        include_holders = 'false',
        category,
        active,
        has_inventory,
    } = req.query;

    try {
        // Build WHERE conditions separately (reusable for count)
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        if (search) {
            conditions.push(`(
                k.product_name ILIKE $${paramIndex}
                OR k.product_code ILIKE $${paramIndex}
                OR k.parent_product_code ILIKE $${paramIndex}
                OR k.variant ILIKE $${paramIndex}
                OR k.name_get ILIKE $${paramIndex}
                OR k.barcode ILIKE $${paramIndex}
            )`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (category) {
            conditions.push(`k.category ILIKE $${paramIndex}`);
            params.push(`%${category}%`);
            paramIndex++;
        }

        // Filter by active status (default: show all)
        if (active === 'true') {
            conditions.push(`k.active = true`);
        } else if (active === 'false') {
            conditions.push(`k.active = false`);
        }

        // Filter by inventory (has_inventory=true → quantity > 0)
        if (has_inventory === 'true') {
            conditions.push(`k.quantity > 0`);
        } else if (has_inventory === 'false') {
            conditions.push(`k.quantity = 0`);
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // Join for held qty
        const joinClause = `LEFT JOIN (
            SELECT product_id, SUM((data->>'quantity')::int) as total_held
            FROM held_products
            WHERE (data->>'quantity')::int > 0
            GROUP BY product_id
        ) h ON h.product_id = k.product_code`;

        // Count total
        const countResult = await db.query(
            `SELECT COUNT(*) FROM web_warehouse k ${joinClause} ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Sort
        const allowedSorts = [
            'stt', 'product_code', 'product_name', 'quantity',
            'purchase_price', 'selling_price', 'standard_price',
            'created_at', 'updated_at', 'available_qty',
            'category', 'tpos_qty_available', 'uom_name',
            'barcode', 'name_get', 'active', 'last_synced_at',
        ];
        const sortField = allowedSorts.includes(sort_by) ? sort_by : 'stt';
        const order = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        // Pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const paginationParams = [...params, parseInt(limit), offset];

        const query = `
            SELECT k.*,
                   COALESCE(h.total_held, 0) as held_qty,
                   k.quantity - COALESCE(h.total_held, 0) as available_qty
            FROM web_warehouse k
            ${joinClause}
            ${whereClause}
            ORDER BY ${sortField} ${order}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const result = await db.query(query, paginationParams);

        // Optionally include holders detail
        let data = result.rows;
        if (include_holders === 'true') {
            for (const row of data) {
                if (parseInt(row.held_qty) > 0) {
                    row.holders = await getHolders(db, row.product_code);
                } else {
                    row.holders = [];
                }
            }
        }

        res.json({
            success: true,
            data,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch web warehouse');
    }
});

// =====================================================
// SEARCH & PRODUCT DETAIL (for soluong-live, order-management)
// =====================================================

/**
 * GET /api/v2/web-warehouse/search
 * Lightweight autocomplete search — returns minimal fields, no JOINs
 * Used by soluong-live and order-management for product search
 */
router.get('/search', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { q, limit = 15 } = req.query;

    if (!q || q.trim().length < 1) {
        return res.json({ success: true, data: [] });
    }

    try {
        const searchTerm = `%${q.trim()}%`;
        const maxLimit = Math.min(parseInt(limit) || 15, 50);

        const result = await db.query(`
            SELECT tpos_product_id, tpos_template_id, product_code,
                   product_name, name_get, image_url, selling_price,
                   tpos_qty_available, parent_product_code, barcode,
                   purchase_price, standard_price, uom_name, category, variant
            FROM web_warehouse
            WHERE active = true
              AND (
                  unaccent(product_name) ILIKE unaccent($1)
                  OR product_code ILIKE $1
                  OR unaccent(name_get) ILIKE unaccent($1)
                  OR barcode ILIKE $1
              )
            ORDER BY product_name ASC
            LIMIT $2
        `, [searchTerm, maxLimit]);

        res.json({ success: true, data: result.rows });
    } catch (error) {
        handleError(res, error, 'Search failed');
    }
});

/**
 * POST /api/v2/web-warehouse/batch-lookup
 * Lookup multiple products by product_code array
 * Returns full product data for barcode label printing
 */
router.post('/batch-lookup', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { codes } = req.body;
    if (!Array.isArray(codes) || codes.length === 0) {
        return res.json({ success: true, data: [] });
    }

    // Limit to 100 codes per request
    const safeCodes = codes.slice(0, 100);

    try {
        const placeholders = safeCodes.map((_, i) => `$${i + 1}`).join(',');
        const result = await db.query(`
            SELECT tpos_product_id, tpos_template_id, product_code,
                   product_name, name_get, image_url, selling_price,
                   tpos_qty_available, parent_product_code, barcode,
                   purchase_price, standard_price, uom_name, category, variant
            FROM web_warehouse
            WHERE active = true AND product_code IN (${placeholders})
        `, safeCodes);

        res.json({ success: true, data: result.rows });
    } catch (error) {
        handleError(res, error, 'Batch lookup failed');
    }
});

/**
 * GET /api/v2/web-warehouse/product/:tposProductId
 * Get single product + all sibling variants (same parent_product_code)
 * Replaces two TPOS OData calls: Product(id) + ProductTemplate(tmplId)?$expand=ProductVariants
 */
router.get('/product/:tposProductId', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const tposProductId = parseInt(req.params.tposProductId);
    if (!tposProductId) {
        return res.status(400).json({ success: false, error: 'Invalid tposProductId' });
    }

    try {
        // Find the product
        const productResult = await db.query(
            `SELECT * FROM web_warehouse WHERE tpos_product_id = $1 AND active = true LIMIT 1`,
            [tposProductId]
        );

        if (productResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        const product = productResult.rows[0];
        let variants = [];

        // If product has a parent, fetch all siblings (variants of same template)
        if (product.parent_product_code) {
            const variantsResult = await db.query(
                `SELECT * FROM web_warehouse
                 WHERE parent_product_code = $1 AND active = true
                 ORDER BY name_get ASC`,
                [product.parent_product_code]
            );
            variants = variantsResult.rows;
        }

        res.json({ success: true, product, variants });
    } catch (error) {
        handleError(res, error, 'Get product failed');
    }
});

// =====================================================
// ROUTES — BATCH & CRUD
// =====================================================

/**
 * POST /api/v2/web-warehouse/batch
 * Batch upsert products from purchase-orders
 * - If product_code exists: quantity += new quantity, append source_po_id
 * - If product_code new: assign next STT, insert
 */
router.post('/batch', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'items array is required' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const results = { inserted: 0, updated: 0, errors: [] };

        for (const item of items) {
            const {
                product_code, parent_product_code, product_name, variant,
                quantity, purchase_price, source_po_id,
                image_url, tpos_product_id, selling_price
            } = item;

            if (!product_code || !product_name) {
                results.errors.push(`Missing product_code or product_name for item: ${JSON.stringify(item)}`);
                continue;
            }

            // Check if product already exists
            const existing = await client.query(
                'SELECT id, quantity, source_po_ids FROM web_warehouse WHERE product_code = $1',
                [product_code]
            );

            if (existing.rows.length > 0) {
                // Update: increase quantity, append source PO
                const row = existing.rows[0];
                const newQty = (row.quantity || 0) + (quantity || 1);
                const poIds = row.source_po_ids || [];
                if (source_po_id && !poIds.includes(source_po_id)) {
                    poIds.push(source_po_id);
                }

                await client.query(
                    `UPDATE web_warehouse
                     SET quantity = $1, source_po_ids = $2, updated_at = NOW(),
                         purchase_price = CASE WHEN $3::numeric > 0 THEN $3::numeric ELSE purchase_price END,
                         image_url = COALESCE($4, image_url),
                         tpos_product_id = COALESCE($5, tpos_product_id),
                         selling_price = CASE WHEN $6::numeric > 0 THEN $6::numeric ELSE selling_price END
                     WHERE id = $7`,
                    [newQty, poIds, purchase_price || 0, image_url || null, tpos_product_id || null, selling_price || 0, row.id]
                );
                results.updated++;
            } else {
                // Insert: assign next STT
                const maxSttResult = await client.query('SELECT COALESCE(MAX(stt), 0) as max_stt FROM web_warehouse');
                const nextStt = maxSttResult.rows[0].max_stt + 1;

                await client.query(
                    `INSERT INTO web_warehouse (stt, product_code, parent_product_code, product_name, variant, quantity, purchase_price, source_po_ids, image_url, tpos_product_id, selling_price)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                    [nextStt, product_code, parent_product_code || null, product_name, variant || null,
                     quantity || 1, purchase_price || 0, source_po_id ? [source_po_id] : [],
                     image_url || null, tpos_product_id || null, selling_price || 0]
                );
                results.inserted++;
            }
        }

        await client.query('COMMIT');

        // Notify SSE
        notifyWarehouseChange({ action: 'batch', ...results }, 'update');

        res.json({
            success: true,
            message: `Batch complete: ${results.inserted} inserted, ${results.updated} updated`,
            results
        });
    } catch (error) {
        await client.query('ROLLBACK');
        handleError(res, error, 'Batch upsert failed');
    } finally {
        client.release();
    }
});

/**
 * POST /api/v2/web-warehouse/subtract
 * Subtract quantities after doi-soat success
 */
router.post('/subtract', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'items array is required' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const results = { subtracted: 0, removed: 0, not_found: 0 };

        for (const item of items) {
            const { product_code, quantity } = item;
            if (!product_code) continue;

            const code = product_code.toUpperCase().trim();
            const subQty = quantity || 1;

            const existing = await client.query(
                'SELECT id, quantity FROM web_warehouse WHERE UPPER(product_code) = $1',
                [code]
            );

            if (existing.rows.length === 0) {
                results.not_found++;
                continue;
            }

            const row = existing.rows[0];
            const newQty = (row.quantity || 0) - subQty;

            if (newQty <= 0) {
                await client.query('DELETE FROM web_warehouse WHERE id = $1', [row.id]);
                results.removed++;
            } else {
                await client.query(
                    'UPDATE web_warehouse SET quantity = $1, updated_at = NOW() WHERE id = $2',
                    [newQty, row.id]
                );
                results.subtracted++;
            }
        }

        await client.query('COMMIT');

        notifyWarehouseChange({ action: 'subtract', ...results }, 'update');

        res.json({
            success: true,
            message: `Trừ kho: ${results.subtracted} cập nhật, ${results.removed} xóa, ${results.not_found} không tìm thấy`,
            results
        });
    } catch (error) {
        await client.query('ROLLBACK');
        handleError(res, error, 'Subtract failed');
    } finally {
        client.release();
    }
});

/**
 * PATCH /api/v2/web-warehouse/:id
 * Update a product (quantity, price, etc.)
 */
router.patch('/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { id } = req.params;
    const { quantity, purchase_price, product_name, variant, image_url, tpos_product_id, selling_price } = req.body;

    try {
        const fields = [];
        const params = [];
        let paramIndex = 1;

        if (quantity !== undefined) { fields.push(`quantity = $${paramIndex++}`); params.push(quantity); }
        if (purchase_price !== undefined) { fields.push(`purchase_price = $${paramIndex++}`); params.push(purchase_price); }
        if (product_name !== undefined) { fields.push(`product_name = $${paramIndex++}`); params.push(product_name); }
        if (variant !== undefined) { fields.push(`variant = $${paramIndex++}`); params.push(variant); }
        if (image_url !== undefined) { fields.push(`image_url = $${paramIndex++}`); params.push(image_url); }
        if (tpos_product_id !== undefined) { fields.push(`tpos_product_id = $${paramIndex++}`); params.push(tpos_product_id); }
        if (selling_price !== undefined) { fields.push(`selling_price = $${paramIndex++}`); params.push(selling_price); }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        fields.push(`updated_at = NOW()`);

        const query = `UPDATE web_warehouse SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
        params.push(id);

        const result = await db.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        notifyWarehouseChange({ action: 'update', product: result.rows[0] }, 'update');

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Update failed');
    }
});

/**
 * DELETE /api/v2/web-warehouse/:id
 * Delete a single product
 */
router.delete('/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { id } = req.params;

    try {
        const result = await db.query('DELETE FROM web_warehouse WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        notifyWarehouseChange({ action: 'delete', id, product_code: result.rows[0].product_code }, 'deleted');

        res.json({ success: true, message: 'Product deleted' });
    } catch (error) {
        handleError(res, error, 'Delete failed');
    }
});

/**
 * DELETE /api/v2/web-warehouse
 * Clear all products (reset warehouse)
 */
router.delete('/', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    try {
        const result = await db.query('DELETE FROM web_warehouse');
        notifyWarehouseChange({ action: 'clear', count: result.rowCount }, 'deleted');
        res.json({ success: true, message: `Cleared ${result.rowCount} products` });
    } catch (error) {
        handleError(res, error, 'Clear failed');
    }
});

/**
 * POST /api/v2/web-warehouse/bulk-delete
 * Bulk delete products by IDs
 */
router.post('/bulk-delete', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: 'ids array is required' });
    }

    try {
        const result = await db.query(
            `DELETE FROM web_warehouse WHERE id = ANY($1) RETURNING id, product_code`,
            [ids]
        );
        notifyWarehouseChange({ action: 'bulk_delete', count: result.rowCount }, 'deleted');
        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        handleError(res, error, 'Bulk delete failed');
    }
});

/**
 * POST /api/v2/web-warehouse/bulk-update
 * Bulk update fields for multiple products
 * Body: { ids: [...], fields: { quantity, purchase_price, selling_price, active } }
 */
router.post('/bulk-update', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { ids, fields } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0 || !fields) {
        return res.status(400).json({ success: false, error: 'ids and fields are required' });
    }

    try {
        const sets = [];
        const params = [ids]; // $1 = ids array
        let paramIndex = 2;

        if (fields.quantity !== undefined) { sets.push(`quantity = $${paramIndex++}`); params.push(fields.quantity); }
        if (fields.purchase_price !== undefined) { sets.push(`purchase_price = $${paramIndex++}`); params.push(fields.purchase_price); }
        if (fields.selling_price !== undefined) { sets.push(`selling_price = $${paramIndex++}`); params.push(fields.selling_price); }
        if (fields.active !== undefined) { sets.push(`active = $${paramIndex++}`); params.push(fields.active); }

        if (sets.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields to update' });
        }

        sets.push('updated_at = NOW()');

        const result = await db.query(
            `UPDATE web_warehouse SET ${sets.join(', ')} WHERE id = ANY($1) RETURNING id`,
            params
        );

        notifyWarehouseChange({ action: 'bulk_update', count: result.rowCount, fields: Object.keys(fields) }, 'update');
        res.json({ success: true, updated: result.rowCount });
    } catch (error) {
        handleError(res, error, 'Bulk update failed');
    }
});

/**
 * POST /api/v2/web-warehouse/change-qty
 * Change quantity for a product (with delta or absolute value)
 * Body: { id, change: +/-N } or { id, value: N }
 */
router.post('/change-qty', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { id, change, value } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'id is required' });

    try {
        let result;
        if (value !== undefined) {
            result = await db.query(
                `UPDATE web_warehouse SET quantity = GREATEST(0, $1), updated_at = NOW() WHERE id = $2 RETURNING *`,
                [parseInt(value), id]
            );
        } else if (change !== undefined) {
            result = await db.query(
                `UPDATE web_warehouse SET quantity = GREATEST(0, quantity + $1), updated_at = NOW() WHERE id = $2 RETURNING *`,
                [parseInt(change), id]
            );
        } else {
            return res.status(400).json({ success: false, error: 'change or value is required' });
        }

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        notifyWarehouseChange({ action: 'qty_change', product: result.rows[0] }, 'update');
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Qty change failed');
    }
});

// =====================================================
// ROUTES — HELD PRODUCTS (multi-user)
// Uses existing held_products table, product_id = product_code
// =====================================================

/**
 * POST /api/v2/web-warehouse/hold
 * Hold a product from warehouse for a specific order
 *
 * Body: {
 *   orderId, productCode, userId, displayName,
 *   quantity (default 1),
 *   isDraft (default false),
 *   ... extra data fields
 * }
 *
 * Side effects:
 * - Creates/updates held_products row
 * - SSE notify web_warehouse (available_qty changed)
 * - SSE notify held_products/{orderId}
 */
router.post('/hold', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const {
        orderId, productCode, userId, displayName,
        quantity = 1, isDraft = false,
        ...extraData
    } = req.body;

    if (!orderId || !productCode || !userId) {
        return res.status(400).json({ success: false, error: 'orderId, productCode, userId are required' });
    }

    try {
        // Check warehouse product exists and has available qty
        const product = await db.query('SELECT * FROM web_warehouse WHERE product_code = $1', [productCode]);
        if (product.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Product not found in warehouse' });
        }

        const warehouseProduct = product.rows[0];
        const currentHeld = await getHeldQuantity(db, productCode);
        const availableQty = warehouseProduct.quantity - currentHeld;

        if (availableQty < quantity) {
            return res.status(409).json({
                success: false,
                error: `Không đủ hàng. Còn ${availableQty}, yêu cầu ${quantity}`,
                available: availableQty
            });
        }

        // Upsert held_products
        const heldData = {
            productCode,
            productName: warehouseProduct.product_name,
            variant: warehouseProduct.variant,
            imageUrl: warehouseProduct.image_url,
            purchasePrice: parseFloat(warehouseProduct.purchase_price) || 0,
            sellingPrice: parseFloat(warehouseProduct.selling_price) || 0,
            parentProductCode: warehouseProduct.parent_product_code,
            tposProductId: warehouseProduct.tpos_product_id,
            khoId: warehouseProduct.id,
            displayName: displayName || userId,
            quantity,
            timestamp: Date.now(),
            source: 'web_warehouse',
            ...extraData
        };

        await db.query(`
            INSERT INTO held_products (order_id, product_id, user_id, data, is_draft, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (order_id, product_id, user_id) DO UPDATE SET
                data = $4,
                is_draft = $5,
                updated_at = CURRENT_TIMESTAMP
        `, [orderId, productCode, userId, JSON.stringify(heldData), isDraft]);

        // Notify SSE — warehouse changed
        notifyWarehouseChange({
            action: 'held',
            productCode,
            availableQty: availableQty - quantity,
            heldBy: displayName || userId
        }, 'update');

        // Notify SSE — held_products for this order
        if (notifyClientsWildcard) {
            notifyClientsWildcard(`held_products/${orderId}`, {
                productId: productCode,
                userId,
                data: { ...heldData, isDraft }
            }, 'update');
        }

        res.json({
            success: true,
            held: {
                orderId,
                productCode,
                userId,
                quantity,
                availableQty: availableQty - quantity,
                warehouseQty: warehouseProduct.quantity,
                product: heldData
            }
        });
    } catch (error) {
        handleError(res, error, 'Hold failed');
    }
});

/**
 * DELETE /api/v2/web-warehouse/hold/:orderId/:productCode/:userId
 * Release a held product (return to available pool)
 */
router.delete('/hold/:orderId/:productCode/:userId', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { orderId, productCode, userId } = req.params;

    try {
        const result = await db.query(
            'DELETE FROM held_products WHERE order_id = $1 AND product_id = $2 AND user_id = $3 RETURNING *',
            [orderId, productCode, userId]
        );

        // Notify SSE
        notifyWarehouseChange({ action: 'released', productCode }, 'update');
        if (notifyClientsWildcard) {
            notifyClientsWildcard(`held_products/${orderId}`, {
                productId: productCode, userId, deleted: true
            }, 'deleted');
        }

        res.json({
            success: true,
            deleted: result.rowCount > 0,
            orderId, productCode, userId
        });
    } catch (error) {
        handleError(res, error, 'Release hold failed');
    }
});

/**
 * GET /api/v2/web-warehouse/holders/:productCode
 * Get all holders of a specific product
 */
router.get('/holders/:productCode', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { productCode } = req.params;

    try {
        const holders = await getHolders(db, productCode);
        const totalHeld = holders.reduce((sum, h) => sum + h.quantity, 0);

        // Get warehouse quantity
        const product = await db.query('SELECT quantity FROM web_warehouse WHERE product_code = $1', [productCode]);
        const warehouseQty = product.rows.length > 0 ? product.rows[0].quantity : 0;

        res.json({
            success: true,
            productCode,
            warehouseQty,
            totalHeld,
            availableQty: warehouseQty - totalHeld,
            holders
        });
    } catch (error) {
        handleError(res, error, 'Get holders failed');
    }
});

// =====================================================
// ROUTES — SALES (confirm to order / undo)
// =====================================================

/**
 * POST /api/v2/web-warehouse/confirm-sale
 * Confirm held product → subtract from warehouse, log to sales history
 *
 * Body: {
 *   orderId, orderStt, productCode, userId, displayName,
 *   quantity (default: held qty)
 * }
 *
 * Flow:
 * 1. Find held_products row
 * 2. Subtract quantity from web_warehouse
 * 3. Log to web_warehouse_sales
 * 4. Delete from held_products
 * 5. SSE notify
 */
router.post('/confirm-sale', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { orderId, orderStt, productCode, userId, displayName, quantity } = req.body;

    if (!orderId || !productCode || !userId) {
        return res.status(400).json({ success: false, error: 'orderId, productCode, userId are required' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Get held product data
        const heldResult = await client.query(
            'SELECT data FROM held_products WHERE order_id = $1 AND product_id = $2 AND user_id = $3',
            [orderId, productCode, userId]
        );

        const heldQty = heldResult.rows.length > 0
            ? parseInt(heldResult.rows[0].data?.quantity) || 1
            : (quantity || 1);
        const confirmQty = quantity || heldQty;

        // 2. Get warehouse product
        const productResult = await client.query(
            'SELECT * FROM web_warehouse WHERE product_code = $1',
            [productCode]
        );

        if (productResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Product not found in warehouse' });
        }

        const warehouseProduct = productResult.rows[0];
        const newQty = warehouseProduct.quantity - confirmQty;

        // 3. Subtract from warehouse (or delete if reaches 0)
        if (newQty <= 0) {
            await client.query('DELETE FROM web_warehouse WHERE id = $1', [warehouseProduct.id]);
        } else {
            await client.query(
                'UPDATE web_warehouse SET quantity = $1, updated_at = NOW() WHERE id = $2',
                [newQty, warehouseProduct.id]
            );
        }

        // 4. Log to sales history
        await client.query(
            `INSERT INTO web_warehouse_sales
             (product_code, parent_product_code, product_name, variant, purchase_price, selling_price,
              image_url, tpos_product_id, quantity, order_id, order_stt, sold_by_user_id, sold_by_name, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'sold')`,
            [
                productCode, warehouseProduct.parent_product_code, warehouseProduct.product_name,
                warehouseProduct.variant, warehouseProduct.purchase_price, warehouseProduct.selling_price,
                warehouseProduct.image_url, warehouseProduct.tpos_product_id,
                confirmQty, orderId, orderStt || null,
                userId, displayName || userId
            ]
        );

        // 5. Delete from held_products
        await client.query(
            'DELETE FROM held_products WHERE order_id = $1 AND product_id = $2 AND user_id = $3',
            [orderId, productCode, userId]
        );

        await client.query('COMMIT');

        // SSE notify
        notifyWarehouseChange({
            action: 'sold',
            productCode,
            quantity: confirmQty,
            orderId,
            remainingQty: Math.max(0, newQty)
        }, 'update');

        if (notifyClientsWildcard) {
            notifyClientsWildcard(`held_products/${orderId}`, {
                productId: productCode, userId, deleted: true, confirmed: true
            }, 'deleted');
        }

        res.json({
            success: true,
            message: `Confirmed ${confirmQty}x ${warehouseProduct.product_name} → order ${orderId}`,
            sale: {
                productCode,
                quantity: confirmQty,
                orderId,
                remainingWarehouseQty: Math.max(0, newQty)
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        handleError(res, error, 'Confirm sale failed');
    } finally {
        client.release();
    }
});

/**
 * POST /api/v2/web-warehouse/return
 * Return product from order back to warehouse (undo sale)
 *
 * Body: {
 *   productCode, quantity, orderId (optional — to find exact sale record),
 *   userId, displayName
 * }
 */
router.post('/return', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { productCode, quantity = 1, orderId, userId, displayName } = req.body;

    if (!productCode) {
        return res.status(400).json({ success: false, error: 'productCode is required' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Find the sale record (most recent unreturned)
        let saleQuery = `SELECT * FROM web_warehouse_sales
                         WHERE product_code = $1 AND status = 'sold'`;
        const saleParams = [productCode];
        if (orderId) {
            saleQuery += ` AND order_id = $2`;
            saleParams.push(orderId);
        }
        saleQuery += ` ORDER BY sold_at DESC LIMIT 1`;

        const saleResult = await client.query(saleQuery, saleParams);

        // 2. Mark sale as returned
        if (saleResult.rows.length > 0) {
            const sale = saleResult.rows[0];
            await client.query(
                `UPDATE web_warehouse_sales SET status = 'returned', returned_at = NOW() WHERE id = $1`,
                [sale.id]
            );
        }

        // 3. Add back to warehouse
        const existing = await client.query(
            'SELECT id, quantity FROM web_warehouse WHERE product_code = $1',
            [productCode]
        );

        if (existing.rows.length > 0) {
            // Product still exists — increase quantity
            await client.query(
                'UPDATE web_warehouse SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
                [quantity, existing.rows[0].id]
            );
        } else if (saleResult.rows.length > 0) {
            // Product was deleted (qty reached 0) — recreate from sale record
            const sale = saleResult.rows[0];
            const maxSttResult = await client.query('SELECT COALESCE(MAX(stt), 0) as max_stt FROM web_warehouse');
            const nextStt = maxSttResult.rows[0].max_stt + 1;

            await client.query(
                `INSERT INTO web_warehouse (stt, product_code, parent_product_code, product_name, variant,
                 quantity, purchase_price, selling_price, image_url, tpos_product_id, source_po_ids)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '{}')`,
                [nextStt, sale.product_code, sale.parent_product_code, sale.product_name,
                 sale.variant, quantity, sale.purchase_price || 0, sale.selling_price || 0,
                 sale.image_url, sale.tpos_product_id]
            );
        } else {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'No sale record or warehouse product found for this product_code'
            });
        }

        await client.query('COMMIT');

        // SSE notify
        notifyWarehouseChange({
            action: 'returned',
            productCode,
            quantity,
            orderId
        }, 'update');

        res.json({
            success: true,
            message: `Returned ${quantity}x ${productCode} to warehouse`,
            returned: { productCode, quantity, orderId }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        handleError(res, error, 'Return failed');
    } finally {
        client.release();
    }
});

/**
 * GET /api/v2/web-warehouse/sales
 * Get sales history (for undo lookup)
 * Query: ?orderId=xxx or ?productCode=xxx or ?status=sold
 */
router.get('/sales', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { orderId, productCode, status = 'sold', limit = 100 } = req.query;

    try {
        let query = 'SELECT * FROM web_warehouse_sales WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (orderId) { query += ` AND order_id = $${paramIndex++}`; params.push(orderId); }
        if (productCode) { query += ` AND product_code = $${paramIndex++}`; params.push(productCode); }
        if (status) { query += ` AND status = $${paramIndex++}`; params.push(status); }

        query += ` ORDER BY sold_at DESC LIMIT $${paramIndex}`;
        params.push(parseInt(limit));

        const result = await db.query(query, params);

        res.json({ success: true, data: result.rows });
    } catch (error) {
        handleError(res, error, 'Get sales failed');
    }
});

// =====================================================
// IMAGE PROXY — serve TPOS product images with auth
// =====================================================

/**
 * GET /api/v2/web-warehouse/image/:tposProductId
 * Proxy TPOS product image through Render (avoids CORS/auth issues on client).
 * Caches with 7-day Cache-Control for CDN/browser caching.
 */
router.get('/image/:tposProductId', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const tposProductId = parseInt(req.params.tposProductId);
    if (!tposProductId) {
        return res.status(400).json({ success: false, error: 'Invalid tposProductId' });
    }

    try {
        // Look up image_url from DB
        const result = await db.query(
            `SELECT image_url FROM web_warehouse WHERE tpos_product_id = $1 AND image_url IS NOT NULL LIMIT 1`,
            [tposProductId]
        );

        if (result.rows.length === 0 || !result.rows[0].image_url) {
            return res.status(404).json({ success: false, error: 'No image found' });
        }

        const imageUrl = result.rows[0].image_url;

        // Build full URL if relative
        const fullUrl = imageUrl.startsWith('http')
            ? imageUrl
            : `https://tomato.tpos.vn${imageUrl}`;

        // Fetch image from TPOS with auth token
        const tokenManager = req.app.locals.tposTokenManager;
        const token = tokenManager ? await tokenManager.getToken() : null;

        const headers = { 'Accept': 'image/*' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const imageResponse = await fetch(fullUrl, { headers });

        if (!imageResponse.ok) {
            return res.status(imageResponse.status).json({ success: false, error: 'TPOS image fetch failed' });
        }

        // Stream the image back with caching headers
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        res.set({
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=604800', // 7 days
            'Access-Control-Allow-Origin': '*',
        });

        const buffer = await imageResponse.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (error) {
        console.error('[WebWarehouse] Image proxy error:', error.message);
        res.status(500).json({ success: false, error: 'Image proxy failed' });
    }
});

// =====================================================
// ROUTES — TPOS SYNC
// =====================================================

let syncService = null;
let socketListener = null;

/**
 * Initialize sync service (called from server.js)
 */
function initializeSyncService(service) {
    syncService = service;
    console.log('[WebWarehouse] Sync service initialized');
}

function initializeSocketListener(listener) {
    socketListener = listener;
    console.log('[WebWarehouse] Socket listener initialized');
}

/**
 * POST /api/v2/web-warehouse/sync
 * Trigger manual sync (full or incremental)
 * Query: ?type=full (default: incremental)
 */
router.post('/sync', async (req, res) => {
    if (!syncService) {
        return res.status(503).json({ success: false, error: 'Sync service not initialized' });
    }

    const syncType = req.query.type || req.body.type || 'incremental';

    try {
        // Run async — don't block the response
        const resultPromise = syncType === 'full'
            ? syncService.fullSync()
            : syncService.incrementalSync();

        // Return immediately with "started" status
        res.json({
            success: true,
            message: `${syncType} sync started`,
            syncType,
        });

        // Log result when done
        resultPromise.then(stats => {
            console.log(`[WebWarehouse] ${syncType} sync completed:`, JSON.stringify(stats));
        }).catch(err => {
            console.error(`[WebWarehouse] ${syncType} sync error:`, err.message);
        });

    } catch (error) {
        handleError(res, error, 'Sync trigger failed');
    }
});

/**
 * GET /api/v2/web-warehouse/sync/status
 * Get current sync status
 */
router.get('/sync/status', async (req, res) => {
    if (!syncService) {
        return res.status(503).json({ success: false, error: 'Sync service not initialized' });
    }

    try {
        const status = await syncService.getStatus();
        const socketStats = socketListener ? socketListener.getStats() : null;
        res.json({ success: true, ...status, socket: socketStats });
    } catch (error) {
        handleError(res, error, 'Get sync status failed');
    }
});

/**
 * GET /api/v2/web-warehouse/sync/log
 * Get sync history
 */
router.get('/sync/log', async (req, res) => {
    if (!syncService) {
        return res.status(503).json({ success: false, error: 'Sync service not initialized' });
    }

    try {
        const limit = parseInt(req.query.limit) || 20;
        const log = await syncService.getLog(limit);
        res.json({ success: true, data: log });
    } catch (error) {
        handleError(res, error, 'Get sync log failed');
    }
});

// =====================================================
// IMAGE UPDATE NOTIFICATION — broadcast to all SSE clients
// =====================================================

/**
 * POST /api/v2/web-warehouse/notify-image-update
 * Called by product-warehouse after saving a new image to TPOS.
 * Broadcasts SSE event so soluong-live & order-management can
 * refresh the affected product's image in real-time.
 *
 * Body: { tposProductId, tposTemplateId }
 */
router.post('/notify-image-update', async (req, res) => {
    const { tposProductId, tposTemplateId } = req.body || {};

    if (!tposProductId && !tposTemplateId) {
        return res.status(400).json({ success: false, error: 'tposProductId or tposTemplateId required' });
    }

    const timestamp = Date.now();

    // Trigger incremental sync so Render DB picks up the new image_url from TPOS
    if (syncService) {
        syncService.incrementalSync().catch(err => {
            console.warn('[WebWarehouse] Image sync trigger failed:', err.message);
        });
    }

    // Broadcast SSE event after a short delay to allow sync to complete
    setTimeout(() => {
        notifyWarehouseChange({
            action: 'image_update',
            tposProductId: tposProductId || null,
            tposTemplateId: tposTemplateId || null,
            timestamp,
        }, 'update');

        console.log(`[WebWarehouse] Image update notified: product=${tposProductId}, template=${tposTemplateId}`);
    }, 3000);

    res.json({ success: true, timestamp });
});

// =====================================================
// EXPORTS
// =====================================================

router.initializeNotifiers = initializeNotifiers;
router.initializeSyncService = initializeSyncService;
router.initializeSocketListener = initializeSocketListener;

module.exports = router;
