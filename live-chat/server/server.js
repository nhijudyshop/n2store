// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// N2STORE PANCAKE WEBSOCKET CLIENT (Multi-Account) — ENTRY POINT
// Nhận tin nhắn Facebook Page realtime qua Pancake Phoenix WebSocket
// Tự động load tokens từ Firebase Firestore
// Deploy trên Render.com (service: n2store-live-chat)
//
// This entry owns ALL side effects (new Pool, Firestore init, app.listen,
// new WebSocket.Server, intervals, process signal handlers). Every required
// module below is side-effect-free: factories/classes only; nothing connects or
// listens until this file wires + invokes them.
// =====================================================

require('dotenv').config();
const express = require('express');
const facebookRoutes = require('./facebook-routes'); // WEB2.0: FB Graph (merged from n2store-facebook)
const { sendAlert } = require('./utils/alert');

const { createRelay } = require('./relay');
const { applyMiddleware, makeRequireRelaySecret } = require('./middleware');
const { createEventStore } = require('./event-store');
const { createDbPool } = require('./db');
const { initFirebase, loadTokensFromFirebase } = require('./firebase-loader');
const { discoverPageIds } = require('./pancake-api');
const { createPageSelection } = require('./page-selection-db');
const { PancakeWebSocketClient } = require('./pancake-client');
const { createClientManager } = require('./client-manager');
const { createBrowserBroker } = require('./browser-broker');
const { registerRoutes } = require('./routes');

// Startup env validation — DB optional (falls back to Firebase). Warn for clarity.
const REQUIRED_ENV = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
    console.warn(`[STARTUP] Missing env vars (Firebase disabled): ${missingEnv.join(', ')}`);
}

// Global safety net — prevent process exit on unhandled rejection / exception.
process.on('unhandledRejection', (reason, promise) => {
    const stack = (reason && reason.stack) || String(reason);
    console.error('[PROCESS] Unhandled Rejection:', stack);
    sendAlert('unhandledRejection', String(reason).slice(0, 200), stack);
});
process.on('uncaughtException', (err) => {
    const stack = (err && err.stack) || String(err);
    console.error('[PROCESS] Uncaught Exception:', stack);
    sendAlert('uncaughtException', (err && err.message) || String(err), stack);
});

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_EVENTS = parseInt(process.env.MAX_EVENTS || '1000');

// FALLBACK_BASE env trỏ web2-api sau tách 2026-06-14 (tên giữ lịch sử).
const FALLBACK_BASE = process.env.FALLBACK_BASE || 'https://web2-api-kv04.onrender.com';
const RELAY_SECRET = process.env.RELAY_SECRET || process.env.CLEANUP_SECRET || '';

// =====================================================
// INIT collaborators (side effects happen HERE, in the entry)
// =====================================================
const { forwardToFallback } = createRelay({ base: FALLBACK_BASE, secret: RELAY_SECRET });
const requireRelaySecret = makeRequireRelaySecret(RELAY_SECRET);
const eventStore = createEventStore(MAX_EVENTS);
const db = createDbPool(); // new Pool() + SELECT NOW() probe (null if no DATABASE_URL)
const firestore = initFirebase(); // admin.initializeApp() (null if not configured)
const { getDisabledPageIds, savePageSelection } = createPageSelection(db);

// Browser broadcast is wired AFTER httpServer exists (broker needs the server).
// Until then a no-op; the wrapper lets the client factory close over the final
// implementation without an ordering deadlock. broadcastToBrowsers is only ever
// CALLED at WS message-handling time (runtime), never at wiring time.
let _broadcastImpl = () => {};
const broadcastToBrowsers = (type, payload) => _broadcastImpl(type, payload);

// Client factory injects the shared collaborators into each PancakeWebSocketClient.
const createClient = (name) =>
    new PancakeWebSocketClient(name, {
        storeEvent: eventStore.storeEvent,
        forwardToFallback,
        broadcastToBrowsers,
    });

const manager = createClientManager({
    db,
    firestore,
    discoverPageIds,
    getDisabledPageIds,
    savePageSelection,
    loadTokensFromFirebase,
    createClient,
});
const { clients, startClient, autoConnect } = manager;

// =====================================================
// EXPRESS — middleware + routes
// =====================================================
applyMiddleware(app, { facebookRoutes });

registerRoutes(app, {
    clients,
    eventStore: eventStore.events,
    firestore,
    db,
    MAX_EVENTS,
    requireRelaySecret,
    startClient,
    autoConnect,
    discoverPageIds,
    getDisabledPageIds,
    savePageSelection,
});

// =====================================================
// START SERVER
// =====================================================
const httpServer = app.listen(PORT, () => {
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

// =====================================================
// BROWSER-FACING WS BROKER — attach to httpServer, wire the broadcast impl.
// =====================================================
const { browserWss, broadcastToBrowsers: brokerBroadcast } = createBrowserBroker(httpServer);
_broadcastImpl = brokerBroadcast;

// =====================================================
// GRACEFUL SHUTDOWN — close HTTP + WS clients + DB pool cleanly.
// =====================================================
let _shuttingDown = false;
async function gracefulShutdown(signal) {
    if (_shuttingDown) return;
    _shuttingDown = true;
    console.log(`[SHUTDOWN] Received ${signal}, closing...`);
    try {
        for (const client of clients.values()) {
            try {
                client.stop();
            } catch (_) {}
        }
        clients.clear();
    } catch (_) {}
    try {
        await new Promise((resolve) => httpServer.close(resolve));
        console.log('[SHUTDOWN] HTTP server closed');
    } catch (e) {
        console.warn('[SHUTDOWN] HTTP close error:', e.message);
    }
    try {
        if (db && typeof db.end === 'function') {
            await Promise.race([db.end(), new Promise((r) => setTimeout(r, 5000))]);
            console.log('[SHUTDOWN] DB pool closed');
        }
    } catch (e) {
        console.warn('[SHUTDOWN] DB close error:', e.message);
    }
    console.log('[SHUTDOWN] Done, exit 0');
    process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
