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
const crypto = require('crypto');
const { Client: PgClient } = require('pg');
const { requireWeb2Admin, resolveWeb2User } = require('../middleware/web2-auth');

// =====================================================
// INSTANCE IDENTITY + CROSS-INSTANCE FAN-OUT (2026-06-22)
// =====================================================
// BUG nền (điều tra 2026-06-22): hub SSE là Map in-RAM PER-PROCESS. Nếu web2-api
// chạy >1 instance (Render scale HOẶC cửa sổ rolling-deploy chồng instance vài
// giây), mutation rơi instance A broadcast tới client LOCAL của A; client SSE bám
// instance B KHÔNG nhận → realtime rớt ÂM THẦM (delivery all-or-nothing tuỳ việc
// mutation có trùng instance đang giữ SSE hay không).
// FIX: fan-out cross-instance qua **Postgres LISTEN/NOTIFY** trên web2Db (KHÔNG
// cần Redis). Mỗi instance LISTEN channel 'web2_sse'; notifyClients broadcast
// local + pg_notify; instance khác nhận NOTIFY → broadcast local của nó. Bỏ qua
// NOTIFY do CHÍNH MÌNH phát (origin === BOOT_ID) → không double. Single-instance:
// self-NOTIFY bị bỏ → hành vi KHÔNG đổi (an toàn tuyệt đối). Kill-switch:
// WEB2_SSE_NO_CROSS=1. Quan sát: bootId vào connectionId + /sse/stats; bảng
// web2_sse_instances (heartbeat) đếm số instance sống → cảnh báo nếu >1.
// BOOT_ID PHẢI unique PER-PROCESS. KHÔNG slice RENDER_INSTANCE_ID (Render có thể
// đặt = service-id-prefix giống nhau giữa các instance → slice cắt mất phần unique
// → 2 instance trùng BOOT_ID → self-skip DROP NHẦM event cross-instance, fan-out vỡ).
// → LUÔN nối random suffix đảm bảo unique tuyệt đối; prefix RENDER_INSTANCE_ID chỉ
// để dễ đọc khi debug. (bug bắt được lúc test 2026-06-22: slice(0,24) ra service id.)
const BOOT_ID =
    (process.env.RENDER_INSTANCE_ID
        ? String(process.env.RENDER_INSTANCE_ID).slice(0, 40) + '-'
        : 'web2-') + crypto.randomBytes(5).toString('hex');
