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
