// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — REALTIME SSE (Server-Sent Events)
// =====================================================
// Server SSE TÁCH RIÊNG cho Web 2.0, độc lập với routes/realtime-sse.js (Web 1.0).
//
// Mount: app.use('/api/realtime/web2', web2RealtimeSseRoutes)
// Endpoint client: GET /api/realtime/web2/sse?keys=web2:products,web2:variants,...
//
// Map<topic, Set<Response>> riêng — không chia chung với Web 1.0 nữa.
// Listener web2WalletEvents 'web2:wallet:update' chuyển từ realtime-sse.js sang đây.
// =====================================================

const express = require('express');
const router = express.Router();
const { requireWeb2Admin } = require('../middleware/web2-auth');

// =====================================================
// SSE CLIENT MANAGEMENT
// =====================================================

/** Map<string, Set<Response>> — key: topic (vd 'web2:products'), value: subscribers */
const sseClients = new Map();

/** Map<Response, {connectionId, keys, connectedAt, ip}> — debug metadata */
const clientMetadata = new WeakMap();

// =====================================================
// ADMIN LOG RING BUFFER + LIVE FEED
// Cho phép admin xem realtime SSE activity từ browser
// (page: /web2/admin-sse-monitor/).
// =====================================================
const ADMIN_LOG_TOPIC = 'web2:_admin:sse-log';
const LOG_BUFFER_MAX = 500;
const recentLogs = []; // {seq, type, ts, ...payload}
let _logSeq = 0;

function _pushLog(entry) {
    const log = { seq: ++_logSeq, ts: Date.now(), ...entry };
    recentLogs.push(log);
    if (recentLogs.length > LOG_BUFFER_MAX) {
        recentLogs.splice(0, recentLogs.length - LOG_BUFFER_MAX);
    }
    // Broadcast to admin topic (don't recurse — admin topic itself is excluded).
    if (log.topic === ADMIN_LOG_TOPIC) return;
    const adminClients = sseClients.get(ADMIN_LOG_TOPIC);
    if (!adminClients || adminClients.size === 0) return;
    const msg = JSON.stringify({
        key: ADMIN_LOG_TOPIC,
        data: log,
        timestamp: log.ts,
        event: 'log',
    });
    adminClients.forEach((client) => {
        try {
            client.write(`event: log\n`);
            client.write(`data: ${msg}\n\n`);
        } catch (_) {
            // cleanup on next req.on('close')
        }
    });
}

function getConnectionStats() {
    let totalClients = 0;
    const keyStats = {};
    sseClients.forEach((clients, key) => {
        keyStats[key] = clients.size;
        totalClients += clients.size;
    });
    return { totalClients, uniqueKeys: sseClients.size, keyStats };
}

// =====================================================
// SSE ENDPOINT — GET /api/realtime/web2/sse?keys=web2:foo,web2:bar
// =====================================================

