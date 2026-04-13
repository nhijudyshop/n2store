// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * DELIVERY ASSIGNMENTS API v2
 * Khóa cứng phân chia đơn giao hàng theo ngày → đồng bộ giữa các máy
 *
 * Endpoints:
 *   GET    /                    - List assignments by date
 *   POST   /                    - Bulk upsert assignments (chỉ thêm mới, không ghi đè)
 *   DELETE /:orderNumber        - Remove single assignment (admin only)
 *   DELETE /                    - Remove all assignments for a date (admin only)
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
            const parsed = JSON.parse(authData);
            return parsed.userName || parsed.displayName || parsed.userId || 'anonymous';
        }
    } catch (_) { /* ignore */ }
    return 'anonymous';
}

// =====================================================
// GET / — Load all assignments for a date
// Query: ?date=2026-04-12
// =====================================================
router.get('/', async (req, res) => {
    try {
        const db = getDb(req);
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ success: false, error: 'Missing date parameter' });
        }

        const result = await db.query(
            `SELECT order_number, group_name, amount_total, cash_on_delivery, carrier_name, assigned_by, created_at
             FROM delivery_assignments
             WHERE assignment_date = $1
             ORDER BY created_at ASC`,
            [date]
        );

        // Return as a map { orderNumber: groupName } for easy frontend consumption
        const assignments = {};
        const details = [];
        for (const row of result.rows) {
            assignments[row.order_number] = row.group_name;
            details.push(row);
        }

        res.json({
            success: true,
            data: {
                date,
                assignments,
                details,
                totalCount: result.rows.length
            }
        });
    } catch (err) {
        console.error('[delivery-assignments] GET / error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// POST / — Bulk insert assignments (ON CONFLICT DO NOTHING)
// Body: { date, assignments: [{ orderNumber, groupName, amountTotal, cashOnDelivery, carrierName }] }
// Đơn đã có trong DB sẽ KHÔNG bị ghi đè
// =====================================================
router.post('/', async (req, res) => {
    try {
        const db = getDb(req);
        const { date, assignments } = req.body;
        const user = getUserFromHeaders(req);

        if (!date || !assignments || !Array.isArray(assignments) || assignments.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing date or assignments array' });
        }

        // Build bulk insert with ON CONFLICT DO NOTHING
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

        // ON CONFLICT DO NOTHING = đơn đã chia trước đó không bị thay đổi
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
            data: {
                inserted,
                skipped,
                insertedOrders: result.rows.map(r => r.order_number)
            }
        });
    } catch (err) {
        console.error('[delivery-assignments] POST / error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PUT /:orderNumber — Update group for single order (admin move)
// Query: ?date=2026-04-12
// Body: { groupName }
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
// Query: ?date=2026-04-12
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

        res.json({
            success: true,
            data: { deleted: result.rows.length > 0 }
        });
    } catch (err) {
        console.error('[delivery-assignments] DELETE error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
