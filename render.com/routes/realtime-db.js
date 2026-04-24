// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// REALTIME DATABASE REST API
// Thay thế Firebase Realtime Database Operations
// =====================================================

const express = require('express');
const router = express.Router();

// Import SSE notification functions
let notifyClients, notifyClientsWildcard;

/**
 * Initialize SSE notifiers (called from server.js after route registration)
 * @param {Function} notify - notifyClients function
 * @param {Function} notifyWildcard - notifyClientsWildcard function
 */
function initializeNotifiers(notify, notifyWildcard) {
    notifyClients = notify;
    notifyClientsWildcard = notifyWildcard;
    console.log('[REALTIME-DB] SSE notifiers initialized');
}

// =====================================================
// KEY-VALUE API
// Thay thế: firebase.database().ref('key')
// =====================================================

/**
 * GET /api/realtime/kv/:key
 * Thay thế: firebase.database().ref(key).once('value')
 *
 * Returns: { exists: boolean, value: any }
 */
router.get('/kv/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'SELECT value, created_at, updated_at FROM realtime_kv WHERE key = $1',
            [key]
        );

        if (result.rows.length === 0) {
            return res.json({
                exists: false,
                value: null
            });
        }

        res.json({
            exists: true,
            value: result.rows[0].value,
            createdAt: result.rows[0].created_at,
            updatedAt: result.rows[0].updated_at
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /kv error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/kv/:key
 * Thay thế: firebase.database().ref(key).set(value)
 *
 * Body: { value: any }
 */
router.put('/kv/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        if (value === undefined) {
            return res.status(400).json({ error: 'Missing value in request body' });
        }

        await pool.query(`
            INSERT INTO realtime_kv (key, value, created_at, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET
                value = $2,
                updated_at = CURRENT_TIMESTAMP
        `, [key, JSON.stringify(value)]);

        // Notify SSE clients
        if (notifyClients) {
            notifyClients(key, value, 'update');
        }

        console.log(`[REALTIME-DB] Updated key: ${key}`);

        res.json({
            success: true,
            key,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /kv error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/kv/:key
 * Thay thế: firebase.database().ref(key).remove()
 */
router.delete('/kv/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'DELETE FROM realtime_kv WHERE key = $1 RETURNING key',
            [key]
        );

        // Notify SSE clients
        if (notifyClients) {
            notifyClients(key, null, 'deleted');
        }

        console.log(`[REALTIME-DB] Deleted key: ${key}`);

        res.json({
            success: true,
            deleted: result.rowCount > 0,
            key
        });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /kv error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// HELD PRODUCTS API
// Thay thế: firebase.database().ref('held_products')
// =====================================================

/**
 * GET /api/realtime/held-products/:orderId
 * Thay thế: firebase.database().ref(`held_products/${orderId}`).once('value')
 *
 * Returns Firebase-compatible structure:
 * {
 *   "productId1": {
 *     "userId1": { quantity: 1, isDraft: false, ... },
 *     "userId2": { quantity: 2, isDraft: true, ... }
 *   }
 * }
 */
router.get('/held-products/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'SELECT product_id, user_id, data, is_draft, created_at, updated_at FROM held_products WHERE order_id = $1',
            [orderId]
        );

        // Convert to Firebase-like structure
        const heldProducts = {};

        result.rows.forEach(row => {
            if (!heldProducts[row.product_id]) {
                heldProducts[row.product_id] = {};
            }

            heldProducts[row.product_id][row.user_id] = {
                ...row.data,
                isDraft: row.is_draft,
                _createdAt: row.created_at,
                _updatedAt: row.updated_at
            };
        });

        res.json(heldProducts);
    } catch (error) {
        console.error('[REALTIME-DB] GET /held-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/held-products/:orderId/:productId/:userId
 * Thay thế: firebase.database().ref(`held_products/${orderId}/${productId}/${userId}`).set(data)
 *
 * Body: { data object with product details }
 */
router.put('/held-products/:orderId/:productId/:userId', async (req, res) => {
    try {
        const { orderId, productId, userId } = req.params;
        const data = req.body;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        if (!data || typeof data !== 'object') {
            return res.status(400).json({ error: 'Invalid data object' });
        }

        const isDraft = data.isDraft !== undefined ? data.isDraft : false;

        // Remove isDraft from data before storing (stored separately)
        const dataToStore = { ...data };
        delete dataToStore.isDraft;
        delete dataToStore._createdAt;
        delete dataToStore._updatedAt;

        await pool.query(`
            INSERT INTO held_products (order_id, product_id, user_id, data, is_draft, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (order_id, product_id, user_id) DO UPDATE SET
                data = $4,
                is_draft = $5,
                updated_at = CURRENT_TIMESTAMP
        `, [orderId, productId, userId, JSON.stringify(dataToStore), isDraft]);

        // Notify SSE clients watching this order
        if (notifyClientsWildcard) {
            notifyClientsWildcard(`held_products/${orderId}`, {
                productId,
                userId,
                data: { ...dataToStore, isDraft }
            }, 'update');
        }

        console.log(`[REALTIME-DB] Updated held product: ${orderId}/${productId}/${userId}`);

        res.json({
            success: true,
            orderId,
            productId,
            userId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /held-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/held-products/:orderId/:productId/:userId
 * Thay thế: firebase.database().ref(`held_products/${orderId}/${productId}/${userId}`).remove()
 */
router.delete('/held-products/:orderId/:productId/:userId', async (req, res) => {
    try {
        const { orderId, productId, userId } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'DELETE FROM held_products WHERE order_id = $1 AND product_id = $2 AND user_id = $3 RETURNING *',
            [orderId, productId, userId]
        );

        // Notify SSE clients
        if (notifyClientsWildcard) {
            notifyClientsWildcard(`held_products/${orderId}`, {
                productId,
                userId,
                deleted: true
            }, 'deleted');
        }

        console.log(`[REALTIME-DB] Deleted held product: ${orderId}/${productId}/${userId}`);

        res.json({
            success: true,
            deleted: result.rowCount > 0,
            orderId,
            productId,
            userId
        });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /held-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/held-products/:orderId
 * Delete all held products for an order
 */
router.delete('/held-products/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'DELETE FROM held_products WHERE order_id = $1 RETURNING product_id, user_id',
            [orderId]
        );

        // Notify SSE clients
        if (notifyClientsWildcard) {
            notifyClientsWildcard(`held_products/${orderId}`, {
                cleared: true,
                count: result.rowCount
            }, 'deleted');
        }

        console.log(`[REALTIME-DB] Cleared ${result.rowCount} held products for order: ${orderId}`);

        res.json({
            success: true,
            deletedCount: result.rowCount,
            orderId
        });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /held-products/:orderId error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/held-products/by-product/:productId
 * Get all holders of a specific product across ALL orders
 * Used by getProductHolders() and isProductStillHeld()
 */
router.get('/held-products/by-product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const result = await pool.query(
            `SELECT order_id, product_id, user_id, data, is_draft
             FROM held_products
             WHERE product_id = $1 AND (data->>'quantity')::int > 0`,
            [String(productId)]
        );

        const holders = result.rows.map(row => ({
            name: row.data?.displayName || row.user_id,
            campaign: row.data?.campaignName || '',
            stt: row.data?.stt || '',
            quantity: parseInt(row.data?.quantity) || 0,
            orderId: row.order_id,
            userId: row.user_id,
            isDraft: row.is_draft,
        }));

        res.json({ holders });
    } catch (error) {
        console.error('[REALTIME-DB] GET /held-products/by-product error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/realtime/held-products/:orderId/:productId/:userId/draft
 * Update isDraft flag (saveHeldProducts)
 */
router.patch('/held-products/:orderId/:productId/:userId/draft', async (req, res) => {
    try {
        const { orderId, productId, userId } = req.params;
        const { isDraft } = req.body;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const result = await pool.query(
            `UPDATE held_products SET is_draft = $4, updated_at = CURRENT_TIMESTAMP
             WHERE order_id = $1 AND product_id = $2 AND user_id = $3 RETURNING *`,
            [orderId, productId, userId, isDraft !== false]
        );

        if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });

        if (notifyClientsWildcard) {
            notifyClientsWildcard(`held_products/${orderId}`, {
                productId, userId, isDraft: isDraft !== false
            }, 'update');
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[REALTIME-DB] PATCH /held-products draft error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/realtime/held-products/:orderId/:productId/:userId/quantity
 * Atomic quantity update in JSONB data
 */
router.patch('/held-products/:orderId/:productId/:userId/quantity', async (req, res) => {
    try {
        const { orderId, productId, userId } = req.params;
        const { quantity } = req.body;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        if (quantity <= 0) {
            // Remove if quantity is 0
            await pool.query(
                'DELETE FROM held_products WHERE order_id = $1 AND product_id = $2 AND user_id = $3',
                [orderId, productId, userId]
            );

            if (notifyClientsWildcard) {
                notifyClientsWildcard(`held_products/${orderId}`, {
                    productId, userId, deleted: true
                }, 'deleted');
            }

            return res.json({ success: true, deleted: true });
        }

        const result = await pool.query(
            `UPDATE held_products
             SET data = jsonb_set(data, '{quantity}', $4::text::jsonb),
                 updated_at = CURRENT_TIMESTAMP
             WHERE order_id = $1 AND product_id = $2 AND user_id = $3 RETURNING *`,
            [orderId, productId, userId, JSON.stringify(quantity)]
        );

        if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });

        if (notifyClientsWildcard) {
            notifyClientsWildcard(`held_products/${orderId}`, {
                productId, userId, quantity
            }, 'update');
        }

        res.json({ success: true, quantity });
    } catch (error) {
        console.error('[REALTIME-DB] PATCH /held-products quantity error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// KPI BASE API
// Thay thế: firebase.database().ref('kpi_base')
// =====================================================

/**
 * POST /api/realtime/kpi-base/batch
 * Batch UPSERT KPI bases (for saveAutoBaseSnapshot)
 * IMPORTANT: Must be registered BEFORE /:orderCode routes
 */
router.post('/kpi-base/batch', async (req, res) => {
    try {
        const { bases } = req.body;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        if (!Array.isArray(bases) || bases.length === 0) {
            return res.status(400).json({ error: 'bases must be a non-empty array' });
        }

        const client = await pool.connect();
        let saved = 0, skipped = 0;
        try {
            await client.query('BEGIN');
            for (const b of bases) {
                if (!b.orderCode || !b.products) { skipped++; continue; }
                const result = await client.query(`
                    INSERT INTO kpi_base (order_code, order_id, campaign_id, campaign_name, user_id, user_name, stt, products)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (order_code) DO NOTHING
                `, [b.orderCode, b.orderId || null, b.campaignId || null, b.campaignName || null,
                    b.userId || null, b.userName || null, b.stt || 0, JSON.stringify(b.products)]);
                if (result.rowCount > 0) saved++;
                else skipped++;
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            throw e;
        } finally {
            client.release();
        }

        res.json({ success: true, saved, skipped });
    } catch (error) {
        console.error('[REALTIME-DB] POST /kpi-base/batch error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/realtime/kpi-base/check-exists
 * Check which orderCodes already have BASE
 * IMPORTANT: Must be registered BEFORE /:orderCode routes
 */
router.post('/kpi-base/check-exists', async (req, res) => {
    try {
        const { orderCodes } = req.body;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        if (!Array.isArray(orderCodes) || orderCodes.length === 0) {
            return res.json({ existing: [] });
        }

        const result = await pool.query(
            'SELECT order_code FROM kpi_base WHERE order_code = ANY($1::text[])',
            [orderCodes]
        );

        res.json({ existing: result.rows.map(r => r.order_code) });
    } catch (error) {
        console.error('[REALTIME-DB] POST /kpi-base/check-exists error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/kpi-base/list-codes
 * List all order_codes for migration / bulk reprocessing.
 * Optional query: ?limit=N&offset=M (default: all)
 * IMPORTANT: Must be registered BEFORE /:orderCode routes
 */
router.get('/kpi-base/list-codes', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const limit = parseInt(req.query.limit) || null;
        const offset = parseInt(req.query.offset) || 0;

        let query = 'SELECT order_code, created_at FROM kpi_base ORDER BY created_at DESC';
        const params = [];
        if (limit) {
            query += ' LIMIT $1 OFFSET $2';
            params.push(limit, offset);
        }

        const result = await pool.query(query, params);
        const totalResult = await pool.query('SELECT COUNT(*)::int AS total FROM kpi_base');

        res.json({
            orderCodes: result.rows.map(r => r.order_code),
            total: totalResult.rows[0].total,
            returned: result.rows.length
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /kpi-base/list-codes error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/kpi-base/list-meta
 * List all kpi_base rows with full metadata (user, campaign, stt, created_at)
 * EXCEPT products[] — for dashboards/full mode display where we need to know
 * which orders have a BASE but may be missing from kpi_statistics (KPI=0).
 * Optional: ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&campaign=...
 * IMPORTANT: Must be registered BEFORE /:orderCode routes
 */
router.get('/kpi-base/list-meta', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { dateFrom, dateTo, campaign } = req.query;
        const clauses = [];
        const params = [];
        if (dateFrom) {
            params.push(dateFrom);
            clauses.push(`created_at::date >= $${params.length}`);
        }
        if (dateTo) {
            params.push(dateTo);
            clauses.push(`created_at::date <= $${params.length}`);
        }
        if (campaign) {
            params.push(campaign);
            clauses.push(`campaign_name = $${params.length}`);
        }
        const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
        const query = `
            SELECT order_code, order_id, campaign_id, campaign_name,
                   user_id, user_name, stt, created_at
            FROM kpi_base
            ${where}
            ORDER BY created_at DESC
        `;

        const result = await pool.query(query, params);

        res.json({
            bases: result.rows.map(r => ({
                orderCode: r.order_code,
                orderId: r.order_id,
                campaignId: r.campaign_id,
                campaignName: r.campaign_name,
                userId: r.user_id,
                userName: r.user_name,
                stt: r.stt,
                createdAt: r.created_at
            })),
            count: result.rows.length
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /kpi-base/list-meta error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/kpi-base/:orderCode
 * Get KPI base data by order code
 */
router.get('/kpi-base/:orderCode', async (req, res) => {
    try {
        const { orderCode } = req.params;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const result = await pool.query('SELECT * FROM kpi_base WHERE order_code = $1', [orderCode]);

        if (result.rows.length === 0) {
            return res.json({ exists: false, data: null });
        }

        const row = result.rows[0];
        res.json({
            exists: true,
            data: {
                orderCode: row.order_code,
                orderId: row.order_id,
                campaignId: row.campaign_id,
                campaignName: row.campaign_name,
                userId: row.user_id,
                userName: row.user_name,
                stt: row.stt,
                products: row.products,
                createdAt: row.created_at
            }
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /kpi-base error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/kpi-base/:orderCode
 * UPSERT single KPI base
 */
router.put('/kpi-base/:orderCode', async (req, res) => {
    try {
        const { orderCode } = req.params;
        const { orderId, campaignId, campaignName, userId, userName, stt, products } = req.body;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        if (!products || !Array.isArray(products)) {
            return res.status(400).json({ error: 'products must be an array' });
        }

        await pool.query(`
            INSERT INTO kpi_base (order_code, order_id, campaign_id, campaign_name, user_id, user_name, stt, products)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (order_code) DO UPDATE SET
                stt = EXCLUDED.stt
        `, [orderCode, orderId, campaignId, campaignName, userId, userName, stt || 0, JSON.stringify(products)]);

        res.json({ success: true, orderCode });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /kpi-base error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/kpi-base/:orderCode
 */
router.delete('/kpi-base/:orderCode', async (req, res) => {
    try {
        const { orderCode } = req.params;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const result = await pool.query('DELETE FROM kpi_base WHERE order_code = $1', [orderCode]);
        res.json({ success: true, deleted: result.rowCount > 0 });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /kpi-base error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// KPI AUDIT LOG API
// =====================================================

/**
 * POST /api/realtime/kpi-audit-log
 * Log a single product action
 */
router.post('/kpi-audit-log', async (req, res) => {
    try {
        const { orderCode, orderId, action, productId, productCode, productName,
                quantity, source, userId, userName, campaignId, campaignName, outOfRange } = req.body;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        if (!orderCode || !action || !productCode) {
            return res.status(400).json({ error: 'orderCode, action, productCode required' });
        }

        // Dedup: skip if identical log exists within last 5 seconds
        const dedup = await pool.query(`
            SELECT id FROM kpi_audit_log
            WHERE order_code = $1 AND product_id = $2 AND action = $3 AND source = $4 AND quantity = $5
              AND created_at > NOW() - INTERVAL '5 seconds'
            LIMIT 1
        `, [orderCode, productId, action, source, quantity || 1]);

        if (dedup.rows.length > 0) {
            return res.json({ success: true, id: dedup.rows[0].id, deduplicated: true });
        }

        const result = await pool.query(`
            INSERT INTO kpi_audit_log (order_code, order_id, action, product_id, product_code, product_name,
                quantity, source, user_id, user_name, campaign_id, campaign_name, out_of_range)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id
        `, [orderCode, orderId, action, productId, productCode, productName || '',
            quantity || 1, source, userId, userName, campaignId, campaignName, outOfRange || false]);

        res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error('[REALTIME-DB] POST /kpi-audit-log error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/realtime/kpi-audit-log/batch
 * Batch log multiple entries (offline queue flush)
 */
router.post('/kpi-audit-log/batch', async (req, res) => {
    try {
        const { entries } = req.body;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        if (!Array.isArray(entries) || entries.length === 0) {
            return res.json({ success: true, count: 0 });
        }

        if (entries.length > 500) {
            return res.status(400).json({ error: 'Batch size exceeds limit of 500 entries' });
        }

        const client = await pool.connect();
        let count = 0;
        try {
            await client.query('BEGIN');
            for (const e of entries) {
                if (!e.orderCode || !e.action || !e.productCode) continue;
                await client.query(`
                    INSERT INTO kpi_audit_log (order_code, order_id, action, product_id, product_code, product_name,
                        quantity, source, user_id, user_name, campaign_id, campaign_name, out_of_range)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                `, [e.orderCode, e.orderId, e.action, e.productId, e.productCode, e.productName || '',
                    e.quantity || 1, e.source, e.userId, e.userName, e.campaignId, e.campaignName, e.outOfRange || false]);
                count++;
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            throw e;
        } finally {
            client.release();
        }

        res.json({ success: true, count });
    } catch (error) {
        console.error('[REALTIME-DB] POST /kpi-audit-log/batch error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/kpi-audit-log/:orderCode
 * Get all audit logs for an order (sorted by created_at ASC)
 */
router.get('/kpi-audit-log/:orderCode', async (req, res) => {
    try {
        const { orderCode } = req.params;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const result = await pool.query(
            'SELECT * FROM kpi_audit_log WHERE order_code = $1 ORDER BY created_at ASC',
            [orderCode]
        );

        res.json({
            logs: result.rows.map(r => ({
                id: r.id,
                orderCode: r.order_code,
                orderId: r.order_id,
                action: r.action,
                productId: r.product_id,
                productCode: r.product_code,
                productName: r.product_name,
                quantity: r.quantity,
                source: r.source,
                userId: r.user_id,
                userName: r.user_name,
                campaignId: r.campaign_id,
                campaignName: r.campaign_name,
                outOfRange: r.out_of_range,
                createdAt: r.created_at
            }))
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /kpi-audit-log error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// KPI SALE FLAG API
// Per-product-line: sale tự đánh dấu SP là "bán hàng thật" để tính KPI
// =====================================================

/**
 * GET /api/realtime/kpi-sale-flag/:orderCode
 * Trả về danh sách flags cho mọi product_id đã được user đánh dấu.
 * Không có row nào → [] (mọi SP mặc định FALSE = không tính KPI với orders post-cutoff).
 */
router.get('/kpi-sale-flag/:orderCode', async (req, res) => {
    try {
        const { orderCode } = req.params;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const result = await pool.query(
            `SELECT order_code, product_id, is_sale_product, set_by_user_id, set_by_user_name, updated_at
             FROM kpi_sale_flag WHERE order_code = $1`,
            [orderCode]
        );

        res.json({
            flags: result.rows.map(r => ({
                orderCode: r.order_code,
                productId: Number(r.product_id),
                isSaleProduct: r.is_sale_product,
                setByUserId: r.set_by_user_id,
                setByUserName: r.set_by_user_name,
                updatedAt: r.updated_at
            }))
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /kpi-sale-flag error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/kpi-sale-flag/:orderCode/:productId
 * Body: { isSaleProduct: boolean, userId?: string, userName?: string }
 * Upsert flag cho một line. Trả về row mới.
 */
router.put('/kpi-sale-flag/:orderCode/:productId', async (req, res) => {
    try {
        const { orderCode, productId } = req.params;
        const { isSaleProduct, userId, userName } = req.body || {};
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        if (typeof isSaleProduct !== 'boolean') {
            return res.status(400).json({ error: 'isSaleProduct must be boolean' });
        }
        const pid = Number(productId);
        if (!Number.isFinite(pid) || pid <= 0) {
            return res.status(400).json({ error: 'Invalid productId' });
        }

        const result = await pool.query(
            `INSERT INTO kpi_sale_flag (order_code, product_id, is_sale_product, set_by_user_id, set_by_user_name, updated_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
             ON CONFLICT (order_code, product_id) DO UPDATE SET
               is_sale_product = EXCLUDED.is_sale_product,
               set_by_user_id = EXCLUDED.set_by_user_id,
               set_by_user_name = EXCLUDED.set_by_user_name,
               updated_at = CURRENT_TIMESTAMP
             RETURNING order_code, product_id, is_sale_product, set_by_user_id, set_by_user_name, updated_at`,
            [orderCode, pid, isSaleProduct, userId || null, userName || null]
        );

        const row = result.rows[0];
        res.json({
            success: true,
            flag: {
                orderCode: row.order_code,
                productId: Number(row.product_id),
                isSaleProduct: row.is_sale_product,
                setByUserId: row.set_by_user_id,
                setByUserName: row.set_by_user_name,
                updatedAt: row.updated_at
            }
        });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /kpi-sale-flag error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/kpi-sale-flag/:orderCode/:productId
 * Xóa flag cho một line (reset về default FALSE).
 */
router.delete('/kpi-sale-flag/:orderCode/:productId', async (req, res) => {
    try {
        const { orderCode, productId } = req.params;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const pid = Number(productId);
        if (!Number.isFinite(pid) || pid <= 0) {
            return res.status(400).json({ error: 'Invalid productId' });
        }

        const result = await pool.query(
            'DELETE FROM kpi_sale_flag WHERE order_code = $1 AND product_id = $2',
            [orderCode, pid]
        );

        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /kpi-sale-flag error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// REPORT ORDER DETAILS API
// =====================================================

/**
 * GET /api/realtime/report-order-details/:tableName
 * Get cached order details for a specific campaign/table
 */
router.get('/report-order-details/:tableName', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const result = await pool.query(
            'SELECT orders FROM report_order_details WHERE table_name = $1',
            [req.params.tableName]
        );

        if (result.rows.length === 0) {
            return res.json({ exists: false, orders: [] });
        }

        res.json({ exists: true, orders: result.rows[0].orders || [] });
    } catch (error) {
        console.error('[REALTIME-DB] GET /report-order-details error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// KPI STATISTICS API
// =====================================================

/**
 * GET /api/realtime/kpi-statistics
 * Get ALL KPI statistics (for KPI tab display - replaces N+1 Firestore queries)
 */
router.get('/kpi-statistics', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        // Optional date filters: ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
        const { dateFrom, dateTo } = req.query;
        const params = [];
        const conditions = [];
        if (dateFrom) { params.push(dateFrom); conditions.push(`stat_date >= $${params.length}`); }
        if (dateTo) { params.push(dateTo); conditions.push(`stat_date <= $${params.length}`); }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await pool.query(
            `SELECT user_id, user_name, stat_date, total_net_products, total_kpi, orders, updated_at FROM kpi_statistics ${where} ORDER BY stat_date DESC, user_id`,
            params
        );

        res.json({
            statistics: result.rows.map(r => ({
                userId: r.user_id,
                userName: r.user_name,
                date: r.stat_date,
                totalNetProducts: r.total_net_products,
                totalKPI: parseFloat(r.total_kpi),
                orders: r.orders || [],
                updatedAt: r.updated_at
            }))
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /kpi-statistics error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/kpi-statistics/:userId/:date
 * Get KPI statistics for specific user and date
 */
router.get('/kpi-statistics/:userId/:date', async (req, res) => {
    try {
        const { userId, date } = req.params;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const result = await pool.query(
            'SELECT * FROM kpi_statistics WHERE user_id = $1 AND stat_date = $2',
            [userId, date]
        );

        if (result.rows.length === 0) {
            return res.json({ exists: false, data: null });
        }

        const r = result.rows[0];
        res.json({
            exists: true,
            data: {
                userId: r.user_id,
                userName: r.user_name,
                date: r.stat_date,
                totalNetProducts: r.total_net_products,
                totalKPI: parseFloat(r.total_kpi),
                orders: r.orders || []
            }
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /kpi-statistics/:userId/:date error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/kpi-statistics/:userId/:date
 * UPSERT KPI statistics for user on date
 */
router.put('/kpi-statistics/:userId/:date', async (req, res) => {
    try {
        const { userId, date } = req.params;
        const { userName, totalNetProducts, totalKPI, orders } = req.body;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        await pool.query(`
            INSERT INTO kpi_statistics (user_id, user_name, stat_date, total_net_products, total_kpi, orders, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, stat_date) DO UPDATE SET
                user_name = COALESCE($2, kpi_statistics.user_name),
                total_net_products = $4,
                total_kpi = $5,
                orders = $6,
                updated_at = CURRENT_TIMESTAMP
        `, [userId, userName || null, date, totalNetProducts || 0, totalKPI || 0, JSON.stringify(orders || [])]);

        res.json({ success: true, userId, date });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /kpi-statistics error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/realtime/kpi-statistics/:userId/:date/order
 * Atomic upsert of a single order in the statistics JSONB array.
 * Prevents race conditions from concurrent client-side read-modify-write.
 */
router.patch('/kpi-statistics/:userId/:date/order', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'Database not available' });

    const { userId, date } = req.params;
    const { orderCode, orderId, stt, campaignName, netProducts, kpi,
            hasDiscrepancy, details, userName } = req.body;

    if (!orderCode) return res.status(400).json({ error: 'orderCode required' });

    const client = await pool.connect();
    try {
        const orderObj = JSON.stringify({
            orderCode, orderId: orderId || null, stt: stt || 0,
            campaignName: campaignName || null,
            netProducts: netProducts || 0, kpi: kpi || 0,
            hasDiscrepancy: hasDiscrepancy || false,
            details: details || {},
            updatedAt: new Date().toISOString()
        });

        // Atomic: upsert row, then upsert order within JSONB array, recalc totals
        await client.query('BEGIN');

        // Ensure row exists
        await client.query(`
            INSERT INTO kpi_statistics (user_id, user_name, stat_date, total_net_products, total_kpi, orders)
            VALUES ($1, $2, $3, 0, 0, '[]')
            ON CONFLICT (user_id, stat_date) DO UPDATE SET
                user_name = COALESCE($2, kpi_statistics.user_name)
        `, [userId, userName || null, date]);

        // Remove old entry for this orderCode (if exists), then append new one
        await client.query(`
            UPDATE kpi_statistics
            SET orders = (
                SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                FROM jsonb_array_elements(orders) elem
                WHERE elem->>'orderCode' != $2
            ) || $3::jsonb
            WHERE user_id = $1 AND stat_date = $4
        `, [userId, orderCode, `[${orderObj}]`, date]);

        // Recalculate totals from the orders array
        await client.query(`
            UPDATE kpi_statistics
            SET total_net_products = COALESCE((
                    SELECT SUM((elem->>'netProducts')::int)
                    FROM jsonb_array_elements(orders) elem
                ), 0),
                total_kpi = COALESCE((
                    SELECT SUM((elem->>'kpi')::numeric)
                    FROM jsonb_array_elements(orders) elem
                ), 0),
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1 AND stat_date = $2
        `, [userId, date]);

        await client.query('COMMIT');
        res.json({ success: true, userId, date, orderCode });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[REALTIME-DB] PATCH /kpi-statistics order error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

/**
 * DELETE /api/realtime/kpi-statistics/order/:orderCode
 * Xoá orderCode khỏi mảng orders[] của MỌI (userId, stat_date) row — dùng cho
 * backfill cleanup: sau khi recompute xong ta gọi endpoint này TRƯỚC để dẹp
 * các row cũ cho orderCode đó, rồi PATCH ghi lại vào đúng (userId, baseDate).
 *
 * Cũng recompute total_net_products + total_kpi từ orders[] còn lại.
 * Trả về số row bị affected + số entry đã xoá.
 */
router.delete('/kpi-statistics/order/:orderCode', async (req, res) => {
    try {
        const { orderCode } = req.params;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        if (!orderCode) return res.status(400).json({ error: 'orderCode required' });

        // Single atomic UPDATE: strip orderCode từ orders[] + recompute totals
        // từ mảng CÒN LẠI (không dùng updated_at hack, không race condition).
        const result = await pool.query(`
            WITH filtered AS (
                SELECT id,
                       COALESCE((
                           SELECT jsonb_agg(elem)
                           FROM jsonb_array_elements(orders) elem
                           WHERE elem->>'orderCode' != $1
                       ), '[]'::jsonb) AS new_orders
                FROM kpi_statistics
                WHERE orders @> $2::jsonb
            )
            UPDATE kpi_statistics k
            SET orders = f.new_orders,
                total_net_products = COALESCE((
                    SELECT SUM((elem->>'netProducts')::int)
                    FROM jsonb_array_elements(f.new_orders) elem
                ), 0),
                total_kpi = COALESCE((
                    SELECT SUM((elem->>'kpi')::numeric)
                    FROM jsonb_array_elements(f.new_orders) elem
                ), 0),
                updated_at = CURRENT_TIMESTAMP
            FROM filtered f
            WHERE k.id = f.id
        `, [orderCode, JSON.stringify([{ orderCode }])]);

        res.json({ success: true, orderCode, rowsAffected: result.rowCount });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /kpi-statistics/order error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/kpi-statistics/:userId/:date
 */
router.delete('/kpi-statistics/:userId/:date', async (req, res) => {
    try {
        const { userId, date } = req.params;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const result = await pool.query(
            'DELETE FROM kpi_statistics WHERE user_id = $1 AND stat_date = $2',
            [userId, date]
        );
        res.json({ success: true, deleted: result.rowCount > 0 });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /kpi-statistics error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/realtime/kpi-statistics/recalculate-assignments
 * Re-assign all KPI orders to correct employees based on STT ranges.
 * Fixes data where orders were assigned to wrong userId (e.g. bulk sender).
 * Safe: only moves orders between userIds, does not change netProducts/kpi values.
 */
router.post('/kpi-statistics/recalculate-assignments', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        // 1. Load employee ranges for all campaigns
        let rangeRows;
        try {
            const r = await pool.query('SELECT campaign_name, employee_ranges FROM campaign_employee_ranges');
            rangeRows = r.rows;
        } catch (e) {
            rangeRows = [];
        }

        const rangesByCampaign = {};
        for (const row of rangeRows) {
            rangesByCampaign[row.campaign_name] = row.employee_ranges || [];
        }

        // Helper: find employee for STT + campaignName
        function findEmployee(stt, campaignName) {
            if (!stt) return null;
            const sttNum = Number(stt);
            // Campaign-specific first
            const safeName = campaignName ? campaignName.replace(/[.$#\[\]\/]/g, '_') : null;
            if (safeName && rangesByCampaign[safeName]) {
                for (const r of rangesByCampaign[safeName]) {
                    const from = r.fromSTT || r.from || r.start || 0;
                    const to = r.toSTT || r.to || r.end || Infinity;
                    if (sttNum >= from && sttNum <= to) {
                        return { userId: r.userId || r.id, userName: r.userName || r.name };
                    }
                }
            }
            // Fallback: search all campaigns
            for (const ranges of Object.values(rangesByCampaign)) {
                for (const r of ranges) {
                    const from = r.fromSTT || r.from || r.start || 0;
                    const to = r.toSTT || r.to || r.end || Infinity;
                    if (sttNum >= from && sttNum <= to) {
                        return { userId: r.userId || r.id, userName: r.userName || r.name };
                    }
                }
            }
            return null;
        }

        // 2. Load all kpi_base entries (for STT + campaignName lookup)
        const baseResult = await pool.query('SELECT order_code, stt, campaign_name FROM kpi_base');
        const baseMap = {};
        for (const b of baseResult.rows) {
            baseMap[b.order_code] = { stt: b.stt, campaignName: b.campaign_name };
        }

        // 3. Load all kpi_statistics
        const statsResult = await pool.query('SELECT id, user_id, user_name, stat_date, orders FROM kpi_statistics');

        // 4. Find misassigned orders — use row ID to avoid timezone issues
        const moves = []; // { order, fromRowId, fromUserId, fromDate, toUserId, toUserName }
        for (const row of statsResult.rows) {
            const orders = row.orders || [];
            for (const order of orders) {
                const base = baseMap[order.orderCode];
                if (!base || !base.stt) continue;

                const correctEmployee = findEmployee(base.stt, base.campaignName || order.campaignName);
                if (!correctEmployee) continue;
                if (correctEmployee.userId === row.user_id) continue; // Already correct

                moves.push({
                    order,
                    fromRowId: row.id,
                    fromUserId: row.user_id,
                    fromDate: row.stat_date,
                    toUserId: correctEmployee.userId,
                    toUserName: correctEmployee.userName
                });
            }
        }

        // 5. Execute moves + dedup in a transaction
        const client = await pool.connect();
        let moved = 0;
        try {
            await client.query('BEGIN');

            for (const m of moves) {
                const orderObj = JSON.stringify({ ...m.order, updatedAt: new Date().toISOString() });

                // Remove from old row using row ID (avoids timezone date mismatch)
                await client.query(`
                    UPDATE kpi_statistics
                    SET orders = COALESCE((
                        SELECT jsonb_agg(elem) FROM jsonb_array_elements(orders) elem
                        WHERE elem->>'orderCode' != $2
                    ), '[]'::jsonb)
                    WHERE id = $1
                `, [m.fromRowId, m.order.orderCode]);

                // Get the actual stat_date from the source row for the target
                const dateResult = await client.query(
                    'SELECT stat_date FROM kpi_statistics WHERE id = $1', [m.fromRowId]
                );
                const statDate = dateResult.rows[0]?.stat_date;
                if (!statDate) continue;

                // Add to correct userId (ensure row exists)
                await client.query(`
                    INSERT INTO kpi_statistics (user_id, user_name, stat_date, total_net_products, total_kpi, orders)
                    VALUES ($1, $2, $3, 0, 0, '[]')
                    ON CONFLICT (user_id, stat_date) DO UPDATE SET
                        user_name = COALESCE($2, kpi_statistics.user_name)
                `, [m.toUserId, m.toUserName, statDate]);

                await client.query(`
                    UPDATE kpi_statistics
                    SET orders = orders || $2::jsonb
                    WHERE user_id = $1 AND stat_date = $3
                `, [m.toUserId, `[${orderObj}]`, statDate]);

                moved++;
            }

            // 6. Recalculate totals for ALL rows (not just affected userIds)
            await client.query(`
                UPDATE kpi_statistics
                SET total_net_products = COALESCE((
                        SELECT SUM((elem->>'netProducts')::int)
                        FROM jsonb_array_elements(orders) elem
                    ), 0),
                    total_kpi = COALESCE((
                        SELECT SUM((elem->>'kpi')::numeric)
                        FROM jsonb_array_elements(orders) elem
                    ), 0),
                    updated_at = CURRENT_TIMESTAMP
            `);

            // 7. Deduplicate orders within each row (keep latest by updatedAt)
            await client.query(`
                UPDATE kpi_statistics
                SET orders = sub.deduped
                FROM (
                    SELECT s.id,
                        COALESCE(
                            (SELECT jsonb_agg(val ORDER BY (val->>'updatedAt') DESC)
                             FROM (
                                SELECT DISTINCT ON (elem->>'orderCode') elem AS val
                                FROM jsonb_array_elements(s.orders) elem
                                ORDER BY elem->>'orderCode', elem->>'updatedAt' DESC
                             ) deduped_inner),
                            '[]'::jsonb
                        ) AS deduped
                    FROM kpi_statistics s
                    WHERE jsonb_array_length(s.orders) > 0
                ) sub
                WHERE kpi_statistics.id = sub.id
            `);

            // 8. Recalculate totals after dedup
            await client.query(`
                UPDATE kpi_statistics
                SET total_net_products = COALESCE((
                        SELECT SUM((elem->>'netProducts')::int)
                        FROM jsonb_array_elements(orders) elem
                    ), 0),
                    total_kpi = COALESCE((
                        SELECT SUM((elem->>'kpi')::numeric)
                        FROM jsonb_array_elements(orders) elem
                    ), 0),
                    updated_at = CURRENT_TIMESTAMP
            `);

            // 9. Clean up empty rows (no orders left)
            await client.query(`
                DELETE FROM kpi_statistics WHERE orders = '[]'::jsonb OR orders IS NULL
            `);

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            throw e;
        } finally {
            client.release();
        }

        res.json({
            success: true,
            moved,
            totalRanges: rangeRows.length,
            totalBases: baseResult.rows.length,
            details: moves.map(m => ({
                orderCode: m.order.orderCode,
                stt: m.order.stt,
                from: m.fromUserId,
                to: m.toUserId
            }))
        });
    } catch (error) {
        console.error('[REALTIME-DB] POST /kpi-statistics/recalculate-assignments error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// TAG UPDATES API (Multi-User Realtime Tag Sync)
// =====================================================

/**
 * GET /api/realtime/tag-updates/:orderId
 * Get latest tag update for an order
 */
router.get('/tag-updates/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'SELECT * FROM tag_updates WHERE order_id = $1 ORDER BY updated_at DESC LIMIT 1',
            [orderId]
        );

        if (result.rows.length === 0) {
            return res.json({ exists: false, data: null });
        }

        const row = result.rows[0];
        res.json({
            exists: true,
            data: {
                orderId: row.order_id,
                orderCode: row.order_code,
                stt: row.stt,
                tags: row.tags,
                updatedBy: row.updated_by,
                timestamp: row.updated_at
            }
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /tag-updates error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/tag-updates/:orderId
 * Update tags for an order
 */
router.put('/tag-updates/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { orderCode, stt, tags, updatedBy } = req.body;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        if (!tags || !Array.isArray(tags)) {
            return res.status(400).json({ error: 'tags must be an array' });
        }

        await pool.query(`
            INSERT INTO tag_updates (order_id, order_code, stt, tags, updated_by, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [orderId, orderCode, stt, JSON.stringify(tags), updatedBy]);

        // Notify SSE clients
        if (notifyClientsWildcard) {
            notifyClientsWildcard(`tag_updates/${orderId}`, {
                orderId,
                orderCode,
                stt,
                tags,
                updatedBy,
                timestamp: Date.now()
            }, 'update');
        }

        console.log(`[REALTIME-DB] Tag update for order: ${orderId} by ${updatedBy}`);

        res.json({ success: true, orderId });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /tag-updates error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/tag-updates/since/:timestamp
 * Get all tag updates since a timestamp (for polling)
 */
router.get('/tag-updates/since/:timestamp', async (req, res) => {
    try {
        const { timestamp } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const sinceDate = new Date(parseInt(timestamp));
        const result = await pool.query(
            'SELECT * FROM tag_updates WHERE updated_at > $1 ORDER BY updated_at DESC LIMIT 100',
            [sinceDate]
        );

        res.json({
            success: true,
            updates: result.rows.map(row => ({
                orderId: row.order_id,
                orderCode: row.order_code,
                stt: row.stt,
                tags: row.tags,
                updatedBy: row.updated_by,
                timestamp: row.updated_at
            }))
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /tag-updates/since error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// DROPPED PRODUCTS API (Multi-User Collaboration)
// Replaced Firebase Realtime DB → PostgreSQL + SSE
// =====================================================

/**
 * Helper: convert PG row to Firebase-compatible object
 */
function droppedRowToObj(row) {
    return {
        ProductId: row.product_id,
        ProductCode: row.product_code,
        ProductName: row.product_name,
        ProductNameGet: row.product_name_get,
        ImageUrl: row.image_url,
        Price: row.price ? parseFloat(row.price) : 0,
        Quantity: row.quantity || 0,
        UOMName: row.uom_name || 'Cái',
        reason: row.reason,
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        removedBy: row.removed_by,
        removedFromOrderSTT: row.removed_from_order_stt,
        removedFromCustomer: row.removed_from_customer,
        removedAt: row.removed_at,
        addedDate: row.added_date,
        addedAt: row.created_at ? new Date(row.created_at).getTime() : null,
        orderContext: row.order_context || null,
    };
}

/**
 * GET /api/realtime/dropped-products
 * Only returns products from the 2 most recent campaigns.
 * Products without a campaign_id are always included.
 * Use ?all=1 to bypass the filter and return everything.
 */
router.get('/dropped-products', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        // Fetch 2 latest campaigns (always needed for the label)
        const campaignResult = await pool.query(
            'SELECT id, name FROM campaigns ORDER BY created_at DESC LIMIT 2'
        );
        const latestCampaigns = campaignResult.rows;
        const latestIds = latestCampaigns.map(c => c.id);

        let result;
        if (req.query.all === '1') {
            result = await pool.query(
                'SELECT * FROM dropped_products ORDER BY created_at DESC LIMIT 500'
            );
        } else {
            // Only return products from the 2 most recent campaigns
            result = await pool.query(`
                SELECT * FROM dropped_products
                WHERE campaign_id IS NULL
                   OR campaign_id = ''
                   OR campaign_id = ANY($1)
                ORDER BY created_at DESC
                LIMIT 500
            `, [latestIds]);
        }

        // Return Firebase-like structure: { [id]: { ...data } }
        const products = {};
        result.rows.forEach(row => {
            products[row.id] = droppedRowToObj(row);
        });

        res.json({
            products,
            latestCampaigns: latestCampaigns.map(c => ({ id: c.id, name: c.name }))
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /dropped-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/dropped-products/:id
 * Add or update a dropped product (full upsert)
 */
router.put('/dropped-products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const b = req.body;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        await pool.query(`
            INSERT INTO dropped_products (
                id, product_id, product_code, product_name, product_name_get,
                image_url, price, quantity, uom_name, reason,
                campaign_id, campaign_name, removed_by, removed_from_order_stt,
                removed_from_customer, removed_at, added_date, order_context,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10,
                $11, $12, $13, $14,
                $15, $16, $17, $18,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            ON CONFLICT (id) DO UPDATE SET
                product_id = COALESCE($2, dropped_products.product_id),
                product_code = COALESCE($3, dropped_products.product_code),
                product_name = COALESCE($4, dropped_products.product_name),
                product_name_get = COALESCE($5, dropped_products.product_name_get),
                image_url = COALESCE($6, dropped_products.image_url),
                price = COALESCE($7, dropped_products.price),
                quantity = $8,
                uom_name = COALESCE($9, dropped_products.uom_name),
                reason = COALESCE($10, dropped_products.reason),
                campaign_id = COALESCE($11, dropped_products.campaign_id),
                campaign_name = COALESCE($12, dropped_products.campaign_name),
                removed_by = COALESCE($13, dropped_products.removed_by),
                removed_from_order_stt = COALESCE($14, dropped_products.removed_from_order_stt),
                removed_from_customer = COALESCE($15, dropped_products.removed_from_customer),
                removed_at = COALESCE($16, dropped_products.removed_at),
                added_date = COALESCE($17, dropped_products.added_date),
                order_context = COALESCE($18, dropped_products.order_context),
                updated_at = CURRENT_TIMESTAMP
        `, [
            id,
            b.ProductId || b.productId || null,
            b.ProductCode || b.productCode || null,
            b.ProductName || b.productName || null,
            b.ProductNameGet || b.productNameGet || null,
            b.ImageUrl || b.imageUrl || null,
            b.Price || b.price || 0,
            b.Quantity != null ? b.Quantity : (b.quantity != null ? b.quantity : 1),
            b.UOMName || b.uomName || 'Cái',
            b.reason || null,
            b.campaignId || null,
            b.campaignName || null,
            b.removedBy || null,
            b.removedFromOrderSTT || null,
            b.removedFromCustomer || null,
            b.removedAt || b.removedAt === 0 ? b.removedAt : null,
            b.addedDate || new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            b.orderContext ? JSON.stringify(b.orderContext) : null,
        ]);

        const sseData = { id, ...b };
        if (notifyClients) notifyClients('dropped_products', sseData, 'update');

        res.json({ success: true, id });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /dropped-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/realtime/dropped-products/:id/quantity
 * Atomic quantity update (replaces Firebase transaction)
 * Body: { change: +1/-1 } or { value: 5 }
 */
router.patch('/dropped-products/:id/quantity', async (req, res) => {
    try {
        const { id } = req.params;
        const { change, value, reason, removedBy, removedFromOrderSTT, removedFromCustomer, removedAt } = req.body;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        let result;
        const extraSets = [];
        const extraParams = [];
        let paramIdx = 2; // $1 = id

        if (reason) { extraSets.push(`reason = $${++paramIdx}`); extraParams.push(reason); }
        if (removedBy) { extraSets.push(`removed_by = $${++paramIdx}`); extraParams.push(removedBy); }
        if (removedFromOrderSTT) { extraSets.push(`removed_from_order_stt = $${++paramIdx}`); extraParams.push(removedFromOrderSTT); }
        if (removedFromCustomer) { extraSets.push(`removed_from_customer = $${++paramIdx}`); extraParams.push(removedFromCustomer); }
        if (removedAt != null) { extraSets.push(`removed_at = $${++paramIdx}`); extraParams.push(removedAt); }

        const extraSetStr = extraSets.length > 0 ? ', ' + extraSets.join(', ') : '';

        if (value != null) {
            // Set absolute value
            result = await pool.query(
                `UPDATE dropped_products SET quantity = $2${extraSetStr}, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 RETURNING *`,
                [id, Math.max(0, parseInt(value)), ...extraParams]
            );
        } else if (change != null) {
            // Atomic increment/decrement
            result = await pool.query(
                `UPDATE dropped_products SET quantity = GREATEST(0, quantity + $2)${extraSetStr}, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 RETURNING *`,
                [id, parseInt(change), ...extraParams]
            );
        } else {
            return res.status(400).json({ error: 'Provide "change" or "value"' });
        }

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const row = result.rows[0];
        const sseData = { id, ...droppedRowToObj(row) };
        if (notifyClients) notifyClients('dropped_products', sseData, 'update');

        res.json({ success: true, id, quantity: row.quantity });
    } catch (error) {
        console.error('[REALTIME-DB] PATCH /dropped-products quantity error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/realtime/dropped-products/:id
 * Update specific fields of a dropped product (partial update)
 */
router.patch('/dropped-products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const b = req.body;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const sets = [];
        const params = [id];
        let idx = 1;

        const fieldMap = {
            campaignId: 'campaign_id', campaignName: 'campaign_name',
            reason: 'reason', removedBy: 'removed_by',
            removedFromOrderSTT: 'removed_from_order_stt',
            removedFromCustomer: 'removed_from_customer',
            removedAt: 'removed_at', addedDate: 'added_date',
        };

        for (const [jsKey, pgCol] of Object.entries(fieldMap)) {
            if (b[jsKey] !== undefined) {
                sets.push(`${pgCol} = $${++idx}`);
                params.push(b[jsKey]);
            }
        }

        if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

        const result = await pool.query(
            `UPDATE dropped_products SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
            params
        );

        if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });

        const row = result.rows[0];
        if (notifyClients) notifyClients('dropped_products', { id, ...droppedRowToObj(row) }, 'update');

        res.json({ success: true, id });
    } catch (error) {
        console.error('[REALTIME-DB] PATCH /dropped-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/dropped-products/all
 * Clear all dropped products
 * NOTE: This route MUST be before /:id to avoid matching "all" as an id
 */
router.delete('/dropped-products/all', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const result = await pool.query('DELETE FROM dropped_products RETURNING id');

        if (notifyClients) notifyClients('dropped_products', { cleared: true, count: result.rowCount }, 'deleted');

        console.log(`[REALTIME-DB] Cleared all ${result.rowCount} dropped products`);
        res.json({ success: true, deletedCount: result.rowCount });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /dropped-products/all error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/dropped-products/:id
 * Remove a single dropped product
 */
router.delete('/dropped-products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const result = await pool.query(
            'DELETE FROM dropped_products WHERE id = $1 RETURNING *',
            [id]
        );

        if (notifyClients) {
            notifyClients('dropped_products', { id, deleted: true }, 'deleted');
        }

        console.log(`[REALTIME-DB] Dropped product deleted: ${id}`);
        res.json({ success: true, deleted: result.rowCount > 0 });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /dropped-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// NOTE SNAPSHOTS API (Note Edit Tracking)
// =====================================================

/**
 * GET /api/realtime/note-snapshots/:orderId
 * Get note snapshot for an order
 */
router.get('/note-snapshots/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'SELECT * FROM note_snapshots WHERE order_id = $1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)',
            [orderId]
        );

        if (result.rows.length === 0) {
            return res.json({ exists: false, data: null });
        }

        const row = result.rows[0];
        res.json({
            exists: true,
            data: {
                orderId: row.order_id,
                noteText: row.note_text,
                encodedProducts: row.encoded_products,
                snapshotHash: row.snapshot_hash,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                expiresAt: row.expires_at
            }
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /note-snapshots error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/note-snapshots/:orderId
 * Save note snapshot (auto-expire after 7 days)
 */
router.put('/note-snapshots/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { noteText, encodedProducts, snapshotHash } = req.body;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        // Set expiration to 7 days from now
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await pool.query(`
            INSERT INTO note_snapshots (order_id, note_text, encoded_products, snapshot_hash, created_at, updated_at, expires_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $5)
            ON CONFLICT (order_id) DO UPDATE SET
                note_text = $2,
                encoded_products = $3,
                snapshot_hash = $4,
                updated_at = CURRENT_TIMESTAMP,
                expires_at = $5
        `, [orderId, noteText, encodedProducts, snapshotHash, expiresAt]);

        console.log(`[REALTIME-DB] Note snapshot saved for order: ${orderId}`);

        res.json({ success: true, orderId, expiresAt });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /note-snapshots error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/note-snapshots/cleanup
 * Cleanup expired snapshots
 */
router.delete('/note-snapshots/cleanup', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'DELETE FROM note_snapshots WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP RETURNING order_id'
        );

        console.log(`[REALTIME-DB] Cleaned up ${result.rowCount} expired note snapshots`);

        res.json({
            success: true,
            deletedCount: result.rowCount
        });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /note-snapshots/cleanup error:', error);
        res.status(500).json({ error: error.message });
    }
});


// =====================================================
// PROCESSING TAGS API
// Tag xử lý chốt đơn — per campaign, per order
// =====================================================

/**
 * GET /api/realtime/processing-tags/debug-config
 * Debug endpoint: show all config records + orphaned tTags + orphaned custom flags
 * Query param: ?repair=true → auto-repair orphans
 */
router.get('/processing-tags/debug-config', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        const autoRepair = req.query.repair === 'true';

        // Get config records (use order_code, which is the actual key)
        const configResult = await pool.query(
            `SELECT id, order_code, data, updated_by, updated_at
             FROM processing_tags
             WHERE order_code LIKE '\\_%' ESCAPE '\\'
             ORDER BY order_code, updated_at DESC`
        );

        const records = configResult.rows.map(r => ({
            id: r.id,
            order_code: r.order_code,
            tTagDefinitions_count: r.data?.tTagDefinitions?.length || 0,
            tTagDefinitions_ids: (r.data?.tTagDefinitions || []).map(d => `${d.id}:${d.name}`),
            customFlagDefs_count: r.data?.customFlagDefs?.length || 0,
            customFlagDefs_ids: (r.data?.customFlagDefs || []).map(d => `${d.id}:${d.label}`),
            updated_by: r.updated_by,
            updated_at: r.updated_at
        }));

        // --- Orphaned T-tags ---
        const ttagResult = await pool.query(
            `SELECT DISTINCT jsonb_array_elements_text(data->'tTags') as tag_id
             FROM processing_tags
             WHERE data ? 'tTags' AND jsonb_array_length(data->'tTags') > 0
             AND order_code NOT LIKE '\\_%' ESCAPE '\\'`
        );
        const usedTagIds = ttagResult.rows.map(r => r.tag_id);
        const configRow = configResult.rows.find(r => r.order_code === '__ttag_config__');
        const definedTTagIds = new Set((configRow?.data?.tTagDefinitions || []).map(d => d.id));
        const orphanedTTags = usedTagIds.filter(id => !definedTTagIds.has(id));

        // --- Orphaned Custom Flags ---
        const flagResult = await pool.query(
            `SELECT DISTINCT jsonb_array_elements_text(data->'flags') as flag_id
             FROM processing_tags
             WHERE data ? 'flags' AND jsonb_array_length(data->'flags') > 0
             AND order_code NOT LIKE '\\_%' ESCAPE '\\'`
        );
        const usedFlagIds = flagResult.rows.map(r => r.flag_id).filter(f => f.startsWith('CUSTOM_'));
        const flagRow = configResult.rows.find(r => r.order_code === '__ptag_custom_flags__');
        const definedFlagIds = new Set((flagRow?.data?.customFlagDefs || []).map(d => d.id));
        const orphanedFlags = usedFlagIds.filter(id => !definedFlagIds.has(id));

        // Count orders per orphan
        const orphanTTagDetails = {};
        const orphanFlagDetails = {};
        if (orphanedTTags.length > 0) {
            const r = await pool.query(
                `SELECT tag_id, count(*) as cnt FROM (
                    SELECT jsonb_array_elements_text(data->'tTags') as tag_id
                    FROM processing_tags WHERE data ? 'tTags' AND order_code NOT LIKE '\\_%' ESCAPE '\\'
                ) sub WHERE tag_id = ANY($1::text[]) GROUP BY tag_id`, [orphanedTTags]);
            r.rows.forEach(row => orphanTTagDetails[row.tag_id] = +row.cnt);
        }
        if (orphanedFlags.length > 0) {
            const r = await pool.query(
                `SELECT flag_id, count(*) as cnt FROM (
                    SELECT jsonb_array_elements_text(data->'flags') as flag_id
                    FROM processing_tags WHERE data ? 'flags' AND order_code NOT LIKE '\\_%' ESCAPE '\\'
                ) sub WHERE flag_id = ANY($1::text[]) GROUP BY flag_id`, [orphanedFlags]);
            r.rows.forEach(row => orphanFlagDetails[row.flag_id] = +row.cnt);
        }

        let repairResult = null;
        if (autoRepair && (orphanedTTags.length > 0 || orphanedFlags.length > 0)) {
            repairResult = await _repairOrphans(pool, orphanedTTags, orphanedFlags, configRow, flagRow, notifyClients);
        }

        res.json({
            success: true,
            records,
            orphanedTTags: orphanTTagDetails,
            orphanedFlags: orphanFlagDetails,
            orphanedTTagCount: orphanedTTags.length,
            orphanedFlagCount: orphanedFlags.length,
            repairResult
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/realtime/processing-tags/repair-orphaned-ttags
 * Find tTag + custom flag IDs used in orders but missing from definitions, create placeholders
 */
router.post('/processing-tags/repair-orphaned-ttags', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        // Find orphaned T-tags
        const ttagResult = await pool.query(
            `SELECT DISTINCT jsonb_array_elements_text(data->'tTags') as tag_id
             FROM processing_tags
             WHERE data ? 'tTags' AND jsonb_array_length(data->'tTags') > 0
             AND order_code NOT LIKE '\\_%' ESCAPE '\\'`
        );
        const configResult = await pool.query(
            `SELECT data FROM processing_tags WHERE order_code = '__ttag_config__' LIMIT 1`
        );
        const configRow = configResult.rows[0] || null;
        const definedTTagIds = new Set((configRow?.data?.tTagDefinitions || []).map(d => d.id));
        const orphanedTTags = ttagResult.rows.map(r => r.tag_id).filter(id => !definedTTagIds.has(id));

        // Find orphaned custom flags
        const flagResult = await pool.query(
            `SELECT DISTINCT jsonb_array_elements_text(data->'flags') as flag_id
             FROM processing_tags
             WHERE data ? 'flags' AND jsonb_array_length(data->'flags') > 0
             AND order_code NOT LIKE '\\_%' ESCAPE '\\'`
        );
        const flagConfigResult = await pool.query(
            `SELECT data FROM processing_tags WHERE order_code = '__ptag_custom_flags__' LIMIT 1`
        );
        const flagRow = flagConfigResult.rows[0] || null;
        const definedFlagIds = new Set((flagRow?.data?.customFlagDefs || []).map(d => d.id));
        const orphanedFlags = flagResult.rows.map(r => r.flag_id).filter(f => f.startsWith('CUSTOM_') && !definedFlagIds.has(f));

        if (orphanedTTags.length === 0 && orphanedFlags.length === 0) {
            return res.json({ success: true, message: 'No orphans found' });
        }

        const result = await _repairOrphans(pool, orphanedTTags, orphanedFlags, configRow, flagRow, notifyClients);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[REALTIME-DB] repair-orphaned-ttags error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/realtime/processing-tags/config-merge
 * Atomic merge for config records — prevents race condition overwrites.
 * Body: { configKey: "__ptag_custom_flags__"|"__ttag_config__", addDefs: [...], removeDefs: ["id1",...] }
 */
router.patch('/processing-tags/config-merge', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { configKey, addDefs, removeDefs, updatedBy } = req.body;
        if (!configKey || !['__ttag_config__', '__ptag_custom_flags__'].includes(configKey)) {
            return res.status(400).json({ error: 'Invalid configKey' });
        }

        const isTTag = configKey === '__ttag_config__';
        const arrayField = isTTag ? 'tTagDefinitions' : 'customFlagDefs';

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [configKey]);

            // Read current config
            const current = await client.query(
                `SELECT data FROM processing_tags WHERE order_code = $1 LIMIT 1`, [configKey]
            );
            let defs = current.rows[0]?.data?.[arrayField] || [];

            // Remove defs by ID
            const removeSet = new Set(removeDefs || []);
            if (removeSet.size > 0) {
                defs = defs.filter(d => !removeSet.has(d.id));
            }

            // Add new defs (skip if ID already exists)
            if (Array.isArray(addDefs)) {
                for (const newDef of addDefs) {
                    if (!defs.some(d => d.id === newDef.id)) {
                        defs.push(newDef);
                    }
                }
            }

            const data = { [arrayField]: defs };
            const dataJson = JSON.stringify(data);

            // Upsert
            if (current.rows.length > 0) {
                await client.query(
                    `UPDATE processing_tags SET data = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE order_code = $3`,
                    [dataJson, updatedBy || null, configKey]
                );
            } else {
                await client.query(
                    `INSERT INTO processing_tags (data, updated_by, order_code, created_at, updated_at)
                     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    [dataJson, updatedBy || null, configKey]
                );
            }
            await client.query('COMMIT');

            // SSE broadcast
            if (notifyClients) {
                notifyClients('processing_tags_global', { orderCode: configKey, data }, 'update');
            }

            res.json({ success: true, configKey, totalDefs: defs.length });
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[REALTIME-DB] PATCH config-merge error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Helper: repair orphaned T-tags and custom flags
 */
async function _repairOrphans(pool, orphanedTTags, orphanedFlags, ttagConfigRow, flagConfigRow, notifyClients) {
    const ttagDefs = [...(ttagConfigRow?.data?.tTagDefinitions || [])];
    const flagDefs = [...(flagConfigRow?.data?.customFlagDefs || [])];

    // Create placeholder T-tag definitions
    for (const tagId of orphanedTTags) {
        ttagDefs.push({
            id: tagId,
            name: `[RECOVERED] ${tagId}`,
            productCode: '',
            createdAt: Date.now(),
            isRecovered: true
        });
    }

    // Create placeholder custom flag definitions
    const palette = ['#ef4444','#f97316','#f59e0b','#22c55e','#14b8a6','#3b82f6','#6366f1','#8b5cf6','#ec4899','#06b6d4'];
    for (const flagId of orphanedFlags) {
        flagDefs.push({
            id: flagId,
            label: `[RECOVERED] ${flagId.slice(-8)}`,
            color: palette[Math.floor(Math.random() * palette.length)],
            createdAt: Date.now(),
            isRecovered: true
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (orphanedTTags.length > 0) {
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['__ttag_config__']);
            const data = { tTagDefinitions: ttagDefs };
            await client.query(`DELETE FROM processing_tags WHERE order_code = '__ttag_config__'`);
            await client.query(
                `INSERT INTO processing_tags (data, updated_by, order_code, created_at, updated_at)
                 VALUES ($1, 'repair-script', '__ttag_config__', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [JSON.stringify(data)]
            );
            if (notifyClients) notifyClients('processing_tags_global', { orderCode: '__ttag_config__', data }, 'update');
        }

        if (orphanedFlags.length > 0) {
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['__ptag_custom_flags__']);
            const data = { customFlagDefs: flagDefs };
            await client.query(`DELETE FROM processing_tags WHERE order_code = '__ptag_custom_flags__'`);
            await client.query(
                `INSERT INTO processing_tags (data, updated_by, order_code, created_at, updated_at)
                 VALUES ($1, 'repair-script', '__ptag_custom_flags__', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [JSON.stringify(data)]
            );
            if (notifyClients) notifyClients('processing_tags_global', { orderCode: '__ptag_custom_flags__', data }, 'update');
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }

    return {
        repairedTTags: orphanedTTags,
        repairedFlags: orphanedFlags,
        totalTTagDefs: ttagDefs.length,
        totalFlagDefs: flagDefs.length,
        message: `Repaired ${orphanedTTags.length} T-tags + ${orphanedFlags.length} custom flags`
    };
}

/**
 * POST /api/realtime/processing-tags/batch
 * Load processing tags by array of order codes (for date mode / cross-campaign lookup)
 * Body: { codes: string[] }
 */
router.post('/processing-tags/batch', async (req, res) => {
    try {
        const { codes } = req.body;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        if (!codes || !Array.isArray(codes) || codes.length === 0) {
            return res.json({ success: true, data: {}, count: 0 });
        }

        // Limit to 500 codes per request
        const limitedCodes = codes.slice(0, 500);

        const result = await pool.query(
            `SELECT order_code, order_id, campaign_id, data, updated_by, updated_at
             FROM processing_tags
             WHERE order_code = ANY($1::text[])`,
            [limitedCodes]
        );

        const data = {};
        for (const row of result.rows) {
            data[row.order_code] = {
                ...row.data,
                orderId: row.order_id,
                campaignId: row.campaign_id,
                updatedBy: row.updated_by,
                updatedAt: row.updated_at
            };
        }

        res.json({ success: true, data, count: result.rowCount });
    } catch (error) {
        console.error('[REALTIME-DB] POST /processing-tags/batch error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/processing-tags/batch-save
 * Batch upsert processing tags — replaces N individual PUT /by-code/:code calls
 * Body: { items: [{ orderCode, data, updatedBy?, campaignId? }], silent?: boolean }
 * silent=true skips SSE notifications (useful for bulk reconcile/auto-tag)
 */
router.put('/processing-tags/batch-save', async (req, res) => {
    try {
        const { items, silent } = req.body;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.json({ success: true, saved: 0 });
        }

        // Limit to 200 items per request to avoid long transactions
        const limitedItems = items.slice(0, 200);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let saved = 0;

            for (const item of limitedItems) {
                const { orderCode, data, updatedBy, campaignId } = item;
                if (!orderCode || !data) continue;

                const dataJson = JSON.stringify(data);
                await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [orderCode]);
                await client.query(
                    `DELETE FROM processing_tags WHERE order_code = $1`,
                    [orderCode]
                );
                await client.query(
                    `INSERT INTO processing_tags (data, updated_by, order_code, campaign_id, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    [dataJson, updatedBy || null, orderCode, campaignId || null]
                );
                saved++;
            }

            await client.query('COMMIT');

            // Notify SSE clients (single bulk event instead of N events)
            if (!silent && notifyClients && saved > 0) {
                const summary = limitedItems
                    .filter(i => i.orderCode && i.data)
                    .map(i => ({ orderCode: i.orderCode, data: i.data, updatedBy: i.updatedBy }));
                // Send individual events so SSE listeners can handle each order
                for (const s of summary) {
                    notifyClients('processing_tags_global', s, 'update');
                }
            }

            res.json({ success: true, saved });
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[REALTIME-DB] PUT /processing-tags/batch-save error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/processing-tags/config
 * Load config records only (__ttag_config__, __ptag_custom_flags__)
 * IMPORTANT: Đặt TRƯỚC /:campaignId để Express match đúng
 */
router.get('/processing-tags/config', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            `SELECT order_code, data FROM processing_tags WHERE order_code LIKE '\\_%' ESCAPE '\\'`
        );

        const data = {};
        for (const row of result.rows) {
            const key = row.order_code;
            if (data[key]) {
                // Merge config records (deduplicate by id)
                const existing = data[key];
                if (row.data.tTagDefinitions) {
                    if (!existing.tTagDefinitions) existing.tTagDefinitions = [];
                    for (const def of row.data.tTagDefinitions) {
                        if (!existing.tTagDefinitions.some(d => d.id === def.id)) {
                            existing.tTagDefinitions.push(def);
                        }
                    }
                }
                if (row.data.customFlagDefs) {
                    if (!existing.customFlagDefs) existing.customFlagDefs = [];
                    for (const def of row.data.customFlagDefs) {
                        if (!existing.customFlagDefs.some(d => d.id === def.id)) {
                            existing.customFlagDefs.push(def);
                        }
                    }
                }
            } else {
                data[key] = { ...row.data };
            }
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('[REALTIME-DB] GET /processing-tags/config error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/processing-tags/:campaignId
 * Load tất cả processing tags cho 1 campaign (LEGACY - giữ cho backup)
 */
router.get('/processing-tags/:campaignId', async (req, res) => {
    try {
        const { campaignId } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            `SELECT order_id, order_code, campaign_id, data, updated_by, updated_at FROM processing_tags
             WHERE campaign_id = $1 OR order_code LIKE '\\_\\_%'
             OR (order_id LIKE '\\_\\_%' AND order_code IS NULL)`,
            [campaignId]
        );

        const data = {};
        for (const row of result.rows) {
            // Ưu tiên order_code nếu có, fallback order_id cho dữ liệu cũ
            const key = row.order_code || row.order_id;
            if (data[key] && key.startsWith('__')) {
                // Merge config records from multiple campaigns (deduplicate by id)
                const existing = data[key];
                if (row.data.tTagDefinitions) {
                    if (!existing.tTagDefinitions) existing.tTagDefinitions = [];
                    for (const def of row.data.tTagDefinitions) {
                        if (!existing.tTagDefinitions.some(d => d.id === def.id)) {
                            existing.tTagDefinitions.push(def);
                        }
                    }
                }
                if (row.data.customFlagDefs) {
                    if (!existing.customFlagDefs) existing.customFlagDefs = [];
                    for (const def of row.data.customFlagDefs) {
                        if (!existing.customFlagDefs.some(d => d.id === def.id)) {
                            existing.customFlagDefs.push(def);
                        }
                    }
                }
            } else {
                data[key] = {
                    ...row.data,
                    orderId: row.order_id,
                    campaignId: row.campaign_id,
                    orderCode: row.order_code,
                    updatedBy: row.updated_by,
                    updatedAt: row.updated_at
                };
            }
        }

        res.json({ success: true, data, count: result.rowCount });
    } catch (error) {
        console.error('[REALTIME-DB] GET /processing-tags error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/processing-tags/by-code/:orderCode
 * Upsert processing tag bằng orderCode (key chính duy nhất)
 * Body: { data: {...}, updatedBy: string, campaignId?: string }
 */
router.put('/processing-tags/by-code/:orderCode', async (req, res) => {
    try {
        const { orderCode } = req.params;
        const { data, updatedBy, campaignId } = req.body;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        if (!data) {
            return res.status(400).json({ error: 'Missing data in request body' });
        }

        const dataJson = JSON.stringify(data);
        const updatedByVal = updatedBy || null;
        const campaignIdVal = campaignId || null;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [orderCode]);
            // Delete existing record by order_code (config hoặc order đều cùng logic)
            await client.query(
                `DELETE FROM processing_tags WHERE order_code = $1`,
                [orderCode]
            );
            await client.query(
                `INSERT INTO processing_tags (data, updated_by, order_code, campaign_id, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [dataJson, updatedByVal, orderCode, campaignIdVal]
            );
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }

        // Notify SSE clients (global channel only)
        if (notifyClients) {
            notifyClients('processing_tags_global', { orderCode, data, updatedBy }, 'update');
        }

        res.json({ success: true, orderCode });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /processing-tags/by-code error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/processing-tags/by-code/:orderCode
 * Xóa processing tag bằng orderCode
 */
router.delete('/processing-tags/by-code/:orderCode', async (req, res) => {
    try {
        const { orderCode } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            `DELETE FROM processing_tags WHERE order_code = $1 RETURNING id`,
            [orderCode]
        );

        // Notify SSE clients (global channel only)
        if (notifyClients) {
            notifyClients('processing_tags_global', { orderCode }, 'deleted');
        }

        res.json({ success: true, deleted: result.rowCount > 0, orderCode });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /processing-tags/by-code error:', error);
        res.status(500).json({ error: error.message });
    }
});



// =====================================================
// EXPORTS
// =====================================================

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
