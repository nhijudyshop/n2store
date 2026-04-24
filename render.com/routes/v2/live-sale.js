// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * API V2 - LIVE SALE (web-native TPOS replacement)
 * =====================================================
 *
 * Routes:
 *   GET    /pages                       - FB pages the system has tokens for
 *   GET    /live-videos?page_id=...     - Live/recent videos of a page
 *   POST   /live-sessions               - Upsert a live session record
 *   GET    /live-sessions?page_id=...   - List sessions
 *
 *   GET    /products?q=&top=            - Search products
 *   POST   /products                    - Create product
 *   PATCH  /products/:id                - Update product
 *
 *   GET    /orders?fb_user_id=&top=     - Latest order(s) for a FB user
 *   GET    /orders/:id                  - Order detail with lines
 *   POST   /orders                      - Create draft order from a comment
 *   PATCH  /orders/:id                  - Update status/note/customer
 *   POST   /orders/:id/confirm          - Mark confirmed
 *   POST   /orders/:id/cancel           - Mark cancelled
 *
 *   GET    /comment-orders?post_id=...  - Session-index map (fb_user_id → badge)
 *   GET    /partners/:fbUserId          - Customer info for a FB user
 *
 * Schema: see migrations/060_live_sale_schema.sql
 * =====================================================
 */

const express = require('express');
const router = express.Router();

function handleError(res, err, label) {
    console.error(`[LIVE-SALE] ${label}:`, err.message);
    res.status(500).json({ success: false, error: label, details: err.message });
}

function nextOrderCode() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const rnd = Math.floor(Math.random() * 9000) + 1000;
    return `LS-${y}${m}${day}-${rnd}`;
}

// =====================================================
// PAGES & LIVE VIDEOS
// =====================================================

/**
 * GET /api/v2/live-sale/pages
 * Returns FB pages available — derived from pancake_page_access_tokens
 * which already stores (page_id, token, page_name). Each row becomes a
 * selectable page in the LiveSale column.
 */
router.get('/pages', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });

    try {
        // Merge Pancake pages + any pages with direct FB Graph tokens.
        const r = await db.query(`
            WITH combined AS (
                SELECT page_id, page_name, updated_at, FALSE AS has_fb_token
                  FROM pancake_page_access_tokens
                UNION ALL
                SELECT fb_page_id AS page_id, page_name, updated_at, TRUE AS has_fb_token
                  FROM live_sale_fb_tokens
            )
            SELECT page_id,
                   MAX(page_name)  AS page_name,
                   BOOL_OR(has_fb_token) AS has_fb_token,
                   MAX(updated_at) AS updated_at
              FROM combined
             GROUP BY page_id
             ORDER BY COALESCE(MAX(page_name), page_id) ASC
        `);
        const pages = r.rows.map((row) => ({
            id: row.page_id,
            fb_page_id: row.page_id,
            name: row.page_name || row.page_id,
            has_fb_token: row.has_fb_token,
            updated_at: row.updated_at,
        }));
        res.json({ success: true, data: { pages } });
    } catch (err) {
        handleError(res, err, 'pages list failed');
    }
});

// =====================================================
// FB GRAPH PAGE ACCESS TOKENS (admin-managed)
// =====================================================

router.get('/fb-tokens', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    try {
        const r = await db.query(
            `SELECT fb_page_id, page_name, expires_at, generated_by, updated_at
               FROM live_sale_fb_tokens
              ORDER BY updated_at DESC`,
        );
        res.json({ success: true, data: { tokens: r.rows } });
    } catch (err) {
        handleError(res, err, 'fb-tokens list failed');
    }
});

router.put('/fb-tokens/:pageId', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const { pageId } = req.params;
    const { access_token, page_name, expires_at } = req.body || {};
    if (!access_token) return res.status(400).json({ success: false, error: 'access_token required' });
    try {
        const r = await db.query(
            `INSERT INTO live_sale_fb_tokens (fb_page_id, access_token, page_name, expires_at, generated_by, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (fb_page_id) DO UPDATE
               SET access_token = EXCLUDED.access_token,
                   page_name    = COALESCE(EXCLUDED.page_name, live_sale_fb_tokens.page_name),
                   expires_at   = COALESCE(EXCLUDED.expires_at, live_sale_fb_tokens.expires_at),
                   generated_by = COALESCE(EXCLUDED.generated_by, live_sale_fb_tokens.generated_by),
                   updated_at   = NOW()
             RETURNING fb_page_id, page_name, expires_at, generated_by, updated_at`,
            [pageId, access_token, page_name || null, expires_at || null, req.headers['x-user'] || null],
        );
        res.json({ success: true, data: r.rows[0] });
    } catch (err) {
        handleError(res, err, 'fb-token upsert failed');
    }
});

