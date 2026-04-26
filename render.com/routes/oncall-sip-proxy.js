// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// OnCallCX SIP Signaling Proxy
// Bridges WebSocket (from browser JsSIP) ↔ SIP UDP (to PBX)
// Audio flows directly Browser ↔ TURN ↔ PBX (not through this server)

const dgram = require('dgram');
const { URL } = require('url');

const MODULE = '[ONCALL-SIP]';

// PBX Configuration
const PBX_HOST = process.env.ONCALL_PBX_HOST || 'pbx-ucaas.oncallcx.vn';
const PBX_PORT = parseInt(process.env.ONCALL_PBX_PORT || '9060', 10);

// Track active WebSocket ↔ UDP socket pairs
const activeSessions = new Map();

// Debug log — recent SIP messages (ring buffer)
const sipDebugLog = [];
const MAX_DEBUG_LOG = 50;
function logSip(direction, msg) {
    const firstLine = msg.split('\r\n')[0] || msg.substring(0, 80);
    const entry = {
        time: new Date().toISOString(),
        dir: direction,
        first: firstLine,
        full: msg.substring(0, 2000)
    };
    sipDebugLog.push(entry);
    if (sipDebugLog.length > MAX_DEBUG_LOG) sipDebugLog.shift();
}

/**
 * Attach OnCallCX SIP proxy to existing WebSocket server
 * Filters connections by URL path: /api/oncall/ws
 */
