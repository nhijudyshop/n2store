// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * ADMS Proxy Server v2
 * Receives push data from ZKTeco machine (HTTP) and forwards to Render (HTTPS).
 *
 * Machine config:
 *   Server address: 192.168.1.27 (this PC's IP)
 *   Port: 8081
 *   Mode: "Tu dong tai du lieu" (Auto push)
 *
 * Usage: node adms-proxy.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8081;
const RENDER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const LOG_DIR = path.join(__dirname, 'logs');

// Recent logs buffer for /debug endpoint
const recentLogs = [];
const MAX_RECENT = 200;

function log(msg) {
    const ts = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const line = '[' + ts + '] ' + msg;
    console.log(line);

    // Keep in memory for /debug
    recentLogs.push(line);
    if (recentLogs.length > MAX_RECENT) recentLogs.shift();

    try {
        if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
        fs.appendFileSync(path.join(LOG_DIR, new Date().toISOString().slice(0, 10) + '.log'), line + '\n');
    } catch (_) {}
}

// Forward request to Render server
async function forwardToRender(method, reqPath, body, headers) {
    const url = RENDER_URL + reqPath;
    const opts = {
        method,
        headers: {
            'Content-Type': headers['content-type'] || 'text/plain',
        }
    };
    if (body) opts.body = body;

    try {
        const start = Date.now();
        const res = await fetch(url, opts);
        const text = await res.text();
        const elapsed = Date.now() - start;
        log('  -> Render responded: ' + res.status + ' (' + elapsed + 'ms)');
        log('  -> Render body: ' + text.substring(0, 500));
        return { status: res.status, body: text };
    } catch (e) {
        log('  -> ERROR forwarding: ' + e.message);
        return { status: 502, body: 'proxy error: ' + e.message };
    }
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const fullPath = url.pathname + url.search;

    // Debug endpoint — view logs in browser
    if (url.pathname === '/debug') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><head><title>ADMS Proxy Debug</title>
            <meta http-equiv="refresh" content="5">
            <style>body{font-family:monospace;font-size:12px;background:#111;color:#0f0;padding:10px}
            h2{color:#fff}pre{white-space:pre-wrap;word-break:break-all}</style></head>
            <body><h2>ADMS Proxy Debug (auto-refresh 5s)</h2>
            <p>Last ${recentLogs.length} log entries:</p>
            <pre>${recentLogs.join('\n')}</pre></body></html>`);
        return;
    }

    // Status endpoint
    if (url.pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ proxy: 'running', port: PORT, render: RENDER_URL, logs: recentLogs.length }));
        return;
    }

    // Read body for POST requests
    let body = '';
    if (req.method === 'POST') {
        body = await new Promise((resolve) => {
            let data = '';
            req.on('data', chunk => data += chunk);
            req.on('end', () => resolve(data));
        });
    }

    // Detailed request logging
    log('');
    log('========================================');
    log('REQUEST: ' + req.method + ' ' + fullPath);
    log('  From: ' + req.socket.remoteAddress);
    log('  Content-Type: ' + (req.headers['content-type'] || 'none'));
    log('  Content-Length: ' + (req.headers['content-length'] || '0'));
    if (body) {
        log('  Body (' + body.length + ' bytes):');
        // Log full body (up to 2000 chars) for debug
        const bodyLines = body.split(/\r?\n/);
        log('  Lines: ' + bodyLines.length);
        for (let i = 0; i < Math.min(bodyLines.length, 20); i++) {
            log('    [' + i + '] ' + bodyLines[i]);
        }
        if (bodyLines.length > 20) {
            log('    ... (' + (bodyLines.length - 20) + ' more lines)');
        }
    }

    // Forward to Render
    log('  Forwarding to Render...');
    const result = await forwardToRender(req.method, fullPath, body || undefined, req.headers);

    res.writeHead(result.status, { 'Content-Type': 'text/plain' });
    res.end(result.body);
    log('========================================');
});

server.listen(PORT, '0.0.0.0', () => {
    log('');
    log('=== ADMS Proxy v2 ===');
    log('Listening on 0.0.0.0:' + PORT);
    log('Forwarding to ' + RENDER_URL);
    log('Debug UI: http://localhost:' + PORT + '/debug');
    log('Machine should push to this PC IP:' + PORT);
    log('');
});