router.delete('/fb-tokens/:pageId', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    try {
        await db.query('DELETE FROM live_sale_fb_tokens WHERE fb_page_id = $1', [req.params.pageId]);
        res.json({ success: true });
    } catch (err) {
        handleError(res, err, 'fb-token delete failed');
    }
});

/**
 * GET /api/v2/live-sale/live-videos?page_id=...
 * Hits FB Graph directly using the stored page_access_token.
 * Returns recent live_videos for that page.
 */
router.get('/live-videos', async (req, res) => {
    const db = req.app.locals.chatDb;
    const pageId = req.query.page_id;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    if (!pageId) return res.status(400).json({ success: false, error: 'page_id required' });

    try {
        // Prefer a real FB Graph token from live_sale_fb_tokens.
        // Pancake JWTs (pancake_page_access_tokens) are NOT valid for graph.facebook.com —
        // FB will reject them with OAuthException code 190 / "Bad signature".
        const fbRow = await db.query(
            'SELECT access_token FROM live_sale_fb_tokens WHERE fb_page_id = $1 LIMIT 1',
            [pageId],
        );
        const fbToken = fbRow.rows[0]?.access_token;

        if (!fbToken) {
            // No FB Graph token configured for this page. Don't fail the UI —
            // tell the frontend to show a "paste post ID" input instead.
            return res.json({
                success: true,
                data: { videos: [] },
                hint: 'no_fb_token',
                message: 'Chưa có FB Graph token cho page này. Dán Post ID thủ công hoặc set token qua PUT /api/v2/live-sale/fb-tokens/:page_id.',
            });
        }

        const fields = 'id,title,description,status,permalink_url,creation_time,embed_html';
        const fbUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}/live_videos?fields=${fields}&limit=20&access_token=${encodeURIComponent(fbToken)}`;

        const resp = await fetch(fbUrl);
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            // Graceful fallback — return empty list with a hint so UI stays usable.
            return res.json({
                success: true,
                data: { videos: [] },
                hint: 'fb_graph_failed',
                message: `FB Graph trả lỗi ${resp.status}. Token có thể đã hết hạn — cập nhật qua PUT /api/v2/live-sale/fb-tokens/:page_id.`,
                details: text.slice(0, 300),
            });
        }
        const body = await resp.json();
        const videos = (body.data || []).map((v) => ({
            id: v.id,
            fb_post_id: v.id,
            fb_live_id: v.id,
            title: v.title || v.description || `Live ${v.id}`,
            status: v.status,
            created_time: v.creation_time,
            permalink_url: v.permalink_url,
            page_name: '',
        }));
        res.json({ success: true, data: { videos } });
    } catch (err) {
        // Last-resort soft-fail: keep UI alive with empty list + error info
        console.warn('[LIVE-SALE] live-videos fetch failed:', err.message);
        res.json({
            success: true,
            data: { videos: [] },
            hint: 'error',
            message: err.message,
        });
    }
});

// =====================================================
// LIVE SESSIONS (cached live_video records)
// =====================================================

router.post('/live-sessions', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const { fb_page_id, fb_post_id, fb_live_id, title, status } = req.body || {};
    if (!fb_page_id || !fb_post_id) {
        return res.status(400).json({ success: false, error: 'fb_page_id + fb_post_id required' });
    }
    try {
        const r = await db.query(
            `INSERT INTO live_sale_live_sessions (fb_page_id, fb_post_id, fb_live_id, title, status)
             VALUES ($1, $2, $3, $4, COALESCE($5, 'live'))
             ON CONFLICT (fb_page_id, fb_post_id) DO UPDATE
               SET title = COALESCE(EXCLUDED.title, live_sale_live_sessions.title),
                   status = COALESCE(EXCLUDED.status, live_sale_live_sessions.status),
                   fb_live_id = COALESCE(EXCLUDED.fb_live_id, live_sale_live_sessions.fb_live_id)
             RETURNING *`,
            [fb_page_id, fb_post_id, fb_live_id, title, status],
        );
        res.json({ success: true, data: r.rows[0] });
    } catch (err) {
        handleError(res, err, 'live-sessions upsert failed');
    }
});

router.get('/live-sessions', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const pageId = req.query.page_id;
    try {
        const r = pageId
            ? await db.query(
                  'SELECT * FROM live_sale_live_sessions WHERE fb_page_id = $1 ORDER BY started_at DESC LIMIT 50',
                  [pageId],
              )
            : await db.query('SELECT * FROM live_sale_live_sessions ORDER BY started_at DESC LIMIT 50');
        res.json({ success: true, data: { sessions: r.rows } });
    } catch (err) {
        handleError(res, err, 'live-sessions list failed');
    }
});

// =====================================================
// PRODUCTS
// =====================================================

router.get('/products', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const q = (req.query.q || '').trim();
    const top = Math.min(parseInt(req.query.top, 10) || 50, 200);
    try {
        const r = q
            ? await db.query(
                  `SELECT * FROM live_sale_products
                    WHERE is_active = TRUE AND (name ILIKE $1 OR sku ILIKE $1)
                    ORDER BY updated_at DESC LIMIT $2`,
                  [`%${q}%`, top],
              )
            : await db.query(
                  'SELECT * FROM live_sale_products WHERE is_active = TRUE ORDER BY updated_at DESC LIMIT $1',
                  [top],
              );
        res.json({ success: true, data: { products: r.rows } });
    } catch (err) {
        handleError(res, err, 'products search failed');
    }
});

router.post('/products', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const { sku, name, default_price, image_url, tpos_product_id, attributes } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    try {
        const r = await db.query(
            `INSERT INTO live_sale_products (sku, name, default_price, image_url, tpos_product_id, attributes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [sku || null, name, default_price || 0, image_url || null, tpos_product_id || null, attributes || {}, req.headers['x-user'] || null],
        );
        res.json({ success: true, data: r.rows[0] });
    } catch (err) {
        handleError(res, err, 'product create failed');
    }
});

