// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * PURCHASE ORDERS API v2
 * Migrated from Firestore → PostgreSQL for faster queries
 *
 * Endpoints:
 *   GET    /                  - List orders by status with pagination
 *   GET    /stats             - Stats + status counts (single query)
 *   GET    /:id               - Get single order
 *   POST   /                  - Create order
 *   PUT    /:id               - Update order
 *   PATCH  /:id/status        - Change status
 *   DELETE /:id               - Soft delete (move to trash)
 *   POST   /:id/restore       - Restore from trash
 *   DELETE /:id/permanent     - Hard delete
 *   POST   /:id/copy          - Copy order as new draft
 *   POST   /generate-number   - Generate next order number
 *   POST   /cleanup-trash     - Auto-cleanup old trash
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const { v4: uuidv4 } = require('uuid');

// ========================================
// HELPERS
// ========================================

function getUserFromHeaders(req) {
    try {
        const authData = req.headers['x-auth-data'];
        if (authData) {
            const parsed = JSON.parse(authData);
            return {
                uid: parsed.userId || parsed.userType || 'anonymous',
                displayName: parsed.userName || 'User',
                email: parsed.email || ''
            };
        }
    } catch (e) { /* ignore */ }
    return { uid: 'anonymous', displayName: 'Anonymous', email: '' };
}

function toSnakeOrder(row) {
    if (!row) return null;
    return {
        id: row.id,
        orderNumber: row.order_number,
        orderType: row.order_type,
        orderDate: row.order_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        status: row.status,
        previousStatus: row.previous_status,
        supplier: (row.supplier_code || row.supplier_name) ? {
            code: row.supplier_code || '',
            name: row.supplier_name || ''
        } : null,
        invoiceAmount: parseFloat(row.invoice_amount) || 0,
        totalAmount: parseFloat(row.total_amount) || 0,
        discountAmount: parseFloat(row.discount_amount) || 0,
        shippingFee: parseFloat(row.shipping_fee) || 0,
        finalAmount: parseFloat(row.final_amount) || 0,
        invoiceImages: row.invoice_images || [],
        notes: row.notes || '',
        items: row.items || [],
        statusHistory: row.status_history || [],
        totalItems: row.total_items || 0,
        totalQuantity: row.total_quantity || 0,
        createdBy: {
            uid: row.created_by_uid || '',
            displayName: row.created_by_name || '',
            email: row.created_by_email || ''
        },
        lastModifiedBy: {
            uid: row.last_modified_by_uid || '',
            displayName: row.last_modified_by_name || '',
            email: row.last_modified_by_email || ''
        }
    };
}

