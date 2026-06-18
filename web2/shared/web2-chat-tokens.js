// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Chat client / TOKENS (JWT + PAT + accounts + RenderDB sync)
// =====================================================
//
// Token lifecycle for the Web2Chat module set: read/write the JWT
// (access_token) and per-page page_access_tokens from localStorage
// (shared with Web 1.0 PancakeTokenManager), decode JWTs, and pull
// the account/page-token map from Render DB. Reads/writes shared
// state via `window.__Web2ChatNS`. Load AFTER web2-chat-utils.js.

(function () {
    'use strict';

    if (window.Web2Chat) return; // idempotent — facade already built
    const NS = window.__Web2ChatNS;
    if (!NS || !NS._utilsReady) {
        console.error('[Web2Chat] tokens module loaded before utils');
        return;
    }
    if (NS._tokensReady) return;
    NS._tokensReady = true;

    const { WORKER_URL, LS } = NS;
    const { _isExpired, _authHeaders } = NS;

    function getJwt() {
        try {
            const token = localStorage.getItem(LS.JWT);
            const exp = localStorage.getItem(LS.JWT_EXP);
            if (!token) return null;
            if (exp && _isExpired(parseInt(exp, 10))) return null;
            return token;
        } catch {
            return null;
        }
    }

    function getPageAccessToken(pageId) {
        if (!pageId) return null;
        try {
            const raw = localStorage.getItem(LS.PAGE_TOKENS);
            if (!raw) return null;
            const map = JSON.parse(raw) || {};
            const entry = map[pageId];
            if (!entry) return null;
            return typeof entry === 'string' ? entry : entry.token || null;
        } catch {
            return null;
        }
    }

    function hasTokensFor(pageId) {
        return !!getJwt() || !!getPageAccessToken(pageId);
    }

    /**
     * Return the full account map web 1.0 maintains. Keyed by account id;
     * each entry has { token, exp, uid, name, fbId, fbName, savedAt, pages }.
     * Use this for multi-account fallback when one account can't generate a
     * PAT for a given page.
     */
    function getAllAccounts() {
        try {
            const raw = localStorage.getItem(LS.ALL_ACCOUNTS);
            return raw ? JSON.parse(raw) || {} : {};
        } catch {
            return {};
        }
    }

    /**
     * Pull accounts + page tokens from Render DB (shared with web 1.0).
     * Mirrors `PancakeTokenManager._loadFromRenderDB`. Runs at most once
     * per session unless `force` is true — there's no point re-asking the
     * DB on every modal open.
     */
    async function syncFromRenderDB({ force = false } = {}) {
        if (NS._syncedThisSession && !force) return { ok: true, cached: true };
        if (NS._syncInFlight) return NS._syncInFlight;
        NS._syncInFlight = (async () => {
            const result = { ok: false, accounts: 0, pageTokens: 0 };
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 8000);
            try {
                const [accRes, ptRes] = await Promise.all([
                    fetch(`${WORKER_URL}/api/pancake-accounts?active=true`, {
                        signal: ctrl.signal,
                        headers: _authHeaders(), // ENFORCE-PREP (2026-06-12)
                    }).catch((e) => ({ _err: e })),
                    fetch(`${WORKER_URL}/api/pancake-page-tokens`, {
                        signal: ctrl.signal,
                    }).catch((e) => ({ _err: e })),
                ]);

                if (accRes && !accRes._err && accRes.ok) {
                    const data = await accRes.json().catch(() => null);
                    if (data?.success && Array.isArray(data.accounts) && data.accounts.length) {
                        const accounts = {};
                        for (const row of data.accounts) {
                            accounts[row.account_id] = {
                                token: row.token,
                                exp: Number(row.token_exp) || 0,
                                uid: row.uid,
                                name: row.name,
                                savedAt: Number(row.saved_at) || 0,
                                fbId: row.fb_id,
                                fbName: row.fb_name,
                                pages: row.pages || [],
                            };
                        }
                        localStorage.setItem(LS.ALL_ACCOUNTS, JSON.stringify(accounts));

                        // Promote one account to the active JWT slot so existing
                        // single-token code paths (`getJwt`) still work.
                        const preferredId = localStorage.getItem(LS.ACTIVE_ACCOUNT_ID);
                        const ids = Object.keys(accounts);
                        const pickId =
                            preferredId &&
                            accounts[preferredId] &&
                            !_isExpired(accounts[preferredId].exp)
                                ? preferredId
                                : ids.find((id) => !_isExpired(accounts[id].exp));
                        if (pickId) {
                            const acc = accounts[pickId];
                            localStorage.setItem(LS.JWT, acc.token);
                            localStorage.setItem(LS.JWT_EXP, String(acc.exp));
                            localStorage.setItem(LS.ACTIVE_ACCOUNT_ID, pickId);
                        }
                        result.accounts = ids.length;
                    }
                }

                if (ptRes && !ptRes._err && ptRes.ok) {
                    const data = await ptRes.json().catch(() => null);
                    if (data?.success && data.tokens && typeof data.tokens === 'object') {
                        const local = (() => {
                            try {
                                return JSON.parse(localStorage.getItem(LS.PAGE_TOKENS) || '{}');
                            } catch {
                                return {};
                            }
                        })();
                        // Smart merge: keep whichever entry has the newer `savedAt`.
                        for (const [pageId, remote] of Object.entries(data.tokens)) {
                            const cur = local[pageId];
                            if (
                                !cur ||
                                (Number(remote.savedAt) || 0) > (Number(cur.savedAt) || 0)
                            ) {
                                local[pageId] = remote;
                            }
                        }
                        localStorage.setItem(LS.PAGE_TOKENS, JSON.stringify(local));
                        result.pageTokens = Object.keys(data.tokens).length;
                    }
                }

                result.ok = true;
                NS._syncedThisSession = true;
                console.log(
                    `[Web2Chat] syncFromRenderDB: ${result.accounts} accounts, ${result.pageTokens} page tokens`
                );
                return result;
            } catch (e) {
                console.warn('[Web2Chat] syncFromRenderDB failed:', e.message);
                return { ok: false, reason: e.message };
            } finally {
                clearTimeout(timeout);
                NS._syncInFlight = null;
            }
        })();
        return NS._syncInFlight;
    }

    // =====================================================
    // Token management (write side)
    // =====================================================

    function decodeJwt(token) {
        try {
            const parts = String(token).split('.');
            if (parts.length !== 3) return null;
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            return payload;
        } catch {
            return null;
        }
    }

    function setJwt(token, expiry) {
        if (!token) {
            localStorage.removeItem(LS.JWT);
            localStorage.removeItem(LS.JWT_EXP);
            return { ok: true, cleared: true };
        }
        const decoded = decodeJwt(token);
        const exp = expiry || decoded?.exp || null;
        localStorage.setItem(LS.JWT, token);
        if (exp) localStorage.setItem(LS.JWT_EXP, String(exp));
        return { ok: true, decoded, expiry: exp };
    }

    function setPageAccessToken(pageId, token, meta) {
        if (!pageId || !token) return { ok: false, reason: 'missing_args' };
        const raw = localStorage.getItem(LS.PAGE_TOKENS);
        const map = raw ? JSON.parse(raw) : {};
        map[pageId] = {
            token,
            pageId,
            pageName: meta?.pageName,
            timestamp: Date.now(),
            ...meta,
        };
        localStorage.setItem(LS.PAGE_TOKENS, JSON.stringify(map));
        return { ok: true };
    }

    function getAllPageAccessTokens() {
        try {
            const raw = localStorage.getItem(LS.PAGE_TOKENS);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }

    function clearAllTokens() {
        localStorage.removeItem(LS.JWT);
        localStorage.removeItem(LS.JWT_EXP);
        localStorage.removeItem(LS.PAGE_TOKENS);
        return { ok: true };
    }

    // JWT của mọi account admin page (đa nhiệm boost — mỗi account 1 JWT làm
    // access_token). Dedupe theo JWT. Không account nào → fallback active JWT.
    function getPageAccountJwts(pageId) {
        const out = [];
        const seen = new Set();
        const accs = getAllAccounts();
        for (const [id, acc] of Object.entries(accs)) {
            if (!acc || !acc.token || _isExpired(acc.exp)) continue;
            if (!NS._pagesHas(acc.pages, pageId)) continue;
            if (seen.has(acc.token)) continue;
            seen.add(acc.token);
            out.push({ accountId: id, name: acc.name || id, jwt: acc.token });
        }
        if (!out.length) {
            const j = getJwt();
            if (j) out.push({ accountId: 'active', name: 'active', jwt: j });
        }
        return out;
    }

    // ── Expose on namespace ───────────────────────────────────────────
    NS.getJwt = getJwt;
    NS.getPageAccessToken = getPageAccessToken;
    NS.hasTokensFor = hasTokensFor;
    NS.getAllAccounts = getAllAccounts;
    NS.syncFromRenderDB = syncFromRenderDB;
    NS.decodeJwt = decodeJwt;
    NS.setJwt = setJwt;
    NS.setPageAccessToken = setPageAccessToken;
    NS.getAllPageAccessTokens = getAllPageAccessTokens;
    NS.clearAllTokens = clearAllTokens;
    NS.getPageAccountJwts = getPageAccountJwts;
})();
