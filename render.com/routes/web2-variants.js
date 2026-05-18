// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// WEB 2.0 VARIANTS — kho quản lý biến thể (size/màu/spec)
// =====================================================
//
// Bảng `web2_variants` chứa danh sách giá trị biến thể (vd "Size M", "Đỏ",
// "2003 B5"). Các trang khác (Kho SP Web 2.0, Sổ Order, …) chỉ được pick
// biến thể từ kho này, không tự nhập free-text — đảm bảo dữ liệu chuẩn
// hóa và có thể group/filter sau.
//
// Trường:
//   value       — string (unique) — giá trị biến thể hiển thị
//   group_name  — string optional — nhóm logic ("Size", "Màu", …)
//   sort_order  — int — thứ tự hiển thị (mặc định 0, asc)
//   is_active   — bool — true = đang dùng, false = ẩn (soft-delete)

const express = require('express');
const router = express.Router();

let _tablesCreated = false;
async function ensureTables(pool) {
    if (_tablesCreated) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_variants (
                id          BIGSERIAL PRIMARY KEY,
                value       VARCHAR(120) UNIQUE NOT NULL,
                group_name  VARCHAR(60),
                sort_order  INTEGER NOT NULL DEFAULT 0,
                is_active   BOOLEAN NOT NULL DEFAULT true,
                created_by  VARCHAR(100),
                created_at  BIGINT NOT NULL,
                updated_at  BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_web2_variants_value  ON web2_variants(value);
            CREATE INDEX IF NOT EXISTS idx_web2_variants_group  ON web2_variants(group_name);
            CREATE INDEX IF NOT EXISTS idx_web2_variants_active ON web2_variants(is_active);
        `);
        _tablesCreated = true;
        console.log('[WEB2-VARIANTS] Tables created/verified');
    } catch (error) {
        console.error('[WEB2-VARIANTS] Table creation error:', error.message);
    }
}

function mapRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        value: row.value,
        groupName: row.group_name || null,
        sortOrder: Number(row.sort_order || 0),
        isActive: !!row.is_active,
        createdBy: row.created_by,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

router.get('/health', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ ok: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT COUNT(*)::int AS n FROM web2_variants');
        res.json({ ok: true, count: r.rows[0].n });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /list?search&group&activeOnly&page&limit
router.get('/list', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const { search, group, activeOnly, page = 1, limit = 500 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(2000, Math.max(1, parseInt(limit, 10)));
        const offset = (pageNum - 1) * limitNum;

        const conds = [];
        const params = [];
        if (activeOnly === 'true' || activeOnly === '1') conds.push('is_active = true');
        if (search) {
            params.push(`%${search}%`);
            conds.push(`value ILIKE $${params.length}`);
        }
        if (group) {
            params.push(group);
            conds.push(`group_name = $${params.length}`);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

        const countR = await pool.query(
            `SELECT COUNT(*)::int AS n FROM web2_variants ${where}`,
            params
        );
        const listParams = [...params, limitNum, offset];
        const listR = await pool.query(
            `SELECT * FROM web2_variants ${where}
             ORDER BY is_active DESC, sort_order ASC, value ASC
             LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
            listParams
        );
        res.json({
            success: true,
            variants: listR.rows.map(mapRow),
            total: countR.rows[0].n,
            page: pageNum,
            limit: limitNum,
            hasMore: offset + listR.rows.length < countR.rows[0].n,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(`SELECT * FROM web2_variants WHERE id = $1 LIMIT 1`, [
            req.params.id,
        ]);
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, variant: mapRow(r.rows[0]) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        const value = typeof b.value === 'string' ? b.value.trim() : '';
        if (!value) return res.status(400).json({ error: 'value required' });
        const now = Date.now();
        try {
            const r = await pool.query(
                `INSERT INTO web2_variants
                 (value, group_name, sort_order, is_active, created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, true, $4, $5, $5)
                 RETURNING *`,
                [
                    value,
                    b.groupName ? String(b.groupName).trim() : null,
                    Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0,
                    b.createdBy || null,
                    now,
                ]
            );
            res.json({ success: true, variant: mapRow(r.rows[0]) });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ error: `Biến thể "${value}" đã tồn tại` });
            }
            throw err;
        }
    } catch (e) {
        console.error('[WEB2-VARIANTS] POST / error:', e);
        res.status(500).json({ error: e.message });
    }
});

router.patch('/:id', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const allowed = {
            value: 'value',
            groupName: 'group_name',
            sortOrder: 'sort_order',
            isActive: 'is_active',
        };
        const sets = [];
        const params = [];
        for (const [k, col] of Object.entries(allowed)) {
            if (req.body[k] === undefined) continue;
            let v = req.body[k];
            if (k === 'value' || k === 'groupName') v = typeof v === 'string' ? v.trim() : v;
            params.push(v);
            sets.push(`${col} = $${params.length}`);
        }
        if (!sets.length) return res.status(400).json({ error: 'No update fields' });
        params.push(Date.now());
        sets.push(`updated_at = $${params.length}`);
        params.push(req.params.id);
        try {
            const r = await pool.query(
                `UPDATE web2_variants SET ${sets.join(', ')}
                 WHERE id = $${params.length}
                 RETURNING *`,
                params
            );
            if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
            res.json({ success: true, variant: mapRow(r.rows[0]) });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ error: 'Giá trị biến thể bị trùng' });
            }
            throw err;
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(`DELETE FROM web2_variants WHERE id = $1 RETURNING id`, [
            req.params.id,
        ]);
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
