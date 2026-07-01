#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — cầu nối lấy 1 ảnh JPEG từ camera IP (KBVision/Dahua) cho đối soát.
// =====================================================================
// WEB 2.0 — CAMERA BRIDGE (local agent chụp 1 khung hình từ camera IP)
//
// Vì sao cần: trình duyệt (HTTPS nhijudy.store) KHÔNG lấy được ảnh thẳng từ
// camera IP trong LAN (mixed-content + CORS + Digest-auth + RTSP đều chặn).
// Agent nhỏ này chạy trên MÁY ĐÓNG GÓI (cùng LAN với camera), gọi camera
// bằng HTTP Digest (server-side, không dính giới hạn browser), lấy JPEG rồi
// trả về http://127.0.0.1:<port>/snapshot. Trang web gọi localhost (loopback =
// secure context) → chụp ảnh bằng chứng lúc đối soát tay. Mirror print-bridge.js.
//
// KBVision = OEM Dahua → snapshot endpoint: http://<ip>/cgi-bin/snapshot.cgi?channel=1
//   (phải BẬT 'CGI Service' trong camera: Setting → Safety/System Service → tick CGI).
// Zero-dependency: Digest auth tự implement bằng http + crypto (Node ≥14).
//
// Cấu hình (env HOẶC camera.config.json cạnh file này — file gitignored):
//   CAM_IP=192.168.1.108  CAM_USER=admin  CAM_PASS=xxxxx  [CAM_CHANNEL=1]
//   hoặc CAM_SNAPSHOT_URL=http://192.168.1.108/cgi-bin/snapshot.cgi?channel=1&subtype=0
//   CAMERA_BRIDGE_PORT=8141 (mặc định)
//
// Chạy: node camera-bridge/camera-bridge.js   (giữ cửa sổ mở; hoặc dùng .bat/pm2)
//
// API (chỉ nghe 127.0.0.1 — không lộ ra mạng; ra Internet qua camera-tunnel.ps1):
//   GET /health    → {ok, version, engine:'camera', cam}
//   GET /snapshot  → image/jpeg (1 khung hình hiện tại)
// =====================================================================

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.CAMERA_BRIDGE_PORT) || 8141;
const VERSION = '1.0.0';

// ---- config: env trước, rồi camera.config.json cạnh file ----
function loadConfig() {
    let file = {};
    try {
        const p = path.join(__dirname, 'camera.config.json');
        if (fs.existsSync(p)) file = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        console.warn('[camera-bridge] camera.config.json lỗi:', e.message);
    }
    return {
        ip: process.env.CAM_IP || file.ip || '',
        user: process.env.CAM_USER || file.user || 'admin',
        pass: process.env.CAM_PASS || file.pass || '',
        channel: process.env.CAM_CHANNEL || file.channel || 1,
        snapshotUrl: process.env.CAM_SNAPSHOT_URL || file.snapshotUrl || '',
    };
}
const CFG = loadConfig();
function snapshotUrl() {
    if (CFG.snapshotUrl) return CFG.snapshotUrl;
    return `http://${CFG.ip}/cgi-bin/snapshot.cgi?channel=${CFG.channel || 1}`;
}

// ---- HTTP Digest GET (zero-dep) ----
function md5(s) {
    return crypto.createHash('md5').update(s).digest('hex');
}
function parseChallenge(h) {
    const out = {};
    String(h).replace(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g, (_, k, v1, v2) => {
        out[k] = v1 !== undefined ? v1 : v2;
        return '';
    });
    return out;
}
function digestGet(rawUrl, user, pass, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        let u;
        try {
            u = new URL(rawUrl);
        } catch {
            return reject(new Error('CAM URL không hợp lệ: ' + rawUrl));
        }
        const target = u.pathname + u.search;
        const doReq = (authHeader) => {
            const req = http.request(
                {
                    hostname: u.hostname,
                    port: u.port || 80,
                    path: target,
                    method: 'GET',
                    headers: authHeader ? { Authorization: authHeader } : {},
                },
                (res) => {
                    if (res.statusCode === 401 && !authHeader) {
                        const wa = res.headers['www-authenticate'] || '';
                        res.resume();
                        if (!/digest/i.test(wa)) {
                            // Một số cam chấp nhận Basic
                            if (/basic/i.test(wa)) {
                                const b =
                                    'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
                                return doReq(b);
                            }
                            return reject(new Error('camera yêu cầu auth lạ: ' + wa.slice(0, 40)));
                        }
                        const c = parseChallenge(wa);
                        const nc = '00000001';
                        const cnonce = crypto.randomBytes(8).toString('hex');
                        const ha1 = md5(`${user}:${c.realm}:${pass}`);
                        const ha2 = md5(`GET:${target}`);
                        const qop = c.qop ? 'auth' : null;
                        const response = qop
                            ? md5(`${ha1}:${c.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
                            : md5(`${ha1}:${c.nonce}:${ha2}`);
                        let auth =
                            `Digest username="${user}", realm="${c.realm}", nonce="${c.nonce}", ` +
                            `uri="${target}", response="${response}"`;
                        if (c.opaque) auth += `, opaque="${c.opaque}"`;
                        if (qop) auth += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
                        if (c.algorithm) auth += `, algorithm=${c.algorithm}`;
                        return doReq(auth);
                    }
                    if (res.statusCode !== 200) {
                        res.resume();
                        return reject(new Error('camera trả HTTP ' + res.statusCode));
                    }
                    const chunks = [];
                    res.on('data', (d) => chunks.push(d));
                    res.on('end', () => resolve(Buffer.concat(chunks)));
                }
            );
            req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout kết nối camera')));
            req.on('error', reject);
            req.end();
        };
        doReq(null);
    });
}

// ---- HTTP server ----
function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
}
function json(res, code, obj) {
    cors(res);
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
    const url = (req.url || '').split('?')[0];
    if (req.method === 'OPTIONS') {
        cors(res);
        res.writeHead(204);
        return res.end();
    }
    if (url === '/health') {
        return json(res, 200, {
            ok: true,
            version: VERSION,
            engine: 'camera',
            cam: CFG.snapshotUrl || CFG.ip || null,
        });
    }
    if (url === '/snapshot') {
        if (!CFG.ip && !CFG.snapshotUrl)
            return json(res, 500, {
                ok: false,
                error: 'chưa cấu hình CAM_IP / camera.config.json',
            });
        try {
            const buf = await digestGet(snapshotUrl(), CFG.user, CFG.pass);
            if (!buf || !buf.length) throw new Error('ảnh camera rỗng');
            cors(res);
            res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
            return res.end(buf);
        } catch (e) {
            console.warn('[camera-bridge] snapshot lỗi:', e.message);
            return json(res, 502, { ok: false, error: e.message });
        }
    }
    json(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n  📷  N2Store Camera Bridge v${VERSION}`);
    console.log(`  Đang nghe: http://127.0.0.1:${PORT}`);
    console.log(
        `  Camera:    ${CFG.snapshotUrl || CFG.ip || '(CHƯA cấu hình — set CAM_IP/CAM_USER/CAM_PASS)'}`
    );
    console.log(`  Trang đối soát sẽ gọi /snapshot khi tích tay để lưu ảnh bằng chứng.`);
    console.log(`  Giữ cửa sổ này MỞ. Ctrl+C để dừng.\n`);
});
