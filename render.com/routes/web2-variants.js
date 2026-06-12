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
// 1D-auth (2026-06-12): route maintenance bulk-mutation gate admin (chuẩn S1).
const { requireWeb2Admin } = require('../middleware/web2-auth');
const router = express.Router();

// -----------------------------------------------------
// SSE notifier — broadcast topic 'web2:variants' sau mỗi DB write.
// Xem docs/web2/SSE-REALTIME.md.
// -----------------------------------------------------
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, id) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:variants', { action, id: id || null, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-VARIANTS] _notify failed:', e.message);
    }
}

// 1D fix: key theo pool (WeakSet) thay vì flag boolean chung — cold-start
// fallback chatDb không được làm web2Db skip ensureTables (2 pool riêng biệt).
// Pattern web2-products `_ensuredPools`.
const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (_ensuredPools.has(pool)) return;
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

            -- Migration: shortcode locked per variant. Set lúc create, immutable
            -- để mã SP của các SP cũ không bị thay đổi khi thêm biến thể mới.
            ALTER TABLE web2_variants
                ADD COLUMN IF NOT EXISTS short_code VARCHAR(20);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_web2_variants_short_code
                ON web2_variants(short_code)
                WHERE short_code IS NOT NULL;
        `);
        _ensuredPools.add(pool);
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
        shortCode: row.short_code || null,
        sortOrder: Number(row.sort_order || 0),
        isActive: !!row.is_active,
        createdBy: row.created_by,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

// ─────────────────────────────────────────────────────────
// Shortcode helpers (must mirror logic of Web2ProductCode client-side
// để server có thể gợi ý + validate khi user thêm biến thể mới)
// ─────────────────────────────────────────────────────────
function _stripDiacritics(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}
function _toAsciiUpper(s) {
    return _stripDiacritics(s)
        .toUpperCase()
        .replace(/[^A-Z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function _stripGroupPrefix(value, groupName) {
    // "Màu Xanh Dương" → "Xanh Dương"; "Size XL" → "XL"; "Size 38" → "38"
    if (!value) return '';
    let v = String(value);
    if (groupName) {
        const re = new RegExp(
            `^\\s*${groupName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s+`,
            'i'
        );
        v = v.replace(re, '');
    }
    return v.trim();
}

function _baseShortCode(asciiClean) {
    const words = asciiClean.split(' ').filter(Boolean);
    if (words.length === 0) return '';
    if (words.length === 1) return words[0];
    return words.map((w) => w[0]).join('');
}

/**
 * Server-side suggest: tìm shortcode tốt nhất cho value mới.
 * Bắt đầu từ naive (chữ đầu mỗi từ). Nếu trùng với existing locked → extend depth.
 * Trả về { shortCode, collidesWith }.
 */
async function _suggestShortCode(pool, value, groupName) {
    const stripped = _stripGroupPrefix(value, groupName);
    const ascii = _toAsciiUpper(stripped);
    if (!ascii) return { shortCode: '', collidesWith: null };

    // Load existing locked shortcodes
    const r = await pool.query(
        `SELECT value, group_name, short_code FROM web2_variants WHERE short_code IS NOT NULL`
    );
    const usedCodes = new Map(); // shortCode → existing value
    for (const row of r.rows) {
        if (row.short_code) usedCodes.set(row.short_code, row.value);
    }

    const words = ascii.split(' ').filter(Boolean);
    if (words.length === 0) return { shortCode: '', collidesWith: null };

    // Single word → use full
    if (words.length === 1) {
        const base = words[0];
        if (!usedCodes.has(base)) return { shortCode: base, collidesWith: null };
        let n = 2;
        while (usedCodes.has(base + n)) n++;
        return { shortCode: base + n, collidesWith: usedCodes.get(base) };
    }

    // Multi-word: extend depth từ word cuối
    const depths = words.map(() => 1);
    let lastCollidingValue = null;
    for (let iter = 0; iter < 25; iter++) {
        const code = words.map((w, i) => w.slice(0, depths[i])).join('');
        if (!usedCodes.has(code)) {
            return { shortCode: code, collidesWith: lastCollidingValue };
        }
        lastCollidingValue = usedCodes.get(code);
        let extended = false;
        for (let i = depths.length - 1; i >= 0; i--) {
            if (depths[i] < words[i].length) {
                depths[i]++;
                extended = true;
                break;
            }
        }
        if (!extended) {
            // Fully spelled out, fall back to numeric suffix
            let n = 2;
            while (usedCodes.has(code + n)) n++;
            return { shortCode: code + n, collidesWith: lastCollidingValue };
        }
    }
    return { shortCode: words.join(''), collidesWith: lastCollidingValue };
}

router.get('/health', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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

// GET /suggest-short-code?value=Màu Xanh Dương&groupName=Màu
// Trả về shortcode đề xuất + collision info (nếu có).
// Đặt TRƯỚC /:id để route literal khớp trước (Express match-first-wins).
router.get('/suggest-short-code', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const value = String(req.query.value || '').trim();
        const groupName = req.query.groupName ? String(req.query.groupName).trim() : null;
        if (!value) return res.status(400).json({ error: 'value required' });
        const result = await _suggestShortCode(pool, value, groupName);
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /backfill-short-codes — assign short_code cho tất cả variants chưa có.
// Idempotent: chỉ touch row có short_code IS NULL.
router.post('/backfill-short-codes', requireWeb2Admin, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `SELECT id, value, group_name FROM web2_variants
             WHERE short_code IS NULL
             ORDER BY group_name, sort_order, value`
        );
        let updated = 0;
        for (const row of r.rows) {
            const sug = await _suggestShortCode(pool, row.value, row.group_name);
            if (!sug.shortCode) continue;
            try {
                await pool.query(
                    `UPDATE web2_variants SET short_code = $1, updated_at = $2 WHERE id = $3`,
                    [sug.shortCode, Date.now(), row.id]
                );
                updated++;
            } catch (err) {
                if (err.code !== '23505') throw err;
                // Conflict — rare since _suggestShortCode checks. Skip.
            }
        }
        _notify('backfill', null);
        res.json({ success: true, updated, total: r.rows.length });
    } catch (e) {
        console.error('[WEB2-VARIANTS] backfill error:', e);
        res.status(500).json({ error: e.message });
    }
});

// GET /:id — fetch single variant by id. Đặt SAU các literal routes để tránh xung đột.
router.get('/:id(\\d+)', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        const value = typeof b.value === 'string' ? b.value.trim() : '';
        if (!value) return res.status(400).json({ error: 'value required' });
        const groupName = b.groupName ? String(b.groupName).trim() : null;

        // Shortcode REQUIRED. Nếu client không gửi → server tự suggest.
        let shortCode = b.shortCode ? String(b.shortCode).trim().toUpperCase() : null;
        if (!shortCode) {
            const sug = await _suggestShortCode(pool, value, groupName);
            shortCode = sug.shortCode || null;
        }
        if (!shortCode) {
            return res.status(400).json({ error: 'shortCode required (auto-suggest failed)' });
        }
        // Validate format: A-Z, 0-9, độ dài 1-20
        if (!/^[A-Z0-9]{1,20}$/.test(shortCode)) {
            return res.status(400).json({
                error: 'shortCode phải gồm A-Z và 0-9, độ dài 1-20 ký tự',
            });
        }

        const now = Date.now();
        try {
            const r = await pool.query(
                `INSERT INTO web2_variants
                 (value, group_name, short_code, sort_order, is_active, created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, true, $5, $6, $6)
                 RETURNING *`,
                [
                    value,
                    groupName,
                    shortCode,
                    Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0,
                    b.createdBy || null,
                    now,
                ]
            );
            _notify('create', r.rows[0].id);
            res.json({ success: true, variant: mapRow(r.rows[0]) });
        } catch (err) {
            if (err.code === '23505') {
                // Phân biệt unique constraint: value hay short_code
                const msg = err.detail || '';
                if (msg.includes('short_code')) {
                    return res.status(409).json({
                        error: `Viết tắt "${shortCode}" đã được dùng cho biến thể khác`,
                    });
                }
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const allowed = {
            value: 'value',
            groupName: 'group_name',
            sortOrder: 'sort_order',
            isActive: 'is_active',
            // shortCode CHO sửa (admin override), nhưng phải đúng format A-Z0-9
            shortCode: 'short_code',
        };
        if (req.body.shortCode !== undefined) {
            const sc = String(req.body.shortCode).trim().toUpperCase();
            if (sc && !/^[A-Z0-9]{1,20}$/.test(sc)) {
                return res.status(400).json({ error: 'shortCode invalid format' });
            }
            req.body.shortCode = sc || null;
        }
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
            _notify('update', r.rows[0].id);
            res.json({ success: true, variant: mapRow(r.rows[0]) });
        } catch (err) {
            // Unique violation: phân biệt short_code vs value để báo rõ. Check-then-
            // update không atomic → 2 admin set cùng giá trị cùng lúc đụng nhau ở
            // đây → trả 409 (conflict) thay vì 500.
            if (err.code === '23505') {
                const detail = err.detail || '';
                if (detail.includes('short_code')) {
                    const sc = req.body.shortCode ? String(req.body.shortCode).toUpperCase() : '';
                    return res.status(409).json({
                        error: sc
                            ? `Viết tắt "${sc}" đã được dùng cho biến thể khác`
                            : 'Viết tắt (shortCode) đã được dùng cho biến thể khác',
                    });
                }
                return res.status(409).json({ error: 'Giá trị biến thể bị trùng' });
            }
            throw err;
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(`DELETE FROM web2_variants WHERE id = $1 RETURNING id`, [
            req.params.id,
        ]);
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        _notify('delete', req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.initializeNotifiers = initializeNotifiers;
module.exports = router;
