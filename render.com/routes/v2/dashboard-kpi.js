// #Note: WEB2.0 module. F01 Dashboard KPI aggregate endpoint.

const express = require('express');
// 1D-auth (2026-06-12): KPI lộ doanh thu + partner_name → gate SOFT (enforce qua env).
const { requireWeb2AuthSoft } = require('../../middleware/web2-auth');
const router = express.Router();

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}

// Simple in-memory cache 30s
const _cache = { ts: 0, data: null };

router.get('/', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const now = Date.now();
        // Bypass cache khi client gọi ?nocache=1 (hoặc ?fresh=1) — vd sau SSE
        // trigger reload, để không nhận data cũ trong cửa sổ cache 30s.
        const noCache =
            req.query.nocache === '1' ||
            req.query.nocache === 'true' ||
            req.query.fresh === '1' ||
            req.query.fresh === 'true';
        if (!noCache && _cache.data && now - _cache.ts < 30_000) {
            return res.json({ success: true, cached: true, ..._cache.data });
        }
        const out = {};

        // Revenue today (PBH state=done) — date_invoice (TIMESTAMPTZ) so theo ngày
        // VN (Asia/Ho_Chi_Minh) thay vì UTC (CURRENT_DATE) để không lệch 7h.
        try {
            const r = await pool.query(
                `SELECT COALESCE(SUM(amount_total), 0)::bigint AS s, COUNT(*)::int AS c
                 FROM fast_sale_orders
                 WHERE state = 'done'
                   AND (date_invoice AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                       = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`
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
                // TM-revenue7d-utc FIX (2026-06-12): pin GMT+7 như revenue_today —
                // ::date trần theo session UTC gom đơn 00:00-07:00 VN về hôm trước.
                `SELECT (date_invoice AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d,
                        COALESCE(SUM(amount_total), 0)::bigint AS s
                 FROM fast_sale_orders
                 WHERE state = 'done' AND date_invoice > NOW() - INTERVAL '7 days'
                 GROUP BY d ORDER BY d`
            );
            out.revenue_7d = r.rows.map((x) => ({ date: x.d, amount: Number(x.s) }));
        } catch {
            out.revenue_7d = [];
        }

        // PBH cần đóng gói = đã chốt (state='done') nhưng CHƯA gán mã vận đơn
        // (tracking_ref rỗng) → chưa bàn giao cho đơn vị vận chuyển. Loại đơn đã hủy.
        try {
            const r = await pool.query(
                `SELECT COUNT(*)::int AS c FROM fast_sale_orders
                 WHERE state = 'done'
                   AND (tracking_ref IS NULL OR tracking_ref = '')
                   AND COALESCE(show_state, '') NOT ILIKE '%hủy%'`
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

        // Sổ Order pipeline (Hướng C 2026-06-14) — đọc 1 doc JSONB web2_so_order
        // (C8), parse JS. Hiện trạng đợt mua hàng NCC trên dashboard + báo đợt chưa
        // nhận đủ (cùng tín hiệu alert cron Hướng E). Link deep-link tới so-order.
        try {
            const so = await pool.query(`SELECT data FROM web2_so_order WHERE doc_id = 'main'`);
            const doc = so.rows[0]?.data;
            let shipments = 0;
            let unrecvShipments = 0;
            let unrecvProducts = 0;
            if (doc && Array.isArray(doc.tabs)) {
                for (const tab of doc.tabs) {
                    for (const sh of tab.shipments || []) {
                        shipments++;
                        const pending = (sh.rows || []).filter((r) => r && r.status !== 'received');
                        if (pending.length) {
                            unrecvShipments++;
                            unrecvProducts += pending.length;
                        }
                    }
                }
            }
            out.so_open_shipments = shipments;
            out.so_unreceived_shipments = unrecvShipments;
            out.so_unreceived_products = unrecvProducts;
        } catch {
            out.so_open_shipments = 0;
            out.so_unreceived_shipments = 0;
            out.so_unreceived_products = 0;
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
