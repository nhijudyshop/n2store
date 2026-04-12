// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// N2STORE API FALLBACK SERVER
// Deployed on Render.com as fallback when Cloudflare fails
// =====================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool, types } = require('pg');

// Fix timezone: transaction_date is stored as TIMESTAMP WITHOUT TIMEZONE
// but contains Vietnam time (UTC+7). Render.com server runs in UTC,
// so pg driver would misinterpret it as UTC. This parser appends +07:00
// so browser correctly displays Vietnam time.
// OID 1114 = TIMESTAMP WITHOUT TIMEZONE
types.setTypeParser(1114, (val) => {
    if (!val) return val;
    return val + '+07:00';
});

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// MIDDLEWARE
// =====================================================

// CORS - Allow requests from GitHub Pages
// CORS - Allow specific origins
app.use(cors({
    origin: [
        'https://nhijudyshop.github.io', // Primary frontend
        'http://localhost:5500',         // Local development for frontend
        'http://localhost:3000'          // Local development for this server itself
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Data', 'X-User-Id'],
    credentials: false // credentials cannot be true when origin is *
}));

// Body parsing - increased limit for large customer imports (80k+ records)
app.use(express.json({ limit: '100mb' }));

// Serve static files from public folder (merged from /api)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// =====================================================
// DATABASE CONNECTION
// =====================================================

// Initialize PostgreSQL connection pool for SePay and Customers routes
const chatDbPool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,                      // Maximum 20 connections
    idleTimeoutMillis: 30000,     // Close idle connections after 30s
    connectionTimeoutMillis: 10000 // Timeout waiting for connection
});

// Make pool available to routes via app.locals
app.locals.chatDb = chatDbPool;

// Test database connection on startup
chatDbPool.query('SELECT NOW()')
    .then(() => console.log('[DATABASE] PostgreSQL connected successfully'))
    .catch(err => console.error('[DATABASE] PostgreSQL connection error:', err.message));

// =====================================================
// REALTIME CREDENTIALS MANAGEMENT
// =====================================================

/**
 * Save realtime credentials to database for auto-reconnect on server restart
 */
async function saveRealtimeCredentials(db, clientType, credentials) {
    try {
        const query = `
            INSERT INTO realtime_credentials (client_type, token, user_id, page_ids, cookie, room, is_active, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
            ON CONFLICT (client_type) DO UPDATE SET
                token = EXCLUDED.token,
                user_id = EXCLUDED.user_id,
                page_ids = EXCLUDED.page_ids,
                cookie = EXCLUDED.cookie,
                room = EXCLUDED.room,
                is_active = TRUE,
                updated_at = NOW()
        `;
        await db.query(query, [
            clientType,
            credentials.token,
            credentials.userId || null,
            credentials.pageIds ? JSON.stringify(credentials.pageIds) : null,
            credentials.cookie || null,
            credentials.room || null
        ]);
        console.log(`[CREDENTIALS] Saved ${clientType} credentials for auto-reconnect`);
        return true;
    } catch (error) {
        // Table might not exist yet, ignore error
        console.log(`[CREDENTIALS] Could not save ${clientType} credentials:`, error.message);
        return false;
    }
}

/**
 * Load and auto-connect realtime clients on server startup
 */
async function autoConnectRealtimeClients(db) {
    try {
        console.log('[AUTO-CONNECT] Checking for saved credentials...');

        const result = await db.query(`
            SELECT client_type, token, user_id, page_ids, cookie, room
            FROM realtime_credentials
            WHERE is_active = TRUE
        `);

        if (result.rows.length === 0) {
            console.log('[AUTO-CONNECT] No saved credentials found. Waiting for manual start.');
            return;
        }

        for (const row of result.rows) {
            if (row.client_type === 'pancake' && row.token && row.user_id && row.page_ids) {
                const pageIds = JSON.parse(row.page_ids);
                console.log(`[AUTO-CONNECT] Starting Pancake client with ${pageIds.length} pages...`);
                realtimeClient.start(row.token, row.user_id, pageIds, row.cookie);
            } else if (row.client_type === 'tpos' && row.token) {
                console.log(`[AUTO-CONNECT] Starting TPOS client for room: ${row.room || 'tomato.tpos.vn'}...`);
                tposRealtimeClient.start(row.token, row.room || 'tomato.tpos.vn');
            }
        }
    } catch (error) {
        // Table might not exist yet
        console.log('[AUTO-CONNECT] Could not load credentials (table may not exist yet):', error.message);
    }
}

// =====================================================
// ROUTES
// =====================================================

