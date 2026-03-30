/**
 * =====================================================
 * API V2 - KHO DI CHO ROUTES
 * =====================================================
 *
 * Market warehouse management - tracks products purchased
 * from suppliers via TPOS purchase orders.
 *
 * Routes:
 *   GET    /              - List all products (search, paginated)
 *   POST   /batch         - Batch upsert products (from purchase-orders)
 *   PATCH  /:id           - Update product (qty, price)
 *   DELETE /:id           - Delete single product
 *   DELETE /              - Clear all products (reset warehouse)
 *
 * Created: 2026-03-30
 * =====================================================
 */

const express = require('express');
const router = express.Router();

// =====================================================
// TABLE INITIALIZATION
// =====================================================

let tableInitialized = false;

async function ensureTable(db) {
    if (tableInitialized) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS kho_di_cho (
                id SERIAL PRIMARY KEY,
                stt INTEGER NOT NULL,
                product_code VARCHAR(100) NOT NULL UNIQUE,
                parent_product_code VARCHAR(100),
                product_name TEXT NOT NULL,
                variant VARCHAR(100),
                quantity INTEGER NOT NULL DEFAULT 0,
                purchase_price NUMERIC(15,2) NOT NULL DEFAULT 0,
                source_po_ids TEXT[] DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_kho_di_cho_product_code ON kho_di_cho(product_code);
            CREATE INDEX IF NOT EXISTS idx_kho_di_cho_parent_code ON kho_di_cho(parent_product_code);
            CREATE INDEX IF NOT EXISTS idx_kho_di_cho_stt ON kho_di_cho(stt);
        `);
        tableInitialized = true;
    } catch (err) {
        console.error('[KhoDiCho] Table init error:', err.message);
    }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function handleError(res, error, message = 'Internal server error') {
    console.error(`[KhoDiCho V2] ${message}:`, error.message);
    res.status(500).json({ success: false, error: message, details: error.message });
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /api/v2/kho-di-cho
 * List products with search, filter, pagination
 */
router.get('/', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const {
        page = 1,
        limit = 200,
        search,
        sort_by = 'stt',
        sort_order = 'ASC'
    } = req.query;

    try {
        let query = `SELECT * FROM kho_di_cho WHERE 1=1`;
        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND (
                product_name ILIKE $${paramIndex}
                OR product_code ILIKE $${paramIndex}
                OR parent_product_code ILIKE $${paramIndex}
                OR variant ILIKE $${paramIndex}
            )`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        // Count total
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Sort
        const allowedSorts = ['stt', 'product_code', 'product_name', 'quantity', 'purchase_price', 'created_at', 'updated_at'];
        const sortField = allowedSorts.includes(sort_by) ? sort_by : 'stt';
        const order = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        query += ` ORDER BY ${sortField} ${order}`;

        // Pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), offset);

        const result = await db.query(query, params);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch kho di cho');
    }
});

/**
 * POST /api/v2/kho-di-cho/batch
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
            const { product_code, parent_product_code, product_name, variant, quantity, purchase_price, source_po_id } = item;

            if (!product_code || !product_name) {
                results.errors.push(`Missing product_code or product_name for item: ${JSON.stringify(item)}`);
                continue;
            }

            // Check if product already exists
            const existing = await client.query(
                'SELECT id, quantity, source_po_ids FROM kho_di_cho WHERE product_code = $1',
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
                    `UPDATE kho_di_cho
                     SET quantity = $1, source_po_ids = $2, updated_at = NOW(),
                         purchase_price = CASE WHEN $3::numeric > 0 THEN $3::numeric ELSE purchase_price END
                     WHERE id = $4`,
                    [newQty, poIds, purchase_price || 0, row.id]
                );
                results.updated++;
            } else {
                // Insert: assign next STT
                const maxSttResult = await client.query('SELECT COALESCE(MAX(stt), 0) as max_stt FROM kho_di_cho');
                const nextStt = maxSttResult.rows[0].max_stt + 1;

                await client.query(
                    `INSERT INTO kho_di_cho (stt, product_code, parent_product_code, product_name, variant, quantity, purchase_price, source_po_ids)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [nextStt, product_code, parent_product_code || null, product_name, variant || null, quantity || 1, purchase_price || 0, source_po_id ? [source_po_id] : []]
                );
                results.inserted++;
            }
        }

        await client.query('COMMIT');

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
 * PATCH /api/v2/kho-di-cho/:id
 * Update a product (quantity, price, etc.)
 */
router.patch('/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { id } = req.params;
    const { quantity, purchase_price, product_name, variant } = req.body;

    try {
        const fields = [];
        const params = [];
        let paramIndex = 1;

        if (quantity !== undefined) {
            fields.push(`quantity = $${paramIndex++}`);
            params.push(quantity);
        }
        if (purchase_price !== undefined) {
            fields.push(`purchase_price = $${paramIndex++}`);
            params.push(purchase_price);
        }
        if (product_name !== undefined) {
            fields.push(`product_name = $${paramIndex++}`);
            params.push(product_name);
        }
        if (variant !== undefined) {
            fields.push(`variant = $${paramIndex++}`);
            params.push(variant);
        }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        fields.push(`updated_at = NOW()`);

        const query = `UPDATE kho_di_cho SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
        params.push(id);

        const result = await db.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Update failed');
    }
});

/**
 * DELETE /api/v2/kho-di-cho/:id
 * Delete a single product
 */
router.delete('/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    const { id } = req.params;

    try {
        const result = await db.query('DELETE FROM kho_di_cho WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        res.json({ success: true, message: 'Product deleted' });
    } catch (error) {
        handleError(res, error, 'Delete failed');
    }
});

/**
 * DELETE /api/v2/kho-di-cho
 * Clear all products (reset warehouse)
 */
router.delete('/', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureTable(db);

    try {
        const result = await db.query('DELETE FROM kho_di_cho');
        res.json({ success: true, message: `Cleared ${result.rowCount} products` });
    } catch (error) {
        handleError(res, error, 'Clear failed');
    }
});

module.exports = router;
