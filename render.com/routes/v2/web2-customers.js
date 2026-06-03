// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — route kho KH riêng (web2_customers, web2Db). Thay /api/v2/customers Web 1.0.
// =====================================================================
// /api/web2/customers — danh bạ KH riêng Web 2.0, đọc từ web2_customers
// (web2Db). Bỏ phụ thuộc bảng `customers` Web 1.0.
//
//   GET /search?search=<tên|SĐT>&limit=8  — tìm KH (local + TPOS fallback)
//   GET /:phone                           — 1 KH theo SĐT (local, fallback TPOS)
//
// Self-populate: kết quả TPOS được upsert vào web2_customers để lần sau nhanh.
// =====================================================================

const express = require('express');
const router = express.Router();
const { upsertWeb2Customer } = require('../../db/web2-customers-schema');
const {
    searchCustomersByText,
    searchAllCustomersByPhone,
} = require('../../services/tpos-customer-service');

// Số kết quả local tối thiểu để KHÔNG cần hỏi TPOS (tránh spam API).
const LOCAL_ENOUGH = 3;

function isPhoneLike(q) {
    return /^\d{3,}$/.test(String(q || '').replace(/\s/g, ''));
}

function rowToCustomer(r) {
    return {
        id: r.id,
        phone: r.phone || '',
        name: r.name || '',
        address: r.address || '',
        email: r.email || '',
    };
}

// GET /search?search=...&limit=8
router.get('/search', async (req, res) => {
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    const q = String(req.query.search || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 50);
    if (q.length < 2) return res.json({ success: true, data: [] });

    try {
        // 1. Local web2_customers (name ILIKE OR phone ILIKE)
        const like = `%${q}%`;
        const local = await db.query(
            `SELECT id, phone, name, email, address
             FROM web2_customers
             WHERE name ILIKE $1 OR phone ILIKE $1
             ORDER BY synced_at DESC
             LIMIT $2`,
            [like, limit]
        );
        let results = local.rows.map(rowToCustomer);

        // 2. Fallback TPOS nếu local chưa đủ — self-populate web2_customers
        if (results.length < LOCAL_ENOUGH) {
            const tpos = isPhoneLike(q)
                ? await searchAllCustomersByPhone(q)
                : await searchCustomersByText(q, limit);
            if (tpos?.success && tpos.customers?.length) {
                // Upsert (fire-and-forget nhưng await để kết quả nhất quán)
                for (const c of tpos.customers) await upsertWeb2Customer(db, c);
                // Merge dedup theo id
                const seen = new Set(results.map((r) => r.id));
                for (const c of tpos.customers) {
                    if (seen.has(c.id)) continue;
                    seen.add(c.id);
                    results.push({
                        id: c.id,
                        phone: c.phone || '',
                        name: c.name || '',
                        address: c.address || '',
                        email: c.email || '',
                    });
                }
            }
        }

        res.json({ success: true, data: results.slice(0, limit) });
    } catch (e) {
        console.error('[web2-customers] search error:', e.message);
        res.status(500).json({ success: false, error: e.message, data: [] });
    }
});

// GET /by-phone/:phone/orders — lịch sử đơn (Đơn Web + PBH) theo SĐT.
// Thay /api/v2/customers/by-phone/:phone/orders (Web 1.0) — KHÔNG qua bảng
// `customers`, query thẳng native_orders + fast_sale_orders theo phone.
// native_orders/fast_sale_orders hiện ở chatDb (Phase 6 sẽ chuyển web2Db).
router.get('/by-phone/:phone/orders', async (req, res) => {
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    let phone = String(req.params.phone || '').replace(/\D/g, '');
    if (phone && !phone.startsWith('0')) phone = '0' + phone.slice(-9);
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    if (!phone) return res.status(400).json({ success: false, error: 'phone required' });
    try {
        const [nwRes, pbhRes] = await Promise.all([
            db.query(
                `SELECT code, display_stt, status, customer_name, phone, total_amount,
                        total_quantity, live_campaign_id, live_campaign_name, created_at, updated_at
                 FROM native_orders
                 WHERE phone = $1
                 ORDER BY created_at DESC LIMIT $2`,
                [phone, limit]
            ),
            db.query(
                `SELECT number, display_stt, state, partner_name, partner_phone, amount_total,
                        total_quantity, live_campaign_id, live_campaign_name,
                        date_invoice, date_created, date_updated
                 FROM fast_sale_orders
                 WHERE partner_phone = $1
                 ORDER BY date_created DESC LIMIT $2`,
                [phone, limit]
            ),
        ]);
        const native = nwRes.rows.map((r) => ({
            code: r.code,
            displayStt: r.display_stt,
            status: r.status,
            customerName: r.customer_name,
            phone: r.phone,
            totalAmount: Number(r.total_amount || 0),
            totalQuantity: r.total_quantity,
            liveCampaign: { id: r.live_campaign_id, name: r.live_campaign_name },
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        }));
        const pbh = pbhRes.rows.map((r) => ({
            number: r.number,
            displayStt: r.display_stt,
            state: r.state,
            partnerName: r.partner_name,
            partnerPhone: r.partner_phone,
            amountTotal: Number(r.amount_total || 0),
            totalQuantity: r.total_quantity,
            liveCampaign: { id: r.live_campaign_id, name: r.live_campaign_name },
            dateInvoice: r.date_invoice,
            dateCreated: r.date_created,
            dateUpdated: r.date_updated,
        }));
        res.json({
            success: true,
            data: {
                native,
                pbh,
                summary: { nativeCount: native.length, pbhCount: pbh.length },
            },
        });
    } catch (e) {
        console.error('[web2-customers] by-phone orders error:', e.message);
        res.status(500).json({ success: false, error: e.message, data: { native: [], pbh: [] } });
    }
});

// GET /:phone — 1 KH theo SĐT (local trước, fallback TPOS + upsert)
router.get('/:phone', async (req, res) => {
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    const phone = String(req.params.phone || '')
        .replace(/\D/g, '')
        .slice(-10);
    if (!phone) return res.status(400).json({ success: false, error: 'phone required' });
    try {
        const local = await db.query(
            `SELECT id, phone, name, email, address FROM web2_customers WHERE phone = $1 LIMIT 1`,
            [phone]
        );
        if (local.rows.length) {
            return res.json({
                success: true,
                customer: rowToCustomer(local.rows[0]),
                source: 'local',
            });
        }
        const tpos = await searchAllCustomersByPhone(phone);
        if (tpos?.success && tpos.customers?.length) {
            for (const c of tpos.customers) await upsertWeb2Customer(db, c);
            const c = tpos.customers[0];
            return res.json({
                success: true,
                customer: {
                    id: c.id,
                    phone: c.phone,
                    name: c.name,
                    address: c.address,
                    email: c.email,
                },
                source: 'tpos',
            });
        }
        res.json({ success: true, customer: null });
    } catch (e) {
        console.error('[web2-customers] get error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