router.patch('/products/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'invalid id' });
    const allowed = ['sku', 'name', 'default_price', 'image_url', 'tpos_product_id', 'attributes', 'is_active'];
    const fields = [];
    const values = [];
    for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) {
            values.push(req.body[k]);
            fields.push(`${k} = $${values.length}`);
        }
    }
    if (fields.length === 0) return res.status(400).json({ success: false, error: 'no fields' });
    values.push(id);
    try {
        const r = await db.query(
            `UPDATE live_sale_products SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
            values,
        );
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'not found' });
        res.json({ success: true, data: r.rows[0] });
    } catch (err) {
        handleError(res, err, 'product update failed');
    }
});

// =====================================================
// ORDERS
// =====================================================

router.get('/orders', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const { fb_user_id, fb_post_id, status, top } = req.query;
    const limit = Math.min(parseInt(top, 10) || 20, 200);

    const where = [];
    const values = [];
    if (fb_user_id) { values.push(fb_user_id); where.push(`fb_user_id = $${values.length}`); }
    if (fb_post_id) { values.push(fb_post_id); where.push(`fb_post_id = $${values.length}`); }
    if (status)     { values.push(status);     where.push(`status = $${values.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    values.push(limit);

    try {
        const r = await db.query(
            `SELECT * FROM live_sale_orders ${whereSql} ORDER BY created_at DESC LIMIT $${values.length}`,
            values,
        );
        res.json({ success: true, data: { orders: r.rows } });
    } catch (err) {
        handleError(res, err, 'orders list failed');
    }
});

router.get('/orders/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'invalid id' });
    try {
        const [hdr, lines] = await Promise.all([
            db.query('SELECT * FROM live_sale_orders WHERE id = $1', [id]),
            db.query('SELECT * FROM live_sale_order_lines WHERE order_id = $1 ORDER BY id ASC', [id]),
        ]);
        if (hdr.rows.length === 0) return res.status(404).json({ success: false, error: 'not found' });
        res.json({ success: true, data: { ...hdr.rows[0], lines: lines.rows } });
    } catch (err) {
        handleError(res, err, 'order detail failed');
    }
});

router.post('/orders', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const {
        customer_id,
        live_session_id,
        session_index,
        fb_user_id,
        fb_user_name,
        fb_post_id,
        fb_comment_id,
        note,
        lines,
    } = req.body || {};
    const createdBy = req.headers['x-user'] || null;

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const code = nextOrderCode();
        const orderRes = await client.query(
            `INSERT INTO live_sale_orders
                (code, customer_id, live_session_id, session_index, fb_user_id, fb_user_name,
                 fb_post_id, fb_comment_id, note, status, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10)
             RETURNING *`,
            [code, customer_id || null, live_session_id || null, session_index || null,
             fb_user_id || null, fb_user_name || null, fb_post_id || null,
             fb_comment_id || null, note || null, createdBy],
        );
        const order = orderRes.rows[0];

        if (Array.isArray(lines) && lines.length > 0) {
            for (const line of lines) {
                await client.query(
                    `INSERT INTO live_sale_order_lines (order_id, product_id, product_name, sku, quantity, unit_price)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [order.id, line.product_id || null, line.product_name || line.name || 'Item',
                     line.sku || null, line.quantity || 1, line.unit_price || line.price || 0],
                );
            }
        }

        if (fb_post_id && fb_user_id) {
            await client.query(
                `INSERT INTO live_sale_comment_orders (fb_post_id, fb_user_id, order_id, order_code, session_index)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (fb_post_id, fb_user_id) DO UPDATE
                   SET order_id = EXCLUDED.order_id,
                       order_code = EXCLUDED.order_code,
                       session_index = COALESCE(EXCLUDED.session_index, live_sale_comment_orders.session_index)`,
                [fb_post_id, fb_user_id, order.id, order.code, session_index || null],
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, data: order });
    } catch (err) {
        await client.query('ROLLBACK');
        handleError(res, err, 'order create failed');
    } finally {
        client.release();
    }
});

router.patch('/orders/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'invalid id' });

    const allowed = ['customer_id', 'session_index', 'fb_user_name', 'note', 'status', 'live_session_id'];
    const fields = [];
    const values = [];
    for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) {
            values.push(req.body[k]);
            fields.push(`${k} = $${values.length}`);
        }
    }
    if (fields.length === 0) return res.status(400).json({ success: false, error: 'no fields' });
    values.push(id);
    try {
        const r = await db.query(
            `UPDATE live_sale_orders SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
            values,
        );
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'not found' });
        res.json({ success: true, data: r.rows[0] });
    } catch (err) {
        handleError(res, err, 'order update failed');
    }
});

