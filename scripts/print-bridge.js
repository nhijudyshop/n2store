#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — cầu nối in bill ra máy in mạng IP:port.
// =====================================================================
// WEB 2.0 — PRINT BRIDGE (local agent in bill ra máy in nhiệt mạng)
//
// Vì sao cần: trình duyệt KHÔNG mở được TCP socket thẳng tới máy in mạng
// (IP:9100). Agent nhỏ này chạy trên MÁY POS, nhận lệnh ESC/POS từ trình
// duyệt (qua HTTP localhost) rồi mở socket TCP tới máy in → in tức thì,
// KHÔNG hộp thoại. Tương tự QZ Tray nhưng tối giản, tự kiểm soát.
//
// Chạy (trên máy POS, cần Node ≥14):
//   node scripts/print-bridge.js              # cổng mặc định 17777
//   PRINT_BRIDGE_PORT=18888 node scripts/print-bridge.js
//
// Để chạy nền lúc khởi động máy: thêm vào pm2 / Task Scheduler / launchd.
//
// API (chỉ nghe 127.0.0.1 — an toàn, không lộ ra mạng):
//   GET  /health                      → {ok:true, version}
//   POST /print  {ip, port, b64}      → gửi Buffer(b64) tới ip:port (TCP)
//   POST /tcp-test {ip, port}         → thử kết nối, không gửi gì
// =====================================================================

const net = require('net');
const http = require('http');

const PORT = Number(process.env.PRINT_BRIDGE_PORT) || 17777;
const VERSION = '1.1.0';

// ponytail: bridge giờ có thể lộ ra Internet qua cloudflared tunnel (in từ ĐT/PC khác)
// → chặn SSRF: chỉ cho relay tới máy in mạng NỘI BỘ (IP private) + CỔNG máy in. Khoá đường
// pivot tới host công khai / cổng nhạy cảm. Upgrade path: thêm x-print-token nếu lo bị in
// rác lên máy in LAN. Hostname (không phải IP literal) = do admin tự cấu hình → cho qua.
const PRINTER_PORTS = new Set([
    9100, 9101, 9102, 9103, 9104, 9105, 9106, 9107, 9108, 9109, 515, 631, 6101, 9200,
]);
function isPrivateIPv4(ip) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip));
    if (!m) return null; // không phải IPv4 literal → hostname (admin cấu hình) → cho qua
    const o = m.slice(1).map(Number);
    if (o.some((n) => n > 255)) return false;
    if (o[0] === 10 || o[0] === 127) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    if (o[0] === 169 && o[1] === 254) return true; // link-local
    return false;
}
function targetReason(ip, port) {
    const p = Number(port) || 9100;
    if (!PRINTER_PORTS.has(p)) return 'cổng ' + p + ' không phải cổng máy in (chỉ 9100…)';
    if (isPrivateIPv4(ip) === false)
        return 'IP công khai ' + ip + ' bị chặn (chỉ in máy in mạng nội bộ)';
    return null;
}

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Private Network Access: trang HTTPS gọi http://127.0.0.1 (mạng nội bộ)
    // bị Chrome chặn ở preflight nếu THIẾU header này → "bridge chưa chạy".
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
}
function json(res, code, obj) {
    cors(res);
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
}
function readBody(req) {
    return new Promise((resolve) => {
        let b = '';
        req.on('data', (c) => (b += c));
        req.on('end', () => {
            try {
                resolve(JSON.parse(b || '{}'));
            } catch {
                resolve(null);
            }
        });
    });
}

// Mở TCP tới máy in, ghi buffer, đóng. Timeout 6s.
function sendToPrinter(ip, port, buf) {
    return new Promise((resolve, reject) => {
        // Guard chung cho cả /print lẫn /tcp-test (mọi đường ra TCP đi qua đây).
        const reason = targetReason(ip, port);
        if (reason) return reject(new Error(reason));
        const sock = net.connect({ host: ip, port: port || 9100 });
        let done = false;
        const finish = (err) => {
            if (done) return;
            done = true;
            try {
                sock.destroy();
            } catch {}
            err ? reject(err) : resolve();
        };
        sock.setTimeout(6000);
        sock.on('timeout', () => finish(new Error('Timeout kết nối máy in ' + ip + ':' + port)));
        sock.on('error', (e) => finish(e));
        sock.on('connect', () => {
            if (!buf || !buf.length) return finish(); // tcp-test
            sock.write(buf, () => {
                // chờ một nhịp cho máy in nhận hết rồi đóng
                setTimeout(() => finish(), 150);
            });
        });
    });
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        cors(res);
        res.writeHead(204);
        return res.end();
    }
    if (req.url === '/health')
        return json(res, 200, { ok: true, version: VERSION, engine: 'printer' });

    if (req.url === '/print' && req.method === 'POST') {
        const b = await readBody(req);
        if (!b || !b.ip || !b.b64) return json(res, 400, { ok: false, error: 'cần ip + b64' });
        try {
            await sendToPrinter(b.ip, Number(b.port) || 9100, Buffer.from(b.b64, 'base64'));
            console.log(`[print-bridge] đã in tới ${b.ip}:${b.port || 9100}`);
            return json(res, 200, { ok: true });
        } catch (e) {
            console.warn(`[print-bridge] lỗi in ${b.ip}:${b.port}:`, e.message);
            return json(res, 502, { ok: false, error: e.message });
        }
    }

    if (req.url === '/tcp-test' && req.method === 'POST') {
        const b = await readBody(req);
        if (!b || !b.ip) return json(res, 400, { ok: false, error: 'cần ip' });
        try {
            await sendToPrinter(b.ip, Number(b.port) || 9100, null);
            return json(res, 200, { ok: true });
        } catch (e) {
            return json(res, 502, { ok: false, error: e.message });
        }
    }

    json(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n  🖨  N2Store Print Bridge v${VERSION}`);
    console.log(`  Đang nghe: http://127.0.0.1:${PORT}`);
    console.log(`  Trang web sẽ gửi bill ESC/POS qua đây → máy in mạng IP:9100.`);
    console.log(`  Giữ cửa sổ này MỞ khi cần in. Ctrl+C để dừng.\n`);
});