// Health check
app.get('/health', async (req, res) => {
    try {
        await chatDbPool.query('SELECT 1'); // Test DB connection
        res.json({
            status: 'ok',
            message: 'N2Store API Fallback Server is running',
            database: 'connected',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    } catch (dbError) {
        console.error('[HEALTH] Database check failed:', dbError.message);
        res.status(503).json({
            status: 'degraded',
            message: 'N2Store API Fallback Server is running but database is disconnected',
            database: 'disconnected',
            error: dbError.message,
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    }
});

// Server time diagnostic endpoint for debugging Facebook 24-hour policy
app.get('/api/debug/time', (req, res) => {
    const now = new Date();
    res.json({
        utc: now.toISOString(),
        unix_timestamp: now.getTime(),
        unix_seconds: Math.floor(now.getTime() / 1000),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezone_offset_minutes: now.getTimezoneOffset(),
        server_time_string: now.toString(),
        vietnam_time: new Date(now.getTime() + (7 * 60 * 60 * 1000)).toISOString(), // UTC+7
        note: 'Compare this with your local time to check for clock drift'
    });
});

// Import route modules
const tokenRoutes = require('./routes/token');
const odataRoutes = require('./routes/odata');
const pancakeRoutes = require('./routes/pancake');
const imageProxyRoutes = require('./routes/image-proxy');
const sepayWebhookRoutes = require('./routes/sepay-webhook');
const customersRoutes = require('./routes/customers');
const returnOrdersRoutes = require('./routes/return-orders');
const cloudflareBackupRoutes = require('./routes/cloudflare-backup');
const realtimeRoutes = require('./routes/realtime');
const { saveRealtimeUpdate, upsertPendingCustomer } = require('./routes/realtime');
const geminiRoutes = require('./routes/gemini');
const deepseekRoutes = require('./routes/deepseek');
const telegramBotRoutes = require('./routes/telegram-bot');
const uploadImageRoutes = require('./routes/upload');
const quyTrinhRoutes = require('./routes/quy-trinh');
const goongPlacesRoutes = require('./routes/goong-places');
const autofbRoutes = require('./routes/autofb');

// === FIREBASE REPLACEMENT ROUTES (SSE + PostgreSQL) ===
const realtimeSseRoutes = require('./routes/realtime-sse');
const realtimeDbRoutes = require('./routes/realtime-db');
const adminMigrationRoutes = require('./routes/admin-migration');
const adminDataRoutes = require('./routes/admin-data');
const adminFirebaseRoutes = require('./routes/admin-firebase');
const adminRenderRoutes = require('./routes/admin-render');
const invoiceStatusRoutes = require('./routes/invoice-status');
const socialOrdersRoutes = require('./routes/social-orders');
const attendanceRoutes = require('./routes/attendance');
const admsRoutes = require('./routes/adms');
const usersRoutes = require('./routes/users');
const quickRepliesRoutes = require('./routes/quick-replies');
const campaignsRoutes = require('./routes/campaigns');
const fbAdsRoutes = require('./routes/fb-ads');

// === ROUTES MERGED FROM /api ===
const uploadRoutes = require('./routes/upload.routes');
const productsRoutes = require('./routes/products.routes');
const attributeRoutes = require('./routes/attribute.routes');
const facebookRoutes = require('./routes/facebook.routes');
const dynamicHeadersRoutes = require('./routes/dynamic-headers.routes');
const customer360Routes = require('./routes/customer-360');
const v2Router = require('./routes/v2');  // Unified API v2
const tposSavedRoutes = require('./routes/tpos-saved');
const tposCredentialsRoutes = require('./routes/tpos-credentials');
const { saveOrderToBuffer } = require('./routes/tpos-order-buffer');
const tposTokenManager = require('./services/tpos-token-manager');
const { createAuthTokenStore } = require('./services/auth-token-store');
const authTokenStore = createAuthTokenStore(chatDbPool);

// ===== Auth Token Cache API (protected by CLIENT_API_KEY) =====
function requireApiKey(req, res, next) {
    const key = req.headers['x-api-key'];
    const expected = process.env.CLIENT_API_KEY;
    if (!expected || key !== expected) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    next();
}

app.get('/api/auth/token/:provider', requireApiKey, async (req, res) => {
    try {
        const t = await authTokenStore.getToken(req.params.provider);
        res.json({ token: t.token, expires_at: t.expires_at, metadata: t.metadata });
    } catch (e) {
        if (e.message && e.message.startsWith('pancake:not_found')) {
            return res.status(404).json({ error: 'no_pancake_token', message: 'Browser must push token via /api/realtime/start first' });
        }
        console.error('[AUTH-API] getToken error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auth/token/:provider/invalidate', requireApiKey, async (req, res) => {
    try {
        await authTokenStore.invalidate(req.params.provider);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Mount routes
app.use('/api/token', tokenRoutes);
app.use('/api/odata', odataRoutes);
app.use('/api/pancake', pancakeRoutes);
app.use('/api/image-proxy', imageProxyRoutes);
app.use('/api/sepay', sepayWebhookRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/tpos-saved', tposSavedRoutes);
app.use('/api/tpos-credentials', tposCredentialsRoutes);
app.use('/api', customer360Routes);  // Customer 360° routes: /api/customer, /api/wallet, /api/ticket
app.use('/api/v2', v2Router);  // Unified API v2: /api/v2/customers, /api/v2/wallets, /api/v2/tickets, /api/v2/analytics
app.use('/api/return-orders', returnOrdersRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/gemini', geminiRoutes);
app.use('/api/deepseek', deepseekRoutes);
app.use('/api/telegram', telegramBotRoutes);
app.use('/api/upload', uploadImageRoutes);
app.use('/api/quy-trinh', quyTrinhRoutes);
app.use('/api/goong-places', goongPlacesRoutes);
app.use('/api/autofb', autofbRoutes);

// === FIREBASE REPLACEMENT ROUTES ===
// SSE for realtime updates (replaces Firebase listeners)
app.use('/api/realtime', realtimeSseRoutes);
// REST API for CRUD operations (replaces Firebase database operations)
app.use('/api/realtime', realtimeDbRoutes);
// Admin migration endpoint
app.use('/api/admin', adminMigrationRoutes);
app.use('/api/admin/data', adminDataRoutes);
app.use('/api/admin/firebase', adminFirebaseRoutes);
app.use('/api/admin/render', adminRenderRoutes);
app.use('/api/invoice-status', invoiceStatusRoutes);
app.use('/api/social-orders', socialOrdersRoutes);
app.use('/api/attendance', attendanceRoutes);
// ADMS: ZKTeco machine pushes attendance data directly (no PC needed)
app.use('/iclock', (req, res, next) => { req.pool = chatDbPool; next(); }, admsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/quick-replies', quickRepliesRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/fb-ads', fbAdsRoutes);
app.use('/api/hang-qq', require('./routes/hang-qq'));
app.use('/api/tpos/order-buffer', require('./routes/tpos-order-buffer'));

// Facebook Global ID Cache — share resolved (psid → globalUserId) across all clients
const fbGlobalIdCacheRoutes = require('./routes/fb-global-id-cache');
fbGlobalIdCacheRoutes.init(chatDbPool);
app.use('/api/fb-global-id', fbGlobalIdCacheRoutes);

// Pancake Accounts — store JWT accounts in PostgreSQL
const pancakeAccountsRoutes = require('./routes/pancake-accounts');
pancakeAccountsRoutes.init(chatDbPool);
app.use('/api/pancake-accounts', pancakeAccountsRoutes);

// Pancake Account Pages Cache — share account → pages list across all clients
const pancakeAccountPagesRoutes = require('./routes/pancake-account-pages');
pancakeAccountPagesRoutes.init(chatDbPool);
app.use('/api/pancake-account-pages', pancakeAccountPagesRoutes);

// Initialize SSE notifiers in realtime-db routes
const { initializeNotifiers } = require('./routes/realtime-db');
initializeNotifiers(
    realtimeSseRoutes.notifyClients,
    realtimeSseRoutes.notifyClientsWildcard
);

// Initialize SSE notifiers in kho-di-cho routes
const khoDiChoRouter = require('./routes/v2/kho-di-cho');
if (khoDiChoRouter.initializeNotifiers) {
    khoDiChoRouter.initializeNotifiers(
        realtimeSseRoutes.notifyClients,
        realtimeSseRoutes.notifyClientsWildcard
    );
}

// Initialize TPOS Product Sync Service + Cron
const TPOSProductSync = require('./services/sync-tpos-products');
const tposProductSync = new TPOSProductSync(
    chatDbPool,
    tposTokenManager,
    realtimeSseRoutes.notifyClients
);
if (khoDiChoRouter.initializeSyncService) {
    khoDiChoRouter.initializeSyncService(tposProductSync);
}
// Socket listener initialized after creation below
// Start incremental sync cron (every 30 minutes) + TPOS Socket.IO listener
const TPOSSocketListener = require('./services/tpos-socket-listener');
const tposSocketListener = new TPOSSocketListener(
    tposTokenManager,
    tposProductSync,
    realtimeSseRoutes.notifyClients
);

if (khoDiChoRouter.initializeSocketListener) {
    khoDiChoRouter.initializeSocketListener(tposSocketListener);
}

setTimeout(async () => {
    // Start cron as fallback (in case socket disconnects)
    tposProductSync.startCron(30 * 60 * 1000);
    console.log('[STARTUP] TPOS product sync cron started (30 min interval)');

    // Connect to TPOS Socket.IO for real-time product updates
    try {
        await tposSocketListener.connect();
        console.log('[STARTUP] TPOS Socket.IO listener started');
    } catch (err) {
        console.error('[STARTUP] TPOS Socket.IO connection failed (will retry):', err.message);
    }
}, 10000); // delay 10s after server start

// Cloudflare Worker Backup Routes (fb-avatar, pancake-avatar, proxy, pancake-direct, pancake-official, facebook-send, rest)
app.use('/api', cloudflareBackupRoutes);

// === ROUTES MERGED FROM /api ===
app.use(uploadRoutes);       // /upload, /upload-batch
app.use(productsRoutes);     // /products
app.use(attributeRoutes);    // /attributes
app.use(facebookRoutes);     // /facebook/*
app.use(dynamicHeadersRoutes); // /dynamic-headers/*
// =====================================================
// WEBSOCKET SERVER & CLIENT (REALTIME)
// =====================================================

class RealtimeClient {
    constructor(db = null) {
        this.ws = null;
        this.url = "wss://pancake.vn/socket/websocket?vsn=2.0.0";
        this.isConnected = false;
        this.refCounter = 1;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10; // New: Max reconnect attempts
        this.db = db; // PostgreSQL connection pool

        // User specific data
        this.token = null;
        this.userId = null;
        this.pageIds = [];
    }

    setDb(db) {
        this.db = db;
    }

    makeRef() {
        return String(this.refCounter++);
    }

    generateClientSession() {
        // Generate 64-char random string to match browser behavior
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
        // Ensure pageIds are strings
        this.pageIds = pageIds.map(id => String(id));
        this.cookie = cookie;
        this.connect();
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log('[SERVER-WS] Connecting to Pancake... (attempt', this.reconnectAttempts + 1, ')');
        const headers = {
            'Origin': 'https://pancake.vn',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        // Add cookie if available (critical for Cloudflare/Auth)
        if (this.cookie) {
            headers['Cookie'] = this.cookie;
        }

        this.ws = new WebSocket(this.url, {
            headers: headers
        });

        this.ws.on('open', () => {
            console.log('[SERVER-WS] Connected');
            this.isConnected = true;
            this.reconnectAttempts = 0; // Reset on successful connect
            this.startHeartbeat();
            this.joinChannels();
        });

        this.ws.on('close', (code, reason) => {
            console.log('[SERVER-WS] Closed', code, reason);
            this.isConnected = false;
            this.stopHeartbeat();

            // Exponential backoff reconnect
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000); // 2s, 4s, 8s, ... max 60s
                this.reconnectAttempts++;
                console.log(`[SERVER-WS] Reconnecting in ${delay/1000}s... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else {
                console.error('[SERVER-WS] ❌ Max reconnect attempts reached. Stopping reconnection.');
            }
        });

        this.ws.on('error', (err) => {
            console.error('[SERVER-WS] Error:', err.message);
        });

        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                this.handleMessage(msg);
            } catch (e) {
                console.error('[SERVER-WS] Parse error:', e);
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

        // 3. Get Online Status (Mimic browser)
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

        // Debug: log all events (not just update_conversation)
        if (event !== 'phx_reply' && event !== 'heartbeat') {
            console.log(`[SERVER-WS][DEBUG] Event: ${event} | topic: ${topic} | payload keys: ${Object.keys(payload || {}).join(',')}`);
        }

        if (event === 'phx_reply') {
            if (payload.status !== 'ok') {
                console.error(`[SERVER-WS][DEBUG] Channel reply ERROR: topic=${topic}, status=${payload.status}, response=`, JSON.stringify(payload.response || {}).substring(0, 200));
            }
        }

        if (event === 'pages:update_conversation') {
            const conversation = payload.conversation;
            const clientCount = wss?.clients?.size || 0;
            console.log(`[SERVER-WS] New Message/Comment: conv=${conversation.id}, page=${conversation.page_id}, type=${conversation.type}, from="${conversation.from?.name}", snippet="${(conversation.snippet || '').substring(0, 50)}", broadcasting to ${clientCount} clients`);

            // Broadcast to connected frontend clients
            broadcastToClients({
                type: 'pages:update_conversation',
                payload: payload
            });

            // Save to PostgreSQL for later retrieval
            if (this.db && conversation) {
                const updateData = {
                    conversationId: conversation.id,
                    type: conversation.type || 'INBOX',
                    snippet: conversation.snippet || conversation.last_message?.message,
                    unreadCount: conversation.unread_count || 0,
                    pageId: conversation.page_id || (conversation.id ? conversation.id.split('_')[0] : null),
                    psid: conversation.from_psid || conversation.customers?.[0]?.fb_id,
                    customerName: conversation.from?.name || conversation.customers?.[0]?.name
                };

                saveRealtimeUpdate(this.db, updateData)
                    .then(() => console.log('[SERVER-WS] Update saved to DB'))
                    .catch(err => console.error('[SERVER-WS] Failed to save update:', err.message));

                // Also upsert to pending_customers for tracking unread
                upsertPendingCustomer(this.db, updateData)
                    .catch(err => console.error('[SERVER-WS] Failed to upsert pending:', err.message));
            }
        }

        // [INBOX-SPECIFIC] Forward new_message events for real-time chat update
        if (event === 'pages:new_message') {
            const msg = payload?.message || payload;
            const clientCount = wss?.clients?.size || 0;
            console.log(`[SERVER-WS] pages:new_message → conv=${msg?.conversation_id}, msg="${(msg?.message || '').substring(0, 50)}", broadcasting to ${clientCount} clients`);
            broadcastToClients({
                type: 'pages:new_message',
                payload: payload
            });

            // Also save to pending_customers (only if message is FROM customer, not from page)
            if (this.db && msg) {
                const fromPsid = msg.from?.id;
                const pageId = msg.page_id || payload.page_id;
                if (fromPsid && pageId && String(fromPsid) !== String(pageId)) {
                    const updateData = {
                        conversationId: msg.conversation_id,
                        type: 'INBOX',
                        snippet: msg.message || msg.original_message || '',
                        pageId: pageId,
                        psid: fromPsid,
                        customerName: msg.from?.name
                    };
                    upsertPendingCustomer(this.db, updateData)
                        .catch(err => console.error('[SERVER-WS] Failed to upsert from new_message:', err.message));
                }
            }
        }
    }
}

// =====================================================
// TPOS REALTIME CLIENT (Socket.IO Protocol)
// =====================================================

class TposRealtimeClient {
    constructor() {
        this.ws = null;
        // Use rt-2.tpos.app with room parameter (from browser DevTools analysis)
        this.baseUrl = "wss://rt-2.tpos.app/socket.io/";
        this.isConnected = false;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;

        // Server-provided timing (will be updated from transport info)
        this.pingInterval = 25000;  // Default 25s
        this.pingTimeout = 20000;   // Default 20s

        // Last activity tracking
        this.lastPingTime = null;

        // TPOS specific data
        this.token = null;
        this.room = 'tomato.tpos.vn';
    }

    getWebSocketUrl() {
        // Build URL with room parameter like browser does
        return `${this.baseUrl}?room=${encodeURIComponent(this.room)}&EIO=4&transport=websocket`;
    }

    start(token, room = 'tomato.tpos.vn') {
        this.token = token;
        this.room = room;
        this.reconnectAttempts = 0;
        this.connect();
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log('[TPOS-WS] Connecting to TPOS... (attempt', this.reconnectAttempts + 1, ')');

        // Build URL with room parameter
        const wsUrl = this.getWebSocketUrl();
        console.log('[TPOS-WS] Connection URL:', wsUrl.replace(/token=[^&]+/, 'token=***'));

        const headers = {
            'Origin': 'https://tomato.tpos.vn',
            'Authorization': `Bearer ${this.token}`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        this.ws = new WebSocket(wsUrl, {
            headers: headers
        });

        this.ws.on('open', () => {
            console.log('[TPOS-WS] ✅ WebSocket connected, sending handshake...');
            this.reconnectAttempts = 0; // Reset on successful connect

            // Socket.IO namespace connect with auth (TPOS requires token+room in namespace connect)
            const authPayload = JSON.stringify({ token: this.token, room: this.room });
            const namespaceMsg = `40/chatomni,${authPayload}`;
            this.ws.send(namespaceMsg);
            console.log('[TPOS-WS] 📤 Sent namespace connect with auth (room:', this.room, ')');
        });

        this.ws.on('close', (code, reason) => {
            const reasonText = reason?.toString() || 'No reason provided';
            console.log(`[TPOS-WS] Closed - Code: ${code}, Reason: ${reasonText}`);

            // Log close code meanings for debugging
            const closeReasons = {
                1000: 'Normal Closure',
                1001: 'Going Away (server/browser closing)',
                1002: 'Protocol Error',
                1003: 'Unsupported Data',
                1005: 'No Status Received (abnormal closure)',
                1006: 'Abnormal Closure (no close frame)',
                1007: 'Invalid Frame Payload Data',
                1008: 'Policy Violation',
                1009: 'Message Too Big',
                1010: 'Mandatory Extension Missing',
                1011: 'Internal Server Error',
                1015: 'TLS Handshake Failed'
            };
            console.log(`[TPOS-WS] Close reason: ${closeReasons[code] || 'Unknown'}`);

            this.isConnected = false;
            this.stopHeartbeat();

            // Exponential backoff reconnect: 2s, 4s, 8s, 16s, 32s (max 60s)
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000);
                this.reconnectAttempts++;
                console.log(`[TPOS-WS] Reconnecting in ${delay/1000}s... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else {
                console.error('[TPOS-WS] ❌ Max reconnect attempts reached. Stopping reconnection.');
            }
        });

        this.ws.on('error', (err) => {
            console.error('[TPOS-WS] Error:', err.message);
        });

        this.ws.on('message', (data) => {
            const message = data.toString();
            // Log all raw messages for debugging (can comment out after troubleshooting)
            if (!message.startsWith('2') && !message.startsWith('3')) {
                console.log('[TPOS-WS] 📥 Raw message:', message.substring(0, 200)); // Truncate long messages
            }
            // Log raw messages to event logger (skip ping/pong)
            if (tposEventLog.isLogging && !message.startsWith('2') && !message.startsWith('3')) {
                tposEventLog.log({ type: 'raw-ws', message: message.substring(0, 2000) });
            }
            this.handleMessage(message);
        });
    }

    handleMessage(data) {
        // Socket.IO protocol messages
        if (data === '2') {
            // Ping from TPOS server, respond with pong immediately
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('3');
            }
            this.lastPingTime = Date.now();
            return;
        }

        if (data === '3') {
            // Pong response (not expected since we don't send pings, but handle gracefully)
            this.lastPingTime = Date.now();
            return;
        }

        if (data.startsWith('0{')) {
            // Transport info (sid, upgrades, pingInterval, pingTimeout, etc.)
            try {
                const info = JSON.parse(data.substring(1));
                console.log('[TPOS-WS] Received transport info:', JSON.stringify(info));

                // Update timing from server
                if (info.pingInterval) {
                    this.pingInterval = info.pingInterval;
                }
                if (info.pingTimeout) {
                    this.pingTimeout = info.pingTimeout;
                }
                console.log(`[TPOS-WS] Server timing: pingInterval=${this.pingInterval}ms, pingTimeout=${this.pingTimeout}ms`);
            } catch (e) {
                console.log('[TPOS-WS] Received transport info (parse failed)');
            }
            return;
        }

        if (data.startsWith('40/chatomni,')) {
            // Namespace connected, now join room
            console.log('[TPOS-WS] ✅ Namespace connected successfully');
            console.log('[TPOS-WS] Joining room:', this.room);
            this.isConnected = true;
            this.joinRoom();
            this.startHeartbeat();
            return;
        }

        if (data.startsWith('42/chatomni,')) {
            // Event message
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
        console.log('[TPOS-WS] 📨 Event received:', eventName);

        // Handle join response
        if (eventName === 'join') {
            console.log('[TPOS-WS] ✅ Join room response:', JSON.stringify(payload));
        }

        // Handle authentication errors
        if (eventName === 'error' || eventName === 'unauthorized') {
            console.error('[TPOS-WS] ❌ Authentication/Error event:', JSON.stringify(payload));
        }

        // Handle 'on-events' - main TPOS realtime events
        // Only SaleOnline_Order is forwarded to clients. chatomni.on-message,
        // FastSaleOrder, Product, ProductInventory etc. are intentionally
        // ignored to keep WS bandwidth lean.
        if (eventName === 'on-events') {
            try {
                const eventData = typeof payload === 'string' ? JSON.parse(payload) : payload;
                const data = eventData.d || eventData.data || eventData;
                const eventType = data.t || data.Type || data.EventName || eventData.EventName || eventData.type || eventData.Type;

                const eventAction = data.EventName || eventData.EventName || data.action || eventData.action;
                const msgPreview = (data.Message || data.message || '').substring(0, 80);

                // Handle SaleOnline_Order — order created/updated
                if (eventType === 'SaleOnline_Order') {
                    console.log('[TPOS-WS] 🔥 ORDER', (eventAction || '').toUpperCase() + ':', msgPreview);
                    broadcastToClients({
                        type: eventAction === 'updated' ? 'tpos:order-update' : 'tpos:new-order',
                        data: data
                    });
                    // Save to buffer for catch-up polling (fire-and-forget)
                    saveOrderToBuffer(chatDbPool, data).catch(() => {});
                    return;
                }

                // Handle FastSaleOrder — invoice created/updated → cập nhật cột Phiếu bán hàng
                if (eventType === 'FastSaleOrder' && (eventAction === 'created' || eventAction === 'updated')) {
                    console.log('[TPOS-WS] 📄 INVOICE', (eventAction || '').toUpperCase() + ':', msgPreview);
                    broadcastToClients({
                        type: 'tpos:invoice-update',
                        action: eventAction,
                        data: data
                    });
                    return;
                }

                // Everything else (Product, ProductInventory, etc.) is dropped
            } catch (e) {
                console.error('[TPOS-WS] Error parsing on-events payload:', e.message);
            }
        }
    }

    joinRoom() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log('[TPOS-WS] ⚠️ Cannot join room - WebSocket not ready');
            return;
        }

        const joinMessage = `42/chatomni,["join",{"room":"${this.room}","token":"${this.token ? '***' : 'MISSING'}"}]`;
        this.ws.send(`42/chatomni,["join",{"room":"${this.room}","token":"${this.token}"}]`);
        console.log('[TPOS-WS] 📤 Sent join request:', joinMessage);
    }

    startHeartbeat() {
        this.stopHeartbeat();

        // Engine.IO protocol: SERVER sends ping ('2'), CLIENT responds pong ('3').
        // We must NOT send '2' to the server — that causes TPOS to close the connection.
        // Instead, monitor that we receive pings from TPOS at the expected interval.
        // If no ping received within (pingInterval + pingTimeout), connection is dead.
        const checkMs = this.pingInterval + this.pingTimeout;

        console.log(`[TPOS-WS] ❤️ Starting heartbeat monitor (expect ping every ${this.pingInterval}ms, timeout ${checkMs}ms)`);

        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const timeSinceLastPing = Date.now() - (this.lastPingTime || Date.now());
                if (this.lastPingTime && timeSinceLastPing > checkMs) {
                    console.error(`[TPOS-WS] ⚠️ No ping from TPOS for ${timeSinceLastPing}ms (timeout: ${checkMs}ms)`);
                    console.log('[TPOS-WS] Connection appears dead, forcing reconnect...');
                    this.ws.close();
                    return;
                }
            }
        }, checkMs);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    stop() {
        this.stopHeartbeat();
        clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.reconnectAttempts = 0;
        console.log('[TPOS-WS] Stopped');
    }

    getStatus() {
        return {
            connected: this.isConnected,
            room: this.room,
            hasToken: !!this.token,
            reconnectAttempts: this.reconnectAttempts,
            pingInterval: this.pingInterval,
            pingTimeout: this.pingTimeout,
            lastPingFromTPOS: this.lastPingTime
        };
    }
}

// Initialize Global TPOS Client
const tposRealtimeClient = new TposRealtimeClient();

// Initialize Global Client with DB connection
const realtimeClient = new RealtimeClient();
realtimeClient.setDb(chatDbPool); // Pass PostgreSQL pool for saving updates

// API to start the Pancake client from the browser
app.post('/api/realtime/start', async (req, res) => {
    const { token, userId, pageIds, cookie } = req.body;
    if (!token || !userId || !pageIds) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    realtimeClient.start(token, userId, pageIds, cookie);

    // Save credentials for auto-reconnect on server restart
    await saveRealtimeCredentials(chatDbPool, 'pancake', { token, userId, pageIds, cookie });

    // Also cache in auth_token_cache so /api/auth/token/pancake can serve all clients
    try {
        let expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // default 7 days
        try {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
            if (payload.exp) expiresAt = new Date(payload.exp * 1000);
        } catch (_) { /* use default */ }

        await chatDbPool.query(`
            INSERT INTO auth_token_cache (provider, token, refresh_token, expires_at, metadata, updated_at)
            VALUES ('pancake', $1, NULL, $2, $3, NOW())
            ON CONFLICT (provider) DO UPDATE SET
                token = EXCLUDED.token,
                expires_at = EXCLUDED.expires_at,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
        `, [token, expiresAt, JSON.stringify({ userId, provider: 'pancake' })]);
        console.log(`[AUTH-STORE] ✅ Pancake token cached in auth_token_cache (expires ${expiresAt.toISOString()})`);
    } catch (e) {
        console.warn('[AUTH-STORE] Failed to cache pancake token:', e.message);
    }

    res.json({ success: true, message: 'Realtime client started on server (credentials saved for auto-reconnect)' });
});

// API to start the TPOS client from the browser
app.post('/api/realtime/tpos/start', async (req, res) => {
    const { token, room } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Missing token' });
    }

    tposRealtimeClient.start(token, room || 'tomato.tpos.vn');

    // Save credentials for auto-reconnect on server restart
    await saveRealtimeCredentials(chatDbPool, 'tpos', { token, room: room || 'tomato.tpos.vn' });

    res.json({ success: true, message: 'TPOS Realtime client started on server (credentials saved for auto-reconnect)' });
});

// API to get saved Pancake credentials from DB (for frontends to load token)
app.get('/api/realtime/credentials/pancake', async (req, res) => {
    try {
        const r = await chatDbPool.query(
            `SELECT token, user_id, page_ids, cookie, is_active, updated_at
             FROM realtime_credentials WHERE client_type = 'pancake' LIMIT 1`
        );
        if (r.rows.length === 0) return res.json({ found: false });
        const row = r.rows[0];
        let pageIds = [];
        try { pageIds = row.page_ids ? JSON.parse(row.page_ids) : []; } catch (_) {}
        res.json({
            found: true,
            token: row.token,
            userId: row.user_id,
            pageIds,
            cookie: row.cookie || null,
            isActive: row.is_active,
            updatedAt: row.updated_at,
        });
    } catch (e) {
        console.error('[CREDENTIALS] GET pancake error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// API to get Pancake client status
app.get('/api/realtime/status', (req, res) => {
    res.json({
        connected: realtimeClient.isConnected,
        hasToken: !!realtimeClient.token,
        userId: realtimeClient.userId,
        pageCount: realtimeClient.pageIds?.length || 0,
        pageIds: realtimeClient.pageIds || [],
        wsState: realtimeClient.ws ? realtimeClient.ws.readyState : null,
        reconnectAttempts: realtimeClient.reconnectAttempts,
        connectedClients: wss?.clients?.size || 0,
        serverUptime: Math.round(process.uptime()),
    });
});

// API to stop Pancake client and disable auto-connect
app.post('/api/realtime/stop', async (req, res) => {
    // Disable auto-connect in database
    try {
        await chatDbPool.query(`UPDATE realtime_credentials SET is_active = FALSE WHERE client_type = 'pancake'`);
    } catch (e) { /* ignore */ }

    // Close WebSocket if connected
    if (realtimeClient.ws) {
        realtimeClient.ws.close();
        realtimeClient.ws = null;
    }
    realtimeClient.isConnected = false;
    realtimeClient.token = null;

    res.json({ success: true, message: 'Pancake Realtime client stopped (auto-connect disabled)' });
});

// API to stop the TPOS client
app.post('/api/realtime/tpos/stop', async (req, res) => {
    // Disable auto-connect in database
    try {
        await chatDbPool.query(`UPDATE realtime_credentials SET is_active = FALSE WHERE client_type = 'tpos'`);
    } catch (e) { /* ignore */ }

    tposRealtimeClient.stop();
    res.json({ success: true, message: 'TPOS Realtime client stopped (auto-connect disabled)' });
});

// API to get TPOS client status
app.get('/api/realtime/tpos/status', (req, res) => {
    res.json({
        ...tposRealtimeClient.getStatus(),
        wsReadyState: tposRealtimeClient.ws ? tposRealtimeClient.ws.readyState : null,
        wsReadyStateLabel: tposRealtimeClient.ws ? ['CONNECTING','OPEN','CLOSING','CLOSED'][tposRealtimeClient.ws.readyState] : 'NO_WS'
    });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        name: 'N2Store API Fallback Server',
        version: '2.0.0',
        description: 'Backup server for Cloudflare Worker - Full API compatibility',
        endpoints: {
            core: [
                'POST /api/token - TPOS Token with caching',
                'GET /api/odata/* - TPOS OData proxy',
                'GET /api/rest/* - TPOS REST API v2.0'
            ],
            pancake: [
                'GET /api/pancake/* - Pancake API proxy',
                'ALL /api/pancake-direct/* - Pancake 24h bypass',
                'ALL /api/pancake-official/* - pages.fm Public API'
            ],
            facebook: [
                'POST /api/facebook-send - Send message with tag',
                'GET /api/fb-avatar - Facebook/Pancake avatar',
                'GET /api/pancake-avatar - Pancake content avatar'
            ],
            media: [
                'GET /api/image-proxy - Image proxy bypass CORS'
            ],
            utility: [
                'GET /api/proxy - Generic proxy',
                'GET /api/customers/* - Customers API (PostgreSQL)',
                'POST /api/sepay/* - SePay webhook & balance'
            ],
            realtime: [
                'POST /api/realtime/start - Start Pancake WebSocket (saves credentials for auto-reconnect)',
                'POST /api/realtime/stop - Stop Pancake WebSocket (disables auto-reconnect)',
                'GET /api/realtime/status - Get Pancake client status',
                'GET /api/realtime/new-messages?since={timestamp} - Get new messages since timestamp',
                'GET /api/realtime/summary?since={timestamp} - Get summary count only',
                'POST /api/realtime/mark-seen - Mark updates as seen',
                'DELETE /api/realtime/cleanup?days={n} - Cleanup old records',
                'POST /api/realtime/tpos/start - Start TPOS WebSocket (saves credentials for auto-reconnect)',
                'POST /api/realtime/tpos/stop - Stop TPOS WebSocket (disables auto-reconnect)',
                'GET /api/realtime/tpos/status - Get TPOS client status'
            ],
            telegram: [
                'GET /api/telegram - Telegram bot status',
                'POST /api/telegram/webhook - Telegram webhook (Gemini AI)',
                'POST /api/telegram/setWebhook - Set webhook URL',
                'GET /api/telegram/webhookInfo - Get webhook info',
                'POST /api/telegram/deleteWebhook - Delete webhook'
            ],
            upload: [
                'POST /api/upload/image - Upload image to Firebase Storage',
                'DELETE /api/upload/image - Delete image from Firebase Storage',
                'GET /api/upload/health - Upload service health check'
            ],
            health: [
                'GET /health - Server health check',
                'GET /api/debug/time - Server time diagnostic'
            ]
        }
    });
});

// ============== TPOS LOG ENDPOINTS ==============
app.post('/api/tpos-log/start', (req, res) => {
    const minutes = req.body?.minutes || 10;
    tposEventLog.start(minutes);
    res.json({ success: true, message: `Logging started for ${minutes} minutes`, willStopAt: new Date(Date.now() + minutes * 60 * 1000).toISOString() });
});

app.post('/api/tpos-log/stop', (req, res) => {
    tposEventLog.stop();
    res.json({ success: true, ...tposEventLog.getSummary() });
});

app.get('/api/tpos-log/summary', (req, res) => {
    res.json(tposEventLog.getSummary());
});

app.get('/api/tpos-log/events', (req, res) => {
    const { type, eventType, limit } = req.query;
    let events = tposEventLog.events;
    if (type) events = events.filter(e => e.type === type);
    if (eventType) events = events.filter(e => e.eventType === eventType);
    if (limit) events = events.slice(-parseInt(limit));
    res.json({ total: events.length, events });
});

app.get('/api/tpos-log/all', (req, res) => {
    res.json(tposEventLog.getAll());
});
// ============== END TPOS LOG ENDPOINTS ==============

// ============== TPOS EXTENSION EVENTS ==============
// Receives events from N2Store Chrome Extension (e.g., tag assignments on TPOS)
// and broadcasts to all connected WebSocket clients
app.post('/api/tpos-events/broadcast', (req, res) => {
    const event = req.body;
    if (!event || !event.type) {
        return res.status(400).json({ error: 'Missing event type' });
    }
    console.log('[TPOS-EXT] Event from extension:', event.type, event.orderId || '');
    broadcastToClients(event);
    res.json({ success: true, broadcasted: true });
});
// ============== END TPOS EXTENSION EVENTS ==============

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.url
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('[GLOBAL_ERROR]', err);
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        error: err.name || 'ServerError',
        message: message,
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// =====================================================
// WEBSOCKET SERVER & CLIENT (REALTIME)
// =====================================================
const WebSocket = require('ws');
const http = require('http');

// Create HTTP server from Express app
const server = http.createServer(app);

// Create WebSocket Server for Frontend Clients
const wss = new WebSocket.Server({ server });

// ============== TPOS EVENT LOGGER ==============
const tposEventLog = {
    events: [],
    isLogging: false,
    startTime: null,
    duration: 10 * 60 * 1000, // default 10 minutes
    stopTimer: null,

    start(durationMinutes = 10) {
        this.events = [];
        this.isLogging = true;
        this.startTime = Date.now();
        this.duration = durationMinutes * 60 * 1000;
        clearTimeout(this.stopTimer);
        this.stopTimer = setTimeout(() => this.stop(), this.duration);
        console.log(`[TPOS-LOG] 📝 Started logging for ${durationMinutes} minutes`);
    },

    stop() {
        this.isLogging = false;
        clearTimeout(this.stopTimer);
        const elapsed = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;
        console.log(`[TPOS-LOG] ⏹ Stopped after ${elapsed}s, captured ${this.events.length} events`);
    },

    log(data) {
        if (!this.isLogging) return;
        this.events.push({
            timestamp: new Date().toISOString(),
            elapsed: Math.round((Date.now() - this.startTime) / 1000),
            ...data
        });
    },

    getSummary() {
        const typeCounts = {};
        const eventTypes = {};
        const samples = {};

        this.events.forEach(e => {
            // Count by broadcast type
            const t = e.type || 'unknown';
            typeCounts[t] = (typeCounts[t] || 0) + 1;

            // Count by TPOS eventType
            if (e.eventType) {
                eventTypes[e.eventType] = (eventTypes[e.eventType] || 0) + 1;
                // Keep first sample of each type
                if (!samples[e.eventType]) {
                    samples[e.eventType] = e;
                }
            }

            // For raw events, track event names
            if (e.type === 'tpos:event' && e.event) {
                const key = `raw:${e.event}`;
                eventTypes[key] = (eventTypes[key] || 0) + 1;
                if (!samples[key]) samples[key] = e;
            }
        });

        return {
            isLogging: this.isLogging,
            startTime: this.startTime ? new Date(this.startTime).toISOString() : null,
            elapsedSeconds: this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0,
            totalEvents: this.events.length,
            byBroadcastType: typeCounts,
            byEventType: eventTypes,
            samples
        };
    },

    getAll() {
        return {
            ...this.getSummary(),
            events: this.events
        };
    }
};

// (Log endpoints registered before 404 handler)
// ============== END TPOS EVENT LOGGER ==============

// Broadcast function
const broadcastToClients = (data) => {
    // Log event if logging is active
    tposEventLog.log(data);
    let sentCount = 0;
    let totalClients = wss.clients.size;
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
            sentCount++;
        }
    });
    console.log(`[SERVER-WS][DEBUG] Broadcast: type=${data.type}, sent to ${sentCount}/${totalClients} clients`);
};

// Heartbeat for Frontend Clients (Keep-Alive)
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        // if (ws.isAlive === false) return ws.terminate(); // Disable for stability

        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('connection', function connection(ws, req) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[SERVER-WS][DEBUG] Frontend client CONNECTED from ${ip}. Total clients: ${wss.clients.size}`);
    ws.on('close', () => {
        console.log(`[SERVER-WS][DEBUG] Frontend client DISCONNECTED from ${ip}. Total clients: ${wss.clients.size}`);
    });
});

wss.on('close', function close() {
    clearInterval(interval);
});



// =====================================================
// START SERVER
// =====================================================

server.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🚀 N2Store API Fallback Server');
    console.log('='.repeat(50));
    console.log(`📍 Running on port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log('='.repeat(50));

    // Pre-seed auth token cache (fire-and-forget)
    authTokenStore.preSeed().catch(e => console.warn('[AUTH-STORE] Pre-seed error:', e.message));

    // Auto-connect realtime clients after server starts (with delay to ensure DB is ready)
    setTimeout(() => {
        autoConnectRealtimeClients(chatDbPool);
    }, 3000);
});

// Start cron jobs
require('./cron/scheduler');
