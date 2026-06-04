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
const {
    upsertWeb2Customer,
    findWeb2CustomerByFbId,
    linkWeb2CustomerFbId,
    getOrCreateWeb2Customer,
} = require('../../db/web2-customers-schema');
const {
    searchCustomersByText,
    searchAllCustomersByPhone,
    pushCustomerToTPOS,
    searchCustomerByFbUserId,
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

// POST /enrich-fb — LÀM GIÀU KHO KH: mỗi khi bật chat Pancake với 1 KH ở BẤT
// KỲ trang nào (Web2Chat tự gọi), nếu fb_id chưa có trong kho → lưu lại. Mục
// đích: kho KH biết đủ id/fb/tên/sđt → lần sau resolve/mở chat nhanh hơn +
// tăng coverage nút "Mở chat". Body: { fbId(psid), name?, phone?, crmTeamId? }.
// Idempotent, fire-and-forget từ client — KHÔNG chặn UX.
router.post('/enrich-fb', async (req, res) => {
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    const fbId = String(req.body?.fbId || '').trim();
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '')
        .replace(/\D/g, '')
        .slice(-10);
    const crmTeamId = req.body?.crmTeamId || null;
    if (!fbId) return res.json({ success: true, action: 'no_fbid' });
    try {
        // 1) Đã có fb_id trong kho → bỏ qua (nhanh, không gọi TPOS).
        const existing = await findWeb2CustomerByFbId(db, fbId);
        if (existing) return res.json({ success: true, action: 'exists', id: existing.id });

        // 2) Có phone → đảm bảo KH tồn tại (TPOS theo phone) rồi link fb_id.
        if (phone) {
            const goc = await getOrCreateWeb2Customer(db, phone);
            await linkWeb2CustomerFbId(db, phone, fbId);
            return res.json({
                success: true,
                action: 'linked_by_phone',
                id: goc.customerId || null,
            });
        }

        // 3) Không phone → tra TPOS theo fb_id (chatomni/info) → upsert + link.
        const tpos = await searchCustomerByFbUserId(fbId, crmTeamId);
        if (tpos?.success && tpos.customer?.id) {
            await upsertWeb2Customer(db, tpos.customer);
            if (tpos.customer.phone) {
                await linkWeb2CustomerFbId(db, tpos.customer.phone, fbId);
            } else {
                await db.query(
                    `UPDATE web2_customers SET fb_id = $2
                      WHERE id = $1 AND (fb_id IS NULL OR fb_id = '')`,
                    [tpos.customer.id, fbId]
                );
            }
            return res.json({
                success: true,
                action: 'tpos_resolved',
                id: tpos.customer.id,
                phone: tpos.customer.phone || null,
            });
        }
        // 4) KH FB chưa có trong TPOS (prospect chưa mua) → chưa lưu được vào
        //    web2_customers (key = TPOS id). Bỏ qua, không tạo rác.
        res.json({ success: true, action: 'fb_only_unresolved' });
    } catch (e) {
        console.error('[web2-customers] enrich-fb:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /:phone/fb-conversation — resolve SĐT → ngữ cảnh hội thoại FB (pageId +
// psid) để mở chat read-only trên balance-history. Nguồn tin cậy nhất:
// native_orders mới nhất có fb_page_id + fb_user_id (đơn FB đã link sẵn 2 id
// đi cùng nhau). Fallback web2_customers.fb_id (chỉ psid, thiếu page →
// frontend tự thử all-pages qua Web2Chat). found=false nếu KH chưa từng có
// hội thoại/đơn FB → UI báo "chưa có hội thoại FB".
router.get('/:phone/fb-conversation', async (req, res) => {
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    const phone = String(req.params.phone || '')
        .replace(/\D/g, '')
        .slice(-10);
    if (!phone) return res.json({ success: true, found: false, reason: 'invalid_phone' });
    try {
        // 1) native_orders — fb_page_id + fb_user_id đi cùng nhau (đáng tin nhất)
        const no = await db.query(
            `SELECT fb_page_id, fb_user_id, fb_user_name
               FROM native_orders
              WHERE (phone = $1 OR phone LIKE '%' || $1)
                AND fb_user_id IS NOT NULL AND fb_page_id IS NOT NULL
              ORDER BY id DESC
              LIMIT 1`,
            [phone]
        );
        if (no.rows.length) {
            const r = no.rows[0];
            return res.json({
                success: true,
                found: true,
                source: 'native_orders',
                pageId: r.fb_page_id,
                psid: r.fb_user_id,
                name: r.fb_user_name || null,
            });
        }
        // 2) web2_customers.fb_id (psid) — thiếu page_id, trả psid để frontend
        //    thử qua các page token có sẵn (Web2Chat all-pages fallback).
        const wc = await db.query(
            `SELECT fb_id, name FROM web2_customers
              WHERE phone = $1 AND fb_id IS NOT NULL AND fb_id <> '' LIMIT 1`,
            [phone]
        );
        if (wc.rows.length) {
            return res.json({
                success: true,
                found: true,
                source: 'web2_customers',
                pageId: null,
                psid: wc.rows[0].fb_id,
                name: wc.rows[0].name || null,
            });
        }
        res.json({ success: true, found: false, reason: 'no_fb_link' });
    } catch (e) {
        console.error('[web2-customers] fb-conversation:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// PATCH /:id — SỬA THỐNG NHẤT thông tin KH (tên/SĐT/địa chỉ) cho MỌI trang Web 2.0.
// :id = TPOS Partner Id (web2_customers.id). Ghi 2 chiều:
//   1. Push lên TPOS (CreateUpdatePartner by Id — đổi cả SĐT cũng update đúng partner).
//   2. Update cache web2_customers.
// Đây là NGUỒN DUY NHẤT để sửa KH — mọi trang gọi endpoint này.
router.patch('/:id', async (req, res) => {
    const db = req.app.locals.web2Db || req.app.locals.chatDb;
    const tposId = parseInt(req.params.id, 10);
    if (!Number.isFinite(tposId)) {
        return res.status(400).json({ success: false, error: 'id (TPOS Partner Id) không hợp lệ' });
    }
    const body = req.body || {};
    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    const address = body.address !== undefined ? String(body.address).trim() : undefined;
    let phone = body.phone !== undefined ? String(body.phone).replace(/\D/g, '') : undefined;
    if (phone && !phone.startsWith('0')) phone = '0' + phone.slice(-9);
    if (name === undefined && address === undefined && phone === undefined) {
        return res
            .status(400)
            .json({ success: false, error: 'cần ít nhất 1 field: name/phone/address' });
    }
    try {
        // Lấy phone hiện tại nếu request không đổi phone (pushCustomerToTPOS cần phone)
        let effectivePhone = phone;
        if (!effectivePhone) {
            const cur = await db.query('SELECT phone FROM web2_customers WHERE id = $1', [tposId]);
            effectivePhone = cur.rows[0]?.phone || null;
        }
        if (!effectivePhone) {
            return res
                .status(400)
                .json({ success: false, error: 'thiếu phone (không có trong cache, phải truyền)' });
        }
        // 1. Push TPOS (master) — by tposId nên đổi SĐT vẫn update đúng partner
        const tpos = await pushCustomerToTPOS(effectivePhone, { name, address, tposId });
        // 2. Update cache web2_customers (chỉ field gửi lên)
        await db.query(
            `UPDATE web2_customers
             SET name = COALESCE(NULLIF($2,''), name),
                 phone = COALESCE($3, phone),
                 address = COALESCE(NULLIF($4,''), address),
                 synced_at = NOW()
             WHERE id = $1`,
            [tposId, name ?? null, phone ?? null, address ?? null]
        );
        res.json({
            success: tpos?.success !== false,
            tposId: tpos?.tposId || tposId,
            tposSynced: tpos?.success === true,
            tposError: tpos?.success === false ? tpos.error : undefined,
        });
    } catch (e) {
        console.error('[web2-customers] patch error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