// ========================================
// GET /stats — Stats + status counts (1 query)
// ========================================
router.get('/stats', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                status,
                COUNT(*)::int as count,
                COALESCE(SUM(final_amount), 0)::numeric as total_value
            FROM purchase_orders
            GROUP BY status
        `);

        const todayResult = await pool.query(`
            SELECT
                COUNT(*)::int as count,
                COALESCE(SUM(final_amount), 0)::numeric as total_value
            FROM purchase_orders
            WHERE created_at >= CURRENT_DATE
              AND status NOT IN ('CANCELLED', 'DELETED')
        `);

        // Count TPOS synced orders
        const tposResult = await pool.query(`
            SELECT COUNT(*)::int as synced
            FROM purchase_orders
            WHERE status NOT IN ('CANCELLED', 'DELETED')
              AND items != '[]'::jsonb
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(items) item
                  WHERE item->>'tposSyncStatus' IS DISTINCT FROM 'success'
              )
        `);

        const counts = {};
        let totalOrders = 0;
        let totalValue = 0;

        for (const row of result.rows) {
            counts[row.status] = row.count;
            if (row.status !== 'CANCELLED' && row.status !== 'DELETED') {
                totalOrders += row.count;
                totalValue += parseFloat(row.total_value);
            }
        }

        const tposSyncedCount = tposResult.rows[0]?.synced || 0;

        res.json({
            success: true,
            stats: {
                totalOrders,
                totalValue,
                todayOrders: todayResult.rows[0]?.count || 0,
                todayValue: parseFloat(todayResult.rows[0]?.total_value) || 0,
                tposSyncRate: totalOrders > 0 ? Math.round((tposSyncedCount / totalOrders) * 100) : 0
            },
            counts
        });
    } catch (error) {
        console.error('[PO API] Stats error:', error);
        res.status(500).json({ success: false, error: 'Không thể tải thống kê' });
    }
});

// ========================================
// GET / — List orders by status with pagination
// ========================================
router.get('/', async (req, res) => {
    try {
        const {
            status,
            page = 1,
            pageSize = 20,
            startDate,
            endDate,
            search,
            orderBy = 'created_at',
            orderDirection = 'DESC',
            statusFilter
        } = req.query;

        const params = [];
        const conditions = [];
        let paramIndex = 1;

        // Status filter
        if (status) {
            if (status.includes(',')) {
                const statuses = status.split(',');
                conditions.push(`status = ANY($${paramIndex})`);
                params.push(statuses);
            } else {
                conditions.push(`status = $${paramIndex}`);
                params.push(status);
            }
            paramIndex++;
        }

        // Sub-status filter (for filtering within a tab, e.g. AWAITING_PURCHASE with specific sub-filter)
        if (statusFilter) {
            conditions.push(`status = $${paramIndex}`);
            params.push(statusFilter);
            paramIndex++;
        }

        // Date range
        if (startDate) {
            conditions.push(`order_date >= $${paramIndex}`);
            params.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            conditions.push(`order_date <= $${paramIndex}`);
            params.push(endDate);
            paramIndex++;
        }

        // Search (supplier name/code, order number, item product codes/names)
        if (search) {
            const searchLower = `%${search.toLowerCase()}%`;
            conditions.push(`(
                LOWER(order_number) LIKE $${paramIndex}
                OR LOWER(supplier_name) LIKE $${paramIndex}
                OR LOWER(supplier_code) LIKE $${paramIndex}
                OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements(items) item
                    WHERE LOWER(item->>'productCode') LIKE $${paramIndex}
                       OR LOWER(item->>'productName') LIKE $${paramIndex}
                )
            )`);
            params.push(searchLower);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // Validate orderBy to prevent SQL injection
        const allowedOrderBy = ['created_at', 'updated_at', 'order_date', 'final_amount', 'order_number'];
        const safeOrderBy = allowedOrderBy.includes(orderBy) ? orderBy : 'created_at';
        const safeDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const offset = (parseInt(page) - 1) * parseInt(pageSize);
        const limit = parseInt(pageSize) + 1; // +1 to check hasMore

        const query = `
            SELECT * FROM purchase_orders
            ${whereClause}
            ORDER BY ${safeOrderBy} ${safeDirection}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        const hasMore = result.rows.length > parseInt(pageSize);
        const orders = result.rows.slice(0, parseInt(pageSize)).map(toSnakeOrder);

        res.json({
            success: true,
            orders,
            hasMore,
            page: parseInt(page),
            pageSize: parseInt(pageSize)
        });
    } catch (error) {
        console.error('[PO API] List error:', error);
        res.status(500).json({ success: false, error: 'Không thể tải danh sách đơn hàng' });
    }
});

// ========================================
// GET /:id — Get single order
// ========================================
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Đơn hàng không tồn tại' });
        }
        res.json({ success: true, order: toSnakeOrder(result.rows[0]) });
    } catch (error) {
        console.error('[PO API] Get error:', error);
        res.status(500).json({ success: false, error: 'Không thể tải đơn hàng' });
    }
});

// ========================================
// POST /generate-number — Generate next order number
// ========================================
router.post('/generate-number', async (req, res) => {
    try {
        const today = new Date();
        const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const pattern = `PO-${datePrefix}-%`;

        const result = await pool.query(
            `SELECT order_number FROM purchase_orders
             WHERE order_number LIKE $1
             ORDER BY order_number DESC LIMIT 1`,
            [pattern]
        );

        let sequence = 1;
        if (result.rows.length > 0) {
            const parts = result.rows[0].order_number.split('-');
            if (parts.length >= 3) {
                const lastSeq = parseInt(parts[2], 10);
                if (!isNaN(lastSeq)) sequence = lastSeq + 1;
            }
        }

        res.json({
            success: true,
            orderNumber: `PO-${datePrefix}-${String(sequence).padStart(3, '0')}`
        });
    } catch (error) {
        console.error('[PO API] Generate number error:', error);
        res.status(500).json({ success: false, error: 'Không thể tạo mã đơn hàng' });
    }
});

