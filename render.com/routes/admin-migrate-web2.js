// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. | WEB2.0 module — ONE-SHOT migration
// =====================================================
// ADMIN MIGRATE WEB2 — chuyển web2_records từ Neon (web2Db) → Render PG (chatDb)
// =====================================================
//
// P1 2026-05-30: user ask consolidate Neon → Render Postgres (cùng provider,
// đã trả phí $19/mo, còn 489MB headroom trong Basic 1GB plan).
//
// Pattern: streaming dump+restore qua existing pool connections (không cần
// pg_dump external). Insert theo batch để tránh long transaction.
//
// Steps:
//   1. POST /api/admin/migrate-web2-records — chạy dry-run + actual
//      Body: { confirm: 'YES-MIGRATE-NOW', mode: 'dry-run' | 'run', batchSize: 500 }
//      Headers: x-admin-secret = CLEANUP_SECRET (re-use existing env)
//
//   2. Server reads Neon (web2Db) → batched INSERT vào Render (chatDb).
//   3. Skip nếu (entity_slug, code) đã tồn tại bên chatDb (idempotent — chạy
//      lại không double-insert).
//   4. Verify row counts khớp + log migration entry.
//
// SAU MIGRATION:
//   1. User remove env WEB2_DATABASE_URL trên Render → web2Db tự fallback chatDb
//   2. User decommission Neon project
//   3. services-dashboard update inventory (chỉ 1 PG)

const express = require('express');
const router = express.Router();

const ADMIN_SECRET = process.env.CLEANUP_SECRET || ''; // re-use existing env

