// #Note: WEB2.0 module. Aggregate orders cho 1 KH (per phone) — kết hợp:
//   - native_orders (Web 2.0 đơn web)
//   - fast_sale_orders (PBH từ native_orders converted)
//   - refunds (trả hàng)
//
// Replace pattern cũ: GET /api/v2/customers/:id/orders (Web 1.0 TPOS sync,
// chỉ trả TPOS orders). Endpoint Web 2.0 này trả đơn THẬT của khách trong
// hệ Web 2.0, không phụ thuộc TPOS.
//
// Per user 2026-06-01: "Web 2.0 tách biệt với Web 1.0/TPOS"; chỉ giữ TPOS
// cho customer lookup info (Customer 360), campaigns, comments. Đơn hàng
// và lịch sử của Web 2.0 PHẢI lấy từ Web 2.0 stores riêng.

const express = require('express');
const router = express.Router();

// GET /:phone — aggregate orders cho 1 KH
// Query:
//   ?limit=20         (default 20, max 100)
//   ?include=native,pbh,refund   (default all)
//
// Response:
//   {
//     success: true,
//     phone: '0123456788',
//     customer: { name, address, customerId },
//     orders: [{
//       source: 'native' | 'pbh' | 'refund',
//       number: 'NJ-...' | 'NJ-...' | 'RF-...',
//       date: ISO string,
//       state: 'draft'|'confirmed'|'cancelled'|'done',
//       totalAmount: number,
//       itemCount: number,
//     }],
//     totals: {
//       native: { count, amount },
//       pbh: { count, amount },
//       refund: { count, amount },
//       net: number,        // pbh - refund
//     }
//   }
router.get('/:phoneOrId', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });

        // Accept BOTH phone (vd "0123456788") AND customerId (vd "42") cho dễ
        // migrate từ legacy /api/v2/customers/:id/orders. Resolve numeric id →
        // phone qua customers table; phone → giữ nguyên.
        const raw = String(req.params.phoneOrId || '').trim();
        if (!raw) return res.status(400).json({ success: false, error: 'phone or id required' });
        let phone = raw;
        if (/^\d+$/.test(raw) && raw.length < 10) {
            // numeric ID → lookup phone
            try {
                const cQ = await pool.query(
                    'SELECT phone FROM web2_order_customers WHERE id = $1 LIMIT 1',
                    [Number(raw)]
                );
                phone = cQ.rows[0]?.phone || raw;
            } catch {}
        }

        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const include = String(req.query.include || 'native,pbh,refund')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

        // Customer info (best-effort lookup from customers table)
        let customer = { name: null, address: null, customerId: null };
        try {
            const cQ = await pool.query(
                'SELECT id, name, address FROM web2_order_customers WHERE phone = $1 LIMIT 1',
                [phone]
            );
            if (cQ.rows[0]) {
                customer = {
                    customerId: cQ.rows[0].id,
                    name: cQ.rows[0].name,
                    address: cQ.rows[0].address,
                };
            }
        } catch {}

        const orders = [];
        const totals = {
            native: { count: 0, amount: 0 },
            pbh: { count: 0, amount: 0 },
            refund: { count: 0, amount: 0 },
        };

        // 1. Native orders (Đơn Web)
        if (include.includes('native')) {
            try {
                const r = await pool.query(
                    `SELECT code, status, total_amount, total_quantity, created_at, updated_at
                     FROM native_orders
                     WHERE phone = $1
                     ORDER BY created_at DESC
                     LIMIT $2`,
                    [phone, limit]
                );
                for (const row of r.rows) {
                    const amt = Number(row.total_amount) || 0;
                    orders.push({
                        source: 'native',
                        number: row.code,
                        date: new Date(Number(row.created_at)).toISOString(),
                        state: row.status,
                        totalAmount: amt,
                        itemCount: Number(row.total_quantity) || 0,
                    });
                    totals.native.count += 1;
                    totals.native.amount += amt;
                }
            } catch (e) {
                console.warn('[web2-customer-orders] native query fail:', e.message);
            }
        }

        // 2. Fast-sale-orders (PBH)
        if (include.includes('pbh')) {
            try {
                const r = await pool.query(
                    `SELECT number, state, total_amount, total_quantity, date_invoice, date_created
                     FROM fast_sale_orders
                     WHERE partner_phone = $1
                     ORDER BY date_created DESC
                     LIMIT $2`,
                    [phone, limit]
                );
                for (const row of r.rows) {
                    const amt = Number(row.total_amount) || 0;
                    orders.push({
                        source: 'pbh',
                        number: row.number,
                        date: row.date_invoice || row.date_created,
                        state: row.state,
                        totalAmount: amt,
                        itemCount: Number(row.total_quantity) || 0,
                    });
                    totals.pbh.count += 1;
                    if (row.state !== 'cancel') totals.pbh.amount += amt;
                }
            } catch (e) {
                console.warn('[web2-customer-orders] pbh query fail:', e.message);
            }
        }

        // 3. Refunds
        if (include.includes('refund')) {
            try {
                const r = await pool.query(
                    `SELECT number, state, amount_refund, total_quantity, date_refund, date_created
                     FROM refunds
                     WHERE partner_phone = $1
                     ORDER BY date_created DESC
                     LIMIT $2`,
                    [phone, limit]
                );
                for (const row of r.rows) {
                    const amt = Number(row.amount_refund) || 0;
                    orders.push({
                        source: 'refund',
                        number: row.number,
                        date: row.date_refund || row.date_created,
                        state: row.state,
                        totalAmount: amt,
                        itemCount: Number(row.total_quantity) || 0,
                    });
                    totals.refund.count += 1;
                    if (row.state === 'completed' || row.state === 'approved') {
                        totals.refund.amount += amt;
                    }
                }
            } catch (e) {
                console.warn('[web2-customer-orders] refund query fail:', e.message);
            }
        }

        // Sort all orders by date desc (mixed)
        orders.sort((a, b) => new Date(b.date) - new Date(a.date));

        const net = totals.pbh.amount - totals.refund.amount;

        // Backward-compat shape: also expose grouped arrays + summary so 3
        // existing frontend callers (pbh-app, report-revenue, native-orders)
        // can swap from /api/v2/customers/:id/orders → /api/web2/customer-orders/:phone
        // với minimal change. Mới: orders + totals (flat aggregate).
        const native = orders.filter((o) => o.source === 'native');
        const pbh = orders.filter((o) => o.source === 'pbh');
        const refund = orders.filter((o) => o.source === 'refund');

        res.json({
            success: true,
            phone,
            customer,
            // New flat shape (recommended for new code)
            orders: orders.slice(0, limit),
            totals: { ...totals, net },
            // Compat shape (matches legacy /api/v2/customers/:id/orders)
            native,
            pbh,
            refund,
            summary: {
                totalNative: totals.native.count,
                totalNativeAmount: totals.native.amount,
                totalPbh: totals.pbh.count,
                totalPbhAmount: totals.pbh.amount,
                totalRefund: totals.refund.count,
                totalRefundAmount: totals.refund.amount,
                netAmount: net,
            },
        });
    } catch (e) {
        console.error('[web2-customer-orders] error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
