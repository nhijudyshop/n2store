// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * web2-vieneu-registry — sổ đăng ký SERVER GIỌNG VieNeu của shop (tự dò máy online).
 *
 * Mỗi máy shop chạy vieneu-tts (run_local.sh / .bat) → tunnel cho URL ngẫu nhiên →
 * máy POST /register định kỳ (heartbeat) báo {name, url}. Trang Tạo video GET /list
 * → hiện máy đang online để bấm chọn (KHÔNG cần dán URL; tắt-mở-lại tự báo URL mới;
 * nhiều máy hiện hết).
 *
 * IN-MEMORY (web2-api 1 instance, worker route /api/web2-* → web2-api). Mất khi restart
 * nhưng máy re-register mỗi ~30s nên tự đầy lại. Bảo vệ ghi: header x-vieneu-secret
 * khớp env VIENEU_REGISTRY_SECRET (rỗng = không bắt buộc). Đọc /list công khai (chỉ URL).
 */
const express = require('express');
const router = express.Router();

const TTL_MS = 90 * 1000; // quá 90s không heartbeat = offline
const MAX_SERVERS = 50;
const _servers = new Map(); // name → { name, url, ts, note }

const SECRET = process.env.VIENEU_REGISTRY_SECRET || '';

function _checkSecret(req, res) {
    if (SECRET && (req.headers['x-vieneu-secret'] || '') !== SECRET) {
        res.status(401).json({ ok: false, error: 'invalid secret' });
        return false;
    }
    return true;
}

function _prune() {
    const now = Date.now();
    for (const [k, v] of _servers) if (now - v.ts > TTL_MS) _servers.delete(k);
}

// Máy shop báo danh (heartbeat). body: { name, url, note? }
router.post('/register', (req, res) => {
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
    _prune();
    if (!_servers.has(name) && _servers.size >= MAX_SERVERS) {
        return res.status(429).json({ ok: false, error: 'quá nhiều server' });
    }
    _servers.set(name, {
        name,
        url,
        ts: Date.now(),
        note: String((req.body && req.body.note) || '').slice(0, 120),
    });
    res.json({ ok: true });
});

// Trang web lấy danh sách máy đang online.
router.get('/list', (req, res) => {
    _prune();
    const now = Date.now();
    const servers = [..._servers.values()]
        .map((s) => ({
            name: s.name,
            url: s.url,
            note: s.note,
            ageSec: Math.round((now - s.ts) / 1000),
        }))
        .sort((a, b) => a.ageSec - b.ageSec);
    res.json({ ok: true, servers });
});

// Gỡ máy (khi tắt). body: { name }
router.post('/unregister', (req, res) => {
    if (!_checkSecret(req, res)) return;
    const name = String((req.body && req.body.name) || '').trim();
    _servers.delete(name);
    res.json({ ok: true });
});

module.exports = router;
