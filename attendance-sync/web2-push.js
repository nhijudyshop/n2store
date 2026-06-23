// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 forwarder cho collector Web 1.0.
// =====================================================================
// DUAL-PUSH: collector chấm công Web 1.0 (index.js) đọc máy DG-600 1 LẦN rồi
// đẩy SONG SONG sang cả 2 backend độc lập:
//   - Web 1.0: /api/attendance        (api.js)
//   - Web 2.0: /api/web2-attendance   (file này)
// 2 backend KHÔNG share DB/bảng — chỉ là 2 HTTP POST riêng. Mọi lỗi Web 2.0 ở
// đây ĐỀU nuốt (log + trả về) để TUYỆT ĐỐI không làm hỏng luồng Web 1.0.
//
// Cấu hình (1 trong 2):
//   - env: WEB2_ATTENDANCE_SECRET (+ tuỳ chọn WEB2_ATTENDANCE_API_URL)
//   - file web2-config.json (gitignored): { "attendanceSecret": "...", "renderBase": "..." }
// Thiếu secret → TỰ TẮT (no-op), Web 1.0 chạy bình thường.
// =====================================================================
'use strict';

const fs = require('fs');
const path = require('path');

function loadCfg() {
    let file = {};
    try {
        const p = path.join(__dirname, 'web2-config.json');
        if (fs.existsSync(p)) file = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        console.log('[web2] web2-config.json lỗi JSON:', e.message);
    }
    const base = (
        process.env.WEB2_ATTENDANCE_API_URL ||
        (file.renderBase ? file.renderBase.replace(/\/$/, '') + '/api/web2-attendance' : '') ||
        'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2-attendance'
    ).replace(/\/$/, '');
    const secret = process.env.WEB2_ATTENDANCE_SECRET || file.attendanceSecret || '';
    return { base, secret };
}

const CFG = loadCfg();
const ENABLED = !!CFG.secret;
let _warned = false;
function _enabledOrWarn() {
    if (ENABLED) return true;
    if (!_warned) {
        _warned = true;
        console.log(
            '[web2] Bỏ qua đẩy Web 2.0: chưa có WEB2_ATTENDANCE_SECRET (env) hoặc web2-config.json.'
        );
    }
    return false;
}

async function _req(method, p, body) {
    const res = await fetch(CFG.base + p, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'x-web2-attendance-secret': CFG.secret,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`${method} ${p}: ${res.status} ${t.slice(0, 160)}`);
    }
    return res.json().catch(() => ({}));
}

// Map raw ZK users → payload Web 2.0 (giống api.js Web 1.0).
function _mapUsers(users) {
    return (users || [])
        .filter((u) => u && (u.userId || u.uid))
        .map((u) => ({
            user_id: String(u.userId || u.uid || ''),
            uid: String(u.uid || ''),
            name: u.name || 'User ' + (u.userId || u.uid),
            role: u.role || 0,
        }));
}

// Map raw ZK records → payload Web 2.0. Lọc uid rác + timestamp ngoài [2020, ngày mai].
function _mapRecords(records) {
    const lo = new Date('2020-01-01').getTime();
    const hi = Date.now() + 86400000;
    const rows = [];
    for (const r of records || []) {
        const uid = String(r.deviceUserId || '');
        const t = new Date(r.recordTime || 0).getTime();
        if (!uid || uid === '0' || isNaN(t) || t < lo || t > hi) continue;
        rows.push({
            device_user_id: uid,
            check_time: new Date(t).toISOString(),
            type: r.type || 0,
        });
    }
    return rows;
}

// API công khai — tất cả KHÔNG ném ra ngoài (nuốt lỗi, log) để không ảnh hưởng Web 1.0.
async function pushUsers(rawUsers) {
    if (!_enabledOrWarn()) return;
    const users = _mapUsers(rawUsers);
    if (!users.length) return;
    try {
        await _req('POST', '/device-users/bulk', { users });
    } catch (e) {
        console.log('[web2] đẩy users lỗi:', e.message);
    }
}

async function pushRecords(rawRecords) {
    if (!_enabledOrWarn()) return 0;
    const rows = _mapRecords(rawRecords);
    if (!rows.length) return 0;
    let total = 0;
    try {
        for (let i = 0; i < rows.length; i += 500) {
            const r = await _req('POST', '/records/bulk', { records: rows.slice(i, i + 500) });
            total += (r && r.inserted) || 0;
        }
    } catch (e) {
        console.log('[web2] đẩy records lỗi:', e.message);
    }
    return total;
}

async function setStatus(data) {
    if (!_enabledOrWarn()) return;
    try {
        await _req('PUT', '/sync-status', {
            connected: !!(data && data.connected),
            last_sync_time: (data && data.lastSyncTime) || new Date().toISOString(),
            device_count: (data && data.deviceCount) || 0,
            record_count: (data && data.recordCount) || 0,
            last_error: (data && data.lastError) || null,
        });
    } catch (e) {
        console.log('[web2] set status lỗi:', e.message);
    }
}

module.exports = { pushUsers, pushRecords, setStatus, ENABLED, base: CFG.base };
