/**
 * Social Orders API Routes
 * Quản lý đơn hàng nháp từ các kênh mạng xã hội
 */

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Generate order code: SO-YYYYMMDD-XXX
 */
async function generateOrderCode() {
    const result = await pool.query('SELECT generate_social_order_code() as code');
    return result.rows[0].code;
}

/**
 * Calculate totals from products array
 */
function calculateTotals(products, shippingFee = 0, discount = 0) {
    let totalQuantity = 0;
    let totalAmount = 0;

    if (Array.isArray(products)) {
        products.forEach((p) => {
            const qty = parseInt(p.quantity) || 0;
            const price = parseFloat(p.price) || 0;
            totalQuantity += qty;
            totalAmount += qty * price;
        });
    }

    const finalAmount = totalAmount + (parseFloat(shippingFee) || 0) - (parseFloat(discount) || 0);

    return {
        total_quantity: totalQuantity,
        total_amount: totalAmount,
        final_amount: Math.max(0, finalAmount),
    };
}

/**
 * Log order history
 */
async function logHistory(orderId, action, changes, userId, userName) {
    try {
        await pool.query(
            `
            INSERT INTO social_order_history (order_id, action, changes, performed_by, performed_by_name)
            VALUES ($1, $2, $3, $4, $5)
        `,
            [orderId, action, JSON.stringify(changes), userId, userName]
        );
    } catch (err) {
        console.error('[SOCIAL-ORDERS] Failed to log history:', err.message);
    }
}

