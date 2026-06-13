// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// Pancake Accounts API
// Store & retrieve Pancake JWT accounts in PostgreSQL
// Replaces Firestore pancake_tokens/accounts
// =====================================================

const express = require('express');
const router = express.Router();
const { requireWeb2AuthSoft, resolveWeb2User } = require('../middleware/web2-auth');

let dbPool = null;

// ── Auth helpers ─────────────────────────────────────────────────────
// Service nội bộ (server↔server) gửi x-relay-secret === CLEANUP_SECRET — cùng
// pattern realtime-sse-web2 /sse/relay-notify.
function _hasRelaySecret(req) {
    const secret = process.env.CLEANUP_SECRET || '';
    return !!secret && req.headers['x-relay-secret'] === secret;
}

// Web 1.0 (orders-report) giữ X-API-Key = CLIENT_API_KEY — key này đã được trust
// để phát Pancake JWT qua /api/auth/token/pancake (server.js requireApiKey). Chấp
// nhận nó như 1 credential authed ở đây để Web 1.0 đọc full token kể cả khi
// WEB2_AUTH_ENFORCE='1'. CHỈ THÊM nhánh OR — không siết/bỏ path web2-token nên
// Web 2.0 không bị ảnh hưởng. (ENFORCE-PREP 2026-06-13)
function _hasClientApiKey(req) {
    const key = process.env.CLIENT_API_KEY || '';
    if (!key) return false;
    // Header cho caller server-to-server/Node. Browser KHÔNG gửi được header tuỳ
    // biến X-API-Key (CORS preflight của worker chặn) → chấp nhận thêm ?client_key
    // (query param = simple request, không preflight). Key vốn đã public ở frontend.
    return req.headers['x-api-key'] === key || (req.query && req.query.client_key === key);
}

// requireWeb2AuthSoft + chấp nhận relay-secret / client-api-key cho caller nội bộ.
function _softAuth(req, res, next) {
    if (_hasRelaySecret(req)) return next();
    if (_hasClientApiKey(req)) return next();
    return requireWeb2AuthSoft(req, res, next);
}

// Warn throttle (1 lần/phút) — list được token-manager gọi mỗi page load.
let _lastUnauthedListWarn = 0;
function _warnUnauthedList() {
    const now = Date.now();
    if (now - _lastUnauthedListWarn < 60 * 1000) return;
    _lastUnauthedListWarn = now;
    console.warn(
        '[WEB2-AUTH][SOFT] unauthenticated GET /api/pancake-accounts — token vẫn trả (WEB2_AUTH_ENFORCE chưa bật)'
    );
}

// true nếu caller có relay-secret HOẶC web2 token hợp lệ.
async function _isAuthed(req) {
    if (_hasRelaySecret(req)) return true;
    if (_hasClientApiKey(req)) return true;
    if (req.web2User) return true;
    const user = await resolveWeb2User(req).catch(() => null);
    if (user) req.web2User = user;
    return !!user;
}

// Strip secrets khỏi account row. login_password_enc KHÔNG BAO GIỜ trả ra.
// includeToken=false → bỏ token, trả has_token + token_preview (8 ký tự cuối,
// đủ cho UI hiển thị nhận diện — không dùng được làm JWT).
function _shapeAccount(row, includeToken) {
    const { token, login_password_enc, ...rest } = row; // eslint-disable-line no-unused-vars
    const out = { ...rest, has_token: !!token };
    if (includeToken) out.token = token;
    else if (token) out.token_preview = String(token).slice(-8);
    return out;
}

router.init = async (pool) => {
    dbPool = pool;
    console.log('[PANCAKE-ACCOUNTS] Route initialized');
};

