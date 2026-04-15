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
    router.get('/turn-config', (req, res) => {
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
            // Password NOT sent — stored in extension settings only
        });
    });

    return router;
}

module.exports = { attachSipProxy, createRouter };
