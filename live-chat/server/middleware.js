// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// EXPRESS MIDDLEWARE — security headers, CORS, JSON, request logging,
// Facebook Graph routes, relay-secret guard. Side-effect-free on require:
// applyMiddleware/makeRequireRelaySecret are called by the entry.
// =====================================================
const cors = require('cors');
const express = require('express');

// Gate mutation routes (/api/start /api/stop /api/reload /api/reconnect) bằng
// x-relay-secret — audit 3H8: không auth thì ai cũng kill được relay realtime
// giữa buổi live. GET status/events giữ mở cho debug (không mutation).
function makeRequireRelaySecret(relaySecret) {
    return function requireRelaySecret(req, res, next) {
        if (!relaySecret) return next(); // dev: secret rỗng → cho qua
        if ((req.headers['x-relay-secret'] || '') !== relaySecret) {
            return res.status(401).json({ success: false, error: 'unauthorized' });
        }
        next();
    };
}

// Wire all Express middleware onto the app. `facebookRoutes` is the router
// exported from ./facebook-routes (merged FB Graph endpoints).
function applyMiddleware(app, { facebookRoutes }) {
    // Baseline security headers
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        next();
    });

    // CORS — frontend (nhijudy.store / github.io) gọi FB Graph endpoints cross-origin
    app.use(cors({ origin: '*' }));

    app.use(express.json());

    // Request logging (skip noisy health-check probes — Render pings every ~5s)
    app.use((req, res, next) => {
        if (req.path !== '/ping' && req.path !== '/health' && req.path !== '/health/detailed') {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
        }
        next();
    });

    // Facebook Graph API routes (merged from n2store-facebook 2026-06-14):
    // /api/pages/*, /api/conversations/*, /api/refresh-tokens, /api/facebook-status
    app.use(facebookRoutes);
}

module.exports = { applyMiddleware, makeRequireRelaySecret };
