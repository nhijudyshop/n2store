// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Chat client / SETTINGS (page settings cache, stale-while-revalidate)
// =====================================================
//
// Pancake stores tag/QR definitions per-page in
// `GET /api/v1/pages/{pageId}/settings`. They cache these in Redux
// (`pageSettingTags` + `lastTagsUpdateTimestamp`) in-memory only — lost
// on reload. We do stale-while-revalidate via **localStorage**:
//   • Read instant cached copy if < TTL (settings rarely change).
//   • Fire revalidate in background — UI updates when fresh data lands.
// Sit on top of an in-memory Map so multiple concurrent callers share
// the same single-flight fetch promise. State lives on
// `window.__Web2ChatNS`. Load AFTER web2-chat-utils.js + tokens.js.

(function () {
    'use strict';

    if (window.Web2Chat) return; // idempotent — facade already built
    const NS = window.__Web2ChatNS;
    if (!NS || !NS._tokensReady) {
        console.error('[Web2Chat] settings module loaded before utils/tokens');
        return;
    }
    if (NS._settingsReady) return;
    NS._settingsReady = true;

    const { WORKER_URL } = NS;
    const { _isInstagram, _fetchJson, getJwt } = NS;
    const _pageSettingsMem = NS._pageSettingsMem;
    const _pageSettingsInflight = NS._pageSettingsInflight;
    const _PAGE_SETTINGS_TTL_MS = NS._PAGE_SETTINGS_TTL_MS;
    const _LS_PAGE_SETTINGS = NS._LS_PAGE_SETTINGS;

    function _loadPageSettingsLs() {
        try {
            const raw = localStorage.getItem(_LS_PAGE_SETTINGS);
            if (!raw) return;
            const obj = JSON.parse(raw);
            if (!obj || typeof obj !== 'object') return;
            for (const [pageId, entry] of Object.entries(obj)) {
                if (entry && entry.settings && entry.fetchedAt) {
                    _pageSettingsMem.set(pageId, entry);
                }
            }
        } catch {
            /* ignore corrupt */
        }
    }
    _loadPageSettingsLs();

    function _persistPageSettingsLs() {
        try {
            const obj = {};
            for (const [k, v] of _pageSettingsMem.entries()) obj[k] = v;
            localStorage.setItem(_LS_PAGE_SETTINGS, JSON.stringify(obj));
        } catch (e) {
            // Quota — settings can be large (quick_replies up to 100KB+).
            // Drop oldest entry and retry once.
            if (_pageSettingsMem.size > 1) {
                let oldest = null;
                let oldestT = Infinity;
                for (const [k, v] of _pageSettingsMem.entries()) {
                    if (v.fetchedAt < oldestT) {
                        oldestT = v.fetchedAt;
                        oldest = k;
                    }
                }
                if (oldest) _pageSettingsMem.delete(oldest);
                try {
                    const obj = {};
                    for (const [k, v] of _pageSettingsMem.entries()) obj[k] = v;
                    localStorage.setItem(_LS_PAGE_SETTINGS, JSON.stringify(obj));
                } catch {
                    /* still over quota — give up persisting */
                }
            }
        }
    }

    async function fetchPageSettings(pageId, opts = {}) {
        if (!pageId) return { ok: false, reason: 'missing_pageId' };
        if (_isInstagram(pageId)) return { ok: false, reason: 'instagram_unsupported' };
        const cached = _pageSettingsMem.get(pageId);
        const fresh = cached && Date.now() - cached.fetchedAt < _PAGE_SETTINGS_TTL_MS;
        if (!opts.force && fresh) {
            return { ok: true, settings: cached.settings, cached: true };
        }
        // Single-flight: dedupe concurrent calls for the same page.
        if (_pageSettingsInflight.has(pageId)) {
            return _pageSettingsInflight.get(pageId);
        }
        const jwt = getJwt();
        if (!jwt) {
            // No JWT but we have a stale cache → return it; the caller can
            // still render last-known tag names/colors.
            if (cached) return { ok: true, settings: cached.settings, cached: true, stale: true };
            return { ok: false, reason: 'no_jwt' };
        }
        const url = `${WORKER_URL}/api/pancake/pages/${encodeURIComponent(pageId)}/settings?access_token=${encodeURIComponent(jwt)}`;
        const p = (async () => {
            try {
                const data = await _fetchJson(url, { method: 'GET' });
                if (!data?.success || !data.settings) {
                    return {
                        ok: cached ? true : false,
                        settings: cached?.settings,
                        cached: !!cached,
                        stale: !!cached,
                        reason: data?.message || 'no_settings',
                    };
                }
                const entry = { fetchedAt: Date.now(), settings: data.settings };
                _pageSettingsMem.set(pageId, entry);
                _persistPageSettingsLs();
                return { ok: true, settings: data.settings };
            } catch (e) {
                console.warn('[Web2Chat] fetchPageSettings failed:', e.message);
                if (cached) {
                    return {
                        ok: true,
                        settings: cached.settings,
                        cached: true,
                        stale: true,
                        reason: e.message,
                    };
                }
                return { ok: false, reason: e.message };
            } finally {
                _pageSettingsInflight.delete(pageId);
            }
        })();
        _pageSettingsInflight.set(pageId, p);
        return p;
    }

    // ── Expose on namespace ───────────────────────────────────────────
    NS.fetchPageSettings = fetchPageSettings;
})();
