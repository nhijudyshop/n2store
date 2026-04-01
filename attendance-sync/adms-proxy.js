/**
 * ADMS Proxy Server
 * Receives push data from ZKTeco machine (HTTP) and forwards to Render (HTTPS).
 * Replaces index.js (ZK binary protocol) with simpler, more reliable text protocol.
 *
 * Machine config:
 *   Server address: 192.168.1.247 (this PC's IP)
 *   Port: 8081
 *   Mode: "Tự động tải dữ liệu" (Auto push)
 *
 * Usage: node adms-proxy.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8081;
const RENDER_URL = 'https://n2store-fallback.onrender.com';
const LOG_DIR = path.join(__dirname, 'logs');

function log(msg) {
    const ts = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const line = '[' + ts + '] ' + msg;
    console.log(line);
    try {
        if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
        fs.appendFileSync(path.join(LOG_DIR, new Date().toISOString().slice(0, 10) + '.log'), line + '\n');
    } catch (_) {}
}

// Forward request to Render server
async function forwardToRender(method, path, body) {
    const url = RENDER_URL + path;
    const opts = { method, headers: { 'Content-Type': 'text/plain' } };
    if (body) opts.body = body;
    try {
        const res = await fetch(url, opts);
        const text = await res.text();
        return { status: res.status, body: text };
    } catch (e) {
        log('forward error: ' + e.message);
        return { status: 502, body: 'proxy error' };
    }
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const fullPath = url.pathname + url.search;

    // Read body for POST requests
    let body = '';
    if (req.method === 'POST') {
        body = await new Promise((resolve) => {
            let data = '';
            req.on('data', chunk => data += chunk);
            req.on('end', () => resolve(data));
        });
    }

    log(req.method + ' ' + fullPath + (body ? ' body=' + body.substring(0, 100) : ''));

    // Forward to Render
    const result = await forwardToRender(req.method, fullPath, body || undefined);

    log('-> Render ' + result.status + ': ' + result.body.substring(0, 100));

    res.writeHead(result.status, { 'Content-Type': 'text/plain' });
    res.end(result.body);
});

server.listen(PORT, '0.0.0.0', () => {
    log('=== ADMS Proxy v1 ===');
    log('Listening on port ' + PORT);
    log('Forwarding to ' + RENDER_URL);
    log('Machine should push to this PC IP:' + PORT);
    log('');
});
