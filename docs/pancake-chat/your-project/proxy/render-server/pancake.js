// =====================================================
// RENDER.COM SERVER - Pancake Proxy & WebSocket Manager
// Node.js Express server running 24/7 on Render.com
// =====================================================
//
// This server provides:
// 1. HTTP proxy for Pancake API requests (CORS bypass)
// 2. WebSocket client to Pancake.vn (24/7 realtime)
// 3. WebSocket server to forward updates to browser clients
//
// Dependencies: express, ws, node-fetch
// =====================================================

const express = require('express');
const WebSocket = require('ws');
const fetch = require('node-fetch');
const router = express.Router();

// =====================================================
// STATE
// =====================================================
let pancakeWs = null;           // WebSocket client to Pancake.vn
let browserClients = new Set(); // Connected browser WebSocket clients
let heartbeatInterval = null;
let refCounter = 1;

// =====================================================
// 1. API PROXY - Forward requests to Pancake.vn
// =====================================================

/**
 * Proxy ALL requests to Pancake API
 * Route: /api/pancake/*
 * Example: /api/pancake/pages?access_token=xxx → https://pancake.vn/api/v1/pages?access_token=xxx
 */
router.all('/*', async (req, res) => {
    const path = req.params[0];
    const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
    const targetUrl = `https://pancake.vn/api/v1/${path}${queryString ? '?' + queryString : ''}`;

    console.log(`[PANCAKE-PROXY] ${req.method} ${targetUrl}`);

    try {
        // Forward request with original headers
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
            'Origin': 'https://pancake.vn',
            'Referer': 'https://pancake.vn/multi_pages',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };

        // Copy authorization headers from original request
        if (req.headers['authorization']) {
            headers['Authorization'] = req.headers['authorization'];
        }
        if (req.headers['cookie']) {
            headers['Cookie'] = req.headers['cookie'];
        }
        if (req.headers['content-type']) {
            headers['Content-Type'] = req.headers['content-type'];
        }

        const fetchOptions = {
            method: req.method,
            headers: headers,
            timeout: 15000
        };

        // Forward body for non-GET requests
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            if (req.body) {
                fetchOptions.body = typeof req.body === 'string'
                    ? req.body
                    : JSON.stringify(req.body);
            }
        }

        const response = await fetch(targetUrl, fetchOptions);
        const data = await response.text();

        // Set CORS headers
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
            'Content-Type': response.headers.get('content-type') || 'application/json'
        });

        res.status(response.status).send(data);

    } catch (error) {
        console.error('[PANCAKE-PROXY] Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================================
// 2. REALTIME START - Connect WebSocket to Pancake.vn
// =====================================================

/**
 * Start WebSocket client on server
 * Route: POST /api/realtime/start
 * Body: { token, userId, pageIds, cookie }
 */
async function handleRealtimeStart(req, res) {
    try {
        const { token, userId, pageIds, cookie } = req.body;

        if (!token || !userId || !pageIds) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: token, userId, pageIds'
            });
        }

        console.log('[REALTIME] Starting WebSocket client for user:', userId);
        console.log('[REALTIME] Page IDs:', pageIds);

        // Close existing connection if any
        if (pancakeWs) {
            pancakeWs.close();
            pancakeWs = null;
        }

        // Connect to Pancake.vn WebSocket
        const wsUrl = 'wss://pancake.vn/socket/websocket?vsn=2.0.0';
        const wsOptions = {
            headers: {
                'Cookie': cookie || `jwt=${token}`,
                'Origin': 'https://pancake.vn',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };

        pancakeWs = new WebSocket(wsUrl, wsOptions);

        pancakeWs.on('open', () => {
            console.log('[REALTIME] Connected to Pancake.vn WebSocket');

            // Start heartbeat
            startHeartbeat();

            // Join channels
            joinChannels(token, userId, pageIds);
        });

        pancakeWs.on('message', (data) => {
            handlePancakeMessage(data.toString(), userId);
        });

        pancakeWs.on('close', (code, reason) => {
            console.log('[REALTIME] Pancake WS closed:', code, reason.toString());
            stopHeartbeat();

            // Auto-reconnect after 5s
            setTimeout(() => {
                console.log('[REALTIME] Auto-reconnecting...');
                handleRealtimeStart(
                    { body: { token, userId, pageIds, cookie } },
                    { status: () => ({ json: () => {} }) } // Dummy response
                );
            }, 5000);
        });

        pancakeWs.on('error', (error) => {
            console.error('[REALTIME] Pancake WS error:', error.message);
        });

        res.json({ success: true, message: 'WebSocket client started' });

    } catch (error) {
        console.error('[REALTIME] Error starting:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// =====================================================
// 3. PHOENIX PROTOCOL - Channel Management
// =====================================================

function makeRef() {
    return String(refCounter++);
}

function generateClientSession() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Join Phoenix channels
 * @param {string} token - JWT access token
 * @param {string} userId - Pancake user ID
 * @param {Array} pageIds - Array of page IDs
 */
function joinChannels(token, userId, pageIds) {
    if (!pancakeWs || pancakeWs.readyState !== WebSocket.OPEN) return;

    // 1. Join User Channel
    const userRef = makeRef();
    pancakeWs.send(JSON.stringify([
        userRef, userRef,
        `users:${userId}`,
        "phx_join",
        {
            accessToken: token,
            userId: userId,
            platform: "web"
        }
    ]));
    console.log('[REALTIME] Joining users channel...');

    // 2. Join Multiple Pages Channel
    const pagesRef = makeRef();
    pancakeWs.send(JSON.stringify([
        pagesRef, pagesRef,
        `multiple_pages:${userId}`,
        "phx_join",
        {
            accessToken: token,
            userId: userId,
            clientSession: generateClientSession(),
            pageIds: pageIds.map(String),
            platform: "web"
        }
    ]));
    console.log('[REALTIME] Joining multiple_pages channel...');

    // 3. Get Online Status (after 1s)
    setTimeout(() => {
        if (!pancakeWs || pancakeWs.readyState !== WebSocket.OPEN) return;
        const statusRef = makeRef();
        pancakeWs.send(JSON.stringify([
            pagesRef, statusRef,
            `multiple_pages:${userId}`,
            "get_online_status",
            {}
        ]));
    }, 1000);
}

// =====================================================
// 4. HEARTBEAT - Keep connection alive
// =====================================================

function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
        if (pancakeWs && pancakeWs.readyState === WebSocket.OPEN) {
            const ref = makeRef();
            pancakeWs.send(JSON.stringify([null, ref, "phoenix", "heartbeat", {}]));
        }
    }, 30000); // Every 30 seconds
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// =====================================================
// 5. MESSAGE HANDLING - Parse and forward to browsers
// =====================================================

/**
 * Handle incoming message from Pancake.vn
 * Parse Phoenix protocol and forward relevant events to browser clients
 */
function handlePancakeMessage(data, userId) {
    try {
        const msg = JSON.parse(data);
        const [joinRef, ref, topic, event, payload] = msg;

        if (event === 'phx_reply') {
            if (payload.status === 'ok') {
                // Join/push success
            } else {
                console.warn('[REALTIME] Join/Push error:', payload);
            }
        } else if (event === 'pages:update_conversation') {
            console.log('[REALTIME] Conversation update received');
            // Forward to all connected browser clients
            broadcastToClients({
                type: 'pages:update_conversation',
                payload: payload
            });
        } else if (event === 'order:tags_updated') {
            console.log('[REALTIME] Tags update received');
            broadcastToClients({
                type: 'order:tags_updated',
                payload: payload
            });
        }
    } catch (error) {
        console.error('[REALTIME] Error parsing message:', error);
    }
}

/**
 * Broadcast message to all connected browser WebSocket clients
 */
function broadcastToClients(message) {
    const data = JSON.stringify(message);
    for (const client of browserClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    }
}

// =====================================================
// 6. WEBSOCKET SERVER - Accept browser connections
// =====================================================

/**
 * Setup WebSocket server for browser clients
 * @param {http.Server} server - HTTP server instance
 */
function setupWebSocketServer(server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        console.log('[WS-SERVER] Browser client connected');
        browserClients.add(ws);

        ws.on('close', () => {
            console.log('[WS-SERVER] Browser client disconnected');
            browserClients.delete(ws);
        });

        ws.on('error', (error) => {
            console.error('[WS-SERVER] Client error:', error.message);
            browserClients.delete(ws);
        });
    });

    console.log('[WS-SERVER] WebSocket server ready');
}

// =====================================================
// 7. EXPRESS APP SETUP
// =====================================================

/**
 * Setup Express app with all routes
 * @returns {Object} { app, setupWebSocketServer }
 */
function createApp() {
    const app = express();
    app.use(express.json());

    // CORS middleware
    app.use((req, res, next) => {
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie'
        });
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
        next();
    });

    // Routes
    app.post('/api/realtime/start', handleRealtimeStart);
    app.use('/api/pancake', router);

    // Health check
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            pancakeWsConnected: pancakeWs?.readyState === WebSocket.OPEN,
            browserClients: browserClients.size
        });
    });

    return { app, setupWebSocketServer };
}

// =====================================================
// 8. START SERVER
// =====================================================

const PORT = process.env.PORT || 3000;
const { app, setupWebSocketServer: setupWs } = createApp();

const server = app.listen(PORT, () => {
    console.log(`[SERVER] Pancake Proxy running on port ${PORT}`);
});

setupWs(server);

module.exports = { createApp, router, handleRealtimeStart };
