/**
 * N2Store Facebook Server
 * 100% Facebook Graph API - Direct integration
 *
 * Gets Facebook Page Access Token from TPOS CRM API
 * Persists tokens to file for reload on restart
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Use node-fetch for compatibility
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// Facebook Graph API
const FB_GRAPH_URL = 'https://graph.facebook.com/v21.0';

// TPOS CRM API
const TPOS_API_URL = 'https://tomato.tpos.vn/odata/CRMTeam/ODataService.GetAllFacebook?$expand=Childs';

// Token storage file
const TOKEN_FILE = path.join(__dirname, 'tokens.json');

// Cache for tokens
let tokenCache = {};
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load tokens from file on startup
 */
function loadTokensFromFile() {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const data = fs.readFileSync(TOKEN_FILE, 'utf8');
            const saved = JSON.parse(data);
            tokenCache = saved.tokens || {};
            lastFetchTime = saved.timestamp || 0;
            console.log(`[STORAGE] Loaded ${Object.keys(tokenCache).length} tokens from file`);
            return true;
        }
    } catch (error) {
        console.error('[STORAGE] Error loading tokens:', error.message);
    }
    return false;
}

/**
 * Save tokens to file
 */
function saveTokensToFile() {
    try {
        const data = {
            tokens: tokenCache,
            timestamp: lastFetchTime,
            savedAt: new Date().toISOString()
        };
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
        console.log(`[STORAGE] Saved ${Object.keys(tokenCache).length} tokens to file`);
        return true;
    } catch (error) {
        console.error('[STORAGE] Error saving tokens:', error.message);
        return false;
    }
}

// Load tokens on startup
loadTokensFromFile();

// Multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }
});

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// =====================================================
// TOKEN MANAGEMENT (from TPOS CRM)
// =====================================================

/**
 * Fetch all Facebook tokens from TPOS CRM
 * @param {string} tposToken - TPOS Bearer token
 */
