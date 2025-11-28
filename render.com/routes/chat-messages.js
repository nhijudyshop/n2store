// =====================================================
// MESSAGE ROUTES
// Send/receive messages, mark as read
// =====================================================

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// Get messages for a conversation
router.get('/messages/:conversationId', async (req, res) => {
    const db = req.app.locals.chatDb;
    const userId = req.headers['x-user-id'];
    const { conversationId } = req.params;
    const { limit = 50, before } = req.query;

    if (!userId) {
        return res.status(401).json({
            error: 'Missing x-user-id header'
        });
    }

    try {
        // Verify user is participant
        const participantCheck = await db.query(
            'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
            [conversationId, userId]
        );

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({
                error: 'Not a participant of this conversation'
            });
        }

        // Build query
        let query = `
            SELECT
                m.message_id,
                m.sender_id,
                m.message_type,
                m.text_content,
                m.file_url,
                m.file_name,
                m.file_size,
                m.created_at,
                u.username as sender_username,
                u.display_name as sender_display_name
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.user_id
            WHERE m.conversation_id = $1
        `;
        const params = [conversationId];

        if (before) {
            query += ' AND m.created_at < $2';
            params.push(before);
        }

        query += ' ORDER BY m.created_at DESC LIMIT $' + (params.length + 1);
        params.push(parseInt(limit));

        const result = await db.query(query, params);

        // Reverse to get chronological order
        const messages = result.rows.reverse().map(row => ({
            id: row.message_id,
            conversationId,
            senderId: row.sender_id,
            senderUsername: row.sender_username,
            senderDisplayName: row.sender_display_name,
            type: row.message_type,
            text: row.text_content,
            fileUrl: row.file_url,
            fileName: row.file_name,
            fileSize: row.file_size,
            createdAt: row.created_at
        }));

        res.json({
            success: true,
            messages,
            count: messages.length,
            conversationId
        });
    } catch (error) {
        console.error('Failed to get messages:', error);
        res.status(500).json({
            error: 'Failed to get messages',
            message: error.message
        });
    }
});

// Send a message
router.post('/messages', async (req, res) => {
    const db = req.app.locals.chatDb;
    const userId = req.headers['x-user-id'];
    const { conversationId, text, type = 'text', fileUrl, fileName, fileSize } = req.body;

    if (!userId) {
        return res.status(401).json({
            error: 'Missing x-user-id header'
        });
    }

    if (!conversationId) {
        return res.status(400).json({
            error: 'Missing conversationId'
        });
    }

    if (type === 'text' && !text) {
        return res.status(400).json({
            error: 'Missing text content'
        });
    }

    if ((type === 'image' || type === 'file') && !fileUrl) {
        return res.status(400).json({
            error: 'Missing file URL'
        });
    }

    try {
        // Verify user is participant
        const participantCheck = await db.query(
            'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
            [conversationId, userId]
        );

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({
                error: 'Not a participant of this conversation'
            });
        }

        // Create message
        const messageId = uuidv4();
        const result = await db.query(
            `INSERT INTO messages (message_id, conversation_id, sender_id, message_type, text_content, file_url, file_name, file_size)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [messageId, conversationId, userId, type, text, fileUrl, fileName, fileSize]
        );

        const message = result.rows[0];

        // Get sender info
        const senderResult = await db.query(
            'SELECT username, display_name FROM users WHERE user_id = $1',
            [userId]
        );
        const sender = senderResult.rows[0];

        const messageData = {
            id: message.message_id,
            conversationId: message.conversation_id,
            senderId: message.sender_id,
            senderUsername: sender.username,
            senderDisplayName: sender.display_name,
            type: message.message_type,
            text: message.text_content,
            fileUrl: message.file_url,
            fileName: message.file_name,
            fileSize: message.file_size,
            createdAt: message.created_at
        };

        console.log(`✅ Message sent: ${messageId} in ${conversationId}`);

        // Broadcast to all participants via SSE
        const broadcast = req.app.locals.broadcastToConversation;
        await broadcast(conversationId, 'new-message', messageData);

        res.json({
            success: true,
            message: messageData
        });
    } catch (error) {
        console.error('Failed to send message:', error);
        res.status(500).json({
            error: 'Failed to send message',
            message: error.message
        });
    }
});

// Mark messages as read
router.post('/messages/read', async (req, res) => {
    const db = req.app.locals.chatDb;
    const userId = req.headers['x-user-id'];
    const { conversationId } = req.body;

    if (!userId) {
        return res.status(401).json({
            error: 'Missing x-user-id header'
        });
    }

    if (!conversationId) {
        return res.status(400).json({
            error: 'Missing conversationId'
        });
    }

    try {
        await db.query(
            'UPDATE conversation_participants SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = $1 AND user_id = $2',
            [conversationId, userId]
        );

        res.json({
            success: true,
            conversationId
        });
    } catch (error) {
        console.error('Failed to mark as read:', error);
        res.status(500).json({
            error: 'Failed to mark as read',
            message: error.message
        });
    }
});

module.exports = router;
