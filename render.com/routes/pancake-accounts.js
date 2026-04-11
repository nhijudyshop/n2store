// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// Pancake Accounts API
// Store & retrieve Pancake JWT accounts in PostgreSQL
// Replaces Firestore pancake_tokens/accounts
// =====================================================

const express = require('express');
const router = express.Router();

let dbPool = null;

router.init = async (pool) => {
    dbPool = pool;
    console.log('[PANCAKE-ACCOUNTS] Route initialized');
};

// =====================================================
// GET /api/pancake-accounts
// List all accounts (optionally filter by is_active)
// =====================================================
router.get('/', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        const { active } = req.query;
        let query = 'SELECT * FROM pancake_accounts ORDER BY last_used_at DESC';
        const params = [];
        if (active !== undefined) {
            query = 'SELECT * FROM pancake_accounts WHERE is_active = $1 ORDER BY last_used_at DESC';
            params.push(active === 'true');
        }
        const result = await dbPool.query(query, params);
        res.json({ success: true, accounts: result.rows });
    } catch (e) {
        console.error('[PANCAKE-ACCOUNTS] GET error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// GET /api/pancake-accounts/:accountId
// Get single account
// =====================================================
router.get('/:accountId', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        const result = await dbPool.query('SELECT * FROM pancake_accounts WHERE account_id = $1', [req.params.accountId]);
        if (result.rows.length === 0) return res.json({ success: true, account: null });
        res.json({ success: true, account: result.rows[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// POST /api/pancake-accounts/sync
// Batch upsert accounts (from Firestore sync or client)
// Body: { accounts: { accountId: { token, exp, uid, name, savedAt } } }
// =====================================================
router.post('/sync', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    const { accounts } = req.body;
    if (!accounts || typeof accounts !== 'object') {
        return res.status(400).json({ error: 'accounts object required' });
    }

    try {
        let upserted = 0;
        for (const [accountId, acc] of Object.entries(accounts)) {
            if (!acc.token) continue;

            // Decode JWT to extract fb_id, fb_name
            let fbId = null, fbName = null;
            try {
                const parts = acc.token.split('.');
                if (parts.length === 3) {
                    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                    const pad = base64.length % 4;
                    if (pad) base64 += '='.repeat(4 - pad);
                    const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
                    fbId = payload.fb_id || null;
                    fbName = payload.fb_name || payload.name || null;
                }
            } catch (_) {}

            await dbPool.query(`
                INSERT INTO pancake_accounts (account_id, uid, name, token, token_exp, fb_id, fb_name, saved_at, last_used_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                ON CONFLICT (account_id) DO UPDATE SET
                    uid = COALESCE(EXCLUDED.uid, pancake_accounts.uid),
                    name = COALESCE(EXCLUDED.name, pancake_accounts.name),
                    token = EXCLUDED.token,
                    token_exp = EXCLUDED.token_exp,
                    fb_id = COALESCE(EXCLUDED.fb_id, pancake_accounts.fb_id),
                    fb_name = COALESCE(EXCLUDED.fb_name, pancake_accounts.fb_name),
                    saved_at = EXCLUDED.saved_at,
                    last_used_at = NOW()
            `, [
                accountId,
                acc.uid || null,
                acc.name || fbName || null,
                acc.token,
                acc.exp || null,
                fbId,
                fbName,
                acc.savedAt || null,
            ]);
            upserted++;
        }

        console.log(`[PANCAKE-ACCOUNTS] Synced ${upserted} accounts`);
        res.json({ success: true, upserted });
    } catch (e) {
        console.error('[PANCAKE-ACCOUNTS] SYNC error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// PUT /api/pancake-accounts/:accountId
// Update single account (token refresh, pages update, etc.)
// =====================================================
router.put('/:accountId', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    const { accountId } = req.params;
    const { token, exp, name, pages, is_active } = req.body;

    try {
        const sets = ['last_used_at = NOW()'];
        const params = [];
        let idx = 1;

        if (token !== undefined) { sets.push(`token = $${idx++}`); params.push(token); }
        if (exp !== undefined) { sets.push(`token_exp = $${idx++}`); params.push(exp); }
        if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
        if (pages !== undefined) { sets.push(`pages = $${idx++}`); params.push(JSON.stringify(pages)); }
        if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(is_active); }

        params.push(accountId);
        const result = await dbPool.query(
            `UPDATE pancake_accounts SET ${sets.join(', ')} WHERE account_id = $${idx} RETURNING *`,
            params
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
        res.json({ success: true, account: result.rows[0] });
    } catch (e) {
        console.error('[PANCAKE-ACCOUNTS] PUT error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// DELETE /api/pancake-accounts/:accountId
// Remove account
// =====================================================
router.delete('/:accountId', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        await dbPool.query('DELETE FROM pancake_accounts WHERE account_id = $1', [req.params.accountId]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
