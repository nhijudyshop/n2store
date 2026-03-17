// =====================================================
// N2STORE PANCAKE WEBSOCKET CLIENT (Multi-Account)
// Nhận tin nhắn Facebook Page realtime qua Pancake Phoenix WebSocket
// Tự động load tokens từ Firebase Firestore
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
// FIREBASE (read Pancake tokens from Firestore)
// =====================================================

let firestore = null;

function initFirebase() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
        console.log('[FIREBASE] Not configured (missing env vars)');
        return;
    }

    try {
        const admin = require('firebase-admin');
        admin.initializeApp({
            credential: admin.credential.cert({ projectId, clientEmail, privateKey })
        });
        firestore = admin.firestore();
        console.log('[FIREBASE] Initialized');
    } catch (err) {
        console.error('[FIREBASE] Init error:', err.message);
    }
}

initFirebase();

async function loadTokensFromFirebase() {
    if (!firestore) return [];

    try {
        const doc = await firestore.collection('pancake_tokens').doc('accounts').get();
        if (!doc.exists) {
            console.log('[FIREBASE] No pancake_tokens/accounts document found');
            return [];
        }

        const data = doc.data()?.data;
        if (!data) return [];

        const accounts = Object.entries(data)
            .filter(([, info]) => info.token && info.uid)
            .filter(([, info]) => {
                // Skip expired tokens
                if (info.exp && info.exp < Date.now() / 1000) {
                    console.log(`[FIREBASE] Skipping expired token: ${info.name} (exp: ${new Date(info.exp * 1000).toISOString()})`);
                    return false;
                }
                return true;
            })
            .map(([uid, info]) => ({
                userId: info.uid || uid,
                token: info.token,
                name: info.name || 'unknown',
                cookie: info.cookie || `jwt=${info.token}`
            }));

        console.log(`[FIREBASE] Loaded ${accounts.length} accounts: ${accounts.map(a => a.name).join(', ')}`);
        return accounts;
    } catch (err) {
        console.error('[FIREBASE] Load error:', err.message);
        return [];
    }
}

// =====================================================
// PANCAKE API - Auto-discover pageIds
// =====================================================

async function discoverPageIds(token) {
    try {
        const res = await fetch(`https://pancake.vn/api/v1/pages?access_token=${encodeURIComponent(token)}`, {
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
                'Origin': 'https://pancake.vn',
                'Referer': 'https://pancake.vn/multi_pages',
                'Cookie': `jwt=${token}; locale=vi`,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
                'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin'
            }
        });

        if (!res.ok) {
            console.error(`[PANCAKE-API] Failed to fetch pages: ${res.status} ${res.statusText}`);
            return { pageIds: [], pages: [] };
        }

        const data = await res.json();

        if (!data.success || !data.categorized) {
            console.error('[PANCAKE-API] Unexpected response:', JSON.stringify(data).substring(0, 200));
            return { pageIds: [], pages: [] };
        }

        const allPages = data.categorized.activated || [];
        const allPageIds = data.categorized.activated_page_ids || [];

        // Filter out Instagram pages (igo_) to avoid subscription errors
        const pageIds = allPageIds.filter(id => !id.startsWith('igo_'));
        const pages = allPages.filter(p => !String(p.id).startsWith('igo_'));

        console.log(`[PANCAKE-API] Discovered ${pageIds.length} pages: ${pages.map(p => p.name || p.id).join(', ')}`);
        return { pageIds, pages };
    } catch (err) {
        console.error('[PANCAKE-API] Discover pages error:', err.message);
        return { pageIds: [], pages: [] };
    }
}

// =====================================================
// IN-MEMORY EVENT STORE
// =====================================================

const eventStore = [];
let eventIdCounter = 0;

function storeEvent(type, payload, accountName) {
    const event = {
        id: ++eventIdCounter,
        type,
        account: accountName,
        timestamp: new Date().toISOString(),
        payload
    };

    eventStore.push(event);

    while (eventStore.length > MAX_EVENTS) {
        eventStore.shift();
    }

    return event;
}

// =====================================================
// PANCAKE WEBSOCKET CLIENT (Phoenix Protocol v2)
// =====================================================

