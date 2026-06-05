// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
// =====================================================
// Web 2.0 — Pancake auto-refresh token (server-side login)
// =====================================================
// Lưu credentials (mã hoá) + tự đăng nhập lại Pancake để gia hạn JWT khi sắp/đã
// hết hạn. Dùng pure-Node login (web2-pancake-login.js) — KHÔNG cần browser.
//
// Bảng: pancake_accounts (chatDb — SHARED store web1/web2, không tạo bảng web2_
// riêng). Thêm cột: login_identity, login_password_enc, auto_refresh,
// last_refresh_at, last_refresh_status.
//
// Endpoints (mount /api/web2/pancake-refresh):
//   GET    /status                       → list {account_id, hasCreds, auto_refresh, last_refresh_*}
//   PUT    /:accountId/credentials        → { identity, password, auto_refresh } (mã hoá lưu)
//   DELETE /:accountId/credentials        → xoá creds + tắt auto_refresh
//   POST   /:accountId                    → gia hạn NGAY (creds đã lưu, hoặc body {identity,password})
//
// Cron: refreshExpiring(pool, { withinDays }) — quét account auto_refresh sắp hết hạn → login lại.

const express = require('express');
const router = express.Router();

const { loginPancake } = require('../services/web2-pancake-login');
const creds = require('../services/web2-pancake-creds');

let dbPool = null;

async function ensureColumns(pool) {
    await pool.query(`
        ALTER TABLE pancake_accounts
            ADD COLUMN IF NOT EXISTS login_identity TEXT,
            ADD COLUMN IF NOT EXISTS login_password_enc TEXT,
            ADD COLUMN IF NOT EXISTS auto_refresh BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS last_refresh_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS last_refresh_status TEXT
    `);
}

router.init = async (pool) => {
    dbPool = pool;
    try {
        await ensureColumns(pool);
        console.log('[WEB2-PANCAKE-REFRESH] Route initialized (columns ensured)');
    } catch (e) {
        console.error('[WEB2-PANCAKE-REFRESH] ensureColumns failed:', e.message);
    }
    if (!creds.isConfigured()) {
        console.warn(
            '[WEB2-PANCAKE-REFRESH] ⚠ PANCAKE_CREDS_KEY chưa set — lưu/giải mã credentials sẽ fail.'
        );
    }
};

// --- SSE notifier (optional) ---
let _notify = () => {};
router.initializeNotifiers = (notifyFn) => {
    if (typeof notifyFn === 'function') _notify = notifyFn;
};

// =====================================================
// Core: login + upsert token vào pancake_accounts
// =====================================================
async function _refreshAccount(accountId, identity, password) {
    const r = await loginPancake({ identity, password });
    const now = new Date();
    if (!r.ok) {
        await dbPool
            .query(
                `UPDATE pancake_accounts SET last_refresh_at = $1, last_refresh_status = $2 WHERE account_id = $3`,
                [now, 'fail:' + r.reason, accountId]
            )
            .catch(() => {});
        return { ok: false, reason: r.reason };
    }
    const d = r.decoded;
    // account_id thật = uid trong token (đề phòng accountId param khác)
    const realId = d.uid || accountId;
    await dbPool.query(
        `INSERT INTO pancake_accounts (account_id, uid, name, token, token_exp, fb_id, fb_name, saved_at, last_used_at, last_refresh_at, last_refresh_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,'ok')
         ON CONFLICT (account_id) DO UPDATE SET
            token = EXCLUDED.token,
            token_exp = EXCLUDED.token_exp,
            name = COALESCE(EXCLUDED.name, pancake_accounts.name),
            fb_id = COALESCE(EXCLUDED.fb_id, pancake_accounts.fb_id),
            fb_name = COALESCE(EXCLUDED.fb_name, pancake_accounts.fb_name),
            saved_at = EXCLUDED.saved_at,
            last_used_at = NOW(),
            last_refresh_at = EXCLUDED.last_refresh_at,
            last_refresh_status = 'ok'`,
        [
            realId,
            d.uid || null,
            d.fb_name || d.name || null,
            r.token,
            d.exp || null,
            d.fb_id || null,
            d.fb_name || null,
            Date.now(),
            now,
        ]
    );
    try {
        _notify('web2:pancake-accounts', { action: 'refresh', accountId: realId, ts: Date.now() });
    } catch {
        /* */
    }
    return { ok: true, accountId: realId, exp: d.exp, name: d.fb_name || d.name };
}

