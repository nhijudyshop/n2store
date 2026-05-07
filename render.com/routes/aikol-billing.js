// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// AIKOL BILLING — SePay topup + user settings.
// Mounted under /api/aikol/* alongside other aikol sub-routers.
//
// Endpoints:
//   POST   /billing/topup           — body { pack_id } → { qr_url, memo, amount, credits, expires_at }
//   GET    /billing/topups          — list user topups
//   GET    /billing/topups/:id      — single topup status (poll for paid)
//   POST   /billing/topups/:id/cancel
//   GET    /settings                — user prefs (Telegram chat_id, notify toggles)
//   PATCH  /settings                — update prefs
//   POST   /telegram/link           — verify a Telegram chat_id (sends test message)
//
// Memo format: AIKOL + 8 alphanumeric chars (unique per topup). SePay webhook
// matches incoming transactions whose `content` contains this memo and credits the user.
// =====================================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db/pool');
const telegram = require('../services/aikol-telegram-service');

const PACKS = [
    { id: 'mini', name: 'Mini', credits: 180, vnd: 60000 },
    { id: 'small', name: 'Small', credits: 450, vnd: 150000 },
    { id: 'standard', name: 'Standard', credits: 900, vnd: 300000 },
    { id: 'pro', name: 'Pro', credits: 2000, vnd: 600000 },
    { id: 'power', name: 'Power', credits: 5000, vnd: 1500000 },
    { id: 'agency', name: 'Agency', credits: 10000, vnd: 3000000 },
];

const SEPAY_BANK = process.env.SEPAY_BANK || 'MBBank';
const SEPAY_ACCOUNT_NUMBER = process.env.SEPAY_ACCOUNT_NUMBER || '';
const SEPAY_ACCOUNT_NAME = process.env.SEPAY_ACCOUNT_NAME || 'NHI JUDY HOUSE';

// ---------- helpers ----------
function getUserId(req) {
    const direct = req.header('X-User-Id') || req.query.user_id;
    if (direct) return String(direct);
    const authData = req.header('X-Auth-Data');
    if (authData) {
        try {
            const p = JSON.parse(authData);
            return p.userId || p.uid || p.email || null;
        } catch {}
    }
    return null;
}
function requireUser(req, res, next) {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ error: 'auth_required', detail: 'Missing X-User-Id' });
    req.userId = uid;
    next();
}

function genMemo() {
    // 8 uppercase alphanumeric — short enough to fit any bank's 50-char content cap.
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = 'AIKOL';
    for (let i = 0; i < 8; i++) s += chars[crypto.randomInt(0, chars.length)];
    return s;
}

function buildSepayQrUrl({ memo, amount }) {
    // SePay's QR generator (img.vietqr.io fallback if not configured).
    if (SEPAY_ACCOUNT_NUMBER) {
        return `https://qr.sepay.vn/img?acc=${encodeURIComponent(
            SEPAY_ACCOUNT_NUMBER
        )}&bank=${encodeURIComponent(SEPAY_BANK)}&amount=${amount}&des=${encodeURIComponent(memo)}`;
    }
    return null;
}

// ---------- POST /billing/topup ----------
router.post('/billing/topup', requireUser, express.json(), async (req, res) => {
    const { pack_id } = req.body || {};
    const pack = PACKS.find((p) => p.id === pack_id);
    if (!pack) {
        return res.status(400).json({ error: 'invalid', detail: `Unknown pack_id: ${pack_id}` });
    }
    if (!SEPAY_ACCOUNT_NUMBER) {
        return res.status(503).json({
            error: 'sepay_not_configured',
            detail: 'SePay account chưa thiết lập. Liên hệ admin.',
        });
    }

    // Generate unique memo (loop max 5 times for collision safety).
    let memo = null;
    for (let i = 0; i < 5; i++) {
        const candidate = genMemo();
        const exists = await pool.query(`SELECT 1 FROM aikol_topups WHERE memo = $1 LIMIT 1`, [
            candidate,
        ]);
        if (!exists.rows[0]) {
            memo = candidate;
            break;
        }
    }
    if (!memo) return res.status(500).json({ error: 'memo_collision' });

    try {
        const ins = await pool.query(
            `INSERT INTO aikol_topups (user_id, pack_id, credits, amount_vnd, memo)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, memo, credits, amount_vnd,
                       EXTRACT(EPOCH FROM created_at)::int AS created_at,
                       EXTRACT(EPOCH FROM expires_at)::int AS expires_at`,
            [req.userId, pack.id, pack.credits, pack.vnd, memo]
        );
        const row = ins.rows[0];
        return res.json({
            ...row,
            pack_id: pack.id,
            pack_name: pack.name,
            qr_url: buildSepayQrUrl({ memo: row.memo, amount: row.amount_vnd }),
            bank: SEPAY_BANK,
            account_number: SEPAY_ACCOUNT_NUMBER,
            account_name: SEPAY_ACCOUNT_NAME,
            instructions:
                'Quét QR hoặc chuyển khoản. PHẢI nhập memo (nội dung) đúng — hệ thống tự match.',
        });
    } catch (e) {
        console.error('[aikol] POST /billing/topup', e);
        res.status(500).json({ error: 'server_error', detail: e.message });
    }
});

