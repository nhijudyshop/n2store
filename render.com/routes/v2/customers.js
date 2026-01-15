/**
 * =====================================================
 * API V2 - CUSTOMERS ROUTES
 * =====================================================
 *
 * Customer management and 360° view endpoints
 *
 * Routes:
 *   GET    /                    - List customers (paginated, filtered)
 *   GET    /:id                 - Get customer 360° view by ID
 *   GET    /phone/:phone        - Get customer 360° view by phone
 *   POST   /                    - Create customer
 *   PATCH  /:id                 - Update customer
 *   GET    /:id/activity        - Get activity timeline
 *   GET    /:id/rfm             - Get RFM analysis
 *   POST   /:id/notes           - Add customer note
 *   POST   /batch               - Batch lookup customers
 *   POST   /search              - Search customers
 *
 * Created: 2026-01-12
 * =====================================================
 */

const express = require('express');
const router = express.Router();
const { normalizePhone, getOrCreateCustomer } = require('../../utils/customer-helpers');
const { searchCustomerByPhone } = require('../../services/tpos-customer-service');

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function handleError(res, error, message = 'Internal server error') {
    console.error(`[Customers V2] ${message}:`, error.message);
    res.status(500).json({ success: false, error: message, details: error.message });
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /api/v2/customers
 * List customers with pagination and filters
 */
router.get('/', async (req, res) => {
    const db = req.app.locals.chatDb;
    const {
        page = 1,
        limit = 50,
        tier,
        segment,
        status,
        search,
        sort = 'created_at',
        order = 'desc'
    } = req.query;

    try {
        let query = `
            SELECT c.*,
                w.balance as wallet_balance,
                w.virtual_balance as wallet_virtual_balance,
                (COALESCE(w.balance, 0) + COALESCE(w.virtual_balance, 0)) as wallet_total
            FROM customers c
            LEFT JOIN customer_wallets w ON c.id = w.customer_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        // Apply filters
        if (tier) {
            query += ` AND c.tier = $${paramIndex++}`;
            params.push(tier);
        }
        if (segment) {
            query += ` AND c.rfm_segment = $${paramIndex++}`;
            params.push(segment);
        }
        if (status) {
            query += ` AND c.status = $${paramIndex++}`;
            params.push(status);
        }
        if (search) {
            query += ` AND (c.phone ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        // Count total
        const countQuery = query.replace(/SELECT c\.\*[\s\S]*?FROM/, 'SELECT COUNT(*) FROM');
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Apply sorting and pagination
        const validSorts = ['created_at', 'name', 'total_orders', 'total_spent', 'last_order_date'];
        const sortField = validSorts.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        query += ` ORDER BY c.${sortField} ${sortOrder} NULLS LAST`;
        query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        const result = await db.query(query, params);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to list customers');
    }
});

/**
 * GET /api/v2/customers/:id
 * Get full Customer 360° view by ID
 */
router.get('/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    // Check if it's a phone number or ID
    const isPhone = /^0\d{9}$/.test(id) || /^\d{10,11}$/.test(id);

    try {
        // Get customer info
        const customerQuery = isPhone
            ? `SELECT c.*, w.balance as wallet_balance, w.virtual_balance as wallet_virtual_balance
               FROM customers c
               LEFT JOIN customer_wallets w ON c.id = w.customer_id
               WHERE c.phone = $1`
            : `SELECT c.*, w.balance as wallet_balance, w.virtual_balance as wallet_virtual_balance
               FROM customers c
               LEFT JOIN customer_wallets w ON c.id = w.customer_id
               WHERE c.id = $1`;

        const lookupValue = isPhone ? normalizePhone(id) : parseInt(id);
        const customerResult = await db.query(customerQuery, [lookupValue]);

        if (customerResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        const customer = customerResult.rows[0];
        const phone = customer.phone;

        // Get active virtual credits
        const creditsResult = await db.query(`
            SELECT id, original_amount, remaining_amount, issued_at, expires_at, status, source_type
            FROM virtual_credits
            WHERE phone = $1 AND status = 'ACTIVE' AND expires_at > NOW()
            ORDER BY expires_at ASC
        `, [phone]);

        // Get recent tickets (last 10) with products
        const ticketsResult = await db.query(`
            SELECT ticket_code, type, status, order_id, tpos_order_id, refund_amount, products, internal_note, created_at
            FROM customer_tickets
            WHERE phone = $1 AND status != 'DELETED'
            ORDER BY created_at DESC
            LIMIT 10
        `, [phone]);

        // Get recent activities (last 20)
        const activitiesResult = await db.query(`
            SELECT activity_type, title, description, icon, color, created_at
            FROM customer_activities
            WHERE phone = $1
            ORDER BY created_at DESC
            LIMIT 20
        `, [phone]);

        // Get notes
        const notesResult = await db.query(`
            SELECT id, content, is_pinned, category, created_by, created_at
            FROM customer_notes
            WHERE phone = $1
            ORDER BY is_pinned DESC, created_at DESC
        `, [phone]);

        // Get ticket statistics
        const ticketStatsResult = await db.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'DELETED')) as pending,
                COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
                SUM(refund_amount) FILTER (WHERE status = 'COMPLETED') as total_refunded
            FROM customer_tickets
            WHERE phone = $1
        `, [phone]);

        res.json({
            success: true,
            data: {
                customer: {
                    ...customer,
                    ticketStats: ticketStatsResult.rows[0],
                },
                wallet: {
                    balance: parseFloat(customer.wallet_balance) || 0,
                    virtualBalance: parseFloat(customer.wallet_virtual_balance) || 0,
                    total: (parseFloat(customer.wallet_balance) || 0) + (parseFloat(customer.wallet_virtual_balance) || 0),
                    virtualCredits: creditsResult.rows,
                },
                recentTickets: ticketsResult.rows,
                recentActivities: activitiesResult.rows,
                notes: notesResult.rows,
            },
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch customer 360 data');
    }
});

/**
 * POST /api/v2/customers
 * Create new customer (auto-fetch status from TPOS if not provided)
 */
router.post('/', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phone, name, email, address, status, tier, tags } = req.body;

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    try {
        // Fetch status from TPOS if not provided
        let finalStatus = status;
        let tposData = null;

        if (!finalStatus) {
            const tposResult = await searchCustomerByPhone(normalizedPhone);
            if (tposResult.success && tposResult.customer) {
                finalStatus = tposResult.customer.status || 'Bình thường';
                tposData = tposResult.customer;
                console.log(`[Customers V2] Fetched TPOS status for ${normalizedPhone}: ${finalStatus}`);
            } else {
                finalStatus = 'Bình thường';
            }
        }

        const result = await db.query(`
            INSERT INTO customers (phone, name, email, address, status, tier, tags, tpos_id, tpos_data)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (phone) DO UPDATE SET
                name = COALESCE(EXCLUDED.name, customers.name),
                email = COALESCE(EXCLUDED.email, customers.email),
                address = COALESCE(EXCLUDED.address, customers.address),
                status = COALESCE(EXCLUDED.status, customers.status),
                tier = COALESCE(EXCLUDED.tier, customers.tier),
                tags = COALESCE(EXCLUDED.tags, customers.tags),
                tpos_id = COALESCE(EXCLUDED.tpos_id, customers.tpos_id),
                tpos_data = COALESCE(EXCLUDED.tpos_data, customers.tpos_data),
                updated_at = NOW()
            RETURNING *
        `, [
            normalizedPhone,
            name || tposData?.name || 'Khách hàng ' + normalizedPhone,
            email,
            address || tposData?.address,
            finalStatus,
            tier || 'normal',
            JSON.stringify(tags || []),
            tposData?.id?.toString() || null,
            tposData ? JSON.stringify(tposData) : null
        ]);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to create customer');
    }
});

/**
 * PATCH /api/v2/customers/:id
 * Update customer
 */
router.patch('/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const updates = req.body;

    const isPhone = /^0\d{9}$/.test(id) || /^\d{10,11}$/.test(id);

    try {
        // Build dynamic update query
        const allowedFields = ['name', 'email', 'address', 'status', 'tier', 'tags', 'internal_note'];
        const setClauses = [];
        const params = [];
        let paramIndex = 1;

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                setClauses.push(`${field} = $${paramIndex++}`);
                params.push(field === 'tags' ? JSON.stringify(updates[field]) : updates[field]);
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields to update' });
        }

        const whereClause = isPhone ? `phone = $${paramIndex}` : `id = $${paramIndex}`;
        const lookupValue = isPhone ? normalizePhone(id) : parseInt(id);
        params.push(lookupValue);

        const query = `
            UPDATE customers
            SET ${setClauses.join(', ')}, updated_at = NOW()
            WHERE ${whereClause}
            RETURNING *
        `;

        const result = await db.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to update customer');
    }
});

/**
 * GET /api/v2/customers/:id/activity
 * Get customer activity timeline
 */
router.get('/:id/activity', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const isPhone = /^0\d{9}$/.test(id) || /^\d{10,11}$/.test(id);

    try {
        // Get customer phone
        let phone;
        if (isPhone) {
            phone = normalizePhone(id);
        } else {
            const customerResult = await db.query('SELECT phone FROM customers WHERE id = $1', [parseInt(id)]);
            if (customerResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Customer not found' });
            }
            phone = customerResult.rows[0].phone;
        }

        const result = await db.query(`
            SELECT * FROM customer_activities
            WHERE phone = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `, [phone, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]);

        // Get total count
        const countResult = await db.query('SELECT COUNT(*) FROM customer_activities WHERE phone = $1', [phone]);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].count),
                totalPages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch customer activities');
    }
});

/**
 * GET /api/v2/customers/:id/rfm
 * Get RFM analysis for customer
 */
router.get('/:id/rfm', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    const isPhone = /^0\d{9}$/.test(id) || /^\d{10,11}$/.test(id);

    try {
        // Get customer ID
        let customerId;
        if (isPhone) {
            const customerResult = await db.query('SELECT id FROM customers WHERE phone = $1', [normalizePhone(id)]);
            if (customerResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Customer not found' });
            }
            customerId = customerResult.rows[0].id;
        } else {
            customerId = parseInt(id);
        }

        // Get RFM analysis using v2 function
        const result = await db.query('SELECT * FROM analyze_customer_rfm($1)', [customerId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to get RFM analysis');
    }
});

/**
 * POST /api/v2/customers/:id/notes
 * Add note to customer
 */
router.post('/:id/notes', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { content, category, is_pinned, created_by } = req.body;

    if (!content) {
        return res.status(400).json({ success: false, error: 'Content is required' });
    }

    const isPhone = /^0\d{9}$/.test(id) || /^\d{10,11}$/.test(id);

    try {
        // Get customer
        const customerQuery = isPhone
            ? 'SELECT id, phone FROM customers WHERE phone = $1'
            : 'SELECT id, phone FROM customers WHERE id = $1';
        const lookupValue = isPhone ? normalizePhone(id) : parseInt(id);

        const customerResult = await db.query(customerQuery, [lookupValue]);
        if (customerResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        const customer = customerResult.rows[0];

        const result = await db.query(`
            INSERT INTO customer_notes (phone, customer_id, content, category, is_pinned, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [customer.phone, customer.id, content, category || 'general', is_pinned || false, created_by || 'system']);

        // Log activity
        await db.query(`
            INSERT INTO customer_activities (phone, customer_id, activity_type, title, icon, color)
            VALUES ($1, $2, 'NOTE_ADDED', $3, 'sticky-note', 'yellow')
        `, [customer.phone, customer.id, content.substring(0, 100)]);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to add customer note');
    }
});