function attachSipProxy(server) {
    const WebSocket = require('ws');

    // Create a separate WSS for SIP proxy on same HTTP server
    const sipWss = new WebSocket.Server({ noServer: true });

    // Handle upgrade requests — route /api/oncall/ws to SIP proxy
    server.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

        if (pathname === '/api/oncall/ws') {
            sipWss.handleUpgrade(request, socket, head, (ws) => {
                sipWss.emit('connection', ws, request);
            });
        }
        // Other WebSocket paths handled by existing wss (default behavior)
    });

    sipWss.on('connection', (ws, req) => {
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        console.log(`${MODULE} Browser connected from ${clientIp}`);

        // Create UDP socket for this browser session → PBX communication
        const udpSocket = dgram.createSocket('udp4');
        const sessionId = `sip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        activeSessions.set(sessionId, { ws, udpSocket, clientIp });

        // Track original Via info for response rewriting (branch → full Via)
        const viaMap = new Map();
        let invalidDomain = ''; // e.g. "0rfh8om8idcd.invalid"

        // UDP socket receives SIP responses from PBX → rewrite → forward to browser via WSS
        udpSocket.on('message', (msg, rinfo) => {
            const sipResponse = msg.toString('utf8');
            console.log(`${MODULE} ← PBX (${rinfo.address}:${rinfo.port}): ${getFirstLine(sipResponse)}`);

            logSip('← PBX', sipResponse);

            // Rewrite response: UDP → WSS (so JsSIP can match it)
            const rewrittenResponse = rewriteSipForWSS(sipResponse, viaMap, invalidDomain);
            logSip('← PBX (rewritten)', rewrittenResponse);

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(rewrittenResponse);
            }
        });

        udpSocket.on('error', (err) => {
            console.error(`${MODULE} UDP error [${sessionId}]:`, err.message);
        });

        // Bind UDP socket to ephemeral port
        udpSocket.bind(0, () => {
            const addr = udpSocket.address();
            console.log(`${MODULE} UDP socket bound to ${addr.address}:${addr.port} for session ${sessionId}`);
        });

        // Browser sends SIP messages via WSS → forward to PBX via UDP
        ws.on('message', (data) => {
            const sipMessage = data.toString('utf8');
            const firstLine = getFirstLine(sipMessage);
            console.log(`${MODULE} → PBX: ${firstLine}`);

            // Save original Via keyed by branch for response matching
            const viaMatch = sipMessage.match(/Via:\s*([^\r\n]+)/i);
            if (viaMatch) {
                const fullVia = viaMatch[1].trim();
                const branchMatch = fullVia.match(/branch=([^\s;,]+)/i);
                if (branchMatch) {
                    viaMap.set(branchMatch[1], fullVia);
                    // Keep map small — remove old entries
                    if (viaMap.size > 20) {
                        const oldest = viaMap.keys().next().value;
                        viaMap.delete(oldest);
                    }
                }
                // Extract .invalid domain for this session
                const domainMatch = fullVia.match(/([a-z0-9]+\.invalid)/i);
                if (domainMatch) invalidDomain = domainMatch[1];
            }

            logSip('→ Browser RAW', sipMessage);
            const rewritten = rewriteSipForUDP(sipMessage, udpSocket);
            logSip('→ PBX (rewritten)', rewritten);

            // Log first 3 lines of rewritten SIP for debugging
            const lines = rewritten.split('\r\n').slice(0, 4);
            console.log(`${MODULE} Rewritten SIP:`, lines.join(' | '));

            const buffer = Buffer.from(rewritten, 'utf8');
            udpSocket.send(buffer, 0, buffer.length, PBX_PORT, PBX_HOST, (err) => {
                if (err) {
                    console.error(`${MODULE} UDP send error:`, err.message);
                } else {
                    console.log(`${MODULE} UDP sent ${buffer.length} bytes to ${PBX_HOST}:${PBX_PORT}`);
                }
            });
        });

        ws.on('close', () => {
            console.log(`${MODULE} Browser disconnected [${sessionId}]`);
            cleanup(sessionId);
        });

        ws.on('error', (err) => {
            console.error(`${MODULE} WebSocket error [${sessionId}]:`, err.message);
            cleanup(sessionId);
        });
    });

    console.log(`${MODULE} SIP proxy attached, listening on /api/oncall/ws`);
    console.log(`${MODULE} PBX target: ${PBX_HOST}:${PBX_PORT}`);

    return sipWss;
}

/**
 * Rewrite SIP headers for WSS→UDP proxy
 * - Via: WSS → UDP, replace .invalid domain, add rport
 * - Contact: replace ws transport with udp
 */
function rewriteSipForUDP(sipMessage, udpSocket) {
    let msg = sipMessage;

    // 1. Via: SIP/2.0/WSS ... → SIP/2.0/UDP with rport
    //    JsSIP sends: Via: SIP/2.0/WSS 19de78edhvof.invalid;branch=z9hG4bK...
    //    PBX needs:   Via: SIP/2.0/UDP {some-ip};rport;branch=z9hG4bK...
    msg = msg.replace(
        /Via:\s*SIP\/2\.0\/WSS?\s+[^\s;]+/gi,
        `Via: SIP/2.0/UDP ${PBX_HOST};rport`
    );

    // Ensure rport is present (PBX uses source IP:port to respond)
    if (msg.includes('Via: SIP/2.0/UDP') && !msg.includes('rport')) {
        msg = msg.replace(
            /Via:\s*SIP\/2\.0\/UDP\s+([^\r\n]+)/i,
            'Via: SIP/2.0/UDP $1;rport'
        );
    }

    // 2. Contact: replace transport=ws/wss with nothing (default = UDP)
    msg = msg.replace(/;transport=wss?/gi, '');

    // 3. Contact: replace .invalid domain with PBX domain
    msg = msg.replace(/[a-z0-9]+\.invalid/gi, PBX_HOST);

    return msg;
}

/**
 * Rewrite SIP response headers from PBX (UDP) back to WSS for JsSIP
 * JsSIP matches responses by Via branch — transport must match original
 */
function rewriteSipForWSS(sipResponse, viaMap, invalidDomain) {
    let msg = sipResponse;

    // Extract branch from PBX response Via to find matching original Via
    const branchMatch = msg.match(/Via:\s*SIP\/2\.0\/UDP\s+[^\r\n]*branch=([^\s;,\r\n]+)/i);
    if (branchMatch && viaMap.has(branchMatch[1])) {
        // Replace with exact original Via (preserves branch, domain, transport)
        const originalVia = viaMap.get(branchMatch[1]);
        msg = msg.replace(
            /Via:\s*SIP\/2\.0\/UDP\s+[^\r\n]+/i,
            `Via: ${originalVia}`
        );
    } else if (invalidDomain) {
        // Fallback: change transport back to WSS and restore .invalid domain
        msg = msg.replace(
            /Via:\s*SIP\/2\.0\/UDP\s+[^\s;]+/gi,
            `Via: SIP/2.0/WSS ${invalidDomain}`
        );
    } else {
        // Last resort: just change transport back to WSS
        msg = msg.replace(
            /Via:\s*SIP\/2\.0\/UDP/gi,
            'Via: SIP/2.0/WSS'
        );
    }

    return msg;
}

/**
 * Extract first line from SIP message for logging
 */
function getFirstLine(sipMessage) {
    const newline = sipMessage.indexOf('\r\n');
    if (newline > 0) return sipMessage.substring(0, Math.min(newline, 80));
    return sipMessage.substring(0, 80);
}

/**
 * Cleanup session resources
 */
function cleanup(sessionId) {
    const session = activeSessions.get(sessionId);
    if (session) {
        try { session.udpSocket.close(); } catch {}
        activeSessions.delete(sessionId);
        console.log(`${MODULE} Session ${sessionId} cleaned up. Active: ${activeSessions.size}`);
    }
}

/**
 * Express router for REST endpoints (health check, TURN config)
 */
function createRouter() {
    const express = require('express');
    const router = express.Router();

    // Health check
    router.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            pbx: `${PBX_HOST}:${PBX_PORT}`,
            activeSessions: activeSessions.size
        });
    });

    // Debug: recent SIP messages
    router.get('/debug', (req, res) => {
        res.json({
            total: sipDebugLog.length,
            messages: sipDebugLog.slice(-30)
        });
    });

    // TURN server configuration (served to browser)
    // Strategy: fetch directly from metered.live API using TURN_API_KEY (multiple URLs +
    // fresh credentials + TCP/443 fallback). Cache 30 min in-memory. Fallback xuống env vars
    // (TURN_URL/TURN_USERNAME/TURN_CREDENTIAL) hoặc STUN-only nếu cả 2 đều thiếu.
    let _meteredCache = null; // { iceServers, fetchedAt }
    const _METERED_TTL_MS = 30 * 60 * 1000; // 30 min

    async function _fetchMeteredIceServers() {
        const apiKey = process.env.TURN_API_KEY;
        const domain = process.env.TURN_DOMAIN || 'n2store.metered.live';
        if (!apiKey) return null;
        if (
            _meteredCache &&
            Date.now() - _meteredCache.fetchedAt < _METERED_TTL_MS
        ) {
            return _meteredCache.iceServers;
        }
        try {
            const url = `https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`;
            const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!r.ok) return null;
            const data = await r.json();
            if (!Array.isArray(data) || data.length === 0) return null;
            const iceServers = [
                { urls: 'stun:stun.l.google.com:19302' },
                ...data,
            ];
            _meteredCache = { iceServers, fetchedAt: Date.now() };
            return iceServers;
        } catch (e) {
            console.warn('[turn-config] metered fetch failed:', e.message);
            return null;
        }
    }

    router.get('/turn-config', async (req, res) => {
        // Try metered.live first
        const metered = await _fetchMeteredIceServers();
        if (metered) return res.json({ iceServers: metered });

        // Fallback to env-configured single TURN
        const turnUrl = process.env.TURN_URL || '';
        const turnUsername = process.env.TURN_USERNAME || '';
        const turnCredential = process.env.TURN_CREDENTIAL || '';

        if (!turnUrl) {
            return res.json({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });
        }

        res.json({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: turnUrl, username: turnUsername, credential: turnCredential },
                { urls: turnUrl.replace('turn:', 'turns:') + '?transport=tcp', username: turnUsername, credential: turnCredential }
            ]
        });
    });

    // SIP credentials endpoint (protected, served to extension)
    router.get('/sip-config', (req, res) => {
        const apiKey = req.headers['x-api-key'] || req.query.key;
        if (apiKey !== process.env.CLIENT_API_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        res.json({
            server: PBX_HOST,
            port: PBX_PORT,
            wsUrl: `wss://${req.headers.host}/api/oncall/ws`,
            extension: process.env.ONCALL_SIP_EXTENSION || '101',
            authId: process.env.ONCALL_SIP_AUTH_ID || '',
        });
    });

    // === PHONE CONFIG (shared across all clients) ===

    // GET /api/oncall/phone-config — load all config for phone widget
    router.get('/phone-config', async (req, res) => {
        try {
            const db = req.app.locals.chatDb;
            const result = await db.query('SELECT key, value FROM phone_config');
            const config = {};
            for (const row of result.rows) {
                config[row.key] = row.value;
            }
            res.json({ success: true, config });
        } catch (err) {
            console.error(`${MODULE} phone-config GET error:`, err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // PUT /api/oncall/phone-config — update a config key
    router.put('/phone-config', async (req, res) => {
        try {
            const { key, value } = req.body;
            if (!key || value === undefined) {
                return res.status(400).json({ success: false, error: 'key and value required' });
            }
            const db = req.app.locals.chatDb;
            await db.query(
                `INSERT INTO phone_config (key, value, updated_at) VALUES ($1, $2, NOW())
                 ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
                [key, JSON.stringify(value)]
            );
            res.json({ success: true });
        } catch (err) {
            console.error(`${MODULE} phone-config PUT error:`, err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ==============================================================
    // PHONE MANAGEMENT DATA ENDPOINTS (migrated from Firestore)
    // Tables: phone_ext_assignments, phone_call_history, phone_presence,
    //         phone_audit_log, phone_contacts
    // ==============================================================

    // --- EXT ASSIGNMENTS ---
    router.get('/ext-assignments', async (req, res) => {
        try {
            const db = req.app.locals.chatDb;
            const r = await db.query('SELECT username, ext, assigned_by, assigned_at, updated_at FROM phone_ext_assignments ORDER BY username');
            const map = {};
            r.rows.forEach(row => { map[row.username] = row.ext; });
            res.json({ success: true, assignments: map, rows: r.rows });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.put('/ext-assignments/:username', async (req, res) => {
        try {
            const username = decodeURIComponent(req.params.username);
            const { ext, assigned_by } = req.body || {};
            const db = req.app.locals.chatDb;
            if (!ext) {
                await db.query('DELETE FROM phone_ext_assignments WHERE username = $1', [username]);
            } else {
                await db.query(
                    `INSERT INTO phone_ext_assignments (username, ext, assigned_by, assigned_at, updated_at)
                     VALUES ($1, $2, $3, NOW(), NOW())
                     ON CONFLICT (username) DO UPDATE SET ext = $2, assigned_by = COALESCE($3, phone_ext_assignments.assigned_by), updated_at = NOW()`,
                    [username, String(ext), assigned_by || null]
                );
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.delete('/ext-assignments/:username', async (req, res) => {
        try {
            const username = decodeURIComponent(req.params.username);
            await req.app.locals.chatDb.query('DELETE FROM phone_ext_assignments WHERE username = $1', [username]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // --- CALL HISTORY ---
    router.post('/call-history', async (req, res) => {
        try {
            const b = req.body || {};
            if (!b.phone || !b.direction) return res.status(400).json({ success: false, error: 'phone and direction required' });
            const db = req.app.locals.chatDb;
            const r = await db.query(
                `INSERT INTO phone_call_history
                 (username, ext, phone, name, direction, duration, order_code, outcome, note, timestamp)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 RETURNING id`,
                [
                    b.username || '',
                    b.ext || null,
                    String(b.phone || ''),
                    b.name || null,
                    String(b.direction),
                    parseInt(b.duration || 0, 10) || 0,
                    b.orderCode || b.order_code || null,
                    b.outcome || null,
                    b.note || null,
                    b.timestamp || Date.now()
                ]
            );
            res.json({ success: true, id: r.rows[0].id });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.get('/call-history', async (req, res) => {
        try {
            const { from, to, direction, username, phone, ext, limit } = req.query;
            const conds = []; const params = []; let idx = 1;
            if (from) { conds.push(`timestamp >= $${idx++}`); params.push(parseInt(from, 10)); }
            if (to) { conds.push(`timestamp < $${idx++}`); params.push(parseInt(to, 10)); }
            if (direction) { conds.push(`direction = $${idx++}`); params.push(direction); }
            if (username) { conds.push(`username = $${idx++}`); params.push(username); }
            if (ext) { conds.push(`ext = $${idx++}`); params.push(ext); }
            if (phone) { conds.push(`phone ILIKE $${idx++}`); params.push('%' + phone + '%'); }
            const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
            const max = Math.min(parseInt(limit || '500', 10) || 500, 5000);
            const r = await req.app.locals.chatDb.query(
                `SELECT id, username, ext, phone, name, direction, duration, order_code, outcome, note, timestamp
                 FROM phone_call_history ${where} ORDER BY timestamp DESC LIMIT ${max}`,
                params
            );
            res.json({ success: true, rows: r.rows });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.patch('/call-history/:id', async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { outcome, note } = req.body || {};
            if (!id) return res.status(400).json({ success: false, error: 'id required' });
            await req.app.locals.chatDb.query(
                `UPDATE phone_call_history SET outcome = COALESCE($2, outcome), note = COALESCE($3, note) WHERE id = $1`,
                [id, outcome || null, note || null]
            );
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Update most recent call for a user+phone (used by outcome prompt)
    router.patch('/call-history', async (req, res) => {
        try {
            const { username, phone, outcome, note } = req.body || {};
            if (!username || !phone) return res.status(400).json({ success: false, error: 'username and phone required' });
            await req.app.locals.chatDb.query(
                `UPDATE phone_call_history
                 SET outcome = COALESCE($3, outcome), note = COALESCE($4, note)
                 WHERE id = (SELECT id FROM phone_call_history WHERE username = $1 AND phone = $2 ORDER BY timestamp DESC LIMIT 1)`,
                [username, phone, outcome || null, note || null]
            );
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Stats: counts per day
    router.get('/call-history/stats', async (req, res) => {
        try {
            const days = Math.min(parseInt(req.query.days || '30', 10), 365);
            const since = Date.now() - days * 86400000;
            const r = await req.app.locals.chatDb.query(
                `SELECT direction, COUNT(*) AS count, COALESCE(AVG(duration),0)::int AS avg_duration
                 FROM phone_call_history WHERE timestamp >= $1 GROUP BY direction`,
                [since]
            );
            res.json({ success: true, rows: r.rows });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // --- PRESENCE ---
    router.get('/presence', async (req, res) => {
        try {
            const r = await req.app.locals.chatDb.query(
                `SELECT username, state, ext, call_phone, call_name, direction, since, updated_at
                 FROM phone_presence ORDER BY updated_at DESC`
            );
            res.json({ success: true, rows: r.rows });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/presence', async (req, res) => {
        try {
            const b = req.body || {};
            if (!b.username || !b.state) return res.status(400).json({ success: false, error: 'username and state required' });
            await req.app.locals.chatDb.query(
                `INSERT INTO phone_presence (username, state, ext, call_phone, call_name, direction, since, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
                 ON CONFLICT (username) DO UPDATE SET
                     state = $2, ext = $3, call_phone = $4, call_name = $5, direction = $6, since = $7, updated_at = NOW()`,
                [b.username, b.state, b.ext || null, b.callPhone || b.call_phone || null, b.callName || b.call_name || null, b.direction || null, b.since || Date.now()]
            );
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // --- AUDIT LOG ---
    router.post('/audit-log', async (req, res) => {
        try {
            const b = req.body || {};
            if (!b.action) return res.status(400).json({ success: false, error: 'action required' });
            await req.app.locals.chatDb.query(
                `INSERT INTO phone_audit_log (username, action, detail, timestamp) VALUES ($1,$2,$3,$4)`,
                [b.username || '', b.action, b.detail || {}, b.timestamp || Date.now()]
            );
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.get('/audit-log', async (req, res) => {
        try {
            const { action, limit } = req.query;
            const conds = []; const params = []; let idx = 1;
            if (action) { conds.push(`action = $${idx++}`); params.push(action); }
            const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
            const max = Math.min(parseInt(limit || '200', 10), 2000);
            const r = await req.app.locals.chatDb.query(
                `SELECT id, username, action, detail, timestamp, created_at FROM phone_audit_log ${where}
                 ORDER BY timestamp DESC LIMIT ${max}`,
                params
            );
            res.json({ success: true, rows: r.rows });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // --- CONTACTS ---
    router.get('/contacts', async (req, res) => {
        try {
            const r = await req.app.locals.chatDb.query(
                `SELECT id, name, phone, tag, note, created_by, created_at FROM phone_contacts ORDER BY name`
            );
            res.json({ success: true, rows: r.rows });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/contacts', async (req, res) => {
        try {
            const b = req.body || {};
            if (!b.name || !b.phone) return res.status(400).json({ success: false, error: 'name and phone required' });
            const r = await req.app.locals.chatDb.query(
                `INSERT INTO phone_contacts (name, phone, tag, note, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
                [b.name, String(b.phone).replace(/[^\d+]/g, ''), b.tag || null, b.note || null, b.created_by || null]
            );
            res.json({ success: true, id: r.rows[0].id });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.delete('/contacts/:id', async (req, res) => {
        try {
            await req.app.locals.chatDb.query('DELETE FROM phone_contacts WHERE id = $1', [parseInt(req.params.id, 10)]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // --- CALL RECORDINGS (auto-uploaded from browser MediaRecorder) ---
    // Tất cả cuộc gọi đều được tự động thu âm và upload lên đây
    router.post('/call-recordings', async (req, res) => {
        try {
            const b = req.body || {};
            if (!b.phone || !b.audio_b64) {
                return res.status(400).json({ success: false, error: 'phone and audio_b64 required' });
            }
            const audioBuf = Buffer.from(String(b.audio_b64), 'base64');
            if (!audioBuf.length) return res.status(400).json({ success: false, error: 'empty audio' });
            const db = req.app.locals.chatDb;
            const r = await db.query(
                `INSERT INTO phone_call_recordings
                 (call_history_id, username, ext, phone, name, direction, order_code, duration, mime_type, size_bytes, audio, timestamp)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 RETURNING id`,
                [
                    b.call_history_id ? parseInt(b.call_history_id, 10) : null,
                    b.username || '',
                    b.ext || null,
                    String(b.phone || ''),
                    b.name || null,
                    b.direction || 'out',
                    b.orderCode || b.order_code || null,
                    parseInt(b.duration || 0, 10) || 0,
                    b.mime_type || b.mimeType || 'audio/webm',
                    audioBuf.length,
                    audioBuf,
                    b.timestamp || Date.now()
                ]
            );
            res.json({ success: true, id: r.rows[0].id, size: audioBuf.length });
        } catch (err) {
            console.error(`${MODULE} call-recordings POST error:`, err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.get('/call-recordings', async (req, res) => {
        try {
            const { from, to, username, phone, ext, limit } = req.query;
            const conds = []; const params = []; let idx = 1;
            if (from) { conds.push(`timestamp >= $${idx++}`); params.push(parseInt(from, 10)); }
            if (to) { conds.push(`timestamp < $${idx++}`); params.push(parseInt(to, 10)); }
            if (username) { conds.push(`username = $${idx++}`); params.push(username); }
            if (ext) { conds.push(`ext = $${idx++}`); params.push(ext); }
            if (phone) { conds.push(`phone ILIKE $${idx++}`); params.push('%' + phone + '%'); }
            const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
            const max = Math.min(parseInt(limit || '500', 10) || 500, 5000);
            const r = await req.app.locals.chatDb.query(
                `SELECT id, call_history_id, username, ext, phone, name, direction, order_code,
                        duration, mime_type, size_bytes, timestamp, created_at
                 FROM phone_call_recordings ${where}
                 ORDER BY timestamp DESC LIMIT ${max}`,
                params
            );
            res.json({ success: true, rows: r.rows });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Stream audio bytes for playback / download
    router.get('/call-recordings/:id/audio', async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (!id) return res.status(400).send('bad id');
            const r = await req.app.locals.chatDb.query(
                `SELECT audio, mime_type, phone, size_bytes FROM phone_call_recordings WHERE id = $1`,
                [id]
            );
            const row = r.rows[0];
            if (!row || !row.audio) return res.status(404).send('not found');
            res.setHeader('Content-Type', row.mime_type || 'audio/webm');
            res.setHeader('Content-Length', String(row.size_bytes || row.audio.length));
            res.setHeader('Content-Disposition',
                `inline; filename="call-${id}-${(row.phone || 'unknown').replace(/[^0-9+]/g, '')}.webm"`);
            res.setHeader('Cache-Control', 'private, max-age=300');
            res.end(row.audio);
        } catch (err) {
            console.error(`${MODULE} call-recordings audio error:`, err.message);
            res.status(500).send(err.message);
        }
    });

    router.delete('/call-recordings/:id', async (req, res) => {
        try {
            await req.app.locals.chatDb.query(
                'DELETE FROM phone_call_recordings WHERE id = $1',
                [parseInt(req.params.id, 10)]
            );
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // One-shot backfill: sửa phone cho recordings đã sync bằng daemon trước khi
    // fix — nó lưu số line công ty (outboundPublicNumber) vào cột phone thay vì
    // số khách (call.to). Ghép recording ↔ call-history qua (ext, timestamp ±30s,
    // direction) rồi copy phone đúng + set call_history_id.
    // Body: { dryRun?: bool, toleranceMs?: number } — default dryRun=false, 30000ms.
    router.post('/call-recordings/remap-phones', async (req, res) => {
        try {
            const db = req.app.locals.chatDb;
            const tolerance = Math.max(
                1000,
                parseInt(req.body?.toleranceMs, 10) || 30000
            );
            const dryRun = !!req.body?.dryRun;

            // Chỉ sửa recording từ sync daemon — recording từ browser MediaRecorder
            // (CSKH etc) có phone đúng từ đầu.
            const candidates = await db.query(
                `SELECT r.id, r.phone AS rec_phone, r.ext, r.direction,
                        r.timestamp AS rec_ts, r.call_history_id
                 FROM phone_call_recordings r
                 WHERE r.username = 'oncallcx-portal-sync'`
            );

            const results = [];
            let updated = 0,
                skipped = 0;
            for (const row of candidates.rows) {
                const matchQ = await db.query(
                    `SELECT id, phone FROM phone_call_history
                     WHERE ext = $1 AND direction = $2
                       AND ABS(timestamp - $3) < $4
                     ORDER BY ABS(timestamp - $3) ASC
                     LIMIT 1`,
                    [row.ext, row.direction, row.rec_ts, tolerance]
                );
                const hit = matchQ.rows[0];
                if (!hit) {
                    skipped++;
                    continue;
                }
                if (hit.phone === row.rec_phone && row.call_history_id === hit.id) {
                    skipped++;
                    continue;
                }
                results.push({
                    id: row.id,
                    oldPhone: row.rec_phone,
                    newPhone: hit.phone,
                    callHistoryId: hit.id,
                });
                if (!dryRun) {
                    await db.query(
                        `UPDATE phone_call_recordings
                         SET phone = $1, call_history_id = $2
                         WHERE id = $3`,
                        [hit.phone, hit.id, row.id]
                    );
                    updated++;
                }
            }
            res.json({
                success: true,
                dryRun,
                scanned: candidates.rows.length,
                changes: results.length,
                updated,
                skipped,
                sample: results.slice(0, 20),
            });
        } catch (err) {
            console.error(`${MODULE} remap-phones error:`, err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // --- AUTO-REGISTER LOCK (singleton: chỉ 1 máy giữ lock cùng lúc) ---
    const LOCK_EXPIRY_MS = 90000; // 90s không heartbeat → hết hạn

    router.get('/auto-register-lock', async (req, res) => {
        try {
            const r = await req.app.locals.chatDb.query(
                'SELECT holder_user, holder_session, holder_device, last_heartbeat, started_at, updated_at FROM phone_auto_register_lock WHERE id = 1'
            );
            const row = r.rows[0] || {};
            const now = Date.now();
            const expired = !row.last_heartbeat || (now - parseInt(row.last_heartbeat, 10)) > LOCK_EXPIRY_MS;
            res.json({
                success: true,
                locked: !!row.holder_session && !expired,
                expired,
                holder_user: row.holder_user || null,
                holder_session: row.holder_session || null,
                holder_device: row.holder_device || null,
                last_heartbeat: row.last_heartbeat ? parseInt(row.last_heartbeat, 10) : null,
                started_at: row.started_at ? parseInt(row.started_at, 10) : null
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/auto-register-lock', async (req, res) => {
        try {
            const { session, user, device, force } = req.body || {};
            if (!session) return res.status(400).json({ success: false, error: 'session required' });
            const db = req.app.locals.chatDb;
            const r = await db.query('SELECT holder_session, last_heartbeat FROM phone_auto_register_lock WHERE id = 1');
            const row = r.rows[0] || {};
            const now = Date.now();
            const expired = !row.last_heartbeat || (now - parseInt(row.last_heartbeat || 0, 10)) > LOCK_EXPIRY_MS;
            // Refuse if someone else holds a valid (non-expired) lock unless force
            if (row.holder_session && row.holder_session !== session && !expired && !force) {
                return res.status(409).json({ success: false, error: 'locked_by_other', holder_user: row.holder_user, holder_device: row.holder_device });
            }
            await db.query(
                `UPDATE phone_auto_register_lock
                 SET holder_user = $1, holder_session = $2, holder_device = $3,
                     last_heartbeat = $4, started_at = COALESCE(started_at, $4), updated_at = NOW()
                 WHERE id = 1`,
                [user || null, session, device || null, now]
            );
            // If we force-took, signal previous holder (they will poll and see they no longer hold)
            res.json({ success: true, taken: true, forced: !!force && row.holder_session && row.holder_session !== session });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/auto-register-lock/heartbeat', async (req, res) => {
        try {
            const { session } = req.body || {};
            if (!session) return res.status(400).json({ success: false, error: 'session required' });
            const db = req.app.locals.chatDb;
            const r = await db.query(
                `UPDATE phone_auto_register_lock SET last_heartbeat = $1, updated_at = NOW()
                 WHERE id = 1 AND holder_session = $2`,
                [Date.now(), session]
            );
            if (r.rowCount === 0) return res.json({ success: false, lost: true });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // --- SERVER-SIDE SIP REGISTRAR (handoff: giữ ext khi không có browser) ---
    router.get('/server-registrar', async (req, res) => {
        try {
            const ctl = req.app.locals.sipRegController;
            if (!ctl) return res.json({ success: false, error: 'not_initialized' });
            res.json({ success: true, ...ctl.getStatus() });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/server-registrar/start', async (req, res) => {
        try {
            const ctl = req.app.locals.sipRegController;
            if (!ctl) return res.status(500).json({ success: false, error: 'not_initialized' });
            await ctl.start();
            res.json({ success: true, ...ctl.getStatus() });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/server-registrar/stop', async (req, res) => {
        try {
            const ctl = req.app.locals.sipRegController;
            if (!ctl) return res.status(500).json({ success: false, error: 'not_initialized' });
            await ctl.stop();
            res.json({ success: true, ...ctl.getStatus() });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.delete('/auto-register-lock', async (req, res) => {
        try {
            const { session } = req.body || {};
            if (!session) return res.status(400).json({ success: false, error: 'session required' });
            const db = req.app.locals.chatDb;
            const r = await db.query(
                `UPDATE phone_auto_register_lock
                 SET holder_user = NULL, holder_session = NULL, holder_device = NULL,
                     last_heartbeat = NULL, started_at = NULL, updated_at = NOW()
                 WHERE id = 1 AND holder_session = $1`,
                [session]
            );
            res.json({ success: true, released: r.rowCount > 0 });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // =====================================================
    // ONCALLCX PORTAL — KHÔNG khả dụng từ Render
    //
    // Portal pbx-ucaas.oncallcx.vn chỉ chấp nhận IP Vietnam consumer ISP.
    // Render SG + CF Worker (datacenter IPs) bị chặn ở tầng TCP.
    // Giải pháp: local sync daemon trên máy admin (scripts/oncallcx-sync-daemon.js)
    // → POST tới /api/oncall/call-recordings với username=oncallcx-portal-sync.
    // =====================================================
    router.all('/portal/*', (req, res) => {
        res.status(410).json({
            success: false,
            error: 'OnCallCX portal proxy not available from Render — GeoIP blocked',
            hint: 'Run local sync daemon: bash scripts/install-oncallcx-sync.sh',
            docs: 'docs/oncallcx/README.md',
        });
    });

    return router;
}

// Auto-run migration once DB is ready — idempotent (CREATE TABLE IF NOT EXISTS)
async function ensurePhoneManagementTables(pool) {
    if (!pool) return;
    const sql = `
        CREATE TABLE IF NOT EXISTS phone_ext_assignments (
            username VARCHAR(255) PRIMARY KEY,
            ext VARCHAR(20) NOT NULL,
            assigned_by VARCHAR(255),
            assigned_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_phone_ext_assignments_ext ON phone_ext_assignments(ext);
        CREATE TABLE IF NOT EXISTS phone_call_history (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            ext VARCHAR(20),
            phone VARCHAR(30) NOT NULL,
            name VARCHAR(255),
            direction VARCHAR(10) NOT NULL,
            duration INTEGER DEFAULT 0,
            order_code VARCHAR(50),
            outcome VARCHAR(50),
            note TEXT,
            timestamp BIGINT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_phone_call_history_username_ts ON phone_call_history(username, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_phone_call_history_phone_ts ON phone_call_history(phone, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_phone_call_history_timestamp ON phone_call_history(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_phone_call_history_direction ON phone_call_history(direction);
        CREATE INDEX IF NOT EXISTS idx_phone_call_history_ext ON phone_call_history(ext);
        CREATE TABLE IF NOT EXISTS phone_presence (
            username VARCHAR(255) PRIMARY KEY,
            state VARCHAR(20) NOT NULL,
            ext VARCHAR(20),
            call_phone VARCHAR(30),
            call_name VARCHAR(255),
            direction VARCHAR(10),
            since BIGINT,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_phone_presence_state ON phone_presence(state);
        CREATE INDEX IF NOT EXISTS idx_phone_presence_updated ON phone_presence(updated_at DESC);
        CREATE TABLE IF NOT EXISTS phone_audit_log (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            action VARCHAR(50) NOT NULL,
            detail JSONB,
            timestamp BIGINT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_phone_audit_log_username ON phone_audit_log(username);
        CREATE INDEX IF NOT EXISTS idx_phone_audit_log_action ON phone_audit_log(action);
        CREATE INDEX IF NOT EXISTS idx_phone_audit_log_timestamp ON phone_audit_log(timestamp DESC);
        CREATE TABLE IF NOT EXISTS phone_contacts (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(30) NOT NULL,
            tag VARCHAR(100),
            note TEXT,
            created_by VARCHAR(255),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_phone_contacts_phone ON phone_contacts(phone);
        CREATE INDEX IF NOT EXISTS idx_phone_contacts_name ON phone_contacts(name);

        -- Call recordings: lưu audio blob + metadata, auto-uploaded mỗi khi kết thúc cuộc gọi
        CREATE TABLE IF NOT EXISTS phone_call_recordings (
            id SERIAL PRIMARY KEY,
            call_history_id INTEGER,
            username VARCHAR(255),
            ext VARCHAR(20),
            phone VARCHAR(30) NOT NULL,
            name VARCHAR(255),
            direction VARCHAR(10),
            order_code VARCHAR(50),
            duration INTEGER DEFAULT 0,
            mime_type VARCHAR(80),
            size_bytes INTEGER,
            audio BYTEA,
            timestamp BIGINT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_phone_call_recordings_username_ts ON phone_call_recordings(username, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_phone_call_recordings_phone_ts ON phone_call_recordings(phone, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_phone_call_recordings_timestamp ON phone_call_recordings(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_phone_call_recordings_ext ON phone_call_recordings(ext);
        CREATE INDEX IF NOT EXISTS idx_phone_call_recordings_history_id ON phone_call_recordings(call_history_id);

        -- Lock singleton: chỉ 1 máy giữ lock auto-register 10 line tại 1 thời điểm
        CREATE TABLE IF NOT EXISTS phone_auto_register_lock (
            id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            holder_user VARCHAR(255),
            holder_session VARCHAR(64),
            holder_device VARCHAR(255),
            last_heartbeat BIGINT,
            started_at BIGINT,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        INSERT INTO phone_auto_register_lock (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    `;
    try {
        await pool.query(sql);
        console.log(`${MODULE} Phone management tables ensured`);
    } catch (err) {
        console.error(`${MODULE} Failed to ensure phone tables:`, err.message);
    }
}

module.exports = { attachSipProxy, createRouter, ensurePhoneManagementTables };
