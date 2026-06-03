// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// PBH REPORTS — Phase 9
// Analytics endpoints cho dashboard:
//   GET /api/pbh-reports/summary       — tổng quan (today/week/month)
//   GET /api/pbh-reports/revenue       — doanh thu theo ngày (sparkline)
//   GET /api/pbh-reports/top-customers — top khách hàng theo total
//   GET /api/pbh-reports/by-campaign   — doanh thu theo chiến dịch
//   GET /api/pbh-reports/state-breakdown — phân loại đơn theo state
// =====================================================

const express = require('express');
const router = express.Router();

function num(v) {
    return Number(v || 0);
}

// GET /summary?days=30
router.get('/summary', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
        const r = await pool.query(
            `
            SELECT
                COUNT(*)::int AS total_pbh,
                COUNT(*) FILTER (WHERE state = 'draft')::int AS state_draft,
                COUNT(*) FILTER (WHERE state = 'confirmed')::int AS state_confirmed,
                COUNT(*) FILTER (WHERE state = 'done')::int AS state_done,
                COUNT(*) FILTER (WHERE state = 'cancel')::int AS state_cancel,
                COUNT(*) FILTER (WHERE date_invoice::date = CURRENT_DATE)::int AS today_count,
                COALESCE(SUM(amount_total) FILTER (WHERE state != 'cancel'), 0)::numeric AS total_revenue,
                COALESCE(SUM(amount_total) FILTER (WHERE date_invoice::date = CURRENT_DATE AND state != 'cancel'), 0)::numeric AS today_revenue,
                COALESCE(SUM(amount_total) FILTER (WHERE date_invoice >= CURRENT_DATE - INTERVAL '7 days' AND state != 'cancel'), 0)::numeric AS week_revenue,
                COALESCE(SUM(amount_total) FILTER (WHERE date_invoice >= CURRENT_DATE - INTERVAL '30 days' AND state != 'cancel'), 0)::numeric AS month_revenue,
                COALESCE(SUM(residual) FILTER (WHERE state != 'cancel'), 0)::numeric AS total_residual
            FROM fast_sale_orders
            WHERE date_invoice >= CURRENT_DATE - ($1 || ' days')::interval
        `,
            [days]
        );

        // Native orders + delivery + refund counts
        const native = await pool
            .query(
                `
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'draft')::int AS native_draft,
                COUNT(*) FILTER (WHERE status = 'confirmed')::int AS native_confirmed
            FROM native_orders
        `
            )
            .catch(() => ({ rows: [{}] }));

        const dlv = await pool
            .query(
                `
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE state = 'pending')::int AS dlv_pending,
                COUNT(*) FILTER (WHERE state = 'shipping')::int AS dlv_shipping,
                COUNT(*) FILTER (WHERE state = 'delivered')::int AS dlv_delivered
            FROM delivery_invoices
        `
            )
            .catch(() => ({ rows: [{}] }));

        const rf = await pool
            .query(
                `
            SELECT
                COUNT(*)::int AS total,
                COALESCE(SUM(amount_refund), 0)::numeric AS total_refund_amount
            FROM refunds
            WHERE state = 'completed'
        `
            )
            .catch(() => ({ rows: [{}] }));

        const row = r.rows[0];
        res.json({
            success: true,
            range: { days, since: new Date(Date.now() - days * 86400000).toISOString() },
            pbh: {
                total: row.total_pbh,
                today: row.today_count,
                states: {
                    draft: row.state_draft,
                    confirmed: row.state_confirmed,
                    done: row.state_done,
                    cancel: row.state_cancel,
                },
            },
            revenue: {
                total: num(row.total_revenue),
                today: num(row.today_revenue),
                week: num(row.week_revenue),
                month: num(row.month_revenue),
                residual: num(row.total_residual),
            },
            nativeOrders: native.rows[0] || {},
            delivery: dlv.rows[0] || {},
            refunds: {
                completed: rf.rows[0]?.total || 0,
                totalAmount: num(rf.rows[0]?.total_refund_amount),
            },
        });
    } catch (e) {
        console.error('[PBH-REPORTS] summary error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// GET /revenue?days=30 — daily revenue chart
router.get('/revenue', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
        const r = await pool.query(
            `
            SELECT
                date_invoice::date AS day,
                COUNT(*)::int AS order_count,
                COALESCE(SUM(amount_total) FILTER (WHERE state != 'cancel'), 0)::numeric AS revenue,
                COALESCE(SUM(total_quantity) FILTER (WHERE state != 'cancel'), 0)::int AS qty
            FROM fast_sale_orders
            WHERE date_invoice >= CURRENT_DATE - ($1 || ' days')::interval
            GROUP BY date_invoice::date
            ORDER BY day ASC
        `,
            [days]
        );
        res.json({
            success: true,
            range: { days },
            series: r.rows.map((x) => ({
                day: x.day,
                orderCount: x.order_count,
                revenue: num(x.revenue),
                qty: x.qty,
            })),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /top-customers?days=30&limit=10
router.get('/top-customers', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
        const r = await pool.query(
            `
            SELECT
                partner_phone AS phone,
                partner_name AS name,
                COUNT(*)::int AS order_count,
                COALESCE(SUM(amount_total) FILTER (WHERE state != 'cancel'), 0)::numeric AS total_revenue,
                MAX(date_invoice) AS last_order
            FROM fast_sale_orders
            WHERE date_invoice >= CURRENT_DATE - ($1 || ' days')::interval
              AND partner_phone IS NOT NULL
            GROUP BY partner_phone, partner_name
            ORDER BY total_revenue DESC
            LIMIT $2
        `,
            [days, limit]
        );
        res.json({
            success: true,
            range: { days, limit },
            customers: r.rows.map((x) => ({
                phone: x.phone,
                name: x.name,
                orderCount: x.order_count,
                totalRevenue: num(x.total_revenue),
                lastOrder: x.last_order,
            })),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /by-campaign?days=30
router.get('/by-campaign', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
        const r = await pool.query(
            `
            SELECT
                COALESCE(live_campaign_id, '__none__') AS campaign_id,
                COALESCE(live_campaign_name, '(không có chiến dịch)') AS campaign_name,
                COUNT(*)::int AS order_count,
                COALESCE(SUM(amount_total) FILTER (WHERE state != 'cancel'), 0)::numeric AS revenue
            FROM fast_sale_orders
            WHERE date_invoice >= CURRENT_DATE - ($1 || ' days')::interval
            GROUP BY live_campaign_id, live_campaign_name
            ORDER BY revenue DESC
            LIMIT 50
        `,
            [days]
        );
        res.json({
            success: true,
            range: { days },
            campaigns: r.rows.map((x) => ({
                id: x.campaign_id,
                name: x.campaign_name,
                orderCount: x.order_count,
                revenue: num(x.revenue),
            })),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// PHASE 13 — Customer 360° unified report
// GET /top-customers-360?days=30&limit=10
// Groups by customer_id (when linked) — aggregates BOTH native_orders + fast_sale_orders.
// Falls back to bucket "(chưa liên kết)" for orders without customer_id.
// =====================================================
router.get('/top-customers-360', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
        const r = await pool.query(
            `
            WITH nw AS (
                SELECT
                    customer_id,
                    COUNT(*)::int AS nw_count,
                    COALESCE(SUM(total_amount), 0)::numeric AS nw_total,
                    MAX(to_timestamp(created_at / 1000)) AS nw_last,
                    MAX(phone) FILTER (WHERE phone IS NOT NULL) AS phone_hint,
                    MAX(customer_name) FILTER (WHERE customer_name IS NOT NULL) AS name_hint
                FROM native_orders
                WHERE customer_id IS NOT NULL
                  AND to_timestamp(created_at / 1000) >= CURRENT_DATE - ($1 || ' days')::interval
                GROUP BY customer_id
            ),
            pbh AS (
                SELECT
                    customer_id,
                    COUNT(*)::int AS pbh_count,
                    COALESCE(SUM(amount_total) FILTER (WHERE state != 'cancel'), 0)::numeric AS pbh_total,
                    MAX(date_invoice) AS pbh_last,
                    MAX(partner_phone) FILTER (WHERE partner_phone IS NOT NULL) AS phone_hint,
                    MAX(partner_name) FILTER (WHERE partner_name IS NOT NULL) AS name_hint
                FROM fast_sale_orders
                WHERE customer_id IS NOT NULL
                  AND date_invoice >= CURRENT_DATE - ($1 || ' days')::interval
                GROUP BY customer_id
            )
            SELECT
                COALESCE(nw.customer_id, pbh.customer_id) AS customer_id,
                c.name AS customer_name,
                c.phone AS customer_phone,
                c.status AS customer_status,
                COALESCE(nw.nw_count, 0) AS nw_count,
                COALESCE(nw.nw_total, 0)::numeric AS nw_total,
                COALESCE(pbh.pbh_count, 0) AS pbh_count,
                COALESCE(pbh.pbh_total, 0)::numeric AS pbh_total,
                (COALESCE(nw.nw_total, 0) + COALESCE(pbh.pbh_total, 0))::numeric AS combined_total,
                GREATEST(COALESCE(nw.nw_last, '-infinity'::timestamptz),
                         COALESCE(pbh.pbh_last, '-infinity'::timestamptz)) AS last_order,
                COALESCE(nw.name_hint, pbh.name_hint) AS name_hint,
                COALESCE(nw.phone_hint, pbh.phone_hint) AS phone_hint
            FROM nw
            FULL OUTER JOIN pbh ON nw.customer_id = pbh.customer_id
            LEFT JOIN customers c ON c.id = COALESCE(nw.customer_id, pbh.customer_id)
            ORDER BY combined_total DESC
            LIMIT $2
            `,
            [days, limit]
        );

        // Also collect "unlinked" bucket — orders without customer_id (data quality signal)
        const unlinked = await pool.query(
            `
            SELECT
                (SELECT COUNT(*)::int FROM native_orders
                 WHERE customer_id IS NULL
                   AND to_timestamp(created_at / 1000) >= CURRENT_DATE - ($1 || ' days')::interval) AS nw_unlinked,
                (SELECT COUNT(*)::int FROM fast_sale_orders
                 WHERE customer_id IS NULL
                   AND date_invoice >= CURRENT_DATE - ($1 || ' days')::interval) AS pbh_unlinked
            `,
            [days]
        );

        res.json({
            success: true,
            range: { days, limit },
            customers: r.rows.map((x) => ({
                customerId: Number(x.customer_id),
                name: x.customer_name || x.name_hint || null,
                phone: x.customer_phone || x.phone_hint || null,
                status: x.customer_status || null,
                nw: {
                    count: Number(x.nw_count),
                    total: num(x.nw_total),
                },
                pbh: {
                    count: Number(x.pbh_count),
                    total: num(x.pbh_total),
                },
                combinedTotal: num(x.combined_total),
                lastOrder: x.last_order,
            })),
            unlinked: {
                native: Number(unlinked.rows[0].nw_unlinked),
                pbh: Number(unlinked.rows[0].pbh_unlinked),
            },
        });
    } catch (e) {
        console.error('[PBH-REPORTS] top-customers-360 error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
