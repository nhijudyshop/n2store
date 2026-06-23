// #Note: WEB2.0 — Agent chấm công: đọc config (config.json | env). KHÔNG log secret.
'use strict';

const fs = require('fs');
const path = require('path');

function loadConfig() {
    const file = path.join(__dirname, 'config.json');
    let cfg = {};
    if (fs.existsSync(file)) {
        try {
            cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (e) {
            console.error('[config] config.json lỗi JSON:', e.message);
        }
    }
    // Env override (ưu tiên env — tránh ghi secret vào file khi deploy nơi khác).
    const env = process.env;
    return {
        renderBase: (
            env.WEB2_RENDER_BASE ||
            cfg.renderBase ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        ).replace(/\/$/, ''),
        attendanceSecret: env.WEB2_ATTENDANCE_SECRET || cfg.attendanceSecret || '',
        proxyPort: Number(env.WEB2_PROXY_PORT || cfg.proxyPort || 8081),
        pollMinutes: Number(env.WEB2_POLL_MINUTES || cfg.pollMinutes || 5),
        device: {
            ip: env.WEB2_DEVICE_IP || (cfg.device && cfg.device.ip) || '192.168.1.201',
            port: Number(env.WEB2_DEVICE_PORT || (cfg.device && cfg.device.port) || 4370),
            commKey: Number(env.WEB2_DEVICE_COMMKEY || (cfg.device && cfg.device.commKey) || 0),
            timeoutMs: Number(
                env.WEB2_DEVICE_TIMEOUT || (cfg.device && cfg.device.timeoutMs) || 10000
            ),
        },
    };
}

module.exports = { loadConfig };
