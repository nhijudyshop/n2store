// =====================================================
// AUTHENTICATION MIDDLEWARE FOR CHAT SERVER
// Uses existing N2Store auth system (authManager)
// =====================================================

const { verifyAuthData } = require('./firebase-service');

/**
 * Verify N2Store authentication
 * Expects auth data in header 'x-auth-data' (JSON string)
 */
function verifyN2StoreAuth(req, res, next) {
    try {
        // Get auth data from header or body
        let authData = null;

        // Try header first (preferred method)
        if (req.headers['x-auth-data']) {
            try {
                authData = JSON.parse(req.headers['x-auth-data']);
            } catch (e) {
                console.error('[AUTH] Failed to parse x-auth-data header:', e);
            }
        }

        // Fallback to body
        if (!authData && req.body && req.body.authData) {
            authData = req.body.authData;
        }

        // Validate auth data exists
        if (!authData) {
            console.warn('[AUTH] Missing auth data');
            return res.status(401).json({
                error: 'Missing authentication data',
                message: 'Please provide auth data in x-auth-data header or request body'
            });
        }

        // Validate auth data format (similar to authManager.isValidSession)
        if (!verifyAuthData(authData)) {
            console.warn('[AUTH] Invalid auth data format:', authData);
            return res.status(401).json({
                error: 'Invalid authentication data',
                message: 'Auth data must contain: isLoggedIn, userType, checkLogin, userId'
            });
        }

        // Check session timeout
        const SESSION_TIMEOUT = 30 * 24 * 60 * 60 * 1000; // 30 days
        if (authData.timestamp && Date.now() - authData.timestamp > SESSION_TIMEOUT) {
            console.warn('[AUTH] Session expired for user:', authData.userId);
            return res.status(401).json({
                error: 'Session expired',
                message: 'Please login again'
            });
        }

        // Check explicit expiry
        if (authData.expiresAt && Date.now() > authData.expiresAt) {
            console.warn('[AUTH] Session expired (explicit) for user:', authData.userId);
            return res.status(401).json({
                error: 'Session expired',
                message: 'Please login again'
            });
        }

        // Extract user info from authData
        const [userName, userRole] = (authData.userType || '').split('-');

        // Attach user info to request
        req.user = {
            userId: authData.userId,
            userName: userName || authData.username || 'Unknown',
            userType: authData.userType,
            username: authData.username,
            displayName: authData.displayName || userName,
            role: userRole || 'user',
            permissionLevel: parseInt(authData.checkLogin) || 999,
            uid: authData.uid
        };

        console.log('[AUTH] ✅ User authenticated:', req.user.userId, '(' + req.user.userName + ')');
        next();
    } catch (error) {
        console.error('[AUTH] ❌ Authentication error:', error);
        return res.status(401).json({
            error: 'Authentication failed',
            message: error.message
        });
    }
}

/**
 * Optional: Verify permission level
 * Usage: verifyPermission(0) for admin only
 */
function verifyPermission(requiredLevel) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (req.user.permissionLevel > requiredLevel) {
            console.warn('[AUTH] Permission denied for user:', req.user.userId, 'Required:', requiredLevel, 'Has:', req.user.permissionLevel);
            return res.status(403).json({
                error: 'Insufficient permissions',
                message: `This action requires permission level ${requiredLevel} or lower`
            });
        }

        next();
    };
}

/**
 * Verify user is participant in chat
 */
async function verifyParticipant(req, res, next) {
    try {
        const { chatId } = req.params;
        if (!chatId) {
            return res.status(400).json({ error: 'Missing chatId' });
        }

        const { db } = require('./firebase-service');
        const chatDoc = await db.collection('chats').doc(chatId).get();

        if (!chatDoc.exists) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        const chatData = chatDoc.data();
        if (!chatData.participants.includes(req.user.userId)) {
            console.warn('[AUTH] User not a participant:', req.user.userId, 'Chat:', chatId);
            return res.status(403).json({ error: 'You are not a participant in this chat' });
        }

        // Attach chat data to request for convenience
        req.chat = {
            id: chatId,
            data: chatData
        };

        next();
    } catch (error) {
        console.error('[AUTH] Error verifying participant:', error);
        return res.status(500).json({ error: 'Failed to verify participant' });
    }
}

module.exports = {
    verifyN2StoreAuth,
    verifyPermission,
    verifyParticipant
};