class PancakeWebSocketClient {
    constructor(name = 'default') {
        this.name = name;
        this.ws = null;
        this.url = 'wss://pancake.vn/socket/websocket?vsn=2.0.0';
        this.isConnected = false;
        this.refCounter = 1;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;

        this.token = null;
        this.userId = null;
        this.pageIds = [];
        this.cookie = null;

        this.connectedAt = null;
        this.eventsReceived = 0;
        this.joinErrors = [];
    }

    tag() { return `[WS:${this.name}]`; }

    makeRef() { return String(this.refCounter++); }

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
        this.maxReconnectAttempts = 10;
        this.joinErrors = [];
        this.connect();
    }

    stop() {
        clearTimeout(this.reconnectTimer);
        this.stopHeartbeat();
        this.maxReconnectAttempts = 0;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.connectedAt = null;
        console.log(`${this.tag()} Stopped`);
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log(`${this.tag()} Connecting... (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

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
            console.log(`${this.tag()} Connected!`);
            this.isConnected = true;
            this.connectedAt = new Date().toISOString();
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.joinChannels();
        });

        this.ws.on('close', (code) => {
            console.log(`${this.tag()} Closed (code: ${code})`);
            this.isConnected = false;
            this.connectedAt = null;
            this.stopHeartbeat();

            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000);
                this.reconnectAttempts++;
                console.log(`${this.tag()} Reconnecting in ${delay / 1000}s...`);
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else {
                console.error(`${this.tag()} Max reconnect attempts reached.`);
            }
        });

        this.ws.on('error', (err) => {
            console.error(`${this.tag()} Error: ${err.message}`);
        });

        this.ws.on('message', (data) => {
            try {
                this.handleMessage(JSON.parse(data));
            } catch (e) {
                console.error(`${this.tag()} Parse error: ${e.message}`);
            }
        });
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify([null, this.makeRef(), 'phoenix', 'heartbeat', {}]));
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

        const userRef = this.makeRef();
        this.ws.send(JSON.stringify([
            userRef, userRef, `users:${this.userId}`, 'phx_join',
            { accessToken: this.token, userId: this.userId, platform: 'web' }
        ]));
        console.log(`${this.tag()} Joining users:${this.userId}`);

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
        console.log(`${this.tag()} Joining multiple_pages with ${this.pageIds.length} pages: [${this.pageIds.join(', ')}]`);

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

        if (event === 'phx_reply') {
            if (payload.status === 'ok') {
                if (topic.startsWith('users:')) {
                    console.log(`${this.tag()} Joined users channel`);
                } else if (topic.startsWith('multiple_pages:')) {
                    console.log(`${this.tag()} Joined multiple_pages channel`);
                }
            } else if (payload.status === 'error') {
                const errMsg = JSON.stringify(payload.response || {}).substring(0, 200);
                console.error(`${this.tag()} Join ERROR: topic=${topic} ${errMsg}`);
                this.joinErrors.push({ topic, error: payload.response, time: new Date().toISOString() });
            }
            return;
        }

        if (topic === 'phoenix') return;

        if (event === 'pages:update_conversation') {
            this.eventsReceived++;
            const conv = payload.conversation;
            const stored = storeEvent('update_conversation', payload, this.name);

            console.log(`${this.tag()} ========================================`);
            console.log(`${this.tag()} #${stored.id} UPDATE_CONVERSATION`);
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
            console.log(`${this.tag()} ========================================`);
            return;
        }

        if (event === 'pages:new_message') {
            this.eventsReceived++;
            const message = payload.message || payload;
            const stored = storeEvent('new_message', payload, this.name);
            console.log(`${this.tag()} #${stored.id} NEW_MESSAGE | from=${message.from?.name || 'unknown'} | "${(message.message || '').substring(0, 80)}"`);
            return;
        }

        if (event === 'order:tags_updated' || event === 'tags_updated') {
            this.eventsReceived++;
            storeEvent('tags_updated', payload, this.name);
            console.log(`${this.tag()} TAGS_UPDATED: conv=${payload.conversation_id}`);
            return;
        }

        if (event === 'online_status' || event === 'presence_state' || event === 'presence_diff') return;

        this.eventsReceived++;
        storeEvent(event, payload, this.name);
        console.log(`${this.tag()} EVENT: ${event} | keys: ${Object.keys(payload || {}).join(', ')}`);
    }

    getStatus() {
        return {
            name: this.name,
            connected: this.isConnected,
            connectedAt: this.connectedAt,
            uptime: this.connectedAt ? Math.round((Date.now() - new Date(this.connectedAt).getTime()) / 1000) : 0,
            userId: this.userId,
            pageIds: this.pageIds,
            pageCount: this.pageIds.length,
            eventsReceived: this.eventsReceived,
            reconnectAttempts: this.reconnectAttempts,
            wsState: this.ws ? this.ws.readyState : null,
            joinErrors: this.joinErrors
        };
    }
}

