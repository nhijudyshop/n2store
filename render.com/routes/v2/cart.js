// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — Cart per Pancake Comment
// Trang tpos-pancake panel "Kho SP" → kéo thả SP vào comment khách → giỏ hàng
// được lưu Postgres để KHÔNG mất data + cross-tab/cross-machine sync qua SSE.
//
// Tables:
//   web2_cart_items     — active SP đang trong giỏ (UNIQUE comment_id + product_code, qty++)
//   web2_cart_history   — append-only log mọi add/remove/qty-change
// =====================================================

const express = require('express');
const router = express.Router();

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}

let _migrationDone = false;
async function ensureSchema(pool) {
    if (_migrationDone || !pool) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_cart_items (
            id BIGSERIAL PRIMARY KEY,
            comment_id TEXT NOT NULL,
            customer_id TEXT,
            customer_name TEXT,
            customer_phone TEXT,
            page_id TEXT,
            product_code TEXT NOT NULL,
            product_name TEXT,
            product_image_url TEXT,
            price NUMERIC DEFAULT 0,
            qty INTEGER NOT NULL DEFAULT 1,
            added_by_id TEXT,
            added_by_name TEXT,
            added_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            removed_at TIMESTAMPTZ,
            CONSTRAINT uq_w2_cart_comment_code UNIQUE (comment_id, product_code)
        );
        CREATE INDEX IF NOT EXISTS idx_w2_cart_comment_active
            ON web2_cart_items(comment_id) WHERE removed_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_w2_cart_added ON web2_cart_items(added_at DESC);

        CREATE TABLE IF NOT EXISTS web2_cart_history (
            id BIGSERIAL PRIMARY KEY,
            comment_id TEXT NOT NULL,
            customer_name TEXT,
            customer_phone TEXT,
            page_id TEXT,
            product_code TEXT NOT NULL,
            product_name TEXT,
            action TEXT NOT NULL,
            qty_before INTEGER,
            qty_after INTEGER,
            user_id TEXT,
            user_name TEXT,
            source_page TEXT DEFAULT 'tpos-pancake',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_w2_cart_hist_comment
            ON web2_cart_history(comment_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_w2_cart_hist_created
            ON web2_cart_history(created_at DESC);
    `);
    _migrationDone = true;
    console.log('[web2-cart] schema ready');
}

router.use(async (req, res, next) => {
    try {
        await ensureSchema(req.app.locals.chatDb);
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: 'schema-init: ' + e.message });
    }
});

function _notify(commentId) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:cart', { commentId, ts: Date.now() }, 'update');
    } catch {}
}

async function _logHistory(pool, payload) {
    try {
        await pool.query(
            `INSERT INTO web2_cart_history
             (comment_id, customer_name, customer_phone, page_id, product_code, product_name,
              action, qty_before, qty_after, user_id, user_name)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                payload.comment_id,
                payload.customer_name || null,
                payload.customer_phone || null,
                payload.page_id || null,
                payload.product_code,
                payload.product_name || null,
                payload.action,
                payload.qty_before ?? null,
                payload.qty_after ?? null,
                payload.user_id || null,
                payload.user_name || null,
            ]
        );
    } catch (e) {
        console.warn('[web2-cart] history log fail:', e.message);
    }
}

