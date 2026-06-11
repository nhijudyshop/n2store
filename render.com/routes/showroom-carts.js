// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// SHOWROOM VISITOR CARTS REST API  (Web 1.0 — pool chatDb)
// Giỏ hàng khách vãng lai cho /showroom1/. Mỗi visitor được cấp mã định danh
// tăng dần từ 1 (BIGSERIAL) + token bí mật (chống đoán ID tuần tự để sửa giỏ
// người khác). Khách chốt đơn bằng cách gọi/nhắn mã cho shop → shop tra giỏ
// trong admin panel showroom1. Realtime: Web 1.0 SSE hub, topic 'showroom_carts'.
// Mounted at /api/showroom-carts (see server.js). Tất cả endpoints PUBLIC
// (khách ẩn danh) — write yêu cầu token, admin list không trả token.
// =====================================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const SSE_KEY = 'showroom_carts';
const MAX_ITEMS = 50;
const MAX_QTY = 99;
const MAX_NAME_LEN = 200;
const MAX_PRODUCT_ID_LEN = 64;
const MAX_IMAGE_LEN = 500;
const MAX_ITEMS_JSON_BYTES = 50_000;
const MAX_RECENT = 100;
const REGISTER_LIMIT_PER_IP = 10; // mỗi giờ, in-memory (reset khi deploy — chấp nhận)
const REGISTER_LIMIT_GLOBAL = 500; // mỗi giờ, đếm trong DB — phòng tuyến chính
const EMPTY_CART_TTL_DAYS = 30;

