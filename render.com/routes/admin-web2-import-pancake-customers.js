// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — backfill 1 lần SĐT + fb_id từ Pancake (INBOX conversations) → kho web2_customers.
// =====================================================================
// POST /api/admin/web2-import-pancake-customers  (header x-admin-secret = CLEANUP_SECRET)
//   Body: { dryRun?:bool, maxPages?:int, sinceDays?:int }
//
// Pancake conversations (INBOX) có customer {fb_id, name} + recent_phone_numbers.
// Backfill: link fb_id ↔ SĐT vào kho warehouse (KH từ TPOS đã có địa chỉ/trạng
// thái — bổ sung fb_id để live-chat khớp được commenter). Địa chỉ/trạng thái
// Pancake KHÔNG có → không đụng (giữ data TPOS).
//   • Có phone → upsert theo phone: set fb_id nếu trống, tên nếu trống.
//   • Khác phone cùng fb_id → alt_phones (không ghi đè chính).
// =====================================================================

'use strict';
const express = require('express');
const router = express.Router();

const ADMIN_SECRET = process.env.CLEANUP_SECRET || '';
function authed(req) {
    const p = req.headers['x-admin-secret'] || req.query.secret || '';
    return ADMIN_SECRET && p === ADMIN_SECRET;
}

const PANCAKE_API = 'https://pancake.vn/api/v1';
const DEFAULT_PAGES = ['117267091364524', '270136663390370']; // House, Store

function normPhone(p) {
    let s = String(p || '').replace(/\D/g, '');
    if (s.length > 10) s = s.slice(-10);
    if (s && !s.startsWith('0') && s.length === 9) s = '0' + s;
    return s.length === 10 ? s : null;
}
function _jwtValid(jwt) {
    if (!jwt) return false;
    try {
        const exp = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8')).exp;
        return !exp || exp > Math.floor(Date.now() / 1000) + 60;
    } catch {
        return false;
    }
}
async function getJwt(chatPool) {
    try {
        const r = await chatPool.query('SELECT token FROM pancake_accounts WHERE is_active = true');
        const ok = r.rows.find((x) => _jwtValid(x.token));
        if (ok) return ok.token;
    } catch (_) {}
    return _jwtValid(process.env.PANCAKE_JWT) ? process.env.PANCAKE_JWT : null;
}

router.post('/web2-import-pancake-customers', async (req, res) => {
    if (!authed(req)) return res.status(403).json({ error: 'forbidden' });
    const web2 = req.app.locals.web2Db || req.app.locals.chatDb;
    const chat = req.app.locals.chatDb;
    if (!web2) return res.status(500).json({ error: 'DB unavailable' });
    const dryRun = !!(req.body && req.body.dryRun);
    const maxPages = (req.body && Number(req.body.maxPages)) || 400;
    const sinceDays = (req.body && Number(req.body.sinceDays)) || 365;

    const jwt = await getJwt(chat);
    if (!jwt) return res.status(502).json({ error: 'no valid Pancake JWT (pancake_accounts/env)' });

    const now = Math.floor(Date.now() / 1000);
    const since = now - sinceDays * 86400;
    // Gom theo phone: {phone → {name, fbIds:Set}}; + theo fbId không phone.
    const byPhone = new Map();
    let scanned = 0,
        noPhone = 0;

    try {
        for (const pageId of DEFAULT_PAGES) {
            for (let pg = 1; pg <= maxPages; pg++) {
                const url = `${PANCAKE_API}/pages/${pageId}/conversations?type=INBOX&since=${since}&until=${now}&page_number=${pg}&access_token=${encodeURIComponent(jwt)}`;
                let d;
                try {
                    d = await fetch(url).then((r) => r.json());
                } catch (e) {
                    break;
                }
                const cv = Array.isArray(d.conversations) ? d.conversations : [];
                if (!cv.length) break;
                for (const c of cv) {
                    scanned++;
                    const cust = (Array.isArray(c.customers) && c.customers[0]) || c.from || {};
                    const fbId = cust.fb_id || cust.id || c.from_psid || null;
                    const phones = Array.isArray(c.recent_phone_numbers)
                        ? c.recent_phone_numbers
                              .map((p) => normPhone(p.phone_number || p.phone || p.captured))
                              .filter(Boolean)
                        : [];
                    if (!phones.length) {
                        noPhone++;
                        continue;
                    }
                    const primary = phones[0];
                    let e = byPhone.get(primary);
                    if (!e) {
                        e = { name: cust.name || '', fbIds: new Set(), altPhones: new Set() };
                        byPhone.set(primary, e);
                    }
                    if (!e.name && cust.name) e.name = cust.name;
                    if (fbId) e.fbIds.add(String(fbId));
                    for (const ph of phones.slice(1)) if (ph !== primary) e.altPhones.add(ph);
                }
                if (cv.length < 20) break;
            }
        }
    } catch (e) {
        return res.status(502).json({ error: 'Pancake fetch: ' + e.message, scanned });
    }

    const uniquePhones = byPhone.size;
    if (dryRun) {
        const sample = Array.from(byPhone.entries())
            .slice(0, 3)
            .map(([phone, v]) => ({ phone, name: v.name, fbIds: [...v.fbIds] }));
        return res.json({ dryRun: true, scanned, noPhone, uniquePhones, sample });
    }

    // Upsert: phone chính → set fb_id/name nếu trống; alt_phones merge; KHÔNG đụng
    // address/status (giữ data TPOS). fb_psids gom mọi fbId của phone đó.
    let upserted = 0;
    const nowMs = Date.now();
    try {
        for (const [phone, v] of byPhone.entries()) {
            const fbId = [...v.fbIds][0] || null;
            const fbPsids = {};
            for (const f of v.fbIds) fbPsids[f] = f;
            await web2.query(
                `INSERT INTO web2_customers (name, phone, fb_id, fb_psids, alt_phones, source, created_at, updated_at)
                 VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,'pancake-sync',$6,$6)
                 ON CONFLICT (phone) DO UPDATE SET
                    name = CASE WHEN web2_customers.name IN ('','Khách hàng','Khách hàng mới')
                                THEN EXCLUDED.name ELSE web2_customers.name END,
                    fb_id = COALESCE(NULLIF(web2_customers.fb_id,''), EXCLUDED.fb_id),
                    fb_psids = web2_customers.fb_psids || EXCLUDED.fb_psids,
                    alt_phones = (
                        SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb)
                        FROM jsonb_array_elements(web2_customers.alt_phones || EXCLUDED.alt_phones) e
                    ),
                    updated_at = EXCLUDED.updated_at`,
                [
                    v.name || 'Khách hàng',
                    phone,
                    fbId,
                    JSON.stringify(fbPsids),
                    JSON.stringify([...v.altPhones]),
                    nowMs,
                ]
            );
            upserted++;
        }
    } catch (e) {
        return res.status(500).json({ error: 'upsert: ' + e.message, upserted });
    }

    res.json({ success: true, scanned, noPhone, uniquePhones, upserted });
});

module.exports = router;
