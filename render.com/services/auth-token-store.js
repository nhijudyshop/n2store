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

    async function getToken(provider) {
        const row = await pool.query(
            'SELECT token, refresh_token, expires_at, metadata FROM auth_token_cache WHERE provider = $1',
            [provider]
        );
        if (row.rows.length > 0) {
            const t = row.rows[0];
            const msUntilExpire = new Date(t.expires_at).getTime() - Date.now();
            if (msUntilExpire > REFRESH_BUFFER_MS) {
                return { token: t.token, refresh_token: t.refresh_token, expires_at: t.expires_at, metadata: t.metadata };
            }
            // Token near expiry → try refresh
            console.log(`[AUTH-STORE] Token ${provider} expiring soon (${Math.round(msUntilExpire / 3600000)}h), refreshing...`);
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
        try { return await promise; }
        finally { _locks.delete(provider); }
    }

    async function _doRefresh(provider) {
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
            metadata: { username: creds.username, provider }
        };

        // Upsert DB
        await pool.query(`
            INSERT INTO auth_token_cache (provider, token, refresh_token, expires_at, metadata, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (provider) DO UPDATE SET
                token = EXCLUDED.token,
                refresh_token = EXCLUDED.refresh_token,
                expires_at = EXCLUDED.expires_at,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
        `, [provider, result.token, result.refresh_token, result.expires_at, JSON.stringify(result.metadata)]);

        console.log(`[AUTH-STORE] ✅ Token ${provider} cached (expires ${expiresAt.toISOString()})`);
        return result;
    }

    async function _refreshWithToken(refreshToken, clientId) {
        try {
            const body = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId || 'tmtWebApp'
            });
            const resp = await fetchWithRetry(CF_TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            }, 1, 1000, 10000);
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
            client_id: creds.client_id || 'tmtWebApp'
        });
        const resp = await fetchWithRetry(CF_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        }, 2, 2000, 15000);
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`Password login failed (${resp.status}): ${text.slice(0, 200)}`);
        }
        return resp.json();
    }

    function _getCredentials(provider) {
        // provider format: 'tpos_1', 'tpos_2'
        if (provider === 'tpos_1') {
            return {
                username: process.env.TPOS_USERNAME || 'nvktlive1',
                password: process.env.TPOS_PASSWORD || 'Aa@28612345678',
                client_id: process.env.TPOS_CLIENT_ID || 'tmtWebApp'
            };
        }
        if (provider === 'tpos_2') {
            return {
                username: 'nvktshop1',
                password: 'Aa@28612345678',
                client_id: 'tmtWebApp'
            };
        }
        // Server's own TPOS token (env-based, for server-side OData calls)
        if (provider === 'tpos_server') {
            return {
                username: process.env.TPOS_USERNAME,
                password: process.env.TPOS_PASSWORD,
                client_id: process.env.TPOS_CLIENT_ID || 'tmtWebApp'
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
