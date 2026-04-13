// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * DELIVERY ASSIGNMENTS API v2
 * Source of truth cho phân chia đơn giao hàng — thay thế hoàn toàn Firestore
 *
 * Endpoints:
 *   GET    /                          - Load all assignments (groups + scanned + hidden) for a date
 *   POST   /                          - Bulk upsert assignments (ON CONFLICT DO NOTHING)
 *   PUT    /:orderNumber              - Update group for single order (admin move)
 *   DELETE /:orderNumber              - Remove single assignment
 *
 *   PATCH  /scan/:orderNumber         - Mark order as scanned
 *   PATCH  /unscan/:orderNumber       - Unmark order scan
 *   PATCH  /unscan-bulk               - Unmark multiple orders (bulk unscan)
 *   PATCH  /hide/:orderNumber         - Hide order (cancel approved)
 */

const express = require('express');
const router = express.Router();

function getDb(req) {
    return req.app.locals.chatDb;
}

function getUserFromHeaders(req) {
    try {
        const authData = req.headers['x-auth-data'];
        if (authData) {
            // Try base64 decode first (new format), fallback to raw JSON (old format)
            let jsonStr;
            try {
                jsonStr = decodeURIComponent(escape(Buffer.from(authData, 'base64').toString('binary')));
            } catch (_) {
                jsonStr = authData;
            }
            const parsed = JSON.parse(jsonStr);
            return parsed.userName || parsed.displayName || parsed.userId || 'anonymous';
        }
    } catch (_) { /* ignore */ }
    return 'anonymous';
}

