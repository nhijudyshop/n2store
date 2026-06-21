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
const { requireWeb2Admin, resolveWeb2User } = require('../middleware/web2-auth');

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

// =====================================================
// CROSS-INSTANCE FORWARD (Web1⊥Web2 service split 2026-06-14)
// =====================================================
// Sau tách web2-api, client web2 subscribe vào hub của web2-api (worker route
// /api/realtime/web2/sse → web2-api). Nhưng vài notify Web 2.0 vẫn PHÁT SINH trên
// n2store-fallback (Web 1.0): SePay webhook web2 fan-out (CK→ví KH), ck-watcher.
// → notify local trên fallback có 0 subscriber. Giải pháp: fallback set
// WEB2_API_FORWARD_URL → notifyClients ĐỒNG THỜI POST cross-instance sang
// web2-api/api/realtime/web2/sse/relay-notify để client thật nhận realtime.
// web2-api KHÔNG set env này → không forward (tránh loop). Admin topic loại trừ.
let _forwardTarget = null; // { url, secret }
function setForwardTarget(target) {
    // Guard SSRF nhẹ (audit r3): forward URL từ env (ops set) nhưng vẫn bắt buộc
    // https → tránh leak secret qua http / target nội bộ vô tình. Prod = onrender.com https.
    const rawUrl = target && target.url ? String(target.url).replace(/\/$/, '') : '';
    if (rawUrl && !/^https:\/\//i.test(rawUrl)) {
        console.error(`[SSE-WEB2] Forward target REJECTED (không phải https): ${rawUrl}`);
        _forwardTarget = null;
        return;
    }
    _forwardTarget = rawUrl ? { url: rawUrl, secret: (target && target.secret) || '' } : null;
    if (_forwardTarget) {
        console.log(`[SSE-WEB2] Cross-instance forward ENABLED → ${_forwardTarget.url}`);
    }
}

function _forwardNotify(key, data, eventType) {
    if (!_forwardTarget || key === ADMIN_LOG_TOPIC) return;
    if (typeof fetch !== 'function') return; // Node 18+ global fetch
    const url = `${_forwardTarget.url}/api/realtime/web2/sse/relay-notify`;
    const body = JSON.stringify({
        key,
        data: data || { ts: Date.now() },
        event: eventType || 'update',
    });
    const doPost = () =>
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-relay-secret': _forwardTarget.secret,
            },
            body,
        }).then((r) => {
            if (!r.ok && r.status !== 401) throw new Error(`HTTP ${r.status}`);
            return r;
        });
    // Fire-and-forget + 1 retry (cold-start/restart web2-api làm rớt 1 nhịp).
    Promise.resolve()
        .then(doPost)
        .catch(() =>
            setTimeout(() => {
                doPost().catch((e) =>
                    console.warn(`[SSE-WEB2] forward fail key=${key}:`, e.message)
                );
            }, 2000)
        );
}

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