// =====================================================
// GET /api/pancake-accounts
// List all accounts (optionally filter by is_active)
// ⚠ token chỉ trả cho caller authed (web2 token / relay-secret). Caller chưa
// authed: WEB2_AUTH_ENFORCE='1' → strip token (has_token), chưa bật → warn +
// vẫn trả token (4 frontend token-manager đang đọc token từ list, chưa gửi
// x-web2-token — gate cứng ngay sẽ vỡ messaging). login_password_enc LUÔN strip.
// =====================================================
router.get('/', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        const { active } = req.query;
        let query = 'SELECT * FROM pancake_accounts ORDER BY last_used_at DESC';
        const params = [];
        if (active !== undefined) {
            query =
                'SELECT * FROM pancake_accounts WHERE is_active = $1 ORDER BY last_used_at DESC';
            params.push(active === 'true');
        }
        const result = await dbPool.query(query, params);
        let includeToken = await _isAuthed(req);
        if (!includeToken) {
            if (process.env.WEB2_AUTH_ENFORCE === '1') {
                includeToken = false;
            } else {
                _warnUnauthedList();
                includeToken = true;
            }
        }
        res.json({
            success: true,
            accounts: result.rows.map((r) => _shapeAccount(r, includeToken)),
        });
    } catch (e) {
        console.error('[PANCAKE-ACCOUNTS] GET error:', e.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

// =====================================================
// GET /api/pancake-accounts/:accountId
// Get single account (token đầy đủ — consumer nội bộ cần JWT).
// Yêu cầu x-relay-secret === CLEANUP_SECRET HOẶC web2 token hợp lệ.
// Chưa authed: chỉ 401 khi WEB2_AUTH_ENFORCE='1' (orders-report token-manager
// đang gọi không auth — gate cứng ngay sẽ vỡ fallback load token).
// =====================================================
router.get('/:accountId', _softAuth, async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        const result = await dbPool.query('SELECT * FROM pancake_accounts WHERE account_id = $1', [
            req.params.accountId,
        ]);
        if (result.rows.length === 0) return res.json({ success: true, account: null });
        res.json({ success: true, account: _shapeAccount(result.rows[0], true) });
    } catch (e) {
        console.error('[PANCAKE-ACCOUNTS] GET one error:', e.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

// =====================================================
// POST /api/pancake-accounts/sync
// Batch upsert accounts (from Firestore sync or client)
// Body: { accounts: { accountId: { token, exp, uid, name, savedAt } } }
// =====================================================
router.post('/sync', _softAuth, async (req, res) => {
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
            let fbId = null,
                fbName = null;
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

            await dbPool.query(
                `
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
            `,
                [
                    accountId,
                    acc.uid || null,
                    acc.name || fbName || null,
                    acc.token,
                    acc.exp || null,
                    fbId,
                    fbName,
                    acc.savedAt || null,
                ]
            );
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
router.put('/:accountId', _softAuth, async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    const { accountId } = req.params;
    const { token, exp, name, pages, is_active } = req.body;

    try {
        const sets = ['last_used_at = NOW()'];
        const params = [];
        let idx = 1;

        if (token !== undefined) {
            sets.push(`token = $${idx++}`);
            params.push(token);
        }
        if (exp !== undefined) {
            sets.push(`token_exp = $${idx++}`);
            params.push(exp);
        }
        if (name !== undefined) {
            sets.push(`name = $${idx++}`);
            params.push(name);
        }
        if (pages !== undefined) {
            sets.push(`pages = $${idx++}`);
            params.push(JSON.stringify(pages));
        }
        if (is_active !== undefined) {
            sets.push(`is_active = $${idx++}`);
            params.push(is_active);
        }

        params.push(accountId);
        const result = await dbPool.query(
            `UPDATE pancake_accounts SET ${sets.join(', ')} WHERE account_id = $${idx} RETURNING *`,
            params
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
        res.json({ success: true, account: _shapeAccount(result.rows[0], true) });
    } catch (e) {
        console.error('[PANCAKE-ACCOUNTS] PUT error:', e.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

// =====================================================
// DELETE /api/pancake-accounts/:accountId
// Remove account
// =====================================================
router.delete('/:accountId', _softAuth, async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'DB not available' });
    try {
        await dbPool.query('DELETE FROM pancake_accounts WHERE account_id = $1', [
            req.params.accountId,
        ]);
        res.json({ success: true });
    } catch (e) {
        console.error('[PANCAKE-ACCOUNTS] DELETE error:', e.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

module.exports = router;
