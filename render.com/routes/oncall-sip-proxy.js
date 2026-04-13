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

        // UDP socket receives SIP responses from PBX → forward to browser via WSS
        udpSocket.on('message', (msg, rinfo) => {
            const sipResponse = msg.toString('utf8');
            console.log(`${MODULE} ← PBX (${rinfo.address}:${rinfo.port}): ${getFirstLine(sipResponse)}`);

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(sipResponse);
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

            // Rewrite Via header to include our UDP socket's address
            // (PBX needs to know where to send responses)
            const rewritten = rewriteViaHeader(sipMessage, udpSocket);

            const buffer = Buffer.from(rewritten, 'utf8');
            udpSocket.send(buffer, 0, buffer.length, PBX_PORT, PBX_HOST, (err) => {
                if (err) {
                    console.error(`${MODULE} UDP send error:`, err.message);
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
 * Rewrite SIP Via header to use the UDP socket's actual address
 * This ensures PBX sends responses back to our UDP socket
 */
function rewriteViaHeader(sipMessage, udpSocket) {
    // JsSIP sends Via with WebSocket transport. We need to keep it as-is
    // because the PBX needs to respond. The key is that our UDP socket
    // will receive the response and forward it back via WSS.
    //
    // For SIP-over-UDP, the PBX uses the source IP:port of the UDP packet
    // to send responses (rport mechanism). So we don't need to rewrite Via.
    //
    // However, if the SIP message has "transport=ws" in Via, the PBX won't
    // understand it. We need to change transport to UDP.
    return sipMessage.replace(
        /Via:\s*SIP\/2\.0\/WS/gi,
        'Via: SIP/2.0/UDP'
    );
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