// ========================================
// POST / — Create order
// ========================================
router.post('/', async (req, res) => {
    try {
        const user = getUserFromHeaders(req);
        const data = req.body;

        // Generate order number
        const numResult = await pool.query(
            `SELECT order_number FROM purchase_orders
             WHERE order_number LIKE $1
             ORDER BY order_number DESC LIMIT 1`,
            [`PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-%`]
        );

        let sequence = 1;
        if (numResult.rows.length > 0) {
            const parts = numResult.rows[0].order_number.split('-');
            if (parts.length >= 3) {
                const lastSeq = parseInt(parts[2], 10);
                if (!isNaN(lastSeq)) sequence = lastSeq + 1;
            }
        }

        const today = new Date();
        const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const orderNumber = `PO-${datePrefix}-${String(sequence).padStart(3, '0')}`;

        const items = data.items || [];
        const totalAmount = items.reduce((sum, item) => sum + (item.purchasePrice || 0) * (item.quantity || 1), 0);
        const finalAmount = totalAmount - (data.discountAmount || 0) + (data.shippingFee || 0);
        const status = data.status || 'DRAFT';

        const statusHistory = [{
            from: null,
            to: status,
            changedAt: new Date().toISOString(),
            changedBy: user
        }];

        // Prepare items with IDs
        const preparedItems = items.map((item, index) => ({
            id: item.id || uuidv4(),
            position: index + 1,
            productCode: item.productCode || '',
            productName: item.productName || '',
            variant: item.variant || '',
            selectedAttributeValueIds: item.selectedAttributeValueIds || [],
            productImages: (item.productImages || []).filter(u => typeof u === 'string' && !u.startsWith('data:')),
            priceImages: (item.priceImages || []).filter(u => typeof u === 'string' && !u.startsWith('data:')),
            purchasePrice: item.purchasePrice || 0,
            sellingPrice: item.sellingPrice || 0,
            quantity: item.quantity || 1,
            subtotal: (item.purchasePrice || 0) * (item.quantity || 1),
            notes: item.notes || '',
            tposSyncStatus: item.tposSyncStatus || null,
            tposProductId: item.tposProductId || null,
            tposProductTmplId: item.tposProductTmplId || null,
            tposSynced: item.tposSynced || false
        }));

        const invoiceImages = (data.invoiceImages || []).filter(u => typeof u === 'string' && !u.startsWith('data:'));

        const result = await pool.query(`
            INSERT INTO purchase_orders (
                order_number, order_type, order_date, status,
                supplier_code, supplier_name,
                invoice_amount, total_amount, discount_amount, shipping_fee, final_amount,
                invoice_images, notes, items, status_history,
                total_items, total_quantity,
                created_by_uid, created_by_name, created_by_email,
                last_modified_by_uid, last_modified_by_name, last_modified_by_email
            ) VALUES (
                $1, $2, $3, $4,
                $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14, $15,
                $16, $17,
                $18, $19, $20,
                $18, $19, $20
            )
            RETURNING *
        `, [
            orderNumber,
            data.orderType || 'NJD SHOP',
            data.orderDate || new Date(),
            status,
            data.supplier?.code || null,
            data.supplier?.name || null,
            data.invoiceAmount || 0,
            totalAmount,
            data.discountAmount || 0,
            data.shippingFee || 0,
            finalAmount,
            invoiceImages,
            data.notes || '',
            JSON.stringify(preparedItems),
            JSON.stringify(statusHistory),
            preparedItems.length,
            preparedItems.reduce((sum, item) => sum + (item.quantity || 0), 0),
            user.uid,
            user.displayName,
            user.email
        ]);

        res.json({ success: true, id: result.rows[0].id, order: toSnakeOrder(result.rows[0]) });
    } catch (error) {
        console.error('[PO API] Create error:', error);
        res.status(500).json({ success: false, error: 'Không thể tạo đơn hàng' });
    }
});

