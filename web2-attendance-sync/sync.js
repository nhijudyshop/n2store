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

function postJson(path, payload) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE + path);
        const data = Buffer.from(JSON.stringify(payload));
        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.request(
            url,
            {
                method: 'POST',
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
function putJson(path, payload) {
    return postJson(path, payload).catch(() => null); // sync-status best-effort
}

async function syncOnce() {
    const zk = new ZKLib(cfg.device.ip, cfg.device.port, cfg.device.timeoutMs, 4000);
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
        return false;
    }
}

async function loop() {
    await syncOnce();
    const ms = Math.max(1, cfg.pollMinutes) * 60 * 1000;
    setInterval(syncOnce, ms);
    console.log(`[sync] lặp mỗi ${cfg.pollMinutes} phút. Máy ${cfg.device.ip}:${cfg.device.port}`);
}

loop();