// GET /cart/:commentId — list active items
router.get('/:commentId', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const r = await pool.query(
            `SELECT id, comment_id, customer_id, customer_name, customer_phone, page_id,
                    product_code, product_name, product_image_url, price, qty,
                    added_by_id, added_by_name, added_at, updated_at
             FROM web2_cart_items
             WHERE comment_id = $1 AND removed_at IS NULL
             ORDER BY added_at ASC`,
            [req.params.commentId]
        );
        res.json({ success: true, items: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /counts?commentIds=a,b,c — batch counts cho badge
router.get('/batch/counts', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const ids = String(req.query.commentIds || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (!ids.length) return res.json({ success: true, counts: {} });
        const r = await pool.query(
            `SELECT comment_id, COUNT(*)::int AS c, SUM(qty)::int AS total_qty
             FROM web2_cart_items
             WHERE comment_id = ANY($1::text[]) AND removed_at IS NULL
             GROUP BY comment_id`,
            [ids]
        );
        const counts = {};
        for (const row of r.rows) {
            counts[row.comment_id] = { items: row.c, qty: row.total_qty };
        }
        res.json({ success: true, counts });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /cart/:commentId/add  body: { product, customer, user, page_id }
// Upsert (qty++ nếu đã có)
router.post('/:commentId/add', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const b = req.body || {};
        const p = b.product || {};
        if (!p.code)
            return res.status(400).json({ success: false, error: 'product.code bắt buộc' });
        const cust = b.customer || {};
        const user = b.user || {};
        const qtyAdd = Number(b.qty) || 1;
        const commentId = req.params.commentId;

        // Get existing (incl removed) để xử lý qty + un-soft-delete
        const existing = await pool.query(
            `SELECT id, qty, removed_at FROM web2_cart_items
             WHERE comment_id = $1 AND product_code = $2`,
            [commentId, p.code]
        );

        let qtyBefore = 0;
        let qtyAfter = qtyAdd;
        if (existing.rowCount > 0) {
            const row = existing.rows[0];
            qtyBefore = row.removed_at ? 0 : Number(row.qty) || 0;
            qtyAfter = qtyBefore + qtyAdd;
            await pool.query(
                `UPDATE web2_cart_items
                 SET qty = $1, removed_at = NULL, updated_at = NOW(),
                     product_name = COALESCE($2, product_name),
                     product_image_url = COALESCE($3, product_image_url),
                     price = COALESCE($4, price),
                     customer_name = COALESCE($5, customer_name),
                     customer_phone = COALESCE($6, customer_phone),
                     customer_id = COALESCE($7, customer_id),
                     page_id = COALESCE($8, page_id)
                 WHERE id = $9`,
                [
                    qtyAfter,
                    p.name || null,
                    p.imageUrl || p.image_url || null,
                    Number(p.price) || null,
                    cust.name || null,
                    cust.phone || null,
                    cust.id || null,
                    b.page_id || null,
                    row.id,
                ]
            );
        } else {
            await pool.query(
                `INSERT INTO web2_cart_items
                 (comment_id, customer_id, customer_name, customer_phone, page_id,
                  product_code, product_name, product_image_url, price, qty,
                  added_by_id, added_by_name)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                [
                    commentId,
                    cust.id || null,
                    cust.name || null,
                    cust.phone || null,
                    b.page_id || null,
                    p.code,
                    p.name || null,
                    p.imageUrl || p.image_url || null,
                    Number(p.price) || 0,
                    qtyAdd,
                    user.id || null,
                    user.name || null,
                ]
            );
        }

        await _logHistory(pool, {
            comment_id: commentId,
            customer_name: cust.name,
            customer_phone: cust.phone,
            page_id: b.page_id,
            product_code: p.code,
            product_name: p.name,
            action: 'add',
            qty_before: qtyBefore,
            qty_after: qtyAfter,
            user_id: user.id,
            user_name: user.name,
        });
        _notify(commentId);
        res.json({ success: true, qty: qtyAfter });
    } catch (e) {
        console.error('[web2-cart] add error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /:commentId/:productCode/remove  body: { user }
router.post('/:commentId/:productCode/remove', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const { commentId, productCode } = req.params;
        const user = (req.body && req.body.user) || {};
        const existing = await pool.query(
            `SELECT id, qty, product_name, customer_name, customer_phone, page_id
             FROM web2_cart_items
             WHERE comment_id = $1 AND product_code = $2 AND removed_at IS NULL`,
            [commentId, productCode]
        );
        if (!existing.rowCount) {
            return res.json({ success: true, alreadyRemoved: true });
        }
        const row = existing.rows[0];
        await pool.query(
            `UPDATE web2_cart_items SET removed_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [row.id]
        );
        await _logHistory(pool, {
            comment_id: commentId,
            customer_name: row.customer_name,
            customer_phone: row.customer_phone,
            page_id: row.page_id,
            product_code: productCode,
            product_name: row.product_name,
            action: 'remove',
            qty_before: row.qty,
            qty_after: 0,
            user_id: user.id,
            user_name: user.name,
        });
        _notify(commentId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /:commentId/clear  body: { user, reason? }
// Xóa toàn bộ SP active của comment (xóa đơn). Soft delete + log mỗi item.
router.post('/:commentId/clear', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const { commentId } = req.params;
        const user = (req.body && req.body.user) || {};
        const reason = (req.body && req.body.reason) || 'clear-order';
        const items = await pool.query(
            `SELECT id, product_code, product_name, qty, customer_name, customer_phone, page_id
             FROM web2_cart_items
             WHERE comment_id = $1 AND removed_at IS NULL`,
            [commentId]
        );
        if (!items.rowCount) {
            return res.json({ success: true, removed: 0 });
        }
        await pool.query(
            `UPDATE web2_cart_items
             SET removed_at = NOW(), updated_at = NOW()
             WHERE comment_id = $1 AND removed_at IS NULL`,
            [commentId]
        );
        for (const row of items.rows) {
            await _logHistory(pool, {
                comment_id: commentId,
                customer_name: row.customer_name,
                customer_phone: row.customer_phone,
                page_id: row.page_id,
                product_code: row.product_code,
                product_name: row.product_name,
                action: 'clear-order',
                qty_before: row.qty,
                qty_after: 0,
                user_id: user.id,
                user_name: user.name,
            });
        }
        _notify(commentId);
        res.json({ success: true, removed: items.rowCount });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// PATCH /:commentId/:productCode  body: { qty, user }
router.patch('/:commentId/:productCode', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const { commentId, productCode } = req.params;
        const b = req.body || {};
        const user = b.user || {};
        const newQty = Math.max(1, Number(b.qty) || 1);
        const existing = await pool.query(
            `SELECT id, qty, product_name, customer_name, customer_phone, page_id
             FROM web2_cart_items
             WHERE comment_id = $1 AND product_code = $2 AND removed_at IS NULL`,
            [commentId, productCode]
        );
        if (!existing.rowCount) {
            return res.status(404).json({ success: false, error: 'not in cart' });
        }
        const row = existing.rows[0];
        const qtyBefore = Number(row.qty) || 0;
        await pool.query(`UPDATE web2_cart_items SET qty = $1, updated_at = NOW() WHERE id = $2`, [
            newQty,
            row.id,
        ]);
        await _logHistory(pool, {
            comment_id: commentId,
            customer_name: row.customer_name,
            customer_phone: row.customer_phone,
            page_id: row.page_id,
            product_code: productCode,
            product_name: row.product_name,
            action: 'qty-change',
            qty_before: qtyBefore,
            qty_after: newQty,
            user_id: user.id,
            user_name: user.name,
        });
        _notify(commentId);
        res.json({ success: true, qty: newQty });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /:commentId/history?limit=200
router.get('/:commentId/history', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const limit = Math.min(Number(req.query.limit) || 200, 1000);
        const r = await pool.query(
            `SELECT id, comment_id, customer_name, customer_phone, product_code, product_name,
                    action, qty_before, qty_after, user_name, created_at
             FROM web2_cart_history
             WHERE comment_id = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [req.params.commentId, limit]
        );
        res.json({ success: true, items: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /history/all?limit=500 — toàn shop, dùng cho audit page
router.get('/history/all', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const limit = Math.min(Number(req.query.limit) || 500, 5000);
        const r = await pool.query(
            `SELECT id, comment_id, customer_name, customer_phone, product_code, product_name,
                    action, qty_before, qty_after, user_name, created_at
             FROM web2_cart_history
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit]
        );
        res.json({ success: true, items: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
