// =====================================================
// CONVERSATION ROUTES
// Get conversations, create new conversations
// =====================================================

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// Get conversations for a user
router.get('/conversations', async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.headers['x-user-id'];
    const { limit = 50 } = req.query;

    if (!userId) {
        return res.status(401).json({
            error: 'Missing x-user-id header'
        });
    }

    try {
        // Get conversations with last message and unread count
        const result = await db.query(
            `SELECT
                c.conversation_id,
                c.type,
                c.group_name,
                c.created_at,
                c.updated_at,
                (
                    SELECT json_agg(json_build_object(
                        'userId', u.user_id,
                        'username', u.username,
                        'displayName', u.display_name,
                        'status', u.status
                    ))
                    FROM conversation_participants cp
                    JOIN users u ON cp.user_id = u.user_id
                    WHERE cp.conversation_id = c.conversation_id
                ) as participants,
                (
                    SELECT json_build_object(
                        'messageId', m.message_id,
                        'senderId', m.sender_id,
                        'type', m.message_type,
                        'text', m.text_content,
                        'createdAt', m.created_at
                    )
                    FROM messages m
                    WHERE m.conversation_id = c.conversation_id
                    ORDER BY m.created_at DESC
                    LIMIT 1
                ) as last_message,
                (
                    SELECT COUNT(*)
                    FROM messages m
                    WHERE m.conversation_id = c.conversation_id
                    AND m.created_at > COALESCE(
                        (SELECT last_read_at FROM conversation_participants
                         WHERE conversation_id = c.conversation_id AND user_id = $1),
                        '1970-01-01'
                    )
                    AND m.sender_id != $1
                ) as unread_count
            FROM conversations c
            JOIN conversation_participants cp ON c.conversation_id = cp.conversation_id
            WHERE cp.user_id = $1
            ORDER BY c.updated_at DESC
            LIMIT $2`,
            [userId, parseInt(limit)]
        );

        res.json({
            success: true,
            conversations: result.rows.map(row => ({
                id: row.conversation_id,
                type: row.type,
                groupName: row.group_name,
                participants: row.participants || [],
                lastMessage: row.last_message,
                unreadCount: parseInt(row.unread_count) || 0,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            })),
            count: result.rows.length
        });
    } catch (error) {
        console.error('Failed to get conversations:', error);
        res.status(500).json({
            error: 'Failed to get conversations',
            message: error.message
        });
    }
});

// Create new conversation
router.post('/conversations', async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.headers['x-user-id'];
    const { participants, type = 'direct', groupName } = req.body;

    if (!userId) {
        return res.status(401).json({
            error: 'Missing x-user-id header'
        });
    }

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
        return res.status(400).json({
            error: 'Missing or invalid participants array'
        });
    }

    if (type === 'group' && !groupName) {
        return res.status(400).json({
            error: 'Group name required for group conversations'
        });
    }

    if (type === 'direct' && participants.length !== 1) {
        return res.status(400).json({
            error: 'Direct conversation must have exactly 1 participant (besides you)'
        });
    }

    try {
        const conversationId = uuidv4();
        const allParticipants = [userId, ...participants];

        // Check if direct conversation already exists
        if (type === 'direct') {
            const existing = await db.query(
                `SELECT c.conversation_id
                 FROM conversations c
                 WHERE c.type = 'direct'
                 AND EXISTS (
                     SELECT 1 FROM conversation_participants cp1
                     WHERE cp1.conversation_id = c.conversation_id AND cp1.user_id = $1
                 )
                 AND EXISTS (
                     SELECT 1 FROM conversation_participants cp2
                     WHERE cp2.conversation_id = c.conversation_id AND cp2.user_id = $2
                 )
                 AND (
                     SELECT COUNT(*) FROM conversation_participants
                     WHERE conversation_id = c.conversation_id
                 ) = 2`,
                [userId, participants[0]]
            );

            if (existing.rows.length > 0) {
                return res.json({
                    success: true,
                    conversationId: existing.rows[0].conversation_id,
                    existing: true,
                    message: 'Conversation already exists'
                });
            }
        }

        // Create conversation
        await db.query(
            'INSERT INTO conversations (conversation_id, type, group_name) VALUES ($1, $2, $3)',
            [conversationId, type, groupName]
        );

        // Add participants
        for (const participantId of allParticipants) {
            await db.query(
                'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2)',
                [conversationId, participantId]
            );
        }

        console.log(`✅ Created ${type} conversation: ${conversationId}`);

        res.json({
            success: true,
            conversationId,
            type,
            groupName,
            participants: allParticipants,
            existing: false
        });
    } catch (error) {
        console.error('Failed to create conversation:', error);
        res.status(500).json({
            error: 'Failed to create conversation',
            message: error.message
        });
    }
});

module.exports = router;
