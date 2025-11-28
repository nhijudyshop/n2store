// =====================================================
// CHAT REST API ROUTES
// Endpoints for chat functionality
// =====================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyN2StoreAuth, verifyParticipant } = require('../chat-server/auth-middleware');
const {
    db,
    admin,
    getOrCreateUser,
    getOrCreateDirectChat,
    sendMessage,
    markMessagesAsRead,
    uploadFile
} = require('../chat-server/firebase-service');

// Configure multer for file uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Apply auth middleware to all chat routes
router.use(verifyN2StoreAuth);

// =====================================================
// USER ENDPOINTS
// =====================================================

/**
 * POST /api/chat/sync-user
 * Sync user from authManager to Firestore
 */
router.post('/sync-user', async (req, res) => {
    try {
        const authData = req.headers['x-auth-data']
            ? JSON.parse(req.headers['x-auth-data'])
            : req.body.authData;

        const user = await getOrCreateUser(req.user.userId, authData);

        res.json({
            success: true,
            user: user
        });
    } catch (error) {
        console.error('[CHAT-API] Error syncing user:', error);
        res.status(500).json({
            error: 'Failed to sync user',
            message: error.message
        });
    }
});

/**
 * GET /api/chat/users
 * Get list of all users (for creating chats)
 */
router.get('/users', async (req, res) => {
    try {
        const { online, search, limit = 50 } = req.query;

        let query = db.collection('chat_users');

        // Filter by online status
        if (online !== undefined) {
            query = query.where('online', '==', online === 'true');
        }

        // Limit results
        query = query.limit(parseInt(limit));

        const snapshot = await query.get();
        let users = snapshot.docs.map(doc => doc.data());

        // Filter by search term (client-side since Firestore doesn't support LIKE)
        if (search) {
            const searchLower = search.toLowerCase();
            users = users.filter(user =>
                (user.userName || '').toLowerCase().includes(searchLower) ||
                (user.displayName || '').toLowerCase().includes(searchLower) ||
                (user.username || '').toLowerCase().includes(searchLower)
            );
        }

        res.json({
            success: true,
            users: users,
            count: users.length
        });
    } catch (error) {
        console.error('[CHAT-API] Error getting users:', error);
        res.status(500).json({
            error: 'Failed to get users',
            message: error.message
        });
    }
});

// =====================================================
// CHAT/CONVERSATION ENDPOINTS
// =====================================================

/**
 * POST /api/chat/create
 * Create new chat (direct or group)
 */
router.post('/create', async (req, res) => {
    try {
        const { participants, type = 'direct', groupName } = req.body;
        const currentUserId = req.user.userId;

        if (!participants || !Array.isArray(participants)) {
            return res.status(400).json({
                error: 'Missing or invalid participants array'
            });
        }

        // Ensure current user is in participants
        if (!participants.includes(currentUserId)) {
            participants.push(currentUserId);
        }

        // For direct chat, ensure only 2 participants
        if (type === 'direct') {
            if (participants.length !== 2) {
                return res.status(400).json({
                    error: 'Direct chat must have exactly 2 participants'
                });
            }

            // Check if direct chat already exists
            const otherUserId = participants.find(id => id !== currentUserId);
            const existingChat = await getOrCreateDirectChat(currentUserId, otherUserId);

            return res.json({
                success: true,
                chatId: existingChat.chatId,
                existing: existingChat.existing,
                chat: existingChat.data
            });
        }

        // Create group chat
        if (type === 'group' && !groupName) {
            return res.status(400).json({
                error: 'Group chat must have a name'
            });
        }

        // Fetch participant details
        const participantDetails = {};
        for (const userId of participants) {
            const userDoc = await db.collection('chat_users').doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                participantDetails[userId] = {
                    userName: userData.userName,
                    userType: userData.userType,
                    displayName: userData.displayName
                };
            } else {
                participantDetails[userId] = {
                    userName: userId,
                    userType: 'Unknown',
                    displayName: userId
                };
            }
        }

        // Create group chat
        const chatData = {
            type: 'group',
            participants: participants,
            participantDetails: participantDetails,
            groupName: groupName,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUserId,
            lastMessage: null,
            unreadCount: participants.reduce((acc, id) => ({ ...acc, [id]: 0 }), {})
        };

        const chatRef = await db.collection('chats').add(chatData);

        res.json({
            success: true,
            chatId: chatRef.id,
            existing: false,
            chat: chatData
        });
    } catch (error) {
        console.error('[CHAT-API] Error creating chat:', error);
        res.status(500).json({
            error: 'Failed to create chat',
            message: error.message
        });
    }
});

