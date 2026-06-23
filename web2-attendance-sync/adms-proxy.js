// #Note: WEB2.0 — Agent chấm công: ADMS PROXY (đường chính, không cần thư viện).
// =====================================================================
// Máy DG-600 chỉ push được HTTP (không HTTPS). Proxy này chạy máy shop (cùng
// LAN với máy), nhận push /iclock/* rồi forward sang HTTPS Render:
//   <renderBase>/api/web2-attendance-adms/iclock/*
// → ghi web2_attendance_records (source='adms'). Outbound-only, qua NAT OK.
//
// Cấu hình máy DG-600 (menu Comm → Cloud/ADMS server):
//   Server address = IP máy chạy proxy này (vd 192.168.1.27)
//   Server port    = proxyPort (mặc định 8081)
//   Mode           = Auto upload / Tự động tải dữ liệu
// =====================================================================

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { loadConfig } = require('./lib-config');

const cfg = loadConfig();
const TARGET = cfg.renderBase + '/api/web2-attendance-adms';
const ring = []; // log vòng 200 dòng cho /debug

function log(line) {
    const ts = new Date().toISOString();
    const entry = `${ts} ${line}`;
    ring.push(entry);
    if (ring.length > 200) ring.shift();
    console.log(entry);
}

// Forward 1 request /iclock/* sang Render, trả body Render về cho máy.
function forward(req, res, bodyBuf) {
    const suffix = req.url; // '/iclock/cdata?SN=...'
    const targetUrl = new URL(TARGET + suffix);
    // append secret (query) để backend siết nếu bật WEB2_ATTENDANCE_ADMS_SECRET.
    if (cfg.attendanceSecret && !targetUrl.searchParams.has('secret')) {
        targetUrl.searchParams.set('secret', cfg.attendanceSecret);
    }
    const lib = targetUrl.protocol === 'https:' ? https : http;
    const opts = {
        method: req.method,
        headers: {
            'Content-Type': 'text/plain',
            'Content-Length': bodyBuf ? Buffer.byteLength(bodyBuf) : 0,
        },
        timeout: 20000,
    };
    const preview = bodyBuf && bodyBuf.length ? ` body=${bodyBuf.length}B` : '';
    log(`→ ${req.method} ${suffix}${preview}`);
    const fwd = lib.request(targetUrl, opts, (up) => {
        let data = '';
        up.on('data', (c) => (data += c));
        up.on('end', () => {
            log(`← ${up.statusCode} ${String(data).slice(0, 80).replace(/\n/g, ' ')}`);
            res.writeHead(up.statusCode || 200, { 'Content-Type': 'text/plain' });
            res.end(data);
        });
    });
    fwd.on('error', (e) => {
        log(`✗ forward error: ${e.message}`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK'); // trả OK để máy không kẹt; punch sẽ gửi lại lần sau
    });
    fwd.on('timeout', () => fwd.destroy(new Error('timeout')));
    if (bodyBuf && bodyBuf.length) fwd.write(bodyBuf);
    fwd.end();
}

const server = http.createServer((req, res) => {
    // Trang debug xem log realtime.
    if (req.url === '/debug') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(
            `<meta http-equiv="refresh" content="5"><title>web2 attendance proxy</title>` +
                `<body style="font:13px monospace;background:#0b1220;color:#cbd5e1;padding:14px">` +
                `<h3 style="color:#38bdf8">WEB2 Attendance ADMS proxy → ${TARGET}</h3>` +
                `<pre>${ring.slice().reverse().join('\n').replace(/</g, '&lt;')}</pre></body>`
        );
    }
    if (req.url === '/status' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, target: TARGET, logs: ring.length }));
    }
    // Mọi /iclock/* → forward.
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => forward(req, res, Buffer.concat(chunks)));
});

server.listen(cfg.proxyPort, () => {
    log(`ADMS proxy nghe cổng ${cfg.proxyPort} → forward ${TARGET}`);
    log(
        `Cấu hình máy DG-600: Server = <IP máy này>, Port = ${cfg.proxyPort}. Debug: http://localhost:${cfg.proxyPort}/debug`
    );
    if (!cfg.attendanceSecret) log('⚠ Chưa đặt attendanceSecret (config.json) — nên đặt cho prod.');
});
