// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Chat client / UTILS (consts + shared helpers + state)
// =====================================================
//
// Foundation module for the Web2Chat module set. Holds shared
// constants, the cross-module private state containers (token /
// settings / posts / conv / tag caches), and the low-level
// helpers (_isExpired, _authHeaders, _isInstagram, _fetchJson,
// _pagesHas). Everything is exposed on `window.__Web2ChatNS` so the
// sibling modules (tokens, settings, api, live, tags) and the
// facade (web2-chat-client.js) can share ONE source of truth.
//
// Load FIRST (before tokens/settings/api/live/tags/client). The
// facade re-exports the public surface as `window.Web2Chat`.

(function () {
    'use strict';

    if (window.Web2Chat) return; // idempotent — facade already built
    const NS = (window.__Web2ChatNS = window.__Web2ChatNS || {});
    if (NS._utilsReady) return; // idempotent for this module
    NS._utilsReady = true;

    const WORKER_URL =
        window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // Same localStorage keys web 1.0's PancakeTokenManager uses, so accounts
    // saved by either app are immediately visible to the other.
    const LS = {
        JWT: 'pancake_jwt_token',
        JWT_EXP: 'pancake_jwt_token_expiry',
        PAGE_TOKENS: 'pancake_page_access_tokens',
        ALL_ACCOUNTS: 'pancake_all_accounts',
        ACTIVE_ACCOUNT_ID: 'web2_pancake_active_account_id',
    };

    function _isExpired(epochSeconds) {
        if (!epochSeconds) return true;
        return Date.now() / 1000 >= Number(epochSeconds) - 30; // 30s safety
    }

    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho route soft-gated
    // (WEB2_AUTH_ENFORCE=1) — GET /api/pancake-accounts strip token nếu unauth.
    // Page load web2-auth.js → Web2Auth.authHeaders; không load → đọc thẳng
    // localStorage 'web2_auth' (chung origin).
    function _authHeaders(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        const h = { ...(extra || {}) };
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {
            /* ignore */
        }
        return h;
    }

    function _isInstagram(pageId) {
        return typeof pageId === 'string' && pageId.startsWith('igo_');
    }

    async function _fetchJson(url, init) {
        const r = await fetch(url, init);
        const text = await r.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            /* not json */
        }
        if (!r.ok) {
            const err = new Error(`HTTP ${r.status} ${r.statusText}: ${text.slice(0, 200)}`);
            err.status = r.status;
            err.body = data;
            throw err;
        }
        return data;
    }

    // acc.pages = mảng OBJECT [{id,name}] (KHÔNG phải id string) → check theo p.id.
    function _pagesHas(pages, pageId) {
        if (!Array.isArray(pages)) return false;
        const pid = String(pageId);
        return pages.some((p) => String(p && typeof p === 'object' ? (p.id ?? p) : p) === pid);
    }

    // ── Shared constants ──────────────────────────────────────────────
    NS.WORKER_URL = WORKER_URL;
    NS.LS = LS;

    // Short-lived in-memory cache for fetchConversations: the (pageId, fbId)
    // pair returns the same INBOX conversation across the session, so re-
    // opening the chat modal for the same customer goes from ~150ms to ~0.
    // 5 min TTL is long enough for typical inspection flows but short enough
    // to refresh if the user keeps the page open for an hour.
    NS._convCache = new Map();
    NS.CONV_CACHE_TTL = 5 * 60 * 1000;

    // Danh sách bài LIVESTREAM của 1 page — cache 60s/page.
    NS._livePostsCache = new Map(); // pageId -> { at, posts }
    NS.LIVE_POSTS_TTL = 60 * 1000;

    // TAG hội thoại Pancake — pageId -> Map(idStr -> {id,text,color,lighten}).
    NS._tagDefs = new Map();

    // Page settings cache (tags, quick replies, ...).
    NS._pageSettingsMem = new Map(); // pageId → { fetchedAt, settings }
    NS._pageSettingsInflight = new Map(); // pageId → Promise
    NS._PAGE_SETTINGS_TTL_MS = 30 * 60 * 1000; // 30 min — tags change rarely
    NS._LS_PAGE_SETTINGS = 'web2_pancake_page_settings_v1';

    // syncFromRenderDB single-flight + once-per-session flags (reassigned →
    // stored as NS properties so sibling modules see updates).
    NS._syncedThisSession = false;
    NS._syncInFlight = null;

    // Enrich kho KH: dedup fb_id per-session.
    NS._enrichedFbIds = new Set();

    // ── Shared helpers ────────────────────────────────────────────────
    NS._isExpired = _isExpired;
    NS._authHeaders = _authHeaders;
    NS._isInstagram = _isInstagram;
    NS._fetchJson = _fetchJson;
    NS._pagesHas = _pagesHas;
})();
