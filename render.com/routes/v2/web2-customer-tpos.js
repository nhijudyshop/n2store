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

module.exports = router;