/**
 * GET /api/chat/conversations
 * Get list of user's conversations
 */
router.get('/conversations', async (req, res) => {
    try {
        const userId = req.user.userId;
        const { limit = 50 } = req.query;

        const snapshot = await db.collection('chats')
            .where('participants', 'array-contains', userId)
            .orderBy('lastMessage.timestamp', 'desc')
            .limit(parseInt(limit))
            .get();

        const chats = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            // Convert timestamp to milliseconds
            lastMessage: doc.data().lastMessage ? {
                ...doc.data().lastMessage,
                timestamp: doc.data().lastMessage.timestamp?.toMillis()
            } : null
        }));

        res.json({
            success: true,
            chats: chats,
            count: chats.length
        });
    } catch (error) {
        console.error('[CHAT-API] Error getting conversations:', error);
        res.status(500).json({
            error: 'Failed to get conversations',
            message: error.message
        });
    }
});

/**
 * GET /api/chat/:chatId
 * Get chat details
 */
router.get('/:chatId', verifyParticipant, async (req, res) => {
    try {
        const chat = req.chat; // Attached by verifyParticipant middleware

        res.json({
            success: true,
            chat: {
                id: chat.id,
                ...chat.data
            }
        });
    } catch (error) {
        console.error('[CHAT-API] Error getting chat:', error);
        res.status(500).json({
            error: 'Failed to get chat',
            message: error.message
        });
    }
});

// =====================================================
// MESSAGE ENDPOINTS
// =====================================================

/**
 * GET /api/chat/:chatId/messages
 * Get messages from a chat
 */
router.get('/:chatId/messages', verifyParticipant, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { limit = 50, before, after } = req.query;

        let query = db.collection('messages')
            .doc(chatId)
            .collection('msgs')
            .orderBy('createdAt', 'desc')
            .limit(parseInt(limit));

        // Pagination
        if (before) {
            const beforeDoc = await db.collection('messages')
                .doc(chatId)
                .collection('msgs')
                .doc(before)
                .get();

            if (beforeDoc.exists) {
                query = query.startAfter(beforeDoc);
            }
        }

        if (after) {
            const afterDoc = await db.collection('messages')
                .doc(chatId)
                .collection('msgs')
                .doc(after)
                .get();

            if (afterDoc.exists) {
                query = query.endBefore(afterDoc);
            }
        }

        const snapshot = await query.get();
        const messages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toMillis()
        }));

        res.json({
            success: true,
            messages: messages.reverse(), // Return in chronological order
            count: messages.length
        });
    } catch (error) {
        console.error('[CHAT-API] Error getting messages:', error);
        res.status(500).json({
            error: 'Failed to get messages',
            message: error.message
        });
    }
});

/**
 * POST /api/chat/:chatId/send
 * Send a message
 */
