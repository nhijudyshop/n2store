// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — one-time import KH từ TPOS Partner → warehouse web2_customers (dedupe phone).
// =====================================================================
// POST /api/admin/web2-import-customers  (header x-admin-secret = CLEANUP_SECRET)
//   Body: { dryRun?:bool, maxPages?:int }
//
// Kéo toàn bộ TPOS Partner (Type=Customer, Active) → upsert vào kho warehouse
// web2_customers, DEDUPE theo SĐT (phone UNIQUE + ON CONFLICT DO UPDATE +
// pre-merge JS giữ field đầy đủ nhất). Bỏ partner KHÔNG có SĐT (không khoá
// dedup được). Đây là migration 1 lần — sau đó Web 2.0 đọc warehouse, KHÔNG
// còn gọi TPOS live.
// =====================================================================

'use strict';
const express = require('express');
const router = express.Router();

const ADMIN_SECRET = process.env.CLEANUP_SECRET || '';
function authed(req) {
    // Header-only: KHÔNG nhận secret qua query (?secret=) — query string lộ qua
    // access log / Referer / browser history. Admin secret chỉ qua header.
    const p = req.headers['x-admin-secret'] || '';
    return ADMIN_SECRET && p === ADMIN_SECRET;
}

const TPOS_HOST = 'https://tomato.tpos.vn';
const PARTNER_VIEW = '/odata/Partner/ODataService.GetViewV2';

function normPhone(p) {
    let s = String(p || '').replace(/\D/g, '');
    if (s.length > 10) s = s.slice(-10);
    if (s && !s.startsWith('0') && s.length === 9) s = '0' + s;
    return s.length === 10 ? s : null;
}
// TPOS Status → warehouse status
function mapStatus(s) {
    const m = {
        Normal: 'Normal',
        BomHang: 'Bom',
        Bomb: 'Bom',
        Warning: 'Warning',
        Danger: 'Danger',
        VIP: 'VIP',
    };
    return m[s] || 'Normal';
}

async function tposGetPage(token, skip, top) {
    const qs = `?Type=Customer&Active=true&%24top=${top}&%24skip=${skip}&%24count=true&%24orderby=DateCreated+desc`;
    const r = await fetch(`${TPOS_HOST}${PARTNER_VIEW}${qs}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`TPOS ${r.status}`);
    const d = await r.json();
    return { rows: Array.isArray(d.value) ? d.value : [], total: d['@odata.count'] || null };
}

router.post('/web2-import-customers', async (req, res) => {
    if (!authed(req)) return res.status(403).json({ error: 'forbidden' });
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const dryRun = !!(req.body && req.body.dryRun);
    const maxPages = (req.body && Number(req.body.maxPages)) || 1000;
    const TOP = 200;

    let token;
    try {
        token = await require('../services/tpos-token-manager').getToken();
        if (!token) throw new Error('no TPOS token');
    } catch (e) {
        return res.status(502).json({ error: 'TPOS token: ' + e.message });
    }

    // 1) Fetch all + pre-dedupe by phone (merge: prefer non-empty, keep first seen = newest by DateCreated desc).
    const byPhone = new Map();
    let fetched = 0,
        noPhone = 0,
        page = 0;
    try {
        for (; page < maxPages; page++) {
            const { rows } = await tposGetPage(token, page * TOP, TOP);
            if (!rows.length) break;
            fetched += rows.length;
            for (const r of rows) {
                const phone = normPhone(r.Phone || r.Mobile);
                if (!phone) {
                    noPhone++;
                    continue;
                }
                const cand = {
                    phone,
                    name: r.Name || r.DisplayName || 'Khách hàng',
                    email: r.Email || null,
                    address: r.FullAddress || r.Street || null,
                    carrier: r.NameNetwork || null,
                    status: mapStatus(r.Status),
                    fb_id: r.Facebook_ASUserId || null,
                };
                const ex = byPhone.get(phone);
                if (!ex) {
                    byPhone.set(phone, cand);
                } else {
                    // merge: lấp field rỗng (giữ bản mới nhất làm gốc)
                    ex.name = ex.name && ex.name !== 'Khách hàng' ? ex.name : cand.name;
                    ex.email = ex.email || cand.email;
                    ex.address = ex.address || cand.address;
                    ex.carrier = ex.carrier || cand.carrier;
                    ex.fb_id = ex.fb_id || cand.fb_id;
                    if (ex.status === 'Normal' && cand.status !== 'Normal') ex.status = cand.status;
                }
            }
            if (rows.length < TOP) break;
        }
    } catch (e) {
        return res.status(502).json({ error: 'TPOS fetch: ' + e.message, fetched, page });
    }

    const unique = Array.from(byPhone.values());
    if (dryRun) {
        return res.json({
            dryRun: true,
            fetched,
            noPhone,
            uniquePhones: unique.length,
            duplicatesCollapsed: fetched - noPhone - unique.length,
            sample: unique.slice(0, 3),
        });
    }

    // 2) Bulk upsert (batches), ON CONFLICT (phone) DO UPDATE — lấp field rỗng.
    let imported = 0;
    const now = Date.now();
    const BATCH = 500;
    try {
        for (let i = 0; i < unique.length; i += BATCH) {
            const chunk = unique.slice(i, i + BATCH);
            const vals = [];
            const params = [];
            chunk.forEach((c, k) => {
                const b = k * 9;
                vals.push(
                    `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},'import',$${b + 8},$${b + 9},$${b + 9})`
                );
                params.push(
                    c.name,
                    c.phone,
                    c.email,
                    c.address,
                    c.carrier,
                    c.status,
                    c.fb_id,
                    JSON.stringify([{ ts: now, action: 'import', note: 'TPOS Partner' }]),
                    now
                );
            });
            const sql = `
                INSERT INTO web2_customers
                    (name, phone, email, address, carrier, status, fb_id, source, history, created_at, updated_at)
                VALUES ${vals.join(',')}
                ON CONFLICT (phone) DO UPDATE SET
                    name = CASE WHEN web2_customers.name IN ('','Khách hàng','Khách hàng mới')
                                THEN EXCLUDED.name ELSE web2_customers.name END,
                    email = COALESCE(NULLIF(web2_customers.email,''), EXCLUDED.email),
                    address = COALESCE(NULLIF(web2_customers.address,''), EXCLUDED.address),
                    carrier = COALESCE(NULLIF(web2_customers.carrier,''), EXCLUDED.carrier),
                    fb_id = COALESCE(NULLIF(web2_customers.fb_id,''), EXCLUDED.fb_id),
                    updated_at = EXCLUDED.updated_at`;
            const r = await pool.query(sql, params);
            imported += r.rowCount || chunk.length;
        }
    } catch (e) {
        return res.status(500).json({ error: 'upsert: ' + e.message, fetched, imported });
    }

    res.json({
        success: true,
        fetched,
        noPhone,
        uniquePhones: unique.length,
        duplicatesCollapsed: fetched - noPhone - unique.length,
        imported,
    });
});

module.exports = router;
