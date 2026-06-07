// #Note: WEB2.0 module. Fetch TPOS Partner info LIVE cho 1 KH theo phone.
//
// Per user spec 2026-06-01: "địa chỉ khách hàng lấy theo TPOS khách hàng"
// → address must be fresh from TPOS Partner, not local customers table cache.
//
// Endpoint backed by services/tpos-customer-service.js searchCustomerByPhone()
// which calls TPOS /odata/Partner/ODataService.GetViewV2 với phone filter.
//
// Response includes: id, name, phone, email, address, status, dateCreated
// (exact match từ TPOS). Cached 5min per phone tại server (Map) để tránh spam
// TPOS API.

const express = require('express');
const router = express.Router();
const { searchCustomerByPhone } = require('../../services/tpos-customer-service');

const _cache = new Map(); // phone → { data, ts }
const TTL = 5 * 60 * 1000; // 5 minutes

router.get('/:phone', async (req, res) => {
    try {
        const phone = String(req.params.phone || '').trim();
        if (!phone) {
            return res.status(400).json({ success: false, error: 'phone required' });
        }
        const cached = _cache.get(phone);
        if (cached && Date.now() - cached.ts < TTL) {
            return res.json({ success: true, customer: cached.data, source: 'cache' });
        }
        const result = await searchCustomerByPhone(phone);
        if (!result?.success) {
            return res.status(502).json({
                success: false,
                error: result?.error || 'TPOS lookup failed',
            });
        }
        _cache.set(phone, { data: result.customer, ts: Date.now() });
        res.json({ success: true, customer: result.customer, source: 'tpos-live' });
    } catch (e) {
        console.error('[web2-customer-tpos] error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 2026-06-01: Lookup TPOS customer by FB User ID (Facebook_ASUserId).
// Used khi tpos-pancake tạo native_order với phone trống — frontend gọi
// endpoint này để user trigger thủ công "Lấy info TPOS".
// Backend tự upsert customers table + link fb_id cho lần sau (cached).
const { searchCustomerByFbUserId } = require('../../services/tpos-customer-service');
const { getOrCreateCustomerFromTPOS } = require('../../services/web2-order-customer-service'); // web2_order_customers (web2Db)

router.get('/by-fb-id/:fbUserId', async (req, res) => {
    try {
        const fbUserId = String(req.params.fbUserId || '').trim();
        if (!fbUserId) {
            return res.status(400).json({ success: false, error: 'fbUserId required' });
        }
        // crmTeamId optional — chatomni/info endpoint cần để biết Pancake page nào tra cứu KH
        const crmTeamId = req.query.crmTeamId ? String(req.query.crmTeamId).trim() : undefined;
        const result = await searchCustomerByFbUserId(fbUserId, crmTeamId);
        if (!result?.success) {
            return res.status(502).json({
                success: false,
                error: result?.error || 'TPOS lookup failed',
            });
        }
        if (!result.customer) {
            return res.json({ success: true, customer: null, source: 'tpos-not-found' });
        }
        // Ghi kho KH warehouse (web2_customers) + link fb_id để lookup nhanh.
        // Endpoint ĐỌC live TPOS để hiển thị info, GHI vào warehouse độc lập
        // (KHÔNG lưu tpos_id) — chỉ là nhập liệu thủ công 1 chiều khi user bấm.
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        if (pool && result.customer.phone) {
            try {
                const created = await getOrCreateCustomerFromTPOS(pool, result.customer.phone, {
                    name: result.customer.name,
                    address: result.customer.address,
                    fb_id: fbUserId,
                });
                if (created?.customerId) {
                    await pool.query(
                        `UPDATE web2_customers
                         SET fb_id = COALESCE(NULLIF(fb_id, ''), $2),
                             name = COALESCE(NULLIF($3, ''), name),
                             address = COALESCE(NULLIF($4, ''), address),
                             updated_at = $5
                         WHERE id = $1`,
                        [
                            created.customerId,
                            fbUserId,
                            result.customer.name,
                            result.customer.address,
                            Date.now(),
                        ]
                    );
                    result.customer.localCustomerId = created.customerId;
                }
            } catch (e) {
                console.warn('[web2-customer-tpos] upsert after fb lookup failed:', e.message);
            }
        }
        res.json({ success: true, customer: result.customer, source: 'tpos-live' });
    } catch (e) {
        console.error('[web2-customer-tpos] fb-id error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
