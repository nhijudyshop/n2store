// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// Pancake Account Pages Cache
// Lý do: pancake-settings.js mỗi lần mở modal phải gọi /pages?access_token=X
// cho từng account → chậm + intermittent fail "Không thể kiểm tra".
// Cache shared trên Render → mọi máy đọc 1 nguồn → instant.
// Cache KHÔNG TTL — chỉ refresh khi: client verify thành công (PUT) hoặc
// last_status !== 'ok' (client tự trigger live re-verify).
// =====================================================

const express = require('express');
const router = express.Router();

let dbPool = null;

async function ensureTable() {
    if (!dbPool) return;
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS pancake_account_pages_cache (
            account_id TEXT PRIMARY KEY,
            account_uid TEXT,
            account_name TEXT,
            pages JSONB NOT NULL DEFAULT '[]'::jsonb,
            pages_count INTEGER DEFAULT 0,
            last_status TEXT NOT NULL DEFAULT 'ok',
            error_detail TEXT,
            last_verified_at TIMESTAMP DEFAULT NOW(),
            last_verified_by TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
}

router.init = async (pool) => {
    dbPool = pool;
    try {
        await ensureTable();
        console.log('[PANCAKE-PAGES] Table ready');
    } catch (e) {
        console.error('[PANCAKE-PAGES] ensureTable error:', e.message);
    }
};

// =====================================================
// GET /api/pancake-account-pages
// Returns ALL cached account → pages mappings (single source of truth).
// Frontend reads this once on modal open, fills in all rows.
// =====================================================
router.get('/', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        const r = await dbPool.query(
            'SELECT * FROM pancake_account_pages_cache ORDER BY last_verified_at DESC'
        );
        const accounts = {};
        for (const row of r.rows) {
            accounts[row.account_id] = {
                accountId: row.account_id,
                accountUid: row.account_uid,
                accountName: row.account_name,
                pages: row.pages || [],
                pagesCount: row.pages_count,
                lastStatus: row.last_status,
                errorDetail: row.error_detail,
                lastVerifiedAt: row.last_verified_at,
                lastVerifiedBy: row.last_verified_by,
            };
        }
        res.json({ accounts });
    } catch (e) {
        console.error('[PANCAKE-PAGES] GET error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// GET /api/pancake-account-pages/:accountId
// =====================================================
router.get('/:accountId', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        const r = await dbPool.query(
            'SELECT * FROM pancake_account_pages_cache WHERE account_id = $1',
            [req.params.accountId]
        );
        if (r.rows.length === 0) return res.json({ found: false });
        const row = r.rows[0];
        res.json({
            found: true,
            accountId: row.account_id,
            accountUid: row.account_uid,
            accountName: row.account_name,
            pages: row.pages || [],
            pagesCount: row.pages_count,
            lastStatus: row.last_status,
            errorDetail: row.error_detail,
            lastVerifiedAt: row.last_verified_at,
            lastVerifiedBy: row.last_verified_by,
        });
    } catch (e) {
        console.error('[PANCAKE-PAGES] GET one error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// PUT /api/pancake-account-pages/:accountId
// Body: { accountUid?, accountName?, pages: [...], lastStatus, errorDetail?, verifiedBy? }
// IMPORTANT: chỉ overwrite cache khi lastStatus === 'ok'. Nếu lastStatus !== 'ok'
// và row đã có dữ liệu 'ok' → giữ pages cũ, chỉ update last_status + error_detail.
// → tránh fail tạm thời ghi đè cache tốt.
// =====================================================
router.put('/:accountId', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    const { accountId } = req.params;
    const { accountUid, accountName, pages, lastStatus, errorDetail, verifiedBy } = req.body || {};
    if (!accountId || !lastStatus) {
        return res.status(400).json({ error: 'accountId + lastStatus required' });
    }

    try {
        if (lastStatus === 'ok') {
            // Trust this verify — overwrite pages
            const pagesArr = Array.isArray(pages) ? pages : [];
            await dbPool.query(`
                INSERT INTO pancake_account_pages_cache
                    (account_id, account_uid, account_name, pages, pages_count,
                     last_status, error_detail, last_verified_at, last_verified_by)
                VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW(), $8)
                ON CONFLICT (account_id) DO UPDATE SET
                    account_uid = COALESCE(EXCLUDED.account_uid, pancake_account_pages_cache.account_uid),
                    account_name = COALESCE(EXCLUDED.account_name, pancake_account_pages_cache.account_name),
                    pages = EXCLUDED.pages,
                    pages_count = EXCLUDED.pages_count,
                    last_status = 'ok',
                    error_detail = NULL,
                    last_verified_at = NOW(),
                    last_verified_by = EXCLUDED.last_verified_by
            `, [
                accountId, accountUid || null, accountName || null,
                JSON.stringify(pagesArr), pagesArr.length,
                'ok', null, verifiedBy || null,
            ]);
        } else {
            // Failed verify — only update status, preserve existing pages
            await dbPool.query(`
                INSERT INTO pancake_account_pages_cache
                    (account_id, account_uid, account_name, pages, pages_count,
                     last_status, error_detail, last_verified_at, last_verified_by)
                VALUES ($1, $2, $3, '[]'::jsonb, 0, $4, $5, NOW(), $6)
                ON CONFLICT (account_id) DO UPDATE SET
                    account_uid = COALESCE(EXCLUDED.account_uid, pancake_account_pages_cache.account_uid),
                    account_name = COALESCE(EXCLUDED.account_name, pancake_account_pages_cache.account_name),
                    last_status = EXCLUDED.last_status,
                    error_detail = EXCLUDED.error_detail,
                    last_verified_by = EXCLUDED.last_verified_by
                    -- pages, pages_count, last_verified_at NOT updated (preserve last good)
            `, [
                accountId, accountUid || null, accountName || null,
                lastStatus, errorDetail || null, verifiedBy || null,
            ]);
        }
        res.json({ success: true });
    } catch (e) {
        console.error('[PANCAKE-PAGES] PUT error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// DELETE /api/pancake-account-pages/:accountId
// Khi user xóa account → xóa cache row tương ứng.
// =====================================================
router.delete('/:accountId', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        await dbPool.query(
            'DELETE FROM pancake_account_pages_cache WHERE account_id = $1',
            [req.params.accountId]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
