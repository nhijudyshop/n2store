// =====================================================
// N2STORE REALTIME SERVER
// WebSocket proxy for Pancake.vn and TPOS ChatOmni
// With PostgreSQL for message persistence
// Deployed on Render.com (Standard Plan)
// =====================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// DATABASE CONNECTION
// =====================================================

let dbPool = null;

async function initDatabase() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.warn('[DATABASE] ⚠️ DATABASE_URL not set - running without database persistence');
        return null;
    }

    try {
        dbPool = new Pool({
            connectionString: databaseUrl,
            ssl: { rejectUnauthorized: false },
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        });

        // Test connection
        const client = await dbPool.connect();
        await client.query('SELECT 1');
        client.release();

        console.log('[DATABASE] ✅ PostgreSQL connected successfully');

        // Initialize tables
        await ensureTablesExist();

        return dbPool;
    } catch (error) {
        console.error('[DATABASE] ❌ Failed to connect:', error.message);
        return null;
    }
}

async function ensureTablesExist() {
    if (!dbPool) return;

    try {
        // Create realtime_credentials table
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS realtime_credentials (
                id SERIAL PRIMARY KEY,
                client_type VARCHAR(20) NOT NULL UNIQUE CHECK (client_type IN ('pancake', 'tpos')),
                token TEXT NOT NULL,
                user_id VARCHAR(50),
                page_ids TEXT,
                cookie TEXT,
                room VARCHAR(100),
                is_active BOOLEAN DEFAULT TRUE,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create pending_customers table
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS pending_customers (
                id SERIAL PRIMARY KEY,
                psid VARCHAR(50) NOT NULL,
                page_id VARCHAR(50) NOT NULL,
                customer_name VARCHAR(200),
                last_message_snippet TEXT,
                last_message_time TIMESTAMP DEFAULT NOW(),
                message_count INTEGER DEFAULT 1,
                type VARCHAR(20) DEFAULT 'INBOX' CHECK (type IN ('INBOX', 'COMMENT')),
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(psid, page_id)
            )
        `);

        // Create indexes
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_pending_customers_psid ON pending_customers(psid, page_id);
            CREATE INDEX IF NOT EXISTS idx_pending_customers_time ON pending_customers(last_message_time DESC);
        `);

        console.log('[DATABASE] ✅ Tables initialized');
    } catch (error) {
        console.error('[DATABASE] Error creating tables:', error.message);
    }
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================

async function upsertPendingCustomer(data) {
    if (!dbPool) return;

    try {
        const query = `
            INSERT INTO pending_customers
                (psid, page_id, customer_name, last_message_snippet, last_message_time, message_count, type)
            VALUES ($1, $2, $3, $4, NOW(), 1, $5)
            ON CONFLICT (psid, page_id)
            DO UPDATE SET
                customer_name = COALESCE(EXCLUDED.customer_name, pending_customers.customer_name),
                last_message_snippet = EXCLUDED.last_message_snippet,
                last_message_time = NOW(),
                message_count = pending_customers.message_count + 1
        `;

        await dbPool.query(query, [
            data.psid,
            data.pageId,
            data.customerName,
            data.snippet?.substring(0, 200),
            data.type || 'INBOX'
        ]);

        console.log(`[DATABASE] ✅ Upserted pending customer: ${data.psid} (${data.type})`);
    } catch (error) {
        console.error('[DATABASE] Error upserting pending customer:', error.message);
    }
}

async function saveRealtimeCredentials(clientType, credentials) {
    if (!dbPool) return;

    try {
        const query = `
            INSERT INTO realtime_credentials (client_type, token, user_id, page_ids, cookie, room, is_active, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
            ON CONFLICT (client_type)
            DO UPDATE SET
                token = EXCLUDED.token,
                user_id = EXCLUDED.user_id,
                page_ids = EXCLUDED.page_ids,
                cookie = EXCLUDED.cookie,
                room = EXCLUDED.room,
                is_active = TRUE,
                updated_at = NOW()
        `;

        await dbPool.query(query, [
            clientType,
            credentials.token,
            credentials.userId || null,
            credentials.pageIds ? JSON.stringify(credentials.pageIds) : null,
            credentials.cookie || null,
            credentials.room || null
        ]);

        console.log(`[DATABASE] ✅ Saved ${clientType} credentials for auto-reconnect`);
    } catch (error) {
        console.error('[DATABASE] Error saving credentials:', error.message);
    }
}

async function loadRealtimeCredentials(clientType) {
    if (!dbPool) return null;

    try {
        const result = await dbPool.query(
            'SELECT * FROM realtime_credentials WHERE client_type = $1 AND is_active = TRUE',
            [clientType]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('[DATABASE] Error loading credentials:', error.message);
        return null;
    }
}

async function disableRealtimeCredentials(clientType) {
    if (!dbPool) return;

    try {
        await dbPool.query(
            'UPDATE realtime_credentials SET is_active = FALSE WHERE client_type = $1',
            [clientType]
        );
        console.log(`[DATABASE] Disabled ${clientType} auto-connect`);
    } catch (error) {
        console.error('[DATABASE] Error disabling credentials:', error.message);
    }
}

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
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
// PANCAKE REALTIME CLIENT
// =====================================================

class RealtimeClient {
    constructor() {
        this.ws = null;
        this.url = "wss://pancake.vn/socket/websocket?vsn=2.0.0";
        this.isConnected = false;
        this.refCounter = 1;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 50; // Increased for 24/7 operation

        // User specific data
        this.token = null;
        this.userId = null;
        this.pageIds = [];
        this.cookie = null;
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

    async start(token, userId, pageIds, cookie = null, saveCredentials = true) {
        this.token = token;
        this.userId = userId;
        this.pageIds = pageIds.map(id => String(id));
        this.cookie = cookie;
        this.reconnectAttempts = 0;

        // Save credentials for auto-reconnect
        if (saveCredentials) {
            await saveRealtimeCredentials('pancake', {
                token,
                userId,
                pageIds: this.pageIds,
                cookie
            });
        }

        this.connect();
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log('[PANCAKE-WS] Connecting to Pancake...');
        const headers = {
            'Origin': 'https://pancake.vn',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        if (this.cookie) {
            headers['Cookie'] = this.cookie;
        }

        this.ws = new WebSocket(this.url, { headers });

        this.ws.on('open', () => {
            console.log('[PANCAKE-WS] ✅ Connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.joinChannels();
        });

        this.ws.on('close', (code, reason) => {
            console.log('[PANCAKE-WS] Closed', code, reason?.toString());
            this.isConnected = false;
            this.stopHeartbeat();

            // Exponential backoff with max 5 minutes
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts), 300000);
                this.reconnectAttempts++;
                console.log(`[PANCAKE-WS] Reconnecting in ${Math.round(delay/1000)}s (attempt ${this.reconnectAttempts})...`);
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else {
                console.error('[PANCAKE-WS] ❌ Max reconnect attempts reached. Will try again in 30 minutes.');
                // Reset and try again after 30 minutes
                setTimeout(() => {
                    this.reconnectAttempts = 0;
                    this.connect();
                }, 30 * 60 * 1000);
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
                console.error('[PANCAKE-WS] Parse error:', e);
            }
        });
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const ref = this.makeRef();
                this.ws.send(JSON.stringify([null, ref, "phoenix", "heartbeat", {}]));
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
        const userJoinMsg = [
            userRef, userRef, `users:${this.userId}`, "phx_join",
            { accessToken: this.token, userId: this.userId, platform: "web" }
        ];
        this.ws.send(JSON.stringify(userJoinMsg));
        console.log('[PANCAKE-WS] Joining users channel...');

        // 2. Join Multiple Pages Channel
        const pagesRef = this.makeRef();
        const pagesJoinMsg = [
            pagesRef, pagesRef, `multiple_pages:${this.userId}`, "phx_join",
            {
                accessToken: this.token,
                userId: this.userId,
                clientSession: this.generateClientSession(),
                pageIds: this.pageIds,
                platform: "web"
            }
        ];
        this.ws.send(JSON.stringify(pagesJoinMsg));
        console.log(`[PANCAKE-WS] Joining multiple_pages channel with ${this.pageIds.length} pages...`);

        // 3. Get Online Status
        setTimeout(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            const statusRef = this.makeRef();
            const statusMsg = [
                pagesRef, statusRef, `multiple_pages:${this.userId}`, "get_online_status", {}
            ];
            this.ws.send(JSON.stringify(statusMsg));
        }, 1000);
    }

    handleMessage(msg) {
        const [joinRef, ref, topic, event, payload] = msg;

        if (event === 'pages:update_conversation') {
            const conversation = payload.conversation;
            console.log('[PANCAKE-WS] 📩 New Message:', conversation?.id, '- Type:', conversation?.type);

            // 1. Broadcast to connected frontend clients
            broadcastToClients({
                type: 'pages:update_conversation',
                payload: payload
            });

            // 2. Save to database for persistence
            if (conversation) {
                const customerPsid = conversation.from_psid ||
                                    conversation.customers?.[0]?.fb_id ||
                                    conversation.from?.id;

                if (customerPsid) {
                    upsertPendingCustomer({
                        psid: customerPsid,
                        pageId: conversation.page_id,
                        customerName: conversation.from?.name || conversation.customers?.[0]?.name,
                        snippet: conversation.snippet || conversation.last_message?.message,
                        type: conversation.type || 'INBOX'
                    });
                }
            }
        } else if (event === 'order:tags_updated') {
            console.log('[PANCAKE-WS] 🏷️ Tags Updated:', payload);
            broadcastToClients({
                type: 'order:tags_updated',
                payload: payload
            });
        }
    }

    async stop(disableAutoConnect = true) {
        this.stopHeartbeat();
        clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.token = null;

        if (disableAutoConnect) {
            await disableRealtimeCredentials('pancake');
        }

        console.log('[PANCAKE-WS] Stopped');
    }

    getStatus() {
        return {
            connected: this.isConnected,
            hasToken: !!this.token,
            userId: this.userId,
            pageCount: this.pageIds?.length || 0,
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

// =====================================================
// TPOS REALTIME CLIENT (Socket.IO Protocol)
// =====================================================

class TposRealtimeClient {
    constructor() {
        this.ws = null;
        this.url = "wss://ws.chatomni.tpos.app/socket.io/?EIO=4&transport=websocket";
        this.isConnected = false;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 50;

        this.pingInterval = 25000;
        this.pingTimeout = 20000;
        this.lastPingTime = null;
        this.lastPongTime = null;

        this.token = null;
        this.room = 'tomato.tpos.vn';
    }

    async start(token, room = 'tomato.tpos.vn', saveCredentials = true) {
        this.token = token;
        this.room = room;
        this.reconnectAttempts = 0;

        // Save credentials for auto-reconnect
        if (saveCredentials) {
            await saveRealtimeCredentials('tpos', { token, room });
        }

        this.connect();
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log('[TPOS-WS] Connecting... (attempt', this.reconnectAttempts + 1, ')');

        const urlWithToken = `${this.url}&token=${encodeURIComponent(this.token)}`;

        const headers = {
            'Origin': 'https://nhijudyshop.github.io',
            'Authorization': `Bearer ${this.token}`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8'
        };

        this.ws = new WebSocket(urlWithToken, { headers });

        this.ws.on('open', () => {
            console.log('[TPOS-WS] WebSocket connected, sending handshake...');
            this.reconnectAttempts = 0;
            const namespaceMsg = '40/chatomni,';
            this.ws.send(namespaceMsg);
        });

        this.ws.on('close', (code, reason) => {
            console.log(`[TPOS-WS] Closed - Code: ${code}`);
            this.isConnected = false;
            this.stopHeartbeat();

            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts), 300000);
                this.reconnectAttempts++;
                console.log(`[TPOS-WS] Reconnecting in ${Math.round(delay/1000)}s...`);
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else {
                console.error('[TPOS-WS] ❌ Max reconnect attempts reached. Will try again in 30 minutes.');
                setTimeout(() => {
                    this.reconnectAttempts = 0;
                    this.connect();
                }, 30 * 60 * 1000);
            }
        });

        this.ws.on('error', (err) => {
            console.error('[TPOS-WS] Error:', err.message);
        });

        this.ws.on('message', (data) => {
            this.handleMessage(data.toString());
        });
    }

    handleMessage(data) {
        if (data === '2') {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('3');
            }
            this.lastPongTime = Date.now();
            return;
        }

        if (data === '3') {
            this.lastPongTime = Date.now();
            return;
        }

        if (data.startsWith('0{')) {
            try {
                const info = JSON.parse(data.substring(1));
                if (info.pingInterval) this.pingInterval = info.pingInterval;
                if (info.pingTimeout) this.pingTimeout = info.pingTimeout;
                console.log(`[TPOS-WS] Server timing: pingInterval=${this.pingInterval}ms`);
            } catch (e) {}
            return;
        }

        if (data.startsWith('40/chatomni,')) {
            console.log('[TPOS-WS] ✅ Namespace connected');
            this.isConnected = true;
            this.joinRoom();
            this.startHeartbeat();
            return;
        }

        if (data.startsWith('42/chatomni,')) {
            const jsonStr = data.substring('42/chatomni,'.length);
            try {
                const [eventName, payload] = JSON.parse(jsonStr);
                this.handleEvent(eventName, payload);
            } catch (e) {
                console.error('[TPOS-WS] Parse error:', e);
            }
        }
    }

    handleEvent(eventName, payload) {
        console.log('[TPOS-WS] Event:', eventName);

        broadcastToClients({
            type: 'tpos:event',
            event: eventName,
            payload: payload
        });

        if (eventName === 'on-events') {
            try {
                const eventData = typeof payload === 'string' ? JSON.parse(payload) : payload;
                console.log('[TPOS-WS] TPOS Event:', eventData.EventName || eventData.Type);
                broadcastToClients({
                    type: 'tpos:parsed-event',
                    data: eventData
                });
            } catch (e) {}
        }
    }

    joinRoom() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(`42/chatomni,["join",{"room":"${this.room}","token":"${this.token}"}]`);
        console.log('[TPOS-WS] Joining room:', this.room);
    }

    startHeartbeat() {
        this.stopHeartbeat();
        const heartbeatMs = Math.floor(this.pingInterval * 0.8);
        console.log(`[TPOS-WS] Starting heartbeat every ${heartbeatMs}ms`);

        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const timeSinceLastPong = Date.now() - (this.lastPongTime || 0);
                if (this.lastPongTime && timeSinceLastPong > this.pingTimeout) {
                    console.error(`[TPOS-WS] No pong for ${timeSinceLastPong}ms, reconnecting...`);
                    this.ws.close();
                    return;
                }
                this.ws.send('2');
                this.lastPingTime = Date.now();
            }
        }, heartbeatMs);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    async stop(disableAutoConnect = true) {
        this.stopHeartbeat();
        clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.reconnectAttempts = 0;

        if (disableAutoConnect) {
            await disableRealtimeCredentials('tpos');
        }

        console.log('[TPOS-WS] Stopped');
    }

    getStatus() {
        return {
            connected: this.isConnected,
            room: this.room,
            hasToken: !!this.token,
            reconnectAttempts: this.reconnectAttempts,
            pingInterval: this.pingInterval,
            lastPongTime: this.lastPongTime
        };
    }
}

