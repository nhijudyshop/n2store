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
app.use(cors({
    origin: [
        'https://nhijudyshop.github.io',
        'http://localhost:5500',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
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

// Root route
app.get('/', (req, res) => {
    res.json({
        name: 'N2Store API Fallback Server',
        version: '1.0.0',
        endpoints: [
            'POST /api/token',
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
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🚀 N2Store API Fallback Server');
    console.log('='.repeat(50));
    console.log(`📍 Running on port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log('='.repeat(50));
});
