// =====================================================
// N2STORE PANCAKE WEBSOCKET CLIENT
// Nhận tin nhắn Facebook Page realtime qua Pancake Phoenix WebSocket
// Deploy trên Render.com (service: n2store-tpos-pancake)
// =====================================================

require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_EVENTS = parseInt(process.env.MAX_EVENTS || '1000');

// =====================================================
// DATABASE (shared with render.com server)
// =====================================================

let db = null;

if (process.env.DATABASE_URL) {
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
    });

    db.query('SELECT NOW()')
        .then(() => console.log('[DB] PostgreSQL connected'))
        .catch(err => console.error('[DB] PostgreSQL error:', err.message));
}

// =====================================================
// IN-MEMORY EVENT STORE
// =====================================================

const eventStore = [];
let eventIdCounter = 0;

function storeEvent(type, payload) {
    const event = {
        id: ++eventIdCounter,
        type,
        timestamp: new Date().toISOString(),
        payload
    };

    eventStore.push(event);

    // Trim oldest events when exceeding limit
    while (eventStore.length > MAX_EVENTS) {
        eventStore.shift();
    }

    return event;
}

// =====================================================
// PANCAKE WEBSOCKET CLIENT (Phoenix Protocol v2)
// Adapted from render.com/server.js RealtimeClient
// =====================================================

class PancakeWebSocketClient {
    constructor() {
        this.ws = null;
        this.url = 'wss://pancake.vn/socket/websocket?vsn=2.0.0';
        this.isConnected = false;
        this.refCounter = 1;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;

        // Credentials
        this.token = null;
        this.userId = null;
        this.pageIds = [];
        this.cookie = null;

        // Stats
        this.connectedAt = null;
        this.eventsReceived = 0;
    }

    makeRef() {
        return String(this.refCounter++);
    }

    generateClientSession() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 64; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    start(token, userId, pageIds, cookie = null) {
        this.token = token;
        this.userId = userId;
        this.pageIds = pageIds.map(id => String(id));
        this.cookie = cookie;
        this.reconnectAttempts = 0;
        this.connect();
    }

    stop() {
        clearTimeout(this.reconnectTimer);
        this.stopHeartbeat();
        this.maxReconnectAttempts = 0; // Prevent reconnection
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.connectedAt = null;
        console.log('[PANCAKE-WS] Stopped');
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log(`[PANCAKE-WS] Connecting to Pancake... (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

        const headers = {
            'Origin': 'https://pancake.vn',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        if (this.cookie) {
            headers['Cookie'] = this.cookie;
        }

        this.ws = new WebSocket(this.url, { headers });

        this.ws.on('open', () => {
            console.log('[PANCAKE-WS] Connected!');
            this.isConnected = true;
            this.connectedAt = new Date().toISOString();
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.joinChannels();
        });

        this.ws.on('close', (code, reason) => {
            console.log(`[PANCAKE-WS] Closed (code: ${code})`);
            this.isConnected = false;
            this.connectedAt = null;
            this.stopHeartbeat();

            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000);
                this.reconnectAttempts++;
                console.log(`[PANCAKE-WS] Reconnecting in ${delay / 1000}s... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else {
                console.error('[PANCAKE-WS] Max reconnect attempts reached. Call POST /api/reconnect to retry.');
            }
        });