router.post('/orders/:id/confirm', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const id = parseInt(req.params.id, 10);
    try {
        const r = await db.query(
            `UPDATE live_sale_orders SET status = 'confirmed' WHERE id = $1 RETURNING *`,
            [id],
        );
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'not found' });
        res.json({ success: true, data: r.rows[0] });
    } catch (err) {
        handleError(res, err, 'order confirm failed');
    }
});

router.post('/orders/:id/cancel', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const id = parseInt(req.params.id, 10);
    try {
        const r = await db.query(
            `UPDATE live_sale_orders SET status = 'cancelled' WHERE id = $1 RETURNING *`,
            [id],
        );
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'not found' });
        res.json({ success: true, data: r.rows[0] });
    } catch (err) {
        handleError(res, err, 'order cancel failed');
    }
});

// =====================================================
// COMMENT → ORDER MAP (SessionIndex)
// =====================================================

router.get('/comment-orders', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const postId = req.query.post_id;
    if (!postId) return res.status(400).json({ success: false, error: 'post_id required' });
    try {
        const r = await db.query(
            'SELECT fb_user_id, order_id, order_code, session_index FROM live_sale_comment_orders WHERE fb_post_id = $1',
            [postId],
        );
        const map = {};
        for (const row of r.rows) {
            map[row.fb_user_id] = {
                order_id: row.order_id,
                order_code: row.order_code,
                session_index: row.session_index,
            };
        }
        res.json({ success: true, data: map });
    } catch (err) {
        handleError(res, err, 'comment-orders fetch failed');
    }
});

// =====================================================
// PARTNER lookup (Customer 360 proxy)
// =====================================================

router.get('/partners/:fbUserId', async (req, res) => {
    const db = req.app.locals.chatDb;
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const fbUserId = req.params.fbUserId;
    try {
        const customerRes = await db.query(
            `SELECT id, phone, name, email, address, facebook_id
               FROM customers WHERE facebook_id = $1 LIMIT 1`,
            [fbUserId],
        );

        if (customerRes.rows.length === 0) {
            return res.json({ success: true, data: null });
        }
        const c = customerRes.rows[0];

        const lastOrderRes = await db.query(
            `SELECT id, code, total, status, created_at
               FROM live_sale_orders
              WHERE customer_id = $1 OR fb_user_id = $2
              ORDER BY created_at DESC LIMIT 1`,
            [c.id, fbUserId],
        );

        res.json({
            success: true,
            data: {
                Partner: {
                    Id: c.id,
                    Name: c.name,
                    Phone: c.phone,
                    Email: c.email,
                    Street: c.address,
                    Facebook_Id: c.facebook_id,
                },
                Order: lastOrderRes.rows[0] || null,
            },
        });
    } catch (err) {
        handleError(res, err, 'partner lookup failed');
    }
});

// =====================================================
// SCHEMA BOOTSTRAP (idempotent, runs on server startup)
// =====================================================

async function ensureLiveSaleSchema(pool) {
    if (!pool) return;
    const fs = require('fs');
    const path = require('path');
    const sqlPath = path.join(__dirname, '..', '..', 'migrations', '060_live_sale_schema.sql');
    try {
        if (!fs.existsSync(sqlPath)) {
            console.warn('[LIVE-SALE] migration SQL not found:', sqlPath);
            return;
        }
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await pool.query(sql);
        console.log('[LIVE-SALE] schema ensured (060_live_sale_schema.sql)');
    } catch (err) {
        console.warn('[LIVE-SALE] ensureLiveSaleSchema failed:', err.message);
    }
}

module.exports = router;
module.exports.ensureLiveSaleSchema = ensureLiveSaleSchema;
