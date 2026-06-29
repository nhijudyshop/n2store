// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — CÂN NẶNG HÀNG (goods weight log)
// Khi hàng về (hàng ở kiện) → đưa kiện lên cân → chụp ảnh cân lại → ghi nhận:
//   tên user (server-resolved) + ảnh cân (BYTEA web2Db) + ngày giờ phút nhập form
//   (server time) + số kg + số kiện + ghi chú.
// Ảnh lưu BYTEA trong Render web2Db (KHÔNG base64 doc, KHÔNG Bunny — policy aikol-only).
//
// Endpoints (mount /api/web2-goods-weight):
//   GET    /list?limit=&offset=   → [{id,username,weightKg,baleCount,note,createdAt,hasImage}] (auth soft)
//   GET    /img/:id               → serve ảnh binary (PUBLIC — để <img src> dùng)
//   POST   /  {weightKg,baleCount,note,dataUrl} → ghi nhận (username từ token)        (auth soft)
//   DELETE /:id                   → xoá 1 bản ghi                                     (ADMIN)
// SSE topic 'web2:goods-weight' push realtime (đa máy/đa tab tự cập nhật, không refresh).
// =====================================================

const express = require('express');
const router = express.Router();
const { requireWeb2AuthSoft, requireWeb2Admin } = require('../middleware/web2-auth');

// Ảnh dataUrl base64 (~nén). 12mb dư an toàn.
const jsonBody = express.json({ limit: '12mb' });

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, payload) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:goods-weight',
            { action, ...(payload || {}), ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[WEB2-GOODS-WEIGHT] _notify failed:', e.message);
    }
}

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (_ensuredPools.has(pool)) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_goods_weight (
            id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            username     TEXT NOT NULL DEFAULT '',
            weight_kg    NUMERIC NOT NULL DEFAULT 0,
            bale_count   INTEGER NOT NULL DEFAULT 0,
            note         TEXT NOT NULL DEFAULT '',
            data         BYTEA,
            content_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
            created_at   BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_w2gw_created ON web2_goods_weight(created_at DESC);
    `);
    _ensuredPools.add(pool);
}

// data:image/jpeg;base64,XXXX → { buf, mime }. Trả null nếu không hợp lệ.
function parseDataUrl(dataUrl) {
    const m = /^data:([^;,]+);base64,(.+)$/i.exec(String(dataUrl || ''));
    if (!m) return null;
    const mime = m[1];
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(mime)) return null;
    try {
        const buf = Buffer.from(m[2], 'base64');
        if (!buf.length || buf.length > 11 * 1024 * 1024) return null;
        return { buf, mime };
    } catch {
        return null;
    }
}

function mapRow(x) {
    return {
        id: x.id,
        username: x.username || '',
        weightKg: Number(x.weight_kg) || 0,
        baleCount: Number(x.bale_count) || 0,
        note: x.note || '',
        createdAt: Number(x.created_at) || 0,
        hasImage: x.has_image === true,
    };
}

// GET /list — danh sách mới nhất trước (không trả bytea).
router.get('/list', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = getPool(req);
        await ensureTables(pool);
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const r = await pool.query(
            `SELECT id, username, weight_kg, bale_count, note, created_at, (data IS NOT NULL) AS has_image
             FROM web2_goods_weight ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        const total = (await pool.query(`SELECT COUNT(*)::int AS n FROM web2_goods_weight`)).rows[0]
            .n;
        res.json({ success: true, total, items: r.rows.map(mapRow) });
    } catch (e) {
        console.error('[WEB2-GOODS-WEIGHT] list:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /img/:id — serve ảnh cân (PUBLIC, immutable cache).
router.get('/img/:id', async (req, res) => {
    try {
        const pool = getPool(req);
        await ensureTables(pool);
        const r = await pool.query('SELECT data, content_type FROM web2_goods_weight WHERE id=$1', [
            req.params.id,
        ]);
        if (!r.rows.length || !r.rows[0].data)
            return res.status(404).json({ success: false, error: 'Không có ảnh' });
        const { data, content_type } = r.rows[0];
        res.setHeader('Content-Type', content_type || 'image/jpeg');
        res.setHeader('Content-Length', data.length);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(data);
    } catch (e) {
        console.error('[WEB2-GOODS-WEIGHT] img:', e.message);
        res.status(500).json({ success: false, error: 'Không tải được ảnh' });
    }
});

// POST / — ghi nhận 1 lần cân. username lấy từ token (server-resolved, không tin client).
router.post('/', jsonBody, requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = getPool(req);
        await ensureTables(pool);
        const b = req.body || {};
        const username = (req.web2User && req.web2User.username) || 'unknown';
        const weightKg = Number(b.weightKg);
        const baleCount = Math.round(Number(b.baleCount));
        const note = String(b.note || '').slice(0, 2000);
        if (!Number.isFinite(weightKg) || weightKg <= 0)
            return res.status(400).json({ success: false, error: 'Số kg không hợp lệ' });
        if (!Number.isInteger(baleCount) || baleCount < 1)
            return res.status(400).json({ success: false, error: 'Số kiện phải ≥ 1' });
        const parsed = parseDataUrl(b.dataUrl);
        if (!parsed)
            return res
                .status(400)
                .json({ success: false, error: 'Cần ảnh cân (chụp lại mặt cân)' });
        const now = Date.now();
        const r = await pool.query(
            `INSERT INTO web2_goods_weight (username, weight_kg, bale_count, note, data, content_type, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [username, weightKg, baleCount, note, parsed.buf, parsed.mime, now]
        );
        const id = r.rows[0].id;
        _notify('create', { id });
        res.json({
            success: true,
            item: { id, username, weightKg, baleCount, note, createdAt: now, hasImage: true },
        });
    } catch (e) {
        console.error('[WEB2-GOODS-WEIGHT] create:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /:id — xoá 1 bản ghi (ADMIN — tránh NV xoá nhầm bằng chứng cân).
router.delete('/:id', requireWeb2Admin, async (req, res) => {
    try {
        const pool = getPool(req);
        await ensureTables(pool);
        const r = await pool.query('DELETE FROM web2_goods_weight WHERE id=$1 RETURNING id', [
            req.params.id,
        ]);
        if (!r.rowCount) return res.status(404).json({ success: false, error: 'Không tìm thấy' });
        _notify('delete', { id: req.params.id });
        res.json({ success: true });
    } catch (e) {
        console.error('[WEB2-GOODS-WEIGHT] delete:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
