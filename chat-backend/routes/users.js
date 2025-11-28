// =====================================================
// USER ROUTES
// Get users, user status, etc.
// =====================================================

const express = require('express');
const router = express.Router();

// Get all users or filter by status
router.get('/users', async (req, res) => {
    const db = req.app.locals.db;
    const { online, limit = 50 } = req.query;

    try {
        let query = 'SELECT user_id, username, display_name, status, last_seen FROM users';
        const params = [];

        if (online === 'true') {
            query += ' WHERE status = $1';
            params.push('online');
        }

        query += ' ORDER BY last_seen DESC LIMIT $' + (params.length + 1);
        params.push(parseInt(limit));

        const result = await db.query(query, params);

        res.json({
            success: true,
            users: result.rows.map(user => ({
                userId: user.user_id,
                username: user.username,
                displayName: user.display_name,
                status: user.status,
                lastSeen: user.last_seen
            })),
            count: result.rows.length
        });
    } catch (error) {
        console.error('Failed to get users:', error);
        res.status(500).json({
            error: 'Failed to get users',
            message: error.message
        });
    }
});

// Get specific user by ID
router.get('/users/:userId', async (req, res) => {
    const db = req.app.locals.db;
    const { userId } = req.params;

    try {
        const result = await db.query(
            'SELECT user_id, username, display_name, status, last_seen, created_at FROM users WHERE user_id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                userId
            });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            user: {
                userId: user.user_id,
                username: user.username,
                displayName: user.display_name,
                status: user.status,
                lastSeen: user.last_seen,
                createdAt: user.created_at
            }
        });
    } catch (error) {
        console.error('Failed to get user:', error);
        res.status(500).json({
            error: 'Failed to get user',
            message: error.message
        });
    }
});

module.exports = router;