        this.ws.on('error', (err) => {
            console.error('[PANCAKE-WS] Error:', err.message);
        });

        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                this.handleMessage(msg);
            } catch (e) {
                console.error('[PANCAKE-WS] Parse error:', e.message);
            }
        });
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const ref = this.makeRef();
                this.ws.send(JSON.stringify([null, ref, 'phoenix', 'heartbeat', {}]));
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    joinChannels() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // 1. Join User Channel
        const userRef = this.makeRef();
        this.ws.send(JSON.stringify([
            userRef, userRef, `users:${this.userId}`, 'phx_join',
            { accessToken: this.token, userId: this.userId, platform: 'web' }
        ]));
        console.log(`[PANCAKE-WS] Joining users:${this.userId}`);

        // 2. Join Multiple Pages Channel
        const pagesRef = this.makeRef();
        this.ws.send(JSON.stringify([
            pagesRef, pagesRef, `multiple_pages:${this.userId}`, 'phx_join',
            {
                accessToken: this.token,
                userId: this.userId,
                clientSession: this.generateClientSession(),
                pageIds: this.pageIds,
                platform: 'web'
            }
        ]));
        console.log(`[PANCAKE-WS] Joining multiple_pages:${this.userId} with ${this.pageIds.length} pages`);

        // 3. Get Online Status
        setTimeout(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            const statusRef = this.makeRef();
            this.ws.send(JSON.stringify([
                pagesRef, statusRef, `multiple_pages:${this.userId}`, 'get_online_status', {}
            ]));
        }, 1000);
    }

    handleMessage(msg) {
        const [joinRef, ref, topic, event, payload] = msg;

        // Channel join replies
        if (event === 'phx_reply') {
            if (payload.status === 'ok') {
                if (topic.startsWith('users:')) {
                    console.log('[PANCAKE-WS] Joined users channel');
                } else if (topic.startsWith('multiple_pages:')) {
                    console.log('[PANCAKE-WS] Joined multiple_pages channel');
                }
            } else if (payload.status === 'error') {
                console.error(`[PANCAKE-WS] Join ERROR: topic=${topic}`, JSON.stringify(payload.response || {}).substring(0, 200));
            }
            return;
        }

        // Skip heartbeat replies
        if (topic === 'phoenix') return;

        // =====================================================
        // EVENT HANDLERS
        // =====================================================

        if (event === 'pages:update_conversation') {
            this.eventsReceived++;
            const conv = payload.conversation;
            const stored = storeEvent('update_conversation', payload);

            console.log('[PANCAKE-WS] ========================================');
            console.log(`[PANCAKE-WS] #${stored.id} UPDATE_CONVERSATION`);
            console.log(`  Page:    ${conv.page_id}`);
            console.log(`  Type:    ${conv.type}`);
            console.log(`  From:    ${conv.from?.name || 'unknown'} (${conv.from?.id || ''})`);
            console.log(`  Snippet: ${(conv.snippet || '').substring(0, 100)}`);
            console.log(`  Unread:  ${conv.unread_count || 0}`);
            console.log(`  ConvID:  ${conv.id}`);
            console.log(`  Time:    ${conv.updated_at || stored.timestamp}`);
            if (conv.customers?.length) {
                console.log(`  Customer: ${conv.customers[0].name} (${conv.customers[0].fb_id})`);
            }
            console.log('[PANCAKE-WS] ========================================');
            console.log('');
            return;
        }

        if (event === 'pages:new_message') {
            this.eventsReceived++;
            const message = payload.message || payload;
            const stored = storeEvent('new_message', payload);

            console.log(`[PANCAKE-WS] #${stored.id} NEW_MESSAGE`);
            console.log(`  ConvID:  ${message.conversation_id || ''}`);
            console.log(`  From:    ${message.from?.name || 'unknown'}`);
            console.log(`  Text:    ${(message.message || '').substring(0, 100)}`);
            console.log('');
            return;
        }

        if (event === 'order:tags_updated' || event === 'tags_updated') {
            this.eventsReceived++;
            storeEvent('tags_updated', payload);
            console.log(`[PANCAKE-WS] TAGS_UPDATED: conv=${payload.conversation_id}, tags=${JSON.stringify(payload.tags || [])}`);
            return;
        }

        if (event === 'online_status') {
            // Skip logging online status (too noisy)
            return;
        }

        if (event === 'presence_state' || event === 'presence_diff') {
            return;
        }

        // Unknown event - log for debugging
        this.eventsReceived++;
        storeEvent(event, payload);
        console.log(`[PANCAKE-WS] UNKNOWN EVENT: ${event} | topic: ${topic}`);
        console.log(`  Payload keys: ${Object.keys(payload || {}).join(', ')}`);
        console.log('');
    }

    getStatus() {
        return {
            connected: this.isConnected,
            connectedAt: this.connectedAt,
            uptime: this.connectedAt ? Math.round((Date.now() - new Date(this.connectedAt).getTime()) / 1000) : 0,
            userId: this.userId,
            pageIds: this.pageIds,
            pageCount: this.pageIds.length,
            eventsReceived: this.eventsReceived,
            reconnectAttempts: this.reconnectAttempts,
            wsState: this.ws ? this.ws.readyState : null,
            eventStoreSize: eventStore.length
        };
    }
}

// =====================================================
// INITIALIZE CLIENT
// =====================================================

const client = new PancakeWebSocketClient();

// =====================================================
// LOAD CREDENTIALS FROM DATABASE
// =====================================================

