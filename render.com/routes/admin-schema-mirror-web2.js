// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — admin endpoint Phase 4 mirror schema chatDb→web2Db.
// =====================================================================
// ADMIN SCHEMA MIRROR WEB2 (Phase 4 tách DB)
//
// Tạo schema (CHỈ DDL, KHÔNG data) của các bảng web2 trên web2Db (n2store-web2-db)
// bằng introspection từ chatDb (xem db/web2-schema-mirror.js).
// Additive + idempotent + an toàn: web2Db tables để TRỐNG tới khi Phase 6 cutover
// route. KHÔNG đụng chatDb (chỉ READ schema).
//
//   POST /api/admin/schema-mirror-web2   { confirm:'YES-MIRROR', dryRun:true|false, tables?:[] }
//        Header x-admin-secret = CLEANUP_SECRET
//   GET  /api/admin/schema-mirror-web2/status   — bảng nào đã có ở web2Db
// =====================================================================

const express = require('express');
const router = express.Router();
const { mirrorTableSchema, WEB2_TABLES } = require('../db/web2-schema-mirror');

const ADMIN_SECRET = process.env.CLEANUP_SECRET || '';

function authOk(req) {
    const provided = req.headers['x-admin-secret'] || req.query.secret || '';
    return ADMIN_SECRET && provided === ADMIN_SECRET;
}

// Source = chatDb (có schema gốc). Target = web2Db (đích). Phải KHÁC nhau.
function getPools(req) {
    const source = req.app.locals.chatDb;
    const target = req.app.locals.web2Db;
    return { source, target };
}

router.post('/schema-mirror-web2', async (req, res) => {
    if (!authOk(req)) {
        return res.status(403).json({ error: 'forbidden — missing/wrong x-admin-secret' });
    }
    const body = req.body || {};
    const dryRun = body.dryRun !== false; // mặc định dry-run cho an toàn
    if (!dryRun && body.confirm !== 'YES-MIRROR') {
        return res.status(400).json({ error: "cần confirm:'YES-MIRROR' khi dryRun:false" });
    }
    const { source, target } = getPools(req);
    if (!source || !target) {
        return res.status(500).json({ error: 'thiếu chatDb/web2Db pool' });
    }
    if (source === target) {
        return res.status(400).json({
            error: 'web2Db === chatDb (WEB2_DATABASE_URL chưa set) — không mirror lên chính nó',
        });
    }
    const tables = Array.isArray(body.tables) && body.tables.length ? body.tables : WEB2_TABLES;
    const results = [];
    for (const t of tables) {
        try {
            const r = await mirrorTableSchema(source, target, t, { dryRun });
            results.push({
                table: t,
                ok: true,
                columns: r.columnCount,
                indexes: r.indexCount,
                sequences: r.sequences,
                executed: r.executed,
                ...(dryRun ? { sql: r.sql } : {}),
            });
        } catch (e) {
            results.push({ table: t, ok: false, error: e.message });
        }
    }
    const okCount = results.filter((r) => r.ok).length;
    res.json({
        success: true,
        dryRun,
        target: 'web2Db (n2store-web2-db)',
        tablesTried: tables.length,
        okCount,
        failCount: tables.length - okCount,
        results,
    });
});

// So sánh bảng web2 đã tồn tại ở source (chatDb) vs target (web2Db).
router.get('/schema-mirror-web2/status', async (req, res) => {
    if (!authOk(req)) {
        return res.status(403).json({ error: 'forbidden' });
    }
    const { source, target } = getPools(req);
    if (!source || !target || source === target) {
        return res.status(400).json({ error: 'web2Db không tách (== chatDb)' });
    }
    try {
        const check = async (pool) => {
            const { rows } = await pool.query(
                `SELECT table_name FROM information_schema.tables
                 WHERE table_schema='public' AND table_name = ANY($1)`,
                [WEB2_TABLES]
            );
            return new Set(rows.map((r) => r.table_name));
        };
        const [srcSet, tgtSet] = await Promise.all([check(source), check(target)]);
        const status = WEB2_TABLES.map((t) => ({
            table: t,
            inChatDb: srcSet.has(t),
            inWeb2Db: tgtSet.has(t),
        }));
        res.json({
            success: true,
            mirrored: status.filter((s) => s.inWeb2Db).length,
            total: WEB2_TABLES.length,
            status,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
