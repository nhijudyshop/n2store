// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// WEB 2.0 GENERIC ENTITY REST API
// One table backs all 87 TPOS-clone pages. Schema-driven CRUD.
// Routes: /api/web2/:entity/(health|list|get/:code|create|update/:code|delete/:code)
// =====================================================

const express = require('express');
const router = express.Router();

let _tablesCreated = false;
async function ensureTables(pool) {
    if (_tablesCreated) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_entities (
                slug        VARCHAR(60)  PRIMARY KEY,
                label       VARCHAR(100) NOT NULL,
                schema      JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at  BIGINT NOT NULL,
                updated_at  BIGINT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS web2_records (
                id            BIGSERIAL PRIMARY KEY,
                entity_slug   VARCHAR(60) NOT NULL,
                code          VARCHAR(100),
                name          VARCHAR(255),
                data          JSONB NOT NULL DEFAULT '{}'::jsonb,
                is_active     BOOLEAN NOT NULL DEFAULT true,
                created_by    VARCHAR(100),
                created_at    BIGINT NOT NULL,
                updated_at    BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_web2_records_entity   ON web2_records(entity_slug);
            CREATE INDEX IF NOT EXISTS idx_web2_records_name     ON web2_records(name);
            CREATE INDEX IF NOT EXISTS idx_web2_records_code     ON web2_records(code);
            CREATE INDEX IF NOT EXISTS idx_web2_records_active   ON web2_records(is_active);
            CREATE INDEX IF NOT EXISTS idx_web2_records_created  ON web2_records(created_at DESC);
            CREATE UNIQUE INDEX IF NOT EXISTS uq_web2_records_entity_code
                ON web2_records(entity_slug, code) WHERE code IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_web2_records_entity_active_updated
                ON web2_records(entity_slug, is_active DESC, updated_at DESC);
        `);
        _tablesCreated = true;
        console.log('[WEB2-GENERIC] Tables created/verified');
    } catch (e) {
        console.error('[WEB2-GENERIC] Table creation error:', e.message);
    }
}

function mapRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        entitySlug: row.entity_slug,
        code: row.code,
        name: row.name,
        data: row.data || {},
        isActive: !!row.is_active,
        createdBy: row.created_by,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
function validSlug(s) {
    return typeof s === 'string' && SLUG_RE.test(s);
}

// -----------------------------------------------------
// GET /api/web2/_storage
// Trả disk usage cho web2_records: tổng table + index, breakdown theo entity_slug.
// Read-only, an toàn dùng để monitor.
// -----------------------------------------------------
router.get('/_storage', async (req, res) => {
    const pool = req.app.locals.web2Db;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const total = await pool.query(`
            SELECT
                pg_size_pretty(pg_total_relation_size('web2_records')) AS total_size,
                pg_size_pretty(pg_relation_size('web2_records')) AS table_size,
                pg_size_pretty(pg_indexes_size('web2_records')) AS index_size,
                pg_total_relation_size('web2_records') AS total_bytes,
                pg_database_size(current_database()) AS db_total_bytes
        `);
        const byEntity = await pool.query(`
            SELECT entity_slug, COUNT(*)::int AS records,
                   pg_size_pretty(SUM(pg_column_size(data))) AS data_size,
                   SUM(pg_column_size(data))::bigint AS data_bytes
            FROM web2_records
            GROUP BY entity_slug
            ORDER BY data_bytes DESC
        `);
        res.json({
            ok: true,
            web2_records: {
                total_size_pretty: total.rows[0].total_size,
                table_size_pretty: total.rows[0].table_size,
                index_size_pretty: total.rows[0].index_size,
                total_bytes: Number(total.rows[0].total_bytes),
            },
            db_total_bytes: Number(total.rows[0].db_total_bytes),
            db_total_pretty: prettyBytes(Number(total.rows[0].db_total_bytes)),
            by_entity: byEntity.rows.map((r) => ({
                slug: r.entity_slug,
                records: r.records,
                data_size_pretty: r.data_size,
                data_bytes: Number(r.data_bytes),
            })),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

function prettyBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
    return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// -----------------------------------------------------
// GET /api/web2/:entity/health
// -----------------------------------------------------
router.get('/:entity/health', async (req, res) => {
    const pool = req.app.locals.web2Db;
    if (!pool) return res.status(500).json({ ok: false, error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ ok: false, error: 'invalid entity slug' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            'SELECT COUNT(*)::int AS n FROM web2_records WHERE entity_slug = $1',
            [req.params.entity]
        );
        res.json({ ok: true, entity: req.params.entity, count: r.rows[0].n });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// -----------------------------------------------------
// GET /api/web2/:entity/list?search=&activeOnly=true&page=1&limit=200
// -----------------------------------------------------
router.get('/:entity/list', async (req, res) => {
    const pool = req.app.locals.web2Db;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ error: 'invalid entity slug' });
    try {
        await ensureTables(pool);
        const { search, activeOnly, page = 1, limit = 200 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(2000, Math.max(1, parseInt(limit, 10)));
        const offset = (pageNum - 1) * limitNum;

        const conds = ['entity_slug = $1'];
        const params = [req.params.entity];
        if (activeOnly === 'true' || activeOnly === '1') conds.push('is_active = true');
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(`(code ILIKE $${i} OR name ILIKE $${i})`);
        }
        const where = 'WHERE ' + conds.join(' AND ');

        const countR = await pool.query(
            `SELECT COUNT(*)::int AS n FROM web2_records ${where}`,
            params
        );
        const total = countR.rows[0].n;

        const listParams = [...params, limitNum, offset];
        const listR = await pool.query(
            `SELECT * FROM web2_records ${where}
             ORDER BY is_active DESC, updated_at DESC
             LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
            listParams
        );
        res.json({
            success: true,
            entity: req.params.entity,
            records: listR.rows.map(mapRow),
            total,
            page: pageNum,
            limit: limitNum,
            hasMore: offset + listR.rows.length < total,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /api/web2/:entity/get/:code
// -----------------------------------------------------
router.get('/:entity/get/:code', async (req, res) => {
    const pool = req.app.locals.web2Db;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ error: 'invalid entity slug' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `SELECT * FROM web2_records WHERE entity_slug = $1 AND code = $2 LIMIT 1`,
            [req.params.entity, req.params.code]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, record: mapRow(r.rows[0]) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/web2/:entity/create
// Body: { code?, name, data?, createdBy? }
// -----------------------------------------------------
router.post('/:entity/create', async (req, res) => {
    const pool = req.app.locals.web2Db;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ error: 'invalid entity slug' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        if (!b.name) return res.status(400).json({ error: 'name required' });
        const now = Date.now();
        try {
            const r = await pool.query(
                `INSERT INTO web2_records (entity_slug, code, name, data, is_active, created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
                [
                    req.params.entity,
                    b.code ? String(b.code).trim() : null,
                    String(b.name).trim(),
                    JSON.stringify(b.data || {}),
                    b.isActive !== false,
                    b.createdBy || null,
                    now,
                ]
            );
            res.json({ success: true, record: mapRow(r.rows[0]) });
        } catch (err) {
            if (err.code === '23505') {
                return res
                    .status(409)
                    .json({ error: `Mã "${b.code}" đã tồn tại trong "${req.params.entity}"` });
            }
            throw err;
        }
    } catch (e) {
        console.error('[WEB2-GENERIC] create error:', e);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// PATCH /api/web2/:entity/update/:code
// -----------------------------------------------------
router.patch('/:entity/update/:code', async (req, res) => {
    const pool = req.app.locals.web2Db;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ error: 'invalid entity slug' });
    try {
        await ensureTables(pool);
        const allowed = { name: 'name', data: 'data', isActive: 'is_active' };
        const sets = [];
        const params = [];
        for (const [k, col] of Object.entries(allowed)) {
            if (req.body[k] === undefined) continue;
            params.push(k === 'data' ? JSON.stringify(req.body[k]) : req.body[k]);
            sets.push(`${col} = $${params.length}`);
        }
        if (!sets.length) return res.status(400).json({ error: 'No update fields' });
        params.push(Date.now());
        sets.push(`updated_at = $${params.length}`);
        params.push(req.params.entity);
        params.push(req.params.code);

        const r = await pool.query(
            `UPDATE web2_records SET ${sets.join(', ')}
             WHERE entity_slug = $${params.length - 1} AND code = $${params.length}
             RETURNING *`,
            params
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, record: mapRow(r.rows[0]) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/web2/:entity/delete-all
// Bulk delete TẤT CẢ records của 1 entity. Cần body { confirm: true } để tránh accident.
// Trả về số rows đã xóa. Không tự VACUUM — caller có thể gọi /_vacuum riêng.
// -----------------------------------------------------
router.post('/:entity/delete-all', async (req, res) => {
    const pool = req.app.locals.web2Db;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ error: 'invalid entity slug' });
    if (!req.body || req.body.confirm !== true) {
        return res
            .status(400)
            .json({ error: 'confirm flag required: POST body must be {"confirm": true}' });
    }
    try {
        await ensureTables(pool);
        const r = await pool.query(`DELETE FROM web2_records WHERE entity_slug = $1 RETURNING id`, [
            req.params.entity,
        ]);
        res.json({ success: true, entity: req.params.entity, deleted: r.rowCount });
    } catch (e) {
        console.error('[WEB2-GENERIC] delete-all error:', e);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/web2/_vacuum
// Reclaim disk sau khi delete hàng loạt. VACUUM FULL chậm + lock table — chỉ chạy adhoc.
// Thường VACUUM (không FULL) là đủ.
// -----------------------------------------------------
router.post('/_vacuum', async (req, res) => {
    const pool = req.app.locals.web2Db;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!req.body || req.body.confirm !== true) {
        return res
            .status(400)
            .json({ error: 'confirm flag required: POST body must be {"confirm": true}' });
    }
    const full = req.body.full === true;
    try {
        const before = await pool.query(`
            SELECT pg_total_relation_size('web2_records') AS bytes
        `);
        await pool.query(full ? `VACUUM FULL ANALYZE web2_records` : `VACUUM ANALYZE web2_records`);
        const after = await pool.query(`
            SELECT pg_total_relation_size('web2_records') AS bytes
        `);
        const beforeBytes = Number(before.rows[0].bytes);
        const afterBytes = Number(after.rows[0].bytes);
        res.json({
            success: true,
            mode: full ? 'VACUUM FULL ANALYZE' : 'VACUUM ANALYZE',
            before_bytes: beforeBytes,
            after_bytes: afterBytes,
            freed_bytes: beforeBytes - afterBytes,
            freed_pretty: prettyBytes(beforeBytes - afterBytes),
        });
    } catch (e) {
        console.error('[WEB2-GENERIC] vacuum error:', e);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// DELETE /api/web2/:entity/delete/:code
// -----------------------------------------------------
router.delete('/:entity/delete/:code', async (req, res) => {
    const pool = req.app.locals.web2Db;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ error: 'invalid entity slug' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `DELETE FROM web2_records WHERE entity_slug = $1 AND code = $2 RETURNING code`,
            [req.params.entity, req.params.code]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/web2/:entity/bulk-create
// Body: { records: [{ code, name, data?, isActive?, createdBy? }, ...] }
// Inserts all rows in a single statement; ON CONFLICT (entity_slug, code) DO NOTHING.
// Returns: { success, total, inserted, skipped }
// Designed for seeders importing thousands of rows. Cap: 5000 records / call.
// -----------------------------------------------------
router.post('/:entity/bulk-create', async (req, res) => {
    const pool = req.app.locals.web2Db;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ error: 'invalid entity slug' });
    const records = Array.isArray(req.body?.records) ? req.body.records : null;
    if (!records || records.length === 0) {
        return res.status(400).json({ error: 'records array required' });
    }
    if (records.length > 5000) {
        return res
            .status(413)
            .json({ error: `Too many records (${records.length}); limit 5000 per call` });
    }
    try {
        await ensureTables(pool);
        const now = Date.now();
        const slug = req.params.entity;

        const valuesSql = [];
        const params = [];
        let pi = 1;
        for (const rec of records) {
            if (!rec || !rec.name) continue;
            valuesSql.push(
                `($${pi++}, $${pi++}, $${pi++}, $${pi++}::jsonb, $${pi++}, $${pi++}, $${pi++}, $${pi++})`
            );
            params.push(
                slug,
                rec.code ? String(rec.code).trim() : null,
                String(rec.name).trim(),
                JSON.stringify(rec.data || {}),
                rec.isActive !== false,
                rec.createdBy || null,
                now,
                now
            );
        }
        if (valuesSql.length === 0) {
            return res.status(400).json({ error: 'no valid records (each needs name)' });
        }

        const sql = `
            INSERT INTO web2_records
                (entity_slug, code, name, data, is_active, created_by, created_at, updated_at)
            VALUES ${valuesSql.join(', ')}
            ON CONFLICT (entity_slug, code) WHERE code IS NOT NULL DO NOTHING
            RETURNING id
        `;
        const r = await pool.query(sql, params);
        res.json({
            success: true,
            total: records.length,
            inserted: r.rows.length,
            skipped: records.length - r.rows.length,
        });
    } catch (e) {
        console.error('[WEB2-GENERIC] bulk-create error:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
