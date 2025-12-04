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
        const query = `
            SELECT
                id,
                date,
                ncc,
                amount,
                is_paid,
                difference,
                note,
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
            orders: result.rows.map(row => ({
                id: row.id,
                date: row.date,
                ncc: row.ncc,
                amount: parseInt(row.amount),
                isPaid: row.is_paid,
                difference: parseInt(row.difference || 0),
                note: row.note,
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
    const { date, ncc, amount, isPaid = false, difference = 0, note = '' } = req.body;

    if (!date || !ncc || amount === undefined) {
        return res.status(400).json({
            error: 'Missing required fields: date, ncc, amount'
        });
    }

    try {
        const query = `
            INSERT INTO order_logs (date, ncc, amount, is_paid, difference, note, created_by, updated_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
            RETURNING *
        `;

        const result = await db.query(query, [
            date,
            ncc,
            amount,
            isPaid,
            difference,
            note,
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
    const { ncc, amount, isPaid, difference, note } = req.body;

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

module.exports = router;
