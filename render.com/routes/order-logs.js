// =====================================================
// ORDER LOGS ROUTES
// CRUD operations for supplier order logs
// =====================================================

const express = require('express');
const router = express.Router();

// Get order logs for a specific date
router.get('/order-logs', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({
            error: 'Missing date parameter'
        });
    }

    try {
        // Check if date is a holiday
        const holidayCheck = await db.query(
            'SELECT id, note FROM holiday_dates WHERE date = $1',
            [date]
        );
        const isHoliday = holidayCheck.rows.length > 0;

        const query = `
            SELECT
                id,
                date,
                ncc,
                amount,
                is_paid,
                difference,
                note,
                performed_by,
                is_reconciled,
                created_at,
                updated_at,
                created_by,
                updated_by
            FROM order_logs
            WHERE date = $1
            ORDER BY created_at ASC
        `;

        const result = await db.query(query, [date]);

        // Calculate summary
        const summary = {
            totalAmount: 0,
            paidAmount: 0,
            unpaidAmount: 0,
            totalDifference: 0,
            count: result.rows.length
        };

        result.rows.forEach(row => {
            summary.totalAmount += parseInt(row.amount || 0);
            if (row.is_paid) {
                summary.paidAmount += parseInt(row.amount || 0);
            } else {
                summary.unpaidAmount += parseInt(row.amount || 0);
            }
            summary.totalDifference += parseInt(row.difference || 0);
        });

        res.json({
            success: true,
            date,
            isHoliday,
            holidayNote: isHoliday ? holidayCheck.rows[0].note : null,
            orders: result.rows.map(row => ({
                id: row.id,
                date: row.date,
                ncc: row.ncc,
                amount: parseInt(row.amount),
                isPaid: row.is_paid,
                difference: parseInt(row.difference || 0),
                note: row.note,
                performedBy: row.performed_by,
                isReconciled: row.is_reconciled,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                createdBy: row.created_by,
                updatedBy: row.updated_by
            })),
            summary
        });
    } catch (error) {
        console.error('Failed to get order logs:', error);
        res.status(500).json({
            error: 'Failed to get order logs',
            message: error.message
        });
    }
});

// Create a new order log
router.post('/order-logs', async (req, res) => {
    const db = req.app.locals.chatDb;
    const userId = req.headers['x-user-id'];
    const { date, ncc, amount, isPaid = false, difference = 0, note = '', performedBy, isReconciled = false } = req.body;

    if (!date || !ncc || amount === undefined) {
        return res.status(400).json({
            error: 'Missing required fields: date, ncc, amount'
        });
    }

    try {
        const query = `
            INSERT INTO order_logs (date, ncc, amount, is_paid, difference, note, performed_by, is_reconciled, created_by, updated_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
            RETURNING *
        `;

        const result = await db.query(query, [
            date,
            ncc,
            amount,
            isPaid,
            difference,
            note,
            performedBy || null,
            isReconciled,
            userId || 'anonymous'
        ]);

        const row = result.rows[0];

        res.status(201).json({
            success: true,
            order: {
                id: row.id,
                date: row.date,
                ncc: row.ncc,
                amount: parseInt(row.amount),
                isPaid: row.is_paid,
                difference: parseInt(row.difference || 0),
                note: row.note,
                performedBy: row.performed_by,
                isReconciled: row.is_reconciled,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                createdBy: row.created_by,
                updatedBy: row.updated_by
            }
        });
    } catch (error) {
        console.error('Failed to create order log:', error);
        res.status(500).json({
            error: 'Failed to create order log',
            message: error.message
        });
    }
});