// =====================================================
// GLOBAL INSTANCES
// =====================================================

const realtimeClient = new RealtimeClient();
const tposRealtimeClient = new TposRealtimeClient();

// =====================================================
// AUTO-CONNECT ON SERVER START
// =====================================================

async function autoConnectClients() {
    console.log('[AUTO-CONNECT] Checking for saved credentials...');

    // Auto-connect Pancake
    const pancakeCredentials = await loadRealtimeCredentials('pancake');
    if (pancakeCredentials && pancakeCredentials.token) {
        console.log('[AUTO-CONNECT] Found Pancake credentials, starting...');
        const pageIds = pancakeCredentials.page_ids ? JSON.parse(pancakeCredentials.page_ids) : [];
        await realtimeClient.start(
            pancakeCredentials.token,
            pancakeCredentials.user_id,
            pageIds,
            pancakeCredentials.cookie,
            false // Don't save again
        );
    } else {
        console.log('[AUTO-CONNECT] No Pancake credentials found');
    }

    // Auto-connect TPOS
    const tposCredentials = await loadRealtimeCredentials('tpos');
    if (tposCredentials && tposCredentials.token) {
        console.log('[AUTO-CONNECT] Found TPOS credentials, starting...');
        await tposRealtimeClient.start(
            tposCredentials.token,
            tposCredentials.room || 'tomato.tpos.vn',
            false // Don't save again
        );
    } else {
        console.log('[AUTO-CONNECT] No TPOS credentials found');
    }
}

