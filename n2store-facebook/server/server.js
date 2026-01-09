/**
 * N2Store Facebook Server
 * Direct Facebook Graph API integration - Alternative to Pancake
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const FB_GRAPH_URL = 'https://graph.facebook.com/v21.0';

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT NOW()');
        res.json({
            status: 'ok',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            status: 'ok',
            database: 'disconnected',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// =====================================================
// DATABASE INITIALIZATION
// =====================================================

app.post('/api/init-tables', async (req, res) => {
    try {
        // Create tokens table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS facebook_page_tokens (
                page_id VARCHAR(100) PRIMARY KEY,
                page_name VARCHAR(255),
                page_access_token TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create conversations cache table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS facebook_conversations (
                id VARCHAR(100) PRIMARY KEY,
                page_id VARCHAR(100) NOT NULL,
                type VARCHAR(20) DEFAULT 'INBOX',
                participant_id VARCHAR(100),
                participant_name VARCHAR(255),
                snippet TEXT,
                unread_count INT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create messages cache table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS facebook_messages (
                id VARCHAR(100) PRIMARY KEY,
                conversation_id VARCHAR(100),
                from_id VARCHAR(100),
                from_name VARCHAR(255),
                message TEXT,
                created_at TIMESTAMP
            )
        `);

        res.json({ success: true, message: 'Tables created successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// TOKEN MANAGEMENT
// =====================================================

/**
 * GET /api/tokens - Get all saved page tokens
 */