// Update an order log
router.put('/order-logs/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    const userId = req.headers['x-user-id'];
    const { id } = req.params;
    const { ncc, amount, isPaid, difference, note, performedBy, isReconciled } = req.body;

    try {
        // Build dynamic update query
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (ncc !== undefined) {
            updates.push(`ncc = $${paramCount++}`);
            values.push(ncc);
        }
        if (amount !== undefined) {
            updates.push(`amount = $${paramCount++}`);
            values.push(amount);
        }
        if (isPaid !== undefined) {
            updates.push(`is_paid = $${paramCount++}`);
            values.push(isPaid);
        }
        if (difference !== undefined) {
            updates.push(`difference = $${paramCount++}`);
            values.push(difference);
        }
        if (note !== undefined) {
            updates.push(`note = $${paramCount++}`);
            values.push(note);
        }
        if (performedBy !== undefined) {
            updates.push(`performed_by = $${paramCount++}`);
            values.push(performedBy || null);
        }
        if (isReconciled !== undefined) {
            updates.push(`is_reconciled = $${paramCount++}`);
            values.push(isReconciled);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                error: 'No fields to update'
            });
        }

        updates.push(`updated_by = $${paramCount++}`);
        values.push(userId || 'anonymous');

        values.push(id);

        const query = `
            UPDATE order_logs
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await db.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Order log not found'
            });
        }

        const row = result.rows[0];

        res.json({
            success: true,
            order: {
                id: row.id,
                date: row.date,
                ncc: row.ncc,
                amount: parseInt(row.amount),
                isPaid: row.is_paid,
                difference: parseInt(row.difference || 0),
                note: row.note,
                performedBy: row.performed_by,
                isReconciled: row.is_reconciled,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                createdBy: row.created_by,
                updatedBy: row.updated_by
            }
        });
    } catch (error) {
        console.error('Failed to update order log:', error);
        res.status(500).json({
            error: 'Failed to update order log',
            message: error.message
        });
    }
});

// Delete an order log
router.delete('/order-logs/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    try {
        const query = 'DELETE FROM order_logs WHERE id = $1 RETURNING *';
        const result = await db.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Order log not found'
            });
        }

        res.json({
            success: true,
            message: 'Order log deleted successfully',
            id: parseInt(id)
        });
    } catch (error) {
        console.error('Failed to delete order log:', error);
        res.status(500).json({
            error: 'Failed to delete order log',
            message: error.message
        });
    }
});

// =====================================================
// HOLIDAY MANAGEMENT ENDPOINTS
// =====================================================

// Get all holidays
router.get('/holidays', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const query = `
            SELECT id, date, note, created_at, created_by
            FROM holiday_dates
            ORDER BY date DESC
        `;

        const result = await db.query(query);

        res.json({
            success: true,
            holidays: result.rows.map(row => ({
                id: row.id,
                date: row.date,
                note: row.note,
                createdAt: row.created_at,
                createdBy: row.created_by
            }))
        });
    } catch (error) {
        console.error('Failed to get holidays:', error);
        res.status(500).json({
            error: 'Failed to get holidays',
            message: error.message
        });
    }
});

// Add a holiday
router.post('/holidays', async (req, res) => {
    const db = req.app.locals.chatDb;
    const userId = req.headers['x-user-id'];
    const { date, note = '' } = req.body;

    if (!date) {
        return res.status(400).json({
            error: 'Missing required field: date'
        });
    }

    try {
        const query = `
            INSERT INTO holiday_dates (date, note, created_by)
            VALUES ($1, $2, $3)
            ON CONFLICT (date) DO UPDATE SET note = $2
            RETURNING *
        `;

        const result = await db.query(query, [date, note, userId || 'anonymous']);
        const row = result.rows[0];

        res.status(201).json({
            success: true,
            holiday: {
                id: row.id,
                date: row.date,
                note: row.note,
                createdAt: row.created_at,
                createdBy: row.created_by
            }
        });
    } catch (error) {
        console.error('Failed to create holiday:', error);
        res.status(500).json({
            error: 'Failed to create holiday',
            message: error.message
        });
    }
});

// Delete a holiday
router.delete('/holidays/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    try {
        const query = 'DELETE FROM holiday_dates WHERE id = $1 RETURNING *';
        const result = await db.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Holiday not found'
            });
        }

        res.json({
            success: true,
            message: 'Holiday deleted successfully',
            id: parseInt(id)
        });
    } catch (error) {
        console.error('Failed to delete holiday:', error);
        res.status(500).json({
            error: 'Failed to delete holiday',
            message: error.message
        });
    }
});

module.exports = router;
