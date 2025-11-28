// =====================================================
// FIREBASE SERVICE FOR CHAT SERVER
// =====================================================
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
let initialized = false;

function initializeFirebase() {
    if (initialized) {
        console.log('[FIREBASE] Already initialized');
        return;
    }

    try {
        // Check if already initialized
        if (admin.apps.length > 0) {
            console.log('[FIREBASE] Using existing Firebase app');
            initialized = true;
            return;
        }

        // Get credentials from environment variables
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY;

        if (!projectId || !clientEmail || !privateKey) {
            console.error('[FIREBASE] Missing environment variables:');
            console.error('- FIREBASE_PROJECT_ID:', !!projectId);
            console.error('- FIREBASE_CLIENT_EMAIL:', !!clientEmail);
            console.error('- FIREBASE_PRIVATE_KEY:', !!privateKey);
            throw new Error('Missing Firebase credentials in environment variables');
        }

        // Initialize with service account
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: projectId,
                clientEmail: clientEmail,
                privateKey: privateKey.replace(/\\n/g, '\n')
            }),
            storageBucket: `${projectId}.appspot.com`
        });

        initialized = true;
        console.log('[FIREBASE] ✅ Initialized successfully');
        console.log('[FIREBASE] Project ID:', projectId);
    } catch (error) {
        console.error('[FIREBASE] ❌ Initialization failed:', error.message);
        throw error;
    }
}

// Initialize on module load
initializeFirebase();

// Get Firestore instance
const db = admin.firestore();

// Get Storage instance
const storage = admin.storage();

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Verify auth data format
 */
function verifyAuthData(authData) {
    if (!authData) return false;

    return authData.isLoggedIn === 'true' &&
           authData.userType &&
           authData.checkLogin !== undefined &&
           authData.userId; // Must have userId
}

/**
 * Get or create user document in Firestore
 */
