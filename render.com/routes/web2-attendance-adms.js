// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — Chấm công ADMS push (admin).
// =====================================================================
// ADMS / iclock PUSH endpoint cho máy chấm công DG-600 (ZKTeco family).
// Máy (hoặc proxy máy shop) POST trực tiếp ATTLOG (text, tab-separated) vào
// đây → parse → ghi web2_attendance_records (source='adms'). KHÔNG dùng JSON.
//
// Mount RIÊNG (express.text) để không đụng express.json toàn cục:
//   app.use('/api/web2-attendance-adms', web2AttendanceAdmsRoutes)
// Agent ADMS proxy máy shop forward '/iclock/*' → '<render>/api/web2-attendance-adms/iclock/*'.
//
// Pool: req.app.locals.web2Db || req.app.locals.chatDb. Realtime: web2:attendance.
// Giờ máy = LOCAL GMT+7 → insertRecords tự gắn +07:00 cho chuỗi naive.
// =====================================================================

'use strict';

const express = require('express');
const router = express.Router();
const { insertRecords, touchAdmsStatus } = require('./web2-attendance');

// Text body cho MỌI content-type (máy gửi text/plain hoặc không header).
router.use(express.text({ type: '*/*', limit: '2mb' }));

const getDb = (req) => req.app.locals.web2Db || req.app.locals.chatDb;
const now = () => Date.now();

let _notifyClients = null;
function initializeNotifiers(fn) {
    _notifyClients = fn;
}
function _notify(action, extra) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:attendance', { action, ...(extra || {}), ts: now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-ADMS] _notify failed:', e.message);
    }
}

// Cờ "cần full re-sync 1 lần" theo SN (sau heartbeat đầu). Reset khi nhận xong.
const _needCheck = new Map(); // SN → true

// Parse ATTLOG text → mảng punch cho insertRecords.
function parseAttlog(body) {
    const out = [];
    if (!body) return out;
    const lines = String(body).split(/\r?\n/);
    for (const line of lines) {
        if (!line.trim()) continue;
        const f = line.split('\t');
        if (f.length < 2) continue;
        const pin = String(f[0] || '').trim();
        const ts = String(f[1] || '').trim();
        if (!pin || pin === '0' || !ts) continue;
        out.push({
            device_user_id: pin,
            check_time: ts, // naive '+7' → insertRecords append +07:00
            type: Number.isFinite(Number(f[2])) ? Number(f[2]) : 0,
            verify_mode: f[3] != null && f[3] !== '' ? Number(f[3]) : null,
            raw: line.slice(0, 500),
        });
    }
    return out;
}

// GET /iclock/cdata — heartbeat + config. ATTLOGStamp=0 → buộc full sync lần đầu.
router.get('/iclock/cdata', (req, res) => {
    const sn = String(req.query.SN || req.query.sn || 'UNKNOWN');
    _needCheck.set(sn, true);
    // Máy bắt tay (heartbeat ~10s) → đánh dấu ĐANG KẾT NỐI cho trang Chấm công.
    touchAdmsStatus(getDb(req));
    _notify('heartbeat', { sn });
    res.set('Content-Type', 'text/plain');
    return res.send(
        [
            `GET OPTION FROM: ${sn}`,
            'ATTLOGStamp=0',
            'OPERLOGStamp=9999',
            'ATTPHOTOStamp=9999',
            'ErrorDelay=30',
            'Delay=10',
            'TransTimes=00:00;14:05',
            'TransInterval=1',
            'TransFlag=1111000000',
            'Realtime=1',
            'Encrypt=0',
            'ServerVer=3.4.1 2020-06-07',
            'PushProtVer=2.4.1',
            'TimeZone=7',
            'ResLogDay=18250',
            'ResLogDelCount=10000',
            'ResLogCount=50000',
            '',
        ].join('\r\n')
    );
});

