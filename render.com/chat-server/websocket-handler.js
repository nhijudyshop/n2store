// =====================================================
// WEBSOCKET HANDLER FOR CHAT SERVER
// Handles realtime chat functionality
// =====================================================

const { db, verifyAuthData, updateUserOnlineStatus } = require('./firebase-service');

class ChatWebSocketHandler {
    constructor(wss) {
        this.wss = wss;
        this.clients = new Map(); // userId -> ws connection
        this.typingTimers = new Map(); // chatId_userId -> timer

        console.log('[CHAT-WS] Initializing WebSocket handler...');

        wss.on('connection', (ws, req) => {
            console.log('[CHAT-WS] New client connected from:', req.socket.remoteAddress);
            this.handleConnection(ws, req);
        });

        console.log('[CHAT-WS] ✅ WebSocket handler initialized');
    }

    handleConnection(ws, req) {
        ws.isAlive = true;
        ws.userId = null;
        ws.authenticated = false;

        // Handle incoming messages
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(ws, message);
            } catch (error) {
                console.error('[CHAT-WS] Error parsing message:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid message format'
                }));
            }
        });

        // Handle pong (keep-alive)
        ws.on('pong', () => {
            ws.isAlive = true;
        });

        // Handle disconnection
        ws.on('close', () => {
            this.handleDisconnect(ws);
        });

        // Handle errors
        ws.on('error', (error) => {
            console.error('[CHAT-WS] WebSocket error:', error);
        });

        // Send welcome message
        ws.send(JSON.stringify({
            type: 'connected',
            message: 'Connected to N2Store Chat Server',
            timestamp: Date.now()
        }));
    }

    async handleMessage(ws, message) {
        const { type, payload } = message;

        try {
            switch (type) {
                case 'auth':
                    await this.handleAuth(ws, payload);
                    break;

                case 'typing':
                    await this.handleTyping(ws, payload);
                    break;

                case 'stop_typing':
                    await this.handleStopTyping(ws, payload);
                    break;

                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                    break;

                default:
                    console.warn('[CHAT-WS] Unknown message type:', type);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: `Unknown message type: ${type}`
                    }));
            }
        } catch (error) {
            console.error('[CHAT-WS] Error handling message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: error.message
            }));
        }
    }

    async handleAuth(ws, payload) {
        try {
            const { userId, authData } = payload;

            if (!userId || !authData) {
                throw new Error('Missing userId or authData');
            }

            // Verify auth data
            if (!verifyAuthData(authData)) {
                throw new Error('Invalid auth data');
            }

            // Verify userId matches
            if (authData.userId !== userId) {
                throw new Error('userId mismatch');
            }

            // Authentication successful
            ws.userId = userId;
            ws.authenticated = true;

            // Store connection
            this.clients.set(userId, ws);

            // Update online status in Firestore
            await updateUserOnlineStatus(userId, true);

            console.log('[CHAT-WS] ✅ User authenticated:', userId);

            // Send success response
            ws.send(JSON.stringify({
                type: 'authenticated',
                userId: userId,
                timestamp: Date.now()
            }));

            // Broadcast user online status to others
            this.broadcastUserStatus(userId, true);
        } catch (error) {
            console.error('[CHAT-WS] Authentication failed:', error);
            ws.send(JSON.stringify({
                type: 'auth_error',
                message: error.message
            }));
            // Close connection after authentication failure
            setTimeout(() => ws.close(), 1000);
        }
    }

    async handleTyping(ws, payload) {
        if (!ws.authenticated) {
            return ws.send(JSON.stringify({
                type: 'error',
                message: 'Not authenticated'
            }));
        }

        const { chatId } = payload;
        const userId = ws.userId;

        if (!chatId) {
            return ws.send(JSON.stringify({
                type: 'error',
                message: 'Missing chatId'
            }));
        }

        // Update typing indicator in Firestore
        try {
            await db.collection('typing').doc(chatId).set({
                [userId]: Date.now()
            }, { merge: true });

            // Broadcast typing to chat participants
            this.broadcastToChatExcept(chatId, userId, {
                type: 'user_typing',
                chatId: chatId,
                userId: userId,
                timestamp: Date.now()
            });

            // Auto-clear typing after 3 seconds
            const timerKey = `${chatId}_${userId}`;
            if (this.typingTimers.has(timerKey)) {
                clearTimeout(this.typingTimers.get(timerKey));
            }

            const timer = setTimeout(() => {
                this.handleStopTyping(ws, { chatId });
                this.typingTimers.delete(timerKey);
            }, 3000);

            this.typingTimers.set(timerKey, timer);
        } catch (error) {
            console.error('[CHAT-WS] Error handling typing:', error);
        }
    }

    async handleStopTyping(ws, payload) {
        if (!ws.authenticated) return;

        const { chatId } = payload;
        const userId = ws.userId;

        if (!chatId) return;

        try {
            // Clear typing indicator in Firestore
            await db.collection('typing').doc(chatId).update({
                [userId]: null
            });

            // Broadcast stop typing
            this.broadcastToChatExcept(chatId, userId, {
                type: 'user_stopped_typing',
                chatId: chatId,
                userId: userId,
                timestamp: Date.now()
            });

            // Clear timer
            const timerKey = `${chatId}_${userId}`;
            if (this.typingTimers.has(timerKey)) {
                clearTimeout(this.typingTimers.get(timerKey));
                this.typingTimers.delete(timerKey);
            }
        } catch (error) {
            console.error('[CHAT-WS] Error handling stop typing:', error);
        }
    }

    async handleDisconnect(ws) {
        if (ws.userId) {
            console.log('[CHAT-WS] User disconnected:', ws.userId);

            // Remove from clients map
            this.clients.delete(ws.userId);

            // Update online status in Firestore
            try {
                await updateUserOnlineStatus(ws.userId, false);
            } catch (error) {
                console.error('[CHAT-WS] Error updating offline status:', error);
            }

            // Broadcast user offline status
            this.broadcastUserStatus(ws.userId, false);

            // Clear all typing timers for this user
            for (const [key, timer] of this.typingTimers.entries()) {
                if (key.endsWith(`_${ws.userId}`)) {
                    clearTimeout(timer);
                    this.typingTimers.delete(key);
                }
            }
        }
    }

    // =====================================================
    // BROADCAST METHODS
    // =====================================================

    /**
     * Broadcast new message to all chat participants
     */
    broadcastNewMessage(chatId, message, participants) {
        console.log('[CHAT-WS] Broadcasting message to', participants.length, 'participants');

        participants.forEach(userId => {
            const ws = this.clients.get(userId);
            if (ws && ws.readyState === 1) { // OPEN
                ws.send(JSON.stringify({
                    type: 'new_message',
                    chatId: chatId,
                    message: message,
                    timestamp: Date.now()
                }));
            }
        });
    }

    /**
     * Broadcast to chat participants except sender
     */
    broadcastToChatExcept(chatId, exceptUserId, data) {
        // Get chat participants from Firestore
        db.collection('chats').doc(chatId).get()
            .then(doc => {
                if (doc.exists) {
                    const participants = doc.data().participants || [];
                    participants.forEach(userId => {
                        if (userId !== exceptUserId) {
                            const ws = this.clients.get(userId);
                            if (ws && ws.readyState === 1) {
                                ws.send(JSON.stringify(data));
                            }
                        }
                    });
                }
            })
            .catch(error => {
                console.error('[CHAT-WS] Error broadcasting to chat:', error);
            });
    }

    /**
     * Broadcast user online/offline status
     */
    broadcastUserStatus(userId, online) {
        const data = JSON.stringify({
            type: 'user_status',
            userId: userId,
            online: online,
            timestamp: Date.now()
        });

        // Broadcast to all connected clients
        this.clients.forEach((ws, clientUserId) => {
            if (clientUserId !== userId && ws.readyState === 1) {
                ws.send(data);
            }
        });
    }

    /**
     * Send message to specific user
     */
    sendToUser(userId, data) {
        const ws = this.clients.get(userId);
        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify(data));
            return true;
        }
        return false;
    }

    /**
     * Get connected users count
     */
    getConnectedUsersCount() {
        return this.clients.size;
    }

    /**
     * Get connected user IDs
     */
    getConnectedUserIds() {
        return Array.from(this.clients.keys());
    }

    /**
     * Check if user is connected
     */
    isUserConnected(userId) {
        return this.clients.has(userId);
    }
}

module.exports = ChatWebSocketHandler;
