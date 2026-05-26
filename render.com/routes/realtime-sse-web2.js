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

// =====================================================
// SSE CLIENT MANAGEMENT
// =====================================================

/** Map<string, Set<Response>> — key: topic (vd 'web2:products'), value: subscribers */
const sseClients = new Map();

/** Map<Response, {connectionId, keys, connectedAt, ip}> — debug metadata */
const clientMetadata = new WeakMap();

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

router.get('/sse/stats', (req, res) => {
    const stats = getConnectionStats();
    res.json({
        success: true,
        server: 'web2',
        ...stats,
        timestamp: new Date().toISOString(),
    });
});

router.post('/sse/test', (req, res) => {
    const { key, data } = req.body;
    if (!key) return res.status(400).json({ error: 'Missing key parameter' });
    const count = notifyClients(key, data || { test: true, timestamp: Date.now() }, 'test');
    res.json({ success: true, server: 'web2', key, clientsNotified: count });
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