// POST /iclock/cdata?table=ATTLOG — máy đẩy punch.
router.post('/iclock/cdata', async (req, res) => {
    try {
        const table = String(req.query.table || '').toUpperCase();
        // Chỉ xử lý ATTLOG; OPERLOG / khác → OK rỗng.
        if (table && table !== 'ATTLOG') {
            res.set('Content-Type', 'text/plain');
            return res.send('OK: 0');
        }
        const rows = parseAttlog(req.body);
        let inserted = 0;
        if (rows.length) inserted = await insertRecords(getDb(req), rows, 'adms');
        touchAdmsStatus(getDb(req)); // máy đẩy punch → ĐANG KẾT NỐI + cập nhật "Lần cuối"
        if (inserted) _notify('records', { inserted, source: 'adms' });
        res.set('Content-Type', 'text/plain');
        return res.send(`OK: ${inserted}`);
    } catch (e) {
        console.error('[WEB2-ADMS] cdata POST:', e.message);
        res.set('Content-Type', 'text/plain');
        return res.status(500).send('ERROR');
    }
});

// POST /iclock/querydata — kết quả query (cùng format ATTLOG).
router.post('/iclock/querydata', async (req, res) => {
    try {
        const rows = parseAttlog(req.body);
        let inserted = 0;
        if (rows.length) inserted = await insertRecords(getDb(req), rows, 'adms');
        if (inserted) _notify('records', { inserted, source: 'adms' });
        res.set('Content-Type', 'text/plain');
        return res.send(`OK: ${inserted}`);
    } catch (e) {
        console.error('[WEB2-ADMS] querydata:', e.message);
        res.set('Content-Type', 'text/plain');
        return res.status(500).send('ERROR');
    }
});

// GET /iclock/getrequest — máy poll lệnh. Trả CHECK (re-sync) hoặc lệnh DB hoặc OK.
router.get('/iclock/getrequest', async (req, res) => {
    res.set('Content-Type', 'text/plain');
    try {
        const sn = String(req.query.SN || req.query.sn || 'UNKNOWN');
        if (_needCheck.get(sn)) {
            _needCheck.delete(sn);
            return res.send('C:1:CHECK'); // buộc máy gửi lại toàn bộ log
        }
        const db = getDb(req);
        const r = await db.query(
            `UPDATE web2_attendance_commands SET status = 'processing'
               WHERE id IN (
                 SELECT id FROM web2_attendance_commands WHERE status = 'pending'
                  ORDER BY id ASC FOR UPDATE SKIP LOCKED LIMIT 1
               ) RETURNING id, action`
        );
        if (r.rows.length) {
            const c = r.rows[0];
            const cmd = c.action === 'resync' ? 'CHECK' : 'DATA QUERY ATTLOG';
            return res.send(`C:${c.id}:${cmd}`);
        }
        return res.send('OK');
    } catch (e) {
        console.error('[WEB2-ADMS] getrequest:', e.message);
        return res.send('OK');
    }
});

// POST /iclock/devicecmd — máy báo kết quả lệnh (URL-encoded: ID=..&Return=..&CMD=..).
router.post('/iclock/devicecmd', async (req, res) => {
    res.set('Content-Type', 'text/plain');
    try {
        const body = String(req.body || '');
        const idM = body.match(/ID=(\d+)/);
        if (idM) {
            const db = getDb(req);
            await db.query(
                `UPDATE web2_attendance_commands SET status='completed', result=$1, processed_at=$2 WHERE id=$3`,
                [body.slice(0, 300), now(), Number(idM[1])]
            );
        }
        return res.send('OK');
    } catch (e) {
        console.error('[WEB2-ADMS] devicecmd:', e.message);
        return res.send('OK');
    }
});

// GET /iclock/registry — đăng ký thiết bị (1 số firmware gọi). Trả RegistryCode.
router.get('/iclock/registry', (req, res) => {
    res.set('Content-Type', 'text/plain');
    return res.send('RegistryCode=OK');
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