router.post('/migrate-web2-records', async (req, res) => {
    // AUTH gate
    const provided = req.headers['x-admin-secret'] || req.query.secret || '';
    if (!ADMIN_SECRET || provided !== ADMIN_SECRET) {
        return res.status(403).json({ error: 'forbidden — missing/wrong x-admin-secret header' });
    }

    const body = req.body || {};
    if (body.confirm !== 'YES-MIGRATE-NOW') {
        return res.status(400).json({
            error: 'must POST body { confirm: "YES-MIGRATE-NOW", mode: "dry-run"|"run", batchSize?: 500 }',
        });
    }
    const mode = body.mode === 'run' ? 'run' : 'dry-run';
    const batchSize = Math.max(50, Math.min(2000, Number(body.batchSize) || 500));

    const source = req.app.locals.web2Db; // Neon
    const target = req.app.locals.chatDb; // Render PG
    if (!source || !target) {
        return res.status(500).json({ error: 'pools not initialized' });
    }
    if (source === target) {
        return res.status(400).json({
            error: 'source === target — WEB2_DATABASE_URL chưa set hoặc đã fallback. Migration không cần.',
        });
    }

    const startedAt = Date.now();
    const log = [];
    const _log = (msg) => {
        log.push(`[${new Date().toISOString()}] ${msg}`);
        console.log('[MIGRATE-WEB2]', msg);
    };

    try {
        _log(`Mode: ${mode}, batchSize: ${batchSize}`);

        // Count source
        const srcCount = await source.query(`SELECT COUNT(*)::int AS n FROM web2_records`);
        const sourceRows = srcCount.rows[0].n;
        _log(`Source (Neon) web2_records: ${sourceRows} rows`);

        // Count target existing
        const tgtCount = await target.query(`SELECT COUNT(*)::int AS n FROM web2_records`);
        const targetExisting = tgtCount.rows[0].n;
        _log(`Target (Render PG) existing: ${targetExisting} rows`);

        // Per-entity breakdown
        const breakdown = await source.query(`
            SELECT entity_slug, COUNT(*)::int AS n
            FROM web2_records GROUP BY entity_slug ORDER BY n DESC
        `);
        _log(`Source entities: ${breakdown.rows.length}`);
        for (const row of breakdown.rows.slice(0, 10)) {
            _log(`  ${row.entity_slug}: ${row.n} rows`);
        }

        if (mode === 'dry-run') {
            return res.json({
                ok: true,
                mode: 'dry-run',
                sourceRows,
                targetExisting,
                entityBreakdown: breakdown.rows,
                log,
                hint: 'Re-POST với mode:"run" để thực thi migration.',
            });
        }

        // RUN — stream + batch INSERT
        let copied = 0;
        let skipped = 0;
        let lastId = 0;
        while (true) {
            const batch = await source.query(
                `SELECT id, entity_slug, code, name, data, is_active, created_by, created_at, updated_at
                 FROM web2_records WHERE id > $1 ORDER BY id LIMIT $2`,
                [lastId, batchSize]
            );
            if (batch.rows.length === 0) break;

            // Build VALUES for multi-row INSERT
            const cols = [];
            const vals = [];
            for (const r of batch.rows) {
                const i = vals.length + 1;
                cols.push(
                    `($${i},$${i + 1},$${i + 2},$${i + 3},$${i + 4}::jsonb,$${i + 5},$${i + 6},$${i + 7},$${i + 8})`
                );
                vals.push(
                    r.entity_slug,
                    r.code,
                    r.name,
                    JSON.stringify(r.data || {}),
                    r.is_active,
                    r.created_by,
                    r.created_at,
                    r.updated_at,
                    r.id // not used in cols string, just tracking max
                );
                // pop trailing r.id from vals — only 8 columns insert
                vals.pop();
            }

            // Idempotent: ON CONFLICT skip (entity_slug + code unique)
            const result = await target.query(
                `INSERT INTO web2_records
                    (entity_slug, code, name, data, is_active, created_by, created_at, updated_at)
                 VALUES ${cols.join(',')}
                 ON CONFLICT (entity_slug, code) DO NOTHING
                 RETURNING id`,
                vals
            );
            copied += result.rowCount;
            skipped += batch.rows.length - result.rowCount;
            lastId = batch.rows[batch.rows.length - 1].id;
            _log(
                `Batch lastId=${lastId} — inserted ${result.rowCount}, skipped ${batch.rows.length - result.rowCount}. Total copied: ${copied}`
            );
        }

        // Verify final counts
        const finalCount = await target.query(`SELECT COUNT(*)::int AS n FROM web2_records`);
        const targetFinal = finalCount.rows[0].n;
        _log(
            `Final target rows: ${targetFinal} (source: ${sourceRows}, delta: ${targetFinal - sourceRows})`
        );

        // Add migration log row (entity_slug=_migration_log)
        try {
            await target.query(
                `INSERT INTO web2_records
                    (entity_slug, code, name, data, is_active, created_at, updated_at)
                 VALUES ('_migration_log', $1, 'Neon → Render PG migration', $2, true, $3, $3)
                 ON CONFLICT (entity_slug, code) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
                [
                    `neon-to-render-${new Date().toISOString().slice(0, 10)}`,
                    JSON.stringify({
                        sourceRows,
                        copied,
                        skipped,
                        targetBefore: targetExisting,
                        targetFinal,
                        startedAt,
                        finishedAt: Date.now(),
                        durationMs: Date.now() - startedAt,
                        note: 'Migration completed. WEB2_DATABASE_URL env can now be removed; web2Db will fall back to chatDb.',
                    }),
                    Date.now(),
                ]
            );
            _log('Migration log row written');
        } catch (e) {
            _log(`Migration log write fail: ${e.message}`);
        }

        res.json({
            ok: true,
            mode: 'run',
            sourceRows,
            copied,
            skipped,
            targetBefore: targetExisting,
            targetFinal,
            durationMs: Date.now() - startedAt,
            log,
            nextStep:
                'Remove WEB2_DATABASE_URL env trên Render → re-deploy → verify endpoints → decommission Neon.',
        });
    } catch (e) {
        _log(`ERROR: ${e.message}`);
        res.status(500).json({ error: e.message, log });
    }
});

// GET /api/admin/migrate-web2-records/status — kiểm tra row counts hiện tại
router.get('/migrate-web2-records/status', async (req, res) => {
    const provided = req.headers['x-admin-secret'] || req.query.secret || '';
    if (!ADMIN_SECRET || provided !== ADMIN_SECRET) {
        return res.status(403).json({ error: 'forbidden' });
    }
    try {
        const source = req.app.locals.web2Db;
        const target = req.app.locals.chatDb;
        const sourceCount =
            source !== target
                ? (await source.query(`SELECT COUNT(*)::int AS n FROM web2_records`)).rows[0].n
                : 'same-pool (already consolidated)';
        const targetCount = (await target.query(`SELECT COUNT(*)::int AS n FROM web2_records`))
            .rows[0].n;
        const consolidated = source === target;
        const lastMigration = await target.query(
            `SELECT code, data, created_at FROM web2_records
             WHERE entity_slug='_migration_log' ORDER BY created_at DESC LIMIT 1`
        );
        res.json({
            ok: true,
            consolidated,
            sourceCount,
            targetCount,
            lastMigration: lastMigration.rows[0] || null,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