async function loadCredentialsAndConnect() {
    if (!db) {
        console.log('[STARTUP] No DATABASE_URL configured. Use POST /api/start to connect manually.');
        return;
    }

    try {
        const result = await db.query(
            `SELECT token, user_id, page_ids, cookie FROM realtime_credentials WHERE client_type = 'pancake' AND is_active = TRUE LIMIT 1`
        );

        if (result.rows.length === 0) {
            console.log('[STARTUP] No active Pancake credentials found in DB. Use POST /api/start to connect manually.');
            return;
        }

        const row = result.rows[0];
        const token = row.token;
        const userId = row.user_id;
        const pageIds = typeof row.page_ids === 'string' ? JSON.parse(row.page_ids) : row.page_ids;
        const cookie = row.cookie;

        if (!token || !userId || !pageIds?.length) {
            console.log('[STARTUP] Incomplete credentials in DB. Use POST /api/start to connect manually.');
            return;
        }

        console.log(`[STARTUP] Loaded credentials: userId=${userId}, pages=${pageIds.length}`);
        client.start(token, userId, pageIds, cookie);
    } catch (err) {
        console.error('[STARTUP] Failed to load credentials:', err.message);
    }
}

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json());

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// =====================================================
// ROUTES
// =====================================================

// Root - server info
app.get('/', (req, res) => {
    res.json({
        service: 'N2Store Pancake WebSocket Client',
        version: '2.0.0',
        status: client.isConnected ? 'connected' : 'disconnected',
        endpoints: {
            'GET /ping': 'Health check',
            'GET /api/status': 'WebSocket connection status',
            'GET /api/events': 'Query events (?since=ISO&type=update_conversation&limit=50)',
            'GET /api/events/latest': 'Latest events (?limit=20)',
            'POST /api/start': 'Start with credentials { token, userId, pageIds, cookie }',
            'POST /api/reconnect': 'Force reconnect',
            'POST /api/stop': 'Stop WebSocket connection'
        }
    });
});

// Health check
app.get('/ping', (req, res) => {
    res.json({
        success: true,
        service: 'n2store-pancake-ws',
        websocket: client.isConnected ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        eventsReceived: client.eventsReceived,
        eventStoreSize: eventStore.length,
        timestamp: new Date().toISOString()
    });
});

// Detailed status
app.get('/api/status', (req, res) => {
    res.json(client.getStatus());
});

// Query events
app.get('/api/events', (req, res) => {
    const since = req.query.since;
    const type = req.query.type;
    const limit = parseInt(req.query.limit || '50');
    const offset = parseInt(req.query.offset || '0');

    let filtered = eventStore;

    if (since) {
        const sinceDate = new Date(since);
        filtered = filtered.filter(e => new Date(e.timestamp) > sinceDate);
    }

    if (type) {
        filtered = filtered.filter(e => e.type === type);
    }

    const total = filtered.length;
    const results = filtered.slice(offset, offset + limit);

    res.json({
        total,
        offset,
        limit,
        events: results
    });
});

// Latest events
app.get('/api/events/latest', (req, res) => {
    const limit = parseInt(req.query.limit || '20');
    const events = eventStore.slice(-limit).reverse();
    res.json({ count: events.length, events });
});

// Manual start
app.post('/api/start', (req, res) => {
    const { token, userId, pageIds, cookie } = req.body;

    if (!token || !userId || !pageIds?.length) {
        return res.status(400).json({ error: 'Missing required: token, userId, pageIds[]' });
    }

    client.start(token, userId, pageIds, cookie);
    res.json({ success: true, message: 'WebSocket client started', pageCount: pageIds.length });
});

// Force reconnect
app.post('/api/reconnect', (req, res) => {
    if (!client.token) {
        return res.status(400).json({ error: 'No credentials. Use POST /api/start first.' });
    }

    client.reconnectAttempts = 0;
    client.maxReconnectAttempts = 10;

    if (client.ws) {
        client.ws.close();
    } else {
        client.connect();
    }

    res.json({ success: true, message: 'Reconnecting...' });
});

// Stop connection
app.post('/api/stop', (req, res) => {
    client.stop();
    res.json({ success: true, message: 'WebSocket client stopped' });
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log('');
    console.log('=====================================================');
    console.log(' N2STORE PANCAKE WEBSOCKET CLIENT');
    console.log('=====================================================');
    console.log(`  Port:          ${PORT}`);
    console.log(`  Max Events:    ${MAX_EVENTS}`);
    console.log(`  Database:      ${db ? 'configured' : 'NOT SET'}`);
    console.log(`  Server URL:    http://localhost:${PORT}`);
    console.log('=====================================================');
    console.log('');

    // Auto-connect after server starts (delay for DB readiness)
    setTimeout(() => {
        loadCredentialsAndConnect();
    }, 2000);
});