// =====================================================
// ROUTES
// =====================================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'N2Store Realtime Server is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbPool ? 'connected' : 'not configured',
        clients: {
            pancake: realtimeClient.getStatus(),
            tpos: tposRealtimeClient.getStatus()
        }
    });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        name: 'N2Store Realtime Server',
        version: '2.0.0',
        description: 'WebSocket proxy for Pancake.vn and TPOS ChatOmni with database persistence',
        database: dbPool ? 'connected' : 'not configured',
        endpoints: {
            pancake: [
                'POST /api/realtime/start - Start Pancake WebSocket',
                'POST /api/realtime/stop - Stop Pancake WebSocket',
                'GET /api/realtime/status - Get Pancake status'
            ],
            tpos: [
                'POST /api/realtime/tpos/start - Start TPOS WebSocket',
                'POST /api/realtime/tpos/stop - Stop TPOS WebSocket',
                'GET /api/realtime/tpos/status - Get TPOS status'
            ],
            pendingCustomers: [
                'GET /api/realtime/pending-customers - Get pending customers',
                'POST /api/realtime/mark-replied - Mark customer as replied'
            ],
            health: [
                'GET /health - Server health check'
            ]
        }
    });
});

// ===== PANCAKE REALTIME =====

app.post('/api/realtime/start', async (req, res) => {
    const { token, userId, pageIds, cookie } = req.body;
    if (!token || !userId || !pageIds) {
        return res.status(400).json({ error: 'Missing parameters: token, userId, pageIds required' });
    }

    await realtimeClient.start(token, userId, pageIds, cookie);
    res.json({
        success: true,
        message: 'Pancake Realtime client started (credentials saved for auto-reconnect)'
    });
});