// ---------- GET /billing/topups ----------
router.get('/billing/topups', requireUser, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, pack_id, credits, amount_vnd, memo, state, paid_at, paid_by_sepay_id,
                    EXTRACT(EPOCH FROM created_at)::int AS created_at,
                    EXTRACT(EPOCH FROM expires_at)::int AS expires_at
             FROM aikol_topups
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 50`,
            [req.userId]
        );
        res.json({ topups: rows });
    } catch (e) {
        console.error('[aikol] GET /billing/topups', e);
        res.status(500).json({ error: 'db_error', detail: e.message });
    }
});

// ---------- GET /billing/topups/:id ----------
router.get('/billing/topups/:id', requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    try {
        const { rows } = await pool.query(
            `SELECT id, pack_id, credits, amount_vnd, memo, state, paid_at, paid_by_sepay_id,
                    EXTRACT(EPOCH FROM created_at)::int AS created_at,
                    EXTRACT(EPOCH FROM expires_at)::int AS expires_at
             FROM aikol_topups
             WHERE id = $1 AND user_id = $2`,
            [id, req.userId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'not_found' });
        const row = rows[0];
        res.json({
            ...row,
            qr_url:
                row.state === 'pending'
                    ? buildSepayQrUrl({ memo: row.memo, amount: row.amount_vnd })
                    : null,
        });
    } catch (e) {
        console.error('[aikol] GET /billing/topups/:id', e);
        res.status(500).json({ error: 'db_error', detail: e.message });
    }
});

// ---------- POST /billing/topups/:id/cancel ----------
router.post('/billing/topups/:id/cancel', requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    try {
        const { rows } = await pool.query(
            `UPDATE aikol_topups SET state = 'cancelled'
             WHERE id = $1 AND user_id = $2 AND state = 'pending'
             RETURNING id, state`,
            [id, req.userId]
        );
        if (!rows[0]) {
            return res
                .status(409)
                .json({ error: 'invalid_state', detail: 'Không phải trạng thái pending' });
        }
        res.json({ ok: true, ...rows[0] });
    } catch (e) {
        console.error('[aikol] cancel topup', e);
        res.status(500).json({ error: 'server_error', detail: e.message });
    }
});

// ---------- GET /settings ----------
router.get('/settings', requireUser, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT user_id, telegram_chat_id, notify_on_done, notify_on_error,
                    EXTRACT(EPOCH FROM updated_at)::int AS updated_at
             FROM aikol_user_settings
             WHERE user_id = $1`,
            [req.userId]
        );
        if (!rows[0]) {
            // Auto-create defaults on first read.
            const ins = await pool.query(
                `INSERT INTO aikol_user_settings (user_id) VALUES ($1)
                 ON CONFLICT (user_id) DO NOTHING
                 RETURNING user_id, telegram_chat_id, notify_on_done, notify_on_error,
                           EXTRACT(EPOCH FROM updated_at)::int AS updated_at`,
                [req.userId]
            );
            return res.json(
                ins.rows[0] || {
                    user_id: req.userId,
                    telegram_chat_id: null,
                    notify_on_done: true,
                    notify_on_error: true,
                }
            );
        }
        res.json(rows[0]);
    } catch (e) {
        console.error('[aikol] GET /settings', e);
        res.status(500).json({ error: 'db_error', detail: e.message });
    }
});

// ---------- PATCH /settings ----------
router.patch('/settings', requireUser, express.json(), async (req, res) => {
    const { telegram_chat_id, notify_on_done, notify_on_error } = req.body || {};
    const fields = [];
    const params = [req.userId];
    if (telegram_chat_id !== undefined) {
        const trimmed = telegram_chat_id == null ? null : String(telegram_chat_id).trim() || null;
        params.push(trimmed);
        fields.push(`telegram_chat_id = $${params.length}`);
    }
    if (typeof notify_on_done === 'boolean') {
        params.push(notify_on_done);
        fields.push(`notify_on_done = $${params.length}`);
    }
    if (typeof notify_on_error === 'boolean') {
        params.push(notify_on_error);
        fields.push(`notify_on_error = $${params.length}`);
    }
    if (fields.length === 0) {
        return res.status(400).json({ error: 'invalid', detail: 'No fields to update' });
    }
    try {
        // Upsert.
        await pool.query(
            `INSERT INTO aikol_user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
            [req.userId]
        );
        const sql = `UPDATE aikol_user_settings SET ${fields.join(
            ', '
        )}, updated_at = NOW() WHERE user_id = $1
            RETURNING user_id, telegram_chat_id, notify_on_done, notify_on_error,
                      EXTRACT(EPOCH FROM updated_at)::int AS updated_at`;
        const { rows } = await pool.query(sql, params);
        res.json(rows[0]);
    } catch (e) {
        console.error('[aikol] PATCH /settings', e);
        res.status(500).json({ error: 'server_error', detail: e.message });
    }
});

// ---------- Admin: grant credits without SePay ----------
// Lookup the caller's is_admin flag from app_users. Cached per request only.
async function isAdminUser(userId) {
    try {
        const { rows } = await pool.query(
            `SELECT is_admin FROM app_users WHERE username = $1 LIMIT 1`,
            [userId]
        );
        if (rows[0]?.is_admin) return true;
    } catch (_) {}
    // Hard-coded fallback: the seed `admin` account is always allowed even if the
    // app_users row was never created (legacy installs).
    return userId === 'admin';
}

function requireAdmin(req, res, next) {
    requireUser(req, res, async () => {
        const ok = await isAdminUser(req.userId);
        if (!ok) return res.status(403).json({ error: 'admin_required' });
        next();
    });
}

// GET /admin/me → { is_admin } so the UI can hide the panel from non-admins.
router.get('/admin/me', requireUser, async (req, res) => {
    const ok = await isAdminUser(req.userId);
    res.json({ is_admin: ok, user_id: req.userId });
});

// GET /admin/users → list usernames + current balance, sorted by username.
// Used by the admin panel to pick a target. Limit 200 (small workspace).
router.get('/admin/users', requireAdmin, async (_req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.username, u.display_name, u.is_admin,
                    COALESCE(c.balance, 0) AS balance, COALESCE(c.plan, 'none') AS plan
             FROM app_users u
             LEFT JOIN aikol_credits c ON c.user_id = u.username
             ORDER BY u.username
             LIMIT 200`
        );
        res.json({ users: rows });
    } catch (e) {
        console.error('[aikol] /admin/users', e);
        res.status(500).json({ error: 'db_error', detail: e.message });
    }
});

