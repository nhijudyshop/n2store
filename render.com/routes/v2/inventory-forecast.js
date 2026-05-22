// #Note: WEB2.0 module. F11 — Inventory forecasting endpoint.

const express = require('express');
const router = express.Router();

let _migrationDone = false;
async function ensureSchema(pool) {
    if (_migrationDone) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_product_velocity (
            code TEXT PRIMARY KEY,
            daily_avg NUMERIC DEFAULT 0,
            window_days INTEGER DEFAULT 30,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_w2_velocity_updated ON web2_product_velocity(updated_at);
    `);
    _migrationDone = true;
}

router.use(async (req, res, next) => {
    try {
        await ensureSchema(req.app.locals.chatDb);
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: 'schema-init: ' + e.message });
    }
});

// POST /recompute — chạy lại velocity từ fast_sale_orders 30 ngày qua.
// Best-effort: nếu schema không có line items thì tạo placeholder velocity=0.
router.post('/recompute', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const days = Math.min(Number(req.body?.days) || 30, 90);
        // Probe schema for line items
        const hasLines = await pool
            .query(
                `SELECT EXISTS (SELECT FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='fast_sale_order_lines') AS e`
            )
            .then((r) => r.rows[0]?.e)
            .catch(() => false);

        let upserted = 0;
        if (hasLines) {
            // Aggregate sold qty per product over `days`
            const rs = await pool.query(
                `SELECT l.product_code AS code, SUM(l.qty)::numeric AS qty
                 FROM fast_sale_order_lines l
                 JOIN fast_sale_orders o ON o.number = l.pbh_number
                 WHERE o.state = 'done' AND o.created_at > NOW() - INTERVAL '${days} days'
                 GROUP BY l.product_code`
            );
            for (const r of rs.rows) {
                if (!r.code) continue;
                const avg = Number(r.qty) / days;
                await pool.query(
                    `INSERT INTO web2_product_velocity (code, daily_avg, window_days, updated_at)
                     VALUES ($1, $2, $3, NOW())
                     ON CONFLICT (code) DO UPDATE SET daily_avg = EXCLUDED.daily_avg,
                       window_days = EXCLUDED.window_days, updated_at = NOW()`,
                    [r.code, avg, days]
                );
                upserted++;
            }
        }
        res.json({ success: true, upserted, hasLines, days });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /list?days_left_max=14
router.get('/list', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const maxDays = Math.min(Number(req.query.days_left_max) || 30, 365);
        const rs = await pool.query(
            `SELECT p.code, p.name, p.stock, COALESCE(v.daily_avg, 0)::float AS daily_avg,
                    CASE WHEN COALESCE(v.daily_avg, 0) > 0 THEN
                        ROUND(p.stock / v.daily_avg)::int
                    ELSE NULL END AS days_left
             FROM web2_products p
             LEFT JOIN web2_product_velocity v ON v.code = p.code
             WHERE p.active = true
             ORDER BY (CASE WHEN COALESCE(v.daily_avg, 0) > 0 THEN p.stock / v.daily_avg ELSE 9999 END) ASC
             LIMIT 200`
        );
        const filtered = rs.rows.filter((r) => r.days_left === null || r.days_left <= maxDays);
        res.json({ success: true, items: filtered });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