// ----- SSE notifier (injected from server.js) -----
let notifyClients = null;
function initializeNotifiers(notify) {
    notifyClients = notify;
    console.log('[SHOWROOM-CARTS] SSE notifier initialized');
}
function broadcast(action, payload) {
    if (typeof notifyClients !== 'function') return;
    try {
        notifyClients(SSE_KEY, { action, ...payload, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[SHOWROOM-CARTS] broadcast failed:', e.message);
    }
}

// ----- Lazy schema (idempotent, runs on first request — survives fresh deploy) -----
let _tablesReady = false;
async function ensureTables(pool) {
    if (_tablesReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS showroom_carts (
            visitor_id BIGSERIAL PRIMARY KEY,
            token      TEXT NOT NULL,
            items      JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_showroom_carts_updated
            ON showroom_carts(updated_at DESC);
    `);
    _tablesReady = true;
}

function getDb(req) {
    return req.app.locals.chatDb;
}

// ----- helpers -----
function sanitizeString(v, maxLen) {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    if (!t || t.length > maxLen) return null;
    return t;
}
function toIntOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : null;
}
function newToken() {
    return crypto.randomBytes(16).toString('hex'); // 32 hex chars
}
function isValidToken(t) {
    return typeof t === 'string' && /^[a-f0-9]{32}$/.test(t);
}
function parseVisitorId(raw) {
    if (typeof raw !== 'string' || !/^\d{1,12}$/.test(raw)) return null;
    return Number(raw);
}

// Item names/images là dữ liệu khách tự gửi và sẽ render trong admin panel
// → strip <> server-side (defense-in-depth, client vẫn phải escape khi render).
function sanitizeItems(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (const x of raw) {
        if (!x || typeof x !== 'object') continue;
        const productId = sanitizeString(x.productId, MAX_PRODUCT_ID_LEN);
        if (!productId || seen.has(productId)) continue;
        const name = (sanitizeString(x.name, MAX_NAME_LEN) || '').replace(/[<>]/g, '');
        const price = toIntOrNull(x.price) ?? 0;
        let qty = toIntOrNull(x.qty) ?? 1;
        qty = Math.max(1, Math.min(MAX_QTY, qty));
        let image = null;
        if (typeof x.image === 'string' && x.image.startsWith('https://') && x.image.length <= MAX_IMAGE_LEN) {
            image = x.image;
        }
        seen.add(productId);
        out.push({ productId, name, price, qty, image });
        if (out.length >= MAX_ITEMS) break;
    }
    return out;
}

function rowToCart(r) {
    const items = Array.isArray(r.items) ? r.items : [];
    return {
        visitorId: Number(r.visitor_id),
        items,
        itemCount: items.reduce((s, it) => s + (Number(it.qty) || 0), 0),
        total: items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0),
        createdAt: r.created_at ? r.created_at.getTime() : null,
        updatedAt: r.updated_at ? r.updated_at.getTime() : null,
    };
}

// ----- in-memory per-IP register throttle -----
const _ipHits = new Map(); // ip → {count, windowStart}
function ipThrottled(req) {
    const ip =
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.ip ||
        'unknown';
    const now = Date.now();
    const slot = _ipHits.get(ip);
    if (!slot || now - slot.windowStart > 3600_000) {
        _ipHits.set(ip, { count: 1, windowStart: now });
        if (_ipHits.size > 5000) _ipHits.clear(); // chống phình memory
        return false;
    }
    slot.count++;
    return slot.count > REGISTER_LIMIT_PER_IP;
}

// =====================================================
// ROUTES
// =====================================================

// POST /visitors — cấp mã định danh mới (1, 2, 3, ...). Public, không body.
router.post('/visitors', async (req, res) => {
    try {
        const pool = getDb(req);
        if (!pool) return res.status(500).json({ success: false, error: 'Database not available' });
        await ensureTables(pool);

        if (ipThrottled(req)) {
            return res.status(429).json({ success: false, error: 'Quá nhiều đăng ký từ địa chỉ này, thử lại sau' });
        }
        const cnt = await pool.query(
            `SELECT COUNT(*)::int AS n FROM showroom_carts WHERE created_at > NOW() - INTERVAL '1 hour'`
        );
        if (cnt.rows[0].n >= REGISTER_LIMIT_GLOBAL) {
            return res.status(429).json({ success: false, error: 'Quá nhiều đăng ký, thử lại sau' });
        }

        // Cleanup cơ hội: xóa giỏ rỗng bỏ hoang > 30 ngày (~4% requests)
        if (Math.random() < 0.04) {
            pool.query(
                `DELETE FROM showroom_carts
                 WHERE items = '[]'::jsonb AND updated_at < NOW() - INTERVAL '${EMPTY_CART_TTL_DAYS} days'`
            ).catch((e) => console.warn('[SHOWROOM-CARTS] cleanup failed:', e.message));
        }

        const token = newToken();
        const result = await pool.query(
            `INSERT INTO showroom_carts (token) VALUES ($1) RETURNING visitor_id`,
            [token]
        );
        res.json({ success: true, visitorId: Number(result.rows[0].visitor_id), token });
    } catch (error) {
        console.error('[SHOWROOM-CARTS] POST /visitors error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET / — admin list/lookup. ?recent=N (default 30, chỉ giỏ có items) hoặc ?id=123.
// Không bao giờ trả token.
router.get('/', async (req, res) => {
    try {
        const pool = getDb(req);
        if (!pool) return res.status(500).json({ success: false, error: 'Database not available' });
        await ensureTables(pool);

        if (req.query.id !== undefined) {
            const id = parseVisitorId(String(req.query.id));
            if (id === null) return res.status(400).json({ success: false, error: 'id không hợp lệ' });
            const r = await pool.query(
                `SELECT visitor_id, items, created_at, updated_at FROM showroom_carts WHERE visitor_id = $1`,
                [id]
            );
            return res.json({ success: true, carts: r.rows.map(rowToCart) });
        }

        let recent = toIntOrNull(req.query.recent) ?? 30;
        recent = Math.max(1, Math.min(MAX_RECENT, recent));
        const r = await pool.query(
            `SELECT visitor_id, items, created_at, updated_at FROM showroom_carts
             WHERE jsonb_array_length(items) > 0
             ORDER BY updated_at DESC
             LIMIT $1`,
            [recent]
        );
        res.json({ success: true, carts: r.rows.map(rowToCart) });
    } catch (error) {
        console.error('[SHOWROOM-CARTS] GET / error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /:id?token= — khách đọc giỏ của chính mình.
router.get('/:id', async (req, res) => {
    try {
        const pool = getDb(req);
        if (!pool) return res.status(500).json({ success: false, error: 'Database not available' });
        await ensureTables(pool);

        const id = parseVisitorId(req.params.id);
        if (id === null) return res.status(400).json({ success: false, error: 'id không hợp lệ' });
        if (!isValidToken(req.query.token)) return res.status(403).json({ success: false, error: 'invalid token' });

        const r = await pool.query(
            `SELECT visitor_id, token, items, created_at, updated_at FROM showroom_carts WHERE visitor_id = $1`,
            [id]
        );
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'visitor not found' });
        if (r.rows[0].token !== req.query.token) return res.status(403).json({ success: false, error: 'invalid token' });

        res.json({ success: true, cart: rowToCart(r.rows[0]) });
    } catch (error) {
        console.error('[SHOWROOM-CARTS] GET /:id error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /:id — full-replace items. Body {token, items}. Auth+write 1 câu SQL (không race).
router.put('/:id', async (req, res) => {
    try {
        const pool = getDb(req);
        if (!pool) return res.status(500).json({ success: false, error: 'Database not available' });
        await ensureTables(pool);

        const id = parseVisitorId(req.params.id);
        if (id === null) return res.status(400).json({ success: false, error: 'id không hợp lệ' });
        const token = req.body?.token;
        if (!isValidToken(token)) return res.status(403).json({ success: false, error: 'invalid token' });

        const items = sanitizeItems(req.body?.items);
        const json = JSON.stringify(items);
        if (json.length > MAX_ITEMS_JSON_BYTES) {
            return res.status(400).json({ success: false, error: 'Giỏ hàng quá lớn' });
        }

        const r = await pool.query(
            `UPDATE showroom_carts SET items = $1::jsonb, updated_at = NOW()
             WHERE visitor_id = $2 AND token = $3
             RETURNING visitor_id, items, created_at, updated_at`,
            [json, id, token]
        );
        if (r.rowCount === 0) {
            const exists = await pool.query(`SELECT 1 FROM showroom_carts WHERE visitor_id = $1`, [id]);
            if (exists.rowCount === 0) return res.status(404).json({ success: false, error: 'visitor not found' });
            return res.status(403).json({ success: false, error: 'invalid token' });
        }

        const cart = rowToCart(r.rows[0]);
        broadcast('updated', { visitorId: cart.visitorId, itemCount: cart.itemCount });
        res.json({ success: true, cart });
    } catch (error) {
        console.error('[SHOWROOM-CARTS] PUT /:id error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