// =====================================================
// GET / — Load all assignments for a date
// Returns: assignments map, scanned set, hidden set
// =====================================================
router.get('/', async (req, res) => {
    try {
        const db = getDb(req);
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ success: false, error: 'Missing date parameter' });
        }

        const result = await db.query(
            `SELECT order_number, group_name, amount_total, cash_on_delivery, carrier_name,
                    is_scanned, is_hidden, scanned_by, assigned_by, created_at
             FROM delivery_assignments
             WHERE assignment_date = $1
             ORDER BY created_at ASC`,
            [date]
        );

        const assignments = {};
        const scannedNumbers = [];
        const hiddenNumbers = [];

        for (const row of result.rows) {
            if (!row.is_hidden) {
                assignments[row.order_number] = row.group_name;
            }
            if (row.is_scanned) scannedNumbers.push(row.order_number);
            if (row.is_hidden) hiddenNumbers.push(row.order_number);
        }

        res.json({
            success: true,
            data: {
                date,
                assignments,
                scannedNumbers,
                hiddenNumbers,
                totalCount: result.rows.length,
                scannedCount: scannedNumbers.length,
                hiddenCount: hiddenNumbers.length
            }
        });
    } catch (err) {
        console.error('[delivery-assignments] GET / error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// POST / — Bulk insert assignments (ON CONFLICT DO NOTHING)
// =====================================================
router.post('/', async (req, res) => {
    try {
        const db = getDb(req);
        const { date, assignments } = req.body;
        const user = getUserFromHeaders(req);

        if (!date || !assignments || !Array.isArray(assignments) || assignments.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing date or assignments array' });
        }

        const values = [];
        const params = [];
        let paramIndex = 1;

        for (const a of assignments) {
            if (!a.orderNumber || !a.groupName) continue;
            values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6})`);
            params.push(
                date,
                a.orderNumber,
                a.groupName,
                a.amountTotal || 0,
                a.cashOnDelivery || 0,
                a.carrierName || '',
                user
            );
            paramIndex += 7;
        }

        if (values.length === 0) {
            return res.json({ success: true, data: { inserted: 0, skipped: 0 } });
        }

        const query = `
            INSERT INTO delivery_assignments (assignment_date, order_number, group_name, amount_total, cash_on_delivery, carrier_name, assigned_by)
            VALUES ${values.join(', ')}
            ON CONFLICT (assignment_date, order_number) DO NOTHING
            RETURNING order_number
        `;

        const result = await db.query(query, params);
        const inserted = result.rows.length;
        const skipped = assignments.length - inserted;

        console.log(`[delivery-assignments] POST: ${inserted} inserted, ${skipped} skipped for ${date}`);

        res.json({
            success: true,
            data: { inserted, skipped, insertedOrders: result.rows.map(r => r.order_number) }
        });
    } catch (err) {
        console.error('[delivery-assignments] POST / error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PATCH /scan/:orderNumber — Mark as scanned
// =====================================================
router.patch('/scan/:orderNumber', async (req, res) => {
    try {
        const db = getDb(req);
        const { orderNumber } = req.params;
        const { date } = req.query;
        const user = getUserFromHeaders(req);

        if (!date) {
            return res.status(400).json({ success: false, error: 'Missing date parameter' });
        }

        const result = await db.query(
            `UPDATE delivery_assignments
             SET is_scanned = TRUE, scanned_at = NOW(), scanned_by = $1, updated_at = NOW()
             WHERE assignment_date = $2 AND order_number = $3
             RETURNING order_number, is_scanned`,
            [user, date, orderNumber]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found for this date' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('[delivery-assignments] PATCH /scan error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PATCH /unscan/:orderNumber — Unmark scan
// =====================================================
router.patch('/unscan/:orderNumber', async (req, res) => {
    try {
        const db = getDb(req);
        const { orderNumber } = req.params;
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ success: false, error: 'Missing date parameter' });
        }

        const result = await db.query(
            `UPDATE delivery_assignments
             SET is_scanned = FALSE, scanned_at = NULL, scanned_by = NULL, updated_at = NOW()
             WHERE assignment_date = $1 AND order_number = $2
             RETURNING order_number`,
            [date, orderNumber]
        );

        res.json({ success: true, data: { unscanned: result.rows.length > 0 } });
    } catch (err) {
        console.error('[delivery-assignments] PATCH /unscan error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PATCH /unscan-bulk — Bulk unscan (for "Xóa tất cả" or group unscan)
// Body: { date, orderNumbers: [...] }
// =====================================================
router.patch('/unscan-bulk', async (req, res) => {
    try {
        const db = getDb(req);
        const { date, orderNumbers } = req.body;

        if (!date || !orderNumbers || !Array.isArray(orderNumbers) || orderNumbers.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing date or orderNumbers' });
        }

        const placeholders = orderNumbers.map((_, i) => `$${i + 2}`).join(', ');
        const result = await db.query(
            `UPDATE delivery_assignments
             SET is_scanned = FALSE, scanned_at = NULL, scanned_by = NULL, updated_at = NOW()
             WHERE assignment_date = $1 AND order_number IN (${placeholders})
             RETURNING order_number`,
            [date, ...orderNumbers]
        );

        res.json({ success: true, data: { unscanned: result.rows.length } });
    } catch (err) {
        console.error('[delivery-assignments] PATCH /unscan-bulk error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PATCH /hide/:orderNumber — Hide order (cancel approved)
// =====================================================
router.patch('/hide/:orderNumber', async (req, res) => {
    try {
        const db = getDb(req);
        const { orderNumber } = req.params;
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ success: false, error: 'Missing date parameter' });
        }

        const result = await db.query(
            `UPDATE delivery_assignments
             SET is_hidden = TRUE, is_scanned = FALSE, updated_at = NOW()
             WHERE assignment_date = $1 AND order_number = $2
             RETURNING order_number`,
            [date, orderNumber]
        );

        res.json({ success: true, data: { hidden: result.rows.length > 0 } });
    } catch (err) {
        console.error('[delivery-assignments] PATCH /hide error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PUT /:orderNumber — Update group (admin move)
// =====================================================
router.put('/:orderNumber', async (req, res) => {
    try {
        const db = getDb(req);
        const { orderNumber } = req.params;
        const { date } = req.query;
        const { groupName } = req.body;
        const user = getUserFromHeaders(req);

        if (!date || !groupName) {
            return res.status(400).json({ success: false, error: 'Missing date or groupName' });
        }

        const validGroups = ['tomato', 'nap', 'city', 'shop', 'return'];
        if (!validGroups.includes(groupName)) {
            return res.status(400).json({ success: false, error: `Invalid groupName. Must be one of: ${validGroups.join(', ')}` });
        }

        const result = await db.query(
            `UPDATE delivery_assignments
             SET group_name = $1, assigned_by = $2, updated_at = NOW()
             WHERE assignment_date = $3 AND order_number = $4
             RETURNING *`,
            [groupName, user, date, orderNumber]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Assignment not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('[delivery-assignments] PUT error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// DELETE /:orderNumber — Remove single assignment
// =====================================================
router.delete('/:orderNumber', async (req, res) => {
    try {
        const db = getDb(req);
        const { orderNumber } = req.params;
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ success: false, error: 'Missing date parameter' });
        }

        const result = await db.query(
            `DELETE FROM delivery_assignments WHERE assignment_date = $1 AND order_number = $2 RETURNING *`,
            [date, orderNumber]
        );

        res.json({ success: true, data: { deleted: result.rows.length > 0 } });
    } catch (err) {
        console.error('[delivery-assignments] DELETE error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