app.get('/api/tokens', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT page_id, page_name, created_at, updated_at FROM facebook_page_tokens ORDER BY page_name'
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/tokens - Save a page token
 */
app.post('/api/tokens', async (req, res) => {
    try {
        const { pageId, pageName, pageAccessToken } = req.body;

        if (!pageId || !pageAccessToken) {
            return res.status(400).json({
                success: false,
                error: 'pageId and pageAccessToken are required'
            });
        }

        await pool.query(`
            INSERT INTO facebook_page_tokens (page_id, page_name, page_access_token, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (page_id) DO UPDATE SET
                page_name = EXCLUDED.page_name,
                page_access_token = EXCLUDED.page_access_token,
                updated_at = CURRENT_TIMESTAMP
        `, [pageId, pageName || '', pageAccessToken]);

        res.json({ success: true, message: `Token saved for page ${pageId}` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/tokens/:pageId - Delete a page token
 */
app.delete('/api/tokens/:pageId', async (req, res) => {
    try {
        const { pageId } = req.params;
        await pool.query('DELETE FROM facebook_page_tokens WHERE page_id = $1', [pageId]);
        res.json({ success: true, message: `Token deleted for page ${pageId}` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get token from database
 */
async function getPageToken(pageId) {
    const result = await pool.query(
        'SELECT page_access_token FROM facebook_page_tokens WHERE page_id = $1',
        [pageId]
    );
    return result.rows[0]?.page_access_token || null;
}

// =====================================================
// FACEBOOK GRAPH API - PAGES
// =====================================================

/**
 * GET /api/pages - Get list of pages (using provided token)
 */
app.get('/api/pages', async (req, res) => {
    try {
        const token = req.query.access_token || req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(400).json({ success: false, error: 'access_token required' });
        }

        const fbRes = await fetch(
            `${FB_GRAPH_URL}/me/accounts?fields=id,name,access_token,picture&access_token=${token}`
        );
        const data = await fbRes.json();

        if (data.error) {
            return res.status(400).json({ success: false, error: data.error.message });
        }

        // Transform to Pancake-compatible format
        const pages = (data.data || []).map(page => ({
            id: page.id,
            page_id: page.id,
            fb_page_id: page.id,
            name: page.name,
            avatar_url: page.picture?.data?.url || '',
            platform: 'facebook',
            settings: {
                page_access_token: page.access_token
            }
        }));

        res.json({ success: true, data: pages });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// FACEBOOK GRAPH API - CONVERSATIONS (INBOX)
// =====================================================

/**
 * GET /api/pages/:pageId/conversations - Get inbox conversations
 */
app.get('/api/pages/:pageId/conversations', async (req, res) => {
    try {
        const { pageId } = req.params;
        const token = req.query.page_access_token || await getPageToken(pageId);

        if (!token) {
            return res.status(400).json({
                success: false,
                error: `No token found for page ${pageId}. Please add token via POST /api/tokens`
            });
        }

        const fields = 'id,participants,updated_time,unread_count,snippet,can_reply';
        const fbRes = await fetch(
            `${FB_GRAPH_URL}/${pageId}/conversations?fields=${fields}&access_token=${token}`
        );
        const data = await fbRes.json();

        if (data.error) {
            return res.status(400).json({ success: false, error: data.error.message });
        }

        // Transform to Pancake-compatible format
        const conversations = (data.data || []).map(conv => {
            const participant = conv.participants?.data?.find(p => p.id !== pageId) || {};
            return {
                id: conv.id,
                type: 'INBOX',
                page_id: pageId,
                updated_at: conv.updated_time,
                unread_count: conv.unread_count || 0,
                snippet: conv.snippet || '',
                can_reply: conv.can_reply !== false,
                from: {
                    id: participant.id || '',
                    name: participant.name || 'Unknown'
                },
                from_psid: participant.id || '',
                customers: [{
                    id: participant.id || '',
                    psid: participant.id || '',
                    fb_id: participant.id || '',
                    name: participant.name || 'Unknown'
                }]
            };
        });

        res.json({ success: true, data: conversations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// FACEBOOK GRAPH API - MESSAGES
// =====================================================

/**
 * GET /api/conversations/:convId/messages - Get messages in a conversation
 */
app.get('/api/conversations/:convId/messages', async (req, res) => {
    try {
        const { convId } = req.params;
        const { page_id, page_access_token } = req.query;
        const token = page_access_token || await getPageToken(page_id);

        if (!token) {
            return res.status(400).json({
                success: false,
                error: `No token found for page ${page_id}. Please add token via POST /api/tokens`
            });
        }

        const fields = 'id,message,from,created_time,attachments';
        const fbRes = await fetch(
            `${FB_GRAPH_URL}/${convId}/messages?fields=${fields}&access_token=${token}`
        );
        const data = await fbRes.json();

        if (data.error) {
            return res.status(400).json({ success: false, error: data.error.message });
        }

        // Transform to Pancake-compatible format
        const messages = (data.data || []).map(msg => ({
            id: msg.id,
            conversation_id: convId,
            from: {
                id: msg.from?.id || '',
                name: msg.from?.name || 'Unknown'
            },
            message: msg.message || '',
            inserted_at: msg.created_time,
            attachments: msg.attachments?.data || []
        }));

        res.json({ success: true, data: { messages } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/pages/:pageId/messages - Send a message
 */
app.post('/api/pages/:pageId/messages', async (req, res) => {
    try {
        const { pageId } = req.params;
        const { recipient_id, message, page_access_token } = req.body;
        const token = page_access_token || await getPageToken(pageId);

        if (!token) {
            return res.status(400).json({ success: false, error: `No token found for page. Please add token via POST /api/tokens` });
        }

        if (!recipient_id || !message) {
            return res.status(400).json({ success: false, error: 'recipient_id and message required' });
        }

        const fbRes = await fetch(`${FB_GRAPH_URL}/${pageId}/messages?access_token=${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipient_id },
                message: { text: message },
                messaging_type: 'RESPONSE'
            })
        });
        const data = await fbRes.json();

        if (data.error) {
            return res.status(400).json({ success: false, error: data.error.message });
        }

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// FACEBOOK GRAPH API - COMMENTS
// =====================================================

/**
 * GET /api/pages/:pageId/feed - Get page posts
 */
app.get('/api/pages/:pageId/feed', async (req, res) => {
    try {
        const { pageId } = req.params;
        const token = req.query.page_access_token || await getPageToken(pageId);

        if (!token) {
            return res.status(400).json({ success: false, error: `No token found for page. Please add token via POST /api/tokens` });
        }

        const fields = 'id,message,created_time,permalink_url,comments.limit(0).summary(true)';
        const fbRes = await fetch(
            `${FB_GRAPH_URL}/${pageId}/feed?fields=${fields}&access_token=${token}`
        );
        const data = await fbRes.json();

        if (data.error) {
            return res.status(400).json({ success: false, error: data.error.message });
        }

        res.json({ success: true, data: data.data || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/posts/:postId/comments - Get comments on a post
 */
app.get('/api/posts/:postId/comments', async (req, res) => {
    try {
        const { postId } = req.params;
        const { page_access_token, page_id } = req.query;
        const token = page_access_token || await getPageToken(page_id);

        if (!token) {
            return res.status(400).json({ success: false, error: `No token found for page. Please add token via POST /api/tokens` });
        }

        const fields = 'id,message,from,created_time,is_hidden,can_hide,can_reply_privately';
        const fbRes = await fetch(
            `${FB_GRAPH_URL}/${postId}/comments?fields=${fields}&access_token=${token}`
        );
        const data = await fbRes.json();

        if (data.error) {
            return res.status(400).json({ success: false, error: data.error.message });
        }

        // Transform to Pancake-compatible format (as conversations)
        const comments = (data.data || []).map(comment => ({
            id: `comment_${comment.id}`,
            type: 'COMMENT',
            page_id: page_id,
            post_id: postId,
            updated_at: comment.created_time,
            snippet: comment.message || '',
            is_hidden: comment.is_hidden || false,
            can_reply_privately: comment.can_reply_privately || false,
            from: {
                id: comment.from?.id || '',
                name: comment.from?.name || 'Unknown'
            },
            customers: [{
                id: comment.from?.id || '',
                fb_id: comment.from?.id || '',
                name: comment.from?.name || 'Unknown'
            }]
        }));

        res.json({ success: true, data: comments });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/comments/:commentId/reply - Reply to a comment (private reply)
 */
app.post('/api/comments/:commentId/reply', async (req, res) => {
    try {
        const { commentId } = req.params;
        const { message, page_access_token, page_id } = req.body;
        const token = page_access_token || await getPageToken(page_id);

        if (!token) {
            return res.status(400).json({ success: false, error: `No token found for page. Please add token via POST /api/tokens` });
        }

        if (!message) {
            return res.status(400).json({ success: false, error: 'message required' });
        }

        // Private reply to comment
        const fbRes = await fetch(`${FB_GRAPH_URL}/${commentId}/private_replies?access_token=${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message
            })
        });
        const data = await fbRes.json();

        if (data.error) {
            return res.status(400).json({ success: false, error: data.error.message });
        }

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// ROOT ENDPOINT - API DOCUMENTATION
// =====================================================

app.get('/', (req, res) => {
    res.json({
        name: 'N2Store Facebook Server',
        version: '1.0.0',
        description: 'Direct Facebook Graph API - Alternative to Pancake',
        endpoints: {
            tokens: [
                'GET /api/tokens - Get saved page tokens',
                'POST /api/tokens - Save page token',
                'DELETE /api/tokens/:pageId - Delete token'
            ],
            pages: [
                'GET /api/pages - List pages (needs user access_token)',
                'GET /api/pages/:pageId/conversations - Get inbox',
                'GET /api/pages/:pageId/feed - Get posts'
            ],
            messages: [
                'GET /api/conversations/:convId/messages - Get messages',
                'POST /api/pages/:pageId/messages - Send message'
            ],
            comments: [
                'GET /api/posts/:postId/comments - Get comments',
                'POST /api/comments/:commentId/reply - Private reply'
            ],
            health: [
                'GET /health - Server health check',
                'POST /api/init-tables - Initialize database tables'
            ]
        }
    });
});

// =====================================================
// ERROR HANDLERS
// =====================================================

app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.url });
});

app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('N2Store Facebook Server');
    console.log('='.repeat(50));
    console.log(`Port: ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Started: ${new Date().toISOString()}`);
    console.log('='.repeat(50));
});