// =====================================================
// MULTI-CLIENT MANAGER
// =====================================================

const clients = new Map(); // userId → PancakeWebSocketClient

async function startClient(token, userId, name, cookie) {
    // Stop existing client for this userId
    if (clients.has(userId)) {
        clients.get(userId).stop();
    }

    // Discover pageIds from Pancake API
    console.log(`[MANAGER] Discovering pages for ${name}...`);
    const { pageIds, pages } = await discoverPageIds(token);

    if (pageIds.length === 0) {
        console.warn(`[MANAGER] No pages found for ${name}, skipping`);
        return null;
    }

    // Save to DB for future use
    if (db) {
        try {
            await db.query(`
                INSERT INTO realtime_credentials (client_type, token, user_id, page_ids, cookie, is_active, updated_at)
                VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
                ON CONFLICT (client_type, user_id) DO UPDATE SET
                    token = EXCLUDED.token,
                    page_ids = EXCLUDED.page_ids,
                    cookie = EXCLUDED.cookie,
                    is_active = TRUE,
                    updated_at = NOW()
            `, [`pancake_${name}`, token, userId, JSON.stringify(pageIds), cookie]);
            console.log(`[MANAGER] Saved credentials for ${name} to DB`);
        } catch (e) {
            // Ignore if table structure doesn't support composite key
            console.log(`[MANAGER] Could not save to DB: ${e.message}`);
        }
    }

    console.log(`[MANAGER] Starting client: ${name} (${userId}) with ${pageIds.length} pages`);
    const client = new PancakeWebSocketClient(name);
    client.start(token, userId, pageIds, cookie);
    clients.set(userId, client);
    return client;
}

// =====================================================
// STARTUP - Load tokens from Firebase + DB
// =====================================================

