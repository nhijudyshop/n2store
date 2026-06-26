// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 PRODUCT TYPES — kho quản lý LOẠI sản phẩm (Áo / Quần / Đầm / …)
// =====================================================
//
// Bảng `web2_product_types` chứa danh sách loại SP. Khi nhập SP (Kho SP, Sổ
// Order) user CHỌN loại từ kho này; chọn nhiều loại cùng lúc = sản phẩm BỘ
// (vd Áo + Quần) → mỗi loại = 1 món → 1 ô biến thể. KHÔNG có nhãn "Set" riêng.
//
// Trường:
//   name        — string (unique) — tên loại hiển thị (Áo, Quần, Đầm…)
//   sort_order  — int — thứ tự hiển thị (asc, mặc định 0)
//   is_active   — bool — true = đang dùng, false = ẩn

const express = require('express');
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');
const { recordAuditEvent } = require('../services/web2-audit-sink');
function _audit(req, action, id, changes) {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    recordAuditEvent(pool, {
        entity: 'product-type',
        entityId: id != null ? String(id) : null,
        action,
        userId: req.web2User?.id ?? (req.body?.userId || null),
        userName: req.web2User?.display_name || req.body?.userName || null,
        sourcePage: 'product-types',
        changes: changes || {},
    });
}
const router = express.Router();

// SSE notifier — broadcast topic 'web2:product-types' sau mỗi DB write.
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, id) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:product-types', { action, id: id || null, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-PRODUCT-TYPES] _notify failed:', e.message);
    }
}

// Key theo pool (WeakSet) — cold-start fallback chatDb không làm web2Db skip.
const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (_ensuredPools.has(pool)) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_product_types (
                id          BIGSERIAL PRIMARY KEY,
                name        VARCHAR(80) UNIQUE NOT NULL,
                sort_order  INTEGER NOT NULL DEFAULT 0,
                is_active   BOOLEAN NOT NULL DEFAULT true,
                created_by  VARCHAR(100),
                created_at  BIGINT NOT NULL,
                updated_at  BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_web2_product_types_name   ON web2_product_types(name);
            CREATE INDEX IF NOT EXISTS idx_web2_product_types_active ON web2_product_types(is_active);
        `);
        _ensuredPools.add(pool);
        console.log('[WEB2-PRODUCT-TYPES] Tables created/verified');
    } catch (error) {
        console.error('[WEB2-PRODUCT-TYPES] Table creation error:', error.message);
    }
}

function mapRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        name: row.name,
        sortOrder: Number(row.sort_order || 0),
        isActive: !!row.is_active,
        createdBy: row.created_by,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

router.get('/health', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ ok: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT COUNT(*)::int AS n FROM web2_product_types');
        res.json({ ok: true, count: r.rows[0].n });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /list?search&activeOnly&page&limit
router.get('/list', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const { search, activeOnly, page = 1, limit = 500 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(2000, Math.max(1, parseInt(limit, 10)));
        const offset = (pageNum - 1) * limitNum;

        const conds = [];
        const params = [];
        if (activeOnly === 'true' || activeOnly === '1') conds.push('is_active = true');
        if (search) {
            params.push(`%${search}%`);
            conds.push(`name ILIKE $${params.length}`);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

        const countR = await pool.query(
            `SELECT COUNT(*)::int AS n FROM web2_product_types ${where}`,
            params
        );
        const listParams = [...params, limitNum, offset];
        const listR = await pool.query(
            `SELECT * FROM web2_product_types ${where}
             ORDER BY is_active DESC, sort_order ASC, name ASC
             LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
            listParams
        );
        res.json({
            success: true,
            types: listR.rows.map(mapRow),
            total: countR.rows[0].n,
            page: pageNum,
            limit: limitNum,
            hasMore: offset + listR.rows.length < countR.rows[0].n,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id(\\d+)', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(`SELECT * FROM web2_product_types WHERE id = $1 LIMIT 1`, [
            req.params.id,
        ]);
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, type: mapRow(r.rows[0]) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        const name = typeof b.name === 'string' ? b.name.trim() : '';
        if (!name) return res.status(400).json({ error: 'name required' });
        const now = Date.now();
        try {
            const r = await pool.query(
                `INSERT INTO web2_product_types
                 (name, sort_order, is_active, created_by, created_at, updated_at)
                 VALUES ($1, $2, true, $3, $4, $4)
                 RETURNING *`,
                [
                    name,
                    Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0,
                    b.createdBy || null,
                    now,
                ]
            );
            _notify('create', r.rows[0].id);
            _audit(req, 'create', r.rows[0].id, { name: r.rows[0].name });
            res.json({ success: true, type: mapRow(r.rows[0]) });
        } catch (err) {
            if (err.code === '23505')
                return res.status(409).json({ error: `Loại "${name}" đã tồn tại` });
            throw err;
        }
    } catch (e) {
        console.error('[WEB2-PRODUCT-TYPES] POST / error:', e);
        res.status(500).json({ error: e.message });
    }
});

router.patch('/:id(\\d+)', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const allowed = { name: 'name', sortOrder: 'sort_order', isActive: 'is_active' };
        const sets = [];
        const params = [];
        for (const [k, col] of Object.entries(allowed)) {
            if (req.body[k] === undefined) continue;
            let v = req.body[k];
            if (k === 'name') v = typeof v === 'string' ? v.trim() : v;
            params.push(v);
            sets.push(`${col} = $${params.length}`);
        }
        if (!sets.length) return res.status(400).json({ error: 'No update fields' });
        params.push(Date.now());
        sets.push(`updated_at = $${params.length}`);
        params.push(req.params.id);
        try {
            const r = await pool.query(
                `UPDATE web2_product_types SET ${sets.join(', ')}
                 WHERE id = $${params.length}
                 RETURNING *`,
                params
            );
            if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
            _notify('update', r.rows[0].id);
            _audit(req, 'update', r.rows[0].id, { name: r.rows[0].name });
            res.json({ success: true, type: mapRow(r.rows[0]) });
        } catch (err) {
            if (err.code === '23505') return res.status(409).json({ error: 'Tên loại bị trùng' });
            throw err;
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id(\\d+)', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(`DELETE FROM web2_product_types WHERE id = $1 RETURNING id`, [
            req.params.id,
        ]);
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        _notify('delete', req.params.id);
        _audit(req, 'delete', req.params.id, {});
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.initializeNotifiers = initializeNotifiers;
module.exports = router;