const PG_CHANNEL = 'web2_sse';
let _crossPool = null; // web2Db pool (publish pg_notify + heartbeat + stats)
let _pgNotify = null; // (payloadStr) => void — fire-and-forget
let _listenClient = null; // dedicated PgClient cho LISTEN
let _heartbeatTimer = null;
let _listenReconnectTimer = null; // 1 timer reconnect duy nhất (chống double-schedule)
let _shuttingDown = false;
// Đếm để verify vòng LISTEN/NOTIFY sống (single-instance: published≈received vì
// self-NOTIFY quay về; multi-instance: deliveredFromPeers > 0 khi instance khác phát).
const _crossStats = { published: 0, received: 0, deliveredFromPeers: 0, lastRecvAt: 0 };

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

    // connectionId mang BOOT_ID → 2 client khác process lộ ngay (chẩn đoán
    // multi-instance từ Admin SSE Monitor, không còn 'im lặng' như bug 2026-06-21).
    const connectionId = `web2conn_${BOOT_ID}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    res.write(`event: connected\n`);
    res.write(
        `data: ${JSON.stringify({
            keys,
            connectionId,
            timestamp: new Date().toISOString(),
            server: 'web2',
            bootId: BOOT_ID,
            instanceId: process.env.RENDER_INSTANCE_ID || null,
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
    // (1) forward fallback→web2-api (HTTP relay, cross-SERVICE) — giữ nguyên.
    if (_forwardTarget) _forwardNotify(key, data, eventType);
    // (2) fan-out giữa các instance web2-api (Postgres LISTEN/NOTIFY) — instance
    //     khác sẽ broadcast local của nó. Single-instance: self-NOTIFY bị bỏ.
    _publishCrossInstance('notify', key, data, eventType);
    // (3) broadcast tới subscriber LOCAL ngay (độ trễ thấp).
    return _localNotify(key, data, eventType);
}

// Broadcast THUẦN tới subscriber LOCAL của instance này (KHÔNG forward/publish).
// Gọi bởi notifyClients (event do mình phát) VÀ handler LISTEN (event từ instance
// khác qua pg NOTIFY) → mọi instance giao tin đồng nhất.
function _localNotify(key, data, eventType = 'update', fromPeer = false) {
    const clients = sseClients.get(key);
    if (!clients || clients.size === 0) {
        // fromPeer = nhận qua pg NOTIFY từ instance khác. Khi instance này KHÔNG có
        // subscriber cho key đó (bình thường — client ở instance khác), ĐỪNG log/
        // _pushLog 'No clients' (gây nhiễu admin log + crossStats giả). Chỉ log khi
        // event do CHÍNH instance này phát (fromPeer=false).
        if (!fromPeer) {
            console.log(`[SSE-WEB2] No clients listening to key: ${key}`);
            _pushLog({
                type: 'notify',
                topic: key,
                eventType,
                clientsNotified: 0,
                action: data?.action || null,
            });
        }
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
    _publishCrossInstance('wildcard', keyPrefix, data, eventType);
    return _localNotifyWildcard(keyPrefix, data, eventType);
}

function _localNotifyWildcard(keyPrefix, data, eventType = 'update') {
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
    _publishCrossInstance('broadcast', null, data, eventType);
    return _localBroadcast(data, eventType);
}

function _localBroadcast(data, eventType = 'broadcast') {
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

router.get('/sse/stats', requireWeb2Admin, async (req, res) => {
    const stats = getConnectionStats();
    // Lộ bootId + danh sách instance sống (heartbeat) → chẩn đoán multi-instance.
    let liveInstances = 1;
    let instances = [];
    if (_crossPool) {
        try {
            const now = Date.now();
            const r = await _crossPool.query(
                'SELECT boot_id, render_instance_id, started_at, last_seen FROM web2_sse_instances WHERE last_seen > $1 ORDER BY started_at',
                [now - 90000]
            );
            instances = r.rows.map((x) => ({
                bootId: x.boot_id,
                renderInstanceId: x.render_instance_id,
                startedAt: Number(x.started_at),
                lastSeen: Number(x.last_seen),
                self: x.boot_id === BOOT_ID,
            }));
            liveInstances = instances.length || 1;
        } catch (e) {
            /* registry chưa sẵn — bỏ qua */
        }
    }
    res.json({
        success: true,
        server: 'web2',
        bootId: BOOT_ID,
        crossInstance: !!_listenClient,
        crossStats: _crossStats,
        liveInstances,
        multiInstanceWarning: liveInstances > 1,
        instances,
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
// CROSS-INSTANCE FAN-OUT — Postgres LISTEN/NOTIFY (2026-06-22)
// =====================================================

// Publish 1 notify ra channel để các instance khác broadcast local. Admin log
// KHÔNG fan-out. Payload nhỏ (tickle {action,code,ts}) — guard 7KB (limit pg ~8KB).
function _publishCrossInstance(kind, key, data, eventType) {
    if (!_pgNotify || _shuttingDown) return;
    if (key === ADMIN_LOG_TOPIC) return;
    try {
        const payload = JSON.stringify({
            kind,
            key: key || null,
            data: data || null,
            eventType: eventType || 'update',
            origin: BOOT_ID,
            ts: Date.now(),
        });
        if (payload.length > 7000) {
            console.warn(
                `[SSE-WEB2] cross-instance payload quá lớn (${payload.length}b) — bỏ NOTIFY key=${key}`
            );
            return;
        }
        _crossStats.published++;
        _pgNotify(payload);
    } catch (e) {
        console.warn('[SSE-WEB2] _publishCrossInstance fail:', e.message);
    }
}

// Nhận NOTIFY từ instance khác → broadcast LOCAL. Bỏ qua event do CHÍNH instance
// này phát (đã broadcast local trực tiếp) → không double-deliver, không loop
// (handler KHÔNG re-publish).
function _onCrossInstance(payloadStr) {
    let p;
    try {
        p = JSON.parse(payloadStr);
    } catch {
        return;
    }
    _crossStats.received++;
    _crossStats.lastRecvAt = Date.now();
    if (!p || p.origin === BOOT_ID) return; // self → đã broadcast local trực tiếp
    _crossStats.deliveredFromPeers++;
    try {
        // fromPeer=true → _localNotify im lặng khi 0 subscriber (xem _localNotify).
        if (p.kind === 'wildcard') _localNotifyWildcard(p.key, p.data, p.eventType);
        else if (p.kind === 'broadcast') _localBroadcast(p.data, p.eventType);
        else _localNotify(p.key, p.data, p.eventType, true);
    } catch (e) {
        console.warn('[SSE-WEB2] _onCrossInstance deliver fail:', e.message);
    }
}

async function _ensureInstanceTable() {
    if (!_crossPool) return;
    await _crossPool.query(`
        CREATE TABLE IF NOT EXISTS web2_sse_instances (
            boot_id            TEXT PRIMARY KEY,
            render_instance_id TEXT,
            started_at         BIGINT,
            last_seen          BIGINT
        )
    `);
}

// Heartbeat 30s: upsert dòng của instance này + prune stale + cảnh báo nếu >1
// instance sống (hub in-RAM/process — multi-instance chỉ an toàn khi fan-out chạy).
async function _heartbeat() {
    if (!_crossPool || _shuttingDown) return;
    const now = Date.now();
    try {
        await _crossPool.query(
            `INSERT INTO web2_sse_instances (boot_id, render_instance_id, started_at, last_seen)
             VALUES ($1, $2, $3, $3)
             ON CONFLICT (boot_id) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
            [BOOT_ID, process.env.RENDER_INSTANCE_ID || null, now]
        );
        await _crossPool.query('DELETE FROM web2_sse_instances WHERE last_seen < $1', [
            now - 120000,
        ]);
        const r = await _crossPool.query(
            'SELECT COUNT(*)::int AS n FROM web2_sse_instances WHERE last_seen > $1',
            [now - 90000]
        );
        const live = (r.rows[0] && r.rows[0].n) || 1;
        if (live > 1) {
            console.warn(
                `[SSE-WEB2] ⚠ MULTI-INSTANCE: ${live} web2-api instances live. ` +
                    `Hub in-RAM/process → fan-out LISTEN/NOTIFY ${_listenClient ? 'ACTIVE ✓' : '⚠ KHÔNG ACTIVE (realtime sẽ rớt — kiểm tra LISTEN connection!)'}.`
            );
        }
    } catch (e) {
        /* heartbeat lỗi KHÔNG được làm chết SSE */
    }
    // Liveness ping LISTEN client: connection mostly-idle (chỉ chờ NOTIFY) → nếu
    // half-open (TCP chết im) sẽ không tự biết tới event kế. SELECT 1 lỗi → error
    // handler fire → reconnect. (keepAlive TCP cũng giúp, đây là belt-and-suspenders.)
    if (_listenClient) {
        _listenClient.query('SELECT 1').catch(() => {
            /* error handler của client lo reconnect */
        });
    }
}

// 1 timer reconnect DUY NHẤT — chống double-schedule (catch + 'end' listener cùng
// gọi cho 1 lần connect-fail → trước đây sinh 2 timer → khuếch đại khi web2Db sập).
function _scheduleListenReconnect() {
    if (_shuttingDown || _listenReconnectTimer) return;
    _listenReconnectTimer = setTimeout(() => {
        _listenReconnectTimer = null;
        _connectListen();
    }, 3000);
    if (_listenReconnectTimer.unref) _listenReconnectTimer.unref();
}

// Dedicated PgClient cho LISTEN (KHÔNG mượn pool — tránh idle-reap), tự reconnect.
// keepAlive + bỏ statement/idle timeout (connection long-lived chỉ chờ NOTIFY).
async function _connectListen() {
    if (!_crossPool || _shuttingDown) return;
    let client;
    try {
        client = new PgClient({
            ...(_crossPool.options || {}),
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
            statement_timeout: 0,
            idle_in_transaction_session_timeout: 0,
            application_name: 'web2-sse-listen',
        });
        client._lost = false;
        const onLost = (err) => {
            if (client._lost) return;
            client._lost = true;
            if (err) console.warn('[SSE-WEB2] LISTEN connection lost:', err.message);
            if (_listenClient === client) _listenClient = null;
            try {
                client.removeAllListeners();
            } catch {}
            try {
                client.end();
            } catch {}
            _scheduleListenReconnect();
        };
        client.on('error', onLost);
        client.on('end', () => onLost());
        client.on('notification', (msg) => {
            if (msg && msg.channel === PG_CHANNEL) _onCrossInstance(msg.payload);
        });
        await client.connect();
        await client.query(`LISTEN ${PG_CHANNEL}`);
        _listenClient = client;
        console.log(
            `[SSE-WEB2] cross-instance LISTEN/NOTIFY active (boot=${BOOT_ID}, channel=${PG_CHANNEL})`
        );
    } catch (e) {
        console.warn('[SSE-WEB2] LISTEN connect fail (retry 3s):', e.message);
        try {
            client && client.end();
        } catch {}
        _scheduleListenReconnect();
    }
}

// Gọi từ server.js sau khi có web2Db pool. An toàn nếu pool null hoặc pg lỗi:
// cross-instance tắt, SSE single-instance vẫn chạy bình thường qua broadcast local.
function initCrossInstance(pool) {
    if (process.env.WEB2_SSE_NO_CROSS === '1') {
        console.log('[SSE-WEB2] WEB2_SSE_NO_CROSS=1 → cross-instance fan-out DISABLED');
        return;
    }
    if (!pool) {
        console.warn(
            '[SSE-WEB2] initCrossInstance: no pool → cross-instance fan-out DISABLED (single-instance OK)'
        );
        return;
    }
    _crossPool = pool;
    _pgNotify = (payloadStr) => {
        // Ưu tiên publish qua dedicated LISTEN client (1 connection vừa LISTEN vừa
        // NOTIFY được) → KHÔNG checkout pool mỗi notify (tránh pool churn lúc /ingest
        // bắn dồn). LISTEN client đang reconnect (null) → fallback pool. Fire-and-forget.
        const c = _listenClient;
        const run = c
            ? c.query('SELECT pg_notify($1, $2)', [PG_CHANNEL, payloadStr])
            : pool.query('SELECT pg_notify($1, $2)', [PG_CHANNEL, payloadStr]);
        Promise.resolve(run).catch((e) => console.warn('[SSE-WEB2] pg_notify fail:', e.message));
    };
    _ensureInstanceTable()
        .then(() => _heartbeat())
        .then(() => {
            _heartbeatTimer = setInterval(_heartbeat, 30000);
            if (_heartbeatTimer.unref) _heartbeatTimer.unref();
        })
        .catch((e) => console.warn('[SSE-WEB2] instance registry init fail:', e.message));
    _connectListen();
}

// Graceful shutdown (Render SIGTERM lúc deploy): đóng SSE sạch để client reconnect
// NHANH sang instance mới (EventSource auto-reconnect → bridge resync re-fetch) →
// giảm cửa sổ mất event lúc rolling-deploy. Gỡ heartbeat + LISTEN + xoá dòng registry.
function gracefulClose() {
    if (_shuttingDown) return;
    _shuttingDown = true;
    let n = 0;
    try {
        sseClients.forEach((clients) => {
            clients.forEach((client) => {
                try {
                    client.write(`event: reconnect\n`);
                    client.write(
                        `data: ${JSON.stringify({ reason: 'shutdown', bootId: BOOT_ID, ts: Date.now() })}\n\n`
                    );
                    client.end();
                    n++;
                } catch {}
            });
        });
    } catch {}
    console.log(
        `[SSE-WEB2] graceful shutdown: đóng ${n} SSE connection (client reconnect sang instance mới)`
    );
    try {
        if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    } catch {}
    try {
        if (_listenClient) _listenClient.end();
    } catch {}
    try {
        if (_crossPool)
            _crossPool
                .query('DELETE FROM web2_sse_instances WHERE boot_id = $1', [BOOT_ID])
                .catch(() => {});
    } catch {}
}
process.once('SIGTERM', gracefulClose);
process.once('SIGINT', gracefulClose);

// =====================================================
// EXPORTS
// =====================================================

router.notifyClients = notifyClients;
router.notifyClientsWildcard = notifyClientsWildcard;
router.broadcastToAll = broadcastToAll;
router.getConnectionStats = getConnectionStats;
router.setForwardTarget = setForwardTarget; // cross-instance forward (fallback → web2-api)
router.initCrossInstance = initCrossInstance; // Postgres LISTEN/NOTIFY fan-out (web2-api ↔ web2-api)
router.gracefulClose = gracefulClose;
router.BOOT_ID = BOOT_ID;

module.exports = router;
