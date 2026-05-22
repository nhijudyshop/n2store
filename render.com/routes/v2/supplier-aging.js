// #Note: WEB2.0 module.
// F02 — Supplier aging buckets endpoint.
// Mock backend cho phase 1: Firestore-based data fetched ở client.
// Backend chỉ aggregate Postgres-side (purchase_orders nếu có) làm fallback.

const express = require('express');
const router = express.Router();

// GET /summary?ref=YYYY-MM-DD
// Trả 0_30/31_60/61_90/90_plus tổng cho toàn shop, plus per-supplier list.
router.get('/summary', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const ref = req.query.ref ? new Date(req.query.ref) : new Date();
        const hasPO = await pool
            .query(
                `SELECT EXISTS (SELECT FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='purchase_orders') AS e`
            )
            .then((r) => r.rows[0]?.e)
            .catch(() => false);
        if (!hasPO) {
            return res.json({
                success: true,
                ref: ref.toISOString(),
                buckets: { b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0, total: 0 },
                suppliers: [],
                note: 'purchase_orders chưa có — dùng Firestore data client-side',
            });
        }
        // SQL aging — assume `total_due` chưa thanh toán, `supplier_name`, `created_at`.
        const rs = await pool.query(
            `SELECT supplier_name,
                    SUM(CASE WHEN $1::date - created_at::date BETWEEN 0 AND 30 THEN COALESCE(total_due, 0) ELSE 0 END) AS b0_30,
                    SUM(CASE WHEN $1::date - created_at::date BETWEEN 31 AND 60 THEN COALESCE(total_due, 0) ELSE 0 END) AS b31_60,
                    SUM(CASE WHEN $1::date - created_at::date BETWEEN 61 AND 90 THEN COALESCE(total_due, 0) ELSE 0 END) AS b61_90,
                    SUM(CASE WHEN $1::date - created_at::date > 90 THEN COALESCE(total_due, 0) ELSE 0 END) AS b90_plus
             FROM purchase_orders
             WHERE COALESCE(total_due, 0) > 0
             GROUP BY supplier_name
             ORDER BY (SUM(COALESCE(total_due, 0))) DESC
             LIMIT 200`,
            [ref.toISOString().slice(0, 10)]
        );
        const total = { b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0, total: 0 };
        const suppliers = rs.rows.map((r) => {
            const b = {
                name: r.supplier_name,
                b0_30: Number(r.b0_30 || 0),
                b31_60: Number(r.b31_60 || 0),
                b61_90: Number(r.b61_90 || 0),
                b90_plus: Number(r.b90_plus || 0),
            };
            b.total = b.b0_30 + b.b31_60 + b.b61_90 + b.b90_plus;
            total.b0_30 += b.b0_30;
            total.b31_60 += b.b31_60;
            total.b61_90 += b.b61_90;
            total.b90_plus += b.b90_plus;
            total.total += b.total;
            return b;
        });
        res.json({ success: true, ref: ref.toISOString(), buckets: total, suppliers });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
