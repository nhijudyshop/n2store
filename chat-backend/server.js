// =====================================================
// N2STORE CHAT BACKEND SERVER
// Simple realtime chat server with PostgreSQL + SSE
// =====================================================

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// DATABASE CONNECTION
// =====================================================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection failed:', err);
    } else {
        console.log('✅ Database connected at:', res.rows[0].now);
    }
});

// Make pool available to routes
app.locals.db = pool;

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors({
    origin: '*', // In production, specify allowed origins
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Simple logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// =====================================================
// SSE CLIENTS MANAGER
// =====================================================

const sseClients = new Map(); // userId -> response object

// Broadcast message to specific users
function broadcastToUsers(userIds, event, data) {
    userIds.forEach(userId => {
        const client = sseClients.get(userId);
        if (client) {
            client.write(`event: ${event}\n`);
            client.write(`data: ${JSON.stringify(data)}\n\n`);
        }
    });
}

// Broadcast to all clients in a conversation
async function broadcastToConversation(conversationId, event, data) {
    try {
        const result = await pool.query(
            'SELECT user_id FROM conversation_participants WHERE conversation_id = $1',
            [conversationId]
        );
        const userIds = result.rows.map(row => row.user_id);
        broadcastToUsers(userIds, event, data);
    } catch (error) {
        console.error('Failed to broadcast to conversation:', error);
    }
}

app.locals.broadcastToConversation = broadcastToConversation;
app.locals.broadcastToUsers = broadcastToUsers;

// =====================================================
// ROUTES
// =====================================================

// Health check
app.get('/', (req, res) => {
    res.json({
        name: 'N2Store Chat API',
        version: '1.0.0',
        status: 'online',
        timestamp: new Date().toISOString()
    });
});

// SSE endpoint for realtime updates
app.get('/api/chat/stream', async (req, res) => {
    // EventSource doesn't support custom headers, so get userId from query param
    const userId = req.query.userId || req.headers['x-user-id'];

    if (!userId) {
        return res.status(401).json({ error: 'Missing userId (use ?userId=xxx query parameter)' });
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Store client connection
    sseClients.set(userId, res);
    console.log(`✅ SSE client connected: ${userId} (Total: ${sseClients.size})`);

    // Send initial connection event
    res.write('event: connected\n');
    res.write(`data: ${JSON.stringify({ userId, timestamp: new Date().toISOString() })}\n\n`);

    // Update user status to online
    try {
        await pool.query(
            'UPDATE users SET status = $1, last_seen = CURRENT_TIMESTAMP WHERE user_id = $2',
            ['online', userId]
        );

        // Broadcast user online status to all clients
        broadcastToUsers(Array.from(sseClients.keys()), 'user-status', {
            userId,
            status: 'online',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Failed to update user status:', error);
    }

    // Handle client disconnect
    req.on('close', async () => {
        sseClients.delete(userId);
        console.log(`❌ SSE client disconnected: ${userId} (Total: ${sseClients.size})`);

        // Update user status to offline
        try {
            await pool.query(
                'UPDATE users SET status = $1, last_seen = CURRENT_TIMESTAMP WHERE user_id = $2',
                ['offline', userId]
            );

            // Broadcast user offline status
            broadcastToUsers(Array.from(sseClients.keys()), 'user-status', {
                userId,
                status: 'offline',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Failed to update user status:', error);
        }

        res.end();
    });
});

// Import route modules
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const conversationRoutes = require('./routes/conversations');
const messageRoutes = require('./routes/messages');

// Mount routes
app.use('/api/chat', authRoutes);
app.use('/api/chat', userRoutes);
app.use('/api/chat', conversationRoutes);
app.use('/api/chat', messageRoutes);

// =====================================================
// ERROR HANDLING
// =====================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.path,
        message: 'The requested endpoint does not exist'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('🚀 N2Store Chat Server');
    console.log('========================================');
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/`);
    console.log('========================================');
    console.log('');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing server...');
    await pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, closing server...');
    await pool.end();
    process.exit(0);
});
