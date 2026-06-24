// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * web2-vieneu-registry — sổ đăng ký MÁY SERVER tự host của shop (tự dò máy online).
 *
 * Mỗi máy shop chạy server tự host (vieneu-tts giọng AI, bg-remover tách nền…) → tunnel
 * cho URL ngẫu nhiên → máy POST /register định kỳ (heartbeat) báo {name, url, engine}.
 * Trang web GET /list[?engine=...] → hiện máy đang online để bấm chọn (KHÔNG cần dán URL;
 * tắt-mở-lại tự báo URL mới; nhiều máy + nhiều loại engine hiện hết).
 *
 * ⚠ TRƯỚC 2026-06-24 registry là IN-MEMORY Map → BUG: web2-api chạy NHIỀU instance +
 * redeploy/restart xoá sạch state. Máy register vào instance A, browser GET /list trúng
 * instance B → "không thấy máy nào online" dù máy đang chạy. Đây là lý do "VieNeu không
 * kết nối được". FIX: lưu Postgres (web2Db) → sống qua redeploy + chia sẻ giữa instance.
 * (Cùng hướng fix với SSE cross-instance — xem reference_web2_sse_cross_instance.)
 *
 * Bảo vệ ghi: header x-vieneu-secret khớp env VIENEU_REGISTRY_SECRET (rỗng = không bắt buộc).
 * Đọc /list công khai (chỉ trả name/url/engine — không nhạy cảm).
 */
const express = require('express');
const router = express.Router();

const TTL_MS = 90 * 1000; // quá 90s không heartbeat = offline
const MAX_SERVERS = 50;
const SECRET = process.env.VIENEU_REGISTRY_SECRET || '';

const getDb = (req) => req.app.locals.web2Db || req.app.locals.chatDb;

let _ensured = null;
function ensureTables(db) {
    if (_ensured) return _ensured;
    _ensured = db
        .query(
            `CREATE TABLE IF NOT EXISTS web2_machine_servers (
                name    TEXT PRIMARY KEY,
                url     TEXT NOT NULL,
                note    TEXT,
                engine  TEXT,
                ts      BIGINT
            )`
        )
        .catch((e) => {
            _ensured = null; // cho phép thử lại nếu ensure lỗi (boot window)
            throw e;
        });
    return _ensured;
}

function _checkSecret(req, res) {
    if (SECRET && (req.headers['x-vieneu-secret'] || '') !== SECRET) {
        res.status(401).json({ ok: false, error: 'invalid secret' });
        return false;
    }
    return true;
}

// Máy shop báo danh (heartbeat). body: { name, url, note?, engine? }
router.post('/register', express.json({ limit: '8kb' }), async (req, res) => {
    if (!_checkSecret(req, res)) return;
    const name = String((req.body && req.body.name) || '')
        .trim()
        .slice(0, 60);
    const url = String((req.body && req.body.url) || '')
        .trim()
        .replace(/\/+$/, '');
    if (!name || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ ok: false, error: 'thiếu name hoặc url hợp lệ' });
    }
    const note = String((req.body && req.body.note) || '').slice(0, 120);
    // engine = phân loại máy (vieneu / bgremover / subtitle…). Mặc định lấy theo note (vieneu serve.py
    // gửi note='vieneu') để back-compat; nếu trống → 'vieneu'.
    const engine =
        String((req.body && req.body.engine) || note || 'vieneu')
            .trim()
            .slice(0, 40) || 'vieneu';
    try {
        const db = getDb(req);
        await ensureTables(db);
        const now = Date.now();
        await db.query(`DELETE FROM web2_machine_servers WHERE ts < $1`, [now - TTL_MS]); // prune
        const cnt = await db.query(`SELECT COUNT(*)::int AS n FROM web2_machine_servers`);
        const exists = await db.query(`SELECT 1 FROM web2_machine_servers WHERE name = $1`, [name]);
        if (!exists.rowCount && (cnt.rows[0]?.n || 0) >= MAX_SERVERS) {
            return res.status(429).json({ ok: false, error: 'quá nhiều server' });
        }
        await db.query(
            `INSERT INTO web2_machine_servers (name, url, note, engine, ts)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (name) DO UPDATE SET url = EXCLUDED.url, note = EXCLUDED.note,
                engine = EXCLUDED.engine, ts = EXCLUDED.ts`,
            [name, url, note, engine, now]
        );
        res.json({ ok: true });
    } catch (e) {
        console.error('[web2-vieneu-registry] register error:', e.message);
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

// Trang web lấy danh sách máy đang online. ?engine=vieneu|bgremover… (tuỳ chọn lọc).
router.get('/list', async (req, res) => {
    try {
        const db = getDb(req);
        await ensureTables(db);
        const now = Date.now();
        await db.query(`DELETE FROM web2_machine_servers WHERE ts < $1`, [now - TTL_MS]); // prune
        const engine = String(req.query.engine || '').trim();
        const r = engine
            ? await db.query(
                  `SELECT name, url, note, engine, ts FROM web2_machine_servers
                    WHERE ts > $1 AND engine = $2 ORDER BY ts DESC`,
                  [now - TTL_MS, engine]
              )
            : await db.query(
                  `SELECT name, url, note, engine, ts FROM web2_machine_servers
                    WHERE ts > $1 ORDER BY ts DESC`,
                  [now - TTL_MS]
              );
        const servers = r.rows.map((s) => ({
            name: s.name,
            url: s.url,
            note: s.note,
            engine: s.engine,
            ageSec: Math.round((now - Number(s.ts)) / 1000),
        }));
        res.json({ ok: true, servers });
    } catch (e) {
        console.error('[web2-vieneu-registry] list error:', e.message);
        // KHÔNG 500 cho /list (UI poll liên tục) — trả rỗng để UI hiện "chưa thấy máy".
        res.json({ ok: true, servers: [], error: String(e.message || e) });
    }
});

// Gỡ máy (khi tắt). body: { name }
router.post('/unregister', express.json({ limit: '4kb' }), async (req, res) => {
    if (!_checkSecret(req, res)) return;
    const name = String((req.body && req.body.name) || '').trim();
    try {
        const db = getDb(req);
        await ensureTables(db);
        await db.query(`DELETE FROM web2_machine_servers WHERE name = $1`, [name]);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

module.exports = router;
