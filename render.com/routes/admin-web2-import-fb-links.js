// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — backfill fb_id↔phone từ Web 1.0 customers → warehouse (cho live-chat enrich).
// =====================================================================
// POST /api/admin/web2-import-fb-links  (header x-admin-secret = CLEANUP_SECRET)
//   Body: { dryRun?:bool }
//
// Kho TPOS import (web2_customers) keyed theo SĐT nhưng KHÔNG có fb_id → live-chat
// (match theo FB id của comment) không enrich được. Web 1.0 `customers` có sẵn
// liên kết fb_id↔phone (nhiều năm đơn hàng). Backfill 1 lần: đọc customers (fb_id
// IS NOT NULL) → upsert warehouse theo PHONE, set fb_id + gom mọi fb_id của 1 SĐT
// vào fb_psids ({fbId: fbId}) để khớp "1 SĐT = nhiều tài khoản FB".
//
// Read-only Web 1.0 (chatDb), write Web 2.0 (web2Db). Migration 1 lần.
// =====================================================================

'use strict';
const express = require('express');
const router = express.Router();

const ADMIN_SECRET = process.env.CLEANUP_SECRET || '';
function authed(req) {
    const p = req.headers['x-admin-secret'] || '';
    return ADMIN_SECRET && p === ADMIN_SECRET;
}
function normPhone(p) {
    let s = String(p || '').replace(/\D/g, '');
    if (s.length > 10) s = s.slice(-10);
    if (s && !s.startsWith('0') && s.length === 9) s = '0' + s;
    return s.length === 10 ? s : null;
}

router.post('/web2-import-fb-links', async (req, res) => {
    if (!authed(req)) return res.status(403).json({ error: 'forbidden' });
    const web2Db = req.app.locals.web2Db;
    const chatDb = req.app.locals.chatDb;
    if (!web2Db || !chatDb) return res.status(500).json({ error: 'DB pools unavailable' });
    const dryRun = !!(req.body && req.body.dryRun);

    // 1) Đọc Web 1.0 customers có fb_id (read-only).
    let rows;
    try {
        const r = await chatDb.query(
            `SELECT phone, fb_id, name FROM customers
             WHERE fb_id IS NOT NULL AND fb_id <> '' AND phone IS NOT NULL AND phone <> ''`
        );
        rows = r.rows;
    } catch (e) {
        return res.status(500).json({ error: 'read Web1 customers: ' + e.message });
    }

    // 2) Gom theo SĐT chuẩn hoá: { phone: {name, fbIds:Set} }
    const byPhone = new Map();
    let skipped = 0;
    for (const row of rows) {
        const phone = normPhone(row.phone);
        const fbId = String(row.fb_id || '').trim();
        if (!phone || !fbId) {
            skipped++;
            continue;
        }
        let e = byPhone.get(phone);
        if (!e) {
            e = { name: row.name || '', fbIds: new Set() };
            byPhone.set(phone, e);
        }
        e.fbIds.add(fbId);
        if (!e.name && row.name) e.name = row.name;
    }

    const phones = Array.from(byPhone.keys());
    if (dryRun) {
        const multi = phones.filter((p) => byPhone.get(p).fbIds.size > 1).length;
        return res.json({
            dryRun: true,
            web1Rows: rows.length,
            skipped,
            uniquePhones: phones.length,
            phonesMultiFb: multi,
            sample: phones.slice(0, 3).map((p) => ({
                phone: p,
                name: byPhone.get(p).name,
                fbIds: Array.from(byPhone.get(p).fbIds),
            })),
        });
    }

    // 3) Upsert warehouse theo phone: set fb_id (primary) + fb_psids {fbId:fbId} + name.
    let updated = 0,
        inserted = 0;
    const now = Date.now();
    const BATCH = 300;
    try {
        for (let i = 0; i < phones.length; i += BATCH) {
            const chunk = phones.slice(i, i + BATCH);
            for (const phone of chunk) {
                const e = byPhone.get(phone);
                const fbArr = Array.from(e.fbIds);
                const primary = fbArr[0];
                const psids = {};
                for (const f of fbArr) psids[f] = f; // {fbId: fbId} cho match đa tài khoản
                // ON CONFLICT (phone): set fb_id nếu trống, merge fb_psids, fill name.
                const r = await web2Db.query(
                    `INSERT INTO web2_customers (name, phone, fb_id, fb_psids, source, created_at, updated_at)
                     VALUES ($1, $2, $3, $4::jsonb, 'fb-link', $5, $5)
                     ON CONFLICT (phone) DO UPDATE SET
                         fb_id = COALESCE(NULLIF(web2_customers.fb_id,''), EXCLUDED.fb_id),
                         fb_psids = web2_customers.fb_psids || EXCLUDED.fb_psids,
                         name = CASE WHEN web2_customers.name IN ('','Khách hàng','Khách hàng mới')
                                     THEN EXCLUDED.name ELSE web2_customers.name END,
                         updated_at = EXCLUDED.updated_at
                     RETURNING (xmax = 0) AS inserted`,
                    [e.name || 'Khách hàng', phone, primary, JSON.stringify(psids), now]
                );
                if (r.rows[0]?.inserted) inserted++;
                else updated++;
            }
        }
    } catch (e) {
        return res.status(500).json({ error: 'upsert: ' + e.message, updated, inserted });
    }

    res.json({
        success: true,
        web1Rows: rows.length,
        skipped,
        uniquePhones: phones.length,
        updated,
        inserted,
    });
});

module.exports = router;
