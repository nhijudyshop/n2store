// =====================================================
// N2STORE API FALLBACK SERVER
// Deployed on Render.com as fallback when Cloudflare fails
// =====================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// MIDDLEWARE
// =====================================================

// CORS - Allow requests from GitHub Pages
// CORS - Allow all origins for testing
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false // credentials cannot be true when origin is *
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// =====================================================
// ROUTES
// =====================================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'N2Store API Fallback Server is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Import route modules
const tokenRoutes = require('./routes/token');
const odataRoutes = require('./routes/odata');
const chatomniRoutes = require('./routes/chatomni');
const pancakeRoutes = require('./routes/pancake');

// Mount routes
app.use('/api/token', tokenRoutes);
app.use('/api/odata', odataRoutes);
app.use('/api/api-ms/chatomni', chatomniRoutes);
app.use('/api/pancake', pancakeRoutes);
// =====================================================
// WEBSOCKET SERVER & CLIENT (REALTIME)
// =====================================================

class RealtimeClient {
    constructor() {
        this.ws = null;
        this.url = "wss://pancake.vn/socket/websocket?vsn=2.0.0";
        this.isConnected = false;
        this.refCounter = 1;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;

        // User specific data
        this.token = null;
        this.userId = null;
        this.pageIds = [];
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

        console.log('[SERVER-WS] Connecting to Pancake...');
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
            this.startHeartbeat();
            this.joinChannels();
        });

        this.ws.on('close', (code, reason) => {
            console.log('[SERVER-WS] Closed', code, reason);
            this.isConnected = false;
            this.stopHeartbeat();

            // Reconnect
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
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
            console.log('[SERVER-WS] New Message/Comment:', payload.conversation.id);

            // Broadcast to connected frontend clients
            broadcastToClients({
                type: 'pages:update_conversation',
                payload: payload
            });
        }
    }
}

// Initialize Global Client
const realtimeClient = new RealtimeClient();

// API to start the client from the browser
app.post('/api/realtime/start', (req, res) => {
    const { token, userId, pageIds, cookie } = req.body;
    if (!token || !userId || !pageIds) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    realtimeClient.start(token, userId, pageIds, cookie);
    res.json({ success: true, message: 'Realtime client started on server' });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        name: 'N2Store API Fallback Server',
        version: '1.0.0',
        endpoints: [
            'POST /api/token',
            'POST /api/realtime/start',
            'GET /api/odata/*',
            'GET /api/api-ms/chatomni/*',
            'GET /api/pancake/*',
            'GET /health'
        ]
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.url
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
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

// Broadcast function
const broadcastToClients = (data) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

// Heartbeat for Frontend Clients (Keep-Alive)
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        // if (ws.isAlive === false) return ws.terminate(); // Disable for stability

        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('connection', (ws) => {
    console.log('[WSS] Client connected');
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('close', () => console.log('[WSS] Client disconnected'));

    ws.on('error', (err) => console.error('[WSS] Client error:', err));
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
});
