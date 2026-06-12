// #Note: WEB2.0 shared auth helper.
// Token storage + verify + page guard.
//
// Storage: localStorage 'web2_auth' = { token, expiresAt, user }
//
// Public API:
//   Web2Auth.getStored()           → { token, user, expiresAt } | null
//   Web2Auth.storeLogin(payload)   → write to localStorage
//   Web2Auth.clear()               → wipe
//   Web2Auth.verify()              → Promise<user|null> (calls /me)
//   Web2Auth.can(slug, action)     → boolean (uses cached user.permissions)
//   Web2Auth.requireAuth({redirectUrl, requireSlug, requireAction})
//     → Promise<user|null>; redirect to /web2/login if not authenticated
//   Web2Auth.logout({redirect})    → invalidate server-side + clear + redirect

(function (global) {
    'use strict';

    const STORAGE_KEY = 'web2_auth';
    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API = `${WORKER}/api/web2-users`;

    function getStored() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed?.token) return null;
            if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
                localStorage.removeItem(STORAGE_KEY);
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    }

    function storeLogin(payload) {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    token: payload.token,
                    expiresAt: payload.expiresAt || null,
                    user: payload.user || null,
                })
            );
        } catch (e) {
            console.warn('[Web2Auth] store fail:', e.message);
        }
    }

    function clear() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
    }

    async function verify() {
        const stored = getStored();
        if (!stored?.token) return null;
        try {
            const r = await fetch(`${API}/me?token=${encodeURIComponent(stored.token)}`);
            if (!r.ok) {
                clear();
                return null;
            }
            const data = await r.json();
            if (!data?.user) {
                clear();
                return null;
            }
            // Refresh cached user (in case permissions changed)
            storeLogin({
                token: stored.token,
                expiresAt: stored.expiresAt,
                user: data.user,
            });
            return data.user;
        } catch (e) {
            console.warn('[Web2Auth] verify fail:', e.message);
            return stored.user || null;
        }
    }

    function can(slug, action) {
        const stored = getStored();
        const perms = stored?.user?.permissions || {};
        const acts = perms[slug] || [];
        return Array.isArray(acts) && acts.includes(action);
    }

    function loginUrl() {
        // Compute relative path to /web2/login/index.html from current page.
        // Strategy: replace the segment starting with /web2/ or the page's own
        // location with /web2/login/.
        const here = location.pathname;
        // Common cases:
        //   /n2store/web2/<sub>/index.html → /n2store/web2/login/index.html
        //   /web2/<sub>/index.html → /web2/login/index.html
        //   /web2-pancake/index.html → ../web2/login/index.html
        //   /so-order/index.html → ../web2/login/index.html
        const m = here.match(/^(.*\/)web2\//);
        if (m) return m[1] + 'web2/login/index.html';
        // Page lives at root sibling (web2-pancake/, so-order/, native-orders/)
        const parts = here.split('/').filter(Boolean);
        // Pop the file part
        if (parts.length && parts[parts.length - 1].endsWith('.html')) parts.pop();
        // Replace last folder segment with web2/login
        if (parts.length) parts.pop();
        const prefix = parts.length ? '/' + parts.join('/') : '';
        return `${prefix}/web2/login/index.html`;
    }

    async function requireAuth(opts) {
        opts = opts || {};
        const redirectUrl = opts.redirectUrl || loginUrl();
        const user = await verify();
        if (!user) {
            const next = location.pathname + location.search;
            location.href = `${redirectUrl}?next=${encodeURIComponent(next)}`;
            return null;
        }
        if (opts.requireSlug && opts.requireAction) {
            if (!can(opts.requireSlug, opts.requireAction)) {
                console.warn(
                    `[Web2Auth] User ${user.username} lacks ${opts.requireSlug}.${opts.requireAction}`
                );
                return user; // Caller can decide to show 403 UI
            }
        }
        return user;
    }

    async function logout(opts) {
        const stored = getStored();
        if (stored?.token) {
            try {
                await fetch(`${API}/logout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: stored.token }),
                });
            } catch {
                /* ignore */
            }
        }
        clear();
        if (opts?.redirect !== false) {
            location.href = loginUrl();
        }
    }

    // ENFORCE-PREP (2026-06-12): helper chuẩn gắn x-web2-token cho fetch —
    // mọi client gọi route soft-gated dùng cái này (hoặc đọc localStorage
    // 'web2_auth' trực tiếp nếu page không load Web2Auth). Không token → {}.
    function authHeaders(extra) {
        const t = getStored()?.token;
        const h = { ...(extra || {}) };
        if (t) h['x-web2-token'] = t;
        return h;
    }

    global.Web2Auth = {
        getStored,
        storeLogin,
        authHeaders,
        clear,
        verify,
        can,
        requireAuth,
        logout,
        loginUrl,
        STORAGE_KEY,
        API,
    };
})(window);
