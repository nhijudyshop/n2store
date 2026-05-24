// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

// Load environment variables
require('dotenv').config();

// TPOS API Base URL
const TPOS_BASE_URL = process.env.TPOS_BASE_URL || 'https://tomato.tpos.vn';

// Default fallback token (used if no Authorization header provided)
const DEFAULT_TOKEN = process.env.FACEBOOK_TOKEN || '';

// TPOS token manager — auto-fetch bearer token using server env creds
let tposTokenManager = null;
try {
    tposTokenManager = require('../services/tpos-token-manager');
} catch (_) {}

/**
 * Get authorization token from request, fallback to TPOS token manager (server creds),
 * fallback to DEFAULT_TOKEN env var.
 */
async function getAuthToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader;
    }
    if (tposTokenManager) {
        try {
            const tk = await tposTokenManager.getToken();
            if (tk) return `Bearer ${tk}`;
        } catch (e) {
            console.warn('[FB-ROUTES] tposTokenManager.getToken failed:', e.message);
        }
    }
    return DEFAULT_TOKEN ? `Bearer ${DEFAULT_TOKEN}` : null;
}

/**
 * Common headers for TPOS API requests
 */
function getTposHeaders(token) {
    return {
        Authorization: token,
        'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://tomato.tpos.vn',
        Referer: 'https://tomato.tpos.vn/',
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    };
}

// =====================================================
// CRM TEAMS API
// =====================================================

/**
 * GET /facebook/crm-teams - Get all CRM Teams with Pages
 * Headers:
 * - Authorization: Bearer <token> (required)
 */