async function getOrCreateUser(userId, authData) {
    try {
        const userRef = db.collection('chat_users').doc(userId);
        const userDoc = await userRef.get();

        const [userName, userRole] = (authData.userType || '').split('-');

        const userData = {
            userId: userId,
            userName: userName || authData.username || 'Unknown',
            userType: authData.userType,
            username: authData.username,
            displayName: authData.displayName || userName,
            role: userRole || 'user',
            permissionLevel: parseInt(authData.checkLogin) || 999,
            lastSeen: admin.firestore.FieldValue.serverTimestamp(),
            online: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (!userDoc.exists) {
            // Create new user
            userData.createdAt = admin.firestore.FieldValue.serverTimestamp();
            await userRef.set(userData);
            console.log('[FIREBASE] Created new user:', userId);
        } else {
            // Update existing user
            await userRef.update({
                lastSeen: admin.firestore.FieldValue.serverTimestamp(),
                online: true,
                displayName: userData.displayName,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log('[FIREBASE] Updated user:', userId);
        }

        return userData;
    } catch (error) {
        console.error('[FIREBASE] Error in getOrCreateUser:', error);
        throw error;
    }
}

/**
 * Get or create direct chat between two users
 */
async function getOrCreateDirectChat(userId1, userId2) {
    try {
        // Search for existing direct chat
        const chatsRef = db.collection('chats');
        const snapshot = await chatsRef
            .where('type', '==', 'direct')
            .where('participants', 'array-contains', userId1)
            .get();

        // Check if chat with userId2 exists
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.participants.includes(userId2) && data.participants.length === 2) {
                console.log('[FIREBASE] Found existing direct chat:', doc.id);
                return { chatId: doc.id, existing: true, data: data };
            }
        }

        // Chat doesn't exist, create new one
        const user1Doc = await db.collection('chat_users').doc(userId1).get();
        const user2Doc = await db.collection('chat_users').doc(userId2).get();

        const user1Data = user1Doc.exists ? user1Doc.data() : { userName: userId1, userType: 'Unknown' };
        const user2Data = user2Doc.exists ? user2Doc.data() : { userName: userId2, userType: 'Unknown' };

        const newChatData = {
            type: 'direct',
            participants: [userId1, userId2],
            participantDetails: {
                [userId1]: {
                    userName: user1Data.userName,
                    userType: user1Data.userType,
                    displayName: user1Data.displayName
                },
                [userId2]: {
                    userName: user2Data.userName,
                    userType: user2Data.userType,
                    displayName: user2Data.displayName
                }
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: userId1,
            lastMessage: null,
            unreadCount: {
                [userId1]: 0,
                [userId2]: 0
            }
        };

        const chatRef = await chatsRef.add(newChatData);
        console.log('[FIREBASE] Created new direct chat:', chatRef.id);

        return { chatId: chatRef.id, existing: false, data: newChatData };
    } catch (error) {
        console.error('[FIREBASE] Error in getOrCreateDirectChat:', error);
        throw error;
    }
}

/**
 * Send message to chat
 */
async function sendMessage(chatId, senderId, messageData) {
    try {
        // Verify chat exists and sender is participant
        const chatRef = db.collection('chats').doc(chatId);
        const chatDoc = await chatRef.get();

        if (!chatDoc.exists) {
            throw new Error('Chat not found');
        }

        const chatData = chatDoc.data();
        if (!chatData.participants.includes(senderId)) {
            throw new Error('Sender is not a participant');
        }

        // Add message
        const msgRef = await db.collection('messages')
            .doc(chatId)
            .collection('msgs')
            .add({
                ...messageData,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                readBy: [senderId]
            });

        // Update chat's lastMessage and unread counts
        const updateData = {
            lastMessage: {
                text: messageData.text || messageData.fileName || 'File',
                senderId: senderId,
                senderName: messageData.senderName,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                type: messageData.type
            }
        };

        // Increment unread count for other participants
        chatData.participants.forEach(participantId => {
            if (participantId !== senderId) {
                updateData[`unreadCount.${participantId}`] = admin.firestore.FieldValue.increment(1);
            }
        });

        await chatRef.update(updateData);

        console.log('[FIREBASE] Message sent:', msgRef.id);
        return { messageId: msgRef.id, message: messageData };
    } catch (error) {
        console.error('[FIREBASE] Error in sendMessage:', error);
        throw error;
    }
}

/**
 * Mark messages as read
 */
async function markMessagesAsRead(chatId, userId, messageIds) {
    try {
        const batch = db.batch();

        // Update each message
        for (const msgId of messageIds) {
            const msgRef = db.collection('messages').doc(chatId).collection('msgs').doc(msgId);
            batch.update(msgRef, {
                readBy: admin.firestore.FieldValue.arrayUnion(userId)
            });
        }

        // Reset unread count
        const chatRef = db.collection('chats').doc(chatId);
        batch.update(chatRef, {
            [`unreadCount.${userId}`]: 0
        });

        await batch.commit();
        console.log('[FIREBASE] Marked messages as read:', messageIds.length);
    } catch (error) {
        console.error('[FIREBASE] Error in markMessagesAsRead:', error);
        throw error;
    }
}

/**
 * Update user online status
 */
async function updateUserOnlineStatus(userId, online) {
    try {
        await db.collection('chat_users').doc(userId).update({
            online: online,
            lastSeen: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log('[FIREBASE] Updated online status:', userId, online);
    } catch (error) {
        console.error('[FIREBASE] Error updating online status:', error);
    }
}

/**
 * Upload file to Firebase Storage
 */
async function uploadFile(chatId, file, originalName) {
    try {
        const bucket = storage.bucket();
        const fileName = `chat-uploads/${chatId}/${Date.now()}-${originalName}`;
        const fileUpload = bucket.file(fileName);

        await fileUpload.save(file, {
            metadata: {
                contentType: file.mimetype || 'application/octet-stream'
            }
        });

        // Make file public
        await fileUpload.makePublic();
        const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

        console.log('[FIREBASE] File uploaded:', fileUrl);
        return fileUrl;
    } catch (error) {
        console.error('[FIREBASE] Error uploading file:', error);
        throw error;
    }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    admin,
    db,
    storage,
    verifyAuthData,
    getOrCreateUser,
    getOrCreateDirectChat,
    sendMessage,
    markMessagesAsRead,
    updateUserOnlineStatus,
    uploadFile
};