router.get('/sse', async (req, res) => {
    const keysParam = req.query.keys || '';
    let keys = keysParam
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
    // 1D FIX (2026-06-12): cap SỐ LƯỢNG keys — 1 client subscribe hàng nghìn
    // topic làm phình Map sseClients (memory DoS nhẹ). Page thật ≤ ~8 topics.
    if (keys.length > 50) {
        return res.status(400).json({ error: `Too many keys (${keys.length} > 50)` });
    }

    // S5: topic admin (web2:_admin:*) yêu cầu ?admintoken=<token Web2Auth>
    // hợp lệ với role='admin'. EventSource không gửi header được → dùng query
    // param (tradeoff: token xuất hiện trong access log — chấp nhận).
    // Key admin không hợp lệ → bỏ key đó, vẫn cho connect các key thường.
    const adminKeys = keys.filter((k) => k.startsWith('web2:_admin:'));
    if (adminKeys.length > 0) {
        let isAdmin = false;
        try {
            const adminToken = String(req.query.admintoken || '').trim();
            if (adminToken) {
                const user = await resolveWeb2User({
                    headers: {},
                    query: { token: adminToken },
                    body: null,
                    app: req.app,
                });
                isAdmin = !!user && user.role === 'admin';
            }
        } catch (e) {
            console.error('[SSE-WEB2] admintoken resolve error:', e.message);
        }
        if (!isAdmin) {
            console.warn(
                `[SSE-WEB2] Dropped admin keys (missing/invalid admintoken): ${adminKeys.join(', ')}`
            );
            keys = keys.filter((k) => !k.startsWith('web2:_admin:'));
            if (keys.length === 0) {
                return res.status(403).json({ error: 'Admin topics require a valid ?admintoken=' });
            }
        }
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
    // Cross-instance forward TRƯỚC local broadcast: trên fallback (Web 1.0) thường
    // có 0 subscriber local nên early-return phía dưới sẽ bỏ qua — phải forward ở đây.
    if (_forwardTarget) _forwardNotify(key, data, eventType);
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
        // Convention separator là ':' (KHÔNG '/'): subscriber key match khi
        //   key === prefix              (vd 'web2:wallet')
        //   key.startsWith(prefix+':')  (vd 'web2:wallet:0123...', 'web2:wallet:*')
        // → 'web2:wallet-config' KHÔNG match prefix 'web2:wallet'.
        const isMatch = key === keyPrefix || key.startsWith(keyPrefix + ':');
        if (isMatch) {
            // payload.key = CHÍNH key client đã subscribe — bridge client
            // (web2-sse-bridge.js) exact-match subscribers.get(payload.key).
            const message = JSON.stringify({
                key,
                data,
                timestamp: Date.now(),
                event: eventType,
                pattern: keyPrefix,
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
    if (!secret) {
        // Fail-closed: thiếu env → từ chối thay vì cho qua.
        console.error(
            '[SSE-WEB2] /sse/relay-notify: CLEANUP_SECRET chưa set — fail-closed, từ chối request'
        );
        return res.status(503).json({ success: false, error: 'relay not configured' });
    }
    if (provided !== secret) {
        return res.status(401).json({ success: false, error: 'unauthorized' });
    }
    const { key, data, event } = req.body || {};
    if (!key) return res.status(400).json({ success: false, error: 'Missing key parameter' });
    // Hardening relay (audit r3 2026-06-21): (1) KHÔNG cho relay topic admin
    // (web2:_admin:*) cross-instance; (2) whitelist event type; (3) cap payload
    // chống DoS amplification (mỗi relay fan-out N client).
    if (String(key).startsWith('web2:_admin:')) {
        return res.status(403).json({ success: false, error: 'admin topics cannot be relayed' });
    }
    const VALID_EVENTS = ['update', 'created', 'deleted', 'change', 'test', 'log'];
    const evt = VALID_EVENTS.includes(event) ? event : 'update';
    if (JSON.stringify(data || {}).length > 10240) {
        return res.status(413).json({ success: false, error: 'payload too large (max 10KB)' });
    }
    let clients = 0;
    try {
        clients = notifyClients(key, data || { ts: Date.now() }, evt);
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
        const { phone, transaction } = data;

        // S5: KHÔNG broadcast nguyên object wallet/transaction (số dư + PII).
        // Chỉ gửi tickle {action, phone, ts} — client re-fetch.
        // eventType 'update' (KHÔNG 'wallet_update') — bridge client chỉ
        // addEventListener update/created/deleted/change.
        const tickle = { action: 'update', phone, ts: Date.now() };

        // Per-phone topic
        try {
            notifyClients(`web2:wallet:${phone}`, tickle, 'update');
        } catch (_) {}

        // Wildcard topic for list pages (admin) — match 'web2:wallet:*' subscribers
        try {
            notifyClientsWildcard('web2:wallet', tickle, 'update');
        } catch (_) {}

        // Canonical Web 2.0 customer-wallet topic (page subscribes 'web2:customer-wallet')
        try {
            // 3M-S5r FIX (2026-06-12): topic này subscribe được KHÔNG cần auth —
            // payload trước đây kèm phone + amount (PII + tài chính). Strip về
            // tickle như S5 đã làm cho web2:wallet:* — client re-fetch số liệu.
            notifyClients(
                'web2:customer-wallet',
                { action: 'web2_credit', txType: transaction?.type || null, ts: Date.now() },
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
router.setForwardTarget = setForwardTarget; // cross-instance forward (fallback → web2-api)

module.exports = router;
