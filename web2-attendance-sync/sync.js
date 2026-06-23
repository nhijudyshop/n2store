// #Note: WEB2.0 — Agent chấm công: ZK PULL mode (tuỳ chọn, cần node-zklib).
// =====================================================================
// Đọc máy DG-600 qua LAN cổng 4370 (giao thức ZK), lấy NV + punch rồi POST
// outbound lên Render /api/web2-attendance (secret header). Dùng khi máy KHÔNG
// hỗ trợ ADMS push, hoặc muốn pull định kỳ. Ngược lại ưu tiên adms-proxy.js.
//
//   npm install   (cài node-zklib)
//   node sync.js
// =====================================================================

'use strict';

const https = require('https');
const http = require('http');
const net = require('net');
const os = require('os');
const { URL } = require('url');
const { loadConfig } = require('./lib-config');

let ZKLib;
try {
    ZKLib = require('node-zklib');
} catch (e) {
    console.error('Thiếu node-zklib. Chạy: npm install');
    process.exit(1);
}

const cfg = loadConfig();
const BASE = cfg.renderBase + '/api/web2-attendance';
let deviceIp = cfg.device.ip; // resolve động (config.ip hoặc tự dò LAN)

// ── Auto-discovery: tự dò IP máy chấm công trên LAN (cổng 4370) ───────────
// Lấy subnet /24 từ IP máy đang chạy → thử kết nối từng IP. device.ip trong
// config (nếu reachable) ƯU TIÊN; không thì quét. Nhiều thiết bị → cảnh báo.
function _localSubnet() {
    const ifs = os.networkInterfaces();
    for (const name of Object.keys(ifs)) {
        for (const i of ifs[name] || []) {
            if (
                i.family === 'IPv4' &&
                !i.internal &&
                /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(i.address)
            ) {
                return i.address.replace(/\.\d+$/, '');
            }
        }
    }
    return null;
}
function _checkPort(ip, port, timeoutMs = 700) {
    return new Promise((resolve) => {
        const s = new net.Socket();
        let done = false;
        const finish = (ok) => {
            if (done) return;
            done = true;
            s.destroy();
            resolve(ok);
        };
        s.setTimeout(timeoutMs);
        s.once('connect', () => finish(true));
        s.once('timeout', () => finish(false));
        s.once('error', () => finish(false));
        s.connect(port, ip);
    });
}
async function _scanLan(port) {
    const sub = _localSubnet();
    if (!sub) return [];
    console.log(`[discover] quét ${sub}.0/24 tìm máy chấm công (cổng ${port})…`);
    const ips = [];
    for (let i = 1; i <= 254; i++) ips.push(`${sub}.${i}`);
    const found = [];
    const BATCH = 48;
    for (let i = 0; i < ips.length; i += BATCH) {
        const res = await Promise.all(
            ips.slice(i, i + BATCH).map((ip) => _checkPort(ip, port).then((ok) => (ok ? ip : null)))
        );
        for (const ip of res) if (ip) found.push(ip);
    }
    return found;
}
async function resolveDeviceIp() {
    const port = cfg.device.port;
    if (cfg.device.ip && (await _checkPort(cfg.device.ip, port))) {
        return cfg.device.ip; // config trỏ đúng + reachable → dùng luôn
    }
    const found = await _scanLan(port);
    if (found.length) {
        if (found.length > 1) {
            console.warn(
                `[discover] ⚠ Tìm thấy NHIỀU thiết bị cổng ${port}: ${found.join(', ')}. ` +
                    `Dùng ${found[0]}. Nếu sai, đặt "device.ip" trong config.json.`
            );
        } else {
            console.log(`[discover] ✅ Tìm thấy máy chấm công: ${found[0]}`);
        }
        return found[0];
    }
    console.warn(
        `[discover] Không dò được máy trên LAN. Dùng config device.ip=${cfg.device.ip} (kiểm tra IP + cùng mạng).`
    );
    return cfg.device.ip;
}

function postJson(path, payload, method = 'POST') {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE + path);
        const data = Buffer.from(JSON.stringify(payload));
        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.request(
            url,
            {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length,
                    'x-web2-attendance-secret': cfg.attendanceSecret || '',
                },
                timeout: 20000,
            },
            (res) => {
                let body = '';
                res.on('data', (c) => (body += c));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch {
                        resolve({ raw: body, status: res.statusCode });
                    }
                });
            }
        );
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.write(data);
        req.end();
    });
}
// sync-status route là PUT → phải gửi đúng method (trước đây gửi POST → 404 → "Lần cuối: —").
function putJson(path, payload) {
    return postJson(path, payload, 'PUT').catch(() => null);
}

async function syncOnce() {
    const zk = new ZKLib(deviceIp, cfg.device.port, cfg.device.timeoutMs, 4000);
    try {
        await zk.createSocket();
        // Users
        let users = [];
        try {
            const u = await zk.getUsers();
            users = (u.data || []).map((x) => ({
                user_id: String(x.userId || x.uid),
                uid: String(x.uid),
                name: x.name,
                role: x.role,
            }));
            if (users.length) await postJson('/device-users/bulk', { users });
        } catch (e) {
            console.warn('getUsers lỗi:', e.message);
        }
        // Attendances
        const a = await zk.getAttendances();
        const records = (a.data || [])
            .filter((r) => r.deviceUserId && r.deviceUserId !== '0' && r.recordTime)
            .map((r) => ({
                device_user_id: String(r.deviceUserId),
                check_time: new Date(r.recordTime).toISOString(),
                type: 0,
            }));
        let inserted = 0;
        if (records.length) {
            // chia lô 500
            for (let i = 0; i < records.length; i += 500) {
                const r = await postJson('/records/bulk', { records: records.slice(i, i + 500) });
                inserted += (r && r.inserted) || 0;
            }
        }
        await zk.disconnect().catch(() => {});
        await putJson('/sync-status', {
            connected: true,
            last_sync_time: new Date().toISOString(),
            device_count: users.length,
            record_count: records.length,
            last_error: null,
        });
        console.log(`[sync] users=${users.length} records=${records.length} inserted=${inserted}`);
        return true;
    } catch (e) {
        console.error('[sync] lỗi:', e.message);
        await putJson('/sync-status', { connected: false, last_error: e.message });
        try {
            await zk.disconnect();
        } catch {}
        // Máy có thể đổi IP (DHCP) → dò lại cho lần sau.
        try {
            deviceIp = await resolveDeviceIp();
        } catch {}
        return false;
    }
}

// --once: lấy dữ liệu 1 LẦN rồi thoát (chế độ "bấm nút lấy" thủ công).
// Không cờ: chạy liên tục, đồng bộ mỗi pollMinutes (chế độ 1 PC nền).
const ONCE = process.argv.includes('--once');

async function loop() {
    deviceIp = await resolveDeviceIp(); // tự dò trước khi sync lần đầu
    const okSync = await syncOnce();
    if (ONCE) {
        console.log(
            okSync ? '[once] ✅ Lấy dữ liệu xong.' : '[once] ❌ Lấy dữ liệu LỖI — xem dòng trên.'
        );
        process.exit(okSync ? 0 : 1);
    }
    const ms = Math.max(1, cfg.pollMinutes) * 60 * 1000;
    setInterval(syncOnce, ms);
    console.log(`[sync] lặp mỗi ${cfg.pollMinutes} phút. Máy ${deviceIp}:${cfg.device.port}`);
}

loop();
