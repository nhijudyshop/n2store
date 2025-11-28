// =====================================================
// AUTH ROUTES
// User authentication and registration
// =====================================================

const express = require('express');
const router = express.Router();

// Sync user to database (first time login or update)
router.post('/sync-user', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { userId, username, displayName } = req.body;

    if (!userId || !username) {
        return res.status(400).json({
            error: 'Missing required fields',
            required: ['userId', 'username']
        });
    }

    try {
        // Insert or update user
        const result = await db.query(
            `INSERT INTO users (user_id, username, display_name, status, last_seen)
             VALUES ($1, $2, $3, 'offline', CURRENT_TIMESTAMP)
             ON CONFLICT (user_id)
             DO UPDATE SET
                username = EXCLUDED.username,
                display_name = EXCLUDED.display_name,
                last_seen = CURRENT_TIMESTAMP
             RETURNING *`,
            [userId, username, displayName || username]
        );

        const user = result.rows[0];

        console.log(`✅ User synced: ${username} (${userId})`);

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
        console.error('Failed to sync user:', error);
        res.status(500).json({
            error: 'Failed to sync user',
            message: error.message
        });
    }
});

module.exports = router;
