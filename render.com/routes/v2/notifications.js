// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — Notification Center
// In-app notifications cho 13 trang. Producer = các route khác hook vào.
// =====================================================

const express = require('express');
const router = express.Router();
const { requireWeb2AuthSoft } = require('../../middleware/web2-auth');

// Validate url của notification — chỉ nhận https:// , http:// , hoặc path '/'
// (KHÔNG '//' protocol-relative). Ngược lại lưu null — chặn `javascript:` stored
// XSS (server side của S7; frontend render href từ field này).
function _safeUrl(u) {
    if (u == null) return null;
    const s = String(u).trim();
    if (!s) return null;
    if (
        s.startsWith('https://') ||
        s.startsWith('http://') ||
        (s.startsWith('/') && !s.startsWith('//'))
    ) {
        return s;
    }
    console.warn('[WEB2-NOTIF] url không hợp lệ — lưu null:', s.slice(0, 80));
    return null;
}

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}

let _migrationDone = false;
async function ensureSchema(pool) {
    if (_migrationDone) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_notifications (
            id BIGSERIAL PRIMARY KEY,
            user_id TEXT,
            type TEXT NOT NULL,
            entity_type TEXT,
            entity_id TEXT,
            title TEXT NOT NULL,
            body TEXT,
            severity TEXT DEFAULT 'info',
            url TEXT,
            read_at TIMESTAMPTZ,
            dedupe_key TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_web2_noti_user_unread
            ON web2_notifications(user_id, read_at) WHERE read_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_web2_noti_created ON web2_notifications(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_web2_noti_dedupe ON web2_notifications(dedupe_key, created_at DESC)
            WHERE dedupe_key IS NOT NULL;
        -- Atomic dedupe (MEDIUM RACE fix): 2 scan đồng thời cùng dedupe_key trong
        -- cùng giờ → chỉ 1 row insert được (ON CONFLICT DO NOTHING ở INSERT).
        -- date_trunc trên (created_at AT TIME ZONE 'UTC') để biểu thức IMMUTABLE
        -- (date_trunc trực tiếp trên timestamptz là STABLE → không index được).
        CREATE UNIQUE INDEX IF NOT EXISTS uq_web2_noti_dedupe_hour
            ON web2_notifications (dedupe_key, (date_trunc('hour', created_at AT TIME ZONE 'UTC')))
            WHERE dedupe_key IS NOT NULL;
    `);
    _migrationDone = true;
}

router.use(async (req, res, next) => {
    try {
        await ensureSchema(req.app.locals.web2Db || req.app.locals.chatDb);
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: 'schema-init: ' + e.message });
    }
});

// GET /list?unreadOnly=1&limit=50
router.get('/list', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const unreadOnly = req.query.unreadOnly === '1' || req.query.unreadOnly === 'true';
        const where = unreadOnly ? 'WHERE read_at IS NULL' : '';
        const rs = await pool.query(
            `SELECT id, user_id, type, entity_type, entity_id, title, body, severity, url,
                    read_at, created_at
             FROM web2_notifications
             ${where}
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit]
        );
        res.json({ success: true, items: rs.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /unread-count
router.get('/unread-count', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const rs = await pool.query(
            `SELECT COUNT(*)::int AS c FROM web2_notifications WHERE read_at IS NULL`
        );
        res.json({ success: true, count: rs.rows[0]?.c || 0 });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /:id/read
router.post('/:id/read', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        await pool.query(
            `UPDATE web2_notifications SET read_at = NOW() WHERE id = $1 AND read_at IS NULL`,
            [req.params.id]
        );
        _notifyUpdate();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /mark-all-read
router.post('/mark-all-read', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        await pool.query(`UPDATE web2_notifications SET read_at = NOW() WHERE read_at IS NULL`);
        _notifyUpdate();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST / — create notification
// body: { type, title, body?, severity?, url?, entity_type?, entity_id?, dedupe_key? }
router.post('/', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const b = req.body || {};
        if (!b.type || !b.title) {
            return res.status(400).json({ success: false, error: 'type và title bắt buộc' });
        }
        // Dedupe — không insert nếu cùng dedupe_key trong 1h
        if (b.dedupe_key) {
            const dup = await pool.query(
                `SELECT id FROM web2_notifications
                 WHERE dedupe_key = $1 AND created_at > NOW() - INTERVAL '1 hour'
                 LIMIT 1`,
                [b.dedupe_key]
            );
            if (dup.rowCount > 0) {
                return res.json({ success: true, deduped: true, id: dup.rows[0].id });
            }
        }
        const rs = await pool.query(
            `INSERT INTO web2_notifications
             (user_id, type, entity_type, entity_id, title, body, severity, url, dedupe_key)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (dedupe_key, (date_trunc('hour', created_at AT TIME ZONE 'UTC')))
                 WHERE dedupe_key IS NOT NULL DO NOTHING
             RETURNING id, created_at`,
            [
                b.user_id || null,
                b.type,
                b.entity_type || null,
                b.entity_id || null,
                b.title,
                b.body || null,
                b.severity || 'info',
                _safeUrl(b.url),
                b.dedupe_key || null,
            ]
        );
        // ON CONFLICT DO NOTHING → 0 row khi race trùng dedupe_key trong cùng giờ.
        if (!rs.rows.length) {
            return res.json({ success: true, deduped: true });
        }
        _notifyUpdate();
        res.json({ success: true, id: rs.rows[0].id, created_at: rs.rows[0].created_at });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /:id
router.delete('/:id', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        await pool.query(`DELETE FROM web2_notifications WHERE id = $1`, [req.params.id]);
        _notifyUpdate();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /scan — chạy scan định kỳ, tạo noti cho các nguồn pain points (thực tế):
//   1. PBH (fast_sale_orders) state='draft' > 24h
//   2. web2_products stock < 5 (active)
//   3. web2_customer_wallets balance < 0 (ví KH âm — overdraft)
//   4. web2_returns phiếu THU VỀ (shipper gửi) chờ duyệt > 20 ngày
// B5 (2026-06-13): scan logic tách thành pure function để cron gọi được (cron
// KHÔNG thể HTTP GET route do requireWeb2AuthSoft). Route /scan + cron scheduler
// cùng gọi hàm này. Dedupe atomic qua unique index uq_web2_noti_dedupe_hour +
// _insertDedupe pre-check 1h → an toàn chạy song song (manual GET + cron).
async function scanAndCreateNotifications(pool) {
    const created = [];

    // 1. PBH draft > 24h
    const draftRs = await pool.query(
        `SELECT number FROM fast_sale_orders
             WHERE state = 'draft' AND date_created < NOW() - INTERVAL '24 hours'
             LIMIT 50`
    );
    for (const r of draftRs.rows) {
        await _insertDedupe(pool, {
            type: 'pbh_draft_stale',
            title: `PBH ${r.number} chờ xác nhận > 24h`,
            severity: 'warning',
            entity_type: 'fast_sale_order',
            entity_id: r.number,
            url: `/web2/fastsaleorder-invoice/index.html?search=${encodeURIComponent(r.number)}`,
            dedupe_key: `pbh_draft:${r.number}`,
        });
        created.push(r.number);
    }

    // 2. Stock < 5 (only active)
    const stockRs = await pool.query(
        `SELECT code, name, stock FROM web2_products
             WHERE is_active = true AND stock < 5 AND stock >= 0
             LIMIT 50`
    );
    for (const r of stockRs.rows) {
        await _insertDedupe(pool, {
            type: 'stock_low',
            title: `Hàng sắp hết: ${r.code} — ${r.name} (còn ${r.stock})`,
            severity: r.stock === 0 ? 'danger' : 'warning',
            entity_type: 'product',
            entity_id: r.code,
            url: `/web2/products/index.html?search=${encodeURIComponent(r.code)}`,
            dedupe_key: `stock_low:${r.code}`,
        });
        created.push(r.code);
    }

    // 3. Ví KH âm (overdraft) — web2_customer_wallets balance < 0. Defensive
    // (bảng isolated, tạo từ customer_wallets) → bọc try/catch.
    try {
        const odRs = await pool.query(
            `SELECT phone, balance FROM web2_customer_wallets
                 WHERE balance < 0 ORDER BY balance ASC LIMIT 50`
        );
        for (const r of odRs.rows) {
            const amt = Math.abs(Number(r.balance) || 0).toLocaleString('vi-VN');
            await _insertDedupe(pool, {
                type: 'wallet_overdraft',
                title: `Ví KH âm: ${r.phone || '(không SĐT)'} (-${amt}₫)`,
                severity: 'danger',
                entity_type: 'customer_wallet',
                entity_id: r.phone || null,
                url: r.phone
                    ? `/web2/balance-history/index.html?search=${encodeURIComponent(r.phone)}`
                    : null,
                dedupe_key: `wallet_overdraft:${r.phone || 'unknown'}`,
            });
            created.push(r.phone || 'overdraft');
        }
    } catch (e) {
        console.warn('[notifications/scan] wallet_overdraft check fail:', e.message);
    }

    // 4. Phiếu THU VỀ (Shipper gửi) treo chờ duyệt > 20 ngày → nhắc duyệt.
    // Duyệt xong return_qty mới cộng vào tồn thật. Xem web2-returns.js.
    try {
        const retRs = await pool.query(
            `SELECT code, customer_name FROM web2_returns
                 WHERE method = 'shipper_gui' AND stock_status = 'pending' AND status = 'active'
                   AND created_at < (EXTRACT(EPOCH FROM NOW()) * 1000) - (20 * 24 * 3600 * 1000)
                 LIMIT 50`
        );
        for (const r of retRs.rows) {
            await _insertDedupe(pool, {
                type: 'return_overdue',
                title: `Thu về ${r.code} chờ duyệt > 20 ngày${r.customer_name ? ' — ' + r.customer_name : ''}`,
                severity: 'warning',
                entity_type: 'web2_return',
                entity_id: r.code,
                url: `/web2/returns/index.html?tab=pending&search=${encodeURIComponent(r.code)}`,
                dedupe_key: `return_overdue:${r.code}`,
            });
            created.push(r.code);
        }
    } catch (e) {
        console.warn('[notifications/scan] return_overdue check fail:', e.message);
    }

    // 5. Đợt Sổ Order cũ chưa nhận đủ hàng (Hướng E 2026-06-14) — nhắc theo dõi NCC.
    // so-order = 1 doc JSONB web2_so_order (C8); parse trong JS (1 doc, rẻ). Đợt có
    // ngày tạo > 21 ngày mà còn SP status≠'received' → nhắc. Dedupe 12h (điều kiện
    // sống dài → tránh spam mỗi giờ như alert biến động nhanh). Link qua deep-link ?tab=.
    try {
        const soRs = await pool.query(`SELECT data FROM web2_so_order WHERE doc_id = 'main'`);
        const doc = soRs.rows[0]?.data;
        if (doc && Array.isArray(doc.tabs)) {
            const cutoff = Date.now() - 21 * 24 * 3600 * 1000;
            let added = 0;
            for (const tab of doc.tabs) {
                for (const sh of tab.shipments || []) {
                    if (added >= 25) break;
                    const d = sh.date ? Date.parse(sh.date) : NaN;
                    if (!d || d > cutoff) continue;
                    const pending = (sh.rows || []).filter((r) => r && r.status !== 'received');
                    if (!pending.length) continue;
                    const sups = [
                        ...new Set(pending.map((r) => (r.supplier || '').trim()).filter(Boolean)),
                    ];
                    const supLabel =
                        sups.slice(0, 2).join(', ') +
                        (sups.length > 2 ? ` +${sups.length - 2}` : '');
                    const dedupeKey = `so_unreceived:${sh.id}`;
                    // Dedupe 12h riêng (không dùng _insertDedupe 1h) — điều kiện dài hạn.
                    const dup = await pool.query(
                        `SELECT id FROM web2_notifications
                         WHERE dedupe_key = $1 AND created_at > NOW() - INTERVAL '12 hours' LIMIT 1`,
                        [dedupeKey]
                    );
                    if (dup.rowCount > 0) continue;
                    await pool.query(
                        `INSERT INTO web2_notifications
                         (type, entity_type, entity_id, title, severity, url, dedupe_key)
                         VALUES ($1,$2,$3,$4,$5,$6,$7)
                         ON CONFLICT (dedupe_key, (date_trunc('hour', created_at AT TIME ZONE 'UTC')))
                             WHERE dedupe_key IS NOT NULL DO NOTHING`,
                        [
                            'so_shipment_unreceived',
                            'so_shipment',
                            sh.id || null,
                            `Đợt ${sh.batch || sh.date} (${tab.label || ''}) chưa nhận ${pending.length} SP${supLabel ? ' — ' + supLabel : ''}`,
                            'info',
                            _safeUrl(
                                `/so-order/index.html?tab=${encodeURIComponent(tab.id || '')}`
                            ),
                            dedupeKey,
                        ]
                    );
                    created.push(sh.id || 'so_unreceived');
                    added++;
                }
            }
        }
    } catch (e) {
        console.warn('[notifications/scan] so_unreceived check fail:', e.message);
    }

    _notifyUpdate();
    return created;
}

// GET /scan — manual trigger (cũng được cron gọi mỗi 10' qua scheduler.js).
router.get('/scan', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const created = await scanAndCreateNotifications(pool);
        res.json({ success: true, created: created.length, sample: created.slice(0, 10) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

async function _insertDedupe(pool, n) {
    if (n.dedupe_key) {
        const dup = await pool.query(
            `SELECT id FROM web2_notifications
             WHERE dedupe_key = $1 AND created_at > NOW() - INTERVAL '1 hour' LIMIT 1`,
            [n.dedupe_key]
        );
        if (dup.rowCount > 0) return null;
    }
    const rs = await pool.query(
        `INSERT INTO web2_notifications
         (type, entity_type, entity_id, title, body, severity, url, dedupe_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (dedupe_key, (date_trunc('hour', created_at AT TIME ZONE 'UTC')))
             WHERE dedupe_key IS NOT NULL DO NOTHING
         RETURNING id`,
        [
            n.type,
            n.entity_type || null,
            n.entity_id || null,
            n.title,
            n.body || null,
            n.severity || 'info',
            _safeUrl(n.url),
            n.dedupe_key || null,
        ]
    );
    return rs.rows[0]?.id || null; // 0 row = race trùng (ON CONFLICT DO NOTHING)
}

function _notifyUpdate() {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:notifications', { ts: Date.now() }, 'update');
    } catch (_) {}
}

// Tạo notification server-side (dùng chung — vd intent detector, watcher).
// data = { type, title, body?, severity?, url?, entity_type?, entity_id?, dedupe_key?, user_id? }
// Best-effort: trả id hoặc null, không throw.
async function createNotification(pool, data) {
    if (!pool || !data || !data.type || !data.title) return null;
    try {
        if (data.dedupe_key) {
            const dup = await pool.query(
                `SELECT id FROM web2_notifications
                 WHERE dedupe_key = $1 AND created_at > NOW() - INTERVAL '1 hour' LIMIT 1`,
                [data.dedupe_key]
            );
            if (dup.rowCount > 0) return dup.rows[0].id;
        }
        const rs = await pool.query(
            `INSERT INTO web2_notifications
             (user_id, type, entity_type, entity_id, title, body, severity, url, dedupe_key)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (dedupe_key, (date_trunc('hour', created_at AT TIME ZONE 'UTC')))
                 WHERE dedupe_key IS NOT NULL DO NOTHING
             RETURNING id`,
            [
                data.user_id || null,
                data.type,
                data.entity_type || null,
                data.entity_id || null,
                data.title,
                data.body || null,
                data.severity || 'info',
                _safeUrl(data.url),
                data.dedupe_key || null,
            ]
        );
        if (!rs.rows.length) return null; // race trùng dedupe trong cùng giờ
        _notifyUpdate();
        return rs.rows[0].id;
    } catch (e) {
        console.warn('[WEB2-NOTIF] createNotification failed:', e.message);
        return null;
    }
}

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
module.exports.createNotification = createNotification;
module.exports.scanAndCreateNotifications = scanAndCreateNotifications; // B5: cron gọi