router.get('/sse', (req, res) => {
    const keysParam = req.query.keys || '';
    const keys = keysParam
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

    if (keys.length === 0) {
        return res.status(400).json({
            error: 'No keys specified',
            usage: 'GET /api/realtime/web2/sse?keys=web2:products,web2:variants',
        });
    }
    if (keys.some((k) => k.length > 500)) {
        return res.status(400).json({ error: 'Key too long (max 500 characters)' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const connectionId = `web2conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    res.write(`event: connected\n`);
    res.write(
        `data: ${JSON.stringify({
            keys,
            connectionId,
            timestamp: new Date().toISOString(),
            server: 'web2',
        })}\n\n`
    );

    clientMetadata.set(res, {
        connectionId,
        keys,
        connectedAt: new Date(),
        ip: req.ip || req.connection.remoteAddress,
    });

    keys.forEach((key) => {
        if (!sseClients.has(key)) sseClients.set(key, new Set());
        sseClients.get(key).add(res);
    });

    console.log(`[SSE-WEB2] Client connected (${connectionId}), watching: ${keys.join(', ')}`);
    console.log(`[SSE-WEB2] Active connections:`, getConnectionStats().totalClients);
    _pushLog({
        type: 'connect',
        connectionId,
        keys,
        totalClients: getConnectionStats().totalClients,
    });

    const heartbeat = setInterval(() => {
        try {
            res.write(`:heartbeat ${Date.now()}\n\n`);
        } catch (_) {
            clearInterval(heartbeat);
        }
    }, 30000);

    req.on('close', () => {
        clearInterval(heartbeat);
        keys.forEach((key) => {
            const clients = sseClients.get(key);
            if (clients) {
                clients.delete(res);
                if (clients.size === 0) sseClients.delete(key);
            }
        });
        const metadata = clientMetadata.get(res);
        const duration = metadata
            ? ((Date.now() - metadata.connectedAt.getTime()) / 1000).toFixed(1)
            : 'unknown';
        console.log(
            `[SSE-WEB2] Client disconnected (${metadata?.connectionId || 'unknown'}) after ${duration}s`
        );
        console.log(`[SSE-WEB2] Active connections:`, getConnectionStats().totalClients);
        _pushLog({
            type: 'disconnect',
            connectionId: metadata?.connectionId || 'unknown',
            keys: metadata?.keys || [],
            durationSec: parseFloat(duration) || 0,
            totalClients: getConnectionStats().totalClients,
        });
        clientMetadata.delete(res);
    });

    req.on('error', (error) => {
        console.error('[SSE-WEB2] Request error:', error.message);
        clearInterval(heartbeat);
    });
});

// =====================================================
// NOTIFICATION FUNCTIONS — gọi từ routes Web 2.0 sau mỗi DB write
// =====================================================

function notifyClients(key, data, eventType = 'update') {
    const clients = sseClients.get(key);
    if (!clients || clients.size === 0) {
        console.log(`[SSE-WEB2] No clients listening to key: ${key}`);
        _pushLog({
            type: 'notify',
            topic: key,
            eventType,
            clientsNotified: 0,
            action: data?.action || null,
        });
        return 0;
    }

    const message = JSON.stringify({
        key,
        data,
        timestamp: Date.now(),
        event: eventType,
    });

    let successCount = 0;
    let failureCount = 0;
    clients.forEach((client) => {
        try {
            client.write(`event: ${eventType}\n`);
            client.write(`data: ${message}\n\n`);
            successCount++;
        } catch (error) {
            console.error('[SSE-WEB2] Error sending to client:', error.message);
            failureCount++;
        }
    });

    console.log(
        `[SSE-WEB2] Notified ${successCount} clients for key: ${key}` +
            (failureCount > 0 ? ` (${failureCount} failed)` : '')
    );
    _pushLog({
        type: 'notify',
        topic: key,
        eventType,
        clientsNotified: successCount,
        failures: failureCount,
        action: data?.action || null,
        code: data?.code || null,
    });

    return successCount;
}

function notifyClientsWildcard(keyPrefix, data, eventType = 'update') {
    let totalNotified = 0;
    sseClients.forEach((clients, key) => {
        if (key.startsWith(keyPrefix) || keyPrefix.startsWith(key + '/')) {
            const message = JSON.stringify({
                key: keyPrefix,
                data,
                timestamp: Date.now(),
                event: eventType,
                matchedKey: key,
            });
            clients.forEach((client) => {
                try {
                    client.write(`event: ${eventType}\n`);
                    client.write(`data: ${message}\n\n`);
                    totalNotified++;
                } catch (error) {
                    console.error('[SSE-WEB2] Error sending to client:', error.message);
                }
            });
        }
    });
    if (totalNotified > 0) {
        console.log(
            `[SSE-WEB2] Wildcard notified ${totalNotified} clients for pattern: ${keyPrefix}`
        );
    }
    return totalNotified;
}

function broadcastToAll(data, eventType = 'broadcast') {
    let totalNotified = 0;
    const message = JSON.stringify({ data, timestamp: Date.now(), event: eventType });
    sseClients.forEach((clients) => {
        clients.forEach((client) => {
            try {
                client.write(`event: ${eventType}\n`);
                client.write(`data: ${message}\n\n`);
                totalNotified++;
            } catch (error) {
                console.error('[SSE-WEB2] Error broadcasting to client:', error.message);
            }
        });
    });
    console.log(`[SSE-WEB2] Broadcast to ${totalNotified} clients`);
    return totalNotified;
}

// =====================================================
// DIAGNOSTIC ENDPOINTS
// =====================================================

router.get('/sse/stats', requireWeb2Admin, (req, res) => {
    const stats = getConnectionStats();
    res.json({
        success: true,
        server: 'web2',
        ...stats,
        timestamp: new Date().toISOString(),
    });
});

router.post('/sse/test', requireWeb2Admin, (req, res) => {
    const { key, data } = req.body;
    if (!key) return res.status(400).json({ error: 'Missing key parameter' });
    const count = notifyClients(key, data || { test: true, timestamp: Date.now() }, 'test');
    res.json({ success: true, server: 'web2', key, clientsNotified: count });
});

// =====================================================
// SERVER-TO-SERVER RELAY NOTIFY — live-chat WS relay đẩy event inbox vào đây.
// GATED bằng x-relay-secret === CLEANUP_SECRET (KHÔNG dùng requireWeb2Admin vì
// đây là gọi server↔server, không có session admin).
// Body: { key, data }
// =====================================================
router.post('/sse/relay-notify', (req, res) => {
    const secret = process.env.CLEANUP_SECRET || '';
    const provided = req.headers['x-relay-secret'] || '';
    if (secret) {
        if (provided !== secret) {
            return res.status(401).json({ success: false, error: 'unauthorized' });
        }
    } else {
        console.warn('[SSE-WEB2] /sse/relay-notify: CLEANUP_SECRET không set — cho qua (dev only)');
    }
    const { key, data } = req.body || {};
    if (!key) return res.status(400).json({ success: false, error: 'Missing key parameter' });
    let clients = 0;
    try {
        clients = notifyClients(key, data || { ts: Date.now() }, 'update');
    } catch (e) {
        console.error('[SSE-WEB2] relay-notify error:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
    res.json({ success: true, server: 'web2', key, clients });
});

/**
 * GET /api/realtime/web2/sse/log?since=<seq>&limit=<n>
 * Returns recent admin log entries (connect/notify/disconnect events).
 * Used by the SSE Monitor admin page to bootstrap before subscribing to live feed.
 *
 * Query params:
 *   since: optional seq number; returns only logs with seq > since
 *   limit: optional max entries (default 200, max 500)
 */
router.get('/sse/log', requireWeb2Admin, (req, res) => {
    const since = parseInt(req.query.since, 10) || 0;
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, LOG_BUFFER_MAX);
    const filtered = since > 0 ? recentLogs.filter((l) => l.seq > since) : recentLogs;
    const slice = filtered.slice(-limit);
    res.json({
        success: true,
        server: 'web2',
        adminTopic: ADMIN_LOG_TOPIC,
        bufferSize: recentLogs.length,
        bufferMax: LOG_BUFFER_MAX,
        currentSeq: _logSeq,
        entries: slice,
    });
});

// =====================================================
// WEB 2.0 WALLET EVENT SUBSCRIPTION
// SePay → web2-sepay-matching → web2-wallet-service.processDeposit
//  → web2WalletEvents.emit('web2:wallet:update') → đây broadcast
// =====================================================
try {
    const { web2WalletEvents } = require('../services/web2-wallet-service');

    web2WalletEvents.on('web2:wallet:update', (data) => {
        const { phone, wallet, transaction } = data;

        // Per-phone topic
        try {
            notifyClients(
                `web2:wallet:${phone}`,
                { action: 'update', phone, wallet, transaction, ts: Date.now() },
                'wallet_update'
            );
        } catch (_) {}

        // Wildcard topic for list pages (admin)
        try {
            notifyClientsWildcard('web2:wallet', data, 'wallet_update');
        } catch (_) {}

        // Canonical Web 2.0 customer-wallet topic (page subscribes 'web2:customer-wallet')
        try {
            notifyClients(
                'web2:customer-wallet',
                {
                    action: 'web2_credit',
                    phone: phone || null,
                    amount: transaction?.amount || 0,
                    txType: transaction?.type || null,
                    walletTxId: transaction?.id || null,
                    ts: Date.now(),
                },
                'update'
            );
        } catch (_) {}
    });

    console.log('[SSE-WEB2] Web 2.0 wallet event subscription initialized');
} catch (e) {
    console.warn('[SSE-WEB2] web2-wallet-service not available:', e.message);
}

// =====================================================
// EXPORTS
// =====================================================

router.notifyClients = notifyClients;
router.notifyClientsWildcard = notifyClientsWildcard;
router.broadcastToAll = broadcastToAll;
router.getConnectionStats = getConnectionStats;

module.exports = router;