async function fetchTokensFromTPOS(tposToken) {
    try {
        console.log('[TPOS] Fetching Facebook tokens from CRM...');

        const response = await fetch(TPOS_API_URL, {
            headers: {
                'Authorization': `Bearer ${tposToken}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status}`);
        }

        const data = await response.json();
        const tokens = {};

        // Extract page tokens from response
        for (const account of data.value || []) {
            // Check parent level
            if (account.Facebook_PageId && account.Facebook_PageToken) {
                tokens[account.Facebook_PageId] = {
                    token: account.Facebook_PageToken,
                    name: account.Facebook_PageName || account.Name
                };
            }

            // Check children (pages under each account)
            for (const child of account.Childs || []) {
                if (child.Facebook_PageId && child.Facebook_PageToken) {
                    tokens[child.Facebook_PageId] = {
                        token: child.Facebook_PageToken,
                        name: child.Facebook_PageName || child.Name
                    };
                }
            }
        }

        console.log(`[TPOS] Found ${Object.keys(tokens).length} page tokens`);

        // Save to file for persistence
        tokenCache = tokens;
        lastFetchTime = Date.now();
        saveTokensToFile();

        return tokens;
    } catch (error) {
        console.error('[TPOS] Error fetching tokens:', error.message);
        return {};
    }
}

/**
 * Get page token - from cache or fetch from TPOS
 */
async function getPageToken(pageId, tposToken) {
    // Check cache first
    const now = Date.now();
    if (tokenCache[pageId] && (now - lastFetchTime) < CACHE_TTL) {
        return tokenCache[pageId].token;
    }

    // Fetch fresh tokens from TPOS
    if (tposToken) {
        tokenCache = await fetchTokensFromTPOS(tposToken);
        lastFetchTime = now;
    }

    return tokenCache[pageId]?.token || null;
}

// =====================================================
// HEALTH CHECK
// =====================================================

app.get('/health', (req, res) => {
    const pages = Object.keys(tokenCache).map(id => ({
        id,
        name: tokenCache[id].name,
        hasToken: !!tokenCache[id].token
    }));

    res.json({
        status: 'ok',
        server: 'n2store-facebook',
        api: '100% Facebook Graph API',
        version: 'v21.0',
        tokenSource: 'TPOS CRM + File Storage',
        cachedPages: pages.length,
        pages: pages,
        lastRefresh: lastFetchTime ? new Date(lastFetchTime).toISOString() : null,
        timestamp: new Date().toISOString()
    });
});

// =====================================================
// REFRESH TOKENS (manual trigger)
// =====================================================

app.post('/api/refresh-tokens', async (req, res) => {
    const tposToken = req.headers.authorization?.replace('Bearer ', '') || req.body.tpos_token;

    if (!tposToken) {
        return res.status(400).json({ success: false, error: 'TPOS token required' });
    }

    tokenCache = await fetchTokensFromTPOS(tposToken);
    lastFetchTime = Date.now();

    res.json({
        success: true,
        message: `Loaded ${Object.keys(tokenCache).length} page tokens`,
        pages: Object.keys(tokenCache).map(id => ({
            id,
            name: tokenCache[id].name
        }))
    });
});

// =====================================================
// FACEBOOK GRAPH API - CONVERSATIONS
// =====================================================

app.get('/api/pages/:pageId/conversations', async (req, res) => {
    try {
        const { pageId } = req.params;
        const tposToken = req.headers.authorization?.replace('Bearer ', '') || req.query.tpos_token;
        const token = await getPageToken(pageId, tposToken);

        if (!token) {
            return res.status(400).json({
                success: false,
                error: `No token for page ${pageId}. Refresh tokens first.`
            });
        }

        const fields = 'id,participants,updated_time,unread_count,snippet,can_reply';
        const url = `${FB_GRAPH_URL}/${pageId}/conversations?fields=${fields}&access_token=${token}`;

        console.log('[FB] GET conversations for page:', pageId);

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error('[FB] Error:', data.error);
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
                    name: participant.name || 'Unknown'
                }]
            };
        });

        res.json({ success: true, data: conversations });
    } catch (error) {
        console.error('[FB] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// FACEBOOK GRAPH API - MESSAGES
// =====================================================

app.get('/api/conversations/:convId/messages', async (req, res) => {
    try {
        const { convId } = req.params;
        const { page_id } = req.query;
        const tposToken = req.headers.authorization?.replace('Bearer ', '') || req.query.tpos_token;
        const token = await getPageToken(page_id, tposToken);

        if (!token) {
            return res.status(400).json({
                success: false,
                error: `No token for page ${page_id}`
            });
        }

        const fields = 'id,message,from,created_time,attachments,sticker';
        const url = `${FB_GRAPH_URL}/${convId}/messages?fields=${fields}&access_token=${token}`;

        console.log('[FB] GET messages for conversation:', convId);

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error('[FB] Error:', data.error);
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
            attachments: (msg.attachments?.data || []).map(att => ({
                id: att.id,
                type: att.mime_type?.startsWith('image') ? 'PHOTO' :
                      att.mime_type?.startsWith('video') ? 'VIDEO' : 'FILE',
                url: att.image_data?.url || att.video_data?.url || att.file_url,
                name: att.name
            })),
            sticker: msg.sticker
        }));

        res.json({ success: true, data: { messages } });
    } catch (error) {
        console.error('[FB] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/pages/:pageId/messages', async (req, res) => {
    try {
        const { pageId } = req.params;
        const { conversation_id, recipient_id, message, attachment_id, attachment_type } = req.body;
        const tposToken = req.headers.authorization?.replace('Bearer ', '') || req.body.tpos_token;
        const token = await getPageToken(pageId, tposToken);

        if (!token) {
            return res.status(400).json({
                success: false,
                error: `No token for page ${pageId}`
            });
        }

        // Need recipient_id (PSID) to send message via Facebook Send API
        let psid = recipient_id;
        if (!psid && conversation_id) {
            const convUrl = `${FB_GRAPH_URL}/${conversation_id}?fields=participants&access_token=${token}`;
            const convResponse = await fetch(convUrl);
            const convData = await convResponse.json();
            if (convData.participants?.data) {
                const customer = convData.participants.data.find(p => p.id !== pageId);
                psid = customer?.id;
            }
        }

        if (!psid) {
            return res.status(400).json({ success: false, error: 'recipient_id required' });
        }

        const url = `${FB_GRAPH_URL}/${pageId}/messages?access_token=${token}`;

        // Build message payload
        let messagePayload = {};

        if (attachment_id) {
            messagePayload = {
                attachment: {
                    type: attachment_type || 'image',
                    payload: { attachment_id }
                }
            };
        } else if (message) {
            messagePayload = { text: message };
        } else {
            return res.status(400).json({ success: false, error: 'message or attachment_id required' });
        }

        const body = {
            recipient: { id: psid },
            message: messagePayload,
            messaging_type: 'RESPONSE'
        };

        console.log('[FB] POST message to:', psid);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.error) {
            console.error('[FB] Error:', data.error);
            return res.status(400).json({ success: false, error: data.error.message });
        }

        res.json({
            success: true,
            data: {
                id: data.message_id,
                message: message || '',
                from: { id: pageId },
                inserted_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('[FB] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// FACEBOOK GRAPH API - UPLOAD ATTACHMENT
// =====================================================

app.post('/api/pages/:pageId/upload', upload.single('file'), async (req, res) => {
    try {
        const { pageId } = req.params;
        const tposToken = req.headers.authorization?.replace('Bearer ', '') || req.query.tpos_token;
        const token = await getPageToken(pageId, tposToken);

        if (!token) {
            return res.status(400).json({
                success: false,
                error: `No token for page ${pageId}`
            });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        console.log('[FB] Uploading attachment:', req.file.originalname, req.file.mimetype);

        // Determine attachment type
        let attachmentType = 'file';
        if (req.file.mimetype.startsWith('image')) attachmentType = 'image';
        else if (req.file.mimetype.startsWith('video')) attachmentType = 'video';
        else if (req.file.mimetype.startsWith('audio')) attachmentType = 'audio';

        // Upload to Facebook
        const formData = new FormData();
        formData.append('message', JSON.stringify({
            attachment: {
                type: attachmentType,
                payload: { is_reusable: true }
            }
        }));
        formData.append('filedata', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        const url = `${FB_GRAPH_URL}/${pageId}/message_attachments?access_token=${token}`;

        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        const data = await response.json();

        if (data.error) {
            console.error('[FB] Upload error:', data.error);
            return res.status(400).json({ success: false, error: data.error.message });
        }

        console.log('[FB] Upload success:', data);

        res.json({
            success: true,
            id: data.attachment_id,
            attachment_id: data.attachment_id,
            attachment_type: attachmentType.toUpperCase()
        });
    } catch (error) {
        console.error('[FB] Upload error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// FACEBOOK GRAPH API - MARK AS READ
// =====================================================

app.post('/api/pages/:pageId/conversations/:convId/read', async (req, res) => {
    try {
        const { pageId, convId } = req.params;
        const tposToken = req.headers.authorization?.replace('Bearer ', '') || req.body.tpos_token;
        const token = await getPageToken(pageId, tposToken);

        if (!token) {
            return res.status(400).json({ success: false, error: 'No token for page' });
        }

        const convUrl = `${FB_GRAPH_URL}/${convId}?fields=participants&access_token=${token}`;
        const convResponse = await fetch(convUrl);
        const convData = await convResponse.json();

        let psid = null;
        if (convData.participants?.data) {
            const customer = convData.participants.data.find(p => p.id !== pageId);
            psid = customer?.id;
        }

        if (!psid) {
            return res.json({ success: true, message: 'No recipient found' });
        }

        const url = `${FB_GRAPH_URL}/${pageId}/messages?access_token=${token}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: psid },
                sender_action: 'mark_seen'
            })
        });

        const data = await response.json();
        res.json({ success: !data.error, data });
    } catch (error) {
        console.error('[FB] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log(`N2Store Facebook Server running on port ${PORT}`);
    console.log(`Using 100% Facebook Graph API v21.0`);
    console.log(`Token source: TPOS CRM API`);
    console.log('');
    console.log('To refresh tokens:');
    console.log('  POST /api/refresh-tokens');
    console.log('  Header: Authorization: Bearer <TPOS_TOKEN>');
});
