// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — phone extraction blacklist (configurable).
// =====================================================================
// Web2Blacklist — DB-backed blacklist của số không được match (shop bank
// accounts, system IDs, common false-positives).
// Default seed: 75918 (ACB shop account, hardcoded trong sepay-matching cũ).
// Cache 60s để không hit DB mỗi webhook.
// =====================================================================

let _ready = false;
let _cache = null;
let _cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

async function ensureSchema(pool) {
    if (_ready || !pool) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_extraction_blacklist (
                id SERIAL PRIMARY KEY,
                pattern VARCHAR(50) UNIQUE NOT NULL,
                type VARCHAR(20) DEFAULT 'exact',
                reason TEXT,
                added_by VARCHAR(100),
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_w2bl_active
                ON web2_extraction_blacklist(pattern) WHERE active = TRUE;
        `);
        // Seed default: 75918 (ACB shop account)
        await pool.query(
            `INSERT INTO web2_extraction_blacklist (pattern, type, reason, added_by, active)
             VALUES ('75918', 'exact', 'ACB shop account number', 'system_seed', TRUE)
             ON CONFLICT (pattern) DO NOTHING`
        );
        _ready = true;
        console.log('[web2-blacklist] schema ready (seeded 75918)');
    } catch (e) {
        console.error('[web2-blacklist] ensureSchema failed:', e.message);
    }
}

async function _loadCache(db) {
    if (!db) return new Set(['75918']);
    try {
        const r = await db.query(
            `SELECT pattern FROM web2_extraction_blacklist WHERE active = TRUE AND type = 'exact'`
        );
        const set = new Set(r.rows.map((row) => String(row.pattern)));
        if (!set.has('75918')) set.add('75918'); // always include hardcoded fallback
        _cache = set;
        _cacheLoadedAt = Date.now();
        return set;
    } catch (e) {
        console.warn('[web2-blacklist] _loadCache fail:', e.message);
        return new Set(['75918']);
    }
}

async function getBlacklist(db) {
    if (_cache && Date.now() - _cacheLoadedAt < CACHE_TTL_MS) return _cache;
    return await _loadCache(db);
}

async function listAll(db) {
    if (!db) return [];
    const r = await db.query(
        `SELECT id, pattern, type, reason, added_by, active, created_at, updated_at
         FROM web2_extraction_blacklist ORDER BY active DESC, created_at DESC`
    );
    return r.rows;
}

async function add(db, { pattern, type, reason, addedBy }) {
    if (!pattern) throw new Error('pattern required');
    const r = await db.query(
        `INSERT INTO web2_extraction_blacklist (pattern, type, reason, added_by, active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (pattern) DO UPDATE
            SET active = TRUE, reason = EXCLUDED.reason,
                added_by = EXCLUDED.added_by, updated_at = NOW()
         RETURNING *`,
        [String(pattern).trim(), type || 'exact', reason || null, addedBy || 'unknown']
    );
    _cache = null; // invalidate
    return r.rows[0];
}

async function deactivate(db, id, deactivatedBy) {
    const r = await db.query(
        `UPDATE web2_extraction_blacklist
         SET active = FALSE, updated_at = NOW(),
             reason = COALESCE(reason, '') || ' [deactivated by ' || $2 || ']'
         WHERE id = $1 RETURNING *`,
        [id, deactivatedBy || 'unknown']
    );
    _cache = null;
    return r.rows[0] || null;
}

async function remove(db, id) {
    const r = await db.query(`DELETE FROM web2_extraction_blacklist WHERE id = $1 RETURNING id`, [
        id,
    ]);
    _cache = null;
    return r.rowCount > 0;
}

module.exports = {
    ensureSchema,
    getBlacklist,
    listAll,
    add,
    deactivate,
    remove,
};
