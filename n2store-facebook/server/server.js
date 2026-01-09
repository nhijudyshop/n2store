/**
 * N2Store Server
 * Uses Pancake Public API - same as orders-report
 * Acts as alternative endpoint to main Cloudflare Worker
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Pancake API URLs (same as orders-report)
const PANCAKE_API_V1 = 'https://pages.fm/api/public_api/v1';
const PANCAKE_API_V2 = 'https://pages.fm/api/public_api/v2';

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

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        server: 'n2store-facebook',
        api: 'Pancake Public API',
        timestamp: new Date().toISOString()
    });
});

// =====================================================
// PANCAKE PUBLIC API - CONVERSATIONS
// =====================================================

/**
 * GET /api/pages/:pageId/conversations - Get conversations (inbox)
 * Proxies to Pancake Public API v2
 */
app.get('/api/pages/:pageId/conversations', async (req, res) => {
    try {
        const { pageId } = req.params;
        const { page_access_token, last_conversation_id, type } = req.query;

        if (!page_access_token) {
            return res.status(400).json({
                success: false,
                error: 'page_access_token required'
            });
        }

        // Build URL with query params
        let url = `${PANCAKE_API_V2}/pages/${pageId}/conversations?page_access_token=${page_access_token}`;

        if (last_conversation_id) {
            url += `&last_conversation_id=${last_conversation_id}`;
        }
        if (type) {
            url += `&type=${type}`;
        }

        console.log('[N2STORE] Fetching conversations from Pancake:', url.replace(page_access_token, '***'));

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: data.error || data.message || 'Pancake API error'
            });
        }

        // Return Pancake response directly (already in correct format)
        res.json({
            success: true,
            data: data.conversations || []
        });

    } catch (error) {
        console.error('[N2STORE] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// PANCAKE PUBLIC API - MESSAGES
// =====================================================

/**
 * GET /api/conversations/:convId/messages - Get messages
 * Proxies to Pancake Public API v1
 */
app.get('/api/conversations/:convId/messages', async (req, res) => {
    try {
        const { convId } = req.params;
        const { page_id, page_access_token, current_count } = req.query;

        if (!page_access_token || !page_id) {
            return res.status(400).json({
                success: false,
                error: 'page_id and page_access_token required'
            });
        }

        let url = `${PANCAKE_API_V1}/pages/${page_id}/conversations/${convId}/messages?page_access_token=${page_access_token}`;

        if (current_count) {
            url += `&current_count=${current_count}`;
        }

        console.log('[N2STORE] Fetching messages from Pancake:', url.replace(page_access_token, '***'));

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: data.error || data.message || 'Pancake API error'
            });
        }

        res.json({
            success: true,
            data: {
                messages: data.messages || []
            }
        });

    } catch (error) {
        console.error('[N2STORE] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/pages/:pageId/messages - Send message
 * Proxies to Pancake Public API v1
 */
app.post('/api/pages/:pageId/messages', async (req, res) => {
    try {
        const { pageId } = req.params;
        const { conversation_id, page_access_token, message, action, content_ids, attachment_type } = req.body;

        if (!page_access_token || !conversation_id) {
            return res.status(400).json({
                success: false,
                error: 'conversation_id and page_access_token required'
            });
        }

        const url = `${PANCAKE_API_V1}/pages/${pageId}/conversations/${conversation_id}/messages?page_access_token=${page_access_token}`;

        console.log('[N2STORE] Sending message via Pancake:', url.replace(page_access_token, '***'));

        const body = {
            action: action || 'reply_inbox',
            message: message
        };

        if (content_ids && content_ids.length > 0) {
            body.content_ids = content_ids;
            body.attachment_type = attachment_type;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: data.error || data.message || 'Pancake API error'
            });
        }

        res.json({ success: true, data });

    } catch (error) {
        console.error('[N2STORE] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// PANCAKE PUBLIC API - CONVERSATION ACTIONS
// =====================================================

/**
 * POST /api/pages/:pageId/conversations/:convId/read - Mark as read
 */
app.post('/api/pages/:pageId/conversations/:convId/read', async (req, res) => {
    try {
        const { pageId, convId } = req.params;
        const { page_access_token } = req.body;

        if (!page_access_token) {
            return res.status(400).json({ success: false, error: 'page_access_token required' });
        }

        const url = `${PANCAKE_API_V1}/pages/${pageId}/conversations/${convId}/read?page_access_token=${page_access_token}`;

        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        res.json({ success: data.success !== false, data });

    } catch (error) {
        console.error('[N2STORE] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/pages/:pageId/conversations/:convId/tags - Add/remove tag
 */
app.post('/api/pages/:pageId/conversations/:convId/tags', async (req, res) => {
    try {
        const { pageId, convId } = req.params;
        const { page_access_token, action, tag_id } = req.body;

        if (!page_access_token) {
            return res.status(400).json({ success: false, error: 'page_access_token required' });
        }

        const url = `${PANCAKE_API_V1}/pages/${pageId}/conversations/${convId}/tags?page_access_token=${page_access_token}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, tag_id })
        });

        const data = await response.json();

        res.json({ success: data.success !== false, data });

    } catch (error) {
        console.error('[N2STORE] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// PANCAKE PUBLIC API - TAGS
// =====================================================

/**
 * GET /api/pages/:pageId/tags - Get page tags
 */
app.get('/api/pages/:pageId/tags', async (req, res) => {
    try {
        const { pageId } = req.params;
        const { page_access_token } = req.query;

        if (!page_access_token) {
            return res.status(400).json({ success: false, error: 'page_access_token required' });
        }

        const url = `${PANCAKE_API_V1}/pages/${pageId}/tags?page_access_token=${page_access_token}`;

        const response = await fetch(url);
        const data = await response.json();

        res.json({ success: true, data: data.tags || [] });

    } catch (error) {
        console.error('[N2STORE] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// PANCAKE PUBLIC API - UPLOAD
// =====================================================

/**
 * POST /api/pages/:pageId/upload - Upload media
 */
app.post('/api/pages/:pageId/upload', async (req, res) => {
    try {
        const { pageId } = req.params;
        const { page_access_token } = req.query;

        if (!page_access_token) {
            return res.status(400).json({ success: false, error: 'page_access_token required' });
        }

        // Forward the request body directly to Pancake
        const url = `${PANCAKE_API_V1}/pages/${pageId}/upload_contents?page_access_token=${page_access_token}`;

        // Note: For file uploads, you'd need to handle multipart/form-data
        // This is a simplified version
        res.status(501).json({
            success: false,
            error: 'File upload not implemented yet. Use Pancake API directly.'
        });

    } catch (error) {
        console.error('[N2STORE] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log(`🚀 N2Store Server running on port ${PORT}`);
    console.log(`📡 Using Pancake Public API`);
    console.log(`   - V1: ${PANCAKE_API_V1}`);
    console.log(`   - V2: ${PANCAKE_API_V2}`);
});