// POST /admin/credits/grant → atomically credit (or debit) any user's wallet.
// Body: { target_user_id, delta:int, note?:string }
//   delta > 0 = grant, delta < 0 = adjustment (e.g. refund clawback). Logged in
//   aikol_credit_history with kind='admin_grant' and the granting admin's id in note.
router.post('/admin/credits/grant', requireAdmin, express.json(), async (req, res) => {
    const { target_user_id, delta, note } = req.body || {};
    const target = target_user_id ? String(target_user_id).trim() : '';
    const amount = parseInt(delta, 10);
    if (!target)
        return res.status(400).json({ error: 'invalid', detail: 'target_user_id required' });
    if (!Number.isFinite(amount) || amount === 0) {
        return res
            .status(400)
            .json({ error: 'invalid', detail: 'delta must be a non-zero integer' });
    }
    if (Math.abs(amount) > 1_000_000) {
        return res
            .status(400)
            .json({ error: 'invalid', detail: 'delta out of range (±1,000,000)' });
    }
    const cleanNote = (note ? String(note).slice(0, 200) : '') + ` · by ${req.userId}`;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Ensure wallet row exists for the target.
        await client.query(
            `INSERT INTO aikol_credits (user_id, balance, plan)
             VALUES ($1, 0, 'free')
             ON CONFLICT (user_id) DO NOTHING`,
            [target]
        );
        const upd = await client.query(
            `UPDATE aikol_credits SET balance = balance + $2
             WHERE user_id = $1
             RETURNING balance, plan`,
            [target, amount]
        );
        if (!upd.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'wallet_missing' });
        }
        if (upd.rows[0].balance < 0) {
            await client.query('ROLLBACK');
            return res
                .status(409)
                .json({
                    error: 'insufficient',
                    detail: `Balance would go negative (${upd.rows[0].balance})`,
                });
        }
        await client.query(
            `INSERT INTO aikol_credit_history (user_id, kind, delta, note)
             VALUES ($1, 'admin_grant', $2, $3)`,
            [target, amount, cleanNote]
        );
        await client.query('COMMIT');
        res.json({
            ok: true,
            target_user_id: target,
            delta: amount,
            balance: upd.rows[0].balance,
            plan: upd.rows[0].plan,
        });
    } catch (e) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {}
        console.error('[aikol] /admin/credits/grant', e);
        res.status(500).json({ error: 'server_error', detail: e.message });
    } finally {
        client.release();
    }
});

// ---------- POST /telegram/link ----------
// Send a test message to the supplied chat_id. If 200 from Telegram, save it.
router.post('/telegram/link', requireUser, express.json(), async (req, res) => {
    const { chat_id } = req.body || {};
    const trimmed = chat_id ? String(chat_id).trim() : null;
    if (!trimmed) return res.status(400).json({ error: 'invalid', detail: 'chat_id required' });
    const test = await telegram.sendTelegramMessage(
        trimmed,
        `✅ *AI KOL Studio* đã kết nối thành công\n\nUser: \`${req.userId}\``
    );
    if (!test.ok) {
        return res.status(400).json({
            error: 'telegram_failed',
            detail: test.error || `Chat ${trimmed} không tồn tại hoặc bot chưa /start`,
            telegram_response: test.data,
        });
    }
    await pool.query(
        `INSERT INTO aikol_user_settings (user_id, telegram_chat_id) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET telegram_chat_id = $2, updated_at = NOW()`,
        [req.userId, trimmed]
    );
    res.json({ ok: true, chat_id: trimmed });
});

module.exports = router;
