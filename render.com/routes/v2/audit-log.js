// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — Audit Log (F05)
// Union view qua 5 bảng audit hiện có:
//   web2_product_history · fast_sale_order_history · pbh_fulfillment_logs ·
//   wallet_adjustments · native_orders_migrations
// =====================================================

const express = require('express');
const router = express.Router();

function _tableExists(pool, table) {
    return pool
        .query(
            `SELECT EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = $1) AS e`,
            [table]
        )
        .then((r) => Boolean(r.rows[0]?.e))
        .catch(() => false);
}

// GET /list?entity=&user=&from=&to=&limit=100&offset=0
router.get('/list', async (req, res) => {
    try {
        const pool = req.app.locals.pool;
        const limit = Math.min(Number(req.query.limit) || 100, 500);
        const offset = Number(req.query.offset) || 0;
        const filterEntity = req.query.entity || null;
        const filterUser = req.query.user || null;
        const from = req.query.from || null;
        const to = req.query.to || null;

        const blocks = [];

        // 1. web2_product_history
        if (await _tableExists(pool, 'web2_product_history')) {
            blocks.push(`
                SELECT
                    'product' AS entity,
                    product_code AS entity_id,
                    action,
                    user_id, user_name,
                    source_page,
                    changes,
                    created_at
                FROM web2_product_history
            `);
        }

        // 2. fast_sale_order_history (PBH audit)
        if (await _tableExists(pool, 'fast_sale_order_history')) {
            blocks.push(`
                SELECT
                    'pbh' AS entity,
                    pbh_number AS entity_id,
                    action,
                    user_id, user_name,
                    source_page,
                    changes,
                    created_at
                FROM fast_sale_order_history
            `);
        }

        // 3. pbh_fulfillment_logs (reconcile workflow)
        if (await _tableExists(pool, 'pbh_fulfillment_logs')) {
            blocks.push(`
                SELECT
                    'reconcile' AS entity,
                    pbh_number AS entity_id,
                    event_type AS action,
                    NULL::text AS user_id,
                    actor AS user_name,
                    'reconcile' AS source_page,
                    payload AS changes,
                    created_at
                FROM pbh_fulfillment_logs
            `);
        }

        // 4. wallet_adjustments
        if (await _tableExists(pool, 'wallet_adjustments')) {
            blocks.push(`
                SELECT
                    'wallet' AS entity,
                    customer_phone AS entity_id,
                    adjustment_type AS action,
                    NULL::text AS user_id,
                    adjusted_by AS user_name,
                    'balance-history' AS source_page,
                    jsonb_build_object('amount', amount, 'reason', reason) AS changes,
                    created_at
                FROM wallet_adjustments
            `);
        }

        if (blocks.length === 0) {
            return res.json({ success: true, items: [], total: 0 });
        }

        const filters = [];
        const params = [];
        if (filterEntity) {
            params.push(filterEntity);
            filters.push(`entity = $${params.length}`);
        }
        if (filterUser) {
            params.push('%' + filterUser + '%');
            filters.push(`(user_name ILIKE $${params.length} OR user_id ILIKE $${params.length})`);
        }
        if (from) {
            params.push(from);
            filters.push(`created_at >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            filters.push(`created_at <= $${params.length}`);
        }
        const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

        const sql = `
            WITH unified AS (${blocks.join(' UNION ALL ')})
            SELECT * FROM unified
            ${where}
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
        const rs = await pool.query(sql, params);
        res.json({ success: true, items: rs.rows, limit, offset });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /entities — danh sách entity types có data
router.get('/entities', async (req, res) => {
    const pool = req.app.locals.pool;
    const out = [];
    const map = [
        ['product', 'web2_product_history'],
        ['pbh', 'fast_sale_order_history'],
        ['reconcile', 'pbh_fulfillment_logs'],
        ['wallet', 'wallet_adjustments'],
    ];
    for (const [name, tbl] of map) {
        if (await _tableExists(pool, tbl)) out.push(name);
    }
    res.json({ success: true, entities: out });
});

module.exports = router;
