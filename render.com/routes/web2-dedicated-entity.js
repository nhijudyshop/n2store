// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// WEB2 DEDICATED ENTITY — factory router cho config Web 2.0 cần BẢNG RIÊNG
// (tách khỏi kho generic web2_records). Dùng cho: deliveryzone, printer.
// =====================================================================
// - Schema GIỮ cột `data JSONB` + mapRow GIỐNG HỆT web2-generic → consumer
//   (delivery-method-picker, web2-printer) KHÔNG đổi path/shape.
// - Mount TRƯỚC catch-all `/api/web2` để chiếm quyền slug tương ứng.
// - Auto-migrate 1 lần khi boot: copy rows từ web2_records (entity_slug) sang
//   bảng riêng nếu bảng riêng còn trống (idempotent, ON CONFLICT DO NOTHING).
// - SSE topic `web2:<slug>` (giữ nguyên topic cũ để client subscribe không đổi).
// =====================================================================

const express = require('express');
const { requireWeb2Admin } = require('../middleware/web2-auth');

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(slug, action, code) {
    if (!_notifyClients || !slug) return;
    try {
        _notifyClients(`web2:${slug}`, { action, code: code || null, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-DEDICATED] _notify failed:', e.message);
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

// Tên bảng đến từ map hardcoded (an toàn SQL — không phải user input).
function makeDedicatedEntityRouter(tableName, entitySlug) {
    const router = express.Router();
    let _ready = false;

    async function ensure(pool) {
        if (_ready) return;
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ${tableName} (
                id          BIGSERIAL PRIMARY KEY,
                entity_slug VARCHAR(60) NOT NULL DEFAULT '${entitySlug}',
                code        VARCHAR(100) UNIQUE,
                name        VARCHAR(255),
                data        JSONB NOT NULL DEFAULT '{}'::jsonb,
                is_active   BOOLEAN NOT NULL DEFAULT true,
                created_by  VARCHAR(100),
                created_at  BIGINT NOT NULL,
                updated_at  BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_${tableName}_active ON ${tableName}(is_active);
        `);
        // Auto-migrate từ web2_records (1 lần, nếu bảng riêng trống).
        try {
            const cnt = await pool.query(`SELECT COUNT(*)::int n FROM ${tableName}`);
            if (cnt.rows[0].n === 0) {
                const mig = await pool.query(
                    `INSERT INTO ${tableName}
                        (entity_slug, code, name, data, is_active, created_by, created_at, updated_at)
                     SELECT entity_slug, code, name, data, is_active, created_by, created_at, updated_at
                     FROM web2_records WHERE entity_slug = $1
                     ON CONFLICT (code) DO NOTHING`,
                    [entitySlug]
                );
                if (mig.rowCount) {
                    console.log(
                        `[WEB2-DEDICATED] Migrated ${mig.rowCount} rows web2_records(${entitySlug}) → ${tableName}`
                    );
                }
            }
        } catch (e) {
            console.warn(`[WEB2-DEDICATED] migrate ${tableName} skip:`, e.message);
        }
        _ready = true;
    }

    function getPool(req) {
        return req.app.locals.web2Db || req.app.locals.chatDb;
    }

    // GET /list
    router.get('/list', async (req, res) => {
        const pool = getPool(req);
        if (!pool) return res.status(500).json({ error: 'DB unavailable' });
        try {
            await ensure(pool);
            const { search, activeOnly, page = 1, limit = 200 } = req.query;
            const pageNum = Math.max(1, parseInt(page, 10));
            const limitNum = Math.min(2000, Math.max(1, parseInt(limit, 10)));
            const offset = (pageNum - 1) * limitNum;
            const conds = [];
            const params = [];
            if (activeOnly === 'true' || activeOnly === '1') conds.push('is_active = true');
            if (search) {
                params.push(`%${search}%`);
                conds.push(`(code ILIKE $${params.length} OR name ILIKE $${params.length})`);
            }
            const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
            const countR = await pool.query(
                `SELECT COUNT(*)::int n FROM ${tableName} ${where}`,
                params
            );
            const total = countR.rows[0].n;
            const lp = [...params, limitNum, offset];
            const r = await pool.query(
                `SELECT * FROM ${tableName} ${where} ORDER BY is_active DESC, updated_at DESC
                 LIMIT $${lp.length - 1} OFFSET $${lp.length}`,
                lp
            );
            res.json({
                success: true,
                entity: entitySlug,
                records: r.rows.map(mapRow),
                total,
                page: pageNum,
                limit: limitNum,
                hasMore: offset + r.rows.length < total,
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // GET /get/:code
    router.get('/get/:code', async (req, res) => {
        const pool = getPool(req);
        if (!pool) return res.status(500).json({ error: 'DB unavailable' });
        try {
            await ensure(pool);
            const r = await pool.query(`SELECT * FROM ${tableName} WHERE code = $1 LIMIT 1`, [
                req.params.code,
            ]);
            if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
            res.json({ success: true, record: mapRow(r.rows[0]) });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // POST /create  { code?, name, data?, userId?, userName?, sourcePage? }
    router.post('/create', async (req, res) => {
        const pool = getPool(req);
        if (!pool) return res.status(500).json({ error: 'DB unavailable' });
        try {
            await ensure(pool);
            const b = req.body || {};
            if (!b.name) return res.status(400).json({ error: 'name required' });
            const now = Date.now();
            const data = b.data && typeof b.data === 'object' ? { ...b.data } : {};
            if (!Array.isArray(data.history)) {
                data.history = [
                    {
                        ts: now,
                        action: 'create',
                        userId: b.userId || b.createdBy || null,
                        userName: b.userName || data.createdByName || '(ẩn danh)',
                        sourcePage: b.sourcePage || null,
                        note: null,
                    },
                ];
            }
            const code = b.code || `${entitySlug}-${now.toString(36)}`;
            const r = await pool.query(
                `INSERT INTO ${tableName} (entity_slug, code, name, data, is_active, created_by, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
                [
                    entitySlug,
                    code,
                    b.name,
                    JSON.stringify(data),
                    b.isActive !== false,
                    b.userId || b.createdBy || null,
                    now,
                ]
            );
            _notify(entitySlug, 'create', r.rows[0].code);
            res.json({ success: true, record: mapRow(r.rows[0]) });
        } catch (e) {
            if (e.code === '23505') return res.status(409).json({ error: 'code đã tồn tại' });
            res.status(500).json({ error: e.message });
        }
    });

    // PATCH /update/:code  { name?, data?, isActive?, userId?, userName? }
    router.patch('/update/:code', async (req, res) => {
        const pool = getPool(req);
        if (!pool) return res.status(500).json({ error: 'DB unavailable' });
        try {
            await ensure(pool);
            const b = req.body || {};
            const cur = await pool.query(`SELECT * FROM ${tableName} WHERE code = $1 LIMIT 1`, [
                req.params.code,
            ]);
            if (!cur.rows.length) return res.status(404).json({ error: 'Not found' });
            const now = Date.now();
            const curData = cur.rows[0].data || {};
            let newData = curData;
            if (b.data && typeof b.data === 'object') {
                newData = { ...curData, ...b.data };
                // giữ history cũ + append entry update
                const hist = Array.isArray(curData.history) ? curData.history.slice() : [];
                hist.push({
                    ts: now,
                    action: 'update',
                    userId: b.userId || null,
                    userName: b.userName || '(ẩn danh)',
                    sourcePage: b.sourcePage || null,
                    note: null,
                });
                newData.history = hist;
            }
            const r = await pool.query(
                `UPDATE ${tableName}
                    SET name = COALESCE($2, name),
                        data = $3,
                        is_active = COALESCE($4, is_active),
                        updated_at = $5
                  WHERE code = $1 RETURNING *`,
                [
                    req.params.code,
                    b.name != null ? b.name : null,
                    JSON.stringify(newData),
                    typeof b.isActive === 'boolean' ? b.isActive : null,
                    now,
                ]
            );
            _notify(entitySlug, 'update', r.rows[0].code);
            res.json({ success: true, record: mapRow(r.rows[0]) });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // DELETE /delete/:code
    router.delete('/delete/:code', async (req, res) => {
        const pool = getPool(req);
        if (!pool) return res.status(500).json({ error: 'DB unavailable' });
        try {
            await ensure(pool);
            await pool.query(`DELETE FROM ${tableName} WHERE code = $1`, [req.params.code]);
            _notify(entitySlug, 'delete', req.params.code);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // POST /delete-all  { confirm:true }
    // S1: admin/maintenance-only → gate requireWeb2Admin (token web2_user_sessions,
    // role='admin') — đồng bộ với /:entity/delete-all của web2-generic.js.
    router.post('/delete-all', requireWeb2Admin, async (req, res) => {
        const pool = getPool(req);
        if (!pool) return res.status(500).json({ error: 'DB unavailable' });
        if (!req.body || req.body.confirm !== true) {
            return res.status(400).json({ error: 'confirm flag required: {"confirm": true}' });
        }
        try {
            await ensure(pool);
            const r = await pool.query(`DELETE FROM ${tableName} RETURNING id`);
            if (r.rowCount) _notify(entitySlug, 'delete-all', null);
            res.json({ success: true, entity: entitySlug, deleted: r.rowCount });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // GET /health
    router.get('/health', async (req, res) => {
        const pool = getPool(req);
        if (!pool) return res.status(500).json({ error: 'DB unavailable' });
        try {
            await ensure(pool);
            const r = await pool.query(`SELECT COUNT(*)::int n FROM ${tableName}`);
            res.json({ ok: true, entity: entitySlug, table: tableName, count: r.rows[0].n });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    return router;
}

module.exports = { makeDedicatedEntityRouter, initializeNotifiers };