router.get('/facebook/crm-teams', async (req, res) => {
    try {
        const token = await getAuthToken(req);
        if (!token) {
            return res.status(401).json({ success: false, error: 'No authorization token' });
        }

        console.log(`📥 Fetching CRM Teams...`);

        const url = `${TPOS_BASE_URL}/odata/CRMTeam/ODataService.GetAllFacebook?$expand=Childs`;

        const response = await fetch(url, {
            method: 'GET',
            headers: getTposHeaders(token),
        });

        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status}`);
        }

        const data = await response.json();
        console.log(`✅ Retrieved ${data?.value?.length || 0} CRM Teams`);

        res.json(data);
    } catch (error) {
        console.error('❌ CRM Teams API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// LIVE CAMPAIGNS API
// =====================================================

/**
 * GET /facebook/live-campaigns - Get available Live Campaigns
 * Headers:
 * - Authorization: Bearer <token> (required)
 * Query params:
 * - top: Number of campaigns (default: 20)
 */
router.get('/facebook/live-campaigns', async (req, res) => {
    try {
        const token = await getAuthToken(req);
        if (!token) {
            return res.status(401).json({ success: false, error: 'No authorization token' });
        }

        const { top = 20 } = req.query;

        console.log(`📥 Fetching Live Campaigns...`);

        const url = `${TPOS_BASE_URL}/odata/SaleOnline_LiveCampaign/ODataService.GetAvailables?$orderby=DateCreated%20desc&$top=${top}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: getTposHeaders(token),
        });

        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status}`);
        }

        const data = await response.json();
        console.log(`✅ Retrieved ${data?.value?.length || 0} Live Campaigns`);

        res.json(data);
    } catch (error) {
        console.error('❌ Live Campaigns API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// COMMENTS API
// =====================================================

/**
 * GET /facebook/comments - Get comments for a post/video
 * Headers:
 * - Authorization: Bearer <token> (required)
 * Query params:
 * - pageid: Facebook Page ID (required)
 * - postId: Post ID (required)
 * - limit: Number of comments (default: 50)
 * - after: Pagination cursor (optional)
 */
router.get('/facebook/comments', async (req, res) => {
    try {
        const token = await getAuthToken(req);
        if (!token) {
            return res.status(401).json({ success: false, error: 'No authorization token' });
        }

        const { pageid, postId, limit = 50, after } = req.query;

        if (!pageid || !postId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: pageid, postId',
            });
        }

        console.log(`📥 Fetching comments for post ${postId}...`);

        // Add &live_filter=no_filter — TPOS UI luôn pass param này cho post (live + past).
        // Một số post past live cần param này, nếu thiếu → TPOS trả 400.
        let url = `${TPOS_BASE_URL}/api/facebook-graph/comment?pageid=${pageid}&facebook_type=Page&postId=${postId}&limit=${limit}&order=reverse_chronological&live_filter=no_filter`;

        if (after) {
            url += `&after=${encodeURIComponent(after)}`;
        }

        // Fail fast: timeout 2.5s thay vì Node default 5 phút.
        // Trước đây user mất ~7.3s cho post hỏng → 2 post = 15s. Giờ ≤ 2.5s × 2.
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 2500);

        let response;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers: getTposHeaders(token),
                signal: ctrl.signal,
            });
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                console.warn(`⏱ TPOS comment timeout (post ${postId})`);
                // Trả 200 + empty thay vì 500 → frontend có thể fallback Pancake Graph.
                return res.json({
                    success: false,
                    upstream_timeout: true,
                    data: [],
                    paging: {},
                });
            }
            throw e;
        }
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            console.warn(
                `⚠ TPOS API ${response.status} (post ${postId}): ${errBody.slice(0, 200)}`
            );
            // 4xx upstream (post bị xóa / private / stale) → trả 200 empty + flag
            // để frontend biết retry Pancake Graph fallback.
            return res.json({
                success: false,
                upstream_status: response.status,
                upstream_error: errBody.slice(0, 200),
                data: [],
                paging: {},
            });
        }

        const data = await response.json();
        console.log(`✅ Retrieved ${data?.data?.length || 0} comments`);

        res.json(data);
    } catch (error) {
        console.error('❌ Comments API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /facebook/comments-archive - Archived comments từ TPOS SaleOnline_Order
 * Dùng khi post bị xóa khỏi FB nhưng TPOS vẫn giữ orders với Note=comment text.
 * Query params:
 * - postId (required): Full FB post ID
 * - top (optional): Max records (default 200)
 */
router.get('/facebook/comments-archive', async (req, res) => {
    try {
        const token = await getAuthToken(req);
        if (!token) {
            return res.status(401).json({ success: false, error: 'No authorization token' });
        }
        const { postId, top = 200 } = req.query;
        if (!postId) {
            return res.status(400).json({ success: false, error: 'postId required' });
        }
        const selectFields = [
            'Id',
            'Code',
            'Facebook_PostId',
            'Facebook_ASUserId',
            'Facebook_CommentId',
            'Facebook_UserName',
            'Note',
            'DateCreated',
        ].join(',');
        const url =
            `${TPOS_BASE_URL}/odata/SaleOnline_Order?` +
            `$filter=Facebook_PostId%20eq%20%27${encodeURIComponent(postId)}%27&` +
            `$top=${Math.min(Number(top) || 200, 500)}&` +
            `$orderby=DateCreated%20desc&` +
            `$select=${selectFields}`;
        console.log(`📥 Fetching archive (orders) for post ${postId}...`);

        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4000);
        let response;
        try {
            response = await fetch(url, {
                headers: getTposHeaders(token),
                signal: ctrl.signal,
            });
        } catch (e) {
            clearTimeout(tid);
            if (e.name === 'AbortError') {
                return res.json({ success: false, upstream_timeout: true, data: [] });
            }
            throw e;
        }
        clearTimeout(tid);

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            console.warn(`⚠ Archive ${response.status}: ${errBody.slice(0, 150)}`);
            return res.json({ success: false, upstream_status: response.status, data: [] });
        }

        const data = await response.json();
        const orders = data?.value || [];

        // Strip TPOS internal markers `["base64..."]` ra khỏi Note để chỉ giữ text user.
        const cleanNote = (s) =>
            String(s || '')
                .replace(/\[\s*"[A-Za-z0-9+/=]{20,}"\s*\]/g, '')
                .replace(/\r?\n+/g, ' ')
                .trim();

        // Map order shape → comment shape (drop-in replacement cho /facebook/comments)
        const comments = orders.map((o) => {
            // Facebook_CommentId có thể compound "id1,id2,..." → lấy id đầu
            const commentId =
                String(o.Facebook_CommentId || '')
                    .split(',')[0]
                    .trim() || o.Id;
            return {
                id: commentId,
                message: cleanNote(o.Note),
                from: {
                    id: o.Facebook_ASUserId || '',
                    name: o.Facebook_UserName || 'Khách',
                },
                created_time: o.DateCreated,
                // Marker để frontend biết đây là archive (không phải FB realtime)
                _archive: true,
                _order_code: o.Code,
                object: { id: postId },
            };
        });

        console.log(`✅ Archive retrieved ${comments.length} comments from orders`);
        res.json({ success: true, source: 'tpos_sale_orders', data: comments, paging: {} });
    } catch (error) {
        console.error('❌ Archive API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// COMMENT STREAM (SSE PROXY)
// =====================================================

/**
 * GET /facebook/comments/stream - SSE stream for realtime comments
 * Headers:
 * - Authorization: Bearer <token> (required)
 * Query params:
 * - pageid: Facebook Page ID (required)
 * - postId: Post ID (required)
 */
router.get('/facebook/comments/stream', async (req, res) => {
    // EventSource doesn't support custom headers, so accept token from query param
    let token = await getAuthToken(req);
    if (!token && req.query.token) {
        token = `Bearer ${req.query.token}`;
    }
    if (!token) {
        return res.status(401).json({ success: false, error: 'No authorization token' });
    }

    const { pageid, postId } = req.query;

    if (!pageid || !postId) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameters: pageid, postId',
        });
    }

    console.log(`📡 Starting SSE stream for post ${postId}...`);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Extract token value (remove "Bearer " prefix for URL)
    const tokenValue = token.replace('Bearer ', '');
    const sseUrl = `${TPOS_BASE_URL}/api/facebook-graph/comment/stream?pageId=${pageid}&facebook_Type=Page&postId=${postId}&access_token=${tokenValue}`;

    try {
        const response = await fetch(sseUrl, {
            method: 'GET',
            headers: {
                Accept: 'text/event-stream',
                'Cache-Control': 'no-cache',
                Origin: 'https://tomato.tpos.vn',
                Referer: 'https://tomato.tpos.vn/',
            },
        });

        if (!response.ok) {
            console.error(`❌ SSE connection failed: ${response.status}`);
            res.write(`data: {"error": "Connection failed: ${response.status}"}\n\n`);
            res.end();
            return;
        }

        console.log(`✅ SSE connected to TPOS`);

        // Pipe the SSE stream from TPOS to client
        response.body.on('data', (chunk) => {
            res.write(chunk);
        });

        response.body.on('end', () => {
            console.log(`📡 SSE stream ended for post ${postId}`);
            res.end();
        });

        response.body.on('error', (error) => {
            console.error(`❌ SSE stream error:`, error);
            res.end();
        });

        // Handle client disconnect
        req.on('close', () => {
            console.log(`📡 Client disconnected from SSE stream`);
            response.body.destroy();
        });
    } catch (error) {
        console.error('❌ SSE connection error:', error);
        res.write(`data: {"error": "${error.message}"}\n\n`);
        res.end();
    }
});

// =====================================================
// SESSION INDEX (COMMENT ORDERS) API
// =====================================================

/**
 * GET /facebook/comment-orders - Get SessionIndex for all commenters
 * Headers:
 * - Authorization: Bearer <token> (required)
 * Query params:
 * - postId: Full post ID in format pageId_postId (required)
 */
router.get('/facebook/comment-orders', async (req, res) => {
    try {
        const token = await getAuthToken(req);
        if (!token) {
            return res.status(401).json({ success: false, error: 'No authorization token' });
        }

        const { postId } = req.query;

        if (!postId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: postId',
            });
        }

        console.log(`📥 Fetching comment orders for post ${postId}...`);

        const url = `${TPOS_BASE_URL}/odata/SaleOnline_Facebook_Post/ODataService.GetCommentOrders?$expand=orders&PostId=${postId}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: getTposHeaders(token),
        });

        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status}`);
        }

        const data = await response.json();
        console.log(`✅ Retrieved ${data?.value?.length || 0} comment orders`);

        res.json(data);
    } catch (error) {
        console.error('❌ Comment Orders API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// LIVE VIDEO API
// =====================================================

/**
 * GET /facebook/livevideo - Get live videos for a page
 * Headers:
 * - Authorization: Bearer <token> (optional, uses default if not provided)
 * Query params:
 * - pageid: Facebook Page ID (default: 117267091364524)
 * - limit: Number of videos (default: 10)
 * - facebook_Type: Type (default: page)
 */
router.get('/facebook/livevideo', async (req, res) => {
    try {
        const token = await getAuthToken(req);
        if (!token) {
            return res.status(401).json({ success: false, error: 'No authorization token' });
        }

        const { pageid = '117267091364524', limit = 10, facebook_Type = 'page' } = req.query;

        console.log(`📥 Fetching Facebook live videos...`);

        const url = `${TPOS_BASE_URL}/api/facebook-graph/livevideo?pageid=${pageid}&limit=${limit}&facebook_Type=${facebook_Type}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: getTposHeaders(token),
        });

        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status}`);
        }

        const data = await response.json();
        console.log(`✅ Retrieved ${data?.data?.length || 0} videos`);

        res.json({
            success: true,
            status: response.status,
            data: data,
        });
    } catch (error) {
        console.error('❌ Live Video API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// HEALTH CHECK
// =====================================================

/**
 * GET /facebook/health - Health check
 */
router.get('/facebook/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Facebook/TPOS Proxy API',
        endpoints: [
            '/facebook/crm-teams',
            '/facebook/live-campaigns',
            '/facebook/comments',
            '/facebook/comments/stream',
            '/facebook/comment-orders',
            '/facebook/livevideo',
        ],
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;