async function autoConnect() {
    console.log('[STARTUP] Auto-connecting...');

    // 1. Try Firebase first
    const firebaseAccounts = await loadTokensFromFirebase();

    if (firebaseAccounts.length > 0) {
        for (const account of firebaseAccounts) {
            // Stagger connections to avoid rate limiting
            await startClient(account.token, account.userId, account.name, account.cookie);
            await new Promise(r => setTimeout(r, 2000));
        }
        console.log(`[STARTUP] Started ${clients.size} clients from Firebase`);
        return;
    }

    // 2. Fallback to PostgreSQL
    if (!db) {
        console.log('[STARTUP] No Firebase or DB configured. Use POST /api/start to connect manually.');
        return;
    }

    try {
        const result = await db.query(
            `SELECT token, user_id, page_ids, cookie FROM realtime_credentials WHERE client_type = 'pancake' AND is_active = TRUE`
        );

        for (const row of result.rows) {
            const pageIds = typeof row.page_ids === 'string' ? JSON.parse(row.page_ids) : row.page_ids;
            if (!row.token || !row.user_id || !pageIds?.length) continue;

            const client = new PancakeWebSocketClient(row.user_id.substring(0, 8));
            client.start(row.token, row.user_id, pageIds, row.cookie);
            clients.set(row.user_id, client);
            await new Promise(r => setTimeout(r, 2000));
        }
        console.log(`[STARTUP] Started ${clients.size} clients from DB`);
    } catch (err) {
        console.error('[STARTUP] DB load error:', err.message);
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

app.get('/', (req, res) => {
    const connectedCount = [...clients.values()].filter(c => c.isConnected).length;
    res.json({
        service: 'N2Store Pancake WebSocket Client',
        version: '3.0.0',
        accounts: `${connectedCount}/${clients.size} connected`,
        firebase: firestore ? 'configured' : 'not configured',
        endpoints: {
            'GET /ping': 'Health check',
            'GET /api/status': 'All clients status',
            'GET /api/events': 'Query events (?since=ISO&type=...&limit=50&account=...)',
            'GET /api/events/latest': 'Latest events (?limit=20)',
            'POST /api/start': 'Start client { token, userId, name, cookie }',
            'POST /api/reconnect': 'Reconnect all clients',
            'POST /api/stop': 'Stop all clients',
            'POST /api/reload': 'Reload tokens from Firebase'
        }
    });
});

app.get('/ping', (req, res) => {
    const connectedCount = [...clients.values()].filter(c => c.isConnected).length;
    const totalEvents = [...clients.values()].reduce((sum, c) => sum + c.eventsReceived, 0);
    res.json({
        success: true,
        service: 'n2store-pancake-ws',
        accounts: { total: clients.size, connected: connectedCount },
        uptime: process.uptime(),
        eventsReceived: totalEvents,
        eventStoreSize: eventStore.length,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/status', (req, res) => {
    const statuses = {};
    for (const [userId, client] of clients) {
        statuses[client.name] = client.getStatus();
    }
    res.json({
        totalClients: clients.size,
        connectedClients: [...clients.values()].filter(c => c.isConnected).length,
        eventStoreSize: eventStore.length,
        clients: statuses
    });
});

app.get('/api/events', (req, res) => {
    const since = req.query.since;
    const type = req.query.type;
    const account = req.query.account;
    const limit = parseInt(req.query.limit || '50');
    const offset = parseInt(req.query.offset || '0');

    let filtered = eventStore;

    if (since) {
        const sinceDate = new Date(since);
        filtered = filtered.filter(e => new Date(e.timestamp) > sinceDate);
    }
    if (type) filtered = filtered.filter(e => e.type === type);
    if (account) filtered = filtered.filter(e => e.account === account);

    const total = filtered.length;
    const results = filtered.slice(offset, offset + limit);

    res.json({ total, offset, limit, events: results });
});

app.get('/api/events/latest', (req, res) => {
    const limit = parseInt(req.query.limit || '20');
    const events = eventStore.slice(-limit).reverse();
    res.json({ count: events.length, events });
});

app.post('/api/start', async (req, res) => {
    const { token, userId, name, cookie } = req.body;

    if (!token || !userId) {
        return res.status(400).json({ error: 'Missing required: token, userId' });
    }

    const client = await startClient(token, userId, name || userId.substring(0, 8), cookie || `jwt=${token}`);
    if (!client) {
        return res.status(400).json({ error: 'No pages found for this account' });
    }
    res.json({ success: true, message: `Client ${client.name} started`, pageCount: client.pageIds.length, pageIds: client.pageIds });
});

app.post('/api/reconnect', (req, res) => {
    let count = 0;
    for (const client of clients.values()) {
        if (client.token) {
            client.reconnectAttempts = 0;
            client.maxReconnectAttempts = 10;
            if (client.ws) client.ws.close();
            else client.connect();
            count++;
        }
    }
    res.json({ success: true, message: `Reconnecting ${count} clients` });
});

app.post('/api/stop', (req, res) => {
    for (const client of clients.values()) {
        client.stop();
    }
    clients.clear();
    res.json({ success: true, message: 'All clients stopped' });
});

app.post('/api/reload', async (req, res) => {
    // Stop all existing clients
    for (const client of clients.values()) {
        client.stop();
    }
    clients.clear();

    // Reload from Firebase
    await autoConnect();
    const connectedCount = [...clients.values()].filter(c => c.isConnected).length;
    res.json({
        success: true,
        message: `Reloaded: ${clients.size} accounts, ${connectedCount} connecting`,
        accounts: [...clients.values()].map(c => ({ name: c.name, userId: c.userId, pages: c.pageIds.length }))
    });
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log('');
    console.log('=====================================================');
    console.log(' N2STORE PANCAKE WEBSOCKET CLIENT v3.0');
    console.log(' Multi-Account + Firebase Integration');
    console.log('=====================================================');
    console.log(`  Port:          ${PORT}`);
    console.log(`  Max Events:    ${MAX_EVENTS}`);
    console.log(`  Database:      ${db ? 'configured' : 'NOT SET'}`);
    console.log(`  Firebase:      ${firestore ? 'configured' : 'NOT SET'}`);
    console.log(`  Server URL:    http://localhost:${PORT}`);
    console.log('=====================================================');
    console.log('');

    setTimeout(() => autoConnect(), 2000);
});