// =====================================================
// GET /api/social-orders - List orders with filters
// =====================================================
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            status,
            source,
            search,
            assigned_user_id,
            campaign_name,
            tag_id,
            from_date,
            to_date,
            sort_by = 'created_at',
            sort_order = 'DESC',
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        // Build WHERE conditions
        if (status) {
            conditions.push(`status = $${paramIndex++}`);
            params.push(status);
        }

        if (source) {
            conditions.push(`source = $${paramIndex++}`);
            params.push(source);
        }

        if (assigned_user_id) {
            conditions.push(`assigned_user_id = $${paramIndex++}`);
            params.push(assigned_user_id);
        }

        if (campaign_name) {
            conditions.push(`campaign_name = $${paramIndex++}`);
            params.push(campaign_name);
        }

        if (search) {
            conditions.push(`(
                customer_name ILIKE $${paramIndex} OR 
                phone ILIKE $${paramIndex} OR 
                order_code ILIKE $${paramIndex}
            )`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (tag_id) {
            conditions.push(`tags @> $${paramIndex++}::jsonb`);
            params.push(JSON.stringify([{ id: tag_id }]));
        }

        if (from_date) {
            conditions.push(`created_at >= $${paramIndex++}`);
            params.push(from_date);
        }

        if (to_date) {
            conditions.push(`created_at <= $${paramIndex++}`);
            params.push(to_date);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Validate sort columns
        const allowedSortColumns = [
            'created_at',
            'updated_at',
            'stt',
            'order_code',
            'customer_name',
            'total_amount',
            'status',
        ];
        const sortColumn = allowedSortColumns.includes(sort_by) ? sort_by : 'created_at';
        const sortDir = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Get total count
        const countResult = await pool.query(
            `SELECT COUNT(*) as total FROM social_orders ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].total);

        // Get orders
        params.push(parseInt(limit));
        params.push(offset);

        const result = await pool.query(
            `
            SELECT * FROM social_orders 
            ${whereClause}
            ORDER BY ${sortColumn} ${sortDir}
            LIMIT $${paramIndex++} OFFSET $${paramIndex}
        `,
            params
        );

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (err) {
        console.error('[SOCIAL-ORDERS] GET / error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// GET /api/social-orders/stats - Get statistics
// =====================================================
router.get('/stats', async (req, res) => {
    try {
        const { campaign_name, from_date, to_date } = req.query;

        let conditions = [];
        let params = [];
        let paramIndex = 1;

        if (campaign_name) {
            conditions.push(`campaign_name = $${paramIndex++}`);
            params.push(campaign_name);
        }

        if (from_date) {
            conditions.push(`created_at >= $${paramIndex++}`);
            params.push(from_date);
        }

        if (to_date) {
            conditions.push(`created_at <= $${paramIndex++}`);
            params.push(to_date);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await pool.query(
            `
            SELECT 
                COUNT(*) as total_orders,
                COUNT(DISTINCT phone) as unique_customers,
                SUM(total_quantity) as total_products,
                SUM(total_amount) as total_amount,
                SUM(final_amount) as total_final_amount,
                COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
                COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
                COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
                COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count
            FROM social_orders ${whereClause}
        `,
            params
        );

        res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (err) {
        console.error('[SOCIAL-ORDERS] GET /stats error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// GET /api/social-orders/:id - Get single order
// =====================================================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query('SELECT * FROM social_orders WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        // Get history
        const historyResult = await pool.query(
            'SELECT * FROM social_order_history WHERE order_id = $1 ORDER BY performed_at DESC LIMIT 50',
            [id]
        );

        res.json({
            success: true,
            data: {
                ...result.rows[0],
                history: historyResult.rows,
            },
        });
    } catch (err) {
        console.error('[SOCIAL-ORDERS] GET /:id error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// POST /api/social-orders - Create new order
// =====================================================
router.post('/', async (req, res) => {
    try {
        const {
            customer_name,
            phone,
            address,
            extra_address,
            channel_id,
            psid,
            conversation_id,
            fb_customer_id,
            products = [],
            shipping_fee = 0,
            discount = 0,
            tags = [],
            status = 'draft',
            assigned_user_id,
            assigned_user_name,
            source = 'manual',
            campaign_name,
            note,
            internal_note,
            created_by,
            created_by_name,
            stt,
        } = req.body;

        // Generate order code
        const order_code = await generateOrderCode();

        // Calculate totals
        const totals = calculateTotals(products, shipping_fee, discount);

        const result = await pool.query(
            `
            INSERT INTO social_orders (
                order_code, stt, customer_name, phone, address, extra_address,
                channel_id, psid, conversation_id, fb_customer_id,
                products, total_quantity, total_amount, shipping_fee, discount, final_amount,
                tags, status, assigned_user_id, assigned_user_name,
                source, campaign_name, note, internal_note,
                created_by, created_by_name, updated_by, updated_by_name
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16,
                $17, $18, $19, $20,
                $21, $22, $23, $24,
                $25, $26, $25, $26
            ) RETURNING *
        `,
            [
                order_code,
                stt,
                customer_name,
                phone,
                address,
                extra_address,
                channel_id,
                psid,
                conversation_id,
                fb_customer_id,
                JSON.stringify(products),
                totals.total_quantity,
                totals.total_amount,
                shipping_fee,
                discount,
                totals.final_amount,
                JSON.stringify(tags),
                status,
                assigned_user_id,
                assigned_user_name,
                source,
                campaign_name,
                note,
                internal_note,
                created_by,
                created_by_name,
            ]
        );

        const newOrder = result.rows[0];

        // Log history
        await logHistory(
            newOrder.id,
            'created',
            { order_code, products, tags },
            created_by,
            created_by_name
        );

        res.status(201).json({
            success: true,
            data: newOrder,
        });
    } catch (err) {
        console.error('[SOCIAL-ORDERS] POST / error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PUT /api/social-orders/:id - Update order
// =====================================================
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            customer_name,
            phone,
            address,
            extra_address,
            channel_id,
            psid,
            conversation_id,
            fb_customer_id,
            products,
            shipping_fee,
            discount,
            tags,
            status,
            assigned_user_id,
            assigned_user_name,
            source,
            campaign_name,
            note,
            internal_note,
            stt,
            updated_by,
            updated_by_name,
        } = req.body;

        // Get current order
        const currentResult = await pool.query('SELECT * FROM social_orders WHERE id = $1', [id]);
        if (currentResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        const currentOrder = currentResult.rows[0];

        // Build update fields
        const updates = [];
        const params = [];
        let paramIndex = 1;
        const changes = {};

        const fieldsToUpdate = {
            customer_name,
            phone,
            address,
            extra_address,
            channel_id,
            psid,
            conversation_id,
            fb_customer_id,
            status,
            assigned_user_id,
            assigned_user_name,
            source,
            campaign_name,
            note,
            internal_note,
            stt,
        };

        for (const [key, value] of Object.entries(fieldsToUpdate)) {
            if (value !== undefined) {
                updates.push(`${key} = $${paramIndex++}`);
                params.push(value);
                if (currentOrder[key] !== value) {
                    changes[key] = { from: currentOrder[key], to: value };
                }
            }
        }

        // Handle products update
        if (products !== undefined) {
            const totals = calculateTotals(
                products,
                shipping_fee ?? currentOrder.shipping_fee,
                discount ?? currentOrder.discount
            );
            updates.push(`products = $${paramIndex++}`);
            params.push(JSON.stringify(products));
            updates.push(`total_quantity = $${paramIndex++}`);
            params.push(totals.total_quantity);
            updates.push(`total_amount = $${paramIndex++}`);
            params.push(totals.total_amount);
            updates.push(`final_amount = $${paramIndex++}`);
            params.push(totals.final_amount);
            changes.products = { updated: true };
        }

        // Handle shipping_fee update
        if (shipping_fee !== undefined) {
            updates.push(`shipping_fee = $${paramIndex++}`);
            params.push(shipping_fee);
            // Recalculate final_amount
            const currentProducts = products ?? currentOrder.products;
            const totals = calculateTotals(
                currentProducts,
                shipping_fee,
                discount ?? currentOrder.discount
            );
            updates.push(`final_amount = $${paramIndex++}`);
            params.push(totals.final_amount);
        }

        // Handle discount update
        if (discount !== undefined) {
            updates.push(`discount = $${paramIndex++}`);
            params.push(discount);
            // Recalculate final_amount
            const currentProducts = products ?? currentOrder.products;
            const totals = calculateTotals(
                currentProducts,
                shipping_fee ?? currentOrder.shipping_fee,
                discount
            );
            updates.push(`final_amount = $${paramIndex++}`);
            params.push(totals.final_amount);
        }

        // Handle tags update
        if (tags !== undefined) {
            updates.push(`tags = $${paramIndex++}`);
            params.push(JSON.stringify(tags));
            changes.tags = { updated: true };
        }

        // Add updated_by
        if (updated_by) {
            updates.push(`updated_by = $${paramIndex++}`);
            params.push(updated_by);
        }
        if (updated_by_name) {
            updates.push(`updated_by_name = $${paramIndex++}`);
            params.push(updated_by_name);
        }

        if (updates.length === 0) {
            return res.json({ success: true, data: currentOrder, message: 'No changes' });
        }

        params.push(id);
        const result = await pool.query(
            `
            UPDATE social_orders 
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `,
            params
        );

        // Log history
        if (Object.keys(changes).length > 0) {
            await logHistory(id, 'updated', changes, updated_by, updated_by_name);
        }

        res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (err) {
        console.error('[SOCIAL-ORDERS] PUT /:id error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// DELETE /api/social-orders/:id - Delete order
// =====================================================
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { deleted_by, deleted_by_name } = req.body;

        // Get order before delete
        const currentResult = await pool.query('SELECT * FROM social_orders WHERE id = $1', [id]);
        if (currentResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        await pool.query('DELETE FROM social_orders WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Order deleted successfully',
        });
    } catch (err) {
        console.error('[SOCIAL-ORDERS] DELETE /:id error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// POST /api/social-orders/:id/tags - Add tag
// =====================================================
router.post('/:id/tags', async (req, res) => {
    try {
        const { id } = req.params;
        const { tag, updated_by, updated_by_name } = req.body;

        if (!tag || !tag.id) {
            return res.status(400).json({ success: false, error: 'Tag object with id required' });
        }

        // Add tag to array (avoid duplicates)
        const result = await pool.query(
            `
            UPDATE social_orders 
            SET tags = (
                SELECT jsonb_agg(DISTINCT elem)
                FROM (
                    SELECT elem FROM jsonb_array_elements(tags) elem
                    UNION
                    SELECT $1::jsonb
                ) sub
            ),
            updated_by = $2,
            updated_by_name = $3
            WHERE id = $4
            RETURNING *
        `,
            [JSON.stringify(tag), updated_by, updated_by_name, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        await logHistory(id, 'tag_added', { tag }, updated_by, updated_by_name);

        res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (err) {
        console.error('[SOCIAL-ORDERS] POST /:id/tags error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// DELETE /api/social-orders/:id/tags/:tagId - Remove tag
// =====================================================
router.delete('/:id/tags/:tagId', async (req, res) => {
    try {
        const { id, tagId } = req.params;
        const { updated_by, updated_by_name } = req.body;

        // Remove tag from array
        const result = await pool.query(
            `
            UPDATE social_orders 
            SET tags = (
                SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                FROM jsonb_array_elements(tags) elem
                WHERE elem->>'id' != $1
            ),
            updated_by = $2,
            updated_by_name = $3
            WHERE id = $4
            RETURNING *
        `,
            [tagId, updated_by, updated_by_name, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        await logHistory(id, 'tag_removed', { tagId }, updated_by, updated_by_name);

        res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (err) {
        console.error('[SOCIAL-ORDERS] DELETE /:id/tags/:tagId error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// POST /api/social-orders/bulk-assign - Bulk assign to employee
// =====================================================
router.post('/bulk-assign', async (req, res) => {
    try {
        const { order_ids, assigned_user_id, assigned_user_name, updated_by, updated_by_name } =
            req.body;

        if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
            return res.status(400).json({ success: false, error: 'order_ids array required' });
        }

        const result = await pool.query(
            `
            UPDATE social_orders 
            SET assigned_user_id = $1, 
                assigned_user_name = $2,
                updated_by = $3,
                updated_by_name = $4
            WHERE id = ANY($5)
            RETURNING id
        `,
            [assigned_user_id, assigned_user_name, updated_by, updated_by_name, order_ids]
        );

        res.json({
            success: true,
            updated_count: result.rows.length,
        });
    } catch (err) {
        console.error('[SOCIAL-ORDERS] POST /bulk-assign error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// POST /api/social-orders/import-pancake - Import from Pancake conversation
// =====================================================
router.post('/import-pancake', async (req, res) => {
    try {
        const {
            conversations, // Array of Pancake conversations
            campaign_name,
            source = 'pancake_import',
            created_by,
            created_by_name,
        } = req.body;

        if (!conversations || !Array.isArray(conversations)) {
            return res.status(400).json({ success: false, error: 'conversations array required' });
        }

        const created = [];
        const errors = [];

        for (const conv of conversations) {
            try {
                const order_code = await generateOrderCode();

                // Extract customer info from conversation
                const customer = conv.customers?.[0] || conv.from || {};
                const customer_name = customer.name || conv.from_name || 'Khách hàng';
                const phone = customer.phone || '';
                const address = customer.address || '';

                const result = await pool.query(
                    `
                    INSERT INTO social_orders (
                        order_code, customer_name, phone, address,
                        channel_id, psid, conversation_id, fb_customer_id,
                        products, total_quantity, total_amount, final_amount,
                        tags, status, source, campaign_name,
                        created_by, created_by_name, updated_by, updated_by_name
                    ) VALUES (
                        $1, $2, $3, $4,
                        $5, $6, $7, $8,
                        '[]', 0, 0, 0,
                        '[]', 'draft', $9, $10,
                        $11, $12, $11, $12
                    ) RETURNING *
                `,
                    [
                        order_code,
                        customer_name,
                        phone,
                        address,
                        conv.page_id,
                        conv.from_psid || customer.fb_id,
                        conv.id,
                        customer.fb_id,
                        source,
                        campaign_name,
                        created_by,
                        created_by_name,
                    ]
                );

                created.push(result.rows[0]);
            } catch (err) {
                errors.push({ conversation_id: conv.id, error: err.message });
            }
        }

        res.json({
            success: true,
            created_count: created.length,
            error_count: errors.length,
            created,
            errors,
        });
    } catch (err) {
        console.error('[SOCIAL-ORDERS] POST /import-pancake error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
