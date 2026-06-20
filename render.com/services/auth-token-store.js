// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// AUTH TOKEN STORE — PostgreSQL-backed token cache
// Supports multiple providers: tpos_1, tpos_2, pancake, etc.
// Pre-seeds on server start; clients GET cached token via API.
// =====================================================

const { fetchWithRetry } = require('../../shared/node/fetch-utils.cjs');

const CF_TOKEN_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/token';
const REFRESH_BUFFER_MS = 6 * 60 * 60 * 1000; // Refresh 6h trước expire

// In-memory lock per provider to prevent concurrent refreshes
const _locks = new Map();

/**
 * @param {import('pg').Pool} pool
 */
function createAuthTokenStore(pool) {
    // ── Pancake fallback ─────────────────────────────────────────────────
    // Web 2.0 auto-renews `pancake_accounts.token` (cron/extension/saved-creds
    // login). The legacy auth_token_cache row for 'pancake' is only filled by a
    // browser push via /api/realtime/start and nobody refreshes it. When that
    // cache is missing/stale, read the freshest still-valid token straight from
    // pancake_accounts so Web 1.0 (orders-report chat) gets the token Web 2.0
    // saved. READ-ONLY: never writes auth_token_cache (avoid racing the
    // /api/realtime/start upsert). Returns null on empty/error (never throws).
    async function _getFreshPancakeAccountToken() {
        try {
            const r = await pool.query(
                `SELECT token, token_exp FROM pancake_accounts
                 WHERE token IS NOT NULL
                   AND (token_exp IS NULL OR token_exp > extract(epoch from now()))
                 ORDER BY (token_exp IS NOT NULL) DESC, token_exp DESC, last_used_at DESC NULLS LAST
                 LIMIT 1`
            );
            if (r.rows.length === 0) return null;
            let token = String(r.rows[0].token || '');
            if (token.startsWith('jwt=')) token = token.slice(4); // defensive
            if (!token) return null;

            // Derive expires_at: prefer token_exp column (epoch seconds); else
            // decode JWT exp; else null (client re-validates and discards stale).
            let exp = r.rows[0].token_exp ? Number(r.rows[0].token_exp) : null;
            if (!exp) {
                try {
                    const payload = JSON.parse(
                        Buffer.from(token.split('.')[1], 'base64url').toString('utf8')
                    );
                    if (payload && payload.exp) exp = Number(payload.exp);
                } catch (_) {
                    /* leave null */
                }
            }
            const expires_at = exp ? new Date(exp * 1000) : null;
            return {
                token,
                refresh_token: null,
                expires_at,
                metadata: { source: 'pancake_accounts' },
            };
        } catch (e) {
            console.warn('[AUTH-STORE] pancake_accounts fallback failed:', e.message);
            return null;
        }
    }

    async function getToken(provider) {
        const row = await pool.query(
            'SELECT token, refresh_token, expires_at, metadata FROM auth_token_cache WHERE provider = $1',
            [provider]
        );
        if (row.rows.length > 0) {
            const t = row.rows[0];
            const msUntilExpire = new Date(t.expires_at).getTime() - Date.now();

            // Pancake: browser-pushed JWT, no server refresh. If the cached token
            // is still valid, return it. If stale, fall back to the auto-renewed
            // token in pancake_accounts; only as a last resort return the stale
            // cache row (preserves the old "always return what we have" behavior).
            if (provider === 'pancake') {
                if (msUntilExpire > 0) {
                    return {
                        token: t.token,
                        refresh_token: null,
                        expires_at: t.expires_at,
                        metadata: t.metadata,
                    };
                }
                const fresh = await _getFreshPancakeAccountToken();
                if (fresh) {
                    console.log(
                        '[AUTH-STORE] pancake cache stale → served fresh token from pancake_accounts'
                    );
                    return fresh;
                }
                return {
                    token: t.token,
                    refresh_token: null,
                    expires_at: t.expires_at,
                    metadata: t.metadata,
                };
            }

            if (msUntilExpire > REFRESH_BUFFER_MS) {
                return {
                    token: t.token,
                    refresh_token: t.refresh_token,
                    expires_at: t.expires_at,
                    metadata: t.metadata,
                };
            }
            // Token near expiry → try refresh
            console.log(
                `[AUTH-STORE] Token ${provider} expiring soon (${Math.round(msUntilExpire / 3600000)}h), refreshing...`
            );
        } else if (provider === 'pancake') {
            // No pancake token in auth_token_cache — try the auto-renewed token in
            // pancake_accounts before giving up.
            const fresh = await _getFreshPancakeAccountToken();
            if (fresh) {
                console.log(
                    '[AUTH-STORE] pancake cache empty → served fresh token from pancake_accounts'
                );
                return fresh;
            }
            // No usable token in either store — browser hasn't pushed one
            throw new Error(
                'pancake:not_found — browser must push token via /api/realtime/start first'
            );
        }
        // No token or expired → refresh
        return await refreshAndStore(provider);
    }

    async function refreshAndStore(provider) {
        // Concurrent lock
        if (_locks.has(provider)) {
            console.log(`[AUTH-STORE] Waiting for ongoing refresh of ${provider}...`);
            return _locks.get(provider);
        }
        const promise = _doRefresh(provider);
        _locks.set(provider, promise);
        try {
            return await promise;
        } finally {
            _locks.delete(provider);
        }
    }

    async function _doRefresh(provider) {
        // Pancake JWT is browser-session based — no server-side refresh available.
        // Token must be pushed by browser via /api/realtime/start.
        if (provider === 'pancake')
            throw new Error(`pancake token must be pushed by browser — cannot auto-refresh`);

        const creds = _getCredentials(provider);
        if (!creds) throw new Error(`Unknown provider: ${provider}`);

        console.log(`[AUTH-STORE] Refreshing token for ${provider}...`);

        // Try refresh_token first (from DB)
        const existing = await pool.query(
            'SELECT refresh_token FROM auth_token_cache WHERE provider = $1',
            [provider]
        );
        const storedRefresh = existing.rows[0]?.refresh_token;

        let tokenData = null;
        if (storedRefresh) {
            tokenData = await _refreshWithToken(storedRefresh, creds.client_id);
        }
        if (!tokenData) {
            tokenData = await _passwordLogin(creds);
        }
        if (!tokenData || !tokenData.access_token) {
            throw new Error(`Failed to obtain token for ${provider}`);
        }

        const expiresAt = new Date(Date.now() + (tokenData.expires_in || 1296000) * 1000);
        const result = {
            token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || null,
            expires_at: expiresAt,
            metadata: { username: creds.username, provider },
        };

        // Upsert DB
        await pool.query(
            `
            INSERT INTO auth_token_cache (provider, token, refresh_token, expires_at, metadata, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (provider) DO UPDATE SET
                token = EXCLUDED.token,
                refresh_token = EXCLUDED.refresh_token,
                expires_at = EXCLUDED.expires_at,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
        `,
            [
                provider,
                result.token,
                result.refresh_token,
                result.expires_at,
                JSON.stringify(result.metadata),
            ]
        );

        console.log(
            `[AUTH-STORE] ✅ Token ${provider} cached (expires ${expiresAt.toISOString()})`
        );
        return result;
    }

    async function _refreshWithToken(refreshToken, clientId) {
        try {
            const body = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId || 'tmtWebApp',
            });
            const resp = await fetchWithRetry(
                CF_TOKEN_URL,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: body.toString(),
                },
                1,
                1000,
                10000
            );
            if (!resp.ok) return null;
            const data = await resp.json();
            return data.access_token ? data : null;
        } catch (e) {
            console.warn(`[AUTH-STORE] refresh_token failed:`, e.message);
            return null;
        }
    }

    async function _passwordLogin(creds) {
        const body = new URLSearchParams({
            grant_type: 'password',
            username: creds.username,
            password: creds.password,
            client_id: creds.client_id || 'tmtWebApp',
        });
        const resp = await fetchWithRetry(
            CF_TOKEN_URL,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
            },
            2,
            2000,
            15000
        );
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`Password login failed (${resp.status}): ${text.slice(0, 200)}`);
        }
        return resp.json();
    }

    function _getCredentials(provider) {
        // provider format: 'tpos_1', 'tpos_2'
        // Creds come from env only — TPOS password is rotated server-side and must
        // never be hardcoded in source. Shared password via TPOS_PASSWORD.
        const password = process.env.TPOS_PASSWORD;
        const clientId = process.env.TPOS_CLIENT_ID || 'tmtWebApp';
        if (provider === 'tpos_1') {
            return {
                username: process.env.TPOS_USERNAME || 'nvktlive1',
                password,
                client_id: clientId,
            };
        }
        if (provider === 'tpos_2') {
            return {
                username: process.env.TPOS_USERNAME_2 || 'nvktshop1',
                password,
                client_id: clientId,
            };
        }
        // Server's own TPOS token (env-based, for server-side OData calls)
        if (provider === 'tpos_server') {
            return {
                username: process.env.TPOS_USERNAME,
                password,
                client_id: clientId,
            };
        }
        return null;
    }

    async function invalidate(provider) {
        await pool.query('DELETE FROM auth_token_cache WHERE provider = $1', [provider]);
        console.log(`[AUTH-STORE] Invalidated token for ${provider}`);
    }

    /**
     * Pre-seed: fetch tokens for all known providers on server start.
     * Non-blocking — logs errors but doesn't throw.
     */
    async function preSeed() {
        const providers = ['tpos_1', 'tpos_2'];
        if (process.env.TPOS_USERNAME) providers.push('tpos_server');
        for (const p of providers) {
            try {
                await getToken(p);
            } catch (e) {
                console.warn(`[AUTH-STORE] Pre-seed failed for ${p}:`, e.message);
            }
        }
    }

    return { getToken, refreshAndStore, invalidate, preSeed };
}

module.exports = { createAuthTokenStore };