// ========================================
// PUT /:id — Update order
// ========================================
router.put('/:id', async (req, res) => {
    try {
        const user = getUserFromHeaders(req);
        const data = req.body;
        const orderId = req.params.id;

        // Check exists
        const existing = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [orderId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Đơn hàng không tồn tại' });
        }

        const current = existing.rows[0];

        // Build dynamic update
        const updates = [];
        const params = [];
        let paramIndex = 1;

        const setField = (column, value) => {
            updates.push(`${column} = $${paramIndex}`);
            params.push(value);
            paramIndex++;
        };

        if (data.orderType !== undefined) setField('order_type', data.orderType);
        if (data.orderDate !== undefined) setField('order_date', data.orderDate);
        if (data.supplier !== undefined) {
            setField('supplier_code', data.supplier?.code || null);
            setField('supplier_name', data.supplier?.name || null);
        }
        if (data.invoiceAmount !== undefined) setField('invoice_amount', data.invoiceAmount);
        if (data.discountAmount !== undefined) setField('discount_amount', data.discountAmount);
        if (data.shippingFee !== undefined) setField('shipping_fee', data.shippingFee);
        if (data.notes !== undefined) setField('notes', data.notes);
        if (data.invoiceImages !== undefined) {
            setField('invoice_images', (data.invoiceImages || []).filter(u => typeof u === 'string' && !u.startsWith('data:')));
        }

        if (data.items !== undefined) {
            const items = data.items || [];
            const preparedItems = items.map((item, index) => ({
                id: item.id || uuidv4(),
                position: index + 1,
                productCode: item.productCode || '',
                productName: item.productName || '',
                variant: item.variant || '',
                selectedAttributeValueIds: item.selectedAttributeValueIds || [],
                productImages: (item.productImages || []).filter(u => typeof u === 'string' && !u.startsWith('data:')),
                priceImages: (item.priceImages || []).filter(u => typeof u === 'string' && !u.startsWith('data:')),
                purchasePrice: item.purchasePrice || 0,
                sellingPrice: item.sellingPrice || 0,
                quantity: item.quantity || 1,
                subtotal: (item.purchasePrice || 0) * (item.quantity || 1),
                notes: item.notes || '',
                tposSyncStatus: item.tposSyncStatus || null,
                tposProductId: item.tposProductId || null,
                tposProductTmplId: item.tposProductTmplId || null,
                tposSynced: item.tposSynced || false
            }));

            setField('items', JSON.stringify(preparedItems));
            const totalAmount = preparedItems.reduce((s, i) => s + i.subtotal, 0);
            const discountAmount = data.discountAmount ?? parseFloat(current.discount_amount) ?? 0;
            const shippingFee = data.shippingFee ?? parseFloat(current.shipping_fee) ?? 0;
            setField('total_amount', totalAmount);
            setField('final_amount', totalAmount - discountAmount + shippingFee);
            setField('total_items', preparedItems.length);
            setField('total_quantity', preparedItems.reduce((s, i) => s + (i.quantity || 0), 0));
        }

        setField('updated_at', new Date());
        setField('last_modified_by_uid', user.uid);
        setField('last_modified_by_name', user.displayName);
        setField('last_modified_by_email', user.email);

        params.push(orderId);
        const query = `UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
        const result = await pool.query(query, params);

        res.json({ success: true, order: toSnakeOrder(result.rows[0]) });
    } catch (error) {
        console.error('[PO API] Update error:', error);
        res.status(500).json({ success: false, error: 'Không thể cập nhật đơn hàng' });
    }
});

// ========================================
// PATCH /:id/status — Change status
// ========================================
router.patch('/:id/status', async (req, res) => {
    try {
        const user = getUserFromHeaders(req);
        const { status: newStatus, reason } = req.body;
        const orderId = req.params.id;

        const existing = await pool.query('SELECT status, status_history FROM purchase_orders WHERE id = $1', [orderId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Đơn hàng không tồn tại' });
        }

        const currentStatus = existing.rows[0].status;
        const statusHistory = existing.rows[0].status_history || [];

        statusHistory.push({
            from: currentStatus,
            to: newStatus,
            changedAt: new Date().toISOString(),
            changedBy: user,
            reason: reason || null
        });

        const result = await pool.query(`
            UPDATE purchase_orders
            SET status = $1, status_history = $2, updated_at = NOW(),
                last_modified_by_uid = $3, last_modified_by_name = $4, last_modified_by_email = $5
            WHERE id = $6
            RETURNING *
        `, [newStatus, JSON.stringify(statusHistory), user.uid, user.displayName, user.email, orderId]);

        res.json({ success: true, order: toSnakeOrder(result.rows[0]) });
    } catch (error) {
        console.error('[PO API] Status update error:', error);
        res.status(500).json({ success: false, error: 'Không thể cập nhật trạng thái' });
    }
});

// ========================================
// DELETE /:id — Soft delete (move to trash)
// ========================================
router.delete('/:id', async (req, res) => {
    try {
        const user = getUserFromHeaders(req);
        const orderId = req.params.id;

        const existing = await pool.query('SELECT status, status_history FROM purchase_orders WHERE id = $1', [orderId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Đơn hàng không tồn tại' });
        }

        const currentStatus = existing.rows[0].status;
        const statusHistory = existing.rows[0].status_history || [];

        statusHistory.push({
            from: currentStatus,
            to: 'DELETED',
            changedAt: new Date().toISOString(),
            changedBy: user
        });

        await pool.query(`
            UPDATE purchase_orders
            SET status = 'DELETED', deleted_at = NOW(), previous_status = $1,
                status_history = $2, updated_at = NOW(),
                last_modified_by_uid = $3, last_modified_by_name = $4, last_modified_by_email = $5
            WHERE id = $6
        `, [currentStatus, JSON.stringify(statusHistory), user.uid, user.displayName, user.email, orderId]);

        res.json({ success: true });
    } catch (error) {
        console.error('[PO API] Delete error:', error);
        res.status(500).json({ success: false, error: 'Không thể xóa đơn hàng' });
    }
});

// ========================================
// POST /:id/restore — Restore from trash
// ========================================
router.post('/:id/restore', async (req, res) => {
    try {
        const user = getUserFromHeaders(req);
        const orderId = req.params.id;

        const existing = await pool.query('SELECT status, previous_status, status_history FROM purchase_orders WHERE id = $1', [orderId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Đơn hàng không tồn tại' });
        }

        if (existing.rows[0].status !== 'DELETED') {
            return res.status(400).json({ success: false, error: 'Đơn hàng không nằm trong thùng rác' });
        }

        const restoreStatus = existing.rows[0].previous_status || 'DRAFT';
        const statusHistory = existing.rows[0].status_history || [];

        statusHistory.push({
            from: 'DELETED',
            to: restoreStatus,
            changedAt: new Date().toISOString(),
            changedBy: user,
            reason: 'Khôi phục từ thùng rác'
        });

        const result = await pool.query(`
            UPDATE purchase_orders
            SET status = $1, deleted_at = NULL, previous_status = NULL,
                status_history = $2, updated_at = NOW(),
                last_modified_by_uid = $3, last_modified_by_name = $4, last_modified_by_email = $5
            WHERE id = $6
            RETURNING *
        `, [restoreStatus, JSON.stringify(statusHistory), user.uid, user.displayName, user.email, orderId]);

        res.json({ success: true, order: toSnakeOrder(result.rows[0]) });
    } catch (error) {
        console.error('[PO API] Restore error:', error);
        res.status(500).json({ success: false, error: 'Không thể khôi phục đơn hàng' });
    }
});

// ========================================
// DELETE /:id/permanent — Hard delete
// ========================================
router.delete('/:id/permanent', async (req, res) => {
    try {
        const orderId = req.params.id;

        const existing = await pool.query('SELECT status FROM purchase_orders WHERE id = $1', [orderId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Đơn hàng không tồn tại' });
        }

        if (existing.rows[0].status !== 'DELETED') {
            return res.status(400).json({ success: false, error: 'Chỉ có thể xóa vĩnh viễn đơn hàng trong thùng rác' });
        }

        await pool.query('DELETE FROM purchase_orders WHERE id = $1', [orderId]);
        res.json({ success: true });
    } catch (error) {
        console.error('[PO API] Permanent delete error:', error);
        res.status(500).json({ success: false, error: 'Không thể xóa vĩnh viễn đơn hàng' });
    }
});

// ========================================
// POST /:id/copy — Copy order as new draft
// ========================================
router.post('/:id/copy', async (req, res) => {
    try {
        const user = getUserFromHeaders(req);
        const orderId = req.params.id;

        const existing = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [orderId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Đơn hàng nguồn không tồn tại' });
        }

        const source = existing.rows[0];
        const sourceItems = source.items || [];

        // Clone items with new IDs, clear TPOS sync
        const newItems = sourceItems.map((item, index) => ({
            ...item,
            id: uuidv4(),
            position: index + 1,
            productCode: item.parentProductCode || item.productCode,
            parentProductCode: null,
            tposSyncStatus: null,
            tposProductId: null,
            tposProductTmplId: null,
            tposSynced: false,
            tposSyncError: null,
            tposImageUrl: null
        }));

        // Generate new order number
        const today = new Date();
        const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const numResult = await pool.query(
            `SELECT order_number FROM purchase_orders WHERE order_number LIKE $1 ORDER BY order_number DESC LIMIT 1`,
            [`PO-${datePrefix}-%`]
        );

        let sequence = 1;
        if (numResult.rows.length > 0) {
            const parts = numResult.rows[0].order_number.split('-');
            if (parts.length >= 3) {
                const lastSeq = parseInt(parts[2], 10);
                if (!isNaN(lastSeq)) sequence = lastSeq + 1;
            }
        }
        const orderNumber = `PO-${datePrefix}-${String(sequence).padStart(3, '0')}`;

        const totalAmount = newItems.reduce((s, i) => s + (i.purchasePrice || 0) * (i.quantity || 1), 0);
        const notes = source.notes
            ? `[Sao chép từ ${source.order_number}] ${source.notes}`
            : `Sao chép từ ${source.order_number}`;

        const statusHistory = [{
            from: null,
            to: 'DRAFT',
            changedAt: new Date().toISOString(),
            changedBy: user
        }];

        const result = await pool.query(`
            INSERT INTO purchase_orders (
                order_number, order_type, order_date, status,
                supplier_code, supplier_name,
                invoice_amount, total_amount, discount_amount, shipping_fee, final_amount,
                invoice_images, notes, items, status_history,
                total_items, total_quantity,
                created_by_uid, created_by_name, created_by_email,
                last_modified_by_uid, last_modified_by_name, last_modified_by_email
            ) VALUES (
                $1, $2, NOW(), 'DRAFT',
                $3, $4,
                0, $5, 0, 0, $5,
                '{}', $6, $7, $8,
                $9, $10,
                $11, $12, $13,
                $11, $12, $13
            )
            RETURNING *
        `, [
            orderNumber,
            source.order_type,
            source.supplier_code,
            source.supplier_name,
            totalAmount,
            notes,
            JSON.stringify(newItems),
            JSON.stringify(statusHistory),
            newItems.length,
            newItems.reduce((s, i) => s + (i.quantity || 0), 0),
            user.uid, user.displayName, user.email
        ]);

        res.json({ success: true, id: result.rows[0].id, order: toSnakeOrder(result.rows[0]) });
    } catch (error) {
        console.error('[PO API] Copy error:', error);
        res.status(500).json({ success: false, error: 'Không thể sao chép đơn hàng' });
    }
});

// ========================================
// POST /cleanup-trash — Auto-cleanup old trash
// ========================================
router.post('/cleanup-trash', async (req, res) => {
    try {
        const { retentionDays = 30 } = req.body;

        const result = await pool.query(
            `DELETE FROM purchase_orders
             WHERE status = 'DELETED' AND deleted_at <= NOW() - INTERVAL '1 day' * $1
             RETURNING id`,
            [retentionDays]
        );

        res.json({ success: true, deletedCount: result.rowCount });
    } catch (error) {
        console.error('[PO API] Cleanup error:', error);
        res.status(500).json({ success: false, error: 'Cleanup failed' });
    }
});

module.exports = router;
