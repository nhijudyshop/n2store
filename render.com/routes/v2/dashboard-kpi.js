// #Note: WEB2.0 module. F01 Dashboard KPI aggregate endpoint.

const express = require('express');
const router = express.Router();

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}

// Simple in-memory cache 30s
const _cache = { ts: 0, data: null };

router.get('/', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const now = Date.now();
        if (_cache.data && now - _cache.ts < 30_000) {
            return res.json({ success: true, cached: true, ..._cache.data });
        }
        const out = {};

        // Revenue today (PBH state=done) — dùng date_invoice (ngày HĐ, đã có timezone fix)
        try {
            const r = await pool.query(
                `SELECT COALESCE(SUM(amount_total), 0)::bigint AS s, COUNT(*)::int AS c
                 FROM fast_sale_orders
                 WHERE state = 'done' AND date_invoice::date = CURRENT_DATE`
            );
            out.revenue_today = Number(r.rows[0]?.s || 0);
            out.pbh_done_today = Number(r.rows[0]?.c || 0);
        } catch {
            out.revenue_today = 0;
            out.pbh_done_today = 0;
        }

        // Revenue 7 days
        try {
            const r = await pool.query(
                `SELECT date_invoice::date AS d, COALESCE(SUM(amount_total), 0)::bigint AS s
                 FROM fast_sale_orders
                 WHERE state = 'done' AND date_invoice > NOW() - INTERVAL '7 days'
                 GROUP BY d ORDER BY d`
            );
            out.revenue_7d = r.rows.map((x) => ({ date: x.d, amount: Number(x.s) }));
        } catch {
            out.revenue_7d = [];
        }

        // PBH pending pack — state=done chưa hết delivery (placeholder: chưa hết tracking_ref)
        try {
            const r = await pool.query(
                `SELECT COUNT(*)::int AS c FROM fast_sale_orders WHERE state = 'done'
                 AND (tracking_ref IS NULL OR tracking_ref = '')`
            );
            out.pbh_pending_pack = Number(r.rows[0]?.c || 0);
        } catch {
            out.pbh_pending_pack = 0;
        }

        // Stock low (< 5, active)
        try {
            const r = await pool.query(
                `SELECT COUNT(*)::int AS c FROM web2_products
                 WHERE is_active = true AND stock < 5 AND stock >= 0`
            );
            out.stock_low_count = Number(r.rows[0]?.c || 0);
        } catch {
            out.stock_low_count = 0;
        }

        // Wallet overdraft — đọc web2_customer_wallets (isolated Web 2.0 copy
        // được sync tự động từ legacy customer_wallets qua Postgres trigger).
        try {
            const r = await pool.query(
                `SELECT COUNT(*)::int AS c FROM web2_customer_wallets WHERE balance < 0`
            );
            out.wallet_overdraft = Number(r.rows[0]?.c || 0);
        } catch {
            out.wallet_overdraft = 0;
        }

        // PBH status breakdown
        try {
            const r = await pool.query(
                `SELECT state, COUNT(*)::int AS c FROM fast_sale_orders
                 WHERE date_created > NOW() - INTERVAL '30 days'
                 GROUP BY state`
            );
            out.pbh_by_state = r.rows.map((x) => ({ state: x.state, count: Number(x.c) }));
        } catch {
            out.pbh_by_state = [];
        }

        // Recent PBH — alias partner_name → customer_name + date_created → created_at để client cũ chạy được
        try {
            const r = await pool.query(
                `SELECT number, partner_name AS customer_name, amount_total, state,
                        date_created AS created_at
                 FROM fast_sale_orders ORDER BY date_created DESC LIMIT 10`
            );
            out.recent_pbh = r.rows;
        } catch {
            out.recent_pbh = [];
        }

        // SePay pending verification
        try {
            const r = await pool.query(
                `SELECT COUNT(*)::int AS c FROM web2_balance_history
                 WHERE COALESCE(verification_status, 'pending') = 'pending'`
            );
            out.sepay_pending = Number(r.rows[0]?.c || 0);
        } catch {
            out.sepay_pending = 0;
        }

        _cache.ts = now;
        _cache.data = out;
        res.json({ success: true, cached: false, ...out });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