/**
 * POST /api/v2/customers/batch
 * Batch lookup multiple customers
 */
router.post('/batch', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phones, ids } = req.body;

    if ((!phones || !Array.isArray(phones)) && (!ids || !Array.isArray(ids))) {
        return res.status(400).json({ success: false, error: 'phones or ids array is required' });
    }

    try {
        let result;
        if (phones && phones.length > 0) {
            const normalizedPhones = phones.map(normalizePhone).filter(Boolean);
            result = await db.query(`
                SELECT c.*,
                    w.balance as wallet_balance,
                    w.virtual_balance as wallet_virtual_balance
                FROM customers c
                LEFT JOIN customer_wallets w ON c.id = w.customer_id
                WHERE c.phone = ANY($1)
            `, [normalizedPhones]);
        } else {
            result = await db.query(`
                SELECT c.*,
                    w.balance as wallet_balance,
                    w.virtual_balance as wallet_virtual_balance
                FROM customers c
                LEFT JOIN customer_wallets w ON c.id = w.customer_id
                WHERE c.id = ANY($1)
            `, [ids.map(id => parseInt(id))]);
        }

        const customerMap = {};
        result.rows.forEach(row => {
            const key = phones ? row.phone : row.id;
            customerMap[key] = {
                ...row,
                wallet: {
                    balance: parseFloat(row.wallet_balance) || 0,
                    virtualBalance: parseFloat(row.wallet_virtual_balance) || 0,
                    total: (parseFloat(row.wallet_balance) || 0) + (parseFloat(row.wallet_virtual_balance) || 0)
                }
            };
        });

        res.json({
            success: true,
            data: customerMap,
            found: result.rows.length,
            total: phones ? phones.length : ids.length
        });
    } catch (error) {
        handleError(res, error, 'Failed to batch lookup customers');
    }
});

/**
 * POST /api/v2/customers/search
 * Search customers
 */
router.post('/search', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { query, limit = 50 } = req.body;

    if (!query || query.length < 2) {
        return res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
    }

    try {
        // Try using search_customers_priority function if exists
        try {
            const result = await db.query('SELECT * FROM search_customers_priority($1, $2)', [query, parseInt(limit)]);
            return res.json({ success: true, data: result.rows });
        } catch (fnError) {
            // Fallback to simple search
            const result = await db.query(`
                SELECT c.*,
                    w.balance as wallet_balance,
                    w.virtual_balance as wallet_virtual_balance
                FROM customers c
                LEFT JOIN customer_wallets w ON c.id = w.customer_id
                WHERE c.phone ILIKE $1 OR c.name ILIKE $1
                ORDER BY
                    CASE WHEN c.phone = $2 THEN 0
                         WHEN c.phone LIKE $3 THEN 1
                         ELSE 2 END,
                    c.total_orders DESC NULLS LAST
                LIMIT $4
            `, [`%${query}%`, query, `${query}%`, parseInt(limit)]);

            return res.json({ success: true, data: result.rows });
        }
    } catch (error) {
        handleError(res, error, 'Failed to search customers');
    }
});

module.exports = router;
