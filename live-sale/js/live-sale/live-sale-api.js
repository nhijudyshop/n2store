// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * LiveSale API — fetch wrapper for Render /api/v2/live-sale/* endpoints.
 *
 * Phase 1: ONLY stubs. Methods return empty/default data so the UI can load
 * without the backend being ready. Real implementation wired up in Phase 2.
 */

const LS_BASE = (() => {
    // Prefer api-config.js values if present.
    try {
        if (window.API_CONFIG?.RENDER_BASE) return window.API_CONFIG.RENDER_BASE;
        if (window.API_CONFIG?.WORKER_URL) return window.API_CONFIG.WORKER_URL;
    } catch { /* noop */ }
    return 'https://chatomni-proxy.nhijudyshop.workers.dev';
})();

async function lsFetch(path, { method = 'GET', body, signal } = {}) {
    const url = path.startsWith('http') ? path : `${LS_BASE}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    const auth = window.LiveSaleTokenManager?.getAuthHeader();
    if (auth) headers['Authorization'] = auth;

    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`LiveSale API ${res.status}: ${text.slice(0, 200)}`);
    }

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
}

const LiveSaleApi = {
    /**
     * List FB pages available to the current user.
     * Phase 1 stub: returns empty list.
     */
    async loadPages() {
        try {
            const data = await lsFetch('/api/v2/live-sale/pages');
            const pages = data?.data?.pages || data?.pages || [];
            const state = window.LiveSaleState;
            if (state) {
                state.allPages = pages;
            }
            return pages;
        } catch (err) {
            console.warn('[LiveSale API] loadPages stub returning empty:', err.message);
            return [];
        }
    },

    /**
     * Legacy alias used by init: same behavior as loadPages.
     */
    async loadCRMTeams() {
        const pages = await this.loadPages();
        const state = window.LiveSaleState;
        // Build a single synthetic CRM team so the selector logic can reuse
        // the existing dropdown structure until we have real teams.
        if (state) {
            state.crmTeams = [
                {
                    Id: 0,
                    Name: 'N2Store',
                    Childs: pages.map(p => ({
                        Id: p.id,
                        Facebook_PageId: p.fb_page_id,
                        Name: p.name,
                    })),
                },
            ];
        }
        return state?.crmTeams || [];
    },

    /**
     * Load live video sessions for a given FB page.
     * Phase 1 stub: returns empty list.
     */
    async loadLiveCampaigns(fbPageId) {
        try {
            const data = await lsFetch(`/api/v2/live-sale/live-videos?page_id=${encodeURIComponent(fbPageId)}`);
            const list = data?.data?.videos || data?.videos || [];
            const state = window.LiveSaleState;
            if (state) {
                state.liveSessions = list;
                // Back-compat: keep a `liveCampaigns` alias shaped like TPOS data.
                state.liveCampaigns = list.map(v => ({
                    Id: v.id || v.fb_live_id || v.fb_post_id,
                    Name: v.title || `Live ${v.fb_post_id}`,
                    Facebook_UserId: fbPageId,
                    Facebook_LiveId: v.fb_post_id || v.fb_live_id,
                    Facebook_UserName: v.page_name || '',
                }));
            }
            return list;
        } catch (err) {
            console.warn('[LiveSale API] loadLiveCampaigns stub returning empty:', err.message);
            const state = window.LiveSaleState;
            if (state) {
                state.liveSessions = [];
                state.liveCampaigns = [];
            }
            return [];
        }
    },

    async loadLiveCampaignsFromAllPages() {
        const state = window.LiveSaleState;
        if (!state) return [];
        const results = await Promise.all(
            (state.allPages || []).map(p => this.loadLiveCampaigns(p.fb_page_id).catch(() => []))
        );
        const flat = results.flat();
        state.liveCampaigns = flat;
        return flat;
    },

    /**
     * Load FB comments for a given (pageId, postId).
     * Phase 1 falls through to the existing CF Worker /facebook/* endpoint
     * that tpos-pancake already uses, so we don't need new server code yet.
     */
    async loadComments(fbPageId, fbPostId, afterCursor) {
        try {
            const base = window.API_CONFIG?.WORKER_URL || LS_BASE;
            const qs = new URLSearchParams({
                pageid: fbPageId,
                postId: fbPostId,
                limit: '50',
            });
            if (afterCursor) qs.set('after', afterCursor);
            const res = await fetch(`${base}/facebook/comments?${qs.toString()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return {
                comments: data.data || data.comments || [],
                nextPageUrl: data.paging?.next || null,
            };
        } catch (err) {
            console.warn('[LiveSale API] loadComments stub:', err.message);
            return { comments: [], nextPageUrl: null };
        }
    },

    /**
     * Comment→order badge mapping (SessionIndex).
     * Phase 1 stub returns empty Map.
     */
    async loadSessionIndex(fbPostId) {
        try {
            const data = await lsFetch(`/api/v2/live-sale/comment-orders?post_id=${encodeURIComponent(fbPostId)}`);
            const obj = data?.data || data || {};
            const map = new Map();
            for (const [k, v] of Object.entries(obj)) {
                map.set(k, v);
            }
            return map;
        } catch (err) {
            console.warn('[LiveSale API] loadSessionIndex stub:', err.message);
            return new Map();
        }
    },

    /**
     * Fetch partner/customer info for a given page + fb user id.
     * Phase 1 returns null — the customer-hub endpoints will replace this
     * in Phase 2 (/api/v2/customers/search?fb_user_id=...).
     */
    async getPartnerInfo(_crmTeamId, fbUserId) {
        try {
            const data = await lsFetch(`/api/v2/live-sale/partners/${encodeURIComponent(fbUserId)}`);
            return data?.data || data || null;
        } catch {
            return null;
        }
    },

    /**
     * Hide/show a FB comment — reuse existing CF Worker proxy for now.
     */
    async hideComment(fbPageId, commentId, hide) {
        try {
            const base = window.API_CONFIG?.WORKER_URL || LS_BASE;
            const res = await fetch(`${base}/api/rest/v2.0/facebook-graph/comment/hide`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageid: fbPageId, commentId, is_hidden: !!hide }),
            });
            return res.ok;
        } catch {
            return false;
        }
    },

    /**
     * Create a draft order from a comment.
     * Phase 1 stub — fully implemented in Phase 2.
     */
    async createOrder(payload) {
        try {
            const data = await lsFetch('/api/v2/live-sale/orders', { method: 'POST', body: payload });
            return data?.data || data;
        } catch (err) {
            console.warn('[LiveSale API] createOrder stub:', err.message);
            return null;
        }
    },
};

if (typeof window !== 'undefined') {
    window.LiveSaleApi = LiveSaleApi;
    // Compat alias for existing wiring.
    window.TposApi = window.TposApi || LiveSaleApi;
}