app.post('/api/realtime/stop', async (req, res) => {
    await realtimeClient.stop();
    res.json({ success: true, message: 'Pancake Realtime client stopped' });
});

app.get('/api/realtime/status', (req, res) => {
    res.json(realtimeClient.getStatus());
});

// ===== TPOS REALTIME =====

app.post('/api/realtime/tpos/start', async (req, res) => {
    const { token, room } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Missing token' });
    }

    await tposRealtimeClient.start(token, room || 'tomato.tpos.vn');
    res.json({
        success: true,
        message: 'TPOS Realtime client started (credentials saved for auto-reconnect)'
    });
});

app.post('/api/realtime/tpos/stop', async (req, res) => {
    await tposRealtimeClient.stop();
    res.json({ success: true, message: 'TPOS Realtime client stopped' });
});

app.get('/api/realtime/tpos/status', (req, res) => {
    res.json(tposRealtimeClient.getStatus());
});

// ===== PENDING CUSTOMERS API =====

app.get('/api/realtime/pending-customers', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({
            error: 'Database not available',
            message: 'DATABASE_URL not configured'
        });
    }

    try {
        const limit = Math.min(parseInt(req.query.limit) || 500, 1500);

        const result = await dbPool.query(`
            SELECT
                psid,
                page_id,
                customer_name,
                last_message_snippet,
                last_message_time,
                message_count,
                type
            FROM pending_customers
            ORDER BY last_message_time DESC
            LIMIT $1
        `, [limit]);

        res.json({
            success: true,
            count: result.rows.length,
            customers: result.rows
        });
    } catch (error) {
        console.error('[API] Error fetching pending customers:', error);
        res.status(500).json({ error: 'Failed to fetch pending customers' });
    }
});

