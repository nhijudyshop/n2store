// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — Audit Log (F05)
// Union view qua 4 bảng audit hiện có:
//   web2_product_history · fast_sale_order_history (created_at BIGINT epoch ms)
//   pbh_fulfillment_logs (created_at BIGINT)
//   wallet_adjustments (created_at TIMESTAMPTZ)
//
// Cast tất cả created_at về to_timestamp(BIGINT/1000) hoặc giữ nguyên TIMESTAMPTZ.
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
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const limit = Math.min(Number(req.query.limit) || 100, 500);
        const offset = Number(req.query.offset) || 0;
        const filterEntity = req.query.entity || null;
        const filterUser = req.query.user || null;
        const from = req.query.from || null;
        const to = req.query.to || null;

        const blocks = [];

        // 1. web2_product_history (created_at BIGINT epoch ms)
        if (await _tableExists(pool, 'web2_product_history')) {
            blocks.push(`
                SELECT
                    'product'::text AS entity,
                    product_code AS entity_id,
                    action,
                    user_id, user_name,
                    source_page,
                    changes,
                    to_timestamp(created_at / 1000.0) AS created_at
                FROM web2_product_history
            `);
        }

        // 2. fast_sale_order_history (created_at BIGINT)
        if (await _tableExists(pool, 'fast_sale_order_history')) {
            blocks.push(`
                SELECT
                    'pbh'::text AS entity,
                    pbh_number AS entity_id,
                    action,
                    user_id, user_name,
                    source_page,
                    changes,
                    to_timestamp(created_at / 1000.0) AS created_at
                FROM fast_sale_order_history
            `);
        }

        // 3. pbh_fulfillment_logs (created_at BIGINT, columns: action, payload, state_before/after, user_id, user_name)
        if (await _tableExists(pool, 'pbh_fulfillment_logs')) {
            blocks.push(`
                SELECT
                    'reconcile'::text AS entity,
                    pbh_number AS entity_id,
                    action,
                    user_id,
                    user_name,
                    'reconcile'::text AS source_page,
                    jsonb_build_object(
                        'payload', payload,
                        'state_before', state_before,
                        'state_after', state_after
                    ) AS changes,
                    to_timestamp(created_at / 1000.0) AS created_at
                FROM pbh_fulfillment_logs
            `);
        }

        // 4. web2_wallet_adjustments (isolated Web 2.0 copy — sync từ legacy qua Postgres trigger)
        if (await _tableExists(pool, 'web2_wallet_adjustments')) {
            blocks.push(`
                SELECT
                    'wallet'::text AS entity,
                    COALESCE(wrong_customer_phone, correct_customer_phone, original_transaction_id::text) AS entity_id,
                    adjustment_type AS action,
                    NULL::text AS user_id,
                    created_by AS user_name,
                    'balance-history'::text AS source_page,
                    jsonb_build_object(
                        'amount', adjustment_amount,
                        'reason', reason,
                        'wrong_phone', wrong_customer_phone,
                        'correct_phone', correct_customer_phone
                    ) AS changes,
                    created_at
                FROM web2_wallet_adjustments
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    const out = [];
    const map = [
        ['product', 'web2_product_history'],
        ['pbh', 'fast_sale_order_history'],
        ['reconcile', 'pbh_fulfillment_logs'],
        ['wallet', 'web2_wallet_adjustments'],
    ];
    for (const [name, tbl] of map) {
        if (await _tableExists(pool, tbl)) out.push(name);
    }
    res.json({ success: true, entities: out });
});

module.exports = router;
