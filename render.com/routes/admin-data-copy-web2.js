// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — admin endpoint Phase 5 copy data chatDb→web2Db.
// =====================================================================
// ADMIN DATA COPY WEB2 (Phase 5 tách DB)
//
// Copy ROWS từ chatDb → web2Db cho các bảng web2 (idempotent ON CONFLICT).
// READ-ONLY trên chatDb. Verify count + SUM(balance/amount) khớp 2 bên.
// Chạy được nhiều lần (re-sync delta). web2Db chưa được route dùng tới Phase 6.
//
//   POST /api/admin/data-copy-web2  { confirm:'YES-COPY', dryRun, tables?, batchSize? }
//        Header x-admin-secret = CLEANUP_SECRET
//   GET  /api/admin/data-copy-web2/verify  — đối chiếu count + money SUM
// =====================================================================

const express = require('express');
const router = express.Router();
const { copyTableData, verifyMoneySum, bumpSequences } = require('../db/web2-data-copy');
const { WEB2_TABLES } = require('../db/web2-schema-mirror');

const ADMIN_SECRET = process.env.CLEANUP_SECRET || '';
function authOk(req) {
    const p = req.headers['x-admin-secret'] || req.query.secret || '';
    return ADMIN_SECRET && p === ADMIN_SECRET;
}
function getPools(req) {
    return { source: req.app.locals.chatDb, target: req.app.locals.web2Db };
}

router.post('/data-copy-web2', async (req, res) => {
    if (!authOk(req)) return res.status(403).json({ error: 'forbidden' });
    const body = req.body || {};
    const dryRun = body.dryRun !== false;
    if (!dryRun && body.confirm !== 'YES-COPY') {
        return res.status(400).json({ error: "cần confirm:'YES-COPY' khi dryRun:false" });
    }
    const { source, target } = getPools(req);
    if (!source || !target || source === target) {
        return res.status(400).json({ error: 'web2Db không tách (== chatDb)' });
    }
    const tables = Array.isArray(body.tables) && body.tables.length ? body.tables : WEB2_TABLES;
    const batchSize = Math.min(parseInt(body.batchSize, 10) || 500, 2000);
    const results = [];
    for (const t of tables) {
        try {
            const r = await copyTableData(source, target, t, { batchSize, dryRun });
            const money = await verifyMoneySum(source, target, t);
            results.push({ ...r, money });
        } catch (e) {
            results.push({ table: t, ok: false, error: e.message });
        }
    }
    const mismatches = results.filter(
        (r) => r.match === false || (r.money && r.money.match === false)
    );
    res.json({
        success: true,
        dryRun,
        tablesTried: tables.length,
        mismatchCount: mismatches.length,
        mismatches: mismatches.map((m) => m.table),
        results,
    });
});

router.get('/data-copy-web2/verify', async (req, res) => {
    if (!authOk(req)) return res.status(403).json({ error: 'forbidden' });
    const { source, target } = getPools(req);
    if (!source || !target || source === target) {
        return res.status(400).json({ error: 'web2Db không tách' });
    }
    try {
        const out = [];
        for (const t of WEB2_TABLES) {
            const q = `SELECT COUNT(*)::bigint AS n FROM "${t.replace(/"/g, '')}"`;
            const [s, d] = await Promise.all([source.query(q), target.query(q)]);
            const money = await verifyMoneySum(source, target, t);
            out.push({
                table: t,
                chatDb: Number(s.rows[0].n),
                web2Db: Number(d.rows[0].n),
                match: Number(s.rows[0].n) === Number(d.rows[0].n),
                money,
            });
        }
        res.json({
            success: true,
            allMatch: out.every((o) => o.match && (!o.money || o.money.match)),
            tables: out,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/admin/data-copy-web2/bump-sequences { confirm:'YES-BUMP', delta? }
// Bump sequence web2Db +delta TRƯỚC cutover (chống collision gap rows).
router.post('/data-copy-web2/bump-sequences', async (req, res) => {
    if (!authOk(req)) return res.status(403).json({ error: 'forbidden' });
    const body = req.body || {};
    if (body.confirm !== 'YES-BUMP') {
        return res.status(400).json({ error: "cần confirm:'YES-BUMP'" });
    }
    const { target } = getPools(req);
    const source = req.app.locals.chatDb;
    if (!target || !source || source === target) {
        return res.status(400).json({ error: 'web2Db không tách' });
    }
    const delta = Math.min(parseInt(body.delta, 10) || 10000, 1000000);
    try {
        const result = await bumpSequences(target, WEB2_TABLES, delta);
        res.json({ success: true, delta, result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