app.post('/api/realtime/mark-replied', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({
            error: 'Database not available',
            message: 'DATABASE_URL not configured'
        });
    }

    try {
        const { psid, pageId } = req.body;

        if (!psid) {
            return res.status(400).json({ error: 'Missing psid parameter' });
        }

        let query, params;
        if (pageId) {
            query = 'DELETE FROM pending_customers WHERE psid = $1 AND page_id = $2 RETURNING *';
            params = [psid, pageId];
        } else {
            query = 'DELETE FROM pending_customers WHERE psid = $1 RETURNING *';
            params = [psid];
        }

        const result = await dbPool.query(query, params);

        console.log(`[API] ✅ Marked replied: ${psid} (${result.rowCount} removed)`);

        res.json({
            success: true,
            removed: result.rowCount
        });
    } catch (error) {
        console.error('[API] Error marking replied:', error);
        res.status(500).json({ error: 'Failed to mark as replied' });
    }
});

// Clear all pending customers (for debugging)
app.post('/api/realtime/clear-pending', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({ error: 'Database not available' });
    }

    const { confirm } = req.body;
    if (confirm !== 'yes') {
        return res.status(400).json({ error: 'Must confirm with { "confirm": "yes" }' });
    }

    try {
        const result = await dbPool.query('DELETE FROM pending_customers RETURNING *');
        console.log(`[API] ⚠️ Cleared ${result.rowCount} pending customers`);
        res.json({ success: true, cleared: result.rowCount });
    } catch (error) {
        console.error('[API] Error clearing pending:', error);
        res.status(500).json({ error: 'Failed to clear pending customers' });
    }
});

// =====================================================
// WEBSOCKET SERVER FOR FRONTEND CLIENTS
// =====================================================

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Broadcast to all connected frontend clients
const broadcastToClients = (data) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

// Keep-alive ping for frontend clients
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('connection', (ws) => {
    console.log('[WSS] Frontend client connected. Total:', wss.clients.size);
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('close', () => {
        console.log('[WSS] Frontend client disconnected. Total:', wss.clients.size);
    });
});

wss.on('close', () => {
    clearInterval(interval);
});

// =====================================================
// 404 & ERROR HANDLERS
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

async function startServer() {
    // Initialize database first
    await initDatabase();

    // Start HTTP server
    server.listen(PORT, () => {
        console.log('='.repeat(60));
        console.log('🚀 N2Store Realtime Server v2.0');
        console.log('='.repeat(60));
        console.log(`📍 Port: ${PORT}`);
        console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`💾 Database: ${dbPool ? 'Connected' : 'Not configured'}`);
        console.log(`⏰ Started: ${new Date().toISOString()}`);
        console.log('='.repeat(60));

        // Auto-connect after 3 seconds (give DB time to init)
        setTimeout(() => {
            autoConnectClients();
        }, 3000);
    });
}

startServer();