// =====================================================
// GET /status — không trả password
// =====================================================
router.get('/status', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        const r = await dbPool.query(
            `SELECT account_id, name, fb_name, token_exp, auto_refresh,
                    (login_password_enc IS NOT NULL) AS has_creds,
                    last_refresh_at, last_refresh_status
             FROM pancake_accounts ORDER BY last_used_at DESC`
        );
        res.json({ success: true, accounts: r.rows, credsKeyConfigured: creds.isConfigured() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// PUT /:accountId/credentials — lưu creds mã hoá
// =====================================================
router.put('/:accountId/credentials', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    if (!creds.isConfigured())
        return res.status(503).json({ error: 'PANCAKE_CREDS_KEY chưa cấu hình trên server' });
    const { identity, password, auto_refresh } = req.body || {};
    if (!identity || !password)
        return res.status(400).json({ error: 'identity + password bắt buộc' });
    try {
        const enc = creds.encrypt(password);
        if (!enc) return res.status(500).json({ error: 'encrypt_failed' });
        const r = await dbPool.query(
            `UPDATE pancake_accounts
             SET login_identity = $1, login_password_enc = $2, auto_refresh = $3
             WHERE account_id = $4 RETURNING account_id`,
            [identity, enc, auto_refresh !== false, req.params.accountId]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
        res.json({ success: true, hasCreds: true, auto_refresh: auto_refresh !== false });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// DELETE /:accountId/credentials
// =====================================================
router.delete('/:accountId/credentials', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        await dbPool.query(
            `UPDATE pancake_accounts
             SET login_identity = NULL, login_password_enc = NULL, auto_refresh = false
             WHERE account_id = $1`,
            [req.params.accountId]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// POST /:accountId — gia hạn NGAY
// Dùng creds body (nếu gửi) hoặc creds đã lưu. Nếu body có lưu kèm → mã hoá lưu.
// =====================================================
router.post('/:accountId', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    const accountId = req.params.accountId;
    const body = req.body || {};
    try {
        let identity = body.identity;
        let password = body.password;

        if (!identity || !password) {
            // lấy creds đã lưu
            const row = await dbPool.query(
                `SELECT login_identity, login_password_enc FROM pancake_accounts WHERE account_id = $1`,
                [accountId]
            );
            if (row.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
            identity = row.rows[0].login_identity;
            const enc = row.rows[0].login_password_enc;
            if (!identity || !enc)
                return res
                    .status(400)
                    .json({
                        error: 'Chưa lưu credentials cho account này — gửi identity+password',
                    });
            password = creds.decrypt(enc);
            if (!password) return res.status(500).json({ error: 'decrypt_failed (sai key?)' });
        } else if (body.save) {
            // gửi kèm cờ save → lưu lại creds mã hoá
            const encNew = creds.encrypt(password);
            if (encNew)
                await dbPool
                    .query(
                        `UPDATE pancake_accounts SET login_identity=$1, login_password_enc=$2, auto_refresh=$3 WHERE account_id=$4`,
                        [identity, encNew, body.auto_refresh !== false, accountId]
                    )
                    .catch(() => {});
        }

        const result = await _refreshAccount(accountId, identity, password);
        if (!result.ok)
            return res.status(502).json({ error: 'refresh_failed', reason: result.reason });
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// CRON: quét account auto_refresh sắp/đã hết hạn → login lại
// =====================================================
async function refreshExpiring(pool, { withinDays = 5 } = {}) {
    if (!pool) return { ok: false, reason: 'no_pool' };
    if (!creds.isConfigured()) return { ok: false, reason: 'no_key' };
    const cutoff = Math.floor(Date.now() / 1000) + withinDays * 86400;
    const rows = await pool.query(
        `SELECT account_id, login_identity, login_password_enc, token_exp
         FROM pancake_accounts
         WHERE auto_refresh = true
           AND login_password_enc IS NOT NULL
           AND (token_exp IS NULL OR token_exp <= $1)`,
        [cutoff]
    );
    const summary = { ok: true, scanned: rows.rows.length, refreshed: 0, failed: 0, details: [] };
    for (const r of rows.rows) {
        const pwd = creds.decrypt(r.login_password_enc);
        if (!r.login_identity || !pwd) {
            summary.failed++;
            summary.details.push({ accountId: r.account_id, ok: false, reason: 'decrypt' });
            continue;
        }
        const res = await _refreshAccount(r.account_id, r.login_identity, pwd);
        if (res.ok) summary.refreshed++;
        else summary.failed++;
        summary.details.push({ accountId: r.account_id, ok: res.ok, reason: res.reason });
        await new Promise((s) => setTimeout(s, 1500)); // throttle
    }
    console.log(
        `[WEB2-PANCAKE-REFRESH] cron: scanned ${summary.scanned}, refreshed ${summary.refreshed}, failed ${summary.failed}`
    );
    return summary;
}

let _cronTimer = null;
function startCron(pool, intervalMs = 6 * 60 * 60 * 1000) {
    if (_cronTimer) return;
    const run = () =>
        refreshExpiring(pool, { withinDays: 5 }).catch((e) =>
            console.error('[WEB2-PANCAKE-REFRESH] cron error:', e.message)
        );
    // chạy lần đầu sau 60s (khỏi đụng startup), rồi mỗi intervalMs
    setTimeout(run, 60000);
    _cronTimer = setInterval(run, intervalMs);
    console.log(
        `[WEB2-PANCAKE-REFRESH] cron started (every ${Math.round(intervalMs / 3600000)}h, refresh ≤5 ngày HSD)`
    );
}

router.refreshExpiring = refreshExpiring;
router.startCron = startCron;

module.exports = router;