router.post('/:chatId/send', verifyParticipant, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { text, type = 'text', fileUrl, fileName, replyTo } = req.body;
        const userId = req.user.userId;

        // Validate message content
        if (!text && !fileUrl) {
            return res.status(400).json({
                error: 'Message must have text or fileUrl'
            });
        }

        // Create message data
        const messageData = {
            senderId: userId,
            senderName: req.user.userName,
            senderType: req.user.userType,
            text: text || null,
            type: type,
            fileUrl: fileUrl || null,
            fileName: fileName || null,
            replyTo: replyTo || null
        };

        // Send message (updates Firestore)
        const result = await sendMessage(chatId, userId, messageData);

        // Get WebSocket handler from app
        const chatWSHandler = req.app.get('chatWSHandler');
        if (chatWSHandler) {
            // Broadcast to participants via WebSocket
            const participants = req.chat.data.participants;
            chatWSHandler.broadcastNewMessage(chatId, {
                id: result.messageId,
                ...messageData,
                createdAt: Date.now()
            }, participants);
        }

        res.json({
            success: true,
            messageId: result.messageId,
            message: {
                id: result.messageId,
                ...messageData,
                createdAt: Date.now()
            }
        });
    } catch (error) {
        console.error('[CHAT-API] Error sending message:', error);
        res.status(500).json({
            error: 'Failed to send message',
            message: error.message
        });
    }
});

/**
 * POST /api/chat/:chatId/mark-read
 * Mark messages as read
 */
router.post('/:chatId/mark-read', verifyParticipant, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { messageIds } = req.body;
        const userId = req.user.userId;

        if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
            return res.status(400).json({
                error: 'Invalid messageIds array'
            });
        }

        await markMessagesAsRead(chatId, userId, messageIds);

        res.json({
            success: true,
            markedCount: messageIds.length
        });
    } catch (error) {
        console.error('[CHAT-API] Error marking messages as read:', error);
        res.status(500).json({
            error: 'Failed to mark messages as read',
            message: error.message
        });
    }
});

// =====================================================
// FILE UPLOAD ENDPOINT
// =====================================================

/**
 * POST /api/chat/upload
 * Upload file/image for chat
 */
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        const { chatId } = req.body;

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!chatId) {
            return res.status(400).json({ error: 'Missing chatId' });
        }

        // Verify user is participant in the chat
        const chatDoc = await db.collection('chats').doc(chatId).get();
        if (!chatDoc.exists) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        const chatData = chatDoc.data();
        if (!chatData.participants.includes(req.user.userId)) {
            return res.status(403).json({ error: 'Not a participant in this chat' });
        }

        // Upload file to Firebase Storage
        const fileUrl = await uploadFile(chatId, file.buffer, file.originalname);

        // Determine file type
        const fileType = file.mimetype.startsWith('image/') ? 'image' : 'file';

        res.json({
            success: true,
            fileUrl: fileUrl,
            fileName: file.originalname,
            fileSize: file.size,
            fileType: fileType,
            mimeType: file.mimetype
        });
    } catch (error) {
        console.error('[CHAT-API] Error uploading file:', error);
        res.status(500).json({
            error: 'Failed to upload file',
            message: error.message
        });
    }
});

// =====================================================
// STATS ENDPOINT (optional - for monitoring)
// =====================================================

/**
 * GET /api/chat/stats
 * Get chat statistics (admin only)
 */
router.get('/stats', async (req, res) => {
    try {
        // Get WebSocket stats
        const chatWSHandler = req.app.get('chatWSHandler');
        const wsStats = chatWSHandler ? {
            connectedUsers: chatWSHandler.getConnectedUsersCount(),
            userIds: chatWSHandler.getConnectedUserIds()
        } : null;

        // Get Firestore stats
        const usersSnapshot = await db.collection('chat_users').count().get();
        const chatsSnapshot = await db.collection('chats').count().get();

        res.json({
            success: true,
            stats: {
                totalUsers: usersSnapshot.data().count,
                totalChats: chatsSnapshot.data().count,
                websocket: wsStats
            }
        });
    } catch (error) {
        console.error('[CHAT-API] Error getting stats:', error);
        res.status(500).json({
            error: 'Failed to get stats',
            message: error.message
        });
    }
});

module.exports = router;
